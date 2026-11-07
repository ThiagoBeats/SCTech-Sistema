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

    const api = { montarCodigoVolume, lerCodigo };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.EtiquetasCore = api;

})(typeof window !== 'undefined' ? window : null);
