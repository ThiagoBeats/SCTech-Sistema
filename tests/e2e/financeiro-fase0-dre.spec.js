// Financeiro fase 0 - custo guardado na aprovacao e DRE por pedido.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const CAT = (custo) => [{ id: 7, nome: 'Linho Bege', preco_custo: custo, preco_venda: 100 }];

const orcamento = (extra) => ({ id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Orçamento',
    valor: 1000, vendedor_nome: 'Bruno', data_entrega: '2026-12-01', ambientes: [{ nome: 'Sala', tecidos: [{ tecidoId: 7, nome: 'Linho Bege', consumo_linear: 10 }] }], itens: [], ...(extra || {}) });
const aprovado = (extra) => ({ id: 26501, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Medição', financeiro_gerado: true,
    valor: 1000, ambientes: [], itens: [], ...(extra || {}) });

async function abrirDRE(page) {
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
}

test('aprovar guarda o custo e o DRE nao muda quando o custo do tecido muda', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_cat: CAT(20), sc_ped: [orcamento()] });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { aprovarPedido(26500); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].custo_snapshot?.total).toBe(200);
    const snap = (await lerChave(page, 'sc_ped'))[0].custo_snapshot;
    expect(snap.data).toBe(await page.evaluate(() => new Date().toLocaleDateString('sv-SE')));
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('sc_cat')); c[0].preco_custo = 90; localStorage.setItem('sc_cat', JSON.stringify(c)); });
    await abrirDRE(page);
    const linha = page.locator('#tb-dre tr', { hasText: 'Ana Paula' }).first();
    await expect(linha).toContainText('200,00');
    await expect(linha).not.toContainText('900,00');
    await expect(linha).toContainText('80,0%');
});

test('mao de obra nao e custo', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [aprovado({ maoObra: 200, custo_snapshot: { total: 300, itens: [], faltando: 0, data: '2026-11-01' } })] });
    await abrirDRE(page);
    const linha = page.locator('#tb-dre tr', { hasText: 'Ana Paula' }).first();
    await expect(linha).toContainText('700,00');
    await expect(linha).toContainText('70,0%');
});

test('colunas do DRE', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [aprovado()] });
    await abrirDRE(page);
    const ths = (await page.locator('#tb-dre').locator('xpath=ancestor::table//th').allTextContents()).map(t => t.trim());
    expect(ths.slice(2)).toEqual(['Receita', 'Material', 'Serviços e outros', 'Comissões', 'Resultado', 'Margem']);
});

test('item sem custo mostra aviso', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [aprovado({ custo_snapshot: { total: 100, itens: [], faltando: 2, data: '2026-11-01' } })] });
    await abrirDRE(page);
    await expect(page.locator('#tb-dre tr', { hasText: 'Ana Paula' }).first()).toContainText('custo não informado');
});

test('pedido antigo sem snapshot aparece como custo estimado', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_cat: CAT(20),
        sc_ped: [aprovado({ ambientes: [{ nome: 'Sala', tecidos: [{ tecidoId: 7, nome: 'Linho Bege', consumo_linear: 10 }] }] })] });
    await abrirDRE(page);
    const linha = page.locator('#tb-dre tr', { hasText: 'Ana Paula' }).first();
    await expect(linha).toContainText('custo estimado');
    await expect(linha).toContainText('200,00');
});
