// Menu de tres pontos nas abas do Catalogo: Tecidos, Materiais e Acessorios, Kits.
// Nenhuma acao pode se perder: as mesmas funcoes de antes, agora dentro do menu.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MENU = '#menu-acoes-flutuante';
const itens = page => page.locator(MENU + ' .menu-acoes-item');

async function abrir(page, aba) {
    await entrar(page, BASE, {
        sc_cat: [{ id: 1, referencia: '0001', nome: 'TRICO HERA', preco: 100, largura_rolo: 1.4, min_estoque: 10 }],
        sc_mat: [{ id: 11, referencia: 'TR-01', nome: 'TRILHO SUICO', unidade: 'm', preco: 48, min_estoque: 0, estoque_atual: 5 }],
        sc_kits: [
            { id: 31, referencia: 'K1', nome: 'KIT MONTADO', itens: [], preco: 0 },
            { id: 32, referencia: 'K2', nome: 'KIT PRONTO', tipo: 'pronto', estoque_atual: 3, preco: 50, itens: [] }
        ],
        sc_est: [], sc_ped: []
    });
    await page.goto(BASE + '/catalogo.html');
    if (aba) await page.click(`button[data-tab="${aba}"]`);
}

test('tecidos: ⋮ com editar, adicionar ao carrinho e remover', async ({ page }) => {
    await abrir(page);
    const linha = page.locator('#tb-catalogo tr', { hasText: 'TRICO HERA' });
    await expect(linha.locator('td.col-acoes button')).toHaveCount(1);
    await linha.locator('button[aria-label="Ações"]').click();
    await expect(itens(page)).toHaveText([/Editar$/, /Adicionar ao carrinho$/, /Remover do catálogo$/]);
    await itens(page).filter({ hasText: 'Editar' }).click();
    await expect(page.locator(MENU)).toHaveCount(0);
    await expect(page.locator('#cat-nome')).toHaveValue('TRICO HERA');
});

test('materiais: ⋮ com editar, ajustar estoque, carrinho e excluir', async ({ page }) => {
    await abrir(page, 'cat-materiais');
    const linha = page.locator('#tb-materiais tr', { hasText: 'TRILHO SUICO' });
    await expect(linha.locator('td.col-acoes button')).toHaveCount(1);
    await linha.locator('button[aria-label="Ações"]').click();
    await expect(itens(page)).toHaveText([/Editar$/, /Ajustar estoque$/, /Adicionar ao carrinho$/, /Excluir material$/]);
    await itens(page).filter({ hasText: 'Ajustar estoque' }).click();
    await expect(page.locator('#ajuste-11')).toBeVisible();
});

test('kits: ⋮ do catalogo sem editar (o formulario de kit fica no Estoque); kit pronto com ajustar', async ({ page }) => {
    await abrir(page, 'cat-kits');
    const montado = page.locator('#tb-kits tr', { hasText: 'KIT MONTADO' });
    await expect(montado.locator('td.col-acoes button')).toHaveCount(1);
    await montado.locator('button[aria-label="Ações"]').click();
    await expect(itens(page)).toHaveText([/Excluir kit$/]);
    await page.keyboard.press('Escape');
    const pronto = page.locator('#tb-kits tr', { hasText: 'KIT PRONTO' });
    await pronto.locator('button[aria-label="Ações"]').click();
    await expect(itens(page)).toHaveText([/Ajustar estoque$/, /Excluir kit$/]);
    await itens(page).filter({ hasText: 'Ajustar estoque' }).click();
    await expect(page.locator('#ajuste-kit-32')).toBeVisible();
});

test('kits: no Estoque o ⋮ do kit de montagem oferece editar, e funciona', async ({ page }) => {
    await abrir(page);
    await page.goto(BASE + '/estoque.html');
    await page.click('.tab-btn[data-tab="kits"]');
    const montado = page.locator('#tb-kits tr', { hasText: 'KIT MONTADO' });
    await montado.locator('button[aria-label="Ações"]').click();
    await expect(itens(page)).toHaveText([/Editar kit$/, /Excluir kit$/]);
    await itens(page).filter({ hasText: 'Editar kit' }).click();
    await expect(page.locator('#kit-ref')).toHaveValue('K1');
    await expect(page.locator('#kit-form-titulo')).toHaveText('Editar Kit');
});
