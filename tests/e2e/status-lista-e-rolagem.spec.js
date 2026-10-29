// Status dos pedidos: o botao Kanban/Lista, o modo Lista (um bloco por etapa,
// que abre e fecha) e a rolagem propria de cada coluna -- no Kanban e nas
// duas colunas das agendas de Medicoes e Instalacoes.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}

const AMB = [{ id: 1, amb: 'Sala', calculado: true, tecidos: [{ tecidoNome: 'Linho', prega: 'Wave', num_panos: 3, consumo_linear: 6 }] }];
const ped = (id, nome, status, extra) => ({ id, clienteId: 1, clienteNome: nome, status, valor: 100, amb: 'Sala', ambientes: AMB, ...(extra || {}) });

const PED = () => [
    ped(26200, 'Pedro Alves', 'Medição', { data_entrega: dia(-3) }),
    ped(26201, 'Bruna Costa', 'Na Costura', { observacoes: 'Portão azul' }),
    ped(26202, 'Ana Lima',    'Na Costura'),
    ped(26203, 'Carlos Souza', 'Pronto p/ Instalação'),
    ped(26204, 'Rita Moraes', 'Instalado', { data_instalado: Date.now() }),
    ped(26205, 'Orçamento Fora', 'Orçamento'),
];

async function abrir(page, extras, url) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, BASE, { sc_ped: PED(), sc_cli: [{ id: 1, nome: 'Pedro Alves' }], ...(extras || {}) });
    await page.goto(BASE + (url || '/pcp.html'));
}

const blocos = page => page.locator('#kanban-lista .pcp-bloco-nome').allInnerTexts();
const bloco  = (page, nome) => page.locator('#kanban-lista .pcp-bloco', { has: page.locator('.pcp-bloco-nome', { hasText: nome }) });

// --- Alternar Kanban / Lista -------------------------------------------------

test('abre no Kanban, e o botao troca para a Lista e de volta', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#kanban-board')).toBeVisible();
    await expect(page.locator('#kanban-lista')).toBeHidden();
    await expect(page.locator('#pcp-modo-kanban')).toHaveAttribute('aria-pressed', 'true');

    await page.click('#pcp-modo-lista');
    await expect(page.locator('#kanban-lista')).toBeVisible();
    await expect(page.locator('#kanban-board')).toBeHidden();
    await expect(page.locator('#pcp-modo-lista')).toHaveAttribute('aria-pressed', 'true');

    await page.click('#pcp-modo-kanban');
    await expect(page.locator('#kanban-board')).toBeVisible();
    await expect(page.locator('#kanban-lista')).toBeHidden();
});

test('a escolha da Lista fica guardada ao voltar para a tela', async ({ page }) => {
    await abrir(page);
    await page.click('#pcp-modo-lista');
    await page.reload();
    await expect(page.locator('#kanban-lista')).toBeVisible();
    await expect(page.locator('#kanban-board')).toBeHidden();
});

test('armazenamento corrompido nao derruba a tela: abre no Kanban', async ({ page }) => {
    await abrir(page, { sc_pcp_modo_1: 'x' });
    await page.evaluate(() => localStorage.setItem('sc_pcp_fechados_1', '{quebrado'));
    await page.reload();
    await expect(page.locator('#kanban-board .kanban-col')).toHaveCount(6);
    await page.click('#pcp-modo-lista');
    await expect(page.locator('#kanban-lista .pcp-bloco')).toHaveCount(6);
});

// --- Modo Lista ---------------------------------------------------------------

test('lista: um bloco por etapa, na ordem do Kanban, com a contagem', async ({ page }) => {
    await abrir(page);
    await page.click('#pcp-modo-lista');
    expect(await blocos(page)).toEqual(['Aguardando Medição Fina', 'Aguardando Tecido', 'Na Costura',
        'Pronto p/ Instalação', 'Aguardando Pagamento', 'Instalado / Entregue']);
    await expect(bloco(page, 'Na Costura').locator('.pcp-bloco-count')).toHaveText('2');
    await expect(bloco(page, 'Aguardando Tecido').locator('.pcp-bloco-count')).toHaveText('0');
    await expect(bloco(page, 'Aguardando Tecido')).toContainText('Nenhum pedido nesta etapa');
    await expect(page.locator('#kanban-lista'), 'orcamento fica fora, como no Kanban').not.toContainText('Orçamento Fora');
});

