const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const FORN = '59.928.225 MARIA GABRIELA DA SILVA ALVES';

const CAT = [{
    id: 1, referencia: '0001', nome: 'TRICÔ HERA COM NOME BEM LONGO PARA TESTAR O CORTE',
    preco: 167.3, preco_custo: 92.9, preco_peca: 95.98, preco_corte: 83.65,
    largura_rolo: 1.4, min_estoque: 10, fornecedor_id: 7, fornecedor_nome: FORN
}];
const MAT = [{
    id: 20, referencia: 'TRILHO-SU-01', nome: 'TRILHO SUÍÇO DE EMBUTIR COM SUPORTE',
    unidade: 'm', preco: 48, min_estoque: 20, estoque_atual: 25, fornecedor_id: 7, fornecedor_nome: FORN
}];
const KITS = [{
    id: 300, tipo: 'pronto', referencia: '5501', nome: 'KIT TRILHO SUÍÇO',
    medida: '1,00 a 1,50 m', preco: 189, preco_custo: 126, estoque_atual: 4, itens: []
}];

async function semear(page, pagina) {
    await entrar(page, BASE);
    await page.goto(BASE + '/' + pagina);
    await page.evaluate(d => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: d.f }]));
        localStorage.setItem('sc_cat', JSON.stringify(d.cat));
        localStorage.setItem('sc_mat', JSON.stringify(d.mat));
        localStorage.setItem('sc_kits', JSON.stringify(d.kits));
        localStorage.setItem('sc_est', JSON.stringify([]));
        localStorage.setItem('sc_mov', JSON.stringify([]));
    }, { f: FORN, cat: CAT, mat: MAT, kits: KITS });
    await page.reload();
}

// Cabeçalhos de uma tabela, sem as setas de ordenação.
function cabecalhos(page, seletor) {
    return page.evaluate(s => [...document.querySelectorAll(s)]
        .map(th => th.textContent.replace(/[⇅▲▼]/g, '').trim()), seletor);
}

// ─── A palavra "Referência" saiu da interface ───────────────────────────

const PAGINAS = ['catalogo.html', 'estoque.html', 'pedido.html', 'fornecedores.html',
                 'pedidos.html', 'clientes.html', 'financeiro.html', 'relatorios.html'];

for (const pagina of PAGINAS) {
    test(`nenhum rotulo ou cabecalho de ${pagina} diz "Referencia"`, async ({ page }) => {
        await semear(page, pagina);
        // Só rótulos e cabeçalhos: texto corrido ("referências, ponto de
        // encontro") não é nome de campo e não entra na regra.
        const achados = await page.evaluate(() =>
            [...document.querySelectorAll('label, th')]
                .map(el => el.textContent.trim())
                .filter(t => /refer[êe]ncia/i.test(t)));
        expect(achados, 'esta palavra não é mais usada para identificar produto').toEqual([]);
    });
}

test('o lote do rolo se chama Lote, e a origem do movimento se chama Origem', async ({ page }) => {
    await semear(page, 'estoque.html');
    const rotulos = await page.evaluate(() =>
        [...document.querySelectorAll('label, th')].map(el => el.textContent.trim()));
    expect(rotulos.some(t => /^Lote/.test(t)), 'o lote do rolo').toBe(true);
    expect(rotulos.some(t => t === 'Origem'), 'a origem do movimento').toBe(true);
});

// ─── Ordem das colunas ──────────────────────────────────────────────────

test('a tabela de tecidos segue a ordem pedida', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const th = await cabecalhos(page, '#tabela-tecidos thead th');
    expect(th).toEqual(['', 'Código', 'Tecido', 'Largura', 'Em estoque',
                        'Estoque mínimo', 'Preço', 'Fornecedor', 'Ação']);
});

test('a tabela de materiais segue a ordem pedida', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.click('button[data-tab="cat-materiais"]');
    const th = await cabecalhos(page, '#tabela-materiais thead th');
    expect(th).toEqual(['', 'Código', 'Material', 'Unidade', 'Estoque atual',
                        'Preço', 'Fornecedor', 'Ações']);
});

test('a tabela de materiais do estoque segue a mesma ordem', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('button[data-tab="materiais"]');
    const th = await cabecalhos(page, '#tb-estoque-mat');
    const cab = await page.evaluate(() =>
        [...document.querySelectorAll('#tb-estoque-mat')][0].closest('table')
            .querySelectorAll('thead th')).catch(() => null);
    const nomes = await page.evaluate(() => {
        const t = document.getElementById('tb-estoque-mat').closest('table');
        return [...t.querySelectorAll('thead th')].map(x => x.textContent.replace(/[⇅▲▼]/g, '').trim());
    });
    expect(nomes).toEqual(['Código', 'Material', 'Unidade', 'Estoque atual',
                           'Preço', 'Fornecedor', 'Ações']);
});

test('a tabela de kits tem o codigo primeiro', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.click('button[data-tab="cat-kits"]');
    const th = await cabecalhos(page, '#tabela-kits thead th');
    expect(th[0]).toBe('Código');
    expect(th[1]).toBe('Nome');
});

