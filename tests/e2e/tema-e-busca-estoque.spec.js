// Tema claro/escuro so em Configuracoes > Preferencias (aplica ao escolher),
// Balanco de Estoque com Codigo antes do Nome (e preenchimento automatico
// entre os dois) e busca por codigo/descricao nas abas da Gestao de Estoque.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function semear(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/estoque.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', '[]');
        localStorage.setItem('sc_cat', JSON.stringify([
            { id: 1, referencia: 'C-001', nome: 'TRICO HERA', preco: 167, largura_rolo: 1.4 },
            { id: 2, referencia: 'C-002', nome: 'LINHO CRU', preco: 120, largura_rolo: 2.8 },
            { id: 3, referencia: 'C-INF', nome: 'VOIL LISO', preco: 50, largura_rolo: 2.8, estoque_infinito: true }
        ]));
        localStorage.setItem('sc_est', JSON.stringify([
            { id: 11, tecido_id: 1, lote: 'BANHO-77', metragem_inicial: 30, metragem_atual: 25, data_entrada: '2026-10-05' },
            { id: 12, tecido_id: 2, lote: 'R-9', metragem_inicial: 40, metragem_atual: 40, data_entrada: '2026-10-05' },
            { id: 13, tecido_id: 3, lote: 'ESTOQUE INFINITO', metragem_inicial: 999999, metragem_atual: 999999, data_entrada: '2026-10-05' }
        ]));
        localStorage.setItem('sc_mat', JSON.stringify([
            { id: 21, referencia: 'TR-01', nome: 'TRILHO SUISSO', unidade: 'm', estoque_atual: 12, preco: 30 },
            { id: 22, referencia: 'SUP-02', nome: 'SUPORTE DUPLO', unidade: 'un', estoque_atual: 50, preco: 5 }
        ]));
        localStorage.setItem('sc_kits', JSON.stringify([
            { id: 31, referencia: 'KIT-A', nome: 'KIT INSTALACAO', descricao: 'parafusos e buchas', itens: [] },
            { id: 32, referencia: 'KIT-B', nome: 'KIT TRILHO 2M', descricao: '', itens: [] }
        ]));
        localStorage.setItem('sc_mov', '[]');
    });
    await page.reload();
}

// --- Tema ------------------------------------------------------------------

test('o painel da logo nao tem mais o Tema', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.click('#main-sidebar .logo');
    await expect(page.locator('#logo-popup')).toBeVisible();
    await expect(page.locator('#logo-popup')).not.toContainText('Tema');
});

