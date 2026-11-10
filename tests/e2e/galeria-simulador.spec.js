// Simulador: foto da parede, 4 cantos na janela, cortina/persiana 3D por cima,
// gaveta com Modelo/Cor/Trilho/Abertura e abrir/fechar arrastando.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const BEGE = [217, 207, 194];

async function abrirSim(page, hash, viewport) {
    if (viewport) await page.setViewportSize(viewport);
    await entrar(page, BASE);
    await page.goto(BASE + '/galeria.html' + (hash || '#simular'));
    await expect(page.locator('#sim')).toBeVisible();
}

// JPEG gerado no navegador: parede bege lisa
async function fotoParede(page, w, h) {
    const b64 = await page.evaluate(([w, h]) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = 'rgb(217,207,194)'; g.fillRect(0, 0, w, h);
        return c.toDataURL('image/jpeg', 0.95).split(',')[1];
    }, [w || 1200, h || 900]);
    return { name: 'parede.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

async function comFoto(page, w, h) {
    await page.locator('#sim-foto-arquivo').setInputFiles([await fotoParede(page, w, h)]);
    await expect.poll(() => page.evaluate(() => !!(window._sim && window._sim.foto))).toBe(true);
    await page.evaluate(() => window._sim.renderAgora());
}

// Ponto na tela (px CSS da pagina) do centro da janela marcada
const centroJanela = page => page.evaluate(() => {
    const q = window._sim.estado.cantos;
    const c = [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4];
    return window._sim.paraTela(c);
});

// Cor do canvas WebGL num ponto da pagina
const corEm = (page, p) => page.evaluate(p => {
    window._sim.renderAgora();
    const cv = window._sim.canvas, r = cv.getBoundingClientRect();
    const x = Math.round((p[0] - r.left) * cv.width / r.width), y = Math.round((p[1] - r.top) * cv.height / r.height);
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
    return Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
}, p);
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

async function arrastar(page, de, para) {
    await page.mouse.move(de[0], de[1]);
    await page.mouse.down();
    await page.mouse.move(para[0], para[1], { steps: 8 });
    await page.mouse.up();
}

test('abrir sem foto mostra os dois botoes', async ({ page }) => {
    await abrirSim(page);
    await expect(page.locator('.sim-inicio')).toContainText('Tirar foto');
    await expect(page.locator('.sim-inicio')).toContainText('Escolher foto');
    await expect(page.locator('#sim-foto-camera')).toHaveAttribute('capture', 'environment');
});

test('com foto, nasce com a janela marcada e a cortina por cima', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    const est = await page.evaluate(() => window._sim.estado);
    expect(est.cantos).toHaveLength(4);
    est.cantos.forEach(p => { expect(p[0]).toBeGreaterThanOrEqual(0); expect(p[0]).toBeLessThanOrEqual(1200); expect(p[1]).toBeGreaterThanOrEqual(0); expect(p[1]).toBeLessThanOrEqual(900); });
    await expect(page.locator('.sim-alca:not(.sim-alca-barra)')).toHaveCount(4);
    await expect(page.locator('.sim-alca-barra')).toBeVisible();
    await page.locator('.sim-aba[data-aba="cor"]').click();
    await page.locator('.sim-cor[data-valor="ini-grafite"]').click();
    const c = await corEm(page, await centroJanela(page));
    expect(distancia(c, BEGE)).toBeGreaterThan(25);
});

test('trocar a cor muda a cortina', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    await page.locator('.sim-aba[data-aba="cor"]').click();
    const centro = await centroJanela(page);
    await page.locator('.sim-cor').nth(0).click();
    const a = await corEm(page, centro);
    await page.locator('.sim-cor').nth(4).click();
    const b = await corEm(page, centro);
    expect(distancia(a, b)).toBeGreaterThan(40);
});

test('arrastar abre a cortina e mostra a parede no meio', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    const centro = await centroJanela(page);
    await arrastar(page, [centro[0] + 5, centro[1]], [centro[0] + 260, centro[1]]);
    const aberto = await page.evaluate(() => window._sim.estado.aberto);
    expect(aberto).toBeGreaterThan(0.6);
    expect(distancia(await corEm(page, centro), BEGE)).toBeLessThan(25);
});

test('persiana rolo sobe arrastando para cima', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    await page.locator('.sim-aba[data-aba="modelo"]').click();
    await page.locator('.sim-op[data-campo="modelo"][data-valor="persiana:rolo"]').click();
    expect(await page.evaluate(() => window._sim.estado.produto)).toBe('persiana');
    await expect(page.locator('.sim-aba[data-aba="trilho"]')).toBeHidden();
    const centro = await centroJanela(page);
    await arrastar(page, centro, [centro[0], centro[1] - 180]);
    expect(await page.evaluate(() => window._sim.estado.aberto)).toBeGreaterThan(0.3);
});

