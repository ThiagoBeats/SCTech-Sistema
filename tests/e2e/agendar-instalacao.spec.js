// Kanban: Na Costura -> Pronto p/ Instalacao abre o popup de agendamento.
// "Quem vai instalar" aceita usuario cadastrado ou nome digitado, e fechar o
// popup sem escolher (Cancelar, clique fora, Esc) nao move o pedido nem baixa
// materiais.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}

const PED = () => [
    { id: 26100, clienteId: 1, clienteNome: 'Costura Sem Item', status: 'Na Costura', valor: 500, amb: 'Sala' },
    { id: 26101, clienteId: 1, clienteNome: 'Costura Com Item', status: 'Na Costura', valor: 700, amb: 'Quarto',
      itens: [{ materialId: 1, nome: 'Trilho', quantidade: 2, unidade: 'un' }] },
];
const MAT = () => [{ id: 1, nome: 'Trilho', unidade: 'un', estoque_atual: 10 }];

async function abrir(page) {
    await entrar(page, BASE, {
        sc_ped: PED(), sc_mat: MAT(),
        sc_cli: [{ id: 1, nome: 'Cliente', end: 'Rua A, 1' }],
    });
    await page.goto(BASE + '/pcp.html?view=kanban');
}

const lerPed = async (page, id) => (await page.evaluate(() => JSON.parse(localStorage.getItem('sc_ped')))).find(p => p.id === id);
const lerMat = async page => (await page.evaluate(() => JSON.parse(localStorage.getItem('sc_mat'))))[0];

async function avancar(page, cliente) {
    await page.locator('.kanban-card', { hasText: cliente }).locator('button[title="Avançar etapa"]').click();
    await expect(page.locator('#mai-data')).toBeVisible();
}

test('instalador digitado (nao cadastrado) fica gravado como nome', async ({ page }) => {
    await abrir(page);
    await avancar(page, 'Costura Sem Item');
    await page.fill('#mai-data', dia(4));
    await page.fill('#mai-usuario', 'Zé Terceirizado');
    await page.click('#mai-salvar');
    await expect.poll(async () => (await lerPed(page, 26100)).status).toBe('Pronto p/ Instalação');
    const p = await lerPed(page, 26100);
    expect(p.instalador_nome).toBe('Zé Terceirizado');
    expect(p.usuario_instalacao_id).toBeNull();
    expect(p.data_entrega).toBe(dia(4));
});

test('nome igual ao de um usuario vira o id dele', async ({ page }) => {
    await abrir(page);
    await avancar(page, 'Costura Sem Item');
    await page.fill('#mai-data', dia(4));
    await page.fill('#mai-usuario', 'teste');
    await page.click('#mai-salvar');
    await expect.poll(async () => (await lerPed(page, 26100)).status).toBe('Pronto p/ Instalação');
    const p = await lerPed(page, 26100);
    expect(p.usuario_instalacao_id).toBe(1);
    expect(p.instalador_nome).toBe('');
});

for (const [nome, fechar] of [
    ['Cancelar',     page => page.click('#mai-cancelar')],
    ['clique fora',  page => page.mouse.click(5, 5)],
    ['Esc',          page => page.keyboard.press('Escape')],
]) {
    test(`fechar com ${nome} nao move o pedido nem baixa material`, async ({ page }) => {
        await abrir(page);
        await avancar(page, 'Costura Com Item');
        await fechar(page);
        await expect(page.locator('#mai-data')).toHaveCount(0);
        await expect(page.locator('#sc-modal-ok')).toBeHidden();   // nao pergunta da baixa
        const p = await lerPed(page, 26101);
        expect(p.status).toBe('Na Costura');
        expect(p.baixa_mat_realizada).toBeFalsy();
        expect((await lerMat(page)).estoque_atual).toBe(10);
    });
}

test('"Avançar sem agendar" ainda move o pedido', async ({ page }) => {
    await abrir(page);
    await avancar(page, 'Costura Sem Item');
    await page.click('#mai-pular');
    await expect.poll(async () => (await lerPed(page, 26100)).status).toBe('Pronto p/ Instalação');
});

test('agenda de instalacoes mostra e edita o instalador digitado', async ({ page }) => {
    await entrar(page, BASE, {
        sc_ped: [{ id: 26110, clienteId: 1, clienteNome: 'Pedido Agenda', status: 'Pronto p/ Instalação', valor: 100, data_entrega: dia(2), instalador_nome: 'Zé Terceirizado' }],
        sc_cli: [{ id: 1, nome: 'Cliente' }],
    });
    await page.goto(BASE + '/pcp.html?view=agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Pedido Agenda' }).click();
    await expect(page.locator('.agd-modal')).toContainText('Zé Terceirizado');
    await page.click('.agd-modal button:has-text("Editar")');
    await expect(page.locator('#agdf-usu')).toHaveValue('Zé Terceirizado');
    await page.fill('#agdf-usu', 'Outro Instalador');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerPed(page, 26110)).instalador_nome).toBe('Outro Instalador');
});
