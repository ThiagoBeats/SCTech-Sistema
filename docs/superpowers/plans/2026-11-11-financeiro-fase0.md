# Financeiro Fase 0 — Confiabilidade dos números — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar confiáveis os números do Financeiro: fonte única de recebimentos, entrada + saldo, comissões no A Pagar, custo real no DRE por pedido, exclusão segura, PC → A Pagar, regime tributário e migração dos dados antigos.

**Architecture:** Toda regra de cálculo nova vai para um módulo puro `js/financeiro-core.js` (namespace `FinanceiroCore`, testado com `node --test`), no mesmo padrão de `etiquetas-core.js`. `js/app.js` só lê/grava `db`, abre modais e chama o core. Um único modal de baixa (`abrirModalBaixa`) serve A Receber, A Pagar e comissões.

**Tech Stack:** HTML/CSS/JS puro, sem build, `localStorage` (`db.*` + `syncDB()`), `node --test`, Playwright e2e instalado fora do repo (ver `tests/e2e/README.md`).

**Spec:** `Docs/superpowers/specs/2026-11-11-financeiro-fase0-design.md`

## Global Constraints

- Sem dependências novas. Sem backend.
- Identificadores em português; campos em snake_case; datas `'YYYY-MM-DD'`; eventos em epoch ms.
- IDs: nunca `Date.now() + i` em laços que podem colidir com outro laço no mesmo ms — use um contador local iniciado em `Date.now()` e incrementado por item, e garanta que não exista id igual em `db.contas_receber`/`db.contas_pagar`.
- Dinheiro sempre arredondado a centavos (`FinanceiroCore.arredondar`); a soma das parcelas é **exatamente** o total.
- Modais com `.modal-overlay`/`.modal-box` e os helpers `showAlert`/`showConfirm`/`showEscolha`. Nenhum `prompt()` novo; os existentes em `marcarCRPago`/`marcarCPPago` são removidos.
- Permissões: baixa/estorno de recebimento = `financeiro.receber` completo; baixa de conta a pagar e comissão = `financeiro.pagar` completo; `podeConfirmarPagamento` continua valendo.
- `js/financeiro-core.js` é incluído em **todas** as páginas que incluem `js/app.js`, logo antes dele; o cache-busting de todos os `<script src="js/...">` sobe de `?v=20261110c` para `?v=20261111a`.
- Novos campos: CR `forma_pagamento`, `baixado_por`, `baixado_em`, `parcela_tipo` (`'entrada'|'saldo'|'unica'`), `estornado_por`, `estornado_em`, `pedido_excluido`; CP `forma_pagamento`, `baixado_por`, `baixado_em`, `papel_comissao` (`'vendedor'|'arquiteto'`), `vendedor_id`, `pedido_compra_id`, `pedido_cancelado`; pedido `entrada_pct`, `custo_snapshot`; PC `conta_pagar_gerada`; forma de pagamento `{nome, desconto, entrada}`; empresa `regime_tributario`, `aliquota_estimada`.
- Categoria de comissão nova: `'comissao'` (a antiga `'comissao_rt'` continua sendo lida como comissão).
- Textos de tela em português simples, sem jargão contábil.

## Review Focus

1. **Arredondamento:** valor R$ 1.000,01 com entrada 33% → entrada + saldo somam exatamente 1.000,01 (Task 1).
2. **Reaprovação com entrada já paga:** pedido volta para Orçamento com a entrada paga e é aprovado de novo → não cobra a entrada outra vez; gera só o que falta (Task 1 e Task 3).
3. **Comissão gerada duas vezes:** pedido passa por Instalado mais de uma vez (ou o botão é clicado duas vezes) → continua existindo uma conta por papel (Task 1 e Task 4).
4. **Pedido sem data de entrega** → saldo vence na aprovação + 30 dias, como hoje (Task 1).
5. **Migração rodando de novo** (recarregar a página, abrir em outra aba) → nada muda na segunda vez (Task 9).

---

### Task 1: Núcleo `FinanceiroCore` (cálculos puros)

**Files:**
- Create: `js/financeiro-core.js`
- Test: `tests/financeiro-core.test.js`

