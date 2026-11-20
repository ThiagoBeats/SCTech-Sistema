# Feriados na Agenda — design curto + plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Pedido do dono (2026-11-20):** a Agenda funciona como calendário real: feriados nacionais aparecem sozinhos nas datas certas (inclusive móveis, como Carnaval e Sexta-feira Santa, conforme a fonte oficial), atualizados a cada ano, com identificação visual própria, **sem bloquear** a disponibilidade dos profissionais. **Decisões do dono:** estaduais automáticos a partir do estado da empresa (vem do CNPJ); municipais por um cadastro rápido em Configurar Empresa.

## Design
- **Cálculo local** (sem internet, qualquer ano): Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
- **Nacionais (lei):** 1/1 Confraternização Universal; Sexta-feira Santa (Páscoa − 2) "Paixão de Cristo"; 21/4 Tiradentes; 1/5 Dia do Trabalho; 7/9 Independência do Brasil; 12/10 Nossa Senhora Aparecida; 2/11 Finados; 15/11 Proclamação da República; 20/11 Dia Nacional de Zumbi e da Consciência Negra (**a partir de 2024**, Lei 14.759/2023); 25/12 Natal.
- **Pontos facultativos (tipo `facultativo`):** Carnaval segunda e terça (Páscoa − 48 e − 47); Quarta-feira de Cinzas (Páscoa − 46, "até as 14h"); Corpus Christi (Páscoa + 60).
- **Estaduais (tipo `estadual`):** tabela por UF dentro do sistema, cada linha com a lei de origem num comentário; só os feriados estaduais por lei (não os municipais da capital). Datas que coincidem com nacionais não repetem.
- **Municipais (tipo `municipal`):** Configurar Empresa › "Feriados da cidade": lista de {dia, mês, nome} que se repete todo ano + caixa "Corpus Christi é feriado na minha cidade" (então Corpus Christi vira `municipal` em vez de `facultativo`).
- **Empresa:** campo novo "Estado" (sigla, lista das 27 UFs) ao lado de Cidade, preenchido pela busca do CNPJ; usado para os estaduais. Sem estado: só nacionais, facultativos e municipais.
- **Agenda:** feriado não entra em `_agdCompromissos` (não ocupa, não risca horário, não afeta disponibilidade/conflitos). Semana e Dia: faixa no topo do dia com ícone 🎉 e o nome ("Natal", "Carnaval — ponto facultativo", "Revolução Constitucionalista — feriado estadual (SP)", "Aniversário da cidade — feriado municipal") e fundo leve na coluna; Mês: etiqueta no dia; legenda ganha "Feriado" e "Ponto facultativo". Cor própria (âmbar/dourado, token com versão escura), diferente de medição (verde), instalação (azul), bloqueio (vermelho), compromisso (roxo). Visível para todos.

## Global Constraints
- Vanilla JS sem build; textos em português simples, exatos como acima.
- `?v=` de todos os js/css em todas as páginas sobe para `20261130a` — só a Task 1 faz (novo `js/feriados-core.js` antes de `js/app.js` em todas as páginas que carregam app.js).
- Manter o fim de linha de cada arquivo; specs novos em CRLF.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` (seção da Agenda 2.5.1 e Configurar Empresa).
- Testes `npm test` + Playwright, porta indicada pelo controlador; parar o servidor que ligou.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1: Núcleo de feriados
**Files:** Create `js/feriados-core.js` (UMD puro, como `js/agenda-core.js`), `tests/feriados-core.test.js`; todas as páginas (`?v=` + script).
**Produces:** `FeriadosCore.pascoa(ano) -> 'AAAA-MM-DD'`; `FeriadosCore.doAno(ano, { uf, municipais: [{dia, mes, nome}], corpusMunicipal: bool }) -> [{ data: 'AAAA-MM-DD', nome, tipo: 'nacional'|'facultativo'|'estadual'|'municipal', uf?, obs? }]` ordenado por data; `FeriadosCore.noPeriodo(iniISO, fimISO, opts)` (atravessa anos); `FeriadosCore.UFS_COM_FERIADO` (siglas com tabela).
- Tabela estadual: pesquise cada UF em fonte oficial (lei estadual / site do governo / Assembleia) ou referência que cite a lei; anote a lei em comentário; em dúvida real sobre um feriado, deixe-o de fora e liste no relatório.
- Testes: `pascoa(2024)='2024-03-31'`, `pascoa(2025)='2025-04-20'`, `pascoa(2026)='2026-04-05'`, `pascoa(2027)='2027-03-28'`; 2026: Sexta-feira Santa 03/04, Carnaval 16 e 17/02, Cinzas 18/02, Corpus Christi 04/06; 20/11 presente em 2024+ e ausente em 2023; SP 2026 tem 09/07; PR tem 19/12; RS tem 20/09; sem uf não há estadual; municipal {dia:8,mes:9} aparece todo ano; `corpusMunicipal` muda o tipo de Corpus Christi; `noPeriodo('2026-12-28','2027-01-03')` inclui 2027-01-01 e não inclui 2026-12-25.

### Task 2: Empresa (Estado + Feriados da cidade) e Agenda
**Files:** empresa.html, js/app.js (config da empresa, busca do CNPJ preenche `emp-uf`), js/agenda.js, css, FUNCIONALIDADES; test `tests/e2e/feriados-agenda.spec.js`.
- e2e: empresa com Estado SP; Agenda na semana de 09/07/2026 (relógio fixo) mostra a faixa "Revolução Constitucionalista — feriado estadual (SP)" com a cor de feriado; semana do Natal mostra "Natal"; fevereiro/2026 no Mês mostra Carnaval como ponto facultativo; navegar para 2027 mostra os feriados de 2027 sem nada cadastrado; cadastrar "8/9 Aniversário da cidade" em Configurar Empresa → aparece em 08/09 de 2026 e 2027; no dia de feriado, Agendar medição para um profissional continua com os horários livres (não riscados) e salva sem conflito; busca do CNPJ (API simulada) preenche Estado; usuário comum também vê os feriados; tema escuro legível.
