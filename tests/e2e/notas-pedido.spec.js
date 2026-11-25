// Entrega 4 (notas fiscais), tarefa 2: janela "Notas fiscais" no pedido, modo manual
// (conferir, anexar XML/PDF, ver PDF, baixar XML, cancelar, historico), tipo padrao na empresa e backup.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { entrar, acaoMenu } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8260';
const HOJE = new Date('2026-11-25T12:00:00');
const FIX = n => path.join(__dirname, '..', 'fixtures', n);
const MSG_MANUAL = 'Emita esta nota no sistema da prefeitura/SEFAZ ou do seu contador e anexe aqui o XML e o PDF.';
const MSG_PDF = 'Arquivo grande demais para guardar no navegador. Guarde o PDF no computador e anexe só o XML.';
const MSG_ESPACO = 'Não foi possível salvar: o espaço do navegador acabou. Baixe uma cópia de segurança e libere espaço.';
const PDF_PEQ = { name: 'nota.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') };
const PDF_GRANDE = { name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(1258291, 65) };

const CLIENTES = [{ id: 1, nome: 'Maria da Silva', cpf: '123.456.789-09', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Campinas', uf: 'SP', cep: '13000-000', email: 'maria@x.com' }];
const PEDIDOS = () => [
    { id: 26401, clienteId: 1, clienteNome: 'Maria da Silva', status: 'Medição', valor: 3450, amb: 'Sala', ambientes: [{ amb: 'Sala', tecidos: [{ tecidoNome: 'Linho' }] }] },
    { id: 26402, clienteId: 1, clienteNome: 'Maria da Silva', status: 'Na Costura', valor: 3450, amb: 'Quarto' },
    { id: 26403, clienteId: 1, clienteNome: 'Maria da Silva', status: 'Orçamento', valor: 500, amb: 'Cozinha' },
];
const EMPRESA = { razao_social: 'CORTINAS EXEMPLO LTDA', nome_fantasia: 'Cortinas Exemplo', cnpj: '12.345.678/0001-95' };

async function abrir(page, extras, url) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(HOJE);
    await entrar(page, BASE, Object.assign({ sc_ped: PEDIDOS(), sc_cli: CLIENTES, sc_empresa: EMPRESA }, extras || {}));
    await page.goto(BASE + (url || '/pedidos.html'));
}
const menuPed = (page, id) => page.locator(`button[aria-label="Ações do pedido #${id}"]`);
async function abrirJanela(page, id) {
    await menuPed(page, id).click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Notas fiscais' }).click();
    await expect(page.locator('#nf-janela')).toBeVisible();
}
async function emitir(page, id) {
    await abrirJanela(page, id);
    await page.locator('#nf-btn-emitir').click();
    await expect(page.locator('#nf-emitir')).toBeVisible();
}
const ler = (page, k) => page.evaluate(c => JSON.parse(localStorage.getItem(c) || 'null'), k);
const notas = async page => (await ler(page, 'sc_nf')) || [];

test('menu do pedido: Notas fiscais para pedido aprovado, nao para Orcamento', async ({ page }) => {
    await abrir(page);
    await menuPed(page, 26401).click();
    await expect(page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Notas fiscais' })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await menuPed(page, 26403).click();
    await expect(page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Notas fiscais' })).toHaveCount(0);
});

test('menu do Kanban tambem tem Notas fiscais', async ({ page }) => {
    await abrir(page, null, '/pcp.html?view=kanban');
    const c = page.locator('.kanban-card', { hasText: 'Maria da Silva' }).first();
    await acaoMenu(page, c, 'Notas fiscais');
    await expect(page.locator('#nf-janela')).toBeVisible();
    await expect(page.locator('#nf-janela h3')).toContainText('Notas fiscais — Pedido #');
});

test('Emitir nota mostra tomador, itens, aviso exato e botoes; salvar fica travado sem XML', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await expect(page.locator('#nf-aviso-manual')).toHaveText(MSG_MANUAL);
    await expect(page.locator('#nf-tipo')).toHaveValue('nfse');
    await expect(page.locator('#nf-tom-nome')).toHaveValue('Maria da Silva');
    await expect(page.locator('#nf-tom-doc')).toHaveValue('12345678909');
    await expect(page.locator('#nf-tom-cidade')).toHaveValue('Campinas');
    await expect(page.locator('#nf-tom-uf')).toHaveValue('SP');
    await expect(page.locator('#nf-itens .nf-item')).toHaveCount(1);
    await expect(page.locator('#nf-itens .nf-item-desc').first()).toHaveValue(/Cortina — Sala \(Linho\)/);
    await expect(page.locator('#nf-total')).toHaveText('3.450,00');
    await expect(page.locator('#nf-copiar')).toBeVisible();
    await expect(page.locator('#nf-imprimir')).toBeVisible();
    await expect(page.locator('#nf-salvar')).toBeDisabled();
});

test('Copiar dados leva o texto para a area de transferencia', async ({ page }) => {
    await page.addInitScript(() => { window.__copiado = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copiado = t; return Promise.resolve(); } }, configurable: true }); });
    await abrir(page);
    await emitir(page, 26401);
    await page.locator('#nf-copiar').click();
    await expect.poll(() => page.evaluate(() => window.__copiado)).toContain('Maria da Silva');
    expect(await page.evaluate(() => window.__copiado)).toContain('TOTAL: R$ 3.450,00');
});

