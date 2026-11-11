// Financeiro Fase 1, tarefa 4: baixa de recebimento por parcela, com meio,
// conta, cartao (repasses + taxa paga) e valor parcial; estorno desfaz tudo.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somarDias = (dataISO, dias) => { const d = new Date(dataISO + 'T12:00:00'); d.setDate(d.getDate() + dias); return iso(d); };
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
    { id: 23, nome: 'Transferência', tipo: 'transferencia', conta_id: 11 },
    { id: 24, nome: 'Boleto', tipo: 'boleto', conta_id: 11 },
    { id: 25, nome: 'Cartão de débito', tipo: 'cartao_debito', conta_id: 12 },
    { id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: 12 }
];
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const pedido = extra => ({ id: 26300, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Instalado', financeiro_gerado: true,
    valor: 3000, valor_recebido: 0, pagamento_pendente: false, forma_pagamento: 'PIX', ambientes: [], ...(extra || {}) });
const cr = extra => ({ id: 601, pedido_id: 26300, cliente_nome: 'Ana Paula Lima', descricao: 'Pedido #26300 - Saldo', valor: 3000,
    data_vencimento: '2099-12-10', data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });

async function abrirReceber(page, dados) {
    await entrar(page, BASE, { sc_cli: CLI, sc_contas_fin: CONTAS, sc_meios_pag: MEIOS, sc_ped: [pedido()], ...dados });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
}

async function receber(page) {
    await page.locator('#tb-contas-receber button', { hasText: '✓ Recebido' }).first().click();
    const modal = page.locator('#baixa-modal');
    await expect(modal).toBeVisible();
    return modal;
}

test('PIX gera entrada no Banco', async ({ page }) => {
    await abrirReceber(page, { sc_cr: [cr({ valor: 500 })] });
    const modal = await receber(page);
    await modal.locator('.baixa-linha').first().locator('.baixa-meio').selectOption({ label: 'PIX' });
    await expect(modal.locator('.baixa-linha').first().locator('.baixa-conta')).toHaveValue('11');
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].status).toBe('Pago');
    const c = (await ler(page, 'sc_cr'))[0];
    expect(c.meio_id).toBe(22);
    expect(c.conta_id).toBe(11);
    expect(c.forma_pagamento).toBe('PIX');
    expect(c.cartao).toBeNull();
    const movs = await ler(page, 'sc_mov_fin');
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ conta_id: 11, data: HOJE, sentido: 'entrada', valor: 500, origem: 'cr', origem_id: 601 });
    expect((await ler(page, 'sc_ped'))[0].valor_recebido).toBe(500);
});

test('cartao credito 3x gera 3 entradas e 3 taxas pagas, nada no saldo de hoje', async ({ page }) => {
    await abrirReceber(page, { sc_cr: [cr()], sc_cp: [] });
    const modal = await receber(page);
    const linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'Cartão de crédito' });
    await expect(linha.locator('.baixa-conta')).toHaveValue('12');
    await linha.locator('.baixa-vezes').selectOption('3');
    await expect(linha.locator('.baixa-antecipar')).not.toBeChecked();
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].status).toBe('Pago');
    const c = (await ler(page, 'sc_cr'))[0];
    expect(c.cartao).toEqual({ tipo: 'credito', vezes: 3, antecipar: false });
    expect(c.forma_pagamento).toBe('Cartão de crédito');
    const movs = await ler(page, 'sc_mov_fin');
    const entradas = movs.filter(m => m.sentido === 'entrada');
    const saidas = movs.filter(m => m.sentido === 'saida');
    expect(entradas.map(m => [m.conta_id, m.data, m.valor, m.origem, m.origem_id])).toEqual([
        [12, somarDias(HOJE, 30), 1000, 'cr', 601], [12, somarDias(HOJE, 60), 1000, 'cr', 601], [12, somarDias(HOJE, 90), 1000, 'cr', 601]]);
    const cps = await ler(page, 'sc_cp');
    expect(cps).toHaveLength(3);
    cps.forEach((cp, i) => {
        expect(cp).toMatchObject({ categoria: 'taxa_cartao', tipo: 'variavel', status: 'Pago', valor: 40, conta_id: 12, origem_cr_id: 601,
            credor_nome: 'Maquininha', data_pagamento: somarDias(HOJE, 30 * (i + 1)), data_vencimento: somarDias(HOJE, 30 * (i + 1)) });
        expect(cp.descricao).toBe('Taxa de cartão — Pedido #26300 - Saldo');
        const s = saidas.find(m => m.origem_id === cp.id);
        expect(s).toMatchObject({ origem: 'cp', conta_id: 12, valor: 40, data: cp.data_pagamento });
    });
    expect(saidas).toHaveLength(3);
    expect(new Set(movs.map(m => m.grupo_id)).size).toBe(1);
    expect(movs[0].grupo_id).not.toBeNull();
    const saldo = await page.evaluate(h => CaixaCore.saldoConta(getContasFin()[2], db.movimentos_fin, h), HOJE);
    expect(saldo).toBe(0);
});

