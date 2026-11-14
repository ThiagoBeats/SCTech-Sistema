# Financeiro Fase 3 — Fechamento do mês e simulador de compra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechamento do mês guiado (conferir saldos, pendências, resumo, foto e aviso de mudança) e simulador "vale a pena comprar?" no Financeiro.

**Architecture:** Dois núcleos puros novos, testados com `node --test` — `js/fechamento-core.js` (`FechamentoCore`) e `js/simulador-core.js` (`SimuladorCore`) — que só recebem dados e devolvem dados. A tela (em `js/app.js`, `financeiro.html`, `css/style.css`) busca os números em `CaixaCore`/`ResultadoCore` e nos helpers da Fase 2 (`dadosFinanceirosBase`, `_resDados`, `metaFinanceiraDoMes`, `orcamentoFinanceiroDoMes`) e passa para os núcleos. Nenhum cálculo de saldo/resultado novo.

**Tech Stack:** Vanilla HTML/JS, `db.*` + `syncDB()` (localStorage), `node --test`, Playwright (e2e fora do repo).

**Spec:** `Docs/superpowers/specs/2026-11-14-financeiro-fase3-design.md`

## Global Constraints

- Vanilla JS sem build; núcleos no padrão UMD dos existentes (`(function (raiz) { … if (module) module.exports = api; else raiz.XCore = api; })(this)`, como `js/resultado-core.js`).
- Toda página que inclui `js/resultado-core.js` passa a incluir `js/fechamento-core.js` e `js/simulador-core.js` logo depois dele; `?v=` de **todos** os `js`/`css` em **todas** as páginas sobe para `20261119a`.
- Datas `AAAA-MM-DD` locais (`hojeLocal()`, `dataLocal()`); comparação de valores em **centavos** (`Math.round(v*100)`).
- Valores digitados lidos com `_valorDigitadoBaixa(texto, NaN)` (aceita `1.234,56`, `1234,56`, `1234.56`).
- Textos de tela em português simples, exatamente como na spec quando ela fixa o texto.
- Ajuste da conferência: `movimentos_fin` com `origem: 'ajuste'`, `fechamento_mes: 'AAAA-MM'`, data = último dia do mês, `descricao: 'Ajuste da conferência de <Mês de aaaa>: <motivo>'`. Não entra no resultado (o `ResultadoCore` só conta `origem: 'cr'` e CPs pagas — não mexer nele).
- Foto: `db.fechamentos_fin` (lista), chave `sc_fin_fech`, gravada por `syncDB()`; backup `fechamentos_fin`.
- Permissões: fechar/refazer = `financeiro.resultado` completo; ver = `financeiro.resultado` visualizar; simulador = `financeiro.simulador` (visualizar simula; completo lança no A Pagar).
- Pendências pequenas achadas vão para `docs/superpowers/pendencias-financeiro.md`, seção "Da Fase 3".
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Conta criada depois do mês (`data_saldo_inicial` > último dia) ou inativa → não aparece na conferência (teste no Task 1).
2. Saldo do extrato digitado como `1.234,56` → lido como 1234.56, diferença certa (teste e2e no Task 4).
3. Duplo clique em "🔒 Fechar" ou em "Lançar no A Pagar" → grava uma vez só (testes e2e nos Tasks 4 e 6).
4. "Refazer fechamento" de outubro → apaga só os ajustes com `fechamento_mes: '2026-10'`, nunca os de outros meses nem movimentos de CR/CP (teste no Task 4).
5. Simulação com data da compra no passado → o pagamento cai na primeira semana, igual à tela Hoje (teste no Task 2).

---

### Task 1: Núcleo do fechamento (`FechamentoCore`)

**Files:**
- Create: `js/fechamento-core.js`
- Test: `tests/fechamento-core.test.js`

