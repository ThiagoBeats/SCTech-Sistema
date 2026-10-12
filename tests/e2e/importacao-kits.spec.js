const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const COLADO = [
    'CODIGO\tNOME\tMEDIDA\tPRECO',
    '5501\tKIT TRILHO SUICO\t1,00 a 1,50 m\t100,00',
    '5502\tKIT TRILHO SUICO\t1,51 a 2,00 m\t200,00',
    '5503\tKIT VARAO ROMANO\t2,01 a 3,00 m\t300,00'
].join('\n');

async function abrirImportadorDeKits(page, semente) {
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
    }, semente || {});
    await page.reload();
    await page.click('text=📥 Importar tabela');
    await page.click('#imp-corpo button:has-text("Importar kits prontos")');
    await expect(page.locator('#kit-corpo')).toBeVisible();
}

// Vai do passo 1 até a conferência com os três kits colados.
async function ateAConferencia(page, escolhas) {
    const e = escolhas || {};
    await page.locator('#kit-colar').fill(e.texto || COLADO);
    await page.selectOption('#kit-fornecedor', '7');
    if (e.margem) await page.click(`input[name="kit-cfg-margem"][value="${e.margem}"]`);
    if (e.estoque) await page.click(`input[name="kit-cfg-estoque"][value="${e.estoque}"]`);
    if (e.margem !== 'item') await page.fill('#kit-markup', String(e.markup ?? 50));
    await page.click('#kit-corpo button:has-text("Continuar")');
    await page.click('#kit-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _kitEstado.passo === 3);
}

async function importar(page, escolhas) {
    await abrirImportadorDeKits(page, (escolhas || {}).semente);
    await ateAConferencia(page, escolhas);
    await page.click('#kit-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 3);
}

// ─── A porta de entrada ─────────────────────────────────────────────────

test('o botao na popup de tabela leva para a importacao de kits', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }])));
    await page.reload();
    await page.click('text=📥 Importar tabela');

    await expect(page.locator('#imp-corpo')).toContainText('Importar kits prontos');
    await page.click('#imp-corpo button:has-text("Importar kits prontos")');

    // a popup antiga fecha, para não empilhar dois modais
    expect(await page.locator('#imp-overlay').count()).toBe(0);
    await expect(page.locator('#kit-overlay .modal-header')).toContainText('Importar kits prontos');
    await expect(page.locator('#kit-corpo')).toContainText('1. Colar');
    await expect(page.locator('#kit-corpo')).toContainText('3. Conferência');

    expect(erros, erros.join('\n')).toEqual([]);
});

test('kit so entra por texto colado, sem campo de arquivo', async ({ page }) => {
    await abrirImportadorDeKits(page);
    expect(await page.locator('#kit-corpo input[type=file]').count()).toBe(0);
    await expect(page.locator('#kit-colar')).toBeVisible();
});

test('da para voltar para a importacao de produtos', async ({ page }) => {
    await abrirImportadorDeKits(page);
    await page.click('#kit-corpo button:has-text("Tabela de produtos")');
    expect(await page.locator('#kit-overlay').count()).toBe(0);
    await expect(page.locator('#imp-corpo')).toContainText('Arquivo da tabela');
});

// ─── Passo 1 ────────────────────────────────────────────────────────────

test('os quatro cartoes de configuracao aparecem aqui tambem', async ({ page }) => {
    await abrirImportadorDeKits(page);
    const titulos = await page.locator('#kit-cfg .imp-cfg-titulo').allInnerTexts();
    expect(titulos).toEqual(['Definir margem total', 'Definir margem por item', 'Estoque infinito', 'Ajustar estoque']);
    await expect(page.locator('#kit-markup')).toHaveAttribute('placeholder', 'Ex.: 30');

    await page.click('input[name="kit-cfg-margem"][value="item"]');
    expect(await page.locator('#kit-markup').count(), 'o campo some com margem por item').toBe(0);
    await expect(page.locator('input[name="kit-cfg-estoque"][value="ajustar"]'),
        'os grupos sao independentes').toBeChecked();
});

test('colar ja carrega as linhas, sem botao', async ({ page }) => {
    await abrirImportadorDeKits(page);
    await page.locator('#kit-colar').fill(COLADO);
    await expect(page.locator('#kit-corpo')).toContainText('4 linha(s) lida(s)');
});

