# Financeiro — Fase 2: Resultado do mês, meta, ponto de equilíbrio e orçamento — Design

Data: 2026-11-14 · Status: aguardando aprovação
Base: branch `feat/financeiro-fase2`, a partir da `main` @ 3a32066 (Fases 0 e 1 do Financeiro + carrinho/ações já na main).

## Por que existe

O dono (usuário médio) julga o mês assim, nas palavras dele: **"foi bom se as
entradas foram maiores que as saídas"**. Ele quer uma **referência** (meta de
faturamento), saber o **imposto** mesmo antes de a guia chegar, saber **quanto
precisa faturar para empatar** e **controlar quanto pode gastar em cada tipo de
despesa**. Hoje o sistema só tem DRE por pedido e uma meta solta na Visão Geral,
e a Visão Geral ainda conta o cartão pela data da baixa e pelo valor bruto —
diferente da tela Hoje e do Extrato.

**Régua:** simples e direto para o dono; números que batem entre todas as telas.

## Objetivos

1. **Meta de faturamento** com valor padrão (Empresa) e ajuste por mês.
2. **Resultado do mês**: entradas, saídas por grupo, imposto (estimado e
   lançado), resultado, comparação com a meta, previsão até o fim do mês aberto.
3. **Ponto de equilíbrio** ("Para pagar as contas do mês você precisa faturar R$ X").
4. **Orçamento mensal por grupo de despesa** (orçado × realizado) com alertas.
5. **Visão Geral alinhada** com a mesma regra de entradas/saídas (cartão na data
   em que cai).

## Não-objetivos

- DRE contábil completo (competência, depreciação, plano de contas).
- Cálculo exato de imposto por faixa do Simples/anexos — só **alíquota
  estimada** do cadastro.
- Fechamento do mês e simulador de investimento (Fase 3).
- Resolver as pendências das fases anteriores (ficam para o fim das fases).

## Anti-objetivos

- Resultado do mês, Visão Geral, Hoje e Extrato mostrarem números diferentes
  para o mesmo mês.
- Resultado parecer melhor do que é por falta da guia de imposto.
- Contar a mesma saída duas vezes (ex. taxa de cartão).

## Decisões (com o usuário)

### 1. Meta de faturamento
- Empresa › Preferências: campo **"Meta de faturamento mensal (padrão)"**
  (`sc_empresa.meta_faturamento_padrao`, aceita "30.000" e "30.000,50").
- Na Visão Geral, o ✏️ editar meta continua e **ajusta só o mês escolhido**
  (`sc_fin_metas[YYYY-MM]`, já existe). Mês sem ajuste usa o padrão.
- Mostrar **"bateu a meta"** ou **"faltou R$ X"**.

### 2. Faturamento = dinheiro que entrou no caixa (decidido pelo usuário)
- **Entradas do mês** = recebimentos de clientes **pela data em que o dinheiro
  entra**:
  - recebimento com movimento (Fase 1): os movimentos de entrada `origem:'cr'`
    com data no mês (no cartão, cada repasse na sua data, valor bruto);
  - recebimento sem movimento (antes de configurar as contas, ou conta não
    configurada): a conta a receber paga, pela `data_pagamento`, valor da
    parcela.
- **Faturamento do mês (para meta e ponto de equilíbrio)** = entradas − taxas de
  cartão do mês (valor **líquido**, como dito ao usuário) *(decisão do
  assistente sobre como mostrar: a taxa aparece como grupo de saída e o
  faturamento líquido é mostrado à parte, sem descontar duas vezes)*.
- Transferências entre contas **não** são entradas nem saídas.
- **Confirmado pelo usuário:** venda no cartão parcelado conta no faturamento
  conforme cada parcela cai (ex. 6x de R$ 1.000 → R$ 1.000 por mês por 6
  meses); pedido vendido num mês e pago no outro conta no mês do pagamento.

### 3. Saídas por grupo
- Saídas do mês = contas a pagar **pagas** com `data_pagamento` no mês (inclui
  comissões e taxas de cartão), por grupo:

  | Grupo | Categorias (`contas_pagar.categoria`) |
  |---|---|
  | Fornecedores e materiais | `tecido` |
  | Costureira e instalador | `costureira`, `instalador` |
  | Comissões | `comissao`, `comissao_rt` |
  | Taxas de cartão | `taxa_cartao` |
  | Despesas fixas | `aluguel`, `salario`, `conta` |
  | Imposto | `imposto` (**nova categoria**) |
  | Outros | `outro` e qualquer categoria não mapeada |

