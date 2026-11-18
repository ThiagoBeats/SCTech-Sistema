// Aceite de medicao/instalacao: agendar para OUTRO usuario deixa o agendamento
// aguardando aceite (reserva o horario). O destinado aceita ou recusa (com motivo)
// pelo sino e pelos Alertas; quem destinou recebe a resposta.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}
const DIA = dia(3);
const DM = DIA.slice(8) + '/' + DIA.slice(5, 7);

const USUARIOS = () => [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Maria', email: 'maria@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
];
const CLI = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Av. das Palmeiras, 1000' }];
const pronto = () => ({ id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: false, valor: 900, amb: 'Sala' });

const lerMeds = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_med')) || []);
const lerPed = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')).find(p => p.id === 26500));

async function abrir(page, view, dados) {
    await entrar(page, BASE, { sc_usr: USUARIOS(), sc_cli: CLI(), ...(dados || {}) });
    await page.goto(BASE + '/pcp.html?view=' + view);
}
// Troca de usuario na mesma aba (os dados ficam no mesmo localStorage).
async function como(page, uid, pagina) {
    await page.evaluate(uid => {
        const u = JSON.parse(localStorage.getItem('sc_usr')).find(x => x.id === uid);
        sessionStorage.setItem('sc_user', JSON.stringify({ id: u.id, email: u.email }));
    }, uid);
    await page.goto(BASE + '/' + (pagina || 'index.html'));
    await page.waitForLoadState('load');
}
async function abrirSino(page) {
    await page.click('#sino-btn');
    await expect(page.locator('#sino-painel')).toBeVisible();
}
const itemSino = (page, texto) => page.locator('#sino-painel .sino-item', { hasText: texto });

async function agendarMedicaoPara(page, prof, hora) {
    await page.selectOption('#med-cliente-id', '1');
    await page.selectOption('#med-prof', prof);
    await page.fill('#med-data', DIA);
    await page.fill('#med-hora', hora);
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-pend-lista')).toContainText('Ana Paula Lima');
}
async function agendarInstalacaoPara(page, prof, hora) {
    await page.click('#inst-prontos-lista .agd-pronto');
    await page.selectOption('#inst-prof', prof);
    await page.fill('#inst-data', DIA);
    await page.fill('#inst-hora', hora);
    await page.click('#inst-btn-agendar');
    await expect(page.locator('#inst-pend-lista')).toContainText('Ana Paula Lima');
}

test('medicao para Maria: aguarda aceite, reserva o horario, Maria ve no sino e nos Alertas', async ({ page }) => {
    await abrir(page, 'medicoes');
    await agendarMedicaoPara(page, 'u:2', '10:00');
    const [m] = await lerMeds(page);
    expect(m.aceite.status).toBe('pendente');
    expect(m.aceite.por).toBe(1);
    await expect(page.locator('#med-pend-lista')).toContainText('Aguardando aceite');
    // pendente reserva o horario de Maria
    const c = await page.evaluate(d => _agdDoDia('u:2', d, null).map(x => [x.tipo, x.ini, x.pendente]), DIA);
    expect(c).toEqual([['med', 600, true]]);
    // quem destinou nao recebe o pedido de aceite
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#sino-btn')).toBeVisible();
    await expect(page.locator('#sino-badge')).toHaveCount(0);

    await como(page, 2);
    await expect(page.locator('#sino-badge')).toHaveText('1');
    await abrirSino(page);
    const it = itemSino(page, `Você recebeu a medição de Ana Paula Lima em ${DM} às 10:00.`);
    await expect(it).toBeVisible();
    await expect(it.getByRole('button', { name: 'Aceitar' })).toBeVisible();
    await expect(it.getByRole('button', { name: 'Recusar' })).toBeVisible();
    await expect(page.locator('#dashboard-alertas')).toContainText(`Você recebeu a medição de Ana Paula Lima em ${DM} às 10:00.`);
    await expect(page.locator('#dashboard-alertas').getByRole('button', { name: 'Aceitar' })).toBeVisible();
});

test('Maria aceita a medicao: Admin ve "Maria aceitou..."', async ({ page }) => {
    await abrir(page, 'medicoes');
    await agendarMedicaoPara(page, 'u:2', '10:00');
    await como(page, 2);
    await abrirSino(page);
    await itemSino(page, 'Você recebeu a medição').getByRole('button', { name: 'Aceitar' }).click();
    await expect.poll(async () => (await lerMeds(page))[0].aceite.status).toBe('aceito');
    await expect(itemSino(page, 'Você recebeu a medição')).toHaveCount(0);

    await como(page, 1);
    await abrirSino(page);
    await expect(itemSino(page, `Maria aceitou a medição de Ana Paula Lima (${DM} 10:00).`)).toBeVisible();
    // ja respondida: nada mais para Maria responder, e o horario segue reservado (agora firme)
    const c = await page.evaluate(d => _agdDoDia('u:2', d, null).map(x => !!x.pendente), DIA);
    expect(c).toEqual([false]);
});

