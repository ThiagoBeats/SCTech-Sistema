'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/importador-core.js');

test('normalizarCodigo remove o asterisco e marca promocional', () => {
    assert.deepStrictEqual(C.normalizarCodigo('*AC123'), { codigo: 'AC123', promocional: true });
    assert.deepStrictEqual(C.normalizarCodigo('AC123'), { codigo: 'AC123', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo('  ac 123 '), { codigo: 'AC123', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo(''), { codigo: '', promocional: false });
    assert.deepStrictEqual(C.normalizarCodigo(null), { codigo: '', promocional: false });
});

test('normalizarPreco aceita virgula, ponto e numero', () => {
    assert.deepStrictEqual(C.normalizarPreco('78,90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco('78.90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco('R$ 78,90'), { valor: 78.9, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco(78.900000000000006), { valor: 78.9, ok: true, motivo: null });
});

test('normalizarPreco recusa traco, vazio e texto', () => {
    for (const bruto of ['--', '', '   ', null, undefined, 'sob consulta']) {
        const r = C.normalizarPreco(bruto);
        assert.strictEqual(r.ok, false, `deveria recusar ${JSON.stringify(bruto)}`);
        assert.strictEqual(r.valor, null);
        assert.ok(r.motivo && r.motivo.length > 0);
    }
});

test('normalizarLargura avisa quando passa de 10', () => {
    assert.deepStrictEqual(C.normalizarLargura('2,80'), { valor: 2.8, aviso: null });
    assert.deepStrictEqual(C.normalizarLargura(3), { valor: 3, aviso: null });
    const cm = C.normalizarLargura('280');
    assert.strictEqual(cm.valor, 280);
    assert.match(cm.aviso, /cent[ií]metro/i);
    assert.deepStrictEqual(C.normalizarLargura(''), { valor: null, aviso: null });
});

test('normalizarNome colapsa espacos', () => {
    assert.strictEqual(C.normalizarNome('  LINHO   BELGA  '), 'LINHO BELGA');
    assert.strictEqual(C.normalizarNome(null), '');
});

test('normalizarLargura com sufixo de unidade (Finding A)', () => {
    // FINDING A: widths with unit suffixes should parse, not silently lose the value
    assert.deepStrictEqual(C.normalizarLargura('2,80m'), { valor: 2.8, aviso: null });
    assert.deepStrictEqual(C.normalizarLargura('2.80 m'), { valor: 2.8, aviso: null });
    const cm = C.normalizarLargura('280cm');
    assert.strictEqual(cm.valor, 280);
    assert.match(cm.aviso, /cent[ií]metro/i);
    // Currency symbol in width cell means column mapping is wrong — reject it
    assert.deepStrictEqual(C.normalizarLargura('R$ 2,80'), { valor: null, aviso: null });
});

test('normalizarPreco e normalizarLargura rejeitam valores negativos (Finding B)', () => {
    // FINDING B: negative prices and widths should be rejected
    const preco1 = C.normalizarPreco('-78,90');
    assert.strictEqual(preco1.ok, false);
    assert.strictEqual(preco1.valor, null);
    assert.ok(preco1.motivo && preco1.motivo.length > 0);

    const preco2 = C.normalizarPreco(-78.9);
    assert.strictEqual(preco2.ok, false);
    assert.strictEqual(preco2.valor, null);
    assert.ok(preco2.motivo && preco2.motivo.length > 0);

    // Zero stays valid for both
    assert.deepStrictEqual(C.normalizarPreco(0), { valor: 0, ok: true, motivo: null });
    assert.deepStrictEqual(C.normalizarPreco('0'), { valor: 0, ok: true, motivo: null });

    // Width: negative values should return null
    assert.deepStrictEqual(C.normalizarLargura(-5), { valor: null, aviso: null });
});

const path = require('node:path');
const { lerXlsx } = require('./xlsx-min.js');
const PLANILHA = path.join(__dirname, '..', 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

test('detectarCabecalho acha a linha 2 nas abas de tecido', () => {
    const { abas } = lerXlsx(PLANILHA);
    for (const aba of ['Book 10', 'Book 12', 'Book 13', 'Book 14', 'Book 15', 'Book 16']) {
        const r = C.detectarCabecalho(abas[aba]);
        assert.strictEqual(r.indice, 1, `${aba}: cabecalho deveria estar no indice 1`);
        assert.ok(r.colunas.some(c => /C[OÓ]DIGO/i.test(c)), `${aba}: faltou CODIGO`);
    }
});

test('detectarCabecalho devolve -1 quando nao ha cabecalho', () => {
    const r = C.detectarCabecalho([['', ''], ['algum texto solto'], ['']]);
    assert.strictEqual(r.indice, -1);
    assert.deepStrictEqual(r.colunas, []);
});

test('ehLinhaDeProduto exige codigo e nome', () => {
    const mapa = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };
    assert.strictEqual(C.ehLinhaDeProduto(['AC1', 'Linho', '', '2.8', '78,90'], mapa), true);
    assert.strictEqual(C.ehLinhaDeProduto(['AC1', '', '', '', ''], mapa), false);
    assert.strictEqual(C.ehLinhaDeProduto(['', 'Linho', '', '', '78,90'], mapa), false);
    assert.strictEqual(C.ehLinhaDeProduto([], mapa), false);
});

test('a observacao do MODELO WAVE PLUS nao passa por linha de produto', () => {
    const mapa = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };
    const obs = ['MODELO WAVE PLUS NAO ACOMPANHA A ENTRETELA'];
    assert.strictEqual(C.ehLinhaDeProduto(obs, mapa), false);
});

test('linha com preco invalido continua sendo linha de produto', () => {
    const mapa = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };
    assert.strictEqual(C.ehLinhaDeProduto(['AC1', 'Linho', '', '2.8', '--'], mapa), true);
});

test('SUPPVC-Retangular-Unic cabecalho agora detecta na linha 1 (nao mais 9)', () => {
    const { abas } = lerXlsx(PLANILHA);
    const r = C.detectarCabecalho(abas['SUPPVC-Retangular-Unic']);
    assert.strictEqual(r.indice, 1, 'cabecalho deve estar no indice 1');
});

test('primeira linha de produto apos cabecalho do SUPPVC e SP001', () => {
    const { abas } = lerXlsx(PLANILHA);
    const aba = abas['SUPPVC-Retangular-Unic'];
    const r = C.detectarCabecalho(aba);
    const mapa = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };
    // Proxima linha apos cabecalho deve ser SP001
    const proximaLinha = aba[r.indice + 1];
    assert.ok(proximaLinha && proximaLinha[0], 'tem uma proxima linha');
    const { codigo } = C.normalizarCodigo(proximaLinha[0]);
    assert.strictEqual(codigo, 'SP001', 'primeira linha de produto e SP001');
});

test('linha que parece cabecalho (rotulos de COD e DESCRICAO) e rejeitada como produto', () => {
    const mapa = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };
    // Uma linha que tem os rotulos de cabecalho como valores
    const linhaRotulos = ['CÓD.', 'DESCRIÇÃO', 'DOURADO', 'CROMADO', 'AÇO ESC.', 'OURO VELHO', 'BRANCO', 'PRETO'];
    assert.strictEqual(C.ehLinhaDeProduto(linhaRotulos, mapa), false, 'linha com rotulos de cabecalho deve ser rejeitada');
});

