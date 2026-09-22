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

    const api = { normalizarNome, normalizarCodigo, normalizarPreco, normalizarLargura, detectarCabecalho, ehLinhaDeProduto };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ImportadorCore = api;

})(typeof window !== 'undefined' ? window : null);