test('Maria recusa a medicao: motivo obrigatorio, vira "A reagendar", libera o horario e o Admin reagenda', async ({ page }) => {
    await abrir(page, 'medicoes');
    await agendarMedicaoPara(page, 'u:2', '10:00');
    await como(page, 2);
    await abrirSino(page);
    await itemSino(page, 'Você recebeu a medição').getByRole('button', { name: 'Recusar' }).click();
    const ok = page.locator('#aceite-confirmar');
    await expect(ok).toBeDisabled();
    await page.fill('#aceite-motivo', '   ');
    await expect(ok, 'so espacos nao vale').toBeDisabled();
    await ok.click({ force: true });
    expect((await lerMeds(page))[0].status, 'sem motivo nao recusa').toBe('Agendado');
    await page.fill('#aceite-motivo', 'Estou de folga nesse dia');
    await expect(ok).toBeEnabled();
    await ok.click();

    await expect.poll(async () => (await lerMeds(page))[0].status).toBe('A reagendar');
    const m = (await lerMeds(page))[0];
    expect(m.recusa).toMatchObject({ por: 2, para: 1, motivo: 'Estou de folga nesse dia' });
    expect(m.usuario_id).toBeFalsy();
    expect(m.data).toBe('');
    expect(m.hora).toBe('');
    expect(m.clienteNome).toBe('Ana Paula Lima');
    expect(m.endereco).toContain('Palmeiras');
    expect(m.aceite).toBeUndefined();
    expect(await page.evaluate(d => _agdDoDia('u:2', d, null).length, DIA), 'horario liberado').toBe(0);

    await como(page, 1);
    await abrirSino(page);
    const it = itemSino(page, 'Maria recusou a medição de Ana Paula Lima: Estou de folga nesse dia');
    await expect(it).toBeVisible();
    await it.getByRole('button', { name: 'Reagendar' }).click();
    await expect(page).toHaveURL(/pcp\.html/);
    await expect(page.locator('.agd-modal', { hasText: 'Editar agendamento' })).toBeVisible();
    await expect(page.locator('#agdf-end-rua')).toHaveValue(/Palmeiras/);

    // a lista mostra a medicao como "A reagendar" e ela nao conta como atrasada
    await page.keyboard.press('Escape');
    await expect(page.locator('#med-pend-lista')).toContainText('A reagendar');
    expect(await page.evaluate(() => _agdCompromissos().length)).toBe(0);
});

test('reagendar a medicao recusada volta para Agendado e pede novo aceite', async ({ page }) => {
    await abrir(page, 'medicoes');
    await agendarMedicaoPara(page, 'u:2', '10:00');
    await como(page, 2);
    await abrirSino(page);
    await itemSino(page, 'Você recebeu a medição').getByRole('button', { name: 'Recusar' }).click();
    await page.fill('#aceite-motivo', 'Sem agenda');
    await page.click('#aceite-confirmar');
    await expect.poll(async () => (await lerMeds(page))[0].status).toBe('A reagendar');
    await como(page, 1, 'pcp.html?view=medicoes');
    await page.evaluate(id => editarMedicao(id), (await lerMeds(page))[0].id);
    await page.selectOption('#agdf-usu', 'u:2');
    await page.fill('#agdf-data', DIA);
    await page.fill('#agdf-hora', '14:00');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerMeds(page))[0].status).toBe('Agendado');
    const m = (await lerMeds(page))[0];
    expect(m.recusa).toBeUndefined();
    expect(m.aceite).toMatchObject({ status: 'pendente', por: 1 });
    expect(m.hora).toBe('14:00');
});

test('instalacao para Maria: aceitar avisa o Admin', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await agendarInstalacaoPara(page, 'u:2', '09:00');
    expect((await lerPed(page)).inst_aceite).toMatchObject({ status: 'pendente', por: 1 });
    await expect(page.locator('#inst-pend-lista')).toContainText('Aguardando aceite');
    expect(await page.evaluate(d => _agdDoDia('u:2', d, null).map(x => [x.tipo, x.pendente]), DIA)).toEqual([['inst', true]]);

    await como(page, 2);
    await abrirSino(page);
    const txt = `Você recebeu a instalação do pedido #26500 (Ana Paula Lima) em ${DM} às 09:00.`;
    await expect(itemSino(page, txt)).toBeVisible();
    await itemSino(page, txt).getByRole('button', { name: 'Aceitar' }).click();
    await expect.poll(async () => (await lerPed(page)).inst_aceite.status).toBe('aceito');

    await como(page, 1);
    await abrirSino(page);
    await expect(itemSino(page, `Maria aceitou a instalação do pedido #26500 (${DM} 09:00).`)).toBeVisible();
});

