# Importação de tabelas de fornecedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário importe a tabela de preços de um fornecedor (`.xlsx`, `.csv` ou `.pdf`) para o catálogo de tecidos e a lista de materiais, mapeando as colunas ele mesmo e conferindo tudo antes de gravar.

**Architecture:** Toda a lógica que não depende do navegador vive em `js/importador-core.js`, um módulo de funções puras (entra array de linhas, sai array de itens classificados) testado com `node --test` contra a planilha real do fornecedor. A interface do assistente vive em `js/importador-ui.js`, que lê o arquivo, chama o core e grava em `db`. O `app.js` só ganha o botão que abre o assistente.

**Tech Stack:** HTML5/CSS3/JavaScript sem build. SheetJS e pdf.js carregados sob demanda via CDN jsdelivr. Testes com `node --test` (nativo, sem dependências). Testes de navegador com Playwright instalado fora do projeto.

**Spec:** [docs/superpowers/specs/2026-09-21-importacao-tabelas-fornecedor-design.md](../specs/2026-09-21-importacao-tabelas-fornecedor-design.md)

## Global Constraints

- **Sem build e sem dependência de runtime.** O sistema é servido como arquivos estáticos. Nenhuma biblioteca pode ser exigida para a página abrir; bibliotecas entram sob demanda por `<script>` apontando para `https://cdn.jsdelivr.net/npm/...`, seguindo o padrão de `_garantirPdfJs()` em `js/app.js:7529`.
- **Persistência só em `localStorage`**, sempre através de `syncDB()`. Recarregamento de página após gravar usa `salvarERecarregar(msg)`.
- **O importador não escreve em `db.estoque` nem em `db.movimentos`.** Metragem e quantidade continuam entrando pela tela de estoque.
- **Código (`referencia`) é único no sistema inteiro**, somando `db.catalogo` e `db.materiais`.
- **Nome é único** dentro de `db.catalogo` e dentro de `db.materiais`, porque `salvarCatalogo()` (`js/app.js:1348`) e `salvarMaterial()` (`js/app.js:3170`) já rejeitam nome repetido.
- **Preço da tabela do fornecedor é custo** (`preco_custo`), nunca preço de venda. Venda é sempre `preco_custo × (1 + markup/100)`.
- **Interface em português do Brasil**, usando os componentes existentes: `.modal-overlay`/`.modal-box`, `toast(msg, tipo)`, `showAlert(msg, icone)`, `showConfirm(msg, icone, okLabel, cancelLabel)`.
- **Cores só por token CSS** (`var(--dark)`, `var(--primary)`, `var(--muted)`), nunca hex literal em código novo.
- **Markup é percentual inteiro** na interface (80 = 80%), convertido para fração só no cálculo.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `js/importador-core.js` (criar) | Funções puras: normalização, detecção de cabeçalho, sugestão de mapeamento, montagem de itens, markup, classificação, aplicação, perfis, agrupamento de PDF, expansão por cor. Sem DOM, sem `db`, sem `localStorage`. |
| `js/importador-ui.js` (criar) | Assistente de 4 passos: leitura de arquivo, carregamento de SheetJS/pdf.js, telas, gravação em `db`, snapshot e desfazer. |
| `catalogo.html` (modificar) | Carrega os dois scripts novos e ganha o botão "📥 Importar tabela". |
| `js/app.js` (modificar) | `db.import_perfis` no bootstrap e em `syncDB()`. |
| `tests/xlsx-min.js` (criar) | Leitor mínimo de `.xlsx` usado **só pelos testes**, para que o Node leia a planilha real sem instalar nada. |
| `tests/importador-core.test.js` (criar) | Testes das funções puras contra a planilha real. |
| `package.json` (criar) | Só `"scripts": { "test": "node --test" }`. Sem dependências. |

A divisão em `-core` e `-ui` é um refinamento do que a spec chamou de `js/importador.js`: separar o que é testável fora do navegador do que exige DOM.

---

## Fase 1 — Planilha

### Task 1: Leitor mínimo de .xlsx para os testes

Sem isso, nenhum teste consegue abrir a planilha real, porque o projeto não tem npm e o SheetJS só existe no navegador.

**Files:**
- Create: `tests/xlsx-min.js`
- Create: `tests/xlsx-min.test.js`
- Create: `package.json`
- Modify: `.gitignore` (nada a remover; confirmar que `docs/` não está ignorado)

**Interfaces:**
- Consumes: nada.
- Produces: `lerXlsx(caminho)` → `{ abas, ordem }`, onde `abas` é um objeto `{ [nomeDaAba]: linhas }`, `linhas` é `string[][]` indexado a partir de 0 (linha 1 da planilha = índice 0), e `ordem` é `string[]` com os nomes das abas na ordem do arquivo. Células vazias vêm como `undefined`.

- [ ] **Step 1: Versionar os arquivos de referência do fornecedor**

Os testes leem a planilha real. Ela precisa estar no repositório.

```bash
git add "docs/Tabela RC - SETEMBRO - 2024.xlsx" "docs/Tabela de preços RC TECIDOS PDF.pdf"
git commit -m "test: versiona tabela real do fornecedor usada nos testes do importador"
```

- [ ] **Step 2: Criar o package.json**

Só registra o comando de teste. Não instala nada.

```json
{
  "name": "sctech",
  "version": "1.0.0",
  "private": true,
  "description": "Sistema de gestao para cortineiros - HTML/CSS/JS sem build",
  "scripts": {
    "test": "node --test"
  }
}
```

> `node --test` sem argumento, de propósito: no Node v25 do Windows, passar
> `tests/` faz o runner tentar `require()` o diretório em vez de varrê-lo, e
> tudo falha. A descoberta padrão acha `**/*.test.js` e ignora `*.spec.js`,
> então as specs do Playwright das Tasks 14 e 18 não são executadas por aqui.

- [ ] **Step 3: Escrever o teste do leitor**

`tests/xlsx-min.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { lerXlsx } = require('./xlsx-min.js');

const PLANILHA = path.join(__dirname, '..', 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

test('le as 22 abas da planilha real', () => {
    const { ordem } = lerXlsx(PLANILHA);
    assert.strictEqual(ordem.length, 22);
    assert.ok(ordem.includes('Capa'));
    assert.ok(ordem.includes('Book 10'));
});

test('Book 10 tem o cabecalho esperado na linha 2', () => {
    const { abas } = lerXlsx(PLANILHA);
    const linha = abas['Book 10'][1];
    assert.match(String(linha[0]), /C[OÓ]DIGO/i);
    assert.match(String(linha[1]), /DESCRI/i);
    assert.match(String(linha[3]), /LARGURA/i);
    assert.match(String(linha[4]), /CORTE/i);
    assert.match(String(linha[5]), /PE[CÇ]A/i);
});

test('Book 10 traz codigo, descricao e preco nas linhas de produto', () => {
    const { abas } = lerXlsx(PLANILHA);
    const produtos = abas['Book 10'].slice(2).filter(l => l[0] && l[1]);
    assert.ok(produtos.length >= 30, `esperava 30+ produtos, veio ${produtos.length}`);
    assert.ok(produtos.every(l => String(l[0]).trim().length > 0));
});
```

- [ ] **Step 4: Rodar o teste e ver falhar**

```bash
npm test
```

Esperado: FALHA com `Cannot find module './xlsx-min.js'`.

- [ ] **Step 5: Implementar o leitor**

`tests/xlsx-min.js` — um `.xlsx` é um zip de XMLs. Este leitor abre o zip pelo diretório central, decodifica `sharedStrings.xml` e converte cada planilha em array de arrays.

```js
'use strict';
// Leitor minimo de .xlsx, usado SOMENTE pelos testes. O navegador usa SheetJS;
// aqui o Node precisa abrir a planilha real sem nenhuma dependencia instalada.
const fs = require('node:fs');
const zlib = require('node:zlib');

// --- ZIP: le o diretorio central e devolve { nomeDoArquivo: Buffer } ---
function lerZip(caminho) {
    const buf = fs.readFileSync(caminho);
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) throw new Error('Arquivo nao parece ser um zip/xlsx valido');
    const total = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const arquivos = {};
    for (let n = 0; n < total; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Diretorio central corrompido');
        const metodo   = buf.readUInt16LE(p + 10);
        const tamComp  = buf.readUInt32LE(p + 20);
        const tamNome  = buf.readUInt16LE(p + 28);
        const tamExtra = buf.readUInt16LE(p + 30);
        const tamCom   = buf.readUInt16LE(p + 32);
        const offLocal = buf.readUInt32LE(p + 42);
        const nome     = buf.toString('utf8', p + 46, p + 46 + tamNome);
        const nomeLocal  = buf.readUInt16LE(offLocal + 26);
        const extraLocal = buf.readUInt16LE(offLocal + 28);
        const inicio = offLocal + 30 + nomeLocal + extraLocal;
        const bruto = buf.subarray(inicio, inicio + tamComp);
        arquivos[nome] = metodo === 0 ? bruto : zlib.inflateRawSync(bruto);
        p += 46 + tamNome + tamExtra + tamCom;
    }
    return arquivos;
}

// --- XML ---
function decodificarXml(s) {
    return String(s)
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&amp;/g, '&');
}

function lerSharedStrings(xml) {
    if (!xml) return [];
    return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
        [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodificarXml(t[1])).join(''));
}

function colunaParaIndice(ref) {
    const letras = ref.match(/^[A-Z]+/)[0];
    let n = 0;
    for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
    return n - 1;
}

function lerPlanilha(xml, strings) {
    const linhas = [];
    for (const mLinha of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
        const idx = Number(mLinha[1]) - 1;
        const celulas = [];
        for (const mCel of mLinha[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
            const attrs = mCel[1];
            const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
            if (!ref) continue;
            const col = colunaParaIndice(ref);
            const tipo = (attrs.match(/\bt="([^"]+)"/) || [])[1];
            const corpo = mCel[2];
            let valor = '';
            if (tipo === 's') {
                const v = corpo.match(/<v>([\s\S]*?)<\/v>/);
                valor = v ? (strings[Number(v[1])] ?? '') : '';
            } else if (tipo === 'inlineStr') {
                valor = [...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodificarXml(t[1])).join('');
            } else {
                const v = corpo.match(/<v>([\s\S]*?)<\/v>/);
                valor = v ? decodificarXml(v[1]) : '';
            }
            celulas[col] = valor;
        }
        linhas[idx] = celulas;
    }
    for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = [];
    return linhas;
}

function lerXlsx(caminho) {
    const z = lerZip(caminho);
    const strings = lerSharedStrings(z['xl/sharedStrings.xml'] && z['xl/sharedStrings.xml'].toString('utf8'));
    const rels = {};
    const xmlRels = z['xl/_rels/workbook.xml.rels'].toString('utf8');
    for (const m of xmlRels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
        const id = (m[1].match(/\bId="([^"]*)"/) || [])[1];
        const alvo = (m[1].match(/\bTarget="([^"]*)"/) || [])[1];
        if (id && alvo) rels[id] = alvo;
    }
    const abas = {};
    const ordem = [];
    const xmlWb = z['xl/workbook.xml'].toString('utf8');
    for (const m of xmlWb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
        const nome = decodificarXml((m[1].match(/\bname="([^"]*)"/) || [])[1] || '');
        const rid  = (m[1].match(/r:id="([^"]*)"/) || [])[1];
        if (!nome || !rid || !rels[rid]) continue;
        let alvo = rels[rid];
        if (!alvo.startsWith('xl/')) alvo = 'xl/' + alvo.replace(/^\//, '');
        if (!z[alvo]) continue;
        abas[nome] = lerPlanilha(z[alvo].toString('utf8'), strings);
        ordem.push(nome);
    }
    return { abas, ordem };
}

module.exports = { lerXlsx };
```

- [ ] **Step 6: Rodar o teste e ver passar**

```bash
npm test
```

Esperado: 3 testes PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json tests/xlsx-min.js tests/xlsx-min.test.js
git commit -m "test: leitor minimo de xlsx para os testes do importador"
```

---

### Task 2: Normalizações de código, preço, largura e nome

**Files:**
- Create: `js/importador-core.js`
- Create: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizarCodigo(bruto)` → `{ codigo: string, promocional: boolean }`. Remove `*`, espaços e deixa em maiúsculas. `promocional` é `true` quando o bruto começava com `*`.
  - `normalizarPreco(bruto)` → `{ valor: number|null, ok: boolean, motivo: string|null }`. Aceita `78,90`, `78.90`, `R$ 78,90` e número. Arredonda para 2 casas, matando o ruído de ponto flutuante.
  - `normalizarLargura(bruto)` → `{ valor: number|null, aviso: string|null }`. Aviso quando o valor passa de 10.
  - `normalizarNome(bruto)` → `string` com espaços colapsados e pontas aparadas.
  - O módulo se expõe como `window.ImportadorCore` no navegador e `module.exports` no Node.

- [ ] **Step 1: Escrever os testes**

