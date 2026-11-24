// Pendencias R3, tarefa 5: testes que faltavam das Fases 1, 2 e 3 (cartao, estorno sem conta,
// cobranca, excluir transferencia sem permissao, janelas de ajuste do Resultado, ajuste de
// entrada e "Deixar anotado" no fechamento, duplo clique em Lancar, migracao da permissao do
// simulador nas permissoes extras do usuario) e o caminho da importacao sem espaco.
//
// Ja cobertos em outro lugar (nao duplicados aqui):
//  - estorno de pagamento / comissao com permissao negada: financeiro-pendencias-r3-fase0.spec.js
//  - periodicidade de despesas fixas e alta de grupo no limite (30% / R$ 100): tests/caixa-core.test.js e tests/fechamento-core.test.js
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acaoLanc, acoesDaLinha, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8175';
// Varias acoes terminam recarregando a pagina: espera a recarga em vez de falhar no meio dela.
async function lerChave(page, k) {
    for (let i = 0; i < 40; i++) {
        try { return await page.evaluate(c => JSON.parse(localStorage.getItem(c)), k); }
        catch (e) { if (!/context was destroyed|navigation/i.test(String(e))) throw e; await page.waitForLoadState('load'); }
    }
    throw new Error('pagina nao estabilizou');
}
const brutas = (page, ks) => page.evaluate(chaves => chaves.map(c => localStorage.getItem(c)), ks);
const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somarDias = (dataISO, dias) => { const d = new Date(dataISO + 'T12:00:00'); d.setDate(d.getDate() + dias); return iso(d); };
const HOJE = iso(new Date());
const soVisualizar = (page, modulo) => page.evaluate(m => {
    const u = JSON.parse(localStorage.getItem('sc_usr'));
    u[0].permissoes_extras = { [m]: { nivel: 'visualizar', acoes_restritas: [] } };
    localStorage.setItem('sc_usr', JSON.stringify(u));
}, modulo);

const CONTAS = [
    { id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true },
    { id: 11, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true },
    { id: 12, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true,
      cartao: { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 } }
];
const MEIOS = [
    { id: 21, nome: 'Dinheiro', tipo: 'dinheiro', conta_id: 10 },
    { id: 22, nome: 'PIX', tipo: 'pix', conta_id: 11 },
    { id: 25, nome: 'Cartão de débito', tipo: 'cartao_debito', conta_id: 12 },
    { id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: 12 }
];
const CLI = [{ id: 1, nome: 'Ana Paula Lima', tel: '(11) 98765-4321' }];
const pedido = extra => ({ id: 26300, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Instalado', financeiro_gerado: true,
    valor: 3000, valor_recebido: 0, pagamento_pendente: false, forma_pagamento: 'PIX', ambientes: [], ...(extra || {}) });
const cr = extra => ({ id: 601, pedido_id: 26300, cliente_nome: 'Ana Paula Lima', descricao: 'Pedido #26300 - Saldo', valor: 3000,
    data_vencimento: '2099-12-10', data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });

async function abrirReceber(page, dados) {
    await entrar(page, BASE, { sc_cli: CLI, sc_contas_fin: CONTAS, sc_meios_pag: MEIOS, sc_ped: [pedido()], sc_cr: [cr()], ...dados });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
}
async function abrirBaixa(page) {
    await acaoLanc(page, 'receber', 'Dar baixa');
    const modal = page.locator('#baixa-modal');
    await expect(modal).toBeVisible();
    return modal;
}

// ============ Fase 1: cartao na baixa ============
test('cartao: cancelar a baixa (botao e Escape) depois de escolher cartao nao muda nada', async ({ page }) => {
    await abrirReceber(page, {});
    const chaves = ['sc_cr', 'sc_cp', 'sc_mov_fin', 'sc_ped'];
    const antes = await brutas(page, chaves);
    let modal = await abrirBaixa(page);
    let linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'Cartão de crédito' });
    await linha.locator('.baixa-vezes').selectOption('3');
    await linha.locator('.baixa-antecipar').check();
    await modal.locator('#baixa-cancel').click();
    await expect(page.locator('#baixa-modal')).toHaveCount(0);
    expect(await brutas(page, chaves)).toEqual(antes);
    // Escape faz o mesmo, e a janela reabre limpa (sem o cartao escolhido antes).
    modal = await abrirBaixa(page);
    linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'Cartão de débito' });
    await page.keyboard.press('Escape');
    await expect(page.locator('#baixa-modal')).toHaveCount(0);
    expect(await brutas(page, chaves)).toEqual(antes);
    modal = await abrirBaixa(page);
    await expect(modal.locator('.baixa-linha').first().locator('.baixa-vezes')).toBeHidden();
    expect((await lerChave(page, 'sc_cr'))[0].status).toBe('Pendente');
});