- Nova categoria **"Imposto"** no A Pagar (formulário manual e despesas fixas),
  com rótulo e cor no gráfico de despesas da Visão Geral.

### 4. Imposto: lançado e estimado (decidido pelo usuário)
- **Lançado** = soma das contas pagas da categoria `imposto` no mês.
- **Estimado** = `aliquota_estimada` (cadastro da empresa) × faturamento do mês.
- Enquanto não houver guia lançada **para aquele mês** (paga ou em aberto com
  vencimento no mês seguinte… ver abaixo), mostra **"guia ainda não lançada —
  estimativa R$ X"** e o **resultado desconta a estimativa** *(decisão do
  assistente, aceita)*. Quando houver guia lançada, o resultado usa o lançado
  e a estimativa aparece só como referência.
- "Guia do mês": conta a pagar categoria `imposto` com `data_pagamento` (paga)
  ou `data_vencimento` (em aberto) **no mês seguinte** ao mês de referência
  *(decisão do assistente: no Simples, a guia de um mês vence no seguinte)*.
  Alternativa simples se ficar confuso no teste com o usuário: campo opcional
  "mês de referência" na conta de imposto — deixado ao builder decidir entre os
  dois, desde que documentado na tela.
- Sem alíquota no cadastro: não estima; mostra "Informe a alíquota em Empresa
  para estimar o imposto".

### 5. Resultado do mês (nova aba)
- Nova aba **"📅 Resultado do mês"** no Financeiro (depois de "Visão Geral");
  "DRE por pedido" continua. Permissão nova `financeiro.resultado`, com
  migração dos papéis salvos igual à Fase 1 (herda o nível da Visão Geral).
- Seletor de mês (padrão: mês atual).
- Blocos:
  1. **Resultado**: Entradas · Saídas · **Resultado** (verde/vermelho);
     faturamento líquido vs meta ("bateu a meta" / "faltou R$ X").
  2. **Saídas por grupo** (tabela) + linha de imposto estimado/lançado.
  3. **Ponto de equilíbrio** (seção 6).
  4. **Orçamento** (seção 7).
  5. **Mês aberto (mês atual)**: "Até hoje" e **"Previsto até o fim do mês"**
     (até hoje + o que a previsão da Fase 1 traz até o último dia do mês:
     a receber, a pagar, despesas fixas, cartão a cair).
- Exportar o resultado do mês em PDF (cabeçalho da empresa) *(decisão do
  assistente — útil para levar ao contador)*.

### 6. Ponto de equilíbrio
- Frase: **"Para pagar as contas do mês você precisa faturar R$ X."**
- X = despesas fixas do mês ÷ margem de contribuição %.
  - **Despesas fixas do mês** = grupo "Despesas fixas" do mês; no mês aberto,
    as despesas fixas cadastradas e ativas do mês (pagas ou não).
  - **Margem de contribuição %** = (faturamento − fornecedores e materiais −
    costureira e instalador − comissões − imposto) ÷ faturamento, **média dos
    últimos 3 meses fechados** com faturamento > 0. Taxas de cartão já estão
    fora (faturamento líquido).
  - Sem histórico (nenhum mês fechado com faturamento): usa a margem média dos
    pedidos aprovados (DRE por pedido, `FinanceiroCore.resultadoPedido`) e
    avisa "estimativa — poucos meses de histórico".
  - Margem ≤ 0: mostra "Com a margem atual não há ponto de equilíbrio — os
    custos variáveis passam do faturamento."
- Linha de comparação: "empate R$ X · meta R$ Y · faturado R$ Z".

### 7. Orçamento mensal por grupo
- Empresa › Preferências: card **"Orçamento mensal"** com um limite por grupo
  (seção 3); vazio = não acompanha. Padrão + **ajuste por mês** (igual à meta)
  *(decisão do assistente, aceita)* — ajuste feito no próprio Resultado do mês
  (✏️ ao lado do limite).
- No Resultado do mês: tabela grupo | limite | gasto | falta | % usado.
  Verde < 80%; amarelo 80–100% "perto do limite"; vermelho > 100% "estourou
  R$ X".
- **Tela Hoje**: quando, no mês atual, algum grupo passa de 100%, aparece no
  topo "Orçamento de <grupo> estourado: R$ X acima" *(decisão do assistente,
  aceita)*.

### 8. Visão Geral alinhada
- Os números de "recebido", fluxo/gráficos por mês e meta da Visão Geral passam
  a usar **a mesma função** de entradas/saídas do Resultado do mês (seção 2/3).
  O texto/legenda deixa claro "pela data em que o dinheiro entra".

