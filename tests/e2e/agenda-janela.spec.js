// Janela da Agenda sobre o Painel: visoes, cores, eventos proprios, conflitos,
// privacidade, permissoes e atualizacao ao vivo entre abas.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

// Data fixa (quarta, 08:00): nenhum dia da semana quebra os testes.
const BASE_DATA = new Date(2026, 10, 18, 8, 0, 0);
const fixarRelogio = page => page.clock.setFixedTime(BASE_DATA);
function dia(offset) {
    const d = new Date(BASE_DATA); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}
const HOJE = dia(0);
const DIA_INST = dia(1);
const USU = () => [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Maria Souza', email: 'maria@sctech.local', papel_id: 6, ativo: true, permissoes_extras: {}, senha_hash: '' },
];
const CLI = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Av. das Palmeiras, 1000' }];
// Medicao 09:00-10:00 (usuario 1), instalacao 14:00-16:00 (usuario 1) e uma medicao
// de um profissional externo.
const MED = () => [
    { id: 1, clienteNome: 'Carlos Souza', endereco: 'X', data: HOJE, hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1 },
    { id: 2, clienteNome: 'Cliente Externo', endereco: 'Y', data: HOJE, hora: '11:00', duracao: 60, status: 'Agendado', responsavel_nome: 'Pedro Terceiro' },
];
const PED = () => [{ id: 26200, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: true,
    valor: 900, amb: 'Cortina Sala', data_entrega: DIA_INST, inst_hora: '14:00', inst_duracao: 120, usuario_instalacao_id: 1 }];
const EV = (extra) => ({ id: 'e1', prof: 'u:1', tipo: 'compromisso', bloqueio: '', data_ini: HOJE, data_fim: HOJE, hora_ini: '12:00', hora_fim: '13:00',
    dia_inteiro: false, descricao: 'Dentista particular', aviso_min: 30, criado_por: 1, ...extra });

async function abrir(page, extras, comoUsuario, pagina) {
    await fixarRelogio(page);
    await entrar(page, BASE, { sc_usr: USU(), sc_cli: CLI(), sc_med: MED(), sc_ped: PED(), ...(extras || {}) });
    if (comoUsuario) {
        await page.evaluate(([id, email]) => sessionStorage.setItem('sc_user', JSON.stringify({ id, email })), [comoUsuario.id, comoUsuario.email]);
    }
    await page.goto(BASE + '/' + (pagina || 'index.html'));
    if (!pagina) await page.click('#btn-agenda');
    await expect(page.locator('#agenda-janela')).toBeVisible();
}
const MARIA = { id: 2, email: 'maria@sctech.local' };
const J = page => page.locator('#agenda-janela');
const evento = (page, texto) => J(page).locator('.ag-ev', { hasText: texto });
const guardados = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_agd_ev') || '[]'));
const ok = page => page.locator('#sc-modal-ok').click();

test('botao Agenda abre a janela no Painel, em Minha agenda e na Semana', async ({ page }) => {
    await abrir(page);
    expect(page.url()).toContain('index.html');
    // O botao fica logo a esquerda de Dashboards.
    expect(await page.evaluate(() => document.getElementById('btn-agenda').nextElementSibling.id)).toBe('dash-nav-btn');
    await expect(J(page).locator('.ag-prof-sel')).toContainText('Minha agenda');
    await expect(J(page).locator('.ag-prof-sel')).toContainText('Teste');
    await expect(J(page).locator('.ag-vis-on')).toHaveText('Semana');
    const nomes = await J(page).locator('.ag-prof strong').allTextContents();
    expect(nomes).toEqual(expect.arrayContaining(['Teste', 'Maria Souza', 'Pedro Terceiro']));
    expect(nomes[0]).toBe('Teste');   // Minha agenda no topo
    await expect(J(page).locator('.ag-topo')).toContainText('Agenda');
    const cor = await J(page).locator('.ag-topo').evaluate(e => getComputedStyle(e).backgroundColor);
    const primaria = await page.evaluate(() => { const t = document.createElement('i'); t.style.color = getComputedStyle(document.documentElement).getPropertyValue('--primary'); document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; });
    expect(cor).toBe(primaria);   // cabecalho na cor principal do SCTech
});

