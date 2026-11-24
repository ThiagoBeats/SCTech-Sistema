// Financeiro novo, entrega 2, tarefa 2: tela DRE (tabela anual, grupos expansiveis, regime, detalhe e categorias).
// Relogio fixo em todos: 24/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 24, 10, 0, 0);
const N = n => ({ nivel: n, acoes_restritas: [] });
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const hist = [{ em: '2026-11-01T12:00:00.000Z', por: 1, porNome: 'Teste', acao: 'criado', detalhe: 'Lançamento manual' }];

// Recebimento de 5.000 em marco com competencia em abril; custo de 1.200 e aluguel de 1.000 em marco.
const CR = [
    { id: 1, cliente_nome: 'Bia', descricao: 'Venda do pedido', valor: 5000, status: 'Pago', data_vencimento: '2026-03-10', data_pagamento: '2026-03-10', data_competencia: '2026-04-05', categoria_id: 'cat_vendas', historico: hist },
    { id: 2, cliente_nome: 'Ana', descricao: 'Venda de maio', valor: 3000, status: 'Pago', data_vencimento: '2026-05-10', data_pagamento: '2026-05-10', data_competencia: '2026-05-10', categoria_id: 'cat_vendas', historico: hist },
];
const CP = [
    { id: 1, tipo: 'variavel', categoria: 'costureira', credor_nome: 'Dona Rita', descricao: 'Costura de marco', valor: 1200, status: 'Pago', data_vencimento: '2026-03-15', data_pagamento: '2026-03-15', data_competencia: '2026-03-15', categoria_id: 'cat_costureira', historico: hist },
    { id: 2, tipo: 'fixo', categoria: 'aluguel', credor_nome: 'Imobiliaria Sol', descricao: 'Aluguel de marco', valor: 1000, status: 'Pago', data_vencimento: '2026-03-05', data_pagamento: '2026-03-05', data_competencia: '2026-03-01', categoria_id: 'cat_aluguel', historico: hist },
];
const PAP = { id: 30, nome: 'So ver DRE', permissoes: { inicio: N('completo'), financeiro: N('sem_acesso'), 'financeiro.dre': N('visualizar') } };
const USU = [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Leitora', email: 'leitora@sctech.local', papel_id: 30, ativo: true, permissoes_extras: {}, senha_hash: '' },
];

async function abrir(page, extras) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cr: CR, sc_cp: CP, ...(extras || {}) });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    await expect(page.locator('#dre-tabela')).toBeVisible();
}
const linha = (page, chave) => page.locator('#dre-tabela tr[data-chave="' + chave + '"]');
const celulas = (page, chave) => linha(page, chave).locator('td');
const abrirGrupo = (page, chave) => linha(page, chave).locator('.dre-tg').click();

test('tabela: 8 linhas na ordem, Total 2026 e recolhida por padrao', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#fin-dre h3').first()).toHaveText('DRE — Resultado da empresa');
    await expect(page.locator('#dre-tabela tbody tr')).toHaveCount(9);
    const chaves = await page.locator('#dre-tabela tbody tr').evaluateAll(l => l.map(x => x.dataset.chave));
    expect(chaves).toEqual(['receitas', 'custos', 'margem', 'margem_pct', 'despesas', 'resultadoOperacional', 'investimento', 'financiamento', 'liquido']);
    await expect(page.locator('#dre-tabela thead th').first()).toHaveText('RESULTADO');
    await expect(page.locator('#dre-tabela thead th').nth(1)).toHaveText('Jan/26');
    await expect(page.locator('#dre-tabela thead th').nth(12)).toHaveText('Dez/26');
    await expect(page.locator('#dre-tabela thead th').nth(13)).toHaveText('Total 2026');
    // Caixa: marco 5.000, maio 3.000; total = soma
    await expect(celulas(page, 'receitas').nth(2)).toHaveText('5.000');
    await expect(celulas(page, 'receitas').nth(4)).toHaveText('3.000');
    await expect(celulas(page, 'receitas').nth(12)).toHaveText('8.000');
    await expect(celulas(page, 'liquido').nth(12)).toHaveText('5.800');
    await expect(page.locator('#dre-tabela')).not.toContainText('Aluguel');
    await expect(page.locator('#dre-tabela')).not.toContainText('Costureira');
    await expect(linha(page, 'liquido')).toHaveClass(/dre-liquido/);
    await expect(linha(page, 'margem_pct')).toContainText('%');
});

