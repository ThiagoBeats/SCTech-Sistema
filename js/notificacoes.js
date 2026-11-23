// Notificacoes: o sino da barra superior e o card "Alertas do Sistema" do Painel
// leem a mesma lista. Cada tipo de alerta e um coletor registrado aqui:
//   Notif.registrar('nome', () => [{ chave, icone, titulo, texto, urgente, cor?, href?, acao?: { rotulo, fn }, acoes?: [{ rotulo, fn, sec? }], persistente? }])
// titulo e texto sao HTML (o coletor escapa o que vem do usuario).
// A chave identifica o alerta: quando muda (ex.: entra um pedido novo na lista), conta de novo.
// "Vistos" ficam por usuario em localStorage sc_notif_vistos_<id>; abrir o sino marca tudo o que ele lista como visto.
const Notif = (() => {
    const coletores = [];

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function registrar(nome, coletor) {
        const i = coletores.findIndex(c => c.nome === nome);
        if (i >= 0) coletores[i].coletor = coletor; else coletores.push({ nome, coletor });
    }
    function _userId() {
        try { const u = JSON.parse(sessionStorage.getItem('sc_user') || 'null'); return u && u.id != null ? u.id : null; } catch (e) { return null; }
    }
    function _chaveVistos() { const id = _userId(); return id == null ? null : 'sc_notif_vistos_' + id; }
    function _lerVistos() {
        const k = _chaveVistos();
        if (!k) return [];
        try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function _gravarVistos(lista) {
        const k = _chaveVistos();
        if (!k) return;
        try { localStorage.setItem(k, JSON.stringify(lista)); } catch (e) { /* sem espaco: so nao lembra */ }
    }

    // Botoes do alerta: `acoes: [{ rotulo, fn, sec? }]` (varios) ou `acao: { rotulo, fn }` (um so).
    function acoesDe(it) {
        const l = Array.isArray(it.acoes) ? it.acoes : (it.acao ? [it.acao] : []);
        return l.filter(a => a && a.fn);
    }

    function _todos() {
        const itens = [];
        coletores.forEach(c => {
            let r = [];
            try { r = c.coletor() || []; } catch (e) { console.error('Coletor de notificacoes falhou:', c.nome, e); }
            (Array.isArray(r) ? r : []).forEach(it => { if (it && it.chave) itens.push(it); });
        });
        return itens;
    }
    // Itens de todos os coletores, respeitando a preferencia do usuario
    // (todas / so as urgentes / nenhuma). Os persistentes (pedem uma resposta) ficam sempre.
    function listar() {
        let pref = 'todas';
        try { if (typeof prefsUsuario === 'function') pref = prefsUsuario().notificacoes; } catch (e) {}
        return _todos().filter(it => {
            if (it.persistente) return true;
            if (pref === 'nenhuma') return false;
            if (pref === 'urgentes') return !!it.urgente;
            return true;
        });
    }
    function naoVistos() {
        const vistos = new Set(_lerVistos());
        return listar().filter(it => !vistos.has(it.chave));
    }
    function marcarVisto(chave) {
        const v = _lerVistos();
        if (!v.includes(chave)) { v.push(chave); _gravarVistos(v); }
        desenharSino();
    }
    function marcarTodasVistas() {
        const v = new Set(_lerVistos());
        listar().forEach(it => v.add(it.chave));
        _gravarVistos([...v]);
        desenharSino();
    }
    // Tira dos "vistos" o que nao existe mais (o alerta foi resolvido).
    function _limparVistos(itens) {
        const v = _lerVistos();
        const existentes = new Set(itens.map(i => i.chave));
        const novo = v.filter(k => existentes.has(k));
        if (novo.length !== v.length) _gravarVistos(novo);
    }

    function _textoPuro(html) {
        const d = document.createElement('div');
        d.innerHTML = html == null ? '' : html;
        return (d.textContent || '').replace(/\s+/g, ' ').trim();
    }

    const SVG_SINO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';

    // Itens que eram novos quando o painel abriu: a contagem ja zerou, mas ordem e destaque
    // ficam enquanto o painel estiver aberto (ao fechar, viram "vistos" de verdade na lista).
    let _novosAoAbrir = new Set();
    function desenharSino() {
        const el = document.getElementById('topbar-sino');
        if (!el) return;
        const itens = listar();
        _limparVistos(_todos());
        const vistos = new Set(_lerVistos());
        const naoV = itens.filter(i => !vistos.has(i.chave));
        const destaque = new Set([...naoV.map(i => i.chave), ..._novosAoAbrir]);
        const ordenados = [...itens.filter(i => destaque.has(i.chave)), ...itens.filter(i => !destaque.has(i.chave))];
        const badge = naoV.length ? `<span class="sino-badge" id="sino-badge">${naoV.length > 99 ? '99+' : naoV.length}</span>` : '';
        let desligados = false;
        try {
            const cfg = typeof getAlertasCfg === 'function' ? getAlertasCfg() : {};
            desligados = typeof ALERTAS_TIPOS !== 'undefined' && Object.keys(ALERTAS_TIPOS).some(k => cfg[k] === false);
        } catch (e) {}
        const lista = ordenados.length ? ordenados.map(it => {
            const novo = destaque.has(it.chave);
            const acoes = acoesDe(it);
            // Link para pagina sem acesso: o item so marca visto.
            const href = it.href && (typeof _hrefPermitido !== 'function' || _hrefPermitido(it.href)) ? it.href : '';
            const acao = acoes.length
                ? `<span class="sino-acoes">${acoes.map(a => `<button type="button" class="sino-acao${a.sec ? ' sino-acao-sec' : ''}" data-sino-acao="${esc(a.fn)}" data-chave="${esc(it.chave)}">${esc(a.rotulo)}</button>`).join('')}</span>` : '';
            return `<div class="sino-item${novo ? ' novo' : ''}" role="button" tabindex="0" data-chave="${esc(it.chave)}" data-href="${esc(href)}">
                <span class="sino-item-icone">${it.icone || '🔔'}</span>
                <span class="sino-item-corpo"><strong>${esc(_textoPuro(it.titulo))}</strong> <span>${esc(_textoPuro(it.texto))}</span>${acao}</span>
            </div>`;
        }).join('') : '<div class="sino-vazio">Nenhuma notificação no momento.</div>';
        const rodape = desligados ? '<a class="sino-rodape" href="empresa.html#preferencias">🔕 Alertas desabilitados</a>' : '';
        const aberto = el.classList.contains('aberto');
        el.innerHTML = `<button type="button" class="sino-btn" id="sino-btn" aria-label="Notificações" title="Notificações">${SVG_SINO}${badge}</button>
            <div class="sino-painel" id="sino-painel"><div class="sino-painel-caixa">
                <div class="sino-cab"><span>Notificações</span></div>
                <div class="sino-lista">${lista}</div>${rodape}
            </div></div>`;
        if (aberto) el.classList.add('aberto');
    }

    function atualizar() {
        desenharSino();
        if (typeof renderDashboardAlertas === 'function') renderDashboardAlertas();
    }
    let _agendado = null;
    function atualizarDepois() {
        clearTimeout(_agendado);
        _agendado = setTimeout(() => { try { atualizar(); } catch (e) { console.error(e); } }, 60);
    }

    // Abrir a mini-janela (passar o mouse ou tocar) marca como vistos os itens listados:
    // a contagem zera e eles continuam na lista, sem o destaque de novo.
    function _aoAbrir() {
        const novos = naoVistos();
        if (!novos.length) return;
        novos.forEach(it => _novosAoAbrir.add(it.chave));
        marcarTodasVistas();
    }
    // Fechar o painel: o destaque dos que eram novos some.
    function _aoFechar() {
        if (!_novosAoAbrir.size) return;
        _novosAoAbrir = new Set();
        desenharSino();
    }
    document.addEventListener('mouseout', e => {
        const sino = document.getElementById('topbar-sino');
        if (!sino || !sino.contains(e.target) || (e.relatedTarget && sino.contains(e.relatedTarget))) return;
        if (!sino.classList.contains('aberto')) _aoFechar();
    });
    document.addEventListener('mouseover', e => {
        const sino = document.getElementById('topbar-sino');
        if (!sino || !sino.contains(e.target) || sino.contains(e.relatedTarget)) return;
        _aoAbrir();
    });
    document.addEventListener('click', e => {
        const sino = document.getElementById('topbar-sino');
        if (!sino) return;
        const ac = e.target.closest('[data-sino-acao]');
        if (ac && sino.contains(ac)) {
            e.stopPropagation();
            marcarVisto(ac.dataset.chave);
            try { new Function(ac.dataset.sinoAcao)(); } catch (err) { console.error(err); }
            return;
        }
        const item = e.target.closest('.sino-item');
        if (item && sino.contains(item)) {
            marcarVisto(item.dataset.chave);
            const h = item.dataset.href;
            if (h) window.location.href = h;
            return;
        }
        if (e.target.closest('#sino-btn')) { sino.classList.toggle('aberto'); if (sino.classList.contains('aberto')) _aoAbrir(); else _aoFechar(); return; }
        if (!sino.contains(e.target)) { sino.classList.remove('aberto'); _aoFechar(); }
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { const s = document.getElementById('topbar-sino'); if (s) s.classList.remove('aberto'); _aoFechar(); }
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('sino-item')) { e.preventDefault(); e.target.click(); }
    });
    // Outra aba gravou: recarrega o que os alertas leem e redesenha.
    window.addEventListener('storage', e => {
        if (typeof _notifRecarregarDB === 'function') { try { _notifRecarregarDB(e.key); } catch (err) {} }
        if (e.key && e.key.indexOf('sc_notif_vistos_') === 0 && e.key !== _chaveVistos()) return;
        atualizarDepois();
    });

    return { registrar, acoesDe, listar, naoVistos, marcarVisto, marcarTodasVistas, atualizar, atualizarDepois, desenharSino };
})();