test('anexar NFS-e ABRASF preenche numero e data, confere e salva com historico', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await expect(page.locator('#nf-numero')).toHaveValue('456');
    await expect(page.locator('#nf-serie')).toHaveValue('A1');
    await expect(page.locator('#nf-data')).toHaveValue('22/11/2026');
    await expect(page.locator('#nf-valor')).toHaveValue('3.450,00');
    await expect(page.locator('#nf-avisos .nf-aviso')).toHaveCount(0);
    await expect(page.locator('#nf-salvar')).toBeEnabled();
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#nf-emitir')).toHaveCount(0);
    const linha = page.locator('#nf-janela .nf-linha');
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText('NFS-e');
    await expect(linha).toContainText('Nº 456');
    await expect(linha).toContainText('22/11/2026');
    await expect(linha).toContainText('R$ 3.450,00');
    await expect(linha.locator('.nf-selo')).toHaveText('Autorizada');
    const nf = await ler(page, 'sc_nf');
    expect(nf).toHaveLength(1);
    expect(nf[0]).toMatchObject({ pedido_id: 26401, tipo: 'nfse', numero: '456', codigo_verificacao: 'ABCD1234', status: 'autorizada', origem: 'manual', cliente_id: 1, xml_nome: 'nfse-abrasf.xml', pdf: null });
    expect(nf[0].eventos[0]).toMatchObject({ tipo: 'anexada', detalhe: expect.stringContaining('Nota anexada'), por: 'Teste' });
    await linha.getByRole('button', { name: 'Histórico' }).click();
    await expect(page.locator('#nf-historico')).toContainText('Nota anexada');
    await expect(page.locator('#nf-historico')).toContainText('25/11/2026');
});

test('valor diferente do pedido: mostra aviso, deixa salvar e o aviso fica no historico', async ({ page }) => {
    await abrir(page, { sc_ped: PEDIDOS().map(p => p.id === 26401 ? { ...p, valor: 3000 } : p) });
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await expect(page.locator('#nf-avisos .nf-aviso')).toContainText('O valor da nota (R$ 3.450,00) é diferente do valor do pedido (R$ 3.000,00).');
    await expect(page.locator('#nf-salvar')).toBeEnabled();
    await page.locator('#nf-salvar').click();
    const nf = await ler(page, 'sc_nf');
    expect(nf[0].eventos.map(e => e.detalhe).join('|')).toContain('é diferente do valor do pedido');
    expect(nf[0].eventos.some(e => e.tipo === 'aviso')).toBe(true);
});

test('XML que nao e nota: mensagem e nao deixa salvar', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', { name: 'x.xml', mimeType: 'text/xml', buffer: Buffer.from('<?xml version="1.0"?><pedido><item>1</item></pedido>') });
    await expect(page.locator('#nf-msg-xml')).toHaveText('Este arquivo não é o XML de uma nota fiscal.');
    await expect(page.locator('#nf-salvar')).toBeDisabled();
    await page.setInputFiles('#nf-xml', { name: 'y.xml', mimeType: 'text/xml', buffer: Buffer.from('texto qualquer') });
    await expect(page.locator('#nf-msg-xml')).toHaveText('Este arquivo não é o XML de uma nota fiscal.');
    expect(await notas(page)).toEqual([]);
});

