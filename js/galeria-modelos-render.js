// Renderizacao realista de cortinas e persianas (Three.js), usada pelo
// simulador (foto da parede do cliente) e pelas imagens dos modelos da galeria.
// - trama de tecido procedural (fios, irregularidade do linho, manchas suaves)
//   gerada uma vez por tipo de tecido, sem baixar nada;
// - luz de tecido: difusa envolvente, brilho de borda (sheen), sombra no fundo
//   das dobras, sombra do trilho no topo, barra com costura;
// - translucidez: a luz que vem de tras atravessa voil e linho;
// - trilho e varao com reflexo de metal.
// renderizarImagemModelo() monta um "estudio" (parede, janela, rodape, piso,
// sombra suave) e devolve a imagem pronta (data URL JPEG).
// Ordem de carga: galeria-core.js, three.min.js, este arquivo.
(function (raiz) {
    'use strict';
    if (!raiz || typeof THREE === 'undefined' || typeof GaleriaCore === 'undefined') return;
    // carregado duas vezes (pagina + reserva do simulador): fica o primeiro
    if (raiz.GaleriaRender) return;
    const T = THREE;
    T.ColorManagement.enabled = false;

    const GR = {};
    GR.TOPO_TRILHO = 0.035;

    // Tipos de tecido: quanto de luz passa (transm), quao borrado fica o que
    // esta atras (raio), relevo e variacao de cor da trama, brilho de borda.
    const TECIDOS = {
        voil:     { nome: 'Voil',     dica: 'translúcido', transm: 0.60, raio: 0.006, relevo: 0.30, varCor: 0.5, brilho: 0.06, rep: 14 },
        linho:    { nome: 'Linho',    dica: 'filtra a luz', transm: 0.16, raio: 0.05,  relevo: 0.55, varCor: 1.0, brilho: 0.07, rep: 10 },
        blackout: { nome: 'Blackout', dica: 'bloqueia a luz', transm: 0,  raio: 0,     relevo: 0.20, varCor: 0.5, brilho: 0.13, rep: 8 }
    };
    GR.TECIDOS = TECIDOS;
    GR.tecido = k => TECIDOS[k] || TECIDOS.linho;

    // ---------- ruido ----------
    function prng(semente) {
        let s = semente >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function _h(i, s) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
    // ruido suave 1D (0..1), deterministico
    function ruido1(x, s) {
        const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
        return _h(i, s) + (_h(i + 1, s) - _h(i, s)) * u;
    }
    GR.ruido1 = ruido1;

    // ---------- trama procedural ----------
    // Textura 256x256 que se repete sem emenda: R,G = desvio da normal (relevo
    // dos fios), B = variacao de cor (fios mais claros/escuros, nos do linho).
    const _tramas = {};
    function gerarTrama(tipo) {
        const S = 512;
        const cfg = { linho: { p: 4, nos: 1, manchas: 0.025, cor: 0.035 }, voil: { p: 2, nos: 0.3, manchas: 0.012, cor: 0.015 },
            blackout: { p: 2, nos: 0.1, manchas: 0.02, cor: 0.01 } }[tipo] || { p: 4, nos: 1, manchas: 0.025, cor: 0.035 };
        const rnd = prng(tipo === 'voil' ? 11 : tipo === 'blackout' ? 23 : 7);
        const nf = S / cfg.p, L = 12;
        // espessura ao longo de cada fio (nos do linho) e tom de cada fio
        const fio = kCor => {
            const tons = [], esp = [];
            for (let f = 0; f < nf; f++) {
                tons.push(1 + kCor * cfg.cor * (rnd() * 2 - 1));
                const lat = Array.from({ length: L }, () => rnd());
                const linha = new Float32Array(S);
                for (let k = 0; k < S; k++) {
                    const x = k / S * L, i = Math.floor(x), fr = x - i, u = fr * fr * (3 - 2 * fr);
                    const v = lat[i % L] + (lat[(i + 1) % L] - lat[i % L]) * u;
                    linha[k] = 1 + cfg.nos * Math.max(0, v - 0.68) / 0.32 * 0.9;
                }
                esp.push(linha);
            }
            return { tons, esp };
        };
        const urd = fio(1), tra = fio(0.35);
        // manchas suaves (2 escalas), periodicas
        const ruido2 = n => {
            const lat = Array.from({ length: n * n }, () => rnd());
            return (x, y) => {
                const fx = x / S * n, fy = y / S * n, i = Math.floor(fx), j = Math.floor(fy);
                const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
                const g = (a, b) => lat[((b % n) * n) + (a % n)];
                const a0 = g(i, j) + (g(i + 1, j) - g(i, j)) * su, a1 = g(i, j + 1) + (g(i + 1, j + 1) - g(i, j + 1)) * su;
                return a0 + (a1 - a0) * sv;
            };
        };
        const m1 = ruido2(3), m2 = ruido2(24);
        const alt = new Float32Array(S * S), alb = new Float32Array(S * S);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const cx = Math.floor(x / cfg.p), cy = Math.floor(y / cfg.p);
            const fx = ((x % cfg.p) + 0.5) / cfg.p, fy = ((y % cfg.p) + 0.5) / cfg.p;
            const ew = urd.esp[cx][y], ef = tra.esp[cy][x];
            const pw = Math.pow(Math.sin(Math.PI * fx), 1 / ew), pf = Math.pow(Math.sin(Math.PI * fy), 1 / ef);
            const urdCima = ((cx + cy) & 1) === 0;
            const h = urdCima ? 0.45 + 0.55 * pw * Math.min(1.4, ew) : 0.45 + 0.55 * pf * Math.min(1.4, ef);
            let a = urdCima ? urd.tons[cx] * (0.9 + 0.1 * pw) * (1 + 0.08 * (ew - 1)) : tra.tons[cy] * (0.9 + 0.1 * pf) * (1 + 0.08 * (ef - 1));
            a *= 1 + cfg.manchas * ((m1(x, y) - 0.5) * 2 + 0.5 * (m2(x, y) - 0.5) * 2);
            alt[y * S + x] = h; alb[y * S + x] = a;
        }
        const dados = new Uint8Array(S * S * 4);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const i = y * S + x;
            const dx = alt[y * S + ((x + S - 1) % S)] - alt[y * S + ((x + 1) % S)];
            const dy = alt[((y + S - 1) % S) * S + x] - alt[((y + 1) % S) * S + x];
            dados[i * 4] = Math.max(0, Math.min(255, 128 + dx * 90));
            dados[i * 4 + 1] = Math.max(0, Math.min(255, 128 + dy * 90));
            dados[i * 4 + 2] = Math.max(0, Math.min(255, (alb[i] - 0.85) / 0.3 * 255));
            dados[i * 4 + 3] = 255;
        }
        const tex = new T.DataTexture(dados, S, S, T.RGBAFormat);
        tex.wrapS = tex.wrapT = T.RepeatWrapping;
        tex.magFilter = T.LinearFilter;
        tex.minFilter = T.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
    }
    GR.trama = tipo => _tramas[tipo] || (_tramas[tipo] = gerarTrama(tipo));

    // ---------- materiais ----------
    const VERT = `varying vec3 vN; varying vec2 vUv; varying float vV; varying float vZ;
        void main(){ vN = normalize(normalMatrix * normal); vUv = uv; vV = -position.y; vZ = position.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    const FRAG_TECIDO = `uniform vec3 uCor; uniform sampler2D uMapa; uniform float uUsaMapa; uniform vec2 uRep;
        uniform sampler2D uTrama; uniform vec2 uRepTrama; uniform float uRelevo; uniform float uVarCor;
        uniform vec3 uLuzDir; uniform vec3 uLuzCor; uniform float uLuz; uniform float uBrilho;
        uniform float uFaixas; uniform float uDesloc; uniform float uAlfaFaixa; uniform float uProf;
        uniform float uTopo; uniform float uBainha; uniform float uCostura;
        uniform sampler2D uAtras; uniform float uTransm; uniform float uRaio; uniform vec2 uTela; uniform vec3 uTom;
        varying vec3 vN; varying vec2 vUv; varying float vV; varying float vZ;
        void main(){
          vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          vec4 tr = texture2D(uTrama, vUv * uRepTrama);
          n = normalize(n + vec3((tr.rg - 0.5) * 2.0 * uRelevo, 0.0));
          vec3 L = normalize(uLuzDir);
          float d = dot(n, L);
          float w = clamp((d + 0.55) / 1.55, 0.0, 1.0);
          float difuso = 0.46 + 0.60 * w * w * (3.0 - 2.0 * w);
          float brilho = pow(1.0 - clamp(n.z, 0.0, 1.0), 4.0) * uBrilho;
          float ao = 1.0;
          if (uProf > 0.0) { float k = clamp(-vZ / uProf, 0.0, 1.0); ao = 1.0 - 0.30 * k * k + 0.04 * clamp(vZ / uProf, 0.0, 1.0); }
          float topo = 1.0 - 0.32 * (1.0 - smoothstep(uTopo, uTopo + 0.045, vV));
          vec3 base = uUsaMapa > 0.5 ? texture2D(uMapa, vUv * uRep).rgb : uCor;
          base *= mix(1.0, 0.85 + 0.3 * tr.b, uVarCor);
          float bainha = 1.0;
          if (uBainha > 0.5) {
            bainha = 1.0 - 0.05 * smoothstep(0.960, 0.964, vV)
              - 0.16 * (smoothstep(0.9655, 0.9675, vV) - smoothstep(0.9685, 0.9705, vV))
              - 0.22 * smoothstep(0.990, 1.0, vV);
          }
          if (uCostura > 0.0) {
            // fita do cabecote (entretela, mais firme e clara) e a costura que a prende
            bainha *= (vV < uCostura ? 1.04 : 1.0) - 0.20 * (smoothstep(uCostura - 0.003, uCostura - 0.001, vV) - smoothstep(uCostura + 0.0005, uCostura + 0.0025, vV));
          }
          float a = 1.0;
          if (uFaixas > 0.0 && fract(vV * uFaixas + uDesloc) > 0.5) a = uAlfaFaixa;
          vec3 c = base * (difuso * ao + brilho) * topo * bainha * uLuzCor * uLuz;
          if (uTransm > 0.0) {
            vec2 p = gl_FragCoord.xy / uTela; vec3 t = vec3(0.0);
            for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) t += texture2D(uAtras, p + vec2(float(i), float(j)) * uRaio * 0.5).rgb;
            t /= 25.0; c = mix(c, t * uTom, uTransm * 0.85) + t * uTom * uTransm * 0.12 * ao;
          }
          c = clamp(c, 0.0, 1.0);
          gl_FragColor = vec4(c * a, a);
        }`;
    const FRAG_METAL = `uniform vec3 uCor; uniform float uEspec; uniform float uDuro; uniform vec3 uLuzDir; uniform vec3 uLuzCor; uniform float uLuz;
        varying vec3 vN; varying vec2 vUv; varying float vV; varying float vZ;
        void main(){
          vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          vec3 L = normalize(uLuzDir), H = normalize(L + vec3(0.0, 0.0, 1.0));
          float amb = mix(0.40, 1.12, smoothstep(-0.7, 0.9, n.y));
          float dif = 0.35 + 0.65 * max(dot(n, L), 0.0);
          float s = pow(max(dot(n, H), 0.0), uDuro) * uEspec;
          vec3 c = (uCor * mix(dif, amb, 0.55) + vec3(s)) * uLuzCor * uLuz;
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`;
    const BLEND = { blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor,
        blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor };

    function _cor(hex, k) { const c = new T.Color(hex); if (k) c.multiplyScalar(k); return c; }
    function _v3(a, padrao) { return Array.isArray(a) ? new T.Vector3(a[0], a[1], a[2]) : padrao.clone(); }
    const LUZ_DIR = new T.Vector3(-0.35, 0.75, 1.0), BRANCO = new T.Vector3(1, 1, 1);

    // o: { hex, mapa, rep, tecido, aspecto, luz, luzCor, luzDir, faixas, desloc, prof, bainha, escurecer, atras: { tex, tela:[w,h] }, transm }
    GR.materialTecido = function (o) {
        o = o || {};
        const tc = GR.tecido(o.tecido), asp = o.aspecto || 1.4, rep = tc.rep;
        const mapa = o.mapa || null;
        const cor = _cor(o.hex || '#cccccc', o.escurecer);
        const transm = o.atras && o.atras.tex ? (o.transm != null ? o.transm : tc.transm) : 0;
        return new T.ShaderMaterial(Object.assign({
            uniforms: {
                uCor: { value: cor }, uMapa: { value: mapa }, uUsaMapa: { value: mapa ? 1 : 0 },
                uRep: { value: new T.Vector2(o.rep || 1, o.rep || 1) },
                uTrama: { value: GR.trama(o.tecido || 'linho') }, uRepTrama: { value: new T.Vector2(rep, rep * asp) },
                uRelevo: { value: (mapa ? 0.4 : 1) * tc.relevo * 0.4 }, uVarCor: { value: mapa ? 0.25 : tc.varCor },
                uLuzDir: { value: _v3(o.luzDir, LUZ_DIR) }, uLuzCor: { value: _v3(o.luzCor, BRANCO) },
                uLuz: { value: o.luz || 1 }, uBrilho: { value: tc.brilho },
                uFaixas: { value: o.faixas || 0 }, uDesloc: { value: o.desloc || 0 }, uAlfaFaixa: { value: 0.22 },
                uProf: { value: o.prof || 0 }, uTopo: { value: o.topo != null ? o.topo : GR.TOPO_TRILHO }, uBainha: { value: o.bainha ? 1 : 0 }, uCostura: { value: o.costura || 0 },
                uAtras: { value: transm ? o.atras.tex : null }, uTransm: { value: transm }, uRaio: { value: tc.raio || 0.01 },
                uTela: { value: new T.Vector2(...(o.atras && o.atras.tela ? o.atras.tela : [1, 1])) },
                uTom: { value: _v3(GR.tomTransmitido(o.hex, !!mapa), BRANCO) }
            },
            vertexShader: VERT, fragmentShader: FRAG_TECIDO, side: T.DoubleSide,
            transparent: !!o.faixas, depthWrite: !o.faixas
        }, BLEND));
    };
    GR.materialMetal = function (hex, o) {
        o = o || {};
        return new T.ShaderMaterial(Object.assign({
            uniforms: {
                uCor: { value: _cor(hex) }, uEspec: { value: o.espec != null ? o.espec : 0.7 }, uDuro: { value: o.duro || 48 },
                uLuzDir: { value: _v3(o.luzDir, LUZ_DIR) }, uLuzCor: { value: _v3(o.luzCor, BRANCO) }, uLuz: { value: o.luz || 1 }
            },
            vertexShader: VERT, fragmentShader: FRAG_METAL, side: T.DoubleSide
        }, BLEND));
    };
    // Cor da luz que atravessa o tecido: mais clara que o tecido (sqrt), o
    // tecido escuro deixa passar pouca luz.
    GR.tomTransmitido = function (hex, foto) {
        if (foto) return [0.78, 0.76, 0.72];
        const c = _cor(hex || '#cccccc');
        return [Math.sqrt(c.r), Math.sqrt(c.g), Math.sqrt(c.b)];
    };

    // ---------- geometria ----------
    // Malha em grade: colunas (x, z) x linhas (v); y da cena = -v.
    // Cortina (op.cortina): dobras um pouco desiguais, mais justas no
    // cabecote, abrindo para baixo, e um leve ondulado na vertical.
    GR.grade = function (xs, zs, v0, v1, linhas, larguraTecido, op) {
        op = op || {};
        const n = xs.length, pos = [], uv = [], idx = [];
        let A = 0;
        zs.forEach(z => { A = Math.max(A, Math.abs(z)); });
        const sem = op.semente || 0;
        const varia = zs.map((_, i) => 1 + 0.26 * (ruido1(i / (n - 1) * 9 + sem, 7 + sem) - 0.5) * 2);
        const fase = zs.map((_, i) => ruido1(i / (n - 1) * 4 + sem, 3 + sem));
        for (let j = 0; j <= linhas; j++) {
            const t = j / linhas, v = v0 + (v1 - v0) * t;
            for (let i = 0; i < n; i++) {
                let z = zs[i];
                if (op.cortina) {
                    const s = i / (n - 1);
                    const cab = 0.72 + 0.28 * Math.min(1, t / 0.07);
                    z = z * varia[i] * cab * (0.86 + 0.32 * t)
                        + Math.max(A, 0.006) * 0.12 * t * Math.sin(2 * Math.PI * (t * 1.15 + fase[i]))
                        + (A < 1e-4 ? 0.0035 * Math.sin(2 * Math.PI * (s * 1.6 + 0.2)) * (0.4 + t) : 0);
                } else if (op.flare) {
                    z = z * (0.85 + 0.3 * t);
                }
                pos.push(xs[i], -v, z);
                uv.push((op.uIni || 0) + (i / (n - 1)) * larguraTecido, 1 - v);
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
    };

    GR.limparCena = function (cena) {
        cena.children.slice().forEach(o => {
            cena.remove(o);
            o.traverse(f => { if (f.geometry) f.geometry.dispose(); if (f.material) f.material.dispose(); });
        });
    };

    // Monta o produto no quadrado unitario (x 0..1, y 0..-1, z para a frente).
    // op: { produto, prega, persiana, abertura, aberto, trilho, hex, mapa, foto,
    //       tecido, luz, luzCor, luzDir, aspecto, atras, colunas, linhas }
    GR.montarProduto = function (cena, op) {
        const G = GaleriaCore;
        GR.limparCena(cena);
        const luz = { luz: op.luz || 1, luzCor: op.luzCor, luzDir: op.luzDir };
        const tecido = extra => GR.materialTecido(Object.assign({
            hex: op.hex, mapa: op.mapa, rep: op.foto ? 1 : 6, tecido: op.tecido, aspecto: op.aspecto, atras: op.atras
        }, luz, extra));
        if (op.produto !== 'persiana') {
            const g = G.geometriaCortina({ prega: op.prega, abertura: op.abertura, aberto: op.aberto, colunas: op.colunas || 140 });
            const prof = Math.max(0.004, ...g.paineis.flatMap(p => p.z.map(Math.abs)));
            const varao = G.visualTrilho(op.trilho) === 'varao';
            g.paineis.forEach((p, k) => {
                const larg = g.abertura === 'central' ? 0.5 : 1;
                const uIni = g.abertura === 'central' && p.lado === 'direita' ? 0.5 : 0;
                cena.add(new T.Mesh(GR.grade(p.x, p.z, GR.TOPO_TRILHO, 1, op.linhas || 40, larg, { cortina: true, uIni, semente: k * 5 + 1 }),
                    tecido({ prof: prof * 1.15, bainha: true })));
                if (varao) {
                    // argolas nos picos das dobras
                    const metal = GR.materialMetal('#7a6a58', Object.assign({ espec: 0.6, duro: 60 }, luz));
                    for (let i = 1; i < p.z.length - 1; i++) {
                        if (!(p.z[i] > p.z[i - 1] && p.z[i] >= p.z[i + 1]) && i !== 1 && i !== p.z.length - 2) continue;
                        const anel = new T.Mesh(new T.TorusGeometry(0.017, 0.0028, 6, 18), metal);
                        anel.rotation.y = Math.PI / 2;
                        anel.position.set(p.x[i], -0.022, 0.05);
                        cena.add(anel);
                    }
                }
            });
            if (varao) {
                const barra = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, 1.02, 24), GR.materialMetal('#6f6458', Object.assign({ espec: 0.9, duro: 70 }, luz)));
                barra.rotation.z = Math.PI / 2; barra.position.set(0.5, -0.02, 0.05);
                cena.add(barra);
                [0.0, 1.0].forEach(x => {
                    const t = new T.Mesh(new T.SphereGeometry(0.021, 24, 14), GR.materialMetal('#6f6458', Object.assign({ espec: 0.9, duro: 70 }, luz)));
                    t.position.set(x, -0.02, 0.05); cena.add(t);
                });
            } else {
                // trilho de aluminio pintado: corpo com aresta clara e tampas
                const corpo = new T.Mesh(new T.BoxGeometry(1.01, 0.026, 0.02), GR.materialMetal('#e6e5e1', Object.assign({ espec: 0.35, duro: 24 }, luz)));
                corpo.position.set(0.5, -0.016, 0.06);
                const friso = new T.Mesh(new T.BoxGeometry(1.01, 0.003, 0.021), GR.materialMetal('#f8f8f6', Object.assign({ espec: 0.6, duro: 40 }, luz)));
                friso.position.set(0.5, -0.004, 0.061);
                cena.add(corpo, friso);
            }
        } else {
            const p = G.geometriaPersiana({ tipo: op.persiana, aberto: op.aberto, linhas: 80 });
            const base = Math.max(0.06, p.baseVisivel);
            const cols = [0, 0.25, 0.5, 0.75, 1];
            const tecPers = op.tecido || (op.persiana === 'rolo' ? 'blackout' : 'linho');
            const tp = extra => tecido(Object.assign({ tecido: tecPers, topo: 0.03 }, extra));
            if (op.persiana === 'romana') {
                const pos = [], uv = [], idx = [], n = p.y.length;
                for (let j = 0; j < n; j++) for (let i = 0; i < cols.length; i++) { pos.push(cols[i], -(0.04 + p.y[j] * 0.96), p.z[j]); uv.push(cols[i], 1 - p.y[j]); }
                for (let j = 0; j < n - 1; j++) for (let i = 0; i < cols.length - 1; i++) { const a = j * cols.length + i, b = a + 1, c = a + cols.length, d = c + 1; idx.push(a, c, b, b, c, d); }
                const g = new T.BufferGeometry();
                g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
                g.setIndex(idx); g.computeVertexNormals();
                cena.add(new T.Mesh(g, tp({ prof: 0.035 })));
            } else if (op.persiana === 'double') {
                const fundo = new T.Mesh(GR.grade(cols, cols.map(() => 0), 0.04, 0.04 + base * 0.96, 4, 1), tp({ tecido: 'voil', faixas: p.faixas, desloc: 0.5 * (1 - p.alinhamento) }));
                fundo.position.z = -0.01;
                const frente = new T.Mesh(GR.grade(cols, cols.map(() => 0), 0.04, 0.04 + base * 0.96, 4, 1), tp({ tecido: 'voil', faixas: p.faixas, desloc: 0 }));
                fundo.renderOrder = 1; frente.renderOrder = 2;
                cena.add(fundo, frente);
            } else {
                // rolo: tecido esticado com leve barriga perto da barra
                const zs = cols.map(() => 0);
                const g = GR.grade(cols, zs, 0.04, 0.04 + base * 0.96, 12, 1);
                const pos = g.attributes.position;
                for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), v = -pos.getY(i); pos.setZ(i, 0.004 * Math.sin(Math.PI * x) * Math.pow(Math.max(0, v), 2)); }
                g.computeVertexNormals();
                cena.add(new T.Mesh(g, tp()));
            }
            let rolo;
            if (op.persiana === 'romana') {
                rolo = new T.Mesh(new T.BoxGeometry(1, 0.04, 0.03), GR.materialMetal('#e4e2dc', Object.assign({ espec: 0.3, duro: 20 }, luz)));
                rolo.position.set(0.5, -0.02, 0.04);
            } else {
                rolo = new T.Mesh(new T.CylinderGeometry(0.026, 0.026, 1, 32), tecido({ tecido: tecPers, escurecer: 0.9, topo: -1 }));
                rolo.rotation.z = Math.PI / 2; rolo.position.set(0.5, -0.026, 0.03);
            }
            const barra = new T.Mesh(new T.BoxGeometry(1, 0.014, 0.012), GR.materialMetal('#d8d8d4', Object.assign({ espec: 0.8, duro: 50 }, luz)));
            barra.position.set(0.5, -(0.04 + base * 0.96), 0.02);
            cena.add(rolo, barra);
        }
    };

    // ---------- estudio: imagens dos modelos ----------
    const FRAG_FUNDO = `uniform vec4 uJanela; uniform float uPiso; uniform vec2 uLuzPos;
        varying vec2 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 p = vW; vec3 c;
          float luz = 0.80 + 0.26 * exp(-dot(p - uLuzPos, p - uLuzPos) * 1.6);
          if (p.y < uPiso) {
            float d = uPiso - p.y;
            float fila = log(1.0 + d * 30.0) * 3.0;
            float tabua = fract(fila), id = floor(fila);
            float veio = 0.5 + 0.5 * sin(p.x * (70.0 + 20.0 * hash(vec2(id, 1.0))) + sin(p.x * 9.0 + id) * 2.0);
            float tom = 0.92 + 0.12 * hash(vec2(id, floor(p.x * 2.0 + id * 0.37)));
            c = vec3(0.64, 0.49, 0.35) * tom * (0.93 + 0.07 * veio) * (1.0 - 0.18 * smoothstep(0.93, 1.0, tabua)) * (1.0 - 0.30 * d) * luz;
            c += vec3(0.05) * exp(-pow((p.x - uLuzPos.x) * 2.2, 2.0)) * (1.0 - d * 3.0);
          } else if (p.y < uPiso + 0.045) {
            float k = (p.y - uPiso) / 0.045;
            c = vec3(0.95, 0.945, 0.93) * (0.86 + 0.10 * k + 0.10 * smoothstep(0.85, 0.95, k)) * luz;
          } else {
            c = vec3(0.92, 0.89, 0.84) * luz * (1.0 - 0.07 * smoothstep(0.4, 1.3, abs(p.x - 0.5)));
            c *= 1.0 - 0.10 * smoothstep(uPiso + 0.12, uPiso + 0.045, p.y);
          }
          if (uJanela.z > uJanela.x) {
            float m = 0.022;
            vec4 J = uJanela;
            if (p.x > J.x - m && p.x < J.z + m && p.y < J.y + m && p.y > J.w - m) {
              bool vidro = p.x > J.x && p.x < J.z && p.y < J.y && p.y > J.w && abs(p.x - (J.x + J.z) * 0.5) > m * 0.45;
              if (vidro) {
                float t = (p.y - J.w) / (J.y - J.w);
                c = mix(vec3(0.97, 0.98, 1.0), vec3(0.80, 0.88, 0.98), t * 0.8);
                c += 0.05 * smoothstep(0.3, 0.0, abs(p.x - p.y * 0.5 - J.x - 0.25));
              } else {
                c = vec3(0.96, 0.96, 0.95) * (0.88 + 0.12 * smoothstep(J.w - m, J.y + m, p.y));
              }
            }
          }
          c += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.012;
          gl_FragColor = vec4(c, 1.0);
        }`;
    const FRAG_COMPOR = `uniform sampler2D uFundo; uniform sampler2D uSombra; uniform vec2 uDesloc; uniform vec2 uPasso;
        varying vec2 vUv;
        void main(){
          vec3 c = texture2D(uFundo, vUv).rgb;
          float s = 0.0;
          for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) s += texture2D(uSombra, vUv - uDesloc + vec2(float(i), float(j)) * uPasso).a;
          gl_FragColor = vec4(c * (1.0 - 0.34 * s / 49.0), 1.0);
        }`;

    let _est = null;
    function _estudio() {
        // contexto perdido (o navegador derruba o contexto 3D mais antigo quando
        // ha muitos abertos): descarta e cria outro, senao a imagem sai em branco
        if (_est && !_est.falhou && _est.r.getContext().isContextLost()) {
            try { _est.r.dispose(); } catch (e) { /* ja perdido */ }
            _est = null;
        }
        if (_est) return _est;
        const canvas = document.createElement('canvas');
        let r;
        try { r = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false }); }
        catch (e) { _est = { falhou: true }; return _est; }
        r.outputColorSpace = T.LinearSRGBColorSpace;
        r.setPixelRatio(1);
        _est = { r, canvas, camP: new T.PerspectiveCamera(30, 4 / 3, 0.05, 20), cam: new T.OrthographicCamera(0, 1, 0, -1, -5, 5), fundoCena: new T.Scene(), sombraCena: new T.Scene(), finalCena: new T.Scene(), tam: null };
        _est.cam.position.z = 2;
        _est.fundoMat = new T.ShaderMaterial({
            uniforms: { uJanela: { value: new T.Vector4() }, uPiso: { value: -1.0 }, uLuzPos: { value: new T.Vector2(0.3, -0.3) } },
            vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xy; gl_Position = projectionMatrix * viewMatrix * w; }',
            fragmentShader: FRAG_FUNDO, depthTest: false, depthWrite: false
        });
        _est.fundo = new T.Mesh(new T.PlaneGeometry(1, 1), _est.fundoMat);
        _est.fundoCena.add(_est.fundo);
        _est.comporMat = new T.ShaderMaterial({
            uniforms: { uFundo: { value: null }, uSombra: { value: null }, uDesloc: { value: new T.Vector2() }, uPasso: { value: new T.Vector2() } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }',
            fragmentShader: FRAG_COMPOR, depthTest: false, depthWrite: false
        });
        _est.compor = new T.Mesh(new T.PlaneGeometry(1, 1), _est.comporMat);
        _est.compor.frustumCulled = false;
        _est.compor.renderOrder = -10;
        _est.finalCena.add(_est.compor);
        _est.sombraMat = new T.MeshBasicMaterial({ color: 0x000000, side: T.DoubleSide });
        return _est;
    }

    function _prepararEstudio(w, h) {
        const E = _estudio();
        if (E.falhou) return null;
        if (!E.tam || E.tam[0] !== w || E.tam[1] !== h) {
            E.r.setSize(w, h, false);
            if (E.rtFundo) { E.rtFundo.dispose(); E.rtSombra.dispose(); }
            E.rtFundo = new T.WebGLRenderTarget(w, h);
            E.rtSombra = new T.WebGLRenderTarget(Math.max(64, w >> 1), Math.max(48, h >> 1));
            E.tam = [w, h];
        }
        return E;
    }

    // Fundo -> sombra borrada do produto -> produto por cima (com a luz do
    // fundo atravessando o tecido). Devolve a imagem ou null se o contexto caiu.
    function _comporEstudio(E, grupo, cam, desloc) {
        const r = E.r;
        r.setRenderTarget(E.rtFundo); r.setClearColor(0xffffff, 1); r.clear(); r.render(E.fundoCena, cam);
        const mats = [];
        grupo.traverse(o => { if (o.material) { mats.push([o, o.material]); o.material = E.sombraMat; } });
        E.sombraCena.add(grupo);
        r.setRenderTarget(E.rtSombra); r.setClearColor(0x000000, 0); r.clear(); r.render(E.sombraCena, cam);
        mats.forEach(([o, m]) => { o.material = m; });
        E.comporMat.uniforms.uFundo.value = E.rtFundo.texture;
        E.comporMat.uniforms.uSombra.value = E.rtSombra.texture;
        E.comporMat.uniforms.uDesloc.value.set(desloc[0], desloc[1]);
        E.comporMat.uniforms.uPasso.value.set(2.2 / E.rtSombra.width, 2.2 / E.rtSombra.height);
        E.finalCena.add(grupo);
        r.setRenderTarget(null); r.setClearColor(0xffffff, 1); r.clear(); r.render(E.finalCena, cam);
        const perdido = r.getContext().isContextLost();
        const url = perdido ? null : E.canvas.toDataURL('image/jpeg', 0.9);
        E.finalCena.remove(grupo);
        grupo.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== E.sombraMat) o.material.dispose(); });
        return url;
    }

    function _renderEstudio(op, w, h) {
        const E = _prepararEstudio(w, h);
        if (!E) return null;
        if (op.enquadramento === 'detalhe') return _renderDetalhe(E, op, w, h);
        const persiana = op.tipo === 'persiana';
        // enquadramento: cortina do teto ao chao; persiana numa janela
        const topo = persiana ? 0.04 : 0.05, base = persiana ? -1.06 : -1.10, altura = topo - base, largura = altura * w / h;
        const cam = E.cam;
        cam.left = 0.5 - largura / 2; cam.right = 0.5 + largura / 2; cam.top = topo; cam.bottom = base; cam.updateProjectionMatrix();
        E.fundo.scale.set(largura, altura, 1); E.fundo.position.set(0.5, (topo + base) / 2, -1);
        const J = persiana ? [0.14, -0.14, 0.86, -0.80] : [0.16, -0.10, 0.84, -0.74];
        E.fundoMat.uniforms.uJanela.value.set(...J);
        E.fundoMat.uniforms.uPiso.value = persiana ? -1.02 : -1.005;
        E.fundoMat.uniforms.uLuzPos.value.set(0.5, (J[1] + J[3]) / 2);
        // produto
        const grupo = new T.Group();
        const prod = new T.Scene();
        const estado = persiana
            ? { produto: 'persiana', persiana: op.chave, aberto: { rolo: 0.18, romana: 0.38, double: 0.3 }[op.chave] || 0.2 }
            : { produto: 'cortina', prega: op.chave, abertura: 'central', aberto: 0.3, trilho: '' };
        GR.montarProduto(prod, Object.assign(estado, {
            hex: op.hex || '#e9e3d6', tecido: op.tecido || (persiana ? null : 'linho'), luz: 1.0, luzCor: [1.03, 1.0, 0.95],
            luzDir: [-0.15, 0.75, 1.0], aspecto: persiana ? 0.85 : 1.15, colunas: 120, linhas: 36,
            atras: { tex: E.rtFundo.texture, tela: [w, h] }
        }));
        prod.children.slice().forEach(o => grupo.add(o));
        if (persiana) { grupo.scale.set(0.80, 0.72, 0.8); grupo.position.set(0.10, -0.10, 0); }
        else { grupo.scale.set(1, 1.0, 1); grupo.position.set(0, 0, 0); }
        return _comporEstudio(E, grupo, cam, [0.012, -0.016]);
    }


    // ---------- detalhe: close do cabecote de um painel ----------
    // Cada prega com o cabecote que a identifica: prega americana (tres dedos
    // costurados na base da entretela, liso entre as pregas), wave (onda funda
    // desde o topo, botoes de pressao na fita), wave plus (onda mais rasa e
    // miuda), franzido (franzido denso e irregular), macho-femea (caixas
    // retas no topo) e painel (liso, ondas largas).
    // x em unidades de mundo; v = distancia abaixo do topo do tecido.
    const DETALHE = {
        'Americana':   { n: 3.2, a: 0.075, cab: 0.11 },
        'Wave Botao':  { n: 3.0, a: 0.085, cab: 0.035 },
        'Wave Plus':   { n: 4.4, a: 0.048, cab: 0.03 },
        'Franzido':    { n: 10,  a: 0.024, cab: 0.04 },
        'Macho-Femea': { n: 3.2, a: 0.06,  cab: 0.12 },
        'Painel':      { n: 0.8, a: 0.014, cab: 0 }
    };
    const _sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    function zDetalhe(prega, x, v) {
        const d = DETALHE[prega] || DETALHE.Americana, t = x * d.n, f = t - Math.floor(t);
        const varia = 1 + 0.18 * (ruido1(t * 0.9 + 2, 5) - 0.5) * 2, cresce = 1 + 0.3 * v;
        switch (prega) {
            case 'Americana': {
                const larg = 0.3, c = larg / 2;
                const dedos = f < larg ? 0.05 * Math.abs(Math.sin(3 * Math.PI * f / larg)) * (1 - 0.45 * _sm(0, d.cab, v)) : 0;
                const dobra = d.a * (0.5 + 0.5 * Math.cos(2 * Math.PI * (f - c))) - d.a * 0.35;
                const w = _sm(d.cab - 0.01, d.cab + 0.13, v);
                return (1 - w) * dedos + w * dobra * varia * cresce;
            }
            case 'Macho-Femea': {
                const caixa = 0.5 * d.a * Math.tanh(6 * Math.sin(2 * Math.PI * t)) / Math.tanh(6);
                const w = _sm(d.cab, d.cab + 0.16, v);
                return (1 - w) * caixa + w * d.a * Math.sin(2 * Math.PI * t) * varia * cresce;
            }
            case 'Franzido': {
                const z = 0.7 * Math.sin(2 * Math.PI * t) + 0.3 * Math.sin(2 * Math.PI * t * 2.3 + 1.3) + 0.5 * (ruido1(t * 2.7, 9) - 0.5);
                return d.a * (z * cresce + 0.6 * Math.sin(2 * Math.PI * t * 3.1) * (1 - _sm(0, d.cab + 0.02, v)));
            }
            case 'Painel':
                return d.a * Math.sin(2 * Math.PI * (t + 0.1)) * (0.4 + v) + 0.004 * Math.sin(2 * Math.PI * (x * 3.1 + v * 1.7));
            default:   // waves: a onda ja nasce no topo
                return d.a * Math.sin(2 * Math.PI * t) * varia * cresce;
        }
    }
    GR.zDetalhe = zDetalhe;

    function _gradeDetalhe(prega, x0, x1, H) {
        const nx = 260, nv = 60, pos = [], uv = [], idx = [];
        // u pelo comprimento do pano (a onda gasta tecido), medido no meio da altura
        const us = [0];
        for (let i = 1; i < nx; i++) {
            const xa = x0 + (x1 - x0) * (i - 1) / (nx - 1), xb = x0 + (x1 - x0) * i / (nx - 1);
            us.push(us[i - 1] + Math.hypot(xb - xa, zDetalhe(prega, xb, H * 0.4) - zDetalhe(prega, xa, H * 0.4)));
        }
        for (let j = 0; j <= nv; j++) {
            const v = H * j / nv;
            for (let i = 0; i < nx; i++) {
                const x = x0 + (x1 - x0) * i / (nx - 1);
                pos.push(x, -v, zDetalhe(prega, x, v));
                uv.push(us[i], 1 - v);
            }
        }
        for (let j = 0; j < nv; j++) for (let i = 0; i < nx - 1; i++) {
            const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
    }

    function _detalheCortina(grupo, op, luz, atras) {
        const prega = DETALHE[op.chave] ? op.chave : 'Americana', d = DETALHE[prega];
        const x0 = -0.35, x1 = 1.35, H = 1.15;
        const tecido = new T.Mesh(_gradeDetalhe(prega, x0, x1, H), GR.materialTecido(Object.assign({
            hex: op.hex || '#e9e3d6', tecido: op.tecido || 'linho', aspecto: 1, topo: 0, costura: d.cab, prof: d.a, atras
        }, luz)));
        // trama na escala do close: repeticao por unidade de mundo
        tecido.material.uniforms.uRepTrama.value.set(4.5, 4.5);
        grupo.add(tecido);
        const metal = (hex, e, duro) => GR.materialMetal(hex, Object.assign({ espec: e, duro }, luz));
        const trilho = new T.Mesh(new T.BoxGeometry(x1 - x0 + 0.2, 0.03, 0.04), metal('#e8e7e3', 0.4, 26));
        trilho.position.set(0.5, 0.04, 0);
        const friso = new T.Mesh(new T.BoxGeometry(x1 - x0 + 0.2, 0.004, 0.041), metal('#fafaf8', 0.7, 40));
        friso.position.set(0.5, 0.055, 0);
        grupo.add(trilho, friso);
        // pontos de fixacao: botoes de pressao (wave botao), carrinhos com gancho (demais)
        const n = d.n, pontos = [];
        if (prega === 'Wave Botao' || prega === 'Wave Plus') { for (let k = Math.ceil(x0 * n * 2); k <= x1 * n * 2; k++) pontos.push((k + 0.5) / (2 * n)); }
        else if (prega === 'Americana') { for (let k = Math.ceil(x0 * n); k <= x1 * n; k++) pontos.push((k + 0.15) / n); }
        else if (prega === 'Macho-Femea') { for (let k = Math.ceil(x0 * n); k <= x1 * n; k++) pontos.push((k + 0.25) / n); }
        else { for (let x = x0 + 0.05; x < x1; x += prega === 'Franzido' ? 0.09 : 0.14) pontos.push(x); }
        pontos.forEach(x => {
            const z = zDetalhe(prega, x, 0.018);
            const carrinho = new T.Mesh(new T.BoxGeometry(0.016, 0.03, 0.014), metal('#d9d7d1', 0.3, 20));
            carrinho.position.set(x, 0.012, Math.max(-0.01, Math.min(0.01, z * 0.4)));
            grupo.add(carrinho);
            if (prega === 'Wave Botao') {
                const botao = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.005, 20), metal('#b9b6ae', 1.0, 80));
                botao.rotation.x = Math.PI / 2;
                botao.position.set(x, -0.018, z + 0.004 * (z < 0 ? -1 : 1));
                grupo.add(botao);
            }
        });
    }

    function _renderDetalhe(E, op, w, h) {
        const persiana = op.tipo === 'persiana';
        const cam = E.camP;
        cam.aspect = w / h; cam.fov = 28;
        let alvo, olho;
        const grupo = new T.Group();
        const luz = { luz: 1.0, luzCor: [1.03, 1.0, 0.95], luzDir: [-0.5, 0.6, 1.0] };
        const atras = { tex: E.rtFundo.texture, tela: [w, h] };
        if (persiana) {
            const aberto = { rolo: 0.15, romana: 0.45, double: 0.28 }[op.chave] || 0.2;
            const prod = new T.Scene();
            GR.montarProduto(prod, Object.assign({ produto: 'persiana', persiana: op.chave, aberto, hex: op.hex || '#e9e3d6',
                tecido: op.tecido || null, aspecto: 1, atras }, luz));
            prod.children.slice().forEach(o => grupo.add(o));
            grupo.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.uRepTrama) o.material.uniforms.uRepTrama.value.set(5, 5); });
            const g = GaleriaCore.geometriaPersiana({ tipo: op.chave, aberto, linhas: 10 });
            const yb = -(0.04 + Math.max(0.06, g.baseVisivel) * 0.96);
            alvo = new T.Vector3(0.55, op.chave === 'double' ? -0.42 : yb + 0.14, 0);
            olho = new T.Vector3(1.05, alvo.y + 0.42, 1.45);
            E.fundoMat.uniforms.uJanela.value.set(0.03, -0.03, 0.97, -1.02);
            E.fundoMat.uniforms.uPiso.value = -5;
            E.fundoMat.uniforms.uLuzPos.value.set(0.5, -0.5);
        } else {
            _detalheCortina(grupo, op, luz, atras);
            alvo = new T.Vector3(0.45, -0.30, 0);
            olho = new T.Vector3(1.25, 0.42, 1.6);
            E.fundoMat.uniforms.uJanela.value.set(0, 0, 0, 0);
            E.fundoMat.uniforms.uPiso.value = -5;
            E.fundoMat.uniforms.uLuzPos.value.set(-0.2, 0.1);
        }
        cam.position.copy(olho); cam.lookAt(alvo); cam.updateProjectionMatrix();
        // parede atras, grande o bastante para cobrir o quadro
        E.fundo.scale.set(6, 6, 1); E.fundo.position.set(0.5, -0.5, -0.16);
        return _comporEstudio(E, grupo, cam, [0.018, -0.024]);
    }

    const _cache = new Map();
    let _fila = Promise.resolve();
    // renderizarImagemModelo({ tipo: 'prega'|'persiana', chave, hex, largura, altura, tecido, enquadramento })
    // -> Promise<string|null>: data URL JPEG (null sem 3D). O tamanho e em px de
    // tela; a imagem sai com ate 2x isso para ficar nitida.
    // enquadramento: 'ambiente' (padrao: parede, janela e piso, o produto
    // inteiro) ou 'detalhe' (close de 3/4 do cabecote de um painel, com o
    // trilho; persiana: barra inferior, dobras ou faixas de perto).
    function renderizarImagemModelo(op) {
        op = op || {};
        const tipo = op.tipo === 'persiana' ? 'persiana' : 'prega';
        const valido = tipo === 'persiana' ? GaleriaCore.PERSIANAS[op.chave] : GaleriaCore.PREGAS[op.chave];
        if (!valido) return Promise.resolve(null);
        const enq = op.enquadramento === 'detalhe' ? 'detalhe' : 'ambiente';
        const k = Math.min(2, Math.max(1, (raiz.devicePixelRatio || 1)));
        const w = Math.max(32, Math.min(1280, Math.round((op.largura || 320) * k)));
        const h = Math.max(24, Math.min(1280, Math.round((op.altura || 240) * k)));
        const chave = [tipo, op.chave, String(op.hex || '').toLowerCase(), op.tecido || '', enq, w, h].join('|');
        if (_cache.has(chave)) return _cache.get(chave);
        const pedido = { tipo, chave: op.chave, hex: op.hex, tecido: op.tecido, enquadramento: enq };
        const fazer = () => {
            let url = null;
            // contexto caiu no meio: um contexto novo e mais uma tentativa
            for (let i = 0; i < 2 && !url; i++) {
                try { url = _renderEstudio(pedido, w, h); } catch (e) { url = null; }
            }
            return url;
        };
        // setTimeout (e nao requestAnimationFrame): numa aba em segundo plano o
        // quadro nao vem e a fila ficaria parada; o intervalo ainda deixa a tela respirar
        const p = _fila = _fila.then(() => new Promise(ok => setTimeout(() => ok(fazer()), 0)));
        _cache.set(chave, p);
        // falhou: sai do cache para a proxima chamada tentar de novo
        p.then(url => { if (!url) _cache.delete(chave); });
        return p;
    }

    raiz.GaleriaRender = GR;
    raiz.renderizarImagemModelo = renderizarImagemModelo;
})(typeof window !== 'undefined' ? window : null);
