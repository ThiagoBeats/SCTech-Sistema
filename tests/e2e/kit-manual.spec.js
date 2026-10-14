const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const MATERIAIS = [{ id: 21, referencia: 'TR-01', nome: 'TRILHO', unidade: 'm', preco: 40, estoque_atual: 100 }];
const TECIDOS   = [{ id: 1, referencia: '0001', nome: 'TRICÔ HERA', preco: 160, preco_custo: 80, largura_rolo: 1.4, min_estoque: 10 }];

async function semear(page, pagina, extras) {
    await entrar(page, BASE);
    await page.goto(BASE + '/' + pagina);
    await page.evaluate(d => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify(d.cat || []));
        localStorage.setItem('sc_mat', JSON.stringify(d.mat || []));
        localStorage.setItem('sc_kits', JSON.stringify(d.kits || []));
        localStorage.setItem('sc_est', JSON.stringify([]));
        localStorage.setItem('sc_ped', JSON.stringify([]));
    }, extras || {});
    await page.reload();
}

async function abrirKitsDoEstoque(page, extras) {
    await semear(page, 'estoque.html', extras || { mat: MATERIAIS });
    await page.click('button[data-tab="kits"]');
}

async function abrirKitsDoCatalogo(page, extras) {
    await semear(page, 'catalogo.html', extras || {});
    await page.click('button[data-tab="cat-kits"]');
}

// ─── Kit de montagem (Estoque): agora com código ────────────────────────

test('o kit de montagem tem campo de codigo e ele e obrigatorio', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirKitsDoEstoque(page);
    await expect(page.locator('#kit-ref')).toBeVisible();

    await page.fill('#kit-nome', 'Kit sem codigo');
    await page.selectOption('#kit-item-mat', '21');
    await page.click('button:has-text("+ Adicionar Item")');
    await page.click('button:has-text("Salvar Kit")');

    await expect(page.locator('#sc-modal-msg')).toContainText('Informe o código do kit');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => db.kits.length), 'nada pode ter sido salvo').toBe(0);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('o codigo do kit nao pode repetir o de um tecido, material ou kit', async ({ page }) => {
    await abrirKitsDoEstoque(page, {
        mat: MATERIAIS, cat: TECIDOS,
        kits: [{ id: 300, tipo: 'pronto', referencia: '5501', nome: 'KIT PRONTO', itens: [] }]
    });

    const tentar = async (codigo, trecho) => {
        await page.fill('#kit-ref', codigo);
        await page.fill('#kit-nome', 'Kit teste');
        await page.selectOption('#kit-item-mat', '21');
        await page.click('button:has-text("+ Adicionar Item")');
        await page.click('button:has-text("Salvar Kit")');
        await expect(page.locator('#sc-modal-msg')).toContainText(trecho);
        await page.click('#sc-modal-ok');
    };
    await tentar('0001', 'o tecido "TRICÔ HERA"');
    await tentar('TR-01', 'o material "TRILHO"');
    await tentar('5501', 'o kit "KIT PRONTO"');

    expect(await page.evaluate(() => db.kits.length), 'nenhum kit novo').toBe(1);
});

test('com codigo livre, o kit de montagem salva e mostra o codigo', async ({ page }) => {
    await abrirKitsDoEstoque(page);
    await page.fill('#kit-ref', 'kit-sala');
    await page.fill('#kit-nome', 'Kit Cortina Sala');
    await page.selectOption('#kit-item-mat', '21');
    await page.fill('#kit-item-qtd', '3');
    await page.click('button:has-text("+ Adicionar Item")');
    await page.click('button:has-text("Salvar Kit")');

    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);
    const k = await page.evaluate(() => db.kits[0]);
    expect(k.referencia, 'o código é normalizado em maiúsculas').toBe('KIT-SALA');
    expect(k.itens.length).toBe(1);
    await expect(page.locator('#tb-kits tr').first()).toContainText('KIT-SALA');
});

// ─── Kit pronto (Catálogo) ──────────────────────────────────────────────