test('mesmo XML em outro pedido: "Esta nota ja esta anexada ao pedido #N." e nao salva', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#nf-emitir')).toHaveCount(0);
    await page.locator('#nf-janela .modal-close').click();
    await emitir(page, 26402);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await expect(page.locator('#nf-msg-xml')).toHaveText('Esta nota já está anexada ao pedido #26401.');
    await expect(page.locator('#nf-salvar')).toBeDisabled();
    expect(await ler(page, 'sc_nf')).toHaveLength(1);
});

test('PDF de 1,2 MB e recusado com o texto exato', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-pdf', PDF_GRANDE);
    await expect(page.locator('#nf-msg-pdf')).toHaveText(MSG_PDF);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#nf-janela .nf-linha')).toHaveCount(1);
    expect((await ler(page, 'sc_nf'))[0].pdf).toBeNull();
});

test('Ver PDF abre em nova aba; sem PDF oferece anexar', async ({ page }) => {
    await page.addInitScript(() => { window.__abertos = []; window.open = (u) => { window.__abertos.push(u); return {}; }; });
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Ver PDF' }).click();
    const abertos = await page.evaluate(() => window.__abertos);
    expect(abertos).toHaveLength(1);
    expect(abertos[0]).toMatch(/^blob:/);
    const conteudo = await page.evaluate(async u => (await (await fetch(u)).text()).slice(0, 8), abertos[0]);
    expect(conteudo).toBe('%PDF-1.4');
    // nota sem PDF
    await page.locator('#nf-janela .modal-close').click();
    await emitir(page, 26402);
    await page.setInputFiles('#nf-xml', FIX('nfe-venda.xml'));
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Ver PDF' }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('PDF não anexado.');
    await page.getByRole('button', { name: 'Anexar PDF' }).click();
    await page.setInputFiles('#nf-anexo-pdf', PDF_PEQ);
    await page.locator('#nf-anexo-salvar').click();
    await expect(page.locator('#nf-anexar')).toHaveCount(0);
    const nf = await ler(page, 'sc_nf');
    expect(nf.find(n => n.pedido_id === 26402).pdf_nome).toBe('nota.pdf');
});

test('Ver PDF com pop-up bloqueado avisa', async ({ page }) => {
    await page.addInitScript(() => { window.open = () => null; });
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Ver PDF' }).click();
    await expect(page.locator('.sc-toast', { hasText: 'bloqueou a nova aba' })).toBeVisible();
});

test('Baixar XML baixa o arquivo com o nome original', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#nf-janela').getByRole('button', { name: 'Baixar XML' }).click()]);
    expect(dl.suggestedFilename()).toBe('nfse-abrasf.xml');
});

test('Cancelar nota exige motivo, muda o selo e a nota continua na lista', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Cancelar nota' }).click();
    await page.locator('#nf-cancel-ok').click();
    await expect(page.locator('#nf-cancel-msg')).toHaveText('Informe o motivo do cancelamento.');
    expect((await ler(page, 'sc_nf'))[0].status).toBe('autorizada');
    await page.fill('#nf-cancel-motivo', 'Erro no valor');
    await page.locator('#nf-cancel-ok').click();
    await expect(page.locator('#nf-cancelar')).toHaveCount(0);
    const linha = page.locator('#nf-janela .nf-linha');
    await expect(linha.locator('.nf-selo')).toHaveText('Cancelada');
    await expect(linha.getByRole('button', { name: 'Cancelar nota' })).toHaveCount(0);
    const nf = await ler(page, 'sc_nf');
    expect(nf[0].status).toBe('cancelada');
    expect(nf[0].eventos.at(-1)).toMatchObject({ tipo: 'cancelada', detalhe: 'Erro no valor' });
});

test('duas notas no mesmo pedido', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-btn-emitir').click();
    await page.setInputFiles('#nf-xml', FIX('nfe-venda.xml'));
    await expect(page.locator('#nf-avisos .nf-aviso').first()).toContainText('valor');
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#nf-janela .nf-linha')).toHaveCount(2);
    expect(await ler(page, 'sc_nf')).toHaveLength(2);
});

