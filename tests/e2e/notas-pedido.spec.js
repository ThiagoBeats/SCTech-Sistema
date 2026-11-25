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
    expect(nf[0]).toMatchObject({ pedido_id: 26401, tipo: 'nfse', numero: '456', codigo_verificacao: 'ABCD1234', status: 'autorizada', origem: 'manual', cliente_id: 1, xml_nome: 'nfse-abrasf.xml', tem_pdf: false });
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
    expect((await ler(page, 'sc_nf'))[0].tem_pdf).toBe(false);
});

test('Ver PDF abre em nova aba; sem PDF oferece anexar', async ({ page }) => {
    await page.addInitScript(() => { window.__abertos = []; window.open = (u) => { window.__abertos.push(u); return {}; }; });
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Ver PDF', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__abertos.length)).toBe(1);
    const abertos = await page.evaluate(() => window.__abertos);
    expect(abertos[0]).toMatch(/^blob:/);
    const conteudo = await page.evaluate(async u => (await (await fetch(u)).text()).slice(0, 8), abertos[0]);
    expect(conteudo).toBe('%PDF-1.4');
    // nota sem PDF
    await page.locator('#nf-janela .modal-close').click();
    await emitir(page, 26402);
    await page.setInputFiles('#nf-xml', FIX('nfe-venda.xml'));
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Ver PDF', exact: true }).click();
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
    await page.locator('#nf-janela').getByRole('button', { name: 'Ver PDF', exact: true }).click();
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
    dados.notas_fiscais[0].eventos = undefined;
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

test('arquivo que nao e PDF (html renomeado) e recusado ao anexar e ao abrir backup adulterado', async ({ page }) => {
    await page.addInitScript(() => { window.__abertos = []; window.open = u => { window.__abertos.push(u); return {}; }; });
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-pdf', { name: 'falso.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script></html>') });
    await expect(page.locator('#nf-msg-pdf')).toHaveText('Este arquivo não é um PDF.');
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    expect((await notas(page))[0].tem_pdf).toBe(false);
    // PDF guardado com tipo html (backup adulterado): nao abre
    await page.evaluate(() => { db.notas_fiscais[0].pdf = 'data:text/html;base64,' + btoa('<script>1</script>'); });
    await page.locator('#nf-janela').getByRole('button', { name: 'Ver PDF', exact: true }).click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('Este arquivo não é um PDF.');
    expect(await page.evaluate(() => window.__abertos)).toHaveLength(0);
    await page.locator('#sc-modal-ok').click();
    // tipo html mas bytes de PDF: abre como application/pdf
    await page.evaluate(() => { db.notas_fiscais[0].pdf = 'data:text/html;base64,' + btoa('%PDF-1.4 x'); });
    await page.locator('#nf-janela').getByRole('button', { name: 'Ver PDF', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__abertos.length)).toBe(1);
    const u = (await page.evaluate(() => window.__abertos))[0];
    expect(await page.evaluate(async u => (await (await fetch(u)).blob()).type, u)).toBe('application/pdf');
});

test('XML ISO-8859-1 com acentos: le certo e Baixar XML devolve os bytes originais', async ({ page }) => {
    const xml = require('fs').readFileSync(FIX('nfse-abrasf.xml'), 'utf8').replace('encoding="UTF-8"', 'encoding="ISO-8859-1"').replace('Instalacao de cortinas', 'Instalação de cortinas').replace('Maria da Silva', 'Maria da Conceição');
    const bytes = Buffer.from(xml, 'latin1');
    expect(bytes.includes(Buffer.from([0xE7, 0xE3]))).toBe(true);
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', { name: 'latin.xml', mimeType: 'text/xml', buffer: bytes });
    await expect(page.locator('#nf-numero')).toHaveValue('456');
    await page.locator('#nf-salvar').click();
    const n = (await notas(page))[0];
    expect(n.xml).toBe('');
    expect(n.xml_b64).toBeTruthy();
    const txt = await page.evaluate(() => _nfXmlTexto(db.notas_fiscais[0]));
    expect(txt).toContain('Instalação de cortinas');
    expect(txt).not.toContain('\uFFFD');
    expect(n.xml_encoding).toBe('iso-8859-1');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#nf-janela').getByRole('button', { name: 'Baixar XML' }).click()]);
    const baixado = require('fs').readFileSync(await dl.path());
    expect(Buffer.compare(baixado, bytes)).toBe(0);
});

const EVENTO = chave => Buffer.from('<?xml version="1.0" encoding="UTF-8"?><procEventoNFe versao="1.00"><evento><infEvento><tpEvento>110111</tpEvento><chNFe>' + chave + '</chNFe></infEvento></evento></procEventoNFe>');
const CHAVE_NFE = '35261112345678000195550010000001231000001237';

test('XML de cancelamento marca a nota existente como cancelada, sem criar outra', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfe-venda.xml'));
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-btn-emitir').click();
    await page.setInputFiles('#nf-xml', { name: 'cancel.xml', mimeType: 'text/xml', buffer: EVENTO(CHAVE_NFE) });
    await expect(page.locator('#nf-salvar')).toBeEnabled();
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#nf-janela .nf-linha')).toHaveCount(1);
    await expect(page.locator('#nf-janela .nf-selo')).toHaveText('Cancelada');
    const nf = await notas(page);
    expect(nf).toHaveLength(1);
    expect(nf[0].status).toBe('cancelada');
    expect(nf[0].eventos.at(-1).detalhe).toContain('Cancelamento anexado (XML)');
    expect(nf[0].xml_cancelamento).toContain('110111');
});

test('XML de cancelamento sem nota com a chave: mensagem e nada salvo', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', { name: 'cancel.xml', mimeType: 'text/xml', buffer: EVENTO('99999999999999999999999999999999999999999999') });
    await expect(page.locator('#nf-msg-xml')).toHaveText('Não há nota com essa chave neste pedido para cancelar.');
    await expect(page.locator('#nf-salvar')).toBeDisabled();
    expect(await notas(page)).toEqual([]);
});

