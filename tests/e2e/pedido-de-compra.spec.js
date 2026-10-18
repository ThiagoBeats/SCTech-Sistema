// Etapa 2 do lote: numeracao sequencial do pedido de compra, edicao ao clicar
// no numero, preenchimentos automaticos nos dois sentidos e kits como item.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function semear(page, pcs) {
    await entrar(page, BASE);
    await page.goto(BASE + '/fornecedores.html');
    await page.evaluate(p => {
        localStorage.setItem('sc_forn', JSON.stringify([
            { id: 7, nome: 'RC Tecidos',   cnpj: '11.222.333/0001-44', tel: '4799990000', email: 'rc@x.com' },
            { id: 8, nome: 'Alfa Trilhos', cnpj: '55.666.777/0001-88' }
        ]));
        localStorage.setItem('sc_mat', JSON.stringify([
            { id: 11, referencia: 'M-01', nome: 'TRILHO', unidade: 'm', preco_custo: 30 }
        ]));
        localStorage.setItem('sc_cat', JSON.stringify([
            { id: 1, referencia: 'C-001', nome: 'TRICO HERA', preco_custo: 92, largura_rolo: 1.4 }
        ]));
        localStorage.setItem('sc_kits', JSON.stringify([
            { id: 21, tipo: 'pronto', referencia: 'K-01', nome: 'KIT TRILHO 2M', medida: '2 m', preco_custo: 126, preco: 189, itens: [] },
            { id: 22, referencia: '', nome: 'KIT MONTAGEM', itens: [{ nome: 'TRILHO', quantidade: 2, unidade: 'm' }] }
        ]));
        localStorage.setItem('sc_pc', JSON.stringify(p || []));
        localStorage.setItem('sc_est', '[]');
        localStorage.setItem('sc_mov', '[]');
        localStorage.removeItem('sc_pc_seq');
    }, pcs || null);
    await page.reload();
    await page.click('.forn-tab-btn[data-tab="novo"]');
}

async function gravar(page) {
    await page.click('#pc-btn-salvar');
    const ok = page.locator('#sc-modal-ok');
    await ok.waitFor({ timeout: 5000 }).catch(() => {});
    if (await ok.count()) await ok.click();
    await page.waitForTimeout(400);
}

async function umItem(page, tipo, id) {
    if (tipo) await page.selectOption('#pc-item-tipo', tipo);
    await page.selectOption('#pc-item-id', String(id));
    await page.click('button:has-text("+ Adicionar")');
}

// --- Numeracao sequencial --------------------------------------------------

test('o pedido de compra nasce com numero sequencial, nao com o relogio', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    await umItem(page, 'material', 11);
    await gravar(page);

    const id = await page.evaluate(() => db.pedidos_compra[0].id);
    const anoCurto = new Date().getFullYear() % 100;
    expect(id, 'ano + sequencial, como os pedidos').toBe(anoCurto * 1000 + 1);
    expect(String(id).length, 'nada de 13 digitos de timestamp').toBeLessThan(8);
});

test('a sequencia dos pedidos de compra e separada da dos pedidos', async ({ page }) => {
    await semear(page);
    const antes = await page.evaluate(() => localStorage.getItem('sc_ped_seq'));
    await page.selectOption('#pc-fornecedor', '7');
    await umItem(page, 'material', 11);
    await gravar(page);
    const depois = await page.evaluate(() => localStorage.getItem('sc_ped_seq'));
    expect(depois, 'uma compra nao pode consumir um numero de venda').toBe(antes);
    expect(await page.evaluate(() => localStorage.getItem('sc_pc_seq'))).toBe('1');
});

test('o numero pula o que ja estiver ocupado', async ({ page }) => {
    const anoCurto = new Date().getFullYear() % 100;
    const ocupado = anoCurto * 1000 + 1;
    // uma compra antiga ja ocupa o primeiro numero da sequencia
    await semear(page, [{ id: ocupado, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos',
        data_criacao: Date.now(), status: 'Rascunho', itens: [], observacoes: '' }]);
    await page.selectOption('#pc-fornecedor', '8');
    await umItem(page, 'material', 11);
    await gravar(page);

    const ids = await page.evaluate(() => db.pedidos_compra.map(p => p.id));
    expect(new Set(ids).size, 'dois pedidos nao podem ter o mesmo numero').toBe(ids.length);
    expect(ids).toContain(ocupado + 1);
});

