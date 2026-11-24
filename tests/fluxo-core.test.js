'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FluxoCore = require('../js/fluxo-core.js');

function base() {
    return {
        de: '2026-11-01', ate: '2026-11-30', hoje: '2026-11-20', contaId: null, categoriaId: null,
        contas: [
            { id: 1, nome: 'A', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01', ativo: true, tipo: 'banco' },
            { id: 2, nome: 'B', saldo_inicial: 0, data_saldo_inicial: '2026-10-01', ativo: true, tipo: 'banco' }
        ],
        movimentos: [
            { id: 1, conta_id: 1, data: '2026-11-05', sentido: 'entrada', valor: 500, origem: 'cr', origem_id: 1 },
            { id: 2, conta_id: 1, data: '2026-11-10', sentido: 'saida', valor: 200, origem: 'cp', origem_id: 1 },
            { id: 3, conta_id: 1, data: '2026-11-12', sentido: 'saida', valor: 300, origem: 'transferencia', origem_id: null, grupo_id: 't1' },
            { id: 4, conta_id: 2, data: '2026-11-12', sentido: 'entrada', valor: 300, origem: 'transferencia', origem_id: null, grupo_id: 't1' },
            { id: 5, conta_id: 1, data: '2026-10-15', sentido: 'saida', valor: 50, origem: 'ajuste', origem_id: null }
        ],
        contasReceber: [
            { id: 1, valor: 500, status: 'Pago', data_vencimento: '2026-11-05', pedido_id: 9 },
            { id: 2, valor: 400, status: 'Aberto', data_vencimento: '2026-11-25', pedido_id: 9 }
        ],
        contasPagar: [
            { id: 1, valor: 200, status: 'Pago', data_vencimento: '2026-11-10', categoria_id: 'cat_aluguel' },
            { id: 2, valor: 999, status: 'Cancelado', data_vencimento: '2026-11-26', categoria_id: 'cat_aluguel' }
        ],
        despesasFixas: [], meios: []
    };
}

test('resumo consolidado: transferencia fora das entradas/saidas', () => {
    const r = FluxoCore.resumo(base());
    assert.strictEqual(r.saldoInicial, 950);
    assert.strictEqual(r.entradas, 500);
    assert.strictEqual(r.saidas, 200);
    assert.strictEqual(r.saldoFinal, 1250);
    assert.deepStrictEqual(r.previsto, { entradas: 400, saidas: 0, saldoFinal: 1650 });
});

test('resumo de uma conta: transferencia conta', () => {
    const r = FluxoCore.resumo(Object.assign(base(), { contaId: 1 }));
    assert.strictEqual(r.entradas, 500);
    assert.strictEqual(r.saidas, 500);
    assert.strictEqual(r.saldoFinal, 950);
});

test('resumo filtrado por categoria', () => {
    const r = FluxoCore.resumo(Object.assign(base(), { categoriaId: 'cat_aluguel' }));
    assert.strictEqual(r.entradas, 0);
    assert.strictEqual(r.saidas, 200);
    assert.strictEqual(r.saldoInicial, 950);
    assert.strictEqual(r.previsto.saidas, 0);
});

test('serie por mes, semana e dia', () => {
    const m = FluxoCore.serie(Object.assign(base(), { agrupar: 'mes' }));
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].rotulo, 'Nov/26');
    assert.strictEqual(m[0].saldo, 1650);
    const s = FluxoCore.serie(Object.assign(base(), { agrupar: 'semana' }));
    assert.strictEqual(s[0].rotulo, 'Sem 26/10');
    assert.strictEqual(s[0].de, '2026-11-01');
    assert.strictEqual(s[0].ate, '2026-11-01');
    assert.strictEqual(s[1].rotulo, 'Sem 02/11');
    const d = FluxoCore.serie(Object.assign(base(), { agrupar: 'dia' }));
    const p25 = d.find(x => x.rotulo === '25/11');
    assert.strictEqual(p25.previsto, true);
    assert.strictEqual(p25.entradas, 400);
    assert.strictEqual(d.find(x => x.rotulo === '05/11').previsto, false);
    assert.strictEqual(d[d.length - 1].saldo, 1650);
});

test('movimentacoes: saldo inicial, transferencia e saldo final', () => {
    const l = FluxoCore.movimentacoes(base());
    assert.strictEqual(l[0].descricao, 'Saldo inicial');
    assert.strictEqual(l[0].saldo, 950);
    const t = l.filter(x => x.transferencia);
    assert.strictEqual(t.length, 2);
    t.forEach(x => { assert.strictEqual(x.entrada, 0); assert.strictEqual(x.saida, 0); assert.strictEqual(x.origem, 'transferencia'); });
    assert.strictEqual(l[l.length - 1].saldo, 1650);
    assert.strictEqual(l[l.length - 1].previsto, true);
});
