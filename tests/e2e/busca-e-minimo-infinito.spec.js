// Duas mudancas na tela de Estoque:
//  1. Os <select> de tecido e de material viraram campo de busca com
//     sugestoes. O <select> dava para usar pelo teclado, entao setas, Enter e
//     Esc precisam continuar funcionando.
//  2. Item sem controle de estoque nao tem ponto de pedido: o campo de minimo
//     some do cadastro e as telas mostram "—" no lugar do numero.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

async function semear(page, pagina) {
    await entrar(page, BASE);
    await page.goto(BASE + '/' + pagina);
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', '[]');
        localStorage.setItem('sc_cat', JSON.stringify([
            { id: 1, referencia: 'C-001', nome: 'TRICO HERA',    preco: 167, preco_custo: 92, largura_rolo: 1.4, min_estoque: 10 },
            { id: 2, referencia: 'C-002', nome: 'LINHO BELGA',   preco: 65,  preco_custo: 36, largura_rolo: 2.8, min_estoque: 20 },
            { id: 3, referencia: 'C-003', nome: 'LINHO RUSTICO', preco: 80,  preco_custo: 44, largura_rolo: 2.8, min_estoque: 30, estoque_infinito: true }
        ]));
        localStorage.setItem('sc_mat', JSON.stringify([
            { id: 11, referencia: 'M-01', nome: 'TRILHO SUICO', unidade: 'm',  preco: 48, preco_custo: 30, min_estoque: 20, estoque_atual: 25 },
            { id: 12, referencia: 'M-02', nome: 'ARGOLA',       unidade: 'un', preco: 9,  preco_custo: 5,  min_estoque: 50, estoque_atual: 12, estoque_infinito: true }
        ]));
        localStorage.setItem('sc_kits', '[]');
        localStorage.setItem('sc_est', '[]');
        localStorage.setItem('sc_mov', '[]');
    });
    await page.reload();
}

const sugestoes = (page, campo) =>
    page.locator('#' + campo + '-sug .consulta-sug-item').allInnerTexts();

// ─── 1. Campo de busca no lugar do dropdown ────────────────────────────────

test('o dropdown deu lugar a um campo de texto', async ({ page }) => {
    await semear(page, 'estoque.html');
    expect(await page.locator('select#est-tecido').count(), 'nao ha mais select de tecido').toBe(0);
    await expect(page.locator('#est-tecido-busca')).toBeVisible();
    // o id continua existindo, escondido: e ele que o gravar le
    expect(await page.locator('input#est-tecido[type="hidden"]').count()).toBe(1);
    await expect(page.locator('#est-tecido-sug')).not.toHaveClass(/aberta/);
});

test('digitar o nome mostra os tecidos que casam', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'linho');
    const s = await sugestoes(page, 'est-tecido');
    expect(s.length).toBe(2);
    expect(s.join(' ')).toContain('LINHO BELGA');
    expect(s.join(' ')).toContain('LINHO RUSTICO');
    expect(s.join(' '), 'o codigo aparece ao lado do nome').toContain('C-002');
    expect(s.join(' '), 'quem nao casa fica de fora').not.toContain('TRICO HERA');
});

test('o codigo tambem acha o tecido', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'C-001');
    const s = await sugestoes(page, 'est-tecido');
    expect(s.length).toBe(1);
    expect(s[0]).toContain('TRICO HERA');
});

test('sem nenhum casamento, a lista explica em vez de sumir', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'zzzzz');
    const caixa = await page.locator('#est-tecido-sug').innerText();
    expect(caixa).toContain('Nenhum tecido');
});

test('clicar numa sugestao preenche o campo e dispara o preenchimento automatico', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'TRICO');
    await page.locator('#est-tecido-sug .consulta-sug-item').first().click();

    expect(await page.inputValue('#est-tecido')).toBe('1');
    expect(await page.inputValue('#est-tecido-busca')).toBe('TRICO HERA');
    await expect(page.locator('#est-tecido-sug')).not.toHaveClass(/aberta/);
    // o autofill de sempre continua: lote com o codigo e custo do tecido
    expect(await page.inputValue('#est-lote')).toBe('C-001');
    expect(await page.inputValue('#est-preco-custo')).toBe('92');
});

test('mexer no texto depois de escolher limpa o item escolhido', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'TRICO');
    await page.locator('#est-tecido-sug .consulta-sug-item').first().click();
    expect(await page.inputValue('#est-tecido')).toBe('1');

    await page.fill('#est-tecido-busca', 'TRIC');
    expect(await page.inputValue('#est-tecido'),
        'ver um nome na tela e gravar outro item seria pior que nao achar nada').toBe('');
});