**Interfaces:**
- Consumes: nada (puro). Recebe `saldoConta` por parâmetro para não depender de `CaixaCore` no node.
- Produces (todas em `FechamentoCore`):
  - `ultimoDiaMes(mes: 'AAAA-MM') -> 'AAAA-MM-DD'`
  - `mesAnterior(mes) -> 'AAAA-MM'`
  - `rotuloMes(mes) -> string` — "outubro de 2026" (minúsculo, como `toLocaleDateString('pt-BR',{month:'long',year:'numeric'})`).
  - `contasDaConferencia({ mes, contas, movimentos, saldoConta, ignorarAjustesDe }) -> [{ conta_id, nome, esperado }]` — só contas com `ativo !== false` e `data_saldo_inicial <= ultimoDia`; `esperado = saldoConta(conta, movimentosFiltrados, ultimoDia)` arredondado; `ignorarAjustesDe` ('AAAA-MM' ou null) tira dos movimentos os `origem==='ajuste' && fechamento_mes===ignorarAjustesDe`.
  - `pendenciasDoMes({ mes, contasPagar, contasReceber, impostoEstimado: bool }) -> { pagar: [cp], receber: [cr], pagar_qtd, pagar_valor, receber_qtd, receber_valor, guia_pendente }` — CP/CR com `data_vencimento` no mês e `status !== 'Pago'`.
  - `maioresGastos(porGrupo, n=3) -> [{ grupo, rotulo, valor }]` — sem `imposto`, só valor > 0, decrescente; rótulos de `GRUPOS` (passados no parâmetro `grupos`).
  - `sugestoesDoMes({ resultado, entradas, meta, equilibrio, orcamento, porGrupo, porGrupoAnterior, rotuloAnterior, pendencias, impostoEstimado, rotuloMes, grupos }) -> [string]` — até 4, na ordem da spec.
  - `montarFoto({ mes, agoraISO, usuario, r, meta, contas, pendencias, sugestoes, anotacoes }) -> foto` (formato da spec, `id` = `'fech-' + mes`).
  - `mudancasDesdeFoto(foto, { r, saldos: { [conta_id]: valor } }) -> [{ tipo: 'resultado'|'conta', nome?, antes, agora }]` — compara em centavos: `entradas`, `saidas`, `imposto`, `resultado` (um item `resultado` quando qualquer um difere, com antes/agora do resultado) e, para cada conta da foto com `extrato != null`, `esperado + ajuste` × saldo atual (ajuste = `diferenca` se `acao==='ajuste'`, senão 0).
  - `mesParaFechar({ hoje, fechamentos, temContas }) -> 'AAAA-MM' | null` — mês anterior a `hoje` se `temContas` e ainda não fechado.

- [ ] **Step 1: Write the failing tests** (`tests/fechamento-core.test.js`, `const F = require('../js/fechamento-core.js')`)

