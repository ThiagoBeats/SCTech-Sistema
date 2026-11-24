// Financeiro novo, entrega 1, tarefa 4: 4 abas (Resumo, Lancamentos, Fluxo de caixa, DRE), telas antigas
// desligadas (FIN_RECURSOS_ANTIGOS), permissoes novas migradas das antigas, links antigos e alertas.
// Relogio fixo em todos.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 24, 10, 0, 0);
const N = n => ({ nivel: n, acoes_restritas: [] });
const USU = (papel, extras) => [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Vendedora', email: 'vend@sctech.local', papel_id: papel, ativo: true, permissoes_extras: extras || {}, senha_hash: '' },
];
const comoUsuario = (page, id, email) => page.evaluate(u => sessionStorage.setItem('sc_user', JSON.stringify(u)), { id, email });
const abas = page => page.locator('.fin-tab-btn:visible');
const lerPap = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_pap')));

// `papel`: papel extra (alem dos padrao) gravado em sc_pap, no formato antigo, para a migracao tratar.
async function abrir(page, dados, pagina, papel) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, dados || {});
    if (papel) await page.evaluate(p => localStorage.setItem('sc_pap', JSON.stringify([...papeisPadrao(), p])), papel);
    await page.goto(BASE + '/' + (pagina || 'financeiro.html'));
}

test('Administrador ve so 4 abas e nenhuma das telas antigas', async ({ page }) => {
    await abrir(page);
    await expect(abas(page)).toHaveText(['Resumo', 'Lançamentos', 'Fluxo de caixa', 'DRE']);
    for (const t of ['Hoje', 'Visão Geral', 'Resultado do mês', 'Simular', 'Despesas Fixas', 'DRE por Pedido', 'Extrato'])
        await expect(page.locator('.tab-nav')).not.toContainText(t);
    await expect(page.locator('.fin-tab-btn[data-tab="resumo"]')).toHaveClass(/active/);
});

test('Fluxo de caixa mostra o Extrato provisorio e DRE mostra o quadro da DRE', async ({ page }) => {
    await abrir(page);
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    await expect(page.locator('#fin-fluxo')).toContainText('Versão provisória: o novo Fluxo de caixa chega na próxima atualização.');
    await expect(page.locator('#extrato-linhas')).toBeAttached();
    await expect(page.locator('#extrato-btn-transferir')).toBeVisible();
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    await expect(page.locator('#fin-dre')).toContainText('DRE — Resultado da empresa');
    await expect(page.locator('#fin-fluxo')).toBeHidden();
});

test('usuario so com Recorrencias ve Lancamentos aberto em Recorrencias', async ({ page }) => {
    const papel = { id: 23, nome: 'So Fixas', permissoes: { inicio: N('completo'), financeiro: N('sem_acesso'), 'financeiro.fixas': N('completo') } };
    await abrir(page, { sc_usr: USU(23) }, 'index.html', papel);
    await comoUsuario(page, 2, 'vend@sctech.local');
    await page.goto(BASE + '/financeiro.html');
    await expect(abas(page)).toHaveText(['Lançamentos']);
    await expect(page.locator('.fin-lado-btn:visible')).toHaveText(['Recorrências']);
    await expect(page.locator('#fin-fixas')).toBeVisible();
});

test('usuario sem nenhuma aba do Financeiro volta para a tela inicial', async ({ page }) => {
    const papel = { id: 24, nome: 'So Simulador', permissoes: { inicio: N('completo'), financeiro: N('sem_acesso'), 'financeiro.simulador': N('completo') } };
    await abrir(page, { sc_usr: USU(24) }, 'index.html', papel);
    await comoUsuario(page, 2, 'vend@sctech.local');
    await page.goto(BASE + '/financeiro.html');
    await expect(page).toHaveURL(/index\.html/);
});

test('alertas de vencimento por lado: so receber ve so o lado receber', async ({ page }) => {
    const cr = { id: 1, cliente_nome: 'Cliente Hoje', valor: 100, status: 'Pendente', data_vencimento: '2026-11-24' };
    const cp = { id: 2, descricao: 'Fornecedor', valor: 900, status: 'Pendente', data_vencimento: '2026-11-24' };
    await abrir(page, { sc_cr: [cr], sc_cp: [cp], sc_usr: USU(3) }, 'index.html');
    await comoUsuario(page, 2, 'vend@sctech.local');
    await page.goto(BASE + '/index.html');
    const t = await page.evaluate(() => finAlertasCalcular(hojeLocal()).filter(a => a.tipo === 'fin_vencimento').map(a => a.html));
    expect(t).toHaveLength(1);
    expect(t[0]).toContain('1 conta(s) vencem hoje');
    expect(t[0]).toContain('1 a receber');
    expect(t[0]).not.toContain('a pagar');
});

