# Financeiro — Rodadas de pendências 2 (telas e textos) e 3 (testes) — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** fechar todas as pendências abertas de `docs/superpowers/pendencias-financeiro.md` (telas e textos, testes que faltam e as sobras da rodada 1), na mesma branch `feat/financeiro-pendencias-r1`.

**Spec:** a fonte é o próprio `pendencias-financeiro.md` + as decisões abaixo. Plano da rodada 1 (decisões D1–D4, R1–R5): `Docs/superpowers/plans/2026-11-14-financeiro-pendencias-r1.md`.

## Global Constraints
- Vanilla JS sem build. Datas `AAAA-MM-DD` locais (`hojeLocal()`); valores em centavos; valores digitados via `_valorDigitadoBaixa`.
- Textos de tela em português simples; textos citados aqui são exatos.
- Não mudar comportamento fora do item. Cada item: marcar `[x]` no `pendencias-financeiro.md` com uma frase curta (ou "mantido de propósito: …").
- `?v=` já está em `20261122a` nesta branch: não subir de novo; arquivo novo incluído nas páginas usa `?v=20261122a`.
- Manter o fim de linha de cada arquivo (conferir `git diff --stat` com `--ignore-space-at-eol`).
- Testes: `npm test` e Playwright (`tests/e2e/`), servidor `RAIZ=<repo> PORTA=<porta> node tests/e2e/servidor.js`, rodar de `C:\Users\Asus\AppData\Local\Temp\sctech-e2e` com `BASE=… NODE_PATH=$PWD/node_modules TESTDIR=<repo>/tests/e2e npx playwright test -c repo.config.js <filtro>`; cada tarefa usa a porta que o controlador indicar e para o servidor que ligou.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Minhas decisões (rulings)
- R6 Forma de pagamento padrão da comissão: começa em branco ("— escolha —"), obrigatória ao pagar.
- R7 Confirmar pagamento com todas as parcelas pagas: em vez da janela vazia, aviso "Todas as parcelas deste pedido já estão pagas."
- R8 Desmarcar o único item da janela de baixa: o botão Confirmar fica desabilitado com "Marque pelo menos um item." (a janela não fecha sozinha).
- R9 Chart.js: cópia local em `js/vendor/` (mesma versão do CDN usado hoje), páginas passam a carregar a cópia local.
- R10 "Meio removido" no pedido não impede salvar: mantido de propósito (o meio é opcional).
- R11 Gravação pela metade por falta de espaço: `_syncDBBruto` guarda o valor anterior de cada chave e, se falhar no meio, devolve as chaves já gravadas ao valor anterior; depois do aviso, a tela recarrega os dados salvos (recarregar a página). O aviso do `syncDB` continua uma vez por página (mantido de propósito).
- R12 Transferências na projeção da Visão Geral: transferências entre contas não entram nas barras de entrada/saída da projeção (somam zero).
- R13 Contador `_resMargemCalculos`: sai do código de produção; o teste confere o cache de outro jeito (ex.: espiar a função do núcleo).

## Tarefas

### Task 1: Telas e textos — pedido, comissão e baixa (Fase 0)
Itens "Da Fase 0 → Telas e textos": confirmar pagamento com tudo pago (R7); forma padrão da comissão (R6); sem permissão não vê a janela de gerar conta do PC (o botão some ou avisa antes de abrir); aviso de "Voltar para Orçamento" cita as comissões pendentes removidas; descrição "Entrada (X%)" atualizada na reaprovação com entrada paga em parte; alíquota 0 recarrega "0" e "6,5" recarrega "6,5"; "Entrada de 30%" no nome da forma é reconhecido (30%); desmarcar o único item (R8); cor `#B26A00` do selo do DRE vira variável de CSS (com valor no tema escuro).

### Task 2: Telas e textos — Fases 1, 2 e 3
Fase 1: "forma de pagamento" → "plano" onde agora é plano; aviso de repasse sem `\n\n` sobrando; "#undefined" na conta a receber sem pedido (não mostrar número); hover da conta na tela Hoje visível no tema escuro e `.hoje-conta` acessível por teclado (botão ou tabindex + Enter); tarefas da tela Hoje só para quem pode visualizar receber/pagar; comentários "na Visão Geral" desatualizados; comissão antiga paga sem conta a pagar ganha botão Estornar. Fase 2: opção "Imposto" num lugar só; `cpm-valor` aceita "1.250,50" (texto + `_valorDigitadoBaixa`); meta padrão como placeholder no ajuste do mês; "+ Limite só neste mês" só aparece com algum orçamento definido. Fase 3: comparação "+0%" vira "igual ao mês anterior".

### Task 3: Sobras da rodada 1 e Chart.js
Itens "Da rodada de pendências 1": previsão do Hoje/projeção sem somar duas vezes fixa antiga + conta à mão (mesma regra do `despesasFixasDoMes`, uma conta cobre no máximo uma fixa); contas recorrentes com a regra R4 (dia que não existe vira o último dia do mês, contado sempre da data inicial); PDF da Visão Geral com a linha "líquido (sem a taxa do cartão)"; R12; R11; R10; R13. E "Da Fase 2 → Testes": R9 (Chart.js local).

### Task 4: Testes que faltam — Fase 0
Itens "Da Fase 0 → Testes que faltam": cancelar a janela de baixa / de comissão sem mudar nada; estorno de parcela vencida volta "Atrasado" + teste negativo de permissão do estorno; custo guardado ao aprovar por `moverStatus`/`salvarPedido` e na reaprovação; vincular nota a conta parcelada, parcelas 100/3, soma de grupo na nota duplicada; alíquota fora da faixa / inválida; ciclo estorno → exportar → importar. Se um teste achar erro, corrigir e contar no relatório.

### Task 5: Testes que faltam — Fases 1, 2 e 3
Fase 1: cartão (cancelar, débito, antecipar, recebimento parcial com cartão e conta removida); estorno de pagamento sem conta e com permissão negada; cobrança (casar por nome, fallback, permissão); excluir transferência com permissão negada; periodicidade de despesas fixas com data fora do horizonte. Fase 2: Escape e empilhamento das janelas de ajuste (meta/limite) com outras janelas abertas. Fase 3: alta de grupo no limite (30% / R$ 100), ajuste de entrada e "Deixar anotado" no fechamento, duplo clique em Lançar (simulador) chamando a função uma vez só, migração da permissão `financeiro.simulador` em permissões extras do usuário. Se um teste achar erro, corrigir e contar no relatório.

### Task 6: Documentação
`FUNCIONALIDADES_SCTECH.txt` com o que mudou nas Tasks 1–5 (textos exatos); conferir que todos os itens do `pendencias-financeiro.md` estão `[x]` (ou "mantido de propósito").
