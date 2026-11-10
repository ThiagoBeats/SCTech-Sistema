// Renderizacao dos codigos de barras / QR (bibliotecas via CDN, sob demanda) e
// codigo de pedido nos documentos (OS e Proposta). Somente navegador.
const MSG_FALHA_CONEXAO_CODIGOS = 'Não foi possível carregar o gerador de códigos. Verifique a conexão com a internet e tente novamente.';
const MSG_ETIQUETA_SEM_CODIGO = 'A etiqueta precisa ter pelo menos um código de barras ou QR Code.';

// Modelo de etiqueta salvo em uso para os pedidos.
function _etqModeloPedido() {
    return window.EtiquetasCore.lerConfigEtiquetas(localStorage.getItem('sc_etiqueta_cfg')).modelos.pedido;
}

const _LIBS_CODIGO = [
    { global: 'JsBarcode', url: 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js' },
    { global: 'qrcode', url: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js' }
];
let _libsCodigoPronto = null;

function _carregarScriptCodigo(lib) {
    return new Promise((resolve, reject) => {
        if (window[lib.global]) { resolve(); return; }
        const s = document.createElement('script');
        let fim = false;
        const falhar = () => {
            if (fim) return;
            fim = true;
            clearTimeout(t);
            s.remove();
            reject(new Error(MSG_FALHA_CONEXAO_CODIGOS));
        };
        const t = setTimeout(falhar, 10000);
        s.src = lib.url;
        s.onload = () => {
            if (fim) return;
            if (!window[lib.global]) { falhar(); return; }
            fim = true;
            clearTimeout(t);
            resolve();
        };
        s.onerror = falhar;
        document.head.appendChild(s);
    });
}

function garantirLibsCodigo() {
    if (!_libsCodigoPronto) {
        _libsCodigoPronto = Promise.all(_LIBS_CODIGO.map(_carregarScriptCodigo)).then(() => undefined);
        // Falhou: descarta o cache para permitir nova tentativa (as libs ja carregadas sao puladas).
        _libsCodigoPronto.catch(() => { _libsCodigoPronto = null; });
    }
    return _libsCodigoPronto;
}

function svgCodigoBarras(texto) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, String(texto), { format: 'CODE128', displayValue: false, margin: 0 });
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('preserveAspectRatio', 'none');
    return svg.outerHTML;
}

function svgQrCode(texto) {
    const qr = qrcode(0, 'M');
    qr.addData(String(texto));
    qr.make();
    return qr.createSvgTag({ scalable: true, margin: 0 })
        .replace(/<svg\b([^>]*)>/, (m, attrs) => {
            attrs = attrs.replace(/\s(width|height)="[^"]*"/g, '');
            return '<svg' + attrs + ' width="100%" height="100%">';
        });
}

function htmlCodigoDocumento(pedidoId) {
    return `<div class="sc-codigo-doc" data-codigo="${String(pedidoId).replace(/[^0-9-]/g, '')}"></div>`;
}

async function preencherCodigosDocumento(container) {
    if (!container) return true;
    const caixas = Array.from(container.querySelectorAll('.sc-codigo-doc'));
    if (!caixas.length) return true;
    try {
        await garantirLibsCodigo();
        caixas.forEach(el => {
            const cod = el.dataset.codigo;
            el.innerHTML = `<div class="sc-codigo-doc-barras">${svgCodigoBarras(cod)}</div><div class="sc-codigo-doc-num">${cod}</div>`;
            el.dataset.status = 'ok';
        });
        return true;
    } catch (e) {
        caixas.forEach(el => {
            el.innerHTML = `<div class="sc-codigo-falha no-print">⚠ ${MSG_FALHA_CONEXAO_CODIGOS}</div>`;
            el.dataset.status = 'falha';
        });
        return false;
    }
}

// A fonte do layout (Google Fonts) e carregada ao montar o documento; imprimir
// antes dela chegar sai com a fonte reserva. Espera no maximo 3 s.
function esperarFontesDocumento() {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.ready) return Promise.resolve();
    return Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]);
}

async function documentoProntoParaImprimir(container) {
    await esperarFontesDocumento();
    const ok = await preencherCodigosDocumento(container);
    if (!ok) { await showAlert(MSG_FALHA_CONEXAO_CODIGOS, '📡'); return false; }
    return true;
}

// Impressao direta das paginas os.html / proposta.html.
async function imprimirPaginaDocumento() {
    const c = document.getElementById('os-container') || document.getElementById('proposta-container');
    if (!await documentoProntoParaImprimir(c)) return;
    window.print();
}

// ---- impressao de etiquetas de pedido (por volume) ----
// Gancho substituivel nos testes: recebe o iframe pronto e imprime.
function _etqDispararPadrao(iframe) {
    const w = iframe.contentWindow;
    const limpar = () => setTimeout(() => iframe.remove(), 1000);
    w.addEventListener('afterprint', limpar);
    w.focus();
    w.print();
    setTimeout(limpar, 60000);
}

function imprimirEtiquetasHTML(paginas, largura_mm, altura_mm) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>' +
        '@page { size: ' + largura_mm + 'mm ' + altura_mm + 'mm; margin: 0 }' +
        'html,body{margin:0;padding:0}body{margin:0}' +
        '.etq{page-break-after:always;break-after:page}.etq:last-child{page-break-after:auto;break-after:auto}' +
        '</style></head><body>' + paginas.join('') + '</body></html>');
    doc.close();
    const disparar = typeof window._etqDispararImpressao === 'function' ? window._etqDispararImpressao : _etqDispararPadrao;
    disparar(iframe);
}