test('linha com CÓD. e ARTIGO (real da planilha Cor Metal) e rejeitada', () => {
    const mapa = { codigo: 0, nome: 1 };
    // Real: row 59 de "Cor Metal" tem exatamente isso
    assert.strictEqual(C.ehLinhaDeProduto(['CÓD.', 'ARTIGO'], mapa), false, 'linha CÓD./ARTIGO e um header duplicado');
});

test('produto com nome PRODUTO (isolado) passa porque codigo nao e rotulo', () => {
    const mapa = { codigo: 0, nome: 1 };
    // "AC1" nao e um rotulo de codigo (nao tem COD/REF), entao mesmo que PRODUTO seja rotulo de nome, passa
    assert.strictEqual(C.ehLinhaDeProduto(['AC1', 'PRODUTO'], mapa), true, 'produto com nome PRODUTO e valido se codigo nao e rotulo');
});

test('codigo que contem COD (como CODIGO-123) passa porque nome nao e rotulo', () => {
    const mapa = { codigo: 0, nome: 1 };
    // "CODIGO-123" match /C[OÓ]D/i, mas "Linho Belga" nao match nenhum rotulo de nome, entao passa
    assert.strictEqual(C.ehLinhaDeProduto(['CODIGO-123', 'Linho Belga'], mapa), true);
});

