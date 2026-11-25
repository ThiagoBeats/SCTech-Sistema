// Pendencias R1, tarefa 2: pedido, comissao e pedido de compra.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const FORN = [{ id: 7, nome: 'RC Tecidos', cnpj: '11.222.333/0001-81' }];
const ped = extra => ({ id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Medição', financeiro_gerado: true,
    valor: 1000, valor_recebido: 0, ambientes: [], forma_pagamento: 'PIX', ...(extra || {}) });
const pc = extra => ({ id: 5001, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', data_criacao: Date.now(), status: 'Recebido', conta_pagar_gerada: true,
    itens: [{ tipo: 'tecido', item_id: 1, item_nome: 'TRICO', unidade: 'm', quantidade: 10, preco_unit: 100, subtotal: 1000 }], ...(extra || {}) });
const cpPC = (id, status, extra) => ({ id, pedido_compra_id: 5001, pedido_id: null, descricao: 'Pedido de compra #5001', credor_nome: 'RC Tecidos',
    categoria: 'tecido', valor: 500, data_vencimento: '2099-01-10', data_pagamento: status === 'Pago' ? '2026-11-01' : null, status, tipo: 'variavel', ...(extra || {}) });

test('confirmar pagamento sem parcelas mantem o valor recebido digitado', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Aguardando Financeiro', valor_recebido: 400 })], sc_cr: [] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { confirmarPagamentoPedido(26500); });
    await page.locator('#baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).toBe('Instalado');
    expect((await lerChave(page, 'sc_ped'))[0].valor_recebido).toBe(400);
});

test('reaprovar com valor pago maior que o novo valor avisa e nao gera conta', async ({ page }) => {
    const cr = { id: 601, pedido_id: 26500, cliente_nome: 'Ana', descricao: 'Entrada', valor: 1000, data_vencimento: '2026-10-01', data_pagamento: '2026-10-01', status: 'Pago', parcela_tipo: 'entrada' };
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Orçamento', financeiro_gerado: false, valor: 800, vendedor_nome: 'Bruno', data_entrega: '2099-12-01' })], sc_cr: [cr] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { aprovarPedido(26500); });
    await page.locator('#sc-modal-ok').click();
    const msg = page.locator('#sc-modal-msg');
    await expect(msg).toContainText('O cliente já pagou R$ 1.000,00, mais que o novo valor do pedido (R$ 800,00). Devolva R$ 200,00 ou ajuste o pedido.');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).toBe('Medição');
    expect(await lerChave(page, 'sc_cr')).toHaveLength(1);
});

