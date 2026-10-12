const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

// Três tecidos colados com a linha de título, para o passo 3 já sair mapeado.
const COLADO = [
    'CODIGO\tDESCRIÇÃO\t\tLARGURA\tCORTE',
    '12008\tJACQUARD ELINE\t\t2,80\t100,00',
    '12009\tJACQUARD RIVIERA\t\t2,80\t50,00',
    '12010\tRUSTICO SAVANA\t\t3,00\t20,00'
].join('\n');

async function abrirAssistente(page) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify([]));
        localStorage.setItem('sc_est', JSON.stringify([]));
        localStorage.setItem('sc_ped', JSON.stringify([]));
        localStorage.removeItem('sc_imp_perfis');
        localStorage.removeItem('sc_imp_snap');
    });
    await page.reload();
    await page.click('text=📥 Importar tabela');
    await expect(page.locator('#imp-cfg')).toBeVisible();
}

const cartao = nome => `.imp-cfg-card:has(input[name="imp-cfg-${nome}"])`;
const radio  = (grupo, v) => `input[name="imp-cfg-${grupo}"][value="${v}"]`;

// Vai do passo 1 até a conferência com os três tecidos colados.
async function ateAConferencia(page, escolhas) {
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    if (escolhas && escolhas.margem) await page.click(radio('margem', escolhas.margem));
    if (escolhas && escolhas.estoque) await page.click(radio('estoque', escolhas.estoque));
    if (!escolhas || escolhas.margem !== 'item') await page.fill('#imp-markup', String((escolhas && escolhas.markup) ?? 80));
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.evaluate(() => {
        const aba = _impEstado.planilha.ordem[0];
        _impEstado.abas[aba] = 'tecido';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
}

// ─── A tela ─────────────────────────────────────────────────────────────

test('os quatro cartoes aparecem com os textos combinados', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await abrirAssistente(page);

    await expect(page.locator('#imp-corpo')).toContainText('Configurações da importação');
    await expect(page.locator('#imp-corpo')).toContainText('Escolha como deseja aplicar a margem de lucro e o controle de estoque para os itens desta tabela.');
    await expect(page.locator('.imp-cfg-card')).toHaveCount(4);

    const titulos = await page.locator('.imp-cfg-titulo').allInnerTexts();
    expect(titulos).toEqual(['Definir margem total', 'Definir margem por item', 'Estoque infinito', 'Ajustar estoque']);

    const descricoes = await page.locator('.imp-cfg-desc').allInnerTexts();
    expect(descricoes[0]).toBe('A mesma margem de lucro será aplicada em todos os itens da tabela, automaticamente.');
    expect(descricoes[1]).toBe('Você poderá definir margens diferentes para cada item, de forma manual, no momento da conferência ou após a importação.');
    expect(descricoes[2]).toBe('Todos os itens da tabela serão marcados como estoque infinito. Não haverá controle de estoque, baixa ou entrada de itens.');
    expect(descricoes[3]).toBe('O estoque será controlado para cada item. Você poderá dar entrada nos itens manualmente após a importação e o sistema fará a baixa ao sair nos pedidos.');

    // cada cartão tem o seu ícone
    await expect(page.locator('.imp-cfg-card svg.imp-cfg-icone')).toHaveCount(4);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('o campo antigo de markup do passo 1 sumiu', async ({ page }) => {
    await abrirAssistente(page);
    const texto = await page.locator('#imp-corpo').innerText();
    expect(texto).not.toContain('Markup dos itens novos');
    expect(texto).not.toContain('Selecionar itens novos');
    expect(texto, 'o texto auxiliar antigo tambem sai').not.toContain('mantêm o markup deles');
    // o que sobrou é o campo dentro do primeiro cartão
    await expect(page.locator(`${cartao('margem')} #imp-markup`)).toBeVisible();
    await expect(page.locator('#imp-markup')).toHaveAttribute('placeholder', 'Ex.: 30');
    await expect(page.locator('#imp-markup')).toHaveValue('');
});

test('o rodape mantem fornecedor, cadastro e os dois botoes', async ({ page }) => {
    await abrirAssistente(page);
    await expect(page.locator('#imp-corpo')).toContainText('Fornecedor desta tabela');
    await expect(page.locator('#imp-fornecedor option').first()).toHaveText('— Selecione —');
    await expect(page.locator('#imp-novo-fornecedor')).toHaveAttribute('placeholder', 'Nome do novo fornecedor');
    await expect(page.locator('#imp-corpo button:has-text("+ Cadastrar")')).toBeVisible();
    await expect(page.locator('#imp-corpo button:has-text("Cancelar")')).toBeVisible();
    await expect(page.locator('#imp-corpo button:has-text("Continuar")')).toBeVisible();
});

// ─── Seleção ────────────────────────────────────────────────────────────

test('margem e estoque sao grupos separados, um escolhido em cada', async ({ page }) => {
    await abrirAssistente(page);

    // padrão: margem total + ajustar estoque
    await expect(page.locator(radio('margem', 'total'))).toBeChecked();
    await expect(page.locator(radio('estoque', 'ajustar'))).toBeChecked();

    // escolher estoque infinito não pode desmarcar a margem
    await page.click(radio('estoque', 'infinito'));
    await expect(page.locator(radio('estoque', 'infinito'))).toBeChecked();
    await expect(page.locator(radio('estoque', 'ajustar'))).not.toBeChecked();
    await expect(page.locator(radio('margem', 'total')), 'a margem escolhida continua').toBeChecked();

    // e trocar a margem não mexe no estoque
    await page.click(radio('margem', 'item'));
    await expect(page.locator(radio('margem', 'total'))).not.toBeChecked();
    await expect(page.locator(radio('estoque', 'infinito'))).toBeChecked();

    expect(await page.evaluate(() => ({ m: _impEstado.margemModo, e: _impEstado.estoqueModo })))
        .toEqual({ m: 'item', e: 'infinito' });
});

test('o campo de margem so existe no primeiro cartao e so quando ele esta escolhido', async ({ page }) => {
    await abrirAssistente(page);
    await expect(page.locator('#imp-markup')).toBeVisible();
    expect(await page.locator('#imp-markup').count(), 'um campo só').toBe(1);

    await page.click(radio('margem', 'item'));
    expect(await page.locator('#imp-markup').count(), 'some ao escolher margem por item').toBe(0);

    await page.click(radio('margem', 'total'));
    await expect(page.locator('#imp-markup')).toBeVisible();

    // nenhum dos cartões de estoque abre campo
    await page.click(radio('estoque', 'infinito'));
    expect(await page.locator(`${cartao('estoque')} input[type="number"]`).count()).toBe(0);
});

test('a margem digitada sobrevive a ir e voltar entre os cartoes', async ({ page }) => {
    await abrirAssistente(page);
    await page.fill('#imp-markup', '42');
    await page.click(radio('margem', 'item'));
    await page.click(radio('margem', 'total'));
    await expect(page.locator('#imp-markup')).toHaveValue('42');
});

test('so o cartao escolhido fica com o destaque verde', async ({ page }) => {
    await abrirAssistente(page);
    await expect(page.locator('.imp-cfg-card-sel')).toHaveCount(2);   // uma margem + um estoque
    await page.click(radio('estoque', 'infinito'));
    await expect(page.locator('.imp-cfg-card-sel')).toHaveCount(2);
    await expect(page.locator(cartao('estoque')).first()).toHaveClass(/imp-cfg-card-sel/);
});

// ─── Validação e persistência entre as etapas ───────────────────────────

test('margem total em branco barra o Continuar', async ({ page }) => {
    await abrirAssistente(page);
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');

    await expect(page.locator('#sc-modal-msg')).toContainText('Informe a margem total');
    await page.click('#sc-modal-ok');
    expect(await page.evaluate(() => _impEstado.passo), 'nao pode avancar').toBe(1);
});

test('margem por item dispensa o campo e deixa avancar', async ({ page }) => {
    await abrirAssistente(page);
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.click(radio('margem', 'item'));
    await page.click('#imp-corpo button:has-text("Continuar")');
    expect(await page.evaluate(() => _impEstado.passo)).toBe(2);
});

test('as escolhas sobrevivem a avancar e voltar entre as etapas', async ({ page }) => {
    await abrirAssistente(page);
    await page.locator('#imp-colar').fill(COLADO);
    await page.selectOption('#imp-fornecedor', '7');
    await page.click(radio('estoque', 'infinito'));
    await page.fill('#imp-markup', '35');
    await page.click('#imp-corpo button:has-text("Continuar")');
    expect(await page.evaluate(() => _impEstado.passo)).toBe(2);

    await page.click('#imp-corpo button:has-text("Voltar")');
    expect(await page.evaluate(() => _impEstado.passo)).toBe(1);

    await expect(page.locator(radio('estoque', 'infinito'))).toBeChecked();
    await expect(page.locator('#imp-markup')).toHaveValue('35');
    expect(await page.evaluate(() => ({ m: _impEstado.margemModo, e: _impEstado.estoqueModo, v: _impEstado.markupPadrao })))
        .toEqual({ m: 'total', e: 'infinito', v: 35 });
});

// ─── Margem ─────────────────────────────────────────────────────────────

test('margem total e aplicada a todos os itens novos', async ({ page }) => {
    await abrirAssistente(page);
    await ateAConferencia(page, { margem: 'total', markup: 30 });

    const markups = await page.evaluate(() => _impEstado.grupos.novos.map(e => e.markup));
    expect(markups, 'as tres linhas nascem com a margem da tabela').toEqual([30, 30, 30]);

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 3);

    const precos = await page.evaluate(() => db.catalogo
        .sort((a, b) => a.referencia.localeCompare(b.referencia))
        .map(c => ({ custo: c.preco_custo, venda: c.preco })));
    // preço = custo × (1 + margem/100), a conta que o sistema já usava
    expect(precos).toEqual([
        { custo: 100, venda: 130 },
        { custo: 50,  venda: 65 },
        { custo: 20,  venda: 26 }
    ]);
});

test('margem por item nasce em branco e cada linha recebe a sua', async ({ page }) => {
    await abrirAssistente(page);
    await ateAConferencia(page, { margem: 'item' });

    const markups = await page.evaluate(() => _impEstado.grupos.novos.map(e => e.markup));
    expect(markups, 'nenhuma margem geral aplicada').toEqual([null, null, null]);
    await expect(page.locator('#imp-corpo'), 'a tela avisa o que acontece se ficar em branco')
        .toContainText('entra com a venda igual ao custo');

    // margens diferentes, uma por linha
    await page.evaluate(() => {
        _impEditarCampo('novos', 0, 'markup', '10');
        _impEditarCampo('novos', 1, 'markup', '50');
        _impEditarCampo('novos', 2, 'markup', '200');
    });
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 3);

    const r = await page.evaluate(() => db.catalogo
        .sort((a, b) => a.referencia.localeCompare(b.referencia))
        .map(c => ({ custo: c.preco_custo, venda: c.preco })));
    expect(r, 'cada item fica com a margem dele').toEqual([
        { custo: 100, venda: 110 },
        { custo: 50,  venda: 75 },
        { custo: 20,  venda: 60 }
    ]);
});

// ─── Estoque ────────────────────────────────────────────────────────────

async function importar(page, escolhas) {
    await abrirAssistente(page);
    await ateAConferencia(page, escolhas);
    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => typeof db !== 'undefined' && db.catalogo.length === 3);
}

