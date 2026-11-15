// Pendencias gerais — carrinho, pedido de compra e historico do fornecedor.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MODAL = '#carrinho-modal';
const ADD = '#carrinho-add-modal';
const FORN = [{ id: 7, nome: 'RC Tecidos' }, { id: 9, nome: 'Trilhos Brasil' }];
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || '[]'), k);
const L = (tipo, id, nome, un, q, p) => ({
    tipo, item_id: id, item_nome: nome, referencia: 'R' + id, unidade: un,
    quantidade: q, preco_unit: p, subtotal: Math.round(q * p * 100) / 100, observacao: ''
});
const MAT = [
    { id: 11, referencia: 'TR-01', nome: 'TRILHO SUIÇO', unidade: 'pct', preco: 48, preco_custo: 30, min_estoque: 0, estoque_atual: 25, fornecedor_id: 9, fornecedor_nome: 'Trilhos Brasil' },
    { id: 12, referencia: 'GA-01', nome: 'GANCHO', unidade: 'un', preco: 2, preco_custo: 1, min_estoque: 0, estoque_atual: 25, fornecedor_id: null, fornecedor_nome: '' }
];

async function abrir(page, extras, pagina = 'fornecedores.html') {
    await entrar(page, BASE, Object.assign({ sc_forn: FORN, sc_cat: [], sc_mat: MAT, sc_pc: [], sc_carrinhos: [], sc_est: [], sc_mov: [] }, extras || {}));
    await page.goto(BASE + '/' + pagina);
}
async function abrirCarrinhoDe(page, nome) {
    await page.click('#btn-abrir-carrinhos');
    await page.locator('#carrinhos-lista-modal .carrinhos-lista-item', { hasText: nome }).click();
    await expect(page.locator(MODAL)).toBeVisible();
}
async function abrirAdicionar(page, nome) {
    await page.click('.tab-btn[data-tab="materiais"]');
    await page.locator('#tb-estoque-mat tr', { hasText: nome }).locator('button[title="Adicionar ao carrinho"]').click();
    await expect(page.locator(ADD)).toBeVisible();
}

// --- Dados ---

test('pedido de compra novo, gravado pelo formulario, nasce com data_envio null', async ({ page }) => {
    await abrir(page);
    await page.click('.forn-tab-btn[data-tab="novo"]');
    await page.selectOption('#pc-fornecedor', '7');
    await page.selectOption('#pc-item-tipo', 'material');
    await page.selectOption('#pc-item-id', '11');
    await page.click('button:has-text("+ Adicionar")');
    await page.click('#pc-btn-salvar');
    const ok = page.locator('#sc-modal-ok');
    await ok.waitFor({ timeout: 3000 }).catch(() => {});
    if (await ok.count()) await ok.click();
    await page.waitForTimeout(400);
    const pcs = await lerChave(page, 'sc_pc');
    expect(pcs.length).toBe(1);
    expect('data_envio' in pcs[0]).toBe(true);
    expect(pcs[0].data_envio).toBeNull();
});

test('historico: pedido sem data de envio nem de criacao nao mostra NaN', async ({ page }) => {
    const pc = { id: 5001, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', status: 'Enviado', itens: [L('material', 1, 'X', 'm', 1, 10)] };
    await abrir(page, { sc_pc: [pc] });
    await page.locator('#tb-fornecedores tr', { hasText: 'RC Tecidos' }).locator('button[aria-label="Ações"]').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Histórico de pedidos' }).click();
    const m = page.locator('#hist-forn-modal');
    await expect(m.locator('tbody tr')).toHaveCount(1);
    await expect(m).not.toContainText('NaN');
});

test('carrinho esvaziado item a item nao deixa registro vazio gravado', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 7, novo: false, atualizado_em: 1, itens: [L('material', 11, 'TRILHO', 'pct', 3, 30)] }] });
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(MODAL + ' .car-remover').click();
    await expect(page.locator(MODAL + ' tbody')).toContainText('O carrinho está vazio.');
    expect(await lerChave(page, 'sc_carrinhos')).toEqual([]);
});

