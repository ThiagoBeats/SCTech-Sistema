const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const CATALOGO = [
    { id: 1, referencia: '0001', nome: 'TRICÔ HERA', preco: 167.30, preco_custo: 92.94, largura_rolo: 1.40, min_estoque: 10, fornecedor_id: 7, fornecedor_nome: '59.928.225 MARIA GABRIELA DA SILVA ALVES', imagem: '' },
    { id: 2, referencia: '0002', nome: 'TRICÔ PERSEU', preco: 142.90, preco_custo: 79.39, largura_rolo: 1.45, min_estoque: 10, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', imagem: '' },
    { id: 3, referencia: '0010', nome: 'LINHO BELGA', preco: 65.00, preco_custo: 36.11, largura_rolo: 2.80, min_estoque: 50, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', imagem: '' }
];
const ESTOQUE = [
    { id: 11, tecido_id: 1, lote: 'L-2291', metragem_inicial: 30, metragem_atual: 18, data_entrada: '2026-10-05' },
    { id: 12, tecido_id: 1, lote: 'L-2184', metragem_inicial: 20, metragem_atual: 7, data_entrada: '2026-09-22' },
    { id: 13, tecido_id: 2, lote: 'L-3001', metragem_inicial: 20, metragem_atual: 12, data_entrada: '2026-10-03' },
    { id: 14, tecido_id: 3, lote: 'L-4001', metragem_inicial: 40, metragem_atual: 8.5, data_entrada: '2026-10-01' }
];
const MATERIAIS = [
    { id: 50, referencia: 'TR-01', nome: 'TRILHO SUÍÇO', unidade: 'un', preco: 38.00, preco_custo: 21.11, estoque_atual: 25, min_estoque: 5, fornecedor_id: 7, fornecedor_nome: 'Fornecedor Trilhos' },
    { id: 51, referencia: 'TR-02', nome: 'TRILHO MOTORIZADO', unidade: 'un', preco: 980.00, preco_custo: 544.44, estoque_atual: 2, min_estoque: 6, fornecedor_id: 7, fornecedor_nome: 'Fornecedor Trilhos' }
];
const MOVIMENTOS = [
    { id: 90, tipo: 'Entrada', item_tipo: 'material', item_nome: 'TRILHO SUÍÇO',
      quantidade: 10, unidade: 'un', ref: 'Entrada manual', data: Date.parse('2026-10-02T12:00:00') }
];

async function abrirConsulta(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/estoque.html');
    await page.evaluate(d => {
        localStorage.setItem('sc_cat', JSON.stringify(d.cat));
        localStorage.setItem('sc_est', JSON.stringify(d.est));
        localStorage.setItem('sc_mat', JSON.stringify(d.mat));
        localStorage.setItem('sc_mov', JSON.stringify(d.mov));
    }, { cat: CATALOGO, est: ESTOQUE, mat: MATERIAIS, mov: MOVIMENTOS });
    await page.reload();
    await page.click('text=🔍 Consulta de Estoque');
    await expect(page.locator('#tab-consulta')).toBeVisible();
}

test('a ordem dos campos e Codigo, Nome, Tipo', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirConsulta(page);

    const rotulos = await page.locator('#tab-consulta label').allInnerTexts();
    expect(rotulos[0]).toMatch(/C[óo]digo/i);
    expect(rotulos[1]).toMatch(/nome/i);
    expect(rotulos[2]).toMatch(/tipo/i);

    await expect(page.locator('#consulta-codigo')).toHaveAttribute('placeholder', /0001/);
    await expect(page.locator('#consulta-busca')).toHaveAttribute('placeholder', /Tric/i);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('a lista e compacta, uma linha por produto, sem cards', async ({ page }) => {
    await abrirConsulta(page);

    // nenhum card dentro dos resultados
    expect(await page.locator('#consulta-resultados .card').count()).toBe(0);

    const linhas = page.locator('.consulta-linha');
    await expect(linhas).toHaveCount(5);   // 3 tecidos + 2 materiais

    // cabecalho com as colunas na ordem pedida
    const cab = await page.locator('.consulta-cab').innerText();
    const ordem = cab.replace(/\s+/g, ' ').toUpperCase();
    expect(ordem.indexOf('CÓDIGO')).toBeLessThan(ordem.indexOf('NOME'));
    expect(ordem.indexOf('NOME')).toBeLessThan(ordem.indexOf('PREÇO'));
    expect(ordem.indexOf('PREÇO')).toBeLessThan(ordem.indexOf('ESTOQUE'));
    expect(ordem.indexOf('ESTOQUE')).toBeLessThan(ordem.indexOf('ÚLTIMA'));

    // cada linha ocupa pouca altura
    const altura = await linhas.first().evaluate(el => el.getBoundingClientRect().height);
    expect(altura, 'a linha deveria ser compacta').toBeLessThan(48);

    // ordenada por codigo, com 0010 depois de 0002
    const codigos = await page.locator('.consulta-cod').allInnerTexts();
    expect(codigos).toEqual(['0001', '0002', '0010', 'TR-01', 'TR-02']);
});

test('a linha mostra codigo, nome, preco, estoque e ultima entrada', async ({ page }) => {
    await abrirConsulta(page);

    const hera = page.locator('.consulta-linha', { hasText: 'TRICÔ HERA' }).first();
    const t = (await hera.innerText()).replace(/\s+/g, ' ');
    expect(t).toContain('0001');
    expect(t).toContain('TRICÔ HERA');
    expect(t).toContain('R$ 167,30/m');
    expect(t).toContain('25,00 m');          // 18 + 7 dos dois rolos
    expect(t).toContain('05/10/2026');       // rolo mais recente

    const trilho = page.locator('.consulta-linha', { hasText: 'TRILHO SUÍÇO' }).first();
    const m = (await trilho.innerText()).replace(/\s+/g, ' ');
    expect(m).toContain('TR-01');
    expect(m).toContain('R$ 38,00');
    expect(m).not.toContain('R$ 38,00/m');   // material nao leva /m
    expect(m).toContain('25,00 un');
    expect(m).toContain('02/10/2026');
});

test('custo, minimo e fornecedor NAO aparecem na lista fechada', async ({ page }) => {
    await abrirConsulta(page);
    const lista = (await page.locator('.consulta-lista').innerText()).replace(/\s+/g, ' ');
    expect(lista).not.toContain('92,94');                 // preco de custo
    expect(lista).not.toContain('MARIA GABRIELA');        // fornecedor
    expect(lista).not.toMatch(/Estoque m[íi]nimo/i);
});

test('clicar na linha abre fornecedor e os rolos, e clicar de novo recolhe', async ({ page }) => {
    await abrirConsulta(page);

    expect(await page.locator('.consulta-detalhe').count()).toBe(0);

    await page.locator('.consulta-linha', { hasText: 'TRICÔ HERA' }).first().click();
    const det = page.locator('.consulta-detalhe');
    await expect(det).toHaveCount(1);

    const d = (await det.innerText()).replace(/\s+/g, ' ');
    expect(d).toContain('59.928.225 MARIA GABRIELA DA SILVA ALVES');
    expect(d).toContain('92,94');            // custo volta aqui
    expect(d).toContain('L-2291');           // os rolos foram mantidos
    expect(d).toContain('L-2184');
    expect(d).toContain('18,000 m');

    // so um aberto por vez
    await page.locator('.consulta-linha', { hasText: 'LINHO BELGA' }).first().click();
    await expect(page.locator('.consulta-detalhe')).toHaveCount(1);
    expect(await page.locator('.consulta-detalhe').innerText()).not.toContain('L-2291');

    // clicar de novo recolhe
    await page.locator('.consulta-linha', { hasText: 'LINHO BELGA' }).first().click();
    await expect(page.locator('.consulta-detalhe')).toHaveCount(0);
});

test('material expandido mostra fornecedor e unidade, sem tabela de rolos', async ({ page }) => {
    await abrirConsulta(page);
    await page.locator('.consulta-linha', { hasText: 'TRILHO SUÍÇO' }).first().click();
    const d = page.locator('.consulta-detalhe');
    await expect(d).toHaveCount(1);
    const t = (await d.innerText()).replace(/\s+/g, ' ');
    expect(t).toContain('Fornecedor Trilhos');
    expect(t).toMatch(/Unidade/i);
    expect(await d.locator('table').count(), 'material nao tem rolos').toBe(0);
});

test('o aviso de abaixo do minimo continua visivel', async ({ page }) => {
    await abrirConsulta(page);
    // LINHO BELGA tem 8,5 m com minimo 50; TRILHO MOTORIZADO tem 2 com minimo 6
    const baixos = await page.locator('.consulta-qtd.baixo').allInnerTexts();
    expect(baixos.length).toBe(2);
    expect(baixos.join(' ')).toContain('⚠');
    // TRICO HERA tem 25 m com minimo 10: nao pode estar marcado
    const hera = page.locator('.consulta-linha', { hasText: 'TRICÔ HERA' }).first();
    expect(await hera.locator('.consulta-qtd.baixo').count()).toBe(0);
});

test('digitar o codigo filtra e sugere; escolher preenche os dois campos', async ({ page }) => {
    await abrirConsulta(page);

    await page.fill('#consulta-codigo', '000');
    const sug = page.locator('#consulta-sug-codigo .consulta-sug-item');
    await expect(sug.first()).toBeVisible();
    // 0001 e 0002 contem "000"; 0010 nao
    expect(await sug.count()).toBe(2);

    // a lista ja filtrou junto
    await expect(page.locator('.consulta-linha')).toHaveCount(2);

    await sug.first().click();
    expect(await page.inputValue('#consulta-codigo')).toBe('0001');
    expect(await page.inputValue('#consulta-busca')).toBe('TRICÔ HERA');
    await expect(page.locator('.consulta-linha')).toHaveCount(1);
    await expect(page.locator('#consulta-sug-codigo')).not.toHaveClass(/aberta/);
});

test('digitar o nome sugere e preenche o codigo', async ({ page }) => {
    await abrirConsulta(page);

    await page.fill('#consulta-busca', 'trico');   // sem acento, de proposito
    const sug = page.locator('#consulta-sug-nome .consulta-sug-item');
    await expect(sug.first()).toBeVisible();
    expect(await sug.count()).toBe(2);             // TRICÔ HERA e TRICÔ PERSEU

    await sug.nth(1).click();
    expect(await page.inputValue('#consulta-busca')).toBe('TRICÔ PERSEU');
    expect(await page.inputValue('#consulta-codigo')).toBe('0002');
    await expect(page.locator('.consulta-linha')).toHaveCount(1);
});

test('os tres filtros combinam entre si', async ({ page }) => {
    await abrirConsulta(page);

    await page.fill('#consulta-busca', 'TRILHO');
    await expect(page.locator('.consulta-linha')).toHaveCount(2);

    await page.selectOption('#consulta-tipo', 'tecido');
    await expect(page.locator('.consulta-linha')).toHaveCount(0);   // nenhum tecido chamado TRILHO
    await expect(page.locator('.consulta-vazio')).toBeVisible();

    await page.selectOption('#consulta-tipo', 'material');
    await expect(page.locator('.consulta-linha')).toHaveCount(2);

    await page.fill('#consulta-codigo', 'TR-02');
    await expect(page.locator('.consulta-linha')).toHaveCount(1);
    await expect(page.locator('.consulta-cod')).toHaveText('TR-02');
});

test('sem filtro nenhum, mostra todos os produtos', async ({ page }) => {
    await abrirConsulta(page);
    await expect(page.locator('.consulta-linha')).toHaveCount(5);
    await page.fill('#consulta-busca', 'linho');
    await expect(page.locator('.consulta-linha')).toHaveCount(1);
    await page.fill('#consulta-busca', '');
    await expect(page.locator('.consulta-linha')).toHaveCount(5);
});

test('as outras abas do estoque seguem funcionando', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    await abrirConsulta(page);

    for (const aba of ['🧵 Tecidos', '🔩 Materiais', '📋 Histórico', '📊 Estoque Futuro']) {
        await page.click(`text=${aba}`);
        await page.waitForTimeout(120);
    }
    expect(erros, erros.join('\n')).toEqual([]);
});