**Interfaces:**
- Produces (todas em `FinanceiroCore`, exportadas via `module.exports` e `window.FinanceiroCore`, padrão do fim de `js/etiquetas-core.js`):
  - `arredondar(v: number) -> number` — 2 casas.
  - `somarDias(dataISO: string, dias: number) -> string` — `'YYYY-MM-DD'`, sem fuso (usar `T12:00:00`).
  - `entradaPctDoNome(nome: string) -> number` — `"X% entrada…"`/`"X% de entrada…"` → X; contém "vista" (sem acento/maiúsculas) → 100; senão 50.
  - `planejarParcelas({ valor, entradaPct, jaPago = 0, dataAprovacao, dataEntrega }) -> Array<{ tipo: 'entrada'|'saldo'|'unica', valor: number, data_vencimento: string }>`
  - `totalRecebido(contasReceber, pedidoId) -> number` — soma de `status === 'Pago'` com `pedido_id == pedidoId`.
  - `saldoEmAberto(contasReceber, pedidoId) -> number` — soma das não pagas.
  - `custoSnapshotPedido(ped, { catalogo, materiais, kits }) -> { total: number, itens: Array<{ origem: 'tecido'|'material'|'kit', ref_id, nome, quantidade, custo_unit: number|null, custo_total: number|null }>, faltando: number }`
  - `resultadoPedido(ped, contasPagar, cadastros) -> { receita, custo_material, origem_custo: 'snapshot'|'pedido'|'estimado', custos_vinculados, comissoes, lucro, margem_pct, itens_sem_custo }`
  - `contasComissaoDoPedido(ped, { vendedores, contasPagar, data, rotuloPedido }) -> Array<CP sem id>`
  - `parcelasCompra({ valor, modo: 'avista'|'prazo'|'parcelado', hoje, vencimento, numParcelas, intervaloDias }) -> Array<{ valor, data_vencimento, parcela_atual, numero_parcelas }>`
  - `acharContaDuplicadaNota(contasPagar, { cnpj, valor }, toleranciaPct = 1) -> CP|null`

- [ ] **Step 1: Write the failing tests** em `tests/financeiro-core.test.js` (`require('../js/financeiro-core.js')`, estilo de `tests/etiquetas-core.test.js`):