test('cartao de debito: um repasse no dia seguinte, taxa de 1,5% paga, sem parcelas', async ({ page }) => {
    await abrirReceber(page, {});
    const modal = await abrirBaixa(page);
    const linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'Cartão de débito' });
    await expect(linha.locator('.baixa-conta')).toHaveValue('12');
    await expect(linha.locator('.baixa-vezes')).toBeHidden();
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr'))[0].status).toBe('Pago');
    const c = (await lerChave(page, 'sc_cr'))[0];
    expect(c.cartao).toEqual({ tipo: 'debito', vezes: 1, antecipar: false });
    expect([c.meio_id, c.conta_id, c.forma_pagamento]).toEqual([25, 12, 'Cartão de débito']);
    const amanha = somarDias(HOJE, 1);
    const movs = await lerChave(page, 'sc_mov_fin');
    expect(movs.filter(m => m.sentido === 'entrada').map(m => [m.conta_id, m.data, m.valor])).toEqual([[12, amanha, 3000]]);
    const cps = await lerChave(page, 'sc_cp');
    expect(cps).toHaveLength(1);
    expect(cps[0]).toMatchObject({ categoria: 'taxa_cartao', status: 'Pago', valor: 45, conta_id: 12, origem_cr_id: 601, data_pagamento: amanha });
    expect(movs.filter(m => m.sentido === 'saida').map(m => [m.origem_id, m.valor, m.data])).toEqual([[cps[0].id, 45, amanha]]);
});

test('cartao de credito antecipado: um repasse no dia seguinte com a taxa do parcelado mais a da antecipacao', async ({ page }) => {
    await abrirReceber(page, {});
    const modal = await abrirBaixa(page);
    const linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'Cartão de crédito' });
    await linha.locator('.baixa-vezes').selectOption('3');
    await linha.locator('.baixa-antecipar').check();
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr'))[0].status).toBe('Pago');
    expect((await lerChave(page, 'sc_cr'))[0].cartao).toEqual({ tipo: 'credito', vezes: 3, antecipar: true });
    const amanha = somarDias(HOJE, 1);
    const movs = await lerChave(page, 'sc_mov_fin');
    // 3x pela taxa do parcelado (4%) + antecipacao (2%) = 6% de 3000 = 180, tudo num repasse so.
    expect(movs.filter(m => m.sentido === 'entrada').map(m => [m.data, m.valor])).toEqual([[amanha, 3000]]);
    const cps = await lerChave(page, 'sc_cp');
    expect(cps.map(c => [c.valor, c.data_pagamento])).toEqual([[180, amanha]]);
});

test('cartao: recebimento parcial divide a parcela; so a parte paga gera repasses e taxa, e o estorno junta de volta', async ({ page }) => {
    await abrirReceber(page, {});
    const modal = await abrirBaixa(page);
    const linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'Cartão de crédito' });
    await linha.locator('.baixa-vezes').selectOption('2');
    await linha.locator('.baixa-valor').fill('1000,00');
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr')).length).toBe(2);
    const crs = await lerChave(page, 'sc_cr');
    const aberta = crs.find(c => c.id === 601), paga = crs.find(c => c.id !== 601);
    expect([aberta.status, aberta.valor]).toEqual(['Pendente', 2000]);
    expect(paga).toMatchObject({ status: 'Pago', valor: 1000, parcela_origem_id: 601, conta_id: 12, meio_id: 26 });
    expect(paga.cartao).toEqual({ tipo: 'credito', vezes: 2, antecipar: false });
    const movs = await lerChave(page, 'sc_mov_fin');
    expect(movs.filter(m => m.sentido === 'entrada').map(m => [m.origem_id, m.data, m.valor]))
        .toEqual([[paga.id, somarDias(HOJE, 30), 500], [paga.id, somarDias(HOJE, 60), 500]]);
    const cps = await lerChave(page, 'sc_cp');
    expect(cps.map(c => [c.origem_cr_id, c.valor])).toEqual([[paga.id, 20], [paga.id, 20]]);
    expect((await lerChave(page, 'sc_ped'))[0].valor_recebido).toBe(1000);

    // Estorno da parte paga: o valor volta para a parcela aberta e some tudo o que o cartao gerou.
    await abrirLancamentos(page, 'receber'); // a pagina recarregou e voltou para a aba Hoje
    await acaoLanc(page, 'receber', 'Estornar');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr')).length).toBe(1);
    const volta = (await lerChave(page, 'sc_cr'))[0];
    expect([volta.id, volta.status, volta.valor]).toEqual([601, 'Pendente', 3000]);
    expect(await lerChave(page, 'sc_mov_fin')).toEqual([]);
    expect(await lerChave(page, 'sc_cp')).toEqual([]);
    expect((await lerChave(page, 'sc_ped'))[0].valor_recebido).toBe(0);
});

