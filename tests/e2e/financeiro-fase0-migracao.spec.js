// Financeiro fase 0 - migracao unica dos dados antigos: ao abrir o app, pedido
// pago com parcela em aberto e baixado, comissao paga vira conta paga, conta a
// receber sem pedido sai; antes, uma copia de seguranca. Recarregar nao muda nada.
// O entrar() abre login.html com o storage vazio, e a migracao ja roda ali e
// grava a marca; por isso cada teste aqui apaga a marca depois de semear.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const lerChave = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const CONFIRMADO = new Date('2026-10-05T15:00:00').getTime();
const INSTALADO = new Date('2026-10-01T15:00:00').getTime();
const PGTO_COMISSAO = new Date('2026-10-20T15:00:00').getTime();

const VEND = [{ id: 2, nome: 'Bruno', comissao_pct: 5, tipo: 'vendedor' }];
const PEDIDOS = [
    { id: 26500, clienteId: 1, clienteNome: 'Ana <b>Lima</b>', status: 'Instalado', financeiro_gerado: true, valor: 1000, valor_recebido: 1000,
      ambientes: [], data_instalado: INSTALADO, pagamento_confirmado_em: CONFIRMADO, pagamento_confirmado_por: 1,
      vendedor_id: 2, vendedor_nome: 'Bruno', comissao_pct: 5, comissao_valor: 50, comissao_paga: true, comissao_data_pgto: PGTO_COMISSAO },
    { id: 26501, clienteId: 1, clienteNome: 'Ana <b>Lima</b>', status: 'Na Costura', financeiro_gerado: true, valor: 800, valor_recebido: 300, ambientes: [] },
];
const CRS = [
    { id: 601, pedido_id: 26500, cliente_nome: 'Ana', descricao: 'Entrada — Pedido #26500', valor: 500, data_vencimento: '2026-09-01', data_pagamento: '2026-09-01', status: 'Pago' },
    { id: 602, pedido_id: 26500, cliente_nome: 'Ana', descricao: 'Saldo — Pedido #26500', valor: 500, data_vencimento: '2026-10-01', data_pagamento: null, status: 'Atrasado' },
    { id: 603, pedido_id: 26501, cliente_nome: 'Ana', descricao: 'Pagamento — Pedido #26501', valor: 800, data_vencimento: '2026-12-01', data_pagamento: null, status: 'Pendente' },
    { id: 604, pedido_id: 99999, cliente_nome: 'Fulano', descricao: 'Órfã aberta', valor: 70, data_vencimento: '2026-10-01', data_pagamento: null, status: 'Pendente' },
    { id: 605, pedido_id: 99999, cliente_nome: 'Fulano', descricao: 'Órfã paga', valor: 30, data_vencimento: '2026-09-01', data_pagamento: '2026-09-01', status: 'Pago' },
];

async function semearDadosAntigos(page) {
    await entrar(page, BASE, { sc_cli: [{ id: 1, nome: 'Ana Lima' }], sc_vend: VEND, sc_ped: PEDIDOS, sc_cr: CRS, sc_cp: [] });
    await page.evaluate(() => { localStorage.removeItem('sc_fin_migracao'); localStorage.removeItem('sc_fin_revisar'); localStorage.removeItem('sc_fin_backup_fase0'); });
}

test('abrir o financeiro migra os dados antigos uma vez, com copia de seguranca', async ({ page }) => {
    await semearDadosAntigos(page);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');

    const crs = await lerChave(page, 'sc_cr');
    const c602 = crs.find(c => c.id === 602);
    expect([c602.status, c602.data_pagamento, c602.baixado_por]).toEqual(['Pago', '2026-10-05', 1]);
    expect(crs.find(c => c.id === 603).status, 'pedido parcial nao e baixado').toBe('Pendente');
    expect(crs.find(c => c.id === 604), 'orfa aberta sai').toBeUndefined();
    expect(crs.find(c => c.id === 605).pedido_excluido, 'orfa paga fica marcada').toBe(true);

    const cps = await lerChave(page, 'sc_cp');
    expect(cps).toHaveLength(1);
    expect([cps[0].papel_comissao, cps[0].status, cps[0].valor, cps[0].data_pagamento, cps[0].data_vencimento, cps[0].baixado_por])
        .toEqual(['vendedor', 'Pago', 50, '2026-10-20', '2026-10-01', 'migracao']);

    const peds = await lerChave(page, 'sc_ped');
    expect(peds.find(p => p.id === 26500).valor_recebido).toBe(1000);
    expect(peds.find(p => p.id === 26501).valor_recebido, 'Financeiro passa a valer').toBe(0);
    expect(peds.every(p => !p.custo_snapshot)).toBe(true);

    const backup = await lerChave(page, 'sc_fin_backup_fase0');
    expect(backup.contas_receber).toHaveLength(5);
    expect(backup.contas_receber.find(c => c.id === 602).status).toBe('Atrasado');
    expect(backup.contas_pagar).toEqual([]);
    expect(backup.pedidos.find(p => p.id === 26501).valor_recebido).toBe(300);

    const revisar = await lerChave(page, 'sc_fin_revisar');
    expect(revisar.map(r => r.pedido_id)).toEqual([26501]);

    // Recarregar nao muda nada.
    const antes = await page.evaluate(() => ['sc_cr', 'sc_cp', 'sc_ped'].map(k => localStorage.getItem(k)));
    await page.reload();
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-kpis')).not.toBeEmpty();
    const depois = await page.evaluate(() => ['sc_cr', 'sc_cp', 'sc_ped'].map(k => localStorage.getItem(k)));
    expect(depois).toEqual(antes);
});

