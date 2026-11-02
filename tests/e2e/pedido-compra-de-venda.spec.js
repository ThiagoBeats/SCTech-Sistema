// Fornecedores > Pedidos de Compra > "Importar de pedido": para quem nao
// mantem estoque, gerar a compra com os itens de um pedido de cortina em
// aberto. Marca o que vai comprar; fornecedores diferentes => um pedido por
// fornecedor ou um generico com tudo. A compra guarda o pedido de origem.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const FORN = [{ id: 7, nome: 'RC Tecidos' }, { id: 8, nome: 'Alfa Trilhos' }];
const CAT = [{ id: 1, referencia: 'C-001', nome: 'TRICO HERA', preco_custo: 90, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos' }];
const MAT = [
    { id: 11, referencia: 'M-01', nome: 'TRILHO', unidade: 'm', preco: 50, preco_custo: 30, fornecedor_id: 8, estoque_atual: 2 },
    { id: 12, referencia: 'M-02', nome: 'PONTEIRA', unidade: 'un', preco: 9, preco_custo: 4, fornecedor_id: 8, estoque_infinito: true },
];
const KITS = [{ id: 21, tipo: 'pronto', referencia: 'K-01', nome: 'KIT VARAO', preco_custo: 120, itens: [] }];
const ped = (id, status, extra) => ({
    id, clienteId: 1, clienteNome: 'Pedro Alves', status, valor: 2000, vendedor_nome: 'Ana', data_entrega: '2026-12-10',
    ambientes: [
        { id: 1, amb: 'Sala',   tecidos: [{ tecidoId: 1, tecidoNome: 'TRICO HERA', consumo_linear: 6.5 }] },
        { id: 2, amb: 'Quarto', tecidos: [{ tecidoId: 1, tecidoNome: 'TRICO HERA', consumo_linear: 4.25 }] },
    ],
    itens: [
        { materialId: 11, nome: 'TRILHO', unidade: 'm', quantidade: 3 },
        { materialId: 12, nome: 'PONTEIRA', unidade: 'un', quantidade: 4 },
        { kitId: 21, nome: 'KIT VARAO', unidade: 'un', quantidade: 1 },
    ],
    ...(extra || {}),
});

async function abrir(page, extras) {
    await entrar(page, BASE, {
        sc_forn: FORN, sc_cat: CAT, sc_mat: MAT, sc_kits: KITS, sc_est: [], sc_pc: [],
        sc_ped: [ped(26001, 'Na Costura'), ped(26002, 'Instalado', { clienteNome: 'Já Instalado' }), ped(26003, 'Orçamento', { clienteNome: 'Bruna Costa', vendedor_nome: '', arq_nome: 'Studio M', data_entrega: null, itens: [], ambientes: [] })],
        ...(extras || {}),
    });
    await page.evaluate(() => { localStorage.removeItem('sc_pc_seq'); localStorage.removeItem('sc_pc_origem'); });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
    await page.click('#pc-btn-importar');
}
const linhas = page => page.locator('#pc-import-itens tbody tr');
// Pela celula do nome: o fornecedor "Alfa Trilhos" tambem casaria com TRILHO.
const linha = (page, nome) => linhas(page).filter({ has: page.locator('.pc-import-nome', { hasText: nome }) });
const escolher = (page, id) => page.click(`#pc-import-pedidos-tb tr[data-ped="${id}"]`);
const pedidosNaTabela = page => page.locator('#pc-import-pedidos-tb tr.pc-import-ped .pc-import-num').allInnerTexts();
const lerPC = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_pc')));

test('lista so pedidos em aberto (nao instalados), em tabela com colunas', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('.pc-import-pedidos thead th')).toHaveText(['Pedido', 'Cliente', 'Vendedor', 'Status', 'Entrega', 'Itens', 'Compras feitas']);
    expect(await pedidosNaTabela(page)).toEqual(['#26003', '#26001']);
    const linha = page.locator('#pc-import-pedidos-tb tr[data-ped="26001"] td');
    await expect(linha.nth(1)).toHaveText('Pedro Alves');
    await expect(linha.nth(2)).toHaveText('Ana');
    await expect(linha.nth(3)).toHaveText('Na Costura');
    await expect(linha.nth(4)).toHaveText('10/12/2026');
    await expect(linha.nth(5)).toHaveText('4');
});