test('expandir: Despesas operacionais mostra subgrupos e Despesas fixas mostra Aluguel; custo entre parenteses em vermelho', async ({ page }) => {
    await abrir(page);
    await abrirGrupo(page, 'despesas');
    await expect(linha(page, 'sub:sub_fix')).toBeVisible();
    await expect(linha(page, 'sub:sub_var')).toBeVisible();
    await expect(linha(page, 'cat:cat_aluguel')).toHaveCount(0);
    await abrirGrupo(page, 'sub:sub_fix');
    await expect(linha(page, 'cat:cat_aluguel')).toBeVisible();
    await expect(celulas(page, 'cat:cat_aluguel').nth(2)).toHaveText('(1.000)');
    // recolher o grupo esconde tudo de novo
    await abrirGrupo(page, 'despesas');
    await expect(linha(page, 'cat:cat_aluguel')).toHaveCount(0);
    await expect(linha(page, 'sub:sub_fix')).toHaveCount(0);
    // custo: (1.200) com a classe vermelha
    const custo = celulas(page, 'custos').nth(2);
    await expect(custo).toHaveText('(1.200)');
    await expect(custo).toHaveClass(/dre-neg/);
    await expect(celulas(page, 'receitas').nth(2)).not.toHaveClass(/dre-neg/);
});

test('Competencia muda o mes de um recebimento com competencia em outro mes', async ({ page }) => {
    await abrir(page);
    await abrirGrupo(page, 'receitas');
    await expect(celulas(page, 'cat:cat_vendas').nth(2)).toHaveText('5.000');
    await expect(celulas(page, 'cat:cat_vendas').nth(3)).toHaveText('0');
    await page.locator('#dre-regime-competencia').click();
    await expect(page.locator('#dre-regime-competencia')).toHaveClass(/active/);
    await expect(celulas(page, 'cat:cat_vendas').nth(2)).toHaveText('0');
    await expect(celulas(page, 'cat:cat_vendas').nth(3)).toHaveText('5.000');
    // o estado de expandido sobrevive a troca de regime
    await expect(linha(page, 'cat:cat_vendas')).toBeVisible();
});

test('clicar no valor de Aluguel em marco lista o lancamento e abre em Lancamentos com a linha destacada; valor 0 nao clica', async ({ page }) => {
    await abrir(page);
    await abrirGrupo(page, 'despesas');
    await abrirGrupo(page, 'sub:sub_fix');
    await celulas(page, 'cat:cat_aluguel').nth(3).click({ force: true });
    await expect(page.locator('#dre-detalhe-overlay')).toHaveCount(0);
    await celulas(page, 'cat:cat_aluguel').nth(2).click();
    const det = page.locator('#dre-detalhe-overlay');
    await expect(det.locator('h3')).toHaveText('Aluguel — Março/2026');
    await expect(det).toContainText('05/03/2026');
    await expect(det).toContainText('Aluguel de marco');
    await expect(det).toContainText('Imobiliaria Sol');
    await expect(det).toContainText('R$ 1.000,00');
    await expect(page.locator('#dre-det-total')).toHaveText('Total: R$ 1.000,00');
    await det.locator('tr.dre-det-linha').click();
    await expect(page.locator('.fin-tab-btn[data-tab="lancamentos"]')).toHaveClass(/active/);
    await expect(page.locator('#tb-contas-pagar tr.lanc-destaque')).toContainText('Aluguel de marco');
});

test('Categorias: criar Frete em Despesas > variaveis aparece no formulario; desativar some; nome repetido avisa', async ({ page }) => {
    await abrir(page);
    await page.locator('#dre-btn-categorias').click();
    await page.locator('#dre-btn-nova-cat').click();
    await page.fill('#dre-nc-nome', 'Frete');
    await page.selectOption('#dre-nc-grupo', 'despesas');
    await page.selectOption('#dre-nc-sub', 'sub_var');
    await page.locator('#dre-nc-salvar').click();
    const cats = await ler(page, 'sc_fin_cat');
    const frete = cats.categorias.find(c => c.nome === 'Frete');
    expect(frete).toMatchObject({ grupo: 'despesas', subgrupo_id: 'sub_var', tipo: 'saida', ativo: true });
    // nome repetido no mesmo grupo
    await page.locator('#dre-btn-nova-cat').click();
    await page.fill('#dre-nc-nome', 'frete');
    await page.locator('#dre-nc-salvar').click();
    await expect(page.locator('#dre-cat-aviso')).toHaveText('Já existe uma categoria com esse nome neste grupo.');
    expect((await ler(page, 'sc_fin_cat')).categorias.filter(c => c.nome.toLowerCase() === 'frete')).toHaveLength(1);
    await page.locator('#dre-cat-overlay .modal-close').click();
    // formulario de novo lancamento a pagar
    await abrirLancamentos(page, 'pagar');
    await page.locator('#lanc-novo').click();
    await expect(page.locator('#lf-categoria option', { hasText: 'Frete' })).toHaveCount(1);
    await page.locator('#lanc-form-overlay .modal-close').click();
    // desativar
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    await page.locator('#dre-btn-categorias').click();
    await page.locator('.dre-cat-linha[data-id="' + frete.id + '"] .dre-cat-ativo').click();
    expect((await ler(page, 'sc_fin_cat')).categorias.find(c => c.nome === 'Frete').ativo).toBe(false);
    await page.locator('#dre-cat-overlay .modal-close').click();
    await abrirLancamentos(page, 'pagar');
    await page.locator('#lanc-novo').click();
    await expect(page.locator('#lf-categoria option', { hasText: 'Frete' })).toHaveCount(0);
});

