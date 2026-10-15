// A edicao precisa dizer a verdade sobre o controle de estoque do item e
// conseguir troca-lo. Antes disto, abrir um tecido infinito mostrava
// "Ajustar estoque" marcado e salvar nao mudava nada: o item ficava infinito
// para sempre, sem nenhum lugar no sistema para corrigi-lo.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function semear(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', '[]');
        localStorage.setItem('sc_cat', JSON.stringify([
            { id: 1, referencia: 'INF-01', nome: 'TECIDO INFINITO',  preco: 90, preco_custo: 50, largura_rolo: 2.8, min_estoque: 0, estoque_infinito: true },
            { id: 3, referencia: 'AJU-01', nome: 'TECIDO AJUSTAVEL', preco: 70, preco_custo: 40, largura_rolo: 2.8, min_estoque: 0, estoque_infinito: false }
        ]));
        localStorage.setItem('sc_est', JSON.stringify([
            { id: 2, tecido_id: 1, lote: 'ESTOQUE INFINITO', metragem_inicial: 99999, metragem_atual: 99999, data_entrada: '2026-10-01' }
        ]));
        localStorage.setItem('sc_mat', JSON.stringify([
            { id: 11, referencia: 'M-01', nome: 'TRILHO INF', unidade: 'un', preco: 40, preco_custo: 25, min_estoque: 0, estoque_atual: 0, estoque_infinito: true }
        ]));
        localStorage.setItem('sc_kits', '[]');
        localStorage.setItem('sc_mov', '[]');
    });
    await page.reload();
}

const editarTecido = (page, nome) =>
    page.locator('#tabela-tecidos tbody tr', { hasText: nome }).locator('button:has-text("✏️")').click();

async function fecharAviso(page) {
    const ok = page.locator('#sc-modal-ok');
    if (await ok.count()) await ok.click();
    await page.waitForTimeout(200);
}

// --- A tela diz a verdade --------------------------------------------------

test('abrir a edicao de um tecido infinito marca "Estoque infinito"', async ({ page }) => {
    await semear(page);
    await editarTecido(page, 'TECIDO INFINITO');
    expect(await page.evaluate(() =>
        document.querySelector('input[name="cat-cfg-estoque"]:checked')?.value)).toBe('infinito');
});

test('abrir a edicao de um tecido controlado marca "Ajustar estoque"', async ({ page }) => {
    await semear(page);
    await editarTecido(page, 'TECIDO AJUSTAVEL');
    expect(await page.evaluate(() =>
        document.querySelector('input[name="cat-cfg-estoque"]:checked')?.value)).toBe('ajustar');
});

test('na edicao so aparecem os cartoes de estoque', async ({ page }) => {
    await semear(page);
    await editarTecido(page, 'TECIDO INFINITO');
    const titulos = await page.locator('#cat-cfg .imp-cfg-titulo').allInnerTexts();
    // a margem nao manda na edicao: o preco de venda e digitado no campo
    expect(titulos).toEqual(['Estoque infinito', 'Ajustar estoque']);
    expect(await page.locator('#cat-markup').count()).toBe(0);
});

test('o cadastro novo continua com os quatro cartoes', async ({ page }) => {
    await semear(page);
    expect(await page.locator('#cat-cfg .imp-cfg-card').count()).toBe(4);
});

// --- Trocar o modo ---------------------------------------------------------

test('tecido infinito vira controlado, avisando, e o saldo de fachada some', async ({ page }) => {
    await semear(page);
    await editarTecido(page, 'TECIDO INFINITO');
    await page.click('input[name="cat-cfg-estoque"][value="ajustar"]');
    await page.click('button:has-text("Atualizar Tecido")');

    const aviso = (await page.locator('.sc-modal-msg').innerText()).replace(/\s+/g, ' ');
    expect(aviso).toContain('estoque controlado');
    expect(aviso, 'o usuario precisa saber que o saldo vai a zero').toContain('zerado');
    await page.click('#sc-modal-btns button:has-text("Zerar e controlar")');
    await page.waitForTimeout(500);
    await fecharAviso(page);

    const r = await page.evaluate(() => ({
        inf: db.catalogo.find(c => c.referencia === 'INF-01').estoque_infinito,
        lotes: db.estoque.map(x => x.lote)
    }));
    expect(r.inf).toBe(false);
    expect(r.lotes, 'o rolo de 99999 m nao pode virar estoque de verdade').not.toContain('ESTOQUE INFINITO');
});

