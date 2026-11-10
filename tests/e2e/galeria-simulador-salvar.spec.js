// Salvar a simulacao: imagem, video curto (abre e fecha) e enviar pelo
// compartilhar do aparelho.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function abrirComFoto(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/galeria.html#simular');
    const b64 = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
        const g = c.getContext('2d'); g.fillStyle = 'rgb(217,207,194)'; g.fillRect(0, 0, 1200, 900);
        return c.toDataURL('image/jpeg', 0.95).split(',')[1];
    });
    await page.locator('#sim-foto-arquivo').setInputFiles([{ name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') }]);
    await expect.poll(() => page.evaluate(() => !!(window._sim && window._sim.foto))).toBe(true);
}

test('sem foto, os botoes de salvar nao aparecem', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/galeria.html#simular');
    await expect(page.locator('#sim')).toBeVisible();
    await expect(page.locator('#sim-salvar-imagem')).toHaveCount(0);
});

test('Imagem baixa um JPEG do tamanho da foto, sem as alcas', async ({ page }) => {
    await abrirComFoto(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#sim-salvar-imagem').click()]);
    expect(dl.suggestedFilename()).toMatch(/^simulacao-\d{4}-\d{2}-\d{2}\.jpg$/);
    const caminho = await dl.path();
    const fs = require('fs');
    const buf = fs.readFileSync(caminho);
    expect(buf.length).toBeGreaterThan(10000);
    // abre o arquivo no navegador e confere tamanho e o canto superior esquerdo da janela (onde fica a alca)
    const r = await page.evaluate(async b64 => {
        const blob = await (await fetch('data:image/jpeg;base64,' + b64)).blob();
        const bm = await createImageBitmap(blob);
        const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
        const g = c.getContext('2d'); g.drawImage(bm, 0, 0);
        const q = window._sim.estado.cantos[0], k = bm.width / window._sim.foto.w;
        return { w: bm.width, h: bm.height, px: Array.from(g.getImageData(Math.round(q[0] * k), Math.round(q[1] * k), 1, 1).data.slice(0, 3)) };
    }, buf.toString('base64'));
    expect(r.w / r.h).toBeCloseTo(1200 / 900, 1);
    const amarelo = r.px[0] > 200 && r.px[1] > 170 && r.px[2] < 120;
    expect(amarelo).toBe(false);
});

test('Video grava a cortina abrindo e fechando e baixa', async ({ page }) => {
    test.setTimeout(60000);
    await abrirComFoto(page);
    const botao = page.locator('#sim-gravar-video');
    await expect(botao).toBeVisible();
    const espera = page.waitForEvent('download', { timeout: 30000 });
    await botao.click();
    await expect(botao).toHaveText(/Gravando/);
    await expect(botao).toBeDisabled();
    const dl = await espera;
    expect(dl.suggestedFilename()).toMatch(/^simulacao-\d{4}-\d{2}-\d{2}\.(webm|mp4)$/);
    const fs = require('fs');
    expect(fs.statSync(await dl.path()).size).toBeGreaterThan(0);
    await expect(botao).toBeEnabled();
    expect(await page.evaluate(() => window._sim.estado.aberto)).toBe(0);
});

test('sem MediaRecorder o botao de video some', async ({ page }) => {
    await page.addInitScript(() => { delete window.MediaRecorder; });
    await abrirComFoto(page);
    await expect(page.locator('#sim-salvar-imagem')).toBeVisible();
    await expect(page.locator('#sim-gravar-video')).toHaveCount(0);
});

test('Enviar usa o compartilhar do aparelho quando existe', async ({ page }) => {
    await page.addInitScript(() => {
        window.__enviado = null;
        navigator.canShare = () => true;
        navigator.share = d => { window.__enviado = (d.files || []).map(f => ({ type: f.type, name: f.name, size: f.size })); return Promise.resolve(); };
    });
    await abrirComFoto(page);
    await page.locator('#sim-enviar').click();
    await expect.poll(() => page.evaluate(() => window.__enviado)).not.toBeNull();
    const env = await page.evaluate(() => window.__enviado);
    expect(env[0].type).toMatch(/^image\//);
    expect(env[0].size).toBeGreaterThan(0);
});

test('Enviar sem compartilhar do aparelho baixa a imagem', async ({ page }) => {
    await page.addInitScript(() => { navigator.canShare = undefined; navigator.share = undefined; });
    await abrirComFoto(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#sim-enviar').click()]);
    expect(dl.suggestedFilename()).toMatch(/\.jpg$/);
});
