# Financeiro novo — Entrega 2 (DRE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba DRE deixa de ser "Em construção": tabela anual por mês com grupos expansíveis, regime Caixa/Competência, cadastro de categorias, clique no valor mostra os lançamentos, relatórios de análise vertical (AV%) e horizontal (AH%) com intervalos, PDF, Excel e imprimir.

**Architecture:** O cálculo continua no núcleo puro `js/dre-core.js` (ganha a montagem da tabela por períodos e as análises AV/AH); a tela fica em `js/fin-dre.js` (novo, carregado depois de `js/fin-novo.js` em financeiro.html). Categorias continuam em `db.fin_categorias` (`sc_fin_cat`).

**Tech Stack:** Vanilla JS sem build, localStorage, UMD + `node --test`, Playwright e2e; SheetJS pelo carregador existente `garantirSheetJs()` (js/app.js ~10525); PDF/impressão por janela de impressão com `.doc-claro`.

**Spec:** `docs/superpowers/specs/2026-11-23-financeiro-novo-design.md` seção 7.4 (e 6.1 para categorias); layout: `docs/superpowers/specs/2026-11-23-financeiro-novo-referencia.pdf` págs. 6 (quadro DRE), 7 (análise vertical), 8 (análise horizontal).

## Global Constraints
- Vanilla JS sem build; textos em português, exatos como na spec quando ela fixa.
- `?v=` de todos os js/css em todas as páginas sobe para `20261206a` — só a Task 2 faz (e adiciona `js/fin-dre.js` depois de `js/fin-novo.js` em financeiro.html).
- Manter fim de linha (git `core.autocrlf=true`); specs e2e novos em CRLF; relógio fixo (`page.clock`); sem rede real.
- Nenhum número da DRE pode divergir de `DreCore.calcular` para o mesmo período/regime (a tabela é só montagem).
- Negativos em vermelho entre parênteses "(45.932)"; na tabela sem centavos; no detalhe com centavos.
- AV%: base = Receitas operacionais do período (100%); custos/despesas mostram % positivo; receita 0 → "—".
- AH%: vs período anterior; custos/despesas pelo valor absoluto com cor favorável (verde) / desfavorável (vermelho); anterior 0 → "—"; acima de 999% → "> 999%"; seta ↑/↓.
- Intervalos: Mensal, Trimestral, Semestral, Anual, Personalizado (de/até).
- Tema claro e escuro; 390px sem rolagem horizontal da página (a tabela rola dentro do próprio quadro).
- Permissão: `financeiro.dre` (`visualizar` para ver/exportar; `completo` para mexer em categorias).
- Atualizar `FUNCIONALIDADES_SCTECH.txt` (Financeiro › DRE).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
- Categoria desativada ou apagada com lançamentos antigos → valores continuam aparecendo (na própria categoria, marcada "(inativa)"), total não muda. (Task 1 e 2)
- Ano sem nenhum dado → tabela com zeros e sem erro; AV/AH mostram "—". (Task 1)
- Período personalizado que não começa no dia 1 (ex.: 15/01–14/03) em Mensal → períodos parciais com rótulo de datas, sem perder dias. (Task 1)
- Resultado operacional negativo → AH% com base negativa: variação calculada sobre o valor absoluto do anterior e cor pela melhora/piora do resultado. (Task 1)
- Muitas categorias (30+) e celular → expandir/recolher continua usável, cabeçalho legível. (Task 2)

---

### Task 1: Núcleo — tabela por períodos e análises AV/AH

**Files:** Modify `js/dre-core.js`; Test `tests/dre-core.test.js`.

