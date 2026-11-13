'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/resultado-core.js');

const MESES6 = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'];

test('grupos na ordem da spec e categoria nao mapeada cai em outros', () => {
    assert.deepStrictEqual(R.GRUPOS.map(g => g.id), ['fornecedores', 'servicos', 'comissoes', 'taxas', 'fixas', 'imposto', 'outros']);
    assert.deepStrictEqual(R.GRUPOS.map(g => g.rotulo), ['Fornecedores e materiais', 'Costureira e instalador', 'Comissões', 'Taxas de cartão', 'Despesas fixas', 'Imposto', 'Outros']);
    assert.strictEqual(R.grupoDaCategoria('tecido'), 'fornecedores');
    assert.strictEqual(R.grupoDaCategoria('instalador'), 'servicos');
    assert.strictEqual(R.grupoDaCategoria('comissao_rt'), 'comissoes');
    assert.strictEqual(R.grupoDaCategoria('taxa_cartao'), 'taxas');
    assert.strictEqual(R.grupoDaCategoria('conta'), 'fixas');
    assert.strictEqual(R.grupoDaCategoria('imposto'), 'imposto');
    assert.strictEqual(R.grupoDaCategoria('outro'), 'outros');
    assert.strictEqual(R.grupoDaCategoria('xyz'), 'outros');
    assert.strictEqual(R.grupoDaCategoria(undefined), 'outros');
});

test('cartao 6x: cada mes recebe 1000 bruto e 40 de taxa no mes do repasse', () => {
    const contasReceber = [{ id: 7, pedido_id: 1, valor: 6000, status: 'Pago', data_pagamento: '2026-10-12', data_vencimento: '2026-10-12' }];
    const datas = MESES6.map(m => m + '-12');
    const movimentos = datas.map((d, i) => ({ id: 100 + i, conta_id: 3, data: d, sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: '7', grupo_id: 'g1' }));
    const contasPagar = datas.map((d, i) => ({ id: 200 + i, tipo: 'variavel', categoria: 'taxa_cartao', descricao: 'Taxa cartao', valor: 40, status: 'Pago', data_vencimento: d, data_pagamento: d }));
    // Mes da venda: nada entra (o dinheiro so cai nos repasses).
    const out = R.resultadoDoMes({ mes: '2026-10', contasReceber, contasPagar, movimentos, aliquota: 0 });
    assert.strictEqual(out.entradas, 0);
    assert.strictEqual(out.taxas, 0);
    MESES6.forEach(mes => {
        const r = R.resultadoDoMes({ mes, contasReceber, contasPagar, movimentos, aliquota: 0 });
        assert.strictEqual(r.entradas, 1000, mes);
        assert.strictEqual(r.taxas, 40, mes);
        assert.strictEqual(r.faturamento, 960, mes);
        assert.strictEqual(r.porGrupo.taxas, 40, mes);
    });
    // Mes aberto ate hoje: repasse do dia 12 ainda nao caiu.
    const ate = R.entradasDoMes({ mes: '2026-11', contasReceber, movimentos, ateData: '2026-11-10' });
    assert.strictEqual(ate.total, 0);
    const saiAte = R.saidasDoMes({ mes: '2026-11', contasPagar, ateData: '2026-11-10' });
    assert.strictEqual(saiAte.total, 0);
});

