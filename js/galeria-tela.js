// Pagina Galeria: fotos reais do mostruario, por grupo, com visor em tela cheia
// (setas, deslizar o dedo, Esc). Cada foto ligada a um modelo leva ao
// simulador ja com ele escolhido. A rota #simular abre o simulador.
const _gal = { fotos: [], indice: -1 };

function iniciarGaleria() {
    const topo = document.querySelector('a.gal-simular-topo');
    if (topo) { if (GaleriaCore.SIMULADOR_ATIVO) topo.hidden = false; else topo.remove(); }
    window.addEventListener('hashchange', _galRota);
    document.addEventListener('keydown', _galTecla);
    _galRota();
}

function _galRota() {
    const h = location.hash || '';
    if (GaleriaCore.SIMULADOR_ATIVO && h.startsWith('#simular') && typeof abrirSimulador === 'function') {
        abrirSimulador(_galPreSelecao(h));
        return;
    }
    if (typeof fecharSimulador === 'function') fecharSimulador();
    renderGaleria();
}

// "#simular?prega=Wave%20Botao" -> { prega: 'Wave Botao' }
function _galPreSelecao(hash) {
    const i = hash.indexOf('?');
    const p = new URLSearchParams(i >= 0 ? hash.slice(i + 1) : '');
    const r = {};
    ['prega', 'persiana', 'trilho'].forEach(k => { if (p.get(k)) r[k] = p.get(k); });
    return r;
}

function linkSimularFoto(liga) {
    if (!liga) return '';
    return 'galeria.html#simular?' + liga.tipo + '=' + encodeURIComponent(liga.valor);
}

async function renderGaleria() {
    const alvo = document.getElementById('gal-conteudo');
    if (!alvo) return;
    const m = lerMostruarioSalvo();
    const disp = await GaleriaImagens.disponivel();
    const fotos = [];
    for (const f of m.fotos) {
        const url = disp ? await GaleriaImagens.url(f.imagemId) : null;
        if (url) fotos.push(Object.assign({}, f, { url }));
    }
    _gal.fotos = fotos;
    if (!fotos.length) {
        const podeMontar = temAcesso('configuracoes.empresa', 'completo');
        alvo.innerHTML = `<div class="card gal-vazio">
            <div class="gal-vazio-icone">🖼️</div>
            <h3>Nenhuma foto na galeria ainda</h3>
            <p>${disp ? 'As fotos de modelos reais que a empresa cadastrar aparecem aqui, separadas por tipo.'
                      : 'Este navegador não permite guardar fotos (pode ser uma janela anônima).'}
               ${GaleriaCore.SIMULADOR_ATIVO ? 'O simulador já funciona com as cores iniciais.' : ''}</p>
            <div class="gal-vazio-acoes">
                ${GaleriaCore.SIMULADOR_ATIVO ? '<a href="galeria.html#simular" class="btn btn-success">📐 Simular na parede do cliente</a>' : ''}
                ${podeMontar ? '<a href="empresa.html#galeria" class="btn btn-outline">Montar o mostruário</a>' : ''}
            </div>
        </div>`;
        return;
    }
    alvo.innerHTML = GaleriaCore.GRUPOS.map(g => {
        const doGrupo = fotos.filter(f => f.grupo === g.id);
        if (!doGrupo.length) return '';
        return `<section class="gal-grupo">
            <h3>${escapeHtml(g.nome)}</h3>
            <div class="gal-grade">${doGrupo.map(f => `
                <div class="gal-foto" data-id="${escapeHtml(f.id)}" tabindex="0" role="button" aria-label="${escapeHtml(f.legenda || g.nome)}">
                    <img src="${f.url}" alt="" loading="lazy">
                    ${f.legenda ? `<span class="gal-legenda">${escapeHtml(f.legenda)}</span>` : ''}
                    ${f.liga && GaleriaCore.SIMULADOR_ATIVO ? `<a class="gal-simular" href="${linkSimularFoto(f.liga)}" title="Simular na parede do cliente">📐 Simular</a>` : ''}
                </div>`).join('')}
            </div>
        </section>`;
    }).join('');
    alvo.querySelectorAll('.gal-foto').forEach(el => {
        const abrir = () => abrirVisorGaleria(_gal.fotos.findIndex(f => f.id === el.dataset.id));
        el.addEventListener('click', e => { if (!e.target.closest('a')) abrir(); });
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    });
}

// ---- visor em tela cheia ----
function abrirVisorGaleria(i) {
    if (i < 0 || !_gal.fotos.length) return;
    _gal.indice = i;
    const raiz = document.getElementById('gal-visor-raiz');
    raiz.innerHTML = `<div class="gal-visor" role="dialog" aria-modal="true" aria-label="Foto da galeria">
        <button type="button" class="gal-visor-fechar" aria-label="Fechar">✕</button>
        <button type="button" class="gal-visor-seta gal-visor-ant" aria-label="Foto anterior">‹</button>
        <img class="gal-visor-img" alt="">
        <button type="button" class="gal-visor-seta gal-visor-prox" aria-label="Próxima foto">›</button>
        <div class="gal-visor-rodape">
            <span class="gal-visor-legenda"></span>
            <span class="gal-visor-conta"></span>
            <span class="gal-visor-acao"></span>
        </div>
    </div>`;
    const v = raiz.querySelector('.gal-visor');
    v.querySelector('.gal-visor-fechar').onclick = fecharVisorGaleria;
    v.querySelector('.gal-visor-ant').onclick = () => _galPassar(-1);
    v.querySelector('.gal-visor-prox').onclick = () => _galPassar(1);
    let x0 = null;
    v.addEventListener('pointerdown', e => { if (!e.target.closest('button, a')) x0 = e.clientX; });
    v.addEventListener('pointerup', e => {
        if (x0 === null) return;
        const dx = e.clientX - x0; x0 = null;
        if (Math.abs(dx) >= 40) _galPassar(dx < 0 ? 1 : -1);
    });
    v.addEventListener('pointercancel', () => { x0 = null; });
    _galMostrar();
}

function _galMostrar() {
    const v = document.querySelector('.gal-visor');
    const f = _gal.fotos[_gal.indice];
    if (!v || !f) return;
    v.querySelector('.gal-visor-img').src = f.url;
    v.querySelector('.gal-visor-legenda').textContent = f.legenda || '';
    v.querySelector('.gal-visor-conta').textContent = `${_gal.indice + 1} / ${_gal.fotos.length}`;
    v.querySelector('.gal-visor-acao').innerHTML = f.liga && GaleriaCore.SIMULADOR_ATIVO
        ? `<a class="btn btn-success btn-sm gal-simular" href="${linkSimularFoto(f.liga)}">📐 Simular na parede do cliente</a>` : '';
    const varias = _gal.fotos.length > 1;
    v.querySelector('.gal-visor-ant').hidden = !varias;
    v.querySelector('.gal-visor-prox').hidden = !varias;
}

function _galPassar(d) {
    const n = _gal.fotos.length;
    if (!n) return;
    _gal.indice = (_gal.indice + d + n) % n;
    _galMostrar();
}

function fecharVisorGaleria() {
    const raiz = document.getElementById('gal-visor-raiz');
    if (raiz) raiz.innerHTML = '';
    _gal.indice = -1;
}

function _galTecla(e) {
    if (!document.querySelector('.gal-visor')) return;
    if (e.key === 'Escape') fecharVisorGaleria();
    else if (e.key === 'ArrowRight') _galPassar(1);
    else if (e.key === 'ArrowLeft') _galPassar(-1);
}
