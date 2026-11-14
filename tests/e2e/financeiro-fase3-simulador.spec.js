// Financeiro Fase 3, tarefa 6: aba "🧮 Simular compra" (vale a pena comprar?) e "Lançar no A Pagar".
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

// Hoje 14/11/2026. Banco com 3000 desde 11/11 e nenhum movimento -> saldo de hoje 3000.
// CP pendente de 1000 em 20/11 -> a 1a semana (14/11 a 20/11) termina em 2000.
// Aluguel fixo de 2000 ja pago em 10/11 -> despesas fixas do mes 2000 -> folga 1000.
const SEED = {
    sc_contas_fin: [{ id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 3000, data_saldo_inicial: '2026-11-11', ativo: true }],
    sc_cr: [],
    sc_cp: [
        { id: 1, descricao: 'Fornecedor', categoria: 'tecido', tipo: 'variavel', valor: 1000, data_vencimento: '2026-11-20', data_pagamento: null, status: 'Pendente' },
        { id: 2, descricao: 'Aluguel', categoria: 'aluguel', tipo: 'fixo', valor: 2000, data_vencimento: '2026-11-10', data_pagamento: '2026-11-10', status: 'Pago' }
    ],
    sc_mov_fin: []
};

async function abrir(page, extras, antes) {
    await page.clock.install({ time: new Date('2026-11-14T10:00:00') });
    await entrar(page, BASE, { ...SEED, ...(extras || {}) });
    if (antes) await page.evaluate(...(Array.isArray(antes) ? antes : [antes]));
    await page.goto(BASE + '/financeiro.html');
}
async function abrirSimulador(page, extras, antes) {
    await abrir(page, extras, antes);
    await page.locator('.fin-tab-btn[data-tab="simulador"]').click();
    await expect(page.locator('#fin-simulador')).toBeVisible();
}
async function simular(page, { desc = 'Máquina', valor, forma = 'avista', parcelas, entrada, data, primeira, ganho }) {
    await page.fill('#sim-desc', desc);
    await page.fill('#sim-valor', valor);
    await page.locator(`input[name="sim-forma"][value="${forma}"]`).check();
    if (parcelas != null) await page.fill('#sim-parcelas', parcelas);
    if (entrada != null) await page.fill('#sim-entrada', entrada);
    if (data != null) await page.fill('#sim-data', data);
    if (primeira != null) await page.fill('#sim-primeira', primeira);
    if (ganho != null) await page.fill('#sim-ganho', ganho);
    await page.getByRole('button', { name: 'Simular', exact: true }).click();
}
// [funcao, argumento] para page.evaluate (a funcao vai serializada, sem closure).
const permissao = nivel => [n => {
    const u = JSON.parse(localStorage.getItem('sc_usr'));
    u[0].papel_id = 3;
    u[0].permissoes_extras = { 'financeiro.hoje': { nivel: 'visualizar', acoes_restritas: [] } };
    if (n) u[0].permissoes_extras['financeiro.simulador'] = { nivel: n, acoes_restritas: [] };
    localStorage.setItem('sc_usr', JSON.stringify(u));
}, nivel];

test('aba aparece com a permissao e some sem ela', async ({ page }) => {
    await abrir(page, {}, permissao('visualizar'));
    const aba = page.locator('.fin-tab-btn[data-tab="simulador"]');
    await expect(aba).toBeVisible();
    await expect(aba).toHaveText('🧮 Simular compra');
    // logo depois de "Resultado do mes"
    const ordem = await page.locator('.fin-tab-btn').evaluateAll(bs => bs.map(b => b.dataset.tab));
    expect(ordem[ordem.indexOf('resultado') + 1]).toBe('simulador');

    await abrir(page, {}, permissao(null));
    await expect(page.locator('.fin-tab-btn[data-tab="hoje"]')).toBeVisible();
    await expect(page.locator('.fin-tab-btn[data-tab="simulador"]')).toBeHidden();
});

test('a vista de 500: Cabe, tabela com 8 semanas', async ({ page }) => {
    await abrirSimulador(page);
    await expect(page.locator('#sim-data')).toHaveValue('2026-11-14');
    await expect(page.locator('#sim-primeira')).toHaveValue('2026-12-14');
    await expect(page.locator('#sim-categoria')).toHaveValue('outro');
    await simular(page, { valor: '500' });
    const titulo = page.locator('#sim-titulo');
    await expect(titulo).toHaveText('Cabe');
    await expect(titulo).toHaveClass(/sim-verde/);
    const linhas = page.locator('#sim-resultado table tbody tr');
    await expect(linhas).toHaveCount(8);
    await expect(linhas.nth(0)).toContainText('14/11');
    await expect(linhas.nth(0)).toContainText('R$ 2.000,00');
    await expect(linhas.nth(0)).toContainText('R$ 1.500,00');
    await expect(page.locator('#sim-erro')).toBeHidden();
});