test('excluir pedido com nota nao cancelada e recusado', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    await page.evaluate(() => { excluirPedido(26401); });
    await expect(page.locator('#sc-modal-msg')).toHaveText('Este pedido tem nota fiscal emitida e não pode ser excluído. Cancele a nota antes.');
    await page.locator('#sc-modal-ok').click();
    expect(await page.evaluate(() => db.pedidos.some(p => p.id === 26401))).toBe(true);
});

const idbBytes = (page, id) => page.evaluate(async i => { const b = await NfArquivos.ler(i); return b ? Array.from(b.slice(0, 8)) : null; }, id);
const PDF_TXT = '%PDF-1.4';
const NOTA = (extra) => Object.assign({ id: 501, pedido_id: 26401, tipo: 'nfse', numero: '9', serie: '', chave: null, codigo_verificacao: 'X', data_emissao: '2026-11-20', valor: 3450, cliente_id: 1, status: 'autorizada', protocolo: null, eventos: [], xml_nome: 'a.xml', xml: '<a/>', pdf_nome: '', pdf: null, origem: 'manual', criado_em: '2026-11-20T10:00:00Z', criado_por: 1 }, extra || {});

test('PDF vai para o IndexedDB: sc_nf guarda so os dados e o texto de espaco aparece', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await expect.poll(() => page.evaluate(() => _nfEst && !!_nfEst.pdfBytes)).toBe(true);
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#nf-janela .nf-linha')).toHaveCount(1);
    const n = (await notas(page))[0];
    expect(n.pdf).toBeUndefined();
    expect(n).toMatchObject({ tem_pdf: true, pdf_nome: 'nota.pdf', pdf_tamanho: PDF_PEQ.buffer.length });
    expect(await idbBytes(page, n.id)).toEqual(Array.from(Buffer.from(PDF_TXT)));
    expect(JSON.stringify(await ler(page, 'sc_nf'))).not.toContain('JVBER');
    await expect(page.locator('#nf-espaco')).toHaveText(/^Notas fiscais ocupam \d+,\d MB no navegador\.$/);
});