test('entrada sem movimento usa data_pagamento; estornada nao conta; transferencia nao conta', () => {
    const contasReceber = [
        { id: 1, valor: 500, status: 'Pago', data_pagamento: '2026-10-05', data_vencimento: '2026-09-30' },
        { id: 2, valor: 800, status: 'Pendente', data_pagamento: null, data_vencimento: '2026-10-10' }, // estornada
        { id: 3, valor: 300, status: 'Pago', data_pagamento: '2026-09-28', data_vencimento: '2026-09-28' },
        { id: 4, valor: 250, status: 'Atrasado', data_pagamento: null, data_vencimento: '2026-10-01' }
    ];
    const movimentos = [
        { id: 1, conta_id: 1, data: '2026-10-03', sentido: 'entrada', valor: 300, origem: 'cr', origem_id: 3 },     // CR 3 recebido em outubro pelo movimento
        { id: 2, conta_id: 1, data: '2026-10-15', sentido: 'entrada', valor: 900, origem: 'transferencia', origem_id: null, grupo_id: 't1' },
        { id: 3, conta_id: 2, data: '2026-10-15', sentido: 'saida', valor: 900, origem: 'transferencia', origem_id: null, grupo_id: 't1' },
        { id: 4, conta_id: 1, data: '2026-10-11', sentido: 'entrada', valor: 800, origem: 'cr', origem_id: 2 }      // movimento de parcela estornada
    ];
    const e = R.entradasDoMes({ mes: '2026-10', contasReceber, movimentos });
    assert.strictEqual(e.total, 800);
    assert.deepStrictEqual(e.itens, [{ data: '2026-10-05', valor: 500, cr_id: 1 }, { data: '2026-10-03', valor: 300, cr_id: 3 }]);
    const set = R.entradasDoMes({ mes: '2026-09', contasReceber, movimentos });
    assert.strictEqual(set.total, 0); // CR 3 tem movimento: data_pagamento nao conta
});

test('imposto pela referencia: guia de 2026-10 paga em novembro conta em outubro; novembro sem guia estimado 6% do faturamento', () => {
    const contasReceber = [
        { id: 1, valor: 10000, status: 'Pago', data_pagamento: '2026-10-10', data_vencimento: '2026-10-10' },
        { id: 2, valor: 5000, status: 'Pago', data_pagamento: '2026-11-03', data_vencimento: '2026-11-03' }
    ];
    const contasPagar = [
        { id: 1, tipo: 'variavel', categoria: 'imposto', descricao: 'DAS', valor: 580, status: 'Pago', data_vencimento: '2026-11-20', data_pagamento: '2026-11-08', mes_referencia: '2026-10' }
    ];
    const out = R.resultadoDoMes({ mes: '2026-10', contasReceber, contasPagar, movimentos: [], aliquota: 6 });
    assert.deepStrictEqual(out.imposto, { valor: 580, estimado: false, lancado: 580 });
    assert.strictEqual(out.porGrupo.imposto, 580);
    assert.strictEqual(out.saidas, 580);
    const nov = R.resultadoDoMes({ mes: '2026-11', contasReceber, contasPagar, movimentos: [], aliquota: 6 });
    assert.deepStrictEqual(nov.imposto, { valor: 300, estimado: true, lancado: 0 });
    assert.strictEqual(nov.porGrupo.imposto, 300);
    assert.strictEqual(nov.saidas, 300); // a guia paga em novembro nao entra de novo
    // Guia em aberto tambem conta como lancada
    const aberta = R.impostoDoMes({ mes: '2026-11', contasPagar: [{ id: 9, categoria: 'imposto', valor: 310.5, status: 'Pendente', data_vencimento: '2026-12-20', mes_referencia: '2026-11' }], faturamento: 5000, aliquota: 6 });
    assert.deepStrictEqual(aberta, { valor: 310.5, estimado: false, lancado: 310.5 });
});

test('sem aliquota e sem guia: semAliquota', () => {
    assert.deepStrictEqual(R.impostoDoMes({ mes: '2026-11', contasPagar: [], faturamento: 5000, aliquota: 0 }),
        { valor: 0, estimado: true, lancado: 0, semAliquota: true });
    assert.deepStrictEqual(R.impostoDoMes({ mes: '2026-11', contasPagar: [], faturamento: 5000, aliquota: '' }),
        { valor: 0, estimado: true, lancado: 0, semAliquota: true });
});

test('imposto estimado nunca negativo', () => {
    assert.deepStrictEqual(R.impostoDoMes({ mes: '2026-11', contasPagar: [], faturamento: -500, aliquota: 6 }),
        { valor: 0, estimado: true, lancado: 0 });
});

