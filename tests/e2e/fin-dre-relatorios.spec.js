// Financeiro novo, entrega 2, tarefa 3: relatorios de Analise Vertical/Horizontal e exportacao (PDF, Excel, imprimir) da DRE.
// Relogio fixo em todos: 24/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 24, 10, 0, 0);
const hist = [{ em: '2026-11-01T12:00:00.000Z', por: 1, porNome: 'Teste', acao: 'criado', detalhe: 'Lançamento manual' }];
const cr = (id, valor, dia) => ({ id, cliente_nome: 'Bia', descricao: 'Venda ' + id, valor, status: 'Pago', data_vencimento: dia, data_pagamento: dia, data_competencia: dia, categoria_id: 'cat_vendas', historico: hist });
const cp = (id, valor, dia, cat, desc) => ({ id, tipo: 'variavel', categoria: 'outro', credor_nome: 'Fornecedor', descricao: desc, valor, status: 'Pago', data_vencimento: dia, data_pagamento: dia, data_competencia: dia, categoria_id: cat, historico: hist });

// Jan: receita 10.000, custo 3.000, aluguel 3.500 (resultado operacional 3.500).
// Fev: receita 15.000, custo 4.500, aluguel 4.500 (resultado operacional 6.000 = +71,43%).
const CR = [cr(1, 10000, '2026-01-10'), cr(2, 15000, '2026-02-10')];
const CP = [
    cp(1, 3000, '2026-01-15', 'cat_costureira', 'Costura jan'), cp(2, 3500, '2026-01-05', 'cat_aluguel', 'Aluguel jan'),
    cp(3, 4500, '2026-02-15', 'cat_costureira', 'Costura fev'), cp(4, 4500, '2026-02-05', 'cat_aluguel', 'Aluguel fev'),
];

const CDN = /cdn\.jsdelivr\.net\/npm\/xlsx/;
const STUB = `window.XLSX = { utils: { book_new: () => ({ abas: [] }),
    aoa_to_sheet: aoa => ({ aoa }),
    book_append_sheet: (wb, ws, nome) => wb.abas.push({ nome, aoa: ws.aoa }) },
    writeFile: (wb, nome) => { window.__xlsx = { nome, wb }; } };`;

async function abrir(page) {
    await page.clock.setFixedTime(HOJE);
    await page.addInitScript(() => {
        window.__html = '';
        window.__aberturas = 0;
        window.open = () => { window.__aberturas++; return { document: { write: h => { window.__html += h; }, close() {} } }; };
    });
    await entrar(page, BASE, { sc_cr: CR, sc_cp: CP });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    await expect(page.locator('#dre-tabela')).toBeVisible();
}
async function abrirRel(page) {
    await abrir(page);
    await page.locator('#dre-btn-relatorios').click();
    await expect(page.locator('#dre-rel-tabela')).toBeVisible();
}
const linha = (page, chave) => page.locator('#dre-rel-tabela tr[data-chave="' + chave + '"]');
const cel = (page, chave) => linha(page, chave).locator('td');
const tipo = (page, t) => page.locator('#dre-rel-tipo-' + t).click();

test('Analise Vertical: janeiro com 100%, custos 30%, margem 70%, despesas 35% e resultados 35%', async ({ page }) => {
    await abrirRel(page);
    await expect(page.locator('#dre-rel-titulo')).toHaveText('Análise Vertical');
    await expect(page.locator('#dre-rel-de')).toHaveValue('2026-01-01');
    await expect(page.locator('#dre-rel-ate')).toHaveValue('2026-11-24');
    await expect(page.locator('#dre-rel-intervalo')).toHaveValue('mensal');
    await expect(page.locator('#dre-rel-regime-caixa')).toHaveClass(/active/);
    await expect(cel(page, 'receitas').nth(0)).toHaveText('10.000');
    await expect(cel(page, 'receitas').nth(1)).toHaveText('100%');
    await expect(cel(page, 'custos').nth(1)).toHaveText('30%');
    await expect(cel(page, 'margem').nth(1)).toHaveText('70%');
    await expect(cel(page, 'despesas').nth(1)).toHaveText('35%');
    await expect(cel(page, 'resultadoOperacional').nth(1)).toHaveText('35%');
    await expect(cel(page, 'liquido').nth(1)).toHaveText('35%');
    // mes sem receita: valor 0 e AV "—"
    await expect(cel(page, 'receitas').nth(4)).toHaveText('0');
    await expect(cel(page, 'receitas').nth(5)).toHaveText('—');
    // investimento e financiamento fazem parte do relatorio
    await expect(linha(page, 'investimento')).toBeVisible();
    await expect(linha(page, 'financiamento')).toBeVisible();
});

