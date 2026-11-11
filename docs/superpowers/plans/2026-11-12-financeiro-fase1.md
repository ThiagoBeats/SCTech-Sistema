# Financeiro Fase 1 — Meu dinheiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono enxerga onde está o dinheiro (contas), quanto entra e sai (extrato, cartão com taxa e datas) e se vai faltar (previsão 8 semanas), e resolve o dia na tela "Hoje" (receber, cobrar no WhatsApp, pagar).

**Architecture:** Novo módulo puro `js/caixa-core.js` (namespace `CaixaCore`, `node --test`) com saldos, repasses de cartão, divisão de parcela, previsão, tarefas do dia e link do WhatsApp. `js/app.js` guarda as coleções novas em `db`, gera/remove movimentos nas baixas e estornos, e desenha as telas. Movimentos são **guardados** (coleção própria), sempre criados/removidos junto da baixa/estorno que os origina.

**Tech Stack:** HTML/CSS/JS puro, `localStorage` (`db.*` + `syncDB()`), Chart.js 4.4.0 (já carregado em financeiro.html), `node --test`, Playwright fora do repo (`tests/e2e/README.md`).

**Spec:** `Docs/superpowers/specs/2026-11-12-financeiro-fase1-design.md` (base: Fase 0 já implementada na mesma branch).

## Global Constraints

- Sem dependências novas, sem backend.
- Datas `'YYYY-MM-DD'` locais: usar `hojeLocal()`/`dataLocal(ms)` (app.js ~11399) e `CaixaCore.somarDias`/`FinanceiroCore.somarDias`; nunca `toISOString()` para data.
- Dinheiro em centavos via `FinanceiroCore.arredondar`; a soma das partes é **exatamente** o total (a última parte absorve o arredondamento).
- Ids: contador iniciado em `Date.now()` + `Set` dos ids já usados na coleção (padrão de `gerarComissoesPedido`).
- Coleções novas em `db`, gravadas em `syncDB()` e incluídas em `_dadosExportacao`/`importarDados` (~7227/7252):
  - `db.contas_fin` → `sc_contas_fin`: `{ id, nome, tipo: 'caixa'|'banco'|'maquininha', saldo_inicial: number, data_saldo_inicial: 'YYYY-MM-DD', ativo: true, cartao?: { debito_taxa, debito_dias, credito_taxa, credito_dias, parcelado_taxa, antecipacao_taxa, antecipacao_dias } }` (`cartao` só em `tipo:'maquininha'`; padrões 1.5/1, 3/30, 4, 2/1).
  - `db.meios_pag` → `sc_meios_pag`: `{ id, nome, tipo: 'dinheiro'|'pix'|'transferencia'|'boleto'|'cartao_debito'|'cartao_credito'|'outro', conta_id: number|null }` (cartão: `conta_id` é a conta maquininha).
  - `db.movimentos_fin` → `sc_mov_fin`: `{ id, conta_id, data, sentido: 'entrada'|'saida', valor (>0), origem: 'cr'|'cp'|'transferencia', origem_id, grupo_id|null, descricao }`.
