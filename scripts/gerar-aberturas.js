// Gera images/Aberturas/Abertura{A..H}.svg: desenho tecnico limpo da cortina
// de laminas verticais, com volume e sombra (gradientes + sombra suave).
// Rodar: node scripts/gerar-aberturas.js
const fs = require('fs');
const path = require('path');

// recolhimento: onde as laminas ficam juntas; comando: lado do cordao.
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

// Geometria (viewBox 1200 x 660, mesma proporcao das imagens antigas).
const W = 1200, H = 660;
const TRILHO = { x1: 90, x2: 1110, y: 128, h: 18 };
const JANELA = { x: 112, y: 162, w: 976, h: 420, borda: 16 };
const LAMINA = { larg: 21, passo: 27, topo: TRILHO.y + TRILHO.h + 8, base: 612, qtd: 7 };

function pilha(xIni) {
    return Array.from({ length: LAMINA.qtd }, (_, i) => xIni + i * LAMINA.passo);
}
const largPilha = (LAMINA.qtd - 1) * LAMINA.passo + LAMINA.larg;

function posicoesLaminas(rec) {
    const esq = JANELA.x + 18;
    const dir = JANELA.x + JANELA.w - 18 - largPilha;
    const meio = W / 2 - largPilha / 2;
    if (rec === 'esq') return pilha(esq);
    if (rec === 'dir') return pilha(dir);
    if (rec === 'centro') return pilha(meio);
    return [...pilha(esq), ...pilha(dir)];
}

function defs() {
    return `<defs>
  <linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F7F8FA"/><stop offset="1" stop-color="#ECEEF2"/>
  </linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#B9BFC7"/><stop offset=".35" stop-color="#E4E7EB"/>
    <stop offset=".6" stop-color="#A2A9B2"/><stop offset="1" stop-color="#6F7781"/>
  </linearGradient>
  <linearGradient id="caixilho" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#9AA1AA"/><stop offset=".5" stop-color="#7F8790"/><stop offset="1" stop-color="#666D76"/>
  </linearGradient>
  <linearGradient id="vidro" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#F3F7FB"/><stop offset=".55" stop-color="#E4EBF2"/><stop offset="1" stop-color="#D6DFE8"/>
  </linearGradient>
  <linearGradient id="reflexo" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".55"/>
    <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="lamina" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#153A86"/><stop offset=".22" stop-color="#2C62CF"/>
    <stop offset=".42" stop-color="#5D8EEB"/><stop offset=".62" stop-color="#2D63D0"/>
    <stop offset="1" stop-color="#173F8E"/>
  </linearGradient>
  <linearGradient id="laminaLuz" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".06" stop-color="#000" stop-opacity="0"/>
    <stop offset=".9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/>
  </linearGradient>
  <linearGradient id="peso" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#1A3F8A"/><stop offset=".4" stop-color="#4A7EE0"/><stop offset="1" stop-color="#163780"/>
  </linearGradient>
  <linearGradient id="caixaCmd" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4C80E2"/><stop offset=".5" stop-color="#2557C2"/><stop offset="1" stop-color="#173F8E"/>
  </linearGradient>
  <filter id="sombra" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#1E2A3A" flood-opacity=".22"/>
  </filter>
  <filter id="sombraLamina" x="-60%" y="-5%" width="220%" height="112%">
    <feDropShadow dx="5" dy="4" stdDeviation="3.5" flood-color="#0E1C33" flood-opacity=".30"/>
  </filter>
  <filter id="sombraLeve" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#1E2A3A" flood-opacity=".25"/>
  </filter>
</defs>`;
}

function janela() {
    const { x, y, w, h, borda: b } = JANELA;
    const meio = x + w / 2;
    const vaos = [
        { x: x + b, w: w / 2 - b - b / 2 },
        { x: meio + b / 2, w: w / 2 - b - b / 2 },
    ];
    const vidros = vaos.map(v => `
    <rect x="${v.x}" y="${y + b}" width="${v.w}" height="${h - 2 * b}" fill="url(#vidro)"/>
    <polygon points="${v.x + v.w * .18},${y + b} ${v.x + v.w * .34},${y + b} ${v.x + v.w * .10},${y + h - b} ${v.x + v.w * .01},${y + h - b}" fill="url(#reflexo)" opacity=".8"/>
    <polygon points="${v.x + v.w * .40},${y + b} ${v.x + v.w * .45},${y + b} ${v.x + v.w * .21},${y + h - b} ${v.x + v.w * .16},${y + h - b}" fill="url(#reflexo)" opacity=".6"/>
    <path d="M${v.x} ${y + h - b} V${y + b} H${v.x + v.w}" fill="none" stroke="#5B636C" stroke-opacity=".35" stroke-width="3"/>`).join('');
    return `<g filter="url(#sombra)">
    <path fill-rule="evenodd" fill="url(#caixilho)" d="M${x} ${y} h${w} v${h} h${-w} Z
      M${vaos[0].x} ${y + b} h${vaos[0].w} v${h - 2 * b} h${-vaos[0].w} Z
      M${vaos[1].x} ${y + b} h${vaos[1].w} v${h - 2 * b} h${-vaos[1].w} Z"/>
  </g>
  <g>${vidros}
  </g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="1.5"/>
  <rect x="${meio - b / 2}" y="${y + b}" width="${b}" height="${h - 2 * b}" fill="#000" fill-opacity=".06"/>`;
}

