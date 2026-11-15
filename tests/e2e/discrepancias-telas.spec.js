// D1, D2, D4, D6, D7, D8 - telas que contavam errado (roteiro de testes de 15/11/2026).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const hojeLocal = () => new Date().toLocaleDateString('sv-SE');

const CAT = [{ id: 1, nome: 'TRICO HERA', referencia: 'TH01', preco_custo: 80, preco: 120, estoque_infinito: false }];
const ROLO = [{ id: 500, tecido_id: 1, lote: 'TH01', metragem_inicial: 10, metragem_atual: 2.05, data_entrada: '2026-01-01' }];
const amb = consumo => [{ id: 1, nome: 'Sala', tecidos: [{ tecidoId: 1, tecidoNome: 'TRICO HERA', consumo_linear: consumo }] }];
const ped = (id, status, extra) => ({ id, clienteId: 1, clienteNome: 'Ana', status, valor: 1100, valor_recebido: 0,
    data_criacao: Date.now(), ambientes: amb(7.95), itens: [], timeline: [], ...(extra || {}) });

test('D1: estoque futuro nao conta de novo o tecido ja baixado', async ({ page }) => {
    await entrar(page, BASE, { sc_cat: CAT, sc_est: ROLO, sc_ped: [
        ped(26001, 'Na Costura', { baixa_tecido_realizada: true }),
        ped(26002, 'Medição', { ambientes: amb(1) })
    ] });
    await page.goto(BASE + '/estoque.html');
    await page.evaluate(() => mostrarTabEstoque('futuro'));
    const linha = page.locator('#tab-futuro tbody tr');
    await expect(linha).toHaveCount(1);
    const cel = linha.locator('td');
    await expect(cel.nth(1)).toHaveText('1');
    await expect(cel.nth(2)).toHaveText('1.00 m');
    await expect(cel.nth(3)).toHaveText('2.05 m');
    await expect(cel.nth(4)).toHaveText('+1.05 m');
});

test('D1: so o pedido ja baixado: sem consumo previsto, sem falta', async ({ page }) => {
    await entrar(page, BASE, { sc_cat: CAT, sc_est: ROLO, sc_ped: [ped(26001, 'Na Costura', { baixa_tecido_realizada: true })] });
    await page.goto(BASE + '/estoque.html');
    await page.evaluate(() => mostrarTabEstoque('futuro'));
    await expect(page.locator('#tab-futuro')).toContainText('Nenhum tecido consumido');
    await expect(page.locator('#tab-futuro')).not.toContainText('-5.90');
});

test('D2: card do kanban sem "Sem estoque" depois da baixa do tecido', async ({ page }) => {
    await entrar(page, BASE, { sc_cat: CAT, sc_est: ROLO, sc_ped: [
        ped(26001, 'Pronto p/ Instalação', { baixa_tecido_realizada: true }),
        ped(26002, 'Medição')
    ] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => renderKanban());
    const cards = page.locator('.kanban-card');
    const baixado = cards.filter({ hasText: '#26001' }).first();
    const naoBaixado = cards.filter({ hasText: '#26002' }).first();
    await expect(naoBaixado).toContainText('Sem estoque');
    await expect(baixado).not.toContainText('Sem estoque');
});

test('D6: ticket medio so conta pedidos instalados', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [ped(26001, 'Na Costura')] });
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#met-ticket')).toHaveText('—');
    await page.evaluate(() => {
        db.pedidos.push({ id: 26002, clienteId: 1, status: 'Instalado', valor: 2000, data_instalado: Date.now(), ambientes: [], itens: [], timeline: [] });
        db.pedidos.push({ id: 26003, clienteId: 1, status: 'Aguardando Financeiro', valor: 1000, ambientes: [], itens: [], timeline: [] });
        renderMetrics();
    });
    await expect(page.locator('#met-ticket')).toHaveText('R$ 1500.00');
});

test('D7: contas a receber usa a data do pedido, nao o numero', async ({ page }) => {
    const antigo = Date.now() - 100 * 86400000;
    await entrar(page, BASE, { sc_ped: [
        ped(26001, 'Na Costura'),
        ped(26002, 'Na Costura', { data_criacao: antigo })
    ], sc_cli: [{ id: 1, nome: 'Ana' }] });
    await page.goto(BASE + '/relatorios.html');
    await page.evaluate(() => { mostrarTabRel('recebiveis'); renderRelRecebiveis(); });
    const novo = page.locator('#tb-rel-rec tr').filter({ hasText: '26001' });
    const velho = page.locator('#tb-rel-rec tr').filter({ hasText: '26002' });
    await expect(novo).toContainText('≤30 dias');
    await expect(velho).toContainText('+90 dias');
});

