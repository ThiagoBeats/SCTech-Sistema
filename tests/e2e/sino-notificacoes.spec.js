// Sino de notificacoes na barra superior: mesma lista do card "Alertas do Sistema".
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const ontem = () => { const d = new Date(Date.now() - 86400000); return d.toISOString().split('T')[0]; };
const pedidoAtrasado = (id, nome) => ({ id, clienteNome: nome, status: 'Em Produção', data_entrega: ontem(), itens: [] });
const medicaoAtrasada = { id: 501, clienteNome: 'Maria Medida', status: 'Agendado', data: ontem(), hora: '09:00' };

async function semear(page, extras) {
    await entrar(page, BASE, Object.assign({ sc_ped: [pedidoAtrasado(26005, 'Joao Atrasado')], sc_med: [medicaoAtrasada] }, extras || {}));
}
const badge = page => page.locator('#topbar-sino .sino-badge');

for (const pg of ['index.html', 'estoque.html']) {
    test(`o sino conta os alertas em ${pg}`, async ({ page }) => {
        await semear(page);
        await page.goto(BASE + '/' + pg);
        await expect(badge(page)).toHaveText('2');
    });
}

test('hover abre a mini-janela com os mesmos textos do card; clicar marca como visto e navega', async ({ page }) => {
    await semear(page);
    await page.goto(BASE + '/index.html');
    const card = page.locator('#dashboard-alertas');
    await expect(card).toContainText('entrega(s) atrasada(s)');
    await expect(card).toContainText('medição(ões)');
    await expect(page.locator('#dash-alertas-count')).toContainText('2 alertas');
    await page.hover('#sino-btn');
    const painel = page.locator('#sino-painel');
    await expect(painel).toBeVisible();
    const itens = painel.locator('.sino-item');
    await expect(itens).toHaveCount(2);
    // abrir o sino marca o que ele lista como visto: a contagem zera e os itens continuam, sem destaque
    await expect(badge(page)).toHaveCount(0);
    await expect(painel.locator('.sino-item.novo')).toHaveCount(0);
    await expect(painel).toContainText('1 entrega(s) atrasada(s):');
    await expect(painel).toContainText('Joao Atrasado');
    await expect(painel).toContainText('1 medição(ões) atrasada(s):');
    await expect(painel).toContainText('Maria Medida');
    // o painel por cima da pagina, nao escondido pela barra
    const z = await painel.evaluate(el => Number(getComputedStyle(el).zIndex));
    expect(z).toBeGreaterThan(200);
    await itens.filter({ hasText: 'Maria Medida' }).click();
    await page.waitForURL(/pcp\.html\?view=medicoes/);
    await expect(badge(page)).toHaveCount(0);
    await page.reload();
    await expect(badge(page)).toHaveCount(0);
    await page.goto(BASE + '/estoque.html');
    await expect(badge(page)).toHaveCount(0);
    const vistos = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_notif_vistos_1')));
    expect(vistos).toEqual(['entregas-atrasadas:26005', 'medicoes-atrasadas:501']);
});

test('abrir o alerta no card do Painel tambem marca como visto', async ({ page }) => {
    await semear(page);
    await page.goto(BASE + '/index.html');
    await expect(badge(page)).toHaveText('2');
    await page.locator('#dashboard-alertas [data-chave^="medicoes-atrasadas"]').click({ position: { x: 5, y: 5 } });
    await page.waitForURL(/pcp\.html\?view=medicoes|index\.html/);
    await page.goto(BASE + '/estoque.html');
    await expect(badge(page)).toHaveText('1');
});

