# Financeiro novo — Entrega 3 (Fluxo de caixa e conciliação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba Fluxo de caixa deixa de ser o Extrato provisório: saldo inicial/entradas/saídas/saldo final do período, realizado e previsto, por dia/semana/mês, gráfico e lista de movimentações, transferências, relatórios, importação do extrato do banco (OFX) e conciliação com os lançamentos.

**Architecture:** Dois núcleos puros novos — `js/fluxo-core.js` (números do fluxo) e `js/conciliacao-core.js` (leitura de OFX e sugestões de correspondência) — e a tela em `js/fin-fluxo.js` (novo, depois de `js/fin-dre.js` em financeiro.html). Baixas continuam pelas funções existentes (`baixarContasReceber`/`baixarContasPagar`), transferências pela rotina existente (app.js ~18020).

**Tech Stack:** Vanilla JS sem build, localStorage, UMD + `node --test`, Playwright e2e, Chart.js local (`js/vendor/chart.umd.min.js`), exportação pelos helpers de PDF/Excel/imprimir da DRE (`js/fin-dre.js`) e `garantirSheetJs()`.

**Spec:** `docs/superpowers/specs/2026-11-23-financeiro-novo-design.md` seções 6.4 e 7.3; layout `docs/superpowers/specs/2026-11-23-financeiro-novo-referencia.pdf` pág. 6 (3º quadro).

## Global Constraints
- Vanilla JS sem build; textos em português, exatos como na spec quando ela fixa.
- `?v=` de todos os js/css em todas as páginas sobe para `20261207a` — só a Task 3 faz (e adiciona `js/fluxo-core.js` e `js/conciliacao-core.js` antes de `js/app.js` em todas as páginas que carregam app.js, e `js/fin-fluxo.js` depois de `js/fin-dre.js` em financeiro.html).
- Manter fim de linha (git `core.autocrlf=true`); specs e2e novos em CRLF; relógio fixo; sem rede real.
- **Transferências:** com "Todas as contas" não entram em Entradas/Saídas (aparecem na lista marcadas "Transferência"); filtrando uma conta, contam como entrada/saída dela. Nunca receita/despesa.
- Realizado = movimentos (`db.movimentos_fin`); Previsto = contas em aberto (não Canceladas) pelo vencimento, de hoje em diante (mesma regra de `CaixaCore.lancamentosPrevistos`, inclusive repasses de cartão e recorrências do mês).
- Extrato importado em `db.fin_extrato` (`sc_fin_extrato`): `{ id, conta_id, fitid, data, valor (com sinal), descricao, importado_em, arquivo, situacao: 'pendente'|'conciliado'|'ignorado'|'transferencia', mov_id|null, mov_ids?: [] }`; mesmo `fitid` + conta não entra duas vezes.
- Conciliação nunca cria lançamento sem passar pela checagem de duplicidade (`FinCatCore.acharParecido`) e registra no histórico (`acao:'conciliado'`).
- Permissões: ver = `financeiro.fluxo` visualizar; importar/conciliar/transferir = `financeiro.fluxo` completo; dar baixa via conciliação exige também `completo` no lado (`financeiro.pagar`/`financeiro.receber`).
- Tema claro e escuro; 390px sem rolagem horizontal da página.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` (Financeiro › Fluxo de caixa).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
- OFX real de banco brasileiro (SGML sem fechamento de tags, `ISO-8859-1`/`CHARSET:1252`, datas `20261124120000[-3:BRT]`, valores com ponto ou vírgula) → lê certo, acentos preservados. (Task 2)
- Importar o mesmo arquivo duas vezes → nada duplica; arquivo de outra conta → aviso se o `ACCTID` do arquivo não bate com o número da conta escolhida (deixa seguir). (Task 2 e 4)
- Conta com movimentos antes do período e saldo inicial cadastrado → "Saldo inicial" do período = saldo_inicial + movimentos anteriores (sem transferências mal contadas). (Task 1)
- Depósito de maquininha que junta 3 vendas → sugestão pela soma dos repasses do dia. (Task 2)
- Desfazer uma conciliação errada (Confirmar no item errado) → botão "Desfazer" volta a linha para pendente e estorna a baixa feita por ela. (Task 4)

---

### Task 1: Núcleo do fluxo de caixa

**Files:** Create `js/fluxo-core.js` (UMD, global `FluxoCore`; no node faz `require('./caixa-core.js')`); Test `tests/fluxo-core.test.js`.

**Interfaces — Consumes:** `CaixaCore.saldoContaAte`, `CaixaCore.lancamentosPrevistos`, `CaixaCore.contaAceitaMovimento` (js/caixa-core.js).
**Produces:**
- `FluxoCore.resumo({ de, ate, hoje, contaId|null, categoriaId|null, movimentos, contas, contasReceber, contasPagar, despesasFixas, meios, categorias }) -> { saldoInicial, entradas, saidas, saldoFinal, previsto: { entradas, saidas, saldoFinal } }` — realizado de `de` até `min(ate, hoje)`; previsto de `hoje+1` (ou `de`, se futuro) até `ate`; `saldoInicial` = saldos das contas (ou da conta) no dia anterior a `de`; com `contaId` nulo, transferências fora de entradas/saídas; com `contaId`, transferências contam; `categoriaId` filtra entradas/saídas pelo lançamento de origem (movimentos sem lançamento — transferência/ajuste — saem quando há filtro de categoria) e não mexe no saldo inicial.
- `FluxoCore.serie({ ...mesmos, agrupar: 'dia'|'semana'|'mes' }) -> [{ rotulo, de, ate, entradas, saidas, saldo, previsto: bool }]` — semana começa na segunda; rótulos "24/11", "Sem 24/11", "Nov/26"; `saldo` acumulado no fim de cada ponto; pontos depois de hoje com `previsto:true` (valores do previsto).
- `FluxoCore.movimentacoes({ ...mesmos }) -> [{ data, descricao, conta_id, entrada, saida, saldo, origem: 'cr'|'cp'|'transferencia'|'ajuste'|'previsto', origem_id, grupo_id|null, previsto: bool, transferencia: bool }]` — ordenado por data (realizado primeiro no mesmo dia), `saldo` acumulado a partir do `saldoInicial`; a primeira linha é "Saldo inicial".

- [ ] **Step 1: Testes (falhando)** em `tests/fluxo-core.test.js`: conta A saldo_inicial 1.000 em 01/10; movimentos: entrada CR 500 (05/11), saída CP 200 (10/11), transferência A→B 300 (12/11), ajuste −50 (15/10); período 01/11–30/11, hoje 20/11 → todas as contas: saldoInicial 950 (1.000 − 50; B sem saldo), entradas 500, saídas 200, saldoFinal 1.250 (transferência não muda o total); só conta A: entradas 500, saídas 500 (200 + 300), saldoFinal 450; CR em aberto vencendo 25/11 de 400 e CP cancelada vencendo 26/11 → previsto.entradas 400, saídas 0, saldoFinal 1.650; filtro categoria `cat_aluguel` (o CP de 200 é aluguel) → entradas 0, saídas 200; serie mês → 1 ponto "Nov/26"; serie semana 01/11–30/11 → primeiro ponto com rótulo "Sem 27/10" (semana que contém 01/11) e `de:'2026-11-01'` (valores só a partir de 01/11); serie dia com ponto 25/11 `previsto:true`; movimentacoes: primeira "Saldo inicial" 950, transferência marcada `transferencia:true` com entrada/saida 0 no consolidado, último saldo == saldoFinal previsto.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(fin): nucleo do fluxo de caixa (realizado, previsto, serie e movimentacoes)`.

