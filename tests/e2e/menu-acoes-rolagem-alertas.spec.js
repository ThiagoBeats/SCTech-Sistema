// O card "Alertas do Sistema" do Painel rola sozinho quando ha mais de um alerta.
// Essa rolagem (de outro elemento) nao pode fechar o menu ⋮ aberto na lista de pedidos;
// rolar a pagina (o que tira o botao do lugar) continua fechando.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MENU = '#menu-acoes-flutuante';

function dados() {
    const hoje = new Date().toLocaleDateString('sv-SE');
    const peds = [];
    for (let i = 0; i < 30; i++) {
        peds.push({ id: 26001 + i, clienteId: 1, clienteNome: 'Cliente ' + i, status: i % 2 ? 'Orçamento' : 'Medição',
            valor: 100 + i, data_entrega: '2026-01-05', itens: [], vendedor: 'José' });
    }
    return {
        sc_ped: peds,
        sc_cli: [{ id: 1, nome: 'Cliente' }],
        sc_med: [
            { id: 5, clienteId: 1, clienteNome: 'Ana', data: '2026-01-02', hora: '09:00', status: 'Agendado', endereco: 'Rua A' },
            { id: 6, clienteId: 1, clienteNome: 'Bia', data: hoje, hora: '23:00', status: 'Agendado', endereco: 'Rua B' },
        ],
    };
}

test('painel: o card de alertas rolando sozinho nao fecha o menu ⋮ dos pedidos', async ({ page }) => {
    await entrar(page, BASE, dados());
    await page.goto(BASE + '/index.html');
    const card = page.locator('#dashboard-alertas');
    await expect(card.locator('[data-urgente]')).not.toHaveCount(0);
    await expect.poll(() => card.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await expect.poll(() => page.evaluate(() => !!window._dashAlertaScroll)).toBe(true);

    await page.locator('#tb-pedidos .btn-kebab').first().click();
    await expect(page.locator(MENU)).toHaveCount(1);
    // o card rola ~1px a cada 35ms: em 1,5s rola dezenas de vezes
    const antes = await card.evaluate(el => el.scrollTop);
    await page.waitForTimeout(1500);
    expect(await card.evaluate(el => el.scrollTop)).not.toBe(antes);
    await expect(page.locator(MENU)).toHaveCount(1);
});

test('painel: rolar a pagina ainda fecha o menu ⋮', async ({ page }) => {
    await entrar(page, BASE, dados());
    await page.goto(BASE + '/index.html');
    await page.locator('#tb-pedidos .btn-kebab').first().click();
    await expect(page.locator(MENU)).toHaveCount(1);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const sc = document.querySelector('.main');
        sc.scrollTop += 200;
        window.scrollBy(0, 200);
    });
    await expect(page.locator(MENU)).toHaveCount(0);
});
