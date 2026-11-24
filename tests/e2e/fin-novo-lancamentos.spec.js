// Financeiro novo, entrega 1, tarefa 5: tela Lancamentos (Contas a pagar | Contas a receber), filtros,
// novo/editar com parcelas e recorrencia, aviso de parecido, cancelar, excluir e historico.
// Relogio fixo em todos: 24/11/2026.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acaoLanc, acaoMenu, acoesDaLinha } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 24, 10, 0, 0);
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const hist = (acao, detalhe) => [{ em: '2026-11-01T12:00:00.000Z', por: 1, porNome: 'Teste', acao: acao || 'criado', detalhe: detalhe || 'Lançamento manual' }];

const CR = [
    { id: 1, cliente_nome: 'Ana', descricao: 'Venda aberta', valor: 300, status: 'Pendente', data_vencimento: '2026-11-30', data_competencia: '2026-11-30', categoria_id: 'cat_vendas', data_pagamento: null, historico: hist() },
    { id: 2, cliente_nome: 'Beto', descricao: 'Venda vencida', valor: 200, status: 'Atrasado', data_vencimento: '2026-11-10', data_competencia: '2026-11-10', categoria_id: 'cat_vendas', data_pagamento: null, historico: hist() },
    { id: 3, cliente_nome: 'Carla', descricao: 'Venda paga', valor: 150, status: 'Pago', data_vencimento: '2026-11-05', data_competencia: '2026-11-05', categoria_id: 'cat_vendas', data_pagamento: '2026-11-05', historico: hist().concat(hist('baixa', 'Pago R$ 150,00 em 05/11/2026')) },
    { id: 4, cliente_nome: 'Davi', descricao: 'Venda cancelada', valor: 80, status: 'Cancelado', data_vencimento: '2026-11-12', data_competencia: '2026-11-12', categoria_id: 'cat_vendas', data_pagamento: null, motivo_cancelamento: 'Desistiu', historico: hist() },
    { id: 5, cliente_nome: 'Eva', descricao: 'Venda de dezembro', valor: 500, status: 'Pendente', data_vencimento: '2026-12-10', data_competencia: '2026-12-10', categoria_id: 'cat_outras_rec', data_pagamento: null, historico: hist() },
    { id: 6, pedido_id: 26300, cliente_nome: 'Fabio', descricao: 'Entrada do pedido', valor: 100, status: 'Pendente', data_vencimento: '2026-11-27', data_competencia: '2026-11-27', categoria_id: 'cat_vendas', parcela_tipo: 'entrada', data_pagamento: null, historico: hist() },
];
const CP = [
    { id: 11, tipo: 'variavel', categoria: 'tecido', credor_nome: 'RC Tecidos', descricao: 'Tecido', valor: 400, status: 'Pendente', data_vencimento: '2026-11-28', data_competencia: '2026-11-28', categoria_id: 'cat_tecido', data_pagamento: null, historico: hist() },
    { id: 12, tipo: 'fixo', categoria: 'aluguel', credor_nome: '', descricao: 'Aluguel', valor: 1000, status: 'Atrasado', data_vencimento: '2026-11-20', data_competencia: '2026-11-01', categoria_id: 'cat_aluguel', despesa_fixa_id: 99, data_pagamento: null, historico: hist() },
    { id: 13, tipo: 'variavel', categoria: 'conta', credor_nome: 'Luz SA', descricao: 'Luz', valor: 90, status: 'Pago', data_vencimento: '2026-11-08', data_competencia: '2026-11-08', categoria_id: 'cat_contas', data_pagamento: '2026-11-08', historico: hist() },
];
const MEIOS = [{ id: 22, nome: 'PIX', tipo: 'pix', conta_id: 11, ativo: true }];
const CONTAS = [{ id: 11, nome: 'Banco', tipo: 'banco', ativo: true, saldo_inicial: 0, data_saldo_inicial: '2026-01-01' }];
const PED = [{ id: 26300, clienteId: 7, clienteNome: 'Fabio', status: 'Instalado', financeiro_gerado: true, valor: 100, ambientes: [] }];