test('resultado = entradas - saidas (com imposto); faturamento = entradas - taxas', () => {
    const contasReceber = [{ id: 1, valor: 10000, status: 'Pago', data_pagamento: '2026-10-10', data_vencimento: '2026-10-10' }];
    const pago = (id, categoria, valor, data) => ({ id, tipo: 'variavel', categoria, descricao: categoria, valor, status: 'Pago', data_vencimento: data, data_pagamento: data });
    const contasPagar = [
        pago(1, 'tecido', 2000, '2026-10-05'),
        pago(2, 'costureira', 1000, '2026-10-06'),
        pago(3, 'comissao', 500, '2026-10-07'),
        pago(4, 'taxa_cartao', 200, '2026-10-10'),
        pago(5, 'aluguel', 1500, '2026-10-05'),
        pago(6, 'misterio', 100, '2026-10-20'),
        { id: 7, tipo: 'variavel', categoria: 'tecido', valor: 999, status: 'Pendente', data_vencimento: '2026-10-25', data_pagamento: null },
        pago(8, 'tecido', 50, '2026-11-01')
    ];
    const r = R.resultadoDoMes({ mes: '2026-10', contasReceber, contasPagar, movimentos: [], aliquota: 5 });
    assert.strictEqual(r.entradas, 10000);
    assert.strictEqual(r.taxas, 200);
    assert.strictEqual(r.faturamento, 9800);
    assert.deepStrictEqual(r.imposto, { valor: 490, estimado: true, lancado: 0 });
    assert.deepStrictEqual(r.porGrupo, { fornecedores: 2000, servicos: 1000, comissoes: 500, taxas: 200, fixas: 1500, imposto: 490, outros: 100 });
    assert.strictEqual(r.saidas, 5790);
    assert.strictEqual(r.resultado, 4210);
});

test('metaDoMes: ajuste vence padrao; ajuste 0 usa padrao', () => {
    assert.strictEqual(R.metaDoMes('2026-10', { padrao: 30000, ajustes: { '2026-10': 45000 } }), 45000);
    assert.strictEqual(R.metaDoMes('2026-10', { padrao: 30000, ajustes: { '2026-10': 0 } }), 30000);
    assert.strictEqual(R.metaDoMes('2026-11', { padrao: 30000, ajustes: { '2026-10': 45000 } }), 30000);
    assert.strictEqual(R.metaDoMes('2026-11', { padrao: '', ajustes: {} }), 0);
    assert.strictEqual(R.metaDoMes('2026-11', {}), 0);
});

test('despesas fixas por vencimento: aluguel vencido em outubro e pago em novembro conta em outubro', () => {
    const contasPagar = [
        { id: 1, tipo: 'fixo', categoria: 'aluguel', descricao: 'Aluguel', valor: 2000, status: 'Pago', data_vencimento: '2026-10-05', data_pagamento: '2026-11-12' },
        { id: 2, tipo: 'fixo', categoria: 'aluguel', descricao: 'Aluguel', valor: 2000, status: 'Pendente', data_vencimento: '2026-11-05', data_pagamento: null },
        { id: 3, tipo: 'variavel', categoria: 'tecido', descricao: 'Tecido', valor: 700, status: 'Pago', data_vencimento: '2026-10-05', data_pagamento: '2026-10-05' }
    ];
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-10', contasPagar, despesasFixas: [] }), 2000);
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-11', contasPagar, despesasFixas: [] }), 2000);
    // Saida de caixa do aluguel atrasado fica em novembro.
    assert.strictEqual(R.saidasDoMes({ mes: '2026-11', contasPagar }).porGrupo.fixas, 2000);
    assert.strictEqual(R.saidasDoMes({ mes: '2026-10', contasPagar }).porGrupo.fixas, 0);
});

