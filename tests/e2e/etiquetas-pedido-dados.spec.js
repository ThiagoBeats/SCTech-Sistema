const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const AMB = [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }];
const lerPedido = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')).find(x => x.id === 26001));

test('voltar para Orcamento zera a conferencia e registra', async ({ page }) => {
    await entrar(page, BASE, {
        sc_ped: [{ id: 26001, clienteId: 1, clienteNome: 'Maria', status: 'Pronto p/ Instalação', valor: 100, ambientes: AMB,
            volumes: 3, conferencia: { volumes_conferidos: [1, 2, 3], concluida_em: 1, conferido_por: 'Ana' } }],
        sc_cli: [{ id: 1, nome: 'Maria' }]
    });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { voltarPedidoParaOrcamento(26001); });
    await page.locator('#sc-modal-btns #sc-modal-ok').waitFor({ timeout: 5000 });
    await page.locator('#sc-modal-btns #sc-modal-ok').click();
    await expect.poll(async () => {
        try { return (await lerPedido(page)).status; } catch (e) { return null; }
    }, { timeout: 15000 }).toBe('Orçamento');
    await page.waitForLoadState('load');
    const p = await lerPedido(page);
    expect(p.conferencia.volumes_conferidos).toEqual([]);
    expect(p.volumes).toBe(3);
    expect(p.timeline[p.timeline.length - 1].label).toBe('Conferência zerada: pedido voltou para Orçamento');
});

test('editar e salvar o pedido preserva volumes', async ({ page }) => {
    const conf = { volumes_conferidos: [1], concluida_em: null, conferido_por: 'Ana' };
    await entrar(page, BASE, {
        sc_ped: [{ id: 26001, clienteId: 9, clienteNome: 'Cli', status: 'Orçamento', valor: 100, ambientes: AMB, itens: [],
            volumes: 2, conferencia: conf }],
        sc_cli: [{ id: 9, nome: 'Cli' }],
        sc_vend: [{ id: 1, nome: 'Ana', comissao_pct: 5 }],
        sc_editando_id: 26001
    });
    await page.goto(BASE + '/pedido.html');
    await page.selectOption('#ped-vendedor', '1');
    await page.evaluate(() => { pedidoDraft.ambientes.forEach(a => { a.calculado = true; }); salvarPedido(); });
    await page.waitForURL(/index\.html/, { timeout: 15000 });
    const p = await lerPedido(page);
    expect(p.volumes).toBe(2);
    expect(p.conferencia).toEqual(conf);
});
