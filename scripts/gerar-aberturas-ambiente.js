// Gera images/Aberturas/Ambiente/Abertura{A..H}.svg: a cortina de laminas
// verticais instalada num ambiente (parede, piso, janela com vista e luz),
// com aparencia de foto. A versao tecnica fica em scripts/gerar-aberturas.js.
// Rodar: node scripts/gerar-aberturas-ambiente.js
const fs = require('fs');
const path = require('path');

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

const W = 1200, H = 660;
const TETO = 38, RODAPE = 572, PISO = 588;
const TRILHO = { x1: 148, x2: 1052, y: 74, h: 14 };
const JANELA = { x: 196, y: 122, w: 808, h: 392, b: 13 };
const LAM = { larg: 20, passo: 24, topo: TRILHO.y + TRILHO.h + 6, base: 556, qtd: 8 };
const largPilha = (LAM.qtd - 1) * LAM.passo + LAM.larg;

function posicoes(rec) {
    const pilha = x0 => Array.from({ length: LAM.qtd }, (_, i) => x0 + i * LAM.passo);
    const esq = TRILHO.x1 + 14, dir = TRILHO.x2 - 14 - largPilha, meio = W / 2 - largPilha / 2;
    if (rec === 'esq') return pilha(esq);
    if (rec === 'dir') return pilha(dir);
    if (rec === 'centro') return pilha(meio);
    return [...pilha(esq), ...pilha(dir)];
}

const f = n => Math.round(n * 10) / 10;

function defs() {
    const { x, y, w, h, b } = JANELA;
    const meio = x + w / 2;
    return `<defs>
  <radialGradient id="parede" cx="${W / 2}" cy="${y + h / 2}" r="760" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#F6F1EA"/><stop offset=".55" stop-color="#E8E1D6"/><stop offset="1" stop-color="#CFC6B8"/>
  </radialGradient>
  <linearGradient id="teto" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#E6E1DA"/><stop offset="1" stop-color="#D3CCC2"/>
  </linearGradient>
  <linearGradient id="piso" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8E6A4B"/><stop offset=".5" stop-color="#9F7854"/><stop offset="1" stop-color="#7A5739"/>
  </linearGradient>
  <linearGradient id="luzPiso" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFF6E6" stop-opacity=".55"/><stop offset="1" stop-color="#FFF6E6" stop-opacity=".12"/>
  </linearGradient>
  <linearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8DB8E2"/><stop offset=".6" stop-color="#C9DFF0"/><stop offset="1" stop-color="#E9F1F4"/>
  </linearGradient>
  <linearGradient id="aluminio" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#ECEDEE"/><stop offset="1" stop-color="#C9CCD0"/>
  </linearGradient>
  <linearGradient id="caixilho" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FAFAFA"/><stop offset="1" stop-color="#D5D8DB"/>
  </linearGradient>
  <linearGradient id="lamina" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#A89C8A"/><stop offset=".25" stop-color="#D9CFBF"/>
    <stop offset=".45" stop-color="#EEE7DB"/><stop offset=".7" stop-color="#D3C8B6"/><stop offset="1" stop-color="#9F937F"/>
  </linearGradient>
  <linearGradient id="laminaAltura" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".08" stop-color="#000" stop-opacity="0"/>
    <stop offset=".55" stop-color="#FFF" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".16"/>
  </linearGradient>
  <linearGradient id="reflexo" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#FFF" stop-opacity="0"/><stop offset=".5" stop-color="#FFF" stop-opacity=".35"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="vinheta" cx=".5" cy=".5" r=".75">
    <stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/>
  </radialGradient>
  <radialGradient id="brilhoJanela" cx="${W / 2}" cy="${y + h / 2}" r="520" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFFBF2" stop-opacity=".55"/><stop offset="1" stop-color="#FFFBF2" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="vaos">
    <rect x="${x + b}" y="${y + b}" width="${w / 2 - b * 1.5}" height="${h - 2 * b}"/>
    <rect x="${meio + b / 2}" y="${y + b}" width="${w / 2 - b * 1.5}" height="${h - 2 * b}"/>
  </clipPath>
  <clipPath id="pisoClip"><rect x="0" y="${PISO}" width="${W}" height="${H - PISO}"/></clipPath>
  <filter id="desfoque4" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="desfoque2"><feGaussianBlur stdDeviation="1.6"/></filter>
  <filter id="desfoque12" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
  <filter id="sombra" x="-10%" y="-20%" width="120%" height="150%">
    <feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#3A2E22" flood-opacity=".28"/>
  </filter>
  <filter id="sombraLaminas" x="-10%" y="-5%" width="125%" height="115%">
    <feDropShadow dx="6" dy="5" stdDeviation="6" flood-color="#2E2418" flood-opacity=".32"/>
  </filter>
  <filter id="tecido" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9 0.015" numOctaves="2" seed="4" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 .35  0 0 0 0 .30  0 0 0 0 .24  0 0 0 .55 -.12" result="nc"/>
    <feComposite in="nc" in2="SourceGraphic" operator="in" result="t"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="t"/></feMerge>
  </filter>
  <filter id="grao" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="9"/>
    <feColorMatrix type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .07 0"/>
  </filter>
  <filter id="veios" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.18" numOctaves="3" seed="2"/>
    <feColorMatrix type="matrix" values="0 0 0 0 .25  0 0 0 0 .14  0 0 0 0 .06  0 0 0 .5 -.1"/>
  </filter>
</defs>`;
}