async function abrir(page, dados, lado) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cr: CR, sc_cp: CP, sc_ped: PED, sc_df: [{ id: 99, descricao: 'Aluguel', valor: 1000, dia_vencimento: 20, categoria: 'aluguel', categoria_id: 'cat_aluguel', ativo: true }], sc_meios_pag: MEIOS, sc_contas_fin: CONTAS, ...(dados || {}) });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, lado || 'receber');
}
const linha = (page, lado, txt) => page.locator('#tb-contas-' + lado + ' tr', { hasText: txt });

test('lista mostra os lancamentos com Em aberto, Vencido, Recebido e Cancelado', async ({ page }) => {
    await abrir(page);
    await expect(linha(page, 'receber', 'Venda aberta').locator('.fin-badge')).toHaveText('Em aberto');
    await expect(linha(page, 'receber', 'Venda vencida').locator('.fin-badge')).toHaveText('Vencido');
    await expect(linha(page, 'receber', 'Venda paga').locator('.fin-badge')).toHaveText('Recebido');
    await expect(linha(page, 'receber', 'Venda cancelada').locator('.fin-badge')).toHaveText('Cancelado');
    await expect(linha(page, 'receber', 'Venda aberta')).toContainText('Vendas de pedidos');
    // Total em aberto: 300 + 200 + 500 + 100 (cancelado e pago ficam de fora)
    await expect(page.locator('#lanc-rodape')).toContainText('Total em aberto: R$ 1.100,00');
    await abrirLancamentos(page, 'pagar');
    await expect(linha(page, 'pagar', 'Luz').locator('.fin-badge')).toHaveText('Pago');
    await expect(linha(page, 'pagar', 'Aluguel').locator('.fin-badge-red')).toHaveText('Vencido');
});

test('periodo padrao e o mes atual; filtros de status, categoria e competencia reduzem a lista', async ({ page }) => {
    await abrir(page);
    await page.fill('#lanc-de', '2026-11-01'); await page.fill('#lanc-ate', '2026-11-30');
    await expect(page.locator('#tb-contas-receber tr')).toHaveCount(5);
    await expect(page.locator('#tb-contas-receber')).not.toContainText('Venda de dezembro');
    await page.selectOption('#lanc-status', 'vencido');
    await expect(page.locator('#tb-contas-receber tr')).toHaveCount(1);
    await expect(page.locator('#tb-contas-receber')).toContainText('Venda vencida');
    await page.selectOption('#lanc-status', '');
    await page.selectOption('#lanc-categoria', 'cat_outras_rec');
    await expect(page.locator('#tb-contas-receber')).toContainText('Nenhum lançamento encontrado.');
    await page.fill('#lanc-de', ''); await page.fill('#lanc-ate', '');
    await expect(page.locator('#tb-contas-receber tr')).toHaveCount(1);
    await expect(page.locator('#tb-contas-receber')).toContainText('Venda de dezembro');
    await page.selectOption('#lanc-categoria', '');
    // periodo por competencia
    await page.selectOption('#lanc-ref', 'comp');
    await page.fill('#lanc-de', '2026-12-01'); await page.fill('#lanc-ate', '2026-12-31');
    // a conta vencida de novembro continua na lista (primeiro), com o aviso
    await expect(page.locator('#tb-contas-receber tr')).toHaveCount(2);
    await expect(page.locator('#tb-contas-receber tr').first()).toContainText('Venda vencida');
    await expect(page.locator('#tb-contas-receber')).toContainText('Eva');
    await expect(page.locator('#lanc-aviso')).toHaveText('Inclui 1 conta(s) vencida(s) de antes do período.');
    await page.selectOption('#lanc-status', 'aberto');
    await expect(page.locator('#tb-contas-receber tr')).toHaveCount(1);
    await expect(page.locator('#lanc-aviso')).toBeHidden();
    await page.selectOption('#lanc-status', '');
    await page.fill('#lanc-busca', 'zzzz');
    await expect(page.locator('#tb-contas-receber')).toContainText('Nenhum lançamento encontrado.');
});

test('periodo inicial da tela e o mes atual', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cr: CR });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click();
    await page.locator('.fin-lado-btn[data-lado="receber"]').click();
    await expect(page.locator('#lanc-de')).toHaveValue('2026-11-01');
    await expect(page.locator('#lanc-ate')).toHaveValue('2026-11-30');
    await expect(page.locator('#tb-contas-receber')).not.toContainText('Venda de dezembro');
});

