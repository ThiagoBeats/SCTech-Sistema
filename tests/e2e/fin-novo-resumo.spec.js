// Financeiro novo, entrega 1, tarefa 6: tela Resumo (Minhas contas, indicadores com comparacao, avisos)
// e os campos de banco no cadastro de conta. Relogio fixo em todos: 24/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 24, 10, 0, 0);
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const hist = [{ em: '2026-11-01T12:00:00.000Z', por: 1, porNome: 'Teste', acao: 'criado', detalhe: 'Lançamento manual' }];

const CONTAS = [
    { id: 10, nome: 'Conta Inter', tipo: 'banco', ativo: true, saldo_inicial: 1000, data_saldo_inicial: '2026-01-01', banco: '077', agencia: '0001', numero_conta: '12345-6', tipo_conta: 'corrente', conexao: 'manual', saldo_atualizado_em: '2026-11-20' },
    { id: 11, nome: 'Roxinho', tipo: 'banco', ativo: true, saldo_inicial: 500, data_saldo_inicial: '2026-01-01', banco: '260', agencia: '', numero_conta: '', tipo_conta: 'poupanca', conexao: 'manual', saldo_atualizado_em: null },
];
const MOVS = [
    { id: 901, conta_id: 10, data: '2026-11-10', sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 1, grupo_id: 1, descricao: 'Entrada' },
    { id: 902, conta_id: 10, data: '2026-11-12', sentido: 'saida', valor: 300, origem: 'cp', origem_id: 1, grupo_id: null, descricao: 'Tecido' },
];
const CR = [
    { id: 1, cliente_nome: 'Bia', descricao: 'Venda paga', valor: 1000, status: 'Pago', data_vencimento: '2026-11-10', data_pagamento: '2026-11-10', data_competencia: '2026-12-05', categoria_id: 'cat_vendas', conta_id: 10, historico: hist },
    { id: 2, cliente_nome: 'Ana', descricao: 'Venda a vencer', valor: 400, status: 'Pendente', data_vencimento: '2026-11-26', data_pagamento: null, data_competencia: '2026-11-26', categoria_id: 'cat_vendas', historico: hist },
];
const CP = [
    { id: 1, tipo: 'variavel', categoria: 'tecido', credor_nome: 'RC Tecidos', descricao: 'Tecido pago', valor: 300, status: 'Pago', data_vencimento: '2026-11-12', data_pagamento: '2026-11-12', data_competencia: '2026-11-12', categoria_id: 'cat_tecido', conta_id: 10, historico: hist },
    { id: 2, tipo: 'variavel', categoria: 'tecido', credor_nome: 'Fornecedor X', descricao: 'Tecido vencido', valor: 150, status: 'Atrasado', data_vencimento: '2026-11-21', data_pagamento: null, data_competencia: '2026-11-21', categoria_id: 'cat_tecido', historico: hist },
];
const PED = [{ id: 26300, clienteId: 7, clienteNome: 'Bia', status: 'Aprovado', data_aprovacao: '2026-11-05', financeiro_gerado: true, valor: 2000, ambientes: [] }];

async function abrir(page, extras) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_mov_fin: MOVS, sc_cr: CR, sc_cp: CP, sc_ped: PED, ...(extras || {}) });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resumo"]').click();
}
const kpi = (page, id) => page.locator('#res-kpi-' + id);

test('Minhas contas: linhas com selo, descricao, Manual, Atualizado em e Saldo total', async ({ page }) => {
    await abrir(page);
    const inter = page.locator('.res-conta', { hasText: 'Conta Inter' });
    await expect(inter.locator('.res-selo')).toHaveText('INTER');
    await expect(inter).toContainText('Conta corrente · Ag 0001 · CC 12345-6');
    await expect(inter).toContainText('R$ 1.700,00');
    await expect(inter).toContainText('Manual');
    await expect(inter).toContainText('Atualizado em 20/11');
    const nu = page.locator('.res-conta', { hasText: 'Roxinho' });
    await expect(nu.locator('.res-selo')).toHaveText('NU');
    await expect(nu).toContainText('Poupança');
    await expect(nu).toContainText('R$ 500,00');
    await expect(nu).toContainText('Sem movimentos');
    await expect(page.locator('#res-saldo-total')).toHaveText('R$ 2.200,00');
});

