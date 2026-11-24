// Pendencias R1, tarefa 5: cobranca (zero de tronco, cliente por id, popup bloqueado).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8155';
const p2 = n => String(n).padStart(2, '0');
const d0 = new Date();
const HOJE = d0.getFullYear() + '-' + p2(d0.getMonth() + 1) + '-' + p2(d0.getDate());
const pedido = extra => ({ id: 26300, clienteId: 2, clienteNome: 'Ana', status: 'Instalado', financeiro_gerado: true,
    valor: 2000, valor_recebido: 0, forma_pagamento: 'PIX', ambientes: [], ...(extra || {}) });
const cr = extra => ({ id: 601, pedido_id: 26300, cliente_nome: 'Ana', descricao: 'Saldo', valor: 2000,
    data_vencimento: HOJE, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });

async function abrir(page, dados, retorno) {
    await entrar(page, BASE, dados);
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(r => { window.__abertos = []; window.open = u => { window.__abertos.push(u); return r ? {} : null; }; }, retorno);
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click(); await page.locator('.fin-lado-btn[data-lado="receber"]').click();
}
const abertos = page => page.evaluate(() => window.__abertos);

test('telefone com zero de tronco vira 55 + DDD', async ({ page }) => {
    await abrir(page, { sc_cli: [{ id: 2, nome: 'Ana', tel: '041 9999-0000' }], sc_ped: [pedido()], sc_cr: [cr()] }, true);
    await page.locator('#tb-contas-receber button', { hasText: 'Cobrar' }).click();
    expect((await abertos(page))[0]).toMatch(/^https:\/\/wa\.me\/554199990000\?text=/);
});

test('homonimos: usa o clienteId do pedido, nao o primeiro do nome', async ({ page }) => {
    await abrir(page, { sc_cli: [{ id: 1, nome: 'Ana', tel: '11 91111-1111' }, { id: 2, nome: 'Ana', tel: '11 92222-2222' }], sc_ped: [pedido()], sc_cr: [cr()] }, true);
    await page.locator('#tb-contas-receber button', { hasText: 'Cobrar' }).click();
    expect((await abertos(page))[0]).toMatch(/^https:\/\/wa\.me\/5511922222222\?text=/);
});

test('homonimos sem id: abre o WhatsApp sem numero', async ({ page }) => {
    await abrir(page, { sc_cli: [{ id: 1, nome: 'Ana', tel: '11 91111-1111' }, { id: 2, nome: 'Ana', tel: '11 92222-2222' }], sc_ped: [pedido({ clienteId: undefined })], sc_cr: [cr()] }, true);
    await page.locator('#tb-contas-receber button', { hasText: 'Cobrar' }).click();
    expect((await abertos(page))[0]).toMatch(/^https:\/\/wa\.me\/\?text=/);
});

test('popup bloqueado: avisa e nao marca cobrado hoje', async ({ page }) => {
    await abrir(page, { sc_cli: [{ id: 2, nome: 'Ana', tel: '11 92222-2222' }], sc_ped: [pedido()], sc_cr: [cr()] }, false);
    await page.locator('#tb-contas-receber button', { hasText: 'Cobrar' }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('O navegador bloqueou a janela do WhatsApp. Libere os pop-ups e tente de novo.');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cr'))[0].ultima_cobranca)).toBeUndefined();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#tb-contas-receber')).not.toContainText('cobrado hoje');
});
