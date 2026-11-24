// Pendencias R3, tarefa 4: testes que faltavam da Fase 0 (cancelar janelas, estorno
// de parcela vencida e sem permissao, custo guardado, nota em conta parcelada,
// aliquota fora da faixa, ciclo estorno -> exportar -> importar).
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acaoLanc } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
// Varias acoes terminam recarregando a pagina: repete a leitura/escrita se a recarga pegar no meio
// (contexto destruido ou scripts da pagina nova ainda nao carregados).
async function tentar(page, fn, arg) {
    for (let i = 0; i < 40; i++) {
        try { return await page.evaluate(fn, arg); }
        catch (e) { if (!/context was destroyed|navigation|is not defined/i.test(String(e))) throw e; await page.waitForLoadState('load'); }
    }
    throw new Error('pagina nao estabilizou');
}
const lerChave = (page, k) => tentar(page, c => JSON.parse(localStorage.getItem(c)), k);
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const ped = extra => ({ id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Instalado', financeiro_gerado: true,
    valor: 1000, valor_recebido: 0, ambientes: [], itens: [], forma_pagamento: 'PIX', ...(extra || {}) });
const cr = (id, status, extra) => ({ id, pedido_id: 26500, cliente_nome: 'Ana', descricao: 'Parcela ' + id, valor: 500,
    data_vencimento: '2026-10-01', data_pagamento: status === 'Pago' ? '2026-10-01' : null, status, ...(extra || {}) });
const soVisualizar = (page, modulo) => page.evaluate(m => {
    const u = JSON.parse(localStorage.getItem('sc_usr'));
    u[0].permissoes_extras = { [m]: { nivel: 'visualizar', acoes_restritas: [] } };
    localStorage.setItem('sc_usr', JSON.stringify(u));
}, modulo);

// ---- 1. Cancelar a janela de baixa / de comissao sem mudar nada ----
test('cancelar a janela de recebimento nao muda nada', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ status: 'Medição' })], sc_cr: [cr(601, 'Pendente', { data_vencimento: '2099-01-10' })] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    const antes = await page.evaluate(() => [localStorage.getItem('sc_cr'), localStorage.getItem('sc_ped'), localStorage.getItem('sc_mov_fin')]);
    await acaoLanc(page, 'receber', 'Dar baixa');
    await expect(page.locator('#baixa-modal')).toBeVisible();
    await page.locator('#baixa-cancel').click();
    await expect(page.locator('#baixa-modal')).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.getItem('sc_cr'), localStorage.getItem('sc_ped'), localStorage.getItem('sc_mov_fin')])).toEqual(antes);
    expect((await lerChave(page, 'sc_cr'))[0].status).toBe('Pendente');
});

test('cancelar a janela de pagamento (Escape) nao muda nada', async ({ page }) => {
    const cp = { id: 801, descricao: 'Tecido', credor_nome: 'RC', valor: 300, categoria: 'tecido', data_vencimento: '2099-01-10', data_pagamento: null, status: 'Pendente', tipo: 'variavel' };
    await entrar(page, BASE, { sc_cp: [cp] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    const antes = await page.evaluate(() => [localStorage.getItem('sc_cp'), localStorage.getItem('sc_mov_fin')]);
    await acaoLanc(page, 'pagar', 'Dar baixa');
    await expect(page.locator('#baixa-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#baixa-modal')).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.getItem('sc_cp'), localStorage.getItem('sc_mov_fin')])).toEqual(antes);
    expect((await lerChave(page, 'sc_cp'))[0].status).toBe('Pendente');
});

