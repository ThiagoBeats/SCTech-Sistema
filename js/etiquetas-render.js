// Renderizacao dos codigos de barras / QR (bibliotecas via CDN, sob demanda) e
// codigo de pedido nos documentos (OS e Proposta). Somente navegador.
const MSG_FALHA_CONEXAO_CODIGOS = 'Não foi possível carregar o gerador de códigos. Verifique a conexão com a internet e tente novamente.';

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

async function documentoProntoParaImprimir(container) {
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
