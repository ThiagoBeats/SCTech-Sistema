// Layout dos documentos impressos (proposta, OS, pedido de compra, agendamento de
// medicao e relatorio financeiro): catalogo de blocos e campos, padroes, leitura
// tolerante do que foi salvo e troca dos marcadores {campo}.
// So funcoes puras — sem DOM, sem db, sem localStorage — para rodar em `node --test`.
(function (raiz) {
    'use strict';

    const V_CABECALHO = [
        { id: 'esquerda', nome: 'Logo à esquerda' },
        { id: 'centro', nome: 'Logo centralizada' },
        { id: 'direita', nome: 'Logo à direita' }
    ];
    const V_PESSOA = [
        { id: 'lista', nome: 'Uma coluna' },
        { id: 'colunas', nome: 'Duas colunas' },
        { id: 'faixa', nome: 'Faixa compacta' }
    ];
    const V_TOTAIS = [
        { id: 'direita', nome: 'Alinhado à direita' },
        { id: 'largura', nome: 'Largura total' }
    ];
    const V_ASSINATURAS = [
        { id: 'lado', nome: 'Lado a lado' },
        { id: 'empilhadas', nome: 'Uma embaixo da outra' }
    ];
    const V_TEXTO = [
        { id: 'simples', nome: 'Simples' },
        { id: 'caixa', nome: 'Caixa com fundo' },
        { id: 'lateral', nome: 'Linha lateral' }
    ];
    const V_UNICA = [{ id: 'padrao', nome: 'Padrão' }];

    const COND_GERAIS_PADRAO = [
        'Proposta válida por {diasValidade} dias a partir da data de emissão.',
        'O prazo de produção inicia após a confirmação formal e o recebimento do sinal combinado.',
        'As medidas estão sujeitas a conferência técnica in loco antes do corte definitivo do tecido.',
        'Alterações no projeto após a aprovação podem gerar custos adicionais.',
        'Não nos responsabilizamos por variações de tonalidade entre rolos de tecido de lotes distintos não informados previamente.'
    ].join('\n');

    const CAMPOS_COMUNS = [
        { chave: 'empresa', nome: 'Nome da empresa' },
        { chave: 'empresa_telefone', nome: 'Telefone da empresa' },
        { chave: 'empresa_email', nome: 'E-mail da empresa' },
        { chave: 'empresa_site', nome: 'Site da empresa' },
        { chave: 'empresa_endereco', nome: 'Endereço da empresa' },
        { chave: 'empresa_cnpj', nome: 'CNPJ da empresa' }
    ];

    // Em cada bloco, variantes[0] e o visual de hoje. `titulo`, `corpo` e `aviso`
    // presentes no catalogo sao textos editaveis; `texto: true` marca os blocos
    // que sao so texto (desenhados pelo mesmo modelo dos blocos proprios).
    // Nas assinaturas, cada linha do corpo e "Titulo | legenda", na ordem.
    const DOCUMENTOS = {
        proposta: {
            nome: 'Proposta Comercial',
            titulo: 'PROPOSTA COMERCIAL',
            blocos: [
                { id: 'cabecalho', nome: 'Cabeçalho', variantes: V_CABECALHO, fixo: true },
                { id: 'cliente', nome: 'Dados do cliente', variantes: V_PESSOA, titulo: 'Cliente' },
                { id: 'ambientes', nome: 'Ambientes', variantes: V_UNICA },
                { id: 'observacoes', nome: 'Observações do pedido', variantes: V_UNICA, titulo: 'Observações' },
                { id: 'totais', nome: 'Totais', variantes: V_TOTAIS, titulo: 'VALOR TOTAL' },
                { id: 'condicoes', nome: 'Condições gerais', variantes: V_TEXTO, texto: true, titulo: 'Condições Gerais', corpo: COND_GERAIS_PADRAO },
                { id: 'aprovacao', nome: 'Aprovação e assinatura', variantes: V_UNICA, corpo: 'Assinatura do cliente:' }
            ],
            campos: [
                { chave: 'cliente', nome: 'Nome do cliente' },
                { chave: 'cliente_telefone', nome: 'Telefone do cliente' },
                { chave: 'cliente_email', nome: 'E-mail do cliente' },
                { chave: 'cliente_endereco', nome: 'Endereço do cliente' },
                { chave: 'numero', nome: 'Número da proposta' },
                { chave: 'data_emissao', nome: 'Data de emissão' },
                { chave: 'validade', nome: 'Válida até' },
                { chave: 'diasValidade', nome: 'Dias de validade' },
                { chave: 'total', nome: 'Valor total' },
                { chave: 'previsao_entrega', nome: 'Previsão de entrega' },
                { chave: 'vendedor', nome: 'Vendedor' },
                { chave: 'forma_pagamento', nome: 'Forma de pagamento' }
            ]
        },
        os: {
            nome: 'Ordem de Serviço',
            titulo: 'ORDEM DE SERVIÇO INTERNA',
            blocos: [
                { id: 'cabecalho', nome: 'Cabeçalho', variantes: V_CABECALHO, fixo: true, aviso: '⚠ SEM VALOR COMERCIAL — USO EXCLUSIVAMENTE INTERNO' },
                { id: 'cliente', nome: 'Cliente', variantes: [{ id: 'faixa', nome: 'Faixa compacta' }], titulo: 'Cliente' },
                { id: 'ambientes', nome: 'Ambientes', variantes: V_UNICA },
                { id: 'materiais', nome: 'Materiais e acessórios', variantes: V_UNICA, titulo: 'Materiais e Acessórios' },
                { id: 'observacoes', nome: 'Observações', variantes: V_UNICA, titulo: 'Observações' },
                { id: 'assinaturas', nome: 'Assinaturas', variantes: V_ASSINATURAS,
                    corpo: 'Costureira | Nome / Assinatura / Data conclusão\nInstalador | Nome / Assinatura / Data instalação\nConferência (Gerência) | Nome / Visto / Data' }
            ],
            campos: [
                { chave: 'cliente', nome: 'Nome do cliente' },
                { chave: 'numero', nome: 'Número da OS' },
                { chave: 'data_emissao', nome: 'Data de emissão' },
                { chave: 'previsao_entrega', nome: 'Previsão de entrega' },
                { chave: 'status', nome: 'Status' }
            ]
        },
        compra: {
            nome: 'Pedido de Compra',
            titulo: 'PEDIDO DE COMPRA',
            blocos: [
                { id: 'cabecalho', nome: 'Cabeçalho', variantes: V_CABECALHO, fixo: true },
                { id: 'cliente', nome: 'Cliente de origem', variantes: V_UNICA, titulo: 'Cliente' },
                { id: 'fornecedor', nome: 'Fornecedor', variantes: V_UNICA, titulo: 'Fornecedor' },
                { id: 'itens', nome: 'Itens', variantes: V_UNICA, titulo: 'Itens Solicitados' },
                { id: 'especificacoes', nome: 'Especificações', variantes: V_UNICA, titulo: 'Especificações — {origem}' },
                { id: 'observacoes', nome: 'Observações', variantes: V_UNICA, titulo: 'Observações' },
                { id: 'assinaturas', nome: 'Assinaturas', variantes: V_ASSINATURAS,
                    corpo: 'Solicitado por | Nome / Data\nAprovado por | Nome / Data\nRecebido por | Nome / Assinatura / Data' }
            ],
            campos: [
                { chave: 'fornecedor', nome: 'Fornecedor' },
                { chave: 'numero', nome: 'Número do pedido' },
                { chave: 'data_emissao', nome: 'Data de emissão' },
                { chave: 'total', nome: 'Total estimado' },
                { chave: 'cliente_origem', nome: 'Cliente de origem' },
                { chave: 'pedido_venda', nome: 'Pedido de venda' },
                { chave: 'origem', nome: 'Pedido de venda e cliente' }
            ]
        },
        medicao: {
            nome: 'Agendamento de Medição',
            titulo: 'AGENDAMENTO DE MEDIÇÃO',
            blocos: [
                { id: 'cabecalho', nome: 'Cabeçalho', variantes: V_CABECALHO, fixo: true },
                { id: 'cliente', nome: 'Dados do cliente', variantes: V_PESSOA, titulo: 'Dados do Cliente' },
                { id: 'agendamento', nome: 'Dados do agendamento', variantes: V_PESSOA, titulo: 'Dados do Agendamento' },
                { id: 'assinatura', nome: 'Assinatura', variantes: V_UNICA, corpo: 'Assinatura do responsável' },
                { id: 'rodape', nome: 'Rodapé', variantes: V_UNICA, corpo: '{empresa}\nID do agendamento: {id}' }
            ],
            campos: [
                { chave: 'cliente', nome: 'Nome do cliente' },
                { chave: 'cliente_telefone', nome: 'Telefone do cliente' },
                { chave: 'data_visita', nome: 'Data da visita' },
                { chave: 'horario', nome: 'Horário' },
                { chave: 'responsavel', nome: 'Responsável' },
                { chave: 'endereco_visita', nome: 'Endereço da visita' },
                { chave: 'id', nome: 'ID do agendamento' }
            ]
        },
        financeiro: {
            nome: 'Relatório Financeiro',
            titulo: 'Relatório Financeiro · {periodo}',
            blocos: [
                { id: 'cabecalho', nome: 'Cabeçalho', variantes: V_CABECALHO, fixo: true },
                { id: 'indicadores', nome: 'Indicadores', variantes: V_UNICA },
                { id: 'graficos', nome: 'Gráficos', variantes: V_UNICA },
                { id: 'recebimentos', nome: 'Próximos recebimentos', variantes: V_UNICA, titulo: '📥 Próximos Recebimentos' },
                { id: 'pagamentos', nome: 'Próximos pagamentos', variantes: V_UNICA, titulo: '📤 Próximos Pagamentos' },
                { id: 'rodape', nome: 'Rodapé', variantes: V_UNICA, corpo: 'Relatório gerado pelo sistema SCTech · {data_geracao}' }
            ],
            campos: [
                { chave: 'periodo', nome: 'Período' },
                { chave: 'data_geracao', nome: 'Data de geração' }
            ]
        }
    };

    const FONTES = [
        { id: 'sistema', nome: 'Padrão do sistema', familia: null, google: null },
        { id: 'arial', nome: 'Arial', familia: 'Arial, Helvetica, sans-serif', google: null },
        { id: 'georgia', nome: 'Georgia', familia: "Georgia, 'Times New Roman', serif", google: null },
        { id: 'lora', nome: 'Lora', familia: "'Lora', Georgia, serif", google: 'Lora' },
        { id: 'montserrat', nome: 'Montserrat', familia: "'Montserrat', Arial, sans-serif", google: 'Montserrat' },
        { id: 'playfair', nome: 'Playfair Display', familia: "'Playfair Display', Georgia, serif", google: 'Playfair Display' },
        { id: 'nunito', nome: 'Nunito', familia: "'Nunito', Arial, sans-serif", google: 'Nunito' }
    ];

    const PALETAS = [
        { id: 'sctech', nome: 'Padrão do sistema', cor: null, destaque: null, fundo: null },
        { id: 'vinho', nome: 'Vinho e dourado', cor: '#7A1F3D', destaque: '#C9A96E', fundo: '#FBF6F0' },
        { id: 'salvia', nome: 'Verde sálvia', cor: '#3D5A4A', destaque: '#C9A96E', fundo: '#EEF2EF' },
        { id: 'marinho', nome: 'Azul marinho', cor: '#1F3A5F', destaque: '#D4A373', fundo: '#F1F4F8' },
        { id: 'grafite', nome: 'Grafite', cor: '#333333', destaque: '#B08D57', fundo: '#F4F4F4' },
        { id: 'terracota', nome: 'Terracota', cor: '#9C4A2F', destaque: '#E0B084', fundo: '#FBF3EE' }
    ];

    const TAMANHOS_MARCA = ['P', 'M', 'G'];
    const RE_COR = /^#[0-9a-f]{6}$/i;
    const RE_PROPRIO = /^proprio-\d+$/;
    const TEXTOS = ['titulo', 'corpo', 'aviso'];

    function _doc(docId) {
        const d = DOCUMENTOS[docId];
        if (!d) throw new Error('documento desconhecido: ' + docId);
        return d;
    }

    function _estiloPadrao() {
        return { cor: null, destaque: null, fundo: null, fonte: 'sistema', marca: { ativa: false, tamanho: 'M', opacidade: 8 } };
    }

    function _blocoPadrao(cat) {
        const b = { id: cat.id, variante: cat.variantes[0].id, visivel: true };
        for (const k of TEXTOS) if (typeof cat[k] === 'string') b[k] = cat[k];
        return b;
    }

    function padrao(docId) {
        const d = _doc(docId);
        return { estilo: _estiloPadrao(), titulo: d.titulo, blocos: d.blocos.map(_blocoPadrao) };
    }

    function ler(json) {
        let o = null;
        try { o = JSON.parse(json); } catch (e) { o = null; }
        if (!o || typeof o !== 'object' || Array.isArray(o) || !o.docs || typeof o.docs !== 'object' || Array.isArray(o.docs)) {
            return { versao: 1, docs: {} };
        }
        return { versao: 1, docs: o.docs };
    }

    function _cor(v) { return typeof v === 'string' && RE_COR.test(v) ? v : null; }

    function _estilo(salvo) {
        const e = _estiloPadrao();
        if (!salvo || typeof salvo !== 'object') return e;
        e.cor = _cor(salvo.cor);
        e.destaque = _cor(salvo.destaque);
        e.fundo = _cor(salvo.fundo);
        if (FONTES.some(f => f.id === salvo.fonte)) e.fonte = salvo.fonte;
        const m = salvo.marca;
        if (m && typeof m === 'object') {
            e.marca.ativa = m.ativa === true;
            if (TAMANHOS_MARCA.includes(m.tamanho)) e.marca.tamanho = m.tamanho;
            if (typeof m.opacidade === 'number' && isFinite(m.opacidade)) e.marca.opacidade = Math.min(20, Math.max(3, Math.round(m.opacidade)));
        }
        return e;
    }

    function _fundirBloco(cat, s) {
        const b = _blocoPadrao(cat);
        if (!s) return b;
        if (cat.variantes.some(v => v.id === s.variante)) b.variante = s.variante;
        if (!cat.fixo && typeof s.visivel === 'boolean') b.visivel = s.visivel;
        for (const k of TEXTOS) if (k in b && typeof s[k] === 'string') b[k] = s[k];
        return b;
    }

    function _proprio(s) {
        return {
            id: s.id,
            proprio: true,
            titulo: typeof s.titulo === 'string' ? s.titulo : '',
            corpo: typeof s.corpo === 'string' ? s.corpo : '',
            variante: V_TEXTO.some(v => v.id === s.variante) ? s.variante : 'simples',
            visivel: s.visivel !== false
        };
    }

    function doDocumento(layouts, docId) {
        const d = _doc(docId);
        const salvo = layouts && layouts.docs && layouts.docs[docId];
        if (!salvo || typeof salvo !== 'object') return padrao(docId);
        const lista = Array.isArray(salvo.blocos) ? salvo.blocos.filter(s => s && typeof s === 'object' && typeof s.id === 'string') : [];
        const porId = {};
        for (const s of lista) if (!(s.id in porId)) porId[s.id] = s;
        const cabCat = d.blocos.find(b => b.fixo);
        const blocos = [_fundirBloco(cabCat, porId[cabCat.id])];
        const usados = new Set([cabCat.id]);
        for (const s of lista) {
            if (usados.has(s.id)) continue;
            const cat = d.blocos.find(b => b.id === s.id);
            if (cat) blocos.push(_fundirBloco(cat, s));
            else if (RE_PROPRIO.test(s.id)) blocos.push(_proprio(s));
            else continue;
            usados.add(s.id);
        }
        for (const cat of d.blocos) if (!usados.has(cat.id)) blocos.push(_blocoPadrao(cat));
        return {
            estilo: _estilo(salvo.estilo),
            titulo: typeof salvo.titulo === 'string' ? salvo.titulo : d.titulo,
            blocos
        };
    }

    function _clonar(o) { return JSON.parse(JSON.stringify(o)); }

    function copiarEstilo(destino, origem) {
        const r = _clonar(destino);
        r.estilo = _clonar(origem.estilo);
        const cabO = origem.blocos.find(b => b.id === 'cabecalho');
        const cabR = r.blocos.find(b => b.id === 'cabecalho');
        if (cabO && cabR) cabR.variante = cabO.variante;
        return r;
    }

    function novoBlocoProprio(layout) {
        const r = _clonar(layout);
        let n = 1;
        for (const b of r.blocos) {
            const m = /^proprio-(\d+)$/.exec(b.id);
            if (m) n = Math.max(n, Number(m[1]) + 1);
        }
        r.blocos.push({ id: 'proprio-' + n, proprio: true, variante: 'simples', visivel: true, titulo: 'Novo texto', corpo: '' });
        return r;
    }

    function preencher(texto, valores, escapar) {
        return String(texto == null ? '' : texto).replace(/\{(\w+)\}/g, (m, k) => {
            if (!valores || !Object.prototype.hasOwnProperty.call(valores, k)) return m;
            const v = valores[k];
            return v == null ? '' : escapar(String(v));
        });
    }

    function variaveisCss(estilo) {
        if (!estilo) return '';
        let css = '';
        if (estilo.cor) css += '--primary:' + estilo.cor + ';--doc-cor:' + estilo.cor + ';';
        if (estilo.destaque) css += '--doc-destaque:' + estilo.destaque + ';';
        if (estilo.fundo) css += '--doc-fundo:' + estilo.fundo + ';';
        const f = FONTES.find(x => x.id === estilo.fonte);
        if (f && f.familia) css += '--doc-fonte:' + f.familia + ';';
        return css;
    }

    function migrarCondicoes(layouts, textoAntigo) {
        if (!textoAntigo || typeof textoAntigo !== 'string' || textoAntigo === COND_GERAIS_PADRAO) return layouts;
        if (layouts && layouts.docs && layouts.docs.proposta) return layouts;
        const l = padrao('proposta');
        l.blocos.find(b => b.id === 'condicoes').corpo = textoAntigo;
        const docs = Object.assign({}, layouts && layouts.docs, { proposta: l });
        return { versao: 1, docs };
    }

    const api = {
        DOCUMENTOS, CAMPOS_COMUNS, FONTES, PALETAS, COND_GERAIS_PADRAO, VARIANTES_TEXTO: V_TEXTO,
        padrao, ler, doDocumento, copiarEstilo, novoBlocoProprio, preencher, variaveisCss, migrarCondicoes
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else raiz.DocsLayout = api;
})(typeof window !== 'undefined' ? window : this);
