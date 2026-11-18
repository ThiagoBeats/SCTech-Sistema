# Barras novas + sino, Agenda no Painel, aceite de agendamentos e rolagem dos Pedidos — design

**Pedido do dono (2026-11-17)**, com duas imagens de referência (janela da Agenda; barra superior grafite + lateral cinza-claro). Itens do mesmo pedido que **já estão prontos** (PR #14, só testar): ⋮ nos cards do Kanban, horários riscados no agendamento, lembrete diário de confirmar instalação.

**Decisões do dono (2026-11-17):** agendamento destinado a outro usuário fica **reservado** enquanto aguarda aceite; recusado fica **"A reagendar"** (mantém cliente/endereço/obs, limpa profissional/data/hora, guarda o motivo, avisa quem destinou); a data no topo **abre a Agenda**; recusa com **motivo obrigatório**.

**Limite conhecido (dito ao dono):** os dados ficam no navegador de cada computador (localStorage). Avisos entre usuários, aceite e "dois usuários ao mesmo tempo" funcionam entre usuários do **mesmo navegador** (e entre abas abertas). Entre computadores diferentes só com servidor — fora do escopo. Tudo é feito a partir dos dados (sem depender de quem está na tela) para funcionar quando houver servidor.

## Ordem
1. Barras + sino de notificações + foto com enquadramento. 2. Agenda. 3. Aceite/recusa. 4. Rolagem dos Pedidos. 5. Lista de testes para o dono (todos os itens, inclusive os já prontos e o CEP).

## Abordagens
- **Agenda derivada (escolhida):** a agenda não copia medições/instalações; ela lê os registros originais (a função que já junta tudo — `_agdCompromissos`) e soma os eventos próprios (bloqueios e compromissos pessoais) num array novo. Uma regra de disponibilidade só, usada por agenda, horários riscados, disponibilidade e conferência de conflito. Sem duplicação, reagendar/cancelar reflete sozinho.
- Cópia dos agendamentos em eventos da agenda: descartada (duplicação e sincronização — o dono pediu "não criar eventos duplicados").
- Módulo/página nova de agenda: descartada (o dono pediu janela sobre o Painel, sem item no menu).

## 1. Barras e sino
- **Barra superior** fixa, largura toda, cor grafite (token `--topbar-bg` ≈ `#2B2F33`, texto claro), altura ≈ 60px, em todas as páginas que hoje têm a barra lateral (as de impressão não mudam). Esquerda: logo da empresa (`emp.logo_base64`; sem logo, `images/logo.png`) + nome (`nome_fantasia || razao_social || 'SCTech'`) — os mesmos já configurados em Configurar Empresa. **Sem nome do módulo** (o título da página continua no conteúdo, como hoje). Direita: "📅 Hoje, 28 de outubro de 2026 ▾" (abre a Agenda), sino com contagem, avatar (foto ou iniciais) que abre o menu de perfil que hoje fica no logo da lateral (Meu perfil, Sobre o Sistema, Configurar Empresa, Sair).
- **Barra lateral** abaixo da superior, cinza-claro (token `--sidebar-bg` ≈ `#EEF0F3`), itens com ícone + texto, item ativo destacado com fundo arredondado (como a referência), "Sair do sistema" no rodapé. **Mantém o 📌** e o comportamento atual (fixar/recolher). Mesmos módulos, mesmas permissões, nada removido ou adicionado.
- Tema escuro: os tokens novos têm versão escura. Celular: a barra superior encolhe (some a data por extenso, fica o ícone); a lateral continua como hoje no celular.
- **Perfil:** nome e foto já são editáveis em Configurações › Meu perfil. Novo: ao escolher a foto abre a janela "Ajustar foto" (arrastar para enquadrar, controle de zoom, prévia redonda); salvar grava a foto recortada quadrada 256×256. O nome/foto atualizam a barra superior na hora.
- **Sino = mesma lista do card "Alertas do Sistema"** do Painel, mais as notificações novas (lembretes de compromisso, pedidos de aceite, respostas de aceite). Cada alerta tem uma chave estável; a contagem do sino é o número de alertas que **este usuário ainda não abriu**; abrir (clicar) um alerta marca como visto e a contagem cai. Passar o mouse (ou tocar, no celular) no sino mostra uma mini-janela com a lista; clicar num item leva ao lugar do alerta. Itens de ação (aceitar/recusar) continuam na lista até serem respondidos. O selo "Alertas desabilitados" atual continua valendo (alertas desligados não contam).
- A geração dos alertas do Painel vira uma função única usada pelo card e pelo sino (em qualquer página).

## 2. Agenda (janela sobre o Painel)
- **Onde:** botão "📅 Agenda" no cabeçalho do Painel de Acompanhamento, ao lado de Dashboards; e a data da barra superior (qualquer página). Abre uma janela grande sobreposta (sem sair da tela), no layout da referência com as cores do SCTech (cabeçalho na cor principal do sistema, não laranja).
- **Lateral:** lista de profissionais = mesma lista do "Responsável" dos agendamentos (usuários ativos + profissionais externos). Abre na agenda do usuário logado ("Minha agenda", no topo); clicar em outro mostra a agenda dele.
- **Visões:** Semana (padrão), Dia, Mês; setas ‹ › e o período por extenso ("17 a 23 de nov de 2025"); botão para voltar a hoje. Linhas de horário = expediente e passo da Configuração da agenda. Eventos ocupam todo o intervalo início–fim. Mês: até 3 itens por dia + "+N".
- **Cores/legenda:** Medição (verde), Instalação (azul), Bloqueado (vermelho claro), Compromisso (roxo), Aguardando aceite (tracejado na cor do tipo).
- **Eventos próprios** em `db.agenda_eventos`: `{ id, prof (chave do profissional, ex. 'u:12'), tipo: 'compromisso'|'bloqueio', bloqueio: 'horario'|'dia'|'folga'|'ferias', data_ini, data_fim, hora_ini, hora_fim, dia_inteiro, descricao, aviso_min, criado_por, criado_em, alterado_em }`.
  - **Novo compromisso:** data, hora início, hora fim, descrição, aviso (15 min / 30 min / 1 h / 1 dia antes; padrão 30 min).
  - **Bloquear horário:** tipo (Horário / Dia inteiro / Folga / Férias), data início (e data fim para Dia/Folga/Férias — vários dias), hora início/fim (só Horário), motivo opcional.
  - Editar e excluir pelo clique no evento.
- **Permissões:** todos veem todas as agendas. Criar/editar/excluir bloqueio e compromisso: só na própria agenda; o Administrador em todas (inclusive profissionais externos, que só o Administrador gerencia). Medições/instalações abrem o detalhe que já existe (as ações seguem as permissões de hoje).
- **Privacidade:** quem não é o dono nem Administrador vê só "Compromisso" / "Indisponível" (sem descrição/motivo).
- **Integração (uma regra só):** bloqueios e compromissos entram na lista de ocupação do profissional → aparecem riscados no horário dos agendamentos, na Disponibilidade do profissional e na conferência de conflito; medições/instalações agendadas (inclusive aguardando aceite) ocupam a agenda. Duração sempre pelo intervalo inteiro.
- **Conflitos:** nunca dois itens ao mesmo tempo para o mesmo profissional. Vale ao salvar compromisso/bloqueio (avisa com o que conflita e não salva) e ao salvar medição/instalação. Antes de gravar, relê os dados salvos (outra aba pode ter gravado) e confere de novo.
- **Atualização automática:** gravou em qualquer aba → Agenda aberta, card de Alertas, sino, listas de agendamento e horários riscados se redesenham sozinhos (evento `storage`), sem recarregar.
- **Lembretes de compromisso:** a partir de (início − aviso) até o fim do compromisso, aparece no sino e nos Alertas do dono; quando o momento chega com o sistema aberto, também um aviso na tela (uma vez). Conferência a cada minuto.

## 3. Aceite de medição/instalação
- Ao salvar uma medição ou instalação (nova, editada ou reagendada) cujo responsável é **outro usuário** e houve mudança de responsável, data ou hora feita por alguém que não é ele: fica **aguardando aceite** (`aceite: { status: 'pendente', por: <usuário que destinou>, em }`). Responsável = o próprio usuário, ou profissional externo (sem usuário): vale direto, sem aceite.
- O destinado recebe, no sino e nos Alertas: "Você recebeu a medição de <cliente> em dd/mm às HH:MM." (ou "a instalação do pedido #N…") com **Aceitar** e **Recusar**.
- Aceitar → `aceite.status = 'aceito'`; quem destinou recebe "<Nome> aceitou a medição de <cliente> (dd/mm HH:MM)."
- Recusar → pede o motivo (obrigatório); medição fica com status **"A reagendar"**, instalação volta para "sem agendamento" com marca de recusa; mantém cliente, endereço e observações; limpa profissional, data e hora; guarda `recusa: { por, motivo, em }`. Quem destinou recebe "<Nome> recusou a medição de <cliente>: <motivo>" com botão **Reagendar** (abre o formulário de editar já com os dados). O horário é liberado.
- Enquanto pendente: reserva o horário (tracejado na agenda, "aguardando aceite" no card da agenda de medições/instalações).

## 4. Rolagem dos Pedidos
- Na lista de Pedidos, qualquer ação que recarrega a página (aprovar, mudar status, excluir…) volta para a mesma posição da rolagem, com a mesma busca e filtros que estavam. Só no recarregamento causado pela ação (mesmo esquema da aba lembrada: `sessionStorage`).

## Constraints
- Vanilla JS sem build; textos em português simples; manter fim de linha de cada arquivo; `?v=` sobe para `20261128a`; atualizar `FUNCIONALIDADES_SCTECH.txt`; testes `npm test` + Playwright; commits com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Não remover nem adicionar módulos; não mudar funcionalidades existentes além do descrito.

## Deixado para o construtor
- Nomes de funções/ids, CSS exato dentro dos tokens, como recortar a foto (canvas), estrutura da janela da agenda.
