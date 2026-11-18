# Barras + sino, Agenda no Painel, aceite e rolagem dos Pedidos — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** implementar o design `Docs/superpowers/specs/2026-11-17-agenda-barras-aceite-design.md` (leia-o: é a autoridade; textos e decisões do dono estão lá).

**Architecture:** barras novas geradas pelo mesmo `renderSidebar`/cabeçalho de hoje (js/app.js) + CSS com tokens novos. Notificações num módulo novo `js/notificacoes.js` (coletores registrados → lista única para o sino e o card de Alertas, "visto" por usuário). Agenda: núcleo puro `js/agenda-core.js` (ocupação, conflitos, períodos, privacidade, janelas de lembrete — testado com `node --test`) + interface `js/agenda.js` (janela). A ocupação de cada profissional continua saindo de `_agdCompromissos()` em app.js, que passa a incluir `db.agenda_eventos` — uma regra só para agenda, horários riscados, disponibilidade e conflitos.

**Tech Stack:** HTML/JS vanilla + localStorage; `node --test`; Playwright e2e.

**Spec:** `Docs/superpowers/specs/2026-11-17-agenda-barras-aceite-design.md`

## Global Constraints
- Vanilla JS sem build; textos de tela em português simples; textos citados no spec são exatos.
- Não remover nem adicionar módulos do menu; não mudar funcionalidades existentes além do descrito.
- `?v=` de todos os `js`/`css` em todas as páginas sobe para `20261128a` — só a Task 1 faz; arquivos js novos (`notificacoes.js`, `agenda-core.js`, `agenda.js`) entram antes de `js/app.js` (núcleos) ou logo depois (UI) em todas as páginas que têm a barra lateral, na task que os cria, já com `?v=20261128a`.
- Manter o fim de linha de cada arquivo (`git diff --stat` vs `--ignore-space-at-eol`); specs novos em CRLF.
- Persistência nova: `db.agenda_eventos` em `localStorage` chave `sc_agd_ev` (entra no `salvarDB`/lista de chaves de app.js e no backup/importação como os outros arrays); "vistos" do sino em `localStorage` `sc_notif_vistos_<userId>`.
- Testes: `npm test` + Playwright (`tests/e2e/`), porta indicada pelo controlador; parar o servidor que ligou.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` onde cada coisa já é descrita (ou criar a seção da Agenda).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
- Duas abas: aba A agenda medição 10:00–11:00 para João; aba B (sem recarregar) tenta bloquear 10:30–11:30 para João → recusado (relê `localStorage` antes de gravar).
- Usuário que não é dono nem Administrador abre a agenda de outro: não vê descrição/motivo em lugar nenhum (nem no title/tooltip, nem no HTML).
- Bloqueio de vários dias (férias 20 a 24) ocupa todos os dias inteiros, inclusive no Mês e nos horários riscados de cada dia.
- Reagendar/cancelar medição ou instalação muda/libera a agenda sem recarregar (evento `storage`) e sem evento duplicado.
- Página sem o card de Alertas (ex. Estoque): o sino conta e lista os mesmos alertas que o Painel mostraria.

---

### Task 1: Barras superior e lateral novas

**Files:** js/app.js (`renderSidebar`, `initPageNavigation`, menu do perfil, `renderDashboardsButton` só se precisar de posição), css/style.css, todas as `*.html` com `main-sidebar` (`?v=`), test `tests/e2e/barras-navegacao.spec.js`.

**Produces:** `#topbar` (fixa) com `#topbar-empresa` (logo+nome), `#topbar-data` (clique chama `abrirAgenda()` se existir; até a Task 5 existir, não faz nada), `#topbar-sino` (contêiner vazio que a Task 2 preenche), `#topbar-avatar` (abre o menu do perfil com os mesmos itens do popup atual). Função `atualizarTopbar()` (redesenha empresa/avatar/data; chamada após salvar perfil/empresa).

- [ ] Teste e2e (falha antes): em index, pedidos e estoque — `#topbar` visível, `position: fixed`, largura = viewport, cor de fundo com luminância baixa; mostra o nome da empresa configurada e não mostra o título do módulo; a lateral tem os mesmos links de antes (comparar a lista de `href`), o 📌 existe e alterna fixar/recolher como antes; menu do avatar tem "Meu perfil", "Sobre o Sistema", "Configurar Empresa" (para quem tem acesso) e "Sair"; "Sair do sistema" no rodapé da lateral; trocar o nome da empresa em Configurar Empresa → barra superior mostra o novo nome; tema escuro sem fundo claro na barra; 360px sem rolagem horizontal.
- [ ] Implementar; tokens `--topbar-bg`, `--topbar-fg`, `--sidebar-bg`, `--sidebar-item-ativo` com versão escura; páginas de impressão inalteradas.
- [ ] Rodar o spec novo + specs que mexem na lateral/logo/tema (grep `sidebar`, `logo-popup`, `sidebar-pin`) + `npm test`. Commit.

### Task 2: Sino de notificações

