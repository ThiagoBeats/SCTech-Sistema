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
        { id: 2, status: 'Em Produção', valor: 3000, data_aprovacao: '2026-03-31' },
        { id: 3, status: 'Orçamento', valor: 9999, data_aprovacao: '2026-03-10' },
        { id: 4, status: 'Instalado', valor: 500, data_aprovacao: '2026-04-02' },
        { id: 5, status: 'Instalado', valor: 700 }
    ];
    assert.deepStrictEqual(D.ticketMedio({ pedidos, de: '2026-03-01', ate: '2026-03-31' }), { valor: 2000, qtd: 2 });
    assert.deepStrictEqual(D.ticketMedio({ pedidos, de: '2026-05-01', ate: '2026-05-31' }), { valor: 0, qtd: 0 });
    assert.strictEqual(D.periodoAnterior(), null);
    assert.strictEqual(D.periodoAnterior('2026-03-31', '2026-03-01'), null);
    assert.deepStrictEqual(D.periodoAnterior('2026-03-01', '2026-03-31'), { de: '2026-02-01', ate: '2026-02-28' });
    assert.deepStrictEqual(D.periodoAnterior('2026-01-01', '2026-03-31'), { de: '2025-10-01', ate: '2025-12-31' });
    assert.deepStrictEqual(D.periodoAnterior('2026-03-10', '2026-03-19'), { de: '2026-02-28', ate: '2026-03-09' });
    assert.strictEqual(D.variacao(110, 100), 10);
    assert.strictEqual(D.variacao(5, 0), null);
    assert.strictEqual(D.variacao(-50, -100), 50);
});

test('calcularMeses devolve 12 meses e o total do ano', () => {
    const r = D.calcularMeses({ regime: 'caixa', ano: 2026, ...dadosMarco() });
    assert.strictEqual(r.meses.length, 12);
    assert.strictEqual(r.meses[2].linhas.liquido, 450);
    assert.strictEqual(r.total.linhas.receitas, 1000);
    Object.keys(r.total.linhas).forEach(k => assert.strictEqual(r.total.linhas[k], Math.round(r.meses.reduce((t, m) => t + m.linhas[k], 0) * 100) / 100, k));
    assert.strictEqual(r.total.porCategoria.cat_aluguel, 200);
});

test('categoria desconhecida ou de tipo contrario cai na do legado', () => {
    const base = { regime: 'caixa', de: '2026-03-01', ate: '2026-03-31' };
    const r = D.calcular({ ...base, contas_receber: [cr({ id: 1, pedido_id: 1, valor: 100, categoria_id: 'cat_tecido', data_pagamento: '2026-03-01' }), cr({ id: 2, valor: 50, categoria_id: 'nao_existe', data_pagamento: '2026-03-31' })],
        contas_pagar: [cp({ id: 1, categoria: 'aluguel', valor: 30, categoria_id: 'cat_vendas', data_pagamento: '2026-03-01' }), cp({ id: 2, categoria: 'tecido', valor: 20, categoria_id: 'nao_existe', data_pagamento: '2026-03-31' })] });
    assert.strictEqual(r.porCategoria.cat_vendas, 100);
    assert.strictEqual(r.porCategoria.cat_outras_rec, 50);
    assert.strictEqual(r.porCategoria.cat_aluguel, 30);
    assert.strictEqual(r.porCategoria.cat_tecido, 20);
    assert.strictEqual(r.linhas.receitas, 150);
});

