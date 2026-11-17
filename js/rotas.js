'use strict';
// Rotas do dia (PCP): medicoes e instalacoes de um tecnico num dia, na melhor
// ordem (OpenStreetMap: Nominatim localiza o endereco, OSRM calcula ordem e
// km), com ajuste a mao, chegada prevista, aviso de horario, observacao gravada
// na visita, link do Google Maps e envio ao tecnico pelo WhatsApp.
// So o texto do endereco sai do sistema; nome e telefone do cliente nao.

const ROTA_NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=1&q=';
const ROTA_OSRM = 'https://router.project-osrm.org';
const ROTA_ERRO_REDE = 'Não foi possível calcular as distâncias agora. A ordem e o link do Maps continuam funcionando.';

const ROTA_GEO_NAO_VALE = 24 * 3600 * 1000;   // "nao encontrado" vale 1 dia; depois tenta de novo

let _rota = { chave: '', ordem: [], calc: null, seq: 0, status: '', assin: '' };
let _rotaFilaGeo = Promise.resolve();   // uma consulta ao Nominatim por vez, 1 por segundo
const _rotaGeoEmCurso = new Map();
let _rotaArrastando = null;

// --- Visitas do dia ----------------------------------------------------------

function _rotaVisitasDoDia(data) {
    const out = [];
    (db.medicoes || []).forEach(m => {
        if (m.status !== 'Agendado' || m.data !== data) return;
        out.push({ tipo: 'med', id: m.id, prof: _medProf(m), profNome: _medNomeResp(m),
            cliente: m.clienteNome || '—', tel: m.clienteTel || '', end: RotasCore.enderecoCompleto(m.endereco, m.cidade),
            hora: m.hora || '', agendadoMin: _agdMin(m.hora), durMin: +m.duracao || _agdDurPadrao('med'),
            rotulo: 'Medição', ico: '📐' });
    });
    db.pedidos.forEach(p => {
        if (!_instPendente(p) || p.data_entrega !== data) return;
        const cli = db.clientes.find(c => c.id == p.clienteId);
        out.push({ tipo: 'inst', id: p.id, prof: _instProf(p), profNome: nomeInstalador(p),
            cliente: p.clienteNome || '—', tel: cli?.tel || '', end: RotasCore.enderecoCompleto(p.inst_endereco || cli?.end, _instCidade(p, cli)),
            hora: p.inst_hora || '', agendadoMin: _agdMin(p.inst_hora), durMin: _instDur(p),
            rotulo: `Instalação #${formatPedidoId(p.id)}`, ico: '🔧' });
    });
    return out;
}

const _rotaChaveItem = v => v.tipo + ':' + v.id;
const _rotaPorHora = (a, b) => (a.agendadoMin ?? 9999) - (b.agendadoMin ?? 9999);

