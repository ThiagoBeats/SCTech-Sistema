const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const COLADO = [
    'CODIGO\tNOME\tMEDIDA\tPRECO',
    '5501\tKIT TRILHO SUICO\t1,00 a 1,50 m\t100,00',
    '5502\tKIT TRILHO SUICO G\t1,51 a 2,00 m\t200,00',
    '5503\tKIT VARAO ROMANO\t2,01 a 3,00 m\t300,00'
].join('\n');

async function abrirCatalogo(page, semente) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(d => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify(d.cat || []));
        localStorage.setItem('sc_mat', JSON.stringify(d.mat || []));
        localStorage.setItem('sc_kits', JSON.stringify(d.kits || []));
        localStorage.setItem('sc_est', JSON.stringify([]));
        localStorage.setItem('sc_ped', JSON.stringify([]));
        localStorage.setItem('sc_mov', JSON.stringify([]));
        localStorage.removeItem('sc_imp_perfis');
        localStorage.removeItem('sc_imp_snap');
    }, semente || {});
    await page.reload();
}

// Cola a tabela de kits, marca a aba como Kit e vai até a conferência.
async function ateAConferencia(page, escolhas) {
    const e = escolhas || {};
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(e.texto || COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    if (e.margem) await page.click(`input[name="imp-cfg-margem"][value="${e.margem}"]`);
    if (e.estoque) await page.click(`input[name="imp-cfg-estoque"][value="${e.estoque}"]`);
    if (e.margem !== 'item') await page.fill('#imp-markup', String(e.markup ?? 50));
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.locator('#imp-corpo tbody select').first().selectOption('kit');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
}

async function importar(page, escolhas) {
    await abrirCatalogo(page, (escolhas || {}).semente);
    await ateAConferencia(page, escolhas);
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 3);
}

// ─── Kit como tipo de aba ───────────────────────────────────────────────

test('o passo 2 oferece Kit ao lado de Tecido e Material', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirCatalogo(page);
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '50');
    await page.click('#imp-corpo button:has-text("Continuar")');

    const opcoes = await page.locator('#imp-corpo tbody select').first().locator('option').allInnerTexts();
    expect(opcoes).toEqual(['Tecido', 'Material', 'Kit', 'Ignorar']);

    // o atalho separado deixou de existir
    expect(await page.locator('button:has-text("Importar kits prontos")').count()).toBe(0);
    expect(erros, erros.join('\n')).toEqual([]);
});

test('aba de kit usa os papeis de coluna do kit, nao os de produto', async ({ page }) => {
    await abrirCatalogo(page);
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '50');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.locator('#imp-corpo tbody select').first().selectOption('kit');
    await page.click('#imp-corpo button:has-text("Continuar")');

    const papeis = await page.locator('.imp-mapa-tabela thead select').first().locator('option').allInnerTexts();
    expect(papeis).toEqual(['Ignorar', 'Código', 'Nome', 'Preço', 'Medida', 'Descrição']);
    expect(papeis, 'kit não tem largura').not.toContain('Largura');
    expect(papeis, 'nem preço por peça').not.toContain('Preço por peça');

    expect(await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0])))
        .toEqual({ codigo: 0, nome: 1, preco: 3, medida: 2, descricao: -1 });
});

test('aba de kit sem preco mapeado barra o Continuar', async ({ page }) => {
    await abrirCatalogo(page);
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '50');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.locator('#imp-corpo tbody select').first().selectOption('kit');
    await page.click('#imp-corpo button:has-text("Continuar")');

    await page.locator('.imp-mapa-tabela thead select').nth(3).selectOption('ignorar');
    await page.click('#imp-corpo button:has-text("Continuar")');

    expect(await page.evaluate(() => _impEstado.passo), 'nao pode avancar').toBe(3);
    await expect(page.locator('#imp-corpo')).toContainText('Mapeamentos incompletos');
    await expect(page.locator('#imp-corpo')).toContainText('Preço');
});

// ─── Conferência ────────────────────────────────────────────────────────

test('a conferencia traz os kits num bloco proprio, com medida e descricao', async ({ page }) => {
    await abrirCatalogo(page);
    await ateAConferencia(page, { markup: 50 });

    await expect(page.locator('#imp-corpo')).toContainText('Kits novos');
    await expect(page.locator('#imp-corpo')).toContainText('Medida');
    const r = await page.evaluate(() => _impEstado.gruposKit.novos.map(e => ({
        cod: e.item.codigo, medida: e.item.medida, custo: e.item.preco_custo, markup: e.markup
    })));
    expect(r).toEqual([
        { cod: '5501', medida: '1,00 a 1,50 m', custo: 100, markup: 50 },
        { cod: '5502', medida: '1,51 a 2,00 m', custo: 200, markup: 50 },
        { cod: '5503', medida: '2,01 a 3,00 m', custo: 300, markup: 50 }
    ]);
    await expect(page.locator('#imp-corpo')).toContainText('Gravar 3 item(ns)');
});