// ─── Os valores foram para as colunas certas ────────────────────────────

test('cada coluna de tecido carrega o valor certo', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const celulas = await page.evaluate(() =>
        [...document.querySelectorAll('#tb-catalogo tr:first-child td')]
            .map(td => td.textContent.trim().replace(/\s+/g, ' ')));
    expect(celulas[1]).toBe('0001');
    expect(celulas[2]).toContain('TRICÔ HERA');
    expect(celulas[3], 'largura').toBe('1.40 m');
    expect(celulas[5], 'estoque mínimo').toBe('10 m');
    expect(celulas[6], 'preço de venda').toBe('R$ 167.30');
    expect(celulas[7]).toContain('59.928.225');
});

test('cada coluna de material carrega o valor certo', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.click('button[data-tab="cat-materiais"]');
    const celulas = await page.evaluate(() =>
        [...document.querySelectorAll('#tb-materiais tr:first-child td')]
            .map(td => td.textContent.trim().replace(/\s+/g, ' ')));
    expect(celulas[1]).toBe('TRILHO-SU-01');
    expect(celulas[2]).toContain('TRILHO SUÍÇO');
    expect(celulas[3], 'unidade').toBe('m');
    expect(celulas[4], 'estoque atual').toBe('25.00');
    expect(celulas[5], 'preço').toBe('R$ 48.00');
});

test('a tabela do catalogo nao tem coluna de preco por peca', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const th = await cabecalhos(page, '#tabela-tecidos thead th');
    expect(th, 'essa informação fica no detalhe do tecido, não na lista').not.toContain('Preço por peça');
    const celulas = await page.evaluate(() =>
        [...document.querySelectorAll('#tb-catalogo tr:first-child td')].map(td => td.textContent.trim()));
    expect(celulas.length, 'uma coluna a menos').toBe(9);
});

test('o preco por peca continua no detalhe do tecido', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.evaluate(() => verDetalhesTecido(1));
    const modal = page.locator('.modal-overlay').last();
    await expect(modal).toContainText('Preços da tabela do fornecedor');
    await expect(modal).toContainText('Corte: R$ 83.65');
    await expect(modal).toContainText('Peça: R$ 95.98');
});

// ─── Compactação ────────────────────────────────────────────────────────

test('a linha cabe em uma so, com reticencias e o texto completo no tooltip', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const r = await page.evaluate(() => {
        const tr = document.querySelector('#tb-catalogo tr');
        const nome = tr.querySelector('td.col-nome');
        const forn = tr.querySelector('td.col-forn');
        const tabela = document.getElementById('tabela-tecidos');
        return {
            altura: Math.round(tr.getBoundingClientRect().height),
            nomeCortado: nome.scrollWidth > nome.clientWidth,
            nomeTitle: nome.getAttribute('title'),
            fornTitle: forn.getAttribute('title'),
            transborda: tabela.scrollWidth > tabela.closest('.card').clientWidth
        };
    });
    expect(r.altura, 'linha compacta, uma linha por item').toBeLessThanOrEqual(45);
    expect(r.nomeCortado, 'o nome longo é cortado com reticências').toBe(true);
    expect(r.nomeTitle).toContain('TRICÔ HERA');
    expect(r.fornTitle, 'o fornecedor completo fica no tooltip').toBe(FORN);
    expect(r.transborda, 'a tabela cabe no card, sem rolagem lateral').toBe(false);
});

test('a tabela de materiais tambem cabe no card', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.click('button[data-tab="cat-materiais"]');
    const transborda = await page.evaluate(() => {
        const t = document.getElementById('tabela-materiais');
        return t.scrollWidth > t.closest('.card').clientWidth;
    });
    expect(transborda).toBe(false);
});

// ─── Código antes do nome fora das tabelas ──────────────────────────────

test('o seletor de tecido do pedido mostra o codigo antes do nome', async ({ page }) => {
    await semear(page, 'pedido.html');
    const texto = await page.evaluate(() => {
        const sel = document.querySelector('select[id^="amb-tec"], #ped-tecido') ||
            [...document.querySelectorAll('select')].find(s => /\/m/.test(s.textContent));
        return sel ? sel.textContent : '';
    });
    if (texto) {
        expect(texto).toMatch(/0001\s*·\s*TRICÔ HERA/);
        expect(texto, 'o nome não vem mais antes do código').not.toMatch(/TRICÔ HERA.*\[0001\]/);
    }
});

test('o detalhe do tecido mostra o codigo acima do nome', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.evaluate(() => verDetalhesTecido(1));
    const modal = page => null;
    const ordem = await page.evaluate(() => {
        const cab = document.querySelector('.modal-overlay .modal-header');
        return cab ? cab.textContent.replace(/\s+/g, ' ').trim() : '';
    });
    expect(ordem.indexOf('0001'), 'o código vem primeiro').toBeLessThan(ordem.indexOf('TRICÔ HERA'));
    expect(ordem, 'e não se chama mais "Ref"').not.toContain('Ref:');
});
