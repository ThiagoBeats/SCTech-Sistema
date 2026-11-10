// Editor do layout dos documentos (Configurar Empresa): painel a esquerda,
// folha a direita mudando na hora; salvar grava em sc_doc_layouts.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function abrirEditor(page, extras) {
    await entrar(page, BASE, Object.assign({ sc_empresa: { razao_social: 'Lírio Cortinas' } }, extras || {}));
    await page.goto(BASE + '/empresa.html');
    const ed = page.locator('#dl-editor');
    await ed.scrollIntoViewIfNeeded();
    await expect(ed.locator('#dl-previa .doc-layout')).toBeVisible();
    return ed;
}
const salvos = page => page.evaluate(() => JSON.parse(localStorage.getItem('sc_doc_layouts') || 'null'));
async function confirmar(page) { await page.locator('#sc-modal-ok').click(); }

test('previa sem registros usa o exemplo', async ({ page }) => {
    const ed = await abrirEditor(page);
    await expect(ed.locator('#dl-doc')).toHaveValue('proposta');
    await expect(ed.locator('#dl-previa')).toContainText('Maria Souza');
    await expect(ed.locator('#dl-previa .proposta-header')).toBeVisible();
});

test('previa usa o registro real mais recente quando existe', async ({ page }) => {
    const ped = { id: 26070, clienteId: 5, status: 'Orçamento', valor: 10, ambientes: [] };
    const ed = await abrirEditor(page, { sc_ped: [ped], sc_cli: [{ id: 5, nome: 'Joana Real' }] });
    await expect(ed.locator('#dl-previa')).toContainText('Joana Real');
});

test('trocar a cor muda a previa na hora e salvar persiste', async ({ page }) => {
    const ed = await abrirEditor(page);
    await ed.locator('#dl-cor').fill('#7a1f3d');
    const borda = () => ed.locator('#dl-previa .proposta-header').evaluate(e => getComputedStyle(e).borderBottomColor);
    await expect.poll(borda).toBe('rgb(122, 31, 61)');
    await ed.locator('#dl-salvar').click();
    expect((await salvos(page)).docs.proposta.estilo.cor.toLowerCase()).toBe('#7a1f3d');
    await page.reload();
    await expect(page.locator('#dl-cor')).toHaveValue('#7a1f3d');
});

test('paleta pronta aplica as tres cores', async ({ page }) => {
    const ed = await abrirEditor(page);
    await ed.locator('.dl-paleta[data-paleta="marinho"]').click();
    await expect(ed.locator('#dl-cor')).toHaveValue('#1f3a5f');
    await expect(ed.locator('#dl-destaque')).toHaveValue('#d4a373');
});

test('inserir dado poe o marcador e a previa preenche', async ({ page }) => {
    const ed = await abrirEditor(page);
    await ed.locator('#dl-titulo').fill('ORÇAMENTO PARA ');
    await ed.locator('.dl-inserir-dado[data-alvo="dl-titulo"]').click();
    await ed.locator('.dl-campo[data-chave="cliente"]').click();
    await expect(ed.locator('#dl-titulo')).toHaveValue('ORÇAMENTO PARA {cliente}');
    await expect(ed.locator('#dl-previa .proposta-info h2')).toHaveText('ORÇAMENTO PARA Maria Souza');
});

test('esconder e mover bloco', async ({ page }) => {
    const ed = await abrirEditor(page);
    await ed.locator('.dl-bloco[data-bloco="totais"] .dl-visivel').uncheck();
    await expect(ed.locator('#dl-previa .proposta-totais')).toHaveCount(0);
    await ed.locator('.dl-bloco[data-bloco="aprovacao"] .dl-subir').click();
    const ordem = () => ed.locator('#dl-previa .doc-bloco').evaluateAll(els => els.map(e => e.dataset.bloco));
    await expect.poll(ordem).toEqual(['cabecalho', 'cliente', 'ambientes', 'observacoes', 'aprovacao', 'condicoes']);
    // o cabecalho nao se esconde nem se move
    await expect(ed.locator('.dl-bloco[data-bloco="cabecalho"] .dl-visivel')).toHaveCount(0);
    await expect(ed.locator('.dl-bloco[data-bloco="cabecalho"] .dl-subir')).toHaveCount(0);
});

