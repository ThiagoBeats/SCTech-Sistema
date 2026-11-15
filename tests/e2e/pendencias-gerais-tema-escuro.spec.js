// Pendencias gerais — tema escuro em todas as telas e janelas.
// Em cada tela principal (e em janelas/abas importantes) nenhum bloco visivel
// pode ter fundo claro, e nenhum texto pode ficar escuro sobre fundo escuro.
// Documentos (proposta, OS, pedido de compra, relatorios no papel, etiquetas)
// ficam claros de proposito e sao ignorados.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const somar = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return iso(d); };
const HOJE = somar(0);

const ITENS = [{ tipo: 'tecido', item_id: 1, item_nome: 'TRICO HERA', unidade: 'm', quantidade: 5, preco_unit: 100, subtotal: 500 }];
const DADOS = {
    sc_forn: [{ id: 7, nome: 'RC Tecidos', cnpj: '', telefone: '(11) 99999-0000' }, { id: 8, nome: 'Outro Forn' }],
    sc_cat: [
        { id: 1, referencia: 'C-001', nome: 'TRICO HERA', preco: 167, largura_rolo: 1.4, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos' },
        { id: 2, referencia: 'C-002', nome: 'LINHO CRU', preco: 120, largura_rolo: 2.8 }
    ],
    sc_est: [
        { id: 11, tecido_id: 1, lote: 'BANHO-77', metragem_inicial: 30, metragem_atual: 25, data_entrada: '2026-10-05' },
        { id: 12, tecido_id: 2, lote: 'R-9', metragem_inicial: 40, metragem_atual: 0, data_entrada: '2026-10-05' }
    ],
    sc_mat: [
        { id: 21, referencia: 'TR-01', nome: 'TRILHO SUISSO', unidade: 'm', estoque_atual: 12, estoque_minimo: 20, preco: 30, fornecedor_id: 7 },
        { id: 22, referencia: 'SUP-02', nome: 'SUPORTE DUPLO', unidade: 'un', estoque_atual: 50, preco: 5 }
    ],
    sc_kits: [{ id: 31, referencia: 'KIT-A', nome: 'KIT INSTALACAO', descricao: 'parafusos e buchas', itens: [] }],
    sc_cli: [{ id: 1, nome: 'Maria Cliente', telefone: '(11) 98888-7777', cpf: '', email: 'm@x.com' }],
    sc_vend: [{ id: 1, nome: 'Joao Vendedor', comissao: 5, tipo: 'vendedor' }],
    sc_ped: [
        { id: 26301, cliente_nome: 'Maria Cliente', status: 'Aprovado', data_criacao: Date.now(), data_aprovacao: HOJE, itens: [], total: 1500, valor_total: 1500, valor_final: 1500 },
        { id: 26302, cliente_nome: 'Pedro Cliente', status: 'Orcamento', data_criacao: Date.now(), itens: [], total: 800, valor_total: 800, valor_final: 800 }
    ].concat(['Medição', 'Aguardando Tecido', 'Na Costura', 'Pronto p/ Instalação', 'Aguardando Financeiro', 'Instalado / Entregue'].map((st, i) => (
        { id: 26310 + i, cliente_nome: 'Cliente ' + st, status: st, data_criacao: Date.now(), data_entrega: somar(i - 2), data_instalacao: somar(i - 1), itens: [], total: 900, valor_total: 900, valor_final: 900 }
    ))),
    sc_pc: [
        { id: 5001, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', data_criacao: Date.now(), status: 'Enviado', data_envio: '2026-10-05', itens: ITENS },
        { id: 5002, fornecedor_id: 7, fornecedor_nome: 'RC Tecidos', data_criacao: Date.now(), status: 'Rascunho', itens: ITENS }
    ],
    sc_carrinhos: [{ fornecedor_id: 7, novo: false, atualizado_em: 1, itens: [{ tipo: 'material', item_id: 21, item_nome: 'TRILHO SUISSO', unidade: 'm', quantidade: 3, preco_unit: 30, subtotal: 90 }] }],
    sc_contas_fin: [{ id: 10, nome: 'Caixa', tipo: 'caixa', saldo_inicial: 100, data_saldo_inicial: '2020-01-01', ativo: true }],
    sc_cr: [
        { id: 1, pedido_id: 26301, cliente_nome: 'Maria Cliente', descricao: 'Pedido 26301', valor: 700, data_vencimento: somar(-3), data_pagamento: null, status: 'Pendente', parcela_tipo: 'saldo' },
        { id: 2, pedido_id: 26301, cliente_nome: 'Maria Cliente', descricao: 'Sinal', valor: 300, data_vencimento: HOJE, data_pagamento: null, status: 'Pendente', parcela_tipo: 'sinal' }
    ],
    sc_cp: [
        { id: 3, descricao: 'Aluguel', fornecedor: 'Imob', valor: 900, data_vencimento: somar(-2), data_pagamento: null, status: 'Pendente', categoria: 'outros' },
        { id: 4, descricao: 'Tecido', fornecedor: 'RC Tecidos', valor: 400, data_vencimento: somar(5), data_pagamento: null, status: 'Pendente', categoria: 'outros' }
    ],
    sc_mov_fin: [{ id: 1, conta_id: 10, data: HOJE, sentido: 'entrada', valor: 321, origem: 'cr', origem_id: 9, grupo_id: null, descricao: 'Repasse' }]
};

// Roda dentro da pagina: devolve os blocos claros e os textos ilegiveis.
function varrer() {
    const lum = c => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const analisar = s => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
        return { c: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
    };
    const IGNORAR = '.etq, .etq-editor-folha, .dl-folha, .doc-claro, #doc-modal-paper, #os-container, #proposta-container, .doc-paper, .etiqueta, [data-doc], canvas, svg, img, iframe, .sc-etiqueta, .fin-simulador-svg, #toast-container';
    // fundo efetivo: percorre os ancestrais compondo translucidos sobre o primeiro opaco
    const fundoEfetivo = el => {
        const camadas = [];
        for (let e = el; e; e = e.parentElement) {
            const b = analisar(getComputedStyle(e).backgroundColor);
            if (b && b.a > 0) { camadas.push(b); if (b.a >= 0.99) break; }
        }
        let base = [255, 255, 255];
        if (!camadas.length || camadas[camadas.length - 1].a < 0.99) base = [20, 21, 24];
        for (let i = camadas.length - 1; i >= 0; i--) {
            const k = camadas[i];
            base = base.map((v, j) => v * (1 - k.a) + k.c[j] * k.a);
        }
        return base;
    };
    const claros = [], ilegiveis = [];
    const todos = document.querySelectorAll('body *');
    const descr = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
    for (const el of todos) {
        if (el.closest(IGNORAR)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) continue;
        const b = analisar(cs.backgroundColor);
        if (b && b.a >= 0.5 && r.width * r.height >= 300) {
            const L = lum(b.c);
            const lima = b.c[0] < 220 && b.c[1] > 225 && b.c[2] < 160;       // acento verde-limao
            const amarelo = b.c[0] > 225 && b.c[1] > 180 && b.c[2] < 90;     // pilulas de alerta
            if (L > 0.55 && !lima && !amarelo) claros.push(descr(el) + ' bg=' + cs.backgroundColor);
        }
        // texto proprio
        let temTexto = false;
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { temTexto = true; break; }
        if (temTexto && /[0-9A-Za-zÀ-ú]/.test(el.textContent) && cs.color !== 'rgb(255, 255, 255)') {
            const t = analisar(cs.color);
            if (t) {
                const fg = lum(t.c), bg = lum(fundoEfetivo(el));
                const razao = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
                if (razao < 2.6) ilegiveis.push(descr(el) + ' cor=' + cs.color + ' razao=' + razao.toFixed(2) + ' "' + el.textContent.trim().slice(0, 30) + '"');
            }
        }
    }
    return { claros: claros.slice(0, 15), ilegiveis: ilegiveis.slice(0, 15) };
}

async function conferir(page, rotulo) {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
    if (process.env.TEMA_SHOTS) await page.screenshot({ path: process.env.TEMA_SHOTS + '/tema-' + rotulo.replace(/[^a-z0-9]+/gi, '-') + '.png' });
    const r = await page.evaluate(varrer);
    expect.soft(r.claros, rotulo + ': blocos claros').toEqual([]);
    expect.soft(r.ilegiveis, rotulo + ': textos ilegiveis').toEqual([]);
}

async function abrirTela(page, arquivo, dados) {
    const { sc_tema, ...resto } = Object.assign({}, dados || {});
    await entrar(page, BASE, Object.assign({}, DADOS, resto));
    await page.evaluate(t => localStorage.setItem('sc_tema', t), sc_tema || 'dark');
    await page.goto(BASE + '/' + arquivo);
    if ((sc_tema || 'dark') === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}

const TELAS = [
    ['index.html', []],
    ['pedidos.html', []],
    ['pedido.html', []],
    ['clientes.html', []],
    ['vendedores.html', []],
    ['catalogo.html', ['mostrarTabCatalogo("tecidos")', 'mostrarTabCatalogo("materiais")', 'mostrarTabCatalogo("kits")', 'verDetalhesTecido(1)']],
    ['pcp.html', ['mostrarViewPCP("kanban")', 'mostrarViewPCP("agenda")', 'mostrarViewPCP("medicoes")', 'mostrarViewPCP("rotas")', 'mostrarModalPagamento({ id: 26314, valor: 900 }, () => {})']],
    ['estoque.html', ['mostrarTabEstoque("tecidos")', 'mostrarTabEstoque("materiais")', 'mostrarTabEstoque("kits")', 'mostrarTabEstoque("consulta")', 'abrirBalanco()', 'showConfirm("Tem certeza que deseja continuar?")', 'showAlert("Aviso de teste", "⚠️")']],
    ['fornecedores.html', ['mostrarTabFornecedores("lista")', 'mostrarTabFornecedores("pedidos")', 'mostrarTabFornecedores("novo")', 'abrirCarrinho(7)', 'abrirHistoricoFornecedor(7)']],
    ['financeiro.html', ['hoje', 'dashboard', 'resultado', 'simulador', 'receber', 'pagar', 'fixas', 'dre', 'extrato'].map(t => 'mostrarTabFinanceiro("' + t + '")').concat(['abrirModalContaPagar("novo")', 'abrirModalTransferencia()'])],
    ['configuracoes.html', ['perfil', 'preferencias', 'seguranca', 'acessos'].map(t => 'mostrarTabConfig("' + t + '")')],
    ['empresa.html', ['dados', 'preferencias', 'layout', 'etiquetas', 'galeria'].map(t => 'mostrarTabEmpresa("' + t + '")')],
    ['relatorios.html', ['faturamento', 'recebiveis', 'vendedores'].map(t => 'mostrarTabRel("' + t + '")')],
    ['dashboards.html', []],
    ['expedicao.html', []]
];

for (const [arquivo, passos] of TELAS) {
    test('tema escuro: ' + arquivo, async ({ page }) => {
        await abrirTela(page, arquivo);
        await conferir(page, arquivo);
        for (const passo of passos) {
            // recarrega a tela a cada passo: janelas do passo anterior nao se acumulam
            await page.reload();
            await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
            await page.evaluate(p => { (0, eval)(p); return null; }, passo);
            await conferir(page, arquivo + ' -> ' + passo);
        }
    });
}

test('tema escuro: janela de documento (papel) continua clara', async ({ page }) => {
    await abrirTela(page, 'pedidos.html');
    await page.evaluate(() => abrirDocModal('<div class="x" style="padding:10px"><h3>Titulo</h3><p>Texto</p><table><tr><th>A</th><td>B</td></tr></table></div>', 'Documento'));
    const papel = page.locator('#doc-modal-paper');
    await expect(papel).toBeVisible();
    const cores = await page.evaluate(() => {
        const g = s => getComputedStyle(document.querySelector(s));
        return { fundo: g('#doc-modal-paper').backgroundColor, texto: g('#doc-modal-paper p').color, th: g('#doc-modal-paper th').backgroundColor };
    });
    expect(cores.fundo).toBe('rgb(255, 255, 255)');
    expect(cores.texto).toBe('rgb(36, 36, 36)');
    expect(cores.th).toBe('rgb(245, 245, 245)');
});

test('tema claro: as cores claras de sempre continuam', async ({ page }) => {
    await abrirTela(page, 'pedidos.html', { sc_tema: 'light' });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    const v = await page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        return ['--surface-2', '--surface-3', '--info-bg', '--danger-bg', '--warn-bg', '--ok-bg', '--text-soft'].map(n => s.getPropertyValue(n).trim().toUpperCase());
    });
    expect(v).toEqual(['#FAFAFA', '#F1F1F1', '#EDF5FC', '#FDE8E5', '#FEF6D8', '#E3F7E2', '#555555']);
    const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fundo).not.toBe('rgb(20, 21, 24)');
    await page.goto(BASE + '/fornecedores.html');
    await page.evaluate(() => abrirCarrinho(7));
    await expect(page.locator('#carrinho-modal')).toBeVisible();
    const th = await page.evaluate(() => getComputedStyle(document.querySelector('#carrinho-modal thead tr')).backgroundColor);
    expect(th).toBe('rgb(241, 241, 241)');
});

