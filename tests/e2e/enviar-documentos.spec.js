// Botao "📤 Enviar" nos documentos: abre um menu (efeito genio) com
// "Compartilhar externamente" (PDF anexado pela janela do aparelho, ou baixa
// + atalhos) e "E-mail" (rascunho .eml com destinatario, assunto, texto e PDF).
// Gera o PDF de verdade (html2pdf.js, carregado do CDN).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8131';
const PED = { id: 26070, clienteId: 1, status: 'Orçamento', valor: 1500, ambientes: [] };
const CLI = { id: 1, nome: 'Maria Souza', tel: '(47) 99999-1234', email: 'maria@exemplo.com' };
const FORN = { id: 5, nome: 'Tecidos Brasil', tel: '(11) 98888-7777', email: 'vendas@tecidos.com' };
const PC = { id: 26090, fornecedor_id: 5, status: 'Rascunho', data_criacao: '2026-11-10T10:00:00', itens: [{ item_nome: 'LINHO', tipo: 'tecido', quantidade: 10, unidade: 'm', preco_unit: 20, subtotal: 200 }] };
const MED = { id: 701, clienteId: 1, clienteNome: 'Maria Souza', clienteTel: '(47) 99999-1234', data: '2026-11-20', hora: '09:00', status: 'Agendado', endereco: 'Rua A, 10' };
const DADOS = { sc_ped: [PED], sc_cli: [CLI], sc_forn: [FORN], sc_pc: [PC], sc_med: [MED], sc_empresa: { razao_social: 'Lírio Cortinas' } };

// Simula um navegador que compartilha arquivos (celular / Chrome no Windows)
// ou um que nao compartilha (ex.: Firefox no computador).
async function preparar(page, comShare) {
    if (comShare) {
        await page.addInitScript(() => {
            window.__compartilhado = null;
            navigator.canShare = d => !!(d && d.files && d.files.length);
            navigator.share = async d => {
                const f = d.files[0];
                const cabeca = new TextDecoder().decode(await f.slice(0, 5).arrayBuffer());
                window.__compartilhado = { nome: f.name, tipo: f.type, tamanho: f.size, cabeca, texto: d.text, titulo: d.title };
            };
        });
    } else {
        await page.addInitScript(() => { navigator.canShare = undefined; navigator.share = undefined; });
    }
    await entrar(page, BASE, DADOS);
}

async function abrirProposta(page, comShare) {
    await preparar(page, comShare);
    await page.goto(BASE + '/pedidos.html');
    await page.evaluate(() => abrirPropostaModal(26070));
    await expect(page.locator('#doc-modal-paper .proposta-header')).toBeVisible();
}

async function escolher(page, opcao) {
    await page.click('#btn-enviar-doc');
    const menu = page.locator('#menu-enviar-doc');
    await expect(menu).toBeVisible();
    await menu.locator(`[data-acao="${opcao}"]`).click();
}

// Baixa o .eml e devolve { para, assunto, corpo, pdf }.
async function lerEml(page, abrirDownload) {
    const download = page.waitForEvent('download', { timeout: 45000 });
    await abrirDownload();
    const d = await download;
    const eml = fs.readFileSync(await d.path(), 'latin1');
    const para = (eml.match(/\r\nTo: ([^\r]+)/) || [])[1] || '';
    const assunto = Buffer.from(eml.match(/\r\nSubject: =\?UTF-8\?B\?([^?]+)\?=/)[1], 'base64').toString('utf8');
    const partes = eml.split(/--sctech_\w+/);
    const corpo = Buffer.from(partes.find(p => p.includes('text/plain')).split('\r\n\r\n')[1].replace(/\s/g, ''), 'base64').toString('utf8');
    const pdf = Buffer.from(partes.find(p => p.includes('application/pdf')).split('\r\n\r\n')[1].replace(/\s/g, ''), 'base64');
    return { nome: d.suggestedFilename(), eml, para, assunto, corpo, pdf };
}

// --- O botao e o menu --------------------------------------------------------

