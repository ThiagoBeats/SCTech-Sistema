// Pendencias R2/R3, tarefa 3: sobras da rodada 1 e Chart.js local.
// Relogio fixo em 14/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acaoLanc, linhasLanc } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8173';
const MSG = 'Não foi possível salvar: o espaço do navegador acabou. Baixe uma cópia de segurança e libere espaço.';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const CARTAO = { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 };
const BANCO = { id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true };
const CAIXA = { id: 11, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true };
const MAQ = { id: 12, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true, cartao: CARTAO };

const crPago = (id, valor, data, extra) => ({ id, pedido_id: null, cliente_nome: 'Cli ' + id, descricao: 'Pedido ' + id, valor, data_vencimento: data, data_pagamento: data, status: 'Pago', parcela_tipo: 'saldo', ...(extra || {}) });
const crAberto = (id, valor, venc) => ({ id, pedido_id: null, cliente_nome: 'Cli ' + id, descricao: 'Pedido ' + id, valor, data_vencimento: venc, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' });
const mov = (id, conta_id, data, sentido, valor, origem, origem_id, descricao, grupo_id) => ({ id, conta_id, data, sentido, valor, origem, origem_id, grupo_id: grupo_id == null ? null : grupo_id, descricao });
const taxaPaga = (id, valor, data, crId) => ({ id, tipo: 'variavel', categoria: 'taxa_cartao', descricao: 'Taxa de cartão', valor, data_vencimento: data, data_pagamento: data, status: 'Pago', origem_cr_id: crId });

async function abrir(page, dados, pagina) {
    await page.clock.install({ time: new Date('2026-11-14T10:00:00') });
    await entrar(page, BASE, dados);
    await page.goto(BASE + '/' + (pagina || 'financeiro.html'));
}
const resumoProj = page => page.locator('#fin-proj-resumo');
const linhaProj = (page, txt) => resumoProj(page).locator('.fp-item', { hasText: txt }).locator('.fp-val');

// ---- R9: Chart.js local ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Chart.js vem da copia local: graficos aparecem com o CDN bloqueado', async ({ page }) => {
    await page.route('**/cdn.jsdelivr.net/**', r => r.abort());
    await abrir(page, { sc_contas_fin: [BANCO], sc_cr: [crAberto(1, 500, '2026-11-20')] });
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    expect(await page.evaluate(() => typeof Chart)).toBe('function');
    await expect.poll(() => page.evaluate(() => !!Chart.getChart('chart-fin-projecao'))).toBe(true);
    for (const p of ['dashboards.html', 'index.html', 'pedidos.html', 'relatorios.html']) {
        await page.goto(BASE + '/' + p);
        expect(await page.evaluate(() => typeof Chart), p).toBe('function');
    }
});

// ---- Fixa antiga + conta lancada a mao ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('projecao da Visao Geral: fixa antiga e a mesma conta lancada a mao contam uma vez', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO],
        sc_df: [{ id: 3, descricao: 'Aluguel', valor: 2000, dia_vencimento: 20, ativo: true, categoria: 'aluguel' }],
        sc_cp: [{ id: 50, tipo: 'variavel', categoria: 'aluguel', descricao: 'Aluguel', valor: 2000, status: 'Pendente', data_vencimento: '2026-11-20' }]
    });
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await page.locator('.fin-proj-btn[data-d="30"]').click();
    // novembro: so a conta; dezembro (dia 14 de 30 dias = 14/12, antes do dia 20): nada
    await expect(linhaProj(page, 'Saídas totais')).toHaveText('R$ 2.000,00');
});

