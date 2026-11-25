// Etapa 3 do lote: Vendedores/Arquitetos. Os dois moram na mesma lista
// (sc_vend) e se distinguem pelo campo tipo; cadastro antigo, sem tipo, e
// vendedor. O campo RT livre do pedido saiu: o arquiteto entra pelo campo
// Vendedor / Responsavel e recebe pela comissao do cadastro.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const VEND = [
    { id: 1, nome: 'Ana',      comissao_pct: 5 },                    // antigo, sem tipo
    { id: 2, nome: 'Bruno',    comissao_pct: 4, tipo: 'vendedor' },
    { id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' },
];
const PED = [
    { id: 26001, clienteNome: 'Cli A', status: 'Instalado', valor: 1000, vendedor_id: 1, vendedor_nome: 'Ana',      comissao_pct: 5,  comissao_valor: 50 },
    { id: 26002, clienteNome: 'Cli B', status: 'Instalado', valor: 2000, vendedor_id: 3, vendedor_nome: 'Studio M', comissao_pct: 10, comissao_valor: 200 },
    { id: 26003, clienteNome: 'Cli C', status: 'Instalado', valor: 500,  vendedor_id: 3, vendedor_nome: 'Studio M', comissao_pct: 10, comissao_valor: 50,
      comissao_paga: true, comissao_data_pgto: 1760000000000 },
];

// Conta para pagar comissoes (a janela de pagamento exige a conta).
const CONTAS = [{ id: 1, nome: 'Banco A', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true }];

async function abrir(page, url, extras) {
    await entrar(page, BASE, { sc_vend: VEND, sc_ped: PED, sc_contas_fin: CONTAS, ...(extras || {}) });
    await page.goto(BASE + '/' + (url || 'vendedores.html'));
}

async function confirmarModal(page) {
    // Pagar comissao abre a janela de pagamento (conta e data); as demais confirmacoes usam #sc-modal-ok.
    const ok = page.locator('#com-pag-ok, #sc-modal-ok').first();
    await ok.waitFor({ timeout: 5000 });
    // O pagamento exige escolher a conta.
    const conta = page.locator('#com-pag-conta');
    if (await conta.count()) await conta.selectOption({ index: 1 });
    await ok.click();
    await page.waitForTimeout(400);
}

const nomesNaTabela = page => page.locator('#tb-vendedores tr td:first-child').allInnerTexts();

// --- Nome e abas ------------------------------------------------------------

test('o menu lateral se chama Vendedores/Arquitetos', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#main-sidebar')).toContainText('Vendedores/Arquitetos');
    await expect(page.locator('.header h2')).toHaveText('Vendedores/Arquitetos');
});

test('ha as abas Vendedores e Arquitetos, e dentro delas Cadastro e Comissoes', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('.vend-tipo-btn')).toHaveText(['👤 Vendedores', '📐 Arquitetos']);
    const subs = await page.locator('.vend-tab-btn').allInnerTexts();
    expect(subs.join(' ')).toContain('Cadastro');
    expect(subs.join(' ')).toContain('Comissões');
    expect(subs.join(' ')).not.toContain('Histórico de Pagamentos');
});

// --- Cadastro ---------------------------------------------------------------

test('a aba Vendedores lista so vendedores, incluindo os antigos sem tipo', async ({ page }) => {
    await abrir(page);
    const nomes = await nomesNaTabela(page);
    expect(nomes).toEqual(['Ana', 'Bruno']);
});

test('a aba Arquitetos lista so arquitetos', async ({ page }) => {
    await abrir(page);
    await page.click('.vend-tipo-btn[data-tipo="arquiteto"]');
    expect(await nomesNaTabela(page)).toEqual(['Studio M']);
    await expect(page.locator('#vend-form-titulo')).toHaveText('Cadastrar Arquiteto');
});

test('cadastrar na aba Arquitetos grava o tipo arquiteto', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    await page.fill('#vend-nome', 'Casa Nova Arq');
    await page.fill('#vend-comissao', '8');
    await page.click('#vend-btn-salvar');
    await page.waitForTimeout(600);
    const novo = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_vend')).find(v => v.nome === 'Casa Nova Arq'));
    expect(novo.tipo).toBe('arquiteto');
    expect(novo.comissao_pct).toBe(8);
});