### 9. Detalhes fechados após a revisão do builder *(decisões do assistente)*
- **Guia de imposto tem "mês de referência"**: a conta a pagar de categoria
  `imposto` ganha o campo `mes_referencia` ('YYYY-MM'), preenchido
  automaticamente com o mês anterior ao vencimento e editável no formulário.
  (Substitui a regra "mês seguinte" da seção 4.)
- **Imposto é contado pelo mês de referência** (não pela data de pagamento),
  para não misturar a guia de outubro paga em novembro com o imposto de
  novembro:
  - "Imposto do mês M" = soma das guias com `mes_referencia = M` (pagas ou em
    aberto); se não houver nenhuma, **estimativa** (alíquota × faturamento de
    M), marcada "(estimado)".
  - Vale também para meses passados sem guia (continua "(estimado)").
  - O grupo **Imposto** das saídas mostra esse valor (lançado ou estimado);
    guias pagas **não** entram de novo pela data de pagamento.
- **Entradas — regra exata**: para cada conta a receber **paga**: se existem
  movimentos `origem:'cr'` com `origem_id` igual ao id dela, contam esses
  movimentos (cada um na sua data); senão conta a própria parcela pela
  `data_pagamento`. Parcelas estornadas não estão pagas, então não contam.
  Partes de parcela dividida são contas a receber próprias (regra igual).
- **Mês aberto**: "Até hoje" usa só datas ≤ hoje (cartão a cair fica de fora);
  "Previsto até o fim do mês" inclui o que cai até o último dia.
- **Despesas fixas do mês** (ponto de equilíbrio, meses abertos e fechados) =
  contas a pagar `tipo:'fixo'` com **vencimento** no mês (pagas ou não) +
  despesas fixas antigas sem `periodicidade`, ativas, ainda não geradas
  naquele mês. (Usa vencimento para um aluguel pago com atraso não zerar um
  mês e dobrar o outro.)
- **Margem de contribuição**: os **3 meses fechados mais recentes com
  faturamento > 0**, olhando até 12 meses para trás (pula meses sem
  faturamento); imposto pela regra acima. Sem nenhum mês assim: média dos
  pedidos aprovados nos últimos 90 dias = (receita − custo do material −
  custos vinculados − comissões) ÷ receita, menos a alíquota estimada; aviso
  "estimativa — poucos meses de histórico".
- **Orçamento**: qualquer grupo pode ter limite (vazio = não acompanha);
  categoria não mapeada cai em Outros; **gasto = pago no mês** (mesma regra
  das saídas; imposto pela referência).
- **Visão Geral**: "recebido", gráfico dos 12 meses, meta e o gráfico de
  despesas por categoria passam a usar as mesmas funções (despesas = saídas
  pagas no mês, incluindo taxa de cartão e imposto). Ajuste de meta 0 ou vazio
  = sem ajuste (usa o padrão).
- **Aviso de orçamento na tela Hoje** exige `financeiro.resultado`
  (visualizar). PDF do resultado usa o mecanismo de documentos existente
  (`abrirDocModal` + cabeçalho da empresa).

## Restrições

- Stack atual (HTML/CSS/JS puro, `localStorage`, sem build, sem dependências
  novas); Chart.js já presente.
- Cálculos em módulo puro testável (`js/resultado-core.js`, namespace
  `ResultadoCore`, `node --test`): entradas/saídas por mês, grupos, imposto,
  margem e ponto de equilíbrio, orçamento.
- Datas locais (`hojeLocal`), dinheiro em centavos, ids com contador + Set.
- Novas chaves/campos em export/import (meta padrão e orçamento dentro de
  `sc_empresa` ou chave própria; `sc_fin_metas` e ajustes de orçamento por mês
  também).
- Escapar texto; modais `.sc-modal-overlay`; validação dentro do modal.
- Testes e2e `tests/e2e/financeiro-fase2-*.spec.js`; cache-busting novo.
- Pendências novas vão para `Docs/superpowers/pendencias-financeiro.md`
  (seção "Da Fase 2").

## Deixado para o builder

- Nomes exatos de chaves (sugestão: `sc_empresa.meta_faturamento_padrao`,
  `sc_empresa.orcamento_padrao = { grupo: valor }`, `sc_fin_orcamento_mes =
  { 'YYYY-MM': { grupo: valor } }`).
- Layout exato da aba (seguir o padrão visual do Financeiro).
- Regra de "guia do mês" (seção 4) entre as duas opções, documentada na tela.