test('aviso de revisao na Visao Geral; marcar como revisado limpa', async ({ page }) => {
    await semearDadosAntigos(page);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    const aviso = page.locator('#fin-revisar');
    await expect(aviso).toContainText('Confira estes pedidos');
    await expect(aviso).toContainText('#26501');
    await expect(aviso).toContainText('Ana <b>Lima</b>');   // texto escapado, nao vira negrito
    await expect(aviso.locator('b')).toHaveCount(0);
    await aviso.locator('#fin-revisar-ok').click();
    await expect(aviso).toBeEmpty();
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_revisar'))).toBeNull();
    await page.reload();
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-kpis')).not.toBeEmpty();
    await expect(page.locator('#fin-revisar')).toBeEmpty();
});

test('arquiteto gravado no campo de vendedor vira comissao de arquiteto, uma so', async ({ page }) => {
    const vend = [{ id: 3, nome: 'Studio M', comissao_pct: 10, tipo: 'arquiteto' }];
    const ped = { id: 26600, clienteId: 1, clienteNome: 'Ana', status: 'Instalado', financeiro_gerado: true, valor: 1000, valor_recebido: 1000,
        ambientes: [], data_instalado: INSTALADO, vendedor_id: 3, vendedor_nome: 'Studio M', comissao_pct: 10, comissao_valor: 100,
        comissao_paga: true, comissao_data_pgto: PGTO_COMISSAO };
    const cr = [{ id: 701, pedido_id: 26600, valor: 1000, data_vencimento: '2026-10-01', data_pagamento: '2026-10-01', status: 'Pago' }];
    await entrar(page, BASE, { sc_vend: vend, sc_ped: [ped], sc_cr: cr, sc_cp: [] });
    await page.evaluate(() => localStorage.removeItem('sc_fin_migracao'));
    await page.goto(BASE + '/login.html');   // na login o checkAuth nao roda: a migracao precisa acertar sozinha
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-kpis')).not.toBeEmpty();
    const cps = (await lerChave(page, 'sc_cp')).filter(c => c.categoria === 'comissao');
    expect(cps).toHaveLength(1);
    expect([cps[0].papel_comissao, cps[0].status, cps[0].valor, cps[0].credor_nome]).toEqual(['arquiteto', 'Pago', 100, 'Studio M']);
    const p = (await lerChave(page, 'sc_ped'))[0];
    expect([p.arq_id, p.arq_comissao_paga, p.vendedor_id, !!p.comissao_paga]).toEqual([3, true, null, false]);
    // gerar de novo nao duplica
    const n = await page.evaluate(() => { gerarComissoesPedido(db.pedidos[0]); return db.contas_pagar.filter(c => c.categoria === 'comissao').length; });
    expect(n).toBe(1);
});

test('nova tentativa nao sobrescreve a copia de seguranca que ja existe', async ({ page }) => {
    await semearDadosAntigos(page);
    const antiga = JSON.stringify({ criado_em: 1, contas_receber: [{ id: 1 }], contas_pagar: [], pedidos: [] });
    await page.evaluate(b => localStorage.setItem('sc_fin_backup_fase0', b), antiga);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
    expect((await lerChave(page, 'sc_cr')).find(c => c.id === 602).status, 'migrou mesmo assim').toBe('Pago');
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_backup_fase0'))).toBe(antiga);
});

