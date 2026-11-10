# Layout dos documentos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada um dos 5 documentos impressos (Proposta, OS, Pedido de Compra, Agendamento de Medição, Relatório Financeiro) passa a ser montado a partir de um layout editável em Configurar Empresa: cores, fonte, logo no fundo, variantes/ordem/visibilidade de blocos, blocos de texto próprios e textos com dados encaixados.

**Architecture:** Um módulo puro `js/docs-layout-core.js` (UMD, global `DocsLayout`) guarda o catálogo de documentos/blocos/campos, os padrões, a leitura tolerante do JSON salvo e a troca de marcadores. Em `js/app.js`, cada gerador é dividido em funções de bloco e passa a montar o documento com `montarDocumentoLayout`, que aplica o tema por variáveis CSS num invólucro `.doc-layout`. O editor (`js/docs-layout-editor.js`) roda em `empresa.html` e usa os mesmos geradores para a prévia.

**Tech Stack:** HTML/CSS/JS sem build; `localStorage`; `node --test` (unitário); Playwright fora do repo (e2e, ver `tests/e2e/README.md`).

**Spec:** `docs/superpowers/specs/2026-11-09-layout-documentos-design.md`

## Global Constraints

- Sem layout salvo, os 5 documentos saem visualmente equivalentes aos de hoje; classes/seletores existentes (`proposta-header`, `proposta-cliente`, `proposta-tabela`, `proposta-totais`, `proposta-termos`, `proposta-aprovacao`, `os-header`, `os-cliente-bar`, `os-amb-card`, `os-section`, `os-assinaturas`, `pc-header`, `pc-section`, `pc-cliente`, `pc-especificacoes`, `pc-item-obs`, `pc-table`, `pc-assinaturas`, `sc-codigo-doc`) permanecem.
- Valor `null` em cor/destaque/fundo significa "padrão do sistema": nenhuma variável CSS é emitida.
- Chave de armazenamento: `localStorage['sc_doc_layouts']`, formato `{ versao: 1, docs: { <docId>: <layout parcial> } }`. JSON inválido ⇒ padrão, sem erro.
- Ids dos documentos: `proposta`, `os`, `compra`, `medicao`, `financeiro`.
- Cabeçalho (`cabecalho`) é sempre o primeiro bloco, não pode ser escondido nem movido; `htmlCodigoDocumento` fica dentro dele.
- Todo texto do usuário e todo valor de campo passam por `escapeHtml` antes de entrar no HTML.
- Marcador desconhecido fica literal; marcador conhecido sem valor vira `''`. `{diasValidade}` continua válido na proposta.
- O `?v=` de cache é trocado em **todos** os `.html` juntos (hoje `v=20261109d` → `v=20261109e`).
- Identificadores e textos de interface em português, no estilo do código existente. Sem dependências novas.

## Review Focus

1. Documento sem layout salvo (instalação nova e quem atualiza) — tem que sair igual ao de hoje; teste e2e compara com o padrão.
2. `sc_doc_layouts` corrompido ou com bloco/campo que não existe mais — cai no padrão daquele item e ignora o resto.
3. Texto do usuário com `<script>`/`<b>` ou valor de cliente com `<` — sai escapado.
4. Empresa sem logo cadastrada com marca d'água ligada — não quebra, não mostra imagem quebrada; editor desabilita a opção.
5. Proposta com `sc_cond_gerais` antigo e sem layout salvo — o texto antigo aparece no bloco Condições gerais (migração), e assinatura/código de barras seguem funcionando depois de reordenar blocos.

---

### Task 1: Núcleo puro `js/docs-layout-core.js`

**Files:**
- Create: `js/docs-layout-core.js`
- Test: `tests/docs-layout-core.test.js`

