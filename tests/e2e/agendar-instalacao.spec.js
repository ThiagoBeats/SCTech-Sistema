// Agendamento de instalacao a partir do pedido pronto, com a disponibilidade do
// profissional compartilhada entre a Agenda de Instalacoes e a de Medicoes.
//   - Na Costura -> Pronto p/ Instalacao nao agenda nada: o pedido vira card
//     em "Pedidos Prontos para Instalacao".
//   - O agendamento comeca pelo card (ou pelo botao do Kanban) e so grava se o
//     profissional estiver livre na duracao escolhida, contando instalacoes e
//     medicoes; a conferencia e refeita contra o que esta gravado ao salvar.
//   - Um pedido tem no maximo uma instalacao: nada de duplicar.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}

const CLI = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Av. das Palmeiras, 1000' }];
const MAT = () => [{ id: 1, nome: 'Trilho', unidade: 'un', estoque_atual: 10 }];

async function abrir(page, view, dados) {
    await entrar(page, BASE, { sc_cli: CLI(), sc_mat: MAT(), ...(dados || {}) });
    await page.goto(BASE + '/pcp.html?view=' + view);
}

const lerPeds = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')));
const lerPed  = async (page, id) => (await lerPeds(page)).find(p => p.id === id);
const lerMeds = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_med')) || []);
const colunaKanban = (page, titulo) => page.locator('.kanban-col', { has: page.locator('.kanban-col-header', { hasText: titulo }) });

const pronto = (extra) => ({ id: 26200, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: false, valor: 900, amb: 'Cortina Sala', ...(extra || {}) });

async function preencher(page, { prof = 'u:1', data = dia(2), hora = '10:00', dur } = {}) {
    await page.selectOption('#inst-prof', prof);
    await page.fill('#inst-data', data);
    if (dur) await page.selectOption('#inst-dur', String(dur));
    await page.fill('#inst-hora', hora);
}

// --- Fluxo do pedido ------------------------------------------------------------

test('Na Costura -> Pronto nao abre popup e o pedido aparece nos cards da agenda', async ({ page }) => {
    await abrir(page, 'kanban', {
        sc_ped: [{ id: 26100, clienteId: 1, clienteNome: 'Costura Sem Item', status: 'Na Costura', valor: 500, amb: 'Sala' }],
    });
    await page.locator('.kanban-card', { hasText: 'Costura Sem Item' }).locator('button[title="Avançar etapa"]').click();
    await expect.poll(async () => (await lerPed(page, 26100)).status).toBe('Pronto p/ Instalação');
    const p = await lerPed(page, 26100);
    expect(p.inst_agendado, 'entra sem agendamento').toBe(false);
    expect(p.inst_hora).toBeFalsy();
    await page.click('#tab-btn-agenda');
    await expect(page.locator('#inst-prontos-lista')).toContainText('#26100');
    await expect(page.locator('#inst-pend-lista')).not.toContainText('Costura Sem Item');
});

test('Na Costura -> Pronto ainda pede a baixa dos materiais; desistir nao move', async ({ page }) => {
    await abrir(page, 'kanban', {
        sc_ped: [{ id: 26101, clienteId: 1, clienteNome: 'Costura Com Item', status: 'Na Costura', valor: 700,
            itens: [{ materialId: 1, nome: 'Trilho', quantidade: 2, unidade: 'un' }] }],
    });
    await page.locator('.kanban-card', { hasText: 'Costura Com Item' }).locator('button[title="Avançar etapa"]').click();
    await page.locator('.sc-modal-btns .btn-outline, #sc-modal-cancel').first().click();
    const p = await lerPed(page, 26101);
    expect(p.status).toBe('Na Costura');
    expect(p.baixa_mat_realizada).toBeFalsy();
});

