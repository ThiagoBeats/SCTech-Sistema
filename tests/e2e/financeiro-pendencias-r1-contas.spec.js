// Pendencias R1, tarefa 3: contas, movimentos e datas (Extrato, Hoje, baixas, transferencia, exclusoes).
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acoesDaLinha } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somarDias = (dataISO, dias) => { const d = new Date(dataISO + 'T12:00:00'); d.setDate(d.getDate() + dias); return iso(d); };
const HOJE = iso(new Date());
const AMANHA = somarDias(HOJE, 1);
const MES = HOJE.slice(0, 7);
const ddmmaaaa = d => d.split('-').reverse().join('/');
const txt = async loc => (await loc.innerText()).replace(/\s+/g, ' ');

const CAIXA = { id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 100, data_saldo_inicial: '2020-01-01', ativo: true };
const BANCO = { id: 11, nome: 'Banco', tipo: 'banco', saldo_inicial: 300, data_saldo_inicial: '2020-01-01', ativo: true };
const MEIOS = [{ id: 21, nome: 'Dinheiro', tipo: 'dinheiro', conta_id: 10 }, { id: 22, nome: 'PIX', tipo: 'pix', conta_id: 11 }];
const mov = (id, conta, data, sentido, valor, descricao) => ({ id, conta_id: conta, data, sentido, valor, origem: 'cr', origem_id: id, grupo_id: null, descricao });
const cr = (id, extra) => ({ id, pedido_id: null, cliente_nome: 'Ana', descricao: 'Parcela ' + id, valor: 100, data_vencimento: HOJE, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });
const cp = (id, extra) => ({ id, descricao: 'Conta ' + id, credor_nome: 'Forn', valor: 50, data_vencimento: HOJE, data_pagamento: null, status: 'Pendente', tipo: 'variavel', categoria: 'outro', ...(extra || {}) });

async function abrirPref(page, extras) {
    await entrar(page, BASE, extras);
    await page.goto(BASE + '/empresa.html#preferencias');
}
async function abrirExtrato(page, extras) {
    await entrar(page, BASE, extras);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
}

// ---- Remover conta (D1) ----
test('remover conta com movimentos oferece desativar e nao exclui', async ({ page }) => {
    await abrirPref(page, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS, sc_mov_fin: [mov(1, 10, '2026-01-10', 'entrada', 50, 'x')] });
    await page.locator('#emp-contas .conta-linha').first().locator('button[title="Remover conta"]').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('Esta conta tem movimentos e não pode ser excluída. Você pode desativá-la: ela sai dos saldos e da previsão, e o histórico continua no Extrato.');
    await page.locator('#sc-modal-cancel').click();
    await expect(page.locator('#emp-contas .conta-linha')).toHaveCount(2);
    await page.locator('#emp-contas .conta-linha').first().locator('button[title="Remover conta"]').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#emp-contas .conta-linha').first()).toContainText('Conta desativada');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    const contas = await ler(page, 'sc_contas_fin');
    expect(contas).toHaveLength(2);
    expect(contas.find(c => c.id === 10).ativo).toBe(false);
});

test('remover conta so com conta a receber ligada tambem nao exclui', async ({ page }) => {
    await abrirPref(page, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS, sc_cr: [cr(1, { status: 'Pago', conta_id: 11, data_pagamento: '2026-01-02' })] });
    await page.locator('#emp-contas .conta-linha').nth(1).locator('button[title="Remover conta"]').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('não pode ser excluída');
    await page.locator('#sc-modal-cancel').click();
    await expect(page.locator('#emp-contas .conta-linha')).toHaveCount(2);
});

test('remover conta sem movimentos pede confirmacao', async ({ page }) => {
    await abrirPref(page, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS });
    const remover = () => page.locator('#emp-contas .conta-linha').nth(1).locator('button[title="Remover conta"]').click();
    await remover();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Excluir a conta Banco? O meio PIX fica sem conta.');
    await page.locator('#sc-modal-cancel').click();
    await expect(page.locator('#emp-contas .conta-linha')).toHaveCount(2);
    expect((await ler(page, 'sc_meios_pag'))[1].conta_id, 'cancelar nao mexe no meio').toBe(11);
    await remover();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#emp-contas .conta-linha')).toHaveCount(1);
    await expect(page.locator('#emp-meios .meio-linha').nth(1).locator('.meio-conta')).toHaveValue('');
});

