# Financeiro — Fase 0: Confiabilidade dos números — Design

Data: 2026-11-11 · Status: aguardando aprovação (revisado após builder check)

## Por que existe

O módulo Financeiro (`financeiro.html`, lógica em `js/app.js` a partir de
`// MÓDULO FINANCEIRO`, ~linha 11181) já tem A Receber, A Pagar, Despesas
Fixas, Visão Geral e DRE por pedido. Mas os números não são confiáveis:

1. **Recebimento tem duas fontes de verdade.** `confirmarPagamentoPedido`
   (~2908) grava `pedido.valor_recebido = valor` e não baixa `contas_receber`;
   `marcarCRPago` (~11286) baixa a conta e não atualiza o pedido. A tela inicial
   e Relatórios leem o pedido; o Financeiro lê as contas. Os valores divergem.
2. **Comissões não chegam ao Financeiro.** `pagarComissao` (~7609) só marca
   `comissao_paga` no pedido. Não existe conta a pagar, então fluxo de caixa e
   DRE ignoram comissões.
3. **Geração de RT é código morto.** Só ocorre em `marcarCRPago` a partir de
   `arquiteto_nome`/`rt_pct`, que `salvarPedido` hoje grava sempre vazios.
4. **DRE por pedido usa preço de venda como custo** (`total_material +
   total_acessorios` são valores de venda) e ainda desconta `maoObra`, que é
   receita. Margem aparece errada.
5. **Excluir pedido** (`excluirPedido` ~2696) deixa contas a receber órfãs.
6. **Pedido de compra recebido** (`atualizarStatusPC` ~8313) não gera conta a
   pagar; o usuário relança à mão.

Esta fase corrige a base antes de qualquer tela nova (Fases 1–3). Sem ela,
toda funcionalidade futura herda números errados.

**Régua principal:** o sistema é para um usuário médio — simples, direto,
eficiente. Na dúvida, menos passos e menos campos. Os fluxos que a equipe já
usa (ex.: botão "Confirmar pagamento") continuam sendo o caminho principal.

## Objetivos

1. Uma única fonte de verdade para o que o cliente pagou: `contas_receber`.
2. Voltar com **entrada + saldo** na geração das contas a receber.
3. Toda comissão vira conta a pagar e entra no fluxo de caixa e no DRE.
4. Pedido guarda o **custo real** dos materiais na aprovação; DRE por pedido
   fica correto.
5. Excluir pedido não deixa lixo nem apaga dinheiro recebido.
6. Pedido de compra recebido gera conta a pagar com um clique (à vista,
   prazo único ou parcelado).
7. Campo de **regime tributário** no cadastro da Empresa (só guardado).
8. Dados antigos corrigidos por migração automática, executada uma vez.

## Não-objetivos

- Recebimento parcial de uma parcela (Fase 1).
- Contas/carteiras (Caixa, Banco, Maquininha) e taxa de maquininha (Fase 1).
  A forma de pagamento é **registrada** agora, mas não movimenta saldo de
  conta nenhuma.
- Cálculo de imposto, DRE mensal, previsão de 13 semanas, ponto de
  equilíbrio (Fase 2).
- Emissão de NFS-e e boleto/PIX para cliente: tarefa futura, fora do roadmap
  atual.
- Plano de contas contábil, centro de custo.

## Anti-objetivos (seria falha mesmo funcionando)

- Usuário ter que aprender um fluxo novo para dar baixa no dia a dia.
- Qualquer caminho que apague ou altere silenciosamente um valor já recebido
  ou já pago.
- Custo contado duas vezes no resultado do pedido.
- Migração que deixe o histórico em estado diferente a cada carregamento
  (precisa ser idempotente, com flag de "já migrado").

## Decisões (tomadas com o usuário)

### 1. Recebimentos — fonte única

