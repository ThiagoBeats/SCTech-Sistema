# CEP e endereço em partes — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** CEP + "Buscar endereço" e endereço em partes (Rua, Número, Complemento, Bairro, Cidade, Estado) no cliente e nos agendamentos de medição/instalação, usados nas rotas e no 📍 Ir.

**Architecture:** um núcleo puro novo `js/endereco-core.js` (UMD, testado com `node --test`) monta textos e interpreta as respostas das APIs de CEP; `RotasCore` ganha a montagem do endereço de rota e a lista de consultas de geolocalização. Na tela, um componente único de campos de endereço (gerado por função em `js/app.js`) é usado no cliente, nos formulários de agendar e nas janelas Editar. As partes são gravadas junto com o texto único de sempre (`end` / `endereco` / `inst_endereco`), que é montado a partir delas — os leitores antigos (OS, proposta, etiquetas, busca) não mudam.

**Tech Stack:** HTML/JS vanilla + localStorage; `node --test`; Playwright e2e.

**Spec:** `Docs/superpowers/specs/2026-11-17-cep-endereco-design.md` (decisões do dono: opção A — campos separados; CEP + Buscar endereço também nos agendamentos).

## Global Constraints
- Vanilla JS sem build; textos de tela em português simples; textos citados aqui são exatos.
- Não mudar comportamento fora do item. Manter o fim de linha de cada arquivo (conferir `git diff --stat` com `--ignore-space-at-eol`).
- `?v=` de todos os `js`/`css` em todas as páginas sobe para `20261127a` — só a Task 1 faz (e inclui `js/endereco-core.js` antes de `js/app.js` em todas as páginas que incluem `rotas-core.js`).
- APIs: ViaCEP `https://viacep.com.br/ws/<8 dígitos>/json/` (primeira); BrasilAPI `https://brasilapi.com.br/api/cep/v1/<8 dígitos>` só quando a ViaCEP falhar por rede/erro HTTP (não quando responder `{"erro": true}`).
- Mensagens exatas: "CEP não encontrado. Confira os números ou preencha o endereço à mão." · "Esse CEP é da cidade toda: preencha a rua e o bairro." · "Não deu para buscar o endereço agora. Preencha à mão." · botão "Buscar endereço".
- Rótulos dos campos, nesta ordem: "CEP", "Rua", "Número", "Complemento", "Bairro", "Cidade", "Estado" (Estado = `<select>` com opção vazia + as 27 UFs em sigla).
- Atualizar `FUNCIONALIDADES_SCTECH.txt` onde cliente, agendamentos e rotas já são descritos.
- Testes: `npm test` e Playwright (`tests/e2e/`), porta indicada pelo controlador; parar o servidor que ligou. Nos e2e, as APIs de CEP são sempre simuladas com `page.route` (nunca rede real).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Modelo de dados (todas as tasks)
- Cliente: `cep, rua, numero, complemento, bairro, cidade, uf` + `end` = `EnderecoCore.textoEndereco(partes)`.
- Medição: `cep, rua, numero, complemento, bairro, cidade, uf` + `endereco` = texto montado.
- Pedido (instalação): `inst_cep, inst_rua, inst_numero, inst_complemento, inst_bairro, inst_cidade, inst_uf` + `inst_endereco` = texto montado.
- Registro antigo = sem a chave `rua` (`rua === undefined`; para pedido, `inst_rua === undefined`). Ao abrir para editar: Rua = texto antigo inteiro, Cidade = cidade antiga, resto vazio.

## Review Focus
- Cliente antigo editado e salvo sem mexer no endereço: `end` não pode perder nada (Rua = texto antigo → `end` igual ao de antes).
- Editar um pedido (salvarPedido, ramo de edição) não pode apagar os `inst_cep…inst_uf` novos (lista de campos preservados).
- CEP digitado com máscara/espaços/traço ("80.010-000", " 80010000 ") busca certo; com 7 ou 9 dígitos o botão não aparece.
- Duas respostas fora de ordem (pessoa troca o CEP e clica de novo): só a resposta do último CEP preenche.
- Rotas com endereço que o Nominatim não acha completo: tenta as consultas seguintes na ordem e guarda no cache pelo texto completo.

---

### Task 1: Núcleos (EnderecoCore + RotasCore) e `?v=`

**Files:** Create `js/endereco-core.js`, `tests/endereco-core.test.js`; Modify `js/rotas-core.js`, `tests/rotas-core.test.js`, todas as `*.html` (`?v=` e `<script src="js/endereco-core.js?v=20261127a">` antes do app.js), `package.json` só se o `npm test` não pegar o arquivo novo sozinho.

