const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const COLADO = 'CODIGO\tNOME\tLARGURA\tPRECO\n7001\tTECIDO INFINITO\t2,80\t50,00';

async function abrirCatalogo(page, perfis) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(p => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify([]));
        localStorage.setItem('sc_kits', JSON.stringify([]));
        localStorage.setItem('sc_est', JSON.stringify([]));
        localStorage.setItem('sc_mov', JSON.stringify([]));
        localStorage.removeItem('sc_imp_snap');
        if (p) localStorage.setItem('sc_imp_perfis', JSON.stringify(p));
        else localStorage.removeItem('sc_imp_perfis');
    }, perfis || null);
    await page.reload();
}

const PERFIL_INFINITO = [{
    id: 1, nome: 'RC Tecidos', fornecedor_id: 7, abas: {}, layouts: [], cores: {},
    markup_padrao: 80, margem_modo: 'total', estoque_modo: 'infinito'
}];

async function importar(page, estoque) {
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '50');
    if (estoque) await page.click(`input[name="imp-cfg-estoque"][value="${estoque}"]`);
    await page.click('#imp-corpo button:has-text("Continuar")');
    // Fornecedor com perfil salvo pergunta se quer pular para a conferência.
    // Aqui queremos passar pelos passos, para exercitar as escolhas.
    const revisar = page.locator('#sc-modal-btns button:has-text("Revisar os passos")');
    if (await revisar.count()) await revisar.click();
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
}

async function gravar(page) {
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 1);
}

// ─── O perfil do fornecedor não manda mais na escolha ───────────────────

test('escolher "ajustar estoque" vale, mesmo com perfil salvo como infinito', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirCatalogo(page, PERFIL_INFINITO);
    await importar(page, 'ajustar');

    expect(await page.evaluate(() => _impEstado.estoqueModo),
        'a escolha do usuário não pode ser desfeita pelo perfil').toBe('ajustar');

    await gravar(page);
    expect(await page.evaluate(() => db.catalogo[0].estoque_infinito)).toBe(false);
    expect(await page.evaluate(() => db.estoque.length), 'sem rolo automático').toBe(0);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('o perfil aparece nos cartoes ao escolher o fornecedor, nao escondido', async ({ page }) => {
    await abrirCatalogo(page, PERFIL_INFINITO);
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(COLADO);

    // antes de escolher o fornecedor, o padrão é ajustar
    await expect(page.locator('input[name="imp-cfg-estoque"][value="ajustar"]')).toBeChecked();

    await page.selectOption('#imp-fornecedor', '7');
    await expect(page.locator('input[name="imp-cfg-estoque"][value="infinito"]'),
        'o que o fornecedor usou da última vez fica visível no cartão').toBeChecked();
    await expect(page.locator('#imp-markup')).toHaveValue('80');
});

test('a margem do perfil tambem nao apaga a que foi digitada', async ({ page }) => {
    await abrirCatalogo(page, PERFIL_INFINITO);
    await page.click('text=📥 Importar tabela');
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '25');
    await page.click('#imp-corpo button:has-text("Continuar")');
    expect(await page.evaluate(() => _impEstado.markupPadrao)).toBe(25);
});

// ─── Tecido infinito já entra no estoque ────────────────────────────────