test('codigos como REF001, CODIGO123, COD-99, REFORCO com nome normal passam', () => {
    const mapa = { codigo: 0, nome: 1 };
    assert.strictEqual(C.ehLinhaDeProduto(['REF001', 'Algodao'], mapa), true);
    assert.strictEqual(C.ehLinhaDeProduto(['CODIGO123', 'Poliester'], mapa), true);
    assert.strictEqual(C.ehLinhaDeProduto(['COD-99', 'Seda'], mapa), true);
    assert.strictEqual(C.ehLinhaDeProduto(['REFORCO', 'Reforcado'], mapa), true);
});

test('todas as 22 abas tem cabecalho nas posicoes esperadas (regressao)', () => {
    const { abas } = lerXlsx(PLANILHA);
    const resultados = {};
    for (const [aba, linhas] of Object.entries(abas)) {
        const r = C.detectarCabecalho(linhas);
        resultados[aba] = r.indice;
    }

    // Posicoes esperadas: o SUPPVC agora deve retornar 1, todos os others devem manter seus valores
    const esperados = {
        'Capa': -1,
        'Promocionais-Book 06': 1,
        'Book 10': 1,
        'Book 12': 1,
        'Book 13': 1,
        'Book 14': 1,
        'Book 15': 1,
        'Book 16': 1,
        'Trilho Motorizado': -1,
        'Varão Prime Montado': -1,
        'Trilho Slim Montado': -1,
        'Trilho Square Montado': -1,
        'Varão Unic 19mm Montado': -1,
        'Wave-Square-Retangular': 1,
        'Trilhos': 2,
        'SUPPVC-Retangular-Unic': 1,
        'Cor Metal': 2,
        'Abraçadeira-Ponteira': 1,
        'Cor Madeira': 2,
        'Barras': 3,
        'Broca-Bucha-Parafuso': 1,
        'Aviamentos-Pingentes': 1
    };

    for (const [aba, esperado] of Object.entries(esperados)) {
        assert.strictEqual(resultados[aba], esperado, `${aba}: esperado ${esperado}, obteve ${resultados[aba]}`);
    }
});

test('sugerirMapeamento identifica as colunas do layout de tecido', () => {
    const colunas = ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE', 'PEÇA'];
    assert.deepStrictEqual(C.sugerirMapeamento(colunas), {
        codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1
    });
});

test('sugerirMapeamento prefere CORTE a PECA quando os dois existem', () => {
    const m = C.sugerirMapeamento(['CÓDIGO', 'DESCRIÇÃO', '', 'LARGURA', 'PEÇA', 'CORTE']);
    assert.strictEqual(m.preco, 5);
});

test('sugerirMapeamento cai para PRECO quando nao ha CORTE', () => {
    const m = C.sugerirMapeamento(['CÓD', 'DESCRIÇÃO', 'CORES', 'QUANT.', 'PREÇO']);
    assert.strictEqual(m.codigo, 0);
    assert.strictEqual(m.nome, 1);
    assert.strictEqual(m.preco, 4);
    assert.strictEqual(m.largura, -1);
});

test('sugerirMapeamento devolve -1 para o que nao achou', () => {
    const m = C.sugerirMapeamento(['A', 'B', 'C']);
    assert.deepStrictEqual(m, { codigo: -1, nome: -1, largura: -1, preco: -1, unidade: -1 });
});

