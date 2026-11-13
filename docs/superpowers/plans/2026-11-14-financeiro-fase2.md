# Financeiro Fase 2 — Resultado do mês, meta, ponto de equilíbrio e orçamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono vê o resultado de cada mês (entradas − saídas, imposto lançado/estimado), compara com a meta, sabe quanto precisa faturar para empatar e acompanha um orçamento por grupo de despesa; a Visão Geral passa a bater com Hoje/Extrato.

**Architecture:** Módulo puro novo `js/resultado-core.js` (`ResultadoCore`, `node --test`) com todas as contas do mês, reaproveitando `CaixaCore`. `js/app.js` só lê dados, salva configurações e desenha. Uma única função de "entradas/saídas do mês" alimenta Resultado do mês, Visão Geral e aviso da tela Hoje.

**Tech Stack:** HTML/CSS/JS puro, `localStorage`, Chart.js 4.4.0, `node --test`, Playwright fora do repo (`tests/e2e/README.md`).

**Spec:** `Docs/superpowers/specs/2026-11-14-financeiro-fase2-design.md`

## Global Constraints

- Sem dependências novas, sem backend. Branch `feat/financeiro-fase2`.
- Datas locais (`hojeLocal()`/`dataLocal(ms)`), mês `'YYYY-MM'`; dinheiro arredondado a centavos; ids com contador + `Set`.
- Grupos de saída e mapeamento de categorias exatamente como a tabela da spec §3; categoria nova `imposto` (rótulo "Imposto").
- Guia de imposto: campo `mes_referencia` (`'YYYY-MM'`) na conta a pagar `categoria:'imposto'`, preenchido com o mês anterior ao vencimento, editável.
- Chaves: `sc_empresa.meta_faturamento_padrao: number`, `sc_empresa.orcamento_padrao: { [grupo]: number }`, `sc_fin_metas: { 'YYYY-MM': number }` (já existe; 0/vazio = sem ajuste), `sc_fin_orcamento_mes: { 'YYYY-MM': { [grupo]: number } }`; todas em `_dadosExportacao`/`importarDados` (backup antigo sem elas → padrão vazio).
- Ids dos grupos: `'fornecedores' | 'servicos' | 'comissoes' | 'taxas' | 'fixas' | 'imposto' | 'outros'`; rótulos: "Fornecedores e materiais", "Costureira e instalador", "Comissões", "Taxas de cartão", "Despesas fixas", "Imposto", "Outros".
- Permissão nova `financeiro.resultado` ("Resultado do mês") em `MODULOS_PERMISSAO` e `FIN_TAB_MODULO`, com migração dos papéis salvos e `permissoes_extras` para o nível resolvido de `financeiro.dashboard` (mesmo padrão da Fase 1 em `migrarPermissoesSalvas`, app.js ~200).
- `js/resultado-core.js` incluído antes de `js/app.js` em todas as páginas que incluem `app.js`; `?v=` de **todos** os assets (js e css) sobe para `20261114a`.
- Escapar texto; nada de `prompt()`; modais `.sc-modal-overlay` com validação dentro; Escape fecha; sem empilhar.
- Valores digitados aceitam "30.000" e "30.000,50" (reusar `_valorDigitadoBaixa`).
- Testes: unit `tests/resultado-core.test.js`; e2e `tests/e2e/financeiro-fase2-*.spec.js`.
- Pendências novas → `Docs/superpowers/pendencias-financeiro.md`, seção "Da Fase 2".

## Review Focus

1. **Cartão parcelado 6x de R$ 1.000 (taxa 4%)**: cada mês recebe R$ 1.000 bruto de entrada e R$ 40 de taxa; nada conta antes da data do repasse (Task 1).
2. **Guia de imposto de outubro paga em novembro**: conta como imposto de outubro (lançado), não em novembro; novembro sem guia fica "(estimado)" (Task 1).
3. **Aluguel pago com atraso** (vence 05/10, pago 12/11): despesa fixa de outubro para o ponto de equilíbrio; saída de caixa de novembro (Task 1).
4. **Mês sem faturamento no meio do histórico**: margem usa os 3 meses fechados mais recentes com faturamento, pulando o vazio (Task 1).
5. **Mesmo mês em telas diferentes**: entradas/saídas do Resultado do mês = Visão Geral = soma do Extrato (sem transferências) (Task 4).

