// Simulador de cortinas e persianas sobre a foto da parede do cliente.
// Tela unica em WebGL (Three.js): a foto e o fundo; o produto e desenhado em 3D
// (dobras com luz e sombra) num alvo de textura e projetado no quadrilatero da
// foto pela homografia, no shader — perspectiva correta, e imagem/video saem
// do mesmo canvas. Facilidade de uso manda: foto -> ja aparece a cortina.
const _sim = {
    pronto: false, gl: false, foto: null, aba: 'modelo', recolhida: false,
    estado: { produto: 'cortina', prega: 'Wave Botao', persiana: 'rolo', corId: null, trilho: '', abertura: 'central', ate: 'chao', aberto: 0, cantos: null, barra: null },
    m: null, cores: [], texturas: {}, layout: null, pendente: false, arrasto: null
};
window._sim = _sim;

const SIM_RT = 1024;
const SIM_TOPO_TRILHO = 0.035;

// ---------- montagem da tela ----------
function _simMontar() {
    const raiz = document.getElementById('sim');
    raiz.innerHTML = `
        <div class="sim-palco" id="sim-palco">
            <canvas class="sim-canvas" id="sim-canvas"></canvas>
            <svg class="sim-contorno" id="sim-contorno" aria-hidden="true"><polygon points=""/></svg>
            <div class="sim-alcas" id="sim-alcas"></div>
            <div class="sim-inicio" id="sim-inicio">
                <h3>Foto da parede do cliente</h3>
                <p>Tire uma foto da janela onde vai a cortina, de frente e um pouco afastado.</p>
                <label class="sim-btn-grande" for="sim-foto-camera">📷 Tirar foto</label>
                <label class="sim-btn-grande sim-btn-claro" for="sim-foto-arquivo">🖼️ Escolher foto</label>
            </div>
            <div class="sim-dica" id="sim-dica" hidden>Arraste os <b>cantos amarelos</b> até a janela.<br>Depois arraste a cortina para abrir e fechar.</div>
            <div class="sim-sem-3d" id="sim-sem-3d" hidden>Este aparelho não consegue mostrar o simulador 3D. Tente em outro navegador (Chrome ou Safari atualizados).</div>
            <div class="sim-topo">
                <button type="button" class="sim-voltar">← Galeria</button>
                <label class="sim-trocar" for="sim-foto-arquivo" id="sim-trocar" hidden>📷 Trocar foto</label>
            </div>
            <input type="file" id="sim-foto-camera" accept="image/*" capture="environment" hidden>
            <input type="file" id="sim-foto-arquivo" accept="image/*" hidden>
        </div>
        <div class="sim-gaveta" id="sim-gaveta">
            <button type="button" class="sim-puxador" aria-label="Mostrar ou esconder as opções"><span></span></button>
            <div class="sim-abas" role="tablist"></div>
            <div class="sim-opcoes" id="sim-opcoes"></div>
            <div class="sim-acoes" id="sim-acoes"></div>
        </div>`;
    raiz.querySelector('.sim-voltar').onclick = () => { history.replaceState(null, '', 'galeria.html'); window.dispatchEvent(new HashChangeEvent('hashchange')); };
    raiz.querySelector('.sim-puxador').onclick = () => { _sim.recolhida = !_sim.recolhida; _simRenderGaveta(); _simLayout(); };
    ['sim-foto-camera', 'sim-foto-arquivo'].forEach(id => {
        const inp = document.getElementById(id);
        inp.addEventListener('change', () => { if (inp.files[0]) _simCarregarFoto(inp.files[0]); inp.value = ''; });
    });
    const palco = document.getElementById('sim-palco');
    palco.addEventListener('pointerdown', _simPonteiroBaixo);
    palco.addEventListener('pointermove', _simPonteiroMove);
    palco.addEventListener('pointerup', _simPonteiroCima);
    palco.addEventListener('pointercancel', _simPonteiroCima);
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => _simLayout()).observe(palco);
    window.addEventListener('resize', () => _simLayout());
    _simIniciar3D();
    _sim.pronto = true;
}

