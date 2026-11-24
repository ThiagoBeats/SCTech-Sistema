// Financeiro novo, entrega 1, tarefa 3: os dados no sistema. Migracao v4 unica
// (com copia antes), campos novos gravados pelos geradores, competencia do pedido
// que nao muda, pedido excluido cancela as contas em aberto e Cancelado fica fora
// de atraso, sino e previsao; o backup leva e traz as categorias e os campos novos.
// O entrar() abre login.html com o storage vazio: a migracao ja roda ali e grava a
// versao; por isso os testes da migracao apagam a marca depois de semear.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const texto = (page, k) => page.evaluate(c => localStorage.getItem(c), k);
const HOJE = new Date(2026, 10, 24, 10, 0, 0);
const DEPOIS = new Date(2027, 0, 3, 10, 0, 0);   // +40 dias

const CLI = [{ id: 1, nome: 'Ana Paula Lima' }, { id: 2, nome: 'Bruno Costa' }];
const FORN = [{ id: 3, nome: 'Imobiliária Centro', cnpj: '11.222.333/0001-81' }];
const VEND = [{ id: 5, nome: 'Carla', comissao_pct: 5 }];

const PED_ANTIGO = { id: 26500, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Medição', financeiro_gerado: true,
    valor: 1000, valor_recebido: 500, ambientes: [], itens: [], data_entrega: '2026-12-15' };
const CRS = [
    { id: 601, pedido_id: 26500, cliente_nome: 'Ana Paula Lima', descricao: 'Entrada — Pedido #26500', valor: 500,
      data_vencimento: '2026-11-10', data_pagamento: '2026-11-10', status: 'Pago', parcela_tipo: 'entrada', conta_id: 10 },
    { id: 602, pedido_id: 26500, cliente_nome: 'Ana Paula Lima', descricao: 'Saldo na instalação — Pedido #26500', valor: 500,
      data_vencimento: '2026-12-15', data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' },
    { id: 603, pedido_id: null, cliente_nome: 'Bruno Costa', descricao: 'Venda avulsa', valor: 80,
      data_vencimento: '2026-12-01', data_pagamento: null, status: 'Pendente' }
];
const CPS = [
    { id: 701, pedido_id: null, tipo: 'fixo', categoria: 'aluguel', descricao: 'Aluguel', credor_nome: 'Imobiliária Centro',
      valor: 1500, data_vencimento: '2026-12-05', data_pagamento: null, status: 'Pendente', despesa_fixa_id: 801,
      arquivo_anexo_url: 'data:application/pdf;base64,JVBERi0xLjQK', arquivo_anexo_nome: 'contrato.pdf', arquivo_anexo_tipo: 'application/pdf' },
    { id: 702, pedido_id: null, tipo: 'variavel', categoria: 'imposto', descricao: 'DAS', credor_nome: 'Receita',
      valor: 120, data_vencimento: '2026-11-20', data_pagamento: '2026-11-20', status: 'Pago', mes_referencia: '2026-10', conta_id: 10 }
];
const DFS = [{ id: 801, descricao: 'Aluguel', valor: 1500, dia_vencimento: 5, categoria: 'aluguel', ativo: true }];
const CONTAS = [{ id: 10, nome: 'Banco do Brasil', tipo: 'banco', saldo_inicial: 1000, data_saldo_inicial: '2026-01-01', ativo: true },
    { id: 11, nome: 'Caixa da loja', tipo: 'caixa', saldo_inicial: 50, data_saldo_inicial: '2026-01-01', ativo: true }];
const MOVS = [
    { id: 901, conta_id: 10, data: '2026-11-10', sentido: 'entrada', valor: 500, origem: 'cr', origem_id: 601, grupo_id: 1, descricao: 'Entrada' },
    { id: 902, conta_id: 10, data: '2026-11-20', sentido: 'saida', valor: 120, origem: 'cp', origem_id: 702, grupo_id: null, descricao: 'DAS' }
];
const ANTIGOS = { sc_cli: CLI, sc_forn: FORN, sc_vend: VEND, sc_ped: [PED_ANTIGO], sc_cr: CRS, sc_cp: CPS, sc_df: DFS, sc_contas_fin: CONTAS, sc_mov_fin: MOVS };
const CHAVES = ['sc_cr', 'sc_cp', 'sc_df', 'sc_contas_fin', 'sc_mov_fin', 'sc_ped', 'sc_fin_cat', 'sc_fin_backup_v3', 'sc_fin_versao'];

async function semearAntigos(page, extras) {
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, { ...ANTIGOS, ...(extras || {}) });
    await page.evaluate(() => ['sc_fin_versao', 'sc_fin_backup_v3', 'sc_fin_cat'].forEach(k => localStorage.removeItem(k)));
}

