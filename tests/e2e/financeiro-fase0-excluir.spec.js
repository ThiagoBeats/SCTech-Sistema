// Financeiro fase 0 - excluir pedido de venda nao deixa contas orfas nem apaga
// recebimento; comissao paga de pedido cancelado fica marcada para revisao.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const ped = (extra) => ({ id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Medição', financeiro_gerado: true,
    valor: 1000, valor_recebido: 0, ambientes: [], forma_pagamento: 'PIX', ...(extra || {}) });
const crAberta = { id: 601, pedido_id: 26500, cliente_nome: 'Ana Paula Lima', descricao: 'Saldo', valor: 500, data_vencimento: '2099-12-01', data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' };
const crPaga = { id: 602, pedido_id: 26500, cliente_nome: 'Ana Paula Lima', descricao: 'Entrada', valor: 500, data_vencimento: '2026-10-01', data_pagamento: '2026-10-01', status: 'Pago', parcela_tipo: 'entrada' };
const cpCom = (id, papel, status, extra) => ({ id, pedido_id: 26500, descricao: 'Comissão ' + papel, credor_nome: 'Bruno', valor: 50, categoria: 'comissao', papel_comissao: papel, data_vencimento: '2026-10-20', status, tipo: 'variavel', ...(extra || {}) });

test('sem recebimento: exclui pedido, contas em aberto e comissoes pendentes', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped(), ped({ id: 26501 })],
        sc_cr: [crAberta, { ...crAberta, id: 603, pedido_id: 26501 }],
        sc_cp: [cpCom(701, 'vendedor', 'Pendente'), cpCom(702, 'arquiteto', 'Pago', { data_pagamento: '2026-10-25' })] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { excluirPedido(26500); });
    await expect(page.locator('#sc-modal-msg')).toContainText('2 conta');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped')).length).toBe(1);
    expect((await lerChave(page, 'sc_ped'))[0].id).toBe(26501);
    expect((await lerChave(page, 'sc_cr')).map(c => c.id)).toEqual([603]);
    const cps = await lerChave(page, 'sc_cp');
    expect(cps.map(c => c.id)).toEqual([702]);
    expect(cps[0].pedido_cancelado).toBe(true);
});

test('com recebimento: bloqueia e explica', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped()], sc_cr: [crAberta, crPaga] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { excluirPedido(26500); });
    await expect(page.locator('#sc-modal-msg')).toContainText('estorne');
    await page.locator('#sc-modal-ok').click();
    expect(await lerChave(page, 'sc_ped')).toHaveLength(1);
    expect(await lerChave(page, 'sc_cr')).toHaveLength(2);
});

test('comissao paga de pedido que voltou para Orcamento fica marcada para revisar', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped()], sc_cr: [crAberta],
        sc_cp: [cpCom(701, 'vendedor', 'Pago', { data_pagamento: '2026-10-25' }), cpCom(702, 'arquiteto', 'Pendente')] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { voltarPedidoParaOrcamento(26500); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).toBe('Orçamento');
    const p = (await lerChave(page, 'sc_ped'))[0];
    expect(p.financeiro_gerado).toBe(false);
    expect(await lerChave(page, 'sc_cr')).toEqual([]);
    const cps = await lerChave(page, 'sc_cp');
    expect(cps.map(c => c.id)).toEqual([701]);
    expect(cps[0].pedido_cancelado).toBe(true);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="pagar"]').click();
    await expect(page.locator('#tb-contas-pagar')).toContainText('pedido cancelado — revisar');
});
