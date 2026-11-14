// Parte C (Adicionar) e A4/A5: "🛒 Adicionar ao carrinho" no Estoque, no
// Catalogo e na selecao de varios itens; o ajuste manual de estoque vai para o ⋮.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MENU = '#menu-acoes-flutuante';
const MODAL = '#carrinho-add-modal';
const itensMenu = page => page.locator(MENU + ' .menu-acoes-item');

const FORN = [{ id: 7, nome: 'RC Tecidos' }, { id: 9, nome: 'Trilhos Brasil' }];
const CAT = [
    { id: 1, referencia: '0001', nome: 'TRICÔ HERA',   preco: 167.3, preco_custo: 92.9, largura_rolo: 1.4, min_estoque: 10, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos' },
    { id: 2, referencia: '0002', nome: 'LINHO BELGA',  preco: 65,    preco_custo: 36,   largura_rolo: 2.8, min_estoque: 10, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos' },
    { id: 3, referencia: '0003', nome: 'BLACKOUT SP',  preco: 240,   preco_custo: 120,  largura_rolo: 2.8, min_estoque: 0,  fornecedor_id: 9, fornecedor_nome: 'Trilhos Brasil' },
    { id: 4, referencia: '0004', nome: 'VOIL CRISTAL', preco: 32.5,  preco_custo: 15,   largura_rolo: 3,   min_estoque: 0,  fornecedor_id: null, fornecedor_nome: '' }
];
const MAT = [
    { id: 11, referencia: 'TR-01', nome: 'TRILHO SUÍÇO', unidade: 'pct', preco: 48, preco_custo: 30, min_estoque: 20, estoque_atual: 25, fornecedor_id: 9, fornecedor_nome: 'Trilhos Brasil' }
];
const KITS = [{ id: 32, tipo: 'pronto', referencia: 'K2', nome: 'KIT PRONTO', preco: 50, preco_custo: 30, estoque_atual: 3, itens: [] }];
const EST = [{ id: 1, tecido_id: 1, lote: 'L-01', metragem_inicial: 30, metragem_atual: 25, data_entrada: '2026-10-05' }];

async function abrir(page, pagina, extras) {
    await entrar(page, BASE, Object.assign({
        sc_forn: FORN, sc_cat: CAT, sc_mat: MAT, sc_kits: KITS, sc_est: EST, sc_mov: [], sc_ped: [], sc_pc: [], sc_carrinhos: []
    }, extras || {}));
    await page.goto(BASE + '/' + pagina);
}
const carrinhos = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_carrinhos') || '[]'));
const cadastro = (page, chave) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), chave);

async function adicionarNoEstoqueTecido(page, nome, qtd) {
    await page.locator('.est-tec-linha', { hasText: nome }).locator('button[title="Adicionar ao carrinho"]').click();
    await expect(page.locator(MODAL)).toBeVisible();
    await page.fill(MODAL + ' .car-add-qtd', qtd);
    await page.click(MODAL + ' button:has-text("Adicionar")');
}

test('material vai para o carrinho do seu fornecedor com a unidade do cadastro', async ({ page }) => {
    await abrir(page, 'estoque.html');
    await page.click('.tab-btn[data-tab="materiais"]');
    await page.locator('#tb-estoque-mat tr', { hasText: 'TRILHO SUÍÇO' }).locator('button[title="Adicionar ao carrinho"]').click();
    const modal = page.locator(MODAL);
    await expect(modal).toContainText('TRILHO SUÍÇO');
    await expect(modal).toContainText('Trilhos Brasil');
    await expect(modal.locator('.car-add-un')).toHaveText('pct');
    await page.fill(MODAL + ' .car-add-qtd', '3');
    await page.click(MODAL + ' button:has-text("Adicionar")');
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.sc-toast').last()).toHaveText('Adicionado ao carrinho de Trilhos Brasil');

    const c = await carrinhos(page);
    expect(c.length).toBe(1);
    expect(c[0].fornecedor_id).toBe(9);
    expect(c[0].novo).toBe(true);
    expect(c[0].itens).toEqual([{
        tipo: 'material', item_id: 11, item_nome: 'TRILHO SUÍÇO', referencia: 'TR-01', unidade: 'pct',
        quantidade: 3, preco_unit: 30, subtotal: 90, observacao: ''
    }]);
});