test('cadastrar na aba Vendedores grava o tipo vendedor', async ({ page }) => {
    await abrir(page);
    await page.fill('#vend-nome', 'Carla');
    await page.click('#vend-btn-salvar');
    await page.waitForTimeout(600);
    const novo = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_vend')).find(v => v.nome === 'Carla'));
    expect(novo.tipo).toBe('vendedor');
});

test('nome repetido e barrado mesmo entre tipos diferentes', async ({ page }) => {
    await abrir(page);
    await page.fill('#vend-nome', 'studio m');
    await page.click('#vend-btn-salvar');
    await expect(page.locator('body')).toContainText('Já existe um cadastro com o nome "Studio M" (arquiteto)');
});

test('editar um arquiteto nao o transforma em vendedor', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    await page.click('#tb-vendedores button[aria-label="Ações"]');
    await page.click('#menu-acoes-flutuante .menu-acoes-item:has-text("Editar")');
    await expect(page.locator('#vend-form-titulo')).toHaveText('Editar Arquiteto');
    await page.fill('#vend-comissao', '12');
    await page.click('#vend-btn-salvar');
    await page.waitForTimeout(600);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_vend')).find(v => v.id === 3));
    expect(s.tipo).toBe('arquiteto');
    expect(s.comissao_pct).toBe(12);
});

// --- Comissoes --------------------------------------------------------------

test('a tela de comissoes mostra vendedores e arquitetos, com cartao de cada um', async ({ page }) => {
    await abrir(page);
    await page.click('.vend-tab-btn[data-tab="comissoes"]');
    await expect(page.locator('#tb-comissoes')).toContainText('Ana');
    await expect(page.locator('#tb-comissoes')).toContainText('Studio M');
    await expect(page.locator('.com-cartao', { hasText: 'Ana' }).locator('.com-apagar')).toHaveText('R$ 50,00');
    await expect(page.locator('.com-cartao', { hasText: 'Studio M' }).locator('.com-apagar')).toHaveText('R$ 200,00');
    await expect(page.locator('.com-cartao', { hasText: 'Studio M' }).locator('.com-pago')).toHaveText('R$ 50,00');
    await page.selectOption('#com-filtro-vend', '1');
    await expect(page.locator('#tb-comissoes')).toContainText('Ana');
    await expect(page.locator('#tb-comissoes')).not.toContainText('Studio M');
});

test('o filtro de vendedor da tela de comissoes lista vendedores e arquitetos', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    await page.click('.vend-tab-btn[data-tab="comissoes"]');
    const opcoes = await page.locator('#com-filtro-vend option').allInnerTexts();
    expect(opcoes).toEqual(['Todos', 'Ana', 'Bruno', 'Studio M (arquiteto)']);
});

test('Pagar todos os pendentes do arquiteto nao paga comissao de vendedor', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    await page.click('.vend-tab-btn[data-tab="comissoes"]');
    await page.click('button:has-text("Pagar todos os pendentes de Studio M")');
    await confirmarModal(page);
    const peds = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')));
    expect(peds.find(p => p.id === 26002).arq_comissao_paga, 'a do arquiteto foi paga').toBe(true);
    expect(peds.find(p => p.id === 26001).comissao_paga, 'a da vendedora, nao').toBeFalsy();
});

test('o pagamento ja feito aparece como Paga, com a data, na linha do arquiteto', async ({ page }) => {
    await abrir(page);
    await page.click('.vend-tab-btn[data-tab="comissoes"]');
    await expect(page.locator('#tb-comissoes tr[data-ped="26001"]')).not.toContainText('Paga');
    await expect(page.locator('#tb-comissoes tr[data-ped="26003"]')).toContainText('Studio M');
    await expect(page.locator('#tb-comissoes tr[data-ped="26003"]')).toContainText('Paga');
});

// --- Pedido -----------------------------------------------------------------

// O pedido tem dois campos: Vendedor e Arquiteto. Pelo menos um e obrigatorio,
// e cada um gera a sua comissao, conforme o cadastro.