test('cancelar o aviso nao muda nada', async ({ page }) => {
    await semear(page);
    await editarTecido(page, 'TECIDO INFINITO');
    await page.click('input[name="cat-cfg-estoque"][value="ajustar"]');
    await page.click('button:has-text("Atualizar Tecido")');
    await page.click('#sc-modal-btns button:has-text("Cancelar")');
    await page.waitForTimeout(400);

    const r = await page.evaluate(() => ({
        inf: db.catalogo.find(c => c.referencia === 'INF-01').estoque_infinito,
        lotes: db.estoque.map(x => x.lote)
    }));
    expect(r.inf).toBe(true);
    expect(r.lotes).toContain('ESTOQUE INFINITO');
});

test('tecido controlado vira infinito e ganha o saldo', async ({ page }) => {
    await semear(page);
    await editarTecido(page, 'TECIDO AJUSTAVEL');
    await page.click('input[name="cat-cfg-estoque"][value="infinito"]');
    await page.click('button:has-text("Atualizar Tecido")');
    await page.waitForTimeout(500);
    await fecharAviso(page);

    const r = await page.evaluate(() => {
        const c = db.catalogo.find(x => x.referencia === 'AJU-01');
        return { inf: c.estoque_infinito, rolos: db.estoque.filter(x => x.tecido_id === c.id).map(x => x.lote) };
    });
    expect(r.inf).toBe(true);
    expect(r.rolos).toEqual(['ESTOQUE INFINITO']);
});

test('editar sem mexer no cartao preserva o modo do item', async ({ page }) => {
    await semear(page);
    await editarTecido(page, 'TECIDO INFINITO');
    await page.fill('#cat-nome', 'TECIDO INFINITO EDITADO');
    await page.click('button:has-text("Atualizar Tecido")');
    await page.waitForTimeout(500);
    await fecharAviso(page);

    const c = await page.evaluate(() => db.catalogo.find(x => x.referencia === 'INF-01'));
    expect(c.nome).toBe('TECIDO INFINITO EDITADO');
    expect(c.estoque_infinito, 'quem nao mexeu no cartao nao quis trocar o modo').toBe(true);
});

test('material infinito tambem volta a ser controlado, zerando a quantidade', async ({ page }) => {
    await semear(page);
    await page.click('button[data-tab="cat-materiais"]');
    await page.locator('#tabela-materiais tbody tr', { hasText: 'TRILHO INF' }).locator('button:has-text("✏️")').click();
    expect(await page.evaluate(() =>
        document.querySelector('input[name="mat-cfg-estoque"]:checked')?.value)).toBe('infinito');

    await page.click('input[name="mat-cfg-estoque"][value="ajustar"]');
    await page.click('button:has-text("Atualizar Material")');
    await page.click('#sc-modal-btns button:has-text("Zerar e controlar")');
    await page.waitForTimeout(500);
    await fecharAviso(page);

    const m = await page.evaluate(() => db.materiais.find(x => x.referencia === 'M-01'));
    expect(m.estoque_infinito).toBe(false);
    expect(m.estoque_atual).toBe(0);
});

// --- Em estoque zerado, nao tracejado --------------------------------------

test('sem rolo, a coluna Em estoque mostra zero, nao traco', async ({ page }) => {
    await semear(page);
    const linha = (await page.locator('#tabela-tecidos tbody tr', { hasText: 'TECIDO AJUSTAVEL' }).innerText()).replace(/\s+/g, ' ');
    expect(linha, 'zero e um saldo; traco se confunde com "sem controle"').toContain('0.00 m');
    expect(linha).not.toContain('∞');

    await page.goto(BASE + '/estoque.html');
    const est = (await page.locator('.est-tec-linha', { hasText: 'TECIDO AJUSTAVEL' }).innerText()).replace(/\s+/g, ' ');
    expect(est).toContain('0.00 m');
});

test('o item infinito continua com o simbolo, nao com zero', async ({ page }) => {
    await semear(page);
    const linha = (await page.locator('#tabela-tecidos tbody tr', { hasText: 'TECIDO INFINITO' }).innerText()).replace(/\s+/g, ' ');
    expect(linha).toContain('∞');
});
