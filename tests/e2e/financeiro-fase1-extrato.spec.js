// Financeiro Fase 1, tarefa 9: movimentos por conta e periodo, saldos no inicio e no fim e transferencia entre contas.
// Desde a entrega 3 do Financeiro novo isso vive no Fluxo de caixa (o Extrato provisorio saiu); fin-fluxo.spec.js cobre a tela.
const { test, expect } = require('@playwright/test');
const { entrar, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somarDias = (dataISO, dias) => { const d = new Date(dataISO + 'T12:00:00'); d.setDate(d.getDate() + dias); return iso(d); };
const HOJE = iso(new Date());
const MES = HOJE.slice(0, 7);
const PRIMEIRO = MES + '-01';
const MES_ANT = iso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15));

const CONTAS = [
    { id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 100, data_saldo_inicial: '2020-01-01', ativo: true },
    { id: 11, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true }
];
const mov = (id, conta, data, sentido, valor, descricao, extra) => ({ id, conta_id: conta, data, sentido, valor, origem: 'cr', origem_id: id, grupo_id: null, descricao, ...(extra || {}) });
const MOVS = [
    mov(1, 10, MES_ANT, 'entrada', 50, 'Mov mes passado'),
    mov(2, 10, PRIMEIRO, 'entrada', 200, 'Entrada do mes'),
    mov(3, 11, PRIMEIRO, 'entrada', 300, 'Entrada banco'),
    mov(4, 10, PRIMEIRO, 'saida', 80, 'Saida do mes', { origem: 'cp' })
];

async function abrir(page, movs, extras) {
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_mov_fin: movs || MOVS, ...extras });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');
const kpi = (page, id) => page.locator('#fluxo-kpi-' + id + ' .res-kpi-valor');
const linhas = page => page.locator('#fluxo-linhas tr.fluxo-linha');
// Periodo = o mes de `dia` (AAAA-MM-DD ou AAAA-MM).
async function periodoDoMes(page, mes) {
    const [a, m] = mes.slice(0, 7).split('-').map(Number);
    await page.fill('#fluxo-de', mes.slice(0, 7) + '-01');
    await page.locator('#fluxo-de').dispatchEvent('change');
    await page.fill('#fluxo-ate', mes.slice(0, 7) + '-' + p2(new Date(a, m, 0).getDate()));
    await page.locator('#fluxo-ate').dispatchEvent('change');
}

test('fluxo do mes com entradas e saidas e saldos', async ({ page }) => {
    await abrir(page);
    // saldo inicial + 3 movimentos do mes
    await expect(linhas(page)).toHaveCount(4);
    await expect(page.locator('#fluxo-linhas')).toContainText('Entrada do mes');
    await expect(page.locator('#fluxo-linhas')).not.toContainText('Mov mes passado');
    // inicio: 100 + 50 = 150 ; fim: 150 + 200 + 300 - 80 = 570
    expect(await txt(kpi(page, 'inicial'))).toContain('150,00');
    expect(await txt(kpi(page, 'final'))).toContain('570,00');
    expect(await txt(kpi(page, 'entradas'))).toContain('500,00');
    expect(await txt(kpi(page, 'saidas'))).toContain('80,00');
    await expect(page.locator('#fluxo-linhas .fluxo-linha .fluxo-ent', { hasText: '200,00' })).toBeVisible();
    await expect(page.locator('#fluxo-linhas .fluxo-linha .fluxo-sai', { hasText: '80,00' })).toBeVisible();
});

test('filtro por conta', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-conta').selectOption('11');
    await expect(linhas(page)).toHaveCount(2);
    expect(await txt(kpi(page, 'inicial'))).toContain('0,00');
    expect(await txt(kpi(page, 'final'))).toContain('300,00');
});

test('cartao a cair aparece como previsto', async ({ page }) => {
    const d = new Date();
    const proximo = iso(new Date(d.getFullYear(), d.getMonth() + 1, 15));
    await abrir(page, [...MOVS, mov(5, 10, proximo, 'entrada', 1000, 'Repasse do cartao')]);
    // mes atual: o repasse nao aparece e o saldo final nao o inclui
    await expect(page.locator('#fluxo-linhas')).not.toContainText('Repasse do cartao');
    expect(await txt(kpi(page, 'final'))).toContain('570,00');
    // navegando para o mes seguinte pela tela
    await periodoDoMes(page, proximo);
    const linha = page.locator('#fluxo-linhas tr.fluxo-linha', { hasText: 'Repasse do cartao' });
    await expect(linha).toContainText('Previsto');
    await expect(linha).toHaveClass(/fluxo-previsto/);
    expect(await txt(kpi(page, 'inicial'))).toContain('570,00');
    expect(await txt(kpi(page, 'final'))).toContain('570,00');
    await expect(page.locator('#fluxo-previsto')).toContainText('R$ 1.570,00');
    // volta ao mes atual
    await periodoDoMes(page, MES);
    expect(await txt(kpi(page, 'final'))).toContain('570,00');
    // mes passado: saldo ao fim daquele mes (100 + 50)
    await periodoDoMes(page, MES_ANT);
    expect(await txt(kpi(page, 'final'))).toContain('150,00');
});