test('tecido em metros aceita 1,5', async ({ page }) => {
    await abrir(page, 'estoque.html');
    await page.locator('.est-tec-linha', { hasText: 'TRICÔ HERA' }).locator('button[title="Adicionar ao carrinho"]').click();
    await expect(page.locator(MODAL + ' .car-add-un')).toHaveText('m');
    await expect(page.locator('#tb-estoque .est-rolos-tabela'), 'o botao nao abre os rolos').toHaveCount(0);
    await page.fill(MODAL + ' .car-add-qtd', '1,5');
    await page.click(MODAL + ' button:has-text("Adicionar")');
    await expect(page.locator(MODAL)).toHaveCount(0);
    const c = await carrinhos(page);
    expect(c[0].fornecedor_id).toBe(7);
    expect(c[0].itens[0]).toMatchObject({ tipo: 'tecido', item_id: 1, unidade: 'm', quantidade: 1.5, preco_unit: 92.9, subtotal: 139.35 });
});

test('mesmo item soma', async ({ page }) => {
    await abrir(page, 'estoque.html');
    // quantidade invalida fica no modal, com o aviso dentro dele
    await page.locator('.est-tec-linha', { hasText: 'LINHO BELGA' }).locator('button[title="Adicionar ao carrinho"]').click();
    await page.fill(MODAL + ' .car-add-qtd', '0');
    await page.click(MODAL + ' button:has-text("Adicionar")');
    await expect(page.locator(MODAL + ' .car-add-erro')).toContainText('quantidade');
    await page.keyboard.press('Escape');
    await expect(page.locator(MODAL)).toHaveCount(0);
    expect(await carrinhos(page)).toEqual([]);

    await adicionarNoEstoqueTecido(page, 'LINHO BELGA', '2');
    await expect(page.locator(MODAL)).toHaveCount(0);
    await adicionarNoEstoqueTecido(page, 'LINHO BELGA', '1,5');
    await expect(page.locator(MODAL)).toHaveCount(0);
    const c = await carrinhos(page);
    expect(c.length).toBe(1);
    expect(c[0].itens.length).toBe(1);
    expect(c[0].itens[0]).toMatchObject({ quantidade: 3.5, subtotal: 126 });
});

test('item sem fornecedor pede e grava no cadastro', async ({ page }) => {
    await abrir(page, 'estoque.html');
    await page.locator('.est-tec-linha', { hasText: 'VOIL CRISTAL' }).locator('button[title="Adicionar ao carrinho"]').click();
    const sel = page.locator(MODAL + ' select.car-add-forn');
    await expect(sel).toBeVisible();
    await page.fill(MODAL + ' .car-add-qtd', '2');
    await page.click(MODAL + ' button:has-text("Adicionar")');
    await expect(page.locator(MODAL + ' .car-add-erro')).toContainText('fornecedor');
    expect(await carrinhos(page)).toEqual([]);

    await sel.selectOption('7');
    await page.click(MODAL + ' button:has-text("Adicionar")');
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator('.sc-toast').last()).toHaveText('Adicionado ao carrinho de RC Tecidos');
    const c = await carrinhos(page);
    expect(c[0].fornecedor_id).toBe(7);
    const voil = (await cadastro(page, 'sc_cat')).find(x => x.id === 4);
    expect(voil.fornecedor_id).toBe(7);
    expect(voil.fornecedor_nome).toBe('RC Tecidos');
    await expect(page.locator('.est-tec-linha', { hasText: 'VOIL CRISTAL' })).toContainText('RC Tecidos');

    // na proxima vez nao pergunta de novo
    await page.locator('.est-tec-linha', { hasText: 'VOIL CRISTAL' }).locator('button[title="Adicionar ao carrinho"]').click();
    await expect(page.locator(MODAL)).toContainText('RC Tecidos');
    await expect(page.locator(MODAL + ' select.car-add-forn')).toHaveCount(0);
});

