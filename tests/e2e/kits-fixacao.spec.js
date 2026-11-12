// Kits de fixação: o kit de montagem marcado como "Kit de fixação" aparece em
// "Material de Instalação" do pedido, e os materiais dele entram sozinhos no
// pedido — "por kit" com a quantidade cadastrada, "por metro" multiplicando a
// largura da parede e arredondando para cima. Os 7 tipos que eram fixos no
// código nascem como kits de fixação vazios, uma vez só.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const MAT = [
    { id: 21, referencia: 'BR-1', nome: 'BARRA',    unidade: 'un', preco: 30,  estoque_atual: 50 },
    { id: 22, referencia: 'PF-1', nome: 'PARAFUSO', unidade: 'un', preco: 0.5, estoque_atual: 500 },
    { id: 23, referencia: 'SP-1', nome: 'SUPORTE',  unidade: 'un', preco: 4,   estoque_atual: 80 },
];
const KITS = [
    { id: 901, referencia: 'FX-A', nome: 'Trilho A', fixacao: true, itens: [
        { materialId: 21, nome: 'BARRA', unidade: 'un', quantidade: 1, por_metro: false },
        { materialId: 22, nome: 'PARAFUSO', unidade: 'un', quantidade: 3, por_metro: true },
    ] },
    { id: 902, referencia: 'FX-B', nome: 'Varão B', fixacao: true, itens: [
        { materialId: 23, nome: 'SUPORTE', unidade: 'un', quantidade: 2, por_metro: false },
    ] },
    { id: 903, referencia: 'KM-1', nome: 'Kit Montagem Comum', itens: [
        { materialId: 21, nome: 'BARRA', unidade: 'un', quantidade: 1 },
    ] },
];

// Linhas do pedido como { nome|origem: quantidade }
const linhas = page => page.evaluate(() => {
    const r = {};
    pedidoDraft.itens.forEach(i => { r[i.nome + '|' + (i.origem || 'manual')] = i.quantidade; });
    return r;
});

async function largura(page, ambId, valor) {
    await page.fill(`#a-larg-${ambId}`, String(valor));
    await page.locator(`#a-larg-${ambId}`).dispatchEvent('change');
}

// ─── Kits padrão ────────────────────────────────────────────────────────

test('os 7 tipos de instalacao nascem como kits de fixacao vazios, uma vez so', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: MAT });
    await page.evaluate(() => { localStorage.removeItem('sc_kits_fixacao_padrao'); localStorage.removeItem('sc_kits'); });
    await page.goto(BASE + '/estoque.html');
    const kits = await page.evaluate(() => db.kits);
    expect(kits.map(k => k.nome)).toEqual([
        'Trilho Suíço Simples', 'Trilho Suíço Duplo', 'Trilho Suíço Duplo Com Espaço',
        'Trilho Suíço Triplo', 'Trilho Motorizador', 'Varão Alumínio Comum', 'Varão Suíço/Wave'
    ]);
    expect(kits.every(k => k.fixacao === true && k.itens.length === 0)).toBe(true);
    expect(kits.map(k => k.referencia)).toEqual(['FIX-001', 'FIX-002', 'FIX-003', 'FIX-004', 'FIX-005', 'FIX-006', 'FIX-007']);

    // Excluído não volta
    await page.evaluate(() => { db.kits = db.kits.filter(k => k.nome !== 'Trilho Motorizador'); syncDB(); });
    await page.reload();
    expect(await page.evaluate(() => db.kits.length)).toBe(6);
});

test('o codigo padrao pula um FIX-xxx ja usado', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: [{ id: 1, referencia: 'FIX-001', nome: 'X', unidade: 'un' }] });
    await page.evaluate(() => { localStorage.removeItem('sc_kits_fixacao_padrao'); localStorage.removeItem('sc_kits'); });
    await page.goto(BASE + '/estoque.html');
    expect(await page.evaluate(() => db.kits[0].referencia)).toBe('FIX-002');
});

// ─── Cadastro ───────────────────────────────────────────────────────────

test('kit de fixacao salva vazio; kit de montagem comum continua exigindo item', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: MAT });
    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');
    await page.fill('#kit-ref', 'K-VAZIO');
    await page.fill('#kit-nome', 'Kit vazio');
    await page.click('button:has-text("Salvar Kit")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Adicione pelo menos um item');
    await page.click('#sc-modal-ok');

    await page.check('#kit-fixacao');
    await page.click('button:has-text("Salvar Kit")');
    // salvar pode recarregar a pagina: no intervalo `db` ainda nao existe
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);
    expect(await page.evaluate(() => db.kits[0])).toMatchObject({ nome: 'Kit vazio', fixacao: true, itens: [] });
    await expect(page.locator('#tb-kits tr').first()).toContainText('fixação');
});

