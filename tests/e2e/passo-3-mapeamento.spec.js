const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// Chega ate o passo 2 com a planilha real e o fornecedor 7 escolhido.
async function ateOPasso2(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.removeItem('sc_imp_perfis');
    });
    await page.reload();
    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Capa');
}

// Marca como ignorar toda aba sem cabecalho detectado (saida prevista na Fase 1).
async function ignorarSemCabecalho(page) {
    return page.evaluate(() => {
        const C = window.ImportadorCore;
        const semCab = [];
        _impEstado.planilha.ordem.forEach(aba => {
            if (C.detectarCabecalho(_impEstado.planilha.abas[aba]).indice === -1) {
                _impEstado.abas[aba] = 'ignorar';
                semCab.push(aba);
            }
        });
        _impRenderPasso(2);
        return semCab;
    });
}

test('as 7 abas de tecido viram UM layout so', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await ateOPasso2(page);
    const ignoradas = await ignorarSemCabecalho(page);
    expect(ignoradas.length).toBe(6); // Capa + as 5 "Montado"/Motorizado

    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Tecidos');

    const r = await page.evaluate(() => {
        const layouts = _impLayoutsDistintos();
        return layouts.map(l => ({ tipo: l.tipo, abas: l.abas, qtd: l.abas.length }));
    });

    const doTecido = r.filter(l => l.tipo === 'tecido');
    expect(doTecido.length, 'as abas de tecido deveriam formar um layout unico').toBe(1);
    expect(doTecido[0].qtd).toBe(7);
    expect(doTecido[0].abas).toContain('Book 10');
    expect(doTecido[0].abas).toContain('Promocionais-Book 06');

    expect(erros, erros.join('\n')).toEqual([]);
});

test('o mapeamento sugerido do tecido aponta CORTE, nao PECA', async ({ page }) => {
    await ateOPasso2(page);
    await ignorarSemCabecalho(page);
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Tecidos');

    const r = await page.evaluate(() => {
        const layouts = _impLayoutsDistintos();
        const tec = layouts.find(l => l.tipo === 'tecido');
        return { mapa: _impMapaDoLayout(tec), colunas: tec.colunas };
    });
    expect(r.mapa).toEqual({ codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 });
    expect(String(r.colunas[4])).toMatch(/CORTE/i);
    expect(String(r.colunas[5])).toMatch(/PE[CÇ]A/i);
});

test('trocar o papel de uma coluna limpa o papel anterior', async ({ page }) => {
    await ateOPasso2(page);
    await ignorarSemCabecalho(page);
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Tecidos');

    const r = await page.evaluate(() => {
        const layouts = _impLayoutsDistintos();
        const i = layouts.findIndex(l => l.tipo === 'tecido');
        const antes = _impMapaDoLayout(layouts[i]);
        // move o papel de preco da coluna 4 (CORTE) para a 5 (PECA)
        _impTrocarPapel(i, 5, 'preco');
        const depois = _impMapaDoLayout(_impLayoutsDistintos()[i]);
        return { antes, depois };
    });
    expect(r.antes.preco).toBe(4);
    expect(r.depois.preco, 'o papel de preco deveria ter migrado para a coluna 5').toBe(5);
    expect(r.depois.codigo).toBe(0);
    expect(r.depois.nome).toBe(1);
});

test('o passo 3 barra layout sem codigo, nome ou preco e nomeia as abas', async ({ page }) => {
    await ateOPasso2(page);
    // Abas sem cabecalho ja chegam como "Ignorar" (elas produzem zero itens).
    // Aqui o usuario as tira do Ignorar de proposito, que e o unico jeito de
    // um layout nao-mapeavel chegar ao passo 3.
    const reativadas = await page.evaluate(() => {
        const C = window.ImportadorCore;
        const nomes = [];
        _impEstado.planilha.ordem.forEach(aba => {
            if (C.detectarCabecalho(_impEstado.planilha.abas[aba]).indice === -1 && aba !== 'Capa') {
                _impEstado.abas[aba] = 'material';
                nomes.push(aba);
            }
        });
        _impRenderPasso(2);
        return nomes;
    });
    expect(reativadas.length).toBeGreaterThan(0);

    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Continuar');

    await page.click('#imp-corpo button:has-text("Continuar")');
    const msg = page.locator('#sc-modal-msg');
    await expect(msg).toBeVisible();
    const texto = await msg.textContent();
    // precisa nomear ao menos uma aba problematica e sugerir Ignorar
    expect(texto).toMatch(/Ignorar/i);
    expect(texto).toMatch(/Motorizado|Montado/i);
});

// Na Fase 1 as abas de preco por cor nao tem coluna de preco mapeavel (as
// colunas sao nomes de cor), entao a saida prevista e marca-las Ignorar.
// A Task 17 e que traz o modo cor.
test('ignorando tambem as abas de preco por cor, o passo 3 deixa avancar', async ({ page }) => {
    await ateOPasso2(page);
    await ignorarSemCabecalho(page);
    await page.evaluate(() => {
        ['Cor Metal', 'Cor Madeira', 'Abraçadeira-Ponteira', 'SUPPVC-Retangular-Unic', 'Barras']
            .forEach(a => { if (_impEstado.abas[a] !== undefined) _impEstado.abas[a] = 'ignorar'; });
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Tecidos');

    await page.click('#imp-corpo button:has-text("Continuar")');

    const r = await page.evaluate(() => ({
        passo: _impEstado.passo,
        layoutsGravados: Object.keys(_impEstado.layouts).length
    }));
    expect(r.passo, 'deveria ter avancado para o passo 4').toBe(4);
    expect(r.layoutsGravados).toBeGreaterThan(0);
});
