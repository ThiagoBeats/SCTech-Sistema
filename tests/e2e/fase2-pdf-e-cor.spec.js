const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');
const PDF = path.join(RAIZ, 'docs', 'Tabela de preços RC TECIDOS PDF.pdf');

async function abrir(page) {
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

test('o PDF real e aceito e vira uma aba por pagina', async ({ page }) => {
    test.setTimeout(120000);
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrir(page);
    await page.setInputFiles('#imp-file', PDF);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba', { timeout: 60000 });

    const r = await page.evaluate(() => ({
        ordem: _impEstado.planilha.ordem.slice(0, 3),
        qtd: _impEstado.planilha.ordem.length,
        linhasPag3: _impEstado.planilha.abas['Página 3'].length
    }));
    expect(r.qtd).toBe(22);
    expect(r.ordem[0]).toBe('Página 1');
    expect(r.linhasPag3).toBeGreaterThan(30);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('o PDF chega ate a conferencia com os itens certos do Book 10', async ({ page }) => {
    test.setTimeout(120000);
    await abrir(page);
    await page.setInputFiles('#imp-file', PDF);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba', { timeout: 60000 });
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Página 1');

    // so a pagina 3, que e o Book 10
    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Página 3'] = 'tecido';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const r = await page.evaluate(() => {
        const novos = _impEstado.grupos.novos;
        const porCodigo = {};
        novos.forEach(e => { porCodigo[e.item.codigo] = { l: e.item.largura, p: e.item.preco_custo }; });
        return { qtd: novos.length, problemas: _impEstado.grupos.problemas.length, amostra: porCodigo };
    });

    expect(r.qtd, 'a pagina 3 do PDF deveria dar os 38 itens do Book 10').toBe(38);
    expect(r.amostra['10001']).toEqual({ l: 1.4, p: 83.65 });
    expect(r.amostra['10003']).toEqual({ l: 1.45, p: 78.9 });
    expect(r.amostra['10005']).toEqual({ l: 2.8, p: 95.95 });
});

test('modo preco por cor na interface gera um material por cor', async ({ page }) => {
    test.setTimeout(120000);
    await abrir(page);
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');

    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Cor Metal'] = 'material';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');

    // a caixa de preco por cor tem de existir no passo 3
    await expect(page.locator('#imp-corpo')).toContainText('preço por cor');

    // liga o modo cor e marca o primeiro bloco de cores (colunas 3..8)
    const r = await page.evaluate(() => {
        const layouts = _impLayoutsDistintos();
        const i = layouts.findIndex(l => l.abas.includes('Cor Metal'));
        _impAlternarModoCor(i);
        [3, 4, 5, 6, 7, 8].forEach(c => _impTrocarPapel(i, c, 'cor'));
        const ass = _impLayoutsDistintos()[i].assinatura;
        return { cores: _impEstado.cores[ass], assinatura: ass };
    });
    expect(r.cores).toEqual([3, 4, 5, 6, 7, 8]);

    // sem coluna de preco mapeada, o passo 3 deve deixar avancar em modo cor
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const c = await page.evaluate(() => {
        const novos = _impEstado.grupos.novos;
        const cods = novos.map(e => e.item.codigo);
        const tal = novos.filter(e => e.item.codigo.startsWith('TAL002-'))
            .map(e => ({ c: e.item.codigo, n: e.item.nome, p: e.item.preco_custo }));
        return { qtd: novos.length, repetidos: cods.length - new Set(cods).size, tal };
    });

    expect(c.qtd, 'Cor Metal com um bloco de cores deveria dar 235 itens').toBe(235);
    expect(c.repetidos, 'nenhum codigo repetido depois da expansao').toBe(0);
    expect(c.tal.find(x => x.c === 'TAL002-DOURADO').p).toBe(13.8);
    expect(c.tal.find(x => x.c === 'TAL002-CROMADO').p).toBe(10.6);
    expect(c.tal.find(x => x.c === 'TAL002-DOURADO').n).toContain('(DOURADO)');
});

