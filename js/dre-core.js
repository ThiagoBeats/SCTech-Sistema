'use strict';
// Nucleo da DRE (numeros): por regime (caixa/competencia), por mes e por categoria, ticket medio e
// comparacao com o periodo anterior. So funcoes puras — sem DOM, sem db, sem localStorage.
(function (raiz) {

    function dep(nome, arquivo) {
        if (raiz && raiz[nome]) return raiz[nome];
        if (typeof require === 'function') { try { return require(arquivo); } catch (e) { return null; } }
        return null;
    }
    const fin = () => dep('FinCatCore', './fin-cat-core.js');
    const res = () => dep('ResultadoCore', './resultado-core.js');

    const num = v => (v === '' || v == null ? 0 : Number(v) || 0);
    function arredondar(v) {
        const n = Number(v) || 0;
        return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
    }
    const dia10 = d => String(d).slice(0, 10);
    const pad = n => String(n).padStart(2, '0');
    const ultimoDia = (ano, mes) => new Date(ano, mes, 0).getDate();
    const iso = (a, m, d) => a + '-' + pad(m) + '-' + pad(d);

    function calcular(p) {
        p = p || {};
        const F = fin(), R = res();
        const regime = p.regime === 'competencia' ? 'competencia' : 'caixa';
        const de = p.de, ate = p.ate;
        const padrao = F.categoriasPadrao();
        const categorias = (p.categorias && p.categorias.length) ? p.categorias : padrao.categorias;
        const porId = new Map(categorias.map(c => [String(c.id), c]));
        // Categoria do registro; desconhecida ou de tipo contrario ao lado (CR = entrada, CP = saida) cai na do legado.
        // Estorno/reembolso nao entra (igual ao ResultadoCore): so valores positivos de cada lado.
        const catDe = (reg, tipo) => {
            const certo = tipo === 'receber' ? 'entrada' : 'saida';
            const c = reg.categoria_id != null && reg.categoria_id !== '' ? porId.get(String(reg.categoria_id)) : null;
            if (c && c.tipo === certo) return c;
            return porId.get(F.categoriaDoLegado(reg, tipo)) || null;
        };
        const subs = p.subgrupos && p.subgrupos.length ? p.subgrupos : padrao.subgrupos;
        const dentro = d => !!d && dia10(d) >= de && dia10(d) <= ate;
        const ok = !!de && !!ate && de <= ate;

        // Itens {tipo, reg, data, valor}: o que entra no periodo pelo regime.
        const itens = [];
        const crs = (p.contas_receber || []).filter(Boolean);
        const cps = (p.contas_pagar || []).filter(Boolean);
        if (ok && regime === 'caixa') {
            const porCr = new Map(crs.map(c => [String(c.id), c]));
            R.itensEntrada(dentro, crs, p.movimentos, p.contas, false, cps).forEach(i => {
                const cr = porCr.get(String(i.cr_id));
                if (cr) itens.push({ tipo: 'cr', reg: cr, data: dia10(i.data), valor: i.valor });
            });
            cps.forEach(cp => {
                if (cp.status !== 'Pago' || !dentro(cp.data_pagamento)) return;
                itens.push({ tipo: 'cp', reg: cp, data: dia10(cp.data_pagamento), valor: num(cp.valor) });
            });
        } else if (ok) {
            const comp = r => r.data_competencia || r.data_vencimento || r.data_pagamento;
            crs.forEach(cr => { if (cr.status !== 'Cancelado' && dentro(comp(cr))) itens.push({ tipo: 'cr', reg: cr, data: dia10(comp(cr)), valor: num(cr.valor) }); });
            cps.forEach(cp => { if (cp.status !== 'Cancelado' && dentro(comp(cp))) itens.push({ tipo: 'cp', reg: cp, data: dia10(comp(cp)), valor: num(cp.valor) }); });
        }

        const soma = { receitas: 0, custos: 0, despesas: 0, investimento: 0, financiamento: 0 };
        const porCategoria = {}, porSubgrupo = {}, lancamentos = {};
        itens.forEach(i => {
            const cat = catDe(i.reg, i.tipo === 'cr' ? 'receber' : 'pagar');
            if (!cat || cat.natureza === 'so_caixa' || !Object.prototype.hasOwnProperty.call(soma, cat.grupo)) return;
            const assinado = i.tipo === 'cr' ? i.valor : -i.valor;
            // custos e despesas ficam positivos; investimento e financiamento ficam com o sinal do dinheiro.
            const v = (cat.grupo === 'custos' || cat.grupo === 'despesas') ? -assinado : assinado;
            soma[cat.grupo] += v;
            porCategoria[cat.id] = (porCategoria[cat.id] || 0) + v;
            if (cat.subgrupo_id) porSubgrupo[cat.subgrupo_id] = (porSubgrupo[cat.subgrupo_id] || 0) + v;
            (lancamentos[cat.id] = lancamentos[cat.id] || []).push({ tipo: i.tipo, id: i.reg.id, data: i.data, valor: i.valor });
        });
        Object.keys(porCategoria).forEach(k => { porCategoria[k] = arredondar(porCategoria[k]); });
        Object.keys(porSubgrupo).forEach(k => { porSubgrupo[k] = arredondar(porSubgrupo[k]); });
        subs.forEach(s => { if (!(s.id in porSubgrupo)) porSubgrupo[s.id] = 0; });

        const receitas = arredondar(soma.receitas), custos = arredondar(soma.custos), despesas = arredondar(soma.despesas);
        const investimento = arredondar(soma.investimento), financiamento = arredondar(soma.financiamento);
        const margem = arredondar(receitas - custos);
        const resultadoOperacional = arredondar(margem - despesas);
        const liquido = arredondar(resultadoOperacional + investimento + financiamento);
        return { linhas: { receitas, custos, margem, despesas, resultadoOperacional, investimento, financiamento, liquido }, porCategoria, porSubgrupo, lancamentos };
    }

    // 12 meses do ano + total = soma dos 12 meses (linha a linha, igual a tabela).
    function calcularMeses(p) {
        p = p || {};
        const ano = Number(p.ano);
        const meses = [];
        for (let m = 1; m <= 12; m++) {
            meses.push(calcular(Object.assign({}, p, { de: iso(ano, m, 1), ate: iso(ano, m, ultimoDia(ano, m)) })));
        }
        const total = { linhas: {}, porCategoria: {}, porSubgrupo: {}, lancamentos: {} };
        Object.keys(meses[0].linhas).forEach(k => { total.linhas[k] = arredondar(meses.reduce((t, r) => t + r.linhas[k], 0)); });
        meses.forEach(r => {
            ['porCategoria', 'porSubgrupo'].forEach(mapa => {
                Object.keys(r[mapa]).forEach(k => { total[mapa][k] = arredondar((total[mapa][k] || 0) + r[mapa][k]); });
            });
            Object.keys(r.lancamentos).forEach(k => { total.lancamentos[k] = (total.lancamentos[k] || []).concat(r.lancamentos[k]); });
        });
        return { meses, total };
    }

    // Ticket medio: pedidos aprovados no periodo (status diferente de Orcamento, com valor), pela
    // data_aprovacao (inclusive). Pedido sem data_aprovacao nao conta.
    function ticketMedio(p) {
        p = p || {};
        const lista = (p.pedidos || []).filter(x => x && x.status !== 'Orçamento' && num(x.valor) > 0
            && !!x.data_aprovacao && dia10(x.data_aprovacao) >= p.de && dia10(x.data_aprovacao) <= p.ate);
        const total = lista.reduce((s, x) => s + num(x.valor), 0);
        return { valor: lista.length ? arredondar(total / lista.length) : 0, qtd: lista.length };
    }

    // Periodo de mesmo tamanho logo antes; meses cheios -> mesma quantidade de meses cheios antes.
    function periodoAnterior(de, ate) {
        const valido = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);
        if (!valido(de) || !valido(ate) || de > ate) return null;
        const [a1, m1, d1] = de.split('-').map(Number), [a2, m2, d2] = ate.split('-').map(Number);
        if (d1 === 1 && d2 === ultimoDia(a2, m2)) {
            const k = (a2 * 12 + m2) - (a1 * 12 + m1) + 1;
            const ini = a1 * 12 + (m1 - 1) - k, fim = a1 * 12 + (m1 - 1) - 1;
            const ai = Math.floor(ini / 12), mi = ini % 12 + 1, af = Math.floor(fim / 12), mf = fim % 12 + 1;
            return { de: iso(ai, mi, 1), ate: iso(af, mf, ultimoDia(af, mf)) };
        }
        const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000) + 1;
        const fmt = ms => { const t = new Date(ms); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
        const ini = Date.UTC(a1, m1 - 1, d1);
        return { de: fmt(ini - dias * 86400000), ate: fmt(ini - 86400000) };
    }

    function variacao(atual, anterior) {
        const b = num(anterior);
        if (b === 0) return null;
        return arredondar((num(atual) - b) / Math.abs(b) * 100);
    }

    const api = { calcular, calcularMeses, ticketMedio, periodoAnterior, variacao };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.DreCore = api;

})(typeof window !== 'undefined' ? window : null);
