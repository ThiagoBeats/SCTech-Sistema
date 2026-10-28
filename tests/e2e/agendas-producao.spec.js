// Agendas da Producao (Medicoes e Instalacoes) em duas colunas: pendentes
// (data mais proxima primeiro) e realizados (mais recente primeiro), cada
// coluna com a sua busca. A linha abre o detalhe, onde ficam as acoes.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

// Datas relativas a hoje, no fuso do navegador de teste.
function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}

const MED = () => [
    { id: 1, clienteNome: 'Carlos Souza',  clienteTel: '44987654321', endereco: 'Rua das Flores, 320', data: dia(5), hora: '09:30', status: 'Agendado', obs: 'Portão azul' },
    { id: 2, clienteNome: 'Ana Paula Lima', clienteTel: '44991234567', endereco: 'Av. das Palmeiras, 1000', data: dia(5), hora: '08:00', status: 'Agendado' },
    { id: 3, clienteNome: 'Maria Oliveira', endereco: 'Av. Brasil, 250', data: dia(-2), hora: '14:00', status: 'Agendado' },
    { id: 4, clienteNome: 'Juliana Martins', endereco: 'Av. Central, 500', data: dia(-20), hora: '09:00', status: 'Realizado' },
    { id: 5, clienteNome: 'João Silva',      endereco: 'Rua das Acácias, 45', data: dia(-3), hora: '10:20', status: 'Realizado' },
    { id: 6, clienteNome: 'Cancelada Teste', endereco: 'X', data: dia(1), status: 'Cancelado' },
];

const PED = () => [
    { id: 26010, clienteId: 1, clienteNome: 'Pedro Alves',  status: 'Pronto p/ Instalação', valor: 1000, valor_recebido: 0, data_entrega: dia(3), inst_hora: '10:00', amb: 'Sala', usuario_instalacao_id: 1 },
    { id: 26011, clienteId: 2, clienteNome: 'Bruna Costa',  status: 'Pronto p/ Instalação', valor: 800,  data_entrega: dia(1), inst_hora: '15:00', usuario_instalacao_id: 1 },
    { id: 26012, clienteId: 1, clienteNome: 'Sem Data Ltda', status: 'Pronto p/ Instalação', valor: 500 },
    { id: 26013, clienteId: 2, clienteNome: 'Rita Instalada', status: 'Instalado', valor: 300, valor_recebido: 300, data_entrega: dia(-10), data_instalado: Date.now() - 86400000 * 9 },
    { id: 26014, clienteId: 2, clienteNome: 'Orçamento Fora', status: 'Orçamento', valor: 100, data_entrega: dia(2) },
];

async function abrir(page, view, extras) {
    await entrar(page, BASE, {
        sc_med: MED(), sc_ped: PED(),
        sc_cli: [{ id: 1, nome: 'Pedro Alves', tel: '44990001111', end: 'Rua A, 1' }, { id: 2, nome: 'Bruna Costa', tel: '44990002222' }],
        ...(extras || {}),
    });
    await page.goto(BASE + '/pcp.html?view=' + view);
}

const nomes = (page, lista) => page.locator(`#${lista} .agd-nome`).allInnerTexts();
const lerMed = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_med')));
const lerPed = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')));

async function confirmar(page) {
    await page.locator('#sc-modal-ok').click();
}

// --- Medicoes: listas ---------------------------------------------------------

test('medicoes: pendentes a esquerda, realizados a direita, sem cancelados', async ({ page }) => {
    await abrir(page, 'medicoes');
    expect(await nomes(page, 'med-pend-lista')).toEqual(['Maria Oliveira', 'Ana Paula Lima', 'Carlos Souza']);
    expect(await nomes(page, 'med-real-lista'), 'mais recente primeiro').toEqual(['João Silva', 'Juliana Martins']);
    await expect(page.locator('#med-pend-count')).toHaveText('3 agendamentos');
    await expect(page.locator('#med-real-count')).toHaveText('2');
    await expect(page.locator('#pcp-view-medicoes')).not.toContainText('Cancelada Teste');
});

test('medicoes: atrasada leva o selo vermelho, futura o azul', async ({ page }) => {
    await abrir(page, 'medicoes');
    const linhas = page.locator('#med-pend-lista .agd-item');
    await expect(linhas.nth(0).locator('.agd-pill')).toHaveText('Atrasado');
    await expect(linhas.nth(1).locator('.agd-pill')).toHaveText('Agendado');
});