test('Dia, Mes, setas e Hoje mudam o periodo', async ({ page }) => {
    await abrir(page);
    const per = v => page.evaluate(([v, d]) => AgendaCore.periodo(v, d).rotulo, [v, HOJE]);
    await expect(J(page).locator('.ag-periodo')).toHaveText(await per('semana'));
    await expect(J(page).locator('.ag-cab')).toHaveCount(8);   // Horario + 7 dias
    await J(page).locator('[data-visao="dia"]').click();
    await expect(J(page).locator('.ag-periodo')).toHaveText(await per('dia'));
    await expect(J(page).locator('.ag-col')).toHaveCount(1);
    await J(page).locator('[data-nav="1"]').click();
    await expect(J(page).locator('.ag-periodo')).not.toHaveText(await per('dia'));
    await J(page).locator('[data-nav="0"]').click();
    await expect(J(page).locator('.ag-periodo')).toHaveText(await per('dia'));
    await J(page).locator('[data-visao="mes"]').click();
    await expect(J(page).locator('.ag-periodo')).toHaveText(await per('mes'));
    await expect(J(page).locator('.ag-mes-cel')).toHaveCount(42);
    await J(page).locator('[data-nav="-1"]').click();
    await expect(J(page).locator('.ag-periodo')).not.toHaveText(await per('mes'));
    await J(page).locator('[data-visao="semana"]').click();
    await J(page).locator('[data-nav="1"]').click();
    await expect(J(page).locator('.ag-ev')).toHaveCount(0);   // outra semana, sem itens
});

test('medicao e instalacao aparecem nas cores certas ocupando a duracao', async ({ page }) => {
    await abrir(page);
    const med = evento(page, 'Carlos Souza'), inst = evento(page, 'Ana Paula Lima');
    await expect(med).toHaveClass(/ag-ev-med/);
    await expect(inst).toHaveClass(/ag-ev-inst/);
    const cor = loc => loc.evaluate(e => getComputedStyle(e).backgroundColor);
    expect(await cor(med)).not.toBe(await cor(inst));
    const hm = (await med.boundingBox()).height, hi = (await inst.boundingBox()).height;
    expect(hi / hm).toBeGreaterThan(1.8);   // 120 min x 60 min
    expect(hi / hm).toBeLessThan(2.2);
    // O profissional externo tem a propria agenda.
    await J(page).locator('.ag-prof', { hasText: 'Pedro Terceiro' }).click();
    await expect(evento(page, 'Cliente Externo')).toHaveClass(/ag-ev-med/);
    await expect(evento(page, 'Carlos Souza')).toHaveCount(0);
    // Mes: chips.
    await J(page).locator('[data-visao="mes"]').click();
    await expect(J(page).locator('.ag-chip', { hasText: 'Medição' })).toHaveCount(1);
});

test('clicar em medicao e instalacao abre o detalhe de cada uma', async ({ page }) => {
    await abrir(page);
    await evento(page, 'Carlos Souza').click();
    await expect(page.locator('.agd-modal')).toContainText('Visita de medição');
    await expect(page.locator('.agd-modal')).toContainText('Carlos Souza');
    await page.keyboard.press('Escape');
    await expect(page.locator('.agd-modal')).toHaveCount(0);
    await expect(J(page)).toBeVisible();   // Esc fechou so o detalhe
    await evento(page, 'Ana Paula Lima').click();
    await expect(page.locator('.agd-modal')).toContainText('Instalação');
    await expect(page.locator('.agd-modal')).toContainText('26200');
});

