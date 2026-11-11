// Quatro regras novas:
// 1. Pedido aprovado (depois de Orcamento) abre so para leitura; volta para
//    Orcamento pelo aviso e fica editavel de novo.
// 2. A etapa "Aguardando Pagamento" virou "Aguardando Financeiro" (dados
//    antigos renomeados no carregamento).
// 3. Confirmar a instalacao sempre leva a Aguardando Financeiro; la so
//    Administrador/Financeiro confirmam o pagamento (-> Instalado). O card
//    mostra a forma de pagamento e, com saldo informado, "Pendente".
// 4. Menu lateral com alfinete: fixado fica aberto; solto mostra so os
//    icones e abre ao passar o mouse. Preferencia guardada por usuario.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerPed = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')));
const colunaKanban = (page, titulo) => page.locator('.kanban-col', { has: page.locator('.kanban-col-header', { hasText: titulo }) });
const confirmarModal = page => page.locator('#sc-modal-ok').click();

const CLI = [{ id: 1, nome: 'Pedro Alves' }];
const VEND = [{ id: 1, nome: 'Ana', tipo: 'vendedor', comissao_pct: 0 }];
const pedBase = (id, status, extra) => ({
    id, clienteId: 1, clienteNome: 'Pedro Alves', status, valor: 1000, valor_recebido: 0,
    vendedor_id: 1, vendedor_nome: 'Ana', data_entrega: '2026-12-01', amb: 'Sala',
    ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [],
    forma_pagamento: 'Pix', ...(extra || {}),
});

// --- 1. Bloqueio de edicao -----------------------------------------------------

test('pedido aprovado abre bloqueado, sem salvar', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedBase(26001, 'Na Costura')], sc_editando_id: 26001 });
    await page.goto(BASE + '/pedido.html');
    await expect(page.locator('#ped-aviso-bloqueio')).toContainText('bloqueado para edição');
    await expect(page.locator('#ped-aviso-bloqueio')).toContainText('Na Costura');
    await expect(page.locator('#ped-status')).toBeDisabled();
    await expect(page.locator('#ped-obs')).toBeDisabled();
    await expect(page.locator('#ped-mat-busca')).toBeDisabled();
    await expect(page.locator('button[onclick="salvarPedido()"]')).toBeHidden();
    await expect(page.locator('#ped-voltar-orcamento')).toBeEnabled();
});

test('salvar pedido aprovado e recusado mesmo chamando direto', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedBase(26001, 'Medição', { observacoes: 'antes' })], sc_editando_id: 26001 });
    await page.goto(BASE + '/pedido.html');
    await page.evaluate(() => { document.getElementById('ped-obs').value = 'depois'; salvarPedido(); });
    await expect(page.locator('#sc-modal-ok')).toBeVisible();
    await confirmarModal(page);
    expect((await lerPed(page))[0].observacoes).toBe('antes');
});

test('voltar para Orcamento libera a edicao e refaz o financeiro em aberto', async ({ page }) => {
    await entrar(page, BASE, {
        sc_cli: CLI, sc_vend: VEND, sc_editando_id: 26001,
        sc_ped: [pedBase(26001, 'Aguardando Tecido', { financeiro_gerado: true })],
        sc_cr: [{ id: 1, pedido_id: 26001, valor: 1000, status: 'Pendente', data_vencimento: '2026-12-01' }],
    });
    await page.goto(BASE + '/pedido.html');
    await page.click('#ped-voltar-orcamento');
    await confirmarModal(page);
    await expect(page.locator('#ped-aviso-bloqueio')).toHaveCount(0);
    await expect(page.locator('#ped-obs')).toBeEnabled();
    await expect(page.locator('button[onclick="salvarPedido()"]')).toBeVisible();
    const p = (await lerPed(page))[0];
    expect(p.status).toBe('Orçamento');
    expect(p.financeiro_gerado).toBe(false);
    expect(p.timeline.at(-1).label).toContain('Voltou para Orçamento');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_cr')))).toEqual([]);
});

test('pedido em Orcamento continua editavel e instalado nao oferece voltar', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedBase(26001, 'Orçamento')], sc_editando_id: 26001 });
    await page.goto(BASE + '/pedido.html');
    await expect(page.locator('#ped-aviso-bloqueio')).toHaveCount(0);
    await expect(page.locator('#ped-obs')).toBeEnabled();

    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [pedBase(26002, 'Instalado')], sc_editando_id: 26002 });
    await page.goto(BASE + '/pedido.html');
    await expect(page.locator('#ped-aviso-bloqueio')).toContainText('somente leitura');
    await expect(page.locator('#ped-voltar-orcamento')).toHaveCount(0);
});

