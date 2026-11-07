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

test('Tab nao devolve o foco ao campo de leitura', async ({ page }) => {
    await abrir(page);
    await page.focus('#exp-encerrar');
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(id).not.toBe('exp-leitura');
    await page.focus('#exp-encerrar');
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement.id)).not.toBe('exp-leitura');
});

test('modal do app aberto nao perde o foco para o campo', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => { showConfirm('Teste?'); });
    await page.locator('#sc-modal-ok').waitFor();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement.id)).toMatch(/^sc-modal-/);
});

test('le dados atuais de outra aba e nao apaga o que ela gravou', async ({ page }) => {
    await abrir(page);
    // outra aba muda os volumes e cadastra um cliente direto no localStorage
    await page.evaluate(() => {
        const ped = JSON.parse(localStorage.getItem('sc_ped'));
        ped.find(p => p.id === 26001).volumes = 4;
        localStorage.setItem('sc_ped', JSON.stringify(ped));
        const cli = JSON.parse(localStorage.getItem('sc_cli'));
        cli.push({ id: 3, nome: 'Cliente Outra Aba', end: '', tel: '' });
        localStorage.setItem('sc_cli', JSON.stringify(cli));
    });
    await ler(page, '26001');
    await expect(page.locator('#exp-resultado')).toContainText('bipe os 4 volume(s)');
    await ler(page, '26001-1-4');
    await expect(page.locator('#exp-resultado')).toContainText('Volume 1/4 conferido.');
    const cli = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cli')));
    expect(cli.map(c => c.nome)).toContain('Cliente Outra Aba');
    const p = await lerPedido(page, 26001);
    expect(p.volumes).toBe(4);
    expect(p.conferencia.volumes_conferidos).toEqual([1]);
});

test('timeline mostra o rotulo como texto, sem interpretar HTML', async ({ page }) => {
    const ped = Object.assign({}, SEED.sc_ped[0], {
        timeline: [{ status: 'Conferência', data: 1700000000000, label: 'Conferido por <b>Zé</b>' }]
    });
    await entrar(page, BASE, { sc_ped: [ped], sc_cli: SEED.sc_cli });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => verTimeline(26001));
    const modal = page.locator('.modal-overlay', { hasText: 'Timeline' });
    await expect(modal).toContainText('Conferido por <b>Zé</b>');
    await expect(modal.locator('b', { hasText: 'Zé' })).toHaveCount(0);
});
