// Financeiro fase 0 - recebimentos com fonte unica: o valor recebido do pedido
// e a soma das parcelas (contas a receber) pagas. A baixa passa por um modal
// com parcelas, data e forma; o estorno desfaz a baixa.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const pedido = (extra) => ({ id: 26300, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Aguardando Financeiro', financeiro_gerado: true,
    valor: 1000, valor_recebido: 500, pagamento_pendente: true, forma_pagamento: 'PIX', ambientes: [], ...(extra || {}) });
const crs = () => [
    { id: 501, pedido_id: 26300, cliente_nome: 'Ana Paula Lima', descricao: 'Entrada', valor: 500, data_vencimento: '2099-11-01', data_pagamento: '2026-11-01', status: 'Pago', parcela_tipo: 'entrada' },
    { id: 502, pedido_id: 26300, cliente_nome: 'Ana Paula Lima', descricao: 'Saldo', valor: 500, data_vencimento: '2099-12-01', data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' }
];

async function abrirKanban(page, ped) {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped || pedido()], sc_cr: crs() });
    await page.goto(BASE + '/pcp.html');
}

test('confirmar pagamento lista parcelas e baixa so as marcadas', async ({ page }) => {
    await abrirKanban(page);
    await page.locator('.kanban-btn-pagamento').click();
    const modal = page.locator('#baixa-modal');
    await expect(modal).toBeVisible();
    const itens = modal.locator('input[type=checkbox]');
    await expect(itens).toHaveCount(1);
    await expect(itens.first(), 'saldo vem desmarcado quando ha pagamento pendente').not.toBeChecked();
    await itens.first().check();
    await modal.locator('#baixa-forma').selectOption('Dinheiro');
    await modal.locator('#baixa-ok').click();
    await expect(page.locator('.kanban-col', { has: page.locator('.kanban-col-header', { hasText: 'Instalado' }) }).locator('.kanban-card')).toHaveCount(1);
    const cr = (await lerChave(page, 'sc_cr')).find(c => c.id === 502);
    expect(cr.status).toBe('Pago');
    expect(cr.forma_pagamento).toBe('Dinheiro');
    expect(cr.baixado_por).toBe(1);
    const ped = (await lerChave(page, 'sc_ped'))[0];
    expect(ped.valor_recebido).toBe(ped.valor);
    expect(ped.status).toBe('Instalado');
});

test('confirmar sem marcar o saldo leva a Instalado com saldo em aberto', async ({ page }) => {
    await abrirKanban(page);
    await page.locator('.kanban-btn-pagamento').click();
    await page.locator('#baixa-modal #baixa-ok').click();
    const ped = (await lerChave(page, 'sc_ped'))[0];
    expect(ped.status).toBe('Instalado');
    expect(ped.pagamento_pendente).toBe(true);
    expect((await lerChave(page, 'sc_cr')).find(c => c.id === 502).status).toBe('Pendente');
    await expect(page.locator('.kanban-card', { hasText: '#' }).filter({ hasText: 'saldo em aberto' })).toHaveCount(1);
});

test('Recebido no A Receber reflete no pedido', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedido({ status: 'Pronto p/ Instalação' })], sc_cr: crs() });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.locator('#tb-contas-receber button', { hasText: '✓ Recebido' }).click();
    await page.locator('#baixa-modal #baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].valor_recebido).toBe(1000);
});

test('estornar volta a parcela e o pedido', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedido({ status: 'Instalado' })], sc_cr: crs() });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.locator('#tb-contas-receber button', { hasText: 'Estornar' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr')).find(c => c.id === 501).status).toBe('Pendente');
    const cr = (await lerChave(page, 'sc_cr')).find(c => c.id === 501);
    expect(cr.estornado_por).toBe(1);
    expect(cr.data_pagamento).toBeFalsy();
    expect((await lerChave(page, 'sc_ped'))[0].valor_recebido).toBe(0);
});

test('valor recebido do pedido e somente leitura', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI });
    await page.goto(BASE + '/pedido.html');
    await expect(page.locator('#ped-valor-recebido')).toHaveAttribute('readonly', '');
});

test('estornar recebimento de pedido quitado marca o pagamento como pendente', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedido({ status: 'Instalado', pagamento_pendente: false, pagamento_confirmado_em: Date.now() })], sc_cr: crs() });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.locator('#tb-contas-receber button', { hasText: 'Estornar' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].pagamento_pendente).toBe(true);
});

test('parcela paga nao pode ser excluida; excluir a ultima em aberto zera o recebido do pedido', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedido({ status: 'Instalado', valor_recebido: 300 })],
        sc_cr: [{ ...crs()[1], id: 502 }, { ...crs()[0], id: 501 }] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.evaluate(() => { excluirCR(501); });
    await expect(page.locator('#sc-modal-msg')).toContainText('Estorne o recebimento antes de excluir');
    expect((await lerChave(page, 'sc_cr')).map(c => c.id).sort()).toEqual([501, 502]);
    // Sem nenhuma parcela, o pedido que ja teve financeiro fica com recebido zero.
    await page.evaluate(() => { db.contas_receber = db.contas_receber.filter(c => c.id !== 501); syncDB(); });
    await page.reload();
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.evaluate(() => { excluirCR(502); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr')).length).toBe(0);
    expect((await lerChave(page, 'sc_ped'))[0].valor_recebido).toBe(0);
});
