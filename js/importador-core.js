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

    // Leitura completa da largura: alem de `valor`/`aviso` devolve tambem `motivo`,
    // que separa CELULA VAZIA (motivo null — nada a dizer) de CELULA ILEGIVEL
    // (havia conteudo e nao deu para ler). Essa diferenca e o que impede a
    // largura padrao de 2,80 m de ser aplicada em silencio a uma celula como
    // "2,65/2,70" (Promocionais-Book 06, codigo 1031).
    function _lerLargura(bruto) {
        const vazio = { valor: null, aviso: null, motivo: null };
        const ilegivel = texto => ({
            valor: null, aviso: null,
            motivo: 'Largura "' + texto + '" não pôde ser lida; confira a largura antes de importar'
        });

        if (bruto === null || bruto === undefined || bruto === '') return vazio;

        // Se é número, valida e processa
        if (typeof bruto === 'number') {
            if (!isFinite(bruto) || bruto < 0) return ilegivel(String(bruto));
            const aviso = bruto > 10
                ? 'Largura ' + bruto + ' parece estar em centímetros; confira se deveria ser em metros'
                : null;
            return { valor: bruto, aviso, motivo: null };
        }

        // String: rejeita R$ (coluna mapeada errado), aceita unidades de comprimento
        const texto = String(bruto).trim();
        if (!texto) return vazio;
        if (/R\$/.test(texto)) return ilegivel(texto);

        // Parse: número com vírgula ou ponto como decimal, opcionalmente seguido de espaço e unidade (m, cm, mm)
        const match = texto.match(/^([\d]+[.,]?[\d]*)\s*([a-z]*)$/i);
        if (!match) return ilegivel(texto);

        const numPart = match[1];
        if (!numPart) return ilegivel(texto);

        // Converte vírgula em ponto e valida número
        const limpo = numPart.replace(',', '.');
        const n = Number(limpo);

        if (!isFinite(n) || n < 0) return ilegivel(texto);

        // Arredonda para 2 casas decimais
        const valor = Math.round(n * 100) / 100;

        // Aviso se parece estar em centímetros
        const aviso = valor > 10
            ? 'Largura ' + valor + ' parece estar em centímetros; confira se deveria ser em metros'
            : null;

        return { valor, aviso, motivo: null };
    }

    // Contrato publico historico: { valor, aviso }. O motivo da recusa fica em
    // `motivoLarguraIlegivel`, funcao irma, para nao mudar a forma deste retorno.
    function normalizarLargura(bruto) {
        const r = _lerLargura(bruto);
        return { valor: r.valor, aviso: r.aviso };
    }

    // Devolve o motivo quando a celula TINHA conteudo e nao pôde ser lida como
    // largura; devolve null para celula vazia e para largura lida com sucesso.
    function motivoLarguraIlegivel(bruto) {
        return _lerLargura(bruto).motivo;
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

    // Motivo pelo qual uma linha RECUSADA por ehLinhaDeProduto ainda assim deve
    // chegar a conferencia, ou null quando ela e mesmo ruido de formatacao.
    // Regra: preco legivel E pelo menos um entre codigo e nome. Linha sem os
    // tres continua descartada; linha de cabecalho repetido (codigo-rotulo E
    // nome-rotulo) tambem, porque nao e produto.
    function _motivoLinhaIncompleta(linha, mapa) {
        if (!linha || !mapa) return null;

        const codigoBruto = mapa.codigo >= 0 ? linha[mapa.codigo] : undefined;
        const nomeBruto = mapa.nome >= 0 ? linha[mapa.nome] : undefined;
        const codigo = normalizarCodigo(codigoBruto).codigo;
        const nome = normalizarNome(nomeBruto);

        if (codigo !== '' && nome !== '') return null; // cabecalho repetido: nao e produto
        if (codigo === '' && nome === '') return null; // linha sem nada: ruido

        if (mapa.preco < 0) return null;
        if (!normalizarPreco(linha[mapa.preco]).ok) return null;

        return codigo === ''
            ? 'Linha com preço mas sem código — complete o código ou deixe desmarcada'
            : 'Linha com preço mas sem nome — complete o nome ou deixe desmarcada';
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

    // Devolve { unidade, aviso }. `unidade` null significa "a tabela nao disse
    // nada de confiavel sobre a unidade" — quem grava deve PRESERVAR a unidade
    // que o registro ja tem em vez de assumir 'un'. Isso evita que um material
    // que o dono ajustou a mao para 'cx' volte a 'un' na reimportacao mensal.
    function _lerUnidade(bruto, tipo, temColuna) {
        if (tipo === 'tecido') return { unidade: 'm', aviso: null };
        if (!temColuna) return { unidade: null, aviso: null };
        const texto = normalizarNome(bruto);
        if (!texto) return { unidade: 'un', aviso: null };
        const u = texto.toLowerCase().replace(/\./g, '');
        if (UNIDADES_VALIDAS.includes(u)) return { unidade: u, aviso: null };
        return {
            unidade: null,
            aviso: 'Unidade "' + texto + '" não é reconhecida; a unidade atual do item será mantida'
        };
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
            // "CÓD." — abreviado E com ponto final — e o rotulo usado em TODAS as
            // abas de material do arquivo real. Duas mudancas sao necessarias para
            // reconhece-lo: o ponto final opcional (`\.?$`) e a abreviacao (o antigo
            // `C[OÓ]DIGO?` exigia pelo menos "CODIG" e nunca casou "CÓD"). Continua
            // ancorado, entao "REF001" e "CODIGO123" seguem sendo produto, nao cabecalho.
            const codigoNaLinha = mapa.codigo >= 0 ? normalizarNome(linha[mapa.codigo]) : '';
            const ehCabecalhoMarcado = codigoNaLinha && /^(C[OÓ]D(IGO?)?|REF(ER[EÊ]NCIA)?)\.?$/i.test(codigoNaLinha);

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

            // Linha que nao passa em ehLinhaDeProduto ainda pode ser um produto
            // real cujo codigo ou nome ficou noutra linha fisica (celula mesclada
            // no Excel, descricao quebrada no PDF). Se ela tem PRECO LEGIVEL e ao
            // menos um entre codigo e nome, entra na conferencia com `problema`
            // preenchido, desmarcada, em vez de sumir calada.
            let faltando = null;
            if (!ehLinhaDeProduto(linha, mapa)) {
                faltando = _motivoLinhaIncompleta(linha, mapa);
                if (!faltando) continue;
            }

            const cod = normalizarCodigo(linha[mapa.codigo]);
            const avisos = [];
            if (cod.promocional) avisos.push('Código veio marcado como promocional (com *) na tabela');

            let largura = null;
            let larguraIlegivel = false;
            if (mapa.largura >= 0) {
                const l = _lerLargura(linha[mapa.largura]);
                largura = l.valor;
                if (l.aviso) avisos.push(l.aviso);
                if (l.motivo) { larguraIlegivel = true; avisos.push(l.motivo); }
            }

            const p = mapa.preco >= 0
                ? normalizarPreco(linha[mapa.preco])
                : { valor: null, ok: false, motivo: 'A planilha não tem coluna de preço mapeada' };

            const nome = normalizarNome(linha[mapa.nome]);

            // Aviso se o nome é puramente numérico (possível mapeamento errado)
            if (nome && /^\d+[.,]?\d*$/.test(nome)) {
                avisos.push('Nome do produto é puramente numérico; verifique se o mapeamento de colunas está correto');
            }

            const u = _lerUnidade(mapa.unidade >= 0 ? linha[mapa.unidade] : '', tipo, mapa.unidade >= 0);
            if (u.aviso) avisos.push(u.aviso);

            let problema = p.ok ? null : p.motivo;
            if (faltando) problema = problema ? problema + ' ' + faltando : faltando;
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
                largura_ilegivel: larguraIlegivel,
                preco_custo: p.ok ? p.valor : null,
                unidade: u.unidade,
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
                // Codigo e unico no sistema inteiro: catalogo e materiais dividem o
                // mesmo espaco de nomes. Um codigo que ja existe sob o OUTRO tipo nao
                // pode virar atualizacao — nada seria gravado. E conflito: o usuario
                // decide se edita o codigo.
                if (achado.tipo !== item.tipo) {
                    r.conflitos.push({
                        item, existente,
                        motivo: 'O código ' + codigoNormalizado + ' já pertence a "' + existente.nome + '", cadastrado como '
                            + (achado.tipo === 'tecido' ? 'tecido' : 'material') + '. Edite o código.'
                    });
                    return;
                }
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

    // Unicos campos que o importador escreve num registro. Tudo o que esta fora
    // desta lista — id, min_estoque, imagem, estoque_atual — pertence ao dia a dia
    // do negocio e nunca e tocado, nem ao gravar nem ao desfazer.
    const CAMPOS_DO_IMPORTADOR = [
        'referencia', 'nome', 'preco_custo', 'preco', 'unidade', 'largura_rolo',
        'fornecedor_id', 'fornecedor_nome'
    ];

    function _fotografarCampos(registro) {
        const antes = {};
        CAMPOS_DO_IMPORTADOR.forEach(campo => {
            if (Object.prototype.hasOwnProperty.call(registro, campo)) antes[campo] = registro[campo];
        });
        return antes;
    }

    function aplicarImportacao(opcoes) {
        const catalogo = (opcoes.catalogo || []).map(r => Object.assign({}, r));
        const materiais = (opcoes.materiais || []).map(r => Object.assign({}, r));
        const fornecedor = opcoes.fornecedor || null;

        // Encontra o maior ID existente nas duas listas para evitar colisao
        let maiorIdExistente = -1;
        catalogo.forEach(r => { if (r.id > maiorIdExistente) maiorIdExistente = r.id; });
        materiais.forEach(r => { if (r.id > maiorIdExistente) maiorIdExistente = r.id; });
        let proximoId = Math.max(Number(opcoes.agora) || Date.now(), maiorIdExistente + 1);

        const resumo = { criados: 0, atualizados: 0, ignorados: 0 };
        // Registro cirurgico do que mudou, para o desfazer nao precisar substituir
        // listas inteiras (e assim nunca devolver estoque velho).
        const mudancas = { criados: [], atualizados: [] };
        // Toda decisao que NAO pôde ser aplicada precisa aparecer aqui: sem isto o
        // resumo mente ("0 criado(s), 0 atualizado(s)") sem que nada tenha sido feito.
        const naoAplicadas = [];

        const ignorar = (item, motivo) => {
            resumo.ignorados++;
            if (motivo) naoAplicadas.push({ item: item || null, motivo });
        };

        (opcoes.decisoes || []).forEach(decisao => {
            const item = decisao.item;
            if (!item) { ignorar(null, 'Decisão sem item — nada a gravar'); return; }
            if (decisao.acao === 'ignorar') { resumo.ignorados++; return; }

            const precoCusto = Number(item.preco_custo) || 0;
            const preco = aplicarMarkup(precoCusto, decisao.markup);
            const codigoNormalizado = normalizarCodigo(item.codigo).codigo;
            const lista = item.tipo === 'tecido' ? catalogo : materiais;

            if (decisao.acao !== 'criar' && decisao.acao !== 'atualizar') {
                ignorar(item, decisao.motivo || ('O código ' + codigoNormalizado + ' não pôde ser gravado nesta importação'));
                return;
            }

            if (decisao.acao === 'atualizar') {
                const alvo = decisao.existente ? lista.find(r => r.id === decisao.existente.id) : null;
                if (!alvo) {
                    ignorar(item, 'O item ' + codigoNormalizado
                        + ' seria atualizado, mas o registro não foi encontrado na lista de '
                        + (item.tipo === 'tecido' ? 'tecidos' : 'materiais') + '; nada foi alterado nele');
                    return;
                }
                mudancas.atualizados.push({ tipo: item.tipo, id: alvo.id, antes: _fotografarCampos(alvo) });
                alvo.referencia = codigoNormalizado;
                alvo.nome = item.nome;
                alvo.preco_custo = precoCusto;
                alvo.preco = preco;
                if (item.tipo === 'tecido') {
                    if (item.largura !== null) alvo.largura_rolo = item.largura;
                } else if (item.unidade) {
                    // unidade so e escrita quando a tabela realmente informou uma
                    // unidade reconhecivel; senao a do registro vivo e preservada.
                    alvo.unidade = item.unidade;
                }
                if (fornecedor) { alvo.fornecedor_id = fornecedor.id; alvo.fornecedor_nome = fornecedor.nome; }
                resumo.atualizados++;
                return;
            }

            const base = {
                id: proximoId++,
                referencia: codigoNormalizado,
                nome: item.nome,
                preco_custo: precoCusto,
                preco,
                min_estoque: 0,
                fornecedor_id: fornecedor ? fornecedor.id : null,
                fornecedor_nome: fornecedor ? fornecedor.nome : ''
            };
            if (item.tipo === 'tecido') {
                // A largura padrao so vale para celula VAZIA. Celula ilegivel
                // ("2,65/2,70", "ate 3,00", "-") nao pode virar 2,80 em silencio:
                // a largura comanda todo o calculo de corte.
                const larguraPadraoPermitida = item.largura === null && !item.largura_ilegivel;
                catalogo.push(Object.assign(base, {
                    largura_rolo: item.largura !== null ? item.largura : (larguraPadraoPermitida ? LARGURA_PADRAO : null),
                    imagem: ''
                }));
            } else {
                materiais.push(Object.assign(base, { unidade: item.unidade || 'un', estoque_atual: 0 }));
            }
            mudancas.criados.push({ tipo: item.tipo, id: base.id });
            resumo.criados++;
        });

        return { catalogo, materiais, resumo, mudancas, naoAplicadas };
    }

    // Desfaz cirurgicamente uma importacao a partir de `mudancas`: remove o que
    // foi criado e devolve aos atualizados SO os campos que o importador escreveu.
    // Nunca toca em estoque_atual, min_estoque, imagem ou id de registro vivo, e
    // nunca substitui as listas inteiras.
    function desfazerImportacao(opcoes) {
        const catalogo = (opcoes.catalogo || []).map(r => Object.assign({}, r));
        const materiais = (opcoes.materiais || []).map(r => Object.assign({}, r));
        const mudancas = opcoes.mudancas || { criados: [], atualizados: [] };
        const resumo = { removidos: 0, revertidos: 0, sumidos: 0, mantidos: 0 };

        const listaDe = tipo => (tipo === 'tecido' ? catalogo : materiais);

        (mudancas.criados || []).forEach(c => {
            const lista = listaDe(c.tipo);
            const i = lista.findIndex(r => r.id === c.id);
            if (i === -1) { resumo.sumidos++; return; }
            // Se o item criado ja movimentou estoque, apagar o cadastro deixaria
            // saldo orfao: o registro fica, e o desfazer avisa quantos ficaram.
            if (Number(lista[i].estoque_atual) > 0) { resumo.mantidos++; return; }
            lista.splice(i, 1);
            resumo.removidos++;
        });

        (mudancas.atualizados || []).forEach(a => {
            const alvo = listaDe(a.tipo).find(r => r.id === a.id);
            if (!alvo) { resumo.sumidos++; return; }
            CAMPOS_DO_IMPORTADOR.forEach(campo => {
                if (Object.prototype.hasOwnProperty.call(a.antes || {}, campo)) alvo[campo] = a.antes[campo];
                else delete alvo[campo];
            });
            resumo.revertidos++;
        });

        return { catalogo, materiais, resumo };
    }

    // Decide pelo codigo atual do item, nao pelo grupo em que ele caiu na tela.
    // E o que faz "substituir o existente" e "editei o codigo, agora e outro
    // produto" funcionarem sem reclassificar a conferencia inteira.
    function resolverAcao(item, catalogo, materiais) {
        const { porCodigo } = indexarExistentes(catalogo, materiais);
        const codigoNormalizado = normalizarCodigo(item.codigo).codigo;
        const achado = porCodigo.get(codigoNormalizado);
        if (!achado) return { acao: 'criar', existente: null, motivo: null };
        // Mesmo codigo sob o OUTRO tipo: conflito, nunca atualizacao. Atualizar
        // procuraria o registro na lista errada e nao acharia nada.
        if (achado.tipo !== item.tipo) {
            return {
                acao: 'conflito', existente: achado.registro,
                motivo: 'O código ' + codigoNormalizado + ' já pertence a "' + achado.registro.nome + '", cadastrado como '
                    + (achado.tipo === 'tecido' ? 'tecido' : 'material') + '. Edite o código.'
            };
        }
        return { acao: 'atualizar', existente: achado.registro, motivo: null };
    }

    // Guarda da regra "nao pode haver codigo duplicado no sistema".
    function validarDecisoes(decisoes, catalogo, materiais) {
        const { porNome } = indexarExistentes(catalogo, materiais);
        const erros = [];
        const errosDeNomeNoBanco = [];
        const codigosDoLote = new Map(); // codigo normalizado -> { count, nomes[] }
        const nomesDoLote = new Map();   // tipo|nome minusculo -> { nome, codigos: Set }

        (decisoes || []).forEach(d => {
            if (!d.item || d.acao === 'ignorar') return;
            const item = d.item;
            const codigoNormalizado = normalizarCodigo(item.codigo).codigo;
            const nomeNormalizado = normalizarNome(item.nome);

            // Rastreia codigos duplicados no lote (deduplicado depois)
            if (codigosDoLote.has(codigoNormalizado)) {
                const info = codigosDoLote.get(codigoNormalizado);
                info.count++;
                if (!info.nomes.includes(nomeNormalizado)) {
                    info.nomes.push(nomeNormalizado);
                }
            } else {
                codigosDoLote.set(codigoNormalizado, { count: 1, nomes: [nomeNormalizado] });
            }

            // Rastreia nomes repetidos DENTRO do lote, do mesmo jeito que os codigos.
            // So conta como repetido quando o mesmo nome aparece sob codigos
            // DIFERENTES: varias linhas do mesmo codigo ja sao relatadas acima, e
            // relatar de novo pelo nome seria ruido.
            const chaveNome = item.tipo + '|' + nomeNormalizado.toLowerCase();
            if (nomeNormalizado) {
                if (!nomesDoLote.has(chaveNome)) nomesDoLote.set(chaveNome, { nome: nomeNormalizado, codigos: new Set() });
                nomesDoLote.get(chaveNome).codigos.add(codigoNormalizado);
            }

            // Verifica colisao de nome com outro registro (ignorando o item sendo atualizado)
            const dono = porNome.get(chaveNome);
            const ehOProprio = dono && d.existente && dono.registro.id === d.existente.id;
            if (dono && !ehOProprio) {
                errosDeNomeNoBanco.push('O nome "' + nomeNormalizado + '" já pertence ao código '
                    + (dono.registro.referencia || '(sem código)') + '. Edite o nome.');
            }
        });

        errosDeNomeNoBanco.forEach(e => erros.push(e));

        // Relata cada codigo duplicado UMA VEZ, com contagem
        codigosDoLote.forEach((info, codigo) => {
            if (info.count > 1) {
                erros.push('O código ' + codigo + ' aparece ' + info.count + ' vezes nesta importação ('
                    + info.nomes.join(', ') + '). Edite um dos códigos.');
            }
        });

        // Relata cada nome repetido no lote UMA VEZ, com os codigos envolvidos
        nomesDoLote.forEach(info => {
            if (info.codigos.size > 1) {
                erros.push('O nome "' + info.nome + '" aparece em ' + info.codigos.size
                    + ' códigos diferentes nesta importação (' + Array.from(info.codigos).join(', ')
                    + '). Edite um dos nomes.');
            }
        });

        return erros;
    }

    function assinaturaDoLayout(colunas) {
        const normalized = (colunas || []).map(c => normalizarNome(c));
        // Remove trailing empty segments — empty columns in the MIDDLE must be preserved
        // as they carry positional information for the mapping
        while (normalized.length > 0 && normalized[normalized.length - 1] === '') {
            normalized.pop();
        }
        return normalized.join('|');
    }

    function montarPerfil(opcoes) {
        const o = opcoes || {};
        return {
            id: o.id || Date.now(),
            nome: normalizarNome(o.nome),
            fornecedor_id: o.fornecedorId === undefined ? null : o.fornecedorId,
            abas: o.abas || {},
            layouts: o.layouts || [],
            cores: o.cores || {},
            markup_padrao: Number(o.markupPadrao) || 0
        };
    }

    function perfilDoFornecedor(perfis, fornecedorId) {
        if (!perfis || fornecedorId === null || fornecedorId === undefined) return null;
        const alvo = String(fornecedorId);
        return perfis.find(p => String(p.fornecedor_id) === alvo) || null;
    }

    // Acrescenta "D" ao fim ate o codigo ficar livre. Usado na resolucao em
    // massa de codigos repetidos: a primeira ocorrencia fica com o codigo
    // original e as seguintes ganham sufixo.
    function codigoLivre(base, ocupados) {
        let codigo = normalizarCodigo(base).codigo;
        if (!codigo) codigo = 'SEMCODIGO';
        const usados = ocupados || new Set();
        while (usados.has(codigo)) codigo += 'D';
        return codigo;
    }

    // Irma de `codigoLivre` para o NOME: acrescenta " (2)", " (3)"... ate o nome
    // ficar livre. Sem isto, diferenciar os codigos repetidos deixa tres produtos
    // com o mesmo nome — que passam neste mes e travam a importacao do mes seguinte.
    // A comparacao e feita em minusculas, como em indexarExistentes.
    function nomeLivre(base, ocupados) {
        const original = normalizarNome(base) || 'SEM NOME';
        const usados = ocupados || new Set();
        if (!usados.has(original.toLowerCase())) return original;
        let n = 2;
        let nome = original + ' (' + n + ')';
        while (usados.has(nome.toLowerCase())) {
            n++;
            nome = original + ' (' + n + ')';
        }
        return nome;
    }

    // Agrupa fragmentos de texto do PDF em linhas e colunas.
    // Fragmentos com y similar viram a mesma linha, ordenada por x.
    // Fragmentos horizontalmente adjacentes viram uma so celula.
    // Cada célula é colocada no índice de sua coluna (detectada por clustering de x).
    function agruparLinhasPdf(fragmentos, opcoes) {
        const o = opcoes || {};
        const toleranciaY = o.toleranciaY === undefined ? 3 : o.toleranciaY;
        const toleranciaX = o.toleranciaX === undefined ? 12 : o.toleranciaX;
        const LARGURA_NOMINAL = 5; // fallback quando o fragmento nao traz largura (px por caractere)

        const uteis = (fragmentos || [])
            .map(f => ({ texto: normalizarNome(f.texto), x: Number(f.x), y: Number(f.y), largura: Number(f.largura) }))
            .filter(f => f.texto !== '' && isFinite(f.x) && isFinite(f.y));

        if (uteis.length === 0) return [];

        // se a largura vier ausente ou zerada, aproxima por 5px por caractere para
        // ainda assim clusterizar com sentido (em vez de lançar ou colapsar tudo em 0)
        uteis.forEach(f => {
            if (!isFinite(f.largura) || f.largura <= 0) f.largura = Math.max(LARGURA_NOMINAL, f.texto.length * LARGURA_NOMINAL);
        });

        // agrupa por y (no PDF, y cresce de baixo para cima)
        const grupos = [];
        uteis.slice().sort((a, b) => b.y - a.y).forEach(f => {
            const grupo = grupos.find(g => Math.abs(g.y - f.y) <= toleranciaY);
            if (grupo) grupo.itens.push(f);
            else grupos.push({ y: f.y, itens: [f] });
        });

        // constrói as linhas com células mescladas, guardando o span [inicio, fim]
        // de cada célula (usado a seguir para o agrupamento de colunas por sobreposição)
        const linhasComCelulas = grupos.map(grupo => {
            const ordenados = grupo.itens.slice().sort((a, b) => a.x - b.x);
            const celulas = [];
            let atual = null;
            ordenados.forEach(f => {
                const fim = f.x + f.largura;
                if (atual !== null && (f.x - atual.fim) < toleranciaX) {
                    atual.texto += ' ' + f.texto;
                    atual.fim = Math.max(atual.fim, fim);
                } else {
                    atual = { texto: f.texto, inicio: f.x, fim };
                    celulas.push(atual);
                }
            });
            return celulas;
        });

        function sobreposicao(a, b) {
            return Math.min(a.fim, b.fim) - Math.max(a.inicio, b.inicio);
        }

        // PASSO A: constrói o conjunto de colunas por SOBREPOSIÇÃO DE SPAN (não por
        // posição inicial): um rótulo de cabeçalho centralizado e os valores
        // alinhados à esquerda abaixo dele começam em x diferentes, mas seus spans
        // se cruzam. Processa as linhas com MAIS células primeiro — normalmente o
        // cabeçalho e as linhas de produto "limpas" (uma só linha física) — para que
        // elas estabeleçam as colunas antes de qualquer título de seção ou resto de
        // linha quebrada (poucas células, geralmente uma só, e larga) ser processado.
        // Uma célula que sobrepõe exatamente UMA coluna existente pode fazê-la
        // crescer; uma célula que sobrepõe VÁRIAS colunas é apenas atribuída à que
        // mais se sobrepõe, sem alterar nenhuma delas — isso é o que impede uma
        // descrição comprida (ou um título) de engolir a coluna vizinha.
        const ordemConstrucao = linhasComCelulas.slice().sort((a, b) => b.length - a.length);
        const colunas = []; // { inicio, fim }
        ordemConstrucao.forEach(celulas => {
            celulas.forEach(celula => {
                let melhorIndice = -1;
                let melhorSobreposicao = 0;
                let qtdSobrepostas = 0;
                colunas.forEach((col, i) => {
                    const s = sobreposicao(celula, col);
                    if (s > 0) {
                        qtdSobrepostas++;
                        if (s > melhorSobreposicao) { melhorSobreposicao = s; melhorIndice = i; }
                    }
                });
                if (melhorIndice === -1) {
                    colunas.push({ inicio: celula.inicio, fim: celula.fim });
                } else if (qtdSobrepostas === 1) {
                    colunas[melhorIndice].inicio = Math.min(colunas[melhorIndice].inicio, celula.inicio);
                    colunas[melhorIndice].fim = Math.max(colunas[melhorIndice].fim, celula.fim);
                }
            });
        });
        colunas.sort((a, b) => a.inicio - b.inicio);

        // PASSO B: com as colunas finais definidas, percorre a página na ordem
        // natural (de cima para baixo, esquerda para direita) e encaixa cada célula
        // na coluna com que mais se sobrepõe.
        function acharColuna(celula) {
            let melhorIndice = -1;
            let melhorSobreposicao = 0;
            colunas.forEach((col, i) => {
                const s = sobreposicao(celula, col);
                if (s > melhorSobreposicao) { melhorSobreposicao = s; melhorIndice = i; }
            });
            return melhorIndice;
        }

        return linhasComCelulas.map(celulas => {
            const linha = new Array(colunas.length).fill('');
            celulas.forEach(celula => {
                const idx = acharColuna(celula);
                if (idx >= 0) linha[idx] = linha[idx] ? linha[idx] + ' ' + celula.texto : celula.texto;
            });
            return linha;
        });
    }

    // Expande as linhas de uma aba com colunas de cores em multiplos itens (um por cor).
    // Usado para importacao de tabelas de fornecedor que listam cores como colunas.
    // Exemplo: uma linha com AC1 | Fita | 10.00 | 15.00 | 12.00 (DOURADO, CROMADO, PALHA)
    // vira 3 itens: AC1-DOURADO/Fita(DOURADO), AC1-CROMADO/Fita(CROMADO), AC1-PALHA/Fita(PALHA).
    function expandirPorCor(opcoes) {
        const linhas = opcoes.linhas || [];
        const mapa = opcoes.mapa;
        const colunas = (opcoes.colunas || []).map(c => normalizarNome(c));
        const colunasCor = opcoes.colunasCor || [];
        const tipo = opcoes.tipo;
        const aba = opcoes.aba || '';
        const inicio = (opcoes.cabecalhoIndice >= 0 ? opcoes.cabecalhoIndice : -1) + 1;
        const itens = [];

        for (let i = inicio; i < linhas.length; i++) {
            const linha = linhas[i];
            if (!ehLinhaDeProduto(linha, mapa)) continue;
            const cod = normalizarCodigo(linha[mapa.codigo]);
            const nomeBase = normalizarNome(linha[mapa.nome]);

            colunasCor.forEach(ci => {
                const cor = normalizarNome(colunas[ci]).toUpperCase();
                if (!cor) return;
                const p = normalizarPreco(linha[ci]);
                if (!p.ok) return;
                const avisos = [];
                if (cod.promocional) avisos.push('Código veio marcado como promocional (com *) na tabela');
                itens.push({
                    aba,
                    linha: i,
                    codigo: cod.codigo + '-' + cor.replace(/\s+/g, ''),
                    nome: nomeBase + ' (' + cor + ')',
                    largura: null,
                    preco_custo: p.valor,
                    unidade: tipo === 'tecido' ? 'm' : 'un',
                    tipo,
                    promocional: cod.promocional,
                    avisos,
                    problema: null
                });
            });
        }
        return itens;
    }

    const api = { normalizarNome, normalizarCodigo, normalizarPreco, normalizarLargura, motivoLarguraIlegivel, detectarCabecalho, ehLinhaDeProduto, sugerirMapeamento, sugerirTipoAba, montarItens, markupDeExistente, aplicarMarkup, indexarExistentes, classificar, aplicarImportacao, desfazerImportacao, resolverAcao, validarDecisoes, assinaturaDoLayout, montarPerfil, perfilDoFornecedor, codigoLivre, nomeLivre, agruparLinhasPdf, expandirPorCor, CAMPOS_DO_IMPORTADOR };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ImportadorCore = api;

})(typeof window !== 'undefined' ? window : null);
