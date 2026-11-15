// Pendencias gerais — menu de acoes (⋮) e carregador unico do SheetJS.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MENU = '#menu-acoes-flutuante';
const CDN = '**/xlsx.full.min.js';
const muitos = n => Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: 'Fornecedor ' + String(i + 1).padStart(2, '0') }));
const caixa = (page, sel) => page.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });

test('menu aberto fecha quando a lista e redesenhada (sem acao em ids velhos)', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: [{ id: 1, nome: 'Alfa' }, { id: 2, nome: 'Beta' }] });
    await page.goto(BASE + '/fornecedores.html');
    await page.evaluate(() => { window._chamadas = []; window.editarFornecedor = id => window._chamadas.push(id); });
    await page.locator('#tb-fornecedores tr', { hasText: 'Alfa' }).locator('button[aria-label="Ações"]').click();
    await expect(page.locator(MENU)).toHaveCount(1);
    // guarda o item do menu aberto: depois do redesenho ele precisa estar solto da pagina
    await page.evaluate(() => { window._itemVelho = [...document.querySelectorAll('#menu-acoes-flutuante .menu-acoes-item')].find(b => /Editar fornecedor/.test(b.textContent)); });
    const onde = await page.evaluate(() => { const r = window._itemVelho.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    // o outro lugar do sistema (ex.: outra aba/ação) redesenha a mesma lista
    await page.evaluate(() => renderTabelaFornecedores());
    await expect(page.locator(MENU)).toHaveCount(0);
    await expect(page.locator('#tb-fornecedores button[aria-expanded="true"]')).toHaveCount(0);
    expect(await page.evaluate(() => window._itemVelho.isConnected), 'item do menu velho saiu da pagina').toBe(false);
    // um clique de verdade onde o item estava nao chega em acao nenhuma
    await page.mouse.click(onde.x, onde.y);
    expect(await page.evaluate(() => window._chamadas), 'clicar onde o item estava nao executa acao').toEqual([]);
    await expect(page.locator(MENU)).toHaveCount(0);
    // e um menu novo, aberto depois, funciona normalmente
    await page.locator('#tb-fornecedores tr', { hasText: 'Beta' }).locator('button[aria-label="Ações"]').click();
    await expect(page.locator(MENU)).toHaveCount(1);
    await page.locator(MENU + ' .menu-acoes-item', { hasText: 'Editar fornecedor' }).click();
    expect(await page.evaluate(() => window._chamadas)).toEqual([2]);
});

test('menu perto da borda de baixo abre para cima e perto da direita fica dentro da tela', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 420 });
    await entrar(page, BASE, { sc_forn: muitos(40) });
    await page.goto(BASE + '/fornecedores.html');
    const ultimo = page.locator('#tb-fornecedores button[aria-label="Ações"]').last();
    await ultimo.scrollIntoViewIfNeeded();
    await ultimo.click();
    await expect(page.locator(MENU)).toHaveCount(1);
    const m = await caixa(page, MENU);
    const b = await ultimo.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; });
    const vp = page.viewportSize();
    expect(m.bottom, 'sem espaco embaixo: abre para cima do botao').toBeLessThanOrEqual(b.top);
    expect(m.top).toBeGreaterThanOrEqual(0);
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeLessThanOrEqual(vp.width);
    expect(m.bottom).toBeLessThanOrEqual(vp.height);
    expect(m.right, 'abre para a esquerda: alinhado a direita do botao').toBeLessThanOrEqual(b.right + 1);
    await page.keyboard.press('Escape');

    // com espaco embaixo, abre para baixo
    const primeiro = page.locator('#tb-fornecedores button[aria-label="Ações"]').first();
    await primeiro.scrollIntoViewIfNeeded();
    await primeiro.click();
    const m2 = await caixa(page, MENU);
    const b2 = await primeiro.evaluate(el => el.getBoundingClientRect().bottom);
    expect(m2.top, 'com espaco embaixo: abre para baixo').toBeGreaterThanOrEqual(b2);
});