test('excluir conta e nao salvar: o meio salvo continua com a conta', async ({ page }) => {
    await abrirPref(page, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS });
    await page.locator('#emp-contas .conta-linha').nth(1).locator('button[title="Remover conta"]').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#emp-contas .conta-linha')).toHaveCount(1);
    // outra gravacao qualquer na mesma pagina nao leva a exclusao ainda nao salva
    await page.evaluate(() => syncDB());
    expect((await ler(page, 'sc_meios_pag'))[1].conta_id).toBe(11);
    expect((await ler(page, 'sc_contas_fin')).length).toBe(2);
});

test('excluir conta sem movimentos: os meios dela ficam sem conta (e nao ganham outra ao salvar)', async ({ page }) => {
    const BANCO2 = { ...BANCO, id: 12, nome: 'Banco 2' };
    const meios = [...MEIOS, { id: 23, nome: 'Transferência', tipo: 'transferencia', conta_id: 11 }];
    await abrirPref(page, { sc_contas_fin: [CAIXA, BANCO, BANCO2], sc_meios_pag: meios });
    await page.locator('#emp-contas .conta-linha').nth(1).locator('button[title="Remover conta"]').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Excluir a conta Banco? Os meios PIX e Transferência ficam sem conta.');
    await page.locator('#sc-modal-ok').click();
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    await expect.poll(async () => (await ler(page, 'sc_contas_fin')).length).toBe(2);
    const salvos = await ler(page, 'sc_meios_pag');
    expect(salvos.map(m => [m.nome, m.conta_id])).toEqual([['Dinheiro', 10], ['PIX', null], ['Transferência', null]]);
});

test('salvar com o nome apagado numa conta com movimentos nao exclui: oferece desativar', async ({ page }) => {
    await abrirPref(page, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS, sc_mov_fin: [mov(1, 10, '2026-01-10', 'entrada', 50, 'x')] });
    await page.locator('#emp-contas .conta-linha').first().locator('.conta-nome').fill('');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Esta conta tem movimentos e não pode ser excluída.');
    await page.locator('#sc-modal-cancel').click();
    let contas = await ler(page, 'sc_contas_fin');
    expect(contas).toHaveLength(2);
    expect(contas.find(c => c.id === 10).ativo).toBe(true);
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_contas_fin')).find(c => c.id === 10).ativo).toBe(false);
    contas = await ler(page, 'sc_contas_fin');
    expect(contas).toHaveLength(2);
    expect(contas.find(c => c.id === 10).nome).toBe('Caixa');
});

test('conta sem movimentos com nome apagado continua saindo ao salvar', async ({ page }) => {
    await abrirPref(page, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS });
    await page.locator('#emp-contas .conta-linha').nth(1).locator('.conta-nome').fill('');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    await expect.poll(async () => (await ler(page, 'sc_contas_fin')).length).toBe(1);
});

test('desativar mostra a linha como desativada e avisa que falta Salvar contas', async ({ page }) => {
    await abrirPref(page, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS, sc_mov_fin: [mov(1, 10, '2026-01-10', 'entrada', 50, 'x')] });
    await page.locator('#emp-contas .conta-linha').first().locator('button[title="Remover conta"]').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#emp-contas .conta-linha').first()).toContainText('clique em Salvar contas');
    expect((await ler(page, 'sc_contas_fin')).find(c => c.id === 10).ativo).toBe(true);
});

test('conta desativada pode ser reativada', async ({ page }) => {
    await abrirPref(page, { sc_contas_fin: [{ ...CAIXA, ativo: false }, BANCO], sc_meios_pag: MEIOS });
    await page.locator('#emp-contas .conta-linha').first().locator('button:has-text("Reativar")').click();
    await expect(page.locator('#emp-contas .conta-desativada')).toHaveCount(0);
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    expect((await ler(page, 'sc_contas_fin')).find(c => c.id === 10).ativo).toBe(true);
});

// ---- Conta inativa fora dos saldos e da previsao ----
const INATIVA = { ...BANCO, nome: 'Banco velho', ativo: false };

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Hoje: conta inativa fora do saldo total e da previsao', async ({ page }) => {
    const futuro = somarDias(HOJE, 3);
    await entrar(page, BASE, { sc_contas_fin: [CAIXA, INATIVA], sc_meios_pag: MEIOS, sc_mov_fin: [mov(1, 11, futuro, 'entrada', 777, 'Entrada futura do banco velho'), mov(2, 10, futuro, 'entrada', 10, 'Entrada do caixa')] });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#hoje-total')).toContainText('100,00');
    await expect(page.locator('#hoje-saldos')).not.toContainText('Banco velho');
    const semanas = await page.evaluate(() => _simPrevisao([]));
    expect(semanas[0].entradas).toBe(10);
});