```js
test('entradaPctDoNome le o % do nome da forma', () => {
    assert.strictEqual(F.entradaPctDoNome('50% entrada + 50% na instalação'), 50);
    assert.strictEqual(F.entradaPctDoNome('30% de entrada + 70%'), 30);
    assert.strictEqual(F.entradaPctDoNome('À vista'), 100);
    assert.strictEqual(F.entradaPctDoNome('PIX'), 50);
});
test('planejarParcelas: entrada na aprovacao, saldo na entrega, soma exata', () => {
    const p = F.planejarParcelas({ valor: 1000.01, entradaPct: 33, dataAprovacao: '2026-11-11', dataEntrega: '2026-12-01' });
    assert.deepStrictEqual(p.map(x => x.tipo), ['entrada', 'saldo']);
    assert.strictEqual(p[0].valor, 330);
    assert.strictEqual(F.arredondar(p[0].valor + p[1].valor), 1000.01);
    assert.strictEqual(p[0].data_vencimento, '2026-11-11');
    assert.strictEqual(p[1].data_vencimento, '2026-12-01');
});
test('planejarParcelas: 100% gera uma parcela unica', () => {
    const p = F.planejarParcelas({ valor: 500, entradaPct: 100, dataAprovacao: '2026-11-11', dataEntrega: '2026-12-01' });
    assert.deepStrictEqual(p, [{ tipo: 'unica', valor: 500, data_vencimento: '2026-11-11' }]);
});
test('planejarParcelas: sem data de entrega, saldo vence em 30 dias', () => {
    const p = F.planejarParcelas({ valor: 100, entradaPct: 50, dataAprovacao: '2026-11-11', dataEntrega: null });
    assert.strictEqual(p[1].data_vencimento, '2026-12-11');
});
test('planejarParcelas: reaprovacao com entrada paga gera so o saldo', () => {
    const p = F.planejarParcelas({ valor: 1200, entradaPct: 50, jaPago: 500, dataAprovacao: '2026-11-11', dataEntrega: '2026-12-01' });
    assert.deepStrictEqual(p.map(x => [x.tipo, x.valor]), [['entrada', 100], ['saldo', 600]]);
    const q = F.planejarParcelas({ valor: 1000, entradaPct: 50, jaPago: 1000, dataAprovacao: '2026-11-11', dataEntrega: '2026-12-01' });
    assert.deepStrictEqual(q, []);
});
test('totalRecebido e saldoEmAberto por pedido', () => {
    const cr = [{ pedido_id: 1, valor: 300, status: 'Pago' }, { pedido_id: 1, valor: 700, status: 'Atrasado' }, { pedido_id: 2, valor: 50, status: 'Pago' }];
    assert.strictEqual(F.totalRecebido(cr, 1), 300);
    assert.strictEqual(F.saldoEmAberto(cr, 1), 700);
});
test('custoSnapshotPedido usa preco_custo x consumo, marca item sem custo', () => {
    const cad = { catalogo: [{ id: 10, nome: 'Linho', preco_custo: 20 }], materiais: [{ id: 5, nome: 'Trilho', preco_custo: 0 }], kits: [{ id: 7, nome: 'Kit', preco_custo: 40 }] };
    const ped = { ambientes: [{ tecidos: [{ tecidoId: 10, consumo_linear: 3.5 }] }], itens: [{ materialId: 5, quantidade: 2 }, { kitId: 7, quantidade: 1 }] };
    const s = F.custoSnapshotPedido(ped, cad);
    assert.strictEqual(s.total, 110);
    assert.strictEqual(s.faltando, 1);
    assert.strictEqual(s.itens.find(i => i.origem === 'material').custo_total, null);
});
test('resultadoPedido: mao de obra e receita; tecido vinculado nao conta; outro e comissao contam', () => {
    const ped = { id: 1, valor: 1000, maoObra: 200, custo_snapshot: { total: 300, faltando: 0 } };
    const cp = [
        { pedido_id: 1, categoria: 'tecido', valor: 300 }, { pedido_id: 1, categoria: 'costureira', valor: 100 },
        { pedido_id: 1, categoria: 'outro', valor: 50 }, { pedido_id: 1, categoria: 'comissao', valor: 50 },
        { pedido_id: 2, categoria: 'instalador', valor: 999 }];
    const r = F.resultadoPedido(ped, cp, { catalogo: [], materiais: [], kits: [] });
    assert.deepStrictEqual([r.receita, r.custo_material, r.custos_vinculados, r.comissoes, r.lucro, r.origem_custo], [1000, 300, 150, 50, 500, 'snapshot']);
    assert.strictEqual(r.margem_pct, 50);
});
test('resultadoPedido: pedido antigo com custo proprio usa ele; sem nada, estimado', () => {
    const cad = { catalogo: [{ id: 10, preco_custo: 20 }], materiais: [], kits: [] };
    assert.strictEqual(F.resultadoPedido({ id: 1, valor: 100, tipo_precificacao: 'pedido', custo_mat: 30, custo_acess: 10 }, [], cad).origem_custo, 'pedido');
    const r = F.resultadoPedido({ id: 2, valor: 100, ambientes: [{ tecidos: [{ tecidoId: 10, consumo_linear: 1 }] }], itens: [] }, [], cad);
    assert.deepStrictEqual([r.origem_custo, r.custo_material], ['estimado', 20]);
});
test('contasComissaoDoPedido: uma por papel, idempotente', () => {
    const ped = { id: 1, vendedor_id: 3, comissao_pct: 5, comissao_valor: 50, arq_id: 4, arq_comissao_pct: 10, arq_comissao_valor: 100 };
    const vend = [{ id: 3, nome: 'Ana' }, { id: 4, nome: 'Bia' }];
    const novas = F.contasComissaoDoPedido(ped, { vendedores: vend, contasPagar: [], data: '2026-11-11', rotuloPedido: '#26001' });
    assert.deepStrictEqual(novas.map(c => [c.papel_comissao, c.valor, c.categoria, c.status, c.data_vencimento]),
        [['vendedor', 50, 'comissao', 'Pendente', '2026-11-11'], ['arquiteto', 100, 'comissao', 'Pendente', '2026-11-11']]);
    assert.deepStrictEqual(F.contasComissaoDoPedido(ped, { vendedores: vend, contasPagar: novas, data: '2026-11-11', rotuloPedido: '#26001' }), []);
});
test('parcelasCompra: a vista, prazo e parcelado com soma exata', () => {
    assert.deepStrictEqual(F.parcelasCompra({ valor: 100, modo: 'avista', hoje: '2026-11-11' }).map(p => p.data_vencimento), ['2026-11-11']);
    assert.deepStrictEqual(F.parcelasCompra({ valor: 100, modo: 'prazo', hoje: '2026-11-11', vencimento: '2026-12-20' }).map(p => p.data_vencimento), ['2026-12-20']);
    const p = F.parcelasCompra({ valor: 100, modo: 'parcelado', hoje: '2026-11-11', numParcelas: 3, intervaloDias: 30 });
    assert.deepStrictEqual(p.map(x => x.data_vencimento), ['2026-12-11', '2027-01-10', '2027-02-09']);
    assert.strictEqual(F.arredondar(p.reduce((s, x) => s + x.valor, 0)), 100);
});
test('acharContaDuplicadaNota: mesmo CNPJ, valor proximo, em aberto, vinda de PC', () => {
    const cps = [{ id: 1, pedido_compra_id: 9, cnpj_fornecedor: '12.345.678/0001-90', valor: 1000, status: 'Pendente' },
                 { id: 2, pedido_compra_id: 9, cnpj_fornecedor: '12345678000190', valor: 1000, status: 'Pago' }];
    assert.strictEqual(F.acharContaDuplicadaNota(cps, { cnpj: '12345678000190', valor: 1005 }).id, 1);
    assert.strictEqual(F.acharContaDuplicadaNota(cps, { cnpj: '12345678000190', valor: 1100 }), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `node --test tests/financeiro-core.test.js` — Expected: FAIL (`Cannot find module '../js/financeiro-core.js'`).

- [ ] **Step 3: Implement `js/financeiro-core.js`** com as assinaturas do bloco Interfaces. Regras não óbvias:
  - `planejarParcelas`: `entrada = arredondar(valor * pct / 100)`; com `jaPago`, a entrada restante é `max(0, entrada - jaPago)` e o saldo é `arredondar(valor - jaPago - entradaRestante)`; parcelas com valor ≤ 0 são omitidas; `dataEntrega` nula → `somarDias(dataAprovacao, 30)`; `entradaPct >= 100` → uma parcela `'unica'`.
  - `custoSnapshotPedido`: tecido = `catalogo.preco_custo × t.consumo_linear` (por `t.tecidoId`); item com `kitId` → `kits.preco_custo × quantidade`; item com `materialId` → `materiais.preco_custo × quantidade`. `preco_custo` ausente ou ≤ 0 → `custo_unit/custo_total = null` e conta em `faltando`.
  - `resultadoPedido`: `custo_material` = `ped.custo_snapshot.total` (origem `'snapshot'`), senão `custo_mat + custo_acess` quando `tipo_precificacao === 'pedido' && custo_mat != null` (`'pedido'`), senão `custoSnapshotPedido(...).total` (`'estimado'`). `comissoes` = CPs do pedido com categoria `'comissao'` ou `'comissao_rt'`; `custos_vinculados` = demais CPs do pedido exceto `'tecido'`. `margem_pct` com 1 casa; 0 quando receita 0. `itens_sem_custo` = `faltando` do snapshot/estimativa (0 para `'pedido'`).
  - `contasComissaoDoPedido`: usa `CAMPOS_COMISSAO` (copiar o mapa para o core); cria para cada papel com id e valor > 0 que **não** tenha CP com mesmo `pedido_id` e `papel_comissao`; `descricao = \`Comissão ${pct}% — ${nome} — Ped. ${rotuloPedido}\``; `tipo:'variavel'`, `credor_nome`, `vendedor_id`, `data_pagamento:null`.
  - `parcelasCompra`: parcelado → vencimento `i` = `somarDias(hoje, intervaloDias * (i+1))`; última parcela absorve o arredondamento.
  - `acharContaDuplicadaNota`: só CPs com `pedido_compra_id` e status ≠ `'Pago'`; compara dígitos do CNPJ; compara `valor` com o valor da CP **ou** com a soma do grupo (`lancamento_pai_id`); tolerância `max(0.01, valor * toleranciaPct / 100)`.

