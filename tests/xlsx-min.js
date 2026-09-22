'use strict';
// Leitor minimo de .xlsx, usado SOMENTE pelos testes. O navegador usa SheetJS;
// aqui o Node precisa abrir a planilha real sem nenhuma dependencia instalada.
const fs = require('node:fs');
const zlib = require('node:zlib');

// --- ZIP: le o diretorio central e devolve { nomeDoArquivo: Buffer } ---
function lerZip(caminho) {
    const buf = fs.readFileSync(caminho);
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) throw new Error('Arquivo nao parece ser um zip/xlsx valido');
    const total = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const arquivos = {};
    for (let n = 0; n < total; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Diretorio central corrompido');
        const metodo   = buf.readUInt16LE(p + 10);
        const tamComp  = buf.readUInt32LE(p + 20);
        const tamNome  = buf.readUInt16LE(p + 28);
        const tamExtra = buf.readUInt16LE(p + 30);
        const tamCom   = buf.readUInt16LE(p + 32);
        const offLocal = buf.readUInt32LE(p + 42);
        const nome     = buf.toString('utf8', p + 46, p + 46 + tamNome);
        const nomeLocal  = buf.readUInt16LE(offLocal + 26);
        const extraLocal = buf.readUInt16LE(offLocal + 28);
        const inicio = offLocal + 30 + nomeLocal + extraLocal;
        const bruto = buf.subarray(inicio, inicio + tamComp);
        arquivos[nome] = metodo === 0 ? bruto : zlib.inflateRawSync(bruto);
        p += 46 + tamNome + tamExtra + tamCom;
    }
    return arquivos;
}

// --- XML ---
function decodificarXml(s) {
    return String(s)
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&amp;/g, '&');
}

function lerSharedStrings(xml) {
    if (!xml) return [];
    return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
        [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodificarXml(t[1])).join(''));
}

function colunaParaIndice(ref) {
    const letras = ref.match(/^[A-Z]+/)[0];
    let n = 0;
    for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
    return n - 1;
}

function lerPlanilha(xml, strings) {
    const linhas = [];
    // Linhas vazias vem como tag auto-fechada (<row r="65" spans="1:2"/>). Remove
    // antes de casar, senao a regex de linha abaixo (que exige um "</row>" de
    // fechamento) engole a proxima linha real ao procurar o proximo "</row>"
    // seguinte, perdendo a linha vazia e misatribuindo o conteudo da linha
    // seguinte ao indice da linha vazia.
    const xmlSemLinhasVazias = xml.replace(/<row\b[^>]*\/>/g, '');
    for (const mLinha of xmlSemLinhasVazias.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        const idx = Number(mLinha[1]) - 1;
        const celulas = [];
        // Celulas vazias vem como tag auto-fechada (<c r="C2" s="562"/>). Remove (em
        // vez de normalizar para <c></c>) antes de casar: assim a regex de celula
        // abaixo nao engole a proxima celula real ao procurar o primeiro "</c>"
        // seguinte, E a coluna correspondente fica como buraco no array (== o
        // "undefined" que o contrato pede para celula vazia), em vez de virar ''.
        const linhaXml = mLinha[2].replace(/<c\b[^>]*\/>/g, '');
        for (const mCel of linhaXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
            const attrs = mCel[1];
            const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
            if (!ref) continue;
            const col = colunaParaIndice(ref);
            const tipo = (attrs.match(/\bt="([^"]+)"/) || [])[1];
            const corpo = mCel[2];
            let valor = '';
            if (tipo === 's') {
                const v = corpo.match(/<v>([\s\S]*?)<\/v>/);
                valor = v ? (strings[Number(v[1])] ?? '') : '';
            } else if (tipo === 'inlineStr') {
                valor = [...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodificarXml(t[1])).join('');
            } else {
                const v = corpo.match(/<v>([\s\S]*?)<\/v>/);
                valor = v ? decodificarXml(v[1]) : '';
            }
            celulas[col] = valor;
        }
        linhas[idx] = celulas;
    }
    for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = [];
    return linhas;
}

function lerXlsx(caminho) {
    const z = lerZip(caminho);
    const strings = lerSharedStrings(z['xl/sharedStrings.xml'] && z['xl/sharedStrings.xml'].toString('utf8'));
    const rels = {};
    const xmlRels = z['xl/_rels/workbook.xml.rels'].toString('utf8');
    for (const m of xmlRels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
        const id = (m[1].match(/\bId="([^"]*)"/) || [])[1];
        const alvo = (m[1].match(/\bTarget="([^"]*)"/) || [])[1];
        if (id && alvo) rels[id] = alvo;
    }
    const abas = {};
    const ordem = [];
    const xmlWb = z['xl/workbook.xml'].toString('utf8');
    for (const m of xmlWb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
        const nome = decodificarXml((m[1].match(/\bname="([^"]*)"/) || [])[1] || '');
        const rid  = (m[1].match(/r:id="([^"]*)"/) || [])[1];
        if (!nome || !rid || !rels[rid]) continue;
        let alvo = rels[rid];
        if (!alvo.startsWith('xl/')) alvo = 'xl/' + alvo.replace(/^\//, '');
        if (!z[alvo]) continue;
        abas[nome] = lerPlanilha(z[alvo].toString('utf8'), strings);
        ordem.push(nome);
    }
    return { abas, ordem };
}

module.exports = { lerXlsx };