test('estoque infinito marca os itens e mostra infinito no catalogo', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 80 });

    expect(await page.evaluate(() => db.catalogo.every(c => c.estoque_infinito === true))).toBe(true);
    // a gravação recarrega a página: esperar a tabela existir de novo
    await expect(page.locator('#tb-catalogo tr')).toHaveCount(3);
    await expect(page.locator('#tb-catalogo tr').first()).toContainText('∞');
});

test('ajustar estoque deixa o controle normal e o saldo em branco', async ({ page }) => {
    await importar(page, { estoque: 'ajustar', markup: 80 });

    expect(await page.evaluate(() => db.catalogo.every(c => c.estoque_infinito === false))).toBe(true);
    await expect(page.locator('#tb-catalogo tr')).toHaveCount(3);
    const linha = await page.locator('#tb-catalogo tr').first().innerText();
    expect(linha, 'sem rolos, o saldo aparece como traco').toContain('—');
    expect(linha).not.toContain('∞');
});

test('item infinito nao sofre baixa, mesmo tendo rolo em estoque', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 80 });

    const r = await page.evaluate(() => {
        const tec = db.catalogo[0];
        // Rolo de verdade no estoque: se a baixa não respeitasse a flag, o
        // saldo cairia aqui. É isto que prova a regra, não a ausência de rolo.
        db.estoque.push({ id: 1, tecido_id: tec.id, lote: 'L1', metragem_inicial: 50, metragem_atual: 50, data_entrada: '2026-10-01' });
        const ped = {
            id: 900, clienteId: 1, status: 'Aguardando Tecido',
            ambientes: [{ nome: 'Sala', tecidos: [{ tecidoId: tec.id, tecidoNome: tec.nome, consumo_linear: 12 }] }]
        };
        realizarBaixaTecidos(ped);
        return {
            infinito: tecidoTemEstoqueInfinito(tec.id),
            saldo: db.estoque[0].metragem_atual,
            movimentos: (db.movimentos || []).filter(m => m.tipo === 'Baixa Pedido').length
        };
    });
    expect(r.infinito).toBe(true);
    expect(r.saldo, 'o rolo tem de ficar intacto').toBe(50);
    expect(r.movimentos, 'nao registra baixa de quem nao tem estoque controlado').toBe(0);
});

