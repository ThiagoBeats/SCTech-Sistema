// Financeiro novo, entrega 3, tarefa 3: tela Fluxo de caixa (cartoes, grafico, movimentacoes, transferencias e relatorios).
// Relogio fixo em todos: 20/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 20, 10, 0, 0);
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const hist = [{ em: '2026-11-01T12:00:00.000Z', por: 1, porNome: 'Teste', acao: 'criado', detalhe: 'Lançamento manual' }];

// Mesmos dados do teste do nucleo: conta A (1.000 em 01/10), conta B (0); nov: +500 (CR), -200 (aluguel), transferencia A->B 300,
// uma CR de 400 a vencer em 25/11 (previsto) e uma CP cancelada que nao conta.
const CONTAS = [
    { id: 1, nome: 'A', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01', ativo: true },
    { id: 2, nome: 'B', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-10-01', ativo: true }
];
const MOVS = [
    { id: 1, conta_id: 1, data: '2026-11-05', sentido: 'entrada', valor: 500, origem: 'cr', origem_id: 1, grupo_id: null, descricao: 'Venda Ana' },
    { id: 2, conta_id: 1, data: '2026-11-10', sentido: 'saida', valor: 200, origem: 'cp', origem_id: 1, grupo_id: null, descricao: 'Aluguel de novembro' },
    { id: 3, conta_id: 1, data: '2026-11-12', sentido: 'saida', valor: 300, origem: 'transferencia', origem_id: null, grupo_id: 't1', descricao: 'Transferência para B' },
    { id: 4, conta_id: 2, data: '2026-11-12', sentido: 'entrada', valor: 300, origem: 'transferencia', origem_id: null, grupo_id: 't1', descricao: 'Transferência de A' },
    { id: 5, conta_id: 1, data: '2026-10-15', sentido: 'saida', valor: 50, origem: 'ajuste', origem_id: null, grupo_id: null, descricao: 'Ajuste de saldo' }
];
const CR = [
    { id: 1, cliente_nome: 'Ana', descricao: 'Venda Ana', valor: 500, status: 'Pago', data_vencimento: '2026-11-05', data_pagamento: '2026-11-05', data_competencia: '2026-11-05', categoria_id: 'cat_vendas', conta_id: 1, historico: hist },
    { id: 2, cliente_nome: 'Bia', descricao: 'Venda Bia', valor: 400, status: 'Pendente', data_vencimento: '2026-11-25', data_pagamento: null, data_competencia: '2026-11-25', categoria_id: 'cat_vendas', historico: hist }
];
const CP = [
    { id: 1, tipo: 'variavel', categoria: 'outro', credor_nome: 'Locador', descricao: 'Aluguel de novembro', valor: 200, status: 'Pago', data_vencimento: '2026-11-10', data_pagamento: '2026-11-10', data_competencia: '2026-11-10', categoria_id: 'cat_aluguel', conta_id: 1, historico: hist },
    { id: 2, tipo: 'variavel', categoria: 'outro', credor_nome: 'Locador', descricao: 'Cancelada', valor: 999, status: 'Cancelado', data_vencimento: '2026-11-26', data_pagamento: null, data_competencia: '2026-11-26', categoria_id: 'cat_aluguel', historico: hist }
];
const DADOS = { sc_contas_fin: CONTAS, sc_mov_fin: MOVS, sc_cr: CR, sc_cp: CP };

const STUB = `window.XLSX = { utils: { book_new: () => ({ abas: [] }),
    aoa_to_sheet: aoa => ({ aoa }),
    book_append_sheet: (wb, ws, nome) => wb.abas.push({ nome, aoa: ws.aoa }) },
    writeFile: (wb, nome) => { window.__xlsx = { nome, wb }; } };`;

async function abrir(page, dados, antes) {
    await page.clock.setFixedTime(HOJE);
    await page.addInitScript(() => {
        window.__html = '';
        window.__aberturas = 0;
        window.open = () => { window.__aberturas++; return { document: { write: h => { window.__html += h; }, close() {} } }; };
    });
    await page.route(/cdn\.jsdelivr\.net\/npm\/xlsx/, r => r.fulfill({ contentType: 'application/javascript', body: STUB }));
    await entrar(page, BASE, dados || DADOS);
    if (antes) await antes(page);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    await expect(page.locator('#fluxo-tabela')).toBeVisible();
}
const valor = (page, id) => page.locator('#fluxo-kpi-' + id + ' .res-kpi-valor');
const linhas = page => page.locator('#fluxo-linhas tr.fluxo-linha');
const rotulos = page => page.evaluate(() => Chart.getChart('fluxo-grafico').data.labels);
const soVisualizar = page => page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem('sc_usr'));
    u[0].papel_id = 4;
    u[0].permissoes_extras = { 'financeiro.fluxo': { nivel: 'visualizar', acoes_restritas: [] }, 'financeiro.receber': { nivel: 'visualizar', acoes_restritas: [] } };
    localStorage.setItem('sc_usr', JSON.stringify(u));
});