- [ ] **Step 4: Run tests** — `node --test tests/financeiro-core.test.js` → PASS; `npm test` → todos PASS.

- [ ] **Step 5: Commit** — `git add js/financeiro-core.js tests/financeiro-core.test.js && git commit -m "feat(financeiro): nucleo puro de parcelas, custo e comissoes"`

---

### Task 2: Recebimentos com fonte única + modal de baixa + estorno

**Files:**
- Modify: todas as `*.html` que incluem `js/app.js` (incluir `js/financeiro-core.js?v=20261111a` antes dele; subir `?v=`)
- Modify: `js/app.js` — `confirmarPagamentoPedido` (~2908), `marcarCRPago` (~11286), `mostrarModalPagamento` (~2859), `salvarPedido` (~6132), `carregarPedidoParaEdicao` (~6285), render da tabela A Receber
- Modify: `pedido.html:170` (`ped-valor-recebido` → `readonly`, sem `oninput`)
- Test: `tests/e2e/financeiro-fase0-recebimento.spec.js`

**Interfaces:**
- Consumes: `FinanceiroCore.totalRecebido`, `saldoEmAberto`.
- Produces (app.js):
  - `abrirModalBaixa({ titulo: string, itens: Array<{ id, descricao, valor, marcado: boolean }>, formaPadrao: string, comData = true }) -> Promise<{ ids: Array, data: string, forma: string } | null>` — lista com checkbox, total dos marcados atualizado ao vivo, data (padrão hoje), select de forma (`getFormasPagamento()` + "Dinheiro", "PIX", "Cartão", "Transferência" sem repetir).
  - `sincronizarRecebidoPedido(pedidoId) -> void` — grava `ped.valor_recebido = totalRecebido(...)`.
  - `baixarContasReceber(ids, data, forma) -> void` — status `'Pago'`, `data_pagamento`, `forma_pagamento`, `baixado_por = getUsuarioLogado()?.id`, `baixado_em = Date.now()`; sincroniza os pedidos afetados.
  - `estornarCR(id) -> Promise<void>` — volta para `'Pendente'` (ou `'Atrasado'` se vencida), limpa campos de baixa, grava `estornado_por/estornado_em`, sincroniza pedido.

- [ ] **Step 1: Write the failing e2e** (`entrar` de `tests/e2e/ajuda.js`, dados semeados via localStorage):
  - `'confirmar pagamento lista parcelas e baixa so as marcadas'`: pedido em Aguardando Financeiro com `pagamento_pendente: true`, CRs entrada (Pago) e saldo (Pendente) → modal mostra o saldo **desmarcado**; marcar e confirmar → CR saldo `status 'Pago'`, `forma_pagamento` = forma escolhida, `baixado_por` = id do usuário; `pedido.valor_recebido === pedido.valor`; status `'Instalado'`.
  - `'confirmar sem marcar o saldo leva a Instalado com saldo em aberto'`: confirma sem marcar → status `'Instalado'`, CR saldo continua aberta, card do pedido mostra `"saldo em aberto"`.
  - `'Recebido no A Receber reflete no pedido e no card da home'`: baixa de CR em `financeiro.html` → `pedido.valor_recebido` atualizado.
  - `'estornar volta a parcela e o pedido'`: estorno → CR `'Pendente'`, `estornado_por` preenchido, `valor_recebido` reduzido.
  - `'valor recebido do pedido e somente leitura'`: `#ped-valor-recebido` tem atributo `readonly`.

