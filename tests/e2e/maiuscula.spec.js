// Maiuscula automatica em campos de texto livre; campos de codigo/contato/busca ficam como digitados.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RELOGIO = new Date(2026, 10, 18, 10, 0, 0);

async function abrir(page, pagina, esperar) {
    await page.clock.setFixedTime(RELOGIO);
    await entrar(page, BASE, {});
    await page.goto(BASE + '/' + pagina);
    await expect(page.locator(esperar)).toBeVisible();
}
const digitar = async (page, sel, txt) => { await page.locator(sel).click(); await page.keyboard.type(txt); };

test('cliente: nome, endereco e e-mail/cep/cpf/telefone/busca', async ({ page }) => {
    await abrir(page, 'clientes.html', '#cli-nome');
    await digitar(page, '#cli-nome', 'maria silva. filha de ana');
    await expect(page.locator('#cli-nome')).toHaveValue('Maria silva. Filha de ana');
    await digitar(page, '#cli-rua', 'rua das flores');
    await expect(page.locator('#cli-rua')).toHaveValue('Rua das flores');
    await digitar(page, '#cli-complemento', 'apto 3. bloco b');
    await expect(page.locator('#cli-complemento')).toHaveValue('Apto 3. Bloco b');
    await digitar(page, '#cli-email', 'maria@x.com');
    await expect(page.locator('#cli-email')).toHaveValue('maria@x.com');
    await digitar(page, '#cli-tel', 'abc');
    await expect(page.locator('#cli-tel')).toHaveValue('abc');
    await digitar(page, '#cli-cpf', 'abc');
    await expect(page.locator('#cli-cpf')).toHaveValue('abc');
    await digitar(page, '#cli-busca', 'maria');
    await expect(page.locator('#cli-busca')).toHaveValue('maria');
});

test('pedido: observacao em textarea', async ({ page }) => {
    await abrir(page, 'pedido.html', '#ped-obs');
    await digitar(page, '#ped-obs', 'instalar sabado. cliente tem pet! cuidado? sim');
    await expect(page.locator('#ped-obs')).toHaveValue('Instalar sabado. Cliente tem pet! Cuidado? Sim');
});

test('janela criada depois tambem recebe; cnpj nao; layout igual', async ({ page }) => {
    await abrir(page, 'financeiro.html', 'body');
    await page.evaluate(() => abrirModalContaPagar('manual'));
    const campo = page.locator('#cpm-descricao');
    await expect(campo).toBeVisible();
    const antes = await campo.boundingBox();
    await digitar(page, '#cpm-descricao', 'compra de tecido. voal branco');
    await expect(campo).toHaveValue('Compra de tecido. Voal branco');
    const depois = await campo.boundingBox();
    expect(depois.width).toBe(antes.width);
    expect(depois.height).toBe(antes.height);
    await digitar(page, '#cpm-cnpj', '12345678000190');
    await expect(page.locator('#cpm-cnpj')).toHaveValue('12.345.678/0001-90');
});

test('login: e-mail e senha como digitados', async ({ page }) => {
    await page.goto(BASE + '/login.html');
    await digitar(page, '#login-usuario', 'ana@x.com');
    await digitar(page, '#login-senha', 'segredo');
    await expect(page.locator('#login-usuario')).toHaveValue('ana@x.com');
    await expect(page.locator('#login-senha')).toHaveValue('segredo');
});

test('acento composto no inicio gera maiuscula acentuada', async ({ page }) => {
    await abrir(page, 'clientes.html', '#cli-nome');
    await page.locator('#cli-nome').click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '´', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: 'á' });
    await expect(page.locator('#cli-nome')).toHaveValue('Á');
});

test('valor definido por codigo nao e alterado; cursor mantido no meio', async ({ page }) => {
    await abrir(page, 'clientes.html', '#cli-nome');
    await page.evaluate(() => { document.getElementById('cli-nome').value = 'joao'; });
    await expect(page.locator('#cli-nome')).toHaveValue('joao');
    await page.locator('#cli-nome').fill('ana maria');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('x');
    const pos = await page.evaluate(() => document.getElementById('cli-nome').selectionStart);
    expect(pos).toBe(2);
});