function ambiente() {
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
    return `<rect width="${W}" height="${H}" fill="url(#parede)"/>
  <rect width="${W}" height="${H}" fill="url(#brilhoJanela)"/>
  <rect width="${W}" height="${TETO}" fill="url(#teto)"/>
  <rect y="${TETO - 6}" width="${W}" height="6" fill="#F3EFE9"/>
  <rect y="${TETO}" width="${W}" height="14" fill="#000" opacity=".06" filter="url(#desfoque4)"/>
  <rect y="${PISO}" width="${W}" height="${H - PISO}" fill="url(#piso)"/>
  <rect y="${PISO}" width="${W}" height="${H - PISO}" filter="url(#veios)"/>
  <g clip-path="url(#pisoClip)" stroke="#3E2817" stroke-opacity=".28" stroke-width="1.4">${tabuas.join('')}</g>
  <polygon points="${x + 30},${PISO} ${x + w - 30},${PISO} ${x + w + 140},${H} ${x + 110},${H}" fill="url(#luzPiso)" filter="url(#desfoque12)"/>
  <rect y="${RODAPE}" width="${W}" height="${PISO - RODAPE}" fill="#F7F5F1"/>
  <rect y="${RODAPE}" width="${W}" height="2" fill="#FFFFFF"/>
  <rect y="${PISO}" width="${W}" height="5" fill="#000" opacity=".22" filter="url(#desfoque2)"/>`;
}