### Task 2: Núcleo da conciliação (OFX e sugestões)

**Files:** Create `js/conciliacao-core.js` (UMD, global `ConciliacaoCore`); Test `tests/conciliacao-core.test.js` (+ fixtures em `tests/fixtures/extrato-sgml.ofx` em ISO-8859-1 e `tests/fixtures/extrato-xml.ofx`).

**Interfaces — Produces:**
- `ConciliacaoCore.lerOfx(texto: string) -> { banco: string|null, agencia: string|null, conta: string|null, linhas: [{ fitid, data: 'AAAA-MM-DD', valor: number, descricao }] , erros: [string] }` — aceita SGML (tags sem fechamento) e XML; `DTPOSTED` com fuso; `TRNAMT` com ponto ou vírgula; descrição = `MEMO` ou `NAME`; sem `FITID` → gera `data|valor|descricao` como id. Arquivo que não é OFX → `erros:['Arquivo não reconhecido como extrato OFX.']`.
- `ConciliacaoCore.decodificar(bytes: Uint8Array) -> string` — usa o `CHARSET`/`ENCODING` do cabeçalho (1252/ISO-8859-1 → latin1; senão UTF-8).
- `ConciliacaoCore.novasLinhas(linhas, existentes, contaId) -> linhas` — tira as de mesmo `fitid` já importadas para a conta.
- `ConciliacaoCore.sugestoes(linha, { contaId, contasReceber, contasPagar, movimentos, repasses: [{ crId, data, liquido, contaId }], jaUsados: Set }) -> [{ tipo: 'lancamento'|'movimento'|'repasse'|'repasses', ids: [...], descricao, valor, data, distanciaDias }]` — mesmo sentido (valor > 0 entrada, < 0 saída); lançamento em aberto (não Cancelado) com `|valor| ±0,01` e vencimento a ±5 dias; movimento da mesma conta ainda não conciliado (não em `jaUsados`) com mesmo valor e data ±5 dias; repasse de cartão da conta pelo **líquido** ±0,01, data ±5; se nenhum valor único, **soma** dos repasses da mesma conta com mesma data (±1 dia) igual ao valor; ordena por tipo (movimento, lançamento, repasse, repasses) e menor distância.

