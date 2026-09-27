const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// Exemplo real do usuario, com tabulacoes e uma coluna vazia entre nome e largura.
const COLADO = [
    '12003\tRUSTICO FLAME\t\t3,00\t19,39\t18,42',
    '12004\tRUSTICO FLAME PRIME\t\t3,00\t40,95\t38,90',
    '12005\tJACQUARD PARIS\t\t2,80\t50,06\t47,67',
    '12006\tJACQUARD LYON\t\t2,80\t50,06\t47,67'
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

// Chega ao passo 4 com uma aba de tecido grande o bastante para rolar.
async function ateConferencia(page, aba) {
    await abrirAssistente(page);
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
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
}

// ─── 1. rolagem ─────────────────────────────────────────────────────────────

test('marcar e desmarcar mantem a posicao da rolagem', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await ateConferencia(page, 'Book 10');

    const painel = page.locator('[data-painel]').first();
    await expect(painel).toBeVisible();

    // rola o painel do grupo para o meio
    await painel.evaluate(el => { el.scrollTop = 120; });
    const antes = await painel.evaluate(el => el.scrollTop);
    expect(antes).toBeGreaterThan(0);

    // desmarca uma linha qualquer
    await page.evaluate(() => { _impAlternarMarcado('novos', 5); });

    const depois = await page.locator('[data-painel]').first().evaluate(el => el.scrollTop);
    expect(depois, 'a rolagem do painel deveria continuar onde estava').toBe(antes);

    // e o estado realmente mudou
    const marcado = await page.evaluate(() => _impEstado.grupos.novos[5].marcado);
    expect(marcado).toBe(false);

    expect(erros, erros.join('\n')).toEqual([]);
});

// ─── 2. busca ───────────────────────────────────────────────────────────────

test('a busca filtra por nome e por codigo, sem depender de acento', async ({ page }) => {
    await ateConferencia(page, 'Book 12');

    const campo = page.locator('#imp-busca');
    await expect(campo).toBeVisible();

    const total = await page.evaluate(() => _impEstado.grupos.novos.length);
    expect(total).toBeGreaterThan(20);

    // por nome, em minusculas, e o dado esta em maiusculas
    await campo.fill('jacquard');
    const visiveis = await page.locator('#imp-corpo tbody tr:visible').count();
    expect(visiveis).toBeGreaterThan(0);
    expect(visiveis).toBeLessThan(total);

    const nomes = await page.locator('#imp-corpo tbody tr:visible td:nth-child(4) input').evaluateAll(
        els => els.map(e => e.value));
    expect(nomes.every(n => /jacquard/i.test(n)), 'toda linha visivel deveria casar a busca').toBe(true);

    // por codigo
    await campo.fill('12005');
    const porCodigo = await page.locator('#imp-corpo tbody tr:visible td:nth-child(3) input').evaluateAll(
        els => els.map(e => e.value));
    expect(porCodigo).toContain('12005');
    expect(porCodigo.length).toBeLessThan(total);

    // limpar volta tudo
    await campo.fill('');
    const voltou = await page.locator('#imp-corpo tbody tr:visible').count();
    expect(voltou).toBe(total);
});

test('a busca nao muda o que sera gravado', async ({ page }) => {
    await ateConferencia(page, 'Book 12');

    const marcadosAntes = await page.evaluate(() =>
        _IMP_GRUPOS.reduce((n, d) => n + _impEstado.grupos[d.chave].filter(e => e.marcado).length, 0));

    await page.locator('#imp-busca').fill('jacquard');

    const marcadosDepois = await page.evaluate(() =>
        _IMP_GRUPOS.reduce((n, d) => n + _impEstado.grupos[d.chave].filter(e => e.marcado).length, 0));
    expect(marcadosDepois, 'filtrar nao pode desmarcar nada').toBe(marcadosAntes);

    // o botao continua contando todos, nao so os visiveis
    const rotulo = await page.locator('#imp-corpo button:has-text("Gravar")').textContent();
    expect(rotulo).toContain(String(marcadosAntes));
});

