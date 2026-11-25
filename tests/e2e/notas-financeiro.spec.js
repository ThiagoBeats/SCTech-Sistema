// Entrega 4 (notas fiscais), tarefa 3: lista "Notas fiscais" no financeiro (Lancamentos > Contas a receber), selo "NF no X" na conta a receber.
// Relogio fixo: 25/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8260';
const HOJE = new Date('2026-11-25T12:00:00');
const CDN = /cdn\.jsdelivr\.net\/npm\/xlsx/;
const STUB = `window.XLSX = { utils: { book_new: () => ({ abas: [] }),
    aoa_to_sheet: aoa => ({ aoa }),
    book_append_sheet: (wb, ws, nome) => wb.abas.push({ nome, aoa: ws.aoa }) },
    writeFile: (wb, nome) => { window.__xlsx = { nome, wb }; } };`;

const CLIENTES = [{ id: 1, nome: 'Maria da Silva' }, { id: 2, nome: 'Paulo Souza' }, { id: 3, nome: 'Rita Alves' }];
const PEDIDOS = [
    { id: 26401, clienteId: 1, clienteNome: 'Maria da Silva', status: 'Medição', valor: 1000, ambientes: [] },
    { id: 26402, clienteId: 2, clienteNome: 'Paulo Souza', status: 'Medição', valor: 500, ambientes: [] },
    { id: 26403, clienteId: 3, clienteNome: 'Rita Alves', status: 'Medição', valor: 300, ambientes: [] },
];
const nota = (id, ped, cli, tipo, numero, data, valor, status) => ({ id, pedido_id: ped, tipo, numero, serie: tipo === 'nfe' ? '1' : '', chave: null, codigo_verificacao: null, data_emissao: data, valor, cliente_id: cli, status, protocolo: null, eventos: [], xml_nome: 'n.xml', xml: '<x/>', pdf_nome: '', pdf: null, origem: 'manual', criado_em: '2026-11-10T10:00:00.000Z', criado_por: 1 });
const NOTAS = [
    nota(1, 26401, 1, 'nfse', '101', '2026-11-05', 1000, 'autorizada'),
    nota(2, 26402, 2, 'nfe', '202', '2026-11-12', 500, 'autorizada'),
    nota(3, 26403, 3, 'nfse', '303', '2026-11-15', 300, 'cancelada'),
    nota(4, 26401, 1, 'nfse', '99', '2026-10-20', 777, 'autorizada'),
];
const CR = [{ id: 1, pedido_id: 26401, cliente_nome: 'Maria da Silva', descricao: 'Entrada', valor: 100, status: 'Pendente', data_vencimento: '2026-11-30', data_competencia: '2026-11-30', categoria_id: 'cat_vendas', data_pagamento: null, historico: [] },
    { id: 2, pedido_id: 26403, cliente_nome: 'Rita Alves', descricao: 'Entrada Rita', valor: 100, status: 'Pendente', data_vencimento: '2026-11-30', data_competencia: '2026-11-30', categoria_id: 'cat_vendas', data_pagamento: null, historico: [] }];

async function abrir(page, extras) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, Object.assign({ sc_ped: PEDIDOS, sc_cli: CLIENTES, sc_nf: NOTAS, sc_cr: CR }, extras || {}));
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
}
const abrirLista = async page => { await page.locator('#lanc-notas').click(); await expect(page.locator('#nf-lista-janela')).toBeVisible(); };
const linhas = page => page.locator('#nfl-tbody tr.nf-lista-linha');

test('lista: mes atual por padrao, colunas, total so das autorizadas e filtros', async ({ page }) => {
    await abrir(page);
    await abrirLista(page);
    await expect(page.locator('#nfl-de')).toHaveValue('2026-11-01');
    await expect(page.locator('#nfl-ate')).toHaveValue('2026-11-30');
    await expect(page.locator('#nf-lista-janela thead th')).toHaveText(['Número', 'Tipo', 'Cliente', 'Pedido', 'Data', 'Valor', 'Status']);
    await expect(linhas(page)).toHaveCount(3);
    await expect(linhas(page).nth(0)).toContainText('303');
    await expect(linhas(page).nth(2)).toContainText('NFS-e');
    await expect(linhas(page).nth(2)).toContainText('Maria da Silva');
    await expect(linhas(page).nth(2)).toContainText('#26401');
    await expect(linhas(page).nth(2)).toContainText('05/11/2026');
    await expect(linhas(page).nth(2)).toContainText('1.000,00');
    await expect(page.locator('#nfl-total')).toContainText('1.500,00');
    await page.locator('#nfl-status').selectOption('cancelada');
    await expect(linhas(page)).toHaveCount(1);
    await expect(page.locator('#nfl-total')).toContainText('0,00');
    await page.locator('#nfl-status').selectOption('');
    await page.locator('#nfl-tipo').selectOption('nfe');
    await expect(linhas(page)).toHaveCount(1);
    await expect(linhas(page)).toContainText('202');
    await page.locator('#nfl-tipo').selectOption('');
    await page.locator('#nfl-busca').fill('rita');
    await expect(linhas(page)).toHaveCount(1);
    await page.locator('#nfl-busca').fill('101');
    await expect(linhas(page)).toHaveCount(1);
    await page.locator('#nfl-busca').fill('');
    await page.locator('#nfl-de').fill('2026-10-01');
    await expect(linhas(page)).toHaveCount(4);
    await expect(page.locator('#nfl-total')).toContainText('2.277,00');
});

