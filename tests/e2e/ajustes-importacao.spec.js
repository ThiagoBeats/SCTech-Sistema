const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

const COLADO_KIT = [
    'CODIGO\tNOME\tMEDIDA\tPRECO',
    '5501\tKIT TRILHO SUICO\t1,00 a 1,50 m\t100,00',
    '5502\tKIT VARAO ROMANO\t1,51 a 2,00 m\t200,00'
].join('\n');

async function abrirCatalogo(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify([]));
        localStorage.setItem('sc_kits', JSON.stringify([]));
        localStorage.setItem('sc_est', JSON.stringify([]));
        localStorage.removeItem('sc_imp_perfis');
        localStorage.removeItem('sc_imp_snap');
        localStorage.removeItem('sc_kit_snap');
    });
    await page.reload();
}

// Produtos: até o passo 3 com a aba Book 10 como tecido.
async function ateOPasso3(page) {
    await abrirCatalogo(page);
    await page.click('text=📥 Importar tabela');
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
    await expect(page.locator('.imp-mapa-scroll')).toBeVisible();
}

// Kits: até o passo 2 (colunas).
async function ateOPasso2DeKits(page) {
    await abrirCatalogo(page);
    await page.click('text=📥 Importar tabela');
    await page.click('#imp-corpo button:has-text("Importar kits prontos")');
    await page.locator('#kit-colar').fill(COLADO_KIT);
    await page.selectOption('#kit-fornecedor', '7');
    await page.fill('#kit-markup', '50');
    await page.click('#kit-corpo button:has-text("Continuar")');
    await expect(page.locator('.kit-mapa-tabela')).toBeVisible();
}

// ─── 1. Editar os dados no passo de colunas ─────────────────────────────

test('as celulas do passo 2 do kit sao editaveis e valem na importacao', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await ateOPasso2DeKits(page);

    const celulas = page.locator('.kit-mapa-tabela tbody input');
    expect(await celulas.count(), 'cada celula vira um campo').toBe(8);   // 2 linhas × 4 colunas

    // corrige o nome e o preço do primeiro kit
    await celulas.nth(1).fill('KIT TRILHO CORRIGIDO');
    await celulas.nth(1).blur();
    await celulas.nth(3).fill('120,00');
    await celulas.nth(3).blur();

    await page.click('#kit-corpo button:has-text("Continuar")');
    const novos = await page.evaluate(() => _kitEstado.grupos.novos.map(e => ({ nome: e.item.nome, custo: e.item.preco_custo })));
    expect(novos[0]).toEqual({ nome: 'KIT TRILHO CORRIGIDO', custo: 120 });
    expect(novos[1].nome, 'o outro kit nao pode ter sido tocado').toBe('KIT VARAO ROMANO');

    expect(erros, erros.join('\n')).toEqual([]);
});

test('o passo 2 do kit mostra todas as linhas, nao so as primeiras', async ({ page }) => {
    await abrirCatalogo(page);
    const muitas = ['CODIGO\tNOME\tPRECO'].concat(
        Array.from({ length: 40 }, (_, i) => `90${String(i).padStart(2, '0')}\tKIT ${i}\t10,00`)
    ).join('\n');
    await page.click('text=📥 Importar tabela');
    await page.click('#imp-corpo button:has-text("Importar kits prontos")');
    await page.locator('#kit-colar').fill(muitas);
    await page.selectOption('#kit-fornecedor', '7');
    await page.fill('#kit-markup', '50');
    await page.click('#kit-corpo button:has-text("Continuar")');

    await expect(page.locator('.kit-mapa-tabela tbody tr')).toHaveCount(40);
});

test('as celulas do passo 3 de produtos tambem sao editaveis', async ({ page }) => {
    await ateOPasso3(page);
    const nome = page.locator('.imp-mapa-tabela tbody tr').first().locator('input.imp-celula').nth(1);
    await nome.fill('NOME TROCADO NA MAO');
    await nome.blur();

    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
    expect(await page.evaluate(() => _impEstado.grupos.novos[0].item.nome)).toBe('NOME TROCADO NA MAO');
});

// ─── 2. O cursor no texto colado ────────────────────────────────────────

test('editar o texto colado nao joga o cursor para o fim', async ({ page }) => {
    await abrirCatalogo(page);
    await page.click('text=📥 Importar tabela');
    await page.click('#imp-corpo button:has-text("Importar kits prontos")');
    await page.locator('#kit-colar').fill(COLADO_KIT);

    // põe o cursor no meio e digita uma letra, como quem corrige algo
    const posicao = await page.evaluate(() => {
        const campo = document.getElementById('kit-colar');
        campo.focus();
        campo.setSelectionRange(10, 10);
        // simula a digitação de um caractere naquele ponto
        campo.value = campo.value.slice(0, 10) + 'X' + campo.value.slice(10);
        campo.setSelectionRange(11, 11);
        campo.dispatchEvent(new Event('input', { bubbles: true }));
        return document.getElementById('kit-colar').selectionStart;
    });
    expect(posicao, 'o cursor tem de ficar onde estava').toBe(11);

    // e o texto continua sendo lido
    await expect(page.locator('#kit-resumo')).toContainText('linha(s) lida(s)');
});

