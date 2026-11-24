// Correcoes finais da branch feriados/alertas: alertas do Financeiro por permissao de aba, dia local
// (nao UTC) a noite, destaque dos novos no sino ate fechar, faixa do card clicavel, ?aba= limpo,
// Salvar da empresa grava os feriados, clique na etiqueta de feriado no Mes. Relogio fixo em todos.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const USU = (papel) => [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Vendedora', email: 'vend@sctech.local', papel_id: papel || 3, ativo: true, permissoes_extras: {}, senha_hash: '' },
];
const badge = page => page.locator('#topbar-sino .sino-badge');
const painel = page => page.locator('#sino-painel');
const J = page => page.locator('#agenda-janela');
const NOITE = new Date('2026-11-18T22:00:00-03:00');
const MEIO_DIA = new Date(2026, 10, 18, 12, 0);

test.use({ timezoneId: 'America/Sao_Paulo' });

async function abrir(page, dados, pagina, quando, correndo) {
    // correndo: so a data e fixa (o relogio instalado esconde o tipo de navegacao, que o F5 precisa)
    if (correndo) await page.clock.setFixedTime(quando || MEIO_DIA); else await page.clock.install({ time: quando || MEIO_DIA });
    await entrar(page, BASE, { sc_usr: USU(), sc_empresa: { razao_social: 'CORTINAS SC LTDA', uf: 'SP' }, ...dados });
    await page.goto(BASE + '/' + (pagina || 'index.html'));
}
const ped = (id, nome, status, data) => ({ id, clienteNome: nome, status, data_entrega: data, itens: [] });
const crAtrasada = { id: 1, cliente_nome: 'Cliente Devedor', valor: 500, status: 'Pendente', data_vencimento: '2026-11-10' };
const cpAtrasada = { id: 2, descricao: 'Fornecedor', valor: 300, status: 'Pendente', data_vencimento: '2026-11-09' };
const crHoje = { id: 3, cliente_nome: 'Cliente Hoje', valor: 100, status: 'Pendente', data_vencimento: '2026-11-18' };
const comoUsuario = (page, id, email) => page.evaluate(u => sessionStorage.setItem('sc_user', JSON.stringify(u)), { id, email });

test('1. alertas do Financeiro seguem a aba: Vendedor (so A Receber) ve so o de recebimento', async ({ page }) => {
    await abrir(page, { sc_cr: [crAtrasada, crHoje], sc_cp: [cpAtrasada] });
    await comoUsuario(page, 2, 'vend@sctech.local');
    await page.goto(BASE + '/index.html');
    expect(await page.evaluate(() => [temAcesso('financeiro.receber', 'visualizar'), temAcesso('financeiro.pagar', 'visualizar'), temAcesso('financeiro.hoje', 'visualizar'), temAcesso('financeiro.dashboard', 'visualizar')])).toEqual([true, false, false, false]);
    await page.hover('#sino-btn');
    await expect(painel(page).locator('.sino-item')).toHaveCount(1);
    await expect(painel(page)).toContainText('1 recebimento(s) em atraso');
    await expect(painel(page)).not.toContainText('pagamento(s) em atraso');
    await expect(painel(page)).not.toContainText('vencem hoje');
    await expect(painel(page)).not.toContainText('Gap de caixa');
    const card = page.locator('#dashboard-alertas');
    await expect(card).toContainText('1 recebimento(s) em atraso');
    await expect(card).not.toContainText('pagamento(s) em atraso');
});

test('1b. papel so com Extrato/Simulador nao ve alerta financeiro; o Admin ve todos', async ({ page }) => {
    await abrir(page, { sc_cr: [crAtrasada, crHoje], sc_cp: [cpAtrasada], sc_usr: USU(20) });
    await page.evaluate(() => {
        const pap = JSON.parse(localStorage.getItem('sc_pap')) || papeisPadrao();
        pap.push({ id: 20, nome: 'So Extrato', permissoes: { inicio: { nivel: 'completo', acoes_restritas: [] }, 'financeiro.extrato': { nivel: 'visualizar', acoes_restritas: [] }, 'financeiro.simulador': { nivel: 'visualizar', acoes_restritas: [] } } });
        localStorage.setItem('sc_pap', JSON.stringify(pap));
    });
    await comoUsuario(page, 2, 'vend@sctech.local');
    await page.goto(BASE + '/index.html');
    expect(await page.evaluate(() => temAcessoAlgumaSub('financeiro', 'visualizar'))).toBe(true);
    await page.hover('#sino-btn');
    await expect(painel(page)).toContainText('Nenhuma notificação no momento.');
    await expect(page.locator('#dashboard-alertas')).not.toContainText('em atraso');
    await comoUsuario(page, 1, 'teste@sctech.local');
    await page.goto(BASE + '/index.html');
    await page.hover('#sino-btn');
    await expect(painel(page)).toContainText('recebimento(s) em atraso');
    await expect(painel(page)).toContainText('pagamento(s) em atraso');
    await expect(painel(page)).toContainText('vencem hoje');
});

