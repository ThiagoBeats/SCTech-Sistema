// Barra lateral recolhida: mesmo espacamento vertical aberta e fechada, e abertura numa unica transicao suave.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function abrirRecolhida(page, tema) {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.evaluate(t => {
        localStorage.setItem('sc_sidebar', 'collapsed');
        localStorage.setItem('sc_sidebar_u1', 'collapsed');
        if (t) localStorage.setItem('sc_tema', t);
    }, tema || null);
    await page.reload();
    if (tema) await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
    await page.mouse.move(900, 400);
    await page.waitForTimeout(400);
}

const medir = page => page.evaluate(() => [...document.querySelectorAll('#main-sidebar .nav-item')].map(el => {
    const r = el.getBoundingClientRect();
    return { top: r.top, h: r.height, mt: getComputedStyle(el).marginTop, mb: getComputedStyle(el).marginBottom };
}));

for (const tema of [null, 'dark']) {
    test(`recolhida${tema ? ' (tema escuro)' : ''}: itens com a mesma posicao vertical e altura com e sem hover`, async ({ page }) => {
        await abrirRecolhida(page, tema);
        const fechada = await medir(page);
        expect(fechada.length).toBeGreaterThan(5);
        await page.hover('#main-sidebar .nav-item');
        await page.waitForTimeout(500);
        const aberta = await medir(page);
        expect(aberta.length).toBe(fechada.length);
        fechada.forEach((f, i) => {
            expect(Math.abs(f.top - aberta[i].top)).toBeLessThanOrEqual(1);
            expect(Math.abs(f.h - aberta[i].h)).toBeLessThanOrEqual(1);
            expect(f.mt).toBe(aberta[i].mt);
        });
        expect(Math.round(fechada[0].h)).toBe(46);
    });
}

test('a abertura e uma transicao suave: largura intermediaria e textos sem display:none', async ({ page }) => {
    await abrirRecolhida(page, null);
    const larguraFechada = await page.locator('#main-sidebar').evaluate(el => el.getBoundingClientRect().width);
    await page.hover('#main-sidebar .nav-item');
    await page.waitForTimeout(80);
    const meio = await page.evaluate(() => ({
        w: document.getElementById('main-sidebar').getBoundingClientRect().width,
        disp: [...document.querySelectorAll('#main-sidebar .nav-text')].map(e => getComputedStyle(e).display),
        pin: getComputedStyle(document.getElementById('sidebar-pin-btn')).display
    }));
    await page.waitForTimeout(500);
    const larguraAberta = await page.locator('#main-sidebar').evaluate(el => el.getBoundingClientRect().width);
    expect(larguraAberta).toBeGreaterThan(larguraFechada + 100);
    expect(meio.w).toBeGreaterThan(larguraFechada + 1);
    expect(meio.w).toBeLessThan(larguraAberta - 1);
    expect(meio.disp.every(d => d !== 'none')).toBe(true);
    expect(meio.pin).not.toBe('none');
});

test('sem movimento reduzido: a largura final aparece sem transicao', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await abrirRecolhida(page, null);
    const larguraFechada = await page.locator('#main-sidebar').evaluate(el => el.getBoundingClientRect().width);
    await page.hover('#main-sidebar .nav-item');
    await page.waitForTimeout(30);
    const w = await page.locator('#main-sidebar').evaluate(el => el.getBoundingClientRect().width);
    expect(w).toBeGreaterThan(larguraFechada + 100);
    expect(w).toBe(280);
    await ctx.close();
});