- [ ] **Step 2: Run e2e to verify they fail** — conforme `tests/e2e/README.md`, `TESTDIR=<projeto>/tests/e2e npx playwright test -c repo.config.js financeiro-fase0-recebimento` → FAIL.

- [ ] **Step 3: Implement.**
  - `confirmarPagamentoPedido`: troca o `showConfirm` por `abrirModalBaixa` com as CRs em aberto do pedido (todas marcadas; a de `parcela_tipo === 'saldo'` desmarcada se `ped.pagamento_pendente`), `formaPadrao = formaPagamentoDoPedido(ped)`. Cancelar não muda nada. Confirmar: `baixarContasReceber`, depois o fluxo de Instalado como hoje (remove a linha `ped.valor_recebido = ped.valor`); `ped.pagamento_pendente = saldoEmAberto(...) > 0.01`.
  - Kanban/lista: badge `"saldo em aberto"` em pedido Instalado com `saldoEmAberto > 0.01`.
  - `marcarCRPago(id)` vira `abrirModalBaixa` com um item; remove o `prompt()` e **todo** o bloco de RT legado.
  - Botão "↩ Estornar" nas CRs pagas da tabela A Receber (só com `financeiro.receber` completo).
  - `salvarPedido` deixa de ler `ped-valor-recebido`; preserva `valor_recebido` do registro existente (ou 0).
  - `mostrarModalPagamento` usa `totalRecebido` em vez de `ped.valor_recebido`.

- [ ] **Step 4: Run** e2e → PASS; `tests/e2e/forma-de-pagamento.spec.js` e `financeiro-bloqueio-menu.spec.js` → PASS (ajustar só asserções que citam o valor recebido digitável); `npm test` → PASS.

- [ ] **Step 5: Commit** — `feat(financeiro): baixa de recebimento unica, com forma, autor e estorno`

---

### Task 3: Entrada + saldo na aprovação

**Files:**
- Modify: `js/app.js` — `_formasLimpas`/`getFormasPagamentoCfg`/`renderFormasPagamentoCfg` (~400–525), `aplicarDescontoDaFormaPagamento` (~459), `_planoPagamento`/`gerarFinanceiroPedido` (~11197/11248), `salvarPedido`, `carregarPedidoParaEdicao`, `voltarPedidoParaOrcamento` (~6237)
- Modify: `pedido.html` (campo `ped-entrada-pct`, "% de entrada", ao lado da forma de pagamento), `empresa.html` (coluna "% entrada" na lista de formas)
- Test: `tests/e2e/financeiro-fase0-entrada.spec.js`

**Interfaces:**
- Consumes: `FinanceiroCore.planejarParcelas`, `entradaPctDoNome`, `totalRecebido`.
- Produces: forma `{ nome, desconto, entrada }`; `entradaDaFormaPagamento(nome) -> number`; `ped.entrada_pct: number`; CR com `parcela_tipo`.

- [ ] **Step 1: Write the failing e2e:**
  - `'forma antiga sem entrada ganha o % do nome'`: `sc_formas_pag = [{nome:'30% entrada + 70% na instalação', desconto:0}, {nome:'À vista', desconto:5}]` → tela da empresa mostra 30 e 100.
  - `'escolher a forma preenche o % de entrada do pedido'`: trocar para "À vista" → `#ped-entrada-pct` = 100; editável.
  - `'aprovar gera entrada hoje e saldo na entrega'`: pedido R$ 1.000, entrada 40, entrega `2026-12-01` → 2 CRs: 400 (`parcela_tipo 'entrada'`, vence hoje) e 600 (`'saldo'`, vence `2026-12-01`).
  - `'100% gera uma parcela'`: entrada 100 → 1 CR `parcela_tipo 'unica'`.
  - `'pedido ja aprovado nao e redividido'`: pedido aprovado com 1 CR de 100% antes da mudança continua com 1 CR após recarregar.
  - `'reaprovar com entrada paga gera so o que falta'`: voltar para Orçamento com entrada paga, aprovar de novo → nenhuma nova entrada, saldo = valor − pago.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**
  - `_formasLimpas` aceita `entrada` (0–100, inteiro); ausente → `FinanceiroCore.entradaPctDoNome(nome)`. Padrões de `_FORMAS_PAG_PADRAO` herdam do nome.
  - Pedido: `ped-entrada-pct` (0–100); `aplicarDescontoDaFormaPagamento` também preenche a entrada. `salvarPedido` grava `entrada_pct`; `carregarPedidoParaEdicao` restaura.
  - `gerarFinanceiroPedido(ped)`: pedido com `forma_pagamento` → `planejarParcelas({ valor, entradaPct: ped.entrada_pct ?? entradaDaFormaPagamento(ped.forma_pagamento), jaPago: totalRecebido(db.contas_receber, ped.id), dataAprovacao: hoje, dataEntrega: ped.data_entrega })`; descrições `"Entrada (X%) — Pedido #N"`, `"Saldo na instalação — Pedido #N"`, `"Pagamento — Pedido #N"`. Pedido legado com `tipo_pagamento` e sem `forma_pagamento` continua em `PLANOS_PAGAMENTO`.
  - `voltarPedidoParaOrcamento`: sempre remove as CRs **em aberto** do pedido e zera `financeiro_gerado`; as pagas ficam (a reaprovação desconta via `jaPago`). Ajustar o texto do aviso.

