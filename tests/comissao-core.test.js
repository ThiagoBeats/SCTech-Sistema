'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/financeiro-core.js');
const D = require('../js/dre-core.js');
const R = require('../js/resultado-core.js');
const FX = require('../js/fluxo-core.js');

const ped = (o) => Object.assign({ id: 7, status: 'Medição', valor: 1000, vendedor_id: 1, vendedor_nome: 'Ana', comissao_pct: 5, comissao_valor: 50 }, o);
// 2026-10-15 ao meio-dia (a data local nao muda com o fuso)
const INST = new Date('2026-10-15T12:00:00').getTime();

test('aprovado = registrada; Orcamento = sem status', () => {
    const p = ped({ status: 'Orçamento' });
    F.sincronizarStatusComissoes(p);
    assert.strictEqual(p.comissao_status, undefined);
    p.status = 'Medição';
    const mud = F.sincronizarStatusComissoes(p);
    assert.strictEqual(p.comissao_status, 'registrada');
    assert.deepStrictEqual(mud, [{ papel: 'vendedor', de: null, para: 'registrada' }]);
});

test('Instalado = pendente; voltar = registrada; paga continua paga', () => {
    const p = ped({ status: 'Instalado' });
    F.sincronizarStatusComissoes(p);
    assert.strictEqual(p.comissao_status, 'pendente');
    p.status = 'Aguardando Financeiro';
    F.sincronizarStatusComissoes(p);
    assert.strictEqual(p.comissao_status, 'registrada');
    p.status = 'Instalado'; F.sincronizarStatusComissoes(p);
    p.comissao_status = 'paga'; p.comissao_paga = true;
    p.status = 'Aguardando Financeiro';
    F.sincronizarStatusComissoes(p);
    assert.strictEqual(p.comissao_status, 'paga');
});

test('valor 0 ou sem vendedor: sem comissao; idempotente e historico por mudanca', () => {
    const a = ped({ comissao_valor: 0 }); F.sincronizarStatusComissoes(a);
    assert.strictEqual(a.comissao_status, undefined);
    const b = ped({ vendedor_id: null, vendedor_nome: '' }); F.sincronizarStatusComissoes(b);
    assert.strictEqual(b.comissao_status, undefined);
    const c = ped({ arq_id: 2, arq_nome: 'Bia', arq_comissao_pct: 4, arq_comissao_valor: 40 });
    const hist = (papel, de, para) => ({ acao: para, papel });
    F.sincronizarStatusComissoes(c, hist);
    assert.deepStrictEqual([c.comissao_status, c.arq_comissao_status], ['registrada', 'registrada']);
    assert.strictEqual(c.comissao_historico.length, 1);
    assert.deepStrictEqual(F.sincronizarStatusComissoes(c, hist), []);
    assert.strictEqual(c.arq_comissao_historico.length, 1);
});

test('linhas e totais: acumulado = pendente + paga; a pagar = pendente; pago = paga', () => {
    const peds = [
        ped({ id: 1, status: 'Instalado', data_instalado: INST, comissao_status: 'pendente', comissao_valor: 50 }),
        ped({ id: 2, status: 'Instalado', data_instalado: INST, comissao_status: 'paga', comissao_paga: true, comissao_valor: 30, comissao_data_pgto: INST }),
        ped({ id: 3, status: 'Medição', comissao_status: 'registrada', comissao_valor: 20 }),
        ped({ id: 4, status: 'Instalado', data_instalado: new Date('2026-09-10T12:00:00').getTime(), comissao_status: 'pendente', comissao_valor: 10, vendedor_id: 2, vendedor_nome: 'Caio' })
    ];
    const todas = F.linhasComissoes(peds, [{ id: 1, nome: 'Ana' }]);
    assert.strictEqual(todas.length, 4);
    const t = F.totaisComissoes(todas);
    assert.deepStrictEqual(t.geral, { acumulado: 90, aPagar: 60, pago: 30, pagavel: 60 });
    assert.deepStrictEqual(t.porVendedor['1'], { acumulado: 80, aPagar: 50, pago: 30, pagavel: 50, vendedorId: 1, nome: 'Ana' });
    const out = F.linhasComissoes(peds, [], { mes: '2026-10', vendedorId: 1 });
    assert.deepStrictEqual(out.map(l => l.pedidoId), [1, 2]);
    assert.strictEqual(out[1].pagoEm, '2026-10-15');
    assert.strictEqual(out[0].data, '2026-10-15');
});

