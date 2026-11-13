// Financeiro Fase 2, tarefa 2: meta padrao, orcamento, categoria Imposto
// (com mes de referencia) e a permissao "Resultado do mes".
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const importar = (page, dados) => page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json', { type: 'application/json' })], value: '' } }), JSON.stringify(dados));

test('meta padrao e orcamento salvos sem apagar outros campos da empresa', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'CORTINAS X', regime_tributario: 'simples', aliquota_estimada: 6 } });
    await page.goto(BASE + '/empresa.html#preferencias');
    await page.fill('#emp-meta-padrao', '30.000');
    await page.fill('#orc-fornecedores', '12.000,50');
    await page.fill('#orc-fixas', '4000');
    await page.click('#emp-orcamento-card button:has-text("Salvar")');
    const emp = await ler(page, 'sc_empresa');
    expect(emp.meta_faturamento_padrao).toBe(30000);
    expect(emp.orcamento_padrao).toEqual({ fornecedores: 12000.5, fixas: 4000 });
    expect(emp).toMatchObject({ razao_social: 'CORTINAS X', regime_tributario: 'simples', aliquota_estimada: 6 });
    await page.reload();
    await expect(page.locator('#emp-meta-padrao')).toHaveValue('30000');
    await expect(page.locator('#orc-fornecedores')).toHaveValue('12000.5');
    await expect(page.locator('#orc-servicos')).toHaveValue('');
});

test('conta de imposto tem mes de referencia preenchido com o mes anterior ao vencimento e editavel', async ({ page }) => {
    await entrar(page, BASE, { sc_cp: [] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="pagar"]').click();
    await page.evaluate(() => abrirModalContaPagar());
    await expect(page.locator('#cpm-mes-ref')).toBeHidden();
    await page.fill('#cpm-descricao', 'DAS');
    await page.fill('#cpm-valor', '500');
    await page.fill('#cpm-vencimento', '2027-01-20');
    await page.selectOption('#cpm-categoria', 'imposto');
    await expect(page.locator('#cpm-mes-ref')).toBeVisible();
    await expect(page.locator('#cpm-mes-ref')).toHaveValue('2026-12');
    await page.fill('#cpm-vencimento', '2027-03-10');
    await expect(page.locator('#cpm-mes-ref')).toHaveValue('2027-02');
    await page.fill('#cpm-mes-ref', '2027-01');
    await page.fill('#cpm-vencimento', '2027-05-10');
    await expect(page.locator('#cpm-mes-ref')).toHaveValue('2027-01');
    await page.click('button:has-text("Lançar Conta a Pagar")');
    await expect.poll(async () => (await ler(page, 'sc_cp') || []).length).toBe(1);
    const c = (await ler(page, 'sc_cp'))[0];
    expect(c).toMatchObject({ categoria: 'imposto', mes_referencia: '2027-01' });
});

test('categoria Imposto aparece no grafico de despesas com rotulo', async ({ page }) => {
    // Fase 2: o grafico conta o imposto pela referencia (guia do mes, paga ou em aberto).
    const hoje = iso(new Date());
    await entrar(page, BASE, { sc_cp: [{ id: 1, tipo: 'variavel', categoria: 'imposto', descricao: 'DAS', valor: 300, mes_referencia: hoje.slice(0, 7), data_vencimento: hoje, data_pagamento: null, status: 'Pendente' }] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect.poll(() => page.evaluate(() => { const c = Chart.getChart('chart-fin-desp'); return c ? c.data.labels : null; })).toEqual(['Imposto']);
});

test('papel Vendedor salvo nao ganha Resultado do mes; Financeiro ganha', async ({ page }) => {
    const nivel = n => ({ nivel: n, acoes_restritas: [] });
    const papeis = [
        { id: 1, nome: 'Administrador', permissoes: { financeiro: nivel('completo'), configuracoes: nivel('completo') } },
        { id: 2, nome: 'Financeiro', permissoes: { financeiro: nivel('completo') } },
        { id: 3, nome: 'Vendedor/Atendimento', permissoes: { financeiro: nivel('visualizar'), 'financeiro.dashboard': nivel('sem_acesso') } }
    ];
    await entrar(page, BASE, { sc_pap: papeis });
    await page.goto(BASE + '/configuracoes.html');
    const r = await page.evaluate(() => {
        const n = (papel, k) => resolverPermissao(k, { papel_id: papel, permissoes_extras: {} }).nivel;
        return { v: n(3, 'financeiro.resultado'), a: n(1, 'financeiro.resultado'), f: n(2, 'financeiro.resultado') };
    });
    expect(r).toEqual({ v: 'sem_acesso', a: 'completo', f: 'completo' });
    expect(await page.evaluate(() => [MODULOS_PERMISSAO.find(m => m.key === 'financeiro').subs.some(s => s.key === 'resultado' && s.label === 'Resultado do mês'), FIN_TAB_MODULO.resultado])).toEqual([true, 'financeiro.resultado']);
});

test('exportar e importar levam meta, orcamento e ajustes', async ({ page }) => {
    const emp = { razao_social: 'X', meta_faturamento_padrao: 30000, orcamento_padrao: { fixas: 4000 } };
    const metas = { '2026-11': 35000 };
    const orcMes = { '2026-11': { fixas: 4500 } };
    await entrar(page, BASE, { sc_empresa: emp, sc_fin_metas: metas, sc_fin_orcamento_mes: orcMes, sc_cp: [], sc_ped: [] });
    await page.goto(BASE + '/index.html');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportarDados())]);
    const arq = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
    expect(arq.empresa).toMatchObject(emp);
    expect(arq.fin_metas).toEqual(metas);
    expect(arq.fin_orcamento_mes).toEqual(orcMes);
    await page.evaluate(() => { localStorage.removeItem('sc_fin_metas'); localStorage.removeItem('sc_fin_orcamento_mes'); localStorage.removeItem('sc_empresa'); });
    await importar(page, arq);
    await page.locator('#sc-modal-ok').click();
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_metas'))).not.toBeNull();
    expect(await ler(page, 'sc_fin_metas')).toEqual(metas);
    expect(await ler(page, 'sc_fin_orcamento_mes')).toEqual(orcMes);
    expect(await ler(page, 'sc_empresa')).toMatchObject(emp);
    // backup antigo: ajustes voltam ao padrao vazio
    await importar(page, { clientes: [], catalogo: [], pedidos: [] });
    await page.locator('#sc-modal-ok').click();
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_metas'))).toBe('{}');
    expect(await ler(page, 'sc_fin_orcamento_mes')).toEqual({});
});