// ---- documentos reais no tema escuro: sempre papel claro ----
const CLI = { id: 1, nome: 'Maria Souza', tel: '(47) 99999-1234', email: 'maria@exemplo.com', endereco: 'Rua A, 10' };
const PED_DOC = {
    id: 26050, clienteId: 1, status: 'Orçamento', valor: 1500, ambientes: [],
    itens: [{ nome: 'Trilho', quantidade: 2, unidade: 'un', preco: 30 }]
};

// Roda na pagina: luminancia do fundo efetivo (primeiro ancestral opaco) e cor do texto.
function medirDoc(seletores) {
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const rgb = s => { const m = s.match(/rgba?\(([^)]+)\)/); const p = m[1].split(/[ ,\/]+/).map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
    const fundo = el => { for (let e = el; e; e = e.parentElement) { const b = rgb(getComputedStyle(e).backgroundColor); if (b.a >= 0.99) return lum(b.c); } return 0; };
    const out = {};
    for (const sel of seletores) {
        const els = [...document.querySelectorAll(sel)];
        out[sel] = els.length ? { n: els.length, fundoMin: Math.min(...els.map(fundo)), textoMax: Math.max(...els.map(e => lum(rgb(getComputedStyle(e).color).c))) } : { n: 0 };
    }
    return out;
}
function exigirClaro(m, sels) {
    for (const sel of sels) {
        expect(m[sel].n, sel + ' existe').toBeGreaterThan(0);
        expect(m[sel].fundoMin, sel + ' fundo claro').toBeGreaterThan(0.7);
        expect(m[sel].textoMax, sel + ' texto escuro').toBeLessThan(0.4);
    }
}