test('migracao: CP aberta sai e o pedido fica pendente; CP paga fica e o pedido fica paga', () => {
    const pedidos = [
        ped({ id: 1, status: 'Instalado' }),
        ped({ id: 2, status: 'Instalado' }),
        ped({ id: 3, status: 'Medição' })
    ];
    const contas_pagar = [
        { id: 10, pedido_id: 1, papel_comissao: 'vendedor', status: 'Pendente', valor: 50 },
        { id: 11, pedido_id: 2, papel_comissao: 'vendedor', status: 'Pago', valor: 50, data_pagamento: '2026-10-20', conta_id: 5 },
        { id: 12, pedido_id: 3, papel_comissao: 'vendedor', status: 'Atrasado', valor: 50 },
        { id: 13, pedido_id: 3, papel_comissao: 'vendedor', status: 'Cancelado', valor: 50 }
    ];
    const movimentos = [{ id: 99, origem: 'cp', origem_id: 11, conta_id: 5 }];
    const plano = F.planoMigracaoComissao({ pedidos, contas_pagar, movimentos });
    assert.deepStrictEqual(plano.removerCP.sort(), [10, 12]);
    const set = id => plano.pedidos.find(p => p.id === id).set;
    assert.strictEqual(set(1).comissao_status, 'pendente');
    assert.strictEqual(set(3).comissao_status, 'registrada');
    assert.strictEqual(set(2).comissao_status, 'paga');
    assert.strictEqual(set(2).comissao_paga, true);
    assert.strictEqual(set(2).comissao_mov_id, 99);
    assert.strictEqual(set(2).comissao_conta_id, 5);
});

test('migracao: roda duas vezes e nada muda; pedido antigo sem status', () => {
    const pedidos = [
        ped({ id: 1, status: 'Instalado' }),
        ped({ id: 2, status: 'Instalado', comissao_paga: true, comissao_data_pgto: INST }),
        ped({ id: 3, status: 'Faturado' }),
        ped({ id: 4, status: 'Orçamento' })
    ];
    const contas_pagar = [{ id: 10, pedido_id: 1, papel_comissao: 'vendedor', status: 'Pendente', valor: 50 }];
    const aplicar = (plano, cps) => {
        plano.pedidos.forEach(it => Object.assign(pedidos.find(p => p.id === it.id), it.set));
        return cps.filter(c => !plano.removerCP.includes(c.id));
    };
    let cps = aplicar(F.planoMigracaoComissao({ pedidos, contas_pagar, movimentos: [] }), contas_pagar);
    assert.deepStrictEqual(pedidos.map(p => p.comissao_status), ['pendente', 'paga', 'pendente', undefined]);
    const antes = JSON.stringify([pedidos, cps]);
    const p2 = F.planoMigracaoComissao({ pedidos, contas_pagar: cps, movimentos: [] });
    assert.deepStrictEqual(p2, { removerCP: [], pedidos: [] });
    cps = aplicar(p2, cps);
    assert.strictEqual(JSON.stringify([pedidos, cps]), antes);
});

test('migracao: RT antigo (so a conta) vira comissao do pedido sem mudar o valor', () => {
    const pedidos = [{ id: 5, status: 'Instalado', valor: 2000, rt_pct: 10 }];
    const contas_pagar = [{ id: 20, pedido_id: 5, categoria: 'comissao_rt', status: 'Pendente', valor: 200, credor_nome: 'Arq Lia', vendedor_id: 3 }];
    const plano = F.planoMigracaoComissao({ pedidos, contas_pagar, movimentos: [] });
    assert.deepStrictEqual(plano.removerCP, [20]);
    assert.deepStrictEqual(plano.pedidos[0].set, { arq_comissao_valor: 200, arq_nome: 'Arq Lia', arq_id: 3, arq_comissao_pct: 10, arq_comissao_status: 'pendente' });
});

test('resultadoPedido: comissao pendente/paga do pedido conta; registrada nao; conta propria nao duplica', () => {
    const base = { id: 7, valor: 1000, tipo_precificacao: 'pedido', custo_mat: 100, custo_acess: 0 };
    const cad = { catalogo: [], materiais: [], kits: [] };
    const r = (o, cps) => F.resultadoPedido(Object.assign({}, base, o), cps || [], cad).comissoes;
    assert.strictEqual(r({ vendedor_id: 1, comissao_valor: 50, comissao_status: 'pendente' }), 50);
    assert.strictEqual(r({ vendedor_id: 1, comissao_valor: 50, comissao_status: 'registrada' }), 0);
    assert.strictEqual(r({ vendedor_id: 1, comissao_valor: 50, comissao_status: 'paga' }, [{ pedido_id: 7, papel_comissao: 'vendedor', categoria: 'comissao', status: 'Pago', valor: 50 }]), 50);
});

