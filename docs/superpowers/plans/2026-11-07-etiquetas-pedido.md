# Etiquetas de pedido, volumes e conferência de expedição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Etiqueta adesiva por volume (código de barras e/ou QR) montada num editor drag and drop em Configurar Empresa, código fixo na Proposta e na OS, e uma tela de Expedição para conferir pacotes com scanner.

**Architecture:** Regras puras (formato do código, modelo da etiqueta, HTML da etiqueta, regras de conferência) em `js/etiquetas-core.js`, testadas com `node --test`. A geração dos códigos SVG (bibliotecas via CDN, sob demanda) e a impressão ficam em `js/etiquetas-render.js`. O editor fica em `js/etiquetas-editor.js` e a conferência em `js/expedicao.js`. O `app.js` só ganha ganchos: botões, marcação no card, permissões, preservação de campos e o reset da conferência.

**Tech Stack:** HTML/CSS/JS sem build. JsBarcode 3.11.6 (Code128) e qrcode-generator 1.4.4 via CDN jsdelivr, carregados sob demanda. `node --test` para o core, Playwright (instalado fora do repo, ver `tests/e2e/README.md`) para as telas.

**Spec:** [Docs/superpowers/specs/2026-11-07-etiquetas-pedido-design.md](../specs/2026-11-07-etiquetas-pedido-design.md)

## Global Constraints

- Sem npm, sem build, sem dependência de runtime. Bibliotecas só via `<script>` criado sob demanda, apontando para `https://cdn.jsdelivr.net/npm/...` com versão fixa, no padrão de `_garantirPdfJs()` (`js/app.js:11350`).
- Falha ao carregar biblioteca (erro ou timeout de 10 s) → mensagem exata: **"Não foi possível carregar o gerador de códigos. Verifique a conexão com a internet e tente novamente."** Nunca imprimir etiqueta ou documento com código ausente ou quebrado.
- A tela de Expedição não depende das bibliotecas e funciona sem internet.
- Conteúdo dos códigos: documento = `26001`; volume = `26001-2-3` (só dígitos e hífen).
- O status do pedido **nunca** muda por causa de etiqueta ou conferência.
- Persistência em `localStorage`. Pedidos via `db` + `syncDB()`. Configuração da etiqueta na chave `sc_etiqueta_cfg`.
- Interface em pt-BR com os componentes existentes: `toast`, `showAlert`, `showConfirm`, `.card`, `.btn`, `.btn-outline`, `.btn-sm`. Cores novas como tokens CSS.
- Comentários em português sem acento. Ao tocar scripts/HTML, trocar o cache-busting de `?v=20261102a` para `?v=20261107a` nas páginas alteradas.
- Unidades do modelo de etiqueta sempre em **mm**. Grade de 1 mm.

## Review Focus

- **Scanner que manda espaço/CR extra ou texto com zeros à esquerda** (`026001`): `lerCodigo` deve aparar espaços e tratar `026001` como pedido 26001. Teste na Task 1.
- **Etiqueta antiga após mudar a quantidade de volumes** (bipar `26001-2-3` quando o pedido agora tem 4 volumes): deve dar "etiqueta desatualizada", e não conferir. Teste na Task 4.
- **Cliente excluído ou sem endereço/telefone:** a etiqueta imprime com os campos vazios e não quebra. Teste na Task 3.
- **Configuração salva corrompida ou de versão antiga** em `sc_etiqueta_cfg`: o editor abre com o modelo padrão e não fica em branco. Teste na Task 2.
- **Internet caiu no meio do uso:** imprimir etiqueta ou OS mostra a mensagem de conexão e não chama `print`. Testes nas Tasks 5 e 8.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `js/etiquetas-core.js` (criar) | Funções puras: códigos, formatos, campos, modelo padrão, ajuste ao formato, avisos de legibilidade, config, valores do pedido, HTML da etiqueta, regras de conferência. UMD como `js/importador-core.js` (`module.exports` + `window.EtiquetasCore`). |
| `tests/etiquetas-core.test.js` (criar) | Testes do core. |
| `js/etiquetas-render.js` (criar) | Carregar JsBarcode/qrcode-generator, gerar SVG, preencher códigos dos documentos, imprimir etiquetas via iframe, mensagem de conexão. |
| `js/etiquetas-editor.js` (criar) | Editor drag and drop do card "Etiquetas" em `empresa.html`. |
| `js/expedicao.js` (criar) | Tela de Expedição: leitura, conferência, consulta, sons. |
| `expedicao.html` (criar) | Página da Expedição. |
| `empresa.html`, `pedidos.html`, `pcp.html`, `os.html`, `proposta.html`, `index.html` (modificar) | Carregar os scripts novos; card do editor em `empresa.html`. |
| `js/app.js` (modificar) | Permissão/menu `expedicao`, botões "Imprimir etiquetas", marcação no card, preservação de `volumes`/`conferencia` em `salvarPedido`, reset em `voltarPedidoParaOrcamento`, ícone na timeline, códigos na OS/Proposta. |
| `css/style.css` (modificar) | Estilos do editor, da Expedição, dos badges e do código nos documentos. |
| `tests/e2e/etiquetas-*.spec.js`, `tests/e2e/expedicao.spec.js` (criar) | Testes de tela. |

Para descobrir em quais páginas os cards do Kanban e a lista de pedidos aparecem, procure por `id="kanban-board"` e `id="tb-pedidos"` nos `.html`. Toda página que renderiza esses elementos precisa carregar `etiquetas-core.js` e `etiquetas-render.js` **antes** de `app.js`.

---

### Task 1: Core — formato e leitura do código

**Files:**
- Create: `js/etiquetas-core.js`
- Create: `tests/etiquetas-core.test.js`
- Commit também: `Docs/superpowers/specs/2026-11-07-etiquetas-pedido-design.md` e este plano

**Interfaces:**
- Produces: `montarCodigoVolume(pedidoId: number, volume: number, total: number) -> string`; `lerCodigo(texto: string) -> {tipo:'pedido', pedidoId} | {tipo:'volume', pedidoId, volume, total} | {tipo:'invalido'}`. Módulo exportado como `module.exports` e `window.EtiquetasCore`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/etiquetas-core.js');

test('montarCodigoVolume usa so digitos e hifen', () => {
    assert.strictEqual(E.montarCodigoVolume(26001, 2, 3), '26001-2-3');
    assert.strictEqual(E.montarCodigoVolume(26001, 1, 1), '26001-1-1');
});

test('lerCodigo reconhece documento e volume', () => {
    assert.deepStrictEqual(E.lerCodigo('26001'), { tipo: 'pedido', pedidoId: 26001 });
    assert.deepStrictEqual(E.lerCodigo(' 26001-2-3 \r\n'), { tipo: 'volume', pedidoId: 26001, volume: 2, total: 3 });
    assert.deepStrictEqual(E.lerCodigo('026001'), { tipo: 'pedido', pedidoId: 26001 });
});

