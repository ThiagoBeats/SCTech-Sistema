'use strict';
// Teste guarda: todo <input> de dinheiro precisa da mascara de moeda (data-moeda).
// Varre os *.html da raiz e os js/*.js (templates montados em string) atras de <input> cujo
// id, name ou class lembra dinheiro; se o campo nao tiver data-moeda e nao estiver na lista de
// excecoes (com o motivo), o teste falha — assim um campo de dinheiro novo nao nasce sem mascara.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');

// Trechos que indicam dinheiro no id/name/class do campo.
const PADRAO_DINHEIRO = new RegExp([
    'valor', 'pre[cç]o', 'custo', 'saldo', 'desconto', 'mao[-_]?obra', 'recebido', 'limite', 'meta', 'total', 'frete', 'juros', 'multa',
    'extrato', 'pmin', 'pmax', '(^|[-_\\s])orc([-_\\s]|$)'
].join('|'), 'i');

// Campos que casam com o padrao, mas NAO guardam dinheiro. Cada um com o motivo.
const EXCECOES = [
    { casa: /^ped-desconto$/, motivo: 'desconto do pedido e percentual (0 a 100)' },
    { casa: /forma-pag-desconto/, motivo: 'desconto da forma de pagamento e percentual' },
    { casa: /^imp-nova-valor$/, motivo: 'valor de texto livre da coluna criada no importador (qualquer tipo de coluna)' },
    { casa: /^nf-valor$/, motivo: 'somente leitura: mostra o valor da nota ja emitida' },
    { casa: /^(ped-entrada-pct|est-markup|est-mat-markup|imp-markup)$/, motivo: 'porcentagem' }
];

function arquivos() {
    const lista = fs.readdirSync(RAIZ).filter(f => f.endsWith('.html')).map(f => path.join(RAIZ, f));
    const js = path.join(RAIZ, 'js');
    fs.readdirSync(js).filter(f => f.endsWith('.js')).forEach(f => lista.push(path.join(js, f)));
    return lista;
}

function atributo(tag, nome) {
    const m = tag.match(new RegExp('\\s' + nome + '\\s*=\\s*"([^"]*)"'));
    return m ? m[1] : null;
}

function inputsDe(arquivo) {
    const txt = fs.readFileSync(arquivo, 'utf8');
    const achados = [];
    const re = /<input\b[^>]*>/g;
    let m;
    while ((m = re.exec(txt))) {
        const linha = txt.slice(0, m.index).split('\n').length;
        achados.push({ arquivo: path.relative(RAIZ, arquivo), linha, tag: m[0] });
    }
    return achados;
}

function nomesDoCampo(tag) {
    return [atributo(tag, 'id'), atributo(tag, 'name'), atributo(tag, 'class')].filter(Boolean);
}

test('todo input de dinheiro tem data-moeda', () => {
    const faltando = [];
    for (const arq of arquivos()) {
        for (const inp of inputsDe(arq)) {
            const nomes = nomesDoCampo(inp.tag);
            if (!nomes.some(n => PADRAO_DINHEIRO.test(n))) continue;
            if (/\sdata-moeda(\s|=|>|\/)/.test(inp.tag)) continue;
            const type = atributo(inp.tag, 'type');
            if (type && /^(hidden|checkbox|radio|file|date|month|time|range|color|button|submit)$/i.test(type)) continue;
            const excecao = EXCECOES.some(e => nomes.some(n => e.casa.test(n) || n.split(/\s+/).some(c => e.casa.test(c))));
            if (excecao) continue;
            faltando.push(`${inp.arquivo}:${inp.linha}  ${inp.tag.slice(0, 140)}`);
        }
    }
    assert.deepStrictEqual(faltando, [],
        'Campo de dinheiro sem a mascara. Use type="text" inputmode="decimal" data-moeda (leia com lerCampoMoeda, grave com definirCampoMoeda) '
        + 'ou, se nao for dinheiro, acrescente o id em EXCECOES neste teste, com o motivo:\n' + faltando.join('\n'));
});

test('input com data-moeda e type="text" inputmode="decimal"', () => {
    const errados = [];
    let total = 0;
    for (const arq of arquivos()) {
        for (const inp of inputsDe(arq)) {
            if (!/\sdata-moeda(\s|=|>|\/)/.test(inp.tag)) continue;
            total++;
            // Campo que aceita negativo usa o teclado comum (o teclado decimal do iPhone nao tem "-").
            const modo = /data-moeda-neg/.test(inp.tag) ? 'text' : 'decimal';
            if (atributo(inp.tag, 'type') !== 'text' || atributo(inp.tag, 'inputmode') !== modo) {
                errados.push(`${inp.arquivo}:${inp.linha}  ${inp.tag.slice(0, 140)}`);
            }
        }
    }
    assert.ok(total > 20, 'esperava achar os campos de dinheiro convertidos (achou ' + total + ')');
    assert.deepStrictEqual(errados, [], 'data-moeda exige type="text" inputmode="decimal":\n' + errados.join('\n'));
});

test('o lint reconhece um campo de dinheiro sem mascara (autoteste)', () => {
    const ruim = '<input type="number" id="x-preco" step="0.01">';
    assert.ok(nomesDoCampo(ruim).some(n => PADRAO_DINHEIRO.test(n)));
    assert.ok(!/\sdata-moeda(\s|=|>|\/)/.test(ruim));
    assert.ok(nomesDoCampo('<input type="text" class="conta-saldo" value="">').some(n => PADRAO_DINHEIRO.test(n)));
    assert.ok(!nomesDoCampo('<input type="text" id="cli-nome">').some(n => PADRAO_DINHEIRO.test(n)));
});