test('cartao com a maquininha removida: o parcial vale, fica sem conta e sem movimento, e a taxa continua existindo', async ({ page }) => {
    // O meio de cartao ainda aponta para a conta 12, que ja foi apagada.
    await abrirReceber(page, { sc_contas_fin: CONTAS.slice(0, 2) });
    const modal = await abrirBaixa(page);
    const linha = modal.locator('.baixa-linha').first();
    await linha.locator('.baixa-meio').selectOption({ label: 'Cartão de crédito' });
    await expect(linha.locator('.baixa-conta')).toHaveValue('');
    await expect(linha.locator('.baixa-conta option')).toHaveCount(1);
    await expect(linha.locator('.baixa-aviso')).toBeVisible();
    await linha.locator('.baixa-vezes').selectOption('2');
    await linha.locator('.baixa-valor').fill('1000,00');
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr')).length).toBe(2);
    const crs = await lerChave(page, 'sc_cr');
    expect(crs.find(c => c.id === 601)).toMatchObject({ status: 'Pendente', valor: 2000 });
    const paga = crs.find(c => c.id !== 601);
    expect(paga).toMatchObject({ status: 'Pago', valor: 1000, parcela_origem_id: 601, conta_id: null, meio_id: 26 });
    expect(paga.cartao).toMatchObject({ tipo: 'credito', vezes: 2 });
    expect(paga.cartao.repasses.map(r => [r.data, r.bruto])).toEqual([[somarDias(HOJE, 30), 500], [somarDias(HOJE, 60), 500]]);
    expect(await lerChave(page, 'sc_mov_fin')).toEqual([]);
    const cps = await lerChave(page, 'sc_cp');
    expect(cps.map(c => [c.categoria, c.status, c.conta_id, c.origem_cr_id])).toEqual([['taxa_cartao', 'Pago', null, paga.id], ['taxa_cartao', 'Pago', null, paga.id]]);
    expect(cps.reduce((s, c) => s + c.valor, 0)).toBe(40);
    // Estornar tira a conta de taxa e junta a parte de volta, mesmo sem conta.
    await abrirLancamentos(page, 'receber'); // a pagina recarregou e voltou para a aba Hoje
    await acaoLanc(page, 'receber', 'Estornar');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cr')).length).toBe(1);
    expect((await lerChave(page, 'sc_cr'))[0].valor).toBe(3000);
    expect(await lerChave(page, 'sc_cp')).toEqual([]);
});

// ============ Fase 1: estorno de pagamento sem conta ============
test('estornar pagamento feito sem conta: volta a ficar em aberto e nao mexe nos movimentos de outra conta paga', async ({ page }) => {
    const cp = (id, extra) => ({ id, descricao: 'Conta ' + id, credor_nome: 'RC', valor: 300, categoria: 'tecido', data_vencimento: '2099-01-10',
        data_pagamento: HOJE, status: 'Pago', tipo: 'variavel', forma_pagamento: 'Dinheiro', ...(extra || {}) });
    const mov = { id: 91, conta_id: 11, data: HOJE, sentido: 'saida', valor: 300, origem: 'cp', origem_id: 802, grupo_id: 5, descricao: 'Conta 802' };
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_meios_pag: MEIOS,
        sc_cp: [cp(801, { conta_id: null, meio_id: null }), cp(802, { conta_id: 11, meio_id: 22, forma_pagamento: 'PIX' })], sc_mov_fin: [mov] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    const linha801 = page.locator('#tb-contas-pagar tr', { hasText: 'Conta 801' });
    await expect(linha801).toBeVisible();
    await acaoMenu(page, linha801, 'Estornar');
    await expect(page.locator('#sc-modal-msg')).toHaveText('Estornar este pagamento? A conta volta a ficar em aberto.');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).find(c => c.id === 801).status).toBe('Pendente');
    const cps = await lerChave(page, 'sc_cp');
    const a = cps.find(c => c.id === 801), b = cps.find(c => c.id === 802);
    expect(a.data_pagamento).toBeNull();
    expect(a.estornado_por).toBe(1);
    expect(b.status).toBe('Pago');
    expect(await lerChave(page, 'sc_mov_fin')).toEqual([mov]);
});