test('Categorias: renomear, mover de subgrupo, novo subgrupo e excluir so sem lancamentos', async ({ page }) => {
    await abrir(page);
    await page.locator('#dre-btn-categorias').click();
    // Aluguel tem lancamento: sem Excluir
    await expect(page.locator('.dre-cat-linha[data-id="cat_aluguel"] .dre-cat-excluir')).toHaveCount(0);
    await page.locator('#dre-btn-novo-sub').click();
    await page.fill('#dre-ns-nome', 'Marketing');
    await page.locator('#dre-ns-salvar').click();
    const subs = (await ler(page, 'sc_fin_cat')).subgrupos;
    const mkt = subs.find(s => s.nome === 'Marketing');
    expect(mkt.grupo).toBe('despesas');
    await page.selectOption('.dre-cat-linha[data-id="cat_aluguel"] .dre-cat-sub', mkt.id);
    const nome = page.locator('.dre-cat-linha[data-id="cat_aluguel"] .dre-cat-nome');
    await nome.fill('Aluguel da loja');
    await nome.blur();
    const c = (await ler(page, 'sc_fin_cat')).categorias.find(x => x.id === 'cat_aluguel');
    expect(c).toMatchObject({ nome: 'Aluguel da loja', subgrupo_id: mkt.id });
    // categoria nova sem lancamento pode ser excluida
    await page.locator('#dre-btn-nova-cat').click();
    await page.fill('#dre-nc-nome', 'Brinde');
    await page.locator('#dre-nc-salvar').click();
    const excluir = page.locator('.dre-cat-linha', { has: page.locator('input[value="Brinde"]') }).locator('.dre-cat-excluir');
    await excluir.click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Excluir a categoria Brinde?');
    await page.locator('#sc-modal-cancel').click();
    expect((await ler(page, 'sc_fin_cat')).categorias.some(x => x.nome === 'Brinde')).toBe(true);
    await excluir.click();
    await page.locator('#sc-modal-ok').click();
    expect((await ler(page, 'sc_fin_cat')).categorias.some(x => x.nome === 'Brinde')).toBe(false);
});

test('categoria desativada com valor continua na DRE marcada (inativa) e o total nao muda', async ({ page }) => {
    await abrir(page);
    const antes = await celulas(page, 'liquido').nth(12).textContent();
    await page.locator('#dre-btn-categorias').click();
    await page.locator('.dre-cat-linha[data-id="cat_aluguel"] .dre-cat-ativo').click();
    await page.locator('#dre-cat-overlay .modal-close').click();
    await abrirGrupo(page, 'despesas');
    await abrirGrupo(page, 'sub:sub_fix');
    await expect(linha(page, 'cat:cat_aluguel')).toContainText('(inativa)');
    await expect(celulas(page, 'liquido').nth(12)).toHaveText(antes);
});

test('usuario com DRE so visualizar nao ve o botao Categorias', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cr: CR, sc_cp: CP, sc_usr: USU });
    await page.evaluate(p => localStorage.setItem('sc_pap', JSON.stringify([...papeisPadrao(), p])), PAP);
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'leitora@sctech.local' })));
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#dre-tabela')).toBeVisible();
    await expect(page.locator('#dre-btn-pdf')).toBeVisible();
    await expect(page.locator('#dre-btn-categorias')).toHaveCount(0);
});

test('botoes Relatorios, PDF, Excel e Imprimir aparecem', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#dre-btn-relatorios')).toHaveText('Relatórios');
    await expect(page.locator('#dre-btn-pdf')).toHaveText('PDF');
    await expect(page.locator('#dre-btn-excel')).toHaveText('Excel');
    await expect(page.locator('#dre-btn-imprimir')).toHaveText('Imprimir');
});