- `contas_receber` é a fonte de verdade. `pedido.valor_recebido` deixa de ser
  gravado como dado independente: passa a ser **derivado** (soma das parcelas
  pagas do pedido). Todo lugar que lê `valor_recebido` (card "A Receber" da
  home ~3086, Relatórios › Recebíveis, Dashboards) deve usar o valor derivado.
- **"Confirmar pagamento"** (pedido em Aguardando Financeiro) continua sendo o
  caminho principal. Ao confirmar:
  - mostra o total que será baixado (soma das parcelas em aberto do pedido);
  - pede **data** (padrão hoje) e **forma de pagamento** (lista de
    `sc_formas_pag`);
  - lista as parcelas em aberto do pedido com caixa de seleção; o usuário
    **escolhe quais baixar** (decisão do usuário). Padrão: todas marcadas;
    se o instalador informou saldo pendente (`pagamento_pendente`), a
    parcela de saldo vem **desmarcada**;
  - baixa só as parcelas marcadas;
  - o pedido segue para Instalado **mesmo com saldo em aberto**; o saldo
    continua no A Receber como dívida do cliente (e vira Atrasado pela regra
    existente). O pedido mostra um indicador "saldo em aberto".
  - Consequência aceita: a comissão é gerada ao chegar em Instalado, mesmo
    que o cliente ainda deva o saldo.
- **"✓ Recebido"** no A Receber continua existindo e se reflete no pedido
  (o valor derivado já resolve isso). Passa a pedir também a forma de
  pagamento, e a data deixa de ser `prompt()` (usar modal do sistema).
- Cada baixa registra **quem** (usuário logado) e **quando**: novos campos na
  conta a receber, ex. `forma_pagamento`, `baixado_por`, `baixado_em`.
  Motivo: não é sempre a mesma pessoa que dá baixa.
- **Campo "Valor recebido" do formulário do pedido** (`ped-valor-recebido`,
  pedido.html:170) *(decisão do assistente)*: vira **somente leitura**,
  mostrando o valor derivado. Recebimento só é registrado pela baixa da
  parcela. Valores digitados no passado são tratados pela migração (item 8).
- **Estorno:** precisa existir uma ação para desfazer a baixa de uma parcela
  (volta a Pendente/Atrasado, registra quem estornou). É pré-requisito da
  regra de exclusão de pedido (abaixo).

### 2. Entrada + saldo

- Ao aprovar (`gerarFinanceiroPedido` ~11248, chamado por `aprovarPedido`,
  `moverStatus` e `salvarPedido`), gerar:
  - **Entrada**: X% do valor, vencimento na data da aprovação;
  - **Saldo**: restante, vencimento em `data_entrega`.
- X é o **% de entrada do pedido**, que vem da forma de pagamento escolhida
  (ver abaixo; padrão 50% para formas novas) e é editável em cada pedido
  antes de aprovar.
- Opção **"100% na aprovação"** (equivale a entrada = 100%; gera uma parcela
  só).
- **Relação com `forma_pagamento` do pedido** *(decisão do assistente,
  revista ao escrever o plano)*: as formas de pagamento da empresa já têm
  nomes como "50% entrada + 50% na instalação" e "À vista". Por isso cada
  forma ganha um campo **% de entrada** (ao lado do % de desconto, em
  Empresa › Preferências), pré-preenchido a partir do nome ("X% entrada" → X,
  "À vista" → 100, demais → 50). Escolher a forma no pedido preenche o
  **% de entrada do pedido** (editável), do mesmo jeito que já preenche o
  desconto. O "% de entrada padrão de 50%" é o valor inicial de uma forma nova.
  A forma também vem pré-selecionada no modal de baixa. Pedidos legados com `tipo_pagamento` (50/50, 30/70, 40/60) mantêm a
  divisão que já têm.
- **Vale só para pedidos aprovados a partir desta versão** (decisão do
  usuário). Pedidos já aprovados com parcela única de 100% **não** são
  redivididos.
- Arredondamento em centavos; a diferença fica no saldo, para a soma bater
  exatamente com `valor`.