test('o botao se chama Enviar e abre o menu com Compartilhar externamente e E-mail', async ({ page }) => {
    await abrirProposta(page, false);
    const barra = page.locator('#doc-modal-topbar-actions');
    await expect(barra.locator('#btn-enviar-doc')).toHaveText('📤 Enviar');
    await expect(barra).not.toContainText('Compartilhar');
    await page.click('#btn-enviar-doc');
    const menu = page.locator('#menu-enviar-doc');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.menu-enviar-item b')).toHaveText(['Compartilhar externamente', 'E-mail']);
    // o menu "sai" do botao (animacao genio-sai)
    expect(await menu.evaluate(m => getComputedStyle(m).animationName)).toBe('genio-sai');
    // Esc fecha; clicar de novo no botao reabre; clicar fora fecha
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.click('#btn-enviar-doc');
    await expect(page.locator('#menu-enviar-doc')).toBeVisible();
    await page.mouse.click(5, 300);
    await expect(page.locator('#menu-enviar-doc')).toHaveCount(0);
});

// --- Compartilhar externamente ----------------------------------------------

test('Compartilhar externamente: abre a janela do aparelho com o PDF anexado', async ({ page }) => {
    test.setTimeout(90000);
    await abrirProposta(page, true);
    await escolher(page, 'compartilhar');
    await expect.poll(() => page.evaluate(() => window.__compartilhado), { timeout: 45000 }).not.toBeNull();
    const c = await page.evaluate(() => window.__compartilhado);
    expect(c.tipo).toBe('application/pdf');
    expect(c.cabeca).toBe('%PDF-');
    expect(c.tamanho, 'um PDF em branco tem uns 3 KB').toBeGreaterThan(20000);
    expect(c.nome).toMatch(/^Proposta-26070-Maria-Souza\.pdf$/);
    expect(c.texto).toContain('Olá Maria!');
    expect(c.texto).toContain('Lírio Cortinas');
    await expect(page.locator('#btn-enviar-doc')).toBeEnabled();
    await expect(page.locator('#btn-enviar-doc')).toHaveText('📤 Enviar');
});

test('Compartilhar externamente sem suporte: baixa o PDF e oferece WhatsApp e e-mail', async ({ page }) => {
    test.setTimeout(90000);
    await abrirProposta(page, false);
    const download = page.waitForEvent('download', { timeout: 45000 });
    await escolher(page, 'compartilhar');
    expect((await download).suggestedFilename()).toMatch(/^Proposta-.*\.pdf$/);
    const alt = page.locator('#compartilhar-alternativa');
    await expect(alt).toBeVisible();
    expect(await alt.locator('a:has-text("WhatsApp")').getAttribute('href')).toContain('https://wa.me/5547999991234?text=');
    expect(await alt.locator('a:has-text("E-mail")').getAttribute('href')).toMatch(/^mailto:maria%40exemplo\.com\?subject=/);
});

// --- E-mail -------------------------------------------------------------------

