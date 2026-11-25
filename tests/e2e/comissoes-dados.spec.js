// Comissoes como registro do pedido (registrada -> pendente -> paga), sem contas a pagar:
// estados nos caminhos de status, pagamento manual que gera a saida (origem 'comissao') vista pelo Financeiro,
// desfazer pagamento e a migracao unica sc_comissao_v2. Relogio fixo: 25/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 25, 10, 0, 0);
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const VEND = [
    { id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' },
    { id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' },
];
const CONTAS = [{ id: 1, nome: 'Banco A', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01', ativo: true }];
const DATA_INST = new Date('2026-10-20T12:00:00').getTime();

const pedido = (extra) => ({ id: 26600, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Instalado', financeiro_gerado: true,
    valor: 1000, valor_recebido: 1000, ambientes: [], forma_pagamento: 'PIX', data_instalado: DATA_INST, data_entrega: '2026-10-25',
    vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50,
    arq_id: 3, arq_nome: 'Studio M', arq_comissao_pct: 10, arq_comissao_valor: 100, ...(extra || {}) });
const pendente = () => pedido({ comissao_status: 'pendente', arq_comissao_status: 'pendente' });
const cr = () => [{ id: 501, pedido_id: 26600, cliente_nome: 'Ana Paula Lima', descricao: 'Pagamento', valor: 1000, data_vencimento: '2026-10-01', data_pagamento: '2026-10-01', status: 'Pago', parcela_tipo: 'unica' }];
const saldo = page => page.evaluate(() => CaixaCore.saldoConta(getContasFin()[0], db.movimentos_fin, '2026-11-25'));
const ITENS = [{ pedidoId: 26600, papel: 'vendedor' }, { pedidoId: 26600, papel: 'arquiteto' }];

async function abrir(page, dados, url) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_contas_fin: CONTAS, ...dados });
    await page.goto(BASE + (url || '/vendedores.html'));
}

test('aprovar registra a comissao; instalar deixa pendente sem criar conta a pagar; voltar de Instalado volta a registrada', async ({ page }) => {
    await abrir(page, { sc_ped: [pedido({ status: 'Orçamento', financeiro_gerado: false, valor_recebido: 0, data_instalado: undefined })] }, '/index.html');
    await page.evaluate(() => { aprovarPedido(26600); });
    await page.locator('#sc-modal-ok').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_ped'))[0].status === 'Medição');
    let p = (await ler(page, 'sc_ped'))[0];
    expect([p.comissao_status, p.arq_comissao_status]).toEqual(['registrada', 'registrada']);
    expect(p.comissao_historico[0].acao).toBe('registrada');
    // Instalado: pendente, e nenhuma conta a pagar de comissao
    await page.waitForFunction(() => typeof db !== 'undefined' && db.pedidos[0].status === 'Medição');
    await page.evaluate(() => { const x = db.pedidos[0]; x.status = 'Instalado'; x.data_instalado = Date.now(); gerarComissoesPedido(x); gerarComissoesPedido(x); syncDB(); });
    p = (await ler(page, 'sc_ped'))[0];
    expect([p.comissao_status, p.arq_comissao_status]).toEqual(['pendente', 'pendente']);
    expect(p.comissao_historico.map(h => h.acao)).toEqual(['registrada', 'pendente']);
    expect(((await ler(page, 'sc_cp')) || []).filter(c => c.categoria === 'comissao' || c.papel_comissao)).toHaveLength(0);
    // voltar de Instalado (status anterior): volta a registrada
    await page.evaluate(() => { moverStatus(26600, -1); });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_ped'))[0].status === 'Aguardando Financeiro');
    await page.waitForLoadState('load');
    p = (await ler(page, 'sc_ped'))[0];
    expect([p.comissao_status, p.arq_comissao_status]).toEqual(['registrada', 'registrada']);
    expect(p.comissao_historico[p.comissao_historico.length - 1].acao).toBe('voltou');
    expect(((await ler(page, 'sc_cp')) || []).filter(c => c.papel_comissao)).toHaveLength(0);
});

test('valor 0 ou sem vendedor: sem comissao', async ({ page }) => {
    await abrir(page, { sc_ped: [pedido({ comissao_valor: 0, arq_id: null, arq_nome: '', arq_comissao_valor: 0 })] });
    await page.evaluate(() => { gerarComissoesPedido(db.pedidos[0]); syncDB(); });
    const p = (await ler(page, 'sc_ped'))[0];
    expect(p.comissao_status).toBeUndefined();
    expect(p.arq_comissao_status).toBeUndefined();
});

test('pagamento: um movimento por comissao em Comissoes, saldo cai, Fluxo e DRE veem; competencia no mes da instalacao', async ({ page }) => {
    await abrir(page, { sc_ped: [pendente()], sc_cr: cr() });
    expect(await saldo(page)).toBe(1000);
    const r = await page.evaluate(itens => registrarPagamentoComissoes({ itens, contaId: 1, data: '2026-11-10' }), ITENS);
    expect(r).toEqual({ ok: true, pagos: 2, total: 150 });
    const movs = (await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'comissao');
    expect(movs).toHaveLength(2);
    expect(movs.map(m => [m.papel, m.valor, m.sentido, m.categoria_id, m.conta_id, m.data, m.origem_id]).sort()).toEqual([
        ['arquiteto', 100, 'saida', 'cat_comissoes', 1, '2026-11-10', 26600], ['vendedor', 50, 'saida', 'cat_comissoes', 1, '2026-11-10', 26600]]);
    expect(movs.find(m => m.papel === 'vendedor').descricao).toBe('Comissão Bruno — Pedido #26600');
    expect(await saldo(page)).toBe(850);
    const p = (await ler(page, 'sc_ped'))[0];
    expect([p.comissao_status, p.arq_comissao_status, p.comissao_paga, p.arq_comissao_paga]).toEqual(['paga', 'paga', true, true]);
    expect(p.comissao_data_pgto).toBe(new Date('2026-11-10T12:00:00').getTime());
    expect([p.comissao_mov_id, p.comissao_conta_id]).toEqual([movs.find(m => m.papel === 'vendedor').id, 1]);
    expect(p.comissao_historico[p.comissao_historico.length - 1].acao).toBe('paga');
    expect((await ler(page, 'sc_contas_fin'))[0].saldo_atualizado_em).toMatch(/^2026-11-25T/);
    // nenhuma conta a pagar
    expect((await ler(page, 'sc_cp')) || []).toHaveLength(0);
    // pagar de novo nao duplica
    const r2 = await page.evaluate(itens => registrarPagamentoComissoes({ itens, contaId: 1, data: '2026-11-10' }), ITENS);
    expect(r2.ok).toBe(false);
    expect((await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'comissao')).toHaveLength(2);
    // Financeiro: Fluxo (saidas do mes) e DRE caixa (despesas de novembro)
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    await expect(page.locator('#fluxo-kpi-saidas .res-kpi-valor')).toHaveText('R$ 150,00');
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    await expect(page.locator('#dre-tabela tr[data-chave="despesas"] td').nth(10)).toContainText('150');
    const cats = await page.evaluate(() => {
        const mes = (de, ate, regime) => DreCore.calcular(_dreParams(de, ate, undefined, regime)).porCategoria.cat_comissoes || 0;
        return { caixaNov: mes('2026-11-01', '2026-11-30', 'caixa'), caixaOut: mes('2026-10-01', '2026-10-31', 'caixa'),
            compOut: mes('2026-10-01', '2026-10-31', 'competencia'), compNov: mes('2026-11-01', '2026-11-30', 'competencia') };
    });
    expect(cats).toEqual({ caixaNov: 150, caixaOut: 0, compOut: 150, compNov: 0 });
});

test('competencia inclui pendentes e nao as registradas', async ({ page }) => {
    await abrir(page, { sc_ped: [pedido({ comissao_status: 'pendente', arq_comissao_status: 'registrada' })] }, '/financeiro.html');
    const v = await page.evaluate(() => DreCore.calcular(_dreParams('2026-10-01', '2026-10-31', undefined, 'competencia')).porCategoria.cat_comissoes || 0);
    expect(v).toBe(50);
});

test('desfazer pagamento remove o movimento, devolve o saldo e volta a pendente', async ({ page }) => {
    await abrir(page, { sc_ped: [pendente()] });
    await page.evaluate(itens => registrarPagamentoComissoes({ itens, contaId: 1, data: '2026-11-10' }), ITENS);
    expect(await saldo(page)).toBe(850);
    const r = await page.evaluate(() => desfazerPagamentoComissao({ pedidoId: 26600, papel: 'vendedor' }));
    expect(r.ok).toBe(true);
    const movs = (await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'comissao');
    expect(movs.map(m => m.papel)).toEqual(['arquiteto']);
    expect(await saldo(page)).toBe(900);
    const p = (await ler(page, 'sc_ped'))[0];
    expect(p.comissao_status).toBe('pendente');
    expect(p.comissao_paga).toBe(false);
    expect(p.comissao_data_pgto).toBeNull();
    expect(p.comissao_mov_id).toBeUndefined();
    expect(p.arq_comissao_status, 'a do arquiteto continua paga').toBe('paga');
    expect(p.comissao_historico[p.comissao_historico.length - 1].acao).toBe('pagamento_desfeito');
    // so paga se desfaz
    expect((await page.evaluate(() => desfazerPagamentoComissao({ pedidoId: 26600, papel: 'vendedor' }))).ok).toBe(false);
});

test('pagamento valida conta, data e permissao', async ({ page }) => {
    await abrir(page, { sc_ped: [pendente()] });
    const pagar = (extra) => page.evaluate(a => registrarPagamentoComissoes(a), { itens: ITENS, contaId: 1, data: '2026-11-10', ...extra });
    expect((await pagar({ contaId: null })).erro).toBe('Escolha a conta.');
    expect((await pagar({ data: '2026-12-01' })).erro).toBe('A data não pode ser depois de hoje.');
    expect((await pagar({ data: '2026-09-01' })).ok).toBe(false);
    expect((await ler(page, 'sc_mov_fin')) || []).toHaveLength(0);
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].permissoes_extras = { vendedores: { nivel: 'visualizar', acoes_restritas: [] }, 'financeiro.pagar': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.reload();
    expect((await pagar({})).erro).toContain('permissão');
    expect((await ler(page, 'sc_ped'))[0].comissao_status).toBe('pendente');
});

test('migracao: CP aberta some (vai para excluidos) e o pedido fica pendente; CP paga continua e o pedido fica paga; duas vezes nao muda', async ({ page }) => {
    const peds = [
        pedido({ id: 26601, comissao_valor: 50, arq_id: null, arq_nome: '', arq_comissao_valor: 0 }),
        pedido({ id: 26602, comissao_valor: 0, arq_comissao_paga: true, arq_comissao_data_pgto: new Date('2026-10-25T12:00:00').getTime() }),
        pedido({ id: 26603, status: 'Medição', comissao_valor: 20, arq_id: null, arq_nome: '', arq_comissao_valor: 0 })
    ];
    const cps = [
        { id: 701, pedido_id: 26601, papel_comissao: 'vendedor', categoria: 'comissao', descricao: 'Comissão 5% — Bruno — Ped. #26601', valor: 50, status: 'Pendente', data_vencimento: '2026-10-20', credor_nome: 'Bruno', vendedor_id: 2 },
        { id: 702, pedido_id: 26602, papel_comissao: 'arquiteto', categoria: 'comissao', descricao: 'Comissão 10% — Studio M — Ped. #26602', valor: 100, status: 'Pago', data_vencimento: '2026-10-20', data_pagamento: '2026-10-25', conta_id: 1, credor_nome: 'Studio M', vendedor_id: 3 },
        { id: 703, pedido_id: 26603, papel_comissao: 'vendedor', categoria: 'comissao', descricao: 'Comissão 5% — Bruno — Ped. #26603', valor: 20, status: 'Atrasado', data_vencimento: '2026-10-20', credor_nome: 'Bruno', vendedor_id: 2 }
    ];
    const movs = [{ id: 9, conta_id: 1, data: '2026-10-25', sentido: 'saida', valor: 100, origem: 'cp', origem_id: 702, grupo_id: null, descricao: 'Comissão 10% — Studio M' }];
    await abrir(page, { sc_ped: peds, sc_cp: cps, sc_mov_fin: movs });
    await page.evaluate(() => localStorage.removeItem('sc_comissao_v2'));
    await page.reload();
    const estado = async () => ({ ped: await ler(page, 'sc_ped'), cp: await ler(page, 'sc_cp'), exc: await ler(page, 'sc_fin_excluidos'), mov: await ler(page, 'sc_mov_fin') });
    const e1 = await estado();
    expect(await page.evaluate(() => localStorage.getItem('sc_comissao_v2'))).toBe('1');
    expect(e1.cp.map(c => c.id)).toEqual([702]);
    expect(e1.cp[0].status).toBe('Pago');
    expect(e1.exc.map(x => [x.tipo, x.lancamento.id, x.motivo]).sort()).toEqual([['cp', 701, 'Comissão passou a ser registro do pedido'], ['cp', 703, 'Comissão passou a ser registro do pedido']]);
    const por = id => e1.ped.find(p => p.id === id);
    expect(por(26601).comissao_status).toBe('pendente');
    expect(por(26603).comissao_status).toBe('registrada');
    expect(por(26602).arq_comissao_status).toBe('paga');
    expect(por(26602).arq_comissao_paga).toBe(true);
    expect(por(26602).arq_comissao_mov_id).toBe(9);
    expect(por(26602).arq_comissao_conta_id).toBe(1);
    expect(e1.mov).toHaveLength(1);
    // valores nao mudam
    expect(por(26601).comissao_valor).toBe(50);
    expect(por(26602).arq_comissao_valor).toBe(100);
    // segunda vez: nada muda
    await page.evaluate(() => localStorage.removeItem('sc_comissao_v2'));
    await page.reload();
    expect(await estado()).toEqual(e1);
});

test('migracao: pedido antigo sem status (paga / Instalado / etapa anterior)', async ({ page }) => {
    const peds = [
        pedido({ id: 26611, comissao_paga: true, comissao_data_pgto: DATA_INST, arq_id: null, arq_nome: '', arq_comissao_valor: 0 }),
        pedido({ id: 26612, arq_id: null, arq_nome: '', arq_comissao_valor: 0 }),
        pedido({ id: 26613, status: 'Na Costura', arq_id: null, arq_nome: '', arq_comissao_valor: 0 }),
        pedido({ id: 26614, status: 'Orçamento', arq_id: null, arq_nome: '', arq_comissao_valor: 0 })
    ];
    await abrir(page, { sc_ped: peds });
    await page.evaluate(() => localStorage.removeItem('sc_comissao_v2'));
    await page.reload();
    const ps = await ler(page, 'sc_ped');
    expect(ps.map(p => p.comissao_status)).toEqual(['paga', 'pendente', 'registrada', undefined]);
});

test('estornar a conta paga de uma comissao antiga em A Pagar e bloqueado; Desfazer pagamento a tira do Financeiro e volta a pendente', async ({ page }) => {
    const cp = { id: 900, pedido_id: 26600, papel_comissao: 'vendedor', categoria: 'comissao', descricao: 'Comissão 5% — Bruno', credor_nome: 'Bruno', valor: 50, status: 'Pago',
        data_vencimento: '2026-10-25', data_pagamento: '2026-10-25', conta_id: 1, tipo: 'variavel' };
    const mov = { id: 9, conta_id: 1, data: '2026-10-25', sentido: 'saida', valor: 50, origem: 'cp', origem_id: 900, grupo_id: null, descricao: 'Comissão' };
    await abrir(page, { sc_ped: [pedido({ comissao_status: 'paga', comissao_paga: true, comissao_data_pgto: DATA_INST, comissao_mov_id: 9, arq_id: null, arq_nome: '', arq_comissao_valor: 0 })], sc_cp: [cp], sc_mov_fin: [mov] }, '/financeiro.html');
    await page.evaluate(() => { estornarCP(900); });
    await expect(page.locator('#sc-modal-msg')).toHaveText('Esta comissão foi paga antes da mudança. Para desfazer, use Vendedores › Comissões.');
    await page.locator('#sc-modal-ok').click();
    expect((await ler(page, 'sc_cp'))[0].status).toBe('Pago');
    expect((await ler(page, 'sc_mov_fin'))).toHaveLength(1);
    const r = await page.evaluate(() => desfazerPagamentoComissao({ pedidoId: 26600, papel: 'vendedor' }));
    expect(r.ok).toBe(true);
    expect((await ler(page, 'sc_cp')) || []).toEqual([]);
    expect((await ler(page, 'sc_mov_fin')) || []).toEqual([]);
    const exc = await ler(page, 'sc_fin_excluidos');
    expect(exc.map(x => [x.lancamento.id, x.motivo])).toEqual([[900, 'Comissão passou a ser registro do pedido']]);
    const p = (await ler(page, 'sc_ped'))[0];
    expect([p.comissao_status, p.comissao_paga]).toEqual(['pendente', false]);
});

test('editar o pedido nao muda comissao paga (valor, % e pessoa) e avisa; a nao paga recalcula', async ({ page }) => {
    const base = { status: 'Orçamento', financeiro_gerado: false, valor_recebido: 0, data_instalado: undefined, clienteId: 9, clienteNome: 'Cli Teste',
        ambientes: [{ nome: 'Sala', calculado: true, tecidos: [] }], itens: [],
        comissao_status: 'paga', comissao_paga: true, comissao_data_pgto: DATA_INST, comissao_mov_id: 9, comissao_pct: 5, comissao_valor: 50, arq_id: null, arq_nome: '', arq_comissao_valor: 0, arq_comissao_pct: 0 };
    await abrir(page, { sc_cli: [{ id: 9, nome: 'Cli Teste' }], sc_vend: [...VEND, { id: 5, nome: 'Bia', comissao_pct: 10, tipo: 'vendedor' }],
        sc_ped: [pedido(base)], sc_mov_fin: [{ id: 9, conta_id: 1, data: '2026-10-25', sentido: 'saida', valor: 50, origem: 'comissao', origem_id: 26600, papel: 'vendedor', categoria_id: 'cat_comissoes' }],
        sc_editando_id: 26600 }, '/pedido.html');
    await page.selectOption('#ped-vendedor', '5');
    await page.evaluate(() => {
        pedidoDraft.ambientes.forEach(a => { a.calculado = true; });
        pedidoDraft.itens = [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 2000, subtotal: 2000 }];
        document.getElementById('ped-desconto').value = 0;
        salvarPedido();
    });
    await expect(page.locator('#sc-modal-msg')).toHaveText('A comissão de Bruno já foi paga (R$ 50,00). Ela não muda com esta edição.');
    await page.locator('#sc-modal-ok').click();
    await page.waitForURL(/index\.html/);
    const p = (await ler(page, 'sc_ped'))[0];
    expect(p).toMatchObject({ vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50, comissao_status: 'paga', comissao_paga: true, comissao_mov_id: 9 });
});

