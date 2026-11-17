// Ajustar foto do perfil: janela com previa redonda, arrastar e zoom; grava 256x256.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function fixture(page) {
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 800; c.height = 400;
        const g = c.getContext('2d');
        g.fillStyle = '#c33'; g.fillRect(0, 0, 400, 400);
        g.fillStyle = '#33c'; g.fillRect(400, 0, 400, 400);
        return c.toDataURL('image/png').split(',')[1];
    });
    return { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
}

test('escolher foto abre Ajustar foto; Salvar grava quadrado 256x256 e aparece na barra superior', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html');
    await page.fill('#perfil-nome', 'Thiago Novo');
    await page.setInputFiles('#perfil-foto-input', await fixture(page));
    const jan = page.locator('#ajuste-foto-overlay');
    await expect(jan).toContainText('Ajustar foto');
    await expect(jan.locator('#ajuste-foto-zoom')).toBeVisible();
    const raio = await page.locator('#ajuste-foto-area').evaluate(e => getComputedStyle(e).borderRadius);
    expect(raio).toContain('50%');
    const antes = await page.locator('#ajuste-foto-img').evaluate(e => e.style.transform);
    const box = await page.locator('#ajuste-foto-area').boundingBox();
    await page.mouse.move(box.x + 130, box.y + 130);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 130, { steps: 5 });
    await page.mouse.up();
    expect(await page.locator('#ajuste-foto-img').evaluate(e => e.style.transform)).not.toBe(antes);
    await jan.locator('#ajuste-foto-zoom').fill('2');
    await page.click('#ajuste-foto-salvar');
    await expect(jan).toHaveCount(0);
    await expect(page.locator('#perfil-foto-preview img')).toBeVisible();
    await page.click('button:has-text("Salvar perfil")');
    const b64 = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_usr'))[0].foto_base64);
    expect(b64).toMatch(/^data:image\//);
    const dim = await page.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src; }), b64);
    expect(dim).toEqual([256, 256]);
    await expect(page.locator('#topbar-avatar img')).toHaveCount(1);
    await page.click('#topbar-avatar');
    await expect(page.locator('#popup-user-name')).toHaveText('Thiago Novo');
});

test('Cancelar e Esc nao mudam a foto', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html');
    await page.setInputFiles('#perfil-foto-input', await fixture(page));
    await page.click('#ajuste-foto-cancelar');
    await expect(page.locator('#ajuste-foto-overlay')).toHaveCount(0);
    await expect(page.locator('#perfil-foto-preview img')).toHaveCount(0);
    await page.setInputFiles('#perfil-foto-input', await fixture(page));
    await expect(page.locator('#ajuste-foto-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#ajuste-foto-overlay')).toHaveCount(0);
    await page.click('button:has-text("Salvar perfil")');
    const u = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_usr'))[0]);
    expect(u.foto_base64 || '').toBe('');
});