- Campos novos: CR `meio_previsto: { meio_id, vezes, antecipar }|null`, `meio_id`, `conta_id`, `cartao: { tipo:'debito'|'credito', vezes, antecipar }|null`, `ultima_cobranca`, `parcela_origem_id`; CP `meio_id`, `conta_id`, `origem_cr_id` (taxa); pedido `meio_entrada`, `meio_saldo` (mesmo formato de `meio_previsto`); empresa `mensagem_cobranca`.
- Categoria nova de CP: `'taxa_cartao'`.
- `js/caixa-core.js` incluído antes de `js/app.js` em **todas** as páginas que incluem `app.js`; cache-busting de todos os `<script src="js/...">` sobe para `?v=20261112a`.
- Permissões: novas sub-abas `financeiro.hoje` ("Hoje") e `financeiro.extrato` ("Extrato") em `MODULOS_PERMISSAO` (app.js ~39) e `FIN_TAB_MODULO` (~950). Botões Recebi/Cobrar: `financeiro.receber` completo; Paguei: `financeiro.pagar` completo; saldos/previsão/Extrato: `financeiro.extrato` visualizar; transferência: `financeiro.extrato` completo; configurar contas/meios/mensagem: mesma permissão da aba Preferências de Empresa.
- Todo texto de usuário com `escapeHtml`; nenhum `prompt()`; modais no padrão `.sc-modal-overlay`/`.sc-modal-box`; mensagens de validação dentro do modal (não `showAlert` por cima).
- Textos de tela em português simples.
- Testes unitários em `tests/caixa-core.test.js`; e2e em `tests/e2e/financeiro-fase1-*.spec.js`.
- Pendências achadas e não corrigidas vão para `Docs/superpowers/pendencias-financeiro.md`, seção "Da Fase 1".

## Review Focus

1. **Cartão 3x de R$ 100,00 a 4%**: os três repasses somam 100,00 bruto e 4,00 de taxa exatos; nenhum entra no saldo de hoje (Task 1).
2. **Baixa com data anterior ao saldo inicial** ou meio sem conta: registra a baixa, não gera movimento, avisa no modal (Task 1 + Task 4).
3. **Parcial e estorno**: pagar 1.000 de 3.000 e estornar → volta uma parcela de 3.000 em aberto (Task 1 + Task 4).
4. **Estorno de baixa no cartão com repasse já caído**: saldo de hoje diminui; confirmação avisa (Task 4).
5. **Telefone em formatos variados** ("(11) 98765-4321", "+55 11 98765-4321", "", "1234"): link certo ou aviso (Task 2 + Task 7).

---

### Task 1: `CaixaCore` — saldos, cartão e divisão de parcela

**Files:**
- Create: `js/caixa-core.js` (padrão IIFE de `js/financeiro-core.js`; exporta `module.exports` e `window.CaixaCore`; pode `require`/usar `FinanceiroCore` só para `arredondar`/`somarDias` — se for mais simples, reimplementar os dois localmente)
- Test: `tests/caixa-core.test.js`

**Interfaces — Produces:**
- `contaAceitaMovimento(conta, data) -> boolean` — conta existe, `ativo !== false` e `data >= conta.data_saldo_inicial`.
- `saldoConta(conta, movimentos, ateData) -> number` — `saldo_inicial` + entradas − saídas da conta com `data_saldo_inicial <= data <= ateData`.
- `saldosHoje(contas, movimentos, hoje) -> { contas: Array<{ id, nome, tipo, saldo, a_cair }>, total }` — `a_cair` = entradas − saídas da conta com `data > hoje`; `total` = soma dos `saldo` (sem `a_cair`).
- `repassesCartao({ valor, data, conta, tipo: 'debito'|'credito', vezes = 1, antecipar = false }) -> Array<{ data, bruto, taxa, liquido }>`.
- `dividirParcela(cr, valorPago) -> { pago: number, resto: number }` — `resto = arredondar(cr.valor − valorPago)`; erro (`throw`) se `valorPago <= 0` ou `> cr.valor`.

- [ ] **Step 1: Write the failing tests**

