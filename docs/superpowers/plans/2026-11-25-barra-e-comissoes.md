# Barra lateral fluida e comissões como registro — design curto + plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Pedido do dono (2026-11-25):**
1. Barra lateral: ao passar o mouse ela cresce, mas os botões mudam o espaçamento vertical (fechada, a área dos botões fica menor do que aberta). O espaçamento aberto deve ser **igual** ao fechado. A transição é dura ("dá um soco e depois começa a crescer"): deve ser fluida e natural, sem parecer dois elementos separados.
2. Comissões: a comissão é só um **registro interno** ligado ao vendedor e ao pedido. Quando o pedido é instalado vira **pendente de pagamento**, mas **não** gera lançamento em Contas a Pagar. Controle por vendedor (pedidos, valores, %, total acumulado); no fechamento do mês consulta quanto cada um tem a receber e registra o pagamento manualmente (status **paga**). Não alterar os demais fluxos.
**Decisão do dono:** o pagamento registrado **sai de uma conta** (aparece no Fluxo de caixa e como despesa "Comissões" na DRE caixa).
**Minhas decisões (aprovadas junto):** a comissão de arquiteto/RT segue a mesma regra; comissões em aberto já lançadas em Contas a Pagar saem de lá e voltam ao pedido como "pendente de pagamento"; as já pagas ficam como histórico.

## Design
### 1. Barra lateral (`css/style.css` ~109–170, html `data-sidebar="collapsed"`)
- Altura, margem e espaçamento de cada `.nav-item` idênticos fechada e aberta (o item fechado mede 46px com margem 2px; o aberto passa a ter a mesma altura/margem; só a largura muda).
- Abertura: uma única transição de `width` (e do padding, se necessário) de ~200 ms com `cubic-bezier(.2,.8,.2,1)`; textos não usam `display:none` (que causa o salto) — ficam no layout com `opacity`/`max-width` animados junto, cortados por `overflow:hidden`, sem quebrar linha; logo e botão de fixar idem. `prefers-reduced-motion: reduce` → sem transição. Nenhuma mudança de visual (cores, ícones, tamanhos, posições).

### 2. Comissões
- **Dados no pedido** (campos que já existem: `comissao_pct`, `comissao_valor`, `comissao_paga`, `comissao_data_pgto`; arquiteto `arq_*` igual): novo `comissao_status: 'registrada'|'pendente'|'paga'` (e `arq_comissao_status`), `comissao_mov_id` (movimento do pagamento), `comissao_conta_id`, `comissao_historico: [{em, por, porNome, acao, detalhe}]` (e `arq_*`).
  - Aprovação do pedido → `registrada` (valor e % como hoje). Pedido vira "Instalado" (todos os caminhos que hoje chamam `gerarComissoesPedido`, app.js ~4004/4129/7665/9322) → `pendente`. Voltar de Instalado (status anterior) → volta a `registrada` se não estiver paga. Valor 0/sem vendedor → sem comissão.
  - `gerarComissoesPedido` deixa de criar contas a pagar.
