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

// ── Migracao dos dados antigos (Fase 0) ─────────────────────────────
const msLocal = (a, m, d) => new Date(a, m - 1, d, 15, 0).getTime();   // 15h locais: a data local e sempre a do dia
const baseMig = extra => ({ pedidos: [], contas_receber: [], contas_pagar: [], vendedores: [], hoje: '2026-11-11', rotuloPedido: p => '#' + p.id, ...extra });
const planoVazio = { baixarCR: [], removerCR: [], marcarCRPedidoExcluido: [], criarCP: [], revisar: [] };

test('dataLocalISO converte epoch ms para a data local e aceita data ISO', () => {
    assert.strictEqual(F.dataLocalISO(msLocal(2026, 10, 5)), '2026-10-05');
    assert.strictEqual(F.dataLocalISO('2026-10-05'), '2026-10-05');
    assert.strictEqual(F.dataLocalISO(null), null);
});
test('planoMigracaoFase0: pedido com pagamento confirmado e parcelas em aberto baixa as parcelas', () => {
    const plano = F.planoMigracaoFase0(baseMig({
        pedidos: [{ id: 1, status: 'Instalado', valor: 1000, valor_recebido: 1000, pagamento_confirmado_em: msLocal(2026, 10, 5), pagamento_confirmado_por: 7, data_instalado: msLocal(2026, 10, 1) },
                  { id: 2, status: 'Na Costura', valor: 500, valor_recebido: 500 },
                  { id: 3, status: 'Instalado', valor: 300, pagamento_confirmado_em: msLocal(2026, 10, 5), pagamento_pendente: true }],
        contas_receber: [{ id: 10, pedido_id: 1, valor: 500, status: 'Pago', data_pagamento: '2026-09-01' }, { id: 11, pedido_id: 1, valor: 500, status: 'Atrasado' },
                         { id: 20, pedido_id: 2, valor: 500, status: 'Pendente' }, { id: 30, pedido_id: 3, valor: 300, status: 'Pendente' }]
    }));
    assert.deepStrictEqual(plano.baixarCR, [
        { id: 11, data_pagamento: '2026-10-05', baixado_por: 7 },
        { id: 20, data_pagamento: '2026-11-11', baixado_por: 'migracao' }]);
    assert.deepStrictEqual(plano.revisar, []);
});
test('planoMigracaoFase0: sem data de confirmacao, a baixa usa a data de instalacao', () => {
    const plano = F.planoMigracaoFase0(baseMig({
        pedidos: [{ id: 1, status: 'Instalado', valor: 100, valor_recebido: 100, data_instalado: msLocal(2026, 10, 1) }],
        contas_receber: [{ id: 11, pedido_id: 1, valor: 100, status: 'Pendente' }]
    }));
    assert.deepStrictEqual(plano.baixarCR, [{ id: 11, data_pagamento: '2026-10-01', baixado_por: 'migracao' }]);
});
test('planoMigracaoFase0: valor recebido parcial que nao bate com o Financeiro vai para revisao', () => {
    const plano = F.planoMigracaoFase0(baseMig({
        pedidos: [{ id: 1, status: 'Na Costura', valor: 1000, valor_recebido: 300 },
                  { id: 2, status: 'Na Costura', valor: 1000, valor_recebido: 500 }],
        contas_receber: [{ id: 11, pedido_id: 1, valor: 500, status: 'Pendente' }, { id: 12, pedido_id: 1, valor: 500, status: 'Pendente' },
                         { id: 21, pedido_id: 2, valor: 500, status: 'Pago' }, { id: 22, pedido_id: 2, valor: 500, status: 'Pendente' }]
    }));
    assert.deepStrictEqual(plano.revisar, [{ pedido_id: 1, motivo: 'valor recebido digitado no pedido não bate com o Financeiro' }]);
    assert.deepStrictEqual(plano.baixarCR, []);
});
test('planoMigracaoFase0: pedido instalado ganha as contas de comissao; as pagas saem pagas', () => {
    const plano = F.planoMigracaoFase0(baseMig({
        pedidos: [{ id: 1, status: 'Instalado', valor: 1000, data_instalado: msLocal(2026, 10, 1),
                    vendedor_id: 3, comissao_pct: 5, comissao_valor: 50, comissao_paga: true, comissao_data_pgto: msLocal(2026, 10, 20),
                    arq_id: 4, arq_comissao_pct: 10, arq_comissao_valor: 100 },
                  { id: 2, status: 'Na Costura', valor: 1000, vendedor_id: 3, comissao_pct: 5, comissao_valor: 50 }],
        vendedores: [{ id: 3, nome: 'Ana' }, { id: 4, nome: 'Bia' }]
    }));
    assert.deepStrictEqual(plano.criarCP.map(c => [c.pedido_id, c.papel_comissao, c.valor, c.categoria, c.status, c.data_vencimento, c.data_pagamento, c.baixado_por || null]), [
        [1, 'vendedor', 50, 'comissao', 'Pago', '2026-10-01', '2026-10-20', 'migracao'],
        [1, 'arquiteto', 100, 'comissao', 'Pendente', '2026-10-01', null, null]]);
    assert.ok(plano.criarCP.every(c => c.id === undefined));
});
test('planoMigracaoFase0: comissao paga sem data de pagamento usa a data de instalacao', () => {
    const plano = F.planoMigracaoFase0(baseMig({
        pedidos: [{ id: 1, status: 'Instalado', valor: 1000, data_instalado: msLocal(2026, 10, 1), vendedor_id: 3, comissao_valor: 50, comissao_paga: true }],
        vendedores: [{ id: 3, nome: 'Ana' }]
    }));
    assert.deepStrictEqual([plano.criarCP[0].status, plano.criarCP[0].data_pagamento], ['Pago', '2026-10-01']);
});
test('planoMigracaoFase0: RT legado vira comissao de arquiteto quando nao ha outra', () => {
    const plano = F.planoMigracaoFase0(baseMig({
        pedidos: [{ id: 1, status: 'Instalado', valor: 1234.5, data_instalado: msLocal(2026, 10, 1), arquiteto_nome: 'Carla', rt_pct: 10 },
                  { id: 2, status: 'Instalado', valor: 1000, arquiteto_nome: 'Carla', rt_pct: 10, rt_gerado: true },
                  { id: 3, status: 'Instalado', valor: 1000, arquiteto_nome: 'Carla', rt_pct: 10, arq_id: 4, arq_comissao_valor: 80 },
                  { id: 4, status: 'Instalado', valor: 1000, arquiteto_nome: 'Carla', rt_pct: 10 },
                  { id: 5, status: 'Na Costura', valor: 1000, arquiteto_nome: 'Carla', rt_pct: 10 },
                  { id: 6, status: 'Instalado', valor: 1000, arquiteto_nome: 'Carla', rt_pct: 10 }],
        contas_pagar: [{ id: 90, pedido_id: 4, papel_comissao: 'arquiteto', valor: 100, status: 'Pendente' },
                       { id: 91, pedido_id: 6, categoria: 'comissao_rt', valor: 100, status: 'Pago' }],
        vendedores: [{ id: 4, nome: 'Bia' }]
    }));
    assert.deepStrictEqual(plano.criarCP.map(c => [c.pedido_id, c.papel_comissao, c.valor, c.credor_nome, c.categoria, c.status, c.data_vencimento]), [
        [1, 'arquiteto', 123.45, 'Carla', 'comissao', 'Pendente', '2026-10-01'],
        [3, 'arquiteto', 80, 'Bia', 'comissao', 'Pendente', '2026-11-11']]);
});
test('planoMigracaoFase0: conta a receber sem pedido — aberta sai, paga fica marcada', () => {
    const plano = F.planoMigracaoFase0(baseMig({
        pedidos: [{ id: 1, status: 'Na Costura', valor: 100 }],
        contas_receber: [{ id: 11, pedido_id: 1, valor: 100, status: 'Pendente' }, { id: 12, pedido_id: 99, valor: 50, status: 'Atrasado' },
                         { id: 13, pedido_id: 99, valor: 50, status: 'Pago' }, { id: 14, valor: 70, status: 'Pendente' },
                         { id: 15, pedido_id: 98, valor: 10, status: 'Pago', pedido_excluido: true }]
    }));
    assert.deepStrictEqual(plano.removerCR, [12]);
    assert.deepStrictEqual(plano.marcarCRPedidoExcluido, [13]);
});
test('planoMigracaoFase0: nunca redivide parcelas nem cria custo', () => {
    const dados = baseMig({
        pedidos: [{ id: 1, status: 'Instalado', valor: 1000, valor_recebido: 1000, pagamento_confirmado_em: msLocal(2026, 10, 5) }],
        contas_receber: [{ id: 11, pedido_id: 1, valor: 1000, status: 'Pendente' }]
    });
    const antes = JSON.stringify(dados.pedidos) + JSON.stringify(dados.contas_receber);
    const plano = F.planoMigracaoFase0(dados);
    assert.strictEqual(JSON.stringify(dados.pedidos) + JSON.stringify(dados.contas_receber), antes);
    assert.deepStrictEqual(plano.baixarCR.map(b => b.id), [11]);
    assert.ok(!('custo_snapshot' in dados.pedidos[0]));
});
test('aplicar o plano e planejar de novo da vazio', () => {
    const dados = baseMig({
        pedidos: [{ id: 1, status: 'Instalado', valor: 1000, valor_recebido: 1000, pagamento_confirmado_em: msLocal(2026, 10, 5),
                    vendedor_id: 3, comissao_valor: 50, comissao_paga: true, arquiteto_nome: 'Carla', rt_pct: 5 },
                  { id: 2, status: 'Na Costura', valor: 1000, valor_recebido: 300 }],
        contas_receber: [{ id: 11, pedido_id: 1, valor: 1000, status: 'Pendente' }, { id: 21, pedido_id: 2, valor: 1000, status: 'Pendente' },
                         { id: 31, pedido_id: 99, valor: 5, status: 'Pendente' }, { id: 32, pedido_id: 99, valor: 5, status: 'Pago' }],
        vendedores: [{ id: 3, nome: 'Ana' }]
    });
    // Aplica como o app: baixa, remove, marca, cria (com id) e sincroniza o valor recebido dos pedidos tocados.
    const aplicar = (d, p) => {
        const c = { ...JSON.parse(JSON.stringify(d)), rotuloPedido: d.rotuloPedido };
        const tocados = new Set();
        p.baixarCR.forEach(b => { const cr = c.contas_receber.find(x => x.id === b.id); Object.assign(cr, { status: 'Pago', data_pagamento: b.data_pagamento, baixado_por: b.baixado_por }); tocados.add(cr.pedido_id); });
        c.contas_receber = c.contas_receber.filter(x => !p.removerCR.includes(x.id));
        p.marcarCRPedidoExcluido.forEach(id => { c.contas_receber.find(x => x.id === id).pedido_excluido = true; });
        p.criarCP.forEach((cp, i) => c.contas_pagar.push({ id: 1000 + i, ...cp }));
        p.revisar.forEach(r => { if (!r.sem_lancamento) tocados.add(r.pedido_id); });   // sem parcelas: o valor digitado fica
        tocados.forEach(id => { c.pedidos.find(x => x.id === id).valor_recebido = F.totalRecebido(c.contas_receber, id); });
        return c;
    };
    const plano1 = F.planoMigracaoFase0(dados);
    assert.ok(plano1.baixarCR.length && plano1.removerCR.length && plano1.marcarCRPedidoExcluido.length && plano1.criarCP.length === 2 && plano1.revisar.length);
    assert.deepStrictEqual(F.planoMigracaoFase0(aplicar(dados, plano1)), planoVazio);

    // Pedido sem parcelas com valor digitado: o aviso se repete, mas nada muda nos dados.
    const comAviso = { ...dados, pedidos: [...dados.pedidos, { id: 3, status: 'Orçamento', valor: 500, valor_recebido: 200 }] };
    const aplicado = aplicar(comAviso, F.planoMigracaoFase0(comAviso));
    assert.strictEqual(aplicado.pedidos.find(x => x.id === 3).valor_recebido, 200);
    const plano2 = F.planoMigracaoFase0(aplicado);
    assert.deepStrictEqual({ ...plano2, revisar: [] }, planoVazio);
    assert.deepStrictEqual(plano2.revisar.map(r => r.pedido_id), [3]);
});