test('cartoes do mes: 950 / 500 / 200 / 1.250 e previsto ate 30/11', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#fin-fluxo')).not.toContainText('Versão provisória');
    await expect(page.locator('#fluxo-de')).toHaveValue('2026-11-01');
    await expect(page.locator('#fluxo-ate')).toHaveValue('2026-11-30');
    await expect(page.locator('#fluxo-agrupar-dia')).toHaveClass(/active/);
    await expect(valor(page, 'inicial')).toHaveText('R$ 950,00');
    await expect(valor(page, 'entradas')).toHaveText('R$ 500,00');
    await expect(valor(page, 'saidas')).toHaveText('R$ 200,00');
    await expect(valor(page, 'final')).toHaveText('R$ 1.250,00');
    await expect(page.locator('#fluxo-previsto')).toHaveText('Previsto até 30/11: R$ 1.650,00');
});

test('periodo que termina antes de hoje nao mostra o previsto; periodo invalido avisa', async ({ page }) => {
    await abrir(page);
    await page.fill('#fluxo-ate', '2026-11-18');
    await page.locator('#fluxo-ate').dispatchEvent('change');
    await expect(page.locator('#fluxo-previsto')).toHaveCount(0);
    await expect(valor(page, 'final')).toHaveText('R$ 1.250,00');
    await page.fill('#fluxo-ate', '2026-10-01');
    await page.locator('#fluxo-ate').dispatchEvent('change');
    await expect(page.locator('#fluxo-periodo-invalido')).toBeVisible();
});

test('filtrando a conta A: transferencia conta como saida dela', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-conta').selectOption('1');
    await expect(valor(page, 'saidas')).toHaveText('R$ 500,00');
    await expect(valor(page, 'entradas')).toHaveText('R$ 500,00');
    await expect(valor(page, 'final')).toHaveText('R$ 950,00');
    await expect(page.locator('#fluxo-conta')).toHaveValue('1');
    await page.locator('#fluxo-conta').selectOption('2');
    await expect(valor(page, 'entradas')).toHaveText('R$ 300,00');
});

test('filtrando por categoria: so o aluguel', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-categoria').selectOption('cat_aluguel');
    await expect(valor(page, 'saidas')).toHaveText('R$ 200,00');
    await expect(valor(page, 'entradas')).toHaveText('R$ 0,00');
    await expect(linhas(page)).toHaveCount(2);
    await expect(linhas(page).nth(1)).toContainText('Aluguel de novembro');
});

test('tabela: Saldo inicial no topo, transferencia marcada e linha prevista de 25/11 em cinza', async ({ page }) => {
    await abrir(page);
    await expect(linhas(page).first()).toContainText('Saldo inicial');
    await expect(linhas(page).first()).toContainText('950,00');
    const transf = page.locator('#fluxo-linhas tr.fluxo-transferencia');
    await expect(transf).toHaveCount(2);
    await expect(transf.first()).toContainText('Transferência');
    await expect(transf.first().locator('.fluxo-selo-transf')).toHaveText('Transferência');
    // consolidado: a transferencia nao entra nas colunas Entrada/Saida
    await expect(transf.first().locator('.fluxo-ent')).toHaveText('');
    const prev = page.locator('#fluxo-linhas tr.fluxo-previsto');
    await expect(prev).toHaveCount(1);
    await expect(prev).toContainText('25/11/2026');
    await expect(prev.locator('.fluxo-selo-prev')).toHaveText('Previsto');
    await expect(prev.locator('.fluxo-ent')).toHaveText('400,00');
    await expect(prev.locator('.fluxo-saldo')).toHaveText('1.650,00');
    // conta escolhida: a transferencia entra na coluna Saida
    await page.locator('#fluxo-conta').selectOption('1');
    await expect(page.locator('#fluxo-linhas tr.fluxo-transferencia .fluxo-sai')).toHaveText('300,00');
});

