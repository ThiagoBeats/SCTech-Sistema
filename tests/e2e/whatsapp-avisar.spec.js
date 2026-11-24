// Rotas do dia: lista "Avisar clientes" (link wa.me com mensagem pronta), estado
// "Avisado" que vale so para o mesmo agendamento, e o icone do WhatsApp nos botoes.
// Relogio fixo em 23/11/2026 12:00; window.open interceptado (nunca abre o WhatsApp real).
const { test, expect } = require('@playwright/test');
const { entrar, abrirLancamentos, abrirMenuAcoes, linhasLanc } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const DIA = '2026-11-23';

const MEDS = (tel = '(41) 99999-0000') => [
    { id: 1, clienteId: 1, clienteNome: 'Maria Silva', clienteTel: tel, endereco: 'Rua A, 1', data: DIA, hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1, obs: '' },
];
const PEDS = () => [{ id: 26300, clienteId: 3, clienteNome: 'Pedro Souza', status: 'Pronto p/ Instalação', inst_agendado: true,
    data_entrega: DIA, inst_hora: '10:30', inst_duracao: 60, inst_endereco: 'Rua B, 2', usuario_instalacao_id: 1, valor: 900, amb: 'Sala' }];
const CLIS = () => [{ id: 3, nome: 'Pedro Souza', tel: '(41) 98888-1111' }];

async function abrir(page, { dados = {}, janela = true } = {}) {
    await page.clock.setFixedTime(new Date(2026, 10, 23, 12, 0, 0));
    await page.addInitScript(j => {
        window.__abertos = [];
        try { localStorage.setItem('sc_lembrete_inst_1', '2026-11-23'); } catch (e) {}
        window.open = u => { window.__abertos.push(String(u)); return j ? {} : null; };
    }, janela);
    await entrar(page, BASE, { sc_empresa: { nome_fantasia: 'Cortinas Teste' }, sc_med: MEDS(), sc_ped: PEDS(), sc_cli: CLIS(), ...dados });
    await abrirRotas(page);
}
async function abrirRotas(page) {
    await page.goto(BASE + '/pcp.html?view=rotas');
    await page.fill('#rota-data', DIA);
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-avisar')).toBeVisible();
}
const linhas = page => page.locator('#rota-avisar .rota-aviso-item');
const abertos = page => page.evaluate(() => window.__abertos);
const textoDe = u => decodeURIComponent(u.split('?text=')[1]);

test('lista na ordem da rota, botao com icone e title, abre wa.me com a mensagem padrao', async ({ page }) => {
    await abrir(page);
    await expect(linhas(page)).toHaveCount(2);
    await expect(linhas(page).nth(0)).toContainText('Maria Silva');
    await expect(linhas(page).nth(0)).toContainText('Medição');
    await expect(linhas(page).nth(1)).toContainText('Pedro Souza');
    await expect(linhas(page).nth(1)).toContainText('Instalação #26300');
    const btn = linhas(page).nth(0).locator('button');
    await expect(btn).toHaveAttribute('title', 'Enviar por WhatsApp');
    await expect(btn).toHaveAttribute('aria-label', 'Enviar por WhatsApp para Maria Silva');
    await expect(btn.locator('svg')).toHaveCount(1);
    await btn.click();
    const u = (await abertos(page))[0];
    expect(u.startsWith('https://wa.me/5541999990000?text=')).toBe(true);
    expect(textoDe(u)).toBe('Olá, Maria Silva! Aqui é da Cortinas Teste. Passando para confirmar a sua medição hoje, às 09:00. Qualquer dúvida, é só responder esta mensagem.');
    await expect(linhas(page).nth(0)).toContainText('✓ Avisado às 12:00 por Teste');
    await expect(linhas(page).nth(0).locator('button', { hasText: 'Avisar' })).toHaveCount(0);
    // a instalacao continua com o botao
    await expect(linhas(page).nth(1).locator('button[title="Enviar por WhatsApp"]')).toHaveCount(1);
});