### 3. Comissões → A Pagar

- Quando o pedido chega em **Instalado**, gerar uma conta a pagar para o
  vendedor e outra para o arquiteto (se houver e se % > 0): categoria
  `comissao`, credor = nome do cadastro, vencimento = data da instalação,
  vinculada ao pedido (`pedido_id`) e ao beneficiário (`vendedor_id`).
- A conta a pagar é a fonte de verdade. Marcar paga na tela de Vendedores ou
  no A Pagar é a mesma ação. Os flags `comissao_paga`/`arq_comissao_paga` do
  pedido passam a ser derivados (ou mantidos em sincronia pela mesma função —
  decisão do builder, desde que haja uma única função de baixa).
- Pagar pede **data** e **forma** de pagamento.
- **Padrão: pedido a pedido.** Também existe **pagar várias**: escolher uma
  pessoa, marcar as comissões pendentes dela e pagar todas com a mesma data e
  forma (cada conta fica paga individualmente).
- Pedido que volta para Orçamento ou é excluído: comissões **pendentes**
  daquele pedido são removidas; **pagas** permanecem e ganham um aviso visível
  ("pedido cancelado — revisar").
- Remover o código legado de RT em `marcarCRPago`.

### 4. Custo do pedido e DRE por pedido

- Na aprovação, gravar no pedido um **snapshot de custo** por item: para cada
  tecido (por ambiente) e cada acessório/kit, `preco_custo` do cadastro naquele
  momento × quantidade consumida. Guardar também o total (ex.
  `custo_material_snapshot`) e a data do snapshot.
- Item sem `preco_custo` cadastrado: o DRE mostra **"custo não informado"**
  naquele item (não assume zero em silêncio).
- **Receita** = material + acessórios + mão de obra − desconto (= `valor`).
  Mão de obra é receita de serviço, **não** custo.
- **Resultado do pedido** = receita − custo de material (snapshot) − **todas**
  as contas a pagar vinculadas ao pedido, **exceto** categoria `tecido`
  (inclui costureira, instalador, comissões e `outro`, ex. frete)
  *(decisão do assistente: `outro` entra para não esconder custos reais)*.
  Mostrar também margem %.
- Contas a pagar de **tecido**/compra vinculadas ao pedido **não** entram no
  resultado (o material já está no snapshot — evita contar duas vezes). Elas
  continuam no A Pagar e no fluxo de caixa.
- Salário fixo de costureira/instalador fica em Despesas Fixas e não entra no
  resultado por pedido (vai para o DRE mensal da Fase 2).
- Pedidos antigos sem snapshot: se tiverem custo próprio gravado
  (`tipo_precificacao === 'pedido'` com `custo_mat`/`custo_acess`), usar esse
  custo *(decisão do assistente: é o custo histórico real)*; senão usar o
  `preco_custo` atual do cadastro e marcar **"custo estimado"**.
- Se o pedido voltar para Orçamento e for reaprovado, o snapshot é refeito.

### 5. Excluir pedido de venda

- Nenhum valor recebido: exclui o pedido, as contas a receber em aberto e as
  comissões pendentes, com confirmação.
- Algum valor recebido: **bloqueia** a exclusão e explica — é preciso estornar
  os recebimentos antes.
- `voltarPedidoParaOrcamento` (~6237) já segue regra parecida; alinhar as duas.

### 6. Pedido de compra → A Pagar

- Ao marcar um pedido de compra como **Recebido**, abrir modal
  "Gerar conta a pagar?" com valor = total do PC (editável) e três opções:
  - **À vista** — vence hoje;
  - **Boleto/prazo único** — informa vencimento;
  - **Parcelado** — nº de parcelas e intervalo em dias (30/60/90…), usando o
    parcelamento que o A Pagar já tem (`lancamento_pai_id`, `parcela_atual`…).
- Botão **"Agora não"**: PC fica com aviso "sem conta a pagar" (visível na
  lista de pedidos de compra) e a opção de gerar depois.
