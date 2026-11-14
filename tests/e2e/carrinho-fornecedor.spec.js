// Carrinhos por fornecedor: botao "🛒 Abrir carrinhos" no topo (com contagem
// de carrinhos com item novo, tambem no menu lateral), janela do carrinho,
// edicao, remocao e "Fechar e gerar pedido" (pedido em Rascunho, levado para
// Pedidos de Compra, de onde se envia com o 📨 Enviar).
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
async function abrirCarrinhoDe(page, nome) {
    await page.click('#btn-abrir-carrinhos');
    await page.locator('#carrinhos-lista-modal .carrinhos-lista-item', { hasText: nome }).click();
    await expect(page.locator(MODAL)).toBeVisible();
}
const FECHAR = MODAL + ' button:has-text("Fechar e gerar pedido")';

test('o carrinho saiu da linha do fornecedor e foi para o botao Abrir carrinhos', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#tb-fornecedores .btn-carrinho')).toHaveCount(0);
    const btn = page.locator('#btn-abrir-carrinhos');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Abrir carrinhos');
    // fica no topo, do lado direito da tela
    const b = await btn.boundingBox();
    const vw = page.viewportSize().width;
    expect(b.x + b.width / 2).toBeGreaterThan(vw * 0.6);
    expect(b.y).toBeLessThan(100);
});

test('contagem de carrinhos com item novo no botao e no menu lateral; some ao abrir', async ({ page }) => {
    const c9 = { fornecedor_id: 9, novo: true, atualizado_em: 1, itens: [L('material', 20, 'SUPORTE', 'un', 2, 5)] };
    await abrir(page, { sc_carrinhos: [carrinho7(), c9] });
    await expect(page.locator('#carrinhos-contagem')).toHaveText('2');
    await expect(page.locator('#nav-selo-carrinhos')).toHaveText('2');
    await page.click('#btn-abrir-carrinhos');
    const lista = page.locator('#carrinhos-lista-modal .carrinhos-lista-item');
    await expect(lista).toHaveCount(2);
    await expect(lista.filter({ hasText: 'RC Tecidos' })).toContainText('3 itens');
    await expect(lista.filter({ hasText: 'RC Tecidos' })).toContainText('1.019,00');
    await expect(lista.filter({ hasText: 'RC Tecidos' }).locator('.carrinho-selo-novo')).toHaveText('novo');
    await lista.filter({ hasText: 'RC Tecidos' }).click();
    await expect(page.locator(MODAL)).toBeVisible();
    expect((await lerChave(page, 'sc_carrinhos')).find(c => c.fornecedor_id === 7).novo).toBe(false);
    await expect(page.locator('#carrinhos-contagem')).toHaveText('1');
    await expect(page.locator('#nav-selo-carrinhos')).toHaveText('1');
    await page.keyboard.press('Escape');
    await abrirCarrinhoDe(page, 'Trilhos Brasil');
    await expect(page.locator('#carrinhos-contagem')).toBeHidden();
    await expect(page.locator('#nav-selo-carrinhos')).toBeHidden();
});

test('a bolinha de Fornecedores aparece no menu lateral de outras telas', async ({ page }) => {
    await abrir(page, {}, 'index.html');
    await expect(page.locator('a.nav-item[href="fornecedores.html"] #nav-selo-carrinhos')).toHaveText('1');
    await expect(page.locator('a.nav-item[href="fornecedores.html"] #nav-selo-carrinhos')).toBeVisible();
});

test('sem carrinho com itens a lista avisa', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [] });
    await expect(page.locator('#carrinhos-contagem')).toBeHidden();
    await page.click('#btn-abrir-carrinhos');
    await expect(page.locator('#carrinhos-lista-modal')).toContainText('Nenhum carrinho com itens');
});

test('editar quantidade, remover item e total', async ({ page }) => {
    await abrir(page);
    await abrirCarrinhoDe(page, 'RC Tecidos');
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
    await page.keyboard.press('Escape');
    await page.click('#btn-abrir-carrinhos');
    await expect(page.locator('#carrinhos-lista-modal .carrinhos-lista-item', { hasText: 'RC Tecidos' })).toContainText('2 itens');
});

test('esvaziar pede confirmacao e remove o carrinho', async ({ page }) => {
    await abrir(page);
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(MODAL + ' button:has-text("Esvaziar")').click();
    await page.click('#sc-modal-cancel');
    expect((await lerChave(page, 'sc_carrinhos')).length).toBe(1);
    await page.locator(MODAL + ' button:has-text("Esvaziar")').click();
    await page.click('#sc-modal-ok');
    await expect(page.locator(MODAL)).toHaveCount(0);
    expect(await lerChave(page, 'sc_carrinhos')).toEqual([]);
});

test('Fechar e gerar pedido: pedido em Rascunho, vai para Pedidos de Compra e esvazia', async ({ page }) => {
    await abrir(page);
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(FECHAR).click();
    await expect(page.locator('#sc-modal-msg')).toContainText('1.019,00');
    await expect(page.locator('#sc-modal-msg')).toContainText('Pedidos de Compra');
    await page.click('#sc-modal-ok');
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator('#doc-modal-overlay.active'), 'nao abre mais o PDF direto').toHaveCount(0);
    await expect(page.locator('#tab-forn-pedidos')).toHaveClass(/active/);
    const pcs = await lerChave(page, 'sc_pc');
    expect(pcs.length).toBe(1);
    const p = pcs[0];
    expect(p.status).toBe('Rascunho');
    expect(p.data_envio).toBeNull();
    expect(p.fornecedor_id).toBe(7);
    expect(p.fornecedor_nome).toBe('RC Tecidos');
    expect(p.itens.length).toBe(3);
    expect(p.observacoes).toBe('');
    expect(typeof p.data_criacao).toBe('number');
    const tr = page.locator(`#tb-pedidos-compra tr[data-pc-id="${p.id}"]`);
    await expect(tr).toHaveClass(/pc-destaque/);
    await expect(tr).toContainText('Rascunho');
    await expect(tr.locator('.pc-enviar-btn')).toBeVisible();
    expect(await lerChave(page, 'sc_carrinhos')).toEqual([]);
});

