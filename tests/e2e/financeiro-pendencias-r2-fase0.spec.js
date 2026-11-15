// Pendencias R2, tarefa 1: telas e textos da Fase 0 (pedido, comissao e baixa).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const ped = extra => ({ id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Medição', financeiro_gerado: true,
    valor: 1000, valor_recebido: 0, ambientes: [], forma_pagamento: 'PIX', ...(extra || {}) });
const cr = (id, status, extra) => ({ id, pedido_id: 26500, cliente_nome: 'Ana', descricao: 'Parcela ' + id, valor: 500,
    data_vencimento: '2026-10-01', data_pagamento: status === 'Pago' ? '2026-10-01' : null, status, ...(extra || {}) });

test('confirmar pagamento com tudo pago avisa em vez de abrir a baixa vazia', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Aguardando Financeiro', valor_recebido: 1000 })], sc_cr: [cr(601, 'Pago'), cr(602, 'Pago')] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { confirmarPagamentoPedido(26500); });
    await expect(page.locator('#sc-modal-msg')).toHaveText('Todas as parcelas deste pedido já estão pagas.');
    await expect(page.locator('#baixa-modal')).toHaveCount(0);
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).toBe('Instalado');
});

test('confirmar pagamento com tudo pago: cancelar deixa o pedido como esta', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Aguardando Financeiro', valor_recebido: 1000 })], sc_cr: [cr(601, 'Pago')] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { confirmarPagamentoPedido(26500); });
    await expect(page.locator('#sc-modal-msg')).toContainText('já estão pagas');
    await page.locator('#sc-modal-cancel').click();
    expect((await lerChave(page, 'sc_ped'))[0].status).toBe('Aguardando Financeiro');
});

test('comissao: a forma comeca em branco e e obrigatoria ao pagar', async ({ page }) => {
    const cp = { id: 701, pedido_id: 26500, descricao: 'Comissão', credor_nome: 'Bruno', valor: 50, categoria: 'comissao', papel_comissao: 'vendedor',
        data_vencimento: '2026-10-20', data_pagamento: null, status: 'Pendente', tipo: 'variavel' };
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: [{ id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' }],
        sc_formas_pag: [{ nome: '50% entrada + 50% na instalação', desconto: 0, entrada: 50 }],
        sc_ped: [ped({ status: 'Instalado', valor_recebido: 1000, vendedor_id: 2, vendedor_nome: 'Bruno', comissao_valor: 50, comissao_pct: 5 })], sc_cp: [cp] });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await page.locator('#tb-comissoes-pendentes button', { hasText: 'Pagar' }).click();
    const meio = page.locator('#baixa-modal .baixa-meio');
    await expect(meio).toHaveValue('');
    await page.locator('#baixa-ok').click();
    await expect(page.locator('#baixa-modal .baixa-erro')).toContainText('Escolha');
    expect((await lerChave(page, 'sc_cp'))[0].status).toBe('Pendente');
});

test('sem permissao de contas a pagar a janela de gerar conta do pedido de compra nem abre', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: [{ id: 7, nome: 'RC Tecidos' }], sc_cp: [],
        sc_pc: [{ id: 5001, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', data_criacao: Date.now(), status: 'Enviado',
            itens: [{ tipo: 'tecido', item_id: 1, item_nome: 'TRICO', unidade: 'm', quantidade: 10, preco_unit: 100, subtotal: 1000 }] }] });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].permissoes_extras = { 'financeiro.pagar': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
    await page.evaluate(() => { atualizarStatusPC(5001, 'Recebido'); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await expect(page.locator('#pcp-modal')).toHaveCount(0);
    await page.locator('#sc-modal-ok').click();
    expect(await lerChave(page, 'sc_cp')).toHaveLength(0);
    await expect(page.locator('#tb-pedidos-compra')).toContainText('sem conta a pagar');
});

test('voltar para Orcamento cita as comissoes pendentes que saem', async ({ page }) => {
    const cp = (id, status) => ({ id, pedido_id: 26500, descricao: 'Comissão', credor_nome: 'Bruno', valor: 50, categoria: 'comissao', papel_comissao: id === 701 ? 'vendedor' : 'arquiteto',
        data_vencimento: '2026-10-20', data_pagamento: status === 'Pago' ? '2026-10-25' : null, status, tipo: 'variavel' });
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Medição' })], sc_cr: [cr(601, 'Pendente', { valor: 1000 })],
        sc_cp: [cp(701, 'Pendente'), cp(702, 'Pendente')], sc_editando_id: 26500 });
    await page.goto(BASE + '/pedido.html');
    await page.click('#ped-voltar-orcamento');
    await expect(page.locator('#sc-modal-msg')).toContainText('As 2 comissões pendentes deste pedido serão removidas.');
    await page.locator('#sc-modal-cancel').click();
});