test('Novo compromisso grava, aparece, edita e exclui', async ({ page }) => {
    await abrir(page);
    await J(page).locator('[data-novo="compromisso"]').click();
    await page.fill('#ag-f-data', HOJE);
    await page.fill('#ag-f-hi', '12:00');
    await page.fill('#ag-f-hf', '13:00');
    await page.fill('#ag-f-desc', 'Reunião com fornecedor');
    await expect(page.locator('#ag-f-aviso')).toHaveValue('30');
    expect(await page.locator('#ag-f-aviso option').allTextContents()).toEqual(['15 minutos antes', '30 minutos antes', '1 hora antes', '1 dia antes']);
    await page.selectOption('#ag-f-aviso', '60');
    await page.click('#ag-f-salvar');
    await expect(page.locator('.agd-modal')).toHaveCount(0);
    await expect(evento(page, 'Reunião com fornecedor')).toHaveClass(/ag-ev-comp/);
    const salvos = await guardados(page);
    expect(salvos).toHaveLength(1);
    expect(salvos[0]).toMatchObject({ prof: 'u:1', tipo: 'compromisso', data_ini: HOJE, hora_ini: '12:00', hora_fim: '13:00', descricao: 'Reunião com fornecedor', aviso_min: 60, criado_por: 1 });
    // Editar.
    await evento(page, 'Reunião com fornecedor').click();
    await expect(page.locator('.agd-modal')).toContainText('Editar compromisso');
    await page.fill('#ag-f-desc', 'Reunião remarcada');
    await page.click('#ag-f-salvar');
    await expect(evento(page, 'Reunião remarcada')).toHaveCount(1);
    expect((await guardados(page))[0].descricao).toBe('Reunião remarcada');
    // Excluir.
    await evento(page, 'Reunião remarcada').click();
    await page.click('#ag-f-excluir');
    await ok(page);
    await expect(evento(page, 'Reunião remarcada')).toHaveCount(0);
    expect(await guardados(page)).toHaveLength(0);
});

test('Bloquear horario: Horario, Dia inteiro, Folga e Ferias com data fim', async ({ page }) => {
    await abrir(page, { sc_med: [], sc_ped: [] });
    const bloquear = async (tipo, ini, fim, h) => {
        await J(page).locator('[data-novo="bloqueio"]').click();
        await page.selectOption('#ag-f-bt', tipo);
        await page.fill('#ag-f-data', ini);
        if (tipo === 'horario') { await page.fill('#ag-f-hi', h[0]); await page.fill('#ag-f-hf', h[1]); }
        else if (fim) await page.fill('#ag-f-datafim', fim);
        await page.click('#ag-f-salvar');
        await expect(page.locator('.agd-modal')).toHaveCount(0);
    };
    // Os campos certos aparecem para cada tipo.
    await J(page).locator('[data-novo="bloqueio"]').click();
    await expect(page.locator('#ag-f-whoras')).toBeVisible();
    await expect(page.locator('#ag-f-wfim')).toBeHidden();
    await page.selectOption('#ag-f-bt', 'ferias');
    await expect(page.locator('#ag-f-whoras')).toBeHidden();
    await expect(page.locator('#ag-f-wfim')).toBeVisible();
    await page.click('#ag-f-cancelar');

    await bloquear('horario', dia(0), null, ['10:00', '11:00']);
    await bloquear('dia', dia(1), null);
    await bloquear('folga', dia(2), null);
    await bloquear('ferias', dia(3), dia(5));
    const s = await guardados(page);
    expect(s.map(e => e.bloqueio)).toEqual(['horario', 'dia', 'folga', 'ferias']);
    expect(s[3]).toMatchObject({ data_ini: dia(3), data_fim: dia(5), dia_inteiro: true });
    // Mes: um chip em cada dia bloqueado (1 + 1 + 1 + 3 dias de ferias = 6).
    await J(page).locator('[data-visao="mes"]').click();
    expect(await J(page).locator('.ag-chip.ag-ev-bloq').count()).toBe(6);
    // Dia das ferias (dia 3 a 5): o bloco cobre todo o expediente.
    await J(page).locator('[data-visao="dia"]').click();
    for (let i = 0; i < 3; i++) await J(page).locator('[data-nav="1"]').click();
    const bloco = J(page).locator('.ag-col .ag-ev-bloq');
    await expect(bloco).toHaveCount(1);
    await expect(bloco).toContainText('Férias');
    const alt = (await bloco.boundingBox()).height, col = (await J(page).locator('.ag-col').boundingBox()).height;
    expect(alt).toBeGreaterThan(col - 6);
});