```js
const C = require('../js/caixa-core.js');
const maq = { id: 3, tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', cartao: { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 } };
test('contaAceitaMovimento respeita data do saldo inicial e conta inexistente', () => {
    assert.strictEqual(C.contaAceitaMovimento(maq, '2026-11-01'), true);
    assert.strictEqual(C.contaAceitaMovimento(maq, '2026-10-31'), false);
    assert.strictEqual(C.contaAceitaMovimento(null, '2026-11-12'), false);
});
test('saldoConta e saldosHoje: futuro fica em a_cair', () => {
    const banco = { id: 1, nome: 'Banco', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-11-01' };
    const mov = [
        { conta_id: 1, data: '2026-10-30', sentido: 'entrada', valor: 999 },   // antes do saldo inicial: ignora
        { conta_id: 1, data: '2026-11-05', sentido: 'entrada', valor: 500 },
        { conta_id: 1, data: '2026-11-06', sentido: 'saida', valor: 200 },
        { conta_id: 3, data: '2026-12-12', sentido: 'entrada', valor: 100 },
        { conta_id: 3, data: '2026-12-12', sentido: 'saida', valor: 3 }];
    assert.strictEqual(C.saldoConta(banco, mov, '2026-11-12'), 1300);
    const s = C.saldosHoje([banco, maq], mov, '2026-11-12');
    assert.strictEqual(s.total, 1300);
    assert.strictEqual(s.contas.find(c => c.id === 3).a_cair, 97);
});
test('repassesCartao: debito, credito a vista, parcelado e antecipado', () => {
    assert.deepStrictEqual(C.repassesCartao({ valor: 200, data: '2026-11-12', conta: maq, tipo: 'debito' }),
        [{ data: '2026-11-13', bruto: 200, taxa: 3, liquido: 197 }]);
    assert.deepStrictEqual(C.repassesCartao({ valor: 100, data: '2026-11-12', conta: maq, tipo: 'credito', vezes: 1 }),
        [{ data: '2026-12-12', bruto: 100, taxa: 3, liquido: 97 }]);
    const p = C.repassesCartao({ valor: 100, data: '2026-11-12', conta: maq, tipo: 'credito', vezes: 3 });
    assert.deepStrictEqual(p.map(x => x.data), ['2026-12-12', '2027-01-11', '2027-02-10']);
    assert.strictEqual(FinanceiroCore.arredondar(p.reduce((s, x) => s + x.bruto, 0)), 100);
    assert.strictEqual(FinanceiroCore.arredondar(p.reduce((s, x) => s + x.taxa, 0)), 4);
    const a = C.repassesCartao({ valor: 100, data: '2026-11-12', conta: maq, tipo: 'credito', vezes: 3, antecipar: true });
    assert.deepStrictEqual(a, [{ data: '2026-11-13', bruto: 100, taxa: 6, liquido: 94 }]);
});
test('dividirParcela', () => {
    assert.deepStrictEqual(C.dividirParcela({ valor: 3000 }, 1000), { pago: 1000, resto: 2000 });
    assert.deepStrictEqual(C.dividirParcela({ valor: 3000 }, 3000), { pago: 3000, resto: 0 });
    assert.throws(() => C.dividirParcela({ valor: 3000 }, 3001));
    assert.throws(() => C.dividirParcela({ valor: 3000 }, 0));
});
```
(`FinanceiroCore = require('../js/financeiro-core.js')` no topo do teste.)

- [ ] **Step 2: Run** `node --test tests/caixa-core.test.js` → FAIL (`Cannot find module`).
- [ ] **Step 3: Implement** `js/caixa-core.js`. Regras do cartão: débito → 1 repasse em `data + debito_dias`, taxa `debito_taxa`; crédito 1x → `data + credito_dias`, taxa `credito_taxa`; crédito N≥2 → N repasses em `data + 30*i` (i=1..N), taxa total `parcelado_taxa` sobre o valor, bruto e taxa divididos em N com a última parte absorvendo o arredondamento; `antecipar` (só crédito) → 1 repasse em `data + antecipacao_dias`, taxa = (taxa do crédito correspondente: `credito_taxa` se 1x, `parcelado_taxa` se N≥2) + `antecipacao_taxa`. `liquido = bruto − taxa`.
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): nucleo de saldos, cartao e divisao de parcela`

---

### Task 2: `CaixaCore` — previsão, tarefas do dia e WhatsApp

**Files:** Modify `js/caixa-core.js`; Test `tests/caixa-core.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `previsaoSemanal({ hoje, saldoHoje, movimentos, contasReceber, contasPagar, despesasFixas, contas, meios, semanas = 8 }) -> Array<{ inicio, fim, entradas, saidas, saldo_final, inclui_atrasados: boolean }>` — semana 1 = `hoje..hoje+6`.
  - `primeiraSemanaNegativa(semanas) -> { inicio, falta }|null` (`falta` positivo).
  - `tarefasHoje({ hoje, contasReceber, contasPagar, movimentos }) -> { receberAtrasados, receberHoje, pagarAtrasados, pagarProximos, cartaoHoje }`.
  - `normalizarTelefone(tel) -> string|null` — só dígitos; 10/11 dígitos → prefixa `55`; 12/13 começando com `55` → mantém; outro → `null`.
  - `montarMensagem(template, dados) -> string` — substitui `{cliente}`, `{empresa}`, `{valor}`, `{pedido}`, `{vencimento}`.
  - `linkWhatsApp(telefone, mensagem) -> string|null` — `https://wa.me/<tel>?text=<encodeURIComponent(msg)>`.
  - `MENSAGEM_COBRANCA_PADRAO` (texto exato da spec §7).