test('datas inclusivas, CR cancelada e competência sem data_competencia', () => {
    const d = { contas_receber: [cr({ id: 1, valor: 10, data_pagamento: '2026-03-01' }), cr({ id: 2, valor: 20, data_pagamento: '2026-03-31' }), cr({ id: 3, valor: 40, data_pagamento: '2026-04-01' }),
        cr({ id: 4, valor: 80, status: 'Cancelado', data_vencimento: '2026-03-10', data_pagamento: '2026-03-10' })], contas_pagar: [cp({ id: 1, categoria: 'aluguel', valor: 5, status: 'Pendente', data_pagamento: '2026-03-15' })] };
    assert.strictEqual(D.calcular({ regime: 'caixa', de: '2026-03-01', ate: '2026-03-31', ...d }).linhas.receitas, 30);
    const c = D.calcular({ regime: 'competencia', de: '2026-03-01', ate: '2026-03-31', ...d });
    assert.strictEqual(c.linhas.receitas, 30);
    assert.strictEqual(c.linhas.despesas, 5);
});

// ---- Tabela por periodos, AV e AH ----
const crc = (id, v, data, cat) => ({ id, valor: v, status: 'Aberto', categoria_id: cat, data_competencia: data, data_vencimento: data });
const cpc = (id, v, data, cat) => ({ id, valor: v, status: 'Aberto', categoria_id: cat, data_competencia: data, data_vencimento: data });
const linha = (t, k) => t.linhas.find(l => l.chave === k);
const catDre = (id, nome, grupo, tipo, extra) => Object.assign({ id, nome, grupo, tipo, natureza: 'dre', ativo: true }, extra || {});

test('periodos: trimestral, mensal parcial, semestral, anual e personalizado', () => {
    assert.deepStrictEqual(D.periodos('2026-01-01', '2026-12-31', 'trimestral').map(p => p.rotulo), ['1º tri/26', '2º tri/26', '3º tri/26', '4º tri/26']);
    const m = D.periodos('2026-01-15', '2026-03-14', 'mensal');
    assert.strictEqual(m.length, 3);
    assert.deepStrictEqual(m[0], { de: '2026-01-15', ate: '2026-01-31', rotulo: '15/01–31/01' });
    assert.strictEqual(m[1].rotulo, 'Fev/26');
    assert.strictEqual(m[2].ate, '2026-03-14');
    assert.deepStrictEqual(D.periodos('2026-01-01', '2026-12-31', 'semestral').map(p => p.rotulo), ['1º sem/26', '2º sem/26']);
    assert.deepStrictEqual(D.periodos('2025-01-01', '2026-12-31', 'anual').map(p => p.rotulo), ['2025', '2026']);
    assert.deepStrictEqual(D.periodos('2026-01-15', '2026-03-14', 'personalizado'), [{ rotulo: '15/01/26–14/03/26', de: '2026-01-15', ate: '2026-03-14' }]);
    assert.deepStrictEqual(D.periodos('2026-03-01', '2026-01-01', 'mensal'), []);
});

test('tabela: ano vazio tem todas as linhas fixas com zeros e AV/AH nulos', () => {
    const t = D.tabela({ regime: 'competencia', de: '2026-01-01', ate: '2026-12-31', intervalo: 'mensal' });
    assert.strictEqual(t.periodos.length, 12);
    const chaves = t.linhas.map(l => l.chave);
    ['receitas', 'custos', 'margem', 'margem_pct', 'despesas', 'resultadoOperacional', 'investimento', 'financiamento', 'liquido', 'cat:cat_vendas'].forEach(k => assert.ok(chaves.includes(k), k));
    const ix = k => chaves.indexOf(k);
    assert.ok(ix('receitas') < ix('custos') && ix('custos') < ix('margem') && ix('margem') < ix('margem_pct') && ix('margem_pct') < ix('despesas')
        && ix('despesas') < ix('resultadoOperacional') && ix('resultadoOperacional') < ix('investimento') && ix('investimento') < ix('financiamento') && ix('financiamento') < ix('liquido'));
    t.linhas.filter(l => l.tipo !== 'percentual').forEach(l => { assert.strictEqual(l.total, 0); assert.ok(l.valores.every(v => v === 0)); });
    assert.ok(D.analiseVertical(t).receitas.every(v => v === null));
    assert.ok(D.analiseHorizontal(t).receitas.every(x => x.pct === null));
});

