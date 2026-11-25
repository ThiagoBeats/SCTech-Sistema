// Financeiro novo, entrega 3, tarefa 4: Importar extrato (OFX) e Conciliar (Fluxo de caixa).
// Relogio fixo em todos: 20/11/2026.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const HOJE = new Date(2026, 10, 20, 10, 0, 0);
const FIX_SGML = path.join(__dirname, '..', 'fixtures', 'extrato-sgml.ofx');
const FIX_XML = path.join(__dirname, '..', 'fixtures', 'extrato-xml.ofx');
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const hist = [{ em: '2026-11-01T12:00:00.000Z', por: 1, porNome: 'Teste', acao: 'criado', detalhe: 'Lançamento manual' }];

const CONTAS = [
    { id: 1, nome: 'Itaú', tipo: 'banco', banco: '341', numero_conta: '56789-0', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01', ativo: true },
    { id: 2, nome: 'Bradesco', tipo: 'banco', banco: '237', numero_conta: '11111-1', saldo_inicial: 0, data_saldo_inicial: '2026-10-01', ativo: true },
    { id: 3, nome: 'Maquininha', tipo: 'maquininha', saldo_inicial: 0, data_saldo_inicial: '2026-10-01', ativo: true }
];
const cr = (id, nome, valor, venc, extra) => Object.assign({ id, cliente_nome: nome, descricao: 'Venda ' + nome, valor, status: 'Pendente', data_vencimento: venc,
    data_pagamento: null, data_competencia: venc, categoria_id: 'cat_vendas', historico: hist }, extra || {});
// Tres vendas no cartao (31, 41 e 31 brutos, taxa de 1 cada) que caem juntas na maquininha em 12/11: depositos liquidos 30 + 40 + 30.
const CARTAO = [20, 21, 22].map((id, i) => cr(id, ['Duda', 'Edu', 'Fabi'][i], [31, 41, 31][i], '2026-10-13',
    { status: 'Pago', data_pagamento: '2026-10-13', conta_id: 3, cartao: { tipo: 'credito', vezes: 1, antecipar: false } }));
const TAXAS = [20, 21, 22].map(id => ({ id: id + 10, tipo: 'variavel', categoria: 'taxa_cartao', descricao: 'Taxa de cartão', credor_nome: 'Maquininha', valor: 1,
    data_vencimento: '2026-11-12', data_pagamento: '2026-11-12', status: 'Pago', conta_id: 3, origem_cr_id: id, categoria_id: 'cat_taxas', historico: hist }));
const MOVS = [20, 21, 22].flatMap((id, i) => [
    { id: 100 + i * 2, conta_id: 3, data: '2026-11-12', sentido: 'entrada', valor: [31, 41, 31][i], origem: 'cr', origem_id: id, grupo_id: 'g' + id, descricao: 'Venda (cartão)' },
    { id: 101 + i * 2, conta_id: 3, data: '2026-11-12', sentido: 'saida', valor: 1, origem: 'cp', origem_id: id + 10, grupo_id: 'g' + id, descricao: 'Taxa de cartão' }
]);
const DADOS = {
    sc_contas_fin: CONTAS,
    sc_cr: [cr(10, 'Ana', 500, '2026-11-07', { conta_id: 2, forma_pagamento: 'PIX' }), cr(11, 'Bia', 300, '2026-11-08'), cr(12, 'Caio', 400, '2026-11-09')].concat(CARTAO),
    sc_cp: TAXAS, sc_mov_fin: MOVS
};

// Extrato SGML montado no teste: [data AAAAMMDD, valor, fitid, memo].
const ofx = (acct, trns) => Buffer.from(['OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'CHARSET:1252', '', '<OFX>', '<BANKMSGSRSV1>', '<STMTTRNRS>', '<STMTRS>',
    '<BANKACCTFROM>', '<BANKID>0341', '<ACCTID>' + acct, '</BANKACCTFROM>', '<BANKTRANLIST>',
    ...trns.map(t => `<STMTTRN>\r\n<TRNTYPE>${t[1] < 0 ? 'DEBIT' : 'CREDIT'}\r\n<DTPOSTED>${t[0]}120000[-3:BRT]\r\n<TRNAMT>${String(t[1]).replace('.', ',')}\r\n<FITID>${t[2]}\r\n<MEMO>${t[3]}\r\n</STMTTRN>`),
    '</BANKTRANLIST>', '</STMTRS>', '</STMTTRNRS>', '</BANKMSGSRSV1>', '</OFX>'].join('\r\n'), 'latin1');
const ITAU = ofx('56789-0', [['20261105', 500, 'L500', 'CRED PIX ANA'], ['20261108', 700, 'L700', 'DEP BIA E CAIO'], ['20261105', -1200.5, 'L1200', 'PAGTO ALUGUÉL'],
    ['20261109', -89.9, 'L89', 'TED MESMA TITULARIDADE'], ['20261110', -15, 'L15', 'TARIFA AVULSA']]);

async function abrir(page, dados, antes) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, dados || DADOS);
    if (antes) await antes(page);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="fluxo"]').click();
    await expect(page.locator('#fluxo-tabela')).toBeVisible();
}
// Importa pelo botao do Fluxo (ou da tela Conciliar, se aberta). `arquivo`: caminho ou Buffer.
async function importar(page, conta, arquivo, nome) {
    const doConc = page.locator('#conc-btn-importar');
    await ((await doConc.count()) ? doConc : page.locator('#fluxo-btn-importar')).click();
    await page.locator('#conc-imp-conta').selectOption(String(conta));
    await page.locator('#conc-imp-arquivo').setInputFiles(typeof arquivo === 'string' ? arquivo : { name: nome || 'extrato.ofx', mimeType: 'application/x-ofx', buffer: arquivo });
    await page.locator('#conc-imp-ok').click();
}
const linha = (page, texto) => page.locator('#conc-lista .conc-linha', { hasText: texto });
const extrato = async (page, fitid) => (await ler(page, 'sc_fin_extrato')).find(l => l.fitid === fitid);
const doCR = async (page, id) => (await ler(page, 'sc_cr')).find(c => c.id === id);
const kpi = (page, id) => page.locator('#fluxo-kpi-' + id + ' .res-kpi-valor');

