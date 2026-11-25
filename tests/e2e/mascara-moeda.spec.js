// Mascara de moeda em todos os campos de dinheiro: digitar "125000" mostra "R$ 1.250,00", o valor
// gravado continua numero, editar mostra o valor formatado, colar "1.250,50" vira "R$ 1.250,50" e
// os calculos dao o mesmo numero de antes. Relogio fixo: 24/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 24, 10, 0, 0);
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const digitar = async (page, sel, txt) => { await page.locator(sel).click(); await page.keyboard.type(txt); };

async function abrir(page, pagina, dados) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, dados || {});
    await page.goto(BASE + '/' + pagina);
}

const TECIDO = { id: 1, referencia: '0001', nome: 'TRICO HERA', preco: 167.3, preco_custo: 92.9, largura_rolo: 1.4, min_estoque: 10, fornecedor_nome: 'RC' };
const MATERIAL = { id: 11, referencia: 'TR-01', nome: 'TRILHO', unidade: 'm', preco: 48, preco_custo: 30, min_estoque: 20, estoque_atual: 25, fornecedor_nome: 'RC' };

test('catalogo: digitar 125000 mostra R$ 1.250,00 e grava 1250 no custo e 2250 no preco com margem 80%', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await abrir(page, 'catalogo.html');
    await page.fill('#cat-ref', 'LB-9');
    await page.fill('#cat-nome', 'Linho Teste');
    await digitar(page, '#cat-custo', '125000');
    await expect(page.locator('#cat-custo')).toHaveValue('R$ 1.250,00');
    await expect(page.locator('#cat-venda')).toHaveText('R$ 1250.00/m');
    await page.fill('#cat-markup', '80');
    await expect(page.locator('#cat-venda')).toHaveText('R$ 2250.00/m');
    await digitar(page, '#cat-custo-peca', '9598');
    await expect(page.locator('#cat-custo-peca')).toHaveValue('R$ 95,98');
    await page.click('button[onclick="salvarCatalogo()"]');
    await expect.poll(async () => ((await ler(page, 'sc_cat')) || []).some(x => x.nome === 'Linho Teste')).toBe(true);
    const t = (await ler(page, 'sc_cat')).find(x => x.nome === 'Linho Teste');
    expect(t.preco_custo).toBe(1250);
    expect(t.preco).toBe(2250);
    expect(t.preco_peca).toBe(95.98);
    expect(erros).toEqual([]);
});

test('colar 1.250,50 vira R$ 1.250,50; apagar tudo deixa o campo vazio', async ({ page }) => {
    await abrir(page, 'catalogo.html');
    await page.click('button[data-tab="cat-materiais"]');
    await page.fill('#mat-custo', '1.250,50');
    await expect(page.locator('#mat-custo')).toHaveValue('R$ 1.250,50');
    expect(await page.evaluate(() => lerCampoMoeda('mat-custo'))).toBe(1250.5);
    await page.locator('#mat-custo').click();
    for (let i = 0; i < 9; i++) await page.keyboard.press('Backspace');
    await expect(page.locator('#mat-custo')).toHaveValue('');
    expect(await page.evaluate(() => lerCampoMoeda('mat-custo'))).toBeNull();
});

test('catalogo: editar tecido e material mostra o preco formatado e salvar sem mexer preserva o numero', async ({ page }) => {
    await abrir(page, 'catalogo.html', { sc_cat: [TECIDO], sc_mat: [MATERIAL] });
    await page.evaluate(() => editarCatalogo(1));
    await expect(page.locator('#cat-preco')).toHaveValue('R$ 167,30');
    await page.click('button[onclick="salvarCatalogo()"]');
    await expect.poll(async () => (await ler(page, 'sc_cat'))[0].preco).toBe(167.3);
    await page.reload();
    await page.click('button[data-tab="cat-materiais"]');
    await page.evaluate(() => editarMaterial(11));
    await expect(page.locator('#mat-preco')).toHaveValue('R$ 48,00');
    await digitar(page, '#mat-preco', '1');
    await expect(page.locator('#mat-preco')).toHaveValue('R$ 480,01');
});

