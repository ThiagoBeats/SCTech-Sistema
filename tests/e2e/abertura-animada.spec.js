// Pedido: trocar o tipo de abertura toca a animacao da cortina abrindo
// (arquivo -anim); ao abrir o pedido a imagem e a estatica.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function abrirPedido(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/pedido.html');
    const sel = page.locator('select[id^="a-abertura-"]').first();
    if (!(await sel.count())) await page.locator('button:has-text("Ambiente")').first().click();
    await expect(page.locator('select[id^="a-abertura-"]').first()).toBeVisible();
}

const img = page => page.locator('img[id^="img-abertura-"]').first();
const carregou = el => el.evaluate(i => i.complete && i.naturalWidth > 0);

test('ao abrir, a imagem da abertura e a estatica', async ({ page }) => {
    await abrirPedido(page);
    await expect(img(page)).toHaveAttribute('src', /Ambiente\/AberturaA\.svg$/);
    await expect.poll(() => carregou(img(page))).toBe(true);
});

test('trocar a abertura carrega a versao animada, uma por troca', async ({ page }) => {
    await abrirPedido(page);
    await page.locator('select[id^="a-abertura-"]').first().selectOption('C');
    await expect(img(page)).toHaveAttribute('src', /Ambiente\/AberturaC-anim\.svg\?t=\d+$/);
    await expect.poll(() => carregou(img(page))).toBe(true);
    const primeira = await img(page).getAttribute('src');
    await page.locator('select[id^="a-abertura-"]').first().selectOption('G');
    await expect(img(page)).toHaveAttribute('src', /AberturaG-anim\.svg\?t=\d+$/);
    expect(await img(page).getAttribute('src')).not.toBe(primeira);
});

test('quem pede menos movimento ve a imagem parada', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrirPedido(page);
    await page.locator('select[id^="a-abertura-"]').first().selectOption('D');
    await expect(img(page)).toHaveAttribute('src', /Ambiente\/AberturaD\.svg$/);
});