test('E-mail: rascunho .eml com destinatario, assunto, texto e o PDF anexado', async ({ page }) => {
    test.setTimeout(90000);
    await abrirProposta(page, false);
    const e = await lerEml(page, () => escolher(page, 'email'));
    expect(e.nome).toBe('Proposta-26070-Maria-Souza.eml');
    expect(e.eml).toMatch(/^X-Unsent: 1\r\n/);
    expect(e.para).toBe('maria@exemplo.com');
    expect(e.assunto).toBe('Proposta comercial nº 26070 — Lírio Cortinas');
    expect(e.corpo).toContain('Olá Maria!');
    expect(e.corpo).toContain('Atenciosamente,\nLírio Cortinas');
    expect(e.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(e.pdf.length).toBeGreaterThan(20000);
    const ajuda = page.locator('#compartilhar-email');
    await expect(ajuda).toBeVisible();
    expect(await ajuda.locator('a:has-text("Abrir e-mail preenchido")').getAttribute('href')).toMatch(/^mailto:maria%40exemplo\.com\?subject=Proposta%20comercial/);
    const pdfDl = page.waitForEvent('download');
    await ajuda.locator('button:has-text("Baixar o PDF")').click();
    expect((await pdfDl).suggestedFilename()).toMatch(/\.pdf$/);
});

// --- Os outros documentos -----------------------------------------------------

test('Pedido de compra: Enviar vai para o fornecedor', async ({ page }) => {
    test.setTimeout(90000);
    await preparar(page, false);
    await page.goto(BASE + '/fornecedores.html');
    await page.evaluate(() => abrirPedidoCompra(26090));
    const e = await lerEml(page, () => escolher(page, 'email'));
    expect(e.para).toBe('vendas@tecidos.com');
    expect(e.assunto).toBe('Pedido de compra nº 26090 — Lírio Cortinas');
    expect(e.corpo).toContain('Olá Tecidos!');
    expect(e.corpo).toContain('emitido em 10/11/2026');
    expect(e.nome).toBe('Pedido-de-compra-26090-Tecidos-Brasil.eml');
    expect(e.pdf.subarray(0, 5).toString()).toBe('%PDF-');
});

test('OS: Enviar sem destinatario (documento do time)', async ({ page }) => {
    test.setTimeout(90000);
    await preparar(page, false);
    await page.goto(BASE + '/pedidos.html');
    await page.evaluate(() => abrirOS(26070));
    const e = await lerEml(page, () => escolher(page, 'email'));
    expect(e.para).toBe('');
    expect(e.assunto).toBe('Ordem de serviço nº 26070 — Lírio Cortinas');
    expect(e.corpo).toContain('(cliente Maria Souza)');
    await expect(page.locator('#compartilhar-email')).toContainText('Sem e-mail cadastrado');
});

test('Agendamento de medicao: Enviar vai para o cliente', async ({ page }) => {
    test.setTimeout(90000);
    await preparar(page, false);
    await page.goto(BASE + '/pedidos.html');
    await page.evaluate(() => imprimirAgendamentoMedicao(701));
    const download = page.waitForEvent('download', { timeout: 45000 });
    await escolher(page, 'compartilhar');
    await download;
    const wa = await page.locator('#compartilhar-alternativa a:has-text("WhatsApp")').getAttribute('href');
    expect(wa).toContain('https://wa.me/5547999991234?text=');
    expect(decodeURIComponent(wa)).toContain('visita de medição do dia 20/11/2026 às 09:00');
});

test('Relatorio financeiro e Resultado do mes: Enviar sem destinatario', async ({ page }) => {
    test.setTimeout(120000);
    await preparar(page, false);
    await page.goto(BASE + '/financeiro.html');
    await page.evaluate(() => gerarRelatorioFinanceiro());
    let e = await lerEml(page, () => escolher(page, 'email'));
    expect(e.para).toBe('');
    expect(e.assunto).toMatch(/^Relatório financeiro — .+ — Lírio Cortinas$/);
    expect(e.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await page.locator('#compartilhar-email .modal-close').click();
    await page.evaluate(() => { fecharDocModal(); exportarResultadoPDF('2026-11'); });
    e = await lerEml(page, () => escolher(page, 'email'));
    expect(e.assunto).toMatch(/^Resultado do mês — .+ — Lírio Cortinas$/);
});

test('Balanco de estoque: Enviar gera o PDF do balanco, sem mexer na tela', async ({ page }) => {
    test.setTimeout(90000);
    await preparar(page, false);
    await page.goto(BASE + '/estoque.html');
    await page.click('button:has-text("Balanço de Estoque")');
    const antes = await page.evaluate(() => getComputedStyle(document.body).padding);
    const e = await lerEml(page, () => escolher(page, 'email'));
    expect(e.assunto).toMatch(/^Balanço de estoque — \d{2}\/\d{2}\/\d{4} — Lírio Cortinas$/);
    expect(e.para).toBe('');
    expect(e.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await page.evaluate(() => getComputedStyle(document.body).padding), 'o estilo do PDF nao vaza para a tela').toBe(antes);
    expect(await page.evaluate(() => document.querySelectorAll('.compartilhar-pdf-render').length)).toBe(0);
});

test('as paginas proposta, OS e pedido de compra tambem tem o Enviar', async ({ page }) => {
    await preparar(page, false);
    await page.evaluate(() => {
        localStorage.setItem('sc_proposta_id', '26070');
        localStorage.setItem('sc_os_id', '26070');
        localStorage.setItem('sc_pc_id', '26090');
    });
    for (const pagina of ['proposta.html', 'os.html']) {
        await page.goto(BASE + '/' + pagina);
        await page.click('#btn-enviar-doc');
        await expect(page.locator('#menu-enviar-doc')).toBeVisible();
    }
    await page.addInitScript(() => { window.print = () => {}; });
    await page.goto(BASE + '/pedido-compra.html');
    await page.click('#btn-enviar-doc');
    await expect(page.locator('#menu-enviar-doc')).toBeVisible();
});
