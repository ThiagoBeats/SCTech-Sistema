const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

// Dois fornecedores e produtos espalhados entre eles, para exercitar o caso
// misto sem depender da planilha real.
const FORN = [
    { id: 7,  nome: 'RC Tecidos',      cnpj: '11.111.111/0001-11', tel: '11988887777', email: 'rc@x.com' },
    { id: 9,  nome: 'Trilhos Brasil',  cnpj: '22.222.222/0001-22', tel: '', email: '' }
];

const TECIDOS = [
    { id: 1, referencia: '0001', nome: 'TRICÔ HERA',   preco: 167.30, largura_rolo: 1.40, min_estoque: 10, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos',     imagem: '' },
    { id: 2, referencia: '0002', nome: 'LINHO BELGA',  preco: 65.00,  largura_rolo: 2.80, min_estoque: 10, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos',     imagem: '' },
    { id: 3, referencia: '0003', nome: 'BLACKOUT SP',  preco: 240.00, largura_rolo: 2.80, min_estoque: 10, fornecedor_id: 9, fornecedor_nome: 'Trilhos Brasil', imagem: '' },
    { id: 4, referencia: '0004', nome: 'VOIL CRISTAL', preco: 32.50,  largura_rolo: 3.00, min_estoque: 10, fornecedor_id: null, fornecedor_nome: '',            imagem: '' }
];

const MATERIAIS = [
    { id: 11, referencia: 'TR-01', nome: 'TRILHO SUÍÇO', unidade: 'm',  preco: 48.00, min_estoque: 20, estoque_atual: 5,  fornecedor_id: 9, fornecedor_nome: 'Trilhos Brasil' },
    { id: 12, referencia: 'PT-02', nome: 'PONTEIRA',     unidade: 'un', preco: 6.50,  min_estoque: 50, estoque_atual: 80, fornecedor_id: 9, fornecedor_nome: 'Trilhos Brasil' },
    { id: 13, referencia: 'AB-03', nome: 'ABRAÇADEIRA',  unidade: 'par', preco: 19.90, min_estoque: 0, estoque_atual: 12, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos' }
];

async function abrirCatalogo(page, extras) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(d => {
        localStorage.setItem('sc_forn', JSON.stringify(d.forn));
        localStorage.setItem('sc_cat',  JSON.stringify(d.cat));
        localStorage.setItem('sc_mat',  JSON.stringify(d.mat));
        localStorage.setItem('sc_est',  JSON.stringify(d.est || []));
        localStorage.setItem('sc_ped',  JSON.stringify(d.ped || []));
        localStorage.setItem('sc_cli',  JSON.stringify(d.cli || []));
        localStorage.setItem('sc_pc',   JSON.stringify([]));
        localStorage.removeItem('sc_pc_prefill');
        localStorage.removeItem('sc_pc_prefill_forn');
        localStorage.removeItem('sc_pc_fila');
    }, { forn: FORN, cat: TECIDOS, mat: MATERIAIS, ...(extras || {}) });
    await page.reload();
    await expect(page.locator('#tb-catalogo tr')).toHaveCount(4);
}

// Nomes da coluna "Tecido", na ordem em que a tabela os mostra.
function nomesTecidos(page) {
    return page.locator('#tb-catalogo tr td:nth-child(2)').allInnerTexts();
}

// Marcar pelo nome, e nao pela posicao: a tabela nasce ordenada por nome e
// os testes mexem na ordenacao o tempo todo.
function marcarTecido(page, nome) {
    return page.locator('#tb-catalogo tr', { hasText: nome }).locator('input[type=checkbox]').check();
}
function marcarMaterial(page, nome) {
    return page.locator('#tb-materiais tr:not(.ajuste-form)', { hasText: nome }).locator('input[type=checkbox]').check();
}

async function irParaMateriais(page) {
    await page.click('button[data-tab="cat-materiais"]');
    await expect(page.locator('#tb-materiais tr:not(.ajuste-form)')).toHaveCount(3);
}

// ─── Ordenação ──────────────────────────────────────────────────────────

test('clicar no cabecalho ordena os tecidos e inverte na segunda vez', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirCatalogo(page);

    await page.click('#tabela-tecidos th[data-col="preco"]');
    let nomes = await nomesTecidos(page);
    expect(nomes[0]).toContain('VOIL CRISTAL');   // 32,50
    expect(nomes[3]).toContain('BLACKOUT SP');    // 240,00

    await page.click('#tabela-tecidos th[data-col="preco"]');
    nomes = await nomesTecidos(page);
    expect(nomes[0], 'o segundo clique deveria inverter').toContain('BLACKOUT SP');

    // a coluna ativa fica marcada e a seta aponta o sentido
    const th = page.locator('#tabela-tecidos th[data-col="preco"]');
    await expect(th).toHaveClass(/th-sort-mat-ativo/);
    expect(await th.locator('.sort-icon').innerText()).toBe('▼');
    expect(await page.locator('#tabela-tecidos th[data-col="nome"] .sort-icon').innerText()).toBe('⇅');

    expect(erros, erros.join('\n')).toEqual([]);
});

test('ordena tecidos por largura, minimo e fornecedor', async ({ page }) => {
    await abrirCatalogo(page);

    await page.click('#tabela-tecidos th[data-col="largura"]');
    expect((await nomesTecidos(page))[0]).toContain('TRICÔ HERA');   // 1,40

    await page.click('#tabela-tecidos th[data-col="fornecedor"]');
    const nomes = await nomesTecidos(page);
    expect(nomes[0], 'sem fornecedor ordena antes de tudo').toContain('VOIL CRISTAL');
});

test('a tabela de materiais ordena por unidade e fornecedor', async ({ page }) => {
    await abrirCatalogo(page);
    await irParaMateriais(page);

    await page.click('#tabela-materiais th[data-col="unidade"]');
    let nomes = await page.locator('#tb-materiais tr:not(.ajuste-form) td:nth-child(2)').allInnerTexts();
    expect(nomes[0]).toContain('TRILHO SUÍÇO');   // m

    await page.click('#tabela-materiais th[data-col="fornecedor"]');
    nomes = await page.locator('#tb-materiais tr:not(.ajuste-form) td:nth-child(2)').allInnerTexts();
    expect(nomes[0], 'RC Tecidos vem antes de Trilhos Brasil').toContain('ABRAÇADEIRA');
});

// ─── Filtros ────────────────────────────────────────────────────────────

test('filtra tecidos por nome, por codigo, por fornecedor, por preco e por largura', async ({ page }) => {
    await abrirCatalogo(page);
    const linhas = page.locator('#tb-catalogo tr');

    await page.fill('#f-tec-busca', 'linho');
    await expect(linhas).toHaveCount(1);
    await expect(page.locator('#f-tec-contagem')).toHaveText('1 de 4 tecido(s)');

    await page.fill('#f-tec-busca', '0003');         // acha pelo código também
    await expect(linhas).toHaveCount(1);
    expect((await nomesTecidos(page))[0]).toContain('BLACKOUT SP');

    await page.fill('#f-tec-busca', '');
    await page.selectOption('#f-tec-forn', '7');
    await expect(linhas).toHaveCount(2);

    await page.selectOption('#f-tec-forn', '__sem__');
    await expect(linhas).toHaveCount(1);
    expect((await nomesTecidos(page))[0]).toContain('VOIL CRISTAL');

    await page.selectOption('#f-tec-forn', '');
    await page.fill('#f-tec-pmin', '60');
    await page.fill('#f-tec-pmax', '200');
    await expect(linhas).toHaveCount(2);            // 65,00 e 167,30

    await page.click('.cat-filtros button:has-text("Limpar")');
    await expect(linhas).toHaveCount(4);
    expect(await page.inputValue('#f-tec-pmin')).toBe('');

    await page.selectOption('#f-tec-largura', '2.80');
    await expect(linhas).toHaveCount(2);
});

test('filtro sem resultado avisa, em vez de parecer catalogo vazio', async ({ page }) => {
    await abrirCatalogo(page);
    await page.fill('#f-tec-busca', 'zzzz');
    await expect(page.locator('#tb-catalogo')).toContainText('Nenhum tecido com esses filtros');
});

test('filtra materiais por fornecedor e por faixa de preco', async ({ page }) => {
    await abrirCatalogo(page);
    await irParaMateriais(page);
    const linhas = page.locator('#tb-materiais tr:not(.ajuste-form)');

    await page.selectOption('#f-mat-forn', '9');
    await expect(linhas).toHaveCount(2);

    await page.selectOption('#f-mat-forn', '');
    await page.fill('#f-mat-pmax', '20');
    await expect(linhas).toHaveCount(2);            // 6,50 e 19,90
    await expect(page.locator('#f-mat-contagem')).toHaveText('2 de 3 material(is)');
});

// ─── Seleção ────────────────────────────────────────────────────────────

test('marcar itens mostra a barra e a contagem', async ({ page }) => {
    await abrirCatalogo(page);
    const barra = page.locator('#sel-tec-barra');
    await expect(barra).toBeHidden();

    await page.locator('#tb-catalogo input[type=checkbox]').nth(0).check();
    await expect(barra).toBeVisible();
    await expect(page.locator('#sel-tec-qtd')).toHaveText('1 marcado(s)');
    await expect(page.locator('#tb-catalogo tr.cat-linha-marcada')).toHaveCount(1);

    await page.locator('#tb-catalogo input[type=checkbox]').nth(2).check();
    await expect(page.locator('#sel-tec-qtd')).toHaveText('2 marcado(s)');

    await page.click('#sel-tec-barra button:has-text("Limpar seleção")');
    await expect(barra).toBeHidden();
});

test('a caixa do cabecalho marca so o que o filtro mostra', async ({ page }) => {
    await abrirCatalogo(page);
    await page.selectOption('#f-tec-forn', '7');
    await page.check('#chk-tec-todos');

    expect(await page.evaluate(() => [...catSelecao.tecido].sort())).toEqual([1, 2]);
    await expect(page.locator('#sel-tec-qtd')).toHaveText('2 marcado(s)');
});

test('a marcacao sobrevive a ordenar e a filtrar, e avisa o que ficou escondido', async ({ page }) => {
    await abrirCatalogo(page);
    await marcarTecido(page, 'TRICÔ HERA');

    // reordenar nao pode perder a marca nem marcar a linha errada
    await page.click('#tabela-tecidos th[data-col="preco"]');
    await expect(page.locator('#sel-tec-qtd')).toHaveText('1 marcado(s)');
    const marcada = await page.locator('#tb-catalogo tr.cat-linha-marcada td:nth-child(2)').innerText();
    expect(marcada).toContain('TRICÔ HERA');

    // escondido pelo filtro: continua marcado, mas a barra avisa
    await page.fill('#f-tec-busca', 'blackout');
    await expect(page.locator('#sel-tec-qtd')).toHaveText('1 marcado(s) (1 fora do filtro)');
});

// ─── Exclusão em massa ──────────────────────────────────────────────────

test('exclui varios tecidos de uma vez', async ({ page }) => {
    await abrirCatalogo(page);
    await marcarTecido(page, 'TRICÔ HERA');     // id 1
    await marcarTecido(page, 'LINHO BELGA');    // id 2

    await page.click('#sel-tec-barra button:has-text("Excluir marcados")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Remover 2 tecido(s)');
    await page.click('#sc-modal-ok');

    await expect(page.locator('#tb-catalogo tr')).toHaveCount(2);
    expect(await page.evaluate(() => db.catalogo.map(c => c.id).sort())).toEqual([3, 4]);
});

test('tecido em pedido aberto nao e excluido e o aviso diz qual', async ({ page }) => {
    await abrirCatalogo(page, {
        cli: [{ id: 50, nome: 'Maria Souza' }],
        ped: [{
            id: 900, clienteId: 50, status: 'Em produção',
            ambientes: [{ nome: 'Sala', tecidos: [{ tecidoId: 2, metros: 4 }] }]
        }]
    });

    await marcarTecido(page, 'TRICÔ HERA');     // livre
    await marcarTecido(page, 'LINHO BELGA');    // em uso no pedido 900

    await page.click('#sel-tec-barra button:has-text("Excluir marcados")');
    const msg = page.locator('#sc-modal-msg');
    await expect(msg).toContainText('Remover 1 tecido(s)');
    await expect(msg).toContainText('1 será(ão) mantido(s)');
    await expect(msg).toContainText('LINHO BELGA');
    await expect(msg).toContainText('Maria Souza');
    await page.click('#sc-modal-ok');

    // salvarERecarregar recarrega a pagina; esperar o db renascer.
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 3);
    expect(await page.evaluate(() => db.catalogo.map(c => c.id).sort()), 'o tecido em uso fica')
        .toEqual([2, 3, 4]);
});