test('importar o OFX do Itaú: 3 linhas novas; de novo (SGML ou XML), nada duplica', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, FIX_SGML);
    await expect(page.locator('.sc-toast').last()).toHaveText('3 linha(s) nova(s) importada(s); 0 já estavam no sistema.');
    await expect(page.locator('#conc-overlay')).toBeVisible();
    await expect(page.locator('#conc-resumo')).toHaveText('3 linha(s) nova(s) importada(s); 0 já estavam no sistema.');
    await expect(page.locator('#conc-conta')).toHaveValue('1');
    await expect(page.locator('#conc-lista .conc-linha')).toHaveCount(3);
    await expect(page.locator('#conc-aba-pendente')).toHaveText('Pendentes (3)');
    await expect(linha(page, 'PAGTO ALUGUÉL')).toContainText('− R$ 1.200,50');
    await expect(linha(page, 'CRED PIX JOÃO DA SILVA')).toContainText('+ R$ 2.500,00');
    const ext = await ler(page, 'sc_fin_extrato');
    expect(ext).toHaveLength(3);
    // Arquivo e hora ficam uma vez na importacao; cada linha guarda so o id dela.
    const imps = await ler(page, 'sc_fin_extrato_imp');
    expect(imps.map(i => [i.conta_id, i.arquivo, i.linhas])).toEqual([[1, 'extrato-sgml.ofx', 3]]);
    expect(ext.map(l => [l.conta_id, l.fitid, l.data, l.valor, l.situacao, l.mov_id, l.imp, 'arquivo' in l])).toEqual([
        [1, '202611050001', '2026-11-05', -1200.5, 'pendente', null, imps[0].id, false],
        [1, '202611060002', '2026-11-06', 2500, 'pendente', null, imps[0].id, false],
        [1, '202611090003', '2026-11-09', -89.9, 'pendente', null, imps[0].id, false]]);
    await importar(page, 1, FIX_SGML);
    await expect(page.locator('#conc-resumo')).toHaveText('0 linha(s) nova(s) importada(s); 3 já estavam no sistema.');
    await importar(page, 1, FIX_XML);
    await expect(page.locator('#conc-resumo')).toHaveText('0 linha(s) nova(s) importada(s); 3 já estavam no sistema.');
    expect(await ler(page, 'sc_fin_extrato')).toHaveLength(3);
    // A mesma linha em outra conta e outra linha.
    await page.locator('#conc-fechar').click();
    await importar(page, 3, FIX_XML);
    await expect(page.locator('#conc-resumo')).toHaveText('3 linha(s) nova(s) importada(s); 0 já estavam no sistema.');
    expect(await ler(page, 'sc_fin_extrato')).toHaveLength(6);
    expect(await ler(page, 'sc_fin_extrato_imp')).toHaveLength(2);
});

test('extrato de outra conta: pergunta antes; Cancelar não importa, Importar segue', async ({ page }) => {
    await abrir(page);
    await importar(page, 2, FIX_SGML);
    await expect(page.locator('#sc-modal-msg')).toHaveText('Este extrato parece ser da conta 56789-0, e você escolheu Bradesco. Importar mesmo assim?');
    await page.locator('#sc-modal-cancel').click();
    await expect(page.locator('#conc-imp-modal')).toBeVisible();
    expect(await ler(page, 'sc_fin_extrato')).toEqual([]);
    await page.locator('#conc-imp-ok').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#conc-resumo')).toHaveText('3 linha(s) nova(s) importada(s); 0 já estavam no sistema.');
    expect((await ler(page, 'sc_fin_extrato')).every(l => l.conta_id === 2)).toBe(true);
});

test('arquivo que não é OFX e janela sem conta mostram o erro', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-btn-importar').click();
    await page.locator('#conc-imp-ok').click();
    await expect(page.locator('#conc-imp-erro')).toHaveText('Escolha a conta.');
    await page.locator('#conc-imp-conta').selectOption('1');
    await page.locator('#conc-imp-ok').click();
    await expect(page.locator('#conc-imp-erro')).toHaveText('Escolha o arquivo .ofx do banco.');
    await page.locator('#conc-imp-arquivo').setInputFiles({ name: 'nota.ofx', mimeType: 'text/plain', buffer: Buffer.from('isto nao e um extrato') });
    await page.locator('#conc-imp-ok').click();
    await expect(page.locator('#conc-imp-erro')).toHaveText('Arquivo não reconhecido como extrato OFX.');
    expect(await ler(page, 'sc_fin_extrato')).toEqual([]);
});

