// D3 - pedido de compra marcado Recebido abre a entrada no estoque, pre-preenchida.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const FORN = [{ id: 7, nome: 'RC Tecidos', cnpj: '11.222.333/0001-81' }];
const CAT = [{ id: 1, nome: 'TRICO HERA', referencia: 'TH01', preco_custo: 80, preco: 120, estoque_infinito: false }];
const EST = [{ id: 500, tecido_id: 1, lote: 'TH01', metragem_inicial: 50, metragem_atual: 20, data_entrada: '2026-01-01' }];
const MAT = [{ id: 11, nome: 'TRILHO', referencia: 'TR1', unidade: 'm', preco_custo: 30, preco: 60, estoque_atual: 5 }];
const KITS = [{ id: 21, nome: 'KIT PRONTO', referencia: 'KP1', itens: [], preco_custo: 10, preco: 20, estoque_atual: 2, tipo: 'pronto' }];
const hojeLocal = () => new Date().toLocaleDateString('sv-SE');

const pc = (extra) => ({ id: 5001, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', data_criacao: Date.now(), status: 'Enviado',
    itens: [{ tipo: 'tecido', item_id: 1, item_nome: 'TRICO HERA', unidade: 'm', quantidade: 10, preco_unit: 92, subtotal: 920 },
            { tipo: 'material', item_id: 11, item_nome: 'TRILHO', unidade: 'm', quantidade: 2, preco_unit: 40, subtotal: 80 },
            { tipo: 'material', item_id: null, item_nome: 'FITA LIVRE', unidade: 'un', quantidade: 3, preco_unit: 5, subtotal: 15 }], ...(extra || {}) });

async function abrir(page, pcs) {
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: pcs, sc_cat: CAT, sc_est: EST, sc_mat: MAT, sc_kits: KITS, sc_mov: [], sc_cp: [] });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
}
const receber = (page, id) => page.evaluate(i => { atualizarStatusPC(i, 'Recebido'); }, id || 5001);
// Conta a pagar vem primeiro: "Agora nao" para ir direto a entrada.
async function pularConta(page) { await page.locator('#pcp-agora').click(); }

test('recebido: janela vem preenchida com os itens do pedido', async ({ page }) => {
    await abrir(page, [pc()]);
    await receber(page);
    await pularConta(page);
    const modal = page.locator('#pcent-modal');
    await expect(modal).toContainText('Entrada no estoque — Pedido #');
    await expect(modal.locator('.pcent-metros')).toHaveValue('10');
    await expect(modal.locator('.pcent-lote')).toHaveValue('TH01-A');
    const linhasTec = modal.locator('.pcent-linha[data-tipo="tecido"]');
    await expect(linhasTec.locator('.pcent-custo')).toHaveValue('92');
    await expect(linhasTec.locator('.pcent-margem')).toHaveValue('50');
    await expect(modal.locator('.pcent-linha[data-tipo="material"] .pcent-qtd')).toHaveValue('2');
    await expect(modal.locator('.pcent-linha[data-tipo="material"] .pcent-custo')).toHaveValue('40');
    await expect(modal.locator('#pcent-data')).toHaveValue(hojeLocal());
    await expect(modal.locator('.pcent-sem')).toContainText('sem cadastro — lance à mão');
});

test('confirmar entrada registra como a entrada manual', async ({ page }) => {
    await abrir(page, [pc()]);
    await receber(page);
    await pularConta(page);
    await page.locator('#pcent-modal .pcent-lote').fill('TH01-B');
    await page.locator('#pcent-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_est')).length).toBe(2);
    const est = await lerChave(page, 'sc_est');
    const rolo = est.find(r => r.lote === 'TH01-B');
    expect(rolo).toMatchObject({ tecido_id: 1, metragem_inicial: 10, metragem_atual: 10, data_entrada: hojeLocal() });
    const cat = (await lerChave(page, 'sc_cat'))[0];
    expect(cat.preco_custo).toBe(92);
    expect(cat.preco).toBe(138);
    const mat = (await lerChave(page, 'sc_mat'))[0];
    expect(mat.estoque_atual).toBe(7);
    expect(mat.preco_custo).toBe(40);
    expect(mat.preco).toBe(80);
    const mov = await lerChave(page, 'sc_mov');
    expect(mov).toHaveLength(2);
    expect(mov.find(m => m.item_tipo === 'tecido')).toMatchObject({ tipo: 'Entrada', item_nome: 'TRICO HERA — Código TH01-B', quantidade: 10, unidade: 'm', referencia: 'TH01-B' });
    expect(mov.find(m => m.item_tipo === 'material')).toMatchObject({ tipo: 'Entrada', item_nome: 'TRILHO', quantidade: 2, unidade: 'm' });
    expect((await lerChave(page, 'sc_pc'))[0].entrada_estoque_data).toBe(hojeLocal());
});

