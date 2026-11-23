// Feriados na Agenda: nacionais/facultativos calculados para qualquer ano, estaduais
// pelo Estado da empresa, municipais cadastrados em Configurar Empresa. So desenho:
// nao ocupam nem riscam horario.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const J = page => page.locator('#agenda-janela');
const EMP = (extra) => ({ razao_social: 'CORTINAS SC LTDA', uf: 'SP', ...(extra || {}) });
const CLI = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Av. das Palmeiras, 1000' }];
const USU = () => [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Maria Souza', email: 'maria@sctech.local', papel_id: 6, ativo: true, permissoes_extras: {}, senha_hash: '' },
];

async function abrirAgenda(page, quando, extras, visao) {
    await page.clock.setFixedTime(quando);
    await entrar(page, BASE, { sc_empresa: EMP(), sc_usr: USU(), ...(extras || {}) });
    await page.goto(BASE + '/index.html');
    await page.click('#btn-agenda');
    await expect(J(page)).toBeVisible();
    if (visao) await J(page).locator(`[data-visao="${visao}"]`).click();
}
const proximo = async (page, n) => { for (let i = 0; i < (n || 1); i++) await J(page).locator('[data-nav="1"]').click(); };

test('semana de 09/07/2026: faixa do feriado estadual de SP na cor de feriado', async ({ page }) => {
    await abrirAgenda(page, new Date(2026, 6, 8, 8, 0, 0));
    const faixa = J(page).locator('.ag-cab .ag-fer', { hasText: 'Revolução Constitucionalista — feriado estadual (SP)' });
    await expect(faixa).toHaveCount(1);
    const cores = await page.evaluate(() => {
        const f = document.querySelector('.ag-cab .ag-fer');
        const t = document.createElement('i'); t.style.background = 'var(--ag-fer-bg)'; document.body.appendChild(t);
        const r = { faixa: getComputedStyle(f).backgroundColor, token: getComputedStyle(t).backgroundColor }; t.remove(); return r;
    });
    expect(cores.faixa).toBe(cores.token);
    await expect(J(page).locator('.ag-col-fer')).toHaveCount(1);
});

test('semana do Natal mostra "Natal"', async ({ page }) => {
    await abrirAgenda(page, new Date(2026, 11, 23, 8, 0, 0));
    await expect(J(page).locator('.ag-cab .ag-fer', { hasText: /Natal$/ })).toHaveCount(1);
});

test('mes de fevereiro/2026 mostra o Carnaval como ponto facultativo', async ({ page }) => {
    await abrirAgenda(page, new Date(2026, 1, 10, 8, 0, 0), null, 'mes');
    await expect(J(page).locator('.ag-mes-cel[data-data="2026-02-16"] .ag-fer')).toContainText('Carnaval — ponto facultativo');
    await expect(J(page).locator('.ag-mes-cel[data-data="2026-02-17"] .ag-fer')).toContainText('Carnaval — ponto facultativo');
});

test('navegar para 2027 mostra os feriados de 2027 sem cadastrar nada', async ({ page }) => {
    await abrirAgenda(page, new Date(2026, 11, 15, 8, 0, 0), null, 'mes');
    await proximo(page);
    await expect(J(page).locator('.ag-mes-cel[data-data="2027-01-01"] .ag-fer')).toContainText('Confraternização Universal');
    await proximo(page);
    await expect(J(page).locator('.ag-mes-cel[data-data="2027-02-08"] .ag-fer')).toContainText('Carnaval — ponto facultativo');
});

test('feriado da cidade cadastrado aparece em 08/09 de 2026 e de 2027', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: EMP() });
    await page.goto(BASE + '/empresa.html#preferencias');
    await page.click('#emp-feriados-card button:has-text("Adicionar feriado")');
    const linha = page.locator('.emp-fer-linha').first();
    await linha.locator('.emp-fer-dia').fill('8');
    await linha.locator('.emp-fer-mes').selectOption('9');
    await linha.locator('.emp-fer-nome').fill('Aniversário da cidade');
    await page.click('button:has-text("Salvar feriados")');
    const emp = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_empresa')));
    expect(emp.feriados_municipais).toEqual([{ dia: 8, mes: 9, nome: 'Aniversário da cidade' }]);
    expect(emp.uf, 'nao perde o resto da empresa').toBe('SP');

    await page.clock.setFixedTime(new Date(2026, 8, 10, 8, 0, 0));
    await page.goto(BASE + '/index.html');
    await page.click('#btn-agenda');
    await J(page).locator('[data-visao="mes"]').click();
    await expect(J(page).locator('.ag-mes-cel[data-data="2026-09-08"] .ag-fer')).toContainText('Aniversário da cidade — feriado municipal');
    await proximo(page, 12);
    await expect(J(page).locator('.ag-mes-cel[data-data="2027-09-08"] .ag-fer')).toContainText('Aniversário da cidade — feriado municipal');
});

