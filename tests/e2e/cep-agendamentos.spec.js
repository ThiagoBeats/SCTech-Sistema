// CEP e endereco em partes na medicao e na instalacao (e nas janelas Editar). As APIs de CEP sao sempre simuladas.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}
const lerLS = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c)), k);
const VIACEP_OK = { cep: '80020-310', logradouro: 'Rua XV de Novembro', bairro: 'Centro', localidade: 'Curitiba', uf: 'PR' };
const viacep = page => page.route('https://viacep.com.br/**', r => r.fulfill({ json: VIACEP_OK }));

const CLI_NOVO = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', cep: '80010000', rua: 'Rua das Flores', numero: '10', complemento: 'apto 2',
    bairro: 'Batel', cidade: 'Curitiba', uf: 'PR', end: 'Rua das Flores, 10, apto 2, Batel' }];
const CLI_ANTIGO = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Rua X, 10', cidade: 'Curitiba' }];
const PED = extra => Object.assign({ id: 26200, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Pronto p/ Instalação', inst_agendado: false, valor: 900, amb: 'Sala' }, extra);

test('medicao: partes vem do cliente, CEP novo busca e grava na medicao sem mudar o cliente', async ({ page }) => {
    await viacep(page);
    await entrar(page, BASE, { sc_cli: CLI_NOVO() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-cliente-id', '1');
    await expect(page.locator('#med-cep')).toHaveValue('80010-000');
    await expect(page.locator('#med-rua')).toHaveValue('Rua das Flores');
    await expect(page.locator('#med-numero')).toHaveValue('10');
    await expect(page.locator('#med-bairro')).toHaveValue('Batel');
    await expect(page.locator('#med-uf')).toHaveValue('PR');
    await page.fill('#med-cep', '80.020-310');
    await page.click('#med-buscar-cep');
    await expect(page.locator('#med-rua')).toHaveValue('Rua XV de Novembro');
    await page.fill('#med-numero', '55');
    await page.fill('#med-data', dia(2));
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-pend-lista')).toContainText('Rua XV de Novembro');
    const m = (await lerLS(page, 'sc_med'))[0];
    expect(m).toMatchObject({ cep: '80020310', rua: 'Rua XV de Novembro', numero: '55', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' });
    expect(m.endereco).toBe('Rua XV de Novembro, 55, apto 2, Centro');
    expect((await lerLS(page, 'sc_cli'))[0].rua).toBe('Rua das Flores');
});

test('medicao: sem rua pede o endereco; cliente antigo vira Rua = texto antigo', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI_ANTIGO() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-cliente-id', '1');
    await expect(page.locator('#med-rua')).toHaveValue('Rua X, 10');
    await expect(page.locator('#med-cidade')).toHaveValue('Curitiba');
    await page.fill('#med-rua', '');
    await page.fill('#med-cidade', '');
    await page.fill('#med-data', dia(2));
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#med-pend-lista')).toContainText('Rua X, 10');
});

test('medicao: cliente sem endereco e rua vazia mostra o aviso', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: [{ id: 1, nome: 'Sem Endereco' }] });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-cliente-id', '1');
    await page.fill('#med-data', dia(2));
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('#sc-modal-msg')).toContainText('Informe o endereço da visita.');
    expect(await lerLS(page, 'sc_med')).toEqual([]);
});

test('editar medicao: partes aparecem e o Buscar endereco funciona', async ({ page }) => {
    await viacep(page);
    const med = { id: 5, clienteId: 1, clienteNome: 'Ana Paula Lima', endereco: 'Rua das Flores, 10', rua: 'Rua das Flores', numero: '10', cidade: 'Curitiba', cep: '', complemento: '', bairro: '', uf: 'PR', data: dia(2), status: 'Agendado' };
    await entrar(page, BASE, { sc_cli: CLI_NOVO(), sc_med: [med] });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.locator('#med-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.click('.agd-modal button:has-text("Editar")');
    await expect(page.locator('#agdf-end-rua')).toHaveValue('Rua das Flores');
    await expect(page.locator('#agdf-end-cidade')).toHaveValue('Curitiba');
    await page.fill('#agdf-end-cep', '80020310');
    await page.click('#agdf-end-buscar-cep');
    await expect(page.locator('#agdf-end-rua')).toHaveValue('Rua XV de Novembro');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerLS(page, 'sc_med'))[0].rua).toBe('Rua XV de Novembro');
    const m = (await lerLS(page, 'sc_med'))[0];
    expect(m).toMatchObject({ cep: '80020310', bairro: 'Centro', uf: 'PR', endereco: 'Rua XV de Novembro, 10, Centro' });
});

