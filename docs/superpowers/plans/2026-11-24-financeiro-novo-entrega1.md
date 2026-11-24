# Financeiro novo — Entrega 1 (Estrutura) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Financeiro com 4 abas (Resumo, Lançamentos, Fluxo de caixa, DRE), funções antigas desativadas, categorias da DRE, dados migrados (competência, categoria, cliente/fornecedor por id, Cancelado, histórico), telas Lançamentos e Resumo prontas; Fluxo de caixa e DRE com tela provisória ("Em construção") até as entregas 2 e 3.

**Architecture:** Caminho 1 da spec: os dados atuais (`sc_cr`, `sc_cp`, `sc_df`, `sc_contas_fin`, `sc_mov_fin`) continuam e ganham campos; dois núcleos puros novos (`js/fin-cat-core.js` para categorias/migração/regras de lançamento, `js/dre-core.js` para os números da DRE usados no Resumo); telas novas em `js/fin-novo.js`; `js/app.js` só ganha a integração (migração, geradores, permissões, roteamento).

**Tech Stack:** Vanilla JS sem build, localStorage, UMD + `node --test`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-23-financeiro-novo-design.md` (+ `docs/superpowers/specs/2026-11-23-financeiro-novo-referencia.pdf`, págs. 6–8 = layout). Esta entrega cobre as seções 5, 6.1, 6.2, 6.3, 6.6, 7.1, 7.2 e 8.

## Global Constraints
- Vanilla JS sem build; textos em português simples, exatos como na spec quando ela fixa o texto.
- `?v=` de todos os js/css em todas as páginas sobe para `20261205a` — só a Task 3 faz (e adiciona `js/fin-cat-core.js`, `js/dre-core.js` antes de `js/app.js` em todas as páginas que carregam app.js, e `js/fin-novo.js` depois de app.js em financeiro.html).
- Manter o fim de linha de cada arquivo (`file` para conferir); specs e2e novos em CRLF; e2e com relógio fixo (`page.clock`) e sem rede real.
- Nenhum dado financeiro existente pode ser perdido ou mudar de valor; a migração faz cópia antes (`sc_fin_backup_v3`).
- Transferência, `so_caixa`, ajuste de conferência e saldo inicial nunca entram em receita/despesa/DRE.
- Tema claro e escuro; celular sem rolagem horizontal da página.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` (seção do Financeiro) em cada task que muda tela.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pedido **não tem** status "Cancelado" no sistema: o "pedido cancelado" da spec é `excluirPedido` (app.js ~3555); "Voltar para Orçamento" (app.js ~7523) continua apagando e recriando as contas em aberto.

## Review Focus
- Usuário com acesso só a A Receber (papel Vendedor/Atendimento) → vê só a aba Lançamentos com só "Contas a receber"; sem Resumo. (teste na Task 4)
- Migração com dado sujo (CR sem pedido, CP com categoria desconhecida, cliente com nome repetido, rodar duas vezes) → não quebra, não duplica histórico, valores iguais. (teste na Task 1 e Task 3)
- Cartão com repasses e conta sem movimento → DRE caixa do mês igual às entradas/saídas do `ResultadoCore.resultadoDoMes`. (teste na Task 2)
- Parcelar R$ 100,00 em 3 → 33,33 / 33,33 / 33,34. (teste na Task 1)
- Lançamento Cancelado some de avisos, sino, previsão e DRE; pago não cancela. (teste na Task 3 e Task 5)

---

### Task 1: Núcleo de categorias, migração e regras de lançamento

**Files:**
- Create: `js/fin-cat-core.js` (UMD puro, global `FinCatCore`, mesmo molde de `js/agenda-core.js`)
- Test: `tests/fin-cat-core.test.js`