const opcoes = (page, sel) => page.locator(`${sel} option`).allInnerTexts();

test('no pedido, Vendedor lista so vendedores e Arquiteto so arquitetos', async ({ page }) => {
    await abrir(page, 'pedido.html');
    expect(await opcoes(page, '#ped-vendedor')).toEqual(['— Sem vendedor —', 'Ana (5%)', 'Bruno (4%)']);
    expect(await opcoes(page, '#ped-arquiteto')).toEqual(['— Sem arquiteto —', 'Studio M (10%)']);
});

test('com vendedor e arquiteto, o pedido mostra as duas comissoes', async ({ page }) => {
    await abrir(page, 'pedido.html');
    await page.selectOption('#ped-vendedor', '1');
    await page.selectOption('#ped-arquiteto', '3');
    const r = await page.evaluate(() => {
        pedidoDraft.itens = [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 1000, subtotal: 1000 }];
        atualizarTotalPedido();
        return [document.getElementById('ped-comissao-val').textContent, document.getElementById('ped-comissao-arq-val').textContent];
    });
    expect(r, '5% do vendedor e 10% do arquiteto sobre 1000').toEqual(['50.00', '100.00']);
});

test('o campo RT livre saiu do pedido', async ({ page }) => {
    await abrir(page, 'pedido.html');
    expect(await page.locator('#ped-rt').count()).toBe(0);
    await expect(page.locator('body')).not.toContainText('Designer Parceiro');
});

// Pedido existente aberto para edicao, pronto para gravar pelo formulario.
async function editarExistente(page, extra) {
    const ped = {
        id: 25001, clienteId: 9, clienteNome: 'Cli Antigo', status: 'Orçamento', valor: 100,
        ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [], ...(extra || {}),
    };
    // Direto para pedido.html: outra tela no meio consumiria sc_editando_id e o
    // formulario abriria um pedido novo, sem nada a preservar.
    await abrir(page, 'pedido.html', { sc_ped: [ped], sc_cli: [{ id: 9, nome: 'Cli Antigo' }], sc_editando_id: 25001 });
}
// O ambiente semeado nao passou pelo "Calcular Consumo"; marca como calculado.
// Nao aguarda: salvar pode abrir modal.
async function salvar(page) {
    await page.evaluate(() => { pedidoDraft.ambientes.forEach(a => { a.calculado = true; }); salvarPedido(); });
}
const lerPedido = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')).find(x => x.id === 25001));

test('sem vendedor e sem arquiteto o pedido nao e salvo', async ({ page }) => {
    await editarExistente(page);
    await salvar(page);
    await expect(page.locator('#sc-modal-msg')).toContainText('pelo menos um vendedor ou um arquiteto');
    expect((await lerPedido(page)).tipo_precificacao, 'nada regravado').toBeUndefined();
    expect(page.url()).toContain('pedido.html');
});

test('so com arquiteto o pedido salva, com a comissao dele', async ({ page }) => {
    await editarExistente(page);
    await page.selectOption('#ped-arquiteto', '3');
    await salvar(page);
    await page.waitForURL(/index\.html/, { timeout: 15000 });
    const p = await lerPedido(page);
    expect(p.vendedor_id).toBeNull();
    expect(p).toMatchObject({ arq_id: 3, arq_nome: 'Studio M', arq_comissao_pct: 10 });
});

test('com os dois, cada um grava a sua comissao', async ({ page }) => {
    await editarExistente(page, { itens: [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 1000, subtotal: 1000 }] });
    await page.selectOption('#ped-vendedor', '1');
    await page.selectOption('#ped-arquiteto', '3');
    await salvar(page);
    await page.waitForURL(/index\.html/, { timeout: 15000 });
    const p = await lerPedido(page);
    expect(p).toMatchObject({ vendedor_id: 1, comissao_pct: 5, comissao_valor: 50, arq_id: 3, arq_comissao_pct: 10, arq_comissao_valor: 100 });
});