test('transferir caixa para banco muda os dois saldos e nao o total', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-btn-transferir').click();
    const m = page.locator('#transf-modal');
    await expect(m).toBeVisible();
    await m.locator('#transf-de').selectOption('10');
    await m.locator('#transf-para').selectOption('11');
    await m.locator('#transf-valor').fill('1.250,50');
    await m.locator('#transf-ok').click();
    await expect(m).toHaveCount(0);
    const movs = (await ler(page, 'sc_mov_fin')).filter(x => x.origem === 'transferencia');
    expect(movs).toHaveLength(2);
    expect(movs[0].grupo_id).not.toBeNull();
    expect(movs[0].grupo_id).toBe(movs[1].grupo_id);
    expect(new Set(movs.map(x => x.id)).size).toBe(2);
    const saida = movs.find(x => x.sentido === 'saida'), entrada = movs.find(x => x.sentido === 'entrada');
    expect(saida.conta_id).toBe(10); expect(saida.valor).toBe(1250.5); expect(saida.data).toBe(HOJE);
    expect(entrada.conta_id).toBe(11);
    // total (fim) igual a antes: 570 ; por conta muda
    expect(await txt(kpi(page, 'final'))).toContain('570,00');
    await page.locator('#fluxo-conta').selectOption('11');
    expect(await txt(kpi(page, 'final'))).toContain('1.550,50');
});

test('mesma conta de origem e destino e bloqueado dentro do modal', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-btn-transferir').click();
    const m = page.locator('#transf-modal');
    await m.locator('#transf-de').selectOption('10');
    await m.locator('#transf-para').selectOption('10');
    await m.locator('#transf-valor').fill('10');
    await m.locator('#transf-ok').click();
    await expect(m).toBeVisible();
    await expect(m.locator('#transf-erro')).toContainText('diferente da origem');
    await m.locator('#transf-para').selectOption('11');
    await m.locator('#transf-valor').fill('0');
    await m.locator('#transf-ok').click();
    await expect(m.locator('#transf-erro')).toContainText('valor');
    await page.keyboard.press('Escape');
    await expect(m).toHaveCount(0);
    expect((await ler(page, 'sc_mov_fin')).filter(x => x.origem === 'transferencia')).toHaveLength(0);
});

test('excluir transferencia remove os dois lados', async ({ page }) => {
    const t = [
        { id: 20, conta_id: 10, data: PRIMEIRO, sentido: 'saida', valor: 40, origem: 'transferencia', origem_id: null, grupo_id: 777, descricao: 'Transferência para Banco' },
        { id: 21, conta_id: 11, data: PRIMEIRO, sentido: 'entrada', valor: 40, origem: 'transferencia', origem_id: null, grupo_id: 777, descricao: 'Transferência de Caixa' }
    ];
    await abrir(page, [...MOVS, ...t]);
    await expect(linhas(page)).toHaveCount(6);
    await expect(page.locator('#fluxo-linhas .btn-acoes')).toHaveCount(2);
    await acaoMenu(page, page.locator('#fluxo-linhas tr.fluxo-transferencia').first(), 'Excluir transferência');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_mov_fin')).length).toBe(MOVS.length);
    await expect(linhas(page)).toHaveCount(4);
});

test('sem fluxo completo nao ve Transferir', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_mov_fin: MOVS });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 4;
        u[0].permissoes_extras = { 'financeiro.fluxo': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    await expect(linhas(page)).toHaveCount(4);
    await expect(page.locator('#fluxo-btn-transferir')).toBeHidden();
});

test('transferir 1.000 (so ponto de milhar) move mil reais', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-btn-transferir').click();
    const m = page.locator('#transf-modal');
    await m.locator('#transf-de').selectOption('10');
    await m.locator('#transf-para').selectOption('11');
    await m.locator('#transf-valor').fill('1.000');
    await m.locator('#transf-ok').click();
    await expect(m).toHaveCount(0);
    const movs = (await ler(page, 'sc_mov_fin')).filter(x => x.origem === 'transferencia');
    expect(movs).toHaveLength(2);
    expect(movs.every(x => x.valor === 1000)).toBe(true);
});
