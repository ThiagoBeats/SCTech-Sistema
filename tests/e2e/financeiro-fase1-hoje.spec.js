// Financeiro Fase 1, tarefa 8: tela "Hoje" (tarefas primeiro, saldos e previsao ao lado).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somarDias = (dataISO, dias) => { const d = new Date(dataISO + 'T12:00:00'); d.setDate(d.getDate() + dias); return iso(d); };
const HOJE = iso(new Date());
const ddmm = d => d.slice(8, 10) + '/' + d.slice(5, 7);

const CONTAS = [
    { id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 100, data_saldo_inicial: '2020-01-01', ativo: true },
    { id: 12, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true }
];
const cr = (id, nome, venc, valor) => ({ id, pedido_id: 26300, cliente_nome: nome, descricao: 'Pedido ' + nome, valor: valor || 100, data_vencimento: venc, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' });
const cp = (id, nome, venc, valor) => ({ id, descricao: nome, fornecedor: 'Forn', valor: valor || 50, data_vencimento: venc, data_pagamento: null, status: 'Pendente', categoria: 'outros' });

async function abrir(page, dados, w) {
    await entrar(page, BASE, dados);
    if (w) await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '/financeiro.html');
}

test('Hoje e a primeira aba e abre por padrao', async ({ page }) => {
    await abrir(page, { sc_contas_fin: CONTAS });
    await expect(page.locator('.fin-tab-btn').first()).toHaveAttribute('data-tab', 'hoje');
    await expect(page.locator('.fin-tab-btn[data-tab="hoje"]')).toHaveClass(/active/);
    await expect(page.locator('#fin-hoje')).toBeVisible();
    await expect(page.locator('#fin-dashboard')).toBeHidden();
    await expect(page.locator('.fin-tab-btn').nth(1)).toHaveAttribute('data-tab', 'dashboard');
});

test('tarefas em ordem de urgencia com botoes', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: CONTAS,
        sc_mov_fin: [{ id: 1, conta_id: 12, data: HOJE, sentido: 'entrada', valor: 321, origem: 'cr', origem_id: 9, grupo_id: null, descricao: 'Repasse do cartao' }],
        sc_cr: [cr(1, 'Atrasado Rec', somarDias(HOJE, -3)), cr(2, 'Hoje Rec', HOJE)],
        sc_cp: [cp(3, 'Atrasado Pag', somarDias(HOJE, -2)), cp(4, 'Proximo Pag', somarDias(HOJE, 4))]
    });
    const grupos = page.locator('#hoje-tarefas .hoje-grupo');
    await expect(grupos).toHaveCount(5);
    await expect(grupos.nth(0)).toContainText('Atrasado Rec');
    await expect(grupos.nth(0)).toHaveAttribute('data-grupo', 'receber-atrasados');
    await expect(grupos.nth(1)).toContainText('Hoje Rec');
    await expect(grupos.nth(2)).toContainText('Atrasado Pag');
    await expect(grupos.nth(2)).toHaveAttribute('data-grupo', 'pagar-atrasados');
    await expect(grupos.nth(3)).toContainText('Proximo Pag');
    await expect(grupos.nth(4)).toContainText('Repasse do cartao');
    await expect(grupos.nth(0).locator('button', { hasText: 'Cobrar' })).toBeVisible();
    await expect(grupos.nth(0).locator('button', { hasText: 'Recebi' })).toBeVisible();
    await expect(grupos.nth(3).locator('button', { hasText: 'Paguei' })).toBeVisible();
    await expect(grupos.nth(4).locator('button')).toHaveCount(0);
});

test('sem receber completo nao mostra Recebi nem Cobrar', async ({ page }) => {
    await entrar(page, BASE, {
        sc_contas_fin: CONTAS,
        sc_cr: [cr(1, 'Atrasado Rec', somarDias(HOJE, -3))],
        sc_cp: [cp(3, 'Proximo Pag', somarDias(HOJE, 4))]
    });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 2;
        u[0].permissoes_extras = { 'financeiro.receber': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#hoje-tarefas')).toContainText('Atrasado Rec');
    await expect(page.locator('#hoje-tarefas button', { hasText: 'Recebi' })).toHaveCount(0);
    await expect(page.locator('#hoje-tarefas button', { hasText: 'Cobrar' })).toHaveCount(0);
    await expect(page.locator('#hoje-tarefas button', { hasText: 'Paguei' })).toBeVisible();
});

test('saldo de hoje nao inclui cartao a cair', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: CONTAS,
        sc_mov_fin: [{ id: 1, conta_id: 12, data: somarDias(HOJE, 10), sentido: 'entrada', valor: 500, origem: 'cr', origem_id: 9, grupo_id: null, descricao: 'Repasse futuro' }]
    });
    await expect(page.locator('#hoje-total')).toContainText('100,00');
    await expect(page.locator('#hoje-total')).not.toContainText('600,00');
    const maq = page.locator('#hoje-saldos .hoje-conta', { hasText: 'Maquininha' });
    await expect(maq).toContainText('0,00');
    await expect(maq).toContainText('500,00');
    await expect(maq).toContainText('a cair');
});

test('clicar na conta abre o extrato filtrado', async ({ page }) => {
    await abrir(page, { sc_contas_fin: CONTAS });
    await page.locator('#hoje-saldos .hoje-conta', { hasText: 'Maquininha' }).click();
    await expect(page.locator('#fin-extrato')).toBeVisible();
    await expect(page.locator('#extrato-conta')).toHaveValue('12');
});

test('semana negativa aparece com o texto de falta', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [{ ...CONTAS[0], saldo_inicial: 0 }],
        sc_cp: [cp(3, 'Conta grande', somarDias(HOJE, 3), 300)]
    });
    await expect(page.locator('#hoje-previsao canvas')).toBeVisible();
    await expect(page.locator('#hoje-previsao-aviso')).toContainText(`Semana de ${ddmm(HOJE)}: falta R$ 300,00`);
});

test('legenda inclui atrasados quando ha atrasado na previsao', async ({ page }) => {
    await abrir(page, { sc_contas_fin: CONTAS, sc_cr: [cr(1, 'Atrasado Rec', somarDias(HOJE, -3))] });
    await expect(page.locator('#hoje-previsao')).toContainText('inclui atrasados');
});

test('sem contas mostra convite', async ({ page }) => {
    await abrir(page, { sc_cr: [cr(1, 'Atrasado Rec', somarDias(HOJE, -3))] });
    await expect(page.locator('#hoje-tarefas')).toContainText('Atrasado Rec');
    await expect(page.locator('#hoje-convite')).toContainText('Configure suas contas para ver quanto você tem');
    await expect(page.locator('#hoje-convite a')).toHaveAttribute('href', /empresa\.html#preferencias/);
    await expect(page.locator('#hoje-saldos .hoje-conta')).toHaveCount(0);
});

test('tudo em dia', async ({ page }) => {
    await abrir(page, { sc_contas_fin: CONTAS });
    await expect(page.locator('#hoje-tarefas')).toContainText('Tudo em dia');
    await expect(page.locator('#hoje-tarefas .hoje-grupo')).toHaveCount(0);
});

test('em 375px de largura tarefas vem primeiro', async ({ page }) => {
    await abrir(page, { sc_contas_fin: CONTAS, sc_cr: [cr(1, 'Atrasado Rec', somarDias(HOJE, -3))] }, 375);
    const t = await page.locator('#hoje-tarefas').boundingBox();
    const s = await page.locator('#hoje-saldos').boundingBox();
    expect(t.y).toBeLessThan(s.y);
    expect(Math.abs(t.x - s.x)).toBeLessThan(5);
});
