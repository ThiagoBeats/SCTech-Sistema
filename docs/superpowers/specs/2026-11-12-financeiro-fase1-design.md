# Financeiro — Fase 1: Meu dinheiro (enxergar e planejar) — Design

Data: 2026-11-12 · Status: aguardando aprovação
Base: branch `feat/financeiro-fase1`, sobre a Fase 0 (`Docs/superpowers/specs/2026-11-11-financeiro-fase0-design.md`).

## Por que existe

Quem cuida do financeiro numa empresa de cortinas é **o dono**, no meio de
todo o resto. A dor dita por ele: **"não saber o dinheiro que entra e o que
sai, não ter um planejamento financeiro eficiente"**.

Depois da Fase 0 o sistema sabe *quem deve* e *o que vence*, mas não sabe
**onde o dinheiro está** (caixa, banco, maquininha), não desconta a taxa do
cartão, não sabe quando o dinheiro do cartão cai e não mostra se vai faltar
dinheiro nas próximas semanas.

**Régua:** usuário médio (o dono). Abrir, ver o que precisa de atenção,
resolver em poucos cliques. Na dúvida, menos passos e menos campos.

## Objetivos

1. **Contas** (Caixa, Banco(s), Maquininha(s)) com saldo de hoje.
2. Todo dinheiro que entra ou sai **cai numa conta**, pelo **meio de
   pagamento** escolhido na baixa.
3. **Cartão e maquininha:** taxa descontada, datas em que o dinheiro cai
   (débito, crédito à vista, crédito parcelado mês a mês, antecipação).
4. **Plano × meio** separados: o pedido guarda o plano (entrada/saldo,
   desconto) e o meio previsto da entrada e do saldo.
5. **Previsão de caixa de 8 semanas**, com aviso da primeira semana em que o
   dinheiro não fecha (antecipa o que estava previsto para a Fase 2).
6. **Recebimento parcial** de uma parcela.
7. **Cobrança pelo WhatsApp** com mensagem pronta.
8. **Tela "Hoje"** (tarefas primeiro) como primeira aba do Financeiro, e aba
   **"Extrato"** com transferência entre contas.

## Não-objetivos

- Conferência valor a valor com o extrato real do banco/maquininha
  (conciliação) — fica para uma fase de fechamento do mês.
- Envio automático de WhatsApp (exige WhatsApp Business pago + servidor).
- Cartão de crédito **da empresa** como meio de pagar despesas.
- DRE mensal, ponto de equilíbrio, orçado × realizado (Fase 2).
- Emissão de NFS-e, boleto ou PIX para cliente (futuro).
- Histórico retroativo de saldos antes de o dono configurar as contas.

## Anti-objetivos (falha mesmo funcionando)

- O dono ter de lançar a mesma coisa duas vezes (ex.: dar baixa e depois
  "lançar no caixa").
- Saldo de hoje que inclui dinheiro do cartão que ainda não caiu.
- Taxa da maquininha escondida: o valor que entra tem de ser o líquido, e a
  taxa tem de aparecer como saída.
- Mudar plano/meio de pedidos antigos sem o usuário pedir.
- Tela "Hoje" que exige rolar ou abrir outra aba para fazer as tarefas do dia.

## Decisões (tomadas com o usuário)

### 1. Contas

- Tipos: **Caixa**, **Banco**, **Maquininha**. O dono pode ter mais de uma
  de cada (ex.: dois bancos, duas maquininhas).
- Cada conta tem **nome**, **tipo**, **saldo inicial** e **data do saldo
  inicial**. Configuração uma vez só.
- **Saldo de hoje** = saldo inicial + entradas − saídas **com data ≤ hoje**
  a partir da data do saldo inicial.
- Movimentos com data futura (cartão "a cair") **não** entram no saldo de
  hoje; entram na previsão. No dia em que a data chega, passam a contar no
  saldo sozinhos (nenhuma ação do usuário).
- **Transferência entre contas** (ex.: depositar o caixa no banco): uma
  saída numa conta e uma entrada na outra, mesmo valor e data.