// ============ Fase 1: cobranca ============
async function abrirCobranca(page, dados, retorno) {
    await entrar(page, BASE, dados);
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(r => { window.__abertos = []; window.open = u => { window.__abertos.push(u); return r ? {} : null; }; }, retorno !== false);
    await abrirLancamentos(page, 'receber');
}
const abertos = page => page.evaluate(() => window.__abertos);
const crVenc = extra => ({ id: 601, pedido_id: 26300, cliente_nome: 'Ana', descricao: 'Saldo', valor: 2000,
    data_vencimento: HOJE, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });

test('cobranca: sem pedido casa o cliente pelo nome (sem diferenciar maiusculas nem espacos nas pontas)', async ({ page }) => {
    await abrirCobranca(page, { sc_cli: [{ id: 5, nome: '  ANA paula ', tel: '11 93333-3333' }, { id: 6, nome: 'Outra', tel: '11 94444-4444' }],
        sc_ped: [], sc_cr: [crVenc({ pedido_id: null, cliente_nome: 'Ana Paula' })] });
    await acaoLanc(page, 'receber', 'Cobrar no WhatsApp');
    await expect.poll(() => abertos(page)).toHaveLength(1);
    expect((await abertos(page))[0]).toMatch(/^https:\/\/wa\.me\/5511933333333\?text=/);
});

test('cobranca: cliente do pedido que nao existe mais cai no nome; sem nome que case, avisa que nao tem telefone', async ({ page }) => {
    // clienteId 99 foi apagado do cadastro: o nome da parcela acha a Ana (so uma).
    await abrirCobranca(page, { sc_cli: [{ id: 2, nome: 'Ana', tel: '11 92222-2222' }],
        sc_ped: [pedido({ clienteId: 99, clienteNome: 'Ana' })], sc_cr: [crVenc()] });
    await acaoLanc(page, 'receber', 'Cobrar no WhatsApp');
    await expect.poll(() => abertos(page)).toHaveLength(1);
    expect((await abertos(page))[0]).toMatch(/^https:\/\/wa\.me\/5511922222222\?text=/);
    await expect(page.locator('#tb-contas-receber')).toContainText('cobrado hoje');
});

test('cobranca: id apagado e nome que nao casa com ninguem: avisa e nao abre nem marca cobrado hoje', async ({ page }) => {
    await abrirCobranca(page, { sc_cli: [{ id: 2, nome: 'Bia', tel: '11 92222-2222' }],
        sc_ped: [pedido({ clienteId: 99, clienteNome: 'Ana' })], sc_cr: [crVenc()] });
    await acaoLanc(page, 'receber', 'Cobrar no WhatsApp');
    await expect(page.locator('#sc-modal-msg')).toHaveText('Cliente sem telefone no cadastro.');
    await page.locator('#sc-modal-ok').click();
    expect(await abertos(page)).toEqual([]);
    expect((await lerChave(page, 'sc_cr'))[0].ultima_cobranca).toBeUndefined();
});