test('tema escuro: proposta.html e os.html tem papel claro', async ({ page }) => {
    await abrirTela(page, 'proposta.html', { sc_ped: [PED_DOC], sc_cli: [CLI], sc_proposta_id: 26050 });
    await expect(page.locator('#proposta-container .proposta-header')).toBeVisible();
    exigirClaro(await page.evaluate(medirDoc, ['.proposta-wrapper', '#proposta-container', '#proposta-container .proposta-cliente', '#proposta-container table td', '#proposta-container table th']),
        ['.proposta-wrapper', '#proposta-container', '#proposta-container .proposta-cliente', '#proposta-container table td']);
    await abrirTela(page, 'os.html', { sc_ped: [PED_DOC], sc_cli: [CLI], sc_os_id: 26050 });
    await expect(page.locator('#os-container .os-header')).toBeVisible();
    exigirClaro(await page.evaluate(medirDoc, ['.os-wrapper', '#os-container', '#os-container .os-header', '#os-container table td']),
        ['.os-wrapper', '#os-container', '#os-container table td']);
});

test('tema escuro: pedido-compra.html tem papel claro', async ({ page }) => {
    await abrirTela(page, 'pedido-compra.html', { sc_pc_id: 5001 });
    await expect(page.locator('#pedido-compra-container table').first()).toBeVisible();
    exigirClaro(await page.evaluate(medirDoc, ['body', '#pedido-compra-container', '#pedido-compra-container table td', '#pedido-compra-container table th']),
        ['body', '#pedido-compra-container', '#pedido-compra-container table td']);
});

