// Rotas do dia e "📍 Ir" usam o endereco em partes (CEP, rua, numero, bairro, cidade, UF).
// Nominatim e OSRM sao sempre simulados. Cada consulta ao Nominatim espera ~1,1 s na fila.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const d = new Date(); d.setDate(d.getDate() + 1);
const DIA = d.toLocaleDateString('sv-SE');

const COMPLETO = 'Rua XV de Novembro, 100, Centro, Curitiba - PR, 80020-310';
const SIMPLES = 'Rua XV de Novembro, 100, Curitiba - PR';
const MED_NOVA = { id: 1, clienteId: 1, clienteNome: 'Maria Silva', endereco: 'Rua XV de Novembro, 100, Centro', cep: '80020310', rua: 'Rua XV de Novembro',
    numero: '100', complemento: '', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR', data: DIA, hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1 };
const MED_ANTIGA = { id: 2, clienteId: 2, clienteNome: 'Ana Costa', endereco: 'Rua Velha, 7', cidade: 'Curitiba', data: DIA, hora: '10:30', duracao: 60, status: 'Agendado', usuario_id: 1 };

async function abrir(page, meds, achaNaSegunda) {
    await page.addInitScript(() => { window.__abertos = []; window.open = u => { window.__abertos.push(String(u)); return null; }; });
    const consultas = [];
    await page.route('**/nominatim.openstreetmap.org/**', route => {
        const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || '');
        consultas.push(q);
        const acha = q === SIMPLES || (!achaNaSegunda && q === COMPLETO) || q === 'Rua Velha, 7, Curitiba';
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(acha ? [{ lat: '-25.43', lon: '-49.27' }] : []) });
    });
    await page.route('**/router.project-osrm.org/**', route => route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ code: 'Ok', routes: [{ legs: [{ distance: 3000, duration: 600 }, { distance: 3000, duration: 600 }, { distance: 3000, duration: 600 }] }] }) }));
    await entrar(page, BASE, { sc_med: meds, sc_cli: [{ id: 1, nome: 'Maria Silva' }, { id: 2, nome: 'Ana Costa' }] });
    await page.goto(BASE + '/pcp.html?view=rotas');
    await page.fill('#rota-data', DIA);
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-total')).toBeVisible({ timeout: 20000 });
    return consultas;
}

test('rota: medicao com partes mostra e procura o endereco completo; 2a consulta quando a 1a volta vazia', async ({ page }) => {
    test.setTimeout(40000);
    const consultas = await abrir(page, [MED_NOVA], true);
    await expect(page.locator('#rota-lista .rota-end').first()).toHaveText(COMPLETO);
    expect(consultas.filter(q => q.includes('XV'))).toEqual([COMPLETO, SIMPLES]);
    const href = await page.locator('#rota-lista .agd-ir').first().getAttribute('href');
    expect(decodeURIComponent(href)).toContain('destination=' + COMPLETO + '&');
    const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_geo')));
    expect(cache['rua xv de novembro, 100, centro, curitiba - pr, 80020-310']).toMatchObject({ lat: -25.43 });
    // de novo: nada de consulta nova (cache pelo texto completo)
    const antes = consultas.length;
    await page.reload();
    await page.fill('#rota-data', DIA);
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-total')).toBeVisible({ timeout: 20000 });
    expect(consultas.length).toBe(antes);
});

test('rota: a 1a consulta achando, nao tenta as outras; registro antigo faz uma consulta so', async ({ page }) => {
    test.setTimeout(40000);
    const consultas = await abrir(page, [MED_NOVA, MED_ANTIGA], false);
    expect(consultas.filter(q => q.includes('XV'))).toEqual([COMPLETO]);
    expect(consultas.filter(q => q.includes('Velha'))).toEqual(['Rua Velha, 7, Curitiba']);
    await expect(page.locator('#rota-lista .rota-end').nth(1)).toHaveText('Rua Velha, 7, Curitiba');
});

test('agenda: 📍 Ir do card da medicao com partes leva o endereco completo', async ({ page }) => {
    await page.addInitScript(() => { window.__abertos = []; window.open = u => { window.__abertos.push(String(u)); return null; }; });
    await entrar(page, BASE, { sc_med: [MED_NOVA, MED_ANTIGA], sc_cli: [{ id: 1, nome: 'Maria Silva' }] });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    const links = page.locator('#med-pend-lista .agd-ir');
    await expect(links).toHaveCount(2);
    const hrefs = (await links.evaluateAll(a => a.map(x => x.getAttribute('href')))).map(decodeURIComponent);
    expect(hrefs.some(h => h.includes('destination=' + COMPLETO + '&'))).toBe(true);
    expect(hrefs.some(h => h.includes('destination=Rua Velha, 7, Curitiba&'))).toBe(true);
});
