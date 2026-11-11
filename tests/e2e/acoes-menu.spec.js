// Menu de tres pontos nas tabelas de Fornecedores, Clientes e Vendedores/Arquitetos.
// Nenhuma acao pode se perder: as mesmas funcoes de antes, agora dentro do menu.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MENU = '#menu-acoes-flutuante';
const itens = page => page.locator(MENU + ' .menu-acoes-item');

test('fornecedores: ⋮ abre as acoes de hoje e nao ha coluna Total de compras', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: [{ id: 1, nome: 'Tecidos Alfa' }, { id: 2, nome: 'Trilhos Beta' }] });
    await page.goto(BASE + '/fornecedores.html');
    await expect(page.locator('#tb-fornecedores').locator('..').locator('thead')).not.toContainText('Total de compras');
    const linha = page.locator('#tb-fornecedores tr', { hasText: 'Tecidos Alfa' });
    await expect(linha.locator('td').last().locator('button')).toHaveCount(1);
    await linha.locator('button[aria-label="Ações"]').click();
    await expect(linha.locator('button[aria-label="Ações"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(itens(page)).toHaveText([/Novo pedido de compra$/, /Editar fornecedor$/, /Excluir fornecedor$/]);
    await itens(page).filter({ hasText: 'Editar fornecedor' }).click();
    await expect(page.locator(MENU)).toHaveCount(0);
    await expect(page.locator('#forn-nome')).toHaveValue('Tecidos Alfa');
});

test('clientes: ⋮ com editar e excluir funcionando', async ({ page }) => {
    await entrar(page, BASE, {
        sc_cli: [{ id: 1, nome: 'Ana Souza' }, { id: 2, nome: 'Beto Lima' }],
        sc_ped: [{ id: 26001, clienteId: 1, clienteNome: 'Ana Souza', status: 'Orçamento', valor: 100 }]
    });
    await page.goto(BASE + '/clientes.html');
    const ana = page.locator('#tb-clientes tr', { hasText: 'Ana Souza' });
    await ana.locator('button[aria-label="Ações"]').click();
    await expect(itens(page)).toHaveText([/Ver pedidos \(1\)$/, /Editar cliente$/, /Excluir cliente$/]);
    await itens(page).filter({ hasText: 'Editar cliente' }).click();
    await expect(page.locator('#cli-nome')).toHaveValue('Ana Souza');
    const beto = page.locator('#tb-clientes tr', { hasText: 'Beto Lima' });
    await beto.locator('button[aria-label="Ações"]').click();
    await expect(itens(page)).toHaveText([/Editar cliente$/, /Excluir cliente$/]);
    await itens(page).filter({ hasText: 'Excluir cliente' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#tb-clientes')).not.toContainText('Beto Lima');
});

test('vendedores: colunas Situacao e Acoes separadas, ⋮ funciona', async ({ page }) => {
    await entrar(page, BASE, { sc_vend: [{ id: 2, nome: 'Bruno', comissao_pct: 4, tipo: 'vendedor' }] });
    await page.goto(BASE + '/vendedores.html');
    const ths = page.locator('#tb-vendedores').locator('..').locator('thead th');
    await expect(ths).toHaveText(['Nome', 'Comissão', 'Telefone', 'Pedidos', 'Situação', 'Ações']);
    const linha = page.locator('#tb-vendedores tr', { hasText: 'Bruno' });
    await expect(linha.locator('td')).toHaveCount(6);
    await expect(linha.locator('td').nth(4)).toContainText('Em dia');
    await linha.locator('button[aria-label="Ações"]').click();
    await expect(itens(page)).toHaveText([/Editar$/, /Excluir$/]);
    await itens(page).filter({ hasText: 'Editar' }).click();
    await expect(page.locator('#vend-nome')).toHaveValue('Bruno');
});

test('abrir um menu fecha o outro, Escape e clique fora fecham', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: [{ id: 1, nome: 'Alfa' }, { id: 2, nome: 'Beta' }] });
    await page.goto(BASE + '/fornecedores.html');
    const b = n => page.locator('#tb-fornecedores button[aria-label="Ações"]').nth(n);
    await b(0).click();
    await expect(page.locator(MENU)).toHaveCount(1);
    await b(1).click();
    await expect(page.locator(MENU)).toHaveCount(1);
    await expect(b(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(b(1)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toHaveCount(0);
    await b(0).click();
    await expect(page.locator(MENU)).toHaveCount(1);
    await b(0).click();
    await expect(page.locator(MENU), 'segundo clique no mesmo botao fecha').toHaveCount(0);
    await b(0).click();
    await page.locator('.header h2').click();
    await expect(page.locator(MENU)).toHaveCount(0);
});

test('excluir pelo menu pede confirmacao como antes', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: [{ id: 1, nome: 'Alfa' }] });
    await page.goto(BASE + '/fornecedores.html');
    await page.locator('#tb-fornecedores button[aria-label="Ações"]').click();
    await itens(page).filter({ hasText: 'Excluir fornecedor' }).click();
    await expect(page.locator('#sc-modal-ok')).toBeVisible();
    await page.locator('#sc-modal-cancel').click();
    await expect(page.locator('#tb-fornecedores')).toContainText('Alfa');
    await page.locator('#tb-fornecedores button[aria-label="Ações"]').click();
    await itens(page).filter({ hasText: 'Excluir fornecedor' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#tb-fornecedores')).not.toContainText('Alfa');
});