test('material infinito tambem nao sofre baixa', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 80 });

    const r = await page.evaluate(() => {
        db.materiais.push({ id: 500, referencia: 'X1', nome: 'Ponteira infinita', unidade: 'un',
            preco: 5, min_estoque: 0, estoque_atual: 20, estoque_infinito: true });
        db.materiais.push({ id: 501, referencia: 'X2', nome: 'Ponteira normal', unidade: 'un',
            preco: 5, min_estoque: 0, estoque_atual: 20, estoque_infinito: false });
        const ped = { id: 902, itens: [{ materialId: 500, quantidade: 3 }, { materialId: 501, quantidade: 3 }] };
        realizarBaixaMateriais(ped);
        return {
            infinito: db.materiais.find(m => m.id === 500).estoque_atual,
            normal: db.materiais.find(m => m.id === 501).estoque_atual
        };
    });
    expect(r.infinito, 'o infinito fica como estava').toBe(20);
    expect(r.normal, 'o normal baixa como sempre').toBe(17);
});

test('pedido avanca para a costura sem estoque do tecido infinito', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 80 });

    // moverStatus aguarda modais, então não dá para await dentro do evaluate:
    // dispara e observa o que aparece na tela.
    await page.evaluate(() => {
        const tec = db.catalogo[0];
        db.clientes = [{ id: 1, nome: 'Maria' }];
        db.pedidos = [{
            id: 903, clienteId: 1, status: 'Aguardando Tecido',
            ambientes: [{ nome: 'Sala', calculado: true, tecidos: [{ tecidoId: tec.id, tecidoNome: tec.nome, consumo_linear: 999 }] }],
            itens: []
        }];
        syncDB();
        moverStatus(903, 1);
    });

    // Sem a regra de estoque infinito, aqui apareceria "Tecidos insuficientes
    // em estoque" e o pedido ficaria parado em Aguardando Tecido.
    await expect(page.locator('#sc-modal-overlay')).toBeVisible();
    const msg = await page.locator('#sc-modal-msg').innerText();
    expect(msg, 'nao pode barrar por falta de tecido').not.toContain('insuficientes');
    expect(msg, 'o infinito nao entra na lista do que sera baixado').not.toContain('999.00 m');

    await page.click('#sc-modal-btns button:has-text("Confirmar")');
    await page.waitForFunction(() => db.pedidos.find(x => x.id === 903).status === 'Na Costura');
});