// ─── 3. A rolagem ao escolher o papel de uma coluna ─────────────────────

// O que o usuário perde não é a rolagem do modal — essa o navegador preserva
// sozinha ao trocar o innerHTML. É a rolagem DE DENTRO da área da tabela, que
// volta a zero e faz perder o lugar numa planilha de 49 linhas.
// Rola até a metade, não até o fim: no fim o navegador satura o valor na
// altura do conteúdo, que muda alguns pixels a cada redesenho, e o teste
// acusaria diferença sem haver perda de lugar.
function rolarAreaDaTabela(page) {
    return page.evaluate(() => {
        const area = document.querySelector('.imp-mapa-scroll');
        area.scrollTop = Math.floor((area.scrollHeight - area.clientHeight) / 2);
        area.scrollLeft = Math.floor((area.scrollWidth - area.clientWidth) / 2);
        return { t: area.scrollTop, l: area.scrollLeft };
    });
}
function lerAreaDaTabela(page) {
    return page.evaluate(() => {
        const area = document.querySelector('.imp-mapa-scroll');
        return { t: area.scrollTop, l: area.scrollLeft };
    });
}

test('escolher o papel de uma coluna nao perde o lugar na tabela', async ({ page }) => {
    await ateOPasso3(page);
    const antes = await rolarAreaDaTabela(page);
    expect(antes.t, 'a area precisa estar rolada para o teste valer').toBeGreaterThan(0);
    expect(antes.l).toBeGreaterThan(0);

    // pelo seletor de verdade, como o usuário faz
    await page.locator('.imp-mapa-tabela thead select').nth(5).selectOption('preco_peca');

    expect(await lerAreaDaTabela(page), 'a rolagem da tabela precisa ficar onde estava').toEqual(antes);
});

test('desmarcar uma linha tambem nao perde o lugar na tabela', async ({ page }) => {
    await ateOPasso3(page);
    const antes = await rolarAreaDaTabela(page);
    expect(antes.t).toBeGreaterThan(0);

    // Chama o manipulador direto: um .uncheck() do Playwright rola a caixa até
    // a vista antes de clicar, o que mudaria a rolagem por conta do próprio
    // teste e não diria nada sobre o redesenho.
    await page.evaluate(() => _impAlternarLinha('Book 10', 10));
    expect(await lerAreaDaTabela(page)).toEqual(antes);
});

test('trocar a linha de cabecalho tambem preserva', async ({ page }) => {
    await ateOPasso3(page);
    const antes = await rolarAreaDaTabela(page);
    await page.evaluate(() => _impTrocarCabecalho(0, 2));
    expect((await lerAreaDaTabela(page)).t).toBe(antes.t);
});

// ─── 4. Criar uma coluna ────────────────────────────────────────────────

test('nova coluna em produtos preenche todas as linhas e mantem o mapeamento', async ({ page }) => {
    await ateOPasso3(page);
    const mapaAntes = await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]));
    expect(mapaAntes.codigo).toBe(0);

    await page.click('#imp-corpo button:has-text("+ Nova coluna")');
    await page.fill('#imp-nova-rotulo', 'UNIDADE');
    await page.selectOption('#imp-nova-papel', 'unidade');
    await page.fill('#imp-nova-valor', 'm');
    await page.click('#imp-corpo button:has-text("Adicionar")');

    const r = await page.evaluate(() => {
        const l = _impLayoutsDistintos()[0];
        const mapa = _impMapaDoLayout(l);
        const dados = _impEstado.planilha.abas['Book 10'];
        return {
            mapa,
            rotulo: dados[l.cabecalhoIndice][mapa.unidade],
            primeira: dados[l.cabecalhoIndice + 1][mapa.unidade],
            ultima: dados[dados.length - 1][mapa.unidade]
        };
    });
    expect(r.mapa.unidade, 'a coluna nova assume o papel escolhido').toBeGreaterThan(0);
    expect(r.mapa.codigo, 'o mapeamento anterior sobrevive').toBe(0);
    expect(r.mapa.nome).toBe(1);
    expect(r.rotulo).toBe('UNIDADE');
    expect(r.primeira).toBe('m');
    expect(r.ultima).toBe('m');
});

test('a celula da coluna nova pode ser ajustada depois', async ({ page }) => {
    await ateOPasso3(page);
    await page.click('#imp-corpo button:has-text("+ Nova coluna")');
    await page.selectOption('#imp-nova-papel', 'largura');
    await page.fill('#imp-nova-valor', '2.80');
    await page.click('#imp-corpo button:has-text("Adicionar")');

    const col = await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]).largura);
    const celula = page.locator('.imp-mapa-tabela tbody tr').first().locator('input.imp-celula').nth(col);
    await celula.fill('3.00');
    await celula.blur();

    const r = await page.evaluate(c => {
        const dados = _impEstado.planilha.abas['Book 10'];
        const cab = _impLayoutsDistintos()[0].cabecalhoIndice;
        return { primeira: dados[cab + 1][c], segunda: dados[cab + 2][c] };
    }, col);
    expect(r.primeira, 'a celula alterada vale').toBe('3.00');
    expect(r.segunda, 'as outras ficam com o valor geral').toBe('2.80');
});