test('clicar na nota abre a janela do pedido certo', async ({ page }) => {
    await abrir(page);
    await abrirLista(page);
    await linhas(page).filter({ has: page.locator('td:first-child', { hasText: /^202$/ }) }).click();
    await expect(page.locator('#nf-janela h3')).toHaveText('Notas fiscais — Pedido #26402');
});

test('selo NF no X na conta a receber do pedido com nota (nao no pedido sem nota nem no cancelado)', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#tb-contas-receber tr', { hasText: 'Entrada' }).first().locator('.nf-selo-lanc')).toHaveText(/NF nº 101, 99/);
    await expect(page.locator('#tb-contas-receber tr', { hasText: 'Entrada Rita' }).locator('.nf-selo-lanc')).toHaveCount(0);
});

test('botao Notas fiscais so aparece em Contas a receber', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#lanc-notas')).toBeVisible();
    await page.locator('.fin-lado-btn[data-lado="pagar"]').click();
    await expect(page.locator('#lanc-notas')).toBeHidden();
});

test('Vendedor com Contas a receber so visualizar ve a lista, sem Cancelar nota', async ({ page }) => {
    const papel = { id: 31, nome: 'So Ver', permissoes: { inicio: { nivel: 'completo', acoes_restritas: [] }, financeiro: { nivel: 'sem_acesso', acoes_restritas: [] }, 'financeiro.receber': { nivel: 'visualizar', acoes_restritas: [] } } };
    const usu = [{ id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
        { id: 2, nome: 'Leitor', email: 'leitor@sctech.local', papel_id: 31, ativo: true, permissoes_extras: {}, senha_hash: '' }];
    await abrir(page, { sc_usr: usu });
    await page.evaluate(p => { localStorage.setItem('sc_pap', JSON.stringify([...papeisPadrao(), p])); sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'leitor@sctech.local' })); }, papel);
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await abrirLista(page);
    await expect(linhas(page)).toHaveCount(3);
    await linhas(page).filter({ has: page.locator('td:first-child', { hasText: /^101$/ }) }).click();
    await expect(page.locator('#nf-janela h3')).toHaveText('Notas fiscais — Pedido #26401');
    await expect(page.locator('#nf-janela .nf-linha').first()).toBeVisible();
    await expect(page.locator('#nf-janela .nf-cancelar')).toHaveCount(0);
    await expect(page.locator('#nf-btn-emitir')).toHaveCount(0);
});

test('Excel da lista filtrada (stub XLSX)', async ({ page }) => {
    await page.route(CDN, r => r.fulfill({ contentType: 'application/javascript', body: STUB }));
    await abrir(page);
    await abrirLista(page);
    await page.locator('#nfl-excel').click();
    await page.waitForFunction(() => window.__xlsx);
    const x = await page.evaluate(() => window.__xlsx);
    expect(x.nome).toBe('Notas_fiscais_2026-11-01_a_2026-11-30.xlsx');
    const aoa = x.wb.abas[0].aoa;
    expect(aoa[1]).toEqual(['Notas fiscais']);
    expect(aoa[2]).toEqual(['Período: 01/11/2026 a 30/11/2026']);
    expect(aoa[4]).toEqual(['Número', 'Tipo', 'Cliente', 'Pedido', 'Data', 'Valor', 'Status']);
    expect(aoa).toContainEqual(['101', 'NFS-e', 'Maria da Silva', '#26401', '05/11/2026', 1000, 'Autorizada']);
    expect(aoa).toContainEqual(['Total das autorizadas', '', '', '', '', 1500]);
});
