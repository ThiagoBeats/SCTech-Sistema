// Lote de ajustes do pedido de compra e da emissao de pedido:
// 1. Pedido de compra Enviado/Recebido nao se edita (volta para Rascunho
//    com confirmacao).
// 2. Compra importada guarda o cliente junto do numero do pedido de venda.
// 3. Importacao so lista pedidos em Orcamento ou Medicao (no spec
//    pedido-compra-de-venda).
// 4. Busca na lista de pedidos de compra: numero, cliente ou data.
// 5. Tecido importado traz quantidade e metragem dos panos como observacao.
// 6. PDF da compra importada traz as especificacoes dos ambientes.
// 7. Emissao de pedido: com/sem acionamento e altura do acionamento.
// 8. Observacao por item no formulario de compra, impressa no PDF.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const FORN = [{ id: 7, nome: 'RC Tecidos' }, { id: 8, nome: 'Alfa Trilhos' }];
const CAT = [{ id: 1, referencia: 'C-001', nome: 'TRICO HERA', preco: 120, preco_custo: 90, largura_rolo: 2.8, fornecedor_id: 7 }];
const MAT = [{ id: 11, referencia: 'M-01', nome: 'TRILHO', unidade: 'm', preco: 50, preco_custo: 30, fornecedor_id: 8 }];
const KITS = [{ id: 21, tipo: 'pronto', referencia: 'K-01', nome: 'KIT VARAO', preco_custo: 120, itens: [] }];
const pedVenda = (id, status, extra) => ({
    id, clienteId: 1, clienteNome: 'Pedro Alves', status, valor: 2000, vendedor_nome: 'Ana', data_entrega: '2026-12-10',
    ambientes: [
        { id: 1, amb: 'Sala', largura: 3, altura: 2.6, abertura: 'C', acionamento: 'com', altura_acionamento: 1.2,
          tecidos: [{ tecidoId: 1, tecidoNome: 'TRICO HERA', prega: 'Americana', fator: 2.5, num_panos: 3, alt_corte: 2.75, consumo_linear: 8.25 }] },
        { id: 2, amb: 'Quarto', largura: 2, altura: 2.5, abertura: 'A', acionamento: 'sem',
          tecidos: [{ tecidoId: 1, tecidoNome: 'TRICO HERA', prega: 'Wave Plus', fator: 2, num_panos: 2, alt_corte: 2.65, consumo_linear: 5.3 }] },
    ],
    itens: [{ materialId: 11, nome: 'TRILHO', unidade: 'm', quantidade: 3 }],
    ...(extra || {}),
});
const pc = (id, status, extra) => ({
    id, fornecedor_id: 8, fornecedor_nome: 'Alfa Trilhos', status, data_criacao: new Date(2026, 10, 5, 10).getTime(), observacoes: '',
    itens: [{ tipo: 'material', item_id: 11, item_nome: 'TRILHO', referencia: 'M-01', unidade: 'm', quantidade: 3, preco_unit: 30, subtotal: 90 }],
    ...(extra || {}),
});
const lerPC = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_pc')));

async function abrirForn(page, tab, extras) {
    await entrar(page, BASE, { sc_forn: FORN, sc_cat: CAT, sc_mat: MAT, sc_kits: KITS, sc_est: [], sc_pc: [], sc_ped: [], ...(extras || {}) });
    await page.evaluate(() => { localStorage.removeItem('sc_pc_seq'); localStorage.removeItem('sc_pc_origem'); });
    await page.goto(BASE + '/fornecedores.html?tab=' + tab);
}

// --- 1. Bloqueio ------------------------------------------------------------

test('pedido de compra enviado ou recebido nao abre para edicao', async ({ page }) => {
    await abrirForn(page, 'pedidos', { sc_pc: [pc(26001, 'Rascunho'), pc(26002, 'Enviado'), pc(26003, 'Recebido')] });
    const btn = id => page.locator(`#tb-pedidos-compra .pc-num-btn:has-text("#${id}")`);
    await expect(btn(26001)).not.toContainText('🔒');
    await expect(btn(26002)).toContainText('🔒');
    await expect(btn(26003)).toContainText('🔒');

    await btn(26002).click();
    await expect(page.locator('#doc-modal-overlay')).toBeVisible();
    await expect(page.locator('#tab-forn-novo')).not.toHaveClass(/active/);
    // Nem chamando direto: o formulario nao carrega o pedido.
    await page.evaluate(() => { document.getElementById('doc-modal-overlay')?.remove(); editarPedidoCompra(26003); });
    expect(await page.evaluate(() => editandoPCId)).toBeNull();
});