test('cobranca: so visualizar nao ve Cobrar e a funcao recusa, sem abrir nada', async ({ page }) => {
    await abrirCobranca(page, { sc_cli: [{ id: 2, nome: 'Ana', tel: '11 92222-2222' }], sc_ped: [pedido({ clienteId: 2 })], sc_cr: [crVenc()] });
    await soVisualizar(page, 'financeiro.receber');
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { window.__abertos = []; window.open = u => { window.__abertos.push(u); return {}; }; });
    await abrirLancamentos(page, 'receber');
    await expect(page.locator('#tb-contas-receber')).toContainText('Saldo');
    expect(await acoesDaLinha(page, page.locator('#tb-contas-receber tr').first())).not.toContain('Cobrar no WhatsApp');
    await page.evaluate(() => { cobrarNoWhatsApp(601); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await page.locator('#sc-modal-ok').click();
    expect(await abertos(page)).toEqual([]);
    expect((await lerChave(page, 'sc_cr'))[0].ultima_cobranca).toBeUndefined();
});

// ============ Fase 1: excluir transferencia sem permissao ============
test('excluir transferencia sem permissao completa do Extrato: sem botao, a funcao recusa e os dois lados ficam', async ({ page }) => {
    const mov = (id, conta, sentido, descricao) => ({ id, conta_id: conta, data: HOJE, sentido, valor: 40, origem: 'transferencia', origem_id: null, grupo_id: 777, descricao });
    const movs = [mov(20, 10, 'saida', 'Transferência para Banco'), mov(21, 11, 'entrada', 'Transferência de Caixa')];
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_mov_fin: movs });
    await soVisualizar(page, 'financeiro.fluxo');
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    await expect(page.locator('#extrato-linhas .extrato-linha')).toHaveCount(2);
    await expect(page.locator('#extrato-linhas .extrato-excluir')).toHaveCount(0);
    await page.evaluate(() => { excluirTransferencia(777); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#sc-modal-overlay')).toBeHidden();
    expect(await lerChave(page, 'sc_mov_fin')).toEqual(movs);
    await expect(page.locator('#extrato-linhas .extrato-linha')).toHaveCount(2);
});

// ============ Fase 2 e 3: Resultado do mes (clock em 05/11/2026, outubro fechavel) ============
const CONTAS_FECH = [{ id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-09-01', ativo: true }];
const movF = (id, data, sentido, valor, origem, origem_id, descricao) => ({ id, conta_id: 10, data, sentido, valor, origem, origem_id, grupo_id: null, descricao });
const SEED_FECH = {
    sc_contas_fin: CONTAS_FECH,
    sc_cr: [{ id: 1, pedido_id: 101, cliente_nome: 'Cli 1', descricao: 'Pedido 1', valor: 500, data_vencimento: '2026-10-10', data_pagamento: '2026-10-10', status: 'Pago', parcela_tipo: 'saldo' }],
    sc_cp: [
        { id: 1, descricao: 'Tecido pago', categoria: 'tecido', tipo: 'variavel', valor: 200, data_vencimento: '2026-10-15', data_pagamento: '2026-10-15', status: 'Pago' },
        { id: 2, descricao: 'Conta de luz', categoria: 'outros', tipo: 'variavel', valor: 80, data_vencimento: '2026-10-20', data_pagamento: null, status: 'Pendente' }
    ],
    sc_mov_fin: [movF(1, '2026-10-10', 'entrada', 500, 'cr', 1, 'Pedido 1'), movF(2, '2026-10-15', 'saida', 200, 'cp', 1, 'Tecido pago')]
};
async function abrirResultado(page, extras) {
    await page.clock.install({ time: new Date('2026-11-05T10:00:00') });
    await entrar(page, BASE, { ...SEED_FECH, ...(extras || {}) });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await page.fill('#res-mes', '2026-10');
    await page.locator('#res-mes').dispatchEvent('change');
}
const fechModal = page => page.locator('#fech-modal');
const ajusteModal = page => page.locator('#res-ajuste-modal');
const continuar = page => fechModal(page).getByRole('button', { name: 'Continuar' });

// ---- Fase 2: Escape e empilhamento das janelas de ajuste (meta / limite) ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Escape fecha a janela de ajuste da meta sem salvar o que foi digitado', async ({ page }) => {
    await abrirResultado(page);
    const antes = await brutas(page, ['sc_fin_metas']);
    await page.click('#res-meta-edit');
    await expect(ajusteModal(page)).toBeVisible();
    await expect(page.locator('#res-ajuste-valor')).toBeFocused();
    await page.fill('#res-ajuste-valor', '9.000');
    await page.keyboard.press('Escape');
    await expect(ajusteModal(page)).toHaveCount(0);
    expect(await brutas(page, ['sc_fin_metas'])).toEqual(antes);
    // Reabre vazio (nada ficou da vez anterior) e Salvar ainda funciona.
    await page.click('#res-meta-edit');
    await expect(page.locator('#res-ajuste-valor')).toHaveValue('');
    await page.fill('#res-ajuste-valor', '9.000');
    await page.click('#res-ajuste-ok');
    await expect(ajusteModal(page)).toHaveCount(0);
    expect((await lerChave(page, 'sc_fin_metas'))['2026-10']).toBe(9000);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Escape com um aviso ou uma pergunta por cima da janela de ajuste fecha so o de cima; o Escape seguinte fecha o ajuste', async ({ page }) => {
    await abrirResultado(page);
    await page.evaluate(() => ajustarOrcamentoMes(_resMesAtual, 'fornecedores'));
    await expect(ajusteModal(page)).toBeVisible();
    await page.fill('#res-ajuste-valor', '1.234,50');
    // Aviso por cima.
    await page.evaluate(() => { showAlert('Aviso de teste'); });
    await expect(page.locator('#sc-modal-msg')).toHaveText('Aviso de teste');
    await page.keyboard.press('Escape');
    await expect(page.locator('#sc-modal-overlay')).toBeHidden();
    await expect(ajusteModal(page)).toBeVisible();
    await expect(page.locator('#res-ajuste-valor')).toHaveValue('1.234,50');
    // Pergunta por cima.
    await page.evaluate(() => { window.__resp = 'pendente'; showConfirm('Pergunta de teste').then(r => { window.__resp = r; }); });
    await expect(page.locator('#sc-modal-msg')).toHaveText('Pergunta de teste');
    await page.keyboard.press('Escape');
    await expect(page.locator('#sc-modal-overlay')).toBeHidden();
    expect(await page.evaluate(() => window.__resp)).toBe(false);
    await expect(ajusteModal(page)).toBeVisible();
    // Agora sim.
    await page.keyboard.press('Escape');
    await expect(ajusteModal(page)).toHaveCount(0);
    expect(await brutas(page, ['sc_fin_orcamento_mes'])).toEqual([null]);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('abrir o limite com a janela da meta aberta troca uma pela outra (nunca duas) e um Escape fecha', async ({ page }) => {
    await abrirResultado(page);
    await page.click('#res-meta-edit');
    await expect(ajusteModal(page).locator('h3')).toHaveText('Meta de faturamento deste mês');
    await page.fill('#res-ajuste-valor', '7.000');
    await page.evaluate(() => ajustarOrcamentoMes(_resMesAtual, 'fornecedores'));
    await expect(ajusteModal(page).locator('h3')).toHaveText('Limite de Fornecedores e materiais neste mês');
    await expect(ajusteModal(page)).toHaveCount(1);
    await expect(page.locator('#res-ajuste-valor')).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(ajusteModal(page)).toHaveCount(0);
    expect(await brutas(page, ['sc_fin_metas', 'sc_fin_orcamento_mes'])).toEqual([null, null]);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Escape com o passo a passo do fechamento aberto fecha so a janela de ajuste; o fechamento fica com o que foi digitado', async ({ page }) => {
    await abrirResultado(page);
    await page.click('#fech-btn-fechar');
    await fechModal(page).locator('.fech-extrato').first().fill('1.280,00');
    await page.evaluate(() => ajustarMetaMes(_resMesAtual));
    await expect(ajusteModal(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ajusteModal(page)).toHaveCount(0);
    await expect(fechModal(page)).toBeVisible();
    await expect(fechModal(page).locator('.fech-extrato').first()).toHaveValue('1.280,00');
    // O Escape sozinho continua sem fechar o fechamento.
    await page.keyboard.press('Escape');
    await expect(fechModal(page)).toBeVisible();
});

// ---- Fase 3: ajuste de entrada e "Deixar anotado" no fechamento ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('fechamento com extrato maior que o esperado: "Lançar ajuste" cria uma entrada de ajuste e nao muda o resultado', async ({ page }) => {
    await abrirResultado(page);
    const antes = await page.evaluate(() => resultadoFinanceiroDoMes('2026-10').resultado);
    await page.click('#fech-btn-fechar');
    const linha = fechModal(page).locator('tr[data-conta="10"]');
    await linha.locator('.fech-extrato').fill('1.320,00');
    await expect(linha.locator('.fech-dif')).toHaveText('+R$ 20,00');
    await linha.getByLabel('Lançar ajuste').check();
    await linha.locator('.fech-motivo').fill('troco que sobrou');
    await continuar(page).click();
    await continuar(page).click();
    await page.click('#fech-confirmar');
    await expect(fechModal(page)).toHaveCount(0);
    const ajustes = (await lerChave(page, 'sc_mov_fin')).filter(m => m.origem === 'ajuste');
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0]).toMatchObject({ conta_id: 10, data: '2026-10-31', sentido: 'entrada', valor: 20, fechamento_mes: '2026-10' });
    expect(ajustes[0].descricao).toBe('Ajuste da conferência de Outubro de 2026: troco que sobrou');
    expect(await page.evaluate(() => resultadoFinanceiroDoMes('2026-10').resultado)).toBe(antes);
    const foto = (await lerChave(page, 'sc_fin_fech'))[0];
    expect(foto.contas[0]).toMatchObject({ esperado: 1300, extrato: 1320, diferenca: 20, acao: 'ajuste', motivo: 'troco que sobrou' });
    await expect(page.locator('#doc-modal-paper')).toContainText('ajuste lançado — troco que sobrou');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('fechamento com "Deixar anotado": nao cria ajuste, nao pede motivo e o motivo digitado antes e descartado', async ({ page }) => {
    await abrirResultado(page);
    await page.click('#fech-btn-fechar');
    const linha = fechModal(page).locator('tr[data-conta="10"]');
    await linha.locator('.fech-extrato').fill('1.280,00');
    // "Deixar anotado" ja vem marcado e esconde o motivo.
    await expect(linha.getByLabel('Deixar anotado')).toBeChecked();
    await expect(linha.locator('.fech-motivo')).toBeHidden();
    // Muda de ideia: marca o ajuste, escreve o motivo e volta para anotado.
    await linha.getByLabel('Lançar ajuste').check();
    await linha.locator('.fech-motivo').fill('tarifa do banco');
    await linha.getByLabel('Deixar anotado').check();
    await expect(linha.locator('.fech-motivo')).toBeHidden();
    await continuar(page).click();
    await expect(fechModal(page).locator('.fech-erro')).toHaveText('');
    await continuar(page).click();
    await page.click('#fech-confirmar');
    await expect(fechModal(page)).toHaveCount(0);
    expect((await lerChave(page, 'sc_mov_fin')).filter(m => m.origem === 'ajuste')).toEqual([]);
    const foto = (await lerChave(page, 'sc_fin_fech'))[0];
    expect(foto.contas[0]).toMatchObject({ esperado: 1300, extrato: 1280, diferenca: -20, acao: 'anotado', motivo: '' });
    await expect(page.locator('#doc-modal-paper')).toContainText('diferença anotada');
    // Sem ajuste, o saldo do extrato continua o esperado (a diferenca ficou so anotada).
    expect(await page.evaluate(() => CaixaCore.saldoConta(getContasFin()[0], db.movimentos_fin, '2026-10-31'))).toBe(1300);
});

// ---- Fase 3: duplo clique em Lancar chama a funcao uma vez so ----
const SEED_SIM = {
    sc_contas_fin: [{ id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 3000, data_saldo_inicial: '2026-11-11', ativo: true }],
    sc_cr: [], sc_cp: [], sc_mov_fin: []
};
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Lançar no A Pagar: duplo clique e chamadas juntas abrem uma pergunta so; cancelar libera e o Lançar seguinte cria uma conta so', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-14T10:00:00') });
    await entrar(page, BASE, SEED_SIM);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="simulador"]').click();
    await page.fill('#sim-desc', 'Máquina');
    await page.fill('#sim-valor', '500');
    await page.getByRole('button', { name: 'Simular', exact: true }).click();
    await expect(page.locator('#sim-titulo')).toHaveText('Cabe');
    await page.evaluate(() => {
        window.__perguntas = 0;
        const orig = window.showConfirm;
        window.showConfirm = (...a) => { window.__perguntas++; return orig(...a); };
    });
    await page.locator('#sim-lancar').dblclick();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Lançar 1 conta no A Pagar?');
    // Mais duas chamadas na mesma hora, com a pergunta aberta.
    await page.evaluate(() => { lancarSimulacaoNoPagar(); lancarSimulacaoNoPagar(); });
    expect(await page.evaluate(() => window.__perguntas)).toBe(1);
    await expect(page.locator('#sim-lancar')).toBeDisabled();
    // Cancelar libera o botao sem lancar nada.
    await page.click('#sc-modal-cancel');
    await expect(page.locator('#sim-lancar')).toBeEnabled();
    expect(await lerChave(page, 'sc_cp')).toEqual([]);
    // Novo duplo clique e confirmacao: uma conta so.
    await page.locator('#sim-lancar').dblclick();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Lançar 1 conta no A Pagar?');
    await page.click('#sc-modal-ok');
    await expect(page.locator('.sc-toast').filter({ hasText: 'Compra lançada no A Pagar.' })).toBeVisible();
    expect(await page.evaluate(() => window.__perguntas)).toBe(2);
    const cps = await lerChave(page, 'sc_cp');
    expect(cps).toHaveLength(1);
    expect(cps[0]).toMatchObject({ descricao: 'Máquina', valor: 500, status: 'Pendente' });
});