test('Corpus Christi vira feriado municipal quando a caixa esta marcada', async ({ page }) => {
    await abrirAgenda(page, new Date(2026, 5, 3, 8, 0, 0), { sc_empresa: EMP({ corpus_municipal: true }) }, 'mes');
    await expect(J(page).locator('.ag-mes-cel[data-data="2026-06-04"] .ag-fer')).toContainText('Corpus Christi — feriado municipal');
});

test('remover um feriado da cidade e salvar tira da lista', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: EMP({ feriados_municipais: [{ dia: 8, mes: 9, nome: 'Aniversário da cidade' }] }) });
    await page.goto(BASE + '/empresa.html#preferencias');
    await expect(page.locator('.emp-fer-linha')).toHaveCount(1);
    await page.click('.emp-fer-linha button[aria-label="Remover feriado"]');
    await page.click('button:has-text("Salvar feriados")');
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('sc_empresa')))).feriados_municipais).toEqual([]);
});

test('no dia do feriado os horarios continuam livres e a medicao salva sem conflito', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 6, 8, 8, 0, 0));
    await entrar(page, BASE, { sc_empresa: EMP(), sc_usr: USU(), sc_cli: CLI() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', '2026-07-09');
    await page.click('#med-hora');
    for (const h of ['09:00', '14:00']) {
        const it = page.locator('.agd-hpick .agd-hpick-item', { hasText: new RegExp('^' + h + '$') });
        expect((await it.evaluate(e => getComputedStyle(e).textDecorationLine)).includes('line-through'), h + ' livre').toBe(false);
    }
    await page.locator('.agd-hpick .agd-hpick-item', { hasText: /^09:00$/ }).click();
    await page.selectOption('#med-cliente-id', '1');
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-pend-lista')).toContainText('Ana Paula Lima');
    const meds = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_med')));
    expect(meds.some(m => m.data === '2026-07-09' && m.hora === '09:00')).toBe(true);
});

test('o feriado nao entra na ocupacao da agenda', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 6, 8, 8, 0, 0));
    await entrar(page, BASE, { sc_empresa: EMP(), sc_usr: USU() });
    await page.goto(BASE + '/index.html');
    expect(await page.evaluate(() => _agdCompromissos().length)).toBe(0);
});

test('usuario comum tambem ve os feriados', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 11, 23, 8, 0, 0));
    await entrar(page, BASE, { sc_empresa: EMP(), sc_usr: USU() });
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'maria@sctech.local' })));
    await page.goto(BASE + '/index.html');
    await page.click('#btn-agenda');
    await expect(J(page).locator('.ag-cab .ag-fer', { hasText: /Natal/ })).toHaveCount(1);
});

test('clicar na faixa do feriado nao abre nada; a legenda lista Feriado e Ponto facultativo', async ({ page }) => {
    await abrirAgenda(page, new Date(2026, 11, 23, 8, 0, 0));
    await J(page).locator('.ag-cab .ag-fer').first().click();
    await expect(page.locator('.agd-modal-overlay')).toHaveCount(0);
    await expect(page.locator('#ag-esc-comp')).toHaveCount(0);
    await expect(J(page).locator('.ag-legenda')).toContainText('Feriado');
    await expect(J(page).locator('.ag-legenda')).toContainText('Ponto facultativo');
});

test('tema escuro: a faixa do feriado tem contraste legivel', async ({ page }) => {
    await abrirAgenda(page, new Date(2026, 11, 23, 8, 0, 0));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const r = await page.evaluate(() => {
        const f = document.querySelector('.ag-cab .ag-fer'); const s = getComputedStyle(f);
        const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = ([r, g, b]) => { const k = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * k(r) + .7152 * k(g) + .0722 * k(b); };
        const a = lum(rgb(s.color)), b = lum(rgb(s.backgroundColor));
        return { bg: s.backgroundColor, razao: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
    expect(r.bg).not.toBe('rgb(255, 241, 201)');   // nao e o fundo claro
    expect(r.razao).toBeGreaterThan(4.5);
});

test('a busca do CNPJ (API simulada) preenche o Estado', async ({ page }) => {
    await entrar(page, BASE);
    await page.route('**/publica.cnpj.ws/**', rota => rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        razao_social: 'CORTINAS SC LTDA',
        estabelecimento: { nome_fantasia: 'SCTech', logradouro: 'DAS ACACIAS', numero: '450', bairro: 'CENTRO', cep: '89010000',
            cidade: { nome: 'Blumenau' }, estado: { sigla: 'SC' } } }) }));
    await page.goto(BASE + '/empresa.html');
    await page.fill('#emp-cnpj', '12345678000195');
    await expect(page.locator('#emp-cnpj-status')).toContainText('preenchidos');
    await expect(page.locator('#emp-uf')).toHaveValue('SC');
    await page.click('button:has-text("Salvar Configurações")');
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('sc_empresa')))).uf).toBe('SC');
});