test('cada item escolhe por kit ou por metro, e a lista mostra un/m', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: MAT });
    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');
    await page.fill('#kit-ref', 'K-FX');
    await page.fill('#kit-nome', 'Trilho X');
    await page.check('#kit-fixacao');
    await page.selectOption('#kit-item-mat', '21');
    await page.fill('#kit-item-qtd', '1');
    await page.click('button:has-text("+ Adicionar Item")');
    await page.selectOption('#kit-item-mat', '22');
    await page.fill('#kit-item-qtd', '3');
    await page.selectOption('#kit-item-modo', 'metro');
    await page.click('button:has-text("+ Adicionar Item")');
    await page.click('button:has-text("Salvar Kit")');
    // salvar pode recarregar a pagina: no intervalo `db` ainda nao existe
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);
    const k = await page.evaluate(() => db.kits[0]);
    expect(k.itens.map(i => [i.materialId, i.quantidade, i.por_metro])).toEqual([[21, 1, false], [22, 3, true]]);
    await expect(page.locator('#tb-kits tr').first()).toContainText('PARAFUSO: 3 un/m');
});

test('o kit de montagem pode ser editado: itens, contagem e marca de fixacao', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: MAT, sc_kits: [{ id: 950, referencia: 'FIX-001', nome: 'Trilho Suíço Simples', fixacao: true, itens: [] }] });
    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');
    await page.click('#tb-kits button[aria-label="Ações"]');
    await page.click('#menu-acoes-flutuante .menu-acoes-item:has-text("Editar kit")');
    await expect(page.locator('#kit-form-titulo')).toHaveText('Editar Kit');
    await expect(page.locator('#kit-ref')).toHaveValue('FIX-001');
    await expect(page.locator('#kit-fixacao')).toBeChecked();

    await page.selectOption('#kit-item-mat', '22');
    await page.fill('#kit-item-qtd', '4');
    await page.click('button:has-text("+ Adicionar Item")');
    await page.selectOption('#tb-kit-draft select', 'metro');
    await page.click('button:has-text("Salvar Alterações")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits[0] && db.kits[0].itens.length === 1);
    const k = await page.evaluate(() => db.kits);
    expect(k.length, 'editar não cria outro kit').toBe(1);
    expect(k[0]).toMatchObject({ id: 950, referencia: 'FIX-001', fixacao: true });
    expect(k[0].itens[0]).toMatchObject({ materialId: 22, quantidade: 4, por_metro: true });
});

test('o kit pronto nao ganha botao de editar', async ({ page }) => {
    await entrar(page, BASE, { sc_kits: [{ id: 960, tipo: 'pronto', referencia: '5501', nome: 'KIT PRONTO', preco: 10, itens: [] }] });
    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');
    await page.click('#tb-kits button[aria-label="Ações"]');
    await expect(page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Excluir kit' })).toHaveCount(1);
    await expect(page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Editar kit' })).toHaveCount(0);
});

// ─── Pedido ─────────────────────────────────────────────────────────────

test('o dropdown de instalacao lista so os kits de fixacao', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: MAT, sc_kits: KITS });
    await page.goto(BASE + '/pedido.html');
    const opcoes = await page.locator('#a-fixacao-1 option').allTextContents();
    expect(opcoes).toEqual(['— Selecione —', 'Trilho A', 'Varão B']);
});

