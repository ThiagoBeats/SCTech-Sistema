// Financeiro Fase 3, tarefa 3: foto do fechamento (sc_fin_fech) no backup,
// permissao "Simular compra" pela migracao e nucleos carregados.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const importar = (page, dados) => page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json', { type: 'application/json' })], value: '' } }), JSON.stringify(dados));

test('fechamentos entram no backup e voltam na importacao', async ({ page }) => {
    await entrar(page, BASE, { sc_fin_fech: [{ id: 'fech-2026-10', mes: '2026-10' }] });
    await page.goto(BASE + '/index.html');
    expect(await page.evaluate(() => _dadosExportacao(false).fechamentos_fin)).toEqual([{ id: 'fech-2026-10', mes: '2026-10' }]);
    await importar(page, { clientes: [], catalogo: [], pedidos: [] });
    await page.locator('#sc-modal-ok').click();
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_fech'))).toBe('[]');
    await importar(page, { clientes: [], catalogo: [], pedidos: [], fechamentos_fin: [{ id: 'fech-2026-10', mes: '2026-10' }] });
    await page.locator('#sc-modal-ok').click();
    await page.waitForLoadState('load');
    await expect.poll(async () => (await ler(page, 'sc_fin_fech') || []).length).toBe(1);
});

test('permissao financeiro.simulador nasce pela migracao com o nivel da Visao Geral', async ({ page }) => {
    const nivel = n => ({ nivel: n, acoes_restritas: [] });
    await entrar(page, BASE, { sc_pap: [
        { id: 1, nome: 'Administrador', permissoes: { financeiro: nivel('completo') } },
        { id: 3, nome: 'Vendedor/Atendimento', permissoes: { financeiro: nivel('visualizar'), 'financeiro.dashboard': nivel('visualizar') } }
    ] });
    await page.goto(BASE + '/configuracoes.html');
    const r = await page.evaluate(() => ({
        n: db.papeis.find(p => p.id === 3).permissoes['financeiro.simulador'].nivel,
        rot: MODULOS_PERMISSAO.find(m => m.key === 'financeiro').subs.find(s => s.key === 'simulador').label,
        tab: FIN_TAB_MODULO.simulador
    }));
    expect(r).toEqual({ n: 'visualizar', rot: 'Simular compra', tab: 'financeiro.simulador' });
});

test('nucleos carregados', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/financeiro.html');
    expect(await page.evaluate(() => typeof FechamentoCore === 'object' && typeof SimuladorCore === 'object')).toBe(true);
});
