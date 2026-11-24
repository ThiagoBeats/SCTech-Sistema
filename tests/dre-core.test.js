'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/dre-core.js');
const R = require('../js/resultado-core.js');

const cr = (o) => Object.assign({ status: 'Pago' }, o);
const cp = (o) => Object.assign({ status: 'Pago' }, o);

function dadosMarco() {
    return {
        contas_receber: [
            cr({ id: 1, pedido_id: 10, valor: 1000, data_vencimento: '2026-03-05', data_pagamento: '2026-03-05', data_competencia: '2026-02-20' })
        ],
        contas_pagar: [
            cp({ id: 1, categoria: 'tecido', valor: 300, data_vencimento: '2026-03-06', data_pagamento: '2026-03-06', data_competencia: '2026-03-06' }),
            cp({ id: 2, categoria: 'aluguel', valor: 200, data_vencimento: '2026-03-10', data_pagamento: '2026-03-10', data_competencia: '2026-03-10' }),
            cp({ id: 3, categoria_id: 'cat_juros', valor: 50, data_vencimento: '2026-03-12', data_pagamento: '2026-03-12', data_competencia: '2026-03-12' }),
            cp({ id: 4, categoria_id: 'cat_emprestimo_out', valor: 400, data_vencimento: '2026-03-15', data_pagamento: '2026-03-15', data_competencia: '2026-03-15' }),
            cp({ id: 5, categoria: 'tecido', valor: 999, status: 'Cancelado', data_vencimento: '2026-03-18', data_pagamento: '2026-03-18', data_competencia: '2026-03-18' })
        ],
        movimentos: [
            { id: 1, conta_id: 1, data: '2026-03-05', sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 1 },
            { id: 2, conta_id: 1, data: '2026-03-06', sentido: 'saida', valor: 300, origem: 'cp', origem_id: 1 },
            { id: 3, conta_id: 1, data: '2026-03-20', sentido: 'entrada', valor: 700, origem: 'transferencia', origem_id: null, grupo_id: 't' },
            { id: 4, conta_id: 2, data: '2026-03-20', sentido: 'saida', valor: 700, origem: 'transferencia', origem_id: null, grupo_id: 't' },
            { id: 5, conta_id: 1, data: '2026-03-25', sentido: 'entrada', valor: 80, origem: 'ajuste', origem_id: null }
        ],
        contas: [{ id: 1 }, { id: 2 }]
    };
}

test('caixa de marco: empréstimo, transferência, ajuste e cancelada ficam fora', () => {
    const r = D.calcular({ regime: 'caixa', de: '2026-03-01', ate: '2026-03-31', ...dadosMarco() });
    assert.deepStrictEqual(r.linhas, { receitas: 1000, custos: 300, margem: 700, despesas: 200, resultadoOperacional: 500, investimento: 0, financiamento: -50, liquido: 450 });
    assert.strictEqual(r.porCategoria.cat_vendas, 1000);
    assert.strictEqual(r.porCategoria.cat_aluguel, 200);
    assert.strictEqual(r.porCategoria.cat_juros, -50);
    assert.strictEqual(r.porCategoria.cat_emprestimo_out, undefined);
    assert.strictEqual(r.porSubgrupo.sub_fix, 200);
    assert.deepStrictEqual(r.lancamentos.cat_aluguel, [{ tipo: 'cp', id: 2, data: '2026-03-10', valor: 200 }]);
});

test('competência: pela data_competencia; caixa pela data do pagamento', () => {
    const d = dadosMarco();
    const fev = { de: '2026-02-01', ate: '2026-02-28' }, mar = { de: '2026-03-01', ate: '2026-03-31' };
    assert.strictEqual(D.calcular({ regime: 'competencia', ...fev, ...d }).linhas.receitas, 1000);
    assert.strictEqual(D.calcular({ regime: 'competencia', ...mar, ...d }).linhas.receitas, 0);
    assert.strictEqual(D.calcular({ regime: 'caixa', ...fev, ...d }).linhas.receitas, 0);
    assert.strictEqual(D.calcular({ regime: 'caixa', ...mar, ...d }).linhas.receitas, 1000);
    // competência conta o que ainda não foi pago, mas não o cancelado nem o so_caixa
    const c = D.calcular({ regime: 'competencia', ...mar, ...d, contas_pagar: d.contas_pagar.concat([cp({ id: 9, categoria: 'aluguel', valor: 70, status: 'Pendente', data_vencimento: '2026-03-28', data_competencia: '2026-03-28' })]) });
    assert.strictEqual(c.linhas.despesas, 270);
    assert.strictEqual(c.linhas.custos, 300);
    assert.strictEqual(c.linhas.financiamento, -50);
});

