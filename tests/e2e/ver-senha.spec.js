const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

test('olho mostra e esconde cada senha', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html');
    await page.locator('button:has-text("Segurança")').first().click();
    for (const id of ['seg-senha-atual', 'seg-senha-nova', 'seg-senha-conf']) {
        const campo = page.locator('#' + id);
        const olho = page.locator(`.btn-ver-senha[data-alvo="${id}"]`);
        await expect(campo).toHaveAttribute('type', 'password');
        await expect(olho).toHaveAttribute('aria-pressed', 'false');
        await olho.click();
        await expect(campo).toHaveAttribute('type', 'text');
        await expect(olho).toHaveAttribute('aria-pressed', 'true');
        await olho.click();
        await expect(campo).toHaveAttribute('type', 'password');
        await expect(olho).toHaveAttribute('aria-pressed', 'false');
    }
});
