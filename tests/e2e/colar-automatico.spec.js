const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// Dados reais enviados pelo usuario: 7 linhas, sem cabecalho, com uma coluna
// vazia entre o nome e a largura.
const COLADO = [
    '12008\tJACQUARD ELINE\t\t2,80\t50,06',
    '12009\tJACQUARD RIVIERA\t\t2,80\t50,06',
    '12010\tRUSTICO SAVANA  (CORES 03 E 04 FORA DE LINHA)\t\t2,90\t39,49',
    '12011\tRUSTICO SINTÉTICO\t\t3,00\t27,20',
    '12012\tRUSTICO SINTÉTICO XADREZ\t\t3,00\t26,16',
    '12014\tTRICO CEARÁ\t\t3,00\t32,28',
    '12016\tGAZE DE LINHO\t\t2,80\t27,40'
].join('\n');

async function abrirAssistente(page) {
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
}

test('colar ja carrega os dados, sem botao', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirAssistente(page);

    // nao existe mais botao de usar o texto
    expect(await page.locator('#imp-corpo button:has-text("Usar")').count()).toBe(0);

    await page.locator('#imp-colar').fill(COLADO);

    // sem clicar em nada, os dados ja valem
    const r = await page.evaluate(() => ({
        origem: _impEstado.origem,
        linhas: (_impEstado.planilha && _impEstado.planilha.abas['Dados colados'] || []).length,
        colunas: ((_impEstado.planilha && _impEstado.planilha.abas['Dados colados'] || [])[0] || []).length
    }));
    expect(r.origem).toBe('colado');
    expect(r.linhas).toBe(7);
    expect(r.colunas).toBe(5);

    // a linha de status conta o que foi lido
    await expect(page.locator('#imp-origem')).toContainText('7 linha');

    // e o foco continua na area de texto, sem redesenho
    const focado = await page.evaluate(() => document.activeElement === document.getElementById('imp-colar'));
    expect(focado, 'colar nao pode roubar o foco da area de texto').toBe(true);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('apagar o texto colado descarta a fonte', async ({ page }) => {
    await abrirAssistente(page);
    await page.locator('#imp-colar').fill(COLADO);
    expect(await page.evaluate(() => _impEstado.origem)).toBe('colado');

    await page.locator('#imp-colar').fill('');
    const r = await page.evaluate(() => ({ origem: _impEstado.origem, planilha: !!_impEstado.planilha }));
    expect(r.origem).toBe(null);
    expect(r.planilha).toBe(false);
});

test('aba sem cabecalho mostra traco e a contagem de linhas, nao zero', async ({ page }) => {
    await abrirAssistente(page);
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');

    const linha = page.locator('tr', { hasText: 'Dados colados' }).first();
    const texto = await linha.innerText();
    expect(texto, 'nao pode mostrar 0 quando ha 7 linhas lidas').toContain('7 linha');
    expect(texto).toContain('mapear no passo 3');
    expect(texto).toContain('cabeçalho não encontrado');

    // e nao pode vir como ignorar
    const tipo = await page.evaluate(() => _impEstado.abas['Dados colados']);
    expect(tipo).not.toBe('ignorar');
});

test('as abas de matriz de preco continuam vindo como Ignorar', async ({ page }) => {
    await abrirAssistente(page);
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');

    const r = await page.evaluate(() => {
        const alvo = ['Capa', 'Trilho Motorizado', 'Varão Prime Montado', 'Trilho Slim Montado',
            'Trilho Square Montado', 'Varão Unic 19mm Montado'];
        return alvo.map(a => ({ aba: a, tipo: _impEstado.abas[a] }));
    });
    r.forEach(x => expect(x.tipo, `${x.aba} deveria seguir ignorada`).toBe('ignorar'));

    // e o Book 10 continua contando 38 de verdade
    const book = await page.locator('tr', { hasText: 'Book 10' }).first().innerText();
    expect(book).toContain('38');
});

test('os 7 tecidos colados entram com estoque minimo de 10 m', async ({ page }) => {
    await abrirAssistente(page);
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');

    await page.evaluate(() => {
        _impEstado.abas['Dados colados'] = 'tecido';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');

    await page.evaluate(() => {
        _impTrocarPapel(0, 0, 'codigo');
        _impTrocarPapel(0, 1, 'nome');
        _impTrocarPapel(0, 3, 'largura');
        _impTrocarPapel(0, 4, 'preco');
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const novos = await page.evaluate(() => _impEstado.grupos.novos.length);
    expect(novos).toBe(7);

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);

    const cat = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat')));
    expect(cat.length).toBe(7);
    expect(cat.every(t => t.min_estoque === 10), 'todo tecido importado deveria nascer com 10 m').toBe(true);

    const eline = cat.find(t => t.referencia === '12008');
    expect(eline.nome).toBe('JACQUARD ELINE');
    expect(eline.largura_rolo).toBe(2.8);
    expect(eline.preco_custo).toBe(50.06);
    expect(eline.preco).toBe(90.11);   // 50,06 x 1,8

    const savana = cat.find(t => t.referencia === '12010');
    expect(savana.nome).toBe('RUSTICO SAVANA (CORES 03 E 04 FORA DE LINHA)');
    expect(savana.largura_rolo).toBe(2.9);
    expect(savana.preco_custo).toBe(39.49);
});

test('material importado continua com estoque minimo 0', async ({ page }) => {
    await abrirAssistente(page);
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(() => {
        _impEstado.abas['Dados colados'] = 'material';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(() => {
        _impTrocarPapel(0, 0, 'codigo');
        _impTrocarPapel(0, 1, 'nome');
        _impTrocarPapel(0, 4, 'preco');
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_mat') || '[]').length > 0);

    const mats = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_mat')));
    expect(mats.length).toBe(7);
    expect(mats.every(m => m.min_estoque === 0)).toBe(true);
    expect(mats.every(m => m.estoque_atual === 0)).toBe(true);
});