**Interfaces — Produces:**
- `FinCatCore.GRUPOS` = `[{id:'receitas',ordem:1,rotulo:'Receitas operacionais'},{id:'custos',ordem:2,rotulo:'Custos operacionais'},{id:'despesas',ordem:4,rotulo:'Despesas operacionais'},{id:'investimento',ordem:6,rotulo:'Atividades de investimento'},{id:'financiamento',ordem:7,rotulo:'Atividades de financiamento'}]`.
- `FinCatCore.categoriasPadrao() -> { subgrupos: [{id, nome, grupo}], categorias: [{id, nome, grupo, subgrupo_id, tipo, natureza, padrao:true, ativo:true}] }` com os ids estáveis: subgrupos `sub_var` "Despesas variáveis", `sub_fix` "Despesas fixas", `sub_out` "Outras despesas" (grupo despesas); categorias `cat_vendas` "Vendas de pedidos", `cat_outras_rec` "Outras receitas operacionais", `cat_tecido` "Tecido / Material", `cat_costureira` "Costureira", `cat_instalador` "Instalador", `cat_comissoes` "Comissões", `cat_taxa_cartao` "Taxas de cartão", `cat_impostos` "Impostos sobre vendas", `cat_aluguel` "Aluguel", `cat_salarios` "Salários", `cat_contas` "Contas (luz, internet…)", `cat_outras_desp` "Outras despesas", `cat_equip` "Compra de equipamentos e veículos" (investimento, saída), `cat_juros` "Juros e encargos" (financiamento, saída), `cat_rendimentos` "Rendimentos financeiros" (financiamento, entrada), `cat_aporte` "Aporte de capital" (natureza `so_caixa`, entrada, grupo `null`), `cat_emprestimo_in` "Empréstimo recebido" (`so_caixa`, entrada), `cat_emprestimo_out` "Pagamento de empréstimo (principal)" (`so_caixa`, saída).
- `FinCatCore.MAPA_LEGADO` = `{ tecido:'cat_tecido', costureira:'cat_costureira', instalador:'cat_instalador', comissao:'cat_comissoes', comissao_rt:'cat_comissoes', taxa_cartao:'cat_taxa_cartao', imposto:'cat_impostos', aluguel:'cat_aluguel', salario:'cat_salarios', conta:'cat_contas', outro:'cat_outras_desp' }`.
- `FinCatCore.categoriaDoLegado(cp|cr, tipo: 'pagar'|'receber') -> string` (receber: `cat_vendas` com `pedido_id`, senão `cat_outras_rec`; pagar: mapa, senão `cat_outras_desp`).
- `FinCatCore.planoMigracaoV4({ contas_receber, contas_pagar, despesas_fixas, pedidos, clientes, fornecedores, agoraISO }) -> { cr: [{id, set:{...}}], cp: [...], df: [...], pedidos: [{id, set:{data_aprovacao}}], avisos: [string] }` — só devolve o que muda (idempotente: registro que já tem `categoria_id` e `data_competencia` não aparece). Regras da spec 6.6: competência CR de pedido = menor `data_vencimento` das CR daquele pedido; CP com `mes_referencia` 'AAAA-MM' = 'AAAA-MM-01'; demais = `data_vencimento`; `pedido.data_aprovacao` = essa mesma menor data quando o pedido tem `financeiro_gerado` e não tem o campo; `cliente_id` pelo `pedido.clienteId`, senão nome exato único (sem acento/caixa); `fornecedor_id` por CNPJ (só dígitos) senão nome exato único; `historico` = `[{em: agoraISO, por:null, porNome:'Sistema', acao:'criado', detalhe:'Migrado do financeiro anterior'}]` só se não houver `historico`. `df`: `categoria_id` pelo mapa.
- `FinCatCore.competenciaPadrao({ origem: 'pedido'|'compra'|'recorrencia'|'imposto'|'manual', dataAprovacao, dataCompra, mesOcorrencia, mesReferencia, vencimento }) -> 'AAAA-MM-DD'`.
- `FinCatCore.dividirParcelas(valor: number, n: int, primeiroVenc: 'AAAA-MM-DD') -> [{parcela, valor, vencimento}]` (mensal; mesmo dia, ou último dia do mês quando não existe; centavos na última).
- `FinCatCore.acharParecido(novo: {valor, pessoaId|null, pessoaNome, vencimento, tipo}, lista) -> registro|null` (mesmo valor ao centavo, mesma pessoa (id, ou nome sem acento/caixa), vencimento a ±3 dias, ignora `status:'Cancelado'` e o próprio id).
- `FinCatCore.situacao(reg, hojeISO) -> 'aberto'|'vencido'|'pago'|'cancelado'` e `FinCatCore.ROTULO_SITUACAO = { aberto:'Em aberto', vencido:'Vencido', pago:{pagar:'Pago', receber:'Recebido'}, cancelado:'Cancelado' }`.
- `FinCatCore.podeCancelar(reg) -> {ok, motivo}` (pago → `{ok:false, motivo:'Estorne a baixa antes de cancelar.'}`); `FinCatCore.podeExcluir(reg) -> {ok, motivo}` (só `tipo_lancamento` manual/sem origem automática — sem `pedido_id`, `pedido_compra_id`, `papel_comissao`, `lancamento_pai_id` de recorrência, `origem_cr_id` — e não pago).
- `FinCatCore.registrarHistorico(reg, { acao, detalhe, por, porNome, em }) -> reg` (cria o array se faltar; acao ∈ criado|editado|baixa|estorno|cancelado|conciliado|categoria|excluido).

