// Armazenamento das imagens da galeria (IndexedDB), num modulo unico para a
// troca futura pelo servidor da empresa.
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE || 'http://localhost:8131';

async function carregar(page) {
    await page.goto(BASE + '/login.html');
    await page.addScriptTag({ url: BASE + '/js/galeria-core.js' });
    await page.addScriptTag({ url: BASE + '/js/galeria-imagens.js' });
}

test('salvar, ler, listar e remover', async ({ page }) => {
    await carregar(page);
    const r = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 3; c.height = 2;
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        const id = await GaleriaImagens.salvar(blob);
        const lido = await GaleriaImagens.ler(id);
        const ids1 = await GaleriaImagens.ids();
        const url = await GaleriaImagens.url(id);
        await GaleriaImagens.remover(id);
        return {
            disp: await GaleriaImagens.disponivel(), id, tam: blob.size, lido: lido && lido.size,
            tem: ids1.includes(id), url: typeof url === 'string' && url.startsWith('blob:'),
            depois: (await GaleriaImagens.ids()).includes(id), sumiu: await GaleriaImagens.ler(id),
            inexistente: await GaleriaImagens.ler('nao-existe'), urlInexistente: await GaleriaImagens.url('nao-existe')
        };
    });
    expect(r.disp).toBe(true);
    expect(r.id).toMatch(/^img-/);
    expect(r.lido).toBe(r.tam);
    expect(r.tem).toBe(true);
    expect(r.url).toBe(true);
    expect(r.depois).toBe(false);
    expect(r.sumiu).toBeNull();
    expect(r.inexistente).toBeNull();
    expect(r.urlInexistente).toBeNull();
});

test('reduzirImagem diminui para o lado maior pedido', async ({ page }) => {
    await carregar(page);
    const r = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
        c.getContext('2d').fillRect(0, 0, 10, 10);
        const grande = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
        const menor = await GaleriaImagens.reduzirImagem(grande, 1600);
        const bm = await createImageBitmap(menor);
        const pequeno = await GaleriaImagens.reduzirImagem(await new Promise(res => { const d = document.createElement('canvas'); d.width = 300; d.height = 200; d.toBlob(res, 'image/png'); }), 1600);
        const bp = await createImageBitmap(pequeno);
        return { w: bm.width, h: bm.height, tipo: menor.type, pw: bp.width, ph: bp.height };
    });
    expect(r).toEqual({ w: 1600, h: 1200, tipo: 'image/jpeg', pw: 300, ph: 200 });
});

test('sem IndexedDB: disponivel falso e nada lanca', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
    await carregar(page);
    const r = await page.evaluate(async () => ({
        disp: await GaleriaImagens.disponivel(),
        ids: await GaleriaImagens.ids(),
        ler: await GaleriaImagens.ler('x'),
        salvar: await GaleriaImagens.salvar(new Blob(['a'])).then(() => 'ok', e => 'erro')
    }));
    expect(r).toEqual({ disp: false, ids: [], ler: null, salvar: 'erro' });
});
