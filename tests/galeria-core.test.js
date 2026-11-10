'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/galeria-core.js');
const C = require('../js/cortina-desenho.js');

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-9), `${msg || ''} ${a} ~ ${b}`);
const JANELA = [[100, 100], [300, 100], [300, 300], [100, 300]];
const PNG = 'img-1';

test('pregas iguais as do desenho da cortina', () => {
    assert.deepStrictEqual(Object.keys(G.PREGAS), Object.keys(C.PREGAS));
    assert.deepStrictEqual(Object.keys(G.PERSIANAS), ['rolo', 'romana', 'double']);
    assert.deepStrictEqual(G.ABERTURAS, ['central', 'esquerda', 'direita']);
    assert.deepStrictEqual(G.GRUPOS.map(g => g.id), ['pregas', 'trilhos', 'rolo', 'romana', 'double']);
    assert.ok(G.GRUPOS.every(g => g.nome));
});

test('visualTrilho separa varao de trilho', () => {
    assert.strictEqual(G.visualTrilho('Varão Suíço/Wave'), 'varao');
    assert.strictEqual(G.visualTrilho('Varão Alumínio Comum'), 'varao');
    assert.strictEqual(G.visualTrilho('Trilho Suíço Duplo'), 'trilho');
    assert.strictEqual(G.visualTrilho(''), 'trilho');
});

test('padraoMostruario liga tudo e comeca vazio', () => {
    const m = G.padraoMostruario(['Trilho Suíço Simples', 'Varão Alumínio Comum']);
    assert.strictEqual(m.versao, 1);
    assert.strictEqual(m.modelos.pregas.length, 6);
    assert.deepStrictEqual(m.modelos.persianas, ['rolo', 'romana', 'double']);
    assert.deepStrictEqual(m.modelos.trilhos, ['Trilho Suíço Simples', 'Varão Alumínio Comum']);
    assert.deepStrictEqual(m.cores, []);
    assert.deepStrictEqual(m.fotos, []);
});

test('lerMostruario tolera lixo', () => {
    for (const lixo of [null, undefined, 'x', 42, []]) {
        const m = G.lerMostruario(lixo, ['Trilho A']);
        assert.strictEqual(m.modelos.pregas.length, 6);
        assert.deepStrictEqual(m.modelos.trilhos, ['Trilho A']);
    }
    const m = G.lerMostruario({
        cores: [{ nome: 'A', hex: 'azul' }, { id: 'c1', nome: 'Vinho', hex: '#7A1F3D', texturaId: 5 }],
        fotos: [{ grupo: 'nada', imagemId: '1' }, { grupo: 'pregas' }, { id: 'f1', grupo: 'rolo', imagemId: PNG, legenda: 7 }],
        modelos: { pregas: ['Inexistente', 'Wave Botao'], persianas: ['rolo', 'x'], trilhos: ['Trilho A', 3] }
    }, ['Trilho A']);
    assert.deepStrictEqual(m.cores, [{ id: 'c1', nome: 'Vinho', hex: '#7a1f3d', texturaId: null }]);
    assert.deepStrictEqual(m.fotos, [{ id: 'f1', grupo: 'rolo', imagemId: PNG, legenda: '', liga: null }]);
    assert.deepStrictEqual(m.modelos.pregas, ['Wave Botao']);
    assert.deepStrictEqual(m.modelos.persianas, ['rolo']);
    assert.deepStrictEqual(m.modelos.trilhos, ['Trilho A']);
});

test('lerMostruario limita a 60 fotos e valida a ligacao', () => {
    const fotos = Array.from({ length: 70 }, (_, i) => ({ id: 'f' + i, grupo: 'pregas', imagemId: 'i' + i }));
    fotos[0].liga = { tipo: 'prega', valor: 'Wave Botao' };
    fotos[1].liga = { tipo: 'prega', valor: 'Nada' };
    fotos[2].liga = { tipo: 'persiana', valor: 'romana' };
    const m = G.lerMostruario({ fotos }, []);
    assert.strictEqual(m.fotos.length, 60);
    assert.strictEqual(G.LIMITE_FOTOS, 60);
    assert.deepStrictEqual(m.fotos[0].liga, { tipo: 'prega', valor: 'Wave Botao' });
    assert.strictEqual(m.fotos[1].liga, null);
    assert.deepStrictEqual(m.fotos[2].liga, { tipo: 'persiana', valor: 'romana' });
});