test('quando nenhum dos marcados pode sair, nada e excluido', async ({ page }) => {
    await abrirCatalogo(page, {
        cli: [{ id: 50, nome: 'Maria Souza' }],
        ped: [{ id: 900, clienteId: 50, status: 'Em produção',
                ambientes: [{ nome: 'Sala', tecidos: [{ tecidoId: 2, metros: 4 }] }] }]
    });
    await marcarTecido(page, 'LINHO BELGA');    // só o em uso
    await page.click('#sel-tec-barra button:has-text("Excluir marcados")');

    await expect(page.locator('#sc-modal-msg')).toContainText('Nenhum dos 1 tecidos marcados pode ser removido');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => db.catalogo.length)).toBe(4);
});

test('exclui varios materiais e limpa os kits', async ({ page }) => {
    await abrirCatalogo(page);
    await page.evaluate(() => {
        localStorage.setItem('sc_kits', JSON.stringify([
            { id: 300, nome: 'Kit Trilho', itens: [{ materialId: 11, qtd: 1 }, { materialId: 13, qtd: 2 }] }
        ]));
    });
    await page.reload();
    await irParaMateriais(page);

    await marcarMaterial(page, 'TRILHO SUÍÇO');   // id 11, está no kit
    await marcarMaterial(page, 'PONTEIRA');       // id 12
    await page.click('#sel-mat-barra button:has-text("Excluir marcados")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Remover 2 material(is)');
    await page.click('#sc-modal-ok');

    await page.waitForFunction(() => typeof db !== 'undefined' && db.materiais.length === 1);
    const r = await page.evaluate(() => ({
        ids: db.materiais.map(m => m.id),
        kit: db.kits[0].itens.map(i => i.materialId)
    }));
    expect(r.ids).toEqual([13]);
    expect(r.kit, 'o material removido sai do kit').toEqual([13]);
});