test('a busca nao perde o foco a cada tecla', async ({ page }) => {
    await ateConferencia(page, 'Book 12');

    await page.click('#imp-busca');
    await page.keyboard.type('jacq', { delay: 60 });

    const estado = await page.evaluate(() => {
        const el = document.getElementById('imp-busca');
        return { focado: document.activeElement === el, valor: el.value, cursor: el.selectionStart };
    });
    expect(estado.valor, 'todas as teclas deveriam ter chegado ao campo').toBe('jacq');
    expect(estado.focado, 'o campo de busca deveria continuar com o foco').toBe(true);
    expect(estado.cursor).toBe(4);
});

// ─── 3. painel de pendencias ────────────────────────────────────────────────

test('pendencias aparecem em painel, separadas, e levam ao produto', async ({ page }) => {
    // Wave-Square-Retangular repete VUD01 varias vezes na propria aba
    await abrirAssistente(page);
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Wave-Square-Retangular'] = 'material';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    // o painel aparece sozinho, sem precisar apertar Gravar
    const pendencias = page.locator('#imp-corpo div[onclick^="_impIrParaPendencia"]');
    const qtd = await pendencias.count();
    expect(qtd, 'deveria haver pendencia de codigo repetido').toBeGreaterThan(0);
    await expect(page.locator('#imp-corpo')).toContainText('Pendências que impedem gravar');

    // as pendencias sao separadas por uma linha divisoria
    if (qtd > 1) {
        const borda = await pendencias.nth(1).evaluate(el => getComputedStyle(el).borderTopWidth);
        expect(borda, 'cada pendencia deveria ter um divisor acima').not.toBe('0px');
    }

    // clicar leva ate a linha e destaca
    await pendencias.first().click();

    const r = await page.evaluate(() => {
        const el = document.querySelector('[id^="imp-linha-"].imp-linha-destaque');
        return {
            achou: !!el,
            id: el ? el.id : null,
            codigo: el ? el.querySelector('td:nth-child(3) input').value : null,
            contorno: el ? getComputedStyle(el).outlineStyle : null
        };
    });
    expect(r.achou, 'a linha do produto deveria ter sido destacada').toBe(true);
    expect(r.codigo).toBeTruthy();
    expect(r.contorno).toBe('solid');

    // gravar continua recusando enquanto houver pendencia
    await page.click('#imp-corpo button:has-text("Gravar")');
    const gravou = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_mat') || '[]').length);
    expect(gravou, 'nada pode ser gravado com pendencia aberta').toBe(0);
});

test('resolver as pendencias faz o painel sumir e libera a gravacao', async ({ page }) => {
    await abrirAssistente(page);
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Wave-Square-Retangular'] = 'material';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    expect(await page.locator('#imp-corpo div[onclick^="_impIrParaPendencia"]').count()).toBeGreaterThan(0);

    await page.click('#imp-corpo button:has-text("Diferenciar")');
    expect(await page.locator('#imp-corpo div[onclick^="_impIrParaPendencia"]').count(), 'resolvido, o painel deveria sumir').toBe(0);

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_mat') || '[]').length > 0);
    const mats = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_mat')));
    expect(new Set(mats.map(m => m.referencia)).size).toBe(mats.length);
});

// ─── 4. colar dados ─────────────────────────────────────────────────────────

