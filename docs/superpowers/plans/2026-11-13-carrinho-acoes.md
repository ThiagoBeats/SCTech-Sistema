# Carrinho, histórico por fornecedor e menu de ações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desligar o simulador (manter galeria), padronizar a coluna Ações com menu ⋮, ver senha, histórico de pedidos por fornecedor (filtro, soma, Excel/PDF) e carrinho de compras por fornecedor que vira pedido de compra ao fechar.

**Architecture:** Lógica pura nova em `js/carrinho-core.js` (`CarrinhoCore`, `node --test`). UI e dados em `js/app.js` + páginas. Um componente único de menu ⋮ reutilizado por todas as tabelas. Carrinhos guardados em `db.carrinhos` (`sc_carrinhos`).

**Tech Stack:** HTML/CSS/JS puro, `localStorage`, SheetJS (já carregado sob demanda no projeto), `node --test`, Playwright fora do repo (`tests/e2e/README.md`).

**Spec:** `Docs/superpowers/specs/2026-11-13-carrinho-acoes-design.md`

## Global Constraints

- Sem dependências novas, sem backend. Branch `feat/carrinho-e-acoes`.
- Datas locais (`hojeLocal()`); dinheiro com `FinanceiroCore.arredondar`.
- Ids: contador + `Set` de ids usados.
- `db.carrinhos` → `sc_carrinhos`: `Array<{ fornecedor_id, itens: Array<{ tipo:'tecido'|'material', item_id, item_nome, referencia, unidade, quantidade, preco_unit, subtotal, observacao:'' }>, novo: boolean, atualizado_em: number }>`; incluído em `syncDB`, `_dadosExportacao` e `importarDados` (backup antigo sem a chave → `[]`).
- Pedido de compra ganha `data_envio: 'YYYY-MM-DD'|null`.
- `js/carrinho-core.js` incluído antes de `js/app.js` em todas as páginas que incluem `app.js`; cache-busting de todos os `<script src="js/...">` sobe para `?v=20261113a`.
- Escapar texto de usuário; nada de `prompt()`; modais `.sc-modal-overlay` com validação dentro do modal; Escape fecha; sem empilhar.
- Permissões: adicionar ao carrinho = `estoque` completo; ver carrinho/histórico = `fornecedores` visualizar; editar/fechar/esvaziar carrinho = `fornecedores` completo (chaves existentes em `MODULOS_PERMISSAO`; conferir o nome exato da chave de fornecedores).
- Testes e2e em `tests/e2e/carrinho-*.spec.js`, `acoes-menu.spec.js`, `historico-fornecedor.spec.js`; testes existentes que clicam ícones antigos passam a abrir o ⋮ e escolher a ação (mudar só o seletor, manter a intenção).

## Review Focus

1. **Item no carrinho do fornecedor certo**: item cujo fornecedor muda no cadastro depois de estar no carrinho continua no carrinho onde entrou; adicionar de novo vai para o carrinho do fornecedor atual (Task 5).
2. **Somar o mesmo item** em unidades diferentes não acontece (mesmo `tipo`+`item_id` usa a unidade do cadastro) e "1,5" m é aceito (Task 1 + Task 5).
3. **Fechar carrinho vazio** é bloqueado; fechar duas vezes seguidas não cria dois pedidos (Task 6).
4. **Histórico filtrado**: pedido no último dia do filtro entra (limites inclusivos); total bate com a soma das linhas filtradas (Task 1 + Task 4).
5. **Menu ⋮**: abrir um fecha o outro; ação perigosa pede confirmação como antes; nenhuma ação some (Task 2/3).

---

### Task 1: `CarrinhoCore` (puro)

**Files:** Create `js/carrinho-core.js` (padrão IIFE de `js/caixa-core.js`, exporta `module.exports` + `window.CarrinhoCore`); Test `tests/carrinho-core.test.js`

**Produces:**
- `adicionarAoCarrinho(carrinhos, { fornecedor_id, item }) -> carrinhos` (novo array; não muta) — cria o carrinho do fornecedor se faltar; mesmo `tipo`+`item_id` soma `quantidade` e atualiza `preco_unit` para o do `item`; recalcula `subtotal`; marca `novo: true`; `atualizado_em = Date.now()`.
- `alterarQuantidade(carrinho, tipo, itemId, quantidade) -> carrinho` (quantidade ≤ 0 remove a linha).
- `removerItem(carrinho, tipo, itemId) -> carrinho`.
- `totalCarrinho(carrinho) -> number`; `contarItens(carrinho) -> number` (linhas).
- `valorPedidoCompra(pc) -> number` (soma dos `subtotal`).
- `historicoFornecedor(pedidosCompra, fornecedorId, { de, ate }) -> { linhas: Array<{ id, data_envio, status, valor }>, total }` — só `status` Enviado/Recebido; `data_envio` ou, se faltar, data local de `data_criacao`; filtro inclusivo; ordem decrescente de data.
- Comparação de ids com `String(a) === String(b)`.

