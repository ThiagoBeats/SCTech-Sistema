# Financeiro novo — Entrega 4 (Notas fiscais, modo manual) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notas fiscais ligadas ao pedido: no modo manual, a pessoa confere os dados do pedido, emite a nota fora (prefeitura/SEFAZ/contador) e anexa XML e PDF; o sistema lê o XML, guarda a nota no pedido, mostra, baixa, cancela e lista no financeiro. A "ponte" fiscal (e a bancária) fica pronta para trocar para o servidor Node.js sem mudar telas nem dados.

**Architecture:** Núcleo puro `js/fiscal-core.js` (ler XML de NF-e/NFS-e, montar os dados da nota a partir do pedido, conferir nota × pedido); `js/fiscal.js` (pontes `Fiscal.provedor` e `Banco.provedor`, com `provedorManual` hoje e `provedorServidor` pronto para o futuro); telas em `js/fin-notas.js` (janela "Notas fiscais do pedido" aberta pelo menu ⋮ do pedido, e a lista em Lançamentos › Contas a receber). Dados em `db.notas_fiscais` (`sc_nf`).

**Tech Stack:** Vanilla JS sem build, localStorage, UMD + `node --test` (o núcleo usa um leitor de XML que funciona no navegador e no node — sem `DOMParser` no núcleo, ou com `DOMParser` injetado), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-23-financeiro-novo-design.md` seções 6.5 e 7.5 (ponte bancária no fim de 7.5).

## Global Constraints
- Vanilla JS sem build; textos em português, exatos como na spec quando ela fixa.
- `?v=` de todos os js/css em todas as páginas sobe para `20261208a` — só a Task 2 faz (e adiciona `js/fiscal-core.js` e `js/fiscal.js` antes de `js/app.js` em todas as páginas que carregam app.js, e `js/fin-notas.js` depois de `js/app.js` nas páginas que têm o menu ⋮ do pedido e em financeiro.html).
- Base: branch `feat/financeiro-fluxo` (PR #23 ainda aberto) — esta branch sai dela.
- Manter fim de linha (git `core.autocrlf=true`); specs e2e novos em CRLF; relógio fixo; sem rede real.
- Nota (`sc_nf`): `{ id, pedido_id, tipo: 'nfe'|'nfse', numero, serie, chave|null, codigo_verificacao|null, data_emissao, valor, cliente_id, status: 'rascunho'|'processando'|'autorizada'|'rejeitada'|'cancelada', protocolo|null, eventos: [{ em, tipo, detalhe, por }], xml_nome, xml, pdf_nome, pdf|null, origem: 'manual'|'servidor', criado_em, criado_por }`.
- PDF acima de 1 MB recusado com o texto exato: "Arquivo grande demais para guardar no navegador. Guarde o PDF no computador e anexe só o XML."
- Aviso do modo manual, texto exato: "Emita esta nota no sistema da prefeitura/SEFAZ ou do seu contador e anexe aqui o XML e o PDF."
- Pedido pode ter mais de uma nota.
- Permissão: emitir/anexar/cancelar = `financeiro.receber` completo **ou** `pedidos` completo; ver = quem vê o pedido ou `financeiro.receber`.
- Ponte: `Fiscal.provedor = { nome, emitir(dadosNota) -> Promise<{ status, numero, serie, chave, protocolo, xml, pdf, mensagem }>, consultar(id), cancelar(id, motivo) }`; `Banco.provedor = { nome, contas(), saldos(), movimentos(desde) }`; servidor futuro: `POST /api/fiscal/emitir`, `GET /api/fiscal/:id`, `POST /api/fiscal/:id/cancelar`, `GET /api/banco/contas|saldos|movimentos?desde=`.
- Tema claro e escuro; 390px sem rolagem horizontal da página.
- Atualizar `FUNCIONALIDADES_SCTECH.txt`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
- XML de NFS-e de prefeituras diferentes (padrão nacional `NFSe/infNFSe`, ABRASF `CompNfse/Nfse/InfNfse`, com e sem namespace e com prefixos `ns2:`) → lê número, data, valor, tomador. (Task 1)
- XML que não é nota (ou é de compra, emitente = cliente) → mensagem clara, nada é gravado. (Task 1 e 2)
- Mesmo XML anexado duas vezes (mesma chave/número+código) → aviso "Esta nota já está anexada ao pedido #N." e não duplica. (Task 2)
- Valor da nota diferente do pedido, ou CPF/CNPJ do tomador diferente do cliente → avisa, deixa salvar, e o aviso fica no histórico da nota. (Task 1 e 2)
- Navegador sem espaço ao guardar XML+PDF → mensagem de espaço cheio, nada gravado pela metade. (Task 2)

---

### Task 1: Núcleo fiscal e pontes

**Files:** Create `js/fiscal-core.js` (UMD, global `FiscalCore`), `js/fiscal.js` (navegador, globais `Fiscal`, `Banco`); Test `tests/fiscal-core.test.js` + fixtures `tests/fixtures/nfe-venda.xml`, `tests/fixtures/nfse-nacional.xml`, `tests/fixtures/nfse-abrasf.xml` (dados inventados).

**Interfaces — Produces:**
- `FiscalCore.lerXmlNota(texto) -> { ok: true, nota: { tipo, numero, serie, chave, codigo_verificacao, data_emissao: 'AAAA-MM-DD', valor, emitente_doc, tomador_doc, tomador_nome, cancelada: bool } } | { ok: false, motivo: 'nao_e_nota'|'xml_invalido' }` — NF-e (`nfeProc`/`NFe/infNFe`: `ide/nNF`, `ide/serie`, `Id` sem "NFe", `ide/dhEmi`, `total/ICMSTot/vNF`, `emit/CNPJ`, `dest/CNPJ|CPF`, `dest/xNome`; evento de cancelamento `procEventoNFe` com `tpEvento` 110111 → `cancelada:true`); NFS-e nacional (`NFSe/infNFSe`: `nNFSe`, `dhProc`/`DPS/infDPS/dhEmi`, `valores/vLiq` ou `DPS/.../vServ`, `emit/CNPJ`, `toma/CNPJ|CPF`, `toma/xNome`, chave = `Id` sem "NFS"); ABRASF (`CompNfse/Nfse/InfNfse`: `Numero`, `CodigoVerificacao`, `DataEmissao`, `ValoresNfse/ValorLiquidoNfse` ou `Servico/Valores/ValorServicos`, `PrestadorServico/IdentificacaoPrestador/Cnpj` ou `Prestador/CpfCnpj/Cnpj`, `TomadorServico/IdentificacaoTomador/CpfCnpj/(Cnpj|Cpf)`, `TomadorServico/RazaoSocial`; `NfseCancelamento` presente → `cancelada:true`). Ignora namespaces e prefixos. Implementação com um leitor de tags próprio (sem `DOMParser`), para rodar no node.
- `FiscalCore.dadosNotaDoPedido({ pedido, cliente, empresa, tipo }) -> { tipo, tomador: { nome, doc, endereco, cidade, uf, cep, email }, itens: [{ descricao, quantidade, valor_unitario, valor_total }], valor_total, observacoes }` — itens do pedido (descrição do ambiente/produto e quantidade); NFS-e: um item "Serviço de instalação — Pedido #N" quando o tipo é nfse e o pedido tem instalação; valor_total = valor do pedido.
- `FiscalCore.conferir(nota, { pedido, cliente, empresa, notasDoPedido }) -> [string]` — avisos exatos: "O valor da nota (R$ X) é diferente do valor do pedido (R$ Y)." (só quando a soma das notas autorizadas do pedido passa do valor do pedido, ou a nota sozinha é diferente e é a única); "O CPF/CNPJ do tomador (D) não é o do cliente (C)."; "O emitente da nota (E) não é a empresa (CNPJ C)."; "A nota já está cancelada."
- `FiscalCore.tipoPadrao(empresa) -> 'nfe'|'nfse'` — `empresa.nota_tipo_padrao` se houver; senão 'nfse'.
- `js/fiscal.js`: `Fiscal.provedorManual` (emitir → `Promise.resolve({ status: 'manual', mensagem: <aviso do modo manual> })`; consultar/cancelar → registram só localmente), `Fiscal.provedorServidor(baseUrl)` (fetch nas rotas da Global Constraints, timeout 30 s, erros em `{ status:'erro', mensagem }`), `Fiscal.provedor` = manual; `Banco.provedorManual` (contas/saldos a partir de `db`, movimentos = extrato importado), `Banco.provedorServidor(baseUrl)`, `Banco.provedor` = manual. `provedorServidor` não é usado por nenhuma tela agora.

- [ ] **Step 1: Testes (falhando)** `tests/fiscal-core.test.js`: lerXmlNota dos 3 fixtures (número, série/código, data, valor 3.450,00, tomador CPF, emitente CNPJ); com prefixo `ns2:` igual; XML de evento de cancelamento → `cancelada:true`; texto "<html>" → `nao_e_nota`; XML quebrado → `xml_invalido`; dadosNotaDoPedido com 2 itens → itens e total; NFS-e com instalação → item de serviço; conferir: valor diferente → aviso exato; tomador diferente → aviso; emitente diferente → aviso; duas notas (produto 2.000 + serviço 1.450) num pedido de 3.450 → sem aviso de valor; tipoPadrao.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(fin): nucleo fiscal (XML de NF-e e NFS-e, dados do pedido, conferencia) e pontes fiscal e bancaria`.

