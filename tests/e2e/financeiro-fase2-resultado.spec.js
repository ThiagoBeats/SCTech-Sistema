// Financeiro Fase 2, tarefa 3: aba "Resultado do mes".
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const HOJE = iso(new Date());
const mesMais = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.getFullYear() + '-' + p2(d.getMonth() + 1); };
const M = mesMais(-1);   // mes fechado em teste
const M1 = mesMais(-2);  // mes anterior a ele (historico da margem)
const dia = (mes, d) => mes + '-' + p2(d);

const crPago = (id, mes, valor) => ({ id, pedido_id: 1, cliente_nome: 'Cli', descricao: 'Pedido', valor, data_vencimento: dia(mes, 5), data_pagamento: dia(mes, 10), status: 'Pago', parcela_tipo: 'saldo' });
const cpPago = (id, mes, categoria, valor, tipo) => ({ id, descricao: categoria + id, valor, categoria, tipo: tipo || 'variavel', data_vencimento: dia(mes, 8), data_pagamento: dia(mes, 12), status: 'Pago' });

const CR_M = [crPago(1, M, 10000)];
const CP_M = [cpPago(1, M, 'tecido', 3000), cpPago(2, M, 'costureira', 1000), cpPago(3, M, 'taxa_cartao', 200), cpPago(4, M, 'aluguel', 1500, 'fixo')];

async function abrir(page, dados) {
    await entrar(page, BASE, dados);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await page.fill('#res-mes', M);
    await page.locator('#res-mes').dispatchEvent('change');
}
const linha = (page, g) => page.locator(`#res-grupos tr[data-grupo="${g}"]`);

test('aba fica logo depois de Visao Geral', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('.fin-tab-btn').nth(2)).toHaveAttribute('data-tab', 'resultado');
    await expect(page.locator('.fin-tab-btn[data-tab="resultado"]')).toContainText('Resultado do mês');
});

test('resultado de outubro com entradas, saidas por grupo e resultado', async ({ page }) => {
    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: { aliquota_estimada: 6 } });
    await expect(page.locator('#res-entradas')).toHaveText('R$ 10.000,00');
    await expect(page.locator('#res-saidas')).toHaveText('R$ 6.288,00');
    await expect(page.locator('#res-saldo')).toHaveText('R$ 3.712,00');
    await expect(page.locator('#res-saldo')).toHaveClass(/res-pos/);
    await expect(linha(page, 'fornecedores')).toContainText('R$ 3.000,00');
    await expect(linha(page, 'servicos')).toContainText('R$ 1.000,00');
    await expect(linha(page, 'taxas')).toContainText('R$ 200,00');
    await expect(linha(page, 'fixas')).toContainText('R$ 1.500,00');
    await expect(linha(page, 'comissoes')).toContainText('R$ 0,00');
    await expect(page.locator('#res-meta')).toContainText('Faturamento líquido R$ 9.800,00');
});

test('resultado negativo fica vermelho', async ({ page }) => {
    await abrir(page, { sc_cr: [crPago(1, M, 1000)], sc_cp: [cpPago(1, M, 'tecido', 3000)] });
    await expect(page.locator('#res-saldo')).toHaveClass(/res-neg/);
});

test('imposto estimado com aviso e lancado quando ha guia de referencia', async ({ page }) => {
    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: { aliquota_estimada: 6 } });
    await expect(linha(page, 'imposto')).toContainText('(estimado)');
    await expect(linha(page, 'imposto')).toContainText('R$ 588,00');
    await expect(page.locator('#res-imposto-aviso')).toHaveText('guia ainda não lançada — estimativa R$ 588,00');

    const guia = { id: 9, descricao: 'DAS', valor: 700, categoria: 'imposto', tipo: 'variavel', mes_referencia: M, data_vencimento: dia(mesMais(0), 20), data_pagamento: null, status: 'Pendente' };
    await abrir(page, { sc_cr: CR_M, sc_cp: [...CP_M, guia], sc_empresa: { aliquota_estimada: 6 } });
    await expect(linha(page, 'imposto')).toContainText('R$ 700,00');
    await expect(linha(page, 'imposto')).not.toContainText('(estimado)');
    await expect(page.locator('#res-imposto-aviso')).toBeHidden();
    await expect(page.locator('#res-saidas')).toHaveText('R$ 6.400,00');

    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: {} });
    await expect(page.locator('#res-imposto-aviso')).toHaveText('Informe a alíquota em Empresa para estimar o imposto');
});