// --- Preenchimentos automaticos --------------------------------------------

test('escolher o fornecedor preenche o CNPJ dele', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    expect(await page.inputValue('#pc-busca-cnpj')).toBe('11.222.333/0001-44');
    await page.selectOption('#pc-fornecedor', '8');
    expect(await page.inputValue('#pc-busca-cnpj')).toBe('55.666.777/0001-88');
    await page.selectOption('#pc-fornecedor', '');
    expect(await page.inputValue('#pc-busca-cnpj'), 'sem fornecedor, sem CNPJ').toBe('');
});

test('o CNPJ continua achando o fornecedor', async ({ page }) => {
    await semear(page);
    await page.fill('#pc-busca-cnpj', '55666777000188');
    await page.waitForTimeout(200);
    expect(await page.inputValue('#pc-fornecedor'), 'os dois sentidos funcionam').toBe('8');
});

test('escolher o item preenche o codigo dele', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-item-id', '11');
    expect(await page.inputValue('#pc-item-codigo')).toBe('M-01');

    await page.selectOption('#pc-item-tipo', 'tecido');
    await page.selectOption('#pc-item-id', '1');
    expect(await page.inputValue('#pc-item-codigo')).toBe('C-001');

    await page.selectOption('#pc-item-id', '');
    expect(await page.inputValue('#pc-item-codigo'), 'sem item, sem codigo').toBe('');
});

test('o codigo continua achando o item', async ({ page }) => {
    await semear(page);
    await page.fill('#pc-item-codigo', 'M-01');
    expect(await page.inputValue('#pc-item-id')).toBe('11');
});

// --- Kits -------------------------------------------------------------------

test('Kit e um tipo de item, e so o kit pronto aparece', async ({ page }) => {
    await semear(page);
    expect(await page.$$eval('#pc-item-tipo option', o => o.map(x => x.value)))
        .toEqual(['material', 'tecido', 'kit']);

    await page.selectOption('#pc-item-tipo', 'kit');
    const opcoes = await page.$$eval('#pc-item-id option', o => o.map(x => x.textContent.trim()));
    expect(opcoes.join(' ')).toContain('KIT TRILHO 2M');
    expect(opcoes.join(' '), 'kit de montagem e feito aqui, nao comprado').not.toContain('KIT MONTAGEM');
});

test('o kit entra no pedido com o custo e a unidade dele', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    await page.selectOption('#pc-item-tipo', 'kit');
    await page.selectOption('#pc-item-id', '21');
    expect(await page.inputValue('#pc-item-codigo')).toBe('K-01');
    await page.fill('#pc-item-qtd', '3');
    await page.click('button:has-text("+ Adicionar")');

    const linha = (await page.locator('#tb-pc-draft').innerText()).replace(/\s+/g, ' ');
    expect(linha).toContain('KIT TRILHO 2M');
    expect(linha).toContain('(Kit)');
    expect(linha).toContain('126.00');

    await gravar(page);
    const item = await page.evaluate(() => db.pedidos_compra[0].itens[0]);
    expect(item.tipo).toBe('kit');
    expect(item.unidade).toBe('un');
    expect(item.quantidade).toBe(3);
    expect(item.subtotal).toBe(378);
});

test('o kit aparece como Kit no documento do pedido', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    await umItem(page, 'kit', 21);
    await gravar(page);

    await page.evaluate(() => abrirPedidoCompra(db.pedidos_compra[0].id));
    const doc = (await page.locator('#doc-modal-paper').innerText()).replace(/\s+/g, ' ');
    expect(doc).toContain('KIT TRILHO 2M');
    expect(doc).toContain('Kit');
    expect(doc, 'o codigo do kit vai no documento').toContain('K-01');
});

// --- Edicao pelo numero -----------------------------------------------------

