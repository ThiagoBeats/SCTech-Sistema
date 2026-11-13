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