test('registro de carrinho vazio que ja estava gravado some ao carregar', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 7, novo: true, atualizado_em: 1, itens: [] }] });
    expect(await page.evaluate(() => db.carrinhos.length)).toBe(0);
    await expect(page.locator('#carrinhos-contagem')).toBeHidden();
});

// --- Telas e textos ---

test('bloqueio de exclusao diz "1 item" no singular', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 7, novo: false, atualizado_em: 1, itens: [L('material', 11, 'TRILHO', 'pct', 3, 30)] }] });
    await page.locator('#tb-fornecedores tr', { hasText: 'RC Tecidos' }).locator('button[aria-label="Ações"]').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Excluir fornecedor' }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Este fornecedor tem um carrinho aberto com 1 item. Feche ou esvazie o carrinho antes.');
});

test('clicar no ✕ logo depois de editar a quantidade tira o item', async ({ page }) => {
    const itens = [L('material', 11, 'TRILHO', 'pct', 3, 30), L('material', 12, 'GANCHO', 'un', 5, 1)];
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 7, novo: false, atualizado_em: 1, itens }] });
    await abrirCarrinhoDe(page, 'RC Tecidos');
    const linhas = page.locator(MODAL + ' tbody tr');
    await linhas.nth(0).locator('.car-qtd').fill('4');
    await linhas.nth(0).locator('.car-remover').click();
    await expect(linhas).toHaveCount(1);
    await expect(linhas.nth(0)).toContainText('GANCHO');
    const c = (await lerChave(page, 'sc_carrinhos'))[0];
    expect(c.itens.map(i => i.item_id)).toEqual([12]);
});

test('editar a quantidade atualiza subtotal e total sem perder a linha', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 7, novo: false, atualizado_em: 1, itens: [L('material', 11, 'TRILHO', 'pct', 3, 30)] }] });
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(MODAL + ' .car-qtd').fill('1.000');
    await page.locator(MODAL + ' .car-qtd').blur();
    await expect(page.locator(MODAL + ' .car-total')).toContainText('30.000,00');
    expect((await lerChave(page, 'sc_carrinhos'))[0].itens[0].quantidade).toBe(1000);
});

