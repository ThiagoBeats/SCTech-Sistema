// CEP e endereco em partes no cadastro de cliente. As APIs de CEP sao sempre simuladas.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerLS = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const VIACEP_OK = { cep: '80020-310', logradouro: 'Rua XV de Novembro', bairro: 'Centro', localidade: 'Curitiba', uf: 'PR' };
const MSG_NAO_ACHOU = 'CEP não encontrado. Confira os números ou preencha o endereço à mão.';
const MSG_FALHA = 'Não deu para buscar o endereço agora. Preencha à mão.';

async function abrir(page, extras) {
    await entrar(page, BASE, extras || {});
    await page.goto(BASE + '/clientes.html');
    await expect(page.locator('#cli-cep')).toBeVisible();
}
function viacep(page, corpo) {
    return page.route('https://viacep.com.br/**', r => r.fulfill({ json: corpo }));
}

test('CEP completo: botao aparece, preenche, foco no numero, salva e lista', async ({ page }) => {
    await viacep(page, VIACEP_OK);
    await abrir(page);
    await page.fill('#cli-nome', 'Carla');
    await page.fill('#cli-cep', '80020310');
    await expect(page.locator('#cli-cep')).toHaveValue('80020-310');
    await expect(page.locator('#cli-buscar-cep')).toBeVisible();
    await page.click('#cli-buscar-cep');
    await expect(page.locator('#cli-rua')).toHaveValue('Rua XV de Novembro');
    await expect(page.locator('#cli-bairro')).toHaveValue('Centro');
    await expect(page.locator('#cli-cidade')).toHaveValue('Curitiba');
    await expect(page.locator('#cli-uf')).toHaveValue('PR');
    await expect(page.locator('#cli-numero')).toBeFocused();
    await page.fill('#cli-numero', '100');
    await page.click('#cli-btn-salvar');
    await expect(page.locator('#tb-clientes')).toContainText('Rua XV de Novembro, 100, Centro — Curitiba/PR');
    const c = (await lerLS(page, 'sc_cli'))[0];
    expect(c).toMatchObject({ cep: '80020310', rua: 'Rua XV de Novembro', numero: '100', bairro: 'Centro',
        cidade: 'Curitiba', uf: 'PR', end: 'Rua XV de Novembro, 100, Centro' });
});

test('CEP com 7 ou 9 digitos: botao oculto; mascarado e com espacos busca certo', async ({ page }) => {
    let url = '';
    await page.route('https://viacep.com.br/**', r => { url = r.request().url(); r.fulfill({ json: VIACEP_OK }); });
    await abrir(page);
    await page.fill('#cli-cep', '8002031');
    await expect(page.locator('#cli-buscar-cep')).toBeHidden();
    await page.fill('#cli-cep', ' 80.020-310 ');
    await expect(page.locator('#cli-buscar-cep')).toBeVisible();
    await page.click('#cli-buscar-cep');
    await expect(page.locator('#cli-rua')).toHaveValue('Rua XV de Novembro');
    expect(url).toBe('https://viacep.com.br/ws/80020310/json/');
});

test('CEP nao encontrado: mensagem e campos digitados continuam', async ({ page }) => {
    await viacep(page, { erro: true });
    await abrir(page);
    await page.fill('#cli-rua', 'Minha rua');
    await page.fill('#cli-cep', '99999999');
    await page.press('#cli-cep', 'Enter');
    await expect(page.locator('#cli-cep-status')).toHaveText(MSG_NAO_ACHOU);
    await expect(page.locator('#cli-rua')).toHaveValue('Minha rua');
});

test('ViaCEP fora do ar: usa a BrasilAPI; as duas fora: mensagem de falha', async ({ page }) => {
    await page.route('https://viacep.com.br/**', r => r.abort());
    await page.route('https://brasilapi.com.br/**', r => r.fulfill({ json: { street: 'Rua B', neighborhood: 'Bairro B', city: 'Maringá', state: 'PR' } }));
    await abrir(page);
    await page.fill('#cli-cep', '87000000');
    await page.click('#cli-buscar-cep');
    await expect(page.locator('#cli-rua')).toHaveValue('Rua B');
    await expect(page.locator('#cli-cidade')).toHaveValue('Maringá');

    await page.unroute('https://brasilapi.com.br/**');
    await page.route('https://brasilapi.com.br/**', r => r.abort());
    await page.fill('#cli-cep', '87000001');
    await page.click('#cli-buscar-cep');
    await expect(page.locator('#cli-cep-status')).toHaveText(MSG_FALHA);
});

test('CEP da cidade toda: preenche cidade e estado e avisa', async ({ page }) => {
    await viacep(page, { cep: '85000-000', logradouro: '', bairro: '', localidade: 'Guarapuava', uf: 'PR' });
    await abrir(page);
    await page.fill('#cli-cep', '85000000');
    await page.click('#cli-buscar-cep');
    await expect(page.locator('#cli-cidade')).toHaveValue('Guarapuava');
    await expect(page.locator('#cli-uf')).toHaveValue('PR');
    await expect(page.locator('#cli-cep-status')).toHaveText('Esse CEP é da cidade toda: preencha a rua e o bairro.');
});

test('resposta de um CEP antigo nao preenche depois de trocar o CEP', async ({ page }) => {
    await page.route('https://viacep.com.br/**', async r => {
        await new Promise(res => setTimeout(res, 400));
        r.fulfill({ json: VIACEP_OK });
    });
    await abrir(page);
    await page.fill('#cli-cep', '80020310');
    await page.click('#cli-buscar-cep');
    await page.fill('#cli-cep', '80020311');
    await page.waitForTimeout(800);
    await expect(page.locator('#cli-rua')).toHaveValue('');
});

test('cliente antigo: texto livre vai para Rua e salvar sem mexer mantem o end', async ({ page }) => {
    await abrir(page, { sc_cli: [{ id: 1, nome: 'Velho', end: 'Rua A, 5, Centro', cidade: 'Toledo' }] });
    await page.locator('#tb-clientes .btn-kebab').first().click();
    await page.locator('.menu-acoes-item', { hasText: 'Editar cliente' }).click();
    await expect(page.locator('#cli-rua')).toHaveValue('Rua A, 5, Centro');
    await expect(page.locator('#cli-cidade')).toHaveValue('Toledo');
    await page.click('#cli-btn-salvar');
    await expect(page.locator('#tb-clientes')).toContainText('Rua A, 5, Centro — Toledo');
    const c = (await lerLS(page, 'sc_cli'))[0];
    expect(c.end).toBe('Rua A, 5, Centro');
    expect(c.cidade).toBe('Toledo');
});

test('CEP em branco salva normal', async ({ page }) => {
    await abrir(page);
    await page.fill('#cli-nome', 'Sem CEP');
    await page.fill('#cli-rua', 'Rua Z');
    await page.click('#cli-btn-salvar');
    await expect(page.locator('#tb-clientes')).toContainText('Sem CEP');
    const c = (await lerLS(page, 'sc_cli'))[0];
    expect(c.cep).toBe('');
    expect(c.end).toBe('Rua Z');
});

test('campo CEP com 8 digitos tem altura normal e mostra o CEP inteiro (celular e desktop)', async ({ page }) => {
    await abrir(page);
    for (const w of [360, 1280]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.fill('#cli-cep', '80020310');
        const cep = await page.locator('#cli-cep').boundingBox();
        const rua = await page.locator('#cli-numero').boundingBox();
        expect(Math.abs(cep.height - rua.height)).toBeLessThan(4);
        expect(cep.width).toBeGreaterThan(100);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
});