test('linha +500 sugere a conta de 500: Confirmar dá baixa na data do extrato; Desfazer estorna', async ({ page }) => {
    await abrir(page);
    await page.locator('#fluxo-conta').selectOption('1');
    await expect(kpi(page, 'final')).toHaveText('R$ 1.000,00');
    await importar(page, 1, ITAU);
    const l500 = linha(page, 'CRED PIX ANA');
    await expect(l500.locator('.conc-sug')).toContainText('Lançamento · Ana - Venda Ana — R$ 500,00 · vence 07/11');
    await l500.locator('.conc-confirmar').click();
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (1)');
    let c = await doCR(page, 10);
    expect([c.status, c.data_pagamento, c.conta_id]).toEqual(['Pago', '2026-11-05', 1]);
    expect(c.historico.some(h => h.acao === 'conciliado' && h.detalhe === 'Conciliado com o extrato de 05/11')).toBe(true);
    const mov = (await ler(page, 'sc_mov_fin')).find(m => m.origem === 'cr' && m.origem_id === 10);
    expect([mov.conta_id, mov.data, mov.sentido, mov.valor]).toEqual([1, '2026-11-05', 'entrada', 500]);
    const ext = await extrato(page, 'L500');
    expect([ext.situacao, ext.mov_id]).toEqual(['conciliado', mov.id]);
    await page.locator('#conc-aba-conciliado').click();
    await expect(linha(page, 'CRED PIX ANA')).toContainText('Ana - Venda Ana');
    await page.locator('#conc-fechar').click();
    await expect(kpi(page, 'final')).toHaveText('R$ 1.500,00');
    // Ainda ha linha pendente em 05/11 (o aluguel): nada conferido ate la.
    await expect(page.locator('#fluxo-conferido')).toHaveCount(0);
    await page.locator('#fluxo-btn-conciliar').click();
    await linha(page, 'PAGTO ALUGUÉL').locator('.conc-ignorar').click();
    await page.locator('#conc-fechar').click();
    await expect(page.locator('#fluxo-conferido')).toContainText('Itaú · Conferido com o extrato até 05/11');

    // Desfazer: o recebimento volta a ficar em aberto (com a conta prevista de antes) e a linha volta para Pendentes.
    await page.locator('#fluxo-btn-conciliar').click();
    await page.locator('#conc-aba-conciliado').click();
    await linha(page, 'CRED PIX ANA').locator('.conc-desfazer').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('estornado');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#conc-aba-pendente')).toHaveText('Pendentes (4)');
    c = await doCR(page, 10);
    expect([c.status, c.data_pagamento, c.conta_id, c.forma_pagamento]).toEqual(['Atrasado', null, 2, 'PIX']);
    expect(c.historico.map(h => h.acao)).toEqual(['criado', 'baixa', 'conciliado', 'conciliado', 'estorno']);
    expect((await ler(page, 'sc_mov_fin')).some(m => m.origem === 'cr' && m.origem_id === 10)).toBe(false);
    const volta = await extrato(page, 'L500');
    expect([volta.situacao, volta.mov_id, volta.vinculos]).toEqual(['pendente', null, undefined]);
    await page.locator('#conc-fechar').click();
    await expect(kpi(page, 'final')).toHaveText('R$ 1.000,00');
    await expect(page.locator('#fluxo-conferido')).toHaveCount(0);
});

test('Escolher outro: dois lançamentos que somam o depósito; Confirmar só com a soma certa', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, ITAU);
    const l = linha(page, 'DEP BIA E CAIO');
    await expect(l.locator('.conc-sug')).toHaveText('Nenhuma sugestão automática.');
    await expect(l.locator('.conc-confirmar')).toHaveCount(0);
    await l.locator('.conc-btn-escolher').click();
    const cand = t => page.locator('#conc-escolher .conc-cand', { hasText: t }).locator('input');
    await cand('Bia').check();
    await expect(page.locator('#conc-soma')).toHaveText('Marcado: R$ 300,00 de R$ 700,00 (faltam R$ 400,00)');
    await expect(page.locator('#conc-escolher-ok')).toBeDisabled();
    await cand('Ana').check();
    await expect(page.locator('#conc-escolher-ok')).toBeDisabled();
    await cand('Ana').uncheck();
    await cand('Caio').check();
    await expect(page.locator('#conc-escolher-ok')).toBeEnabled();
    await page.locator('#conc-escolher-ok').click();
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (1)');
    for (const id of [11, 12]) {
        const c = await doCR(page, id);
        expect([c.status, c.data_pagamento, c.conta_id]).toEqual(['Pago', '2026-11-08', 1]);
    }
    expect((await doCR(page, 10)).status).toBe('Atrasado');
    const ext = await extrato(page, 'L700');
    expect(ext.mov_ids).toHaveLength(2);
    expect(ext.vinculos.map(v => [v.t, v.id, v.baixa])).toEqual([['cr', 11, true], ['cr', 12, true]]);
    // Desfazer estorna as duas.
    await page.locator('#conc-aba-conciliado').click();
    await linha(page, 'DEP BIA E CAIO').locator('.conc-desfazer').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (0)');
    expect((await doCR(page, 11)).status).toBe('Atrasado');
    expect((await doCR(page, 12)).status).toBe('Atrasado');
});

test('Criar lançamento: formulário preenchido e, ao salvar, a linha fica conciliada com ele', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, ITAU);
    const l = linha(page, 'PAGTO ALUGUÉL');
    await expect(l.locator('.conc-sug')).toHaveText('Nenhuma sugestão automática.');
    await l.locator('.conc-criar').click();
    await expect(page.locator('#lanc-form-overlay')).toContainText('Conta a pagar');
    await expect(page.locator('#lf-descricao')).toHaveValue('PAGTO ALUGUÉL');
    await expect(page.locator('#lf-valor')).toHaveValue('1200,50');
    await expect(page.locator('#lf-vencimento')).toHaveValue('2026-11-05');
    await expect(page.locator('#lf-conta')).toHaveValue('1');
    await expect(page.locator('#lf-parcelar')).toHaveCount(0);
    await page.fill('#lf-pessoa', 'Locador');
    await page.locator('#lf-categoria').selectOption('cat_aluguel');
    await page.locator('#lf-salvar').click();
    await expect(page.locator('#lanc-form-overlay')).toHaveCount(0);
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (1)');
    const cp = (await ler(page, 'sc_cp')).find(x => x.descricao === 'PAGTO ALUGUÉL');
    expect([cp.status, cp.data_pagamento, cp.conta_id, cp.valor, cp.categoria_id, cp.credor_nome]).toEqual(['Pago', '2026-11-05', 1, 1200.5, 'cat_aluguel', 'Locador']);
    expect(cp.historico.map(h => h.acao)).toEqual(['criado', 'baixa', 'conciliado']);
    const ext = await extrato(page, 'L1200');
    expect([ext.situacao, ext.criado]).toEqual(['conciliado', true]);
    const mov = (await ler(page, 'sc_mov_fin')).find(m => m.id === ext.mov_id);
    expect([mov.origem, mov.origem_id, mov.sentido, mov.valor, mov.data]).toEqual(['cp', cp.id, 'saida', 1200.5, '2026-11-05']);
});