test('escolher Escuro/Claro em Preferencias aplica na hora e fica gravado', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html#preferencias');
    await page.check('input[name="pref-tema"][value="dark"]', { force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    let pref = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_usr'))[0].preferencias);
    expect(pref.tema, 'grava sem precisar clicar em Salvar').toBe('dark');
    await page.goto(BASE + '/estoque.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.goto(BASE + '/configuracoes.html#preferencias');
    await expect(page.locator('input[name="pref-tema"][value="dark"]')).toBeChecked();
    await page.check('input[name="pref-tema"][value="light"]', { force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    pref = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_usr'))[0].preferencias);
    expect(pref.tema).toBe('light');
});

// --- Balanco de Estoque ----------------------------------------------------

const linhasVisiveis = (page, tbody) => page.$$eval(`#${tbody} tr[data-balanco-nome]`,
    trs => trs.filter(t => t.style.display !== 'none').map(t => [...t.querySelectorAll('td')].slice(0, 2).map(td => td.innerText.trim())));

test('Balanco: Codigo vem antes do Nome, nos filtros e nas tabelas', async ({ page }) => {
    await semear(page);
    await page.click('button:has-text("Balanço de Estoque")');
    const rotulos = await page.$$eval('#balanco-overlay label', ls => ls.map(l => l.textContent.trim()));
    expect(rotulos.indexOf('Código')).toBeLessThan(rotulos.indexOf('Nome'));
    const ths = await page.$$eval('#balanco-overlay thead tr', trs => trs.map(tr => [...tr.querySelectorAll('th')].slice(0, 2).map(t => t.textContent.trim())));
    expect(ths).toEqual([['Código', 'Tecido'], ['Código', 'Material']]);
});

test('Balanco: a coluna Codigo mostra o codigo do item, nunca "ESTOQUE INFINITO"', async ({ page }) => {
    await semear(page);
    await page.click('button:has-text("Balanço de Estoque")');
    const tec = await linhasVisiveis(page, 'balanco-tbody-tecidos');
    expect(tec.map(l => l[0])).toEqual(['C-001', 'C-002']);
    expect(tec[0][1]).toContain('TRICO HERA');
    expect(tec[0][1], 'o codigo do rolo fica embaixo do nome').toContain('Rolo: BANHO-77');
    await expect(page.locator('#balanco-overlay')).not.toContainText('ESTOQUE INFINITO');
    const mat = await linhasVisiveis(page, 'balanco-tbody-mats');
    expect(mat).toEqual([['TR-01', 'TRILHO SUISSO'], ['SUP-02', 'SUPORTE DUPLO']]);
});

test('Balanco: digitar o codigo puxa o nome e filtra o item', async ({ page }) => {
    await semear(page);
    await page.click('button:has-text("Balanço de Estoque")');
    await page.fill('#balanco-filter-ref', 'tr-01');
    await expect(page.locator('#balanco-filter-nome')).toHaveValue('TRILHO SUISSO');
    expect(await linhasVisiveis(page, 'balanco-tbody-mats')).toEqual([['TR-01', 'TRILHO SUISSO']]);
    expect(await linhasVisiveis(page, 'balanco-tbody-tecidos')).toEqual([]);
    // apagou o codigo: o nome que veio sozinho sai junto e a lista volta
    await page.fill('#balanco-filter-ref', '');
    await expect(page.locator('#balanco-filter-nome')).toHaveValue('');
    expect((await linhasVisiveis(page, 'balanco-tbody-mats')).length).toBe(2);
});

test('Balanco: digitar o nome puxa o codigo; nome parcial so filtra', async ({ page }) => {
    await semear(page);
    await page.click('button:has-text("Balanço de Estoque")');
    await page.fill('#balanco-filter-nome', 'linho');
    await expect(page.locator('#balanco-filter-ref')).toHaveValue('');
    expect(await linhasVisiveis(page, 'balanco-tbody-tecidos')).toEqual([['C-002', expect.stringContaining('LINHO CRU')]]);
    await page.fill('#balanco-filter-nome', 'Trico Hera');
    await expect(page.locator('#balanco-filter-ref')).toHaveValue('C-001');
    const tec = await linhasVisiveis(page, 'balanco-tbody-tecidos');
    expect(tec.map(l => l[0])).toEqual(['C-001']);
});

test('Balanco: o codigo do rolo ainda acha o rolo', async ({ page }) => {
    await semear(page);
    await page.click('button:has-text("Balanço de Estoque")');
    await page.fill('#balanco-filter-ref', 'banho');
    expect((await linhasVisiveis(page, 'balanco-tbody-tecidos')).map(l => l[0])).toEqual(['C-001']);
});

// --- Busca na Gestao de Estoque ---------------------------------------------

test('Tecidos: busca por codigo e por descricao, entre o registro e a lista', async ({ page }) => {
    await semear(page);
    const busca = page.locator('#busca-est-tecidos');
    await expect(busca).toBeVisible();
    // fica depois do formulario de registro e antes da tabela
    const ordem = await page.evaluate(() => {
        const b = document.getElementById('busca-est-tecidos');
        const pos = (a, c) => a.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING;
        return { depoisDoRegistro: !!pos(document.getElementById('est-data'), b), antesDaTabela: !!pos(b, document.getElementById('tabela-est-tecidos')) };
    });
    expect(ordem).toEqual({ depoisDoRegistro: true, antesDaTabela: true });
    await busca.fill('c-002');
    await expect(page.locator('#tb-estoque .est-tec-linha')).toHaveCount(1);
    await expect(page.locator('#tb-estoque')).toContainText('LINHO CRU');
    await busca.fill('hera');
    await expect(page.locator('#tb-estoque .est-tec-linha')).toHaveCount(1);
    await expect(page.locator('#tb-estoque')).toContainText('TRICO HERA');
    await busca.fill('nada-disso');
    await expect(page.locator('#tb-estoque')).toContainText('Nenhum item encontrado');
    await busca.fill('');
    await expect(page.locator('#tb-estoque .est-tec-linha')).toHaveCount(3);
});

test('Materiais: busca por codigo e por descricao', async ({ page }) => {
    await semear(page);
    await page.click('.tab-btn[data-tab="materiais"]');
    const busca = page.locator('#busca-est-materiais');
    await busca.fill('sup-02');
    await expect(page.locator('#tb-estoque-mat')).toContainText('SUPORTE DUPLO');
    await expect(page.locator('#tb-estoque-mat')).not.toContainText('TRILHO SUISSO');
    await busca.fill('trilho');
    await expect(page.locator('#tb-estoque-mat')).toContainText('TRILHO SUISSO');
    await expect(page.locator('#tb-estoque-mat')).not.toContainText('SUPORTE DUPLO');
});

test('Kits: busca por codigo, nome e descricao', async ({ page }) => {
    await semear(page);
    await page.click('.tab-btn[data-tab="kits"]');
    const busca = page.locator('#busca-est-kits');
    await busca.fill('kit-b');
    await expect(page.locator('#tb-kits')).toContainText('KIT TRILHO 2M');
    await expect(page.locator('#tb-kits')).not.toContainText('KIT INSTALACAO');
    await busca.fill('buchas');
    await expect(page.locator('#tb-kits')).toContainText('KIT INSTALACAO');
    await expect(page.locator('#tb-kits')).not.toContainText('KIT TRILHO 2M');
});