**Interfaces:**
- Produces (global `DocsLayout` no navegador, `module.exports` no node):
  - `DOCUMENTOS`: `{ [docId]: { nome, titulo, blocos: [{ id, nome, variantes: [{id, nome}], fixo?: true, titulo?: string, corpo?: string, texto?: true }], campos: [{ chave, nome }] } }`. `variantes[0]` é o visual de hoje. Blocos por documento conforme o spec (ids: proposta `cabecalho, cliente, ambientes, observacoes, totais, condicoes, aprovacao`; os `cabecalho, cliente, ambientes, materiais, observacoes, assinaturas`; compra `cabecalho, cliente, fornecedor, itens, especificacoes, observacoes, assinaturas`; medicao `cabecalho, cliente, agendamento, assinatura, rodape`; financeiro `cabecalho, indicadores, graficos, recebimentos, pagamentos, rodape`). Blocos de texto (`texto: true`): proposta `condicoes` (corpo = `_COND_GERAIS_DEFAULT` atual), os aviso dentro de `cabecalho` via campo `aviso`, medicao/financeiro `rodape`.
  - Variantes: cabeçalho `esquerda|centro|direita`; pessoa (cliente/fornecedor/agendamento) `lista|colunas|faixa`; totais `direita|largura`; assinaturas `lado|empilhadas`; texto `simples|caixa|lateral`.
  - `CAMPOS_COMUNS`: `empresa, empresa_telefone, empresa_email, empresa_site, empresa_endereco, empresa_cnpj`.
  - `FONTES`: `[{ id, nome, familia /* css font-family ou null */, google /* nome p/ Google Fonts ou null */ }]`, primeira `{ id:'sistema', nome:'Padrão do sistema', familia:null, google:null }`; incluir Arial, Georgia, Lora, Montserrat, Playfair Display.
  - `PALETAS`: `[{ id, nome, cor, destaque, fundo }]`, primeira `{ id:'sctech', cor:null, destaque:null, fundo:null }`, mais 4.
  - `padrao(docId) -> Layout` onde `Layout = { estilo: { cor, destaque, fundo, fonte, marca: { ativa, tamanho:'P'|'M'|'G', opacidade:number } }, titulo, blocos: [{ id, variante, visivel, titulo, corpo?, proprio? }] }`. Padrão: cores `null`, fonte `'sistema'`, marca `{ativa:false,tamanho:'M',opacidade:8}`.
  - `ler(jsonString) -> { versao:1, docs }` (tolerante).
  - `doDocumento(layouts, docId) -> Layout` completo: funde o salvo sobre o padrão; descarta blocos desconhecidos (exceto `proprio`), acrescenta blocos novos do catálogo no fim, força `cabecalho` primeiro e visível, limita `opacidade` a 3–20 e valida variantes/fontes/cores (`/^#[0-9a-f]{6}$/i`).
  - `copiarEstilo(destino, origem) -> Layout` novo: copia `estilo` e a variante do `cabecalho`.
  - `novoBlocoProprio(layout) -> Layout` com `{ id:'proprio-<n>', proprio:true, variante:'simples', visivel:true, titulo:'Novo texto', corpo:'' }`.
  - `preencher(texto, valores, escapar) -> string`.
  - `variaveisCss(estilo, fontes) -> string` (`--primary:…;--doc-destaque:…;--doc-fundo:…;--doc-fonte:…;`), vazia no padrão.
  - `migrarCondicoes(layouts, textoAntigo) -> layouts` (só se `docs.proposta` não existe e o texto difere do padrão).

- [ ] **Step 1: Escrever os testes**

