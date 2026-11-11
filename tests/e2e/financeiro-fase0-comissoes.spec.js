// Financeiro fase 0 - comissoes viram contas a pagar: instalar gera uma conta
// por papel; pagar (vendedores ou A Pagar) baixa a mesma conta e os flags do pedido.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const VEND = [
    { id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' },
    { id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' },
];
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const DATA_INST = new Date('2026-10-20T12:00:00').getTime();

const pedido = (extra) => ({ id: 26400, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Aguardando Financeiro', financeiro_gerado: true,
    valor: 1000, valor_recebido: 1000, ambientes: [], forma_pagamento: 'PIX', data_instalado: DATA_INST,
    vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50,
    arq_id: 3, arq_nome: 'Studio M', arq_comissao_pct: 10, arq_comissao_valor: 100, ...(extra || {}) });
const cr = () => [{ id: 501, pedido_id: 26400, cliente_nome: 'Ana Paula Lima', descricao: 'Pagamento', valor: 1000, data_vencimento: '2026-10-01', data_pagamento: '2026-10-01', status: 'Pago', parcela_tipo: 'unica' }];

test('instalar gera uma conta por papel', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedido()], sc_cr: cr() });
    await page.goto(BASE + '/pcp.html');
    await page.locator('.kanban-btn-pagamento').click();
    await page.locator('#baixa-modal #baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).toBe('Instalado');
    const cps = (await lerChave(page, 'sc_cp')).filter(c => c.categoria === 'comissao');
    expect(cps).toHaveLength(2);
    expect(cps.map(c => c.papel_comissao).sort()).toEqual(['arquiteto', 'vendedor']);
    expect(cps.every(c => c.data_vencimento === '2026-10-20' && c.status === 'Pendente' && c.pedido_id === 26400)).toBe(true);
    expect(new Set(cps.map(c => c.id)).size).toBe(2);
    // chamar de novo nao duplica
    const n = await page.evaluate(() => { const p = db.pedidos[0]; gerarComissoesPedido(p); gerarComissoesPedido(p); return db.contas_pagar.filter(c => c.categoria === 'comissao').length; });
    expect(n).toBe(2);
});

test('pagar comissao na tela de vendedores baixa a conta', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedido({ status: 'Instalado' })] });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.click('#tb-comissoes-pendentes button:has-text("Pagar")');
    const modal = page.locator('#baixa-modal');
    await expect(modal).toBeVisible();
    await modal.locator('#baixa-data').fill('2026-11-05');
    await modal.locator('.baixa-meio').selectOption('PIX');
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => ((await lerChave(page, 'sc_cp')) || []).filter(c => c.status === 'Pago').length).toBe(1);
    const cp = (await lerChave(page, 'sc_cp')).find(c => c.papel_comissao === 'vendedor');
    expect(cp.status).toBe('Pago');
    expect(cp.forma_pagamento).toBe('PIX');
    expect(cp.data_pagamento).toBe('2026-11-05');
    expect(cp.baixado_por).toBe(1);
    const ped = (await lerChave(page, 'sc_ped'))[0];
    expect(ped.comissao_paga).toBe(true);
    expect(ped.comissao_data_pgto).toBe(new Date('2026-11-05T12:00:00').getTime());
    expect(ped.arq_comissao_paga, 'a do arquiteto continua').toBeFalsy();
    await page.click('.vend-tab-btn[data-tab="historico"]');
    await expect(page.locator('#tb-hist-comissoes')).toContainText('R$ 50.00');
});

test('pagar no A Pagar reflete na tela de vendedores', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedido({ status: 'Instalado' })] });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await expect(page.locator('#tb-comissoes-pendentes')).toContainText('R$ 50.00');
    await page.evaluate(() => { gerarComissoesPedido(db.pedidos[0]); syncDB(); });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="pagar"]').click();
    const linha = page.locator('#tb-contas-pagar tr', { hasText: 'Bruno' });
    await linha.locator('button', { hasText: 'Pagar' }).click();
    await page.locator('#baixa-modal .baixa-meio').selectOption('PIX');
    await page.locator('#baixa-modal #baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].comissao_paga).toBe(true);
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await expect(page.locator('#tb-comissoes-pendentes')).not.toContainText('R$ 50.00');
});

test('pagar todas da pessoa', async ({ page }) => {
    const peds = [pedido({ id: 26401, status: 'Instalado' }), pedido({ id: 26402, status: 'Instalado', vendedor_id: 9, vendedor_nome: 'Outro', comissao_valor: 70 }),
        pedido({ id: 26403, status: 'Instalado', comissao_valor: 30 })];
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: [...VEND, { id: 9, nome: 'Outro', comissao_pct: 7, tipo: 'vendedor' }], sc_ped: peds });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.selectOption('#filtro-vend-pendente', '2');
    await page.click('button:has-text("Pagar Todas")');
    const modal = page.locator('#baixa-modal');
    await expect(modal.locator('.baixa-check')).toHaveCount(2);
    await modal.locator('#baixa-data').fill('2026-11-06');
    await modal.locator('.baixa-meio').nth(0).selectOption('Dinheiro');
    await modal.locator('.baixa-meio').nth(1).selectOption('Dinheiro');
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => ((await lerChave(page, 'sc_cp')) || []).filter(c => c.status === 'Pago').length).toBe(2);
    const pagas = (await lerChave(page, 'sc_cp')).filter(c => c.status === 'Pago');
    expect(pagas.every(c => c.vendedor_id === 2 && c.data_pagamento === '2026-11-06' && c.forma_pagamento === 'Dinheiro')).toBe(true);
    const ps = await lerChave(page, 'sc_ped');
    expect(ps.find(p => p.id === 26402).comissao_paga, 'de outro vendedor, nao').toBeFalsy();
});

test('Pagar no A Pagar nao usa prompt', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedido({ status: 'Instalado' })],
        sc_cp: [{ id: 801, descricao: 'Aluguel', valor: 300, categoria: 'outro', tipo: 'fixo', status: 'Pendente', data_vencimento: '2099-01-01', data_pagamento: null, credor_nome: 'Imob' }] });
    await page.addInitScript(() => { window.prompt = () => { window.__prompt = true; return null; }; });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="pagar"]').click();
    await page.locator('#tb-contas-pagar button', { hasText: 'Pagar' }).click();
    await page.locator('#baixa-modal .baixa-meio').selectOption('PIX');
    await page.locator('#baixa-modal #baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp'))[0].status).toBe('Pago');
    expect(await page.evaluate(() => window.__prompt)).toBeFalsy();
    expect((await lerChave(page, 'sc_cp'))[0].forma_pagamento).toBeTruthy();
});

test('pagar comissao exige permissao de contas a pagar', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedido({ status: 'Instalado' })] });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].permissoes_extras = { 'financeiro.pagar': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.evaluate(() => { pagarComissao(26400); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await expect(page.locator('#baixa-modal')).toHaveCount(0);
    expect(((await lerChave(page, 'sc_cp')) || []).filter(c => c.status === 'Pago')).toHaveLength(0);
});
