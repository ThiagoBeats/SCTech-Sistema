const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// ─── Importador: desmarcar linhas no passo 3 ────────────────────────────────

async function ateOPasso3(page, aba) {
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
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(nome => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas[nome] = 'tecido';
        _impRenderPasso(2);
    }, aba);
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('.imp-mapa-scroll')).toBeVisible();
}

test('desmarcar linhas no passo 3 tira elas da importacao', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await ateOPasso3(page, 'Book 10');

    const caixas = page.locator('.imp-mapa-tabela tbody input[type=checkbox]');
    expect(await caixas.count(), 'cada linha precisa de uma caixa').toBeGreaterThan(30);

    // todas marcadas por padrao
    expect(await page.locator('.imp-mapa-tabela tbody input[type=checkbox]:checked').count())
        .toBe(await caixas.count());

    // desmarca tres
    await caixas.nth(0).uncheck();
    await caixas.nth(1).uncheck();
    await caixas.nth(2).uncheck();

    // a linha fica visivel, riscada, e a contagem cai
    await expect(page.locator('.imp-mapa-tabela tbody tr.imp-linha-fora')).toHaveCount(3);
    const legenda = await page.locator('#imp-corpo p', { hasText: 'Dá' }).first().innerText();
    expect(legenda).toContain('35 item');
    expect(legenda).toContain('3 linha(s) desmarcada(s)');

    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const g = await page.evaluate(() => ({
        novos: _impEstado.grupos.novos.length,
        total: _IMP_GRUPOS.reduce((n, d) => n + _impEstado.grupos[d.chave].length, 0)
    }));
    expect(g.novos, 'as 3 desmarcadas saem da importacao de vez').toBe(35);
    expect(g.total).toBe(35);
});

test('a escolha de desmarcar sobrevive a ida e volta entre passos', async ({ page }) => {
    await ateOPasso3(page, 'Book 10');
    await page.locator('.imp-mapa-tabela tbody input[type=checkbox]').nth(0).uncheck();

    await page.click('#imp-corpo button:has-text("Voltar")');
    await page.click('#imp-corpo button:has-text("Continuar")');

    await expect(page.locator('.imp-mapa-tabela tbody tr.imp-linha-fora')).toHaveCount(1);
});

test('a caixa do cabecalho marca e desmarca a aba inteira', async ({ page }) => {
    await ateOPasso3(page, 'Book 10');
    const total = await page.locator('.imp-mapa-tabela tbody input[type=checkbox]').count();

    await page.locator('.imp-mapa-tabela thead input[type=checkbox]').first().uncheck();
    await expect(page.locator('.imp-mapa-tabela tbody tr.imp-linha-fora')).toHaveCount(total);

    await page.locator('.imp-mapa-tabela thead input[type=checkbox]').first().check();
    await expect(page.locator('.imp-mapa-tabela tbody tr.imp-linha-fora')).toHaveCount(0);
});

// ─── Importador: painel de mapeamentos incompletos ──────────────────────────

test('Continuar com mapeamento incompleto mostra painel clicavel, nao janela', async ({ page }) => {
    await ateOPasso3(page, 'Trilho Motorizado');   // aba sem cabecalho reconhecivel

    // nada de painel antes de tentar continuar
    expect(await page.locator('#imp-corpo').innerText()).not.toContain('Mapeamentos incompletos');

    await page.click('#imp-corpo button:has-text("Continuar")');

    // continua no passo 3, com o painel no topo
    expect(await page.evaluate(() => _impEstado.passo)).toBe(3);
    await expect(page.locator('#imp-corpo')).toContainText('Mapeamentos incompletos');
    await expect(page.locator('#imp-corpo')).toContainText('Trilho Motorizado');
    await expect(page.locator('#imp-corpo')).toContainText('Código');

    // clicar leva ate a tabela e destaca
    await page.locator('#imp-corpo div[onclick^="_impIrParaLayout"]').first().click();
    const destacado = await page.evaluate(() => {
        const el = document.querySelector('[id^="imp-layout-"].imp-linha-destaque');
        return el ? el.id : null;
    });
    expect(destacado, 'o bloco do layout deveria ter sido destacado').toBeTruthy();
});

test('resolver o mapeamento faz o painel sumir e deixa continuar', async ({ page }) => {
    await ateOPasso3(page, 'Trilho Motorizado');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Mapeamentos incompletos');

    // mapeia na mao o que falta
    await page.evaluate(() => {
        _impTrocarPapel(0, 0, 'codigo');
        _impTrocarPapel(0, 1, 'nome');
        _impTrocarPapel(0, 2, 'preco');
    });
    expect(await page.locator('#imp-corpo').innerText()).not.toContain('Mapeamentos incompletos');

    await page.click('#imp-corpo button:has-text("Continuar")');
    expect(await page.evaluate(() => _impEstado.passo)).toBe(4);
});

