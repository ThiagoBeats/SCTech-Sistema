'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/docs-layout-core.js');

const DOCS = ['proposta', 'os', 'compra', 'medicao', 'financeiro'];

test('padrao de cada documento: cabecalho primeiro, variante 0, estilo nulo', () => {
    for (const id of DOCS) {
        const l = D.padrao(id);
        assert.strictEqual(l.blocos[0].id, 'cabecalho', id);
        assert.ok(l.blocos.every(b => b.visivel), id);
        for (const b of l.blocos) {
            const cat = D.DOCUMENTOS[id].blocos.find(x => x.id === b.id);
            assert.strictEqual(b.variante, cat.variantes[0].id, `${id}.${b.id}`);
        }
        assert.deepStrictEqual(l.estilo, { cor: null, destaque: null, fundo: null, fonte: 'sistema', marca: { ativa: false, tamanho: 'M', opacidade: 8 } });
        assert.strictEqual(D.variaveisCss(l.estilo), '');
    }
});

test('padrao devolve copia nova a cada chamada', () => {
    const a = D.padrao('proposta');
    a.blocos[0].variante = 'centro';
    assert.strictEqual(D.padrao('proposta').blocos[0].variante, 'esquerda');
});

test('ler tolera lixo', () => {
    assert.deepStrictEqual(D.ler('{x'), { versao: 1, docs: {} });
    assert.deepStrictEqual(D.ler(null), { versao: 1, docs: {} });
    assert.deepStrictEqual(D.ler('[1,2]'), { versao: 1, docs: {} });
    assert.deepStrictEqual(D.ler('{"versao":1,"docs":{"os":{"titulo":"X"}}}').docs.os, { titulo: 'X' });
});

test('doDocumento funde, descarta desconhecido, mantem cabecalho fixo', () => {
    const salvo = { versao: 1, docs: { proposta: {
        estilo: { cor: '#112233', fonte: 'nao-existe', marca: { ativa: true, opacidade: 99 } },
        blocos: [
            { id: 'totais', variante: 'largura', visivel: false },
            { id: 'fantasma' },
            { id: 'cabecalho', visivel: false, variante: 'centro' },
            { id: 'proprio-1', proprio: true, titulo: 'Sobre', corpo: 'x', variante: 'caixa', visivel: true }
        ] } } };
    const l = D.doDocumento(salvo, 'proposta');
    assert.strictEqual(l.estilo.cor, '#112233');
    assert.strictEqual(l.estilo.fonte, 'sistema');
    assert.strictEqual(l.estilo.marca.ativa, true);
    assert.strictEqual(l.estilo.marca.opacidade, 20);
    assert.strictEqual(l.estilo.marca.tamanho, 'M');
    assert.strictEqual(l.blocos[0].id, 'cabecalho');
    assert.strictEqual(l.blocos[0].visivel, true);
    assert.strictEqual(l.blocos[0].variante, 'centro');
    assert.ok(!l.blocos.some(b => b.id === 'fantasma'));
    assert.ok(l.blocos.some(b => b.id === 'proprio-1'));
    assert.strictEqual(l.blocos.find(b => b.id === 'totais').visivel, false);
    assert.strictEqual(l.blocos.length, D.padrao('proposta').blocos.length + 1);
    // ordem salva respeitada: totais logo depois do cabecalho
    assert.strictEqual(l.blocos[1].id, 'totais');
});

test('doDocumento valida cor, variante e texto', () => {
    const salvo = { versao: 1, docs: { os: {
        titulo: 42,
        estilo: { cor: 'red', destaque: '#abcdef', fundo: '#12345' },
        blocos: [{ id: 'assinaturas', variante: 'inexistente' }] } } };
    const l = D.doDocumento(salvo, 'os');
    assert.strictEqual(l.estilo.cor, null);
    assert.strictEqual(l.estilo.destaque, '#abcdef');
    assert.strictEqual(l.estilo.fundo, null);
    assert.strictEqual(l.titulo, D.padrao('os').titulo);
    assert.strictEqual(l.blocos.find(b => b.id === 'assinaturas').variante, 'lado');
});

test('documento desconhecido lanca erro claro', () => {
    assert.throws(() => D.padrao('xyz'), /documento desconhecido/);
});

