// Rotas do dia e "📍 Ir para endereço".
//   - Botao "📍 Ir" nos campos de endereco, nos cards e nos detalhes da agenda:
//     abre o Google Maps com o caminho ate o endereco.
//   - Aba "🗺️ Rotas do dia" (PCP): visitas do tecnico no dia, ordem sugerida pelo
//     OpenStreetMap (aqui com a rede simulada), ajuste a mao, chegada prevista,
//     aviso de horario gravado na observacao, link do Maps e envio pelo WhatsApp.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}
const DIA = dia(1);
const DIA_BR = DIA.split('-').reverse().join('/');

const GEO = {
    'rua empresa, 1': [-25.40, -49.20], 'rua a, 1': [-25.41, -49.21],
    'rua b, 2': [-25.42, -49.22], 'rua c, 3': [-25.43, -49.23],
};

const MEDS = () => [
    { id: 1, clienteId: 1, clienteNome: 'Maria Silva', clienteTel: '(41) 9999-0000', endereco: 'Rua A, 1', data: DIA, hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1, obs: 'Portão azul' },
    { id: 2, clienteId: 2, clienteNome: 'Ana Costa', clienteTel: '', endereco: 'Rua C, 3', data: DIA, hora: '', duracao: 60, status: 'Agendado', usuario_id: 1, obs: '' },
];
const PEDS = () => [{ id: 26300, clienteId: 3, clienteNome: 'Pedro Souza', status: 'Pronto p/ Instalação', inst_agendado: true,
    data_entrega: DIA, inst_hora: '09:50', inst_duracao: 120, inst_endereco: 'Rua B, 2', usuario_instalacao_id: 1, valor: 900, amb: 'Sala' }];

// Rede simulada: Nominatim pelos enderecos acima; route com trechos de 3 km / 10 min;
// trip devolve a ordem guardada em window.__trip (posicao de cada ponto).
async function simularRede(page, { falhar } = {}) {
    await page.route('**/nominatim.openstreetmap.org/**', route => {
        if (falhar) return route.abort();
        const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || '').toLowerCase();
        const g = GEO[q];
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(g ? [{ lat: String(g[0]), lon: String(g[1]) }] : []) });
    });
    await page.route('**/router.project-osrm.org/route/**', route => {
        const n = new URL(route.request().url()).pathname.split('/').pop().split(';').length;
        const legs = Array.from({ length: n - 1 }, () => ({ distance: 3000, duration: 600 }));
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ legs }] }) });
    });
    // table: tempo = distancia entre os pontos na "reta" das longitudes
    await page.route('**/router.project-osrm.org/table/**', route => {
        const pts = new URL(route.request().url()).pathname.split('/').pop().split(';').map(c => +c.split(',')[0]);
        const durations = pts.map(a => pts.map(b => Math.round(Math.abs(a - b) * 10000)));
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', durations }) });
    });
    await page.route('**/router.project-osrm.org/trip/**', async route => {
        const pos = await page.evaluate(() => window.__trip);
        route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', waypoints: pos.map(p => ({ waypoint_index: p })), trips: [{ legs: [] }] }) });
    });
    await page.context().route('**/www.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>maps</p>' }));
}

async function abrir(page, opts = {}) {
    await page.addInitScript(() => {
        window.__abertos = [];
        window.open = (u) => { window.__abertos.push(String(u)); return null; };
    });
    await simularRede(page, opts);
    await entrar(page, BASE, {
        sc_empresa: { nome: 'Cortinas Teste', endereco: 'Rua Empresa, 1' },
        sc_med: MEDS(), sc_ped: PEDS(), sc_cli: [{ id: 3, nome: 'Pedro Souza', tel: '(41) 98888-1111' }],
        ...(opts.dados || {}),
    });
    await page.goto(BASE + '/pcp.html?view=' + (opts.view || 'rotas'));
}

const itens = page => page.locator('#rota-lista .rota-item');
const nomes = page => itens(page).locator('.rota-cli').allTextContents();
async function abrirDia(page) {
    await page.fill('#rota-data', DIA);
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-total')).toBeVisible({ timeout: 15000 });
}
const lerMeds = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_med')));
const lerPeds = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')));