test('linha desmarcada nao entra; kit pronto entra por quantidade', async ({ page }) => {
    const p = pc({ itens: [
        { tipo: 'material', item_id: 11, item_nome: 'TRILHO', unidade: 'm', quantidade: 2, preco_unit: 40, subtotal: 80 },
        { tipo: 'kit', item_id: 21, item_nome: 'KIT PRONTO', unidade: 'un', quantidade: 4, preco_unit: 10, subtotal: 40 }] });
    await abrir(page, [p]);
    await receber(page);
    await pularConta(page);
    await page.locator('.pcent-linha[data-tipo="material"] .pcent-marca').uncheck();
    await page.locator('#pcent-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_kits'))[0].estoque_atual).toBe(6);
    expect((await lerChave(page, 'sc_mat'))[0].estoque_atual).toBe(5);
    const mov = await lerChave(page, 'sc_mov');
    expect(mov).toHaveLength(1);
    expect(mov[0]).toMatchObject({ tipo: 'Entrada', item_tipo: 'kit', item_nome: 'KIT PRONTO', quantidade: 4 });
});

test('lancar depois so muda o status', async ({ page }) => {
    await abrir(page, [pc()]);
    await receber(page);
    await pularConta(page);
    await page.locator('#pcent-depois').click();
    await expect(page.locator('#pcent-modal')).toHaveCount(0);
    expect((await lerChave(page, 'sc_pc'))[0].status).toBe('Recebido');
    expect((await lerChave(page, 'sc_pc'))[0].entrada_estoque_data).toBeFalsy();
    expect(await lerChave(page, 'sc_est')).toHaveLength(1);
    expect((await lerChave(page, 'sc_mat'))[0].estoque_atual).toBe(5);
    expect(await lerChave(page, 'sc_mov')).toHaveLength(0);
});

test('marcar Recebido de novo avisa e nao duplica', async ({ page }) => {
    await abrir(page, [pc({ conta_pagar_gerada: true, entrada_estoque_data: '2026-03-05' })]);
    await receber(page);
    await expect(page.locator('#sc-modal-msg')).toContainText('A entrada deste pedido já foi feita em 05/03/2026.');
    await expect(page.locator('#pcent-modal')).toHaveCount(0);
    expect(await lerChave(page, 'sc_est')).toHaveLength(1);
    expect(await lerChave(page, 'sc_mov')).toHaveLength(0);
});

test('conta a pagar continua sendo gerada ao receber', async ({ page }) => {
    await abrir(page, [pc()]);
    await receber(page);
    await page.locator('#pcp-ok').click();
    await expect(page.locator('#pcent-modal')).toBeVisible();
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).length).toBe(1);
    expect((await lerChave(page, 'sc_cp'))[0].pedido_compra_id).toBe(5001);
    await page.locator('#pcent-depois').click();
});

test('pedido so com itens sem cadastro nao abre a janela', async ({ page }) => {
    const p = pc({ conta_pagar_gerada: true, itens: [{ tipo: 'material', item_id: null, item_nome: 'FITA LIVRE', unidade: 'un', quantidade: 3, preco_unit: 5, subtotal: 15 }] });
    await abrir(page, [p]);
    await receber(page);
    await page.waitForTimeout(300);
    await expect(page.locator('#pcent-modal')).toHaveCount(0);
});
