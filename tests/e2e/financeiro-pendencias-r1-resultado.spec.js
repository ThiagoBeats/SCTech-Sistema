// Pendencias R1, tarefa 6: Visao Geral, Resultado do mes, Extrato, fechamento e A Pagar parcelado.
// Relogio fixo em 14/11/2026 (05/11 no fechamento). O Chart.js vem do CDN: os testes leem numeros e textos do DOM.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const CARTAO = { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 };
const BANCO = { id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true };
const CAIXA = { id: 11, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true };
const MAQ = { id: 12, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true, cartao: CARTAO };
const MEIOS = [{ id: 22, nome: 'PIX', tipo: 'pix', conta_id: 10 }, { id: 27, nome: 'Cartão de débito', tipo: 'cartao_debito', conta_id: 12 }];

const crPago = (id, valor, data, extra) => ({ id, pedido_id: null, cliente_nome: 'Cli ' + id, descricao: 'Pedido ' + id, valor, data_vencimento: data, data_pagamento: data, status: 'Pago', parcela_tipo: 'saldo', ...(extra || {}) });
const crAberto = (id, valor, venc, extra) => ({ id, pedido_id: null, cliente_nome: 'Cli ' + id, descricao: 'Pedido ' + id, valor, data_vencimento: venc, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });
const mov = (id, conta_id, data, sentido, valor, origem, origem_id, descricao) => ({ id, conta_id, data, sentido, valor, origem, origem_id, grupo_id: null, descricao });
const taxaPaga = (id, valor, data, crId) => ({ id, tipo: 'variavel', categoria: 'taxa_cartao', descricao: 'Taxa de cartão', valor, data_vencimento: data, data_pagamento: data, status: 'Pago', origem_cr_id: crId });

async function abrir(page, dados, quando) {
    await page.clock.install({ time: new Date((quando || '2026-11-14') + 'T10:00:00') });
    await entrar(page, BASE, dados);
    await page.goto(BASE + '/financeiro.html');
}
async function visaoGeral(page, de, ate) {
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    if (!de) return;
    await page.click('.fin-periodo-btn[data-p="custom"]');
    await page.fill('#fin-custom-ini', de);
    await page.fill('#fin-custom-fim', ate);
    await page.click('#fin-custom-range button');
}
const kpi2 = (page, txt) => page.locator('#fin-kpis2 .fin-kpi', { hasText: txt });
const kpi1 = (page, rotulo) => page.locator('#fin-kpis .fin-kpi').filter({ has: page.locator('.fin-kpi-label', { hasText: new RegExp('^' + rotulo + '$') }) });

// ---- Extrato ----
test('Extrato avisa os recebimentos sem conta do mes mostrado', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO],
        sc_cr: [crPago(1, 500, '2026-11-03'), crPago(2, 250, '2026-11-05'), crPago(3, 700, '2026-11-07'), crPago(4, 999, '2026-10-12')],
        sc_mov_fin: [mov(1, 10, '2026-11-07', 'entrada', 700, 'cr', 3, 'Pedido 3')]
    });
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    const aviso = page.locator('#extrato-aviso-sem-conta');
    await expect(aviso).toHaveText('2 recebimentos sem conta (R$ 750,00) não aparecem aqui');
    await page.fill('#extrato-mes', '2026-10');
    await page.locator('#extrato-mes').dispatchEvent('change');
    await expect(aviso).toHaveText('1 recebimento sem conta (R$ 999,00) não aparece aqui');
    await page.fill('#extrato-mes', '2026-09');
    await page.locator('#extrato-mes').dispatchEvent('change');
    await expect(aviso).toBeHidden();
});