test('cancelar a janela de comissao deixa a comissao pendente', async ({ page }) => {
    const cp = { id: 701, pedido_id: 26500, descricao: 'Comissão', credor_nome: 'Bruno', valor: 50, categoria: 'comissao', papel_comissao: 'vendedor',
        data_vencimento: '2026-10-20', data_pagamento: null, status: 'Pendente', tipo: 'variavel' };
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: [{ id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' }],
        sc_ped: [ped({ valor_recebido: 1000, vendedor_id: 2, vendedor_nome: 'Bruno', comissao_valor: 50, comissao_pct: 5 })], sc_cp: [cp] });
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await expect(page.locator('#tb-comissoes-pendentes button', { hasText: 'Pagar' })).toBeVisible();
    const antes = await page.evaluate(() => [localStorage.getItem('sc_cp'), localStorage.getItem('sc_ped'), localStorage.getItem('sc_mov_fin')]);
    await page.locator('#tb-comissoes-pendentes button', { hasText: 'Pagar' }).click();
    await expect(page.locator('#baixa-modal')).toBeVisible();
    await page.locator('#baixa-cancel').click();
    await expect(page.locator('#baixa-modal')).toHaveCount(0);
    await expect(page.locator('#tb-comissoes-pendentes button', { hasText: 'Pagar' })).toBeVisible();
    expect(await page.evaluate(() => [localStorage.getItem('sc_cp'), localStorage.getItem('sc_ped'), localStorage.getItem('sc_mov_fin')])).toEqual(antes);
    expect((await lerChave(page, 'sc_cp'))[0].status).toBe('Pendente');
});

// ---- 2. Estorno de parcela vencida volta "Atrasado"; permissao negada ----
test('estornar parcela vencida volta como Atrasado (a receber)', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ valor_recebido: 500 })],
        sc_cr: [cr(601, 'Pago', { data_vencimento: '2020-01-10', data_pagamento: '2020-01-10' })] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await acaoLanc(page, 'receber', 'Estornar');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr'))[0].status).toBe('Atrasado');
    const c = (await lerChave(page, 'sc_cr'))[0];
    expect(c.data_pagamento).toBeFalsy();
    expect(c.estornado_por).toBe(1);
});

test('estornar conta a pagar vencida volta como Atrasado; a de data futura volta Pendente', async ({ page }) => {
    const cp = (id, venc) => ({ id, descricao: 'Conta ' + id, credor_nome: 'RC', valor: 300, categoria: 'tecido', data_vencimento: venc,
        data_pagamento: '2020-01-05', status: 'Pago', tipo: 'variavel', forma_pagamento: 'PIX' });
    await entrar(page, BASE, { sc_cp: [cp(801, '2020-01-10'), cp(802, '2099-01-10')] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    await expect(page.locator('#tb-contas-pagar')).toContainText('Conta 801');
    await page.evaluate(() => { estornarCP(801); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).find(c => c.id === 801).status).toBe('Atrasado');
    await abrirLancamentos(page, 'pagar');
    await expect(page.locator('#tb-contas-pagar')).toContainText('Conta 802');
    await page.waitForFunction(() => typeof estornarCP === 'function');
    await page.evaluate(() => { estornarCP(802); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).find(c => c.id === 802).status).toBe('Pendente');
});

test('sem permissao nao estorna o recebimento', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ valor_recebido: 500 })], sc_cr: [cr(601, 'Pago')] });
    await soVisualizar(page, 'financeiro.receber');
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await expect(page.locator('#tb-contas-receber')).toContainText('Parcela 601');
    await page.evaluate(() => { estornarCR(601); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await page.locator('#sc-modal-ok').click();
    const c = (await lerChave(page, 'sc_cr'))[0];
    expect(c.status).toBe('Pago');
    expect(c.estornado_por).toBeUndefined();
    expect((await lerChave(page, 'sc_ped'))[0].valor_recebido).toBe(500);
});