test('Extrato: totais sem conta inativa, historico e filtro com (desativada)', async ({ page }) => {
    await abrirExtrato(page, { sc_contas_fin: [CAIXA, INATIVA], sc_meios_pag: MEIOS,
        sc_mov_fin: [mov(1, 11, MES + '-01', 'entrada', 55, 'Historico do banco velho'), mov(2, 10, MES + '-01', 'entrada', 20, 'Entrada caixa')] });
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('120,00');
    await expect(page.locator('#extrato-linhas')).toContainText('Historico do banco velho');
    await expect(page.locator('#extrato-conta option', { hasText: 'Banco velho (desativada)' })).toHaveCount(1);
    await page.locator('#extrato-conta').selectOption('11');
    await expect(page.locator('#extrato-linhas')).toContainText('Historico do banco velho');
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('355,00');
});

// ---- Mes antes da abertura ----
test('Extrato: mes antes da abertura da conta mostra 0 e a data de abertura', async ({ page }) => {
    const aberta = { ...CAIXA, saldo_inicial: 500, data_saldo_inicial: HOJE };
    await abrirExtrato(page, { sc_contas_fin: [aberta], sc_meios_pag: MEIOS });
    const mesAnt = iso(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15)).slice(0, 7);
    await page.locator('#extrato-mes').fill(mesAnt);
    await page.locator('#extrato-mes').dispatchEvent('change');
    expect(await txt(page.locator('#extrato-saldo-inicio'))).toContain('0,00');
    expect(await txt(page.locator('#extrato-saldo-fim'))).toContain('0,00');
    expect(await txt(page.locator('#extrato-saldo-fim'))).not.toContain('500');
    await expect(page.locator('#extrato-aviso-abertura')).toContainText('Conta aberta em ' + ddmmaaaa(HOJE));
});

// ---- Transferencia ----
async function abrirTransf(page) {
    await abrirExtrato(page, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS });
    await page.locator('#extrato-btn-transferir').click();
    return page.locator('#transf-modal');
}

test('transferencia: destino comeca vazio e e obrigatorio', async ({ page }) => {
    const m = await abrirTransf(page);
    expect(await m.locator('#transf-para').inputValue()).toBe('');
    await m.locator('#transf-valor').fill('10');
    await m.locator('#transf-ok').click();
    await expect(m.locator('#transf-erro')).toHaveText('Escolha a conta de destino.');
    expect((await ler(page, 'sc_mov_fin')) || []).toHaveLength(0);
});

test('transferencia: destino igual a origem e recusado', async ({ page }) => {
    const m = await abrirTransf(page);
    await m.locator('#transf-de').selectOption('10');
    await m.locator('#transf-para').selectOption('10');
    await m.locator('#transf-valor').fill('10');
    await m.locator('#transf-ok').click();
    await expect(m.locator('#transf-erro')).toHaveText('Escolha uma conta de destino diferente da origem.');
});

test('transferencia: data depois de hoje e recusada', async ({ page }) => {
    const m = await abrirTransf(page);
    await expect(m.locator('#transf-data')).toHaveAttribute('max', HOJE);
    await m.locator('#transf-de').selectOption('10');
    await m.locator('#transf-para').selectOption('11');
    await m.locator('#transf-valor').fill('10');
    await m.locator('#transf-data').fill(AMANHA);
    await m.locator('#transf-ok').click();
    await expect(m.locator('#transf-erro')).toHaveText('A data não pode ser depois de hoje.');
    expect((await ler(page, 'sc_mov_fin')) || []).toHaveLength(0);
});

// ---- Baixa com data futura / vazia (D2) ----
async function abrirBaixaCR(page, extras) {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS, sc_cr: [cr(1)], ...extras });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
}