- Baixas feitas **antes** de o dono configurar as contas não geram
  movimentos (o saldo inicial já representa o passado).

### 2. Meios de pagamento

- Lista configurável. Cada meio tem: **nome**, **tipo** (dinheiro, pix,
  transferência, boleto, cartão de débito, cartão de crédito, outro) e
  **para qual conta vai** (para cartão: **qual maquininha**).
- Padrão inicial *(decisão do assistente)*: Dinheiro → Caixa; PIX → Banco;
  Transferência → Banco; Boleto → Banco; Cartão de débito → Maquininha;
  Cartão de crédito → Maquininha.
- **Toda baixa** (A Receber, A Pagar, comissão) pede o **meio**; a conta vem
  do meio e pode ser trocada na hora. Para contas a pagar e comissões, os
  meios de cartão não aparecem (não-objetivo).

### 3. Maquininha (cartão)

- Configuração por maquininha:

  | Tipo | Taxa (%) | Quando cai |
  |---|---|---|
  | Débito | ex. 1,5 | D+1 (dias configuráveis) |
  | Crédito à vista | ex. 3 | D+30 (dias configuráveis) |
  | Crédito parcelado | ex. 4 | uma parcela a cada 30 dias |
  | Antecipação | ex. +2 sobre a taxa | D+1, tudo de uma vez |

- **Na baixa com cartão:** débito ou crédito; no crédito, **nº de vezes** e
  **antecipar sim/não**. O sistema calcula o **líquido** e as **datas**.
- O **cliente fica quitado na hora da baixa** (a parcela do A Receber vai
  para Pago com o valor bruto). O que fica pendente é só o repasse.
- Movimentos gerados: **entrada bruta** na conta da maquininha na(s)
  data(s) de crédito (por parcela do cartão) e **saída "Taxas de cartão"**
  do valor da taxa nas mesmas datas. Assim o dono vê o bruto, a taxa e o
  líquido.
- A taxa também gera uma **conta a pagar já paga**, categoria nova
  `taxa_cartao`, para aparecer no gráfico de despesas e, na Fase 2, no DRE
  *(decisão do assistente)*.
- Estorno de uma baixa com cartão remove todos os movimentos e a conta de
  taxa que ela gerou.

### 4. Plano × meio no pedido

- A configuração "Formas de pagamento" de hoje passa a se chamar **Planos de
  pagamento**: nome, % de entrada, % de desconto (o **desconto fica no
  plano** — confirmado pelo usuário). Os dados existentes (`sc_formas_pag`)
  continuam valendo como planos, sem migração.
- No pedido, a seção "Forma de pagamento" passa a ter:
  - **Plano** (o select de hoje; preenche entrada % e desconto como hoje);
  - **Meio da entrada** e **meio do saldo** (select de meios; para cartão de
    crédito, nº de vezes e "antecipar"). Com plano 100%, só um meio.
- O vendedor **já sabe** como o cliente vai pagar (confirmado), então os
  meios previstos são preenchidos no pedido e copiados para as parcelas
  (`meio_previsto` na conta a receber).
- Na baixa, o meio previsto vem **pré-selecionado**; a pessoa pode trocar.
- Pedidos antigos continuam como estão (sem meio previsto).

### 5. Previsão de caixa (8 semanas)

- Ponto de partida: **saldo total de hoje**.
- Soma, semana a semana:
  - movimentos futuros já gerados (cartão a cair, líquido);
  - parcelas a receber em aberto: na data de vencimento; se o meio previsto
    for cartão, espalhadas pelas datas e **líquidas** de taxa, conforme a
    maquininha;
  - contas a pagar em aberto, na data de vencimento;
  - despesas fixas ativas cujos lançamentos do mês ainda não foram gerados,
    no dia de vencimento.
- Recebimentos e pagamentos **atrasados** entram na **semana atual**, com
  legenda "inclui atrasados" *(decisão do assistente)*.
- Destaque em vermelho da **primeira semana com saldo previsto negativo**,
  com o texto "Semana de DD/MM: falta R$ X".