- [ ] **Step 1: Testes (falhando)** em `tests/fin-cat-core.test.js`: categoriasPadrao tem 18 categorias, ids acima, `cat_aporte.natureza==='so_caixa'`; MAPA_LEGADO de `comissao_rt` → `cat_comissoes`; categoriaDoLegado de CR sem pedido → `cat_outras_rec`, CP `categoria:'xyz'` → `cat_outras_desp`; planoMigracaoV4: pedido 7 com CR vencendo 2026-03-10 e 2026-05-02 → ambas `data_competencia:'2026-03-10'` e pedido `data_aprovacao:'2026-03-10'`; CP `mes_referencia:'2026-04'` → `'2026-04-01'`; cliente "Ana" duas vezes no cadastro → `cliente_id` não preenchido e um aviso; fornecedor por CNPJ "12.345.678/0001-90" casa com "12345678000190"; rodar o plano aplicado de novo → listas vazias; competenciaPadrao manual = vencimento; dividirParcelas(100,3,'2026-01-31') → valores [33.33,33.33,33.34] e vencimentos ['2026-01-31','2026-02-28','2026-03-31']; acharParecido acha 99,99 vs 99,99 com venc +3 e não acha com +4 nem cancelado; situacao Pendente com venc ontem → 'vencido'; podeCancelar pago → ok false; podeExcluir CR com pedido_id → ok false; registrarHistorico acrescenta sem apagar.
- [ ] **Step 2:** `npm test` → falha (módulo não existe).
- [ ] **Step 3:** Implementar `js/fin-cat-core.js` com as assinaturas acima; exportar via `module.exports` e `window.FinCatCore`.
- [ ] **Step 4:** `npm test` → tudo passa (contagem anterior + novos).
- [ ] **Step 5:** Commit `feat(fin): nucleo de categorias da DRE, migracao v4 e regras de lancamento`.

### Task 2: Núcleo da DRE (números)

**Files:**
- Create: `js/dre-core.js` (UMD, global `DreCore`; em node faz `require('./resultado-core.js')`/`caixa-core.js` como o resultado-core faz)
- Test: `tests/dre-core.test.js`