test('Ver por Semana e Mes muda os pontos do grafico; o previsto vai tracejado', async ({ page }) => {
    await abrir(page);
    let r = await rotulos(page);
    expect(r).toHaveLength(30);
    expect(r[0]).toBe('01/11');
    expect(await page.evaluate(() => Chart.getChart('fluxo-grafico').data.datasets.map(d => d.label))).toEqual(['Saldo', 'Entradas', 'Saídas']);
    const tracejado = await page.evaluate(() => { const s = Chart.getChart('fluxo-grafico').data.datasets[0].segment.borderDash; return [s({ p1DataIndex: 3 }), s({ p1DataIndex: 24 })]; });
    expect(tracejado[0]).toBeUndefined();
    expect(tracejado[1]).toEqual([6, 4]);
    await page.locator('#fluxo-agrupar-semana').click();
    r = await rotulos(page);
    expect(r[0]).toBe('Sem 26/10');
    expect(r[1]).toBe('Sem 02/11');
    expect(r.length).toBe(6);
    await page.locator('#fluxo-agrupar-mes').click();
    expect(await rotulos(page)).toEqual(['Nov/26']);
    expect(await page.evaluate(() => Chart.getChart('fluxo-grafico').data.datasets[0].data)).toEqual([1650]);
    await expect(page.locator('#fluxo-agrupar-mes')).toHaveAttribute('aria-pressed', 'true');
});

test('clicar numa linha de recebimento abre Lancamentos com a linha destacada', async ({ page }) => {
    await abrir(page);
    await linhas(page).filter({ hasText: 'Venda Ana' }).click();
    await expect(page.locator('#fin-lancamentos')).toBeVisible();
    await expect(page.locator('#fin-fluxo')).toBeHidden();
    await expect(page.locator('#tb-contas-receber tr.lanc-destaque')).toContainText('Ana');
});

test('clicar numa linha de pagamento abre o lado A pagar; transferencia e previsto nao abrem nada', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-linhas tr.fluxo-transferencia').first().locator('td').first().click();
    await page.locator('#fluxo-linhas tr.fluxo-previsto td').first().click();
    await expect(page.locator('#fin-fluxo')).toBeVisible();
    await linhas(page).filter({ hasText: 'Aluguel de novembro' }).click();
    await expect(page.locator('#tb-contas-pagar tr.lanc-destaque')).toContainText('Aluguel de novembro');
});

test('Transferir entre contas cria a transferencia e ela aparece na tabela', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-btn-transferir').click();
    const m = page.locator('#transf-modal');
    await expect(m).toBeVisible();
    await m.locator('#transf-de').selectOption('1');
    await m.locator('#transf-para').selectOption('2');
    await m.locator('#transf-valor').fill('100');
    await m.locator('#transf-ok').click();
    await expect(m).toHaveCount(0);
    const movs = (await ler(page, 'sc_mov_fin')).filter(x => x.origem === 'transferencia' && x.valor === 100);
    expect(movs).toHaveLength(2);
    expect(movs[0].grupo_id).toBe(movs[1].grupo_id);
    expect(movs[0].data).toBe('2026-11-20');
    await expect(page.locator('#fluxo-linhas tr.fluxo-transferencia')).toHaveCount(4);
    await expect(page.locator('#fluxo-linhas')).toContainText('Transferência para B');
    // consolidado: o total nao muda
    await expect(valor(page, 'final')).toHaveText('R$ 1.250,00');
    await page.locator('#fluxo-conta').selectOption('2');
    await expect(valor(page, 'final')).toHaveText('R$ 400,00');
});

test('transferencia: mesma conta nos dois lados e valor zero sao barrados no modal', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-btn-transferir').click();
    const m = page.locator('#transf-modal');
    await m.locator('#transf-de').selectOption('1');
    await m.locator('#transf-para').selectOption('1');
    await m.locator('#transf-valor').fill('10');
    await m.locator('#transf-ok').click();
    await expect(m.locator('#transf-erro')).toContainText('diferente da origem');
    await m.locator('#transf-para').selectOption('2');
    await m.locator('#transf-valor').fill('0');
    await m.locator('#transf-ok').click();
    await expect(m.locator('#transf-erro')).toContainText('valor');
    await page.keyboard.press('Escape');
    await expect(m).toHaveCount(0);
    expect(await ler(page, 'sc_mov_fin')).toHaveLength(MOVS.length);
});