test('conflito avisa com o que conflita e nao grava; bloqueio sobre medicao tambem', async ({ page }) => {
    await abrir(page);
    await J(page).locator('[data-novo="compromisso"]').click();
    await page.fill('#ag-f-data', HOJE);
    await page.fill('#ag-f-hi', '09:30');
    await page.fill('#ag-f-hf', '10:30');
    await page.fill('#ag-f-desc', 'Algo');
    await page.click('#ag-f-salvar');
    await expect(page.locator('#sc-modal-msg')).toContainText('já tem compromisso');
    await expect(page.locator('#sc-modal-msg')).toContainText('Carlos Souza');
    await ok(page);
    expect(await guardados(page)).toHaveLength(0);
    await page.click('#ag-f-cancelar');
    // Ferias cobrindo o dia da medicao.
    await J(page).locator('[data-novo="bloqueio"]').click();
    await page.selectOption('#ag-f-bt', 'ferias');
    await page.fill('#ag-f-data', HOJE);
    await page.fill('#ag-f-datafim', dia(2));
    await page.click('#ag-f-salvar');
    await expect(page.locator('#sc-modal-msg')).toContainText('Medição');
    await ok(page);
    expect(await guardados(page)).toHaveLength(0);
});

test('aba desatualizada: a gravacao relê sc_agd_ev e recusa o conflito', async ({ page, context }) => {
    await abrir(page, { sc_med: [], sc_ped: [] });
    await J(page).locator('[data-novo="compromisso"]').click();
    await page.fill('#ag-f-data', HOJE);
    await page.fill('#ag-f-hi', '10:00');
    await page.fill('#ag-f-hf', '11:00');
    await page.fill('#ag-f-desc', 'Da aba A');
    // A aba B grava um bloqueio no mesmo horario, sem a aba A recarregar.
    const b = await context.newPage();
    await b.goto(BASE + '/pcp.html');
    await b.evaluate(h => localStorage.setItem('sc_agd_ev', JSON.stringify([{ id: 'eB', prof: 'u:1', tipo: 'bloqueio', bloqueio: 'horario',
        data_ini: h, data_fim: h, hora_ini: '10:30', hora_fim: '11:30', dia_inteiro: false, descricao: 'Da aba B', criado_por: 1 }])), HOJE);
    await page.click('#ag-f-salvar');
    await expect(page.locator('#sc-modal-msg')).toContainText('já tem compromisso');
    await ok(page);
    const s = await guardados(page);
    expect(s.map(e => e.id)).toEqual(['eB']);   // a aba B nao foi sobrescrita
});

test('usuario comum na agenda de outro: sem criar, sem descricao em lugar nenhum', async ({ page }) => {
    const segredo = 'Dentista particular';
    await abrir(page, { sc_agd_ev: [EV(), EV({ id: 'e2', tipo: 'bloqueio', bloqueio: 'horario', hora_ini: '16:30', hora_fim: '17:30', descricao: 'Exame secreto' })] }, MARIA);
    await expect(J(page).locator('.ag-prof-sel')).toContainText('Maria Souza');
    await J(page).locator('.ag-prof', { hasText: 'Teste' }).click();
    await expect(J(page).locator('.ag-quem')).toContainText('somente leitura');
    await expect(J(page).locator('[data-novo]')).toHaveCount(0);
    await expect(evento(page, 'Compromisso')).toHaveCount(1);
    await expect(evento(page, 'Indisponível')).toHaveCount(1);
    const html = await J(page).evaluate(e => e.innerHTML);
    expect(html).not.toContain(segredo);
    expect(html).not.toContain('Exame secreto');
    // Clicar no evento pessoal e em horario vazio nao abre nada.
    await evento(page, 'Compromisso').click();
    await J(page).locator('.ag-slot').first().click();
    await expect(page.locator('.agd-modal')).toHaveCount(0);
    // Na agenda do proprio usuario a descricao aparece.
    await J(page).locator('.ag-prof', { hasText: 'Maria Souza' }).click();
    await expect(J(page).locator('[data-novo]')).toHaveCount(2);
});

