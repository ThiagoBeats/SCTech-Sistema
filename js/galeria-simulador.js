// Simulador de cortinas e persianas sobre a foto da parede do cliente.
// Tela unica em WebGL (Three.js): a foto e o fundo; o produto e desenhado em 3D
// (dobras com luz e sombra) num alvo de textura e projetado no quadrilatero da
// foto pela homografia, no shader — perspectiva correta, e imagem/video saem
// do mesmo canvas. Facilidade de uso manda: foto -> ja aparece a cortina.
const _sim = {
    pronto: false, gl: false, foto: null, aba: 'modelo', recolhida: false,
    estado: { produto: 'cortina', prega: 'Wave Botao', persiana: 'rolo', corId: null, tecido: 'linho', trilho: '', abertura: 'central', ate: 'chao', aberto: 0, cantos: null, barra: null },
    m: null, cores: [], texturas: {}, layout: null, pendente: false, arrasto: null
};
window._sim = _sim;

// O produto e desenhado por galeria-modelos-render.js. A pagina deve carrega-lo
// depois do three.min.js; se faltar, entra aqui mesmo, ainda durante a leitura
// da pagina (antes do DOMContentLoaded que abre o simulador).
if (typeof GaleriaRender === 'undefined' && typeof THREE !== 'undefined' && document.readyState === 'loading') {
    const atual = document.currentScript && document.currentScript.src;
    const src = atual ? atual.replace(/galeria-simulador\.js/, 'galeria-modelos-render.js') : 'js/galeria-modelos-render.js';
    document.write('<script src="' + src + '"><\/script>');
}

const SIM_RT = 1024;

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
            <div class="sim-lupa" id="sim-lupa" hidden aria-hidden="true"><canvas></canvas><span class="sim-lupa-mira"></span></div>
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
    const pregas = _simPregas();
    if (!pregas.includes(e.prega)) e.prega = pregas.includes('Wave Botao') ? 'Wave Botao' : pregas[0];
    const trilhos = _sim.m.modelos.trilhos;
    if (!trilhos.includes(e.trilho)) e.trilho = trilhos[0] || '';
    pre = pre || {};
    if (pre.prega && GaleriaCore.PREGAS[pre.prega]) { e.produto = 'cortina'; e.prega = pre.prega; e.aberto = 0; _sim.aba = 'cor'; }
    if (pre.persiana && GaleriaCore.PERSIANAS[pre.persiana]) { e.produto = 'persiana'; e.persiana = pre.persiana; e.aberto = 0; _sim.aba = 'cor'; }
    if (pre.trilho) { e.produto = 'cortina'; e.trilho = pre.trilho; _sim.aba = 'cor'; }
    if (pre.prega || pre.persiana) _simCorDoModelo();
    else if (!_simCoresAtuais().some(c => c.id === e.corId)) e.corId = _sim.cores[0].id;
    raiz.hidden = false;
    document.body.classList.add('sim-aberto');
    document.getElementById('sim-sem-3d').hidden = _sim.gl;
    _simRenderGaveta();
    _simRenderAcoes();
    _simLayout();
}

function fecharSimulador() {
    const raiz = document.getElementById('sim');
    if (!raiz || raiz.hidden) return;
    raiz.hidden = true;
    document.body.classList.remove('sim-aberto');
}

