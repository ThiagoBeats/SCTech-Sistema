'use strict';
// Nucleo da conciliacao bancaria: leitura de extrato OFX (SGML v1 e XML) e sugestoes de casamento
// entre linhas do extrato e lancamentos/movimentos/repasses de cartao. So funcoes puras — sem DOM, sem db.
(function (raiz) {

    const ERRO_OFX = 'Arquivo não reconhecido como extrato OFX.';
    const TOLERANCIA_CENT = 1; // ±0,01
    const JANELA_DIAS = 5;
    const ORDEM_TIPO = { movimento: 0, lancamento: 1, repasse: 2, repasses: 3 };

    const cent = v => { const n = Number(v) || 0; return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)); };
    const iguais = (a, b) => Math.abs(cent(a) - cent(b)) <= TOLERANCIA_CENT;
    const dia10 = d => String(d || '').slice(0, 10);
    const dataOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    const distancia = (a, b) => (dataOk(a) && dataOk(b) ? Math.abs(Math.round((utc(a) - utc(b)) / 86400000)) : Infinity);

    // ---------- decodificacao ----------
    function decodificar(bytes) {
        if (typeof bytes === 'string') return bytes;
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        const latin1 = b => {
            if (typeof TextDecoder !== 'undefined') { try { return new TextDecoder('windows-1252').decode(b); } catch (e) { /* cai no manual */ } }
            let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s;
        };
        const cabecalho = Array.from(u8.subarray(0, 600)).map(c => String.fromCharCode(c)).join('');
        const m = /CHARSET\s*:\s*([A-Za-z0-9_-]+)/i.exec(cabecalho) || /ENCODING\s*=\s*["']([^"']+)["']/i.exec(cabecalho);
        const cs = m ? m[1].toUpperCase() : '';
        const ehLatin = cs === '1252' || cs === 'WINDOWS-1252' || cs === 'CP1252' || /^(ISO[-_]?8859[-_]?1|LATIN1?)$/.test(cs);
        let texto;
        if (ehLatin) texto = latin1(u8);
        else if (typeof TextDecoder !== 'undefined') {
            // Sem charset (ou UTF-8): tenta UTF-8 estrito; se os bytes nao forem validos, e latin1 de banco antigo.
            try { texto = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { texto = latin1(u8); }
        } else texto = latin1(u8);
        return texto.replace(/^﻿/, '');
    }

    // ---------- leitura do OFX ----------
    function entidades(s) {
        return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }
    function lerValor(s) {
        let t = String(s || '').replace(/\s/g, '');
        if (!/\d/.test(t)) return NaN;
        const virg = t.lastIndexOf(','), pto = t.lastIndexOf('.');
        if (virg >= 0 && pto >= 0) {
            if (virg > pto) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
        } else if (virg >= 0) t = t.replace(',', '.');
        return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN;
    }
    function lerData(s) {
        const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(s || '').trim());
        if (!m) return null;
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
        return m[1] + '-' + m[2] + '-' + m[3]; // data como o banco gravou (hora e fuso ignorados)
    }

    function lerOfx(texto) {
        const saida = { banco: null, agencia: null, conta: null, linhas: [], erros: [] };
        texto = decodificar(texto == null ? '' : texto);
        if (!/OFXHEADER\s*:|<OFX[\s>]/i.test(texto)) { saida.erros.push(ERRO_OFX); return saida; }
        const re = /<(\/?)([A-Za-z0-9_.]+)\s*>([^<]*)/g;
        const FIM = new Set(['STMTTRN', 'BANKTRANLIST', 'LEDGERBAL', 'AVAILBAL']);
        let atual = null, m, n = 0;
        const vistos = Object.create(null);
        const fechar = () => {
            if (!atual) return;
            n++;
            const data = lerData(atual.DTPOSTED);
            const valor = lerValor(atual.TRNAMT);
            if (!data) saida.erros.push('Transação ' + n + ' ignorada: data inválida.');
            else if (!Number.isFinite(valor)) saida.erros.push('Transação ' + n + ' ignorada: valor inválido.');
            else {
                const descricao = (atual.MEMO || atual.NAME || '').replace(/\s+/g, ' ').trim();
                const v = Math.round(valor * 100) / 100;
                const base = (atual.FITID || '').trim() || (data + '|' + v + '|' + descricao);
                // Id unico no arquivo: repeticao (FITID reaproveitado ou linhas identicas sem FITID) ganha #2, #3...
                // na ordem do arquivo, entao reler o mesmo arquivo gera os mesmos ids.
                const k = (vistos[base] = (vistos[base] || 0) + 1);
                saida.linhas.push({ fitid: k > 1 ? base + '#' + k : base, data, valor: v, descricao });
            }
            atual = null;
        };
        while ((m = re.exec(texto))) {
            const fecha = m[1] === '/', tag = m[2].toUpperCase(), val = entidades(m[3]).trim();
            if (fecha) { if (FIM.has(tag)) fechar(); continue; }
            if (tag === 'STMTTRN') { fechar(); atual = {}; continue; }
            if (FIM.has(tag)) { fechar(); continue; }
            if (atual) { if (!(tag in atual)) atual[tag] = val; continue; }
            if (tag === 'BANKID' && saida.banco == null && val) saida.banco = val;
            else if (tag === 'BRANCHID' && saida.agencia == null && val) saida.agencia = val;
            else if (tag === 'ACCTID' && saida.conta == null && val) saida.conta = val;
        }
        fechar();
        return saida;
    }

    // ---------- dedupe ----------
    function novasLinhas(linhas, existentes, contaId) {
        const ja = new Set((existentes || []).filter(e => String(e.conta_id) === String(contaId)).map(e => String(e.fitid)));
        return (linhas || []).filter(l => !ja.has(String(l.fitid)));
    }

    // ---------- indice (para nao varrer tudo a cada linha) ----------
    // Por contexto (guardado nele, recalculado se as listas mudarem): movimentos por conta|sentido|centavos,
    // lancamentos por centavos e repasses por conta. Cada item guarda a posicao original (a ordem de sempre).
    function indice(ctx) {
        const chave = [ctx.movimentos, ctx.contasReceber, ctx.contasPagar, ctx.repasses];
        if (ctx.__idx && ctx.__idx.chave.every((x, i) => x === chave[i])) return ctx.__idx;
        const agrupar = (lista, chaveDe) => {
            const m = new Map();
            (lista || []).forEach((x, i) => {
                if (!x) return;
                const k = chaveDe(x);
                let a = m.get(k);
                if (!a) m.set(k, (a = []));
                a.push({ x, i });
            });
            return m;
        };
        const idx = {
            chave,
            movs: agrupar(ctx.movimentos, m => String(m.conta_id) + '|' + m.sentido + '|' + cent(m.valor)),
            cr: agrupar(ctx.contasReceber, l => '' + cent(l.valor)),
            cp: agrupar(ctx.contasPagar, l => '' + cent(l.valor)),
            reps: new Map()
        };
        (ctx.repasses || []).forEach(r => {
            if (!r) return;
            const k = String(r.contaId);
            if (!idx.reps.has(k)) idx.reps.set(k, []);
            idx.reps.get(k).push(r);
        });
        try { Object.defineProperty(ctx, '__idx', { value: idx, configurable: true, writable: true, enumerable: false }); } catch (e) { /* objeto travado: sem cache */ }
        return idx;
    }
    // Itens com valor a ±1 centavo, na ordem original.
    function perto(mapa, prefixo, c0) {
        const out = [];
        for (let d = -TOLERANCIA_CENT; d <= TOLERANCIA_CENT; d++) (mapa.get(prefixo + (c0 + d)) || []).forEach(e => out.push(e));
        return out.sort((a, b) => a.i - b.i).map(e => e.x);
    }

    // ---------- linhas orfas e "conferido ate" ----------
    // Indice do que existe: ids de movimentos e lancamentos pagos ('cr:ID'/'cp:ID'), montado uma vez por tela.
    function indiceVinculos(p) {
        p = p || {};
        const movIds = new Set((p.movimentos || []).filter(Boolean).map(m => String(m.id)));
        const pagos = new Set();
        (p.contasReceber || []).forEach(x => { if (x && x.status === 'Pago') pagos.add('cr:' + x.id); });
        (p.contasPagar || []).forEach(x => { if (x && x.status === 'Pago') pagos.add('cp:' + x.id); });
        return { movIds, pagos };
    }
    const conciliada = l => !!l && (l.situacao === 'conciliado' || l.situacao === 'transferencia');
    // Linha conciliada cujo movimento (algum) sumiu, ou, sem movimento, cuja baixa nao esta mais paga.
    function linhaOrfa(l, iv) {
        if (!conciliada(l)) return false;
        const ids = Array.isArray(l.mov_ids) ? l.mov_ids : (l.mov_id != null ? [l.mov_id] : []);
        if (ids.length) return ids.some(id => !iv.movIds.has(String(id)));
        return (l.vinculos || []).filter(v => v && v.baixa).some(v => !iv.pagos.has(v.t + ':' + v.id));
    }
    // "Conferido ate" por conta: a ultima data D de linha conciliada (nao orfa) sem nenhuma linha pendente (ou orfa)
    // da conta com data ate D. Devolve Map(String(contaId) -> 'AAAA-MM-DD').
    function conferidos(linhas, iv) {
        const porConta = new Map();
        (linhas || []).forEach(l => {
            if (!l || !l.data) return;
            const k = String(l.conta_id);
            let c = porConta.get(k);
            if (!c) porConta.set(k, (c = { pend: null, feitas: [] }));
            const d = dia10(l.data);
            const orfa = linhaOrfa(l, iv);
            if (l.situacao === 'pendente' || orfa) { if (!c.pend || d < c.pend) c.pend = d; } else if (conciliada(l)) c.feitas.push(d);
        });
        const out = new Map();
        porConta.forEach((c, k) => {
            let melhor = null;
            c.feitas.forEach(d => { if ((!c.pend || d < c.pend) && (!melhor || d > melhor)) melhor = d; });
            if (melhor) out.set(k, melhor);
        });
        return out;
    }

    // ---------- sugestoes ----------
    // repasses: [{ crId, data, liquido, contaId }] — um por repasse de cartao ainda nao recebido, ja com o LIQUIDO
    // (CaixaCore.repassesCartao -> { data, bruto, taxa, liquido }) e a conta que recebe.
    function sugestoes(linha, ctx) {
        ctx = ctx || {};
        if (!linha || !(Math.abs(Number(linha.valor)) > 0)) return [];
        const entrada = linha.valor > 0;
        const alvo = Math.abs(linha.valor);
        const sentido = entrada ? 'entrada' : 'saida';
        // jaUsados: Set de chaves ja conciliadas: 'mov:ID', 'cr:ID', 'cp:ID', 'rep:CRID:DATA' (data AAAA-MM-DD do repasse).
        // Por compatibilidade, o id puro do movimento (sem prefixo) tambem vale.
        const jaUsados = ctx.jaUsados || new Set();
        const usado = (...chaves) => chaves.some(c => jaUsados.has(c));
        const out = [];
        const idx = indice(ctx);
        const c0 = cent(alvo);

        perto(idx.movs, String(ctx.contaId) + '|' + sentido + '|', c0).forEach(m => {
            if (!m || String(m.conta_id) !== String(ctx.contaId) || m.sentido !== sentido || usado('mov:' + m.id, m.id)) return;
            const dist = distancia(dia10(m.data), linha.data);
            if (!iguais(m.valor, alvo) || dist > JANELA_DIAS) return;
            out.push({ tipo: 'movimento', ids: [m.id], descricao: m.descricao || m.origem || 'Movimento', valor: alvo, data: dia10(m.data), distanciaDias: dist });
        });

        perto(entrada ? idx.cr : idx.cp, '', c0).forEach(l => {
            if (!l || l.status === 'Cancelado' || l.status === 'Pago' || usado((entrada ? 'cr:' : 'cp:') + l.id)) return;
            const dist = distancia(dia10(l.data_vencimento), linha.data);
            if (!iguais(l.valor, alvo) || dist > JANELA_DIAS) return;
            const nome = entrada ? l.cliente_nome : l.credor_nome;
            out.push({ tipo: 'lancamento', ids: [l.id], descricao: [nome, l.descricao].filter(Boolean).join(' - ') || 'Lançamento', valor: alvo, data: dia10(l.data_vencimento), distanciaDias: dist });
        });

        if (entrada) {
            const reps = (idx.reps.get(String(ctx.contaId)) || []).filter(r => !usado('rep:' + r.crId + ':' + dia10(r.data)));
            let achou = false;
            reps.forEach(r => {
                const dist = distancia(dia10(r.data), linha.data);
                if (!iguais(r.liquido, alvo) || dist > JANELA_DIAS) return;
                achou = true;
                out.push({ tipo: 'repasse', ids: [r.crId], descricao: 'Repasse de cartão', valor: alvo, data: dia10(r.data), distanciaDias: dist });
            });
            if (!achou) {
                const porDia = new Map();
                reps.forEach(r => { const d = dia10(r.data); if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(r); });
                porDia.forEach((grupo, d) => {
                    const dist = distancia(d, linha.data);
                    if (grupo.length < 2 || dist > 1) return;
                    const soma = grupo.reduce((s, r) => s + cent(r.liquido), 0);
                    if (Math.abs(soma - cent(alvo)) > TOLERANCIA_CENT) return;
                    out.push({ tipo: 'repasses', ids: grupo.map(r => r.crId), descricao: 'Repasses de cartão do dia (' + grupo.length + ')', valor: alvo, data: d, distanciaDias: dist });
                });
            }
        }

        return out.sort((a, b) => (ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo]) || (a.distanciaDias - b.distanciaDias));
    }

    const api = { lerOfx, decodificar, novasLinhas, sugestoes, indiceVinculos, linhaOrfa, conferidos, ERRO_OFX };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ConciliacaoCore = api;

})(typeof window !== 'undefined' ? window : null);
