// Campo Horario do agendamento de medicao e de instalacao: ao focar abre uma
// lista dos horarios do expediente; os ja comprometidos do responsavel
// (medicoes + instalacoes) aparecem riscados e nao dao para escolher.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}

const CLI = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Av. das Palmeiras, 1000' }];
const MAT = () => [{ id: 1, nome: 'Trilho', unidade: 'un', estoque_atual: 10 }];

// Medicao 09:00-10:00 e instalacao 14:00-16:00 do usuario 1 em dia(3).
const PED = () => [{ id: 26200, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: true,
    valor: 900, amb: 'Cortina Sala', data_entrega: dia(3), inst_hora: '14:00', inst_duracao: 120, usuario_instalacao_id: 1 }];
const MED = () => [{ id: 1, clienteNome: 'Carlos Souza', endereco: 'X', data: dia(3), hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1 }];

async function abrir(page, view) {
    await entrar(page, BASE, { sc_cli: CLI(), sc_mat: MAT(), sc_ped: PED(), sc_med: MED() });
    await page.goto(BASE + '/pcp.html?view=' + view);
}

const item = (page, hora) => page.locator('.agd-hpick .agd-hpick-item', { hasText: new RegExp('^' + hora + '$') });
const riscado = async loc => (await loc.evaluate(e => getComputedStyle(e).textDecorationLine)).includes('line-through');

async function conferir(page, campo) {
    await page.click(campo);
    await expect(page.locator('.agd-hpick')).toBeVisible();
    for (const h of ['09:00', '14:00', '15:00']) {
        expect(await riscado(item(page, h)), h + ' riscado').toBe(true);
        await expect(item(page, h)).toHaveAttribute('aria-disabled', 'true');
        await item(page, h).click({ force: true });
        await expect(page.locator(campo), 'nao escolhe ' + h).toHaveValue('');
        await expect(page.locator('.agd-hpick')).toBeVisible();
    }
    expect(await riscado(item(page, '10:00')), '10:00 livre').toBe(false);
    await item(page, '10:00').click();
    await expect(page.locator(campo)).toHaveValue('10:00');
    await expect(page.locator('.agd-hpick')).toHaveCount(0);
}

test('medicao: o campo Horario lista os horarios e risca os comprometidos', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', dia(3));
    await conferir(page, '#med-hora');
});

test('instalacao: o campo Horario lista os horarios e risca os comprometidos', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI(), sc_mat: MAT(), sc_med: MED(), sc_ped: [
        { id: 26300, clienteId: 1, clienteNome: 'Bia Souza', status: 'Pronto p/ Instalação', inst_agendado: false, valor: 100, amb: 'Sala' }, ...PED()] });
    await page.goto(BASE + '/pcp.html?view=agenda');
    await page.locator('#inst-prontos-lista .agd-pronto', { hasText: '#26300' }).click();
    await page.selectOption('#inst-prof', 'u:1');
    await page.fill('#inst-data', dia(3));
    await conferir(page, '#inst-hora');
});

test('sem responsavel todos os horarios futuros ficam livres; o campo continua digitavel', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.fill('#med-data', dia(3));
    await page.click('#med-hora');
    expect(await riscado(item(page, '09:00'))).toBe(false);
    expect(await riscado(item(page, '14:00'))).toBe(false);
    await page.selectOption('#med-prof', 'u:1');
    await page.click('#med-hora');
    expect(await riscado(item(page, '09:00')), 'reflete o responsavel').toBe(true);
    await page.fill('#med-hora', '10:30');
    await expect(page.locator('#med-hora')).toHaveValue('10:30');
    await page.keyboard.press('Escape');
    await expect(page.locator('.agd-hpick')).toHaveCount(0);
});

test('a duracao muda a lista: 2h antes das 14:00 nao cabe', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', dia(3));
    await page.selectOption('#med-dur', '120');
    await page.click('#med-hora');
    expect(await riscado(item(page, '12:00')), '12-14 cabe').toBe(false);
    expect(await riscado(item(page, '13:00')), '13-15 esbarra na instalacao').toBe(true);
});

test('reagendar instalacao mostra a lista', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.click('.agd-modal button:has-text("Reagendar")');
    await page.click('#agdf-hora');
    expect(await riscado(item(page, '09:00')), 'medicao do dia riscada').toBe(true);
    expect(await riscado(item(page, '14:00')), 'o proprio horario nao conta').toBe(false);
    await item(page, '10:00').click();
    await expect(page.locator('#agdf-hora')).toHaveValue('10:00');
});

test('editar instalacao mostra a lista', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.click('.agd-modal button:has-text("Editar")');
    await page.click('#agdf-hora');
    expect(await riscado(item(page, '09:00'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.agd-hpick')).toHaveCount(0);
    await expect(page.locator('.agd-modal'), 'Esc fecha so a lista').toBeVisible();
});

test('reagendar medicao mostra a lista e aceita horario quebrado', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Carlos Souza' }).click();
    await page.click('.agd-modal button:has-text("Reagendar")');
    await page.click('#agdf-hora');
    expect(await riscado(item(page, '14:00')), 'instalacao do dia riscada').toBe(true);
    expect(await riscado(item(page, '09:00')), 'o proprio horario nao conta').toBe(false);
    await page.fill('#agdf-hora', '10:30');
    await expect(page.locator('#agdf-hora')).toHaveValue('10:30');
});
