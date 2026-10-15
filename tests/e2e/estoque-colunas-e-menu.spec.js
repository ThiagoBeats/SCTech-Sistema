// Os cinco pedidos: leitura correta da escolha de estoque, unidade de medida,
// colunas do Estoque iguais as do Catalogo, tecidos em uma linha so e as abas
// Historico/Estoque Futuro/Backup no menu dos tres pontos.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const COLADO = 'CODIGO\tNOME\tLARGURA\tPRECO\n7001\tTECIDO TESTE\t2,80\t50,00';

const PERFIL_INFINITO = [{
    id: 1, nome: 'RC Tecidos', fornecedor_id: 7, abas: {}, layouts: [], cores: {},
    markup_padrao: 80, margem_modo: 'total', estoque_modo: 'infinito'
}];

async function semear(page, pagina, perfis) {
    await entrar(page, BASE);
    await page.goto(BASE + '/' + pagina);
    await page.evaluate(p => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([
            { id: 1, referencia: '0001', nome: 'TRICÔ HERA',  preco: 167.3, preco_custo: 92.9, largura_rolo: 1.4, min_estoque: 10, fornecedor_nome: 'RC Tecidos' },
            { id: 2, referencia: '0002', nome: 'LINHO BELGA', preco: 65,    preco_custo: 36,   largura_rolo: 2.8, min_estoque: 10, fornecedor_nome: 'RC Tecidos' }
        ]));
        localStorage.setItem('sc_mat', JSON.stringify([
            { id: 11, referencia: 'TR-01', nome: 'TRILHO', unidade: 'pct', preco: 48, preco_custo: 30, min_estoque: 20, estoque_atual: 25, fornecedor_nome: 'RC Tecidos' }
        ]));
        localStorage.setItem('sc_kits', JSON.stringify([
            { id: 300, tipo: 'pronto', referencia: '5501', nome: 'KIT TRILHO', medida: '1,00 a 1,50 m', preco: 189, preco_custo: 126, estoque_atual: 4, itens: [] }
        ]));
        localStorage.setItem('sc_est', JSON.stringify([
            { id: 1, tecido_id: 1, lote: 'L-01', metragem_inicial: 30, metragem_atual: 25, data_entrada: '2026-10-05' },
            { id: 2, tecido_id: 1, lote: 'L-02', metragem_inicial: 20, metragem_atual: 12, data_entrada: '2026-10-07' }
        ]));
        localStorage.setItem('sc_mov', JSON.stringify([]));
        localStorage.removeItem('sc_imp_snap');
        if (p) localStorage.setItem('sc_imp_perfis', JSON.stringify(p));
        else localStorage.removeItem('sc_imp_perfis');
    }, perfis || null);
    await page.reload();
}

const cabecalhos = (page, sel) => page.$$eval(sel + ' thead th', ths =>
    ths.map(t => t.textContent.replace(/[⇅▲▼]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean));

// --- 1. A escolha entre estoque ajustavel e infinito ------------------------

async function escolherEEntrar(page, ordem) {
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(COLADO);
    if (ordem === 'card-primeiro') {
        await page.click('input[name="imp-cfg-estoque"][value="ajustar"]');
        await page.selectOption('#imp-fornecedor', '7');
    } else {
        await page.selectOption('#imp-fornecedor', '7');
        await page.click('input[name="imp-cfg-estoque"][value="ajustar"]');
    }
}

for (const ordem of ['card-primeiro', 'fornecedor-primeiro']) {
    test('escolher ajustar estoque vale, mesmo com o perfil do fornecedor dizendo infinito (' + ordem + ')', async ({ page }) => {
        await semear(page, 'catalogo.html', PERFIL_INFINITO);
        await escolherEEntrar(page, ordem);

        const marcado = await page.evaluate(() =>
            document.querySelector('input[name="imp-cfg-estoque"]:checked')?.value);
        expect(marcado, 'o card escolhido continua marcado na tela').toBe('ajustar');

        await page.click('#imp-corpo button:has-text("Continuar")');
        const revisar = page.locator('#sc-modal-btns button:has-text("Revisar os passos")');
        if (await revisar.count()) await revisar.click();
        await page.click('#imp-corpo button:has-text("Continuar")');
        await page.click('#imp-corpo button:has-text("Continuar")');
        await page.waitForFunction(() => _impEstado.passo === 4);
        await page.click('#imp-corpo button:has-text("Gravar")');
        await page.click('#sc-modal-ok');
        await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 3);

        const novo = await page.evaluate(() => db.catalogo.find(c => c.referencia === '7001'));
        expect(novo, 'o tecido foi gravado').toBeTruthy();
        expect(novo.estoque_infinito, 'quem escolheu ajustar nao pode receber estoque infinito').toBeFalsy();
        const lotes = await page.evaluate(() => db.estoque.map(r => r.lote));
        expect(lotes, 'nem rolo infinito').not.toContain('ESTOQUE INFINITO');
    });
}

