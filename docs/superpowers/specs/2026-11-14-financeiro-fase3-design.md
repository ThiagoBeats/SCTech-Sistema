# Financeiro — Fase 3: Fechamento do mês e simulador "vale a pena comprar?" — Design

Data: 2026-11-14 · Status: aguardando aprovação
Base: branch `feat/financeiro-fase3`, a partir da `main` @ 462a545 (Fases 0, 1 e 2 do
Financeiro já na main, mais o botão "📤 Enviar" dos documentos).

## Por que existe

A dor original do dono (usuário médio): **não saber o dinheiro que entra e sai e
não ter um planejamento financeiro eficiente.** As Fases 0–2 deram números
confiáveis, o caixa do dia a dia e o resultado do mês. Faltam dois momentos:

1. **O fim do mês.** Hoje um mês "passado" pode mudar a qualquer hora (uma baixa
   lançada com data antiga muda o resultado) e ninguém confere se o saldo que o
   sistema calcula bate com o extrato do banco/maquininha. A conferência com o
   extrato foi explicitamente adiada da Fase 1 para "uma fase de fechamento".
2. **Antes de uma compra grande.** O dono não tem como ver, antes de comprar,
   se a compra cabe no caixa das próximas semanas e se ela se paga.

O usuário delegou as decisões ("decida a melhor opção") e aprovou o caminho
descrito abaixo ("Concordo").

**Régua:** simples e direto para o dono; usar os números que o sistema já calcula
(Extrato, Resultado do mês, previsão de 8 semanas) — nada de cálculo paralelo.

## Objetivos

1. **Fechamento do mês** guiado em 3 passos (conferir dinheiro → pendências →
   resumo), que guarda uma **foto** do mês e **avisa** se o mês mudar depois.
2. **Simulador "vale a pena comprar?"**: cabe no caixa? (previsão de 8 semanas
   com a compra) e compensa? (em quantos meses se paga), com "Lançar no A Pagar".

## Não-objetivos

- **Travar** lançamentos com data em mês fechado (abordagem rejeitada, ver Abordagens).
- Conciliação linha a linha com o extrato do banco (importar OFX/CSV). A
  conferência é por **saldo final** de cada conta.
- Previsão de faturamento futuro (vendas que ainda não existem). O simulador usa
  só o que já está lançado, como a tela Hoje.
- Juros/financiamento, comparação entre formas de pagamento, várias compras de
  uma vez.
- Resolver as pendências das fases anteriores (rodada própria, depois desta fase).

## Anti-objetivos

- Fechamento que obriga a reabrir o mês para lançar uma conta esquecida.
- Números do fechamento diferentes dos do Resultado do mês / Extrato para o
  mesmo mês (no momento do fechamento).
- Simulador que diz "cabe" quando a previsão da tela Hoje com a mesma compra
  ficaria negativa.
- Ajuste da conferência mudando o resultado do mês (ele corrige saldo, não é
  receita nem despesa).

## Abordagens consideradas

**Fechamento:**
- A) **Só foto** — guarda os números e pronto. Simples, mas não confere nada.
- B) **Travar o mês** — nada com data do mês fechado sem reabrir. Seguro, mas
  atrapalha (lembrar no dia 3 de uma conta paga no dia 28 é comum) e exigiria
  bloqueio em todos os pontos que gravam datas.
- C) **Conferir + foto + aviso de mudança** — **escolhida** (decisão minha,
  aprovada pelo usuário). Confere o saldo com o extrato, guarda a foto e, se
  algo mudar depois, avisa com o antes × agora. Protege o que foi ao contador
  sem travar ninguém.

**Simulador:** um só caminho sensato — reaproveitar `CaixaCore.previsaoSemanal`
somando a compra como saídas futuras (mesma previsão da tela Hoje). Simular com
horizonte longo (6–12 meses) foi descartado: sem vendas futuras lançadas, a
projeção longa fica sempre negativa e assusta à toa; para parcelas além das 8
semanas, usa-se o **resultado médio mensal** como régua (abaixo).

## 1. Fechamento do mês

### Onde fica
- Aba **📅 Resultado do mês**: para um mês **anterior ao atual** e ainda não
  fechado, botão **"🔒 Fechar <mês>"**. O mês atual não pode ser fechado.
