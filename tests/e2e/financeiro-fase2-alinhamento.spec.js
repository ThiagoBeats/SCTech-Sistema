// Financeiro Fase 2, tarefa 4: Visao Geral pela mesma regra do Resultado do mes
// (pela data em que o dinheiro entra) e aviso de orcamento estourado na tela Hoje.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const HOJE = iso(new Date());
const mesMais = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.getFullYear() + '-' + p2(d.getMonth() + 1); };
const ultimoDia = mes => mes + '-' + p2(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate());
const M = mesMais(-1);            // mes fechado em teste
const dia = (mes, d) => mes + '-' + p2(d);

const CONTAS = [
    { id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true },
    { id: 11, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true }
];
const crPago = (id, valor, data, extra) => ({ id, pedido_id: 100 + id, cliente_nome: 'Cli ' + id, descricao: 'Pedido ' + id, valor, data_vencimento: data, data_pagamento: data, status: 'Pago', parcela_tipo: 'saldo', ...(extra || {}) });
const cpPago = (id, categoria, valor, data, extra) => ({ id, descricao: categoria + ' ' + id, categoria, tipo: 'variavel', valor, data_vencimento: data, data_pagamento: data, status: 'Pago', ...(extra || {}) });
const mov = (id, conta_id, data, sentido, valor, origem, origem_id, descricao) => ({ id, conta_id, data, sentido, valor, origem, origem_id, grupo_id: null, descricao });

// Mes M: cartao 3x (1 repasse no mes), recebimento antigo sem movimento, recebimento em dinheiro,
// transferencia entre contas, tecido pago, guia de imposto de referencia M paga no mes e uma CP em aberto.
const REPASSES = [dia(M, 5), dia(mesMais(0), 5), dia(mesMais(1), 5)];
const SEED_M = {
    sc_contas_fin: CONTAS,
    sc_empresa: { aliquota_estimada: 6 },
    sc_cr: [crPago(1, 3000, dia(M, 5)), crPago(2, 2000, dia(M, 15)), crPago(3, 500, dia(M, 20))],
    sc_cp: [
        ...REPASSES.map((d, i) => cpPago(1 + i, 'taxa_cartao', 30, d, { origem_cr_id: 1 })),
        cpPago(4, 'tecido', 800, dia(M, 18)),
        cpPago(5, 'imposto', 150, dia(M, 25), { mes_referencia: M }),
        { id: 6, descricao: 'Tecido em aberto', categoria: 'tecido', tipo: 'variavel', valor: 999, data_vencimento: dia(M, 20), data_pagamento: null, status: 'Atrasado' }
    ],
    sc_mov_fin: [
        ...REPASSES.map((d, i) => mov(1 + i, 10, d, 'entrada', 1000, 'cr', 1, 'Pedido 1 (cartão ' + (i + 1) + '/3)')),
        ...REPASSES.map((d, i) => mov(4 + i, 10, d, 'saida', 30, 'cp', 1 + i, 'Taxa de cartão')),
        mov(7, 11, dia(M, 20), 'entrada', 500, 'cr', 3, 'Pedido 3'),
        mov(8, 10, dia(M, 12), 'saida', 400, 'transferencia', null, 'Transferência para Caixa'),
        mov(9, 11, dia(M, 12), 'entrada', 400, 'transferencia', null, 'Transferência de Banco'),
        mov(10, 10, dia(M, 18), 'saida', 800, 'cp', 4, 'tecido 4'),
        mov(11, 10, dia(M, 25), 'saida', 150, 'cp', 5, 'imposto 5')
    ]
};

async function visaoGeralDoMes(page, mes) {
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await page.click('.fin-periodo-btn[data-p="custom"]');
    await page.fill('#fin-custom-ini', mes + '-01');
    await page.fill('#fin-custom-fim', ultimoDia(mes));
    await page.click('#fin-custom-range button');
}
const kpi = (page, txt) => page.locator('#fin-kpis2 .fin-kpi', { hasText: txt });