test('ano sem dados mostra zeros e sem erro', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await abrir(page);
    await page.evaluate(() => finDreMudarAno(2024));
    await expect(page.locator('#dre-tabela thead th').nth(13)).toHaveText('Total 2024');
    await expect(celulas(page, 'receitas').nth(0)).toHaveText('0');
    await expect(celulas(page, 'liquido').nth(12)).toHaveText('0');
    await expect(celulas(page, 'margem_pct').nth(0)).toHaveText('—');
    expect(erros).toEqual([]);
});

test('celular 390px: sem rolagem horizontal da pagina e primeira coluna fixa; tema escuro legivel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await abrir(page);
    await abrirGrupo(page, 'despesas');
    const larg = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, jan: innerWidth, quadro: document.querySelector('.dre-quadro').scrollWidth, quadroW: document.querySelector('.dre-quadro').clientWidth }));
    expect(larg.doc).toBeLessThanOrEqual(larg.jan);
    expect(larg.quadro).toBeGreaterThan(larg.quadroW);
    expect(await page.locator('#dre-tabela tbody th.dre-rot').first().evaluate(e => getComputedStyle(e).position)).toBe('sticky');
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
    await page.waitForTimeout(600); // as cores fazem transicao ao trocar de tema
    const cores = await page.evaluate(() => {
        const f = e => getComputedStyle(e);
        const t = document.querySelector('#dre-tabela tr[data-chave="receitas"] th'), v = document.querySelector('#dre-tabela tr[data-chave="custos"] td.dre-neg');
        return { texto: f(t).color, fundo: f(t).backgroundColor, neg: f(v).color, fundoNeg: f(v).backgroundColor };
    });
    const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
    const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
    expect(contraste(cores.texto, cores.fundo)).toBeGreaterThan(4.5);
    expect(contraste(cores.neg, cores.fundoNeg)).toBeGreaterThan(3);
});

test('subgrupo em Custos: criar, mover Tecido para ele e ver na tabela sob Custos', async ({ page }) => {
    const cp = [{ id: 5, tipo: 'variavel', categoria: 'tecido', credor_nome: 'RC', descricao: 'Tecido de marco', valor: 700, status: 'Pago', data_vencimento: '2026-03-12', data_pagamento: '2026-03-12', data_competencia: '2026-03-12', categoria_id: 'cat_tecido', historico: hist }];
    await abrir(page, { sc_cp: cp });
    await page.locator('#dre-btn-categorias').click();
    await page.locator('#dre-btn-novo-sub').click();
    await page.fill('#dre-ns-nome', 'Matéria-prima');
    await page.selectOption('#dre-ns-grupo', 'custos');
    await page.locator('#dre-ns-salvar').click();
    const mp = (await ler(page, 'sc_fin_cat')).subgrupos.find(x => x.nome === 'Matéria-prima');
    expect(mp.grupo).toBe('custos');
    await page.selectOption('.dre-cat-linha[data-id="cat_tecido"] .dre-cat-sub', mp.id);
    await page.locator('#dre-cat-overlay .modal-close').click();
    await abrirGrupo(page, 'custos');
    await expect(linha(page, 'sub:' + mp.id)).toBeVisible();
    await expect(celulas(page, 'sub:' + mp.id).nth(2)).toHaveText('(700)');
    await expect(linha(page, 'cat:cat_tecido')).toHaveCount(0);
    await expect(linha(page, 'cat:cat_costureira')).toBeVisible();
    await abrirGrupo(page, 'sub:' + mp.id);
    await expect(linha(page, 'cat:cat_tecido')).toBeVisible();
});

test('outra aba grava as categorias: a DRE aberta se redesenha', async ({ page }) => {
    await abrir(page);
    await abrirGrupo(page, 'despesas');
    await expect(linha(page, 'sub:sub_fix')).toContainText('Despesas fixas');
    await page.evaluate(() => {
        const c = JSON.parse(localStorage.getItem('sc_fin_cat'));
        c.subgrupos.find(s => s.id === 'sub_fix').nome = 'Fixas da loja';
        const novo = JSON.stringify(c);
        const antigo = localStorage.getItem('sc_fin_cat');
        localStorage.setItem('sc_fin_cat', novo);
        window.dispatchEvent(new StorageEvent('storage', { key: 'sc_fin_cat', newValue: novo, oldValue: antigo }));
    });
    await expect(linha(page, 'sub:sub_fix')).toContainText('Fixas da loja');
});