test('setas percorrem a lista e Enter escolhe', async ({ page }) => {
    await semear(page, 'estoque.html');
    const campo = page.locator('#est-tecido-busca');
    await campo.fill('linho');
    await campo.press('ArrowDown');
    await expect(page.locator('#est-tecido-sug .ativa')).toContainText('LINHO BELGA');
    await campo.press('ArrowDown');
    await expect(page.locator('#est-tecido-sug .ativa')).toContainText('LINHO RUSTICO');
    await campo.press('ArrowUp');
    await expect(page.locator('#est-tecido-sug .ativa')).toContainText('LINHO BELGA');

    await campo.press('Enter');
    expect(await page.inputValue('#est-tecido')).toBe('2');
    expect(await page.inputValue('#est-tecido-busca')).toBe('LINHO BELGA');
});

test('as setas dao a volta nas duas pontas', async ({ page }) => {
    await semear(page, 'estoque.html');
    const campo = page.locator('#est-tecido-busca');
    await campo.fill('linho');
    await campo.press('ArrowUp');   // sem nada percorrido, sobe para o ultimo
    await expect(page.locator('#est-tecido-sug .ativa')).toContainText('LINHO RUSTICO');
    await campo.press('ArrowDown'); // do ultimo volta para o primeiro
    await expect(page.locator('#est-tecido-sug .ativa')).toContainText('LINHO BELGA');
});

test('com um unico achado, Enter escolhe sem precisar das setas', async ({ page }) => {
    await semear(page, 'estoque.html');
    const campo = page.locator('#est-tecido-busca');
    await campo.fill('TRICO');
    await campo.press('Enter');
    expect(await page.inputValue('#est-tecido')).toBe('1');
});

test('Esc fecha a lista sem escolher nada', async ({ page }) => {
    await semear(page, 'estoque.html');
    const campo = page.locator('#est-tecido-busca');
    await campo.fill('linho');
    await expect(page.locator('#est-tecido-sug')).toHaveClass(/aberta/);
    await campo.press('Escape');
    await expect(page.locator('#est-tecido-sug')).not.toHaveClass(/aberta/);
    expect(await page.inputValue('#est-tecido')).toBe('');
});

test('digitar o lote continua achando o tecido sozinho', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-lote', 'C-002');
    expect(await page.inputValue('#est-tecido')).toBe('2');
    expect(await page.inputValue('#est-tecido-busca')).toBe('LINHO BELGA');
});

test('a entrada de rolo grava o tecido escolhido na busca', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'TRICO');
    await page.locator('#est-tecido-sug .consulta-sug-item').first().click();
    await page.fill('#est-lote', 'L-99');
    await page.fill('#est-metros', '30');
    await page.click('button:has-text("Registrar Entrada")');
    await page.click('#sc-modal-btns button:has-text("Confirmar Entrada")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.estoque.length === 1);

    const r = await page.evaluate(() => db.estoque[0]);
    expect(r.lote).toBe('L-99');
    expect(r.tecido_id).toBe(1);
    expect(r.metragem_atual).toBe(30);
});

test('sem escolher da lista, gravar cobra a escolha', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.fill('#est-tecido-busca', 'TRICO HERA');  // digitou, mas nao escolheu
    await page.fill('#est-lote', 'L-98');
    await page.fill('#est-metros', '10');
    await page.click('button:has-text("Registrar Entrada")');
    await expect(page.locator('.sc-modal-msg')).toContainText('Escolha o tecido');
    expect(await page.evaluate(() => db.estoque.length)).toBe(0);
});

test('o material tem o mesmo campo, com a unidade ao lado', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('.tab-btn:has-text("Materiais")');
    expect(await page.locator('select#est-mat-id').count()).toBe(0);

    await page.fill('#est-mat-id-busca', 'argo');
    const s = await sugestoes(page, 'est-mat-id');
    expect(s.length).toBe(1);
    expect(s[0]).toContain('ARGOLA (un)');
    await page.locator('#est-mat-id-sug .consulta-sug-item').first().click();
    expect(await page.inputValue('#est-mat-id')).toBe('12');
});

// ─── 2. Minimo nao vale para item sem controle de estoque ──────────────────

test('o campo de estoque minimo some quando o item e infinito', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const visivel = () => page.evaluate(() =>
        !!document.getElementById('cat-min')?.closest('.form-group')?.offsetParent);

    expect(await visivel(), 'em estoque ajustavel o minimo faz sentido').toBe(true);
    await page.click('input[name="cat-cfg-estoque"][value="infinito"]');
    expect(await visivel(), 'item sem controle nao tem ponto de pedido').toBe(false);
    await page.click('input[name="cat-cfg-estoque"][value="ajustar"]');
    expect(await visivel(), 'voltando, o campo volta').toBe(true);
});

