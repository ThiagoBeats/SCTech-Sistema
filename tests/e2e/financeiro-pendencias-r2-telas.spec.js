// Pendencias R2, tarefa 2: telas e textos das Fases 1, 2 e 3 do Financeiro.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acaoLanc, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somarDias = (dataISO, dias) => { const d = new Date(dataISO + 'T12:00:00'); d.setDate(d.getDate() + dias); return iso(d); };
const HOJE = iso(new Date());

const CONTAS = [
    { id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 100, data_saldo_inicial: '2020-01-01', ativo: true },
    { id: 12, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2020-01-01', ativo: true,
      cartao: { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 } }
];
const cr = (id, extra) => ({ id, pedido_id: null, cliente_nome: 'Ana', descricao: 'Parcela ' + id, valor: 100, data_vencimento: HOJE,
    data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo', ...(extra || {}) });
const cp = (id, extra) => ({ id, descricao: 'Conta ' + id, credor_nome: 'Forn', valor: 50, data_vencimento: HOJE, data_pagamento: null,
    status: 'Pendente', tipo: 'variavel', categoria: 'outro', ...(extra || {}) });

// ---- Fase 1: "forma de pagamento" vira "plano" ----
test('configuracao dos planos: botoes e textos dizem plano, nao forma', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/empresa.html#preferencias');
    const card = page.locator('#emp-formas-pag-card');
    await expect(card.getByRole('button', { name: '+ Adicionar plano de pagamento' })).toBeVisible();
    await expect(card.getByRole('button', { name: /Salvar Planos de Pagamento/ })).toBeVisible();
    await expect(card).not.toContainText(/forma de pagamento/i);
    await expect(card.locator('.forma-pag-nome').first()).toHaveAttribute('aria-label', 'Plano de pagamento 1');
    // sem nenhum plano: salvar avisa em palavras de plano
    await page.evaluate(() => { _formasPagRascunho = []; renderFormasPagamentoCfg(); });
    await expect(page.locator('#emp-formas-pag')).toContainText('Nenhum plano cadastrado. Adicione pelo menos um.');
    await card.getByRole('button', { name: /Salvar Planos de Pagamento/ }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Cadastre pelo menos um plano de pagamento.');
});

test('card do kanban mostra o plano com titulo "Plano de pagamento"', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: [{ id: 1, nome: 'Ana' }], sc_ped: [{ id: 26500, clienteId: 1, clienteNome: 'Ana', status: 'Aguardando Financeiro',
        financeiro_gerado: true, valor: 1000, valor_recebido: 0, forma_pagamento: 'PIX', ambientes: [] }] });
    await page.goto(BASE + '/pcp.html');
    await expect(page.locator('.kanban-fin-forma').first()).toHaveAttribute('title', 'Plano de pagamento');
});

// ---- Fase 1: aviso de estorno sem quebras sobrando ----
test('aviso do estorno de cartao vem em um paragrafo so', async ({ page }) => {
    const d1 = somarDias(HOJE, -1);
    await entrar(page, BASE, {
        sc_contas_fin: CONTAS,
        sc_meios_pag: [{ id: 26, nome: 'Cartão de crédito', tipo: 'cartao_credito', conta_id: 12 }],
        sc_cr: [cr(601, { status: 'Pago', data_pagamento: somarDias(HOJE, -31), meio_id: 26, conta_id: 12, forma_pagamento: 'Cartão de crédito',
            cartao: { tipo: 'credito', vezes: 1, antecipar: false } })],
        sc_mov_fin: [{ id: 91, conta_id: 12, data: d1, sentido: 'entrada', valor: 100, origem: 'cr', origem_id: 601, grupo_id: 999, descricao: 'x' }]
    });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await acaoLanc(page, 'receber', 'Estornar');
    const msg = await page.locator('#sc-modal-msg').textContent();
    expect(msg).toContain('Isso muda o saldo de hoje da conta Maquininha.');
    expect(msg).not.toContain('\n');
});

// ---- Fase 1: cobranca de conta sem pedido ----
test('cobrar conta sem pedido nao escreve #undefined nem #null', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: [{ id: 1, nome: 'Ana', tel: '(11) 98765-4321' }], sc_cr: [cr(601, { cliente_nome: 'Ana' })] });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { window.__abertos = []; window.open = u => { window.__abertos.push(u); return {}; }; });
    await abrirLancamentos(page, 'receber');
    await acaoLanc(page, 'receber', 'Cobrar no WhatsApp');
    const url = (await page.evaluate(() => window.__abertos))[0];
    const msg = decodeURIComponent(url.split('?text=')[1]);
    expect(msg).not.toMatch(/undefined|null|#/);
    expect(msg).toContain('parcela de R$ 100,00, com vencimento em');
});

