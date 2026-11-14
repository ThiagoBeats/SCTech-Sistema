'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/rotas-core.js');

const dec = u => decodeURIComponent(u);

test('linkIrPara abre o caminho ate o endereco, saindo de onde a pessoa esta', () => {
    const u = R.linkIrPara('Rua das Flores, 10 - Centro, Curitiba');
    assert.ok(u.startsWith('https://www.google.com/maps/dir/?api=1&destination='));
    assert.ok(dec(u).includes('Rua das Flores, 10 - Centro, Curitiba'));
    assert.ok(u.includes('travelmode=driving'));
    assert.ok(!u.includes('origin='));
    assert.strictEqual(R.linkIrPara('   '), '');
});

test('linksRota: ate 3 paradas intermediarias por link, cada parte comeca onde a anterior terminou', () => {
    const p = ['A', 'B', 'C', 'D', 'E'];
    const links = R.linksRota({ origem: 'Empresa', paradas: p, volta: true }).map(dec);
    // pontos: Empresa A B C D E Empresa -> [Empresa..D] e [D..Empresa]
    assert.strictEqual(links.length, 2);
    assert.ok(links[0].includes('origin=Empresa') && links[0].includes('waypoints=A|B|C') && links[0].includes('destination=D'));
    assert.ok(links[1].includes('origin=D') && links[1].includes('waypoints=E') && links[1].includes('destination=Empresa'));
});

test('linksRota sem empresa: primeiro link sai de onde o tecnico esta e nao volta', () => {
    const links = R.linksRota({ origem: '', paradas: ['A', 'B'], volta: true }).map(dec);
    assert.strictEqual(links.length, 1);
    assert.ok(!links[0].includes('origin='));
    assert.ok(links[0].includes('waypoints=A') && links[0].includes('destination=B'));
    assert.deepStrictEqual(R.linksRota({ origem: 'X', paradas: [], volta: true }), []);
});

test('normalizarEndereco ignora acento, caixa e espacos', () => {
    assert.strictEqual(R.normalizarEndereco('  Rua  São João,  10. '), R.normalizarEndereco('rua sao joao, 10'));
});

test('ordemDoTrip devolve os indices na ordem da viagem (sem a origem quando comAOrigem)', () => {
    const resp = { code: 'Ok', waypoints: [{ waypoint_index: 0 }, { waypoint_index: 3 }, { waypoint_index: 1 }, { waypoint_index: 2 }] };
    assert.deepStrictEqual(R.ordemDoTrip(resp, true), [1, 2, 0]);   // indices das paradas (sem a empresa)
    assert.deepStrictEqual(R.ordemDoTrip(resp, false), [0, 2, 3, 1]);
    assert.strictEqual(R.ordemDoTrip({ code: 'NoTrips' }, true), null);
});

test('trechosDaRota le os trechos de route e de trip', () => {
    assert.deepStrictEqual(R.trechosDaRota({ code: 'Ok', routes: [{ legs: [{ distance: 3200, duration: 600 }, { distance: 1000, duration: 120 }] }] }),
        [{ metros: 3200, segundos: 600 }, { metros: 1000, segundos: 120 }]);
    assert.deepStrictEqual(R.trechosDaRota({ code: 'Ok', trips: [{ legs: [{ distance: 5, duration: 6 }] }] }), [{ metros: 5, segundos: 6 }]);
    assert.strictEqual(R.trechosDaRota({ code: 'Error' }), null);
});

