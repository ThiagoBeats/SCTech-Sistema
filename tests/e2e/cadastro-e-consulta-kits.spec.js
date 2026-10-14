const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const KITS = [
    { id: 300, tipo: 'pronto', referencia: '5501', nome: 'KIT TRILHO PRONTO', medida: '1,00 a 1,50 m',
      preco: 189, preco_custo: 126, estoque_atual: 4, estoque_infinito: false, fornecedor_nome: 'RC Tecidos', itens: [] },
    { id: 301, tipo: 'pronto', referencia: '5502', nome: 'KIT INFINITO',
      preco: 99, preco_custo: 60, estoque_atual: 0, estoque_infinito: true, itens: [] },
    { id: 302, referencia: 'KIT-SALA', nome: 'Kit Cortina Sala',
      itens: [{ materialId: 11, nome: 'TRILHO', unidade: 'm', quantidade: 3 }] }
];

async function abrir(page, pagina, extras) {
    await entrar(page, BASE);
    await page.goto(BASE + '/' + pagina);
    await page.evaluate(d => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify(d.cat || []));
        localStorage.setItem('sc_mat', JSON.stringify(d.mat || []));
        localStorage.setItem('sc_kits', JSON.stringify(d.kits || []));
        localStorage.setItem('sc_est', JSON.stringify(d.est || []));
        localStorage.setItem('sc_mov', JSON.stringify(d.mov || []));
    }, extras || {});
    await page.reload();
}

const SEMENTE = {
    cat: [{ id: 1, referencia: '0001', nome: 'TRICÔ HERA', preco: 167.3, preco_custo: 92.9,
            largura_rolo: 1.4, min_estoque: 10, fornecedor_nome: 'RC Tecidos' }],
    mat: [{ id: 11, referencia: 'TR-01', nome: 'TRILHO', unidade: 'm', preco: 48, preco_custo: 30,
            min_estoque: 20, estoque_atual: 25, fornecedor_nome: 'RC Tecidos' }],
    kits: KITS,
    est: [{ id: 1, tecido_id: 1, lote: 'L1', metragem_inicial: 30, metragem_atual: 25, data_entrada: '2026-10-05' }]
};

function linhas(page) {
    return page.evaluate(() => [...document.querySelectorAll('.consulta-linha')]
        .map(l => l.textContent.replace(/\s+/g, ' ').trim()));
}

// ═══ Consulta de Estoque: kits ═══════════════════════════════════════════

test('o filtro Tipo oferece Kits ao lado de Tecidos e Materiais', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');
    const opcoes = await page.locator('#consulta-tipo option').allInnerTexts();
    expect(opcoes).toEqual(['Todos', 'Tecidos', 'Materiais', 'Kits']);
    expect(erros, erros.join('\n')).toEqual([]);
});

test('"Todos" inclui tecidos, materiais e kits', async ({ page }) => {
    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');
    const texto = (await linhas(page)).join(' | ');
    expect(texto).toContain('TRICÔ HERA');
    expect(texto).toContain('TRILHO');
    expect(texto).toContain('KIT TRILHO PRONTO');
});

test('"Kits" mostra so os kits reais cadastrados', async ({ page }) => {
    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');
    await page.selectOption('#consulta-tipo', 'kit');

    const l = await linhas(page);
    expect(l.length, 'os três kits da semente, nada inventado').toBe(3);
    expect(l.join(' ')).not.toContain('TRICÔ HERA');
    expect(l.join(' ')).not.toContain('TRILHO SUÍÇO');
});

test('o estoque do kit respeita controlado, infinito e montagem', async ({ page }) => {
    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');
    await page.selectOption('#consulta-tipo', 'kit');
    const l = await linhas(page);

    const pronto = l.find(x => x.includes('KIT TRILHO PRONTO'));
    expect(pronto, 'saldo real do kit controlado').toContain('4,00 un');
    expect(pronto).toContain('R$ 189,00');

    const infinito = l.find(x => x.includes('KIT INFINITO'));
    expect(infinito, 'infinito usa o mesmo símbolo do resto do sistema').toContain('∞');

    const montagem = l.find(x => x.includes('Kit Cortina Sala'));
    expect(montagem, 'kit de montagem não tem preço nem saldo próprios').toContain('—');
});