**Interfaces — Produces:**
- `EnderecoCore.soDigitosCep(s) -> string` (só dígitos, até 8).
- `EnderecoCore.mascaraCep(s) -> string` ("80010000" → "80010-000"; parcial "8001" → "8001"; "800100" → "80010-0").
- `EnderecoCore.cepCompleto(s) -> boolean` (exatamente 8 dígitos após limpar).
- `EnderecoCore.textoEndereco({rua, numero, complemento, bairro}) -> string` — "Rua, Número, Complemento, Bairro", vazios fora, partes com `trim()`.
- `EnderecoCore.partesDeRegistroAntigo(texto, cidade) -> partes` → `{cep:'', rua:texto||'', numero:'', complemento:'', bairro:'', cidade:cidade||'', uf:''}`.
- `EnderecoCore.interpretarViaCep(json) -> {ok:true, rua, bairro, cidade, uf, cidadeToda} | {ok:false, motivo:'nao-encontrado'}` (`erro: true`/`"true"` → não encontrado; `cidadeToda = !logradouro`).
- `EnderecoCore.interpretarBrasilApi(json) -> mesmo formato` (`street, neighborhood, city, state`).
- `EnderecoCore.UFS` — array das 27 siglas em ordem alfabética.
- `RotasCore.enderecoDePartes(p) -> string` — "Rua, Número, Bairro, Cidade - UF, CEP" (complemento fora; vazios fora; "Cidade - UF" vira só a que existir; CEP com máscara).
- `RotasCore.consultasGeo(p) -> string[]` — `[enderecoDePartes(p), "Rua, Número, Cidade - UF", "CEP, Cidade - UF"]`, sem vazios, sem repetidos, e a terceira só se houver CEP.

- [ ] **Step 1: testes que falham** em `tests/endereco-core.test.js` e `tests/rotas-core.test.js`, incluindo:
  - `textoEndereco({rua:'Rua XV de Novembro', numero:'100', complemento:'', bairro:'Centro'}) === 'Rua XV de Novembro, 100, Centro'`
  - `mascaraCep(' 80.010-000 ') === '80010-000'`, `cepCompleto('8001000') === false`, `cepCompleto('800100001') === false`
  - `interpretarViaCep({erro:true}).ok === false`; `interpretarViaCep({cep:'85960-000', logradouro:'', bairro:'', localidade:'Marechal Cândido Rondon', uf:'PR'})` → `cidadeToda: true`
  - `enderecoDePartes({rua:'Rua XV de Novembro', numero:'100', complemento:'ap 3', bairro:'Centro', cidade:'Curitiba', uf:'PR', cep:'80020310'}) === 'Rua XV de Novembro, 100, Centro, Curitiba - PR, 80020-310'`
  - `consultasGeo` do mesmo objeto → 3 itens na ordem acima; sem CEP → 2 itens; só `{rua:'X', cidade:'Y'}` → `['X, Y']`.
- [ ] **Step 2:** `npm test` → falha (módulo inexistente).
- [ ] **Step 3:** implementar (UMD no mesmo formato de `rotas-core.js`); subir `?v=` e incluir o script.
- [ ] **Step 4:** `npm test` → tudo passa.
- [ ] **Step 5:** commit.

### Task 2: Componente de endereço + cadastro do cliente

**Files:** Modify `js/app.js` (salvarCliente/editarCliente/cancelarEdicaoCliente/`_clienteEndCidade`), `clientes.html`, `css/style.css`; Test `tests/e2e/cep-cliente.spec.js`.

**Interfaces — Consumes:** Task 1. **Produces (usado pela Task 3):**
- `enderecoCamposHtml(prefixo, opts) -> string` — gera os 7 campos + botão + linha de status com ids `${prefixo}-cep, -rua, -numero, -complemento, -bairro, -cidade, -uf, -buscar-cep, -cep-status`; `opts.obrigRua` põe o `*` na Rua; `opts.ir` (boolean) mantém o botão "📍 Ir para endereço" ao lado da Rua (lendo as partes).
- `enderecoAnexar(prefixo)` — liga máscara do CEP, mostra/esconde o botão (só com 8 dígitos), Enter no CEP busca.
- `enderecoLer(prefixo) -> partes` (com `trim`, `uf` em maiúsculas, `cep` só dígitos).
- `enderecoPreencher(prefixo, partes)`.
- `async buscarEnderecoCep(prefixo)` — ViaCEP → (falha de rede/HTTP) BrasilAPI; preenche Rua/Bairro/Cidade/UF, foco no Número; não mexe em Número/Complemento; mensagens exatas da Global Constraints no `-cep-status`; ignora resposta se o CEP do campo mudou desde o clique.