test('previsao do Hoje: fixa antiga e a mesma conta lancada a mao contam uma vez', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO],
        sc_df: [{ id: 3, descricao: 'Aluguel', valor: 2000, dia_vencimento: 20, ativo: true, categoria: 'aluguel' }],
        sc_cp: [{ id: 50, tipo: 'variavel', categoria: 'aluguel', descricao: 'Aluguel', valor: 2000, status: 'Pendente', data_vencimento: '2026-11-20' }]
    });
    const semana = await page.evaluate(() => {
        const s = CaixaCore.previsaoSemanal({ hoje: '2026-11-14', saldoHoje: 0, movimentos: [], contasReceber: db.contas_receber, contasPagar: db.contas_pagar, despesasFixas: db.despesas_fixas, contas: getContasFin(), meios: getMeiosPag(), semanas: 2 });
        return s[0].saidas;
    });
    expect(semana).toBe(2000);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('tela Hoje: a falta prevista conta a fixa antiga e a mesma conta lancada a mao uma vez so', async ({ page }) => {
    // Saldo de hoje R$ 1.500 e uma saida de R$ 2.000 (fixa antiga + a mesma conta a mao):
    // contada uma vez falta R$ 500; contada duas vezes faltaria R$ 2.500.
    await abrir(page, {
        sc_contas_fin: [{ ...BANCO, saldo_inicial: 1500 }],
        sc_df: [{ id: 3, descricao: 'Aluguel', valor: 2000, dia_vencimento: 20, ativo: true, categoria: 'aluguel' }],
        sc_cp: [{ id: 50, tipo: 'variavel', categoria: 'aluguel', descricao: 'Aluguel', valor: 2000, status: 'Pendente', data_vencimento: '2026-11-20' }]
    });
    await page.locator('.fin-tab-btn[data-tab="hoje"]').click();
    await expect(page.locator('#hoje-total')).toHaveText('R$ 1.500,00');
    await expect(page.locator('#hoje-previsao-aviso')).toContainText('falta R$ 500,00');
    // Primeira semana negativa do grafico (a de 20/11); a fixa de 20/12 vem depois
    await expect.poll(() => page.evaluate(() => Chart.getChart('chart-hoje-previsao').data.datasets[0].data.find(v => v < 0))).toBe(-500);
});

// ---- Contas recorrentes com a regra das parcelas ----
test('contas recorrentes: dia que nao existe vira o ultimo dia do mes, contando da data inicial', async ({ page }) => {
    await abrir(page, {});
    const r = await page.evaluate(() => [
        gerarOcorrenciasRecorrentes('2027-01-31', 'mensal', '2027-05-31'),
        gerarOcorrenciasRecorrentes('2028-01-31', 'mensal', '2028-03-31'),
        gerarOcorrenciasRecorrentes('2027-08-31', 'semestral', '2028-08-31'),
        gerarOcorrenciasRecorrentes('2027-01-10', 'quinzenal', '2027-02-10')
    ]);
    expect(r[0]).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
    expect(r[1]).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
    expect(r[2]).toEqual(['2027-08-31', '2028-02-29', '2028-08-31']);
    expect(r[3]).toEqual(['2027-01-10', '2027-01-25', '2027-02-09']);
});

// ---- PDF da Visao Geral ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('relatorio (PDF) da Visao Geral mostra o liquido sem a taxa do cartao', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO, MAQ],
        sc_cr: [crPago(1, 1000, '2026-10-21', { cartao: { tipo: 'credito', vezes: 1 }, conta_id: 12 })],
        sc_cp: [taxaPaga(1, 30, '2026-11-20', 1)],
        sc_mov_fin: [mov(1, 12, '2026-11-10', 'entrada', 1000, 'cr', 1, 'Pedido 1 (cartão)'), mov(2, 12, '2026-11-10', 'saida', 30, 'cp', 1, 'Taxa de cartão')]
    });
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-kpis2 .fin-kpi', { hasText: 'Total Recebido' })).toContainText('R$ 970,00 líquido (sem a taxa do cartão)');
    const html = await page.evaluate(() => gerarHTMLRelatorioFinanceiro().html);
    expect(html).toContain('R$ 970,00 líquido (sem a taxa do cartão)');
});