test('lista longa de exclusao rola por dentro e nao esconde os botoes', async ({ page }) => {
    const muitos = Array.from({ length: 60 }, (_, i) => ({
        id: 100 + i, referencia: 'M-' + i, nome: 'MATERIAL DE TESTE ' + i,
        unidade: 'un', preco: 10, min_estoque: 0, estoque_atual: 1,
        fornecedor_id: 7, fornecedor_nome: 'RC Tecidos'
    }));
    await abrirCatalogo(page, { mat: muitos });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('button[data-tab="cat-materiais"]');
    await page.check('#chk-mat-todos');
    await page.click('#sel-mat-barra button:has-text("Excluir marcados")');

    const m = await page.evaluate(() => {
        const msg  = document.getElementById('sc-modal-msg');
        const box  = document.querySelector('.sc-modal-box');
        const btns = document.getElementById('sc-modal-btns');
        return {
            rola:      msg.scrollHeight > msg.clientHeight + 1,
            altura:    msg.clientHeight,
            metade:    Math.round(window.innerHeight * 0.5),
            caixaCabe: box.getBoundingClientRect().bottom <= window.innerHeight + 1,
            botoesVisiveis: btns.getBoundingClientRect().bottom <= window.innerHeight + 1
        };
    });
    expect(m.rola, 'com 60 itens a mensagem precisa rolar').toBe(true);
    expect(m.altura, 'a altura para em 50% da tela').toBeLessThanOrEqual(m.metade);
    expect(m.caixaCabe, 'a janela inteira tem de caber na tela').toBe(true);
    expect(m.botoesVisiveis, 'Remover e Cancelar nao podem ficar fora da tela').toBe(true);

    // e ainda dá para confirmar normalmente
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.materiais.length === 0);
});

