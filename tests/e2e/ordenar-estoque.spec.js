// Ordenacao por coluna nas tres tabelas do Estoque, como ja existia no
// Cadastro/Catalogo. A escolha e guardada, porque Estoque e Catalogo sao
// paginas separadas: sem isso, ordenar numa nao chegaria na outra.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function semear(page, pagina) {
    await entrar(page, BASE);
    await page.goto(BASE + '/' + pagina);
    await page.evaluate(() => {
        localStorage.removeItem('sc_ordenacao');
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }, { id: 8, nome: 'Alfa' }]));
        localStorage.setItem('sc_cat', JSON.stringify([
            { id: 1, referencia: 'C-003', nome: 'ZEBRA', preco: 50,  largura_rolo: 1.4, min_estoque: 30, fornecedor_nome: 'RC Tecidos' },
            { id: 2, referencia: 'C-001', nome: 'ABACO', preco: 170, largura_rolo: 2.8, min_estoque: 10, fornecedor_nome: 'Alfa' },
            { id: 3, referencia: 'C-002', nome: 'MEIO',  preco: 90,  largura_rolo: 3.0, min_estoque: 20, fornecedor_nome: 'RC Tecidos' }
        ]));
        localStorage.setItem('sc_mat', JSON.stringify([
            { id: 11, referencia: 'M-02', nome: 'ZINCO',  unidade: 'pct', preco: 9,  estoque_atual: 80, min_estoque: 0, fornecedor_nome: 'Alfa' },
            { id: 12, referencia: 'M-01', nome: 'ARGOLA', unidade: 'un',  preco: 48, estoque_atual: 5,  min_estoque: 0, fornecedor_nome: 'RC Tecidos' }
        ]));
        localStorage.setItem('sc_kits', JSON.stringify([
            { id: 21, tipo: 'pronto', referencia: 'K-02', nome: 'ZETA',     medida: '2 m', preco: 300, estoque_atual: 4, itens: [] },
            { id: 22, tipo: 'pronto', referencia: 'K-01', nome: 'ALFA KIT', medida: '1 m', preco: 100, estoque_atual: 9, itens: [] }
        ]));
        localStorage.setItem('sc_est', JSON.stringify([
            { id: 31, tecido_id: 1, lote: 'L1', metragem_inicial: 10, metragem_atual: 7,  data_entrada: '2026-10-01' },
            { id: 32, tecido_id: 2, lote: 'L2', metragem_inicial: 40, metragem_atual: 40, data_entrada: '2026-10-01' },
            { id: 33, tecido_id: 2, lote: 'L3', metragem_inicial: 5,  metragem_atual: 5,  data_entrada: '2026-10-02' }
        ]));
        localStorage.setItem('sc_mov', '[]');
    });
    await page.reload();
}

const textos = (page, sel) => page.$$eval(sel, ts => ts.map(t => t.textContent.trim().split(' ')[0]));

// --- Toda coluna com valor tem botao ---------------------------------------

test('as tres tabelas do Estoque tem cabecalho clicavel em cada coluna', async ({ page }) => {
    await semear(page, 'estoque.html');
    const cols = (sel) => page.$$eval(sel + ' thead th', ths => ths.map(t => t.dataset.col || ''));

    expect(await cols('#tabela-est-tecidos')).toEqual(
        ['referencia', 'nome', 'unidade', 'largura', 'estoque', 'minimo', 'preco', 'fornecedor', 'rolos']);

    await page.click('.tab-btn:has-text("Materiais")');
    expect(await cols('#tabela-est-materiais')).toEqual(
        ['referencia', 'nome', 'unidade', 'estoque', 'preco', 'fornecedor', '']); // Acoes so tem botoes

    await page.click('.tab-btn:has-text("Kits")');
    expect(await cols('#tabela-kits')).toEqual(
        ['referencia', 'nome', 'unidade', 'medida', 'preco', 'estoque', 'composicao', '']);
});

test('todo cabecalho clicavel mostra o icone de ordenacao', async ({ page }) => {
    await semear(page, 'estoque.html');
    const th = page.locator('#tabela-est-tecidos thead th[data-col]');
    expect(await th.count()).toBe(9);
    expect(await page.locator('#tabela-est-tecidos thead th[data-col] .sort-icon').count()).toBe(9);
});

// --- Tecidos ---------------------------------------------------------------

test('tecidos ordenam por preco, e o segundo clique inverte', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('#tabela-est-tecidos th[data-col="preco"]');
    expect(await textos(page, '.est-tec-linha .col-nome')).toEqual(['ZEBRA', 'MEIO', 'ABACO']);
    await page.click('#tabela-est-tecidos th[data-col="preco"]');
    expect(await textos(page, '.est-tec-linha .col-nome')).toEqual(['ABACO', 'MEIO', 'ZEBRA']);
});

