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
    assert.deepStrictEqual(r.previsto, { entradas: 400, saidas: 0, aberturas: 0, saldoFinal: 1650 });
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

test('conta aberta no meio do periodo: abertura entra no saldo, nao em entradas', () => {
    const p = base();
    p.contas = [{ id: 1, nome: 'A', saldo_inicial: 1000, data_saldo_inicial: '2026-11-10', ativo: true }];
    p.movimentos = [{ id: 1, conta_id: 1, data: '2026-11-12', sentido: 'saida', valor: 300, origem: 'ajuste' }];
    p.contasReceber = []; p.contasPagar = [];
    const r = FluxoCore.resumo(p);
    assert.strictEqual(r.saldoInicial, 0);
    assert.strictEqual(r.aberturas, 1000);
    assert.strictEqual(r.entradas, 0);
    assert.strictEqual(r.saidas, 300);
    assert.strictEqual(r.saldoFinal, 700);
    const l = FluxoCore.movimentacoes(p);
    assert.strictEqual(l[1].descricao, 'Abertura da conta A');
    assert.strictEqual(l[1].origem, 'abertura');
    assert.strictEqual(l[l.length - 1].saldo, 700);
    const s = FluxoCore.serie(Object.assign({}, p, { agrupar: 'mes' }));
    assert.strictEqual(s[0].saldo, 700);
    assert.strictEqual(FluxoCore.resumo(Object.assign({}, p, { contaId: 1 })).saldoFinal, 700);
});

test('transferencia para conta inativa conta como saida no consolidado', () => {
    const p = base();
    p.contas[1].ativo = false;
    const r = FluxoCore.resumo(p);
    assert.strictEqual(r.saidas, 500);
    assert.strictEqual(r.saldoFinal, 950 + 500 - 500);
});

test('periodo futuro: saldo inicial projeta o previsto ate a vespera', () => {
    const p = Object.assign(base(), { de: '2026-12-01', ate: '2026-12-31' });
    p.contasReceber.push({ id: 3, valor: 100, status: 'Aberto', data_vencimento: '2026-11-10', pedido_id: 9 });
    const r = FluxoCore.resumo(p);
    // saldo de hoje (20/11) = 950 + 500 - 200 = 1250; + CR atrasada 100 (cai em hoje) + CR 400 de 25/11
    assert.strictEqual(r.saldoInicial, 1750);
    assert.strictEqual(r.entradas, 0);
    assert.strictEqual(r.previsto.saldoFinal, 1750);
});

test('conta sem data_saldo_inicial conta desde sempre', () => {
    const p = base();
    p.contas = [{ id: 1, nome: 'A', saldo_inicial: 1000, ativo: true }];
    const r = FluxoCore.resumo(p);
    assert.strictEqual(r.saldoInicial, 950);
    assert.strictEqual(r.entradas, 500);
});

test('hoje ausente gera erro claro', () => {
    const p = base(); delete p.hoje;
    assert.throws(() => FluxoCore.resumo(p), /hoje/);
});

test('previsto: repasse de cartao, recorrencia e filtro por conta', () => {
    const p = base();
    p.contasReceber = [{ id: 5, valor: 1000, status: 'Aberto', data_vencimento: '2026-11-22', pedido_id: 9, meio_previsto: { meio_id: 'm1', vezes: 1 } }];
    p.contasPagar = [];
    p.meios = [{ id: 'm1', tipo: 'cartao_debito', conta_id: 2 }];
    p.contas[1].cartao = { debito_taxa: 2, debito_dias: 1 };
    p.despesasFixas = [{ id: 1, valor: 150, dia_vencimento: 28, ativo: true, data_inicio: '2026-01-01', categoria: 'aluguel' }];
    const todas = FluxoCore.resumo(p).previsto;
    assert.strictEqual(todas.entradas, 980);
    assert.strictEqual(todas.saidas, 150);
    const contaB = FluxoCore.resumo(Object.assign({}, p, { contaId: 2 })).previsto;
    assert.strictEqual(contaB.entradas, 980);
    assert.strictEqual(contaB.saidas, 0);
    const contaA = FluxoCore.resumo(Object.assign({}, p, { contaId: 1 })).previsto;
    assert.strictEqual(contaA.entradas, 0);
});

test('categoria filtra o realizado de CR e CP', () => {
    const p = Object.assign(base(), { categoriaId: 'cat_vendas' });
    const r = FluxoCore.resumo(p);
    assert.strictEqual(r.entradas, 500);
    assert.strictEqual(r.saidas, 0);
    assert.strictEqual(r.previsto.entradas, 400);
});

test('porCategoria: fecha com resumo, inclui so caixa, ajuste e (com conta) transferencia', () => {
    const p = base();
    p.contasReceber.push({ id: 3, valor: 10000, status: 'Pago', data_vencimento: '2026-11-08', categoria_id: 'cat_aporte' });
    p.movimentos.push({ id: 6, conta_id: 1, data: '2026-11-08', sentido: 'entrada', valor: 10000, origem: 'cr', origem_id: 3 });
    p.movimentos.push({ id: 7, conta_id: 2, data: '2026-11-15', sentido: 'saida', valor: 20, origem: 'ajuste', origem_id: null });
    const todas = FluxoCore.porCategoria(p), r = FluxoCore.resumo(p);
    assert.strictEqual(todas.entradas, r.entradas);
    assert.strictEqual(todas.saidas, r.saidas);
    assert.strictEqual(todas.entradas, 10500);
    const aporte = todas.linhas.find(l => l.id === 'cat_aporte');
    assert.strictEqual(aporte.valor, 10000);
    assert.strictEqual(aporte.natureza, 'so_caixa');
    assert.strictEqual(todas.linhas.find(l => l.id === 'cat_aluguel').valor, 200);
    assert.strictEqual(todas.linhas.find(l => l.especial === 'ajuste').valor, 20);
    assert.ok(!todas.linhas.some(l => l.especial === 'transferencia'));
    const a = Object.assign({}, p, { contaId: 1 });
    const ra = FluxoCore.resumo(a), pa = FluxoCore.porCategoria(a);
    assert.strictEqual(pa.entradas, ra.entradas);
    assert.strictEqual(pa.saidas, ra.saidas);
    assert.strictEqual(pa.linhas.find(l => l.especial === 'transferencia').valor, 300);
    assert.strictEqual(pa.linhas.find(l => l.especial === 'transferencia').sentido, 'saida');
});

test('movimentacoes: linha prevista traz pessoa, descricao, conta prevista e o lancamento de origem', () => {
    const p = base();
    p.contasReceber[1] = Object.assign({}, p.contasReceber[1], { cliente_nome: 'Bia', descricao: 'Venda Bia', conta_id: 2 });
    const prev = FluxoCore.movimentacoes(p).filter(l => l.previsto);
    assert.strictEqual(prev.length, 1);
    assert.deepStrictEqual([prev[0].descricao, prev[0].conta_id, prev[0].origem, prev[0].origem_id], ['Bia - Venda Bia', 2, 'cr', 2]);
});
