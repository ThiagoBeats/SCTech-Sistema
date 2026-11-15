# Pendências gerais — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** resolver todas as pendências abertas de `docs/superpowers/pendencias-gerais.md` (carrinho/histórico/menu de ações, tema escuro, balanço).

**Spec:** a fonte é o próprio `pendencias-gerais.md` + as decisões abaixo. Funcionalidades descritas em `FUNCIONALIDADES_SCTECH.txt`.

## Global Constraints
- Vanilla JS sem build. Textos de tela em português simples; textos citados aqui são exatos.
- Não mudar comportamento fora do item. Cada item: marcar `[x]` no `pendencias-gerais.md` com uma frase curta (ou "mantido de propósito: …").
- Se mudar `js`/`css`: subir o `?v=` de todos os `js`/`css` em todas as páginas para `20261123a` — só a Task 1 faz.
- Manter o fim de linha de cada arquivo (conferir `git diff --stat` com `--ignore-space-at-eol`).
- Testes: `npm test` e Playwright (`tests/e2e/`), servidor `RAIZ=<repo> PORTA=<porta> node tests/e2e/servidor.js`, rodar de `C:\Users\Asus\AppData\Local\Temp\sctech-e2e` com `BASE=… NODE_PATH=$PWD/node_modules TESTDIR=<repo>/tests/e2e npx playwright test -c repo.config.js <filtro>`; cada tarefa usa a porta que o controlador indicar e para o servidor que ligou.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Minhas decisões (rulings)
- G1 Quantidade digitada: mesma regra dos valores em R$ (`_valorDigitadoBaixa`): "1.000" = mil, "1,5" = 1,5, "1.250,50" = 1250,5, "1250.5" = 1250,5. Documentar.
- G2 Carrinho só com itens sem preço: deixa fechar, mas pergunta antes "Os itens deste carrinho estão sem preço: o pedido sai com valor R$ 0,00. Continuar?".
- G3 Mesmo item adicionado de novo com unidade diferente da gravada: vira outra linha (não soma quantidades de unidades diferentes).
- G4 Balanço com dois itens de mesmo nome: as sugestões mostram o tipo junto ("Nome — Tecido" / "Nome — Material") e o nome só preenche o código sozinho quando é único; com nomes repetidos, a pessoa escolhe na sugestão.
- G5 Tema escuro: revisar todas as telas e janelas; trocar cores claras fixas no estilo da linha por variáveis de CSS (com valor no tema escuro). Documentos/PDF (proposta, OS, pedido de compra, relatórios impressos) continuam claros de propósito.

## Tarefas

### Task 1: Carrinho, pedido de compra e histórico (dados, telas e testes)
Itens "Carrinho, histórico e menu de ações" → Dados (4): NaN no histórico sem datas; pedido novo nasce com `data_envio: null`; limpar registros de carrinho vazio; arredondamento do histórico unificado com o core. → Telas e textos: "1 itens" no singular ("1 item"); clique no ✕ logo após editar a quantidade não se perde; Enter confirma com foco no select de fornecedor da janela de adicionar; quantidade (G1); colspan da linha vazia igual ao número de colunas; filtro do histórico mantido ao abrir o PDF de um pedido; mesmo item com outra unidade (G3); carrinho só com itens sem preço (G2). Também sobe o `?v=`.

### Task 2: Menu ⋮, limpezas de código e testes
Itens: menu ⋮ aberto durante um re-render (fechar o menu quando a lista é redesenhada, ou reabrir apontando para os ids novos); comentários de cabeçalho da galeria que citam o simulador; loader do SheetJS num lugar só (app.js e importador-ui.js usam a mesma função); comentário sobre escapar `onclick` no `menuAcoesHtml`. Testes: menu ⋮ — posição (flip) perto da borda e tema escuro; teste "não contém Simular" restrito ao lugar certo; seletor solto no teste do ver senha.

### Task 3: Tema escuro em todas as telas
Item "Tema escuro: outras telas e janelas ainda têm cores claras fixas…" com G5. Varrer `*.html` e o HTML gerado em `js/*.js` por cores claras fixas em `style=""` (fundos `#fff`, `#FAFAFA`, `#F5F5F5`, `#E4EFF9`, `#FEF4F2`, textos escuros fixos etc.), trocar por classes/variáveis com versão escura. Teste e2e: abrir cada página principal no tema escuro e conferir que os blocos principais não têm fundo claro (cor de fundo calculada com luminância baixa) — uma lista de seletores por página.

### Task 4: Balanço com nomes repetidos
Item "Balanço: dois itens com o mesmo nome…" com G4. Teste.

### Task 5: Documentação
`FUNCIONALIDADES_SCTECH.txt` com o que mudou nas Tasks 1–4 (textos exatos, G1–G5); conferir que todos os itens do `pendencias-gerais.md` estão `[x]`.
