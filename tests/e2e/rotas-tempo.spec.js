// Rotas do dia otimizando o TEMPO: Sugerir ordem usa a tabela de tempos do OSRM,
// linha "Sair as ...", selos de atraso/apertado por visita, aviso de servico que
// invade a proxima visita e resumo "N visita(s) nao da(ao) tempo". Rede simulada.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const DIA = '2026-11-24';

// pontos pela longitude; tempos (min) entre eles: empresa-Maria 20, empresa-Pedro 5, Maria-Pedro 5
const LON = { '-49.2': 'E', '-49.21': 'A', '-49.22': 'B' };
const MIN = { AE: 20, BE: 5, AB: 5 };
const tempo = (x, y) => x === y ? 0 : MIN[[x, y].sort().join('')];
const GEO = { 'rua empresa, 1': [-25.40, -49.20], 'rua a, 1': [-25.41, -49.21], 'rua b, 2': [-25.42, -49.22] };

async function simularRede(page) {
    await page.route('**/nominatim.openstreetmap.org/**', route => {
        const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || '').toLowerCase();
        const g = GEO[q];
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(g ? [{ lat: String(g[0]), lon: String(g[1]) }] : []) });
    });
    const pontos = route => new URL(route.request().url()).pathname.split('/').pop().split(';').map(c => LON[c.split(',')[0]]);
    await page.route('**/router.project-osrm.org/route/**', route => {
        const p = pontos(route);
        const legs = p.slice(1).map((x, i) => ({ distance: 3000, duration: tempo(p[i], x) * 60 }));
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ legs }] }) });
    });
    await page.route('**/router.project-osrm.org/table/**', route => {
        const p = pontos(route);
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', durations: p.map(a => p.map(b => tempo(a, b) * 60)) }) });
    });
}

const MEDS = () => [
    { id: 1, clienteId: 1, clienteNome: 'Maria Silva', clienteTel: '', endereco: 'Rua A, 1', data: DIA, hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1, obs: '' },
    { id: 2, clienteId: 2, clienteNome: 'Pedro Souza', clienteTel: '', endereco: 'Rua B, 2', data: DIA, hora: '10:10', duracao: 60, status: 'Agendado', usuario_id: 1, obs: '' },
];

async function abrir(page, empresa) {
    await page.clock.setFixedTime(new Date(2026, 10, 23, 12, 0, 0));
    await simularRede(page);
    await entrar(page, BASE, { sc_empresa: empresa, sc_med: MEDS() });
    await page.goto(BASE + '/pcp.html?view=rotas');
    await page.fill('#rota-data', DIA);
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-total')).toBeVisible({ timeout: 15000 });
}
const itens = page => page.locator('#rota-lista .rota-item');

test('sequencia que nao da tempo: selo de atraso, aviso do servico anterior, resumo e Sugerir ordem corrige', async ({ page }) => {
    await abrir(page, { nome: 'Cortinas Teste', endereco: 'Rua Empresa, 1' });
    // ordem por horario: Maria 08:50 (folga 10), Pedro 10:05 (agendado 10:10: apertado)
    await expect(page.locator('#rota-saida-hora')).toHaveText('🚗 Sair às 08:30 para chegar às 08:50 em Maria Silva');
    await expect(itens(page).nth(1).locator('.rota-selo-apertado')).toHaveText('Apertado: chega 10:05, sobram 5 min');
    await expect(page.locator('#rota-resumo')).toHaveCount(0);
    // o caminho mais curto (Pedro primeiro) faz a Maria atrasar
    await itens(page).nth(1).locator('.rota-subir').click();
    await expect(itens(page).nth(0)).toContainText('Pedro Souza');
    await expect(page.locator('#rota-total')).toBeVisible();
    await expect(itens(page).nth(1).locator('.rota-selo-atraso')).toHaveText('Atraso de 2 horas e 15 minutos');
    await expect(itens(page).nth(1).locator('.rota-aviso')).toHaveText('⚠ O serviço anterior termina 11:10, depois do início desta visita.');
    await expect(page.locator('#rota-resumo')).toContainText('1 visita não dá tempo');
    await expect(page.locator('#rota-saida-hora')).toContainText('Sair às 09:55 para chegar às 10:00 em Pedro Souza');
    // o botao do resumo sugere a ordem sem atraso
    await page.locator('#rota-resumo button:has-text("Sugerir ordem")').click();
    await expect.poll(async () => (await itens(page).nth(0).locator('.rota-cli').textContent())).toContain('Maria Silva');
    await expect(page.locator('#rota-total')).toBeVisible();
    await expect(page.locator('.rota-selo-atraso')).toHaveCount(0);
    await expect(page.locator('#rota-resumo')).toHaveCount(0);
    await expect(page.locator('#rota-saida-hora')).toHaveText('🚗 Sair às 08:30 para chegar às 08:50 em Maria Silva');
});

test('so atraso grava observacao; apertado nao', async ({ page }) => {
    await abrir(page, { nome: 'Cortinas Teste', endereco: 'Rua Empresa, 1' });
    await page.locator('#rota-corpo button:has-text("Salvar rota")').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('Rota salva.');
    await expect(page.locator('#sc-modal-msg')).not.toContainText('horário que não bate');
    await page.click('#sc-modal-ok');
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('sc_med')))).map(m => m.obs)).toEqual(['', '']);
});

test('sem empresa a rota comeca na 1a visita', async ({ page }) => {
    await abrir(page, { nome: 'Cortinas Teste' });
    await expect(page.locator('#rota-saida-hora')).toHaveText('Começa em Maria Silva às 09:00');
    // Maria termina 10:00, Pedro chega 10:05 (agendado 10:10)
    await expect(itens(page).nth(1).locator('.rota-selo-apertado')).toHaveText('Apertado: chega 10:05, sobram 5 min');
});
