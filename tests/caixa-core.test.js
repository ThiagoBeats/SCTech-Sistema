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
test('ids misturados (texto e numero) casam nos saldos', () => {
    const banco = { id: '1', nome: 'Banco', tipo: 'banco', saldo_inicial: 100, data_saldo_inicial: '2026-11-01' };
    const mov = [{ conta_id: 1, data: '2026-11-05', sentido: 'entrada', valor: 50 }, { conta_id: '1', data: '2026-11-20', sentido: 'entrada', valor: 10 }];
    assert.strictEqual(C.saldoConta(banco, mov, '2026-11-12'), 150);
    const s = C.saldosHoje([banco], mov, '2026-11-12');
    assert.strictEqual(s.contas[0].saldo, 150);
    assert.strictEqual(s.contas[0].a_cair, 10);
});
test('repassesCartao: taxas em texto e conta sem cartao usam numero/padrao', () => {
    const txt = { cartao: { credito_taxa: '3', credito_dias: '30', parcelado_taxa: '4' } };
    assert.deepStrictEqual(C.repassesCartao({ valor: 100, data: '2026-11-12', conta: txt, tipo: 'credito', vezes: 1 }),
        [{ data: '2026-12-12', bruto: 100, taxa: 3, liquido: 97 }]);
    const p = C.repassesCartao({ valor: 100, data: '2026-11-12', conta: txt, tipo: 'credito', vezes: 3 });
    assert.strictEqual(FinanceiroCore.arredondar(p.reduce((s, x) => s + x.taxa, 0)), 4);
    const sem = { id: 9, tipo: 'maquininha' };
    assert.deepStrictEqual(C.repassesCartao({ valor: 200, data: '2026-11-12', conta: sem, tipo: 'debito' }),
        [{ data: '2026-11-13', bruto: 200, taxa: 3, liquido: 197 }]);
    assert.deepStrictEqual(C.repassesCartao({ valor: 100, data: '2026-11-12', conta: sem, tipo: 'credito', vezes: 3, antecipar: true }),
        [{ data: '2026-11-13', bruto: 100, taxa: 6, liquido: 94 }]);
});

// ---- Task 2: previsao, tarefas do dia, WhatsApp ----
const meioCred = { id: 9, nome: 'Credito', tipo: 'cartao_credito', conta_id: 3 };
const base = { hoje: '2026-11-12', saldoHoje: 1000, movimentos: [], contasReceber: [], contasPagar: [], despesasFixas: [], contas: [maq], meios: [meioCred] };
const cenario1 = () => Object.assign({}, base, {
    contasReceber: [{ id: 1, valor: 500, data_vencimento: '2026-11-14', status: 'Pendente', meio_previsto: null }],
    contasPagar: [{ id: 1, tipo: 'variavel', descricao: 'x', valor: 2000, data_vencimento: '2026-11-20', status: 'Pendente' }],
    movimentos: [{ conta_id: 3, data: '2026-12-12', sentido: 'entrada', valor: 97 }]
});
test('previsao: saldo inicial, receber, pagar e cartao a cair por semana', () => {
    const s = C.previsaoSemanal(cenario1());
    assert.strictEqual(s.length, 8);
    assert.strictEqual(s[0].inicio, '2026-11-12');
    assert.strictEqual(s[0].fim, '2026-11-18');
    assert.strictEqual(s[0].entradas, 500);
    assert.strictEqual(s[1].saidas, 2000);
    assert.strictEqual(s[1].saldo_final, -500);
    assert.strictEqual(s[4].entradas, 97);
});
test('previsao: CR com meio cartao 3x espalha liquido', () => {
    const s = C.previsaoSemanal(Object.assign({}, base, {
        contasReceber: [{ id: 1, valor: 300, data_vencimento: '2026-11-12', status: 'Pendente', meio_previsto: { meio_id: 9, vezes: 3, antecipar: false } }]
    }));
    assert.strictEqual(s[4].entradas, 96);
    assert.strictEqual(s.reduce((a, x) => a + x.entradas, 0), 96);
});
test('previsao: atrasados entram na semana 1 com inclui_atrasados', () => {
    const s = C.previsaoSemanal(Object.assign({}, base, {
        contasReceber: [{ id: 1, valor: 200, data_vencimento: '2026-11-01', status: 'Atrasado', meio_previsto: null }]
    }));
    assert.strictEqual(s[0].entradas, 200);
    assert.strictEqual(s[0].inclui_atrasados, true);
    assert.strictEqual(s[1].inclui_atrasados, false);
});
test('previsao: despesa fixa ativa sem lancamento do mes entra no dia de vencimento', () => {
    const df = { id: 1, descricao: 'Aluguel', valor: 800, dia_vencimento: 15, ativo: true };
    const s = C.previsaoSemanal(Object.assign({}, base, { despesasFixas: [df] }));
    assert.strictEqual(s[0].saidas, 800);
    const cp = { id: 5, tipo: 'fixo', descricao: 'Aluguel', valor: 800, data_vencimento: '2026-11-15', status: 'Pendente' };
    const s2 = C.previsaoSemanal(Object.assign({}, base, { despesasFixas: [df], contasPagar: [cp] }));
    assert.strictEqual(s2[0].saidas, 800); // so o CP, sem duplicar
    assert.strictEqual(s2.reduce((a, x) => a + x.saidas, 0), 1600); // CP de novembro + fixa de dezembro (15/01 fora do horizonte)
});
test('primeiraSemanaNegativa', () => {
    assert.deepStrictEqual(C.primeiraSemanaNegativa(C.previsaoSemanal(cenario1())), { inicio: '2026-11-19', falta: 500 });
    assert.strictEqual(C.primeiraSemanaNegativa(C.previsaoSemanal(base)), null);
});
test('tarefasHoje separa por urgencia', () => {
    const t = C.tarefasHoje({
        hoje: '2026-11-12', contas: [maq],
        contasReceber: [
            { id: 1, data_vencimento: '2026-11-05', status: 'Atrasado' },
            { id: 2, data_vencimento: '2026-11-12', status: 'Pendente' },
            { id: 3, data_vencimento: '2026-11-20', status: 'Pendente' },
            { id: 4, data_vencimento: '2026-11-01', status: 'Pago' }],
        contasPagar: [
            { id: 1, data_vencimento: '2026-11-10', status: 'Atrasado' },
            { id: 2, data_vencimento: '2026-11-17', status: 'Pendente' },
            { id: 3, data_vencimento: '2026-11-21', status: 'Pendente' }],
        movimentos: [{ id: 1, conta_id: 3, data: '2026-11-12', sentido: 'entrada', valor: 97 },
            { id: 2, conta_id: 3, data: '2026-11-13', sentido: 'entrada', valor: 50 }]
    });
    assert.deepStrictEqual(t.receberAtrasados.map(x => x.id), [1]);
    assert.deepStrictEqual(t.receberHoje.map(x => x.id), [2]);
    assert.deepStrictEqual(t.pagarAtrasados.map(x => x.id), [1]);
    assert.deepStrictEqual(t.pagarProximos.map(x => x.id), [2]);
    assert.deepStrictEqual(t.cartaoHoje.map(x => x.id), [1]);
});
test('normalizarTelefone', () => {
    assert.strictEqual(C.normalizarTelefone('(11) 98765-4321'), '5511987654321');
    assert.strictEqual(C.normalizarTelefone('+55 11 98765-4321'), '5511987654321');
    assert.strictEqual(C.normalizarTelefone('1133334444'), '551133334444');
    assert.strictEqual(C.normalizarTelefone(''), null);
    assert.strictEqual(C.normalizarTelefone('1234'), null);
});
test('montarMensagem e linkWhatsApp', () => {
    const m = C.montarMensagem(C.MENSAGEM_COBRANCA_PADRAO, { cliente: 'Maria', empresa: 'SC', valor: 'R$ 2.000,00', pedido: '#26015', vencimento: '10/11/2026' });
    assert.ok(m.includes('Olá, Maria!'));
    assert.ok(m.includes('#26015'));
    assert.ok(!m.includes('{'));
    assert.ok(C.linkWhatsApp('5511987654321', m).startsWith('https://wa.me/5511987654321?text=Ol%C3%A1'));
    assert.strictEqual(C.linkWhatsApp(null, m), null);
});