test('sem espaco no navegador: mensagem do sistema e nada gravado', async ({ page }) => {
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (k === 'sc_nf' && window.__cheio) throw new DOMException('cheio', 'QuotaExceededError'); return orig.call(this, k, v); };
    });
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.evaluate(() => { window.__cheio = true; });
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG_ESPACO);
    await page.locator('#sc-modal-ok').click();
    expect(await notas(page)).toEqual([]);
    expect(await page.evaluate(() => db.notas_fiscais.length)).toBe(0);
    await expect(page.locator('#nf-emitir')).toBeVisible();
});

test('Configurar Empresa grava o tipo de nota padrao e a janela usa', async ({ page }) => {
    await abrir(page, null, '/empresa.html');
    await expect(page.locator('#emp-nota-tipo')).toHaveValue('nfse');
    await page.selectOption('#emp-nota-tipo', 'nfe');
    await page.evaluate(() => salvarEmpresaConfigs());
    expect((await ler(page, 'sc_empresa')).nota_tipo_padrao).toBe('nfe');
    await page.reload();
    await expect(page.locator('#emp-nota-tipo')).toHaveValue('nfe');
    await page.goto(BASE + '/pedidos.html');
    await emitir(page, 26401);
    await expect(page.locator('#nf-tipo')).toHaveValue('nfe');
});

test('usuario sem permissao ve as notas mas nao Emitir nem Cancelar', async ({ page }) => {
    await abrir(page, { sc_nf: [{ id: 1, pedido_id: 26401, tipo: 'nfse', numero: '9', serie: '', chave: null, codigo_verificacao: 'X', data_emissao: '2026-11-20', valor: 3450, cliente_id: 1, status: 'autorizada', protocolo: null, eventos: [], xml_nome: 'a.xml', xml: '<a/>', pdf_nome: '', pdf: null, origem: 'manual', criado_em: '2026-11-20T10:00:00Z', criado_por: 1 }] });
    await page.evaluate(() => {
        localStorage.setItem('sc_usr', JSON.stringify([{ id: 2, nome: 'Costura', email: 'c@sctech.local', papel_id: 4, ativo: true, permissoes_extras: {}, senha_hash: '' }]));
        sessionStorage.setItem('sc_user', JSON.stringify({ id: 2, email: 'c@sctech.local' }));
    });
    await page.goto(BASE + '/pedidos.html');
    await abrirJanela(page, 26401);
    await expect(page.locator('#nf-janela .nf-linha')).toHaveCount(1);
    await expect(page.locator('#nf-btn-emitir')).toHaveCount(0);
    await expect(page.locator('#nf-janela').getByRole('button', { name: 'Cancelar nota' })).toHaveCount(0);
    await expect(page.locator('#nf-janela').getByRole('button', { name: 'Histórico' })).toHaveCount(1);
});

test('backup leva as notas (exportar e importar)', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    const dados = await page.evaluate(() => JSON.parse(JSON.stringify(_dadosExportacao())));
    expect(dados.notas_fiscais).toHaveLength(1);
    await page.evaluate(() => { localStorage.removeItem('sc_nf'); });
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(json => importarDados({ target: { files: [new File([json], 'b.json')], value: '' } }), JSON.stringify(dados));
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    await page.waitForFunction(() => typeof db !== 'undefined');
    expect((await ler(page, 'sc_nf'))[0].numero).toBe('456');
});

test('390px sem rolagem horizontal e tema escuro legivel', async ({ page }) => {
    await abrir(page, { sc_ped: PEDIDOS().map(p => p.id === 26401 ? { ...p, valor: 3000 } : p) });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfe-venda.xml'));
    await expect(page.locator('#nf-avisos .nf-aviso').first()).toBeVisible();
    const larg = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, jan: document.documentElement.clientWidth, box: document.querySelector('#nf-emitir .nf-box').scrollWidth, boxw: document.querySelector('#nf-emitir .nf-box').clientWidth }));
    expect(larg.doc).toBeLessThanOrEqual(larg.jan);
    expect(larg.box).toBeLessThanOrEqual(larg.boxw);
    const cor = await page.locator('#nf-emitir .nf-box').evaluate(e => getComputedStyle(e).backgroundColor);
    expect(cor).not.toBe('rgb(255, 255, 255)');
});