test('instalacao para Maria: recusar volta para "sem agendamento" e o Admin reagenda', async ({ page }) => {
    await abrir(page, 'agenda', { sc_ped: [pronto()] });
    await agendarInstalacaoPara(page, 'u:2', '09:00');
    await como(page, 2);
    await abrirSino(page);
    await itemSino(page, 'Você recebeu a instalação').getByRole('button', { name: 'Recusar' }).click();
    await expect(page.locator('#aceite-confirmar')).toBeDisabled();
    await page.fill('#aceite-motivo', 'Sem carro');
    await page.click('#aceite-confirmar');
    await expect.poll(async () => (await lerPed(page)).inst_agendado).toBe(false);
    const p = await lerPed(page);
    expect(p.inst_recusa).toMatchObject({ por: 2, para: 1, motivo: 'Sem carro' });
    expect(p.inst_hora).toBe('');
    expect(p.data_entrega).toBeNull();
    expect(p.usuario_instalacao_id).toBeNull();
    expect(p.inst_endereco).toContain('Palmeiras');
    expect(p.inst_aceite).toBeUndefined();
    expect(await page.evaluate(d => _agdDoDia('u:2', d, null).length, DIA)).toBe(0);

    await como(page, 1);
    await abrirSino(page);
    const it = itemSino(page, 'Maria recusou a instalação do pedido #26500: Sem carro');
    await expect(it).toBeVisible();
    await it.getByRole('button', { name: 'Reagendar' }).click();
    await expect(page).toHaveURL(/pcp\.html/);
    await expect(page.locator('#inst-pedido')).toHaveValue('26500');
    await expect(page.locator('#inst-rua')).toHaveValue(/Palmeiras/);
    await expect(page.locator('#inst-prontos-lista')).toContainText('A reagendar');
});

test('agendar para si mesmo ou para profissional externo nao pede aceite', async ({ page }) => {
    await abrir(page, 'medicoes');
    await agendarMedicaoPara(page, 'u:1', '10:00');
    await page.selectOption('#med-prof', '__outro');
    await page.fill('#med-prof-outro', 'Zé Terceirizado');
    await page.fill('#med-data', DIA);
    await page.fill('#med-hora', '11:00');
    await page.selectOption('#med-cliente-id', '1');
    await page.click('button:has-text("Agendar Visita")');
    await expect.poll(async () => (await lerMeds(page)).length).toBe(2);
    const ms = await lerMeds(page);
    expect(ms.every(m => m.aceite === undefined)).toBe(true);
    await como(page, 2);
    await expect(page.locator('#sino-badge')).toHaveCount(0);
});

test('Maria reagendando a propria medicao nao pede aceite; mudar o horario de outro usuario pede de novo', async ({ page }) => {
    const med = { id: 777, clienteId: 1, clienteNome: 'Ana Paula Lima', endereco: 'Av. das Palmeiras, 1000', rua: 'Av. das Palmeiras', numero: '1000',
        data: DIA, hora: '10:00', duracao: 60, status: 'Agendado', usuario_id: 2, aceite: { status: 'aceito', por: 1, em: 1, resp_em: 2 } };
    await abrir(page, 'medicoes', { sc_med: [med] });
    // Admin muda so a observacao: continua aceita
    await page.evaluate(() => editarMedicao(777));
    await page.fill('#agdf-obs', 'Levar trena');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerMeds(page))[0].obs).toBe('Levar trena');
    expect((await lerMeds(page))[0].aceite.status).toBe('aceito');
    // Admin muda o horario: volta a aguardar aceite
    await page.evaluate(() => reagendarMedicao(777));
    await page.fill('#agdf-hora', '15:00');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerMeds(page))[0].hora).toBe('15:00');
    expect((await lerMeds(page))[0].aceite).toMatchObject({ status: 'pendente', por: 1 });
    // Maria mexe na propria: sem aceite
    await como(page, 2, 'pcp.html?view=medicoes');
    await page.evaluate(() => reagendarMedicao(777));
    await page.fill('#agdf-hora', '16:00');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerMeds(page))[0].hora).toBe('16:00');
    expect((await lerMeds(page))[0].aceite).toBeUndefined();
});