function abrirSimulador(pre) {
    const raiz = document.getElementById('sim');
    if (!raiz) return;
    if (!_sim.pronto) _simMontar();
    _sim.m = lerMostruarioSalvo();
    _sim.cores = GaleriaCore.coresDisponiveis(_sim.m);
    const e = _sim.estado;
    if (!_sim.cores.some(c => c.id === e.corId)) e.corId = _sim.cores[0].id;
    const pregas = _simPregas();
    if (!pregas.includes(e.prega)) e.prega = pregas.includes('Wave Botao') ? 'Wave Botao' : pregas[0];
    const trilhos = _sim.m.modelos.trilhos;
    if (!trilhos.includes(e.trilho)) e.trilho = trilhos[0] || '';
    pre = pre || {};
    if (pre.prega && GaleriaCore.PREGAS[pre.prega]) { e.produto = 'cortina'; e.prega = pre.prega; e.aberto = 0; _sim.aba = 'cor'; }
    if (pre.persiana && GaleriaCore.PERSIANAS[pre.persiana]) { e.produto = 'persiana'; e.persiana = pre.persiana; e.aberto = 0; _sim.aba = 'cor'; }
    if (pre.trilho) { e.produto = 'cortina'; e.trilho = pre.trilho; _sim.aba = 'cor'; }
    raiz.hidden = false;
    document.body.classList.add('sim-aberto');
    document.getElementById('sim-sem-3d').hidden = _sim.gl;
    _simRenderGaveta();
    _simLayout();
}

function fecharSimulador() {
    const raiz = document.getElementById('sim');
    if (!raiz || raiz.hidden) return;
    raiz.hidden = true;
    document.body.classList.remove('sim-aberto');
}

function _simPregas() {
    const p = _sim.m.modelos.pregas;
    return p.length ? p.slice() : Object.keys(GaleriaCore.PREGAS);
}

// ---------- gaveta ----------
function _simRenderGaveta() {
    const e = _sim.estado, G = GaleriaCore;
    const gav = document.getElementById('sim-gaveta');
    gav.classList.toggle('sim-gaveta-recolhida', _sim.recolhida);
    const cortina = e.produto === 'cortina';
    const abas = [['modelo', 'Modelo'], ['cor', 'Cor'], ['trilho', 'Trilho'], ['abertura', 'Abertura']];
    const visivel = id => id === 'modelo' || id === 'cor' || (cortina && (id === 'abertura' || (id === 'trilho' && _sim.m.modelos.trilhos.length)));
    if (!visivel(_sim.aba)) _sim.aba = 'modelo';
    gav.querySelector('.sim-abas').innerHTML = abas.map(([id, nome]) =>
        `<button type="button" role="tab" class="sim-aba${_sim.aba === id ? ' ativa' : ''}" data-aba="${id}" aria-selected="${_sim.aba === id}"${visivel(id) ? '' : ' hidden'}>${nome}</button>`).join('');
    gav.querySelectorAll('.sim-aba').forEach(b => b.onclick = () => { _sim.aba = b.dataset.aba; _simRenderGaveta(); });
    const op = (campo, valor, rotulo, ativo, extra) => `<button type="button" class="sim-op${ativo ? ' ativa' : ''}" data-campo="${campo}" data-valor="${escapeHtml(valor)}" aria-pressed="${ativo}">${extra || ''}<span>${escapeHtml(rotulo)}</span></button>`;
    let html = '';
    if (_sim.aba === 'modelo') {
        const persianas = _sim.m.modelos.persianas;
        html = `<div class="sim-grupo-rotulo">Cortinas</div><div class="sim-lista">${_simPregas().map(k =>
            op('modelo', 'prega:' + k, G.PREGAS[k], cortina && e.prega === k, _simIconeModelo('prega', k))).join('')}</div>`
            + (persianas.length ? `<div class="sim-grupo-rotulo">Persianas</div><div class="sim-lista">${persianas.map(k =>
            op('modelo', 'persiana:' + k, G.PERSIANAS[k], !cortina && e.persiana === k, _simIconeModelo('persiana', k))).join('')}</div>` : '');
    } else if (_sim.aba === 'cor') {
        html = `<div class="sim-lista sim-lista-cores">${_sim.cores.map(c => `<button type="button" class="sim-cor${e.corId === c.id ? ' ativa' : ''}" data-valor="${escapeHtml(c.id)}" aria-pressed="${e.corId === c.id}" title="${escapeHtml(c.nome)}">
            <span class="sim-cor-amostra" style="background:${c.hex}" data-textura="${escapeHtml(c.texturaId || '')}"></span><span>${escapeHtml(c.nome || c.hex)}</span></button>`).join('')}</div>`;
    } else if (_sim.aba === 'trilho') {
        html = `<div class="sim-lista">${_sim.m.modelos.trilhos.map(t => op('trilho', t, t, e.trilho === t)).join('')}</div>`;
    } else if (_sim.aba === 'abertura') {
        html = `<div class="sim-grupo-rotulo">Para onde abre</div><div class="sim-lista">${G.ABERTURAS.map(a => op('abertura', a, G.NOMES_ABERTURA[a], e.abertura === a)).join('')}</div>
            <div class="sim-grupo-rotulo">Altura</div><div class="sim-lista">${op('ate', 'chao', 'Até o chão', e.ate === 'chao')}${op('ate', 'janela', 'Até a janela', e.ate === 'janela')}</div>`;
    }
    const caixa = document.getElementById('sim-opcoes');
    caixa.innerHTML = html;
    caixa.querySelectorAll('.sim-op').forEach(b => b.onclick = () => _simEscolher(b.dataset.campo, b.dataset.valor));
    caixa.querySelectorAll('.sim-cor').forEach(b => b.onclick = () => _simEscolher('cor', b.dataset.valor));
    caixa.querySelectorAll('.sim-cor-amostra[data-textura]').forEach(async s => {
        if (!s.dataset.textura) return;
        const u = await GaleriaImagens.url(s.dataset.textura);
        if (u) s.style.backgroundImage = `url('${u}')`;
    });
}