test('meta: bateu / faltou e ajuste do mes', async ({ page }) => {
    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: { meta_faturamento_padrao: 9000 } });
    await expect(page.locator('#res-meta')).toContainText('Faturamento líquido R$ 9.800,00');
    await expect(page.locator('#res-meta')).toContainText('meta R$ 9.000,00');
    await expect(page.locator('#res-meta')).toContainText('bateu a meta');

    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: { meta_faturamento_padrao: 12000 } });
    await expect(page.locator('#res-meta')).toContainText('faltou R$ 2.200,00');
    await page.click('#res-meta-edit');
    await page.fill('#res-ajuste-valor', '9.000');
    await page.click('#res-ajuste-ok');
    await expect(page.locator('#res-meta')).toContainText('meta R$ 9.000,00');
    await expect(page.locator('#res-meta')).toContainText('bateu a meta');
    expect((await ler(page, 'sc_fin_metas'))[M]).toBe(9000);
});

test('ponto de equilibrio com frase e comparacao', async ({ page }) => {
    const hist = { sc_cr: [...CR_M, crPago(2, M1, 10000)], sc_cp: [...CP_M, cpPago(10, M1, 'tecido', 4000)], sc_empresa: { meta_faturamento_padrao: 9000 } };
    await abrir(page, hist);
    await expect(page.locator('#res-equilibrio-frase')).toHaveText('Para pagar as contas do mês você precisa faturar R$ 2.500,00.');
    await expect(page.locator('#res-equilibrio-linha')).toContainText('empate R$ 2.500,00');
    await expect(page.locator('#res-equilibrio-linha')).toContainText('meta R$ 9.000,00');
    await expect(page.locator('#res-equilibrio-linha')).toContainText('faturado R$ 9.800,00');
    await expect(page.locator('#res-equilibrio-aviso')).toContainText('estimativa — poucos meses de histórico');

    await abrir(page, { sc_cr: [...CR_M, crPago(2, M1, 10000)], sc_cp: [...CP_M, cpPago(10, M1, 'tecido', 12000)] });
    await expect(page.locator('#res-equilibrio-frase')).toHaveText('Com a margem atual não há ponto de equilíbrio — os custos variáveis passam do faturamento.');
});

test('orcamento com faixas e ajuste do mes', async ({ page }) => {
    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: { orcamento_padrao: { fornecedores: 3200, fixas: 1000, servicos: 5000 } } });
    const o = g => page.locator(`#res-orcamento tr[data-orc="${g}"]`);
    await expect(o('fornecedores')).toContainText('perto do limite');
    await expect(o('fixas')).toContainText('estourou R$ 500,00');
    await expect(o('servicos')).not.toContainText('perto do limite');
    await expect(o('servicos')).not.toContainText('estourou');
    await o('fornecedores').locator('button').click();
    await page.fill('#res-ajuste-valor', '4.000');
    await page.click('#res-ajuste-ok');
    await expect(o('fornecedores')).not.toContainText('perto do limite');
    await expect(o('fornecedores')).toContainText('R$ 4.000,00');
    expect((await ler(page, 'sc_fin_orcamento_mes'))[M]).toEqual({ fornecedores: 4000 });
    expect((await ler(page, 'sc_empresa')).orcamento_padrao.fornecedores).toBe(3200);
});

test('mes atual mostra ate hoje e previsto ate o fim', async ({ page }) => {
    const mesAt = mesMais(0);
    const cr1 = { ...crPago(1, mesAt, 2000), data_pagamento: HOJE };
    const cr2 = { id: 2, pedido_id: 1, cliente_nome: 'Cli', descricao: 'Pedido', valor: 500, data_vencimento: HOJE, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' };
    const cp1 = { id: 1, descricao: 'Luz', valor: 300, categoria: 'conta', tipo: 'fixo', data_vencimento: HOJE, data_pagamento: null, status: 'Pendente' };
    await entrar(page, BASE, { sc_cr: [cr1, cr2], sc_cp: [cp1] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await expect(page.locator('#res-mes')).toHaveValue(mesAt);
    await expect(page.locator('#res-aberto')).toContainText('Até hoje');
    await expect(page.locator('#res-ate-hoje')).toHaveText('R$ 2.000,00');
    await expect(page.locator('#res-previsto')).toHaveText('R$ 2.200,00');
    await page.fill('#res-mes', M);
    await page.locator('#res-mes').dispatchEvent('change');
    await expect(page.locator('#res-aberto')).toBeHidden();
});

test('PDF abre com o total', async ({ page }) => {
    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: { aliquota_estimada: 6, razao_social: 'CORTINAS X' } });
    await page.click('#res-pdf');
    const doc = page.locator('#doc-modal-paper');
    await expect(doc).toContainText('Resultado do mês');
    await expect(doc).toContainText('CORTINAS X');
    await expect(doc).toContainText('R$ 3.712,00');
    await expect(doc).toContainText('R$ 6.288,00');
});

test('sem permissao a aba nao aparece', async ({ page }) => {
    const nivel = n => ({ nivel: n, acoes_restritas: [] });
    const pap = [{ id: 1, nome: 'Restrito', permissoes: { financeiro: nivel('completo'), 'financeiro.resultado': nivel('sem_acesso') } }];
    await entrar(page, BASE, { sc_pap: pap });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('.fin-tab-btn[data-tab="resultado"]')).toBeHidden();
    await expect(page.locator('.fin-tab-btn[data-tab="dashboard"]')).toBeVisible();
});

