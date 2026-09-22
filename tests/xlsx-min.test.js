'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { lerXlsx } = require('./xlsx-min.js');

const PLANILHA = path.join(__dirname, '..', 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// --- helper de teste: monta um .xlsx minimo (zip valido, sem compressao) em
// memoria, para testar casos sinteticos sem depender so da planilha real. Nao
// faz parte da interface de xlsx-min.js; existe apenas para estes testes.
function construirXlsxMinimo(arquivos) {
    const locais = [];
    const central = [];
    let offset = 0;
    for (const [nome, conteudo] of arquivos) {
        const nomeBuf = Buffer.from(nome, 'utf8');
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(0, 8); // metodo 0 = sem compressao
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0, 12);
        local.writeUInt32LE(0, 14); // crc32 (nao verificado pelo leitor)
        local.writeUInt32LE(conteudo.length, 18);
        local.writeUInt32LE(conteudo.length, 22);
        local.writeUInt16LE(nomeBuf.length, 26);
        local.writeUInt16LE(0, 28);
        const offsetLocal = offset;
        locais.push(local, nomeBuf, conteudo);
        offset += local.length + nomeBuf.length + conteudo.length;

        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4);
        cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(0, 8);
        cd.writeUInt16LE(0, 10);
        cd.writeUInt16LE(0, 12);
        cd.writeUInt16LE(0, 14);
        cd.writeUInt32LE(0, 16);
        cd.writeUInt32LE(conteudo.length, 20);
        cd.writeUInt32LE(conteudo.length, 24);
        cd.writeUInt16LE(nomeBuf.length, 28);
        cd.writeUInt16LE(0, 30);
        cd.writeUInt16LE(0, 32);
        cd.writeUInt16LE(0, 34);
        cd.writeUInt16LE(0, 36);
        cd.writeUInt32LE(0, 38);
        cd.writeUInt32LE(offsetLocal, 42);
        central.push(cd, nomeBuf);
    }
    const localBuf = Buffer.concat(locais);
    const centralBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(arquivos.length, 8);
    eocd.writeUInt16LE(arquivos.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(localBuf.length, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([localBuf, centralBuf, eocd]);
}

function comArquivoTemporario(zipBuf, fn) {
    const tmp = path.join(os.tmpdir(), `xlsx-min-teste-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    fs.writeFileSync(tmp, zipBuf);
    try {
        return fn(tmp);
    } finally {
        fs.unlinkSync(tmp);
    }
}

test('le as 22 abas da planilha real', () => {
    const { ordem } = lerXlsx(PLANILHA);
    assert.strictEqual(ordem.length, 22);
    assert.ok(ordem.includes('Capa'));
    assert.ok(ordem.includes('Book 10'));
});

test('Book 10 tem o cabecalho esperado na linha 2', () => {
    const { abas } = lerXlsx(PLANILHA);
    const linha = abas['Book 10'][1];
    assert.match(String(linha[0]), /C[OÓ]DIGO/i);
    assert.match(String(linha[1]), /DESCRI/i);
    assert.match(String(linha[3]), /LARGURA/i);
    assert.match(String(linha[4]), /CORTE/i);
    assert.match(String(linha[5]), /PE[CÇ]A/i);
});

test('Book 10 traz codigo, descricao e preco nas linhas de produto', () => {
    const { abas } = lerXlsx(PLANILHA);
    const produtos = abas['Book 10'].slice(2).filter(l => l[0] && l[1]);
    assert.ok(produtos.length >= 30, `esperava 30+ produtos, veio ${produtos.length}`);
    assert.ok(produtos.every(l => String(l[0]).trim().length > 0));
});

test('celula vazia (mesclada) vem como undefined, nao como string vazia', () => {
    const { abas } = lerXlsx(PLANILHA);
    const linha = abas['Book 10'][1]; // linha 2 da planilha (cabecalho)
    // C2 esta mesclada com B2 (mergeCell B2:C2): no XML ela e uma tag
    // auto-fechada <c r="C2" .../>, sem <v>. O contrato diz que celula vazia
    // vem como undefined, entao isto NAO pode virar ''.
    assert.strictEqual(linha[2], undefined);
});

test('linha vazia auto-fechada (<row .../>) nao engole a linha seguinte', () => {
    const worksheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<sheetData>'
        + '<row r="3" spans="1:2"/>'
        + '<row r="4" spans="1:2"><c r="A4" t="s"><v>0</v></c></row>'
        + '</sheetData></worksheet>';
    const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        + '</Relationships>';
    const sharedStringsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>OK</t></si></sst>';

    const zipBuf = construirXlsxMinimo([
        ['xl/workbook.xml', Buffer.from(workbookXml, 'utf8')],
        ['xl/_rels/workbook.xml.rels', Buffer.from(relsXml, 'utf8')],
        ['xl/worksheets/sheet1.xml', Buffer.from(worksheetXml, 'utf8')],
        ['xl/sharedStrings.xml', Buffer.from(sharedStringsXml, 'utf8')],
    ]);

    comArquivoTemporario(zipBuf, (caminho) => {
        const { abas } = lerXlsx(caminho);
        const linhas = abas['Sheet1'];
        // linha 3 (indice 2): vazia, nao pode conter os dados da linha 4.
        assert.deepStrictEqual(linhas[2], []);
        // linha 4 (indice 3): tem que existir com o valor real, nao pode ter sumido.
        assert.strictEqual(linhas[3][0], 'OK');
    });
});