test('Criar lançamento passa pela checagem de duplicidade', async ({ page }) => {
    const parecido = { id: 50, tipo: 'variavel', categoria: 'aluguel', credor_nome: 'Locador', descricao: 'Aluguel', valor: 1200.5, status: 'Pago',
        data_vencimento: '2026-11-04', data_pagamento: '2026-11-04', categoria_id: 'cat_aluguel', historico: hist };
    await abrir(page, Object.assign({}, DADOS, { sc_cp: TAXAS.concat([parecido]) }));
    await importar(page, 1, ITAU);
    await linha(page, 'PAGTO ALUGUÉL').locator('.conc-criar').click();
    await page.fill('#lf-pessoa', 'Locador');
    await page.locator('#lf-salvar').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('Já existe um lançamento parecido');
    await page.locator('#sc-modal-cancel').click();
    await expect(page.locator('#lanc-form-overlay')).toBeVisible();
    expect(await ler(page, 'sc_cp')).toHaveLength(TAXAS.length + 1);
    expect((await extrato(page, 'L1200')).situacao).toBe('pendente');
});

test('É transferência: cria o par de movimentos e o Fluxo (todas as contas) não muda Entradas/Saídas', async ({ page }) => {
    await abrir(page);
    const antes = [await kpi(page, 'entradas').textContent(), await kpi(page, 'saidas').textContent(), await kpi(page, 'final').textContent()];
    await importar(page, 1, ITAU);
    await linha(page, 'TED MESMA TITULARIDADE').locator('.conc-transf').click();
    await expect(page.locator('#conc-transf-modal')).toContainText('Saíram R$ 89,90 em 09/11/2026 de Itaú.');
    await page.locator('#conc-transf-ok').click();
    await expect(page.locator('#conc-transf-erro')).toHaveText('Escolha a outra conta.');
    await page.locator('#conc-transf-conta').selectOption('2');
    await page.locator('#conc-transf-ok').click();
    await expect(page.locator('#conc-transf-modal')).toHaveCount(0);
    const par = (await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'transferencia');
    expect(par.map(m => [m.conta_id, m.sentido, m.valor, m.data])).toEqual([[1, 'saida', 89.9, '2026-11-09'], [2, 'entrada', 89.9, '2026-11-09']]);
    const ext = await extrato(page, 'L89');
    expect([ext.situacao, ext.mov_id, ext.mov_ids]).toEqual(['transferencia', par[0].id, [par[0].id]]);
    await page.locator('#conc-aba-conciliado').click();
    await expect(linha(page, 'TED MESMA TITULARIDADE')).toContainText('Transferência para Bradesco');
    await page.locator('#conc-fechar').click();
    expect([await kpi(page, 'entradas').textContent(), await kpi(page, 'saidas').textContent(), await kpi(page, 'final').textContent()]).toEqual(antes);
    await expect(page.locator('#fluxo-linhas tr.fluxo-transferencia')).toHaveCount(2);
    // Excluir a transferencia pelo Fluxo devolve a linha para Pendentes.
    await page.locator('#fluxo-linhas tr.fluxo-transferencia').first().locator('.btn-kebab').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Excluir transferência' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await extrato(page, 'L89')).situacao).toBe('pendente');
});

test('Desfazer a transferência criada pela conciliação exclui o par', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, ITAU);
    await linha(page, 'TED MESMA TITULARIDADE').locator('.conc-transf').click();
    await page.locator('#conc-transf-conta').selectOption('2');
    await page.locator('#conc-transf-ok').click();
    await page.locator('#conc-aba-conciliado').click();
    await linha(page, 'TED MESMA TITULARIDADE').locator('.conc-desfazer').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('a transferência criada por ela é excluída');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#conc-aba-pendente')).toHaveText('Pendentes (5)');
    expect(await ler(page, 'sc_mov_fin')).toEqual(MOVS);
});

test('os dois lados de uma transferência: o segundo extrato liga à transferência já registrada (sem outro par)', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, ofx('56789-0', [['20261110', -1000, 'T1', 'TED PARA BRADESCO']]));
    await linha(page, 'TED PARA BRADESCO').locator('.conc-transf').click();
    await page.locator('#conc-transf-conta').selectOption('2');
    await page.locator('#conc-transf-ok').click();
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (1)');
    await importar(page, 2, ofx('11111-1', [['20261111', 1000, 'T2', 'TED RECEBIDA ITAU']]));
    await linha(page, 'TED RECEBIDA ITAU').locator('.conc-transf').click();
    await page.locator('#conc-transf-conta').selectOption('1');
    await page.locator('#conc-transf-ok').click();
    await expect(page.locator('.sc-toast').last()).toHaveText('Ligada à transferência de 10/11 já registrada.');
    const par = (await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'transferencia');
    expect(par.map(m => [m.conta_id, m.sentido, m.valor, m.data])).toEqual([[1, 'saida', 1000, '2026-11-10'], [2, 'entrada', 1000, '2026-11-10']]);
    const t2 = await extrato(page, 'T2');
    expect([t2.situacao, t2.mov_id, t2.mov_ids, t2.transf_grupo]).toEqual(['transferencia', par[1].id, [par[1].id], undefined]);
    await page.locator('#conc-fechar').click();
    await page.locator('#fluxo-conta').selectOption('1');
    await expect(kpi(page, 'final')).toHaveText('R$ 0,00');
    await page.locator('#fluxo-conta').selectOption('2');
    await expect(kpi(page, 'final')).toHaveText('R$ 1.000,00');
    // Desfazer a ligacao so desliga; desfazer o lado que criou o par exclui o par e o outro lado volta a pendente.
    await page.locator('#fluxo-btn-conciliar').click();
    await page.locator('#conc-aba-conciliado').click();
    await linha(page, 'TED RECEBIDA ITAU').locator('.conc-desfazer').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('lançamentos e movimentos ficam como estão');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await extrato(page, 'T2')).situacao).toBe('pendente');
    expect((await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'transferencia')).toHaveLength(2);
    await page.locator('#conc-aba-pendente').click();
    await linha(page, 'TED RECEBIDA ITAU').locator('.conc-transf').click();
    await page.locator('#conc-transf-conta').selectOption('1');
    await page.locator('#conc-transf-ok').click();
    await expect.poll(async () => (await extrato(page, 'T2')).situacao).toBe('transferencia');
    await page.locator('#conc-conta').selectOption('1');
    await page.locator('#conc-aba-conciliado').click();
    await linha(page, 'TED PARA BRADESCO').locator('.conc-desfazer').click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'transferencia').length).toBe(0);
    expect((await extrato(page, 'T2')).situacao).toBe('pendente');
});