function _simIconeModelo(tipo, k) {
    // miniatura simples: ondas para pregas, faixas para persianas
    if (tipo === 'prega') {
        const amp = { 'Wave Botao': 5, 'Wave Plus': 4, 'Americana': 3, 'Franzido': 2, 'Macho-Femea': 3, 'Painel': 0 }[k];
        const d = amp ? `M2 ${12} ` + Array.from({ length: 6 }, (_, i) => `Q ${5 + i * 6} ${12 - amp} ${8 + i * 6} 12 T ${14 + i * 6} 12`).slice(0, 3).join(' ') : 'M2 12 H 38';
        return `<svg class="sim-icone" viewBox="0 0 40 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/><line x1="2" y1="4" x2="38" y2="4" stroke="currentColor" stroke-width="2"/></svg>`;
    }
    const linhas = { rolo: [8], romana: [9, 14, 19], double: [8, 12, 16, 20] }[k];
    return `<svg class="sim-icone" viewBox="0 0 40 24" aria-hidden="true"><rect x="6" y="3" width="28" height="4" rx="2" fill="currentColor"/>${linhas.map(y => `<line x1="8" y1="${y}" x2="32" y2="${y}" stroke="currentColor" stroke-width="${k === 'double' ? 2.5 : 1.5}"/>`).join('')}</svg>`;
}

function _simEscolher(campo, valor) {
    const e = _sim.estado;
    if (campo === 'modelo') {
        const i = valor.indexOf(':'), tipo = valor.slice(0, i), k = valor.slice(i + 1);
        if (tipo === 'prega') { e.produto = 'cortina'; e.prega = k; } else { e.produto = 'persiana'; e.persiana = k; }
        e.aberto = 0;
    } else if (campo === 'cor') e.corId = valor;
    else if (campo === 'trilho') e.trilho = valor;
    else if (campo === 'abertura') e.abertura = valor;
    else if (campo === 'ate') e.ate = valor;
    _simRenderGaveta();
    _simAgendar();
}

// ---------- foto ----------
async function _simCarregarFoto(arquivo) {
    try {
        const blob = await GaleriaImagens.reduzirImagem(arquivo, GaleriaCore.MAX_FOTO, 0.9);
        const bm = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        c.width = bm.width; c.height = bm.height;
        c.getContext('2d').drawImage(bm, 0, 0);
        if (bm.close) bm.close();
        const w = c.width, h = c.height;
        _sim.foto = { w, h, canvas: c, luz: _simLuzMedia(c) };
        _sim.estado.cantos = [[w * 0.3, h * 0.25], [w * 0.7, h * 0.25], [w * 0.7, h * 0.6], [w * 0.3, h * 0.6]];
        _sim.estado.aberto = 0;
        _sim.estado.barra = null;
        if (_sim.gl) _simFotoTextura();
        document.getElementById('sim-inicio').hidden = true;
        document.getElementById('sim-trocar').hidden = false;
        let viu = false;
        try { viu = localStorage.getItem('sc_sim_dica') === '1'; } catch (e) { viu = false; }
        document.getElementById('sim-dica').hidden = viu;
        _simLayout();
    } catch (e) {
        toast('Não foi possível abrir essa foto. Tente outra.', 'error', 4000);
    }
}