test('a vista de 1500: Cabe, mas aperta, caixa fica em R$ 500,00', async ({ page }) => {
    await abrirSimulador(page);
    await simular(page, { valor: '1.500,00' });
    await expect(page.locator('#sim-titulo')).toHaveText('Cabe, mas aperta');
    await expect(page.locator('#sim-titulo')).toHaveClass(/sim-amarelo/);
    await expect(page.locator('#sim-frases')).toContainText('O caixa fica em R$ 500,00 na semana de 14/11.');
});

test('a vista de 2500: Não cabe agora, com a frase de melhor data ou a de nenhuma', async ({ page }) => {
    await abrirSimulador(page);
    await simular(page, { valor: '2500' });
    await expect(page.locator('#sim-titulo')).toHaveText('Não cabe agora');
    await expect(page.locator('#sim-titulo')).toHaveClass(/sim-vermelho/);
    const frases = page.locator('#sim-frases');
    await expect(frases).toContainText('O caixa fica negativo em R$ 500,00 na semana de 14/11.');
    // Sem entradas previstas, adiar nao ajuda: nenhuma semana serve.
    await expect(frases).toContainText('Nas próximas 8 semanas não cabe — tente parcelar em mais vezes ou dar uma entrada menor.');
    await expect(page.locator('#sim-resultado table tbody tr').nth(0).locator('.res-neg')).toHaveCount(1);

    // Com um recebimento de 1000 em 25/11, comprando a partir de 21/11 cabe.
    await page.evaluate(() => {
        db.contas_receber.push({ id: 5, pedido_id: 1, cliente_nome: 'Cli', descricao: 'Pedido', valor: 1000, data_vencimento: '2026-11-25', data_pagamento: null, status: 'Pendente' });
    });
    await page.getByRole('button', { name: 'Simular', exact: true }).click();
    await expect(page.locator('#sim-titulo')).toHaveText('Não cabe agora');
    await expect(frases).toContainText('Comprando a partir de 21/11, cabe.');
});

test('data da compra no passado cai na primeira semana', async ({ page }) => {
    await abrirSimulador(page);
    await simular(page, { valor: '500', data: '2026-11-01' });
    await expect(page.locator('#sim-titulo')).toHaveText('Cabe');
    const primeira = page.locator('#sim-resultado table tbody tr').nth(0);
    await expect(primeira).toContainText('R$ 1.500,00');
});

test('parcelado 10x com resultado medio menor que a parcela: amarelo com a frase da parcela', async ({ page }) => {
    // Outubro: so uma conta paga de 200 -> resultado -200 (unico mes com movimento).
    const cps = SEED.sc_cp.concat([{ id: 3, descricao: 'Tecido', categoria: 'tecido', tipo: 'variavel', valor: 200, data_vencimento: '2026-10-15', data_pagamento: '2026-10-15', status: 'Pago' }]);
    await abrirSimulador(page, { sc_cp: cps });
    await simular(page, { valor: '1000', forma: 'parcelado', parcelas: '10' });
    await expect(page.locator('#sim-titulo')).toHaveText('Cabe, mas aperta');
    await expect(page.locator('#sim-titulo')).toHaveClass(/sim-amarelo/);
    await expect(page.locator('#sim-frases')).toContainText('A parcela de R$ 100,00 é maior do que sobra em média por mês (R$ -200,00).');
    await expect(page.locator('#sim-frases')).not.toContainText('O caixa fica');
});

test('ganho mensal 150 em compra de 1000: Se paga em 7 meses.', async ({ page }) => {
    await abrirSimulador(page);
    await simular(page, { valor: '1000', ganho: '150' });
    await expect(page.locator('#sim-titulo')).toHaveText('Cabe');
    await expect(page.locator('#sim-frases')).toContainText('Se paga em 7 meses.');
});