test('editar mantem a comissao do arquiteto ja paga', async ({ page }) => {
    await editarExistente(page, { arq_id: 3, arq_nome: 'Studio M', arq_comissao_paga: true, arq_comissao_data_pgto: 1760000000000 });
    await salvar(page);
    await page.waitForURL(/index\.html/, { timeout: 15000 });
    const p = await lerPedido(page);
    expect(p.arq_comissao_paga).toBe(true);
    expect(p.arq_comissao_data_pgto).toBe(1760000000000);
});

test('editar um pedido antigo com RT nao apaga a RT dele', async ({ page }) => {
    await editarExistente(page, { vendedor_id: 1, arquiteto_nome: 'Arq. Livre', rt_pct: 7 });
    await salvar(page);
    await page.waitForURL(/index\.html/, { timeout: 15000 });
    const p = await lerPedido(page);
    expect(p.vendedor_nome, 'o pedido foi regravado pelo formulario').toBe('Ana');
    expect(p.arquiteto_nome).toBe('Arq. Livre');
    expect(p.rt_pct).toBe(7);
});

// --- Pedido com os dois na tela de comissoes --------------------------------

test('arquiteto que estava no campo vendedor passa para o campo arquiteto', async ({ page }) => {
    await abrir(page);
    const peds = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')));
    expect(peds.find(x => x.id === 26002)).toMatchObject({ vendedor_id: null, comissao_valor: 0, arq_id: 3, arq_nome: 'Studio M', arq_comissao_valor: 200 });
    expect(peds.find(x => x.id === 26003), 'a comissao ja paga continua paga')
        .toMatchObject({ arq_id: 3, arq_comissao_paga: true, comissao_paga: false });
    expect(peds.find(x => x.id === 26001), 'vendedor de verdade nao muda').toMatchObject({ vendedor_id: 1 });
});

test('pedido com os dois aparece nas duas abas, e pagar um nao paga o outro', async ({ page }) => {
    const ambos = { id: 26009, clienteNome: 'Cli Ambos', status: 'Instalado', valor: 1000,
        vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 4, comissao_valor: 40,
        arq_id: 3, arq_nome: 'Studio M', arq_comissao_pct: 10, arq_comissao_valor: 100 };
    await abrir(page, 'vendedores.html?tipo=arquiteto&aba=comissoes', { sc_ped: [ambos] });
    await expect(page.locator('#tb-comissoes tr[data-papel="arquiteto"]')).toContainText('R$ 100,00');
    await page.locator('#tb-comissoes tr[data-papel="arquiteto"] .com-sel').check();
    await page.click('#com-btn-pagar');
    await confirmarModal(page);
    const p = (await page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped'))))[0];
    expect(p.arq_comissao_paga).toBe(true);
    expect(p.comissao_paga, 'a do vendedor continua pendente').toBeFalsy();
    await expect(page.locator('#tb-comissoes tr[data-papel="vendedor"]')).toContainText('R$ 40,00');
    await expect(page.locator('#tb-comissoes tr[data-papel="vendedor"]')).toContainText('Pendente');
    await expect(page.locator('#tb-comissoes tr[data-papel="arquiteto"]')).toContainText('Paga');
});

// --- A aba nao se perde ao salvar --------------------------------------------

test('cadastrar um arquiteto continua na aba Arquitetos', async ({ page }) => {
    await abrir(page);
    await page.click('.vend-tipo-btn[data-tipo="arquiteto"]');
    await page.fill('#vend-nome', 'Ateliê Sul');
    await page.click('#vend-btn-salvar');
    await page.waitForTimeout(1200);
    await expect(page.locator('.vend-tipo-btn.active')).toHaveAttribute('data-tipo', 'arquiteto');
    await expect(page.locator('#tb-vendedores')).toContainText('Ateliê Sul');
});

test('pagar na aba Comissoes volta para ela', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    await page.click('.vend-tab-btn[data-tab="comissoes"]');
    await page.locator('#tb-comissoes .com-sel').first().check();
    await page.click('#com-btn-pagar');
    await confirmarModal(page);
    await page.waitForTimeout(1200);
    await expect(page.locator('.vend-tab-btn.active')).toHaveAttribute('data-tab', 'comissoes');
    await expect(page.locator('.vend-tipo-btn.active')).toHaveAttribute('data-tipo', 'arquiteto');
});