`tests/importador-core.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/importador-core.js');

test('normalizarCodigo remove o asterisco e marca promocional', () => {
    assert.deepStrictEqual(C.normalizarCodigo('*AC123'), { codigo: 'AC123', promocional: true });
    assert.deepStrictEqual(C.normalizarCodigo('AC123'), { codigo: 'AC123', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo('  ac 123 '), { codigo: 'AC123', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo(''), { codigo: '', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo(null), { codigo: '', promocional: false });
});

test('normalizarPreco aceita virgula, ponto e numero', () => {
    assert.deepStrictEqual(C.normalizarPreco('78,90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco('78.90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco('R$ 78,90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco(78.900000000000006), { valor: 78.9, ok: true, motivo: null });
});

test('normalizarPreco recusa traco, vazio e texto', () => {
    for (const bruto of ['--', '', '   ', null, undefined, 'sob consulta']) {
        const r = C.normalizarPreco(bruto);
        assert.strictEqual(r.ok, false, `deveria recusar ${JSON.stringify(bruto)}`);
        assert.strictEqual(r.valor, null);
        assert.ok(r.motivo && r.motivo.length > 0);
    }
});

test('normalizarLargura avisa quando passa de 10', () => {
    assert.deepStrictEqual(C.normalizarLargura('2,80'), { valor: 2.8, aviso: null });
    assert.deepStrictEqual(C.normalizarLargura(3), { valor: 3, aviso: null });
    const cm = C.normalizarLargura('280');
    assert.strictEqual(cm.valor, 280);
    assert.match(cm.aviso, /cent[ií]metro/i);
    assert.deepStrictEqual(C.normalizarLargura(''), { valor: null, aviso: null });
});

test('normalizarNome colapsa espacos', () => {
    assert.strictEqual(C.normalizarNome('  LINHO   BELGA  '), 'LINHO BELGA');
    assert.strictEqual(C.normalizarNome(null), '');
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `Cannot find module '../js/importador-core.js'`.

- [ ] **Step 3: Implementar**

`js/importador-core.js`:

```js
'use strict';
// Nucleo do importador de tabelas de fornecedor: so funcoes puras.
// Sem DOM, sem db, sem localStorage — para poder rodar em `node --test`.
(function (raiz) {

    function normalizarNome(bruto) {
        if (bruto === null || bruto === undefined) return '';
        return String(bruto).replace(/\s+/g, ' ').trim();
    }

    function normalizarCodigo(bruto) {
        if (bruto === null || bruto === undefined) return { codigo: '', promocional: false };
        const texto = String(bruto).trim();
        const promocional = texto.startsWith('*');
        const codigo = texto.replace(/\*/g, '').replace(/\s+/g, '').toUpperCase();
        return { codigo, promocional };
    }

    function normalizarPreco(bruto) {
        const recusa = motivo => ({ valor: null, ok: false, motivo });
        if (bruto === null || bruto === undefined) return recusa('Preço em branco');
        if (typeof bruto === 'number') {
            if (!isFinite(bruto)) return recusa('Preço não é um número');
            return { valor: Math.round(bruto * 100) / 100, ok: true, motivo: null };
        }
        const texto = String(bruto).trim();
        if (!texto) return recusa('Preço em branco');
        if (/^-+$/.test(texto)) return recusa('Preço "' + texto + '" — item sem preço na tabela');
        // tira R$, espacos e separador de milhar; vírgula vira ponto decimal
        const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
        const n = Number(limpo);
        if (!isFinite(n) || limpo === '') return recusa('Preço "' + texto + '" não é um número');
        return { valor: Math.round(n * 100) / 100, ok: true, motivo: null };
    }

    function normalizarLargura(bruto) {
        const p = normalizarPreco(bruto);
        if (!p.ok) return { valor: null, aviso: null };
        const aviso = p.valor > 10
            ? 'Largura ' + p.valor + ' parece estar em centímetros; confira se deveria ser em metros'
            : null;
        return { valor: p.valor, aviso };
    }

    const api = { normalizarNome, normalizarCodigo, normalizarPreco, normalizarLargura };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ImportadorCore = api;

})(typeof window !== 'undefined' ? window : null);
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): normalizacao de codigo, preco, largura e nome"
```

---

### Task 3: Detecção de cabeçalho e de linhas de produto

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: `normalizarNome` da Task 2.
- Produces:
  - `detectarCabecalho(linhas)` → `{ indice: number, colunas: string[] }`. `indice` é o índice 0-based da linha de cabeçalho, ou `-1` quando nenhuma linha tem cara de cabeçalho. `colunas` são os rótulos normalizados daquela linha.
  - `ehLinhaDeProduto(linha, mapa)` → `boolean`. Verdadeiro quando a linha tem código **e** nome, segundo os índices de `mapa`.

- [ ] **Step 1: Escrever os testes**

Acrescente ao fim de `tests/importador-core.test.js`:

```js
const path = require('node:path');
const { lerXlsx } = require('./xlsx-min.js');
const PLANILHA = path.join(__dirname, '..', 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

test('detectarCabecalho acha a linha 2 nas abas de tecido', () => {
    const { abas } = lerXlsx(PLANILHA);
    for (const aba of ['Book 10', 'Book 12', 'Book 13', 'Book 14', 'Book 15', 'Book 16']) {
        const r = C.detectarCabecalho(abas[aba]);
        assert.strictEqual(r.indice, 1, `${aba}: cabecalho deveria estar no indice 1`);
        assert.ok(r.colunas.some(c => /C[OÓ]DIGO/i.test(c)), `${aba}: faltou CODIGO`);
    }
});

test('detectarCabecalho devolve -1 quando nao ha cabecalho', () => {
    const r = C.detectarCabecalho([['', ''], ['algum texto solto'], ['']]);
    assert.strictEqual(r.indice, -1);
    assert.deepStrictEqual(r.colunas, []);
});

test('ehLinhaDeProduto exige codigo e nome', () => {
    const mapa = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };
    assert.strictEqual(C.ehLinhaDeProduto(['AC1', 'Linho', '', '2.8', '78,90'], mapa), true);
    assert.strictEqual(C.ehLinhaDeProduto(['AC1', '', '', '', ''], mapa), false);
    assert.strictEqual(C.ehLinhaDeProduto(['', 'Linho', '', '', '78,90'], mapa), false);
    assert.strictEqual(C.ehLinhaDeProduto([], mapa), false);
});

test('a observacao do MODELO WAVE PLUS nao passa por linha de produto', () => {
    const mapa = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };
    const obs = ['MODELO WAVE PLUS NAO ACOMPANHA A ENTRETELA'];
    assert.strictEqual(C.ehLinhaDeProduto(obs, mapa), false);
});

test('linha com preco invalido continua sendo linha de produto', () => {
    const mapa = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };
    assert.strictEqual(C.ehLinhaDeProduto(['AC1', 'Linho', '', '2.8', '--'], mapa), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.detectarCabecalho is not a function`.

- [ ] **Step 3: Implementar**

Em `js/importador-core.js`, antes da linha `const api = {`:

```js
    // Rotulos que indicam que a linha e um cabecalho de tabela.
    const ROTULOS_CABECALHO = [
        /C[OÓ]D/i, /DESCRI/i, /NOME/i, /LARGURA/i, /PRE[CÇ]O/i,
        /CORTE/i, /PE[CÇ]A/i, /UNID/i, /QUANT/i, /COR/i, /REF/i
    ];

    function _rotulosDaLinha(linha) {
        return (linha || []).map(c => normalizarNome(c));
    }

    function detectarCabecalho(linhas) {
        const limite = Math.min((linhas || []).length, 15);
        let melhor = { indice: -1, pontos: 0, colunas: [] };
        for (let i = 0; i < limite; i++) {
            const colunas = _rotulosDaLinha(linhas[i]);
            const preenchidas = colunas.filter(c => c !== '').length;
            if (preenchidas < 2) continue;
            const pontos = colunas.filter(c => c && ROTULOS_CABECALHO.some(r => r.test(c))).length;
            if (pontos >= 2 && pontos > melhor.pontos) melhor = { indice: i, pontos, colunas };
        }
        return melhor.indice === -1
            ? { indice: -1, colunas: [] }
            : { indice: melhor.indice, colunas: melhor.colunas };
    }

    function ehLinhaDeProduto(linha, mapa) {
        if (!linha || !mapa) return false;
        const codigo = mapa.codigo >= 0 ? normalizarCodigo(linha[mapa.codigo]).codigo : '';
        const nome = mapa.nome >= 0 ? normalizarNome(linha[mapa.nome]) : '';
        return codigo !== '' && nome !== '';
    }
```

E acrescente `detectarCabecalho, ehLinhaDeProduto` ao objeto `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): deteccao de cabecalho e de linhas de produto"
```

---

### Task 4: Sugestão de mapeamento de colunas e de tipo da aba

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: `detectarCabecalho` da Task 3.
- Produces:
  - `sugerirMapeamento(colunas)` → `{ codigo, nome, largura, preco, unidade }`, todos índices 0-based, `-1` quando não encontrado. Quando há `CORTE` e `PEÇA`, `preco` aponta para `CORTE` (preço do metro cortado é o padrão da spec).
  - `sugerirTipoAba(nomeAba, colunas)` → `'tecido' | 'material' | 'ignorar'`.

- [ ] **Step 1: Escrever os testes**

```js
test('sugerirMapeamento identifica as colunas do layout de tecido', () => {
    const colunas = ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE', 'PEÇA'];
    assert.deepStrictEqual(C.sugerirMapeamento(colunas), {
        codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1
    });
});

test('sugerirMapeamento prefere CORTE a PECA quando os dois existem', () => {
    const m = C.sugerirMapeamento(['CÓDIGO', 'DESCRIÇÃO', '', 'LARGURA', 'PEÇA', 'CORTE']);
    assert.strictEqual(m.preco, 5);
});

test('sugerirMapeamento cai para PRECO quando nao ha CORTE', () => {
    const m = C.sugerirMapeamento(['CÓD', 'DESCRIÇÃO', 'CORES', 'QUANT.', 'PREÇO']);
    assert.strictEqual(m.codigo, 0);
    assert.strictEqual(m.nome, 1);
    assert.strictEqual(m.preco, 4);
    assert.strictEqual(m.largura, -1);
});

test('sugerirMapeamento devolve -1 para o que nao achou', () => {
    const m = C.sugerirMapeamento(['A', 'B', 'C']);
    assert.deepStrictEqual(m, { codigo: -1, nome: -1, largura: -1, preco: -1, unidade: -1 });
});

test('sugerirTipoAba separa tecido, material e Capa', () => {
    assert.strictEqual(C.sugerirTipoAba('Book 10', ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE']), 'tecido');
    assert.strictEqual(C.sugerirTipoAba('Trilhos', ['CÓD', 'DESCRIÇÃO', 'CORES', 'PREÇO']), 'material');
    assert.strictEqual(C.sugerirTipoAba('Capa', []), 'ignorar');
});

test('todas as abas de tecido da planilha real sao sugeridas como tecido', () => {
    const { abas } = lerXlsx(PLANILHA);
    for (const aba of ['Book 10', 'Book 12', 'Book 13', 'Book 14', 'Book 15', 'Book 16']) {
        const { colunas } = C.detectarCabecalho(abas[aba]);
        assert.strictEqual(C.sugerirTipoAba(aba, colunas), 'tecido', aba);
    }
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.sugerirMapeamento is not a function`.

- [ ] **Step 3: Implementar**

```js
    function _acharColuna(colunas, padroes) {
        for (const padrao of padroes) {
            const i = colunas.findIndex(c => c && padrao.test(c));
            if (i !== -1) return i;
        }
        return -1;
    }

    function sugerirMapeamento(colunas) {
        const cols = (colunas || []).map(c => normalizarNome(c));
        return {
            codigo:  _acharColuna(cols, [/^C[OÓ]D/i, /REFER/i]),
            nome:    _acharColuna(cols, [/DESCRI/i, /^NOME/i, /PRODUTO/i]),
            largura: _acharColuna(cols, [/LARGURA/i]),
            // CORTE (preco do metro cortado) e o padrao definido na spec
            preco:   _acharColuna(cols, [/CORTE/i, /PRE[CÇ]O/i, /VALOR/i, /PE[CÇ]A/i]),
            unidade: _acharColuna(cols, [/UNID/i, /^UN$/i])
        };
    }

    function sugerirTipoAba(nomeAba, colunas) {
        const nome = normalizarNome(nomeAba).toUpperCase();
        if (nome === 'CAPA' || nome === '') return 'ignorar';
        const cols = (colunas || []).map(c => normalizarNome(c));
        if (cols.some(c => /LARGURA/i.test(c))) return 'tecido';
        return 'material';
    }
```

Acrescente `sugerirMapeamento, sugerirTipoAba` ao `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): sugestao automatica de mapeamento e de tipo de aba"
```

---

### Task 5: Montagem dos itens a partir das linhas

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: `normalizarCodigo`, `normalizarPreco`, `normalizarLargura`, `normalizarNome`, `ehLinhaDeProduto`.
- Produces: `montarItens({ linhas, cabecalhoIndice, mapa, tipo, aba })` → `item[]`, onde cada item é:

```js
{
    aba: 'Book 10',        // nome da aba de origem
    linha: 5,              // indice 0-based da linha original, para o usuario localizar
    codigo: 'AC123',       // normalizado, MAIUSCULO, sem *
    nome: 'Linho Belga',
    largura: 2.8,          // null quando nao ha coluna de largura
    preco_custo: 78.9,     // null quando o preco nao pode ser lido
    unidade: 'un',         // sempre 'm' para tecido, 'un' por padrao para material
    tipo: 'tecido',        // 'tecido' | 'material'
    promocional: false,
    avisos: [],            // strings; nao bloqueiam
    problema: null         // string; quando != null o item entra desmarcado
}
```

- [ ] **Step 1: Escrever os testes**

```js
const MAPA_TECIDO = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };

test('montarItens converte as linhas do Book 10 em itens', () => {
    const { abas } = lerXlsx(PLANILHA);
    const itens = C.montarItens({
        linhas: abas['Book 10'], cabecalhoIndice: 1, mapa: MAPA_TECIDO, tipo: 'tecido', aba: 'Book 10'
    });
    assert.ok(itens.length >= 30, `esperava 30+ itens, veio ${itens.length}`);
    assert.ok(itens.every(i => i.codigo), 'todo item precisa ter codigo');
    assert.ok(itens.every(i => i.nome), 'todo item precisa ter nome');
    assert.ok(itens.every(i => i.tipo === 'tecido'));
    assert.ok(itens.every(i => i.unidade === 'm'), 'tecido e sempre vendido por metro');
});

test('montarItens marca com problema as linhas de preco --', () => {
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['AC1', 'Com preco', '', '2,80', '78,90'],
            ['AC2', 'Sem preco', '', '2,80', '--']
        ],
        cabecalhoIndice: 0, mapa: MAPA_TECIDO, tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens.length, 2);
    assert.strictEqual(itens[0].problema, null);
    assert.strictEqual(itens[0].preco_custo, 78.9);
    assert.ok(itens[1].problema, 'o item sem preco precisa de um motivo escrito');
    assert.strictEqual(itens[1].preco_custo, null);
});

test('montarItens guarda o aviso de promocional e o de largura em cm', () => {
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['*AC9', 'Promo', '', '280', '50,00']
        ],
        cabecalhoIndice: 0, mapa: MAPA_TECIDO, tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens[0].codigo, 'AC9');
    assert.strictEqual(itens[0].promocional, true);
    assert.strictEqual(itens[0].avisos.length, 2);
    assert.ok(itens[0].avisos.some(a => /promo/i.test(a)));
    assert.ok(itens[0].avisos.some(a => /cent[ií]metro/i.test(a)));
});

test('montarItens ignora observacoes e linhas em branco', () => {
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['AC1', 'Real', '', '2,80', '10,00'],
            ['MODELO WAVE PLUS NAO ACOMPANHA A ENTRETELA'],
            [],
            ['', '', '', '', '']
        ],
        cabecalhoIndice: 0, mapa: MAPA_TECIDO, tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].codigo, 'AC1');
});

