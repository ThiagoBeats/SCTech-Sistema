'use strict';
// Pendencias R2/R3, tarefa 3: sobras da rodada 1 (nucleos).
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/resultado-core.js');
const C = require('../js/caixa-core.js');

const saidasDoMes = (lanc, mes) => lanc.filter(l => l.sentido === 'saida' && l.data.slice(0, 7) === mes).map(l => l.valor);

test('previsao do caixa: despesa fixa antiga + a mesma conta lancada a mao no mes conta uma vez so', () => {
    const df = { id: 3, descricao: 'Aluguel', valor: 2000, dia_vencimento: 5, ativo: true, categoria: 'aluguel' };
    const avulsa = { id: 50, tipo: 'variavel', categoria: 'aluguel', descricao: ' aluguel ', valor: 2000.004, status: 'Pendente', data_vencimento: '2026-12-06' };
    const lanc = C.lancamentosPrevistos({ hoje: '2026-11-14', limite: '2026-12-31', movimentos: [], contasReceber: [], contasPagar: [avulsa], despesasFixas: [df], contas: [], meios: [] });
    // dezembro: so a conta (a fixa ja esta lancada a mao); novembro (dia 5 ja passou): a fixa, atrasada, cai hoje
    assert.deepStrictEqual(saidasDoMes(lanc, '2026-12'), [2000.004]);
    assert.deepStrictEqual(saidasDoMes(lanc, '2026-11'), [2000]);
    // Outro valor: sao despesas diferentes
    const lanc2 = C.lancamentosPrevistos({ hoje: '2026-11-14', limite: '2026-12-31', movimentos: [], contasReceber: [], contasPagar: [{ ...avulsa, valor: 1800 }], despesasFixas: [df], contas: [], meios: [] });
    assert.deepStrictEqual(saidasDoMes(lanc2, '2026-12').sort(), [1800, 2000]);
    // Ligada pelo despesa_fixa_id, com outra descricao e outro valor
    const gerada = { id: 51, tipo: 'variavel', categoria: 'aluguel', descricao: 'Aluguel loja', despesa_fixa_id: 3, valor: 2100, status: 'Pendente', data_vencimento: '2026-12-05' };
    const lanc3 = C.lancamentosPrevistos({ hoje: '2026-11-14', limite: '2026-12-31', movimentos: [], contasReceber: [], contasPagar: [gerada], despesasFixas: [df], contas: [], meios: [] });
    assert.deepStrictEqual(saidasDoMes(lanc3, '2026-12'), [2100]);
});

test('previsao do caixa: uma conta cobre no maximo uma fixa antiga', () => {
    const df1 = { id: 3, descricao: 'Salário', valor: 2000, dia_vencimento: 20, ativo: true, categoria: 'salario' };
    const df2 = { ...df1, id: 4 };
    const fixo = { id: 50, tipo: 'fixo', categoria: 'salario', descricao: 'Salário', valor: 2000, status: 'Pendente', data_vencimento: '2026-11-20' };
    const lanc = C.lancamentosPrevistos({ hoje: '2026-11-14', limite: '2026-11-30', movimentos: [], contasReceber: [], contasPagar: [fixo], despesasFixas: [df1, df2], contas: [], meios: [] });
    // a conta + uma das fixas
    assert.deepStrictEqual(saidasDoMes(lanc, '2026-11'), [2000, 2000]);
});

test('fixasCobertasNoMes: mesma regra que o Resultado usa', () => {
    const df1 = { id: 3, descricao: 'Salário', valor: 2000, dia_vencimento: 5, ativo: true, categoria: 'salario' };
    const df2 = { ...df1, id: 4 };
    const avulsa = { id: 50, tipo: 'variavel', categoria: 'salario', descricao: 'Salário', valor: 2000, status: 'Pendente', data_vencimento: '2026-10-05' };
    const ligada = { ...avulsa, id: 52, despesa_fixa_id: 4 };
    const cob = R.fixasCobertasNoMes({ mes: '2026-10', contasPagar: [ligada], fixas: [df1, df2] });
    assert.deepStrictEqual([...cob], [df2]);
    // categoria fora das fixas nao cobre pela descricao
    assert.strictEqual(R.fixasCobertasNoMes({ mes: '2026-10', contasPagar: [{ ...avulsa, categoria: 'outro' }], fixas: [df1] }).size, 0);
    // conta de outro mes nao cobre
    assert.strictEqual(R.fixasCobertasNoMes({ mes: '2026-11', contasPagar: [avulsa], fixas: [df1] }).size, 0);
});