// Brilho medio da foto (0..1): a cortina acompanha a luz da sala.
function _simLuzMedia(c) {
    const p = document.createElement('canvas'); p.width = 24; p.height = 24;
    const g = p.getContext('2d'); g.drawImage(c, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / (d.length / 4) / 255;
}

// ---------- geometria da tela ----------
// Foto "contida" na area livre do palco (no celular, acima da gaveta).
function _simLayout() {
    const palco = document.getElementById('sim-palco');
    if (!palco || document.getElementById('sim').hidden) return;
    const W = palco.clientWidth, H = palco.clientHeight;
    const gav = document.getElementById('sim-gaveta');
    // no PC (>= 900 px, mesma regra do CSS) a gaveta fica ao lado e nao cobre a foto
    const lado = window.matchMedia('(min-width: 900px)').matches;
    const livreH = lado ? H : Math.max(120, H - gav.offsetHeight);
    const topo = 52;
    _sim.layout = { W, H, x: 0, y: 0, s: 1 };
    if (_sim.foto) {
        const altura = Math.max(80, livreH - topo - 8);
        const s = Math.min(W / _sim.foto.w, altura / _sim.foto.h);
        _sim.layout = { W, H, s, x: (W - _sim.foto.w * s) / 2, y: topo + (altura - _sim.foto.h * s) / 2 };
    }
    if (_sim.gl) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        _sim.renderer.setPixelRatio(dpr);
        _sim.renderer.setSize(W, H, false);
        _sim.camera.right = W; _sim.camera.bottom = -H; _sim.camera.updateProjectionMatrix();
    }
    _simAgendar();
}

function _simParaTelaLocal(p) {
    const L = _sim.layout;
    return [L.x + p[0] * L.s, L.y + p[1] * L.s];
}
_sim.paraTela = p => {
    const r = document.getElementById('sim-palco').getBoundingClientRect();
    const q = _simParaTelaLocal(p);
    return [r.left + q[0], r.top + q[1]];
};
function _simDaTela(cx, cy) {
    const r = document.getElementById('sim-palco').getBoundingClientRect(), L = _sim.layout;
    return [(cx - r.left - L.x) / L.s, (cy - r.top - L.y) / L.s];
}
// Onde fica a barra da cortina "ate o chao": arrastavel; enquanto nao for
// mexida, estima o chao a quase uma altura de janela abaixo dela.
function _simBarra() {
    const e = _sim.estado, q = e.cantos;
    if (e.barra !== null) return e.barra;
    const base = Math.max(q[2][1], q[3][1]), alt = base - Math.min(q[0][1], q[1][1]);
    return Math.min(_sim.foto.h, base + alt * 0.95);
}
function _simArea() {
    const e = _sim.estado;
    return GaleriaCore.areaProduto(e.cantos, { produto: e.produto, ate: e.ate }, _simBarra());
}
function _simMostraBarra() {
    const e = _sim.estado;
    return e.produto === 'cortina' && e.ate === 'chao';
}

// ---------- interacao ----------
function _simDentro(p, q) {
    let dentro = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        if (((q[i][1] > p[1]) !== (q[j][1] > p[1])) && (p[0] < (q[j][0] - q[i][0]) * (p[1] - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0])) dentro = !dentro;
    }
    return dentro;
}

function _simEsconderDica() {
    const d = document.getElementById('sim-dica');
    if (d && !d.hidden) { d.hidden = true; try { localStorage.setItem('sc_sim_dica', '1'); } catch (e) { /* sem armazenamento */ } }
}