test('sem permissao nao estorna o pagamento nem a comissao', async ({ page }) => {
    const cp = { id: 801, descricao: 'Tecido', credor_nome: 'RC', valor: 300, categoria: 'tecido', data_vencimento: '2026-10-10',
        data_pagamento: '2026-10-10', status: 'Pago', tipo: 'variavel' };
    const com = { id: 701, pedido_id: 26500, descricao: 'Comissão', credor_nome: 'Bruno', valor: 50, categoria: 'comissao', papel_comissao: 'vendedor',
        data_vencimento: '2026-10-20', data_pagamento: '2026-10-25', status: 'Pago', tipo: 'variavel' };
    await entrar(page, BASE, { sc_cli: CLI, sc_cp: [cp, com], sc_ped: [ped({ vendedor_id: 2, comissao_paga: true })] });
    await soVisualizar(page, 'financeiro.pagar');
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    await expect(page.locator('#tb-contas-pagar')).toContainText('Tecido');
    await page.evaluate(() => { estornarCP(801); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await page.locator('#sc-modal-ok').click();
    await page.evaluate(() => { estornarCP(701); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await page.locator('#sc-modal-ok').click();
    const cps = await lerChave(page, 'sc_cp');
    expect(cps.map(c => c.status)).toEqual(['Pago', 'Pago']);
    expect(cps.some(c => c.estornado_por !== undefined)).toBe(false);
});

// ---- 3. Custo guardado ao aprovar por moverStatus / salvarPedido e na reaprovacao ----
const VEND = [{ id: 1, nome: 'Ana', comissao_pct: 0 }];
const MAT = custo => [{ id: 1, nome: 'Trilho', preco_custo: custo, preco_venda: 100 }];
const orc = extra => ({ id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Orçamento', valor: 1000, vendedor_id: 1, vendedor_nome: 'Ana',
    data_entrega: '2026-12-01', ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [{ materialId: 1, nome: 'Trilho', quantidade: 2, preco_unit: 100, subtotal: 200 }], ...(extra || {}) });

test('moverStatus de Orcamento para Medicao guarda o custo; avancar depois nao refaz', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_mat: MAT(30), sc_ped: [orc()] });
    await page.goto(BASE + '/index.html');
    expect((await lerChave(page, 'sc_ped'))[0].custo_snapshot).toBeUndefined();
    await page.evaluate(() => { moverStatus(26500, 1); });
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).toBe('Medição');
    const p = (await lerChave(page, 'sc_ped'))[0];
    expect(p.custo_snapshot.total).toBe(60);
    expect(p.custo_snapshot.faltando).toBe(0);
    expect(p.custo_snapshot.data).toBe(await tentar(page, () => hojeLocal()));
    await tentar(page, () => { const m = JSON.parse(localStorage.getItem('sc_mat')); m[0].preco_custo = 90; localStorage.setItem('sc_mat', JSON.stringify(m)); });
    await page.reload();
    await page.evaluate(() => { moverStatus(26500, 1); });
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].status).not.toBe('Medição');
    expect((await lerChave(page, 'sc_ped'))[0].custo_snapshot.total, 'custo guardado nao muda ao avancar').toBe(60);
});

test('salvarPedido que tira o pedido de Orcamento guarda o custo; continuar em Orcamento nao guarda', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_mat: MAT(30), sc_vend: VEND, sc_ped: [orc()], sc_editando_id: 26500 });
    await page.goto(BASE + '/pedido.html');
    await expect(page.locator('#ped-status')).toHaveValue('Orçamento');
    await page.evaluate(() => { document.getElementById('ped-desconto').value = 0; salvarPedido(); });
    await page.waitForURL(/index\.html/);
    let p = (await lerChave(page, 'sc_ped'))[0];
    expect(p.status).toBe('Orçamento');
    expect(p.custo_snapshot, 'orcamento nao guarda custo').toBeUndefined();
    await tentar(page, () => localStorage.setItem('sc_editando_id', '26500'));
    await page.goto(BASE + '/pedido.html');
    await page.selectOption('#ped-status', 'Medição');
    await page.evaluate(() => { document.getElementById('ped-desconto').value = 0; salvarPedido(); });
    await page.waitForURL(/index\.html/);
    p = (await lerChave(page, 'sc_ped'))[0];
    expect(p.status).toBe('Medição');
    expect(p.custo_snapshot.total).toBe(60);
});

test('reaprovar depois de voltar para Orcamento refaz o custo com o preco de agora', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_mat: MAT(30), sc_ped: [orc()] });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { aprovarPedido(26500); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].custo_snapshot?.total).toBe(60);
    await tentar(page, () => { const m = JSON.parse(localStorage.getItem('sc_mat')); m[0].preco_custo = 45; localStorage.setItem('sc_mat', JSON.stringify(m)); localStorage.setItem('sc_editando_id', '26500'); });
    await page.goto(BASE + '/pedido.html');
    await page.click('#ped-voltar-orcamento');
    await page.locator('#sc-modal-ok').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_ped'))[0].status === 'Orçamento');
    expect((await lerChave(page, 'sc_ped'))[0].custo_snapshot.total, 'voltar nao mexe no custo guardado').toBe(60);
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { aprovarPedido(26500); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_ped'))[0].custo_snapshot?.total).toBe(90);
});

