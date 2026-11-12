// Historico de pedidos do fornecedor: data_envio, janela com filtro/total e exportacao.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const FORN = [{ id: 7, nome: 'RC Tecidos' }, { id: 8, nome: 'Outro' }];
const it = v => [{ tipo: 'material', item_id: 1, item_nome: 'X', unidade: 'm', quantidade: 1, preco_unit: v, subtotal: v }];
const pc = (id, status, data_envio, valor, forn = 7) => ({
    id, fornecedor_id: forn, fornecedor_nome: forn === 7 ? 'RC Tecidos' : 'Outro',
    data_criacao: Date.now(), status, data_envio, itens: it(valor)
});
const PCS = [
    pc(5001, 'Enviado', '2026-10-05', 100),
    pc(5002, 'Recebido', '2026-11-02', 250.5),
    pc(5003, 'Rascunho', null, 999),
    pc(5004, 'Enviado', '2026-09-01', 40),
    pc(5005, 'Enviado', '2026-10-10', 7777, 8)
];
const hojeLocal = () => new Date().toLocaleDateString('sv-SE');

async function abrirHist(page) {
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: PCS });
    await page.goto(BASE + '/fornecedores.html');
    const linha = page.locator('#tb-fornecedores tr', { hasText: 'RC Tecidos' });
    await linha.locator('button[aria-label="Ações"]').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Histórico de pedidos' }).click();
    await expect(page.locator('#hist-forn-modal')).toBeVisible();
}

test('Enviado grava data_envio e voltar para Rascunho apaga', async ({ page }) => {
    await entrar(page, BASE, { sc_forn: FORN, sc_pc: [pc(5001, 'Rascunho', null, 100)] });
    await page.goto(BASE + '/fornecedores.html?tab=pedidos');
    await page.evaluate(() => atualizarStatusPC(5001, 'Enviado'));
    expect((await lerChave(page, 'sc_pc'))[0].data_envio).toBe(hojeLocal());
    await page.evaluate(() => { window.showConfirm = async () => true; return atualizarStatusPC(5001, 'Rascunho'); });
    expect((await lerChave(page, 'sc_pc'))[0].data_envio).toBeNull();
});

test('historico lista so enviados e recebidos, mais recente primeiro, com total', async ({ page }) => {
    await abrirHist(page);
    const m = page.locator('#hist-forn-modal');
    await expect(m).toContainText('RC Tecidos');
    const linhas = m.locator('tbody tr');
    await expect(linhas).toHaveCount(3);
    await expect(linhas.nth(0)).toContainText('02/11/2026');
    await expect(linhas.nth(0)).toContainText('Recebido');
    await expect(linhas.nth(1)).toContainText('05/10/2026');
    await expect(linhas.nth(2)).toContainText('01/09/2026');
    await expect(m.locator('#hist-forn-total')).toContainText('390,50');
    await page.keyboard.press('Escape');
    await expect(m).toHaveCount(0);
});

test('filtro por data atualiza linhas e total', async ({ page }) => {
    await abrirHist(page);
    const m = page.locator('#hist-forn-modal');
    await m.locator('#hist-forn-de').fill('2026-10-01');
    await m.locator('#hist-forn-ate').fill('2026-10-31');
    await expect(m.locator('tbody tr')).toHaveCount(1);
    await expect(m.locator('#hist-forn-total')).toContainText('100,00');
});

test('clicar abre o PDF do pedido', async ({ page }) => {
    await abrirHist(page);
    await page.locator('#hist-forn-modal tbody tr', { hasText: '05/10/2026' }).click();
    await expect(page.locator('#doc-modal-overlay')).toBeVisible();
    await expect(page.locator('#doc-modal-paper')).toContainText(/5001|RC Tecidos/);
});

test('exportar Excel baixa arquivo com as linhas filtradas', async ({ page }) => {
    await abrirHist(page);
    await page.locator('#hist-forn-de').fill('2026-10-01');
    const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.locator('#hist-forn-modal').getByRole('button', { name: /Excel/ }).click()
    ]);
    expect(dl.suggestedFilename()).toBe('historico_RC_Tecidos_2026-10-01_todos.xlsx');
    const p = await dl.path();
    expect(fs.statSync(p).size).toBeGreaterThan(500);
    const linhas = await page.evaluate(async b64 => {
        const wb = XLSX.read(b64, { type: 'base64' });
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    }, fs.readFileSync(p).toString('base64'));
    expect(linhas[0]).toEqual(['Nº', 'Data de envio', 'Situação', 'Valor']);
    expect(linhas.length).toBe(4); // cabecalho + 2 linhas + total
    expect(JSON.stringify(linhas[3])).toContain('350.5');
});

test('exportar PDF abre o documento com o total', async ({ page }) => {
    await abrirHist(page);
    await page.locator('#hist-forn-modal').getByRole('button', { name: /PDF/ }).click();
    const paper = page.locator('#doc-modal-paper');
    await expect(paper).toContainText('RC Tecidos');
    await expect(paper).toContainText('Total');
    await expect(paper).toContainText('390,50');
});
