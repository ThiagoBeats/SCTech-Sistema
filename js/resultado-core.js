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
    // `dentro(data)` diz se a data entra (mes, mes ate hoje ou periodo).
    function itensEntrada(dentro, contasReceber, movimentos) {
        const itens = [];
        const porCr = new Map();
        (movimentos || []).forEach(m => {
            if (!m || m.origem !== 'cr' || m.sentido === 'saida' || m.origem_id == null) return;
            const k = String(m.origem_id);
            if (!porCr.has(k)) porCr.set(k, []);
            porCr.get(k).push(m);
        });
        (contasReceber || []).filter(cr => cr && cr.status === 'Pago').forEach(cr => {
            const dela = cr.id == null ? null : porCr.get(String(cr.id));
            if (dela && dela.length) {
                dela.forEach(m => { if (dentro(m.data)) itens.push({ data: m.data, valor: num(m.valor), cr_id: cr.id }); });
            } else if (dentro(cr.data_pagamento)) {
                itens.push({ data: cr.data_pagamento, valor: num(cr.valor), cr_id: cr.id });
            }
        });
        return itens;
    }

    function entradasDoMes({ mes, contasReceber, movimentos, ateData }) {
        const itens = itensEntrada(d => noMes(d, mes, ateData), contasReceber, movimentos);
        return { total: arredondar(itens.reduce((s, i) => s + i.valor, 0)), itens };
    }

    // Saidas de caixa: CPs pagas com data_pagamento aceita por `dentro`, exceto imposto (vem de impostoDoMes).
    function itensSaida(dentro, contasPagar) {
        const itens = [];
        (contasPagar || []).forEach(cp => {
            if (!cp || cp.status !== 'Pago' || cp.categoria === 'imposto') return;
            if (!dentro(cp.data_pagamento)) return;
            itens.push({ data: cp.data_pagamento, valor: num(cp.valor), grupo: grupoDaCategoria(cp.categoria), cp_id: cp.id });
        });
        return itens;
    }

    function somarPorGrupo(itens) {
        const porGrupo = gruposZerados();
        itens.forEach(i => { porGrupo[i.grupo] += i.valor; });
        let total = 0;
        Object.keys(porGrupo).forEach(g => { porGrupo[g] = arredondar(porGrupo[g]); total += porGrupo[g]; });
        return { total: arredondar(total), porGrupo };
    }

    function saidasDoMes({ mes, contasPagar, ateData }) {
        return somarPorGrupo(itensSaida(d => noMes(d, mes, ateData), contasPagar));
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
        return { valor: Math.max(0, arredondar(num(faturamento) * aliq / 100)), estimado: true, lancado: 0 };
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

    const ultimoDia = mes => mes + '-' + String(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()).padStart(2, '0');

    // Periodo qualquer [de, ate] ('YYYY-MM-DD'), pelas mesmas regras do mes: entradas pela data em que o
    // dinheiro entra, saidas pagas no periodo. Imposto (pela referencia) so dos meses inteiros dentro do
    // periodo. Periodo so de meses inteiros: so a referencia (igual ao Resultado do mes). Periodo com algum
    // pedaco de mes: a guia PAGA cuja referencia nao e um mes inteiro do periodo conta pela data de pagamento
    // (se estiver no periodo); nunca conta duas vezes. Devolve tambem os itens (para graficos).
    function resultadoDoPeriodo({ de, ate, contasReceber, contasPagar, movimentos, aliquota }) {
        const dentro = d => !!d && String(d) >= de && String(d) <= ate;
        const ok = !!de && !!ate && de <= ate;
        const itensE = ok ? itensEntrada(dentro, contasReceber, movimentos) : [];
        const itensS = ok ? itensSaida(dentro, contasPagar) : [];
        const entradas = arredondar(itensE.reduce((s, i) => s + i.valor, 0));
        const sai = somarPorGrupo(itensS);
        const porMes = {};
        let impostoTotal = 0, estimado = false;
        if (ok) {
            for (let mes = mesDe(de); mes <= mesDe(ate); mes = somarMeses(mes, 1)) {
                if (de > mes + '-01' || ate < ultimoDia(mes)) continue;
                const imp = resultadoDoMes({ mes, contasReceber, contasPagar, movimentos, aliquota }).imposto;
                porMes[mes] = imp.valor;
                impostoTotal += imp.valor;
                if (imp.estimado && imp.valor > 0) estimado = true;
            }
        }
        const pagas = [];
        const temPedaco = ok && (mesDe(de) + '-01' !== de || ultimoDia(mesDe(ate)) !== ate);
        (temPedaco ? (contasPagar || []) : []).forEach(cp => {
            if (!cp || cp.categoria !== 'imposto' || cp.status !== 'Pago' || !dentro(cp.data_pagamento)) return;
            if (Object.prototype.hasOwnProperty.call(porMes, referenciaGuia(cp))) return;        // ja contada pela referencia
            pagas.push({ data: cp.data_pagamento, valor: num(cp.valor), cp_id: cp.id });
            impostoTotal += num(cp.valor);
        });
        // Imposto de mes incompleto que ficou de fora (nem pela referencia, nem pela guia paga no periodo).
        let foraIncompleto = false;
        if (ok) {
            for (let mes = mesDe(de); mes <= mesDe(ate) && !foraIncompleto; mes = somarMeses(mes, 1)) {
                if (Object.prototype.hasOwnProperty.call(porMes, mes)) continue;
                const devido = resultadoDoMes({ mes, contasReceber, contasPagar, movimentos, aliquota }).imposto.valor;
                const contado = pagas.reduce((s, i) => s + (referenciaGuia((contasPagar || []).find(cp => cp && mesmoId(cp.id, i.cp_id)) || {}) === mes ? i.valor : 0), 0);
                if (arredondar(devido - contado) > 0) foraIncompleto = true;
            }
        }
        const imposto = { valor: arredondar(impostoTotal), estimado, porMes, pagas, foraIncompleto };
        const taxas = sai.porGrupo.taxas;
        const porGrupo = Object.assign({}, sai.porGrupo, { imposto: imposto.valor });
        const saidas = arredondar(sai.total + imposto.valor);
        return { entradas, taxas, faturamento: arredondar(entradas - taxas), saidas, porGrupo, imposto, resultado: arredondar(entradas - saidas), itensEntrada: itensE, itensSaida: itensS };
    }

    // Previsto ate o fim do mes: resultado ate hoje + entradas previstas - saidas previstas (sem guias de
    // imposto, que contam pela referencia) com o imposto do mes refeito sobre o faturamento previsto
    // (faturamento ate hoje + entradas previstas - taxas previstas). Com guia de referencia no mes o imposto
    // e o da guia (ja no ate hoje); sem guia, aliquota x faturamento previsto.
    function previstoDoMes({ mes, ateHoje, entradasPrevistas, saidasPrevistas, taxasPrevistas, contasPagar, aliquota }) {
        const a = ateHoje || {};
        const faturamento = arredondar(num(a.faturamento) + num(entradasPrevistas) - num(taxasPrevistas));
        const imposto = impostoDoMes({ mes, contasPagar, faturamento, aliquota });
        const semImposto = num(a.resultado) + num(a.imposto && a.imposto.valor);
        return { valor: arredondar(semImposto + num(entradasPrevistas) - num(saidasPrevistas) - imposto.valor), faturamento, imposto };
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

    // Despesas fixas do mes (por vencimento): CPs tipo 'fixo' ou do grupo Despesas fixas (aluguel, salario,
    // conta, mesmo lancadas avulsas) vencendo no mes (pagas ou nao), cada CP uma vez + DFs antigas (sem periodicidade), ativas, ainda nao geradas naquele mes.
    // Guia de imposto lancada como fixa fica de fora: o imposto ja entra na margem (custo variavel).
    function despesasFixasDoMes({ mes, contasPagar, despesasFixas }) {
        const cps = contasPagar || [];
        let total = 0;
        cps.forEach(cp => {
            if (!cp || cp.categoria === 'imposto' || mesDe(cp.data_vencimento) !== mes) return;
            if (cp.tipo === 'fixo' || grupoDaCategoria(cp.categoria) === 'fixas') total += num(cp.valor);
        });
        (despesasFixas || []).forEach(df => {
            if (!df || df.periodicidade || df.ativo === false || df.categoria === 'imposto') return;
            if (!vencimentoDfNoMes(df, mes)) return;
            const gerada = cps.some(cp => cp && cp.tipo === 'fixo' && cp.descricao === df.descricao && mesDe(cp.data_vencimento) === mes);
            if (!gerada) total += num(df.valor);
        });
        return arredondar(total);
    }

    // Margem de contribuicao em % (0-100), PONDERADA: soma das contribuicoes / soma do faturamento.
    // Historico: 3 meses fechados mais recentes com faturamento > 0, ate 12 para tras.
    // Sem historico: pedidos, soma(receita - custos) / soma(receita), menos a aliquota.
    function margemContribuicao({ mesAtual, dadosPorMes, pedidosFallback, aliquota }) {
        const meses = [];
        let somaContrib = 0, somaFat = 0;
        for (let i = 1; i <= 12 && meses.length < 3; i++) {
            const mes = somarMeses(mesAtual, -i);
            const r = dadosPorMes(mes) || {};
            const fat = num(r.faturamento);
            if (!(fat > 0)) continue;
            const g = r.porGrupo || {};
            const imposto = num(r.imposto && r.imposto.valor);
            somaContrib += fat - num(g.fornecedores) - num(g.servicos) - num(g.comissoes) - imposto;
            somaFat += fat;
            meses.push(mes);
        }
        if (meses.length) return { pct: arredondar(somaContrib / somaFat * 100), base: 'historico', meses };
        const pedidos = (pedidosFallback || []).filter(p => p && num(p.receita) > 0);
        if (pedidos.length) {
            let contrib = 0, receita = 0;
            pedidos.forEach(p => {
                contrib += num(p.receita) - num(p.custo_material) - num(p.custos_vinculados) - num(p.comissoes);
                receita += num(p.receita);
            });
            return { pct: arredondar(contrib / receita * 100 - num(aliquota)), base: 'pedidos', meses: [] };
        }
        return { pct: null, base: null, meses: [] };
    }

    function pontoEquilibrio(despesasFixas, margemPct) {
        if (!(num(despesasFixas) > 0)) return { valor: null, motivo: 'sem_fixas' };
        if (margemPct == null || margemPct === '' || !Number.isFinite(Number(margemPct))) return { valor: null, motivo: 'sem_margem' };
        const pct = Number(margemPct);
        if (pct <= 0) return { valor: null, motivo: 'margem_negativa' };
        return { valor: arredondar(num(despesasFixas) / (pct / 100)) };
    }

    // Orcamento por grupo (ordem de GRUPOS); so grupos com limite > 0. perto >= 80%, estourou > 100%.
    // Faixa e pct calculados em centavos inteiros para nao errar a fronteira por ponto flutuante.
    function statusOrcamento({ limites, gastos } = {}) {
        const out = [];
        GRUPOS.forEach(g => {
            const limite = arredondar(num(limites && limites[g.id]));
            if (!(limite > 0)) return;
            const gasto = arredondar(num(gastos && gastos[g.id]));
            const gc = Math.round(gasto * 100), lc = Math.round(limite * 100);
            const faixa = gc > lc ? 'estourou' : (gc * 5 >= lc * 4 ? 'perto' : 'ok');
            // pct em 2 casas sem cruzar a fronteira da faixa: abaixo do limite trunca, acima arredonda para cima.
            const pct = (gc > lc ? Math.ceil(gc * 10000 / lc) : Math.floor(gc * 10000 / lc)) / 100;
            out.push({ grupo: g.id, rotulo: g.rotulo, limite, gasto, falta: arredondar((lc - gc) / 100), pct, faixa });
        });
        return out;
    }

    const api = { GRUPOS, grupoDaCategoria, entradasDoMes, saidasDoMes, impostoDoMes, resultadoDoMes, resultadoDoPeriodo, metaDoMes, despesasFixasDoMes, margemContribuicao, pontoEquilibrio, statusOrcamento, previstoDoMes, somarMeses, referenciaGuia };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ResultadoCore = api;

})(typeof window !== 'undefined' ? window : null);
