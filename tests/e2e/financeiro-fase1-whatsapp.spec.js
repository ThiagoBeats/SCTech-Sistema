// Financeiro Fase 1, tarefa 7: cobranca pelo WhatsApp (wa.me) a partir do A Receber.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somarDias = (dataISO, dias) => { const d = new Date(dataISO + 'T12:00:00'); d.setDate(d.getDate() + dias); return iso(d); };
const HOJE = iso(new Date());

const CLI = [{ id: 1, nome: 'Ana Paula Lima', tel: '(11) 98765-4321' }, { id: 2, nome: 'Sem Fone', tel: '' }];
const pedido = extra => ({ id: 26300, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Instalado', financeiro_gerado: true,
    valor: 2000, valor_recebido: 0, pagamento_pendente: false, forma_pagamento: 'PIX', ambientes: [], ...(extra || {}) });
const cr = extra => ({ id: 601, pedido_id: 26300, cliente_nome: 'Ana Paula Lima', descricao: 'Pedido #26300 - Saldo', valor: 2000,
    data_vencimento: HOJE, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });

async function abrir(page, dados) {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedido()], sc_cr: [cr()], ...dados });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { window.__abertos = []; window.open = (u, t) => { window.__abertos.push([u, t]); return null; }; });
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
}
const abertos = page => page.evaluate(() => window.__abertos);

test('cobrar abre wa.me com telefone e mensagem', async ({ page }) => {
    await abrir(page, { sc_empresa: { nome_fantasia: 'Cortinas Bela' } });
    await page.locator('#tb-contas-receber button', { hasText: 'Cobrar' }).click();
    const a = await abertos(page);
    expect(a).toHaveLength(1);
    expect(a[0][1]).toBe('_blank');
    expect(a[0][0]).toMatch(/^https:\/\/wa\.me\/5511987654321\?text=/);
    const msg = decodeURIComponent(a[0][0].split('?text=')[1]);
    expect(msg).toContain('Ana Paula Lima');
    expect(msg).toContain('Cortinas Bela');
    expect(msg).toContain('R$ 2.000,00');
    expect(msg).toContain('#26300');
    const [y, m, d] = HOJE.split('-');
    expect(msg).toContain(`${d}/${m}/${y}`);
});

test('usa a mensagem da empresa', async ({ page }) => {
    await abrir(page, { sc_empresa: { razao_social: 'ACME LTDA', mensagem_cobranca: 'Oi {cliente}, {empresa} cobra {valor}' } });
    await page.locator('#tb-contas-receber button', { hasText: 'Cobrar' }).click();
    const a = await abertos(page);
    expect(decodeURIComponent(a[0][0].split('?text=')[1])).toBe('Oi Ana Paula Lima, ACME LTDA cobra R$ 2.000,00');
});

test('sem telefone avisa e nao abre', async ({ page }) => {
    await abrir(page, { sc_ped: [pedido({ clienteId: 2, clienteNome: 'Sem Fone' })], sc_cr: [cr({ cliente_nome: 'Sem Fone' })] });
    await page.locator('#tb-contas-receber button', { hasText: 'Cobrar' }).click();
    await expect(page.getByText('Cliente sem telefone no cadastro.')).toBeVisible();
    expect(await abertos(page)).toHaveLength(0);
    expect((await ler(page, 'sc_cr'))[0].ultima_cobranca).toBeUndefined();
});

test('marca cobrado hoje', async ({ page }) => {
    await abrir(page, {});
    await page.locator('#tb-contas-receber button', { hasText: 'Cobrar' }).click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].ultima_cobranca).toBe(HOJE);
    await expect(page.locator('#tb-contas-receber')).toContainText('cobrado hoje');
    await expect(page.locator('#tb-contas-receber button', { hasText: 'Cobrar' })).toBeVisible();
});

test('botao so em atrasada ou vence hoje', async ({ page }) => {
    await abrir(page, { sc_cr: [
        cr({ id: 1, data_vencimento: somarDias(HOJE, -3) }),
        cr({ id: 2, data_vencimento: HOJE }),
        cr({ id: 3, data_vencimento: somarDias(HOJE, 5) }),
        cr({ id: 4, data_vencimento: somarDias(HOJE, -3), status: 'Pago', data_pagamento: HOJE })
    ] });
    await expect(page.locator('#tb-contas-receber button', { hasText: 'Cobrar' })).toHaveCount(2);
});