test('baixa de recebimento: data depois de hoje e bloqueada', async ({ page }) => {
    await abrirBaixaCR(page);
    await page.evaluate(() => { marcarCRPago(1); });
    await expect(page.locator('#baixa-data')).toHaveAttribute('max', HOJE);
    await page.locator('#baixa-meio, #baixa-modal .baixa-meio').first().selectOption({ index: 1 });
    await page.locator('#baixa-data').fill(AMANHA);
    await expect(page.locator('#baixa-erro-data')).toHaveText('A data não pode ser depois de hoje.');
    await page.locator('#baixa-ok').click();
    await expect(page.locator('#baixa-modal')).toBeVisible();
    expect((await ler(page, 'sc_cr'))[0].status).toBe('Pendente');
});

test('baixa de recebimento: data vazia nao vira hoje', async ({ page }) => {
    await abrirBaixaCR(page);
    await page.evaluate(() => { marcarCRPago(1); });
    await page.locator('#baixa-modal .baixa-meio').first().selectOption({ index: 1 });
    await page.locator('#baixa-data').fill('');
    await page.locator('#baixa-ok').click();
    await expect(page.locator('#baixa-erro-data')).toHaveText('Informe a data.');
    await expect(page.locator('#baixa-modal')).toBeVisible();
    expect((await ler(page, 'sc_cr'))[0].status).toBe('Pendente');
});

test('baixa de pagamento: data depois de hoje e bloqueada', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA, BANCO], sc_meios_pag: MEIOS, sc_cp: [cp(5)] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    await page.evaluate(() => { marcarCPPago(5); });
    await expect(page.locator('#baixa-data')).toHaveAttribute('max', HOJE);
    await page.locator('#baixa-modal .baixa-meio').first().selectOption({ index: 1 });
    await page.locator('#baixa-data').fill(AMANHA);
    await page.locator('#baixa-ok').click();
    await expect(page.locator('#baixa-erro-data')).toHaveText('A data não pode ser depois de hoje.');
    expect((await ler(page, 'sc_cp'))[0].status).toBe('Pendente');
});

test('baixarContasReceber valida data e valor por conta propria e nao altera nada', async ({ page }) => {
    await abrirBaixaCR(page);
    const r = await page.evaluate(([amanha]) => {
        const linha = v => [{ id: 1, valor: v, meio_id: 21, meio_nome: 'Dinheiro', conta_id: 10, cartao: null }];
        const hoje = hojeLocal();
        return [
            baixarContasReceber(amanha, linha(100)), baixarContasReceber('', linha(100)),
            baixarContasReceber(hoje, linha(0)), baixarContasReceber(hoje, linha(150)), baixarContasReceber(hoje, linha('abc')),
            db.contas_receber[0].status, (db.movimentos_fin || []).length
        ];
    }, [AMANHA]);
    expect(r[0]).toEqual({ ok: false, erro: 'A data não pode ser depois de hoje.' });
    expect(r[1]).toEqual({ ok: false, erro: 'Informe a data.' });
    expect(r[2]).toEqual({ ok: false, erro: 'Informe um valor maior que zero.' });
    expect(r[3].ok).toBe(false);
    expect(r[4].ok).toBe(false);
    expect(r[5]).toBe('Pendente');
    expect(r[6]).toBe(0);
});

// ---- Sem vencimento / valor 0 ----
test('conta sem vencimento mostra "sem vencimento" nas listas e nao fica atrasada', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA], sc_meios_pag: MEIOS,
        sc_cr: [cr(1, { data_vencimento: undefined, descricao: 'Sem data' })], sc_cp: [cp(2, { data_vencimento: '', descricao: 'Sem data pagar' })] });
    await page.goto(BASE + '/financeiro.html');
    const semanas = await page.evaluate(() => _simPrevisao([]));
    expect(semanas.reduce((s, w) => s + w.entradas + w.saidas, 0)).toBe(0);
    await abrirLancamentos(page, 'receber');
    await expect(page.locator('#tb-contas-receber')).toContainText('sem vencimento');
    await expect(page.locator('#tb-contas-receber')).not.toContainText('Atrasado');
    await abrirLancamentos(page, 'pagar');
    await expect(page.locator('#tb-contas-pagar')).toContainText('sem vencimento');
    expect((await ler(page, 'sc_cr'))[0].status).toBe('Pendente');
});

