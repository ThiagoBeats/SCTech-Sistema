# Máscara de moeda e maiúscula automática em todo o sistema — design curto + plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Pedido do dono (2026-11-25):** em todo o sistema, todo campo que recebe **valor** tem máscara de moeda brasileira ("R$ 1.250,00") enquanto digita; em todo campo de texto a **primeira letra** fica maiúscula e, **após cada ponto final**, a próxima letra também, sem mudar o resto; vale também para campos futuros; respeitar campos com formato próprio (e-mail, senha, códigos). **Nenhuma mudança de layout.**
**Abordagem escolhida (A):** campos de dinheiro ganham a marca `data-moeda` e todo leitor passa a usar o leitor único; um teste automático impede campo de dinheiro novo sem a marca. Maiúscula por um script global, sem marcar nada.
**Minhas decisões (aprovadas):** maiúscula também após "? " e "! "; percentuais, quantidades, metros, dias e nº de parcelas continuam como estão (sem máscara de moeda).

## Design
- **Núcleo puro `js/mascaras-core.js`** (UMD, global `MascarasCore`):
  - `formatarMoedaDigitos(digitos: string) -> string` — dígitos tratados como centavos: "" → "", "5" → "R$ 0,05", "125000" → "R$ 1.250,00"; zeros à esquerda ignorados; negativo não existe na digitação.
  - `formatarMoeda(n: number|null) -> string` — 1250 → "R$ 1.250,00"; null/'' → ""; −12,5 → "-R$ 12,50".
  - `lerMoeda(texto: string|number) -> number|null` — aceita "R$ 1.250,00", "1.250,00", "1250,5", "1250.50", 1250.5, "" → null; nunca confunde ponto de milhar com decimal ("1.250" → 1250; "1.25" → 1.25 só quando há exatamente 1–2 dígitos após o único ponto e nenhuma vírgula).
  - `capitalizar(texto: string, cursor: number) -> { texto, cursor }` — maiúscula na primeira letra (pula espaços/aspas/parênteses iniciais) e na primeira letra após `.`, `?`, `!` seguidos de espaço(s) ou quebra de linha; não mexe no resto; não mexe em "..." no meio de número ("1.5"), nem em e-mails/URLs dentro do texto (palavra que contém "@" ou "://" ou "www."); cursor preservado.
  - `aceitaMaiuscula(campo: {tag, type, id, name, autocomplete, inputmode, dataset}) -> bool` — `textarea` e `input` type text (ou sem type) sim; **não**: type email/password/url/search/tel/number/date/…; `dataset.semMaiuscula`; `dataset.moeda`; id/name/autocomplete contendo (sem acento/caixa) email, senha, password, url, site, cep, cpf, cnpj, doc, telefone, tel, celular, whats, codigo, cod, sku, chave, linha_digitavel, digitavel, agencia, conta_numero, numero_conta, iban, pix, placa, login, usuario, token, cor (hex), busca, search, filtro.
- **Script global `js/mascaras.js`** (carregado antes de `js/app.js` em todas as páginas, depois de `mascaras-core.js`):
  - Delegação no `document` (`input`, `focusout`, `compositionend`) — vale para campos criados depois, sem registro.
  - `[data-moeda]`: a cada digitação, `formatarMoedaDigitos` com os dígitos do campo, cursor no fim; ao colar texto com vírgula/ponto, usa `lerMoeda` → `formatarMoeda`. Campos `data-moeda` são `type="text" inputmode="decimal"` (a Task 2 converte).
  - Maiúscula: no `input` de campos que `aceitaMaiuscula`, aplica `capitalizar` sem disparar novo `input` e respeitando composição (IME/acentos `´`+`a`).
  - Helpers globais para o código: `lerCampoMoeda(elOuId) -> number|null`, `definirCampoMoeda(elOuId, n)`.