```js
test('ultimo dia, mes anterior e rotulo', () => {
    assert.strictEqual(F.ultimoDiaMes('2026-02'), '2026-02-28');
    assert.strictEqual(F.ultimoDiaMes('2028-02'), '2028-02-29');
    assert.strictEqual(F.mesAnterior('2027-01'), '2026-12');
    assert.strictEqual(F.rotuloMes('2026-10'), 'outubro de 2026');
});
test('conferencia: so contas ativas que ja existiam; esperado no ultimo dia; ignora ajustes do proprio mes', () => {
    const saldoConta = (c, movs, ate) => c.saldo_inicial + movs.filter(m => m.conta_id === c.id && m.data <= ate).reduce((s, m) => s + (m.sentido === 'entrada' ? m.valor : -m.valor), 0);
    const contas = [
        { id: 1, nome: 'Banco', saldo_inicial: 100, data_saldo_inicial: '2026-09-01' },
        { id: 2, nome: 'Nova', saldo_inicial: 0, data_saldo_inicial: '2026-11-05' },
        { id: 3, nome: 'Velha', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', ativo: false }];
    const movimentos = [
        { conta_id: 1, data: '2026-10-10', sentido: 'entrada', valor: 50, origem: 'cr' },
        { conta_id: 1, data: '2026-11-02', sentido: 'entrada', valor: 999, origem: 'cr' },
        { conta_id: 1, data: '2026-10-31', sentido: 'saida', valor: 20, origem: 'ajuste', fechamento_mes: '2026-10' }];
    assert.deepStrictEqual(F.contasDaConferencia({ mes: '2026-10', contas, movimentos, saldoConta, ignorarAjustesDe: null }), [{ conta_id: 1, nome: 'Banco', esperado: 130 }]);
    assert.deepStrictEqual(F.contasDaConferencia({ mes: '2026-10', contas, movimentos, saldoConta, ignorarAjustesDe: '2026-10' }), [{ conta_id: 1, nome: 'Banco', esperado: 150 }]);
});
test('pendencias do mes: CP e CR vencidos no mes e nao pagos', () => {
    const p = F.pendenciasDoMes({ mes: '2026-10',
        contasPagar: [{ id: 1, valor: 100, status: 'Pendente', data_vencimento: '2026-10-05' }, { id: 2, valor: 50, status: 'Pago', data_vencimento: '2026-10-06' }, { id: 3, valor: 70, status: 'Pendente', data_vencimento: '2026-11-01' }],
        contasReceber: [{ id: 9, valor: 300, status: 'Pendente', data_vencimento: '2026-10-20' }], impostoEstimado: true });
    assert.deepStrictEqual([p.pagar_qtd, p.pagar_valor, p.receber_qtd, p.receber_valor, p.guia_pendente], [1, 100, 1, 300, true]);
});
test('maiores gastos: 3 maiores, sem imposto e sem zero', () => {
    const grupos = [{ id: 'fornecedores', rotulo: 'Fornecedores e materiais' }, { id: 'fixas', rotulo: 'Despesas fixas' }, { id: 'imposto', rotulo: 'Imposto' }, { id: 'taxas', rotulo: 'Taxas de cartão' }, { id: 'outros', rotulo: 'Outros' }];
    assert.deepStrictEqual(F.maioresGastos({ fornecedores: 500, fixas: 800, imposto: 900, taxas: 0, outros: 10 }, 3, grupos).map(g => g.grupo), ['fixas', 'fornecedores', 'outros']);
});
test('sugestoes: ordem da spec, no maximo 4', () => {
    const s = F.sugestoesDoMes({ resultado: -200, entradas: 1000, meta: 3000, equilibrio: { valor: 5000 },
        orcamento: [{ grupo: 'fixas', rotulo: 'Despesas fixas', faixa: 'estourou', falta: -150 }],
        porGrupo: { fornecedores: 400 }, porGrupoAnterior: { fornecedores: 200 }, rotuloAnterior: 'setembro',
        pendencias: { receber_valor: 300 }, impostoEstimado: true, rotuloMes: 'outubro', grupos: [{ id: 'fornecedores', rotulo: 'Fornecedores e materiais' }] });
    assert.strictEqual(s.length, 4);
    assert.strictEqual(s[0], 'O mês fechou no vermelho em R$ 200,00. Para empatar você precisa faturar R$ 5.000,00 (ponto de equilíbrio).');
    assert.strictEqual(s[1], 'Despesas fixas passou R$ 150,00 do orçamento.');
    assert.strictEqual(s[2], 'Faltaram R$ 2.000,00 para a meta.');
    assert.strictEqual(s[3], 'Fornecedores e materiais subiu 100% em relação a setembro.');
    assert.deepStrictEqual(F.sugestoesDoMes({ resultado: 10, entradas: 10, meta: 0, orcamento: [], porGrupo: {}, porGrupoAnterior: {}, pendencias: { receber_valor: 0 }, impostoEstimado: false, grupos: [] }), ['Nenhum ponto de atenção. Bom mês!']);
});
test('sugestao de alta exige > 30% e > R$ 100; atrasados e guia entram quando sobra espaco', () => {
    const base = { resultado: 10, entradas: 10, meta: 0, orcamento: [], porGrupoAnterior: { outros: 100 }, rotuloAnterior: 'setembro', grupos: [{ id: 'outros', rotulo: 'Outros' }], rotuloMes: 'outubro' };
    assert.deepStrictEqual(F.sugestoesDoMes({ ...base, porGrupo: { outros: 190 }, pendencias: { receber_valor: 0 }, impostoEstimado: false }), ['Nenhum ponto de atenção. Bom mês!']);
    assert.deepStrictEqual(F.sugestoesDoMes({ ...base, porGrupo: { outros: 100 }, pendencias: { receber_valor: 300 }, impostoEstimado: true }),
        ['R$ 300,00 de clientes em atraso — vale cobrar.', 'Lance a guia de imposto de outubro quando ela chegar.']);
});
test('foto e mudancas: em centavos; conta com ajuste conta o ajuste; conta nao conferida fica fora', () => {
    const r = { entradas: 1000, saidas: 600, imposto: { valor: 60, estimado: true }, resultado: 400, porGrupo: { fixas: 540, imposto: 60 } };
    const foto = F.montarFoto({ mes: '2026-10', agoraISO: '2026-11-03T10:00:00.000Z', usuario: 'Ana', r, meta: 2000,
        contas: [{ conta_id: 1, nome: 'Banco', esperado: 500, extrato: 480, diferenca: -20, acao: 'ajuste', motivo: 'tarifa' },
                 { conta_id: 2, nome: 'Caixa', esperado: 50, extrato: null, diferenca: null, acao: null, motivo: '' }],
        pendencias: { pagar_qtd: 0, pagar_valor: 0, receber_qtd: 0, receber_valor: 0, guia_pendente: true }, sugestoes: ['x'], anotacoes: 'ok' });
    assert.strictEqual(foto.id, 'fech-2026-10');
    assert.deepStrictEqual(foto.numeros, { entradas: 1000, saidas: 600, imposto: 60, imposto_estimado: true, resultado: 400, meta: 2000, por_grupo: { fixas: 540, imposto: 60 } });
    assert.deepStrictEqual(F.mudancasDesdeFoto(foto, { r, saldos: { 1: 480, 2: 999 } }), []);
    assert.deepStrictEqual(F.mudancasDesdeFoto(foto, { r: { ...r, saidas: 650, resultado: 350.004 }, saldos: { 1: 470 } }),
        [{ tipo: 'resultado', antes: 400, agora: 350.004 }, { tipo: 'conta', nome: 'Banco', antes: 480, agora: 470 }]);
});
test('mes para fechar: o anterior, se ha contas e ainda nao foi fechado', () => {
    assert.strictEqual(F.mesParaFechar({ hoje: '2026-11-01', fechamentos: [], temContas: true }), '2026-10');
    assert.strictEqual(F.mesParaFechar({ hoje: '2026-11-20', fechamentos: [{ mes: '2026-10' }], temContas: true }), null);
    assert.strictEqual(F.mesParaFechar({ hoje: '2026-11-20', fechamentos: [], temContas: false }), null);
});
```

