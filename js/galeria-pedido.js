// Galeria dentro do pedido: abre por cima do formulario (o pedido continua
// aberto, nada se perde) para mostrar ao cliente os modelos de prega e
// persiana, as fotos reais do mostruario e o simulador na parede dele.
// O modelo escolhido aqui volta para o "Tipo de Prega" do tecido no pedido.
const _galPed = {
    aba: 'modelos',
    alvo: null,        // { ambId, tidx } do tecido que recebe a escolha
    escolha: null,     // chave de GaleriaCore.PREGAS escolhida
    fotos: [],
    teclado: null
};

// Tecidos do pedido aberto, na ordem da tela: [{ ambId, tidx, rotulo }]
function _galPedAlvos() {
    const lista = [];
    (pedidoDraft.ambientes || []).forEach((a, i) => {
        const nomeAmb = (document.getElementById(`a-amb-${a.id}`)?.value || a.amb || '').trim() || `Ambiente ${i + 1}`;
        const tecs = a.tecidos && a.tecidos.length ? a.tecidos : [{}];
        tecs.forEach((t, tidx) => {
            if (!document.getElementById(`t-prega-${a.id}-${tidx}`)) return;
            lista.push({ ambId: a.id, tidx, rotulo: tecs.length > 1 ? `${nomeAmb} · Tecido ${tidx + 1}` : nomeAmb });
        });
    });
    return lista;
}

function _galPedPregaAtual(alvo) {
    return alvo ? (document.getElementById(`t-prega-${alvo.ambId}-${alvo.tidx}`)?.value || '') : '';
}

function _galPedSomenteLeitura() {
    const sel = _galPedAlvos()[0];
    return !!sel && !!document.getElementById(`t-prega-${sel.ambId}-${sel.tidx}`)?.disabled;
}

function abrirGaleriaPedido(ambId, tidx) {
    if (typeof temAcesso === 'function' && !temAcesso('galeria', 'visualizar')) {
        showAlert('Você não tem acesso à Galeria.', '🚫');
        return;
    }
    if (typeof syncAmbientesFromDOM === 'function') syncAmbientesFromDOM();
    const alvos = _galPedAlvos();
    _galPed.alvo = alvos.find(a => a.ambId == ambId && a.tidx == (tidx || 0)) || alvos[0] || null;
    _galPed.escolha = _galPedPregaAtual(_galPed.alvo) || null;
    _galPed.aba = 'modelos';
    let o = document.getElementById('galped');
    if (!o) {
        o = document.createElement('div');
        o.id = 'galped';
        o.className = 'galped';
        o.setAttribute('role', 'dialog');
        o.setAttribute('aria-modal', 'true');
        o.setAttribute('aria-label', 'Galeria de modelos');
        document.body.appendChild(o);
    }
    o.hidden = false;
    document.body.classList.add('galped-aberta');
    _galPedRender();
    _galPed.teclado = e => {
        if (e.key !== 'Escape') return;
        if (document.querySelector('.gal-visor')) { fecharVisorGaleria(); return; }
        const sim = document.getElementById('sim');
        if (sim && !sim.hidden) { _galPedVoltarDoSimulador(); return; }
        fecharGaleriaPedido();
    };
    document.addEventListener('keydown', _galPed.teclado);
}

function fecharGaleriaPedido() {
    const o = document.getElementById('galped');
    if (o) o.hidden = true;
    document.body.classList.remove('galped-aberta');
    if (_galPed.teclado) document.removeEventListener('keydown', _galPed.teclado);
    _galPed.teclado = null;
    if (typeof fecharVisorGaleria === 'function') fecharVisorGaleria();
    if (typeof fecharSimulador === 'function') fecharSimulador();
}

