// Financeiro Fase 1, tarefa 6: o pedido guarda o plano e o meio previsto da
// entrada e do saldo; ao aprovar, as parcelas nascem com esse meio previsto.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const VEND = [{ id: 1, nome: 'Ana', comissao_pct: 5 }];
const CLI = [{ id: 9, nome: 'Cli Teste' }];
const CONTAS = [
    { id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true },
    { id: 12, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true,
      cartao: { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 } }
];
const MEIOS = [
    { id: 22, nome: 'PIX', tipo: 'pix', conta_id: 10 },
    { id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: 12 }
];

async function abrir(page, extras) {
    await entrar(page, BASE, { sc_vend: VEND, sc_cli: CLI, sc_contas_fin: CONTAS, sc_meios_pag: MEIOS, ...(extras || {}) });
    await page.goto(BASE + '/pedido.html');
}

async function preencher(page, { entrada, status = 'Medição' }) {
    await page.fill('#ped-cliente-busca', 'Cli Teste');
    await page.evaluate(() => filtrarClientes());
    await page.selectOption('#ped-cliente', '9');
    await page.selectOption('#ped-vendedor', '1');
    await page.selectOption('#ped-status', status);
    await page.fill('#ped-entrega', '2099-12-01');
    if (entrada != null) await page.fill('#ped-entrada-pct', String(entrada));
}
async function gravar(page) {
    await page.evaluate(() => {
        pedidoDraft.ambientes.forEach(a => { a.calculado = true; });
        pedidoDraft.itens = [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 1000, subtotal: 1000 }];
        document.getElementById('ped-desconto').value = 0;
        salvarPedido();
    });
    await page.waitForURL(/index\.html/);
}
async function escolherMeios(page) {
    await page.selectOption('#ped-meio-entrada', '22');
    await page.selectOption('#ped-meio-saldo', '26');
    await page.selectOption('#ped-vezes-saldo', '3');
    await page.check('#ped-antecipar-saldo');
}

test('pedido guarda meio da entrada e do saldo', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('label[for="ped-forma-pagamento"]')).toHaveText('Plano');
    await expect(page.locator('#ped-vezes-saldo')).toBeHidden();
    await preencher(page, { entrada: 40, status: 'Orçamento' });
    await page.selectOption('#ped-meio-entrada', '22');
    await page.selectOption('#ped-meio-saldo', '26');
    await expect(page.locator('#ped-vezes-saldo')).toBeVisible();
    await expect(page.locator('#ped-vezes-entrada')).toBeHidden();
    await page.selectOption('#ped-vezes-saldo', '3');
    await page.check('#ped-antecipar-saldo');
    await gravar(page);
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.meio_entrada).toEqual({ meio_id: 22, vezes: 1, antecipar: false });
    expect(ped.meio_saldo).toEqual({ meio_id: 26, vezes: 3, antecipar: true });
    await page.evaluate(id => localStorage.setItem('sc_editando_id', String(id)), ped.id);
    await page.goto(BASE + '/pedido.html');
    await expect(page.locator('#ped-meio-entrada')).toHaveValue('22');
    await expect(page.locator('#ped-meio-saldo')).toHaveValue('26');
    await expect(page.locator('#ped-vezes-saldo')).toHaveValue('3');
    await expect(page.locator('#ped-antecipar-saldo')).toBeChecked();
});

test('aprovar copia meio previsto para as parcelas', async ({ page }) => {
    await abrir(page);
    await preencher(page, { entrada: 40 });
    await escolherMeios(page);
    await gravar(page);
    const ped = (await ler(page, 'sc_ped'))[0];
    const cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === ped.id);
    expect(cr.map(c => [c.parcela_tipo, c.meio_previsto])).toEqual([
        ['entrada', { meio_id: 22, vezes: 1, antecipar: false }],
        ['saldo', { meio_id: 26, vezes: 3, antecipar: true }]
    ]);
});

test('plano 100% so pede um meio', async ({ page }) => {
    await abrir(page);
    await page.selectOption('#ped-forma-pagamento', 'À vista');
    await expect(page.locator('#ped-meio-entrada')).toBeVisible();
    await expect(page.locator('#ped-meio-saldo')).toBeHidden();
    await preencher(page, {});
    await page.selectOption('#ped-meio-entrada', '22');
    await gravar(page);
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.meio_entrada.meio_id).toBe(22);
    expect(ped.meio_saldo).toBeNull();
    const cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === ped.id);
    expect(cr.map(c => [c.parcela_tipo, c.meio_previsto && c.meio_previsto.meio_id])).toEqual([['unica', 22]]);
});

test('confirmar pagamento ja vem com o meio previsto de cada parcela', async ({ page }) => {
    await abrir(page);
    await preencher(page, { entrada: 40 });
    await escolherMeios(page);
    await gravar(page);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.locator('#tb-contas-receber button', { hasText: '✓ Recebido' }).first().click();
    const modal = page.locator('#baixa-modal');
    await expect(modal).toBeVisible();
    const linhas = modal.locator('.baixa-linha');
    await expect(linhas).toHaveCount(1);
    await expect(linhas.nth(0).locator('.baixa-meio')).toHaveValue('22');
    await modal.locator('#baixa-cancel').click();
    await page.locator('#tb-contas-receber button', { hasText: '✓ Recebido' }).nth(1).click();
    const l2 = page.locator('#baixa-modal .baixa-linha').first();
    await expect(l2.locator('.baixa-meio')).toHaveValue('26');
    await expect(l2.locator('.baixa-vezes')).toHaveValue('3');
    await expect(l2.locator('.baixa-antecipar')).toBeChecked();
});

test('pedido antigo sem meio continua abrindo e aprovando', async ({ page }) => {
    const antigo = { id: 26400, clienteId: 9, clienteNome: 'Cli Teste', status: 'Orçamento', valor: 1000,
        forma_pagamento: 'À vista', entrada_pct: 100, ambientes: [{ nome: 'Sala', calculado: true, tecidos: [] }], itens: [], data_entrega: '2099-12-01', vendedor_id: 1 };
    await abrir(page, { sc_ped: [antigo], sc_editando_id: 26400 });
    await expect(page.locator('#ped-meio-entrada')).toHaveValue('');
    await page.selectOption('#ped-status', 'Medição');
    await gravar(page);
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.meio_entrada).toBeNull();
    expect(ped.meio_saldo).toBeNull();
    const cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === 26400);
    expect(cr.length).toBe(1);
    expect(cr[0].meio_previsto).toBeNull();
});

test('sem meios configurados o pedido salva normalmente', async ({ page }) => {
    await abrir(page, { sc_contas_fin: [], sc_meios_pag: [] });
    expect(await page.locator('#ped-meio-entrada option').allInnerTexts()).toEqual(['— a definir —']);
    await preencher(page, { entrada: 40 });
    await gravar(page);
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.meio_entrada).toBeNull();
    expect(ped.meio_saldo).toBeNull();
});