test('cantos cruzados sao corrigidos e ficam dentro da foto', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    const a0 = await page.locator('.sim-alca[data-i="0"]').boundingBox();
    const a2 = await page.locator('.sim-alca[data-i="2"]').boundingBox();
    await arrastar(page, [a0.x + a0.width / 2, a0.y + a0.height / 2], [a2.x + a2.width / 2 + 60, a2.y + a2.height / 2 + 40]);
    const q = await page.evaluate(() => window._sim.estado.cantos);
    const soma = q.map(p => p[0] + p[1]);
    expect(soma[0]).toBe(Math.min(...soma));
    q.forEach(p => { expect(p[0]).toBeGreaterThanOrEqual(0); expect(p[0]).toBeLessThanOrEqual(1200); expect(p[1]).toBeGreaterThanOrEqual(0); expect(p[1]).toBeLessThanOrEqual(900); });
    // arrastado para fora da foto: preso na borda
    const a1 = await page.locator('.sim-alca[data-i="1"]').boundingBox();
    await arrastar(page, [a1.x + a1.width / 2, a1.y + a1.height / 2], [a1.x - 2000, a1.y - 2000]);
    const q2 = await page.evaluate(() => window._sim.estado.cantos);
    q2.forEach(p => { expect(p[0]).toBeGreaterThanOrEqual(0); expect(p[1]).toBeGreaterThanOrEqual(0); });
});

test('barra da cortina arrastavel; some quando vai ate a janela', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    const b = await page.locator('.sim-alca-barra').boundingBox();
    await arrastar(page, [b.x + b.width / 2, b.y + b.height / 2], [b.x + b.width / 2, b.y + b.height / 2 - 40]);
    const barra = await page.evaluate(() => window._sim.estado.barra);
    expect(barra).not.toBeNull();
    const base = await page.evaluate(() => Math.max(window._sim.estado.cantos[2][1], window._sim.estado.cantos[3][1]));
    expect(barra).toBeGreaterThan(base);
    await page.locator('.sim-aba[data-aba="abertura"]').click();
    await page.locator('.sim-op[data-campo="ate"][data-valor="janela"]').click();
    await expect(page.locator('.sim-alca-barra')).toBeHidden();
});

test('canto puxado para dentro nao torce a cortina; cantos colados nao a somem', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    const centro = async i => { const b = await page.locator(`.sim-alca[data-i="${i}"]`).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const c0 = await centro(0), c2 = await centro(2);
    // canto inf-dir puxado para perto do sup-esq, alem da diagonal: ficaria concavo
    await arrastar(page, c2, [c0[0] + (c2[0] - c0[0]) * 0.3, c0[1] + (c2[1] - c0[1]) * 0.15]);
    expect(await page.evaluate(() => GaleriaCore.quadValido(window._sim.estado.cantos))).toBe(true);
    // canto sup-dir em cima do sup-esq
    await arrastar(page, await centro(1), await centro(0));
    expect(await page.evaluate(() => GaleriaCore.quadValido(window._sim.estado.cantos))).toBe(true);
});

test('cortina volta depois que o aparelho perde o 3D (ex.: atendeu uma ligacao)', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    await page.locator('.sim-aba[data-aba="cor"]').click();
    await page.locator('.sim-cor[data-valor="ini-grafite"]').click();
    const centro = await centroJanela(page);
    const antes = await corEm(page, centro);
    await page.evaluate(() => { window.__perda = window._sim.renderer.getContext().getExtension('WEBGL_lose_context'); window.__perda.loseContext(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__perda.restoreContext());
    await page.waitForTimeout(600);
    const depois = await page.evaluate(p => {
        const cv = window._sim.canvas, r = cv.getBoundingClientRect();
        const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
        const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
        return Array.from(g.getImageData(Math.round((p[0] - r.left) * cv.width / r.width), Math.round((p[1] - r.top) * cv.height / r.height), 1, 1).data.slice(0, 3));
    }, centro);
    expect(distancia(antes, depois)).toBeLessThan(20);
});

test('segurando um canto: cortina meio transparente e lupa com mira', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    await page.locator('.sim-aba[data-aba="cor"]').click();
    await page.locator('.sim-cor[data-valor="ini-grafite"]').click();
    const centro = await centroJanela(page);
    const cheia = await corEm(page, centro);
    await expect(page.locator('.sim-lupa')).toBeHidden();
    const b = await page.locator('.sim-alca[data-i="0"]').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 3, b.y + b.height / 2 + 3, { steps: 2 });
    // a cortina deixa ver a parede: fica entre a cor dela e a da parede
    const meia = await corEm(page, centro);
    expect(distancia(meia, cheia)).toBeGreaterThan(30);
    expect(distancia(meia, BEGE)).toBeGreaterThan(30);
    const lupa = page.locator('.sim-lupa');
    await expect(lupa).toBeVisible();
    await expect(lupa.locator('canvas')).toHaveCount(1);
    await expect(lupa.locator('.sim-lupa-mira')).toHaveCount(1);
    // a lupa nao fica embaixo do dedo
    const lb = await lupa.boundingBox();
    const dedo = [b.x + b.width / 2 + 3, b.y + b.height / 2 + 3];
    const cobre = dedo[0] > lb.x && dedo[0] < lb.x + lb.width && dedo[1] > lb.y && dedo[1] < lb.y + lb.height;
    expect(cobre).toBe(false);
    await page.mouse.up();
    await expect(lupa).toBeHidden();
    expect(distancia(await corEm(page, centro), cheia)).toBeLessThan(12);
});

