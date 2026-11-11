// Financeiro Fase 1, tarefa 3: contas (caixa, banco, maquininha), meios de
// pagamento ligados a elas e mensagem de cobranca, em Empresa > Preferencias.
// O card antigo "Formas de Pagamento" passa a se chamar "Planos de pagamento"
// (mesma chave sc_formas_pag).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, chave) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), chave);

async function abrir(page, extras) {
    await entrar(page, BASE, extras);
    await page.goto(BASE + '/empresa.html#preferencias');
}

async function cadastrarTresContas(page) {
    const nomes = [['Caixa da loja', 'caixa'], ['Banco Itau', 'banco'], ['Maquininha Stone', 'maquininha']];
    for (let i = 0; i < nomes.length; i++) {
        await page.click('#emp-contas-card button:has-text("Adicionar conta")');
        const linha = page.locator('#emp-contas .conta-linha').nth(i);
        await linha.locator('.conta-nome').fill(nomes[i][0]);
        await linha.locator('.conta-tipo').selectOption(nomes[i][1]);
        if (i === 0) await linha.locator('.conta-saldo').fill('1250,50');
    }
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
}

test('cadastrar Caixa, Banco e Maquininha cria meios padrao ligados', async ({ page }) => {
    await abrir(page);
    await cadastrarTresContas(page);
    const contas = await ler(page, 'sc_contas_fin');
    expect(contas).toHaveLength(3);
    expect(contas.map(c => c.tipo)).toEqual(['caixa', 'banco', 'maquininha']);
    expect(contas[0].saldo_inicial).toBe(1250.5);
    expect(contas[0].data_saldo_inicial).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(contas[2].cartao.parcelado_taxa).toBe(4);
    expect(contas[2].cartao.debito_taxa).toBe(1.5);
    expect(contas[0].cartao).toBeUndefined();
    const meios = await ler(page, 'sc_meios_pag');
    expect(meios).toHaveLength(6);
    const porNome = n => meios.find(m => m.nome === n);
    expect(porNome('Dinheiro').conta_id).toBe(contas[0].id);
    expect(porNome('PIX').conta_id).toBe(contas[1].id);
    expect(porNome('Transferência').conta_id).toBe(contas[1].id);
    expect(porNome('Boleto').conta_id).toBe(contas[1].id);
    expect(porNome('Cartão de débito').conta_id).toBe(contas[2].id);
    expect(porNome('Cartão de crédito').conta_id).toBe(contas[2].id);
    expect(porNome('Cartão de crédito').tipo).toBe('cartao_credito');
    await expect(page.locator('#emp-meios .meio-linha')).toHaveCount(6);
});

test('taxa da maquininha com virgula decimal vira numero', async ({ page }) => {
    await abrir(page);
    await page.click('#emp-contas-card button:has-text("Adicionar conta")');
    const linha = page.locator('#emp-contas .conta-linha').first();
    await linha.locator('.conta-nome').fill('Maq');
    await linha.locator('.conta-tipo').selectOption('maquininha');
    await linha.locator('.conta-cartao-debito_taxa').fill('1,8');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    const contas = await ler(page, 'sc_contas_fin');
    expect(contas[0].cartao.debito_taxa).toBe(1.8);
});

test('mudar a conta de um meio grava', async ({ page }) => {
    await abrir(page);
    await cadastrarTresContas(page);
    const contas = await ler(page, 'sc_contas_fin');
    const linha = page.locator('#emp-meios .meio-linha', { has: page.locator('.meio-nome[value="PIX"]') });
    await linha.locator('.meio-conta').selectOption(String(contas[0].id));
    await page.click('#emp-meios-card button:has-text("Salvar meios")');
    const meios = await ler(page, 'sc_meios_pag');
    expect(meios.find(m => m.nome === 'PIX').conta_id).toBe(contas[0].id);
    expect(meios.find(m => m.nome === 'Boleto').conta_id).toBe(contas[1].id);
});

test('mensagem de cobranca salva sem apagar outros campos da empresa', async ({ page }) => {
    await abrir(page, { sc_empresa: { razao_social: 'ACME LTDA', cnpj: '12.345' } });
    const area = page.locator('#emp-msg-cobranca');
    await expect(area).toHaveValue(/Olá, \{cliente\}!/);
    await area.fill('Oi {cliente}, pague {valor}.');
    await page.click('#emp-msg-card button:has-text("Salvar mensagem")');
    const emp = await ler(page, 'sc_empresa');
    expect(emp.mensagem_cobranca).toBe('Oi {cliente}, pague {valor}.');
    expect(emp.razao_social).toBe('ACME LTDA');
    expect(emp.cnpj).toBe('12.345');
});

test('card se chama Planos de pagamento e mantem os dados', async ({ page }) => {
    await abrir(page, { sc_formas_pag: ['PIX', 'Cartão em 10x'] });
    await expect(page.locator('#emp-formas-pag-card h3')).toContainText('Planos de pagamento');
    await expect(page.locator('#emp-formas-pag-card h3')).not.toContainText('Formas');
    const nomes = await page.locator('#emp-formas-pag .forma-pag-nome').evaluateAll(l => l.map(i => i.value));
    expect(nomes).toEqual(['PIX', 'Cartão em 10x']);
    expect(await ler(page, 'sc_formas_pag')).toEqual(['PIX', 'Cartão em 10x']);
});

