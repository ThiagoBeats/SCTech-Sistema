'use strict';
// Pendencias R1, tarefa 6: Visao Geral, Resultado, fechamento e simulador (nucleos).
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/resultado-core.js');
const C = require('../js/caixa-core.js');
const F = require('../js/fechamento-core.js');
const FC = require('../js/financeiro-core.js');
const S = require('../js/simulador-core.js');

const CARTAO = { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 };

// ---- Visao Geral / Resultado: cartao sem movimento nas datas de repasse ----
test('recebimento no cartao sem movimento (sem conta) entra em cada repasse, nao na data da baixa', () => {
    const maq = { id: 7, tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2099-01-01', cartao: { ...CARTAO, credito_dias: 10 } };
    const cr = { id: 1, status: 'Pago', valor: 900, data_pagamento: '2026-10-25', conta_id: 7, cartao: { tipo: 'credito', vezes: 3, antecipar: false } };
    // 3x: repasses a cada 30 dias a partir da baixa (bruto 300 cada)
    const out = R.entradasDoMes({ mes: '2026-10', contasReceber: [cr], movimentos: [], contas: [maq] });
    assert.strictEqual(out.total, 0);
    assert.strictEqual(R.entradasDoMes({ mes: '2026-11', contasReceber: [cr], movimentos: [], contas: [maq] }).total, 300);
    // 1x usa os dias da conta (10 dias): cai em novembro
    const cr1 = { ...cr, cartao: { tipo: 'credito', vezes: 1 } };
    assert.deepStrictEqual(R.entradasDoMes({ mes: '2026-11', contasReceber: [cr1], movimentos: [], contas: [maq] }).itens, [{ data: '2026-11-04', valor: 900, cr_id: 1 }]);
    // Sem conta: dias padrao (30)
    const semConta = { ...cr1, conta_id: null };
    assert.strictEqual(R.entradasDoMes({ mes: '2026-11', contasReceber: [semConta], movimentos: [], contas: [] }).itens[0].data, '2026-11-24');
    // Recebimento antigo (sem cartao) continua pela data do pagamento
    const antigo = { id: 2, status: 'Pago', valor: 500, data_pagamento: '2026-10-25' };
    assert.strictEqual(R.entradasDoMes({ mes: '2026-10', contasReceber: [antigo], movimentos: [] }).total, 500);
});

// ---- Extrato: recebimentos sem movimento ----
test('recebimentosSemMovimento conta so os do periodo que nao passaram por conta', () => {
    const contasReceber = [
        { id: 1, status: 'Pago', valor: 500, data_pagamento: '2026-10-05' },
        { id: 2, status: 'Pago', valor: 250.5, data_pagamento: '2026-10-20' },
        { id: 3, status: 'Pago', valor: 999, data_pagamento: '2026-11-02' },
        { id: 4, status: 'Pago', valor: 700, data_pagamento: '2026-10-07' },
        { id: 5, status: 'Pendente', valor: 100, data_vencimento: '2026-10-07' }
    ];
    const movimentos = [{ id: 1, conta_id: 1, data: '2026-10-07', sentido: 'entrada', valor: 700, origem: 'cr', origem_id: 4 }];
    assert.deepStrictEqual(R.recebimentosSemMovimento({ de: '2026-10-01', ate: '2026-10-31', contasReceber, movimentos }), { qtd: 2, valor: 750.5 });
    assert.deepStrictEqual(R.recebimentosSemMovimento({ de: '2026-12-01', ate: '2026-12-31', contasReceber, movimentos }), { qtd: 0, valor: 0 });
});

// ---- Visao Geral: periodo que corta um mes ----
test('resultadoDoPeriodo diz quando o periodo pega so um pedaco de algum mes', () => {
    const base = { contasReceber: [], contasPagar: [], movimentos: [], aliquota: 6 };
    assert.strictEqual(R.resultadoDoPeriodo({ de: '2026-10-01', ate: '2026-10-31', ...base }).imposto.cortaMes, false);
    assert.strictEqual(R.resultadoDoPeriodo({ de: '2026-09-01', ate: '2026-10-31', ...base }).imposto.cortaMes, false);
    assert.strictEqual(R.resultadoDoPeriodo({ de: '2026-10-05', ate: '2026-10-31', ...base }).imposto.cortaMes, true);
    assert.strictEqual(R.resultadoDoPeriodo({ de: '2026-10-01', ate: '2026-11-12', ...base }).imposto.cortaMes, true);
});

// ---- Previsto ate o fim do mes ----
test('aCairNoMes: taxa dos repasses ja baixados que ainda vao cair sai do faturamento; transferencia nao conta', () => {
    const contasReceber = [{ id: 1, status: 'Pago', valor: 1000, data_pagamento: '2026-11-02' }];
    const contasPagar = [
        { id: 10, categoria: 'taxa_cartao', valor: 30, status: 'Pago', data_vencimento: '2026-11-20', data_pagamento: '2026-11-20', origem_cr_id: 1 },
        { id: 11, categoria: 'imposto', valor: 80, status: 'Pago', data_pagamento: '2026-11-25', mes_referencia: '2026-11' }
    ];
    const movimentos = [
        { id: 1, conta_id: 1, data: '2026-11-20', sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 1 },
        { id: 2, conta_id: 1, data: '2026-11-20', sentido: 'saida', valor: 30, origem: 'cp', origem_id: 10 },
        { id: 3, conta_id: 1, data: '2026-11-22', sentido: 'saida', valor: 400, origem: 'transferencia' },
        { id: 4, conta_id: 2, data: '2026-11-22', sentido: 'entrada', valor: 400, origem: 'transferencia' },
        { id: 5, conta_id: 1, data: '2026-12-20', sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 1 }
    ];
    const a = R.aCairNoMes({ mes: '2026-11', hoje: '2026-11-14', contasReceber, contasPagar, movimentos });
    assert.deepStrictEqual(a, { entradas: 1000, saidas: 30, taxas: 30 });
    // No previsto: faturamento = ate hoje + entradas previstas - taxas previstas -> imposto 6% de 970 (nao de 1000 nem de 1400)
    const ateHoje = R.resultadoDoMes({ mes: '2026-11', contasReceber, contasPagar: [], movimentos, aliquota: 6, ateData: '2026-11-14' });
    const p = R.previstoDoMes({ mes: '2026-11', ateHoje, entradasPrevistas: a.entradas, saidasPrevistas: a.saidas, taxasPrevistas: a.taxas, contasPagar: [], aliquota: 6 });
    assert.strictEqual(p.faturamento, 970);
    assert.strictEqual(p.imposto.valor, 58.2);
});

// ---- Despesas fixas: D4 e a mesma despesa lancada a mao ----
test('D4: despesa fixa antiga sem data de inicio vale a partir do mes do cadastro (id = Date.now())', () => {
    const id = new Date(2026, 9, 15, 10, 0, 0).getTime(); // cadastrada em 15/10/2026
    const df = { id, descricao: 'Internet', valor: 150, dia_vencimento: 10, ativo: true };
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-09', contasPagar: [], despesasFixas: [df] }), 0);
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-10', contasPagar: [], despesasFixas: [df] }), 150);
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-12', contasPagar: [], despesasFixas: [df] }), 150);
    // id que nao parece horario: continua valendo sempre
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2020-01', contasPagar: [], despesasFixas: [{ ...df, id: 7 }] }), 150);
    // data_inicio vence o id
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-09', contasPagar: [], despesasFixas: [{ ...df, data_inicio: '2026-01-01' }] }), 150);
});

test('despesa fixa antiga + a mesma conta avulsa no mesmo mes conta uma vez so', () => {
    const df = { id: 3, descricao: 'Aluguel', valor: 2000, dia_vencimento: 5, ativo: true, categoria: 'aluguel' };
    const avulsa = { id: 50, tipo: 'variavel', categoria: 'aluguel', descricao: ' aluguel ', valor: 2000.004, status: 'Pago', data_vencimento: '2026-10-06' };
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-10', contasPagar: [avulsa], despesasFixas: [df] }), 2000);
    // Outro valor: sao despesas diferentes
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-10', contasPagar: [{ ...avulsa, valor: 1800 }], despesasFixas: [df] }), 3800);
    // Avulsa que nao entra nas fixas (categoria Outros): a DF continua contando (uma vez)
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-10', contasPagar: [{ ...avulsa, categoria: 'outro' }], despesasFixas: [df] }), 2000);
    // Gerada da DF (ligada pelo id), mesmo com outra descricao
    const gerada = { id: 51, tipo: 'variavel', categoria: 'aluguel', descricao: 'Aluguel loja', despesa_fixa_id: 3, valor: 2100, status: 'Pendente', data_vencimento: '2026-10-05' };
    assert.strictEqual(R.despesasFixasDoMes({ mes: '2026-10', contasPagar: [gerada], despesasFixas: [df] }), 2100);
});

// ---- Margem: memo por chave ----
test('criarMemo: mesma chave nao recalcula; chave nova recalcula', () => {
    const memo = R.criarMemo();
    let n = 0;
    const calc = () => { n++; return { pct: n }; };
    assert.deepStrictEqual(memo('a', calc), { pct: 1 });
    assert.deepStrictEqual(memo('a', calc), { pct: 1 });
    assert.strictEqual(n, 1);
    assert.deepStrictEqual(memo('b', calc), { pct: 2 });
    assert.strictEqual(n, 2);
});

// ---- Fechamento ----
test('conferencia: conta sem data de saldo inicial entra com o saldo inicial desde sempre', () => {
    const contas = [{ id: 1, nome: 'Caixa antigo', saldo_inicial: 200 }, { id: 2, nome: 'Banco', saldo_inicial: 0, data_saldo_inicial: '2026-01-01' }];
    const movimentos = [{ conta_id: 1, data: '2025-05-01', sentido: 'entrada', valor: 50, origem: 'cr' }, { conta_id: 1, data: '2026-11-01', sentido: 'saida', valor: 10, origem: 'cp' }];
    const linhas = F.contasDaConferencia({ mes: '2026-10', contas, movimentos, saldoConta: C.saldoConta, ignorarAjustesDe: null });
    assert.deepStrictEqual(linhas, [{ conta_id: 1, nome: 'Caixa antigo', esperado: 250 }, { conta_id: 2, nome: 'Banco', esperado: 0 }]);
});

test('alta de grupo nao sugere o Imposto (a guia ja tem a sua sugestao)', () => {
    const s = F.sugestoesDoMes({ resultado: 10, entradas: 10, meta: 0, orcamento: [], porGrupo: { imposto: 900, outros: 400 }, porGrupoAnterior: { imposto: 300, outros: 100 },
        rotuloAnterior: 'setembro', pendencias: { receber_valor: 0 }, impostoEstimado: false, rotuloMes: 'outubro',
        grupos: [{ id: 'imposto', rotulo: 'Imposto' }, { id: 'outros', rotulo: 'Outros' }] });
    assert.deepStrictEqual(s, ['Outros subiu 300% em relação a setembro.']);
});

// ---- R4: parcelas ----
test('somarMesesData: dia que nao existe vira o ultimo dia do mes, sem acumular', () => {
    assert.strictEqual(FC.somarMesesData('2026-01-31', 0), '2026-01-31');
    assert.strictEqual(FC.somarMesesData('2026-01-31', 1), '2026-02-28');
    assert.strictEqual(FC.somarMesesData('2026-01-31', 2), '2026-03-31');
    assert.strictEqual(FC.somarMesesData('2028-01-30', 1), '2028-02-29');
    assert.strictEqual(FC.somarMesesData('2026-11-30', 3), '2027-02-28');
    assert.strictEqual(FC.somarMesesData('2026-12-15', 1), '2027-01-15');
});

test('simulador usa a mesma regra das parcelas', () => {
    const p = S.pagamentosDaCompra({ valor: 300, forma: 'parcelado', parcelas: 3, dataCompra: '2026-01-10', dataPrimeira: '2026-01-31' }).pagamentos;
    assert.deepStrictEqual(p.map(x => x.data), ['2026-01-31', '2026-02-28', '2026-03-31']);
    assert.deepStrictEqual(p.map(x => x.data), [0, 1, 2].map(i => FC.somarMesesData('2026-01-31', i)));
});

// ---- Grafico de fluxo da Visao Geral: mesmo motor da previsao do Hoje ----
test('lancamentosPrevistos: cartao a cair e cartao previsto pelo liquido nas datas de repasse', () => {
    const maq = { id: 3, tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', cartao: CARTAO };
    const meios = [{ id: 9, tipo: 'cartao_credito', conta_id: 3 }];
    const l = C.lancamentosPrevistos({
        hoje: '2026-11-14', limite: '2027-01-31', contas: [maq], meios,
        movimentos: [
            { conta_id: 3, data: '2026-11-20', sentido: 'entrada', valor: 1000, origem: 'cr' },
            { conta_id: 3, data: '2026-11-20', sentido: 'saida', valor: 30, origem: 'cp' },
            { conta_id: 3, data: '2026-11-10', sentido: 'entrada', valor: 77, origem: 'cr' }
        ],
        contasReceber: [{ id: 1, status: 'Pendente', valor: 500, data_vencimento: '2026-11-16', meio_previsto: { meio_id: 9, vezes: 1 } }],
        contasPagar: [{ id: 2, status: 'Atrasado', valor: 80, data_vencimento: '2026-11-01' }],
        despesasFixas: []
    });
    assert.deepStrictEqual(l, [
        { data: '2026-11-20', valor: 1000, sentido: 'entrada', atrasado: false },
        { data: '2026-11-20', valor: 30, sentido: 'saida', atrasado: false },
        { data: '2026-12-16', valor: 485, sentido: 'entrada', atrasado: false },
        { data: '2026-11-14', valor: 80, sentido: 'saida', atrasado: true }
    ]);
});
