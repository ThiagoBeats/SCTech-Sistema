// Pendencias R1, tarefa 4: cartao e meios de pagamento (baixa sem conta, taxas digitadas, plano/entrada,
// meio apagado, padroes, "Cartao que cai hoje" liquido, conta do meio de cartao).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somarDias = (dataISO, dias) => { const d = new Date(dataISO + 'T12:00:00'); d.setDate(d.getDate() + dias); return iso(d); };
const HOJE = iso(new Date());

const CARTAO = { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 };
const CAIXA = { id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true };
const BANCO = { id: 11, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true };
const MAQ = { id: 12, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true, cartao: CARTAO };
const MEIOS = [
    { id: 22, nome: 'PIX', tipo: 'pix', conta_id: 11 },
    { id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: 12 }
];
const cr = extra => ({ id: 601, pedido_id: null, cliente_nome: 'Ana', descricao: 'Saldo', valor: 1000, data_vencimento: '2099-12-10',
    data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });

async function baixarComCartao(page, dados) {
    await entrar(page, BASE, dados);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.locator('#tb-contas-receber button', { hasText: '✓ Recebido' }).first().click();
    const modal = page.locator('#baixa-modal');
    await modal.locator('.baixa-linha').first().locator('.baixa-meio').selectOption({ label: 'Cartão de crédito' });
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].status).toBe('Pago');
}

test('baixa com cartao em maquininha que ainda nao abriu: sem movimento, mas a taxa existe', async ({ page }) => {
    const futura = { ...MAQ, data_saldo_inicial: '2099-01-01' };
    await baixarComCartao(page, { sc_contas_fin: [CAIXA, BANCO, futura], sc_meios_pag: MEIOS, sc_cr: [cr()], sc_cp: [] });
    expect((await ler(page, 'sc_mov_fin')) || []).toHaveLength(0);
    const cps = await ler(page, 'sc_cp');
    expect(cps).toHaveLength(1);
    expect(cps[0]).toMatchObject({ categoria: 'taxa_cartao', status: 'Pago', valor: 30, origem_cr_id: 601, data_pagamento: somarDias(HOJE, 30) });
    // Sem movimento: as datas dos repasses ficam guardadas na conta a receber (o Resultado le daqui)
    expect((await ler(page, 'sc_cr'))[0].cartao.repasses).toEqual([{ data: somarDias(HOJE, 30), bruto: 1000 }]);
});

test('baixa com cartao sem conta no meio: a taxa continua existindo', async ({ page }) => {
    const meios = [{ id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: null }];
    await baixarComCartao(page, { sc_contas_fin: [CAIXA, BANCO, MAQ], sc_meios_pag: meios, sc_cr: [cr()], sc_cp: [] });
    const cps = await ler(page, 'sc_cp');
    expect(cps).toHaveLength(1);
    expect(cps[0]).toMatchObject({ categoria: 'taxa_cartao', valor: 30, conta_id: null });
});

test('taxa digitada com virgula e formato US vale como numero ao salvar a conta', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA, MAQ], sc_meios_pag: MEIOS });
    await page.goto(BASE + '/empresa.html#preferencias');
    const linha = page.locator('#emp-contas .conta-linha').nth(1);
    await linha.locator('.conta-cartao-debito_taxa').fill('1,5');
    await linha.locator('.conta-cartao-credito_taxa').fill('1,250.50');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    await expect.poll(async () => (await ler(page, 'sc_contas_fin')).find(c => c.id === 12).cartao.credito_taxa).toBe(1250.5);
    expect((await ler(page, 'sc_contas_fin')).find(c => c.id === 12).cartao.debito_taxa).toBe(1.5);
});

test('padroes do cartao vem so do CaixaCore', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/empresa.html#preferencias');
    const r = await page.evaluate(() => ({ cfg: typeof CARTAO_PADRAO_CFG, core: CaixaCore.CARTAO_PADRAO.credito_taxa }));
    expect(r).toEqual({ cfg: 'undefined', core: 3 });
});

// ---- Pedido: entrada vazia, meio apagado, entrada 0% ----
const CLI = [{ id: 9, nome: 'Cli Teste' }];
async function abrirPedido(page, extras) {
    await entrar(page, BASE, { sc_cli: CLI, sc_contas_fin: [CAIXA, BANCO, MAQ], sc_meios_pag: MEIOS, ...(extras || {}) });
    await page.goto(BASE + '/pedido.html');
}

test('entrada vazia: saldo some se o plano e 100% (mesma regra do salvar)', async ({ page }) => {
    await abrirPedido(page, { sc_formas_pag: [{ nome: 'Tudo na aprovacao', desconto: 0, entrada: 100 }] });
    await expect(page.locator('#ped-entrada-pct')).toHaveValue('100');
    await expect(page.locator('#ped-grupo-saldo')).toBeHidden();
    await page.fill('#ped-entrada-pct', '');
    await expect(page.locator('#ped-grupo-saldo')).toBeHidden();
});

test('entrada vazia: plano de 40% mantem o saldo visivel', async ({ page }) => {
    await abrirPedido(page, { sc_formas_pag: [{ nome: 'Plano 40', desconto: 0, entrada: 40 }] });
    await page.fill('#ped-entrada-pct', '');
    await expect(page.locator('#ped-grupo-saldo')).toBeVisible();
    await expect(page.locator('#ped-grupo-entrada')).toBeVisible();
});