- [ ] **Step 1: e2e que falha** `cep-cliente.spec.js` (APIs via `page.route`):
  - CEP "80020310" → botão visível → clicar → Rua "Rua XV de Novembro", Bairro "Centro", Cidade "Curitiba", Estado "PR", foco no Número; salvar com Número 100 → cliente gravado com as partes e `end === 'Rua XV de Novembro, 100, Centro'`; lista mostra "Rua XV de Novembro, 100, Centro — Curitiba/PR".
  - CEP com 7 dígitos → botão oculto.
  - ViaCEP `{erro:true}` → mensagem "CEP não encontrado. Confira os números ou preencha o endereço à mão." e campos já digitados continuam.
  - ViaCEP abortada (`route.abort()`) + BrasilAPI responde → preenche; as duas abortadas → "Não deu para buscar o endereço agora. Preencha à mão."
  - CEP da cidade toda → Cidade/Estado preenchidos + "Esse CEP é da cidade toda: preencha a rua e o bairro."
  - Cliente antigo `{end:'Rua A, 5, Centro', cidade:'Toledo'}` → editar → Rua = "Rua A, 5, Centro", Cidade "Toledo" → salvar sem mexer → `end` igual.
  - CEP sem preencher nada salva normal (não obrigatório).
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar; formulário cabe no celular (grid que quebra linha).
- [ ] **Step 4:** spec novo + specs de clientes existentes passam (`clientes`, `cidade-rotas`).
- [ ] **Step 5:** commit.

### Task 3: Agendamentos de medição e instalação

**Files:** Modify `pcp.html`, `js/app.js` (agendar medição, agendar instalação, `editarMedicao`, `editarInstalacao`, `_agdFormulario` com um tipo de campo `'endereco'`, `_instGravarEdicao`, detalhes, `salvarPedido` ramo de edição — preservar `inst_cep, inst_rua, inst_numero, inst_complemento, inst_bairro, inst_uf`); Test `tests/e2e/cep-agendamentos.spec.js`.

**Interfaces — Consumes:** Task 2 (`enderecoCamposHtml/Anexar/Ler/Preencher`), Task 1. Prefixos: `med`, `inst`, e um prefixo próprio nas janelas Editar.

- Medição: ao escolher o cliente, preenche as partes do cliente (cliente antigo → `partesDeRegistroAntigo`). Obrigatório: Rua (mesma mensagem de hoje do endereço obrigatório). Grava partes + `endereco`.
- Instalação: ao escolher o pedido, partes = `inst_*` do pedido se `inst_rua !== undefined`; senão, se o pedido tem `inst_endereco` diferente do endereço do cliente → `partesDeRegistroAntigo(inst_endereco, _instCidade(p, cli))`; senão, partes do cliente. Grava `inst_*` + `inst_endereco`.
- Editar medição / Editar instalação: o campo Endereço + Cidade vira o grupo de partes (com CEP e Buscar endereço). Reagendar não tem endereço: não muda.

- [ ] **Step 1: e2e que falha**: agendar medição para cliente com partes → campos vêm preenchidos; trocar o CEP e buscar (mock) → grava as novas partes na medição, cliente não muda; editar a medição → partes aparecem e o Buscar funciona; agendar instalação de pedido de cliente com partes → partes vêm do cliente; editar o pedido (salvarPedido) → `inst_rua`/`inst_cep` continuam; pedido antigo com `inst_endereco` diferente → Rua = esse texto e Cidade não herda a do cliente.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** spec novo + specs de agenda/instalação/lembrete existentes passam.
- [ ] **Step 5:** commit.

### Task 4: Rotas, 📍 Ir e documentação

**Files:** Modify `js/rotas.js` (`_rotaVisitasDoDia`, `_rotaGeo`/`_rotaLocalizar`), `js/app.js` (`_agdEnd`/links 📍 Ir nos cards e detalhes, botão Ir dos formulários), `FUNCIONALIDADES_SCTECH.txt`; Test `tests/e2e/cep-rotas.spec.js`, `tests/rotas-core.test.js` se preciso.

**Interfaces — Consumes:** `RotasCore.enderecoDePartes`, `RotasCore.consultasGeo`.

- Registro com partes: texto da rota e links do Maps = `enderecoDePartes`; geolocalização tenta `consultasGeo` em ordem, a primeira que achar vale; o cache (`sc_geo`) guarda o resultado pela chave do texto completo (não refaz as consultas na próxima vez). Registro antigo: como hoje (`enderecoCompleto(end, cidade)`, uma consulta).
- Botões "📍 Ir para endereço" dos formulários usam as partes digitadas.

- [ ] **Step 1: e2e que falha** (Nominatim/OSRM simulados): rota do dia com medição com partes → a 1ª consulta ao Nominatim leva "Rua XV de Novembro, 100, Centro, Curitiba - PR, 80020-310"; quando ela volta vazia, a 2ª leva "Rua XV de Novembro, 100, Curitiba - PR"; link do Maps contém o texto completo; registro antigo continua com uma consulta só.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar + `FUNCIONALIDADES_SCTECH.txt`.
- [ ] **Step 4:** `npm test` + specs de rotas (`rotas`, `cidade-rotas`, `cep-rotas`) passam.
- [ ] **Step 5:** commit.
