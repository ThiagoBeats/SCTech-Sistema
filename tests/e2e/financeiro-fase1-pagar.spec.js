// Financeiro Fase 1, tarefa 5: pagamentos (A Pagar e comissoes) com meio e
// conta, saida no extrato e estorno de pagamento.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const HOJE = iso(new Date());

const CONTAS = [
    { id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true },
    { id: 11, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true },
    { id: 12, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true,
      cartao: { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 } }
];
const MEIOS = [
    { id: 21, nome: 'Dinheiro', tipo: 'dinheiro', conta_id: 10 },
    { id: 22, nome: 'PIX', tipo: 'pix', conta_id: 11 },
    { id: 25, nome: 'Cartão de débito', tipo: 'cartao_debito', conta_id: 12 },
    { id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: 12 }
];
const VEND = [{ id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' }, { id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' }];
const cp = extra => ({ id: 701, tipo: 'variavel', categoria: 'outro', descricao: 'Aluguel da loja', credor_nome: 'Imobiliaria', valor: 800,
    data_vencimento: '2099-12-10', data_pagamento: null, status: 'Pendente', ...(extra || {}) });
const pedido = extra => ({ id: 26400, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Instalado', financeiro_gerado: true,
    valor: 1000, valor_recebido: 1000, ambientes: [], forma_pagamento: 'PIX', data_instalado: new Date('2026-10-20T12:00:00').getTime(),
    vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50, ...(extra || {}) });
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];

async function abrirPagar(page, dados) {
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_meios_pag: MEIOS, ...dados });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="pagar"]').click();
}

test('pagar conta no PIX gera saida no Banco', async ({ page }) => {
    await abrirPagar(page, { sc_cp: [cp()] });
    await page.locator('#tb-contas-pagar button', { hasText: '✓ Pagar' }).first().click();
    const modal = page.locator('#baixa-modal');
    await expect(modal).toBeVisible();
    const linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'PIX' });
    await expect(linha.locator('.baixa-conta')).toHaveValue('11');
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cp'))[0].status).toBe('Pago');
    const c = (await ler(page, 'sc_cp'))[0];
    expect(c).toMatchObject({ meio_id: 22, conta_id: 11, forma_pagamento: 'PIX', data_pagamento: HOJE });
    const movs = await ler(page, 'sc_mov_fin');
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ conta_id: 11, data: HOJE, sentido: 'saida', valor: 800, origem: 'cp', origem_id: 701 });
});

test('modal de pagar nao oferece cartao e exige escolher o meio', async ({ page }) => {
    await abrirPagar(page, { sc_cp: [cp()] });
    await page.locator('#tb-contas-pagar button', { hasText: '✓ Pagar' }).first().click();
    const modal = page.locator('#baixa-modal');
    const meio = modal.locator('.baixa-linha').first().locator('.baixa-meio');
    const textos = await meio.locator('option').allTextContents();
    expect(textos).toEqual(['Escolha o meio', 'Dinheiro', 'PIX']);
    await modal.locator('#baixa-ok').click();
    await expect(modal).toBeVisible();
    await expect(modal.locator('.baixa-erro').first()).toContainText('Escolha o meio');
    expect((await ler(page, 'sc_cp'))[0].status).toBe('Pendente');
});

test('cartao so oferece conta maquininha (receber)', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_contas_fin: CONTAS, sc_meios_pag: MEIOS, sc_ped: [pedido({ valor_recebido: 0 })],
        sc_cr: [{ id: 601, pedido_id: 26400, cliente_nome: 'Ana Paula Lima', descricao: 'Saldo', valor: 500, data_vencimento: '2099-12-10', status: 'Pendente', parcela_tipo: 'saldo' }] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.locator('#tb-contas-receber button', { hasText: '✓ Recebido' }).first().click();
    const linha = page.locator('#baixa-modal .baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'Cartão de débito' });
    expect(await linha.locator('.baixa-conta option').allTextContents()).toEqual(['— sem conta —', 'Maquininha']);
    await linha.locator('.baixa-meio').selectOption({ label: 'PIX' });
    expect(await linha.locator('.baixa-conta option').allTextContents()).toEqual(['— sem conta —', 'Caixa', 'Banco', 'Maquininha']);
});