// ---- R12: transferencias fora das barras da projecao ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('projecao da Visao Geral: transferencia futura entre contas nao entra nas barras', async ({ page }) => {
    await abrir(page, {
        sc_contas_fin: [BANCO, CAIXA],
        sc_cr: [crAberto(1, 500, '2026-11-16')],
        sc_mov_fin: [
            mov(1, 10, '2026-11-22', 'saida', 400, 'transferencia', null, 'Transferência para Caixa', 77),
            mov(2, 11, '2026-11-22', 'entrada', 400, 'transferencia', null, 'Transferência de Banco', 77)
        ]
    });
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(linhaProj(page, 'Entradas totais')).toHaveText('R$ 500,00');
    await expect(linhaProj(page, 'Saídas totais')).toHaveText('R$ 0,00');
});

// ---- R11: gravacao pela metade ----
test('_syncDBBruto sem espaco no meio: devolve as chaves ja gravadas ao valor anterior', async ({ page }) => {
    await abrir(page, { sc_cli: [{ id: 1, nome: 'Ana' }], sc_cr: [crAberto(1, 500, '2026-11-20')], sc_cp: [] }, 'index.html');
    const r = await page.evaluate(() => {
        localStorage.removeItem('sc_fin_fech');
        const antes = { cli: localStorage.getItem('sc_cli'), cr: localStorage.getItem('sc_cr'), cp: localStorage.getItem('sc_cp'), pap: localStorage.getItem('sc_pap') };
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            if (k === 'sc_med') throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
        db.clientes = [{ id: 1, nome: 'Bia' }];
        db.contas_receber = [];
        db.contas_pagar = [{ id: 9, descricao: 'Nova', valor: 10 }];
        let erro = null;
        try { _syncDBBruto(); } catch (e) { erro = e.name; }
        Storage.prototype.setItem = orig;
        return { erro, iguais: localStorage.getItem('sc_cli') === antes.cli && localStorage.getItem('sc_cr') === antes.cr && localStorage.getItem('sc_cp') === antes.cp && localStorage.getItem('sc_pap') === antes.pap,
            fech: localStorage.getItem('sc_fin_fech') };
    });
    expect(r).toEqual({ erro: 'QuotaExceededError', iguais: true, fech: null });
});

test('salvarERecarregar sem espaco: depois do aviso recarrega e a tela mostra o que esta salvo', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await abrir(page, {
        sc_contas_fin: [BANCO], sc_meios_pag: [{ id: 22, nome: 'PIX', tipo: 'pix', conta_id: 10 }],
        sc_cr: [{ id: 601, cliente_nome: 'Ana', descricao: 'Avulsa', valor: 500, data_vencimento: '2099-12-10', data_pagamento: null, status: 'Pendente' }]
    });
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            if (k === 'sc_mov_fin' && window.__cheio) throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
    });
    await page.reload();
    await abrirLancamentos(page, 'receber');
    await page.evaluate(() => { window.__marca = 1; window.__cheio = true; });
    await acaoLanc(page, 'receber', 'Dar baixa');
    const modal = page.locator('#baixa-modal');
    await modal.locator('.baixa-linha').first().locator('.baixa-meio').selectOption({ label: 'PIX' });
    await modal.locator('#baixa-ok').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG);
    // sc_cr ja tinha sido gravado (Pago) antes de sc_mov_fin falhar: voltou ao anterior
    expect((await ler(page, 'sc_cr'))[0].status).toBe('Pendente');
    expect(await page.evaluate(() => window.__marca), 'so recarrega depois do OK').toBe(1);
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca).catch(() => 'navegando')).toBeUndefined();
    await abrirLancamentos(page, 'receber');
    await expect(linhasLanc(page, 'receber', 'Dar baixa')).toHaveCount(1);
    expect(await page.evaluate(() => db.contas_receber[0].status)).toBe('Pendente');
    expect(erros).toEqual([]);
});