function _etqRerenderPagina() {
    if (typeof renderKanban === 'function') renderKanban();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof _expAposImprimirEtiquetas === 'function') _expAposImprimirEtiquetas();
}

async function imprimirEtiquetasDoPedido(pedidoId, somenteVolume) {
    const C = window.EtiquetasCore;
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped) return false;
    const modelo = _etqModeloPedido();
    // etiqueta sem codigo nao serve para a expedicao: nao imprime
    if (!C.modeloTemCodigo(modelo)) {
        await showAlert(MSG_ETIQUETA_SEM_CODIGO, '⚠️');
        return false;
    }
    try {
        await garantirLibsCodigo();
    } catch (e) {
        await showAlert(MSG_FALHA_CONEXAO_CODIGOS, '📡');
        return false;
    }
    const cliente = (db.clientes || []).find(c => c.id == ped.clienteId) || null;
    const emp = getEmpresa();
    const logo = emp.logo_base64 || new URL('images/logo.png', location.href).href;
    const total = ped.volumes || 1;
    const vols = somenteVolume ? [somenteVolume] : Array.from({ length: total }, (_, i) => i + 1);
    const paginas = vols.map(v => {
        const cod = C.montarCodigoVolume(ped.id, v, total);
        const valores = C.valoresEtiquetaPedido(ped, cliente, v, total, logo);
        return C.htmlEtiqueta(modelo, valores, { barcode: svgCodigoBarras(cod), qrcode: svgQrCode(cod), texto: cod });
    });
    imprimirEtiquetasHTML(paginas, modelo.largura_mm, modelo.altura_mm);
    return true;
}

function _etqFecharModalVolumes() {
    const o = document.getElementById('etq-modal-volumes');
    if (o) o.remove();
}

async function abrirImpressaoEtiquetas(pedidoId) {
    if (!await exigirPermissao('pedidos', 'visualizar')) return;
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped) return;
    _etqFecharModalVolumes();
    const qtd = ped.volumes || 1;
    const o = document.createElement('div');
    o.id = 'etq-modal-volumes';
    o.className = 'sc-modal-overlay';
    o.innerHTML = `<div class="sc-modal-box etq-vol-box">
        <div class="sc-modal-icon">🏷️</div>
        <p class="sc-modal-msg">Etiquetas do pedido #${escapeHtml(String(formatPedidoId(ped.id)))}</p>
        <div class="etq-vol-campos">
            <label class="etq-vol-linha">Quantidade de volumes
                <input type="number" id="etq-qtd-volumes" min="1" max="99" step="1" value="${qtd}"></label>
            <label class="etq-vol-linha"><input type="radio" name="etq-modo" id="etq-modo-todos" checked> Todos os volumes</label>
            <label class="etq-vol-linha"><input type="radio" name="etq-modo" id="etq-modo-um"> Só o volume
                <input type="number" id="etq-so-volume" min="1" max="99" step="1" value="1"></label>
        </div>
        <div class="sc-modal-btns">
            <button type="button" class="btn btn-outline" id="etq-btn-cancelar">Cancelar</button>
            <button type="button" class="btn btn-success" id="etq-btn-imprimir">Imprimir</button>
        </div>
    </div>`;
    document.body.appendChild(o);
    const q = id => document.getElementById(id);
    q('etq-so-volume').addEventListener('input', () => { q('etq-modo-um').checked = true; });
    q('etq-btn-cancelar').addEventListener('click', _etqFecharModalVolumes);
    q('etq-btn-imprimir').addEventListener('click', async () => {
        const novo = parseInt(q('etq-qtd-volumes').value, 10);
        if (!Number.isInteger(novo) || novo < 1 || novo > 99) { toast('Informe de 1 a 99 volumes.', 'warning'); return; }
        let so = null;
        if (q('etq-modo-um').checked) {
            so = parseInt(q('etq-so-volume').value, 10);
            if (!Number.isInteger(so) || so < 1 || so > novo) { toast('Volume inválido: informe de 1 a ' + novo + '.', 'warning'); return; }
        }
        _etqFecharModalVolumes();
        if (!window.EtiquetasCore.modeloTemCodigo(_etqModeloPedido())) {
            await showAlert(MSG_ETIQUETA_SEM_CODIGO, '⚠️');
            return;
        }
        // sem gerador de codigos nada e gravado: volumes e conferencia ficam como estao
        try {
            await garantirLibsCodigo();
        } catch (e) {
            await showAlert(MSG_FALHA_CONEXAO_CODIGOS, '📡');
            return;
        }
        const C = window.EtiquetasCore;
        const mudou = novo !== ped.volumes;
        if (mudou && C.temConferenciaIniciada(ped)) {
            const ok = await showConfirm('A conferência deste pedido será zerada porque a quantidade de volumes mudou. Continuar?', '⚠️', 'Continuar', 'Cancelar');
            if (!ok) return;
        }
        if (mudou) {
            C.alterarVolumes(ped, novo, Date.now());
            syncDB();
        }
        await imprimirEtiquetasDoPedido(ped.id, so);
        _etqRerenderPagina();
    });
    q('etq-qtd-volumes').focus();
}