test('mensagem curta nao ganha barra de rolagem', async ({ page }) => {
    await abrirCatalogo(page);
    await marcarTecido(page, 'TRICÔ HERA');
    await page.click('#sel-tec-barra button:has-text("Excluir marcados")');
    const rola = await page.evaluate(() => {
        const msg = document.getElementById('sc-modal-msg');
        return msg.scrollHeight > msg.clientHeight + 1;
    });
    expect(rola).toBe(false);
});

// ─── Pedido de compra a partir da seleção ───────────────────────────────

test('sem nada marcado, o carrinho da linha leva so aquele item', async ({ page }) => {
    await abrirCatalogo(page);
    await page.locator('#tb-catalogo tr', { hasText: 'LINHO BELGA' })
        .locator('button[title="Criar pedido de compra"]').click();
    await page.waitForURL(/fornecedores\.html/);

    const r = await page.evaluate(() => ({ itens: pcDraftItens, forn: document.getElementById('pc-fornecedor').value }));
    expect(r.itens.length).toBe(1);
    expect(r.itens[0].item_nome).toBe('LINHO BELGA');
    expect(r.forn, 'o fornecedor do tecido ja vem escolhido').toBe('7');
});

test('marcados do mesmo fornecedor vao direto para o formulario', async ({ page }) => {
    await abrirCatalogo(page);
    await page.selectOption('#f-tec-forn', '7');
    await page.check('#chk-tec-todos');
    await page.click('#sel-tec-barra button:has-text("Pedido de compra")');
    await page.waitForURL(/fornecedores\.html/);

    const r = await page.evaluate(() => ({
        nomes: pcDraftItens.map(i => i.item_nome).sort(),
        forn: document.getElementById('pc-fornecedor').value,
        temBanner: document.getElementById('pc-fila-banner').style.display !== 'none'
    }));
    expect(r.nomes).toEqual(['LINHO BELGA', 'TRICÔ HERA']);
    expect(r.forn).toBe('7');
    expect(r.temBanner, 'sem fila, sem faixa').toBe(false);
});