- [ ] **Step 1: Testes (falhando)**: lerOfx do SGML (Itaú-like, `CHARSET:1252`, MEMO "PAGTO ALUGUÉL") → 3 linhas, data `2026-11-05`, valor −1200.5 com `TRNAMT` "-1200,50", acento preservado após `decodificar`; XML → mesmas linhas; texto qualquer → erro exato; novasLinhas tira fitid repetido da mesma conta mas não de outra conta; sugestões: CR em aberto 500 vencendo 07/11 e linha +500 em 05/11 → lançamento distância 2; mesmo CR com vencimento 12/11 → nada; CR Cancelado → nada; linha −200 não sugere CR; repasse líquido 97,01 (bruto 100) casa com +97,01; três repasses do mesmo dia (30, 40, 30) casam com +100 como `repasses` com 3 ids; movimento já em `jaUsados` não aparece.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(fin): leitura de OFX e sugestoes de conciliacao no nucleo`.

### Task 3: Tela Fluxo de caixa (substitui o Extrato provisório)

**Files:** Create `js/fin-fluxo.js`; Modify `financeiro.html` (painel `#fin-fluxo`, scripts, `?v=` em todas as páginas), `js/app.js` (roteador da aba fluxo chama `renderFinFluxo()`; tirar o Extrato provisório; manter as funções de transferência), `css/style.css`, `FUNCIONALIDADES_SCTECH.txt`; Test `tests/e2e/fin-fluxo.spec.js` (e adaptar os specs do Extrato provisório que testam transferência/exclusão para a tela nova).

**Interfaces — Consumes:** Task 1 (`FluxoCore.resumo/serie/movimentacoes`), helpers de exportação da DRE (`js/fin-dre.js`), rotina de transferência existente (app.js ~18000–18050), `abrirLancamentoNaLista(tipo, id)`.
**Produces:** `renderFinFluxo()`, estado `finFluxo = { de, ate, agrupar:'dia'|'semana'|'mes', contaId, categoriaId }`, `abrirRelatoriosFluxo()`, ponto de entrada `abrirConciliacao(contaId)` (stub "Em breve." até a Task 4) e botão **Importar extrato** (stub idem).
- Filtros: Período (padrão mês atual), **Ver por: Dia | Semana | Mês** (padrão Dia), Conta (Todas / cada conta ativa), Categoria (todas / cada categoria).
- 4 cartões (PDF pág. 6): **Saldo inicial**, **Entradas**, **Saídas**, **Saldo final**; abaixo de Saldo final, "Previsto até DD/MM: R$ X" quando o período passa de hoje.
- Gráfico de linhas (Saldo, Entradas, Saídas) com a parte prevista tracejada; legenda; tema escuro legível.
- Tabela "Movimentações do período": Data, Descrição, Conta, Entrada, Saída, Saldo; linhas previstas em cinza com selo "Previsto"; transferências com selo "Transferência"; clicar numa linha de lançamento abre em Lançamentos; ⋮ da transferência: **Excluir transferência** (com `completo`); botão **Transferir entre contas** (abre a janela existente).
- Topo: **Importar extrato**, **Conciliar**, **Relatórios**. Linha de cada conta conciliada: "Conferido com o extrato até DD/MM" (última linha conciliada) — preparado aqui lendo `db.fin_extrato` (vazio por enquanto).
- **Relatórios** (janela): "Entradas e saídas por categoria" (período, regime caixa), "Contas a pagar e a receber por período" (em aberto e pagas, por vencimento), "Evolução mensal do saldo" (12 meses até o mês atual) — cada um com PDF, Excel, Imprimir reusando os helpers da DRE.
- Alerta "falta de caixa" do sino continua levando a esta aba (sem mudança de link).

- [ ] **Step 1: e2e (falhando)** `fin-fluxo.spec.js` (relógio 2026-11-20): com os dados do teste da Task 1, os 4 cartões mostram 950 / 500 / 200 / 1.250 e "Previsto até 30/11: R$ 1.650,00"; filtrando conta A, Saídas 500; a tabela começa com "Saldo inicial" e marca a transferência; linha prevista de 25/11 com selo "Previsto"; Ver por Semana muda os pontos do gráfico (conferir pelo dataset do Chart); clicar numa linha de CR abre Lançamentos com a linha destacada; Transferir entre contas cria a transferência e ela aparece; Excluir transferência remove; usuário com `fluxo: visualizar` não vê Transferir/Importar/Conciliar; relatório "Entradas e saídas por categoria" mostra Aluguel 200 e exporta Excel (stub XLSX); 390px e tema escuro.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar (e `?v=20261207a` + scripts).
- [ ] **Step 4:** spec novo + `fin-novo-*`, `fin-dre*`, specs adaptados do Extrato passam; `npm test` passa.
- [ ] **Step 5:** Commit `feat(fin): tela Fluxo de caixa (cartoes, grafico, movimentacoes, transferencias e relatorios)`.