test('tema escuro: copia do documento para PDF continua clara', async ({ page }) => {
    await abrirTela(page, 'proposta.html', { sc_ped: [PED_DOC], sc_cli: [CLI], sc_proposta_id: 26050 });
    await expect(page.locator('#proposta-container .proposta-cliente')).toBeVisible();
    const m = await page.evaluate(() => {
        const { moldura } = _cloneParaPdf(document.getElementById('proposta-container'));
        moldura.style.cssText = 'position:absolute;left:0;top:0;z-index:99999';
        window.__moldura = moldura;
        return null;
    });
    if (process.env.TEMA_SHOTS) await page.screenshot({ path: process.env.TEMA_SHOTS + '/tema-pdf-clone-proposta.png', fullPage: false });
    const med = await page.evaluate(medirDoc, ['.compartilhar-pdf-render', '.compartilhar-pdf-render .proposta-cliente', '.compartilhar-pdf-render table td', '.compartilhar-pdf-render table th']);
    exigirClaro(med, ['.compartilhar-pdf-render', '.compartilhar-pdf-render .proposta-cliente', '.compartilhar-pdf-render table td']);
});

test('tema escuro: janela "Confirmar Entrega" tem cartao escuro e texto legivel', async ({ page }) => {
    await abrirTela(page, 'pcp.html');
    await page.evaluate(() => mostrarModalPagamento({ id: 26314, valor: 900 }, () => {}));
    await expect(page.locator('#mpg-sim')).toBeVisible();
    if (process.env.TEMA_SHOTS) await page.screenshot({ path: process.env.TEMA_SHOTS + '/final-confirmar-entrega.png' });
    const m = await page.evaluate(() => {
        const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const nums = s => s.match(/[\d.]+/g).map(Number);
        const cartao = document.querySelector('#mpg-sim').parentElement.parentElement;
        const bg = lum(nums(getComputedStyle(cartao).backgroundColor));
        const textos = [...cartao.querySelectorAll('h3, p, span, strong')].map(e => lum(nums(getComputedStyle(e).color)));
        return { bg, textoMin: Math.min(...textos) };
    });
    expect(m.bg, 'cartao escuro').toBeLessThan(0.25);
    expect(m.textoMin, 'texto claro o bastante').toBeGreaterThan(0.2);
});

test('tema escuro: pre-visualizacao do Layout de documentos (OS e Proposta) fica clara', async ({ page }) => {
    await abrirTela(page, 'empresa.html', { sc_ped: [] });   // sem pedido real: a previa usa o exemplo, com ambientes
    await page.evaluate(() => mostrarTabEmpresa('layout'));
    for (const doc of ['os', 'proposta']) {
        await page.selectOption('#dl-doc', doc);
        await expect(page.locator('#dl-previa .' + (doc === 'os' ? 'os-amb-head' : 'proposta-cliente')).first()).toBeVisible();
        if (process.env.TEMA_SHOTS) await page.screenshot({ path: process.env.TEMA_SHOTS + '/final-layout-' + doc + '.png' });
        const sels = doc === 'os' ? ['#dl-previa', '#dl-previa .os-th', '#dl-previa .os-amb-head'] : ['#dl-previa', '#dl-previa .proposta-cliente'];
        exigirClaro(await page.evaluate(medirDoc, sels), sels);
    }
    // o cabecalho de empresa.html tambem e documento
    await page.evaluate(() => mostrarTabEmpresa('dados'));
    exigirClaro(await page.evaluate(medirDoc, ['#emp-cabecalho-preview']), ['#emp-cabecalho-preview']);
});
