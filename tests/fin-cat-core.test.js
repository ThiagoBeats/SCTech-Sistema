'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/fin-cat-core.js');

test('categoriasPadrao: 18 categorias, ids estaveis e so_caixa', () => {
    const p = F.categoriasPadrao();
    assert.strictEqual(p.categorias.length, 18);
    assert.deepStrictEqual(p.subgrupos.map(s => s.id), ['sub_var', 'sub_fix', 'sub_out']);
    const ids = p.categorias.map(c => c.id);
    ['cat_vendas', 'cat_tecido', 'cat_comissoes', 'cat_equip', 'cat_juros', 'cat_aporte', 'cat_emprestimo_out'].forEach(i => assert.ok(ids.includes(i), i));
    const ap = p.categorias.find(c => c.id === 'cat_aporte');
    assert.strictEqual(ap.natureza, 'so_caixa');
    assert.strictEqual(ap.grupo, null);
    assert.strictEqual(p.categorias.find(c => c.id === 'cat_juros').tipo, 'saida');
    assert.strictEqual(p.categorias.find(c => c.id === 'cat_rendimentos').tipo, 'entrada');
});

test('legado: comissao_rt -> comissoes; sem pedido -> outras receitas; desconhecida -> outras despesas', () => {
    assert.strictEqual(F.MAPA_LEGADO.comissao_rt, 'cat_comissoes');
    assert.strictEqual(F.categoriaDoLegado({ valor: 1 }, 'receber'), 'cat_outras_rec');
    assert.strictEqual(F.categoriaDoLegado({ pedido_id: 3 }, 'receber'), 'cat_vendas');
    assert.strictEqual(F.categoriaDoLegado({ categoria: 'xyz' }, 'pagar'), 'cat_outras_desp');
    assert.strictEqual(F.categoriaDoLegado({ categoria: 'salario' }, 'pagar'), 'cat_salarios');
});

function aplicar(lista, plano) {
    return lista.map(r => { const p = plano.find(x => x.id === r.id); return p ? Object.assign({}, r, p.set) : r; });
}

test('planoMigracaoV4: competencia, aprovacao, mes_referencia, vinculos e idempotencia', () => {
    const e = {
        agoraISO: '2026-11-24T10:00:00.000Z',
        contas_receber: [
            { id: 1, pedido_id: 7, cliente_nome: 'Bia', data_vencimento: '2026-03-10', valor: 50 },
            { id: 2, pedido_id: 7, cliente_nome: 'Bia', data_vencimento: '2026-05-02', valor: 50 },
            { id: 3, cliente_nome: 'Ana', data_vencimento: '2026-06-01', valor: 10 }
        ],
        contas_pagar: [
            { id: 10, categoria: 'xyz', mes_referencia: '2026-04', data_vencimento: '2026-05-05', credor_nome: 'Forn X', cnpj_fornecedor: '12.345.678/0001-90', valor: 5 },
            { id: 11, categoria: 'tecido', data_vencimento: '2026-07-07', credor_nome: 'Outro', valor: 5 }
        ],
        despesas_fixas: [{ id: 20, categoria: 'aluguel' }],
        pedidos: [{ id: 7, clienteId: 5, financeiro_gerado: true }],
        clientes: [{ id: 5, nome: 'Bia' }, { id: 6, nome: 'Ana' }, { id: 8, nome: 'ana' }],
        fornecedores: [{ id: 'f1', nome: 'Fornecedor Xis', cnpj: '12345678000190' }]
    };
    const p = F.planoMigracaoV4(e);
    assert.deepStrictEqual(p.cr.slice(0, 2).map(x => x.set.data_competencia), ['2026-03-10', '2026-03-10']);
    assert.strictEqual(p.cr[0].set.cliente_id, 5);
    assert.deepStrictEqual(p.pedidos, [{ id: 7, set: { data_aprovacao: '2026-03-10' } }]);
    assert.strictEqual(p.cp[0].set.data_competencia, '2026-04-01');
    assert.strictEqual(p.cp[0].set.categoria_id, 'cat_outras_desp');
    assert.strictEqual(p.cp[0].set.fornecedor_id, 'f1');
    assert.strictEqual(p.cp[1].set.data_competencia, '2026-07-07');
    assert.strictEqual(p.df[0].set.categoria_id, 'cat_aluguel');
    const ana = p.cr.find(x => x.id === 3);
    assert.strictEqual(ana.set.cliente_id, undefined);
    assert.strictEqual(p.avisos.length, 1);
    assert.match(p.avisos[0], /Ana/);
    assert.deepStrictEqual(ana.set.historico[0], { em: e.agoraISO, por: null, porNome: 'Sistema', acao: 'criado', detalhe: 'Migrado do financeiro anterior' });

    const e2 = Object.assign({}, e, {
        contas_receber: aplicar(e.contas_receber, p.cr), contas_pagar: aplicar(e.contas_pagar, p.cp),
        despesas_fixas: aplicar(e.despesas_fixas, p.df), pedidos: aplicar(e.pedidos, p.pedidos)
    });
    const p2 = F.planoMigracaoV4(e2);
    assert.deepStrictEqual([p2.cr, p2.cp, p2.df, p2.pedidos, p2.avisos], [[], [], [], [], []]);
});