// ---- 4. Nota em conta parcelada; parcelas 100/3; soma de grupo ----
const parcelaPC = (id, valor, extra) => ({ id, pedido_compra_id: 5001, lancamento_pai_id: 900, parcelado: true, numero_parcelas: 3, cnpj_fornecedor: '11.222.333/0001-81',
    credor_nome: 'RC Tecidos', categoria: 'tecido', descricao: 'Pedido de compra #5001 (parcela ' + (id - 900) + '/3)', valor,
    data_vencimento: '2099-01-10', data_pagamento: null, status: 'Pendente', tipo: 'variavel', ...(extra || {}) });
const lancarNota = (page, valor) => page.evaluate(v => {
    abrirModalContaPagar('manual');
    document.getElementById('cpm-descricao').value = 'NF 123';
    document.getElementById('cpm-cnpj').value = '11.222.333/0001-81';
    document.getElementById('cpm-credor').value = 'RC Tecidos';
    document.getElementById('cpm-valor').value = v;
    document.getElementById('cpm-vencimento').value = '2099-01-10';
    document.getElementById('cpm-doc').value = '123456';
    _anexoPendenteCP = { nome: 'nf.pdf', tipo: 'application/pdf', dataUrl: 'data:application/pdf;base64,AAAA', chaveAcesso: null };
    adicionarContaPagarManual();
}, valor);
const abrirPagar = async (page, cps) => {
    await entrar(page, BASE, { sc_forn: [{ id: 7, nome: 'RC Tecidos' }], sc_cp: cps });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
};

test('nota que bate com a soma das parcelas vincula as 3 parcelas e nao cria conta', async ({ page }) => {
    await abrirPagar(page, [parcelaPC(901, 333.33), parcelaPC(902, 333.33), parcelaPC(903, 333.34)]);
    await lancarNota(page, '1000.00');
    await expect(page.locator('#sc-modal-msg')).toContainText('Esta nota é a mesma compra?');
    await page.locator('#sc-modal-btns button', { hasText: 'Vincular à conta existente' }).click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp'))[0].numero_documento).toBe('123456');
    const cps = await lerChave(page, 'sc_cp');
    expect(cps).toHaveLength(3);
    expect(cps.map(c => [c.numero_documento, c.tipo_lancamento])).toEqual([['123456', 'nota'], ['123456', 'nota'], ['123456', 'nota']]);
    expect(cps.map(c => c.arquivo_anexo_nome || null), 'anexo so na primeira').toEqual(['nf.pdf', null, null]);
});

test('nota achada por parcela em aberto (outra ja paga) vincula so as parcelas do grupo', async ({ page }) => {
    await abrirPagar(page, [parcelaPC(901, 333.33, { status: 'Pago', data_pagamento: '2026-10-01' }), parcelaPC(902, 333.33), parcelaPC(903, 333.34),
        { id: 950, descricao: 'Outra', credor_nome: 'X', valor: 80, categoria: 'outro', data_vencimento: '2099-01-10', data_pagamento: null, status: 'Pendente', tipo: 'variavel' }]);
    await lancarNota(page, '1000.00');
    await page.locator('#sc-modal-btns button', { hasText: 'Vincular à conta existente' }).click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp'))[1].numero_documento).toBe('123456');
    const cps = await lerChave(page, 'sc_cp');
    expect(cps).toHaveLength(4);
    expect(cps.map(c => c.numero_documento || null)).toEqual(['123456', '123456', '123456', null]);
});

test('nota de valor que nao bate com parcela nem com a soma do grupo nao oferece vincular', async ({ page }) => {
    await abrirPagar(page, [parcelaPC(901, 333.33), parcelaPC(902, 333.33), parcelaPC(903, 333.34)]);
    await lancarNota(page, '900.00');
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).length).toBe(4);
    await expect(page.locator('#sc-modal-btns button', { hasText: 'Vincular à conta existente' })).toHaveCount(0);
});

