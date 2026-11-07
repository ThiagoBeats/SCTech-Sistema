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

const dentro = (m) => m.elementos.every(e => e.x_mm >= 0 && e.y_mm >= 0 && e.x_mm + e.w_mm <= m.largura_mm && e.y_mm + e.h_mm <= m.altura_mm);

test('formatos e campos padrao', () => {
    assert.deepStrictEqual(E.FORMATOS_ETIQUETA.map(f => f.id), ['100x50', '100x100', '100x150', '60x40', '50x30']);
    assert.deepStrictEqual(E.CAMPOS_ETIQUETA_PEDIDO.map(c => c.campo),
        ['numero', 'cliente', 'endereco', 'telefone', 'entrega', 'vendedor', 'status', 'ambientes', 'observacoes', 'volume']);
});

test('modelo padrao 100x50 traz os elementos combinados e cabe na etiqueta', () => {
    const m = E.modeloPadraoPedido(100, 50);
    assert.strictEqual(m.formato, '100x50');
    const chaves = m.elementos.map(e => e.tipo === 'campo' ? e.campo : e.tipo).sort();
    assert.deepStrictEqual(chaves, ['barcode', 'cliente', 'endereco', 'entrega', 'numero', 'qrcode', 'volume']);
    assert.ok(dentro(m));
    assert.strictEqual(new Set(m.elementos.map(e => e.id)).size, m.elementos.length);
});

test('modelo padrao cabe em todos os formatos', () => {
    for (const f of E.FORMATOS_ETIQUETA) assert.ok(dentro(E.modeloPadraoPedido(f.largura_mm, f.altura_mm)), f.id);
});

test('ajustarAoFormato traz para dentro e encolhe o que nao cabe', () => {
    const m = E.modeloPadraoPedido(100, 150);
    const r = E.ajustarAoFormato(m, 50, 30);
    assert.ok(dentro(r.modelo));
    assert.ok(r.ajustados.length > 0);
    assert.strictEqual(r.modelo.largura_mm, 50);
    assert.strictEqual(m.largura_mm, 100, 'nao muta a entrada');
});

test('encaixarNaGrade arredonda para 1 mm', () => {
    assert.strictEqual(E.encaixarNaGrade(12.4), 12);
    assert.strictEqual(E.encaixarNaGrade(12.6), 13);
    assert.strictEqual(E.encaixarNaGrade(-3), 0);
});

test('avisosLegibilidade de barras e QR', () => {
    // '26001-2-3' tem 9 caracteres: 11*(9+2)+13+20 = 154 modulos; 0,25 mm => 38,5 mm
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'barcode', w_mm: 45, h_mm: 12 }, '26001-2-3').length, 0);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'barcode', w_mm: 30, h_mm: 12 }, '26001-2-3').length, 1);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'barcode', w_mm: 45, h_mm: 6 }, '26001-2-3').length, 1);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'qrcode', w_mm: 20, h_mm: 20 }, '26001-2-3').length, 0);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'qrcode', w_mm: 12, h_mm: 20 }, '26001-2-3').length, 1);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'campo', campo: 'cliente', w_mm: 5, h_mm: 5 }, 'x').length, 0);
});

test('lerConfigEtiquetas devolve o padrao para vazio, lixo ou formato antigo', () => {
    for (const bruto of [null, '', '{', '[]', '{"modelos":{}}', '{"modelos":{"pedido":{"elementos":"x"}}}']) {
        const cfg = E.lerConfigEtiquetas(bruto);
        assert.strictEqual(cfg.modelos.pedido.formato, '100x50', bruto);
        assert.ok(cfg.modelos.pedido.elementos.length > 0);
    }
    const salvo = { modelos: { pedido: E.modeloPadraoPedido(60, 40) } };
    assert.strictEqual(E.lerConfigEtiquetas(JSON.stringify(salvo)).modelos.pedido.formato, '60x40');
});

