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
    const fcore = () => dep('FinanceiroCore', './financeiro-core.js');

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
            // Pagamento de comissao registrado no pedido: so o movimento (origem 'comissao'), pela data dele.
            (p.movimentos || []).forEach(m => {
                if (!m || m.origem !== 'comissao' || m.sentido !== 'saida' || !dentro(m.data)) return;
                itens.push({ tipo: 'comissao', reg: Object.assign({ categoria_id: 'cat_comissoes' }, m), data: dia10(m.data), valor: num(m.valor) });
            });
        } else if (ok) {
            const comp = r => r.data_competencia || r.data_vencimento || r.data_pagamento;
            crs.forEach(cr => { if (cr.status !== 'Cancelado' && dentro(comp(cr))) itens.push({ tipo: 'cr', reg: cr, data: dia10(comp(cr)), valor: num(cr.valor) }); });
            cps.forEach(cp => { if (cp.status !== 'Cancelado' && dentro(comp(cp))) itens.push({ tipo: 'cp', reg: cp, data: dia10(comp(cp)), valor: num(cp.valor) }); });
            // Comissao do pedido (pendente ou paga; nao a registrada): no mes em que o pedido foi instalado.
            const FC = fcore();
            (p.pedidos || []).forEach(ped => {
                const di = ped && FC.dataLocalISO(ped.data_instalado);
                if (!di || !dentro(di)) return;
                FC.comissoesContaveis(ped, cps).forEach(c => {
                    itens.push({ tipo: 'comissao', reg: { id: ped.id + ':' + c.papel, categoria_id: 'cat_comissoes', descricao: 'Comissão — Pedido #' + String(ped.id) }, data: di, valor: c.valor });
                });
            });
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
            (lancamentos[cat.id] = lancamentos[cat.id] || []).push(Object.assign({ tipo: i.tipo, id: i.reg.id, data: i.data, valor: i.valor }, i.tipo === 'comissao' ? { descricao: i.reg.descricao || 'Comissão' } : {}));
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


    // ---- Tabela por periodos + analises vertical/horizontal (so montagem sobre calcular) ----
    const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const dm = d => d.slice(8, 10) + '/' + d.slice(5, 7);
    const dma = d => dm(d) + '/' + d.slice(2, 4);

    function periodos(de, ate, intervalo) {
        const valido = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);
        if (!valido(de) || !valido(ate) || de > ate) return [];
        de = dia10(de); ate = dia10(ate);
        const tam = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[intervalo];
        if (!tam) return [{ rotulo: dma(de) + '–' + dma(ate), de, ate }];
        const out = [];
        let a = Number(de.slice(0, 4)), m = Math.floor((Number(de.slice(5, 7)) - 1) / tam) * tam + 1;
        for (;;) {
            const ini = iso(a, m, 1);
            if (ini > ate) break;
            const mf = m + tam - 1;
            const fim = iso(a, mf, ultimoDia(a, mf));
            const pde = ini < de ? de : ini, pate = fim > ate ? ate : fim;
            let rotulo;
            if (pde !== ini || pate !== fim) rotulo = dm(pde) + '–' + dm(pate);
            else if (tam === 1) rotulo = MESES[m - 1] + '/' + String(a).slice(2);
            else if (tam === 3) rotulo = ((m - 1) / 3 + 1) + 'º tri/' + String(a).slice(2);
            else if (tam === 6) rotulo = ((m - 1) / 6 + 1) + 'º sem/' + String(a).slice(2);
            else rotulo = String(a);
            out.push({ rotulo, de: pde, ate: pate });
            m += tam;
            if (m > 12) { m = 1; a++; }
        }
        return out;
    }

    function tabela(p) {
        p = p || {};
        const F = fin();
        const padrao = F.categoriasPadrao();
        const categorias = (p.categorias && p.categorias.length) ? p.categorias : padrao.categorias;
        const subs = p.subgrupos && p.subgrupos.length ? p.subgrupos : padrao.subgrupos;
        const pers = periodos(p.de, p.ate, p.intervalo);
        const calc = pers.map(per => calcular(Object.assign({}, p, { de: per.de, ate: per.ate })));
        const soma = arr => arredondar(arr.reduce((t, v) => t + v, 0));
        const linhas = [];
        const add = (chave, tipo, nivel, id, rotulo, pai, sinal, valores, extra) => {
            linhas.push(Object.assign({ chave, tipo, nivel, id, rotulo, pai, sinal, valores, total: soma(valores) }, extra || {}));
        };
        const dosGrupo = k => calc.map(c => c.linhas[k]);
        const rotuloGrupo = id => (F.GRUPOS.find(g => g.id === id) || {}).rotulo || id;
        const catsDe = g => categorias.filter(c => c.grupo === g && c.natureza !== 'so_caixa').map(c => {
            const valores = calc.map(r => r.porCategoria[c.id] || 0);
            return { c, valores, visivel: c.ativo !== false || valores.some(v => v !== 0) };
        }).filter(x => x.visivel);
        const addCat = (x, nivel, pai, sinal) => add('cat:' + x.c.id, 'categoria', nivel, x.c.id, x.c.nome, pai, sinal, x.valores, x.c.ativo === false ? { inativa: true } : null);
        // grupo -> subgrupos (so os que tem categoria visivel) -> categorias; categoria sem subgrupo fica direto no grupo.
        const grupoComSub = (g, sinal) => {
            add(g, 'grupo', 0, g, rotuloGrupo(g), null, sinal === 'entrada' || sinal === 'saida' ? sinal : 'resultado', dosGrupo(g));
            const cg = catsDe(g);
            const sg = subs.filter(s => s.grupo === g);
            sg.forEach(s => {
                const filhas = cg.filter(x => x.c.subgrupo_id === s.id);
                if (!filhas.length) return;
                add('sub:' + s.id, 'subgrupo', 1, s.id, s.nome, g, sinal, calc.map(r => r.porSubgrupo[s.id] || 0));
                filhas.forEach(x => addCat(x, 2, 'sub:' + s.id, sinal));
            });
            const ids = new Set(sg.map(s => s.id));
            cg.filter(x => !x.c.subgrupo_id || !ids.has(x.c.subgrupo_id)).forEach(x => addCat(x, 1, g, sinal));
        };
        const grupoSimples = (g, sinal) => grupoComSub(g, sinal);
        const calculada = (k, rotulo) => add(k, 'calculada', 0, k, rotulo, null, 'resultado', dosGrupo(k));

        grupoSimples('receitas', 'entrada');
        grupoSimples('custos', 'saida');
        calculada('margem', 'Margem de contribuição');
        const rec = dosGrupo('receitas'), mar = dosGrupo('margem');
        const pct = (a, b) => b === 0 ? null : arredondar(a / b * 100);
        linhas.push({ chave: 'margem_pct', tipo: 'percentual', nivel: 0, id: 'margem_pct', rotulo: '% margem de contribuição', pai: null, sinal: 'resultado',
            valores: mar.map((v, i) => pct(v, rec[i])), total: pct(soma(mar), soma(rec)) });

        grupoComSub('despesas', 'saida');

        calculada('resultadoOperacional', 'Resultado operacional');
        grupoSimples('investimento', 'resultado');
        grupoSimples('financiamento', 'resultado');
        calculada('liquido', 'RESULTADO LÍQUIDO');
        return { periodos: pers, linhas };
    }

    function analiseVertical(tab) {
        const out = {};
        const rec = ((tab.linhas || []).find(l => l.chave === 'receitas') || { valores: [] }).valores;
        (tab.linhas || []).forEach(l => {
            out[l.chave] = l.valores.map((v, i) => (l.tipo === 'percentual' || !rec[i]) ? null : (Math.round(v / rec[i] * 1000) / 10) || 0);
        });
        return out;
    }

    function analiseHorizontal(tab) {
        const out = {};
        (tab.linhas || []).forEach(l => {
            out[l.chave] = l.valores.map((v, i) => {
                if (i === 0 || l.tipo === 'percentual') return { pct: null, acima999: false, seta: null, favoravel: null };
                const ant = l.valores[i - 1], dif = v - ant;
                const pct = variacao(v, ant);
                const seta = dif > 0 ? 'up' : dif < 0 ? 'down' : null;
                const favoravel = dif === 0 ? null : (l.sinal === 'saida' ? dif < 0 : dif > 0);
                return { pct, acima999: pct != null && pct > 999, seta, favoravel };
            });
        });
        return out;
    }

    const api = { calcular, calcularMeses, ticketMedio, periodoAnterior, variacao, periodos, tabela, analiseVertical, analiseHorizontal };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.DreCore = api;

})(typeof window !== 'undefined' ? window : null);