test('escolher, trocar e mudar largura refaz so as linhas de fixacao', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: MAT, sc_kits: KITS });
    await page.goto(BASE + '/pedido.html');

    // Kit escolhido sem largura: só o item por kit entra.
    await page.selectOption('#a-fixacao-1', '901');
    expect(await linhas(page)).toEqual({ 'BARRA|fixacao': 1 });

    // 2,4 m × 3/m = 7,2 → 8
    await largura(page, 1, 2.4);
    expect(await linhas(page)).toEqual({ 'BARRA|fixacao': 1, 'PARAFUSO|fixacao': 8 });

    // Segundo ambiente com o mesmo kit soma: 1,5 × 3 = 4,5 → 5
    await page.click('button:has-text("+ Adicionar Ambiente")');
    await largura(page, 2, 1.5);
    await page.selectOption('#a-fixacao-2', '901');
    expect(await linhas(page)).toEqual({ 'BARRA|fixacao': 2, 'PARAFUSO|fixacao': 13 });

    // Item lançado à mão fica em linha própria e não é mexido.
    await page.selectOption('#ped-item-mat', '21');
    await page.fill('#ped-item-qtd', '1');
    await page.click('button[onclick="adicionarItemPedido()"]');
    expect(await linhas(page)).toEqual({ 'BARRA|fixacao': 2, 'PARAFUSO|fixacao': 13, 'BARRA|manual': 1 });

    // Troca do ambiente 1 para o kit B: o kit A dele sai.
    await page.selectOption('#a-fixacao-1', '902');
    expect(await linhas(page)).toEqual({ 'BARRA|manual': 1, 'BARRA|fixacao': 1, 'PARAFUSO|fixacao': 5, 'SUPORTE|fixacao': 2 });

    // Mudar a largura do ambiente 2: 3 × 3 = 9
    await largura(page, 2, 3);
    expect((await linhas(page))['PARAFUSO|fixacao']).toBe(9);

    // Remover o ambiente 2 leva os materiais dele.
    page.once('dialog', d => d.accept());
    await page.locator('#amb-card-2 button:has-text("Remover")').click();
    expect(await linhas(page)).toEqual({ 'BARRA|manual': 1, 'SUPORTE|fixacao': 2 });

    // A linha de fixação aparece marcada na tabela; total soma tudo.
    await expect(page.locator('#tb-itens-pedido tr', { hasText: 'SUPORTE' })).toContainText('fixação');
    await expect(page.locator('#ped-total-itens')).toHaveText('38.00');

    // Ambiente sem kit
    await page.selectOption('#a-fixacao-1', '');
    expect(await linhas(page)).toEqual({ 'BARRA|manual': 1 });
});

test('calcular consumo guarda o nome do kit no ambiente', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: MAT, sc_kits: KITS, sc_cat: [{ id: 1, nome: 'LINHO', preco: 50, largura_rolo: 2.8 }] });
    await page.goto(BASE + '/pedido.html');
    await page.selectOption('#a-fixacao-1', '902');
    await largura(page, 1, 2);
    await page.fill('#a-alt-1', '2.6');
    await page.selectOption('#a-tecido-1-0', '1');
    await page.click('button:has-text("Calcular Consumo")');
    const a = await page.evaluate(() => pedidoDraft.ambientes[0]);
    expect(a).toMatchObject({ calculado: true, fixacao: 'Varão B', fixacao_kit_id: 902 });
    await expect(page.locator('#a-fixacao-1')).toHaveValue('902');
});

test('pedido antigo: o nome casa com o kit e nada e acrescentado sozinho', async ({ page }) => {
    const PED = [{
        id: 26001, clienteId: 1, clienteNome: 'Ana', status: 'Orçamento', valor: 100, maoObra: 0,
        itens: [{ materialId: 21, nome: 'BARRA', unidade: 'un', quantidade: 2, preco_unit: 30, subtotal: 60 }],
        ambientes: [
            { id: 1, calculado: true, amb: 'Sala', fixacao: 'Trilho Suico Simples', largura: 2, altura: 2.5, tecidos: [] },
            { id: 2, calculado: true, amb: 'Quarto', fixacao: 'Cortineiro Antigo', largura: 2, altura: 2.5, tecidos: [] },
        ]
    }];
    const kits = [{ id: 970, referencia: 'FIX-001', nome: 'Trilho Suíço Simples', fixacao: true,
        itens: [{ materialId: 22, nome: 'PARAFUSO', unidade: 'un', quantidade: 3, por_metro: true }] }];
    await entrar(page, BASE, { sc_mat: MAT, sc_kits: kits, sc_ped: PED, sc_cli: [{ id: 1, nome: 'Ana' }], sc_editando_id: 26001 });
    await page.goto(BASE + '/pedido.html');

    await expect(page.locator('#a-fixacao-1')).toHaveValue('970');
    await expect(page.locator('#a-fixacao-2 option:checked')).toHaveText('Cortineiro Antigo');

    await largura(page, 1, 3);
    expect(await linhas(page), 'mexer na largura de pedido antigo não acrescenta nada').toEqual({ 'BARRA|manual': 2 });

    // Escolher o kit de propósito passa a valer.
    await page.selectOption('#a-fixacao-2', '970');
    expect(await linhas(page)).toEqual({ 'BARRA|manual': 2, 'PARAFUSO|fixacao': 6 });
});