test('montarItens usa a coluna de unidade quando o tipo e material', () => {
    const itens = C.montarItens({
        linhas: [
            ['CÓD', 'DESCRIÇÃO', 'UNID.', 'PREÇO'],
            ['TR1', 'Trilho', 'm', '25,00'],
            ['TR2', 'Suporte', '', '3,00']
        ],
        cabecalhoIndice: 0,
        mapa: { codigo: 0, nome: 1, largura: -1, preco: 3, unidade: 2 },
        tipo: 'material', aba: 'Trilhos'
    });
    assert.strictEqual(itens[0].unidade, 'm');
    assert.strictEqual(itens[1].unidade, 'un');
    assert.strictEqual(itens[0].largura, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.montarItens is not a function`.

- [ ] **Step 3: Implementar**

```js
    const UNIDADES_VALIDAS = ['un', 'm', 'cm', 'kg', 'cj', 'cx', 'par'];

    function _normalizarUnidade(bruto, tipo) {
        if (tipo === 'tecido') return 'm';
        const u = normalizarNome(bruto).toLowerCase().replace(/\./g, '');
        return UNIDADES_VALIDAS.includes(u) ? u : 'un';
    }

    function montarItens(opcoes) {
        const linhas = opcoes.linhas || [];
        const mapa = opcoes.mapa;
        const tipo = opcoes.tipo;
        const aba = opcoes.aba || '';
        const inicio = (opcoes.cabecalhoIndice >= 0 ? opcoes.cabecalhoIndice : -1) + 1;
        const itens = [];

        for (let i = inicio; i < linhas.length; i++) {
            const linha = linhas[i];
            if (!ehLinhaDeProduto(linha, mapa)) continue;

            const cod = normalizarCodigo(linha[mapa.codigo]);
            const avisos = [];
            if (cod.promocional) avisos.push('Código veio marcado como promocional (com *) na tabela');

            let largura = null;
            if (mapa.largura >= 0) {
                const l = normalizarLargura(linha[mapa.largura]);
                largura = l.valor;
                if (l.aviso) avisos.push(l.aviso);
            }

            const p = mapa.preco >= 0
                ? normalizarPreco(linha[mapa.preco])
                : { valor: null, ok: false, motivo: 'A planilha não tem coluna de preço mapeada' };

            itens.push({
                aba,
                linha: i,
                codigo: cod.codigo,
                nome: normalizarNome(linha[mapa.nome]),
                largura,
                preco_custo: p.ok ? p.valor : null,
                unidade: _normalizarUnidade(mapa.unidade >= 0 ? linha[mapa.unidade] : '', tipo),
                tipo,
                promocional: cod.promocional,
                avisos,
                problema: p.ok ? null : p.motivo
            });
        }
        return itens;
    }
```

Acrescente `montarItens` ao `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): montagem dos itens a partir das linhas da planilha"
```

---

### Task 6: Regra de markup

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `markupDeExistente(registro)` → `number|null`. Percentual inteiro-ou-fracionário derivado de `preco` e `preco_custo` do registro salvo. `null` quando não dá para derivar (`preco_custo` ausente, zero ou `preco` ausente).
  - `aplicarMarkup(precoCusto, markupPercentual)` → `number` arredondado a 2 casas.

- [ ] **Step 1: Escrever os testes**

```js
test('markupDeExistente deriva o percentual do item salvo', () => {
    assert.strictEqual(C.markupDeExistente({ preco_custo: 100, preco: 180 }), 80);
    assert.strictEqual(C.markupDeExistente({ preco_custo: 50, preco: 50 }), 0);
});

test('markupDeExistente devolve null quando nao da para derivar', () => {
    assert.strictEqual(C.markupDeExistente({ preco_custo: 0, preco: 180 }), null);
    assert.strictEqual(C.markupDeExistente({ preco: 180 }), null);
    assert.strictEqual(C.markupDeExistente({ preco_custo: 100 }), null);
    assert.strictEqual(C.markupDeExistente({ preco_custo: 100, preco: 0 }), null);
    assert.strictEqual(C.markupDeExistente(null), null);
});

test('aplicarMarkup calcula a venda a partir do custo', () => {
    assert.strictEqual(C.aplicarMarkup(100, 80), 180);
    assert.strictEqual(C.aplicarMarkup(78.9, 0), 78.9);
    assert.strictEqual(C.aplicarMarkup(33.33, 50), 50);
});

test('custo novo preserva o markup do item existente', () => {
    const existente = { preco_custo: 100, preco: 180 };
    const markup = C.markupDeExistente(existente);
    assert.strictEqual(C.aplicarMarkup(120, markup), 216);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.markupDeExistente is not a function`.

- [ ] **Step 3: Implementar**

```js
    function markupDeExistente(registro) {
        if (!registro) return null;
        const custo = Number(registro.preco_custo);
        const venda = Number(registro.preco);
        if (!isFinite(custo) || custo <= 0) return null;
        if (!isFinite(venda) || venda <= 0) return null;
        return Math.round(((venda / custo) - 1) * 10000) / 100;
    }

    function aplicarMarkup(precoCusto, markupPercentual) {
        const custo = Number(precoCusto) || 0;
        const markup = Number(markupPercentual) || 0;
        return Math.round(custo * (1 + markup / 100) * 100) / 100;
    }
```

Acrescente `markupDeExistente, aplicarMarkup` ao `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS. Confira que `aplicarMarkup(33.33, 50)` dá exatamente `50` (arredondamento de `49.995`).

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): regra de markup preservado e markup de importacao"
```

---

### Task 7: Classificação dos itens contra o que já está salvo

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: `normalizarCodigo`, `normalizarNome`, `markupDeExistente`.
- Produces:
  - `indexarExistentes(catalogo, materiais)` → `{ porCodigo: Map<string, {registro, tipo}>, porNome: Map<string, {registro, tipo}> }`. Chaves já normalizadas (código em maiúsculas sem `*`; nome em minúsculas).
  - `classificar({ itens, catalogo, materiais, fornecedorId })` → objeto com sete arrays. Cada entrada é `{ item, existente, motivo }` (`existente` é `null` quando não há).

```js
{
    novos: [],            // codigo inedito
    atualizados: [],      // codigo existe, mesmo fornecedor, markup derivavel
    conflitos: [],        // codigo existe, outro fornecedor
    nomes_repetidos: [],  // codigo inedito mas o nome ja pertence a outro item do mesmo tipo
    sem_markup: [],       // codigo existe, mesmo fornecedor, markup nao derivavel
    problemas: [],        // item.problema != null
    sumiram: []           // registros do fornecedor ausentes da tabela; { item: null, existente, motivo }
}
```

Ordem de decisão, do mais forte ao mais fraco: `problemas` → `conflitos` → `sem_markup` → `atualizados` → `nomes_repetidos` → `novos`.

- [ ] **Step 1: Escrever os testes**

```js
function itemDeTeste(extra) {
    return Object.assign({
        aba: 'Teste', linha: 1, codigo: 'AC1', nome: 'Linho', largura: 2.8,
        preco_custo: 100, unidade: 'm', tipo: 'tecido', promocional: false,
        avisos: [], problema: null
    }, extra || {});
}

test('classificar separa novo de atualizado', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const r = C.classificar({
        itens: [itemDeTeste({ codigo: 'AC1' }), itemDeTeste({ codigo: 'AC2', nome: 'Voil' })],
        catalogo, materiais: [], fornecedorId: 7
    });
    assert.strictEqual(r.atualizados.length, 1);
    assert.strictEqual(r.atualizados[0].existente.id, 1);
    assert.strictEqual(r.novos.length, 1);
    assert.strictEqual(r.novos[0].item.codigo, 'AC2');
});

test('classificar marca conflito quando o codigo e de outro fornecedor', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 99 }];
    const r = C.classificar({ itens: [itemDeTeste()], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.conflitos.length, 1);
    assert.strictEqual(r.atualizados.length, 0);
    assert.match(r.conflitos[0].motivo, /fornecedor/i);
});

test('classificar acha conflito tambem entre tecido e material', () => {
    const materiais = [{ id: 5, referencia: 'AC1', nome: 'Trilho', preco_custo: 10, preco: 18, fornecedor_id: 99 }];
    const r = C.classificar({ itens: [itemDeTeste()], catalogo: [], materiais, fornecedorId: 7 });
    assert.strictEqual(r.conflitos.length, 1, 'codigo e unico somando catalogo e materiais');
});

test('classificar separa item existente sem markup derivavel', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 0, preco: 0, fornecedor_id: 7 }];
    const r = C.classificar({ itens: [itemDeTeste()], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.sem_markup.length, 1);
    assert.strictEqual(r.atualizados.length, 0);
});

