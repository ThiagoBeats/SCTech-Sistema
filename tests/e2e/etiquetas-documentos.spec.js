const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const MSG = 'Não foi possível carregar o gerador de códigos. Verifique a conexão com a internet e tente novamente.';

const AMB = [{ id: 1, amb: 'Sala', calculado: true, tecidos: [{ tecidoNome: 'Linho', prega: 'Wave', num_panos: 3, consumo_linear: 6 }] }];
const ped = (id, status) => ({ id, clienteId: 1, clienteNome: 'Maria Souza', status, valor: 100, amb: 'Sala', ambientes: AMB });

async function abrir(page, url) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, BASE, {
        sc_ped: [ped(26001, 'Na Costura'), ped(26004, 'Orçamento')],
        sc_cli: [{ id: 1, nome: 'Maria Souza' }]
    });
    await page.goto(BASE + url);
}

test('OS mostra o codigo de barras do pedido', async ({ page }) => {
    await abrir(page, '/pcp.html');
    await page.locator('.kanban-card', { hasText: '26001' }).locator('button[title="Ver Ordem de Serviço"]').first().click();
    const cod = page.locator('#doc-modal-paper .sc-codigo-doc[data-status="ok"]');
    await expect(cod.locator('svg').first()).toBeVisible({ timeout: 20000 });
    await expect(cod).toContainText('26001');
});

test('Proposta em Orcamento ja mostra o codigo', async ({ page }) => {
    await abrir(page, '/pedidos.html');
    await page.locator('tr', { hasText: '26004' }).locator('button[title="Gerar proposta PDF"]').click();
    const cod = page.locator('#doc-modal-paper .sc-codigo-doc[data-status="ok"]');
    await expect(cod.locator('svg').first()).toBeVisible({ timeout: 20000 });
    await expect(cod).toContainText('26004');
});

test('sem internet: mensagem de conexao e nao imprime', async ({ page }) => {
    await page.route('**/cdn.jsdelivr.net/**', r => r.abort());
    await page.addInitScript(() => { window.print = () => { window.__imprimiu = true; }; });
    await abrir(page, '/pcp.html');
    await page.locator('.kanban-card', { hasText: '26001' }).locator('button[title="Ver Ordem de Serviço"]').first().click();
    await expect(page.locator('#doc-modal-paper .sc-codigo-falha')).toContainText(MSG, { timeout: 20000 });
    await page.click('text=🖨️ Imprimir / PDF');
    await expect(page.locator('#sc-modal-msg')).toContainText(MSG);
    expect(await page.evaluate(() => window.__imprimiu)).toBeFalsy();
});