test('salvar edicao de um pedido que virou Enviado e recusado', async ({ page }) => {
    await abrirForn(page, 'pedidos', { sc_pc: [pc(26001, 'Rascunho')] });
    await page.click('#tb-pedidos-compra .pc-num-btn');
    await expect(page.locator('#pc-form-titulo')).toContainText('Editando');
    // Enquanto o formulario estava aberto, alguem marcou como Enviado.
    await page.evaluate(() => { db.pedidos_compra[0].status = 'Enviado'; pcDraftItens[0].quantidade = 99; });
    await page.click('#pc-btn-salvar');
    await expect(page.locator('#sc-modal-msg')).toContainText('não pode mais ser editado');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => db.pedidos_compra[0].itens[0].quantidade)).toBe(3);
});

test('voltar para Rascunho pede confirmacao e libera a edicao', async ({ page }) => {
    await abrirForn(page, 'pedidos', { sc_pc: [pc(26002, 'Enviado')] });
    const sel = page.locator('#tb-pedidos-compra select');
    await sel.selectOption('Rascunho');
    await expect(page.locator('#sc-modal-msg')).toContainText('volta a poder ser editado');
    await page.locator('#sc-modal-btns button', { hasText: 'Cancelar' }).click();
    await expect(sel).toHaveValue('Enviado');
    expect((await lerPC(page))[0].status).toBe('Enviado');

    await sel.selectOption('Rascunho');
    await page.locator('#sc-modal-btns button', { hasText: 'Voltar para Rascunho' }).click();
    await expect(page.locator('#tb-pedidos-compra .pc-num-btn')).not.toContainText('🔒');
    expect((await lerPC(page))[0].status).toBe('Rascunho');
});

// --- 2/5/6. Importacao: cliente, panos e especificacoes ------------------------

async function importarTecido(page) {
    await abrirForn(page, 'pedidos', { sc_ped: [pedVenda(26010, 'Orçamento')] });
    await page.click('#pc-btn-importar');
    await page.click('#pc-import-pedidos-tb tr[data-ped="26010"]');
}

test('tecido importado traz panos de cada ambiente como observacao', async ({ page }) => {
    await importarTecido(page);
    const tecido = page.locator('#pc-import-itens tbody tr', { has: page.locator('.pc-import-nome', { hasText: 'TRICO HERA' }) });
    await expect(tecido.locator('input[type=number]'), 'metragem total').toHaveValue('13.55');
    await expect(tecido.locator('.pc-import-panos')).toHaveText('Sala: 3 panos de 2,75 m; Quarto: 2 panos de 2,65 m');
    // So o tecido (um fornecedor): vai direto ao formulario.
    await page.locator('#pc-import-itens tbody tr', { has: page.locator('.pc-import-nome', { hasText: 'TRILHO' }) }).locator('.pc-import-chk').uncheck();
    await page.click('#pc-import-gerar');
    await page.waitForURL(/tab=novo/);
    await expect(page.locator('#tb-pc-draft .pc-draft-obs').first()).toHaveValue('Sala: 3 panos de 2,75 m; Quarto: 2 panos de 2,65 m');
    await page.click('#pc-btn-salvar');
    await page.waitForURL(/tab=pedidos/);

    const [compra] = await lerPC(page);
    expect(compra).toMatchObject({ pedido_venda_id: 26010, pedido_venda_cliente: 'Pedro Alves' });
    expect(compra.itens[0]).toMatchObject({ quantidade: 13.55, observacao: 'Sala: 3 panos de 2,75 m; Quarto: 2 panos de 2,65 m' });
    expect(compra.especificacoes).toHaveLength(2);
    await expect(page.locator('#tb-pedidos-compra .pc-origem')).toHaveText('↳ Pedido #26010 — Pedro Alves');

    // PDF: observacao na linha do tecido e especificacoes dos ambientes.
    await page.click('#tb-pedidos-compra button:has-text("PDF")');
    const doc = page.locator('#doc-modal-paper');
    await expect(doc.locator('.pc-item-obs')).toHaveText('Obs.: Sala: 3 panos de 2,75 m; Quarto: 2 panos de 2,65 m');
    const spec = doc.locator('.pc-especificacoes');
    await expect(spec.locator('.pc-section-title')).toHaveText('Especificações — Pedido #26010 — Pedro Alves');
    const linhas = spec.locator('tbody tr');
    await expect(linhas).toHaveCount(2);
    await expect(linhas.nth(0)).toContainText('Sala');
    await expect(linhas.nth(0)).toContainText('3,00 m × 2,60 m');
    await expect(linhas.nth(0)).toContainText('Abertura C — Central, Cmd. Esq.');
    await expect(linhas.nth(0)).toContainText('Com acionamento — altura 1,2 m');
    await expect(linhas.nth(0)).toContainText('Americana');
    await expect(linhas.nth(0)).toContainText('2.5x');
    await expect(linhas.nth(0)).toContainText('3 × 2,75 m');
    await expect(linhas.nth(1)).toContainText('Sem acionamento');
    await expect(linhas.nth(1)).toContainText('Wave Plus');
});

