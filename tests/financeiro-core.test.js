'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/financeiro-core.js');

test('entradaPctDoNome le o % do nome da forma', () => {
    assert.strictEqual(F.entradaPctDoNome('50% entrada + 50% na instalação'), 50);
    assert.strictEqual(F.entradaPctDoNome('30% de entrada + 70%'), 30);
    assert.strictEqual(F.entradaPctDoNome('À vista'), 100);
    assert.strictEqual(F.entradaPctDoNome('PIX'), 50);
});
test('planejarParcelas: entrada na aprovacao, saldo na entrega, soma exata', () => {
    const p = F.planejarParcelas({ valor: 1000.01, entradaPct: 33, dataAprovacao: '2026-11-11', dataEntrega: '2026-12-01' });
    assert.deepStrictEqual(p.map(x => x.tipo), ['entrada', 'saldo']);
    assert.strictEqual(p[0].valor, 330);
    assert.strictEqual(F.arredondar(p[0].valor + p[1].valor), 1000.01);
    assert.strictEqual(p[0].data_vencimento, '2026-11-11');
    assert.strictEqual(p[1].data_vencimento, '2026-12-01');
});
test('planejarParcelas: 100% gera uma parcela unica', () => {
    const p = F.planejarParcelas({ valor: 500, entradaPct: 100, dataAprovacao: '2026-11-11', dataEntrega: '2026-12-01' });
    assert.deepStrictEqual(p, [{ tipo: 'unica', valor: 500, data_vencimento: '2026-11-11' }]);
});
test('planejarParcelas: sem data de entrega, saldo vence em 30 dias', () => {
    const p = F.planejarParcelas({ valor: 100, entradaPct: 50, dataAprovacao: '2026-11-11', dataEntrega: null });
    assert.strictEqual(p[1].data_vencimento, '2026-12-11');
});
test('planejarParcelas: reaprovacao com entrada paga gera so o saldo', () => {
    const p = F.planejarParcelas({ valor: 1200, entradaPct: 50, jaPago: 500, dataAprovacao: '2026-11-11', dataEntrega: '2026-12-01' });
    assert.deepStrictEqual(p.map(x => [x.tipo, x.valor]), [['entrada', 100], ['saldo', 600]]);
    const q = F.planejarParcelas({ valor: 1000, entradaPct: 50, jaPago: 1000, dataAprovacao: '2026-11-11', dataEntrega: '2026-12-01' });
    assert.deepStrictEqual(q, []);
});
test('totalRecebido e saldoEmAberto por pedido', () => {
    const cr = [{ pedido_id: 1, valor: 300, status: 'Pago' }, { pedido_id: 1, valor: 700, status: 'Atrasado' }, { pedido_id: 2, valor: 50, status: 'Pago' }];
    assert.strictEqual(F.totalRecebido(cr, 1), 300);
    assert.strictEqual(F.saldoEmAberto(cr, 1), 700);
});
test('custoSnapshotPedido usa preco_custo x consumo, marca item sem custo', () => {
    const cad = { catalogo: [{ id: 10, nome: 'Linho', preco_custo: 20 }], materiais: [{ id: 5, nome: 'Trilho', preco_custo: 0 }], kits: [{ id: 7, nome: 'Kit', preco_custo: 40 }] };
    const ped = { ambientes: [{ tecidos: [{ tecidoId: 10, consumo_linear: 3.5 }] }], itens: [{ materialId: 5, quantidade: 2 }, { kitId: 7, quantidade: 1 }] };
    const s = F.custoSnapshotPedido(ped, cad);
    assert.strictEqual(s.total, 110);
    assert.strictEqual(s.faltando, 1);
    assert.strictEqual(s.itens.find(i => i.origem === 'material').custo_total, null);
});
test('resultadoPedido: mao de obra e receita; tecido vinculado nao conta; outro e comissao contam', () => {
    const ped = { id: 1, valor: 1000, maoObra: 200, custo_snapshot: { total: 300, faltando: 0 } };
    const cp = [
        { pedido_id: 1, categoria: 'tecido', valor: 300 }, { pedido_id: 1, categoria: 'costureira', valor: 100 },
        { pedido_id: 1, categoria: 'outro', valor: 50 }, { pedido_id: 1, categoria: 'comissao', valor: 50 },
        { pedido_id: 2, categoria: 'instalador', valor: 999 }];
    const r = F.resultadoPedido(ped, cp, { catalogo: [], materiais: [], kits: [] });
    assert.deepStrictEqual([r.receita, r.custo_material, r.custos_vinculados, r.comissoes, r.lucro, r.origem_custo], [1000, 300, 150, 50, 500, 'snapshot']);
    assert.strictEqual(r.margem_pct, 50);
});
test('resultadoPedido: pedido antigo com custo proprio usa ele; sem nada, estimado', () => {
    const cad = { catalogo: [{ id: 10, preco_custo: 20 }], materiais: [], kits: [] };
    assert.strictEqual(F.resultadoPedido({ id: 1, valor: 100, tipo_precificacao: 'pedido', custo_mat: 30, custo_acess: 10 }, [], cad).origem_custo, 'pedido');
    const r = F.resultadoPedido({ id: 2, valor: 100, ambientes: [{ tecidos: [{ tecidoId: 10, consumo_linear: 1 }] }], itens: [] }, [], cad);
    assert.deepStrictEqual([r.origem_custo, r.custo_material], ['estimado', 20]);
});
test('contasComissaoDoPedido: uma por papel, idempotente', () => {
    const ped = { id: 1, vendedor_id: 3, comissao_pct: 5, comissao_valor: 50, arq_id: 4, arq_comissao_pct: 10, arq_comissao_valor: 100 };
    const vend = [{ id: 3, nome: 'Ana' }, { id: 4, nome: 'Bia' }];
    const novas = F.contasComissaoDoPedido(ped, { vendedores: vend, contasPagar: [], data: '2026-11-11', rotuloPedido: '#26001' });
    assert.deepStrictEqual(novas.map(c => [c.papel_comissao, c.valor, c.categoria, c.status, c.data_vencimento]),
        [['vendedor', 50, 'comissao', 'Pendente', '2026-11-11'], ['arquiteto', 100, 'comissao', 'Pendente', '2026-11-11']]);
    assert.deepStrictEqual(F.contasComissaoDoPedido(ped, { vendedores: vend, contasPagar: novas, data: '2026-11-11', rotuloPedido: '#26001' }), []);
});
test('parcelasCompra: a vista, prazo e parcelado com soma exata', () => {
    assert.deepStrictEqual(F.parcelasCompra({ valor: 100, modo: 'avista', hoje: '2026-11-11' }).map(p => p.data_vencimento), ['2026-11-11']);
    assert.deepStrictEqual(F.parcelasCompra({ valor: 100, modo: 'prazo', hoje: '2026-11-11', vencimento: '2026-12-20' }).map(p => p.data_vencimento), ['2026-12-20']);
    const p = F.parcelasCompra({ valor: 100, modo: 'parcelado', hoje: '2026-11-11', numParcelas: 3, intervaloDias: 30 });
    assert.deepStrictEqual(p.map(x => x.data_vencimento), ['2026-12-11', '2027-01-10', '2027-02-09']);
    assert.strictEqual(F.arredondar(p.reduce((s, x) => s + x.valor, 0)), 100);
});
test('acharContaDuplicadaNota: mesmo CNPJ, valor proximo, em aberto, vinda de PC', () => {
    const cps = [{ id: 1, pedido_compra_id: 9, cnpj_fornecedor: '12.345.678/0001-90', valor: 1000, status: 'Pendente' },
                 { id: 2, pedido_compra_id: 9, cnpj_fornecedor: '12345678000190', valor: 1000, status: 'Pago' }];
    assert.strictEqual(F.acharContaDuplicadaNota(cps, { cnpj: '12345678000190', valor: 1005 }).id, 1);
    assert.strictEqual(F.acharContaDuplicadaNota(cps, { cnpj: '12345678000190', valor: 1100 }), null);
});