- [ ] **Step 4: Run** e2e → PASS; atualizar `forma-de-pagamento.spec.js` (o comentário "o Financeiro lança um único valor" e asserções equivalentes passam a esperar entrada + saldo); `npm test` → PASS.

- [ ] **Step 5: Commit** — `feat(financeiro): entrada e saldo por forma de pagamento`

---

### Task 4: Comissões viram contas a pagar

**Files:**
- Modify: `js/app.js` — `confirmarPagamentoPedido`, `moverStatus` (~3051), `salvarPedido` (status vindo do select), `pagarComissao`/`pagarTodasFiltradas` (~7609), `marcarCPPago` (~11460)
- Test: `tests/e2e/financeiro-fase0-comissoes.spec.js`

**Interfaces:**
- Consumes: `FinanceiroCore.contasComissaoDoPedido`; `abrirModalBaixa` (Task 2).
- Produces: `gerarComissoesPedido(ped) -> void` (idempotente); `baixarContasPagar(ids, data, forma) -> void` — mesma gravação de `baixarContasReceber`; para CP com `papel_comissao`, também marca `ped[CAMPOS_COMISSAO[papel].paga] = true` e `ped[...data] = epoch da data escolhida`.

- [ ] **Step 1: Write the failing e2e:**
  - `'instalar gera uma conta por papel'`: confirmar pagamento de pedido com vendedor 5% e arquiteto 10% → 2 CPs `categoria 'comissao'`, vencimento = data da instalação; confirmar de novo não duplica.
  - `'pagar comissao na tela de vendedores baixa a conta'`: `pagarComissao` → modal com data/forma → CP `'Pago'` com `forma_pagamento`; aba Histórico mostra o pagamento.
  - `'pagar no A Pagar reflete na tela de vendedores'`: baixa da CP em `financeiro.html` → comissão some de Pendentes.
  - `'pagar todas da pessoa'`: filtro por vendedor + "Pagar todas" → um modal, todas as CPs dela pagas com a mesma data e forma.
  - `'Pagar no A Pagar nao usa prompt'`: nenhuma chamada a `window.prompt` (stub que falha o teste).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** Chamar `gerarComissoesPedido` em todo ponto que põe o status em `'Instalado'` (`confirmarPagamentoPedido`, `moverStatus`, `salvarPedido`). `pagarComissao`/`pagarTodasFiltradas` localizam as CPs (gerando-as se faltarem) e usam `abrirModalBaixa` → `baixarContasPagar`. `marcarCPPago` vira `abrirModalBaixa` + `baixarContasPagar` (remove o `prompt()`). As listas de Pendentes/Histórico continuam lendo os flags do pedido, que agora só mudam por `baixarContasPagar`.

- [ ] **Step 4: Run** e2e → PASS; `tests/e2e/vendedores-arquitetos.spec.js` → PASS (ajustar só onde esperava o `showConfirm` antigo); `npm test` → PASS.

- [ ] **Step 5: Commit** — `feat(financeiro): comissoes entram no A Pagar`

---

### Task 5: Custo guardado na aprovação + DRE por pedido

**Files:**
- Modify: `js/app.js` — `aprovarPedido` (~2712), `moverStatus` (saída de Orçamento), `salvarPedido` (saída de Orçamento), `renderDRE` (~12963); `financeiro.html` (cabeçalho da tabela DRE)
- Test: `tests/e2e/financeiro-fase0-dre.spec.js`

**Interfaces:**
- Consumes: `FinanceiroCore.custoSnapshotPedido`, `resultadoPedido`.
- Produces: `registrarCustoPedido(ped) -> void` — grava `ped.custo_snapshot = { ...custoSnapshotPedido(ped, { catalogo: db.catalogo, materiais: db.materiais, kits: db.kits }), data: hoje }`; chamada junto de cada `gerarFinanceiroPedido` na saída de Orçamento (refeito a cada reaprovação).

- [ ] **Step 1: Write the failing e2e:**
  - `'aprovar guarda o custo e o DRE nao muda quando o custo do tecido muda'`: aprovar pedido, alterar `preco_custo` do tecido → DRE mostra o mesmo custo.
  - `'mao de obra nao e custo'`: pedido valor 1000, mão de obra 200, custo snapshot 300, sem CPs → lucro 700, margem 70,0%.
  - `'colunas do DRE'`: cabeçalhos `Receita | Material | Serviços e outros | Comissões | Resultado | Margem`.
  - `'item sem custo mostra aviso'` → linha com "custo não informado".
  - `'pedido antigo sem snapshot aparece como custo estimado'`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** `registrarCustoPedido` e reescrever `renderDRE` sobre `resultadoPedido`, mantendo filtro por cliente, limite de 50, linha de total e cores de margem (≥30 verde, ≥15 amarelo, senão vermelho). Badge pequeno "custo estimado" / "custo não informado (N itens)" na linha.

