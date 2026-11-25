// Tela Vendedores > Comissoes: filtros vendedor/mes, tabela, cartoes Acumulado/A pagar/Pago por pessoa,
// registrar pagamento (linhas marcadas), pagar todos os pendentes, desfazer pagamento e permissao.
// Contas a Pagar nunca recebe nada. Relogio fixo: 25/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 25, 10, 0, 0);
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const CLI = [{ id: 1, nome: 'Ana Paula Lima' }];
const VEND = [
    { id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' },
    { id: 4, nome: 'Carla', comissao_pct: 8, tipo: 'vendedor' },
    { id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' },
];
const CONTAS = [
    { id: 1, nome: 'Banco A', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01', ativo: true },
    { id: 2, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2026-10-01', ativo: true },
];
const dia = d => new Date(d + 'T12:00:00').getTime();
const ped = (id, extra) => ({ id, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Instalado', financeiro_gerado: true, valor: 1000, valor_recebido: 1000,
    ambientes: [], forma_pagamento: 'PIX', vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50, ...extra });
const PEDIDOS = () => [
    ped(26701, { data_instalado: dia('2026-10-20'), comissao_status: 'pendente', arq_id: 3, arq_nome: 'Studio M', arq_comissao_pct: 10, arq_comissao_valor: 100, arq_comissao_status: 'pendente' }),
    ped(26702, { data_instalado: dia('2026-11-10'), valor: 1600, comissao_pct: 5, comissao_valor: 80, comissao_status: 'pendente' }),
    ped(26703, { data_instalado: dia('2026-11-12'), valor: 600, comissao_valor: 30, comissao_status: 'paga', comissao_paga: true, comissao_data_pgto: dia('2026-11-13') }),
    ped(26704, { data_instalado: dia('2026-11-15'), vendedor_id: 4, vendedor_nome: 'Carla', comissao_pct: 8, comissao_valor: 40, comissao_status: 'pendente' }),
    ped(26705, { status: 'Medição', data_instalado: undefined, comissao_valor: 20, comissao_status: 'registrada' }),
];
const saldo = async (page, i) => {
    await page.waitForFunction(() => typeof CaixaCore !== 'undefined' && typeof db !== 'undefined' && db.pedidos);
    return page.evaluate(n => CaixaCore.saldoConta(getContasFin()[n], db.movimentos_fin, '2026-11-25'), i);
};

async function abrir(page, extras) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_contas_fin: CONTAS, sc_ped: PEDIDOS(), ...(extras || {}) });
    await page.goto(BASE + '/vendedores.html?aba=comissoes');
}
const linha = (page, pedido, papel) => page.locator(`#tb-comissoes tr[data-ped="${pedido}"]${papel ? `[data-papel="${papel}"]` : ''}`);
const cartao = (page, nome) => page.locator('.com-cartao', { has: page.locator('h4', { hasText: nome }) });
async function pagarNoModal(page, conta, data) {
    const modal = page.locator('#com-pag-modal');
    await expect(modal).toBeVisible();
    await modal.locator('#com-pag-conta').selectOption(conta);
    if (data) await modal.locator('#com-pag-data').fill(data);
    await modal.locator('#com-pag-ok').click();
}

test('abas: so Cadastro e Comissoes; a tela traz filtros, cartoes e a tabela', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('.vend-tab-btn')).toHaveText(['📋 Cadastro', '💰 Comissões']);
    await expect(page.locator('#tab-vend-comissoes')).toHaveClass(/active/);
    await expect(page.locator('#tab-vend-comissoes thead th')).toHaveText(['', 'Data', 'Pedido', 'Cliente', 'Vendedor', 'Valor do pedido', '%', 'Comissão', 'Status', 'Pago em', '']);
    await expect(page.locator('#com-filtro-vend option')).toHaveText(['Todos', 'Bruno', 'Carla', 'Studio M (arquiteto)']);
    await expect(page.locator('#com-filtro-mes option')).toHaveText(['Todos', 'novembro de 2026', 'outubro de 2026']);
    await expect(page.locator('#tb-comissoes tr')).toHaveCount(6);
    // link antigo ?aba=pendentes cai na tela nova
    await page.goto(BASE + '/vendedores.html?aba=pendentes');
    await expect(page.locator('#tab-vend-comissoes')).toHaveClass(/active/);
});