test('sugerirTipoAba separa tecido, material e Capa', () => {
    assert.strictEqual(C.sugerirTipoAba('Book 10', ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE']), 'tecido');
    assert.strictEqual(C.sugerirTipoAba('Trilhos', ['CÓD', 'DESCRIÇÃO', 'CORES', 'PREÇO']), 'material');
    assert.strictEqual(C.sugerirTipoAba('Capa', []), 'ignorar');
});

test('todas as abas de tecido da planilha real sao sugeridas como tecido', () => {
    const { abas } = lerXlsx(PLANILHA);
    for (const aba of ['Book 10', 'Book 12', 'Book 13', 'Book 14', 'Book 15', 'Book 16']) {
        const { colunas } = C.detectarCabecalho(abas[aba]);
        assert.strictEqual(C.sugerirTipoAba(aba, colunas), 'tecido', aba);
    }
});

test('detectarCabecalho e sugerirMapeamento concordam sobre ARTIGO (real do Cor Metal)', () => {
    // ARTIGO é usado como coluna de nome na planilha real (Cor Metal, row 59)
    // Ambas as funções devem reconhecer esta linha como cabeçalho
    const linhaComArtigo = ['CÓD.', 'ARTIGO', 'PREÇO'];

    // detectarCabecalho deve reconhecer como cabeçalho
    const r = C.detectarCabecalho([linhaComArtigo]);
    assert.strictEqual(r.indice, 0, 'detectarCabecalho deve reconhecer ARTIGO como cabeçalho');

    // sugerirMapeamento deve encontrar ARTIGO como coluna de nome
    const m = C.sugerirMapeamento(linhaComArtigo);
    assert.strictEqual(m.codigo, 0, 'deve encontrar CÓD. como codigo');
    assert.strictEqual(m.nome, 1, 'deve encontrar ARTIGO como nome');
    assert.strictEqual(m.preco, 2, 'deve encontrar PREÇO como preco');
});

test('detectarCabecalho e sugerirMapeamento concordam sobre REF (bare, sem ERENCIA)', () => {
    // REF deve ser reconhecido como codigo (padrão REF(ER[EÊ]NCIA)? permite isso)
    const linhaComRef = ['REF', 'DESCRIÇÃO', 'PREÇO'];

    // detectarCabecalho deve reconhecer como cabeçalho
    const r = C.detectarCabecalho([linhaComRef]);
    assert.strictEqual(r.indice, 0, 'detectarCabecalho deve reconhecer REF como cabeçalho');

    // sugerirMapeamento deve encontrar REF como coluna de codigo
    const m = C.sugerirMapeamento(linhaComRef);
    assert.strictEqual(m.codigo, 0, 'deve encontrar REF como codigo');
    assert.strictEqual(m.nome, 1, 'deve encontrar DESCRIÇÃO como nome');
    assert.strictEqual(m.preco, 2, 'deve encontrar PREÇO como preco');
});

const MAPA_TECIDO = { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 };

test('montarItens converte as linhas do Book 10 em itens', () => {
    const { abas } = lerXlsx(PLANILHA);
    const itens = C.montarItens({
        linhas: abas['Book 10'], cabecalhoIndice: 1, mapa: MAPA_TECIDO, tipo: 'tecido', aba: 'Book 10'
    });
    assert.ok(itens.length >= 30, `esperava 30+ itens, veio ${itens.length}`);
    assert.ok(itens.every(i => i.codigo), 'todo item precisa ter codigo');
    assert.ok(itens.every(i => i.nome), 'todo item precisa ter nome');
    assert.ok(itens.every(i => i.tipo === 'tecido'));
    assert.ok(itens.every(i => i.unidade === 'm'), 'tecido e sempre vendido por metro');
});

test('montarItens marca com problema as linhas de preco --', () => {
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['AC1', 'Com preco', '', '2,80', '78,90'],
            ['AC2', 'Sem preco', '', '2,80', '--']
        ],
        cabecalhoIndice: 0, mapa: MAPA_TECIDO, tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens.length, 2);
    assert.strictEqual(itens[0].problema, null);
    assert.strictEqual(itens[0].preco_custo, 78.9);
    assert.ok(itens[1].problema, 'o item sem preco precisa de um motivo escrito');
    assert.strictEqual(itens[1].preco_custo, null);
});

