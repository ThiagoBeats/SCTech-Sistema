// Campo Banco com busca e logo, mascaras de agencia/conta por banco, cache de 30 dias da BrasilAPI e logo no Resumo.
// Relogio fixo: 24/11/2026. Sem rede real: BrasilAPI e CDN de logos simulados ou abortados.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 24, 10, 0, 0);
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#820AD1"/></svg>';
const CONTAS = [
    { id: 10, nome: 'Itau antigo', tipo: 'banco', ativo: true, saldo_inicial: 100, data_saldo_inicial: '2026-01-01', banco: '341', agencia: '1234', numero_conta: '12345-6', tipo_conta: 'corrente', conexao: 'manual', saldo_atualizado_em: null },
];
const API_NOVA = [{ ispb: '99999999', name: 'Banco Zeta Novo', code: 998, fullName: 'BANCO ZETA NOVO S.A.' }];

// logos: 'ok' serve um SVG; 'off' aborta (sem internet). api: 'off' | array JSON. Devolve o contador de chamadas a BrasilAPI.
async function abrir(page, { logos = 'ok', api = 'off', contas = CONTAS, extras = {}, largura, url = '/empresa.html#preferencias' } = {}) {
    if (largura) await page.setViewportSize({ width: largura, height: 800 });
    const n = { api: 0 };
    await page.context().route(/cdn\.jsdelivr\.net/, r => logos === 'ok' ? r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }) : r.abort());
    await page.context().route(/brasilapi\.com\.br/, r => { n.api++; return api === 'off' ? r.abort() : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(api) }); });
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_contas_fin: contas, sc_mov_fin: [], sc_cr: [], sc_cp: [], ...extras });
    await page.goto(BASE + url);
    if (url.startsWith('/empresa')) await expect(page.locator('#emp-contas .conta-linha').first()).toBeVisible();
    return n;
}
const linha = (page, k) => page.locator('#emp-contas .conta-linha').nth(k);
const salvar = page => page.getByRole('button', { name: /Salvar contas/ }).click();

test('digitar "nu" lista com logo, nome e codigo; setas + Enter escolhem; logo no campo; salvar grava 260 e reabrir mostra a logo', async ({ page }) => {
    await abrir(page);
    await page.getByRole('button', { name: /Adicionar conta|Nova conta/ }).click();
    const nova = linha(page, 1);
    await nova.locator('.conta-nome').fill('Roxinho');
    const campo = nova.locator('.conta-banco-sel');
    await campo.click();
    await campo.fill('nu');
    await expect(campo).toHaveAttribute('aria-expanded', 'true');
    const ops = nova.locator('[role=option]');
    await expect(ops.filter({ hasText: 'Nubank' }).locator('img')).toBeVisible();
    await expect(ops.filter({ hasText: 'Nubank' })).toContainText('260');
    const nomes = await ops.locator('.banco-combo-nome').allTextContents();
    const alvo = nomes.indexOf('Nubank');
    expect(alvo).toBeGreaterThan(0);
    for (let k = 0; k < alvo; k++) await campo.press('ArrowDown');
    await expect(campo).toHaveAttribute('aria-activedescendant', /bc-1-\d+/);
    await expect(ops.nth(alvo)).toHaveAttribute('aria-selected', 'true');
    await campo.press('Enter');
    await expect(campo).toHaveValue('Nubank');
    await expect(campo).toHaveAttribute('aria-expanded', 'false');
    await expect(nova.locator('.banco-combo-logo img')).toBeVisible();
    await salvar(page);
    await expect.poll(async () => (await ler(page, 'sc_contas_fin')).length).toBe(2);
    expect((await ler(page, 'sc_contas_fin')).find(c => c.nome === 'Roxinho')).toMatchObject({ banco: '260', banco_nome: 'Nubank' });
    await page.reload();
    await expect(linha(page, 1).locator('.conta-banco-sel')).toHaveValue('Nubank');
    await expect(linha(page, 1).locator('.banco-combo-logo img')).toBeVisible();
});