test('filtros: busca por numero ou cliente, status, vendedor e entrega', async ({ page }) => {
    await abrir(page);
    await page.fill('#pc-import-busca', 'bruna');
    expect(await pedidosNaTabela(page)).toEqual(['#26003']);
    await page.fill('#pc-import-busca', '#26001');
    expect(await pedidosNaTabela(page)).toEqual(['#26001']);
    await page.fill('#pc-import-busca', 'xyz');
    await expect(page.locator('#pc-import-pedidos-tb')).toContainText('Nenhum pedido encontrado');
    await page.click('.pc-import-limpar');
    expect(await pedidosNaTabela(page)).toEqual(['#26003', '#26001']);

    // Status e vendedor so oferecem o que existe nos pedidos em aberto.
    expect(await page.locator('#pc-import-f-status option').allInnerTexts()).toEqual(['Todos', 'Orçamento', 'Na Costura']);
    await page.selectOption('#pc-import-f-status', 'Na Costura');
    expect(await pedidosNaTabela(page)).toEqual(['#26001']);
    await page.selectOption('#pc-import-f-status', '');
    await page.selectOption('#pc-import-f-vend', 'Studio M');
    expect(await pedidosNaTabela(page)).toEqual(['#26003']);
    await page.selectOption('#pc-import-f-vend', '');
    await page.fill('#pc-import-f-entrega', '2026-11-30');
    expect(await pedidosNaTabela(page), 'sem data de entrega fica fora').toEqual([]);
    await page.fill('#pc-import-f-entrega', '2026-12-31');
    expect(await pedidosNaTabela(page)).toEqual(['#26001']);
});

test('clicar no pedido mostra os itens; trocar pedido volta para a tabela', async ({ page }) => {
    await abrir(page);
    await page.fill('#pc-import-busca', 'pedro');
    await escolher(page, '26001');
    await expect(page.locator('#pc-import-etapa-pedido')).toBeHidden();
    await expect(page.locator('#pc-import-escolhido-info')).toContainText('Pedido #26001');
    await expect(page.locator('.pc-import-tabela:not(.pc-import-pedidos) thead th')).toHaveText(['', 'Código', 'Item', 'Tipo', 'Fornecedor', 'Quantidade', 'Em estoque']);
    await page.click('button:has-text("Trocar pedido")');
    await expect(page.locator('#pc-import-etapa-pedido')).toBeVisible();
    await expect(page.locator('#pc-import-busca'), 'o filtro continua').toHaveValue('pedro');
    await expect(page.locator('#pc-import-gerar')).toBeDisabled();
    // Teclado: Enter na linha tambem escolhe.
    await page.locator('#pc-import-pedidos-tb tr[data-ped="26001"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#pc-import-etapa-itens')).toBeVisible();
});

test('mostra os itens do pedido somados, com fornecedor e estoque', async ({ page }) => {
    await abrir(page);
    await escolher(page, '26001');
    await expect(linhas(page)).toHaveCount(4);
    const tecido = linha(page, 'TRICO HERA');
    await expect(tecido.locator('input[type=number]'), 'os dois ambientes somados').toHaveValue('10.75');
    await expect(tecido).toContainText('RC Tecidos');
    await expect(linha(page, 'PONTEIRA').locator('.pc-import-est')).toHaveText('∞');
    await expect(linha(page, 'TRILHO').locator('.pc-import-est')).toHaveText('2.00 m');
    await expect(linha(page, 'KIT VARAO')).toContainText('Sem fornecedor');
    await expect(page.locator('.pc-import-chk:checked')).toHaveCount(4);
    await expect(page.locator('#pc-import-resumo')).toHaveText('4 item(ns) marcado(s) · 3 fornecedor(es)');
});

test('pedido sem itens avisa e nao deixa gerar', async ({ page }) => {
    await abrir(page);
    await escolher(page, '26003');
    await expect(page.locator('#pc-import-itens')).toContainText('não tem itens para comprar');
    await expect(page.locator('#pc-import-gerar')).toBeDisabled();
});

test('um fornecedor so: vai direto ao formulario com os itens e a origem', async ({ page }) => {
    await abrir(page);
    await escolher(page, '26001');
    await page.click('#pc-import-todos');            // desmarca tudo
    await expect(page.locator('#pc-import-gerar')).toBeDisabled();
    await linha(page, 'TRILHO').locator('.pc-import-chk').check();
    await linha(page, 'PONTEIRA').locator('.pc-import-chk').check();
    await linha(page, 'TRILHO').locator('input[type=number]').fill('5');
    await linha(page, 'TRILHO').locator('input[type=number]').dispatchEvent('change');
    await page.click('#pc-import-gerar');
    await page.waitForURL(/tab=novo/);
    await expect(page.locator('#pc-fornecedor')).toHaveValue('8');
    await expect(page.locator('#pc-obs')).toHaveValue('Compra para o pedido #26001 — Pedro Alves');
    await expect(page.locator('#tb-pc-draft tr')).toHaveCount(3);   // 2 itens + total
    await page.click('#pc-btn-salvar');
    await page.waitForURL(/tab=pedidos/);
    const pcs = await lerPC(page);
    expect(pcs).toHaveLength(1);
    expect(pcs[0]).toMatchObject({ fornecedor_id: 8, pedido_venda_id: 26001 });
    expect(pcs[0].itens.map(i => [i.item_nome, i.quantidade, i.preco_unit])).toEqual([['TRILHO', 5, 30], ['PONTEIRA', 4, 4]]);
    expect(pcs[0].itens[0]).not.toHaveProperty('fornecedor_id');
    await expect(page.locator('#tb-pedidos-compra')).toContainText('↳ Pedido #26001');
    expect(await page.evaluate(() => localStorage.getItem('sc_pc_origem'))).toBeNull();
});

