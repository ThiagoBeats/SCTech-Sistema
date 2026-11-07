// Editor de etiquetas de pedido (Configurar Empresa): paleta, palco e propriedades.
// Arrastar com Pointer Events nativos; unidades sempre em mm, grade de 1 mm.
// Alteracoes ficam so na memoria ate "Salvar etiqueta".

const _ETQ_PX_POR_MM_CSS = 96 / 25.4;
const _ETQ_TAMANHOS = { campo: [40, 6], texto: [40, 6], barcode: [45, 12], qrcode: [20, 20], logo: [20, 10], linha: [40, 1] };
const _ETQ_NOMES = { texto: 'Texto livre', logo: 'Logo da empresa', linha: 'Linha', barcode: 'Código de barras', qrcode: 'QR Code' };
const _ETQ_ICONES = { campo: 'Aa', texto: '✏️', logo: '🖼️', linha: '➖', barcode: '║▌', qrcode: '▦' };

const _etq = { modelo: null, selId: null, svgs: {}, escala: 4, podeEditar: false, valores: null, codigo: '', arrasto: null };

function _etqEl(id) { return _etq.modelo.elementos.find(e => e.id === id) || null; }
function _etqSel() { return _etq.selId ? _etqEl(_etq.selId) : null; }
function _etqNome(el) {
    if (el.tipo === 'campo') {
        const c = EtiquetasCore.CAMPOS_ETIQUETA_PEDIDO.find(x => x.campo === el.campo);
        return c ? c.label : el.campo;
    }
    return _ETQ_NOMES[el.tipo] || el.tipo;
}
function _etqClamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Encaixa na grade e mantem o elemento inteiro dentro da etiqueta.
function _etqLimitar(el) {
    const L = _etq.modelo.largura_mm, A = _etq.modelo.altura_mm;
    const g = EtiquetasCore.encaixarNaGrade;
    el.w_mm = _etqClamp(Math.max(1, g(el.w_mm)), 1, L);
    el.h_mm = _etqClamp(Math.max(1, g(el.h_mm)), 1, A);
    el.x_mm = _etqClamp(g(el.x_mm), 0, L - el.w_mm);
    el.y_mm = _etqClamp(g(el.y_mm), 0, A - el.h_mm);
    return el;
}

function _etqNovoId() {
    let n = 0;
    _etq.modelo.elementos.forEach(e => { const m = /^e(\d+)$/.exec(e.id); if (m) n = Math.max(n, +m[1]); });
    let id;
    do { id = 'e' + (++n); } while (_etqEl(id));
    return id;
}

function _etqNovoElemento(tipo, campo) {
    const t = _ETQ_TAMANHOS[tipo] || [20, 10];
    const el = { id: _etqNovoId(), tipo, x_mm: 0, y_mm: 0, w_mm: t[0], h_mm: t[1] };
    if (tipo === 'campo') el.campo = campo;
    if (tipo === 'texto') el.texto = 'Texto';
    if (tipo === 'campo' || tipo === 'texto') {
        el.fonte_pt = 10; el.negrito = false; el.alinhamento = 'esq';
        if (tipo === 'campo') el.mostrar_rotulo = true;
    }
    return el;
}