test('Analise Horizontal: +50% verde em receitas, +50% vermelho em custos, 71,43% no resultado e traço sem base', async ({ page }) => {
    await abrirRel(page);
    await tipo(page, 'horizontal');
    await expect(page.locator('#dre-rel-titulo')).toHaveText('Análise Horizontal');
    // Jan: so valor; Fev: valor + AH%
    await expect(cel(page, 'receitas').nth(0)).toHaveText('10.000');
    await expect(cel(page, 'receitas').nth(1)).toHaveText('15.000');
    await expect(cel(page, 'receitas').nth(2)).toHaveText('↑ +50%');
    await expect(cel(page, 'receitas').nth(2)).toHaveClass(/dre-fav/);
    await expect(cel(page, 'custos').nth(2)).toHaveText('↑ +50%');
    await expect(cel(page, 'custos').nth(2)).toHaveClass(/dre-desfav/);
    await expect(cel(page, 'resultadoOperacional').nth(2)).toContainText('71,43%');
    await expect(cel(page, 'resultadoOperacional').nth(2)).toHaveClass(/dre-fav/);
    // Mar: queda de 100% (desfavoravel); Abr: 0 contra 0 = sem base
    await expect(cel(page, 'receitas').nth(4)).toHaveText('↓ -100%');
    await expect(cel(page, 'receitas').nth(4)).toHaveClass(/dre-desfav/);
    await expect(cel(page, 'receitas').nth(6)).toHaveText('—');
    // categorias abrem e a categoria clicada mostra o detalhe do periodo do relatorio
    await linha(page, 'receitas').locator('.dre-tg').click();
    await expect(linha(page, 'cat:cat_vendas')).toBeVisible();
    await cel(page, 'cat:cat_vendas').nth(1).click();
    await expect(page.locator('#dre-detalhe-overlay h3')).toHaveText('Vendas de pedidos — Fev/26');
    await expect(page.locator('#dre-det-total')).toHaveText('Total: R$ 15.000,00');
});

test('Intervalos: Trimestral mostra 1º tri/26 e periodo que nao comeca no dia 1 mostra datas', async ({ page }) => {
    await abrirRel(page);
    await page.selectOption('#dre-rel-intervalo', 'trimestral');
    await expect(page.locator('#dre-rel-tabela thead')).toContainText('1º tri/26');
    await page.selectOption('#dre-rel-intervalo', 'mensal');
    await page.fill('#dre-rel-de', '2026-01-15');
    await page.fill('#dre-rel-ate', '2026-03-14');
    await expect(page.locator('#dre-rel-tabela thead')).toContainText('15/01–31/01');
    await expect(page.locator('#dre-rel-tabela thead')).toContainText('01/03–14/03');
    // personalizado = um unico periodo
    await page.selectOption('#dre-rel-intervalo', 'personalizado');
    await expect(page.locator('#dre-rel-tabela thead')).toContainText('15/01/26–14/03/26');
    // periodo invalido nao quebra
    await page.fill('#dre-rel-de', '2026-05-01');
    await expect(page.locator('#dre-rel-corpo')).toContainText('Período inválido');
});