test('entrada PIX e saldo cartao na mesma baixa, cada linha com seu meio', async ({ page }) => {
    const crs = [
        cr({ id: 701, descricao: 'Pedido #26300 - Entrada', valor: 500, parcela_tipo: 'entrada', data_vencimento: '2099-11-01' }),
        cr({ id: 702, descricao: 'Pedido #26300 - Saldo', valor: 500, data_vencimento: '2099-12-01',
             meio_previsto: { meio_id: 26, vezes: 2, antecipar: false } })
    ];
    await entrar(page, BASE, { sc_cli: CLI, sc_contas_fin: CONTAS, sc_meios_pag: MEIOS, sc_cr: crs,
        sc_ped: [pedido({ valor: 1000, status: 'Aguardando Financeiro' })] });
    await page.goto(BASE + '/pcp.html');
    await page.locator('.kanban-btn-pagamento').click();
    const modal = page.locator('#baixa-modal');
    await expect(modal.locator('.baixa-linha')).toHaveCount(2);
    const ent = modal.locator('.baixa-linha', { hasText: 'Entrada' });
    const sal = modal.locator('.baixa-linha', { hasText: 'Saldo' });
    await expect(sal.locator('.baixa-meio')).toHaveValue('26');
    await expect(sal.locator('.baixa-vezes')).toHaveValue('2');
    await ent.locator('.baixa-meio').selectOption({ label: 'PIX' });
    await expect(ent.locator('.baixa-vezes')).toBeHidden();
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].status).toBe('Instalado');
    const lidas = await ler(page, 'sc_cr');
    const e = lidas.find(c => c.id === 701), s = lidas.find(c => c.id === 702);
    expect([e.status, e.meio_id, e.conta_id, e.cartao]).toEqual(['Pago', 22, 11, null]);
    expect([s.status, s.meio_id, s.conta_id]).toEqual(['Pago', 26, 12]);
    expect(s.cartao).toEqual({ tipo: 'credito', vezes: 2, antecipar: false });
    const movs = await ler(page, 'sc_mov_fin');
    expect(movs.filter(m => m.conta_id === 11).map(m => m.valor)).toEqual([500]);
    expect(movs.filter(m => m.conta_id === 12 && m.sentido === 'entrada').map(m => m.valor)).toEqual([250, 250]);
    expect((await ler(page, 'sc_ped'))[0].valor_recebido).toBe(1000);
});

test('parcial: paga 1000 de 3000 deixa parcela de 2000 aberta com mesmo vencimento', async ({ page }) => {
    const mp = { meio_id: 22, vezes: 1, antecipar: false };
    await abrirReceber(page, { sc_cr: [cr({ meio_previsto: mp })] });
    const modal = await receber(page);
    const linha = modal.locator('.baixa-linha').first();
    await expect(linha.locator('.baixa-meio')).toHaveValue('22');
    await linha.locator('.baixa-valor').fill('1.000');   // ponto de milhar
    await expect(modal.locator('#baixa-total')).toContainText('1.000,00');
    await linha.locator('.baixa-meio').selectOption({ label: 'Dinheiro' });
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).length).toBe(2);
    const [aberta, paga] = await ler(page, 'sc_cr');
    expect(aberta).toMatchObject({ id: 601, valor: 2000, status: 'Pendente', data_vencimento: '2099-12-10', data_pagamento: null });
    expect(paga).toMatchObject({ valor: 1000, status: 'Pago', parcela_origem_id: 601, pedido_id: 26300, descricao: 'Pedido #26300 - Saldo',
        data_vencimento: '2099-12-10', parcela_tipo: 'saldo', meio_previsto: mp, meio_id: 21, conta_id: 10, forma_pagamento: 'Dinheiro' });
    expect(paga.id).not.toBe(601);
    const movs = await ler(page, 'sc_mov_fin');
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ conta_id: 10, valor: 1000, origem: 'cr', origem_id: paga.id });
    expect((await ler(page, 'sc_ped'))[0].valor_recebido).toBe(1000);
});

