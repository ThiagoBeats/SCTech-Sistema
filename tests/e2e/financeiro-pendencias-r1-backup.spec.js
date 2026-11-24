// Pendencias R1, tarefa 1: falta de espaco no navegador, importacao, ids da
// migracao antiga, recarga depois do download e aviso de copia parcial.
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, acaoLanc } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8151';
const MSG = 'Não foi possível salvar: o espaço do navegador acabou. Baixe uma cópia de segurança e libere espaço.';
const falharChave = (page, chave) => page.addInitScript(c => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
        if (k === c && window.__cheio !== false) throw new DOMException('cheio', 'QuotaExceededError');
        return orig.call(this, k, v);
    };
}, chave);

test('syncDB sem espaco: avisa uma vez, nao quebra', async ({ page }) => {
    await entrar(page, BASE, {});
    await falharChave(page, 'sc_cp');
    await page.goto(BASE + '/index.html');
    const r = await page.evaluate(() => {
        const a = syncDB(), b = syncDB(), c = syncDB();
        return [a, b, c];
    });
    expect(r).toEqual([false, false, false]);
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG);
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#sc-modal-overlay')).toBeHidden();
    expect(await page.evaluate(() => syncDB())).toBe(false);
    await expect(page.locator('#sc-modal-overlay'), 'segundo erro nao reabre o aviso').toBeHidden();
});

test('importar sem espaco para a empresa: nada e gravado (dados, metas, marca e copia da Fase 0 ficam como estavam)', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: [{ id: 1, nome: 'Velho' }], sc_fin_metas: { '2026-10': 9000 }, sc_fin_backup_fase0: { x: 1 }, sc_fin_revisar: [{ a: 1 }] });
    await page.evaluate(() => localStorage.setItem('sc_fin_migracao', '1'));
    await falharChave(page, 'sc_empresa');
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }),
        JSON.stringify({ clientes: [{ id: 7, nome: 'Bia' }], catalogo: [], pedidos: [], fin_metas: { '2026-11': 1 }, empresa: { nome: 'X' } }));
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('A importação não foi concluída. ' + MSG);
    expect(await page.evaluate(() => window.__marca), 'so recarrega depois do OK').toBe(1);
    expect(await page.evaluate(() => ['sc_cli', 'sc_fin_metas', 'sc_fin_migracao', 'sc_fin_backup_fase0', 'sc_fin_revisar'].map(k => localStorage.getItem(k))))
        .toEqual([JSON.stringify([{ id: 1, nome: 'Velho' }]), JSON.stringify({ '2026-10': 9000 }), '1', JSON.stringify({ x: 1 }), JSON.stringify([{ a: 1 }])]);
});

test('importar sem espaco para os dados: a marca da Fase 0 e a copia continuam', async ({ page }) => {
    await entrar(page, BASE, { sc_fin_backup_fase0: { x: 1 }, sc_fin_revisar: [{ a: 1 }] });
    await page.evaluate(() => localStorage.setItem('sc_fin_migracao', '1'));
    await falharChave(page, 'sc_cp');
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }),
        JSON.stringify({ clientes: [], catalogo: [], pedidos: [], contas_pagar: [], fin_fase0: true }));
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('A importação não foi concluída. ' + MSG);
    expect(await page.evaluate(() => window.__marca), 'nao recarregou').toBe(1);
    expect(await page.evaluate(() => [localStorage.getItem('sc_fin_migracao'), localStorage.getItem('sc_fin_backup_fase0'), localStorage.getItem('sc_fin_revisar')]))
        .toEqual(['1', JSON.stringify({ x: 1 }), JSON.stringify([{ a: 1 }])]);
});

test('importar quase sem espaco: tira so a copia da Fase 0 e grava', async ({ page }) => {
    await entrar(page, BASE, { sc_fin_backup_fase0: { x: 1 } });
    await page.evaluate(() => localStorage.setItem('sc_fin_migracao', '1'));
    // sc_cp so cabe sem a copia da Fase 0
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            if (k === 'sc_cp' && this.getItem('sc_fin_backup_fase0') !== null) throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
    });
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }),
        JSON.stringify({ clientes: [{ id: 7, nome: 'Bia' }], catalogo: [], pedidos: [], contas_pagar: [], fin_fase0: true }));
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    expect(await page.evaluate(() => [localStorage.getItem('sc_fin_migracao'), localStorage.getItem('sc_fin_backup_fase0'), JSON.parse(localStorage.getItem('sc_cli'))[0].nome]))
        .toEqual(['1', null, 'Bia']);
});