test('despesas fixas: DF anual com periodicidade nao e projetada; DF antiga sem periodicidade nao gerada entra', () => {
    const contasPagar = [
        { id: 1, tipo: 'fixo', categoria: 'aluguel', descricao: 'Aluguel', valor: 2000, status: 'Pendente', data_vencimento: '2026-10-05' }
    ];
    const despesasFixas = [
        { id: 1, descricao: 'Aluguel', valor: 2000, dia_vencimento: 5, ativo: true },                       // ja gerada em outubro
        { id: 2, descricao: 'Internet', valor: 150, dia_vencimento: 10, ativo: true },                      // antiga, nao gerada
        { id: 3, descricao: 'IPTU', valor: 1200, dia_vencimento: 10, ativo: true, periodicidade: 'anual' }, // vira CP pre-gerado
        { id: 4, descricao: 'Contador', valor: 400, dia_vencimento: 10, ativo: false },                     // inativa
        { id: 5, descricao: 'Seguro', valor: 90, dia_vencimento: 31, ativo: true, data_inicio: '2026-11-01' } // ainda nao comecou
    ];
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-10', contasPagar, despesasFixas }), 2150);
    // Novembro: aluguel nao gerado entra pela DF, internet e seguro (dia 31 -> 30) tambem
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-11', contasPagar, despesasFixas }), 2240);
});

test('margem pula mes sem faturamento e usa 3 fechados', () => {
    const dados = {
        '2026-10': { faturamento: 10000, porGrupo: { fornecedores: 3000, servicos: 1000, comissoes: 500 }, imposto: { valor: 500 } }, // 50%
        '2026-09': { faturamento: 0, porGrupo: {}, imposto: { valor: 0 } },
        '2026-08': { faturamento: 20000, porGrupo: { fornecedores: 8000, servicos: 2000, comissoes: 0 }, imposto: { valor: 2000 } }, // 40%
        '2026-07': { faturamento: 5000, porGrupo: { fornecedores: 1000, servicos: 500, comissoes: 0 }, imposto: { valor: 0 } }, // 70%
        '2026-06': { faturamento: 9999, porGrupo: { fornecedores: 9999 }, imposto: { valor: 0 } } // nao usado
    };
    const vazio = { faturamento: 0, porGrupo: {}, imposto: { valor: 0 } };
    const chamados = [];
    const m = R.margemContribuicao({ mesAtual: '2026-11', dadosPorMes: mes => { chamados.push(mes); return dados[mes] || vazio; }, aliquota: 6 });
    assert.deepStrictEqual(m, { pct: 47.14, base: 'historico', meses: ['2026-10', '2026-08', '2026-07'] });
    assert.ok(!chamados.includes('2026-11'), 'mes atual nao e fechado');
    // Ate 12 meses para tras: nada alem disso
    const longe = R.margemContribuicao({ mesAtual: '2026-11', dadosPorMes: mes => (mes === '2025-10' ? dados['2026-10'] : vazio), aliquota: 6 });
    assert.deepStrictEqual(longe, { pct: null, base: null, meses: [] });
    const doze = R.margemContribuicao({ mesAtual: '2026-11', dadosPorMes: mes => (mes === '2025-11' ? dados['2026-10'] : vazio), aliquota: 6 });
    assert.deepStrictEqual(doze, { pct: 50, base: 'historico', meses: ['2025-11'] });
});

test('margem ponderada pelo faturamento: 1000 a 50% e 9000 a 10% = 14%', () => {
    const dados = {
        '2026-10': { faturamento: 1000, porGrupo: { fornecedores: 500 }, imposto: { valor: 0 } },
        '2026-09': { faturamento: 9000, porGrupo: { fornecedores: 8100 }, imposto: { valor: 0 } }
    };
    const vazio = { faturamento: 0, porGrupo: {}, imposto: { valor: 0 } };
    assert.deepStrictEqual(R.margemContribuicao({ mesAtual: '2026-11', dadosPorMes: mes => dados[mes] || vazio, aliquota: 0 }),
        { pct: 14, base: 'historico', meses: ['2026-10', '2026-09'] });
});