test('outro usuario ainda ve tudo; alerta novo conta de novo; tipo desligado nao conta', async ({ page }) => {
    await semear(page, {
        sc_usr: [
            { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
            { id: 2, nome: 'Outro', email: 'outro@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' }
        ]
    });
    await page.goto(BASE + '/estoque.html');
    await expect(badge(page)).toHaveText('2');
    await page.click('#sino-btn');
    await expect(badge(page)).toHaveCount(0);

    // outro usuario ainda ve tudo
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'outro@sctech.local' })));
    await page.goto(BASE + '/estoque.html');
    await expect(badge(page)).toHaveText('2');

    // volta ao usuario 1: surge nova entrega atrasada -> sobe
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 1, email: 'teste@sctech.local' })));
    await page.goto(BASE + '/estoque.html');
    await expect(badge(page)).toHaveCount(0);
    await page.evaluate(ontem => {
        const p = JSON.parse(localStorage.getItem('sc_ped'));
        p.push({ id: 26007, clienteNome: 'Novo Atraso', status: 'Em Produção', data_entrega: ontem, itens: [] });
        localStorage.setItem('sc_ped', JSON.stringify(p));
    }, ontem());
    await page.reload();
    await expect(badge(page)).toHaveText('1');
    await page.click('#sino-btn');
    await expect(badge(page)).toHaveCount(0);

    // desligar o tipo "entrega" em Configurar Empresa
    await page.evaluate(() => localStorage.setItem('sc_alertas_cfg', JSON.stringify({ entrega: false })));
    await page.reload();
    await expect(badge(page)).toHaveCount(0);
    await page.hover('#sino-btn');
    await expect(page.locator('#sino-painel')).toContainText('Alertas desabilitados');
    await expect(page.locator('#sino-painel')).not.toContainText('Joao Atrasado');
});

test('o sino atualiza sozinho com o storage e abrir zera a contagem (sem link "Marcar todas")', async ({ page, context }) => {
    await semear(page);
    await page.goto(BASE + '/estoque.html');
    await expect(badge(page)).toHaveText('2');
    // outra aba grava um pedido novo atrasado: o sino sobe sem recarregar
    const outra = await context.newPage();
    await outra.goto(BASE + '/estoque.html');
    await outra.evaluate(ontem => {
        const p = JSON.parse(localStorage.getItem('sc_ped'));
        p.push({ id: 26009, clienteNome: 'Outra Aba', status: 'Em Produção', data_entrega: ontem, itens: [] });
        localStorage.setItem('sc_ped', JSON.stringify(p));
    }, ontem());
    await expect(badge(page)).toHaveText('2');
    await page.hover('#sino-btn');
    await expect(page.locator('#sino-painel')).toContainText('Outra Aba');
    await expect(badge(page)).toHaveCount(0);   // abrir ja marcou tudo
    await expect(page.locator('#sino-marcar')).toHaveCount(0);
    await page.reload();
    await expect(badge(page)).toHaveCount(0);
});

test('item com acao e persistente aparece como botao no sino e no card', async ({ page }) => {
    await semear(page, { sc_ped: [], sc_med: [] });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => {
        window.__ok = 0;
        Notif.registrar('teste-acao', () => [{ chave: 'teste:1', icone: '🧪', titulo: '<strong>Pedido de aceite</strong>', texto: 'Medição X', urgente: false, persistente: true, acao: { rotulo: 'Aceitar', fn: 'window.__ok++' } }]);
        Notif.atualizar();
    });
    await expect(badge(page)).toHaveText('1');
    await expect(page.locator('#dashboard-alertas')).toContainText('Pedido de aceite');
    await page.locator('#dashboard-alertas [data-alerta-acao]').click();
    expect(await page.evaluate(() => window.__ok)).toBe(1);
    await expect(badge(page)).toHaveCount(0);        // abrir marca como visto
    await page.hover('#sino-btn');
    await expect(page.locator('#sino-painel .sino-item')).toHaveCount(1);   // continua listado
    await page.locator('#sino-painel .sino-acao').click();
    expect(await page.evaluate(() => window.__ok)).toBe(2);
});

test('modais ficam por cima da barra superior', async ({ page }) => {
    await semear(page);
    await page.goto(BASE + '/index.html');
    const z = await page.evaluate(() => {
        const topo = Number(getComputedStyle(document.getElementById('topbar')).zIndex);
        const o = document.createElement('div');
        o.className = 'modal-overlay';
        document.body.appendChild(o);
        const m = Number(getComputedStyle(o).zIndex);
        const a = document.createElement('div');
        a.className = 'agd-modal-overlay';
        document.body.appendChild(a);
        return { topo, modal: m, agd: Number(getComputedStyle(a).zIndex) };
    });
    expect(z.modal).toBeGreaterThan(z.topo);
    expect(z.agd).toBeGreaterThan(z.topo);
});

test('no celular, tocar no sino abre a lista', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true });
    const page = await ctx.newPage();
    await semear(page);
    await page.goto(BASE + '/index.html');
    await expect(badge(page)).toHaveText('2');
    await expect(page.locator('#sino-painel')).toBeHidden();
    await page.tap('#sino-btn');
    await expect(page.locator('#sino-painel')).toBeVisible();
    await expect(badge(page)).toHaveCount(0);
    await ctx.close();
});
