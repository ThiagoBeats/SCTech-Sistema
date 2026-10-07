const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

async function ateOPasso3(page, aba) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify([]));
        localStorage.removeItem('sc_imp_perfis');
        localStorage.removeItem('sc_imp_snap');
    });
    await page.reload();
    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(nome => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas[nome] = 'tecido';
        _impRenderPasso(2);
    }, aba);
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('.imp-mapa-scroll')).toBeVisible();
}

test('a previa mostra TODAS as linhas da aba, nao so 3', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await ateOPasso3(page, 'Book 10');

    const linhas = await page.locator('.imp-mapa-tabela tbody tr').count();
    expect(linhas, 'Book 10 tem dezenas de linhas, nao 3').toBeGreaterThan(30);

    // o rodape diz quantas linhas sao e quantos itens dao
    const legenda = await page.locator('#imp-corpo p', { hasText: 'linha(s) de' }).first().innerText();
    expect(legenda).toContain('Book 10');
    expect(legenda).toContain('38 item');

    expect(erros, erros.join('\n')).toEqual([]);
});

test('a rolagem acontece dentro da area, com o cabecalho fixo', async ({ page }) => {
    await ateOPasso3(page, 'Book 10');

    const area = page.locator('.imp-mapa-scroll').first();
    const m = await area.evaluate(el => ({
        rolavel: el.scrollHeight > el.clientHeight,
        overflow: getComputedStyle(el).overflow,
        altura: el.clientHeight
    }));
    expect(m.rolavel, 'a area deveria ter rolagem interna').toBe(true);
    expect(m.overflow).toContain('auto');
    expect(m.altura, 'a area deveria ser alta').toBeGreaterThan(170);

    // o cabecalho com os seletores fica grudado no topo
    const sticky = await page.locator('.imp-mapa-tabela thead th').first()
        .evaluate(el => getComputedStyle(el).position);
    expect(sticky).toBe('sticky');

    // rolar a area nao move a janela
    const janelaAntes = await page.evaluate(() => window.scrollY);
    await area.evaluate(el => { el.scrollTop = 200; });
    const r = await area.evaluate(el => el.scrollTop);
    expect(r).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(janelaAntes);

    // e o seletor continua visivel depois de rolar
    await expect(page.locator('.imp-mapa-tabela thead select').first()).toBeVisible();
});

test('o seletor do cabecalho vale para a coluna inteira', async ({ page }) => {
    await ateOPasso3(page, 'Book 10');

    // nao existe seletor nenhum nas linhas de dados
    expect(await page.locator('.imp-mapa-tabela tbody select').count(),
        'o mapeamento e por coluna; nao pode haver seletor por linha').toBe(0);

    const seletores = page.locator('.imp-mapa-tabela thead select');
    expect(await seletores.count()).toBeGreaterThan(4);

    // uma escolha no cabecalho muda o mapa inteiro
    const antes = await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]).preco);
    expect(antes).toBe(4);                      // CORTE
    await seletores.nth(5).selectOption('preco');   // move para PEÇA
    const depois = await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]).preco);
    expect(depois).toBe(5);
});

test('Preço por peça aparece no seletor e vira a fonte do custo', async ({ page }) => {
    await ateOPasso3(page, 'Book 10');

    const opcoes = await page.locator('.imp-mapa-tabela thead select').first()
        .locator('option').allInnerTexts();
    expect(opcoes).toContain('Preço por peça');
    expect(opcoes).toContain('Preço');

    // marca a coluna PEÇA (indice 5) como preco por peca
    await page.locator('.imp-mapa-tabela thead select').nth(5).selectOption('preco_peca');

    const mapa = await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]));
    expect(mapa.preco_peca).toBe(5);
    expect(mapa.preco, 'escolher peça deveria liberar a coluna de preço').toBe(-1);

    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const r = await page.evaluate(() => {
        const e = _impEstado.grupos.novos.find(x => x.item.codigo === '10001');
        return { custo: e.item.preco_custo, avisos: e.item.avisos };
    });
    expect(r.custo, 'o custo deveria vir da coluna PEÇA').toBe(79.47);
    expect(r.avisos.some(a => /peça/i.test(a))).toBe(true);
});

test('escolher Preço de volta libera a coluna de peça', async ({ page }) => {
    await ateOPasso3(page, 'Book 10');
    await page.locator('.imp-mapa-tabela thead select').nth(5).selectOption('preco_peca');
    expect(await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]).preco)).toBe(-1);

    await page.locator('.imp-mapa-tabela thead select').nth(4).selectOption('preco');
    const mapa = await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]));
    expect(mapa.preco).toBe(4);
    expect(mapa.preco_peca, 'so uma das duas vale por vez').toBe(-1);
});

test('o numero da linha da planilha aparece e ajuda a se localizar', async ({ page }) => {
    await ateOPasso3(page, 'Book 10');
    const primeira = await page.locator('.imp-mapa-tabela tbody tr td.imp-col-linha').first().innerText();
    expect(Number(primeira), 'a primeira linha de dado vem logo apos o cabecalho').toBe(3);
});