---

### Task 1: `ResultadoCore` (puro)

**Files:** Create `js/resultado-core.js` (IIFE, `module.exports` + `window.ResultadoCore`; pode usar `require('./caixa-core.js')` no node e `window.CaixaCore` no browser só se precisar de `somarDias`/`arredondar` — ou reimplementar localmente); Test `tests/resultado-core.test.js`

**Produces:**
- `GRUPOS: Array<{ id, rotulo, categorias: string[] }>` (ordem da spec) e `grupoDaCategoria(categoria) -> id` (não mapeada → `'outros'`).
- `entradasDoMes({ mes, contasReceber, movimentos, ateData? }) -> { total, itens: Array<{ data, valor, cr_id }> }` — regra da spec §9 (movimentos `origem:'cr'` do CR, senão a própria parcela paga pela `data_pagamento`); `ateData` limita (mês aberto "até hoje").
- `saidasDoMes({ mes, contasPagar, ateData? }) -> { total, porGrupo: { [grupo]: number } }` — CPs pagas com `data_pagamento` no mês, **exceto** `categoria:'imposto'` (o imposto vem de `impostoDoMes`).
- `impostoDoMes({ mes, contasPagar, faturamento, aliquota }) -> { valor, estimado: boolean, lancado: number }` — guias com `mes_referencia === mes` (pagas ou não); sem guia → `arredondar(faturamento × aliquota/100)`, `estimado: true`; sem alíquota e sem guia → `{ valor: 0, estimado: true, semAliquota: true }`.
- `resultadoDoMes({ mes, contasReceber, contasPagar, movimentos, aliquota, ateData? }) -> { entradas, taxas, faturamento /* entradas − taxas */, saidas /* inclui imposto */, porGrupo /* com imposto */, imposto, resultado /* entradas − saidas */ }`.
- `metaDoMes(mes, { padrao, ajustes }) -> number` (ajuste > 0 vence; senão padrão; senão 0).
- `despesasFixasDoMes({ mes, contasPagar, despesasFixas }) -> number` — regra da spec §9 (CP `tipo:'fixo'` por vencimento + DFs antigas sem `periodicidade`, ativas, não geradas).
- `margemContribuicao({ mesAtual, dadosPorMes: (mes) => resultadoDoMes, pedidosFallback?: Array<{ receita, custo_material, custos_vinculados, comissoes }>, aliquota }) -> { pct: number|null, base: 'historico'|'pedidos'|null, meses: string[] }` — 3 meses fechados (anteriores a `mesAtual`) mais recentes com faturamento > 0, até 12 para trás; margem = (faturamento − fornecedores − servicos − comissoes − imposto) ÷ faturamento, média dos meses.
- `pontoEquilibrio(despesasFixas, margemPct) -> { valor: number|null, motivo?: 'sem_margem'|'margem_negativa' }`.
- `statusOrcamento({ limites: { [grupo]: number }, gastos: { [grupo]: number } }) -> Array<{ grupo, limite, gasto, falta, pct, faixa: 'ok'|'perto'|'estourou' }>` (só grupos com limite > 0; `perto` ≥ 80%, `estourou` > 100%).