test('novo lancamento a pagar parcelado 3x de R$ 100,00 cria 33,33 / 33,33 / 33,34 mensais com competencia', async ({ page }) => {
    await abrir(page, null, 'pagar');
    await page.locator('#lanc-novo').click();
    await page.fill('#lf-descricao', 'Maquina de costura');
    await page.fill('#lf-valor', '100,00');
    await page.fill('#lf-pessoa', 'Casa das Maquinas');
    await page.selectOption('#lf-categoria', 'cat_equip');
    await page.fill('#lf-vencimento', '2026-12-10');
    await page.check('#lf-parcelar');
    await page.fill('#lf-parcelas', '3');
    await page.locator('#lf-salvar').click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).length).toBe(6);
    const novas = (await ler(page, 'sc_cp')).filter(c => c.descricao.startsWith('Maquina de costura'));
    expect(novas.map(c => c.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(novas.map(c => c.data_vencimento)).toEqual(['2026-12-10', '2027-01-10', '2027-02-10']);
    expect(novas.map(c => c.data_competencia)).toEqual(['2026-12-10', '2027-01-10', '2027-02-10']);
    expect(novas.map(c => c.descricao)).toEqual(['Maquina de costura (parcela 1/3)', 'Maquina de costura (parcela 2/3)', 'Maquina de costura (parcela 3/3)']);
    expect(novas[0]).toMatchObject({ categoria_id: 'cat_equip', credor_nome: 'Casa das Maquinas', status: 'Pendente', parcelado: true, numero_parcelas: 3, parcela_atual: 1 });
    expect(new Set(novas.map(c => c.lancamento_pai_id)).size).toBe(1);
    expect(novas[0].historico[0].acao).toBe('criado');
});

test('lancamento igual a um existente abre o aviso de parecido e Cancelar nao salva', async ({ page }) => {
    await abrir(page);
    await page.locator('#lanc-novo').click();
    await page.fill('#lf-descricao', 'Outra venda');
    await page.fill('#lf-valor', '300,00');
    await page.fill('#lf-pessoa', 'Ana');
    await page.fill('#lf-vencimento', '2026-11-29');
    await page.locator('#lf-salvar').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Já existe um lançamento parecido: Venda aberta — R$ 300,00 — vence 30/11/2026. Salvar mesmo assim?');
    await page.locator('#sc-modal-cancel').click();
    await expect(page.locator('#lf-descricao')).toBeVisible();
    expect(await ler(page, 'sc_cr')).toHaveLength(CR.length);
    // "Salvar mesmo assim" salva
    await page.locator('#lf-salvar').click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).length).toBe(CR.length + 1);
});

test('novo lancamento a receber simples grava categoria, competencia e historico', async ({ page }) => {
    await abrir(page);
    await page.locator('#lanc-novo').click();
    await page.fill('#lf-descricao', 'Servico avulso');
    await page.fill('#lf-valor', '1.250,50');
    await page.fill('#lf-vencimento', '2026-12-05');
    await page.locator('#lf-salvar').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).length).toBe(CR.length + 1);
    const n = (await ler(page, 'sc_cr')).find(c => c.descricao === 'Servico avulso');
    expect(n).toMatchObject({ valor: 1250.5, categoria_id: 'cat_vendas', data_competencia: '2026-12-05', data_vencimento: '2026-12-05', status: 'Pendente' });
    expect(n.historico).toHaveLength(1);
    expect(n.historico[0]).toMatchObject({ acao: 'criado', porNome: 'Teste' });
});

test('editar muda o valor e grava editado no historico', async ({ page }) => {
    await abrir(page);
    await acaoMenu(page, linha(page, 'receber', 'Venda aberta'), 'Editar');
    await page.fill('#lf-valor', '350,00');
    await page.fill('#lf-descricao', 'Venda aberta (ajustada)');
    await page.selectOption('#lf-categoria', 'cat_outras_rec');
    await page.locator('#lf-salvar').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).find(c => c.id === 1).valor).toBe(350);
    const c = (await ler(page, 'sc_cr')).find(x => x.id === 1);
    expect(c.categoria_id).toBe('cat_outras_rec');
    const acoes = c.historico.map(h => h.acao);
    expect(acoes).toContain('editado');
    expect(acoes).toContain('categoria');
    expect(c.historico.find(h => h.acao === 'editado').detalhe).toContain('Valor: R$ 300,00 → R$ 350,00');
});

