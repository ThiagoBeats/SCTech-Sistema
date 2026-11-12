// Aba "Galeria e Mostruario" em Configurar Empresa: fotos da galeria, cores e
// tecidos, e quais modelos aparecem no simulador.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const arquivo = (nome, buffer) => ({ name: nome, mimeType: 'image/png', buffer: buffer || PNG });
const salvo = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_mostruario') || 'null'));

async function abrir(page, extras) {
    await entrar(page, BASE, extras);
    await page.goto(BASE + '/empresa.html#galeria');
    await expect(page.locator('#gm-editor .gm-secao').first()).toBeVisible();
}

// PNG grande gerado no navegador (para conferir a reducao da textura)
async function pngGrande(page, w, h) {
    const b64 = await page.evaluate(([w, h]) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#8a6d4b'; g.fillRect(0, 0, w, h);
        return c.toDataURL('image/png').split(',')[1];
    }, [w, h]);
    return Buffer.from(b64, 'base64');
}

test('aba existe e abre por #galeria', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('.tab-btn[data-tab="galeria"]')).toHaveClass(/active/);
    await expect(page.locator('#gm-editor')).toContainText('Fotos da galeria');
    // com o simulador desligado, as secoes de cores e de modelos (so dele) ficam escondidas
    await expect(page.locator('#gm-editor')).not.toContainText('Cores e tecidos');
    await expect(page.locator('#gm-editor')).not.toContainText('Modelos que aparecem');
});

test('enviar foto grava no IndexedDB e no mostruario; grupo, legenda e ligacao', async ({ page }) => {
    await abrir(page);
    await page.locator('#gm-grupo-novo').selectOption('rolo');
    await page.locator('#gm-fotos-input').setInputFiles([arquivo('a.png'), arquivo('b.png')]);
    await expect(page.locator('.gm-foto')).toHaveCount(2);
    await expect(page.locator('.gm-contador')).toHaveText('2/60');
    let m = await salvo(page);
    expect(m.fotos.map(f => f.grupo)).toEqual(['rolo', 'rolo']);
    const ids = await page.evaluate(() => GaleriaImagens.ids());
    expect(ids).toContain(m.fotos[0].imagemId);

    const f = page.locator('.gm-foto').first();
    await f.locator('.gm-foto-grupo').selectOption('pregas');
    await f.locator('.gm-foto-legenda').fill('Wave na sala');
    await f.locator('.gm-foto-legenda').blur();
    await expect(f.locator('.gm-foto-liga')).toHaveCount(0); // ligar a modelo: so com o simulador
    m = await salvo(page);
    expect(m.fotos[0]).toMatchObject({ grupo: 'pregas', legenda: 'Wave na sala' });
});

test('remover foto apaga do IndexedDB depois de confirmar', async ({ page }) => {
    await abrir(page);
    await page.locator('#gm-fotos-input').setInputFiles([arquivo('a.png')]);
    await expect(page.locator('.gm-foto')).toHaveCount(1);
    const imagemId = (await salvo(page)).fotos[0].imagemId;
    await page.locator('.gm-foto .gm-foto-remover').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('.gm-foto')).toHaveCount(0);
    expect((await salvo(page)).fotos).toEqual([]);
    expect(await page.evaluate(() => GaleriaImagens.ids())).not.toContain(imagemId);
});

test('limite de 60 fotos', async ({ page }) => {
    const fotos = Array.from({ length: 60 }, (_, i) => ({ id: 'f' + i, grupo: 'pregas', imagemId: 'img-x' + i, legenda: '' }));
    await abrir(page, { sc_mostruario: { versao: 1, fotos } });
    await expect(page.locator('.gm-contador')).toHaveText('60/60');
    await expect(page.locator('#gm-enviar-fotos')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#gm-editor')).toContainText('Limite de 60 fotos');
});

test('adicionar cor com textura reduzida e remover', async ({ page }) => {
    test.skip(true, 'simulador desligado'); // cores e modelos so existem para o simulador
    await abrir(page);
    await page.locator('#gm-cor-nome').fill('Linho cru');
    await page.locator('#gm-cor-hex').fill('#c8b48a');
    await page.locator('#gm-cor-textura').setInputFiles([arquivo('t.png', await pngGrande(page, 1400, 1000))]);
    await page.locator('#gm-cor-adicionar').click();
    await expect(page.locator('.gm-cor')).toHaveCount(1);
    const m = await salvo(page);
    expect(m.cores[0]).toMatchObject({ nome: 'Linho cru', hex: '#c8b48a' });
    const lado = await page.evaluate(async id => { const b = await createImageBitmap(await GaleriaImagens.ler(id)); return Math.max(b.width, b.height); }, m.cores[0].texturaId);
    expect(lado).toBeLessThanOrEqual(512);
    await page.locator('.gm-cor .gm-cor-remover').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('.gm-cor')).toHaveCount(0);
});

test('cor sem nome nao entra', async ({ page }) => {
    test.skip(true, 'simulador desligado'); // cores e modelos so existem para o simulador
    await abrir(page);
    await page.locator('#gm-cor-adicionar').click();
    await expect(page.locator('.gm-cor')).toHaveCount(0);
});

test('desligar uma prega tira do mostruario', async ({ page }) => {
    test.skip(true, 'simulador desligado'); // cores e modelos so existem para o simulador
    await abrir(page);
    await page.locator('.gm-modelo[data-tipo="prega"][value="Franzido"]').uncheck();
    await page.locator('.gm-modelo[data-tipo="persiana"][value="double"]').uncheck();
    const m = await salvo(page);
    expect(m.modelos.pregas).not.toContain('Franzido');
    expect(m.modelos.pregas).toContain('Wave Botao');
    expect(m.modelos.persianas).toEqual(['rolo', 'romana']);
    await page.locator('.gm-modelo[data-tipo="trilho"][value="Trilho Motorizador"]').uncheck();
    const m2 = await salvo(page);
    expect(m2.modelos.trilhosOcultos).toEqual(['Trilho Motorizador']);
    expect(m2.modelos.trilhos).not.toContain('Trilho Motorizador');
});

test('sem acesso completo a empresa, so ve', async ({ page }) => {
    await entrar(page, BASE);
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].permissoes_extras = { 'configuracoes.empresa': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/empresa.html#galeria');
    await expect(page.locator('#gm-editor .gm-secao').first()).toBeVisible();
    await expect(page.locator('#gm-fotos-input')).toBeDisabled();
    // cores e modelos (so do simulador) nao aparecem com ele desligado
    await expect(page.locator('#gm-cor-adicionar')).toHaveCount(0);
    await expect(page.locator('.gm-modelo')).toHaveCount(0);
});

test('sem IndexedDB avisa e nao deixa enviar fotos', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
    await abrir(page);
    await expect(page.locator('.gm-aviso')).toContainText('não permite guardar fotos');
    await expect(page.locator('#gm-fotos-input')).toBeDisabled();
});
