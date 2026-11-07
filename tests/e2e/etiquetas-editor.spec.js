const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MSG = 'Não foi possível carregar o gerador de códigos. Verifique a conexão com a internet e tente novamente.';

async function abrir(page) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, BASE);
    await page.evaluate(() => localStorage.removeItem('sc_etiqueta_cfg'));
    await page.goto(BASE + '/empresa.html');
    await expect(page.locator('#etq-editor')).toBeVisible();
}

async function modeloSalvo(page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('sc_etiqueta_cfg')).modelos.pedido);
}

test('abre com o modelo padrao', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#etq-palco .etq-el')).toHaveCount(7);
    await expect(page.locator('#etq-formato')).toHaveValue('100x50');
});

test('arrastar campo da paleta cria elemento e salvar persiste', async ({ page }) => {
    await abrir(page);
    const chip = page.locator('.etq-chip[data-campo="telefone"]');
    await chip.scrollIntoViewIfNeeded();
    const c = await chip.boundingBox();
    const p = await page.locator('#etq-palco').boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width / 2 + 10, c.y + c.height / 2 + 5, { steps: 3 });
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#etq-palco .etq-el')).toHaveCount(8);
    await page.click('button:has-text("Salvar etiqueta")');
    const m = await modeloSalvo(page);
    const tel = m.elementos.find(e => e.campo === 'telefone');
    expect(tel).toBeTruthy();
    expect(Number.isInteger(tel.x_mm)).toBe(true);
    expect(Number.isInteger(tel.y_mm)).toBe(true);
});

test('trocar para 50x30 mantem tudo dentro', async ({ page }) => {
    await abrir(page);
    await page.selectOption('#etq-formato', '50x30');
    await page.click('button:has-text("Salvar etiqueta")');
    const m = await modeloSalvo(page);
    expect(m.largura_mm).toBe(50);
    expect(m.altura_mm).toBe(30);
    for (const e of m.elementos) {
        expect(e.x_mm).toBeGreaterThanOrEqual(0);
        expect(e.y_mm).toBeGreaterThanOrEqual(0);
        expect(e.x_mm + e.w_mm).toBeLessThanOrEqual(50);
        expect(e.y_mm + e.h_mm).toBeLessThanOrEqual(30);
    }
});

test('aviso de QR pequeno', async ({ page }) => {
    await abrir(page);
    const qrId = await page.evaluate(() => JSON.parse(JSON.stringify(EtiquetasCore.modeloPadraoPedido(100, 50)))
        .elementos.find(e => e.tipo === 'qrcode').id);
    await page.locator(`#etq-palco .etq-el[data-id="${qrId}"]`).click();
    await page.fill('#etq-prop-w', '10');
    await expect(page.locator('#etq-props')).toContainText('QR Code pequeno demais para o scanner');
});

test('sem internet o editor funciona e avisa', async ({ page }) => {
    await page.route('**/cdn.jsdelivr.net/**', r => r.abort());
    await abrir(page);
    await expect(page.locator('#emp-etiquetas-card')).toContainText(MSG, { timeout: 20000 });
    await expect(page.locator('#etq-palco .etq-el')).toHaveCount(7);
});
