// Financeiro fase 0 - pedido de compra recebido gera conta a pagar; nota
// importada do mesmo fornecedor oferece vincular em vez de duplicar.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const FORN = [{ id: 7, nome: 'RC Tecidos', cnpj: '11.222.333/0001-81' }];
const pc = (extra) => ({ id: 5001, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', data_criacao: Date.now(), status: 'Enviado',
    itens: [{ tipo: 'tecido', item_id: 1, item_nome: 'TRICO HERA', unidade: 'm', quantidade: 10, preco_unit: 92, subtotal: 920 },
            { tipo: 'material', item_id: 11, item_nome: 'TRILHO', unidade: 'm', quantidade: 2, preco_unit: 40, subtotal: 80 }], ...(extra || {}) });
const hojeLocal = () => new Date().toLocaleDateString('sv-SE');

async function abrir(page, pcs, cps) {
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: pcs, sc_cp: cps || [] });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
}
const receber = (page, id) => page.evaluate(i => { atualizarStatusPC(i, 'Recebido'); }, id || 5001);

test('recebido abre o modal com o total do PC', async ({ page }) => {
    await abrir(page, [pc()]);
    await receber(page);
    await expect(page.locator('#pcp-valor')).toHaveValue('1000.00');
});

test('a vista / prazo / parcelado geram as contas certas', async ({ page }) => {
    await abrir(page, [pc(), pc({ id: 5002 }), pc({ id: 5003 })]);
    await receber(page, 5001);
    await page.locator('input[name="pcp-modo"][value="avista"]').check();
    await page.locator('#pcp-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).length).toBe(1);
    let cps = await lerChave(page, 'sc_cp');
    expect(cps[0].data_vencimento).toBe(hojeLocal());
    expect(cps[0].valor).toBe(1000);
    expect(cps[0].pedido_compra_id).toBe(5001);
    expect(cps[0].cnpj_fornecedor).toBe('11.222.333/0001-81');
    expect(cps[0].credor_nome).toBe('RC Tecidos');
    expect(cps[0].categoria).toBe('tecido');

    await receber(page, 5002);
    await page.locator('input[name="pcp-modo"][value="prazo"]').check();
    await page.locator('#pcp-venc').fill('2099-03-15');
    await page.locator('#pcp-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).length).toBe(2);
    cps = await lerChave(page, 'sc_cp');
    expect(cps[1].data_vencimento).toBe('2099-03-15');

    await receber(page, 5003);
    await page.locator('input[name="pcp-modo"][value="parcelado"]').check();
    await page.locator('#pcp-parcelas').fill('3');
    await page.locator('#pcp-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).length).toBe(5);
    cps = (await lerChave(page, 'sc_cp')).filter(c => c.pedido_compra_id === 5003);
    expect(cps).toHaveLength(3);
    expect(Math.round(cps.reduce((s, c) => s + c.valor, 0) * 100)).toBe(100000);
    expect(cps.map(c => c.parcela_atual)).toEqual([1, 2, 3]);
    expect(new Set(cps.map(c => c.lancamento_pai_id)).size).toBe(1);
    expect(cps.every(c => c.parcelado && c.numero_parcelas === 3)).toBe(true);
    const ids = (await lerChave(page, 'sc_cp')).map(c => c.id);
    expect(new Set(ids).size).toBe(5);
    expect((await lerChave(page, 'sc_pc')).every(p => p.conta_pagar_gerada)).toBe(true);
});

test('agora nao deixa aviso e permite gerar depois', async ({ page }) => {
    await abrir(page, [pc({ status: 'Rascunho' })]);
    await receber(page);
    await page.locator('#pcp-agora').click();
    await expect(page.locator('#tb-pedidos-compra')).toContainText('sem conta a pagar');
    await page.locator('#tb-pedidos-compra button', { hasText: 'Gerar conta' }).click();
    await page.locator('#pcp-ok').click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp')).length).toBe(1);
    await expect(page.locator('#tb-pedidos-compra')).not.toContainText('sem conta a pagar');
    await expect(page.locator('#tb-pedidos-compra button', { hasText: 'Gerar conta' })).toHaveCount(0);
});

test('voltar o PC e marcar Recebido de novo nao duplica', async ({ page }) => {
    await abrir(page, [pc({ conta_pagar_gerada: true })]);
    await receber(page);
    await page.waitForTimeout(300);
    await expect(page.locator('#pcp-valor')).toHaveCount(0);
    expect(await lerChave(page, 'sc_cp')).toHaveLength(0);
});

test('importar nota do mesmo fornecedor oferece vincular', async ({ page }) => {
    const cp = { id: 9001, pedido_compra_id: 5001, cnpj_fornecedor: '11.222.333/0001-81', credor_nome: 'RC Tecidos', categoria: 'tecido',
        descricao: 'Pedido de compra #5001', valor: 1000, data_vencimento: '2099-01-10', data_pagamento: null, status: 'Pendente', tipo: 'variavel' };
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: [pc({ conta_pagar_gerada: true })], sc_cp: [cp] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="pagar"]').click();
    await page.evaluate(() => {
        abrirModalContaPagar('manual');
        document.getElementById('cpm-descricao').value = 'NF 123';
        document.getElementById('cpm-cnpj').value = '11.222.333/0001-81';
        document.getElementById('cpm-credor').value = 'RC Tecidos';
        document.getElementById('cpm-valor').value = '1005.00';
        document.getElementById('cpm-vencimento').value = '2099-01-10';
        document.getElementById('cpm-doc').value = '123456';
        _anexoPendenteCP = { nome: 'nf.pdf', tipo: 'application/pdf', dataUrl: 'data:application/pdf;base64,AAAA', chaveAcesso: '35' + '1'.repeat(42) };
        adicionarContaPagarManual();
    });
    await expect(page.locator('#sc-modal-msg')).toContainText('conta');
    await page.locator('#sc-modal-btns button', { hasText: 'Vincular à conta existente' }).click();
    await expect.poll(async () => (await lerChave(page, 'sc_cp'))[0].numero_documento).toBe('123456');
    const cps = await lerChave(page, 'sc_cp');
    expect(cps).toHaveLength(1);
    expect(cps[0].chave_acesso).toBe('35' + '1'.repeat(42));
    expect(cps[0].arquivo_anexo_nome).toBe('nf.pdf');
});
