const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MSG = 'Não foi possível carregar o gerador de códigos. Verifique a conexão com a internet e tente novamente.';

async function abrir(page) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, BASE);
    await page.evaluate(() => localStorage.removeItem('sc_etiqueta_cfg'));
    await page.goto(BASE + '/empresa.html');
    await expect(page.locator('#etq-editor')).toBeVisible();
}

async function modeloSalvo(page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('sc_etiqueta_cfg')).modelos.pedido);
}

test('abre com o modelo padrao', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#etq-palco .etq-el')).toHaveCount(7);
    await expect(page.locator('#etq-formato')).toHaveValue('100x50');
});

test('arrastar campo da paleta cria elemento e salvar persiste', async ({ page }) => {
    await abrir(page);
    const chip = page.locator('.etq-chip[data-campo="telefone"]');
    await chip.scrollIntoViewIfNeeded();
    const c = await chip.boundingBox();
    const p = await page.locator('#etq-palco').boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width / 2 + 10, c.y + c.height / 2 + 5, { steps: 3 });
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('#etq-palco .etq-el')).toHaveCount(8);
    await page.click('button:has-text("Salvar etiqueta")');
    const m = await modeloSalvo(page);
    const tel = m.elementos.find(e => e.campo === 'telefone');
    expect(tel).toBeTruthy();
    expect(Number.isInteger(tel.x_mm)).toBe(true);
    expect(Number.isInteger(tel.y_mm)).toBe(true);
});

test('trocar para 50x30 mantem tudo dentro', async ({ page }) => {
    await abrir(page);
    await page.selectOption('#etq-formato', '50x30');
    await page.click('button:has-text("Salvar etiqueta")');
    const m = await modeloSalvo(page);
    expect(m.largura_mm).toBe(50);
    expect(m.altura_mm).toBe(30);
    for (const e of m.elementos) {
        expect(e.x_mm).toBeGreaterThanOrEqual(0);
        expect(e.y_mm).toBeGreaterThanOrEqual(0);
        expect(e.x_mm + e.w_mm).toBeLessThanOrEqual(50);
        expect(e.y_mm + e.h_mm).toBeLessThanOrEqual(30);
    }
});

test('aviso de QR pequeno', async ({ page }) => {
    await abrir(page);
    const qrId = await page.evaluate(() => JSON.parse(JSON.stringify(EtiquetasCore.modeloPadraoPedido(100, 50)))
        .elementos.find(e => e.tipo === 'qrcode').id);
    await page.locator(`#etq-palco .etq-el[data-id="${qrId}"]`).click();
    await page.fill('#etq-prop-w', '10');
    await expect(page.locator('#etq-props')).toContainText('QR Code pequeno demais para o scanner');
});

test('sem internet o editor funciona e avisa', async ({ page }) => {
    await page.route('**/cdn.jsdelivr.net/**', r => r.abort());
    await abrir(page);
    await expect(page.locator('#emp-etiquetas-card')).toContainText(MSG, { timeout: 20000 });
    await expect(page.locator('#etq-palco .etq-el')).toHaveCount(7);
});

const modeloMemoria = page => page.evaluate(() => JSON.parse(JSON.stringify(_etq.modelo)));

test('somente visualizacao: sem arrastar, salvar, restaurar nem remover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, BASE, {
        sc_usr: [{
            id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, senha_hash: '',
            permissoes_extras: { 'configuracoes.empresa': { nivel: 'visualizar', acoes_restritas: [] } }
        }]
    });
    await page.evaluate(() => localStorage.removeItem('sc_etiqueta_cfg'));
    await page.goto(BASE + '/empresa.html');
    await expect(page.locator('#etq-editor')).toBeVisible();
    expect(await page.evaluate(() => temAcesso('configuracoes.empresa', 'completo'))).toBe(false);
    const els = page.locator('#etq-palco .etq-el');
    await expect(els).toHaveCount(7);
    await expect(page.locator('.etq-chip').first()).toBeDisabled();
    await expect(page.locator('#etq-editor button:has-text("Salvar etiqueta")')).toBeDisabled();
    await expect(page.locator('#etq-editor button:has-text("Restaurar padrão")')).toBeDisabled();
    await expect(page.locator('#etq-formato')).toBeDisabled();

    // Arrastar um chip para o palco nao cria nada.
    const chip = page.locator('.etq-chip[data-campo="telefone"]');
    await chip.scrollIntoViewIfNeeded();
    const c = await chip.boundingBox();
    const p = await page.locator('#etq-palco').boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(els).toHaveCount(7);

    // Selecionar e apertar Delete no palco nao remove; sem alca e sem botao Remover.
    await page.locator('#etq-palco .etq-el[data-id="e1"]').click();
    await expect(page.locator('#etq-prop-x')).toBeDisabled();
    await expect(page.locator('#etq-palco .etq-alca')).toHaveCount(0);
    await expect(page.locator('#etq-props button:has-text("Remover")')).toHaveCount(0);
    await page.keyboard.press('Delete');
    await page.keyboard.press('ArrowRight');
    await expect(els).toHaveCount(7);
    const m = await modeloMemoria(page);
    expect(m.elementos.find(e => e.id === 'e1').x_mm).toBe(3);
    expect(await page.evaluate(() => localStorage.getItem('sc_etiqueta_cfg'))).toBeNull();
});

