// Parte C (Em Fornecedores / Fechar): icone 🛒 na linha, janela do carrinho,
// edicao de quantidade, remocao, fechamento que vira pedido de compra Enviado.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MODAL = '#carrinho-modal';
const FORN = [{ id: 7, nome: 'RC Tecidos' }, { id: 9, nome: 'Trilhos Brasil' }];
const hojeLocal = () => new Date().toLocaleDateString('sv-SE');
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || '[]'), k);

const L = (tipo, id, nome, un, q, p) => ({
    tipo, item_id: id, item_nome: nome, referencia: 'R' + id, unidade: un,
    quantidade: q, preco_unit: p, subtotal: Math.round(q * p * 100) / 100, observacao: ''
});
const carrinho7 = (novo = true) => ({
    fornecedor_id: 7, novo, atualizado_em: 1,
    itens: [L('tecido', 1, 'TRICÔ HERA', 'm', 10, 92.9), L('material', 11, 'TRILHO SUÍÇO', 'pct', 3, 30), L('material', 12, 'GANCHO', 'un', 5, 0)]
});

async function abrir(page, extras, pagina = 'fornecedores.html') {
    await entrar(page, BASE, Object.assign({ sc_forn: FORN, sc_cat: [], sc_mat: [], sc_pc: [], sc_carrinhos: [carrinho7()] }, extras || {}));
    await page.goto(BASE + '/' + pagina);
}
const linha = (page, nome) => page.locator('#tb-fornecedores tr', { hasText: nome });

test('icone mostra contagem e selo novo, que some ao abrir', async ({ page }) => {
    await abrir(page);
    const btn = linha(page, 'RC Tecidos').locator('.btn-carrinho');
    await expect(btn).toContainText('3');
    await expect(btn.locator('.carrinho-selo-novo')).toHaveText('novo');
    await expect(linha(page, 'Trilhos Brasil').locator('.btn-carrinho .carrinho-selo-novo')).toHaveCount(0);
    await expect(linha(page, 'Trilhos Brasil').locator('.btn-carrinho')).not.toContainText(/\d/);
    await btn.click();
    await expect(page.locator(MODAL)).toBeVisible();
    expect((await lerChave(page, 'sc_carrinhos'))[0].novo).toBe(false);
    await expect(btn.locator('.carrinho-selo-novo')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator(MODAL)).toHaveCount(0);
});

test('editar quantidade, remover item e total', async ({ page }) => {
    await abrir(page);
    await linha(page, 'RC Tecidos').locator('.btn-carrinho').click();
    const m = page.locator(MODAL);
    await expect(m).toContainText('RC Tecidos');
    await expect(m.locator('tbody tr')).toHaveCount(3);
    await expect(m.locator('tbody tr').nth(2)).toContainText('sem preço');
    await expect(m.locator('.car-total')).toContainText('1.019,00');
    await m.locator('tbody tr').nth(0).locator('.car-qtd').fill('1,5');
    await m.locator('tbody tr').nth(0).locator('.car-qtd').blur();
    await expect(m.locator('tbody tr').nth(0)).toContainText('139,35');
    await expect(m.locator('.car-total')).toContainText('229,35');
    let c = (await lerChave(page, 'sc_carrinhos'))[0];
    expect(c.itens[0].quantidade).toBe(1.5);
    expect(c.itens[0].subtotal).toBe(139.35);
    await m.locator('tbody tr').nth(1).locator('.car-remover').click();
    await expect(m.locator('tbody tr')).toHaveCount(2);
    await expect(m.locator('.car-total')).toContainText('139,35');
    c = (await lerChave(page, 'sc_carrinhos'))[0];
    expect(c.itens.map(i => i.item_id)).toEqual([1, 12]);
    // contador na linha acompanha
    await page.keyboard.press('Escape');
    await expect(linha(page, 'RC Tecidos').locator('.btn-carrinho')).toContainText('2');
});

test('esvaziar pede confirmacao e remove o carrinho', async ({ page }) => {
    await abrir(page);
    await linha(page, 'RC Tecidos').locator('.btn-carrinho').click();
    await page.locator(MODAL + ' button:has-text("Esvaziar")').click();
    await page.click('#sc-modal-cancel');
    expect((await lerChave(page, 'sc_carrinhos')).length).toBe(1);
    await page.locator(MODAL + ' button:has-text("Esvaziar")').click();
    await page.click('#sc-modal-ok');
    await expect(page.locator(MODAL)).toHaveCount(0);
    expect(await lerChave(page, 'sc_carrinhos')).toEqual([]);
});