test('2. as 22h (Sao Paulo) o alerta "de hoje" e o do dia local, nao o do dia seguinte', async ({ page }) => {
    await abrir(page, { sc_cr: [crHoje], sc_ped: [ped(26020, 'Entrega Hoje', 'Em Produção', '2026-11-18'), ped(26021, 'Entrega Amanha', 'Em Produção', '2026-11-19')] }, 'index.html', NOITE);
    expect(await page.evaluate(() => hojeLocal())).toBe('2026-11-18');
    expect(await page.evaluate(() => new Date().toISOString().slice(0, 10))).toBe('2026-11-19');
    const card = page.locator('#dashboard-alertas');
    await expect(card).toContainText('1 conta(s) vencem hoje');
    const faixa = card.locator('[data-chave]', { hasText: 'entrega prevista para hoje' });
    await expect(faixa).toContainText('Entrega Hoje');
    await expect(faixa).not.toContainText('Entrega Amanha');
});

test('3. sino aberto: o novo fica no topo e destacado ate fechar; a contagem zera ao abrir', async ({ page }) => {
    await abrir(page, { sc_ped: [ped(26001, 'Joao Atrasado', 'Em Produção', '2026-11-10')],
        sc_med: [{ id: 501, clienteNome: 'Maria Medida', status: 'Agendado', data: '2026-11-17', hora: '09:00' }] });
    // o primeiro da lista ja foi visto; so o segundo e novo
    const primeiro = await page.evaluate(() => Notif.listar()[0].chave);
    await page.evaluate(c => Notif.marcarVisto(c), primeiro);
    await expect(badge(page)).toHaveText('1');
    await page.click('#sino-btn');
    await expect(badge(page)).toHaveCount(0);
    await expect(painel(page).locator('.sino-item')).toHaveCount(2);
    await expect(painel(page).locator('.sino-item.novo')).toHaveCount(1);
    await expect(painel(page).locator('.sino-item').first()).toHaveClass(/novo/);
    expect(await painel(page).locator('.sino-item').first().getAttribute('data-chave')).not.toBe(primeiro);
    // um redesenho com o painel aberto nao tira o destaque
    await page.evaluate(() => Notif.atualizar());
    await expect(painel(page).locator('.sino-item.novo')).toHaveCount(1);
    // fechar: o destaque some
    await page.click('#sino-btn');
    await expect(painel(page).locator('.sino-item.novo')).toHaveCount(0);
    await page.click('#sino-btn');
    await expect(painel(page).locator('.sino-item.novo')).toHaveCount(0);
    await expect(painel(page).locator('.sino-item')).toHaveCount(2);
});

test('4. no card do Painel a faixa do Financeiro leva a aba do assunto', async ({ page }) => {
    await abrir(page, { sc_cr: [crAtrasada] });
    const faixa = page.locator('#dashboard-alertas [data-chave^="fin:"]');
    await expect(faixa).toHaveAttribute('data-href', 'financeiro.html?aba=receber');
    await faixa.click();
    await page.waitForURL(/financeiro\.html/);
    await expect(page.locator('.fin-lado-btn[data-lado="receber"]')).toHaveClass(/active/);
});

test('5. ?aba= e tirado do endereco depois de usado (sem nova entrada no historico)', async ({ page }) => {
    await abrir(page, { sc_cr: [crAtrasada] }, 'index.html');
    const antes = await page.evaluate(() => history.length);
    await page.goto(BASE + '/financeiro.html?aba=pagar');
    await expect(page.locator('.fin-lado-btn[data-lado="pagar"]')).toHaveClass(/active/);
    await expect.poll(() => page.url()).toBe(BASE + '/financeiro.html');
    expect(await page.evaluate(() => history.length)).toBe(antes + 1);
    // aba sem permissao/invalida: tambem limpa e cai na aba inicial
    await page.goto(BASE + '/financeiro.html?aba=nao_existe');
    await expect.poll(() => page.url()).toBe(BASE + '/financeiro.html');
    await expect(page.locator('.fin-tab-btn[data-tab="resumo"]')).toHaveClass(/active/);
});