test('a aba Kits do catalogo cria kit pronto, sem materiais', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirKitsDoCatalogo(page);
    await expect(page.locator('#tab-cat-kits')).toContainText('Criar Kit Pronto');
    await expect(page.locator('#tab-cat-kits')).toContainText('sem descrever os materiais');

    // os campos do kit pronto
    for (const id of ['#kp-ref', '#kp-nome', '#kp-medida', '#kp-desc', '#kp-custo']) {
        await expect(page.locator(id)).toBeVisible();
    }
    // e nenhum campo de montagem
    expect(await page.locator('#kit-item-mat').count()).toBe(0);
    expect(await page.locator('#tb-kit-draft').count()).toBe(0);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('os quatro cartoes aparecem e a venda e calculada ao vivo', async ({ page }) => {
    await abrirKitsDoCatalogo(page);

    const titulos = await page.locator('#kp-cfg .imp-cfg-titulo').allInnerTexts();
    expect(titulos).toEqual(['Definir margem total', 'Definir margem depois', 'Estoque infinito', 'Ajustar estoque']);

    await expect(page.locator('#kp-venda')).toHaveText('—');
    await page.fill('#kp-custo', '100');
    await page.fill('#kp-markup', '50');
    await expect(page.locator('#kp-venda')).toHaveText('R$ 150.00');

    await page.fill('#kp-markup', '0');
    await expect(page.locator('#kp-venda')).toHaveText('R$ 100.00');
});

test('escolher "margem depois" tira o campo e deixa a venda igual ao custo', async ({ page }) => {
    await abrirKitsDoCatalogo(page);
    await page.fill('#kp-custo', '100');
    await page.fill('#kp-markup', '50');
    await expect(page.locator('#kp-venda')).toHaveText('R$ 150.00');

    await page.click('input[name="kp-cfg-margem"][value="item"]');
    expect(await page.locator('#kp-markup').count(), 'o campo de margem some').toBe(0);
    await expect(page.locator('#kp-venda')).toHaveText('R$ 100.00');
    // e o cartão de estoque não foi mexido
    await expect(page.locator('input[name="kp-cfg-estoque"][value="ajustar"]')).toBeChecked();
});

test('codigo, nome, custo e margem sao cobrados', async ({ page }) => {
    await abrirKitsDoCatalogo(page);

    await page.click('button:has-text("Salvar Kit Pronto")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Informe o código');
    await page.click('#sc-modal-ok');

    await page.fill('#kp-ref', '5501');
    await page.click('button:has-text("Salvar Kit Pronto")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Informe o nome');
    await page.click('#sc-modal-ok');

    await page.fill('#kp-nome', 'KIT TRILHO');
    await page.click('button:has-text("Salvar Kit Pronto")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Informe o preço de custo');
    await page.click('#sc-modal-ok');

    await page.fill('#kp-custo', '100');
    await page.click('button:has-text("Salvar Kit Pronto")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Informe a margem total');
    await page.click('#sc-modal-ok');

    expect(await page.evaluate(() => db.kits.length)).toBe(0);
});

test('codigo de kit pronto tambem nao pode repetir', async ({ page }) => {
    await abrirKitsDoCatalogo(page, { cat: TECIDOS, mat: MATERIAIS });
    await page.fill('#kp-ref', '0001');
    await page.fill('#kp-nome', 'KIT QUALQUER');
    await page.fill('#kp-custo', '100');
    await page.fill('#kp-markup', '50');
    await page.click('button:has-text("Salvar Kit Pronto")');

    await expect(page.locator('#sc-modal-msg')).toContainText('o tecido "TRICÔ HERA"');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => db.kits.length)).toBe(0);
});

test('o kit pronto salvo fica igual a um kit importado', async ({ page }) => {
    await abrirKitsDoCatalogo(page);
    await page.fill('#kp-ref', '5501');
    await page.fill('#kp-nome', 'KIT TRILHO SUICO');
    await page.fill('#kp-medida', '1,00 a 1,50 m');
    await page.fill('#kp-desc', 'inclui suportes');
    await page.fill('#kp-custo', '100');
    await page.fill('#kp-markup', '50');
    await page.click('button:has-text("Salvar Kit Pronto")');

    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);
    const k = await page.evaluate(() => db.kits[0]);
    expect(k.tipo).toBe('pronto');
    expect(k.referencia).toBe('5501');
    expect(k.medida).toBe('1,00 a 1,50 m');
    expect(k.descricao).toBe('inclui suportes');
    expect(k.preco_custo).toBe(100);
    expect(k.preco).toBe(150);
    expect(k.estoque_atual).toBe(0);
    expect(k.estoque_infinito).toBe(false);
    expect(k.itens, 'kit pronto nao descreve materiais').toEqual([]);

    await expect(page.locator('#tb-kits tr').first()).toContainText('5501');
    await expect(page.locator('#tb-kits tr').first()).toContainText('R$ 150.00');
    await expect(page.locator('#tb-kits tr').first()).toContainText('pronto');
});

test('o cartao de estoque infinito vale no kit criado a mao', async ({ page }) => {
    await abrirKitsDoCatalogo(page);
    await page.fill('#kp-ref', '5502');
    await page.fill('#kp-nome', 'KIT INFINITO');
    await page.fill('#kp-custo', '80');
    await page.fill('#kp-markup', '25');
    await page.click('input[name="kp-cfg-estoque"][value="infinito"]');
    await page.click('button:has-text("Salvar Kit Pronto")');

    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);
    expect(await page.evaluate(() => db.kits[0].estoque_infinito)).toBe(true);
    await expect(page.locator('#tb-kits tr').first()).toContainText('∞');
});

test('o kit criado a mao entra no pedido como uma linha so', async ({ page }) => {
    await abrirKitsDoCatalogo(page);
    await page.fill('#kp-ref', '5501');
    await page.fill('#kp-nome', 'KIT TRILHO SUICO');
    await page.fill('#kp-medida', '1,00 a 1,50 m');
    await page.fill('#kp-custo', '100');
    await page.fill('#kp-markup', '50');
    await page.click('button:has-text("Salvar Kit Pronto")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);

    await page.goto(BASE + '/pedido.html');
    const id = await page.evaluate(() => db.kits[0].id);
    await page.selectOption('#ped-kit', String(id));
    await page.click('button:has-text("Aplicar Kit")');

    const itens = await page.evaluate(() => pedidoDraft.itens);
    expect(itens.length).toBe(1);
    expect(itens[0].kitId).toBe(id);
    expect(itens[0].nome).toBe('KIT TRILHO SUICO (1,00 a 1,50 m)');
    expect(itens[0].preco_unit).toBe(150);
});