test('Lancamentos tem Contas a pagar, Contas a receber e Recorrencias', async ({ page }) => {
    await abrir(page, { sc_cr: [{ id: 1, cliente_nome: 'Ana', descricao: 'Venda', valor: 100, status: 'Pendente', data_vencimento: '2026-12-01' }] });
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click();
    await expect(page.locator('.fin-lado-btn:visible')).toHaveText(['Contas a pagar', 'Contas a receber', 'Recorrências']);
    await page.locator('.fin-lado-btn[data-lado="receber"]').click();
    await page.fill('#lanc-de', ''); await page.fill('#lanc-ate', '');
    await expect(page.locator('#tb-contas-receber')).toContainText('Ana');
    await expect(page.locator('#fin-lanc')).toBeVisible();
    await expect(page.locator('#fin-fixas')).toBeHidden();
    await page.locator('.fin-lado-btn[data-lado="fixas"]').click();
    await expect(page.locator('#df-descricao')).toBeVisible();
});

test('papel antigo so com Contas a receber ve so Lancamentos e so Contas a receber', async ({ page }) => {
    const papel = { id: 20, nome: 'So Receber', permissoes: { inicio: N('completo'), financeiro: N('sem_acesso'), 'financeiro.receber': N('completo') } };
    await abrir(page, { sc_usr: USU(20) }, 'index.html', papel);
    await comoUsuario(page, 2, 'vend@sctech.local');
    await page.goto(BASE + '/financeiro.html');
    await expect(abas(page)).toHaveText(['Lançamentos']);
    await expect(page.locator('.fin-lado-btn:visible')).toHaveText(['Contas a receber']);
    await expect(page.locator('#fin-lanc')).toBeVisible();
    await expect(page.locator('.fin-lado-btn[data-lado="receber"]')).toHaveClass(/active/);
    await expect(page.locator('#tb-contas-receber')).toBeAttached();
    await expect(page.locator('#tb-contas-pagar')).toHaveCount(0);
});

test('Vendedor padrao: so Lancamentos, so Contas a receber', async ({ page }) => {
    await abrir(page, { sc_usr: USU(3) }, 'index.html');
    await comoUsuario(page, 2, 'vend@sctech.local');
    await page.goto(BASE + '/financeiro.html');
    await expect(abas(page)).toHaveText(['Lançamentos']);
    await expect(page.locator('.fin-lado-btn:visible')).toHaveText(['Contas a receber']);
});

test('papel antigo com Visao Geral ganha Resumo; Extrato vira Fluxo; Resultado vira DRE', async ({ page }) => {
    const papel = { id: 21, nome: 'Painel', permissoes: { inicio: N('completo'), financeiro: N('sem_acesso'), 'financeiro.dashboard': N('visualizar'),
        'financeiro.hoje': N('sem_acesso'), 'financeiro.extrato': N('completo'), 'financeiro.resultado': N('visualizar'), 'financeiro.dre': N('sem_acesso') } };
    await abrir(page, { sc_usr: USU(21) }, 'index.html', papel);
    await comoUsuario(page, 2, 'vend@sctech.local');
    await page.goto(BASE + '/financeiro.html');
    await expect(abas(page)).toHaveText(['Resumo', 'Fluxo de caixa', 'DRE']);
    const p = (await lerPap(page)).find(x => x.id === 21).permissoes;
    expect([p['financeiro.resumo'].nivel, p['financeiro.fluxo'].nivel, p['financeiro.dre'].nivel]).toEqual(['visualizar', 'completo', 'visualizar']);
});

