'use strict';
const test = require('node:test');
const assert = require('node:assert');
const A = require('../js/agenda-core.js');

const cfg = { inicio: '08:00', fim: '18:00', passo: 60 };

test('ferias de 20 a 24 ocupam 5 dias inteiros (00:00 a 24:00, nao so o expediente)', () => {
    const oc = A.ocupacoesDoEvento({ tipo: 'bloqueio', bloqueio: 'ferias', data_ini: '2025-11-20', data_fim: '2025-11-24' }, cfg);
    assert.strictEqual(oc.length, 5);
    assert.deepStrictEqual(oc[0], { data: '2025-11-20', ini: 0, fim: 1440 });
    assert.strictEqual(oc[4].data, '2025-11-24');
    // medicao as 07:00 (antes do expediente) num dia de ferias conflita
    assert.strictEqual(A.conflitos(oc, { data: '2025-11-22', ini: 420, fim: 480 }).length, 1);
    // folga, dia inteiro e compromisso de dia inteiro tambem
    ['folga', 'dia'].forEach(b => assert.deepStrictEqual(
        A.ocupacoesDoEvento({ tipo: 'bloqueio', bloqueio: b, data_ini: '2025-11-20' }, cfg), [{ data: '2025-11-20', ini: 0, fim: 1440 }]));
    assert.deepStrictEqual(A.ocupacoesDoEvento({ tipo: 'compromisso', dia_inteiro: true, data_ini: '2025-11-20' }, cfg), [{ data: '2025-11-20', ini: 0, fim: 1440 }]);
});

test('data invalida nao ocupa nada nem gera lembrete', () => {
    assert.deepStrictEqual(A.ocupacoesDoEvento({ tipo: 'bloqueio', bloqueio: 'dia', data_ini: "2025-11-20');alert(1);('" }, cfg), []);
    assert.deepStrictEqual(A.ocupacoesDoEvento({ tipo: 'compromisso', data_ini: 'x', hora_ini: '09:00', hora_fim: '10:00' }, cfg), []);
    assert.strictEqual(A.janelaLembrete({ tipo: 'compromisso', data_ini: '20/11/2025', hora_ini: '09:00', hora_fim: '10:00' }), null);
    // data fim invalida: so o dia inicio
    assert.deepStrictEqual(A.ocupacoesDoEvento({ tipo: 'bloqueio', bloqueio: 'ferias', data_ini: '2025-11-20', data_fim: 'lixo' }, cfg), [{ data: '2025-11-20', ini: 0, fim: 1440 }]);
    assert.strictEqual(A.dataOk('2025-11-20'), true);
    assert.strictEqual(A.dataOk('2025-11-20x'), false);
});

test('bloqueio de horario e compromisso ocupam so hora_ini a hora_fim', () => {
    const oc = A.ocupacoesDoEvento({ tipo: 'bloqueio', bloqueio: 'horario', data_ini: '2025-11-20', hora_ini: '14:00', hora_fim: '16:00' }, cfg);
    assert.deepStrictEqual(oc, [{ data: '2025-11-20', ini: 840, fim: 960 }]);
    const c = A.ocupacoesDoEvento({ tipo: 'compromisso', data_ini: '2025-11-20', hora_ini: '09:00', hora_fim: '09:30' }, cfg);
    assert.deepStrictEqual(c, [{ data: '2025-11-20', ini: 540, fim: 570 }]);
});

test('conflito: sobreposicao estrita', () => {
    const oc = [{ data: '2025-11-20', ini: 600, fim: 660 }];
    assert.strictEqual(A.conflitos(oc, { data: '2025-11-20', ini: 630, fim: 690 }).length, 1);
    assert.strictEqual(A.conflitos(oc, { data: '2025-11-20', ini: 660, fim: 720 }).length, 0);
    assert.strictEqual(A.conflitos(oc, { data: '2025-11-21', ini: 630, fim: 690 }).length, 0);
});

test('periodo: semana, dia e mes', () => {
    const s = A.periodo('semana', '2025-11-19');
    assert.strictEqual(s.rotulo, '17 a 23 de nov de 2025');
    assert.strictEqual(s.dias[0], '2025-11-17');
    assert.strictEqual(s.dias[6], '2025-11-23');
    assert.strictEqual(A.periodo('semana', '2025-11-30').rotulo, '24 a 30 de nov de 2025');
    assert.strictEqual(A.periodo('semana', '2025-10-30').rotulo, '27 de out a 2 de nov de 2025');
    assert.strictEqual(A.periodo('dia', '2025-11-19').rotulo, '19 de nov de 2025');
    const m = A.periodo('mes', '2025-11-19');
    assert.strictEqual(m.dias.length, 42);
    assert.strictEqual(m.dias[0], '2025-10-27');
    assert.strictEqual(m.rotulo, 'novembro de 2025');
});

test('visivel esconde a descricao de quem nao e dono nem Admin', () => {
    const ev = { prof: 'u:12', tipo: 'compromisso', descricao: 'Dentista' };
    assert.deepStrictEqual(A.visivel(ev, 7, false), { titulo: 'Compromisso', descricao: '' });
    assert.strictEqual(A.visivel(ev, 12, false).descricao, 'Dentista');
    assert.strictEqual(A.visivel(ev, 7, true).descricao, 'Dentista');
    const b = { prof: 'u:12', tipo: 'bloqueio', descricao: 'Viagem' };
    assert.deepStrictEqual(A.visivel(b, 7, false), { titulo: 'Indisponível', descricao: '' });
});

test('podeGerenciar: Admin sempre, senao so o dono', () => {
    assert.ok(A.podeGerenciar('u:3', 1, true));
    assert.ok(A.podeGerenciar('u:3', 3, false));
    assert.ok(!A.podeGerenciar('u:3', 4, false));
    assert.ok(!A.podeGerenciar('n:joao', 4, false));
});

test('janelaLembrete: aviso de 30 min antes ate o fim; so compromisso', () => {
    const ev = { tipo: 'compromisso', data_ini: '2025-11-20', hora_ini: '10:00', hora_fim: '11:00', aviso_min: 30 };
    const j = A.janelaLembrete(ev, cfg);
    assert.strictEqual(j.de.getHours() * 60 + j.de.getMinutes(), 570);
    assert.strictEqual(j.ate.getHours(), 11);
    assert.strictEqual(A.janelaLembrete({ ...ev, tipo: 'bloqueio' }, cfg), null);
});