test('conta antiga com banco 341 mostra Itau com logo; sem escolher nada o valor antigo fica', async ({ page }) => {
    await abrir(page);
    const campo = linha(page, 0).locator('.conta-banco-sel');
    await expect(campo).toHaveValue('Itaú');
    await expect(linha(page, 0).locator('.banco-combo-logo img')).toBeVisible();
    await campo.click();
    await campo.fill('xyz');
    await expect(linha(page, 0).locator('.banco-combo-vazio')).toBeVisible();
    await campo.press('Escape');
    await expect(campo).toHaveValue('Itaú');
    await salvar(page);
    await expect.poll(async () => (await ler(page, 'sc_contas_fin'))[0].banco).toBe('341');
});

test('Esc fecha, clique fora fecha e volta ao banco escolhido; apagar o texto limpa o banco', async ({ page }) => {
    await abrir(page);
    const campo = linha(page, 0).locator('.conta-banco-sel');
    await campo.fill('ban');
    await expect(campo).toHaveAttribute('aria-expanded', 'true');
    await campo.press('Escape');
    await expect(linha(page, 0).locator('[role=listbox]')).toBeHidden();
    await expect(campo).toHaveValue('Itaú');
    await campo.fill('ban');
    await expect(campo).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#emp-contas .conta-nome').first().click();
    await expect(campo).toHaveAttribute('aria-expanded', 'false');
    await expect(campo).toHaveValue('Itaú');
    await campo.fill('');
    await expect(linha(page, 0).locator('.banco-combo-logo img')).toHaveCount(0);
    await salvar(page);
    await expect.poll(async () => (await ler(page, 'sc_contas_fin'))[0].banco).toBeNull();
});

test('instituicao sem codigo COMPE e sem logo mostra o selo e grava ispb:<ISPB>', async ({ page }) => {
    await abrir(page);
    const campo = linha(page, 0).locator('.conta-banco-sel');
    await campo.fill('Bacen');
    const op = linha(page, 0).locator('[role=option]').first();
    await expect(op).toContainText('Bacen');
    await expect(op.locator('img')).toHaveCount(0);
    await expect(op.locator('.banco-selo-mini')).toHaveText('B');
    await campo.press('Enter');
    await expect(linha(page, 0).locator('.banco-combo-logo .banco-selo-mini')).toHaveText('B');
    await salvar(page);
    await expect.poll(async () => (await ler(page, 'sc_contas_fin'))[0].banco).toBe('ispb:00038166');
    expect((await ler(page, 'sc_contas_fin'))[0].banco_nome).toBe('Bacen');
    await page.reload();
    await expect(linha(page, 0).locator('.conta-banco-sel')).toHaveValue('Bacen');
});

test('agencia e conta ganham a mascara do banco enquanto digita e sao refeitas ao trocar de banco', async ({ page }) => {
    await abrir(page);
    const l = linha(page, 0), campo = l.locator('.conta-banco-sel'), ag = l.locator('.conta-agencia'), cc = l.locator('.conta-numero');
    const escolher = async nome => { await campo.fill(nome); await campo.press('Enter'); };
    await escolher('Banco do Brasil');
    await ag.fill(''); await ag.pressSequentially('1234x');
    await expect(ag).toHaveValue('1234-X');
    await cc.fill(''); await cc.pressSequentially('123456789');
    await expect(cc).toHaveValue('12345678-9');
    await escolher('Itaú');
    await cc.fill(''); await cc.pressSequentially('123456');
    await expect(cc).toHaveValue('12345-6');
    await escolher('Caixa');
    await cc.fill(''); await cc.pressSequentially('0013000123456');
    await expect(cc).toHaveValue('0013 00012345-6');
    // trocar de banco reformata o que ja esta digitado (BB: 8 digitos + DV)
    await escolher('Banco do Brasil');
    await expect(cc).toHaveValue('00130001-23456');
    await expect(campo).toHaveAttribute('data-sem-maiuscula', '');
    await expect(ag).toHaveAttribute('data-sem-maiuscula', '');
    await expect(cc).toHaveAttribute('data-sem-maiuscula', '');
    await salvar(page);
    await expect.poll(async () => (await ler(page, 'sc_contas_fin'))[0].banco).toBe('001');
});