### 6. Recebimento parcial

- Na janela de baixa, cada parcela marcada tem o **valor editável para
  menos**.
- Valor menor que o da parcela: a parcela é **dividida** — uma parte paga
  (valor informado, com meio e conta) e outra em aberto com o restante, mesmo
  vencimento, mesmo pedido, mesmo `parcela_tipo`, mesmo `meio_previsto`.
- Estornar a parte paga **devolve o valor** à parte em aberto (junta de
  novo) se ela ainda estiver em aberto; senão volta a ficar em aberto
  sozinha.

### 7. Cobrança pelo WhatsApp

- Botão **"💬 Cobrar"** nas parcelas atrasadas ou que vencem hoje (A Receber
  e tela Hoje).
- Abre `https://wa.me/55<telefone>?text=<mensagem>` (celular ou WhatsApp
  Web). Telefone do cadastro do cliente, só dígitos; sem telefone → aviso
  "Cliente sem telefone no cadastro".
- Mensagem configurável em Empresa › Preferências, com campos
  `{cliente}`, `{empresa}`, `{valor}`, `{pedido}`, `{vencimento}`. Padrão:
  "Olá, {cliente}! Aqui é da {empresa}. Passando para lembrar da parcela de
  {valor} do pedido {pedido}, com vencimento em {vencimento}. Qualquer
  dúvida, estou à disposição."
- Registra `ultima_cobranca` (data) na parcela e mostra "cobrado hoje" para
  não cobrar duas vezes no mesmo dia.
- Envio é **manual** (a pessoa clica enviar no WhatsApp).

### 8. Tela "Hoje" (opção B — tarefas primeiro, escolhida pelo usuário)

- **Primeira aba do Financeiro, aberta por padrão.** A "Visão Geral" atual
  continua como segunda aba *(decisão do assistente)*.
- **Esquerda — o que fazer hoje**, por urgência:
  1. recebimentos atrasados (vermelho) — botões 💬 Cobrar e ✓ Recebi;
  2. recebimentos que vencem hoje (amarelo) — mesmos botões;
  3. contas a pagar de hoje e dos próximos 7 dias (cinza) — ✓ Paguei;
  4. cartão que cai hoje na maquininha (informativo).
  Vazio: "Tudo em dia 👍".
- **Direita:** "Tenho hoje" (total + saldo de cada conta; clicar numa conta
  abre o Extrato filtrado nela) e "Próximas semanas" (gráfico de 8 semanas +
  aviso).
- Celular: blocos empilhados, tarefas primeiro.
- Se as contas ainda não foram configuradas, o bloco da direita mostra um
  convite "Configure suas contas para ver quanto você tem" com botão para a
  configuração.

### 9. Aba "Extrato"

- Movimentos do mês (entradas em verde, saídas em vermelho), com filtro por
  conta e por mês, saldo no início e no fim do período.
- Movimentos futuros (cartão a cair) aparecem marcados "a cair".
- Botão **"Transferir entre contas"** (de, para, valor, data).

### 10. Onde se configura

- Empresa › Preferências *(decisão do assistente)*, ao lado dos planos:
  **Contas**, **Meios de pagamento**, **Maquininhas** e **Mensagem de
  cobrança**.

### 11. Detalhes fechados após a revisão do builder *(decisões do assistente)*

- **Meio por parcela na janela de baixa.** Cada linha marcada tem seu próprio
  meio (pré-selecionado com o `meio_previsto` da parcela) e, se for cartão de
  crédito, seu nº de vezes e "antecipar". Data é uma só para a baixa.
- **`meio_previsto` é um objeto na parcela:** `{ meio_id, vezes, antecipar }`.
  Cartão de crédito sem nº de vezes conta como 1x. A previsão usa esse objeto;
  se a baixa mudar vezes/antecipar, valem os da baixa.
