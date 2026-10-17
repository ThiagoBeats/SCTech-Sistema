// O rolo era chamado de "Lote" na Gestao de Estoque; passou a ser "Codigo",
// e "Metragem do Rolo" virou "Metragem". Nos Pedidos a palavra "lote"
// continua, porque la ela quer dizer banho de cor, nao o nome do campo.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function semear(page, pagina) {
    await entrar(page, BASE);
    await page.goto(BASE + '/' + pagina);
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', '[]');
        localStorage.setItem('sc_cat', JSON.stringify([
            { id: 1, referencia: 'C-001', nome: 'TRICO HERA', preco: 167, preco_custo: 92, largura_rolo: 1.4, min_estoque: 10 }
        ]));
        localStorage.setItem('sc_est', JSON.stringify([
            { id: 2, tecido_id: 1, lote: 'BANHO-77', metragem_inicial: 30, metragem_atual: 25, data_entrada: '2026-10-05' }
        ]));
        localStorage.setItem('sc_mat', '[]');
        localStorage.setItem('sc_kits', '[]');
        localStorage.setItem('sc_mov', '[]');
    });
    await page.reload();
}

const rotulos = (page) => page.evaluate(() =>
    [...document.querySelectorAll('label, th')].map(el => el.textContent.replace(/[⇅▲▼]/g, '').trim()));

// --- O formulario de entrada ---------------------------------------------

test('o formulario pede Codigo e Metragem, nao Lote e Metragem do Rolo', async ({ page }) => {
    await semear(page, 'estoque.html');
    const l = await page.$$eval('#tab-tecidos label', ls => ls.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    expect(l.some(t => t.startsWith('Código')), 'o campo do rolo se chama Código').toBe(true);
    expect(l.some(t => t.startsWith('Lote')), 'Lote saiu').toBe(false);
    expect(l).toContain('Metragem (m)');
    expect(l.some(t => /Metragem do Rolo/.test(t))).toBe(false);
});

test('a dica "banho de cor" continua ao lado do campo', async ({ page }) => {
    await semear(page, 'estoque.html');
    const label = await page.locator('label', { hasText: 'Código' }).first().innerText();
    expect(label.replace(/\s+/g, ' '), 'sem ela, "Código" se confunde com o do tecido').toContain('banho de cor');
});

// --- As tabelas de rolos ---------------------------------------------------

test('a tabela de rolos do Estoque mostra Codigo', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.locator('.est-tec-linha').first().click();
    const th = await page.$$eval('.est-rolos-tabela thead th', ts => ts.map(t => t.textContent.trim()));
    expect(th[0]).toBe('Código');
    expect(th).not.toContain('Lote');
});

test('a tabela de rolos da Consulta de Estoque tambem', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('.tab-btn:has-text("Consulta")');
    await page.locator('.consulta-linha', { hasText: 'TRICO HERA' }).click();
    const th = await page.$$eval('.consulta-detalhe th', ts => ts.map(t => t.textContent.trim()));
    expect(th[0]).toBe('Código');
    expect(th).not.toContain('Lote');
});

test('a palavra Lote nao sobrou em rotulo nenhum da Gestao de Estoque', async ({ page }) => {
    await semear(page, 'estoque.html');
    for (const aba of ['Tecidos', 'Materiais', 'Kits', 'Consulta']) {
        await page.click(`.tab-btn:has-text("${aba}")`);
        const r = await rotulos(page);
        expect(r.filter(t => /^Lote/i.test(t)), 'aba ' + aba).toEqual([]);
    }
});

// --- Baixa e confirmacao ---------------------------------------------------

test('o formulario de baixa fala em rolo, nao em lote', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.locator('.est-tec-linha').first().click();
    await page.click('#tb-estoque button:has-text("Baixar")');
    const t = (await page.locator('.baixa-form-cell').innerText()).replace(/\s+/g, ' ');
    expect(t).toContain('Baixar rolo BANHO-77');
    expect(t, '"Baixar código X" não seria português').not.toMatch(/baixar lote/i);
});

test('a confirmacao da entrada diz Codigo e Metragem', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'TRICO');
    await page.locator('#est-tecido-sug .consulta-sug-item').first().click();
    await page.fill('#est-lote', 'L-55');
    await page.fill('#est-metros', '20');
    await page.click('button:has-text("Registrar Entrada")');

    const msg = (await page.locator('.sc-modal-msg').innerText()).replace(/\s+/g, ' ');
    expect(msg).toContain('Código: L-55');
    expect(msg).toContain('Metragem: 20 m');
    expect(msg).not.toMatch(/Lote:/);
});

test('o movimento gravado no historico usa Codigo', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'TRICO');
    await page.locator('#est-tecido-sug .consulta-sug-item').first().click();
    await page.fill('#est-lote', 'L-55');
    await page.fill('#est-metros', '20');
    await page.click('button:has-text("Registrar Entrada")');
    await page.click('#sc-modal-btns button:has-text("Confirmar Entrada")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.movimentos.length > 0);

    const m = await page.evaluate(() => db.movimentos[0].item_nome);
    expect(m).toContain('Código L-55');
    expect(m).not.toContain('Lote');
});

// --- Balanco de Estoque ----------------------------------------------------

test('o Balanco de Estoque mostra Codigo na coluna do rolo', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('button:has-text("Balanço de Estoque")');
    const th = await page.$$eval('.modal-overlay th', ts => ts.map(t => t.textContent.trim()));
    expect(th, 'a coluna do rolo').toContain('Código');
    expect(th).not.toContain('Lote');
    const ph = await page.getAttribute('#balanco-filter-ref', 'placeholder');
    expect(ph, 'o filtro nao pode mais falar em "lote"').not.toMatch(/lote/i);
});

// --- O que NAO muda --------------------------------------------------------

test('nos Pedidos, "lote" continua querendo dizer banho de cor', async ({ page }) => {
    await semear(page, 'estoque.html');
    // A palavra nao foi varrida do sistema: nos Pedidos ela nomeia o banho de
    // cor, e trocar por "codigo" ali diria outra coisa.
    const fonte = await page.evaluate(() => fetch('js/app.js').then(r => r.text()));
    expect(fonte, 'o aviso de tonalidade entre rolos').toContain('Múltiplos lotes');
    expect(fonte, 'e o trecho do contrato').toContain('lotes distintos');
    // mas nenhum cabecalho de tabela sobrou chamando o rolo de Lote
    expect(fonte).not.toContain('<th>Lote</th>');
});