test('+ Conectar conta abre o cadastro de conta com a nota do Open Finance; salvar guarda banco, agencia e conta', async ({ page }) => {
    await abrir(page);
    await page.locator('#res-conectar').click();
    await page.waitForURL('**/empresa.html?conectar=1#preferencias');
    await expect(page.locator('#emp-conectar-nota')).toHaveText('A conexão automática com o banco (Open Finance) chega quando o sistema rodar no servidor da empresa.');
    const nova = page.locator('#emp-contas .conta-linha').last();
    await nova.locator('.conta-nome').fill('Itaú da loja');
    await nova.locator('.conta-banco-sel').selectOption('341');
    await nova.locator('.conta-agencia').fill('1234');
    await nova.locator('.conta-numero').fill('98765-0');
    await expect(nova.locator('.conta-tipo-conta')).toHaveValue('corrente');
    await page.getByRole('button', { name: /Salvar contas/ }).click();
    await expect.poll(async () => (await ler(page, 'sc_contas_fin')).length).toBe(3);
    const c = (await ler(page, 'sc_contas_fin')).find(x => x.nome === 'Itaú da loja');
    expect(c).toMatchObject({ tipo: 'banco', banco: '341', agencia: '1234', numero_conta: '98765-0', tipo_conta: 'corrente', conexao: 'manual' });
    // as contas que ja existiam continuam com os dados
    expect((await ler(page, 'sc_contas_fin')).find(x => x.id === 10)).toMatchObject({ banco: '077', agencia: '0001', numero_conta: '12345-6' });
});

test('indicadores do mes batem com a DRE (Caixa); outubro sem dados: sem base de comparacao', async ({ page }) => {
    await abrir(page);
    const esperado = await page.evaluate(() => {
        const L = DreCore.calcular({ regime: 'caixa', de: '2026-11-01', ate: '2026-11-30', contas_receber: db.contas_receber, contas_pagar: db.contas_pagar,
            movimentos: db.movimentos_fin, contas: db.contas_fin, categorias: db.fin_categorias.categorias, subgrupos: db.fin_categorias.subgrupos }).linhas;
        return L;
    });
    expect(esperado).toMatchObject({ receitas: 1000, liquido: 700 });
    await expect(kpi(page, 'receita').locator('.res-kpi-valor')).toHaveText('R$ 1.000,00');
    await expect(kpi(page, 'lucro').locator('.res-kpi-valor')).toHaveText('R$ 700,00');
    await expect(kpi(page, 'margem').locator('.res-kpi-valor')).toHaveText('70,0%');
    await expect(kpi(page, 'ticket').locator('.res-kpi-valor')).toHaveText('R$ 2.000,00');
    for (const id of ['receita', 'lucro', 'margem', 'ticket']) await expect(kpi(page, id).locator('.res-var')).toHaveText('sem base de comparação');
});

test('comparacao com o periodo anterior: seta verde para cima e vermelha para baixo', async ({ page }) => {
    const out = [
        { id: 3, cliente_nome: 'Cris', descricao: 'Venda de outubro', valor: 800, status: 'Pago', data_vencimento: '2026-10-10', data_pagamento: '2026-10-10', data_competencia: '2026-10-10', categoria_id: 'cat_vendas', conta_id: 10, historico: hist },
        { id: 4, cliente_nome: 'Davi', descricao: 'Venda 2', valor: 1000, status: 'Pago', data_vencimento: '2026-10-11', data_pagamento: '2026-10-11', data_competencia: '2026-10-11', categoria_id: 'cat_vendas', conta_id: 10, historico: hist },
    ];
    const movs = MOVS.concat([
        { id: 903, conta_id: 10, data: '2026-10-10', sentido: 'entrada', valor: 800, origem: 'cr', origem_id: 3, grupo_id: 2, descricao: 'E' },
        { id: 904, conta_id: 10, data: '2026-10-11', sentido: 'entrada', valor: 1000, origem: 'cr', origem_id: 4, grupo_id: 3, descricao: 'E' },
    ]);
    await abrir(page, { sc_cr: CR.concat(out), sc_mov_fin: movs });
    // receita 1000 vs 1800 = -44%; lucro 700 vs 1800 = -61%
    await expect(kpi(page, 'receita').locator('.res-var')).toHaveText('↓ 44%');
    await expect(kpi(page, 'receita').locator('.res-var')).toHaveClass(/res-var-down/);
    await page.selectOption('#res-periodo', 'passado');
    // outubro (1800) vs setembro sem dados
    await expect(kpi(page, 'receita').locator('.res-kpi-valor')).toHaveText('R$ 1.800,00');
    await expect(kpi(page, 'receita').locator('.res-var')).toHaveText('sem base de comparação');
    await page.selectOption('#res-periodo', 'mes');
    const sobe = await page.evaluate(() => document.querySelector('#res-kpi-receita .res-var').className);
    expect(sobe).toContain('res-var-down');
});