test('Kanban: pedido pronto sem agenda leva para a agenda com o pedido selecionado', async ({ page }) => {
    await abrir(page, 'kanban', { sc_ped: [pronto()] });
    const card = colunaKanban(page, 'Pronto p/ Instalação').locator('.kanban-card', { hasText: 'Ana Paula Lima' });
    await expect(card).toContainText('Aguardando agendamento');
    await expect(card.locator('button[title="Avançar etapa"]'), 'nao confirma sem agendar').toHaveCount(0);
    await card.locator('button[title="Agendar instalação"]').click();
    await expect(page.locator('#pcp-view-agenda')).toBeVisible();
    await expect(page.locator('#inst-pedido')).toHaveValue('26200');
    await expect(page.locator('#inst-cliente')).toContainText('Ana Paula Lima');
    await expect(page.locator('#inst-cliente')).toContainText('44991234567');
    await expect(page.locator('#inst-end')).toHaveValue('Av. das Palmeiras, 1000');
    await expect(page.locator('#inst-pedido-sub')).toContainText('Cortina Sala');
    await expect(page.locator('#inst-prontos-lista .agd-pronto-sel')).toContainText('#26200');
    expect((await lerPed(page, 26200)).inst_agendado, 'nada agendado automaticamente').toBe(false);
});

test('link de outra tela (?pedido=) chega com o pedido selecionado', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await page.goto(BASE + '/pcp.html?view=agenda&pedido=26200');
    await expect(page.locator('#inst-pedido')).toHaveValue('26200');
});

// --- Agendar ----------------------------------------------------------------------

test('agendar grava no proprio pedido e o move para Agendamentos, sem duplicar', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await page.locator('#inst-prontos-lista .agd-pronto', { hasText: '#26200' }).click();
    await preencher(page, { hora: '11:00' });
    await expect(page.locator('#inst-dur')).toHaveValue('120');   // padrao: 2 horas
    await page.fill('#inst-obs', 'Portão azul');
    await page.click('#inst-btn-agendar');

    await expect(page.locator('#inst-pend-lista')).toContainText('Ana Paula Lima');
    await expect(page.locator('#inst-prontos-lista')).not.toContainText('#26200');
    await expect(page.locator('#inst-prontos-count')).toHaveText('0 pedidos');
    const peds = await lerPeds(page);
    expect(peds.length, 'nenhum pedido novo').toBe(1);
    expect(peds[0]).toMatchObject({
        inst_agendado: true, data_entrega: dia(2), inst_hora: '11:00', inst_duracao: 120,
        usuario_instalacao_id: 1, inst_agendado_por: 1, inst_obs: 'Portão azul', inst_endereco: 'Av. das Palmeiras, 1000',
    });
    expect(peds[0].inst_historico[0].acao).toBe('agendado');
});

test('campos obrigatorios: pedido, profissional, data e horario', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await page.click('#inst-btn-agendar');
    await expect(page.locator('#inst-pedido')).toHaveClass(/agd-erro/);
    await page.locator('#sc-modal-ok').click();
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await page.click('#inst-btn-agendar');
    await expect(page.locator('#inst-prof')).toHaveClass(/agd-erro/);
    await expect(page.locator('#inst-hora')).toHaveClass(/agd-erro/);
    await page.locator('#sc-modal-ok').click();
    expect((await lerPed(page, 26200)).inst_agendado).toBe(false);
});

test('instalador digitado (nao cadastrado) fica gravado como nome', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await page.selectOption('#inst-prof', '__outro');
    await page.fill('#inst-prof-outro', 'Zé Terceirizado');
    await page.fill('#inst-data', dia(2));
    await page.fill('#inst-hora', '09:00');
    await expect(page.locator('#inst-disp')).toContainText('Zé Terceirizado');
    await page.click('#inst-btn-agendar');
    await expect.poll(async () => (await lerPed(page, 26200)).inst_agendado).toBe(true);
    const p = await lerPed(page, 26200);
    expect(p.instalador_nome).toBe('Zé Terceirizado');
    expect(p.usuario_instalacao_id).toBeNull();
});

// --- Disponibilidade compartilhada -------------------------------------------------