// Fotos da galeria ligadas ao modelo escolhido viram opcoes de tecido: a foto
// e esticada sobre a cortina (com as dobras por cima).
function _simFotosDoModelo() {
    const e = _sim.estado;
    const tipo = e.produto === 'cortina' ? 'prega' : 'persiana';
    const valor = e.produto === 'cortina' ? e.prega : e.persiana;
    return (_sim.m.fotos || []).filter(f => f.liga && f.liga.tipo === tipo && f.liga.valor === valor)
        .map(f => ({ id: 'foto:' + f.id, nome: f.legenda || 'Foto da galeria', hex: '#9a9a9a', texturaId: f.imagemId, foto: true }));
}
function _simCoresAtuais() {
    return _simFotosDoModelo().concat(_sim.cores);
}
// Ao trocar de modelo: com foto ligada, ela ja entra como tecido; sem foto,
// sai a foto do modelo anterior e volta uma cor do mostruario.
function _simCorDoModelo() {
    const e = _sim.estado, fotos = _simFotosDoModelo();
    if (fotos.length) e.corId = fotos[0].id;
    else if (!_simCoresAtuais().some(c => c.id === e.corId)) e.corId = _sim.cores[0].id;
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
        const tecidos = Object.entries(GaleriaRender.TECIDOS).map(([k, t]) =>
            op('tecido', k, t.nome, e.tecido === k, `<small class="sim-op-dica">${escapeHtml(t.dica)}</small>`)).join('');
        html = `<div class="sim-grupo-rotulo">Tecido</div><div class="sim-lista sim-lista-tecidos">${tecidos}</div>
            <div class="sim-grupo-rotulo">Cor</div><div class="sim-lista sim-lista-cores">${_simCoresAtuais().map(c => `<button type="button" class="sim-cor${e.corId === c.id ? ' ativa' : ''}" data-valor="${escapeHtml(c.id)}" aria-pressed="${e.corId === c.id}" title="${escapeHtml(c.nome)}">
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
    _simImagensModelos(caixa);
    caixa.querySelectorAll('.sim-cor').forEach(b => b.onclick = () => _simEscolher('cor', b.dataset.valor));
    caixa.querySelectorAll('.sim-cor-amostra[data-textura]').forEach(async s => {
        if (!s.dataset.textura) return;
        const u = await GaleriaImagens.url(s.dataset.textura);
        if (u) s.style.backgroundImage = `url('${u}')`;
    });
}

// Miniatura do modelo: desenho simples na hora e, assim que pronta, a imagem
// realista renderizada (GaleriaRender) na cor escolhida.
function _simIconeModelo(tipo, k) {
    let svg;
    if (tipo === 'prega') {
        const amp = { 'Wave Botao': 5, 'Wave Plus': 4, 'Americana': 3, 'Franzido': 2, 'Macho-Femea': 3, 'Painel': 0 }[k];
        const d = amp ? `M2 ${12} ` + Array.from({ length: 6 }, (_, i) => `Q ${5 + i * 6} ${12 - amp} ${8 + i * 6} 12 T ${14 + i * 6} 12`).slice(0, 3).join(' ') : 'M2 12 H 38';
        svg = `<svg class="sim-icone" viewBox="0 0 40 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/><line x1="2" y1="4" x2="38" y2="4" stroke="currentColor" stroke-width="2"/></svg>`;
    } else {
        const linhas = { rolo: [8], romana: [9, 14, 19], double: [8, 12, 16, 20] }[k];
        svg = `<svg class="sim-icone" viewBox="0 0 40 24" aria-hidden="true"><rect x="6" y="3" width="28" height="4" rx="2" fill="currentColor"/>${linhas.map(y => `<line x1="8" y1="${y}" x2="32" y2="${y}" stroke="currentColor" stroke-width="${k === 'double' ? 2.5 : 1.5}"/>`).join('')}</svg>`;
    }
    return `<span class="sim-op-figura" data-tipo="${tipo}" data-chave="${escapeHtml(k)}">${svg}</span>`;
}

function _simImagensModelos(caixa) {
    if (typeof renderizarImagemModelo !== 'function') return;
    const cor = _simCorAtual();
    const hex = cor && !cor.foto ? cor.hex : '#e9e3d6';
    caixa.querySelectorAll('.sim-op-figura').forEach(el => {
        renderizarImagemModelo({ tipo: el.dataset.tipo, chave: el.dataset.chave, hex, tecido: _sim.estado.tecido, largura: 96, altura: 72 })
            .then(url => { if (url && el.isConnected) el.innerHTML = `<img class="sim-op-img" src="${url}" alt="">`; });
    });
}