test('colar a tabela do usuario percorre o assistente e grava', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirAssistente(page);

    const area = page.locator('#imp-colar');
    await expect(area).toBeVisible();
    await area.fill(COLADO);
    // o texto colado passa a valer sozinho, sem botao

    // virou uma aba com 4 linhas de 6 colunas
    const lido = await page.evaluate(() => ({
        ordem: _impEstado.planilha.ordem,
        linhas: _impEstado.planilha.abas[_impEstado.planilha.ordem[0]].length,
        colunas: _impEstado.planilha.abas[_impEstado.planilha.ordem[0]][0].length,
        primeira: _impEstado.planilha.abas[_impEstado.planilha.ordem[0]][0],
        origem: _impEstado.origem
    }));
    expect(lido.ordem.length).toBe(1);
    expect(lido.linhas).toBe(4);
    expect(lido.colunas).toBe(6);
    expect(lido.primeira[0]).toBe('12003');
    expect(lido.primeira[1]).toBe('RUSTICO FLAME');
    expect(String(lido.primeira[2] || '')).toBe('');   // coluna vazia preservada
    expect(lido.primeira[3]).toBe('3,00');
    expect(lido.origem).toBe('colado');

    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '100');
    await page.click('#imp-corpo button:has-text("Continuar")');

    // a aba colada NAO pode vir ignorada, mesmo sem cabecalho
    const tipo = await page.evaluate(() => _impEstado.abas[_impEstado.planilha.ordem[0]]);
    expect(tipo, 'dados colados nao podem ser auto-ignorados').not.toBe('ignorar');

    await page.evaluate(() => {
        _impEstado.abas[_impEstado.planilha.ordem[0]] = 'tecido';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');

    // passo 3: sem cabecalho, precisa haver colunas posicionais para mapear
    await expect(page.locator('#imp-corpo')).toContainText('Coluna 1');

    await page.evaluate(() => {
        const i = 0;
        _impTrocarPapel(i, 0, 'codigo');
        _impTrocarPapel(i, 1, 'nome');
        _impTrocarPapel(i, 3, 'largura');
        _impTrocarPapel(i, 4, 'preco');
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const g = await page.evaluate(() => ({
        novos: _impEstado.grupos.novos.length,
        itens: _impEstado.grupos.novos.map(e => ({
            c: e.item.codigo, n: e.item.nome, l: e.item.largura, p: e.item.preco_custo
        }))
    }));
    expect(g.novos).toBe(4);
    expect(g.itens[0]).toEqual({ c: '12003', n: 'RUSTICO FLAME', l: 3, p: 19.39 });
    expect(g.itens[3]).toEqual({ c: '12006', n: 'JACQUARD LYON', l: 2.8, p: 50.06 });

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cat') || '[]').length > 0);

    const cat = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cat')));
    expect(cat.length).toBe(4);
    const rf = cat.find(t => t.referencia === '12003');
    expect(rf.nome).toBe('RUSTICO FLAME');
    expect(rf.largura_rolo).toBe(3);
    expect(rf.preco_custo).toBe(19.39);
    expect(rf.preco).toBe(38.78);   // markup 100%

    expect(erros, erros.join('\n')).toEqual([]);
});

test('colar com a linha de titulo ja vem mapeado', async ({ page }) => {
    await abrirAssistente(page);
    const comTitulo = 'CODIGO\tDESCRIÇÃO\t\tLARGURA\tCORTE\tPEÇA\n' + COLADO;
    await page.locator('#imp-colar').fill(comTitulo);
    // o texto colado passa a valer sozinho, sem botao
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');

    const tipo = await page.evaluate(() => _impEstado.abas[_impEstado.planilha.ordem[0]]);
    expect(tipo, 'com titulo e com itens, deveria ser sugerido como tecido').toBe('tecido');

    await page.click('#imp-corpo button:has-text("Continuar")');
    const mapa = await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]));
    expect(mapa.codigo).toBe(0);
    expect(mapa.nome).toBe(1);
    expect(mapa.largura).toBe(3);
    expect(mapa.preco).toBe(4);
});

test('o texto colado nao se perde ao redesenhar o passo 1', async ({ page }) => {
    await abrirAssistente(page);
    await page.locator('#imp-colar').fill(COLADO);
    await page.fill('#imp-markup', '55');

    // cadastrar fornecedor redesenha o passo 1
    await page.fill('#imp-novo-fornecedor', 'Fornecedor Colado');
    await page.click('#imp-corpo button:has-text("Cadastrar")');

    const r = await page.evaluate(() => ({
        colado: document.getElementById('imp-colar').value,
        markup: document.getElementById('imp-markup').value
    }));
    expect(r.colado, 'o texto colado tem de sobreviver ao redesenho').toContain('12003');
    expect(r.markup).toBe('55');
});