test('6. o Salvar Configuracoes da empresa tambem grava os feriados da cidade', async ({ page }) => {
    await abrir(page, {}, 'empresa.html#preferencias', null, true);
    await page.click('#emp-feriados-card button:has-text("Adicionar feriado")');
    await page.fill('.emp-fer-dia', '8');
    await page.selectOption('.emp-fer-mes', '9');
    await page.fill('.emp-fer-nome', 'Aniversário da cidade');
    await page.click('.emp-tab-btn[data-tab="dados"]');   // o Salvar principal fica na aba Dados
    await page.click('button:has-text("Salvar Configurações")');
    const emp = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_empresa')));
    expect(emp.feriados_municipais).toEqual([{ dia: 8, mes: 9, nome: 'Aniversário da cidade' }]);
    expect(emp.razao_social).toBe('CORTINAS SC LTDA');
    // linha incompleta: avisa e nao grava nada
    await page.click('.emp-tab-btn[data-tab="preferencias"]');
    await page.click('#emp-feriados-card button:has-text("Adicionar feriado")');
    await page.locator('.emp-fer-dia').last().fill('3');
    await page.click('.emp-tab-btn[data-tab="dados"]');
    await page.click('button:has-text("Salvar Configurações")');
    await expect(page.getByText('Informe o dia (válido para o mês) e o nome de cada feriado da cidade')).toBeVisible();
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('sc_empresa')))).feriados_municipais).toHaveLength(1);
});

async function abrirAgenda(page, visao) {
    await abrir(page, { sc_cli: [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Rua A' }] }, 'index.html', new Date(2026, 11, 23, 8, 0));
    await page.click('#btn-agenda');
    await expect(J(page)).toBeVisible();
    if (visao) await J(page).locator(`[data-visao="${visao}"]`).click();
}

test('7. no Mes, clicar na etiqueta do feriado abre o agendar daquele dia', async ({ page }) => {
    await abrirAgenda(page, 'mes');
    await J(page).locator('.ag-mes-cel[data-data="2026-12-25"] .ag-fer').click();
    await expect(page.locator('.agd-modal-overlay #ag-esc-comp')).toBeVisible();
    await expect(page.locator('.agd-modal-overlay .ag-escolha-info')).toContainText('25/12');
});

test('7b. na faixa da Semana/Dia o clique no feriado nao faz nada', async ({ page }) => {
    await abrirAgenda(page, 'semana');
    await J(page).locator('.ag-cab .ag-fer').first().click();
    await expect(page.locator('.agd-modal-overlay')).toHaveCount(0);
});

test('8. no card, clicar no nome do pedido abre aquele pedido; clicar no fundo da faixa leva a lista', async ({ page }) => {
    await abrir(page, { sc_ped: [ped(26030, 'Cliente Atrasado', 'Em Produção', '2026-11-10')] });
    const faixa = page.locator('#dashboard-alertas [data-chave]', { hasText: 'entrega(s) atrasada(s)' });
    await expect(faixa).toHaveAttribute('data-href', 'pedidos.html');
    await faixa.locator('span[onclick^="editarPedido"]').click();
    await page.waitForURL(/pedido\.html/);
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/pedido\.html/);
    expect(page.url()).not.toMatch(/pedidos\.html/);
    expect(await page.evaluate(() => localStorage.getItem('sc_editando_id'))).toBe('26030');
});

test('8b. clicar no fundo da faixa do pedido (e Espaco com foco) leva a Pedidos', async ({ page }) => {
    await abrir(page, { sc_ped: [ped(26030, 'Cliente Atrasado', 'Em Produção', '2026-11-10')] });
    const faixa = page.locator('#dashboard-alertas [data-chave]', { hasText: 'entrega(s) atrasada(s)' });
    await faixa.click({ position: { x: 4, y: 4 } });
    await page.waitForURL(/pedidos\.html/);
    await page.goBack();
    await page.locator('#dashboard-alertas [data-chave]', { hasText: 'entrega(s) atrasada(s)' }).focus();
    await page.keyboard.press('Space');
    await page.waitForURL(/pedidos\.html/);
});