- [ ] **Step 1: Write the failing tests**
  - `'previsao: saldo inicial, receber, pagar e cartao a cair por semana'`: hoje `2026-11-12`, saldoHoje 1000; CR aberta 500 vence `2026-11-14` (sem meio) → semana 1 entradas 500; CP aberta 2000 vence `2026-11-20` → semana 2 saídas 2000, `saldo_final` −500; movimento futuro entrada 97 em `2026-12-12` (conta maquininha) → entra na semana que contém essa data.
  - `'previsao: CR com meio cartao 3x espalha liquido'`: CR 300 vence `2026-11-12` com `meio_previsto {meio_id: 9, vezes: 3, antecipar: false}` e meio 9 = cartão de crédito da maquininha (4%) → entrada de 96 na semana que contém `2026-12-12`; os repasses de `2027-01-11` e `2027-02-10` ficam fora das 8 semanas (`2026-11-12`..`2027-01-06`) e não aparecem.
  - `'previsao: atrasados entram na semana 1 com inclui_atrasados'`: CR 200 venceu `2026-11-01` → semana 1 entradas inclui 200 e `inclui_atrasados === true`.
  - `'previsao: despesa fixa ativa sem lancamento do mes entra no dia de vencimento'`: DF `{ valor: 800, dia_vencimento: 15, ativo: true }` sem CP do mês → saída 800 em `2026-11-15`; com CP de mesma descrição/valor já gerado no mês → não duplica.
  - `'primeiraSemanaNegativa'` → `{ inicio: '2026-11-19', falta: 500 }` no primeiro cenário; `null` quando nunca negativa.
  - `'tarefasHoje separa por urgencia'`: CR atrasada, CR vence hoje, CR futura (fora), CP atrasada, CP em 5 dias (dentro), CP em 9 dias (fora), movimento entrada da maquininha com data = hoje (cartaoHoje).
  - `'normalizarTelefone'`: `'(11) 98765-4321'` → `'5511987654321'`; `'+55 11 98765-4321'` → `'5511987654321'`; `'1133334444'` → `'551133334444'`; `''` → `null`; `'1234'` → `null`.
  - `'montarMensagem e linkWhatsApp'`: template padrão com `{cliente:'Maria', empresa:'SC', valor:'R$ 2.000,00', pedido:'#26015', vencimento:'10/11/2026'}` → contém `'Olá, Maria!'` e `'#26015'`; link começa com `https://wa.me/5511987654321?text=Ol%C3%A1`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Despesa fixa "já gerada no mês" = existe CP com `tipo:'fixo'`, mesma `descricao` e `data_vencimento` no mesmo mês. CR/CP com status `'Pago'` não entram. Para CR com cartão previsto, usar `repassesCartao` com `data = max(data_vencimento, hoje)` e somar `liquido`.