test('sem fornecedor ou sem margem o Continuar barra', async ({ page }) => {
    await abrirImportadorDeKits(page);
    await page.locator('#kit-colar').fill(COLADO);
    await page.click('#kit-corpo button:has-text("Continuar")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Escolha o fornecedor');
    await page.click('#sc-modal-ok');

    await page.selectOption('#kit-fornecedor', '7');
    await page.click('#kit-corpo button:has-text("Continuar")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Informe a margem total');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => _kitEstado.passo)).toBe(1);
});

// ─── Passo 2: colunas ───────────────────────────────────────────────────

test('o mapeamento das colunas vem sugerido', async ({ page }) => {
    await abrirImportadorDeKits(page);
    await page.locator('#kit-colar').fill(COLADO);
    await page.selectOption('#kit-fornecedor', '7');
    await page.fill('#kit-markup', '50');
    await page.click('#kit-corpo button:has-text("Continuar")');

    expect(await page.evaluate(() => _kitEstado.mapa))
        .toEqual({ codigo: 0, nome: 1, preco: 3, medida: 2, descricao: -1 });
});

test('sem codigo, nome ou preco mapeados o passo 2 barra e diz o que falta', async ({ page }) => {
    await abrirImportadorDeKits(page);
    await page.locator('#kit-colar').fill(COLADO);
    await page.selectOption('#kit-fornecedor', '7');
    await page.fill('#kit-markup', '50');
    await page.click('#kit-corpo button:has-text("Continuar")');

    await page.evaluate(() => _kitTrocarPapel(0, ''));   // tira o papel de código
    await expect(page.locator('#kit-corpo')).toContainText('Falta dizer qual coluna é');
    await page.click('#kit-corpo button:has-text("Continuar")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Código');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => _kitEstado.passo)).toBe(2);
});

test('medida e descricao sao opcionais', async ({ page }) => {
    await abrirImportadorDeKits(page);
    // tabela sem medida nem descrição
    await ateAConferencia(page, { texto: 'CODIGO\tNOME\tPRECO\n9001\tKIT SIMPLES\t80,00' });
    const r = await page.evaluate(() => ({
        novos: _kitEstado.grupos.novos.length,
        medida: _kitEstado.grupos.novos[0].item.medida,
        descricao: _kitEstado.grupos.novos[0].item.descricao
    }));
    expect(r.novos).toBe(1);
    expect(r.medida).toBe('');
    expect(r.descricao).toBe('');
});

test('trocar o papel de uma coluna limpa o dono anterior', async ({ page }) => {
    await abrirImportadorDeKits(page);
    await page.locator('#kit-colar').fill(COLADO);
    await page.selectOption('#kit-fornecedor', '7');
    await page.fill('#kit-markup', '50');
    await page.click('#kit-corpo button:has-text("Continuar")');

    await page.evaluate(() => _kitTrocarPapel(2, 'descricao'));   // medida (2) vira descrição
    const m = await page.evaluate(() => _kitEstado.mapa);
    expect(m.descricao).toBe(2);
    expect(m.medida, 'a coluna não pode ficar nos dois papéis').toBe(-1);
});

// ─── Passo 3: conferência ───────────────────────────────────────────────

test('a conferencia mostra os tres kits com a venda calculada', async ({ page }) => {
    await abrirImportadorDeKits(page);
    await ateAConferencia(page, { markup: 50 });

    const r = await page.evaluate(() => _kitEstado.grupos.novos.map(e => ({
        cod: e.item.codigo, medida: e.item.medida, custo: e.item.preco_custo, markup: e.markup
    })));
    expect(r).toEqual([
        { cod: '5501', medida: '1,00 a 1,50 m', custo: 100, markup: 50 },
        { cod: '5502', medida: '1,51 a 2,00 m', custo: 200, markup: 50 },
        { cod: '5503', medida: '2,01 a 3,00 m', custo: 300, markup: 50 }
    ]);
    await expect(page.locator('#kit-corpo')).toContainText('Gravar 3 kit(s)');
});

