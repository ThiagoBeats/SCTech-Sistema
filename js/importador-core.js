'use strict';
// Nucleo do importador de tabelas de fornecedor: so funcoes puras.
// Sem DOM, sem db, sem localStorage — para poder rodar em `node --test`.
(function (raiz) {

    function normalizarNome(bruto) {
        if (bruto === null || bruto === undefined) return '';
        return String(bruto).replace(/\s+/g, ' ').trim();
    }

    function normalizarCodigo(bruto) {
        if (bruto === null || bruto === undefined) return { codigo: '', promocional: false };
        const texto = String(bruto).trim();
        const promocional = texto.startsWith('*');
        const codigo = texto.replace(/\*/g, '').replace(/\s+/g, '').toUpperCase();
        return { codigo, promocional };
    }

    function normalizarPreco(bruto) {
        const recusa = motivo => ({ valor: null, ok: false, motivo });
        if (bruto === null || bruto === undefined) return recusa('Preço em branco');
        if (typeof bruto === 'number') {
            if (!isFinite(bruto)) return recusa('Preço não é um número');
            if (bruto < 0) return recusa('Preço negativo não é válido');
            return { valor: Math.round(bruto * 100) / 100, ok: true, motivo: null };
        }
        const texto = String(bruto).trim();
        if (!texto) return recusa('Preço em branco');
        if (/^-+$/.test(texto)) return recusa('Preço "' + texto + '" — item sem preço na tabela');
        // tira R$, espacos e separador de milhar; vírgula vira ponto decimal
        const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
        const n = Number(limpo);
        if (!isFinite(n) || limpo === '') return recusa('Preço "' + texto + '" não é um número');
        if (n < 0) return recusa('Preço negativo não é válido');
        return { valor: Math.round(n * 100) / 100, ok: true, motivo: null };
    }

    function normalizarLargura(bruto) {
        // Rejeita valores negativos e vazio
        if (bruto === null || bruto === undefined || bruto === '') return { valor: null, aviso: null };

        // Se é número, valida e processa
        if (typeof bruto === 'number') {
            if (!isFinite(bruto) || bruto < 0) return { valor: null, aviso: null };
            const aviso = bruto > 10
                ? 'Largura ' + bruto + ' parece estar em centímetros; confira se deveria ser em metros'
                : null;
            return { valor: bruto, aviso };
        }

        // String: rejeita R$ (coluna mapeada errado), aceita unidades de comprimento
        const texto = String(bruto).trim();
        if (!texto || /R\$/.test(texto)) return { valor: null, aviso: null };

        // Parse: número com vírgula ou ponto como decimal, opcionalmente seguido de espaço e unidade (m, cm, mm)
        const match = texto.match(/^([\d]+[.,]?[\d]*)\s*([a-z]*)$/i);
        if (!match) return { valor: null, aviso: null };

        const numPart = match[1];
        if (!numPart) return { valor: null, aviso: null };

        // Converte vírgula em ponto e valida número
        const limpo = numPart.replace(',', '.');
        const n = Number(limpo);

        if (!isFinite(n) || n < 0) return { valor: null, aviso: null };

        // Arredonda para 2 casas decimais
        const valor = Math.round(n * 100) / 100;

        // Aviso se parece estar em centímetros
        const aviso = valor > 10
            ? 'Largura ' + valor + ' parece estar em centímetros; confira se deveria ser em metros'
            : null;

        return { valor, aviso };
    }

    // Rotulos que indicam que a linha e um cabecalho de tabela.
    const ROTULOS_CABECALHO = [
        /C[OÓ]D/i, /DESCRI/i, /NOME/i, /LARGURA/i, /PRE[CÇ]O/i,
        /CORTE/i, /PE[CÇ]A/i, /UNID/i, /QUANT/i, /COR/i, /REF/i
    ];

    // Padroes para detectar se um rotulo e de codigo ou de nome (para detectarCabecalho)
    const PADROES_CODIGO_CABECALHO = [/C[OÓ]D/i, /REF(ER[EÊ]NCIA)?/i];
    const PADROES_NOME_CABECALHO = [/DESCRI/i, /NOME/i, /PRODUTO/i, /ARTIGO/i];

    function _rotulosDaLinha(linha) {
        return (linha || []).map(c => normalizarNome(c));
    }

    function _ehRotuloCodigo(rotulo) {
        return rotulo && PADROES_CODIGO_CABECALHO.some(r => r.test(rotulo));
    }

    function _ehRotuloNome(rotulo) {
        return rotulo && PADROES_NOME_CABECALHO.some(r => r.test(rotulo));
    }

    function _ehLinhaComAspectoDeCabecalho(linha) {
        // Verifica se uma linha parece ser um cabeçalho (muitas células combinam com ROTULOS_CABECALHO)
        const rotulosNaLinha = (linha || []).map(c => normalizarNome(c));
        const contagemRotulos = rotulosNaLinha.filter(r => r && ROTULOS_CABECALHO.some(padrao => padrao.test(r))).length;
        // Se 2+ células parecem ser rótulos de coluna, é provável que seja um cabeçalho
        return contagemRotulos >= 2;
    }

    function detectarCabecalho(linhas) {
        const limite = Math.min((linhas || []).length, 15);
        let melhor = { indice: -1, pontos: 0, colunas: [] };
        let primeiroComCodigoENome = null;

        for (let i = 0; i < limite; i++) {
            const colunas = _rotulosDaLinha(linhas[i]);
            const preenchidas = colunas.filter(c => c !== '').length;
            if (preenchidas < 2) continue;
            const pontos = colunas.filter(c => c && ROTULOS_CABECALHO.some(r => r.test(c))).length;
            if (pontos >= 2 && pontos > melhor.pontos) melhor = { indice: i, pontos, colunas };

            // Verifica se esta linha tem AMBOS um rotulo de codigo E um rotulo de nome
            const temCodigo = colunas.some(c => _ehRotuloCodigo(c));
            const temNome = colunas.some(c => _ehRotuloNome(c));
            if (temCodigo && temNome && !primeiroComCodigoENome) {
                primeiroComCodigoENome = { indice: i, colunas };
            }
        }

        // Prefere o primeiro cabecalho com AMBOS codigo e nome, senao usa o melhor por pontos
        if (primeiroComCodigoENome) {
            return { indice: primeiroComCodigoENome.indice, colunas: primeiroComCodigoENome.colunas };
        }
        return melhor.indice === -1
            ? { indice: -1, colunas: [] }
            : { indice: melhor.indice, colunas: melhor.colunas };
    }

    function ehLinhaDeProduto(linha, mapa) {
        if (!linha || !mapa) return false;

        // Extrai o codigo e nome da linha
        const codigoBruto = mapa.codigo >= 0 ? linha[mapa.codigo] : undefined;
        const nomeBruto = mapa.nome >= 0 ? linha[mapa.nome] : undefined;

        // Normaliza
        const { codigo } = normalizarCodigo(codigoBruto);
        const nome = normalizarNome(nomeBruto);

        // Rejeita se nao tem codigo ou nome
        if (codigo === '' || nome === '') return false;

        // Rejeita se AMBAS as células parecem ser rótulos de cabeçalho.
        // Uma linha de cabeçalho duplicado tem tanto um código-rótulo (CÓD, REF, etc)
        // quanto um nome-rótulo (DESCRIÇÃO, NOME, ARTIGO, etc).
        // Mas um produto real pode ter um código como "CODIGO-123" ou um nome como "PRODUTO"
        // isoladamente — só rejeitamos se ambos parecem rótulos.
        const codigoEhRotulo = _ehRotuloCodigo(normalizarNome(codigoBruto));
        const nomeEhRotulo = _ehRotuloNome(normalizarNome(nomeBruto));

        if (codigoEhRotulo && nomeEhRotulo) {
            return false;
        }

        return true;
    }

    function _acharColuna(colunas, padroes) {
        for (const padrao of padroes) {
            const i = colunas.findIndex(c => c && padrao.test(c));
            if (i !== -1) return i;
        }
        return -1;
    }

    function sugerirMapeamento(colunas) {
        const cols = (colunas || []).map(c => normalizarNome(c));
        return {
            codigo:  _acharColuna(cols, PADROES_CODIGO_CABECALHO),
            nome:    _acharColuna(cols, PADROES_NOME_CABECALHO),
            largura: _acharColuna(cols, [/LARGURA/i]),
            // CORTE (preco do metro cortado) e o padrao definido na spec
            preco:   _acharColuna(cols, [/CORTE/i, /PRE[CÇ]O/i, /VALOR/i, /PE[CÇ]A/i]),
            unidade: _acharColuna(cols, [/UNID/i, /^UN$/i])
        };
    }

    function sugerirTipoAba(nomeAba, colunas) {
        const nome = normalizarNome(nomeAba).toUpperCase();
        if (nome === 'CAPA' || nome === '') return 'ignorar';
        const cols = (colunas || []).map(c => normalizarNome(c));
        if (cols.some(c => /LARGURA/i.test(c))) return 'tecido';
        return 'material';
    }

    const UNIDADES_VALIDAS = ['un', 'm', 'cm', 'kg', 'cj', 'cx', 'par'];

    function _normalizarUnidade(bruto, tipo) {
        if (tipo === 'tecido') return 'm';
        const u = normalizarNome(bruto).toLowerCase().replace(/\./g, '');
        return UNIDADES_VALIDAS.includes(u) ? u : 'un';
    }

    function montarItens(opcoes) {
        const linhas = opcoes.linhas || [];
        let mapa = opcoes.mapa;
        const tipo = opcoes.tipo;
        const aba = opcoes.aba || '';
        const inicio = (opcoes.cabecalhoIndice >= 0 ? opcoes.cabecalhoIndice : -1) + 1;
        const itens = [];
        const mapaOriginal = opcoes.mapa; // Guarda o mapeamento original para comparação
        let linhaRemapeamento = -1; // Linha onde o remapeamento foi detectado

        for (let i = inicio; i < linhas.length; i++) {
            const linha = linhas[i];
            const ehProduto = ehLinhaDeProduto(linha, mapa);
            const pareceHeader = _ehLinhaComAspectoDeCabecalho(linha);

            // Se não é produto OU parece ser um cabeçalho, tenta remapear
            if (!ehProduto || pareceHeader) {
                // Tenta derivar um novo mapeamento desta linha (possível cabeçalho)
                const colunasCandidata = _rotulosDaLinha(linha);
                const mapaCandidata = sugerirMapeamento(colunasCandidata);

                // Se o novo mapeamento é usável (tem codigo E nome) E é diferente do atual, adopta
                if (mapaCandidata.codigo >= 0 && mapaCandidata.nome >= 0 &&
                    JSON.stringify(mapaCandidata) !== JSON.stringify(mapa)) {
                    mapa = mapaCandidata;
                    linhaRemapeamento = i; // Registra que remapeamento ocorreu nesta linha
                }

                // Se não passou no teste de produto OU parece ser cabeçalho, pula esta linha
                if (!ehProduto || pareceHeader) continue;
            }

            const cod = normalizarCodigo(linha[mapa.codigo]);
            const avisos = [];
            if (cod.promocional) avisos.push('Código veio marcado como promocional (com *) na tabela');

            // Aviso se a linha corrente usa um mapeamento derivado (remapeamento ocorreu)
            if (linhaRemapeamento >= 0) {
                avisos.push('Remapeamento de colunas detectado a partir da linha ' + (linhaRemapeamento + 1) + ' da planilha');
            }

            let largura = null;
            if (mapa.largura >= 0) {
                const l = normalizarLargura(linha[mapa.largura]);
                largura = l.valor;
                if (l.aviso) avisos.push(l.aviso);
            }

            const p = mapa.preco >= 0
                ? normalizarPreco(linha[mapa.preco])
                : { valor: null, ok: false, motivo: 'A planilha não tem coluna de preço mapeada' };

            const nome = normalizarNome(linha[mapa.nome]);

            // Aviso se o nome é puramente numérico (possível mapeamento errado)
            if (nome && /^\d+[.,]?\d*$/.test(nome)) {
                avisos.push('Nome do produto é puramente numérico; verifique se o mapeamento de colunas está correto');
            }

            itens.push({
                aba,
                linha: i,
                codigo: cod.codigo,
                nome,
                largura,
                preco_custo: p.ok ? p.valor : null,
                unidade: _normalizarUnidade(mapa.unidade >= 0 ? linha[mapa.unidade] : '', tipo),
                tipo,
                promocional: cod.promocional,
                avisos,
                problema: p.ok ? null : p.motivo
            });
        }
        return itens;
    }

    const api = { normalizarNome, normalizarCodigo, normalizarPreco, normalizarLargura, detectarCabecalho, ehLinhaDeProduto, sugerirMapeamento, sugerirTipoAba, montarItens };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ImportadorCore = api;

})(typeof window !== 'undefined' ? window : null);