test('classificar bloqueia nome repetido de outro item', () => {
    const catalogo = [{ id: 1, referencia: 'ZZ9', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const r = C.classificar({ itens: [itemDeTeste({ codigo: 'AC1', nome: 'linho' })], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.nomes_repetidos.length, 1);
    assert.strictEqual(r.novos.length, 0);
    assert.match(r.nomes_repetidos[0].motivo, /nome/i);
});

test('classificar poe o item com problema no grupo de problemas', () => {
    const r = C.classificar({
        itens: [itemDeTeste({ preco_custo: null, problema: 'Preço "--" — item sem preço na tabela' })],
        catalogo: [], materiais: [], fornecedorId: 7
    });
    assert.strictEqual(r.problemas.length, 1);
    assert.strictEqual(r.novos.length, 0);
});

test('classificar lista o que sumiu da tabela do mesmo fornecedor', () => {
    const catalogo = [
        { id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 },
        { id: 2, referencia: 'AC2', nome: 'Voil', preco_custo: 50, preco: 90, fornecedor_id: 7 },
        { id: 3, referencia: 'XX1', nome: 'De outro', preco_custo: 50, preco: 90, fornecedor_id: 99 }
    ];
    const r = C.classificar({ itens: [itemDeTeste({ codigo: 'AC1' })], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.sumiram.length, 1);
    assert.strictEqual(r.sumiram[0].existente.referencia, 'AC2');
});

test('classificar casa codigos ignorando o asterisco e a caixa', () => {
    const catalogo = [{ id: 1, referencia: 'ac1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const r = C.classificar({ itens: [itemDeTeste({ codigo: 'AC1' })], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.atualizados.length, 1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.classificar is not a function`.

- [ ] **Step 3: Implementar**

```js
    function indexarExistentes(catalogo, materiais) {
        const porCodigo = new Map();
        const porNome = new Map();
        const registrar = (lista, tipo) => {
            (lista || []).forEach(registro => {
                const cod = normalizarCodigo(registro.referencia).codigo;
                if (cod) porCodigo.set(cod, { registro, tipo });
                const nome = normalizarNome(registro.nome).toLowerCase();
                if (nome) porNome.set(tipo + '|' + nome, { registro, tipo });
            });
        };
        registrar(catalogo, 'tecido');
        registrar(materiais, 'material');
        return { porCodigo, porNome };
    }

    function classificar(opcoes) {
        const itens = opcoes.itens || [];
        const fornecedorId = opcoes.fornecedorId === undefined ? null : opcoes.fornecedorId;
        const { porCodigo, porNome } = indexarExistentes(opcoes.catalogo, opcoes.materiais);

        const r = { novos: [], atualizados: [], conflitos: [], nomes_repetidos: [], sem_markup: [], problemas: [], sumiram: [] };
        const vistos = new Set();

        itens.forEach(item => {
            if (item.problema) { r.problemas.push({ item, existente: null, motivo: item.problema }); return; }

            const achado = porCodigo.get(item.codigo);
            if (achado) {
                vistos.add(item.codigo);
                const existente = achado.registro;
                const mesmoFornecedor = String(existente.fornecedor_id || '') === String(fornecedorId || '');
                if (!mesmoFornecedor) {
                    r.conflitos.push({
                        item, existente,
                        motivo: 'O código ' + item.codigo + ' já pertence a "' + existente.nome + '" de outro fornecedor'
                    });
                    return;
                }
                if (markupDeExistente(existente) === null) {
                    r.sem_markup.push({ item, existente, motivo: 'Item sem markup registrado — defina o markup para calcular a venda' });
                    return;
                }
                r.atualizados.push({ item, existente, motivo: null });
                return;
            }

            const donoDoNome = porNome.get(item.tipo + '|' + item.nome.toLowerCase());
            if (donoDoNome) {
                r.nomes_repetidos.push({
                    item, existente: donoDoNome.registro,
                    motivo: 'O nome "' + item.nome + '" já é usado pelo código ' + (donoDoNome.registro.referencia || '(sem código)')
                });
                return;
            }

            r.novos.push({ item, existente: null, motivo: null });
        });

        porCodigo.forEach((achado, codigo) => {
            if (vistos.has(codigo)) return;
            if (String(achado.registro.fornecedor_id || '') !== String(fornecedorId || '')) return;
            r.sumiram.push({
                item: null, existente: achado.registro,
                motivo: 'Está cadastrado mas não veio nesta tabela — nada será alterado'
            });
        });

        return r;
    }
```

Acrescente `indexarExistentes, classificar` ao `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): classificacao dos itens contra catalogo e materiais"
```

---

### Task 8: Aplicação das decisões e guarda contra código duplicado

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: `aplicarMarkup`, `markupDeExistente`, `normalizarCodigo`.
- Produces: `aplicarImportacao({ decisoes, catalogo, materiais, fornecedor, agora })` → `{ catalogo, materiais, resumo }`.
  - `decisoes` é `[{ item, existente, markup, acao }]`, onde `acao` é `'criar'`, `'atualizar'` ou `'ignorar'`. O chamador monta essa lista a partir da tela de conferência.
  - `fornecedor` é `{ id, nome }` ou `null`.
  - `agora` é o número usado como `id` de novos registros (injetado para o teste ser determinístico).
  - Devolve **cópias novas** das listas; não muda as recebidas.
  - `resumo` é `{ criados, atualizados, ignorados }`.
- Produces: `validarDecisoes(decisoes, catalogo, materiais)` → `string[]` com os impedimentos encontrados, vazio quando pode gravar. É a guarda de "não pode haver código duplicado no sistema": pega código repetido **dentro do próprio lote** e nome que colide com um registro que não é o alvo daquela decisão.
- Produces: `resolverAcao(item, catalogo, materiais)` → `{ acao: 'criar'|'atualizar', existente: registro|null }`. Decide pelo código **no momento da gravação**, não pelo grupo da tela — assim, editar o código de um conflito na conferência muda o efeito de "substituir o existente" para "criar novo" sem precisar reclassificar tudo.

- [ ] **Step 1: Escrever os testes**

```js
test('aplicarImportacao cria tecido novo com o markup informado', () => {
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'AC2', nome: 'Voil', preco_custo: 100 }), existente: null, markup: 80, acao: 'criar' }],
        catalogo: [], materiais: [], fornecedor: { id: 7, nome: 'RC' }, agora: 1000
    });
    assert.strictEqual(r.catalogo.length, 1);
    const t = r.catalogo[0];
    assert.strictEqual(t.referencia, 'AC2');
    assert.strictEqual(t.preco_custo, 100);
    assert.strictEqual(t.preco, 180);
    assert.strictEqual(t.largura_rolo, 2.8);
    assert.strictEqual(t.fornecedor_id, 7);
    assert.strictEqual(t.fornecedor_nome, 'RC');
    assert.strictEqual(t.min_estoque, 0);
    assert.strictEqual(t.id, 1000);
    assert.deepStrictEqual(r.resumo, { criados: 1, atualizados: 0, ignorados: 0 });
});

test('aplicarImportacao cria material novo com unidade e estoque zerado', () => {
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'TR1', nome: 'Trilho', tipo: 'material', unidade: 'm', preco_custo: 20, largura: null }), existente: null, markup: 50, acao: 'criar' }],
        catalogo: [], materiais: [], fornecedor: { id: 7, nome: 'RC' }, agora: 2000
    });
    assert.strictEqual(r.materiais.length, 1);
    assert.strictEqual(r.catalogo.length, 0);
    const m = r.materiais[0];
    assert.strictEqual(m.unidade, 'm');
    assert.strictEqual(m.preco, 30);
    assert.strictEqual(m.estoque_atual, 0);
});

test('aplicarImportacao atualiza custo e recalcula venda preservando o markup', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 100, preco: 180, largura_rolo: 2.8, min_estoque: 5, fornecedor_id: 7, fornecedor_nome: 'RC', imagem: 'foto' }];
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'AC1', preco_custo: 120 }), existente: catalogo[0], markup: 80, acao: 'atualizar' }],
        catalogo, materiais: [], fornecedor: { id: 7, nome: 'RC' }, agora: 3000
    });
    const t = r.catalogo[0];
    assert.strictEqual(t.id, 1, 'atualizar nao troca o id');
    assert.strictEqual(t.preco_custo, 120);
    assert.strictEqual(t.preco, 216);
    assert.strictEqual(t.min_estoque, 5, 'estoque minimo nao e tocado');
    assert.strictEqual(t.imagem, 'foto', 'a foto nao e apagada');
    assert.deepStrictEqual(r.resumo, { criados: 0, atualizados: 1, ignorados: 0 });
});

test('aplicarImportacao nao mexe nas listas originais', () => {
    const catalogo = [];
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'AC2' }), existente: null, markup: 80, acao: 'criar' }],
        catalogo, materiais: [], fornecedor: null, agora: 4000
    });
    assert.strictEqual(catalogo.length, 0, 'a lista recebida continua intacta');
    assert.strictEqual(r.catalogo.length, 1);
});

test('aplicarImportacao respeita acao ignorar', () => {
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'AC9' }), existente: null, markup: 80, acao: 'ignorar' }],
        catalogo: [], materiais: [], fornecedor: null, agora: 5000
    });
    assert.strictEqual(r.catalogo.length, 0);
    assert.deepStrictEqual(r.resumo, { criados: 0, atualizados: 0, ignorados: 1 });
});

test('aplicarImportacao da ids diferentes para itens criados no mesmo lote', () => {
    const r = C.aplicarImportacao({
        decisoes: [
            { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
            { item: itemDeTeste({ codigo: 'A2', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
        ],
        catalogo: [], materiais: [], fornecedor: null, agora: 6000
    });
    assert.notStrictEqual(r.catalogo[0].id, r.catalogo[1].id);
});

test('resolverAcao vira atualizar quando o codigo bate com um registro existente', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 99 }];
    const r = C.resolverAcao(itemDeTeste({ codigo: 'AC1' }), catalogo, []);
    assert.strictEqual(r.acao, 'atualizar');
    assert.strictEqual(r.existente.id, 1);
});

test('resolverAcao vira criar quando o usuario editou o codigo para um livre', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 99 }];
    const r = C.resolverAcao(itemDeTeste({ codigo: 'AC1-NOVO' }), catalogo, []);
    assert.strictEqual(r.acao, 'criar');
    assert.strictEqual(r.existente, null);
});

test('validarDecisoes aceita um lote limpo', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'A2', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
    ];
    assert.deepStrictEqual(C.validarDecisoes(decisoes, [], []), []);
});

test('validarDecisoes pega codigo repetido dentro do proprio lote', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'A1', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
    ];
    const erros = C.validarDecisoes(decisoes, [], []);
    assert.strictEqual(erros.length, 1);
    assert.match(erros[0], /A1/);
});

test('validarDecisoes pega nome que colide com outro registro', () => {
    const catalogo = [{ id: 1, referencia: 'ZZ9', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const decisoes = [{ item: itemDeTeste({ codigo: 'A1', nome: 'Linho' }), existente: null, markup: 0, acao: 'criar' }];
    const erros = C.validarDecisoes(decisoes, catalogo, []);
    assert.strictEqual(erros.length, 1);
    assert.match(erros[0], /Linho/);
});

test('validarDecisoes deixa passar o nome do proprio item que esta sendo atualizado', () => {
    const catalogo = [{ id: 1, referencia: 'A1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const decisoes = [{ item: itemDeTeste({ codigo: 'A1', nome: 'Linho' }), existente: catalogo[0], markup: 0, acao: 'atualizar' }];
    assert.deepStrictEqual(C.validarDecisoes(decisoes, catalogo, []), []);
});

test('validarDecisoes ignora as decisoes marcadas como ignorar', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'A1', nome: 'Dois' }), existente: null, markup: 0, acao: 'ignorar' }
    ];
    assert.deepStrictEqual(C.validarDecisoes(decisoes, [], []), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.aplicarImportacao is not a function`.

- [ ] **Step 3: Implementar**

```js
    const LARGURA_PADRAO = 2.80;

    function aplicarImportacao(opcoes) {
        const catalogo = (opcoes.catalogo || []).map(r => Object.assign({}, r));
        const materiais = (opcoes.materiais || []).map(r => Object.assign({}, r));
        const fornecedor = opcoes.fornecedor || null;
        let proximoId = Number(opcoes.agora) || Date.now();
        const resumo = { criados: 0, atualizados: 0, ignorados: 0 };

        (opcoes.decisoes || []).forEach(decisao => {
            const item = decisao.item;
            if (!item || decisao.acao === 'ignorar') { resumo.ignorados++; return; }

            const precoCusto = Number(item.preco_custo) || 0;
            const preco = aplicarMarkup(precoCusto, decisao.markup);
            const lista = item.tipo === 'tecido' ? catalogo : materiais;

            if (decisao.acao === 'atualizar' && decisao.existente) {
                const alvo = lista.find(r => r.id === decisao.existente.id);
                if (!alvo) return;
                alvo.referencia = item.codigo;
                alvo.nome = item.nome;
                alvo.preco_custo = precoCusto;
                alvo.preco = preco;
                if (item.tipo === 'tecido') {
                    if (item.largura !== null) alvo.largura_rolo = item.largura;
                } else {
                    alvo.unidade = item.unidade;
                }
                if (fornecedor) { alvo.fornecedor_id = fornecedor.id; alvo.fornecedor_nome = fornecedor.nome; }
                resumo.atualizados++;
                return;
            }

            const base = {
                id: proximoId++,
                referencia: item.codigo,
                nome: item.nome,
                preco_custo: precoCusto,
                preco,
                min_estoque: 0,
                fornecedor_id: fornecedor ? fornecedor.id : null,
                fornecedor_nome: fornecedor ? fornecedor.nome : ''
            };
            if (item.tipo === 'tecido') {
                catalogo.push(Object.assign(base, {
                    largura_rolo: item.largura === null ? LARGURA_PADRAO : item.largura,
                    imagem: ''
                }));
            } else {
                materiais.push(Object.assign(base, { unidade: item.unidade, estoque_atual: 0 }));
            }
            resumo.criados++;
        });

        return { catalogo, materiais, resumo };
    }

    // Decide pelo codigo atual do item, nao pelo grupo em que ele caiu na tela.
    // E o que faz "substituir o existente" e "editei o codigo, agora e outro
    // produto" funcionarem sem reclassificar a conferencia inteira.
    function resolverAcao(item, catalogo, materiais) {
        const { porCodigo } = indexarExistentes(catalogo, materiais);
        const achado = porCodigo.get(item.codigo);
        return achado
            ? { acao: 'atualizar', existente: achado.registro }
            : { acao: 'criar', existente: null };
    }

    // Guarda da regra "nao pode haver codigo duplicado no sistema".
    function validarDecisoes(decisoes, catalogo, materiais) {
        const { porNome } = indexarExistentes(catalogo, materiais);
        const erros = [];
        const codigosDoLote = new Map();

        (decisoes || []).forEach(d => {
            if (!d.item || d.acao === 'ignorar') return;
            const item = d.item;

            if (codigosDoLote.has(item.codigo)) {
                erros.push('O código ' + item.codigo + ' aparece duas vezes nesta importação ("'
                    + codigosDoLote.get(item.codigo) + '" e "' + item.nome + '"). Edite um dos dois.');
            } else {
                codigosDoLote.set(item.codigo, item.nome);
            }

            const dono = porNome.get(item.tipo + '|' + item.nome.toLowerCase());
            const ehOProprio = dono && d.existente && dono.registro.id === d.existente.id;
            if (dono && !ehOProprio) {
                erros.push('O nome "' + item.nome + '" já pertence ao código '
                    + (dono.registro.referencia || '(sem código)') + '. Edite o nome.');
            }
        });

        return erros;
    }
```

Acrescente `aplicarImportacao, resolverAcao, validarDecisoes` ao `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): aplicacao das decisoes no catalogo e nos materiais"
```

---

### Task 9: Perfis de importação por fornecedor

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`
- Modify: `js/app.js` (bootstrap de `db` e `syncDB`)

**Interfaces:**
- Consumes: nada do core.
- Produces:
  - `montarPerfil({ id, nome, fornecedorId, abas, layouts, cores, markupPadrao })` → perfil normalizado.
  - `perfilDoFornecedor(perfis, fornecedorId)` → perfil ou `null`.
  - `db.import_perfis` passa a existir, persistido na chave `sc_imp_perfis`.

Formato do perfil:

```js
{
    id: 1727000000000,
    nome: 'RC Tecidos — tabela mensal',
    fornecedor_id: 7,
    abas: { 'Book 10': 'tecido', 'Trilhos': 'material', 'Capa': 'ignorar' },
    layouts: [ { assinatura: 'CODIGO|DESCRIÇÃO||LARGURA|CORTE|PEÇA', mapa: { codigo:0, nome:1, largura:3, preco:4, unidade:-1 }, cabecalhoIndice: 1 } ],
    cores: { 'Cor Metal': [2, 3, 4] },
    markup_padrao: 80
}
```

`assinatura` é a linha de cabeçalho juntada por `|` — é o que permite reaproveitar um mapeamento entre as 7 abas de tecido, que têm o mesmo layout.

- [ ] **Step 1: Escrever os testes**

```js
test('montarPerfil normaliza os campos e preenche os defaults', () => {
    const p = C.montarPerfil({ id: 1, nome: '  RC  ', fornecedorId: 7 });
    assert.strictEqual(p.id, 1);
    assert.strictEqual(p.nome, 'RC');
    assert.strictEqual(p.fornecedor_id, 7);
    assert.deepStrictEqual(p.abas, {});
    assert.deepStrictEqual(p.layouts, []);
    assert.deepStrictEqual(p.cores, {});
    assert.strictEqual(p.markup_padrao, 0);
});

test('perfilDoFornecedor acha pelo id do fornecedor', () => {
    const perfis = [
        C.montarPerfil({ id: 1, nome: 'A', fornecedorId: 7 }),
        C.montarPerfil({ id: 2, nome: 'B', fornecedorId: 9 })
    ];
    assert.strictEqual(C.perfilDoFornecedor(perfis, 9).id, 2);
    assert.strictEqual(C.perfilDoFornecedor(perfis, '7').id, 1, 'compara sem se importar com o tipo');
    assert.strictEqual(C.perfilDoFornecedor(perfis, 123), null);
    assert.strictEqual(C.perfilDoFornecedor(null, 7), null);
});

test('assinaturaDoLayout junta os rotulos do cabecalho', () => {
    assert.strictEqual(
        C.assinaturaDoLayout(['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE', 'PEÇA']),
        'CODIGO|DESCRIÇÃO||LARGURA|CORTE|PEÇA'
    );
});

test('as 7 abas de tecido da planilha real compartilham uma assinatura', () => {
    const { abas } = lerXlsx(PLANILHA);
    const assinaturas = new Set();
    for (const aba of ['Book 10', 'Book 12', 'Book 13', 'Book 14', 'Book 15', 'Book 16']) {
        assinaturas.add(C.assinaturaDoLayout(C.detectarCabecalho(abas[aba]).colunas));
    }
    assert.strictEqual(assinaturas.size, 1, 'um mapeamento so deveria servir para todas');
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.montarPerfil is not a function`.

- [ ] **Step 3: Implementar no core**

```js
    function assinaturaDoLayout(colunas) {
        return (colunas || []).map(c => normalizarNome(c)).join('|');
    }

    function montarPerfil(opcoes) {
        const o = opcoes || {};
        return {
            id: o.id || Date.now(),
            nome: normalizarNome(o.nome),
            fornecedor_id: o.fornecedorId === undefined ? null : o.fornecedorId,
            abas: o.abas || {},
            layouts: o.layouts || [],
            cores: o.cores || {},
            markup_padrao: Number(o.markupPadrao) || 0
        };
    }

    function perfilDoFornecedor(perfis, fornecedorId) {
        if (!perfis || fornecedorId === null || fornecedorId === undefined) return null;
        const alvo = String(fornecedorId);
        return perfis.find(p => String(p.fornecedor_id) === alvo) || null;
    }
```

Acrescente `assinaturaDoLayout, montarPerfil, perfilDoFornecedor` ao `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Registrar `import_perfis` no db**

Em `js/app.js`, no literal de `db` (por volta da linha 190), acrescente a última entrada depois de `usuarios`:

```js
    usuarios:        JSON.parse(localStorage.getItem('sc_usr'))  || [],
    import_perfis:   JSON.parse(localStorage.getItem('sc_imp_perfis')) || []
```

E em `syncDB()` (por volta da linha 220), junto das outras chaves:

```js
    localStorage.setItem('sc_imp_perfis', JSON.stringify(db.import_perfis));
```

- [ ] **Step 6: Conferir que nada quebrou**

```bash
npm test
node --check js/app.js
```

Esperado: testes PASS e `node --check` sem saída.

- [ ] **Step 7: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js js/app.js
git commit -m "feat(importador): perfis de importacao por fornecedor"
```

---

### Task 10: Leitura do arquivo no navegador

**Files:**
- Create: `js/importador-ui.js`
- Modify: `catalogo.html`

**Interfaces:**
- Consumes: `window.ImportadorCore` (todo o core).
- Produces:
  - `_impGarantirSheetJs()` → `Promise<void>`; deixa `window.XLSX` pronto.
  - `_impLerArquivo(file)` → `Promise<{ ordem: string[], abas: { [nome]: string[][] } }>`; mesmo formato que `lerXlsx` dos testes, para `.xlsx`, `.xls` e `.csv`. Lança `Error` com mensagem em português se o formato não for suportado.
  - `window.abrirImportadorTabela()` — por ora só lê o arquivo e mostra um toast com a contagem de abas; as telas entram nas tasks seguintes.

- [ ] **Step 1: Criar o esqueleto do módulo de interface**

`js/importador-ui.js`:

```js
'use strict';
// Assistente de importacao de tabelas de fornecedor.
// A logica pura vive em js/importador-core.js (window.ImportadorCore).

const CDN_SHEETJS = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

let _impSheetJsPronto = null;

// O app.js nao tem helper de moeda compartilhado — ele repete toLocaleString
// em cada tela. Este modulo define o seu.
function _impMoeda(v) {
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function _impGarantirSheetJs() {
    if (window.XLSX) return;
    if (!_impSheetJsPronto) {
        _impSheetJsPronto = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = CDN_SHEETJS;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Não foi possível carregar o leitor de planilhas — verifique sua conexão.'));
            document.head.appendChild(s);
        });
    }
    await _impSheetJsPronto;
}

// Converte a planilha em { ordem, abas }, o mesmo formato consumido pelo core.
async function _impLerArquivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        throw new Error('Formato não suportado nesta etapa: .' + ext);
    }
    await _impGarantirSheetJs();
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array' });
    const abas = {};
    wb.SheetNames.forEach(nome => {
        // header:1 devolve array de arrays; defval:'' evita buracos no meio da linha
        abas[nome] = window.XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', raw: false, blankrows: true });
    });
    return { ordem: wb.SheetNames.slice(), abas };
}

async function abrirImportadorTabela() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
            const planilha = await _impLerArquivo(file);
            toast(`Planilha lida: ${planilha.ordem.length} aba(s).`, 'success');
        } catch (e) {
            await showAlert(e.message, '⚠️');
        }
    };
    input.click();
}
```

- [ ] **Step 2: Carregar os scripts e pôr o botão em catalogo.html**

Em `catalogo.html`, troque a linha final `<script src="js/app.js"></script>` por:

```html
    <script src="js/app.js"></script>
    <script src="js/importador-core.js"></script>
    <script src="js/importador-ui.js"></script>
```

E troque o cabeçalho da página:

```html
        <div class="header"><h2>Cadastro — Catálogo e Preços</h2></div>
```

por:

```html
        <div class="header">
            <h2>Cadastro — Catálogo e Preços</h2>
            <button class="btn btn-outline" onclick="abrirImportadorTabela()">📥 Importar tabela</button>
        </div>
```

- [ ] **Step 3: Verificar a sintaxe**

```bash
node --check js/importador-ui.js
npm test
```

Esperado: sem saída do `node --check` e testes PASS (o core não mudou).

- [ ] **Step 4: Conferir no navegador**

Abra `catalogo.html`, clique em "📥 Importar tabela", escolha `docs/Tabela RC - SETEMBRO - 2024.xlsx`.
Esperado: toast "Planilha lida: 22 aba(s)."

- [ ] **Step 5: Commit**

```bash
git add js/importador-ui.js catalogo.html
git commit -m "feat(importador): leitura de xlsx/csv no navegador e botao no catalogo"
```

---

### Task 11: Assistente — passo 1 (arquivo e fornecedor) e passo 2 (abas e tipo)

**Files:**
- Modify: `js/importador-ui.js`

**Interfaces:**
- Consumes: `_impLerArquivo`, `ImportadorCore.detectarCabecalho`, `ImportadorCore.sugerirTipoAba`, `ImportadorCore.perfilDoFornecedor`, `db.fornecedores`.
- Produces:
  - `_impEstado` — objeto de módulo com `{ file, planilha, fornecedor, markupPadrao, abas, layouts, cores, grupos, passo }`.
  - `abrirImportadorTabela()`, `_impFechar()`, `_impRenderPasso(n)`, `_impResetar()` — abertura e navegação do assistente.
  - `_impTrocarTipoAba(indiceAba, tipo)` — muda o tipo de uma aba pelo índice.
  - `_impCriarFornecedorInline()` — cria fornecedor em `db.fornecedores` sem sair do modal e **sem recarregar a página** (chama `syncDB()`, não `salvarERecarregar()`, senão o assistente fecharia).

- [ ] **Step 1: Substituir `abrirImportadorTabela` pelo assistente**

Em `js/importador-ui.js`, troque a função `abrirImportadorTabela` pelo bloco abaixo:

```js
const _impEstado = {
    file: null,
    planilha: null,      // { ordem, abas }
    fornecedor: null,    // { id, nome }
    markupPadrao: 80,
    abas: {},            // { [nomeAba]: 'tecido' | 'material' | 'ignorar' }
    layouts: {},         // { [assinatura]: { mapa, cabecalhoIndice } }
    cores: {},           // { [assinatura]: [indices de coluna que sao cor] }
    grupos: null,        // saida de ImportadorCore.classificar
    passo: 1
};

function _impResetar() {
    _impEstado.file = null;
    _impEstado.planilha = null;
    _impEstado.fornecedor = null;
    _impEstado.markupPadrao = 80;
    _impEstado.abas = {};
    _impEstado.layouts = {};
    _impEstado.cores = {};
    _impEstado.grupos = null;
    _impEstado.passo = 1;
}

function abrirImportadorTabela() {
    _impResetar();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'imp-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:980px">
        <div class="modal-header">
            <h3>Importar tabela de fornecedor</h3>
            <button class="modal-close" onclick="_impFechar()">×</button>
        </div>
        <div class="modal-body" id="imp-corpo"></div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) _impFechar(); });
    document.body.appendChild(overlay);
    _impRenderPasso(1);
}

function _impFechar() {
    const o = document.getElementById('imp-overlay');
    if (o) o.remove();
}

function _impTrilha(atual) {
    const passos = ['Arquivo', 'Abas', 'Colunas', 'Conferência'];
    return `<div style="display:flex;gap:8px;margin-bottom:18px;font-size:12px">` + passos.map((p, i) => {
        const n = i + 1;
        const ativo = n === atual;
        const feito = n < atual;
        const cor = ativo ? 'var(--primary)' : (feito ? 'var(--dark)' : 'var(--muted)');
        const peso = ativo ? '700' : '500';
        return `<span style="color:${cor};font-weight:${peso}">${n}. ${p}</span>`;
    }).join('<span style="color:var(--muted)">›</span>') + `</div>`;
}

function _impRenderPasso(n) {
    _impEstado.passo = n;
    const corpo = document.getElementById('imp-corpo');
    if (!corpo) return;
    if (n === 1) corpo.innerHTML = _impTrilha(1) + _impPasso1HTML();
    if (n === 2) corpo.innerHTML = _impTrilha(2) + _impPasso2HTML();
}

// ── Passo 1: arquivo e fornecedor ────────────────────────────────────────────
function _impPasso1HTML() {
    const opcoes = (db.fornecedores || [])
        .map(f => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join('');
    const nomeArquivo = _impEstado.file ? escapeHtml(_impEstado.file.name) : '';
    return `
    <div class="form-group">
        <label>Arquivo da tabela</label>
        <input type="file" id="imp-file" accept=".xlsx,.xls,.csv" onchange="_impArquivoEscolhido(this)">
        ${nomeArquivo ? `<p style="font-size:12px;color:var(--muted);margin-top:6px">Lido: ${nomeArquivo} — ${_impEstado.planilha.ordem.length} aba(s)</p>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">
        <div class="form-group">
            <label>Fornecedor desta tabela</label>
            <select id="imp-fornecedor">
                <option value="">— Selecione —</option>
                ${opcoes}
            </select>
            <div style="display:flex;gap:8px;margin-top:8px">
                <input type="text" id="imp-novo-fornecedor" placeholder="Nome do novo fornecedor" style="flex:1;font-size:13px">
                <button class="btn btn-outline btn-sm" onclick="_impCriarFornecedorInline()" style="white-space:nowrap">+ Cadastrar</button>
            </div>
        </div>
        <div class="form-group">
            <label>Markup dos itens novos (%)</label>
            <input type="number" id="imp-markup" value="${_impEstado.markupPadrao}" min="0" step="1">
            <small style="font-size:11px;color:var(--muted)">Itens que já existem mantêm o markup deles.</small>
        </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
        <button class="btn btn-outline" onclick="_impFechar()">Cancelar</button>
        <button class="btn btn-success" onclick="_impConcluirPasso1()">Continuar</button>
    </div>`;
}

async function _impArquivoEscolhido(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
        _impEstado.file = file;
        _impEstado.planilha = await _impLerArquivo(file);
        _impSugerirAbas();
        _impRenderPasso(1);
    } catch (e) {
        _impEstado.file = null;
        _impEstado.planilha = null;
        await showAlert(e.message, '⚠️');
    }
}

function _impSugerirAbas() {
    const C = window.ImportadorCore;
    _impEstado.abas = {};
    _impEstado.planilha.ordem.forEach(nome => {
        const { colunas } = C.detectarCabecalho(_impEstado.planilha.abas[nome]);
        _impEstado.abas[nome] = C.sugerirTipoAba(nome, colunas);
    });
}

async function _impCriarFornecedorInline() {
    const campo = document.getElementById('imp-novo-fornecedor');
    const limpo = (campo?.value || '').trim();
    if (!limpo) { await showAlert('Escreva o nome do novo fornecedor.', '⚠️'); return; }
    if ((db.fornecedores || []).some(f => f.nome.trim().toLowerCase() === limpo.toLowerCase())) {
        await showAlert('Já existe um fornecedor com esse nome.', '⚠️');
        return;
    }
    const novo = { id: Date.now(), nome: limpo, cnpj: '', nome_fantasia: '', end: '', num: '', cidade: '', estado: '', tel: '', email: '', ie: '', obs: '' };
    db.fornecedores.push(novo);
    syncDB();
    _impEstado.fornecedor = { id: novo.id, nome: novo.nome };
    _impRenderPasso(1);
    const sel = document.getElementById('imp-fornecedor');
    if (sel) sel.value = String(novo.id);
    toast('Fornecedor cadastrado.', 'success');
}

async function _impConcluirPasso1() {
    const C = window.ImportadorCore;
    if (!_impEstado.planilha) { await showAlert('Escolha o arquivo da tabela.', '⚠️'); return; }
    const id = parseInt(document.getElementById('imp-fornecedor').value, 10);
    if (!id) { await showAlert('Escolha o fornecedor desta tabela.', '⚠️'); return; }
    const f = db.fornecedores.find(x => x.id === id);
    _impEstado.fornecedor = { id: f.id, nome: f.nome };
    _impEstado.markupPadrao = parseFloat(document.getElementById('imp-markup').value) || 0;

    const perfil = C.perfilDoFornecedor(db.import_perfis, id);
    if (perfil) {
        Object.keys(perfil.abas || {}).forEach(aba => {
            if (_impEstado.abas[aba] !== undefined) _impEstado.abas[aba] = perfil.abas[aba];
        });
        (perfil.layouts || []).forEach(l => { _impEstado.layouts[l.assinatura] = { mapa: l.mapa, cabecalhoIndice: l.cabecalhoIndice }; });
        if (perfil.markup_padrao) _impEstado.markupPadrao = perfil.markup_padrao;
        (perfil.cores && Object.keys(perfil.cores).forEach(a => { _impEstado.cores[a] = perfil.cores[a]; }));
        toast(`Perfil "${perfil.nome}" aplicado.`, 'info');
        // Perfil cobre abas e mapeamento: o usuario pode ir direto conferir.
        const pular = await showConfirm(
            `Há um perfil salvo para ${_impEstado.fornecedor.nome}. Ir direto para a conferência?`,
            '⚡', 'Ir para a conferência', 'Revisar os passos');
        if (pular && _impPerfilCobreTudo()) { _impRenderPasso(4); return; }
    }
    _impRenderPasso(2);
}

// So pula se o perfil tiver mapeamento para todo layout que sera usado.
function _impPerfilCobreTudo() {
    if (typeof _impLayoutsDistintos !== 'function') return false; // so existe a partir da Task 12
    return _impLayoutsDistintos().every(l => !!_impEstado.layouts[l.assinatura]);
}

// ── Passo 2: abas e tipo ─────────────────────────────────────────────────────
function _impPasso2HTML() {
    const C = window.ImportadorCore;
    const linhas = _impEstado.planilha.ordem.map((nome, ai) => {
        const dados = _impEstado.planilha.abas[nome];
        const { indice, colunas } = C.detectarCabecalho(dados);
        const tipo = _impEstado.abas[nome];
        const mapa = C.sugerirMapeamento(colunas);
        const qtd = indice === -1 ? 0 : C.montarItens({ linhas: dados, cabecalhoIndice: indice, mapa, tipo: tipo === 'ignorar' ? 'material' : tipo, aba: nome }).length;
        const sel = t => tipo === t ? 'selected' : '';
        return `<tr>
            <td>${escapeHtml(nome)}</td>
            <td style="color:var(--muted)">${indice === -1 ? 'cabeçalho não encontrado' : 'linha ' + (indice + 1)}</td>
            <td>${qtd}</td>
            <td>
                <select onchange="_impTrocarTipoAba(${ai}, this.value)">
                    <option value="tecido" ${sel('tecido')}>Tecido</option>
                    <option value="material" ${sel('material')}>Material</option>
                    <option value="ignorar" ${sel('ignorar')}>Ignorar</option>
                </select>
            </td>
        </tr>`;
    }).join('');
    return `
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">Escolha o que fazer com cada aba da planilha. A contagem é de linhas que parecem produto.</p>
    <div style="max-height:380px;overflow:auto">
        <table><thead><tr><th>Aba</th><th>Cabeçalho</th><th>Itens</th><th>Tipo</th></tr></thead><tbody>${linhas}</tbody></table>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:18px">
        <button class="btn btn-outline" onclick="_impRenderPasso(1)">Voltar</button>
        <button class="btn btn-success" onclick="_impConcluirPasso2()">Continuar</button>
    </div>`;
}

// Indice em vez do nome da aba: nome de aba pode ter aspas e quebraria o onchange.
function _impTrocarTipoAba(indiceAba, tipo) {
    const nome = _impEstado.planilha.ordem[indiceAba];
    _impEstado.abas[nome] = tipo;
}

async function _impConcluirPasso2() {
    const usadas = Object.values(_impEstado.abas).filter(t => t !== 'ignorar');
    if (usadas.length === 0) { await showAlert('Marque ao menos uma aba como Tecido ou Material.', '⚠️'); return; }
    _impRenderPasso(3);
}
```

- [ ] **Step 2: Verificar a sintaxe**

```bash
node --check js/importador-ui.js
```

Esperado: sem saída.

- [ ] **Step 3: Conferir no navegador**

Abra `catalogo.html` → "📥 Importar tabela" → escolha a planilha → selecione um fornecedor → Continuar.
Esperado: passo 2 lista 22 abas, `Capa` vem como "Ignorar", os 7 Books vêm como "Tecido", as demais como "Material", e a contagem de itens de Book 10 fica em torno de 38. Clicar em "Continuar" no passo 2 não faz nada visível ainda — `_impRenderPasso(3)` não tem ramo correspondente até a Task 12, então a tela fica parada sem erro no console. É o esperado nesta task.

- [ ] **Step 4: Commit**

```bash
git add js/importador-ui.js
git commit -m "feat(importador): passos 1 e 2 do assistente (arquivo, fornecedor, abas)"
```

---

### Task 12: Assistente — passo 3 (mapeamento de colunas por layout)

**Files:**
- Modify: `js/importador-ui.js`

**Interfaces:**
- Consumes: `ImportadorCore.detectarCabecalho`, `sugerirMapeamento`, `assinaturaDoLayout`, `montarItens`.
- Produces:
  - `_impLayoutsDistintos()` → `[{ assinatura, colunas, cabecalhoIndice, abas: string[], tipo }]` — um por layout, agrupando as abas que compartilham a mesma assinatura de cabeçalho.
  - `_impPasso3HTML()`, `_impConcluirPasso3()`.
  - Depois do passo 3, `_impEstado.layouts[assinatura] = { mapa, cabecalhoIndice }` está preenchido para todo layout em uso.

- [ ] **Step 1: Implementar o passo 3**

Acrescente em `js/importador-ui.js`, e inclua `if (n === 3) corpo.innerHTML = _impTrilha(3) + _impPasso3HTML();` dentro de `_impRenderPasso`:

```js
// ── Passo 3: mapeamento de colunas ───────────────────────────────────────────
const _IMP_PAPEIS = [
    { valor: 'ignorar', rotulo: 'Ignorar' },
    { valor: 'codigo',  rotulo: 'Código' },
    { valor: 'nome',    rotulo: 'Nome' },
    { valor: 'largura', rotulo: 'Largura' },
    { valor: 'preco',   rotulo: 'Preço' },
    { valor: 'unidade', rotulo: 'Unidade' }
];

// Agrupa as abas em uso por assinatura de cabecalho: as 7 abas de tecido
// compartilham a mesma, entao o usuario mapeia uma vez so.
function _impLayoutsDistintos() {
    const C = window.ImportadorCore;
    const porAssinatura = {};
    _impEstado.planilha.ordem.forEach(nome => {
        const tipo = _impEstado.abas[nome];
        if (tipo === 'ignorar') return;
        const dados = _impEstado.planilha.abas[nome];
        const { indice, colunas } = C.detectarCabecalho(dados);
        const assinatura = C.assinaturaDoLayout(colunas) + '#' + tipo;
        if (!porAssinatura[assinatura]) {
            porAssinatura[assinatura] = { assinatura, colunas, cabecalhoIndice: indice, abas: [], tipo };
        }
        porAssinatura[assinatura].abas.push(nome);
    });
    return Object.values(porAssinatura);
}

function _impMapaDoLayout(layout) {
    const C = window.ImportadorCore;
    if (_impEstado.layouts[layout.assinatura]) return _impEstado.layouts[layout.assinatura].mapa;
    return C.sugerirMapeamento(layout.colunas);
}

function _impPasso3HTML() {
    const C = window.ImportadorCore;
    const layouts = _impLayoutsDistintos();
    const blocos = layouts.map((layout, li) => {
        const mapa = _impMapaDoLayout(layout);
        const dados = _impEstado.planilha.abas[layout.abas[0]];
        const inicio = layout.cabecalhoIndice + 1;
        const amostra = dados.slice(inicio, inicio + 3);

        const papelDaColuna = ci => {
            const achado = Object.keys(mapa).find(k => mapa[k] === ci);
            return achado || 'ignorar';
        };

        const cabecalhos = layout.colunas.map((rotulo, ci) => {
            const atual = papelDaColuna(ci);
            const opcoes = _IMP_PAPEIS.map(p => `<option value="${p.valor}" ${p.valor === atual ? 'selected' : ''}>${p.rotulo}</option>`).join('');
            return `<th style="min-width:120px">
                <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${escapeHtml(rotulo || '(sem título)')}</div>
                <select style="width:100%;font-size:12px" onchange="_impTrocarPapel(${li}, ${ci}, this.value)">${opcoes}</select>
            </th>`;
        }).join('');

        const corpo = amostra.map(linha =>
            '<tr>' + layout.colunas.map((_, ci) => `<td style="font-size:12px">${escapeHtml(String(linha[ci] === undefined ? '' : linha[ci]))}</td>`).join('') + '</tr>'
        ).join('');

        const qtd = C.montarItens({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa, tipo: layout.tipo, aba: layout.abas[0] }).length;

        return `<div class="card" style="margin-bottom:14px">
            <h4 style="margin:0 0 4px;color:var(--dark)">${layout.tipo === 'tecido' ? 'Tecidos' : 'Materiais'} — ${layout.abas.length} aba(s)</h4>
            <p style="font-size:12px;color:var(--muted);margin:0 0 10px">${escapeHtml(layout.abas.join(', '))}</p>
            <div style="overflow-x:auto"><table><thead><tr>${cabecalhos}</tr></thead><tbody>${corpo}</tbody></table></div>
            <p style="font-size:12px;color:var(--muted);margin:8px 0 0">${qtd} item(ns) na primeira aba deste layout.</p>
        </div>`;
    }).join('');

    return `
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">Diga o que é cada coluna. Abas com o mesmo cabeçalho são mapeadas juntas.</p>
    ${blocos}
    <div style="display:flex;justify-content:space-between;margin-top:8px">
        <button class="btn btn-outline" onclick="_impRenderPasso(2)">Voltar</button>
        <button class="btn btn-success" onclick="_impConcluirPasso3()">Continuar</button>
    </div>`;
}

function _impTrocarPapel(indiceLayout, indiceColuna, papel) {
    const layout = _impLayoutsDistintos()[indiceLayout];
    const mapa = Object.assign({}, _impMapaDoLayout(layout));
    // um papel pertence a uma coluna so: limpa quem estava com ele
    Object.keys(mapa).forEach(k => { if (mapa[k] === indiceColuna) mapa[k] = -1; });
    if (papel !== 'ignorar') mapa[papel] = indiceColuna;
    _impEstado.layouts[layout.assinatura] = { mapa, cabecalhoIndice: layout.cabecalhoIndice };
    _impRenderPasso(3);
}

async function _impConcluirPasso3() {
    const layouts = _impLayoutsDistintos();
    for (const layout of layouts) {
        const mapa = _impMapaDoLayout(layout);
        if (mapa.codigo < 0 || mapa.nome < 0 || mapa.preco < 0) {
            // Abas sem cabecalho reconhecivel caem aqui: a saida prevista e
            // marca-las como "Ignorar" no passo 2 (ou, na Fase 2, apontar a
            // linha do cabecalho na mao).
            const semCabecalho = layout.cabecalhoIndice < 0;
            await showAlert(
                `Não dá para mapear ${semCabecalho ? 'estas abas, que não têm cabeçalho reconhecível' : 'este layout'}:\n\n`
                + layout.abas.join(', ')
                + `\n\nMarque ao menos as colunas de Código, Nome e Preço — ou volte ao passo 2 e marque estas abas como "Ignorar".`,
                '⚠️');
            return;
        }
        _impEstado.layouts[layout.assinatura] = { mapa, cabecalhoIndice: layout.cabecalhoIndice };
    }
    _impRenderPasso(4);
}
```

- [ ] **Step 2: Verificar a sintaxe**

```bash
node --check js/importador-ui.js
```

Esperado: sem saída.

- [ ] **Step 3: Conferir no navegador**

Abra o assistente até o passo 3.
Esperado: dois ou três blocos de layout (um para os Books de tecido, os demais para materiais); o bloco de tecido mostra `CÓDIGO→Código`, `DESCRIÇÃO→Nome`, `LARGURA→Largura`, `CORTE→Preço`, `PEÇA→Ignorar`; trocar `PEÇA` para "Preço" limpa o "Preço" de `CORTE` e a contagem de itens continua a mesma.

- [ ] **Step 4: Commit**

```bash
git add js/importador-ui.js
git commit -m "feat(importador): passo 3 do assistente (mapeamento de colunas por layout)"
```

---

### Task 13: Assistente — passo 4 (conferência e gravação), snapshot e desfazer

**Files:**
- Modify: `js/importador-ui.js`
- Modify: `catalogo.html`

**Interfaces:**
- Consumes: `ImportadorCore.montarItens`, `classificar`, `markupDeExistente`, `aplicarMarkup`, `aplicarImportacao`, `montarPerfil`.
- Produces:
  - `_impColetarItens()` → `item[]` de todas as abas em uso.
  - `_impPasso4HTML()`, `_impEditarCampo(grupo, indice, campo, valor)`, `_impAlternarMarcado(grupo, indice)`.
  - `_impGravar()` — tira snapshot, aplica, salva perfil e recarrega.
  - `window.desfazerUltimaImportacao()` — restaura o snapshot.
  - Snapshot em `localStorage` na chave `sc_imp_snap`: `{ quando, resumo, catalogo, materiais }`.

- [ ] **Step 1: Implementar o passo 4 e a gravação**

Acrescente em `js/importador-ui.js`, e inclua `if (n === 4) { _impPrepararConferencia(); corpo.innerHTML = _impTrilha(4) + _impPasso4HTML(); }` dentro de `_impRenderPasso`:

```js
// ── Passo 4: conferencia ─────────────────────────────────────────────────────
const CHAVE_SNAPSHOT = 'sc_imp_snap';

function _impColetarItens() {
    const C = window.ImportadorCore;
    const itens = [];
    _impEstado.planilha.ordem.forEach(aba => {
        const tipo = _impEstado.abas[aba];
        if (tipo === 'ignorar') return;
        const dados = _impEstado.planilha.abas[aba];
        const { colunas } = C.detectarCabecalho(dados);
        const assinatura = C.assinaturaDoLayout(colunas) + '#' + tipo;
        const layout = _impEstado.layouts[assinatura];
        if (!layout) return;
        itens.push(...C.montarItens({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa: layout.mapa, tipo, aba }));
    });
    return itens;
}

function _impPrepararConferencia() {
    const C = window.ImportadorCore;
    const grupos = C.classificar({
        itens: _impColetarItens(),
        catalogo: db.catalogo,
        materiais: db.materiais,
        fornecedorId: _impEstado.fornecedor.id
    });
    // marcado/markup por entrada, decididos aqui e editaveis na tela
    const preparar = (lista, marcadoPadrao, markupFn) => lista.forEach(e => {
        e.marcado = marcadoPadrao;
        e.markup = markupFn(e);
    });
    preparar(grupos.novos, true, () => _impEstado.markupPadrao);
    preparar(grupos.atualizados, true, e => C.markupDeExistente(e.existente));
    preparar(grupos.sem_markup, true, () => _impEstado.markupPadrao);
    preparar(grupos.conflitos, false, () => _impEstado.markupPadrao);
    preparar(grupos.nomes_repetidos, false, () => _impEstado.markupPadrao);
    preparar(grupos.problemas, false, () => _impEstado.markupPadrao);
    _impEstado.grupos = grupos;
}

const _IMP_GRUPOS = [
    { chave: 'novos',           titulo: 'Novos',                   ajuda: 'Serão criados com o markup informado.' },
    { chave: 'atualizados',     titulo: 'Atualizados',             ajuda: 'Custo novo, venda recalculada com o markup atual do item.' },
    { chave: 'sem_markup',      titulo: 'Sem markup registrado',   ajuda: 'O item já existe mas não tem markup. Defina um para cada linha.' },
    { chave: 'conflitos',       titulo: 'Conflitos de código',     ajuda: 'O código já é de outro fornecedor. Edite o código ou desmarque.' },
    { chave: 'nomes_repetidos', titulo: 'Nomes repetidos',         ajuda: 'O nome já pertence a outro produto. Edite o nome ou desmarque.' },
    { chave: 'problemas',       titulo: 'Com problema',            ajuda: 'Preço ilegível. Corrija o valor ou deixe desmarcado.' }
];

function _impPasso4HTML() {
    const g = _impEstado.grupos;
    const blocos = _IMP_GRUPOS.map(def => {
        const lista = g[def.chave];
        if (!lista.length) return '';
        const linhas = lista.map((e, i) => {
            const it = e.item;
            const venda = window.ImportadorCore.aplicarMarkup(it.preco_custo, e.markup);
            const antes = e.existente
                ? `<div style="font-size:11px;color:var(--muted)">antes: custo ${_impMoeda(e.existente.preco_custo || 0)} · venda ${_impMoeda(e.existente.preco || 0)}</div>`
                : '';
            const alerta = (e.motivo ? [e.motivo] : []).concat(it.avisos)
                .map(a => `<div style="font-size:11px;color:var(--muted)">⚠ ${escapeHtml(a)}</div>`).join('');
            return `<tr>
                <td><input type="checkbox" ${e.marcado ? 'checked' : ''} onchange="_impAlternarMarcado('${def.chave}', ${i})"></td>
                <td style="font-size:12px;color:var(--muted)">${escapeHtml(it.aba)}</td>
                <td><input value="${escapeHtml(it.codigo)}" style="width:110px;font-size:12px" onchange="_impEditarCampo('${def.chave}', ${i}, 'codigo', this.value)"></td>
                <td><input value="${escapeHtml(it.nome)}" style="width:220px;font-size:12px" onchange="_impEditarCampo('${def.chave}', ${i}, 'nome', this.value)">${alerta}</td>
                <td><input type="number" step="0.01" value="${it.preco_custo === null ? '' : it.preco_custo}" style="width:90px;font-size:12px" onchange="_impEditarCampo('${def.chave}', ${i}, 'preco_custo', this.value)"></td>
                <td><input type="number" step="1" value="${e.markup === null ? '' : e.markup}" style="width:70px;font-size:12px" onchange="_impEditarCampo('${def.chave}', ${i}, 'markup', this.value)"></td>
                <td>${_impMoeda(venda)}${antes}</td>
            </tr>`;
        }).join('');
        return `<div class="card" style="margin-bottom:14px">
            <h4 style="margin:0 0 2px;color:var(--dark)">${def.titulo} <span style="color:var(--muted);font-weight:400">(${lista.length})</span></h4>
            <p style="font-size:12px;color:var(--muted);margin:0 0 10px">${def.ajuda}</p>
            <div style="max-height:260px;overflow:auto"><table>
                <thead><tr><th></th><th>Aba</th><th>Código</th><th>Nome</th><th>Custo</th><th>Markup %</th><th>Venda</th></tr></thead>
                <tbody>${linhas}</tbody>
            </table></div>
        </div>`;
    }).join('');

    const sumiram = g.sumiram.length
        ? `<div class="card" style="margin-bottom:14px">
            <h4 style="margin:0 0 2px;color:var(--dark)">Sumiram da tabela <span style="color:var(--muted);font-weight:400">(${g.sumiram.length})</span></h4>
            <p style="font-size:12px;color:var(--muted);margin:0">Estão cadastrados e não vieram nesta tabela. Nada será alterado neles.</p>
            <p style="font-size:12px;margin:8px 0 0">${g.sumiram.slice(0, 20).map(e => escapeHtml(e.existente.referencia || e.existente.nome)).join(', ')}${g.sumiram.length > 20 ? '…' : ''}</p>
        </div>` : '';

    const marcados = _IMP_GRUPOS.reduce((n, d) => n + g[d.chave].filter(e => e.marcado).length, 0);

    return `
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">Confira e ajuste o que quiser. Só as linhas marcadas serão gravadas.</p>
    ${blocos}${sumiram}
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:6px 0 14px;cursor:pointer">
        <input type="checkbox" id="imp-salvar-perfil" checked> Salvar este mapeamento como perfil deste fornecedor
    </label>
    <div style="display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-outline" onclick="_impRenderPasso(3)">Voltar</button>
        <button class="btn btn-success" onclick="_impGravar()">Gravar ${marcados} item(ns)</button>
    </div>`;
}

function _impAlternarMarcado(chave, i) {
    const e = _impEstado.grupos[chave][i];
    e.marcado = !e.marcado;
    _impRenderPasso(4);
}

function _impEditarCampo(chave, i, campo, valor) {
    const C = window.ImportadorCore;
    const e = _impEstado.grupos[chave][i];
    if (campo === 'markup') { e.markup = parseFloat(valor); if (!isFinite(e.markup)) e.markup = 0; }
    else if (campo === 'preco_custo') {
        const p = C.normalizarPreco(valor);
        e.item.preco_custo = p.ok ? p.valor : null;
        e.item.problema = p.ok ? null : p.motivo;
    }
    else if (campo === 'codigo') e.item.codigo = C.normalizarCodigo(valor).codigo;
    else if (campo === 'nome') e.item.nome = C.normalizarNome(valor);
    _impRenderPasso(4);
}

// ── Gravacao, snapshot e desfazer ────────────────────────────────────────────
function _impSalvarSnapshot(resumo) {
    localStorage.setItem(CHAVE_SNAPSHOT, JSON.stringify({
        quando: new Date().toISOString(),
        resumo,
        catalogo: db.catalogo,
        materiais: db.materiais
    }));
}

async function _impGravar() {
    const C = window.ImportadorCore;
    const g = _impEstado.grupos;
    const decisoes = [];
    _IMP_GRUPOS.forEach(def => {
        g[def.chave].forEach(e => {
            const ignorar = { item: e.item, existente: e.existente, markup: e.markup, acao: 'ignorar' };
            if (!e.marcado || e.item.preco_custo === null) { decisoes.push(ignorar); return; }
            // a acao sai do codigo atual do item, nao do grupo: se o usuario
            // editou o codigo de um conflito, isto vira "criar" sozinho
            const r = C.resolverAcao(e.item, db.catalogo, db.materiais);
            decisoes.push({ item: e.item, existente: r.existente, markup: e.markup, acao: r.acao });
        });
    });

    const vaiGravar = decisoes.filter(d => d.acao !== 'ignorar').length;
    if (!vaiGravar) { await showAlert('Nenhuma linha marcada para gravar.', '⚠️'); return; }

    const erros = C.validarDecisoes(decisoes, db.catalogo, db.materiais);
    if (erros.length) {
        await showAlert('Corrija antes de gravar:\n\n' + erros.slice(0, 8).join('\n')
            + (erros.length > 8 ? `\n\n…e mais ${erros.length - 8}.` : ''), '⚠️');
        return;
    }

    if (!await showConfirm(`Gravar ${vaiGravar} item(ns) no catálogo?`, '📥', 'Gravar', 'Cancelar')) return;

    const r = C.aplicarImportacao({
        decisoes,
        catalogo: db.catalogo,
        materiais: db.materiais,
        fornecedor: _impEstado.fornecedor,
        agora: Date.now()
    });

    _impSalvarSnapshot(r.resumo);
    db.catalogo = r.catalogo;
    db.materiais = r.materiais;

    if (document.getElementById('imp-salvar-perfil')?.checked) _impSalvarPerfil();

    salvarERecarregar(`Importação concluída: ${r.resumo.criados} criado(s), ${r.resumo.atualizados} atualizado(s).`);
}

function _impSalvarPerfil() {
    const C = window.ImportadorCore;
    const layouts = Object.keys(_impEstado.layouts).map(assinatura => ({
        assinatura,
        mapa: _impEstado.layouts[assinatura].mapa,
        cabecalhoIndice: _impEstado.layouts[assinatura].cabecalhoIndice
    }));
    const existente = C.perfilDoFornecedor(db.import_perfis, _impEstado.fornecedor.id);
    const perfil = C.montarPerfil({
        id: existente ? existente.id : Date.now(),
        nome: _impEstado.fornecedor.nome,
        fornecedorId: _impEstado.fornecedor.id,
        abas: _impEstado.abas,
        layouts,
        cores: existente ? existente.cores : {},
        markupPadrao: _impEstado.markupPadrao
    });
    if (existente) db.import_perfis[db.import_perfis.indexOf(existente)] = perfil;
    else db.import_perfis.push(perfil);
}

function _impSnapshot() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SNAPSHOT)); } catch (e) { return null; }
}

async function desfazerUltimaImportacao() {
    const snap = _impSnapshot();
    if (!snap) { await showAlert('Não há importação para desfazer.', 'ℹ️'); return; }
    const quando = new Date(snap.quando).toLocaleString('pt-BR');
    const msg = `Desfazer a importação de ${quando}?\n${snap.resumo.criados} criado(s) e ${snap.resumo.atualizados} atualizado(s) voltarão ao estado anterior.`;
    if (!await showConfirm(msg, '↩️', 'Desfazer', 'Cancelar')) return;
    db.catalogo = snap.catalogo;
    db.materiais = snap.materiais;
    localStorage.removeItem(CHAVE_SNAPSHOT);
    salvarERecarregar('Importação desfeita.');
}

function _impAtualizarBotaoDesfazer() {
    const btn = document.getElementById('btn-desfazer-import');
    if (!btn) return;
    btn.style.display = _impSnapshot() ? '' : 'none';
}
document.addEventListener('DOMContentLoaded', _impAtualizarBotaoDesfazer);
```

- [ ] **Step 2: Pôr o botão de desfazer no catálogo**

Em `catalogo.html`, dentro do `.header`, logo antes do botão de importar:

```html
            <button class="btn btn-outline" id="btn-desfazer-import" style="display:none" onclick="desfazerUltimaImportacao()">↩️ Desfazer importação</button>
```

- [ ] **Step 3: Verificar a sintaxe**

```bash
node --check js/importador-ui.js
npm test
```

Esperado: sem saída do `node --check` e testes PASS.

- [ ] **Step 4: Conferir no navegador**

Percorra o assistente inteiro com a planilha real e grave.
Esperado: o passo 4 agrupa Novos / Atualizados / etc. com contagem; editar o custo recalcula a venda na hora; gravar mostra o toast com o resumo, o catálogo passa a listar os tecidos importados, e o botão "↩️ Desfazer importação" aparece. Desfazer devolve o catálogo ao estado anterior.

- [ ] **Step 5: Commit**

```bash
git add js/importador-ui.js catalogo.html
git commit -m "feat(importador): conferencia editavel, gravacao, snapshot e desfazer"
```

---

### Task 14: Teste de ponta a ponta da Fase 1

**Files:**
- Create: `tests/e2e/importador.spec.js`
- Create: `tests/e2e/README.md`

**Interfaces:**
- Consumes: a aplicação inteira servida como arquivos estáticos.
- Produces: um teste Playwright que percorre o assistente e confere `localStorage`.

O Playwright **não** entra no `package.json` do projeto: ele é instalado na pasta de rascunho da sessão, para não criar dependência de runtime.

- [ ] **Step 1: Documentar como rodar**

`tests/e2e/README.md`:

```markdown
# Testes de navegador

O projeto não tem dependências. O Playwright é instalado fora dele:

    mkdir -p /tmp/sctech-e2e && cd /tmp/sctech-e2e
    npm init -y && npm i -D @playwright/test
    npx playwright install chromium

Sirva o projeto e rode o teste apontando para ele:

    node -e "const h=require('http'),f=require('fs'),p=require('path');const r=process.env.RAIZ;h.createServer((q,s)=>{const a=p.join(r,decodeURIComponent(q.url.split('?')[0]));f.readFile(a,(e,d)=>{if(e){s.writeHead(404);return s.end()}s.end(d)})}).listen(8123)" &
    RAIZ=<caminho do projeto> BASE=http://localhost:8123 npx playwright test <caminho>/tests/e2e/importador.spec.js
```

- [ ] **Step 2: Escrever o teste**

`tests/e2e/importador.spec.js`:

> **Sessão autenticada é obrigatória.** O SCTech redireciona para `login.html`
> quando não há sessão, então um teste que navega direto para `catalogo.html`
> encontra a tela de login e falha com `window._impLerArquivo is not a function`.
> Semeie a sessão antes de cada navegação. Papel 1 é o Administrador que vem de
> `papeisPadrao()`, com tudo em "completo".

```js
const { test, expect } = require('@playwright/test');
const path = require('node:path');

const BASE = process.env.BASE || 'http://localhost:8123';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// Semeia a sessao. Sem isto, toda navegacao cai em login.html.
async function entrar(page) {
    await page.goto(BASE + '/login.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_usr', JSON.stringify([{
            id: 1, nome: 'Teste', email: 'teste@sctech.local',
            papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: ''
        }]));
        sessionStorage.setItem('sc_user', JSON.stringify({ id: 1 }));
    });
}

test('importa a tabela real do fornecedor para o catalogo', async ({ page }) => {
    await entrar(page);
    await page.goto(BASE + '/catalogo.html');

    // fornecedor conhecido, catalogo e materiais limpos
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify([]));
        localStorage.removeItem('sc_imp_snap');
        localStorage.removeItem('sc_imp_perfis');
    });
    await page.reload();

    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba(s)');

    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('text=Continuar');                    // passo 2

    await expect(page.locator('#imp-corpo')).toContainText('Capa');

    // Cinco abas da planilha real nao tem cabecalho reconhecivel; na Fase 1 a
    // saida prevista para elas e "Ignorar" (a Fase 2 traz o cabecalho manual).
    const ignoradas = await page.evaluate(() => {
        const C = window.ImportadorCore;
        const semCabecalho = [];
        _impEstado.planilha.ordem.forEach(aba => {
            if (C.detectarCabecalho(_impEstado.planilha.abas[aba]).indice === -1) {
                _impEstado.abas[aba] = 'ignorar';
                semCabecalho.push(aba);
            }
        });
        _impRenderPasso(2);
        return semCabecalho;
    });
    expect(ignoradas.length).toBeGreaterThan(0);

    await page.click('text=Continuar');                    // passo 3
    await expect(page.locator('#imp-corpo')).toContainText('Tecidos');
    await page.click('text=Continuar');                    // passo 4

    await expect(page.locator('#imp-corpo')).toContainText('Novos');

    await page.click('button:has-text("Gravar")');
    await page.click('#sc-modal-ok');

    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);

    const cat = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat')));
    expect(cat.length).toBeGreaterThan(100);
    expect(cat.every(t => t.referencia && t.nome)).toBe(true);
    expect(cat.every(t => !String(t.referencia).includes('*'))).toBe(true);
    expect(cat.every(t => t.fornecedor_id === 7)).toBe(true);
    // markup de 80% aplicado sobre o custo
    const comCusto = cat.filter(t => t.preco_custo > 0);
    expect(comCusto.length).toBeGreaterThan(0);
    expect(comCusto.every(t => Math.abs(t.preco - Math.round(t.preco_custo * 1.8 * 100) / 100) < 0.02)).toBe(true);
    // a observacao nao virou produto
    expect(cat.some(t => /MODELO WAVE PLUS/i.test(t.nome))).toBe(false);
});

test('desfaz a importacao e devolve o catalogo ao estado anterior', async ({ page }) => {
    await entrar(page);
    await page.goto(BASE + '/catalogo.html');
    const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length);
    expect(antes).toBeGreaterThan(0);

    await page.click('#btn-desfazer-import');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length === 0);

    const depois = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length);
    expect(depois).toBe(0);
});
```

- [ ] **Step 3: Rodar**

Siga o README. Esperado: 2 testes PASS.

- [ ] **Step 4: Derrubar o servidor e limpar a pasta de rascunho**

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/
git commit -m "test(importador): teste de ponta a ponta da importacao por planilha"
```

---

## Fase 2 — PDF e preço por cor

### Task 15: Agrupamento do texto do PDF em linhas e colunas

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `agruparLinhasPdf(fragmentos, opcoes)` → `string[][]`.
  - `fragmentos` é `[{ texto, x, y }]` — o que `pdf.js` devolve em `getTextContent()`, já reduzido a esses três campos pela camada de interface.
  - `opcoes` é `{ toleranciaY = 3, toleranciaX = 12 }`.
  - Fragmentos com `y` dentro da tolerância viram a mesma linha, ordenada por `x`. Fragmentos horizontalmente vizinhos (distância menor que `toleranciaX`) são concatenados na mesma célula. As colunas saem na ordem de `x`, o que basta para o usuário mapear no passo 3.

- [ ] **Step 1: Escrever os testes**

```js
test('agruparLinhasPdf junta fragmentos da mesma altura', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'AC1', x: 10, y: 100 },
        { texto: 'Linho', x: 80, y: 100 },
        { texto: '78,90', x: 200, y: 100 },
        { texto: 'AC2', x: 10, y: 80 },
        { texto: 'Voil', x: 80, y: 80 },
        { texto: '50,00', x: 200, y: 80 }
    ]);
    assert.deepStrictEqual(linhas, [['AC1', 'Linho', '78,90'], ['AC2', 'Voil', '50,00']]);
});