test('migracao: PDF inline de nota antiga vai para o IndexedDB e sai do sc_nf; XML nao fica duas vezes', async ({ page }) => {
    const b64 = Buffer.from('%PDF-1.4 antigo').toString('base64');
    await abrir(page, { sc_nf: [NOTA({ pdf: 'data:application/pdf;base64,' + b64, pdf_nome: 'velho.pdf', xml: 'texto', xml_b64: 'dGV4dG8=', xml_encoding: 'iso-8859-1' })] });
    await expect.poll(async () => (await notas(page))[0].tem_pdf).toBe(true);
    const n = (await notas(page))[0];
    expect(n.pdf).toBeUndefined();
    expect(n.xml).toBe('');
    expect(n.pdf_tamanho).toBe('%PDF-1.4 antigo'.length);
    expect((await idbBytes(page, 501)).length).toBe(8);
});

test('backup com PDF: exporta o PDF junto e a importacao o devolve ao IndexedDB; backup antigo com pdf inline importa', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await expect.poll(() => page.evaluate(() => _nfEst && !!_nfEst.pdfBytes)).toBe(true);
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#nf-janela .nf-linha')).toHaveCount(1);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportarDados())]);
    const json = require('fs').readFileSync(await dl.path(), 'utf8');
    const dados = JSON.parse(json);
    expect(dados.notas_fiscais[0].pdf).toMatch(/^data:application\/pdf;base64,/);
    await page.evaluate(async () => { await NfArquivos.limpar(); });
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(j => importarDados({ target: { files: [new File([j], 'b.json')], value: '' } }), json);
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    await page.waitForFunction(() => typeof db !== 'undefined');
    const n = (await notas(page))[0];
    expect(n.pdf).toBeUndefined();
    expect(n.tem_pdf).toBe(true);
    expect(await idbBytes(page, n.id)).toEqual(Array.from(Buffer.from(PDF_TXT)));
});

test('Remover PDF tira o arquivo, mantem o XML e registra o evento', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await expect.poll(() => page.evaluate(() => _nfEst && !!_nfEst.pdfBytes)).toBe(true);
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Remover PDF' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#nf-janela').getByRole('button', { name: 'Remover PDF' })).toHaveCount(0);
    const n = (await notas(page))[0];
    expect(n).toMatchObject({ tem_pdf: false, pdf_nome: '' });
    expect(n.xml).toContain('CompNfse');
    expect(n.eventos.at(-1).detalhe).toContain('PDF removido');
    expect(await idbBytes(page, n.id)).toBeNull();
});

test('sem IndexedDB: PDF e recusado com a mensagem clara e o XML ainda salva', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await expect(page.locator('#nf-msg-pdf')).toHaveText('Este navegador não permite guardar o PDF. Guarde o PDF no computador e anexe só o XML.');
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    expect((await notas(page))).toHaveLength(1);
});

test('PDF junto com XML de cancelamento nao e guardado e avisa', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfe-venda.xml'));
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-btn-emitir').click();
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await expect.poll(() => page.evaluate(() => _nfEst && !!_nfEst.pdfBytes)).toBe(true);
    await page.setInputFiles('#nf-xml', { name: 'cancel.xml', mimeType: 'text/xml', buffer: EVENTO(CHAVE_NFE) });
    await expect(page.locator('#nf-msg-pdf')).toHaveText('O PDF não foi guardado: este XML é de cancelamento.');
    await page.locator('#nf-salvar').click();
    expect((await notas(page))[0]).toMatchObject({ status: 'cancelada', tem_pdf: false });
});

test('Cancelar nota com XML de evento de outra nota e recusado', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfe-venda.xml'));
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Cancelar nota' }).click();
    await page.fill('#nf-cancel-motivo', 'Erro');
    await page.setInputFiles('#nf-cancel-xml', { name: 'outro.xml', mimeType: 'text/xml', buffer: EVENTO('99999999999999999999999999999999999999999999') });
    await page.locator('#nf-cancel-ok').click();
    await expect(page.locator('#nf-cancel-msg')).toHaveText('Este XML de cancelamento é de outra nota.');
    expect((await notas(page))[0].status).toBe('autorizada');
    await page.setInputFiles('#nf-cancel-xml', { name: 'certo.xml', mimeType: 'text/xml', buffer: EVENTO(CHAVE_NFE) });
    await page.locator('#nf-cancel-ok').click();
    await expect(page.locator('#nf-cancelar')).toHaveCount(0);
    const n = (await notas(page))[0];
    expect(n.status).toBe('cancelada');
    expect(n.xml_cancelamento).toContain('110111');
    await expect(page.locator('#nf-janela').getByRole('button', { name: 'Desfazer cancelamento' })).toHaveCount(0);
});