test('migracao v4: copia antes, categorias, competencia, pessoas, contas bancarias; valores iguais; recarregar nao muda nada', async ({ page }) => {
    await semearAntigos(page);
    await page.goto(BASE + '/financeiro.html');
    await expect.poll(() => texto(page, 'sc_fin_versao')).toBe('4');

    const copia = await ler(page, 'sc_fin_backup_v3');
    expect(typeof copia.em).toBe('string');
    expect(copia.sc_cr).toEqual(CRS);
    // A copia nao leva o anexo (a migracao nao mexe nele): fica a marca, com o nome e o tipo.
    expect(copia.sc_cp).toEqual([{ ...CPS[0], arquivo_anexo_url: '[anexo não copiado]' }, CPS[1]]);
    expect((await ler(page, 'sc_cp'))[0].arquivo_anexo_url, 'o anexo continua no lancamento').toBe(CPS[0].arquivo_anexo_url);
    expect(copia.sc_df).toEqual(DFS);
    expect(copia.sc_contas_fin).toEqual(CONTAS);
    expect(copia.sc_mov_fin).toEqual(MOVS);

    const cat = await ler(page, 'sc_fin_cat');
    expect(cat.categorias.map(c => c.id)).toContain('cat_vendas');
    expect(cat.subgrupos.length).toBe(3);

    const crs = await ler(page, 'sc_cr');
    const cr = id => crs.find(c => c.id === id);
    expect(cr(601).categoria_id).toBe('cat_vendas');
    expect(cr(602).categoria_id).toBe('cat_vendas');
    expect(cr(601).data_competencia, 'competencia = menor vencimento do pedido').toBe('2026-11-10');
    expect(cr(602).data_competencia).toBe('2026-11-10');
    expect(cr(601).cliente_id).toBe(1);
    expect(cr(603).categoria_id).toBe('cat_outras_rec');
    expect(cr(603).cliente_id, 'nome exato unico').toBe(2);
    expect(cr(603).data_competencia).toBe('2026-12-01');
    expect(cr(602).historico).toEqual([expect.objectContaining({ acao: 'criado', detalhe: 'Migrado do financeiro anterior' })]);

    const cps = await ler(page, 'sc_cp');
    const cp = id => cps.find(c => c.id === id);
    expect(cp(701).categoria_id).toBe('cat_aluguel');
    expect(cp(701).fornecedor_id).toBe(3);
    expect(cp(702).categoria_id).toBe('cat_impostos');
    expect(cp(702).data_competencia).toBe('2026-10-01');
    expect((await ler(page, 'sc_df'))[0].categoria_id).toBe('cat_aluguel');
    expect((await ler(page, 'sc_ped'))[0].data_aprovacao).toBe('2026-11-10');

    const contas = await ler(page, 'sc_contas_fin');
    expect(contas[0]).toEqual({ ...CONTAS[0], banco: null, agencia: '', numero_conta: '', tipo_conta: 'corrente', conexao: 'manual', saldo_atualizado_em: '2026-11-20' });
    expect(contas[1]).toEqual({ ...CONTAS[1], banco: null, agencia: '', numero_conta: '', tipo_conta: 'caixa', conexao: 'manual', saldo_atualizado_em: null });

    // Nenhum valor, status, data ou movimento mudou.
    const base = l => l.map(c => [c.id, c.valor, c.status, c.data_vencimento, c.data_pagamento]);
    expect(base(crs)).toEqual(base(CRS));
    expect(base(cps)).toEqual(base(CPS));
    expect(await ler(page, 'sc_mov_fin')).toEqual(MOVS);
    const saldos = await page.evaluate(() => getContasFin().map(c => CaixaCore.saldoConta(c, db.movimentos_fin, '2026-11-24')));
    expect(saldos).toEqual([1380, 50]);

    const antes = await page.evaluate(ks => ks.map(k => localStorage.getItem(k)), CHAVES);
    await page.reload();
    await page.waitForFunction(() => typeof db !== 'undefined');
    expect(await page.evaluate(ks => ks.map(k => localStorage.getItem(k)), CHAVES)).toEqual(antes);
});