function _rotaProfsDoDia(visitas) {
    const m = new Map();
    visitas.forEach(v => {
        const x = m.get(v.prof) || { chave: v.prof, nome: v.prof ? (v.profNome || 'Profissional') : '— A definir —', n: 0 };
        x.n++;
        m.set(v.prof, x);
    });
    return [...m.values()].sort((a, b) => (a.chave ? 0 : 1) - (b.chave ? 0 : 1) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Ordem salva (sem as visitas que sairam) + as novas, por horario.
function _rotaOrdemInicial(chave, visitas) {
    const salva = (db.rotas || []).find(r => r.chave === chave);
    const porChave = new Map(visitas.map(v => [_rotaChaveItem(v), v]));
    const ordem = [];
    if (salva) (salva.ordem || []).forEach(o => {
        const k = o.tipo + ':' + o.id;
        if (porChave.has(k)) { ordem.push(k); porChave.delete(k); }
    });
    [...porChave.values()].sort(_rotaPorHora).forEach(v => ordem.push(_rotaChaveItem(v)));
    return ordem;
}

function _rotaItens() {
    const data = document.getElementById('rota-data')?.value || '';
    const porChave = new Map(_rotaVisitasDoDia(data).map(v => [_rotaChaveItem(v), v]));
    return _rota.ordem.map(k => porChave.get(k)).filter(Boolean);
}

function _rotaEmpresaEnd() { return String(getEmpresa().endereco || '').trim(); }

// --- Tela ----------------------------------------------------------------------

function renderRotas() {
    const inpData = document.getElementById('rota-data');
    const sel = document.getElementById('rota-prof');
    const corpo = document.getElementById('rota-corpo');
    if (!inpData || !sel || !corpo) return;
    if (!inpData.value) inpData.value = _agdHoje();
    const data = inpData.value;
    const visitas = _rotaVisitasDoDia(data);
    const profs = _rotaProfsDoDia(visitas);
    const atual = sel.value;
    sel.innerHTML = profs.map(p => `<option value="${escapeHtml(p.chave)}">${escapeHtml(p.nome)} (${p.n})</option>`).join('');
    sel.disabled = !profs.length;
    document.getElementById('rota-btn-sugerir').disabled = !profs.length;
    if (!profs.length) {
        _rota = { chave: '', ordem: [], calc: null, seq: _rota.seq + 1, status: '' };
        corpo.innerHTML = `<div class="rota-vazio">Nenhuma medição ou instalação agendada para ${_agdFmtData(data)}.</div>`;
        return;
    }
    sel.value = profs.some(p => p.chave === atual) ? atual : profs[0].chave;
    const chave = data + '|' + sel.value;
    const doProf = visitas.filter(v => v.prof === sel.value);
    if (chave !== _rota.chave) {
        _rota = { chave, ordem: _rotaOrdemInicial(chave, doProf), calc: null, seq: _rota.seq + 1, status: '', assin: '' };
    } else {
        // mesma rota: entra visita nova, sai a que nao e' mais do dia
        const novas = _rotaOrdemInicial('', doProf);
        _rota.ordem = _rota.ordem.filter(k => novas.includes(k)).concat(novas.filter(k => !_rota.ordem.includes(k)));
    }
    // recalcula quando mudou a ordem, um endereco, um horario ou a empresa
    if (_rotaAssinatura() !== _rota.assin) _rota.calc = null;
    _rotaDesenhar();
    if (!_rota.calc) _rotaAtualizarKm();
}

function _rotaAssinatura() {
    return _rotaEmpresaEnd() + '|' + _rotaItens().map(v => _rotaChaveItem(v) + '@' + v.end + '@' + v.hora + '@' + v.durMin).join('|');
}

// Chegadas previstas a partir dos trechos calculados (null = ainda sem trajeto).
function _rotaChegadas(itens) {
    if (!_rota.calc) return null;
    const cfg = getAgendaConfig();
    return RotasCore.calcularChegadas({
        inicioDia: _agdMin(cfg.inicio) ?? 480,
        paradas: itens.map(v => ({ agendadoMin: v.agendadoMin, durMin: v.durMin })),
        trechosMin: itens.map(v => { const t = _rota.calc.porItem[_rotaChaveItem(v)]; return t ? Math.round(t.segundos / 60) : null; }),
    });
}

function _rotaDesenhar() {
    const corpo = document.getElementById('rota-corpo');
    if (!corpo) return;
    const itens = _rotaItens();
    const emp = _rotaEmpresaEnd();
    const cheg = _rotaChegadas(itens);
    const calc = _rota.calc;
    const linhas = itens.map((v, i) => {
        const k = _rotaChaveItem(v);
        const c = cheg && cheg.paradas[i];
        const trecho = calc && calc.porItem[k];
        const naoAchado = calc && calc.naoAchados.includes(k);
        const chegada = c && !c.incerto ? `<span class="rota-chega">Chega ${RotasCore.hhmm(c.chegadaMin)}</span>` : '';
        const atraso = c && !c.incerto && c.atrasoMin
            ? `<span class="rota-atraso">⚠ ${RotasCore.duracaoPorExtenso(c.atrasoMin)} depois do agendado</span>` : '';
        return `<li class="rota-item" draggable="true" data-i="${i}" ondragstart="_rotaDragIni(event, ${i})" ondragover="event.preventDefault()" ondrop="_rotaDrop(event, ${i})">
            <span class="rota-num">${i + 1}</span>
            <span class="rota-alca" aria-hidden="true" title="Arraste para mudar a ordem">⠿</span>
            <span class="rota-info">
                <span class="rota-cli">${v.ico} ${escapeHtml(v.cliente)} <small>${escapeHtml(v.rotulo)}</small></span>
                <span class="rota-end">${v.end ? escapeHtml(v.end) : 'Sem endereço'}</span>
                ${naoAchado ? `<span class="rota-aviso">⚠ ${v.end ? 'Endereço não encontrado — confira o endereço e posicione à mão' : 'Sem endereço — posicione à mão'}</span>` : ''}
            </span>
            <span class="rota-hora">
                <span>${v.hora ? 'Agendado ' + escapeHtml(v.hora) : 'Sem horário'}</span>
                ${chegada}${atraso}
            </span>
            <span class="rota-km">${trecho ? RotasCore.fmtKm(trecho.metros / 1000) : ''}</span>
            <span class="rota-acoes">
                <button type="button" class="btn btn-outline btn-sm rota-subir" onclick="moverRota(${i}, -1)" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${escapeHtml(v.cliente)}">↑</button>
                <button type="button" class="btn btn-outline btn-sm rota-descer" onclick="moverRota(${i}, 1)" ${i === itens.length - 1 ? 'disabled' : ''} aria-label="Descer ${escapeHtml(v.cliente)}">↓</button>
                ${linkIrParaHtml(v.end, 'agd-ir')}
            </span>
        </li>`;
    }).join('');
    let total = '';
    if (calc) {
        const trechos = Object.values(calc.porItem).filter(Boolean).concat(calc.volta ? [calc.volta] : []);
        const metros = trechos.reduce((s, t) => s + t.metros, 0), seg = trechos.reduce((s, t) => s + t.segundos, 0);
        total = `<div class="rota-total" id="rota-total">Total: ${RotasCore.fmtKm(metros / 1000)} · ${RotasCore.fmtDur(seg / 60)} de trajeto${calc.volta ? ' (com a volta)' : ''}${cheg ? ` · saída ${RotasCore.hhmm(cheg.saidaMin)}` : ''}</div>`;
    }
    corpo.innerHTML = `
        <div class="rota-saida">${emp ? `🏠 Saída e volta: ${escapeHtml(emp)}` : '⚠ Sem endereço da empresa (cadastre em Empresa): a rota sai da 1ª visita e não volta.'}</div>
        <ol class="rota-lista" id="rota-lista">${linhas}</ol>
        <div class="rota-status" id="rota-status">${escapeHtml(_rota.status)}</div>
        ${total}
        <div class="rota-botoes">
            <button type="button" class="btn btn-outline" onclick="salvarRota()">💾 Salvar rota</button>
            <button type="button" class="btn btn-outline" onclick="abrirRotaNoMaps()">🗺️ Abrir no Maps</button>
            <button type="button" class="btn btn-success" onclick="enviarRotaAoTecnico()">📤 Enviar ao técnico</button>
        </div>`;
}

function _rotaStatus(txt) {
    _rota.status = txt || '';
    const el = document.getElementById('rota-status');
    if (el) el.textContent = _rota.status;
}

function moverRota(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= _rota.ordem.length) return;
    const o = _rota.ordem;
    [o[i], o[j]] = [o[j], o[i]];
    _rotaMudouOrdem();
}
function _rotaDragIni(ev, i) { _rotaArrastando = i; try { ev.dataTransfer.setData('text/plain', String(i)); } catch (e) {} }
function _rotaDrop(ev, i) {
    ev.preventDefault();
    const de = _rotaArrastando;
    _rotaArrastando = null;
    if (de == null || de === i) return;
    const [k] = _rota.ordem.splice(de, 1);
    _rota.ordem.splice(i, 0, k);
    _rotaMudouOrdem();
}
function _rotaMudouOrdem() {
    _rota.calc = null;
    _rota.assin = '';
    _rotaDesenhar();
    _rotaAtualizarKm();
}

// --- Rede: localizar endereco e calcular trajetos ------------------------------

function _rotaCacheGeo() {
    try { return JSON.parse(localStorage.getItem('sc_geo') || '{}') || {}; } catch (e) { return {}; }
}

function _rotaGeoDoCache(chave) {
    const c = _rotaCacheGeo()[chave];
    if (!c) return undefined;
    if (c.nao) return Date.now() - (+c.em || 0) < ROTA_GEO_NAO_VALE ? null : undefined;
    return c;
}

// {lat, lon} ou null (nao encontrado). Erro de rede lanca (e nao fica guardado).
// Todas as consultas passam por uma fila: uma por vez, com 1,1 s entre elas, e
// o mesmo endereco pedido duas vezes ao mesmo tempo vira uma consulta so'.
function _rotaGeo(end) {
    const chave = RotasCore.normalizarEndereco(end);
    if (!chave) return Promise.resolve(null);
    const doCache = _rotaGeoDoCache(chave);
    if (doCache !== undefined) return Promise.resolve(doCache);
    if (_rotaGeoEmCurso.has(chave)) return _rotaGeoEmCurso.get(chave);
    const p = _rotaFilaGeo.then(async () => {
        const deNovo = _rotaGeoDoCache(chave);
        if (deNovo !== undefined) return deNovo;
        try {
            const resp = await fetch(ROTA_NOMINATIM + encodeURIComponent(end), { headers: { 'Accept-Language': 'pt-BR' } });
            if (!resp.ok) throw new Error('nominatim ' + resp.status);
            const lista = await resp.json();
            const achou = Array.isArray(lista) && lista[0] ? { lat: +lista[0].lat, lon: +lista[0].lon } : null;
            const c2 = _rotaCacheGeo();
            c2[chave] = achou || { nao: true, em: Date.now() };
            try { localStorage.setItem('sc_geo', JSON.stringify(c2)); } catch (e) {}
            return achou;
        } finally {
            await new Promise(r => setTimeout(r, 1100));   // no maximo 1 consulta por segundo
        }
    });
    _rotaFilaGeo = p.catch(() => {});
    _rotaGeoEmCurso.set(chave, p);
    p.finally(() => _rotaGeoEmCurso.delete(chave)).catch(() => {});
    return p;
}

async function _rotaOsrm(servico, pontos, extra) {
    const coords = pontos.map(p => `${p.lon},${p.lat}`).join(';');
    const resp = await fetch(`${ROTA_OSRM}/${servico}/v1/driving/${coords}?overview=false${extra || ''}`);
    if (!resp.ok) throw new Error('osrm ' + resp.status);
    return resp.json();
}

// Localiza a empresa e as visitas (na ordem dada). Para no meio se a pessoa
// trocou de dia ou de tecnico (seq mudou).
async function _rotaLocalizar(itens, seq) {
    const conferir = () => { if (seq !== _rota.seq) throw new Error('rota-cancelada'); };
    const emp = _rotaEmpresaEnd();
    const empGeo = emp ? await _rotaGeo(emp) : null;
    conferir();
    const geos = [];
    for (const v of itens) { geos.push(v.end ? await _rotaGeo(v.end) : null); conferir(); }
    return { empGeo, geos };
}

// Km e tempo de cada trecho na ordem atual (as nao encontradas ficam de fora).
async function _rotaAtualizarKm() {
    const seq = ++_rota.seq;
    const itens = _rotaItens();
    if (!itens.length) return;
    const assin = _rotaAssinatura();
    _rotaStatus('Calculando distâncias…');
    try {
        const { empGeo, geos } = await _rotaLocalizar(itens, seq);
        if (seq !== _rota.seq) return;
        const achados = itens.map((v, i) => ({ k: _rotaChaveItem(v), g: geos[i] })).filter(x => x.g);
        const calc = { porItem: {}, volta: null, naoAchados: itens.filter((v, i) => !geos[i]).map(_rotaChaveItem) };
        const pontos = (empGeo ? [empGeo] : []).concat(achados.map(x => x.g)).concat(empGeo ? [empGeo] : []);
        if (achados.length && pontos.length >= 2) {
            const trechos = RotasCore.trechosDaRota(await _rotaOsrm('route', pontos));
            if (seq !== _rota.seq) return;
            if (!trechos) throw new Error('rota');
            const desloc = empGeo ? 0 : 1;   // sem empresa, a 1a visita nao tem trecho de chegada
            achados.forEach((x, j) => { calc.porItem[x.k] = j - desloc >= 0 ? trechos[j - desloc] : { metros: 0, segundos: 0 }; });
            if (empGeo) calc.volta = trechos[trechos.length - 1];
        } else if (achados.length === 1) {
            calc.porItem[achados[0].k] = { metros: 0, segundos: 0 };
        }
        _rota.calc = calc;
        _rota.assin = assin;
        _rota.status = calc.naoAchados.length
            ? `${calc.naoAchados.length === 1 ? '1 visita ficou' : calc.naoAchados.length + ' visitas ficaram'} sem localização: os km e a chegada dela não entram na conta.`
            : (_rotaEmpresaEnd() && !empGeo ? 'Endereço da empresa não encontrado: a conta começa na 1ª visita.' : '');
        _rotaDesenhar();
    } catch (e) {
        if (seq !== _rota.seq) return;
        _rotaStatus(ROTA_ERRO_REDE);
    }
}

async function sugerirMelhorOrdem() {
    const itens = _rotaItens();
    if (!itens.length) return;
    const btn = document.getElementById('rota-btn-sugerir');
    const rotulo = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Calculando…'; }
    const seq = ++_rota.seq;
    _rotaStatus('Localizando os endereços…');
    try {
        const { empGeo, geos } = await _rotaLocalizar(itens, seq);
        const achados = itens.map((v, i) => ({ v, g: geos[i] })).filter(x => x.g);
        const nao = itens.filter((v, i) => !geos[i]);
        let ordemAchados = achados;
        if (empGeo && achados.length >= 1) {
            // sai da empresa e volta para ela: viagem circular do OSRM
            const ordem = RotasCore.ordemDoTrip(await _rotaOsrm('trip', [empGeo].concat(achados.map(x => x.g)), '&source=first&roundtrip=true'), true);
            if (!ordem) throw new Error('trip');
            ordemAchados = ordem.map(i => achados[i]);
        } else if (!empGeo) {
            // sem empresa a rota nao volta: sai da visita com horario mais cedo
            // e procura o caminho aberto mais curto pela tabela de tempos
            achados.sort((a, b) => _rotaPorHora(a.v, b.v));
            if (achados.length >= 3) {
                const tab = await _rotaOsrm('table', achados.map(x => x.g), '&annotations=duration');
                if (!tab || tab.code !== 'Ok' || !Array.isArray(tab.durations)) throw new Error('table');
                ordemAchados = RotasCore.melhorOrdemAberta(tab.durations).map(i => achados[i]);
            }
        }
        if (seq !== _rota.seq) return;   // trocou de dia ou tecnico no meio
        _rota.ordem = ordemAchados.map(x => _rotaChaveItem(x.v)).concat(nao.map(_rotaChaveItem));
        _rota.calc = null;
        _rota.assin = '';
        _rota.status = '';
        _rotaDesenhar();
        await _rotaAtualizarKm();
    } catch (e) {
        if (seq === _rota.seq) _rotaStatus(ROTA_ERRO_REDE);
    } finally {
        if (btn) { btn.disabled = !!document.getElementById('rota-prof')?.disabled; btn.innerHTML = rotulo; }
    }
}

// --- Salvar, Maps e WhatsApp ---------------------------------------------------

// Grava a ordem e, com os trajetos calculados, a observacao de horario em cada
// visita (substitui a do mesmo dia; sai quando deixou de haver atraso).
async function salvarRota(silencioso) {
    const itens = _rotaItens();
    if (!itens.length) return 0;
    const [data, prof] = _rota.chave.split('|');
    db.rotas = (db.rotas || []).filter(r => r.chave !== _rota.chave);
    db.rotas.push({ chave: _rota.chave, data, prof, ordem: itens.map(v => ({ tipo: v.tipo, id: v.id })),
        salvo_em: Date.now(), salvo_por: getUsuarioLogado()?.id || null });
    const cheg = _rotaChegadas(itens);
    let avisos = 0, semConferir = 0;
    if (cheg) itens.forEach((v, i) => {
        const c = cheg.paradas[i];
        if (c.incerto) { semConferir++; return; }
        const linha = c.atrasoMin ? RotasCore.linhaObsRota(data, c.chegadaMin, v.agendadoMin) : null;
        if (linha) avisos++;
        if (v.tipo === 'med') {
            const m = db.medicoes.find(x => x.id == v.id);
            if (m) m.obs = RotasCore.aplicarObsRota(m.obs, data, linha);
        } else {
            const p = db.pedidos.find(x => x.id == v.id);
            if (p) p.inst_obs = RotasCore.aplicarObsRota(p.inst_obs, data, linha);
        }
    });
    syncDB();
    if (!silencioso) {
        const extra = !cheg ? ' As distâncias não foram calculadas, então os horários não foram conferidos.'
            : (avisos ? ` ${avisos === 1 ? '1 visita tem' : avisos + ' visitas têm'} horário que não bate: o aviso foi para a observação.` : '')
              + (semConferir ? ` ${semConferir === 1 ? '1 visita sem localização não teve' : semConferir + ' visitas sem localização não tiveram'} o horário conferido.` : '');
        await showAlert('Rota salva.' + extra, '💾');
    }
    return avisos;
}

function _rotaLinks(itens) {
    return RotasCore.linksRota({ origem: _rotaEmpresaEnd(), paradas: itens.map(v => v.end).filter(Boolean), volta: true });
}

async function abrirRotaNoMaps() {
    const links = _rotaLinks(_rotaItens());
    if (!links.length) { await showAlert('Nenhuma visita com endereço nesta rota.', '📍'); return; }
    if (links.length === 1) { window.open(links[0], '_blank', 'noopener'); return; }
    document.getElementById('rota-partes')?.remove();
    const ov = document.createElement('div');
    ov.id = 'rota-partes';
    ov.className = 'modal-overlay';
    ov.style.zIndex = '10050';
    ov.innerHTML = `<div class="modal-box" style="max-width:420px">
        <div class="modal-header"><h3>Rota em ${links.length} partes</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button></div>
        <div class="modal-body">
            <p style="font-size:13px;color:var(--muted);margin-bottom:12px">O Google Maps aceita poucas paradas por link. Abra uma parte de cada vez; cada uma começa onde a anterior terminou.</p>
            ${links.map((u, i) => `<a class="btn btn-outline" style="display:flex;justify-content:center;margin-bottom:8px" href="${escapeHtml(u)}" target="_blank" rel="noopener">🗺️ Parte ${i + 1}</a>`).join('')}
        </div></div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
}

async function enviarRotaAoTecnico() {
    const itens = _rotaItens();
    if (!itens.length) return;
    await salvarRota(true);
    const cheg = _rotaChegadas(itens);
    const calc = _rota.calc;
    const [data, prof] = _rota.chave.split('|');
    const sel = document.getElementById('rota-prof');
    const nomeProf = prof ? (sel?.selectedOptions[0]?.textContent || '').replace(/\s*\(\d+\)$/, '') : '';
    const trechos = calc ? Object.values(calc.porItem).filter(Boolean).concat(calc.volta ? [calc.volta] : []) : null;
    const texto = RotasCore.textoWhatsRota({
        data, tecnico: nomeProf, saida: _rotaEmpresaEnd(),
        itens: itens.map((v, i) => {
            const c = cheg && cheg.paradas[i];
            const hora = c && !c.incerto ? RotasCore.hhmm(c.inicioMin) : v.hora;
            return { hora, tipo: v.rotulo, cliente: v.cliente, tel: v.tel, end: v.end,
                aviso: c && !c.incerto && c.atrasoMin ? `${RotasCore.duracaoPorExtenso(c.atrasoMin)} depois do agendado (${v.hora})` : '' };
        }),
        links: _rotaLinks(itens),
        totalKm: trechos ? trechos.reduce((s, t) => s + t.metros, 0) / 1000 : null,
        totalMin: trechos ? trechos.reduce((s, t) => s + t.segundos, 0) / 60 : null,
    });
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
}