// ---- Fase 3: migracao da permissao financeiro.simulador nas permissoes extras do usuario ----
test('permissao financeiro.simulador nasce nas permissoes extras do usuario com o nivel da Visao Geral (ou do financeiro) e nao troca a que ja existe', async ({ page }) => {
    const nivel = n => ({ nivel: n, acoes_restritas: [] });
    const usuario = (id, extras) => ({ id, nome: 'U' + id, email: 'u' + id + '@sctech.local', papel_id: id === 1 ? 1 : 3, ativo: true, permissoes_extras: extras, senha_hash: '' });
    await entrar(page, BASE, { sc_usr: [
        usuario(1, {}),
        usuario(2, { financeiro: nivel('visualizar'), 'financeiro.dashboard': nivel('completo') }),
        usuario(3, { financeiro: nivel('visualizar') }),
        usuario(4, { financeiro: nivel('completo'), 'financeiro.simulador': nivel('sem_acesso') }),
        usuario(5, { clientes: nivel('completo') })
    ] });
    await page.goto(BASE + '/configuracoes.html');
    await expect.poll(async () => ((await lerChave(page, 'sc_usr')).find(u => u.id === 3).permissoes_extras['financeiro.simulador'] || {}).nivel).toBe('visualizar');
    const us = await lerChave(page, 'sc_usr');
    const sim = id => us.find(u => u.id === id).permissoes_extras['financeiro.simulador'];
    expect(sim(2)).toEqual(nivel('completo'));
    expect(sim(3)).toEqual(nivel('visualizar'));
    // Quem ja tinha a chave fica como estava; quem nao tem permissao de financeiro nao ganha nada.
    expect(sim(4)).toEqual(nivel('sem_acesso'));
    expect(sim(1)).toBeUndefined();
    expect(sim(5)).toBeUndefined();
    // Nao e refeita por cima: o que o administrador mudar depois fica.
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u.find(x => x.id === 3).permissoes_extras['financeiro.simulador'] = { nivel: 'completo', acoes_restritas: [] };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/configuracoes.html');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForFunction(() => typeof db !== 'undefined' && db.usuarios.length === 5);
    const depois = await lerChave(page, 'sc_usr');
    expect(depois.find(u => u.id === 3).permissoes_extras['financeiro.simulador'].nivel).toBe('completo');
});