- **Quando uma baixa gera movimento:** só se o meio escolhido tem conta e a
  data da baixa é **≥ data do saldo inicial** dessa conta. Caso contrário a
  baixa é registrada normalmente, sem movimento, e a janela avisa "Esta conta
  ainda não está configurada / data anterior ao saldo inicial — não entra no
  saldo". O saldo é sempre calculado só com movimentos de data ≥ data do
  saldo inicial; mudar essa data depois apenas muda o que entra na conta, sem
  migrar nada.
- **Taxa de cartão: uma conta a pagar por repasse.** Num crédito em 6x são 6
  contas `taxa_cartao`, status Pago, `data_pagamento` = data em que aquele
  repasse cai. Essa conta **é** a saída "Taxas de cartão" daquele repasse
  (não há um segundo movimento de saída — sem duplicar).
- **Regra geral de movimento:** toda conta a receber paga e toda conta a
  pagar paga (incluindo comissões e taxas) com conta válida gera exatamente
  um movimento (ou um por repasse, no cartão); transferências geram dois.
- **Tela Hoje — contas a pagar atrasadas** aparecem em vermelho no topo do
  grupo de pagar, antes das de hoje e dos próximos 7 dias.
- **Permissões na tela Hoje:** os botões Recebi/Cobrar só aparecem para quem
  tem `financeiro.receber` completo; Paguei só para `financeiro.pagar`
  completo. O bloco "Tenho hoje"/"Próximas semanas" e a aba Extrato exigem
  `financeiro.extrato` (visualizar); a transferência exige
  `financeiro.extrato` completo.
- **Estorno de baixa com cartão** remove todos os movimentos e contas de taxa
  dela, inclusive repasses que já caíram; o texto de confirmação avisa "Isso
  muda o saldo de hoje da conta X".
- **Estorno de pagamento (A Pagar e comissões)** passa a existir, nas mesmas
  regras do estorno de recebimento da Fase 0 (volta para Pendente/Atrasado,
  registra quem estornou, remove o movimento; na comissão, desmarca o
  pago no pedido). Contas `taxa_cartao` não têm estorno próprio — saem só
  pelo estorno do recebimento que as gerou.
- **Transferência pode ser excluída** (com confirmação), removendo os dois
  movimentos. Não há edição: exclui e lança de novo.

## Restrições

- Stack atual: HTML/CSS/JS puro, sem build, `localStorage` (`db.*`,
  `syncDB()`), sem backend, sem dependências novas.
- Cálculos novos (saldos, datas e líquido do cartão, divisão de parcela,
  previsão semanal, montagem da mensagem/URL do WhatsApp) em módulo puro
  testável — estender `js/financeiro-core.js` ou criar um novo `*-core.js`
  seguindo o mesmo padrão — com testes `node --test`.
- Datas locais (`hojeLocal`/`dataLocal` da Fase 0); dinheiro arredondado a
  centavos; soma das partes = total.
- Ids com contador + conjunto de ids usados (padrão da Fase 0).
- Novas coleções/chaves entram em `exportarDados`/`importarDados`.
- Permissões: novas sub-abas `financeiro.hoje` e `financeiro.extrato` no
  esquema de permissões existente (`MODULOS_PERMISSAO`, `FIN_TAB_MODULO`);
  configurar contas/meios/maquininhas exige o mesmo acesso das Preferências
  da empresa; transferência e baixas seguem as permissões da Fase 0.
- Escapar todo texto de usuário; nada de `prompt()`.
- Testes e2e Playwright no padrão `tests/e2e/financeiro-fase1-*.spec.js`.
- Pendências encontradas na fase vão para
  `Docs/superpowers/pendencias-financeiro.md` (seção Fase 1); são resolvidas
  todas juntas no fim das fases.

## Deixado para o builder

- Nomes exatos de coleções e campos (sugestão: `contas_fin`, `meios_pag`,
  `maquininhas`, `movimentos_fin`).
- Se os movimentos são guardados (coleção própria) ou derivados das baixas —
  desde que o saldo e o extrato fiquem consistentes com estorno e divisão
  de parcela.
- Visual exato da tela Hoje e do gráfico (seguir o modelo B e o padrão
  visual existente, Chart.js já carregado).
- Ordem de implementação.
