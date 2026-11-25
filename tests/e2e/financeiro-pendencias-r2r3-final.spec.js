// Pendencias R2/R3, rodada final de correcoes da revisao da branch: meta padrao
// na Visao Geral, confirmar pagamento do pedido sem nada marcado, estorno da
// comissao antiga de arquiteto (comissao_rt) e "igual ao mes anterior" quando
// a porcentagem arredonda para zero.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acaoLanc } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8181';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const BANCO = { id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true };

// ---- 1. Meta padrao como sugestao na Visao Geral ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Visao Geral: sem ajuste no mes, o campo da meta sugere a meta padrao', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { meta_faturamento_padrao: 50000 } });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-meta-valor')).toHaveAttribute('placeholder', '50.000');
    await expect(page.locator('#fin-meta-valor')).toHaveValue('');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Visao Geral: sem meta padrao o campo da meta continua com "Ex: 15000"', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-meta-valor')).toHaveAttribute('placeholder', 'Ex: 15000');
});

// ---- 2. Confirmar pagamento do pedido sem nada marcado ----
const CLI = [{ id: 1, nome: 'Ana' }];
const pedAF = extra => ({ id: 26700, clienteId: 1, clienteNome: 'Ana', status: 'Aguardando Financeiro', financeiro_gerado: true,
    valor: 1000, valor_recebido: 0, pagamento_pendente: true, forma_pagamento: 'PIX', ambientes: [], ...(extra || {}) });
const crAb = (id, tipo, venc) => ({ id, pedido_id: 26700, cliente_nome: 'Ana', descricao: tipo === 'entrada' ? 'Entrada' : 'Saldo', valor: 500,
    data_vencimento: venc, data_pagamento: null, status: 'Pendente', parcela_tipo: tipo });

test('confirmar pagamento do pedido: desmarcar a entrada ainda deixa confirmar e vai a Instalado com saldo em aberto', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedAF()], sc_cr: [crAb(701, 'entrada', '2099-11-01'), crAb(702, 'saldo', '2099-12-01')] });
    await page.goto(BASE + '/pcp.html');
    await page.locator('.kanban-btn-pagamento').click();
    const modal = page.locator('#baixa-modal');
    const checks = modal.locator('.baixa-check');
    await expect(checks).toHaveCount(2);
    await expect(checks.nth(0), 'entrada comeca marcada').toBeChecked();
    await expect(checks.nth(1), 'saldo comeca desmarcado').not.toBeChecked();
    await checks.nth(0).uncheck();
    await expect(modal.locator('#baixa-ok')).toBeEnabled();
    await expect(modal.locator('#baixa-erro-nenhum')).toBeHidden();
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].status).toBe('Instalado');
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.pagamento_pendente).toBe(true);
    expect((await ler(page, 'sc_cr')).map(c => c.status)).toEqual(['Pendente', 'Pendente']);
    await expect(page.locator('.kanban-card').filter({ hasText: 'saldo em aberto' })).toHaveCount(1);
});

test('A Receber: desmarcar o unico item continua bloqueando com "Marque pelo menos um item."', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedAF({ status: 'Instalado' })], sc_cr: [crAb(701, 'entrada', '2099-11-01')] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await acaoLanc(page, 'receber', 'Dar baixa');
    const modal = page.locator('#baixa-modal');
    await expect(modal.locator('#baixa-ok')).toBeEnabled();
    await modal.locator('.baixa-check').uncheck();
    await expect(modal.locator('#baixa-ok')).toBeDisabled();
    await expect(modal.locator('#baixa-erro-nenhum')).toHaveText('Marque pelo menos um item.');
    await expect(modal).toBeVisible();
});