test('menu numa tela estreita nao passa da borda esquerda nem da direita', async ({ page }) => {
    await page.setViewportSize({ width: 340, height: 700 });
    await entrar(page, BASE, { sc_forn: muitos(3) });
    await page.goto(BASE + '/fornecedores.html');
    await page.locator('#tb-fornecedores button[aria-label="Ações"]').first().click();
    const m = await caixa(page, MENU);
    expect(m.left).toBeGreaterThanOrEqual(8 - 0.5);
    expect(m.right).toBeLessThanOrEqual(340 - 8 + 0.5);
});

test('tema escuro: o menu tem fundo escuro e texto claro', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: muitos(2) });
    await page.goto(BASE + '/fornecedores.html');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.locator('#tb-fornecedores button[aria-label="Ações"]').first().click();
    const cores = await page.locator(MENU).evaluate(el => {
        const lum = css => { const n = css.match(/[\d.]+/g).map(Number); return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255; };
        const item = el.querySelector('.menu-acoes-item:not(.perigo)');
        return { fundo: lum(getComputedStyle(el).backgroundColor), texto: lum(getComputedStyle(item).color) };
    });
    expect(cores.fundo, 'fundo escuro').toBeLessThan(0.25);
    expect(cores.texto, 'texto claro').toBeGreaterThan(0.6);
});

test('onclick com aspas, & e < passa intacto pelo menu (escape do menuAcoesHtml)', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: [{ id: 1, nome: 'Alfa' }] });
    await page.goto(BASE + '/fornecedores.html');
    await page.evaluate(() => {
        window._recebido = null;
        window.guardar = v => { window._recebido = v; };
        const html = menuAcoesHtml([{ icone: '*', rotulo: 'Rotulo "x" & <y>', onclick: `guardar('a"b & c<d>', "e")` }]);
        const caixa = document.createElement('div'); caixa.id = 'caixa-teste'; caixa.innerHTML = html;
        document.body.appendChild(caixa);
    });
    await page.locator('#caixa-teste .btn-acoes').click();
    const item = page.locator(MENU + ' .menu-acoes-item');
    await expect(item).toHaveText(/Rotulo "x" & <y>$/);
    await item.click();
    expect(await page.evaluate(() => window._recebido)).toBe('a"b & c<d>');
});

test('SheetJS: um carregador so, usado pelo importador e pelo historico', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    let pedidos = 0;
    await page.route(CDN, r => { pedidos++; r.fulfill({ contentType: 'text/javascript', body: 'window.XLSX = { stub: true };' }); });
    const r = await page.evaluate(async () => {
        const antes = { xlsx: typeof window.XLSX, unico: typeof window.garantirSheetJs };
        await Promise.all([window._impGarantirSheetJs(), window._histGarantirSheetJs()]);
        return { antes, depois: typeof window.XLSX, scripts: document.querySelectorAll('script[src*="xlsx.full.min.js"]').length };
    });
    expect(r.antes.unico).toBe('function');
    expect(r.antes.xlsx).toBe('undefined');
    expect(r.depois).toBe('object');
    expect(r.scripts, 'um script so para os dois').toBe(1);
    expect(pedidos).toBe(1);
});

test('SheetJS: falha da rede diz o recurso certo e permite tentar de novo', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.route(CDN, r => r.abort());
    const msgs = await page.evaluate(async () => {
        const tenta = f => f().then(() => 'ok', e => e.message);
        return [await tenta(window._impGarantirSheetJs), await tenta(window._histGarantirSheetJs)];
    });
    expect(msgs[0]).toBe('Não foi possível carregar o leitor de planilhas — verifique sua conexão.');
    expect(msgs[1]).toBe('Não foi possível carregar o gerador de planilhas — verifique sua conexão.');
    await page.unroute(CDN);
    await page.route(CDN, r => r.fulfill({ contentType: 'text/javascript', body: 'window.XLSX = { stub: true };' }));
    const depois = await page.evaluate(async () => { await window._impGarantirSheetJs(); return typeof window.XLSX; });
    expect(depois, 'depois da falha, carregar de novo funciona').toBe('object');
});