// --- 2. Nome da etapa -----------------------------------------------------------

test('a coluna se chama Aguardando Financeiro e o status antigo e migrado', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedBase(26001, 'Aguardando Pagamento', { timeline: [{ status: 'Aguardando Pagamento', data: 1 }] })] });
    await page.goto(BASE + '/pcp.html?view=kanban');
    await expect(colunaKanban(page, 'Aguardando Financeiro')).toContainText('Pedro Alves');
    await expect(page.locator('#kanban-board')).not.toContainText('Aguardando Pagamento');
    const p = (await lerPed(page))[0];
    expect(p.status).toBe('Aguardando Financeiro');
    expect(p.timeline[0].status).toBe('Aguardando Financeiro');
});

// --- 3. Aguardando Financeiro ---------------------------------------------------

test('confirmar a entrega no Kanban, pago ou nao, vai para Aguardando Financeiro', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [
        pedBase(26001, 'Pronto p/ Instalação', { inst_agendado: true }),
        pedBase(26002, 'Pronto p/ Instalação', { inst_agendado: true, clienteNome: 'Bruna Costa' }),
    ] });
    await page.goto(BASE + '/pcp.html?view=kanban');
    await colunaKanban(page, 'Pronto p/ Instalação').locator('.kanban-card', { hasText: 'Pedro Alves' }).locator('button[title="Avançar etapa"]').click();
    await page.click('#mpg-sim');
    await expect(colunaKanban(page, 'Aguardando Financeiro')).toContainText('Pedro Alves');
    await colunaKanban(page, 'Pronto p/ Instalação').locator('.kanban-card', { hasText: 'Bruna Costa' }).locator('button[title="Avançar etapa"]').click();
    await page.click('#mpg-nao');
    await expect(colunaKanban(page, 'Aguardando Financeiro')).toContainText('Bruna Costa');
    const col = colunaKanban(page, 'Aguardando Financeiro');
    await expect(col.locator('.kanban-card')).toHaveCount(2);
    const peds = await lerPed(page);
    expect(peds.map(p => [p.status, p.pagamento_pendente])).toEqual([['Aguardando Financeiro', false], ['Aguardando Financeiro', true]]);
});

test('card em Aguardando Financeiro mostra forma de pagamento, Pendente e o botao', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [
        pedBase(26001, 'Aguardando Financeiro', { pagamento_pendente: true, forma_pagamento: 'Cartão 3x' }),
        pedBase(26002, 'Aguardando Financeiro', { clienteNome: 'Bruna Costa', pagamento_pendente: false }),
        pedBase(26003, 'Na Costura', { clienteNome: 'Caio Lima' }),
    ] });
    await page.goto(BASE + '/pcp.html?view=kanban');
    const col = colunaKanban(page, 'Aguardando Financeiro');
    const pend = col.locator('.kanban-card', { hasText: 'Pedro Alves' });
    await expect(pend.locator('.kanban-fin-forma')).toHaveText('💳 Cartão 3x');
    await expect(pend.locator('.kanban-pag-pendente')).toContainText('Pendente');
    await expect(pend.locator('.kanban-btn-pagamento')).toContainText('Confirmar pagamento');
    await expect(pend.locator('button[title="Avançar etapa"]')).toHaveCount(0);
    const pago = col.locator('.kanban-card', { hasText: 'Bruna Costa' });
    await expect(pago.locator('.kanban-fin-forma')).toHaveText('💳 Pix');
    await expect(pago.locator('.kanban-pag-pendente')).toHaveCount(0);
    // Forma de pagamento so nesta etapa.
    await expect(colunaKanban(page, 'Na Costura').locator('.kanban-fin-forma')).toHaveCount(0);
});

test('confirmar pagamento leva para Instalado', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI,
        sc_ped: [pedBase(26001, 'Aguardando Financeiro', { pagamento_pendente: true, financeiro_gerado: true })],
        sc_cr: [{ id: 701, pedido_id: 26001, cliente_nome: 'Pedro Alves', descricao: 'Pagamento (Pix)', valor: 1000, data_vencimento: '2099-12-01', data_pagamento: null, status: 'Pendente', parcela_tipo: 'unica' }] });
    await page.goto(BASE + '/pcp.html?view=kanban');
    await colunaKanban(page, 'Aguardando Financeiro').locator('.kanban-btn-pagamento').click();
    await expect(page.locator('#baixa-modal')).toBeVisible();
    await page.locator('#baixa-modal input[type=checkbox]').check();   // com saldo pendente a parcela vem desmarcada
    await page.click('#baixa-ok');
    await expect(colunaKanban(page, 'Instalado')).toContainText('Pedro Alves');
    const p = (await lerPed(page))[0];
    expect(p.status).toBe('Instalado');
    expect(p.pagamento_pendente).toBe(false);
    expect(p.valor_recebido).toBe(1000);
    expect(p.data_instalado).toBeGreaterThan(0);
});

