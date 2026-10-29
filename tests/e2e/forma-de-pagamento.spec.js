// "Parcelamento" virou "Forma de Pagamento". As opcoes sao so nomes, definidos
// pela empresa em Configuracoes > Empresa; o pedido guarda o nome e o
// Financeiro lanca um unico valor. Pedido antigo, com codigo de plano,
// continua mostrando a forma e dividindo como antes.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const PADRAO = ['50% entrada + 50% na instalação', 'À vista', '30% entrada + 70% na instalação', '40% entrada + 60% na instalação'];
const VEND = [{ id: 1, nome: 'Ana', comissao_pct: 5 }];
const CLI  = [{ id: 9, nome: 'Cli Teste' }];

async function abrir(page, url, extras) {
    await entrar(page, BASE, { sc_vend: VEND, sc_cli: CLI, ...(extras || {}) });
    await page.goto(BASE + '/' + url);
}
const opcoes = page => page.locator('#ped-forma-pagamento option').allInnerTexts();
const ler = (page, chave) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), chave);

// --- Pedido -------------------------------------------------------------------

test('pedido: a secao se chama Forma de Pagamento e traz a lista padrao', async ({ page }) => {
    await abrir(page, 'pedido.html');
    await expect(page.locator('h3', { hasText: '4. Forma de Pagamento' })).toBeVisible();
    await expect(page.locator('label[for="ped-forma-pagamento"]')).toHaveText('Forma de Pagamento');
    await expect(page.locator('body')).not.toContainText('Parcelamento');
    await expect(page.locator('body')).not.toContainText('Plano de Pagamento');
    expect(await opcoes(page)).toEqual(PADRAO);
    await expect(page.locator('#ped-forma-pagamento'), 'a primeira vem marcada').toHaveValue('50% entrada + 50% na instalação');
});

test('pedido: usa a lista da empresa, com a primeira marcada', async ({ page }) => {
    await abrir(page, 'pedido.html', { sc_formas_pag: ['PIX', 'Cartão em 10x', 'Boleto'] });
    expect(await opcoes(page)).toEqual(['PIX', 'Cartão em 10x', 'Boleto']);
    await expect(page.locator('#ped-forma-pagamento')).toHaveValue('PIX');
});

test('pedido: lista salva corrompida nao derruba a tela, volta ao padrao', async ({ page }) => {
    await entrar(page, BASE, { sc_vend: VEND, sc_cli: CLI });
    await page.evaluate(() => localStorage.setItem('sc_formas_pag', '{quebrado'));
    await page.goto(BASE + '/pedido.html');
    expect(await opcoes(page)).toEqual(PADRAO);
});

async function salvarNovo(page, forma, status) {
    await page.fill('#ped-cliente-busca', 'Cli Teste');
    await page.evaluate(() => filtrarClientes());
    await page.selectOption('#ped-cliente', '9');
    await page.selectOption('#ped-vendedor', '1');
    if (forma) await page.selectOption('#ped-forma-pagamento', forma);
    if (status) await page.selectOption('#ped-status', status);
    await page.evaluate(() => {
        pedidoDraft.ambientes.forEach(a => { a.calculado = true; });
        pedidoDraft.itens = [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 1000, subtotal: 1000 }];
        salvarPedido();
    });
    await page.waitForURL(/index\.html/);
}

test('pedido aprovado: guarda o nome da forma e lanca um unico valor no Financeiro', async ({ page }) => {
    await abrir(page, 'pedido.html', { sc_formas_pag: ['PIX', 'Cartão em 10x'] });
    await salvarNovo(page, 'Cartão em 10x', 'Medição');
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.forma_pagamento).toBe('Cartão em 10x');
    const cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === ped.id);
    expect(cr.length, 'um lancamento so').toBe(1);
    expect(cr[0].valor).toBe(ped.valor);
    expect(cr[0].descricao).toContain('Cartão em 10x');
    expect(cr[0].data_vencimento).toBe(new Date().toISOString().split('T')[0]);
});

test('orcamento nao lanca nada no Financeiro', async ({ page }) => {
    await abrir(page, 'pedido.html');
    await salvarNovo(page, null, 'Orçamento');
    expect((await ler(page, 'sc_cr')) || []).toEqual([]);
    expect((await ler(page, 'sc_ped'))[0].forma_pagamento).toBe('50% entrada + 50% na instalação');
});

const PED_ANTIGO = extra => ({
    id: 25001, clienteId: 9, clienteNome: 'Cli Teste', status: 'Orçamento', valor: 100, vendedor_id: 1,
    ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [], ...(extra || {}),
});

test('pedido antigo com codigo de plano mostra a forma pelo nome', async ({ page }) => {
    await abrir(page, 'pedido.html', { sc_ped: [PED_ANTIGO({ tipo_pagamento: '30_70' })], sc_editando_id: 25001 });
    await expect(page.locator('#ped-forma-pagamento')).toHaveValue('30% entrada + 70% na instalação');
});