test('Excel da DRE: arquivo DRE_caixa_2026.xlsx com tudo expandido e numeros como numero', async ({ page }) => {
    await page.route(CDN, r => r.fulfill({ contentType: 'application/javascript', body: STUB }));
    await abrir(page);
    await page.locator('#dre-btn-excel').click();
    await page.waitForFunction(() => window.__xlsx);
    const x = await page.evaluate(() => window.__xlsx);
    expect(x.nome).toBe('DRE_caixa_2026.xlsx');
    expect(x.wb.abas).toHaveLength(1);
    const todas = x.wb.abas[0].aoa;
    expect(todas.slice(0, 5)).toEqual([['SCTech'], ['DRE — Resultado da empresa'], ['Regime: Caixa'], ['Período: 01/01/2026 a 31/12/2026'], []]);
    expect(todas[todas.length - 1]).toEqual(['Saídas em negativo.']);
    const aoa = todas.slice(5, -1);
    expect(aoa[0].slice(0, 3)).toEqual(['RESULTADO', 'Jan/26', 'Fev/26']);
    expect(aoa[0][13]).toBe('Total 2026');
    expect(aoa[1][0]).toBe('Receitas operacionais');
    expect(aoa[1][1]).toBe(10000);
    expect(aoa[1][13]).toBe(25000);
    const rotulos = aoa.map(r => String(r[0]).trim());
    expect(rotulos).toContain('Aluguel');
    expect(rotulos).toContain('Vendas de pedidos');
    // custos saem negativos, como na tela (entre parenteses)
    const custos = aoa.find(r => String(r[0]).trim() === 'Costureira');
    expect(custos[1]).toBe(-3000);
    expect(aoa.slice(1).every(r => r.slice(1).every(v => typeof v === 'number' || v === ''))).toBe(true);
});

test('Excel do relatorio: Analise_vertical com valor e AV% como numeros', async ({ page }) => {
    await page.route(CDN, r => r.fulfill({ contentType: 'application/javascript', body: STUB }));
    await abrirRel(page);
    await page.locator('#dre-rel-excel').click();
    await page.waitForFunction(() => window.__xlsx);
    let x = await page.evaluate(() => window.__xlsx);
    expect(x.nome).toBe('Analise_vertical_2026-01-01_2026-11-24.xlsx');
    expect(x.wb.abas[0].nome).toBe('Análise Vertical');
    const A = () => x.wb.abas[0].aoa.slice(5);
    expect(x.wb.abas[0].aoa.slice(1, 4)).toEqual([['Análise Vertical'], ['Regime: Caixa'], ['Período: 01/01/2026 a 24/11/2026']]);
    expect(A()[0].slice(0, 3)).toEqual(['RESULTADO', 'Jan/26', 'Jan/26 AV%']);
    expect(A()[1].slice(0, 3)).toEqual(['Receitas operacionais', 10000, 100]);
    await page.evaluate(() => { window.__xlsx = null; });
    await tipo(page, 'horizontal');
    await page.locator('#dre-rel-excel').click();
    await page.waitForFunction(() => window.__xlsx);
    x = await page.evaluate(() => window.__xlsx);
    expect(x.nome).toBe('Analise_horizontal_2026-01-01_2026-11-24.xlsx');
    expect(A()[0].slice(0, 4)).toEqual(['RESULTADO', 'Jan/26', 'Fev/26', 'Fev/26 AH%']);
    expect(A()[1].slice(0, 4)).toEqual(['Receitas operacionais', 10000, 15000, 50]);
});

test('Sem internet: Excel avisa que nao foi possivel carregar o gerador de planilhas', async ({ page }) => {
    await page.route(CDN, r => r.abort());
    await abrir(page);
    await page.locator('#dre-btn-excel').click();
    await expect(page.locator('.sc-toast')).toHaveText('Não foi possível carregar o gerador de planilhas — verifique sua conexão.');
    expect(await page.evaluate(() => window.__xlsx)).toBeUndefined();
});

test('Imprimir e PDF da DRE abrem a janela com cabecalho, regime, periodo, paisagem e tabela expandida', async ({ page }) => {
    await abrir(page);
    await page.locator('#dre-btn-imprimir').click();
    let html = await page.evaluate(() => window.__html);
    expect(await page.evaluate(() => window.__aberturas)).toBe(1);
    expect(html).toContain('<title>DRE — Resultado da empresa</title>');
    expect(html).toContain('Regime: Caixa');
    expect(html).toContain('01/01/2026 a 31/12/2026');
    expect(html).toContain('A4 landscape');
    expect(html).toContain('doc-claro');
    expect(html).toContain('SCTech');
    expect(html).toContain('Aluguel');
    expect(html).toContain('Vendas de pedidos');
    expect(html).not.toContain('Salvar como PDF');
    await page.evaluate(() => { window.__html = ''; });
    await page.locator('#dre-btn-pdf').click();
    html = await page.evaluate(() => window.__html);
    expect(html).toContain("Escolha 'Salvar como PDF' na impressora.");
    // a tela nao muda: o grupo continua recolhido
    await expect(page.locator('#dre-tabela tr[data-chave="cat:cat_vendas"]')).toHaveCount(0);
});

