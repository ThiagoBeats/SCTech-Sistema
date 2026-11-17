'use strict';
// Nucleo das Rotas do dia: links do Google Maps, chegadas previstas, texto da
// observacao e do WhatsApp, leitura das respostas do OSRM.
// So funcoes puras — sem DOM, sem db, sem rede.
(function (raiz) {

    const MAPS = 'https://www.google.com/maps/dir/?api=1';
    const MAX_WAYPOINTS = 3;     // limite do Google Maps no navegador do celular
    const TOLERANCIA_MIN = 10;   // atraso ate 10 min nao avisa

    const enc = s => encodeURIComponent(String(s).trim());
    const hhmm = min => {
        const m = ((Math.round(+min || 0) % 1440) + 1440) % 1440;
        return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    };
    const dataBR = iso => String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4);

    function linkIrPara(endereco) {
        const e = String(endereco || '').trim();
        return e ? `${MAPS}&destination=${enc(e)}&travelmode=driving` : '';
    }

    function _temCidade(e, c) {
        e = String(e || '').trim(); c = String(c || '').trim();
        if (!e || !c) return false;
        const ne = normalizarEndereco(e), nc = normalizarEndereco(c);
        if (!nc) return false;
        // So conta como "ja tem a cidade" quando ela e um trecho proprio, depois da 1a
        // virgula/hifen ("Rua Curitiba, 5" nao tem; "Vila Curitiba" tambem nao): comeca
        // depois de , - ou / e termina o endereco, so seguida de UF e/ou CEP.
        const sep = ne.search(/[,\-\/]/);
        const depois = /^\s*(?:[,\-\/]\s*)?(?:[a-z]{2})?\s*(?:[,\-]?\s*\d{5}-?\d{3})?\s*$/;
        for (let i = ne.indexOf(nc); i >= 0; i = ne.indexOf(nc, i + 1)) {
            if (sep >= 0 && i > sep && /[,\-\/]\s*$/.test(ne.slice(0, i)) && depois.test(ne.slice(i + nc.length))) return true;
        }
        return false;
    }

    // Endereco + cidade para procurar no mapa: ruas de mesmo nome existem em varias
    // cidades. Nao repete a cidade quando o endereco ja a traz (sem maiuscula/acento).
    function enderecoCompleto(end, cidade) {
        const e = String(end || '').trim();
        const c = String(cidade || '').trim();
        if (!e || !c) return e;
        if (_temCidade(e, c)) return e;
        return e.replace(/[\s.,;]+$/, '') + ', ' + c;
    }

    function _link(origem, waypoints, destino) {
        let u = MAPS;
        if (origem) u += '&origin=' + enc(origem);
        u += '&destination=' + enc(destino);
        if (waypoints.length) u += '&waypoints=' + waypoints.map(enc).join('%7C');
        return u + '&travelmode=driving';
    }

    // Partes da rota: cada link tem a origem, ate 3 paradas intermediarias e o
    // destino; a parte seguinte sai de onde a anterior terminou. Sem empresa, a
    // primeira parte sai de onde o tecnico estiver e a rota nao volta.
    function linksRota({ origem, paradas, volta }) {
        const ends = (paradas || []).map(p => String(p || '').trim()).filter(Boolean);
        if (!ends.length) return [];
        const temOrigem = !!String(origem || '').trim();
        const pts = temOrigem ? [origem, ...ends] : ends.slice();
        if (temOrigem && volta) pts.push(origem);
        const links = [];
        let i = 0;
        if (!temOrigem) {           // primeira parte sem origem: ate 3 paradas + destino
            const fim = Math.min(pts.length - 1, MAX_WAYPOINTS);
            links.push(_link('', pts.slice(0, fim), pts[fim]));
            i = fim;
        }
        while (i < pts.length - 1) {
            const fim = Math.min(pts.length - 1, i + MAX_WAYPOINTS + 1);
            links.push(_link(pts[i], pts.slice(i + 1, fim), pts[fim]));
            i = fim;
        }
        return links;
    }

    function normalizarEndereco(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            .replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/[\s.,;]+$/, '').trim();
    }

    // Resposta do /trip: waypoints[i].waypoint_index e' a posicao do ponto i na
    // viagem. comAOrigem: o ponto 0 e' a empresa; devolve os indices das paradas (ponto - 1).
    function ordemDoTrip(resp, comAOrigem) {
        if (!resp || resp.code !== 'Ok' || !Array.isArray(resp.waypoints)) return null;
        const pos = resp.waypoints.map((w, i) => ({ i, p: w.waypoint_index }));
        pos.sort((a, b) => a.p - b.p);
        const ordem = pos.map(x => x.i);
        return comAOrigem ? ordem.filter(i => i !== 0).map(i => i - 1) : ordem;
    }

    function trechosDaRota(resp) {
        if (!resp || resp.code !== 'Ok') return null;
        const rota = (resp.routes && resp.routes[0]) || (resp.trips && resp.trips[0]);
        if (!rota || !Array.isArray(rota.legs)) return null;
        return rota.legs.map(l => ({ metros: +l.distance || 0, segundos: +l.duration || 0 }));
    }

    // paradas: [{agendadoMin|null, durMin}]; trechosMin[i]: trajeto ate a parada i
    // (da saida ou da parada anterior localizada), null quando nao se sabe:
    // conta zero e so' aquela parada fica incerta.
    function calcularChegadas({ inicioDia, paradas, trechosMin }) {
        const ps = paradas || [], tr = trechosMin || [];
        const t0 = tr[0] == null ? 0 : +tr[0];
        const saidaMin = ps.length && ps[0].agendadoMin != null ? ps[0].agendadoMin - t0 : (+inicioDia || 0);
        let t = saidaMin;
        const out = ps.map((p, i) => {
            const incerto = tr[i] == null;
            const chegadaMin = t + (tr[i] == null ? 0 : +tr[i]);
            const ag = p.agendadoMin;
            const inicioMin = ag != null ? Math.max(chegadaMin, ag) : chegadaMin;
            const atrasoMin = ag != null && chegadaMin - ag > TOLERANCIA_MIN ? chegadaMin - ag : 0;
            t = inicioMin + (+p.durMin || 0);
            return { chegadaMin, inicioMin, atrasoMin, incerto };
        });
        return { saidaMin, paradas: out, fimMin: t };
    }

    function linhaObsRota(dataISO, chegadaMin, agendadoMin) {
        return `Rota de ${dataBR(dataISO)}: chegada prevista ${hhmm(chegadaMin)} (agendado ${hhmm(agendadoMin)})`;
    }

    // Tira a linha da rota daquele dia e, se houver, poe a nova no fim.
    function aplicarObsRota(obs, dataISO, linha) {
        const prefixo = `Rota de ${dataBR(dataISO)}:`;
        const linhas = String(obs || '').split('\n').filter(l => !l.trim().startsWith(prefixo));
        while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
        if (linha) linhas.push(linha);
        return linhas.join('\n');
    }

    function fmtDur(min) {
        min = Math.round(+min || 0);
        const h = Math.floor(min / 60), m = min % 60;
        return h ? h + 'h' + String(m).padStart(2, '0') : m + ' min';
    }
    // Minutos por extenso: 607 -> "10 horas e 7 minutos", 61 -> "1 hora e 1 minuto".
    function duracaoPorExtenso(min) {
        min = Math.max(0, Math.round(+min || 0));
        const h = Math.floor(min / 60), m = min % 60;
        const ph = h + (h === 1 ? ' hora' : ' horas'), pm = m + (m === 1 ? ' minuto' : ' minutos');
        return !h ? pm : !m ? ph : ph + ' e ' + pm;
    }
    function fmtKm(km) { return (Math.round((+km || 0) * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km'; }

    function textoWhatsRota({ data, tecnico, saida, itens, links, totalKm, totalMin }) {
        const l = [`Rota de ${dataBR(data)}${tecnico ? ' — ' + tecnico : ''}`];
        if (saida) l.push(`Saída: ${saida}`);
        l.push('');
        (itens || []).forEach((it, i) => {
            l.push(`${i + 1}. ${[it.hora, it.tipo, it.cliente].filter(Boolean).join(' · ')}`);
            if (it.tel) l.push(`   📞 ${it.tel}`);
            if (it.end) l.push(`   📍 ${it.end}`);
            if (it.aviso) l.push(`   ⚠ ${it.aviso}`);
        });
        if (totalKm != null && totalMin != null) { l.push(''); l.push(`Total: ${fmtKm(totalKm)} · ${fmtDur(totalMin)} de trajeto`); }
        l.push('');
        const ls = links || [];
        if (ls.length === 1) l.push(`Rota no Google Maps: ${ls[0]}`);
        else ls.forEach((u, i) => l.push(`Parte ${i + 1}: ${u}`));
        return l.join('\n');
    }

    // Melhor caminho aberto (sem volta) saindo do ponto 0, pela matriz de tempos.
    // Ate 12 pontos: exato (programacao dinamica); acima, vizinho mais proximo.
    function melhorOrdemAberta(matriz) {
        const n = (matriz || []).length;
        if (n <= 2) return Array.from({ length: n }, (_, i) => i);
        const d = (a, b) => { const v = matriz[a][b]; return v == null ? 1e12 : +v; };
        if (n > 12) {
            const ordem = [0], usado = new Set([0]);
            while (ordem.length < n) {
                const u = ordem[ordem.length - 1];
                let melhor = -1;
                for (let v = 1; v < n; v++) if (!usado.has(v) && (melhor < 0 || d(u, v) < d(u, melhor))) melhor = v;
                ordem.push(melhor); usado.add(melhor);
            }
            return ordem;
        }
        const m = n - 1, TOT = 1 << m;            // pontos 1..n-1 viram bits 0..m-1
        const custo = new Float64Array(TOT * m).fill(Infinity), ant = new Int8Array(TOT * m).fill(-1);
        for (let j = 0; j < m; j++) custo[(1 << j) * m + j] = d(0, j + 1);
        for (let mask = 1; mask < TOT; mask++) for (let j = 0; j < m; j++) {
            const c = custo[mask * m + j];
            if (!(mask & (1 << j)) || c === Infinity) continue;
            for (let k = 0; k < m; k++) {
                if (mask & (1 << k)) continue;
                const nm = mask | (1 << k), nc = c + d(j + 1, k + 1);
                if (nc < custo[nm * m + k]) { custo[nm * m + k] = nc; ant[nm * m + k] = j; }
            }
        }
        let mask = TOT - 1, j = 0;
        for (let k = 1; k < m; k++) if (custo[mask * m + k] < custo[mask * m + j]) j = k;
        const volta = [];
        while (j >= 0) { volta.push(j + 1); const p = ant[mask * m + j]; mask &= ~(1 << j); j = p; }
        return [0].concat(volta.reverse());
    }

    // Endereco em partes -> texto para o mapa: "Rua, Numero, Bairro, Cidade - UF, CEP"
    // (complemento fica de fora; vazios somem).
    function _mascCep(c) {
        const d = String(c || '').replace(/\D/g, '').slice(0, 8);
        return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
    }
    function _cidadeUf(p) {
        const c = String(p.cidade || '').trim(), u = String(p.uf || '').trim();
        return c && u ? c + ' - ' + u : c || u;
    }
    // Registro migrado do texto antigo: a Rua pode ja trazer a cidade ("Rua X, 10 - Curitiba");
    // ai a cidade nao repete e a UF (se ainda nao estiver no texto) vai ao fim dele.
    function _montar(p, comBairro, comCep) {
        p = p || {};
        const t = x => String(x || '').trim();
        const cep = comCep ? _mascCep(p.cep) : '';
        const base = [p.rua, p.numero, comBairro ? p.bairro : ''].map(t).filter(Boolean);
        if (_temCidade(p.rua, p.cidade)) {
            const u = t(p.uf);
            if (u && base.length && !new RegExp('(^|[^a-z])' + u.toLowerCase() + '$').test(normalizarEndereco(base[base.length - 1]))) {
                base[base.length - 1] += ' - ' + u;
            }
            return base.concat(cep ? [cep] : []).join(', ');
        }
        return base.concat([_cidadeUf(p), cep]).map(t).filter(Boolean).join(', ');
    }
    function enderecoDePartes(p) { return _montar(p, true, true); }
    // Consultas ao Nominatim, da mais completa para a mais simples.
    function consultasGeo(p) {
        p = p || {};
        const cep = _mascCep(p.cep);
        const lista = [enderecoDePartes(p), _montar(p, false, false),
            cep ? [cep, _cidadeUf(p)].filter(Boolean).join(', ') : ''];
        return lista.filter((x, i) => x && lista.indexOf(x) === i);
    }

    const api = { enderecoDePartes, consultasGeo, linkIrPara, linksRota, enderecoCompleto, normalizarEndereco, ordemDoTrip, melhorOrdemAberta, trechosDaRota, calcularChegadas,
        linhaObsRota, aplicarObsRota, textoWhatsRota, fmtDur, duracaoPorExtenso, fmtKm, hhmm, TOLERANCIA_MIN };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.RotasCore = api;

})(typeof window !== 'undefined' ? window : null);
