// Layout dos documentos: cada documento sai montado pelo layout salvo em
// Configurar Empresa (sc_doc_layouts). Sem layout salvo, sai como sempre saiu.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const AMB = { id: 1, amb: 'Sala', abertura: 'C', largura: 3, altura: 2.6, calculado: true,
    tecidos: [{ tecidoNome: 'Linho', prega: 'Wave Botao', fator: 2 }] };
const PED = { id: 26050, clienteId: 1, clienteNome: 'Maria', status: 'Orçamento', valor: 100, ambientes: [AMB], observacoes: 'Entregar pela manhã' };
const CLI = { id: 1, nome: 'Maria', tel: '(11) 9999-0000' };

// Layout completo da proposta (como o editor salva), com alteracoes.
function layoutProposta(mudar) {
    const l = {
        estilo: { cor: null, destaque: null, fundo: null, fonte: 'sistema', marca: { ativa: false, tamanho: 'M', opacidade: 8 } },
        titulo: 'PROPOSTA COMERCIAL',
        blocos: [
            { id: 'cabecalho', variante: 'esquerda', visivel: true },
            { id: 'cliente', variante: 'lista', visivel: true, titulo: 'Cliente' },
            { id: 'ambientes', variante: 'padrao', visivel: true },
            { id: 'observacoes', variante: 'padrao', visivel: true, titulo: 'Observações' },
            { id: 'totais', variante: 'direita', visivel: true, titulo: 'VALOR TOTAL' },
            { id: 'condicoes', variante: 'simples', visivel: true, titulo: 'Condições Gerais', corpo: 'Linha 1' },
            { id: 'aprovacao', variante: 'padrao', visivel: true, corpo: 'Assinatura do cliente:' }
        ]
    };
    mudar(l);
    return { versao: 1, docs: { proposta: l } };
}

async function abrirProposta(page, extras) {
    await entrar(page, BASE, Object.assign({ sc_ped: [PED], sc_cli: [CLI], sc_proposta_id: 26050 }, extras || {}));
    await page.goto(BASE + '/proposta.html');
    const doc = page.locator('#proposta-container');
    await expect(doc.locator('.proposta-header')).toBeVisible();
    return doc;
}

test('sem layout salvo a proposta mantem a estrutura de hoje', async ({ page }) => {
    const doc = await abrirProposta(page);
    const ordem = await doc.locator('.proposta-header, .proposta-cliente, .proposta-tabela, .proposta-totais, .proposta-termos, .proposta-aprovacao')
        .evaluateAll(els => els.map(e => [...e.classList].find(c => c.startsWith('proposta-'))));
    expect(ordem).toEqual(['proposta-header', 'proposta-cliente', 'proposta-tabela', 'proposta-totais', 'proposta-termos', 'proposta-aprovacao']);
    await expect(doc.locator('.proposta-info h2')).toHaveText('PROPOSTA COMERCIAL');
    await expect(doc.locator('.proposta-cliente h3')).toHaveText('Cliente');
    await expect(doc.locator('.proposta-termos h4')).toHaveText('Condições Gerais');
    await expect(doc.locator('.proposta-termos li').first()).toHaveText('Proposta válida por 15 dias a partir da data de emissão.');
    await expect(doc.locator('.doc-marca-dagua')).toHaveCount(0);
    expect(await doc.locator('.doc-layout').getAttribute('style') || '').not.toContain('--primary');
    const cor = await doc.locator('.proposta-header').evaluate(e => getComputedStyle(e).borderBottomColor);
    expect(cor).toBe('rgb(0, 93, 59)');
});

test('layout salvo muda cor, titulo, esconde totais e insere dado', async ({ page }) => {
    const layouts = layoutProposta(l => {
        l.estilo.cor = '#7A1F3D';
        l.titulo = 'ORÇAMENTO {cliente}';
        l.blocos.find(b => b.id === 'totais').visivel = false;
        l.blocos.push({ id: 'proprio-1', proprio: true, variante: 'caixa', visivel: true, titulo: 'Sobre nós', corpo: 'Atendemos {cliente} desde {xyz}' });
    });
    const doc = await abrirProposta(page, { sc_doc_layouts: layouts });
    await expect(doc.locator('.proposta-info h2')).toHaveText('ORÇAMENTO Maria');
    await expect(doc.locator('.proposta-totais')).toHaveCount(0);
    await expect(doc.locator('.doc-bloco-proprio-1')).toContainText('Sobre nós');
    await expect(doc.locator('.doc-bloco-proprio-1')).toContainText('Atendemos Maria desde {xyz}');
    const cor = await doc.locator('.proposta-header').evaluate(e => getComputedStyle(e).borderBottomColor);
    expect(cor).toBe('rgb(122, 31, 61)');
});