test('painel: verde livre, vermelho ocupado (medicao), cinza onde a duracao nao cabe', async ({ page }) => {
    await abrir(page, 'agenda', {
        sc_ped: [pronto()],
        sc_med: [{ id: 1, clienteNome: 'Carlos Souza', endereco: 'X', data: dia(2), hora: '10:30', duracao: 60, status: 'Agendado', usuario_id: 1 }],
    });
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await page.selectOption('#inst-prof', 'u:1');
    await page.fill('#inst-data', dia(2));
    const slot = h => page.locator('#inst-disp .agd-slot', { hasText: h });
    await expect(slot('08:00')).toHaveClass(/agd-slot-livre/);     // 08-10 cabe
    await expect(slot('09:00')).toHaveClass(/agd-slot-indisp/);    // 09-11 esbarra na medicao
    await expect(slot('10:00')).toHaveClass(/agd-slot-ocupado/);
    await expect(slot('11:00')).toHaveClass(/agd-slot-ocupado/);
    await expect(slot('12:00')).toHaveClass(/agd-slot-livre/);
    await expect(page.locator('#inst-disp')).toContainText('Medição');
    await expect(page.locator('#inst-disp')).toContainText('Disponível');

    // Duracao menor muda a grade na hora: 09-10 passa a caber.
    await page.selectOption('#inst-dur', '60');
    await expect(slot('09:00')).toHaveClass(/agd-slot-livre/);
});

test('salvar em cima de uma medicao do mesmo profissional e bloqueado', async ({ page }) => {
    await abrir(page, 'agenda', {
        sc_ped: [pronto()],
        sc_med: [{ id: 1, clienteNome: 'Carlos Souza', endereco: 'X', data: dia(2), hora: '11:00', duracao: 60, status: 'Agendado', usuario_id: 1 }],
    });
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await preencher(page, { hora: '10:00' });   // 10-12 cruza 11-12
    await expect(page.locator('#inst-disp .agd-disp-aviso')).toContainText('Carlos Souza');
    await page.click('#inst-btn-agendar');
    await expect(page.locator('.sc-modal, #sc-modal-ok').first()).toBeVisible();
    await expect(page.locator('body')).toContainText('já tem compromisso');
    await page.locator('#sc-modal-ok').click();
    expect((await lerPed(page, 26200)).inst_agendado).toBe(false);
});

test('outro profissional no mesmo horario esta livre', async ({ page }) => {
    await abrir(page, 'agenda', {
        sc_ped: [pronto()],
        sc_med: [{ id: 1, clienteNome: 'Carlos Souza', endereco: 'X', data: dia(2), hora: '10:00', status: 'Agendado', responsavel_nome: 'Outro Medidor' }],
    });
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await preencher(page, { hora: '10:00' });
    await page.click('#inst-btn-agendar');
    await expect.poll(async () => (await lerPed(page, 26200)).inst_agendado).toBe(true);
});

test('servico concluido ou cancelado nao bloqueia o horario', async ({ page }) => {
    await abrir(page, 'agenda', {
        sc_ped: [pronto(), { id: 26201, clienteId: 1, clienteNome: 'Já Instalado', status: 'Instalado', inst_agendado: true, data_entrega: dia(2), inst_hora: '10:00', usuario_instalacao_id: 1, valor: 1 }],
        sc_med: [
            { id: 1, clienteNome: 'Feita', endereco: 'X', data: dia(2), hora: '10:00', status: 'Realizado', usuario_id: 1 },
            { id: 2, clienteNome: 'Cancelada', endereco: 'X', data: dia(2), hora: '11:00', status: 'Cancelado', usuario_id: 1 },
        ],
    });
    await page.locator('#inst-prontos-lista .agd-pronto', { hasText: '#26200' }).click();
    await preencher(page, { hora: '10:00' });
    await expect(page.locator('#inst-disp .agd-slot', { hasText: '10:00' })).toHaveClass(/agd-slot-livre/);
    await page.click('#inst-btn-agendar');
    await expect.poll(async () => (await lerPed(page, 26200)).inst_agendado).toBe(true);
});