test('importar um backup limpa a marca, a copia e a lista de revisao', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [], sc_cr: [], sc_cp: [] });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { localStorage.setItem('sc_fin_backup_fase0', '{"velha":true}'); localStorage.setItem('sc_fin_revisar', '[{"pedido_id":1}]'); });
    // Backup antigo: pedido instalado com parcela em aberto e valor todo recebido.
    const backup = { clientes: [], catalogo: [], vendedores: [], contas_pagar: [],
        pedidos: [{ id: 26700, clienteNome: 'Ana', status: 'Instalado', financeiro_gerado: true, valor: 200, valor_recebido: 200, ambientes: [] }],
        contas_receber: [{ id: 801, pedido_id: 26700, valor: 200, data_vencimento: '2026-10-01', status: 'Pendente' }] };
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json', { type: 'application/json' })], value: '' } }), JSON.stringify(backup));
    await page.locator('#sc-modal-ok').click();
    await page.waitForLoadState('load');
    // Ao recarregar, a migracao roda de novo sobre os dados importados, com copia nova.
    await expect.poll(async () => ((await lerChave(page, 'sc_cr')) || []).find(c => c.id === 801)?.status).toBe('Pago');
    const copia = await lerChave(page, 'sc_fin_backup_fase0');
    expect(copia.velha).toBeUndefined();
    expect(copia.contas_receber[0].status).toBe('Pendente');
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_revisar'))).toBeNull();
});

test('sem nada para migrar, so grava a marca (sem copia)', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [], sc_cr: [], sc_cp: [] });
    await page.evaluate(() => localStorage.removeItem('sc_fin_migracao'));
    await page.goto(BASE + '/index.html');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_backup_fase0'))).toBeNull();
});

const fs = require('fs');
const lerDownload = async dl => JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
const importar = (page, dados) => page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json', { type: 'application/json' })], value: '' } }), JSON.stringify(dados));

test('exportar leva a marca da Fase 0, a empresa e as formas; importar esse arquivo nao migra de novo', async ({ page }) => {
    const empresa = { razao_social: 'CORTINAS X', regime_tributario: 'simples', aliquota_estimada: 6 };
    const formas = [{ nome: 'PIX', desconto: 3, entrada: 100 }, { nome: '30% entrada + 70%', desconto: 0, entrada: 30 }];
    // Pedido quitado no fluxo antigo com parcela em aberto: a migracao o baixaria.
    await entrar(page, BASE, { sc_empresa: empresa, sc_formas_pag: formas, sc_cli: [{ id: 1, nome: 'Ana' }], sc_cp: [],
        sc_ped: [{ id: 26800, clienteNome: 'Ana', status: 'Instalado', financeiro_gerado: true, valor: 200, valor_recebido: 0, ambientes: [], pagamento_confirmado_em: CONFIRMADO }],
        sc_cr: [{ id: 811, pedido_id: 26800, valor: 200, data_vencimento: '2099-10-01', status: 'Pendente' }] });
    await page.goto(BASE + '/index.html');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportarDados())]);
    const arq = await lerDownload(dl);
    expect(arq.fin_fase0).toBe(1);
    expect(arq.empresa).toEqual(empresa);
    expect(arq.formas_pag).toEqual(formas);

    await page.evaluate(() => {
        localStorage.removeItem('sc_empresa'); localStorage.removeItem('sc_formas_pag');
        localStorage.setItem('sc_fin_backup_fase0', '{"velha":true}'); localStorage.setItem('sc_fin_revisar', '[{"pedido_id":1}]');
    });
    await importar(page, arq);
    await page.locator('#sc-modal-ok').click();
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-kpis')).not.toBeEmpty();
    expect((await lerChave(page, 'sc_cr')).find(c => c.id === 811).status, 'nao baixa de novo').toBe('Pendente');
    expect(await page.evaluate(() => [localStorage.getItem('sc_fin_backup_fase0'), localStorage.getItem('sc_fin_revisar')])).toEqual([null, null]);
    expect(await lerChave(page, 'sc_empresa')).toEqual(empresa);
    expect(await lerChave(page, 'sc_formas_pag')).toEqual(formas);
});

test('backup antigo sem empresa nem formas nao apaga as atuais', async ({ page }) => {
    const empresa = { razao_social: 'CORTINAS X' };
    await entrar(page, BASE, { sc_empresa: empresa, sc_ped: [], sc_cr: [], sc_cp: [] });
    await page.goto(BASE + '/index.html');
    await importar(page, { clientes: [], catalogo: [], pedidos: [] });
    await page.locator('#sc-modal-ok').click();
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
    expect(await lerChave(page, 'sc_empresa')).toEqual(empresa);
});