test('dar baixa pela ⋮ usa a janela atual e o status vira Pago', async ({ page }) => {
    await abrir(page, null, 'pagar');
    await acaoLanc(page, 'pagar', 'Dar baixa', { linha: 'Tecido' });
    const modal = page.locator('#baixa-modal');
    await expect(modal).toBeVisible();
    await modal.locator('.baixa-linha').first().locator('.baixa-meio').selectOption({ label: 'PIX' });
    await modal.locator('#baixa-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).find(c => c.id === 11).status).toBe('Pago');
    await abrirLancamentos(page, 'pagar');
    await expect(linha(page, 'pagar', 'Tecido').locator('.fin-badge')).toHaveText('Pago');
    const c = (await ler(page, 'sc_cp')).find(x => x.id === 11);
    expect(c.historico.map(h => h.acao)).toEqual(['criado', 'baixa']);
});

test('cancelar lancamento pago mostra "Estorne a baixa antes de cancelar."', async ({ page }) => {
    await abrir(page, null, 'pagar');
    await acaoMenu(page, linha(page, 'pagar', 'Luz'), 'Cancelar');
    await expect(page.locator('#sc-modal-msg')).toHaveText('Estorne a baixa antes de cancelar.');
    await page.locator('#sc-modal-ok').click();
    expect((await ler(page, 'sc_cp')).find(c => c.id === 13).status).toBe('Pago');
});

test('cancelar em aberto exige motivo, grava historico e o Historico mostra quem fez', async ({ page }) => {
    await abrir(page);
    await acaoMenu(page, linha(page, 'receber', 'Venda aberta'), 'Cancelar');
    await page.locator('#lanc-motivo-ok').click();
    await expect(page.locator('#lanc-motivo-erro')).toHaveText('Informe o motivo.');
    expect((await ler(page, 'sc_cr')).find(c => c.id === 1).status).toBe('Pendente');
    await page.fill('#lanc-motivo', 'Cliente desistiu');
    await page.locator('#lanc-motivo-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).find(c => c.id === 1).status).toBe('Cancelado');
    const c = (await ler(page, 'sc_cr')).find(x => x.id === 1);
    expect(c).toMatchObject({ motivo_cancelamento: 'Cliente desistiu', cancelado_por: 1 });
    expect(c.historico[c.historico.length - 1]).toMatchObject({ acao: 'cancelado', detalhe: 'Cliente desistiu', porNome: 'Teste' });
    // some do total em aberto e o Historico lista criado e cancelado com o nome
    await abrirLancamentos(page, 'receber');
    await expect(linha(page, 'receber', 'Venda aberta').locator('.fin-badge')).toHaveText('Cancelado');
    await expect(page.locator('#lanc-rodape')).toContainText('Total em aberto: R$ 800,00');
    await acaoMenu(page, linha(page, 'receber', 'Venda aberta'), 'Histórico');
    const h = page.locator('#lanc-hist');
    await expect(h).toContainText('Criado');
    await expect(h).toContainText('Cancelado');
    await expect(h).toContainText('Cliente desistiu');
    await expect(h).toContainText('Teste');
});

test('Historico lista criado e baixa com o nome do usuario', async ({ page }) => {
    await abrir(page);
    await acaoMenu(page, linha(page, 'receber', 'Venda paga'), 'Histórico');
    const h = page.locator('#lanc-hist');
    await expect(h).toContainText('Criado');
    await expect(h).toContainText('Baixa');
    await expect(h).toContainText('Pago R$ 150,00 em 05/11/2026');
    await expect(h).toContainText('Teste');
});

test('Excluir so aparece em lancamento manual e grava em excluidos', async ({ page }) => {
    await abrir(page);
    expect(await acoesDaLinha(page, linha(page, 'receber', 'Entrada do pedido'))).not.toContain('Excluir');
    expect(await acoesDaLinha(page, linha(page, 'receber', 'Venda paga'))).not.toContain('Excluir');
    expect(await acoesDaLinha(page, linha(page, 'receber', 'Venda cancelada'))).not.toContain('Excluir');
    expect(await acoesDaLinha(page, linha(page, 'receber', 'Entrada do pedido'))).toContain('Abrir pedido');
    expect(await acoesDaLinha(page, linha(page, 'receber', 'Venda aberta'))).toContain('Excluir');
    await abrirLancamentos(page, 'pagar');
    expect(await acoesDaLinha(page, linha(page, 'pagar', 'Aluguel'))).not.toContain('Excluir');
    expect(await acoesDaLinha(page, linha(page, 'pagar', 'Tecido'))).toContain('Excluir');
    await acaoMenu(page, linha(page, 'pagar', 'Tecido'), 'Excluir');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).length).toBe(2);
    const ex = await ler(page, 'sc_fin_excluidos');
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ tipo: 'cp', porNome: 'Teste' });
    expect(ex[0].lancamento.descricao).toBe('Tecido');
});