test('Competencia muda a Receita quando a competencia difere do pagamento', async ({ page }) => {
    await abrir(page);
    await expect(kpi(page, 'receita').locator('.res-kpi-valor')).toHaveText('R$ 1.000,00');
    await page.selectOption('#res-regime', 'competencia');
    // competencia de novembro: so a venda a vencer (400); a paga e competencia de dezembro
    await expect(kpi(page, 'receita').locator('.res-kpi-valor')).toHaveText('R$ 400,00');
    await expect(kpi(page, 'lucro').locator('.res-kpi-valor')).toHaveText('R$ -50,00');
    await page.selectOption('#res-regime', 'caixa');
    await expect(kpi(page, 'receita').locator('.res-kpi-valor')).toHaveText('R$ 1.000,00');
});

test('receita zero: margem liquida "—"; personalizado pede as datas', async ({ page }) => {
    await abrir(page);
    await page.selectOption('#res-periodo', 'custom');
    await page.fill('#res-de', '2026-01-01');
    await page.fill('#res-ate', '2026-01-31');
    await expect(kpi(page, 'margem').locator('.res-kpi-valor')).toHaveText('—');
    await expect(kpi(page, 'receita').locator('.res-kpi-valor')).toHaveText('R$ 0,00');
});

test('avisos: vencida ha 3 dias e a receber em 2 dias; cancelar a vencida tira dos avisos; clicar abre o lancamento', async ({ page }) => {
    await abrir(page);
    const av = page.locator('#res-avisos');
    await expect(av).toContainText('1 conta a pagar vencida · R$ 150,00');
    await expect(av.locator('.res-aviso-item', { hasText: 'Fornecedor X' })).toContainText('há 3 dias');
    await expect(av.locator('.res-aviso-item', { hasText: 'Ana' })).toContainText('vence em 2 dias');
    await expect(av).not.toContainText('a receber vencida');
    // clicar abre Lancamentos no lado certo, com a linha destacada
    await av.locator('.res-aviso-item', { hasText: 'Ana' }).click();
    await expect(page.locator('.fin-lado-btn[data-lado="receber"]')).toHaveClass(/active/);
    await expect(page.locator('#tb-contas-receber tr.lanc-destaque')).toContainText('Venda a vencer');
    await expect(page.locator('#lanc-pessoa')).toHaveValue('ana');
    // cancela a vencida em Lancamentos
    await page.locator('.fin-lado-btn[data-lado="pagar"]').click();
    await page.fill('#lanc-de', ''); await page.fill('#lanc-ate', '');
    await acaoMenu(page, page.locator('#tb-contas-pagar tr', { hasText: 'Tecido vencido' }), 'Cancelar');
    await page.fill('#lanc-motivo', 'Duplicada');
    await page.locator('#lanc-motivo-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).find(c => c.id === 2).status).toBe('Cancelado');
    await page.locator('.fin-tab-btn[data-tab="resumo"]').click();
    await expect(page.locator('#res-avisos')).not.toContainText('Fornecedor X');
    await expect(page.locator('#res-avisos')).not.toContainText('a pagar vencida');
});

test('aviso de vencida abre a linha em Contas a pagar', async ({ page }) => {
    await abrir(page);
    await page.locator('#res-avisos .res-aviso-item', { hasText: 'Fornecedor X' }).click();
    await expect(page.locator('.fin-lado-btn[data-lado="pagar"]')).toHaveClass(/active/);
    await expect(page.locator('#tb-contas-pagar tr.lanc-destaque')).toContainText('Tecido vencido');
});

test('tema escuro: textos legiveis; 390px sem rolagem horizontal', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const cont = sel => page.locator(sel).first().evaluate(e => {
        const cor = getComputedStyle(e).color;
        let n = e, fundo = 'rgba(0, 0, 0, 0)';
        while (n && fundo === 'rgba(0, 0, 0, 0)') { fundo = getComputedStyle(n).backgroundColor; n = n.parentElement; }
        return { cor, fundo };
    });
    for (const sel of ['.res-conta-nome', '.res-conta-saldo', '.res-kpi-valor', '.res-kpi-rotulo', '.res-aviso-item']) {
        const c = await cont(sel);
        expect(c.cor, sel).not.toBe(c.fundo);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
