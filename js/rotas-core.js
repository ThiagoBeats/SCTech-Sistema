'use strict';
// Nucleo das Rotas do dia: links do Google Maps, chegadas previstas, texto da
// observacao e do WhatsApp, leitura das respostas do OSRM.
// So funcoes puras — sem DOM, sem db, sem rede.
(function (raiz) {

    const MAPS = 'https://www.google.com/maps/dir/?api=1';
    const MAX_WAYPOINTS = 3;     // limite do Google Maps no navegador do celular
    const TOLERANCIA_MIN = 10;   // atraso ate 10 min nao avisa

    const enc = s => encodeURIComponent(String(s).trim());
    const hhmm = min => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(Math.round(min) % 60).padStart(2, '0');
    const dataBR = iso => String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4);

    function linkIrPara(endereco) {
        const e = String(endereco || '').trim();
        return e ? `${MAPS}&destination=${enc(e)}&travelmode=driving` : '';
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
    // (da saida ou da parada anterior), null quando nao se sabe (conta zero).
    function calcularChegadas({ inicioDia, paradas, trechosMin }) {
        const ps = paradas || [], tr = trechosMin || [];
        const t0 = tr[0] == null ? 0 : +tr[0];
        const saidaMin = ps.length && ps[0].agendadoMin != null ? ps[0].agendadoMin - t0 : (+inicioDia || 0);
        let t = saidaMin, incerto = false;
        const out = ps.map((p, i) => {
            if (tr[i] == null) incerto = true;
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

    const api = { linkIrPara, linksRota, normalizarEndereco, ordemDoTrip, trechosDaRota, calcularChegadas,
        linhaObsRota, aplicarObsRota, textoWhatsRota, fmtDur, fmtKm, hhmm, TOLERANCIA_MIN };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.RotasCore = api;

})(typeof window !== 'undefined' ? window : null);