const P_CR = [
    { id: 1, valor: 3000, status: 'Pago', data_pagamento: '2026-10-05', data_vencimento: '2026-10-05', pedido_id: 50 }, // cartao 3x
    { id: 2, valor: 2000, status: 'Pago', data_pagamento: '2026-10-15', data_vencimento: '2026-10-15', pedido_id: 51 }, // sem movimento
    { id: 3, valor: 500, status: 'Pago', data_pagamento: '2026-09-30', data_vencimento: '2026-09-30', pedido_id: 52 },
    { id: 4, valor: 900, status: 'Pago', data_pagamento: '2026-10-20', data_vencimento: '2026-10-20', pedido_id: 53,
      cartao: { tipo: 'credito', vezes: 3, repasses: [{ data: '2026-10-21', bruto: 300 }, { data: '2026-11-21', bruto: 300 }, { data: '2026-12-21', bruto: 300 }] } } // cartao sem movimento
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

test('paridade com o ResultadoCore: cartão com repasses, conta sem movimento', () => {
    const base = { contas_receber: P_CR, contas_pagar: P_CP, movimentos: P_MOV };
    ['2026-10', '2026-11', '2026-12'].forEach(mes => {
        const d = D.calcular({ regime: 'caixa', de: mes + '-01', ate: mes === '2026-11' ? '2026-11-30' : mes + '-31', ...base });
        const m = R.resultadoDoMes({ mes, contasReceber: P_CR, contasPagar: P_CP, movimentos: P_MOV, aliquota: 0 });
        const l = d.linhas;
        assert.strictEqual(l.receitas, m.entradas, mes);
        assert.strictEqual(Math.round((l.custos + l.despesas + Math.abs(Math.min(l.investimento, 0)) + Math.abs(Math.min(l.financiamento, 0))) * 100), Math.round(m.saidas * 100), mes);
    });
    assert.strictEqual(D.calcular({ regime: 'caixa', de: '2026-10-01', ate: '2026-10-31', ...base }).linhas.receitas, 3800);
});

test('ticketMedio, periodoAnterior e variacao', () => {
    const pedidos = [
        { id: 1, status: 'Instalado', valor: 1000, data_aprovacao: '2026-03-05' },
        { id: 2, status: 'Aguardando Financeiro', valor: 3000, data_aprovacao: '2026-03-20' },
        { id: 3, status: 'Orçamento', valor: 9999, data_aprovacao: '2026-03-10' },
        { id: 4, status: 'Instalado', valor: 500, data_aprovacao: '2026-04-02' }
    ];
    assert.deepStrictEqual(D.ticketMedio({ pedidos, de: '2026-03-01', ate: '2026-03-31' }), { valor: 2000, qtd: 2 });
    assert.deepStrictEqual(D.ticketMedio({ pedidos, de: '2026-05-01', ate: '2026-05-31' }), { valor: 0, qtd: 0 });
    assert.deepStrictEqual(D.periodoAnterior('2026-03-01', '2026-03-31'), { de: '2026-02-01', ate: '2026-02-28' });
    assert.deepStrictEqual(D.periodoAnterior('2026-01-01', '2026-03-31'), { de: '2025-10-01', ate: '2025-12-31' });
    assert.deepStrictEqual(D.periodoAnterior('2026-03-10', '2026-03-19'), { de: '2026-02-28', ate: '2026-03-09' });
    assert.strictEqual(D.variacao(110, 100), 10);
    assert.strictEqual(D.variacao(5, 0), null);
});

test('calcularMeses devolve 12 meses e o total do ano', () => {
    const r = D.calcularMeses({ regime: 'caixa', ano: 2026, ...dadosMarco() });
    assert.strictEqual(r.meses.length, 12);
    assert.strictEqual(r.meses[2].linhas.liquido, 450);
    assert.strictEqual(r.total.linhas.receitas, 1000);
});