test('montarItens guarda o aviso de promocional e o de largura em cm', () => {
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['*AC9', 'Promo', '', '280', '50,00']
        ],
        cabecalhoIndice: 0, mapa: MAPA_TECIDO, tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens[0].codigo, 'AC9');
    assert.strictEqual(itens[0].promocional, true);
    assert.strictEqual(itens[0].avisos.length, 2);
    assert.ok(itens[0].avisos.some(a => /promo/i.test(a)));
    assert.ok(itens[0].avisos.some(a => /cent[ií]metro/i.test(a)));
});

test('montarItens ignora observacoes e linhas em branco', () => {
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['AC1', 'Real', '', '2,80', '10,00'],
            ['MODELO WAVE PLUS NAO ACOMPANHA A ENTRETELA'],
            [],
            ['', '', '', '', '']
        ],
        cabecalhoIndice: 0, mapa: MAPA_TECIDO, tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens.length, 1);
    assert.strictEqual(itens[0].codigo, 'AC1');
});

test('montarItens usa a coluna de unidade quando o tipo e material', () => {
    const itens = C.montarItens({
        linhas: [
            ['CÓD', 'DESCRIÇÃO', 'UNID.', 'PREÇO'],
            ['TR1', 'Trilho', 'm', '25,00'],
            ['TR2', 'Suporte', '', '3,00']
        ],
        cabecalhoIndice: 0,
        mapa: { codigo: 0, nome: 1, largura: -1, preco: 3, unidade: 2 },
        tipo: 'material', aba: 'Trilhos'
    });
    assert.strictEqual(itens[0].unidade, 'm');
    assert.strictEqual(itens[1].unidade, 'un');
    assert.strictEqual(itens[0].largura, null);
});

test('montarItens NAO remapeia: mudanca de layout no meio da planilha so marca problema, com o mapa original', () => {
    // Reproduz o defeito real da Promocionais-Book 06: uma segunda sub-tabela comeca
    // com um cabecalho repetido mas em ORDEM DIFERENTE (sem coluna de nome, largura e
    // preco deslocados). O mapa original continua sendo usado para TODAS as linhas —
    // os itens da segunda secao entram, mas marcados com `problema` para conferencia.
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['AC1', 'Real um', '', '2,80', '10,00'],
            ['Secao dois'],
            ['CODIGO', 'LARGURA', 'CORTE', '', 'PEÇA'],  // cabecalho diferente do original
            ['AC2', '2,5', '20,00', '', '19,00']          // continua usando o mapa ORIGINAL
        ],
        cabecalhoIndice: 0, mapa: { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 },
        tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens.length, 2, 'nenhum item foi perdido');

    assert.strictEqual(itens[0].codigo, 'AC1');
    assert.strictEqual(itens[0].nome, 'Real um');
    assert.strictEqual(itens[0].preco_custo, 10.0);
    assert.strictEqual(itens[0].problema, null, 'primeira secao nao tem problema');

    assert.strictEqual(itens[1].codigo, 'AC2', 'item da segunda secao esta presente');
    assert.strictEqual(itens[1].nome, '2,5', 'nome ainda vem da coluna 1 do mapa ORIGINAL (nao houve remapeamento)');
    assert.strictEqual(itens[1].largura, null, 'largura ainda le a coluna 3 do mapa original (vazia nesta linha)');
    assert.strictEqual(itens[1].preco_custo, 19.0, 'preco ainda le a coluna 4 do mapa original');
    assert.ok(itens[1].problema, 'item da segunda secao precisa entrar com problema marcado');
    assert.match(itens[1].problema, /muda de layout/i);
    assert.match(itens[1].problema, /linha 4/);
    assert.ok(itens[1].avisos.some(a => /puramente numérico/i.test(a)),
        'nome numerico ainda gera o aviso de sempre');
});