test('aprovar grava data_aprovacao e historico; voltar para Orcamento e aprovar em outra data mantem a competencia', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    const orc = { id: 26510, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Orçamento', valor: 1000, vendedor_id: 5, vendedor_nome: 'Carla',
        data_entrega: '2027-02-01', entrada_pct: 50, forma_pagamento: 'PIX', ambientes: [], itens: [] };
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [orc] });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { aprovarPedido(26510); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].status).toBe('Medição');
    expect((await ler(page, 'sc_ped'))[0].data_aprovacao).toBe('2026-11-24');
    let crs = await ler(page, 'sc_cr');
    expect(crs.length).toBe(2);
    crs.forEach(c => {
        expect(c.data_competencia).toBe('2026-11-24');
        expect(c.categoria_id).toBe('cat_vendas');
        expect(c.cliente_id).toBe(1);
        expect(c.historico[0].acao).toBe('criado');
        expect(c.historico[0].por).toBe(1);
    });

    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { voltarPedidoParaOrcamento(26510); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].status).toBe('Orçamento');
    expect(await ler(page, 'sc_cr')).toEqual([]);

    await page.clock.setFixedTime(DEPOIS);
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { aprovarPedido(26510); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped'))[0].status).toBe('Medição');
    expect((await ler(page, 'sc_ped'))[0].data_aprovacao).toBe('2026-11-24');
    crs = await ler(page, 'sc_cr');
    expect(crs.length).toBe(2);
    expect(crs.map(c => c.data_competencia)).toEqual(['2026-11-24', '2026-11-24']);
    expect(crs.find(c => c.parcela_tipo === 'entrada').data_vencimento, 'vencimento e o da nova aprovacao').toBe('2027-01-03');
});

test('pedido que voltou para Orcamento, editado e aprovado pela tela do pedido, mantem a data de aprovacao', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    const ped = { id: 26520, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Orçamento', valor: 1000, vendedor_id: 5, vendedor_nome: 'Carla',
        data_entrega: '2027-02-01', entrada_pct: 50, forma_pagamento: 'PIX', financeiro_gerado: false, data_aprovacao: '2026-10-02',
        ambientes: [], itens: [{ materialId: 1, nome: 'X', quantidade: 1, preco_unit: 1000, subtotal: 1000 }] };
    await entrar(page, BASE, { sc_cli: CLI, sc_vend: VEND, sc_ped: [ped], sc_editando_id: 26520 });
    await page.goto(BASE + '/pedido.html');
    await page.waitForFunction(() => typeof pedidoDraft !== 'undefined' && document.getElementById('ped-status'));
    await page.selectOption('#ped-status', 'Medição');
    await page.evaluate(() => {
        if (!pedidoDraft.ambientes.length) adicionarAmbiente();
        pedidoDraft.ambientes.forEach(a => { a.calculado = true; });
        document.getElementById('ped-desconto').value = 0;
        salvarPedido();
    });
    await page.waitForURL(/index\.html/);
    expect((await ler(page, 'sc_ped'))[0].data_aprovacao).toBe('2026-10-02');
    const crs = await ler(page, 'sc_cr');
    expect(crs.length).toBe(2);
    expect(crs.map(c => c.data_competencia)).toEqual(['2026-10-02', '2026-10-02']);
});