```js
const D = require('../js/docs-layout-core.js');
test('padrao de cada documento: cabecalho primeiro, variante 0, estilo nulo', () => {
  for (const id of ['proposta','os','compra','medicao','financeiro']) {
    const l = D.padrao(id);
    assert.strictEqual(l.blocos[0].id, 'cabecalho');
    assert.ok(l.blocos.every(b => b.visivel));
    assert.deepStrictEqual(l.estilo, { cor:null, destaque:null, fundo:null, fonte:'sistema', marca:{ ativa:false, tamanho:'M', opacidade:8 } });
    assert.strictEqual(D.variaveisCss(l.estilo, D.FONTES), '');
  }
});
test('ler tolera lixo', () => {
  assert.deepStrictEqual(D.ler('{x'), { versao:1, docs:{} });
  assert.deepStrictEqual(D.ler(null), { versao:1, docs:{} });
});
test('doDocumento funde, descarta desconhecido, mantem cabecalho fixo', () => {
  const salvo = { versao:1, docs:{ proposta:{ estilo:{ cor:'#112233', fonte:'nao-existe', marca:{ ativa:true, opacidade:99 } },
    blocos:[{ id:'totais', variante:'largura', visivel:false }, { id:'fantasma' }, { id:'cabecalho', visivel:false, variante:'centro' }, { id:'proprio-1', proprio:true, titulo:'Sobre', corpo:'x', variante:'caixa', visivel:true }] } } };
  const l = D.doDocumento(salvo, 'proposta');
  assert.strictEqual(l.estilo.cor, '#112233');
  assert.strictEqual(l.estilo.fonte, 'sistema');
  assert.strictEqual(l.estilo.marca.opacidade, 20);
  assert.strictEqual(l.blocos[0].id, 'cabecalho');
  assert.strictEqual(l.blocos[0].visivel, true);
  assert.strictEqual(l.blocos[0].variante, 'centro');
  assert.ok(!l.blocos.some(b => b.id === 'fantasma'));
  assert.ok(l.blocos.some(b => b.id === 'proprio-1'));
  assert.strictEqual(l.blocos.find(b => b.id === 'totais').visivel, false);
  assert.strictEqual(l.blocos.length, D.padrao('proposta').blocos.length + 1);
});
test('preencher: conhecido, vazio, desconhecido, escape', () => {
  const esc = s => String(s).replace(/</g, '&lt;');
  assert.strictEqual(D.preencher('Olá {cliente}, {x} {vazio}', { cliente:'<Ana>', vazio:'' }, esc), 'Olá &lt;Ana>, {x} ');
});
test('copiarEstilo copia estilo e variante do cabecalho, nao textos', () => {
  const a = D.padrao('os'); const b = D.padrao('proposta');
  b.estilo.cor = '#AA0000'; b.blocos[0].variante = 'direita'; b.titulo = 'X';
  const r = D.copiarEstilo(a, b);
  assert.strictEqual(r.estilo.cor, '#AA0000');
  assert.strictEqual(r.blocos[0].variante, 'direita');
  assert.strictEqual(r.titulo, a.titulo);
  assert.notStrictEqual(r.estilo, b.estilo);
});
test('migrarCondicoes so na primeira vez', () => {
  const m = D.migrarCondicoes({ versao:1, docs:{} }, 'Linha antiga');
  assert.strictEqual(D.doDocumento(m, 'proposta').blocos.find(b => b.id === 'condicoes').corpo, 'Linha antiga');
  const ja = { versao:1, docs:{ proposta:{ titulo:'T' } } };
  assert.strictEqual(D.migrarCondicoes(ja, 'Outra'), ja);
});
test('todo campo citado nos textos padrao existe no documento', () => { /* para cada doc, cada {chave} em titulo/corpo padrao ∈ campos ∪ CAMPOS_COMUNS ∪ {diasValidade} */ });
```

- [ ] **Step 2:** `node --test tests/docs-layout-core.test.js` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `js/docs-layout-core.js` (UMD igual a `js/cortina-desenho.js`; funções puras, sem DOM).
- [ ] **Step 4:** `node --test` → todos passam (212 + novos).
- [ ] **Step 5:** Commit `feat(documentos): nucleo do layout dos documentos`.

### Task 2: Montagem com layout + Proposta