test('nova coluna em kits entra no mapeamento e nos itens', async ({ page }) => {
    await ateOPasso2DeKits(page);
    await page.click('#kit-corpo button:has-text("+ Nova coluna")');
    await page.fill('#kit-nova-rotulo', 'OBS');
    await page.selectOption('#kit-nova-papel', 'descricao');
    await page.fill('#kit-nova-valor', 'linha branca');
    await page.click('#kit-corpo button:has-text("Adicionar")');

    expect(await page.evaluate(() => _kitEstado.mapa.descricao)).toBe(4);

    await page.click('#kit-corpo button:has-text("Continuar")');
    const descricoes = await page.evaluate(() => _kitEstado.grupos.novos.map(e => e.item.descricao));
    expect(descricoes).toEqual(['linha branca', 'linha branca']);
});

// ─── 5. "markup" virou "margem" ─────────────────────────────────────────

test('nenhum texto da importacao fala em markup', async ({ page }) => {
    await ateOPasso3(page);
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    const texto = await page.locator('#imp-corpo').innerText();
    expect(texto.toLowerCase(), 'a palavra markup nao pode aparecer').not.toContain('markup');
    expect(texto).toContain('Margem %');
    expect(texto).toContain('margem informada');
});

test('na conferencia de kits tambem e margem', async ({ page }) => {
    await ateOPasso2DeKits(page);
    await page.click('#kit-corpo button:has-text("Continuar")');
    const texto = await page.locator('#kit-corpo').innerText();
    expect(texto.toLowerCase()).not.toContain('markup');
    expect(texto).toContain('Margem %');
});

// ─── 6. Tecido com os dois preços ───────────────────────────────────────

test('as duas colunas de preco podem conviver', async ({ page }) => {
    await ateOPasso3(page);
    // CORTE (4) já vem como preço; marca PEÇA (5) como preço por peça
    await page.evaluate(() => _impTrocarPapel(0, 5, 'preco_peca'));

    const mapa = await page.evaluate(() => _impMapaDoLayout(_impLayoutsDistintos()[0]));
    expect(mapa.preco, 'a coluna de corte continua mapeada').toBe(4);
    expect(mapa.preco_peca).toBe(5);
    await expect(page.locator('#imp-corpo')).toContainText('As duas colunas de preço serão gravadas');
});

test('os dois precos sao gravados, e a venda sai da peca', async ({ page }) => {
    await ateOPasso3(page);
    await page.evaluate(() => _impTrocarPapel(0, 5, 'preco_peca'));
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);

    // na conferência os dois valores aparecem sob o custo
    await expect(page.locator('#imp-corpo')).toContainText('corte R$');
    await expect(page.locator('#imp-corpo')).toContainText('peça R$');

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length > 0);

    const t = await page.evaluate(() => {
        const c = db.catalogo.find(x => x.referencia === '10003');
        return { custo: c.preco_custo, venda: c.preco, corte: c.preco_corte, peca: c.preco_peca };
    });
    // Book 10, linha do 10003: corte 78,90 e peça 75,14
    expect(t.corte).toBe(78.9);
    expect(t.peca).toBe(75.14);
    expect(t.custo, 'o custo sai da peca, regra de sempre').toBe(75.14);
    expect(t.venda, '75,14 × 1,80').toBeCloseTo(135.25, 2);
});

test('o detalhe do tecido mostra os dois precos da tabela', async ({ page }) => {
    await ateOPasso3(page);
    await page.evaluate(() => _impTrocarPapel(0, 5, 'preco_peca'));
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length > 0);

    await page.evaluate(() => verDetalhesTecido(db.catalogo.find(c => c.referencia === '10003').id));
    const modal = page.locator('.modal-overlay').last();
    await expect(modal).toContainText('Preços da tabela do fornecedor');
    await expect(modal).toContainText('Corte: R$ 78.90');
    await expect(modal).toContainText('Peça: R$ 75.14');
    await expect(modal).toContainText('sem margem aplicada');
});

test('so uma coluna de preco continua funcionando como antes', async ({ page }) => {
    await ateOPasso3(page);
    // sem mapear a peça: o custo vem do corte
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length > 0);

    const t = await page.evaluate(() => {
        const c = db.catalogo.find(x => x.referencia === '10003');
        return { custo: c.preco_custo, corte: c.preco_corte, peca: c.preco_peca };
    });
    expect(t.custo).toBe(78.9);
    expect(t.corte).toBe(78.9);
    expect(t.peca, 'coluna nao mapeada fica sem valor').toBeNull();
});