**Interfaces:**
- Consumes: `FinCatCore.GRUPOS`, `FinCatCore.categoriaDoLegado`; regras de caixa do `ResultadoCore` (js/resultado-core.js linhas ~49–110: entradas por movimentos `origem:'cr'` ou repasses de cartão, saídas = CP pagas por `data_pagamento`).
- Produces: `DreCore.calcular({ regime: 'caixa'|'competencia', de: 'AAAA-MM-DD', ate: 'AAAA-MM-DD', contas_receber, contas_pagar, movimentos, contas, categorias, subgrupos }) -> { linhas: { receitas, custos, margem, despesas, resultadoOperacional, investimento, financiamento, liquido }, porCategoria: { [catId]: number }, porSubgrupo: { [subId]: number }, lancamentos: { [catId]: [{tipo:'cr'|'cp', id, data, valor}] } }` — valores positivos para entradas, despesas/custos como números positivos nas linhas de grupo e subtraídos nas calculadas: `margem = receitas − custos`, `resultadoOperacional = margem − despesas`, `liquido = resultadoOperacional + investimento + financiamento` onde investimento/financiamento já vêm com sinal (saída negativa, entrada positiva). Registro sem `categoria_id` usa `FinCatCore.categoriaDoLegado`. Ignora `status:'Cancelado'`, categorias `so_caixa`, transferências, `origem:'ajuste'`.
- `DreCore.calcularMeses({ regime, ano, ...dados }) -> [12 resultados de calcular] + total` (usado na Entrega 2; implementar agora, é só o laço).
- `DreCore.ticketMedio({ pedidos, de, ate }) -> { valor, qtd }` = mesmo critério do ticket da tela inicial (app.js ~3969: pedidos aprovados no período, soma de `valor` ÷ quantidade), período por `data_aprovacao` (sem o campo: data do pedido).
- `DreCore.periodoAnterior(de, ate) -> {de, ate}` (mesmo tamanho imediatamente antes; mês cheio → mês anterior cheio).
- `DreCore.variacao(atual, anterior) -> number|null` (null quando anterior = 0).