const movCom = { id: 1, conta_id: 1, data: '2026-10-20', sentido: 'saida', valor: 50, origem: 'comissao', origem_id: 7, papel: 'vendedor', categoria_id: 'cat_comissoes', descricao: 'Comissão Ana — Pedido #7' };

test('DRE caixa: movimento de comissao e despesa Comissoes pela data do movimento', () => {
    const p = { regime: 'caixa', contas_receber: [], contas_pagar: [], movimentos: [movCom], contas: [{ id: 1 }], pedidos: [] };
    const out = D.calcular(Object.assign({ de: '2026-10-01', ate: '2026-10-31' }, p));
    assert.strictEqual(out.porCategoria.cat_comissoes, 50);
    assert.strictEqual(out.lancamentos.cat_comissoes[0].tipo, 'comissao');
    assert.strictEqual(D.calcular(Object.assign({ de: '2026-11-01', ate: '2026-11-30' }, p)).porCategoria.cat_comissoes || 0, 0);
});

test('DRE competencia: comissao pendente/paga no mes da instalacao; registrada fora', () => {
    const peds = [
        ped({ id: 1, status: 'Instalado', data_instalado: INST, comissao_status: 'pendente', comissao_valor: 50 }),
        ped({ id: 2, status: 'Instalado', data_instalado: INST, comissao_status: 'paga', comissao_valor: 30 }),
        ped({ id: 3, status: 'Medição', comissao_status: 'registrada', comissao_valor: 99 })
    ];
    const p = { regime: 'competencia', contas_receber: [], contas_pagar: [], movimentos: [movCom], contas: [{ id: 1 }], pedidos: peds };
    assert.strictEqual(D.calcular(Object.assign({ de: '2026-10-01', ate: '2026-10-31' }, p)).porCategoria.cat_comissoes, 80);
    assert.strictEqual(D.calcular(Object.assign({ de: '2026-11-01', ate: '2026-11-30' }, p)).porCategoria.cat_comissoes || 0, 0);
});

test('Resultado (antigo): movimento de comissao e saida do grupo Comissoes', () => {
    const r = R.resultadoDoMes({ mes: '2026-10', contasReceber: [], contasPagar: [], movimentos: [movCom], contas: [{ id: 1 }], aliquota: 0 });
    assert.strictEqual(r.porGrupo.comissoes, 50);
    assert.strictEqual(r.saidas, 50);
    const per = R.resultadoDoPeriodo({ de: '2026-10-01', ate: '2026-10-31', contasReceber: [], contasPagar: [], movimentos: [movCom], contas: [{ id: 1 }], aliquota: 0 });
    assert.strictEqual(per.porGrupo.comissoes, 50);
});

test('Fluxo: movimento de comissao e saida realizada, na categoria Comissoes', () => {
    const p = { de: '2026-10-01', ate: '2026-10-31', hoje: '2026-11-25', contaId: null, categoriaId: null,
        contas: [{ id: 1, nome: 'A', saldo_inicial: 1000, data_saldo_inicial: '2026-09-01', ativo: true }],
        movimentos: [movCom], contasReceber: [], contasPagar: [], despesasFixas: [], meios: [] };
    const r = FX.resumo(p);
    assert.strictEqual(r.saidas, 50);
    assert.strictEqual(r.saldoFinal, 950);
    const cat = FX.porCategoria(p).linhas.find(l => l.chave === 'cat:cat_comissoes');
    assert.strictEqual(cat.valor, 50);
    assert.strictEqual(FX.resumo(Object.assign({}, p, { categoriaId: 'cat_comissoes' })).saidas, 50);
    assert.strictEqual(FX.movimentacoes(p).find(l => l.origem === 'comissao').descricao, 'Comissão Ana — Pedido #7');
});

test('status desconhecido: so e registrada se o pedido ja passou do Orcamento', () => {
    const p = ped({ status: 'Qualquer coisa' });
    F.sincronizarStatusComissoes(p);
    assert.strictEqual(p.comissao_status, undefined);
    const q = ped({ status: 'Produção' });
    F.sincronizarStatusComissoes(q);
    assert.strictEqual(q.comissao_status, 'registrada');
});

