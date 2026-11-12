// O simulador esta desligado por uma constante central (GaleriaCore.SIMULADOR_ATIVO).
// O codigo fica; nenhum acesso a ele aparece. A galeria de fotos segue funcionando.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

// Grava uma foto ligada a uma prega no IndexedDB e o mostruario apontando para ela.
async function semear(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/galeria.html');
    await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 40; c.height = 30;
        const g = c.getContext('2d'); g.fillStyle = '#7a1f3d'; g.fillRect(0, 0, 40, 30);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const imagemId = await GaleriaImagens.salvar(blob);
        localStorage.setItem('sc_mostruario', JSON.stringify({ versao: 1, cores: [], modelos: {},
            fotos: [{ id: 'f1', grupo: 'pregas', legenda: 'Wave na sala', imagemId, liga: { tipo: 'prega', valor: 'Wave Botao' } }] }));
    });
    await page.reload();
}

test('nenhum acesso ao simulador aparece (galeria, #simular, galeria do pedido, empresa)', async ({ page }) => {
    await semear(page);
    await expect(page.locator('.gal-foto[data-id="f1"]')).toBeVisible();
    await expect(page.locator('a.gal-simular-topo')).toHaveCount(0);
    await expect(page.locator('a.gal-simular')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Simular');

    // #simular vira galeria normal
    await page.goto(BASE + '/galeria.html#simular');
    await page.reload();
    await expect(page.locator('.gal-foto[data-id="f1"]')).toBeVisible();
    await expect(page.locator('#sim')).not.toBeVisible();

    // galeria do pedido
    await page.goto(BASE + '/pedido.html');
    await expect(page.locator('.btn-galeria-pedido')).not.toHaveAttribute('title', /simula/i);
    await page.click('.btn-galeria-pedido');
    await expect(page.locator('.galped-abas')).toBeVisible();
    await expect(page.locator('.galped-abas [data-aba="simular"]')).toHaveCount(0);
    await expect(page.locator('.galped-modelo-sim')).toHaveCount(0);

    // empresa
    await page.goto(BASE + '/empresa.html#galeria');
    await expect(page.locator('#gm-editor')).toBeVisible();
    await expect(page.locator('#emp-galeria-card')).not.toContainText(/simulador|Simular/i);
});

test('galeria de fotos continua abrindo', async ({ page }) => {
    await semear(page);
    await page.locator('.gal-foto[data-id="f1"]').click();
    await expect(page.locator('.gal-visor')).toBeVisible();
    await expect(page.locator('.gal-visor a.gal-simular')).toHaveCount(0);
});
