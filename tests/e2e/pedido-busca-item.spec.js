// Emissao de pedido > Materiais e Acessorios: um campo de busca antes de
// "Aplicar Kit" e do item avulso procura materiais e kits do cadastro pela
// referencia ou pelo nome. Escolher o resultado ja adiciona ao pedido.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MAT = [
    { id: 1, nome: 'Trilho Suíço Branco', referencia: 'TR-100', unidade: 'm', preco: 25, estoque_atual: 40 },
    { id: 2, nome: 'Rodízio Trilho', referencia: 'RD-20', unidade: 'un', preco: 0.5, estoque_atual: 300 },
    { id: 3, nome: 'Ponteira Cromada', referencia: 'PT-7', unidade: 'un', preco: 8, estoque_atual: 12 },
];
const KITS = [
    // Mesmo id de um material: a busca precisa saber de qual tipo e'.
    { id: 1, nome: 'Kit Trilho Completo', referencia: 'KT-1', itens: [{ materialId: 1, quantidade: 2 }, { materialId: 2, quantidade: 20 }] },
    { id: 2, tipo: 'pronto', nome: 'Kit Varão Pronto', referencia: 'KV-2', medida: '2,00 m', preco: 150, itens: [] },
];

async function abrir(page) {
    await entrar(page, BASE, { sc_mat: MAT, sc_kits: KITS });
    await page.goto(BASE + '/pedido.html');
}
const busca = page => page.locator('#ped-item-busca');
const sugestoes = page => page.locator('#ped-item-busca-sug .ped-sug-item');
const itens = page => page.evaluate(() => pedidoDraft.itens);

test('o campo de busca vem antes do kit e do item avulso', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('label[for="ped-item-busca"]')).toHaveText('Buscar Material ou Kit');
    const antes = await page.evaluate(() => {
        const b = document.getElementById('ped-item-busca');
        const ok = el => !!(b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
        return ok(document.getElementById('ped-kit')) && ok(document.getElementById('ped-item-mat'));
    });
    expect(antes).toBe(true);
    await expect(page.locator('#ped-item-busca-sug')).toBeHidden();
});

test('busca pelo nome, sem acento e sem diferenciar maiusculas, traz materiais e kits', async ({ page }) => {
    await abrir(page);
    await busca(page).fill('trilho');
    await expect(sugestoes(page)).toHaveCount(3);
    await expect(sugestoes(page).filter({ hasText: 'KIT' })).toHaveCount(1);
    await busca(page).fill('rodizio');
    await expect(sugestoes(page)).toHaveCount(1);
    await expect(sugestoes(page).first()).toContainText('Rodízio Trilho');
    await expect(sugestoes(page).first()).toContainText('estoque: 300.0');
});

test('busca pela referencia, com a exata primeiro', async ({ page }) => {
    await abrir(page);
    await busca(page).fill('kv-2');
    await expect(sugestoes(page)).toHaveCount(1);
    await expect(sugestoes(page).first()).toContainText('Kit Varão Pronto');
    await expect(sugestoes(page).first()).toContainText('R$ 150.00');
    await busca(page).fill('rd-20');
    await expect(sugestoes(page)).toHaveCount(1);
    await expect(sugestoes(page).first()).toContainText('Rodízio Trilho');
});

test('referencia exata aparece antes dos que so casam pelo nome', async ({ page }) => {
    await entrar(page, BASE, { sc_mat: [
        { id: 1, nome: 'Suporte ab12 parede', referencia: 'X-9', unidade: 'un', preco: 1 },
        { id: 2, nome: 'Suporte teto', referencia: 'AB12', unidade: 'un', preco: 1 },
    ], sc_kits: [] });
    await page.goto(BASE + '/pedido.html');
    await busca(page).fill('ab12');
    await expect(sugestoes(page)).toHaveCount(2);
    await expect(sugestoes(page).first()).toContainText('Suporte teto');
});

test('sem resultado mostra o aviso', async ({ page }) => {
    await abrir(page);
    await busca(page).fill('xyz');
    await expect(page.locator('#ped-item-busca-sug')).toContainText('Nenhum material ou kit');
});

test('clicar num material adiciona com a quantidade do campo e limpa a busca', async ({ page }) => {
    await abrir(page);
    await page.fill('#ped-item-qtd', '3');
    await busca(page).fill('PT-7');
    await sugestoes(page).first().click();
    expect(await itens(page)).toEqual([expect.objectContaining({ materialId: 3, quantidade: 3, subtotal: 24 })]);
    await expect(busca(page)).toHaveValue('');
    await expect(busca(page)).toBeFocused();
    await expect(page.locator('#ped-item-busca-sug')).toBeHidden();
    await expect(page.locator('#tb-itens-pedido')).toContainText('Ponteira Cromada');
});

test('clicar num kit de montagem explode os materiais, nao o material de mesmo id', async ({ page }) => {
    await abrir(page);
    await busca(page).fill('Kit Trilho');
    await sugestoes(page).first().click();
    const i = await itens(page);
    expect(i.map(x => [x.materialId, x.quantidade])).toEqual([[1, 2], [2, 20]]);
});

test('kit pronto entra como uma linha so', async ({ page }) => {
    await abrir(page);
    await busca(page).fill('varao');
    await sugestoes(page).first().click();
    expect(await itens(page)).toEqual([expect.objectContaining({ kitId: 2, quantidade: 1, preco_unit: 150 })]);
});

test('teclado: Enter com um unico achado adiciona; setas escolhem; Esc fecha', async ({ page }) => {
    await abrir(page);
    await busca(page).fill('PT-7');
    await busca(page).press('Enter');
    expect((await itens(page)).length).toBe(1);

    await busca(page).fill('trilho');
    await busca(page).press('Enter');   // varios achados, nada percorrido: nao adiciona
    expect((await itens(page)).length).toBe(1);
    await busca(page).press('ArrowDown');
    await busca(page).press('ArrowDown');
    await expect(sugestoes(page).nth(1)).toHaveClass(/ativa/);
    await busca(page).press('Enter');
    expect((await itens(page)).length).toBe(2);

    await busca(page).fill('trilho');
    await busca(page).press('Escape');
    await expect(page.locator('#ped-item-busca-sug')).toBeHidden();
});

test('clicar fora fecha as sugestoes', async ({ page }) => {
    await abrir(page);
    await busca(page).fill('trilho');
    await expect(sugestoes(page)).toHaveCount(3);
    await page.locator('h3', { hasText: 'Materiais e Acessórios' }).click();
    await expect(page.locator('#ped-item-busca-sug')).toBeHidden();
});