test('estorno da parcial junta de volta 3000', async ({ page }) => {
    await abrirReceber(page, {
        sc_cr: [cr({ valor: 2000 }), cr({ id: 602, valor: 1000, status: 'Pago', data_pagamento: HOJE, parcela_origem_id: 601,
            meio_id: 21, conta_id: 10, cartao: null, forma_pagamento: 'Dinheiro' })],
        sc_mov_fin: [{ id: 900, conta_id: 10, data: HOJE, sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 602, grupo_id: 901, descricao: 'x' }],
        sc_ped: [pedido({ valor_recebido: 1000 })]
    });
    await page.locator('#tb-contas-receber button', { hasText: 'Estornar' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).length).toBe(1);
    const [c] = await ler(page, 'sc_cr');
    expect(c).toMatchObject({ id: 601, valor: 3000, status: 'Pendente' });
    expect(c.estornado_por).toBe(1);
    expect(await ler(page, 'sc_mov_fin')).toEqual([]);
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.valor_recebido).toBe(0);
    expect(ped.pagamento_pendente).toBe(true);
});

test('estorno da parcial com a parte aberta ja paga volta a ficar aberta sozinha', async ({ page }) => {
    await abrirReceber(page, {
        sc_cr: [cr({ valor: 2000, status: 'Pago', data_pagamento: HOJE }),
                cr({ id: 602, valor: 1000, status: 'Pago', data_pagamento: HOJE, parcela_origem_id: 601, meio_id: 21, conta_id: 10, forma_pagamento: 'Dinheiro' })],
        sc_ped: [pedido({ valor_recebido: 3000 })]
    });
    await page.evaluate(() => { estornarCR(602); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).find(c => c.id === 602).status).toBe('Pendente');
    const lidas = await ler(page, 'sc_cr');
    expect(lidas).toHaveLength(2);
    expect(lidas.find(c => c.id === 601)).toMatchObject({ valor: 2000, status: 'Pago' });
    expect(lidas.find(c => c.id === 602)).toMatchObject({ valor: 1000, meio_id: null, conta_id: null, cartao: null });
});

test('data anterior ao saldo inicial avisa e nao gera movimento', async ({ page }) => {
    await abrirReceber(page, { sc_cr: [cr({ valor: 500 })] });
    const modal = await receber(page);
    const linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'PIX' });
    await expect(linha.locator('.baixa-aviso')).toBeHidden();
    await modal.locator('#baixa-data').fill('2026-10-15');
    await expect(linha.locator('.baixa-aviso')).toHaveText('Esta conta ainda não está configurada / data anterior ao saldo inicial — não entra no saldo');
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].status).toBe('Pago');
    const c = (await ler(page, 'sc_cr'))[0];
    expect(c.data_pagamento).toBe('2026-10-15');
    expect(c.forma_pagamento).toBe('PIX');
    expect(await ler(page, 'sc_mov_fin')).toEqual([]);
});