test('item com controle normal continua baixando do rolo', async ({ page }) => {
    await importar(page, { estoque: 'ajustar', markup: 80 });

    const r = await page.evaluate(() => {
        const tec = db.catalogo[0];
        db.estoque.push({ id: 1, tecido_id: tec.id, lote: 'L1', metragem_inicial: 50, metragem_atual: 50, data_entrada: '2026-10-01' });
        const ped = {
            id: 901, clienteId: 1, status: 'Aguardando Tecido',
            ambientes: [{ nome: 'Sala', tecidos: [{ tecidoId: tec.id, tecidoNome: tec.nome, consumo_linear: 12 }] }]
        };
        realizarBaixaTecidos(ped);
        return { saldo: db.estoque[0].metragem_atual };
    });
    expect(r.saldo, 'a baixa normal segue funcionando').toBe(38);
});

test('item infinito fica fora do alerta de estoque baixo', async ({ page }) => {
    await importar(page, { estoque: 'infinito', markup: 80 });

    // Rolo com saldo abaixo do mínimo de 10 m: sem a regra, este item
    // apareceria no alerta de ponto de pedido. O alerta exige entrada
    // anterior, então o rolo também serve para cumprir esse requisito.
    await page.evaluate(() => {
        const tec = db.catalogo[0];
        db.estoque.push({ id: 1, tecido_id: tec.id, lote: 'L1', metragem_inicial: 40, metragem_atual: 2, data_entrada: '2026-10-01' });
        syncDB();
    });
    await page.goto(BASE + '/estoque.html');
    await expect(page.locator('#alertas-ponto-pedido')).toBeHidden();
});

test('o mesmo item, sem ser infinito, alerta normalmente', async ({ page }) => {
    await importar(page, { estoque: 'ajustar', markup: 80 });
    await page.evaluate(() => {
        const tec = db.catalogo[0];
        db.estoque.push({ id: 1, tecido_id: tec.id, lote: 'L1', metragem_inicial: 40, metragem_atual: 2, data_entrada: '2026-10-01' });
        syncDB();
    });
    await page.goto(BASE + '/estoque.html');
    await expect(page.locator('#alertas-ponto-pedido'), 'controle normal continua alertando').toBeVisible();
});

test('a escolha fica guardada no perfil do fornecedor', async ({ page }) => {
    await importar(page, { margem: 'total', markup: 25, estoque: 'infinito' });
    const perfil = await page.evaluate(() => db.import_perfis[0]);
    expect(perfil.margem_modo).toBe('total');
    expect(perfil.estoque_modo).toBe('infinito');
    expect(perfil.markup_padrao).toBe(25);
});
