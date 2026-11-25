// Comissoes sao registro do pedido (sem contas a pagar): instalar deixa uma pendente por papel;
// pagar (tela de vendedores) gera a saida na conta escolhida e marca o pedido.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acaoLanc, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const VEND = [
    { id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' },
    { id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' },
];
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const DATA_INST = new Date('2026-10-20T12:00:00').getTime();
const CONTAS = [{ id: 11, nome: 'Banco A', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', ativo: true }];

const pedido = (extra) => ({ id: 26400, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Aguardando Financeiro', financeiro_gerado: true,
    valor: 1000, valor_recebido: 1000, ambientes: [], forma_pagamento: 'PIX', data_instalado: DATA_INST,
    vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50,
    arq_id: 3, arq_nome: 'Studio M', arq_comissao_pct: 10, arq_comissao_valor: 100, ...(extra || {}) });
const cr = () => [{ id: 501, pedido_id: 26400, cliente_nome: 'Ana Paula Lima', descricao: 'Pagamento', valor: 1000, data_vencimento: '2026-10-01', data_pagamento: '2026-10-01', status: 'Pago', parcela_tipo: 'unica' }];

test('instalar deixa uma comissao pendente por papel, sem criar conta a pagar', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedido()], sc_cr: cr() });
    await page.goto(BASE + '/pcp.html');
    await page.locator('.kanban-btn-pagamento').click();
    // tudo ja pago: sem janela de baixa, so a confirmacao simples
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).toBe('Instalado');
    const p = (await lerChave(page, 'sc_ped'))[0];
    expect([p.comissao_status, p.arq_comissao_status]).toEqual(['pendente', 'pendente']);
    expect(((await lerChave(page, 'sc_cp')) || []).filter(c => c.categoria === 'comissao' || c.papel_comissao)).toHaveLength(0);
    // chamar de novo nao duplica nem muda
    const n = await page.evaluate(() => { const x = db.pedidos[0]; gerarComissoesPedido(x); gerarComissoesPedido(x); return [x.comissao_historico.length, db.contas_pagar.length]; });
    expect(n).toEqual([1, 0]);
});

test('pagar comissao na tela de vendedores gera a saida e marca o pedido', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_contas_fin: CONTAS, sc_ped: [pedido({ status: 'Instalado' })] });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.click('#tb-comissoes-pendentes button:has-text("Pagar")');
    const modal = page.locator('#com-pag-modal');
    await expect(modal).toBeVisible();
    await modal.locator('#com-pag-data').fill('2026-11-05');
    await modal.locator('#com-pag-conta').selectOption('11');
    await modal.locator('#com-pag-ok').click();
    await expect.poll(async () => ((await lerChave(page, 'sc_mov_fin')) || []).length).toBe(1);
    const mov = (await lerChave(page, 'sc_mov_fin'))[0];
    expect(mov).toMatchObject({ origem: 'comissao', origem_id: 26400, papel: 'vendedor', sentido: 'saida', valor: 50, conta_id: 11, data: '2026-11-05', categoria_id: 'cat_comissoes' });
    expect(((await lerChave(page, 'sc_cp')) || [])).toHaveLength(0);
    const ped = (await lerChave(page, 'sc_ped'))[0];
    expect(ped.comissao_status).toBe('paga');
    expect(ped.comissao_paga).toBe(true);
    expect(ped.comissao_data_pgto).toBe(new Date('2026-11-05T12:00:00').getTime());
    expect(ped.arq_comissao_paga, 'a do arquiteto continua').toBeFalsy();
    await page.click('.vend-tab-btn[data-tab="historico"]');
    await expect(page.locator('#tb-hist-comissoes')).toContainText('R$ 50.00');
});

test('a comissao nao aparece em A Pagar; pagar na tela de vendedores tira da lista de pendentes', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_contas_fin: CONTAS, sc_ped: [pedido({ status: 'Instalado' })] });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await expect(page.locator('#tb-comissoes-pendentes')).toContainText('R$ 50.00');
    await page.evaluate(() => { gerarComissoesPedido(db.pedidos[0]); syncDB(); });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    await expect(page.locator('#tb-contas-pagar tr', { hasText: 'Bruno' })).toHaveCount(0);
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.click('#tb-comissoes-pendentes tr:has-text("Bruno") button:has-text("Pagar")');
    await page.locator('#com-pag-conta').selectOption('11');
    await page.locator('#com-pag-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].comissao_paga).toBe(true);
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await expect(page.locator('#tb-comissoes-pendentes')).not.toContainText('R$ 50.00');
});

test('pagar todas da pessoa', async ({ page }) => {
    const peds = [pedido({ id: 26401, status: 'Instalado' }), pedido({ id: 26402, status: 'Instalado', vendedor_id: 9, vendedor_nome: 'Outro', comissao_valor: 70 }),
        pedido({ id: 26403, status: 'Instalado', comissao_valor: 30 })];
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: [...VEND, { id: 9, nome: 'Outro', comissao_pct: 7, tipo: 'vendedor' }], sc_contas_fin: CONTAS, sc_ped: peds });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.selectOption('#filtro-vend-pendente', '2');
    await page.click('button:has-text("Pagar Todas")');
    const modal = page.locator('#com-pag-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#com-pag-total')).toHaveText('R$ 80,00');
    await modal.locator('#com-pag-data').fill('2026-11-06');
    await modal.locator('#com-pag-conta').selectOption('11');
    await modal.locator('#com-pag-ok').click();
    await expect.poll(async () => ((await lerChave(page, 'sc_mov_fin')) || []).length).toBe(2);
    const movs = (await lerChave(page, 'sc_mov_fin'));
    expect(movs.every(m => m.origem === 'comissao' && m.papel === 'vendedor' && m.data === '2026-11-06' && m.conta_id === 11)).toBe(true);
    expect(movs.map(m => m.valor).sort()).toEqual([30, 50]);
    expect(((await lerChave(page, 'sc_cp')) || [])).toHaveLength(0);
    const ps = await lerChave(page, 'sc_ped');
    expect(ps.find(p => p.id === 26402).comissao_paga, 'de outro vendedor, nao').toBeFalsy();
});

test('Pagar no A Pagar nao usa prompt', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedido({ status: 'Instalado' })],
        sc_cp: [{ id: 801, descricao: 'Aluguel', valor: 300, categoria: 'outro', tipo: 'fixo', status: 'Pendente', data_vencimento: '2099-01-01', data_pagamento: null, credor_nome: 'Imob' }] });
    await page.addInitScript(() => { window.prompt = () => { window.__prompt = true; return null; }; });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    await acaoLanc(page, 'pagar', 'Dar baixa');
    await page.locator('#baixa-modal .baixa-meio').selectOption('PIX');
    await page.locator('#baixa-modal #baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp'))[0].status).toBe('Pago');
    expect(await page.evaluate(() => window.__prompt)).toBeFalsy();
    expect((await lerChave(page, 'sc_cp'))[0].forma_pagamento).toBeTruthy();
});

test('pagar comissao exige permissao (vendedores ou contas a pagar)', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedido({ status: 'Instalado' })] });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].permissoes_extras = { vendedores: { nivel: 'visualizar', acoes_restritas: [] }, 'financeiro.pagar': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.evaluate(() => { pagarComissao(26400); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await expect(page.locator('#com-pag-modal')).toHaveCount(0);
    expect(((await lerChave(page, 'sc_mov_fin')) || [])).toHaveLength(0);
});
