const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// O defeito C2: desfazer restaurava db.materiais inteiro, devolvendo o saldo
// de estoque ao estado do dia da importacao. O importador nunca pode mexer em
// estoque, nem ao desfazer.
test('desfazer nao pode alterar o estoque de um material vivo', async ({ page }) => {
    test.setTimeout(120000);
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');

    // um material ja cadastrado, com saldo, do mesmo fornecedor
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify([{
            id: 500, referencia: 'TR001', nome: 'Trilho Antigo', unidade: 'cx',
            preco_custo: 10, preco: 18, estoque_atual: 137, min_estoque: 5,
            fornecedor_id: 7, fornecedor_nome: 'RC Tecidos'
        }]));
        localStorage.removeItem('sc_imp_perfis');
        localStorage.removeItem('sc_imp_snap');
    });
    await page.reload();

    // importa uma aba de tecidos (nao mexe nesse material)
    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Book 10'] = 'tecido';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);

    // depois da importacao, o negocio segue: vende e recebe material
    await page.evaluate(() => {
        const mats = JSON.parse(localStorage.getItem('sc_mat'));
        mats.find(m => m.id === 500).estoque_atual = 42;   // tres semanas de movimento
        localStorage.setItem('sc_mat', JSON.stringify(mats));
    });
    await page.reload();

    const antes = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('sc_mat')).find(m => m.id === 500).estoque_atual);
    expect(antes).toBe(42);

    // agora desfaz a importacao
    await page.click('#btn-desfazer-import');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length === 0);

    const depois = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('sc_mat')).find(x => x.id === 500);
        return { estoque: m.estoque_atual, unidade: m.unidade, min: m.min_estoque, nome: m.nome };
    });

    expect(depois.estoque, 'desfazer NAO pode devolver o estoque ao estado da importacao').toBe(42);
    expect(depois.unidade).toBe('cx');
    expect(depois.min).toBe(5);
    expect(depois.nome).toBe('Trilho Antigo');

    // e os tecidos importados sairam
    const cat = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length);
    expect(cat).toBe(0);
});