function _simPonteiroBaixo(ev) {
    if (!_sim.foto || ev.target.closest('.sim-topo, .sim-inicio, label, button')) return;
    _simEsconderDica();
    const alca = ev.target.closest('.sim-alca');
    if (alca && alca.dataset.i === 'barra') {
        _sim.arrasto = { tipo: 'barra' };
    } else if (alca) {
        _sim.arrasto = { tipo: 'canto', i: Number(alca.dataset.i) };
    } else {
        const p = _simDaTela(ev.clientX, ev.clientY);
        const area = _simArea();
        if (!_simDentro(p, area)) return;
        const centroX = (area[0][0] + area[1][0] + area[2][0] + area[3][0]) / 4;
        _sim.arrasto = {
            tipo: 'abrir', x0: ev.clientX, y0: ev.clientY, aberto0: _sim.estado.aberto,
            lado: p[0] >= centroX ? 1 : -1,
            largura: Math.hypot(area[1][0] - area[0][0], area[1][1] - area[0][1]) * _sim.layout.s,
            altura: Math.hypot(area[3][0] - area[0][0], area[3][1] - area[0][1]) * _sim.layout.s
        };
    }
    ev.currentTarget.setPointerCapture && ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.preventDefault();
}

function _simPonteiroMove(ev) {
    const a = _sim.arrasto;
    if (!a) return;
    const e = _sim.estado;
    if (a.tipo === 'canto') {
        const p = _simDaTela(ev.clientX, ev.clientY);
        e.cantos[a.i] = GaleriaCore.prenderCantos([p], _sim.foto.w, _sim.foto.h)[0];
    } else if (a.tipo === 'barra') {
        const p = _simDaTela(ev.clientX, ev.clientY);
        const baseJanela = Math.max(e.cantos[2][1], e.cantos[3][1]);
        e.barra = Math.min(_sim.foto.h, Math.max(baseJanela + 10, p[1]));
    } else {
        let d;
        if (e.produto === 'persiana') d = -(ev.clientY - a.y0) / Math.max(40, a.altura * 0.92);
        else if (e.abertura === 'central') d = a.lado * (ev.clientX - a.x0) / Math.max(30, a.largura * 0.5 * 0.82);
        else d = (e.abertura === 'esquerda' ? -1 : 1) * (ev.clientX - a.x0) / Math.max(40, a.largura * 0.82);
        e.aberto = Math.min(1, Math.max(0, a.aberto0 + d));
    }
    _simAgendar();
}

function _simPonteiroCima() {
    if (_sim.arrasto && _sim.arrasto.tipo === 'canto') {
        _sim.estado.cantos = GaleriaCore.prenderCantos(GaleriaCore.ordenarCantos(_sim.estado.cantos), _sim.foto.w, _sim.foto.h);
    }
    _sim.arrasto = null;
    _simAgendar();
}

function _simDesenharAlcas() {
    const caixa = document.getElementById('sim-alcas'), svg = document.getElementById('sim-contorno');
    if (!_sim.foto) { caixa.innerHTML = ''; svg.querySelector('polygon').setAttribute('points', ''); return; }
    const q = _sim.estado.cantos.map(_simParaTelaLocal);
    if (caixa.children.length !== 5) caixa.innerHTML = [0, 1, 2, 3].map(i => `<div class="sim-alca" data-i="${i}" role="slider" aria-label="Canto ${i + 1} da janela"></div>`).join('')
        + '<div class="sim-alca sim-alca-barra" data-i="barra" role="slider" aria-label="Altura da barra da cortina"></div>';
    [...caixa.children].slice(0, 4).forEach((el, i) => { el.style.left = q[i][0] + 'px'; el.style.top = q[i][1] + 'px'; });
    const barra = caixa.children[4];
    barra.hidden = !_simMostraBarra();
    if (!barra.hidden) {
        const a = _simArea().map(_simParaTelaLocal);
        barra.style.left = (a[2][0] + a[3][0]) / 2 + 'px';
        barra.style.top = (a[2][1] + a[3][1]) / 2 + 'px';
    }
    svg.querySelector('polygon').setAttribute('points', q.map(p => p.join(',')).join(' '));
}

