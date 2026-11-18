// Revisao final da Agenda / sino / aceite: o relogio de lembretes nao troca os dados
// no meio de uma confirmacao; Agenda respeita permissoes; aceite grava so o que tocou;
// dia inteiro ocupa 00:00-24:00; pedido de aceite vencido; links do sino; excluir usuario.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

// Quarta, 18/11/2026, 09:00 (relogio controlado).
const AGORA = new Date(2026, 10, 18, 9, 0, 0);
const HOJE = '2026-11-18';
const ONTEM = '2026-11-17';
const AMANHA = '2026-11-19';
const ADMIN = { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' };
const MARIA = { id: 2, nome: 'Maria', email: 'maria@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' };
// Joana: so a Pagina Inicial (sem Producao, sem Configuracoes = sem painel completo).
const JOANA = { id: 3, nome: 'Joana', email: 'joana@sctech.local', papel_id: 9, ativo: true, permissoes_extras: {}, senha_hash: '' };
const CLI = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Av. das Palmeiras, 1000' }];

const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

async function semear(page, dados, usuario) {
    await entrar(page, BASE, { sc_usr: [ADMIN, MARIA, JOANA], sc_cli: CLI(), ...(dados || {}) });
    await page.evaluate(u => {
        // papel 9 "So Painel": apenas a Pagina Inicial
        const pap = JSON.parse(localStorage.getItem('sc_pap')) || papeisPadrao();
        if (!pap.some(p => p.id === 9)) pap.push({ id: 9, nome: 'Só Painel', permissoes: { inicio: { nivel: 'completo', acoes_restritas: [] } } });
        localStorage.setItem('sc_pap', JSON.stringify(pap));
        sessionStorage.setItem('sc_user', JSON.stringify({ id: u.id, email: u.email }));
    }, usuario || ADMIN);
}
async function como(page, usuario, pagina) {
    await page.evaluate(u => sessionStorage.setItem('sc_user', JSON.stringify({ id: u.id, email: u.email })), usuario);
    await page.goto(BASE + '/' + (pagina || 'index.html'));
    await page.waitForLoadState('load');
}
async function abrirSino(page) {
    await page.click('#sino-btn');
    await expect(page.locator('#sino-painel')).toBeVisible();
}
const itemSino = (page, texto) => page.locator('#sino-painel .sino-item', { hasText: texto });

// ── 1. Critico: o relogio de lembretes nao troca pedidos/medicoes no meio de um fluxo ──
test('aprovar pedido com a confirmacao aberta durante a conferencia de 1 minuto: aprova e gera o financeiro uma vez so', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    const orc = { id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Orçamento', valor: 1000, vendedor_nome: 'Bruno',
        data_entrega: '2026-12-01', ambientes: [], itens: [] };
    await semear(page, { sc_ped: [orc] });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { aprovarPedido(26500); });
    await expect(page.locator('#sc-modal-ok')).toBeVisible();
    // Outra aba grava um compromisso enquanto a confirmacao esta aberta: a conferencia
    // de cada minuto rele so a agenda (que mudou), nao pedidos/medicoes.
    await page.evaluate(d => localStorage.setItem('sc_agd_ev', JSON.stringify([{ id: 'e1', prof: 'u:1', tipo: 'compromisso', bloqueio: '',
        data_ini: d, data_fim: d, hora_ini: '09:20', hora_fim: '10:00', dia_inteiro: false, descricao: 'Ligar para fornecedor', aviso_min: 30, criado_por: 1 }])), HOJE);
    await page.clock.runFor(61000);
    await expect(page.locator('#topbar-sino'), 'a conferencia rodou e releu a agenda').toContainText('Ligar para fornecedor', { useInnerText: false });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].status).toBe('Medição');
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.financeiro_gerado).toBe(true);
    const crs = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === 26500);
    expect(crs.length).toBeGreaterThan(0);
    expect(new Set(crs.map(c => c.parcela_tipo)).size, 'nenhuma parcela duplicada').toBe(crs.length);
});