test('Administrador cria na agenda de outro usuario e de profissional externo', async ({ page }) => {
    await abrir(page, { sc_ped: [] });
    await J(page).locator('.ag-prof', { hasText: 'Maria Souza' }).click();
    await J(page).locator('[data-novo="compromisso"]').click();
    await page.fill('#ag-f-data', HOJE);
    await page.fill('#ag-f-hi', '15:00');
    await page.fill('#ag-f-hf', '16:00');
    await page.fill('#ag-f-desc', 'Visita da Maria');
    await page.click('#ag-f-salvar');
    await expect(evento(page, 'Visita da Maria')).toBeVisible();   // Administrador ve a descricao
    await J(page).locator('.ag-prof', { hasText: 'Pedro Terceiro' }).click();
    await J(page).locator('[data-novo="bloqueio"]').click();
    await page.selectOption('#ag-f-bt', 'folga');
    await page.fill('#ag-f-data', dia(1));
    await page.click('#ag-f-salvar');
    await expect(page.locator('.agd-modal')).toHaveCount(0);
    expect((await guardados(page)).map(e => e.prof)).toEqual(['u:2', 'n:pedro terceiro']);
});

test('clicar num horario vazio oferece Novo compromisso / Bloquear horario ja preenchido', async ({ page }) => {
    await abrir(page, { sc_med: [], sc_ped: [] });
    await J(page).locator('.ag-slot[data-data="' + HOJE + '"][data-hora="10:00"]').click();
    await expect(page.locator('.agd-modal')).toContainText('Novo compromisso');
    await expect(page.locator('.agd-modal')).toContainText('Bloquear horário');
    await page.click('#ag-esc-bloq');
    await expect(page.locator('#ag-f-data')).toHaveValue(HOJE);
    await expect(page.locator('#ag-f-hi')).toHaveValue('10:00');
    await expect(page.locator('#ag-f-hf')).toHaveValue('11:00');
    await expect(page.locator('#ag-f-bt')).toHaveValue('horario');
});

test('horario fora do expediente fica cortado na grade e aparece como chip no mes', async ({ page }) => {
    await abrir(page, { sc_med: [], sc_ped: [], sc_agd_ev: [EV({ hora_ini: '17:00', hora_fim: '19:00', descricao: 'Tarde' })] });
    const ev = evento(page, 'Compromisso: Tarde');
    await expect(ev).toBeVisible();
    const col = await J(page).locator('.ag-col.ag-hoje').boundingBox();
    const b = await ev.boundingBox();
    expect(b.y + b.height).toBeLessThanOrEqual(col.y + col.height + 1);
    await J(page).locator('[data-visao="mes"]').click();
    await expect(J(page).locator('.ag-chip', { hasText: 'Compromisso: Tarde' })).toHaveCount(1);
});

test('mes: ate 3 itens por dia e +N', async ({ page }) => {
    const evs = ['08:00', '09:00', '10:00', '11:00', '12:00'].map((h, i) => EV({ id: 'm' + i, hora_ini: h, hora_fim: h.slice(0, 2) + ':30', descricao: 'Item ' + i }));
    await abrir(page, { sc_med: [], sc_ped: [], sc_agd_ev: evs });
    await J(page).locator('[data-visao="mes"]').click();
    await expect(J(page).locator('.ag-mes-cel.ag-hoje .ag-chip')).toHaveCount(3);
    await expect(J(page).locator('.ag-mes-cel.ag-hoje .ag-mais')).toHaveText('+2');
    await J(page).locator('.ag-mes-cel.ag-hoje .ag-mais').click();
    await expect(J(page).locator('.ag-vis-on')).toHaveText('Dia');
    await expect(J(page).locator('.ag-ev')).toHaveCount(5);
});

test('data da barra superior abre a Agenda em outra pagina; Esc e X fecham', async ({ page }) => {
    await fixarRelogio(page);
    await entrar(page, BASE, { sc_usr: USU(), sc_cli: CLI() });
    await page.goto(BASE + '/pcp.html');
    await page.click('#topbar-data');
    await expect(J(page)).toBeVisible();
    expect(page.url()).toContain('pcp.html');
    await page.keyboard.press('Escape');
    await expect(J(page)).toHaveCount(0);
    await page.click('#topbar-data');
    await expect(J(page)).toBeVisible();
    await J(page).locator('.ag-fechar').click();
    await expect(J(page)).toHaveCount(0);
});