### Task 2: Notas fiscais no pedido

**Files:** Create `js/fin-notas.js`; Modify `js/app.js` (chave `sc_nf` em `db` / `_DB_CHAVE_CAMPO` / entre abas / backup; item "🧾 Notas fiscais" nos menus ⋮ do pedido — `abrirMenuAcoesPedido` ~4433 e o do Kanban ~8061 — para pedido fora de Orçamento; Empresa: campo "Tipo de nota mais usado" `nota_tipo_padrao` NF-e/NFS-e em Configurar Empresa), `empresa.html`, páginas (`?v=20261208a` + scripts), `css/style.css`, `FUNCIONALIDADES_SCTECH.txt`; Test `tests/e2e/notas-pedido.spec.js`.

**Interfaces — Consumes:** Task 1 (`FiscalCore.*`, `Fiscal.provedor`). **Produces:** `abrirNotasDoPedido(pedidoId)`, `emitirNotaPedido(pedidoId)`, `anexarArquivosNota(notaId)`, `verPdfNota(notaId)`, `baixarXmlNota(notaId)`, `cancelarNota(notaId)`, `abrirHistoricoNota(notaId)`.
- Janela "Notas fiscais — Pedido #N": lista das notas (tipo, número/série, data, valor, status com selo; Ver PDF, Baixar XML, Histórico, Cancelar nota) e botão **Emitir nota**.
- **Emitir nota** (modo manual): tipo (NF-e para produto / NFS-e para serviço; padrão `tipoPadrao`), dados conferidos e editáveis (tomador: nome, CPF/CNPJ, endereço, cidade, UF, CEP, e-mail; itens com quantidade e valor; total), o aviso exato do modo manual, botões **Copiar dados** (texto para colar no sistema da prefeitura) e **Imprimir dados**, campos **Anexar XML** (obrigatório para salvar) e **Anexar PDF** (opcional, ≤ 1 MB). Ao anexar o XML: `lerXmlNota` preenche número, série/código, data, valor; `conferir` mostra os avisos (amarelo) e deixa salvar; `nao_e_nota`/`xml_invalido` → "Este arquivo não é o XML de uma nota fiscal." e não deixa salvar; mesma chave (ou mesmo número + código/série + emitente) já em outra nota → "Esta nota já está anexada ao pedido #N." e não salva. Salva com status "autorizada" (ou "cancelada" se o XML for de cancelamento), origem "manual", evento "Nota anexada" (+ avisos da conferência como eventos).
- **Ver PDF** abre o PDF guardado em nova aba (ou "PDF não anexado." com botão Anexar PDF); **Baixar XML** baixa o arquivo com o nome original; **Cancelar nota**: motivo obrigatório e, opcional, XML do evento de cancelamento; status "cancelada" + evento; nota cancelada não some (fica com selo).
- Gravação com `_gravarChaves(['sc_nf'])`; falta de espaço → mensagem de espaço cheio do sistema e nada gravado.
- e2e: pedido aprovado → menu ⋮ mostra "Notas fiscais"; Orçamento não; Emitir nota mostra tomador/itens do pedido e o aviso exato; anexar `nfse-abrasf.xml` preenche número e data; valor diferente mostra o aviso e salva; XML qualquer → mensagem e não salva; mesmo XML em outro pedido → "Esta nota já está anexada ao pedido #N."; PDF de 1,2 MB → texto exato; PDF pequeno → Ver PDF abre (interceptar `window.open`); Baixar XML (evento de download); Cancelar exige motivo e muda o selo; duas notas no mesmo pedido; Configurar Empresa grava o tipo padrão; usuário sem permissão não vê Emitir; backup leva `sc_nf`; 390px e tema escuro.