test('Fluxo: comissao pendente aparece como saida prevista no ultimo dia do mes', async ({ page }) => {
    await abrir(page, { sc_ped: [pendente()] }, '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    const linha = page.locator('#fluxo-linhas tr.fluxo-linha', { hasText: 'Comissão Bruno — Pedido #26600' });
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText('Previsto');
    await expect(linha).toContainText('30/11');
    await expect(page.locator('#fluxo-linhas tr.fluxo-linha', { hasText: 'Comissão Studio M — Pedido #26600' })).toHaveCount(1);
});

test('conta de comissao antiga com baixa parcial: fica Em Contas a Pagar (nao se paga em Vendedores); paga a conta vira Paga; sem a conta volta a Pendente', async ({ page }) => {
    const cp = { id: 701, pedido_id: 26600, papel_comissao: 'vendedor', categoria: 'comissao', descricao: 'Comissão 5% — Bruno', credor_nome: 'Bruno', valor: 50, status: 'Pendente', data_vencimento: '2026-10-25', tipo: 'variavel', vendedor_id: 2 };
    const mov = { id: 9, conta_id: 1, data: '2026-11-01', sentido: 'saida', valor: 20, origem: 'cp', origem_id: 701, grupo_id: null, descricao: 'Parcial' };
    await abrir(page, { sc_ped: [pedido({ arq_id: null, arq_nome: '', arq_comissao_valor: 0 })], sc_cp: [cp], sc_mov_fin: [mov] }, '/vendedores.html?aba=comissoes');
    await page.evaluate(() => localStorage.removeItem('sc_comissao_v2'));
    await page.reload();
    expect((await ler(page, 'sc_cp')).map(c => c.id)).toEqual([701]);
    expect((await ler(page, 'sc_ped'))[0].comissao_status).toBe('em_cp');
    const linha = page.locator('#tb-comissoes tr[data-ped="26600"]');
    await expect(linha).toContainText('Em Contas a Pagar');
    await expect(linha.locator('.com-sel')).toHaveCount(0);
    await expect(page.locator('.com-cartao .com-apagar')).toHaveText('R$ 50,00');
    await expect(page.locator('.com-cartao button', { hasText: 'Pagar todos' })).toHaveCount(0);
    const r = await page.evaluate(() => registrarPagamentoComissoes({ itens: [{ pedidoId: 26600, papel: 'vendedor' }], contaId: 1, data: '2026-11-10' }));
    expect(r.ok).toBe(false);
    expect((await ler(page, 'sc_mov_fin'))).toHaveLength(1);
    // conta paga: a comissao fica paga
    await page.evaluate(() => { baixarContasPagar('2026-11-10', [{ id: 701, conta_id: 1 }]); syncDB(); });
    expect((await ler(page, 'sc_ped'))[0]).toMatchObject({ comissao_status: 'paga', comissao_paga: true });
    // conta que sai: volta a pendente (ao abrir o app)
    await page.evaluate(() => { const p = db.pedidos[0]; p.comissao_status = 'em_cp'; p.comissao_paga = false; db.contas_pagar = []; syncDB(); });
    await page.reload();
    expect((await ler(page, 'sc_ped'))[0].comissao_status).toBe('pendente');
});