test('excluir pedido sem recebimento cancela as contas em aberto; Cancelado vencido nao vira Atrasado nem aparece no sino', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    const ped = (id, extra) => ({ id, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Medição', financeiro_gerado: true,
        valor: 1000, valor_recebido: 0, ambientes: [], itens: [], ...(extra || {}) });
    const cr = (id, pedido_id, venc) => ({ id, pedido_id, cliente_nome: 'Ana Paula Lima', descricao: 'Parcela ' + id, valor: 500,
        data_vencimento: venc, data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' });
    const com = { id: 750, pedido_id: 26530, descricao: 'Comissão', credor_nome: 'Carla', valor: 50, categoria: 'comissao',
        papel_comissao: 'vendedor', data_vencimento: '2026-11-01', status: 'Pendente', tipo: 'variavel' };
    await entrar(page, BASE, { sc_cli: CLI, sc_ped: [ped(26530), ped(26531)],
        sc_cr: [cr(611, 26530, '2026-11-01'), cr(612, 26530, '2026-12-20'), cr(613, 26531, '2026-11-02')],
        sc_cp: [com, { id: 751, pedido_id: 26530, descricao: 'RT antiga', credor_nome: 'Arq', valor: 30, categoria: 'comissao_rt', data_vencimento: '2026-12-01', status: 'Pendente', tipo: 'variavel' }] });
    await page.goto(BASE + '/pcp.html');
    await page.evaluate(() => { excluirPedido(26530); });
    await expect(page.locator('#sc-modal-msg')).toContainText('4 conta(s) deste pedido no Financeiro serão canceladas');
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_ped')).length).toBe(1);

    const crs = await ler(page, 'sc_cr');
    expect(crs.map(c => c.id)).toEqual([611, 612, 613]);
    [611, 612].forEach(id => {
        const c = crs.find(x => x.id === id);
        expect(c.status).toBe('Cancelado');
        expect(c.motivo_cancelamento).toBe('Pedido excluído');
        expect(c.cancelado_por).toBe(1);
        expect(c.historico[c.historico.length - 1]).toEqual(expect.objectContaining({ acao: 'cancelado', detalhe: 'Pedido excluído' }));
    });
    const c750 = (await ler(page, 'sc_cp'))[0];
    expect(c750.status).toBe('Cancelado');
    expect(c750.motivo_cancelamento).toBe('Pedido excluído');
    const rt = (await ler(page, 'sc_cp'))[1];
    expect([rt.status, rt.motivo_cancelamento], 'comissao RT antiga tambem').toEqual(['Cancelado', 'Pedido excluído']);

    // Abrir o Financeiro marca os vencidos como Atrasado: o cancelado fica como esta.
    await page.goto(BASE + '/financeiro.html');
    await expect.poll(async () => (await ler(page, 'sc_cr')).find(c => c.id === 613).status).toBe('Atrasado');
    expect((await ler(page, 'sc_cr')).find(c => c.id === 611).status).toBe('Cancelado');
    expect((await ler(page, 'sc_cp'))[0].status).toBe('Cancelado');

    const r = await page.evaluate(() => {
        const hoje = hojeLocal();
        const al = finAlertasCalcular(hoje).filter(a => a.tipo === 'fin_atraso').map(a => a.id);
        const t = CaixaCore.tarefasHoje({ hoje, contasReceber: db.contas_receber, contasPagar: db.contas_pagar, movimentos: [], contas: [] });
        const prev = CaixaCore.lancamentosPrevistos({ hoje, limite: '2027-03-01', movimentos: [], contasReceber: db.contas_receber, contasPagar: db.contas_pagar, despesasFixas: [], contas: [], meios: [] });
        return { al, rec: t.receberAtrasados.map(x => x.id), pag: t.pagarAtrasados.map(x => x.id), prev: prev.map(l => l.valor) };
    });
    expect(r.al).toEqual(['atraso-rec:613']);
    expect(r.rec).toEqual([613]);
    expect(r.pag).toEqual([]);
    expect(r.prev).toEqual([500]);
});

test('backup: exportar e importar traz as categorias e os campos novos; backup antigo passa pela migracao', async ({ page }) => {
    await semearAntigos(page);
    await page.goto(BASE + '/index.html');
    await expect.poll(() => texto(page, 'sc_fin_versao')).toBe('4');
    // Categoria renomeada pelo dono: o backup leva o nome novo.
    await page.evaluate(() => { db.fin_categorias.categorias.find(c => c.id === 'cat_aluguel').nome = 'Aluguel da loja'; syncDB(); });
    const exportado = await page.evaluate(() => JSON.stringify(_dadosExportacao(true)));
    const dados = JSON.parse(exportado);
    expect(dados.fin_versao).toBe('4');
    expect(dados.fin_categorias.categorias.find(c => c.id === 'cat_aluguel').nome).toBe('Aluguel da loja');
    const crsAntes = await ler(page, 'sc_cr');
    const catAntes = await ler(page, 'sc_fin_cat');

    // Some com tudo e importa o arquivo.
    await page.evaluate(() => { localStorage.setItem('sc_fin_cat', '{"subgrupos":[],"categorias":[]}'); localStorage.setItem('sc_cr', '[]'); });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }), exportado);
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    await page.waitForFunction(() => typeof db !== 'undefined');
    expect(await ler(page, 'sc_fin_cat')).toEqual(catAntes);
    expect(await ler(page, 'sc_cr')).toEqual(crsAntes);
    expect(await texto(page, 'sc_fin_versao')).toBe('4');

    // Backup antigo (sem campos novos): ao recarregar, a migracao roda nos dados importados.
    const antigo = JSON.stringify({ clientes: CLI, catalogo: [], pedidos: [PED_ANTIGO], contas_receber: CRS, contas_pagar: CPS,
        despesas_fixas: DFS, contas_fin: CONTAS, movimentos_fin: MOVS, fornecedores: FORN, fin_fase0: 1 });
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }), antigo);
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    await expect.poll(() => texto(page, 'sc_fin_versao')).toBe('4');
    const crs = await ler(page, 'sc_cr');
    expect(crs.find(c => c.id === 602).categoria_id).toBe('cat_vendas');
    expect((await ler(page, 'sc_fin_cat')).categorias.find(c => c.id === 'cat_aluguel').nome, 'sem categorias no arquivo: as padrao').toBe('Aluguel');
    expect((await ler(page, 'sc_fin_backup_v3')).sc_cr).toEqual(CRS);
});

