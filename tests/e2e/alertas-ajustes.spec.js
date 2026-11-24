// Ajustes nos alertas: abrir o sino zera a contagem, alertas do Financeiro no sino e no card,
// texto de "Só as urgentes" e pedido sem repetir entre Instalações e Entregas. Relogio fixo.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const USU = () => [
    { id: 1, nome: 'Teste', email: 'teste@sctech.local', papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: '' },
    { id: 2, nome: 'Sem Financeiro', email: 'sem@sctech.local', papel_id: 4, ativo: true, permissoes_extras: {}, senha_hash: '' },
];
const badge = page => page.locator('#topbar-sino .sino-badge');
const painel = page => page.locator('#sino-painel');

async function abrir(page, dados, pagina) {
    await page.clock.install({ time: new Date(2026, 10, 18, 12, 0) });
    await entrar(page, BASE, { sc_usr: USU(), ...dados });
    await page.goto(BASE + '/' + (pagina || 'index.html'));
}
const ped = (id, nome, status, data) => ({ id, clienteNome: nome, status, data_entrega: data, itens: [] });
const contaAtrasada = { id: 1, cliente_nome: 'Cliente Devedor', valor: 500, status: 'Pendente', data_vencimento: '2026-11-10' };
const contaHoje = { id: 2, cliente_nome: 'Outro', valor: 100, status: 'Pendente', data_vencimento: '2026-11-18' };

test('1. abrir o sino zera a contagem e os itens continuam listados, sem destaque', async ({ page }) => {
    await abrir(page, { sc_ped: [ped(26001, 'Joao Atrasado', 'Em Produção', '2026-11-10')],
        sc_med: [{ id: 501, clienteNome: 'Maria Medida', status: 'Agendado', data: '2026-11-17', hora: '09:00' }] });
    await expect(badge(page)).toHaveText('2');
    await page.hover('#sino-btn');
    await expect(badge(page)).toHaveCount(0);
    await expect(painel(page).locator('.sino-item')).toHaveCount(2);
    // aberto: a contagem zerou, mas os novos seguem destacados ate o painel fechar
    await expect(painel(page).locator('.sino-item.novo')).toHaveCount(2);
    await page.mouse.move(5, 400);
    await expect(painel(page).locator('.sino-item.novo')).toHaveCount(0);
    await expect(page.locator('#sino-marcar')).toHaveCount(0);
    await page.reload();
    await expect(badge(page)).toHaveCount(0);
    await page.hover('#sino-btn');
    await expect(painel(page).locator('.sino-item')).toHaveCount(2);
});

test('1b. item de aceite fica listado depois de visto, mas deixa de contar', async ({ page }) => {
    await abrir(page, { sc_med: [{ id: 700, clienteNome: 'Maria Medida', status: 'Agendado', data: '2026-11-25', hora: '10:00', usuario_id: 1,
        aceite: { status: 'pendente', por: 2, em: 1 } }] });
    await expect(badge(page)).toHaveText('1');
    await page.hover('#sino-btn');
    await expect(badge(page)).toHaveCount(0);
    await expect(painel(page)).toContainText('Você recebeu a medição');
    await expect(painel(page).locator('.sino-acao')).toHaveCount(2);
});

test('2. conta vencida aparece no sino e no card para o Admin, nao para quem nao tem Financeiro', async ({ page }) => {
    await abrir(page, { sc_cr: [contaAtrasada] });
    await expect(badge(page)).toHaveText('1');
    await expect(page.locator('#dashboard-alertas')).toContainText('1 recebimento(s) em atraso');
    await page.hover('#sino-btn');
    await expect(painel(page)).toContainText('1 recebimento(s) em atraso — R$ 500,00 de 1 cliente(s)');
    await expect(painel(page).locator('.sino-item').first()).toHaveAttribute('data-href', 'financeiro.html?aba=receber');
    // o link do alerta abre a aba A Receber
    await page.goto(BASE + '/financeiro.html?aba=receber');
    await expect(page.locator('.fin-lado-btn[data-lado="receber"]')).toHaveClass(/active/);
    // usuario sem acesso ao Financeiro (papel Producao/Costura): nada
    await page.evaluate(() => sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'sem@sctech.local' })));
    await page.goto(BASE + '/index.html');
    expect(await page.evaluate(() => temAcessoAlgumaSub('financeiro', 'visualizar'))).toBe(false);
    await expect(badge(page)).toHaveCount(0);
    await page.hover('#sino-btn');
    await expect(painel(page)).not.toContainText('em atraso');
});