- [ ] **Step 1: Testes (falhando)** em `tests/dre-core.test.js`: caso montado com 1 CR de pedido paga em 05/03 (R$ 1.000, movimento), 1 CP tecido paga 06/03 (R$ 300), 1 CP aluguel paga 10/03 (R$ 200), 1 CP juros 12/03 (R$ 50), 1 CP `cat_emprestimo_out` 15/03 (R$ 400), transferência entre contas 20/03, ajuste 25/03, 1 CP cancelada → caixa março: receitas 1000, custos 300, margem 700, despesas 200, resultadoOperacional 500, financiamento −50, liquido 450 (empréstimo, transferência, ajuste e cancelada fora); competência: CR com `data_competencia` em fevereiro e pagamento em março → aparece em fevereiro na competência e em março no caixa; **paridade**: com os dados de `tests/resultado-core.test.js` que têm cartão com repasses e conta sem movimento, `receitas` do caixa no mês == `ResultadoCore.resultadoDoMes(...).entradas` e custos+despesas+|investimento|+|financiamento negativo| == saídas sem imposto estimado; ticketMedio de 2 pedidos (1000, 3000) no mês → 2000, qtd 2; periodoAnterior('2026-03-01','2026-03-31') → fevereiro inteiro; variacao(110,100) → 10, variacao(5,0) → null.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar `js/dre-core.js`; para o caixa, reusar as funções exportadas do `ResultadoCore`/`CaixaCore` (se a regra de repasses não estiver exportada, exportá-la de `resultado-core.js` sem mudar comportamento).
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(fin): nucleo da DRE por regime (caixa/competencia) com paridade do resultado do mes`.

### Task 3: Dados no sistema — migração, geradores, Cancelado, histórico, contas bancárias

**Files:**
- Modify: `js/app.js` (carga/gravação de chaves ~271–282 e ~412–423; `gerarFinanceiroPedido` ~14575; `gerarContaPagarPC` ~10280; `gerarContasPagarDoMes` ~15320; comissões; importação de nota; `baixarContasReceber` ~14853; `baixarContasPagar` ~14975; estornos ~15009; `atualizarStatusVencimentos` ~14634; `excluirPedido` ~3555; backup export/import ~8458/8590), `js/caixa-core.js` e `js/resultado-core.js` (ignorar Cancelado), `js/notificacoes.js`/coletores `fin_*` (ignorar Cancelado), todas as `*.html` (`?v=20261205a` + scripts novos)
- Test: `tests/e2e/fin-novo-dados.spec.js`, acréscimos em `tests/caixa-core.test.js`

**Interfaces:**
- Consumes: Task 1 (`planoMigracaoV4`, `competenciaPadrao`, `categoriaDoLegado`, `registrarHistorico`, `categoriasPadrao`).
- Produces: chaves novas no `db`: `db.fin_categorias` (`sc_fin_cat`, objeto `{subgrupos, categorias}`), `db.fin_excluidos` (`sc_fin_excluidos`); `localStorage.sc_fin_versao = '4'`; `localStorage.sc_fin_backup_v3` (JSON `{em, sc_cr, sc_cp, sc_df, sc_contas_fin, sc_mov_fin}`); função `_migrarFinanceiroV4()` chamada logo depois de `_migrarFinanceiroFase0` (app.js ~13565); helper global `finHist(reg, acao, detalhe)` (usa usuário logado); `cancelarLancamento(tipo: 'cr'|'cp', id, motivo) -> bool`; campo `pedido.data_aprovacao` gravado em `gerarFinanceiroPedido` só se vazio; campos de conta bancária `banco, agencia, numero_conta, tipo, conexao:'manual', saldo_atualizado_em` (padrões na migração: `tipo:'corrente'`, `conexao:'manual'`, `saldo_atualizado_em` = data do último movimento da conta ou null).
- `excluirPedido`: CRs em aberto do pedido → `status:'Cancelado'`, `motivo_cancelamento:'Pedido excluído'` + histórico (em vez de `filter`); comissões pendentes idem. "Voltar para Orçamento" segue apagando/recriando (o novo `gerarFinanceiroPedido` preserva `data_aprovacao`).
- Todos os geradores gravam `categoria_id`, `data_competencia` (`competenciaPadrao`), `cliente_id`/`fornecedor_id` quando souberem, `historico` com `acao:'criado'`. Baixa/estorno chamam `finHist` e atualizam `saldo_atualizado_em` da conta.
- Cancelado ignorado em: `atualizarStatusVencimentos` (não vira Atrasado), `CaixaCore.lancamentosPrevistos`/`previsaoSemanal`/`tarefasHoje`, `ResultadoCore` (orçado/fixas), coletores `fin_*`, totais de "a receber" do pedido (`FinanceiroCore.totalRecebido` já conta só pago — conferir).

- [ ] **Step 1: e2e (falhando)** `tests/e2e/fin-novo-dados.spec.js` (CRLF, relógio fixo 2026-11-24 10:00): semear `sc_cr`/`sc_cp`/`sc_df`/`sc_contas_fin`/`sc_mov_fin` antigos (sem campos novos) → abrir financeiro.html → `sc_fin_versao==='4'`, `sc_fin_backup_v3` existe com os arrays originais, CR de pedido com `categoria_id:'cat_vendas'` e competência = menor vencimento, CP aluguel `cat_aluguel`, valores e saldos iguais aos de antes; recarregar → nada muda (mesmo JSON); aprovar um pedido novo → CR com `data_aprovacao` do pedido = hoje e `historico[0].acao==='criado'`; voltar o pedido para Orçamento e aprovar de novo em outra data (relógio +40 dias) → competência continua a primeira; excluir um pedido sem recebimento → as CRs ficam com status Cancelado e motivo "Pedido excluído"; CR Cancelada vencida não vira Atrasado e não aparece no sino; exportar backup e importar → `sc_fin_cat` e campos novos voltam.
- [ ] **Step 2:** rodar o spec → falha.
- [ ] **Step 3:** Implementar conforme Interfaces (scripts novos nas páginas, `?v=20261205a`).
- [ ] **Step 4:** `npm test` e os specs `fin-novo-dados`, `financeiro-*`, `pedidos-*`, `sino-notificacoes`, `alertas-ajustes` → passam.
- [ ] **Step 5:** Commit `feat(fin): migracao v4 (categorias, competencia, cancelado, historico) e geradores com os campos novos`.

### Task 4: Navegação — 4 abas, desativação e permissões

**Files:**
- Modify: `financeiro.html` (barra de abas ~17–25, painéis), `js/app.js` (`MODULOS_PERMISSAO` ~39, papéis padrão ~112, migração de permissões ~218–260, `FIN_TAB_MODULO` ~1656, `mostrarTabFinanceiro` ~16357, atalhos/links do sino e da tela inicial para abas antigas), `js/notificacoes.js` se tiver links
- Create: `js/fin-novo.js` (stub com `renderFinFluxoProvisorio()`/`renderFinDreProvisorio()` — "Em construção: chega na próxima atualização." — e os pontos de entrada das Tasks 5/6)
- Test: `tests/e2e/fin-novo-abas.spec.js`; atualizar/ marcar `test.skip` com comentário `// Desativado: ver FIN_RECURSOS_ANTIGOS` os specs e2e das telas desativadas (Hoje, Visão Geral, Resultado, Fechamento, Simulador, DRE por pedido, Extrato) — não apagar.

