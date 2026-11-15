# Correções das discrepâncias do roteiro de testes — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** corrigir as 8 discrepâncias encontradas ao executar o roteiro de testes (D1–D8).

**Spec:** a lista de discrepâncias (com passo, valor esperado pela regra, valor do sistema e trecho suspeito) está em `C:\Users\Asus\AppData\Local\Temp\claude\aae5fd42919245dc\3f736a73-4dea-447f-9044-ec9c5adcbbe0\scratchpad\discrepancias.md`. O roteiro completo (cenário e valores certos) está em `…\scratchpad\roteiro\roteiro.md` e as contas à mão em `…\scratchpad\roteiro\calculos.md`. O comportamento documentado do sistema está em `FUNCIONALIDADES_SCTECH.txt`.

## Global Constraints
- Vanilla JS sem build. Textos de tela em português simples; textos citados aqui são exatos.
- Não mudar comportamento fora do item. Valores em centavos.
- Se mudar `js`/`css`: subir o `?v=` de todos os `js`/`css` em todas as páginas para `20261124a` — só a Task 1 faz.
- Manter o fim de linha de cada arquivo (conferir `git diff --stat` com `--ignore-space-at-eol`).
- Testes: `npm test` e Playwright (`tests/e2e/`); cada tarefa usa a porta que o controlador indicar e para o servidor que ligou.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` no lugar onde a funcionalidade já é descrita.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisão do dono (2026-11-15)
- **D3 Recebido → estoque:** ao marcar um pedido de compra como "Recebido", abre uma janela de entrada no estoque já preenchida com os itens do pedido (quantidade e custo); para tecido a pessoa confere a metragem e o código do rolo; confirma e entra no estoque. Dá para pular ("Lançar depois") e lançar à mão depois.

## Tarefas

### Task 1: Cópia de segurança completa (D5)
O backup passa a levar os usuários e papéis (com tudo o que precisam para entrar de novo) e a numeração dos pedidos; e o próximo número de pedido nunca repete um que já existe (próximo = maior número existente + 1, mesmo com backup antigo). Teste: exportar → limpar → importar → o usuário extra entra; novo pedido não repete o número. Backup antigo (sem esses campos) continua importando sem quebrar. Também sobe o `?v=`.

### Task 2: Recebido abre a entrada no estoque (D3)
Implementar a decisão do dono. Itens de material: quantidade e custo do pedido; tecido: metragem do pedido e código do rolo editáveis (código sugerido); kit pronto, se houver: quantidade. Confirmar registra as entradas como uma entrada normal de estoque (mesmo histórico/movimentos de "Entrada") e não duplica se o pedido voltar e for marcado Recebido de novo (avisa que já entrou). "Lançar depois" só muda o status. Testes.

### Task 3: Telas que contam errado (D1, D2, D4, D6, D7, D8)
- D1 Estoque Futuro não conta de novo o tecido já baixado.
- D2 Card do Kanban não mostra "⚠ Sem estoque" depois que o tecido do pedido já foi baixado.
- D4 Dashboards › Gerencial usa as mesmas regras e números da Visão Geral (recebido pela data em que o dinheiro entra, lucro de caixa).
- D6 Ticket Médio da Página Inicial conta só pedidos concluídos (Instalado / Aguardando Financeiro), como a regra documentada — conferir a regra no FUNCIONALIDADES.
- D7 Relatórios › Contas a Receber usa a data do pedido/vencimento, não a data tirada do número do pedido.
- D8 Despesas Fixas mostra o nome da categoria ("Aluguel"), não o código.
Testes para cada um.