test('voltar para Orcamento sem comissao pendente nao fala de comissao', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Medição' })], sc_cr: [cr(601, 'Pendente', { valor: 1000 })], sc_editando_id: 26500 });
    await page.goto(BASE + '/pedido.html');
    await page.click('#ped-voltar-orcamento');
    await expect(page.locator('#sc-modal-msg')).toContainText('Voltar o pedido');
    await expect(page.locator('#sc-modal-msg')).not.toContainText('comiss');
    await page.locator('#sc-modal-cancel').click();
});

test('reaprovar com entrada paga em parte: a descricao mostra o % que falta', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI,
        sc_ped: [ped({ status: 'Orçamento', financeiro_gerado: false, forma_pagamento: '50% entrada + 50% na instalação', entrada_pct: 50, data_entrega: '2099-12-01' })],
        sc_cr: [cr(601, 'Pago', { valor: 200, parcela_tipo: 'entrada' })] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { gerarFinanceiroPedido(db.pedidos.find(p => p.id === 26500)); });
    const lista = (await page.evaluate(() => db.contas_receber.filter(c => c.pedido_id === 26500 && c.parcela_tipo === 'entrada' && c.status !== 'Pago'))).map(c => [c.descricao, c.valor]);
    expect(lista).toEqual([['Entrada (30%) — Pedido #' + (await page.evaluate(() => formatPedidoId(26500))), 300]]);
});

test('aliquota 0 e 6,5 voltam como foram digitadas', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { aliquota_estimada: 0 } });
    await page.goto(BASE + '/empresa.html');
    await expect(page.locator('#emp-aliquota')).toHaveValue('0');
    await page.evaluate(() => { localStorage.setItem('sc_empresa', JSON.stringify({ aliquota_estimada: 6.5 })); });
    await page.reload();
    await expect(page.locator('#emp-aliquota')).toHaveValue('6,5');
});

test('"Entrada de 30%" no nome da forma vale 30%', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/pcp.html');
    const r = await page.evaluate(() => ['Entrada de 30% + saldo', 'entrada 40%', '30% de entrada', '50% entrada', 'À vista', 'PIX', 'Entrada de 12,5%'].map(n => FinanceiroCore.entradaPctDoNome(n)));
    expect(r).toEqual([30, 40, 30, 50, 100, 50, 12.5]);
});

test('desmarcar o unico item da baixa desabilita Confirmar e avisa', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Aguardando Financeiro' })], sc_cr: [cr(601, 'Pendente', { valor: 1000 })] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { confirmarPagamentoPedido(26500); });
    const modal = page.locator('#baixa-modal');
    await expect(modal.locator('#baixa-ok')).toBeEnabled();
    await expect(modal.locator('#baixa-erro-nenhum')).toBeHidden();
    await modal.locator('.baixa-check').uncheck();
    await expect(modal.locator('#baixa-ok')).toBeDisabled();
    await expect(modal.locator('#baixa-erro-nenhum')).toHaveText('Marque pelo menos um item.');
    await expect(modal).toBeVisible();
    await modal.locator('.baixa-check').check();
    await expect(modal.locator('#baixa-ok')).toBeEnabled();
});

test('selo do DRE usa variavel de CSS com cor propria no tema escuro', async ({ page }) => {
    const CAT = [{ id: 7, nome: 'Linho Bege', preco_custo: 20, preco_venda: 100 }];
    await entrar(page, BASE, { sc_cli: CLI, sc_cat: CAT, sc_ped: [ped({ ambientes: [{ nome: 'Sala', tecidos: [{ tecidoId: 7, nome: 'Linho Bege', consumo_linear: 10 }] }] })] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    const selo = page.locator('#tb-dre td div', { hasText: 'custo' }).first();
    await expect(selo).toBeVisible();
    const cor = () => selo.evaluate(el => getComputedStyle(el).color);
    const claro = await cor();
    expect(claro).toBe('rgb(178, 106, 0)');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dre-selo-aviso').trim().toLowerCase())).toBe('#b26a00');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    expect(await cor()).not.toBe(claro);
});