**Interfaces — Produces:**
- `const FIN_RECURSOS_ANTIGOS = { hoje:false, visaoGeral:false, resultado:false, fechamento:false, simulador:false, drePedido:false, extrato:false }` em app.js; com `false` a aba/botões/cartões não renderizam e os coletores de meta e tendência não rodam.
- Abas: `data-tab` = `resumo` "Resumo", `lancamentos` "Lançamentos", `fluxo` "Fluxo de caixa", `dre` "DRE"; padrão = primeira permitida. `FIN_TAB_MODULO = { resumo:'financeiro.resumo', lancamentos:['financeiro.pagar','financeiro.receber'], fluxo:'financeiro.fluxo', dre:'financeiro.dre', ...antigos }` (lancamentos visível se qualquer um dos dois).
- `MODULOS_PERMISSAO.financeiro.subs` = Resumo (`resumo`), Contas a receber (`receber`), Contas a pagar (`pagar`), Recorrências (`fixas`), Fluxo de caixa (`fluxo`), DRE (`dre`) — chaves antigas saem da lista mas continuam nos dados.
- Migração (no mesmo bloco ~218): sem chave nova → `financeiro.resumo` = maior nível entre `dashboard` e `hoje`; `financeiro.fluxo` = `extrato`; `financeiro.dre` = maior entre `dre` e `resultado`; mesma regra em `permissoes_extras` dos usuários; papel Vendedor/Atendimento padrão com `resumo`, `fluxo`, `dre` sem acesso.
- `?view=`/hash das abas antigas (`hoje`, `dashboard`, `resultado`, `simulador`, `extrato`) redireciona: `hoje`/`dashboard`/`resultado` → `resumo`; `receber`/`pagar`/`fixas` → `lancamentos` (lado certo); `extrato` → `fluxo`; `simulador` → `resumo`.

- [ ] **Step 1: e2e (falhando)** `fin-novo-abas.spec.js`: Admin vê exatamente 4 abas com esses textos, nenhuma de Hoje/Visão Geral/Resultado/Simular/Despesas Fixas/DRE por Pedido/Extrato; Fluxo e DRE mostram "Em construção"; usuário Vendedor (permissão antiga só `financeiro.receber`) vê só "Lançamentos" e dentro só "Contas a receber"; usuário com `dashboard: visualizar` antigo ganha Resumo; link antigo `financeiro.html?tab=hoje` abre Resumo; editor de papéis lista as 6 subpermissões novas; o card de vencimento da tela inicial/sino leva a Lançamentos.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** spec novo + `permissoes*`, `papeis*`, `sino-notificacoes`, `alertas-ajustes` passam; os specs desativados estão `skip` com o comentário.
- [ ] **Step 5:** Commit `feat(fin): 4 abas, recursos antigos desativados e permissoes novas`.