function _simEscolher(campo, valor) {
    const e = _sim.estado;
    if (campo === 'modelo') {
        const i = valor.indexOf(':'), tipo = valor.slice(0, i), k = valor.slice(i + 1);
        if (tipo === 'prega') { e.produto = 'cortina'; e.prega = k; } else { e.produto = 'persiana'; e.persiana = k; }
        e.aberto = 0;
        _simCorDoModelo();
    } else if (campo === 'cor') e.corId = valor;
    else if (campo === 'tecido') { if (GaleriaRender.TECIDOS[valor]) e.tecido = valor; }
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
        _sim.foto = Object.assign({ w, h, canvas: c }, _simAnalisarLuz(c));
        _sim.estado.cantos = [[w * 0.3, h * 0.25], [w * 0.7, h * 0.25], [w * 0.7, h * 0.6], [w * 0.3, h * 0.6]];
        _sim.estado.aberto = 0;
        _sim.estado.barra = null;
        if (_sim.gl) _simFotoTextura();
        document.getElementById('sim-inicio').hidden = true;
        document.getElementById('sim-trocar').hidden = false;
        let viu = false;
        try { viu = localStorage.getItem('sc_sim_dica') === '1'; } catch (e) { viu = false; }
        document.getElementById('sim-dica').hidden = viu;
        _simRenderAcoes();
        _simLayout();
    } catch (e) {
        toast('Não foi possível abrir essa foto. Tente outra.', 'error', 4000);
    }
}

// Luz da foto: brilho medio (0..1), tom da luz (balanco de branco, para a
// cortina nao ficar "fria" numa sala amarelada) e de que lado vem a luz
// (-1 esquerda .. 1 direita), comparando as metades da foto.
function _simAnalisarLuz(c) {
    const N = 24, p = document.createElement('canvas'); p.width = N; p.height = N;
    const g = p.getContext('2d'); g.drawImage(c, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    let s = 0, r = 0, gr = 0, b = 0, esq = 0, dir = 0;
    for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        s += l; r += d[i]; gr += d[i + 1]; b += d[i + 2];
        const x = (i / 4) % N;
        if (x < N / 3) esq += l; else if (x >= N * 2 / 3) dir += l;
    }
    const n = d.length / 4, luz = s / n / 255;
    const m = (r + gr + b) / 3 || 1;
    const tom = [r / m, gr / m, b / m].map(v => Math.min(1.12, Math.max(0.88, 1 + (v - 1) * 0.5)));
    const dif = (dir - esq) / ((dir + esq) || 1);
    const ladoLuz = Math.abs(dif) < 0.04 ? -0.35 : Math.max(-0.75, Math.min(0.75, dif * 4));
    return { luz, tom, ladoLuz };
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
    if (!_sim.foto || _sim.animando || ev.target.closest('.sim-topo, .sim-inicio, label, button')) return;
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
    if (_sim.arrasto.tipo !== 'abrir') _simLupa(ev.clientX, ev.clientY);
    _simAgendar();
}