test('D8: despesas fixas mostra o nome da categoria', async ({ page }) => {
    await entrar(page, BASE, { sc_df: [
        { id: 1, descricao: 'Aluguel da loja', categoria: 'aluguel', dia_vencimento: 5, valor: 1500 },
        { id: 2, descricao: 'Luz', categoria: 'conta', dia_vencimento: 10, valor: 200 }
    ] });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => renderDespesasFixas());
    const l1 = page.locator('#tb-despesas-fixas tr').filter({ hasText: 'Aluguel da loja' });
    await expect(l1.locator('td').nth(1)).toHaveText('Aluguel');
    const l2 = page.locator('#tb-despesas-fixas tr').filter({ hasText: 'Luz' });
    await expect(l2.locator('td').nth(1)).toHaveText('Conta (luz, internet…)');
});

test('D4: gerencial mostra os mesmos numeros da visao geral (recebido e lucro)', async ({ page }) => {
    const hoje = hojeLocal();
    await entrar(page, BASE, {
        sc_empresa: { razao_social: 'X', regime_tributario: 'simples', aliquota_estimada: 10 },
        sc_cr: [{ id: 1, pedido_id: 26001, valor: 440, status: 'Pago', data_pagamento: hoje, data_vencimento: hoje }],
        sc_cp: [{ id: 1, descricao: 'Tecido', valor: 100, status: 'Pago', categoria: 'tecido', data_pagamento: hoje, data_vencimento: hoje }]
    });
    await page.goto(BASE + '/dashboards.html?dash=gerencial');
    // Visao Geral: 440 recebido, saidas 100 + imposto estimado 44 -> lucro 296.
    const esperado = await page.evaluate(() => {
        _finPeriodo = 'mes';
        const d = dinheiroDoPeriodoFin();
        return { recebido: d.recebido, lucro: d.lucro };
    });
    expect(esperado).toEqual({ recebido: 440, lucro: 296 });
    const kpis = page.locator('.dkpi');
    const fat = kpis.filter({ hasText: 'Faturamento' });
    const luc = kpis.filter({ hasText: 'Lucro (Caixa)' });
    await expect(fat.locator('.dkpi-value')).toContainText('440');
    await expect(luc.locator('.dkpi-value')).toContainText('296');
    await expect(luc.locator('.dkpi-sub')).toContainText('67');
});

test('D4: graficos do gerencial usam a mesma conta dos KPIs (cartao pelo repasse + imposto)', async ({ page }) => {
    const hoje = hojeLocal();
    const prox = new Date(); prox.setDate(1); prox.setMonth(prox.getMonth() + 1);
    const proxStr = prox.toLocaleDateString('sv-SE');
    await entrar(page, BASE, {
        sc_empresa: { razao_social: 'X', regime_tributario: 'simples', aliquota_estimada: 10 },
        sc_cr: [{ id: 1, pedido_id: 26001, valor: 440, status: 'Pago', data_pagamento: hoje, data_vencimento: hoje,
            cartao: { tipo: 'credito', vezes: 2, repasses: [{ data: hoje, bruto: 220 }, { data: proxStr, bruto: 220 }] } }],
        sc_cp: [{ id: 1, descricao: 'Tecido', valor: 100, status: 'Pago', categoria: 'tecido', data_pagamento: hoje, data_vencimento: hoje }]
    });
    await page.goto(BASE + '/dashboards.html?dash=gerencial');
    // Mes atual: entra so o repasse de hoje (220); saidas 100 + imposto estimado 22.
    await expect(page.locator('.dkpi').filter({ hasText: 'Faturamento' }).locator('.dkpi-value')).toContainText('220');
    await expect(page.locator('.dkpi').filter({ hasText: 'Lucro (Caixa)' }).locator('.dkpi-value')).toContainText('98');
    const g = await page.evaluate(() => {
        const c = _dashCharts.find(x => x.canvas.id === 'dc-ger-fin');
        const n = c.data.datasets[0].data.length - 1;
        return { ent: c.data.datasets[0].data[n], sai: c.data.datasets[1].data[n], saldo: c.data.datasets[2].data[n],
            cat: _dashCharts.find(x => x.canvas.id === 'dc-ger-categ').data.datasets[0].data.reduce((a, b) => a + b, 0) };
    });
    expect(g).toEqual({ ent: 220, sai: 122, saldo: 98, cat: 122 });
});