- [ ] **Step 2: Run** `node --test tests/fechamento-core.test.js` — Expected: FAIL (`Cannot find module`).
- [ ] **Step 3: Implement** `js/fechamento-core.js` com as funções acima. Moeda nas frases: `'R$ ' + valor.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})`. Alta de grupo: `(atual - anterior)/anterior*100` arredondado para inteiro, só se anterior > 0, `> 30` e diferença `> 100`; rótulo do grupo vem de `grupos`. Orçamento: uma frase por item `faixa==='estourou'` com `-falta`. Frase 1 só com `equilibrio.valor > 0`; sem ele: `'O mês fechou no vermelho em R$ X.'`.
- [ ] **Step 4: Run** `node --test` — Expected: todos PASS (315 antigos + novos).
- [ ] **Step 5: Commit** `feat(financeiro): nucleo do fechamento do mes`

---

### Task 2: Núcleo do simulador (`SimuladorCore`)

**Files:**
- Create: `js/simulador-core.js`
- Test: `tests/simulador-core.test.js`

**Interfaces:**
- Consumes: nada (puro). A previsão vem por função injetada.
- Produces (em `SimuladorCore`):
  - `pagamentosDaCompra({ valor, forma: 'avista'|'parcelado'|'entrada', parcelas, entrada, dataCompra, dataPrimeira }) -> { ok: true, pagamentos: [{ data, valor, rotulo }] } | { ok: false, erro: string }` — à vista: 1 pagamento na `dataCompra` (rótulo `'À vista'`); parcelado: N mensais a partir de `dataPrimeira` (rótulo `'Parcela i/N'`); entrada: `'Entrada'` na `dataCompra` + N parcelas de `(valor-entrada)`. Parcela = `round((total/N)*100)/100`, a última absorve a diferença. Mês seguinte = mesmo dia (dia 31 → último dia do mês, sem pular mês). Erros (texto exato): `'Informe o valor da compra.'` (valor ≤ 0 ou NaN), `'Parcelas: de 2 a 48.'`, `'A entrada precisa ser maior que zero e menor que o valor.'`.
  - `pagamentosComoContas(pagamentos) -> [cp]` — `{ id: 'sim-'+i, status: 'Pendente', data_vencimento, valor, descricao: rotulo }` (para `previsaoSemanal`).
  - `deslocar(pagamentos, dias) -> pagamentos` (soma dias às datas).
  - `resultadoMedio(resultados: [number]) -> number|null` — média arredondada; `[]` → null.
  - `veredito({ semanasSem, semanasCom, folga, parcelaMensal, temParcelaAlem, resultadoMedio, ganhoMensal, valorTotal }) -> { cor: 'verde'|'amarelo'|'vermelho', titulo, frases: [string], menor: { saldo, inicio }, paybackMeses: number|null }`
  - `melhorData({ hoje, pagamentos, prever }) -> 'AAAA-MM-DD' | null` — `prever(pagamentosDeslocados) -> semanas`; tenta deslocar para cada início de semana `hoje + 7k` (k = 1..7), mantendo a distância entre os pagamentos; devolve o primeiro início em que nenhuma `saldo_final < 0`.

- [ ] **Step 1: Write the failing tests** (`tests/simulador-core.test.js`, `const S = require('../js/simulador-core.js')`)