// ---- 3. Comissao antiga de arquiteto paga por conta comissao_rt ----
test('desfazer pagamento de comissao antiga de arquiteto (comissao_rt) tira a conta e o movimento e deixa pagar de novo', async ({ page }) => {
    await entrar(page, BASE, {
        sc_cli: CLI,
        sc_vend: [{ id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' }],
        sc_contas_fin: [BANCO],
        sc_meios_pag: [{ id: 1, nome: 'PIX', tipo: 'pix', conta_id: 10, ativo: true }],
        sc_ped: [{ id: 26800, clienteId: 1, clienteNome: 'Ana', status: 'Instalado', financeiro_gerado: true, valor: 1000, valor_recebido: 1000,
            ambientes: [], forma_pagamento: 'PIX', data_instalado: new Date('2026-10-20T12:00:00').getTime(),
            arq_id: 3, arq_nome: 'Studio M', arq_comissao_pct: 10, arq_comissao_valor: 100, arq_comissao_paga: true,
            arq_comissao_data_pgto: new Date('2026-10-25T12:00:00').getTime() }],
        sc_cp: [{ id: 900, descricao: 'RT Studio M', credor_nome: 'Studio M', valor: 100, categoria: 'comissao_rt', tipo: 'variavel', pedido_id: 26800,
            vendedor_id: 3, status: 'Pago', data_vencimento: '2026-10-25', data_pagamento: '2026-10-25', forma_pagamento: 'PIX', meio_id: 1, conta_id: 10 }],
        sc_mov_fin: [{ id: 1, conta_id: 10, data: '2026-10-25', sentido: 'saida', valor: 100, origem: 'cp', origem_id: 900, grupo_id: null, descricao: 'RT Studio M' }]
    });
    await page.goto(BASE + '/vendedores.html?tipo=arquiteto&aba=historico');
    const btn = page.locator('#tb-hist-comissoes button', { hasText: 'Estornar' });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Desfazer este pagamento? A comissão volta a ficar pendente.');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].arq_comissao_paga).toBe(false);
    // a conta paga antiga sai do Financeiro (a comissao e do pedido) e fica em Excluidos
    expect((await ler(page, 'sc_cp')) || []).toEqual([]);
    expect((await ler(page, 'sc_fin_excluidos')).map(x => x.lancamento.id)).toEqual([900]);
    expect((await ler(page, 'sc_mov_fin')) || []).toEqual([]);
    expect((await ler(page, 'sc_ped'))[0].arq_comissao_status).toBe('pendente');
    // Pagar de novo pela lista de pendentes
    await page.goto(BASE + '/vendedores.html?tipo=arquiteto&aba=pendentes');
    await page.locator('#tb-comissoes-pendentes button', { hasText: 'Pagar' }).click();
    const modal = page.locator('#com-pag-modal');
    await expect(modal).toBeVisible();
    await modal.locator('#com-pag-conta').selectOption('10');
    await modal.locator('#com-pag-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].arq_comissao_paga).toBe(true);
    expect((await ler(page, 'sc_cp')) || []).toHaveLength(0);
    const movs = await ler(page, 'sc_mov_fin');
    expect(movs.map(m => [m.origem, m.origem_id, m.papel, m.sentido, m.valor])).toEqual([['comissao', 26800, 'arquiteto', 'saida', 100]]);
    expect((await ler(page, 'sc_ped'))[0].arq_comissao_status).toBe('paga');
});

// ---- 7. "igual ao mes anterior" quando a porcentagem arredonda para 0 ----
const movE = (id, data, valor, origem_id) => ({ id, conta_id: 10, data, sentido: 'entrada', valor, origem: 'cr', origem_id, grupo_id: null, descricao: 'x' });
const crPago = (id, data, valor) => ({ id, pedido_id: 100 + id, cliente_nome: 'Cli', descricao: 'Pedido ' + id, valor, data_vencimento: data, data_pagamento: data, status: 'Pago', parcela_tipo: 'saldo' });

async function abrirFechamento(page, atual, anterior) {
    await page.clock.install({ time: new Date('2026-11-05T10:00:00') });
    await entrar(page, BASE, {
        sc_contas_fin: [{ ...BANCO, data_saldo_inicial: '2026-08-01' }],
        sc_cr: [crPago(1, '2026-10-10', atual), crPago(2, '2026-09-10', anterior)],
        sc_mov_fin: [movE(1, '2026-10-10', atual, 1), movE(2, '2026-09-10', anterior, 2)]
    });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await page.fill('#res-mes', '2026-10');
    await page.locator('#res-mes').dispatchEvent('change');
    await page.click('#fech-btn-fechar');
    const continuar = page.locator('#fech-modal').getByRole('button', { name: 'Continuar' });
    await continuar.click();
    await continuar.click();
    return page.locator('#fech-modal .fech-lista li', { hasText: 'Entradas' });
}

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('fechamento: diferenca que arredonda a 0% diz "igual ao mês anterior"', async ({ page }) => {
    const linha = await abrirFechamento(page, 10040, 10000);
    await expect(linha).toContainText('igual ao mês anterior');
    await expect(linha).not.toContainText('0%');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('fechamento: diferenca que arredonda a 1% mostra "(+1%)"', async ({ page }) => {
    const linha = await abrirFechamento(page, 10050, 10000);
    await expect(linha).toContainText('(+1%)');
    await expect(linha).not.toContainText('igual ao mês anterior');
});

async function abrirTendencia(page, atual, anterior) {
    await page.clock.install({ time: new Date('2026-11-14T10:00:00') });
    await entrar(page, BASE, {
        sc_contas_fin: [BANCO],
        sc_cr: [crPago(1, '2026-11-05', atual), crPago(2, '2026-10-05', anterior)],
        sc_mov_fin: [movE(1, '2026-11-05', atual, 1), movE(2, '2026-10-05', anterior, 2)]
    });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    return page.locator('#fin-alertas', { hasText: 'Faturamento deste mês' });
}

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Visao Geral: tendencia que arredonda a 0,0% diz "igual ao mês anterior"', async ({ page }) => {
    const alerta = await abrirTendencia(page, 10004, 10000);
    await expect(alerta).toContainText('Faturamento deste mês igual ao mês anterior');
    await expect(alerta).not.toContainText('0.0%');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Visao Geral: tendencia de 0,06% mostra "+0.1%"', async ({ page }) => {
    const alerta = await abrirTendencia(page, 10006, 10000);
    await expect(alerta).toContainText('+0.1% vs. mês anterior');
});