test('lupa mostra a foto ampliada no ponto do canto', async ({ page }) => {
    await abrirSim(page);
    // foto com um quadrado vermelho exatamente onde nasce o canto 0 (30% x 25%)
    const b64 = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
        const g = c.getContext('2d'); g.fillStyle = 'rgb(217,207,194)'; g.fillRect(0, 0, 1200, 900);
        g.fillStyle = 'rgb(220,20,20)'; g.fillRect(360 - 6, 225 - 6, 12, 12);
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#sim-foto-arquivo').setInputFiles([{ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') }]);
    await expect.poll(() => page.evaluate(() => !!(window._sim && window._sim.foto))).toBe(true);
    await page.evaluate(() => window._sim.renderAgora());
    const b = await page.locator('.sim-alca[data-i="0"]').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect(page.locator('.sim-lupa')).toBeVisible();
    const px = await page.evaluate(() => {
        const c = document.querySelector('.sim-lupa canvas');
        return Array.from(c.getContext('2d').getImageData(Math.floor(c.width / 2) + 2, Math.floor(c.height / 2) + 2, 1, 1).data.slice(0, 3));
    });
    await page.mouse.up();
    expect(px[0]).toBeGreaterThan(180);
    expect(px[1]).toBeLessThan(90);
});

test('Animar abre e fecha a cortina na tela, sem baixar nada', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page);
    let baixou = false;
    page.on('download', () => { baixou = true; });
    const botao = page.locator('#sim-animar');
    await expect(botao).toBeVisible();
    await page.evaluate(() => {
        window.__maxAberto = 0;
        const t = setInterval(() => { window.__maxAberto = Math.max(window.__maxAberto, window._sim.estado.aberto); }, 50);
        setTimeout(() => clearInterval(t), 8000);
    });
    await botao.click();
    await expect(botao).toBeDisabled();
    await expect(botao).toBeEnabled({ timeout: 10000 });
    expect(await page.evaluate(() => window.__maxAberto)).toBeGreaterThan(0.8);
    expect(await page.evaluate(() => window._sim.estado.aberto)).toBe(0);
    expect(baixou).toBe(false);
});

test('link da galeria abre com a prega escolhida', async ({ page }) => {
    await abrirSim(page, '#simular?prega=Wave%20Botao');
    expect(await page.evaluate(() => window._sim.estado)).toMatchObject({ produto: 'cortina', prega: 'Wave Botao' });
    await page.goto(BASE + '/galeria.html#simular?persiana=romana');
    await expect.poll(() => page.evaluate(() => window._sim.estado.persiana)).toBe('romana');
    expect(await page.evaluate(() => window._sim.estado.produto)).toBe('persiana');
});

test('foto em pe de 4000 px e reduzida', async ({ page }) => {
    await abrirSim(page);
    await comFoto(page, 3000, 4000);
    expect(await page.evaluate(() => window._sim.foto)).toMatchObject({ w: 1200, h: 1600 });
});

test('gaveta recolhe; no PC vira painel ao lado da foto', async ({ page }) => {
    await abrirSim(page, '#simular', { width: 390, height: 844 });
    await comFoto(page);
    await expect(page.locator('.sim-abas')).toBeVisible();
    await page.locator('.sim-puxador').click();
    await expect(page.locator('.sim-abas')).toBeHidden();
    await page.locator('.sim-puxador').click();
    await expect(page.locator('.sim-abas')).toBeVisible();

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.evaluate(() => window._sim.renderAgora());
    const gaveta = await page.locator('.sim-gaveta').boundingBox();
    expect(gaveta.x).toBeGreaterThan(900);
    const q = await page.evaluate(() => window._sim.estado.cantos.map(p => window._sim.paraTela(p)));
    q.forEach(p => expect(p[0]).toBeLessThan(gaveta.x));
});

test('voltar fecha o simulador e mostra a galeria', async ({ page }) => {
    await abrirSim(page);
    await page.locator('.sim-voltar').click();
    await expect(page.locator('#sim')).toBeHidden();
    await expect(page.locator('#gal-conteudo')).toBeVisible();
});

test('sem WebGL mostra aviso claro', async ({ page }) => {
    await page.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/i.test(t) ? null : orig.call(this, t, o); };
    });
    await abrirSim(page);
    await expect(page.locator('.sim-sem-3d')).toContainText('não consegue mostrar o simulador 3D');
});