test('sem internet funciona com a base do arquivo e nao mostra erro nem grava cache', async ({ page }) => {
    const n = await abrir(page, { logos: 'off', api: 'off' });
    const campo = linha(page, 0).locator('.conta-banco-sel');
    await campo.fill('nubank');
    await expect(linha(page, 0).locator('[role=option]').first()).toContainText('Nubank');
    await expect.poll(() => n.api).toBeGreaterThan(0);
    expect(await ler(page, 'sc_bancos_cache')).toBeNull();
    await expect(page.locator('.toast, .modal-overlay')).toHaveCount(0);
});

test('BrasilAPI devolvendo instituicao nova: ela aparece na busca e o cache e gravado; cache recente nao busca de novo', async ({ page }) => {
    const n = await abrir(page, { api: API_NOVA });
    await expect.poll(async () => (await ler(page, 'sc_bancos_cache'))?.lista?.length).toBe(1);
    const cache = await ler(page, 'sc_bancos_cache');
    expect(cache.em).toBe(HOJE.getTime());
    await linha(page, 0).locator('.conta-banco-sel').fill('zeta novo');
    await expect(linha(page, 0).locator('[role=option]').first()).toContainText('Banco Zeta Novo');
    await expect(linha(page, 0).locator('[role=option]').first()).toContainText('998');
    expect(n.api).toBe(1);
    await page.reload();
    await expect(linha(page, 0).locator('.conta-banco-sel')).toBeVisible();
    await linha(page, 0).locator('.conta-banco-sel').fill('zeta novo');
    await expect(linha(page, 0).locator('[role=option]').first()).toContainText('Banco Zeta Novo');
    expect(n.api).toBe(1);
});

test('cache com mais de 30 dias e atualizado', async ({ page }) => {
    const velho = { em: HOJE.getTime() - 31 * 24 * 3600 * 1000, lista: [] };
    const n = await abrir(page, { api: API_NOVA, extras: { sc_bancos_cache: velho } });
    await expect.poll(async () => (await ler(page, 'sc_bancos_cache'))?.lista?.length).toBe(1);
    expect(n.api).toBe(1);
});