// ---- Fase 1: tela Hoje ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Hoje no tema escuro: passar o mouse na conta destaca a linha', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: CONTAS });
    await page.evaluate(() => localStorage.setItem('sc_tema', 'dark'));
    await page.goto(BASE + '/financeiro.html');
    const conta = page.locator('#hoje-saldos .hoje-conta').first();
    await conta.hover();
    // o hover anima em 150 ms: espera a transicao terminar antes de ler a cor
    await expect.poll(() => conta.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(255, 255, 255, 0.08)');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Hoje: a conta abre o Extrato pelo teclado (Enter e Espaco)', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: CONTAS });
    await page.goto(BASE + '/financeiro.html');
    const conta = page.locator('#hoje-saldos .hoje-conta').first();
    await expect(conta).toHaveAttribute('role', 'button');
    await conta.focus();
    await expect(conta).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#fin-extrato')).toBeVisible();
    await page.locator('.fin-tab-btn[data-tab="hoje"]').click();
    await page.locator('#hoje-saldos .hoje-conta').nth(1).focus();
    await page.keyboard.press(' ');
    await expect(page.locator('#fin-extrato')).toBeVisible();
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('Hoje: quem so ve A Receber nao ve as tarefas de A Pagar (e o contrario)', async ({ page }) => {
    await entrar(page, BASE, { sc_contas_fin: CONTAS, sc_cr: [cr(1, { descricao: 'Parcela receber', data_vencimento: somarDias(HOJE, -2) })],
        sc_cp: [cp(2, { descricao: 'Conta a pagar X', data_vencimento: somarDias(HOJE, -2) })] });
    const como = extras => page.evaluate(e => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 3;
        u[0].permissoes_extras = e;
        localStorage.setItem('sc_usr', JSON.stringify(u));
    }, extras);
    const hoje = { nivel: 'visualizar', acoes_restritas: [] };
    const sem = { nivel: 'sem_acesso', acoes_restritas: [] };
    await como({ 'financeiro.hoje': hoje, 'financeiro.receber': hoje, 'financeiro.pagar': sem });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#hoje-tarefas')).toContainText('Parcela receber');
    await expect(page.locator('#hoje-tarefas')).not.toContainText('Conta a pagar X');
    await como({ 'financeiro.hoje': hoje, 'financeiro.pagar': hoje, 'financeiro.receber': sem });
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('#hoje-tarefas')).toContainText('Conta a pagar X');
    await expect(page.locator('#hoje-tarefas')).not.toContainText('Parcela receber');
});

// ---- Fase 1: comissao antiga paga sem conta a pagar ----
test('comissao antiga paga sem conta a pagar ganha Estornar e volta a pendente', async ({ page }) => {
    await entrar(page, BASE, {
        sc_cli: [{ id: 1, nome: 'Ana' }], sc_vend: [{ id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' }],
        sc_ped: [{ id: 26400, clienteId: 1, clienteNome: 'Ana', status: 'Instalado', financeiro_gerado: true, valor: 1000, valor_recebido: 1000,
            ambientes: [], forma_pagamento: 'PIX', data_instalado: new Date('2026-10-20T12:00:00').getTime(),
            vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50, comissao_paga: true, comissao_data_pgto: new Date('2026-10-25T12:00:00').getTime() }]
    });
    await page.goto(BASE + '/vendedores.html?aba=comissoes');
    await expect(page.locator('#tb-comissoes tr[data-status="paga"]')).toBeVisible();
    await acaoMenu(page, page.locator('#tb-comissoes tr[data-status="paga"]'), 'Desfazer pagamento');
    await expect(page.locator('#sc-modal-msg')).toContainText('A comissão volta a ficar pendente.');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].comissao_paga).toBe(false);
    const ped = (await ler(page, 'sc_ped'))[0];
    expect(ped.comissao_data_pgto).toBeNull();
    await page.goto(BASE + '/vendedores.html?aba=comissoes');
    await expect(page.locator('#tb-comissoes')).toContainText('#26400');
    await expect(page.locator('#tb-comissoes')).toContainText('Pendente');
});