// ---- Visao Geral ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('periodo que corta um mes avisa que o imposto entra so nos meses inteiros', async ({ page }) => {
    await abrir(page, { sc_contas_fin: [BANCO], sc_cr: [crPago(1, 1000, '2026-11-10')], sc_mov_fin: [mov(1, 10, '2026-11-10', 'entrada', 1000, 'cr', 1, 'Pedido 1')] });
    await visaoGeral(page);
    const nota = page.locator('#fin-nota-imposto');
    await expect(kpi2(page, 'Total Recebido')).toContainText('R$');
    await expect(nota).toBeHidden();                       // Este mes = mes inteiro
    await page.click('.fin-periodo-btn[data-p="7d"]');
    await expect(nota).toHaveText('O imposto entra só nos meses inteiros do período');
    await expect(nota).toBeVisible();
    await page.click('.fin-periodo-btn[data-p="custom"]');
    await page.fill('#fin-custom-ini', '2026-10-01');
    await page.fill('#fin-custom-fim', '2026-10-31');
    await page.click('#fin-custom-range button');
    await expect(nota).toBeHidden();
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('"Este mes": a receber e a pagar ate o fim do mes, na mesma janela do recebido', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO],
        sc_cr: [crPago(1, 1000, '2026-11-10'), crAberto(2, 400, '2026-11-25'), crAberto(3, 50, '2026-12-02')],
        sc_cp: [{ id: 1, tipo: 'variavel', categoria: 'tecido', descricao: 'Tecido', valor: 100, data_vencimento: '2026-11-28', data_pagamento: null, status: 'Pendente' }],
        sc_mov_fin: [mov(1, 10, '2026-11-10', 'entrada', 1000, 'cr', 1, 'Pedido 1')]
    });
    await visaoGeral(page);
    await expect(kpi1(page, 'A Receber')).toContainText('R$ 400,00');
    await expect(kpi1(page, 'A Pagar')).toContainText('R$ 100,00');
    await expect(kpi1(page, 'Saldo Previsto')).toContainText('R$ 1.300,00');
    // Outro periodo continua como antes (ate o fim do periodo escolhido)
    await page.click('.fin-periodo-btn[data-p="7d"]');
    await expect(kpi1(page, 'A Receber')).toContainText('R$ 0,00');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('grafico de fluxo usa as datas de repasse e o liquido, como a previsao do Hoje', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO, MAQ], sc_meios_pag: MEIOS,
        // Cartao ja baixado que cai dia 20 (1.000 com taxa de 30) e um a receber no debito previsto (500 -> 492,50 no dia seguinte)
        sc_cr: [crPago(1, 1000, '2026-10-21', { cartao: { tipo: 'credito', vezes: 1 }, conta_id: 12 }), crAberto(2, 500, '2026-11-16', { meio_previsto: { meio_id: 27, vezes: 1 } })],
        sc_cp: [taxaPaga(1, 30, '2026-11-20', 1)],
        sc_mov_fin: [mov(1, 12, '2026-11-20', 'entrada', 1000, 'cr', 1, 'Pedido 1 (cartão)'), mov(2, 12, '2026-11-20', 'saida', 30, 'cp', 1, 'Taxa de cartão')]
    });
    await visaoGeral(page);
    const resumo = page.locator('#fin-proj-resumo');
    await expect(resumo).toContainText('R$ 1.492,50');
    await expect(resumo).toContainText('R$ 30,00');
    await expect(resumo).toContainText('+R$ 1.462,50');
    // Total Recebido do mes mostra tambem o liquido (sem a taxa do cartao)
    await expect(kpi2(page, 'Total Recebido')).toContainText('R$ 1.000,00');
    await expect(kpi2(page, 'Total Recebido')).toContainText('R$ 970,00 líquido (sem a taxa do cartão)');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('recebido no cartao sem conta entra na data do repasse, nao na da baixa', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO], sc_meios_pag: MEIOS,
        sc_cr: [crPago(1, 1000, '2026-10-20', { cartao: { tipo: 'credito', vezes: 1 }, conta_id: null })],
        sc_cp: [taxaPaga(1, 30, '2026-11-19', 1)]
    });
    await visaoGeral(page, '2026-10-01', '2026-10-31');
    await expect(kpi2(page, 'Total Recebido')).toContainText('R$ 0,00');
    await visaoGeral(page, '2026-11-01', '2026-11-30');
    await expect(kpi2(page, 'Total Recebido')).toContainText('R$ 1.000,00');
    await expect(kpi2(page, 'Lucro')).toContainText('R$ 970,00');
});