- Mês fechado: selo **"🔒 Fechado em dd/mm/aaaa por <nome>"** e botões
  **"Ver fechamento"** (documento com 📤 Enviar) e **"Refazer fechamento"**
  (pede confirmação; apaga a foto **e os ajustes lançados por aquele
  fechamento** — movimentos com `origem: 'ajuste'` e o mesmo `fechamento_mes` —
  e reabre o passo a passo, que então mostra o saldo esperado sem eles).
- Tela **Hoje**: tarefa **"Feche o mês de <mês anterior>"** do dia 1 até o mês
  anterior ser fechado (só o mês imediatamente anterior; só se houver alguma
  conta financeira configurada). Clicar leva ao passo a passo.
- Permissão: ver = `financeiro.resultado` (visualizar); fechar/refazer =
  `financeiro.resultado` completo.

### Passo 1 — Conferir o dinheiro
- Uma linha por **conta ativa** (banco, caixa, maquininha) que já existia no
  mês (`data_saldo_inicial` ≤ último dia do mês): **saldo esperado** no último
  dia do mês (`CaixaCore.saldoConta(conta, movimentos, ultimoDia)`) e um campo
  **"saldo no extrato"**.
- Diferença calculada na hora. Se ≠ 0, a pessoa escolhe:
  - **"Lançar ajuste"** com um motivo obrigatório → cria um movimento em
    `movimentos_fin` com `origem: 'ajuste'`, `fechamento_mes: 'AAAA-MM'`,
    data = último dia do mês, sentido pelo sinal,
    `descricao: 'Ajuste da conferência de <mês>: <motivo>'`.
    Aparece no Extrato. **Não entra no resultado** (resultado conta só
    recebimentos de CR e pagamentos de CP — regra da Fase 2).
  - **"Deixar anotado"** → a diferença fica registrada na foto, sem movimento.
- Dica fixa na tela: "Se a diferença é uma conta que você esqueceu de lançar,
  lance no A Pagar / A Receber em vez de ajustar" (com atalhos).
- Campo em branco = conta não conferida (permitido; fica marcado "não conferida"
  na foto).

### Passo 2 — O que ficou pendente
Lista, com atalho para resolver cada item (abre a aba/registro correspondente):
- Contas a pagar com vencimento no mês e não pagas.
- Contas a receber com vencimento no mês e não recebidas (clientes atrasados).
- Guia de imposto do mês não lançada (quando o Resultado usa imposto
  **estimado**).
Nada aqui impede fechar; os números vão para a foto ("3 contas a pagar em aberto").

### Passo 3 — Resumo do mês
- Os números do Resultado do mês (Fase 2): entradas, saídas por grupo, imposto
  (lançado/estimado), resultado, meta e % da meta.
- Comparação com o **mês anterior** (resultado e entradas, em R$ e %).
- **3 maiores grupos de gasto** do mês.
- **Orçamentos estourados** (status da Fase 2).
- **Sugestões para o próximo mês** — geradas por regras simples, no máximo 4,
  em ordem de prioridade:
  1. Resultado negativo → "O mês fechou no vermelho em R$ X. Para empatar você
     precisa faturar R$ Y (ponto de equilíbrio)."
  2. Orçamento estourado (por grupo) → "<Grupo> passou R$ X do orçamento."
  3. Entradas abaixo da meta → "Faltaram R$ X para a meta."
  4. Grupo de gasto que subiu > 30% e > R$ 100 vs mês anterior → "<Grupo>
     subiu X% em relação a <mês anterior>."
  5. Clientes atrasados no mês → "R$ X de clientes em atraso — vale cobrar."
  6. Imposto estimado (guia não lançada) → "Lance a guia de imposto de <mês>
     quando ela chegar."
  Sem nada a sugerir: "Nenhum ponto de atenção. Bom mês!"
- Campo livre **"Anotações"**.
- Botão **"🔒 Fechar <mês>"** grava a foto; depois abre o documento do
  fechamento (com 📤 Enviar, destinatário em branco — para o contador).

