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

test('calcularChegadas com trecho desconhecido conta zero e so aquela parada fica incerta', () => {
    const r = R.calcularChegadas({ inicioDia: 480, paradas: [{ agendadoMin: null, durMin: 60 }, { agendadoMin: null, durMin: 60 }, { agendadoMin: 600, durMin: 30 }], trechosMin: [null, 15, 10] });
    assert.deepStrictEqual(r.paradas.map(p => [p.chegadaMin, p.incerto]), [[480, true], [555, false], [625, false]]);
    assert.strictEqual(r.paradas[2].atrasoMin, 25);
});

test('hhmm arredonda antes e da a volta no dia', () => {
    assert.strictEqual(R.hhmm(59.6), '01:00');
    assert.strictEqual(R.hhmm(-20), '23:40');
    assert.strictEqual(R.hhmm(1450), '00:10');
});

test('melhorOrdemAberta: caminho sem volta mais curto saindo do 0', () => {
    // pontos numa reta: 0 - 1 - 2 - 3 (distancia = diferenca)
    const pos = [0, 10, 20, 30];
    const reta = pos.map(a => pos.map(b => Math.abs(a - b)));
    assert.deepStrictEqual(R.melhorOrdemAberta(reta), [0, 1, 2, 3]);
    // 0 no meio: vai primeiro ao lado mais perto e depois atravessa
    const p2 = [0, -5, 20, 25];
    assert.deepStrictEqual(R.melhorOrdemAberta(p2.map(a => p2.map(b => Math.abs(a - b)))), [0, 1, 2, 3]);
    assert.deepStrictEqual(R.melhorOrdemAberta([[0]]), [0]);
    const p3 = Array.from({ length: 14 }, (_, i) => i * 3);
    assert.deepStrictEqual(R.melhorOrdemAberta(p3.map(a => p3.map(b => Math.abs(a - b)))), p3.map((_, i) => i));
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
            { hora: '10:55', tipo: 'Instalação #261', cliente: 'Pedro', tel: '', end: 'Rua B, 2', aviso: '25 minutos depois do agendado (10:30)' },
        ],
        links: ['https://l1', 'https://l2'], totalKm: 28.4, totalMin: 70,
    });
    assert.ok(t.startsWith('Rota de 15/11/2026 — João'));
    assert.ok(t.includes('Saída: Rua X, 100'));
    assert.ok(t.includes('1. 09:00 · Medição · Maria'));
    assert.ok(t.includes('📞 (41) 9999-0000'));
    assert.ok(t.includes('📍 Rua B, 2'));
    assert.ok(t.includes('⚠ 25 minutos depois do agendado (10:30)'));
    assert.ok(t.includes('Total: 28,4 km · 1h10 de trajeto'));
    assert.ok(t.includes('Parte 1: https://l1') && t.includes('Parte 2: https://l2'));
    const um = R.textoWhatsRota({ data: '2026-11-15', tecnico: '', itens: [{ hora: '', tipo: 'Medição', cliente: 'A', end: 'X' }], links: ['https://l'] });
    assert.ok(um.includes('Rota no Google Maps: https://l') && um.includes('1. Medição · A'));
});

test('duracaoPorExtenso: minutos por extenso, com singular e plural', () => {
    assert.strictEqual(R.duracaoPorExtenso(607), '10 horas e 7 minutos');
    assert.strictEqual(R.duracaoPorExtenso(61), '1 hora e 1 minuto');
    assert.strictEqual(R.duracaoPorExtenso(120), '2 horas');
    assert.strictEqual(R.duracaoPorExtenso(25), '25 minutos');
    assert.strictEqual(R.duracaoPorExtenso(1), '1 minuto');
    assert.strictEqual(R.duracaoPorExtenso(60), '1 hora');
    assert.strictEqual(R.duracaoPorExtenso(0), '0 minutos');
});

test('enderecoCompleto junta a cidade ao endereco, sem repetir quando ele ja a traz', () => {
    assert.strictEqual(R.enderecoCompleto('Rua X, 10', 'Curitiba'), 'Rua X, 10, Curitiba');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10,', ' Curitiba '), 'Rua X, 10, Curitiba');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10 - Centro, curitiba', 'Curitiba'), 'Rua X, 10 - Centro, curitiba');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10, Sao Jose', 'São José'), 'Rua X, 10, Sao Jose');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10', ''), 'Rua X, 10');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10', undefined), 'Rua X, 10');
    assert.strictEqual(R.enderecoCompleto('', 'Curitiba'), '');
    assert.strictEqual(R.enderecoCompleto('Rua Curitibana, 5', 'Curitiba'), 'Rua Curitibana, 5, Curitiba');
    assert.strictEqual(R.enderecoCompleto('Rua Curitiba, 5', 'Curitiba'), 'Rua Curitiba, 5, Curitiba');
    assert.strictEqual(R.enderecoCompleto('Rua Curitiba, 5, Curitiba - PR', 'Curitiba'), 'Rua Curitiba, 5, Curitiba - PR');
    assert.strictEqual(R.enderecoCompleto('Rua X - Centro, Curitiba/PR', 'Curitiba'), 'Rua X - Centro, Curitiba/PR');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10 - Vila Curitiba', 'Curitiba'), 'Rua X, 10 - Vila Curitiba, Curitiba');
    assert.strictEqual(R.enderecoCompleto('Rua A, 10, Jardim Curitiba, Maringa', 'Curitiba'), 'Rua A, 10, Jardim Curitiba, Maringa, Curitiba');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10, Curitiba PR', 'Curitiba'), 'Rua X, 10, Curitiba PR');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10, Curitiba - PR, 80000-000', 'Curitiba'), 'Rua X, 10, Curitiba - PR, 80000-000');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10, Curitiba, 80000-000', 'Curitiba'), 'Rua X, 10, Curitiba, 80000-000');
    assert.strictEqual(R.enderecoCompleto('Rua X, 10, Curitiba Alta', 'Curitiba'), 'Rua X, 10, Curitiba Alta, Curitiba');
});
