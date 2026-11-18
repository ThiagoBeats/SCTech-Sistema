// Lista de Pedidos: uma acao que recarrega a pagina (aprovar, excluir...) devolve
// a lista como estava (rolagem, busca, filtro de status). Abrir a tela normalmente
// comeca limpa e no topo.
const { test, expect } = require('@playwright/test');
const { entrar, acaoMenu } = require('./ajuda.js');
const BASE = process.env.BASE || 'http://localhost:8131';

const amanha = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const PEDIDOS = Array.from({ length: 45 }, (_, i) => ({
    id: 26001 + i, clienteId: 1, clienteNome: 'Cliente ' + (i + 1), vendedor_nome: 'Vend', data_entrega: amanha,
    status: i < 40 ? 'Orçamento' : 'Medição', valor: 100 + i,
}));
const rolagem = page => page.evaluate(() => Math.max(window.scrollY, document.querySelector('.main')?.scrollTop || 0));
const descer = page => page.evaluate(() => {
    const m = document.querySelector('.main');
    if (m && m.scrollHeight > m.clientHeight) m.scrollTop = m.scrollHeight; else window.scrollTo(0, document.body.scrollHeight);
});

test('aprovar um pedido mantem a rolagem, a busca e o filtro', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: PEDIDOS, sc_cli: [{ id: 1, nome: 'X' }] });
    await page.goto(BASE + '/pedidos.html');
    await page.fill('#filtro-texto', 'Cliente');
    await page.selectOption('#filtro-status', 'Orçamento');
    await expect(page.locator('#tb-pedidos tr')).toHaveCount(40);
    await descer(page);
    const antes = await rolagem(page);
    expect(antes).toBeGreaterThan(300);
    await acaoMenu(page, page.locator('#tb-pedidos tr').last(), 'Aprovar pedido');
    await page.click('#sc-modal-ok');
    await page.waitForEvent('load');
    await expect(page.locator('#tb-pedidos tr')).toHaveCount(39);
    await expect(page.locator('#filtro-texto')).toHaveValue('Cliente');
    await expect(page.locator('#filtro-status')).toHaveValue('Orçamento');
    await expect.poll(() => rolagem(page)).toBeGreaterThan(antes - 30 - 60);
    expect(Math.abs((await rolagem(page)) - antes)).toBeLessThan(120);
});

test('abrir normalmente (sem acao) comeca no topo e sem filtros', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: PEDIDOS, sc_cli: [{ id: 1, nome: 'X' }] });
    await page.goto(BASE + '/pedidos.html');
    await page.fill('#filtro-texto', 'Cliente 1');
    await descer(page);
    await page.goto(BASE + '/index.html');
    await page.goto(BASE + '/pedidos.html');
    await expect(page.locator('#filtro-texto')).toHaveValue('');
    expect(await rolagem(page)).toBe(0);
});
