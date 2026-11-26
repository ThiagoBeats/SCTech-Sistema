'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../js/bancos-core.js');
const { BANCOS_BASE, BANCOS_LOGOS } = require('../js/bancos-base.js');

test('base: mais de 250 instituicoes, com cooperativa e instituicao de pagamento', () => {
    assert.ok(BANCOS_BASE.length > 250);
    assert.ok(BANCOS_BASE.some(b => /cooperativ/i.test(b.nomeCompleto)));
    assert.ok(BANCOS_BASE.some(b => /institui[cç][aã]o de pagamento/i.test(b.nomeCompleto)));
    BANCOS_BASE.forEach(b => assert.ok(b.ispb && b.nome && 'codigo' in b && b.nomeCompleto));
});

test('buscar: nome, codigo, acento, palavras e vazio', () => {
    const nomes = termo => B.buscar(BANCOS_BASE, termo).map(b => b.nome);
    assert.ok(B.buscar(BANCOS_BASE, 'nu', 3).some(b => b.codigo === '260'));
    assert.strictEqual(B.buscar(BANCOS_BASE, '260')[0].nome, 'Nubank');
    assert.ok(B.buscar(BANCOS_BASE, 'itau').some(b => /Unibanco/i.test(b.nomeCompleto)));
    assert.ok(B.buscar(BANCOS_BASE, 'sicoob').some(b => /cooperativ/i.test(b.nomeCompleto)));
    assert.ok(nomes('mercado pago').includes('Mercado Pago'));
    assert.deepStrictEqual(B.buscar(BANCOS_BASE, ''), []);
    assert.deepStrictEqual(B.buscar(BANCOS_BASE, '   '), []);
    assert.ok(B.buscar(BANCOS_BASE, 'a', 5).length <= 5);
    assert.strictEqual(B.buscar(BANCOS_BASE, '1')[0].codigo, '001');
});

test('buscar: codigo exato antes de nome e ordem estavel', () => {
    const lista = [
        { ispb: '1', codigo: '999', nome: 'Banco 260 Teste', nomeCompleto: 'x' },
        { ispb: '2', codigo: '260', nome: 'Zeta', nomeCompleto: 'y' }
    ];
    assert.strictEqual(B.buscar(lista, '260')[0].ispb, '2');
    const iguais = [{ ispb: 'a', codigo: null, nome: 'Alfa X', nomeCompleto: '' }, { ispb: 'b', codigo: null, nome: 'Alfa Y', nomeCompleto: '' }];
    assert.deepStrictEqual(B.buscar(iguais, 'alfa').map(b => b.ispb), ['a', 'b']);
});

test('mascararAgencia', () => {
    assert.strictEqual(B.mascararAgencia('12345', '001'), '1234-5');
    assert.strictEqual(B.mascararAgencia('1234', '341'), '1234');
    assert.strictEqual(B.mascararAgencia('1234', '001'), '1234');
    assert.strictEqual(B.mascararAgencia('1234-5', '001'), '1234-5');
    assert.strictEqual(B.mascararAgencia('12345', '341'), '12345', 'excedente nao se perde');
    assert.strictEqual(B.mascararAgencia('1234x', null), '1234-X');
});

test('mascararConta por banco', () => {
    assert.strictEqual(B.mascararConta('123456789', '001'), '12345678-9');
    assert.strictEqual(B.mascararConta('12345678X', '001'), '12345678-X');
    assert.strictEqual(B.mascararConta('123456', '341'), '12345-6');
    assert.strictEqual(B.mascararConta('0013000123456', '104'), '0013 00012345-6');
    assert.strictEqual(B.mascararConta('1234567', '999'), '123456-7');
    assert.strictEqual(B.mascararConta('1234567p', '237'), '1234567-P');
    assert.strictEqual(B.mascararConta('12345678', '260'), '1234567-8');
    assert.strictEqual(B.mascararConta('123', '001'), '12-3');
    assert.strictEqual(B.mascararConta('12345', '001'), '1234-5');
    assert.strictEqual(B.mascararConta('1234567', '077'), '123456-7');
    assert.strictEqual(B.mascararConta('1', '001'), '1');
    // Caixa: operacao de 3 digitos com 12 no total, de 4 com 13 ou mais, menos que isso: generico
    assert.strictEqual(B.mascararConta('001000123456', '104'), '001 00012345-6');
    assert.strictEqual(B.mascararConta('1288000123456', '104'), '1288 00012345-6');
    assert.strictEqual(B.mascararConta('00100012', '104'), '0010001-2');
    // X/P so como ultimo caractere (DV)
    assert.strictEqual(B.mascararConta('12X345678', '001'), '1234567-8');
    assert.strictEqual(B.mascararAgencia('X123', '001'), '123');
    assert.strictEqual(B.mascararAgencia('1234x', '001'), '1234-X');
    assert.strictEqual(B.mascararConta('1234P', '237'), '1234-P');
});

test('mascara nunca perde digitos e e idempotente', () => {
    ['001', '104', '237', '341', '260', '756', '999', null].forEach(cod => {
        const bruto = '1234567890123456';
        const m = B.mascararConta(bruto, cod);
        assert.strictEqual(m.replace(/\D/g, ''), bruto);
        assert.strictEqual(B.mascararConta(m, cod), m);
        const a = B.mascararAgencia('123456', cod);
        assert.strictEqual(a.replace(/\D/g, ''), '123456');
        assert.strictEqual(B.mascararAgencia(a, cod), a);
    });
});

test('formatoDoBanco', () => {
    assert.deepStrictEqual(B.formatoDoBanco('001').agencia, { digitos: 4, dv: true });
    assert.strictEqual(B.formatoDoBanco('104').conta.operacao, 4);
    assert.strictEqual(B.formatoDoBanco('212').conta.digitos, 12);
    assert.strictEqual(B.formatoDoBanco(341).conta.digitos, 5);
});

test('logos: todo caminho existe no disco ou e URL do CDN fixada em commit', () => {
    const chaves = Object.keys(BANCOS_LOGOS);
    assert.ok(chaves.length >= 50);
    chaves.forEach(c => {
        const u = BANCOS_LOGOS[c];
        if (/^https:\/\/cdn\.jsdelivr\.net\/gh\/[^/]+\/[^/@]+@[0-9a-f]{40}\/.+\.(svg|png)$/.test(u)) return;
        assert.ok(fs.existsSync(path.join(__dirname, '..', u)), 'falta ' + u);
    });
    ['001', '104', '237', '341', '033', '260', '077', '336', '756', '748', '290', '323'].forEach(c => assert.ok(BANCOS_LOGOS[c], 'sem logo ' + c));
});