// ---- montagem do card ----
function iniciarEditorEtiquetas() {
    const raiz = document.getElementById('etq-editor');
    if (!raiz || typeof EtiquetasCore === 'undefined') return;
    const C = EtiquetasCore;
    _etq.podeEditar = typeof temAcesso === 'function' ? temAcesso('configuracoes.empresa', 'completo') : true;
    _etq.modelo = JSON.parse(JSON.stringify(C.lerConfigEtiquetas(localStorage.getItem('sc_etiqueta_cfg')).modelos.pedido));
    const ex = C.pedidoExemplo();
    const emp = typeof getEmpresa === 'function' ? getEmpresa() : {};
    _etq.valores = C.valoresEtiquetaPedido(ex.pedido, ex.cliente, 1, 3, emp.logo_base64 || '');
    _etq.codigo = C.montarCodigoVolume(ex.pedido.id, 1, 3);

    const chip = (tipo, campo, rotulo) =>
        `<button type="button" class="etq-chip" data-tipo="${tipo}" data-campo="${campo || ''}"${_etq.podeEditar ? '' : ' disabled'}>` +
        `<span class="etq-chip-ic">${_ETQ_ICONES[tipo]}</span>${escapeHtml(rotulo)}</button>`;
    const opcoes = C.FORMATOS_ETIQUETA.map(f => `<option value="${f.id}">${escapeHtml(f.label)}</option>`).join('') +
        '<option value="custom">Personalizado</option>';
    const dis = _etq.podeEditar ? '' : ' disabled';

    raiz.innerHTML = `
        <div class="etq-editor-barra">
            <label class="etq-editor-formato">Tamanho
                <select id="etq-formato"${dis}>${opcoes}</select></label>
            <span id="etq-custom" class="etq-editor-custom" hidden>
                <input type="number" id="etq-largura" min="10" max="300" step="1"${dis} aria-label="Largura em mm"> ×
                <input type="number" id="etq-altura" min="10" max="300" step="1"${dis} aria-label="Altura em mm"> mm
            </span>
            <span class="etq-editor-acoes">
                <button type="button" class="btn btn-success btn-sm" onclick="salvarModeloEtiqueta()"${dis}>💾 Salvar etiqueta</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="restaurarModeloEtiqueta()"${dis}>↩ Restaurar padrão</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="imprimirTesteEtiqueta()">🖨️ Imprimir teste</button>
            </span>
        </div>
        ${_etq.podeEditar ? '' : '<div class="etq-editor-ro">Somente visualização: você não tem permissão para alterar a etiqueta.</div>'}
        <div id="etq-falha" class="etq-editor-falha" hidden></div>
        <div class="etq-editor-colunas">
            <div id="etq-paleta" class="etq-editor-paleta">
                <div class="etq-editor-grupo">Dados do pedido</div>
                ${C.CAMPOS_ETIQUETA_PEDIDO.map(c => chip('campo', c.campo, c.label)).join('')}
                <div class="etq-editor-grupo">Elementos</div>
                ${['logo', 'texto', 'linha', 'barcode', 'qrcode'].map(t => chip(t, '', _ETQ_NOMES[t])).join('')}
                <div class="etq-editor-dica">Arraste para a etiqueta.</div>
            </div>
            <div id="etq-palco" class="etq-editor-palco" tabindex="0" aria-label="Etiqueta"></div>
            <div id="etq-props" class="etq-editor-props"></div>
        </div>`;

    const sel = document.getElementById('etq-formato');
    sel.addEventListener('change', _etqTrocarFormato);
    ['etq-largura', 'etq-altura'].forEach(id => document.getElementById(id).addEventListener('change', _etqFormatoPersonalizado));
    raiz.querySelectorAll('.etq-chip').forEach(c => {
        c.addEventListener('pointerdown', _etqInicioPaleta);
        // Teclado (Enter/Espaco): sem arrasto, entra no canto superior esquerdo.
        c.addEventListener('click', e => { if (e.detail === 0) _etqSoltarNovo(c.dataset.tipo, c.dataset.campo, null); });
    });
    const palco = document.getElementById('etq-palco');
    palco.addEventListener('pointerdown', _etqInicioPalco);
    palco.addEventListener('keydown', _etqTeclado);
    window.addEventListener('resize', () => _etqRender());

    _etqRender();
    _etqCarregarCodigos();
}

function _etqCarregarCodigos() {
    garantirLibsCodigo().then(() => {
        _etq.svgs = { barcode: svgCodigoBarras(_etq.codigo), qrcode: svgQrCode(_etq.codigo) };
        document.getElementById('etq-falha').hidden = true;
        _etqRenderPalco();
    }).catch(() => {
        // Sem as bibliotecas o palco mostra o lugar reservado; o resto continua funcionando.
        const f = document.getElementById('etq-falha');
        f.textContent = '⚠ ' + MSG_FALHA_CONEXAO_CODIGOS;
        f.hidden = false;
    });
}

// ---- desenho ----
function _etqRender() {
    _etqRenderBarra();
    _etqRenderPalco();
    _etqRenderProps();
}

function _etqRenderBarra() {
    const m = _etq.modelo;
    const sel = document.getElementById('etq-formato');
    const fmt = EtiquetasCore.FORMATOS_ETIQUETA.some(f => f.id === m.formato) ? m.formato : 'custom';
    if (sel.value !== fmt && !sel.dataset.custom) sel.value = fmt;
    const custom = sel.value === 'custom';
    document.getElementById('etq-custom').hidden = !custom;
    if (custom) {
        document.getElementById('etq-largura').value = m.largura_mm;
        document.getElementById('etq-altura').value = m.altura_mm;
    }
}