test('D4: periodo personalizado: KPIs do gerencial iguais aos da visao geral', async ({ page }) => {
    const hoje = hojeLocal();
    await entrar(page, BASE, {
        sc_empresa: { razao_social: 'X', regime_tributario: 'simples', aliquota_estimada: 10 },
        sc_cr: [{ id: 1, pedido_id: 26001, valor: 440, status: 'Pago', data_pagamento: hoje, data_vencimento: hoje }],
        sc_cp: [{ id: 1, descricao: 'Tecido', valor: 100, status: 'Pago', categoria: 'tecido', data_pagamento: hoje, data_vencimento: hoje }]
    });
    await page.goto(BASE + '/dashboards.html?dash=gerencial');
    await page.selectOption('#df-periodo', 'custom');
    await page.fill('#df-ini', hoje);
    await page.fill('#df-fim', hoje);
    await page.getByRole('button', { name: 'Aplicar' }).click();
    const vg = await page.evaluate(([i, f]) => { _finPeriodo = 'custom'; _finDataIni = i; _finDataFim = f; const d = dinheiroDoPeriodoFin(); return { recebido: d.recebido, lucro: d.lucro }; }, [hoje, hoje]);
    expect(vg.recebido).toBe(440);
    const fmt = v => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(v);
    await expect(page.locator('.dkpi').filter({ hasText: 'Faturamento' }).locator('.dkpi-value')).toContainText(fmt(vg.recebido));
    await expect(page.locator('.dkpi').filter({ hasText: 'Lucro (Caixa)' }).locator('.dkpi-value')).toContainText(fmt(Math.abs(vg.lucro)));
});

// Revisao final ----------------------------------------------------------------

test('estoque futuro: o cabecalho conta so os pedidos com tecido a baixar', async ({ page }) => {
    await entrar(page, BASE, { sc_cat: CAT, sc_est: ROLO, sc_ped: [
        ped(26001, 'Na Costura', { baixa_tecido_realizada: true }),
        ped(26002, 'Medição', { ambientes: amb(1) }),
        ped(26003, 'Medição', { ambientes: [] })
    ] });
    await page.goto(BASE + '/estoque.html');
    await page.evaluate(() => mostrarTabEstoque('futuro'));
    await expect(page.locator('#tab-futuro p').first()).toContainText('1 pedido(s) em produção com tecido a baixar');
});

test('aging dos orcamentos: numero do pedido nao vira data', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [
        { id: 26001, clienteId: 1, clienteNome: 'Ana', status: 'Orçamento', valor: 100, ambientes: [], itens: [], timeline: [] }
    ] });
    await page.goto(BASE + '/dashboards.html?dash=comercial');
    await expect(page.locator('.dkpi').filter({ hasText: 'Aging Médio' }).locator('.dkpi-value')).toHaveText('0d');
});

test('gerencial: categoria do imposto com o mesmo nome do Resultado (estimado)', async ({ page }) => {
    const hoje = hojeLocal();
    await entrar(page, BASE, {
        sc_empresa: { razao_social: 'X', regime_tributario: 'simples', aliquota_estimada: 10 },
        sc_cr: [{ id: 1, pedido_id: 26001, valor: 440, status: 'Pago', data_pagamento: hoje, data_vencimento: hoje }],
        sc_cp: [{ id: 1, descricao: 'Tecido', valor: 100, status: 'Pago', categoria: 'tecido', data_pagamento: hoje, data_vencimento: hoje }]
    });
    await page.goto(BASE + '/dashboards.html?dash=gerencial');
    await expect.poll(() => page.evaluate(() => (_dashCharts.find(x => x.canvas.id === 'dc-ger-categ') || { data: { labels: [] } }).data.labels))
        .toEqual(['Fornecedores e materiais', 'Imposto (estimado)']);
});