test('conta a receber com vencimento vazio nao tem botao Cobrar; com vencimento vencido tem', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA], sc_meios_pag: MEIOS,
        sc_cr: [cr(1, { data_vencimento: '', descricao: 'Sem data' }), cr(2, { data_vencimento: somarDias(HOJE, -2), descricao: 'Vencida' })] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    const linhas = page.locator('#tb-contas-receber tr');
    expect(await acoesDaLinha(page, linhas.filter({ hasText: 'Vencida' }))).toContain('Cobrar no WhatsApp');
    await expect(linhas.filter({ hasText: 'Sem data' })).toHaveCount(1);
    expect(await acoesDaLinha(page, linhas.filter({ hasText: 'Sem data' }))).not.toContain('Cobrar no WhatsApp');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('item atrasado com valor 0 nao marca "inclui atrasados"', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA], sc_meios_pag: MEIOS, sc_cr: [cr(1, { valor: 0, data_vencimento: somarDias(HOJE, -5), status: 'Atrasado' })] });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#hoje-total')).toHaveText('R$ 100,00');
    await expect.poll(() => page.evaluate(() => _chartHoje && _chartHoje.data.labels.length)).toBe(8);
    await expect(page.locator('#hoje-previsao-legenda')).toHaveText('');
    expect((await page.evaluate(() => _chartHoje.data.labels)).some(l => l.endsWith('*'))).toBe(false);
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Hoje: previsao e legenda sem a conta desativada', async ({ page }) => {
    const inativo = { ...BANCO, ativo: false };
    await entrar(page, BASE, { sc_contas_fin: [CAIXA, inativo], sc_meios_pag: MEIOS,
        sc_mov_fin: [mov(1, 11, AMANHA, 'entrada', 1000, 'Repasse banco desativado')],
        sc_cr: [cr(2, { valor: 50, data_vencimento: somarDias(HOJE, -3), status: 'Atrasado' })] });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#hoje-total')).toHaveText('R$ 100,00');
    await expect(page.locator('#hoje-saldos')).not.toContainText('Banco');
    await expect(page.locator('#hoje-previsao-legenda')).toHaveText('* inclui atrasados');
    await expect.poll(() => page.evaluate(() => _chartHoje && _chartHoje.data.labels.length)).toBe(8);
    const dados = await page.evaluate(() => ({ labels: _chartHoje.data.labels, saldos: _chartHoje.data.datasets[0].data }));
    expect(dados.labels[0].endsWith('*')).toBe(true);
    // 100 do Caixa + 50 atrasado; os 1000 do banco desativado nao entram
    expect(dados.saldos[0]).toBe(150);
    expect(Math.max(...dados.saldos)).toBe(150);
});

// ---- Exclusoes (R2, R3) ----
test('excluir parcela em aberto com partes pagas: bloqueia', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA], sc_meios_pag: MEIOS,
        sc_cr: [cr(1, { valor: 60 }), cr(2, { valor: 40, status: 'Pago', data_pagamento: HOJE, parcela_origem_id: 1 })] });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { excluirCR(1); });
    await expect(page.locator('#sc-modal-msg')).toContainText('Esta parcela tem partes pagas. Estorne as partes antes de excluir.');
    await page.locator('#sc-modal-ok').click();
    expect(await ler(page, 'sc_cr')).toHaveLength(2);
});

test('excluir conta a pagar paga sem movimento: bloqueia; em aberto exclui', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA], sc_meios_pag: MEIOS,
        sc_cp: [cp(1, { status: 'Pago', data_pagamento: HOJE }), cp(2)] });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { excluirCP(1); });
    await expect(page.locator('#sc-modal-msg')).toContainText('Esta conta já foi paga. Estorne o pagamento antes de excluir.');
    await page.locator('#sc-modal-ok').click();
    expect(await ler(page, 'sc_cp')).toHaveLength(2);
    await page.evaluate(() => { excluirCP(2); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).length).toBe(1);
});

test('remocao dos movimentos da conta a pagar e funcao propria', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: [CAIXA], sc_meios_pag: MEIOS, sc_cp: [cp(1, { status: 'Pago', data_pagamento: HOJE })],
        sc_mov_fin: [{ id: 5, conta_id: 10, data: HOJE, sentido: 'saida', valor: 50, origem: 'cp', origem_id: 1, grupo_id: null, descricao: 'x' }, mov(6, 10, HOJE, 'entrada', 5, 'y')] });
    await page.goto(BASE + '/financeiro.html');
    const r = await page.evaluate(() => [removerMovimentosDaBaixaCP(1), db.movimentos_fin.map(m => m.id)]);
    expect(r).toEqual([1, [6]]);
});