test('blocos seguem a ordem do layout e a assinatura continua funcionando', async ({ page }) => {
    const layouts = layoutProposta(l => {
        const i = l.blocos.findIndex(b => b.id === 'aprovacao');
        const [ap] = l.blocos.splice(i, 1);
        l.blocos.splice(1, 0, ap);
    });
    const doc = await abrirProposta(page, { sc_doc_layouts: layouts });
    const ordem = await doc.locator('.doc-bloco').evaluateAll(els => els.map(e => e.dataset.bloco));
    expect(ordem.slice(0, 3)).toEqual(['cabecalho', 'aprovacao', 'cliente']);
    await expect(doc.locator('.proposta-aprovacao canvas.assinatura-canvas')).toHaveCount(1);
    await expect(doc.locator('.sc-codigo-doc')).toHaveCount(1);
});

test('condicoes gerais antigas aparecem na proposta', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [PED], sc_cli: [CLI], sc_proposta_id: 26050 });
    // o sistema guarda as condicoes como texto puro, nao JSON
    await page.evaluate(() => localStorage.setItem('sc_cond_gerais', 'Pagamento à vista'));
    await page.goto(BASE + '/proposta.html');
    await expect(page.locator('#proposta-container .proposta-termos li')).toHaveText(['Pagamento à vista']);
});

test('marca dagua aparece com logo e some sem logo', async ({ page }) => {
    const layouts = layoutProposta(l => { l.estilo.marca = { ativa: true, tamanho: 'G', opacidade: 12 }; });
    let doc = await abrirProposta(page, { sc_doc_layouts: layouts, sc_empresa: { razao_social: 'Lírio', logo_base64: PNG } });
    await expect(doc.locator('.doc-marca-dagua img')).toHaveCount(1);
    expect(await doc.locator('.doc-marca-dagua').evaluate(e => getComputedStyle(e).opacity)).toBe('0.12');
    doc = await abrirProposta(page, { sc_doc_layouts: layouts, sc_empresa: { razao_social: 'Lírio' } });
    await expect(doc.locator('.doc-marca-dagua')).toHaveCount(0);
});

test('texto do usuario e escapado', async ({ page }) => {
    const layouts = layoutProposta(l => {
        l.blocos.push({ id: 'proprio-1', proprio: true, variante: 'simples', visivel: true, titulo: '<i>T</i>', corpo: '<b>x</b>' });
    });
    const doc = await abrirProposta(page, { sc_doc_layouts: layouts });
    await expect(doc.locator('.doc-bloco-proprio-1')).toContainText('<b>x</b>');
    await expect(doc.locator('.doc-bloco-proprio-1 b')).toHaveCount(0);
});

test('layout corrompido nao quebra o documento', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [PED], sc_cli: [CLI], sc_proposta_id: 26050 });
    await page.evaluate(() => localStorage.setItem('sc_doc_layouts', '{quebrado'));
    await page.goto(BASE + '/proposta.html');
    await expect(page.locator('#proposta-container .proposta-info h2')).toHaveText('PROPOSTA COMERCIAL');
});

// --- OS e Pedido de Compra ---------------------------------------------------
const PED_OS = Object.assign({}, PED, { status: 'Em produção', data_entrega: '2026-12-01', itens: [{ nome: 'Trilho', quantidade: 2, unidade: 'un' }] });

async function abrirOS(page, extras) {
    await entrar(page, BASE, Object.assign({ sc_ped: [PED_OS], sc_cli: [CLI], sc_os_id: 26050 }, extras || {}));
    await page.goto(BASE + '/os.html');
    const doc = page.locator('#os-container');
    await expect(doc.locator('.os-header')).toBeVisible();
    return doc;
}

test('OS sem layout mantem a estrutura e o aviso de hoje', async ({ page }) => {
    const doc = await abrirOS(page);
    for (const c of ['.os-header', '.os-cliente-bar', '.os-amb-card', '.os-assinaturas']) await expect(doc.locator(c)).toHaveCount(1);
    await expect(doc.locator('.os-titulo')).toHaveText('ORDEM DE SERVIÇO INTERNA');
    await expect(doc.locator('.os-aviso')).toHaveText('⚠ SEM VALOR COMERCIAL — USO EXCLUSIVAMENTE INTERNO');
    await expect(doc.locator('.os-assinatura-item .os-section-title')).toHaveText(['Costureira', 'Instalador', 'Conferência (Gerência)']);
    await expect(doc.locator('.os-section-title', { hasText: 'Materiais e Acessórios' })).toHaveCount(1);
});