- [ ] **Step 1: Write the failing tests** (valores exatos):
  - `'cartao 6x: cada mes recebe 1000 bruto e 40 de taxa no mes do repasse'` (6 movimentos entrada 1000 + 6 CPs `taxa_cartao` pagas 40 nas mesmas datas).
  - `'entrada sem movimento usa data_pagamento; estornada nao conta; transferencia nao conta'`.
  - `'imposto pela referencia: guia de 2026-10 paga em novembro conta em outubro; novembro sem guia estimado 6% do faturamento'`.
  - `'sem aliquota e sem guia: semAliquota'`.
  - `'resultado = entradas - saidas (com imposto); faturamento = entradas - taxas'`.
  - `'metaDoMes: ajuste vence padrao; ajuste 0 usa padrao'`.
  - `'despesas fixas por vencimento: aluguel vencido em outubro e pago em novembro conta em outubro'`; DF anual com periodicidade não é projetada; DF antiga sem periodicidade não gerada entra.
  - `'margem pula mes sem faturamento e usa 3 fechados'`; `'sem historico usa pedidos e marca base pedidos'`.
  - `'ponto de equilibrio: fixas 9000 / 30% = 30000; margem <= 0 sem ponto'`.
  - `'orcamento: faixas ok, perto (80%), estourou (>100%), grupo sem limite fica de fora'`.
- [ ] **Step 2: Run** `node --test tests/resultado-core.test.js` → FAIL. **Step 3: Implement.** **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(resultado): nucleo do resultado do mes, imposto, ponto de equilibrio e orcamento`

---

### Task 2: Configurações — meta padrão, orçamento, categoria Imposto e permissão

**Files:** Modify `empresa.html` (Preferências: campo "Meta de faturamento mensal (padrão)" e card "Orçamento mensal" com um campo por grupo), `js/app.js` — `carregarEmpresaConfigs` (~861) e salvamento por merge em `sc_empresa`; formulário manual do A Pagar (`adicionarContaPagarManual` ~13295 e o HTML do modal com `cpm-categoria`) e despesas fixas: categoria "Imposto" + campo "Mês de referência" (visível só para Imposto; padrão = mês anterior ao vencimento); `CAT_LABELS`/`CAT_CORES` (~14628) com `imposto`; `MODULOS_PERMISSAO`, `FIN_TAB_MODULO`, `migrarPermissoesSalvas`; `_dadosExportacao`/`importarDados`; todas as páginas com `app.js` (incluir `resultado-core.js`, subir `?v=` de js e css para `20261114a`); Test `tests/e2e/financeiro-fase2-config.spec.js`

- [ ] **Step 1: Write the failing e2e**: `'meta padrao e orcamento salvos sem apagar outros campos da empresa'` ("30.000" → 30000); `'conta de imposto tem mes de referencia preenchido com o mes anterior ao vencimento e editavel'`; `'categoria Imposto aparece no grafico de despesas com rotulo'`; `'papel Vendedor salvo nao ganha Resultado do mes; Financeiro ganha'`; `'exportar e importar levam meta, orcamento e ajustes'`.
- [ ] **Step 2–4:** RED → implement → GREEN; `empresa-abas`, `financeiro-fase1-config`, `financeiro-bloqueio-menu`, `agendas-producao` (versão única) → PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(resultado): meta padrao, orcamento, categoria imposto e permissao`

---

### Task 3: Aba "📅 Resultado do mês"

**Files:** Modify `financeiro.html` (aba depois de Visão Geral, painel `#fin-resultado`), `js/app.js` — `mostrarTabFinanceiro` (~14029) + nova `renderResultadoMes(mes)`, `ajustarMetaMes(mes)`, `ajustarOrcamentoMes(mes, grupo)`, `exportarResultadoPDF(mes)`; `css/style.css`; Test `tests/e2e/financeiro-fase2-resultado.spec.js`