test('Desfazer cancelamento manual volta a nota para autorizada com evento', async ({ page }) => {
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.locator('#nf-salvar').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Cancelar nota' }).click();
    await page.fill('#nf-cancel-motivo', 'Nota errada');
    await page.locator('#nf-cancel-ok').click();
    await expect(page.locator('#nf-janela .nf-selo')).toHaveText('Cancelada');
    await page.locator('#nf-janela').getByRole('button', { name: 'Desfazer cancelamento' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#nf-janela .nf-selo')).toHaveText('Autorizada');
    const n = (await notas(page))[0];
    expect(n.status).toBe('autorizada');
    expect(n.eventos.at(-1).detalhe).toBe('Cancelamento desfeito');
});

test('aviso de valor abaixo do pedido: "A nota cobre R$ X de R$ Y do pedido."', async ({ page }) => {
    await abrir(page, { sc_ped: PEDIDOS().map(p => p.id === 26401 ? { ...p, valor: 4000 } : p) });
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await expect(page.locator('#nf-avisos .nf-aviso')).toHaveText('A nota cobre R$ 3.450,00 de R$ 4.000,00 do pedido.');
});

test('Baixar XML sempre com extensao .xml e sem pasta', async ({ page }) => {
    await abrir(page, { sc_nf: [NOTA({ xml_nome: '..\\x/nota.html' })] });
    await abrirJanela(page, 26401);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#nf-janela').getByRole('button', { name: 'Baixar XML' }).click()]);
    expect(dl.suggestedFilename()).toBe('nota.xml');
});

test('nota sem eventos (backup antigo) nao quebra Cancelar nem Historico', async ({ page }) => {
    await abrir(page, { sc_nf: [NOTA({ eventos: undefined })] });
    await abrirJanela(page, 26401);
    await page.locator('#nf-janela').getByRole('button', { name: 'Histórico' }).click();
    await expect(page.locator('#nf-historico')).toContainText('Sem eventos');
    await page.locator('#nf-historico .modal-close').click();
    await page.locator('#nf-janela').getByRole('button', { name: 'Cancelar nota' }).click();
    await page.fill('#nf-cancel-motivo', 'x');
    await page.locator('#nf-cancel-ok').click();
    await expect(page.locator('#nf-janela .nf-selo')).toHaveText('Cancelada');
});

test('Voltar para Orcamento recusa com nota ativa; menu Notas fiscais aparece em Orcamento se ha nota', async ({ page }) => {
    await abrir(page, { sc_nf: [NOTA()] });
    await page.evaluate(() => { voltarPedidoParaOrcamento(26401); });
    await expect(page.locator('#sc-modal-msg')).toHaveText('Este pedido tem nota fiscal emitida. Cancele a nota antes de voltar para Orçamento.');
    await page.locator('#sc-modal-ok').click();
    expect(await page.evaluate(() => db.pedidos.find(p => p.id === 26401).status)).toBe('Medição');
    // com a nota cancelada o menu continua em pedido Orcamento que tenha nota
    await abrir(page, { sc_nf: [NOTA({ pedido_id: 26403, status: 'cancelada' })] });
    await menuPed(page, 26403).click();
    await expect(page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Notas fiscais' })).toHaveCount(1);
});

test('salvar pedido com valor diferente das notas autorizadas pergunta antes', async ({ page }) => {
    await abrir(page, { sc_nf: [NOTA()] });
    const p1 = page.evaluate(() => confirmarValorContraNotas(26401, 2900));
    await expect(page.locator('#sc-modal-msg')).toHaveText('O valor do pedido (R$ 2.900,00) ficou diferente das notas emitidas (R$ 3.450,00). Salvar mesmo assim?');
    await page.locator('#sc-modal-cancel').click();
    expect(await p1).toBe(false);
    expect(await page.evaluate(() => confirmarValorContraNotas(26401, 3450))).toBe(true);
});

test('provedor com servidor: emitir recebe referencia e pedido_id, rascunho vira processando; cancelar so cancela com status valido', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => {
        window.__chamadas = [];
        Fiscal.provedor = {
            nome: 'falso',
            emitir: async d => { window.__chamadas.push(['emitir', d, JSON.parse(localStorage.getItem('sc_nf')).map(n => n.status)]); return { status: 'processando', servidor_id: 'SRV-1' }; },
            consultar: async () => ({ status: 'processando' }),
            cancelar: async (id, motivo) => { window.__chamadas.push(['cancelar', id, motivo]); return { status: window.__respCancel }; }
        };
        window.__respCancel = 'rejeitada';
    });
    await emitir(page, 26401);
    await page.locator('#nf-emitir-agora').click();
    await expect(page.locator('#nf-emitir')).toHaveCount(0);
    const [ch] = await page.evaluate(() => window.__chamadas);
    const n = (await notas(page))[0];
    expect(ch[1].referencia).toBe(n.id);
    expect(ch[1].pedido_id).toBe(26401);
    expect(ch[2]).toEqual(['rascunho']);   // gravada como rascunho antes de chamar o provedor
    expect(n).toMatchObject({ status: 'processando', servidor_id: 'SRV-1', ref: n.id, origem: 'servidor' });
    await expect(page.locator('#nf-janela .nf-selo')).toHaveText('Processando');
    // cancelar com resposta que nao confirma: nada muda
    await page.locator('#nf-janela').getByRole('button', { name: 'Cancelar nota' }).click();
    await page.fill('#nf-cancel-motivo', 'teste');
    await page.locator('#nf-cancel-ok').click();
    await expect(page.locator('#nf-cancel-msg')).toContainText('não foi confirmado');
    expect((await notas(page))[0].status).toBe('processando');
    expect((await page.evaluate(() => window.__chamadas))[1]).toEqual(['cancelar', 'SRV-1', 'teste']);
    // processando: segue processando com evento; cancelada: cancela
    await page.evaluate(() => { window.__respCancel = 'cancelada'; });
    await page.locator('#nf-cancel-ok').click();
    await expect(page.locator('#nf-cancelar')).toHaveCount(0);
    expect((await notas(page))[0].status).toBe('cancelada');
});

test('provedor manual devolve manual: emitir-agora desfaz o rascunho e segue o fluxo de anexar', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => { Fiscal.provedor = { nome: 'quase', emitir: async () => ({ status: 'manual' }), cancelar: async () => ({ status: 'manual' }) }; });
    await emitir(page, 26401);
    await page.locator('#nf-emitir-agora').click();
    await expect(page.locator('#nf-msg-xml')).toHaveText(/Emita esta nota no sistema/);
    expect(await notas(page)).toEqual([]);
});