test('Excluir transferencia pelo menu remove os dois lados', async ({ page }) => {
    await abrir(page);
    await acaoMenu(page, page.locator('#fluxo-linhas tr.fluxo-transferencia').first(), 'Excluir transferência');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_mov_fin')).length).toBe(MOVS.length - 2);
    await expect(page.locator('#fluxo-linhas tr.fluxo-transferencia')).toHaveCount(0);
    await expect(valor(page, 'final')).toHaveText('R$ 1.250,00');
});

test('com Fluxo so para visualizar: sem Transferir, Importar, Conciliar nem menu; Relatorios continua', async ({ page }) => {
    await abrir(page, DADOS, soVisualizar);
    await expect(linhas(page)).toHaveCount(6);
    await expect(page.locator('#fluxo-btn-transferir')).toHaveCount(0);
    await expect(page.locator('#fluxo-btn-importar')).toHaveCount(0);
    await expect(page.locator('#fluxo-btn-conciliar')).toHaveCount(0);
    await expect(page.locator('#fluxo-linhas .btn-acoes')).toHaveCount(0);
    await expect(page.locator('#fluxo-btn-relatorios')).toBeVisible();
    await page.evaluate(() => { excluirTransferencia('t1'); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await page.locator('#sc-modal-ok').click();
    expect(await ler(page, 'sc_mov_fin')).toEqual(MOVS);
});

test('Importar extrato abre a janela; Conciliar abre a tela da conta', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-btn-importar').click();
    await expect(page.locator('#conc-imp-modal')).toBeVisible();
    await page.locator('#conc-imp-cancel').click();
    await expect(page.locator('#conc-imp-modal')).toHaveCount(0);
    await page.locator('#fluxo-btn-conciliar').click();
    await expect(page.locator('#conc-overlay')).toBeVisible();
    await expect(page.locator('#conc-vazio')).toContainText('Nenhum extrato importado');
    await page.locator('#conc-fechar').click();
    await expect(page.locator('#conc-overlay')).toHaveCount(0);
});

test('linha "Conferido com o extrato ate" das contas com extrato conciliado', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#fluxo-conferido')).toHaveCount(0);
    await page.evaluate(() => {
        db.fin_extrato = [{ id: 1, conta_id: 1, fitid: 'a', data: '2026-11-05', valor: 500, descricao: 'x', situacao: 'conciliado', mov_id: 1 },
            { id: 2, conta_id: 1, fitid: 'b', data: '2026-11-10', valor: -200, descricao: 'y', situacao: 'conciliado', mov_id: 2 },
            { id: 3, conta_id: 1, fitid: 'c', data: '2026-11-15', valor: -5, descricao: 'z', situacao: 'pendente', mov_id: null }];
        renderFinFluxo();
    });
    await expect(page.locator('#fluxo-conferido')).toContainText('A · Conferido com o extrato até 10/11');
    await expect(page.locator('#fluxo-conferido')).not.toContainText('B ·');
});

test('mes antes da abertura da conta mostra 0 e avisa a data de abertura', async ({ page }) => {
    const nova = { id: 1, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 500, data_saldo_inicial: '2026-11-20', ativo: true };
    await abrir(page, { sc_contas_fin: [nova] });
    await page.fill('#fluxo-de', '2026-10-01');
    await page.locator('#fluxo-de').dispatchEvent('change');
    await page.fill('#fluxo-ate', '2026-10-31');
    await page.locator('#fluxo-ate').dispatchEvent('change');
    await expect(valor(page, 'inicial')).toHaveText('R$ 0,00');
    await expect(valor(page, 'final')).toHaveText('R$ 0,00');
    await expect(page.locator('#fluxo-aviso-abertura')).toContainText('conta aberta em 20/11/2026');
    await page.fill('#fluxo-de', '2026-11-01');
    await page.locator('#fluxo-de').dispatchEvent('change');
    await page.fill('#fluxo-ate', '2026-11-30');
    await page.locator('#fluxo-ate').dispatchEvent('change');
    await expect(valor(page, 'final')).toHaveText('R$ 500,00');
    await expect(page.locator('#fluxo-linhas')).toContainText('Abertura da conta Caixa');
});