test('gravacao noutra aba aparece na janela aberta sem recarregar', async ({ page, context }) => {
    await abrir(page, { sc_med: [], sc_ped: [] });
    await expect(J(page).locator('.ag-ev')).toHaveCount(0);
    const b = await context.newPage();
    await b.goto(BASE + '/estoque.html');   // qualquer pagina escreve no mesmo storage
    await b.evaluate(h => localStorage.setItem('sc_agd_ev', JSON.stringify([{ id: 'x1', prof: 'u:1', tipo: 'compromisso', bloqueio: '',
        data_ini: h, data_fim: h, hora_ini: '09:00', hora_fim: '10:00', dia_inteiro: false, descricao: 'Chegou da aba B', criado_por: 1 }])), HOJE);
    await expect(evento(page, 'Chegou da aba B')).toBeVisible();
    await b.evaluate(h => localStorage.setItem('sc_med', JSON.stringify([{ id: 9, clienteNome: 'Medição nova', endereco: 'Z', data: h, hora: '14:00', duracao: 60, status: 'Agendado', usuario_id: 1 }])), HOJE);
    await expect(evento(page, 'Medição nova')).toBeVisible();
    await b.evaluate(() => localStorage.setItem('sc_med', '[]'));
    await expect(evento(page, 'Medição nova')).toHaveCount(0);
});

test('360px: janela utilizavel, sem rolagem horizontal da pagina', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await abrir(page);
    const j = await J(page).locator('.ag-janela').boundingBox();
    expect(j.width).toBeLessThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await expect(J(page).locator('[data-novo="compromisso"]')).toBeVisible();
    await expect(J(page).locator('.ag-fechar')).toBeVisible();
    await expect(J(page).locator('.ag-prof').first()).toBeVisible();
    await J(page).locator('[data-visao="dia"]').click();
    await expect(evento(page, 'Carlos Souza')).toBeVisible();
    await J(page).locator('[data-novo="compromisso"]').click();
    await expect(page.locator('#ag-f-salvar')).toBeVisible();
});

test('evento marcado como pendente (aguardando aceite) aparece tracejado', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => {
        const orig = _agdCompromissos;
        window._agdCompromissos = () => orig().map(c => c.tipo === 'med' && c.id === 1 ? { ...c, pendente: true } : c);
        _agendaRedesenhar();
    });
    const med = evento(page, 'Carlos Souza');
    await expect(med).toHaveClass(/ag-pend/);
    expect(await med.evaluate(e => getComputedStyle(e).borderLeftStyle)).toBe('dashed');
    await expect(med).toContainText('Aguardando aceite');
});

test('item fora do expediente: marca na coluna do dia e lista no Dia', async ({ page }) => {
    await abrir(page, { sc_med: [], sc_ped: [], sc_agd_ev: [EV({ hora_ini: '19:00', hora_fim: '20:00', descricao: 'Noite' })] });
    await expect(J(page).locator('.ag-col .ag-ev')).toHaveCount(0);
    const marca = J(page).locator('.ag-fora-h');
    await expect(marca).toHaveText('+1 fora do horário');
    await marca.click();
    await expect(J(page).locator('.ag-vis-on')).toHaveText('Dia');
    await expect(J(page).locator('.ag-fora-lista .ag-chip')).toContainText('Compromisso: Noite');
    await J(page).locator('.ag-fora-lista .ag-chip').click();
    await expect(page.locator('.agd-modal')).toContainText('Editar compromisso');
});

test('excluir um item ja excluido em outra aba avisa em vez de dizer que excluiu', async ({ page }) => {
    await abrir(page, { sc_med: [], sc_ped: [], sc_agd_ev: [EV()] });
    await evento(page, 'Dentista').click();
    await page.evaluate(() => localStorage.setItem('sc_agd_ev', '[]'));
    await page.click('#ag-f-excluir');
    await ok(page);   // confirmacao
    await expect(page.locator('#sc-modal-msg')).toContainText('não existe mais');
    await ok(page);
    await expect(page.locator('.sc-toast', { hasText: 'Item excluído' })).toHaveCount(0);
});