test('a agenda de medicoes enxerga as instalacoes do profissional', async ({ page }) => {
    await abrir(page, 'medicoes', {
        sc_ped: [pronto({ inst_agendado: true, data_entrega: dia(3), inst_hora: '14:00', inst_duracao: 120, usuario_instalacao_id: 1 })],
    });
    await page.selectOption('#med-cliente-id', '1');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', dia(3));
    await expect(page.locator('#med-disp .agd-slot', { hasText: '14:00' })).toHaveClass(/agd-slot-ocupado/);
    await expect(page.locator('#med-disp .agd-slot', { hasText: '15:00' })).toHaveClass(/agd-slot-ocupado/);
    await expect(page.locator('#med-disp')).toContainText('Instalação');
    await page.fill('#med-hora', '15:00');
    await page.fill('#med-end', 'Rua A, 1');
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('body')).toContainText('já tem compromisso');
    await page.locator('#sc-modal-ok').click();
    expect((await lerMeds(page)).length, 'nada gravado').toBe(0);

    // 16:00 (fim da instalacao) esta livre: grava.
    await page.fill('#med-hora', '16:00');
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-pend-lista')).toContainText('Ana Paula Lima');
    const m = (await lerMeds(page))[0];
    expect(m).toMatchObject({ usuario_id: 1, hora: '16:00', duracao: 60, agendado_por: 1 });
});

test('medicao com responsavel exige horario', async ({ page }) => {
    await abrir(page, 'medicoes', { sc_ped: [] });
    await page.selectOption('#med-cliente-id', '1');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', dia(3));
    await page.fill('#med-end', 'Rua A, 1');
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-hora')).toHaveClass(/agd-erro/);
    await page.locator('#sc-modal-ok').click();
    expect((await lerMeds(page)).length).toBe(0);
});

test('proximos horarios livres: o chip preenche o horario', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await page.selectOption('#inst-prof', 'u:1');
    await page.fill('#inst-data', dia(2));
    const chips = page.locator('#inst-disp .agd-chip:not(.agd-chip-mais)');
    await expect(chips).toHaveCount(4);
    await expect(page.locator('#inst-disp .agd-chip-mais')).toBeVisible();
    await chips.nth(1).click();
    await expect(page.locator('#inst-hora')).toHaveValue('09:00');
    await expect(page.locator('#inst-disp .agd-disp-ok')).toContainText('09:00 – 11:00');
});

// --- Conflito simultaneo / duplicidade ---------------------------------------------

test('horario ocupado por outra aba depois da tela aberta: a conferencia ao salvar bloqueia', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await preencher(page, { hora: '10:00' });
    await expect(page.locator('#inst-disp .agd-disp-ok')).toBeVisible();
    // Outra aba grava uma medicao no mesmo horario (sem passar por esta tela).
    await page.evaluate(d => localStorage.setItem('sc_med', JSON.stringify([
        { id: 9, clienteNome: 'Outra Aba', endereco: 'X', data: d, hora: '10:30', status: 'Agendado', usuario_id: 1 }])), dia(2));
    await page.click('#inst-btn-agendar');
    await expect(page.locator('body')).toContainText('Outra Aba');
    await page.locator('#sc-modal-ok').click();
    expect((await lerPed(page, 26200)).inst_agendado).toBe(false);
});

test('pedido agendado por outra aba nao e agendado de novo', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await preencher(page, { hora: '10:00' });
    await page.evaluate(d => {
        const peds = JSON.parse(localStorage.getItem('sc_ped'));
        Object.assign(peds[0], { inst_agendado: true, data_entrega: d, inst_hora: '15:00', usuario_instalacao_id: 1, inst_agendado_por: 1 });
        localStorage.setItem('sc_ped', JSON.stringify(peds));
    }, dia(5));
    await page.click('#inst-btn-agendar');
    await expect(page.locator('body')).toContainText('já foi agendado');
    await page.locator('#sc-modal-ok').click();
    const peds = await lerPeds(page);
    expect(peds.length).toBe(1);
    expect(peds[0]).toMatchObject({ data_entrega: dia(5), inst_hora: '15:00' });   // o agendamento da outra aba fica
});

