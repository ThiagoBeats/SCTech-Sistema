'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/feriados-core.js');

const tem = (lista, data) => lista.filter(f => f.data === data);

test('pascoa de 2024 a 2027', () => {
    assert.strictEqual(F.pascoa(2024), '2024-03-31');
    assert.strictEqual(F.pascoa(2025), '2025-04-20');
    assert.strictEqual(F.pascoa(2026), '2026-04-05');
    assert.strictEqual(F.pascoa(2027), '2027-03-28');
});

test('2026: moveis calculados a partir da Pascoa', () => {
    const l = F.doAno(2026);
    assert.strictEqual(tem(l, '2026-04-03')[0].tipo, 'nacional');          // Sexta-feira Santa
    assert.strictEqual(tem(l, '2026-04-03')[0].nome, 'Paixão de Cristo');
    ['2026-02-16', '2026-02-17'].forEach(d => { assert.strictEqual(tem(l, d)[0].nome, 'Carnaval'); assert.strictEqual(tem(l, d)[0].tipo, 'facultativo'); });
    assert.strictEqual(tem(l, '2026-02-18')[0].nome, 'Quarta-feira de Cinzas');
    assert.strictEqual(tem(l, '2026-06-04')[0].nome, 'Corpus Christi');
    assert.strictEqual(tem(l, '2026-06-04')[0].tipo, 'facultativo');
});

test('20/11 so a partir de 2024', () => {
    assert.strictEqual(tem(F.doAno(2024), '2024-11-20').length, 1);
    assert.strictEqual(tem(F.doAno(2023), '2023-11-20').length, 0);
});

test('lista ordenada por data e todos os nacionais presentes', () => {
    const l = F.doAno(2026);
    assert.deepStrictEqual(l.map(f => f.data), l.map(f => f.data).slice().sort());
    assert.strictEqual(l.filter(f => f.tipo === 'nacional').length, 10);
});

test('estaduais: SP, RS e ES; sem uf nao ha estadual; uf desconhecida tambem nao', () => {
    assert.strictEqual(tem(F.doAno(2026, { uf: 'SP' }), '2026-07-09')[0].tipo, 'estadual');
    assert.strictEqual(tem(F.doAno(2026, { uf: 'sp' }), '2026-07-09')[0].uf, 'SP');
    assert.strictEqual(tem(F.doAno(2026, { uf: 'RS' }), '2026-09-20')[0].tipo, 'estadual');
    assert.strictEqual(tem(F.doAno(2026, { uf: 'ES' }), '2026-04-13')[0].nome, 'Nossa Senhora da Penha');
    assert.strictEqual(F.doAno(2026).filter(f => f.tipo === 'estadual').length, 0);
    assert.strictEqual(F.doAno(2026, { uf: 'XX' }).filter(f => f.tipo === 'estadual').length, 0);
    assert.strictEqual(tem(F.doAno(2026, { uf: 'RS' }), '2026-07-09').length, 0);
});

test('PR: 19/12 nao e feriado (Lei 18.384/2014 revogou a Lei 4.658/1962)', () => {
    assert.strictEqual(tem(F.doAno(2026, { uf: 'PR' }), '2026-12-19').length, 0);
    assert.ok(!F.UFS_COM_FERIADO.includes('PR'));
});

test('UFS_COM_FERIADO so tem siglas validas e cada uma gera feriado', () => {
    F.UFS_COM_FERIADO.forEach(uf => {
        assert.match(uf, /^[A-Z]{2}$/);
        assert.ok(F.doAno(2026, { uf }).some(f => f.tipo === 'estadual'), uf);
    });
});

test('municipal repete todo ano; 29/02 so em ano bissexto', () => {
    const m = [{ dia: 8, mes: 9, nome: 'Aniversário da cidade' }];
    [2025, 2026, 2030].forEach(a => {
        const f = tem(F.doAno(a, { municipais: m }), a + '-09-08');
        assert.strictEqual(f.length, 1);
        assert.strictEqual(f[0].tipo, 'municipal');
    });
    const b = [{ dia: 29, mes: 2, nome: 'X' }];
    assert.strictEqual(F.doAno(2027, { municipais: b }).filter(f => f.tipo === 'municipal').length, 0);
    assert.strictEqual(F.doAno(2028, { municipais: b }).filter(f => f.tipo === 'municipal').length, 1);
});

test('municipal em data de feriado nacional nao repete; entrada invalida e ignorada', () => {
    const l = F.doAno(2026, { municipais: [{ dia: 25, mes: 12, nome: 'Natal da cidade' }, { dia: 0, mes: 5, nome: 'x' }, { dia: 3, mes: 5, nome: '' }] });
    assert.strictEqual(tem(l, '2026-12-25').length, 1);
    assert.strictEqual(l.filter(f => f.tipo === 'municipal').length, 0);
});

test('corpusMunicipal troca o tipo de Corpus Christi', () => {
    const f = tem(F.doAno(2026, { corpusMunicipal: true }), '2026-06-04');
    assert.strictEqual(f.length, 1);
    assert.strictEqual(f[0].tipo, 'municipal');
});

test('noPeriodo atravessa o ano', () => {
    const l = F.noPeriodo('2026-12-28', '2027-01-03');
    assert.ok(l.some(f => f.data === '2027-01-01'));
    assert.ok(!l.some(f => f.data === '2026-12-25'));
    assert.deepStrictEqual(l.map(f => f.data), l.map(f => f.data).slice().sort());
});