test('compra sem origem nao mostra especificacoes; compra antiga busca o cliente no pedido', async ({ page }) => {
    await abrirForn(page, 'pedidos', {
        sc_ped: [pedVenda(26010, 'Na Costura')],
        sc_pc: [pc(26001, 'Rascunho'), pc(26002, 'Rascunho', { pedido_venda_id: 26010 })],
    });
    await expect(page.locator('#tb-pedidos-compra .pc-origem')).toHaveText('↳ Pedido #26010 — Pedro Alves');
    await page.evaluate(() => abrirPedidoCompra(26001));
    await expect(page.locator('#doc-modal-paper')).toContainText('PEDIDO DE COMPRA');
    await expect(page.locator('#doc-modal-paper .pc-especificacoes')).toHaveCount(0);
    await page.evaluate(() => abrirPedidoCompra(26002));
    // Compra so de material: mostra os ambientes com os tecidos.
    await expect(page.locator('#doc-modal-paper .pc-especificacoes tbody tr')).toHaveCount(2);
});

// --- 4. Busca na lista ------------------------------------------------------

test('busca por numero, cliente ou data', async ({ page }) => {
    await abrirForn(page, 'pedidos', {
        sc_pc: [
            pc(26001, 'Rascunho', { pedido_venda_id: 26010, pedido_venda_cliente: 'Pedro Alves' }),
            pc(26002, 'Enviado', { pedido_venda_id: 26011, pedido_venda_cliente: 'Bruna Côrtes', data_criacao: new Date(2026, 9, 20, 10).getTime() }),
            pc(26003, 'Recebido'),
        ],
    });
    const nums = () => page.locator('#tb-pedidos-compra .pc-num-btn').allInnerTexts().then(t => t.map(x => x.replace('🔒', '').trim()));
    expect(await nums()).toHaveLength(3);
    await page.fill('#filtro-pc-busca', '26002');
    expect(await nums()).toEqual(['#26002']);
    await page.fill('#filtro-pc-busca', '#26003');
    expect(await nums()).toEqual(['#26003']);
    await page.fill('#filtro-pc-busca', 'cortes');
    expect(await nums(), 'sem acento e sem maiuscula').toEqual(['#26002']);
    await page.fill('#filtro-pc-busca', 'pedro');
    expect(await nums()).toEqual(['#26001']);
    await page.fill('#filtro-pc-busca', '20/10/2026');
    expect(await nums()).toEqual(['#26002']);
    await page.fill('#filtro-pc-busca', '05/11');
    expect((await nums()).sort()).toEqual(['#26001', '#26003']);
    await page.fill('#filtro-pc-busca', 'zzz');
    await expect(page.locator('#tb-pedidos-compra')).toContainText('Nenhum pedido de compra encontrado');
    await page.fill('#filtro-pc-busca', '');
    expect(await nums()).toHaveLength(3);
});

// --- 8. Observacao por item -------------------------------------------------