// --- 2. Unidade de medida ---------------------------------------------------

test('o material tem unidade selecionavel, com as cinco pedidas', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const opcoes = await page.$$eval('#mat-unidade option', o => o.map(x => x.value));
    for (const u of ['un', 'm', 'cm', 'cj', 'pct']) expect(opcoes, 'falta ' + u).toContain(u);
});

test('a importacao oferece Unidade como funcao de coluna', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill('CODIGO\tNOME\tUNIDADE\tPRECO\nTR-02\tTRILHO B\tpct\t30,00');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '50');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    const valores = await page.$$eval('#imp-corpo select', s =>
        s.flatMap(x => [...x.options].map(o => o.value)));
    expect(valores, 'Unidade precisa estar na lista de funcoes').toContain('unidade');
});

test('o Estoque mostra a unidade de tecidos, materiais e kits', async ({ page }) => {
    await semear(page, 'estoque.html');
    expect(await cabecalhos(page, '#tabela-est-tecidos')).toContain('Unidade');
    const linhaTec = (await page.locator('.est-tec-linha').first().innerText()).replace(/\s+/g, ' ');
    expect(linhaTec, 'tecido e sempre em metro').toContain('m');

    await page.click('.tab-btn:has-text("Materiais")');
    const mat = (await page.locator('#tb-estoque-mat tr').first().innerText()).replace(/\s+/g, ' ');
    expect(mat).toContain('pct');

    await page.click('.tab-btn:has-text("Kits")');
    expect(await cabecalhos(page, '#tabela-kits')).toContain('Unidade');
    const kit = (await page.locator('#tb-kits tr').first().innerText()).replace(/\s+/g, ' ');
    expect(kit, 'kit e sempre em unidade').toContain('un');
});

test('a consulta de estoque tem a coluna de unidade', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('.tab-btn:has-text("Consulta")');
    const cab = (await page.locator('.consulta-cab').innerText()).replace(/\s+/g, ' ');
    expect(cab.toUpperCase()).toContain('UNIDADE');
    const linhas = await page.locator('.consulta-linha').allInnerTexts();
    expect(linhas.join(' ')).toContain('pct');
    expect(await page.locator('.consulta-un').count(), 'uma unidade por item').toBe(linhas.length);
});

test('o kit pronto do Catalogo NAO ganhou coluna de unidade', async ({ page }) => {
    // o pedido foi explicito: so o modulo Estoque muda
    await semear(page, 'catalogo.html');
    expect(await cabecalhos(page, '#tabela-kits')).not.toContain('Unidade');
});

// --- 3. As colunas do Estoque seguem as do Catalogo -------------------------

test('Estoque e Catalogo tem as mesmas colunas, na mesma ordem', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const semAcao = c => c.filter(x => x !== 'Ação' && x !== 'Ações');
    const catTec = semAcao(await cabecalhos(page, '#tabela-tecidos'));
    await page.click('.tab-btn:has-text("Materiais")');
    const catMat = semAcao(await cabecalhos(page, '#tabela-materiais'));
    await page.click('.tab-btn:has-text("Kits")');
    const catKit = semAcao(await cabecalhos(page, '#tabela-kits'));

    await semear(page, 'estoque.html');
    const estTec = (await cabecalhos(page, '#tabela-est-tecidos')).filter(x => x !== 'Rolos' && x !== 'Unidade');
    await page.click('.tab-btn:has-text("Materiais")');
    const estMat = semAcao((await cabecalhos(page, '#tabela-est-materiais')));
    await page.click('.tab-btn:has-text("Kits")');
    const estKit = semAcao(await cabecalhos(page, '#tabela-kits')).filter(x => x !== 'Unidade');

    expect(estTec).toEqual(catTec);
    expect(estMat).toEqual(catMat);
    expect(estKit).toEqual(catKit);
});

// --- 4. Tecidos em uma linha so, com os rolos em um clique ------------------