test('N1: PDF que nao da para ler no backup avisa; a importacao nao apaga o PDF local dessa nota', async ({ page }) => {
    await abrir(page, { sc_nf: [NOTA({ tem_pdf: true, pdf_nome: 'x.pdf', pdf_tamanho: 9 })] });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => { exportarDados(); })]);
    const json = require('fs').readFileSync(await dl.path(), 'utf8');
    await expect(page.locator('#sc-modal-msg')).toHaveText('1 PDF(s) não puderam ser incluídos no backup.');
    await page.locator('#sc-modal-ok').click();
    expect(JSON.parse(json).notas_fiscais[0]).toMatchObject({ tem_pdf: true, pdf_no_backup: false });
    // o PDF existe so aqui: a importacao deste arquivo nao pode apaga-lo
    await page.evaluate(async () => { await NfArquivos.gravar(501, new TextEncoder().encode('%PDF-1.4 local')); });
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(j => importarDados({ target: { files: [new File([j], 'b.json')], value: '' } }), json);
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    await page.waitForFunction(() => typeof db !== 'undefined');
    expect(await idbBytes(page, 501)).not.toBeNull();
    expect((await notas(page))[0]).toMatchObject({ tem_pdf: true });
});

test('N1: importar apaga o PDF local de nota que o backup diz que nao tem PDF', async ({ page }) => {
    await abrir(page, { sc_nf: [NOTA()] });
    await page.evaluate(async () => { await NfArquivos.gravar(501, new TextEncoder().encode('%PDF-1.4 local')); });
    const json = JSON.stringify({ clientes: [], catalogo: [], pedidos: PEDIDOS_JS(), notas_fiscais: [{ id: 501, pedido_id: 26401, status: 'autorizada', tem_pdf: false, eventos: [] }] });
    await page.evaluate(() => { window.__marca = 1; });
    await page.evaluate(j => importarDados({ target: { files: [new File([j], 'b.json')], value: '' } }), json);
    await page.locator('#sc-modal-ok').click();
    await expect.poll(() => page.evaluate(() => window.__marca)).toBeUndefined();
    await page.waitForFunction(() => typeof db !== 'undefined');
    await expect.poll(() => idbBytes(page, 501)).toBeNull();
});
const PEDIDOS_JS = () => PEDIDOS();