test('avisado persiste ao recarregar; desfazer volta o botao', async ({ page }) => {
    await abrir(page);
    await linhas(page).nth(0).locator('button').click();
    await expect(linhas(page).nth(0)).toContainText('✓ Avisado');
    await abrirRotas(page);
    await expect(linhas(page).nth(0)).toContainText('✓ Avisado');
    await linhas(page).nth(0).locator('.rota-desfazer').click();
    await expect(linhas(page).nth(0).locator('button[title="Enviar por WhatsApp"]')).toHaveCount(1);
    await expect(linhas(page).nth(0)).not.toContainText('Avisado');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_med'))[0].aviso_cliente)).toBeUndefined();
});

test('reagendar a hora volta o botao', async ({ page }) => {
    await abrir(page);
    await linhas(page).nth(0).locator('button').click();
    await expect(linhas(page).nth(0)).toContainText('✓ Avisado');
    await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('sc_med'));
        m[0].hora = '11:00';
        localStorage.setItem('sc_med', JSON.stringify(m));
    });
    await abrirRotas(page);
    await expect(linhas(page).nth(0).locator('button[title="Enviar por WhatsApp"]')).toHaveCount(1);
    await expect(linhas(page).nth(0)).not.toContainText('Avisado');
});

test('cliente sem telefone: botao desabilitado "Sem telefone"', async ({ page }) => {
    await abrir(page, { dados: { sc_med: MEDS('') } });
    const btn = linhas(page).nth(0).locator('button');
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveText('Sem telefone');
    await expect(btn).toHaveAttribute('title', 'Cliente sem telefone no cadastro');
});

test('janela bloqueada: avisa e nao marca como avisado', async ({ page }) => {
    await abrir(page, { janela: false });
    await linhas(page).nth(0).locator('button').click();
    await expect(page.getByText('O navegador bloqueou a janela do WhatsApp. Libere os pop-ups e tente de novo.')).toBeVisible();
    await expect(linhas(page).nth(0)).not.toContainText('Avisado');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_med'))[0].aviso_cliente)).toBeUndefined();
});

test('mensagem editada em Configurar Empresa e usada', async ({ page }) => {
    await abrir(page, { dados: { sc_empresa: { nome_fantasia: 'Cortinas Teste', mensagem_aviso_visita: 'Oi {cliente}, {servico} {dia} {horario}.' } } });
    await linhas(page).nth(1).locator('button').click();
    expect(textoDe((await abertos(page))[0])).toBe('Oi Pedro Souza, instalação hoje às 10:30.');
});

test('visita atrasada na rota calculada: mensagem com a chegada prevista', async ({ page }) => {
    const LON = { '-49.2': 'E', '-49.21': 'A', '-49.22': 'B' };
    const MIN = { AE: 20, BE: 5, AB: 5 };
    const tempo = (x, y) => x === y ? 0 : MIN[[x, y].sort().join('')];
    const GEO = { 'rua empresa, 1': [-25.40, -49.20], 'rua a, 1': [-25.41, -49.21], 'rua b, 2': [-25.42, -49.22] };
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
    const meds = [
        { id: 1, clienteId: 1, clienteNome: 'Maria Silva', clienteTel: '(41) 99999-0000', endereco: 'Rua A, 1', data: DIA, hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1, obs: '' },
        { id: 2, clienteId: 2, clienteNome: 'Pedro Souza', clienteTel: '(41) 98888-1111', endereco: 'Rua B, 2', data: DIA, hora: '10:10', duracao: 60, status: 'Agendado', usuario_id: 1, obs: '' },
    ];
    await abrir(page, { dados: { sc_empresa: { nome_fantasia: 'Cortinas Teste', endereco: 'Rua Empresa, 1' }, sc_med: meds, sc_ped: [], sc_cli: [] } });
    await expect(page.locator('#rota-total')).toBeVisible({ timeout: 15000 });
    // sem atraso: horario agendado
    await linhas(page).nth(0).locator('button').click();
    expect(textoDe((await abertos(page))[0])).toContain('às 09:00');
    // Pedro primeiro: Maria chega 11:15 (atraso)
    await page.locator('#rota-lista .rota-item').nth(1).locator('.rota-subir').click();
    await expect(page.locator('.rota-selo-atraso')).toHaveText('Atraso de 2 horas e 15 minutos');
    await linhas(page).filter({ hasText: 'Maria Silva' }).locator('.rota-desfazer').click();
    await linhas(page).filter({ hasText: 'Maria Silva' }).locator('button[title="Enviar por WhatsApp"]').click();
    const t = textoDe((await abertos(page))[1]);
    expect(t).toContain('com chegada prevista por volta de 11:15');
    expect(t).not.toContain('às 09:00');
});