test('sem nada novo gravado, reler nao troca os arrays (mesmos objetos em memoria)', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    await semear(page, { sc_ped: [{ id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Orçamento', valor: 10 }],
        sc_med: [{ id: 5, clienteNome: 'X', data: HOJE, hora: '15:00', status: 'Agendado', usuario_id: 1 }] });
    await page.goto(BASE + '/index.html');
    const r = await page.evaluate(() => {
        const p = db.pedidos, m = db.medicoes, a = db.agenda_eventos;
        _agdRecarregar(); _notifRecarregarDB('sc_ped'); _notifRecarregarDB('sc_med'); _agVerificarLembretes();
        const iguais = db.pedidos === p && db.medicoes === m && db.agenda_eventos === a;
        // outra aba gravou pedidos: agora troca
        localStorage.setItem('sc_ped', JSON.stringify([{ id: 1, status: 'Orçamento' }]));
        _agdRecarregar();
        return { iguais, trocou: db.pedidos !== p && db.pedidos[0].id === 1, medIgual: db.medicoes === m };
    });
    expect(r).toEqual({ iguais: true, trocou: true, medIgual: true });
});

// ── 2. Agenda: detalhe so leitura sem acesso a Producao; itens dos outros sem cliente ──
test('usuario sem acesso a Producao: itens dos outros so "Medicao", sem cliente; os dele abrem so para leitura', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    const meds = [
        { id: 11, clienteNome: 'Cliente Secreto', endereco: 'X', data: HOJE, hora: '10:00', duracao: 60, status: 'Agendado', usuario_id: 1, agendado_por: 1 },
        { id: 12, clienteNome: 'Cliente da Joana', endereco: 'Y', data: HOJE, hora: '14:00', duracao: 60, status: 'Agendado', usuario_id: 3, agendado_por: 1 },
    ];
    const peds = [{ id: 26200, clienteId: 1, clienteNome: 'Pedido Secreto', status: 'Pronto p/ Instalação', inst_agendado: true, valor: 900,
        data_entrega: HOJE, inst_hora: '15:00', inst_duracao: 60, usuario_instalacao_id: 1, criado_por: 1 }];
    await semear(page, { sc_med: meds, sc_ped: peds }, JOANA);
    await page.goto(BASE + '/index.html');
    await page.evaluate(d => abrirAgendaNoDia(d), HOJE);
    const J = page.locator('#agenda-janela');
    // agenda do Teste: so "Medicao"/"Instalacao", sem cliente nem numero do pedido
    await J.locator('[data-prof="u:1"]').click();
    await expect(J.locator('.ag-ev')).toHaveCount(2);
    const html = await J.innerHTML();
    expect(html).not.toContain('Cliente Secreto');
    expect(html).not.toContain('Pedido Secreto');
    expect(html).not.toContain('#26200');
    await J.locator('button.ag-ev-med').click();
    await expect(page.locator('.sc-toast')).toContainText('Você não tem acesso aos detalhes');
    await expect(page.locator('.agd-modal')).toHaveCount(0);
    await J.locator('button.ag-ev-inst').click();
    await expect(page.locator('.agd-modal')).toHaveCount(0);
    // a propria medicao: com cliente, detalhe so para leitura (sem botoes de acao)
    await J.locator('[data-prof="u:3"]').click();
    await expect(J.locator('button.ag-ev-med')).toContainText('Cliente da Joana');
    await J.locator('button.ag-ev-med').click();
    await expect(page.locator('.agd-modal')).toContainText('Visita de medição');
    await expect(page.locator('.agd-modal')).toContainText('Cliente da Joana');
    await expect(page.locator('.agd-modal .agd-modal-acoes')).toHaveCount(0);
    await expect(page.locator('.agd-modal')).not.toContainText('Confirmar medição');

    // o Administrador ve tudo e tem as acoes
    await page.keyboard.press('Escape');
    await como(page, ADMIN);
    await page.evaluate(d => abrirAgendaNoDia(d), HOJE);
    await expect(J.locator('button.ag-ev-med')).toContainText('Cliente Secreto');
    await J.locator('button.ag-ev-med').click();
    await expect(page.locator('.agd-modal')).toContainText('Confirmar medição');
});