test('meio que foi apagado reabre pedindo para escolher, nao "a definir"', async ({ page }) => {
    const ped = { id: 26400, clienteId: 9, clienteNome: 'Cli Teste', status: 'Orçamento', valor: 1000, forma_pagamento: 'PIX',
        entrada_pct: 50, meio_entrada: { meio_id: 999, vezes: 1, antecipar: false }, meio_saldo: { meio_id: 22, vezes: 1, antecipar: false },
        ambientes: [{ nome: 'Sala', calculado: true, tecidos: [] }], itens: [], data_entrega: '2099-12-01' };
    await abrirPedido(page, { sc_ped: [ped], sc_editando_id: 26400 });
    await expect(page.locator('#ped-meio-entrada')).toHaveValue('');
    expect(await page.locator('#ped-meio-entrada option').first().innerText()).toContain('escolha o meio');
    expect(await page.locator('#ped-meio-saldo option').first().innerText()).toContain('a definir');
});

test('entrada 0% esconde o meio da entrada', async ({ page }) => {
    await abrirPedido(page);
    await page.fill('#ped-entrada-pct', '0');
    await expect(page.locator('#ped-grupo-entrada')).toBeHidden();
    await expect(page.locator('#ped-grupo-saldo')).toBeVisible();
    await page.fill('#ped-entrada-pct', '30');
    await expect(page.locator('#ped-grupo-entrada')).toBeVisible();
});

// ---- Hoje: liquido ----
test('Cartao que cai hoje mostra o liquido', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA, MAQ], sc_meios_pag: MEIOS,
        sc_mov_fin: [
            { id: 1, conta_id: 12, data: HOJE, sentido: 'entrada', valor: 100, origem: 'cr', origem_id: 9, grupo_id: 5, descricao: 'Repasse X' },
            { id: 2, conta_id: 12, data: HOJE, sentido: 'saida', valor: 3, origem: 'cp', origem_id: 8, grupo_id: 5, descricao: 'Taxa' }] });
    await page.goto(BASE + '/financeiro.html');
    const g = page.locator('#hoje-tarefas .hoje-grupo[data-grupo="cartao-hoje"]');
    await expect(g).toContainText('97,00');
    await expect(g).toContainText('líquido');
    await expect(g).not.toContainText('100,00');
});

// ---- Meios: conta do cartao so maquininha ----
test('meio de cartao lista so contas maquininha; trocar o tipo limpa conta que nao serve', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA, BANCO, MAQ], sc_meios_pag: MEIOS });
    await page.goto(BASE + '/empresa.html#preferencias');
    const cartao = page.locator('#emp-meios .meio-linha').nth(1);
    expect(await cartao.locator('.meio-conta option').allInnerTexts()).toEqual(['(sem conta)', 'Maquininha']);
    const pix = page.locator('#emp-meios .meio-linha').nth(0);
    expect(await pix.locator('.meio-conta option').allInnerTexts()).toEqual(['(sem conta)', 'Caixa', 'Banco', 'Maquininha']);
    await pix.locator('.meio-tipo').selectOption('cartao_debito');
    expect(await page.locator('#emp-meios .meio-linha').nth(0).locator('.meio-conta option').allInnerTexts()).toEqual(['(sem conta)', 'Maquininha']);
    await expect(page.locator('#emp-meios .meio-linha').nth(0).locator('.meio-conta')).toHaveValue('');
});

test('estorno de baixa com cartao sem conta remove a conta de taxa e nao deixa sobra', async ({ page }) => {
    const meios = [{ id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: null }];
    await baixarComCartao(page, { sc_contas_fin: [CAIXA, BANCO, MAQ], sc_meios_pag: meios, sc_cr: [cr()], sc_cp: [] });
    expect(await ler(page, 'sc_cp')).toHaveLength(1);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="receber"]').click();
    await page.locator('#tb-contas-receber button', { hasText: 'Estornar' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].status).not.toBe('Pago');
    expect(await ler(page, 'sc_cp')).toHaveLength(0);
    expect((await ler(page, 'sc_mov_fin')) || []).toHaveLength(0);
});

test('aviso de meio removido some ao escolher um meio valido', async ({ page }) => {
    const ped = { id: 26400, clienteId: 9, clienteNome: 'Cli Teste', status: 'Orçamento', valor: 1000, forma_pagamento: 'PIX',
        entrada_pct: 50, meio_entrada: { meio_id: 999, vezes: 1, antecipar: false }, meio_saldo: null,
        ambientes: [{ nome: 'Sala', calculado: true, tecidos: [] }], itens: [], data_entrega: '2099-12-01' };
    await abrirPedido(page, { sc_ped: [ped], sc_editando_id: 26400 });
    const sel = page.locator('#ped-meio-entrada');
    await expect(sel).toHaveClass(/meio-removido/);
    await sel.selectOption('22');
    await expect(sel).not.toHaveClass(/meio-removido/);
    expect(await sel.evaluate(e => e.style.borderColor)).toBe('');
    expect(await sel.locator('option').first().innerText()).toContain('a definir');
});

test('meio de cartao salvo com conta que nao e maquininha mostra (sem conta) e salva sem conta', async ({ page }) => {
    const meios = [{ id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: 11 }];
    await entrar(page, BASE, { sc_contas_fin: [CAIXA, BANCO, MAQ], sc_meios_pag: meios });
    await page.goto(BASE + '/empresa.html#preferencias');
    await expect(page.locator('#emp-meios .meio-linha').first().locator('.meio-conta')).toHaveValue('');
    await page.click('#emp-meios-card button:has-text("Salvar meios")');
    await expect.poll(async () => (await ler(page, 'sc_meios_pag'))[0].conta_id).toBeNull();
});