### A foto (dados)
Nova coleção `db.fechamentos_fin` (lista; um registro por mês), gravada por
`syncDB()` na chave `sc_fin_fech`, como as demais coleções do Financeiro
(tudo no SCTech é local ao navegador; não há sincronização entre aparelhos):
```
{ id, mes ('AAAA-MM'), fechado_em (ISO), fechado_por (nome do usuário),
  numeros: { entradas, saidas, imposto, imposto_estimado (bool), resultado,
             meta, por_grupo: { <grupo>: valor } },
  contas: [ { conta_id, nome, esperado, extrato (null = não conferida),
              diferenca, acao: 'ajuste'|'anotado'|null, motivo } ],
  pendencias: { pagar_qtd, pagar_valor, receber_qtd, receber_valor, guia_pendente (bool) },
  sugestoes: [texto], anotacoes }
```
Entra no backup (`_dadosExportacao` → `fechamentos_fin`) e na importação
(arquivo sem a chave = lista vazia).

### Aviso de mudança depois do fechamento
- Ao mostrar um mês fechado (Resultado do mês) e na tela Hoje (só para o mês
  anterior), recalcula entradas, saídas, imposto e resultado do mês e o saldo de
  cada conta conferida no último dia; compara em **centavos** com a foto
  (para as contas: esperado da foto + ajuste lançado).
- Contas pagas/recebidas **depois** do mês não mudam o mês fechado (saída
  conta pela data do pagamento, entrada pela data do recebimento — regra da
  Fase 2); só lançamentos com data dentro do mês fechado disparam o aviso. As
  pendências da foto não são recomparadas.
- Diferente → aviso amarelo: **"⚠ <Mês> mudou depois do fechamento: resultado
  era R$ X, agora é R$ Y"** (ou "saldo de <conta> era R$ X, agora R$ Y"), com
  botão "Refazer fechamento". Na tela Hoje, uma linha de tarefa com o mesmo texto.
- O documento "Ver fechamento" sempre mostra a **foto** (o que foi fechado), com
  o aviso se houver mudança.

### Documento do fechamento
Via `abrirDocModal` (layout simples, como o PDF do Resultado do mês), com o
envio `envioDocumentoInterno('Fechamento de <mês>', 'Fechamento-<AAAA-MM>')`:
cabeçalho da empresa, números, conferência das contas, pendências, sugestões,
anotações, "Fechado em … por …".

## 2. Simulador "vale a pena comprar?"

### Onde fica
Nova aba no Financeiro **"🧮 Simular compra"** (depois de "Resultado do mês"),
com permissão nova `financeiro.simulador` (visualizar = simular; completo =
"Lançar no A Pagar"). Entra na lista da migração existente de permissões
(`['financeiro.hoje', 'financeiro.extrato', 'financeiro.resultado']`, que só
preenche chave ausente — idempotente): sem a chave, herda o nível da Visão Geral.

### Entradas
- Descrição (obrigatória).
- Valor total (obrigatório, > 0).
- Forma: **À vista** | **Parcelado** (N vezes, 2–48, sem entrada) |
  **Entrada + parcelas** (valor da entrada + N vezes do restante).
- Data da compra (padrão: hoje). À vista e entrada caem nessa data; parcelas
  mensais a partir de **data da 1ª parcela** (padrão: 30 dias depois da compra).
- Opcional: **"Quanto essa compra traz por mês?"** (ganho ou economia, R$).
- Para lançar: categoria (as do A Pagar) e credor (opcional).

Parcelas: valor total (menos entrada) ÷ N arredondado em centavos, a última
absorve a diferença (mesma regra do parcelado do A Pagar).

### Cálculo (núcleo puro)
1. **Caixa das próximas 8 semanas, com e sem a compra**: mesma chamada de
   `CaixaCore.previsaoSemanal` da tela Hoje (mesmos argumentos); "com a compra"
   acrescenta a entrada/parcelas como **contas a pagar em aberto simuladas**
   (`status: 'Pendente'`, `data_vencimento` = data de cada pagamento) na lista
   `contasPagar` — assim datas ≤ hoje caem na primeira semana, igual a qualquer
   conta a pagar. Nada é gravado.
2. **Menor saldo** no período com a compra e a semana em que acontece.
3. **Folga**: metade das despesas fixas do mês atual
   (`ResultadoCore.despesasFixasDoMes`) — régua de "aperta" (decisão minha).