test('medicoes: cada coluna tem a sua busca, que ignora acento e maiuscula', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.fill('#med-pend-busca', 'MARIA');
    expect(await nomes(page, 'med-pend-lista')).toEqual(['Maria Oliveira']);
    await expect(page.locator('#med-pend-count')).toHaveText('1 de 3 agendamentos');
    expect((await nomes(page, 'med-real-lista')).length, 'a outra coluna nao filtra').toBe(2);
    await page.fill('#med-real-busca', 'joao');
    expect(await nomes(page, 'med-real-lista')).toEqual(['João Silva']);
});

test('medicoes: agendar uma visita a coloca na coluna da esquerda, sem recarregar', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.click('input[name="med-tipo"][value="novo"]');
    await page.fill('#med-novo-nome', 'Euclides Genésio');
    await page.fill('#med-data', dia(2));
    await page.fill('#med-hora', '18:50');
    await page.fill('#med-end', 'Rua Laura, 139');
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-pend-lista')).toContainText('Euclides Genésio');
    await expect(page.locator('#med-pend-count')).toHaveText('4 agendamentos');
});

// --- Medicoes: detalhe e acoes ------------------------------------------------

test('medicoes: a linha abre o detalhe com todos os dados', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Carlos Souza' }).click();
    const modal = page.locator('.agd-modal');
    for (const t of ['Carlos Souza', '44987654321', 'Rua das Flores, 320', '09:30', 'Portão azul', 'A definir'])
        await expect(modal).toContainText(t);
    for (const b of ['Editar', 'Reagendar', 'Confirmar medição', 'Cancelar agendamento'])
        await expect(modal.locator('button', { hasText: b })).toBeVisible();
});

test('medicoes: confirmar move para Realizados sem duplicar', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Carlos Souza' }).click();
    await page.click('.agd-modal button:has-text("Confirmar medição")');
    await confirmar(page);
    await expect(page.locator('#med-real-lista')).toContainText('Carlos Souza');
    await expect(page.locator('#med-pend-lista')).not.toContainText('Carlos Souza');
    const med = await lerMed(page);
    expect(med.length, 'nenhum registro novo').toBe(6);
    const c = med.find(m => m.id === 1);
    expect(c.status).toBe('Realizado');
    expect(c.realizado_em).toBeGreaterThan(0);
    expect(c.endereco, 'dados originais mantidos').toBe('Rua das Flores, 320');
});

test('medicoes: desistir da confirmacao nao muda nada', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Carlos Souza' }).click();
    await page.click('.agd-modal button:has-text("Confirmar medição")');
    await page.locator('#sc-modal-cancel, .sc-modal-btns .btn-outline').first().click();
    expect((await lerMed(page)).find(m => m.id === 1).status).toBe('Agendado');
});

test('medicoes: reagendar muda a posicao e guarda o historico', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Carlos Souza' }).click();
    await page.click('.agd-modal button:has-text("Reagendar")');
    await page.fill('#agdf-data', dia(-5));
    await page.fill('#agdf-hora', '07:00');
    await page.click('#agdf-salvar');
    expect((await nomes(page, 'med-pend-lista'))[0], 'agora e a mais antiga').toBe('Carlos Souza');
    await expect(page.locator('.agd-modal .agd-hist')).toContainText('reagendado');
    const med = await lerMed(page);
    expect(med.length).toBe(6);
    const c = med.find(m => m.id === 1);
    expect(c.data).toBe(dia(-5));
    expect(c.historico[0]).toMatchObject({ acao: 'reagendado', de: { data: dia(5), hora: '09:30' }, para: { data: dia(-5), hora: '07:00' } });
});

test('medicoes: editar corrige o registro sem criar outro', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.click('.agd-modal button:has-text("Editar")');
    await page.fill('#agdf-end', 'Av. das Palmeiras, 1001');
    await page.click('#agdf-salvar');
    await expect(page.locator('#med-pend-lista')).toContainText('Av. das Palmeiras, 1001');
    const med = await lerMed(page);
    expect(med.length).toBe(6);
    expect(med.find(m => m.id === 2).endereco).toBe('Av. das Palmeiras, 1001');
});

test('medicoes: editar exige endereco e data', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.click('.agd-modal button:has-text("Editar")');
    await page.fill('#agdf-end', '');
    await page.click('#agdf-salvar');
    await expect(page.locator('#agdf-end')).toHaveClass(/agd-erro/);
    expect((await lerMed(page)).find(m => m.id === 2).endereco).toBe('Av. das Palmeiras, 1000');
});