test('comissao paga perde a marca de pedido cancelado ao chegar de novo em Instalado', async ({ page }) => {
    const cp = { id: 701, pedido_id: 26500, descricao: 'Comissão', credor_nome: 'Bruno', valor: 50, categoria: 'comissao', papel_comissao: 'vendedor',
        data_vencimento: '2026-10-20', data_pagamento: '2026-10-25', status: 'Pago', tipo: 'variavel', pedido_cancelado: true };
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Aguardando Financeiro', valor_recebido: 1000, vendedor_id: 2, vendedor_nome: 'Bruno', comissao_valor: 50, comissao_pct: 5 })],
        sc_vend: [{ id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' }],
        sc_cr: [{ id: 601, pedido_id: 26500, cliente_nome: 'Ana', descricao: 'x', valor: 1000, data_vencimento: '2026-10-01', data_pagamento: '2026-10-01', status: 'Pago' }],
        sc_cp: [cp] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { confirmarPagamentoPedido(26500); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).toBe('Instalado');
    const cps = await lerChave(page, 'sc_cp');
    expect(cps.find(c => c.id === 701).pedido_cancelado).toBeUndefined();
});

test('comissao RT antiga pendente (migrada para o pedido) aparece e e paga em Vendedores (aba Arquitetos)', async ({ page }) => {
    const rt = { id: 801, pedido_id: 26500, descricao: 'RT Studio', credor_nome: 'Studio M', valor: 70, categoria: 'comissao_rt',
        data_vencimento: '2026-10-20', data_pagamento: null, status: 'Pendente', tipo: 'variavel' };
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: [{ id: 3, nome: 'Studio M', comissao_pct: 7, tipo: 'arquiteto' }],
        sc_contas_fin: [{ id: 1, nome: 'Banco A', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', ativo: true }],
        sc_ped: [ped({ status: 'Instalado', valor_recebido: 1000, arquiteto_nome: 'Studio M', rt_pct: 7 })], sc_cp: [rt] });
    // A migracao das comissoes leva a RT (so conta) para o pedido; a conta em aberto sai do Financeiro.
    await page.evaluate(() => localStorage.removeItem('sc_comissao_v2'));
    await page.goto(BASE + '/vendedores.html');
    await page.locator('.vend-tipo-btn[data-tipo="arquiteto"]').click();
    await page.locator('.vend-tab-btn[data-tab="pendentes"]').click();
    const linha = page.locator('#tb-comissoes-pendentes tr');
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText('Studio M');
    await expect(linha).toContainText('70.00');
    expect(await lerChave(page, 'sc_cp')).toHaveLength(0);
    await linha.locator('button', { hasText: 'Pagar' }).click();
    await page.locator('#com-pag-conta').selectOption('1');
    await page.locator('#com-pag-ok').click();
    await expect.poll(async () => ((await lerChave(page, 'sc_mov_fin')) || []).length).toBe(1);
    expect((await lerChave(page, 'sc_mov_fin'))[0]).toMatchObject({ origem: 'comissao', papel: 'arquiteto', valor: 70 });
    expect((await lerChave(page, 'sc_ped'))[0]).toMatchObject({ arq_comissao_status: 'paga', arq_comissao_valor: 70, arq_nome: 'Studio M' });
});

test('excluir pedido de compra com conta paga: bloqueia', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: [pc()], sc_cp: [cpPC(9001, 'Pago'), cpPC(9002, 'Pendente')] });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
    await page.evaluate(() => { excluirPedidoCompra(5001); });
    await expect(page.locator('#sc-modal-msg')).toContainText('Este pedido tem conta paga. Estorne o pagamento antes de excluir.');
    await page.locator('#sc-modal-ok').click();
    expect(await lerChave(page, 'sc_pc')).toHaveLength(1);
    expect(await lerChave(page, 'sc_cp')).toHaveLength(2);
});

test('excluir pedido de compra com contas em aberto: confirma e apaga junto', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: [pc(), pc({ id: 5002 })], sc_cp: [cpPC(9001, 'Pendente'), cpPC(9002, 'Pendente'), cpPC(9003, 'Pendente', { pedido_compra_id: 5002 })] });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
    await page.evaluate(() => { excluirPedidoCompra(5001); });
    await expect(page.locator('#sc-modal-msg')).toContainText('Excluir o pedido #5001 e as 2 contas a pagar dele?');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_pc')).length).toBe(1);
    expect((await lerChave(page, 'sc_cp')).map(c => c.id)).toEqual([9003]);
});

test('excluir pedido de compra sem contas: confirmacao de sempre', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: [pc({ conta_pagar_gerada: false })], sc_cp: [] });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
    await page.evaluate(() => { excluirPedidoCompra(5001); });
    await expect(page.locator('#sc-modal-msg')).toContainText('Excluir este pedido de compra?');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_pc')).length).toBe(0);
});

test('vincular nota a conta existente atualiza o tipo de lancamento', async ({ page }) => {
    const cp = cpPC(9001, 'Pendente', { cnpj_fornecedor: '11.222.333/0001-81', valor: 1000 });
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: [pc()], sc_cp: [cp] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    await page.evaluate(() => {
        abrirModalContaPagar('manual');
        document.getElementById('cpm-descricao').value = 'NF 123';
        document.getElementById('cpm-cnpj').value = '11.222.333/0001-81';
        document.getElementById('cpm-credor').value = 'RC Tecidos';
        document.getElementById('cpm-valor').value = '1000.00';
        document.getElementById('cpm-vencimento').value = '2099-01-10';
        document.getElementById('cpm-doc').value = '123456';
        adicionarContaPagarManual();
    });
    await page.locator('#sc-modal-btns button', { hasText: 'Vincular à conta existente' }).click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp'))[0].numero_documento).toBe('123456');
    expect((await lerChave(page, 'sc_cp'))[0].tipo_lancamento).toBe('nota');
});
