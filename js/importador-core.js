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

    // Indexacao direta (sem .map) para que "buracos" de celulas mescladas/ausentes
    // e strings vazias sejam tratados da mesma forma ao comparar dois cabecalhos.
    function _celulasParaComparar(linha) {
        const tamanho = (linha || []).length;
        const out = [];
        for (let i = 0; i < tamanho; i++) out.push(normalizarNome(linha[i]));
        return out;
    }

    function montarItens(opcoes) {
        const linhas = opcoes.linhas || [];
        const mapa = opcoes.mapa; // UM UNICO mapeamento para a aba inteira: nao ha remapeamento adaptativo.
        const tipo = opcoes.tipo;
        const aba = opcoes.aba || '';
        const cabecalhoIndice = opcoes.cabecalhoIndice;
        const inicio = (cabecalhoIndice >= 0 ? cabecalhoIndice : -1) + 1;
        const itens = [];

        // Cabecalho com que a aba comecou, para comparar com possiveis cabecalhos repetidos
        // no meio da planilha (algumas planilhas repetem o cabecalho identico a cada secao).
        const cabecalhoOriginal = cabecalhoIndice >= 0 ? _celulasParaComparar(linhas[cabecalhoIndice]) : null;

        // -1 = nenhuma mudanca de layout encontrada ainda; senao, indice da linha
        // (0-based) onde um cabecalho DIFERENTE do original apareceu no meio da planilha.
        let linhaMudancaLayout = -1;

        for (let i = inicio; i < linhas.length; i++) {
            const linha = linhas[i];

            // Deteccao de cabecalho no meio da planilha: a celula na coluna de codigo
            // (posicao definida pelo mapa) e um ROTULO puro de codigo, nao um codigo de produto.
            //
            // Usa um teste ANCORADO (^...$), propositalmente diferente do PADROES_CODIGO_CABECALHO
            // compartilhado (que e uma busca de substring, usada em outros lugares para achar a
            // linha de cabecalho original). Um teste sem ancora aqui destruiria produtos reais:
            // "REF001", "COD-99" e "CODIGO123" sao codigos de produto legitimos e todos contêm
            // "COD"/"REF" como substring. So uma celula que e EXATAMENTE um rotulo de codigo
            // ("CODIGO", "CÓD", "REF", "REFERENCIA"...) conta como cabecalho. Nao "unificar"
            // com PADROES_CODIGO_CABECALHO — isso ja causou perda de dados numa tentativa anterior.
            const codigoNaLinha = mapa.codigo >= 0 ? normalizarNome(linha[mapa.codigo]) : '';
            const ehCabecalhoMarcado = codigoNaLinha && /^(C[OÓ]DIGO?|REF(ER[EÊ]NCIA)?)$/i.test(codigoNaLinha);

            if (ehCabecalhoMarcado) {
                // Linha de cabecalho no meio da planilha nunca vira item; so serve para
                // avisar (nao para remapear) quando o layout muda.
                if (linhaMudancaLayout === -1) {
                    const colunasAqui = _celulasParaComparar(linha);
                    const igualAoOriginal = cabecalhoOriginal !== null &&
                        JSON.stringify(colunasAqui) === JSON.stringify(cabecalhoOriginal);
                    if (!igualAoOriginal) {
                        // Cabecalho repetido mas DIFERENTE do original (ou nao ha original para
                        // comparar): a partir daqui os itens continuam usando o MESMO `mapa`,
                        // porem marcados com `problema` para conferencia manual.
                        linhaMudancaLayout = i;
                    }
                    // Se for identico ao original, nao muda nada: so pula a linha, sem aviso.
                }
                continue;
            }

            if (!ehLinhaDeProduto(linha, mapa)) continue;

            const cod = normalizarCodigo(linha[mapa.codigo]);
            const avisos = [];
            if (cod.promocional) avisos.push('Código veio marcado como promocional (com *) na tabela');

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

            let problema = p.ok ? null : p.motivo;
            if (linhaMudancaLayout >= 0) {
                const avisoLayout = 'A planilha muda de layout a partir da linha ' + (linhaMudancaLayout + 1) +
                    '; confira os valores desta linha antes de importar.';
                problema = problema ? problema + ' ' + avisoLayout : avisoLayout;
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
                problema
            });
        }
        return itens;
    }

    function markupDeExistente(registro) {
        if (!registro) return null;
        const custo = Number(registro.preco_custo);
        const venda = Number(registro.preco);
        if (!isFinite(custo) || custo <= 0) return null;
        if (!isFinite(venda) || venda <= 0) return null;
        return Math.round(((venda / custo) - 1) * 10000) / 100;
    }

    function aplicarMarkup(precoCusto, markupPercentual) {
        const custo = Number(precoCusto) || 0;
        const markup = Number(markupPercentual) || 0;
        return Math.round(custo * (1 + markup / 100) * 100) / 100;
    }

    function indexarExistentes(catalogo, materiais) {
        const porCodigo = new Map();
        const porNome = new Map();
        const registrar = (lista, tipo) => {
            (lista || []).forEach(registro => {
                const cod = normalizarCodigo(registro.referencia).codigo;
                if (cod) porCodigo.set(cod, { registro, tipo });
                const nome = normalizarNome(registro.nome).toLowerCase();
                if (nome) porNome.set(tipo + '|' + nome, { registro, tipo });
            });
        };
        registrar(catalogo, 'tecido');
        registrar(materiais, 'material');
        return { porCodigo, porNome };
    }

    function classificar(opcoes) {
        const itens = opcoes.itens || [];
        const fornecedorId = opcoes.fornecedorId === undefined ? null : opcoes.fornecedorId;
        const { porCodigo, porNome } = indexarExistentes(opcoes.catalogo, opcoes.materiais);

        // Helper para normalizar IDs de fornecedor sem confundir 0 com ausente
        const normalizarIdFornecedor = v => (v === null || v === undefined) ? '' : String(v);
        const idFornecedorNormalizado = normalizarIdFornecedor(fornecedorId);

        const r = { novos: [], atualizados: [], conflitos: [], nomes_repetidos: [], sem_markup: [], problemas: [], sumiram: [] };
        const vistos = new Set();

        itens.forEach(item => {
            if (item.problema) { r.problemas.push({ item, existente: null, motivo: item.problema }); return; }

            // Normaliza o codigo e nome do item antes de procurar nos indices
            const codigoNormalizado = normalizarCodigo(item.codigo).codigo;
            const nomeNormalizado = normalizarNome(item.nome);

            const achado = porCodigo.get(codigoNormalizado);
            if (achado) {
                vistos.add(codigoNormalizado);
                const existente = achado.registro;
                const idExistenteNormalizado = normalizarIdFornecedor(existente.fornecedor_id);
                const mesmoFornecedor = idExistenteNormalizado === idFornecedorNormalizado;
                if (!mesmoFornecedor) {
                    r.conflitos.push({
                        item, existente,
                        motivo: 'O código ' + codigoNormalizado + ' já pertence a "' + existente.nome + '" de outro fornecedor'
                    });
                    return;
                }
                if (markupDeExistente(existente) === null) {
                    r.sem_markup.push({ item, existente, motivo: 'Item sem markup registrado — defina o markup para calcular a venda' });
                    return;
                }
                r.atualizados.push({ item, existente, motivo: null });
                return;
            }

            const donoDoNome = porNome.get(item.tipo + '|' + nomeNormalizado.toLowerCase());
            if (donoDoNome) {
                r.nomes_repetidos.push({
                    item, existente: donoDoNome.registro,
                    motivo: 'O nome "' + nomeNormalizado + '" já é usado pelo código ' + (donoDoNome.registro.referencia || '(sem código)')
                });
                return;
            }

            r.novos.push({ item, existente: null, motivo: null });
        });

        porCodigo.forEach((achado, codigo) => {
            if (vistos.has(codigo)) return;
            const idExistenteNormalizado = normalizarIdFornecedor(achado.registro.fornecedor_id);
            if (idExistenteNormalizado !== idFornecedorNormalizado) return;
            r.sumiram.push({
                item: null, existente: achado.registro,
                motivo: 'Está cadastrado mas não veio nesta tabela — nada será alterado'
            });
        });

        return r;
    }

    const LARGURA_PADRAO = 2.80;

    function aplicarImportacao(opcoes) {
        const catalogo = (opcoes.catalogo || []).map(r => Object.assign({}, r));
        const materiais = (opcoes.materiais || []).map(r => Object.assign({}, r));
        const fornecedor = opcoes.fornecedor || null;
        let proximoId = Number(opcoes.agora) || Date.now();
        const resumo = { criados: 0, atualizados: 0, ignorados: 0 };

        (opcoes.decisoes || []).forEach(decisao => {
            const item = decisao.item;
            if (!item || decisao.acao === 'ignorar') { resumo.ignorados++; return; }

            const precoCusto = Number(item.preco_custo) || 0;
            const preco = aplicarMarkup(precoCusto, decisao.markup);
            const lista = item.tipo === 'tecido' ? catalogo : materiais;

            if (decisao.acao === 'atualizar' && decisao.existente) {
                const alvo = lista.find(r => r.id === decisao.existente.id);
                if (!alvo) return;
                alvo.referencia = item.codigo;
                alvo.nome = item.nome;
                alvo.preco_custo = precoCusto;
                alvo.preco = preco;
                if (item.tipo === 'tecido') {
                    if (item.largura !== null) alvo.largura_rolo = item.largura;
                } else {
                    alvo.unidade = item.unidade;
                }
                if (fornecedor) { alvo.fornecedor_id = fornecedor.id; alvo.fornecedor_nome = fornecedor.nome; }
                resumo.atualizados++;
                return;
            }

            const base = {
                id: proximoId++,
                referencia: item.codigo,
                nome: item.nome,
                preco_custo: precoCusto,
                preco,
                min_estoque: 0,
                fornecedor_id: fornecedor ? fornecedor.id : null,
                fornecedor_nome: fornecedor ? fornecedor.nome : ''
            };
            if (item.tipo === 'tecido') {
                catalogo.push(Object.assign(base, {
                    largura_rolo: item.largura === null ? LARGURA_PADRAO : item.largura,
                    imagem: ''
                }));
            } else {
                materiais.push(Object.assign(base, { unidade: item.unidade, estoque_atual: 0 }));
            }
            resumo.criados++;
        });

        return { catalogo, materiais, resumo };
    }

    // Decide pelo codigo atual do item, nao pelo grupo em que ele caiu na tela.
    // E o que faz "substituir o existente" e "editei o codigo, agora e outro
    // produto" funcionarem sem reclassificar a conferencia inteira.
    function resolverAcao(item, catalogo, materiais) {
        const { porCodigo } = indexarExistentes(catalogo, materiais);
        const achado = porCodigo.get(item.codigo);
        return achado
            ? { acao: 'atualizar', existente: achado.registro }
            : { acao: 'criar', existente: null };
    }

    // Guarda da regra "nao pode haver codigo duplicado no sistema".
    function validarDecisoes(decisoes, catalogo, materiais) {
        const { porNome } = indexarExistentes(catalogo, materiais);
        const erros = [];
        const codigosDoLote = new Map();

        (decisoes || []).forEach(d => {
            if (!d.item || d.acao === 'ignorar') return;
            const item = d.item;

            if (codigosDoLote.has(item.codigo)) {
                erros.push('O código ' + item.codigo + ' aparece duas vezes nesta importação ("'
                    + codigosDoLote.get(item.codigo) + '" e "' + item.nome + '"). Edite um dos dois.');
            } else {
                codigosDoLote.set(item.codigo, item.nome);
            }

            const dono = porNome.get(item.tipo + '|' + item.nome.toLowerCase());
            const ehOProprio = dono && d.existente && dono.registro.id === d.existente.id;
            if (dono && !ehOProprio) {
                erros.push('O nome "' + item.nome + '" já pertence ao código '
                    + (dono.registro.referencia || '(sem código)') + '. Edite o nome.');
            }
        });

        return erros;
    }

    const api = { normalizarNome, normalizarCodigo, normalizarPreco, normalizarLargura, detectarCabecalho, ehLinhaDeProduto, sugerirMapeamento, sugerirTipoAba, montarItens, markupDeExistente, aplicarMarkup, indexarExistentes, classificar, aplicarImportacao, resolverAcao, validarDecisoes };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ImportadorCore = api;

})(typeof window !== 'undefined' ? window : null);