- [ ] **Step 4: Run** e2e → PASS; `npm test` → PASS.

- [ ] **Step 5: Commit** — `feat(financeiro): custo real guardado na aprovacao e DRE por pedido correto`

---

### Task 6: Excluir pedido de venda com segurança

**Files:**
- Modify: `js/app.js` — `excluirPedido` (~2696), `voltarPedidoParaOrcamento`
- Test: `tests/e2e/financeiro-fase0-excluir.spec.js`

**Interfaces:**
- Consumes: `FinanceiroCore.totalRecebido`.
- Produces: `removerFinanceiroAbertoPedido(pedidoId) -> { crRemovidas: number, comissoesRemovidas: number, comissoesPagas: number }` — remove CRs não pagas e CPs `papel_comissao` não pagas do pedido; CPs de comissão pagas ganham `pedido_cancelado = true`.

- [ ] **Step 1: Write the failing e2e:**
  - `'sem recebimento: exclui pedido, contas em aberto e comissoes pendentes'`.
  - `'com recebimento: bloqueia e explica'` → alerta contendo "estorne"; pedido e CRs intactos.
  - `'comissao paga de pedido que voltou para Orcamento fica marcada para revisar'` → CP com `pedido_cancelado`, A Pagar mostra "pedido cancelado — revisar".

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `excluirPedido`: se `totalRecebido > 0` → `showAlert` explicando que é preciso estornar os recebimentos antes, e sai. Senão confirma (mensagem inclui quantas contas sairão) e chama `removerFinanceiroAbertoPedido`. `voltarPedidoParaOrcamento` usa a mesma função.
- [ ] **Step 4: Run** e2e → PASS.
- [ ] **Step 5: Commit** — `fix(financeiro): excluir pedido nao deixa contas orfas nem apaga recebimento`

---

### Task 7: Pedido de compra recebido → A Pagar + anti-duplicidade de nota

**Files:**
- Modify: `js/app.js` — `atualizarStatusPC` (~8313), `renderListaPedidosCompra` (~8219), importação de nota/boleto (~11833–12160) e `adicionarContaPagarManual` (~11737)
- Test: `tests/e2e/financeiro-fase0-compra.spec.js`

**Interfaces:**
- Consumes: `FinanceiroCore.parcelasCompra`, `acharContaDuplicadaNota`.
- Produces: `abrirModalContaPagarPC(pc) -> Promise<void>`; CP com `pedido_compra_id`, `cnpj_fornecedor` (do fornecedor do PC), `credor_nome`, categoria `'tecido'` se algum item do PC for tecido do catálogo, senão `'outro'`; parcelado com `lancamento_pai_id/parcelado/numero_parcelas/parcela_atual`; `pc.conta_pagar_gerada = true`.

- [ ] **Step 1: Write the failing e2e:**
  - `'recebido abre o modal com o total do PC'` → valor pré-preenchido = soma dos `itens[].subtotal`.
  - `'a vista / prazo / parcelado geram as contas certas'` → 1 CP hoje; 1 CP na data; 3 CPs a cada 30 dias somando o total.
  - `'agora nao deixa aviso e permite gerar depois'` → lista mostra "sem conta a pagar" e botão "Gerar conta"; depois de gerar, aviso some.
  - `'voltar o PC e marcar Recebido de novo nao duplica'` → com `conta_pagar_gerada`, o modal não abre.
  - `'importar nota do mesmo fornecedor oferece vincular'` → `showEscolha` com "Vincular à conta existente"; escolher vincular grava `chave_acesso`/`numero_documento`/anexo na CP existente e não cria outra.

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Modal com valor (editável), três opções em rádio (À vista / Boleto ou prazo único + data / Parcelado + nº parcelas + intervalo em dias, padrão 30) e botões "Gerar conta a pagar" e "Agora não". No salvamento manual a partir de nota importada, antes de criar a CP, chamar `acharContaDuplicadaNota`; se achar, `showEscolha` entre vincular e lançar nova.
- [ ] **Step 4: Run** e2e → PASS; `pedido-de-compra.spec.js` e `pedido-compra-de-venda.spec.js` → PASS.
- [ ] **Step 5: Commit** — `feat(financeiro): pedido de compra recebido gera conta a pagar`

---

### Task 8: Regime tributário no cadastro da empresa

**Files:**
- Modify: `empresa.html` (aba Dados da Empresa: select `emp-regime` com "Não informado", "MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real"; input `emp-aliquota` "% de imposto estimado"), `js/app.js` — `salvarEmpresaConfigs` (~376) e a função que carrega a tela
- Test: `tests/e2e/financeiro-fase0-regime.spec.js`