// ---------- 3D ----------
function _simIniciar3D() {
    const canvas = document.getElementById('sim-canvas');
    _sim.canvas = canvas;
    let ctx = null;
    try { ctx = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true }) || canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true }); } catch (e) { ctx = null; }
    if (!ctx || typeof THREE === 'undefined') { _sim.gl = false; return; }
    const T = THREE;
    T.ColorManagement.enabled = false;
    const r = new T.WebGLRenderer({ canvas, context: ctx, antialias: true, preserveDrawingBuffer: true });
    r.outputColorSpace = T.LinearSRGBColorSpace;
    _sim.renderer = r;
    _sim.camera = new T.OrthographicCamera(0, 1, 0, -1, -10, 10);
    _sim.cena = new T.Scene();
    _sim.rt = new T.WebGLRenderTarget(SIM_RT, SIM_RT, { samples: 4 });
    _sim.prodCena = new T.Scene();
    _sim.prodCam = new T.OrthographicCamera(0, 1, 0, -1, -5, 5);
    _sim.prodCam.position.z = 2;
    // fundo: a foto
    _sim.fundo = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0xffffff }));
    _sim.fundo.visible = false;
    _sim.cena.add(_sim.fundo);
    // produto projetado no quadrilatero
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(12), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    _sim.quadMat = new T.ShaderMaterial({
        uniforms: { uHinv: { value: new T.Matrix3() }, uRT: { value: _sim.rt.texture } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        // produto + sombra suave na parede (alfa deslocado para baixo e a direita)
        fragmentShader: `uniform mat3 uHinv; uniform sampler2D uRT; varying vec2 vP;
            float alfa(vec2 uv){ if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0; return texture2D(uRT, vec2(uv.x, 1.0 - uv.y)).a; }
            void main(){ vec3 q = uHinv * vec3(vP.x, -vP.y, 1.0); vec2 uv = q.xy / q.z;
              vec4 c = vec4(0.0);
              if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) c = texture2D(uRT, vec2(uv.x, 1.0 - uv.y));
              vec2 o = uv - vec2(0.012, 0.016);
              float s = 0.0;
              for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) s += alfa(o + vec2(float(i), float(j)) * 0.007);
              float sombra = 0.30 * s / 25.0;
              gl_FragColor = vec4(c.rgb, c.a + (1.0 - c.a) * sombra); }`,
        transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide,
        blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
        blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor
    });
    _sim.quad = new T.Mesh(geo, _sim.quadMat);
    _sim.quad.frustumCulled = false;
    _sim.quad.visible = false;
    _sim.cena.add(_sim.quad);
    _sim.gl = true;
}

function _simFotoTextura() {
    const T = THREE;
    if (_sim.fundo.material.map) _sim.fundo.material.map.dispose();
    const tex = new T.CanvasTexture(_sim.foto.canvas);
    tex.minFilter = T.LinearFilter;
    _sim.fundo.material.map = tex;
    _sim.fundo.material.needsUpdate = true;
    _sim.fundo.visible = true;
}