test('a lista tambem traz a forma de pagamento e o botao', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_pcp_modo_1: 'lista', sc_ped: [pedBase(26001, 'Aguardando Financeiro', { pagamento_pendente: true })] });
    await page.goto(BASE + '/pcp.html?view=kanban');
    const linha = page.locator('.pcp-bloco[data-status="Aguardando Financeiro"] .pcp-linha');
    await expect(linha.locator('.kanban-fin-forma')).toContainText('Pix');
    await expect(linha.locator('.kanban-pag-pendente')).toBeVisible();
    await expect(linha.locator('.kanban-btn-pagamento')).toBeVisible();
});

test('quem nao e Administrador nem Financeiro nao confirma o pagamento', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedBase(26001, 'Aguardando Financeiro')] });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 4;   // Producao/Costura
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/pcp.html?view=kanban');
    const card = colunaKanban(page, 'Aguardando Financeiro').locator('.kanban-card');
    await expect(card.locator('.kanban-btn-pagamento')).toHaveCount(0);
    await expect(card).toContainText('Aguardando confirmação do financeiro');
    // Nem chamando direto.
    await page.evaluate(() => { moverStatus(26001, 1); });   // sem await: o alerta so resolve no clique
    await expect(page.locator('#sc-modal-ok')).toBeVisible();
    await confirmarModal(page);
    expect((await lerPed(page))[0].status).toBe('Aguardando Financeiro');
});

test('papel Financeiro confirma o pagamento', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [pedBase(26001, 'Aguardando Financeiro')] });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 2;   // Financeiro
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/pcp.html?view=kanban');
    await expect(colunaKanban(page, 'Aguardando Financeiro').locator('.kanban-btn-pagamento')).toBeVisible();
});

// --- 4. Menu lateral com alfinete -------------------------------------------------

test('o alfinete substitui o "Recolher menu" e fica ao lado da logo', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#main-sidebar')).not.toContainText('Recolher menu');
    await expect(page.locator('.sidebar .logo #sidebar-pin-btn')).toHaveText('📌');
    await expect(page.locator('#sidebar-pin-btn')).toHaveClass(/fixado/);
});

test('solto: so icones, abre ao passar o mouse e fecha ao sair; a tela se ajusta', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    const sb = page.locator('#main-sidebar');
    const mainX = () => page.locator('.main').evaluate(e => e.getBoundingClientRect().left);
    expect(Math.round((await sb.boundingBox()).width)).toBe(280);
    expect(Math.round(await mainX())).toBe(280);

    await page.click('#sidebar-pin-btn');
    await page.mouse.move(900, 400);
    await expect.poll(async () => Math.round((await sb.boundingBox()).width)).toBe(80);
    expect(Math.round(await mainX()), 'a tela ocupa o espaco').toBe(80);
    await expect(page.locator('.nav-item .nav-text').first()).toBeHidden();

    await page.mouse.move(40, 300);
    await expect.poll(async () => Math.round((await sb.boundingBox()).width)).toBe(280);
    await expect(page.locator('.nav-item .nav-text').first()).toBeVisible();
    expect(Math.round(await mainX()), 'abre por cima, sem empurrar').toBe(80);

    await page.mouse.move(900, 400);
    await expect.poll(async () => Math.round((await sb.boundingBox()).width)).toBe(80);
});

test('a preferencia sobrevive a sair e entrar, por usuario', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.click('#sidebar-pin-btn');
    expect(await page.evaluate(() => localStorage.getItem('sc_sidebar_u1'))).toBe('collapsed');
    // Sai (sessao some) e entra de novo.
    await page.evaluate(() => sessionStorage.clear());
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 1 })));
    await page.goto(BASE + '/pcp.html');
    await page.mouse.move(900, 400);
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
    await expect(page.locator('#sidebar-pin-btn')).not.toHaveClass(/fixado/);
    await expect.poll(async () => Math.round((await page.locator('#main-sidebar').boundingBox()).width)).toBe(80);
});