test('AV do PDF: receitas 50.000 e custos 10.000', () => {
    const t = D.tabela({ regime: 'competencia', de: '2026-01-01', ate: '2026-01-31', intervalo: 'mensal',
        contas_receber: [crc(1, 15000, '2026-01-10', 'c'), crc(2, 20000, '2026-01-11', 'p'), crc(3, 15000, '2026-01-12', 'i')],
        contas_pagar: [cpc(1, 10000, '2026-01-13', 'k')],
        categorias: [catDre('c', 'Cortinas', 'receitas', 'entrada'), catDre('p', 'Persianas', 'receitas', 'entrada'),
            catDre('i', 'Instalações', 'receitas', 'entrada'), catDre('k', 'Tecido', 'custos', 'saida')] });
    const av = D.analiseVertical(t);
    assert.deepStrictEqual([av.receitas[0], av['cat:c'][0], av['cat:p'][0], av['cat:i'][0], av.custos[0], av.margem[0]], [100, 30, 40, 30, 20, 80]);
    assert.strictEqual(linha(t, 'margem_pct').total, 80);
});

function dadosAH() {
    return { regime: 'competencia',
        categorias: [catDre('c', 'Cortinas', 'receitas', 'entrada'), catDre('p', 'Persianas', 'receitas', 'entrada'), catDre('k', 'Tecido', 'custos', 'saida'),
            catDre('d', 'Aluguel', 'despesas', 'saida', { subgrupo_id: 'sub_fix' })],
        contas_receber: [crc(1, 5000, '2026-01-10', 'c'), crc(2, 15000, '2026-01-10', 'p'), crc(3, 15000, '2026-02-10', 'c'), crc(4, 15000, '2026-02-11', 'p')],
        contas_pagar: [cpc(1, 8000, '2026-01-12', 'k'), cpc(2, 5000, '2026-01-12', 'd'), cpc(3, 12000, '2026-02-12', 'k'), cpc(4, 6000, '2026-02-12', 'd')] };
}

test('AH do PDF: janeiro para fevereiro', () => {
    const t = D.tabela(Object.assign(dadosAH(), { de: '2026-01-01', ate: '2026-02-28', intervalo: 'mensal' }));
    const ah = D.analiseHorizontal(t);
    assert.deepStrictEqual(ah.receitas[0], { pct: null, acima999: false, seta: null, favoravel: null });
    assert.deepStrictEqual(ah.receitas[1], { pct: 50, acima999: false, seta: 'up', favoravel: true });
    assert.strictEqual(ah['cat:c'][1].pct, 200);
    assert.deepStrictEqual(ah.custos[1], { pct: 50, acima999: false, seta: 'up', favoravel: false });
    assert.deepStrictEqual(linha(t, 'resultadoOperacional').valores, [7000, 12000]);
    assert.strictEqual(ah.resultadoOperacional[1].pct, 71.43);
    assert.strictEqual(linha(t, 'custos').sinal, 'saida');
});

test('AH: base zero, acima de 999% e resultado negativo', () => {
    const mk = vals => ({ linhas: [{ chave: 'x', tipo: 'calculada', sinal: 'resultado', valores: vals }] });
    assert.strictEqual(D.analiseHorizontal(mk([0, 50])).x[1].pct, null);
    assert.strictEqual(D.analiseHorizontal(mk([100, 1200])).x[1].acima999, true);
    assert.deepStrictEqual(D.analiseHorizontal(mk([-5000, 2000])).x[1], { pct: 140, acima999: false, seta: 'up', favoravel: true });
    assert.strictEqual(D.analiseHorizontal(mk([-5000, -7000])).x[1].favoravel, false);
});