- **Pagamento:** `registrarPagamentoComissoes({ itens: [{pedidoId, papel:'vendedor'|'arquiteto'}], contaId, data })` → para cada item pendente: cria movimento `{ sentido:'saida', origem:'comissao', origem_id: pedidoId, papel, valor, conta_id, data, descricao:'Comissão <nome> — Pedido #N', categoria_id:'cat_comissoes' }`, marca `paga`, `comissao_paga=true`, `comissao_data_pgto=data`, histórico; atualiza `saldo_atualizado_em`. **Desfazer pagamento** remove o movimento e volta a `pendente` (histórico). Permissão: `vendedores` completo (ou `financeiro.pagar` completo).
- **Financeiro enxerga o movimento `origem:'comissao'`:** saldos (já contam todo movimento), Fluxo (realizado; categoria `cat_comissoes`; relatório por categoria), DRE caixa (despesa variável Comissões pela data do movimento), DRE competência (pela `data_instalado` do pedido; inclui pendentes e pagas, não as `registrada`), Resumo (lucro), conciliação (o movimento pode ser ligado a uma linha do extrato como os demais). Não aparece em Lançamentos.
- **Migração (uma vez, `sc_comissao_v2`):** CPs com `papel_comissao` (ou categoria `comissao_rt`) **em aberto** são removidas (registradas em `fin_excluidos` com motivo "Comissão passou a ser registro do pedido") e o pedido fica `pendente` (se Instalado) ou `registrada`; CPs de comissão **pagas** continuam como estão (o pedido fica `paga`, com `comissao_mov_id` apontando para o movimento da baixa, se houver). Pedidos antigos sem status: `paga` se `comissao_paga`, `pendente` se Instalado, senão `registrada`.
- **Tela Vendedores › Comissões** (substitui "Comissões pendentes" e "Histórico" atuais, mesmo lugar e visual): filtros Vendedor (todos/cada um, incluindo arquitetos) e Mês (data de instalação; "Todos"); tabela Data, Pedido, Cliente, Valor do pedido, %, Comissão, Status (Registrada/Pendente/Paga), Pago em; cartões por vendedor: **Acumulado** (pendente + paga no filtro), **A pagar** (pendente), **Pago**; seleção de linhas pendentes + botão **Registrar pagamento** (janela: conta*, data* (hoje), total) e **Pagar todos os pendentes de <vendedor>**; em linha paga, ⋮ **Desfazer pagamento**; clique no pedido abre o pedido.

## Global Constraints
- Vanilla JS sem build; textos em português, exatos como acima.
- `?v=` de todos os js/css em todas as páginas sobe para `20261209a` — só a Task 1 faz.
- Manter fim de linha (git `core.autocrlf=true`); specs e2e novos em CRLF; relógio fixo; sem rede real.
- Nenhum valor de comissão existente muda; nenhuma comissão paga é desfeita pela migração.
- Atualizar `FUNCIONALIDADES_SCTECH.txt`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1: Barra lateral
**Files:** css/style.css (+ js só se o hover depender de script), todas as páginas (`?v=`); test `tests/e2e/barra-lateral.spec.js`.
- e2e: com a barra recolhida, medir a posição vertical (top) e a altura de cada `.nav-item` com e sem hover → iguais (±1px); durante a abertura (meio da transição, `page.clock`/espera de 100 ms) a largura está entre fechada e aberta (não salta direto); `.nav-text` nunca com `display:none` durante a abertura; com `reducedMotion:'reduce'` a largura final aparece sem transição; tema escuro igual.

### Task 2: Núcleo e dados das comissões
**Files:** js/financeiro-core.js (ou novo `js/comissao-core.js` puro: status, totais por vendedor, plano de migração), js/app.js (estados nos caminhos de status, `gerarComissoesPedido` sem CP, `registrarPagamentoComissoes`, `desfazerPagamentoComissao`, migração), js/dre-core.js / js/resultado-core.js / js/fluxo-core.js (movimento `origem:'comissao'` como saída `cat_comissoes`; competência pela `data_instalado`); tests `tests/comissao-core.test.js` + acréscimos nos testes de dre/fluxo; e2e `tests/e2e/comissoes-dados.spec.js`.
- Testes: aprovação → registrada; instalado → pendente e **nenhuma** CP nova; voltar status → registrada; pagamento cria 1 movimento por comissão com categoria Comissões, saldo da conta cai, Fluxo mostra a saída, DRE caixa do mês tem Comissões = valor; DRE competência no mês da instalação; desfazer remove o movimento; migração: CP aberta some (vai para fin_excluidos) e pedido pendente, CP paga continua e pedido paga; rodar a migração duas vezes não muda nada.

### Task 3: Tela Vendedores › Comissões
**Files:** vendedores.html, js/app.js (render), css; test `tests/e2e/comissoes-tela.spec.js`.
- e2e: filtros vendedor/mês; cartões Acumulado/A pagar/Pago batem com as linhas; Registrar pagamento de 2 linhas → status Paga, "Pago em", movimento na conta escolhida; Pagar todos os pendentes; Desfazer pagamento; sem permissão não vê os botões; Contas a Pagar não recebe nada em nenhum desses passos.