test('cada tecido ocupa uma linha, com tudo nela', async ({ page }) => {
    await semear(page, 'estoque.html');
    expect(await page.locator('.est-tec-linha').count(), 'uma linha por tecido').toBe(2);
    expect(await page.locator('#tb-estoque .est-rolos-tabela').count(), 'nada de rolos soltos embaixo').toBe(0);

    const linha = (await page.locator('.est-tec-linha').first().innerText()).replace(/\s+/g, ' ');
    expect(linha).toContain('0001');
    expect(linha).toContain('TRICÔ HERA');
    expect(linha).toContain('1.40 m');
    expect(linha, 'o saldo somado dos dois rolos').toContain('37.00');
    expect(linha).toContain('167.30');
    expect(linha).toContain('RC Tecidos');
});

test('clicar no tecido abre os rolos, com Baixar e Remover; clicar de novo fecha', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.locator('.est-tec-linha', { hasText: 'TRICÔ HERA' }).click();

    const rolos = page.locator('#tb-estoque .est-rolos-tabela');
    await expect(rolos).toHaveCount(1);
    const t = (await rolos.innerText()).replace(/\s+/g, ' ');
    expect(t).toContain('L-01');
    expect(t).toContain('L-02');
    expect(await rolos.locator('button:has-text("Baixar")').count()).toBe(2);

    // so um tecido aberto por vez
    await page.locator('.est-tec-linha', { hasText: 'LINHO BELGA' }).click();
    expect(await page.locator('#tb-estoque .est-rolos-tabela').count(), 'LINHO BELGA nao tem rolo').toBe(0);

    await page.locator('.est-tec-linha', { hasText: 'TRICÔ HERA' }).click();
    await expect(page.locator('#tb-estoque .est-rolos-tabela')).toHaveCount(1);
    await page.locator('.est-tec-linha', { hasText: 'TRICÔ HERA' }).click();
    await expect(page.locator('#tb-estoque .est-rolos-tabela')).toHaveCount(0);
});

test('a baixa de um rolo continua funcionando de dentro da linha aberta', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.locator('.est-tec-linha', { hasText: 'TRICÔ HERA' }).click();
    await page.click('#tb-estoque button:has-text("Baixar")');
    await page.fill('#baixa-qtd-1', '5');
    await page.click('#tb-estoque button:has-text("Confirmar Baixa")');
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => db.estoque.find(r => r.lote === 'L-01').metragem_atual)).toBeCloseTo(20, 3);
});

// --- 5. Historico, Estoque Futuro e Backup no menu dos tres pontos ----------

test('as tres abas sairam da barra e moraram no menu', async ({ page }) => {
    await semear(page, 'estoque.html');
    const abas = (await page.locator('.tab-nav .tab-btn').allInnerTexts()).join(' ');
    expect(abas).toContain('Tecidos');
    expect(abas).toContain('Consulta');
    for (const fora of ['Histórico', 'Estoque Futuro', 'Backup']) {
        expect(abas, fora + ' nao e mais aba').not.toContain(fora);
    }
    await expect(page.locator('#estoque-extras-menu')).toBeHidden();
});

test('o menu dos tres pontos abre as tres telas', async ({ page }) => {
    await semear(page, 'estoque.html');
    const btn = page.locator('#estoque-extras-btn > button');
    await expect(btn).toHaveText('⋯');

    const telas = [['Histórico', 'tab-historico'], ['Estoque Futuro', 'tab-futuro'], ['Backup', 'tab-backup']];
    for (const [rotulo, painel] of telas) {
        await btn.click();
        await expect(page.locator('#estoque-extras-menu')).toBeVisible();
        await page.locator('#estoque-extras-menu button:has-text("' + rotulo + '")').click();
        expect(await page.evaluate(() => document.querySelector('.tab-panel.active')?.id), rotulo).toBe(painel);
        await expect(page.locator('#estoque-extras-menu'), 'o menu fecha ao escolher').toBeHidden();
    }
});

test('o menu so existe no Estoque, e fecha ao clicar fora', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('#estoque-extras-btn > button');
    await expect(page.locator('#estoque-extras-menu')).toBeVisible();
    await page.click('body', { position: { x: 5, y: 400 } });
    await expect(page.locator('#estoque-extras-menu')).toBeHidden();

    await page.goto(BASE + '/catalogo.html');
    expect(await page.locator('#estoque-extras-btn').count(), 'o Catalogo nao tem essas telas').toBe(0);
});