const SIM_VERT = `varying vec3 vN; varying vec2 vUv; varying float vV; varying float vZ;
    void main(){ vN = normalize(normalMatrix * normal); vUv = uv; vV = -position.y; vZ = position.z;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SIM_FRAG = `uniform vec3 uCor; uniform sampler2D uMapa; uniform float uUsaMapa; uniform vec2 uRep;
    uniform vec3 uLuzDir; uniform float uLuz; uniform float uFaixas; uniform float uDesloc; uniform float uAlfaFaixa;
    uniform float uProf;
    varying vec3 vN; varying vec2 vUv; varying float vV; varying float vZ;
    void main(){
      vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
      float d = dot(n, normalize(uLuzDir));
      float wrap = clamp((d + 0.6) / 1.6, 0.0, 1.0);
      float vao = uProf > 0.0 ? clamp(-vZ / uProf, 0.0, 1.0) : 0.0;
      float sombra = (0.52 + 0.58 * wrap) * (1.0 - 0.28 * vao) * (1.0 - 0.08 * vV);
      vec3 base = uUsaMapa > 0.5 ? texture2D(uMapa, vUv * uRep).rgb : uCor;
      float a = 1.0;
      if (uFaixas > 0.0 && fract(vV * uFaixas + uDesloc) > 0.5) a = uAlfaFaixa;
      vec3 c = clamp(base * sombra * uLuz, 0.0, 1.0);
      gl_FragColor = vec4(c * a, a);
    }`;

function _simMaterial(hex, opcoes) {
    const T = THREE, o = opcoes || {};
    const cor = new T.Color(hex);
    if (o.escurecer) cor.multiplyScalar(o.escurecer);
    return new T.ShaderMaterial({
        uniforms: {
            uCor: { value: cor }, uMapa: { value: o.mapa || null }, uUsaMapa: { value: o.mapa ? 1 : 0 },
            uRep: { value: new T.Vector2(o.rep || 6, o.rep || 6) }, uLuzDir: { value: new T.Vector3(-0.55, 0.8, 1.0) },
            uLuz: { value: _sim.foto ? Math.min(1.12, Math.max(0.78, 0.55 + 0.6 * _sim.foto.luz)) : 1 },
            uFaixas: { value: o.faixas || 0 }, uDesloc: { value: o.desloc || 0 }, uAlfaFaixa: { value: 0.22 },
            uProf: { value: o.prof || 0 }
        },
        vertexShader: SIM_VERT, fragmentShader: SIM_FRAG, side: T.DoubleSide,
        transparent: !!o.faixas, depthWrite: !o.faixas,
        blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
        blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor
    });
}

function _simTexturaCor(cor) {
    if (!cor || !cor.texturaId) return null;
    if (_sim.texturas[cor.texturaId] !== undefined) return _sim.texturas[cor.texturaId];
    _sim.texturas[cor.texturaId] = null;
    GaleriaImagens.url(cor.texturaId).then(u => {
        if (!u) return;
        new THREE.TextureLoader().load(u, t => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            _sim.texturas[cor.texturaId] = t;
            _simAgendar();
        });
    });
    return null;
}

// Malha em grade: colunas (x, z) x linhas (v); y da cena = -v.
function _simGrade(xs, zs, v0, v1, linhas, larguraTecido, flare) {
    const T = THREE, n = xs.length, pos = [], uv = [], idx = [];
    for (let j = 0; j <= linhas; j++) {
        const t = j / linhas, v = v0 + (v1 - v0) * t;
        for (let i = 0; i < n; i++) {
            const k = flare ? 0.85 + 0.3 * t : 1;
            pos.push(xs[i], -v, zs[i] * k);
            uv.push((i / (n - 1)) * larguraTecido, v);
        }
    }
    for (let j = 0; j < linhas; j++) for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

function _simMontarProduto() {
    const T = THREE, e = _sim.estado, G = GaleriaCore, cena = _sim.prodCena;
    cena.children.slice().forEach(o => { cena.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    const cor = _sim.cores.find(c => c.id === e.corId) || _sim.cores[0];
    const mapa = _simTexturaCor(cor);
    const tecido = op => _simMaterial(cor.hex, Object.assign({ mapa }, op));
    if (e.produto === 'cortina') {
        const g = G.geometriaCortina({ prega: e.prega, abertura: e.abertura, aberto: e.aberto, colunas: 140 });
        const prof = Math.max(0.004, ...g.paineis.flatMap(p => p.z.map(Math.abs)));
        g.paineis.forEach(p => {
            const larg = e.abertura === 'central' ? 0.5 : 1;
            cena.add(new T.Mesh(_simGrade(p.x, p.z, SIM_TOPO_TRILHO, 1, 24, larg, true), tecido({ prof })));
        });
        const visual = G.visualTrilho(e.trilho);
        if (visual === 'varao') {
            const barra = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, 1, 20), _simMaterial('#6f6458'));
            barra.rotation.z = Math.PI / 2; barra.position.set(0.5, -0.02, 0.05);
            cena.add(barra);
            [0.008, 0.992].forEach(x => { const t = new T.Mesh(new T.SphereGeometry(0.02, 20, 12), _simMaterial('#6f6458')); t.position.set(x, -0.02, 0.05); cena.add(t); });
        } else {
            const trilho = new T.Mesh(new T.BoxGeometry(1, 0.026, 0.02), _simMaterial('#e9e9e6'));
            trilho.position.set(0.5, -0.016, 0.06);
            cena.add(trilho);
        }
    } else {
        const p = G.geometriaPersiana({ tipo: e.persiana, aberto: e.aberto, linhas: 80 });
        const base = Math.max(0.06, p.baseVisivel);
        const cols = [0, 0.25, 0.5, 0.75, 1];
        if (e.persiana === 'romana') {
            // linhas da romana: a grade e transposta (dobras na horizontal)
            const pos = [], uv = [], idx = [], n = p.y.length;
            for (let j = 0; j < n; j++) for (let i = 0; i < cols.length; i++) { pos.push(cols[i], -(0.04 + p.y[j] * 0.96), p.z[j]); uv.push(cols[i], p.y[j]); }
            for (let j = 0; j < n - 1; j++) for (let i = 0; i < cols.length - 1; i++) { const a = j * cols.length + i, b = a + 1, c = a + cols.length, d = c + 1; idx.push(a, c, b, b, c, d); }
            const g = new T.BufferGeometry();
            g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
            g.setIndex(idx); g.computeVertexNormals();
            cena.add(new T.Mesh(g, tecido()));
        } else if (e.persiana === 'double') {
            const fundo = new T.Mesh(_simGrade(cols, cols.map(() => 0), 0.04, 0.04 + base * 0.96, 4, 1, false), tecido({ faixas: p.faixas, desloc: 0.5 * (1 - p.alinhamento) }));
            fundo.position.z = -0.01;
            const frente = new T.Mesh(_simGrade(cols, cols.map(() => 0), 0.04, 0.04 + base * 0.96, 4, 1, false), tecido({ faixas: p.faixas, desloc: 0 }));
            fundo.renderOrder = 1; frente.renderOrder = 2;
            cena.add(fundo, frente);
        } else {
            cena.add(new T.Mesh(_simGrade(cols, cols.map(() => 0), 0.04, 0.04 + base * 0.96, 4, 1, false), tecido()));
        }
        // rolo e double vision enrolam num tubo; a romana tem um cabecote reto
        let rolo;
        if (e.persiana === 'romana') {
            rolo = new T.Mesh(new T.BoxGeometry(1, 0.04, 0.03), _simMaterial('#e4e2dc'));
            rolo.position.set(0.5, -0.02, 0.04);
        } else {
            rolo = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 1, 24), _simMaterial(cor.hex, { escurecer: 0.92 }));
            rolo.rotation.z = Math.PI / 2; rolo.position.set(0.5, -0.026, 0.03);
        }
        const barra = new T.Mesh(new T.BoxGeometry(1, 0.014, 0.012), _simMaterial('#dcdcd8'));
        barra.position.set(0.5, -(0.04 + base * 0.96), 0.02);
        cena.add(rolo, barra);
    }
}

function _simAgendar() {
    if (_sim.pendente) return;
    _sim.pendente = true;
    requestAnimationFrame(() => { _sim.pendente = false; _sim.renderAgora(); });
}

_sim.renderAgora = function () {
    _simDesenharAlcas();
    if (!_sim.gl || document.getElementById('sim').hidden) return;
    const r = _sim.renderer, L = _sim.layout;
    if (_sim.foto && L) {
        // fundo em px de tela (y para baixo vira -y)
        _sim.fundo.scale.set(_sim.foto.w * L.s, _sim.foto.h * L.s, 1);
        _sim.fundo.position.set(L.x + _sim.foto.w * L.s / 2, -(L.y + _sim.foto.h * L.s / 2), 0);
        _simMontarProduto();
        r.setRenderTarget(_sim.rt);
        r.setClearColor(0x000000, 0);
        r.clear();
        r.render(_sim.prodCena, _sim.prodCam);
        r.setRenderTarget(null);
        const area = _simArea().map(_simParaTelaLocal);
        const Hd = GaleriaCore.homografia([[0, 0], [1, 0], [1, 1], [0, 1]], area);
        const M = 0.06;   // folga para a sombra
        const folga = [[-M, -M], [1 + M, -M], [1 + M, 1 + M], [-M, 1 + M]].map(p => GaleriaCore.aplicarHomografia(Hd, p));
        const pos = _sim.quad.geometry.attributes.position;
        folga.forEach((p, i) => pos.setXYZ(i, p[0], -p[1], 1));
        pos.needsUpdate = true;
        const Hinv = GaleriaCore.homografia(area, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        _sim.quadMat.uniforms.uHinv.value.set(...Hinv);
        _sim.quad.visible = true;
    } else {
        _sim.quad.visible = false;
    }
    r.setClearColor(0x111111, 1);
    r.render(_sim.cena, _sim.camera);
};
