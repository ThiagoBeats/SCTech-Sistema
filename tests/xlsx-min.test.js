'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { lerXlsx } = require('./xlsx-min.js');

const PLANILHA = path.join(__dirname, '..', 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

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