test('mesmo mes: Visao Geral = Resultado do mes = Extrato (sem transferencias)', async ({ page }) => {
    await entrar(page, BASE, SEED_M);
    await page.goto(BASE + '/financeiro.html');

    // Resultado do mes
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await page.fill('#res-mes', M);
    await page.locator('#res-mes').dispatchEvent('change');
    await expect(page.locator('#res-entradas')).toHaveText('R$ 3.500,00');
    await expect(page.locator('#res-saidas')).toHaveText('R$ 980,00');

    // Visao Geral no mesmo mes
    await visaoGeralDoMes(page, M);
    await expect(kpi(page, 'Total Recebido')).toContainText('R$ 3.500,00');
    await expect(kpi(page, 'Lucro')).toContainText('R$ 2.520,00');
    const evol = await page.evaluate(() => _chartFinEvolucao.data.datasets.map(d => d.data[10]));
    expect(evol).toEqual([3500, 980, 2520]);
    const combo = await page.evaluate(() => _chartFinCombo.data.datasets.slice(0, 2).map(d => Math.round(d.data.reduce((s, v) => s + v, 0) * 100) / 100));
    expect(combo).toEqual([3500, 980]);
    await expect(page.locator('#fin-dashboard')).toContainText('pela data em que o dinheiro entra');

    // Extrato do mesmo mes: as mesmas entradas e saidas, fora as transferencias.
    // O recebimento antigo sem movimento (2.000) nao passou por conta nenhuma, entao nao aparece no Extrato.
    await page.locator('.fin-tab-btn[data-tab="extrato"]').click();
    await page.fill('#extrato-mes', M);
    await page.locator('#extrato-mes').dispatchEvent('change');
    await expect(page.locator('#extrato-linhas tr.extrato-linha').first()).toBeVisible();
    const ext = await page.evaluate(() => {
        const n = s => Number((s || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        let e = 0, s = 0;
        document.querySelectorAll('#extrato-linhas tr.extrato-linha').forEach(tr => {
            if (tr.cells[1].textContent.includes('Transferência')) return;
            e += n(tr.cells[3].textContent); s += n(tr.cells[4].textContent);
        });
        return [Math.round(e * 100) / 100, Math.round(s * 100) / 100];
    });
    expect(ext).toEqual([3500 - 2000, 980]);
});

test('meta da Visao Geral usa o padrao quando o mes nao tem ajuste', async ({ page }) => {
    const mesAt = mesMais(0);
    const dados = {
        sc_contas_fin: CONTAS,
        sc_empresa: { meta_faturamento_padrao: 5000 },
        sc_fin_metas: { [mesAt]: 0 },
        sc_cr: [crPago(1, 1000, HOJE)],
        sc_cp: [cpPago(1, 'taxa_cartao', 50, HOJE, { origem_cr_id: 1 })]
    };
    await entrar(page, BASE, dados);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    const prog = page.locator('#fin-meta-progress');
    await expect(prog).toContainText('Meta: R$ 5.000,00');
    await expect(prog).toContainText('Faturado: R$ 950,00');

    await entrar(page, BASE, { ...dados, sc_fin_metas: { [mesAt]: 8000 } });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(prog).toContainText('Meta: R$ 8.000,00');
    // Ajuste vazio = sem ajuste: volta para o padrao.
    await page.click('#fin-meta-edit-btn');
    await page.fill('#fin-meta-valor', '');
    await page.click('#fin-meta-edit-row button');
    await expect(prog).toContainText('Meta: R$ 5.000,00');
    const metas = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_fin_metas')));
    expect(metas[mesAt]).toBeUndefined();
});

test('grafico de despesas inclui taxa de cartao e imposto', async ({ page }) => {
    await entrar(page, BASE, SEED_M);
    await page.goto(BASE + '/financeiro.html');
    await visaoGeralDoMes(page, M);
    await expect(kpi(page, 'Total Recebido')).toContainText('R$');
    const desp = await page.evaluate(() => {
        const c = _chartFinDesp;
        const o = {};
        c.data.labels.forEach((l, i) => { o[l] = c.data.datasets[0].data[i]; });
        return o;
    });
    // Pagas no mes: tecido 800, taxa do repasse do mes 30, imposto pela referencia 150. A CP em aberto fica de fora.
    expect(desp).toEqual({ 'Fornecedores e materiais': 800, 'Taxas de cartão': 30, 'Imposto': 150 });
});

test('Hoje mostra orcamento estourado so com permissao', async ({ page }) => {
    const mesAt = mesMais(0);
    const dados = {
        sc_contas_fin: CONTAS,
        sc_empresa: { orcamento_padrao: { fornecedores: 500, fixas: 2000 } },
        sc_cp: [cpPago(1, 'tecido', 800, HOJE), cpPago(2, 'aluguel', 1500, HOJE, { tipo: 'fixo' })]
    };
    await entrar(page, BASE, dados);
    await page.goto(BASE + '/financeiro.html');
    const aviso = page.locator('#hoje-orcamento');
    await expect(aviso).toHaveText('Orçamento de Fornecedores e materiais estourado: R$ 300,00 acima');
    await expect(page.locator('#hoje-tarefas')).toContainText('Tudo em dia');

    // Ajuste do mes acima do gasto: nao estourou.
    await entrar(page, BASE, { ...dados, sc_fin_orcamento_mes: { [mesAt]: { fornecedores: 1000 } } });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#hoje-tarefas')).toContainText('Tudo em dia');
    await expect(aviso).toHaveCount(0);

    // Sem permissao de ver o Resultado do mes: nada.
    const nivel = n => ({ nivel: n, acoes_restritas: [] });
    const pap = [{ id: 1, nome: 'Restrito', permissoes: { financeiro: nivel('completo'), 'financeiro.resultado': nivel('sem_acesso') } }];
    await entrar(page, BASE, { ...dados, sc_pap: pap });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#hoje-tarefas')).toContainText('Tudo em dia');
    await expect(aviso).toHaveCount(0);
});