test('catalogo: filtro de preco minimo e maximo com mascara', async ({ page }) => {
    const tecidos = [
        { ...TECIDO, id: 1, nome: 'BARATO', preco: 50 },
        { ...TECIDO, id: 2, referencia: '0002', nome: 'MEIO', preco: 120 },
        { ...TECIDO, id: 3, referencia: '0003', nome: 'CARO', preco: 300 }
    ];
    await abrir(page, 'catalogo.html', { sc_cat: tecidos });
    await digitar(page, '#f-tec-pmin', '10000');
    await expect(page.locator('#f-tec-pmin')).toHaveValue('R$ 100,00');
    await digitar(page, '#f-tec-pmax', '20000');
    const corpo = page.locator('#tab-cat-tecidos');
    await expect(corpo).toContainText('MEIO');
    await expect(corpo).not.toContainText('BARATO');
    await expect(corpo).not.toContainText('CARO');
});

test('estoque: preco de venda pelo markup a partir do custo mascarado (92,90 x 1,8 = 167,22)', async ({ page }) => {
    await abrir(page, 'estoque.html', { sc_cat: [TECIDO], sc_mat: [MATERIAL] });
    await digitar(page, '#est-preco-custo', '9290');
    await expect(page.locator('#est-preco-custo')).toHaveValue('R$ 92,90');
    await page.fill('#est-markup', '80');
    await expect(page.locator('#est-preco-venda-display')).toHaveText('R$ 167,22');
});

test('pedido: total com mao de obra e desconto (1000 + 150, 10% = 1035,00)', async ({ page }) => {
    await abrir(page, 'pedido.html');
    await expect(page.locator('#ped-mao')).toHaveValue('R$ 0,00');
    await page.evaluate(() => { pedidoDraft.itens = [{ subtotal: 1000 }]; });
    await digitar(page, '#ped-mao', '15000');
    await expect(page.locator('#ped-mao')).toHaveValue('R$ 150,00');
    await page.fill('#ped-desconto', '10');
    await expect(page.locator('#ped-total-final')).toHaveText('1035.00');
    await expect(page.locator('#ped-desconto-val')).toHaveText('115.00');
});

test('empresa: saldo inicial da conta, meta e orcamento gravam numeros e voltam formatados', async ({ page }) => {
    await abrir(page, 'empresa.html#preferencias');
    await page.click('#emp-contas-card button:has-text("Adicionar conta")');
    const linha = page.locator('#emp-contas .conta-linha').first();
    await linha.locator('.conta-nome').fill('Caixa');
    await expect(linha.locator('.conta-saldo')).toHaveValue('R$ 0,00');
    await digitar(page, '#emp-contas .conta-saldo', '125000');
    await expect(linha.locator('.conta-saldo')).toHaveValue('R$ 1.250,00');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    expect((await ler(page, 'sc_contas_fin'))[0].saldo_inicial).toBe(1250);
    await expect(linha.locator('.conta-saldo')).toHaveValue('R$ 1.250,00');
    await digitar(page, '#emp-meta-padrao', '3000000');
    await expect(page.locator('#emp-meta-padrao')).toHaveValue('R$ 30.000,00');
    await digitar(page, '#orc-fixas', '400050');
    await page.click('button[onclick="salvarMetaOrcamento()"]');
    const emp = await ler(page, 'sc_empresa');
    expect(emp.meta_faturamento_padrao).toBe(30000);
    expect(emp.orcamento_padrao.fixas).toBe(4000.5);
    await page.reload();
    await expect(page.locator('#emp-meta-padrao')).toHaveValue('R$ 30.000,00');
    await expect(page.locator('#orc-fixas')).toHaveValue('R$ 4.000,50');
    await expect(page.locator('#orc-servicos')).toHaveValue('');
    await expect(page.locator('#orc-servicos')).toHaveAttribute('placeholder', 'sem limite');
});