test('medicoes: cancelar tira dos agendamentos e nao conta como realizada', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Maria Oliveira' }).click();
    await page.click('.agd-modal button:has-text("Cancelar agendamento")');
    await confirmar(page);
    await expect(page.locator('#med-pend-lista')).not.toContainText('Maria Oliveira');
    await expect(page.locator('#med-real-lista')).not.toContainText('Maria Oliveira');
    await expect(page.locator('#med-pend-count')).toHaveText('2 agendamentos');
    await expect(page.locator('#med-real-count')).toHaveText('2');
    const m = (await lerMed(page)).find(x => x.id === 3);
    expect(m.status).toBe('Cancelado');
    expect(m.historico[0].acao).toBe('cancelado');
    expect(m.endereco, 'nada apagado').toBe('Av. Brasil, 250');
});

// --- Medicoes: Criar Pedido a partir do agendamento ---------------------------

// Medicao do cliente cadastrado Pedro Alves (id 1), para o pedido preencher o cliente.
const MED_PEDRO = { id: 7, clienteId: 1, clienteNome: 'Pedro Alves', endereco: 'Rua A, 1', data: dia(1), hora: '11:00', status: 'Agendado' };
const VEND = [{ id: 1, nome: 'Ana', comissao_pct: 5 }];

async function abrirComPedro(page, extras) {
    await abrir(page, 'medicoes', { sc_med: [...MED(), MED_PEDRO], sc_vend: VEND, ...(extras || {}) });
}
// O ambiente do pedido novo nao passou pelo "Calcular Consumo"; marca como
// calculado e salva. Nao aguarda: salvar pode abrir modal.
async function salvarPedidoNovo(page) {
    await page.selectOption('#ped-vendedor', '1');
    await page.evaluate(() => { pedidoDraft.ambientes.forEach(a => { a.calculado = true; }); salvarPedido(); });
}

test('medicoes: o agendado mostra Criar Pedido junto do Confirmar', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Carlos Souza' }).click();
    const modal = page.locator('.agd-modal');
    await expect(modal.locator('button', { hasText: 'Criar Pedido' })).toBeVisible();
    await expect(modal.locator('button', { hasText: 'Confirmar medição' }), 'confirmar manual continua').toBeVisible();
});

test('medicoes: o realizado nao mostra mais Criar Pedido nem Reagendar', async ({ page }) => {
    await abrir(page, 'medicoes');
    await page.locator('#med-real-lista .agd-item', { hasText: 'João Silva' }).click();
    const modal = page.locator('.agd-modal');
    await expect(modal.locator('button', { hasText: 'Excluir' })).toBeVisible();
    await expect(modal.locator('button', { hasText: 'Criar Pedido' })).toHaveCount(0);
    await expect(modal.locator('button', { hasText: 'Reagendar' })).toHaveCount(0);
});

test('medicoes: Criar Pedido abre o pedido com o cliente e, ao salvar, a medicao vai para Realizados vinculada', async ({ page }) => {
    await abrirComPedro(page);
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    await page.click('.agd-modal button:has-text("Criar Pedido")');
    await page.waitForURL(/pedido\.html/);
    await expect(page.locator('#ped-cliente')).toHaveValue('1');
    await salvarPedidoNovo(page);
    await page.waitForURL(/index\.html/);

    const peds = await lerPed(page);
    expect(peds.length, 'um pedido novo').toBe(PED().length + 1);
    const novo = peds.find(p => p.medicao_id === 7);
    expect(novo, 'pedido guarda a medicao').toBeTruthy();
    expect(novo.clienteNome).toBe('Pedro Alves');
    const m = (await lerMed(page)).find(x => x.id === 7);
    expect(m.status, 'realizado sem confirmar a mao').toBe('Realizado');
    expect(m.pedido_id).toBe(novo.id);
    expect(m.realizado_via).toBe('pedido');
    expect(m.realizado_em).toBeGreaterThan(0);
    expect(m.historico.map(h => h.acao)).toContain('pedido');

    await page.goto(BASE + '/pcp.html?view=medicoes');
    await expect(page.locator('#med-real-lista')).toContainText('Pedro Alves');
    await expect(page.locator('#med-pend-lista')).not.toContainText('Pedro Alves');
});