test('instalacao: partes vem do cliente e gravam inst_*; editar a instalacao muda as partes', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI_NOVO(), sc_ped: [PED()] });
    await page.goto(BASE + '/pcp.html?view=agenda');
    await page.locator('#inst-prontos-lista .agd-pronto', { hasText: '#26200' }).click();
    await expect(page.locator('#inst-rua')).toHaveValue('Rua das Flores');
    await expect(page.locator('#inst-cep')).toHaveValue('80010-000');
    await page.selectOption('#inst-prof', 'u:1');
    await page.fill('#inst-data', dia(2));
    await page.fill('#inst-hora', '10:00');
    await page.click('#inst-btn-agendar');
    await expect.poll(async () => (await lerLS(page, 'sc_ped'))[0].inst_rua).toBe('Rua das Flores');
    const p = (await lerLS(page, 'sc_ped'))[0];
    expect(p).toMatchObject({ inst_cep: '80010000', inst_numero: '10', inst_bairro: 'Batel', inst_cidade: 'Curitiba', inst_uf: 'PR', inst_endereco: 'Rua das Flores, 10, apto 2, Batel' });
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.locator('.agd-modal button', { hasText: 'Editar' }).click();
    await expect(page.locator('#agdf-end-rua')).toHaveValue('Rua das Flores');
    await page.fill('#agdf-end-numero', '99');
    await page.click('#agdf-salvar');
    await expect.poll(async () => (await lerLS(page, 'sc_ped'))[0].inst_numero).toBe('99');
});

test('instalacao: pedido antigo com endereco diferente vira Rua = texto e nao herda a cidade do cliente', async ({ page }) => {
    const ped = PED({ inst_agendado: true, data_entrega: dia(2), inst_hora: '10:00', inst_endereco: 'Rua Outra, 99', usuario_instalacao_id: 1 });
    await entrar(page, BASE, { sc_cli: CLI_ANTIGO(), sc_ped: [ped] });
    await page.goto(BASE + '/pcp.html?view=agenda');
    await page.locator('#inst-pend-lista .agd-item', { hasText: 'Ana Paula Lima' }).click();
    await page.locator('.agd-modal button', { hasText: 'Editar' }).click();
    await expect(page.locator('#agdf-end-rua')).toHaveValue('Rua Outra, 99');
    await expect(page.locator('#agdf-end-cidade')).toHaveValue('');
});

test('editar o pedido (salvarPedido) mantem inst_cep ate inst_uf', async ({ page }) => {
    const ped = { id: 26020, clienteId: 1, clienteNome: 'Ana Paula Lima', status: 'Orçamento', valor: 10, vendedor_id: 1,
        ambientes: [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }], itens: [],
        inst_agendado: true, inst_cep: '80010000', inst_rua: 'Rua das Flores', inst_numero: '10', inst_complemento: 'apto 2',
        inst_bairro: 'Batel', inst_cidade: 'Curitiba', inst_uf: 'PR', inst_endereco: 'Rua das Flores, 10, apto 2, Batel' };
    await entrar(page, BASE, { sc_ped: [ped], sc_vend: [{ id: 1, nome: 'Ana', comissao_pct: 5 }], sc_cli: CLI_NOVO(), sc_editando_id: 26020 });
    await page.goto(BASE + '/pedido.html');
    await page.selectOption('#ped-vendedor', '1');
    await page.evaluate(() => { pedidoDraft.ambientes.forEach(a => { a.calculado = true; }); salvarPedido(); });
    await page.waitForURL(/index\.html/);
    const p = (await lerLS(page, 'sc_ped'))[0];
    expect(p).toMatchObject({ inst_cep: '80010000', inst_rua: 'Rua das Flores', inst_numero: '10', inst_complemento: 'apto 2', inst_bairro: 'Batel', inst_cidade: 'Curitiba', inst_uf: 'PR' });
});
