// Financeiro fase 0 - entrada + saldo: cada forma de pagamento tem um % de
// entrada; ao aprovar, o pedido gera a entrada (vence hoje) e o saldo (vence na
// entrega). Reaprovar desconta o que ja foi pago.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const VEND = [{ id: 1, nome: 'Ana', comissao_pct: 5 }];
const CLI  = [{ id: 9, nome: 'Cli Teste' }];
const ler = (page, chave) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), chave);
const hoje = () => new Date().toLocaleDateString('sv-SE');

async function abrir(page, url, extras) {
    await entrar(page, BASE, { sc_vend: VEND, sc_cli: CLI, ...(extras || {}) });
    await page.goto(BASE + '/' + url);
}

async function aprovarNovo(page, { entrada, entrega, status = 'Medição' }) {
    await page.fill('#ped-cliente-busca', 'Cli Teste');
    await page.evaluate(() => filtrarClientes());
    await page.selectOption('#ped-cliente', '9');
    await page.selectOption('#ped-vendedor', '1');
    await page.selectOption('#ped-status', status);
    if (entrega) await page.fill('#ped-entrega', entrega);
    await page.fill('#ped-entrada-pct', String(entrada));
    await page.evaluate(() => {
        pedidoDraft.ambientes.forEach(a => { a.calculado = true; });
        pedidoDraft.itens = [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 1000, subtotal: 1000 }];
        document.getElementById('ped-desconto').value = 0;
        salvarPedido();
    });
    await page.waitForURL(/index\.html/);
}

test('forma antiga sem entrada ganha o % do nome', async ({ page }) => {
    await abrir(page, 'empresa.html#preferencias', {
        sc_formas_pag: [{ nome: '30% entrada + 70% na instalação', desconto: 0 }, { nome: 'À vista', desconto: 5 }] });
    const campos = page.locator('#emp-formas-pag .forma-pag-entrada');
    await expect(campos).toHaveCount(2);
    expect(await campos.evaluateAll(l => l.map(i => i.value))).toEqual(['30', '100']);
});

test('escolher a forma preenche o % de entrada do pedido', async ({ page }) => {
    await abrir(page, 'pedido.html');
    await expect(page.locator('#ped-entrada-pct')).toHaveValue('50');
    await page.selectOption('#ped-forma-pagamento', 'À vista');
    await expect(page.locator('#ped-entrada-pct')).toHaveValue('100');
    await page.fill('#ped-entrada-pct', '20');
    await expect(page.locator('#ped-entrada-pct')).toHaveValue('20');
});

test('aprovar gera entrada hoje e saldo na entrega', async ({ page }) => {
    await abrir(page, 'pedido.html');
    await aprovarNovo(page, { entrada: 40, entrega: '2026-12-01' });
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.entrada_pct).toBe(40);
    const cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === ped.id);
    expect(cr.map(c => [c.parcela_tipo, c.valor, c.data_vencimento]))
        .toEqual([['entrada', 400, hoje()], ['saldo', 600, '2026-12-01']]);
    expect(new Set(cr.map(c => c.id)).size).toBe(2);
});

test('100% gera uma parcela', async ({ page }) => {
    await abrir(page, 'pedido.html');
    await aprovarNovo(page, { entrada: 100, entrega: '2026-12-01' });
    const ped = (await ler(page, 'sc_ped'))[0];
    const cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === ped.id);
    expect(cr.map(c => [c.parcela_tipo, c.valor])).toEqual([['unica', 1000]]);
});

test('pedido ja aprovado nao e redividido', async ({ page }) => {
    await entrar(page, BASE, {
        sc_cli: CLI,
        sc_ped: [{ id: 27001, clienteId: 9, clienteNome: 'Cli Teste', status: 'Medição', valor: 1000, financeiro_gerado: true,
                   forma_pagamento: '50% entrada + 50% na instalação', ambientes: [], itens: [] }],
        sc_cr: [{ id: 701, pedido_id: 27001, cliente_nome: 'Cli Teste', descricao: 'Pagamento', valor: 1000,
                  data_vencimento: '2099-01-01', data_pagamento: null, status: 'Pendente' }] });
    await page.goto(BASE + '/financeiro.html');
    await page.reload();
    expect((await ler(page, 'sc_cr')).filter(c => c.pedido_id === 27001)).toHaveLength(1);
});