### Task 4: Importar extrato e conciliar

**Files:** Modify `js/fin-fluxo.js`, `js/app.js` (chave `sc_fin_extrato` em `db`, `_DB_CHAVE_CAMPO`, backup export/import), `css/style.css`, `FUNCIONALIDADES_SCTECH.txt`; Test `tests/e2e/fin-conciliacao.spec.js` (usa as fixtures da Task 2).

**Interfaces — Consumes:** Task 2 (`ConciliacaoCore.*`), Task 3 (`abrirConciliacao`, stub de Importar), `baixarContasReceber(data, linhas)`/`baixarContasPagar(data, linhas)` (app.js ~15283/15410), `finHist`, `FinCatCore.acharParecido`, `abrirNovoLancamento(lado)` (js/fin-novo.js), rotina de transferência.
**Produces:** `importarExtrato()` (janela: escolher conta*, arquivo .ofx), `abrirConciliacao(contaId)`, `desfazerConciliacao(extratoId)`.
- **Importar:** lê com `decodificar` + `lerOfx`; erros mostram o texto do núcleo; `ACCTID` diferente do `numero_conta` da conta escolhida → `showConfirm("Este extrato parece ser da conta <ACCTID>, e você escolheu <nome>. Importar mesmo assim?")`; grava só `novasLinhas`; resumo "N linha(s) nova(s) importada(s); M já estavam no sistema."; abre a Conciliar da conta.
- **Conciliar** (tela/janela por conta): lista das linhas pendentes (data, descrição, valor), cada uma com a melhor sugestão e as ações **Confirmar**, **Escolher outro** (lista as outras sugestões e permite marcar **vários** lançamentos/repasses cuja soma dê o valor — o botão Confirmar só habilita quando a soma bate ±0,01), **Criar lançamento** (abre o formulário de Lançamentos preenchido com valor, data, descrição e conta; ao salvar, a linha fica conciliada com ele — passa pela checagem de duplicidade do formulário), **É transferência** (escolher a outra conta; cria o par de movimentos), **Ignorar**. Abas: Pendentes | Conciliadas | Ignoradas; nas conciliadas, **Desfazer** (volta a pendente; se a conciliação deu baixa, estorna essa baixa pelas rotinas existentes; se ligou a movimento existente, só desliga).
- **Confirmar** com lançamento em aberto → dá baixa na data do extrato, na conta do extrato (via `baixarContasReceber`/`baixarContasPagar`), `situacao:'conciliado'`, `mov_id(s)` gravado(s), histórico `conciliado` no lançamento ("Conciliado com o extrato de DD/MM"); com movimento existente → só liga; com repasse(s) → liga aos movimentos dos repasses (ou marca o repasse como conferido quando não há movimento).
- Contas mostram "Conferido com o extrato até DD/MM" (Task 3 já lê).

- [ ] **Step 1: e2e (falhando)** `fin-conciliacao.spec.js`: importar o SGML na conta Itaú → "3 linha(s) nova(s) importada(s); 0 já estavam no sistema."; importar de novo → "0 linha(s) nova(s)…; 3 já estavam no sistema."; conta errada → aparece a pergunta e "Cancelar" não importa; linha +500 sugere o CR de 500 → Confirmar → CR "Recebido" na data do extrato, saldo da conta muda, linha em Conciliadas, histórico com "Conciliado"; Desfazer → CR volta a "Em aberto" e linha a Pendentes; linha −1.200,50 sem par → Criar lançamento abre o formulário preenchido e, salvando, a linha fica conciliada; É transferência → par de movimentos criado e Fluxo (todas as contas) não muda Entradas/Saídas; Ignorar → vai para Ignoradas; três repasses somando o depósito → sugestão "3 repasses"; usuário sem `completo` em `financeiro.receber` não vê Confirmar para entradas; "Conferido com o extrato até 05/11" aparece na tela do Fluxo; backup exporta/importa `sc_fin_extrato`.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** spec novo + `fin-fluxo` + `fin-novo-*` + `fin-dre*` passam; `npm test` passa.
- [ ] **Step 5:** Commit `feat(fin): importar extrato OFX e conciliar com lancamentos, repasses e transferencias`.