test('os filtros de codigo e nome funcionam para kits', async ({ page }) => {
    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');

    await page.fill('#consulta-codigo', '5502');
    expect((await linhas(page)).length).toBe(1);
    expect((await linhas(page))[0]).toContain('KIT INFINITO');

    await page.fill('#consulta-codigo', '');
    await page.fill('#consulta-busca', 'Cortina Sala');
    expect((await linhas(page)).length).toBe(1);
    expect((await linhas(page))[0]).toContain('Kit Cortina Sala');
});

test('sem data de entrada, o kit mostra traco em vez de data inventada', async ({ page }) => {
    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');
    await page.selectOption('#consulta-tipo', 'kit');
    const l = await linhas(page);
    expect(l.find(x => x.includes('KIT INFINITO'))).toContain('—');
});

// ═══ Painel expandido sem preço de custo ═════════════════════════════════

test('o painel expandido nao mostra preco de custo, em nenhum tipo', async ({ page }) => {
    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');

    for (const nome of ['TRICÔ HERA', 'TRILHO', 'KIT TRILHO PRONTO']) {
        await page.locator('.consulta-linha', { hasText: nome }).first().click();
        const painel = await page.locator('.consulta-detalhe').innerText();
        expect(painel.toLowerCase(), `custo não pode aparecer em ${nome}`).not.toContain('custo');
        await page.locator('.consulta-linha', { hasText: nome }).first().click();
    }
});

test('os demais cards do painel continuam, e a expansao recolhe', async ({ page }) => {
    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');

    const linha = page.locator('.consulta-linha', { hasText: 'TRICÔ HERA' }).first();
    await linha.click();
    const painel = await page.locator('.consulta-detalhe').innerText();
    expect(painel).toContain('FORNECEDOR');
    expect(painel).toContain('ESTOQUE MÍNIMO');
    expect(painel).toContain('LARGURA DO ROLO');
    expect(painel, 'a tabela de rolos segue lá').toContain('L1');

    await linha.click();
    expect(await page.locator('.consulta-detalhe').count(), 'clicar de novo recolhe').toBe(0);
});

test('o painel do kit mostra tipo, medida e composicao', async ({ page }) => {
    await abrir(page, 'estoque.html', SEMENTE);
    await page.click('button[data-tab="consulta"]');

    await page.locator('.consulta-linha', { hasText: 'KIT TRILHO PRONTO' }).first().click();
    let painel = await page.locator('.consulta-detalhe').innerText();
    expect(painel).toContain('Kit pronto');
    expect(painel).toContain('1,00 a 1,50 m');
    await page.locator('.consulta-linha', { hasText: 'KIT TRILHO PRONTO' }).first().click();

    await page.locator('.consulta-linha', { hasText: 'Kit Cortina Sala' }).first().click();
    painel = await page.locator('.consulta-detalhe').innerText();
    expect(painel).toContain('Kit de montagem');
    expect(painel).toContain('TRILHO: 3 m');
});

// ═══ Cadastro: os quatro cartões nas três abas ═══════════════════════════

const TITULOS = ['Definir margem total', 'Definir margem depois', 'Estoque infinito', 'Ajustar estoque'];

for (const [aba, alvo] of [['cat-tecidos', '#cat-cfg'], ['cat-materiais', '#mat-cfg'], ['cat-kits', '#kp-cfg']]) {
    test(`a aba ${aba} tem os quatro cartoes, com as mesmas escritas`, async ({ page }) => {
        await abrir(page, 'catalogo.html', {});
        await page.click(`button[data-tab="${aba}"]`);
        const titulos = await page.locator(`${alvo} .imp-cfg-titulo`).allInnerTexts();
        expect(titulos).toEqual(TITULOS);
    });
}

