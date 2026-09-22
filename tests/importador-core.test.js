'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/importador-core.js');

test('normalizarCodigo remove o asterisco e marca promocional', () => {
    assert.deepStrictEqual(C.normalizarCodigo('*AC123'), { codigo: 'AC123', promocional: true });
    assert.deepStrictEqual(C.normalizarCodigo('AC123'), { codigo: 'AC123', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo('  ac 123 '), { codigo: 'AC123', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo(''), { codigo: '', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo(null), { codigo: '', promocional: false });
});

test('normalizarPreco aceita virgula, ponto e numero', () => {
    assert.deepStrictEqual(C.normalizarPreco('78,90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco('78.90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco('R$ 78,90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco(78.900000000000006), { valor: 78.9, ok: true, motivo: null });
});

test('normalizarPreco recusa traco, vazio e texto', () => {
    for (const bruto of ['--', '', '   ', null, undefined, 'sob consulta']) {
        const r = C.normalizarPreco(bruto);
        assert.strictEqual(r.ok, false, `deveria recusar ${JSON.stringify(bruto)}`);
        assert.strictEqual(r.valor, null);
        assert.ok(r.motivo && r.motivo.length > 0);
    }
});

test('normalizarLargura avisa quando passa de 10', () => {
    assert.deepStrictEqual(C.normalizarLargura('2,80'), { valor: 2.8, aviso: null });
    assert.deepStrictEqual(C.normalizarLargura(3), { valor: 3, aviso: null });
    const cm = C.normalizarLargura('280');
    assert.strictEqual(cm.valor, 280);
    assert.match(cm.aviso, /cent[ií]metro/i);
    assert.deepStrictEqual(C.normalizarLargura(''), { valor: null, aviso: null });
});

test('normalizarNome colapsa espacos', () => {
    assert.strictEqual(C.normalizarNome('  LINHO   BELGA  '), 'LINHO BELGA');
    assert.strictEqual(C.normalizarNome(null), '');
});

test('normalizarLargura com sufixo de unidade (Finding A)', () => {
    // FINDING A: widths with unit suffixes should parse, not silently lose the value
    assert.deepStrictEqual(C.normalizarLargura('2,80m'), { valor: 2.8, aviso: null });
    assert.deepStrictEqual(C.normalizarLargura('2.80 m'), { valor: 2.8, aviso: null });
    const cm = C.normalizarLargura('280cm');
    assert.strictEqual(cm.valor, 280);
    assert.match(cm.aviso, /cent[ií]metro/i);
    // Currency symbol in width cell means column mapping is wrong — reject it
    assert.deepStrictEqual(C.normalizarLargura('R$ 2,80'), { valor: null, aviso: null });
});

test('normalizarPreco e normalizarLargura rejeitam valores negativos (Finding B)', () => {
    // FINDING B: negative prices and widths should be rejected
    const preco1 = C.normalizarPreco('-78,90');
    assert.strictEqual(preco1.ok, false);
    assert.strictEqual(preco1.valor, null);
    assert.ok(preco1.motivo && preco1.motivo.length > 0);

    const preco2 = C.normalizarPreco(-78.9);
    assert.strictEqual(preco2.ok, false);
    assert.strictEqual(preco2.valor, null);
    assert.ok(preco2.motivo && preco2.motivo.length > 0);

    // Zero stays valid for both
    assert.deepStrictEqual(C.normalizarPreco(0), { valor: 0, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco('0'), { valor: 0, ok: true, motivo: null });

    // Width: negative values should return null
    assert.deepStrictEqual(C.normalizarLargura(-5), { valor: null, aviso: null });
});
