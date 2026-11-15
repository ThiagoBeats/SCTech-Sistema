// D5: a copia de seguranca leva usuarios, papeis e numeracao; o proximo numero
// de pedido (venda e compra) nunca repete um que ja existe.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8211';
const YY = String(new Date().getFullYear()).slice(-2);
const ID1 = parseInt(YY + '001');
const importar = async (page, dados) => {
    await page.evaluate(json =>
        importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }), JSON.stringify(dados));
    await page.locator('#sc-modal-ok').click();   // confirma "Importar"
};

test('exportar, limpar e importar: o usuario extra entra e os numeros nao repetem', async ({ page }) => {
    await entrar(page, BASE, {
        sc_ped: [{ id: ID1, status: 'Orçamento', cliente: 'A', itens: [] }],
        sc_pc: [{ id: ID1, status: 'Rascunho', itens: [] }],
    });
    await page.goto(BASE + '/index.html');
    const backup = await page.evaluate(async () => {
        const h = await hashSenha('joao1234');
        db.usuarios.push({ id: 2, nome: 'Joao', email: 'joao@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: h, preferencias: { tema: 'dark' } });
        syncDB();
        localStorage.setItem('sc_ped_seq', '1');
        localStorage.setItem('sc_pc_seq', '1');
        return JSON.parse(JSON.stringify(_dadosExportacao(false)));
    });
    expect(backup.usuarios.map(u => u.email)).toContain('joao@sctech.local');
    expect(backup.papeis.length).toBeGreaterThan(0);
    expect(backup.ped_seq).toBe(1);
    expect(JSON.stringify(backup)).not.toContain('sc_user');

    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await entrar(page, BASE, {});
    await page.goto(BASE + '/index.html');
    await importar(page, backup);
    await page.waitForURL(/index\.html/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_ped'))).toContain(String(ID1));

    // a sessao de quem importou continua valida
    await page.goto(BASE + '/index.html');
    await expect(page).toHaveURL(/index\.html/);
    expect(await page.evaluate(() => getUsuarioLogado() && getUsuarioLogado().email)).toBe('teste@sctech.local');

    // numeros novos nao repetem
    const nums = await page.evaluate(() => [gerarNumeroPedido(), gerarNumeroPedidoCompra()]);
    expect(nums).toEqual([ID1 + 1, ID1 + 1]);

    // o usuario extra entra pelo formulario de login
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(BASE + '/login.html');
    await page.fill('#login-usuario', 'joao@sctech.local');
    await page.fill('#login-senha', 'joao1234');
    await page.locator('#login-senha').press('Enter');
    await page.waitForURL(/index\.html/);
    expect(await page.evaluate(() => getUsuarioLogado().nome)).toBe('Joao');
    expect(await page.evaluate(() => getUsuarioLogado().preferencias)).toEqual({ tema: 'dark' });
});

test('backup antigo (sem usuarios nem contador): importa, usuarios ficam e numeros nao repetem', async ({ page }) => {
    await entrar(page, BASE, { sc_ped_seq: 0 });
    await page.goto(BASE + '/index.html');
    await importar(page, {
        clientes: [], catalogo: [],
        pedidos: [{ id: ID1, status: 'Orçamento', itens: [] }, { id: parseInt(YY + '002'), status: 'Orçamento', itens: [] }],
        pedidos_compra: [{ id: ID1, itens: [] }, { id: parseInt(YY + '005'), itens: [] }],
    });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped') || '[]').length)).toBe(2);
    await page.goto(BASE + '/index.html');
    expect(await page.evaluate(() => getUsuarioLogado().email)).toBe('teste@sctech.local');
    const nums = await page.evaluate(() => [gerarNumeroPedido(), gerarNumeroPedidoCompra()]);
    expect(nums).toEqual([parseInt(YY + '003'), parseInt(YY + '006')]);
});
