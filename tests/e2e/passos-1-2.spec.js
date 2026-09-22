const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

async function abrirCatalogo(page, comFornecedor) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    if (comFornecedor) {
        await page.evaluate(() => {
            localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
            localStorage.removeItem('sc_imp_perfis');
        });
        await page.reload();
    }
}

test('passo 1: abre o modal, le o arquivo e exige fornecedor', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirCatalogo(page, true);
    await page.click('text=📥 Importar tabela');

    await expect(page.locator('.modal-overlay #imp-corpo')).toBeVisible();
    await expect(page.locator('#imp-file')).toBeAttached();
    await expect(page.locator('#imp-fornecedor')).toBeVisible();
    await expect(page.locator('#imp-markup')).toBeVisible();

    // tentar continuar sem arquivo deve barrar
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#sc-modal-msg')).toContainText(/arquivo/i);
    await page.click('#sc-modal-ok');

    // sobe a planilha real
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');

    // sem fornecedor ainda barra
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#sc-modal-msg')).toContainText(/fornecedor/i);
    await page.click('#sc-modal-ok');

    expect(erros, erros.join('\n')).toEqual([]);
});

test('passo 2: lista as 22 abas com o tipo pre-sugerido', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirCatalogo(page, true);
    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');

    // chegou no passo 2
    await expect(page.locator('#imp-corpo')).toContainText('Capa');
    await expect(page.locator('#imp-corpo')).toContainText('Book 10');

    const estado = await page.evaluate(() => ({
        abas: _impEstado.abas,
        qtdAbas: Object.keys(_impEstado.abas).length,
        fornecedor: _impEstado.fornecedor,
        markup: _impEstado.markupPadrao,
        temCores: typeof _impEstado.cores,
        passo: _impEstado.passo
    }));

    expect(estado.qtdAbas).toBe(22);
    expect(estado.passo).toBe(2);
    expect(estado.fornecedor).toEqual({ id: 7, nome: 'RC Tecidos' });
    expect(estado.markup).toBe(80);
    expect(estado.temCores).toBe('object'); // Task 17 depende disso existir

    // sugestao por conteudo
    expect(estado.abas['Capa']).toBe('ignorar');
    expect(estado.abas['Book 10']).toBe('tecido');
    expect(estado.abas['Book 16']).toBe('tecido');
    expect(estado.abas['Promocionais-Book 06']).toBe('tecido');
    expect(estado.abas['Trilhos']).toBe('material');
    expect(estado.abas['Cor Metal']).toBe('material');

    // a contagem de itens aparece na linha da aba
    const linhaBook10 = page.locator('tr', { hasText: 'Book 10' }).first();
    await expect(linhaBook10).toContainText('38');

    expect(erros, erros.join('\n')).toEqual([]);
});

test('passo 2: trocar o tipo de uma aba usa indice e nao quebra com nome estranho', async ({ page }) => {
    await abrirCatalogo(page, true);
    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');

    // troca via a funcao, por indice
    const r = await page.evaluate(() => {
        const antes = _impEstado.abas['Book 10'];
        const i = _impEstado.planilha.ordem.indexOf('Book 10');
        _impTrocarTipoAba(i, 'material');
        return { antes, depois: _impEstado.abas['Book 10'], indice: i };
    });
    expect(r.antes).toBe('tecido');
    expect(r.depois).toBe('material');

    // e pela interface, no select da linha
    const select = page.locator('tr', { hasText: 'Cor Metal' }).first().locator('select');
    await select.selectOption('ignorar');
    const depois = await page.evaluate(() => _impEstado.abas['Cor Metal']);
    expect(depois).toBe('ignorar');
});

test('passo 2: barra quando todas as abas estao como ignorar', async ({ page }) => {
    await abrirCatalogo(page, true);
    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');

    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#sc-modal-msg')).toContainText(/aba/i);
});

test('cadastro de fornecedor embutido nao recarrega nem fecha o assistente', async ({ page }) => {
    await abrirCatalogo(page, false);
    await page.evaluate(() => { localStorage.setItem('sc_forn', JSON.stringify([])); });
    await page.reload();

    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');

    await page.fill('#imp-novo-fornecedor', 'Fornecedor Novo Teste');
    await page.click('#imp-corpo button:has-text("Cadastrar")');

    // o modal continua aberto e o arquivo continua lido
    await expect(page.locator('#imp-corpo')).toBeVisible();
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');

    const r = await page.evaluate(() => ({
        gravado: JSON.parse(localStorage.getItem('sc_forn') || '[]').map(f => f.nome),
        selecionado: document.getElementById('imp-fornecedor').value,
        arquivoAindaLido: !!_impEstado.planilha
    }));
    expect(r.gravado).toContain('Fornecedor Novo Teste');
    expect(r.arquivoAindaLido).toBe(true);
    expect(r.selecionado).not.toBe('');
});