// ── 3. Aceite grava so a medicao: o cliente criado em outra aba continua ──
test('aba A aceita pelo sino depois que a aba B criou um cliente: o cliente continua', async ({ page, context }) => {
    const med = { id: 777, clienteId: 1, clienteNome: 'Ana Paula Lima', endereco: 'Av. das Palmeiras, 1000', data: AMANHA, hora: '10:00', duracao: 60,
        status: 'Agendado', usuario_id: 2, agendado_por: 1, aceite: { status: 'pendente', por: 1, em: 1 } };
    await semear(page, { sc_med: [med] }, MARIA);
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#sino-badge')).toHaveText('1');

    const b = await context.newPage();
    await b.goto(BASE + '/login.html');
    await b.evaluate(u => sessionStorage.setItem('sc_user', JSON.stringify({ id: u.id, email: u.email })), ADMIN);
    await b.goto(BASE + '/clientes.html');
    await b.evaluate(() => { db.clientes.push({ id: 99, nome: 'Cliente Novo da Aba B' }); syncDB(); });
    expect((await ler(b, 'sc_cli')).some(c => c.id === 99)).toBe(true);

    await abrirSino(page);
    await itemSino(page, 'Você recebeu a medição').getByRole('button', { name: 'Aceitar' }).click();
    await expect.poll(async () => (await ler(page, 'sc_med'))[0].aceite.status).toBe('aceito');
    expect((await ler(page, 'sc_cli')).map(c => c.id).sort()).toEqual([1, 99]);
});

test('Agenda grava so os eventos: o cliente criado em outra aba continua', async ({ page, context }) => {
    await page.clock.install({ time: AGORA });
    await semear(page, {});
    await page.goto(BASE + '/index.html');
    await page.evaluate(d => abrirAgendaNoDia(d), HOJE);
    const b = await context.newPage();
    await b.goto(BASE + '/login.html');
    await b.evaluate(u => sessionStorage.setItem('sc_user', JSON.stringify({ id: u.id, email: u.email })), ADMIN);
    await b.goto(BASE + '/clientes.html');
    await b.evaluate(() => { db.clientes.push({ id: 99, nome: 'Cliente Novo da Aba B' }); syncDB(); });
    await page.locator('[data-novo="bloqueio"]').click();
    await page.fill('#ag-f-data', AMANHA);
    await page.fill('#ag-f-hi', '10:00');
    await page.fill('#ag-f-hf', '11:00');
    await page.click('#ag-f-salvar');
    await expect.poll(async () => (await ler(page, 'sc_agd_ev') || []).length).toBe(1);
    expect((await ler(page, 'sc_cli')).map(c => c.id).sort()).toEqual([1, 99]);
});

// ── 4. Dia inteiro/folga/ferias ocupam o dia todo ──
test('medicao as 07:00 (antes do expediente) num dia de ferias e recusada', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    const ferias = [{ id: 'f1', prof: 'u:1', tipo: 'bloqueio', bloqueio: 'ferias', data_ini: AMANHA, data_fim: '2026-11-21', hora_ini: '', hora_fim: '',
        dia_inteiro: true, descricao: 'Férias', criado_por: 1 }];
    await semear(page, { sc_agd_ev: ferias });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-cliente-id', '1');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', AMANHA);
    await page.fill('#med-hora', '07:00');
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#sc-modal-msg')).toContainText('já tem compromisso');
    expect(await ler(page, 'sc_med') || []).toEqual([]);
});