- [ ] **Step 4: Run** → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): previsao semanal, tarefas do dia e link do WhatsApp`

---

### Task 3: Contas, meios e maquininhas — dados e configuração

**Files:**
- Modify: `js/app.js` — `db` (~239), `syncDB` (~325), `_dadosExportacao`/`importarDados` (~7227/7252), `MODULOS_PERMISSAO` (~39), `FIN_TAB_MODULO` (~950); novas funções de config.
- Modify: `empresa.html` (aba Preferências: cards "🏦 Contas", "💳 Meios de pagamento", "💬 Mensagem de cobrança"; o card de "Formas de Pagamento" passa a se chamar "📋 Planos de pagamento", textos ajustados — mesma chave `sc_formas_pag`), todas as `*.html` com `app.js` (incluir `js/caixa-core.js?v=20261112a`, subir `?v=`).
- Test: `tests/e2e/financeiro-fase1-config.spec.js`

**Interfaces — Produces (app.js):**
- `getContasFin() -> Array`, `getMeiosPag() -> Array` (lêem `db`), `contaDoMeio(meioId) -> conta|null`.
- `garantirMeiosPadrao() -> void` — se `db.meios_pag` vazio, cria os 6 meios padrão (Dinheiro→1ª conta caixa; PIX, Transferência, Boleto→1ª conta banco; Cartão de débito, Cartão de crédito→1ª maquininha; `conta_id: null` se a conta não existir). Chamado ao salvar contas.
- Telas: lista de contas (nome, tipo, saldo inicial, data do saldo inicial; maquininha mostra as 7 taxas/dias com os padrões), lista de meios (nome, tipo, conta), textarea da mensagem (padrão `CaixaCore.MENSAGEM_COBRANCA_PADRAO`, salvo em `sc_empresa.mensagem_cobranca` via merge).

- [ ] **Step 1: Write the failing e2e**
  - `'cadastrar Caixa, Banco e Maquininha cria meios padrao ligados'`: salvar 3 contas → `sc_contas_fin` com 3 itens (maquininha com `cartao.parcelado_taxa === 4`), `sc_meios_pag` com 6 meios e PIX → id do Banco.
  - `'mudar a conta de um meio grava'`.
  - `'mensagem de cobranca salva sem apagar outros campos da empresa'`.
  - `'card se chama Planos de pagamento e mantem os dados'`: `sc_formas_pag` existente aparece igual.
  - `'exportar e importar levam contas, meios e movimentos'`.
  - `'permissoes Hoje e Extrato aparecem em Configuracoes > Acessos'`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `empresa-abas`, `forma-de-pagamento`, `financeiro-bloqueio-menu` → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): contas, meios de pagamento e maquininhas`

---

### Task 4: Baixa de recebimento com meio, conta, cartão e parcial + estorno

**Files:** Modify `js/app.js` — `abrirModalBaixa` (~11727), `baixarContasReceber` (~11770), `estornarCR` (~11843), `confirmarPagamentoPedido` (~2966, chamada do modal), `marcarCRPago` (~11828); Test `tests/e2e/financeiro-fase1-baixa.spec.js`