function _galPedRender() {
    const o = document.getElementById('galped');
    if (!o) return;
    const G = GaleriaCore;
    const alvos = _galPedAlvos();
    const leitura = _galPedSomenteLeitura();
    const nomeEscolha = _galPed.escolha && G.PREGAS[_galPed.escolha] ? G.PREGAS[_galPed.escolha] : '';
    const opcAlvo = alvos.map((a, i) => `<option value="${i}"${_galPed.alvo && a.ambId == _galPed.alvo.ambId && a.tidx == _galPed.alvo.tidx ? ' selected' : ''}>${escapeHtml(a.rotulo)}</option>`).join('');
    const abas = [['modelos', '🧵 Modelos'], ['fotos', '🖼️ Fotos reais']];
    if (G.SIMULADOR_ATIVO) abas.push(['simular', '📐 Simular na parede']);
    o.innerHTML = `
        <div class="galped-caixa">
            <div class="galped-topo">
                <div>
                    <h3>Galeria</h3>
                    <p>Mostre os modelos ao cliente e escolha a prega. O pedido continua aberto por trás.</p>
                </div>
                <button type="button" class="galped-fechar" aria-label="Fechar a galeria" onclick="fecharGaleriaPedido()">✕</button>
            </div>
            <div class="galped-abas" role="tablist">${abas.map(([id, nome]) =>
                `<button type="button" role="tab" class="galped-aba${_galPed.aba === id ? ' ativa' : ''}" aria-selected="${_galPed.aba === id}" data-aba="${id}">${nome}</button>`).join('')}
            </div>
            <div class="galped-corpo" id="galped-corpo"></div>
            <div class="galped-rodape">
                ${leitura
                    ? '<span class="galped-aviso">🔒 Pedido aprovado: a galeria abre só para mostrar os modelos.</span>'
                    : alvos.length ? `
                    <label class="galped-alvo">Aplicar em
                        <select id="galped-alvo">${opcAlvo}</select>
                    </label>
                    <span class="galped-escolha" id="galped-escolha">${nomeEscolha ? `Modelo: <b>${escapeHtml(nomeEscolha)}</b>` : 'Escolha um modelo de prega'}</span>
                    <button type="button" class="btn btn-success" id="galped-aplicar"${nomeEscolha ? '' : ' disabled'}>✔ Usar no pedido</button>`
                    : '<span class="galped-aviso">Adicione um ambiente ao pedido para aplicar o modelo.</span>'}
            </div>
        </div>`;
    o.querySelectorAll('.galped-aba').forEach(b => b.onclick = () => {
        if (b.dataset.aba === 'simular') { _galPedAbrirSimulador({}); return; }
        _galPed.aba = b.dataset.aba;
        _galPedRender();
    });
    const sel = o.querySelector('#galped-alvo');
    if (sel) sel.onchange = () => { _galPed.alvo = alvos[Number(sel.value)] || null; };
    const ap = o.querySelector('#galped-aplicar');
    if (ap) ap.onclick = _galPedAplicar;
    o.onclick = e => { if (e.target === o) fecharGaleriaPedido(); };
    if (_galPed.aba === 'fotos') _galPedRenderFotos(); else _galPedRenderModelos();
}

function _galPedEscolher(chave) {
    _galPed.escolha = chave;
    document.querySelectorAll('#galped .galped-modelo').forEach(c => {
        const ativo = c.dataset.prega === chave;
        c.classList.toggle('ativo', ativo);
        c.setAttribute('aria-pressed', String(ativo));
    });
    const lbl = document.getElementById('galped-escolha');
    if (lbl) lbl.innerHTML = `Modelo: <b>${escapeHtml(GaleriaCore.PREGAS[chave] || chave)}</b>`;
    const ap = document.getElementById('galped-aplicar');
    if (ap) ap.disabled = false;
}

function _galPedRenderModelos() {
    const corpo = document.getElementById('galped-corpo');
    if (!corpo) return;
    const G = GaleriaCore;
    const m = lerMostruarioSalvo();
    const pregas = m.modelos.pregas.length ? m.modelos.pregas : Object.keys(G.PREGAS);
    const persianas = m.modelos.persianas;
    const cartao = (tipo, chave, nome) => `
        <div class="galped-modelo${tipo === 'prega' && _galPed.escolha === chave ? ' ativo' : ''}" ${tipo === 'prega' ? `data-prega="${escapeHtml(chave)}" role="button" tabindex="0" aria-pressed="${_galPed.escolha === chave}"` : ''}>
            <div class="galped-modelo-img" data-tipo="${tipo}" data-chave="${escapeHtml(chave)}"><span class="galped-carregando"></span></div>
            <div class="galped-modelo-rodape">
                <span class="galped-modelo-nome">${escapeHtml(nome)}</span>
                ${G.SIMULADOR_ATIVO ? `<button type="button" class="galped-modelo-sim" data-tipo="${tipo}" data-chave="${escapeHtml(chave)}" title="Simular este modelo na parede do cliente">📐 Simular</button>` : ''}
            </div>
        </div>`;
    corpo.innerHTML = `
        <div class="galped-grupo-titulo">Cortinas — tipo de prega</div>
        <div class="galped-grade">${pregas.map(k => cartao('prega', k, G.PREGAS[k])).join('')}</div>
        ${persianas.length ? `<div class="galped-grupo-titulo">Persianas</div>
        <div class="galped-grade">${persianas.map(k => cartao('persiana', k, G.PERSIANAS[k])).join('')}</div>` : ''}`;
    corpo.querySelectorAll('.galped-modelo[data-prega]').forEach(c => {
        c.onclick = e => { if (!e.target.closest('.galped-modelo-sim')) _galPedEscolher(c.dataset.prega); };
        c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _galPedEscolher(c.dataset.prega); } };
    });
    corpo.querySelectorAll('.galped-modelo-sim').forEach(b => b.onclick = e => {
        e.stopPropagation();
        if (b.dataset.tipo === 'prega') _galPedEscolher(b.dataset.chave);
        _galPedAbrirSimulador({ [b.dataset.tipo]: b.dataset.chave });
    });
    _galPedPintarImagens(corpo, m);
}