// ---- Task 2 fix round 1 ----
test('previsao: despesa fixa com periodicidade nao e projetada (so o CP pre-gerado)', () => {
    const df = { id: 1, descricao: 'Seguro', valor: 1200, dia_vencimento: 20, ativo: true, periodicidade: 'anual' };
    const cp = { id: 7, tipo: 'fixo', descricao: 'Seguro', valor: 1200, data_vencimento: '2026-11-20', status: 'Pendente' };
    const s = C.previsaoSemanal(Object.assign({}, base, { despesasFixas: [df], contasPagar: [cp] }));
    assert.strictEqual(s.reduce((a, x) => a + x.saidas, 0), 1200);
});
test('previsao: despesa fixa antiga ja vencida no mes e sem CP entra na semana 1 como atrasada', () => {
    const df = { id: 1, descricao: 'Internet', valor: 100, dia_vencimento: 5, ativo: true };
    const s = C.previsaoSemanal(Object.assign({}, base, { despesasFixas: [df] }));
    assert.strictEqual(s[0].saidas, 100);
    assert.strictEqual(s[0].inclui_atrasados, true);
    const cp = { id: 8, tipo: 'fixo', descricao: 'Internet', valor: 100, data_vencimento: '2026-11-05', status: 'Pago' };
    const s2 = C.previsaoSemanal(Object.assign({}, base, { despesasFixas: [df], contasPagar: [cp] }));
    assert.strictEqual(s2[0].saidas, 0);
});
test('previsao: CR/CP pagos ficam fora e ids misturados string/numero casam o meio', () => {
    const s = C.previsaoSemanal(Object.assign({}, base, {
        contasReceber: [{ id: 1, valor: 500, data_vencimento: '2026-11-14', status: 'Pago' },
            { id: 2, valor: 100, data_vencimento: '2026-11-12', status: 'Pendente', meio_previsto: { meio_id: '9', vezes: 1, antecipar: false } }],
        contasPagar: [{ id: 1, tipo: 'variavel', descricao: 'x', valor: 300, data_vencimento: '2026-11-14', status: 'Pago' }],
        meios: [{ id: 9, tipo: 'cartao_credito', conta_id: '3' }]
    }));
    assert.strictEqual(s[0].entradas, 0);
    assert.strictEqual(s[0].saidas, 0);
    assert.strictEqual(s[4].entradas, 97);
});