test('codigo de kit que ja e de um material vira conflito desmarcado', async ({ page }) => {
    await abrirCatalogo(page, {
        mat: [{ id: 8, referencia: '5502', nome: 'PONTEIRA', unidade: 'un', preco: 5, estoque_atual: 0 }]
    });
    await ateAConferencia(page, { markup: 50 });

    const r = await page.evaluate(() => ({
        novos: _impEstado.gruposKit.novos.length,
        conflitos: _impEstado.gruposKit.conflitos.map(e => ({ marcado: e.marcado, motivo: e.motivo }))
    }));
    expect(r.novos).toBe(2);
    expect(r.conflitos[0].marcado).toBe(false);
    expect(r.conflitos[0].motivo).toContain('um material');

    await page.evaluate(() => _impAlternarMarcadoKit('conflitos', 0));
    await page.click('#imp-corpo button:has-text("Gravar")');
    await expect(page.locator('#sc-modal-msg')).toContainText('pendências nos kits');
});

test('corrigir o codigo na conferencia tira o kit do conflito', async ({ page }) => {
    await abrirCatalogo(page, {
        mat: [{ id: 8, referencia: '5502', nome: 'PONTEIRA', unidade: 'un', preco: 5, estoque_atual: 0 }]
    });
    await ateAConferencia(page, { markup: 50 });
    await page.evaluate(() => _impEditarCampoKit('conflitos', 0, 'codigo', '5502B'));

    const r = await page.evaluate(() => ({
        novos: _impEstado.gruposKit.novos.length,
        conflitos: _impEstado.gruposKit.conflitos.length
    }));
    expect(r.conflitos).toBe(0);
    expect(r.novos).toBe(3);
});

// ─── Gravação ───────────────────────────────────────────────────────────

test('os kits gravados sao kits prontos, com preco pela margem', async ({ page }) => {
    await importar(page, { markup: 50 });

    const kits = await page.evaluate(() => db.kits.map(k => ({
        tipo: k.tipo, ref: k.referencia, medida: k.medida, custo: k.preco_custo,
        preco: k.preco, saldo: k.estoque_atual, infinito: k.estoque_infinito,
        forn: k.fornecedor_nome, itens: k.itens.length
    })));
    expect(kits[0]).toEqual({
        tipo: 'pronto', ref: '5501', medida: '1,00 a 1,50 m', custo: 100,
        preco: 150, saldo: 0, infinito: false, forn: 'RC Tecidos', itens: 0
    });
    expect(kits.map(k => k.preco)).toEqual([150, 300, 450]);
});

test('margem por item vale para os kits tambem', async ({ page }) => {
    await abrirCatalogo(page);
    await ateAConferencia(page, { margem: 'item' });
    expect(await page.evaluate(() => _impEstado.gruposKit.novos.map(e => e.markup))).toEqual([null, null, null]);

    await page.evaluate(() => {
        _impEditarCampoKit('novos', 0, 'markup', '10');
        _impEditarCampoKit('novos', 1, 'markup', '100');
        _impEditarCampoKit('novos', 2, 'markup', '0');
    });
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 3);
    expect(await page.evaluate(() => db.kits.map(k => k.preco))).toEqual([110, 400, 300]);
});

test('estoque infinito vale para os kits', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 50 });
    expect(await page.evaluate(() => db.kits.every(k => k.estoque_infinito === true))).toBe(true);
});

test('produtos e kits na mesma importacao vao cada um para o seu lugar', async ({ page }) => {
    await abrirCatalogo(page);
    // duas "abas": a colagem vira uma só, então semeia duas na mão
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '50');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(() => {
        _impEstado.planilha.abas['Tecidos'] = [
            ['CODIGO', 'NOME', 'LARGURA', 'PRECO'],
            ['T1', 'LINHO BELGA', '2,80', '60,00']
        ];
        _impEstado.planilha.ordem.push('Tecidos');
        _impEstado.abas['Dados colados'] = 'kit';
        _impEstado.abas['Tecidos'] = 'tecido';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    await expect(page.locator('#imp-corpo')).toContainText('Kits novos');
    await expect(page.locator('#imp-corpo')).toContainText('Gravar 4 item(ns)');

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 3);

    const r = await page.evaluate(() => ({
        kits: db.kits.map(k => k.referencia),
        tecidos: db.catalogo.map(c => c.referencia)
    }));
    expect(r.kits).toEqual(['5501', '5502', '5503']);
    expect(r.tecidos, 'o tecido não pode ter ido parar nos kits').toEqual(['T1']);
});