// ── 5. Data invalida no evento nao vira codigo nem lembrete ──
test('evento com data invalida e ignorado pelo lembrete (nada roda no clique)', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    const mau = [{ id: 'x1', prof: 'u:1', tipo: 'compromisso', bloqueio: '', data_ini: HOJE + "');window.__pwn=1;('", data_fim: '', hora_ini: '', hora_fim: '',
        dia_inteiro: true, descricao: 'Mau', aviso_min: 30, criado_por: 1 }];
    await semear(page, { sc_agd_ev: mau });
    await page.goto(BASE + '/index.html');
    expect(await page.evaluate(() => Notif.listar().filter(i => i.chave.startsWith('compromisso:')).length)).toBe(0);
    await page.evaluate(() => abrirAgendaNoDia("2026-11-18');window.__pwn=1;('"));
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
});

// ── 6. Destinado editando o proprio pendente = aceitou ──
test('Maria reagenda a propria medicao pendente: vira aceita e o Admin recebe "aceitou"', async ({ page }) => {
    const med = { id: 777, clienteId: 1, clienteNome: 'Ana Paula Lima', endereco: 'Av. das Palmeiras, 1000', rua: 'Av. das Palmeiras', numero: '1000',
        data: AMANHA, hora: '10:00', duracao: 60, status: 'Agendado', usuario_id: 2, agendado_por: 1, aceite: { status: 'pendente', por: 1, em: 1 } };
    await page.clock.install({ time: AGORA });
    await semear(page, { sc_med: [med] }, MARIA);
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.evaluate(() => reagendarMedicao(777));
    await page.fill('#agdf-hora', '16:00');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await ler(page, 'sc_med'))[0].hora).toBe('16:00');
    const m = (await ler(page, 'sc_med'))[0];
    expect(m.aceite).toMatchObject({ status: 'aceito', por: 1 });
    expect(m.aceite.resp_em).toBeTruthy();
    expect(m.historico.some(h => h.acao === 'aceito' && h.por === 2)).toBe(true);
    await como(page, ADMIN);
    await abrirSino(page);
    await expect(itemSino(page, 'Maria aceitou a medição de Ana Paula Lima (19/11 16:00).')).toBeVisible();
});

// ── 7. Pedido de aceite vencido ──
test('pedido de aceite vencido: Maria nao ve Aceitar/Recusar; o Admin ve "nao respondeu" com Reagendar', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    const med = { id: 777, clienteId: 1, clienteNome: 'Ana Paula Lima', endereco: 'Av. das Palmeiras, 1000', data: ONTEM, hora: '10:00', duracao: 60,
        status: 'Agendado', usuario_id: 2, agendado_por: 1, aceite: { status: 'pendente', por: 1, em: 1 } };
    await semear(page, { sc_med: [med] }, MARIA);
    await page.goto(BASE + '/index.html');
    expect(await page.evaluate(() => Notif.listar().filter(i => i.chave.startsWith('aceite-med:')).length)).toBe(0);
    // pelo botao antigo (outra aba ainda mostrava): nao aceita
    await page.evaluate(() => aceitarAgendamento('med', 777));
    expect((await ler(page, 'sc_med'))[0].aceite.status).toBe('pendente');

    await como(page, ADMIN);
    await abrirSino(page);
    const it = itemSino(page, 'Maria não respondeu à medição de Ana Paula Lima (17/11 10:00). Reagende.');
    await expect(it).toBeVisible();
    await it.getByRole('button', { name: 'Reagendar' }).click();
    await expect(page).toHaveURL(/pcp\.html/);
    await expect(page.locator('.agd-modal', { hasText: 'Editar agendamento' })).toBeVisible();
});