test('sem historico usa pedidos e marca base pedidos', () => {
    const vazio = { faturamento: 0, porGrupo: {}, imposto: { valor: 0 } };
    const pedidosFallback = [
        { receita: 1000, custo_material: 300, custos_vinculados: 100, comissoes: 50 }, // 55%
        { receita: 2000, custo_material: 1000, custos_vinculados: 0, comissoes: 0 },   // 50%
        { receita: 0, custo_material: 10, custos_vinculados: 0, comissoes: 0 }         // ignorado
    ];
    const m = R.margemContribuicao({ mesAtual: '2026-11', dadosPorMes: () => vazio, pedidosFallback, aliquota: 6 });
    assert.deepStrictEqual(m, { pct: 45.67, base: 'pedidos', meses: [] });
    assert.deepStrictEqual(R.margemContribuicao({ mesAtual: '2026-11', dadosPorMes: () => vazio, pedidosFallback: [], aliquota: 6 }),
        { pct: null, base: null, meses: [] });
});

test('ponto de equilibrio: fixas 9000 / 30% = 30000; margem <= 0 sem ponto', () => {
    assert.deepStrictEqual(R.pontoEquilibrio(9000, 30), { valor: 30000 });
    assert.deepStrictEqual(R.pontoEquilibrio(9000, 0), { valor: null, motivo: 'margem_negativa' });
    assert.deepStrictEqual(R.pontoEquilibrio(9000, -5), { valor: null, motivo: 'margem_negativa' });
    assert.deepStrictEqual(R.pontoEquilibrio(9000, null), { valor: null, motivo: 'sem_margem' });
});

test('orcamento: faixas ok, perto (80%), estourou (>100%), grupo sem limite fica de fora', () => {
    const s = R.statusOrcamento({
        limites: { fornecedores: 1000, servicos: 1000, comissoes: 1000, fixas: 1000, outros: 0, taxas: '' },
        gastos: { fornecedores: 799.99, servicos: 800, comissoes: 1000, fixas: 1250.5, outros: 300, taxas: 50 }
    });
    assert.deepStrictEqual(s.map(x => [x.grupo, x.faixa]), [['fornecedores', 'ok'], ['servicos', 'perto'], ['comissoes', 'perto'], ['fixas', 'estourou']]);
    const f = s.find(x => x.grupo === 'fixas');
    assert.strictEqual(f.limite, 1000);
    assert.strictEqual(f.gasto, 1250.5);
    assert.strictEqual(f.falta, -250.5);
    assert.strictEqual(f.pct, 125.05);
    assert.strictEqual(s.find(x => x.grupo === 'fornecedores').falta, 200.01);
    assert.strictEqual(s.find(x => x.grupo === 'fornecedores').pct, 79.99); // ok nunca mostra 80
    const pouco = R.statusOrcamento({ limites: { outros: 10000 }, gastos: { outros: 10000.01 } })[0];
    assert.deepStrictEqual([pouco.pct, pouco.faixa, pouco.falta], [100.01, 'estourou', -0.01]);
    // Fronteiras em centavos (sem erro de ponto flutuante)
    const fr = R.statusOrcamento({ limites: { fornecedores: 7, servicos: 1.2, comissoes: 0.3 }, gastos: { fornecedores: 5.6, servicos: 1.5, comissoes: 0.3 } });
    assert.deepStrictEqual(fr.map(x => [x.grupo, x.pct, x.faixa]), [['fornecedores', 80, 'perto'], ['servicos', 125, 'estourou'], ['comissoes', 100, 'perto']]);
    const sem = R.statusOrcamento({ limites: { imposto: 500 }, gastos: {} });
    assert.deepStrictEqual(sem.map(x => [x.grupo, x.gasto, x.falta, x.pct, x.faixa]), [['imposto', 0, 500, 0, 'ok']]);
});

