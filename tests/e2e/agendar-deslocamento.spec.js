// Aviso de deslocamento ao agendar medicao: depois da conferencia de sobreposicao
// (que continua bloqueando), confere o tempo de carro ate a visita anterior e a
// proxima do profissional no dia. Nao da tempo: avisa e deixa escolher.
// Sem rede / sem localizar: salva e so' diz que nao deu para conferir. Rede simulada.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const DIA = '2026-11-25';
const GEO = { 'rua a, 1': [-25.41, -49.21], 'rua b, 2': [-25.42, -49.22] };

async function simularRede(page, est) {
    await page.route('**/nominatim.openstreetmap.org/**', route => {
        const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || '').toLowerCase();
        const g = GEO[q];
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(g ? [{ lat: String(g[0]), lon: String(g[1]) }] : []) });
    });
    await page.route('**/router.project-osrm.org/route/**', route => {
        if (est.fora) return route.fulfill({ status: 500, body: 'erro' });
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ legs: [{ distance: 9000, duration: est.min * 60 }] }] }) });
    });
}

const CLI = () => [
    { id: 1, nome: 'Maria Silva', tel: '', end: 'Rua A, 1' },
    { id: 2, nome: 'Pedro Souza', tel: '', end: 'Rua B, 2' },
];
const MED = () => [{ id: 1, clienteId: 1, clienteNome: 'Maria Silva', clienteTel: '', endereco: 'Rua A, 1', data: DIA, hora: '13:00', duracao: 60, status: 'Agendado', usuario_id: 1, obs: '' }];
const lerMeds = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_med')) || []);

async function abrir(page, est) {
    await page.clock.setFixedTime(new Date(2026, 10, 23, 12, 0, 0));
    await simularRede(page, est);
    await entrar(page, BASE, { sc_cli: CLI(), sc_med: MED() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.click('#tab-btn-medicoes');
}
async function preencher(page, hora) {
    await page.selectOption('#med-cliente-id', '2');
    await page.fill('#med-data', DIA);
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-hora', hora);
}
const agendar = page => page.click('button:has-text("Agendar Visita")');

test('nao da tempo depois da anterior: janela com o texto; Escolher outro horario nao salva e Agendar mesmo assim salva', async ({ page }) => {
    await abrir(page, { min: 25 });
    await preencher(page, '14:15');
    await agendar(page);
    const msg = page.locator('#sc-modal-msg');
    await expect(msg).toHaveText('Não dá tempo de chegar: Medição — Maria Silva termina 14:00 e o deslocamento até aqui leva ~25 min (chegada 14:25, folga de 10 min).', { timeout: 15000 });
    await expect(page.locator('#sc-modal-btns button')).toHaveText(['Escolher outro horário', 'Agendar mesmo assim']);
    await page.click('#sc-modal-cancel');
    expect(await lerMeds(page)).toHaveLength(1);
    await expect(page.locator('#med-hora')).toHaveValue('14:15');   // formulario continua
    await agendar(page);
    await expect(msg).toContainText('Não dá tempo de chegar', { timeout: 15000 });
    await page.click('#sc-modal-ok');
    await expect.poll(async () => (await lerMeds(page)).length).toBe(2);
    await expect(page.locator('.sc-toast', { hasText: 'Visita agendada!' })).not.toContainText('Não deu para conferir');
});

test('deslocamento curto (5 min): salva sem janela', async ({ page }) => {
    await abrir(page, { min: 5 });
    await preencher(page, '14:15');
    await agendar(page);
    await expect.poll(async () => (await lerMeds(page)).length, { timeout: 15000 }).toBe(2);
    await expect(page.locator('#sc-modal-msg')).toBeHidden();
});

test('a nova visita atrasaria a proxima: janela sobre a proxima', async ({ page }) => {
    await abrir(page, { min: 25 });
    await preencher(page, '12:00');
    await agendar(page);
    await expect(page.locator('#sc-modal-msg')).toHaveText('Não dá tempo de chegar: esta visita termina 13:00 e o deslocamento até Medição — Maria Silva leva ~25 min (chegada 13:25, folga de 10 min).', { timeout: 15000 });
    await page.click('#sc-modal-ok');
    await expect.poll(async () => (await lerMeds(page)).length).toBe(2);
});

test('OSRM fora do ar: salva e o aviso de sucesso diz que nao deu para conferir', async ({ page }) => {
    await abrir(page, { min: 25, fora: true });
    await preencher(page, '14:15');
    await agendar(page);
    await expect.poll(async () => (await lerMeds(page)).length, { timeout: 15000 }).toBe(2);
    await expect(page.locator('#sc-modal-msg')).toBeHidden();
    await expect(page.locator('.sc-toast', { hasText: 'Visita agendada!' })).toContainText('Não deu para conferir o deslocamento.');
});

test('sobreposicao continua bloqueando como antes', async ({ page }) => {
    await abrir(page, { min: 25 });
    await preencher(page, '13:30');
    await agendar(page);
    await expect(page.locator('#sc-modal-msg')).toContainText('já tem compromisso nesse período');
    await expect(page.locator('#sc-modal-btns button')).toHaveCount(1);
    expect(await lerMeds(page)).toHaveLength(1);
});
