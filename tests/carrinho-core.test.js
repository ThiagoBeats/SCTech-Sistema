'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/carrinho-core.js');

const item = (q, p, extra) => Object.assign({ tipo: 'material', item_id: 5, item_nome: 'Trilho', referencia: 'T1', unidade: 'm', quantidade: q, preco_unit: p, observacao: '' }, extra || {});

test('adicionar cria carrinho e soma o mesmo item', () => {
    let c = C.adicionarAoCarrinho([], { fornecedor_id: 1, item: item(2, 10) });
    c = C.adicionarAoCarrinho(c, { fornecedor_id: 1, item: item(1.5, 12) });
    assert.strictEqual(c.length, 1);
    assert.strictEqual(c[0].itens.length, 1);
    const l = c[0].itens[0];
    assert.strictEqual(l.quantidade, 3.5);
    assert.strictEqual(l.preco_unit, 12);
    assert.strictEqual(l.subtotal, 42);
    assert.strictEqual(c[0].novo, true);
    assert.ok(c[0].atualizado_em > 0);
});

test('adicionar nao muta a entrada', () => {
    const base = C.adicionarAoCarrinho([], { fornecedor_id: 1, item: item(1, 10) });
    const copia = JSON.stringify(base);
    C.adicionarAoCarrinho(base, { fornecedor_id: 1, item: item(1, 10) });
    assert.strictEqual(JSON.stringify(base), copia);
});

test('itens de fornecedores diferentes vao para carrinhos diferentes', () => {
    let c = C.adicionarAoCarrinho([], { fornecedor_id: 1, item: item(1, 10) });
    c = C.adicionarAoCarrinho(c, { fornecedor_id: 2, item: item(1, 10) });
    assert.strictEqual(c.length, 2);
    assert.strictEqual(c[0].itens.length, 1);
    assert.strictEqual(c[1].itens.length, 1);
});

test('alterarQuantidade 0 remove e removerItem', () => {
    let c = C.adicionarAoCarrinho([], { fornecedor_id: 1, item: item(2, 10) });
    c = C.adicionarAoCarrinho(c, { fornecedor_id: 1, item: item(1, 8.1, { item_id: 6 }) });
    const alt = C.alterarQuantidade(c[0], 'material', 5, 4);
    assert.strictEqual(alt.itens[0].quantidade, 4);
    assert.strictEqual(alt.itens[0].subtotal, 40);
    const zero = C.alterarQuantidade(c[0], 'material', 5, 0);
    assert.strictEqual(zero.itens.length, 1);
    assert.strictEqual(zero.itens[0].item_id, 6);
    const rem = C.removerItem(c[0], 'material', 6);
    assert.strictEqual(rem.itens.length, 1);
    assert.strictEqual(rem.itens[0].item_id, 5);
    assert.strictEqual(c[0].itens.length, 2);
});

test('totalCarrinho e contarItens', () => {
    const car = { fornecedor_id: 1, itens: [{ subtotal: 42 }, { subtotal: 8.1 }] };
    assert.strictEqual(C.totalCarrinho(car), 50.1);
    assert.strictEqual(C.contarItens(car), 2);
    assert.strictEqual(C.valorPedidoCompra({ itens: car.itens }), 50.1);
});

test('historico so enviados, filtro inclusivo, total', () => {
    const pcs = [
        { id: 1, fornecedor_id: 3, status: 'Rascunho', data_criacao: new Date(2026, 10, 2, 12).getTime(), itens: [{ subtotal: 999 }] },
        { id: 2, fornecedor_id: 3, status: 'Enviado', data_envio: '2026-11-01', data_criacao: new Date(2026, 9, 1, 12).getTime(), itens: [{ subtotal: 100 }] },
        { id: 3, fornecedor_id: 3, status: 'Recebido', data_envio: null, data_criacao: new Date(2026, 9, 15, 12).getTime(), itens: [{ subtotal: 50 }] },
        { id: 4, fornecedor_id: 9, status: 'Enviado', data_envio: '2026-11-01', data_criacao: 1, itens: [{ subtotal: 77 }] }
    ];
    const h = C.historicoFornecedor(pcs, 3, {});
    assert.strictEqual(h.linhas.length, 2);
    assert.strictEqual(h.total, 150);
    assert.strictEqual(h.linhas[0].data_envio, '2026-11-01');
    assert.strictEqual(h.linhas[1].data_envio, '2026-10-15');
    const f = C.historicoFornecedor(pcs, 3, { de: '2026-11-01', ate: '2026-11-01' });
    assert.strictEqual(f.linhas.length, 1);
    assert.strictEqual(f.total, 100);
});

test('ids string e numero', () => {
    const c = C.adicionarAoCarrinho([], { fornecedor_id: 1, item: item(1, 10, { item_id: '5' }) });
    const c2 = C.adicionarAoCarrinho(c, { fornecedor_id: '1', item: item(1, 10, { item_id: 5 }) });
    assert.strictEqual(c2.length, 1);
    assert.strictEqual(c2[0].itens.length, 1);
    assert.strictEqual(c2[0].itens[0].quantidade, 2);
    assert.strictEqual(C.alterarQuantidade(c2[0], 'material', '5', 1).itens[0].quantidade, 1);
    const h = C.historicoFornecedor([{ id: 1, fornecedor_id: '3', status: 'Enviado', data_envio: '2026-11-01', itens: [{ subtotal: 5 }] }], 3, {});
    assert.strictEqual(h.linhas.length, 1);
});