// Imagem de cada modelo: a foto real do mostruario ligada a ele, quando a
// empresa cadastrou; senao, a imagem gerada pelo renderizador 3D.
async function _galPedPintarImagens(corpo, m) {
    const disp = typeof GaleriaImagens !== 'undefined' && await GaleriaImagens.disponivel().catch(() => false);
    const cor = (GaleriaCore.coresDisponiveis(m)[0] || {}).hex || '#f2efe8';
    for (const el of corpo.querySelectorAll('.galped-modelo-img')) {
        const tipo = el.dataset.tipo, chave = el.dataset.chave;
        let url = null;
        if (disp) {
            const foto = (m.fotos || []).find(f => f.liga && f.liga.tipo === tipo && f.liga.valor === chave);
            if (foto) url = await GaleriaImagens.url(foto.imagemId).catch(() => null);
        }
        if (!url && typeof renderizarImagemModelo === 'function') {
            try { url = await renderizarImagemModelo({ tipo, chave, hex: cor, largura: 320, altura: 240, enquadramento: tipo === 'prega' ? 'detalhe' : 'ambiente' }); }
            catch (e) { url = null; }
        }
        if (!document.body.contains(el)) return;   // a aba mudou no meio
        el.innerHTML = url ? `<img src="${url}" alt="">` : `<span class="galped-sem-img">${escapeHtml(tipo === 'prega' ? GaleriaCore.PREGAS[chave] : GaleriaCore.PERSIANAS[chave])}</span>`;
    }
}

async function _galPedRenderFotos() {
    const corpo = document.getElementById('galped-corpo');
    if (!corpo) return;
    corpo.innerHTML = '<div class="galped-vazio"><span class="galped-carregando"></span></div>';
    const m = lerMostruarioSalvo();
    const disp = typeof GaleriaImagens !== 'undefined' && await GaleriaImagens.disponivel().catch(() => false);
    const fotos = [];
    if (disp) for (const f of m.fotos) {
        const url = await GaleriaImagens.url(f.imagemId).catch(() => null);
        if (url) fotos.push(Object.assign({}, f, { url }));
    }
    if (_galPed.aba !== 'fotos') return;
    _galPed.fotos = fotos;
    if (!fotos.length) {
        const podeMontar = temAcesso('configuracoes.empresa', 'completo');
        corpo.innerHTML = `<div class="galped-vazio">
            <div style="font-size:34px">🖼️</div>
            <b>Nenhuma foto real cadastrada ainda</b>
            <span>${disp ? 'As fotos de cortinas instaladas que a empresa cadastrar aparecem aqui.' : 'Este navegador não permite guardar fotos (pode ser uma janela anônima).'}
            ${podeMontar ? ' Cadastre em Configurar Empresa › Galeria e Mostruário.' : ''}</span>
            <span>Enquanto isso, use a aba <b>Modelos</b>.</span>
        </div>`;
        return;
    }
    corpo.innerHTML = GaleriaCore.GRUPOS.map(g => {
        const doGrupo = fotos.filter(f => f.grupo === g.id);
        if (!doGrupo.length) return '';
        return `<div class="galped-grupo-titulo">${escapeHtml(g.nome)}</div>
            <div class="galped-grade galped-grade-fotos">${doGrupo.map(f => `
                <div class="galped-foto" data-id="${escapeHtml(f.id)}" tabindex="0" role="button" aria-label="${escapeHtml(f.legenda || g.nome)}">
                    <img src="${f.url}" alt="" loading="lazy">
                    ${f.legenda ? `<span class="galped-foto-legenda">${escapeHtml(f.legenda)}</span>` : ''}
                    ${f.liga && f.liga.tipo === 'prega' ? `<button type="button" class="galped-foto-usar" data-prega="${escapeHtml(f.liga.valor)}" title="Escolher este modelo">✔ ${escapeHtml(GaleriaCore.PREGAS[f.liga.valor] || f.liga.valor)}</button>` : ''}
                </div>`).join('')}
            </div>`;
    }).join('');
    corpo.querySelectorAll('.galped-foto').forEach(el => {
        const abrir = () => _galPedVisor(fotos.findIndex(f => f.id === el.dataset.id));
        el.onclick = e => { if (!e.target.closest('button')) abrir(); };
        el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
    });
    corpo.querySelectorAll('.galped-foto-usar').forEach(b => b.onclick = e => { e.stopPropagation(); _galPedEscolher(b.dataset.prega); });
}