test('codigo em conflito chega desmarcado e barra a gravacao se marcado', async ({ page }) => {
    await abrirImportadorDeKits(page, {
        mat: [{ id: 8, referencia: '5502', nome: 'PONTEIRA', unidade: 'un', preco: 5, estoque_atual: 0 }]
    });
    await ateAConferencia(page, { markup: 50 });

    const r = await page.evaluate(() => ({
        novos: _kitEstado.grupos.novos.length,
        conflitos: _kitEstado.grupos.conflitos.map(e => ({ cod: e.item.codigo, marcado: e.marcado, motivo: e.motivo }))
    }));
    expect(r.novos).toBe(2);
    expect(r.conflitos.length).toBe(1);
    expect(r.conflitos[0].marcado, 'conflito nao pode vir marcado').toBe(false);
    expect(r.conflitos[0].motivo).toContain('um material');

    // marcando na marra, a gravação é barrada
    await page.evaluate(() => _kitAlternarMarcado('conflitos', 0));
    await page.click('#kit-corpo button:has-text("Gravar")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Resolva estas pendências');
});

test('corrigir o codigo na conferencia tira a linha do conflito', async ({ page }) => {
    await abrirImportadorDeKits(page, {
        mat: [{ id: 8, referencia: '5502', nome: 'PONTEIRA', unidade: 'un', preco: 5, estoque_atual: 0 }]
    });
    await ateAConferencia(page, { markup: 50 });
    expect(await page.evaluate(() => _kitEstado.grupos.conflitos.length)).toBe(1);

    await page.evaluate(() => _kitEditarCampo('conflitos', 0, 'codigo', '5502B'));
    const r = await page.evaluate(() => ({
        novos: _kitEstado.grupos.novos.length,
        conflitos: _kitEstado.grupos.conflitos.length
    }));
    expect(r.conflitos).toBe(0);
    expect(r.novos).toBe(3);
});

// ─── Gravação ───────────────────────────────────────────────────────────

test('os kits gravados viram kits prontos com preco e medida', async ({ page }) => {
    await importar(page, { markup: 50 });

    const kits = await page.evaluate(() => db.kits.map(k => ({
        tipo: k.tipo, ref: k.referencia, nome: k.nome, medida: k.medida,
        custo: k.preco_custo, preco: k.preco, saldo: k.estoque_atual,
        infinito: k.estoque_infinito, forn: k.fornecedor_nome, itens: k.itens.length
    })));
    expect(kits[0]).toEqual({
        tipo: 'pronto', ref: '5501', nome: 'KIT TRILHO SUICO', medida: '1,00 a 1,50 m',
        custo: 100, preco: 150, saldo: 0, infinito: false, forn: 'RC Tecidos', itens: 0
    });
    expect(kits.map(k => k.preco)).toEqual([150, 300, 450]);
});

test('margem por item deixa cada kit com a sua', async ({ page }) => {
    await abrirImportadorDeKits(page);
    await ateAConferencia(page, { margem: 'item' });
    expect(await page.evaluate(() => _kitEstado.grupos.novos.map(e => e.markup))).toEqual([null, null, null]);

    await page.evaluate(() => {
        _kitEditarCampo('novos', 0, 'markup', '10');
        _kitEditarCampo('novos', 1, 'markup', '100');
        _kitEditarCampo('novos', 2, 'markup', '0');
    });
    await page.click('#kit-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 3);

    expect(await page.evaluate(() => db.kits.map(k => k.preco))).toEqual([110, 400, 300]);
});

test('estoque infinito marca os kits importados', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 50 });
    expect(await page.evaluate(() => db.kits.every(k => k.estoque_infinito === true))).toBe(true);
});

// ─── Desfazer ───────────────────────────────────────────────────────────

test('o botao de desfazer aparece e devolve os kits importados', async ({ page }) => {
    await importar(page, { markup: 50 });
    const botao = page.locator('#btn-desfazer-import');
    await expect(botao).toBeVisible();

    await botao.click();
    await expect(page.locator('#sc-modal-msg')).toContainText('importação de kits');
    await expect(page.locator('#sc-modal-msg')).toContainText('3 kit(s) criado(s) serão apagados');
    await page.click('#sc-modal-btns button:has-text("Desfazer")');

    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 0);
    await expect(page.locator('#btn-desfazer-import'), 'sem snapshot, o botao some').toBeHidden();
});

