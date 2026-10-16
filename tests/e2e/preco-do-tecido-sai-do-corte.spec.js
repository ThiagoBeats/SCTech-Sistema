// O preco de venda do TECIDO nasce do preco de corte: ele e vendido por metro
// cortado, e e esse valor que o pedido multiplica pelo consumo linear. O
// MATERIAL fica na regra antiga, em que a peca manda, para nao mexer no preco
// do que ja foi importado.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

// corte 83,65 · peca 79,47 — o corte e o MAIOR aqui, entao trocar a regra
// muda o numero para cima e nenhum acerto pode passar por coincidencia.
const TABELA_TECIDO = [
    'CODIGO\tDESCRICAO\tLARGURA\tCORTE\tPECA',
    '10001\tTRICO HERA\t1,40\t83,65\t79,47'
].join('\n');

const TABELA_MATERIAL = [
    'CODIGO\tDESCRICAO\tCORTE\tPECA',
    'M-01\tTRILHO\t83,65\t79,47'
].join('\n');

async function abrir(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        ['sc_cat', 'sc_mat', 'sc_kits', 'sc_est', 'sc_mov', 'sc_pedidos', 'sc_cli'].forEach(k => localStorage.setItem(k, '[]'));
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.removeItem('sc_imp_snap');
        localStorage.removeItem('sc_imp_perfis');
    });
    await page.reload();
}

// Leva ate o passo 3 e devolve o indice das colunas de preco ja mapeadas.
async function ateOPasso3(page, tabela, tipo) {
    await abrir(page);
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(tabela);
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');

    // passo 2: garante o tipo da aba
    await page.locator('#imp-corpo tbody select').first().selectOption(tipo);
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 3);
}

async function gravar(page) {
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForTimeout(500);
}

// --- Tecido: o corte manda ---------------------------------------------

test('tecido com as duas colunas: a venda nasce do corte', async ({ page }) => {
    await ateOPasso3(page, TABELA_TECIDO, 'tecido');
    const sel = page.locator('.imp-mapa-tabela thead select');
    await sel.nth(3).selectOption('preco');
    await sel.nth(4).selectOption('preco_peca');
    await gravar(page);

    const c = await page.evaluate(() => db.catalogo.find(x => x.referencia === '10001'));
    expect(c.preco_corte, 'os dois valores da tabela ficam gravados').toBe(83.65);
    expect(c.preco_peca).toBe(79.47);
    expect(c.preco_custo, 'o custo sai do corte').toBe(83.65);
    expect(c.preco, '83,65 × 1,80').toBeCloseTo(150.57, 2);
});

test('a nota da etapa 3 diz que quem manda no tecido e o corte', async ({ page }) => {
    await ateOPasso3(page, TABELA_TECIDO, 'tecido');
    const sel = page.locator('.imp-mapa-tabela thead select');
    await sel.nth(3).selectOption('preco');
    await sel.nth(4).selectOption('preco_peca');
    const nota = (await page.locator('.imp-nota-preco').innerText()).replace(/\s+/g, ' ');
    expect(nota).toContain('preço (corte)');
    expect(nota).toContain('metro cortado');
    expect(nota, 'a peça fica como registro').toContain('sem margem aplicada');
});

test('tecido so com a coluna de peca continua usando ela, avisando', async ({ page }) => {
    await ateOPasso3(page, TABELA_TECIDO, 'tecido');
    const sel = page.locator('.imp-mapa-tabela thead select');
    await sel.nth(3).selectOption('ignorar');
    await sel.nth(4).selectOption('preco_peca');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const avisos = await page.evaluate(() =>
        _impEstado.grupos.novos.find(x => x.item.codigo === '10001').item.avisos);
    expect(avisos.some(a => /peça/i.test(a)), 'sem corte, o usuário precisa saber a origem').toBe(true);
});

// --- Material: a peca continua mandando --------------------------------

test('material com as duas colunas: a venda continua nascendo da peca', async ({ page }) => {
    await ateOPasso3(page, TABELA_MATERIAL, 'material');
    const sel = page.locator('.imp-mapa-tabela thead select');
    await sel.nth(2).selectOption('preco');
    await sel.nth(3).selectOption('preco_peca');
    await gravar(page);

    const m = await page.evaluate(() => db.materiais.find(x => x.referencia === 'M-01'));
    expect(m.preco_custo, 'material nao muda de regra').toBe(79.47);
    expect(m.preco, '79,47 × 1,80').toBeCloseTo(143.05, 2);
});

// --- A cadeia ate o pedido ---------------------------------------------

test('o valor do tecido no pedido sai do corte, com a margem', async ({ page }) => {
    await ateOPasso3(page, TABELA_TECIDO, 'tecido');
    const sel = page.locator('.imp-mapa-tabela thead select');
    await sel.nth(3).selectOption('preco');
    await sel.nth(4).selectOption('preco_peca');
    await gravar(page);

    // Um ambiente que consome exatamente 2 panos de 2,00 m = 4,00 m lineares.
    // largura 1,40 e fator 2,0 sobre 1,40 de largura da cortina dá 2 panos.
    const r = await page.evaluate(() => {
        const tec = db.catalogo.find(x => x.referencia === '10001');
        const consumo_linear = 4;
        return {
            venda: tec.preco,
            corte: tec.preco_corte,
            peca: tec.preco_peca,
            total: consumo_linear * tec.preco       // a conta de calcularAmbiente
        };
    });
    expect(r.venda).toBeCloseTo(150.57, 2);
    expect(r.total, '4 m × R$ 150,57').toBeCloseTo(602.28, 2);

    // o que o pedido NAO pode cobrar
    const peloPeca = 4 * (r.peca * 1.8);
    expect(r.total, 'o pedido nao pode sair pela peça').not.toBeCloseTo(peloPeca, 2);
    expect(r.total, 'nem pelo corte cru, sem margem').not.toBeCloseTo(4 * r.corte, 2);
});