test('recebimentos sem conta do periodo sao avisados', async ({ page }) => {
    const sem = { id: 9, cliente_nome: 'Cia', descricao: 'Antigo', valor: 750, status: 'Pago', data_vencimento: '2026-11-03', data_pagamento: '2026-11-03', data_competencia: '2026-11-03', categoria_id: 'cat_vendas', historico: hist };
    await abrir(page, { ...DADOS, sc_cr: [...CR, sem] });
    await expect(page.locator('#fluxo-aviso-sem-conta')).toHaveText('1 recebimento sem conta (R$ 750,00) não aparece aqui');
    await page.locator('#fluxo-conta').selectOption('1');
    await expect(page.locator('#fluxo-aviso-sem-conta')).toHaveCount(0);
});

// ---- Relatorios ----
async function abrirRel(page) {
    await abrir(page);
    await page.locator('#fluxo-btn-relatorios').click();
    await expect(page.locator('#fluxo-rel-tabela')).toBeVisible();
}

test('relatorio Entradas e saidas por categoria: Aluguel 200, Vendas 500 e exporta o Excel', async ({ page }) => {
    await abrirRel(page);
    await expect(page.locator('#fluxo-rel-titulo')).toHaveText('Entradas e saídas por categoria');
    await expect(page.locator('#fluxo-rel-de')).toHaveValue('2026-11-01');
    const aluguel = page.locator('#fluxo-rel-tabela tr', { hasText: 'Aluguel' });
    await expect(aluguel).toContainText('200,00');
    await expect(page.locator('#fluxo-rel-tabela tr', { hasText: 'Vendas de pedidos' })).toContainText('500,00');
    await expect(page.locator('#fluxo-rel-tabela tr', { hasText: 'Entradas menos saídas' })).toContainText('300,00');
    await page.locator('#fluxo-rel-excel').click();
    await page.waitForFunction(() => window.__xlsx);
    const x = await page.evaluate(() => window.__xlsx);
    expect(x.nome).toBe('Fluxo_categoria_2026-11-01_2026-11-30.xlsx');
    expect(x.wb.abas[0].aoa.some(l => String(l[0]).includes('Regime'))).toBe(false);
    const aoa = x.wb.abas[0].aoa;
    expect(aoa.some(l => String(l[0]).trim() === 'Aluguel' && l[1] === 200)).toBe(true);
    expect(aoa.some(l => String(l[0]).includes('Período: 01/11/2026 a 30/11/2026 · Todas as contas'))).toBe(true);
    expect(aoa.some(l => String(l[0]).includes('não é a DRE'))).toBe(true);
});

test('relatorio por categoria fecha com os cartoes: aporte de 10.000 (so caixa) entra, com e sem filtro de conta', async ({ page }) => {
    const aporte = { id: 3, cliente_nome: 'Socio', descricao: 'Aporte', valor: 10000, status: 'Pago', data_vencimento: '2026-11-08', data_pagamento: '2026-11-08', data_competencia: '2026-11-08', categoria_id: 'cat_aporte', conta_id: 1, historico: hist };
    const mAporte = { id: 6, conta_id: 1, data: '2026-11-08', sentido: 'entrada', valor: 10000, origem: 'cr', origem_id: 3, grupo_id: null, descricao: 'Aporte' };
    const ajuste = { id: 7, conta_id: 2, data: '2026-11-15', sentido: 'saida', valor: 20, origem: 'ajuste', origem_id: null, grupo_id: null, descricao: 'Ajuste' };
    await abrir(page, { ...DADOS, sc_cr: [...CR, aporte], sc_mov_fin: [...MOVS, mAporte, ajuste] });
    await expect(valor(page, 'entradas')).toHaveText('R$ 10.500,00');
    await expect(valor(page, 'saidas')).toHaveText('R$ 220,00');
    await page.locator('#fluxo-btn-relatorios').click();
    const tr = t => page.locator('#fluxo-rel-tabela tr', { hasText: t });
    await expect(tr('Total de entradas')).toContainText('10.500,00');
    await expect(tr('Total de saídas')).toContainText('220,00');
    await expect(tr('Aporte de capital')).toContainText('10.000,00');
    await expect(tr('Só caixa').first()).toContainText('10.000,00');
    await expect(tr('Ajustes de saldo')).toContainText('20,00');
    await expect(page.locator('#fluxo-rel-tabela')).not.toContainText('Transferências');
    await page.locator('#fluxo-rel-fechar').click();
    await page.locator('#fluxo-conta').selectOption('1');
    await expect(valor(page, 'entradas')).toHaveText('R$ 10.500,00');
    await expect(valor(page, 'saidas')).toHaveText('R$ 500,00');
    await page.locator('#fluxo-btn-relatorios').click();
    await expect(tr('Total de entradas')).toContainText('10.500,00');
    await expect(tr('Total de saídas')).toContainText('500,00');
    await expect(tr('Transferências')).toContainText('300,00');
    await expect(page.locator('#fluxo-rel-meta')).toContainText('· A');
});