test('desfazer mantem o kit que ja recebeu saldo', async ({ page }) => {
    await importar(page, { markup: 50 });
    await page.evaluate(() => { db.kits[0].estoque_atual = 5; syncDB(); });

    await page.click('#btn-desfazer-import');
    await page.click('#sc-modal-btns button:has-text("Desfazer")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);

    const k = await page.evaluate(() => db.kits[0]);
    expect(k.estoque_atual, 'apagar deixaria saldo orfao').toBe(5);
});

test('desfazer devolve o preco de um kit que foi atualizado', async ({ page }) => {
    await abrirImportadorDeKits(page, {
        kits: [{ id: 300, tipo: 'pronto', referencia: '5501', nome: 'KIT ANTIGO',
                 medida: '1,00 a 1,50 m', preco_custo: 80, preco: 120, estoque_atual: 0, itens: [] }]
    });
    await ateAConferencia(page, { markup: 50 });
    expect(await page.evaluate(() => _kitEstado.grupos.atualizados.length)).toBe(1);
    await page.click('#kit-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 3);
    expect(await page.evaluate(() => db.kits.find(k => k.id === 300).preco)).toBe(150);

    await page.click('#btn-desfazer-import');
    await page.click('#sc-modal-btns button:has-text("Desfazer")');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits.length === 1);

    const k = await page.evaluate(() => db.kits[0]);
    expect(k.nome).toBe('KIT ANTIGO');
    expect(k.preco).toBe(120);
    expect(k.preco_custo).toBe(80);
});

// ─── O kit no sistema ───────────────────────────────────────────────────

test('o kit importado aparece na aba Kits do estoque', async ({ page }) => {
    await importar(page, { markup: 50 });
    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');

    const linha = page.locator('#tb-kits tr', { hasText: 'KIT VARAO ROMANO' }).first();
    await expect(linha).toContainText('5503');
    await expect(linha).toContainText('2,01 a 3,00 m');
    await expect(linha).toContainText('R$ 450.00');
    await expect(linha).toContainText('pronto');
});

test('kit infinito mostra o simbolo e nao oferece ajuste de saldo', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 50 });
    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');

    const linha = page.locator('#tb-kits tr').first();
    await expect(linha).toContainText('∞');
    expect(await linha.locator('button:has-text("Ajustar")').count()).toBe(0);
});

test('da para dar entrada no saldo do kit depois de importar', async ({ page }) => {
    await importar(page, { markup: 50 });
    await page.goto(BASE + '/estoque.html');
    await page.click('button[data-tab="kits"]');

    const id = await page.evaluate(() => db.kits[0].id);
    await page.locator('#tb-kits tr').first().locator('button:has-text("Ajustar")').click();
    await page.fill(`#ajuste-qtd-kit-${id}`, '12');
    await page.click(`#ajuste-kit-${id} button:has-text("Confirmar")`);

    await page.waitForFunction(() => typeof db !== 'undefined' && db.kits[0].estoque_atual === 12);
    const mov = await page.evaluate(() => db.movimentos.find(m => m.item_tipo === 'kit'));
    expect(mov.tipo).toBe('Ajuste +');
    expect(mov.quantidade).toBe(12);
});

test('o kit pronto entra no pedido como uma linha so, com o preco dele', async ({ page }) => {
    await importar(page, { markup: 50 });
    await page.goto(BASE + '/pedido.html');

    // o seletor mostra medida e preço
    await expect(page.locator('#ped-kit')).toContainText('KIT TRILHO SUICO · 1,00 a 1,50 m · R$ 150.00');

    const id = await page.evaluate(() => db.kits[0].id);
    await page.selectOption('#ped-kit', String(id));
    await page.click('button:has-text("Aplicar Kit")');

    const itens = await page.evaluate(() => pedidoDraft.itens);
    expect(itens.length, 'uma linha so, nao explodido em materiais').toBe(1);
    expect(itens[0].kitId).toBe(id);
    expect(itens[0].nome).toBe('KIT TRILHO SUICO (1,00 a 1,50 m)');
    expect(itens[0].unidade).toBe('un');
    expect(itens[0].preco_unit).toBe(150);
    expect(itens[0].subtotal).toBe(150);

    // aplicar de novo soma quantidade em vez de duplicar a linha
    await page.selectOption('#ped-kit', String(id));
    await page.click('button:has-text("Aplicar Kit")');
    const depois = await page.evaluate(() => pedidoDraft.itens);
    expect(depois.length).toBe(1);
    expect(depois[0].quantidade).toBe(2);
    expect(depois[0].subtotal).toBe(300);
});