test('migracao das permissoes roda uma vez e vale tambem para permissoes_extras', async ({ page }) => {
    const papel = { id: 22, nome: 'Hoje', permissoes: { financeiro: N('sem_acesso'), 'financeiro.hoje': N('completo'), 'financeiro.dashboard': N('sem_acesso') } };
    const usuarios = USU(22, { 'financeiro.dashboard': N('visualizar'), 'financeiro.resultado': N('completo') });
    await abrir(page, { sc_usr: usuarios }, 'index.html', papel);
    const r = await page.evaluate(() => {
        migrarPermissoesSalvas();
        const um = JSON.stringify([JSON.parse(localStorage.getItem('sc_pap')), JSON.parse(localStorage.getItem('sc_usr'))]);
        migrarPermissoesSalvas();
        const dois = JSON.stringify([JSON.parse(localStorage.getItem('sc_pap')), JSON.parse(localStorage.getItem('sc_usr'))]);
        return { um, dois, pap: db.papeis.find(p => p.id === 22).permissoes, extras: db.usuarios.find(u => u.id === 2).permissoes_extras };
    });
    expect(r.um).toBe(r.dois);
    expect(r.pap['financeiro.resumo'].nivel).toBe('completo');
    expect(r.extras['financeiro.resumo'].nivel).toBe('visualizar');
    expect(r.extras['financeiro.dre'].nivel).toBe('completo');
    expect(r.extras['financeiro.fluxo']).toBeUndefined();
});

test('links antigos abrem a aba que hoje cuida do assunto', async ({ page }) => {
    await abrir(page);
    await page.goto(BASE + '/financeiro.html?tab=extrato');
    await expect(page.locator('.fin-tab-btn[data-tab="fluxo"]')).toHaveClass(/active/);
    await page.goto(BASE + '/financeiro.html?tab=hoje');
    await expect(page.locator('.fin-tab-btn[data-tab="resumo"]')).toHaveClass(/active/);
    await page.goto(BASE + '/financeiro.html?aba=pagar');
    await expect(page.locator('.fin-tab-btn[data-tab="lancamentos"]')).toHaveClass(/active/);
    await expect(page.locator('#fin-lanc')).toBeVisible();
    await expect(page.locator('.fin-lado-btn[data-lado="pagar"]')).toHaveClass(/active/);
    await page.goto(BASE + '/index.html');
    await page.goto(BASE + '/financeiro.html#resultado');
    await expect(page.locator('.fin-tab-btn[data-tab="resumo"]')).toHaveClass(/active/);
    await page.goto(BASE + '/financeiro.html?view=receber');
    await expect(page.locator('#fin-lanc')).toBeVisible();
    await expect(page.locator('.fin-lado-btn[data-lado="receber"]')).toHaveClass(/active/);
});

test('editor de papeis lista as 6 subpermissoes novas do Financeiro', async ({ page }) => {
    await abrir(page, {}, 'configuracoes.html#papeis');
    await page.evaluate(() => abrirModalPapel(1));
    for (const k of ['resumo', 'receber', 'pagar', 'fixas', 'fluxo', 'dre'])
        await expect(page.locator(`input[name="papel-nivel-financeiro.${k}"]`).first()).toBeAttached();
    for (const k of ['hoje', 'dashboard', 'extrato', 'resultado', 'simulador'])
        await expect(page.locator(`input[name="papel-nivel-financeiro.${k}"]`)).toHaveCount(0);
    expect(await page.locator('.cfg-row-sub .cfg-sub-label').allInnerTexts()).toEqual(expect.arrayContaining(['Resumo', 'Contas a receber', 'Contas a pagar', 'Recorrências', 'Fluxo de caixa', 'DRE']));
});

test('alerta de vencimento do sino leva a Lancamentos; gap de caixa ao Fluxo de caixa; meta e tendencia nao existem', async ({ page }) => {
    const cr = { id: 1, cliente_nome: 'Cliente Hoje', valor: 100, status: 'Pendente', data_vencimento: '2026-11-24' };
    const cp = { id: 2, descricao: 'Fornecedor', valor: 900, status: 'Pendente', data_vencimento: '2026-11-26' };
    await abrir(page, { sc_cr: [cr], sc_cp: [cp], sc_empresa: { razao_social: 'X', meta_faturamento_padrao: 1000 } }, 'index.html');
    const alertas = await page.evaluate(() => finAlertasCalcular(hojeLocal()).map(a => [a.tipo, a.aba]));
    expect(alertas).toContainEqual(['fin_vencimento', 'lancamentos']);
    expect(alertas).toContainEqual(['fin_gap', 'fluxo']);
    expect(alertas.map(a => a[0])).not.toContain('fin_meta');
    expect(alertas.map(a => a[0])).not.toContain('fin_tendencia');
    await page.hover('#sino-btn');
    await page.locator('#sino-painel .sino-item', { hasText: 'vencem hoje' }).click();
    await expect(page).toHaveURL(/financeiro\.html/);
    await expect(page.locator('.fin-tab-btn[data-tab="lancamentos"]')).toHaveClass(/active/);
    await expect(page).not.toHaveURL(/aba=/);
});