test('teclado: nos campos de propriedade nao mexe no elemento; no palco move e remove', async ({ page }) => {
    await abrir(page);
    const els = page.locator('#etq-palco .etq-el');
    await page.locator('#etq-palco .etq-el[data-id="e1"]').click();
    const antes = (await modeloMemoria(page)).elementos.find(e => e.id === 'e1');

    // Foco no campo X: Delete, Backspace e setas sao do campo, nao do palco.
    // (Cima/baixo num campo numerico mudam o proprio valor de proposito; esquerda/direita so andam o cursor.)
    await page.focus('#etq-prop-x');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    await page.locator('#etq-prop-x').blur();
    await expect(els).toHaveCount(7);
    const depois = (await modeloMemoria(page)).elementos.find(e => e.id === 'e1');
    expect(depois.x_mm).toBe(antes.x_mm);
    expect(depois.y_mm).toBe(antes.y_mm);
    expect(depois.w_mm).toBe(antes.w_mm);
    expect(depois.h_mm).toBe(antes.h_mm);

    // Foco no palco: ArrowRight move +1 mm e Delete remove, com aviso.
    await page.locator('#etq-palco .etq-el[data-id="e1"]').click();
    const x0 = (await modeloMemoria(page)).elementos.find(e => e.id === 'e1').x_mm;
    await page.keyboard.press('ArrowRight');
    expect((await modeloMemoria(page)).elementos.find(e => e.id === 'e1').x_mm).toBe(x0 + 1);
    await page.keyboard.press('Delete');
    await expect(els).toHaveCount(6);
    await expect(page.locator('#sc-toast-wrap')).toContainText('Elemento removido. As alterações só valem depois de Salvar.');
    expect((await modeloMemoria(page)).elementos.some(e => e.id === 'e1')).toBe(false);
});

test('botao Remover tambem avisa', async ({ page }) => {
    await abrir(page);
    await page.locator('#etq-palco .etq-el[data-id="e2"]').click();
    await page.click('#etq-props button:has-text("Remover")');
    await expect(page.locator('#etq-palco .etq-el')).toHaveCount(6);
    await expect(page.locator('#sc-toast-wrap')).toContainText('Elemento removido. As alterações só valem depois de Salvar.');
});

const MSG_SEM_CODIGO = 'A etiqueta precisa ter pelo menos um código de barras ou QR Code.';

test('sem codigo de barras nem QR nao salva nem imprime teste', async ({ page }) => {
    await abrir(page);
    const ids = await page.evaluate(() => _etq.modelo.elementos.filter(e => e.tipo === 'barcode' || e.tipo === 'qrcode').map(e => e.id));
    expect(ids.length).toBe(2);
    for (const id of ids) {
        await page.locator(`#etq-palco .etq-el[data-id="${id}"]`).click();
        await page.click('#etq-props button:has-text("Remover")');
    }
    await page.click('button:has-text("Salvar etiqueta")');
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG_SEM_CODIGO);
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => localStorage.getItem('sc_etiqueta_cfg'))).toBeNull();
    await page.evaluate(() => { window._etqDispararImpressao = () => { window.__etqTeste = true; }; });
    await page.getByRole('button', { name: /Imprimir teste/ }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG_SEM_CODIGO);
    expect(await page.evaluate(() => window.__etqTeste)).toBeUndefined();
});

const MSG_AVISO_SALVAR = 'A etiqueta tem avisos de legibilidade. O scanner pode não ler o código. Salvar mesmo assim?';

test('avisos de legibilidade aparecem sem selecionar e pedem confirmacao ao salvar', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#etq-avisos-modelo')).toBeHidden();
    await page.selectOption('#etq-formato', '50x30');
    // o modelo padrao de 50x30 tem codigo de barras estreito e baixo demais
    await page.click('#etq-editor button:has-text("Restaurar padrão")');
    await page.click('#sc-modal-ok');
    const banner = page.locator('#etq-avisos-modelo');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('⚠ Código de barras:');
    expect(await page.evaluate(() => _etq.selId)).toBeNull();
    await page.click('button:has-text("Salvar etiqueta")');
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG_AVISO_SALVAR);
    await page.click('#sc-modal-cancel');
    expect(await page.evaluate(() => localStorage.getItem('sc_etiqueta_cfg'))).toBeNull();
    await page.click('button:has-text("Salvar etiqueta")');
    await page.click('#sc-modal-ok');
    expect((await modeloSalvo(page)).largura_mm).toBe(50);
});