test('lista as visitas do tecnico no dia, por horario, com chegada, km e aviso de atraso', async ({ page }) => {
    await abrir(page);
    await abrirDia(page);
    await expect(page.locator('#rota-prof option')).toHaveText(['Teste (3)']);
    expect(await nomes(page)).toEqual([
        expect.stringContaining('Maria Silva'), expect.stringContaining('Pedro Souza'), expect.stringContaining('Ana Costa')]);
    await expect(page.locator('.rota-saida')).toContainText('Rua Empresa, 1');
    // saida 08:40 (08:50 menos 10 de folga); Maria chega 08:50 (agendado 09:00); Pedro chega 10:10 (agendado 09:50); Ana 12:20
    await expect(itens(page).nth(0)).toContainText('Chega 08:50');
    await expect(itens(page).nth(1)).toContainText('Chega 10:10');
    await expect(itens(page).nth(1).locator('.rota-selo-atraso')).toHaveText('Atraso de 20 minutos');
    await expect(itens(page).nth(0).locator('.rota-selo')).toHaveCount(0);
    await expect(itens(page).nth(2)).toContainText('Sem horário');
    await expect(itens(page).nth(2)).toContainText('Chega 12:20');
    await expect(itens(page).nth(0).locator('.rota-km')).toHaveText('3 km');
    await expect(page.locator('#rota-total')).toContainText('Total: 12 km · 40 min de trajeto (com a volta)');
    await expect(page.locator('#rota-saida-hora')).toHaveText('🚗 Sair às 08:40 para chegar às 08:50 em Maria Silva');
});

test('Sugerir ordem escolhe a ordem que menos atrasa (tempo do OpenStreetMap); endereco nao encontrado vai para o fim', async ({ page }) => {
    await abrir(page, { dados: { sc_med: [MEDS()[0], { ...MEDS()[1], endereco: 'Rua Inexistente, 99' }] } });
    await abrirDia(page);
    await expect(itens(page).nth(2).locator('.rota-aviso')).toContainText('Endereço não encontrado');
    await expect(page.locator('#rota-status')).toContainText('1 visita ficou sem localização');
    // Pedro antes de Maria faria a Maria chegar 3 horas atrasada: a ordem por horario e' a que menos atrasa
    await page.click('#rota-btn-sugerir');
    await expect.poll(() => nomes(page)).toEqual([
        expect.stringContaining('Maria Silva'), expect.stringContaining('Pedro Souza'), expect.stringContaining('Ana Costa')]);
    await expect(itens(page).nth(2).locator('.rota-aviso')).toBeVisible();
});

test('salvar grava o aviso na observacao e refazer substitui ou tira a linha', async ({ page }) => {
    await abrir(page);
    await abrirDia(page);
    await page.locator('#rota-corpo button:has-text("Salvar rota")').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('1 visita tem horário que não bate');
    await page.click('#sc-modal-ok');
    let p = (await lerPeds(page))[0];
    expect(p.inst_obs).toBe(`Rota de ${DIA_BR}: chegada prevista 10:10 (agendado 09:50)`);
    expect((await lerMeds(page))[0].obs).toBe('Portão azul');
    // Pedro primeiro: ele chega no horario e a Maria passa a atrasar
    await itens(page).nth(1).locator('.rota-subir').click();
    await expect(itens(page).nth(0)).toContainText('Pedro Souza');
    await expect(itens(page).nth(1)).toContainText('Chega 12:00');
    await page.locator('#rota-corpo button:has-text("Salvar rota")').click();
    await page.click('#sc-modal-ok');
    p = (await lerPeds(page))[0];
    expect(p.inst_obs).toBe('');
    expect((await lerMeds(page))[0].obs).toBe(`Portão azul\nRota de ${DIA_BR}: chegada prevista 12:00 (agendado 09:00)`);
    const rotas = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_rotas')));
    expect(rotas).toHaveLength(1);
    expect(rotas[0].ordem.map(o => o.tipo + ':' + o.id)).toEqual(['inst:26300', 'med:1', 'med:2']);
    // a ordem salva volta ao abrir de novo
    await page.reload();
    await abrirDia(page);
    await expect(itens(page).nth(0)).toContainText('Pedro Souza');
});

test('Abrir no Maps: um link com saida e volta na empresa e as paradas na ordem', async ({ page }) => {
    await abrir(page);
    await abrirDia(page);
    await page.locator('#rota-corpo button:has-text("Abrir no Maps")').click();
    const abertos = await page.evaluate(() => window.__abertos);
    expect(abertos).toHaveLength(1);
    const u = decodeURIComponent(abertos[0]);
    expect(u).toContain('origin=Rua Empresa, 1');
    expect(u).toContain('waypoints=Rua A, 1|Rua B, 2|Rua C, 3');
    expect(u).toContain('destination=Rua Empresa, 1');
});

test('Abrir no Maps com mais de 3 paradas divide em partes', async ({ page }) => {
    const extra = [3, 4].map(i => ({ ...MEDS()[1], id: 10 + i, clienteNome: 'Extra ' + i, endereco: 'Rua C, 3' }));
    await abrir(page, { dados: { sc_med: MEDS().concat(extra) } });
    await abrirDia(page);
    await page.locator('#rota-corpo button:has-text("Abrir no Maps")').click();
    await expect(page.locator('#rota-partes a')).toHaveText(['🗺️ Parte 1', '🗺️ Parte 2']);
});