test('agruparLinhasPdf tolera diferenca pequena de y', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'A', x: 10, y: 100 },
        { texto: 'B', x: 80, y: 101.5 }
    ]);
    assert.deepStrictEqual(linhas, [['A', 'B']]);
});

test('agruparLinhasPdf concatena fragmentos colados na mesma celula', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'LINHO', x: 80, y: 100 },
        { texto: 'BELGA', x: 86, y: 100 },
        { texto: '78,90', x: 300, y: 100 }
    ]);
    assert.deepStrictEqual(linhas, [['LINHO BELGA', '78,90']]);
});

test('agruparLinhasPdf ordena de cima para baixo e da esquerda para a direita', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'z', x: 300, y: 10 },
        { texto: 'a', x: 10, y: 200 },
        { texto: 'b', x: 150, y: 200 }
    ]);
    assert.deepStrictEqual(linhas, [['a', 'b'], ['z']]);
});

test('agruparLinhasPdf descarta fragmentos vazios', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: '  ', x: 10, y: 100 },
        { texto: 'A', x: 80, y: 100 }
    ]);
    assert.deepStrictEqual(linhas, [['A']]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.agruparLinhasPdf is not a function`.

- [ ] **Step 3: Implementar**

```js
    function agruparLinhasPdf(fragmentos, opcoes) {
        const o = opcoes || {};
        const toleranciaY = o.toleranciaY === undefined ? 3 : o.toleranciaY;
        const toleranciaX = o.toleranciaX === undefined ? 12 : o.toleranciaX;

        const uteis = (fragmentos || [])
            .map(f => ({ texto: normalizarNome(f.texto), x: Number(f.x), y: Number(f.y) }))
            .filter(f => f.texto !== '' && isFinite(f.x) && isFinite(f.y));

        // agrupa por y (no PDF, y cresce de baixo para cima)
        const grupos = [];
        uteis.slice().sort((a, b) => b.y - a.y).forEach(f => {
            const grupo = grupos.find(g => Math.abs(g.y - f.y) <= toleranciaY);
            if (grupo) grupo.itens.push(f);
            else grupos.push({ y: f.y, itens: [f] });
        });

        return grupos.map(grupo => {
            const ordenados = grupo.itens.sort((a, b) => a.x - b.x);
            const celulas = [];
            let atual = null;
            let fimAnterior = null;
            ordenados.forEach(f => {
                if (atual !== null && fimAnterior !== null && (f.x - fimAnterior) < toleranciaX) {
                    atual.texto += ' ' + f.texto;
                } else {
                    atual = { texto: f.texto };
                    celulas.push(atual);
                }
                // aproxima a largura do fragmento por 5px por caractere
                fimAnterior = f.x + f.texto.length * 5;
            });
            return celulas.map(c => c.texto);
        });
    }
```

Acrescente `agruparLinhasPdf` ao `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): agrupamento do texto do PDF em linhas e colunas"
```

---

### Task 16: Expansão por cor

**Files:**
- Modify: `js/importador-core.js`
- Modify: `tests/importador-core.test.js`

**Interfaces:**
- Consumes: `normalizarCodigo`, `normalizarNome`, `normalizarPreco`, `ehLinhaDeProduto`.
- Produces: `expandirPorCor({ linhas, cabecalhoIndice, mapa, colunasCor, colunas, tipo, aba })` → `item[]`, no mesmo formato de `montarItens`.
  - `colunasCor` é a lista de índices de coluna que são cores; o rótulo da cor vem de `colunas[indice]`.
  - Cada linha × cor com preço legível vira um item. Cores sem preço naquela linha são puladas em silêncio.
  - Código: `CODIGO-COR`. Nome: `Nome (COR)`.

- [ ] **Step 1: Escrever os testes**

```js
const COLUNAS_COR = ['CÓD', 'DESCRIÇÃO', 'DOURADO', 'CROMADO', 'BRANCO'];
const MAPA_COR = { codigo: 0, nome: 1, largura: -1, preco: -1, unidade: -1 };