test('fechar vazio bloqueado e duplo clique cria um so pedido', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [{ fornecedor_id: 9, itens: [], novo: false, atualizado_em: 1 }, carrinho7(false)] });
    await page.evaluate(() => abrirCarrinho(9));
    await expect(page.locator(FECHAR)).toBeDisabled();
    await page.keyboard.press('Escape');
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(FECHAR).dblclick();
    await page.click('#sc-modal-ok');
    await expect(page.locator('#tab-forn-pedidos')).toHaveClass(/active/);
    await page.waitForTimeout(300);
    expect((await lerChave(page, 'sc_pc')).length).toBe(1);
});

test('em Pedidos de Compra, 📨 Enviar abre o envio e marca como Enviado', async ({ page }) => {
    await page.addInitScript(() => { navigator.canShare = undefined; navigator.share = undefined; });
    await abrir(page, { sc_forn: [{ id: 7, nome: 'RC Tecidos', tel: '(11) 3333-4444', tel_vendedor: '(11) 98888-7777' }, FORN[1]] });
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(FECHAR).click();
    await page.click('#sc-modal-ok');
    const id = (await lerChave(page, 'sc_pc'))[0].id;
    await page.locator(`#tb-pedidos-compra tr[data-pc-id="${id}"] .pc-enviar-btn`).click();
    await expect(page.locator('#doc-modal-overlay.active')).toBeVisible();
    const menu = page.locator('#menu-enviar-doc');
    await expect(menu, 'o menu de envio ja abre').toBeVisible();
    // o WhatsApp vai para o telefone do vendedor
    expect(await page.evaluate(() => _envioDocAtual.tel)).toBe('11988887777');
    // sem compartilhamento de arquivo: baixa o PDF e oferece "Ja enviei"
    const dl = page.waitForEvent('download', { timeout: 45000 });
    await menu.locator('[data-acao="compartilhar"]').click();
    await dl;
    await page.locator('#compartilhar-alternativa button:has-text("Já enviei")').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('Marcar o pedido #' + id);
    await page.click('#sc-modal-ok');
    await expect.poll(async () => (await lerChave(page, 'sc_pc'))[0].status).toBe('Enviado');
    expect((await lerChave(page, 'sc_pc'))[0].data_envio).toBe(hojeLocal());
});

test('compartilhar com sucesso pergunta se marca como Enviado', async ({ page }) => {
    await page.addInitScript(() => {
        navigator.canShare = () => true;
        navigator.share = async () => {};
    });
    await abrir(page, { sc_carrinhos: [], sc_pc: [{ id: 26100, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', status: 'Rascunho', data_criacao: Date.now(), data_envio: null, itens: [], observacoes: '' }] });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
    await page.locator('#tb-pedidos-compra tr[data-pc-id="26100"] .pc-enviar-btn').click();
    await page.locator('#menu-enviar-doc [data-acao="compartilhar"]').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('Marcar o pedido #26100 como Enviado?', { timeout: 45000 });
    await page.click('#sc-modal-cancel');
    expect((await lerChave(page, 'sc_pc'))[0].status, 'Agora nao mantem Rascunho').toBe('Rascunho');
});

test('pedido fechado aparece no historico e na lista de pedidos de compra', async ({ page }) => {
    await abrir(page);
    await abrirCarrinhoDe(page, 'RC Tecidos');
    await page.locator(FECHAR).click();
    await page.click('#sc-modal-ok');
    await expect(page.locator('#tab-forn-pedidos')).toHaveClass(/active/);
    const id = (await lerChave(page, 'sc_pc'))[0].id;
    // o historico do fornecedor lista o que foi enviado
    await page.locator(`#tb-pedidos-compra tr[data-pc-id="${id}"] select`).selectOption('Enviado');
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
});

test('Telefone vendedor: cadastra, edita e aparece na lista', async ({ page }) => {
    await abrir(page, { sc_carrinhos: [] });
    await page.fill('#forn-cnpj', '11.222.333/0001-81');
    await page.fill('#forn-nome', 'Persianas Sul');
    await page.fill('#forn-tel', '(48) 3333-0000');
    await page.fill('#forn-tel-vendedor', '(48) 99999-0000');
    await page.click('#forn-btn-salvar');
    await expect(linha(page, 'Persianas Sul')).toContainText('Vendedor: (48) 99999-0000');
    const f = (await lerChave(page, 'sc_forn')).find(x => x.nome === 'Persianas Sul');
    expect(f.tel_vendedor).toBe('(48) 99999-0000');
    await linha(page, 'Persianas Sul').locator('button[aria-label="Ações"]').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Editar fornecedor' }).click();
    await expect(page.locator('#forn-tel-vendedor')).toHaveValue('(48) 99999-0000');
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
    await abrirCarrinhoDe(page, 'RC Tecidos');
    const m = page.locator(MODAL);
    await expect(m.locator('tbody tr')).toHaveCount(3);
    await expect(m.locator('.car-qtd')).toHaveCount(0);
    await expect(m.locator('.car-remover')).toHaveCount(0);
    await expect(m.locator('button:has-text("Esvaziar")')).toHaveCount(0);
    await expect(m.locator('button:has-text("Fechar e gerar pedido")')).toHaveCount(0);
    await expect(m.locator('.car-total')).toContainText('1.019,00');
});