test('lista: a linha mostra numero, cliente, ambiente, entrega e as acoes', async ({ page }) => {
    await abrir(page);
    await page.click('#pcp-modo-lista');
    const l = bloco(page, 'Aguardando Medição Fina').locator('.pcp-linha').first();
    await expect(l.locator('.pcp-linha-num')).toHaveText('#26200');
    await expect(l.locator('.pcp-linha-nome')).toHaveText('Pedro Alves');
    await expect(l.locator('.pcp-linha-amb')).toHaveText('Sala');
    await expect(l.locator('.badge-atrasado')).toHaveText('3d atrasado');
    await expect(l.locator('button[title="Ver Ordem de Serviço"]')).toBeVisible();
    await expect(l.locator('button[title="Ver timeline"]')).toBeVisible();
    await expect(l.locator('button[title="Avançar etapa"]')).toBeVisible();
    await expect(l.locator('button[title="Voltar etapa"]'), 'primeira etapa nao volta').toHaveCount(0);

    const costura = bloco(page, 'Na Costura').locator('.pcp-linha', { hasText: 'Bruna Costa' });
    await expect(costura.locator('button[title="Voltar etapa"]')).toBeVisible();
    await expect(costura.locator('.pcp-linha-obs')).toHaveAttribute('title', 'Portão azul');
});

test('lista: pronto sem instalacao marcada mostra Agendar no lugar de avancar', async ({ page }) => {
    await abrir(page);
    await page.click('#pcp-modo-lista');
    const l = bloco(page, 'Pronto p/ Instalação').locator('.pcp-linha').first();
    await expect(l.locator('button', { hasText: 'Agendar' })).toBeVisible();
    await expect(l.locator('button[title="Avançar etapa"]')).toHaveCount(0);
});

test('lista: o numero do pedido abre o pedido', async ({ page }) => {
    await abrir(page);
    await page.click('#pcp-modo-lista');
    await page.click('#kanban-lista .pcp-linha-num:has-text("#26202")');
    await page.waitForURL(/pedido\.html/);
    await expect(page.locator('#titulo-pagina-pedido')).toContainText('Editando Pedido');
});

test('lista: Instalado comeca fechado e os blocos abrem e fecham, lembrando a escolha', async ({ page }) => {
    await abrir(page);
    await page.click('#pcp-modo-lista');
    const inst = bloco(page, 'Instalado');
    await expect(inst.locator('.pcp-bloco-head')).toHaveAttribute('aria-expanded', 'false');
    await expect(inst.locator('.pcp-linha')).toHaveCount(0);
    await expect(inst.locator('.pcp-bloco-count'), 'fechado ainda conta').toHaveText('1');

    await inst.locator('.pcp-bloco-head').click();
    await expect(inst.locator('.pcp-linha')).toHaveCount(1);
    const cost = bloco(page, 'Na Costura');
    await cost.locator('.pcp-bloco-head').click();
    await expect(cost.locator('.pcp-linha')).toHaveCount(0);

    await page.reload();
    await expect(bloco(page, 'Instalado').locator('.pcp-linha')).toHaveCount(1);
    await expect(bloco(page, 'Na Costura').locator('.pcp-linha')).toHaveCount(0);
});

// --- Busca --------------------------------------------------------------------

test('busca por numero do pedido, com ou sem #, nos dois modos', async ({ page }) => {
    await abrir(page);
    await page.fill('#kf-cliente', '26202');
    await expect(page.locator('#kanban-board .kanban-card')).toHaveCount(1);
    await expect(page.locator('#kanban-board')).toContainText('Ana Lima');
    await page.click('#pcp-modo-lista');
    await page.fill('#kf-cliente', '#26202');
    await expect(page.locator('#kanban-lista .pcp-linha')).toHaveCount(1);
    await expect(page.locator('#kf-resultado')).toHaveText('1 pedido(s) encontrado(s)');
});

test('lista: com filtro, bloco sem resultado some', async ({ page }) => {
    await abrir(page);
    await page.click('#pcp-modo-lista');
    await page.fill('#kf-cliente', 'ana');
    expect(await blocos(page)).toEqual(['Na Costura']);
    await page.fill('#kf-cliente', 'ninguem com esse nome');
    await expect(page.locator('#kanban-lista')).toContainText('Nenhum pedido encontrado');
    await page.click('button:has-text("Limpar")');
    expect((await blocos(page)).length).toBe(6);
});

// --- Rolagem por coluna ---------------------------------------------------------

// Card como o de um pedido real: vendedor (obrigatorio ao salvar) e data de entrega.
const muitos = (n, status) => Array.from({ length: n }, (_, i) =>
    ped(26300 + i, 'Cliente ' + i, status, { vendedor_nome: 'Ana', data_entrega: dia(i + 5) }));

