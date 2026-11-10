const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MSG = 'Não foi possível carregar o gerador de códigos. Verifique a conexão com a internet e tente novamente.';
const AMB = [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }];
const CLI = [{ id: 1, nome: 'Maria Souza', end: 'R. A, 1', tel: '1199' }];

const ped = (extra) => Object.assign({ id: 26001, clienteId: 1, clienteNome: 'Maria Souza', status: 'Na Costura', valor: 100, ambientes: AMB }, extra || {});
const lerPedido = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')).find(x => x.id === 26001));

async function abrir(page, pedidos, pagina) {
    await page.addInitScript(() => {
        window._etqDispararImpressao = f => {
            window.__etq = [...f.contentDocument.querySelectorAll('.etq')].map(e => e.innerText);
            window.__etqHtml = f.contentDocument.documentElement.outerHTML;
        };
    });
    await entrar(page, BASE, { sc_ped: pedidos, sc_cli: CLI });
    await page.goto(BASE + '/' + (pagina || 'pcp.html'));
}

test('imprime 3 volumes e salva a quantidade', async ({ page }) => {
    await abrir(page, [ped()]);
    await page.locator('button[title="Imprimir etiquetas"]').first().click();
    await page.fill('#etq-qtd-volumes', '3');
    await page.click('#etq-btn-imprimir');
    await page.waitForFunction(() => window.__etq && window.__etq.length === 3, null, { timeout: 15000 });
    const etq = await page.evaluate(() => window.__etq);
    expect(etq[1]).toContain('VOLUME 2/3');
    expect(etq[1]).toContain('PEDIDO #26001');
    // o codigo vem escrito embaixo das barras, para quem confere digitando
    expect(etq[1]).toContain('260010203');
    const html = await page.evaluate(() => window.__etqHtml);
    expect(html).toContain('size: 100mm 50mm');
    expect(html).toContain('<svg');
    expect((await lerPedido(page)).volumes).toBe(3);
});

test('reimprimir so um volume', async ({ page }) => {
    await abrir(page, [ped({ volumes: 3 })]);
    await page.locator('button[title="Imprimir etiquetas"]').first().click();
    await page.check('#etq-modo-um');
    await page.fill('#etq-so-volume', '2');
    await page.click('#etq-btn-imprimir');
    await page.waitForFunction(() => window.__etq && window.__etq.length === 1, null, { timeout: 15000 });
    expect((await page.evaluate(() => window.__etq))[0]).toContain('VOLUME 2/3');
});

test('mudar volumes com conferencia iniciada pede confirmacao e zera', async ({ page }) => {
    await abrir(page, [ped({ volumes: 3, conferencia: { volumes_conferidos: [1], concluida_em: null, conferido_por: 'Ana' } })]);
    await page.locator('button[title="Imprimir etiquetas"]').first().click();
    await page.fill('#etq-qtd-volumes', '4');
    await page.click('#etq-btn-imprimir');
    await page.locator('#sc-modal-btns #sc-modal-ok').waitFor({ timeout: 5000 });
    await page.locator('#sc-modal-btns #sc-modal-ok').click();
    await page.waitForFunction(() => window.__etq && window.__etq.length === 4, null, { timeout: 15000 });
    const p = await lerPedido(page);
    expect(p.conferencia.volumes_conferidos).toEqual([]);
    expect(p.volumes).toBe(4);
});

test('card mostra a marcacao de conferencia', async ({ page }) => {
    await abrir(page, [
        ped({ volumes: 3, conferencia: { volumes_conferidos: [1, 2, 3], concluida_em: 5, conferido_por: 'Ana' } }),
        ped({ id: 26002, volumes: 3, conferencia: { volumes_conferidos: [1, 2], concluida_em: null, conferido_por: 'Ana' } })
    ]);
    await expect(page.getByText('✓ Conferido').first()).toBeVisible();
    await expect(page.getByText('2/3 conferidos').first()).toBeVisible();
});

test('pedido em Orcamento nao tem botao de etiqueta', async ({ page }) => {
    await abrir(page, [ped({ status: 'Orçamento' }), ped({ id: 26002 })], 'pedidos.html');
    await expect(page.locator('tbody tr', { hasText: '26002' }).locator('button[title="Imprimir etiquetas"]')).toHaveCount(1);
    await expect(page.locator('tbody tr', { hasText: '26001' }).locator('button[title="Imprimir etiquetas"]')).toHaveCount(0);
});

test('sem internet nao imprime', async ({ page }) => {
    await page.route(/jsdelivr/, r => r.abort());
    const conf = { volumes_conferidos: [1], concluida_em: null, conferido_por: null };
    await abrir(page, [ped({ volumes: 3, conferencia: conf })]);
    await page.locator('button[title="Imprimir etiquetas"]').first().click();
    await page.fill('#etq-qtd-volumes', '5');
    await page.click('#etq-btn-imprimir');
    // sem gerador de codigos: avisa antes de perguntar sobre zerar a conferencia
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG, { timeout: 15000 });
    expect(await page.evaluate(() => window.__etq)).toBeUndefined();
    const p = await lerPedido(page);
    expect(p.volumes).toBe(3);
    expect(p.conferencia).toEqual(conf);
});

test('modelo sem codigo de barras nem QR nao imprime', async ({ page }) => {
    const modelo = { formato: '100x50', largura_mm: 100, altura_mm: 50, elementos: [
        { id: 'e1', tipo: 'campo', campo: 'numero', x_mm: 3, y_mm: 2, w_mm: 58, h_mm: 7, fonte_pt: 14 }
    ] };
    await page.addInitScript(m => localStorage.setItem('sc_etiqueta_cfg', JSON.stringify({ modelos: { pedido: m } })), modelo);
    await abrir(page, [ped({ volumes: 2 })]);
    await page.locator('button[title="Imprimir etiquetas"]').first().click();
    await page.click('#etq-btn-imprimir');
    await expect(page.locator('#sc-modal-msg')).toHaveText('A etiqueta precisa ter pelo menos um código de barras ou QR Code.', { timeout: 15000 });
    expect(await page.evaluate(() => window.__etq)).toBeUndefined();
});

test('imprimir teste no editor', async ({ page }) => {
    await abrir(page, [], 'empresa.html#etiquetas');
    await expect(page.locator('#etq-editor')).toBeVisible();
    await page.getByRole('button', { name: /Imprimir teste/ }).click();
    await page.waitForFunction(() => window.__etq && window.__etq.length === 1, null, { timeout: 15000 });
    expect((await page.evaluate(() => window.__etq))[0]).toContain('Maria Souza');
});