test('o mesmo vale para material e para kit pronto', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const visivel = (id) => page.evaluate(i =>
        !!document.getElementById(i)?.closest('.form-group')?.offsetParent, id);

    await page.click('.tab-btn:has-text("Materiais")');
    await page.click('input[name="mat-cfg-estoque"][value="infinito"]');
    expect(await visivel('mat-min')).toBe(false);

    await page.click('.tab-btn:has-text("Kits")');
    await page.click('input[name="kp-cfg-estoque"][value="infinito"]');
    expect(await visivel('kp-min')).toBe(false);
});

test('tecido salvo como infinito nao guarda minimo', async ({ page }) => {
    await semear(page, 'catalogo.html');
    await page.fill('#cat-ref', 'NOVO-1');
    await page.fill('#cat-nome', 'TECIDO SEM CONTROLE');
    await page.fill('#cat-custo', '50');
    await page.fill('#cat-markup', '20');
    await page.fill('#cat-min', '99');          // digitado antes de marcar infinito
    await page.click('input[name="cat-cfg-estoque"][value="infinito"]');
    await page.click('button:has-text("Salvar no Catálogo")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 4);

    const c = await page.evaluate(() => db.catalogo.find(x => x.referencia === 'NOVO-1'));
    expect(c.estoque_infinito).toBe(true);
    expect(c.min_estoque, 'o numero digitado nao vira ponto de pedido').toBe(0);
});

test('as listas mostram traco no minimo do item infinito', async ({ page }) => {
    await semear(page, 'estoque.html');
    const linha = (await page.locator('.est-tec-linha', { hasText: 'LINHO RUSTICO' }).innerText()).replace(/\s+/g, ' ');
    expect(linha, 'o saldo continua sendo infinito').toContain('∞');
    expect(linha, 'mas o minimo de 30 m guardado nao pode aparecer').not.toContain('30 m');

    const controlado = (await page.locator('.est-tec-linha', { hasText: 'LINHO BELGA' }).innerText()).replace(/\s+/g, ' ');
    expect(controlado, 'quem tem controle continua mostrando o minimo').toContain('20 m');
});

test('o Catalogo e o detalhe do tecido seguem a mesma regra', async ({ page }) => {
    await semear(page, 'catalogo.html');
    const linha = (await page.locator('#tb-catalogo tr', { hasText: 'LINHO RUSTICO' }).innerText()).replace(/\s+/g, ' ');
    expect(linha).not.toContain('30 m');

    await page.evaluate(() => verDetalhesTecido(3));
    const modal = (await page.locator('.modal-overlay').last().innerText()).replace(/\s+/g, ' ');
    expect(modal.toUpperCase()).toContain('ESTOQUE MÍNIMO');
    expect(modal, 'o painel tambem nao mostra o numero guardado').not.toContain('30 m');
    expect(modal, 'o saldo de um tecido sem controle e infinito, nao zero').toContain('∞');
    expect(modal).not.toContain('0.00 m');
});

test('a consulta de estoque nao mostra minimo de item infinito', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('.tab-btn:has-text("Consulta")');
    await page.locator('.consulta-linha', { hasText: 'LINHO RUSTICO' }).click();
    const d = (await page.locator('.consulta-detalhe').innerText()).replace(/\s+/g, ' ');
    expect(d.toUpperCase()).toContain('ESTOQUE MÍNIMO');
    expect(d).not.toContain('30 m');
});

test('o dado guardado e preservado: so a tela esconde', async ({ page }) => {
    await semear(page, 'estoque.html');
    // O usuario escolheu "so esconder": nada e apagado de quem ja estava la.
    expect(await page.evaluate(() => db.catalogo.find(c => c.referencia === 'C-003').min_estoque)).toBe(30);
});

test('ordenar por estoque minimo poe os infinitos como sem minimo', async ({ page }) => {
    await semear(page, 'estoque.html');
    await page.click('#tabela-est-tecidos th[data-col="minimo"]');
    const nomes = await page.$$eval('.est-tec-linha .col-nome', ts => ts.map(t => t.textContent.trim().split(' ')[0]));
    // infinito (-1) vem antes de 10 e de 20
    expect(nomes[0]).toBe('LINHO');   // LINHO RUSTICO, o infinito
    expect(nomes.slice(1)).toEqual(['TRICO', 'LINHO']);
});
