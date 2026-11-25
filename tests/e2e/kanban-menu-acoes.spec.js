// Painel de Producao: os icones de acao sairam do card; as mesmas acoes ficam
// no menu "⋮" (o mesmo das tabelas).
const { test, expect } = require('@playwright/test');
const { entrar, abrirMenuAcoes, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const ped = (id, nome, status, extra) => ({ id, clienteId: 1, clienteNome: nome, status, valor: 100, amb: 'Sala', ...(extra || {}) });
const PED = () => [
    ped(26301, 'Medida Ana', 'Medição'),
    ped(26302, 'Costura Bia', 'Na Costura'),
    ped(26303, 'Pronto Caio', 'Pronto p/ Instalação', { inst_agendado: true, data_entrega: '2030-01-10', inst_hora: '09:00' }),
    ped(26304, 'Instalado Duda', 'Instalado', { data_instalado: Date.now() }),
];

async function abrir(page, url) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, BASE, { sc_ped: PED(), sc_cli: [{ id: 1, nome: 'Ana' }] });
    await page.goto(BASE + (url || '/pcp.html?view=kanban'));
}
const card = (page, nome) => page.locator('.kanban-card', { hasText: nome });
const itens = async (page, escopo) => (await abrirMenuAcoes(page, escopo)).locator('.menu-acoes-item').allInnerTexts()
    .then(t => t.map(x => x.replace(/^\S+\s*/, '').trim()));

test('card sem icones de acao e com o botao ⋮', async ({ page }) => {
    await abrir(page);
    for (const n of ['Medida Ana', 'Costura Bia', 'Pronto Caio', 'Instalado Duda']) {
        const c = card(page, n);
        await expect(c.locator('.btn-kebab')).toHaveCount(1);
        await expect(c.locator('.btn-kebab')).toHaveText('⋮');
        for (const t of ['Ver Ordem de Serviço', 'Ver timeline', 'Notas fiscais', 'Avançar etapa', 'Voltar etapa', 'Voltar status', 'Imprimir etiquetas'])
            await expect(c.locator(`button[title="${t}"]`), `${n}: sem ${t}`).toHaveCount(0);
    }
    await expect(card(page, 'Medida Ana').locator('.kanban-card-id')).toHaveText('#26301');
});

test('menu lista as acoes de cada etapa', async ({ page }) => {
    await abrir(page);
    expect(await itens(page, card(page, 'Medida Ana'))).toEqual(['Ver Ordem de Serviço', 'Imprimir etiquetas', 'Ver timeline', 'Notas fiscais', 'Avançar etapa']);
    await page.keyboard.press('Escape');
    expect(await itens(page, card(page, 'Costura Bia'))).toEqual(['Ver Ordem de Serviço', 'Imprimir etiquetas', 'Ver timeline', 'Notas fiscais', 'Voltar etapa', 'Avançar etapa']);
    await page.keyboard.press('Escape');
    expect(await itens(page, card(page, 'Pronto Caio'))).toEqual(['Ver Ordem de Serviço', 'Imprimir etiquetas', 'Ver timeline', 'Notas fiscais', 'Voltar etapa', 'Avançar etapa']);
    await page.keyboard.press('Escape');
    expect(await itens(page, card(page, 'Instalado Duda'))).toEqual(['Ver Ordem de Serviço', 'Imprimir etiquetas', 'Ver timeline', 'Notas fiscais', 'Voltar etapa']);
});

test('Avançar etapa pelo menu muda o status', async ({ page }) => {
    await abrir(page);
    await acaoMenu(page, card(page, 'Costura Bia'), 'Avançar etapa');
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')))).find(p => p.id === 26302).status).toBe('Pronto p/ Instalação');
});

test('Ver Ordem de Serviço pelo menu abre o documento', async ({ page }) => {
    await abrir(page);
    await acaoMenu(page, card(page, 'Costura Bia'), 'Ver Ordem de Serviço');
    await expect(page.locator('#doc-modal-paper')).toBeVisible();
});

test('o menu abre sem acionar o card e fecha com Esc', async ({ page }) => {
    await abrir(page);
    await abrirMenuAcoes(page, card(page, 'Medida Ana'));
    await expect(page.locator('#menu-acoes-flutuante')).toBeVisible();
    await expect(page.locator('#sc-modal-msg')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-acoes-flutuante')).toHaveCount(0);
});