test('expandirPorCor cria um item por cor com preco', () => {
    const itens = C.expandirPorCor({
        linhas: [COLUNAS_COR, ['AC123', 'Ponteira', '10,00', '12,00', '9,50']],
        cabecalhoIndice: 0, mapa: MAPA_COR, colunasCor: [2, 3, 4], colunas: COLUNAS_COR,
        tipo: 'material', aba: 'Cor Metal'
    });
    assert.strictEqual(itens.length, 3);
    assert.strictEqual(itens[0].codigo, 'AC123-DOURADO');
    assert.strictEqual(itens[0].nome, 'Ponteira (DOURADO)');
    assert.strictEqual(itens[0].preco_custo, 10);
    assert.strictEqual(itens[2].codigo, 'AC123-BRANCO');
    assert.strictEqual(itens[2].preco_custo, 9.5);
});

test('expandirPorCor pula a cor sem preco naquela linha', () => {
    const itens = C.expandirPorCor({
        linhas: [COLUNAS_COR, ['AC123', 'Ponteira', '10,00', '--', '']],
        cabecalhoIndice: 0, mapa: MAPA_COR, colunasCor: [2, 3, 4], colunas: COLUNAS_COR,
        tipo: 'material', aba: 'Cor Metal'
    });
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].codigo, 'AC123-DOURADO');
});

