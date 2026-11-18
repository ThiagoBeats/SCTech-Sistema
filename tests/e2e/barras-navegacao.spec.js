// Barra superior fixa (empresa, data, sino, avatar) e barra lateral nova.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const PAGINAS = ['index.html', 'pedidos.html', 'estoque.html'];

function luminancia(rgb) {
    const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) || [255, 255, 255]).slice(0, 3).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

for (const pg of PAGINAS) {
    test(`barra superior em ${pg}: fixa, escura, com a empresa e sem o titulo do modulo`, async ({ page }) => {
        await entrar(page, BASE, { sc_empresa: { razao_social: 'X LTDA', nome_fantasia: 'CASA DAS CORTINAS' } });
        await page.goto(BASE + '/' + pg);
        const bar = page.locator('#topbar');
        await expect(bar).toBeVisible();
        const info = await bar.evaluate(el => {
            const cs = getComputedStyle(el);
            return { pos: cs.position, bg: cs.backgroundColor, w: el.getBoundingClientRect().width, vw: document.documentElement.clientWidth };
        });
        expect(info.pos).toBe('fixed');
        expect(Math.round(info.w)).toBe(info.vw);
        expect(luminancia(info.bg)).toBeLessThan(0.3);
        await expect(page.locator('#topbar-empresa')).toContainText('CASA DAS CORTINAS');
        const titulo = (await page.locator('.main .header h2').first().innerText()).trim();
        expect(titulo.length).toBeGreaterThan(0);
        await expect(bar).not.toContainText(titulo);
        await expect(page.locator('#topbar-data')).toContainText('Hoje,');
        await expect(page.locator('#topbar-sino')).toHaveCount(1);
        await expect(page.locator('#topbar-avatar')).toBeVisible();
        // nada fica escondido embaixo da barra: a lateral comeca abaixo dela
        const topo = await page.locator('#main-sidebar').evaluate(el => el.getBoundingClientRect().top);
        expect(topo).toBeGreaterThanOrEqual(58);
    });
}

test('a lateral mantem os mesmos links; Sair do sistema fica no rodape', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    const hrefs = await page.locator('#main-sidebar a.nav-item').evaluateAll(as => as.map(a => a.getAttribute('href')));
    expect(hrefs).toEqual(['index.html', 'pedidos.html', 'pcp.html', 'expedicao.html', 'estoque.html', 'clientes.html',
        'catalogo.html', 'vendedores.html', 'fornecedores.html', 'financeiro.html', 'configuracoes.html']);
    const sair = page.locator('#main-sidebar #sidebar-sair');
    await expect(sair).toContainText('Sair do sistema');
    const [bs, bn] = await Promise.all([sair.boundingBox(), page.locator('#main-sidebar a.nav-item').last().boundingBox()]);
    expect(bs.y).toBeGreaterThan(bn.y);
    const sb = await page.locator('#main-sidebar').boundingBox();
    expect(bs.y + bs.height).toBeGreaterThan(sb.y + sb.height - 70);
});

test('o alfinete continua fixando e recolhendo a lateral', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    const pin = page.locator('#main-sidebar #sidebar-pin-btn');
    await expect(pin).toHaveText('📌');
    await expect(pin).toHaveClass(/fixado/);
    await page.click('#sidebar-pin-btn');
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
    await page.mouse.move(600, 400);
    await expect.poll(async () => Math.round((await page.locator('#main-sidebar').boundingBox()).width)).toBe(80);
    // solta, a lateral fica abaixo da barra superior (nao a cobre)
    expect((await page.locator('#main-sidebar').boundingBox()).y).toBeGreaterThanOrEqual(58);
    await page.locator('#main-sidebar').hover();
    await page.click('#sidebar-pin-btn');
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'expanded');
});

test('o avatar abre o menu do perfil com os itens de sempre', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.click('#topbar-avatar');
    const menu = page.locator('#logo-popup');
    await expect(menu).toHaveClass(/open/);
    for (const t of ['Meu perfil', 'Sobre o Sistema', 'Configurar Empresa', 'Sair']) await expect(menu).toContainText(t);
    await expect(menu).toBeInViewport();
});

test('quem nao tem acesso a Configurar Empresa nao ve o item', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { window.temAcesso = (m) => m !== 'configuracoes.empresa'; atualizarTopbar(); });
    await page.click('#topbar-avatar');
    await expect(page.locator('#logo-popup')).not.toContainText('Configurar Empresa');
    await expect(page.locator('#logo-popup')).toContainText('Sair');
});

test('trocar o nome da empresa atualiza a barra superior', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'X LTDA', nome_fantasia: 'ANTES' } });
    await page.goto(BASE + '/empresa.html');
    await page.locator('#emp-fantasia').fill('DEPOIS LTDA');
    await page.evaluate(() => salvarEmpresaConfigs());
    await expect(page.locator('#topbar-empresa')).toContainText('DEPOIS LTDA');
});

test('clicar na data abre a Agenda e chama abrirAgenda', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.click('#topbar-data');   // a Agenda existe: abre a janela
    await expect(page.locator('#agenda-janela')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#agenda-janela')).toHaveCount(0);
    await page.evaluate(() => { window.__agenda = 0; window.abrirAgenda = () => { window.__agenda++; }; });
    await page.click('#topbar-data');
    expect(await page.evaluate(() => window.__agenda)).toBe(1);
    expect(erros).toEqual([]);
});

test('tema escuro: barras sem fundo claro', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const lum = async sel => luminancia(await page.locator(sel).evaluate(el => getComputedStyle(el).backgroundColor));
    expect(await lum('#topbar')).toBeLessThan(0.15);
    expect(await lum('#main-sidebar')).toBeLessThan(0.15);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    expect(await lum('#main-sidebar')).toBeGreaterThan(0.8);
});

test('celular 360px: sem rolagem horizontal e barra compacta', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await entrar(page, BASE, { sc_empresa: { razao_social: 'X LTDA', nome_fantasia: 'CASA DAS CORTINAS DO JOAO' } });
    for (const pg of PAGINAS) {
        await page.goto(BASE + '/' + pg);
        await expect(page.locator('#topbar')).toBeVisible();
        const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(ov, pg).toBeLessThanOrEqual(0);
        await expect(page.locator('#topbar-data-texto')).toBeHidden();
        await expect(page.locator('#topbar-data')).toBeVisible();
        const bb = await page.locator('#topbar-avatar').boundingBox();
        expect(bb.x + bb.width).toBeLessThanOrEqual(360);
    }
});