4. **Parcelas depois das 8 semanas**: só quando há parcela com vencimento além
   da 8ª semana, comparar o valor da parcela mensal com o **resultado médio**:
   média de `ResultadoCore.resultadoDoMes` dos 3 meses mais recentes **antes do
   mês atual** que tenham algum movimento (fechados ou não). Menos de 3 com
   movimento: média dos que houver; nenhum: não opina ("sem histórico para
   comparar").
5. **Melhor data** (só quando não cabe): tentar a compra começando em cada
   início de semana das 8 semanas (deslocando entrada e parcelas juntas);
   a primeira em que nenhum saldo semanal fica negativo vira "Comprando a
   partir de dd/mm, cabe". Nenhuma → "Nas próximas 8 semanas não cabe — tente
   parcelar em mais vezes ou dar uma entrada menor."
6. **Compensa?** (se informou ganho mensal > 0): meses para se pagar =
   arredondar para cima (valor total ÷ ganho mensal).

### Veredito
- 🟢 **Cabe** — nenhum saldo semanal negativo, menor saldo ≥ folga e (se houver
  parcelas além das 8 semanas) parcela ≤ resultado médio.
- 🟡 **Cabe, mas aperta** — nenhum negativo, mas menor saldo < folga
  ("o caixa fica em R$ X na semana de dd/mm") **ou** parcela > resultado médio
  ("a parcela de R$ X é maior do que sobra em média por mês, R$ Y").
- 🔴 **Não cabe agora** — algum saldo semanal negativo ("o caixa fica negativo
  em R$ X na semana de dd/mm") + melhor data (item 5).
- Linha extra quando informado o ganho: **"Se paga em N meses."**

### Tela
Formulário à esquerda/acima; resultado ao lado/abaixo: o veredito em destaque,
as frases acima, e uma tabela das 8 semanas (Semana · Saldo sem a compra · Saldo
com a compra), saldos negativos em vermelho. Botão **"Lançar no A Pagar"**
(permissão completo) e **"Limpar"**. Funciona no celular (uma coluna).

### Lançar no A Pagar
Cria as contas a pagar como o parcelado do A Pagar já faz: entrada como CP
avulsa (`tipo: 'variavel'`), parcelas com `lancamento_pai_id`, `parcelado: true`,
`numero_parcelas`, `parcela_atual`, descrição "<descrição> (parcela i/N)",
`mesRefDe(venc)`, categoria e credor informados, `status: 'Pendente'`. À vista =
uma CP. Pede confirmação ("Lançar 1 entrada + 10 parcelas no A Pagar?") e
depois volta para o simulador com aviso de sucesso. Não lança de novo a mesma
simulação sem que a pessoa clique outra vez (sem duplicar por duplo clique).

## Restrições

- Vanilla HTML/JS, `db.*` + `syncDB()`/localStorage, núcleos puros testados com
  `node --test` (novos: `js/fechamento-core.js` e `js/simulador-core.js`),
  e2e em Playwright fora do repo, `?v=` atualizado em todas as páginas.
- Números em centavos ao comparar; datas `AAAA-MM-DD` locais.
- Reusar `CaixaCore` e `ResultadoCore`; nenhum cálculo de saldo/resultado novo.
- Textos em português simples para o dono; documentação de uso em
  `FUNCIONALIDADES_SCTECH.txt` (seção 10).
- Pendências pequenas encontradas vão para `docs/superpowers/pendencias-financeiro.md`
  ("Da Fase 3").

## Decisões que tomei (o usuário delegou)

- Abordagem C do fechamento (sem trava, com aviso de mudança).
- Só meses anteriores ao atual podem ser fechados; "Refazer fechamento" em vez
  de "reabrir".
- Ajuste da conferência não entra no resultado.
- Tarefa na tela Hoje só para o mês imediatamente anterior.
- Sugestões por regras fixas (máximo 4) — sem "inteligência" além disso.
- Folga do simulador = metade das despesas fixas do mês; horizonte de 8
  semanas + régua do resultado médio para parcelas longas.
- Simulador em aba própria com permissão própria.
- Refazer fechamento apaga os ajustes daquele fechamento (marcados com `fechamento_mes`).
- Foto em `db.fechamentos_fin` (como o resto dos dados), não em chave avulsa.
- Primeiro mês de uso (mês anterior sem dados) pode ser fechado; conta
  inativa no fim do mês fica fora da conferência.

## O que fica para quem construir

- Layout exato das telas (seguir o estilo das abas do Financeiro, modal de
  passo a passo como os modais existentes).
- Nomes internos de funções além dos núcleos citados.
- Como mostrar a tabela das 8 semanas (tabela simples já basta; gráfico é opcional).