```js
test('a vista, parcelado e entrada + parcelas; ultima absorve a diferenca', () => {
    assert.deepStrictEqual(S.pagamentosDaCompra({ valor: 1000, forma: 'avista', dataCompra: '2026-11-14' }).pagamentos, [{ data: '2026-11-14', valor: 1000, rotulo: 'À vista' }]);
    const p = S.pagamentosDaCompra({ valor: 1000, forma: 'parcelado', parcelas: 3, dataCompra: '2026-11-14', dataPrimeira: '2026-12-14' }).pagamentos;
    assert.deepStrictEqual(p.map(x => [x.data, x.valor, x.rotulo]), [['2026-12-14', 333.33, 'Parcela 1/3'], ['2027-01-14', 333.33, 'Parcela 2/3'], ['2027-02-14', 333.34, 'Parcela 3/3']]);
    const e = S.pagamentosDaCompra({ valor: 1000, forma: 'entrada', entrada: 400, parcelas: 2, dataCompra: '2026-11-14', dataPrimeira: '2026-12-14' }).pagamentos;
    assert.deepStrictEqual(e.map(x => [x.rotulo, x.valor]), [['Entrada', 400], ['Parcela 1/2', 300], ['Parcela 2/2', 300]]);
});
test('parcela no dia 31 cai no ultimo dia do mes curto', () => {
    const p = S.pagamentosDaCompra({ valor: 300, forma: 'parcelado', parcelas: 3, dataCompra: '2027-01-01', dataPrimeira: '2027-01-31' }).pagamentos;
    assert.deepStrictEqual(p.map(x => x.data), ['2027-01-31', '2027-02-28', '2027-03-31']);
});
test('validacoes com o texto da tela', () => {
    assert.strictEqual(S.pagamentosDaCompra({ valor: 0, forma: 'avista', dataCompra: '2026-11-14' }).erro, 'Informe o valor da compra.');
    assert.strictEqual(S.pagamentosDaCompra({ valor: 100, forma: 'parcelado', parcelas: 1, dataCompra: '2026-11-14', dataPrimeira: '2026-12-14' }).erro, 'Parcelas: de 2 a 48.');
    assert.strictEqual(S.pagamentosDaCompra({ valor: 100, forma: 'entrada', entrada: 100, parcelas: 2, dataCompra: '2026-11-14', dataPrimeira: '2026-12-14' }).erro, 'A entrada precisa ser maior que zero e menor que o valor.');
});
const sem = saldos => saldos.map((s, i) => ({ inicio: '2026-11-' + String(14 + 7 * i).padStart(2, '0'), saldo_final: s }));
test('veredito verde, amarelo por folga, amarelo por parcela, vermelho', () => {
    const v = x => S.veredito({ semanasSem: sem([5000]), folga: 1000, parcelaMensal: 0, temParcelaAlem: false, resultadoMedio: null, ganhoMensal: 0, valorTotal: 1000, ...x });
    assert.strictEqual(v({ semanasCom: sem([4000, 3000]) }).cor, 'verde');
    assert.strictEqual(v({ semanasCom: sem([4000, 800]) }).titulo, 'Cabe, mas aperta');
    assert.ok(v({ semanasCom: sem([4000, 800]) }).frases.includes('O caixa fica em R$ 800,00 na semana de 21/11.'));
    const p = v({ semanasCom: sem([4000, 3000]), temParcelaAlem: true, parcelaMensal: 500, resultadoMedio: 300 });
    assert.strictEqual(p.cor, 'amarelo');
    assert.ok(p.frases.includes('A parcela de R$ 500,00 é maior do que sobra em média por mês (R$ 300,00).'));
    const n = v({ semanasCom: sem([4000, -250]) });
    assert.deepStrictEqual([n.cor, n.titulo], ['vermelho', 'Não cabe agora']);
    assert.ok(n.frases.includes('O caixa fica negativo em R$ 250,00 na semana de 21/11.'));
    assert.ok(v({ semanasCom: sem([4000]), temParcelaAlem: true, parcelaMensal: 100, resultadoMedio: null }).frases.includes('Sem histórico para comparar a parcela com o que sobra por mês.'));
});
test('payback arredonda para cima', () => {
    const r = S.veredito({ semanasSem: sem([5000]), semanasCom: sem([4000]), folga: 0, parcelaMensal: 0, temParcelaAlem: false, resultadoMedio: null, ganhoMensal: 150, valorTotal: 1000 });
    assert.strictEqual(r.paybackMeses, 7);
    assert.ok(r.frases.includes('Se paga em 7 meses.'));
});
test('melhor data: primeira semana em que nada fica negativo; nenhuma -> null', () => {
    const pags = [{ data: '2026-11-14', valor: 1000, rotulo: 'À vista' }];
    const prever = ps => ps[0].data >= '2026-11-28' ? sem([100, 100]) : sem([-1, 100]);
    assert.strictEqual(S.melhorData({ hoje: '2026-11-14', pagamentos: pags, prever }), '2026-11-28');
    assert.strictEqual(S.melhorData({ hoje: '2026-11-14', pagamentos: pags, prever: () => sem([-1]) }), null);
});
test('resultado medio', () => {
    assert.strictEqual(S.resultadoMedio([100, 200, 400]), 233.33);
    assert.strictEqual(S.resultadoMedio([]), null);
});
```

- [ ] **Step 2: Run** `node --test tests/simulador-core.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `js/simulador-core.js`. Veredito: vermelho se algum `saldo_final < 0` em `semanasCom` (frase com a primeira semana negativa, `dd/mm` de `inicio`); senão amarelo se menor saldo `< folga` (frase "O caixa fica em …") ou se `temParcelaAlem && resultadoMedio != null && parcelaMensal > resultadoMedio`; senão verde. Títulos exatos: `'Cabe'`, `'Cabe, mas aperta'`, `'Não cabe agora'`. Payback só com `ganhoMensal > 0`: `Math.ceil(valorTotal/ganhoMensal)`, frase `'Se paga em N meses.'` (`'Se paga em 1 mês.'` no singular).
- [ ] **Step 4: Run** `node --test` — Expected: todos PASS.
- [ ] **Step 5: Commit** `feat(financeiro): nucleo do simulador de compra`

---

### Task 3: Dados, permissão nova, backup e inclusão dos núcleos

**Files:**
- Modify: `js/app.js` (árvore de módulos ~L39; papéis padrão ~L100-140; migração ~L222-255; `db` ~L270-285; `syncDB` ~L350-370; `FIN_TAB_MODULO` ~L1292; `_dadosExportacao` ~L7660; `importarDados` ~L7700)
- Modify: todas as `*.html` que incluem `js/resultado-core.js` (scripts novos + `?v=20261119a` em todos os `js`/`css` de todas as páginas)
- Test: `tests/e2e/financeiro-fase3-dados.spec.js`

**Interfaces:**
- Produces: `db.fechamentos_fin` (array, `sc_fin_fech`); permissão `financeiro.simulador` (rótulo `'Simular compra'`) na árvore, em `FIN_TAB_MODULO` (`simulador: 'financeiro.simulador'`), no papel Vendedor/Atendimento como `'sem_acesso'`, e nas duas listas da migração (`['financeiro.hoje','financeiro.extrato','financeiro.resultado','financeiro.simulador']`); backup `fechamentos_fin`; globais `FechamentoCore` e `SimuladorCore` no navegador.

- [ ] **Step 1: Write the failing e2e** (`financeiro-fase3-dados.spec.js`, padrão de `financeiro-fase2-config.spec.js`):
  - `'fechamentos entram no backup e voltam na importacao'`: semear `sc_fin_fech` com `[{ id: 'fech-2026-10', mes: '2026-10' }]`, `_dadosExportacao(false).fechamentos_fin` tem 1 item; importar um arquivo sem a chave → `db.fechamentos_fin` vira `[]`; com a chave → volta 1.
  - `'permissao financeiro.simulador nasce pela migracao com o nivel da Visao Geral'`: papel salvo sem a chave e com `financeiro.dashboard: visualizar` → após carregar, `financeiro.simulador.nivel === 'visualizar'`.
  - `'nucleos carregados'`: em `financeiro.html`, `typeof FechamentoCore === 'object' && typeof SimuladorCore === 'object'`.
- [ ] **Step 2: Run** o spec — Expected: FAIL.
- [ ] **Step 3: Implement** as mudanças listadas em Files/Interfaces.
- [ ] **Step 4: Run** o spec + `node --test` + `financeiro-fase2-*.spec.js` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(financeiro): dados do fechamento, permissao do simulador e backup`

