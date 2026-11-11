// Financeiro Fase 1, tarefa 9: aba Extrato (movimentos por conta e mes,
// saldos no inicio e no fim) e transferencia entre contas.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

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
    await page.locator('.fin-tab-btn[data-tab="extrato"]').click();
}
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ');

test('extrato do mes com entradas e saidas e saldos', async ({ page }) => {
    await abrir(page);
    const rows = page.locator('#extrato-linhas .extrato-linha');
    await expect(rows).toHaveCount(3);
    await expect(page.locator('#extrato-linhas')).toContainText('Entrada do mes');
    await expect(page.locator('#extrato-linhas')).not.toContainText('Mov mes passado');
    // inicio: 100 + 50 = 150 ; fim: 150 + 200 + 300 - 80 = 570
    expect(await txt(page.locator('#extrato-saldo-inicio'))).toContain('150,00');
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('570,00');
    await expect(page.locator('#extrato-linhas .extrato-linha.entrada').first()).toBeVisible();
    await expect(page.locator('#extrato-linhas .extrato-linha.saida')).toHaveCount(1);
});

test('filtro por conta', async ({ page }) => {
    await abrir(page);
    await page.locator('#extrato-conta').selectOption('11');
    await expect(page.locator('#extrato-linhas .extrato-linha')).toHaveCount(1);
    expect(await txt(page.locator('#extrato-saldo-inicio'))).toContain('0,00');
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('300,00');
});

test('cartao a cair aparece marcado', async ({ page }) => {
    const d = new Date();
    const proximo = iso(new Date(d.getFullYear(), d.getMonth() + 1, 15));
    await abrir(page, [...MOVS, mov(5, 10, proximo, 'entrada', 1000, 'Repasse do cartao')]);
    // mes atual: o repasse nao aparece e o fim e "ate hoje"
    await expect(page.locator('#extrato-lbl-fim')).toHaveText('Saldo até hoje');
    await expect(page.locator('#extrato-linhas')).not.toContainText('Repasse do cartao');
    // navegando para o mes seguinte pela tela
    await page.locator('#extrato-mes').fill(proximo.slice(0, 7));
    const linha = page.locator('#extrato-linhas .extrato-linha', { hasText: 'Repasse do cartao' });
    await expect(linha).toContainText('a cair');
    await expect(page.locator('#extrato-lbl-fim')).toHaveText('Saldo previsto no fim do mês');
    expect(await txt(page.locator('#extrato-saldo-inicio'))).toContain('570,00');
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('1.570,00');
    // volta ao mes atual: fim ate hoje nao inclui o repasse
    await page.locator('#extrato-mes').fill(MES);
    await expect(page.locator('#extrato-lbl-fim')).toHaveText('Saldo até hoje');
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('570,00');
    // mes passado: rotulo simples, fim = saldo ao fim daquele mes (100 + 50)
    await page.locator('#extrato-mes').fill(MES_ANT.slice(0, 7));
    await expect(page.locator('#extrato-lbl-fim')).toHaveText('Saldo no fim');
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('150,00');
});

test('transferir caixa para banco muda os dois saldos e nao o total', async ({ page }) => {
    await abrir(page);
    await page.locator('#extrato-btn-transferir').click();
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
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('570,00');
    await page.locator('#extrato-conta').selectOption('11');
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('1.550,50');
});

test('mesma conta de origem e destino e bloqueado dentro do modal', async ({ page }) => {
    await abrir(page);
    await page.locator('#extrato-btn-transferir').click();
    const m = page.locator('#transf-modal');
    await m.locator('#transf-de').selectOption('10');
    await m.locator('#transf-para').selectOption('10');
    await m.locator('#transf-valor').fill('10');
    await m.locator('#transf-ok').click();
    await expect(m).toBeVisible();
    await expect(m.locator('#transf-erro')).toContainText('diferentes');
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
    await expect(page.locator('#extrato-linhas .extrato-linha')).toHaveCount(5);
    await expect(page.locator('#extrato-linhas .extrato-excluir')).toHaveCount(2);
    await page.locator('#extrato-linhas .extrato-excluir').first().click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_mov_fin')).length).toBe(MOVS.length);
    await expect(page.locator('#extrato-linhas .extrato-linha')).toHaveCount(3);
});

test('sem extrato completo nao ve Transferir', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_mov_fin: MOVS });
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 4;
        u[0].permissoes_extras = { 'financeiro.extrato': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="extrato"]').click();
    await expect(page.locator('#extrato-linhas .extrato-linha')).toHaveCount(3);
    await expect(page.locator('#extrato-btn-transferir')).toBeHidden();
});