- [ ] **Step 1: Write the failing tests** (assertivas exatas):
  - `'adicionar cria carrinho e soma o mesmo item'`: dois adds de `{tipo:'material', item_id:5, quantidade:2, preco_unit:10}` e `{..., quantidade:1.5, preco_unit:12}` → 1 linha, `quantidade 3.5`, `preco_unit 12`, `subtotal 42`, `novo true`.
  - `'itens de fornecedores diferentes vao para carrinhos diferentes'`.
  - `'alterarQuantidade 0 remove e removerItem'`.
  - `'totalCarrinho e contarItens'`: 2 linhas 42 + 8,10 → total 50,1; contar 2.
  - `'historico so enviados, filtro inclusivo, total'`: PCs do fornecedor 3 — Rascunho (fora), Enviado `data_envio '2026-11-01'` valor 100, Recebido sem `data_envio` com `data_criacao` de 2026-10-15 valor 50, Enviado de outro fornecedor (fora) → sem filtro: 2 linhas, total 150, primeira de 2026-11-01; filtro `{de:'2026-11-01', ate:'2026-11-01'}` → 1 linha, total 100.
  - `'ids string e numero'`.
- [ ] **Step 2: Run** `node --test tests/carrinho-core.test.js` → FAIL. **Step 3: Implement.** **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(carrinho): nucleo do carrinho e do historico de compras`

---

### Task 2: Componente de menu ⋮ + Fornecedores, Clientes, Vendedores/Arquitetos

**Files:** Modify `js/app.js` (novo `menuAcoesHtml(acoes)` + handler global; `renderTabelaFornecedores` ~8313, `renderTabelaClientes` ~2228, `renderTabelaVendedores` ~7921), `fornecedores.html` (remover th "Total de compras"), `vendedores.html` (th "Situação" e "Ações" separados), `clientes.html` se tiver th fixo, `css/style.css` (estilos do menu, tema claro/escuro com variáveis); Test `tests/e2e/acoes-menu.spec.js`

**Produces:**
- `menuAcoesHtml(acoes: Array<{ icone, rotulo, onclick: string, perigo?: boolean, oculto?: boolean }>) -> string` — botão `.btn-acoes` "⋮" (`aria-label="Ações"`) + lista `.menu-acoes` escondida; `oculto` some; perigosas no fim com classe de perigo.
- Handler global (uma vez): clique no ⋮ abre o seu menu e fecha os outros; clique fora/Escape/escolher ação fecha; menu posicionado para não sair da tela (abre para cima perto do fim da página).
- Fornecedores: menu com as ações de hoje + "📜 Histórico de pedidos" chamando `abrirHistoricoFornecedor(id)` (implementado na Task 4 — aqui pode existir como stub que mostra "em breve"? **Não:** declare a ação somente na Task 4; nesta task, só as ações atuais). Remover a coluna "Total de compras" e o cálculo dela.
- Vendedores/Arquitetos: colunas "Situação" (badge atual) e "Ações" (⋮) separadas.

- [ ] **Step 1: Write the failing e2e**: `'fornecedores: ⋮ abre as acoes de hoje e nao ha coluna Total de compras'`; `'clientes: ⋮ com editar e excluir funcionando'`; `'vendedores: colunas Situacao e Acoes separadas, ⋮ funciona'`; `'abrir um menu fecha o outro, Escape e clique fora fecham'`; `'excluir pelo menu pede confirmacao como antes'`.
- [ ] **Step 2–4:** RED → implement → GREEN; ajustar seletores em `vendedores-arquitetos.spec.js` e specs de fornecedores/clientes que clicam ícones; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(acoes): menu de tres pontos em fornecedores, clientes e vendedores`

---

### Task 3: ⋮ no Catálogo, simulador desligado e ver senha

**Files:** Modify `js/app.js` (tabelas de Tecidos, Materiais e Acessórios e Kits do Cadastro/Catálogo — as `col-acoes`; Segurança), `catalogo.html`, `configuracoes.html` (campos `seg-senha-*`), `galeria.html`, `pedido.html`, `empresa.html`, `js/galeria-*.js` conforme necessário, `css/style.css`; Test `tests/e2e/acoes-catalogo.spec.js`, `tests/e2e/simulador-desligado.spec.js`, `tests/e2e/ver-senha.spec.js`