test('filtros vendedor e mes; cartoes batem com as linhas (registrada nao entra)', async ({ page }) => {
    await abrir(page);
    // Todos: um cartao por pessoa
    await expect(cartao(page, 'Bruno').locator('.com-acumulado')).toHaveText('R$ 160,00');
    await expect(cartao(page, 'Bruno').locator('.com-apagar')).toHaveText('R$ 130,00');
    await expect(cartao(page, 'Bruno').locator('.com-pago')).toHaveText('R$ 30,00');
    await expect(cartao(page, 'Carla').locator('.com-apagar')).toHaveText('R$ 40,00');
    await expect(cartao(page, 'Studio M').locator('.com-acumulado')).toHaveText('R$ 100,00');
    await expect(linha(page, 26705)).toContainText('Registrada');
    await expect(linha(page, 26705).locator('.com-sel')).toHaveCount(0);
    await expect(linha(page, 26701, 'vendedor')).toContainText('Pendente');
    await expect(linha(page, 26703)).toContainText('Paga');
    await expect(linha(page, 26703)).toContainText('13/11/2026');
    await expect(linha(page, 26702)).toContainText('R$ 1.600,00');
    await expect(linha(page, 26702)).toContainText('5%');
    // Vendedor
    await page.selectOption('#com-filtro-vend', '2');
    await expect(page.locator('#tb-comissoes tr')).toHaveCount(4);
    await expect(page.locator('.com-cartao')).toHaveCount(1);
    // Mes (data de instalacao)
    await page.selectOption('#com-filtro-mes', '2026-11');
    await expect(page.locator('#tb-comissoes tr')).toHaveCount(2);
    await expect(cartao(page, 'Bruno').locator('.com-acumulado')).toHaveText('R$ 110,00');
    await expect(cartao(page, 'Bruno').locator('.com-apagar')).toHaveText('R$ 80,00');
    await expect(cartao(page, 'Bruno').locator('.com-pago')).toHaveText('R$ 30,00');
    // Arquiteto no filtro de vendedor
    await page.selectOption('#com-filtro-mes', '');
    await page.selectOption('#com-filtro-vend', '3');
    await expect(page.locator('#tb-comissoes tr')).toHaveCount(1);
    await expect(linha(page, 26701, 'arquiteto')).toContainText('R$ 100,00');
});

test('clicar no pedido abre o pedido', async ({ page }) => {
    await abrir(page);
    await linha(page, 26702).locator('td:nth-child(3) span').click();
    await page.waitForURL(/pedido\.html/);
    expect(await page.evaluate(() => localStorage.getItem('sc_editando_id'))).toBe('26702');
});