test('kanban: colunas de altura fixa ate o fim da tela, sem rolar a pagina', async ({ page }) => {
    await abrir(page, { sc_ped: [...muitos(10, 'Na Costura'), ped(26400, 'Só Um', 'Medição')] });
    const medir = idx => page.locator('#kanban-board .kanban-col').nth(idx).evaluate(c => {
        const b = c.querySelector('.kanban-col-body');
        return { rola: b.scrollHeight > b.clientHeight, alt: Math.round(c.getBoundingClientRect().height), fundo: Math.round(c.getBoundingClientRect().bottom) };
    });
    const costura = await medir(2), medicao = await medir(0);
    expect(costura.rola, 'Na Costura, cheia, rola por dentro').toBe(true);
    expect(medicao.rola, 'Medicao, com 1 card, nao rola').toBe(false);
    expect(medicao.alt, 'coluna com 1 card tem a mesma altura da cheia').toBe(costura.alt);
    expect(costura.fundo, 'a coluna vai ate perto do fim da tela').toBeGreaterThan(900 - 60);
    expect(costura.fundo).toBeLessThanOrEqual(900);
    expect(await page.locator('.main').evaluate(m => m.scrollHeight - m.clientHeight), 'a pagina nao rola').toBeLessThanOrEqual(1);

    // Janela maior: o quadro acompanha.
    await page.setViewportSize({ width: 1440, height: 1100 });
    await expect.poll(async () => (await medir(2)).fundo).toBeGreaterThan(1100 - 60);

    // O cabecalho da etapa fica fora da area que rola.
    const body = page.locator('#kanban-board .kanban-col-body').nth(2);
    await body.evaluate(e => { e.scrollTop = e.scrollHeight; });
    await expect(page.locator('#kanban-board .kanban-col-header').nth(2)).toBeInViewport();
    expect(await page.locator('#kanban-board .kanban-col-body').nth(0).evaluate(e => e.scrollTop), 'as outras nao se mexem').toBe(0);
});

test('kanban: as colunas ocupam toda a largura, sem sobra a direita', async ({ page }) => {
    await page.setViewportSize({ width: 2400, height: 900 });
    await entrar(page, BASE, { sc_ped: PED(), sc_cli: [{ id: 1, nome: 'Pedro Alves' }] });
    await page.goto(BASE + '/pcp.html');
    const r = await page.locator('#kanban-board').evaluate(b => ({
        board: b.getBoundingClientRect().right, ultima: b.lastElementChild.getBoundingClientRect().right }));
    expect(Math.abs(r.board - r.ultima), 'a ultima coluna encosta no fim do quadro').toBeLessThanOrEqual(1);
});

test('kanban: o card nao mostra tecido nem ambiente', async ({ page }) => {
    await abrir(page);
    const board = page.locator('#kanban-board');
    await expect(board.locator('.kanban-card', { hasText: 'Bruna Costa' })).toBeVisible();
    for (const t of ['Linho', 'Wave', 'pano(s)', 'Sala'])
        await expect(board, t).not.toContainText(t);
});

test('agenda de medicoes: cada coluna rola sozinha depois de cerca de 6 linhas', async ({ page }) => {
    const med = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, clienteNome: 'Cliente ' + i, endereco: 'Rua ' + i, data: dia(i + 1), hora: '09:00', status: 'Agendado' }));
    med.push({ id: 99, clienteNome: 'Feita', endereco: 'X', data: dia(-1), status: 'Realizado' });
    await abrir(page, { sc_med: med }, '/pcp.html?view=medicoes');
    const pend = await page.locator('#med-pend-lista').evaluate(e => ({ rola: e.scrollHeight > e.clientHeight, alt: e.clientHeight, linha: e.querySelector('.agd-item').offsetHeight }));
    expect(pend.rola).toBe(true);
    const cabem = pend.alt / pend.linha;
    expect(cabem).toBeGreaterThan(5.5);
    expect(cabem).toBeLessThan(7);
    expect(await page.locator('#med-real-lista').evaluate(e => e.scrollHeight > e.clientHeight), 'realizados com 1 nao rola').toBe(false);
    await expect(page.locator('#med-pend-busca'), 'a busca fica fora da rolagem').toBeVisible();
});

test('agenda de instalacoes: as duas colunas tambem rolam sozinhas', async ({ page }) => {
    const peds = Array.from({ length: 9 }, (_, i) => ped(26500 + i, 'Inst ' + i, 'Pronto p/ Instalação', { data_entrega: dia(i + 1), inst_hora: '10:00', usuario_instalacao_id: 1 }))
        .concat(Array.from({ length: 9 }, (_, i) => ped(26600 + i, 'Feito ' + i, 'Instalado', { data_entrega: dia(-i - 1), data_instalado: Date.now() - i * 86400000 })));
    await abrir(page, { sc_ped: peds }, '/pcp.html?view=agenda');
    for (const id of ['#inst-pend-lista', '#inst-real-lista'])
        expect(await page.locator(id).evaluate(e => e.scrollHeight > e.clientHeight), id).toBe(true);
});