test('N2: importar com falha ao guardar o PDF marca tem_pdf false e avisa', async ({ page }) => {
    await page.addInitScript(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('cheio', 'QuotaExceededError'); }; });
    await abrir(page);
    const b64 = Buffer.from('%PDF-1.4 x').toString('base64');
    const json = JSON.stringify({ clientes: [], catalogo: [], pedidos: PEDIDOS(), notas_fiscais: [NOTA({ pdf: 'data:application/pdf;base64,' + b64, pdf_nome: 'a.pdf' })] });
    await page.evaluate(j => importarDados({ target: { files: [new File([j], 'b.json')], value: '' } }), json);
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText('1 PDF(s) não puderam ser guardados neste navegador.');
    expect((await notas(page))[0]).toMatchObject({ tem_pdf: false });
});

test('N3: Remover PDF so apaga o arquivo depois de salvar a nota', async ({ page }) => {
    await page.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (k === 'sc_nf' && window.__cheio) throw new DOMException('cheio', 'QuotaExceededError'); return orig.call(this, k, v); };
    });
    await abrir(page);
    await emitir(page, 26401);
    await page.setInputFiles('#nf-xml', FIX('nfse-abrasf.xml'));
    await page.setInputFiles('#nf-pdf', PDF_PEQ);
    await expect.poll(() => page.evaluate(() => _nfEst && !!_nfEst.pdfBytes)).toBe(true);
    await page.locator('#nf-salvar').click();
    await expect(page.locator('#nf-janela .nf-linha')).toHaveCount(1);
    const id = (await notas(page))[0].id;
    await page.evaluate(() => { window.__cheio = true; });
    await page.locator('#nf-janela').getByRole('button', { name: 'Remover PDF' }).click();
    await page.locator('#sc-modal-ok').click();
    await expect(page.locator('#sc-modal-msg')).toHaveText(MSG_ESPACO);
    expect(await idbBytes(page, id)).not.toBeNull();
    expect((await notas(page))[0].tem_pdf).toBe(true);
});

test('N4: Emitir agora repetido reaproveita o rascunho; janela fechada durante a chamada ainda grava a resposta', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => {
        window.__refs = [];
        window.__n = 0;
        Fiscal.provedor = { nome: 'falso', emitir: async d => { window.__refs.push(d.referencia); window.__n++; await new Promise(r => setTimeout(r, 300)); return window.__n === 1 ? { status: 'erro', mensagem: 'fora do ar' } : { status: 'processando', servidor_id: 'S9' }; }, cancelar: async () => ({ status: 'manual' }) };
    });
    await emitir(page, 26401);
    await page.locator('#nf-emitir-agora').click();
    await expect(page.locator('#nf-msg-xml')).toHaveText('fora do ar');
    await page.locator('#nf-emitir-agora').click();
    await page.evaluate(() => _nfFechar('nf-emitir'));   // fecha a janela durante a segunda chamada
    await expect.poll(async () => ((await notas(page))[0] || {}).status).toBe('processando');
    const refs = await page.evaluate(() => window.__refs);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(refs[1]);
    const nf = await notas(page);
    expect(nf).toHaveLength(1);
    expect(nf[0]).toMatchObject({ servidor_id: 'S9', id: refs[0] });
});

test('N5: moverStatus para tras ate Orcamento recusa com nota ativa', async ({ page }) => {
    await abrir(page, { sc_nf: [NOTA()] });
    await page.evaluate(() => { moverStatus(26401, -1); });
    await expect(page.locator('#sc-modal-msg')).toHaveText('Este pedido tem nota fiscal emitida. Cancele a nota antes de voltar para Orçamento.');
    await page.locator('#sc-modal-ok').click();
    expect(await page.evaluate(() => db.pedidos.find(p => p.id === 26401).status)).toBe('Medição');
});
