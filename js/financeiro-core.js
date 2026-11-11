'use strict';
// Nucleo do financeiro: parcelas, custo do pedido, resultado e comissoes.
// So funcoes puras — sem DOM, sem db, sem localStorage — para rodar em `node --test`.
(function (raiz) {

    // Mesmo mapa de CAMPOS_COMISSAO do app.js: campos do pedido por papel.
    const CAMPOS_COMISSAO = {
        vendedor:  { id: 'vendedor_id', nome: 'vendedor_nome', pct: 'comissao_pct',     valor: 'comissao_valor',     paga: 'comissao_paga',     data: 'comissao_data_pgto' },
        arquiteto: { id: 'arq_id',      nome: 'arq_nome',      pct: 'arq_comissao_pct', valor: 'arq_comissao_valor', paga: 'arq_comissao_paga', data: 'arq_comissao_data_pgto' },
    };

    function arredondar(v) {
        const n = Number(v) || 0;
        return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
    }

    // Soma dias a uma data ISO sem problema de fuso (meio-dia).
    function somarDias(dataISO, dias) {
        const d = new Date(dataISO + 'T12:00:00');
        d.setDate(d.getDate() + dias);
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    function entradaPctDoNome(nome) {
        const n = String(nome || '');
        const m = n.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s+)?entrada/i);
        if (m) return parseFloat(m[1].replace(',', '.'));
        const semAcento = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        if (semAcento.includes('vista')) return 100;
        return 50;
    }

    function planejarParcelas({ valor, entradaPct, jaPago = 0, dataAprovacao, dataEntrega }) {
        const dataSaldo = dataEntrega || somarDias(dataAprovacao, 30);
        if (entradaPct >= 100) {
            const v = arredondar(valor - jaPago);
            return v > 0 ? [{ tipo: 'unica', valor: v, data_vencimento: dataAprovacao }] : [];
        }
        const entrada = arredondar(valor * entradaPct / 100);
        const entradaRestante = Math.max(0, arredondar(entrada - jaPago));
        const saldo = arredondar(valor - jaPago - entradaRestante);
        const out = [];
        if (entradaRestante > 0) out.push({ tipo: 'entrada', valor: entradaRestante, data_vencimento: dataAprovacao });
        if (saldo > 0) out.push({ tipo: 'saldo', valor: saldo, data_vencimento: dataSaldo });
        return out;
    }

    function _doPedido(lista, pedidoId) {
        return (lista || []).filter(c => c.pedido_id == pedidoId);
    }

    function totalRecebido(contasReceber, pedidoId) {
        return arredondar(_doPedido(contasReceber, pedidoId).filter(c => c.status === 'Pago').reduce((s, c) => s + (Number(c.valor) || 0), 0));
    }

    function saldoEmAberto(contasReceber, pedidoId) {
        return arredondar(_doPedido(contasReceber, pedidoId).filter(c => c.status !== 'Pago').reduce((s, c) => s + (Number(c.valor) || 0), 0));
    }

    function custoSnapshotPedido(ped, { catalogo, materiais, kits } = {}) {
        const itens = [];
        let total = 0, faltando = 0;
        const achar = (lista, id) => (lista || []).find(x => x.id == id);
        const add = (origem, ref_id, nome, quantidade, unit) => {
            const q = Number(quantidade) || 0;
            const ok = Number(unit) > 0;
            const custo_total = ok ? arredondar(unit * q) : null;
            if (ok) total += custo_total; else faltando++;
            itens.push({ origem, ref_id, nome, quantidade: q, custo_unit: ok ? Number(unit) : null, custo_total });
        };
        (ped.ambientes || []).forEach(a => (a.tecidos || []).forEach(t => {
            const c = achar(catalogo, t.tecidoId);
            add('tecido', t.tecidoId, c ? c.nome : (t.nome || ''), t.consumo_linear, c && c.preco_custo);
        }));
        (ped.itens || []).forEach(i => {
            if (i.kitId != null) {
                const k = achar(kits, i.kitId);
                add('kit', i.kitId, k ? k.nome : (i.nome || ''), i.quantidade, k && k.preco_custo);
            } else if (i.materialId != null) {
                const m = achar(materiais, i.materialId);
                add('material', i.materialId, m ? m.nome : (i.nome || ''), i.quantidade, m && m.preco_custo);
            }
        });
        return { total: arredondar(total), itens, faltando };
    }

    function resultadoPedido(ped, contasPagar, cadastros) {
        const receita = Number(ped.valor) || 0;
        let custo_material, origem_custo, itens_sem_custo = 0;
        if (ped.custo_snapshot && ped.custo_snapshot.total != null) {
            custo_material = Number(ped.custo_snapshot.total) || 0;
            origem_custo = 'snapshot';
            itens_sem_custo = ped.custo_snapshot.faltando || 0;
        } else if (ped.tipo_precificacao === 'pedido' && ped.custo_mat != null) {
            custo_material = (Number(ped.custo_mat) || 0) + (Number(ped.custo_acess) || 0);
            origem_custo = 'pedido';
        } else {
            const s = custoSnapshotPedido(ped, cadastros || {});
            custo_material = s.total;
            origem_custo = 'estimado';
            itens_sem_custo = s.faltando;
        }
        const cps = _doPedido(contasPagar, ped.id);
        const soma = l => l.reduce((s, c) => s + (Number(c.valor) || 0), 0);
        const ehComissao = c => c.categoria === 'comissao' || c.categoria === 'comissao_rt';
        const comissoes = arredondar(soma(cps.filter(ehComissao)));
        const custos_vinculados = arredondar(soma(cps.filter(c => !ehComissao(c) && c.categoria !== 'tecido')));
        const lucro = arredondar(receita - custo_material - custos_vinculados - comissoes);
        const margem_pct = receita > 0 ? Math.round(lucro / receita * 1000) / 10 : 0;
        return { receita, custo_material: arredondar(custo_material), origem_custo, custos_vinculados, comissoes, lucro, margem_pct, itens_sem_custo };
    }

    function contasComissaoDoPedido(ped, { vendedores, contasPagar, data, rotuloPedido }) {
        const novas = [];
        Object.keys(CAMPOS_COMISSAO).forEach(papel => {
            const c = CAMPOS_COMISSAO[papel];
            const id = ped[c.id];
            const valor = Number(ped[c.valor]) || 0;
            if (!id || !(valor > 0)) return;
            const existe = (contasPagar || []).some(cp => cp.pedido_id == ped.id && cp.papel_comissao === papel);
            if (existe) return;
            const v = (vendedores || []).find(x => x.id == id);
            const nome = (v && v.nome) || ped[c.nome] || '';
            novas.push({
                descricao: `Comissão ${ped[c.pct] || 0}% — ${nome} — Ped. ${rotuloPedido}`,
                valor: arredondar(valor),
                categoria: 'comissao',
                tipo: 'variavel',
                status: 'Pendente',
                data_vencimento: data,
                data_pagamento: null,
                credor_nome: nome,
                vendedor_id: id,
                pedido_id: ped.id,
                papel_comissao: papel
            });
        });
        return novas;
    }

    function parcelasCompra({ valor, modo, hoje, vencimento, numParcelas, intervaloDias }) {
        if (modo === 'avista') return [{ valor: arredondar(valor), data_vencimento: hoje, parcela_atual: 1, numero_parcelas: 1 }];
        if (modo === 'prazo') return [{ valor: arredondar(valor), data_vencimento: vencimento, parcela_atual: 1, numero_parcelas: 1 }];
        const n = Math.max(1, numParcelas || 1);
        const base = arredondar(valor / n);
        const out = [];
        let acumulado = 0;
        for (let i = 0; i < n; i++) {
            const v = i === n - 1 ? arredondar(valor - acumulado) : base;
            acumulado = arredondar(acumulado + v);
            out.push({ valor: v, data_vencimento: somarDias(hoje, intervaloDias * (i + 1)), parcela_atual: i + 1, numero_parcelas: n });
        }
        return out;
    }

    function acharContaDuplicadaNota(contasPagar, { cnpj, valor }, toleranciaPct = 1) {
        const dig = s => String(s || '').replace(/\D/g, '');
        const alvo = dig(cnpj);
        const tol = Math.max(0.01, valor * toleranciaPct / 100);
        const candidatas = (contasPagar || []).filter(c => c.pedido_compra_id && c.status !== 'Pago' && alvo && dig(c.cnpj_fornecedor) === alvo);
        return candidatas.find(c => {
            if (Math.abs((Number(c.valor) || 0) - valor) <= tol) return true;
            if (c.lancamento_pai_id == null) return false;
            const grupo = (contasPagar || []).filter(x => x.lancamento_pai_id == c.lancamento_pai_id || x.id == c.lancamento_pai_id);
            const soma = grupo.reduce((s, x) => s + (Number(x.valor) || 0), 0);
            return Math.abs(soma - valor) <= tol;
        }) || null;
    }

    const api = {
        CAMPOS_COMISSAO, arredondar, somarDias, entradaPctDoNome, planejarParcelas, totalRecebido, saldoEmAberto,
        custoSnapshotPedido, resultadoPedido, contasComissaoDoPedido, parcelasCompra, acharContaDuplicadaNota
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.FinanceiroCore = api;

})(typeof window !== 'undefined' ? window : null);