test('conta cadastrada sem o dígito: o ACCTID com dígito não dispara o aviso', async ({ page }) => {
    await abrir(page, Object.assign({}, DADOS, { sc_contas_fin: CONTAS.map(c => (c.id === 1 ? Object.assign({}, c, { numero_conta: '56789' }) : c)) }));
    await importar(page, 1, FIX_SGML);
    await expect(page.locator('#conc-resumo')).toHaveText('3 linha(s) nova(s) importada(s); 0 já estavam no sistema.');
});

test('Ignorar leva a linha para Ignoradas; Desfazer devolve', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, ITAU);
    await linha(page, 'TARIFA AVULSA').locator('.conc-ignorar').click();
    await expect(page.locator('#conc-aba-ignorado')).toHaveText('Ignoradas (1)');
    await expect(page.locator('#conc-aba-pendente')).toHaveText('Pendentes (4)');
    expect((await extrato(page, 'L15')).situacao).toBe('ignorado');
    await page.locator('#conc-aba-ignorado').click();
    await expect(linha(page, 'TARIFA AVULSA')).toContainText('Ignorada');
    await linha(page, 'TARIFA AVULSA').locator('.conc-desfazer').click();
    await expect(page.locator('#conc-aba-pendente')).toHaveText('Pendentes (5)');
    expect((await extrato(page, 'L15')).situacao).toBe('pendente');
    // Ignorada nao conta como conferida.
    await page.locator('#conc-aba-pendente').click();
    await linha(page, 'TARIFA AVULSA').locator('.conc-ignorar').click();
    await page.locator('#conc-fechar').click();
    await expect(page.locator('#fluxo-conferido')).toHaveCount(0);
});

test('depósito da maquininha que junta três vendas: sugestão "3 repasses" e liga aos movimentos', async ({ page }) => {
    await abrir(page);
    await importar(page, 3, ofx('99999', [['20261112', 100, 'D100', 'CREDITO VENDAS CARTAO']]));
    const l = linha(page, 'CREDITO VENDAS CARTAO');
    // Escolher outro: o repasse e o movimento que o representa nao podem ir juntos.
    await l.locator('.conc-btn-escolher').click();
    const rep20 = page.locator('#conc-escolher input[value="rep:20:2026-11-12"]');
    const mov100 = page.locator('#conc-escolher input[value="mov:100"]');
    await expect(mov100).toBeEnabled();
    await rep20.check();
    await expect(mov100).toBeDisabled();
    await rep20.uncheck();
    await expect(mov100).toBeEnabled();
    await mov100.check();
    await expect(rep20).toBeDisabled();
    await page.locator('#conc-escolher-cancelar').click();
    await expect(l.locator('.conc-sug')).toContainText('3 repasses de cartão de 12/11 — R$ 100,00');
    await l.locator('.conc-confirmar').click();
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (1)');
    const ext = await extrato(page, 'D100');
    expect(ext.mov_ids.slice().sort()).toEqual([100, 101, 102, 103, 104, 105]);
    expect(ext.vinculos.map(v => [v.t, v.id, v.data])).toEqual([['rep', 20, '2026-11-12'], ['rep', 21, '2026-11-12'], ['rep', 22, '2026-11-12']]);
    expect((await doCR(page, 20)).historico.pop().detalhe).toBe('Repasse do cartão de 12/11 conciliado com o extrato de 12/11');
    expect(await ler(page, 'sc_mov_fin')).toEqual(MOVS);
    // So liga: Desfazer nao mexe em recebimentos nem movimentos.
    await page.locator('#conc-aba-conciliado').click();
    await linha(page, 'CREDITO VENDAS CARTAO').locator('.conc-desfazer').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('lançamentos e movimentos ficam como estão');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#conc-aba-pendente')).toHaveText('Pendentes (1)');
    expect(await ler(page, 'sc_mov_fin')).toEqual(MOVS);
    expect((await doCR(page, 20)).status).toBe('Pago');
});

test('sem completo em Contas a receber: entradas sem Confirmar nem Criar lançamento', async ({ page }) => {
    await abrir(page, DADOS, p => p.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr'));
        u[0].papel_id = 4;
        u[0].permissoes_extras = { 'financeiro.fluxo': { nivel: 'completo', acoes_restritas: [] }, 'financeiro.receber': { nivel: 'visualizar', acoes_restritas: [] },
            'financeiro.pagar': { nivel: 'completo', acoes_restritas: [] } };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    }));
    await importar(page, 1, ITAU);
    const l = linha(page, 'CRED PIX ANA');
    await expect(l.locator('.conc-sug')).toContainText('Ana - Venda Ana');
    await expect(l.locator('.conc-confirmar')).toHaveCount(0);
    await expect(l.locator('.conc-criar')).toHaveCount(0);
    await expect(l.locator('.conc-ignorar')).toBeVisible();
    await expect(linha(page, 'PAGTO ALUGUÉL').locator('.conc-criar')).toBeVisible();
    // Escolher outro: o lancamento aparece travado.
    await l.locator('.conc-btn-escolher').click();
    await expect(page.locator('#conc-escolher .conc-cand', { hasText: 'Ana' }).locator('input')).toBeDisabled();
    // Chamando direto: a baixa e recusada.
    await page.evaluate(() => { _ccAplicar(db.fin_extrato.find(l => l.fitid === 'L500').id, ['cr:10']); });
    await expect(page.locator('#sc-modal-msg')).toContainText('permissão');
    await page.locator('#sc-modal-ok').click();
    expect((await doCR(page, 10)).status).toBe('Atrasado');
});