### Task 5: Tela Lançamentos

**Files:**
- Modify: `js/fin-novo.js` (tela), `financeiro.html` (painel `#fin-lancamentos`), `css/style.css`, `js/app.js` só se precisar expor helpers (baixa/estorno/cobrança já existentes são reusados), `FUNCIONALIDADES_SCTECH.txt`
- Test: `tests/e2e/fin-novo-lancamentos.spec.js`

**Interfaces:**
- Consumes: Tasks 1, 3 (`FinCatCore.*`, `finHist`, `cancelarLancamento`, `db.fin_categorias`), janelas de baixa existentes (`baixarContasReceber`/`baixarContasPagar` e seus modais), `cobrarNoWhatsApp`, `renderDespesasFixas` (vira "Recorrências").
- Produces: `renderFinLancamentos()`, `finLancLado` ('pagar'|'receber'), `abrirNovoLancamento(lado, idEditar?)`, `abrirHistoricoLancamento(tipo, id)`, `abrirRecorrencias()`.
- Layout (spec 7.2 + PDF pág. 6 quadro 2): seletor **Contas a pagar | Contas a receber**; barra: busca, Status (Todos, Em aberto, Vencido, Pago/Recebido, Cancelado), Cliente/Fornecedor, Categoria, Conta, Período (Vencimento | Competência; de/até, padrão mês atual), **+ Novo lançamento**, link **Recorrências** (só pagar). Tabela: Vencimento, Descrição, Cliente/Fornecedor, Categoria, Valor, Status (selo), Ações (⋮). ⋮: Dar baixa / Estornar, Editar, Cancelar, Excluir (só quando `podeExcluir`), Histórico, Abrir pedido (com pedido), Cobrar no WhatsApp (receber, em aberto). Rodapé "Total em aberto: R$ X". 50 por página.
- Formulário: Descrição*, Valor*, Cliente (receber) / Fornecedor (pagar) — lista do cadastro com opção de nome livre, Categoria* (só `tipo` certo, ativas), Conta prevista, Competência (padrão = vencimento), Vencimento*, Observações, Pedido (opcional), "Parcelar em [N] vezes" (2–48), "Repetir todo mês" (só pagar; cria registro em `sc_df` com a categoria). Ao salvar: `acharParecido` → `showConfirm("Já existe um lançamento parecido: <descrição> — R$ <valor> — vence <dd/mm/aaaa>. Salvar mesmo assim?")`.
- Cancelar: pede motivo (obrigatório); pago → aviso "Estorne a baixa antes de cancelar.". Excluir: confirma, grava em `db.fin_excluidos` `{registro, tipo, em, por, porNome}`.
- Permissões: cada lado exige o nível de hoje (`visualizar` para ver, `completo` para criar/editar/baixar/cancelar/excluir).

- [ ] **Step 1: e2e (falhando)** `fin-novo-lancamentos.spec.js` (relógio fixo): lista mostra CR/CP semeadas com status "Em aberto"/"Vencido"/"Recebido"/"Cancelado"; filtros por status, categoria e período (competência) reduzem a lista; novo lançamento a pagar parcelado 3× de R$ 100,00 cria 33,33/33,33/33,34 com vencimentos mensais e competência; lançamento igual a um existente abre o aviso de parecido e "Cancelar" não salva; dar baixa pela ⋮ usa a janela atual e o status vira "Pago"; cancelar pago mostra "Estorne a baixa antes de cancelar."; cancelar em aberto exige motivo e grava histórico; Histórico lista criado/baixa/cancelado com nome do usuário; Excluir só aparece em lançamento manual; "Repetir todo mês" cria a recorrência e ela aparece em Recorrências; Vendedor não vê o lado "Contas a pagar"; tema escuro sem texto ilegível (cor do texto ≠ cor do fundo); largura 390px sem rolagem horizontal da página.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** spec novo + `financeiro-*` ativos + `fin-novo-*` passam.
- [ ] **Step 5:** Commit `feat(fin): tela Lancamentos (pagar/receber, parcelas, recorrencia, cancelar, historico)`.

