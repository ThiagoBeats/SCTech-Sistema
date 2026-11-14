// Financeiro Fase 3, tarefa 5: tela Hoje lembra de fechar o mes e avisa se o mes fechado mudou.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const CONTAS = [{ id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-09-01', ativo: true }];
const SEED = {
    sc_contas_fin: CONTAS,
    sc_cr: [{ id: 1, pedido_id: 101, cliente_nome: 'Cli 1', descricao: 'Pedido 1', valor: 500, data_vencimento: '2026-10-10', data_pagamento: '2026-10-10', status: 'Pago', parcela_tipo: 'saldo' }],
    sc_mov_fin: [{ id: 1, conta_id: 10, data: '2026-10-10', sentido: 'entrada', valor: 500, origem: 'cr', origem_id: 1, grupo_id: null, descricao: 'Pedido 1' }]
};
const FOTO_OUT = {
    id: 'fech-2026-10', mes: '2026-10', fechado_em: '2026-11-01T12:00:00.000Z', fechado_por: 'Teste',
    numeros: { entradas: 500, saidas: 0, imposto: 0, imposto_estimado: true, resultado: 500, meta: 0, por_grupo: {} },
    contas: [{ conta_id: 10, nome: 'Banco', esperado: 1500, extrato: 1500, diferenca: 0, acao: null, motivo: '' }],
    pendencias: { pagar_qtd: 0, pagar_valor: 0, receber_qtd: 0, receber_valor: 0, guia_pendente: false },
    sugestoes: [], anotacoes: ''
};

async function abrir(page, extras, antes) {
    await page.clock.install({ time: new Date('2026-11-01T10:00:00') });
    await entrar(page, BASE, { ...SEED, ...(extras || {}) });
    if (antes) await page.evaluate(antes);
    await page.goto(BASE + '/financeiro.html');
}
const semCompleto = () => {
    const u = JSON.parse(localStorage.getItem('sc_usr'));
    u[0].papel_id = 3;
    u[0].permissoes_extras = { 'financeiro.hoje': { nivel: 'visualizar', acoes_restritas: [] }, 'financeiro.resultado': { nivel: 'visualizar', acoes_restritas: [] } };
    localStorage.setItem('sc_usr', JSON.stringify(u));
};

test('dia 1 de novembro mostra "Feche o mês de outubro de 2026" e o botao abre o passo a passo', async ({ page }) => {
    await abrir(page);
    const bloco = page.locator('#hoje-tarefas #hoje-fechamento');
    await expect(bloco).toContainText('Feche o mês de outubro de 2026');
    await bloco.getByRole('button', { name: 'Fechar agora' }).click();
    await expect(page.locator('#fin-resultado')).toBeVisible();
    await expect(page.locator('#res-mes')).toHaveValue('2026-10');
    await expect(page.locator('#fech-modal')).toBeVisible();
});

test('sem contas configuradas nao mostra', async ({ page }) => {
    await abrir(page, { sc_contas_fin: [] });
    await expect(page.locator('#hoje-tarefas')).toBeVisible();
    await expect(page.locator('#hoje-fechamento')).toHaveCount(0);
});

test('outubro fechado some; com mudanca depois mostra o aviso', async ({ page }) => {
    await abrir(page, { sc_fin_fech: [FOTO_OUT] });
    await expect(page.locator('#hoje-tarefas')).toBeVisible();
    await expect(page.locator('#hoje-fechamento')).toHaveCount(0);

    await page.evaluate(() => {
        db.contas_receber.push({ id: 2, pedido_id: 102, cliente_nome: 'Cli 2', descricao: 'Pedido 2', valor: 100, data_vencimento: '2026-10-25', data_pagamento: '2026-10-25', status: 'Pago', parcela_tipo: 'saldo' });
        db.movimentos_fin.push({ id: 4, conta_id: 10, data: '2026-10-25', sentido: 'entrada', valor: 100, origem: 'cr', origem_id: 2, grupo_id: null, descricao: 'Pedido 2' });
        syncDB();
        renderHoje();
    });
    const bloco = page.locator('#hoje-fechamento');
    await expect(bloco).toContainText('⚠ Outubro de 2026 mudou depois do fechamento');
    await expect(bloco).not.toContainText('Feche o mês');
    await bloco.getByRole('button', { name: 'Ver' }).click();
    await expect(page.locator('#fin-resultado')).toBeVisible();
    await expect(page.locator('#res-mes')).toHaveValue('2026-10');
});

test('sem permissao do Resultado nao mostra', async ({ page }) => {
    await abrir(page, {}, () => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 3;
        u[0].permissoes_extras = { 'financeiro.hoje': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await expect(page.locator('#hoje-tarefas')).toBeVisible();
    await expect(page.locator('#hoje-fechamento')).toHaveCount(0);
});

test('so visualizar: o botao e "Ver" e leva ao Resultado sem abrir o passo a passo', async ({ page }) => {
    await abrir(page, {}, semCompleto);
    await expect(page.locator('#hoje-fechamento').getByRole('button', { name: 'Fechar agora' })).toHaveCount(0);
    await page.locator('#hoje-fechamento').getByRole('button', { name: 'Ver', exact: true }).click();
    await expect(page.locator('#fin-resultado')).toBeVisible();
    await expect(page.locator('#res-mes')).toHaveValue('2026-10');
    await expect(page.locator('#fech-modal')).toHaveCount(0);
});

test('guia de imposto lancada depois do fechamento: linha informativa, sem aviso de mudanca', async ({ page }) => {
    const guia = { id: 9, descricao: 'DAS', categoria: 'imposto', tipo: 'variavel', valor: 30, mes_referencia: '2026-10', data_vencimento: '2026-11-20', data_pagamento: null, status: 'Pendente' };
    await abrir(page, { sc_fin_fech: [FOTO_OUT], sc_cp: [guia] });
    const bloco = page.locator('#hoje-fechamento');
    await expect(bloco).toContainText('Guia de imposto lançada: R$ 30,00 (estimado era R$ 0,00)');
    await expect(bloco).not.toContainText('mudou depois do fechamento');
    await expect(page.locator('.hoje-fechamento-mudou')).toHaveCount(0);
});

test('conta a pagar mostra o credor (credor_nome)', async ({ page }) => {
    const cp = { id: 7, descricao: 'Tecido', categoria: 'tecido', tipo: 'variavel', valor: 120, data_vencimento: '2026-11-03', data_pagamento: null, status: 'Pendente', credor_nome: 'Loja X' };
    await abrir(page, { sc_fin_fech: [FOTO_OUT], sc_cp: [cp] });
    await expect(page.locator('[data-grupo="pagar-proximos"]')).toContainText('Loja X · vence 03/11/2026');
});
