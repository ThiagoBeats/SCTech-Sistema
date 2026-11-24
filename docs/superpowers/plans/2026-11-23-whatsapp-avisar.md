# Avisar clientes pelo WhatsApp (link) nas Rotas do dia — design curto + plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Pedido do dono (2026-11-23):** opção 1 da análise do WhatsApp Business: sem custo e sem servidor (link `wa.me`). O sistema monta a mensagem pronta para cada cliente e abre o WhatsApp do celular ou do computador; o profissional só toca em "Enviar". Nas Rotas do dia, uma lista **"Avisar clientes"** com um botão por cliente, que marca **"Avisado"** ao enviar e não deixa mandar duas vezes no mesmo agendamento. O botão tem o **ícone oficial do WhatsApp** e, ao passar o mouse, mostra **"Enviar por WhatsApp"**.
**Decisão do dono:** horário na mensagem = **opção B**: o horário agendado; quando a rota calculada mostra a visita **atrasada**, a previsão de chegada.

## Abordagens
- **Link `wa.me` com mensagem pronta (escolhida pelo dono):** grátis, sem servidor, sai pelo número de quem está com o celular, não é automático.
- API oficial do WhatsApp Business (Meta): automática, mas exige servidor (token e webhook não podem ficar no navegador) e custo por conversa. Fica para depois, se os sócios decidirem.