**Files:** Create `js/notificacoes.js`, `tests/e2e/sino-notificacoes.spec.js`; Modify js/app.js (`renderDashboardAlertas` passa a usar os itens; `renderBellIndicator` integrado), css.

**Interfaces — Produces:**
- `Notif.registrar(nome, coletor)` — `coletor()` → `[{ chave: string, icone, titulo, texto, urgente: bool, href?: string, acao?: { rotulo, fn: string } , persistente?: bool }]`.
- `Notif.listar()` → itens de todos os coletores (respeitando alertas desligados em Configurar Empresa).
- `Notif.naoVistos()` → itens cuja `chave` não está em `sc_notif_vistos_<userId>`.
- `Notif.marcarVisto(chave)`; `Notif.atualizar()` (redesenha sino e card; chamado após gravações e no evento `storage`).
- Os alertas atuais do Painel viram coletores (um por tipo de banner); a chave inclui os ids dos itens (ex. `'entregas-atrasadas:26005,26007'`), então item novo conta de novo.

- [ ] Teste e2e (falha antes): com 1 entrega atrasada e 1 medição atrasada, o sino mostra "2" em index e em estoque; hover no sino abre a mini-janela com os dois textos iguais aos do card de Alertas; clicar num item navega para o destino e o sino mostra "1" (e continua "1" após recarregar e em outra página); outro usuário logado ainda vê "2"; surge nova entrega atrasada → contagem sobe; desligar o tipo de alerta em Configurar Empresa → não conta. Card de Alertas do Painel continua mostrando o mesmo conteúdo de antes (specs existentes de alertas passam).
- [ ] Implementar. Rodar spec novo + specs de alertas/painel (grep `dashboard-alertas`, `Alertas`). Commit.

### Task 3: Ajustar foto do perfil

**Files:** js/app.js (fluxo de `perfil-foto-input` em Configurações › Meu perfil), configuracoes.html se preciso, css; test `tests/e2e/perfil-foto-ajuste.spec.js`.

- [ ] Teste e2e (falha antes): escolher uma imagem (fixture gerada no teste, ex. 800×400) abre a janela "Ajustar foto" com prévia redonda, controle de zoom e arrastar; "Salvar foto" grava `foto_base64` quadrada 256×256 (conferir decodificando no navegador); "Cancelar" não muda a foto; nome alterado no perfil e a foto aparecem na barra superior (`atualizarTopbar`).
- [ ] Implementar com `<canvas>` (sem biblioteca). Commit.

### Task 4: Núcleo da agenda e ocupação única

**Files:** Create `js/agenda-core.js`, `tests/agenda-core.test.js`; Modify js/app.js (`_agdCompromissos`, `_agdRecarregar`, `_agdValidarDisp`/salvamentos de medição e instalação, lista de chaves do `salvarDB`, backup/import), páginas (incluir o núcleo).

**Interfaces — Produces (`AgendaCore`, puro):**
- `ocupacoesDoEvento(ev, cfg) -> [{ data, ini, fim }]` (minutos; dia inteiro/folga/férias = `cfg.inicio`–`cfg.fim` em cada dia de `data_ini`..`data_fim`; horário = `hora_ini`–`hora_fim` em `data_ini`).
- `conflitos(ocupacoes, novo: {data, ini, fim}) -> ocupacoes[]` (sobreposição estrita `a.ini < b.fim && b.ini < a.fim`).
- `periodo(visao: 'semana'|'dia'|'mes', dataISO) -> { ini, fim, dias: string[], rotulo }` (semana segunda–domingo; rótulo "17 a 23 de nov de 2025"; mês com dias da grade 6×7).
- `visivel(ev, usuarioId, ehAdmin) -> { titulo, descricao }` — para quem não é o dono do evento (prof `'u:'+usuarioId`) nem Admin: `titulo` "Compromisso" ou "Indisponível", `descricao` ''.
- `podeGerenciar(profChave, usuarioId, ehAdmin) -> bool` (Admin sempre; senão só `'u:'+usuarioId`).
- `janelaLembrete(ev, cfg) -> { de: Date, ate: Date } | null` (só compromisso; `de` = início − `aviso_min`).
- Em app.js: `_agdCompromissos()` passa a incluir os eventos (`tipo: 'bloq'|'comp'`, com `rotulo` já privado para quem vê) — horários riscados e disponibilidade passam a considerá-los sem mudança nos chamadores; `_agdRecarregar()` relê também `sc_agd_ev`; os salvamentos de medição/instalação chamam `_agdRecarregar()` e conferem conflito de novo imediatamente antes de gravar.