test('valoresEtiquetaPedido monta os textos', () => {
    const { pedido, cliente } = E.pedidoExemplo();
    const v = E.valoresEtiquetaPedido(pedido, cliente, 2, 3, 'logo.png');
    assert.strictEqual(v.numero, '26001');
    assert.strictEqual(v.cliente, 'Maria Souza');
    assert.strictEqual(v.entrega, '14/11/2026');
    assert.strictEqual(v.volume, '2/3');
    assert.strictEqual(v.ambientes, '3');
    assert.strictEqual(v.logo, 'logo.png');
});

test('valoresEtiquetaPedido aguenta cliente excluido e campos vazios', () => {
    const v = E.valoresEtiquetaPedido({ id: 26002, clienteNome: 'Joao' }, null, 1, 1, '');
    assert.strictEqual(v.cliente, 'Joao');
    assert.strictEqual(v.endereco, '');
    assert.strictEqual(v.telefone, '');
    assert.strictEqual(v.entrega, '');
    assert.strictEqual(v.ambientes, '0');
});

test('htmlEtiqueta posiciona em mm, escapa texto e insere os SVGs', () => {
    const m = { formato: 'custom', largura_mm: 80, altura_mm: 40, elementos: [
        { id: 'a', tipo: 'campo', campo: 'cliente', x_mm: 5, y_mm: 2, w_mm: 40, h_mm: 6, fonte_pt: 10 },
        { id: 'b', tipo: 'campo', campo: 'numero', x_mm: 5, y_mm: 10, w_mm: 40, h_mm: 6, fonte_pt: 12, negrito: true },
        { id: 'c', tipo: 'barcode', x_mm: 5, y_mm: 20, w_mm: 45, h_mm: 12 },
        { id: 'd', tipo: 'qrcode', x_mm: 55, y_mm: 5, w_mm: 20, h_mm: 20 }
    ] };
    const v = { cliente: '<b>Ana</b>', numero: '26001' };
    const html = E.htmlEtiqueta(m, v, { barcode: '<svg id="bc"></svg>', qrcode: '<svg id="qr"></svg>' });
    assert.match(html, /width:80mm/);
    assert.match(html, /left:5mm/);
    assert.match(html, /&lt;b&gt;Ana&lt;\/b&gt;/);
    assert.match(html, /PEDIDO #26001/);
    assert.match(html, /<svg id="bc">/);
    assert.match(html, /<svg id="qr">/);
    assert.match(html, /data-id="a"/);
    assert.match(html, /text-overflow:ellipsis|-webkit-line-clamp/);
});

test('htmlEtiqueta sem SVG mostra lugar reservado e respeita mostrar_rotulo', () => {
    const m = { formato: 'custom', largura_mm: 50, altura_mm: 30, elementos: [
        { id: 'a', tipo: 'campo', campo: 'numero', x_mm: 1, y_mm: 1, w_mm: 30, h_mm: 6, mostrar_rotulo: false },
        { id: 'b', tipo: 'barcode', x_mm: 1, y_mm: 10, w_mm: 45, h_mm: 10 }
    ] };
    const html = E.htmlEtiqueta(m, { numero: '26001' }, {});
    assert.doesNotMatch(html, /PEDIDO #/);
    assert.match(html, /etq-cod-ph/);
});

test('htmlEtiqueta: valor ausente vira vazio, texto e escape de aspas', () => {
    const m = { formato: 'custom', largura_mm: 50, altura_mm: 30, elementos: [
        { id: 'a', tipo: 'campo', campo: 'cliente', x_mm: 1, y_mm: 1, w_mm: 30, h_mm: 6 },
        { id: 't', tipo: 'texto', texto: 'A "B" & C', x_mm: 1, y_mm: 8, w_mm: 30, h_mm: 6 },
        { id: 'e', tipo: 'campo', campo: 'endereco', x_mm: 1, y_mm: 15, w_mm: 30, h_mm: 8, fonte_pt: 8 }
    ] };
    const html = E.htmlEtiqueta(m, { endereco: 'Rua X' }, {});
    assert.doesNotMatch(html, /undefined/);
    assert.match(html, /A &quot;B&quot; &amp; C/);
    assert.match(html, /-webkit-line-clamp:/);
});
