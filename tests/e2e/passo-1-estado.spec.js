const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');
const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// Ordem natural do usuario: escolher o fornecedor primeiro, depois o arquivo.
test('escolher fornecedor ANTES do arquivo nao pode perder a escolha', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.removeItem('sc_imp_perfis');
    });
    await page.reload();

    await page.click('text=📥 Importar tabela');

    // 1) escolhe fornecedor e markup PRIMEIRO
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '55');

    // 2) so depois sobe o arquivo
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');

    const depois = await page.evaluate(() => ({
        fornecedorSelecionado: document.getElementById('imp-fornecedor').value,
        markup: document.getElementById('imp-markup').value
    }));

    expect(depois.fornecedorSelecionado, 'o fornecedor escolhido antes do arquivo foi perdido no re-render').toBe('7');
    expect(depois.markup, 'o markup digitado antes do arquivo foi perdido no re-render').toBe('55');
});