// ═══ Cadastro de tecido ══════════════════════════════════════════════════

async function cadastrarTecido(page, dados) {
    await abrir(page, 'catalogo.html', {});
    await page.fill('#cat-ref', dados.ref);
    await page.fill('#cat-nome', dados.nome);
    await page.fill('#cat-largura', '1.40');
    await page.fill('#cat-min', '10');
    if (dados.qtd !== undefined) await page.fill('#cat-qtd', String(dados.qtd));
    await page.fill('#cat-custo', String(dados.custo));
    if (dados.peca !== undefined) await page.fill('#cat-custo-peca', String(dados.peca));
    if (dados.estoque) await page.click(`input[name="cat-cfg-estoque"][value="${dados.estoque}"]`);
    if (dados.margem === 'item') await page.click('input[name="cat-cfg-margem"][value="item"]');
    else await page.fill('#cat-markup', String(dados.markup ?? 80));
    await page.click('button:has-text("Salvar no Catálogo")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 1);
}

test('tecido cadastrado grava custo, venda pela margem e custo de peca cru', async ({ page }) => {
    await cadastrarTecido(page, { ref: '0001', nome: 'TRICÔ HERA', qtd: 30, custo: 92.90, peca: 95.98, markup: 80 });

    const c = await page.evaluate(() => db.catalogo[0]);
    expect(c.preco_custo).toBe(92.9);
    expect(c.preco, '92,90 × 1,80').toBe(167.22);
    expect(c.preco_peca, 'o custo de peça não recebe margem').toBe(95.98);
    expect(c.estoque_infinito).toBe(false);
});

test('a quantidade de entrada vira um rolo com o codigo como lote', async ({ page }) => {
    await cadastrarTecido(page, { ref: '0001', nome: 'TRICÔ HERA', qtd: 30, custo: 92.90, markup: 80 });

    const rolos = await page.evaluate(() => db.estoque.map(r => ({ lote: r.lote, m: r.metragem_atual })));
    expect(rolos).toEqual([{ lote: '0001', m: 30 }]);
    const mov = await page.evaluate(() => db.movimentos.find(m => m.item_tipo === 'tecido'));
    expect(mov.tipo).toBe('Entrada');
    expect(mov.quantidade).toBe(30);
});

test('sem quantidade, o tecido entra sem rolo nenhum', async ({ page }) => {
    await cadastrarTecido(page, { ref: '0002', nome: 'SEM ENTRADA', custo: 50, markup: 80 });
    expect(await page.evaluate(() => db.estoque.length)).toBe(0);
});

test('tecido marcado como infinito ganha o rolo e a marca', async ({ page }) => {
    await cadastrarTecido(page, { ref: '0003', nome: 'INFINITO', custo: 50, markup: 80, estoque: 'infinito' });

    const r = await page.evaluate(() => ({
        inf: db.catalogo[0].estoque_infinito,
        rolo: db.estoque[0] ? db.estoque[0].lote : null
    }));
    expect(r.inf).toBe(true);
    expect(r.rolo, 'senão o tecido não apareceria na aba Estoque').toBe('ESTOQUE INFINITO');
});

test('"margem depois" deixa a venda igual ao custo', async ({ page }) => {
    await cadastrarTecido(page, { ref: '0004', nome: 'SEM MARGEM', custo: 50, margem: 'item' });
    const c = await page.evaluate(() => db.catalogo[0]);
    expect(c.preco_custo).toBe(50);
    expect(c.preco).toBe(50);
});

test('margem total em branco barra o cadastro do tecido', async ({ page }) => {
    await abrir(page, 'catalogo.html', {});
    await page.fill('#cat-ref', '0005');
    await page.fill('#cat-nome', 'SEM MARGEM INFORMADA');
    await page.fill('#cat-custo', '50');
    await page.click('button:has-text("Salvar no Catálogo")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Informe a margem total');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => db.catalogo.length)).toBe(0);
});