test('registrar pagamento de 2 linhas: paga, Pago em, saida na conta escolhida e nada em Contas a Pagar', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#com-btn-pagar')).toBeDisabled();
    await linha(page, 26701, 'vendedor').locator('.com-sel').check();
    await linha(page, 26702).locator('.com-sel').check();
    await expect(page.locator('#com-sel-resumo')).toHaveText('2 selecionada(s): R$ 130,00');
    await page.locator('#com-btn-pagar').click();
    await expect(page.locator('#com-pag-modal')).toContainText('R$ 130,00');
    await pagarNoModal(page, '2', '2026-11-20');
    await expect.poll(async () => ((await ler(page, 'sc_mov_fin')) || []).length).toBe(2);
    const movs = await ler(page, 'sc_mov_fin');
    expect(movs.map(m => [m.origem, m.origem_id, m.conta_id, m.valor, m.data, m.categoria_id]).sort()).toEqual([
        ['comissao', 26701, 2, 50, '2026-11-20', 'cat_comissoes'], ['comissao', 26702, 2, 80, '2026-11-20', 'cat_comissoes']]);
    const peds = await ler(page, 'sc_ped');
    expect(peds.find(p => p.id === 26701)).toMatchObject({ comissao_status: 'paga', comissao_paga: true, arq_comissao_status: 'pendente' });
    expect(peds.find(p => p.id === 26702).comissao_status).toBe('paga');
    expect((await ler(page, 'sc_cp')) || []).toHaveLength(0);
    // tela recarregada: ainda em Comissoes, com as linhas pagas e os cartoes novos
    await expect(page.locator('#tab-vend-comissoes')).toHaveClass(/active/);
    await expect(linha(page, 26702)).toContainText('Paga');
    await expect(linha(page, 26702)).toContainText('20/11/2026');
    await expect(cartao(page, 'Bruno').locator('.com-apagar')).toHaveText('R$ 0,00');
    await expect(cartao(page, 'Bruno').locator('.com-pago')).toHaveText('R$ 160,00');
    await expect.poll(() => saldo(page, 1)).toBe(-130);
    await expect.poll(() => saldo(page, 0)).toBe(1000);
});

test('pagar todos os pendentes de um vendedor respeita o filtro de mes e nao paga os dos outros', async ({ page }) => {
    await abrir(page);
    await page.selectOption('#com-filtro-mes', '2026-11');
    await cartao(page, 'Bruno').locator('button', { hasText: 'Pagar todos os pendentes de Bruno' }).click();
    await expect(page.locator('#com-pag-modal')).toContainText('R$ 80,00');
    await pagarNoModal(page, '1');
    await expect.poll(async () => ((await ler(page, 'sc_mov_fin')) || []).length).toBe(1);
    const peds = await ler(page, 'sc_ped');
    expect(peds.find(p => p.id === 26702).comissao_status).toBe('paga');
    expect(peds.find(p => p.id === 26701).comissao_status, 'outubro nao entrou').toBe('pendente');
    expect(peds.find(p => p.id === 26704).comissao_status, 'Carla nao entrou').toBe('pendente');
    expect((await ler(page, 'sc_cp')) || []).toHaveLength(0);
    await expect.poll(() => saldo(page, 0)).toBe(920);
});

test('desfazer pagamento: volta a pendente, tira a saida e o saldo volta', async ({ page }) => {
    await abrir(page);
    await linha(page, 26702).locator('.com-sel').check();
    await page.locator('#com-btn-pagar').click();
    await pagarNoModal(page, '1', '2026-11-20');
    await expect.poll(async () => ((await ler(page, 'sc_mov_fin')) || []).length).toBe(1);
    await expect(linha(page, 26702)).toContainText('Paga');
    await acaoMenu(page, linha(page, 26702), 'Desfazer pagamento');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => ((await ler(page, 'sc_mov_fin')) || []).length).toBe(0);
    const p = (await ler(page, 'sc_ped')).find(x => x.id === 26702);
    expect(p.comissao_status).toBe('pendente');
    expect(p.comissao_paga).toBe(false);
    const acoes = p.comissao_historico.map(h => h.acao);
    expect(acoes).toContain('paga');
    expect(acoes[acoes.length - 1]).toBe('pagamento_desfeito');
    await expect(linha(page, 26702)).toContainText('Pendente');
    await expect(linha(page, 26702).locator('.com-sel')).toHaveCount(1);
    await expect.poll(() => saldo(page, 0)).toBe(1000);
    expect((await ler(page, 'sc_cp')) || []).toHaveLength(0);
});