test('Cobrar e Enviar ao tecnico tem o icone e o title', async ({ page }) => {
    await abrir(page);
    const env = page.locator('#rota-corpo button', { hasText: 'Enviar ao técnico' });
    await expect(env).toHaveAttribute('title', 'Enviar por WhatsApp');
    await expect(env.locator('svg')).toHaveCount(1);
    await entrar(page, BASE, {
        sc_empresa: { nome_fantasia: 'Cortinas Teste' },
        sc_cli: [{ id: 3, nome: 'Pedro Souza', tel: '(41) 98888-1111' }],
        sc_ped: [{ id: 26300, clienteId: 3, clienteNome: 'Pedro Souza', status: 'Pronto', valor: 900 }],
        sc_cr: [{ id: 1, cliente_nome: 'Pedro Souza', pedido_id: 26300, descricao: 'Parcela', valor: 300, data_vencimento: '2026-11-01', status: 'Pendente' }],
    });
    await page.goto(BASE + '/financeiro.html');
    await abrirLancamentos(page, 'receber');
    const menu = await abrirMenuAcoes(page, linhasLanc(page, 'receber', 'Cobrar no WhatsApp').first());
    const cob = menu.locator('.menu-acoes-item', { hasText: 'Cobrar no WhatsApp' });
    await expect(cob).toHaveAttribute('title', 'Enviar por WhatsApp');
    await expect(cob.locator('svg')).toHaveCount(1);
});

test('medicao sem telefone no registro usa o telefone do cadastro do cliente', async ({ page }) => {
    await abrir(page, { dados: { sc_med: MEDS(''), sc_cli: [{ id: 1, nome: 'Maria Silva', tel: '(41) 97777-0000' }, ...CLIS()] } });
    const btn = linhas(page).nth(0).locator('button');
    await expect(btn).toBeEnabled();
    await expect(btn).not.toHaveText('Sem telefone');
    await btn.click();
    expect((await abertos(page))[0].startsWith('https://wa.me/5541977770000?text=')).toBe(true);
});

test('avisado de outro usuario mostra o nome dele; de outro dia mostra a data', async ({ page }) => {
    const meds = MEDS();
    meds[0].aviso_cliente = { data: DIA, hora: '09:00', em: '2026-11-23T10:05:00', por: 2, porNome: 'Ana' };
    const peds = PEDS();
    peds[0].inst_aviso_cliente = { data: DIA, hora: '10:30', em: '2026-11-22T18:00:00', por: 2, porNome: 'Ana' };
    await abrir(page, { dados: { sc_med: meds, sc_ped: peds } });
    await expect(linhas(page).nth(0)).toContainText('✓ Avisado às 10:05 por Ana');
    await expect(linhas(page).nth(0)).not.toContainText(' em ');
    await expect(linhas(page).nth(1)).toContainText('✓ Avisado em 22/11 às 18:00 por Ana');
});

test('recusa do agendamento apaga o aviso ao cliente', async ({ page }) => {
    const usuarios = [
        { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
        { id: 2, nome: 'Maria', email: 'maria@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    ];
    const meds = MEDS();
    meds[0].usuario_id = 2;
    meds[0].aceite = { status: 'pendente', por: 1, em: Date.now() };
    meds[0].aviso_cliente = { data: DIA, hora: '09:00', em: '2026-11-23T10:05:00', por: 1, porNome: 'Teste' };
    await page.clock.setFixedTime(new Date(2026, 10, 23, 8, 0, 0));
    await entrar(page, BASE, { sc_usr: usuarios, sc_empresa: { nome_fantasia: 'Cortinas Teste' }, sc_med: meds, sc_cli: CLIS() });
    await page.evaluate(() => {
        sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'maria@sctech.local' }));
    });
    await page.goto(BASE + '/index.html');
    await page.click('#sino-btn');
    await page.locator('#sino-painel .sino-item', { hasText: 'Você recebeu a medição' }).getByRole('button', { name: 'Recusar' }).click();
    await page.fill('#aceite-motivo', 'Estou de folga');
    await page.click('#aceite-confirmar');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sc_med'))[0].status)).toBe('A reagendar');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_med'))[0].aviso_cliente)).toBeUndefined();
});