function _etqRenderPalco() {
    const palco = document.getElementById('etq-palco');
    if (!palco) return;
    const m = _etq.modelo;
    const disp = Math.max(120, (palco.clientWidth || 400) - 32);
    const s = _etq.escala = Math.max(1, Math.min(6, disp / m.largura_mm, 520 / m.altura_mm));
    const camadas = m.elementos.map(el => {
        let top = el.y_mm * s, alt = el.h_mm * s;
        // A linha desenha 0,3 mm: a area de clique ganha folga para cima e para baixo.
        if (el.tipo === 'linha') { const folga = Math.max(0, 3 * s - alt) / 2; top -= folga; alt += 2 * folga; }
        const vazio = el.tipo === 'logo' && !_etq.valores.logo ? '<span class="etq-el-vazio">Logo</span>' : '';
        return `<div class="etq-el${el.id === _etq.selId ? ' sel' : ''}" data-id="${escapeHtml(el.id)}" title="${escapeHtml(_etqNome(el))}"` +
            ` style="left:${el.x_mm * s}px;top:${top}px;width:${el.w_mm * s}px;height:${alt}px">${vazio}` +
            (_etq.podeEditar ? '<span class="etq-alca"></span>' : '') + '</div>';
    }).join('');
    palco.innerHTML =
        `<div class="etq-editor-folha" style="width:${m.largura_mm * s}px;height:${m.altura_mm * s}px">` +
        `<div class="etq-editor-render" style="transform:scale(${s / _ETQ_PX_POR_MM_CSS})">` +
        EtiquetasCore.htmlEtiqueta(m, _etq.valores, _etq.svgs) + '</div>' +
        `<div class="etq-editor-grade" style="--etq-mm:${s}px"></div>${camadas}</div>` +
        `<div class="etq-editor-medida">${m.largura_mm} × ${m.altura_mm} mm</div>`;
}

function _etqRenderProps() {
    const box = document.getElementById('etq-props');
    if (!box) return;
    const el = _etqSel();
    if (!el) {
        box.innerHTML = '<div class="etq-editor-props-vazio">Clique num elemento da etiqueta para mudar posição, tamanho e texto.</div>';
        return;
    }
    const dis = _etq.podeEditar ? '' : ' disabled';
    const num = (id, rot, v) => `<label class="etq-prop">${rot}<input type="number" id="etq-prop-${id}" data-prop="${id}" value="${v}" step="1"${dis}></label>`;
    let h = `<div class="etq-editor-props-titulo">${escapeHtml(_etqNome(el))}</div>
        <div class="etq-prop-grade">${num('x', 'X (mm)', el.x_mm)}${num('y', 'Y (mm)', el.y_mm)}${num('w', 'Largura', el.w_mm)}${num('h', 'Altura', el.h_mm)}</div>`;
    if (el.tipo === 'texto') {
        h += `<label class="etq-prop">Texto<input type="text" id="etq-prop-texto" data-prop="texto" value="${escapeHtml(el.texto || '')}"${dis}></label>`;
    }
    if (el.tipo === 'campo' || el.tipo === 'texto') {
        const al = el.alinhamento || 'esq';
        const op = (v, r) => `<option value="${v}"${al === v ? ' selected' : ''}>${r}</option>`;
        h += `<div class="etq-prop-grade">${num('fonte', 'Fonte (pt)', el.fonte_pt || 10)}
            <label class="etq-prop">Alinhar<select id="etq-prop-alinhamento" data-prop="alinhamento"${dis}>${op('esq', 'Esquerda')}${op('centro', 'Centro')}${op('dir', 'Direita')}</select></label></div>
            <label class="etq-prop-check"><input type="checkbox" id="etq-prop-negrito" data-prop="negrito"${el.negrito ? ' checked' : ''}${dis}> Negrito</label>`;
        if (el.tipo === 'campo' && EtiquetasCore.ROTULOS_CAMPO[el.campo]) {
            h += `<label class="etq-prop-check"><input type="checkbox" id="etq-prop-rotulo" data-prop="mostrar_rotulo"${el.mostrar_rotulo !== false ? ' checked' : ''}${dis}> Mostrar rótulo ("${escapeHtml(EtiquetasCore.ROTULOS_CAMPO[el.campo].trim())}")</label>`;
        }
    }
    h += `<div id="etq-avisos"></div>`;
    if (_etq.podeEditar) h += '<button type="button" class="btn btn-outline btn-sm etq-prop-remover" onclick="_etqRemover()">🗑 Remover</button>';
    box.innerHTML = h;
    box.querySelectorAll('[data-prop]').forEach(i => {
        i.addEventListener('input', () => _etqAlterarProp(i, false));
        i.addEventListener('change', () => _etqAlterarProp(i, true));
    });
    _etqRenderAvisos();
}

function _etqRenderAvisos() {
    const box = document.getElementById('etq-avisos');
    const el = _etqSel();
    if (!box || !el) return;
    const av = EtiquetasCore.avisosLegibilidade(el, _etq.codigo);
    box.innerHTML = av.map(a => `<div class="etq-editor-aviso">⚠ ${escapeHtml(a)}</div>`).join('');
}

