// Lembretes de compromisso: sino, Alertas e aviso na tela, com relogio controlado.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const DIA = '2026-11-18';
const USU = () => [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Maria Souza', email: 'maria@sctech.local', papel_id: 6, ativo: true, permissoes_extras: {}, senha_hash: '' },
];
const EV = () => [{ id: 'e1', prof: 'u:1', tipo: 'compromisso', bloqueio: '', data_ini: DIA, data_fim: DIA, hora_ini: '15:00', hora_fim: '16:00',
    dia_inteiro: false, descricao: 'Dentista particular', aviso_min: 30, criado_por: 1 }];
const badge = page => page.locator('#topbar-sino .sino-badge');

async function abrir(page, hora, pagina) {
    await page.clock.install({ time: new Date(2026, 10, 18, ...hora) });
    await entrar(page, BASE, { sc_usr: USU(), sc_agd_ev: EV() });
    await page.goto(BASE + '/' + (pagina || 'index.html'));
}

test('as 14:29 nada; as 14:30 o sino conta, o Alerta aparece e o aviso na tela sai uma vez', async ({ page }) => {
    await abrir(page, [14, 0]);
    await expect(badge(page)).toHaveCount(0);
    await page.clock.runFor(29 * 60000);
    await expect(badge(page)).toHaveCount(0);
    await expect(page.locator('.sc-toast')).toHaveCount(0);
    await page.clock.runFor(60000);
    await expect(badge(page)).toHaveText('1');
    await page.hover('#sino-btn');
    await expect(page.locator('#sino-painel')).toContainText('Compromisso às 15:00:');
    await expect(page.locator('#sino-painel')).toContainText('Dentista particular');
    await expect(page.locator('#dashboard-alertas')).toContainText('Compromisso às 15:00:');
    await expect(page.locator('.sc-toast')).toHaveCount(1);
    await expect(page.locator('.sc-toast')).toContainText('Dentista particular');
    // recarregar dentro da janela nao repete o aviso
    await page.reload();
    await page.clock.runFor(120000);
    await expect(page.locator('.sc-toast')).toHaveCount(0);
    await expect(page.locator('#dashboard-alertas')).toContainText('Dentista particular');
});

test('depois das 16:00 sai da lista', async ({ page }) => {
    await abrir(page, [15, 30]);
    await expect(badge(page)).toHaveText('1');
    await page.clock.runFor(31 * 60000);
    await expect(badge(page)).toHaveCount(0);
    await expect(page.locator('#dashboard-alertas')).not.toContainText('Dentista particular');
});

test('outro usuario nao recebe o lembrete', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 10, 18, 14, 40) });
    await entrar(page, BASE, { sc_usr: USU(), sc_agd_ev: EV() });
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'maria@sctech.local' })));
    await page.goto(BASE + '/index.html');
    await page.clock.runFor(60000);
    await expect(badge(page)).toHaveCount(0);
    await expect(page.locator('.sc-toast')).toHaveCount(0);
});

test('o lembrete tambem vale em outras paginas, e o botao abre a agenda no dia', async ({ page }) => {
    await abrir(page, [14, 40], 'estoque.html');
    await expect(badge(page)).toHaveText('1');
    await page.hover('#sino-btn');
    await page.locator('#sino-painel .sino-acao').click();
    await expect(page.locator('#agenda-janela')).toBeVisible();
    await expect(page.locator('#agenda-janela .ag-vis-on')).toHaveText('Dia');
    await expect(page.locator('#agenda-janela .ag-ev', { hasText: 'Dentista particular' })).toBeVisible();
});

test('desligar "Lembretes de compromisso" tira o lembrete', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 10, 18, 14, 40) });
    await entrar(page, BASE, { sc_usr: USU(), sc_agd_ev: EV(), sc_alertas_cfg: { compromisso: false } });
    await page.goto(BASE + '/index.html');
    await page.clock.runFor(60000);
    await expect(badge(page)).toHaveCount(0);
});