test('tabela: categoria inativa com lançamento aparece e entra no total; sem valor some', () => {
    const d = dadosAH();
    d.categorias.push(catDre('z', 'Antiga', 'despesas', 'saida', { ativo: false }), catDre('y', 'Velha sem uso', 'despesas', 'saida', { ativo: false }));
    d.contas_pagar.push(cpc(9, 700, '2026-01-20', 'z'));
    const t = D.tabela(Object.assign(d, { de: '2026-01-01', ate: '2026-02-28', intervalo: 'mensal' }));
    assert.strictEqual(linha(t, 'cat:z').inativa, true);
    assert.strictEqual(linha(t, 'cat:z').total, 700);
    assert.strictEqual(linha(t, 'cat:y'), undefined);
    assert.strictEqual(linha(t, 'despesas').total, 11000 + 700);
});

test('tabela: valores de cada linha batem com calcular de cada mês', () => {
    const d = dadosAH();
    d.contas_pagar.push(cpc(7, 300, '2026-07-04', 'd'), cpc(8, 90, '2026-12-31', 'k'));
    d.contas_receber.push(crc(9, 100, '2026-06-30', 'c'));
    const t = D.tabela(Object.assign({}, d, { de: '2026-01-01', ate: '2026-12-31', intervalo: 'mensal' }));
    assert.strictEqual(t.periodos.length, 12);
    t.periodos.forEach((per, i) => {
        const c = D.calcular(Object.assign({}, d, { de: per.de, ate: per.ate }));
        Object.keys(c.linhas).forEach(k => assert.strictEqual(linha(t, k).valores[i], c.linhas[k], k + ' ' + per.rotulo));
        Object.keys(c.porCategoria).forEach(k => assert.strictEqual(linha(t, 'cat:' + k).valores[i], c.porCategoria[k]));
    });
    const anual = D.calcular(Object.assign({}, d, { de: '2026-01-01', ate: '2026-12-31' }));
    Object.keys(anual.linhas).forEach(k => assert.strictEqual(linha(t, k).total, anual.linhas[k]));
});

test('periodos: virada de ano e fevereiro bissexto', () => {
    const p = D.periodos('2025-12-15', '2026-02-10', 'mensal');
    assert.deepStrictEqual(p, [
        { rotulo: '15/12–31/12', de: '2025-12-15', ate: '2025-12-31' },
        { rotulo: 'Jan/26', de: '2026-01-01', ate: '2026-01-31' },
        { rotulo: '01/02–10/02', de: '2026-02-01', ate: '2026-02-10' }
    ]);
    const b = D.periodos('2028-02-01', '2028-02-29', 'mensal');
    assert.deepStrictEqual(b, [{ rotulo: 'Fev/28', de: '2028-02-01', ate: '2028-02-29' }]);
    assert.strictEqual(D.periodos('2028-01-01', '2028-12-31', 'mensal')[1].ate, '2028-02-29');
});

test('tabela: despesas com categoria em subgrupo e sem subgrupo; margem_pct nula sem receita; AV sem -0', () => {
    const t = D.tabela({ regime: 'competencia', de: '2026-01-01', ate: '2026-02-28', intervalo: 'mensal',
        categorias: [catDre('d1', 'Aluguel', 'despesas', 'saida', { subgrupo_id: 'sub_fix' }), catDre('d2', 'Avulsa', 'despesas', 'saida')],
        contas_pagar: [cpc(1, 100, '2026-01-10', 'd1'), cpc(2, 50, '2026-02-10', 'd2')] });
    assert.deepStrictEqual([linha(t, 'cat:d1').nivel, linha(t, 'cat:d1').pai], [2, 'sub:sub_fix']);
    assert.deepStrictEqual([linha(t, 'cat:d2').nivel, linha(t, 'cat:d2').pai], [1, 'despesas']);
    assert.strictEqual(linha(t, 'sub:sub_fix').total, 100);
    assert.deepStrictEqual(linha(t, 'margem_pct').valores, [null, null]);
    assert.strictEqual(linha(t, 'margem_pct').total, null);
    const av = D.analiseVertical({ linhas: [{ chave: 'receitas', tipo: 'grupo', valores: [100000] }, { chave: 'x', tipo: 'calculada', valores: [-1] }] });
    assert.ok(Object.is(av.x[0], 0));
});