// --- Periodo arbitrario (Visao Geral) ---
const P_CR = [
    { id: 1, valor: 3000, status: 'Pago', data_pagamento: '2026-10-05', data_vencimento: '2026-10-05', pedido_id: 50 }, // cartao 3x
    { id: 2, valor: 2000, status: 'Pago', data_pagamento: '2026-10-15', data_vencimento: '2026-10-15', pedido_id: 51 }, // sem movimento
    { id: 3, valor: 500, status: 'Pago', data_pagamento: '2026-09-30', data_vencimento: '2026-09-30', pedido_id: 52 }
];
const P_MOV = [
    { id: 1, conta_id: 1, data: '2026-10-05', sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 1 },
    { id: 2, conta_id: 1, data: '2026-11-05', sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 1 },
    { id: 3, conta_id: 1, data: '2026-12-05', sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 1 },
    { id: 4, conta_id: 1, data: '2026-10-01', sentido: 'entrada', valor: 500, origem: 'cr', origem_id: 3 },
    { id: 5, conta_id: 1, data: '2026-10-12', sentido: 'entrada', valor: 400, origem: 'transferencia', origem_id: null, grupo_id: 't' },
    { id: 6, conta_id: 2, data: '2026-10-12', sentido: 'saida', valor: 400, origem: 'transferencia', origem_id: null, grupo_id: 't' }
];
const P_CP = [
    { id: 1, categoria: 'taxa_cartao', valor: 30, status: 'Pago', data_vencimento: '2026-10-05', data_pagamento: '2026-10-05' },
    { id: 2, categoria: 'taxa_cartao', valor: 30, status: 'Pago', data_vencimento: '2026-11-05', data_pagamento: '2026-11-05' },
    { id: 3, categoria: 'tecido', valor: 800, status: 'Pago', data_vencimento: '2026-10-18', data_pagamento: '2026-10-18' },
    { id: 4, categoria: 'tecido', valor: 999, status: 'Pendente', data_vencimento: '2026-10-20', data_pagamento: null },
    { id: 5, categoria: 'imposto', valor: 150, status: 'Pago', mes_referencia: '2026-10', data_vencimento: '2026-10-25', data_pagamento: '2026-10-25' }
];
const P_BASE = { contasReceber: P_CR, contasPagar: P_CP, movimentos: P_MOV, aliquota: 6 };

test('periodo de um mes inteiro = resultado do mes', () => {
    const p = R.resultadoDoPeriodo({ de: '2026-10-01', ate: '2026-10-31', ...P_BASE });
    const m = R.resultadoDoMes({ mes: '2026-10', ...P_BASE });
    assert.strictEqual(p.entradas, 3500);
    assert.strictEqual(p.entradas, m.entradas);
    assert.strictEqual(p.saidas, m.saidas);
    assert.strictEqual(p.saidas, 980);
    assert.strictEqual(p.faturamento, m.faturamento);
    assert.strictEqual(p.resultado, m.resultado);
    assert.deepStrictEqual(p.porGrupo, m.porGrupo);
    assert.deepStrictEqual(p.imposto.porMes, { '2026-10': 150 });
    assert.strictEqual(p.imposto.valor, 150);
    assert.strictEqual(p.imposto.estimado, false);
});

test('periodo parcial: pela data do dinheiro, sem transferencia; guia paga no pedaco conta pelo pagamento', () => {
    const p = R.resultadoDoPeriodo({ de: '2026-10-10', ate: '2026-11-10', ...P_BASE });
    assert.strictEqual(p.entradas, 3000); // CR 2 (15/10) + repasse 05/11
    assert.strictEqual(p.taxas, 30);
    assert.strictEqual(p.porGrupo.fornecedores, 800);
    assert.strictEqual(p.porGrupo.imposto, 150); // guia de 2026-10 paga em 25/10; outubro nao e inteiro no periodo
    assert.strictEqual(p.saidas, 980);
    assert.strictEqual(p.resultado, 2020);
    assert.deepStrictEqual(p.imposto.porMes, {});
    assert.deepStrictEqual(p.itensEntrada.map(i => [i.data, i.valor, i.cr_id]), [['2026-11-05', 1000, 1], ['2026-10-15', 2000, 2]]);
    assert.deepStrictEqual(p.itensSaida.map(i => [i.data, i.valor, i.grupo]), [['2026-11-05', 30, 'taxas'], ['2026-10-18', 800, 'fornecedores']]);
});