test('instalacao vencida sem aceite: o Admin ve "nao respondeu"; o lembrete "Foi instalado?" nao pergunta a Maria', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    const ped = { id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: true, valor: 900,
        data_entrega: ONTEM, inst_hora: '09:00', inst_duracao: 60, usuario_instalacao_id: 2, criado_por: 1, inst_aceite: { status: 'pendente', por: 1, em: 1 } };
    await semear(page, { sc_ped: [ped] }, MARIA);
    await page.goto(BASE + '/index.html');
    const r = await page.evaluate(() => ({
        maria: instalacoesParaConfirmar(db.usuarios.find(u => u.id === 2)).length,
        admin: instalacoesParaConfirmar(db.usuarios.find(u => u.id === 1)).length,
        pedidoAceite: Notif.listar().filter(i => i.chave.startsWith('aceite-inst:')).length,
    }));
    expect(r).toEqual({ maria: 0, admin: 1, pedidoAceite: 0 });
    await expect(page.locator('.lembrete-inst-item')).toHaveCount(0);
    // a janela "Foi instalado?" do Admin (ele criou o pedido) ja foi vista hoje
    await page.evaluate(d => localStorage.setItem('sc_lembrete_inst_1', d), HOJE);
    await como(page, ADMIN);
    await abrirSino(page);
    const it = itemSino(page, 'Maria não respondeu à instalação do pedido #26500 (17/11 09:00). Reagende.');
    await expect(it).toBeVisible();
    await it.getByRole('button', { name: 'Reagendar' }).click();
    await expect(page).toHaveURL(/pcp\.html/);
    await expect(page.locator('.agd-modal', { hasText: 'Reagendar instalação' })).toBeVisible();
});

// ── 8. Item do sino que leva a pagina sem acesso fica sem link ──
test('sino: item com link para a Producao fica sem link para quem nao tem acesso', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    const med = { id: 777, clienteId: 1, clienteNome: 'Ana Paula Lima', endereco: 'X', data: AMANHA, hora: '10:00', duracao: 60,
        status: 'Agendado', usuario_id: 3, agendado_por: 1, aceite: { status: 'pendente', por: 1, em: 1 } };
    await semear(page, { sc_med: [med] }, JOANA);
    await page.goto(BASE + '/index.html');
    await abrirSino(page);
    const it = itemSino(page, 'Você recebeu a medição');
    await expect(it).toHaveAttribute('data-href', '');
    await it.locator('.sino-item-icone').click();
    await expect(page).toHaveURL(/index\.html/);
    // o Administrador (com acesso) tem o link
    expect(await page.evaluate(() => [_hrefPermitido('pcp.html?view=medicoes'), _hrefPermitido('estoque.html'), _hrefPermitido('index.html')]))
        .toEqual([false, false, true]);
    await como(page, ADMIN);
    expect(await page.evaluate(() => _hrefPermitido('pcp.html?view=medicoes'))).toBe(true);
});

// ── 9. Excluir usuario leva os itens da agenda dele ──
test('excluir usuario exclui os itens da agenda dele e a confirmacao avisa', async ({ page }) => {
    const evs = [
        { id: 'a1', prof: 'u:3', tipo: 'compromisso', data_ini: AMANHA, hora_ini: '09:00', hora_fim: '10:00', descricao: 'x', criado_por: 3 },
        { id: 'a2', prof: 'u:3', tipo: 'bloqueio', bloqueio: 'folga', data_ini: AMANHA, dia_inteiro: true, criado_por: 3 },
        { id: 'a3', prof: 'u:1', tipo: 'compromisso', data_ini: AMANHA, hora_ini: '09:00', hora_fim: '10:00', descricao: 'y', criado_por: 1 },
    ];
    await semear(page, { sc_agd_ev: evs });
    await page.goto(BASE + '/empresa.html');
    await page.evaluate(() => { excluirUsuario(3); });
    await expect(page.locator('#sc-modal-msg')).toContainText('Excluir definitivamente o usuário "Joana" e 2 item(ns) da agenda dele?');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_usr')).map(u => u.id)).toEqual([1, 2]);
    expect((await ler(page, 'sc_agd_ev')).map(e => e.id)).toEqual(['a3']);
});