// ── Acertos da revisao final ────────────────────────────────────────
test('custoSnapshotPedido: pedido antigo com tecido no ambiente ou no proprio pedido', () => {
    const cad = { catalogo: [{ id: 10, nome: 'Linho', preco_custo: 20 }], materiais: [], kits: [] };
    const noAmbiente = { ambientes: [{ tecidoId: 10, consumo_linear: 2 }], itens: [] };
    assert.deepStrictEqual([F.custoSnapshotPedido(noAmbiente, cad).total, F.custoSnapshotPedido(noAmbiente, cad).faltando], [40, 0]);
    const noPedido = { tecidoId: 10, consumo_linear: 3 };
    assert.deepStrictEqual([F.custoSnapshotPedido(noPedido, cad).total, F.custoSnapshotPedido(noPedido, cad).faltando], [60, 0]);
    // Ambiente vazio (sem tecido escolhido nem consumo) nao vira item sem custo.
    const vazio = { ambientes: [{ tecidos: [] }, { tecidos: [{ tecidoId: null, consumo_linear: 0 }] }], itens: [] };
    assert.deepStrictEqual([F.custoSnapshotPedido(vazio, cad).total, F.custoSnapshotPedido(vazio, cad).faltando], [0, 0]);
    const r = F.resultadoPedido({ id: 1, valor: 100, ...noPedido }, [], cad);
    assert.deepStrictEqual([r.origem_custo, r.custo_material], ['estimado', 60]);
});
test('contasComissaoDoPedido: comissao_rt antiga do pedido conta como a do arquiteto', () => {
    const ped = { id: 1, vendedor_id: 3, comissao_valor: 50, arq_id: 4, arq_comissao_valor: 100 };
    const cps = [{ id: 9, pedido_id: 1, categoria: 'comissao_rt', valor: 100, status: 'Pago' }];
    const novas = F.contasComissaoDoPedido(ped, { vendedores: [], contasPagar: cps, data: '2026-11-11', rotuloPedido: '#1' });
    assert.deepStrictEqual(novas.map(c => c.papel_comissao), ['vendedor']);
});
test('planoMigracaoFase0: valor recebido digitado em pedido sem parcelas vai para revisao', () => {
    const plano = F.planoMigracaoFase0(baseMig({
        pedidos: [{ id: 1, status: 'Orçamento', valor: 1000, valor_recebido: 300 },
                  { id: 2, status: 'Orçamento', valor: 1000, valor_recebido: 0 },
                  { id: 3, status: 'Orçamento', valor: 500, valor_recebido: 500 }]
    }));
    assert.deepStrictEqual(plano.revisar, [
        { pedido_id: 1, motivo: 'valor recebido digitado no pedido sem lançamento no Financeiro', sem_lancamento: true },
        { pedido_id: 3, motivo: 'valor recebido digitado no pedido sem lançamento no Financeiro', sem_lancamento: true }]);
    assert.deepStrictEqual(plano.baixarCR, []);
});