test('financeiro: valor do lancamento e da despesa fixa', async ({ page }) => {
    await abrir(page, 'financeiro.html', { sc_contas_fin: [{ id: 11, nome: 'Banco', tipo: 'banco', ativo: true, saldo_inicial: 0, data_saldo_inicial: '2026-01-01' }] });
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click();
    await page.locator('.fin-lado-btn[data-lado="pagar"]').click();
    await page.locator('#lanc-novo').click();
    await digitar(page, '#lf-valor', '125000');
    await expect(page.locator('#lf-valor')).toHaveValue('R$ 1.250,00');
    expect(await page.evaluate(() => lerCampoMoeda('lf-valor'))).toBe(1250);
    await page.evaluate(() => document.getElementById('lanc-form-overlay')?.remove());

    await page.locator('.fin-lado-btn[data-lado="fixas"]').click();
    await page.fill('#df-descricao', 'Aluguel da loja');
    await digitar(page, '#df-valor', '125000');
    await expect(page.locator('#df-valor')).toHaveValue('R$ 1.250,00');
    await page.click('button[onclick="salvarDespesaFixa()"]');
    await expect.poll(async () => (await ler(page, 'sc_df') || []).length).toBe(1);
    expect((await ler(page, 'sc_df'))[0].valor).toBe(1250);
});

test('janela de baixa e de pagamento: valor da parcela vem formatado e vale o numero', async ({ page }) => {
    await abrir(page, 'financeiro.html');
    const r = await page.evaluate(async () => {
        const p = abrirModalBaixa({ titulo: 'Baixa', itens: [{ id: 1, descricao: 'Parcela', valor: 1250.5, marcado: true }], permiteParcial: true });
        const campo = document.querySelector('.baixa-valor');
        const inicial = campo.value;
        campo.value = ''; campo.dispatchEvent(new InputEvent('input', { bubbles: true }));
        document.querySelector('#baixa-cancel').click();
        await p;
        return inicial;
    });
    expect(r).toBe('R$ 1.250,50');
});

test('saldo e extrato aceitam negativo (-R$ 12,50); os demais campos descartam o sinal', async ({ page }) => {
    await abrir(page, 'empresa.html#preferencias');
    await page.click('#emp-contas-card button:has-text("Adicionar conta")');
    const saldo = page.locator('#emp-contas .conta-saldo').first();
    await saldo.fill('');
    await digitar(page, '#emp-contas .conta-saldo', '-1250');
    await expect(saldo).toHaveValue('-R$ 12,50');
    expect(await page.evaluate(() => lerCampoMoeda(document.querySelector('.conta-saldo')))).toBe(-12.5);
    await digitar(page, '#emp-meta-padrao', '-1250');
    await expect(page.locator('#emp-meta-padrao')).toHaveValue('R$ 12,50');
});

test('digitar zero no campo vazio mostra R$ 0,00 (limite 0 tira o limite do mes)', async ({ page }) => {
    await abrir(page, 'empresa.html#preferencias');
    await digitar(page, '#orc-fixas', '0');
    await expect(page.locator('#orc-fixas')).toHaveValue('R$ 0,00');
    await digitar(page, '#orc-fixas', '5');
    await expect(page.locator('#orc-fixas')).toHaveValue('R$ 0,05');
});

test('layout: o campo de dinheiro tem a mesma largura e altura de um campo vizinho', async ({ page }) => {
    await abrir(page, 'catalogo.html');
    const m = async id => (await page.locator(id).boundingBox());
    const custo = await m('#cat-custo'), qtd = await m('#cat-qtd');
    expect(custo.width).toBe(qtd.width);
    expect(custo.height).toBe(qtd.height);
    await abrir(page, 'estoque.html', { sc_cat: [TECIDO] });
    const c2 = await m('#est-preco-custo'), mk = await m('#est-markup');
    expect(c2.width).toBe(mk.width);
    expect(c2.height).toBe(mk.height);
    await abrir(page, 'pedido.html');
    const rec = await m('#ped-valor-recebido');
    expect(rec.width).toBe(160);   // width:160px inline do campo (box-sizing: border-box do site)
});