test('selecao de varios itens vai para varios carrinhos com resumo', async ({ page }) => {
    await abrir(page, 'catalogo.html');
    await page.check('#chk-tec-todos');
    await page.click('#sel-tec-barra button:has-text("Adicionar ao carrinho")');
    const modal = page.locator(MODAL);
    await expect(modal.locator('.car-add-linha')).toHaveCount(4);
    await expect(modal.locator('select.car-add-forn'), 'so o item sem fornecedor pergunta').toHaveCount(1);
    for (const nome of ['TRICÔ HERA', 'LINHO BELGA', 'BLACKOUT SP', 'VOIL CRISTAL']) {
        await modal.locator('.car-add-linha', { hasText: nome }).locator('.car-add-qtd').fill('2');
    }
    // falta o fornecedor do VOIL: nada e gravado
    await page.click(MODAL + ' button:has-text("Adicionar")');
    await expect(modal.locator('.car-add-linha', { hasText: 'VOIL CRISTAL' }).locator('.car-add-erro')).toContainText('fornecedor');
    expect(await carrinhos(page)).toEqual([]);

    await modal.locator('select.car-add-forn').selectOption('9');
    await page.click(MODAL + ' button:has-text("Adicionar")');
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.sc-toast').last()).toHaveText('4 itens adicionados em 2 carrinhos');
    await expect(page.locator('#sel-tec-barra'), 'a selecao some').toBeHidden();

    const c = await carrinhos(page);
    const de = id => c.find(x => x.fornecedor_id === id).itens.map(i => i.item_nome).sort();
    expect(de(7)).toEqual(['LINHO BELGA', 'TRICÔ HERA']);
    expect(de(9)).toEqual(['BLACKOUT SP', 'VOIL CRISTAL']);
    expect((await cadastro(page, 'sc_cat')).find(x => x.id === 4).fornecedor_id).toBe(9);
});

test('ajustar estoque continua no ⋮ do estoque', async ({ page }) => {
    await abrir(page, 'estoque.html');
    await page.click('.tab-btn[data-tab="materiais"]');
    const linha = page.locator('#tb-estoque-mat tr', { hasText: 'TRILHO SUÍÇO' });
    await expect(linha.locator('td.col-acoes button')).toHaveCount(2);   // 🛒 + ⋮
    await linha.locator('button[aria-label="Ações"]').click();
    await expect(itensMenu(page)).toHaveText([/Ajustar estoque$/]);
    await itensMenu(page).first().click();
    await expect(page.locator('#ajuste-11')).toBeVisible();

    await page.click('.tab-btn[data-tab="kits"]');
    const kit = page.locator('#tb-kits tr', { hasText: 'KIT PRONTO' });
    await kit.locator('button[aria-label="Ações"]').click();
    await expect(itensMenu(page).first()).toHaveText(/Ajustar estoque$/);
    await itensMenu(page).first().click();
    await expect(page.locator('#ajuste-kit-32')).toBeVisible();
});

test('sem estoque completo nao ve o botao', async ({ page }) => {
    await abrir(page, 'estoque.html', { sc_usr: [{
        id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, senha_hash: '',
        permissoes_extras: { estoque: { nivel: 'visualizar', acoes_restritas: [] } }
    }] });
    await expect(page.locator('.est-tec-linha')).toHaveCount(4);
    await expect(page.locator('#tb-estoque button[title="Adicionar ao carrinho"]')).toHaveCount(0);
    await page.click('.tab-btn[data-tab="materiais"]');
    await expect(page.locator('#tb-estoque-mat tr:not(.ajuste-form)', { hasText: 'TRILHO SUÍÇO' })).toBeVisible();
    await expect(page.locator('#tb-estoque-mat button[title="Adicionar ao carrinho"]')).toHaveCount(0);

    await page.goto(BASE + '/catalogo.html');
    await page.locator('#tb-catalogo tr', { hasText: 'LINHO BELGA' }).locator('button[aria-label="Ações"]').click();
    await expect(itensMenu(page).filter({ hasText: 'Editar' })).toHaveCount(1);
    await expect(itensMenu(page).filter({ hasText: 'Adicionar ao carrinho' })).toHaveCount(0);
    await expect(page.locator('#sel-tec-barra button:has-text("Adicionar ao carrinho")')).toHaveCount(0);
    await page.evaluate(() => abrirAdicionarAoCarrinho('tecido', 2));
    await expect(page.locator(MODAL)).toHaveCount(0);
});