test('backup exporta e importa sc_fin_extrato', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, FIX_SGML);
    await expect(page.locator('#conc-resumo')).toContainText('3 linha(s)');
    const exportado = await page.evaluate(() => JSON.stringify(_dadosExportacao(false)));
    const dados = JSON.parse(exportado);
    expect(dados.fin_extrato).toHaveLength(3);
    const antes = await ler(page, 'sc_fin_extrato');
    await page.evaluate(() => localStorage.setItem('sc_fin_extrato', '[]'));
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }), exportado);
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    await page.waitForFunction(() => typeof db !== 'undefined');
    expect(await ler(page, 'sc_fin_extrato')).toEqual(antes);
    expect(await page.evaluate(() => db.fin_extrato.length)).toBe(3);
    // Backup antigo (sem extrato): fica vazio.
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }),
        JSON.stringify(Object.assign({}, dados, { fin_extrato: undefined })));
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    await page.waitForFunction(() => typeof db !== 'undefined');
    expect(await ler(page, 'sc_fin_extrato')).toEqual([]);
});

test('tela Conciliar em 390px sem rolagem horizontal e no tema escuro', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await abrir(page, DADOS, p => p.evaluate(() => localStorage.setItem('sc_tema', 'dark')));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await importar(page, 1, ITAU);
    await linha(page, 'DEP BIA E CAIO').locator('.conc-btn-escolher').click();
    await expect(page.locator('#conc-escolher')).toBeVisible();
    const largura = await page.evaluate(() => { const o = document.getElementById('conc-overlay'); return [o.scrollWidth, o.clientWidth, document.documentElement.scrollWidth]; });
    expect(largura[0]).toBeLessThanOrEqual(largura[1]);
    expect(largura[2]).toBeLessThanOrEqual(390);
});

// ---------- revisao final da entrega 3 ----------
test('É transferência: não liga à transferência de mesmo valor que foi para uma terceira conta', async ({ page }) => {
    const manual = [
        { id: 300, conta_id: 1, data: '2026-11-10', sentido: 'saida', valor: 1000, origem: 'transferencia', origem_id: null, grupo_id: 'tm', descricao: 'Transferência para Maquininha' },
        { id: 301, conta_id: 3, data: '2026-11-10', sentido: 'entrada', valor: 1000, origem: 'transferencia', origem_id: null, grupo_id: 'tm', descricao: 'Transferência de Itaú' }];
    await abrir(page, Object.assign({}, DADOS, { sc_mov_fin: MOVS.concat(manual) }));
    await importar(page, 1, ofx('56789-0', [['20261112', -1000, 'T12', 'TED PARA BRADESCO'], ['20261110', -1000, 'T10', 'TED PARA MAQUININHA']]));
    await linha(page, 'TED PARA BRADESCO').locator('.conc-transf').click();
    await page.locator('#conc-transf-conta').selectOption('2');
    await page.locator('#conc-transf-ok').click();
    await expect(page.locator('.sc-toast').last()).toHaveText('Transferência registrada.');
    const tr = (await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'transferencia');
    expect(tr).toHaveLength(4);
    const novo = tr.find(m => m.conta_id === 2);
    expect([novo.sentido, novo.valor, novo.data]).toEqual(['entrada', 1000, '2026-11-12']);
    expect((await extrato(page, 'T12')).mov_ids).not.toContain(300);
    // A linha de 10/11 para a Maquininha liga a transferencia que ja existia (sem outro par).
    await linha(page, 'TED PARA MAQUININHA').locator('.conc-transf').click();
    await page.locator('#conc-transf-conta').selectOption('3');
    await page.locator('#conc-transf-ok').click();
    await expect(page.locator('.sc-toast').last()).toHaveText('Ligada à transferência de 10/11 já registrada.');
    expect((await ler(page, 'sc_mov_fin')).filter(m => m.origem === 'transferencia')).toHaveLength(4);
    expect((await extrato(page, 'T10')).mov_ids).toEqual([300]);
    await page.locator('#conc-fechar').click();
    for (const [c, v] of [['1', 'R$ -1.000,00'], ['2', 'R$ 1.000,00'], ['3', 'R$ 1.100,00']]) {
        await page.locator('#fluxo-conta').selectOption(c);
        await expect(kpi(page, 'final')).toHaveText(v);
    }
});

test('depois de Confirmar, a outra linha de mesmo valor perde a sugestão usada sem redesenhar as demais', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, ofx('56789-0', [['20261105', 500, 'A1', 'PIX ANA UM'], ['20261106', 500, 'A2', 'PIX ANA DOIS'], ['20261108', 700, 'B1', 'DEPOSITO']]));
    await expect(linha(page, 'PIX ANA DOIS').locator('.conc-sug')).toContainText('Ana - Venda Ana');
    await page.evaluate(() => { document.querySelector('#conc-lista .conc-linha:last-child').dataset.marca = '1'; });
    await linha(page, 'PIX ANA UM').locator('.conc-confirmar').click();
    await expect(page.locator('#conc-aba-pendente')).toHaveText('Pendentes (2)');
    await expect(linha(page, 'PIX ANA DOIS').locator('.conc-sug')).toHaveText('Nenhuma sugestão automática.');
    expect(await page.evaluate(() => document.querySelector('#conc-lista .conc-linha[data-marca]').textContent.includes('DEPOSITO'))).toBe(true);
});