### Task 6: Tela Resumo

**Files:**
- Modify: `js/fin-novo.js`, `financeiro.html` (`#fin-resumo`), `css/style.css`, `js/app.js` (cadastro de conta bancária: campos banco/agência/conta/tipo), `FUNCIONALIDADES_SCTECH.txt`
- Test: `tests/e2e/fin-novo-resumo.spec.js`

**Interfaces:**
- Consumes: `DreCore.calcular`, `DreCore.ticketMedio`, `DreCore.periodoAnterior`, `DreCore.variacao`, `CaixaCore.saldosHoje`/`saldoConta`, `FinCatCore.situacao`.
- Produces: `renderFinResumo()`, `FIN_BANCOS` = lista `[{codigo, sigla, nome, cor}]` com: 001 BB Banco do Brasil; 104 CEF Caixa; 237 BRA Bradesco; 341 ITAÚ Itaú; 033 SAN Santander; 077 INTER Inter; 260 NU Nubank; 336 C6 C6 Bank; 756 SICOOB Sicoob; 748 SICREDI Sicredi; 290 PAG PagBank; 323 MP Mercado Pago; 000 — Outro (cores aproximadas da marca; texto do selo branco ou escuro pelo contraste).
- Layout (spec 7.1 + PDF pág. 6 quadro 1): cartão **Minhas contas** (linhas: selo, nome, "Conta corrente · Ag 0001 · CC 12345-6", saldo, etiqueta "Manual", "Atualizado em DD/MM HH:MM" ou "Sem movimentos"), linha **Saldo total**, botão **+ Conectar conta** (abre cadastro de conta com a nota exata da spec 7.1); período (Este mês, Mês passado, Trimestre, Ano, Personalizado) + regime Caixa/Competência (padrão Caixa); 4 indicadores **Lucro líquido**, **Margem líquida**, **Ticket médio**, **Receita** com "↑ 12%" verde / "↓ 8%" vermelho vs período anterior, ou "sem base de comparação"; margem líquida com receita 0 → "—"; cartão **Avisos**: "N contas a pagar vencidas · R$ X" e "N contas a receber vencidas · R$ X", lista vencidas + próximas 7 dias (pessoa, valor, vencimento, "há N dias"/"vence em N dias"/"vence hoje") com clique abrindo o lançamento em Lançamentos (lado certo, filtro aplicado e a linha destacada).

- [ ] **Step 1: e2e (falhando)** `fin-novo-resumo.spec.js` (relógio fixo 2026-11-24): 2 contas (Inter, Nubank) com saldos → linhas, "Manual", "Atualizado em …", Saldo total = soma; "+ Conectar conta" abre o cadastro com a nota do Open Finance; com os dados do teste da DRE (Task 2) em novembro, Lucro líquido/Receita/Margem batem com `DreCore.calcular` (valor exibido); outubro sem dados → "sem base de comparação"; trocar para Competência muda a Receita quando a competência difere; avisos: 1 CP vencida há 3 dias e 1 CR vencendo em 2 dias aparecem com os textos; cancelar a CP vencida em Lançamentos → some dos avisos; clicar no aviso abre Lançamentos com a linha; tema escuro e 390px.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** spec novo + todos `fin-novo-*` passam; `npm test` passa.
- [ ] **Step 5:** Commit `feat(fin): tela Resumo (contas, indicadores com comparacao, avisos)`.