test('tecidos ordenam pela quantidade de rolos', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('#tabela-est-tecidos th[data-col="rolos"]');
    // MEIO nao tem rolo, ZEBRA tem 1, ABACO tem 2
    expect(await textos(page, '.est-tec-linha .col-nome')).toEqual(['MEIO', 'ZEBRA', 'ABACO']);
});

test('so a coluna ativa fica marcada, com a seta do sentido', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('#tabela-est-tecidos th[data-col="preco"]');
    const icones = await page.$$eval('#tabela-est-tecidos .sort-icon', i => i.map(x => x.textContent));
    expect(icones.filter(i => i === '▲').length).toBe(1);
    expect(icones.filter(i => i === '⇅').length).toBe(8);
    expect(await page.locator('#tabela-est-tecidos th[data-col="preco"].th-sort-mat-ativo').count()).toBe(1);

    await page.click('#tabela-est-tecidos th[data-col="preco"]');
    expect(await page.locator('#tabela-est-tecidos th[data-col="preco"] .sort-icon').innerText()).toBe('▼');
});

test('os rolos abertos continuam colados no seu tecido depois de ordenar', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.locator('.est-tec-linha', { hasText: 'ABACO' }).click();
    await page.click('#tabela-est-tecidos th[data-col="preco"]');

    const linhas = await page.$$eval('#tb-estoque > tr', ts => ts.map(t => ({
        cls: t.className, txt: t.textContent.replace(/\s+/g, ' ').trim().slice(0, 20)
    })));
    const iAberta = linhas.findIndex(l => l.cls.includes('aberta'));
    expect(iAberta, 'o tecido aberto continua na lista').toBeGreaterThan(-1);
    expect(linhas[iAberta].txt).toContain('ABACO');
    expect(linhas[iAberta + 1].cls, 'os rolos vem logo abaixo dele').toContain('est-tec-rolos');
});

// --- Materiais e kits ------------------------------------------------------

test('materiais ordenam por estoque e por codigo', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('.tab-btn:has-text("Materiais")');
    await page.click('#tabela-est-materiais th[data-col="estoque"]');
    expect(await textos(page, '#tb-estoque-mat .col-nome')).toEqual(['ARGOLA', 'ZINCO']);
    await page.click('#tabela-est-materiais th[data-col="referencia"]');
    expect(await textos(page, '#tb-estoque-mat .col-codigo')).toEqual(['M-01', 'M-02']);
});

test('kits ordenam por preco e por codigo', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('.tab-btn:has-text("Kits")');
    await page.click('#tabela-kits th[data-col="preco"]');
    expect(await textos(page, '#tb-kits tr > td:nth-child(2)')).toEqual(['ALFA', 'ZETA']);
    await page.click('#tabela-kits th[data-col="referencia"]');
    expect(await textos(page, '#tb-kits .col-codigo')).toEqual(['K-01', 'K-02']);
});

// --- A escolha vale nas duas telas -----------------------------------------

test('ordenar no Estoque tambem ordena no Catalogo', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('#tabela-est-tecidos th[data-col="preco"]');

    await page.goto(BASE + '/catalogo.html');
    expect(await textos(page, '#tb-catalogo .col-nome')).toEqual(['ZEBRA', 'MEIO', 'ABACO']);
    expect(await page.locator('#tabela-tecidos th[data-col="preco"] .sort-icon').innerText()).toBe('▲');
});

test('ordenar no Catalogo tambem ordena no Estoque', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.click('#tabela-tecidos th[data-col="largura"]');

    await page.goto(BASE + '/estoque.html');
    expect(await textos(page, '.est-tec-linha .col-nome')).toEqual(['ZEBRA', 'ABACO', 'MEIO']);
});

test('uma preferencia corrompida nao derruba a tela', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await semear(page, 'estoque.html');
    await page.evaluate(() => localStorage.setItem('sc_ordenacao', '{isto nao e json'));
    await page.reload();
    expect(await page.locator('.est-tec-linha').count()).toBe(3);
    expect(erros, erros.join('\n')).toEqual([]);
});

// --- O cabecalho continua legivel ------------------------------------------

test('o cabecalho da unidade nao invade a coluna vizinha', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.setViewportSize({ width: 1400, height: 950 });
    const un = await page.$eval('#tabela-est-tecidos th[data-col="unidade"]',
        t => ({ cabe: t.scrollWidth <= t.clientWidth, txt: t.textContent.trim() }));
    expect(un.txt).toContain('Unidade');
    expect(un.cabe, 'com o icone ao lado, "Unidade" precisa caber na coluna').toBe(true);
});

test('cabecalho estreito guarda o nome inteiro no title', async ({ page }) => {
    await semear(page, 'estoque.html');
    expect(await page.getAttribute('#tabela-est-tecidos th[data-col="minimo"]', 'title')).toBe('Estoque mínimo');
});
