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
});