**Interfaces:**
- Produces: `getEmpresa().regime_tributario: ''|'MEI'|'Simples Nacional'|'Lucro Presumido'|'Lucro Real'`, `getEmpresa().aliquota_estimada: number` (0–100).

- [ ] **Step 1: Write the failing e2e:** `'regime e aliquota sao salvos e recarregados'`; `'salvar dados da empresa nao apaga regime nem campos que a tela nao tem'` (semeia `sc_empresa` com um campo extra e confere que sobrevive).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `salvarEmpresaConfigs` passa a fazer merge sobre `getEmpresa()` em vez de sobrescrever o objeto.
- [ ] **Step 4: Run** → PASS; `empresa-abas.spec.js` → PASS.
- [ ] **Step 5: Commit** — `feat(empresa): regime tributario e aliquota estimada`

---

### Task 9: Migração dos dados antigos

**Files:**
- Modify: `js/financeiro-core.js` (+ `planoMigracaoFase0`), `tests/financeiro-core.test.js`
- Modify: `js/app.js` — novo `_migrarFinanceiroFase0()` chamado no `DOMContentLoaded` (~10508) logo após `_migrarFinanceiroPedidos`; aviso de revisão na Visão Geral do Financeiro

**Interfaces:**
- Produces: `FinanceiroCore.planoMigracaoFase0({ pedidos, contas_receber, contas_pagar, vendedores, hoje, rotuloPedido }) -> { baixarCR: Array<{ id, data_pagamento, baixado_por }>, removerCR: Array<id>, marcarCRPedidoExcluido: Array<id>, criarCP: Array<CP sem id>, revisar: Array<{ pedido_id, motivo }> }`
  - pedido com `pagamento_confirmado_em` ou `valor_recebido >= valor` e CRs em aberto → `baixarCR` com `data_pagamento` = data de `pagamento_confirmado_em` (senão `data_instalado`, senão `hoje`) e `baixado_por` = `pagamento_confirmado_por` ou `'migracao'`;
  - `0 < valor_recebido < valor` e `totalRecebido` diferente → `revisar` com motivo `"valor recebido digitado no pedido não bate com o Financeiro"`;
  - pedido Instalado → `criarCP` com `contasComissaoDoPedido`; as que têm o flag pago saem com `status 'Pago'` e `data_pagamento` do `*_data_pgto`; RT legado (`arquiteto_nome`, `rt_pct > 0`, sem `rt_gerado`) entra como `papel_comissao 'arquiteto'`, se não houver comissão de arquiteto;
  - CR cujo pedido não existe: aberta → `removerCR`; paga → `marcarCRPedidoExcluido`;
  - nunca redivide parcelas; nunca cria snapshot de custo.

- [ ] **Step 1: Write the failing tests** em `tests/financeiro-core.test.js`: um teste por regra acima com as asserções exatas do item, mais `'aplicar o plano e planejar de novo da vazio'` (aplica o resultado num clone dos dados com uma função de teste e confere que o segundo plano tem todas as listas vazias).
- [ ] **Step 2: Run** `node --test tests/financeiro-core.test.js` → FAIL.
- [ ] **Step 3: Implement** `planoMigracaoFase0`; em `app.js`, `_migrarFinanceiroFase0()`: sai se `localStorage.sc_fin_migracao === '1'`; se o plano não for vazio, grava antes uma cópia `sc_fin_backup_fase0` com `contas_receber`, `contas_pagar` e `pedidos` (JSON); aplica o plano, sincroniza `valor_recebido` dos pedidos tocados, `syncDB()`, grava `sc_fin_migracao = '1'` e guarda `revisar` em `sc_fin_revisar`. A Visão Geral mostra um aviso com a lista de `sc_fin_revisar` e um botão "Marcar como revisado" que a limpa.
- [ ] **Step 4: Run** `npm test` → PASS; e2e `financeiro-fase0-migracao.spec.js`: semeia dados antigos (pedido pago com CR aberta, comissão paga, CR órfã) → depois de abrir `financeiro.html`, CR baixada, CP de comissão paga, CR órfã removida; recarregar não muda nada.
- [ ] **Step 5: Commit** — `feat(financeiro): migracao unica dos dados antigos com copia de seguranca`

---

### Task 10: Documentação e regressão final

**Files:**
- Modify: `FUNCIONALIDADES_SCTECH.txt` seção 10 (linhas ~631–828)

- [ ] **Step 1:** Reescrever a seção 10: entrada + saldo por forma, baixa com data/forma/autor e estorno, confirmar pagamento por parcelas e saldo em aberto, comissões no A Pagar, DRE com custo guardado, exclusão segura, PC → A Pagar, regime tributário. Remover "Planos suportados: À vista | 50%+50%…" e "Aguardando Pagamento".
- [ ] **Step 2:** Rodar `npm test` e **toda** a suíte e2e → tudo PASS.
- [ ] **Step 3: Commit** — `docs(financeiro): funcionalidades da fase 0`