// Visor em tela cheia da galeria (galeria-tela.js). O "Simular" do visor
// abriria a pagina da galeria: aqui ele abre o simulador sem sair do pedido.
function _galPedVisor(i) {
    if (i < 0 || typeof abrirVisorGaleria !== 'function') return;
    if (!document.getElementById('gal-visor-raiz')) {
        const r = document.createElement('div');
        r.id = 'gal-visor-raiz';
        document.body.appendChild(r);
    }
    _gal.fotos = _galPed.fotos;
    abrirVisorGaleria(i);
}
document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('.gal-visor a.gal-simular');
    if (!a || !document.getElementById('galped') || !GaleriaCore.SIMULADOR_ATIVO) return;
    e.preventDefault();
    const i = (a.getAttribute('href') || '').indexOf('?');
    const p = new URLSearchParams(i >= 0 ? a.getAttribute('href').slice(i + 1) : '');
    const pre = {};
    ['prega', 'persiana', 'trilho'].forEach(k => { if (p.get(k)) pre[k] = p.get(k); });
    if (pre.prega) _galPedEscolher(pre.prega);
    fecharVisorGaleria();
    _galPedAbrirSimulador(pre);
}, true);
document.addEventListener('keydown', e => {
    if (!document.querySelector('.gal-visor') || !document.getElementById('galped')) return;
    if (e.key === 'ArrowRight') _galPassar(1);
    else if (e.key === 'ArrowLeft') _galPassar(-1);
});

// Simulador por cima da galeria; o "← Galeria" dele volta para ca.
function _galPedAbrirSimulador(pre) {
    if (!GaleriaCore.SIMULADOR_ATIVO) return;
    if (typeof abrirSimulador !== 'function') { toast('O simulador não está disponível nesta tela.', 'warning'); return; }
    if (_galPed.escolha && !pre.prega && !pre.persiana) pre = Object.assign({ prega: _galPed.escolha }, pre);
    abrirSimulador(pre);
    const voltar = document.querySelector('#sim .sim-voltar');
    if (voltar) { voltar.textContent = '← Galeria'; voltar.onclick = _galPedVoltarDoSimulador; }
}
function _galPedVoltarDoSimulador() {
    // o modelo que ficou na simulacao vira a escolha (se for cortina)
    const est = window._sim && window._sim.estado;
    if (est && est.produto === 'cortina' && GaleriaCore.PREGAS[est.prega]) _galPed.escolha = est.prega;
    fecharSimulador();
    _galPedRender();
}

function _galPedAplicar() {
    const alvo = _galPed.alvo, chave = _galPed.escolha;
    if (!alvo || !chave) return;
    const sel = document.getElementById(`t-prega-${alvo.ambId}-${alvo.tidx}`);
    if (!sel || sel.disabled) { toast('Este pedido está bloqueado para edição.', 'warning'); return; }
    if (![...sel.options].some(o => o.value === chave)) { toast('Este modelo não existe no pedido.', 'warning'); return; }
    sel.value = chave;
    onPregaTecido(alvo.ambId, alvo.tidx);
    fecharGaleriaPedido();
    const card = document.getElementById(`amb-card-${alvo.ambId}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sel.classList.add('galped-destaque');
        setTimeout(() => sel.classList.remove('galped-destaque'), 1600);
    }
    toast(`${GaleriaCore.PREGAS[chave]} aplicado em ${alvo.rotulo}.`, 'success');
}