**Produces:**
- Catálogo: as três abas usam `menuAcoesHtml` com as ações de hoje (o "Criar pedido de compra" continua chamando `pedirTecido`/`pedirMaterial` nesta task; a Task 5 troca por carrinho).
- `SIMULADOR_ATIVO = false` (constante central, ex. em `js/galeria-core.js` ou `js/app.js`): esconde botão "📐 Simular na parede do cliente", trata `galeria.html#simular` como galeria normal, esconde o acesso ao simulador dentro da galeria do pedido e a configuração do simulador em Empresa › Galeria e Mostruário; `title` do botão "🖼️ Galeria" do pedido sem citar simulação. Specs e2e do simulador: `test.skip` com motivo "simulador desligado".
- Ver senha: botão 👁️ em cada `seg-senha-*` alterna `type` password/text e `aria-pressed`.
- [ ] **Step 1: Write the failing e2e**: catálogo ⋮ nas 3 abas com as mesmas ações; `'nenhum acesso ao simulador aparece (galeria, #simular, galeria do pedido, empresa)'`; `'galeria de fotos continua abrindo'`; `'olho mostra e esconde cada senha'`.
- [ ] **Step 2–4:** RED → implement → GREEN; `catalogo-selecao`, `kit-manual`, `cadastro-e-consulta-kits`, `galeria*.spec.js`, `configuracoes-galeria-pedido` → PASS (ajustar só seletores; simulador → skip); `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(acoes): menu no catalogo, simulador desligado e ver senha`

---

### Task 4: Histórico de pedidos do fornecedor

**Files:** Modify `js/app.js` — `atualizarStatusPC` (~8732) e qualquer outro caminho que põe Enviado/Rascunho (grava/limpa `data_envio`), menu de Fornecedores (+ "📜 Histórico de pedidos"), novas `abrirHistoricoFornecedor(fornecedorId)`, `exportarHistoricoExcel()`, `exportarHistoricoPDF()`; Test `tests/e2e/historico-fornecedor.spec.js`

**Interfaces:** Consumes `CarrinhoCore.historicoFornecedor`, `valorPedidoCompra`; `abrirPedidoCompra(id)` (~8856); SheetJS loader existente (procurar como o importador carrega `XLSX`); `abrirDocModal`/cabeçalho da empresa para o PDF.
- Janela com nome do fornecedor, filtros "de"/"até" (date), tabela (Nº, Data de envio DD/MM/AAAA, Situação, Valor R$), rodapé "Total: R$ X" do filtro; clicar na linha abre o PDF do pedido; botões "📊 Excel" e "📄 PDF".
- Excel: colunas Nº, Data de envio, Situação, Valor + linha Total; arquivo `historico_<fornecedor>_<de>_<ate>.xlsx` (sem filtro: `todos`).
- PDF: documento com cabeçalho da empresa, fornecedor, período, tabela e total.
- [ ] **Step 1: Write the failing e2e**: `'Enviado grava data_envio e voltar para Rascunho apaga'`; `'historico lista so enviados e recebidos, mais recente primeiro, com total'`; `'filtro por data atualiza linhas e total'`; `'clicar abre o PDF do pedido'`; `'exportar Excel baixa arquivo com as linhas filtradas'` (ler o download com SheetJS no teste ou checar nome + tamanho); `'exportar PDF abre o documento com o total'`.
- [ ] **Step 2–4:** RED → implement → GREEN; `pedido-de-compra`, `pedido-compra-de-venda`, `financeiro-fase0-compra` → PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(fornecedores): historico de pedidos com filtro, total e exportacao`

---

### Task 5: Adicionar ao carrinho (estoque, catálogo, seleção) + ajuste no ⋮ do estoque

**Files:** Modify `js/app.js` — `db`/`syncDB`/export/import (carrinhos), `pedirMaterial`/`pedirTecido` (~8921/8927) → `abrirAdicionarAoCarrinho(tipo, id)`, botão "Pedir Tecido" (~2450), `pedidoDaSelecao` (~2911) → `adicionarSelecaoAoCarrinho(tipo)`, tabelas do estoque (`renderEstoqueMateriais` ~11668 e a de ~5195, tecidos do estoque, kits ~5614), todas as páginas com `app.js` (incluir `carrinho-core.js`, subir `?v=`); Test `tests/e2e/carrinho-adicionar.spec.js`

**Interfaces:** Consumes `CarrinhoCore.adicionarAoCarrinho`; `_numeroBR`/`_valorDigitadoBaixa` para quantidade com vírgula; `menuAcoesHtml` (Task 2).
- `abrirAdicionarAoCarrinho(tipo: 'tecido'|'material', id) -> Promise<void>` — exige `estoque` completo; janela: nome, fornecedor (select obrigatório se o item não tiver; ao confirmar grava `fornecedor_id`/nome no cadastro), quantidade (> 0, aceita "1,5"), unidade do item (tecido "m"; material `unidade`), botão Adicionar; item com `preco_custo` como `preco_unit`; toast "Adicionado ao carrinho de <fornecedor>".
- `adicionarSelecaoAoCarrinho(tipo) -> Promise<void>` — janela com uma linha por item selecionado (quantidade, e fornecedor quando faltar); ao confirmar adiciona todos e mostra "N itens adicionados em M carrinhos"; limpa a seleção.
- Estoque: coluna Ações com "🛒" (Adicionar ao carrinho) + ⋮ com "± Ajustar estoque" (mesma `mostrarAjusteForm`); aba tecidos ganha coluna Ações com "🛒".
- Catálogo (⋮ da Task 3) e detalhes do tecido: "🛒 Adicionar ao carrinho".
- [ ] **Step 1: Write the failing e2e**: `'material vai para o carrinho do seu fornecedor com a unidade do cadastro'`; `'tecido em metros aceita 1,5'`; `'mesmo item soma'`; `'item sem fornecedor pede e grava no cadastro'`; `'selecao de varios itens vai para varios carrinhos com resumo'`; `'ajustar estoque continua no ⋮ do estoque'`; `'sem estoque completo nao ve o botao'`.
- [ ] **Step 2–4:** RED → implement → GREEN; `catalogo-selecao` (fluxo de seleção agora vai para o carrinho — ajustar o teste para o novo comportamento, mantendo a cobertura dos itens agrupados por fornecedor), `estoque-colunas-e-menu`, `consulta-estoque`, `kit-manual` → PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(carrinho): adicionar ao carrinho a partir do estoque e do catalogo`