// ============ Importacao sem espaco: depois do aviso a tela recarrega e mostra o que esta salvo ============
const MSG_ESPACO = 'Não foi possível salvar: o espaço do navegador acabou. Baixe uma cópia de segurança e libere espaço.';
test('importar sem espaco: depois do OK a pagina recarrega com os dados de antes, a marca e a copia da Fase 0', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: [{ id: 3, nome: 'Antiga' }], sc_fin_backup_fase0: { x: 1 }, sc_fin_revisar: [{ a: 1 }] });
    await page.evaluate(() => localStorage.setItem('sc_fin_migracao', '1'));
    // Falta espaco ao gravar as contas a pagar (mesmo sem a copia da Fase 0 nao cabe).
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            if (k === 'sc_cp') throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
    });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }),
        JSON.stringify({ clientes: [{ id: 7, nome: 'Nova' }], catalogo: [], pedidos: [], contas_pagar: [{ id: 1 }], fin_fase0: true }));
    await expect(page.locator('#sc-modal-msg')).toContainText('Todos os dados atuais serão substituídos.');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('A importação não foi concluída. ' + MSG_ESPACO);
    // Antes do OK a pagina e a mesma (sem recarregar).
    expect(await page.evaluate(() => window.__marca)).toBe(1);
    await page.locator('#sc-modal-ok').click();
    // Depois do OK recarrega: a marca da pagina antiga some.
    await expect.poll(async () => { try { return await page.evaluate(() => window.__marca); } catch (e) { return 'recarregando'; } }).toBeUndefined();
    await page.waitForFunction(() => typeof db !== 'undefined' && Array.isArray(db.clientes));
    // A pagina nova mostra o que esta salvo (os dados antigos), nao o arquivo que falhou.
    expect(await page.evaluate(() => db.clientes.map(c => c.nome))).toEqual(['Antiga']);
    expect(await page.evaluate(() => [localStorage.getItem('sc_fin_migracao'), localStorage.getItem('sc_fin_backup_fase0'), localStorage.getItem('sc_fin_revisar'), JSON.parse(localStorage.getItem('sc_cli'))[0].nome]))
        .toEqual(['1', JSON.stringify({ x: 1 }), JSON.stringify([{ a: 1 }]), 'Antiga']);
});