// Aplica um campo de propriedade. Durante a digitacao nao reescreve o painel (nao perde o cursor).
function _etqAlterarProp(input, final) {
    const el = _etqSel();
    if (!el || !_etq.podeEditar) return;
    const p = input.dataset.prop;
    if (input.type === 'checkbox') el[p] = input.checked;
    else if (p === 'texto' || p === 'alinhamento') el[p] = input.value;
    else {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) { if (final) _etqRenderProps(); return; }
        const L = _etq.modelo.largura_mm, A = _etq.modelo.altura_mm;
        const r = Math.round(v);
        if (p === 'fonte') el.fonte_pt = _etqClamp(r, 4, 72);
        else if (p === 'x') el.x_mm = r;
        else if (p === 'y') el.y_mm = r;
        else if (p === 'w') { el.w_mm = _etqClamp(r, 1, L); el.x_mm = Math.min(el.x_mm, L - el.w_mm); }
        else if (p === 'h') { el.h_mm = _etqClamp(r, 1, A); el.y_mm = Math.min(el.y_mm, A - el.h_mm); }
        _etqLimitar(el);
    }
    _etqRenderPalco();
    if (final) _etqRenderProps(); else _etqRenderAvisos();
}

function _etqSelecionar(id) {
    if (_etq.selId === id) return;
    _etq.selId = id;
    _etqRenderPalco();
    _etqRenderProps();
}

function _etqRemover() {
    if (!_etq.podeEditar || !_etq.selId) return;
    _etq.modelo.elementos = _etq.modelo.elementos.filter(e => e.id !== _etq.selId);
    _etq.selId = null;
    _etqRenderPalco();
    _etqRenderProps();
}

// ---- formato ----
function _etqAplicarFormato(l, a) {
    const r = EtiquetasCore.ajustarAoFormato(_etq.modelo, l, a);
    _etq.modelo = r.modelo;
    if (r.ajustados.length) toast(`${r.ajustados.length} elemento(s) foram ajustados para caber no novo tamanho`, 'warning');
    _etqRender();
}

function _etqTrocarFormato() {
    const sel = document.getElementById('etq-formato');
    if (sel.value === 'custom') {
        sel.dataset.custom = '1';
        _etqRenderBarra();
        return;
    }
    delete sel.dataset.custom;
    const f = EtiquetasCore.FORMATOS_ETIQUETA.find(x => x.id === sel.value);
    if (f) _etqAplicarFormato(f.largura_mm, f.altura_mm);
}

function _etqFormatoPersonalizado() {
    const ler = id => _etqClamp(Math.round(parseFloat(document.getElementById(id).value)) || 10, 10, 300);
    _etqAplicarFormato(ler('etq-largura'), ler('etq-altura'));
}