test('tecido infinito ganha um rolo e aparece na aba Estoque', async ({ page }) => {
    await abrirCatalogo(page);
    await importar(page, 'infinito');
    await gravar(page);

    const rolos = await page.evaluate(() => db.estoque.map(r => ({
        lote: r.lote, inicial: r.metragem_inicial, atual: r.metragem_atual, tec: r.tecido_id
    })));
    expect(rolos.length).toBe(1);
    expect(rolos[0].lote).toBe('ESTOQUE INFINITO');
    expect(rolos[0].inicial).toBe(99999);

    await page.goto(BASE + '/estoque.html');
    const linhas = await page.evaluate(() =>
        [...document.querySelectorAll('#tb-estoque tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()));
    expect(linhas.some(l => l.includes('TECIDO INFINITO')), 'o tecido aparece na lista').toBe(true);
    expect(linhas.join(' '), 'o número interno nunca aparece na tela').not.toContain('99999');
    expect(linhas.join(' ')).toContain('∞');

    // os rolos abrem ao clicar na linha do tecido
    await page.locator('.est-tec-linha', { hasText: 'TECIDO INFINITO' }).first().click();
    const aberto = (await page.locator('#tb-estoque').innerText()).replace(/\s+/g, ' ');
    expect(aberto).toContain('sem controle de estoque');
    expect(aberto, 'o número interno nunca aparece na tela').not.toContain('99999');
});

test('o rolo infinito nao oferece baixa', async ({ page }) => {
    await abrirCatalogo(page);
    await importar(page, 'infinito');
    await gravar(page);
    await page.goto(BASE + '/estoque.html');

    await page.locator('.est-tec-linha', { hasText: 'TECIDO INFINITO' }).first().click();
    expect(await page.locator('#tb-estoque .est-rolos-tabela').count(), 'o rolo está à vista').toBe(1);
    expect(await page.locator('#tb-estoque button:has-text("Baixar")').count(),
        'não há o que baixar de um item sem controle de estoque').toBe(0);
    expect(await page.locator('#tb-estoque .baixa-form').count(),
        'nem o formulário escondido, que mostraria o número').toBe(0);
});

test('a entrada do tecido infinito fica registrada no historico', async ({ page }) => {
    await abrirCatalogo(page);
    await importar(page, 'infinito');
    await gravar(page);

    const mov = await page.evaluate(() => db.movimentos.find(m => m.item_tipo === 'tecido'));
    expect(mov.tipo).toBe('Entrada');
    expect(mov.item_nome).toBe('TECIDO INFINITO');
    expect(mov.referencia).toContain('estoque infinito');
});

test('o rolo infinito nao e consumido ao vender', async ({ page }) => {
    await abrirCatalogo(page);
    await importar(page, 'infinito');
    await gravar(page);

    const saldo = await page.evaluate(() => {
        const tec = db.catalogo[0];
        realizarBaixaTecidos({ id: 950, ambientes: [{ nome: 'Sala', tecidos: [
            { tecidoId: tec.id, tecidoNome: tec.nome, consumo_linear: 120 }] }] });
        return db.estoque[0].metragem_atual;
    });
    expect(saldo, 'a metragem fica parada: a baixa pula item infinito').toBe(99999);
});

test('desfazer a importacao tira o rolo junto, sem deixar rolo orfao', async ({ page }) => {
    await abrirCatalogo(page);
    await importar(page, 'infinito');
    await gravar(page);
    expect(await page.evaluate(() => db.estoque.length)).toBe(1);

    await page.click('#btn-desfazer-import');
    await page.click('#sc-modal-btns button:has-text("Desfazer")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 0);

    expect(await page.evaluate(() => db.estoque.length),
        'rolo sem tecido seria lixo no estoque').toBe(0);
});

test('importar com ajustar estoque nao cria rolo nenhum', async ({ page }) => {
    await abrirCatalogo(page);
    await importar(page, 'ajustar');
    await gravar(page);

    expect(await page.evaluate(() => db.estoque.length)).toBe(0);
    await page.goto(BASE + '/estoque.html');
    const lista = await page.locator('#tb-estoque').innerText();
    expect(lista, 'o tecido aparece, mas sem rolo nenhum').toContain('sem rolo');
    expect(await page.locator('#tb-estoque .est-rolos-tabela').count()).toBe(0);
});

test('tecido que ja tem rolo nao ganha outro', async ({ page }) => {
    await abrirCatalogo(page);
    await importar(page, 'infinito');
    await gravar(page);
    expect(await page.evaluate(() => db.estoque.length)).toBe(1);

    // importa de novo o mesmo código: atualiza o tecido, não duplica o rolo
    await page.evaluate(() => { localStorage.removeItem('sc_imp_snap'); });
    await importar(page, 'infinito');
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 1);

    expect(await page.evaluate(() => db.estoque.length), 'um rolo só').toBe(1);
});