test('medicoes: agendamento que ja tem pedido abre esse pedido em vez de criar outro', async ({ page }) => {
    const ped = { id: 26020, clienteId: 1, clienteNome: 'Pedro Alves', status: 'Orçamento', valor: 10, medicao_id: 7,
        ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [] };
    await abrirComPedro(page, { sc_ped: [...PED(), ped], sc_med: [...MED(), { ...MED_PEDRO, pedido_id: 26020 }] });
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    const modal = page.locator('.agd-modal');
    await expect(modal.locator('button', { hasText: 'Criar Pedido' })).toHaveCount(0);
    await modal.locator('button', { hasText: 'Abrir Pedido' }).click();
    await page.waitForURL(/pedido\.html/);
    await expect(page.locator('#titulo-pagina-pedido')).toContainText('Editando Pedido');
    expect((await lerPed(page)).length, 'nada criado').toBe(PED().length + 1);
});

test('medicoes: salvar um segundo pedido para o mesmo agendamento e barrado', async ({ page }) => {
    await abrirComPedro(page);
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    await page.click('.agd-modal button:has-text("Criar Pedido")');
    await page.waitForURL(/pedido\.html/);
    // Enquanto isso, outra aba ja criou o pedido deste agendamento.
    await page.evaluate(() => {
        db.pedidos.push({ id: 26030, clienteId: 1, clienteNome: 'Pedro Alves', status: 'Orçamento', valor: 1, medicao_id: 7 });
        db.medicoes.find(m => m.id === 7).pedido_id = 26030;
    });
    await salvarPedidoNovo(page);
    await expect(page.locator('#sc-modal-msg')).toContainText('já tem o pedido');
    expect((await lerPed(page)).length, 'nenhum pedido gravado').toBe(PED().length);
    expect(page.url()).toContain('pedido.html');
});

test('medicoes: editar o pedido vinculado mantem o vinculo', async ({ page }) => {
    const ped = { id: 26020, clienteId: 1, clienteNome: 'Pedro Alves', status: 'Orçamento', valor: 10, medicao_id: 7, vendedor_id: 1,
        ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [] };
    await entrar(page, BASE, { sc_ped: [ped], sc_vend: VEND, sc_cli: [{ id: 1, nome: 'Pedro Alves' }],
        sc_med: [{ ...MED_PEDRO, status: 'Realizado', pedido_id: 26020 }], sc_editando_id: 26020 });
    await page.goto(BASE + '/pedido.html');
    await salvarPedidoNovo(page);
    await page.waitForURL(/index\.html/);
    const peds = await lerPed(page);
    expect(peds.length).toBe(1);
    expect(peds[0].medicao_id).toBe(7);
});

test('medicoes: o realizado com pedido mostra Abrir Pedido', async ({ page }) => {
    const ped = { id: 26020, clienteId: 1, clienteNome: 'Pedro Alves', status: 'Orçamento', valor: 10, medicao_id: 7 };
    await abrirComPedro(page, { sc_ped: [...PED(), ped], sc_med: [...MED(), { ...MED_PEDRO, status: 'Realizado', pedido_id: 26020, realizado_em: Date.now(), realizado_via: 'pedido' }] });
    await page.locator('#med-real-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    const modal = page.locator('.agd-modal');
    await expect(modal).toContainText('ao salvar o pedido');
    await expect(modal.locator('button', { hasText: 'Abrir Pedido' })).toBeVisible();
    await expect(modal.locator('button', { hasText: 'Criar Pedido' })).toHaveCount(0);
});

// --- Instalacoes ----------------------------------------------------------------

test('instalacoes: tres areas -- prontos, formulario + disponibilidade, colunas', async ({ page }) => {
    await abrir(page, 'agenda');
    await expect(page.locator('#pcp-view-agenda .agd-prontos')).toBeVisible();
    await expect(page.locator('#inst-form')).toContainText('Agendar Instalação');
    await expect(page.locator('#inst-disp')).toContainText('Disponibilidade do profissional');
    expect(await nomes(page, 'inst-pend-lista'), 'data mais proxima primeiro')
        .toEqual(['Bruna Costa', 'Pedro Alves']);
    await expect(page.locator('#inst-prontos-lista'), 'pronto sem data ainda nao foi agendado').toContainText('Sem Data Ltda');
    await expect(page.locator('#inst-prontos-count')).toHaveText('1 pedido');
    expect(await nomes(page, 'inst-real-lista')).toEqual(['Rita Instalada']);
    await expect(page.locator('#pcp-view-agenda')).not.toContainText('Orçamento Fora');
});

test('instalacoes: em cima, o formulario fica ao lado do painel; embaixo, as colunas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await abrir(page, 'agenda');
    const [pr, fo, di, co] = await Promise.all(['.agd-prontos', '#inst-form', '#inst-disp', '#agenda-container']
        .map(s => page.locator('#pcp-view-agenda ' + s).boundingBox()));
    expect(fo.y).toBeGreaterThan(pr.y + pr.height - 1);
    expect(Math.abs(fo.y - di.y), 'lado a lado').toBeLessThan(3);
    expect(di.x).toBeGreaterThan(fo.x + fo.width - 1);
    expect(co.y).toBeGreaterThan(Math.max(fo.y + fo.height, di.y + di.height) - 1);
});