test('lerCodigo recusa lixo e volume fora do total', () => {
    for (const t of ['', '   ', 'abc', '26001-0-3', '26001-4-3', '26001-1-0', '26001-2', '26001/2/3', null, undefined]) {
        assert.deepStrictEqual(E.lerCodigo(t), { tipo: 'invalido' }, JSON.stringify(t));
    }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/etiquetas-core.test.js`
Expected: FAIL com `Cannot find module '../js/etiquetas-core.js'`

- [ ] **Step 3: Implement** `montarCodigoVolume` e `lerCodigo` em `js/etiquetas-core.js`, com a mesma casca UMD de `js/importador-core.js` (`(function (raiz) { ... })(typeof window !== 'undefined' ? window : null)`, exportando `api` em `module.exports` e `raiz.EtiquetasCore`). Regex `^(\d+)(?:-(\d+)-(\d+))?$` sobre o texto aparado; números via `parseInt(x, 10)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/etiquetas-core.test.js`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add js/etiquetas-core.js tests/etiquetas-core.test.js Docs/superpowers/specs/2026-11-07-etiquetas-pedido-design.md Docs/superpowers/plans/2026-11-07-etiquetas-pedido.md
git commit -m "feat(etiquetas): formato e leitura do codigo de pedido e volume"
```

---

### Task 2: Core — formatos, campos, modelo padrão, ajuste, avisos e config

**Files:**
- Modify: `js/etiquetas-core.js`
- Test: `tests/etiquetas-core.test.js`

**Interfaces:**
- Produces:
  - `FORMATOS_ETIQUETA: Array<{id, label, largura_mm, altura_mm}>`, com ids `'100x50','100x100','100x150','60x40','50x30'`, nessa ordem. O tamanho personalizado é `formato: 'custom'`.
  - `CAMPOS_ETIQUETA_PEDIDO: Array<{campo, label}>`, com campos `numero, cliente, endereco, telefone, entrega, vendedor, status, ambientes, observacoes, volume`, nessa ordem, e labels `Nº do pedido, Cliente, Endereço, Telefone, Data de entrega, Vendedor, Status, Qtd. de ambientes, Observações, Volume`.
  - `TIPOS_ELEMENTO = ['campo','texto','logo','linha','barcode','qrcode']`.
  - Elemento: `{ id: string, tipo, campo?, texto?, x_mm, y_mm, w_mm, h_mm, fonte_pt?, negrito?, alinhamento?: 'esq'|'centro'|'dir', mostrar_rotulo?: boolean }`.
  - Modelo: `{ formato: string, largura_mm, altura_mm, elementos: Elemento[] }`.
  - `modeloPadraoPedido(largura_mm = 100, altura_mm = 50) -> Modelo`
  - `ajustarAoFormato(modelo, largura_mm, altura_mm) -> { modelo, ajustados: string[] }` (ids movidos ou encolhidos; não muta a entrada)
  - `encaixarNaGrade(mm: number) -> number` (arredonda para 1 mm, mínimo 0)
  - `avisosLegibilidade(elemento, conteudo: string) -> string[]`
  - `lerConfigEtiquetas(json: string|null) -> { modelos: { pedido: Modelo } }`

- [ ] **Step 1: Write the failing tests**

```js
const dentro = (m) => m.elementos.every(e => e.x_mm >= 0 && e.y_mm >= 0 && e.x_mm + e.w_mm <= m.largura_mm && e.y_mm + e.h_mm <= m.altura_mm);

test('formatos e campos padrao', () => {
    assert.deepStrictEqual(E.FORMATOS_ETIQUETA.map(f => f.id), ['100x50', '100x100', '100x150', '60x40', '50x30']);
    assert.deepStrictEqual(E.CAMPOS_ETIQUETA_PEDIDO.map(c => c.campo),
        ['numero', 'cliente', 'endereco', 'telefone', 'entrega', 'vendedor', 'status', 'ambientes', 'observacoes', 'volume']);
});

test('modelo padrao 100x50 traz os elementos combinados e cabe na etiqueta', () => {
    const m = E.modeloPadraoPedido(100, 50);
    assert.strictEqual(m.formato, '100x50');
    const chaves = m.elementos.map(e => e.tipo === 'campo' ? e.campo : e.tipo).sort();
    assert.deepStrictEqual(chaves, ['barcode', 'cliente', 'endereco', 'entrega', 'numero', 'qrcode', 'volume']);
    assert.ok(dentro(m));
    assert.strictEqual(new Set(m.elementos.map(e => e.id)).size, m.elementos.length);
});

test('modelo padrao cabe em todos os formatos', () => {
    for (const f of E.FORMATOS_ETIQUETA) assert.ok(dentro(E.modeloPadraoPedido(f.largura_mm, f.altura_mm)), f.id);
});

test('ajustarAoFormato traz para dentro e encolhe o que nao cabe', () => {
    const m = E.modeloPadraoPedido(100, 150);
    const r = E.ajustarAoFormato(m, 50, 30);
    assert.ok(dentro(r.modelo));
    assert.ok(r.ajustados.length > 0);
    assert.strictEqual(r.modelo.largura_mm, 50);
    assert.strictEqual(m.largura_mm, 100, 'nao muta a entrada');
});

test('encaixarNaGrade arredonda para 1 mm', () => {
    assert.strictEqual(E.encaixarNaGrade(12.4), 12);
    assert.strictEqual(E.encaixarNaGrade(12.6), 13);
    assert.strictEqual(E.encaixarNaGrade(-3), 0);
});

test('avisosLegibilidade de barras e QR', () => {
    // '26001-2-3' tem 9 caracteres: 11*(9+2)+13+20 = 154 modulos; 0,25 mm => 38,5 mm
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'barcode', w_mm: 45, h_mm: 12 }, '26001-2-3').length, 0);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'barcode', w_mm: 30, h_mm: 12 }, '26001-2-3').length, 1);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'barcode', w_mm: 45, h_mm: 6 }, '26001-2-3').length, 1);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'qrcode', w_mm: 20, h_mm: 20 }, '26001-2-3').length, 0);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'qrcode', w_mm: 12, h_mm: 20 }, '26001-2-3').length, 1);
    assert.strictEqual(E.avisosLegibilidade({ tipo: 'campo', campo: 'cliente', w_mm: 5, h_mm: 5 }, 'x').length, 0);
});

test('lerConfigEtiquetas devolve o padrao para vazio, lixo ou formato antigo', () => {
    for (const bruto of [null, '', '{', '[]', '{"modelos":{}}', '{"modelos":{"pedido":{"elementos":"x"}}}']) {
        const cfg = E.lerConfigEtiquetas(bruto);
        assert.strictEqual(cfg.modelos.pedido.formato, '100x50', bruto);
        assert.ok(cfg.modelos.pedido.elementos.length > 0);
    }
    const salvo = { modelos: { pedido: E.modeloPadraoPedido(60, 40) } };
    assert.strictEqual(E.lerConfigEtiquetas(JSON.stringify(salvo)).modelos.pedido.formato, '60x40');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/etiquetas-core.test.js`
Expected: FAIL nos 7 testes novos (`E.FORMATOS_ETIQUETA` undefined etc.)

- [ ] **Step 3: Implement** as interfaces acima.
  - **Layout padrão 100×50:** à esquerda (x=3, w≈58) ficam `numero` (negrito, 14 pt), `cliente` (11 pt), `endereco` (9 pt, 2 linhas), `entrega` (9 pt) e `volume` (negrito, 12 pt). À direita fica `qrcode` (x≈64, 33×33 mm). Embaixo, à esquerda, fica `barcode` (≥ 40 mm de largura, ≥ 10 mm de altura). Em outros tamanhos, use o mesmo layout escalado proporcionalmente e depois passe por `ajustarAoFormato`.
  - Os ids dos elementos são strings únicas (ex.: `'e' + contador`).
  - `formato` é o id do preset quando largura e altura batem com um preset; senão é `'custom'`.
  - Mensagens dos avisos, exatamente:
    - `Código de barras estreito demais para o scanner: use pelo menos ${Math.ceil(min)} mm de largura.`
    - `Código de barras baixo demais: use pelo menos 8 mm de altura.`
    - `QR Code pequeno demais para o scanner: use pelo menos 15 mm.`
  - Módulos de Code128 = `11*(n+2)+13+20`, onde `n` é o número de caracteres do conteúdo; largura mínima do módulo = 0,25 mm.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/etiquetas-core.test.js`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add js/etiquetas-core.js tests/etiquetas-core.test.js
git commit -m "feat(etiquetas): formatos, modelo padrao, ajuste ao formato e avisos de legibilidade"
```

---

### Task 3: Core — valores do pedido e HTML da etiqueta

O mesmo HTML serve para a pré-visualização do editor e para a impressão (o que se vê é o que sai).

**Files:**
- Modify: `js/etiquetas-core.js`
- Test: `tests/etiquetas-core.test.js`

**Interfaces:**
- Consumes: `Modelo`/`Elemento` da Task 2.
- Produces:
  - `ROTULOS_CAMPO = { numero: 'PEDIDO #', volume: 'VOLUME ', entrega: 'Entrega: ', telefone: 'Tel: ' }`. Usado quando `mostrar_rotulo !== false`.
  - `valoresEtiquetaPedido(pedido, cliente|null, volume: number, total: number, logoUrl: string) -> { numero, cliente, endereco, telefone, entrega, vendedor, status, ambientes, observacoes, volume, logo }` (todos string).
  - `pedidoExemplo() -> { pedido, cliente }` (pedido 26001, cliente "Maria Souza", end "R. das Flores, 120 – Centro", tel "(11) 98888-7777", data_entrega "2026-11-14", vendedor_nome "Carlos", status "Pronto p/ Instalação", 3 ambientes, volumes 3).
  - `htmlEtiqueta(modelo, valores, svgs: { barcode?: string, qrcode?: string }) -> string`.

- [ ] **Step 1: Write the failing tests**

```js
test('valoresEtiquetaPedido monta os textos', () => {
    const { pedido, cliente } = E.pedidoExemplo();
    const v = E.valoresEtiquetaPedido(pedido, cliente, 2, 3, 'logo.png');
    assert.strictEqual(v.numero, '26001');
    assert.strictEqual(v.cliente, 'Maria Souza');
    assert.strictEqual(v.entrega, '14/11/2026');
    assert.strictEqual(v.volume, '2/3');
    assert.strictEqual(v.ambientes, '3');
    assert.strictEqual(v.logo, 'logo.png');
});

test('valoresEtiquetaPedido aguenta cliente excluido e campos vazios', () => {
    const v = E.valoresEtiquetaPedido({ id: 26002, clienteNome: 'Joao' }, null, 1, 1, '');
    assert.strictEqual(v.cliente, 'Joao');
    assert.strictEqual(v.endereco, '');
    assert.strictEqual(v.telefone, '');
    assert.strictEqual(v.entrega, '');
    assert.strictEqual(v.ambientes, '0');
});

test('htmlEtiqueta posiciona em mm, escapa texto e insere os SVGs', () => {
    const m = { formato: 'custom', largura_mm: 80, altura_mm: 40, elementos: [
        { id: 'a', tipo: 'campo', campo: 'cliente', x_mm: 5, y_mm: 2, w_mm: 40, h_mm: 6, fonte_pt: 10 },
        { id: 'b', tipo: 'campo', campo: 'numero', x_mm: 5, y_mm: 10, w_mm: 40, h_mm: 6, fonte_pt: 12, negrito: true },
        { id: 'c', tipo: 'barcode', x_mm: 5, y_mm: 20, w_mm: 45, h_mm: 12 },
        { id: 'd', tipo: 'qrcode', x_mm: 55, y_mm: 5, w_mm: 20, h_mm: 20 }
    ] };
    const v = { cliente: '<b>Ana</b>', numero: '26001' };
    const html = E.htmlEtiqueta(m, v, { barcode: '<svg id="bc"></svg>', qrcode: '<svg id="qr"></svg>' });
    assert.match(html, /width:80mm/);
    assert.match(html, /left:5mm/);
    assert.match(html, /&lt;b&gt;Ana&lt;\/b&gt;/);
    assert.match(html, /PEDIDO #26001/);
    assert.match(html, /<svg id="bc">/);
    assert.match(html, /<svg id="qr">/);
    assert.match(html, /text-overflow:ellipsis|-webkit-line-clamp/);
});

test('htmlEtiqueta sem SVG mostra lugar reservado e respeita mostrar_rotulo', () => {
    const m = { formato: 'custom', largura_mm: 50, altura_mm: 30, elementos: [
        { id: 'a', tipo: 'campo', campo: 'numero', x_mm: 1, y_mm: 1, w_mm: 30, h_mm: 6, mostrar_rotulo: false },
        { id: 'b', tipo: 'barcode', x_mm: 1, y_mm: 10, w_mm: 45, h_mm: 10 }
    ] };
    const html = E.htmlEtiqueta(m, { numero: '26001' }, {});
    assert.doesNotMatch(html, /PEDIDO #/);
    assert.match(html, /etq-cod-ph/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/etiquetas-core.test.js`
Expected: FAIL nos 4 testes novos

- [ ] **Step 3: Implement**
  - `endereco` e `telefone` vêm do cliente (`end`, `tel`). `cliente` vem de `cliente?.nome || pedido.clienteNome`. `vendedor` vem de `vendedor_nome || arq_nome`. `entrega` converte `YYYY-MM-DD` para `DD/MM/AAAA` por split de string, sem `Date`, para evitar erro de fuso. `ambientes` é `String((pedido.ambientes||[]).length)`.
  - `htmlEtiqueta`:
    - raiz `<div class="etq" style="position:relative;width:Lmm;height:Amm;overflow:hidden;background:#fff;color:#000;font-family:Arial,sans-serif">`;
    - cada elemento em `position:absolute;left/top/width/height` em mm, com `overflow:hidden`;
    - texto de uma linha com `white-space:nowrap;text-overflow:ellipsis`;
    - `endereco` e `observacoes` com `-webkit-line-clamp` igual ao número de linhas que cabem em `h_mm` para a `fonte_pt` (1 pt ≈ 0,3528 mm, entrelinha 1,15);
    - `linha` = `border-top:0.3mm solid #000`;
    - `logo` = `<img src="..." style="width:100%;height:100%;object-fit:contain">`;
    - código ausente = `<div class="etq-cod-ph">`;
    - escape próprio de `& < > " '`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/etiquetas-core.test.js`
Expected: PASS (14 testes)

- [ ] **Step 5: Commit**

```bash
git add js/etiquetas-core.js tests/etiquetas-core.test.js
git commit -m "feat(etiquetas): valores do pedido e HTML da etiqueta"
```

---

### Task 4: Core — regras de conferência

**Files:**
- Modify: `js/etiquetas-core.js`
- Test: `tests/etiquetas-core.test.js`

**Interfaces:**
- Consumes: `lerCodigo` (Task 1).
- Produces (os campos do pedido são `pedido.volumes: number|null` e `pedido.conferencia: { volumes_conferidos: number[], concluida_em: number|null, conferido_por: string|null }`):
  - `conferenciaVazia() -> Conferencia`
  - `avaliarLeitura(texto, ativoId: number|null, pedidos: Pedido[]) -> Resultado`, onde `Resultado.tipo` é um destes:
    - `'invalido'`
    - `'nao_encontrado'` `{pedidoId}`
    - `'abrir'` `{pedidoId}`: documento de pedido que já tem volumes
    - `'sem_etiquetas'` `{pedidoId}`: pedido existe, mas `volumes` é nulo
    - `'consulta'` `{pedidoId}`: volume bipado sem pedido ativo
    - `'outro_pedido'` `{pedidoId, ativoId}`
    - `'etiqueta_desatualizada'` `{pedidoId}`: total do código ≠ `pedido.volumes`
    - `'repetido'` `{pedidoId, volume}`
    - `'conferir'` `{pedidoId, volume}`
  - `marcarVolume(pedido, volume, usuarioNome, agora) -> { concluiu: boolean }` (muta o pedido)
  - `zerarConferencia(pedido, motivo, agora) -> boolean` (true se havia progresso; muta)
  - `alterarVolumes(pedido, novoTotal, agora) -> { zerou: boolean }` (muta)
  - `temConferenciaIniciada(pedido) -> boolean`
  - `marcacaoConferencia(pedido) -> { texto, cls } | null`
  - Evento de timeline: `{ status: 'Conferência', data: agora, label }`

- [ ] **Step 1: Write the failing tests**

```js
const ped = (extra) => Object.assign({ id: 26001, volumes: 3, conferencia: E.conferenciaVazia(), timeline: [] }, extra);

test('avaliarLeitura cobre todos os casos', () => {
    const p = ped(); const q = ped({ id: 26002 }); const semEtq = ped({ id: 26003, volumes: null });
    const lista = [p, q, semEtq];
    assert.strictEqual(E.avaliarLeitura('xx', null, lista).tipo, 'invalido');
    assert.deepStrictEqual(E.avaliarLeitura('99999', null, lista), { tipo: 'nao_encontrado', pedidoId: 99999 });
    assert.deepStrictEqual(E.avaliarLeitura('26001', null, lista), { tipo: 'abrir', pedidoId: 26001 });
    assert.deepStrictEqual(E.avaliarLeitura('26003', null, lista), { tipo: 'sem_etiquetas', pedidoId: 26003 });
    assert.deepStrictEqual(E.avaliarLeitura('26001-2-3', null, lista), { tipo: 'consulta', pedidoId: 26001 });
    assert.deepStrictEqual(E.avaliarLeitura('26002-1-3', 26001, lista), { tipo: 'outro_pedido', pedidoId: 26002, ativoId: 26001 });
    assert.deepStrictEqual(E.avaliarLeitura('26001-2-4', 26001, lista), { tipo: 'etiqueta_desatualizada', pedidoId: 26001 });
    assert.deepStrictEqual(E.avaliarLeitura('26001-2-3', 26001, lista), { tipo: 'conferir', pedidoId: 26001, volume: 2 });
    p.conferencia.volumes_conferidos = [2];
    assert.deepStrictEqual(E.avaliarLeitura('26001-2-3', 26001, lista), { tipo: 'repetido', pedidoId: 26001, volume: 2 });
    assert.deepStrictEqual(E.avaliarLeitura('26002', 26001, lista), { tipo: 'abrir', pedidoId: 26002 });
});

test('marcarVolume conclui no ultimo volume e registra na timeline', () => {
    const p = ped();
    assert.deepStrictEqual(E.marcarVolume(p, 3, 'Ana', 1000), { concluiu: false });
    assert.deepStrictEqual(E.marcarVolume(p, 1, 'Ana', 2000), { concluiu: false });
    assert.deepStrictEqual(E.marcacaoConferencia(p), { texto: '2/3 conferidos', cls: 'badge-conferindo' });
    assert.deepStrictEqual(E.marcarVolume(p, 2, 'Ana', 3000), { concluiu: true });
    assert.deepStrictEqual(p.conferencia, { volumes_conferidos: [1, 2, 3], concluida_em: 3000, conferido_por: 'Ana' });
    assert.deepStrictEqual(p.timeline.at(-1), { status: 'Conferência', data: 3000, label: 'Conferido na expedição por Ana — 3 volume(s)' });
    assert.deepStrictEqual(E.marcacaoConferencia(p), { texto: '✓ Conferido', cls: 'badge-conferido' });
    assert.strictEqual(p.status, undefined, 'status nao e tocado');
});

test('alterarVolumes zera a conferencia so quando ha progresso e o total muda', () => {
    const p = ped();
    assert.deepStrictEqual(E.alterarVolumes(p, 4, 10), { zerou: false });
    assert.strictEqual(p.volumes, 4);
    E.marcarVolume(p, 1, 'Ana', 20);
    assert.deepStrictEqual(E.alterarVolumes(p, 4, 30), { zerou: false });
    assert.deepStrictEqual(E.alterarVolumes(p, 2, 40), { zerou: true });
    assert.deepStrictEqual(p.conferencia, E.conferenciaVazia());
    assert.deepStrictEqual(p.timeline.at(-1), { status: 'Conferência', data: 40, label: 'Conferência zerada: volumes alterados de 4 para 2' });
});

test('zerarConferencia sem progresso nao escreve na timeline; pedido antigo sem campos', () => {
    const antigo = { id: 1 };
    assert.strictEqual(E.zerarConferencia(antigo, 'x', 1), false);
    assert.strictEqual(E.temConferenciaIniciada(antigo), false);
    assert.strictEqual(E.marcacaoConferencia(antigo), null);
    assert.strictEqual((antigo.timeline || []).length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/etiquetas-core.test.js`
Expected: FAIL nos 4 testes novos

- [ ] **Step 3: Implement** as funções acima.
  - `pedidos.find` por `p.id == pedidoId` (ids antigos podem ser string).
  - `marcarVolume` cria `timeline`/`conferencia` se não existirem e mantém `volumes_conferidos` ordenado e sem repetição.
  - `zerarConferencia` registra `Conferência zerada: ${motivo}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS (todos, incluindo os testes antigos do importador)

- [ ] **Step 5: Commit**

```bash
git add js/etiquetas-core.js tests/etiquetas-core.test.js
git commit -m "feat(etiquetas): regras de conferencia de volumes"
```

---

### Task 5: Renderização dos códigos, falha de conexão e código na OS/Proposta

**Files:**
- Create: `js/etiquetas-render.js`
- Modify: `js/app.js` (`gerarHTMLOS` ~6466, `gerarHTMLProposta` ~6572, `abrirDocModal` ~6307, `_refrescarDocModalAtual` ~6295, `imprimirDocModal` ~6342, `renderOS` ~6491, `renderProposta` ~6614)
- Modify: `os.html`, `proposta.html`, e toda página que abre o modal de documento (procure `abrirOS(`/`gerarProposta(` nos HTML/JS para saber quais). Todas carregam `etiquetas-core.js` e `etiquetas-render.js` antes de `app.js`, e o cache-busting muda para `?v=20261107a`.
- Modify: `css/style.css` (`.sc-codigo-doc`, `.sc-codigo-falha`)
- Test: `tests/e2e/etiquetas-documentos.spec.js`

**Interfaces:**
- Consumes: `EtiquetasCore`.
- Produces (globais em `window`):
  - `MSG_FALHA_CONEXAO_CODIGOS` (a string exata das Global Constraints).
  - `garantirLibsCodigo() -> Promise<void>`: carrega `https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js` e `https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js`. Rejeita com `Error(MSG_FALHA_CONEXAO_CODIGOS)` em `onerror` ou após 10 s. Uma promessa em cache que, se rejeitar, é descartada para permitir nova tentativa.
  - `svgCodigoBarras(texto) -> string` (Code128, `displayValue:false`, `margin:0`, svg com `width="100%" height="100%" preserveAspectRatio="none"`).
  - `svgQrCode(texto) -> string` (`qrcode(0,'M')`, `createSvgTag({ scalable: true, margin: 0 })`).
  - `htmlCodigoDocumento(pedidoId) -> string`: `<div class="sc-codigo-doc" data-codigo="26001"></div>`.
  - `preencherCodigosDocumento(container) -> Promise<boolean>`: preenche cada `.sc-codigo-doc` com o código de barras e o número embaixo, e marca `data-status="ok"`. Em falha, coloca `<div class="sc-codigo-falha no-print">⚠ ${MSG}</div>`, marca `data-status="falha"` e devolve false.
  - `documentoProntoParaImprimir(container) -> Promise<boolean>`: chama `preencherCodigosDocumento`; se false, `await showAlert(MSG, '📡')` e devolve false.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/etiquetas-documentos.spec.js`, seguindo o padrão de `tests/e2e/melhorias-conferencia.spec.js` (`entrar(page, BASE)`, semear `sc_ped`/`sc_cli`):
  - `'OS mostra o codigo de barras do pedido'`: semeia o pedido 26001 em "Na Costura", abre `pcp.html`, clica 📋 no card e espera `#doc-modal-paper .sc-codigo-doc[data-status="ok"] svg` visível e o texto `26001` dentro de `.sc-codigo-doc`.
  - `'Proposta em Orcamento ja mostra o codigo'`: pedido 26004 em "Orçamento", `pedidos.html`, botão 📄, mesmo `expect`.
  - `'sem internet: mensagem de conexao e nao imprime'`: `await page.route('**/cdn.jsdelivr.net/**', r => r.abort())`, depois `page.addInitScript(() => { window.print = () => { window.__imprimiu = true; }; })` antes de navegar. Abre a OS e espera o texto `Não foi possível carregar o gerador de códigos. Verifique a conexão com a internet e tente novamente.` em `.sc-codigo-falha`. Clica em "🖨️ Imprimir / PDF" e espera o mesmo texto no `#sc-modal-msg`. Por fim, `expect(await page.evaluate(() => window.__imprimiu)).toBeFalsy()`.

- [ ] **Step 2: Run to verify it fails**

Run (servidor e Playwright conforme `tests/e2e/README.md`):
`cd /tmp/sctech-e2e && NODE_PATH=/tmp/sctech-e2e/node_modules BASE=http://localhost:8131 TESTDIR=<projeto>/tests/e2e npx playwright test --config=repo.config.js etiquetas-documentos`
Expected: FAIL (`.sc-codigo-doc` não existe)

- [ ] **Step 3: Implement** `js/etiquetas-render.js` com as interfaces acima e faça os ganchos em `app.js`:
  - `gerarHTMLOS`: `htmlCodigoDocumento(ped.id)` dentro de `.os-meta`, após "OS Nº".
  - `gerarHTMLProposta`: o mesmo, dentro de `.proposta-info`, após "Nº".
  - `abrirDocModal`, `_refrescarDocModalAtual`, `renderOS`, `renderProposta`: depois de pôr o HTML, `preencherCodigosDocumento(container)` (sem `await`).
  - `imprimirDocModal` vira `async` e começa com `if (!await documentoProntoParaImprimir(paper)) return;`.
  - Em `os.html` e `proposta.html`, o botão `window.print()` passa a chamar `imprimirPaginaDocumento()`, uma função nova em `etiquetas-render.js` que valida `#os-container`/`#proposta-container` com `documentoProntoParaImprimir` antes de `window.print()`.

- [ ] **Step 4: Run to verify it passes**

Run: o mesmo comando do Step 2.
Expected: PASS (3 testes). Rode também a suíte e2e inteira e confirme que nada que já passava quebrou.

- [ ] **Step 5: Commit**

```bash
git add js/etiquetas-render.js js/app.js css/style.css os.html proposta.html pedidos.html pcp.html index.html tests/e2e/etiquetas-documentos.spec.js
git commit -m "feat(etiquetas): codigo de barras na OS e na proposta, com aviso de falha de conexao"
```

(Ajuste a lista do `git add` às páginas que você realmente alterou.)

---

### Task 6: Pedido guarda volumes e conferência; reset ao voltar para Orçamento

**Files:**
- Modify: `js/app.js` (`salvarPedido` ~5781, `voltarPedidoParaOrcamento` ~5858, `verTimeline` ~2475)
- Test: `tests/e2e/etiquetas-pedido-dados.spec.js`

**Interfaces:**
- Consumes: `EtiquetasCore.zerarConferencia` (Task 4).
- Produces: `pedido.volumes` e `pedido.conferencia` sobrevivem a `salvarPedido`. Voltar para Orçamento chama `zerarConferencia(ped, 'pedido voltou para Orçamento', Date.now())` e mantém `volumes`. `verTimeline` mostra o ícone `🏷️` para `status: 'Conferência'`.

- [ ] **Step 1: Write the failing e2e test** com dois testes:
  - `'voltar para Orcamento zera a conferencia e registra'`: semeia o pedido 26001 em "Pronto p/ Instalação" com `volumes: 3` e `conferencia: { volumes_conferidos: [1,2,3], concluida_em: 1, conferido_por: 'Ana' }`. Em `pcp.html`, aciona `voltarPedidoParaOrcamento(26001)` via `page.evaluate` e confirma o diálogo. Depois lê `sc_ped`: `conferencia.volumes_conferidos` deve ser `[]`, `volumes` deve ser `3` e o último item da timeline deve ter `label === 'Conferência zerada: pedido voltou para Orçamento'`.
  - `'editar e salvar o pedido preserva volumes'`: com o pedido 26001 em "Orçamento" e `volumes: 2`, abre `pedido.html` em edição (`sc_editando_id`), clica em salvar e confere `volumes === 2` e `conferencia` presente. Use um pedido semeado completo (ambientes calculados, vendedor), como nos specs que já salvam pedido. Procure em `tests/e2e/` um spec que chama `salvarPedido` e reutilize a mesma semente.

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL (`conferencia` intacta; `volumes` some depois de salvar)

- [ ] **Step 3: Implement**
  - No bloco `if (index >= 0)` de `salvarPedido`, copie `volumes` e `conferencia` do pedido anterior, junto com `timeline`.
  - Em `voltarPedidoParaOrcamento`, chame `EtiquetasCore.zerarConferencia(...)` logo depois do `push` de "Voltou para Orçamento".
  - Em `verTimeline`, acrescente `'Conferência': '🏷️'` a `STATUS_ICONS`.
  - `pedido.html` e as páginas que chamam `voltarPedidoParaOrcamento` precisam carregar `etiquetas-core.js` antes de `app.js`.

- [ ] **Step 4: Run to verify it passes**

Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add js/app.js pedido.html tests/e2e/etiquetas-pedido-dados.spec.js
git commit -m "feat(etiquetas): pedido preserva volumes e zera conferencia ao voltar para orcamento"
```

---

### Task 7: Editor de etiquetas (drag and drop) em Configurar Empresa

**Files:**
- Create: `js/etiquetas-editor.js`
- Modify: `empresa.html` (card novo depois de "Cards da Página Inicial"; carregar `etiquetas-core.js`, `etiquetas-render.js` e `etiquetas-editor.js`; chamar `iniciarEditorEtiquetas()` no `DOMContentLoaded`)
- Modify: `css/style.css` (classes `etq-editor-*`)
- Test: `tests/e2e/etiquetas-editor.spec.js`

**Interfaces:**
- Consumes: `EtiquetasCore` (Tasks 2–3), `garantirLibsCodigo`, `svgCodigoBarras`, `svgQrCode`, `MSG_FALHA_CONEXAO_CODIGOS` (Task 5), `imprimirEtiquetasHTML` (Task 8; o botão "Imprimir teste" só é ligado na Task 8).
- Produces: `iniciarEditorEtiquetas()`; `salvarModeloEtiqueta()` (grava `sc_etiqueta_cfg` e mostra `toast('Etiqueta salva!')`); `restaurarModeloEtiqueta()` (pede `showConfirm` e volta ao `modeloPadraoPedido` do formato atual).

**Estrutura do card** `<div class="card" id="emp-etiquetas-card">`: título "🏷️ Etiquetas de Pedido", subtítulo curto, e `#etq-editor` com três colunas.
- **Paleta** `#etq-paleta`: um `.etq-chip[data-tipo][data-campo]` para cada campo de `CAMPOS_ETIQUETA_PEDIDO` e para Logo, Texto livre, Linha, Código de barras e QR Code.
- **Palco** `#etq-palco`: a etiqueta desenhada com `htmlEtiqueta` + os valores de `pedidoExemplo()` (volume 1/3), numa escala px/mm que caiba na largura disponível (máx. 6 px/mm), com grade de 1 mm ao fundo. Cada elemento recebe uma camada clicável `.etq-el[data-id]` por cima, com uma alça de redimensionar `.etq-alca` no canto inferior direito.
- **Propriedades** `#etq-props`:
  - Para o elemento selecionado: X, Y, Largura e Altura (mm); para texto, fonte (pt), negrito, alinhamento e "mostrar rótulo"; para texto livre, o conteúdo. Botão "Remover".
  - Abaixo ficam os avisos de `avisosLegibilidade` do elemento (conteúdo `'26001-1-3'`).
- **Barra superior:** `<select id="etq-formato">` com os presets e "Personalizado", campos `#etq-largura`/`#etq-altura` (visíveis só no personalizado), e os botões "Salvar etiqueta", "Restaurar padrão" e "Imprimir teste".

**Comportamento:**
- Arrastar da paleta (Pointer Events) e soltar no palco cria o elemento na posição solta, já na grade. Tamanhos iniciais: texto 40×6; barcode 45×12; qrcode 20×20; logo 20×10; linha 40×1.
- Mover e redimensionar com o ponteiro, sempre com `encaixarNaGrade` e limitado à etiqueta. Setas movem 1 mm; Delete remove o selecionado.
- Trocar o formato chama `ajustarAoFormato`. Se `ajustados.length`, mostra `toast('N elemento(s) foram ajustados para caber no novo tamanho', 'warning')`.
- Os códigos do palco usam os SVGs reais quando `garantirLibsCodigo()` resolve. Se falhar, o palco mostra o lugar reservado e uma faixa com `MSG_FALHA_CONEXAO_CODIGOS`; o resto do editor continua funcionando.
- Alterações não salvas ficam só na memória até "Salvar etiqueta".
- Permissão: com `temAcesso('configuracoes.empresa','completo')` falso, o editor fica só para ver (sem arrastar, salvar ou restaurar).

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/etiquetas-editor.spec.js`:
  - `'abre com o modelo padrao'`: com `sc_etiqueta_cfg` removido, abre `empresa.html` e espera 7 `.etq-el` no palco e `#etq-formato` com valor `100x50`.
  - `'arrastar campo da paleta cria elemento e salvar persiste'`: arrasta `.etq-chip[data-campo="telefone"]` até o centro do palco com `page.mouse` (down/move em passos/up). Espera 8 `.etq-el`, clica "Salvar etiqueta" e confere que `JSON.parse(localStorage.sc_etiqueta_cfg).modelos.pedido.elementos` tem um elemento com `campo === 'telefone'`, com x/y inteiros.
  - `'trocar para 50x30 mantem tudo dentro'`: seleciona `50x30` e confere no modelo salvo (depois de salvar) que todos os elementos estão dentro de 50×30.
  - `'aviso de QR pequeno'`: clica no `.etq-el` do QR, preenche a largura com `10` e espera o texto `QR Code pequeno demais para o scanner` em `#etq-props`.
  - `'sem internet o editor funciona e avisa'`: com o route abortando o jsdelivr, espera o texto da mensagem de conexão no card e 7 `.etq-el`.

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL (`#etq-editor` não existe)

- [ ] **Step 3: Implement** `js/etiquetas-editor.js`, o card e o CSS, conforme a estrutura e o comportamento acima.

- [ ] **Step 4: Run to verify it passes**

Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add js/etiquetas-editor.js empresa.html css/style.css tests/e2e/etiquetas-editor.spec.js
git commit -m "feat(etiquetas): editor drag and drop em Configurar Empresa"
```

---

### Task 8: Imprimir etiquetas por volume, botões e marcação no card

**Files:**
- Modify: `js/etiquetas-render.js`
- Modify: `js/app.js` (linha de ações em `renderDashboard` ~3053; card do Kanban ~6045 e card "Instalado" ~5998; `_pcpLinhaHTML` ~6199; badges junto de `badgeBaixa` no card e na linha)
- Modify: `js/etiquetas-editor.js` (ligar "Imprimir teste")
- Modify: `css/style.css` (`.badge-conferido`, `.badge-conferindo`, modal de volumes)
- Test: `tests/e2e/etiquetas-impressao.spec.js`

**Interfaces:**
- Consumes: Tasks 3, 4 e 5.
- Produces:
  - `imprimirEtiquetasHTML(paginas: string[], largura_mm, altura_mm) -> void`: cria um `<iframe>` oculto com documento próprio, `@page { size: Lmm Amm; margin: 0 }`, `body{margin:0}` e uma `.etq` por página (`page-break-after: always`). Chama `window._etqDispararImpressao(iframe)`, cujo padrão é `iframe.contentWindow.print()` e depois remove o iframe. Os testes substituem esse gancho.
  - `async imprimirEtiquetasDoPedido(pedidoId, somenteVolume?: number) -> boolean`:
    1. lê a config;
    2. `await garantirLibsCodigo()` (em falha: `showAlert(MSG,'📡')` e devolve false);
    3. monta uma página por volume com `htmlEtiqueta` + `valoresEtiquetaPedido`, usando o logo `getEmpresa().logo_base64`, ou a URL absoluta de `images/logo.png`;
    4. passa os SVGs de `montarCodigoVolume`;
    5. imprime.
  - `async abrirImpressaoEtiquetas(pedidoId)`: modal com:
    - quantidade de volumes (`#etq-qtd-volumes`, mín. 1, máx. 99, pré-preenchida com `pedido.volumes || 1`);
    - escolha "Todos os volumes" / "Só o volume [n]" (`#etq-so-volume`);
    - botão "Imprimir" (`#etq-btn-imprimir`).
    Ao confirmar: se a quantidade mudou e `temConferenciaIniciada`, pede `showConfirm('A conferência deste pedido será zerada porque a quantidade de volumes mudou. Continuar?', '⚠️', 'Continuar', 'Cancelar')`. Depois aplica `alterarVolumes`, chama `syncDB()`, `imprimirEtiquetasDoPedido` e re-renderiza a lista ou Kanban da página.
  - Permissão: `exigirPermissao('pedidos', 'visualizar')`.
  - Botão `🏷️` (title "Imprimir etiquetas") em toda linha/card de pedido com status diferente de "Orçamento": lista de `pedidos.html`, card do Kanban (inclusive "Instalado") e linha do modo lista do PCP.
  - Marcação: `EtiquetasCore.marcacaoConferencia(p)` vira `<span class="${cls}">${texto}</span>` ao lado de `badgeBaixa` no card do Kanban, na linha do PCP e na lista de pedidos.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/etiquetas-impressao.spec.js`. Em todos os testes, use `addInitScript`: `window._etqDispararImpressao = f => { window.__etq = [...f.contentDocument.querySelectorAll('.etq')].map(e => e.innerText); window.__etqHtml = f.contentDocument.documentElement.outerHTML; }`.
  - `'imprime 3 volumes e salva a quantidade'`: pedido 26001 "Na Costura" sem `volumes`. Em `pcp.html`, clica 🏷️, preenche `3`, clica Imprimir. Espera `window.__etq.length === 3`; `__etq[1]` contém `VOLUME 2/3` e `PEDIDO #26001`; `__etqHtml` contém `size: 100mm 50mm` e `<svg`; e `sc_ped` tem `volumes === 3`.
  - `'reimprimir so um volume'`: com `volumes: 3`, escolhe "Só o volume" 2. Espera `__etq.length === 1` contendo `VOLUME 2/3`.
  - `'mudar volumes com conferencia iniciada pede confirmacao e zera'`: `volumes: 3`, `volumes_conferidos: [1]`. Troca para 4 e confirma. Espera `volumes_conferidos` vazio e `volumes === 4`.
  - `'card mostra a marcacao de conferencia'`: um pedido concluído e outro parcial (2 de 3). Em `pcp.html`, espera os textos `✓ Conferido` e `2/3 conferidos`.
  - `'pedido em Orcamento nao tem botao de etiqueta'`: em `pedidos.html`, a linha do pedido em Orçamento não tem `button[title="Imprimir etiquetas"]`.
  - `'sem internet nao imprime'`: com o route abortando o jsdelivr, clica Imprimir. Espera a mensagem de conexão em `#sc-modal-msg` e `window.__etq` undefined.
  - `'imprimir teste no editor'`: em `empresa.html`, clica "Imprimir teste" e espera 1 etiqueta com `Maria Souza`.

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL (botão 🏷️ não existe)

- [ ] **Step 3: Implement** conforme as interfaces acima. Garanta que `pedidos.html` e `pcp.html` carregam `etiquetas-core.js` e `etiquetas-render.js`.

- [ ] **Step 4: Run to verify it passes**

Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add js/etiquetas-render.js js/etiquetas-editor.js js/app.js css/style.css pedidos.html pcp.html tests/e2e/etiquetas-impressao.spec.js
git commit -m "feat(etiquetas): impressao por volume, botao nos pedidos e marcacao de conferencia"
```

---

### Task 9: Tela de Expedição, menu e permissão

**Files:**
- Create: `expedicao.html` (mesma casca de `pedidos.html`: sidebar, `.main`, `.header` "📦 Expedição"; carrega `etiquetas-core.js`, `app.js` e `expedicao.js`)
- Create: `js/expedicao.js`
- Modify: `js/app.js`:
  - `MODULOS_PERMISSAO` ganha `{ key: 'expedicao', label: 'Expedição', subs: [] }` depois de `producao`;
  - `SIDEBAR_MODULOS` ganha `{ href: 'expedicao.html', icon: 'expedicao', label: 'Expedição', permModulo: 'expedicao' }` depois de Produção;
  - `NAV_ICON_PATHS.expedicao` recebe o desenho de uma caixa com check;
  - `PAGINA_MODULO['expedicao.html'] = 'expedicao'`;
  - `papeisPadrao`: Produção/Costura e Instalação ganham `expedicao: 'completo'`;
  - em `migrarPermissoesSalvas`, todo papel salvo sem a chave `expedicao` recebe o mesmo nível que tem em `producao` (ou `sem_acesso`).
- Modify: `css/style.css` (classes `exp-*`)
- Test: `tests/e2e/expedicao.spec.js`

**Interfaces:**
- Consumes: `avaliarLeitura`, `marcarVolume`, `valoresEtiquetaPedido`, `montarCodigoVolume` (Tasks 1–4); `getUsuarioLogado`, `syncDB`, `abrirOS`, `escapeHtml`, `temAcesso` (`app.js`).
- Produces: `iniciarExpedicao()` e `processarLeituraExpedicao(texto)`. O pedido ativo fica em `sessionStorage['sc_exp_ativo']`.

**Tela:**
- Campo `#exp-leitura` grande e sempre focado (volta o foco no `blur` e depois de cada leitura). `Enter` chama `processarLeituraExpedicao(valor)` e limpa o campo.
- Faixa de resultado `#exp-resultado` com classe `ok`, `erro` ou `aviso`.
- Painel do pedido `#exp-pedido`: número, cliente, endereço, telefone, entrega, botão "Ver OS" (`abrirOS`) e a lista `#exp-volumes` com um `.exp-vol[data-vol]` por volume (`✅ Volume 2/3` ou `⬜ Volume 2/3`).
- Botão "Encerrar" limpa o pedido ativo.

**Reação a cada `Resultado.tipo`** (texto exato da faixa → classe → som):

| tipo | ação | faixa | classe | som |
|---|---|---|---|---|
| `invalido` | — | `Código não reconhecido.` | erro | erro |
| `nao_encontrado` | — | `Pedido #${id} não encontrado.` | erro | erro |
| `abrir` | torna ativo e mostra o painel | `Pedido #${id}: bipe os ${n} volume(s).` | ok | ok |
| `sem_etiquetas` | mostra o painel sem volumes, não ativa | `Pedido #${id} ainda não tem etiquetas impressas.` | aviso | erro |
| `consulta` | mostra o painel do pedido do volume, não ativa | `Consulta: pedido #${id}. Bipe o pedido impresso para conferir.` | aviso | ok |
| `outro_pedido` | mantém o ativo | `❌ Este pacote é do pedido #${pedidoId}, não do #${ativoId}!` | erro | erro |
| `etiqueta_desatualizada` | — | `Etiqueta desatualizada: o pedido agora tem ${volumes} volume(s). Reimprima as etiquetas.` | erro | erro |
| `repetido` | — | `Volume ${v}/${n} já foi conferido.` | aviso | erro |
| `conferir` | `marcarVolume` + `syncDB()` | `✅ Volume ${v}/${n} conferido.` ou, ao concluir, `✅ Pedido #${id} conferido: ${n} volume(s).` | ok | ok |

- Sons por Web Audio, sem arquivos: ok = 880 Hz por 120 ms; erro = 220 Hz por 400 ms. Envolva em try/catch.
- Nome do conferente: `getUsuarioLogado()?.nome || 'Usuário'`.
- Sem `temAcesso('expedicao','completo')`, a leitura funciona só como consulta (`conferir` vira a mensagem `Você não tem permissão para conferir.`).

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/expedicao.spec.js`. Semeie 26001 (volumes 3) e 26002 (volumes 2), os dois em "Pronto p/ Instalação". Para digitar, use `page.fill('#exp-leitura', código)` + `page.press('#exp-leitura','Enter')`.
  - `'conferencia completa'`: lê 26001, 26001-1-3, 26001-3-3 e 26001-2-3. Espera a faixa `✅ Pedido #26001 conferido: 3 volume(s).`, 3 `.exp-vol` com ✅, `sc_ped` com `conferencia.concluida_em` preenchido, `conferido_por === 'Teste'` e o `status` ainda `Pronto p/ Instalação`.
  - `'pacote de outro pedido'`: lê 26001 e depois 26002-1-2. Espera o texto `Este pacote é do pedido #26002, não do #26001` e `#exp-resultado` com classe `erro`.
  - `'repetido e desconhecido'`: lê 26001, 26001-1-3 e 26001-1-3 → `já foi conferido`; depois 99999 → `Pedido #99999 não encontrado.`
  - `'etiqueta desatualizada'`: lê 26001 e depois 26001-1-2 → `Etiqueta desatualizada`.
  - `'consulta sem pedido ativo'`: lê 26002-1-2. Espera `Consulta: pedido #26002` e o nome do cliente no `#exp-pedido`.
  - `'progresso parcial sobrevive e aparece no card'`: lê 26001 e 26001-1-3, recarrega, lê 26001 e espera 1 volume ✅. Depois abre `pcp.html` e espera `1/3 conferidos`.
  - `'menu mostra Expedicao'`: em `index.html`, espera `a.nav-item[href="expedicao.html"]`.
  - `'funciona sem internet'`: com o route abortando o jsdelivr, a conferência completa funciona igual.

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL (`expedicao.html` 404)

- [ ] **Step 3: Implement** a página, o script, o CSS e as mudanças de permissão e menu acima.

- [ ] **Step 4: Run to verify it passes**

Expected: PASS (8 testes). Rode a suíte e2e inteira e `node --test`; nada que já passava pode quebrar. Atenção aos specs de permissões/menu (`financeiro-bloqueio-menu.spec.js`, `estoque-colunas-e-menu.spec.js`), que podem contar itens do menu.

- [ ] **Step 5: Commit**

```bash
git add expedicao.html js/expedicao.js js/app.js css/style.css tests/e2e/expedicao.spec.js
git commit -m "feat(expedicao): tela de conferencia por scanner, menu e permissao"
```

---

### Task 10: Documentação e verificação final

**Files:**
- Modify: `FUNCIONALIDADES_SCTECH.txt` (seções novas: Etiquetas (editor, impressão, volumes), código na OS/Proposta e Expedição)
- Modify: `tests/e2e/README.md` (atualizar o total esperado de testes passando)

- [ ] **Step 1:** Atualize `FUNCIONALIDADES_SCTECH.txt` no mesmo estilo das seções existentes.
- [ ] **Step 2:** Rode `node --test`. Expected: tudo passando.
- [ ] **Step 3:** Rode a suíte e2e inteira. Expected: tudo passando; anote o total novo no README.
- [ ] **Step 4:** Confira que todas as páginas alteradas usam `?v=20261107a` em `style.css` e nos scripts (`grep -n "v=20261102a" *.html` só deve listar páginas que você não tocou).
- [ ] **Step 5: Commit**

```bash
git add FUNCIONALIDADES_SCTECH.txt tests/e2e/README.md
git commit -m "docs: etiquetas, volumes e expedicao no mapa de funcionalidades"
```

---

## Cobertura da spec

| Spec | Task |
|---|---|
| Conteúdo dos códigos, só dígitos e hífen | 1 |
| Formatos, tamanho personalizado, modelo pronto, grade, ajuste ao trocar formato, aviso de legibilidade, texto cortado com "…" | 2, 3, 7 |
| Editor drag and drop livre (paleta, palco, propriedades, salvar, imprimir teste) | 7, 8 |
| Volumes, reimprimir um volume, zerar ao mudar volumes | 4, 8 |
| Zerar ao voltar para Orçamento; `salvarPedido` preserva campos | 6 |
| Botão no pedido e no Kanban (fora de Orçamento) | 8 |
| Impressão HTML com `@page` no tamanho da etiqueta, SVG | 8 |
| Código fixo na Proposta (desde Orçamento) e na OS | 5 |
| Falha de conexão: mensagem e nunca imprimir código quebrado | 5, 7, 8 |
| Expedição: conferência, alertas, sons, consulta, progresso parcial, sem internet | 4, 9 |
| Status não muda; marcação no card; timeline | 4, 6, 8, 9 |
| Permissão e menu da Expedição | 9 |
| Preparar o futuro (modelos por tipo, leitor isolado) | 1, 2 (`sc_etiqueta_cfg.modelos.pedido`, `lerCodigo`) |