test('parcelar 100 em 3 da 33,33 + 33,33 + 33,34 com vencimentos mensais', async ({ page }) => {
    await abrirPagar(page, []);
    await page.evaluate(() => {
        abrirModalContaPagar('manual');
        document.getElementById('cpm-descricao').value = 'Maquina';
        document.getElementById('cpm-credor').value = 'RC';
        document.getElementById('cpm-valor').value = '100.00';
        document.getElementById('cpm-vencimento').value = '2099-01-31';
        document.getElementById('cpm-parcelado').checked = true;
        document.getElementById('cpm-parcelas').value = '3';
        adicionarContaPagarManual();
    });
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).length).toBe(3);
    const cps = await lerChave(page, 'sc_cp');
    expect(cps.map(c => c.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(cps.map(c => c.data_vencimento)).toEqual(['2099-01-31', '2099-02-28', '2099-03-31']);
    expect(cps.map(c => c.parcela_atual)).toEqual([1, 2, 3]);
    expect(new Set(cps.map(c => c.lancamento_pai_id)).size).toBe(1);
    expect(Math.round(cps.reduce((s, c) => s + c.valor, 0) * 100)).toBe(10000);
});

// ---- 5. Aliquota fora da faixa / invalida ----
test('aliquota fora da faixa ou invalida: acima de 100 vira 100; negativa, texto e vazia viram 0', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'CORTINAS X', regime_tributario: 'simples', aliquota_estimada: 6 } });
    await page.goto(BASE + '/empresa.html');
    await expect(page.locator('#emp-aliquota')).toHaveValue('6');
    const salvar = async texto => {
        await page.fill('#emp-aliquota', texto);
        await page.evaluate(() => salvarEmpresaConfigs());
        return (await lerChave(page, 'sc_empresa')).aliquota_estimada;
    };
    expect(await salvar('150')).toBe(100);
    expect(await salvar('-5')).toBe(0);
    expect(await salvar('12,5')).toBe(12.5);
    expect(await salvar('abc')).toBe(0);
    expect(await salvar('')).toBe(0);
    await page.reload();
    await expect(page.locator('#emp-aliquota')).toHaveValue('0');
    expect((await lerChave(page, 'sc_empresa')).razao_social).toBe('CORTINAS X');
});

// ---- 6. Ciclo estorno -> exportar -> importar ----
test('estorno, exportar e importar: a parcela continua em aberto (a migracao nao baixa de novo)', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped({ valor_recebido: 500, pagamento_pendente: false, pagamento_confirmado_em: Date.now() })],
        sc_cr: [cr(601, 'Pago'), cr(602, 'Pago', { data_vencimento: '2099-01-10', data_pagamento: '2026-10-02' })] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await page.evaluate(() => { estornarCR(601); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr')).find(c => c.id === 601).status).toBe('Atrasado');
    const dados = await tentar(page, () => JSON.parse(JSON.stringify(_dadosExportacao(localStorage.getItem('sc_fin_migracao') === '1'))));
    expect(dados.fin_fase0, 'o arquivo sai com a marca da Fase 0').toBe(1);
    expect(dados.contas_receber.find(c => c.id === 601)).toMatchObject({ status: 'Atrasado', estornado_por: 1 });
    expect(dados.pedidos[0].pagamento_pendente).toBe(true);
    // zera o navegador e importa o arquivo
    await page.evaluate(() => { ['sc_cr', 'sc_ped', 'sc_mov_fin', 'sc_fin_migracao'].forEach(k => localStorage.removeItem(k)); });
    await page.goto(BASE + '/index.html');
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }), JSON.stringify(dados));
    await page.locator('#sc-modal-ok').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cr') || '[]').length === 2);
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await expect(page.locator('#tb-contas-receber')).toContainText('Parcela 601');
    const crs = await lerChave(page, 'sc_cr');
    const c601 = crs.find(c => c.id === 601);
    expect(c601.status).toBe('Atrasado');
    expect(c601.data_pagamento).toBeFalsy();
    expect(c601.estornado_por).toBe(1);
    expect(crs.find(c => c.id === 602).status).toBe('Pago');
    const p = (await lerChave(page, 'sc_ped'))[0];
    expect(p.pagamento_pendente).toBe(true);
    expect(p.valor_recebido).toBe(500);
    expect(await lerChave(page, 'sc_mov_fin') || []).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
});
