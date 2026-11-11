// Financeiro fase 0 - migracao unica dos dados antigos: ao abrir o app, pedido
// pago com parcela em aberto e baixado, comissao paga vira conta paga, conta a
// receber sem pedido sai; antes, uma copia de seguranca. Recarregar nao muda nada.
// O entrar() abre login.html com o storage vazio, e a migracao ja roda ali e
// grava a marca; por isso cada teste aqui apaga a marca depois de semear.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const CONFIRMADO = new Date('2026-10-05T15:00:00').getTime();
const INSTALADO = new Date('2026-10-01T15:00:00').getTime();
const PGTO_COMISSAO = new Date('2026-10-20T15:00:00').getTime();

const VEND = [{ id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' }];
const PEDIDOS = [
    { id: 26500, clienteId: 1, clienteNome: 'Ana <b>Lima</b>', status: 'Instalado', financeiro_gerado: true, valor: 1000, valor_recebido: 1000,
      ambientes: [], data_instalado: INSTALADO, pagamento_confirmado_em: CONFIRMADO, pagamento_confirmado_por: 1,
      vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50, comissao_paga: true, comissao_data_pgto: PGTO_COMISSAO },
    { id: 26501, clienteId: 1, clienteNome: 'Ana <b>Lima</b>', status: 'Na Costura', financeiro_gerado: true, valor: 800, valor_recebido: 300, ambientes: [] },
];
const CRS = [
    { id: 601, pedido_id: 26500, cliente_nome: 'Ana', descricao: 'Entrada — Pedido #26500', valor: 500, data_vencimento: '2026-09-01', data_pagamento: '2026-09-01', status: 'Pago' },
    { id: 602, pedido_id: 26500, cliente_nome: 'Ana', descricao: 'Saldo — Pedido #26500', valor: 500, data_vencimento: '2026-10-01', data_pagamento: null, status: 'Atrasado' },
    { id: 603, pedido_id: 26501, cliente_nome: 'Ana', descricao: 'Pagamento — Pedido #26501', valor: 800, data_vencimento: '2026-12-01', data_pagamento: null, status: 'Pendente' },
    { id: 604, pedido_id: 99999, cliente_nome: 'Fulano', descricao: 'Órfã aberta', valor: 70, data_vencimento: '2026-10-01', data_pagamento: null, status: 'Pendente' },
    { id: 605, pedido_id: 99999, cliente_nome: 'Fulano', descricao: 'Órfã paga', valor: 30, data_vencimento: '2026-09-01', data_pagamento: '2026-09-01', status: 'Pago' },
];

async function semearDadosAntigos(page) {
    await entrar(page, BASE, { sc_cli: [{ id: 1, nome: 'Ana Lima' }], sc_vend: VEND, sc_ped: PEDIDOS, sc_cr: CRS, sc_cp: [] });
    await page.evaluate(() => { localStorage.removeItem('sc_fin_migracao'); localStorage.removeItem('sc_fin_revisar'); localStorage.removeItem('sc_fin_backup_fase0'); });
}

test('abrir o financeiro migra os dados antigos uma vez, com copia de seguranca', async ({ page }) => {
    await semearDadosAntigos(page);
    await page.goto(BASE + '/financeiro.html');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');

    const crs = await lerChave(page, 'sc_cr');
    const c602 = crs.find(c => c.id === 602);
    expect([c602.status, c602.data_pagamento, c602.baixado_por]).toEqual(['Pago', '2026-10-05', 1]);
    expect(crs.find(c => c.id === 603).status, 'pedido parcial nao e baixado').toBe('Pendente');
    expect(crs.find(c => c.id === 604), 'orfa aberta sai').toBeUndefined();
    expect(crs.find(c => c.id === 605).pedido_excluido, 'orfa paga fica marcada').toBe(true);

    const cps = await lerChave(page, 'sc_cp');
    expect(cps).toHaveLength(1);
    expect([cps[0].papel_comissao, cps[0].status, cps[0].valor, cps[0].data_pagamento, cps[0].data_vencimento, cps[0].baixado_por])
        .toEqual(['vendedor', 'Pago', 50, '2026-10-20', '2026-10-01', 'migracao']);

    const peds = await lerChave(page, 'sc_ped');
    expect(peds.find(p => p.id === 26500).valor_recebido).toBe(1000);
    expect(peds.find(p => p.id === 26501).valor_recebido, 'Financeiro passa a valer').toBe(0);
    expect(peds.every(p => !p.custo_snapshot)).toBe(true);

    const backup = await lerChave(page, 'sc_fin_backup_fase0');
    expect(backup.contas_receber).toHaveLength(5);
    expect(backup.contas_receber.find(c => c.id === 602).status).toBe('Atrasado');
    expect(backup.contas_pagar).toEqual([]);
    expect(backup.pedidos.find(p => p.id === 26501).valor_recebido).toBe(300);

    const revisar = await lerChave(page, 'sc_fin_revisar');
    expect(revisar.map(r => r.pedido_id)).toEqual([26501]);

    // Recarregar nao muda nada.
    const antes = await page.evaluate(() => ['sc_cr', 'sc_cp', 'sc_ped'].map(k => localStorage.getItem(k)));
    await page.reload();
    await expect(page.locator('#fin-kpis')).not.toBeEmpty();
    const depois = await page.evaluate(() => ['sc_cr', 'sc_cp', 'sc_ped'].map(k => localStorage.getItem(k)));
    expect(depois).toEqual(antes);
});

test('aviso de revisao na Visao Geral; marcar como revisado limpa', async ({ page }) => {
    await semearDadosAntigos(page);
    await page.goto(BASE + '/financeiro.html');
    const aviso = page.locator('#fin-revisar');
    await expect(aviso).toContainText('Confira estes pedidos');
    await expect(aviso).toContainText('#26501');
    await expect(aviso).toContainText('Ana <b>Lima</b>');   // texto escapado, nao vira negrito
    await expect(aviso.locator('b')).toHaveCount(0);
    await aviso.locator('#fin-revisar-ok').click();
    await expect(aviso).toBeEmpty();
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_revisar'))).toBeNull();
    await page.reload();
    await expect(page.locator('#fin-kpis')).not.toBeEmpty();
    await expect(page.locator('#fin-revisar')).toBeEmpty();
});

test('sem nada para migrar, so grava a marca (sem copia)', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [], sc_cr: [], sc_cp: [] });
    await page.evaluate(() => localStorage.removeItem('sc_fin_migracao'));
    await page.goto(BASE + '/index.html');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_backup_fase0'))).toBeNull();
});