test('importações: ignorar todas as pendentes de uma importação e excluir a importação (só sem conciliada)', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, ITAU, 'itau-nov.ofx');
    const abrirImps = () => page.evaluate(() => { document.getElementById('conc-imps').open = true; });
    await expect(page.locator('#conc-resumo')).toContainText('5 linha(s)');
    await abrirImps();
    await expect(page.locator('#conc-imps .conc-imp')).toContainText('itau-nov.ofx');
    await expect(page.locator('#conc-imps .conc-imp')).toContainText('5 linha(s), 5 pendente(s)');
    await linha(page, 'CRED PIX ANA').locator('.conc-confirmar').click();
    await expect(page.locator('#conc-imps .conc-imp-excluir')).toHaveCount(0);
    await page.locator('#conc-imps .conc-imp-ignorar').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Ignorar as 4 linha(s) pendentes desta importação?');
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#conc-aba-ignorado')).toHaveText('Ignoradas (4)');
    await expect(page.locator('#conc-aba-pendente')).toHaveText('Pendentes (0)');
    await page.locator('#conc-aba-conciliado').click();
    await linha(page, 'CRED PIX ANA').locator('.conc-desfazer').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (0)');
    await abrirImps();
    await page.locator('#conc-imps .conc-imp-excluir').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('Excluir esta importação? As 5 linha(s) dela saem da conciliação');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_fin_extrato')).length).toBe(0);
    expect(await ler(page, 'sc_fin_extrato_imp')).toEqual([]);
    await importar(page, 1, ITAU);
    await expect(page.locator('#conc-resumo')).toHaveText('5 linha(s) nova(s) importada(s); 0 já estavam no sistema.');
});

test('linha antiga (arquivo e hora na própria linha) continua agrupada por importação', async ({ page }) => {
    const antigas = [1, 2].map(i => ({ id: i, conta_id: 1, fitid: 'v' + i, data: '2026-11-0' + i, valor: -10 * i, descricao: 'ANTIGA ' + i,
        importado_em: '2026-11-15T13:00:00.000Z', arquivo: 'velho.ofx', situacao: 'pendente', mov_id: null }));
    await abrir(page, Object.assign({}, DADOS, { sc_fin_extrato: antigas }));
    await page.locator('#fluxo-btn-conciliar').click();
    await page.evaluate(() => { document.getElementById('conc-imps').open = true; });
    await expect(page.locator('#conc-imps .conc-imp')).toContainText('velho.ofx');
    await expect(page.locator('#conc-imps .conc-imp')).toContainText('2 linha(s), 2 pendente(s)');
    await page.locator('#conc-imps .conc-imp-excluir').click();
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_fin_extrato')).length).toBe(0);
});

test('repasse "a cair" que o banco já depositou passa para a data do extrato; Desfazer volta a data', async ({ page }) => {
    const gil = cr(23, 'Gil', 51, '2026-11-19', { status: 'Pago', data_pagamento: '2026-11-19', conta_id: 3, cartao: { tipo: 'debito', vezes: 1, antecipar: false } });
    const taxa = { id: 33, tipo: 'variavel', categoria: 'taxa_cartao', descricao: 'Taxa de cartão', credor_nome: 'Maquininha', valor: 1, data_vencimento: '2026-11-23',
        data_pagamento: '2026-11-23', status: 'Pago', conta_id: 3, origem_cr_id: 23, categoria_id: 'cat_taxas', historico: hist };
    const movs = [{ id: 110, conta_id: 3, data: '2026-11-23', sentido: 'entrada', valor: 51, origem: 'cr', origem_id: 23, grupo_id: 'g23', descricao: 'Venda Gil (cartão)' },
        { id: 111, conta_id: 3, data: '2026-11-23', sentido: 'saida', valor: 1, origem: 'cp', origem_id: 33, grupo_id: 'g23', descricao: 'Taxa de cartão' }];
    await abrir(page, Object.assign({}, DADOS, { sc_cr: DADOS.sc_cr.concat([gil]), sc_cp: TAXAS.concat([taxa]), sc_mov_fin: MOVS.concat(movs) }));
    await importar(page, 3, ofx('99999', [['20261120', 50, 'G50', 'CREDITO CARTAO GIL']]));
    const l = linha(page, 'CREDITO CARTAO GIL');
    await expect(l.locator('.conc-sug')).toContainText('Repasse de cartão');
    await l.locator('.conc-confirmar').click();
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (1)');
    const datas = async () => {
        const m = await ler(page, 'sc_mov_fin');
        const cp = (await ler(page, 'sc_cp')).find(x => x.id === 33);
        return [m.find(x => x.id === 110).data, m.find(x => x.id === 111).data, cp.data_pagamento, cp.data_vencimento];
    };
    expect(await datas()).toEqual(['2026-11-20', '2026-11-20', '2026-11-20', '2026-11-20']);
    await page.locator('#conc-aba-conciliado').click();
    await linha(page, 'CREDITO CARTAO GIL').locator('.conc-desfazer').click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#conc-aba-conciliado')).toHaveText('Conciliadas (0)');
    expect(await datas()).toEqual(['2026-11-23', '2026-11-23', '2026-11-23', '2026-11-23']);
});

test('Criar lançamento com o valor mudado: salva o lançamento e avisa que a linha continua pendente', async ({ page }) => {
    await abrir(page);
    await importar(page, 1, ITAU);
    await linha(page, 'PAGTO ALUGUÉL').locator('.conc-criar').click();
    await page.fill('#lf-valor', '1000,00');
    await page.fill('#lf-pessoa', 'Locador');
    await page.locator('#lf-salvar').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('O lançamento foi salvo, mas o valor não bate com o extrato; a linha continua pendente.');
    await page.locator('#sc-modal-ok').click();
    const cp = (await ler(page, 'sc_cp')).find(x => x.descricao === 'PAGTO ALUGUÉL');
    expect([cp.valor, cp.data_pagamento]).toEqual([1000, null]);
    expect((await extrato(page, 'L1200')).situacao).toBe('pendente');
});