function trilho(cmd) {
    const { x1, x2, y, h } = TRILHO;
    const tampa = (cx) => `<rect x="${cx - 7}" y="${y - 2}" width="14" height="${h + 4}" rx="3" fill="#5E6670"/>`;
    return `<g filter="url(#sombra)">
    <rect x="${x1}" y="${y}" width="${x2 - x1}" height="${h}" rx="5" fill="url(#metal)"/>
    ${tampa(x1 + 4)}${tampa(x2 - 4)}
  </g>
  <rect x="${x1 + 10}" y="${y + 3}" width="${x2 - x1 - 20}" height="2" rx="1" fill="#FFFFFF" fill-opacity=".7"/>`;
}

function laminas(rec) {
    return posicoesLaminas(rec).map(lx => {
        const cx = lx + LAMINA.larg / 2;
        const { topo, base } = LAMINA;
        return `<g>
    <rect x="${cx - 2}" y="${TRILHO.y + TRILHO.h - 2}" width="4" height="${topo - TRILHO.y - TRILHO.h + 6}" fill="#8C939C"/>
    <rect x="${cx - 5}" y="${TRILHO.y + TRILHO.h - 4}" width="10" height="6" rx="2" fill="#C7CCD2" stroke="#7A828B" stroke-width="1"/>
    <g filter="url(#sombraLamina)">
      <rect x="${lx}" y="${topo}" width="${LAMINA.larg}" height="${base - topo}" rx="${LAMINA.larg / 2}" ry="7" fill="url(#lamina)"/>
    </g>
    <rect x="${lx}" y="${topo}" width="${LAMINA.larg}" height="${base - topo}" rx="${LAMINA.larg / 2}" ry="7" fill="url(#laminaLuz)"/>
    <rect x="${lx + 2}" y="${base - 26}" width="${LAMINA.larg - 4}" height="18" rx="6" fill="url(#peso)" opacity=".9"/>
  </g>`;
    }).join('\n  ');
}

function comando(cmd) {
    const ladoEsq = cmd === 'esq';
    const xCaixa = ladoEsq ? TRILHO.x1 + 2 : TRILHO.x2 - 30;
    const xCord = xCaixa + 14;
    const yTopo = TRILHO.y + TRILHO.h + 10;
    const yPeso = 470;
    // Dois cordoes que descem da caixa ate o peso, levemente afastados.
    return `<g filter="url(#sombraLeve)">
    <path d="M${xCord - 3} ${yTopo} L${xCord - 6} ${yPeso}" stroke="#1E4AA8" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M${xCord + 3} ${yTopo} L${xCord + 6} ${yPeso}" stroke="#2C5BC0" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <rect x="${xCord - 11}" y="${yPeso - 4}" width="22" height="58" rx="11" fill="url(#peso)"/>
    <rect x="${xCord - 6}" y="${yPeso + 4}" width="4" height="40" rx="2" fill="#FFFFFF" fill-opacity=".35"/>
  </g>
  <g filter="url(#sombraLeve)">
    <rect x="${xCaixa}" y="${TRILHO.y - 8}" width="28" height="${TRILHO.h + 22}" rx="5" fill="url(#caixaCmd)"/>
    <rect x="${xCaixa + 4}" y="${TRILHO.y - 5}" width="20" height="3" rx="1.5" fill="#FFFFFF" fill-opacity=".45"/>
  </g>`;
}

function svg(letra, cfg) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Abertura ${letra}: ${cfg.sub}">
${defs()}
  <rect width="${W}" height="${H}" fill="url(#fundo)"/>
  <text x="${W / 2}" y="54" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#2F3640" letter-spacing="1">TIPO DE ABERTURA: ${letra}</text>
  <text x="${W / 2}" y="94" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="25" fill="#5A6370">(${cfg.sub})</text>
  <ellipse cx="${W / 2}" cy="${JANELA.y + JANELA.h + 40}" rx="${JANELA.w / 2 + 20}" ry="10" fill="#1E2A3A" fill-opacity=".06"/>
  ${janela()}
  ${trilho(cfg.cmd)}
  ${laminas(cfg.rec)}
  ${comando(cfg.cmd)}
</svg>
`;
}

const destino = path.join(__dirname, '..', 'images', 'Aberturas');
for (const [letra, cfg] of Object.entries(ABERTURAS)) {
    fs.writeFileSync(path.join(destino, `Abertura${letra}.svg`), svg(letra, cfg));
}
console.log('Geradas:', Object.keys(ABERTURAS).map(l => `Abertura${l}.svg`).join(', '));