- Conta gerada fica vinculada ao PC (novo campo, ex. `pedido_compra_id`),
  credor = fornecedor do PC, categoria `tecido` (ou `outro`, se o PC não tiver
  tecido — decisão do builder).
- **Anti-duplicidade na importação de NF-e/XML/PDF:** ao importar uma nota,
  se existir conta vinculada a PC do mesmo fornecedor (CNPJ) com valor
  próximo e em aberto, avisar e oferecer **vincular a nota à conta existente**
  (preenche chave de acesso/nº documento/anexo) em vez de criar outra.

### 7. Regime tributário

- Empresa (`sc_empresa`): campo **regime** (MEI, Simples Nacional, Lucro
  Presumido, Lucro Real) e **alíquota estimada %**. Escolhido pelo usuário.
- Nesta fase só é guardado e exibido; o cálculo entra na Fase 2.

### 8. Migração de dados antigos

Executar uma vez no carregamento (padrão de `_migrarFinanceiroPedidos`
~11200), com flag persistida de versão de migração:

- Pedido com `valor_recebido >= valor` (ou `pagamento_confirmado_em`) e
  parcelas em aberto → baixar as parcelas com data
  `pagamento_confirmado_em` (ou a melhor data disponível) e
  `baixado_por` = `pagamento_confirmado_por` ou "migração".
- Pedido com `valor_recebido` parcial e sem correspondência nas contas →
  **não inventar**: listar em um aviso para revisão manual.
- Comissões: para pedidos Instalados, criar as contas a pagar que faltam —
  pagas (com `comissao_data_pgto`) se `comissao_paga`, pendentes caso
  contrário. Incluir RT legado (`arquiteto_nome`/`rt_pct`) sem `rt_gerado`.
- Contas a receber órfãs (pedido não existe mais): em aberto → remover; pagas
  → manter e marcar "pedido excluído".
- Parcelas existentes **não** são redivididas em entrada + saldo.
- Snapshot de custo **não** é criado retroativamente (DRE usa "custo
  estimado").
- Fazer backup automático (usar o mecanismo de `exportarDados`) antes de
  migrar, ou ao menos orientar o usuário — decisão do builder, desde que a
  migração seja reversível de alguma forma.

## Restrições

- Stack atual: HTML/CSS/JS puro, sem build, dados em `localStorage` (`db.*`,
  `syncDB()`), sem backend.
- Lógica de cálculo nova deve ir para um módulo puro testável
  (`js/financeiro-core.js`, namespace ex. `FinanceiroCore`) com testes em
  `tests/*.test.js` (`node --test`), seguindo o padrão de
  `importador-core.js`/`etiquetas-core.js`. DOM/telas continuam em `app.js`.
- Identificadores em português, campos em snake_case, datas
  `'YYYY-MM-DD'`, IDs `Date.now()`.
- Novos campos/coleções precisam entrar em `exportarDados`/`importarDados`
  (~7152).
- Permissões: baixa de recebimento usa `financeiro.receber` (nível
  completo), pagamento de comissão/conta usa `financeiro.pagar`; manter
  `podeConfirmarPagamento`.
- Modais com os helpers existentes (`showConfirm`, `showEscolha`,
  `.modal-overlay`), não `prompt()`.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` seção 10 (está desatualizada: cita
  planos 50/50 fixos e "Aguardando Pagamento").
- Testes e2e afetados: `tests/e2e/financeiro-bloqueio-menu.spec.js`,
  `forma-de-pagamento.spec.js`.

## Deixado para o builder

- Nomes exatos dos novos campos.
- Se os flags de comissão no pedido são derivados em leitura ou sincronizados
  na escrita (desde que haja uma única função de baixa).
- Layout exato dos modais (seguir padrão visual existente).
- Tolerância de "valor próximo" na anti-duplicidade de NF-e.
- Ordem de implementação das 8 partes.
