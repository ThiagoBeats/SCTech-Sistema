// Etapa 3 do lote: Vendedores/Arquitetos. Os dois moram na mesma lista
// (sc_vend) e se distinguem pelo campo tipo; cadastro antigo, sem tipo, e
// vendedor. O campo RT livre do pedido saiu: o arquiteto entra pelo campo
// Vendedor / Responsavel e recebe pela comissao do cadastro.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const VEND = [
    { id: 1, nome: 'Ana',      comissao_pct: 5 },                    // antigo, sem tipo
    { id: 2, nome: 'Bruno',    comissao_pct: 4, tipo: 'vendedor' },
    { id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' },
];
const PED = [
    { id: 26001, clienteNome: 'Cli A', status: 'Instalado', valor: 1000, vendedor_id: 1, vendedor_nome: 'Ana',      comissao_pct: 5,  comissao_valor: 50 },
    { id: 26002, clienteNome: 'Cli B', status: 'Instalado', valor: 2000, vendedor_id: 3, vendedor_nome: 'Studio M', comissao_pct: 10, comissao_valor: 200 },
    { id: 26003, clienteNome: 'Cli C', status: 'Instalado', valor: 500,  vendedor_id: 3, vendedor_nome: 'Studio M', comissao_pct: 10, comissao_valor: 50,
      comissao_paga: true, comissao_data_pgto: 1760000000000 },
];

async function abrir(page, url, extras) {
    await entrar(page, BASE, { sc_vend: VEND, sc_ped: PED, ...(extras || {}) });
    await page.goto(BASE + '/' + (url || 'vendedores.html'));
}

async function confirmarModal(page) {
    const ok = page.locator('#sc-modal-ok');
    await ok.waitFor({ timeout: 5000 });
    await ok.click();
    await page.waitForTimeout(400);
}

const nomesNaTabela = page => page.locator('#tb-vendedores tr td:first-child').allInnerTexts();

// --- Nome e abas ------------------------------------------------------------

test('o menu lateral se chama Vendedores/Arquitetos', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#main-sidebar')).toContainText('Vendedores/Arquitetos');
    await expect(page.locator('.header h2')).toHaveText('Vendedores/Arquitetos');
});

test('ha as abas Vendedores e Arquitetos, e dentro delas Comissoes e Historico', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('.vend-tipo-btn')).toHaveText(['👤 Vendedores', '📐 Arquitetos']);
    const subs = await page.locator('.vend-tab-btn').allInnerTexts();
    expect(subs.join(' ')).toContain('Comissões Pendentes');
    expect(subs.join(' ')).toContain('Histórico de Pagamentos');
});

// --- Cadastro ---------------------------------------------------------------

test('a aba Vendedores lista so vendedores, incluindo os antigos sem tipo', async ({ page }) => {
    await abrir(page);
    const nomes = await nomesNaTabela(page);
    expect(nomes).toEqual(['Ana', 'Bruno']);
});

test('a aba Arquitetos lista so arquitetos', async ({ page }) => {
    await abrir(page);
    await page.click('.vend-tipo-btn[data-tipo="arquiteto"]');
    expect(await nomesNaTabela(page)).toEqual(['Studio M']);
    await expect(page.locator('#vend-form-titulo')).toHaveText('Cadastrar Arquiteto');
});

test('cadastrar na aba Arquitetos grava o tipo arquiteto', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    await page.fill('#vend-nome', 'Casa Nova Arq');
    await page.fill('#vend-comissao', '8');
    await page.click('#vend-btn-salvar');
    await page.waitForTimeout(600);
    const novo = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_vend')).find(v => v.nome === 'Casa Nova Arq'));
    expect(novo.tipo).toBe('arquiteto');
    expect(novo.comissao_pct).toBe(8);
});

test('cadastrar na aba Vendedores grava o tipo vendedor', async ({ page }) => {
    await abrir(page);
    await page.fill('#vend-nome', 'Carla');
    await page.click('#vend-btn-salvar');
    await page.waitForTimeout(600);
    const novo = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_vend')).find(v => v.nome === 'Carla'));
    expect(novo.tipo).toBe('vendedor');
});

test('nome repetido e barrado mesmo entre tipos diferentes', async ({ page }) => {
    await abrir(page);
    await page.fill('#vend-nome', 'studio m');
    await page.click('#vend-btn-salvar');
    await expect(page.locator('body')).toContainText('Já existe um cadastro com o nome "Studio M" (arquiteto)');
});

test('editar um arquiteto nao o transforma em vendedor', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    await page.click('#tb-vendedores button[title="Editar"]');
    await expect(page.locator('#vend-form-titulo')).toHaveText('Editar Arquiteto');
    await page.fill('#vend-comissao', '12');
    await page.click('#vend-btn-salvar');
    await page.waitForTimeout(600);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_vend')).find(v => v.id === 3));
    expect(s.tipo).toBe('arquiteto');
    expect(s.comissao_pct).toBe(12);
});