test('kit de montagem continua explodindo nos materiais', async ({ page }) => {
    await abrirImportadorDeKits(page, {
        mat: [
            { id: 21, referencia: 'TR-01', nome: 'TRILHO', unidade: 'm', preco: 40, estoque_atual: 100 },
            { id: 22, referencia: 'PT-02', nome: 'PONTEIRA', unidade: 'un', preco: 6, estoque_atual: 100 }
        ],
        kits: [{ id: 300, nome: 'Kit Cortina Sala', descricao: '', itens: [
            { materialId: 21, nome: 'TRILHO', unidade: 'm', quantidade: 3 },
            { materialId: 22, nome: 'PONTEIRA', unidade: 'un', quantidade: 2 }
        ] }]
    });
    await page.goto(BASE + '/pedido.html');
    await page.selectOption('#ped-kit', '300');
    await page.click('button:has-text("Aplicar Kit")');

    const itens = await page.evaluate(() => pedidoDraft.itens.map(i => ({ mat: i.materialId, q: i.quantidade })));
    expect(itens, 'o kit de montagem vira os materiais dele').toEqual([{ mat: 21, q: 3 }, { mat: 22, q: 2 }]);
});

// ─── Estoque do kit no pedido ───────────────────────────────────────────

test('vender um kit pronto baixa o saldo dele', async ({ page }) => {
    await importar(page, { markup: 50 });

    const r = await page.evaluate(() => {
        const kit = db.kits[0];
        kit.estoque_atual = 10;
        const ped = { id: 910, itens: [{ kitId: kit.id, nome: kit.nome, unidade: 'un', quantidade: 3, preco_unit: kit.preco, subtotal: 3 * kit.preco }] };
        realizarBaixaMateriais(ped);
        return {
            saldo: db.kits[0].estoque_atual,
            mov: (db.movimentos || []).filter(m => m.tipo === 'Baixa Pedido' && m.item_tipo === 'kit').length
        };
    });
    expect(r.saldo).toBe(7);
    expect(r.mov, 'a baixa do kit entra no histórico').toBe(1);
});

test('kit infinito nao sofre baixa, mesmo com saldo lancado', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 50 });

    const saldo = await page.evaluate(() => {
        const kit = db.kits[0];
        kit.estoque_atual = 10;
        realizarBaixaMateriais({ id: 911, itens: [{ kitId: kit.id, nome: kit.nome, unidade: 'un', quantidade: 3, preco_unit: 1, subtotal: 3 }] });
        return db.kits[0].estoque_atual;
    });
    expect(saldo, 'kit infinito fica intacto').toBe(10);
});

test('saldo insuficiente de kit barra o avanco do pedido', async ({ page }) => {
    await importar(page, { markup: 50 });

    await page.evaluate(() => {
        const kit = db.kits[0];
        kit.estoque_atual = 1;
        db.clientes = [{ id: 1, nome: 'Maria' }];
        db.pedidos = [{
            id: 912, clienteId: 1, status: 'Na Costura', ambientes: [],
            baixa_tecido_realizada: true,
            itens: [{ kitId: kit.id, nome: kit.nome, unidade: 'un', quantidade: 5, preco_unit: kit.preco, subtotal: 5 * kit.preco }]
        }];
        syncDB();
        moverStatus(912, 1);
    });

    await expect(page.locator('#sc-modal-overlay')).toBeVisible();
    const msg = await page.locator('#sc-modal-msg').innerText();
    expect(msg).toContain('insuficientes');
    expect(msg).toContain('necessário 5 un, disponível 1.00 un');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => db.pedidos[0].status), 'nao pode avancar').toBe('Na Costura');
});

test('com saldo suficiente o pedido avanca e o kit baixa', async ({ page }) => {
    await importar(page, { markup: 50 });

    await page.evaluate(() => {
        const kit = db.kits[0];
        kit.estoque_atual = 9;
        db.clientes = [{ id: 1, nome: 'Maria' }];
        db.pedidos = [{
            id: 913, clienteId: 1, status: 'Na Costura', ambientes: [],
            baixa_tecido_realizada: true,
            itens: [{ kitId: kit.id, nome: kit.nome, unidade: 'un', quantidade: 5, preco_unit: kit.preco, subtotal: 5 * kit.preco }]
        }];
        syncDB();
        moverStatus(913, 1);
    });

    await expect(page.locator('#sc-modal-msg')).toContainText('Dar baixa nos materiais');
    await page.click('#sc-modal-btns button:has-text("Confirmar")');
    await page.waitForFunction(() => db.kits[0].estoque_atual === 4);
});