- [ ] Testes unitários (falham antes): férias 20–24 → 5 ocupações dia inteiro; conflito de 10:30–11:30 com 10:00–11:00 sim, com 11:00–12:00 não; `periodo('semana','2025-11-19')` → rótulo "17 a 23 de nov de 2025"; `visivel` esconde descrição para outro usuário e mostra para Admin e dono; `janelaLembrete` com aviso 30 min.
- [ ] e2e (`tests/e2e/agenda-ocupacao.spec.js`): evento de bloqueio gravado em `sc_agd_ev` para João 14:00–16:00 → no agendar medição para João nesse dia, 14:00 e 15:00 riscados; com outra aba (segundo `page` no mesmo contexto) gravando uma medição 10:00 para João, salvar na primeira aba outra medição 10:00 para João é recusado.
- [ ] Implementar. Rodar unit + specs de agenda/horários/instalação existentes. Commit.

### Task 5: Janela da Agenda

**Files:** Create `js/agenda.js`, `tests/e2e/agenda-janela.spec.js`; Modify index.html (botão "📅 Agenda" ao lado de Dashboards), js/app.js (ligar `#topbar-data` a `abrirAgenda()`, listener `storage` inclui `sc_agd_ev` e redesenha a janela aberta), css.

**Interfaces — Consumes:** Task 4 (`AgendaCore`, `_agdCompromissos`, `_agdProfissionais`, `getAgendaConfig`, `_agdRecarregar`). **Produces:** `abrirAgenda(profChave?)`, `fecharAgenda()`, `_agendaRedesenhar()`.

- [ ] e2e (falha antes): botão Agenda no Painel abre a janela sem sair da página, na "Minha agenda" do usuário logado em Semana; lateral lista os profissionais; Dia/Mês/‹ ›/Hoje funcionam; medição e instalação aparecem nas cores certas ocupando a duração; "Novo compromisso" e "Bloquear horário" (Horário, Dia inteiro, Folga, Férias com data fim) gravam e aparecem; editar/excluir; conflito avisa e não grava; usuário comum na agenda de outro: sem botões de criar, eventos pessoais sem descrição; Admin cria na agenda de outro e de profissional externo; data da barra superior abre a mesma janela em outra página; gravação noutra aba aparece na janela aberta sem recarregar; Esc/✕ fecha; 360px utilizável.
- [ ] Implementar seguindo o layout da referência (cabeçalho na cor principal do SCTech). Commit.

### Task 6: Lembretes de compromisso

**Files:** js/agenda.js e/ou js/notificacoes.js (coletor), js/app.js (verificação a cada minuto em todas as páginas logadas), test `tests/e2e/agenda-lembretes.spec.js`.

- [ ] e2e com relógio controlado (`page.clock`): compromisso 15:00–16:00 com aviso 30 min → às 14:29 nada; às 14:30 o sino conta, o item "Compromisso às 15:00: <descrição>" aparece no sino e nos Alertas do dono e um aviso na tela aparece uma vez (não repete ao recarregar); outro usuário não recebe; depois das 16:00 sai da lista.
- [ ] Implementar (coletor `Notif.registrar('compromissos', …)`). Commit.

### Task 7: Aceite de medição/instalação

**Files:** js/app.js (salvar/editar/reagendar medição e instalação; cards e detalhes; status "A reagendar"), js/notificacoes.js (coletores de aceite e de resposta), `_agdCompromissos` (pendente ocupa), js/agenda.js (tracejado), test `tests/e2e/aceite-agendamento.spec.js`.

**Dados:** `aceite: { status: 'pendente'|'aceito', por: <id de quem destinou>, em }` na medição e no pedido (`inst_aceite`); `recusa: { por, motivo, em }` / `inst_recusa`; medição recusada `status: 'A reagendar'`; instalação recusada sem agendamento (limpa `inst_agendado`, `inst_hora`, `data_entrega` só se a regra atual de "sem agendamento" usar isso — o construtor confirma), mantendo endereço/obs.

- [ ] e2e (falha antes): Admin agenda medição para Maria → Maria (logar como ela) vê no sino e nos Alertas "Você recebeu a medição de <cliente> em dd/mm às HH:MM." com Aceitar/Recusar; o horário dela já aparece ocupado (tracejado na agenda; riscado no agendar); Aceitar → Admin vê "Maria aceitou a medição de <cliente> (dd/mm HH:MM)."; outra: Recusar sem motivo não deixa; com motivo → medição "A reagendar" sem profissional/data/hora, horário liberado, Admin vê "Maria recusou a medição de <cliente>: <motivo>" com Reagendar que abre o editar; mesmo fluxo para instalação; agendar para si mesmo ou para profissional externo não pede aceite; Maria reagendando a própria não pede aceite.
- [ ] Implementar; specs existentes de medição/instalação/lembrete continuam passando. Commit.

### Task 8: Rolagem dos Pedidos

**Files:** js/app.js (lista de pedidos), test `tests/e2e/pedidos-rolagem.spec.js`.

- [ ] e2e (falha antes): com 40 pedidos, rolar até o fim, aplicar busca/filtro de status, aprovar um pedido (ação que recarrega) → após recarregar a rolagem está na mesma posição (±30px) e busca/filtro iguais; abrir pedidos.html normalmente (sem ação) começa no topo.
- [ ] Implementar com `sessionStorage` só no recarregamento da ação (mesmo esquema de `lembrarAbaAoRecarregar`). Commit.