test('o campo Banco tem o tamanho do select antigo (+-2px)', async ({ page }) => {
    await abrir(page);
    const m = await page.evaluate(() => {
        const campo = document.querySelector('#emp-contas .conta-banco-sel');
        const grupo = campo.closest('.form-group');
        const sel = document.createElement('select');
        sel.innerHTML = '<option>Não informado</option>';
        grupo.appendChild(sel);
        const r = e => { const b = e.getBoundingClientRect(); return { w: b.width, h: b.height }; };
        const res = { campo: r(campo), sel: r(sel) };
        sel.remove();
        return res;
    });
    expect(Math.abs(m.campo.w - m.sel.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(m.campo.h - m.sel.h)).toBeLessThanOrEqual(2);
});

test('Resumo do Financeiro mostra a logo; conta sem banco mostra o selo', async ({ page }) => {
    const c2 = [{ ...CONTAS[0], id: 11, nome: 'Roxinho', banco: '260' }, { ...CONTAS[0], id: 12, nome: 'Sem banco', banco: null }];
    await abrir(page, { contas: c2, url: '/financeiro.html' });
    await page.locator('.fin-tab-btn[data-tab="resumo"]').click();
    await expect(page.locator('.res-conta', { hasText: 'Roxinho' }).locator('.res-selo img')).toBeVisible();
    await expect(page.locator('.res-conta', { hasText: 'Sem banco' }).locator('.res-selo')).toHaveText('SE');
});

test('Resumo sem internet: selo com a sigla do banco', async ({ page }) => {
    const c2 = [{ ...CONTAS[0], id: 11, nome: 'Roxinho', banco: '260' }];
    await abrir(page, { contas: c2, logos: 'off', url: '/financeiro.html' });
    await page.locator('.fin-tab-btn[data-tab="resumo"]').click();
    await expect(page.locator('.res-conta', { hasText: 'Roxinho' }).locator('.res-selo')).toHaveText('NU');
});

for (const [tema, largura] of [['dark', 1280], ['light', 390]]) {
    test(`tema ${tema}, largura ${largura}: lista visivel dentro da tela e sem rolagem horizontal`, async ({ page }) => {
        await abrir(page, { largura });
        await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);
        const campo = linha(page, 0).locator('.conta-banco-sel');
        await campo.fill('banco');
        const lista = linha(page, 0).locator('[role=listbox]');
        await expect(lista).toBeVisible();
        const b = await lista.boundingBox();
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(largura + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        const cor = await lista.evaluate(e => getComputedStyle(e).backgroundColor);
        if (tema === 'dark') expect(cor).toBe('rgb(29, 31, 35)'); else expect(cor).not.toBe('rgb(29, 31, 35)');
    });
}

test('codigo 000 e sempre "Outro"; as entradas B3 (mesmo codigo) sao guardadas como ispb:<ISPB>', async ({ page }) => {
    await abrir(page, { contas: [{ ...CONTAS[0], banco: '000' }] });
    const campo = linha(page, 0).locator('.conta-banco-sel');
    await expect(campo).toHaveValue('Outro');
    await campo.fill('Balcão B3');
    await campo.press('Enter');
    await expect(campo).toHaveValue('Balcão B3');
    await campo.fill('outro');
    await campo.press('Enter');
    await expect(campo).toHaveValue('Outro');
    await campo.fill('Câmbio B3');
    await campo.press('Enter');
    await salvar(page);
    await expect.poll(async () => (await ler(page, 'sc_contas_fin'))[0].banco).toBe('ispb:60934221');
    await page.reload();
    await expect(linha(page, 0).locator('.conta-banco-sel')).toHaveValue('Câmbio B3');
});

test('cache envenenado: codigo invalido e descartado, nada de HTML nem de logo do prototype', async ({ page }) => {
    const ruim = { em: HOJE.getTime(), lista: [
        { ispb: '11111111', codigo: '<img src=x onerror=window.__xss=1>', nome: 'Ruim Um', nomeCompleto: 'Ruim Um' },
        { ispb: '22222222', codigo: 'constructor', nome: 'Ruim Dois', nomeCompleto: 'Ruim Dois' },
        { ispb: '33333333', codigo: '997', nome: 'Bom Tres', nomeCompleto: 'Bom Tres' },
    ] };
    await abrir(page, { extras: { sc_bancos_cache: ruim } });
    const campo = linha(page, 0).locator('.conta-banco-sel');
    await campo.fill('Ruim');
    await expect(linha(page, 0).locator('.banco-combo-vazio')).toBeVisible();
    await campo.fill('Bom Tres');
    await expect(linha(page, 0).locator('[role=option]').first()).toContainText('997');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    // conta salva com codigo invalido nao vira logo nem quebra a tela
    expect(await page.evaluate(() => bancoInfo('constructor', 'X').logo)).toBeNull();
    expect(await page.evaluate(() => bancoInfo('ispb:11111111', 'X').logo)).toBeNull();
});

test('Tab com a lista aberta fecha sem escolher e volta ao nome do banco guardado', async ({ page }) => {
    await abrir(page);
    const campo = linha(page, 0).locator('.conta-banco-sel');
    await campo.fill('nubank');
    await expect(campo).toHaveAttribute('aria-expanded', 'true');
    await campo.press('Tab');
    await expect(campo).toHaveAttribute('aria-expanded', 'false');
    await expect(campo).toHaveValue('Itaú');
    await salvar(page);
    await expect.poll(async () => (await ler(page, 'sc_contas_fin'))[0].banco).toBe('341');
});

test('conta curta ja mostra o hifen do DV e Caixa usa operacao de 3 digitos com 12 no total', async ({ page }) => {
    await abrir(page);
    const l = linha(page, 0), campo = l.locator('.conta-banco-sel'), cc = l.locator('.conta-numero');
    await campo.fill('Banco do Brasil'); await campo.press('Enter');
    await cc.fill(''); await cc.pressSequentially('12345');
    await expect(cc).toHaveValue('1234-5');
    await campo.fill('Caixa'); await campo.press('Enter');
    await cc.fill(''); await cc.pressSequentially('001000123456');
    await expect(cc).toHaveValue('001 00012345-6');
});
