'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/mascaras-core.js');

test('formatarMoedaDigitos trata digitos como centavos', () => {
    assert.strictEqual(M.formatarMoedaDigitos(''), '');
    assert.strictEqual(M.formatarMoedaDigitos('5'), 'R$ 0,05');
    assert.strictEqual(M.formatarMoedaDigitos('125000'), 'R$ 1.250,00');
    assert.strictEqual(M.formatarMoedaDigitos('000125000'), 'R$ 1.250,00');
    assert.strictEqual(M.formatarMoedaDigitos('R$ 1.250,0'), 'R$ 125,00');
});

test('formatarMoeda', () => {
    assert.strictEqual(M.formatarMoeda(1250), 'R$ 1.250,00');
    assert.strictEqual(M.formatarMoeda(0), 'R$ 0,00');
    assert.strictEqual(M.formatarMoeda(null), '');
    assert.strictEqual(M.formatarMoeda(''), '');
    assert.strictEqual(M.formatarMoeda(-12.5), '-R$ 12,50');
    assert.strictEqual(M.formatarMoeda(1234567.891), 'R$ 1.234.567,89');
});

test('lerMoeda', () => {
    assert.strictEqual(M.lerMoeda('R$ 1.250,00'), 1250);
    assert.strictEqual(M.lerMoeda('1.250'), 1250);
    assert.strictEqual(M.lerMoeda('1250,5'), 1250.5);
    assert.strictEqual(M.lerMoeda('1250.50'), 1250.5);
    assert.strictEqual(M.lerMoeda('1.25'), 1.25);
    assert.strictEqual(M.lerMoeda('1.250.000,5'), 1250000.5);
    assert.strictEqual(M.lerMoeda('-R$ 12,50'), -12.5);
    assert.strictEqual(M.lerMoeda(''), null);
    assert.strictEqual(M.lerMoeda('abc'), null);
    assert.strictEqual(M.lerMoeda(null), null);
    assert.strictEqual(M.lerMoeda(99.9), 99.9);
});

test('lerMoeda aceita tudo que CaixaCore.lerNumero aceita', () => {
    const C = require('../js/caixa-core.js');
    ['10', '10,5', '1.250,00', '1,250.00', '0,07', '12.5', '-3'].forEach(s => {
        const a = C.lerNumero(s);
        if (Number.isFinite(a)) assert.notStrictEqual(M.lerMoeda(s), null, s);
    });
});

test('capitalizar', () => {
    assert.strictEqual(M.capitalizar('joão foi. ele voltou', 3).texto, 'João foi. Ele voltou');
    assert.strictEqual(M.capitalizar('olá! tudo bem? sim', 0).texto, 'Olá! Tudo bem? Sim');
    assert.strictEqual(M.capitalizar('  (oi)', 0).texto, '  (Oi)');
    assert.strictEqual(M.capitalizar('valor 1.5 mil', 0).texto, 'Valor 1.5 mil');
    assert.strictEqual(M.capitalizar('ver email joao@x.com. depois', 0).texto, 'Ver email joao@x.com. Depois');
    assert.strictEqual(M.capitalizar('joao@x.com', 0).texto, 'joao@x.com');
    assert.strictEqual(M.capitalizar('a.\nb', 0).texto, 'A.\nB');
    assert.strictEqual(M.capitalizar('abc', 2).cursor, 2);
    assert.strictEqual(M.capitalizar('', 0).texto, '');
    assert.strictEqual(M.capitalizar('av. das palmeiras', 0).texto, 'Av. das palmeiras');
    assert.strictEqual(M.capitalizar('rua x, n. 10. depois', 0).texto, 'Rua x, n. 10. Depois');
    assert.strictEqual(M.capitalizar('dr. joão chegou. ele saiu', 0).texto, 'Dr. joão chegou. Ele saiu');
    assert.strictEqual(M.capitalizar('ltda. foi. ok', 0).texto, 'Ltda. foi. Ok');
    assert.strictEqual(M.capitalizar('já Ok', 5).texto, 'Já Ok');
});

test('aceitaMaiuscula', () => {
    const c = (o) => Object.assign({ tag: 'INPUT', type: 'text', id: '', name: '', autocomplete: '', inputmode: '', dataset: {} }, o);
    ['email', 'password', 'tel', 'number', 'date', 'search'].forEach(t => assert.strictEqual(M.aceitaMaiuscula(c({ type: t, id: 'cli-nome' })), false, t));
    ['cli-cep', 'cnpj', 'cp-linha-digitavel', 'conta-numero', 'busca-pedidos'].forEach(i => assert.strictEqual(M.aceitaMaiuscula(c({ id: i })), false, i));
    assert.strictEqual(M.aceitaMaiuscula(c({ id: 'cli-nome' })), true);
    assert.strictEqual(M.aceitaMaiuscula(c({ id: 'obs', tag: 'TEXTAREA', type: null })), true);
    assert.strictEqual(M.aceitaMaiuscula(c({ id: 'cli-nome', type: null })), true);
    assert.strictEqual(M.aceitaMaiuscula(c({ id: 'cli-nome', dataset: { semMaiuscula: '' } })), false);
    assert.strictEqual(M.aceitaMaiuscula(c({ id: 'x', dataset: { moeda: '' } })), false);
    assert.strictEqual(M.aceitaMaiuscula(c({ id: 'x', inputmode: 'decimal' })), false);
    assert.strictEqual(M.aceitaMaiuscula(c({ id: 'corte-descricao' })), true);
    assert.strictEqual(M.aceitaMaiuscula({ tag: 'SELECT' }), false);
});