test('Enter com o foco no select de fornecedor confirma a janela de adicionar', async ({ page }) => {
    await abrir(page, {}, 'estoque.html');
    await abrirAdicionar(page, 'GANCHO');
    await page.selectOption(ADD + ' .car-add-forn', '9');
    await page.fill(ADD + ' .car-add-qtd', '2');
    await page.locator(ADD + ' .car-add-forn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(ADD)).toHaveCount(0);
    const c = await lerChave(page, 'sc_carrinhos');
    expect(c.length).toBe(1);
    expect(c[0].fornecedor_id).toBe(9);
    expect(c[0].itens[0].quantidade).toBe(2);
});

test('quantidade segue a regra dos valores: 1.000 = mil, 1,5, 1.250,50, 1250.5', async ({ page }) => {
    await abrir(page, {}, 'estoque.html');
    const casos = [['1.000', 1000], ['1,5', 1.5], ['1.250,50', 1250.5], ['1250.5', 1250.5]];
    for (const [texto, esperado] of casos) {
        await page.evaluate(() => { db.carrinhos = []; syncDB(); });
        await abrirAdicionar(page, 'TRILHO');
        await page.fill(ADD + ' .car-add-qtd', texto);
        await page.click(ADD + ' button:has-text("Adicionar")');
        await expect(page.locator(ADD)).toHaveCount(0);
        const c = await lerChave(page, 'sc_carrinhos');
        expect(c[0].itens[0].quantidade, texto).toBe(esperado);
    }
});

test('estoque de materiais vazio: a linha ocupa as 7 colunas', async ({ page }) => {
    await abrir(page, { sc_mat: [] }, 'estoque.html');
    await page.click('.tab-btn[data-tab="materiais"]');
    const n = await page.evaluate(() => {
        const tb = document.getElementById('tb-estoque-mat');
        return { colspan: Number(tb.querySelector('td').colSpan), colunas: tb.closest('table').querySelectorAll('thead th').length };
    });
    expect(n.colspan).toBe(n.colunas);
});

test('filtro do historico e mantido ao fechar o PDF de um pedido', async ({ page }) => {
    const pc = (id, data, v) => ({ id, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', data_criacao: Date.now(), status: 'Enviado', data_envio: data, itens: [L('material', 1, 'X', 'm', 1, v)] });
    await abrir(page, { sc_pc: [pc(5001, '2026-10-05', 100), pc(5002, '2026-11-02', 250), pc(5003, '2026-09-01', 40)] });
    await page.locator('#tb-fornecedores tr', { hasText: 'RC Tecidos' }).locator('button[aria-label="Ações"]').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Histórico de pedidos' }).click();
    await page.fill('#hist-forn-de', '2026-10-01');
    await page.fill('#hist-forn-ate', '2026-10-31');
    await expect(page.locator('#hist-forn-modal tbody tr')).toHaveCount(1);
    await page.locator('#hist-forn-modal tbody tr').click();
    await expect(page.locator('#doc-modal-overlay.active')).toBeVisible();
    await page.click('#doc-modal-overlay .doc-modal-btn-close');
    await expect(page.locator('#hist-forn-modal')).toBeVisible();
    await expect(page.locator('#hist-forn-de')).toHaveValue('2026-10-01');
    await expect(page.locator('#hist-forn-ate')).toHaveValue('2026-10-31');
    await expect(page.locator('#hist-forn-modal tbody tr')).toHaveCount(1);
});

test('mesmo item com outra unidade vira outra linha no carrinho', async ({ page }) => {
    // o carrinho guardou o TRILHO em "m"; o cadastro agora diz "pct"
    const antigo = L('material', 11, 'TRILHO SUIÇO', 'm', 2, 30);
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 9, novo: false, atualizado_em: 1, itens: [antigo] }] }, 'estoque.html');
    await abrirAdicionar(page, 'TRILHO');
    await page.fill(ADD + ' .car-add-qtd', '3');
    await page.click(ADD + ' button:has-text("Adicionar")');
    await expect(page.locator(ADD)).toHaveCount(0);
    const itens = (await lerChave(page, 'sc_carrinhos'))[0].itens;
    expect(itens.map(i => [i.unidade, i.quantidade])).toEqual([['m', 2], ['pct', 3]]);
});

test('no carrinho, editar/remover mexe so na linha da unidade certa', async ({ page }) => {
    const itens = [L('material', 11, 'TRILHO SUIÇO', 'm', 2, 30), L('material', 11, 'TRILHO SUIÇO', 'pct', 3, 30)];
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 9, novo: false, atualizado_em: 1, itens }] });
    await abrirCarrinhoDe(page, 'Trilhos Brasil');
    await page.locator(MODAL + ' tbody tr').nth(1).locator('.car-remover').click();
    const c = (await lerChave(page, 'sc_carrinhos'))[0];
    expect(c.itens.map(i => i.unidade)).toEqual(['m']);
});

test('carrinho so com itens sem preco pergunta antes de gerar pedido de R$ 0,00', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 7, novo: false, atualizado_em: 1, itens: [L('material', 12, 'GANCHO', 'un', 5, 0)] }] });
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(MODAL + ' button:has-text("Fechar e gerar pedido")').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Os itens deste carrinho estão sem preço: o pedido sai com valor R$ 0,00. Continuar?');
    await page.click('#sc-modal-cancel');
    expect(await lerChave(page, 'sc_pc')).toEqual([]);
    expect((await lerChave(page, 'sc_carrinhos')).length).toBe(1);
    await page.locator(MODAL + ' button:has-text("Fechar e gerar pedido")').click();
    await page.click('#sc-modal-ok');
    await expect(page.locator(MODAL)).toHaveCount(0);
    expect((await lerChave(page, 'sc_pc')).length).toBe(1);
});

test('carrinho com algum item com preco segue a confirmacao de sempre', async ({ page }) => {
    const itens = [L('material', 12, 'GANCHO', 'un', 5, 0), L('material', 11, 'TRILHO', 'pct', 3, 30)];
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 7, novo: false, atualizado_em: 1, itens }] });
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(MODAL + ' button:has-text("Fechar e gerar pedido")').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('90,00');
    await expect(page.locator('#sc-modal-msg')).not.toContainText('sem preço');
});