test('calcularChegadas: sai a tempo da 1a visita, espera quando chega cedo e avisa atraso acima de 10 min', () => {
    const r = R.calcularChegadas({
        inicioDia: 480,
        paradas: [{ agendadoMin: 540, durMin: 60 }, { agendadoMin: 600, durMin: 60 }, { agendadoMin: null, durMin: 30 }, { agendadoMin: 720, durMin: 30 }],
        trechosMin: [20, 25, 10, 5],
    });
    assert.strictEqual(r.saidaMin, 520);
    assert.deepStrictEqual(r.paradas.map(p => p.chegadaMin), [540, 625, 695, 730]);
    assert.deepStrictEqual(r.paradas.map(p => p.atrasoMin), [0, 25, 0, 0]);   // 10 min de folga nao avisa
    const cedo = R.calcularChegadas({ inicioDia: 480, paradas: [{ agendadoMin: null, durMin: 30 }, { agendadoMin: 600, durMin: 30 }], trechosMin: [10, 10] });
    assert.strictEqual(cedo.saidaMin, 480);
    assert.deepStrictEqual(cedo.paradas.map(p => [p.chegadaMin, p.inicioMin]), [[490, 490], [530, 600]]);
});

test('calcularChegadas com trecho desconhecido conta zero e marca incerto', () => {
    const r = R.calcularChegadas({ inicioDia: 480, paradas: [{ agendadoMin: null, durMin: 60 }, { agendadoMin: null, durMin: 60 }], trechosMin: [null, 15] });
    assert.deepStrictEqual(r.paradas.map(p => [p.chegadaMin, p.incerto]), [[480, true], [555, true]]);
});

test('observacao da rota: grava, substitui a do mesmo dia e sai quando nao ha atraso', () => {
    const linha = R.linhaObsRota('2026-11-15', 640, 540);
    assert.strictEqual(linha, 'Rota de 15/11/2026: chegada prevista 10:40 (agendado 09:00)');
    let obs = R.aplicarObsRota('Portão azul', '2026-11-15', linha);
    assert.strictEqual(obs, 'Portão azul\nRota de 15/11/2026: chegada prevista 10:40 (agendado 09:00)');
    obs = R.aplicarObsRota(obs, '2026-11-15', R.linhaObsRota('2026-11-15', 600, 540));
    assert.strictEqual(obs, 'Portão azul\nRota de 15/11/2026: chegada prevista 10:00 (agendado 09:00)');
    obs = R.aplicarObsRota(obs + '\nRota de 16/11/2026: chegada prevista 08:00 (agendado 07:00)', '2026-11-15', null);
    assert.strictEqual(obs, 'Portão azul\nRota de 16/11/2026: chegada prevista 08:00 (agendado 07:00)');
    assert.strictEqual(R.aplicarObsRota('', '2026-11-15', null), '');
});

test('texto do WhatsApp para o tecnico tem a lista, o aviso e os links', () => {
    const t = R.textoWhatsRota({
        data: '2026-11-15', tecnico: 'João', saida: 'Rua X, 100',
        itens: [
            { hora: '09:00', tipo: 'Medição', cliente: 'Maria', tel: '(41) 9999-0000', end: 'Rua A, 1' },
            { hora: '10:55', tipo: 'Instalação #261', cliente: 'Pedro', tel: '', end: 'Rua B, 2', aviso: '25 min depois do agendado (10:30)' },
        ],
        links: ['https://l1', 'https://l2'], totalKm: 28.4, totalMin: 70,
    });
    assert.ok(t.startsWith('Rota de 15/11/2026 — João'));
    assert.ok(t.includes('Saída: Rua X, 100'));
    assert.ok(t.includes('1. 09:00 · Medição · Maria'));
    assert.ok(t.includes('📞 (41) 9999-0000'));
    assert.ok(t.includes('📍 Rua B, 2'));
    assert.ok(t.includes('⚠ 25 min depois do agendado (10:30)'));
    assert.ok(t.includes('Total: 28,4 km · 1h10 de trajeto'));
    assert.ok(t.includes('Parte 1: https://l1') && t.includes('Parte 2: https://l2'));
    const um = R.textoWhatsRota({ data: '2026-11-15', tecnico: '', itens: [{ hora: '', tipo: 'Medição', cliente: 'A', end: 'X' }], links: ['https://l'] });
    assert.ok(um.includes('Rota no Google Maps: https://l') && um.includes('1. Medição · A'));
});