test('Repetir todo mes cria a recorrencia e ela aparece em Recorrencias', async ({ page }) => {
    await abrir(page, { sc_df: [] }, 'pagar');
    await page.locator('#lanc-novo').click();
    await page.fill('#lf-descricao', 'Internet da loja');
    await page.fill('#lf-valor', '150');
    await page.selectOption('#lf-categoria', 'cat_contas');
    await page.fill('#lf-vencimento', '2026-11-30');
    await page.check('#lf-repetir');
    await expect(page.locator('#lf-parcelar')).not.toBeChecked();
    await page.locator('#lf-salvar').click();
    await expect.poll(async () => (await ler(page, 'sc_df')).length).toBe(1);
    const df = (await ler(page, 'sc_df'))[0];
    expect(df).toMatchObject({ descricao: 'Internet da loja', valor: 150, categoria_id: 'cat_contas', ativo: true, dia_vencimento: 30 });
    const cp = (await ler(page, 'sc_cp')).find(c => c.descricao === 'Internet da loja');
    expect(cp).toMatchObject({ despesa_fixa_id: df.id, categoria_id: 'cat_contas', data_vencimento: '2026-11-30' });
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click();
    await page.locator('.fin-lado-btn[data-lado="fixas"]').click();
    await expect(page.locator('#tb-despesas-fixas')).toContainText('Internet da loja');
    await expect(page.locator('#tb-despesas-fixas')).toContainText('Contas (luz, internet…)');
});

test('Vendedor nao ve o lado Contas a pagar', async ({ page }) => {
    const usu = [{ id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
        { id: 2, nome: 'Vendedora', email: 'vend@sctech.local', papel_id: 3, ativo: true, permissoes_extras: {}, senha_hash: '' }];
    await abrir(page, { sc_usr: usu }, 'receber');
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'vend@sctech.local' })));
    await page.goto(BASE + '/financeiro.html');
    await expect(page.locator('.fin-lado-btn:visible')).toHaveText(['Contas a receber']);
    await expect(page.locator('#tb-contas-receber')).toBeAttached();
    expect(await page.evaluate(() => finLancLado)).toBe('receber');
    // sem acesso completo a pagar, nada de botoes de criar para esse lado nao se aplica; o lado pagar nem abre
    await page.evaluate(() => renderFinLancamentos('pagar'));
    await expect(page.locator('.fin-lado-btn[data-lado="receber"]')).toHaveClass(/active/);
});

test('so visualizar: ve a lista e o Historico, sem Novo, Editar, Cancelar nem Excluir', async ({ page }) => {
    const papel = { id: 31, nome: 'So Ver', permissoes: { inicio: { nivel: 'completo', acoes_restritas: [] }, financeiro: { nivel: 'sem_acesso', acoes_restritas: [] }, 'financeiro.receber': { nivel: 'visualizar', acoes_restritas: [] } } };
    const usu = [{ id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
        { id: 2, nome: 'Leitor', email: 'leitor@sctech.local', papel_id: 31, ativo: true, permissoes_extras: {}, senha_hash: '' }];
    await abrir(page, { sc_usr: usu }, 'receber');
    await page.evaluate(p => { localStorage.setItem('sc_pap', JSON.stringify([...papeisPadrao(), p])); sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'leitor@sctech.local' })); }, papel);
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await expect(page.locator('#lanc-novo')).toBeHidden();
    await expect(linha(page, 'receber', 'Venda aberta')).toBeVisible();
    const a = await acoesDaLinha(page, linha(page, 'receber', 'Venda aberta'));
    expect(a).toEqual(['Histórico']);
});