test('coresDisponiveis cai nas cores iniciais quando vazio', () => {
    const iniciais = G.coresDisponiveis(G.padraoMostruario([]));
    assert.strictEqual(iniciais.length, 6);
    assert.ok(iniciais.every(c => /^#[0-9a-f]{6}$/.test(c.hex) && c.id && c.nome));
    const m = G.lerMostruario({ cores: [{ id: 'c1', nome: 'X', hex: '#112233' }] }, []);
    assert.deepStrictEqual(G.coresDisponiveis(m).map(c => c.id), ['c1']);
});

test('homografia leva os cantos e preserva a identidade', () => {
    const Q = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const I = G.homografia(Q, Q);
    const p = G.aplicarHomografia(I, [0.3, 0.7]);
    perto(p[0], 0.3); perto(p[1], 0.7);
    const D = [[10, 10], [110, 20], [100, 120], [0, 100]];
    const H = G.homografia(Q, D);
    Q.forEach((q, i) => { const r = G.aplicarHomografia(H, q); perto(r[0], D[i][0], 1e-6); perto(r[1], D[i][1], 1e-6); });
});

test('ordenarCantos e prenderCantos', () => {
    const q = G.ordenarCantos([[300, 300], [100, 100], [100, 300], [300, 100]]);
    assert.deepStrictEqual(q, [[100, 100], [300, 100], [300, 300], [100, 300]]);
    // canto sup-esq arrastado para alem do inf-dir: continua um quadrilatero valido
    const cruzado = G.ordenarCantos([[350, 350], [300, 100], [300, 300], [100, 300]]);
    assert.strictEqual(cruzado.length, 4);
    assert.ok(cruzado[0][1] <= cruzado[3][1] && cruzado[0][0] <= cruzado[1][0]);
    assert.deepStrictEqual(G.prenderCantos([[-50, 5], [900, 5], [900, 700], [10, 700]], 800, 600),
        [[0, 5], [800, 5], [800, 600], [10, 600]]);
});

test('areaProduto: cortina sai mais larga e desce; persiana cobre a janela', () => {
    const ch = G.areaProduto(JANELA, { produto: 'cortina', ate: 'chao' }, 600);
    assert.ok(ch[0][1] < 100 && ch[1][1] < 100, 'topo acima da janela');
    assert.ok(ch[0][0] < 100 && ch[1][0] > 300, 'mais larga');
    perto(ch[2][1], 600, 1e-6, 'base no chao'); perto(ch[3][1], 600, 1e-6);
    const jn = G.areaProduto(JANELA, { produto: 'cortina', ate: 'janela' }, 600);
    assert.ok(jn[2][1] > 300 && jn[2][1] < 320, 'base logo abaixo da janela');
    const pe = G.areaProduto(JANELA, { produto: 'persiana', ate: 'chao' }, 600);
    pe.forEach((p, i) => { perto(p[0], JANELA[i][0], 2); perto(p[1], JANELA[i][1], 2); });
});

test('geometriaCortina: fechada cobre tudo, aberta recolhe para o lado e as dobras crescem', () => {
    const amp = g => Math.max(...g.paineis.flatMap(p => p.z.map(Math.abs)));
    for (const prega of Object.keys(G.PREGAS)) {
        for (const abertura of G.ABERTURAS) {
            const f = G.geometriaCortina({ prega, abertura, aberto: 0, colunas: 60 });
            const a = G.geometriaCortina({ prega, abertura, aberto: 1, colunas: 60 });
            const xf = f.paineis.flatMap(p => p.x), xa = a.paineis.flatMap(p => p.x);
            assert.ok(Math.min(...xf) <= 0.01 && Math.max(...xf) >= 0.99, `${prega} ${abertura} fechada`);
            f.paineis.forEach(p => assert.strictEqual(p.x.length, p.z.length));
            if (abertura === 'central') {
                assert.strictEqual(f.paineis.length, 2);
                assert.ok(xa.every(x => x < 0.3 || x > 0.7), `${prega} central aberta`);
            } else if (abertura === 'esquerda') {
                assert.ok(xa.every(x => x <= 0.25), `${prega} esquerda aberta`);
            } else {
                assert.ok(xa.every(x => x >= 0.75), `${prega} direita aberta`);
            }
            if (prega === 'Painel') assert.ok(amp(a) < 0.01, 'painel plano');
            else assert.ok(amp(a) > amp(f), `${prega} dobras crescem`);
        }
    }
});

test('geometriaPersiana: rolo sobe, romana dobra, double tem faixas', () => {
    assert.ok(G.geometriaPersiana({ tipo: 'rolo', aberto: 1, linhas: 20 }).baseVisivel <= 0.1);
    assert.strictEqual(G.geometriaPersiana({ tipo: 'rolo', aberto: 0, linhas: 20 }).baseVisivel, 1);
    const r = G.geometriaPersiana({ tipo: 'romana', aberto: 0.5, linhas: 40 });
    assert.ok(r.z.some(z => Math.abs(z) > 0.001));
    assert.strictEqual(r.y.length, r.z.length);
    assert.ok(G.geometriaPersiana({ tipo: 'double', aberto: 0, linhas: 20 }).faixas > 0);
});

test('dimensaoReduzida nao amplia', () => {
    assert.deepStrictEqual(G.dimensaoReduzida(4000, 3000, 1600), { w: 1600, h: 1200 });
    assert.deepStrictEqual(G.dimensaoReduzida(3000, 4000, 1600), { w: 1200, h: 1600 });
    assert.deepStrictEqual(G.dimensaoReduzida(800, 600, 1600), { w: 800, h: 600 });
});

test('quadValido: so quadrilatero convexo, sem cruzar e sem cantos colados', () => {
    const ret = [[300, 250], [700, 250], [700, 600], [300, 600]];
    assert.strictEqual(G.quadValido(ret), true);
    assert.strictEqual(G.quadValido([[300, 250], [700, 250], [450, 320], [300, 600]]), false, 'concavo');
    assert.strictEqual(G.quadValido([[300, 250], [700, 600], [700, 250], [300, 600]]), false, 'gravata');
    assert.strictEqual(G.quadValido([[0, 0], [0, 0], [700, 600], [300, 600]]), false, 'cantos colados');
    assert.strictEqual(G.quadValido([[300, 250], [310, 250], [700, 600], [300, 600]], 20), false, 'perto demais');
    assert.strictEqual(G.quadValido([[0, 0], [400, 0], [800, 0], [400, 300]]), false, 'tres alinhados');
});

test('trilhos: guarda os desmarcados; kit novo aparece, kit apagado some', () => {
    const m = G.lerMostruario({ modelos: { trilhosOcultos: ['Trilho B', 'Kit apagado'] } }, ['Trilho A', 'Trilho B', 'Trilho Novo']);
    assert.deepStrictEqual(m.modelos.trilhos, ['Trilho A', 'Trilho Novo']);
    assert.deepStrictEqual(m.modelos.trilhosOcultos, ['Trilho B']);
    assert.deepStrictEqual(G.padraoMostruario(['X']).modelos.trilhosOcultos, []);
});
