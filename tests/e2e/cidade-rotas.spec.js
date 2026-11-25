// Cidade no cliente, na medicao e na instalacao; Rotas do dia e "Ir" levam a cidade.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}
const DIA = dia(1);

const CLI = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Rua X, 10', cidade: 'Curitiba' }];
const lerLS = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);

test('cliente: a cidade e salva, aparece na tabela e volta ao editar', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/clientes.html');
    await page.fill('#cli-nome', 'Bia Souza');
    await page.fill('#cli-rua', 'Rua das Flores, 5');
    await page.fill('#cli-cidade', 'Maringá');
    await page.click('#cli-btn-salvar');
    await expect(page.locator('#tb-clientes')).toContainText('Rua das Flores, 5 — Maringá');
    expect((await lerLS(page, 'sc_cli'))[0].cidade).toBe('Maringá');
    await page.locator('#tb-clientes .btn-kebab').first().click();
    await page.locator('.menu-acoes-item', { hasText: 'Editar cliente' }).click();
    await expect(page.locator('#cli-cidade')).toHaveValue('Maringá');
});

test('medicao: a cidade vem do cliente, pode mudar e e salva na medicao', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-cliente-id', '1');
    await expect(page.locator('#med-cidade')).toHaveValue('Curitiba');
    await expect(page.locator('#med-rua')).toHaveValue('Rua X, 10');
    await page.fill('#med-cidade', 'Pinhais');
    await page.fill('#med-data', DIA);
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-pend-lista')).toContainText('Rua X, 10, Pinhais');
    expect((await lerLS(page, 'sc_med'))[0].cidade).toBe('Pinhais');
    await expect(page.locator('#med-cidade')).toHaveValue('');
});

test('medicao com cliente novo digitado a mao leva a cidade ao cadastro do cliente', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.click('input[name="med-tipo"][value="novo"]');
    await page.fill('#med-novo-nome', 'Novo Cliente');
    await page.fill('#med-data', DIA);
    await page.fill('#med-rua', 'Rua Y, 3');
    await page.fill('#med-cidade', 'Londrina');
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-pend-lista')).toContainText('Novo Cliente');
    expect((await lerLS(page, 'sc_cli'))[0].cidade).toBe('Londrina');
    expect((await lerLS(page, 'sc_med'))[0].cidade).toBe('Londrina');
});

test('instalacao: a cidade vem do cliente e e salva como inst_cidade; editar muda', async ({ page }) => {
    const ped = { id: 26200, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: false, valor: 900, amb: 'Sala' };
    await entrar(page, BASE, { sc_cli: CLI(), sc_ped: [ped] });
    await page.goto(BASE + '/pcp.html?view=agenda');
    await page.locator('#inst-prontos-lista .agd-pronto', { hasText: '#26200' }).click();
    await expect(page.locator('#inst-cidade')).toHaveValue('Curitiba');
    await page.selectOption('#inst-prof', 'u:1');
    await page.fill('#inst-data', dia(2));
    await page.fill('#inst-hora', '10:00');
    await page.click('#inst-btn-agendar');
    await expect.poll(async () => (await lerLS(page, 'sc_ped'))[0].inst_cidade).toBe('Curitiba');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await expect(page.locator('.agd-modal a.agd-ir')).toHaveAttribute('href', /destination=Rua%20X%2C%2010%2C%20Curitiba/);
    await page.locator('.agd-modal button', { hasText: 'Editar' }).click();
    await expect(page.locator('#agdf-end-cidade')).toHaveValue('Curitiba');
    await page.fill('#agdf-end-cidade', 'Colombo');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerLS(page, 'sc_ped'))[0].inst_cidade).toBe('Colombo');
});

test('Rotas do dia procura o endereco junto com a cidade', async ({ page }) => {
    const qs = [];
    await page.route('**/nominatim.openstreetmap.org/**', route => {
        qs.push(decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || ''));
        route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: '-25.4', lon: '-49.2' }]) });
    });
    await page.route('**/router.project-osrm.org/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ legs: [{ distance: 1000, duration: 300 }] }] }) }));
    const meds = [
        { id: 1, clienteId: 1, clienteNome: 'Ana Paula Lima', clienteTel: '', endereco: 'Rua X, 10', cidade: 'Curitiba', data: DIA, hora: '09:00', duracao: 60, status: 'Agendado', usuario_id: 1 },
        { id: 2, clienteId: 1, clienteNome: 'Outra Pessoa', clienteTel: '', endereco: 'Rua Z, 7 - Centro, curitiba', cidade: 'Curitiba', data: DIA, hora: '11:00', duracao: 60, status: 'Agendado', usuario_id: 1 },
    ];
    await entrar(page, BASE, { sc_cli: CLI(), sc_med: meds, sc_empresa: { nome: 'Cortinas Teste', endereco: 'Rua Empresa, 1' } });
    await page.goto(BASE + '/pcp.html?view=rotas');
    await page.fill('#rota-data', DIA);
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-total')).toBeVisible({ timeout: 15000 });
    expect(qs).toContain('Rua X, 10, Curitiba');
    expect(qs).toContain('Rua Z, 7 - Centro, curitiba');
    expect(qs.filter(q => /curitiba.*curitiba/i.test(q))).toEqual([]);
    await expect(page.locator('#rota-lista .rota-item').first().locator('a.agd-ir'))
        .toHaveAttribute('href', /destination=Rua%20X%2C%2010%2C%20Curitiba/);
});