// Sem espaco: a migracao v4 nao deixa a copia ocupando espaco, nada muda e o aviso oferece baixar e seguir.
const semEspacoPara = (page, chave) => page.addInitScript(c => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
        if (k === c) throw new DOMException('cheio', 'QuotaExceededError');
        return orig.call(this, k, v);
    };
}, chave);

for (const [chave, caso] of [['sc_fin_backup_v3', 'a copia nao cabe'], ['sc_fin_versao', 'a gravacao final falha']]) {
    test(`migracao v4 sem espaco (${caso}): dados iguais, sem copia, aviso; baixar a copia e seguir conclui`, async ({ page }) => {
        await semearAntigos(page);
        await semEspacoPara(page, chave);
        await page.goto(BASE + '/financeiro.html');
        const aviso = page.locator('#fin-backup');
        await expect(aviso).toContainText('Não foi possível guardar a cópia de segurança no navegador. Baixe a cópia para continuar.');
        expect(await texto(page, 'sc_fin_versao')).toBeNull();
        expect(await texto(page, 'sc_fin_backup_v3'), 'a copia nao fica ocupando espaco').toBeNull();
        expect(await ler(page, 'sc_cr')).toEqual(CRS);
        expect(await ler(page, 'sc_cp')).toEqual(CPS);
        expect(await ler(page, 'sc_contas_fin')).toEqual(CONTAS);
        expect(await ler(page, 'sc_ped')).toEqual([PED_ANTIGO]);
        if (chave === 'sc_fin_versao') return;   // sem gravar a versao, a migracao nunca termina (nada a baixar e seguir aqui)
        const [dl] = await Promise.all([page.waitForEvent('download'), aviso.locator('button', { hasText: 'Baixar cópia e corrigir dados' }).click()]);
        expect(dl.suggestedFilename()).toMatch(/^sctech_copia_financeiro_v3_\d{4}-\d{2}-\d{2}\.json$/);
        const baixado = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
        expect(baixado.sc_cp, 'o arquivo leva os anexos').toEqual(CPS);
        await expect.poll(() => texto(page, 'sc_fin_versao')).toBe('4');
        await page.waitForFunction(() => typeof db !== 'undefined');
        expect((await ler(page, 'sc_cr')).find(c => c.id === 602).categoria_id).toBe('cat_vendas');
        expect(await texto(page, 'sc_fin_backup_v3')).toBeNull();
        expect(await texto(page, 'sc_fin_v4_falhou')).toBeNull();
        await expect(aviso).not.toContainText('Baixe a cópia para continuar');
    });
}