test('fornecedores diferentes abrem a escolha, com o resumo por fornecedor', async ({ page }) => {
    await abrirCatalogo(page);
    await page.check('#chk-tec-todos');
    await page.click('#sel-tec-barra button:has-text("Pedido de compra")');

    const msg = page.locator('#sc-modal-msg');
    await expect(msg).toContainText('3 fornecedores diferentes');
    await expect(msg).toContainText('RC Tecidos: 2 item(ns)');
    await expect(msg).toContainText('Trilhos Brasil: 1 item(ns)');
    await expect(msg).toContainText('Sem fornecedor: 1 item(ns)');

    await expect(page.locator('#sc-modal-btns button')).toHaveCount(4);   // 3 saídas + cancelar
});

test('o cancelar da escolha nao cria pedido nenhum', async ({ page }) => {
    await abrirCatalogo(page);
    await page.check('#chk-tec-todos');
    await page.click('#sel-tec-barra button:has-text("Pedido de compra")');
    await page.click('#sc-modal-btns button:has-text("Cancelar")');

    await expect(page.locator('#sc-modal-overlay')).toBeHidden();
    expect(page.url()).toContain('catalogo.html');
    expect(await page.evaluate(() => localStorage.getItem('sc_pc_fila'))).toBeNull();
});

test('"tudo para um fornecedor" leva os itens e deixa o select em aberto', async ({ page }) => {
    await abrirCatalogo(page);
    await page.check('#chk-tec-todos');
    await page.click('#sel-tec-barra button:has-text("Pedido de compra")');
    await page.click('#sc-modal-btns button:has-text("Tudo para um fornecedor")');
    await page.waitForURL(/fornecedores\.html/);

    const r = await page.evaluate(() => ({ n: pcDraftItens.length, forn: document.getElementById('pc-fornecedor').value }));
    expect(r.n).toBe(4);
    expect(r.forn, 'o usuario e que escolhe').toBe('');
});

test('pedido generico salva sem fornecedor e imprime a linha em branco', async ({ page }) => {
    await abrirCatalogo(page);
    await page.check('#chk-tec-todos');
    await page.click('#sel-tec-barra button:has-text("Pedido de compra")');
    await page.click('#sc-modal-btns button:has-text("Pedido genérico")');
    await page.waitForURL(/fornecedores\.html/);

    expect(await page.evaluate(() => document.getElementById('pc-fornecedor').value)).toBe('0');

    await page.click('#tab-forn-novo button:has-text("Salvar Pedido")');
    await page.waitForFunction(() => db.pedidos_compra.length === 1);

    const pc = await page.evaluate(() => db.pedidos_compra[0]);
    expect(pc.fornecedor_id).toBe(0);
    expect(pc.fornecedor_nome).toContain('sem fornecedor');
    expect(pc.itens.length).toBe(4);
    expect(pc.itens[0].fornecedor_id, 'o fornecedor do item nao vai para o pedido').toBeUndefined();

    const doc = await page.evaluate(id => gerarHTMLPedidoCompra(id), pc.id);
    expect(doc).toContain('preencher os dados do fornecedor');
    expect(doc, 'nao pode vazar de quem cada item e hoje').not.toContain('RC Tecidos');
});

