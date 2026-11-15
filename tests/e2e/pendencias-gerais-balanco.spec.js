// Balanco com nomes repetidos (um tecido e um material com o mesmo nome):
// a sugestao leva o tipo, o nome so puxa o codigo quando e' unico.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function semear(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/estoque.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', '[]');
        localStorage.setItem('sc_cat', JSON.stringify([
            { id: 1, referencia: 'T-100', nome: 'LINHO CRU', preco: 120, largura_rolo: 2.8 },
            { id: 2, referencia: 'T-200', nome: 'VOIL BRANCO', preco: 50, largura_rolo: 2.8 }
        ]));
        localStorage.setItem('sc_est', JSON.stringify([
            { id: 11, tecido_id: 1, lote: 'R-1', metragem_inicial: 30, metragem_atual: 25, data_entrada: '2026-10-05' },
            { id: 12, tecido_id: 2, lote: 'R-2', metragem_inicial: 40, metragem_atual: 40, data_entrada: '2026-10-05' }
        ]));
        localStorage.setItem('sc_mat', JSON.stringify([
            { id: 21, referencia: 'M-900', nome: 'LINHO CRU', unidade: 'm', estoque_atual: 12, preco: 30 },
            { id: 22, referencia: 'M-901', nome: 'SUPORTE', unidade: 'un', estoque_atual: 50, preco: 5 }
        ]));
        localStorage.setItem('sc_kits', '[]');
        localStorage.setItem('sc_mov', '[]');
    });
    await page.reload();
    await page.click('button:has-text("Balanço de Estoque")');
}

const codigos = (page, tbody) => page.$$eval(`#${tbody} tr[data-balanco-nome]`,
    trs => trs.filter(t => t.style.display !== 'none').map(t => t.querySelector('td').innerText.trim()));
const opcoes = page => page.$$eval('#balanco-lista-nome option', os => os.map(o => o.value));

test('nome unico continua puxando o codigo', async ({ page }) => {
    await semear(page);
    await page.fill('#balanco-filter-nome', 'voil branco');
    await expect(page.locator('#balanco-filter-ref')).toHaveValue('T-200');
    expect(await codigos(page, 'balanco-tbody-tecidos')).toEqual(['T-200']);
});

test('nome repetido: sugestoes com o tipo e nada de preencher o codigo', async ({ page }) => {
    await semear(page);
    const ops = await opcoes(page);
    expect(ops).toContain('LINHO CRU — Tecido');
    expect(ops).toContain('LINHO CRU — Material');
    expect(ops, 'nome unico fica sem tipo').toContain('SUPORTE');
    await page.fill('#balanco-filter-nome', 'LINHO CRU');
    await expect(page.locator('#balanco-filter-ref')).toHaveValue('');
    expect(await codigos(page, 'balanco-tbody-tecidos')).toEqual(['T-100']);
    expect(await codigos(page, 'balanco-tbody-mats')).toEqual(['M-900']);
});

test('escolher "X — Material" preenche o codigo do material e filtra so ele', async ({ page }) => {
    await semear(page);
    await page.fill('#balanco-filter-nome', 'LINHO CRU — Material');
    await expect(page.locator('#balanco-filter-ref')).toHaveValue('M-900');
    await expect(page.locator('#balanco-filter-nome')).toHaveValue('LINHO CRU');
    expect(await codigos(page, 'balanco-tbody-mats')).toEqual(['M-900']);
    expect(await codigos(page, 'balanco-tbody-tecidos')).toEqual([]);
});

test('escolher "X — Tecido" preenche o codigo do tecido e filtra so ele', async ({ page }) => {
    await semear(page);
    await page.fill('#balanco-filter-nome', 'LINHO CRU — Tecido');
    await expect(page.locator('#balanco-filter-ref')).toHaveValue('T-100');
    expect(await codigos(page, 'balanco-tbody-tecidos')).toEqual(['T-100']);
    expect(await codigos(page, 'balanco-tbody-mats')).toEqual([]);
});

test('digitar o codigo ainda puxa o nome', async ({ page }) => {
    await semear(page);
    await page.fill('#balanco-filter-ref', 'm-900');
    await expect(page.locator('#balanco-filter-nome')).toHaveValue('LINHO CRU');
    expect(await codigos(page, 'balanco-tbody-mats')).toEqual(['M-900']);
    expect(await codigos(page, 'balanco-tbody-tecidos')).toEqual([]);
});