test('2.000 linhas pendentes: a tela Conciliar desenha em pouco tempo', async ({ page }) => {
    await abrir(page);
    const ms = await page.evaluate(() => {
        const movs = [];
        for (let i = 0; i < 5000; i++) movs.push({ id: 10000 + i, conta_id: 1 + (i % 3), data: '2026-' + String(1 + (i % 10)).padStart(2, '0') + '-' + String(1 + (i % 28)).padStart(2, '0'), sentido: i % 2 ? 'saida' : 'entrada', valor: 10 + (i % 700), origem: 'ajuste', origem_id: null });
        db.movimentos_fin = db.movimentos_fin.concat(movs);
        db.fin_extrato = [];
        for (let i = 0; i < 2000; i++) db.fin_extrato.push({ id: i + 1, conta_id: 1, fitid: 'p' + i, data: '2026-' + String(1 + (i % 10)).padStart(2, '0') + '-15', valor: (i % 2 ? -1 : 1) * (10 + (i % 700)), descricao: 'LINHA ' + i, situacao: 'pendente', mov_id: null });
        const t0 = performance.now();
        abrirConciliacao(1);
        return performance.now() - t0;
    });
    await expect(page.locator('#conc-lista .conc-linha')).toHaveCount(2000);
    console.log('Conciliar com 2.000 linhas: ' + Math.round(ms) + ' ms');
    expect(ms).toBeLessThan(3000);
});

// Paridade (mes semeado, hoje 20/11, todas as contas):
// - Resumo "Saldo total" = Fluxo "Saldo final" com o periodo 01/11 a 20/11 (a conta que so abre em 28/11 fica fora dos dois);
// - Fluxo "Entradas" (01/11 a 20/11) menos as entradas de ajuste de saldo e de categorias "so caixa" (aporte) = DRE caixa,
//   linha Receitas, coluna Nov (aberturas de conta nao entram nas Entradas; transferencias nao entram com todas as contas).
test('paridade Resumo x Fluxo x DRE (caixa) num mês semeado', async ({ page }) => {
    const contas = [
        { id: 1, nome: 'A', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-10-01', ativo: true },
        { id: 2, nome: 'B', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-10-01', ativo: true },
        { id: 4, nome: 'Futura', tipo: 'banco', saldo_inicial: 500, data_saldo_inicial: '2026-11-28', ativo: true }
    ];
    const crs = [
        cr(1, 'Ana', 500, '2026-11-05', { status: 'Pago', data_pagamento: '2026-11-05', conta_id: 1, categoria_id: 'cat_vendas' }),
        cr(2, 'Bia', 300, '2026-11-06', { status: 'Pago', data_pagamento: '2026-11-06', conta_id: 2, categoria_id: 'cat_vendas' }),
        cr(3, 'Sócio', 2000, '2026-11-07', { status: 'Pago', data_pagamento: '2026-11-07', conta_id: 1, categoria_id: 'cat_aporte' })
    ];
    const cps = [{ id: 1, tipo: 'variavel', categoria: 'aluguel', credor_nome: 'Locador', descricao: 'Aluguel', valor: 200, status: 'Pago', data_vencimento: '2026-11-10',
        data_pagamento: '2026-11-10', categoria_id: 'cat_aluguel', conta_id: 1, historico: hist }];
    const movs = [
        { id: 1, conta_id: 1, data: '2026-11-05', sentido: 'entrada', valor: 500, origem: 'cr', origem_id: 1 },
        { id: 2, conta_id: 2, data: '2026-11-06', sentido: 'entrada', valor: 300, origem: 'cr', origem_id: 2 },
        { id: 3, conta_id: 1, data: '2026-11-07', sentido: 'entrada', valor: 2000, origem: 'cr', origem_id: 3 },
        { id: 4, conta_id: 1, data: '2026-11-10', sentido: 'saida', valor: 200, origem: 'cp', origem_id: 1 },
        { id: 5, conta_id: 1, data: '2026-11-11', sentido: 'saida', valor: 100, origem: 'transferencia', grupo_id: 't', origem_id: null },
        { id: 6, conta_id: 2, data: '2026-11-11', sentido: 'entrada', valor: 100, origem: 'transferencia', grupo_id: 't', origem_id: null },
        { id: 7, conta_id: 2, data: '2026-11-12', sentido: 'entrada', valor: 50, origem: 'ajuste', origem_id: null, descricao: 'Ajuste de saldo' },
        { id: 8, conta_id: 1, data: '2026-11-25', sentido: 'entrada', valor: 999, origem: 'ajuste', origem_id: null, descricao: 'Futuro' }
    ];
    await abrir(page, { sc_contas_fin: contas, sc_cr: crs, sc_cp: cps, sc_mov_fin: movs });
    const brl = t => Number(String(t).replace(/[^\d,-]/g, '').replace(',', '.'));
    await page.fill('#fluxo-ate', '2026-11-20');
    await page.locator('#fluxo-ate').dispatchEvent('change');
    const fluxoFinal = brl(await kpi(page, 'final').textContent());
    const fluxoEntradas = brl(await kpi(page, 'entradas').textContent());
    expect(fluxoFinal).toBe(3650);
    expect(fluxoEntradas).toBe(2850);
    await page.locator('.fin-tab-btn[data-tab="resumo"]').click();
    expect(brl(await page.locator('#res-saldo-total').textContent())).toBe(fluxoFinal);
    await page.locator('.fin-tab-btn[data-tab="dre"]').click();
    await expect(page.locator('#dre-tabela')).toBeVisible();
    const receitasNov = brl(await page.locator('#dre-tabela tr[data-chave="receitas"] td').nth(10).textContent());
    const ajustes = 50, soCaixa = 2000;
    expect(fluxoEntradas - ajustes - soCaixa).toBe(receitasNov);
    expect(receitasNov).toBe(800);
});