test('OS com layout: esconde assinaturas, aviso com dado e materiais renomeado', async ({ page }) => {
    const l = { blocos: [
        { id: 'cabecalho', variante: 'esquerda', visivel: true, aviso: 'Uso interno — {cliente}' },
        { id: 'materiais', variante: 'padrao', visivel: true, titulo: 'Ferragens' },
        { id: 'assinaturas', variante: 'lado', visivel: false }
    ] };
    const doc = await abrirOS(page, { sc_doc_layouts: { versao: 1, docs: { os: l } } });
    await expect(doc.locator('.os-aviso')).toHaveText('Uso interno — Maria');
    await expect(doc.locator('.os-assinaturas')).toHaveCount(0);
    await expect(doc.locator('.os-section-title', { hasText: 'Ferragens' })).toHaveCount(1);
    // materiais veio logo depois do cabecalho, como no layout salvo
    const ordem = await doc.locator('.doc-bloco').evaluateAll(els => els.map(e => e.dataset.bloco));
    expect(ordem.slice(0, 2)).toEqual(['cabecalho', 'materiais']);
});

test('OS: legendas das assinaturas editaveis', async ({ page }) => {
    const l = { blocos: [{ id: 'assinaturas', variante: 'empilhadas', visivel: true, corpo: 'Costura | Nome\nMontagem | Data' }] };
    const doc = await abrirOS(page, { sc_doc_layouts: { versao: 1, docs: { os: l } } });
    await expect(doc.locator('.os-assinatura-item .os-section-title')).toHaveText(['Costura', 'Montagem', 'Conferência (Gerência)']);
    await expect(doc.locator('.os-assinatura-item small').first()).toHaveText('Nome');
    await expect(doc.locator('.doc-bloco-assinaturas.doc-var-empilhadas canvas.assinatura-canvas')).toHaveCount(3);
});

const PC = { id: 26001, fornecedor_id: 1, fornecedor_nome: 'Tecidos RC', status: 'Rascunho', pedido_venda_id: 26050, observacoes: 'Urgente',
    itens: [{ tipo: 'tecido', item_id: 7, item_nome: 'Linho', referencia: 'LN-1', quantidade: 6, unidade: 'm', preco_unit: 50, subtotal: 300 }],
    especificacoes: [{ amb: 'Sala', largura: 3, altura: 2.6, abertura: 'C', tecidos: [{ tecido_id: 7, tecido_nome: 'Linho', prega: 'Wave Botao', fator: 2, num_panos: 3, alt_corte: 2.75 }] }] };

async function abrirCompra(page, extras) {
    await entrar(page, BASE, Object.assign({ sc_ped: [PED], sc_cli: [CLI], sc_pc: [PC], sc_forn: [{ id: 1, nome: 'Tecidos RC', cnpj: '1' }], sc_pc_id: 26001 }, extras || {}));
    await page.addInitScript(() => { window.print = () => {}; });
    await page.goto(BASE + '/pedido-compra.html');
    const doc = page.locator('#pedido-compra-container');
    await expect(doc.locator('.pc-header')).toBeVisible();
    return doc;
}

test('pedido de compra sem layout mantem a estrutura de hoje', async ({ page }) => {
    const doc = await abrirCompra(page);
    await expect(doc.locator('.pc-header')).toContainText('PEDIDO DE COMPRA');
    await expect(doc.locator('.pc-especificacoes .pc-section-title')).toHaveText('Especificações — Pedido #26050 — Maria');
    await expect(doc.locator('.pc-section-title')).toHaveText(['Cliente', 'Fornecedor', 'Itens Solicitados', 'Especificações — Pedido #26050 — Maria', 'Observações', 'Solicitado por', 'Aprovado por', 'Recebido por']);
});

test('pedido de compra com layout: cor, especificacoes antes dos itens, titulo do documento', async ({ page }) => {
    const l = { titulo: 'SOLICITAÇÃO {numero}', estilo: { cor: '#1F3A5F' }, blocos: [
        { id: 'cabecalho', variante: 'direita', visivel: true },
        { id: 'especificacoes', variante: 'padrao', visivel: true, titulo: 'Medidas — {origem}' },
        { id: 'itens', variante: 'padrao', visivel: true, titulo: 'Itens' }
    ] };
    const doc = await abrirCompra(page, { sc_doc_layouts: { versao: 1, docs: { compra: l } } });
    await expect(doc.locator('.pc-header')).toContainText('SOLICITAÇÃO 26001');
    const titulos = await doc.locator('.pc-section-title').allTextContents();
    expect(titulos.indexOf('Medidas — Pedido #26050 — Maria')).toBeLessThan(titulos.indexOf('Itens'));
    const cor = await doc.locator('.pc-header').evaluate(e => getComputedStyle(e).borderBottomColor);
    expect(cor).toBe('rgb(31, 58, 95)');
});
