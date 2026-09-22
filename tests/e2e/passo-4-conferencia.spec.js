const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// Vai ate o passo 4 deixando ativas apenas as abas pedidas.
async function ateOPasso4(page, abasAtivas, markup, tipo) {
    tipo = tipo || 'tecido';
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify([]));
        localStorage.removeItem('sc_imp_perfis');
        localStorage.removeItem('sc_imp_snap');
    });
    await page.reload();

    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', String(markup));
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Capa');

    await page.evaluate(([ativas, t]) => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        ativas.forEach(a => { _impEstado.abas[a] = t; });
        _impRenderPasso(2);
    }, [abasAtivas, tipo]);

    await page.click('#imp-corpo button:has-text("Continuar")'); // -> passo 3
    await page.click('#imp-corpo button:has-text("Continuar")'); // -> passo 4
    await page.waitForFunction(() => _impEstado.passo === 4);
}

test('passo 4 agrupa por situacao e mostra os numeros', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await ateOPasso4(page, ['Book 10'], 80);

    await expect(page.locator('#imp-corpo')).toContainText('Novos');
    await expect(page.locator('#imp-corpo')).toContainText('Gravar');

    const g = await page.evaluate(() => ({
        novos: _impEstado.grupos.novos.length,
        atualizados: _impEstado.grupos.atualizados.length,
        conflitos: _impEstado.grupos.conflitos.length,
        problemas: _impEstado.grupos.problemas.length,
        markupPrimeiro: _impEstado.grupos.novos[0].markup,
        marcadoPrimeiro: _impEstado.grupos.novos[0].marcado
    }));
    expect(g.novos).toBe(38);
    expect(g.atualizados).toBe(0);
    expect(g.conflitos).toBe(0);
    expect(g.markupPrimeiro).toBe(80);
    expect(g.marcadoPrimeiro).toBe(true);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('grava no catalogo com o preco de venda derivado do markup', async ({ page }) => {
    await ateOPasso4(page, ['Book 10'], 80);

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');                 // confirma
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);

    const r = await page.evaluate(() => {
        const cat = JSON.parse(localStorage.getItem('sc_cat'));
        return {
            qtd: cat.length,
            todosComFornecedor: cat.every(t => t.fornecedor_id === 7),
            todosComRef: cat.every(t => t.referencia && !String(t.referencia).includes('*')),
            precoOk: cat.every(t => Math.abs(t.preco - Math.round(t.preco_custo * 1.8 * 100) / 100) < 0.01),
            estoqueIntacto: (JSON.parse(localStorage.getItem('sc_est') || '[]')).length,
            temSnapshot: !!localStorage.getItem('sc_imp_snap'),
            amostra: cat[0]
        };
    });

    expect(r.qtd).toBe(38);
    expect(r.todosComFornecedor).toBe(true);
    expect(r.todosComRef).toBe(true);
    expect(r.precoOk, 'preco de venda deveria ser custo x 1.8').toBe(true);
    expect(r.estoqueIntacto, 'o importador nao pode mexer no estoque').toBe(0);
    expect(r.temSnapshot).toBe(true);
    expect(r.amostra.largura_rolo).toBeGreaterThan(0);
    expect(r.amostra.min_estoque).toBe(0);
});

test('desfazer restaura o catalogo anterior', async ({ page }) => {
    await ateOPasso4(page, ['Book 10'], 80);
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);

    // o botao de desfazer deve estar visivel agora
    const botao = page.locator('#btn-desfazer-import');
    await expect(botao).toBeVisible();

    await botao.click();
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length === 0);

    const r = await page.evaluate(() => ({
        cat: JSON.parse(localStorage.getItem('sc_cat') || '[]').length,
        snapshot: localStorage.getItem('sc_imp_snap')
    }));
    expect(r.cat).toBe(0);
    expect(r.snapshot, 'o snapshot deve ser limpo apos desfazer').toBeNull();
});

test('codigos duplicados no lote bloqueiam a gravacao', async ({ page }) => {
    // Wave-Square-Retangular repete VUD01/VUD02 varias vezes na propria aba
    // (variantes de cor compartilhando codigo).
    await ateOPasso4(page, ['Wave-Square-Retangular'], 80, 'material');

    await page.click('#imp-corpo button:has-text("Gravar")');

    const msg = page.locator('#sc-modal-msg');
    await expect(msg).toBeVisible();
    const texto = await msg.textContent();
    expect(texto).toMatch(/c[óo]digo/i);
    await page.click('#sc-modal-ok');

    const gravou = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length);
    expect(gravou, 'nada pode ser gravado quando ha codigo duplicado').toBe(0);
});

test('editar o custo na conferencia recalcula a venda', async ({ page }) => {
    await ateOPasso4(page, ['Book 10'], 100);

    const r = await page.evaluate(() => {
        const antes = _impEstado.grupos.novos[0].item.preco_custo;
        _impEditarCampo('novos', 0, 'preco_custo', '50');
        const item = _impEstado.grupos.novos[0].item;
        return { antes, depois: item.preco_custo, markup: _impEstado.grupos.novos[0].markup };
    });
    expect(r.depois).toBe(50);
    expect(r.markup).toBe(100);

    // a venda exibida deve ser 100,00 (50 x 2)
    await expect(page.locator('#imp-corpo')).toContainText('100,00');
});

test('desmarcar uma linha tira ela da gravacao', async ({ page }) => {
    await ateOPasso4(page, ['Book 10'], 80);

    await page.evaluate(() => { _impAlternarMarcado('novos', 0); });
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);

    const qtd = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat')).length);
    expect(qtd, 'uma linha desmarcada nao deve entrar').toBe(37);
});