test('instalacoes: a busca aceita o numero do pedido', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.fill('#inst-pend-busca', '26010');
    expect(await nomes(page, 'inst-pend-lista')).toEqual(['Pedro Alves']);
});

test('instalacoes: confirmar com pagamento completo vai para Realizados como Instalado', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    await page.click('.agd-modal button:has-text("Confirmar instalação")');
    await page.click('#mpg-sim');
    await expect(page.locator('#inst-real-lista')).toContainText('Pedro Alves');
    await expect(page.locator('#inst-pend-lista')).not.toContainText('Pedro Alves');
    const p = (await lerPed(page)).find(x => x.id === 26010);
    expect(p.status).toBe('Instalado');
    expect(p.valor_recebido).toBe(1000);
    expect(p.data_instalado).toBeGreaterThan(0);
});

test('instalacoes: confirmar com saldo vai para Realizados como Aguardando Pagamento', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    await page.click('.agd-modal button:has-text("Confirmar instalação")');
    await page.click('#mpg-nao');
    await expect(page.locator('#inst-pend-lista')).not.toContainText('Pedro Alves');
    const linha = page.locator('#inst-real-lista .agd-item', { hasText: 'Pedro Alves' });
    await expect(linha.locator('.agd-pill')).toHaveText('Aguard. pagamento');
    expect((await lerPed(page)).find(x => x.id === 26010).status).toBe('Aguardando Pagamento');
});

test('instalacoes: reagendar muda a data do pedido e guarda o historico', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    await page.click('.agd-modal button:has-text("Reagendar")');
    await page.fill('#agdf-data', dia(0));
    await page.click('#agdf-salvar');
    await confirmar(page);   // "a alteracao reflete no pedido"
    expect((await nomes(page, 'inst-pend-lista'))[0]).toBe('Pedro Alves');
    const p = (await lerPed(page)).find(x => x.id === 26010);
    expect(p.data_entrega).toBe(dia(0));
    expect(p.inst_historico[0]).toMatchObject({ acao: 'reagendado', de: { data: dia(3) } });
    expect((await lerPed(page)).length, 'nenhum pedido novo').toBe(5);
});

test('instalacoes: cancelar o agendamento devolve o pedido aos prontos e registra', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Bruna Costa' }).click();
    await page.click('.agd-modal button:has-text("Cancelar agendamento")');
    await confirmar(page);
    await expect(page.locator('#inst-pend-lista')).not.toContainText('Bruna Costa');
    await expect(page.locator('#inst-prontos-lista')).toContainText('Bruna Costa');
    const p = (await lerPed(page)).find(x => x.id === 26011);
    expect(p.data_entrega).toBeNull();
    expect(p.inst_agendado).toBe(false);
    expect(p.status).toBe('Pronto p/ Instalação');
    expect(p.inst_historico[0]).toMatchObject({ acao: 'cancelado', de: { data: dia(1), hora: '15:00' } });
});

test('instalacoes: editar grava endereco e observacoes no pedido', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    await page.click('.agd-modal button:has-text("Editar")');
    await page.fill('#agdf-end', 'Rua Nova, 77');
    await page.fill('#agdf-obs', 'Levar escada');
    await page.click('#agdf-salvar');
    await expect(page.locator('#inst-pend-lista')).toContainText('Rua Nova, 77');
    const p = (await lerPed(page)).find(x => x.id === 26010);
    expect(p.inst_endereco).toBe('Rua Nova, 77');
    expect(p.inst_obs).toBe('Levar escada');
});

// --- Layout -----------------------------------------------------------------

test('em tela estreita as colunas empilham e nada transborda', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await abrir(page, 'medicoes');
    const [esq, dir] = await page.locator('#medicoes-container > .agd-col').evaluateAll(els => els.map(e => e.getBoundingClientRect()));
    expect(dir.top, 'Realizados abaixo de Agendamentos').toBeGreaterThan(esq.bottom - 1);
    const larg = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(larg[0]).toBeLessThanOrEqual(larg[1]);
});