test('sem permissao nao ve os botoes de pagar nem selecionar', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].permissoes_extras = { vendedores: { nivel: 'visualizar', acoes_restritas: [] }, 'financeiro.pagar': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.reload();
    await expect(page.locator('#tb-comissoes tr')).toHaveCount(6);
    await expect(page.locator('#com-btn-pagar')).toBeHidden();
    await expect(page.locator('.com-sel')).toHaveCount(0);
    await expect(page.locator('.com-cartao button')).toHaveCount(0);
    await expect(page.locator('#tb-comissoes .btn-kebab')).toHaveCount(0);
    await expect(cartao(page, 'Bruno').locator('.com-apagar')).toHaveText('R$ 130,00');
});

test('pagar todos funciona com nome com apostrofo e sem id de vendedor (sem codigo no onclick)', async ({ page }) => {
    const peds = [ped(26710, { data_instalado: dia('2026-11-10'), vendedor_id: null, vendedor_nome: "D'Ávila", comissao_valor: 40, comissao_status: 'pendente' })];
    await abrir(page, { sc_ped: peds });
    const botao = cartao(page, "D'Ávila").locator('button', { hasText: "Pagar todos os pendentes de D'Ávila" });
    await expect(botao).toHaveCount(1);
    expect(await botao.getAttribute('onclick')).toBeNull();
    await botao.click();
    await expect(page.locator('#com-pag-modal')).toContainText('R$ 40,00');
    await pagarNoModal(page, '1');
    await expect.poll(async () => ((await ler(page, 'sc_mov_fin')) || []).length).toBe(1);
    expect((await ler(page, 'sc_ped'))[0].comissao_status).toBe('paga');
});

test('desfazer pagamento solta a linha de extrato conciliada com a saida (sem o Fluxo carregado)', async ({ page }) => {
    await abrir(page);
    await linha(page, 26702).locator('.com-sel').check();
    await page.locator('#com-btn-pagar').click();
    await pagarNoModal(page, '1', '2026-11-20');
    await expect.poll(async () => ((await ler(page, 'sc_mov_fin')) || []).length).toBe(1);
    const mov = (await ler(page, 'sc_mov_fin'))[0];
    expect(await page.evaluate(() => typeof _ccDesligarSumidos)).toBe('undefined');
    await page.evaluate(m => {
        localStorage.setItem('sc_fin_extrato', JSON.stringify([{ id: 1, conta_id: 1, fitid: 'x1', data: '2026-11-20', valor: -80, descricao: 'COMISSAO', situacao: 'conciliado', mov_id: m.id }]));
    }, mov);
    await page.reload();
    await acaoMenu(page, linha(page, 26702), 'Desfazer pagamento');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => ((await ler(page, 'sc_mov_fin')) || []).length).toBe(0);
    await expect.poll(async () => (await ler(page, 'sc_fin_extrato'))[0].situacao).toBe('pendente');
    expect((await ler(page, 'sc_fin_extrato'))[0].mov_id).toBeNull();
});

test('nao exclui pedido com comissao paga', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => { excluirPedido(26703); });
    await expect(page.locator('#sc-modal-msg')).toHaveText('Este pedido tem comissão paga. Desfaça o pagamento em Vendedores › Comissões antes de excluir.');
    await page.locator('#sc-modal-ok').click();
    expect((await ler(page, 'sc_ped')).some(p => p.id === 26703)).toBe(true);
});

test('sem conta ativa a janela de pagamento orienta a cadastrar e bloqueia o botao', async ({ page }) => {
    await abrir(page, { sc_contas_fin: [{ id: 1, nome: 'Velha', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-10-01', ativo: false }] });
    await linha(page, 26702).locator('.com-sel').check();
    await page.locator('#com-btn-pagar').click();
    await expect(page.locator('#com-pag-erro')).toHaveText('Cadastre uma conta em Configurar Empresa para registrar o pagamento.');
    await expect(page.locator('#com-pag-ok')).toBeDisabled();
});