test('relatorio Contas a pagar e a receber por periodo: em aberto e pagas por vencimento', async ({ page }) => {
    await abrirRel(page);
    await page.locator('#fluxo-rel-tipo-contas').click();
    await expect(page.locator('#fluxo-rel-titulo')).toHaveText('Contas a pagar e a receber por período');
    const nov = page.locator('#fluxo-rel-tabela tbody tr', { hasText: 'Nov/26' });
    // a receber em aberto 400, recebido 500, a pagar em aberto 0 (a cancelada nao conta), pago 200
    await expect(nov.locator('td')).toHaveText(['400,00', '500,00', '0,00', '200,00']);
    await expect(page.locator('#fluxo-rel-tabela tbody tr', { hasText: 'Total' }).locator('td').first()).toHaveText('400,00');
});

test('relatorio Evolucao mensal do saldo: 12 meses ate o mes atual', async ({ page }) => {
    await abrirRel(page);
    await page.locator('#fluxo-rel-tipo-evolucao').click();
    await expect(page.locator('#fluxo-rel-titulo')).toHaveText('Evolução mensal do saldo');
    await expect(page.locator('#fluxo-rel-grupo-de')).toBeHidden();
    const trs = page.locator('#fluxo-rel-tabela tbody tr');
    await expect(trs).toHaveCount(12);
    await expect(trs.first().locator('th')).toHaveText('Dez/25');
    await expect(trs.last().locator('th')).toHaveText('Nov/26');
    // novembro: inicial 950, +500, -200, final 1.250 (so realizado, ate hoje)
    await expect(trs.last().locator('td')).toHaveText(['950,00', '500,00', '200,00', '1.250,00']);
    await page.locator('#fluxo-rel-excel').click();
    await page.waitForFunction(() => window.__xlsx);
    expect((await page.evaluate(() => window.__xlsx)).nome).toBe('Fluxo_evolucao_2026-11-20.xlsx');
});

test('relatorio: PDF e Imprimir abrem a janela clara; periodo invalido avisa; Escape fecha', async ({ page }) => {
    await abrirRel(page);
    await page.locator('#fluxo-rel-pdf').click();
    await page.locator('#fluxo-rel-imprimir').click();
    expect(await page.evaluate(() => window.__aberturas)).toBe(2);
    const html = await page.evaluate(() => window.__html);
    expect(html).toContain('doc-claro');
    expect(html).toContain('Entradas e saídas por categoria');
    expect(html).toContain('Aluguel');
    expect(html.match(/Salvar como PDF/g)).toHaveLength(1);
    await page.fill('#fluxo-rel-ate', '2026-10-01');
    await page.locator('#fluxo-rel-ate').dispatchEvent('change');
    await expect(page.locator('#fluxo-rel-corpo')).toContainText('Período inválido');
    await page.keyboard.press('Escape');
    await expect(page.locator('#fluxo-rel-overlay')).toHaveCount(0);
    await expect(page.locator('#fluxo-btn-relatorios')).toBeFocused();
});

// ---- Aparencia ----
test('390px: sem rolagem horizontal da pagina', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await abrir(page);
    await expect(valor(page, 'final')).toBeVisible();
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sobra).toBeLessThanOrEqual(0);
    await page.locator('#fluxo-btn-relatorios').click();
    await expect(page.locator('#fluxo-rel-tabela')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('tema escuro: grafico e cartoes legiveis', async ({ page }) => {
    await abrir(page, DADOS, p => p.evaluate(() => localStorage.setItem('sc_tema', 'dark')));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const cores = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const g = Chart.getChart('fluxo-grafico');
        return { muted: css.getPropertyValue('--muted').trim(), legenda: g.options.plugins.legend.labels.color, eixo: g.options.scales.y.ticks.color,
            fundoCartao: getComputedStyle(document.querySelector('#fluxo-kpi-final')).backgroundColor, textoCartao: getComputedStyle(document.querySelector('#fluxo-kpi-final .res-kpi-valor')).color };
    });
    expect(cores.legenda).toBe(cores.muted);
    expect(cores.eixo).toBe(cores.muted);
    const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    expect(lum(cores.textoCartao)).toBeGreaterThan(lum(cores.fundoCartao) + 100);
});
