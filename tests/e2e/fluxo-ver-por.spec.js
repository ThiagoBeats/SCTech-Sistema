// Fluxo de caixa > Ver por: os tres botoes (Dia, Semana, Mes) com a mesma largura e sem texto cortado.
// Relogio fixo: 20/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 20, 10, 0, 0);
const CONTAS = [{ id: 1, nome: 'A', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01', ativo: true }];

async function abrir(page, largura) {
    if (largura) await page.setViewportSize({ width: largura, height: 800 });
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_mov_fin: [], sc_cr: [], sc_cp: [] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    await expect(page.locator('#fluxo-agrupar-mes')).toBeVisible();
}

async function medidas(page) {
    return page.evaluate(() => ['dia', 'semana', 'mes'].map(v => {
        const b = document.getElementById('fluxo-agrupar-' + v);
        return { v, w: b.getBoundingClientRect().width, corte: b.scrollWidth - b.clientWidth };
    }));
}

for (const tema of ['light', 'dark']) {
    test(`Ver por: tres botoes com a mesma largura e sem corte (tema ${tema === 'dark' ? 'escuro' : 'claro'})`, async ({ page }) => {
        await abrir(page);
        await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);
        const m = await medidas(page);
        m.forEach(x => {
            expect(Math.abs(x.w - m[0].w)).toBeLessThanOrEqual(1);
            expect(x.corte).toBeLessThanOrEqual(0);
        });
        expect(m[0].w).toBeGreaterThan(60);
    });
}

test('Ver por: celular 390px sem rolagem horizontal e botoes iguais', async ({ page }) => {
    await abrir(page, 390);
    const m = await medidas(page);
    m.forEach(x => {
        expect(Math.abs(x.w - m[0].w)).toBeLessThanOrEqual(1);
        expect(x.corte).toBeLessThanOrEqual(0);
    });
    const larg = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, jan: innerWidth }));
    expect(larg.doc).toBeLessThanOrEqual(larg.jan);
});

test('Ver por: o seletor do regime da DRE continua como antes (sem a classe de largura igual)', async ({ page }) => {
    await abrir(page);
    expect(await page.locator('.dre-seg-igual').count()).toBe(1);
    await page.locator('#fluxo-agrupar-semana').click();
    await expect(page.locator('#fluxo-agrupar-semana')).toHaveAttribute('aria-pressed', 'true');
});
