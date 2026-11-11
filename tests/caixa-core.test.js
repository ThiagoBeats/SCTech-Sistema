'use strict';
const test = require('node:test');
const assert = require('node:assert');
const FinanceiroCore = require('../js/financeiro-core.js');
const C = require('../js/caixa-core.js');
const maq = { id: 3, tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', cartao: { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 } };
test('contaAceitaMovimento respeita data do saldo inicial e conta inexistente', () => {
    assert.strictEqual(C.contaAceitaMovimento(maq, '2026-11-01'), true);
    assert.strictEqual(C.contaAceitaMovimento(maq, '2026-10-31'), false);
    assert.strictEqual(C.contaAceitaMovimento(null, '2026-11-12'), false);
});
test('saldoConta e saldosHoje: futuro fica em a_cair', () => {
    const banco = { id: 1, nome: 'Banco', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-11-01' };
    const mov = [
        { conta_id: 1, data: '2026-10-30', sentido: 'entrada', valor: 999 },   // antes do saldo inicial: ignora
        { conta_id: 1, data: '2026-11-05', sentido: 'entrada', valor: 500 },
        { conta_id: 1, data: '2026-11-06', sentido: 'saida', valor: 200 },
        { conta_id: 3, data: '2026-12-12', sentido: 'entrada', valor: 100 },
        { conta_id: 3, data: '2026-12-12', sentido: 'saida', valor: 3 }];
    assert.strictEqual(C.saldoConta(banco, mov, '2026-11-12'), 1300);
    const s = C.saldosHoje([banco, maq], mov, '2026-11-12');
    assert.strictEqual(s.total, 1300);
    assert.strictEqual(s.contas.find(c => c.id === 3).a_cair, 97);
});
test('repassesCartao: debito, credito a vista, parcelado e antecipado', () => {
    assert.deepStrictEqual(C.repassesCartao({ valor: 200, data: '2026-11-12', conta: maq, tipo: 'debito' }),
        [{ data: '2026-11-13', bruto: 200, taxa: 3, liquido: 197 }]);
    assert.deepStrictEqual(C.repassesCartao({ valor: 100, data: '2026-11-12', conta: maq, tipo: 'credito', vezes: 1 }),
        [{ data: '2026-12-12', bruto: 100, taxa: 3, liquido: 97 }]);
    const p = C.repassesCartao({ valor: 100, data: '2026-11-12', conta: maq, tipo: 'credito', vezes: 3 });
    assert.deepStrictEqual(p.map(x => x.data), ['2026-12-12', '2027-01-11', '2027-02-10']);
    assert.strictEqual(FinanceiroCore.arredondar(p.reduce((s, x) => s + x.bruto, 0)), 100);
    assert.strictEqual(FinanceiroCore.arredondar(p.reduce((s, x) => s + x.taxa, 0)), 4);
    const a = C.repassesCartao({ valor: 100, data: '2026-11-12', conta: maq, tipo: 'credito', vezes: 3, antecipar: true });
    assert.deepStrictEqual(a, [{ data: '2026-11-13', bruto: 100, taxa: 6, liquido: 94 }]);
});
test('dividirParcela', () => {
    assert.deepStrictEqual(C.dividirParcela({ valor: 3000 }, 1000), { pago: 1000, resto: 2000 });
    assert.deepStrictEqual(C.dividirParcela({ valor: 3000 }, 3000), { pago: 3000, resto: 0 });
    assert.throws(() => C.dividirParcela({ valor: 3000 }, 3001));
    assert.throws(() => C.dividirParcela({ valor: 3000 }, 0));
});