test('observacao por item: material, tecido e kit; vai para o PDF', async ({ page }) => {
    await abrirForn(page, 'novo');
    await expect(page.locator('#tb-pc-draft').locator('xpath=..').locator('thead th')).toHaveText(['Item', 'Observações', 'Quantidade', 'Un.', 'Último preço pago', '']);
    await page.selectOption('#pc-fornecedor', '8');
    const add = async (tipo, id, obs, qtd) => {
        await page.selectOption('#pc-item-tipo', tipo);
        await page.selectOption('#pc-item-id', String(id));
        await page.fill('#pc-item-obs', obs);
        if (qtd) await page.fill('#pc-item-qtd', String(qtd));
        await page.click('button:has-text("+ Adicionar")');
        await expect(page.locator('#pc-item-obs'), 'o campo limpa depois de adicionar').toHaveValue('');
    };
    await add('material', 11, 'Cor branca', 2);
    await add('material', 11, 'Cor preta', 1);       // outra observacao = outra linha
    await add('material', 11, 'Cor branca', 3);      // mesma observacao soma
    await add('tecido', 1, 'Largura 2,80', 10);
    await add('kit', 21, 'Com suporte duplo', 1);
    const obs = page.locator('#tb-pc-draft .pc-draft-obs');
    await expect(obs).toHaveCount(4);
    await expect(obs.nth(0)).toHaveValue('Cor branca');
    // Editar a observacao na tabela.
    await obs.nth(1).fill('Cor preta fosca');
    await obs.nth(1).dispatchEvent('change');

    await page.click('#pc-btn-salvar');
    await page.waitForURL(/tab=pedidos/);
    const [compra] = await lerPC(page);
    expect(compra.itens.map(i => [i.tipo, i.quantidade, i.observacao])).toEqual([
        ['material', 5, 'Cor branca'], ['material', 1, 'Cor preta fosca'], ['tecido', 10, 'Largura 2,80'], ['kit', 1, 'Com suporte duplo'],
    ]);
    await page.click('#tb-pedidos-compra button:has-text("PDF")');
    await expect(page.locator('#doc-modal-paper .pc-item-obs')).toHaveText([
        'Obs.: Cor branca', 'Obs.: Cor preta fosca', 'Obs.: Largura 2,80', 'Obs.: Com suporte duplo',
    ]);

    // Reabrir o rascunho mantem as observacoes.
    await page.evaluate(() => document.getElementById('doc-modal-overlay')?.remove());
    await page.click('#tb-pedidos-compra .pc-num-btn');
    await expect(page.locator('#tb-pc-draft .pc-draft-obs').nth(3)).toHaveValue('Com suporte duplo');
});

// --- 7. Acionamento na emissao de pedido -------------------------------------

test('acionamento: altura so aparece com acionamento e e gravada', async ({ page }) => {
    await entrar(page, BASE, { sc_cat: CAT, sc_cli: [{ id: 1, nome: 'Pedro Alves' }], sc_ped: [] });
    await page.goto(BASE + '/pedido.html');
    const com = page.locator('input[name="a-acion-1"][value="com"]');
    const sem = page.locator('input[name="a-acion-1"][value="sem"]');
    const alt = page.locator('#a-acion-alt-1');
    await expect(page.locator('#a-acion-grupo-1')).toContainText('Com acionamento');
    await expect(page.locator('#a-acion-grupo-1')).toContainText('Sem acionamento');
    await expect(com).not.toBeChecked();
    await expect(sem).not.toBeChecked();
    await expect(alt).toBeHidden();
    await com.check();
    await expect(alt).toBeVisible();
    await sem.check();
    await expect(alt).toBeHidden();
    await com.check();
    await alt.fill('1.35');

    await page.fill('#a-larg-1', '3');
    await page.fill('#a-alt-1', '2.6');
    await page.selectOption('#a-tecido-1-0', '1');
    await page.click('button:has-text("Calcular Consumo")');
    // Recalcular redesenha o ambiente: a escolha e a altura continuam.
    await expect(page.locator('input[name="a-acion-1"][value="com"]')).toBeChecked();
    await expect(page.locator('#a-acion-alt-1')).toHaveValue('1.35');
    const amb = await page.evaluate(() => pedidoDraft.ambientes[0]);
    expect(amb).toMatchObject({ acionamento: 'com', altura_acionamento: 1.35 });

    // Sem acionamento apaga a altura.
    await page.locator('input[name="a-acion-1"][value="sem"]').check();
    await page.evaluate(() => syncAmbientesFromDOM());
    expect(await page.evaluate(() => pedidoDraft.ambientes[0])).toMatchObject({ acionamento: 'sem', altura_acionamento: null });
});