test('reaprovar com entrada paga gera so o que falta', async ({ page }) => {
    await entrar(page, BASE, {
        sc_cli: CLI, sc_vend: VEND,
        sc_ped: [{ id: 27002, clienteId: 9, clienteNome: 'Cli Teste', status: 'Medição', valor: 1000, valor_recebido: 400,
                   financeiro_gerado: true, entrada_pct: 40, forma_pagamento: '40% entrada + 60% na instalação', vendedor_id: 1,
                   data_entrega: '2026-12-01',
                   ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }],
                   itens: [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 1000, subtotal: 1000 }] }],
        sc_cr: [
            { id: 801, pedido_id: 27002, cliente_nome: 'Cli Teste', descricao: 'Entrada', valor: 400, data_vencimento: '2026-11-01', data_pagamento: '2026-11-01', status: 'Pago', parcela_tipo: 'entrada' },
            { id: 802, pedido_id: 27002, cliente_nome: 'Cli Teste', descricao: 'Saldo', valor: 600, data_vencimento: '2026-12-01', data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' }],
        sc_editando_id: 27002 });
    await page.goto(BASE + '/pedido.html');
    await page.click('#ped-voltar-orcamento');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_ped'))[0].status === 'Orçamento');
    let cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === 27002);
    expect(cr.map(c => c.id), 'so a paga fica').toEqual([801]);
    expect((await ler(page, 'sc_ped'))[0].financeiro_gerado).toBe(false);

    await page.goto(BASE + '/pedido.html');
    await page.selectOption('#ped-status', 'Medição');
    await page.evaluate(() => { document.getElementById('ped-desconto').value = 0; salvarPedido(); });
    await page.waitForURL(/index\.html/);
    cr = (await ler(page, 'sc_cr')).filter(c => c.pedido_id === 27002);
    expect(cr.map(c => [c.parcela_tipo, c.valor, c.status]))
        .toEqual([['entrada', 400, 'Pago'], ['saldo', 600, 'Pendente']]);
});

test('pedido antigo com codigo de plano: reaprovar desconta o que ja foi pago', async ({ page }) => {
    // Em Orcamento para a carga da pagina nao gerar as parcelas antes do teste.
    const ped = (id, tp) => ({ id, clienteId: 9, clienteNome: 'Cli Teste', status: 'Orçamento', valor: 1000, tipo_pagamento: tp,
        financeiro_gerado: false, data_entrega: '2026-12-01', ambientes: [], itens: [] });
    const pago = (id, pedido_id, valor) => ({ id, pedido_id, cliente_nome: 'Cli Teste', descricao: 'Entrada', valor,
        data_vencimento: '2026-11-01', data_pagamento: '2026-11-01', status: 'Pago', parcela_tipo: 'entrada' });
    await entrar(page, BASE, { sc_cli: CLI,
        sc_ped: [ped(27101, '30_70'), ped(27102, '30_70'), ped(27103, 'avista')],
        sc_cr: [pago(901, 27101, 300), pago(902, 27102, 100), pago(903, 27103, 400)] });
    await page.goto(BASE + '/index.html');
    const cr = await page.evaluate(() => {
        db.pedidos.forEach(p => gerarFinanceiroPedido(p));
        return db.contas_receber.filter(c => c.status !== 'Pago')
            .map(c => [c.pedido_id, c.parcela_tipo, c.valor, c.data_vencimento, c.descricao]);
    });
    expect(cr).toEqual([
        [27101, 'saldo', 700, '2026-12-01', 'Saldo na instalação (70%) — Pedido #27101'],
        [27102, 'entrada', 200, hoje(), 'Entrada (30%) — Pedido #27102'],
        [27102, 'saldo', 700, '2026-12-01', 'Saldo na instalação (70%) — Pedido #27102'],
        [27103, 'unica', 600, hoje(), 'Pagamento à vista — Pedido #27103']]);
});

test.describe('datas no fuso local', () => {
    test.use({ timezoneId: 'America/Sao_Paulo' });
    test('depois das 21h a parcela que vence hoje nao fica atrasada', async ({ page }) => {
        await page.clock.install({ time: new Date('2026-11-11T22:30:00-03:00') });
        await entrar(page, BASE, { sc_cli: CLI,
            sc_ped: [{ id: 27201, clienteId: 9, clienteNome: 'Cli Teste', status: 'Medição', valor: 1000, tipo_pagamento: '50_50',
                       financeiro_gerado: false, ambientes: [], itens: [] }],
            sc_cr: [{ id: 951, pedido_id: null, cliente_nome: 'X', descricao: 'Avulsa', valor: 10, data_vencimento: '2026-11-11', data_pagamento: null, status: 'Pendente' }] });
        await page.goto(BASE + '/index.html');
        const r = await page.evaluate(() => {
            atualizarStatusVencimentos();   // as parcelas do pedido nasceram na carga (_migrarFinanceiroPedidos)
            return { hoje: new Date().toLocaleDateString('sv-SE'), avulsa: db.contas_receber.find(c => c.id === 951).status,
                     parcelas: db.contas_receber.filter(c => c.pedido_id === 27201).map(c => c.data_vencimento) };
        });
        expect(r).toEqual({ hoje: '2026-11-11', avulsa: 'Pendente', parcelas: ['2026-11-11', '2026-12-11'] });
    });
});