- **Campos de dinheiro (Task 2):** todos os `input` que guardam R$ (custo, preço, valor, desconto, mão de obra, valor recebido, saldo inicial, limites de preço de filtro, valor da despesa fixa/conta/compra/parcela, metas, simulador, etiquetas com preço, importador quando for preço…) passam a `type="text" inputmode="decimal" data-moeda`; quem lê usa `lerCampoMoeda`; quem preenche usa `definirCampoMoeda`. Placeholder "R$ 0,00". Largura/estilo iguais.
- **Teste guarda (Task 2):** `tests/mascaras-lint.test.js` varre `*.html` e `js/*.js` (templates) e falha se achar `<input` com id/name contendo valor, preco, preço, custo, saldo, desconto, mao(_|-)?obra, recebido, limite, meta, total (lista de exceções explícita no teste para os que não são dinheiro, ex.: `ped-entrada-pct`, `est-markup`) sem `data-moeda`.

## Global Constraints
- Vanilla JS sem build; nenhuma mudança de layout (largura, alinhamento, fonte, cor).
- `?v=` de todos os js/css em todas as páginas sobe para `20261210a` — só a Task 1 faz (e adiciona `js/mascaras-core.js` e `js/mascaras.js` antes de `js/app.js` em **todas** as páginas que têm formulário, inclusive login.html e landing se tiverem campo).
- Manter fim de linha (git `core.autocrlf=true`); specs e2e novos em CRLF; relógio fixo; sem rede real.
- Nenhum cálculo pode mudar de resultado: valores gravados continuam números.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` (seção geral).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1: Núcleo, script global e maiúscula
**Files:** Create `js/mascaras-core.js`, `js/mascaras.js`, `tests/mascaras-core.test.js`; Modify todas as páginas (`?v=` + scripts); test `tests/e2e/maiuscula.spec.js`.
- Unit: `formatarMoedaDigitos` ("", "5", "125000", "000125000"); `formatarMoeda` (1250, 0, null, -12.5, 1234567.891 → "R$ 1.234.567,89"); `lerMoeda` ("R$ 1.250,00"→1250, "1.250"→1250, "1250,5"→1250.5, "1250.50"→1250.5, "1.25"→1.25, ""→null, "abc"→null, 99.9→99.9); `capitalizar` ("joão foi. ele voltou" → "João foi. Ele voltou", "olá! tudo bem? sim" → "Olá! Tudo bem? Sim", "  (oi)" → "  (Oi)", "valor 1.5 mil" sem mudança no "5", "ver email joao@x.com. depois" não mexe no e-mail e capitaliza "Depois", cursor preservado); `aceitaMaiuscula` (email/password/tel/number false; id "cli-cep", "cnpj", "cp-linha-digitavel", "conta-numero", "busca-pedidos" false; "cli-nome", "obs" true; data-sem-maiuscula false).
- e2e: em cliente (nome, endereço, observação), pedido (observação), compra e financeiro (descrição): digitar em minúsculas vira com maiúscula inicial e após ". "; e-mail, CEP, CNPJ, telefone, senha (login) e busca ficam como digitados; um campo criado dinamicamente (abrir uma janela nova) também recebe; acento composto (digitar "´" + "a" no início) gera "Á"; layout igual (largura/altura do campo antes = depois).

### Task 2: Campos de dinheiro com máscara em todo o sistema
**Files:** todos os html/js com campos de dinheiro (catálogo, estoque, pedido, compra, financeiro/fin-novo/fin-fluxo/fin-notas, empresa (saldo inicial), fornecedores, vendedores, proposta, etiquetas, importador, simulador), `tests/mascaras-lint.test.js`, `FUNCIONALIDADES_SCTECH.txt`; e2e `tests/e2e/mascara-moeda.spec.js` + ajuste dos specs que digitam valores (passam a digitar "1250,00" ou dígitos).
- Auditoria: listar no relatório cada campo convertido (arquivo, id, leitores trocados) e cada campo numérico **não** convertido com o motivo.
- e2e: em cada tela, digitar "125000" num campo de dinheiro mostra "R$ 1.250,00" e o valor gravado é 1250; editar um registro existente mostra o valor formatado; colar "1.250,50" vira "R$ 1.250,50"; cálculos (total do pedido com desconto e mão de obra, preço de venda pelo markup no estoque, saldo inicial da conta, valor do lançamento, despesa fixa) dão o mesmo número de antes; layout igual (medidas do campo).
