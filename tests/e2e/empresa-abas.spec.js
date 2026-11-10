// Configurar Empresa dividida em abas: Dados, Preferencias, Layout dos
// Documentos e Etiquetas. A aba aberta fica no endereco (#layout etc.).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function abrir(page, hash) {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'Lírio Cortinas' } });
    await page.goto(BASE + '/empresa.html' + (hash || ''));
}

test('abre na aba Dados; o editor de layout fica em outra aba', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('.tab-btn[data-tab="dados"]')).toHaveClass(/active/);
    await expect(page.locator('#emp-cnpj')).toBeVisible();
    await expect(page.locator('#dl-editor')).toBeHidden();
    await expect(page.locator('#etq-editor')).toBeHidden();
    await expect(page.locator('#emp-formas-pag')).toBeHidden();
});

test('clicar na aba Layout mostra so o editor e guarda a aba no endereco', async ({ page }) => {
    await abrir(page);
    await page.locator('.tab-btn[data-tab="layout"]').click();
    await expect(page.locator('#dl-editor #dl-previa .doc-layout')).toBeVisible();
    await expect(page.locator('#emp-cnpj')).toBeHidden();
    expect(page.url()).toContain('#layout');
    await page.reload();
    await expect(page.locator('.tab-btn[data-tab="layout"]')).toHaveClass(/active/);
    await expect(page.locator('#dl-editor')).toBeVisible();
});

test('cada aba abre direto pelo endereco', async ({ page }) => {
    await abrir(page, '#preferencias');
    await expect(page.locator('#emp-formas-pag')).toBeVisible();
    await expect(page.locator('#emp-alertas-cfg')).toBeVisible();
    await page.goto(BASE + '/empresa.html#etiquetas');
    await expect(page.locator('#etq-editor')).toBeVisible();
    await expect(page.locator('#dl-editor')).toBeHidden();
});

test('a folha da previa se ajusta ao abrir a aba depois', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 900 });
    await abrir(page);
    await page.locator('.tab-btn[data-tab="layout"]').click();
    await expect.poll(() => page.locator('#dl-previa').evaluate(e => parseFloat(e.style.zoom || '1'))).toBeLessThan(1);
});

test('o sininho dos alertas leva para a aba Preferencias', async ({ page }) => {
    await entrar(page, BASE, { sc_alertas_cfg: { entrega: false } });
    await page.goto(BASE + '/index.html');
    await page.locator('#alerta-bell-disabled').click();
    await page.waitForURL('**/empresa.html#preferencias');
    await expect(page.locator('#emp-alertas-cfg')).toBeVisible();
});

test('no celular as abas cabem: rolam de lado e a aberta fica a vista', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await abrir(page, '#etiquetas');
    const btn = page.locator('.tab-btn[data-tab="etiquetas"]');
    await expect(btn).toBeInViewport();
    expect(await btn.evaluate(b => b.getBoundingClientRect().height)).toBeLessThan(50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('logo salva na aba Dados ja libera a logo no fundo na aba Layout', async ({ page }) => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await abrir(page);
    await page.evaluate(png => {
        document.getElementById('emp-logo-preview').dataset.base64 = png;
        salvarEmpresaConfigs();
    }, PNG);
    await page.locator('.tab-btn[data-tab="layout"]').click();
    await expect(page.locator('#dl-marca')).toBeEnabled();
    await page.locator('#dl-marca').check();
    await expect(page.locator('#dl-previa .doc-marca-dagua img')).toHaveCount(1);
});