**Files:**
- Modify: `js/app.js` (perto de `gerarHTMLProposta`, ~6639), `css/style.css` (variantes e marca d'água), todos os `.html` que carregam `app.js` (incluir `js/docs-layout-core.js` antes dele, `?v=20261109e` em tudo)
- Test: `tests/e2e/layout-documentos.spec.js` (novo)

**Interfaces:**
- Consumes: `DocsLayout.*` (Task 1).
- Produces:
  - `getLayoutsDocumentos() -> {versao, docs}` (lê `sc_doc_layouts`, aplica `migrarCondicoes` com `localStorage.sc_cond_gerais`), `getLayoutDocumento(docId) -> Layout`.
  - `valoresComunsEmpresa() -> {empresa, empresa_telefone, …}`.
  - `montarDocumentoLayout(docId, layout, blocosHTML /* {id: html} */, valores) -> string`: invólucro `<div class="doc-layout doc-layout-<docId>" style="<variaveisCss>">`, marca d'água `<div class="doc-marca-dagua doc-marca-<tam>">` com a logo (`sc_empresa.logo_base64`) só se ativa **e** houver logo; blocos na ordem de `layout.blocos`, pulando invisíveis e vazios; cada um envolto em `<div class="doc-bloco doc-bloco-<id> doc-var-<variante>">`; blocos próprios/texto renderizados por `htmlBlocoTexto(bloco, valores)` (título + corpo com `preencher`, uma linha → `<p>`; nas condições cada linha → `<li>` como hoje). Carrega a fonte Google (uma `<link>` em `document.head`, uma vez por família).
  - `gerarHTMLProposta(pedidoId, diasValidade, layout?)` — `layout` opcional; sem ele usa `getLayoutDocumento('proposta')`. Títulos de bloco e título do documento vêm do layout.
- CSS: `.doc-layout{font-family:var(--doc-fonte,inherit);position:relative}`; marca d'água `position:absolute` centrada na tela e `position:fixed` em `@media print`, `z-index` atrás do conteúdo, opacidade inline; variantes: `.doc-var-centro .proposta-header` etc. (cabeçalho centralizado = logo em cima centralizada, dados do documento abaixo; direita = `flex-direction:row-reverse`), `.doc-var-colunas` (grid 2 col), `.doc-var-faixa` (linha única compacta), `.doc-var-largura` (totais 100%), `.doc-var-empilhadas` (assinaturas em coluna), `.doc-var-caixa` (fundo `var(--doc-fundo,#FAFAFA)`), `.doc-var-lateral` (borda esquerda `var(--doc-destaque,var(--primary))`). Usar `var(--doc-destaque, <cor atual>)` e `var(--doc-fundo, <cor atual>)` nos pontos hoje fixos da proposta (ex.: borda `#005D3B` das observações).

- [ ] **Step 1: Testes e2e** em `tests/e2e/layout-documentos.spec.js` (abrir proposta como em `abertura-animada.spec.js` teste "proposta"):
  - `sem layout salvo a proposta mantem a estrutura de hoje`: `.proposta-header`, `.proposta-cliente`, `.proposta-tabela`, `.proposta-totais`, `.proposta-termos`, `.proposta-aprovacao` visíveis nessa ordem; título `PROPOSTA COMERCIAL`; nenhuma `.doc-marca-dagua`; o invólucro não tem `style` com `--primary`.
  - `layout salvo muda cor, titulo, esconde totais e insere dado`: semear `sc_doc_layouts` com cor `#7A1F3D`, título `ORÇAMENTO {cliente}`, `totais.visivel=false`, bloco próprio `Sobre nós` corpo `Atendemos {cliente}` → `h2` tem `ORÇAMENTO Maria`, `.proposta-totais` ausente, texto `Atendemos Maria` presente, `getComputedStyle(.proposta-header).borderBottomColor` = `rgb(122, 31, 61)`.
  - `condicoes antigas migram`: semear `sc_cond_gerais: 'Pagamento à vista'` → `.proposta-termos li` = `Pagamento à vista`.
  - `marca dagua com logo` e `sem logo`: com `sc_empresa.logo_base64` (png 1×1 data URL) e `marca.ativa` → `.doc-marca-dagua img` existe; sem logo → não existe.
  - `texto do usuario e escapado`: bloco próprio corpo `<b>x</b>` aparece como texto literal.
- [ ] **Step 2:** rodar só esse spec → FAIL.
- [ ] **Step 3:** Implementar `getLayoutsDocumentos`, `getLayoutDocumento`, `valoresComunsEmpresa`, `htmlBlocoTexto`, `montarDocumentoLayout`, CSS; dividir `gerarHTMLProposta` em blocos (mesmo HTML de hoje por bloco), calcular `valores` (campos do spec: `cliente, cliente_telefone, cliente_email, cliente_endereco, numero, data_emissao, validade, diasValidade, total, previsao_entrega, vendedor, forma_pagamento`). `getCondicoesGerais()` passa a ler do bloco `condicoes`.
- [ ] **Step 4:** spec novo passa; `node --test` passa; e2e completo passa (566 + novos).
- [ ] **Step 5:** Commit `feat(documentos): proposta montada pelo layout`.

### Task 3: OS e Pedido de Compra

**Files:** Modify `js/app.js` (`gerarHTMLOS` ~6527, `gerarHTMLPedidoCompra` ~8340), `css/style.css`; Test: `tests/e2e/layout-documentos.spec.js`.

**Interfaces:**
- Consumes: `montarDocumentoLayout`, `getLayoutDocumento` (Task 2).
- Produces: `gerarHTMLOS(pedidoId, layout?)`, `gerarHTMLPedidoCompra(id, layout?)`. Aviso da OS (`⚠ SEM VALOR COMERCIAL — USO EXCLUSIVAMENTE INTERNO`) e legendas das assinaturas viram texto editável do layout. Campos — os: `cliente, numero, data_emissao, previsao_entrega, status`; compra: `fornecedor, numero, data_emissao, total, cliente_origem, pedido_venda`.

- [ ] **Step 1: Testes:** OS sem layout tem `.os-header, .os-cliente-bar, .os-amb-card, .os-assinaturas` e o aviso padrão; com layout `assinaturas.visivel=false` e aviso `Uso interno — {cliente}` → sem `.os-assinaturas`, aviso preenchido. Pedido de compra com layout de cor e `especificacoes` movido para antes de `itens` → `.pc-especificacoes` vem antes da seção de itens no DOM; os testes existentes de `compras-obs-e-especificacoes.spec.js` seguem passando.
- [ ] **Step 2:** FAIL. **Step 3:** dividir os dois geradores em blocos. **Step 4:** spec + `node --test` + e2e completo passam.
- [ ] **Step 5:** Commit `feat(documentos): OS e pedido de compra montados pelo layout`.

### Task 4: Agendamento de Medição e Relatório Financeiro

**Files:** Modify `js/app.js` (`imprimirAgendamentoMedicao` ~8594, `gerarRelatorioFinanceiro` ~11778); Test: mesmo spec.

**Interfaces:**
- Produces: `gerarHTMLAgendamentoMedicao(v, layout?) -> string` (registro, não id) e `imprimirAgendamentoMedicao(id)` passa a usá-la; `gerarHTMLRelatorioFinanceiro(layout?) -> {html, label}` e `gerarRelatorioFinanceiro()` passa a usá-la. Gráficos ausentes (sem canvas) ⇒ bloco `graficos` vazio (pulado). Rodapés viram texto editável (`Relatório gerado pelo sistema SCTech · {data_geracao}` no financeiro; medição: `{empresa}` à esquerda e `ID do agendamento: {id}` à direita). Campos — medicao: `cliente, cliente_telefone, data_visita, horario, responsavel, endereco_visita, id`; financeiro: `periodo, data_geracao`.

- [ ] **Step 1: Testes:** medição pela tela de agendas (ver `agendas-producao.spec.js` para abrir) com layout `rodape.corpo='Até breve, {cliente}'` → texto presente; relatório financeiro com título alterado `Fechamento {periodo}` → título preenchido no `#doc-modal-paper`.
- [ ] **Step 2–4:** FAIL → implementar → spec + `node --test` + e2e completo passam.
- [ ] **Step 5:** Commit `feat(documentos): agendamento e relatorio financeiro montados pelo layout`.

### Task 5: Editor em `empresa.html`

**Files:**
- Create: `js/docs-layout-editor.js`
- Modify: `empresa.html` (novo card `#emp-layout-docs-card` com `<div id="dl-editor">`; remover o card "Condições Gerais da Proposta" e pôr no lugar um aviso de uma linha apontando para o editor; carregar o editor e chamar `iniciarEditorLayouts()`), `css/style.css`, `js/app.js` (remover `salvarCondicoesGerais/restaurarCondicoesGerais/carregarCondicoesGerais` e a chamada em `empresa.html`)
- Test: `tests/e2e/layout-documentos-editor.spec.js`

**Interfaces:**
- Consumes: `DocsLayout`, geradores com `layout?` (Tasks 2–4), `abrirDocModal` não é usado na prévia.
- Produces: `iniciarEditorLayouts()`; `exemploDocumento(docId)` → registro fictício usado quando não existe registro real (proposta/os: pedido com 2 ambientes e 2 tecidos, cliente "Maria Souza"; compra: 2 itens e fornecedor; medição: visita amanhã 14:00). Para usar o fictício sem gravar no `db`, os geradores de proposta/OS/compra aceitam o registro já resolvido via função interna (`_htmlProposta(ped, dias, layout)` etc.) — a função pública só busca o registro e delega.
- UI (ids estáveis para teste): `#dl-doc` (select com os 5), `#dl-copiar` (select "Copiar estilo de…"), `#dl-padrao`, `#dl-salvar`, `#dl-cor`, `#dl-destaque`, `#dl-fundo` (input color + botão "padrão"), `.dl-paleta[data-paleta]`, `#dl-fonte`, `#dl-marca`, `#dl-marca-tamanho`, `#dl-marca-opacidade`, `#dl-titulo`, lista `#dl-blocos` com uma linha `.dl-bloco[data-bloco]` por bloco (select de variante `.dl-variante`, checkbox `.dl-visivel` (ausente no cabeçalho), botões `.dl-subir`/`.dl-descer`, campos `.dl-bloco-titulo`, `.dl-bloco-corpo` quando texto, `.dl-remover` em próprios), `#dl-novo-bloco`, botão `.dl-inserir-dado` ao lado de cada texto abrindo lista dos campos (documento + comuns) que insere `{chave}` no cursor; prévia `#dl-previa` (folha A4 com o HTML do gerador, CSS da página já carregado). Toda mudança re-renderiza a prévia. Alterações não salvas: trocar `#dl-doc` ou sair (`beforeunload`) pede confirmação (`showConfirm`). Sem logo cadastrada, `#dl-marca` desabilitado com aviso.

- [ ] **Step 1: Testes e2e:**
  - `prévia sem registros usa o exemplo` (`#dl-previa` contém `Maria Souza`).
  - `trocar cor muda a prévia na hora e salvar persiste` (`#dl-cor` = `#7A1F3D` → borda do `.proposta-header` na prévia; `#dl-salvar` → `sc_doc_layouts.docs.proposta.estilo.cor === '#7A1F3D'`; recarregar mantém).
  - `inserir dado põe o marcador e a prévia preenche` (`#dl-titulo` + `.dl-inserir-dado` → `Cliente` ⇒ valor contém `{cliente}`, prévia mostra `Maria Souza`).
  - `esconder e mover bloco`; `bloco próprio` adiciona/remove.
  - `copiar estilo de` (proposta com cor salva → OS copia, cor da OS = a da proposta, título da OS inalterado).
  - `voltar ao padrão` (confirmação → layout da OS removido do storage).
  - `condições antigas aparecem no bloco condições do editor` e o card antigo não existe mais.
  - `trocar de documento com alteração pendente pergunta`.
  - `marca d'água desabilitada sem logo`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** spec + `node --test` + e2e completo passam; conferir a tela por screenshot (desktop e 390px de largura).
- [ ] **Step 5:** Commit `feat(empresa): editor de layout dos documentos`.

### Task 6: Fechamento

**Files:** `FUNCIONALIDADES_SCTECH.txt`, `tests/e2e/README.md` (contagem de testes), `?v=` conferido em todos os html.

- [ ] **Step 1:** `grep -c "v=20261109e"` em todos os html = mesmo número de `v=` total; nenhum `v=20261109d` sobrando.
- [ ] **Step 2:** Documentar a funcionalidade em `FUNCIONALIDADES_SCTECH.txt` (seção Configurar Empresa) e atualizar a contagem no README do e2e.
- [ ] **Step 3:** `node --test` e e2e completo verdes; impressão real conferida por screenshot de `proposta.html` com layout personalizado (marca d'água, fonte, cor).
- [ ] **Step 4:** Commit `docs: layout dos documentos`.