// --- Comissoes --------------------------------------------------------------

test('comissoes pendentes mostram so as do tipo da aba', async ({ page }) => {
    await abrir(page);
    await page.click('.vend-tab-btn[data-tab="pendentes"]');
    await expect(page.locator('#tb-comissoes-pendentes')).toContainText('Ana');
    await expect(page.locator('#tb-comissoes-pendentes')).not.toContainText('Studio M');
    await expect(page.locator('#total-comissoes-pendentes')).toHaveText('R$ 50.00');

    await page.click('.vend-tipo-btn[data-tipo="arquiteto"]');
    await expect(page.locator('#tb-comissoes-pendentes')).toContainText('Studio M');
    await expect(page.locator('#tb-comissoes-pendentes')).not.toContainText('Ana');
    await expect(page.locator('#total-comissoes-pendentes')).toHaveText('R$ 200.00');
    await expect(page.locator('#tab-vend-pendentes .vend-col-nome')).toHaveText('Arquiteto');
});

test('o filtro da aba lista so os cadastros daquele tipo', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    const opcoes = await page.locator('#filtro-vend-pendente option').allInnerTexts();
    expect(opcoes).toEqual(['Todos os arquitetos', 'Studio M']);
});

test('Pagar Todas na aba Arquitetos nao paga comissao de vendedor', async ({ page }) => {
    await abrir(page, 'vendedores.html?tipo=arquiteto');
    await page.click('.vend-tab-btn[data-tab="pendentes"]');
    await page.click('button:has-text("Pagar Todas")');
    await confirmarModal(page);
    const peds = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')));
    expect(peds.find(p => p.id === 26002).comissao_paga, 'a do arquiteto foi paga').toBe(true);
    expect(peds.find(p => p.id === 26001).comissao_paga, 'a da vendedora, nao').toBeFalsy();
});

test('o historico mostra so os pagamentos do tipo da aba', async ({ page }) => {
    await abrir(page);
    await page.click('.vend-tab-btn[data-tab="historico"]');
    await expect(page.locator('#tb-hist-comissoes')).toContainText('Nenhum pagamento registrado');
    await page.click('.vend-tipo-btn[data-tipo="arquiteto"]');
    await expect(page.locator('#tb-hist-comissoes')).toContainText('Studio M');
});

// --- Pedido -----------------------------------------------------------------

test('no pedido, o campo Vendedor oferece vendedores e arquitetos em grupos', async ({ page }) => {
    await abrir(page, 'pedido.html');
    const grupos = await page.locator('#ped-vendedor optgroup').evaluateAll(gs =>
        gs.map(g => ({ label: g.label, nomes: [...g.querySelectorAll('option')].map(o => o.textContent) })));
    expect(grupos).toEqual([
        { label: 'Vendedores', nomes: ['Ana (5%)', 'Bruno (4%)'] },
        { label: 'Arquitetos', nomes: ['Studio M (10%)'] },
    ]);
});

test('escolher um arquiteto no pedido calcula a comissao dele', async ({ page }) => {
    await abrir(page, 'pedido.html');
    await page.selectOption('#ped-vendedor', '3');
    const r = await page.evaluate(() => {
        pedidoDraft.itens = [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 1000, subtotal: 1000 }];
        atualizarTotalPedido();
        return document.getElementById('ped-comissao-val').textContent;
    });
    expect(r).toBe('100.00');
});

test('o campo RT livre saiu do pedido', async ({ page }) => {
    await abrir(page, 'pedido.html');
    expect(await page.locator('#ped-arquiteto').count()).toBe(0);
    expect(await page.locator('#ped-rt').count()).toBe(0);
});

test('editar um pedido antigo com RT nao apaga a RT dele', async ({ page }) => {
    const antigo = {
        id: 25001, clienteId: 9, clienteNome: 'Cli Antigo', status: 'Orçamento', valor: 100,
        ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [],
        arquiteto_nome: 'Arq. Livre', rt_pct: 7,
    };
    // Direto para pedido.html: outra tela no meio consumiria sc_editando_id e o
    // formulario abriria um pedido novo, sem nada a preservar.
    await abrir(page, 'pedido.html', {
        sc_ped: [antigo], sc_cli: [{ id: 9, nome: 'Cli Antigo' }], sc_editando_id: 25001,
    });
    // O ambiente semeado nao passou pelo "Calcular Consumo"; marca como
    // calculado para a gravacao seguir. Nao aguarda: salvar pode abrir modal.
    await page.evaluate(() => {
        pedidoDraft.ambientes.forEach(a => { a.calculado = true; });
        salvarPedido();
    });
    // Depois de gravar, a tela volta para o painel inicial.
    await page.waitForURL(/index\.html/, { timeout: 15000 });
    const p = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')).find(x => x.id === 25001));
    expect(p.vendedor_nome, 'o pedido foi regravado pelo formulario').toBe('');
    expect(p.arquiteto_nome).toBe('Arq. Livre');
    expect(p.rt_pct).toBe(7);
});