**Interfaces:** Consumes Task 1 (`resultadoDoMes`, `metaDoMes`, `despesasFixasDoMes`, `margemContribuicao`, `pontoEquilibrio`, `statusOrcamento`, `GRUPOS`), `CaixaCore.previsaoSemanal` (Fase 1) para "Previsto até o fim do mês", `abrirDocModal`/`buildEmpresaHeaderHTML`.
- Seletor de mês (padrão atual). Blocos: Resultado (Entradas · Saídas · Resultado verde/vermelho; "Faturamento líquido R$ X · meta R$ Y — bateu a meta / faltou R$ Z"); Saídas por grupo (tabela; Imposto com "(estimado)" e o aviso "guia ainda não lançada — estimativa R$ X" ou "Informe a alíquota em Empresa para estimar o imposto"); Ponto de equilíbrio (frase exata da spec, linha "empate · meta · faturado", avisos de estimativa/sem ponto); Orçamento (tabela com faixas e cores; ✏️ por grupo ajusta só aquele mês); Mês aberto: "Até hoje" e "Previsto até o fim do mês".
- ✏️ meta do mês (mesmo `sc_fin_metas`).
- Botão "📄 PDF" com cabeçalho da empresa.
- [ ] **Step 1: Write the failing e2e**: `'resultado de outubro com entradas, saidas por grupo e resultado'`; `'imposto estimado com aviso e lancado quando ha guia de referencia'`; `'meta: bateu / faltou e ajuste do mes'`; `'ponto de equilibrio com frase e comparacao'`; `'orcamento com faixas e ajuste do mes'`; `'mes atual mostra ate hoje e previsto ate o fim'`; `'PDF abre com o total'`; `'sem permissao a aba nao aparece'`.
- [ ] **Step 2–4:** RED → implement → GREEN; `financeiro-fase1-hoje`, `financeiro-bloqueio-menu` → PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(resultado): aba resultado do mes`

---

### Task 4: Visão Geral alinhada + aviso de orçamento na tela Hoje

**Files:** Modify `js/app.js` — `renderDashboardFinanceiro` (~14280) e funções dela que calculam recebido/fluxo por mês/meta/despesas por categoria, `renderHoje` (~14053); `financeiro.html` (legenda "pela data em que o dinheiro entra"); Test `tests/e2e/financeiro-fase2-alinhamento.spec.js`

**Interfaces:** Consumes `ResultadoCore.resultadoDoMes`, `metaDoMes`, `statusOrcamento`.
- Visão Geral: "recebido", gráfico dos 12 meses (entradas/saídas por mês), meta do mês (padrão + ajuste) e gráfico de despesas por categoria (saídas pagas do mês, incluindo taxa de cartão e imposto) passam a usar `ResultadoCore`. Não mudar KPIs não relacionados (pipeline, conversão, inadimplência…) além do necessário.
- Hoje: com `financeiro.resultado` (visualizar), para cada grupo `estourou` no mês atual, linha no topo "Orçamento de <grupo> estourado: R$ X acima".
- [ ] **Step 1: Write the failing e2e**: `'mesmo mes: Visao Geral = Resultado do mes = Extrato (sem transferencias)'` (seed com cartão parcelado, recebimento sem movimento, transferência e imposto); `'meta da Visao Geral usa o padrao quando o mes nao tem ajuste'`; `'grafico de despesas inclui taxa de cartao e imposto'`; `'Hoje mostra orcamento estourado so com permissao'`.
- [ ] **Step 2–4:** RED → implement → GREEN; `financeiro-fase0-*`, `financeiro-fase1-*` → PASS (ajustar só asserções que dependiam da regra antiga de data da baixa, mantendo a intenção); `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(resultado): visao geral pela mesma regra e aviso de orcamento no Hoje`

---

### Task 5: Documentação, pendências e regressão final

**Files:** `FUNCIONALIDADES_SCTECH.txt` (seção 10: meta padrão/ajuste, Resultado do mês, imposto lançado/estimado e mês de referência, ponto de equilíbrio, orçamento, Visão Geral alinhada, aviso no Hoje, permissão nova); `Docs/superpowers/pendencias-financeiro.md` (seção "Da Fase 2").
- [ ] **Step 1:** Documentar em português simples, conferindo contra o código.
- [ ] **Step 2:** Commit — `docs(financeiro): funcionalidades da fase 2`. (A suíte e2e completa é rodada pelo controlador.)