// ─── Estoque: entrada de rolo preenche o codigo ─────────────────────────────

async function abrirEstoque(page, extras) {
    await entrar(page, BASE);
    await page.goto(BASE + '/estoque.html');
    await page.evaluate(d => {
        localStorage.setItem('sc_cat', JSON.stringify(d.cat));
        localStorage.setItem('sc_est', JSON.stringify(d.est));
        localStorage.setItem('sc_mov', JSON.stringify(d.mov || []));
        localStorage.setItem('sc_mat', JSON.stringify([]));
    }, extras);
    await page.reload();
}

const TECIDOS = [
    { id: 1, referencia: '0001', nome: 'TRICÔ HERA', preco: 167.3, preco_custo: 92.94, largura_rolo: 1.4, min_estoque: 10, fornecedor_nome: 'RC', imagem: '' },
    { id: 2, referencia: '0002', nome: 'LINHO BELGA', preco: 65, preco_custo: 36.11, largura_rolo: 2.8, min_estoque: 50, fornecedor_nome: 'RC', imagem: '' }
];

test('escolher o tecido pelo nome preenche a referencia com o codigo', async ({ page }) => {
    await abrirEstoque(page, { cat: TECIDOS, est: [] });

    expect(await page.inputValue('#est-lote')).toBe('');
    // o dropdown virou campo de busca: escolher pela lista de sugestoes
    await page.fill('#est-tecido-busca', 'TRICÔ HERA');
    await page.locator('#est-tecido-sug .consulta-sug-item').first().click();

    expect(await page.inputValue('#est-lote'), 'o codigo do tecido deveria ter sido preenchido').toBe('0001');
    expect(await page.inputValue('#est-preco-custo')).toBe('92.94');
    expect(await page.inputValue('#est-markup')).toBe('80');
});

test('um banho de cor ja digitado nao e sobrescrito', async ({ page }) => {
    await abrirEstoque(page, { cat: TECIDOS, est: [] });
    await page.fill('#est-lote', 'BANHO-77');
    await page.fill('#est-tecido-busca', 'TRICÔ HERA');
    await page.locator('#est-tecido-sug .consulta-sug-item').first().click();
    expect(await page.inputValue('#est-lote'), 'o que o usuario digitou manda').toBe('BANHO-77');
});

// ─── Estoque: alerta só para tecido que já teve entrada ─────────────────────

test('tecido cadastrado e nunca comprado nao gera alerta', async ({ page }) => {
    // os dois estao abaixo do minimo, mas nenhum teve entrada
    await abrirEstoque(page, { cat: TECIDOS, est: [] });
    const caixa = page.locator('#alertas-ponto-pedido');
    await expect(caixa).toBeHidden();
});

test('tecido que ja teve entrada e esta abaixo do minimo gera alerta', async ({ page }) => {
    await abrirEstoque(page, {
        cat: TECIDOS,
        est: [{ id: 11, tecido_id: 2, lote: 'L1', metragem_inicial: 40, metragem_atual: 8.5, data_entrada: '2026-10-01' }]
    });
    const caixa = page.locator('#alertas-ponto-pedido');
    await expect(caixa).toBeVisible();
    const t = await caixa.innerText();
    expect(t).toContain('LINHO BELGA');
    expect(t, 'o tecido sem entrada nenhuma nao pode aparecer').not.toContain('TRICÔ HERA');
});

test('rolo esgotado ainda conta como entrada anterior', async ({ page }) => {
    await abrirEstoque(page, {
        cat: TECIDOS,
        est: [{ id: 12, tecido_id: 1, lote: 'L0', metragem_inicial: 30, metragem_atual: 0, data_entrada: '2026-08-01' }]
    });
    const t = await page.locator('#alertas-ponto-pedido').innerText();
    expect(t, 'ja comprou antes e acabou: o alerta faz sentido').toContain('TRICÔ HERA');
});

test('o botao recolhe os avisos e a escolha fica guardada', async ({ page }) => {
    await abrirEstoque(page, {
        cat: TECIDOS,
        est: [{ id: 11, tecido_id: 2, lote: 'L1', metragem_inicial: 40, metragem_atual: 8.5, data_entrada: '2026-10-01' }]
    });

    const corpo = page.locator('.alertas-corpo');
    await expect(corpo).toBeVisible();
    await expect(page.locator('.alertas-cabecalho')).toContainText('1 tecido(s) abaixo');

    await page.click('.alertas-toggle');
    await expect(corpo).toBeHidden();
    await expect(page.locator('.alertas-toggle')).toContainText('Mostrar');

    // sobrevive a recarga
    await page.reload();
    await expect(page.locator('.alertas-corpo')).toBeHidden();

    await page.click('.alertas-toggle');
    await expect(page.locator('.alertas-corpo')).toBeVisible();
});