test('salvarERecarregar sem espaco: uma baixa avisa uma vez, so recarrega depois do OK e nao solta erro', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await entrar(page, BASE, {
        sc_contas_fin: [{ id: 11, nome: 'Banco', tipo: 'banco', saldo_inicial: 0, data_saldo_inicial: '2026-11-01', ativo: true }],
        sc_meios_pag: [{ id: 22, nome: 'PIX', tipo: 'pix', conta_id: 11 }],
        sc_cr: [{ id: 601, cliente_nome: 'Ana', descricao: 'Avulsa', valor: 500, data_vencimento: '2099-12-10', data_pagamento: null, status: 'Pendente' }]
    });
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            if (k === 'sc_cr' && window.__cheio) throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
    });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    await page.evaluate(() => { window.__marca = 1; window.__cheio = true; });
    let alertas = 0;
    await page.exposeFunction('__contarAlerta', () => { alertas++; });
    await page.evaluate(() => { const o = window.showAlert; window.showAlert = (...a) => { window.__contarAlerta(); return o(...a); }; });
    await acaoLanc(page, 'receber', 'Dar baixa');
    const modal = page.locator('#baixa-modal');
    await expect(modal).toBeVisible();
    await modal.locator('.baixa-linha').first().locator('.baixa-meio').selectOption({ label: 'PIX' });
    await modal.locator('#baixa-ok').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__marca), 'nao recarregou antes do OK').toBe(1);
    expect(alertas).toBe(1);
    // R11: depois do aviso a tela recarrega os dados salvos.
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    expect(erros).toEqual([]);
});

test('caminho do importador sem espaco: devolve o erro e o desfazer nao abre um segundo aviso', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            if (k === 'sc_cat' && window.__cheio) throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
    });
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#sc-modal-overlay')).toBeHidden();
    const r = await page.evaluate(() => {
        window.__cheio = true;
        let erro = null;
        try { salvarERecarregar('x', { relancarErro: true }); } catch (e) { erro = e.name; }
        return [erro, syncDB({ silencioso: true })];
    });
    expect(r).toEqual(['QuotaExceededError', false]);
    await page.waitForTimeout(300);
    await expect(page.locator('#sc-modal-overlay')).toBeHidden();
});

test('_migrarFinanceiroPedidos nao repete id de conta a receber ja usado', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/index.html');
    const ids = await page.evaluate(() => {
        Date.now = () => 1700000000000;
        db.contas_receber = [{ id: 1700000000000, pedido_id: 1, valor: 10, status: 'Pendente' }];
        db.pedidos = [{ id: 5, clienteNome: 'A', status: 'Medição', valor: 1000, ambientes: [] }];
        _migrarFinanceiroPedidos();
        return db.contas_receber.map(c => c.id);
    });
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
});

test('baixar copia e corrigir: espera 1500 ms e oferece Recarregar agora; copia parcial avisa', async ({ page }) => {
    await entrar(page, BASE, {
        sc_cli: [{ id: 1, nome: 'Ana' }], sc_cp: [], sc_cr: [],
        sc_ped: [{ id: 26900, clienteNome: 'Ana', status: 'Orçamento', valor: 1000, valor_recebido: 300, ambientes: [] }]
    });
    await page.evaluate(() => localStorage.removeItem('sc_fin_migracao'));
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
            if (k === 'sc_fin_backup_fase0') throw new DOMException('cheio', 'QuotaExceededError');
            return orig.call(this, k, v);
        };
    });
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => { window.__marca = 1; });
    const btn = page.locator('#fin-backup button', { hasText: 'Baixar cópia e corrigir dados' });
    await Promise.all([page.waitForEvent('download'), btn.click()]);
    await expect(page.locator('#sc-aviso-recarregar')).toContainText('Recarregar agora');
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__marca), 'ainda nao recarregou').toBe(1);
    await page.locator('#sc-aviso-recarregar button').click();
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
});

test('copia guardada diz que e parcial e nao serve para Importar', async ({ page }) => {
    await entrar(page, BASE, { sc_fin_backup_fase0: { criado_em: 1 } });
    await page.goto(BASE + '/financeiro.html');
    const aviso = page.locator('#fin-backup');
    await expect(aviso).toContainText('Esta cópia é parcial: serve para consulta, não para Importar.');
    await Promise.all([page.waitForEvent('download'), aviso.locator('button', { hasText: /^Baixar cópia$/ }).click()]);
    await expect(page.locator('.sc-toast').last()).toContainText('Esta cópia é parcial: serve para consulta, não para Importar.');
});