// ── Ledger: Aceitar/Recusar pelo card de Alertas; cancelar instalacao pendente ──
test('Aceitar pelo card de Alertas do Painel', async ({ page }) => {
    const med = { id: 777, clienteId: 1, clienteNome: 'Ana Paula Lima', endereco: 'X', data: AMANHA, hora: '10:00', duracao: 60,
        status: 'Agendado', usuario_id: 2, agendado_por: 1, aceite: { status: 'pendente', por: 1, em: 1 } };
    await page.clock.install({ time: AGORA });
    await semear(page, { sc_med: [med] }, MARIA);
    await page.goto(BASE + '/index.html');
    await page.locator('#dashboard-alertas').getByRole('button', { name: 'Aceitar' }).click();
    await expect.poll(async () => (await ler(page, 'sc_med'))[0].aceite.status).toBe('aceito');
});

test('Recusar pelo card de Alertas do Painel', async ({ page }) => {
    const med = { id: 777, clienteId: 1, clienteNome: 'Ana Paula Lima', endereco: 'X', data: AMANHA, hora: '10:00', duracao: 60,
        status: 'Agendado', usuario_id: 2, agendado_por: 1, aceite: { status: 'pendente', por: 1, em: 1 } };
    await page.clock.install({ time: AGORA });
    await semear(page, { sc_med: [med] }, MARIA);
    await page.goto(BASE + '/index.html');
    await page.locator('#dashboard-alertas').getByRole('button', { name: 'Recusar' }).click();
    await page.fill('#aceite-motivo', 'Sem carro');
    await page.click('#aceite-confirmar');
    await expect.poll(async () => (await ler(page, 'sc_med'))[0].status).toBe('A reagendar');
});

test('cancelar instalacao pendente de aceite tira o pedido de aceite', async ({ page }) => {
    await page.clock.install({ time: AGORA });
    const ped = { id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: true, valor: 900,
        data_entrega: AMANHA, inst_hora: '09:00', inst_duracao: 60, usuario_instalacao_id: 2, criado_por: 1, inst_aceite: { status: 'pendente', por: 1, em: 1 } };
    await semear(page, { sc_ped: [ped] });
    await page.goto(BASE + '/pcp.html?view=agenda');
    await page.evaluate(() => { cancelarAgendamentoInstalacao(26500); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].inst_agendado).toBe(false);
    expect((await ler(page, 'sc_ped'))[0].inst_aceite).toBeUndefined();
    await como(page, MARIA);
    expect(await page.evaluate(() => Notif.listar().filter(i => i.chave.startsWith('aceite-inst:')).length)).toBe(0);
});

test('editar e salvar o pedido mantem o pedido de aceite e a recusa da instalacao', async ({ page }) => {
    // (pedido em Orcamento: a tela so deixa editar ate la; os campos de instalacao passam pela mesma lista)
    const ped = { id: 26310, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Orçamento', valor: 900, amb: 'Sala', vendedor_id: 1,
        criado_por: 1, data_criacao: 1700000000000, ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [],
        inst_agendado: true, data_entrega: AMANHA, inst_hora: '09:00', usuario_instalacao_id: 2,
        inst_aceite: { status: 'pendente', por: 1, em: 5 }, inst_recusa: { por: 2, para: 1, motivo: 'antes', em: 4 } };
    await semear(page, { sc_ped: [ped], sc_vend: [{ id: 1, nome: 'Ana', comissao_pct: 5 }], sc_editando_id: 26310 });
    await page.goto(BASE + '/pedido.html');
    await page.selectOption('#ped-vendedor', '1');
    await page.evaluate(() => { pedidoDraft.ambientes.forEach(a => { a.calculado = true; }); salvarPedido(); });
    await page.waitForURL(/index\.html/);
    const salvo = (await ler(page, 'sc_ped')).find(p => p.id === 26310);
    expect(salvo.inst_aceite).toEqual({ status: 'pendente', por: 1, em: 5 });
    expect(salvo.inst_recusa).toEqual({ por: 2, para: 1, motivo: 'antes', em: 4 });
});
