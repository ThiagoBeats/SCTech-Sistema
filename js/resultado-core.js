'use strict';
// Nucleo do Resultado do mes: entradas/saidas por mes, grupos de despesa, imposto
// (lancado pela referencia ou estimado), meta, despesas fixas, margem, ponto de
// equilibrio e orcamento. So funcoes puras — sem DOM, sem db, sem localStorage.
(function (raiz) {

    function arredondar(v) {
        const n = Number(v) || 0;
        return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
    }

    function mesmoId(a, b) {
        return a != null && b != null && String(a) === String(b);
    }

    const mesDe = data => (data ? String(data).slice(0, 7) : '');
    const num = v => (v === '' || v == null ? 0 : Number(v) || 0);

    // Soma n meses a 'YYYY-MM' (n pode ser negativo).
    function somarMeses(mes, n) {
        const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
        return Math.floor(total / 12) + '-' + String((total % 12) + 1).padStart(2, '0');
    }

    // Data no mes (e ate `ateData`, se informado).
    const noMes = (data, mes, ateData) => !!data && mesDe(data) === mes && (!ateData || String(data) <= ateData);

    const GRUPOS = [
        { id: 'fornecedores', rotulo: 'Fornecedores e materiais', categorias: ['tecido'] },
        { id: 'servicos', rotulo: 'Costureira e instalador', categorias: ['costureira', 'instalador'] },
        { id: 'comissoes', rotulo: 'Comissões', categorias: ['comissao', 'comissao_rt'] },
        { id: 'taxas', rotulo: 'Taxas de cartão', categorias: ['taxa_cartao'] },
        { id: 'fixas', rotulo: 'Despesas fixas', categorias: ['aluguel', 'salario', 'conta'] },
        { id: 'imposto', rotulo: 'Imposto', categorias: ['imposto'] },
        { id: 'outros', rotulo: 'Outros', categorias: ['outro'] }
    ];

    function grupoDaCategoria(categoria) {
        const g = GRUPOS.find(x => x.categorias.includes(categoria));
        return g ? g.id : 'outros';
    }

    function gruposZerados() {
        const o = {};
        GRUPOS.forEach(g => { o[g.id] = 0; });
        return o;
    }

    // Entradas: para cada CR paga, os movimentos de entrada origem 'cr' dela (cada um na sua data);
    // sem movimento, a propria parcela pela data_pagamento. Transferencias e CRs nao pagas nao contam.
    function entradasDoMes({ mes, contasReceber, movimentos, ateData }) {
        const itens = [];
        const movs = (movimentos || []).filter(m => m && m.origem === 'cr' && m.sentido !== 'saida');
        (contasReceber || []).filter(cr => cr && cr.status === 'Pago').forEach(cr => {
            const dela = movs.filter(m => mesmoId(m.origem_id, cr.id));
            if (dela.length) {
                dela.forEach(m => { if (noMes(m.data, mes, ateData)) itens.push({ data: m.data, valor: num(m.valor), cr_id: cr.id }); });
            } else if (noMes(cr.data_pagamento, mes, ateData)) {
                itens.push({ data: cr.data_pagamento, valor: num(cr.valor), cr_id: cr.id });
            }
        });
        return { total: arredondar(itens.reduce((s, i) => s + i.valor, 0)), itens };
    }

    // Saidas de caixa: CPs pagas com data_pagamento no mes, exceto imposto (vem de impostoDoMes).
    function saidasDoMes({ mes, contasPagar, ateData }) {
        const porGrupo = gruposZerados();
        (contasPagar || []).forEach(cp => {
            if (!cp || cp.status !== 'Pago' || cp.categoria === 'imposto') return;
            if (!noMes(cp.data_pagamento, mes, ateData)) return;
            const g = grupoDaCategoria(cp.categoria);
            porGrupo[g] += num(cp.valor);
        });
        let total = 0;
        Object.keys(porGrupo).forEach(g => { porGrupo[g] = arredondar(porGrupo[g]); total += porGrupo[g]; });
        return { total: arredondar(total), porGrupo };
    }

    // Mes de referencia da guia; guia sem o campo usa o mes anterior ao vencimento (mesmo padrao do formulario).
    function referenciaGuia(cp) {
        if (cp.mes_referencia) return String(cp.mes_referencia);
        const venc = mesDe(cp.data_vencimento);
        return venc ? somarMeses(venc, -1) : '';
    }

    // Imposto pela referencia: guias do mes (pagas ou em aberto); sem guia, estimativa pela aliquota.
    function impostoDoMes({ mes, contasPagar, faturamento, aliquota }) {
        const guias = (contasPagar || []).filter(cp => cp && cp.categoria === 'imposto' && referenciaGuia(cp) === mes);
        if (guias.length) {
            const lancado = arredondar(guias.reduce((s, cp) => s + num(cp.valor), 0));
            return { valor: lancado, estimado: false, lancado };
        }
        const aliq = num(aliquota);
        if (!(aliq > 0)) return { valor: 0, estimado: true, lancado: 0, semAliquota: true };
        return { valor: arredondar(num(faturamento) * aliq / 100), estimado: true, lancado: 0 };
    }

    function resultadoDoMes({ mes, contasReceber, contasPagar, movimentos, aliquota, ateData }) {
        const entradas = entradasDoMes({ mes, contasReceber, movimentos, ateData }).total;
        const sai = saidasDoMes({ mes, contasPagar, ateData });
        const taxas = sai.porGrupo.taxas;
        const faturamento = arredondar(entradas - taxas);
        const imposto = impostoDoMes({ mes, contasPagar, faturamento, aliquota });
        const porGrupo = Object.assign({}, sai.porGrupo, { imposto: imposto.valor });
        const saidas = arredondar(sai.total + imposto.valor);
        return { entradas, taxas, faturamento, saidas, porGrupo, imposto, resultado: arredondar(entradas - saidas) };
    }

    // Ajuste do mes (> 0) vence; senao o padrao; senao 0.
    function metaDoMes(mes, { padrao, ajustes } = {}) {
        const ajuste = num(ajustes && ajustes[mes]);
        if (ajuste > 0) return ajuste;
        const p = num(padrao);
        return p > 0 ? p : 0;
    }

    // Dia de vencimento de uma DF no mes (ajustado ao fim do mes), ou null se fora de data_inicio/data_fim.
    function vencimentoDfNoMes(df, mes) {
        const ano = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
        const dia = Math.max(1, Math.floor(Number(df.dia_vencimento) || 1));
        const ultimo = new Date(ano, m, 0).getDate();
        const data = mes + '-' + String(Math.min(dia, ultimo)).padStart(2, '0');
        if (df.data_inicio && data < df.data_inicio) return null;
        if (df.data_fim && data > df.data_fim) return null;
        return data;
    }

    // Despesas fixas do mes (por vencimento): CPs tipo 'fixo' vencendo no mes (pagas ou nao)
    // + DFs antigas (sem periodicidade), ativas, ainda nao geradas naquele mes.
    // Guia de imposto lancada como fixa fica de fora: o imposto ja entra na margem (custo variavel).
    function despesasFixasDoMes({ mes, contasPagar, despesasFixas }) {
        const cps = contasPagar || [];
        let total = 0;
        cps.forEach(cp => {
            if (cp && cp.tipo === 'fixo' && cp.categoria !== 'imposto' && mesDe(cp.data_vencimento) === mes) total += num(cp.valor);
        });
        (despesasFixas || []).forEach(df => {
            if (!df || df.periodicidade || df.ativo === false || df.categoria === 'imposto') return;
            if (!vencimentoDfNoMes(df, mes)) return;
            const gerada = cps.some(cp => cp && cp.tipo === 'fixo' && cp.descricao === df.descricao && mesDe(cp.data_vencimento) === mes);
            if (!gerada) total += num(df.valor);
        });
        return arredondar(total);
    }

    const media = lista => lista.reduce((s, x) => s + x, 0) / lista.length;

    // Margem de contribuicao em % (0-100). Historico: 3 meses fechados mais recentes com faturamento > 0,
    // ate 12 para tras. Sem historico: media das margens dos pedidos menos a aliquota.
    function margemContribuicao({ mesAtual, dadosPorMes, pedidosFallback, aliquota }) {
        const meses = [];
        const margens = [];
        for (let i = 1; i <= 12 && meses.length < 3; i++) {
            const mes = somarMeses(mesAtual, -i);
            const r = dadosPorMes(mes) || {};
            const fat = num(r.faturamento);
            if (!(fat > 0)) continue;
            const g = r.porGrupo || {};
            const imposto = num(r.imposto && r.imposto.valor);
            margens.push((fat - num(g.fornecedores) - num(g.servicos) - num(g.comissoes) - imposto) / fat);
            meses.push(mes);
        }
        if (margens.length) return { pct: arredondar(media(margens) * 100), base: 'historico', meses };
        const pedidos = (pedidosFallback || []).filter(p => p && num(p.receita) > 0);
        if (pedidos.length) {
            const m = media(pedidos.map(p => (num(p.receita) - num(p.custo_material) - num(p.custos_vinculados) - num(p.comissoes)) / num(p.receita)));
            return { pct: arredondar(m * 100 - num(aliquota)), base: 'pedidos', meses: [] };
        }
        return { pct: null, base: null, meses: [] };
    }

    function pontoEquilibrio(despesasFixas, margemPct) {
        if (margemPct == null || margemPct === '' || !Number.isFinite(Number(margemPct))) return { valor: null, motivo: 'sem_margem' };
        const pct = Number(margemPct);
        if (pct <= 0) return { valor: null, motivo: 'margem_negativa' };
        return { valor: arredondar(num(despesasFixas) / (pct / 100)) };
    }

    // Orcamento por grupo (ordem de GRUPOS); so grupos com limite > 0. perto >= 80%, estourou > 100%.
    function statusOrcamento({ limites, gastos } = {}) {
        const out = [];
        GRUPOS.forEach(g => {
            const limite = arredondar(num(limites && limites[g.id]));
            if (!(limite > 0)) return;
            const gasto = arredondar(num(gastos && gastos[g.id]));
            const razao = gasto / limite;
            const faixa = razao > 1 ? 'estourou' : (razao >= 0.8 ? 'perto' : 'ok');
            out.push({ grupo: g.id, rotulo: g.rotulo, limite, gasto, falta: arredondar(limite - gasto), pct: arredondar(razao * 100), faixa });
        });
        return out;
    }

    const api = { GRUPOS, grupoDaCategoria, entradasDoMes, saidasDoMes, impostoDoMes, resultadoDoMes, metaDoMes, despesasFixasDoMes, margemContribuicao, pontoEquilibrio, statusOrcamento, somarMeses, referenciaGuia };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ResultadoCore = api;

})(typeof window !== 'undefined' ? window : null);