test('tema escuro: texto da lista, do selo e do formulario nao fica ilegivel', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sc_tema', 'dark'));
    await abrir(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const contraste = async seletor => page.evaluate(sel => {
        const el = document.querySelector(sel);
        const cor = getComputedStyle(el).color;
        let n = el, fundo = 'rgba(0, 0, 0, 0)';
        while (n) { const b = getComputedStyle(n).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') { fundo = b; break; } n = n.parentElement; }
        return { cor, fundo };
    }, seletor);
    for (const sel of ['#tb-contas-receber tr:first-child td:nth-child(2)', '#tb-contas-receber .fin-badge-green', '#lanc-rodape', '#lanc-busca']) {
        const c = await contraste(sel);
        expect(c.cor, sel).not.toBe(c.fundo);
    }
    await page.locator('#lanc-novo').click();
    for (const sel of ['#lf-descricao', '#lf-categoria', '.lanc-opcao span', '.modal-header h3']) {
        const c = await contraste(sel);
        expect(c.cor, sel).not.toBe(c.fundo);
    }
});

test('largura 390px: sem rolagem horizontal da pagina, na lista e no formulario', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrir(page);
    const larg = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await larg()).toBeLessThanOrEqual(0);
    await abrirLancamentos(page, 'pagar');
    expect(await larg()).toBeLessThanOrEqual(0);
    await page.locator('#lanc-novo').click();
    await expect(page.locator('#lf-descricao')).toBeVisible();
    expect(await larg()).toBeLessThanOrEqual(0);
});

test('vencida de antes do periodo aparece primeiro, com aviso, e entra no Total em aberto', async ({ page }) => {
    const velha = { id: 7, cliente_nome: 'Gil', descricao: 'Venda de outubro', valor: 70, status: 'Atrasado', data_vencimento: '2026-10-10', data_competencia: '2026-10-10', categoria_id: 'cat_vendas', data_pagamento: null, historico: hist() };
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { sc_cr: [velha, CR[0]] });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click();
    await page.locator('.fin-lado-btn[data-lado="receber"]').click();
    await expect(page.locator('#lanc-de')).toHaveValue('2026-11-01');
    await expect(page.locator('#tb-contas-receber tr')).toHaveCount(2);
    await expect(page.locator('#tb-contas-receber tr').first()).toContainText('Venda de outubro');
    await expect(page.locator('#lanc-aviso')).toHaveText('Inclui 1 conta(s) vencida(s) de antes do período.');
    await expect(page.locator('#lanc-rodape')).toContainText('Total em aberto: R$ 370,00');
    await page.selectOption('#lanc-status', 'vencido');
    await expect(page.locator('#tb-contas-receber tr')).toHaveCount(1);
    await expect(page.locator('#lanc-aviso')).toBeVisible();
    await page.selectOption('#lanc-status', 'pago');
    await expect(page.locator('#lanc-aviso')).toBeHidden();
});

test('Repetir todo mes com vencimento dia 31: sem duplicar em janeiro e gera 28/02 em fevereiro', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2027, 0, 31, 10, 0, 0));
    await entrar(page, BASE, { sc_cp: [], sc_df: [] });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    await page.locator('#lanc-novo').click();
    await page.fill('#lf-descricao', 'Contador');
    await page.fill('#lf-valor', '300');
    await page.selectOption('#lf-categoria', 'cat_contas');
    await page.fill('#lf-vencimento', '2027-01-31');
    await page.check('#lf-repetir');
    await expect(page.locator('#lf-competencia')).toHaveValue('2027-01-01');
    await page.locator('#lf-salvar').click();
    await expect.poll(async () => (await ler(page, 'sc_df')).length).toBe(1);
    expect((await ler(page, 'sc_df'))[0].dia_vencimento).toBe(31);
    expect((await ler(page, 'sc_cp'))[0]).toMatchObject({ data_vencimento: '2027-01-31', data_competencia: '2027-01-01' });
    // gerar em janeiro nao duplica
    await abrirLancamentos(page, 'pagar');
    await page.locator('#lanc-gerar').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('já foram geradas');
    await page.locator('#sc-modal-ok').click();
    expect(await ler(page, 'sc_cp')).toHaveLength(1);
    // fevereiro: 28/02 (2027 nao e bissexto), uma vez so
    await page.clock.setFixedTime(new Date(2027, 1, 15, 10, 0, 0));
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'pagar');
    await page.locator('#lanc-gerar').click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).length).toBe(2);
    expect((await ler(page, 'sc_cp')).map(c => c.data_vencimento).sort()).toEqual(['2027-01-31', '2027-02-28']);
    expect((await ler(page, 'sc_cp')).map(c => c.data_competencia).sort()).toEqual(['2027-01-01', '2027-02-01']);
    await abrirLancamentos(page, 'pagar');
    await page.locator('#lanc-gerar').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('já foram geradas');
});