test('preencher: conhecido, vazio, desconhecido, escape', () => {
    const esc = s => String(s).replace(/</g, '&lt;');
    assert.strictEqual(D.preencher('Olá {cliente}, {x} {vazio}', { cliente: '<Ana>', vazio: '' }, esc), 'Olá &lt;Ana>, {x} ');
    assert.strictEqual(D.preencher('{n}', { n: 0 }, String), '0');
    assert.strictEqual(D.preencher('{n}', { n: null }, String), '');
    assert.strictEqual(D.preencher('', {}, String), '');
});

test('copiarEstilo copia estilo e variante do cabecalho, nao textos', () => {
    const a = D.padrao('os');
    const b = D.padrao('proposta');
    b.estilo.cor = '#AA0000';
    b.blocos[0].variante = 'direita';
    b.titulo = 'X';
    const r = D.copiarEstilo(a, b);
    assert.strictEqual(r.estilo.cor, '#AA0000');
    assert.strictEqual(r.blocos[0].variante, 'direita');
    assert.strictEqual(r.titulo, a.titulo);
    assert.notStrictEqual(r.estilo, b.estilo);
    assert.strictEqual(a.estilo.cor, null, 'nao altera o destino original');
});

test('novoBlocoProprio cria ids unicos', () => {
    let l = D.padrao('medicao');
    l = D.novoBlocoProprio(l);
    l = D.novoBlocoProprio(l);
    const proprios = l.blocos.filter(b => b.proprio);
    assert.strictEqual(proprios.length, 2);
    assert.notStrictEqual(proprios[0].id, proprios[1].id);
    assert.deepStrictEqual(Object.keys(proprios[0]).sort(), ['corpo', 'id', 'proprio', 'titulo', 'variante', 'visivel']);
    assert.strictEqual(proprios[0].variante, 'simples');
});

test('variaveisCss emite so o que foi escolhido', () => {
    const e = D.padrao('os').estilo;
    e.cor = '#7A1F3D';
    e.fonte = 'georgia';
    const css = D.variaveisCss(e);
    assert.match(css, /--primary:#7A1F3D;/);
    assert.match(css, /--doc-cor:#7A1F3D;/);
    assert.match(css, /--doc-fonte:Georgia/);
    assert.doesNotMatch(css, /--doc-fundo/);
});

test('migrarCondicoes so na primeira vez e so se mudou', () => {
    const m = D.migrarCondicoes({ versao: 1, docs: {} }, 'Linha antiga');
    assert.strictEqual(D.doDocumento(m, 'proposta').blocos.find(b => b.id === 'condicoes').corpo, 'Linha antiga');
    const ja = { versao: 1, docs: { proposta: { titulo: 'T' } } };
    assert.strictEqual(D.migrarCondicoes(ja, 'Outra'), ja);
    const vazio = { versao: 1, docs: {} };
    assert.strictEqual(D.migrarCondicoes(vazio, ''), vazio);
    assert.strictEqual(D.migrarCondicoes(vazio, null), vazio);
});

test('todo marcador dos textos padrao existe no documento', () => {
    for (const id of DOCS) {
        const doc = D.DOCUMENTOS[id];
        const chaves = new Set([...doc.campos, ...D.CAMPOS_COMUNS].map(c => c.chave));
        const l = D.padrao(id);
        const textos = [l.titulo, ...l.blocos.flatMap(b => [b.titulo, b.corpo, b.aviso])].filter(Boolean);
        for (const t of textos) for (const m of t.matchAll(/\{(\w+)\}/g)) assert.ok(chaves.has(m[1]), `${id}: {${m[1]}}`);
    }
});

test('fontes e paletas: primeira e o padrao do sistema', () => {
    assert.deepStrictEqual(D.FONTES[0], { id: 'sistema', nome: 'Padrão do sistema', familia: null, google: null });
    assert.strictEqual(D.PALETAS[0].cor, null);
    assert.ok(D.PALETAS.length >= 5);
    for (const p of D.PALETAS.slice(1)) for (const k of ['cor', 'destaque', 'fundo']) assert.match(p[k], /^#[0-9a-f]{6}$/i);
});