// ---- Resultado do mes ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('previsto ate o fim do mes: tira a taxa do cartao a cair e ignora transferencia futura', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO, CAIXA, MAQ], sc_empresa: { aliquota_estimada: 6 },
        sc_cr: [crPago(1, 1000, '2026-11-02', { cartao: { tipo: 'credito', vezes: 1 }, conta_id: 12 })],
        sc_cp: [taxaPaga(1, 30, '2026-11-20', 1)],
        sc_mov_fin: [
            mov(1, 12, '2026-11-20', 'entrada', 1000, 'cr', 1, 'Pedido 1 (cartão)'), mov(2, 12, '2026-11-20', 'saida', 30, 'cp', 1, 'Taxa de cartão'),
            mov(3, 10, '2026-11-22', 'saida', 400, 'transferencia', null, 'Transferência para Caixa'),
            mov(4, 11, '2026-11-22', 'entrada', 400, 'transferencia', null, 'Transferência de Banco')
        ]
    });
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    // faturamento previsto 1.000 - 30 = 970; imposto 6% = 58,20; previsto = 1.000 - 30 - 58,20
    await expect(page.locator('#res-previsto')).toHaveText('R$ 911,80');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('margem de 12 meses nao recalcula a cada render sem mudanca nos dados', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO],
        sc_cr: [crPago(1, 1000, '2026-10-10')],
        sc_cp: [{ id: 1, tipo: 'variavel', categoria: 'tecido', descricao: 'Tecido', valor: 400, data_vencimento: '2026-10-12', data_pagamento: '2026-10-12', status: 'Pago' }]
    });
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await expect(page.locator('#res-previsto')).toContainText('R$');
    // O contador so de teste saiu do codigo: espia a funcao do nucleo que o historico chama.
    expect(await page.evaluate(() => typeof _resMargemCalculos)).toBe('undefined');
    await page.evaluate(() => {
        window.__calculos = 0;
        const orig = ResultadoCore.margemContribuicao;
        ResultadoCore.margemContribuicao = function (...a) { window.__calculos++; return orig.apply(this, a); };
    });
    const depois = await page.evaluate(() => { renderResultadoMes('2026-11'); renderResultadoMes('2026-11'); return window.__calculos; });
    expect(depois).toBe(0);
    const mudou = await page.evaluate(() => {
        db.contas_pagar.push({ id: 2, tipo: 'variavel', categoria: 'tecido', descricao: 'Tecido 2', valor: 100, data_vencimento: '2026-10-13', data_pagamento: '2026-10-13', status: 'Pago' });
        renderResultadoMes('2026-11');
        return window.__calculos;
    });
    expect(mudou).toBe(1);
});

// ---- Fechamento ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('conferencia do fechamento inclui conta sem data de saldo inicial', async ({ page }) => {
    const antiga = { id: 13, nome: 'Cofre antigo', tipo: 'caixa', saldo_inicial: 200, ativo: true };
    await abrir(page, { sc_contas_fin: [BANCO, antiga], sc_cr: [crPago(1, 500, '2026-10-10')], sc_mov_fin: [mov(1, 10, '2026-10-10', 'entrada', 500, 'cr', 1, 'Pedido 1')] }, '2026-11-05');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await page.fill('#res-mes', '2026-10');
    await page.locator('#res-mes').dispatchEvent('change');
    await page.click('#fech-btn-fechar');
    const modal = page.locator('#fech-modal');
    await expect(modal).toContainText('Cofre antigo');
    await expect(modal).toContainText('R$ 200,00');
    await expect(modal.locator('.fech-extrato')).toHaveCount(2);
});

// ---- A Pagar parcelado: regra R4 ----
test('A Pagar parcelado: dia 31 vira o ultimo dia do mes, como no simulador', async ({ page }) => {
    await abrir(page, { sc_cp: [] });
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click(); await page.locator('.fin-lado-btn[data-lado="pagar"]').click();
    await page.evaluate(() => {
        abrirModalContaPagar('manual');
        document.getElementById('cpm-descricao').value = 'Máquina';
        document.getElementById('cpm-valor').value = '300';
        document.getElementById('cpm-vencimento').value = '2027-01-31';
        document.getElementById('cpm-parcelado').checked = true;
        onToggleParceladoCP();
        document.getElementById('cpm-parcelas').value = '3';
        adicionarContaPagarManual();
    });
    // Salvar recarrega a pagina: a leitura pode cair no meio da navegacao.
    await expect.poll(async () => { try { return ((await ler(page, 'sc_cp')) || []).length; } catch (e) { return -1; } }).toBe(3);
    await page.waitForLoadState('load');
    const datas = (await ler(page, 'sc_cp')).map(c => c.data_vencimento).sort();
    expect(datas).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    const sim = await page.evaluate(() => SimuladorCore.pagamentosDaCompra({ valor: 300, forma: 'parcelado', parcelas: 3, dataCompra: '2027-01-10', dataPrimeira: '2027-01-31' }).pagamentos.map(p => p.data));
    expect(sim).toEqual(datas);
});
