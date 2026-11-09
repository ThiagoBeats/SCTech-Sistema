'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/cortina-desenho.js');

const PREGAS = Object.keys(C.PREGAS);
const contar = (s, re) => (s.match(re) || []).length;

test('todas as aberturas e pregas geram SVG completo, com as tags fechadas', () => {
    for (const abertura of Object.keys(C.ABERTURAS)) {
        for (const prega of PREGAS) {
            for (const animado of [false, true]) {
                const s = C.svg({ abertura, pregas: [prega], animado });
                assert.match(s, /^<\?xml[^>]*>\s*<svg /);
                assert.match(s, /<\/svg>\s*$/);
                assert.strictEqual(contar(s, /<g[\s>]/g), contar(s, /<\/g>/g), `${abertura} ${prega} <g> desbalanceado`);
                assert.doesNotMatch(s, /NaN|undefined/);
            }
        }
    }
});

test('ids nao se repetem no mesmo desenho, mesmo com tres camadas', () => {
    const s = C.svg({ abertura: 'C', pregas: ['Franzido', 'Franzido', 'Wave Plus'], animado: true });
    const ids = [...s.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.strictEqual(new Set(ids).size, ids.length);
});

test('cada prega desenha a cortina de um jeito diferente', () => {
    const desenhos = PREGAS.map(p => C.svg({ abertura: 'A', pregas: [p] }).replace(/<text[\s\S]*?<\/text>/g, '').replace(/aria-label="[^"]*"/, ''));
    assert.strictEqual(new Set(desenhos).size, PREGAS.length);
});

test('a legenda mostra a abertura e as pregas, na ordem dos tecidos', () => {
    const s = C.svg({ abertura: 'C', pregas: ['Wave Botao', 'Americana'] });
    assert.match(s, /Abertura C<\/tspan> — Abertura Central \/ Comando à Esquerda/);
    assert.match(s, /Pregas:<\/tspan> Wave Botão \+ Prega Americana/);
    assert.match(C.svg({ abertura: 'A', pregas: ['Painel'] }), /Prega:<\/tspan> Painel \/ Sem Prega/);
});

test('uma camada (trilho e lupa) por tecido, no maximo tres', () => {
    const trilhos = n => contar(C.svg({ abertura: 'A', pregas: Array(n).fill('Americana') }), /width="904" height="14"/g);
    const lupas = n => contar(C.svg({ abertura: 'A', pregas: Array(n).fill('Americana') }), /<clipPath id="lupa\d"/g);
    assert.strictEqual(lupas(1), 1);
    assert.strictEqual(lupas(2), 2);
    assert.strictEqual(lupas(3), 3);
    assert.strictEqual(lupas(5), 3);
    assert.ok(trilhos(2) > trilhos(1));
});

test('prega desconhecida ou vazia vira Americana; abertura desconhecida vira A', () => {
    assert.deepStrictEqual(C.camadasDasPregas(['', 'xyz', null]), ['Americana', 'Americana', 'Americana']);
    assert.deepStrictEqual(C.camadasDasPregas([]), ['Americana']);
    assert.deepStrictEqual(C.camadasDasPregas(undefined), ['Americana']);
    assert.strictEqual(C.svg({ abertura: 'Z', pregas: [] }), C.svg({ abertura: 'A', pregas: ['Americana'] }));
});

test('so a versao animada tem animacao', () => {
    assert.doesNotMatch(C.svg({ abertura: 'B', pregas: ['Wave Plus'] }), /<animate/);
    assert.match(C.svg({ abertura: 'B', pregas: ['Wave Plus'], animado: true }), /<animateTransform/);
});

test('descricao e url de dados', () => {
    assert.strictEqual(C.descricao({ abertura: 'G', pregas: ['Franzido', 'Painel'] }), 'Abertura G · Franzido + Painel / Sem Prega');
    const url = C.urlSvg({ abertura: 'A', pregas: ['Americana'] });
    assert.match(url, /^data:image\/svg\+xml;charset=utf-8,%3C%3Fxml/);
    assert.doesNotMatch(url, /"/);
});