test('competencia padrao de imposto e o dia 1 do mes de referencia', async ({ page }) => {
    await abrir(page, null, 'pagar');
    await page.locator('#lanc-novo').click();
    await page.fill('#lf-descricao', 'DAS');
    await page.fill('#lf-valor', '500');
    await page.selectOption('#lf-categoria', 'cat_impostos');
    await page.fill('#lf-vencimento', '2026-12-20');
    await expect(page.locator('#lf-competencia')).toHaveValue('2026-11-01');
    await page.locator('#lf-salvar').click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).length).toBe(4);
    const c = (await ler(page, 'sc_cp')).find(x => x.descricao === 'DAS');
    expect(c).toMatchObject({ data_competencia: '2026-11-01', mes_referencia: '2026-11', categoria_id: 'cat_impostos' });
});

test('lancamento gerado pelo sistema nao deixa mudar valor e o pedido segue intocado', async ({ page }) => {
    await abrir(page);
    await acaoMenu(page, linha(page, 'receber', 'Entrada do pedido'), 'Editar');
    await expect(page.locator('#lf-valor')).toBeDisabled();
    await expect(page.locator('#lf-pedido')).toHaveCount(0);
    await page.fill('#lf-obs', 'obs nova');
    await page.locator('#lf-salvar').click();
    await expect.poll(async () => (await ler(page, 'sc_cr')).find(c => c.id === 6).observacoes).toBe('obs nova');
    expect((await ler(page, 'sc_cr')).find(c => c.id === 6).pedido_id).toBe(26300);
});

test('Contas a receber nao oferece Pedido (so o pedido gera receber); Contas a pagar oferece', async ({ page }) => {
    await abrir(page);
    await page.locator('#lanc-novo').click();
    await expect(page.locator('#lf-descricao')).toBeVisible();
    await expect(page.locator('#lf-pedido')).toHaveCount(0);
    await page.locator('#lanc-form-overlay .modal-close').click();
    await abrirLancamentos(page, 'pagar');
    await page.locator('#lanc-novo').click();
    await expect(page.locator('#lf-pedido')).toHaveCount(1);
});

test('parcela antiga de pedido (sem parcela_tipo) nao tem Excluir e o valor fica travado', async ({ page }) => {
    const velha = { id: 7, pedido_id: 26300, cliente_nome: 'Fabio', descricao: 'Saldo antigo do pedido', valor: 1000, status: 'Pendente', data_vencimento: '2026-11-28', data_competencia: '2026-11-28', categoria_id: 'cat_vendas', data_pagamento: null, historico: hist() };
    await abrir(page, { sc_cr: CR.concat([velha]) });
    expect(await acoesDaLinha(page, linha(page, 'receber', 'Saldo antigo do pedido'))).not.toContain('Excluir');
    await acaoMenu(page, linha(page, 'receber', 'Saldo antigo do pedido'), 'Editar');
    await expect(page.locator('#lf-valor')).toBeDisabled();
});

test('comissao gerada nao oferece Cancelar na tela', async ({ page }) => {
    const com = { id: 14, tipo: 'variavel', categoria: 'comissao', papel_comissao: 'vendedor', pedido_id: 26300, credor_nome: 'Vera', descricao: 'Comissao do pedido', valor: 300, status: 'Pendente', data_vencimento: '2026-11-29', data_competencia: '2026-11-29', categoria_id: 'cat_comissoes', data_pagamento: null, historico: hist() };
    await abrir(page, { sc_cp: CP.concat([com]) }, 'pagar');
    const acoes = await acoesDaLinha(page, linha(page, 'pagar', 'Comissao do pedido'));
    expect(acoes).not.toContain('Cancelar');
    expect(acoes).not.toContain('Excluir');
    expect(await acoesDaLinha(page, linha(page, 'pagar', 'Tecido'))).toContain('Cancelar');
    const r = await page.evaluate(() => cancelarLancamento('cp', 14, 'x'));
    expect(r).toBe(false);
    expect((await ler(page, 'sc_cp')).find(c => c.id === 14).status).toBe('Pendente');
});