---

### Task 4: Fechamento na aba Resultado do mês (passo a passo, foto, refazer, documento)

**Files:**
- Modify: `financeiro.html` (card novo `#res-fechamento` no topo do `#fin-resultado`, depois do card do mês)
- Modify: `js/app.js` (seção "FINANCEIRO — RESULTADO DO MES": `renderResultadoMes` chama `renderFechamentoCard(mes)`; funções novas abaixo)
- Modify: `css/style.css` (estilos `.fech-*`)
- Test: `tests/e2e/financeiro-fase3-fechamento.spec.js`

**Interfaces:**
- Consumes: Task 1 (`FechamentoCore.*`), Task 3 (`db.fechamentos_fin`), `CaixaCore.saldoConta`, `_resDados(mes)`, `resultadoFinanceiroDoMes(mes)`, `ResultadoCore.GRUPOS`, `getContasFin()`, `_novosIdsFin(db.movimentos_fin)`, `abrirDocModal(html, titulo, '', envioDocumentoInterno(...))`, `getUsuarioLogado()`/`nomeExibicao(u)`.
- Produces: `fechamentoDoMes(mes) -> foto|null`; `mudancasDoFechamento(mes) -> [mudança]` (usa `FechamentoCore.mudancasDesdeFoto` com `r` atual e saldos atuais de cada conta no último dia); `abrirFechamentoMes(mes)` (abre o passo a passo); `refazerFechamentoMes(mes)`; `verFechamentoMes(mes)`; `renderFechamentoCard(mes)`.

Comportamento (texto exato da spec):
- Card `#res-fechamento`: mês atual ou futuro → nada. Mês passado aberto → botão `#fech-btn-fechar` "🔒 Fechar <rótulo>" (só com `financeiro.resultado` completo). Mês fechado → selo "🔒 Fechado em dd/mm/aaaa por <nome>", botões "Ver fechamento" e "Refazer fechamento" (completo), e, se `mudancasDoFechamento(mes).length`, aviso `.fech-mudou` "⚠ <Mês> mudou depois do fechamento: resultado era R$ X, agora é R$ Y" (ou "saldo de <conta> era R$ X, agora R$ Y"), uma linha por mudança.
- Passo a passo em modal `#fech-modal` (3 telas, botões "Voltar"/"Continuar"):
  1. Tabela das contas (`contasDaConferencia`, com `ignorarAjustesDe: null`): esperado, input `.fech-extrato` (vazio = "não conferida"), diferença ao vivo; se ≠ 0, rádios "Lançar ajuste" (exige motivo, input `.fech-motivo`) / "Deixar anotado". Dica fixa com atalhos para A Pagar e A Receber. "Continuar" bloqueia se "Lançar ajuste" sem motivo (mensagem "Informe o motivo do ajuste.").
  2. Pendências (`pendenciasDoMes`, `impostoEstimado = r.imposto.estimado`), cada item com atalho (`mostrarTabFinanceiro('pagar'|'receber')` + fecha o modal); sem nada: "Nada pendente neste mês."
  3. Resumo: números de `_resDados(mes)`, comparação com o mês anterior (resultado e entradas em R$ e %), `maioresGastos`, orçamentos estourados, `sugestoesDoMes` e textarea `#fech-anotacoes`. Botão `#fech-confirmar` "🔒 Fechar <rótulo>".