**Interfaces:**
- Consumes: `CaixaCore.contaAceitaMovimento`, `repassesCartao`, `dividirParcela`; `getMeiosPag`, `contaDoMeio` (Task 3).
- Produces:
  - `abrirModalBaixa({ titulo, itens: Array<{ id, descricao, valor, marcado, meio_previsto? }>, comData = true, permiteParcial = false, permiteCartao = true }) -> Promise<{ data, linhas: Array<{ id, valor, meio_id, conta_id, cartao: { tipo, vezes, antecipar }|null }> } | null>` — **uma linha por parcela**: checkbox, valor (editável para menos se `permiteParcial`), select de meio (pré-selecionado por `meio_previsto.meio_id`), select de conta (pré-selecionado pela conta do meio), e para meio `cartao_credito` campos "vezes" (1–12) e "antecipar". Aviso inline por linha quando `!contaAceitaMovimento(conta, data)`: "Esta conta ainda não está configurada / data anterior ao saldo inicial — não entra no saldo". Validação inline (valor > 0 e ≤ parcela).
  - `baixarContasReceber(data, linhas) -> void` (nova assinatura; atualizar todos os chamadores) — por linha: se `valor < cr.valor`, divide (`cr.valor = resto`, cria CR nova paga com `valor`, `parcela_origem_id = cr.id`, mesmos pedido/descrição/vencimento/parcela_tipo/meio_previsto); grava `meio_id`, `conta_id`, `cartao`, `forma_pagamento = nome do meio`; gera movimentos se a conta aceita: não-cartão → 1 entrada `origem:'cr'`; cartão → por repasse 1 entrada bruta `origem:'cr'` + 1 CP `taxa_cartao` paga (`data_pagamento` = data do repasse, `conta_id` da maquininha, `origem_cr_id`) com sua saída `origem:'cp'`; todos com o mesmo `grupo_id`.
  - `removerMovimentosDaBaixaCR(crId) -> { removidos, caidos }` — remove movimentos `origem:'cr'` do CR, as CPs `taxa_cartao` com `origem_cr_id` e os movimentos delas; `caidos` = repasses com data ≤ hoje.
  - `estornarCR(id)`: antes de confirmar, se houver repasse já caído, texto extra "Isso muda o saldo de hoje da conta <nome>."; remove movimentos/taxas; se `parcela_origem_id` e a parcela de origem ainda está aberta, soma o valor de volta nela e remove esta CR; senão volta a ficar aberta (regras da Fase 0).

- [ ] **Step 1: Write the failing e2e** (seed com contas Caixa/Banco/Maquininha `data_saldo_inicial: '2026-11-01'` e meios padrão)
  - `'PIX gera entrada no Banco'`.
  - `'cartao credito 3x gera 3 entradas e 3 taxas pagas, nada no saldo de hoje'`.
  - `'entrada PIX e saldo cartao na mesma baixa, cada linha com seu meio'` (confirmar pagamento do pedido).
  - `'parcial: paga 1000 de 3000 deixa parcela de 2000 aberta com mesmo vencimento'`.
  - `'estorno da parcial junta de volta 3000'`.
  - `'data anterior ao saldo inicial avisa e nao gera movimento'`.
  - `'estorno de cartao com repasse caido avisa e remove tudo'` (seed de repasse com data ≤ hoje).
  - `'valor maior que a parcela mostra erro dentro do modal'`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `financeiro-fase0-recebimento`, `financeiro-fase0-entrada`, `financeiro-bloqueio-menu` → PASS (ajustar só seletores do modal novo); `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): baixa por parcela com meio, conta, cartao e valor parcial`

---

### Task 5: Pagamentos (A Pagar e comissões) com meio e conta + estorno de pagamento

**Files:** Modify `js/app.js` — `baixarContasPagar` (~11807), `marcarCPPago` (~12017), `_baixarComissoes` (~7708), render do A Pagar e do Histórico de comissões; Test `tests/e2e/financeiro-fase1-pagar.spec.js`

**Interfaces:**
- Consumes: `abrirModalBaixa` com `permiteCartao: false`, `permiteParcial: false` (Task 4).
- Produces:
  - `baixarContasPagar(data, linhas) -> void` (nova assinatura; atualizar chamadores) — grava `meio_id`, `conta_id`, `forma_pagamento`; gera 1 saída `origem:'cp'` se a conta aceita; mantém a regra dos flags de comissão da Fase 0.
  - `estornarCP(id) -> Promise<void>` — exige `financeiro.pagar` completo; recusa `categoria === 'taxa_cartao'` ("sai pelo estorno do recebimento"); volta para Pendente/Atrasado, limpa campos de baixa, grava `estornado_por/estornado_em`, remove o movimento; se `papel_comissao`, desmarca `ped[c.paga]`/`ped[c.data]`.
  - Botão "↩ Estornar" nas CPs pagas (A Pagar) e no Histórico de comissões.
