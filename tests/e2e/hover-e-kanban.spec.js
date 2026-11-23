// Producao: card atrasado sem borda esquerda grossa (1px em volta, so a cor vermelha avisa)
// e todos os efeitos de hover animam em 150 ms.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const ped = (id, nome, status, extra) => ({ id, clienteId: 1, clienteNome: nome, status, valor: 100, amb: 'Sala', ...(extra || {}) });
const PED = () => [
    ped(27001, 'Atrasado Ana', 'Na Costura', { data_entrega: '2026-11-01' }),
    ped(27002, 'Prazo Bia', 'Na Costura', { data_entrega: '2030-01-10' }),
];

async function abrir(page) {
    await page.clock.setFixedTime(new Date(2026, 10, 23, 12, 0, 0));
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, BASE, { sc_ped: PED(), sc_cli: [{ id: 1, nome: 'Ana' }] });
    await page.goto(BASE + '/pcp.html?view=kanban');
}

test('card atrasado: borda esquerda igual as outras (1px) e fundo de perigo', async ({ page }) => {
    await abrir(page);
    const c = page.locator('.kanban-card', { hasText: 'Atrasado Ana' });
    await expect(c).toHaveClass(/kanban-card-atrasado/);
    const e = await c.evaluate(el => {
        const s = getComputedStyle(el);
        return { l: s.borderLeftWidth, t: s.borderTopWidth, r: s.borderRightWidth, b: s.borderBottomWidth, cor: s.borderLeftColor, bg: s.backgroundColor };
    });
    expect(e.l).toBe('1px');
    expect(e.l).toBe(e.t);
    expect(e.r).toBe(e.t);
    expect(e.b).toBe(e.t);
    expect(e.cor).toBe('rgb(244, 57, 39)');
    const bgPerigo = await page.evaluate(() => {
        const d = document.createElement('div'); d.style.background = 'var(--danger-bg)'; document.body.appendChild(d);
        const v = getComputedStyle(d).backgroundColor; d.remove(); return v;
    });
    expect(e.bg).toBe(bgPerigo);
    const normal = await page.locator('.kanban-card', { hasText: 'Prazo Bia' }).evaluate(el => getComputedStyle(el).borderLeftWidth);
    expect(normal).toBe('1px');
});

test('elementos com hover animam em 150 ms', async ({ page }) => {
    await abrir(page);
    const dur = await page.evaluate(() => {
        const out = {};
        const mk = (nome, html, sel) => {
            const w = document.createElement('div'); w.innerHTML = html; document.body.appendChild(w);
            const el = w.querySelector(sel); out[nome] = getComputedStyle(el).transitionDuration; w.remove();
        };
        mk('btn', '<button class="btn">x</button>', 'button');
        mk('btn-outline', '<button class="btn btn-outline">x</button>', 'button');
        mk('btn-danger', '<button class="btn btn-danger">x</button>', 'button');
        mk('nav-item', '<a class="nav-item">x</a>', 'a');
        mk('card', '<div class="card">x</div>', 'div');
        mk('td', '<table><tr><td>x</td></tr></table>', 'td');
        mk('menu-acoes-item', '<button class="menu-acoes-item">x</button>', 'button');
        mk('tab-btn', '<button class="tab-btn">x</button>', 'button');
        mk('kanban-card', '<div class="kanban-card">x</div>', 'div');
        return out;
    });
    for (const [nome, d] of Object.entries(dur)) {
        const lista = d.split(',').map(x => x.trim());
        expect(lista.every(x => x === '0.15s'), `${nome}: ${d}`).toBe(true);
    }
});