test('Imprimir o relatorio horizontal usa o titulo, o regime escolhido e o periodo do filtro', async ({ page }) => {
    await abrirRel(page);
    await tipo(page, 'horizontal');
    await page.locator('#dre-rel-regime-competencia').click();
    await page.locator('#dre-rel-imprimir').click();
    const html = await page.evaluate(() => window.__html);
    expect(html).toContain('<title>Análise Horizontal</title>');
    expect(html).toContain('Regime: Competência');
    expect(html).toContain('01/01/2026 a 24/11/2026');
    expect(html).toContain('AH%');
    expect(html).toContain('Aluguel');
});

test('Do detalhe aberto num relatorio, abrir o lancamento fecha tudo e destaca a linha em Lancamentos', async ({ page }) => {
    await abrirRel(page);
    await linha(page, 'receitas').locator('.dre-tg').click();
    await cel(page, 'cat:cat_vendas').nth(0).click();
    await page.locator('#dre-detalhe-overlay tr.dre-det-linha').click();
    await expect(page.locator('#dre-detalhe-overlay')).toHaveCount(0);
    await expect(page.locator('#dre-rel-overlay')).toHaveCount(0);
    await expect(page.locator('.fin-tab-btn[data-tab="lancamentos"]')).toHaveClass(/active/);
    await expect(page.locator('#tb-contas-receber tr.lanc-destaque')).toContainText('Venda 1');
});

test('Relatorio: dialogo modal, foco entra, Esc fecha e o foco volta ao botao Relatorios', async ({ page }) => {
    await abrirRel(page);
    const o = page.locator('#dre-rel-overlay');
    await expect(o).toHaveAttribute('role', 'dialog');
    await expect(o).toHaveAttribute('aria-modal', 'true');
    expect(await page.evaluate(() => document.getElementById('dre-rel-overlay').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(o).toHaveCount(0);
    await expect(page.locator('#dre-btn-relatorios')).toBeFocused();
});

// ---------- rodada final ----------
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const N = n => ({ nivel: n, acoes_restritas: [] });
const PAP = { id: 30, nome: 'So ver DRE', permissoes: { inicio: N('completo'), financeiro: N('sem_acesso'), 'financeiro.dre': N('visualizar') } };
const USU = [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Leitora', email: 'leitora@sctech.local', papel_id: 30, ativo: true, permissoes_extras: {}, senha_hash: '' },
];

test('categorias com o mesmo nome em grupos diferentes aparecem com o grupo no formulario e no filtro', async ({ page }) => {
    await abrir(page);
    await page.locator('#dre-btn-categorias').click();
    await page.locator('#dre-btn-nova-cat').click();
    await page.fill('#dre-nc-nome', 'Juros e encargos');
    await page.selectOption('#dre-nc-grupo', 'despesas');
    await page.locator('#dre-nc-salvar').click();
    await page.locator('#dre-cat-overlay .modal-close').click();
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click();
    await page.locator('.fin-lado-btn[data-lado="pagar"]').click();
    const filtro = await page.locator('#lanc-categoria option').allTextContents();
    expect(filtro).toContain('Juros e encargos (Despesas operacionais)');
    expect(filtro).toContain('Juros e encargos (Atividades de financiamento)');
    expect(filtro).toContain('Aluguel');
    await page.locator('#lanc-novo').click();
    const form = await page.locator('#lf-categoria option').allTextContents();
    expect(form).toContain('Juros e encargos (Despesas operacionais)');
    expect(form).toContain('Juros e encargos (Atividades de financiamento)');
    expect(form).toContain('Aluguel');
});

test('sem base: so o traço, sem seta nem cor', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cr: [...CR, { ...cr(9, 500, '2026-02-12'), categoria_id: 'cat_outras_rec' }], sc_cp: CP });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    await page.locator('#dre-btn-relatorios').click();
    await tipo(page, 'horizontal');
    await linha(page, 'receitas').locator('.dre-tg').click();
    const c = cel(page, 'cat:cat_outras_rec').nth(2);
    await expect(c).toHaveText('—');
    await expect(c).not.toHaveClass(/dre-fav|dre-desfav/);
});

