'use strict';
// Janela da Agenda: visoes Semana/Dia/Mes por profissional, com medicoes,
// instalacoes, compromissos e bloqueios. Le tudo de _agdCompromissos() (uma regra
// so de ocupacao) e grava so db.agenda_eventos (sc_agd_ev). Depende de app.js e
// agenda-core.js.

const _ag = { aberta: false, prof: '', visao: 'semana', ref: '', foco: null };
const _AG_DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const _AG_TIPOS = {
    med:  { cls: 'med',  icone: '📐' },
    inst: { cls: 'inst', icone: '🔧' },
    bloq: { cls: 'bloq', icone: '⛔' },
    comp: { cls: 'comp', icone: '📌' },
};
const _AG_AVISOS = [[15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [1440, '1 dia antes']];

function _agDDMM(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
function _agDiaSemana(iso) { return _AG_DIAS[(new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7]; }
function _agUid() { const u = getUsuarioLogado(); return u ? u.id : null; }
function _agPode(chave) { return AgendaCore.podeGerenciar(chave, _agUid(), ehAdministrador()); }
function _agHM(min) { return _agdHHMM(Math.max(0, Math.min(1439, min))); }

function _agGrade() {
    const cfg = getAgendaConfig();
    const passo = Math.max(15, +cfg.passo || 60);
    let ini = _agdMin(cfg.inicio), fim = _agdMin(cfg.fim);
    if (ini === null) ini = 480;
    if (fim === null || fim <= ini) fim = ini + 600;
    const linhas = Math.ceil((fim - ini) / passo);
    const alturaLinha = passo <= 30 ? 30 : passo <= 60 ? 44 : 56;
    return { ini, fim: ini + linhas * passo, passo, linhas, alturaLinha, pxMin: alturaLinha / passo };
}

function _agItensDoProf() {
    return _agdCompromissos().filter(c => c.prof === _ag.prof).sort((a, b) => a.ini - b.ini);
}

function _agTitulo(c) {
    return `${c.rotulo}${c.cliente ? ' — ' + c.cliente : ''} (${_agdHHMM(c.ini)}–${_agdHHMM(c.fim)})${c.pendente ? ' — aguardando aceite' : ''}`;
}

// Um evento (bloco do Dia/Semana ou chip do Mes). Nada de descricao aqui: o rotulo
// ja vem com a privacidade aplicada por _agdCompromissos().
function _agEventoHtml(c, estilo, chip) {
    const t = _AG_TIPOS[c.tipo] || _AG_TIPOS.comp;
    const dados = `data-tipo="${escapeHtml(c.tipo)}" data-id="${escapeHtml(String(c.id))}" data-data="${escapeHtml(c.data)}"`;
    const tit = escapeHtml(_agTitulo(c));
    const cls = `ag-ev ag-ev-${t.cls}${c.pendente ? ' ag-pend' : ''}${chip ? ' ag-chip' : ''}`;
    if (chip) {
        return `<button type="button" class="${cls}" ${dados} title="${tit}" aria-label="${tit}"><span class="ag-ev-h">${_agdHHMM(c.ini)}</span> ${escapeHtml(c.rotulo)}</button>`;
    }
    return `<button type="button" class="${cls}" ${dados} style="${estilo}" title="${tit}" aria-label="${tit}">
        <span class="ag-ev-t"><span aria-hidden="true">${t.icone}</span> ${escapeHtml(c.rotulo)}</span>
        ${c.cliente ? `<span class="ag-ev-s">${escapeHtml(c.cliente)}</span>` : ''}
        ${c.pendente ? '<span class="ag-ev-s">Aguardando aceite</span>' : ''}</button>`;
}

function _agGradeHtml(dias, itens, pode) {
    const g = _agGrade();
    const hoje = _agdHoje();
    const altura = g.linhas * g.alturaLinha;
    const horas = Array.from({ length: g.linhas }, (_, i) =>
        `<div class="ag-hora" style="height:${g.alturaLinha}px">${_agdHHMM(g.ini + i * g.passo)}</div>`).join('');
    const colunas = dias.map(d => {
        const slots = Array.from({ length: g.linhas }, (_, i) => {
            const h = _agdHHMM(g.ini + i * g.passo);
            return `<div class="ag-slot${pode ? ' ag-slot-ok' : ''}" data-data="${d}" data-hora="${h}" style="height:${g.alturaLinha}px"></div>`;
        }).join('');
        const evs = itens.filter(c => c.data === d && c.fim > g.ini && c.ini < g.fim).map(c => {
            const topo = (Math.max(c.ini, g.ini) - g.ini) * g.pxMin;
            const alt = Math.max(22, (Math.min(c.fim, g.fim) - Math.max(c.ini, g.ini)) * g.pxMin - 2);
            return _agEventoHtml(c, `top:${topo}px;height:${alt}px`);
        }).join('');
        return `<div class="ag-col${d === hoje ? ' ag-hoje' : ''}" style="height:${altura}px">${slots}${evs}</div>`;
    }).join('');
    const fora = d => itens.filter(c => c.data === d && !(c.fim > g.ini && c.ini < g.fim));
    const cab = dias.map(d => {
        const f = fora(d).length;
        const marca = f && dias.length > 1
            ? `<button type="button" class="ag-fora-h" data-fora="${d}" title="Ver o dia: há itens fora do horário do expediente">+${f} fora do horário</button>` : '';
        return `<div class="ag-cab${d === hoje ? ' ag-hoje' : ''}"><strong>${_agDiaSemana(d)}</strong><span>${_agDDMM(d)}</span>${marca}</div>`;
    }).join('');
    const foraDia = dias.length === 1 ? fora(dias[0]) : [];
    const listaFora = foraDia.length
        ? `<div class="ag-fora-lista"><strong>Fora do horário do expediente:</strong>${foraDia.map(c => _agEventoHtml(c, '', true)).join('')}</div>` : '';
    return `${listaFora}<div class="ag-grade" style="--ag-cols:${dias.length}">
        <div class="ag-cabecalho"><div class="ag-cab ag-cab-h"><strong>Horário</strong></div>${cab}</div>
        <div class="ag-corpo"><div class="ag-horas">${horas}</div>${colunas}</div>
    </div>`;
}

function _agMesHtml(per, itens, pode) {
    const hoje = _agdHoje();
    const mesRef = _ag.ref.slice(0, 7);
    const cab = _AG_DIAS.map(d => `<div class="ag-mes-cab">${d.slice(0, 3)}</div>`).join('');
    const celulas = per.dias.map(d => {
        const dia = itens.filter(c => c.data === d);
        const chips = dia.slice(0, 3).map(c => _agEventoHtml(c, '', true)).join('');
        const mais = dia.length > 3
            ? `<button type="button" class="ag-mais" data-dia="${d}" aria-label="Ver os ${dia.length} itens de ${_agDDMM(d)}">+${dia.length - 3}</button>` : '';
        return `<div class="ag-mes-cel${d.slice(0, 7) !== mesRef ? ' ag-fora' : ''}${d === hoje ? ' ag-hoje' : ''}${pode ? ' ag-slot-ok' : ''}" data-data="${d}" data-hora="${getAgendaConfig().inicio || '08:00'}">
            <button type="button" class="ag-mes-num" data-dia="${d}" aria-label="Abrir o dia ${_agDDMM(d)}">${+d.slice(8, 10)}</button>${chips}${mais}</div>`;
    }).join('');
    return `<div class="ag-mes">${cab}${celulas}</div>`;
}

function _agLateralHtml() {
    const hoje = _agdHoje();
    const uid = _agUid();
    const todos = _agdCompromissos();
    const lista = _agdProfissionais();
    const meu = uid !== null ? 'u:' + uid : '';
    const ordem = [];
    if (meu) ordem.push(lista.find(x => x.chave === meu) || _agdProfInfo(meu));
    lista.filter(x => x.chave !== meu).forEach(x => ordem.push(x));
    return ordem.filter(Boolean).map(x => {
        const ocupado = todos.some(c => c.prof === x.chave && c.data === hoje);
        const sel = x.chave === _ag.prof;
        const eu = x.chave === meu;
        const ini = typeof _topbarIniciais === 'function' ? _topbarIniciais(x.nome) : x.nome.slice(0, 2).toUpperCase();
        return `<button type="button" class="ag-prof${sel ? ' ag-prof-sel' : ''}" data-prof="${escapeHtml(x.chave)}" aria-pressed="${sel}">
            <span class="ag-av">${escapeHtml(ini)}</span>
            <span class="ag-prof-nome"><strong>${escapeHtml(x.nome)}</strong><small>${eu ? 'Minha agenda' : escapeHtml(x.sub)}</small></span>
            <span class="ag-dot${ocupado ? ' ag-dot-on' : ''}" title="${ocupado ? 'Tem agenda hoje' : 'Livre hoje'}"></span></button>`;
    }).join('');
}

function _agendaRedesenhar() {
    const raiz = document.getElementById('agenda-janela');
    if (!_ag.aberta || !raiz) return;
    const info = _agdProfInfo(_ag.prof);
    const pode = _agPode(_ag.prof);
    const per = AgendaCore.periodo(_ag.visao, _ag.ref);
    const itens = _agItensDoProf();
    const rolagem = raiz.querySelector('.ag-grade-wrap');
    const rolTop = rolagem ? rolagem.scrollTop : 0, rolEsq = rolagem ? rolagem.scrollLeft : 0;
    const botao = (v, rot) => `<button type="button" class="ag-vis${_ag.visao === v ? ' ag-vis-on' : ''}" data-visao="${v}" aria-pressed="${_ag.visao === v}">${rot}</button>`;
    raiz.querySelector('.ag-lateral-lista').innerHTML = _agLateralHtml();
    raiz.querySelector('.ag-principal').innerHTML = `
        <div class="ag-barra">
            <div class="ag-visoes">${botao('semana', 'Semana')}${botao('dia', 'Dia')}${botao('mes', 'Mês')}</div>
            <div class="ag-nav">
                <button type="button" class="ag-seta" data-nav="-1" aria-label="Período anterior">‹</button>
                <span class="ag-periodo" aria-live="polite">${escapeHtml(per.rotulo)}</span>
                <button type="button" class="ag-seta" data-nav="1" aria-label="Próximo período">›</button>
                <button type="button" class="ag-hoje-btn" data-nav="0">Hoje</button>
            </div>
        </div>
        <div class="ag-quem">Agenda de <strong>${escapeHtml(info ? info.nome : '')}</strong>${pode ? '' : ' <span class="ag-so-ver">(somente leitura)</span>'}</div>
        <div class="ag-grade-wrap">${_ag.visao === 'mes' ? _agMesHtml(per, itens, pode) : _agGradeHtml(per.dias, itens, pode)}</div>`;
    const novo = raiz.querySelector('.ag-grade-wrap');
    novo.scrollTop = rolTop; novo.scrollLeft = rolEsq;
    raiz.querySelector('.ag-acoes').innerHTML = pode
        ? `<button type="button" class="btn btn-success ag-btn-novo" data-novo="compromisso">+ Novo compromisso</button>
           <button type="button" class="btn btn-outline" data-novo="bloqueio">⛔ Bloquear horário</button>` : '';
}

function abrirAgenda(profChave) {
    if (document.getElementById('agenda-janela')) {
        if (profChave) _ag.prof = profChave;
        _agendaRedesenhar();
        return;
    }
    const uid = _agUid();
    _ag.prof = profChave || (uid !== null ? 'u:' + uid : (_agdProfissionais()[0] || {}).chave || '');
    _ag.visao = 'semana';
    _ag.ref = _agdHoje();
    _ag.foco = document.activeElement;
    _ag.aberta = true;
    _agdRecarregar();
    const o = document.createElement('div');
    o.id = 'agenda-janela';
    o.className = 'ag-overlay';
    o.innerHTML = `<div class="ag-janela" role="dialog" aria-modal="true" aria-label="Agenda">
        <div class="ag-topo"><span class="ag-topo-ico" aria-hidden="true">📅</span><h2>Agenda</h2>
            <button type="button" class="ag-fechar" onclick="fecharAgenda()" aria-label="Fechar a agenda">✕</button></div>
        <div class="ag-corpo-janela">
            <aside class="ag-lateral"><h3>Profissionais</h3><div class="ag-lateral-lista"></div></aside>
            <section class="ag-principal"></section>
        </div>
        <div class="ag-rodape">
            <div class="ag-acoes"></div>
            <div class="ag-legenda" aria-label="Legenda">
                <span><i class="ag-lg ag-ev-med"></i>Medição</span><span><i class="ag-lg ag-ev-inst"></i>Instalação</span>
                <span><i class="ag-lg ag-ev-bloq"></i>Bloqueado</span><span><i class="ag-lg ag-ev-comp"></i>Compromisso</span>
                <span><i class="ag-lg ag-ev-med ag-pend"></i>Aguardando aceite</span>
            </div>
        </div>
    </div>`;
    o.addEventListener('mousedown', e => { o._fora = e.target === o; });
    o.addEventListener('click', e => { if (e.target === o && o._fora) fecharAgenda(); else _agClique(e); });
    document.body.appendChild(o);
    document.addEventListener('keydown', _agEsc);
    _agendaRedesenhar();
    const x = o.querySelector('.ag-fechar');
    if (x) x.focus();
}

function fecharAgenda() {
    const o = document.getElementById('agenda-janela');
    document.removeEventListener('keydown', _agEsc);
    _ag.aberta = false;
    if (o) o.remove();
    if (_ag.foco && _ag.foco.focus && document.contains(_ag.foco)) { try { _ag.foco.focus(); } catch (e) { /* ok */ } }
    _ag.foco = null;
}
// Com um formulario/detalhe aberto por cima, o Esc fecha so ele (a janela de cima
// tem o proprio ouvinte, registrado depois deste).
function _agEsc(e) {
    if (e.key !== 'Escape') return;
    if (_agdModalEl || Array.from(document.querySelectorAll('.sc-modal-overlay')).some(m => m.style.display === 'flex')) return;
    fecharAgenda();
}

function _agNavegar(n) {
    if (n === 0) { _ag.ref = _agdHoje(); return; }
    if (_ag.visao === 'mes') {
        const a = +_ag.ref.slice(0, 4), m = +_ag.ref.slice(5, 7) - 1 + n;
        const d = new Date(Date.UTC(a, m, 1));
        _ag.ref = d.toISOString().slice(0, 10);
    } else {
        _ag.ref = AgendaCore.somarDias(_ag.ref, n * (_ag.visao === 'dia' ? 1 : 7));
    }
}

function _agClique(e) {
    const t = e.target;
    const bt = (sel) => t.closest ? t.closest(sel) : null;
    let el;
    if ((el = bt('[data-prof]'))) { _ag.prof = el.dataset.prof; _agendaRedesenhar(); return; }
    if ((el = bt('[data-visao]'))) { _ag.visao = el.dataset.visao; _agendaRedesenhar(); return; }
    if ((el = bt('[data-nav]'))) { _agNavegar(+el.dataset.nav); _agendaRedesenhar(); return; }
    if ((el = bt('[data-novo]'))) { _agAbrirForm(el.dataset.novo, null, { data: _agdHoje() }); return; }
    if ((el = bt('[data-fora]'))) { _ag.visao = 'dia'; _ag.ref = el.dataset.fora; _agendaRedesenhar(); return; }
    if ((el = bt('.ag-mais, .ag-mes-num'))) { _ag.visao = 'dia'; _ag.ref = el.dataset.dia; _agendaRedesenhar(); return; }
    if ((el = bt('.ag-ev'))) { _agAbrirEvento(el.dataset.tipo, el.dataset.id); return; }
    if ((el = bt('[data-hora]')) && _agPode(_ag.prof)) { _agEscolha(el.dataset.data, el.dataset.hora); }
}

function _agAbrirEvento(tipo, id) {
    if (tipo === 'med') { abrirDetalheMedicao(id); return; }
    if (tipo === 'inst') { abrirDetalheInstalacao(id); return; }
    _agdRecarregar();
    const ev = (db.agenda_eventos || []).find(x => String(x.id) === String(id));
    if (!ev) { _agendaRedesenhar(); return; }
    if (!_agPode(ev.prof)) return;   // quem nao e dono nem Administrador so ve o bloco
    _agAbrirForm(ev.tipo, ev, {});
}

// Clique num horario vazio: escolha rapida ja com data e hora.
function _agEscolha(data, hora) {
    const nome = (_agdProfInfo(_ag.prof) || {}).nome || '';
    const corpo = `<p class="ag-escolha-info">${_agDiaSemana(data)}, ${_agdFmtData(data)} às ${escapeHtml(hora)} — agenda de ${escapeHtml(nome)}</p>
        <div class="ag-escolha">
            <button type="button" class="btn btn-success" id="ag-esc-comp">+ Novo compromisso</button>
            <button type="button" class="btn btn-outline" id="ag-esc-bloq">⛔ Bloquear horário</button>
        </div>`;
    const o = _agdAbrirModal('O que deseja criar?', corpo, '');
    const ini = _agdMin(hora) ?? 480;
    const pre = { data, hora_ini: hora, hora_fim: _agHM(ini + 60) };
    o.querySelector('#ag-esc-comp').onclick = () => _agAbrirForm('compromisso', null, pre);
    o.querySelector('#ag-esc-bloq').onclick = () => _agAbrirForm('bloqueio', null, { ...pre, bloqueio: 'horario' });
}

function _agFormHtml(tipo, ev) {
    const comp = tipo === 'compromisso';
    const v = ev || {};
    const bt = v.bloqueio || 'horario';
    const aviso = v.aviso_min === undefined || v.aviso_min === null || v.aviso_min === '' ? 30 : +v.aviso_min;
    const campo = (id, rot, input, extra) => `<div class="form-group"${extra || ''}><label for="${id}">${rot}</label>${input}</div>`;
    const horas = `<div class="ag-form-linha" id="ag-f-whoras">
        ${campo('ag-f-hi', 'Hora início', `<input type="time" id="ag-f-hi" value="${escapeHtml(v.hora_ini || '')}">`)}
        ${campo('ag-f-hf', 'Hora fim', `<input type="time" id="ag-f-hf" value="${escapeHtml(v.hora_fim || '')}">`)}</div>`;
    if (comp) {
        return `<div class="agd-form ag-form">
            ${campo('ag-f-data', 'Data', `<input type="date" id="ag-f-data" value="${escapeHtml(v.data_ini || '')}">`)}
            ${horas}
            ${campo('ag-f-desc', 'Descrição <span style="color:var(--danger)">*</span>', `<input type="text" id="ag-f-desc" value="${escapeHtml(v.descricao || '')}" maxlength="200" autocomplete="off">`)}
            ${campo('ag-f-aviso', 'Avisar', `<select id="ag-f-aviso">${_AG_AVISOS.map(([m, r]) => `<option value="${m}"${m === aviso ? ' selected' : ''}>${r}</option>`).join('')}</select>`)}
            <div class="ag-erro" id="ag-f-erro" role="alert"></div></div>`;
    }
    return `<div class="agd-form ag-form">
        ${campo('ag-f-bt', 'Tipo', `<select id="ag-f-bt">${Object.entries(_AGD_BLOQ_ROTULOS).map(([k, r]) => `<option value="${k}"${k === bt ? ' selected' : ''}>${r}</option>`).join('')}</select>`)}
        <div class="ag-form-linha">
            ${campo('ag-f-data', 'Data início', `<input type="date" id="ag-f-data" value="${escapeHtml(v.data_ini || '')}">`)}
            ${campo('ag-f-datafim', 'Data fim (vazio = só o dia início)', `<input type="date" id="ag-f-datafim" value="${escapeHtml(v.data_fim || '')}">`, ' id="ag-f-wfim"')}
        </div>
        ${horas}
        ${campo('ag-f-desc', 'Motivo (opcional)', `<input type="text" id="ag-f-desc" value="${escapeHtml(v.descricao || '')}" maxlength="200" autocomplete="off">`)}
        <div class="ag-erro" id="ag-f-erro" role="alert"></div></div>`;
}

function _agAbrirForm(tipo, ev, pre) {
    const editando = !!ev;
    const comp = tipo === 'compromisso';
    const base = ev || {
        data_ini: pre.data || _agdHoje(), data_fim: '',
        hora_ini: pre.hora_ini || '', hora_fim: pre.hora_fim || '', bloqueio: pre.bloqueio || 'horario', descricao: '',
    };
    const titulo = (editando ? 'Editar ' : 'Novo ') + (comp ? 'compromisso' : 'bloqueio');
    const rodape = `${editando ? '<button type="button" class="btn btn-outline btn-sm btn-danger" id="ag-f-excluir" style="margin-right:auto">🗑️ Excluir</button>' : ''}
        <button type="button" class="btn btn-outline btn-sm" id="ag-f-cancelar">Cancelar</button>
        <button type="button" class="btn btn-success btn-sm" id="ag-f-salvar">Salvar</button>`;
    const o = _agdAbrirModal(titulo, _agFormHtml(tipo, base), rodape);
    const $ = id => o.querySelector('#' + id);
    const alternar = () => {
        if (comp) return;
        const horario = $('ag-f-bt').value === 'horario';
        $('ag-f-whoras').hidden = !horario;
        $('ag-f-wfim').hidden = horario;
    };
    if (!comp) { $('ag-f-bt').onchange = alternar; alternar(); }
    if (!comp) $('ag-f-data').onchange = () => { const f = $('ag-f-datafim'); if (f.value && f.value < $('ag-f-data').value) f.value = $('ag-f-data').value; };
    $('ag-f-cancelar').onclick = fecharModalAgenda;
    const erro = msg => { $('ag-f-erro').textContent = msg; return false; };
    $('ag-f-salvar').onclick = async () => {
        const data = $('ag-f-data').value;
        if (!data) return erro('Informe a data.');
        const bt = comp ? '' : $('ag-f-bt').value;
        const horario = comp || bt === 'horario';
        const hi = horario ? $('ag-f-hi').value : '', hf = horario ? $('ag-f-hf').value : '';
        if (horario) {
            if (!hi || !hf) return erro('Informe a hora de início e a de fim.');
            if (_agdMin(hf) <= _agdMin(hi)) return erro('A hora de fim precisa ser depois da hora de início.');
        }
        const dataFim = horario ? data : ($('ag-f-datafim').value || data);
        if (dataFim < data) return erro('A data fim não pode ser antes da data início.');
        const desc = $('ag-f-desc').value.trim();
        if (comp && !desc) return erro('Descreva o compromisso.');
        erro('');
        const novo = {
            prof: editando ? ev.prof : _ag.prof, tipo, bloqueio: bt, data_ini: data, data_fim: dataFim,
            hora_ini: hi, hora_fim: hf, dia_inteiro: !horario, descricao: desc,
            aviso_min: comp ? +$('ag-f-aviso').value : null,
        };
        if (await _agGravar(novo, editando ? ev.id : null)) fecharModalAgenda();
    };
    if (editando) $('ag-f-excluir').onclick = () => _agExcluir(ev.id);
    const primeiro = o.querySelector('input:not([hidden]), select, textarea');
    if (primeiro) primeiro.focus();
}

// Relê o que esta gravado (outra aba pode ter gravado), confere o conflito de novo
// com os dados frescos e so entao grava. Devolve true se gravou.
async function _agGravar(novo, id) {
    _agdRecarregar();
    if (!_agPode(novo.prof)) { await showAlert('Você só pode alterar a sua própria agenda.', '⛔'); return false; }
    let ev = { ...novo };
    if (id) {
        const antigo = (db.agenda_eventos || []).find(x => String(x.id) === String(id));
        if (!antigo) { await showAlert('Este item não existe mais (foi excluído em outra aba).', '⚠️'); _agendaRedesenhar(); return true; }
        ev = { ...antigo, ...novo };
    }
    const cfg = getAgendaConfig();
    const ign = id ? { tipo: ev.tipo === 'compromisso' ? 'comp' : 'bloq', id } : null;
    const linhas = [];
    AgendaCore.ocupacoesDoEvento(ev, cfg).forEach(o => {
        _agdDoDia(ev.prof, o.data, ign).filter(c => c.ini < o.fim && o.ini < c.fim).forEach(c => {
            const l = `• ${_agdFmtData(o.data).slice(0, 5)}, ${_agdHHMM(c.ini)}–${_agdHHMM(c.fim)}: ${c.rotulo}${c.cliente ? ' — ' + c.cliente : ''}`;
            if (!linhas.includes(l)) linhas.push(l);
        });
    });
    if (linhas.length) {
        const nome = (_agdProfInfo(ev.prof) || {}).nome || 'O profissional';
        const lista = linhas.slice(0, 6).join('\n') + (linhas.length > 6 ? `\n… e mais ${linhas.length - 6}` : '');
        await showAlert(`${nome} já tem compromisso nesse período:\n\n${lista}\n\nEscolha outro horário ou outro dia.`, '⛔');
        return false;
    }
    const agora = Date.now();
    if (id) {
        ev.alterado_em = agora;
        const i = db.agenda_eventos.findIndex(x => String(x.id) === String(id));
        db.agenda_eventos[i] = ev;
    } else {
        ev.id = 'e' + agora.toString(36) + Math.random().toString(36).slice(2, 6);
        ev.criado_por = _agUid();
        ev.criado_em = agora;
        ev.alterado_em = agora;
        db.agenda_eventos.push(ev);
    }
    syncDB();
    if (typeof Notif !== 'undefined') Notif.atualizar();
    toast(id ? 'Agenda atualizada!' : (ev.tipo === 'compromisso' ? 'Compromisso salvo!' : 'Horário bloqueado!'), 'success');
    _agendaRedesenhar();
    return true;
}

async function _agExcluir(id) {
    if (!await showConfirm('Excluir este item da agenda?', '🗑️', 'Excluir', 'Cancelar')) return;
    _agdRecarregar();
    const ev = (db.agenda_eventos || []).find(x => String(x.id) === String(id));
    if (!ev) { await showAlert('Este item não existe mais (foi excluído em outra aba).', '⚠️'); fecharModalAgenda(); _agendaRedesenhar(); return; }
    if (ev && !_agPode(ev.prof)) { await showAlert('Você só pode alterar a sua própria agenda.', '⛔'); return; }
    db.agenda_eventos = (db.agenda_eventos || []).filter(x => String(x.id) !== String(id));
    syncDB();
    if (typeof Notif !== 'undefined') Notif.atualizar();
    fecharModalAgenda();
    toast('Item excluído da agenda.', 'success');
    _agendaRedesenhar();
}

// Atualizacao ao vivo: gravou em outra aba -> a janela aberta se redesenha.
// Fica no escopo do arquivo (vale em toda pagina), nao em bloco de pagina.
window.addEventListener('storage', e => {
    if (!_ag.aberta) return;
    if (e.key === 'sc_usr' || e.key === 'sc_pap') { _agdAtualizarListaProf(); _agendaRedesenhar(); return; }
    if (e.key !== 'sc_agd_ev' && e.key !== 'sc_ped' && e.key !== 'sc_med' && e.key !== 'sc_agd_cfg') return;
    _agdRecarregar();
    _agendaRedesenhar();
});

// ── Lembretes de compromisso ─────────────────────────────────────
// De (inicio - aviso) ate o fim do compromisso, o dono ve o lembrete no sino e nos
// Alertas. Compromisso de dia inteiro vale do comeco do primeiro dia ao fim do ultimo.
function _agLembretesAtivos(agora) {
    const uid = _agUid();
    if (uid === null) return [];
    const t = (agora || new Date()).getTime();
    const out = [];
    (db.agenda_eventos || []).forEach(ev => {
        if (!ev || ev.tipo !== 'compromisso' || ev.prof !== 'u:' + uid || !ev.data_ini) return;
        let de, ate, quando;
        if (ev.dia_inteiro) {
            const a = +ev.data_ini.slice(0, 4), m = +ev.data_ini.slice(5, 7) - 1, d = +ev.data_ini.slice(8, 10);
            const f = ev.data_fim || ev.data_ini;
            de = new Date(a, m, d);
            ate = new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10), 23, 59, 59);
            quando = 'hoje';
        } else {
            const j = AgendaCore.janelaLembrete(ev, {});
            if (!j) return;
            de = j.de; ate = j.ate;
            quando = 'às ' + ev.hora_ini;
        }
        if (t < de.getTime() || t >= ate.getTime()) return;
        out.push({
            chave: 'compromisso:' + ev.id + ':' + ev.data_ini + 'T' + (ev.dia_inteiro ? 'dia' : ev.hora_ini),
            icone: '📌', cor: 'warn', urgente: true,
            titulo: '<strong>Compromisso ' + quando + ':</strong>',
            texto: escapeHtml(ev.descricao || ''),
            acao: { rotulo: 'Abrir agenda', fn: "abrirAgendaNoDia('" + ev.data_ini + "')" },
            _ordem: de.getTime(), _desc: ev.descricao || '', _quando: quando
        });
    });
    return out.sort((x, y) => x._ordem - y._ordem);
}
Notif.registrar('compromissos', () => alertaAtivo('compromisso') ? _agLembretesAtivos() : []);

function abrirAgendaNoDia(data) {
    abrirAgenda();
    if (data) { _ag.visao = 'dia'; _ag.ref = data; _agendaRedesenhar(); }
}

function _agMostradosChave() { const u = _agUid(); return u === null ? null : 'sc_lembretes_mostrados_' + u; }
function _agVerificarLembretes() {
    const k = _agMostradosChave();
    if (!k) return;
    _agdRecarregar();
    let ativos = [];
    try { const vis = new Set(Notif.listar().map(i => i.chave)); ativos = _agLembretesAtivos().filter(i => vis.has(i.chave)); } catch (e) { return; }
    let mostrados = [];
    try { const v = JSON.parse(localStorage.getItem(k)); if (Array.isArray(v)) mostrados = v; } catch (e) { /* vazio */ }
    const novos = ativos.filter(i => !mostrados.includes(i.chave));
    const lista = mostrados.filter(c => _agLembretesAtivos().some(i => i.chave === c)).concat(novos.map(i => i.chave));
    try { localStorage.setItem(k, JSON.stringify(lista)); } catch (e) { /* so nao lembra */ }
    novos.forEach(i => toast('📌 Compromisso ' + i._quando + ': ' + i._desc, 'warning', 8000));
    const assinatura = ativos.map(i => i.chave).join('|');
    if (assinatura !== _ag.assinaturaLembretes) { _ag.assinaturaLembretes = assinatura; Notif.atualizar(); }
}
function iniciarLembretesAgenda() {
    if (window._agLembreteTimer || !document.getElementById('main-sidebar')) return;
    _agVerificarLembretes();
    window._agLembreteTimer = setInterval(() => { try { _agVerificarLembretes(); } catch (e) { console.error(e); } }, 60000);
}
