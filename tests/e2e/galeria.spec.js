// Pagina Galeria: fotos reais por grupo, visor em tela cheia e atalho para o
// simulador. Item novo no menu, com permissao propria.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

// Grava fotos no IndexedDB (canvas colorido) e o mostruario apontando para elas.
async function semear(page, fotos) {
    await page.goto(BASE + '/galeria.html');
    await page.evaluate(async fotos => {
        const m = { versao: 1, cores: [], fotos: [], modelos: {} };
        for (const f of fotos) {
            const c = document.createElement('canvas'); c.width = 40; c.height = 30;
            const g = c.getContext('2d'); g.fillStyle = f.cor || '#7a1f3d'; g.fillRect(0, 0, 40, 30);
            const blob = await new Promise(r => c.toBlob(r, 'image/png'));
            const imagemId = f.semImagem ? 'img-apagada' : await GaleriaImagens.salvar(blob);
            m.fotos.push({ id: f.id, grupo: f.grupo, legenda: f.legenda, imagemId, liga: f.liga || null });
        }
        localStorage.setItem('sc_mostruario', JSON.stringify(m));
    }, fotos);
    await page.reload();
}

test('a Galeria saiu do menu lateral (abre dentro do pedido), e a pagina continua abrindo', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#main-sidebar a.nav-item', { hasText: 'Pedidos' })).toBeVisible();
    await expect(page.locator('#main-sidebar a[href="galeria.html"]')).toHaveCount(0);
    await page.goto(BASE + '/galeria.html');
    await expect(page.locator('.header h2')).toContainText('Galeria');
});

test('papel Instalacao ve a Galeria', async ({ page }) => {
    await entrar(page, BASE);
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr')); u[0].papel_id = 5;
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/galeria.html');
    await expect(page.locator('.header h2')).toContainText('Galeria');
    expect(page.url()).toContain('galeria.html');
});

test('papel salvo antes da Galeria ganha visualizar', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => {
        db.papeis.forEach(p => { delete p.permissoes.galeria; });
        localStorage.setItem('sc_pap', JSON.stringify(db.papeis));
    });
    await page.reload();
    const niveis = await page.evaluate(() => db.papeis.map(p => [p.nome, p.permissoes.galeria && p.permissoes.galeria.nivel]));
    expect(niveis).toContainEqual(['Administrador', 'completo']);
    expect(niveis).toContainEqual(['Instalação', 'visualizar']);
    expect(niveis).toContainEqual(['Financeiro', 'visualizar']);
});

test('sem fotos mostra convite para montar o mostruario', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/galeria.html');
    await expect(page.locator('#gal-conteudo')).toContainText('Nenhuma foto na galeria');
    await expect(page.locator('#gal-conteudo a[href="empresa.html#galeria"]')).toBeVisible();
    await expect(page.locator('a.gal-simular-topo')).toHaveCount(0); // simulador desligado
});

test('fotos agrupadas e visor em tela cheia', async ({ page }) => {
    await entrar(page, BASE);
    await semear(page, [
        { id: 'f1', grupo: 'pregas', legenda: 'Wave na sala' },
        { id: 'f2', grupo: 'pregas', legenda: 'Americana no quarto', cor: '#1f3a5f' },
        { id: 'f3', grupo: 'rolo', legenda: 'Rolô blackout' }
    ]);
    const grupos = page.locator('.gal-grupo h3');
    await expect(grupos).toHaveText(['Pregas', 'Rolô']);
    await expect(page.locator('.gal-foto')).toHaveCount(3);
    await page.locator('.gal-foto').first().click();
    const visor = page.locator('.gal-visor');
    await expect(visor).toBeVisible();
    await expect(visor.locator('.gal-visor-legenda')).toHaveText('Wave na sala');
    await page.keyboard.press('ArrowRight');
    await expect(visor.locator('.gal-visor-legenda')).toHaveText('Americana no quarto');
    // deslizar para a esquerda avanca
    const box = await visor.boundingBox();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(visor.locator('.gal-visor-legenda')).toHaveText('Rolô blackout');
    await page.keyboard.press('Escape');
    await expect(visor).toBeHidden();
});

test('foto ligada a uma prega leva ao simulador com ela', async ({ page }) => {
    test.skip(true, 'simulador desligado');
    await entrar(page, BASE);
    await semear(page, [{ id: 'f1', grupo: 'pregas', legenda: 'Wave', liga: { tipo: 'prega', valor: 'Wave Botao' } },
                        { id: 'f2', grupo: 'pregas', legenda: 'Sem ligação' }]);
    await expect(page.locator('.gal-foto[data-id="f1"] a.gal-simular')).toHaveAttribute('href', 'galeria.html#simular?prega=Wave%20Botao');
    await expect(page.locator('.gal-foto[data-id="f2"] a.gal-simular')).toHaveCount(0);
    await page.locator('.gal-foto[data-id="f1"]').click();
    await expect(page.locator('.gal-visor a.gal-simular')).toBeVisible();
});

test('foto cuja imagem nao existe mais e ignorada', async ({ page }) => {
    await entrar(page, BASE);
    await semear(page, [{ id: 'f1', grupo: 'pregas', legenda: 'Existe' }, { id: 'f2', grupo: 'rolo', legenda: 'Sumiu', semImagem: true }]);
    await expect(page.locator('.gal-foto')).toHaveCount(1);
    await expect(page.locator('.gal-grupo h3')).toHaveText(['Pregas']);
});
