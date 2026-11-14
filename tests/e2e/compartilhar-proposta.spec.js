// Teste do compartilhamento da Proposta Comercial com o PDF anexado.
// Gera o PDF de verdade (html2pdf.js, carregado do CDN).
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const PED = { id: 26070, clienteId: 1, status: 'Orçamento', valor: 1500, ambientes: [] };
const CLI = { id: 1, nome: 'Maria Souza', tel: '(47) 99999-1234', email: 'maria@exemplo.com' };

async function abrir(page, comShare) {
    if (comShare) {
        // simula um navegador que compartilha arquivos (celular / Chrome no Windows)
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
    await entrar(page, BASE, { sc_ped: [PED], sc_cli: [CLI], sc_empresa: { razao_social: 'Lírio Cortinas' } });
    await page.goto(BASE + '/pedidos.html');
    await page.evaluate(() => abrirPropostaModal(26070));
    await expect(page.locator('#doc-modal-paper .proposta-header')).toBeVisible();
}

test('o botao Compartilhar aparece na proposta, e so nela', async ({ page }) => {
    await abrir(page, false);
    await expect(page.locator('#doc-modal-topbar-actions #btn-compartilhar-proposta')).toBeVisible();
    await page.evaluate(() => { fecharDocModal(); abrirOS(26070); });
    await expect(page.locator('#doc-modal-topbar-actions #btn-compartilhar-proposta')).toHaveCount(0);
    await expect(page.locator('#doc-modal-topbar-actions #btn-email-proposta')).toHaveCount(0);
});

test('com compartilhamento de arquivo: abre a janela do aparelho com o PDF anexado', async ({ page }) => {
    test.setTimeout(90000);
    await abrir(page, true);
    await page.click('#btn-compartilhar-proposta');
    await expect.poll(() => page.evaluate(() => window.__compartilhado), { timeout: 45000 }).not.toBeNull();
    const c = await page.evaluate(() => window.__compartilhado);
    expect(c.tipo).toBe('application/pdf');
    expect(c.cabeca).toBe('%PDF-');
    expect(c.tamanho, 'um PDF em branco tem uns 3 KB; o de verdade tem a imagem da proposta').toBeGreaterThan(20000);
    expect(c.nome).toMatch(/^Proposta-.*Maria-Souza\.pdf$/);
    expect(c.texto).toContain('Maria');
    expect(c.texto).toContain('Lírio Cortinas');
    await expect(page.locator('#compartilhar-alternativa')).toHaveCount(0);
    await expect(page.locator('#btn-compartilhar-proposta')).toBeEnabled();
});

test('sem compartilhamento de arquivo: baixa o PDF e oferece WhatsApp e e-mail com a mensagem', async ({ page }) => {
    test.setTimeout(90000);
    await abrir(page, false);
    const download = page.waitForEvent('download', { timeout: 45000 });
    await page.click('#btn-compartilhar-proposta');
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^Proposta-.*\.pdf$/);
    const alt = page.locator('#compartilhar-alternativa');
    await expect(alt).toBeVisible();
    const wa = await alt.locator('a:has-text("WhatsApp")').getAttribute('href');
    expect(wa).toContain('https://wa.me/5547999991234?text=');
    expect(decodeURIComponent(wa)).toContain('proposta comercial');
    const mail = await alt.locator('a:has-text("E-mail")').getAttribute('href');
    expect(mail).toMatch(/^mailto:maria%40exemplo\.com\?subject=/);
});

test('a pagina proposta.html tambem tem o Compartilhar', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [PED], sc_cli: [CLI] });
    await page.evaluate(() => localStorage.setItem('sc_proposta_id', '26070'));
    await page.goto(BASE + '/proposta.html');
    await expect(page.locator('#btn-compartilhar-proposta')).toBeVisible();
    await expect(page.locator('#btn-email-proposta')).toBeVisible();
});

// --- E-mail com tudo preenchido -------------------------------------------

test('E-mail: baixa um rascunho .eml com destinatario, assunto, texto e o PDF anexado', async ({ page }) => {
    test.setTimeout(90000);
    await abrir(page, false);
    const download = page.waitForEvent('download', { timeout: 45000 });
    await page.click('#btn-email-proposta');
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^Proposta-.*Maria-Souza\.eml$/);
    const fs = require('fs');
    const eml = fs.readFileSync(await d.path(), 'latin1');
    expect(eml).toMatch(/^X-Unsent: 1\r\n/);
    expect(eml).toContain('\r\nTo: maria@exemplo.com\r\n');
    const assunto = eml.match(/\r\nSubject: =\?UTF-8\?B\?([^?]+)\?=/)[1];
    expect(Buffer.from(assunto, 'base64').toString('utf8')).toBe('Proposta comercial nº 26070 — Lírio Cortinas');
    const partes = eml.split(/--sctech_\w+/);
    const corpo = partes.find(p => p.includes('text/plain')).split('\r\n\r\n')[1].replace(/\s/g, '');
    expect(Buffer.from(corpo, 'base64').toString('utf8')).toContain('Olá Maria!');
    const anexo = partes.find(p => p.includes('application/pdf'));
    expect(anexo).toContain('Content-Disposition: attachment');
    const pdf = Buffer.from(anexo.split('\r\n\r\n')[1].replace(/\s/g, ''), 'base64');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(20000);

    // reserva para Gmail no navegador: mailto preenchido + PDF para anexar
    const ajuda = page.locator('#compartilhar-email');
    await expect(ajuda).toBeVisible();
    const mail = await ajuda.locator('a:has-text("Abrir e-mail preenchido")').getAttribute('href');
    expect(mail).toMatch(/^mailto:maria%40exemplo\.com\?subject=Proposta%20comercial/);
    const pdfDl = page.waitForEvent('download');
    await ajuda.locator('button:has-text("Baixar o PDF")').click();
    expect((await pdfDl).suggestedFilename()).toMatch(/\.pdf$/);
});

test('E-mail: cliente sem e-mail avisa que o destinatario vai em branco', async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => { navigator.canShare = undefined; });
    await entrar(page, BASE, { sc_ped: [PED], sc_cli: [{ id: 1, nome: 'Joao' }] });
    await page.goto(BASE + '/pedidos.html');
    await page.evaluate(() => abrirPropostaModal(26070));
    const download = page.waitForEvent('download', { timeout: 45000 });
    await page.click('#btn-email-proposta');
    const eml = require('fs').readFileSync(await (await download).path(), 'latin1');
    expect(eml).not.toContain('\r\nTo:');
    await expect(page.locator('#compartilhar-email')).toContainText('não tem e-mail cadastrado');
});
