// Correcoes da revisao final do layout dos documentos.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function abrirEditor(page, extras) {
    await entrar(page, BASE, Object.assign({ sc_empresa: { razao_social: 'Lírio Cortinas' } }, extras || {}));
    await page.goto(BASE + '/empresa.html');
    const ed = page.locator('#dl-editor');
    await expect(ed.locator('#dl-previa .doc-layout')).toBeVisible();
    return ed;
}

test('previa legivel no tema escuro: celulas escuras e cabecalho da tabela na cor do documento', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'L' } });
    await page.evaluate(() => localStorage.setItem('sc_tema', 'dark'));
    await page.goto(BASE + '/empresa.html');
    const prev = page.locator('#dl-previa');
    await expect(prev.locator('.proposta-tabela td').first()).toBeVisible();
    expect(await prev.locator('.proposta-tabela td').first().evaluate(e => getComputedStyle(e).color)).toBe('rgb(36, 36, 36)');
    expect(await prev.locator('.proposta-tabela th').first().evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(0, 93, 59)');
    expect(await prev.locator('.proposta-cliente h3').evaluate(e => getComputedStyle(e).color)).toBe('rgb(143, 143, 143)');
});

test('previa do relatorio financeiro mostra o lugar dos graficos', async ({ page }) => {
    const ed = await abrirEditor(page);
    await ed.locator('#dl-doc').selectOption('financeiro');
    await expect(ed.locator('#dl-previa .doc-bloco-graficos')).toBeVisible();
    await ed.locator('.dl-bloco[data-bloco="graficos"] .dl-visivel').uncheck();
    await expect(ed.locator('#dl-previa .doc-bloco-graficos')).toHaveCount(0);
});

test('relatorio financeiro mostra nome e logo da empresa no cabecalho', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'Lírio LTDA', nome_fantasia: 'Lírio Cortinas', logo_base64: PNG } });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => gerarRelatorioFinanceiro());
    const cab = page.locator('#doc-modal-paper .fin-cab');
    await expect(cab.locator('h1')).toHaveText('Lírio Cortinas');
    await expect(cab.locator('img')).toHaveCount(1);
});

test('titulo de bloco apagado nao deixa barra vazia no documento', async ({ page }) => {
    const l = { blocos: [{ id: 'materiais', variante: 'padrao', visivel: true, titulo: '' }, { id: 'observacoes', variante: 'padrao', visivel: true, titulo: '  ' }] };
    const ped = { id: 26050, clienteId: 1, status: 'Orçamento', valor: 1, ambientes: [], itens: [{ nome: 'Trilho', quantidade: 1, unidade: 'un' }] };
    await entrar(page, BASE, { sc_ped: [ped], sc_cli: [{ id: 1, nome: 'Maria' }], sc_os_id: 26050, sc_doc_layouts: { versao: 1, docs: { os: l } } });
    await page.goto(BASE + '/os.html');
    await expect(page.locator('#os-container .os-header')).toBeVisible();
    const vazios = await page.locator('#os-container .os-section-title').evaluateAll(els =>
        els.filter(e => !e.textContent.trim() && getComputedStyle(e).display !== 'none').length);
    expect(vazios).toBe(0);
});

test('imprimir espera a fonte do documento carregar', async ({ page }) => {
    const ped = { id: 26050, clienteId: 1, status: 'Orçamento', valor: 1, ambientes: [] };
    await entrar(page, BASE, { sc_ped: [ped], sc_cli: [{ id: 1, nome: 'Maria' }] });
    await page.goto(BASE + '/pedidos.html');
    await page.evaluate(() => {
        window.__impressoes = 0;
        window.print = () => { window.__impressoes++; };
        let liberar;
        const pendente = new Promise(r => { liberar = r; });
        Object.defineProperty(document.fonts, 'ready', { configurable: true, get: () => pendente });
        window.__liberarFontes = () => liberar(document.fonts);
        abrirPropostaModal(26050);
    });
    await expect(page.locator('#doc-modal-paper .proposta-header')).toBeVisible();
    page.evaluate(() => imprimirDocModal());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__impressoes)).toBe(0);
    await page.evaluate(() => window.__liberarFontes());
    await expect.poll(() => page.evaluate(() => window.__impressoes)).toBe(1);
});