// ─── Desfazer ───────────────────────────────────────────────────────────

test('o desfazer devolve os kits da importacao', async ({ page }) => {
    await importar(page, { markup: 50 });
    await expect(page.locator('#btn-desfazer-import')).toBeVisible();

    await page.click('#btn-desfazer-import');
    await expect(page.locator('#sc-modal-msg')).toContainText('3 item(ns) criado(s)');
    await expect(page.locator('#sc-modal-msg')).toContainText('Kit que já recebeu saldo');
    await page.click('#sc-modal-btns button:has-text("Desfazer")');

    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 0);
});

test('o desfazer mantem o kit que ja recebeu saldo', async ({ page }) => {
    await importar(page, { markup: 50 });
    await page.evaluate(() => { db.kits[0].estoque_atual = 5; syncDB(); });

    await page.click('#btn-desfazer-import');
    await page.click('#sc-modal-btns button:has-text("Desfazer")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);
    expect(await page.evaluate(() => db.kits[0].estoque_atual)).toBe(5);
});

// ─── O kit no sistema ───────────────────────────────────────────────────

test('a aba Kits aparece no Cadastro/Catalogo com os mesmos dados', async ({ page }) => {
    await importar(page, { markup: 50 });

    await page.click('button[data-tab="cat-kits"]');
    const linha = page.locator('#tb-kits tr', { hasText: 'KIT VARAO ROMANO' }).first();
    await expect(linha).toContainText('5503');
    await expect(linha).toContainText('2,01 a 3,00 m');
    await expect(linha).toContainText('R$ 450.00');
    await expect(linha).toContainText('pronto');

    // e a mesma aba segue existindo no Estoque
    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');
    await expect(page.locator('#tb-kits tr', { hasText: 'KIT VARAO ROMANO' }).first()).toContainText('5503');
});

test('montar kit de materiais continua no Estoque, nao no catalogo', async ({ page }) => {
    await abrirCatalogo(page, {
        mat: [{ id: 21, referencia: 'TR-01', nome: 'TRILHO', unidade: 'm', preco: 40, estoque_atual: 100 }]
    });
    // no catálogo a aba Kits cria kit PRONTO: não há seletor de material
    await page.click('button[data-tab="cat-kits"]');
    expect(await page.locator('#kit-item-mat').count()).toBe(0);
    await expect(page.locator('#tab-cat-kits')).toContainText('Criar Kit Pronto');

    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');
    await page.fill('#kit-ref', 'KIT-SALA');
    await page.fill('#kit-nome', 'Kit Cortina Sala');
    await page.selectOption('#kit-item-mat', '21');
    await page.fill('#kit-item-qtd', '3');
    await page.click('button:has-text("+ Adicionar Item")');
    await page.click('button:has-text("Salvar Kit")');

    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);
    const k = await page.evaluate(() => db.kits[0]);
    expect(k.referencia).toBe('KIT-SALA');
    expect(k.nome).toBe('Kit Cortina Sala');
    expect(k.itens).toEqual([{ materialId: 21, nome: 'TRILHO', unidade: 'm', quantidade: 3 }]);
});

test('o kit importado entra no pedido como uma linha so', async ({ page }) => {
    await importar(page, { markup: 50 });
    await page.goto(BASE + '/pedido.html');

    const id = await page.evaluate(() => db.kits[0].id);
    await page.selectOption('#ped-kit', String(id));
    await page.click('button:has-text("Aplicar Kit")');

    const itens = await page.evaluate(() => pedidoDraft.itens);
    expect(itens.length).toBe(1);
    expect(itens[0].kitId).toBe(id);
    expect(itens[0].preco_unit).toBe(150);
});

test('vender um kit pronto baixa o saldo dele', async ({ page }) => {
    await importar(page, { markup: 50 });
    const saldo = await page.evaluate(() => {
        const kit = db.kits[0];
        kit.estoque_atual = 10;
        realizarBaixaMateriais({ id: 910, itens: [{ kitId: kit.id, nome: kit.nome, unidade: 'un', quantidade: 3, preco_unit: kit.preco, subtotal: 3 * kit.preco }] });
        return db.kits[0].estoque_atual;
    });
    expect(saldo).toBe(7);
});