- [ ] **Step 1:** e2e (falhando) como acima.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** spec novo + `pedidos-*`, `kanban*`, `fin-novo-*` passam; `npm test` passa.
- [ ] **Step 5:** Commit `feat(fin): notas fiscais no pedido (modo manual: conferir, anexar XML/PDF, ver, baixar, cancelar)`.

### Task 3: Consulta de notas no financeiro

**Files:** Modify `js/fin-notas.js`, `js/fin-novo.js` (link **Notas fiscais** em Lançamentos › Contas a receber; e, na linha de uma conta a receber de pedido com nota, um selo "NF nº X"), `css/style.css`, `FUNCIONALIDADES_SCTECH.txt`; Test `tests/e2e/notas-financeiro.spec.js`.

**Interfaces — Consumes:** Task 2. **Produces:** `abrirListaNotas()`.
- Lista "Notas fiscais": Número, Tipo, Cliente, Pedido, Data, Valor, Status; filtros período (data de emissão, padrão mês atual), status, tipo, busca (número/cliente); total das autorizadas no período; clicar abre a janela do pedido (Task 2); Excel pelo helper existente.
- e2e: 3 notas (2 autorizadas, 1 cancelada) em pedidos diferentes → lista com filtros, total só das autorizadas; clicar abre a janela do pedido certo; selo "NF nº X" na linha da conta a receber do pedido; usuário Vendedor (receber visualizar) vê a lista mas não Cancelar; Excel (stub XLSX).

- [ ] **Step 1:** e2e (falhando).
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** spec novo + `notas-pedido` + `fin-novo-*` passam.
- [ ] **Step 5:** Commit `feat(fin): consulta de notas fiscais no financeiro`.