test('Enviar ao tecnico abre o WhatsApp com a lista e o link, e salva a rota', async ({ page }) => {
    await abrir(page);
    await abrirDia(page);
    await page.locator('#rota-corpo button:has-text("Enviar ao técnico")').click();
    await expect.poll(() => page.evaluate(() => window.__abertos.length)).toBe(1);
    const u = await page.evaluate(() => window.__abertos[0]);
    expect(u.startsWith('https://wa.me/?text=')).toBe(true);
    const t = decodeURIComponent(u.slice('https://wa.me/?text='.length));
    expect(t).toContain(`Rota de ${DIA_BR} — Teste`);
    expect(t).toContain('1. 09:00 · Medição · Maria Silva');
    expect(t).toContain('2. 10:10 · Instalação #26300 · Pedro Souza');
    expect(t).toContain('⚠ 20 minutos depois do agendado (09:50)');
    expect(t).toContain('📞 (41) 98888-1111');
    expect(t).toContain('Rota no Google Maps: https://www.google.com/maps/dir/');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_rotas')).length)).toBe(1);
});

test('sem internet: avisa e continua mostrando a lista e os botoes', async ({ page }) => {
    await abrir(page, { falhar: true });
    await page.fill('#rota-data', DIA);
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-status')).toContainText('Não foi possível calcular as distâncias agora');
    await expect(itens(page)).toHaveCount(3);
    await page.locator('#rota-corpo button:has-text("Salvar rota")').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('os horários não foram conferidos');
});

test('dia sem visitas mostra o aviso', async ({ page }) => {
    await abrir(page);
    await page.fill('#rota-data', dia(30));
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-corpo')).toContainText('Nenhuma medição ou instalação agendada');
});

test('endereco nao encontrado no meio nao esconde a chegada das visitas seguintes', async ({ page }) => {
    await abrir(page, { dados: { sc_med: [{ ...MEDS()[0], endereco: 'Rua Inexistente, 99' }, MEDS()[1]] } });
    await abrirDia(page);
    // Maria (09:00, nao achada) | Pedro 09:50 | Ana sem horario
    await expect(itens(page).nth(0).locator('.rota-aviso')).toBeVisible();
    await expect(itens(page).nth(0)).not.toContainText('Chega');
    await expect(itens(page).nth(1)).toContainText('Chega');
    await expect(itens(page).nth(2)).toContainText('Chega');
    await page.locator('#rota-corpo button:has-text("Salvar rota")').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('1 visita sem localização não teve o horário conferido');
});

test('sem endereco da empresa: sugerir sai da visita mais cedo e faz o caminho aberto mais curto', async ({ page }) => {
    // longitudes: Maria -49.21 (09:00), Ana -49.23, Pedro -49.22 -> da Maria, o caminho Maria, Pedro, Ana
    await abrir(page, { dados: { sc_empresa: { nome: 'Cortinas Teste' } } });
    await abrirDia(page);
    await expect(page.locator('.rota-saida')).toContainText('Sem endereço da empresa');
    await itens(page).nth(2).locator('.rota-subir').click();   // Maria, Ana, Pedro
    await expect(itens(page).nth(1)).toContainText('Ana Costa');
    await page.click('#rota-btn-sugerir');
    await expect.poll(() => nomes(page)).toEqual([
        expect.stringContaining('Maria Silva'), expect.stringContaining('Pedro Souza'), expect.stringContaining('Ana Costa')]);
    await expect(page.locator('#rota-total')).not.toContainText('com a volta');
});

test('📍 Ir nos cards e nos detalhes da agenda abre o Maps sem abrir o card', async ({ page }) => {
    await abrir(page, { view: 'medicoes' });
    const card = page.locator('#med-pend-lista .agd-item', { hasText: 'Maria Silva' });
    const ir = card.locator('a.agd-ir');
    expect(decodeURIComponent(await ir.getAttribute('href'))).toContain('destination=Rua A, 1');
    await ir.click();
    await page.waitForTimeout(300);
    await expect(page.locator('.agd-modal')).toHaveCount(0);
    await card.click();
    await expect(page.locator('.agd-modal a.agd-ir')).toHaveAttribute('href', /destination=Rua%20A%2C%201/);
    await page.click('.agd-modal-x');
    await page.click('#tab-btn-agenda');
    await expect(page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedro Souza' }).locator('a.agd-ir')).toBeVisible();
});

test('📍 Ir para endereço ao lado do campo usa o que foi digitado', async ({ page }) => {
    await abrir(page, { view: 'medicoes' });
    const btn = page.locator('#med-ir');
    await btn.click();
    await expect(page.locator('#sc-modal-msg')).toContainText('Digite o endereço primeiro');
    await page.click('#sc-modal-ok');
    await page.fill('#med-rua', 'Rua das Flores, 10');
    await btn.click();
    expect(decodeURIComponent((await page.evaluate(() => window.__abertos))[0])).toContain('destination=Rua das Flores, 10');
    await page.goto(BASE + '/clientes.html');
    await expect(page.locator('#cli-rua ~ .btn-ir-end')).toHaveCount(1);
});