---

### Task 6: Carrinho em Fornecedores (ver, editar, fechar)

**Files:** Modify `js/app.js` — `renderTabelaFornecedores` (ícone 🛒 com contador e selo "novo"), novas `abrirCarrinho(fornecedorId)`, `fecharCarrinho(fornecedorId)`, `esvaziarCarrinho(fornecedorId)`, `excluirFornecedor` (~8277: bloquear com carrinho aberto); `css/style.css` (selo); Test `tests/e2e/carrinho-fornecedor.spec.js`

**Interfaces:** Consumes `CarrinhoCore.alterarQuantidade`, `removerItem`, `totalCarrinho`, `contarItens`; `gerarNumeroPedidoCompra()` (~331); `abrirPedidoCompra(id)`.
- Ícone 🛒 sempre visível na linha (fora do ⋮): número de itens quando > 0; selo "novo" quando `novo`.
- `abrirCarrinho`: limpa `novo`; janela com itens (quantidade editável — aceita vírgula —, preço ou "sem preço", subtotal, ✕ remover), total, botões "Esvaziar" (confirmação), "Fechar e enviar ao fornecedor" (desabilitado se vazio). Somente leitura sem `fornecedores` completo.
- `fecharCarrinho`: confirmação com total; cria PC `{ id: gerarNumeroPedidoCompra(), data_criacao: Date.now(), status: 'Enviado', data_envio: hojeLocal(), fornecedor_id, fornecedor_nome, itens, observacoes: '' }`; remove o carrinho; `syncDB`; abre `abrirPedidoCompra(id)`; protegido contra duplo clique (desabilita o botão ao clicar).
- `excluirFornecedor` com carrinho não vazio: mensagem exata da spec e não exclui.
- [ ] **Step 1: Write the failing e2e**: `'icone mostra contagem e selo novo, que some ao abrir'`; `'editar quantidade, remover item e total'`; `'fechar cria pedido Enviado com data_envio, abre o PDF e esvazia'`; `'fechar vazio bloqueado e duplo clique cria um so pedido'`; `'pedido fechado aparece no historico e na lista de pedidos de compra'`; `'excluir fornecedor com carrinho aberto e bloqueado'`; `'sem fornecedores completo o carrinho e so leitura'`.
- [ ] **Step 2–4:** RED → implement → GREEN; `pedido-de-compra`, `financeiro-fase0-compra` → PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(carrinho): carrinho por fornecedor que vira pedido de compra`

---

### Task 7: Documentação e regressão final

**Files:** Modify `FUNCIONALIDADES_SCTECH.txt` (Fornecedores, Clientes, Vendedores, Catálogo, Estoque, Configurações › Segurança, Galeria; nova seção do carrinho e do histórico; nota de simulador desligado).
- [ ] **Step 1:** Documentar em português simples, no estilo do arquivo.
- [ ] **Step 2:** `npm test` e **toda** a suíte e2e (servidores 8131 e 8123) → tudo PASS ou pulado com motivo; reportar cada falha.
- [ ] **Step 3: Commit** — `docs: carrinho, historico de fornecedor e menu de acoes`