test('pagar comissao gera saida e estornar devolve a pendente', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_contas_fin: CONTAS, sc_meios_pag: MEIOS, sc_ped: [pedido()] });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.click('#tb-comissoes-pendentes button:has-text("Pagar")');
    const modal = page.locator('#baixa-modal');
    await modal.locator('.baixa-meio').selectOption({ label: 'PIX' });
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].comissao_paga).toBe(true);
    let movs = await ler(page, 'sc_mov_fin');
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ conta_id: 11, sentido: 'saida', valor: 50, origem: 'cp' });
    await page.click('.vend-tab-btn[data-tab="historico"]');
    await page.locator('#tb-hist-comissoes button', { hasText: '↩ Estornar' }).click();
    await page.locator('.sc-modal-overlay button', { hasText: 'Estornar' }).last().click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].comissao_paga).toBeFalsy();
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.comissao_data_pgto).toBeNull();
    const c = (await ler(page, 'sc_cp')).find(x => x.papel_comissao === 'vendedor');
    expect(c.status).toBe('Atrasado');
    expect(c).toMatchObject({ data_pagamento: null, forma_pagamento: null, meio_id: null, conta_id: null, baixado_em: null });
    expect(c.estornado_em).toBeGreaterThan(0);
    expect(await ler(page, 'sc_mov_fin')).toEqual([]);
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await expect(page.locator('#tb-comissoes-pendentes')).toContainText('R$ 50.00');
});

test('estornar no A Pagar e excluir pago/taxa de cartao sao bloqueados', async ({ page }) => {
    const taxa = { id: 702, tipo: 'variavel', categoria: 'taxa_cartao', descricao: 'Taxa de cartão — X', credor_nome: 'Maquininha', valor: 10,
        data_vencimento: '2026-11-05', data_pagamento: '2026-11-05', status: 'Pago', conta_id: 12, origem_cr_id: 601 };
    const pago = cp({ id: 703, status: 'Pago', data_pagamento: '2026-11-05', conta_id: 11, meio_id: 22, forma_pagamento: 'PIX' });
    await abrirPagar(page, { sc_cp: [taxa, pago],
        sc_mov_fin: [{ id: 1, conta_id: 11, data: '2026-11-05', sentido: 'saida', valor: 800, origem: 'cp', origem_id: 703, grupo_id: null, descricao: 'x' }] });
    const linhaTaxa = page.locator('#tb-contas-pagar tr', { hasText: 'Taxa de cartão' });
    await expect(linhaTaxa.locator('button', { hasText: 'Estornar' })).toHaveCount(0);
    await linhaTaxa.locator('button[title="Excluir"]').click();
    await expect(page.locator('.sc-modal-overlay')).toContainText('A taxa do cartão sai pelo estorno do recebimento.');
    await page.locator('.sc-modal-overlay button').last().click();
    const linhaPaga = page.locator('#tb-contas-pagar tr', { hasText: 'Aluguel' });
    await linhaPaga.locator('button[title="Excluir"]').click();
    await expect(page.locator('.sc-modal-overlay')).toContainText('Estorne o pagamento antes de excluir.');
    await page.locator('.sc-modal-overlay button').last().click();
    expect(await ler(page, 'sc_cp')).toHaveLength(2);
    // estornar a conta paga comum
    await linhaPaga.locator('button', { hasText: 'Estornar' }).click();
    await page.locator('.sc-modal-overlay button', { hasText: 'Estornar' }).last().click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).find(x => x.id === 703).status).toBe('Pendente');
    expect(await ler(page, 'sc_mov_fin')).toEqual([]);
});

test('pagar varias comissoes de uma vez, mesma data e meio', async ({ page }) => {
    const peds = [pedido({ id: 26401 }), pedido({ id: 26402, comissao_valor: 70 })];
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_contas_fin: CONTAS, sc_meios_pag: MEIOS, sc_ped: peds });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.click('button:has-text("Pagar Todas")');
    const modal = page.locator('#baixa-modal');
    await modal.locator('#baixa-data').fill('2026-11-05');
    const meios = modal.locator('.baixa-meio');
    await expect(meios).toHaveCount(2);
    await meios.nth(0).selectOption({ label: 'Dinheiro' });
    await meios.nth(1).selectOption({ label: 'Dinheiro' });
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped')).every(p => p.comissao_paga)).toBe(true);
    const movs = await ler(page, 'sc_mov_fin');
    expect(movs.map(m => [m.conta_id, m.data, m.valor, m.sentido]).sort()).toEqual([[10, '2026-11-05', 50, 'saida'], [10, '2026-11-05', 70, 'saida']]);
    expect(new Set(movs.map(m => m.id)).size).toBe(2);
});
