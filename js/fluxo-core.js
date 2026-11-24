'use strict';
// Nucleo do fluxo de caixa (numeros): resumo, serie por dia/semana/mes e lista de movimentacoes,
// com realizado (movimentos ate hoje) e previsto (contas em aberto, de hoje em diante).
// So funcoes puras — sem DOM, sem db, sem localStorage.
(function (raiz) {

    function dep(nome, arquivo) {
        if (raiz && raiz[nome]) return raiz[nome];
        if (typeof require === 'function') { try { return require(arquivo); } catch (e) { return null; } }
        return null;
    }
    const caixa = () => dep('CaixaCore', './caixa-core.js');
    const fin = () => dep('FinCatCore', './fin-cat-core.js');

    const num = v => (v === '' || v == null ? 0 : Number(v) || 0);
    function arredondar(v) {
        const n = Number(v) || 0;
        return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
    }
    const pad = n => String(n).padStart(2, '0');
    const dia10 = d => String(d).slice(0, 10);
    const iso = (a, m, d) => a + '-' + pad(m) + '-' + pad(d);
    const ultimoDia = (ano, mes) => new Date(ano, mes, 0).getDate();
    const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const dm = d => d.slice(8, 10) + '/' + d.slice(5, 7);
    const valida = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);
    const fmtUTC = ms => { const t = new Date(ms); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
    const paraUTC = d => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
    const somarDias = (d, n) => fmtUTC(paraUTC(d) + n * 86400000);
    const mesmo = (a, b) => a != null && b != null && String(a) === String(b);

    // Categoria do lancamento (CR = entrada, CP/fixa = saida); desconhecida ou de tipo contrario cai na do legado.
    function categoriaDe(reg, tipo, porId) {
        const F = fin();
        const certo = tipo === 'cr' ? 'entrada' : 'saida';
        const c = reg.categoria_id != null && reg.categoria_id !== '' ? porId.get(String(reg.categoria_id)) : null;
        if (c && c.tipo === certo) return c.id;
        return F.categoriaDoLegado(reg, tipo === 'cr' ? 'receber' : 'pagar');
    }

    // Reune os eventos do periodo: realizado (movimentos) e previsto (contas em aberto).
    // Cada evento: { data, ent, sai, previsto, mov, reg, transferencia }; ent/sai ja respeitam transferencia e filtros.
    function coletar(p) {
        const C = caixa(), F = fin();
        const de = p.de ? dia10(p.de) : null, ate = p.ate ? dia10(p.ate) : null, hoje = dia10(p.hoje);
        const contas = p.contas || [];
        const contaId = p.contaId != null && p.contaId !== '' ? p.contaId : null;
        const catId = p.categoriaId != null && p.categoriaId !== '' ? p.categoriaId : null;
        const conjunto = contas.filter(c => (contaId != null ? mesmo(c.id, contaId) : c.ativo !== false));
        const categorias = (p.categorias && p.categorias.length) ? p.categorias : F.categoriasPadrao().categorias;
        const porId = new Map(categorias.map(c => [String(c.id), c]));
        const crs = (p.contasReceber || []).filter(Boolean), cps = (p.contasPagar || []).filter(Boolean);
        const porCr = new Map(crs.map(c => [String(c.id), c])), porCp = new Map(cps.map(c => [String(c.id), c]));
        const out = { de, ate, hoje, conjunto, contaId, catId, realizado: [], previsto: [] };
        if (!valida(de) || !valida(ate) || de > ate) return out;

        // Origem do movimento: lancamento (CR/CP) ou nada (transferencia/ajuste).
        const regDe = m => (m.origem === 'cr' ? porCr : m.origem === 'cp' ? porCp : new Map()).get(String(m.origem_id));
        const evento = (m, previsto) => {
            const transf = m.origem === 'transferencia';
            let ent = m.sentido === 'entrada' ? num(m.valor) : 0, sai = m.sentido === 'entrada' ? 0 : num(m.valor);
            if (transf && contaId == null) { ent = 0; sai = 0; }
            return { data: dia10(m.data), ent, sai, previsto, mov: m, reg: regDe(m), transferencia: transf };
        };
        const casaCategoria = (reg, tipo) => catId == null || (!!reg && categoriaDe(reg, tipo, porId) === catId);
        const noConjunto = (m, d) => {
            const conta = conjunto.find(c => mesmo(c.id, m.conta_id));
            return !!conta && d >= conta.data_saldo_inicial;
        };

        // Realizado: movimentos das contas do conjunto (a partir da abertura da conta) de `de` ate min(ate, hoje).
        const fimReal = ate < hoje ? ate : hoje;
        (p.movimentos || []).forEach(m => {
            const d = m && m.data ? dia10(m.data) : null;
            if (!d || d < de || d > fimReal || !noConjunto(m, d)) return;
            if (catId != null && !casaCategoria(regDe(m), m.origem)) return;
            out.realizado.push(evento(m, false));
        });

        // Previsto: de max(de, hoje) ate `ate`. Movimentos futuros ja lancados (cartao a cair etc.) + contas em aberto.
        const iniPrev = de > hoje ? de : hoje;
        if (ate >= iniPrev) {
            (p.movimentos || []).forEach(m => {
                const d = m && m.data ? dia10(m.data) : null;
                if (!d || d <= hoje || d < iniPrev || d > ate || !noConjunto(m, d)) return;
                if (catId != null && !casaCategoria(regDe(m), m.origem)) return;
                out.previsto.push(evento(m, true));
            });
            const meioDe = cr => {
                const mp = cr.meio_previsto;
                return mp ? (p.meios || []).find(x => mesmo(x.id, mp.meio_id)) : null;
            };
            // Com conta escolhida, so entra o que se sabe ser dela (conta do lancamento ou do meio de pagamento).
            const daConta = (reg, meio) => contaId == null || mesmo(reg.conta_id, contaId) || (!!meio && mesmo(meio.conta_id, contaId));
            const crsUso = crs.filter(cr => casaCategoria(cr, 'cr') && daConta(cr, meioDe(cr)));
            const cpsUso = cps.filter(cp => casaCategoria(cp, 'cp') && daConta(cp, null));
            const fixasUso = (p.despesasFixas || []).filter(df => df && casaCategoria(df, 'cp') && daConta(df, null));
            C.lancamentosPrevistos({ hoje, limite: ate, movimentos: [], contasReceber: crsUso, contasPagar: cpsUso, despesasFixas: fixasUso, contas, meios: p.meios })
                .forEach(l => {
                    if (l.data < iniPrev || l.data > ate) return;
                    out.previsto.push({ data: l.data, ent: l.sentido === 'entrada' ? num(l.valor) : 0, sai: l.sentido === 'entrada' ? 0 : num(l.valor), previsto: true, mov: null, transferencia: false });
                });
        }
        return out;
    }

    function saldoInicialDe(p, col) {
        const C = caixa();
        const dia = somarDias(col.de, -1);
        return arredondar(col.conjunto.reduce((t, c) => t + C.saldoContaAte(c, p.movimentos || [], dia), 0));
    }

    const soma = (evs, k) => arredondar(evs.reduce((t, e) => t + e[k], 0));
    const periodoOk = col => valida(col.de) && valida(col.ate) && col.de <= col.ate;

    function resumo(p) {
        p = p || {};
        const col = coletar(p);
        if (!periodoOk(col)) {
            return { saldoInicial: 0, entradas: 0, saidas: 0, saldoFinal: 0, previsto: { entradas: 0, saidas: 0, saldoFinal: 0 } };
        }
        const saldoInicial = saldoInicialDe(p, col);
        const entradas = soma(col.realizado, 'ent'), saidas = soma(col.realizado, 'sai');
        const saldoFinal = arredondar(saldoInicial + entradas - saidas);
        const pe = soma(col.previsto, 'ent'), ps = soma(col.previsto, 'sai');
        return { saldoInicial, entradas, saidas, saldoFinal, previsto: { entradas: pe, saidas: ps, saldoFinal: arredondar(saldoFinal + pe - ps) } };
    }

    // Pontos da serie: dia, semana (comeca na segunda) ou mes, recortados em de..ate.
    function pontos(de, ate, agrupar) {
        const out = [];
        if (agrupar === 'mes') {
            let a = Number(de.slice(0, 4)), m = Number(de.slice(5, 7));
            for (;;) {
                const ini = iso(a, m, 1);
                if (ini > ate) break;
                const fim = iso(a, m, ultimoDia(a, m));
                out.push({ rotulo: MESES[m - 1] + '/' + String(a).slice(2), de: ini < de ? de : ini, ate: fim > ate ? ate : fim });
                m++; if (m > 12) { m = 1; a++; }
            }
        } else if (agrupar === 'semana') {
            const dow = (new Date(paraUTC(de)).getUTCDay() + 6) % 7; // 0 = segunda
            let seg = somarDias(de, -dow);
            while (seg <= ate) {
                const dom = somarDias(seg, 6);
                out.push({ rotulo: 'Sem ' + dm(seg), de: seg < de ? de : seg, ate: dom > ate ? ate : dom });
                seg = somarDias(seg, 7);
            }
        } else {
            for (let d = de; d <= ate; d = somarDias(d, 1)) out.push({ rotulo: dm(d), de: d, ate: d });
        }
        return out;
    }

    function serie(p) {
        p = p || {};
        const col = coletar(p);
        if (!periodoOk(col)) return [];
        let saldo = saldoInicialDe(p, col);
        const todos = col.realizado.concat(col.previsto);
        return pontos(col.de, col.ate, p.agrupar).map(pt => {
            const evs = todos.filter(e => e.data >= pt.de && e.data <= pt.ate);
            const entradas = soma(evs, 'ent'), saidas = soma(evs, 'sai');
            saldo = arredondar(saldo + entradas - saidas);
            return { rotulo: pt.rotulo, de: pt.de, ate: pt.ate, entradas, saidas, saldo, previsto: pt.ate > col.hoje };
        });
    }

    function movimentacoes(p) {
        p = p || {};
        const col = coletar(p);
        if (!periodoOk(col)) return [];
        let saldo = saldoInicialDe(p, col);
        const linhas = [{ data: col.de, descricao: 'Saldo inicial', conta_id: col.contaId, entrada: 0, saida: 0, saldo, origem: 'saldo_inicial', origem_id: null, grupo_id: null, previsto: false, transferencia: false }];
        const rotuloOrigem = { cr: 'Recebimento', cp: 'Pagamento', transferencia: 'Transferência', ajuste: 'Ajuste de saldo' };
        const ordenar = evs => evs.map((e, i) => [e, i]).sort((a, b) => (a[0].data < b[0].data ? -1 : a[0].data > b[0].data ? 1 : a[1] - b[1])).map(x => x[0]);
        ordenar(col.realizado).concat(ordenar(col.previsto)).forEach(e => {
            saldo = arredondar(saldo + e.ent - e.sai);
            const m = e.mov;
            const base = { data: e.data, entrada: e.ent, saida: e.sai, saldo, previsto: e.previsto, transferencia: !!e.transferencia };
            if (m) {
                const descricao = m.descricao || (e.reg && (e.reg.descricao || e.reg.fornecedor || e.reg.cliente)) || rotuloOrigem[m.origem] || 'Movimento';
                linhas.push(Object.assign(base, { descricao, conta_id: m.conta_id, origem: e.previsto ? 'previsto' : m.origem, origem_id: m.origem_id != null ? m.origem_id : null, grupo_id: m.grupo_id != null ? m.grupo_id : null }));
            } else {
                linhas.push(Object.assign(base, { descricao: e.ent > 0 ? 'A receber (previsto)' : 'A pagar (previsto)', conta_id: null, origem: 'previsto', origem_id: null, grupo_id: null }));
            }
        });
        return linhas;
    }

    const api = { resumo, serie, movimentacoes, pontos };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.FluxoCore = api;

})(typeof window !== 'undefined' ? window : null);