test('catalogo e detalhes do tecido: 🛒 Adicionar ao carrinho', async ({ page }) => {
    await abrir(page, 'catalogo.html');
    await page.locator('#tb-catalogo tr', { hasText: 'LINHO BELGA' }).locator('button[aria-label="Ações"]').click();
    await itensMenu(page).filter({ hasText: 'Adicionar ao carrinho' }).click();
    await expect(page.locator(MODAL)).toContainText('LINHO BELGA');
    await page.keyboard.press('Escape');
    await expect(page.locator(MODAL)).toHaveCount(0);

    await page.locator('#tb-catalogo tr', { hasText: 'LINHO BELGA' }).locator('td.col-nome span').click();
    await page.click('.modal-overlay button:has-text("Adicionar ao carrinho")');
    await expect(page.locator('.modal-overlay'), 'sem janela empilhada').toHaveCount(0);
    await expect(page.locator(MODAL)).toContainText('LINHO BELGA');
});

test('somar 2,2 e 1,1 da 3,3 no carrinho e sem ruido no PDF do pedido', async ({ page }) => {
    await abrir(page, 'estoque.html');
    await adicionarNoEstoqueTecido(page, 'LINHO BELGA', '2,2');
    await expect(page.locator(MODAL)).toHaveCount(0);
    await adicionarNoEstoqueTecido(page, 'LINHO BELGA', '1,1');
    await expect(page.locator(MODAL)).toHaveCount(0);
    expect((await carrinhos(page))[0].itens[0].quantidade).toBe(3.3);
    await page.goto(BASE + '/fornecedores.html');
    await page.click('#btn-abrir-carrinhos');
    await page.locator('#carrinhos-lista-modal .carrinhos-lista-item', { hasText: 'RC Tecidos' }).click();
    await expect(page.locator('#carrinho-modal .car-qtd')).toHaveValue('3,3');
    await page.locator('#carrinho-modal button:has-text("Fechar e gerar pedido")').click();
    await page.click('#sc-modal-ok');
    await page.evaluate(() => abrirPedidoCompra(JSON.parse(localStorage.getItem('sc_pc'))[0].id));
    const papel = page.locator('#doc-modal-paper');
    await expect(papel).toContainText('LINHO BELGA');
    // o PDF do pedido usa ponto decimal (como nos precos); o que importa e nao ter ruido
    await expect(papel).toContainText(/(^|[^0-9.])3[.]3([^0-9]|$)/);
    await expect(papel).not.toContainText('3.30000');
});

test('sem estoque completo a coluna Acoes do Estoque de tecidos some inteira', async ({ page }) => {
    await abrir(page, 'estoque.html', { sc_usr: [{
        id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, senha_hash: '',
        permissoes_extras: { estoque: { nivel: 'visualizar', acoes_restritas: [] } }
    }] });
    await expect(page.locator('.est-tec-linha')).toHaveCount(4);
    await expect(page.locator('#th-estoque-acoes')).toBeHidden();
    const cabecalhos = await page.locator('table:has(#tb-estoque) thead th:visible').count();
    const celulas = await page.locator('.est-tec-linha').first().locator('td:visible').count();
    expect(celulas).toBe(cabecalhos);
});

test('com estoque completo a coluna Acoes continua alinhada', async ({ page }) => {
    await abrir(page, 'estoque.html');
    const cabecalhos = await page.locator('table:has(#tb-estoque) thead th:visible').count();
    const celulas = await page.locator('.est-tec-linha').first().locator('td:visible').count();
    expect(celulas).toBe(cabecalhos);
    await expect(page.locator('#th-estoque-acoes')).toBeVisible();
});
