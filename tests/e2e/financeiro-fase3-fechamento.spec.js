// Financeiro Fase 3, tarefa 4: fechamento do mes na aba "Resultado do mes"
// (passo a passo, foto, aviso de mudanca, refazer e documento).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

const CONTAS = [{ id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-09-01', ativo: true }];
const mov = (id, data, sentido, valor, origem, origem_id, descricao, extra) => ({ id, conta_id: 10, data, sentido, valor, origem, origem_id, grupo_id: null, descricao, ...(extra || {}) });
const SEED = {
    sc_contas_fin: CONTAS,
    sc_cr: [{ id: 1, pedido_id: 101, cliente_nome: 'Cli 1', descricao: 'Pedido 1', valor: 500, data_vencimento: '2026-10-10', data_pagamento: '2026-10-10', status: 'Pago', parcela_tipo: 'saldo' }],
    sc_cp: [
        { id: 1, descricao: 'Tecido pago', categoria: 'tecido', tipo: 'variavel', valor: 200, data_vencimento: '2026-10-15', data_pagamento: '2026-10-15', status: 'Pago' },
        { id: 2, descricao: 'Conta de luz', categoria: 'outros', tipo: 'variavel', valor: 80, data_vencimento: '2026-10-20', data_pagamento: null, status: 'Pendente' }
    ],
    sc_mov_fin: [
        mov(1, '2026-10-10', 'entrada', 500, 'cr', 1, 'Pedido 1'),
        mov(2, '2026-10-15', 'saida', 200, 'cp', 1, 'Tecido pago')
    ]
};
// Foto de outubro como o fechamento grava (conta conferida sem diferenca).
const FOTO_OUT = {
    id: 'fech-2026-10', mes: '2026-10', fechado_em: '2026-11-01T12:00:00.000Z', fechado_por: 'Teste',
    numeros: { entradas: 500, saidas: 200, imposto: 0, imposto_estimado: true, resultado: 300, meta: 0, por_grupo: {} },
    contas: [{ conta_id: 10, nome: 'Banco', esperado: 1300, extrato: 1300, diferenca: 0, acao: null, motivo: '' }],
    pendencias: { pagar_qtd: 1, pagar_valor: 80, receber_qtd: 0, receber_valor: 0, guia_pendente: true },
    sugestoes: ['Nenhum ponto de atenção. Bom mês!'], anotacoes: ''
};

async function abrir(page, extras, antes) {
    await page.clock.install({ time: new Date('2026-11-05T10:00:00') });
    await entrar(page, BASE, { ...SEED, ...(extras || {}) });
    if (antes) await page.evaluate(antes);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
}
async function irPara(page, mes) {
    await page.fill('#res-mes', mes);
    await page.locator('#res-mes').dispatchEvent('change');
}
const modal = page => page.locator('#fech-modal');
const continuar = page => modal(page).getByRole('button', { name: 'Continuar' });

// Passo 1 com extrato 1.280,00 e ajuste; passa pelos 3 passos ate o botao Fechar.
async function ateResumoComAjuste(page) {
    await page.click('#fech-btn-fechar');
    await modal(page).locator('.fech-extrato').first().fill('1.280,00');
    await modal(page).getByLabel('Lançar ajuste').check();
    await modal(page).locator('.fech-motivo').first().fill('tarifa do banco');
    await continuar(page).click();
    await continuar(page).click();
    await expect(page.locator('#fech-confirmar')).toBeVisible();
}

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('mes atual nao tem botao; outubro tem "🔒 Fechar outubro de 2026"', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#res-mes')).toHaveValue('2026-11');
    await expect(page.locator('#fech-btn-fechar')).toHaveCount(0);
    await irPara(page, '2026-10');
    await expect(page.locator('#fech-btn-fechar')).toHaveText('🔒 Fechar outubro de 2026');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('passo 1: esperado 1300, extrato 1.280,00 mostra diferenca −20 e exige motivo para ajustar', async ({ page }) => {
    await abrir(page);
    await irPara(page, '2026-10');
    await page.click('#fech-btn-fechar');
    const linha = modal(page).locator('tr[data-conta="10"]');
    await expect(linha).toContainText('Banco');
    await expect(linha).toContainText('R$ 1.300,00');
    await expect(modal(page)).toContainText('lance no A Pagar / A Receber em vez de ajustar');
    await linha.locator('.fech-extrato').fill('1.280,00');
    await expect(linha.locator('.fech-dif')).toHaveText('−R$ 20,00');
    await linha.getByLabel('Lançar ajuste').check();
    await continuar(page).click();
    await expect(modal(page)).toContainText('Informe o motivo do ajuste.');
    await expect(linha).toBeVisible();
    await linha.locator('.fech-motivo').fill('tarifa do banco');
    await continuar(page).click();
    await expect(linha).toBeHidden();
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('fechar com ajuste: cria movimento de ajuste, nao muda o resultado, grava a foto e abre o documento com Enviar', async ({ page }) => {
    await abrir(page);
    await irPara(page, '2026-10');
    const antes = await page.evaluate(() => resultadoFinanceiroDoMes('2026-10').resultado);
    await ateResumoComAjuste(page);
    await expect(page.locator('#fech-confirmar')).toHaveText('🔒 Fechar outubro de 2026');
    await page.fill('#fech-anotacoes', 'mes tranquilo');
    await page.click('#fech-confirmar');
    await expect(modal(page)).toHaveCount(0);

    const ajustes = (await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'ajuste');
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0]).toMatchObject({ origem: 'ajuste', fechamento_mes: '2026-10', data: '2026-10-31', sentido: 'saida', valor: 20, conta_id: 10 });
    expect(ajustes[0].descricao).toBe('Ajuste da conferência de Outubro de 2026: tarifa do banco');
    expect(await page.evaluate(() => resultadoFinanceiroDoMes('2026-10').resultado)).toBe(antes);

    const fotos = await ler(page, 'sc_fin_fech');
    expect(fotos).toHaveLength(1);
    expect(fotos[0].mes).toBe('2026-10');
    expect(fotos[0].fechado_por).toBe('Teste');
    expect(fotos[0].anotacoes).toBe('mes tranquilo');
    expect(fotos[0].contas[0]).toMatchObject({ extrato: 1280, diferenca: -20, acao: 'ajuste', motivo: 'tarifa do banco' });
    expect(fotos[0].pendencias).toMatchObject({ pagar_qtd: 1, pagar_valor: 80 });

    await expect(page.locator('#doc-modal-paper')).toContainText('Fechamento de outubro de 2026');
    await expect(page.locator('#btn-enviar-doc')).toBeVisible();
    await page.evaluate(() => fecharDocModal());
    await expect(page.locator('#res-fechamento')).toContainText('🔒 Fechado em');
    await expect(page.locator('#res-fechamento')).toContainText('por Teste');
    await expect(page.locator('#res-fechamento .fech-mudou')).toHaveCount(0);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('pendencias listam a CP de 80 com atalho', async ({ page }) => {
    await abrir(page);
    await irPara(page, '2026-10');
    await page.click('#fech-btn-fechar');
    await continuar(page).click();
    const item = modal(page).locator('.fech-pend-item', { hasText: 'Conta de luz' });
    await expect(item).toContainText('R$ 80,00');
    await item.getByRole('button').click();
    await expect(modal(page)).toHaveCount(0);
    await expect(page.locator('#fin-pagar')).toHaveClass(/active/);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('sem pendencias mostra "Nada pendente neste mês."', async ({ page }) => {
    // CP de outubro paga e guia de imposto de outubro lancada (vence em novembro).
    const guia = { id: 9, descricao: 'DAS', categoria: 'imposto', tipo: 'variavel', valor: 30, mes_referencia: '2026-10', data_vencimento: '2026-11-20', data_pagamento: null, status: 'Pendente' };
    await abrir(page, { sc_cp: [SEED.sc_cp[0], guia] });
    await irPara(page, '2026-10');
    await page.click('#fech-btn-fechar');
    await continuar(page).click();
    await expect(modal(page)).toContainText('Nada pendente neste mês.');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('duplo clique em Fechar grava uma foto e um ajuste so', async ({ page }) => {
    await abrir(page);
    await irPara(page, '2026-10');
    await ateResumoComAjuste(page);
    await page.evaluate(() => { const b = document.getElementById('fech-confirmar'); b.click(); b.click(); });
    await expect(page.locator('#doc-modal-paper')).toContainText('Fechamento de outubro de 2026');
    expect(await ler(page, 'sc_fin_fech')).toHaveLength(1);
    expect((await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'ajuste')).toHaveLength(1);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('lancar com data de outubro depois do fechamento mostra o aviso de mudanca; pagar em novembro uma conta de outubro nao mostra', async ({ page }) => {
    // Pagar em novembro a CP de outubro: nada muda em outubro.
    await abrir(page, { sc_fin_fech: [FOTO_OUT] }, () => {
        const cp = JSON.parse(localStorage.getItem('sc_cp'));
        cp[1].status = 'Pago'; cp[1].data_pagamento = '2026-11-03';
        localStorage.setItem('sc_cp', JSON.stringify(cp));
        const mv = JSON.parse(localStorage.getItem('sc_mov_fin'));
        mv.push({ id: 3, conta_id: 10, data: '2026-11-03', sentido: 'saida', valor: 80, origem: 'cp', origem_id: 2, grupo_id: null, descricao: 'Conta de luz' });
        localStorage.setItem('sc_mov_fin', JSON.stringify(mv));
    });
    await irPara(page, '2026-10');
    await expect(page.locator('#res-fechamento')).toContainText('🔒 Fechado em 01/11/2026 por Teste');
    await expect(page.locator('#res-fechamento .fech-mudou')).toHaveCount(0);

    // Recebimento lancado com data de outubro: resultado e saldo mudam.
    await page.evaluate(() => {
        db.contas_receber.push({ id: 2, pedido_id: 102, cliente_nome: 'Cli 2', descricao: 'Pedido 2', valor: 100, data_vencimento: '2026-10-25', data_pagamento: '2026-10-25', status: 'Pago', parcela_tipo: 'saldo' });
        db.movimentos_fin.push({ id: 4, conta_id: 10, data: '2026-10-25', sentido: 'entrada', valor: 100, origem: 'cr', origem_id: 2, grupo_id: null, descricao: 'Pedido 2' });
        syncDB();
        renderResultadoMes('2026-10');
    });
    const av = page.locator('#res-fechamento .fech-mudou');
    await expect(av).toContainText('⚠ Outubro de 2026 mudou depois do fechamento: resultado era R$ 300,00, agora é R$ 400,00');
    await expect(av).toContainText('saldo de Banco era R$ 1.300,00, agora R$ 1.400,00');

    // O documento continua mostrando a foto, com o aviso.
    await page.getByRole('button', { name: 'Ver fechamento' }).click();
    await expect(page.locator('#doc-modal-paper')).toContainText('Fechamento de outubro de 2026');
    await expect(page.locator('#doc-modal-paper')).toContainText('resultado era R$ 300,00, agora é R$ 400,00');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('refazer apaga a foto e so os ajustes de outubro', async ({ page }) => {
    const foto = { ...FOTO_OUT, contas: [{ conta_id: 10, nome: 'Banco', esperado: 1300, extrato: 1280, diferenca: -20, acao: 'ajuste', motivo: 'tarifa' }] };
    const movs = [
        ...SEED.sc_mov_fin,
        mov(5, '2026-10-31', 'saida', 20, 'ajuste', null, 'Ajuste da conferência de Outubro de 2026: tarifa', { fechamento_mes: '2026-10' }),
        mov(6, '2026-09-30', 'entrada', 5, 'ajuste', null, 'Ajuste da conferência de Setembro de 2026: troco', { fechamento_mes: '2026-09' })
    ];
    await abrir(page, { sc_fin_fech: [foto, { ...FOTO_OUT, id: 'fech-2026-09', mes: '2026-09' }], sc_mov_fin: movs });
    await irPara(page, '2026-10');
    await page.getByRole('button', { name: 'Refazer fechamento' }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Refazer o fechamento de outubro de 2026? A foto e os ajustes lançados nele serão apagados.');
    await page.click('#sc-modal-ok');

    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator('tr[data-conta="10"]')).toContainText('R$ 1.305,00');
    const fotos = await ler(page, 'sc_fin_fech');
    expect(fotos.map(f => f.mes)).toEqual(['2026-09']);
    const ids = (await ler(page, 'sc_mov_fin')).map(m => m.id).sort();
    expect(ids).toEqual([1, 2, 6]);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('sem permissao completa: ve o selo, nao ve Fechar nem Refazer', async ({ page }) => {
    await abrir(page, { sc_fin_fech: [FOTO_OUT] }, () => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 4;
        u[0].permissoes_extras = { 'financeiro.resultado': { nivel: 'visualizar', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await irPara(page, '2026-10');
    await expect(page.locator('#res-fechamento')).toContainText('🔒 Fechado em 01/11/2026 por Teste');
    await expect(page.getByRole('button', { name: 'Ver fechamento' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refazer fechamento' })).toHaveCount(0);
    await irPara(page, '2026-09');
    await expect(page.locator('#fech-btn-fechar')).toHaveCount(0);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('passo a passo nao fecha pelo fundo nem pelo Esc; Cancelar pergunta se ha algo digitado', async ({ page }) => {
    await abrir(page);
    await irPara(page, '2026-10');
    await page.click('#fech-btn-fechar');
    await modal(page).locator('.fech-extrato').first().fill('1.280,00');
    await modal(page).click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Escape');
    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator('.fech-extrato').first()).toHaveValue('R$ 1.280,00');
    // Cancelar com algo digitado: pergunta; "Continuar fechando" mantem.
    await modal(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Cancelar o fechamento? O que você digitou será perdido.');
    await page.click('#sc-modal-cancel');
    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator('.fech-extrato').first()).toHaveValue('R$ 1.280,00');
    // No passo 3 tambem ha Cancelar; confirmando, fecha.
    await continuar(page).click();
    await continuar(page).click();
    await modal(page).getByRole('button', { name: 'Cancelar' }).click();
    await page.click('#sc-modal-ok');
    await expect(modal(page)).toHaveCount(0);
    // Nada digitado: Cancelar fecha sem perguntar.
    await page.click('#fech-btn-fechar');
    await modal(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(page.locator('#sc-modal-msg')).toBeHidden();
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('extrato negativo com milhar: "-1.500" e "−1.500" valem -1500', async ({ page }) => {
    await abrir(page);
    await irPara(page, '2026-10');
    await page.click('#fech-btn-fechar');
    const linha = modal(page).locator('tr[data-conta="10"]');
    await linha.locator('.fech-extrato').fill('-1.500,00');
    await expect(linha.locator('.fech-dif')).toHaveText('−R$ 2.800,00');
    await linha.locator('.fech-extrato').fill('\u22121.500');
    await expect(linha.locator('.fech-dif')).toHaveText('−R$ 2.800,00');
    await linha.locator('.fech-extrato').fill('-1.234,56');
    await expect(linha.locator('.fech-dif')).toHaveText('−R$ 2.534,56');
    expect(await page.evaluate(() => [_valorDigitadoBaixa('1.500'), _valorDigitadoBaixa('1.234,56'), _valorDigitadoBaixa('-1.500'), _valorDigitadoBaixa('-1.234,56'), _valorDigitadoBaixa('\u22121.500')]))
        .toEqual([1500, 1234.56, -1500, -1234.56, -1500]);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('pendencias: credor da conta a pagar e atalhos so com permissao de ver A Pagar / A Receber', async ({ page }) => {
    const cps = [SEED.sc_cp[0], { ...SEED.sc_cp[1], credor_nome: 'Companhia de Luz' }];
    const crs = SEED.sc_cr.concat([{ id: 2, pedido_id: 102, cliente_nome: 'Cli 2', descricao: 'Pedido 2', valor: 90, data_vencimento: '2026-10-28', data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' }]);
    await abrir(page, { sc_cp: cps, sc_cr: crs }, () => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 3;
        // Vendedor: sem A Pagar; A Receber tirado aqui.
        u[0].permissoes_extras = { 'financeiro.hoje': { nivel: 'visualizar', acoes_restritas: [] }, 'financeiro.resultado': { nivel: 'completo', acoes_restritas: [] },
            'financeiro.receber': { nivel: 'sem_acesso', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await irPara(page, '2026-10');
    await page.click('#fech-btn-fechar');
    await expect(modal(page).locator('.fech-link')).toHaveCount(0);
    await continuar(page).click();
    const luz = modal(page).locator('.fech-pend-item', { hasText: 'Conta de luz' });
    await expect(luz).toContainText('Companhia de Luz · vence 20/10/2026');
    await expect(modal(page).locator('.fech-pend-item', { hasText: 'Cli 2' })).toBeVisible();
    await expect(modal(page).getByRole('button', { name: 'Abrir A Pagar' })).toHaveCount(0);
    await expect(modal(page).getByRole('button', { name: 'Abrir A Receber' })).toHaveCount(0);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('guia de imposto lancada depois do fechamento: linha informativa, sem aviso amarelo', async ({ page }) => {
    const guia = { id: 9, descricao: 'DAS', categoria: 'imposto', tipo: 'variavel', valor: 30, mes_referencia: '2026-10', data_vencimento: '2026-11-20', data_pagamento: null, status: 'Pendente' };
    await abrir(page, { sc_fin_fech: [FOTO_OUT], sc_cp: SEED.sc_cp.concat([guia]) });
    await irPara(page, '2026-10');
    await expect(page.locator('#res-fechamento .fech-info')).toHaveText('Guia de imposto lançada: R$ 30,00 (estimado era R$ 0,00)');
    await expect(page.locator('#res-fechamento .fech-mudou')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver fechamento' }).click();
    await expect(page.locator('#doc-modal-paper')).toContainText('Guia de imposto lançada: R$ 30,00 (estimado era R$ 0,00)');
    await expect(page.locator('#doc-modal-paper')).not.toContainText('mudou depois do fechamento');
});