test('bloco proprio: adicionar, editar e remover', async ({ page }) => {
    const ed = await abrirEditor(page);
    await ed.locator('#dl-novo-bloco').click();
    const b = ed.locator('.dl-bloco[data-bloco="proprio-1"]');
    await b.locator('.dl-bloco-titulo').fill('Sobre nós');
    await b.locator('.dl-bloco-corpo').fill('Há 20 anos');
    await expect(ed.locator('#dl-previa .doc-bloco-proprio-1')).toContainText('Há 20 anos');
    await b.locator('.dl-remover').click();
    await expect(ed.locator('#dl-previa .doc-bloco-proprio-1')).toHaveCount(0);
});

test('copiar estilo de outro documento', async ({ page }) => {
    const l = { estilo: { cor: '#9c4a2f' }, titulo: 'PROPOSTA X', blocos: [{ id: 'cabecalho', variante: 'centro', visivel: true }] };
    const ed = await abrirEditor(page, { sc_doc_layouts: { versao: 1, docs: { proposta: l } } });
    await ed.locator('#dl-doc').selectOption('os');
    await ed.locator('#dl-copiar').selectOption('proposta');
    await expect(ed.locator('#dl-cor')).toHaveValue('#9c4a2f');
    await expect(ed.locator('#dl-titulo')).toHaveValue('ORDEM DE SERVIÇO INTERNA');
    await expect(ed.locator('.dl-bloco[data-bloco="cabecalho"] .dl-variante')).toHaveValue('centro');
});

test('voltar ao padrao apaga o layout do documento', async ({ page }) => {
    const ed = await abrirEditor(page, { sc_doc_layouts: { versao: 1, docs: { os: { titulo: 'X' }, proposta: { titulo: 'Y' } } } });
    await ed.locator('#dl-doc').selectOption('os');
    await expect(ed.locator('#dl-titulo')).toHaveValue('X');
    await ed.locator('#dl-padrao').click();
    await confirmar(page);
    await expect(ed.locator('#dl-titulo')).toHaveValue('ORDEM DE SERVIÇO INTERNA');
    const s = await salvos(page);
    expect(s.docs.os).toBeUndefined();
    expect(s.docs.proposta.titulo).toBe('Y');
});

test('condicoes antigas aparecem no editor e o card antigo saiu', async ({ page }) => {
    await entrar(page, BASE, {});
    await page.evaluate(() => localStorage.setItem('sc_cond_gerais', 'Pagamento à vista'));
    await page.goto(BASE + '/empresa.html');
    await expect(page.locator('#emp-condicoes-gerais')).toHaveCount(0);
    await expect(page.locator('.dl-bloco[data-bloco="condicoes"] .dl-bloco-corpo')).toHaveValue('Pagamento à vista');
});

test('trocar de documento com alteracao pendente pergunta', async ({ page }) => {
    const ed = await abrirEditor(page);
    await ed.locator('#dl-titulo').fill('MUDEI');
    await ed.locator('#dl-doc').selectOption('os');
    await expect(page.locator('#sc-modal-msg')).toContainText('não salvas');
    await page.locator('#sc-modal-cancel').click();
    await expect(ed.locator('#dl-doc')).toHaveValue('proposta');
    await expect(ed.locator('#dl-titulo')).toHaveValue('MUDEI');
});

test('logo no fundo: desabilitada sem logo, liga com logo', async ({ page }) => {
    let ed = await abrirEditor(page);
    await expect(ed.locator('#dl-marca')).toBeDisabled();
    ed = await abrirEditor(page, { sc_empresa: { razao_social: 'L', logo_base64: PNG } });
    await ed.locator('#dl-marca').check();
    await expect(ed.locator('#dl-previa .doc-marca-dagua img')).toHaveCount(1);
});

test('fonte escolhida chega na previa', async ({ page }) => {
    const ed = await abrirEditor(page);
    await ed.locator('#dl-fonte').selectOption('georgia');
    await expect.poll(() => ed.locator('#dl-previa .proposta-info h2').evaluate(e => getComputedStyle(e).fontFamily)).toContain('Georgia');
});

test('cada documento abre na previa', async ({ page }) => {
    const ed = await abrirEditor(page);
    const marcas = { os: '.os-header', compra: '.pc-header', medicao: '.doc-layout-medicao', financeiro: '.fin-cab' };
    for (const [doc, sel] of Object.entries(marcas)) {
        await ed.locator('#dl-doc').selectOption(doc);
        await expect(ed.locator('#dl-previa ' + sel)).toBeVisible();
    }
});