test('migracao: conta de comissao com baixa parcial nao e removida', () => {
    const pedidos = [ped({ id: 1, status: 'Instalado' })];
    const contas_pagar = [{ id: 10, pedido_id: 1, papel_comissao: 'vendedor', status: 'Pendente', valor: 50 }];
    const movimentos = [{ id: 5, origem: 'cp', origem_id: 10 }];
    const plano = F.planoMigracaoComissao({ pedidos, contas_pagar, movimentos });
    assert.deepStrictEqual(plano.removerCP, []);
    assert.strictEqual(plano.pedidos[0].set.comissao_status, 'em_cp');
});

test('em_cp: conta aberta segura a comissao; paga vira paga; conta que sai volta a pendente; nao entra em previstas nem no pagavel', () => {
    const p = ped({ id: 1, status: 'Instalado' });
    const cp = { pedido_id: 1, papel_comissao: 'vendedor', status: 'Atrasado', valor: 50 };
    F.sincronizarStatusComissoes(p, null, [cp]);
    assert.strictEqual(p.comissao_status, 'em_cp');
    assert.deepStrictEqual(F.comissoesPendentesPrevistas([p], [cp], []), []);
    const t = F.totaisComissoes(F.linhasComissoes([p], [], { contasPagar: [cp] }));
    assert.deepStrictEqual([t.geral.aPagar, t.geral.pagavel, t.geral.acumulado], [50, 0, 50]);
    cp.status = 'Pago';
    F.sincronizarStatusComissoes(p, null, [cp]);
    assert.deepStrictEqual([p.comissao_status, p.comissao_paga], ['paga', true]);
    const q = ped({ id: 2, status: 'Instalado', comissao_status: 'em_cp' });
    F.sincronizarStatusComissoes(q, null, []);
    assert.strictEqual(q.comissao_status, 'pendente');
});

test('comissoesPendentesPrevistas: so pendentes sem conta propria', () => {
    const peds = [
        ped({ id: 1, status: 'Instalado', comissao_status: 'pendente' }),
        ped({ id: 2, status: 'Medição', comissao_status: 'registrada' }),
        ped({ id: 3, status: 'Instalado', comissao_status: 'paga', comissao_paga: true }),
        ped({ id: 4, status: 'Instalado', comissao_status: 'pendente' })
    ];
    const cps = [{ pedido_id: 4, papel_comissao: 'vendedor', status: 'Pendente', valor: 50 }];
    assert.deepStrictEqual(F.comissoesPendentesPrevistas(peds, cps, []), [{ pedidoId: 1, papel: 'vendedor', nome: 'Ana', valor: 50 }]);
});

test('Fluxo: comissao pendente e saida prevista no ultimo dia do mes, com a descricao; fora com conta ou outra categoria', () => {
    const peds = [ped({ id: 7, status: 'Instalado', comissao_status: 'pendente' })];
    const p = { de: '2026-11-01', ate: '2026-12-31', hoje: '2026-11-25', contaId: null, categoriaId: null,
        contas: [{ id: 1, nome: 'A', saldo_inicial: 1000, data_saldo_inicial: '2026-09-01', ativo: true }],
        movimentos: [], contasReceber: [], contasPagar: [], despesasFixas: [], meios: [], pedidos: peds, vendedores: [] };
    assert.strictEqual(FX.resumo(p).previsto.saidas, 50);
    const lin = FX.movimentacoes(p).find(l => l.previsto && /Comissão/.test(l.descricao));
    assert.strictEqual(lin.data, '2026-11-30');
    assert.strictEqual(lin.descricao, 'Comissão Ana — Pedido #7');
    assert.strictEqual(lin.saida, 50);
    assert.strictEqual(FX.resumo(Object.assign({}, p, { categoriaId: 'cat_comissoes' })).previsto.saidas, 50);
    assert.strictEqual(FX.resumo(Object.assign({}, p, { categoriaId: 'cat_vendas' })).previsto.saidas, 0);
    assert.strictEqual(FX.resumo(Object.assign({}, p, { contaId: 1 })).previsto.saidas, 0);
    assert.strictEqual(FX.resumo(Object.assign({}, p, { ate: '2026-11-20' })).previsto.saidas, 0);
});