- [ ] **Step 1: Write the failing e2e**: `'pagar conta no PIX gera saida no Banco'`; `'modal de pagar nao oferece cartao'`; `'pagar comissao gera saida e estornar devolve a pendente'`; `'taxa de cartao nao tem estornar'`; `'pagar varias comissoes de uma vez, mesma data e meio'`.
- [ ] **Step 2–4**: RED → implement → GREEN; `financeiro-fase0-comissoes`, `financeiro-fase0-compra`, `vendedores-arquitetos` → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): pagamentos com meio e conta, e estorno de pagamento`

---

### Task 6: Pedido — plano e meio previsto

**Files:** Modify `pedido.html` (seção "4. Forma de Pagamento": label do select vira "Plano"; novos selects `ped-meio-entrada`, `ped-meio-saldo` com, para cartão de crédito, `vezes` e `antecipar`; com plano 100% esconde o do saldo), `js/app.js` — `salvarPedido` (~6146), `carregarPedidoParaEdicao` (~6334), `gerarFinanceiroPedido` (~11654); Test `tests/e2e/financeiro-fase1-pedido.spec.js`

**Interfaces:** Produces `ped.meio_entrada`, `ped.meio_saldo` (`{ meio_id, vezes, antecipar }|null`); CRs geradas com `meio_previsto` = meio_entrada (entrada/única) ou meio_saldo (saldo).
- [ ] **Step 1: Write the failing e2e**: `'pedido guarda meio da entrada e do saldo'`; `'aprovar copia meio previsto para as parcelas'`; `'plano 100% so pede um meio'`; `'confirmar pagamento ja vem com o meio previsto de cada parcela'`; `'pedido antigo sem meio continua abrindo e aprovando'`.
- [ ] **Step 2–4**: RED → implement → GREEN; `forma-de-pagamento`, `financeiro-fase0-entrada` → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): plano e meio previsto no pedido`

---

### Task 7: Cobrança pelo WhatsApp

**Files:** Modify `js/app.js` — render do A Receber (~13473) e nova função; Test `tests/e2e/financeiro-fase1-whatsapp.spec.js`

**Interfaces:**
- Consumes: `CaixaCore.normalizarTelefone`, `montarMensagem`, `linkWhatsApp`, `MENSAGEM_COBRANCA_PADRAO`.
- Produces: `cobrarNoWhatsApp(crId) -> void` — exige `financeiro.receber` completo; telefone de `db.clientes` (pelo `clienteId` do pedido, senão por nome); sem telefone válido → `showAlert('Cliente sem telefone no cadastro.')`; abre `window.open(link, '_blank')`; grava `cr.ultima_cobranca = hojeLocal()`. Botão "💬 Cobrar" em CR atrasada ou que vence hoje; se `ultima_cobranca === hoje`, mostra "cobrado hoje" ao lado (o botão continua).
- [ ] **Step 1: Write the failing e2e** (stub de `window.open`): `'cobrar abre wa.me com telefone e mensagem'`; `'usa a mensagem da empresa'`; `'sem telefone avisa e nao abre'`; `'marca cobrado hoje'`; `'botao so em atrasada ou vence hoje'`.
- [ ] **Step 2–4**: RED → implement → GREEN; `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): cobranca pelo WhatsApp`

---

### Task 8: Tela "Hoje"

**Files:** Modify `financeiro.html` (nova primeira aba `data-tab="hoje"` "☀️ Hoje", painel `#fin-hoje` com `#hoje-tarefas`, `#hoje-saldos`, `#hoje-previsao` + canvas), `js/app.js` — `mostrarTabFinanceiro` (~13031), aba inicial (~10979), nova `renderHoje()`; `css/style.css` (grid 2 colunas → 1 coluna abaixo de 768px, tarefas primeiro); Test `tests/e2e/financeiro-fase1-hoje.spec.js`

