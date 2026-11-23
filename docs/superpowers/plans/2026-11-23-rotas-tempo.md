# Rotas do dia otimizando o tempo + aviso de deslocamento — design curto + plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Pedido do dono (2026-11-23):** "Sugerir ordem" deve calcular a ordem que diminui/elimina atrasos (otimizar o **tempo**, não o caminho; pode voltar duas vezes à mesma cidade); mostrar o horário em que o técnico precisa **sair** para chegar a tempo no 1º cliente; **alertar** quando a sequência não dá tempo (fim do serviço + deslocamento passa do início da próxima) e quando o serviço invade a próxima visita — nas Rotas do dia **e** ao agendar medição/instalação.
**Decisões do dono:** no agendamento **avisa e deixa agendar** ("Escolher outro horário" / "Agendar mesmo assim"); **folga de 10 minutos** além do tempo de carro.

## Como está hoje (js/rotas.js, js/rotas-core.js, js/app.js)
- `sugerirMelhorOrdem` usa o `trip` do OSRM (caminho circular mais curto) ou `melhorOrdemAberta` (DP de menor distância) — ignora horários.
- `RotasCore.calcularChegadas` já calcula chegada/início/atraso (tolerância `TOLERANCIA_MIN = 10`) e `saidaMin`; a saída aparece só na linha "Total".
- No agendamento, sobreposição de serviço já é bloqueada (`_agdConflitos`/`_agdValidarDisp`, horários riscados); deslocamento entre visitas não é conferido.

## Design
- **Folga:** constante `FOLGA_MIN = 10` em RotasCore. Para cada visita com horário: `chegada = fim do serviço anterior (ou saída) + deslocamento`. Situação: **atrasada** se `chegada > agendado`; **apertada** se `agendado − 10 < chegada ≤ agendado` (menos de 10 min de folga). A tolerância antiga de 10 min deixa de existir (o atraso passa a contar desde 1 min; o aviso amarelo cobre a margem). Atualizar o texto de observação/WhatsApp que usa o atraso.
- **Sugerir ordem (otimiza tempo):** matriz de tempos do OSRM `table` (empresa + visitas; sem empresa, só visitas). Testa as ordens (exato até 9 visitas por permutação/DP; acima disso, heurística: ordena por horário e melhora por trocas 2-opt sob o mesmo critério). Critério, nesta ordem: (1) menos visitas atrasadas; (2) menor soma de minutos de atraso; (3) menos visitas apertadas; (4) menor hora de término do dia (fim da última visita, ou volta à empresa quando há empresa). Visitas sem horário entram onde menos atrapalham. Função pura `RotasCore.melhorOrdemPorTempo({ matrizMin, paradas: [{agendadoMin, durMin}], comEmpresa, voltaEmpresa }) -> number[]` (índices das paradas).
- **Saída:** linha destacada no topo da rota: "🚗 Sair às HH:MM para chegar às HH:MM em <1º cliente>" (`saidaMin` = agendado do 1º − deslocamento − 10 de folga; sem empresa: "Começa em <1º cliente> às HH:MM").
- **Alertas na rota:** em cada visita, selo vermelho "Atraso de X" ou amarelo "Apertado: chega HH:MM, sobram N min"; quando o serviço anterior termina depois do início desta, "⚠ O serviço anterior termina HH:MM, depois do início desta visita". Resumo no topo: "N visita(s) não dá(ão) tempo" com o botão Sugerir ordem.
- **Agendamento (medição e instalação, novos e editar/reagendar):** depois da conferência de sobreposição (que continua bloqueando), confere o deslocamento com a visita anterior e a próxima do mesmo profissional no mesmo dia (endereços com cidade, usando a geolocalização com cache e o OSRM `route`/`table` já usados nas rotas). Se não der tempo (com a folga), janela: "Não dá tempo de chegar: <anterior> termina HH:MM e o deslocamento até aqui leva ~N min (chegada HH:MM, folga de 10 min)." e/ou o mesmo para a próxima visita, com **Escolher outro horário** (volta ao formulário) e **Agendar mesmo assim** (salva). Sem internet / endereço não encontrado: não bloqueia e não avisa nada além de uma linha discreta "Não deu para conferir o deslocamento." no toast de sucesso.

## Global Constraints
- Vanilla JS sem build; textos em português simples, exatos como acima.
- `?v=` de todos os js/css sobe para `20261201a` — só a Task 1 faz.
- Manter fim de linha; specs novos em CRLF; e2e com relógio fixo (`page.clock`) e OSRM/Nominatim simulados por `page.route` (nunca rede real).
- Atualizar `FUNCIONALIDADES_SCTECH.txt` (Rotas do dia e agendamentos) e `C:/Users/Asus/Desktop/SCTech/Alertas-e-notificacoes-SCTech.txt` (UTF-8 BOM, CRLF) com os avisos novos.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1: Núcleo (RotasCore) — critério de tempo e situações
**Files:** js/rotas-core.js, tests/rotas-core.test.js, todas as páginas (`?v=`).
**Produces:** `RotasCore.FOLGA_MIN = 10`; `calcularChegadas` passa a devolver por parada `{ chegadaMin, inicioMin, fimMin, atrasoMin, folgaMin, situacao: 'ok'|'apertada'|'atrasada'|'sem-horario', invadeMin }` (invadeMin = quanto o serviço anterior passa do horário desta, mesmo sem deslocamento) e `saidaMin` com a folga; `RotasCore.melhorOrdemPorTempo(...)` como no design; `RotasCore.situacaoEncaixe({ antes: {fimMin}|null, depois: {agendadoMin}|null, novo: {agendadoMin, durMin}, desloc: {antesMin, depoisMin} }) -> { chegaTarde: bool, chegadaMin, faltaMin, atrasaProxima: bool, chegadaProximaMin }` para o agendamento.
- Testes: exemplo do dono (13:00 + 1h, próxima 14:15, deslocamento 25 min → atrasada; 5 min → ok; 8 min → apertada); três visitas em que a ordem por menor caminho atrasa e a por tempo não (matriz montada à mão) → `melhorOrdemPorTempo` escolhe a sem atraso mesmo com mais km; empates resolvidos pelo término; visita sem horário; `saidaMin` = agendado − deslocamento − 10; 10 visitas usa a heurística e não piora o critério da ordem por horário.

### Task 2: Rotas do dia
**Files:** js/rotas.js, css, FUNCIONALIDADES; test `tests/e2e/rotas-tempo.spec.js`.
- `sugerirMelhorOrdem` usa `table` + `melhorOrdemPorTempo` (com e sem empresa); linha de saída destacada; selos por visita e resumo; WhatsApp/observação usam as novas situações.
- e2e (OSRM/Nominatim simulados): caso em que o caminho mais curto atrasaria → Sugerir ordem escolhe a ordem sem atraso; linha "Sair às …"; selo "Apertado"/"Atraso"; aviso de serviço invadindo a próxima.

### Task 3: Aviso de deslocamento ao agendar
**Files:** js/app.js (`_agdValidarDisp` e chamadores: agendar/editar/reagendar medição e instalação), Alertas txt, FUNCIONALIDADES; test `tests/e2e/agendar-deslocamento.spec.js`.
- e2e: profissional com visita 13:00 (1h) em A; agendar outra 14:15 em B com deslocamento simulado de 25 min → janela com o texto e os dois botões; "Agendar mesmo assim" salva; "Escolher outro horário" não salva; deslocamento 5 min → salva sem janela; a nova visita atrasaria a próxima → janela sobre a próxima; OSRM fora do ar → salva e mostra "Não deu para conferir o deslocamento."; sobreposição continua bloqueando como hoje.