test('valor recebido digitado em pedido sem parcelas fica e vai para revisao', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: [{ id: 1, nome: 'Ana' }], sc_cp: [], sc_cr: [],
        sc_ped: [{ id: 26900, clienteNome: 'Ana', status: 'Orçamento', valor: 1000, valor_recebido: 300, ambientes: [] }] });
    await page.evaluate(() => localStorage.removeItem('sc_fin_migracao'));
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-revisar')).toContainText('sem lançamento no Financeiro');
    await expect(page.locator('#fin-revisar')).toContainText('#26900');
    expect((await lerChave(page, 'sc_ped'))[0].valor_recebido).toBe(300);
    expect((await lerChave(page, 'sc_fin_revisar')).map(r => [r.pedido_id, r.valor_digitado])).toEqual([[26900, 300]]);
});

test('sem espaco para a copia: nao migra, avisa e oferece baixar a copia e corrigir', async ({ page }) => {
    await semearDadosAntigos(page);
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            if (k === 'sc_fin_backup_fase0') throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
    });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    const aviso = page.locator('#fin-backup');
    await expect(aviso).toContainText('Não foi possível guardar a cópia de segurança no navegador. Baixe a cópia para continuar.');
    expect(await page.evaluate(() => [localStorage.getItem('sc_fin_migracao'), localStorage.getItem('sc_fin_backup_falhou')])).toEqual([null, '1']);
    expect((await lerChave(page, 'sc_cr')).find(c => c.id === 602).status, 'nada migrado').toBe('Atrasado');

    const [dl] = await Promise.all([page.waitForEvent('download'), aviso.locator('button', { hasText: 'Baixar cópia e corrigir dados' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^sctech_backup_antes_fase0_\d{4}-\d{2}-\d{2}\.json$/);
    const copia = await lerDownload(dl);
    expect(copia.contas_receber.find(c => c.id === 602).status).toBe('Atrasado');
    expect(copia.fin_fase0, 'a copia e de antes da migracao').toBeUndefined();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
    await expect(page.locator('#fin-kpis')).not.toBeEmpty();
    expect((await lerChave(page, 'sc_cr')).find(c => c.id === 602).status).toBe('Pago');
    expect(await page.evaluate(() => [localStorage.getItem('sc_fin_backup_falhou'), localStorage.getItem('sc_fin_backup_fase0')])).toEqual([null, null]);
    await expect(page.locator('#fin-backup')).toBeEmpty();
});

test('com a copia guardada, a Visao Geral oferece baixar e descartar', async ({ page }) => {
    await semearDadosAntigos(page);
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    const aviso = page.locator('#fin-backup');
    const [dl] = await Promise.all([page.waitForEvent('download'), aviso.locator('button', { hasText: /^Baixar cópia$/ }).click()]);
    const copia = await lerDownload(dl);
    expect(copia.contas_receber.find(c => c.id === 602).status).toBe('Atrasado');
    await aviso.locator('button', { hasText: 'Descartar cópia' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect(aviso).toBeEmpty();
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_backup_fase0'))).toBeNull();
});

test('erro ao salvar a migracao deixa a marca sem gravar e aparece no aviso', async ({ page }) => {
    await semearDadosAntigos(page);
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            // So a gravacao com a comissao criada pela migracao estoura (o resto da pagina salva normal).
            if (k === 'sc_cp' && String(v).includes('papel_comissao') && !sessionStorage.getItem('libera')) throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
    });
    await page.goto(BASE + '/financeiro.html');
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect(page.locator('#fin-backup')).toContainText('Não foi possível salvar');
    expect(await page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBeNull();
    expect((await lerChave(page, 'sc_cr')).find(c => c.id === 602).status, 'volta ao que era').toBe('Atrasado');
    // Com espaco de novo, a proxima abertura migra e o aviso de erro some.
    await page.evaluate(() => sessionStorage.setItem('libera', '1'));
    await page.reload();
    await page.locator('.fin-tab-btn[data-tab="dashboard"]').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sc_fin_migracao'))).toBe('1');
    expect((await lerChave(page, 'sc_cr')).find(c => c.id === 602).status).toBe('Pago');
    await expect(page.locator('#fin-backup')).not.toContainText('Não foi possível salvar');
});