test('fornecedores diferentes: oferece um por fornecedor ou generico', async ({ page }) => {
    await abrir(page);
    await escolher(page, '26001');
    await page.click('#pc-import-gerar');
    const botoes = page.locator('#sc-modal-btns button');
    await expect(botoes).toHaveCount(3);   // 2 saidas + cancelar
    await expect(botoes.nth(0)).toHaveText('Um pedido para cada fornecedor');
    await expect(botoes.nth(1)).toContainText('Pedido genérico');
    await expect(page.locator('#sc-modal-msg')).toContainText('pedido #26001');
    // Cancelar volta para a escolha dos itens.
    await botoes.nth(2).click();
    await expect(page.locator('#pc-import-overlay')).toBeVisible();
    await expect(page.locator('.pc-import-chk:checked')).toHaveCount(4);
});

test('um pedido por fornecedor: fila com a origem em todos', async ({ page }) => {
    await abrir(page);
    await escolher(page, '26001');
    await page.click('#pc-import-gerar');
    await page.click('#sc-modal-btns button:has-text("Um pedido para cada")');
    for (let n = 0; n < 3; n++) {
        await page.waitForURL(/fornecedores\.html/);
        await expect(page.locator('#pc-btn-salvar')).toBeVisible();
        await page.click('#pc-btn-salvar');
        await page.waitForLoadState('load');
    }
    await page.waitForURL(/tab=pedidos/);
    const pcs = await lerPC(page);
    expect(pcs).toHaveLength(3);
    expect(pcs.every(p => p.pedido_venda_id === 26001)).toBe(true);
    expect(pcs.map(p => p.fornecedor_id).sort()).toEqual([0, 7, 8]);   // 0 = kit sem fornecedor
});

test('generico: um pedido sem fornecedor com todos os itens', async ({ page }) => {
    await abrir(page);
    await escolher(page, '26001');
    await page.click('#pc-import-gerar');
    await page.click('#sc-modal-btns button:has-text("Pedido genérico")');
    await page.waitForURL(/tab=novo/);
    await expect(page.locator('#pc-fornecedor')).toHaveValue('0');
    await page.click('#pc-btn-salvar');
    await page.waitForURL(/tab=pedidos/);
    const pcs = await lerPC(page);
    expect(pcs).toHaveLength(1);
    expect(pcs[0]).toMatchObject({ fornecedor_id: 0, pedido_venda_id: 26001 });
    expect(pcs[0].itens).toHaveLength(4);
});

test('item ja comprado para o pedido vem desmarcado e avisado', async ({ page }) => {
    await abrir(page, { sc_pc: [{ id: 26050, fornecedor_id: 8, fornecedor_nome: 'Alfa Trilhos', pedido_venda_id: 26001, status: 'Enviado', data_criacao: 1,
        itens: [{ tipo: 'material', item_id: 11, item_nome: 'TRILHO', unidade: 'm', quantidade: 3, preco_unit: 30, subtotal: 90 }] }] });
    await escolher(page, '26001');
    const trilho = linha(page, 'TRILHO');
    await expect(trilho.locator('.pc-import-chk')).not.toBeChecked();
    await expect(trilho).toContainText('Já comprado para este pedido: #26050');
    await expect(page.locator('.pc-import-chk:checked')).toHaveCount(3);
});

test('pedido de compra feito a mao depois nao herda a origem', async ({ page }) => {
    await abrir(page);
    await escolher(page, '26001');
    await page.click('#pc-import-gerar');
    await page.click('#sc-modal-btns button:has-text("Pedido genérico")');
    await page.waitForURL(/tab=novo/);
    // Desiste: sai sem salvar e abre um pedido novo a mao.
    await page.goto(BASE + '/fornecedores.html?tab=novo');
    await expect(page.locator('#pc-obs')).toHaveValue('');
    await page.selectOption('#pc-fornecedor', '8');
    await page.selectOption('#pc-item-id', '11');
    await page.click('button:has-text("+ Adicionar")');
    await page.click('#pc-btn-salvar');
    await page.waitForURL(/tab=pedidos/);
    expect((await lerPC(page))[0]).not.toHaveProperty('pedido_venda_id');
});
