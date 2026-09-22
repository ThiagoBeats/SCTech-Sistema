const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8123';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

test('catalogo.html carrega sem erro de console e traz o botao de importar', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.waitForLoadState('networkidle');

    // o botao existe e esta visivel
    const botao = page.locator('text=📥 Importar tabela');
    await expect(botao).toBeVisible();

    // os dois modulos carregaram
    const estado = await page.evaluate(() => ({
        core: typeof window.ImportadorCore,
        lerArquivo: typeof window._impLerArquivo,
        moeda: typeof window._impMoeda,
        abrir: typeof window.abrirImportadorTabela,
        garantirSheetJs: typeof window._impGarantirSheetJs,
        xlsxJaCarregado: typeof window.XLSX
    }));
    expect(estado.core).toBe('object');
    expect(estado.lerArquivo).toBe('function');
    expect(estado.moeda).toBe('function');
    expect(estado.abrir).toBe('function');
    expect(estado.garantirSheetJs).toBe('function');
    // SheetJS NAO pode carregar sozinho no load da pagina
    expect(estado.xlsxJaCarregado).toBe('undefined');

    expect(erros, 'erros no console/pagina:\n' + erros.join('\n')).toEqual([]);
});

test('_impMoeda formata em real brasileiro', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    const r = await page.evaluate(() => [
        window._impMoeda(0), window._impMoeda(1234.5), window._impMoeda(78.9), window._impMoeda(null)
    ]);
    expect(r[0]).toContain('0,00');
    expect(r[1]).toContain('1.234,50');
    expect(r[2]).toContain('78,90');
    expect(r[3]).toContain('0,00');
});

test('_impLerArquivo carrega o SheetJS sob demanda e le a planilha real', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');

    // injeta um input de arquivo para conseguir entregar o File ao modulo
    await page.evaluate(() => {
        const i = document.createElement('input');
        i.type = 'file'; i.id = 'teste-file';
        document.body.appendChild(i);
    });
    await page.setInputFiles('#teste-file', PLANILHA);

    const r = await page.evaluate(async () => {
        const f = document.getElementById('teste-file').files[0];
        const planilha = await window._impLerArquivo(f);
        return {
            qtdAbas: planilha.ordem.length,
            temCapa: planilha.ordem.includes('Capa'),
            temBook10: planilha.ordem.includes('Book 10'),
            linhasBook10: planilha.abas['Book 10'].length,
            cabecalhoBook10: planilha.abas['Book 10'][1],
            xlsxAgora: typeof window.XLSX
        };
    });

    expect(r.qtdAbas).toBe(22);
    expect(r.temCapa).toBe(true);
    expect(r.temBook10).toBe(true);
    expect(r.linhasBook10).toBeGreaterThan(30);
    expect(String(r.cabecalhoBook10[0])).toMatch(/C[OÓ]DIGO/i);
    expect(String(r.cabecalhoBook10[3])).toMatch(/LARGURA/i);
    expect(r.xlsxAgora).toBe('object'); // carregou sob demanda
});

test('o core roda no navegador sobre o que o leitor devolveu', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        const i = document.createElement('input');
        i.type = 'file'; i.id = 'teste-file';
        document.body.appendChild(i);
    });
    await page.setInputFiles('#teste-file', PLANILHA);

    const r = await page.evaluate(async () => {
        const C = window.ImportadorCore;
        const f = document.getElementById('teste-file').files[0];
        const planilha = await window._impLerArquivo(f);
        const dados = planilha.abas['Book 10'];
        const { indice, colunas } = C.detectarCabecalho(dados);
        const mapa = C.sugerirMapeamento(colunas);
        const itens = C.montarItens({ linhas: dados, cabecalhoIndice: indice, mapa, tipo: 'tecido', aba: 'Book 10' });
        return { indice, mapa, qtd: itens.length, primeiro: itens[0] };
    });

    expect(r.indice).toBe(1);
    expect(r.mapa).toEqual({ codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 });
    expect(r.qtd).toBe(38);
    expect(r.primeiro.unidade).toBe('m');
    expect(r.primeiro.codigo).toBeTruthy();
});
