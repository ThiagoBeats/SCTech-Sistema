'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/etiquetas-core.js');

test('montarCodigoVolume usa so digitos e hifen', () => {
    assert.strictEqual(E.montarCodigoVolume(26001, 2, 3), '26001-2-3');
    assert.strictEqual(E.montarCodigoVolume(26001, 1, 1), '26001-1-1');
});

test('lerCodigo reconhece documento e volume', () => {
    assert.deepStrictEqual(E.lerCodigo('26001'), { tipo: 'pedido', pedidoId: 26001 });
    assert.deepStrictEqual(E.lerCodigo(' 26001-2-3 \r\n'), { tipo: 'volume', pedidoId: 26001, volume: 2, total: 3 });
    assert.deepStrictEqual(E.lerCodigo('026001'), { tipo: 'pedido', pedidoId: 26001 });
});

test('lerCodigo recusa lixo e volume fora do total', () => {
    for (const t of ['', '   ', 'abc', '26001-0-3', '26001-4-3', '26001-1-0', '26001-2', '26001/2/3', null, undefined]) {
        assert.deepStrictEqual(E.lerCodigo(t), { tipo: 'invalido' }, JSON.stringify(t));
    }
});