test('periodo com um mes inteiro e um pedaco: imposto (estimado) so do mes inteiro', () => {
    const cps = P_CP.filter(cp => cp.categoria !== 'imposto');
    const p = R.resultadoDoPeriodo({ de: '2026-09-15', ate: '2026-10-31', contasReceber: P_CR, contasPagar: cps, movimentos: P_MOV, aliquota: 6 });
    // outubro: 3500 - 30 de taxa = 3470 de faturamento, 6% = 208,20 (estimado)
    assert.deepStrictEqual(p.imposto.porMes, { '2026-10': 208.2 });
    assert.strictEqual(p.imposto.estimado, true);
    assert.strictEqual(p.porGrupo.imposto, 208.2);
    assert.strictEqual(p.saidas, 1038.2);
    const vazio = R.resultadoDoPeriodo({ de: '2026-10-11', ate: '2026-10-10', ...P_BASE });
    assert.strictEqual(vazio.entradas, 0);
    assert.strictEqual(vazio.saidas, 0);
});

test('periodo parcial: guia paga no periodo com referencia fora dele conta pela data de pagamento', () => {
    const cps = [
        ...P_CP.filter(cp => cp.categoria !== 'imposto'),
        { id: 7, categoria: 'imposto', valor: 120, status: 'Pago', mes_referencia: '2026-09', data_vencimento: '2026-10-20', data_pagamento: '2026-10-20' },
        { id: 8, categoria: 'imposto', valor: 90, status: 'Pendente', mes_referencia: '2026-10', data_vencimento: '2026-11-07', data_pagamento: null },
        { id: 9, categoria: 'imposto', valor: 70, status: 'Pago', mes_referencia: '2026-10', data_vencimento: '2026-11-20', data_pagamento: '2026-11-20' }
    ];
    const base = { contasReceber: P_CR, contasPagar: cps, movimentos: P_MOV, aliquota: 6 };
    // 30 dias sem mes inteiro: so a guia paga dentro do periodo (a em aberto e a paga depois ficam de fora).
    const p = R.resultadoDoPeriodo({ de: '2026-10-10', ate: '2026-11-08', ...base });
    assert.strictEqual(p.imposto.valor, 120);
    assert.strictEqual(p.imposto.estimado, false);
    assert.deepStrictEqual(p.imposto.porMes, {});
    assert.deepStrictEqual(p.imposto.pagas, [{ data: '2026-10-20', valor: 120, cp_id: 7 }]);
    assert.strictEqual(p.porGrupo.imposto, 120);
    assert.strictEqual(p.saidas, 830 + 120);
    // Mes inteiro: continua pela referencia (guias de 2026-10 = 160), a guia de setembro paga em outubro nao entra.
    const m = R.resultadoDoPeriodo({ de: '2026-10-01', ate: '2026-10-31', ...base });
    const rm = R.resultadoDoMes({ mes: '2026-10', ...base });
    assert.strictEqual(m.imposto.valor, 160);
    assert.strictEqual(m.saidas, rm.saidas);
    assert.deepStrictEqual(m.imposto.pagas, []);
    // Mes inteiro + pedaco: a guia de referencia 2026-10 paga no pedaco (20/11) nao conta de novo.
    const mp = R.resultadoDoPeriodo({ de: '2026-10-01', ate: '2026-11-25', ...base });
    assert.strictEqual(mp.imposto.valor, 160);
});
