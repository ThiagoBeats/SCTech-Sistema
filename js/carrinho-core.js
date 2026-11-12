'use strict';
// Nucleo do carrinho de compras e do historico de pedidos por fornecedor.
// So funcoes puras — sem DOM, sem db, sem localStorage — para rodar em `node --test`.
(function (raiz) {

    function arredondar(v) {
        const n = Number(v) || 0;
        return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
    }

    function mesmoId(a, b) {
        return a != null && b != null && String(a) === String(b);
    }

    function dataLocal(ms) {
        const d = new Date(ms);
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    function mesmaLinha(l, tipo, itemId) {
        return l.tipo === tipo && mesmoId(l.item_id, itemId);
    }

    function linhaCom(l, quantidade, precoUnit) {
        const q = Math.round((Number(quantidade) || 0) * 1000) / 1000;
        const p = precoUnit == null ? l.preco_unit : precoUnit;
        return Object.assign({}, l, { quantidade: q, preco_unit: p, subtotal: arredondar(q * (Number(p) || 0)) });
    }

    function removerItem(carrinho, tipo, itemId) {
        return Object.assign({}, carrinho, {
            itens: (carrinho.itens || []).filter(l => !mesmaLinha(l, tipo, itemId))
        });
    }

    function adicionarAoCarrinho(carrinhos, { fornecedor_id, item }) {
        const lista = (carrinhos || []).map(c => Object.assign({}, c, { itens: (c.itens || []).slice() }));
        let car = lista.find(c => mesmoId(c.fornecedor_id, fornecedor_id));
        if (!car) {
            car = { fornecedor_id, itens: [], novo: true, atualizado_em: 0 };
            lista.push(car);
        }
        const idx = car.itens.findIndex(l => mesmaLinha(l, item.tipo, item.item_id));
        if (idx >= 0) {
            const l = car.itens[idx];
            car.itens[idx] = linhaCom(l, (Number(l.quantidade) || 0) + (Number(item.quantidade) || 0), item.preco_unit);
        } else {
            car.itens.push(linhaCom(Object.assign({ observacao: '' }, item), item.quantidade, item.preco_unit));
        }
        car.novo = true;
        car.atualizado_em = Date.now();
        return lista;
    }

    function alterarQuantidade(carrinho, tipo, itemId, quantidade) {
        const q = Number(quantidade) || 0;
        if (q <= 0) return removerItem(carrinho, tipo, itemId);
        return Object.assign({}, carrinho, {
            itens: (carrinho.itens || []).map(l => mesmaLinha(l, tipo, itemId) ? linhaCom(l, q) : l)
        });
    }

    function somaSubtotais(itens) {
        return arredondar((itens || []).reduce((s, l) => s + (Number(l.subtotal) || 0), 0));
    }

    function totalCarrinho(carrinho) { return somaSubtotais(carrinho && carrinho.itens); }
    function contarItens(carrinho) { return ((carrinho && carrinho.itens) || []).length; }
    function valorPedidoCompra(pc) { return somaSubtotais(pc && pc.itens); }

    function historicoFornecedor(pedidosCompra, fornecedorId, filtro) {
        const { de, ate } = filtro || {};
        const linhas = (pedidosCompra || [])
            .filter(pc => mesmoId(pc.fornecedor_id, fornecedorId) && (pc.status === 'Enviado' || pc.status === 'Recebido'))
            .map(pc => ({
                id: pc.id,
                data_envio: pc.data_envio || dataLocal(pc.data_criacao),
                status: pc.status,
                valor: valorPedidoCompra(pc)
            }))
            .filter(l => (!de || l.data_envio >= de) && (!ate || l.data_envio <= ate))
            .sort((a, b) => a.data_envio < b.data_envio ? 1 : a.data_envio > b.data_envio ? -1 : 0);
        return { linhas, total: arredondar(linhas.reduce((s, l) => s + l.valor, 0)) };
    }

    const api = { adicionarAoCarrinho, alterarQuantidade, removerItem, totalCarrinho, contarItens, valorPedidoCompra, historicoFornecedor };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.CarrinhoCore = api;

})(typeof window !== 'undefined' ? window : null);
