'use strict';
// Desenho da cortina de tecido instalada no ambiente, com o tipo de abertura e a
// prega de cada tecido (uma camada por tecido; o primeiro fica na frente).
// So funcoes puras que devolvem texto SVG: roda no navegador e em `node --test`.
// O script scripts/gerar-aberturas-ambiente.js usa este modulo para gerar as
// imagens fixas de images/Aberturas/Ambiente/ (prega Americana, uma camada).
//
// A imagem tem duas partes: a cena (o ambiente com a cortina, 1200 de largura) e,
// a direita, uma coluna com uma lupa por camada mostrando o alto da cortina ampliado.
(function (raiz) {

    const ABERTURAS = {
        A: { rec: 'esq',    cmd: 'esq', sub: 'Recolhimento à Esquerda / Comando à Esquerda' },
        B: { rec: 'dir',    cmd: 'dir', sub: 'Recolhimento à Direita / Comando à Direita' },
        C: { rec: 'lados',  cmd: 'esq', sub: 'Abertura Central / Comando à Esquerda' },
        D: { rec: 'lados',  cmd: 'dir', sub: 'Abertura Central / Comando à Direita' },
        E: { rec: 'esq',    cmd: 'dir', sub: 'Recolhimento à Esquerda / Comando à Direita' },
        F: { rec: 'dir',    cmd: 'esq', sub: 'Recolhimento à Direita / Comando à Esquerda' },
        G: { rec: 'centro', cmd: 'esq', sub: 'Recolhimento Central / Comando à Esquerda' },
        H: { rec: 'centro', cmd: 'dir', sub: 'Recolhimento Central / Comando à Direita' },
    };

    // Rotulos iguais aos do select "Tipo de Prega" do pedido.
    const PREGAS = {
        'Americana':   'Prega Americana',
        'Wave Botao':  'Wave Botão',
        'Wave Plus':   'Wave Plus/Flex',
        'Franzido':    'Franzido',
        'Macho-Femea': 'Prega Macho-Fêmea',
        'Painel':      'Painel / Sem Prega'
    };
    const PREGA_PADRAO = 'Americana';
    const MAX_CAMADAS = 3;

    const W = 1200, H = 660;        // cena
    const COLUNA = 300;             // coluna das lupas, a direita da cena
    const WT = W + COLUNA;
    const TETO = 38, RODAPE = 572, PISO = 588;
    const TRILHO = { x1: 148, x2: 1052, y: 74, h: 14 };
    const JANELA = { x: 196, y: 122, w: 808, h: 392, b: 13 };
    const BASE = 556;              // barra da cortina, logo acima do rodape
    const PILHA = 196;             // largura da cortina recolhida (camada da frente)
    const DEGRAU_CAMADA = { x: 34, y: 11 };   // camada de tras: trilho mais alto e pilha mais larga

    // Tons de cada camada (frente, meio, fundo): linho, voil branco, blackout fendi.
    const TONS = ['#CDBEA6', '#F2EFE8', '#8F806D'];

    const f = n => Math.round(n * 10) / 10;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function normalizarPrega(p) {
        return Object.prototype.hasOwnProperty.call(PREGAS, p) ? p : PREGA_PADRAO;
    }

    function normalizarAbertura(a) {
        return Object.prototype.hasOwnProperty.call(ABERTURAS, a) ? a : 'A';
    }

    // ---- cor ----
    function _rgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    // k > 0 clareia (luz quente da janela), k < 0 escurece (sombra marrom-acinzentada).
    function tom(hex, k) {
        const alvo = k >= 0 ? [255, 250, 240] : [38, 31, 26];
        const a = Math.min(1, Math.abs(k));
        const c = _rgb(hex).map((v, i) => Math.round(v + (alvo[i] - v) * a));
        return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
    }

    // ---- pregas ----
    // Cada prega e uma sequencia de "gomos" iguais lado a lado. `larg` e a largura do
    // gomo com a cortina recolhida; `perfil` e o sombreamento de um lado ao outro do
    // gomo, como luz batendo num volume: vale fundo e escuro, crista com brilho
    // estreito (o primeiro e o ultimo valor sao iguais, para os gomos emendarem).
    const MODELO = {
        'Americana':   { larg: 30, barra: 3, perfil: [[0, .26], [.3, .30], [.38, .06], [.43, -.42], [.47, -.18], [.5, .46], [.53, -.12], [.57, -.40], [.62, .04], [.7, .30], [1, .26]] },
        'Wave Botao':  { larg: 28, barra: 7, perfil: [[0, -.02], [.12, -.30], [.25, -.52], [.38, -.26], [.5, .02], [.62, .28], [.71, .50], [.76, .58], [.84, .32], [1, -.02]] },
        'Wave Plus':   { larg: 34, barra: 10, perfil: [[0, -.04], [.12, -.36], [.25, -.60], [.38, -.30], [.5, .02], [.62, .30], [.7, .52], [.75, .62], [.83, .36], [1, -.04]] },
        'Franzido':    { larg: 9, barra: 2.5, perfil: [[0, .06], [.2, -.20], [.35, -.38], [.55, .10], [.72, .40], [.85, .20], [1, .06]] },
        'Macho-Femea': { larg: 32, barra: 0, perfil: [[0, -.46], [.04, -.2], [.08, .16], [.14, .32], [.5, .36], [.86, .30], [.92, .14], [.96, -.2], [1, -.46]] },
        'Painel':      { larg: 49, barra: 0, perfil: [[0, -.12], [.3, .14], [.55, .26], [.8, .12], [1, -.12]] }
    };

    function _idPrega(prega) { return prega.replace(/[^A-Za-z]/g, ''); }

    function _gradientes(camadas) {
        return camadas.map((prega, i) => {
            const m = MODELO[prega], cor = TONS[i];
            const id = `dobra${i}${_idPrega(prega)}`;
            const stops = m.perfil.map(([o, k]) => `<stop offset="${o}" stop-color="${tom(cor, k)}"/>`).join('');
            // Franzido: um segundo gomo com as dobras mais rasas, para o franzido nao ficar regular demais.
            const extra = prega === 'Franzido'
                ? `<linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="0">${m.perfil.map(([o, k]) => `<stop offset="${o}" stop-color="${tom(cor, k * .65 + .05)}"/>`).join('')}</linearGradient>`
                : '';
            return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>${extra}
  <linearGradient id="cabecote${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tom(cor, .32)}"/><stop offset=".8" stop-color="${tom(cor, .16)}"/><stop offset="1" stop-color="${tom(cor, -.1)}"/></linearGradient>`;
        }).join('\n  ');
    }

    // Corpo do gomo, centrado em x = 0 (largura u, do topo ate a barra). Os gomos
    // se sobrepoem 1,5 de cada lado, para o tecido nao abrir fresta quando balanca.
    function _corpo(prega, u, topo, camada, idx) {
        const m = MODELO[prega];
        const id = `dobra${camada}${_idPrega(prega)}` + (prega === 'Franzido' && idx % 3 === 1 ? 'b' : '');
        const e = -u / 2 - 1.5, d = u / 2 + 1.5, a = m.barra;
        let caminho;
        if (prega === 'Wave Botao' || prega === 'Wave Plus') {
            // barra ondulada: a crista (clara) desce, o vale (escuro) sobe
            caminho = `M${f(e)} ${topo} H${f(d)} V${BASE} Q${f(u / 4)} ${BASE + a} 0 ${BASE} Q${f(-u / 4)} ${BASE - a} ${f(e)} ${BASE} Z`;
        } else if (prega === 'Franzido') {
            // topo franzido: uma pequena "bolha" de tecido acima do cadarco em cada dobra
            caminho = `M${f(e)} ${topo} Q0 ${topo - 6} ${f(d)} ${topo} V${BASE} Q0 ${BASE + a} ${f(e)} ${BASE} Z`;
        } else if (a) {
            caminho = `M${f(e)} ${topo} H${f(d)} V${BASE} Q0 ${BASE + a} ${f(e)} ${BASE} Z`;
        } else {
            caminho = `M${f(e)} ${topo} H${f(d)} V${BASE} H${f(e)} Z`;
        }
        const linha = 'vector-effect="non-scaling-stroke"';
        const escuro = tom(TONS[camada], -.5);
        // barra costurada: uma costura um pouco acima da ponta
        let extra = `<line x1="${f(e)}" y1="${BASE - 15}" x2="${f(d)}" y2="${BASE - 15}" stroke="${escuro}" stroke-opacity=".28" stroke-width="1" stroke-dasharray="3 2" ${linha}/>`;
        if (prega === 'Americana') {
            // entretela do cabecote: faixa mais clara e lisa no alto
            extra += `<rect x="${f(e)}" y="${topo}" width="${f(d - e)}" height="30" fill="url(#cabecote${camada})" opacity=".6"/>`;
        } else if (prega === 'Macho-Femea') {
            // costura das macho-femea: as dobras ficam presas no alto e abrem embaixo
            extra += `<rect x="${f(e)}" y="${topo}" width="${f(d - e)}" height="34" fill="url(#cabecote${camada})" opacity=".55"/>
        <line x1="${f(-u / 2 + 1)}" y1="${topo + 2}" x2="${f(-u / 2 + 1)}" y2="${topo + 34}" stroke="${escuro}" stroke-width="1.3" ${linha}/>
        <line x1="${f(u / 2 - 1)}" y1="${topo + 2}" x2="${f(u / 2 - 1)}" y2="${topo + 34}" stroke="${escuro}" stroke-width="1.3" ${linha}/>
        <line x1="${f(e)}" y1="${topo + 34}" x2="${f(d)}" y2="${topo + 34}" stroke="${escuro}" stroke-opacity=".6" stroke-width="1" stroke-dasharray="2 2" ${linha}/>`;
        } else if (prega === 'Painel') {
            extra += `<rect x="${f(e)}" y="${topo}" width="${f(d - e)}" height="18" fill="url(#cabecote${camada})" opacity=".55"/>
        <line x1="${f(e)}" y1="${topo + 18}" x2="${f(d)}" y2="${topo + 18}" stroke="${escuro}" stroke-opacity=".5" stroke-width="1" ${linha}/>`;
        } else if (prega === 'Franzido') {
            extra += `<line x1="${f(e)}" y1="${topo + 9}" x2="${f(d)}" y2="${topo + 9}" stroke="${escuro}" stroke-opacity=".7" stroke-width="1.1" stroke-dasharray="1.5 1.5" ${linha}/>`;
        }
        return `<path d="${caminho}" fill="url(#${id})"/>
        <path d="${caminho}" fill="url(#volume)"/>
        ${extra}`;
    }

    // Detalhe do alto do gomo que nao estica nem balanca (botao, prega, deslizante).
    function _cabeca(prega, u, topo, yTrilho, camada) {
        const cor = TONS[camada];
        const gancho = (x) => `<rect x="${f(x - 1.5)}" y="${yTrilho + TRILHO.h - 2}" width="3" height="${topo - yTrilho - TRILHO.h + 5}" rx="1" fill="url(#metal)" stroke="#A9ACB0" stroke-width=".5"/>`;
        if (prega === 'Americana') {
            // tres dobrinhas presas por uma costura, com o gancho no meio
            const gomo = (x, k) => `<ellipse cx="${x}" cy="${topo + 12}" rx="2.4" ry="12" fill="${tom(cor, k)}" stroke="${tom(cor, -.4)}" stroke-width=".5"/>`;
            return `${gancho(0)}<ellipse cx="0" cy="${topo + 25}" rx="6" ry="2.5" fill="#000" opacity=".18"/>${gomo(-3.8, -.12)}${gomo(3.8, -.2)}${gomo(0, .38)}
        <rect x="-6" y="${topo + 22.5}" width="12" height="2.6" rx="1.2" fill="${tom(cor, -.45)}"/>`;
        }
        if (prega === 'Wave Botao') {
            // botao de pressao no vale da onda
            const x = f(-u / 4);
            return `${gancho(x)}<circle cx="${x}" cy="${topo + 5.5}" r="3.8" fill="url(#botao)" stroke="${tom(cor, -.5)}" stroke-width=".7"/>
        <circle cx="${x}" cy="${topo + 5.5}" r="1.3" fill="${tom(cor, -.6)}"/>`;
        }
        if (prega === 'Wave Plus') {
            // fita com deslizantes: um carrinho no vale de cada onda
            const x = f(-u / 4);
            return `<rect x="${f(x - 3.2)}" y="${yTrilho + TRILHO.h - 3}" width="6.4" height="${topo - yTrilho - TRILHO.h + 8}" rx="1.5" fill="url(#metal)" stroke="#9EA1A6" stroke-width=".6"/>
        <rect x="${f(-u / 2)}" y="${topo}" width="${u}" height="5" fill="${tom(cor, -.25)}" opacity=".6"/>`;
        }
        if (prega === 'Franzido') return '';
        if (prega === 'Macho-Femea') return gancho(f(-u / 2 + 1)) + gancho(f(u / 2 - 1));
        return gancho(0);
    }

    // Faixas (posicao final e posicao com a cortina fechada) de cada painel da camada.
    function _paineis(rec, camada) {
        const larg = PILHA + DEGRAU_CAMADA.x * camada;
        const ini = TRILHO.x1 + 14, fim = TRILHO.x2 - 14, meio = W / 2;
        if (rec === 'esq') return [{ a: ini, b: ini + larg, ca: ini, cb: fim }];
        if (rec === 'dir') return [{ a: fim - larg, b: fim, ca: ini, cb: fim }];
        if (rec === 'centro') return [{ a: meio - larg / 2, b: meio + larg / 2, ca: ini, cb: fim }];
        return [{ a: ini, b: ini + larg, ca: ini, cb: meio + 2 }, { a: fim - larg, b: fim, ca: meio - 2, cb: fim }];
    }

    // ---- animacao ----
    // A cortina comeca fechada cobrindo a janela e recolhe; o quadro final e igual a
    // imagem parada. Deslocamento e largura dos gomos usam a mesma curva, para o tecido
    // continuar emendado. Enquanto corre, a barra fica para tras (inercia e resistencia
    // do ar) e, quando o trilho para, ela passa um pouco do ponto e balanca ate assentar.
    const ANIM = { inicio: 0.4, dur: 2.4, tempos: '0;0.15;1', curva: '0 0 1 1;.45 0 .25 1' };
    const BALANCO = {
        dur: 3.9,                                        // vai alem do deslocamento: o balanco assenta depois
        tempos: '0;0.09;0.27;0.5;0.66;0.79;0.9;1',
        fatores: [0, 0, -1, 0, .42, -.18, .07, 0],      // x amplitude, no sentido do movimento
        grauMax: 4.2
    };
    const anima = (tipo, valores) => `<animateTransform attributeName="transform" type="${tipo}" values="${valores}" keyTimes="${ANIM.tempos}" calcMode="spline" keySplines="${ANIM.curva}" begin="${ANIM.inicio}s" dur="${ANIM.dur}s" fill="freeze"/>`;

    function _balanco(desloc, maxDesloc, ordem) {
        if (!maxDesloc) return '';
        const sentido = Math.sign(desloc);
        const amp = BALANCO.grauMax * Math.abs(desloc) / maxDesloc;
        // skewX positivo leva a barra para a direita; atrasada = contra o sentido do movimento
        const valores = BALANCO.fatores.map(k => f(k * amp * sentido * 100) / 100).join(';');
        const n = BALANCO.fatores.length - 1;
        const curvas = Array(n).fill('.42 0 .58 1').join(';');
        const atraso = f((ANIM.inicio + ordem * 0.12) * 100) / 100;
        return `<animateTransform attributeName="transform" type="skewX" values="${valores}" keyTimes="${BALANCO.tempos}" calcMode="spline" keySplines="${curvas}" begin="${atraso}s" dur="${BALANCO.dur}s" fill="freeze"/>`;
    }

    function _camada(rec, prega, camada, animado) {
        const m = MODELO[prega];
        const yTrilho = TRILHO.y - DEGRAU_CAMADA.y * camada;
        const topo = yTrilho + TRILHO.h + 4;
        const gomos = [];
        _paineis(rec, camada).forEach(p => {
            const n = Math.max(2, Math.round((p.b - p.a) / m.larg));
            const u = (p.b - p.a) / n, uc = (p.cb - p.ca) / n;
            const escala = f(uc / u * 100) / 100;
            const deslocs = Array.from({ length: n }, (_, i) => (p.a + u * (i + .5)) - (p.ca + uc * (i + .5)));
            const maxDesloc = Math.max(...deslocs.map(Math.abs));
            for (let i = 0; i < n; i++) {
                const xf = f(p.a + u * (i + .5)), xc = f(p.ca + uc * (i + .5));
                const corpo = _corpo(prega, u, topo, camada, i);
                const cabeca = _cabeca(prega, u, topo, yTrilho, camada);
                if (!animado) {
                    gomos.push(`<g transform="translate(${xf} 0)"><g>${corpo}</g>${cabeca}</g>`);
                    continue;
                }
                const fx = `${xc} 0`, ax = `${xf} 0`, ef = `${escala} 1`;
                // o gomo que corre mais (a ponta da cortina) puxa o balanco; os outros vem logo depois
                const ordem = maxDesloc ? 1 - Math.abs(deslocs[i]) / maxDesloc : 0;
                gomos.push(`<g transform="translate(${fx})">${anima('translate', `${fx};${fx};${ax}`)}
      <g transform="translate(0 ${topo})"><g>${_balanco(deslocs[i], maxDesloc, ordem)}<g transform="translate(0 ${-topo})">
      <g transform="scale(${ef})">${anima('scale', `${ef};${ef};1 1`)}
        ${corpo}
      </g></g></g></g>${cabeca}</g>`);
            }
        });
        return `<g filter="url(#sombraCortina)"><g filter="url(#tecido)">
    ${gomos.join('\n    ')}
  </g></g>`;
    }

    // ---- cena (parede, piso, janela, trilho, comando, luz) ----
    function _defs(camadas, lupas) {
        const { x, y, w, h, b } = JANELA;
        const meio = x + w / 2;
        return `<defs>
  <radialGradient id="parede" cx="${W / 2}" cy="${y + h / 2}" r="780" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#F4EEE5"/><stop offset=".5" stop-color="#E4DACB"/><stop offset="1" stop-color="#BFB3A2"/>
  </radialGradient>
  <linearGradient id="teto" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#E2DCD3"/><stop offset="1" stop-color="#CCC4B8"/>
  </linearGradient>
  <linearGradient id="piso" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7E5B3E"/><stop offset=".5" stop-color="#946D4B"/><stop offset="1" stop-color="#6B4B31"/>
  </linearGradient>
  <linearGradient id="luzPiso" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFF4DE" stop-opacity=".6"/><stop offset="1" stop-color="#FFF4DE" stop-opacity=".1"/>
  </linearGradient>
  <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#86B2DE"/><stop offset=".6" stop-color="#C6DDF0"/><stop offset="1" stop-color="#EAF1F3"/>
  </linearGradient>
  <linearGradient id="aluminio" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#F1F2F3"/><stop offset=".6" stop-color="#D9DCDF"/><stop offset="1" stop-color="#AEB2B7"/>
  </linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#C9CCD0"/><stop offset=".45" stop-color="#FFFFFF"/><stop offset="1" stop-color="#A3A7AC"/>
  </linearGradient>
  <radialGradient id="botao" cx=".35" cy=".35" r=".7">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#D8D2C8"/><stop offset="1" stop-color="#8E877C"/>
  </radialGradient>
  <linearGradient id="caixilho" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FAFAFA"/><stop offset="1" stop-color="#D1D4D7"/>
  </linearGradient>
  <linearGradient id="volume" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1B140E" stop-opacity=".34"/><stop offset=".05" stop-color="#1B140E" stop-opacity=".08"/>
    <stop offset=".12" stop-color="#1B140E" stop-opacity="0"/><stop offset=".45" stop-color="#FFF8EA" stop-opacity=".08"/>
    <stop offset=".85" stop-color="#1B140E" stop-opacity=".06"/><stop offset="1" stop-color="#1B140E" stop-opacity=".26"/>
  </linearGradient>
  ${_gradientes(camadas)}
  <linearGradient id="reflexo" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#FFF" stop-opacity="0"/><stop offset=".5" stop-color="#FFF" stop-opacity=".35"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="vinheta" cx=".5" cy=".5" r=".75">
    <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/>
  </radialGradient>
  <radialGradient id="brilhoJanela" cx="${W / 2}" cy="${y + h / 2}" r="560" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFF8EC" stop-opacity=".65"/><stop offset="1" stop-color="#FFF8EC" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="luzNaCortina" cx="${W / 2}" cy="${y + h * .4}" r="520" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFF6E2" stop-opacity=".55"/><stop offset=".6" stop-color="#FFF6E2" stop-opacity=".12"/><stop offset="1" stop-color="#FFF6E2" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="fundoLupa" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#EEE7DC"/><stop offset="1" stop-color="#D9CFC0"/>
  </linearGradient>
  <linearGradient id="coluna" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#E9E3D9"/><stop offset=".05" stop-color="#F5F1EA"/><stop offset="1" stop-color="#F1ECE4"/>
  </linearGradient>
  <clipPath id="cena"><rect width="${W}" height="${H}"/></clipPath>
  <clipPath id="vaos">
    <rect x="${x + b}" y="${y + b}" width="${w / 2 - b * 1.5}" height="${h - 2 * b}"/>
    <rect x="${meio + b / 2}" y="${y + b}" width="${w / 2 - b * 1.5}" height="${h - 2 * b}"/>
  </clipPath>
  <clipPath id="pisoClip"><rect x="0" y="${PISO}" width="${W}" height="${H - PISO}"/></clipPath>
  ${lupas.map(l => `<clipPath id="lupa${l.i}"><circle cx="${l.cx}" cy="${l.cy}" r="${l.r}"/></clipPath>`).join('')}
  <filter id="desfoque4" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="desfoque2"><feGaussianBlur stdDeviation="1.6"/></filter>
  <filter id="desfoque12" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
  <filter id="sombra" x="-10%" y="-20%" width="120%" height="150%">
    <feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#3A2E22" flood-opacity=".28"/>
  </filter>
  <filter id="sombraCortina" x="-15%" y="-5%" width="135%" height="120%">
    <feDropShadow dx="2" dy="3" stdDeviation="2.5" flood-color="#241B12" flood-opacity=".35" result="perto"/>
    <feDropShadow dx="12" dy="9" stdDeviation="13" flood-color="#241B12" flood-opacity=".34"/>
  </filter>
  <filter id="tecido" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="1.5 0.03" numOctaves="2" seed="4" result="urdume"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.03 1.2" numOctaves="1" seed="11" result="trama"/>
    <feBlend in="urdume" in2="trama" mode="multiply" result="fios"/>
    <feColorMatrix in="fios" type="matrix" values="0 0 0 0 .28  0 0 0 0 .23  0 0 0 0 .18  0 0 0 .42 -.15" result="fiosCor"/>
    <feComposite in="fiosCor" in2="SourceGraphic" operator="in" result="textura"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="textura"/></feMerge>
  </filter>
  <filter id="reboco" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="3" seed="21"/>
    <feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .40  0 0 0 0 .34  0 0 0 .09 0"/>
  </filter>
  <filter id="grao" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="9"/>
    <feColorMatrix type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .06 0"/>
  </filter>
  <filter id="veios" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.18" numOctaves="3" seed="2"/>
    <feColorMatrix type="matrix" values="0 0 0 0 .25  0 0 0 0 .14  0 0 0 0 .06  0 0 0 .55 -.1"/>
  </filter>
</defs>`;
    }

    // Luz do ambiente: com a cortina fechada o comodo fica mais escuro e a luz da
    // janela atravessa o tecido; conforme ela abre, o comodo clareia. A imagem parada
    // e a cortina aberta: luz cheia.
    const luzAnim = (valores) => `<animate attributeName="opacity" values="${valores}" keyTimes="${ANIM.tempos}" calcMode="spline" keySplines="${ANIM.curva}" begin="${ANIM.inicio}s" dur="${ANIM.dur}s" fill="freeze"/>`;

    function _ambiente(animado) {
        // Piso: tabuas fugindo para um ponto de fuga acima da janela.
        const fuga = { x: W / 2, y: 260 };
        const tabuas = [];
        for (let i = -16; i <= 16; i++) {
            const xTopo = W / 2 + i * 58;
            const t = (H - fuga.y) / (PISO - fuga.y);
            const xBase = fuga.x + (xTopo - fuga.x) * t;
            tabuas.push(`<line x1="${f(xTopo)}" y1="${PISO}" x2="${f(xBase)}" y2="${H}"/>`);
        }
        const { x, w } = JANELA;
        const brilho = animado ? ` opacity=".25">${luzAnim('.25;.25;1')}</rect>` : '/>';
        return `<rect width="${W}" height="${H}" fill="url(#parede)"/>
  <rect width="${W}" height="${H}" filter="url(#reboco)"/>
  <rect width="${W}" height="${H}" fill="url(#brilhoJanela)"${brilho}
  <rect width="${W}" height="${TETO}" fill="url(#teto)"/>
  <rect y="${TETO - 6}" width="${W}" height="6" fill="#F3EFE9"/>
  <rect y="${TETO}" width="${W}" height="16" fill="#000" opacity=".08" filter="url(#desfoque4)"/>
  <rect y="${PISO}" width="${W}" height="${H - PISO}" fill="url(#piso)"/>
  <rect y="${PISO}" width="${W}" height="${H - PISO}" filter="url(#veios)"/>
  <g clip-path="url(#pisoClip)" stroke="#3E2817" stroke-opacity=".3" stroke-width="1.4">${tabuas.join('')}</g>
  <polygon points="${x + 30},${PISO} ${x + w - 30},${PISO} ${x + w + 140},${H} ${x + 110},${H}" fill="url(#luzPiso)" filter="url(#desfoque12)"${animado ? ` opacity=".2">${luzAnim('.2;.2;1')}</polygon>` : '/>'}
  <rect y="${RODAPE}" width="${W}" height="${PISO - RODAPE}" fill="#F7F5F1"/>
  <rect y="${RODAPE}" width="${W}" height="2" fill="#FFFFFF"/>
  <rect y="${PISO}" width="${W}" height="5" fill="#000" opacity=".24" filter="url(#desfoque2)"/>`;
    }

    function _vista() {
        const { x, y, w, h } = JANELA;
        const fundo = y + h;
        // Nuvens, morros e arvores fora de foco (profundidade de campo).
        return `<g clip-path="url(#vaos)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#ceu)"/>
    <g fill="#FFFFFF" opacity=".85" filter="url(#desfoque12)">
      <ellipse cx="${x + 140}" cy="${y + 70}" rx="110" ry="26"/><ellipse cx="${x + 230}" cy="${y + 60}" rx="70" ry="22"/>
      <ellipse cx="${x + 560}" cy="${y + 105}" rx="150" ry="28"/><ellipse cx="${x + 700}" cy="${y + 50}" rx="90" ry="20"/>
    </g>
    <path d="M${x} ${fundo - 150} C${x + 160} ${fundo - 210} ${x + 300} ${fundo - 170} ${x + 420} ${fundo - 200} S${x + 700} ${fundo - 150} ${x + w} ${fundo - 185} V${fundo} H${x} Z" fill="#9FB3A6" filter="url(#desfoque4)"/>
    <g filter="url(#desfoque4)">
      <rect x="${x + 470}" y="${fundo - 230}" width="60" height="140" fill="#C3CBD2"/>
      <rect x="${x + 540}" y="${fundo - 190}" width="44" height="100" fill="#B4BEC7"/>
      <rect x="${x + 120}" y="${fundo - 200}" width="50" height="110" fill="#BAC3CB"/>
    </g>
    <g filter="url(#desfoque4)">
      ${[[60, 120, 70], [150, 105, 60], [260, 125, 75], [380, 110, 62], [620, 120, 80], [720, 100, 66], [800, 118, 70]]
          .map(([dx, dy, r], i) => `<circle cx="${x + dx}" cy="${fundo - dy + 40}" r="${r}" fill="${i % 2 ? '#5F7F58' : '#6E8F64'}"/>`).join('')}
      <rect x="${x}" y="${fundo - 60}" width="${w}" height="60" fill="#7F9A6E"/>
    </g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" opacity=".22"/>
    <polygon points="${x + 150},${y} ${x + 260},${y} ${x + 90},${fundo} ${x - 20},${fundo}" fill="url(#reflexo)"/>
    <polygon points="${x + 560},${y} ${x + 610},${y} ${x + 470},${fundo} ${x + 420},${fundo}" fill="url(#reflexo)" opacity=".7"/>
  </g>`;
    }

    function _janela() {
        const { x, y, w, h, b } = JANELA;
        const meio = x + w / 2;
        return `<rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" fill="#FBF9F5" filter="url(#sombra)"/>
  ${_vista()}
  <g filter="url(#sombra)">
    <path fill-rule="evenodd" fill="url(#caixilho)" d="M${x} ${y} h${w} v${h} h${-w} Z
      M${x + b} ${y + b} h${w / 2 - b * 1.5} v${h - 2 * b} h${-(w / 2 - b * 1.5)} Z
      M${meio + b / 2} ${y + b} h${w / 2 - b * 1.5} v${h - 2 * b} h${-(w / 2 - b * 1.5)} Z"/>
  </g>
  <rect x="${meio - b / 2}" y="${y + b}" width="2" height="${h - 2 * b}" fill="#000" opacity=".08"/>
  <rect x="${x - 14}" y="${y + h}" width="${w + 28}" height="10" rx="2" fill="#F1EEE8"/>
  <rect x="${x - 14}" y="${y + h + 10}" width="${w + 28}" height="6" fill="#000" opacity=".12" filter="url(#desfoque2)"/>`;
    }

    function _trilho(camada) {
        const { x1, x2, h } = TRILHO;
        const y = TRILHO.y - DEGRAU_CAMADA.y * camada;
        return `<rect x="${x1}" y="${y + h - 2}" width="${x2 - x1}" height="10" fill="#000" opacity=".2" filter="url(#desfoque4)"/>
  <rect x="${x1}" y="${y}" width="${x2 - x1}" height="${h}" rx="3" fill="url(#aluminio)" stroke="#A9ADB2" stroke-width=".8"/>
  <rect x="${x1 + 2}" y="${y + 2}" width="${x2 - x1 - 4}" height="2" rx="1" fill="#FFFFFF" opacity=".8"/>
  <rect x="${x1 - 4}" y="${y - 1}" width="10" height="${h + 2}" rx="2" fill="#E2E3E5" stroke="#A3A6AA" stroke-width=".8"/>
  <rect x="${x2 - 6}" y="${y - 1}" width="10" height="${h + 2}" rx="2" fill="#E2E3E5" stroke="#A3A6AA" stroke-width=".8"/>`;
    }

    // Suportes presos ao teto/parede: acima do trilho mais alto.
    function _suportes(nCamadas) {
        const y = TRILHO.y - DEGRAU_CAMADA.y * (nCamadas - 1);
        const { x1, x2 } = TRILHO;
        return [x1 + 60, (x1 + x2) / 2, x2 - 70].map(bx => `<rect x="${bx}" y="${y - 9}" width="14" height="9" rx="1.5" fill="url(#aluminio)" stroke="#A9ADB2" stroke-width=".6"/>`).join('');
    }

    function _comando(cmd, animado) {
        const esq = cmd === 'esq';
        const xc = esq ? TRILHO.x1 + 4 : TRILHO.x2 - 4;
        const yTopo = TRILHO.y + TRILHO.h;
        const yFim = 420;
        const bolinhas = 'stroke-dasharray="0.1 5.5" stroke-linecap="round" stroke-width="3.6" fill="none"';
        return `<g filter="url(#sombra)">
    <path d="M${xc - 4} ${yTopo} V${yFim} Q${xc} ${yFim + 12} ${xc + 4} ${yFim} V${yTopo}" stroke="#8F9398" ${bolinhas}>${animado ? `<animate attributeName="stroke-dashoffset" values="0;0;-90" keyTimes="0;0.15;1" begin="${ANIM.inicio}s" dur="${ANIM.dur}s" fill="freeze"/>` : ''}</path>
    <path d="M${xc - 4} ${yTopo} V${yFim} Q${xc} ${yFim + 12} ${xc + 4} ${yFim} V${yTopo}" stroke="#9A9DA1" stroke-width=".6" fill="none" opacity=".6"/>
    <rect x="${xc - 7}" y="${yFim + 4}" width="14" height="34" rx="7" fill="url(#aluminio)" stroke="#B5B8BC" stroke-width=".8"/>
  </g>
  <rect x="${xc - 13}" y="${TRILHO.y - 4}" width="26" height="${TRILHO.h + 10}" rx="4" fill="url(#aluminio)" stroke="#B0B3B7" stroke-width=".8" filter="url(#sombra)"/>`;
    }

    // Luz depois da cortina: a luz da janela batendo no tecido (da volume as dobras
    // perto da janela) e, na animacao, o comodo mais escuro com a cortina fechada e a
    // claridade atravessando o tecido.
    function _luz(animado) {
        const { x, y, w, h } = JANELA;
        const naCortina = `<rect width="${W}" height="${H}" fill="url(#luzNaCortina)" style="mix-blend-mode:soft-light"${animado ? ` opacity=".3">${luzAnim('.3;.3;1')}</rect>` : '/>'}`;
        if (!animado) return naCortina;
        return `${naCortina}
  <rect x="${x - 40}" y="${y - 30}" width="${w + 80}" height="${h + 60}" rx="60" fill="#FFF6E0" filter="url(#desfoque12)" style="mix-blend-mode:screen" opacity=".38">${luzAnim('.38;.38;0')}</rect>
  <rect width="${W}" height="${H}" fill="#1A120A" opacity=".34">${luzAnim('.34;.34;0')}</rect>`;
    }

    function _textoPregas(camadas) {
        return camadas.map(p => PREGAS[p]).join(' + ');
    }

    function _legenda(letra, sub, camadas) {
        const l1 = `Abertura ${letra} — ${sub}`;
        const l2 = `${camadas.length > 1 ? 'Pregas' : 'Prega'}: ${_textoPregas(camadas)}`;
        const larg = Math.min(W - 44, Math.round(Math.max(l1.length, l2.length) * 10.2) + 36);
        return `<g>
    <rect x="22" y="${H - 84}" width="${larg}" height="64" rx="18" fill="#1C1A17" fill-opacity=".64"/>
    <text x="40" y="${H - 59}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="18" fill="#FFFFFF"><tspan font-weight="700">Abertura ${letra}</tspan> — ${esc(sub)}</text>
    <text x="40" y="${H - 33}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="18" fill="#FFFFFF"><tspan font-weight="700">${camadas.length > 1 ? 'Pregas' : 'Prega'}:</tspan> ${esc(_textoPregas(camadas))}</text>
  </g>`;
    }

    // ---- lupas ----
    // Uma por camada, na coluna a direita, de cima para baixo na ordem dos tecidos.
    // Com menos camadas a lupa e maior. Mostram ~44 de cada lado do centro do gomo,
    // do trilho ate um pouco abaixo do cabecote, onde as pregas se distinguem.
    const LUPAS = { 1: { r: 122, cy: [338] }, 2: { r: 106, cy: [208, 470] }, 3: { r: 82, cy: [160, 352, 544] } };
    const MEIA_VISTA = 44;

    function _posLupas(n) {
        const cfg = LUPAS[n];
        return cfg.cy.map((cy, i) => ({ i, cx: W + COLUNA / 2, cy, r: cfg.r }));
    }

    function _coluna(camadas, lupas) {
        const titulo = camadas.length > 1 ? 'Detalhe das pregas' : 'Detalhe da prega';
        const corpo = lupas.map(l => {
            const prega = camadas[l.i];
            const m = MODELO[prega];
            const yTrilho = TRILHO.y, topo = yTrilho + TRILHO.h + 4;
            const zoom = l.r / MEIA_VISTA;
            const meia = MEIA_VISTA + m.larg;
            const n = Math.ceil(2 * meia / m.larg);
            const gomos = [];
            for (let k = 0; k < n; k++) {
                const x = f(-meia + m.larg * (k + .5));
                gomos.push(`<g transform="translate(${x} 0)"><g>${_corpo(prega, m.larg, topo, l.i, k)}</g>${_cabeca(prega, m.larg, topo, yTrilho, l.i)}</g>`);
            }
            const yFoco = topo + 14;
            const trilho = `<rect x="${f(-meia)}" y="${yTrilho}" width="${f(2 * meia)}" height="${TRILHO.h}" rx="3" fill="url(#aluminio)" stroke="#A9ADB2" stroke-width=".8"/>
      <rect x="${f(-meia)}" y="${yTrilho + 2}" width="${f(2 * meia)}" height="2" fill="#FFFFFF" opacity=".8"/>`;
            const rotulo = PREGAS[prega];
            const largRotulo = Math.round(rotulo.length * 11.2) + 30;
            const yRotulo = l.cy + l.r - 6;
            return `<circle cx="${l.cx}" cy="${l.cy}" r="${l.r + 6}" fill="#FFFFFF" filter="url(#sombra)"/>
  <g clip-path="url(#lupa${l.i})">
    <rect x="${l.cx - l.r}" y="${l.cy - l.r}" width="${2 * l.r}" height="${2 * l.r}" fill="url(#fundoLupa)"/>
    <g transform="translate(${l.cx} ${l.cy}) scale(${f(zoom * 100) / 100}) translate(0 ${-yFoco})">
      ${trilho}
      <g filter="url(#sombraCortina)"><g filter="url(#tecido)">${gomos.join('')}</g></g>
    </g>
    <circle cx="${l.cx}" cy="${l.cy}" r="${l.r}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="10" filter="url(#desfoque4)"/>
  </g>
  <circle cx="${l.cx}" cy="${l.cy}" r="${l.r + 3}" fill="none" stroke="#FFFFFF" stroke-width="6"/>
  <circle cx="${l.cx}" cy="${l.cy}" r="${l.r + 6}" fill="none" stroke="#B4AB9D" stroke-width="1"/>
  <rect x="${f(l.cx - largRotulo / 2)}" y="${yRotulo - 2}" width="${largRotulo}" height="32" rx="16" fill="#2B241E" fill-opacity=".9"/>
  <text x="${l.cx}" y="${yRotulo + 20}" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">${esc(rotulo)}</text>`;
        }).join('\n  ');
        return `<rect x="${W}" width="${COLUNA}" height="${H}" fill="url(#coluna)"/>
  <rect x="${W}" width="2" height="${H}" fill="#CFC5B7"/>
  <text x="${W + COLUNA / 2}" y="${camadas.length === 3 ? 44 : 52}" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="21" font-weight="700" fill="#4A4036">${titulo}</text>
  ${corpo}`;
    }

    // Lista de pregas das camadas (1 a 3), na ordem dos tecidos: o primeiro e a frente.
    function camadasDasPregas(pregas) {
        const lista = (Array.isArray(pregas) ? pregas : [pregas]).slice(0, MAX_CAMADAS).map(normalizarPrega);
        return lista.length ? lista : [PREGA_PADRAO];
    }

    // opcoes: { abertura: 'A'..'H', pregas: ['Wave Botao', ...], animado: bool }
    function svg(opcoes) {
        const o = opcoes || {};
        const letra = normalizarAbertura(o.abertura);
        const cfg = ABERTURAS[letra];
        const camadas = camadasDasPregas(o.pregas);
        const animado = !!o.animado;
        const lupas = _posLupas(camadas.length);
        // de tras para a frente: trilho e tecido de cada camada
        let cortinas = '';
        for (let i = camadas.length - 1; i >= 0; i--) {
            cortinas += `\n  ${_trilho(i)}\n  ${_camada(cfg.rec, camadas[i], i, animado)}`;
        }
        const rotulo = `Abertura ${letra}: ${cfg.sub}. ${camadas.length > 1 ? 'Pregas' : 'Prega'}: ${_textoPregas(camadas)}`;
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WT} ${H}" width="${WT}" height="${H}" role="img" aria-label="${esc(rotulo)}">
${_defs(camadas, lupas)}
  <g clip-path="url(#cena)">
  ${_ambiente(animado)}
  ${_janela()}
  ${_suportes(camadas.length)}${cortinas}
  ${_comando(cfg.cmd, animado)}
  ${_luz(animado)}
  <rect width="${W}" height="${H}" fill="url(#vinheta)"/>
  <rect width="${W}" height="${H}" filter="url(#grao)"/>
  ${_legenda(letra, cfg.sub, camadas)}
  </g>
  ${_coluna(camadas, lupas)}
</svg>
`;
    }

    function urlSvg(opcoes) {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(opcoes));
    }

    // Texto curto para a legenda abaixo do desenho e para o alt da imagem.
    function descricao(opcoes) {
        const o = opcoes || {};
        const camadas = camadasDasPregas(o.pregas);
        return `Abertura ${normalizarAbertura(o.abertura)} · ${_textoPregas(camadas)}`;
    }

    const api = { ABERTURAS, PREGAS, PREGA_PADRAO, MAX_CAMADAS, svg, urlSvg, descricao, camadasDasPregas, normalizarPrega };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else raiz.CortinaDesenho = api;
})(typeof window !== 'undefined' ? window : this);