test('forma que saiu da lista continua no pedido que a usa', async ({ page }) => {
    await abrir(page, 'pedido.html', {
        sc_formas_pag: ['PIX'], sc_ped: [PED_ANTIGO({ forma_pagamento: 'Cheque' })], sc_editando_id: 25001 });
    expect(await opcoes(page)).toEqual(['PIX', 'Cheque']);
    await expect(page.locator('#ped-forma-pagamento')).toHaveValue('Cheque');
    await page.evaluate(() => salvarPedido());
    await page.waitForURL(/index\.html/);
    expect((await ler(page, 'sc_ped'))[0].forma_pagamento, 'editar nao troca a forma').toBe('Cheque');
});

test('Financeiro: pedido antigo com codigo de plano continua dividido como antes', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [PED_ANTIGO({ status: 'Medição', tipo_pagamento: '50_50', data_entrega: '2030-01-10' })] });
    await page.goto(BASE + '/financeiro.html');
    await page.waitForFunction(() => typeof _migrarFinanceiroPedidos === 'function');
    await page.evaluate(() => _migrarFinanceiroPedidos());
    const cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === 25001);
    expect(cr.map(c => c.valor)).toEqual([50, 50]);
});

// --- Configuracoes > Empresa ---------------------------------------------------

const linhas = page => page.locator('#emp-formas-pag .forma-pag-nome');

test('empresa: lista a padrao e marca a primeira como padrao', async ({ page }) => {
    await abrir(page, 'empresa.html');
    await expect(page.locator('#emp-formas-pag-card h3')).toContainText('Formas de Pagamento');
    await expect(linhas(page)).toHaveCount(4);
    expect(await linhas(page).evaluateAll(l => l.map(i => i.value))).toEqual(PADRAO);
    await expect(page.locator('#emp-formas-pag .forma-pag-linha').first().locator('.forma-pag-padrao')).toHaveText('padrão');
});

test('empresa: adicionar, renomear, reordenar e remover, gravando so ao salvar', async ({ page }) => {
    await abrir(page, 'empresa.html');
    await page.click('button:has-text("Adicionar forma de pagamento")');
    await expect(linhas(page)).toHaveCount(5);
    await expect(linhas(page).nth(4)).toBeFocused();
    await linhas(page).nth(4).fill('PIX');
    // PIX sobe ate o topo e vira o padrao.
    for (let i = 4; i > 0; i--) await page.locator('#emp-formas-pag .forma-pag-linha').nth(i).locator('button[title="Subir"]').click();
    await linhas(page).nth(1).fill('Dinheiro');
    await page.locator('#emp-formas-pag .forma-pag-linha').nth(4).locator('button[title="Remover"]').click();
    expect(await ler(page, 'sc_formas_pag'), 'nada gravado antes de salvar').toBeNull();

    await page.click('button:has-text("Salvar Formas de Pagamento")');
    expect(await ler(page, 'sc_formas_pag')).toEqual(['PIX', 'Dinheiro', 'À vista', '30% entrada + 70% na instalação']);

    await page.goto(BASE + '/pedido.html');
    expect(await opcoes(page)).toEqual(['PIX', 'Dinheiro', 'À vista', '30% entrada + 70% na instalação']);
    await expect(page.locator('#ped-forma-pagamento')).toHaveValue('PIX');
});

test('empresa: nomes vazios e repetidos sao descartados ao salvar', async ({ page }) => {
    await abrir(page, 'empresa.html', { sc_formas_pag: ['PIX'] });
    await page.click('button:has-text("Adicionar forma de pagamento")');
    await linhas(page).nth(1).fill('  pix ');
    await page.click('button:has-text("Adicionar forma de pagamento")');
    await page.click('button:has-text("Adicionar forma de pagamento")');
    await linhas(page).nth(3).fill(' Boleto ');
    await page.click('button:has-text("Salvar Formas de Pagamento")');
    expect(await ler(page, 'sc_formas_pag')).toEqual(['PIX', 'Boleto']);
    await expect(linhas(page)).toHaveCount(2);
});

test('empresa: nao deixa salvar a lista vazia', async ({ page }) => {
    await abrir(page, 'empresa.html', { sc_formas_pag: ['PIX'] });
    await page.locator('#emp-formas-pag button[title="Remover"]').click();
    await expect(page.locator('#emp-formas-pag')).toContainText('Nenhuma forma cadastrada');
    await page.click('button:has-text("Salvar Formas de Pagamento")');
    await expect(page.locator('#sc-modal-msg')).toContainText('pelo menos uma');
    expect(await ler(page, 'sc_formas_pag')).toEqual(['PIX']);
});

test('empresa: restaurar padrao volta a lista original', async ({ page }) => {
    await abrir(page, 'empresa.html', { sc_formas_pag: ['PIX'] });
    await page.click('button:has-text("Restaurar Padrão") >> nth=-1');
    expect(await linhas(page).evaluateAll(l => l.map(i => i.value))).toEqual(PADRAO);
    expect(await ler(page, 'sc_formas_pag')).toBeNull();
});