// ═══ Cadastro de material ════════════════════════════════════════════════

test('as sete unidades continuam disponiveis', async ({ page }) => {
    await abrir(page, 'catalogo.html', {});
    await page.click('button[data-tab="cat-materiais"]');
    const uns = await page.locator('#mat-unidade option').evaluateAll(os => os.map(o => o.value));
    expect(uns).toEqual(['un', 'm', 'cm', 'kg', 'cj', 'cx', 'par']);
});

test('material grava quantidade e custo na unidade escolhida', async ({ page }) => {
    await abrir(page, 'catalogo.html', {});
    await page.click('button[data-tab="cat-materiais"]');
    await page.fill('#mat-ref', 'TR-01');
    await page.fill('#mat-nome', 'TRILHO SUÍÇO');
    await page.selectOption('#mat-unidade', 'm');
    await page.fill('#mat-min', '20');
    await page.fill('#mat-qtd', '50');
    await page.fill('#mat-custo', '30');
    await page.fill('#mat-markup', '60');
    await expect(page.locator('#mat-venda'), 'a venda aparece na unidade escolhida').toHaveText('R$ 48.00/m');
    await page.click('button:has-text("Cadastrar Material")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.materiais.length === 1);

    const m = await page.evaluate(() => db.materiais[0]);
    expect(m.unidade).toBe('m');
    expect(m.preco_custo).toBe(30);
    expect(m.preco, '30 × 1,60').toBe(48);
    expect(m.estoque_atual).toBe(50);
    expect(m.min_estoque).toBe(20);
});

test('material marcado como infinito entra com a marca', async ({ page }) => {
    await abrir(page, 'catalogo.html', {});
    await page.click('button[data-tab="cat-materiais"]');
    await page.fill('#mat-ref', 'PT-02');
    await page.fill('#mat-nome', 'PONTEIRA');
    await page.fill('#mat-custo', '5');
    await page.fill('#mat-markup', '50');
    await page.click('input[name="mat-cfg-estoque"][value="infinito"]');
    await page.click('button:has-text("Cadastrar Material")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.materiais.length === 1);
    expect(await page.evaluate(() => db.materiais[0].estoque_infinito)).toBe(true);
});

// ═══ Cadastro de kit ═════════════════════════════════════════════════════

test('o kit tem unidade un, quantidade de entrada e estoque minimo', async ({ page }) => {
    await abrir(page, 'catalogo.html', {});
    await page.click('button[data-tab="cat-kits"]');
    // É um input desabilitado: o valor não entra no textContent da aba.
    const unidade = page.locator('#tab-cat-kits input[disabled]');
    await expect(unidade).toHaveValue('un (unidade)');

    await page.fill('#kp-ref', '5501');
    await page.fill('#kp-nome', 'KIT TRILHO');
    await page.fill('#kp-qtd', '10');
    await page.fill('#kp-min', '2');
    await page.fill('#kp-custo', '126');
    await page.fill('#kp-markup', '50');
    await page.click('button:has-text("Salvar Kit Pronto")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);

    const k = await page.evaluate(() => db.kits[0]);
    expect(k.estoque_atual).toBe(10);
    expect(k.min_estoque).toBe(2);
    expect(k.preco, '126 × 1,50').toBe(189);
});

test('o kit continua sem campo manual de preco de venda', async ({ page }) => {
    await abrir(page, 'catalogo.html', {});
    await page.click('button[data-tab="cat-kits"]');
    // a venda existe, mas como valor calculado — não como campo preenchível
    expect(await page.locator('#kp-venda').evaluate(el => el.tagName)).toBe('DIV');
    expect(await page.locator('#tab-cat-kits input#kp-preco').count()).toBe(0);
});
