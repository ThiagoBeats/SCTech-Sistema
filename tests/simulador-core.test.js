'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/simulador-core.js');

test('a vista, parcelado e entrada + parcelas; ultima absorve a diferenca', () => {
    assert.deepStrictEqual(S.pagamentosDaCompra({ valor: 1000, forma: 'avista', dataCompra: '2026-11-14' }).pagamentos, [{ data: '2026-11-14', valor: 1000, rotulo: 'À vista' }]);
    const p = S.pagamentosDaCompra({ valor: 1000, forma: 'parcelado', parcelas: 3, dataCompra: '2026-11-14', dataPrimeira: '2026-12-14' }).pagamentos;
    assert.deepStrictEqual(p.map(x => [x.data, x.valor, x.rotulo]), [['2026-12-14', 333.33, 'Parcela 1/3'], ['2027-01-14', 333.33, 'Parcela 2/3'], ['2027-02-14', 333.34, 'Parcela 3/3']]);
    const e = S.pagamentosDaCompra({ valor: 1000, forma: 'entrada', entrada: 400, parcelas: 2, dataCompra: '2026-11-14', dataPrimeira: '2026-12-14' }).pagamentos;
    assert.deepStrictEqual(e.map(x => [x.rotulo, x.valor]), [['Entrada', 400], ['Parcela 1/2', 300], ['Parcela 2/2', 300]]);
});
test('parcela no dia 31 cai no ultimo dia do mes curto', () => {
    const p = S.pagamentosDaCompra({ valor: 300, forma: 'parcelado', parcelas: 3, dataCompra: '2027-01-01', dataPrimeira: '2027-01-31' }).pagamentos;
    assert.deepStrictEqual(p.map(x => x.data), ['2027-01-31', '2027-02-28', '2027-03-31']);
});
test('validacoes com o texto da tela', () => {
    assert.strictEqual(S.pagamentosDaCompra({ valor: 0, forma: 'avista', dataCompra: '2026-11-14' }).erro, 'Informe o valor da compra.');
    assert.strictEqual(S.pagamentosDaCompra({ valor: 100, forma: 'parcelado', parcelas: 1, dataCompra: '2026-11-14', dataPrimeira: '2026-12-14' }).erro, 'Parcelas: de 2 a 48.');
    assert.strictEqual(S.pagamentosDaCompra({ valor: 100, forma: 'entrada', entrada: 100, parcelas: 2, dataCompra: '2026-11-14', dataPrimeira: '2026-12-14' }).erro, 'A entrada precisa ser maior que zero e menor que o valor.');
});
const sem = saldos => saldos.map((s, i) => ({ inicio: '2026-11-' + String(14 + 7 * i).padStart(2, '0'), saldo_final: s }));
test('veredito verde, amarelo por folga, amarelo por parcela, vermelho', () => {
    const v = x => S.veredito({ semanasSem: sem([5000]), folga: 1000, parcelaMensal: 0, temParcelaAlem: false, resultadoMedio: null, ganhoMensal: 0, valorTotal: 1000, ...x });
    assert.strictEqual(v({ semanasCom: sem([4000, 3000]) }).cor, 'verde');
    assert.strictEqual(v({ semanasCom: sem([4000, 800]) }).titulo, 'Cabe, mas aperta');
    assert.ok(v({ semanasCom: sem([4000, 800]) }).frases.includes('O caixa fica em R$ 800,00 na semana de 21/11.'));
    const p = v({ semanasCom: sem([4000, 3000]), temParcelaAlem: true, parcelaMensal: 500, resultadoMedio: 300 });
    assert.strictEqual(p.cor, 'amarelo');
    assert.ok(p.frases.includes('A parcela de R$ 500,00 é maior do que sobra em média por mês (R$ 300,00).'));
    const n = v({ semanasCom: sem([4000, -250]) });
    assert.deepStrictEqual([n.cor, n.titulo], ['vermelho', 'Não cabe agora']);
    assert.ok(n.frases.includes('O caixa fica negativo em R$ 250,00 na semana de 21/11.'));
    assert.ok(v({ semanasCom: sem([4000]), temParcelaAlem: true, parcelaMensal: 100, resultadoMedio: null }).frases.includes('Sem histórico para comparar a parcela com o que sobra por mês.'));
});
test('payback arredonda para cima', () => {
    const r = S.veredito({ semanasSem: sem([5000]), semanasCom: sem([4000]), folga: 0, parcelaMensal: 0, temParcelaAlem: false, resultadoMedio: null, ganhoMensal: 150, valorTotal: 1000 });
    assert.strictEqual(r.paybackMeses, 7);
    assert.ok(r.frases.includes('Se paga em 7 meses.'));
});
test('melhor data: primeira semana em que nada fica negativo; nenhuma -> null', () => {
    const pags = [{ data: '2026-11-14', valor: 1000, rotulo: 'À vista' }];
    const prever = ps => ps[0].data >= '2026-11-28' ? sem([100, 100]) : sem([-1, 100]);
    assert.strictEqual(S.melhorData({ hoje: '2026-11-14', pagamentos: pags, prever }), '2026-11-28');
    assert.strictEqual(S.melhorData({ hoje: '2026-11-14', pagamentos: pags, prever: () => sem([-1]) }), null);
});
test('resultado medio', () => {
    assert.strictEqual(S.resultadoMedio([100, 200, 400]), 233.33);
    assert.strictEqual(S.resultadoMedio([]), null);
});