test('fechar cria pedido Enviado com data_envio, abre o PDF e esvazia', async ({ page }) => {
    await abrir(page);
    await linha(page, 'RC Tecidos').locator('.btn-carrinho').click();
    await page.locator(MODAL + ' button:has-text("Fechar e enviar ao fornecedor")').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('1.019,00');
    await page.click('#sc-modal-ok');
    await expect(page.locator('#doc-modal-overlay.active')).toBeVisible();
    await expect(page.locator(MODAL)).toHaveCount(0);
    const pcs = await lerChave(page, 'sc_pc');
    expect(pcs.length).toBe(1);
    const p = pcs[0];
    expect(p.status).toBe('Enviado');
    expect(p.data_envio).toBe(hojeLocal());
    expect(p.fornecedor_id).toBe(7);
    expect(p.fornecedor_nome).toBe('RC Tecidos');
    expect(p.itens.length).toBe(3);
    expect(p.observacoes).toBe('');
    expect(typeof p.data_criacao).toBe('number');
    await expect(page.locator('#doc-modal-paper')).toContainText(String(p.id));
    await expect(page.locator('#doc-modal-paper')).toContainText('TRICÔ HERA');
    expect(await lerChave(page, 'sc_carrinhos')).toEqual([]);
});

test('fechar vazio bloqueado e duplo clique cria um so pedido', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 9, itens: [], novo: false, atualizado_em: 1 }, carrinho7(false)] });
    await linha(page, 'Trilhos Brasil').locator('.btn-carrinho').click();
    await expect(page.locator(MODAL + ' button:has-text("Fechar e enviar ao fornecedor")')).toBeDisabled();
    await page.keyboard.press('Escape');
    await linha(page, 'RC Tecidos').locator('.btn-carrinho').click();
    await page.locator(MODAL + ' button:has-text("Fechar e enviar ao fornecedor")').dblclick();
    await page.click('#sc-modal-ok');
    await expect(page.locator('#doc-modal-overlay.active')).toBeVisible();
    await page.waitForTimeout(300);
    expect((await lerChave(page, 'sc_pc')).length).toBe(1);
});

test('pedido fechado aparece no historico e na lista de pedidos de compra', async ({ page }) => {
    await abrir(page);
    await linha(page, 'RC Tecidos').locator('.btn-carrinho').click();
    await page.locator(MODAL + ' button:has-text("Fechar e enviar ao fornecedor")').click();
    await page.click('#sc-modal-ok');
    await expect(page.locator('#doc-modal-overlay.active')).toBeVisible();
    const id = (await lerChave(page, 'sc_pc'))[0].id;
    await page.goto(BASE + '/fornecedores.html');
    await linha(page, 'RC Tecidos').locator('button[aria-label="Ações"]').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Histórico de pedidos' }).click();
    const h = page.locator('#hist-forn-modal');
    await expect(h.locator('tbody tr')).toHaveCount(1);
    await expect(h).toContainText('#' + id);
    await expect(h).toContainText('Enviado');
    await expect(h).toContainText('1.019,00');
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
    await expect(page.locator('#tb-pedidos-compra')).toContainText('#' + id);
    await expect(page.locator('#tb-pedidos-compra')).toContainText('Enviado');
});

test('excluir fornecedor com carrinho aberto e bloqueado', async ({ page }) => {
    await abrir(page);
    await linha(page, 'RC Tecidos').locator('button[aria-label="Ações"]').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Excluir fornecedor' }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Este fornecedor tem um carrinho aberto com 3 itens. Feche ou esvazie o carrinho antes.');
    await page.click('#sc-modal-ok');
    expect((await lerChave(page, 'sc_forn')).length).toBe(2);
});

test('sem fornecedores completo o carrinho e so leitura', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: [], sc_carrinhos: [carrinho7()] });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].permissoes_extras = { fornecedores: { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/fornecedores.html');
    await linha(page, 'RC Tecidos').locator('.btn-carrinho').click();
    const m = page.locator(MODAL);
    await expect(m.locator('tbody tr')).toHaveCount(3);
    await expect(m.locator('.car-qtd')).toHaveCount(0);
    await expect(m.locator('.car-remover')).toHaveCount(0);
    await expect(m.locator('button:has-text("Esvaziar")')).toHaveCount(0);
    await expect(m.locator('button:has-text("Fechar e enviar ao fornecedor")')).toHaveCount(0);
    await expect(m.locator('.car-total')).toContainText('1.019,00');
});