test('PDF traz linha de empate, aviso de estimativa e mes em andamento', async ({ page }) => {
    await abrir(page, { sc_cr: [...CR_M, crPago(2, M1, 10000)], sc_cp: [...CP_M, cpPago(10, M1, 'tecido', 4000)], sc_empresa: { meta_faturamento_padrao: 9000 } });
    await page.click('#res-pdf');
    const doc = page.locator('#doc-modal-paper');
    await expect(doc).toContainText('empate R$ 2.500,00 · meta R$ 9.000,00 · faturado R$ 9.800,00');
    await expect(doc).toContainText('estimativa — poucos meses de histórico');
    await expect(doc).not.toContainText('Mês em andamento');
    await page.evaluate(() => { document.getElementById('doc-modal-overlay').remove(); });
    await page.fill('#res-mes', mesMais(0));
    await page.locator('#res-mes').dispatchEvent('change');
    await page.click('#res-pdf');
    await expect(page.locator('#doc-modal-paper')).toContainText('Mês em andamento');
    await expect(page.locator('#doc-modal-paper')).toContainText('Previsto até o fim do mês');
});

test('previsto: legenda de atrasados e guia de imposto nao conta duas vezes', async ({ page }) => {
    const mesAt = mesMais(0);
    const cr1 = { ...crPago(1, mesAt, 2000), data_pagamento: HOJE };
    const atrasada = { id: 2, pedido_id: 1, cliente_nome: 'Cli', descricao: 'Pedido', valor: 500, data_vencimento: dia(M, 5), data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' };
    const guia = { id: 3, descricao: 'DAS', valor: 400, categoria: 'imposto', tipo: 'variavel', mes_referencia: mesAt, data_vencimento: HOJE, data_pagamento: null, status: 'Pendente' };
    await entrar(page, BASE, { sc_cr: [cr1], sc_cp: [guia] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await expect(page.locator('#res-ate-hoje')).toHaveText('R$ 1.600,00');
    await expect(page.locator('#res-previsto')).toHaveText('R$ 1.600,00');
    await expect(page.locator('#res-aberto-legenda')).toBeEmpty();
    await entrar(page, BASE, { sc_cr: [cr1, atrasada], sc_cp: [guia] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await expect(page.locator('#res-previsto')).toHaveText('R$ 2.100,00');
    await expect(page.locator('#res-aberto-legenda')).toHaveText('inclui atrasados');
});

test('orcamento mostra falta e % usado', async ({ page }) => {
    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: { orcamento_padrao: { fornecedores: 3200, fixas: 1000 } } });
    await expect(page.locator('#res-orcamento thead, #res-orcamento-card thead')).toContainText('Falta');
    await expect(page.locator('#res-orcamento-card thead')).toContainText('% usado');
    await expect(page.locator('#res-orcamento tr[data-orc="fornecedores"]')).toContainText('R$ 200,00');
    await expect(page.locator('#res-orcamento tr[data-orc="fornecedores"]')).toContainText('93,75%');
    await expect(page.locator('#res-orcamento tr[data-orc="fixas"]')).toContainText('150%');
});

test('limite so deste mes para grupo sem padrao, zero desliga e vazio remove', async ({ page }) => {
    await abrir(page, { sc_cr: CR_M, sc_cp: CP_M, sc_empresa: { orcamento_padrao: { fornecedores: 3200 } } });
    const o = g => page.locator(`#res-orcamento tr[data-orc="${g}"]`);
    await expect(o('servicos')).toHaveCount(0);
    await page.selectOption('#res-orc-grupo', 'servicos');
    await page.click('#res-orc-add-btn');
    await page.fill('#res-ajuste-valor', '1.000');
    await page.click('#res-ajuste-ok');
    await expect(o('servicos')).toContainText('perto do limite');
    await o('fornecedores').locator('button').click();
    await page.fill('#res-ajuste-valor', '0');
    await page.click('#res-ajuste-ok');
    await expect(o('fornecedores')).toHaveCount(0);
    expect((await ler(page, 'sc_fin_orcamento_mes'))[M]).toEqual({ servicos: 1000, fornecedores: 0 });
    await page.selectOption('#res-orc-grupo', 'fornecedores');
    await page.click('#res-orc-add-btn');
    await expect(page.locator('#res-ajuste-valor')).toHaveValue('0');
    await page.fill('#res-ajuste-valor', '');
    await page.click('#res-ajuste-ok');
    await expect(o('fornecedores')).toHaveCount(1);
    expect((await ler(page, 'sc_fin_orcamento_mes'))[M]).toEqual({ servicos: 1000 });
});

// --- Revisao final (relogio fixo em 10/11/2026) ---
test.describe('relogio fixo em 10/11/2026', () => {
    test.use({ timezoneId: 'America/Sao_Paulo' });
    const fixar = page => page.clock.install({ time: new Date('2026-11-10T12:00:00-03:00') });
    async function abrirEm(page, dados, mes) {
        await fixar(page);
        await entrar(page, BASE, dados);
        await page.goto(BASE + '/financeiro.html');
        await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
        if (mes) { await page.fill('#res-mes', mes); await page.locator('#res-mes').dispatchEvent('change'); }
    }

    test('previsto: guia de outubro vencendo em novembro nao conta em novembro e o imposto estimado e projetado', async ({ page }) => {
        const cr1 = { ...crPago(1, '2026-11', 1000), data_pagamento: '2026-11-05' };
        const cr2 = { id: 2, pedido_id: 1, cliente_nome: 'Cli', descricao: 'Pedido', valor: 2000, data_vencimento: '2026-11-25', data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' };
        const guiaOut = { id: 3, descricao: 'DAS outubro', valor: 500, categoria: 'imposto', tipo: 'variavel', mes_referencia: '2026-10', data_vencimento: '2026-11-20', data_pagamento: null, status: 'Pendente' };
        await abrirEm(page, { sc_cr: [cr1, cr2], sc_cp: [guiaOut], sc_empresa: { aliquota_estimada: 6 } });
        await expect(page.locator('#res-mes')).toHaveValue('2026-11');
        await expect(page.locator('#res-ate-hoje')).toHaveText('R$ 940,00');            // 1000 - 6%
        // faturamento previsto 1000 + 2000 = 3000, imposto 6% = 180; a guia de outubro fica de fora
        await expect(page.locator('#res-previsto')).toHaveText('R$ 2.820,00');
        await page.click('#res-pdf');
        await expect(page.locator('#doc-modal-paper')).toContainText('Previsto até o fim do mês: R$ 2.820,00');
    });

    test('ponto de equilibrio: aluguel avulso conta como fixa; sem fixas pede o cadastro (tela e PDF)', async ({ page }) => {
        const cr = [crPago(1, '2026-10', 10000), crPago(2, '2026-09', 10000)];
        const base = [cpPago(1, '2026-10', 'tecido', 3000), cpPago(10, '2026-09', 'tecido', 4000)];
        await abrirEm(page, { sc_cr: cr, sc_cp: [...base, cpPago(4, '2026-10', 'aluguel', 1500, 'variavel')] }, '2026-10');
        await expect(page.locator('#res-equilibrio-frase')).toHaveText('Para pagar as contas do mês você precisa faturar R$ 2.500,00.');

        await abrirEm(page, { sc_cr: cr, sc_cp: base }, '2026-10');
        await expect(page.locator('#res-equilibrio-frase')).toHaveText('Cadastre as despesas fixas para calcular o ponto de equilíbrio');
        await expect(page.locator('#res-equilibrio-linha')).toBeEmpty();
        await page.click('#res-pdf');
        const doc = page.locator('#doc-modal-paper');
        await expect(doc).toContainText('Cadastre as despesas fixas para calcular o ponto de equilíbrio');
        await expect(doc).not.toContainText('R$ 0,00 ·');
    });

    test('saidas por grupo explicam a regra do imposto (tela e PDF)', async ({ page }) => {
        await abrirEm(page, { sc_cr: [crPago(1, '2026-10', 1000)], sc_cp: [] }, '2026-10');
        await expect(page.locator('#res-imposto-regra')).toHaveText('Imposto contado pelo mês de referência da guia (não pela data de pagamento).');
        await page.click('#res-pdf');
        await expect(page.locator('#doc-modal-paper')).toContainText('Imposto contado pelo mês de referência da guia (não pela data de pagamento).');
    });
});