test('validacao: valor vazio e parcelas 1 mostram o texto do nucleo', async ({ page }) => {
    await abrirSimulador(page);
    await simular(page, { valor: '' });
    await expect(page.locator('#sim-erro')).toHaveText('Informe o valor da compra.');
    await expect(page.locator('#sim-titulo')).toHaveCount(0);

    await simular(page, { valor: '1000', forma: 'parcelado', parcelas: '1' });
    await expect(page.locator('#sim-erro')).toHaveText('Parcelas: de 2 a 48.');
    await expect(page.locator('#sim-titulo')).toHaveCount(0);
    await expect(page.locator('#sim-lancar')).toHaveCount(0);
});

test('Lançar no A Pagar: entrada + 3 parcelas cria 4 CPs com os campos do parcelado; duplo clique cria so 4', async ({ page }) => {
    await abrirSimulador(page);
    await page.selectOption('#sim-categoria', 'tecido');
    await page.fill('#sim-credor', 'Fornecedor X');
    await simular(page, { valor: '1000', forma: 'entrada', entrada: '400', parcelas: '3' });
    await expect(page.locator('#sim-titulo')).toBeVisible();
    await page.locator('#sim-lancar').dblclick();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Lançar 1 entrada + 3 parcelas no A Pagar?');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('.sc-toast').filter({ hasText: 'Compra lançada no A Pagar.' })).toBeVisible();
    await expect(page.locator('#sim-titulo')).toHaveCount(0);
    await expect(page.locator('#sim-lancar')).toHaveCount(0);
    // Chamar de novo sem simular nao lanca nada.
    await page.evaluate(() => lancarSimulacaoNoPagar());

    const cps = (await ler(page, 'sc_cp')).filter(c => c.id !== 1 && c.id !== 2);
    expect(cps).toHaveLength(4);
    const entrada = cps.find(c => c.descricao === 'Máquina');
    expect(entrada).toMatchObject({ tipo: 'variavel', categoria: 'tecido', credor_nome: 'Fornecedor X', valor: 400, data_vencimento: '2026-11-14', data_pagamento: null, status: 'Pendente', pedido_id: null });
    expect(entrada.lancamento_pai_id).toBeUndefined();
    const parcelas = cps.filter(c => c.parcelado).sort((a, b) => a.parcela_atual - b.parcela_atual);
    expect(parcelas.map(p => [p.descricao, p.valor, p.data_vencimento, p.parcela_atual, p.numero_parcelas])).toEqual([
        ['Máquina (parcela 1/3)', 200, '2026-12-14', 1, 3],
        ['Máquina (parcela 2/3)', 200, '2027-01-14', 2, 3],
        ['Máquina (parcela 3/3)', 200, '2027-02-14', 3, 3]
    ]);
    parcelas.forEach(p => expect(p).toMatchObject({ tipo: 'variavel', categoria: 'tecido', credor_nome: 'Fornecedor X', status: 'Pendente', pedido_id: null, lancamento_pai_id: parcelas[0].lancamento_pai_id }));
    expect(parcelas[0].lancamento_pai_id).not.toBe(entrada.id);
    expect(new Set(cps.map(c => c.id)).size).toBe(4);
});

test('Lançar no A Pagar: a vista pede 1 conta e parcelado pede N parcelas', async ({ page }) => {
    await abrirSimulador(page);
    await simular(page, { valor: '500' });
    await page.locator('#sim-lancar').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Lançar 1 conta no A Pagar?');
    await page.locator('#sc-modal-cancel').click();
    await simular(page, { valor: '1000', forma: 'parcelado', parcelas: '10' });
    await page.locator('#sim-lancar').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Lançar 10 parcelas no A Pagar?');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('.sc-toast').filter({ hasText: 'Compra lançada no A Pagar.' })).toBeVisible();
    const cps = (await ler(page, 'sc_cp')).filter(c => c.id !== 1 && c.id !== 2);
    expect(cps).toHaveLength(10);
    expect(cps.every(c => c.categoria === 'outro' && c.parcelado)).toBe(true);
});

test('visualizar simula mas nao ve Lançar no A Pagar', async ({ page }) => {
    await abrirSimulador(page, {}, permissao('visualizar'));
    await simular(page, { valor: '500' });
    await expect(page.locator('#sim-titulo')).toHaveText('Cabe');
    await expect(page.locator('#sim-lancar')).toHaveCount(0);
    const antes = (await ler(page, 'sc_cp')).length;
    await page.evaluate(() => lancarSimulacaoNoPagar());
    await expect(page.locator('#sc-modal-msg')).toBeHidden();
    expect((await ler(page, 'sc_cp')).length).toBe(antes);
});