- Confirmar (protegido contra duplo clique): cria os ajustes, grava a foto (`montarFoto`, `usuario = nomeExibicao(getUsuarioLogado())`), `syncDB()`, fecha o modal, re-renderiza e abre `verFechamentoMes(mes)`.
- Refazer: `showConfirm('Refazer o fechamento de <rótulo>? A foto e os ajustes lançados nele serão apagados.', …)` → remove a foto e os movimentos `origem==='ajuste' && fechamento_mes===mes`, `syncDB()`, abre o passo a passo.
- Documento: `abrirDocModal(html, 'Fechamento de <rótulo>', '', envioDocumentoInterno('Fechamento de <rótulo>', 'Fechamento-<AAAA-MM>'))`, sempre a partir da foto, com o aviso de mudança quando houver.

- [ ] **Step 1: Write the failing e2e** (relógio fixo `page.clock.install({ time: new Date('2026-11-05T10:00:00') })`; conta "Banco" com saldo inicial 1000 em 2026-09-01; um CR pago de 500 em 2026-10-10 com movimento `origem:'cr'`; uma CP paga de 200 em 2026-10-15 com movimento `origem:'cp'`; uma CP pendente de 80 vencida em 2026-10-20):
  - `'mes atual nao tem botao; outubro tem "🔒 Fechar outubro de 2026"'`.
  - `'passo 1: esperado 1300, extrato 1.280,00 mostra diferenca −20 e exige motivo para ajustar'`.
  - `'fechar com ajuste: cria movimento de ajuste, nao muda o resultado, grava a foto e abre o documento com Enviar'` — movimento `{ origem:'ajuste', fechamento_mes:'2026-10', data:'2026-10-31', sentido:'saida', valor:20 }`; `resultadoFinanceiroDoMes('2026-10').resultado` igual antes e depois; `db.fechamentos_fin[0].contas[0]` tem `extrato: 1280, diferenca: -20, acao: 'ajuste'`; `#doc-modal-paper` contém "Fechamento de outubro de 2026"; `#btn-enviar-doc` visível.
  - `'pendencias listam a CP de 80 com atalho'`.
  - `'duplo clique em Fechar grava uma foto e um ajuste so'`.
  - `'lancar com data de outubro depois do fechamento mostra o aviso de mudanca; pagar em novembro uma conta de outubro nao mostra'`.
  - `'refazer apaga a foto e so os ajustes de outubro'` — semear também um ajuste `fechamento_mes:'2026-09'`, que continua.
  - `'sem permissao completa: ve o selo, nao ve Fechar nem Refazer'`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** conforme acima.
- [ ] **Step 4: Run** este spec + `financeiro-fase2-*.spec.js` + `node --test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(financeiro): fechamento do mes no Resultado do mes`

---

### Task 5: Tela Hoje — tarefa de fechar o mês e aviso de mudança

**Files:**
- Modify: `js/app.js` (`renderHoje`, junto do `avisoOrc`)
- Test: `tests/e2e/financeiro-fase3-hoje.spec.js`

**Interfaces:**
- Consumes: `FechamentoCore.mesParaFechar`, `fechamentoDoMes`, `mudancasDoFechamento`, `abrirFechamentoMes` (Task 4).
- Produces: bloco `#hoje-fechamento` no topo das tarefas, só para quem tem `financeiro.resultado` visualizar.

Comportamento: `mesParaFechar({ hoje, fechamentos: db.fechamentos_fin, temContas: getContasFin().length > 0 })` → linha "Feche o mês de <rótulo>" com botão "Fechar agora" (completo: `mostrarTabFinanceiro('resultado')`, `renderResultadoMes(mes)`, `abrirFechamentoMes(mes)`; visualizar: só leva à aba). Se o mês anterior está fechado e `mudancasDoFechamento` não está vazio → linha "⚠ <Mês> mudou depois do fechamento" com botão "Ver" (leva ao Resultado daquele mês).

- [ ] **Step 1: Write the failing e2e**: `'dia 1 de novembro mostra "Feche o mês de outubro de 2026" e o botao abre o passo a passo'`; `'sem contas configuradas nao mostra'`; `'outubro fechado some; com mudanca depois mostra o aviso'`; `'sem permissao do Resultado nao mostra'`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** este spec + `financeiro-fase1-hoje.spec.js` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(financeiro): tela Hoje lembra de fechar o mes`

---

### Task 6: Aba "🧮 Simular compra" e "Lançar no A Pagar"

**Files:**
- Modify: `financeiro.html` (botão de aba `data-tab="simulador"` depois de "Resultado do mês"; painel `#fin-simulador`)
- Modify: `js/app.js` (`mostrarTabFinanceiro` chama `renderSimulador()`; funções novas numa seção "FINANCEIRO — SIMULAR COMPRA")
- Modify: `css/style.css` (`.sim-*`, uma coluna no celular)
- Test: `tests/e2e/financeiro-fase3-simulador.spec.js`

**Interfaces:**
- Consumes: Task 2 (`SimuladorCore.*`), `CaixaCore.previsaoSemanal`, `CaixaCore.saldosHoje`, `ResultadoCore.despesasFixasDoMes`, `resultadoFinanceiroDoMes`, `mesRefDe`, `getMeiosPag()`, `getContasFin()`.
- Produces: `renderSimulador()`, `simularCompra()`, `lancarSimulacaoNoPagar()`.

