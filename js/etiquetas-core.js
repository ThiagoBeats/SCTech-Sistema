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
                el.mostrar_rotulo = b.campo === 'numero' || b.campo === 'volume';
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

    const ROTULOS_CAMPO = { numero: 'PEDIDO #', volume: 'VOLUME ', entrega: 'Entrega: ', telefone: 'Tel: ' };

    function txt(v) { return v === null || v === undefined ? '' : String(v); }

    // Converte YYYY-MM-DD em DD/MM/AAAA por texto, sem Date (evita erro de fuso).
    function formatarDataBR(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(s));
        return m ? m[3] + '/' + m[2] + '/' + m[1] : txt(s);
    }

    // Textos de uma etiqueta de pedido/volume (tudo string).
    function valoresEtiquetaPedido(pedido, cliente, volume, total, logoUrl) {
        const p = pedido || {};
        const c = cliente || null;
        return {
            numero: txt(p.id),
            cliente: txt((c && c.nome) || p.clienteNome),
            endereco: txt(c && c.end),
            telefone: txt(c && c.tel),
            entrega: formatarDataBR(p.data_entrega),
            vendedor: txt(p.vendedor_nome || p.arq_nome),
            status: txt(p.status),
            ambientes: String((p.ambientes || []).length),
            observacoes: txt(p.observacoes),
            volume: volume + '/' + total,
            logo: txt(logoUrl)
        };
    }

    // Dados de exemplo para pre-visualizar o modelo no editor.
    function pedidoExemplo() {
        return {
            pedido: {
                id: 26001, clienteNome: 'Maria Souza', data_entrega: '2026-11-14', vendedor_nome: 'Carlos',
                status: 'Pronto p/ Instalação', observacoes: 'Entregar no periodo da manha',
                ambientes: [{ nome: 'Sala' }, { nome: 'Quarto' }, { nome: 'Cozinha' }], volumes: 3
            },
            cliente: { nome: 'Maria Souza', end: 'R. das Flores, 120 – Centro', tel: '(11) 98888-7777' }
        };
    }

    function esc(s) {
        return txt(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    const CAMPOS_MULTILINHA = ['endereco', 'observacoes'];
    const ALINHAMENTO_CSS = { esq: 'left', centro: 'center', dir: 'right' };
    const MM_POR_PT = 0.3528;

    // HTML da etiqueta: serve para pre-visualizacao e impressao. Cada elemento leva data-id.
    function htmlEtiqueta(modelo, valores, svgs) {
        const v = valores || {};
        const s = svgs || {};
        const partes = (modelo.elementos || []).map(el => {
            const fonte = el.fonte_pt || 10;
            let estilo = 'position:absolute;left:' + el.x_mm + 'mm;top:' + el.y_mm + 'mm;width:' + el.w_mm +
                'mm;height:' + el.h_mm + 'mm;overflow:hidden;box-sizing:border-box;';
            let conteudo = '';
            if (el.tipo === 'campo' || el.tipo === 'texto') {
                let texto;
                if (el.tipo === 'texto') texto = txt(el.texto);
                else {
                    const val = txt(v[el.campo]);
                    texto = (el.mostrar_rotulo !== false && val !== '' ? (ROTULOS_CAMPO[el.campo] || '') : '') + val;
                }
                estilo += 'font-size:' + fonte + 'pt;font-weight:' + (el.negrito ? 'bold' : 'normal') +
                    ';text-align:' + (ALINHAMENTO_CSS[el.alinhamento] || 'left') + ';line-height:1.15;';
                if (el.tipo === 'campo' && CAMPOS_MULTILINHA.indexOf(el.campo) >= 0) {
                    const linhas = Math.max(1, Math.floor(el.h_mm / (fonte * MM_POR_PT * 1.15)));
                    estilo += 'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:' + linhas + ';';
                } else {
                    estilo += 'white-space:nowrap;text-overflow:ellipsis;';
                }
                conteudo = esc(texto);
            } else if (el.tipo === 'logo') {
                conteudo = v.logo ? '<img src="' + esc(v.logo) + '" style="width:100%;height:100%;object-fit:contain">' : '';
            } else if (el.tipo === 'linha') {
                estilo += 'border-top:0.3mm solid #000;height:0;';
            } else if (el.tipo === 'barcode' || el.tipo === 'qrcode') {
                conteudo = s[el.tipo] ||
                    '<div class="etq-cod-ph" style="width:100%;height:100%;box-sizing:border-box;border:0.3mm dashed #888;' +
                    'display:flex;align-items:center;justify-content:center;font-size:7pt;color:#666">código</div>';
            }
            return '<div data-id="' + esc(el.id) + '" style="' + estilo + '">' + conteudo + '</div>';
        });
        return '<div class="etq" style="position:relative;width:' + modelo.largura_mm + 'mm;height:' + modelo.altura_mm +
            'mm;overflow:hidden;background:#fff;color:#000;font-family:Arial,sans-serif">' + partes.join('') + '</div>';
    }

    // ---- conferencia de volumes (nunca mexe no status do pedido) ----
    function conferenciaVazia() {
        return { volumes_conferidos: [], concluida_em: null, conferido_por: null };
    }

    function _lista(pedido) {
        return (pedido && pedido.conferencia && Array.isArray(pedido.conferencia.volumes_conferidos))
            ? pedido.conferencia.volumes_conferidos : [];
    }

    function temConferenciaIniciada(pedido) {
        return _lista(pedido).length > 0;
    }

    function avaliarLeitura(texto, ativoId, pedidos) {
        const l = lerCodigo(texto);
        if (l.tipo === 'invalido') return { tipo: 'invalido' };
        const ped = (pedidos || []).find(p => p.id == l.pedidoId);
        if (!ped) return { tipo: 'nao_encontrado', pedidoId: l.pedidoId };
        if (l.tipo === 'pedido') {
            return ped.volumes == null
                ? { tipo: 'sem_etiquetas', pedidoId: l.pedidoId }
                : { tipo: 'abrir', pedidoId: l.pedidoId };
        }
        if (ativoId == null) return { tipo: 'consulta', pedidoId: l.pedidoId };
        if (ativoId != l.pedidoId) return { tipo: 'outro_pedido', pedidoId: l.pedidoId, ativoId: ativoId };
        if (l.total !== ped.volumes) return { tipo: 'etiqueta_desatualizada', pedidoId: l.pedidoId };
        if (_lista(ped).indexOf(l.volume) >= 0) return { tipo: 'repetido', pedidoId: l.pedidoId, volume: l.volume };
        return { tipo: 'conferir', pedidoId: l.pedidoId, volume: l.volume };
    }

    function marcarVolume(pedido, volume, usuarioNome, agora) {
        if (!pedido.conferencia) pedido.conferencia = conferenciaVazia();
        if (!Array.isArray(pedido.conferencia.volumes_conferidos)) pedido.conferencia.volumes_conferidos = [];
        if (!Array.isArray(pedido.timeline)) pedido.timeline = [];
        const lista = pedido.conferencia.volumes_conferidos;
        if (lista.indexOf(volume) < 0) lista.push(volume);
        lista.sort((a, b) => a - b);
        const concluiu = pedido.volumes > 0 && lista.length >= pedido.volumes;
        if (concluiu) {
            pedido.conferencia.concluida_em = agora;
            pedido.conferencia.conferido_por = usuarioNome;
            pedido.timeline.push({
                status: 'Conferência', data: agora,
                label: 'Conferido na expedição por ' + usuarioNome + ' — ' + pedido.volumes + ' volume(s)'
            });
        }
        return { concluiu: concluiu };
    }

    function zerarConferencia(pedido, motivo, agora) {
        const havia = temConferenciaIniciada(pedido);
        if (!havia) return false;
        pedido.conferencia = conferenciaVazia();
        if (!Array.isArray(pedido.timeline)) pedido.timeline = [];
        pedido.timeline.push({ status: 'Conferência', data: agora, label: 'Conferência zerada: ' + motivo });
        return true;
    }

    function alterarVolumes(pedido, novoTotal, agora) {
        const antigo = pedido.volumes;
        pedido.volumes = novoTotal;
        if (antigo === novoTotal) return { zerou: false };
        const zerou = zerarConferencia(pedido, 'volumes alterados de ' + antigo + ' para ' + novoTotal, agora);
        return { zerou: zerou };
    }

    function marcacaoConferencia(pedido) {
        const n = _lista(pedido).length;
        if (!n) return null;
        if (pedido.conferencia.concluida_em) return { texto: '✓ Conferido', cls: 'badge-conferido' };
        return { texto: n + '/' + pedido.volumes + ' conferidos', cls: 'badge-conferindo' };
    }

    const api = {
        montarCodigoVolume, lerCodigo, FORMATOS_ETIQUETA, CAMPOS_ETIQUETA_PEDIDO, TIPOS_ELEMENTO,
        modeloPadraoPedido, ajustarAoFormato, encaixarNaGrade, avisosLegibilidade, lerConfigEtiquetas,
        ROTULOS_CAMPO, valoresEtiquetaPedido, pedidoExemplo, htmlEtiqueta,
        conferenciaVazia, avaliarLeitura, marcarVolume, zerarConferencia, alterarVolumes,
        temConferenciaIniciada, marcacaoConferencia
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.EtiquetasCore = api;

})(typeof window !== 'undefined' ? window : null);