test('expandirPorCor ignora linhas que nao sao produto', () => {
    const itens = C.expandirPorCor({
        linhas: [COLUNAS_COR, ['OBSERVACAO SOLTA'], [], ['AC1', 'Real', '5,00', '', '']],
        cabecalhoIndice: 0, mapa: MAPA_COR, colunasCor: [2, 3, 4], colunas: COLUNAS_COR,
        tipo: 'material', aba: 'Cor Metal'
    });
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].codigo, 'AC1-DOURADO');
});

test('expandirPorCor mantem o aviso de promocional', () => {
    const itens = C.expandirPorCor({
        linhas: [COLUNAS_COR, ['*AC9', 'Promo', '5,00', '', '']],
        cabecalhoIndice: 0, mapa: MAPA_COR, colunasCor: [2, 3, 4], colunas: COLUNAS_COR,
        tipo: 'material', aba: 'Cor Metal'
    });
    assert.strictEqual(itens[0].codigo, 'AC9-DOURADO');
    assert.strictEqual(itens[0].promocional, true);
    assert.ok(itens[0].avisos.some(a => /promo/i.test(a)));
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FALHA com `C.expandirPorCor is not a function`.

- [ ] **Step 3: Implementar**

```js
    function expandirPorCor(opcoes) {
        const linhas = opcoes.linhas || [];
        const mapa = opcoes.mapa;
        const colunas = (opcoes.colunas || []).map(c => normalizarNome(c));
        const colunasCor = opcoes.colunasCor || [];
        const tipo = opcoes.tipo;
        const aba = opcoes.aba || '';
        const inicio = (opcoes.cabecalhoIndice >= 0 ? opcoes.cabecalhoIndice : -1) + 1;
        const itens = [];

        for (let i = inicio; i < linhas.length; i++) {
            const linha = linhas[i];
            if (!ehLinhaDeProduto(linha, mapa)) continue;
            const cod = normalizarCodigo(linha[mapa.codigo]);
            const nomeBase = normalizarNome(linha[mapa.nome]);

            colunasCor.forEach(ci => {
                const cor = normalizarNome(colunas[ci]).toUpperCase();
                if (!cor) return;
                const p = normalizarPreco(linha[ci]);
                if (!p.ok) return;
                const avisos = [];
                if (cod.promocional) avisos.push('Código veio marcado como promocional (com *) na tabela');
                itens.push({
                    aba,
                    linha: i,
                    codigo: cod.codigo + '-' + cor.replace(/\s+/g, ''),
                    nome: nomeBase + ' (' + cor + ')',
                    largura: null,
                    preco_custo: p.valor,
                    unidade: tipo === 'tecido' ? 'm' : 'un',
                    tipo,
                    promocional: cod.promocional,
                    avisos,
                    problema: null
                });
            });
        }
        return itens;
    }
```

Acrescente `expandirPorCor` ao `api`.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add js/importador-core.js tests/importador-core.test.js
git commit -m "feat(importador): expansao de itens por coluna de cor"
```

---

### Task 17: PDF, modo cor e cabeçalho manual na interface

**Files:**
- Modify: `js/importador-ui.js`
- Modify: `catalogo.html`

**Interfaces:**
- Consumes: `agruparLinhasPdf`, `expandirPorCor`, `_impGarantirPdfJs`.
- Produces:
  - `_impGarantirPdfJs()` → `Promise<void>` (mesmo padrão de `_garantirPdfJs` em `app.js`).
  - `_impLerArquivo` passa a aceitar `.pdf`, devolvendo uma "aba" por página, nomeada `Página 1`, `Página 2`…
  - No passo 3, cada layout ganha a caixa "Esta aba tem preço por cor" e, quando o cabeçalho não foi detectado, um seletor de linha do cabeçalho.
  - `_impEstado.cores[assinatura] = [indices]` e `_impEstado.layouts[assinatura].cabecalhoIndice` passam a ser editáveis pelo usuário.

- [ ] **Step 1: Aceitar PDF na leitura**

Em `js/importador-ui.js`, acrescente o carregador e troque a guarda de extensão de `_impLerArquivo`:

```js
let _impPdfJsPronto = null;

async function _impGarantirPdfJs() {
    if (window.pdfjsLib) return;
    if (!_impPdfJsPronto) {
        _impPdfJsPronto = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF — verifique sua conexão.'));
            document.head.appendChild(s);
        }).then(() => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        });
    }
    await _impPdfJsPronto;
}

