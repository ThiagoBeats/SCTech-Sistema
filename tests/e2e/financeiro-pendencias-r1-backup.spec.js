// Pendencias R1, tarefa 1: falta de espaco no navegador, importacao, ids da
// migracao antiga, recarga depois do download e aviso de copia parcial.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

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

test('importar com navegador cheio: limpa as chaves da Fase 0 antes e nao some em silencio', async ({ page }) => {
    await entrar(page, BASE, { sc_fin_backup_fase0: { x: 1 }, sc_fin_revisar: [{ a: 1 }] });
    await falharChave(page, 'sc_empresa');
    await page.goto(BASE + '/index.html');
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }),
        JSON.stringify({ clientes: [], catalogo: [], pedidos: [], empresa: { nome: 'X' } }));
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('A importação não foi concluída. ' + MSG);
    expect(await page.evaluate(() => [localStorage.getItem('sc_fin_backup_fase0'), localStorage.getItem('sc_fin_revisar')])).toEqual([null, null]);
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
