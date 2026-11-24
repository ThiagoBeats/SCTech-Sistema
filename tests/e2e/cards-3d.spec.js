// Cards com profundidade: sem borda lateral grossa (esquerda = topo) e com sombra em camadas;
// cards clicaveis sobem no hover.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const MED = () => [
    { id: 1, clienteNome: 'Ana Medicao', endereco: 'Rua A, 1', data: '2026-11-23', hora: '10:00', duracao: 60, status: 'Agendado', usuario_id: 1 },
    { id: 2, clienteNome: 'Bia Atrasada', endereco: 'Rua B, 2', data: '2026-11-10', hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1 },
];
const PEDS = () => [
    { id: 27001, clienteId: 1, clienteNome: 'Atrasado Ana', status: 'Na Costura', valor: 100, amb: 'Sala', data_entrega: '2026-11-01' },
    { id: 27002, clienteId: 1, clienteNome: 'Prazo Bia', status: 'Na Costura', valor: 100, amb: 'Sala', data_entrega: '2030-01-10' },
];

async function abrir(page, url) {
    await page.clock.setFixedTime(new Date(2026, 10, 23, 12, 0, 0));
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, BASE, { sc_med: MED(), sc_ped: PEDS(), sc_cli: [{ id: 1, nome: 'Ana' }] });
    await page.goto(BASE + url);
}

const medir = loc => loc.first().evaluate(el => {
    const s = getComputedStyle(el);
    return { l: s.borderLeftWidth, t: s.borderTopWidth, r: s.borderRightWidth, sombra: s.boxShadow };
});
function semBordaLateral(m) {
    expect(m.l).toBe(m.t);
    expect(m.r).toBe(m.t);
    expect(m.sombra).not.toBe('none');
}

for (const tema of ['light', 'dark']) {
    test(`index (${tema}): cards sem borda lateral grossa, com sombra e que sobem no hover`, async ({ page }) => {
        await abrir(page, '/index.html');
        await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);
        const cards = page.locator('.index-card-3d.index-card-click');
        await expect(cards.first()).toBeVisible();
        expect(await cards.count()).toBeGreaterThan(1);
        semBordaLateral(await medir(cards));
        semBordaLateral(await medir(page.locator('.metric-card')));
        semBordaLateral(await medir(page.locator('.card')));
        const antes = await cards.first().evaluate(el => getComputedStyle(el).transform);
        await cards.first().hover();
        await page.waitForTimeout(300);
        const depois = await cards.first().evaluate(el => getComputedStyle(el).transform);
        expect(depois).not.toBe(antes);
    });
}

test('pcp: kanban e agenda sem borda lateral grossa; card do kanban sobe no hover', async ({ page }) => {
    await abrir(page, '/pcp.html?view=kanban');
    const c = page.locator('.kanban-card', { hasText: 'Prazo Bia' });
    await expect(c).toBeVisible();
    semBordaLateral(await medir(c));
    semBordaLateral(await medir(page.locator('.kanban-card', { hasText: 'Atrasado Ana' })));
    const antes = await c.evaluate(el => getComputedStyle(el).transform);
    await c.hover();
    await page.waitForTimeout(300);
    expect(await c.evaluate(el => getComputedStyle(el).transform)).not.toBe(antes);

    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.evaluate(() => abrirAgendaNoDia('2026-11-23'));
    await page.locator('#agenda-janela [data-prof="u:1"]').click();
    const ev = page.locator('#agenda-janela .ag-ev').first();
    await expect(ev).toBeVisible();
    semBordaLateral(await medir(ev));
});
