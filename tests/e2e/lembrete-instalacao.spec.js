// Lembrete de confirmar a instalacao: depois do fim de uma instalacao agendada
// (data + horario + duracao) que ninguem confirmou, o instalador designado e
// quem criou o pedido veem, ao abrir o sistema, uma janela perguntando se foi
// instalado -- uma vez por dia por pessoa. Na Pagina Inicial fica um aviso
// fixo enquanto houver instalacao para confirmar.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const USUARIOS = () => [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Carlos Instalador', email: 'carlos@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 3, nome: 'Vera Vendas', email: 'vera@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
];
const CLI = () => [
    { id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Av. das Palmeiras, 1000' },
    { id: 2, nome: 'Bruno Souza', tel: '44990000000', end: 'Rua B, 20' },
];

// Instalacao em 10/11/2026, das 09:00 as 11:00, instalador Carlos (2), pedido criado pela Vera (3).
const agendada = extra => ({
    id: 26300, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', valor: 900, amb: 'Sala',
    inst_agendado: true, data_entrega: '2026-11-10', inst_hora: '09:00', inst_duracao: 120,
    usuario_instalacao_id: 2, criado_por: 3, ...(extra || {}),
});

const lembrete = page => page.locator('.lembrete-inst-modal');
const lerPed = (page, id) => page.evaluate(id => JSON.parse(localStorage.getItem('sc_ped')).find(p => p.id === id), id);

// Hora local fixa (o relogio do navegador continua andando nos timers).
async function relogio(page, quando) { await page.clock.setFixedTime(new Date(quando)); }

async function entrarComo(page, uid, peds, pagina) {
    await entrar(page, BASE, { sc_usr: USUARIOS(), sc_cli: CLI(), sc_ped: peds });
    await page.evaluate(uid => {
        const u = JSON.parse(localStorage.getItem('sc_usr')).find(x => x.id === uid);
        sessionStorage.setItem('sc_user', JSON.stringify({ id: u.id, email: u.email }));
        Object.keys(localStorage).filter(k => k.startsWith('sc_lembrete_inst_')).forEach(k => localStorage.removeItem(k));
    }, uid);
    await page.goto(BASE + '/' + (pagina || 'index.html'));
    await page.waitForLoadState('load');
}

test('instalador ve a janela depois do fim da instalacao, nao antes', async ({ page }) => {
    await relogio(page, '2026-11-10T10:59:00');
    await entrarComo(page, 2, [agendada()]);
    await page.waitForTimeout(400);
    await expect(lembrete(page), 'ainda dentro do horario').toHaveCount(0);

    await relogio(page, '2026-11-10T11:01:00');
    await page.reload();
    await expect(lembrete(page)).toBeVisible();
    await expect(lembrete(page)).toContainText('O pedido #26300 (Ana Paula Lima) devia ter sido instalado em 10/11 às 09:00. Foi instalado?');
    await expect(lembrete(page).getByRole('button', { name: 'Sim, foi instalado' })).toBeVisible();
    await expect(lembrete(page).getByRole('button', { name: 'Ainda não' })).toBeVisible();
});

test('quem criou o pedido ve a janela; outro usuario nao', async ({ page }) => {
    await relogio(page, '2026-11-11T08:00:00');
    await entrarComo(page, 3, [agendada({ usuario_instalacao_id: null, instalador_nome: 'Terceirizado Zé' })], 'pedidos.html');
    await expect(lembrete(page)).toBeVisible();
    await expect(lembrete(page)).toContainText('O pedido #26300 (Ana Paula Lima)');

    await entrarComo(page, 1, [agendada()]);
    await page.waitForTimeout(400);
    await expect(lembrete(page)).toHaveCount(0);
    await expect(page.locator('#aviso-inst-confirmar')).toBeHidden();
});

test('sem horario vale o fim do expediente', async ({ page }) => {
    await relogio(page, '2026-11-10T17:59:00');
    await entrarComo(page, 2, [agendada({ inst_hora: '' })]);
    await page.waitForTimeout(400);
    await expect(lembrete(page)).toHaveCount(0);
    await relogio(page, '2026-11-10T18:01:00');
    await page.reload();
    await expect(lembrete(page)).toContainText('O pedido #26300 (Ana Paula Lima) devia ter sido instalado em 10/11. Foi instalado?');
});

test('uma vez por dia: recarregar nao mostra de novo; no dia seguinte volta', async ({ page }) => {
    await relogio(page, '2026-11-11T08:00:00');
    await entrarComo(page, 2, [agendada()]);
    await expect(lembrete(page)).toBeVisible();
    await page.reload();
    await page.waitForTimeout(400);
    await expect(lembrete(page), 'ja visto hoje').toHaveCount(0);
    await page.goto(BASE + '/clientes.html');
    await page.waitForTimeout(400);
    await expect(lembrete(page)).toHaveCount(0);

    await relogio(page, '2026-11-12T08:00:00');
    await page.reload();
    await expect(lembrete(page), 'dia seguinte').toBeVisible();
});

test('"Sim, foi instalado" segue o fluxo de confirmar e o lembrete para', async ({ page }) => {
    await relogio(page, '2026-11-11T08:00:00');
    await entrarComo(page, 2, [agendada()]);
    await lembrete(page).getByRole('button', { name: 'Sim, foi instalado' }).click();
    await expect(page.locator('#mpg-sim')).toBeVisible();   // pergunta do pagamento, como hoje
    await page.click('#mpg-sim');
    await expect.poll(async () => (await lerPed(page, 26300)).status).toBe('Aguardando Financeiro');
    const p = await lerPed(page, 26300);
    expect(p.inst_confirmada_em).toBeTruthy();
    expect(p.pagamento_pendente).toBe(false);
    await expect(lembrete(page)).toHaveCount(0);
    await expect(page.locator('#aviso-inst-confirmar')).toBeHidden();

    await relogio(page, '2026-11-12T08:00:00');
    await page.reload();
    await page.waitForTimeout(400);
    await expect(lembrete(page)).toHaveCount(0);
});

test('"Ainda não" oferece Reagendar, que abre o reagendamento na agenda', async ({ page }) => {
    await relogio(page, '2026-11-11T08:00:00');
    await entrarComo(page, 2, [agendada()]);
    await lembrete(page).getByRole('button', { name: 'Ainda não' }).click();
    await expect(lembrete(page).getByRole('button', { name: 'Lembrar amanhã' })).toBeVisible();
    await lembrete(page).getByRole('button', { name: 'Reagendar' }).click();
    await expect(page).toHaveURL(/pcp\.html/);
    await expect(page.locator('.agd-modal[aria-label="Reagendar instalação"]')).toBeVisible();
    await expect(page.locator('#pcp-view-agenda')).toBeVisible();
});

test('"Lembrar amanhã" fecha a janela sem mudar o pedido', async ({ page }) => {
    await relogio(page, '2026-11-11T08:00:00');
    await entrarComo(page, 2, [agendada()]);
    await lembrete(page).getByRole('button', { name: 'Ainda não' }).click();
    await lembrete(page).getByRole('button', { name: 'Lembrar amanhã' }).click();
    await expect(lembrete(page)).toHaveCount(0);
    expect((await lerPed(page, 26300)).status).toBe('Pronto p/ Instalação');
});

test('aviso na Pagina Inicial lista as instalacoes e some depois de confirmar', async ({ page }) => {
    await relogio(page, '2026-11-11T08:00:00');
    await entrarComo(page, 2, [agendada()]);
    await lembrete(page).getByRole('button', { name: 'Ainda não' }).click();
    await lembrete(page).getByRole('button', { name: 'Lembrar amanhã' }).click();
    const aviso = page.locator('#aviso-inst-confirmar');
    await expect(aviso).toContainText('⚠ 1 instalação aguardando confirmação');
    await expect(aviso).toContainText('#26300');
    await expect(aviso).toContainText('Ana Paula Lima');

    await page.reload();   // o aviso fica sempre, mesmo sem a janela
    await expect(aviso).toContainText('⚠ 1 instalação aguardando confirmação');
    await aviso.getByRole('button', { name: 'Confirmar' }).click();
    await page.click('#mpg-nao');
    await expect.poll(async () => (await lerPed(page, 26300)).status).toBe('Aguardando Financeiro');
    expect((await lerPed(page, 26300)).pagamento_pendente).toBe(true);
    await expect(aviso).toBeHidden();
});

test('varios pedidos aparecem numa janela so, cada um com seus botoes', async ({ page }) => {
    await relogio(page, '2026-11-11T08:00:00');
    await entrarComo(page, 2, [
        agendada(),
        agendada({ id: 26301, clienteId: 2, clienteNome: 'Bruno Souza', data_entrega: '2026-11-09', inst_hora: '14:00' }),
        agendada({ id: 26302, clienteNome: 'Futuro', data_entrega: '2026-11-20' }),
    ]);
    const m = lembrete(page);
    await expect(m).toBeVisible();
    await expect(m.locator('.lembrete-inst-item')).toHaveCount(2);
    await expect(m).toContainText('O pedido #26300 (Ana Paula Lima) devia ter sido instalado em 10/11 às 09:00. Foi instalado?');
    await expect(m).toContainText('O pedido #26301 (Bruno Souza) devia ter sido instalado em 09/11 às 14:00. Foi instalado?');
    await expect(m).not.toContainText('Futuro');
    await expect(page.locator('#aviso-inst-confirmar')).toContainText('⚠ 2 instalações aguardando confirmação');

    await m.locator('.lembrete-inst-item', { hasText: '#26301' }).getByRole('button', { name: 'Sim, foi instalado' }).click();
    await page.click('#mpg-sim');
    await expect.poll(async () => (await lerPed(page, 26301)).status).toBe('Aguardando Financeiro');
    await expect(m.locator('.lembrete-inst-item'), 'continua com o que falta').toHaveCount(1);
    await expect(m).toContainText('#26300');
    await expect(page.locator('#aviso-inst-confirmar')).toContainText('⚠ 1 instalação aguardando confirmação');
});