test('"um pedido para cada" cria os pedidos em sequencia', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));

    await abrirCatalogo(page);
    await page.check('#chk-tec-todos');
    await page.click('#sel-tec-barra button:has-text("Pedido de compra")');
    await page.click('#sc-modal-btns button:has-text("Um pedido para cada")');
    await page.waitForURL(/fornecedores\.html/);

    // Os grupos saem na ordem em que cada fornecedor aparece na tabela, que
    // nasce ordenada por nome: BLACKOUT SP (Trilhos) vem primeiro.
    await expect(page.locator('#pc-fila-banner')).toContainText('Pedido 1 de 3');
    await expect(page.locator('#pc-fila-banner')).toContainText('Trilhos Brasil');
    expect(await page.evaluate(() => pcDraftItens.length)).toBe(1);
    await page.click('#tab-forn-novo button:has-text("Salvar Pedido")');

    // 2º
    await expect(page.locator('#pc-fila-banner')).toContainText('Pedido 2 de 3');
    await expect(page.locator('#pc-fila-banner')).toContainText('RC Tecidos');
    expect(await page.evaluate(() => pcDraftItens.length)).toBe(2);
    await page.click('#tab-forn-novo button:has-text("Salvar Pedido")');

    // 3º, o sem fornecedor
    await expect(page.locator('#pc-fila-banner')).toContainText('Pedido 3 de 3');
    expect(await page.evaluate(() => document.getElementById('pc-fornecedor').value)).toBe('0');
    await page.click('#tab-forn-novo button:has-text("Salvar Pedido")');

    // acabou: vai para a lista, com os tres pedidos
    await page.waitForFunction(() => db.pedidos_compra.length === 3);
    const r = await page.evaluate(() => ({
        fila: localStorage.getItem('sc_pc_fila'),
        pedidos: db.pedidos_compra.map(p => ({ forn: p.fornecedor_nome, n: p.itens.length }))
    }));
    expect(r.fila, 'a fila some no fim').toBeNull();
    expect(r.pedidos.map(p => p.n)).toEqual([1, 2, 1]);
    expect(r.pedidos[0].forn).toBe('Trilhos Brasil');
    expect(r.pedidos[1].forn).toBe('RC Tecidos');
    expect(r.pedidos[2].forn).toContain('sem fornecedor');

    expect(erros, erros.join('\n')).toEqual([]);
});

test('da para desistir do que falta na fila sem perder o que ja foi salvo', async ({ page }) => {
    await abrirCatalogo(page);
    await page.check('#chk-tec-todos');
    await page.click('#sel-tec-barra button:has-text("Pedido de compra")');
    await page.click('#sc-modal-btns button:has-text("Um pedido para cada")');
    await page.waitForURL(/fornecedores\.html/);

    await page.click('#tab-forn-novo button:has-text("Salvar Pedido")');
    await expect(page.locator('#pc-fila-banner')).toContainText('Pedido 2 de 3');

    await page.click('#pc-fila-banner button:has-text("Cancelar os restantes")');
    await expect(page.locator('#sc-modal-msg')).toContainText('2 pedido(s) que ainda faltam');
    await page.click('#sc-modal-ok');

    await page.waitForFunction(() => localStorage.getItem('sc_pc_fila') === null);
    expect(await page.evaluate(() => db.pedidos_compra.length), 'o que ja foi salvo fica').toBe(1);
    await expect(page.locator('#pc-fila-banner')).toBeHidden();
});

test('marcados de materiais tambem viram pedido', async ({ page }) => {
    await abrirCatalogo(page);
    await irParaMateriais(page);
    await page.selectOption('#f-mat-forn', '9');
    await page.check('#chk-mat-todos');
    await page.click('#sel-mat-barra button:has-text("Pedido de compra")');
    await page.waitForURL(/fornecedores\.html/);

    const r = await page.evaluate(() => ({
        nomes: pcDraftItens.map(i => i.item_nome).sort(),
        unidades: pcDraftItens.map(i => i.unidade).sort(),
        forn: document.getElementById('pc-fornecedor').value
    }));
    expect(r.nomes).toEqual(['PONTEIRA', 'TRILHO SUÍÇO']);
    expect(r.unidades, 'cada material leva a propria unidade').toEqual(['m', 'un']);
    expect(r.forn).toBe('9');
});

test('com itens marcados, o carrinho de uma linha leva a selecao inteira', async ({ page }) => {
    await abrirCatalogo(page);
    await page.selectOption('#f-tec-forn', '7');
    await page.check('#chk-tec-todos');

    // clica no carrinho da linha, nao no da barra
    await page.locator('#tb-catalogo tr').nth(0).locator('button[title="Criar pedido de compra"]').click();
    await page.waitForURL(/fornecedores\.html/);

    expect(await page.evaluate(() => pcDraftItens.length)).toBe(2);
});