// --- Depois de agendado ------------------------------------------------------------

const agendado = () => pronto({ inst_agendado: true, data_entrega: dia(2), inst_hora: '10:00', inst_duracao: 120, usuario_instalacao_id: 1 });

test('cancelar libera o horario e devolve o pedido aos prontos', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [agendado()] });
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.click('.agd-modal button:has-text("Cancelar agendamento")');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#inst-prontos-lista')).toContainText('#26200');
    await expect(page.locator('#inst-pend-lista')).not.toContainText('Ana Paula Lima');
    const p = await lerPed(page, 26200);
    expect(p).toMatchObject({ inst_agendado: false, status: 'Pronto p/ Instalação' });
    expect(p.inst_historico[0]).toMatchObject({ acao: 'cancelado', de: { data: dia(2), hora: '10:00' } });
    // O horario volta a ficar livre para o profissional.
    await page.locator('#inst-prontos-lista .agd-pronto').first().click();
    await preencher(page, { hora: '10:00' });
    await expect(page.locator('#inst-disp .agd-slot', { hasText: '10:00' })).toHaveClass(/agd-slot-livre/);
});

test('reagendar confere a disponibilidade (ignorando o proprio horario)', async ({ page }) => {
    await abrir(page, 'agenda', {
        sc_ped: [agendado()],
        sc_med: [{ id: 1, clienteNome: 'Carlos Souza', endereco: 'X', data: dia(2), hora: '14:00', status: 'Agendado', usuario_id: 1 }],
    });
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.click('.agd-modal button:has-text("Reagendar")');
    await expect(page.locator('#agdf-disp .agd-slot', { hasText: '10:00' }), 'o proprio horario nao conta').toHaveClass(/agd-slot-livre/);
    await page.fill('#agdf-hora', '13:00');   // 13-15 cruza a medicao das 14
    await page.click('#agdf-salvar');
    await expect(page.locator('body')).toContainText('já tem compromisso');
    await page.locator('#sc-modal-ok').click();
    expect((await lerPed(page, 26200)).inst_hora).toBe('10:00');

    await page.fill('#agdf-hora', '15:00');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerPed(page, 26200)).inst_hora).toBe('15:00');
    expect((await lerPed(page, 26200)).inst_historico[0]).toMatchObject({ acao: 'reagendado', de: { hora: '10:00' }, para: { hora: '15:00' } });
});

test('confirmar a instalacao leva para Realizados (inclusive com saldo)', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [agendado()] });
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.click('.agd-modal button:has-text("Confirmar instalação")');
    await page.click('#mpg-nao');
    const linha = page.locator('#inst-real-lista .agd-item', { hasText: 'Ana Paula Lima' });
    await expect(linha.locator('.agd-pill')).toHaveText('Aguard. pagamento');
    await expect(page.locator('#inst-pend-lista')).not.toContainText('Ana Paula Lima');
    const p = await lerPed(page, 26200);
    expect(p.status).toBe('Aguardando Pagamento');
    expect(p.inst_confirmada_em).toBeGreaterThan(0);
});

test('duracao padrao por tipo de servico, ajustavel por agendamento', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await page.click('#inst-form .agd-cfg-btn');
    await page.selectOption('#agdc-inst', '180');
    await page.selectOption('#agdc-med', '90');
    await page.click('#agdc-salvar');
    await expect(page.locator('#inst-dur')).toHaveValue('180');
    await expect(page.locator('#inst-dur option:checked')).toHaveText('3 horas (padrão)');
    await page.click('#tab-btn-medicoes');
    await expect(page.locator('#med-dur')).toHaveValue('90');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_agd_cfg')))).toMatchObject({ dur_inst: 180, dur_med: 90 });
});