**Interfaces — Consumes:** `DreCore.calcular` (existente; devolve `linhas`, `porCategoria`, `porSubgrupo`, `lancamentos`), `FinCatCore.GRUPOS`, `FinCatCore.categoriasPadrao()`.
**Produces:**
- `DreCore.periodos(de, ate, intervalo: 'mensal'|'trimestral'|'semestral'|'anual'|'personalizado') -> [{ rotulo, de, ate }]` — mensal "Jan/26"; trimestral "1º tri/26"; semestral "1º sem/26"; anual "2026"; personalizado = um único período "DD/MM/AA–DD/MM/AA"; período parcial (corte no de/ate) usa rótulo de datas "15/01–31/01".
- `DreCore.tabela({ regime, de, ate, intervalo, ...dados }) -> { periodos, linhas: [{ chave, tipo: 'grupo'|'subgrupo'|'categoria'|'calculada'|'percentual', nivel: 0|1|2, id, rotulo, pai: chave|null, sinal: 'entrada'|'saida'|'resultado', valores: number[], total: number, inativa?: bool }] }` — ordem: Receitas operacionais (A) → categorias; Custos operacionais (B) → categorias; Margem de contribuição (A−B); "% margem de contribuição" (percentual, `valores` em %, total = margem total ÷ receita total); Despesas operacionais (C) → subgrupos → categorias (categorias sem subgrupo direto no grupo); Resultado operacional; Atividades de investimento → categorias; Atividades de financiamento → categorias; RESULTADO LÍQUIDO. Linhas de custo/despesa com valores positivos e `sinal:'saida'` (a tela mostra entre parênteses); investimento/financiamento com sinal (saída negativa). Só entram categorias/subgrupos com valor ≠ 0 em algum período **ou** ativos (categoria inativa sem valor some). `total` = soma dos períodos (percentual: recalculado).
- `DreCore.analiseVertical(tabela) -> { [chave]: (number|null)[] }` — % de cada linha sobre `receitas` do mesmo período, uma casa decimal; custos/despesas positivos; receita 0 → null.
- `DreCore.analiseHorizontal(tabela) -> { [chave]: [{ pct: number|null, acima999: bool, seta: 'up'|'down'|null, favoravel: bool|null }] }` — primeiro período sem comparação (null); demais vs período anterior: `pct = (atual − anterior) ÷ |anterior| × 100` (duas casas); `seta` pelo sinal de (atual − anterior) no valor absoluto mostrado; `favoravel`: entradas/resultados → subir é favorável; custos/despesas (sinal 'saida') → subir é desfavorável; anterior 0 → pct null.

- [ ] **Step 1: Testes (falhando)** em `tests/dre-core.test.js`: `periodos('2026-01-01','2026-12-31','trimestral')` → 4 com rótulos "1º tri/26"…"4º tri/26"; `periodos('2026-01-15','2026-03-14','mensal')` → 3 períodos, primeiro `{de:'2026-01-15', ate:'2026-01-31', rotulo:'15/01–31/01'}`, último até 14/03; ano vazio → `tabela` com todas as linhas fixas e zeros, AV null; **exemplo AV do PDF**: receitas 50.000 (cortinas 15.000, persianas 20.000, instalações 15.000), custos 10.000 → AV 100/30/40/30/20; **exemplo AH do PDF** (jan→fev): receitas 20.000→30.000 → pct 50 up favorável; categoria 5.000→15.000 → 200; custos 8.000→12.000 → pct 50 seta up **favoravel false**; resultado operacional 7.000→12.000 → 71.43; anterior 0 → pct null; 100→1.200 → acima999 true; resultado −5.000→2.000 → pct 140, up, favorável; categoria inativa com lançamento aparece com `inativa:true` e entra no total; soma dos `valores` de cada linha == `DreCore.calcular` do período equivalente (laço sobre os 12 meses de um caso montado).
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar em `js/dre-core.js` (reusar `calcular` por período; nada de recalcular regras).
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(fin): DRE por periodos com analise vertical e horizontal no nucleo`.

### Task 2: Tela DRE (tabela anual, expandir, regime, detalhe, categorias)

**Files:** Create `js/fin-dre.js`; Modify `financeiro.html` (painel `#fin-dre`, script novo, `?v=` em todas as páginas), `js/fin-novo.js` (tirar o provisório da DRE; o roteador chama `renderFinDre()`), `css/style.css`, `FUNCIONALIDADES_SCTECH.txt`; Test `tests/e2e/fin-dre.spec.js`.