test('exportar e importar levam contas, meios e movimentos', async ({ page }) => {
    const contas = [{ id: 5, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 10, data_saldo_inicial: '2026-11-01', ativo: true }];
    const meios = [{ id: 6, nome: 'Dinheiro', tipo: 'dinheiro', conta_id: 5 }];
    const movs = [{ id: 7, conta_id: 5, data: '2026-11-02', sentido: 'entrada', valor: 30, origem: 'cr', origem_id: 1, grupo_id: null, descricao: 'x' }];
    await abrir(page, { sc_contas_fin: contas, sc_meios_pag: meios, sc_mov_fin: movs });
    const dados = await page.evaluate(() => _dadosExportacao(false));
    expect(dados.contas_fin).toEqual(contas);
    expect(dados.meios_pag).toEqual(meios);
    expect(dados.movimentos_fin).toEqual(movs);

    await page.evaluate(() => { ['sc_contas_fin', 'sc_meios_pag', 'sc_mov_fin'].forEach(k => localStorage.removeItem(k)); });
    const arquivo = { ...dados, fin_fase0: 1 };
    await page.goto(BASE + '/estoque.html');
    const input = page.locator('input[type="file"][onchange*="importarDados"]').first();
    await input.setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(arquivo)) });
    await page.locator('#sc-modal-ok').click();
    await page.waitForLoadState('load');
    await expect.poll(() => ler(page, 'sc_contas_fin')).toEqual(contas);
    expect(await ler(page, 'sc_meios_pag')).toEqual(meios);
    expect(await ler(page, 'sc_mov_fin')).toEqual(movs);
});

test('permissoes Hoje e Extrato aparecem em Configuracoes > Acessos', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html#papeis');
    await page.evaluate(() => abrirModalPapel(1));
    await expect(page.locator('input[name="papel-nivel-financeiro.hoje"]').first()).toBeAttached();
    await expect(page.locator('input[name="papel-nivel-financeiro.extrato"]').first()).toBeAttached();
    const rotulos = await page.locator('.cfg-row-sub .cfg-sub-label').allInnerTexts();
    expect(rotulos).toContain('Hoje');
    expect(rotulos).toContain('Extrato');
});

test('papel Vendedor ja salvo: Hoje e Extrato nao herdam o modulo; Administrador e Financeiro seguem completos', async ({ page }) => {
    const nivel = n => ({ nivel: n, acoes_restritas: [] });
    const papeis = [
        { id: 1, nome: 'Administrador', permissoes: { financeiro: nivel('completo'), configuracoes: nivel('completo') } },
        { id: 2, nome: 'Financeiro', permissoes: { financeiro: nivel('completo') } },
        { id: 3, nome: 'Vendedor/Atendimento', permissoes: { financeiro: nivel('visualizar'), 'financeiro.dashboard': nivel('sem_acesso'), 'financeiro.receber': nivel('visualizar') } }
    ];
    await entrar(page, BASE, { sc_pap: papeis });
    await page.goto(BASE + '/configuracoes.html');
    const r = await page.evaluate(() => {
        const n = (papel, k) => resolverPermissao(k, { papel_id: papel, permissoes_extras: {} }).nivel;
        return { v: [n(3, 'financeiro.hoje'), n(3, 'financeiro.extrato'), n(3, 'financeiro.receber')],
                 a: [n(1, 'financeiro.hoje'), n(1, 'financeiro.extrato')], f: [n(2, 'financeiro.hoje'), n(2, 'financeiro.extrato')] };
    });
    expect(r.v).toEqual(['sem_acesso', 'sem_acesso', 'visualizar']);
    expect(r.a).toEqual(['completo', 'completo']);
    expect(r.f).toEqual(['completo', 'completo']);
});

test('saldo inicial aceita 1.250,50 e 1,5 e recusa texto', async ({ page }) => {
    await abrir(page);
    await page.click('#emp-contas-card button:has-text("Adicionar conta")');
    const linha = page.locator('#emp-contas .conta-linha').first();
    await linha.locator('.conta-nome').fill('Caixa');
    await linha.locator('.conta-saldo').fill('1.250,50');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    expect((await ler(page, 'sc_contas_fin'))[0].saldo_inicial).toBe(1250.5);
    await linha.locator('.conta-saldo').fill('1,5');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    expect((await ler(page, 'sc_contas_fin'))[0].saldo_inicial).toBe(1.5);
    await linha.locator('.conta-saldo').fill('abc');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    await expect(page.locator('#sc-modal-ok')).toBeVisible();
    await page.locator('#sc-modal-ok').click();
    expect((await ler(page, 'sc_contas_fin'))[0].saldo_inicial).toBe(1.5);
});

test('adicionar maquininha depois liga os meios de cartao sem conta', async ({ page }) => {
    await abrir(page);
    for (const [i, [nome, tipo]] of [['Caixa', 'caixa'], ['Banco', 'banco']].entries()) {
        await page.click('#emp-contas-card button:has-text("Adicionar conta")');
        const l = page.locator('#emp-contas .conta-linha').nth(i);
        await l.locator('.conta-nome').fill(nome);
        await l.locator('.conta-tipo').selectOption(tipo);
    }
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    let meios = await ler(page, 'sc_meios_pag');
    expect(meios.find(m => m.tipo === 'cartao_credito').conta_id).toBeNull();
    const contas0 = await ler(page, 'sc_contas_fin');
    await page.click('#emp-contas-card button:has-text("Adicionar conta")');
    const l = page.locator('#emp-contas .conta-linha').nth(2);
    await l.locator('.conta-nome').fill('Maq');
    await l.locator('.conta-tipo').selectOption('maquininha');
    await page.click('#emp-contas-card button:has-text("Salvar contas")');
    const contas = await ler(page, 'sc_contas_fin');
    meios = await ler(page, 'sc_meios_pag');
    expect(meios.find(m => m.tipo === 'cartao_credito').conta_id).toBe(contas[2].id);
    expect(meios.find(m => m.tipo === 'cartao_debito').conta_id).toBe(contas[2].id);
    expect(meios.find(m => m.nome === 'PIX').conta_id).toBe(contas0[1].id);
});