test('estorno de cartao com repasse caido avisa e remove tudo', async ({ page }) => {
    const d1 = somarDias(HOJE, -1), d2 = somarDias(HOJE, 29);
    const outraCp = { id: 50, descricao: 'Aluguel', valor: 900, data_vencimento: '2099-01-10', status: 'Pendente', tipo: 'fixo', categoria: 'aluguel' };
    const taxa = (id, data) => ({ id, tipo: 'variavel', categoria: 'taxa_cartao', descricao: 'Taxa de cartão — Pedido #26300 - Saldo', credor_nome: 'Maquininha',
        valor: 60, data_vencimento: data, data_pagamento: data, status: 'Pago', conta_id: 12, origem_cr_id: 601 });
    const mov = (id, data, sentido, valor, origem, origem_id) => ({ id, conta_id: 12, data, sentido, valor, origem, origem_id, grupo_id: 999, descricao: 'x' });
    await abrirReceber(page, {
        sc_cr: [cr({ status: 'Pago', data_pagamento: somarDias(HOJE, -31), meio_id: 26, conta_id: 12, forma_pagamento: 'Cartão de crédito',
            cartao: { tipo: 'credito', vezes: 2, antecipar: false } })],
        sc_cp: [outraCp, taxa(51, d1), taxa(52, d2)],
        sc_mov_fin: [mov(91, d1, 'entrada', 1500, 'cr', 601), mov(92, d1, 'saida', 60, 'cp', 51),
                     mov(93, d2, 'entrada', 1500, 'cr', 601), mov(94, d2, 'saida', 60, 'cp', 52),
                     { id: 95, conta_id: 11, data: d1, sentido: 'entrada', valor: 10, origem: 'cr', origem_id: 777, grupo_id: null, descricao: 'outro' }],
        sc_ped: [pedido({ valor_recebido: 3000 })]
    });
    await page.locator('#tb-contas-receber button', { hasText: 'Estornar' }).click();
    await expect(page.locator('#sc-modal-msg')).toContainText('Isso muda o saldo de hoje da conta Maquininha.');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].status).toBe('Pendente');
    expect((await ler(page, 'sc_mov_fin')).map(m => m.id)).toEqual([95]);
    expect((await ler(page, 'sc_cp')).map(c => c.id)).toEqual([50]);
    const c = (await ler(page, 'sc_cr'))[0];
    expect(c.cartao).toBeNull();
    expect(c.meio_id).toBeNull();
});

test('valor maior que a parcela mostra erro dentro do modal', async ({ page }) => {
    await abrirReceber(page, { sc_cr: [cr()] });
    const modal = await receber(page);
    const linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-valor').fill('3500');
    await modal.locator('#baixa-ok').click();
    await expect(modal).toBeVisible();
    await expect(linha.locator('.baixa-erro')).toContainText('não pode passar de R$ 3.000,00');
    await expect(page.locator('#sc-modal-msg')).toHaveCount(0);
    expect((await ler(page, 'sc_cr'))[0].status).toBe('Pendente');
    await linha.locator('.baixa-valor').fill('0');
    await expect(linha.locator('.baixa-erro')).toContainText('maior que zero');
    await linha.locator('.baixa-valor').fill('3000');
    await expect(linha.locator('.baixa-erro')).toBeHidden();
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].status).toBe('Pago');
    expect(await ler(page, 'sc_cr')).toHaveLength(1);
});

test('sem contas configuradas a baixa funciona, avisa uma vez e nao gera movimento', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedido()], sc_cr: [cr({ valor: 500 }), cr({ id: 602, valor: 700 })] });
    await page.evaluate(() => { localStorage.removeItem('sc_contas_fin'); localStorage.removeItem('sc_meios_pag'); });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { confirmarRecebimentoTeste = abrirModalBaixa({ titulo: 't', itens: db.contas_receber.map(c => ({ id: c.id, descricao: c.descricao, valor: c.valor, marcado: true })), permiteParcial: true })
        .then(r => { if (r) { baixarContasReceber(r.data, r.linhas); syncDB(); } }); });
    const modal = page.locator('#baixa-modal');
    await expect(modal.locator('#baixa-aviso-geral')).toBeVisible();
    await expect(modal.locator('.baixa-aviso:visible')).toHaveCount(0);
    await modal.locator('.baixa-linha').first().locator('.baixa-meio').selectOption({ label: 'PIX' });
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).every(c => c.status === 'Pago')).toBe(true);
    const lidas = await ler(page, 'sc_cr');
    expect(lidas[0].forma_pagamento).toBe('PIX');
    expect(lidas[1].forma_pagamento).toBe('Dinheiro');
    expect(lidas.every(c => c.conta_id == null && c.meio_id == null)).toBe(true);
    expect(await ler(page, 'sc_mov_fin')).toEqual([]);
});