**Interfaces — Consumes:** Task 1 (`DreCore.tabela`, `DreCore.periodos`), `DreCore.calcular(...).lancamentos`, `db.fin_categorias`, `abrirLancamentoNaLista(tipo, id)` (js/fin-novo.js, Entrega 1).
**Produces:** `renderFinDre()`, estado `finDre = { regime:'caixa', ano, abertos:Set<chave> }`, `abrirDetalheDre(chaveLinha, indicePeriodo)`, `abrirCategoriasDre()`, `finDreTabelaAtual()` (a tabela exibida, usada pelos exportadores da Task 3).
- Topo: título "DRE — Resultado da empresa", **Regime: Caixa | Competência**, **Ano** (anos com dados + atual), botões **Relatórios**, **PDF**, **Excel**, **Imprimir** (os 4 ligados pela Task 3; nesta task só aparecem e chamam funções que a Task 3 define — deixar stubs `abrirRelatoriosDre()`, `exportarDrePdf()`, `exportarDreExcel()`, `imprimirDre()` que mostram "Em breve." até a Task 3), **Categorias** (só com `completo`).
- Tabela (PDF pág. 6, quadro 4): colunas "RESULTADO", Jan … Dez, "Total AAAA"; linha de grupo com ícone **+**/**−** (recolhido por padrão: mostra só grupos e calculadas); expandir mostra só os filhos diretos (subgrupos expandem de novo); sem repetir o nome do grupo; valores inteiros com separador de milhar; saídas entre parênteses em vermelho; resultado negativo em vermelho entre parênteses; linha "% margem de contribuição" em cinza abaixo da margem; RESULTADO LÍQUIDO destacado; primeira coluna fixa ao rolar horizontalmente.
- Clique num valor de **categoria** → janela "Categoria — Mês/Ano" com a lista dos lançamentos (data, descrição, pessoa, valor com centavos, total) e clique numa linha abre o lançamento em Lançamentos (`abrirLancamentoNaLista`). Valor 0 não é clicável.
- **Categorias** (janela): por grupo (Receitas, Custos, Despesas, Investimento, Financiamento, Só caixa), lista com renomear, mover de subgrupo (só despesas/custos/receitas), ativar/desativar; "+ Nova categoria" (nome*, grupo*, subgrupo, tipo entrada/saída conforme o grupo — receitas = entrada, custos/despesas = saída, investimento/financiamento escolhe); "+ Novo subgrupo" (nome, grupo despesas/custos/receitas); categoria com lançamentos não é apagada (só desativa; botão Excluir só aparece sem lançamentos); nome repetido no mesmo grupo é recusado ("Já existe uma categoria com esse nome neste grupo."). Grava em `db.fin_categorias` via `_gravarChaves(['sc_fin_cat'])`. Categorias desativadas somem dos formulários de Lançamentos mas continuam na DRE se tiverem valor.

- [ ] **Step 1: e2e (falhando)** `tests/e2e/fin-dre.spec.js` (relógio fixo 2026-11-24): com CR/CP semeadas em vários meses de 2026, a tabela mostra os 8 grupos/calculadas na ordem, "Total 2026" igual à soma; recolhido não mostra categorias; clicar **+** em Despesas operacionais mostra os subgrupos e, expandindo "Despesas fixas", "Aluguel"; um custo aparece como "(1.200)" com classe vermelha; trocar para Competência muda o mês de um recebimento com competência em outro mês; clicar no valor de "Aluguel" em março abre a lista com o lançamento e, clicando nele, vai para Lançamentos com a linha destacada; Categorias: criar "Frete" em Despesas › variáveis aparece no formulário de novo lançamento a pagar; desativar "Frete" some do formulário; nome repetido mostra o aviso; usuário com `dre: visualizar` não vê o botão Categorias; ano sem dados mostra zeros; 390px sem rolagem horizontal da página e tema escuro legível.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar (e `?v=20261206a` + script novo).
- [ ] **Step 4:** spec novo + `fin-novo-*` passam; `npm test` passa.
- [ ] **Step 5:** Commit `feat(fin): tela DRE com grupos expansiveis, regime, detalhe e cadastro de categorias`.

### Task 3: Relatórios AV/AH e exportação (PDF, Excel, imprimir)

**Files:** Modify `js/fin-dre.js`, `css/style.css`, `FUNCIONALIDADES_SCTECH.txt`; Test `tests/e2e/fin-dre-relatorios.spec.js`.

**Interfaces — Consumes:** Task 1 (`periodos`, `tabela`, `analiseVertical`, `analiseHorizontal`), Task 2 (`finDreTabelaAtual`, stubs a substituir), `garantirSheetJs()`.
**Produces:** `abrirRelatoriosDre()`, `exportarDrePdf()`, `exportarDreExcel()`, `imprimirDre()`, e as mesmas três para o relatório aberto.
- **Relatórios** (janela ou painel em tela cheia dentro da aba): título "Análise Vertical" / "Análise Horizontal" (seletor **Tipo: Vertical | Horizontal**); filtros no topo como nas págs. 7–8: **Visualizar por** (Caixa | Competência), **Intervalo** (Mensal, Trimestral, Semestral, Anual, Personalizado), **Período** de/até (padrão 01/01 do ano até hoje); tabela com os mesmos grupos expansíveis da DRE; Vertical: para cada período "valor" + "AV%"; Horizontal: "valor" + "AH%" a partir do 2º período, com seta ↑/↓ e cor favorável/desfavorável; "—" sem base; "> 999%". Inclui investimento, financiamento e resultado líquido. Clique numa categoria abre o detalhe (mesma janela da Task 2).
- **Excel:** arquivo `DRE_<regime>_<ano>.xlsx` (DRE) ou `Analise_<vertical|horizontal>_<de>_<ate>.xlsx`, uma aba, linhas na ordem da tabela **com todas as categorias expandidas**, números como número (não texto), percentuais como número com 1 casa; sem internet: aviso do `garantirSheetJs` ("Não foi possível carregar o gerador de planilhas — verifique sua conexão.").
- **PDF/Imprimir:** abre a janela de impressão com documento claro (`.doc-claro`), cabeçalho com nome da empresa, título, regime e período, tabela expandida, paisagem (`@page { size: A4 landscape }`); PDF = mesma janela com a dica "Escolha 'Salvar como PDF' na impressora.".

- [ ] **Step 1: e2e (falhando)** `fin-dre-relatorios.spec.js`: Vertical com os dados do exemplo do PDF (jan) mostra 100%/30%/40%/30%/20%; Horizontal jan→fev mostra "+50%" verde em receitas, "+50%" vermelho em custos, "71,43%" no resultado operacional, "—" na coluna sem base; Intervalo Trimestral mostra "1º tri/26"; Personalizado 15/01–14/03 em Mensal mostra "15/01–31/01"; Excel: com `window.XLSX` simulado (stub que guarda o workbook), o nome do arquivo e a primeira linha de dados batem e valores são números; Imprimir abre a janela (interceptar `window.open`) com o título e "Regime: Caixa"; sem `XLSX` e com `garantirSheetJs` falhando (rota do CDN abortada) aparece o aviso de conexão.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** spec novo + `fin-dre` + `fin-novo-*` passam; `npm test` passa.
- [ ] **Step 5:** Commit `feat(fin): relatorios de analise vertical e horizontal, PDF, Excel e impressao da DRE`.