test('📍 Ir para endereço leva a cidade e o estado dos campos ao lado', async ({ page }) => {
    await page.addInitScript(() => { window.__abertos = []; window.open = u => { window.__abertos.push(String(u)); return null; }; });
    await entrar(page, BASE, {});
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.fill('#med-rua', 'Rua das Flores, 10');
    await page.fill('#med-cidade', 'Curitiba');
    await page.locator('#med-ir').click();
    await page.selectOption('#med-uf', 'PR');
    await page.locator('#med-ir').click();
    const ab = (await page.evaluate(() => window.__abertos)).map(decodeURIComponent);
    expect(ab[0]).toContain('destination=Rua das Flores, 10, Curitiba&');
    expect(ab[1]).toContain('destination=Rua das Flores, 10, Curitiba - PR&');
});

test('backup: exportar e importar mantem a cidade do cliente, da medicao e da instalacao', async ({ page }) => {
    const ped = { id: 26200, clienteId: 1, clienteNome: 'Ana', status: 'Pronto p/ Instalação', inst_agendado: true, data_entrega: DIA, inst_hora: '10:00', inst_endereco: 'Rua X, 10', inst_cidade: 'Colombo', valor: 1, amb: 'S' };
    const med = { id: 1, clienteId: 1, clienteNome: 'Ana', endereco: 'Rua X, 10', cidade: 'Pinhais', data: DIA, status: 'Agendado' };
    await entrar(page, BASE, { sc_cli: CLI(), sc_ped: [ped], sc_med: [med] });
    await page.goto(BASE + '/index.html');
    const json = await page.evaluate(() => JSON.stringify(_dadosExportacao(false)));
    const dados = JSON.parse(json);
    expect(dados.clientes[0].cidade).toBe('Curitiba');
    expect(dados.medicoes[0].cidade).toBe('Pinhais');
    expect(dados.pedidos[0].inst_cidade).toBe('Colombo');
    await page.evaluate(() => { localStorage.setItem('sc_cli', '[]'); localStorage.setItem('sc_med', '[]'); localStorage.setItem('sc_ped', '[]'); });
    await page.evaluate(j => importarDados({ target: { files: [new File([j], 'b.json')], value: '' } }), json);
    await Promise.all([page.waitForEvent('load'), page.locator('#sc-modal-ok').click()]);   // a importacao recarrega a pagina depois da limpeza
    await expect.poll(async () => (await lerLS(page, 'sc_cli'))[0]?.cidade).toBe('Curitiba');
    expect((await lerLS(page, 'sc_med'))[0].cidade).toBe('Pinhais');
    expect((await lerLS(page, 'sc_ped'))[0].inst_cidade).toBe('Colombo');
});

test('instalacao em outro endereco nao herda a cidade do cliente (Rotas, Ir e Editar)', async ({ page }) => {
    const qs = [];
    await page.route('**/nominatim.openstreetmap.org/**', route => {
        qs.push(decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || ''));
        route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: '-25.4', lon: '-49.2' }]) });
    });
    await page.route('**/router.project-osrm.org/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', routes: [{ legs: [{ distance: 1000, duration: 300 }] }] }) }));
    const ped = { id: 26200, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: true,
        data_entrega: DIA, inst_hora: '10:00', inst_duracao: 60, inst_endereco: 'Rua Outra, 99', usuario_instalacao_id: 1, valor: 1, amb: 'S' };
    await entrar(page, BASE, { sc_cli: CLI(), sc_ped: [ped], sc_empresa: { nome: 'E', endereco: 'Rua Empresa, 1', cidade: 'Pinhais' } });
    await page.goto(BASE + '/pcp.html?view=rotas');
    await page.fill('#rota-data', DIA);
    await page.locator('#rota-data').dispatchEvent('change');
    await expect(page.locator('#rota-total')).toBeVisible({ timeout: 15000 });
    expect(qs).toContain('Rua Outra, 99');
    expect(qs).toContain('Rua Empresa, 1, Pinhais');
    await expect(page.locator('#rota-lista .rota-item').first().locator('a.agd-ir')).toHaveAttribute('href', /destination=Rua%20Outra%2C%2099$|destination=Rua%20Outra%2C%2099&/);
    await page.goto(BASE + '/pcp.html?view=agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.locator('.agd-modal button', { hasText: 'Editar' }).click();
    await expect(page.locator('#agdf-end-cidade')).toHaveValue('');
});

test('empresa: o campo Cidade e salvo', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'Lírio Cortinas' } });
    await page.goto(BASE + '/empresa.html');
    await page.fill('#emp-end', 'Rua Empresa, 1');
    await page.fill('#emp-cidade', 'Pinhais');
    await page.evaluate(() => salvarEmpresaConfigs());
    await expect.poll(async () => (await lerLS(page, 'sc_empresa')).cidade).toBe('Pinhais');
});
