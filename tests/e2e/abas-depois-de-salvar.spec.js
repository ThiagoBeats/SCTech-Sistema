// Salvar recarrega a pagina: a aba que estava aberta continua aberta depois
// do recarregamento (em todas as telas com abas). Vindo do menu (navegacao
// normal), a tela abre na aba padrao.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');
const BASE = process.env.BASE || 'http://localhost:8131';

const PAGINAS = {
    'catalogo.html': ['mostrarTabCatalogo', ['tecidos', 'materiais', 'kits']],
    'configuracoes.html': ['mostrarTabConfig', ['perfil', 'preferencias', 'seguranca', 'acessos']],
    'empresa.html': ['mostrarTabEmpresa', ['dados', 'preferencias', 'layout', 'etiquetas', 'galeria']],
    'estoque.html': ['mostrarTabEstoque', ['tecidos', 'materiais', 'kits', 'consulta']],
    'financeiro.html': ['mostrarTabFinanceiro', ['hoje', 'dashboard', 'resultado', 'simulador', 'receber', 'pagar', 'fixas', 'dre', 'extrato']],
    'fornecedores.html': ['mostrarTabFornecedores', ['lista', 'novo', 'pedidos']],
    'pcp.html': ['mostrarViewPCP', ['kanban', 'agenda', 'medicoes', 'rotas']],
    'relatorios.html': ['mostrarTabRel', ['faturamento', 'recebiveis', 'vendedores']],
};
const abaAtiva = page => page.evaluate(() => (document.querySelector('.tab-btn.active:not(.tab-back-btn)')?.textContent || '').trim());

for (const [pag, [fn, abas]] of Object.entries(PAGINAS)) {
    test(`${pag}: salvar mantém a aba aberta`, async ({ page }) => {
        await entrar(page, BASE, {});
        for (const aba of abas) {
            await page.goto(BASE + '/' + pag);
            await page.evaluate(([f, a]) => window[f](a), [fn, aba]);
            const antes = await abaAtiva(page);
            await Promise.all([page.waitForEvent('load'), page.evaluate(() => salvarERecarregar('ok'))]);
            await expect.poll(() => abaAtiva(page), `${pag} › ${aba}`).toBe(antes);
        }
    });
}

test('vindo do menu, a tela abre na aba padrao (nao na ultima usada)', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => mostrarTabCatalogo('kits'));
    await page.goto(BASE + '/index.html');
    await page.goto(BASE + '/catalogo.html');
    await expect.poll(() => abaAtiva(page)).toContain('Tecidos');
});

test('vendedores: salvar mantém a aba e o tipo', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/vendedores.html');
    await page.evaluate(() => { mostrarTipoVendedores('arquiteto'); mostrarTabVendedores('historico'); });
    await Promise.all([page.waitForEvent('load'), page.evaluate(() => salvarERecarregar('ok'))]);
    await expect(page.locator('#tab-vend-historico')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => _tipoVend)).toBe('arquiteto');
});

test('catalogo: cadastrar um material pela tela continua na aba Materiais', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/catalogo.html');
    await page.click('.tab-btn[data-tab="cat-materiais"]');
    await page.evaluate(() => { db.materiais.push({ id: 991, nome: 'TESTE', unidade: 'un', preco_custo: 1, preco: 2 }); });
    await Promise.all([page.waitForEvent('load'), page.evaluate(() => salvarERecarregar('Material salvo!'))]);
    await expect(page.locator('#tab-cat-materiais')).toHaveClass(/active/);
});