**Interfaces:** Consumes `CaixaCore.tarefasHoje`, `saldosHoje`, `previsaoSemanal`, `primeiraSemanaNegativa`, `cobrarNoWhatsApp`, `marcarCRPago`, `marcarCPPago`.
- Esquerda em ordem: receber atrasados (vermelho, 💬 Cobrar + ✓ Recebi), receber hoje (amarelo), pagar atrasados (vermelho) e próximos 7 dias (cinza, ✓ Paguei), cartão que cai hoje (informativo). Vazio: "Tudo em dia 👍".
- Direita (só com `financeiro.extrato` visualizar): "Tenho hoje" (total + cada conta; clique → `mostrarTabFinanceiro('extrato')` filtrado na conta), "Próximas semanas" (barras Chart.js, semana negativa em vermelho, legenda "inclui atrasados" quando houver, texto "Semana de DD/MM: falta R$ X"). Sem contas → convite "Configure suas contas para ver quanto você tem" com link para `empresa.html` aba Preferências.
- Abre por padrão quando o usuário tem `financeiro.hoje`; senão a primeira aba permitida (lógica atual).
- [ ] **Step 1: Write the failing e2e**: `'Hoje e a primeira aba e abre por padrao'`; `'tarefas em ordem de urgencia com botoes'`; `'sem receber completo nao mostra Recebi nem Cobrar'`; `'saldo de hoje nao inclui cartao a cair'`; `'semana negativa aparece com o texto de falta'`; `'sem contas mostra convite'`; `'tudo em dia'`; `'em 375px de largura tarefas vem primeiro'`.
- [ ] **Step 2–4**: RED → implement → GREEN; `financeiro-bloqueio-menu` → PASS (ajustar só se esperava "Visão Geral" como aba inicial); `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): tela Hoje do financeiro`

---

### Task 9: Aba "Extrato" e transferências

**Files:** Modify `financeiro.html` (aba `data-tab="extrato"` "📒 Extrato", painel `#fin-extrato`), `js/app.js` — `renderExtrato()`, `abrirModalTransferencia()`, `excluirTransferencia(grupoId)`; Test `tests/e2e/financeiro-fase1-extrato.spec.js`

**Interfaces:**
- Consumes: `CaixaCore.saldoConta`.
- Produces: `renderExtrato({ contaId?, mes? })` — filtros conta (todas) e mês (atual); linhas por data (entradas verdes, saídas vermelhas, futuras com selo "a cair"), saldo no início e no fim do período (soma das contas filtradas). `abrirModalTransferencia()` — de, para (diferentes), valor > 0, data (padrão hoje); cria 2 movimentos `origem:'transferencia'` com mesmo `grupo_id`; exige `financeiro.extrato` completo; validação inline. `excluirTransferencia(grupoId)` — confirma e remove os dois.
- [ ] **Step 1: Write the failing e2e**: `'extrato do mes com entradas e saidas e saldos'`; `'filtro por conta'`; `'cartao a cair aparece marcado'`; `'transferir caixa para banco muda os dois saldos e nao o total'`; `'mesma conta de origem e destino e bloqueado dentro do modal'`; `'excluir transferencia remove os dois lados'`; `'sem extrato completo nao ve Transferir'`.
- [ ] **Step 2–4**: RED → implement → GREEN; `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(caixa): extrato e transferencias entre contas`

---

### Task 10: Documentação, pendências e regressão final

**Files:** Modify `FUNCIONALIDADES_SCTECH.txt` (seção 10: contas, meios, maquininha, plano × meio, previsão, parcial, WhatsApp, Hoje, Extrato, estorno de pagamento), `Docs/superpowers/pendencias-financeiro.md` (seção "Da Fase 1" com o que ficou para depois)
- [ ] **Step 1:** Documentar em português simples, no estilo do arquivo.
- [ ] **Step 2:** `npm test` e **toda** a suíte e2e (servidores em 8131 e 8123) → tudo PASS; reportar cada falha (reproduz sozinha? relacionada à Fase 1?).
- [ ] **Step 3: Commit** — `docs(financeiro): funcionalidades da fase 1`