test('montarItens nao marca problema quando o cabecalho repetido e identico ao original', () => {
    // Cor Metal e Cor Madeira repetem o MESMO cabecalho no meio da planilha (ex.: CÓD./ARTIGO
    // varias vezes). Isso nao e mudanca de layout: nao deve gerar nenhum aviso nem problema.
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['AC1', 'Real um', '', '2,80', '10,00'],
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],  // cabecalho repetido, identico
            ['AC2', 'Real dois', '', '2,60', '12,00']
        ],
        cabecalhoIndice: 0, mapa: { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 },
        tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens.length, 2, 'a linha de cabecalho repetido nao vira item');
    assert.strictEqual(itens[0].problema, null);
    assert.strictEqual(itens[1].problema, null, 'cabecalho identico nao gera problema');
    assert.strictEqual(itens[1].codigo, 'AC2');
    assert.strictEqual(itens[1].nome, 'Real dois');
});

test('montarItens nunca trata codigos de produto como REF001 ou COD-99 como cabecalho', () => {
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['REF001', 'Algodão', '', '2,80', '10,00'],
            ['COD-99', 'Seda', '', '2,50', '12,00']
        ],
        cabecalhoIndice: 0, mapa: { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 },
        tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens.length, 2, 'REF001 e COD-99 sao codigos de produto, nao cabecalhos');
    assert.strictEqual(itens[0].codigo, 'REF001');
    assert.strictEqual(itens[0].problema, null);
    assert.strictEqual(itens[1].codigo, 'COD-99');
    assert.strictEqual(itens[1].problema, null);
});

test('montarItens nao trata produtos com nomes contendo substrings de rótulos como headers', () => {
    // Reproduz o caso real de ABRAÇADEIRA CORAÇÃO (contém COR que match /COR/i)
    // e UNIDADE (que match /UNID/i) na linha de dados
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['AC1', 'Real um', '', '2,80', '10,00'],
            ['REF-PROD-99', 'ABRAÇADEIRA CORAÇÃO DECORATIVA', '', '2,50', '12,00'],
            ['AC3', 'Produto normal', '', '2,60', '9,00']
        ],
        cabecalhoIndice: 0, mapa: { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 },
        tipo: 'tecido', aba: 'Teste'
    });
    assert.strictEqual(itens.length, 3, 'todos 3 produtos devem ser incluídos');
    assert.strictEqual(itens[0].codigo, 'AC1');
    assert.strictEqual(itens[1].codigo, 'REF-PROD-99', 'ABRAÇADEIRA CORAÇÃO não deve ser tratado como header');
    assert.strictEqual(itens[1].nome, 'ABRAÇADEIRA CORAÇÃO DECORATIVA');
    assert.strictEqual(itens[2].codigo, 'AC3');
    itens.forEach(i => {
        assert.strictEqual(i.avisos.length, 0, 'nenhum item deve ter aviso');
        assert.strictEqual(i.problema, null, 'nenhum item deve estar marcado com problema');
    });
});

test('montarItens adiciona aviso de nome numerico', () => {
    const itens = C.montarItens({
        linhas: [
            ['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE'],
            ['AC1', '1.4', '', '2,80', '10,00'],
            ['AC2', '2.5m', '', '3,00', '15,00'],
            ['AC3', 'Normal', '', '2,50', '12,00']
        ],
        cabecalhoIndice: 0, mapa: { codigo: 0, nome: 1, largura: 3, preco: 4, unidade: -1 },
        tipo: 'tecido', aba: 'Teste'
    });
    assert.ok(itens[0].avisos.some(a => /puramente numérico/i.test(a)), 'item 0 com nome "1.4" deve ter aviso');
    assert.strictEqual(itens[1].avisos.length, 0, 'item 1 com nome "2.5m" nao e puramente numerico');
    assert.strictEqual(itens[2].avisos.length, 0, 'item 2 com nome normal nao tem aviso numerico');
});