test('clicar no numero abre o pedido para editar', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    await umItem(page, 'material', 11);
    await page.fill('#pc-obs', 'entregar ate sexta');
    await gravar(page);

    await page.click('.forn-tab-btn[data-tab="pedidos"]');
    const num = await page.locator('.pc-num-btn').first().innerText();
    await page.locator('.pc-num-btn').first().click();

    await expect(page.locator('#pc-form-titulo')).toContainText('Editando Pedido de Compra ' + num);
    await expect(page.locator('#pc-btn-salvar')).toContainText('Salvar Alterações');
    await expect(page.locator('#pc-btn-cancelar-edicao')).toBeVisible();
    expect(await page.inputValue('#pc-fornecedor')).toBe('7');
    expect(await page.inputValue('#pc-busca-cnpj'), 'o CNPJ vem junto').toBe('11.222.333/0001-44');
    expect(await page.inputValue('#pc-obs')).toBe('entregar ate sexta');
    expect((await page.locator('#tb-pc-draft').innerText())).toContain('TRILHO');
});

test('acrescentar item num pedido existente nao cria outro pedido', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    await umItem(page, 'material', 11);
    await gravar(page);
    const idOriginal = await page.evaluate(() => db.pedidos_compra[0].id);

    await page.click('.forn-tab-btn[data-tab="pedidos"]');
    await page.locator('.pc-num-btn').first().click();
    await umItem(page, 'tecido', 1);
    await gravar(page);

    const pcs = await page.evaluate(() => db.pedidos_compra.map(p => ({ id: p.id, n: p.itens.length, st: p.status })));
    expect(pcs.length, 'editar atualiza, nao duplica').toBe(1);
    expect(pcs[0].id, 'o numero nao muda ao editar').toBe(idOriginal);
    expect(pcs[0].n).toBe(2);
});

test('editar um pedido ja enviado nao o devolve para Rascunho', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    await umItem(page, 'material', 11);
    await gravar(page);
    await page.evaluate(() => { db.pedidos_compra[0].status = 'Enviado'; syncDB(); });

    await page.click('.forn-tab-btn[data-tab="pedidos"]');
    await page.locator('.pc-num-btn').first().click();
    await umItem(page, 'tecido', 1);
    await gravar(page);

    expect(await page.evaluate(() => db.pedidos_compra[0].status),
        'status e do pedido, nao do formulario').toBe('Enviado');
});

test('cancelar a edicao limpa o formulario e nao grava nada', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    await umItem(page, 'material', 11);
    await gravar(page);

    await page.click('.forn-tab-btn[data-tab="pedidos"]');
    await page.locator('.pc-num-btn').first().click();
    await umItem(page, 'tecido', 1);
    await page.click('#pc-btn-cancelar-edicao');

    await expect(page.locator('#pc-form-titulo')).toContainText('Novo Pedido de Compra');
    await expect(page.locator('#pc-btn-cancelar-edicao')).toBeHidden();
    expect(await page.inputValue('#pc-fornecedor')).toBe('');
    expect(await page.evaluate(() => db.pedidos_compra[0].itens.length),
        'o item acrescentado e descartado').toBe(1);
});

test('depois de cancelar, salvar cria um pedido novo', async ({ page }) => {
    await semear(page);
    await page.selectOption('#pc-fornecedor', '7');
    await umItem(page, 'material', 11);
    await gravar(page);

    await page.click('.forn-tab-btn[data-tab="pedidos"]');
    await page.locator('.pc-num-btn').first().click();
    await page.click('#pc-btn-cancelar-edicao');

    await page.selectOption('#pc-fornecedor', '8');
    await umItem(page, 'material', 11);
    await gravar(page);
    expect(await page.evaluate(() => db.pedidos_compra.length)).toBe(2);
});

// --- O botao de abrir compra so existe na lista de compras ------------------

test('as tabelas de pedidos de venda nao abrem pedido de compra', async () => {
    // O numero clicavel chama editarPedidoCompra(id). Em tabela de pedido de
    // VENDA (comissoes, recebiveis) o id e de outro pedido: abriria a compra
    // errada, ou nenhuma. So a lista de compras pode ter esse botao.
    const fonte = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', '..', 'js', 'app.js'), 'utf8');
    const usos = fonte.split('\n').filter(l => l.includes('editarPedidoCompra(${p.id})'));
    expect(usos.length, 'um uso: renderListaPedidosCompra').toBe(1);
    const corpo = fonte.slice(fonte.indexOf('function renderListaPedidosCompra'));
    expect(corpo.slice(0, corpo.indexOf('\nfunction ')), 'e ele mora na lista de compras')
        .toContain('editarPedidoCompra(${p.id})');
});