test('agendamento fica visivel para o instalador e para quem agendou', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [agendado()] });
    const r = await page.evaluate(() => {
        const p = { usuario_instalacao_id: 7, inst_agendado_por: 8 };
        return [pedidoEhMeu(p, { id: 7 }), pedidoEhMeu(p, { id: 8 }), pedidoEhMeu(p, { id: 9 }),
                medicaoEhMinha({ usuario_id: 7, agendado_por: 8 }, { id: 8 })];
    });
    expect(r).toEqual([true, true, false, true]);
});

test('agenda de instalacoes mostra e edita o instalador digitado', async ({ page }) => {
    await abrir(page, 'agenda', {
        sc_ped: [{ id: 26110, clienteId: 1, clienteNome: 'Pedido Agenda', status: 'Pronto p/ Instalação', valor: 100, data_entrega: dia(2), inst_hora: '08:00', instalador_nome: 'Zé Terceirizado' }],
    });
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedido Agenda' }).click();
    await expect(page.locator('.agd-modal')).toContainText('Zé Terceirizado');
    await page.click('.agd-modal button:has-text("Editar")');
    await expect(page.locator('#agdf-usu option:checked')).toHaveText('Zé Terceirizado');
    await page.selectOption('#agdf-usu', '__outro');
    await page.fill('#agdf-usu-outro', 'Outro Instalador');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerPed(page, 26110)).instalador_nome).toBe('Outro Instalador');
});

// --- Profissionais no painel / botao do Kanban ---------------------------------------

test('sem profissional escolhido, o painel lista todos e clicar seleciona', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI(), sc_ped: [pronto()] });
    await page.evaluate(() => {
        // Papeis padrao + um papel "Instalador" (copia das permissoes de Producao).
        const pap = papeisPadrao();
        pap.push({ id: 9, nome: 'Instalador', permissoes: pap[3].permissoes });
        localStorage.setItem('sc_pap', JSON.stringify(pap));
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u.push({ id: 2, nome: 'Marcos Instalador', email: 'm@a', papel_id: 9, ativo: true, permissoes_extras: {} });
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/pcp.html?view=agenda');
    const itens = page.locator('#inst-disp .agd-disp-prof-btn');
    await expect(itens).toHaveCount(2);
    await expect(itens.first(), 'papel de instalador vem primeiro').toContainText('Marcos Instalador');
    await itens.first().click();
    await expect(page.locator('#inst-prof')).toHaveValue('u:2');
    await expect(page.locator('#inst-disp .agd-disp-grade')).toBeVisible();
});

test('colaborador cadastrado em outra aba aparece sem recarregar a agenda', async ({ page, context }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await expect(page.locator('#inst-prof option')).toHaveText(['Selecione', 'Teste', '+ Outro (digitar nome)…']);
    const outra = await context.newPage();
    await outra.goto(BASE + '/configuracoes.html');
    await outra.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u.push({ id: 2, nome: 'Marcos Instalador', email: 'm@a', papel_id: 1, ativo: true, permissoes_extras: {} });
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await expect(page.locator('#inst-prof option', { hasText: 'Marcos Instalador' })).toHaveCount(1);
    await expect(page.locator('#inst-disp')).toContainText('Marcos Instalador');
});

test('Kanban: "Agendar instalação" fica embaixo do card, na largura toda', async ({ page }) => {
    await abrir(page, 'kanban', { sc_ped: [pronto()] });
    const card = colunaKanban(page, 'Pronto p/ Instalação').locator('.kanban-card').first();
    const btn = card.locator('button[title="Agendar instalação"]');
    await expect(btn).toHaveText('📅 Agendar instalação');
    const [c, b, a] = await Promise.all([card.boundingBox(), btn.boundingBox(), card.locator('.kanban-card-actions').boundingBox()]);
    expect(b.y, 'abaixo das acoes').toBeGreaterThan(a.y + a.height - 1);
    expect(b.width, 'quase a largura do card').toBeGreaterThan(c.width - 40);
});