test('Horizontal avisa quando a ultima coluna e um periodo parcial', async ({ page }) => {
    await abrirRel(page);
    await expect(page.locator('#dre-rel-parcial')).toHaveCount(0);
    await tipo(page, 'horizontal');
    await expect(page.locator('#dre-rel-parcial')).toHaveText('A última coluna vai só até 24/11; compare com cuidado.');
    await page.fill('#dre-rel-ate', '2026-10-31');
    await expect(page.locator('#dre-rel-parcial')).toHaveCount(0);
});

test('sem acesso a Lancamentos: relatorio e detalhe continuam abertos e sem dica', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cr: CR, sc_cp: CP, sc_usr: USU });
    await page.evaluate(q => localStorage.setItem('sc_pap', JSON.stringify([...papeisPadrao(), q])), PAP);
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'leitora@sctech.local' })));
    await page.goto(BASE + '/financeiro.html');
    await page.locator('#dre-btn-relatorios').click();
    await linha(page, 'receitas').locator('.dre-tg').click();
    await cel(page, 'cat:cat_vendas').nth(0).click();
    await expect(page.locator('#dre-det-corpo tr.dre-det-linha')).toHaveCount(1);
    await expect(page.locator('#dre-detalhe-overlay')).not.toContainText('Clique numa linha');
    await page.locator('#dre-det-corpo tr.dre-det-linha').click({ force: true });
    await expect(page.locator('#dre-detalhe-overlay')).toBeVisible();
    await expect(page.locator('#dre-rel-overlay')).toBeVisible();
});

test('regime do Resumo e da DRE e um so', async ({ page }) => {
    await abrir(page);
    await page.locator('#dre-regime-competencia').click();
    await page.locator('.fin-tab-btn[data-tab="resumo"]').click();
    await expect(page.locator('#res-regime')).toHaveValue('competencia');
    await page.selectOption('#res-regime', 'caixa');
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    await expect(page.locator('#dre-regime-caixa')).toHaveClass(/active/);
});

test('subgrupos: renomear, recusar nome repetido e excluir so quando vazio', async ({ page }) => {
    await abrir(page);
    await page.locator('#dre-btn-categorias').click();
    const nome = page.locator('.dre-sub-nome[data-sid="sub_out"]');
    await nome.fill('Diversas');
    await nome.blur();
    expect((await ler(page, 'sc_fin_cat')).subgrupos.find(s => s.id === 'sub_out').nome).toBe('Diversas');
    await nome.fill('despesas fixas');
    await nome.blur();
    await expect(page.locator('#dre-cat-aviso')).toHaveText('Já existe um subgrupo com esse nome neste grupo.');
    expect((await ler(page, 'sc_fin_cat')).subgrupos.find(s => s.id === 'sub_out').nome).toBe('Diversas');
    // subgrupo com categoria nao tem Excluir
    await expect(page.locator('.dre-sub-excluir[data-sid="sub_fix"]')).toHaveCount(0);
    await page.locator('#dre-btn-novo-sub').click();
    await page.fill('#dre-ns-nome', 'Marketing');
    await page.locator('#dre-ns-salvar').click();
    const mkt = (await ler(page, 'sc_fin_cat')).subgrupos.find(s => s.nome === 'Marketing');
    await page.locator('.dre-sub-excluir[data-sid="' + mkt.id + '"]').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Excluir o subgrupo Marketing?');
    await page.locator('#sc-modal-ok').click();
    expect((await ler(page, 'sc_fin_cat')).subgrupos.some(s => s.nome === 'Marketing')).toBe(false);
});

test('% margem com 1 casa decimal na impressao e no Excel; Excel DRE com titulo completo', async ({ page }) => {
    await page.route(CDN, r => r.fulfill({ contentType: 'application/javascript', body: STUB }));
    await abrir(page);
    await page.locator('#dre-btn-imprimir').click();
    expect(await page.evaluate(() => window.__html)).toContain('70,0%');
    await page.locator('#dre-btn-excel').click();
    await page.waitForFunction(() => window.__xlsx);
    const aoa = (await page.evaluate(() => window.__xlsx)).wb.abas[0].aoa;
    expect(aoa[1]).toEqual(['DRE — Resultado da empresa']);
});

test('quadro da tabela tem altura maxima para o cabecalho fixo funcionar', async ({ page }) => {
    await abrir(page);
    const ov = await page.locator('#dre-tabela').evaluate(t => getComputedStyle(t.closest('.dre-quadro')).overflowY);
    expect(ov).toBe('auto');
});