function _simPonteiroMove(ev) {
    const a = _sim.arrasto;
    if (!a) return;
    const e = _sim.estado;
    if (a.tipo === 'canto') {
        // so aceita a posicao se a janela continua um quadrilatero de verdade
        // (convexo, sem cruzar, cantos afastados); senao o canto para onde estava
        const p = GaleriaCore.prenderCantos([_simDaTela(ev.clientX, ev.clientY)], _sim.foto.w, _sim.foto.h)[0];
        const novo = e.cantos.map((c, i) => i === a.i ? p : c);
        if (GaleriaCore.quadValido(novo, 20)) e.cantos = novo;
        _simLupa(ev.clientX, ev.clientY);
    } else if (a.tipo === 'barra') {
        const p = _simDaTela(ev.clientX, ev.clientY);
        const baseJanela = Math.max(e.cantos[2][1], e.cantos[3][1]);
        e.barra = Math.min(_sim.foto.h, Math.max(baseJanela + 10, p[1]));
        _simLupa(ev.clientX, ev.clientY);
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
    const lupa = document.getElementById('sim-lupa');
    if (lupa) lupa.hidden = true;
    _simAgendar();
}

// Ponto da foto que o arrasto esta ajustando: o canto (ja corrigido) ou o
// meio da barra da cortina.
function _simPontoArrastado() {
    const a = _sim.arrasto, e = _sim.estado;
    if (!a) return null;
    if (a.tipo === 'canto') return e.cantos[a.i];
    if (a.tipo === 'barra') { const q = _simArea(); return [(q[2][0] + q[3][0]) / 2, (q[2][1] + q[3][1]) / 2]; }
    return null;
}

// Lupa com mira: mostra a foto da parede (sem a cortina) ampliada em volta do
// ponto, acima do dedo — o dedo nao cobre o que se quer acertar.
const SIM_LUPA = 132, SIM_LUPA_ZOOM = 3;
function _simLupa(cx, cy) {
    const lupa = document.getElementById('sim-lupa'), p = _simPontoArrastado();
    if (!lupa || !p || !_sim.foto) return;
    const palco = document.getElementById('sim-palco').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cv = lupa.querySelector('canvas');
    const lado = Math.round(SIM_LUPA * dpr);
    if (cv.width !== lado) { cv.width = lado; cv.height = lado; }
    const g = cv.getContext('2d');
    const meio = SIM_LUPA / (2 * _sim.layout.s * SIM_LUPA_ZOOM);   // meia janela, em px da foto
    g.fillStyle = '#111'; g.fillRect(0, 0, lado, lado);
    g.imageSmoothingEnabled = true;
    g.drawImage(_sim.foto.canvas, p[0] - meio, p[1] - meio, meio * 2, meio * 2, 0, 0, lado, lado);
    // acima do dedo; sem espaco em cima, vai para baixo; sempre dentro do palco
    const x = cx - palco.left, y = cy - palco.top, folga = 34;
    let top = y - folga - SIM_LUPA;
    if (top < 8) top = y + folga;
    const left = Math.min(palco.width - SIM_LUPA - 8, Math.max(8, x - SIM_LUPA / 2));
    lupa.style.left = left + 'px';
    lupa.style.top = top + 'px';
    lupa.hidden = false;
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
    let r;
    try { r = new T.WebGLRenderer({ canvas, context: ctx, antialias: true, preserveDrawingBuffer: true }); }
    catch (e) { _sim.gl = false; return; }
    // Celular em segundo plano (uma ligacao) pode perder o contexto 3D: o
    // Three.js refaz o contexto e as texturas; aqui so redesenha ao voltar.
    canvas.addEventListener('webglcontextlost', ev => ev.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => {
        if (_sim.fundo && _sim.fundo.material.map) _sim.fundo.material.map.needsUpdate = true;
        _simAgendar();
    });
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
    // Projecao do produto no quadrilatero da foto, com o acabamento que o faz
    // parecer fotografado: leve suavizacao (a camera nunca e nitida como o 3D),
    // luz da foto atravessando o tecido (voil/linho), sombra suave na parede e
    // granulado fixo, igual ao da foto.
    _sim.quadMat = new T.ShaderMaterial({
        uniforms: {
            uHinv: { value: new T.Matrix3() }, uRT: { value: _sim.rt.texture }, uOpacidade: { value: 1 },
            uFoto: { value: null }, uFotoRet: { value: new T.Vector4(0, 0, 1, 1) }, uTransm: { value: 0 }, uRaio: { value: 0.01 },
            uTom: { value: new T.Vector3(1, 1, 1) }, uTexel: { value: 1 / SIM_RT }, uGrao: { value: 0.03 }, uSombra: { value: new T.Vector2(0.012, 0.016) }
        },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform mat3 uHinv; uniform sampler2D uRT; uniform float uOpacidade;
            uniform sampler2D uFoto; uniform vec4 uFotoRet; uniform float uTransm; uniform float uRaio; uniform vec3 uTom;
            uniform float uTexel; uniform float uGrao; uniform vec2 uSombra; varying vec2 vP;
            vec4 amostra(vec2 uv){ if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0); return texture2D(uRT, vec2(uv.x, 1.0 - uv.y)); }
            float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            void main(){ vec3 q = uHinv * vec3(vP.x, -vP.y, 1.0); vec2 uv = q.xy / q.z;
              vec2 t = vec2(uTexel * 0.9, 0.0);
              vec4 c = amostra(uv) * 0.52 + (amostra(uv + t) + amostra(uv - t) + amostra(uv + t.yx) + amostra(uv - t.yx)) * 0.12;
              vec2 o = uv - uSombra;
              // sombra suave: disco de Poisson girado por pixel (sem degraus na borda;
              // o que sobra de ruido some no grao da foto)
              float ang = hash(gl_FragCoord.xy + 17.0) * 6.28318;
              mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
              float s = 0.0, sw = 0.0;
              for (int i = 0; i < 16; i++) {
                float fi = float(i), r = sqrt((fi + 0.5) / 16.0), th = fi * 2.39996;
                float wi = 1.0 - 0.65 * r;
                s += amostra(o + rot * vec2(cos(th), sin(th)) * r * 0.024).a * wi; sw += wi;
              }
              float sombra = 0.30 * s / sw;
              if (uTransm > 0.0 && c.a > 0.0) {
                vec2 fp = (vec2(vP.x, -vP.y) - uFotoRet.xy) / uFotoRet.zw;
                vec3 at = vec3(0.0);
                for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) at += texture2D(uFoto, clamp(vec2(fp.x, 1.0 - fp.y) + vec2(float(i), float(j)) * uRaio * 0.5, 0.0, 1.0)).rgb;
                at /= 25.0;
                c.rgb = mix(c.rgb, at * uTom * c.a, uTransm * 0.85) + at * uTom * uTransm * 0.12 * c.a;
              }
              c.rgb += (hash(floor(gl_FragCoord.xy)) - 0.5) * uGrao * c.a;
              c.rgb = clamp(c.rgb, 0.0, c.a);
              gl_FragColor = vec4(c.rgb, c.a + (1.0 - c.a) * sombra) * uOpacidade; }`,
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

// O produto (cortina/persiana com trama, luz de tecido, trilho de metal) e
// montado por GaleriaRender (galeria-modelos-render.js), o mesmo das imagens
// dos modelos.
function _simCorAtual() {
    return _simCoresAtuais().find(c => c.id === _sim.estado.corId) || _sim.cores[0];
}
function _simMontarProduto() {
    const e = _sim.estado, cor = _simCorAtual(), f = _sim.foto;
    GaleriaRender.montarProduto(_sim.prodCena, {
        produto: e.produto, prega: e.prega, persiana: e.persiana, abertura: e.abertura, aberto: e.aberto, trilho: e.trilho,
        hex: cor.hex, mapa: _simTexturaCor(cor), foto: !!cor.foto, tecido: e.tecido, aspecto: _sim.aspecto || 1.4,
        luz: f ? Math.min(1.12, Math.max(0.78, 0.55 + 0.6 * f.luz)) : 1,
        luzCor: f ? f.tom : [1, 1, 1], luzDir: [f ? f.ladoLuz : -0.35, 0.75, 1.0]
    });
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
        const area = _simArea().map(_simParaTelaLocal);
        const largA = Math.hypot(area[1][0] - area[0][0], area[1][1] - area[0][1]) || 1;
        _sim.aspecto = Math.max(0.3, Math.min(4, Math.hypot(area[3][0] - area[0][0], area[3][1] - area[0][1]) / largA));
        _simMontarProduto();
        r.setRenderTarget(_sim.rt);
        r.setClearColor(0x000000, 0);
        r.clear();
        r.render(_sim.prodCena, _sim.prodCam);
        r.setRenderTarget(null);
        const Hd = GaleriaCore.homografia([[0, 0], [1, 0], [1, 1], [0, 1]], area);
        const M = 0.06;   // folga para a sombra
        const folga = [[-M, -M], [1 + M, -M], [1 + M, 1 + M], [-M, 1 + M]].map(p => GaleriaCore.aplicarHomografia(Hd, p));
        const pos = _sim.quad.geometry.attributes.position;
        folga.forEach((p, i) => pos.setXYZ(i, p[0], -p[1], 1));
        pos.needsUpdate = true;
        const Hinv = GaleriaCore.homografia(area, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        const U = _sim.quadMat.uniforms, e = _sim.estado, cor = _simCorAtual(), tc = GaleriaRender.tecido(e.tecido);
        U.uHinv.value.set(...Hinv);
        U.uFoto.value = _sim.fundo.material.map;
        U.uFotoRet.value.set(L.x, L.y, _sim.foto.w * L.s, _sim.foto.h * L.s);
        // persiana rolo/romana nao deixa ver a janela atras como a cortina; double vision ja tem as faixas
        U.uTransm.value = U.uFoto.value ? tc.transm * (e.produto === 'persiana' ? 0.6 : 1) : 0;
        U.uRaio.value = Math.max(0.002, tc.raio);
        U.uTom.value.set(...GaleriaRender.tomTransmitido(cor.hex, !!cor.foto));
        // sombra para o lado oposto ao da luz da foto
        U.uSombra.value.set(-(_sim.foto.ladoLuz || -0.35) * 0.03, 0.016);
        // ajustando um canto ou a barra: cortina meio transparente para ver a janela
        _sim.quadMat.uniforms.uOpacidade.value = _sim.arrasto && _sim.arrasto.tipo !== 'abrir' ? 0.5 : 1;
        _sim.quad.visible = true;
    } else {
        _sim.quad.visible = false;
    }
    r.setClearColor(0x111111, 1);
    r.render(_sim.cena, _sim.camera);
};

// ---------- salvar e enviar ----------
function _simPodeGravar() {
    return typeof window.MediaRecorder === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

function _simRenderAcoes() {
    const caixa = document.getElementById('sim-acoes');
    if (!caixa) return;
    if (!_sim.foto || !_sim.gl) { caixa.innerHTML = ''; return; }
    caixa.innerHTML = `<button type="button" id="sim-animar" class="sim-acao">▶ Animar</button>
        <button type="button" id="sim-salvar-imagem" class="sim-acao">💾 Imagem</button>
        ${_simPodeGravar() ? '<button type="button" id="sim-gravar-video" class="sim-acao">🎥 Vídeo</button>' : ''}
        <button type="button" id="sim-enviar" class="sim-acao sim-acao-principal">📤 Enviar</button>`;
    const anim = caixa.querySelector('#sim-animar');
    anim.onclick = async () => {
        if (_sim.animando) return;
        anim.disabled = true;
        try { await animarSimulacao(); } finally { anim.disabled = false; }
    };
    caixa.querySelector('#sim-salvar-imagem').onclick = async () => baixarArquivoSimulacao(await salvarImagemSimulacao(), 'jpg');
    const v = caixa.querySelector('#sim-gravar-video');
    if (v) v.onclick = async () => {
        if (_sim.animando) return;
        v.disabled = true; v.textContent = '⏺ Gravando…';
        try {
            const blob = await gravarVideoSimulacao();
            if (blob) baixarArquivoSimulacao(blob, /mp4/.test(blob.type) ? 'mp4' : 'webm');
            else toast('Este aparelho não conseguiu gravar o vídeo. Salve a imagem.', 'warning', 4500);
        } finally { v.disabled = false; v.textContent = '🎥 Vídeo'; }
    };
    caixa.querySelector('#sim-enviar').onclick = async () => enviarSimulacao(await salvarImagemSimulacao(), _simNomeArquivo('jpg'));
}

function _simNomeArquivo(ext) {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `simulacao-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`;
}

// Recorte da foto no canvas (sem a moldura preta), em px do aparelho.
function _simRecorte() {
    const L = _sim.layout, k = _sim.renderer.getPixelRatio();
    return { x: Math.round(L.x * k), y: Math.round(L.y * k), w: Math.round(_sim.foto.w * L.s * k), h: Math.round(_sim.foto.h * L.s * k) };
}

function _simQuadroLimpo(destino) {
    _sim.renderAgora();
    const r = _simRecorte();
    destino.getContext('2d').drawImage(_sim.canvas, r.x, r.y, r.w, r.h, 0, 0, destino.width, destino.height);
}

// Imagem JPEG so da foto com a cortina (as alcas e dicas sao HTML por cima,
// nao entram). Sai no tamanho da foto, ate 1600 px.
function salvarImagemSimulacao() {
    const r = _simRecorte();
    const k = Math.min(1600 / Math.max(r.w, r.h), _sim.foto.w / r.w, 4);
    const c = document.createElement('canvas');
    c.width = Math.round(r.w * Math.max(1, k)); c.height = Math.round(r.h * Math.max(1, k));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    _simQuadroLimpo(c);
    return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.92));
}

// Video curto: a cortina abre e fecha uma vez (4 s). Grava um canvas 2D com o
// recorte da foto, para o video nao levar a moldura preta.
// A cortina abre e fecha uma vez, suave (fecha -> abre -> fecha), e volta
// como estava. `aCadaQuadro` desenha cada quadro (o video usa para gravar).
const SIM_DUR_ANIMACAO = 4000;
function animarSimulacao(aCadaQuadro) {
    const e = _sim.estado, inicial = e.aberto;
    _sim.animando = true;
    return new Promise(ok => {
        const t0 = performance.now();
        const passo = agora => {
            const t = Math.min(1, (agora - t0) / SIM_DUR_ANIMACAO);
            e.aberto = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI);
            if (aCadaQuadro) aCadaQuadro(); else _sim.renderAgora();
            if (t < 1) { requestAnimationFrame(passo); return; }
            e.aberto = inicial;
            _sim.animando = false;
            _simAgendar();
            ok();
        };
        requestAnimationFrame(passo);
    });
}

function gravarVideoSimulacao() {
    if (!_simPodeGravar()) return Promise.resolve(null);
    const r = _simRecorte();
    const k = Math.min(1, 1280 / Math.max(r.w, r.h));
    const c = document.createElement('canvas');
    c.width = Math.round(r.w * k / 2) * 2; c.height = Math.round(r.h * k / 2) * 2;
    const tipos = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const tipo = tipos.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    let gravador;
    try {
        gravador = new MediaRecorder(c.captureStream(30), tipo ? { mimeType: tipo, videoBitsPerSecond: 4e6 } : undefined);
    } catch (e) { return Promise.resolve(null); }
    const partes = [];
    return new Promise(ok => {
        gravador.ondataavailable = ev => { if (ev.data && ev.data.size) partes.push(ev.data); };
        gravador.onstop = () => ok(partes.length ? new Blob(partes, { type: (gravador.mimeType || tipo || 'video/webm').split(';')[0] }) : null);
        _simQuadroLimpo(c);
        gravador.start(250);
        animarSimulacao(() => _simQuadroLimpo(c)).then(() => setTimeout(() => gravador.stop(), 200));
    });
}

function baixarArquivoSimulacao(blob, ext) {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = _simNomeArquivo(ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// No celular abre o compartilhar (WhatsApp, e-mail...); sem ele, baixa.
async function enviarSimulacao(blob, nome) {
    if (!blob) return;
    const arquivo = new File([blob], nome, { type: blob.type });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], title: 'Simulação da cortina' }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
    }
    baixarArquivoSimulacao(blob, nome.split('.').pop());
}