// ---- arrastar (Pointer Events) ----
function _etqPontoNoPalco(x, y) {
    const r = document.getElementById('etq-palco').getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function _etqIniciarArrasto(e, dados) {
    _etq.arrasto = Object.assign({ x0: e.clientX, y0: e.clientY }, dados);
    window.addEventListener('pointermove', _etqMoverArrasto);
    window.addEventListener('pointerup', _etqFimArrasto);
    window.addEventListener('pointercancel', _etqFimArrasto);
}

function _etqInicioPaleta(e) {
    if (!_etq.podeEditar || e.button !== 0) return;
    e.preventDefault();
    const chip = e.currentTarget;
    const f = document.createElement('div');
    f.className = 'etq-editor-fantasma';
    f.textContent = chip.textContent;
    f.style.left = e.clientX + 'px';
    f.style.top = e.clientY + 'px';
    document.body.appendChild(f);
    _etqIniciarArrasto(e, { modo: 'novo', tipo: chip.dataset.tipo, campo: chip.dataset.campo, fantasma: f });
}

function _etqInicioPalco(e) {
    if (e.button !== 0) return;
    const camada = e.target.closest('.etq-el');
    const palco = document.getElementById('etq-palco');
    palco.focus({ preventScroll: true });
    if (!camada) { _etqSelecionar(null); return; }
    e.preventDefault();
    const id = camada.dataset.id;
    _etqSelecionar(id);
    if (!_etq.podeEditar) return;
    const el = _etqEl(id);
    const redim = !!e.target.closest('.etq-alca');
    _etqIniciarArrasto(e, { modo: redim ? 'redim' : 'mover', id, x: el.x_mm, y: el.y_mm, w: el.w_mm, h: el.h_mm });
}

function _etqMoverArrasto(e) {
    const a = _etq.arrasto;
    if (!a) return;
    if (a.modo === 'novo') {
        a.fantasma.style.left = e.clientX + 'px';
        a.fantasma.style.top = e.clientY + 'px';
        document.getElementById('etq-palco').classList.toggle('alvo', _etqPontoNoPalco(e.clientX, e.clientY));
        return;
    }
    const el = _etqEl(a.id);
    if (!el) return;
    const dx = (e.clientX - a.x0) / _etq.escala, dy = (e.clientY - a.y0) / _etq.escala;
    const antes = [el.x_mm, el.y_mm, el.w_mm, el.h_mm].join();
    const L = _etq.modelo.largura_mm, A = _etq.modelo.altura_mm, g = EtiquetasCore.encaixarNaGrade;
    if (a.modo === 'mover') {
        el.x_mm = a.x + dx; el.y_mm = a.y + dy;
        _etqLimitar(el);
    } else {
        el.w_mm = _etqClamp(Math.max(1, g(a.w + dx)), 1, L - el.x_mm);
        el.h_mm = _etqClamp(Math.max(1, g(a.h + dy)), 1, A - el.y_mm);
    }
    if (antes !== [el.x_mm, el.y_mm, el.w_mm, el.h_mm].join()) { _etqRenderPalco(); _etqRenderProps(); }
}

function _etqFimArrasto(e) {
    const a = _etq.arrasto;
    _etq.arrasto = null;
    window.removeEventListener('pointermove', _etqMoverArrasto);
    window.removeEventListener('pointerup', _etqFimArrasto);
    window.removeEventListener('pointercancel', _etqFimArrasto);
    if (!a || a.modo !== 'novo') return;
    a.fantasma.remove();
    document.getElementById('etq-palco').classList.remove('alvo');
    if (e.type === 'pointerup' && _etqPontoNoPalco(e.clientX, e.clientY)) _etqSoltarNovo(a.tipo, a.campo, { x: e.clientX, y: e.clientY });
}

// Cria o elemento centrado no ponto solto (ou no canto, sem ponto), ja na grade e dentro da etiqueta.
function _etqSoltarNovo(tipo, campo, ponto) {
    if (!_etq.podeEditar) return;
    const el = _etqNovoElemento(tipo, campo);
    if (ponto) {
        const r = document.querySelector('#etq-palco .etq-editor-folha').getBoundingClientRect();
        el.x_mm = (ponto.x - r.left) / _etq.escala - el.w_mm / 2;
        el.y_mm = (ponto.y - r.top) / _etq.escala - el.h_mm / 2;
    }
    _etq.modelo.elementos.push(_etqLimitar(el));
    _etq.selId = el.id;
    _etqRenderPalco();
    _etqRenderProps();
    document.getElementById('etq-palco').focus({ preventScroll: true });
}

function _etqTeclado(e) {
    const el = _etqSel();
    if (!el || !_etq.podeEditar) return;
    const passo = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (passo) {
        e.preventDefault();
        el.x_mm += passo[0]; el.y_mm += passo[1];
        _etqLimitar(el);
        _etqRenderPalco();
        _etqRenderProps();
    } else if (e.key === 'Delete') {
        e.preventDefault();
        _etqRemover();
    }
}

// ---- acoes da barra ----
function salvarModeloEtiqueta() {
    if (!_etq.podeEditar || !_etq.modelo) return;
    let cfg = null;
    try { cfg = JSON.parse(localStorage.getItem('sc_etiqueta_cfg')); } catch (e) { cfg = null; }
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};
    if (!cfg.modelos || typeof cfg.modelos !== 'object') cfg.modelos = {};
    cfg.modelos.pedido = JSON.parse(JSON.stringify(_etq.modelo));
    localStorage.setItem('sc_etiqueta_cfg', JSON.stringify(cfg));
    toast('Etiqueta salva!');
}

async function restaurarModeloEtiqueta() {
    if (!_etq.podeEditar || !_etq.modelo) return;
    const ok = await showConfirm('Voltar a etiqueta ao modelo padrão? As mudanças que não foram salvas serão perdidas.', '↩', 'Restaurar', 'Cancelar');
    if (!ok) return;
    _etq.modelo = EtiquetasCore.modeloPadraoPedido(_etq.modelo.largura_mm, _etq.modelo.altura_mm);
    _etq.selId = null;
    _etqRender();
}

// Ligado na impressao de etiquetas (Task 8).
function imprimirTesteEtiqueta() {
    if (typeof imprimirEtiquetasHTML !== 'function') { toast('A impressão de teste ainda não está disponível.', 'warning'); return; }
}
