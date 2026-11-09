// Pedido: o desenho da cortina mostra a abertura e a prega de cada tecido.
// Trocar a abertura ou a prega toca a cortina abrindo; ao abrir o pedido o desenho e parado.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function abrirPedido(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/pedido.html');
    const sel = page.locator('select[id^="a-abertura-"]').first();
    if (!(await sel.count())) await page.locator('button:has-text("Ambiente")').first().click();
    await expect(page.locator('select[id^="a-abertura-"]').first()).toBeVisible();
}

const img = page => page.locator('img[id^="img-abertura-"]').first();
const legenda = page => page.locator('[id^="lbl-abertura-"]').first();
const carregou = el => el.evaluate(i => i.complete && i.naturalWidth > 0);
// SVG do desenho, lido da url de dados
const desenho = page => img(page).evaluate(i => decodeURIComponent(i.src.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')));

test('ao abrir, o desenho e parado e mostra a abertura e a prega', async ({ page }) => {
    await abrirPedido(page);
    await expect(img(page)).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await expect.poll(() => carregou(img(page))).toBe(true);
    const s = await desenho(page);
    expect(s).not.toContain('<animate');
    expect(s).toContain('Prega Americana');
    await expect(legenda(page)).toHaveText('Abertura A · Prega Americana');
});

test('trocar a abertura toca a cortina abrindo, uma vez por troca', async ({ page }) => {
    await abrirPedido(page);
    await page.locator('select[id^="a-abertura-"]').first().selectOption('C');
    await expect(legenda(page)).toHaveText('Abertura C · Prega Americana');
    await expect.poll(() => carregou(img(page))).toBe(true);
    expect(await desenho(page)).toContain('<animateTransform');
    expect(await desenho(page)).toContain('Abertura Central');
    await page.locator('select[id^="a-abertura-"]').first().selectOption('G');
    await expect(legenda(page)).toHaveText('Abertura G · Prega Americana');
    expect(await desenho(page)).toContain('Recolhimento Central');
});

test('trocar a prega troca o desenho e a legenda', async ({ page }) => {
    await abrirPedido(page);
    await page.locator('select[id^="t-prega-"]').first().selectOption('Wave Botao');
    await expect(legenda(page)).toHaveText('Abertura A · Wave Botão');
    await expect.poll(() => carregou(img(page))).toBe(true);
    const s = await desenho(page);
    expect(s).toContain('Wave Botão');
    expect(s).toContain('<animateTransform');
    await expect(img(page)).toHaveAttribute('alt', 'Abertura A · Wave Botão');
});

test('um tecido a mais vira uma camada a mais no desenho', async ({ page }) => {
    await abrirPedido(page);
    await page.locator('select[id^="t-prega-"]').first().selectOption('Wave Plus');
    await page.locator('button:has-text("+ Adicionar Tecido")').first().click();
    await page.locator('select[id^="t-prega-"]').nth(1).selectOption('Franzido');
    await expect(legenda(page)).toHaveText('Abertura A · Wave Plus/Flex + Franzido');
    expect((await desenho(page)).match(/<clipPath id="lupa\d"/g)).toHaveLength(2);
});

test('quem pede menos movimento ve o desenho parado', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrirPedido(page);
    await page.locator('select[id^="a-abertura-"]').first().selectOption('D');
    await expect(legenda(page)).toHaveText('Abertura D · Prega Americana');
    expect(await desenho(page)).not.toContain('<animate');
});

test('proposta: o desenho da abertura mostra as pregas dos tecidos', async ({ page }) => {
    const amb = { id: 1, amb: 'Sala', abertura: 'C', largura: 3, altura: 2.6, calculado: true,
        tecidos: [{ tecidoNome: 'Linho', prega: 'Wave Botao', fator: 2 }, { tecidoNome: 'Voil', prega: 'Franzido', fator: 2.5 }] };
    await entrar(page, BASE, {
        sc_ped: [{ id: 26050, clienteId: 1, clienteNome: 'Maria', status: 'Orçamento', valor: 100, ambientes: [amb] }],
        sc_cli: [{ id: 1, nome: 'Maria' }], sc_proposta_id: 26050
    });
    await page.goto(BASE + '/proposta.html');
    const i = page.locator('#proposta-container img[alt^="Abertura C"]');
    await expect(i).toHaveAttribute('alt', 'Abertura C · Wave Botão + Franzido');
    await expect.poll(() => i.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
});