## Design
- **Onde:** Rotas do dia, abaixo da lista da rota, seção "Avisar clientes" na mesma ordem da rota. Uma linha por visita: `<ícone> Cliente — Medição|Instalação #N · <dia> <horário>` + botão, ou o estado avisado.
- **Botão:** ícone oficial do WhatsApp (SVG inline do Simple Icons, CC0, verde #25D366) + texto "Avisar"; `title="Enviar por WhatsApp"` e `aria-label="Enviar por WhatsApp para <cliente>"`. Abre `https://wa.me/<55+número>?text=<mensagem>` (reusar `CaixaCore.normalizarTelefone`/`linkWhatsApp`).
- **Marcar avisado:** no clique, se a janela abriu, grava na visita `{ data, hora, em: ISO, por: idUsuário, porNome }` (medição: `m.aviso_cliente`; instalação: `p.inst_aviso_cliente`), `syncDB()`. A linha passa a mostrar "✓ Avisado às HH:MM por <nome>" e um link discreto "desfazer" (apaga a marca, volta o botão). Avisado vale só para o mesmo agendamento: se `aviso.data`/`aviso.hora` diferem da data/hora atuais da visita (reagendou), volta a aparecer o botão. Janela bloqueada pelo navegador: não marca e mostra "O navegador bloqueou a janela do WhatsApp. Libere os pop-ups e tente de novo." (mesmo texto da cobrança).
- **Sem telefone válido:** botão desabilitado com `title="Cliente sem telefone no cadastro"` e o texto "Sem telefone".
- **Mensagem padrão (editável):** `Olá, {cliente}! Aqui é da {empresa}. Passando para confirmar a sua {servico} {dia}, {horario}. Qualquer dúvida, é só responder esta mensagem.`
  - `{servico}`: "medição" | "instalação"; `{dia}`: "hoje" | "amanhã" | "no dia DD/MM"; `{horario}`: "às HH:MM" (agendado) | "com chegada prevista por volta de HH:MM" (rota calculada e visita atrasada; previsão = chegada arredondada **para cima** ao múltiplo de 5 min — minha decisão, "por volta de 14:37" soa estranho) | "em horário a combinar" (sem horário); `{tecnico}`: nome do profissional da rota (vazio se "A definir").
  - Configurar Empresa ganha o card "Mensagem de aviso de visita" (mesmo formato do card de cobrança, com Salvar e Restaurar padrão), campo `mensagem_aviso_visita` na empresa.
- **Ícone em todos os botões de WhatsApp (minha decisão, aprovada junto):** "💬 Cobrar" (A Receber e Hoje) e "📤 Enviar ao técnico" passam a usar o mesmo ícone, com `title="Enviar por WhatsApp"`.

## Global Constraints
- Vanilla JS sem build; textos em português, exatos como acima.
- `?v=` de todos os js/css em todas as páginas sobe para `20261204a` — só a Task 1 faz.
- Manter o fim de linha de cada arquivo; specs novos em CRLF; e2e com relógio fixo (`page.clock`), OSRM/Nominatim simulados (já feito em `tests/e2e/ajuda.js`), `window.open` interceptado (nunca abrir o WhatsApp real).
- Atualizar `FUNCIONALIDADES_SCTECH.txt` (Rotas do dia e Configurar Empresa).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1: Núcleo da mensagem, ícone e configuração
**Files:** js/rotas-core.js, tests/rotas-core.test.js, js/app.js (helper do ícone, salvar/restaurar/carregar mensagem), empresa.html, css/style.css, todas as páginas (`?v=`).
**Produces:**
- `RotasCore.MENSAGEM_AVISO_PADRAO` (texto acima).
- `RotasCore.textoAvisoCliente(template, { cliente, empresa, tipo: 'med'|'inst', data: 'AAAA-MM-DD', hoje: 'AAAA-MM-DD', hora: 'HH:MM'|'' , previstaMin: number|null, tecnico }) -> string` — `previstaMin` não nulo ⇒ "com chegada prevista por volta de" + arredondado para cima a 5 min.
- `RotasCore.avisoValido(aviso, data, hora) -> bool` (aviso existe e data/hora iguais).
- `iconeWhatsApp(tamPx = 16) -> string` (SVG inline, `aria-hidden="true"`, `fill="#25D366"`), global em js/app.js; classe CSS `.btn-whats` (ícone + texto alinhados, legível no tema escuro).
- Card "Mensagem de aviso de visita" em empresa.html (`#emp-msg-aviso`), `salvarMensagemAviso()`, `restaurarMensagemAviso()`, carregado como o da cobrança.
- Testes: hoje/amanhã/no dia 25/11; "às 14:00"; previsão 14:37 → "14:40", 14:40 → "14:40"; sem hora → "em horário a combinar"; {servico} medição/instalação; placeholders desconhecidos ficam como estão; `avisoValido` falso quando a hora mudou, quando a data mudou e quando não há aviso.

### Task 2: Lista "Avisar clientes" nas Rotas e ícone nos botões existentes
**Files:** js/rotas.js, js/app.js (botões Cobrar), css, FUNCIONALIDADES; test `tests/e2e/whatsapp-avisar.spec.js`.
**Consumes:** tudo da Task 1.
- `avisarClienteWhats(tipo, id)` e `desfazerAvisoCliente(tipo, id)` em js/rotas.js; a seção é redesenhada em `_rotaDesenhar`; a previsão vem de `_rotaChegadas` (situacao `'atrasada'` e não `incerto` ⇒ `previstaMin = chegadaMin`).
- e2e (relógio fixo, `window.open` substituído por stub que grava a URL e devolve um objeto): medição e instalação do mesmo técnico no dia → seção com 2 linhas na ordem da rota; botão tem `title` "Enviar por WhatsApp" e o SVG; clicar abre `wa.me/55<número>` com a mensagem padrão ("hoje, às 09:00"); a linha vira "✓ Avisado às …" e o botão some; recarregar a página mantém avisado; "desfazer" volta o botão; reagendar a hora (alterar no db) volta o botão; cliente sem telefone → botão desabilitado "Sem telefone"; janela bloqueada (stub devolve null) → aviso e não marca; rota calculada com a visita atrasada (OSRM simulado) → mensagem com "com chegada prevista por volta de"; mensagem editada em Configurar Empresa é usada; botões Cobrar e Enviar ao técnico têm o SVG e o `title`.
