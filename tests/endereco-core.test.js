'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/endereco-core.js');

test('textoEndereco junta rua, numero, complemento e bairro sem vazios', () => {
    assert.strictEqual(E.textoEndereco({ rua: 'Rua XV de Novembro', numero: '100', complemento: '', bairro: 'Centro' }), 'Rua XV de Novembro, 100, Centro');
    assert.strictEqual(E.textoEndereco({ rua: ' Rua A ', numero: ' 5 ', complemento: ' ap 2 ', bairro: ' B ' }), 'Rua A, 5, ap 2, B');
    assert.strictEqual(E.textoEndereco({}), '');
});

test('mascara e validacao do CEP', () => {
    assert.strictEqual(E.mascaraCep(' 80.010-000 '), '80010-000');
    assert.strictEqual(E.mascaraCep('80010000'), '80010-000');
    assert.strictEqual(E.mascaraCep('8001'), '8001');
    assert.strictEqual(E.mascaraCep('800100'), '80010-0');
    assert.strictEqual(E.soDigitosCep('80010-000999'), '80010000');
    assert.strictEqual(E.cepCompleto('80010-000'), true);
    assert.strictEqual(E.cepCompleto(' 80010000 '), true);
    assert.strictEqual(E.cepCompleto('8001000'), false);
    assert.strictEqual(E.cepCompleto('800100001'), false);
});

test('partesDeRegistroAntigo poe o texto inteiro na rua e a cidade antiga', () => {
    assert.deepStrictEqual(E.partesDeRegistroAntigo('Rua A, 10 - Centro', 'Curitiba'),
        { cep: '', rua: 'Rua A, 10 - Centro', numero: '', complemento: '', bairro: '', cidade: 'Curitiba', uf: '' });
    assert.deepStrictEqual(E.partesDeRegistroAntigo(undefined, undefined),
        { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' });
});

test('interpretarViaCep', () => {
    assert.strictEqual(E.interpretarViaCep({ erro: true }).ok, false);
    assert.strictEqual(E.interpretarViaCep({ erro: 'true' }).ok, false);
    assert.strictEqual(E.interpretarViaCep({ erro: true }).motivo, 'nao-encontrado');
    assert.deepStrictEqual(E.interpretarViaCep({ cep: '85960-000', logradouro: '', bairro: '', localidade: 'Marechal Cândido Rondon', uf: 'PR' }),
        { ok: true, rua: '', bairro: '', cidade: 'Marechal Cândido Rondon', uf: 'PR', cidadeToda: true });
    assert.deepStrictEqual(E.interpretarViaCep({ logradouro: 'Rua XV', bairro: 'Centro', localidade: 'Curitiba', uf: 'PR' }),
        { ok: true, rua: 'Rua XV', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR', cidadeToda: false });
});

test('interpretarBrasilApi', () => {
    assert.deepStrictEqual(E.interpretarBrasilApi({ street: 'Rua XV', neighborhood: 'Centro', city: 'Curitiba', state: 'PR' }),
        { ok: true, rua: 'Rua XV', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR', cidadeToda: false });
    assert.strictEqual(E.interpretarBrasilApi({ street: null, neighborhood: null, city: 'X', state: 'PR' }).cidadeToda, true);
    assert.strictEqual(E.interpretarBrasilApi(null).ok, false);
});

test('UFS tem as 27 siglas em ordem alfabetica', () => {
    assert.strictEqual(E.UFS.length, 27);
    assert.strictEqual(new Set(E.UFS).size, 27);
    assert.deepStrictEqual(E.UFS, E.UFS.slice().sort());
});