// Cada pagina do PDF vira uma "aba", para reusar todo o fluxo da planilha.
async function _impLerPdf(file) {
    await _impGarantirPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const abas = {};
    const ordem = [];
    let vazias = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();
        const fragmentos = conteudo.items.map(it => ({ texto: it.str, x: it.transform[4], y: it.transform[5] }));
        const linhas = window.ImportadorCore.agruparLinhasPdf(fragmentos);
        if (linhas.length === 0) vazias++;
        const nome = 'Página ' + i;
        abas[nome] = linhas;
        ordem.push(nome);
    }
    if (vazias === pdf.numPages) {
        throw new Error('Este PDF não tem camada de texto — não dá para ler a tabela dele. Peça o arquivo em Excel ao fornecedor.');
    }
    if (vazias > 0) {
        toast(`${vazias} página(s) do PDF vieram sem texto e ficaram vazias.`, 'warning', 6000);
    }
    return { ordem, abas };
}
```

E em `_impLerArquivo`, substitua o começo:

```js
async function _impLerArquivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return _impLerPdf(file);
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        throw new Error('Formato não suportado: .' + ext + '. Use .xlsx, .csv ou .pdf.');
    }
    // ... resto igual
```

Atualize também o `accept` do input no passo 1 e o do `catalogo.html`:

```js
        <input type="file" id="imp-file" accept=".xlsx,.xls,.csv,.pdf" onchange="_impArquivoEscolhido(this)">
```

- [ ] **Step 2: Modo cor e cabeçalho manual no passo 3**

Dentro de `_impPasso3HTML()`, logo antes do `return` de cada bloco, acrescente os controles e use-os:

```js
        const modoCor = !!_impEstado.cores[layout.assinatura];
        const opcoesLinha = dados.slice(0, 12).map((_, li) =>
            `<option value="${li}" ${li === layout.cabecalhoIndice ? 'selected' : ''}>Linha ${li + 1}</option>`).join('');
        const controles = `
            <div style="display:flex;gap:16px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
                <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer">
                    <input type="checkbox" ${modoCor ? 'checked' : ''} onchange="_impAlternarModoCor(${li})"> Esta aba tem preço por cor
                </label>
                <label style="display:flex;align-items:center;gap:7px;font-size:13px">
                    Cabeçalho: <select onchange="_impTrocarCabecalho(${li}, this.value)">${opcoesLinha}</select>
                </label>
            </div>`;
```

No modo cor, o seletor de papel de cada coluna ganha a opção "Cor" e a contagem passa a vir de `expandirPorCor`:

```js
        const papeis = modoCor ? _IMP_PAPEIS.concat([{ valor: 'cor', rotulo: 'Cor' }]) : _IMP_PAPEIS;
```

Use `papeis` no lugar de `_IMP_PAPEIS` na montagem dos `<option>`, trate `atual === 'cor'` quando `(_impEstado.cores[layout.assinatura] || []).includes(ci)`, e troque o cálculo de `qtd`:

```js
        const qtd = modoCor
            ? C.expandirPorCor({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa, colunasCor: _impEstado.cores[layout.assinatura] || [], colunas: layout.colunas, tipo: layout.tipo, aba: layout.abas[0] }).length
            : C.montarItens({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa, tipo: layout.tipo, aba: layout.abas[0] }).length;
```

Insira `${controles}` no HTML do bloco, logo depois do parágrafo com a lista de abas.

- [ ] **Step 3: Implementar os novos manipuladores**

```js
function _impAlternarModoCor(indiceLayout) {
    const layout = _impLayoutsDistintos()[indiceLayout];
    if (_impEstado.cores[layout.assinatura]) delete _impEstado.cores[layout.assinatura];
    else _impEstado.cores[layout.assinatura] = [];
    _impRenderPasso(3);
}

function _impTrocarCabecalho(indiceLayout, valor) {
    const C = window.ImportadorCore;
    const layout = _impLayoutsDistintos()[indiceLayout];
    const indice = parseInt(valor, 10);
    const dados = _impEstado.planilha.abas[layout.abas[0]];
    const colunas = (dados[indice] || []).map(c => C.normalizarNome(c));
    _impEstado.layouts[layout.assinatura] = {
        mapa: C.sugerirMapeamento(colunas),
        cabecalhoIndice: indice
    };
    _impRenderPasso(3);
}
```

Em `_impTrocarPapel`, trate o papel `cor`:

```js
function _impTrocarPapel(indiceLayout, indiceColuna, papel) {
    const layout = _impLayoutsDistintos()[indiceLayout];
    const mapa = Object.assign({}, _impMapaDoLayout(layout));
    const cores = (_impEstado.cores[layout.assinatura] || []).filter(c => c !== indiceColuna);
    Object.keys(mapa).forEach(k => { if (mapa[k] === indiceColuna) mapa[k] = -1; });
    if (papel === 'cor') cores.push(indiceColuna);
    else if (papel !== 'ignorar') mapa[papel] = indiceColuna;
    _impEstado.layouts[layout.assinatura] = { mapa, cabecalhoIndice: layout.cabecalhoIndice };
    if (_impEstado.cores[layout.assinatura]) _impEstado.cores[layout.assinatura] = cores.sort((a, b) => a - b);
    _impRenderPasso(3);
}
```

Em `_impColetarItens`, use `expandirPorCor` quando a aba estiver em modo cor:

```js
        const cores = _impEstado.cores[assinatura];
        if (cores && cores.length) {
            itens.push(...C.expandirPorCor({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa: layout.mapa, colunasCor: cores, colunas, tipo, aba }));
        } else {
            itens.push(...C.montarItens({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa: layout.mapa, tipo, aba }));
        }
```

E em `_impConcluirPasso3`, dispense a exigência de coluna de preço quando o layout estiver em modo cor:

```js
        const emCor = (_impEstado.cores[layout.assinatura] || []).length > 0;
        if (mapa.codigo < 0 || mapa.nome < 0 || (!emCor && mapa.preco < 0)) {
            await showAlert(`No layout de ${layout.abas[0]}, marque ao menos as colunas de Código, Nome e Preço (ou marque as colunas de Cor).`, '⚠️');
            return;
        }
```

Finalmente, em `_impSalvarPerfil`, passe as cores reais em vez das do perfil anterior:

```js
        cores: _impEstado.cores,
```

- [ ] **Step 4: Verificar a sintaxe**

```bash
node --check js/importador-ui.js
npm test
```

Esperado: sem saída do `node --check` e testes PASS.

- [ ] **Step 5: Conferir no navegador**

1. Importe `docs/Tabela de preços RC TECIDOS PDF.pdf`. Esperado: 22 "abas" (`Página 1`…`Página 22`), e o passo 3 mostrando as colunas reconhecidas.
2. Importe a planilha, vá até o passo 3, marque "Esta aba tem preço por cor" no bloco de `Cor Metal`, marque as colunas de cor e confira que a contagem sobe para linhas × cores.
3. Numa aba sem cabeçalho detectado (`Trilho Motorizado`), troque o seletor de linha do cabeçalho e veja o mapeamento ser sugerido de novo.

- [ ] **Step 6: Commit**

```bash
git add js/importador-ui.js catalogo.html
git commit -m "feat(importador): importacao de PDF, preco por cor e cabecalho manual"
```

---

### Task 18: Teste de ponta a ponta da Fase 2

**Files:**
- Modify: `tests/e2e/importador.spec.js`

**Interfaces:**
- Consumes: tudo da Fase 2.
- Produces: assertivas de que o PDF gera os mesmos códigos que a planilha e de que a expansão por cor grava os itens esperados.

- [ ] **Step 1: Acrescentar os testes**

```js
test('o PDF produz os mesmos codigos que a planilha', async ({ page }) => {
    const PDF = path.join(RAIZ, 'docs', 'Tabela de preços RC TECIDOS PDF.pdf');

    const importar = async arquivo => {
        await entrar(page);
        await page.goto(BASE + '/catalogo.html');
        await page.evaluate(() => {
            localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
            localStorage.setItem('sc_cat', JSON.stringify([]));
            localStorage.setItem('sc_mat', JSON.stringify([]));
            localStorage.removeItem('sc_imp_perfis');
        });
        await page.reload();
        await page.click('text=📥 Importar tabela');
        await page.setInputFiles('#imp-file', arquivo);
        await page.selectOption('#imp-fornecedor', '7');
        await page.click('text=Continuar');
        await page.evaluate(() => {
            const C = window.ImportadorCore;
            _impEstado.planilha.ordem.forEach(aba => {
                if (C.detectarCabecalho(_impEstado.planilha.abas[aba]).indice === -1) _impEstado.abas[aba] = 'ignorar';
            });
            _impRenderPasso(2);
        });
        await page.click('text=Continuar');
        await page.click('text=Continuar');
        await page.click('button:has-text("Gravar")');
        await page.click('#sc-modal-ok');
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);
        return page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat')).map(t => t.referencia).sort());
    };

    const daPlanilha = await importar(PLANILHA);
    const doPdf = await importar(PDF);

    // o PDF e a mesma tabela: a maioria esmagadora dos codigos precisa bater
    const emComum = doPdf.filter(c => daPlanilha.includes(c));
    expect(emComum.length).toBeGreaterThan(daPlanilha.length * 0.8);
});

test('modo preco por cor grava um material por cor', async ({ page }) => {
    await entrar(page);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify([]));
        localStorage.removeItem('sc_imp_perfis');
    });
    await page.reload();
    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('text=Continuar');

    // so a aba Cor Metal
    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Cor Metal'] = 'material';
        _impRenderPasso(2);
    });
    await page.click('text=Continuar');

    await page.click('text=Esta aba tem preço por cor');
    const antes = await page.locator('#imp-corpo').innerText();
    expect(antes).toContain('preço por cor');

    await page.click('text=Continuar');
    await page.click('button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_mat') || '[]').length > 0);

    const mats = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_mat')));
    expect(mats.every(m => /-[A-Z]+$/.test(m.referencia))).toBe(true);
    expect(mats.every(m => /\(.+\)$/.test(m.nome))).toBe(true);
});
```

- [ ] **Step 2: Rodar**

Siga `tests/e2e/README.md`. Esperado: 4 testes PASS.

- [ ] **Step 3: Derrubar o servidor e limpar a pasta de rascunho**

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/importador.spec.js
git commit -m "test(importador): ponta a ponta do PDF e da expansao por cor"
```

---

## Cobertura da spec

| Requisito da spec | Task |
|---|---|
| Ler `.xlsx` / `.csv` | 10 |
| Ler `.pdf` | 15, 17 |
| Passo 1: arquivo, fornecedor, criar fornecedor inline, markup | 11 |
| Passo 2: abas com tipo e contagem | 11 |
| Passo 3: mapeamento por layout com sugestão | 12 |
| Passo 3: preço por cor | 16, 17 |
| Passo 3: cabeçalho manual | 17 |
| Passo 4: conferência editável agrupada | 13 |
| Normalização de código, preço, largura, nome | 2 |
| Linha vira item só com código e nome | 3 |
| Classificação em sete grupos | 7 |
| Conflito: substituir o existente ou editar o código | 8, 13 |
| Nenhum código duplicado no sistema | 8, 13 |
| Nome duplicado bloqueado | 7 |
| Markup novo / preservado / a definir | 6, 13 |
| Gravação em `db.catalogo` e `db.materiais`, sem tocar estoque | 8 |
| Perfis por fornecedor, com atalho para a conferência | 9, 11, 13 |
| Snapshot e desfazer | 13 |
| Testes contra os arquivos reais | 1, 3, 4, 5, 9, 14, 18 |