test('selecao manual do cabecalho destrava uma aba sem cabecalho', async ({ page }) => {
    test.setTimeout(120000);
    await abrir(page);
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');

    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Trilho Motorizado'] = 'material';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');

    // o seletor de linha de cabecalho tem de existir
    await expect(page.locator('#imp-corpo')).toContainText('Cabeçalho');

    const antes = await page.evaluate(() => {
        const l = _impLayoutsDistintos()[0];
        return { cabecalhoIndice: l.cabecalhoIndice, assinatura: l.assinatura };
    });
    expect(antes.cabecalhoIndice, 'esta aba nao tem cabecalho reconhecivel').toBe(-1);

    // escolhe uma linha na mao e confere que o mapeamento e re-sugerido
    const depois = await page.evaluate(() => {
        _impTrocarCabecalho(0, 1);
        const l = _impLayoutsDistintos()[0];
        return { guardado: _impEstado.layouts[l.assinatura] };
    });
    expect(depois.guardado, 'a escolha manual precisa ficar guardada').toBeTruthy();
    expect(depois.guardado.cabecalhoIndice).toBe(1);
});

test('a planilha continua funcionando como na Fase 1', async ({ page }) => {
    await abrir(page);
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');

    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Book 10'] = 'tecido';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);

    const qtd = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat')).length);
    expect(qtd).toBe(38);
});

// C1 (correcao-final.md): repro exato do revisor. Uma aba com um bloco de
// cabecalho velho (REF|PRODUTO|PRECO) na linha 2 e o cabecalho real
// (CÓD.|DESCRIÇÃO|CORES|QUANT.|PREÇO) na linha 5. O usuario escolhe a linha 5
// na mao; ANTES da correcao, "Continuar" (do passo 3 para o passo 4) revertia
// a escolha para a linha 2 (a deteccao automatica) e o produto de R$ 9,90
// entrava a R$ 100,00 — este teste so passa se a escolha sobreviver ao clique.
test('C1: escolha manual de cabecalho sobrevive ao Continuar do passo 3', async ({ page }) => {
    test.setTimeout(120000);
    await abrir(page);
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');

    // Injeta a aba sintetica do repro no lugar das abas reais, mantendo o
    // restante do fluxo (passo 2 -> passo 3 -> passo 4) intocado.
    await page.evaluate(() => {
        const dados = [
            ['TABELA ANTIGA - NAO USAR'],
            ['REF', 'PRODUTO', 'PRECO'],
            ['X1', 'Produto velho', '9.90'],
            [''],
            ['CÓD.', 'DESCRIÇÃO', 'CORES', 'QUANT.', 'PREÇO'],
            ['1000', 'Produto real', 'AZUL', '10', '9.90']
        ];
        _impEstado.planilha = { abas: { 'Aba C1': dados }, ordem: ['Aba C1'] };
        _impEstado.abas = { 'Aba C1': 'material' };
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Cabeçalho');

    // A deteccao automatica cai no bloco velho (linha 2 = indice 1).
    const auto = await page.evaluate(() => _impLayoutsDistintos()[0].cabecalhoIndice);
    expect(auto, 'deteccao automatica deveria cair no bloco velho').toBe(1);

    // Usuario escolhe a linha 5 (indice 4) na mao.
    await page.evaluate(() => _impTrocarCabecalho(0, 4));
    const indiceEscolhido = await page.evaluate(() => {
        const l = _impLayoutsDistintos()[0];
        return _impEstado.layouts[l.assinatura].cabecalhoIndice;
    });
    expect(indiceEscolhido).toBe(4);

    // Clica em "Continuar" — e o ponto que a correcao final tinha de blindar.
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const estado = await page.evaluate(() => {
        const grupos = _impEstado.grupos;
        const todos = [].concat(grupos.novos, grupos.atualizados, grupos.problemas, grupos.conflitos);
        return todos.map(e => ({ codigo: e.item.codigo, preco_custo: e.item.preco_custo }));
    });
    // Se o indice tivesse revertido para a linha 2 (bloco velho), a linha "X1"
    // (que nao e produto nenhum, e o cabecalho velho) entraria como item extra
    // e/ou o preco do 1000 viria de outra celula. So passa com EXATAMENTE um
    // item, o 1000 com o preco da linha 5.
    expect(estado, 'so o produto real (1000) pode aparecer; nada do bloco velho').toEqual([
        { codigo: '1000', preco_custo: 9.9 }
    ]);
});
