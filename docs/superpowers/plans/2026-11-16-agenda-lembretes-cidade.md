# Ações no card, horários riscados, cidade nas rotas, atraso por extenso e lembrete de instalação — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** cinco ajustes pedidos pelo dono em 2026-11-16 (Produção, Agendas, Clientes, Rotas do dia, lembrete de confirmar instalação).

**Spec (decisões do dono, 2026-11-16):**
- **Card do pedido no Painel de Produção (Kanban):** os ícones de ação saem do card; as mesmas ações ficam num menu "⋮" (o mesmo menu de ações usado nas tabelas, `menuAcoesHtml`).
- **Horário no agendamento de medição e de instalação:** clicar no campo Horário abre uma lista dos horários do expediente (passo da Configuração da agenda). Os horários já comprometidos do responsável escolhido (medições + instalações, mesma regra da "Disponibilidade do profissional") aparecem riscados e não dá para escolher; os livres dá para clicar. Continua dando para digitar um horário quebrado (ex.: 10:30). Sem responsável escolhido, a lista mostra todos livres. Vale em todo lugar onde se escolhe o horário de medição/instalação (formulários de agendar e as janelas de editar/reagendar).
- **Cidade:** campo "Cidade" no cadastro do cliente, no agendamento de medição e no de instalação (estes vêm preenchidos com a cidade do cliente e podem mudar). As Rotas do dia procuram o endereço sempre junto com a cidade (quando há cidade) e o "📍 Ir"/links do Maps também levam a cidade. Dados antigos sem cidade continuam funcionando como hoje.
- **Atraso nas Rotas do dia por extenso:** "10 horas e 7 minutos depois do agendado"; "1 hora e 1 minuto"; "2 horas"; "25 minutos"; "1 minuto". Vale na tela, no WhatsApp ao técnico e onde mais o atraso em minutos aparecer.
- **Lembrete de confirmar a instalação:** depois do horário de término de uma instalação agendada (data + hora + duração) ainda não confirmada, para o instalador designado e para o usuário que criou o pedido (`criado_por`): ao abrir o sistema aparece uma janela, uma vez por dia por pessoa, "O pedido #N (cliente) devia ter sido instalado em dd/mm às HH:MM. Foi instalado?" com "Sim, foi instalado" (segue o fluxo atual de confirmar a instalação / dar baixa no agendamento) e "Ainda não" (oferece "Reagendar"). Enquanto não confirmar, fica também um aviso fixo na Página Inicial e o lembrete volta todo dia. Com vários pedidos, uma janela lista todos.

## Global Constraints
- Vanilla JS sem build; textos em português simples, exatos como acima.
- Não mudar comportamento fora do item. Manter o fim de linha de cada arquivo.
- `?v=` de todos os `js`/`css` em todas as páginas sobe para `20261126a` — só a Task 1 faz.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` onde cada funcionalidade já é descrita.
- Testes: `npm test` (núcleos) e Playwright (`tests/e2e/`), porta indicada pelo controlador; parar o servidor que ligou.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tarefas

### Task 1: Ações do card do Kanban no menu ⋮
Também sobe o `?v=`.

### Task 2: Horários riscados na escolha do horário (medição e instalação)

### Task 3: Cidade no cliente e nos agendamentos, usada nas rotas e no Maps

### Task 4: Atraso por extenso nas Rotas do dia

### Task 5: Lembrete de confirmar a instalação