// ---- Fase 2: "Imposto" numa lista so ----
test('a opcao Imposto vem de um lugar so e aparece nas tres listas', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/financeiro.html');
    const ids = ['df-categoria', 'sim-categoria', 'cpm-categoria'];
    // Opcoes de imposto de cada lista (pelo valor ou pelo texto), para pegar repeticao
    const opcoesImposto = () => page.evaluate(lista => lista.map(id => [...document.querySelectorAll(`#${id} option`)]
        .filter(o => o.value === 'imposto' || /imposto|tributo/i.test(o.textContent)).map(o => [o.value, o.textContent])), ids);
    await page.evaluate(() => abrirModalContaPagar('manual'));
    expect(await opcoesImposto(), 'cada lista tem o Imposto exatamente uma vez').toEqual(ids.map(() => [['imposto', 'Imposto']]));
    await expect(page.locator('#sim-categoria')).toHaveValue('outro');
    // Mesma fonte: trocar o rotulo num lugar so muda as tres listas
    await page.evaluate(() => {
        document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
        CATEGORIA_IMPOSTO[1] = 'Tributo';
        ['df-categoria', 'sim-categoria'].forEach(id => { document.getElementById(id).innerHTML = ''; });
        preencherCategoriasFinanceiro();
        abrirModalContaPagar('manual');
    });
    expect(await opcoesImposto()).toEqual(ids.map(() => [['imposto', 'Tributo']]));
});

// ---- Fase 2: valor da conta a pagar aceita "1.250,50" ----
test('valor da conta a pagar aceita 1.250,50', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => abrirModalContaPagar('manual'));
    await expect(page.locator('#cpm-valor')).toHaveAttribute('type', 'text');
    await page.fill('#cpm-descricao', 'Compra de teste');
    await page.fill('#cpm-valor', '1.250,50');
    await page.fill('#cpm-vencimento', '2026-12-10');
    await page.getByRole('button', { name: /Salvar|Lançar|Adicionar/ }).last().click();
    await expect.poll(async () => ((await ler(page, 'sc_cp')) || []).length).toBeGreaterThan(0);
    expect((await ler(page, 'sc_cp'))[0].valor).toBe(1250.5);
});

// ---- Fase 2: Resultado do mes ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('meta padrao aparece como sugestao no ajuste do mes', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { meta_faturamento_padrao: 30000 } });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await page.click('#res-meta-edit');
    await expect(page.locator('#res-ajuste-valor')).toHaveAttribute('placeholder', 'R$ 30.000,00');
    await expect(page.locator('#res-ajuste-valor')).toHaveValue('');
});

// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('"+ Limite so neste mes" so aparece com algum orcamento definido', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await expect(page.locator('#res-orcamento-vazio')).toBeVisible();
    await expect(page.locator('#res-orc-add')).toBeHidden();
    await entrar(page, BASE, { sc_empresa: { orcamento_padrao: { fornecedores: 3200 } } });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await expect(page.locator('#res-orc-add')).toBeVisible();
});

// ---- Fase 3: comparacao com o mes anterior ----
// Desativado: ver FIN_RECURSOS_ANTIGOS
test.skip('fechamento: diferenca zero diz "igual ao mês anterior", sem +0%', async ({ page }) => {
    const mov = (id, data, sentido, valor, origem, origem_id) => ({ id, conta_id: 10, data, sentido, valor, origem, origem_id, grupo_id: null, descricao: 'x' });
    const crPago = (id, data) => ({ id, pedido_id: 100 + id, cliente_nome: 'Cli', descricao: 'Pedido ' + id, valor: 500, data_vencimento: data, data_pagamento: data, status: 'Pago', parcela_tipo: 'saldo' });
    await page.clock.install({ time: new Date('2026-11-05T10:00:00') });
    await entrar(page, BASE, {
        sc_contas_fin: [{ id: 10, nome: 'Banco', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-08-01', ativo: true }],
        sc_cr: [crPago(1, '2026-10-10'), crPago(2, '2026-09-10')],
        sc_mov_fin: [mov(1, '2026-10-10', 'entrada', 500, 'cr', 1), mov(2, '2026-09-10', 'entrada', 500, 'cr', 2)]
    });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="resultado"]').click();
    await page.fill('#res-mes', '2026-10');
    await page.locator('#res-mes').dispatchEvent('change');
    await page.click('#fech-btn-fechar');
    const continuar = page.locator('#fech-modal').getByRole('button', { name: 'Continuar' });
    await continuar.click();
    await continuar.click();
    const linha = page.locator('#fech-modal .fech-lista li', { hasText: 'Entradas' });
    await expect(linha).toContainText('igual ao mês anterior');
    await expect(linha).not.toContainText('+0%');
    await expect(linha).not.toContainText('R$ 0,00');
});
