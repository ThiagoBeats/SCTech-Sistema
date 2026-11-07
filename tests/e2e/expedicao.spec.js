const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const AMB = [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }];
const SEED = {
    sc_ped: [
        { id: 26001, clienteId: 1, clienteNome: 'Maria', status: 'Pronto p/ Instalação', valor: 100, ambientes: AMB, volumes: 3 },
        { id: 26002, clienteId: 2, clienteNome: 'Joana Lima', status: 'Pronto p/ Instalação', valor: 100, ambientes: AMB, volumes: 2 }
    ],
    sc_cli: [{ id: 1, nome: 'Maria', end: 'Rua A, 1', tel: '1111' }, { id: 2, nome: 'Joana Lima', end: 'Rua B, 2', tel: '2222' }]
};

async function ler(page, codigo) {
    await page.fill('#exp-leitura', codigo);
    await page.press('#exp-leitura', 'Enter');
}
const lerPedido = (page, id) => page.evaluate(i => JSON.parse(localStorage.getItem('sc_ped')).find(x => x.id === i), id);

async function abrir(page) {
    await entrar(page, BASE, SEED);
    await page.goto(BASE + '/expedicao.html');
    await page.waitForSelector('#exp-leitura');
}

async function conferenciaCompleta(page) {
    await ler(page, '26001');
    await ler(page, '26001-1-3');
    await ler(page, '26001-3-3');
    await ler(page, '26001-2-3');
    await expect(page.locator('#exp-resultado')).toContainText('✅ Pedido #26001 conferido: 3 volume(s).');
    await expect(page.locator('.exp-vol', { hasText: '✅' })).toHaveCount(3);
    const p = await lerPedido(page, 26001);
    expect(p.conferencia.concluida_em).toBeTruthy();
    expect(p.conferencia.conferido_por).toBe('Teste');
    expect(p.status).toBe('Pronto p/ Instalação');
}

test('conferencia completa', async ({ page }) => {
    await abrir(page);
    await conferenciaCompleta(page);
});

test('pacote de outro pedido', async ({ page }) => {
    await abrir(page);
    await ler(page, '26001');
    await ler(page, '26002-1-2');
    await expect(page.locator('#exp-resultado')).toContainText('Este pacote é do pedido #26002, não do #26001');
    await expect(page.locator('#exp-resultado')).toHaveClass(/erro/);
});

test('repetido e desconhecido', async ({ page }) => {
    await abrir(page);
    await ler(page, '26001');
    await ler(page, '26001-1-3');
    await ler(page, '26001-1-3');
    await expect(page.locator('#exp-resultado')).toContainText('já foi conferido');
    await ler(page, '99999');
    await expect(page.locator('#exp-resultado')).toContainText('Pedido #99999 não encontrado.');
});

test('etiqueta desatualizada', async ({ page }) => {
    await abrir(page);
    await ler(page, '26001');
    await ler(page, '26001-1-2');
    await expect(page.locator('#exp-resultado')).toContainText('Etiqueta desatualizada');
});

test('consulta sem pedido ativo', async ({ page }) => {
    await abrir(page);
    await ler(page, '26002-1-2');
    await expect(page.locator('#exp-resultado')).toContainText('Consulta: pedido #26002');
    await expect(page.locator('#exp-pedido')).toContainText('Joana Lima');
});

test('progresso parcial sobrevive e aparece no card', async ({ page }) => {
    await abrir(page);
    await ler(page, '26001');
    await ler(page, '26001-1-3');
    await expect(page.locator('.exp-vol', { hasText: '✅' })).toHaveCount(1);
    await page.reload();
    await page.waitForSelector('#exp-leitura');
    await ler(page, '26001');
    await expect(page.locator('.exp-vol', { hasText: '✅' })).toHaveCount(1);
    await page.goto(BASE + '/pcp.html');
    await expect(page.locator('body')).toContainText('1/3 conferidos');
});

test('menu mostra Expedicao', async ({ page }) => {
    await entrar(page, BASE, SEED);
    await page.goto(BASE + '/index.html');
    await expect(page.locator('a.nav-item[href="expedicao.html"]')).toBeVisible();
});

test('funciona sem internet', async ({ page }) => {
    await page.route(/jsdelivr/, r => r.abort());
    await abrir(page);
    await conferenciaCompleta(page);
});

test('foco volta ao campo depois de Ver OS', async ({ page }) => {
    await abrir(page);
    await ler(page, '26001');
    await page.click('#exp-ver-os');
    await page.locator('#doc-modal-overlay.active').waitFor();
    await page.locator('#doc-modal-overlay button', { hasText: 'Fechar' }).first().click();
    await expect(page.locator('#doc-modal-overlay.active')).toHaveCount(0);
    await page.keyboard.type('26001-1-3');
    await page.keyboard.press('Enter');
    await expect(page.locator('#exp-resultado')).toContainText('Volume 1/3 conferido.');
});