Comportamento:
- Formulário: `#sim-desc`, `#sim-valor`, rádios `name="sim-forma"` (`avista`/`parcelado`/`entrada`), `#sim-parcelas`, `#sim-entrada`, `#sim-data` (padrão hoje), `#sim-primeira` (padrão hoje + 30 dias), `#sim-ganho`, `#sim-categoria` (opções e rótulos iguais a `#cpm-categoria`), `#sim-credor`. Botões "Simular" e "Limpar".
- Simular: previsão "sem" = mesma chamada da tela Hoje (`saldoHoje` = total de `CaixaCore.saldosHoje(contasAtivas, movs, hoje)`); "com" = a mesma, com `contasPagar: db.contas_pagar.concat(SimuladorCore.pagamentosComoContas(pagamentos))`. `folga` = metade de `despesasFixasDoMes` do mês atual. `resultadoMedio` = `SimuladorCore.resultadoMedio` dos `resultado` dos 3 meses mais recentes antes do atual (até 12 para trás) que tenham algum movimento (entradas ou saídas ≠ 0). `temParcelaAlem` = algum pagamento depois do `fim` da 8ª semana; `parcelaMensal` = valor da 1ª parcela. Vermelho → `melhorData` com `prever` = a mesma previsão "com" usando os pagamentos deslocados; frase "Comprando a partir de dd/mm, cabe." ou "Nas próximas 8 semanas não cabe — tente parcelar em mais vezes ou dar uma entrada menor."
- Resultado `#sim-resultado`: título com a cor (`.sim-verde/.sim-amarelo/.sim-vermelho`), frases, tabela de 8 semanas (Semana · Saldo sem a compra · Saldo com a compra, negativos com `.res-neg`).
- Erro de validação: mostra o texto do núcleo em `#sim-erro`, sem resultado.
- "Lançar no A Pagar" `#sim-lancar` (só `financeiro.simulador` completo, só depois de simular sem erro): `showConfirm('Lançar <descrição do que vai>' …)` — texto: à vista "Lançar 1 conta no A Pagar?"; parcelado "Lançar N parcelas no A Pagar?"; entrada "Lançar 1 entrada + N parcelas no A Pagar?". Cria CPs como o parcelado do A Pagar (`tipo:'variavel'`, `status:'Pendente'`, categoria/credor do form, `...mesRefDe(data)`): entrada/à vista uma CP com a descrição; parcelas com `lancamento_pai_id`, `parcelado:true`, `numero_parcelas`, `parcela_atual`, descrição `'<desc> (parcela i/N)'`. Protegido contra duplo clique; depois `syncDB()`, `toast('Compra lançada no A Pagar.')`, limpa o resultado.

- [ ] **Step 1: Write the failing e2e** (relógio fixo 2026-11-14; conta "Banco" com `saldo_inicial` 3000 em `data_saldo_inicial` 2026-11-11 e nenhum movimento; uma CP pendente de 1000 vencendo 2026-11-20; uma CP `tipo:'fixo'`, `categoria:'aluguel'`, de 2000, **paga** em 2026-11-10 → folga 1000 e saldo de hoje 3000; com a CP de 1000 a 1ª semana termina em 2000):
  - `'aba aparece com a permissao e some sem ela'`.
  - `'a vista de 500: Cabe, tabela com 8 semanas'`.
  - `'a vista de 1500: Cabe, mas aperta, caixa fica em R$ 500,00'`.
  - `'a vista de 2500: Não cabe agora, com a frase de melhor data ou a de nenhuma'`.
  - `'data da compra no passado cai na primeira semana'` (Review Focus 5).
  - `'parcelado 10x com resultado medio menor que a parcela: amarelo com a frase da parcela'`.
  - `'ganho mensal 150 em compra de 1000: Se paga em 7 meses.'`.
  - `'validacao: valor vazio e parcelas 1 mostram o texto do nucleo'`.
  - `'Lançar no A Pagar: entrada + 3 parcelas cria 4 CPs com os campos do parcelado; duplo clique cria so 4'`.
  - `'visualizar simula mas nao ve Lançar no A Pagar'`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** este spec + `financeiro-fase1-hoje.spec.js` + `node --test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(financeiro): simulador vale a pena comprar`

---

### Task 7: Documentação, pendências e regressão completa

**Files:**
- Modify: `FUNCIONALIDADES_SCTECH.txt` (seção 10: subseções novas "Fechamento do mês" e "Simular compra", no estilo das 10.x existentes; LF)
- Modify: `docs/superpowers/pendencias-financeiro.md` (seção "Da Fase 3", mesmo que vazia: "Nenhuma por enquanto.")

- [ ] **Step 1:** Escrever a documentação de uso (o que cada tela mostra, textos dos botões, permissões, que o ajuste não muda o resultado, a regra do aviso de mudança, a régua de "aperta").
- [ ] **Step 2: Run** `npm test` e a bateria e2e completa — Expected: 0 falhas (os 30 pulados do simulador da galeria continuam pulados).
- [ ] **Step 3: Commit** `docs(financeiro): fase 3 na documentacao de uso`