test('o Kanban continua confirmando a entrega pelo mesmo desfecho', async ({ page }) => {
    await abrir(page, 'kanban');
    const r = await page.evaluate(() => {
        const p = { id: 1, status: 'Pronto p/ Instalação', valor: 50 };
        aplicarConfirmacaoEntrega(p, 'pago');
        const q = { id: 2, status: 'Pronto p/ Instalação', valor: 50 };
        aplicarConfirmacaoEntrega(q, 'pendente');
        return [p.status, p.valor_recebido, q.status];
    });
    expect(r).toEqual(['Instalado', 50, 'Aguardando Pagamento']);
    const fonte = await page.evaluate(() => fetch('js/app.js').then(r => r.text()));
    const mover = fonte.slice(fonte.indexOf('async function moverStatus'));
    const corpo = mover.slice(0, mover.search(/\r?\n\}\r?\n/) + 1);   // o arquivo e servido com CRLF
    expect(corpo, 'moverStatus usa a funcao compartilhada').toContain('aplicarConfirmacaoEntrega(ped, resultado)');
});

test('a linha segue a referencia: data e horario lado a lado, selo embaixo', async ({ page }) => {
    await abrir(page, 'medicoes');
    const item = page.locator('#med-pend-lista .agd-item').first();
    const [d, h, s] = await Promise.all([
        item.locator('.agd-quando-linha .agd-linha').nth(0).boundingBox(),
        item.locator('.agd-quando-linha .agd-linha').nth(1).boundingBox(),
        item.locator('.agd-pill').boundingBox(),
    ]);
    expect(Math.abs(d.y - h.y), 'mesma linha').toBeLessThan(3);
    expect(s.y, 'selo abaixo').toBeGreaterThan(d.y + d.height - 1);
});

// --- Cache ------------------------------------------------------------------

test('todas as paginas pedem CSS e JS com a mesma versao', async () => {
    // Sem ?v= o navegador reaproveita o style.css antigo e a tela nova aparece
    // sem estilo. Ao publicar mudanca de CSS/JS, troque a versao em todas.
    const fs = require('node:fs'), path = require('node:path');
    const raiz = path.join(__dirname, '..', '..');
    const versoes = new Set(), semVersao = [];
    for (const f of fs.readdirSync(raiz).filter(n => n.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(raiz, f), 'utf8');
        for (const m of html.matchAll(/(?:href|src)="((?:css|js)\/[\w-]+\.(?:css|js))(\?v=[\w-]+)?"/g)) {
            if (!m[2]) semVersao.push(`${f}: ${m[1]}`);
            else versoes.add(m[2]);
        }
    }
    expect(semVersao, 'arquivo local sem versao').toEqual([]);
    expect([...versoes].length, 'uma versao so').toBe(1);
});

// --- Kanban acompanha a agenda sem recarregar ----------------------------------

const colunaKanban = (page, titulo) => page.locator('.kanban-col', { has: page.locator('.kanban-col-header', { hasText: titulo }) });

test('confirmar na agenda move o card do Kanban sem recarregar a pagina', async ({ page }) => {
    await abrir(page, 'kanban');
    await expect(colunaKanban(page, 'Pronto p/ Instalação')).toContainText('Pedro Alves');
    await page.evaluate(() => { window.__semRecarga = true; });

    await page.click('#tab-btn-agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    await page.click('.agd-modal button:has-text("Confirmar instalação")');
    await page.click('#mpg-sim');
    await page.click('#tab-btn-kanban');

    await expect(colunaKanban(page, 'Instalado')).toContainText('Pedro Alves');
    await expect(colunaKanban(page, 'Pronto p/ Instalação')).not.toContainText('Pedro Alves');
    expect(await page.evaluate(() => window.__semRecarga), 'a pagina nao recarregou').toBe(true);
});

test('confirmar com saldo leva o card para Aguardando Pagamento', async ({ page }) => {
    await abrir(page, 'agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedro Alves' }).click();
    await page.click('.agd-modal button:has-text("Confirmar instalação")');
    await page.click('#mpg-nao');
    await page.click('#tab-btn-kanban');
    await expect(colunaKanban(page, 'Aguardando Pagamento')).toContainText('Pedro Alves');
    await expect(colunaKanban(page, 'Pronto p/ Instalação')).not.toContainText('Pedro Alves');
});