test('historico de baixa e estorno com o nome de quem fez; saldo atualizado na baixa; excluido fica registrado sem o anexo', async ({ page }) => {
    await page.clock.setFixedTime(HOJE);
    const conta = { id: 10, nome: 'Banco do Brasil', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', ativo: true,
        tipo_conta: 'corrente', conexao: 'manual', saldo_atualizado_em: '2026-01-01' };
    const cr = { id: 621, pedido_id: null, cliente_nome: 'Bruno Costa', descricao: 'Venda', valor: 200, data_vencimento: '2026-11-30',
        data_pagamento: null, status: 'Pendente', historico: [{ em: '2026-11-01T10:00:00.000Z', por: null, porNome: 'Sistema', acao: 'criado', detalhe: '' }] };
    const cp = { id: 721, pedido_id: null, tipo: 'variavel', categoria: 'outro', descricao: 'Nota', credor_nome: 'X', valor: 10,
        data_vencimento: '2026-12-01', data_pagamento: null, status: 'Pendente',
        arquivo_anexo_url: 'data:application/pdf;base64,JVBERi0xLjQK', arquivo_anexo_nome: 'nota.pdf', arquivo_anexo_tipo: 'application/pdf' };
    await entrar(page, BASE, { sc_cli: CLI, sc_cr: [cr], sc_cp: [cp], sc_contas_fin: [conta],
        sc_meios_pag: [{ id: 1, nome: 'PIX', tipo: 'pix', conta_id: 10 }] });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { baixarContasReceber('2026-11-20', [{ id: 621, valor: null, meio_id: 1, conta_id: 10 }]); syncDB(); });
    let c = (await ler(page, 'sc_cr'))[0];
    expect(c.historico.map(h => h.acao)).toEqual(['criado', 'baixa']);
    expect(c.historico[1]).toEqual(expect.objectContaining({ por: 1, porNome: 'Teste' }));
    expect(c.historico[1].detalhe).toContain('R$ 200,00');
    expect((await ler(page, 'sc_contas_fin'))[0].saldo_atualizado_em).toBe('2026-11-24T10:00');

    await page.evaluate(() => { estornarCR(621); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cr'))[0].status).toBe('Pendente');
    c = (await ler(page, 'sc_cr'))[0];
    expect(c.historico.map(h => h.acao)).toEqual(['criado', 'baixa', 'estorno']);
    expect(c.historico[2]).toEqual(expect.objectContaining({ por: 1, porNome: 'Teste' }));

    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { excluirCP(721); });
    await page.locator('#sc-modal-ok').click();
    await expect.poll(async () => (await ler(page, 'sc_cp')).length).toBe(0);
    const exc = await ler(page, 'sc_fin_excluidos');
    expect(exc.length).toBe(1);
    expect(exc[0]).toEqual(expect.objectContaining({ tipo: 'cp', por: 1, porNome: 'Teste' }));
    expect(exc[0].lancamento).toEqual({ ...cp, arquivo_anexo_url: '[anexo não copiado]' });
});