test('competenciaPadrao', () => {
    assert.strictEqual(F.competenciaPadrao({ origem: 'manual', vencimento: '2026-08-09' }), '2026-08-09');
    assert.strictEqual(F.competenciaPadrao({ origem: 'pedido', dataAprovacao: '2026-02-01', vencimento: '2026-08-09' }), '2026-02-01');
    assert.strictEqual(F.competenciaPadrao({ origem: 'compra', dataCompra: '2026-02-03' }), '2026-02-03');
    assert.strictEqual(F.competenciaPadrao({ origem: 'recorrencia', mesOcorrencia: '2026-09' }), '2026-09-01');
    assert.strictEqual(F.competenciaPadrao({ origem: 'imposto', mesReferencia: '2026-10', vencimento: '2026-11-20' }), '2026-10-01');
});

test('dividirParcelas: centavos na ultima e fim de mes', () => {
    const p = F.dividirParcelas(100, 3, '2026-01-31');
    assert.deepStrictEqual(p.map(x => x.valor), [33.33, 33.33, 33.34]);
    assert.deepStrictEqual(p.map(x => x.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31']);
    assert.deepStrictEqual(p.map(x => x.parcela), [1, 2, 3]);
});

test('acharParecido: +3 dias acha; +4 e cancelado nao', () => {
    const lista = [{ id: 1, valor: 99.99, cliente_id: 4, cliente_nome: 'Ana Souza', data_vencimento: '2026-05-10', status: 'Pendente' }];
    const base = { valor: 99.99, pessoaId: null, pessoaNome: 'ana souza', vencimento: '2026-05-13', tipo: 'receber' };
    assert.strictEqual(F.acharParecido(base, lista), lista[0]);
    assert.strictEqual(F.acharParecido({ ...base, pessoaNome: 'x', pessoaId: 4 }, lista), lista[0]);
    assert.strictEqual(F.acharParecido({ ...base, vencimento: '2026-05-14' }, lista), null);
    assert.strictEqual(F.acharParecido({ ...base, valor: 99.98 }, lista), null);
    assert.strictEqual(F.acharParecido(base, [{ ...lista[0], status: 'Cancelado' }]), null);
    assert.strictEqual(F.acharParecido({ ...base, id: 1 }, lista), null);
});

test('situacao e rotulos', () => {
    assert.strictEqual(F.situacao({ status: 'Pendente', data_vencimento: '2026-05-09' }, '2026-05-10'), 'vencido');
    assert.strictEqual(F.situacao({ status: 'Pendente', data_vencimento: '2026-05-10' }, '2026-05-10'), 'aberto');
    assert.strictEqual(F.situacao({ status: 'Pago', data_vencimento: '2026-01-01' }, '2026-05-10'), 'pago');
    assert.strictEqual(F.situacao({ status: 'Cancelado' }, '2026-05-10'), 'cancelado');
    assert.strictEqual(F.ROTULO_SITUACAO.pago.receber, 'Recebido');
});

test('podeCancelar / podeExcluir', () => {
    assert.deepStrictEqual(F.podeCancelar({ status: 'Pago' }), { ok: false, motivo: 'Estorne a baixa antes de cancelar.' });
    assert.strictEqual(F.podeCancelar({ status: 'Pendente' }).ok, true);
    assert.strictEqual(F.podeExcluir({ lancamento_pai_id: 9, parcelado: true, status: 'Pendente' }).ok, true);
    assert.strictEqual(F.podeExcluir({ pedido_id: 3, tipo_lancamento: 'manual', status: 'Pendente' }).ok, true);
    assert.strictEqual(F.podeExcluir({ pedido_id: 3, parcela_tipo: 'entrada', status: 'Pendente' }).ok, false);
    assert.strictEqual(F.podeExcluir({ lancamento_pai_id: 9, recorrente: true, status: 'Pendente' }).ok, false);
    assert.strictEqual(F.podeExcluir({ despesa_fixa_id: 4, status: 'Pendente' }).ok, false);
    assert.strictEqual(F.podeExcluir({ papel_comissao: 'rt', status: 'Pendente' }).ok, false);
    assert.strictEqual(F.podeExcluir({ tipo_lancamento: 'manual', status: 'Pendente' }).ok, true);
    assert.strictEqual(F.podeExcluir({ status: 'Pago' }).ok, false);
});

test('registrarHistorico acrescenta sem apagar', () => {
    const r = { id: 1 };
    F.registrarHistorico(r, { acao: 'criado', por: 2, porNome: 'Lu', em: 'a' });
    F.registrarHistorico(r, { acao: 'baixa', detalhe: 'x', em: 'b' });
    assert.strictEqual(r.historico.length, 2);
    assert.strictEqual(r.historico[0].acao, 'criado');
    assert.strictEqual(r.historico[1].detalhe, 'x');
});

test('planoMigracaoV4: registro sem data nao reaparece na segunda rodada', () => {
    const e = { agoraISO: 'x', contas_receber: [{ id: 1, valor: 5 }], contas_pagar: [{ id: 2, valor: 5 }] };
    const p = F.planoMigracaoV4(e);
    assert.strictEqual(p.cr.length, 1);
    const p2 = F.planoMigracaoV4({ ...e, contas_receber: aplicar(e.contas_receber, p.cr), contas_pagar: aplicar(e.contas_pagar, p.cp) });
    assert.deepStrictEqual([p2.cr, p2.cp], [[], []]);
});

test('acharParecido: ids number/string e tipos misturados', () => {
    const lista = [{ id: 1, _tipo: 'pagar', valor: 10, credor_nome: 'Zé', data_vencimento: '2026-05-10', status: 'Pendente' }];
    const base = { valor: 10, pessoaNome: 'ze', vencimento: '2026-05-10', tipo: 'pagar' };
    assert.strictEqual(F.acharParecido({ ...base, id: '1' }, lista), null);
    assert.strictEqual(F.acharParecido(base, lista), lista[0]);
    assert.strictEqual(F.acharParecido({ ...base, tipo: 'receber' }, lista), null);
});

test('dividirParcelas: bissexto e centavos de ponto flutuante', () => {
    assert.strictEqual(F.dividirParcelas(10, 2, '2028-01-31')[1].vencimento, '2028-02-29');
    assert.deepStrictEqual(F.dividirParcelas(19.99, 2, '2026-01-10').map(x => x.valor), [9.99, 10]);
    assert.deepStrictEqual(F.dividirParcelas(0.30, 3, '2026-01-10').map(x => x.valor), [0.1, 0.1, 0.1]);
});

test('situacao: data_pagamento e Atrasado velho', () => {
    assert.strictEqual(F.situacao({ status: 'Pendente', data_pagamento: '2026-05-01', data_vencimento: '2026-04-01' }, '2026-05-10'), 'pago');
    assert.strictEqual(F.situacao({ status: 'Atrasado', data_vencimento: '2026-06-01' }, '2026-05-10'), 'aberto');
});