function vista() {
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

function janela() {
    const { x, y, w, h, b } = JANELA;
    const meio = x + w / 2;
    return `<rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" fill="#FBF9F5" filter="url(#sombra)"/>
  ${vista()}
  <g filter="url(#sombra)">
    <path fill-rule="evenodd" fill="url(#caixilho)" d="M${x} ${y} h${w} v${h} h${-w} Z
      M${x + b} ${y + b} h${w / 2 - b * 1.5} v${h - 2 * b} h${-(w / 2 - b * 1.5)} Z
      M${meio + b / 2} ${y + b} h${w / 2 - b * 1.5} v${h - 2 * b} h${-(w / 2 - b * 1.5)} Z"/>
  </g>
  <rect x="${meio - b / 2}" y="${y + b}" width="2" height="${h - 2 * b}" fill="#000" opacity=".08"/>
  <rect x="${x - 14}" y="${y + h}" width="${w + 28}" height="10" rx="2" fill="#F1EEE8"/>
  <rect x="${x - 14}" y="${y + h + 10}" width="${w + 28}" height="6" fill="#000" opacity=".12" filter="url(#desfoque2)"/>`;
}

function trilho() {
    const { x1, x2, y, h } = TRILHO;
    return `<rect x="${x1}" y="${y + h - 2}" width="${x2 - x1}" height="10" fill="#000" opacity=".18" filter="url(#desfoque4)"/>
  <rect x="${x1}" y="${y}" width="${x2 - x1}" height="${h}" rx="3" fill="url(#aluminio)" stroke="#B8BBBF" stroke-width=".8"/>
  <rect x="${x1 - 4}" y="${y - 1}" width="10" height="${h + 2}" rx="2" fill="#E2E3E5" stroke="#B0B3B7" stroke-width=".8"/>
  <rect x="${x2 - 6}" y="${y - 1}" width="10" height="${h + 2}" rx="2" fill="#E2E3E5" stroke="#B0B3B7" stroke-width=".8"/>
  ${[x1 + 60, (x1 + x2) / 2, x2 - 70].map(bx => `<rect x="${bx}" y="${y - 9}" width="14" height="9" rx="1.5" fill="#E4E5E7" stroke="#B5B8BC" stroke-width=".6"/>`).join('')}`;
}

function laminas(rec) {
    const xs = posicoes(rec);
    const { topo, base, larg } = LAM;
    const corpo = xs.map(lx => `<rect x="${lx}" y="${topo}" width="${larg}" height="${base - topo}" rx="2.5" fill="url(#lamina)"/>`).join('');
    const ganchos = xs.map(lx => `<rect x="${lx + larg / 2 - 3}" y="${TRILHO.y + TRILHO.h - 3}" width="6" height="${topo - TRILHO.y - TRILHO.h + 6}" rx="1.5" fill="#F4F4F4" stroke="#BDBFC2" stroke-width=".6"/>`).join('');
    const altura = xs.map(lx => `<rect x="${lx}" y="${topo}" width="${larg}" height="${base - topo}" rx="2.5" fill="url(#laminaAltura)"/>`).join('');
    // Cada lamina vira um pouco diferente na pilha: tom levemente variado.
    const tons = xs.map((lx, i) => `<rect x="${lx}" y="${topo}" width="${larg}" height="${base - topo}" rx="2.5" fill="${i % 3 === 1 ? '#FFF' : '#000'}" opacity="${[0.05, 0.07, 0.1][i % 3]}"/>`).join('');
    const pesos = xs.map(lx => `<rect x="${lx + 2}" y="${base - 18}" width="${larg - 4}" height="12" rx="3" fill="#000" opacity=".07"/>`).join('');
    // Corrente inferior ligando as laminas de cada pilha.
    const grupos = rec === 'lados' ? [xs.slice(0, LAM.qtd), xs.slice(LAM.qtd)] : [xs];
    const correntes = grupos.map(g => `<line x1="${g[0] + larg / 2}" y1="${base - 10}" x2="${g[g.length - 1] + larg / 2}" y2="${base - 10}" stroke="#E8E4DC" stroke-width="2" stroke-dasharray="1 3" stroke-linecap="round"/>`).join('');
    return `<g filter="url(#sombraLaminas)"><g filter="url(#tecido)">${corpo}</g></g>
  ${altura}${tons}${pesos}${correntes}${ganchos}`;
}

function comando(cmd) {
    const esq = cmd === 'esq';
    const xc = esq ? TRILHO.x1 + 4 : TRILHO.x2 - 4;
    const yTopo = TRILHO.y + TRILHO.h;
    const yFim = 420;
    const bolinhas = `stroke-dasharray="0.1 5.5" stroke-linecap="round" stroke-width="3.6" fill="none"`;
    return `<g filter="url(#sombra)">
    <path d="M${xc - 4} ${yTopo} V${yFim} Q${xc} ${yFim + 12} ${xc + 4} ${yFim} V${yTopo}" stroke="#8F9398" ${bolinhas}/>
    <path d="M${xc - 4} ${yTopo} V${yFim} Q${xc} ${yFim + 12} ${xc + 4} ${yFim} V${yTopo}" stroke="#9A9DA1" stroke-width=".6" fill="none" opacity=".6"/>
    <rect x="${xc - 7}" y="${yFim + 4}" width="14" height="34" rx="7" fill="url(#aluminio)" stroke="#B5B8BC" stroke-width=".8"/>
  </g>
  <rect x="${xc - 13}" y="${TRILHO.y - 4}" width="26" height="${TRILHO.h + 10}" rx="4" fill="url(#aluminio)" stroke="#B0B3B7" stroke-width=".8" filter="url(#sombra)"/>`;
}

function legenda(letra, sub) {
    const texto = `Abertura ${letra} — ${sub}`;
    const larg = Math.round(texto.length * 10.2) + 36;
    return `<g>
    <rect x="22" y="${H - 58}" width="${larg}" height="38" rx="19" fill="#1C1A17" fill-opacity=".62"/>
    <text x="${22 + 18}" y="${H - 33}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="18" fill="#FFFFFF"><tspan font-weight="700">Abertura ${letra}</tspan> — ${sub}</text>
  </g>`;
}

function svg(letra, cfg) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Abertura ${letra}: ${cfg.sub}">
${defs()}
  ${ambiente()}
  ${janela()}
  ${trilho()}
  ${laminas(cfg.rec)}
  ${comando(cfg.cmd)}
  <rect width="${W}" height="${H}" fill="url(#vinheta)"/>
  <rect width="${W}" height="${H}" filter="url(#grao)"/>
  ${legenda(letra, cfg.sub)}
</svg>
`;
}

const destino = path.join(__dirname, '..', 'images', 'Aberturas', 'Ambiente');
fs.mkdirSync(destino, { recursive: true });
for (const [letra, cfg] of Object.entries(ABERTURAS)) {
    fs.writeFileSync(path.join(destino, `Abertura${letra}.svg`), svg(letra, cfg));
}
console.log('Geradas em images/Aberturas/Ambiente:', Object.keys(ABERTURAS).join(', '));
