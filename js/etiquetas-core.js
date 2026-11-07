'use strict';
// Nucleo das etiquetas de pedido: formato e leitura do codigo de pedido/volume.
// So funcoes puras — sem DOM, sem db, sem localStorage — para rodar em `node --test`.
(function (raiz) {

    const REGEX_CODIGO = /^(\d+)(?:-(\d+)-(\d+))?$/;

    // Codigo do volume: numero do pedido, volume e total de volumes separados por hifen.
    function montarCodigoVolume(pedidoId, volume, total) {
        return pedidoId + '-' + volume + '-' + total;
    }

    // Le o texto de um codigo (digitado ou lido por leitor). Retorna sempre um objeto com `tipo`.
    function lerCodigo(texto) {
        if (texto === null || texto === undefined) return { tipo: 'invalido' };
        const m = REGEX_CODIGO.exec(String(texto).trim());
        if (!m) return { tipo: 'invalido' };
        const pedidoId = parseInt(m[1], 10);
        if (m[2] === undefined) return { tipo: 'pedido', pedidoId };
        const volume = parseInt(m[2], 10);
        const total = parseInt(m[3], 10);
        if (volume < 1 || total < 1 || volume > total) return { tipo: 'invalido' };
        return { tipo: 'volume', pedidoId, volume, total };
    }

    const FORMATOS_ETIQUETA = [
        { id: '100x50', label: '100 x 50 mm', largura_mm: 100, altura_mm: 50 },
        { id: '100x100', label: '100 x 100 mm', largura_mm: 100, altura_mm: 100 },
        { id: '100x150', label: '100 x 150 mm', largura_mm: 100, altura_mm: 150 },
        { id: '60x40', label: '60 x 40 mm', largura_mm: 60, altura_mm: 40 },
        { id: '50x30', label: '50 x 30 mm', largura_mm: 50, altura_mm: 30 }
    ];

    const CAMPOS_ETIQUETA_PEDIDO = [
        { campo: 'numero', label: 'Nº do pedido' },
        { campo: 'cliente', label: 'Cliente' },
        { campo: 'endereco', label: 'Endereço' },
        { campo: 'telefone', label: 'Telefone' },
        { campo: 'entrega', label: 'Data de entrega' },
        { campo: 'vendedor', label: 'Vendedor' },
        { campo: 'status', label: 'Status' },
        { campo: 'ambientes', label: 'Qtd. de ambientes' },
        { campo: 'observacoes', label: 'Observações' },
        { campo: 'volume', label: 'Volume' }
    ];

    const TIPOS_ELEMENTO = ['campo', 'texto', 'logo', 'linha', 'barcode', 'qrcode'];

    // Arredonda para a grade de 1 mm (minimo 0).
    function encaixarNaGrade(mm) {
        const n = Math.round(Number(mm));
        return n > 0 ? n : 0;
    }

    function idFormato(l, a) {
        const f = FORMATOS_ETIQUETA.find(p => p.largura_mm === l && p.altura_mm === a);
        return f ? f.id : 'custom';
    }

    // Traz os elementos para dentro da etiqueta, encolhendo o que nao cabe. Nao muta a entrada.
    function ajustarAoFormato(modelo, largura_mm, altura_mm) {
        const ajustados = [];
        const elementos = (modelo.elementos || []).map(el => {
            const n = Object.assign({}, el);
            n.w_mm = Math.max(1, Math.min(n.w_mm, largura_mm));
            n.h_mm = Math.max(1, Math.min(n.h_mm, altura_mm));
            n.x_mm = Math.max(0, Math.min(n.x_mm, largura_mm - n.w_mm));
            n.y_mm = Math.max(0, Math.min(n.y_mm, altura_mm - n.h_mm));
            if (n.x_mm !== el.x_mm || n.y_mm !== el.y_mm || n.w_mm !== el.w_mm || n.h_mm !== el.h_mm) ajustados.push(n.id);
            return n;
        });
        return {
            modelo: { formato: idFormato(largura_mm, altura_mm), largura_mm, altura_mm, elementos },
            ajustados
        };
    }

    // Layout base em 100 x 50 mm (inteiros); outros tamanhos escalam proporcionalmente.
    const BASE_PADRAO = [
        { tipo: 'campo', campo: 'numero', x: 3, y: 2, w: 58, h: 7, fonte: 14, negrito: true },
        { tipo: 'campo', campo: 'cliente', x: 3, y: 9, w: 58, h: 6, fonte: 11 },
        { tipo: 'campo', campo: 'endereco', x: 3, y: 15, w: 58, h: 8, fonte: 9 },
        { tipo: 'campo', campo: 'entrega', x: 3, y: 23, w: 58, h: 5, fonte: 9 },
        { tipo: 'campo', campo: 'volume', x: 3, y: 28, w: 58, h: 6, fonte: 12, negrito: true },
        { tipo: 'qrcode', x: 64, y: 8, w: 33, h: 33 },
        { tipo: 'barcode', x: 3, y: 36, w: 50, h: 11 }
    ];

    function modeloPadraoPedido(largura_mm = 100, altura_mm = 50) {
        const sx = largura_mm / 100;
        const sy = altura_mm / 50;
        const sf = Math.min(sx, sy, 1);
        let cont = 0;
        const elementos = BASE_PADRAO.map(b => {
            const el = {
                id: 'e' + (++cont),
                tipo: b.tipo,
                x_mm: Math.round(b.x * sx),
                y_mm: Math.round(b.y * sy),
                w_mm: Math.max(1, Math.round(b.w * sx)),
                h_mm: Math.max(1, Math.round(b.h * sy))
            };
            if (b.campo) {
                el.campo = b.campo;
                el.fonte_pt = Math.max(6, Math.round(b.fonte * sf));
                el.negrito = !!b.negrito;
                el.alinhamento = 'esq';
                el.mostrar_rotulo = false;
            }
            return el;
        });
        return ajustarAoFormato({ elementos }, largura_mm, altura_mm).modelo;
    }

    // Avisos de legibilidade para barras e QR (lista vazia quando esta tudo certo).
    function avisosLegibilidade(elemento, conteudo) {
        const avisos = [];
        if (elemento.tipo === 'barcode') {
            const n = String(conteudo === null || conteudo === undefined ? '' : conteudo).length;
            const modulos = 11 * (n + 2) + 13 + 20;
            const min = modulos * 0.25;
            if (elemento.w_mm < min) avisos.push(`Código de barras estreito demais para o scanner: use pelo menos ${Math.ceil(min)} mm de largura.`);
            if (elemento.h_mm < 8) avisos.push('Código de barras baixo demais: use pelo menos 8 mm de altura.');
        } else if (elemento.tipo === 'qrcode') {
            if (Math.min(elemento.w_mm, elemento.h_mm) < 15) avisos.push('QR Code pequeno demais para o scanner: use pelo menos 15 mm.');
        }
        return avisos;
    }

    function modeloValido(m) {
        return !!m && typeof m === 'object' && !Array.isArray(m)
            && typeof m.formato === 'string'
            && Number.isFinite(m.largura_mm) && m.largura_mm > 0
            && Number.isFinite(m.altura_mm) && m.altura_mm > 0
            && Array.isArray(m.elementos) && m.elementos.length > 0;
    }

    // Le a config salva; qualquer coisa invalida ou antiga volta ao modelo padrao.
    function lerConfigEtiquetas(json) {
        let obj = null;
        try { obj = json ? JSON.parse(json) : null; } catch (e) { obj = null; }
        const pedido = obj && obj.modelos && obj.modelos.pedido;
        return { modelos: { pedido: modeloValido(pedido) ? pedido : modeloPadraoPedido() } };
    }

    const api = {
        montarCodigoVolume, lerCodigo, FORMATOS_ETIQUETA, CAMPOS_ETIQUETA_PEDIDO, TIPOS_ELEMENTO,
        modeloPadraoPedido, ajustarAoFormato, encaixarNaGrade, avisosLegibilidade, lerConfigEtiquetas
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.EtiquetasCore = api;

})(typeof window !== 'undefined' ? window : null);