test('2b. desligar o tipo tira o alerta; os outros tipos continuam', async ({ page }) => {
    await abrir(page, { sc_cr: [contaAtrasada, contaHoje], sc_alertas_cfg: { fin_atraso: false } });
    await page.hover('#sino-btn');
    await expect(painel(page)).toContainText('1 conta(s) vencem hoje');
    await expect(painel(page)).not.toContainText('em atraso');
    await page.evaluate(() => localStorage.setItem('sc_alertas_cfg', JSON.stringify({ fin_atraso: false, fin_vencimento: false })));
    await page.reload();
    await page.hover('#sino-btn');
    await expect(painel(page)).not.toContainText('vencem hoje');
    await expect(painel(page)).toContainText('Nenhuma notificação no momento.');
});

test('2c. gap de caixa e atraso sao urgentes; vencimento de hoje nao', async ({ page }) => {
    await abrir(page, { sc_cr: [contaAtrasada, contaHoje],
        sc_cp: [{ id: 3, descricao: 'Aluguel', valor: 900, status: 'Pendente', data_vencimento: '2026-11-20' }],
        sc_usr: USU().map(u => u.id === 1 ? { ...u, preferencias: { notificacoes: 'urgentes' } } : u) });
    await page.hover('#sino-btn');
    await expect(painel(page)).toContainText('recebimento(s) em atraso');
    await expect(painel(page)).toContainText('Gap de caixa');
    await expect(painel(page)).not.toContainText('vencem hoje');
});

test('3. o texto de "Só as urgentes" descreve o que ela mostra', async ({ page }) => {
    await abrir(page, {}, 'configuracoes.html#preferencias');
    const opcao = page.locator('label.cfg-opcao', { hasText: 'Só as urgentes' });
    await expect(opcao).toContainText('Só o que está atrasado, os lembretes de compromisso, os pedidos de aceite e as respostas de recusa ou sem resposta, e os alertas financeiros de atraso e de falta de caixa.');
});

test('4. pedido em Instalacoes atrasadas nao repete em Entregas atrasadas (nem hoje)', async ({ page }) => {
    await abrir(page, { sc_ped: [
        ped(26010, 'Cliente Instalar', 'Pronto p/ Instalação', '2026-11-10'),
        ped(26011, 'Cliente Producao', 'Em Produção', '2026-11-10'),
        ped(26012, 'Instalar Hoje', 'Pronto p/ Instalação', '2026-11-18'),
        ped(26013, 'Producao Hoje', 'Em Produção', '2026-11-18'),
    ] });
    const card = page.locator('#dashboard-alertas');
    const faixa = nome => card.locator('[data-chave]', { hasText: nome });
    await expect(faixa('entrega(s) atrasada(s)')).toContainText('Cliente Producao');
    await expect(faixa('entrega(s) atrasada(s)')).not.toContainText('Cliente Instalar');
    await expect(faixa('instalação(ões) atrasada(s)')).toContainText('Cliente Instalar');
    await expect(faixa('entrega prevista para hoje')).toContainText('Producao Hoje');
    await expect(faixa('entrega prevista para hoje')).not.toContainText('Instalar Hoje');
    await expect(faixa('agendada(s) para hoje')).toContainText('Instalar Hoje');
    // com o alerta de instalacoes desligado, o pedido volta para Entregas (nao fica sem aviso)
    await page.evaluate(() => localStorage.setItem('sc_alertas_cfg', JSON.stringify({ instalacao: false })));
    await page.reload();
    await expect(faixa('entrega(s) atrasada(s)')).toContainText('Cliente Instalar');
});
