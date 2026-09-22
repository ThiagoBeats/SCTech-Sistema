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

test('markupDeExistente deriva o percentual do item salvo', () => {
    assert.strictEqual(C.markupDeExistente({ preco_custo: 100, preco: 180 }), 80);
    assert.strictEqual(C.markupDeExistente({ preco_custo: 50, preco: 50 }), 0);
});

test('markupDeExistente devolve null quando nao da para derivar', () => {
    assert.strictEqual(C.markupDeExistente({ preco_custo: 0, preco: 180 }), null);
    assert.strictEqual(C.markupDeExistente({ preco: 180 }), null);
    assert.strictEqual(C.markupDeExistente({ preco_custo: 100 }), null);
    assert.strictEqual(C.markupDeExistente({ preco_custo: 100, preco: 0 }), null);
    assert.strictEqual(C.markupDeExistente(null), null);
});

test('aplicarMarkup calcula a venda a partir do custo', () => {
    assert.strictEqual(C.aplicarMarkup(100, 80), 180);
    assert.strictEqual(C.aplicarMarkup(78.9, 0), 78.9);
    assert.strictEqual(C.aplicarMarkup(33.33, 50), 50);
});

test('custo novo preserva o markup do item existente', () => {
    const existente = { preco_custo: 100, preco: 180 };
    const markup = C.markupDeExistente(existente);
    assert.strictEqual(C.aplicarMarkup(120, markup), 216);
});

function itemDeTeste(extra) {
    return Object.assign({
        aba: 'Teste', linha: 1, codigo: 'AC1', nome: 'Linho', largura: 2.8,
        preco_custo: 100, unidade: 'm', tipo: 'tecido', promocional: false,
        avisos: [], problema: null
    }, extra || {});
}

test('classificar separa novo de atualizado', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const r = C.classificar({
        itens: [itemDeTeste({ codigo: 'AC1' }), itemDeTeste({ codigo: 'AC2', nome: 'Voil' })],
        catalogo, materiais: [], fornecedorId: 7
    });
    assert.strictEqual(r.atualizados.length, 1);
    assert.strictEqual(r.atualizados[0].existente.id, 1);
    assert.strictEqual(r.novos.length, 1);
    assert.strictEqual(r.novos[0].item.codigo, 'AC2');
});

test('classificar marca conflito quando o codigo e de outro fornecedor', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 99 }];
    const r = C.classificar({ itens: [itemDeTeste()], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.conflitos.length, 1);
    assert.strictEqual(r.atualizados.length, 0);
    assert.match(r.conflitos[0].motivo, /fornecedor/i);
});

test('classificar acha conflito tambem entre tecido e material', () => {
    const materiais = [{ id: 5, referencia: 'AC1', nome: 'Trilho', preco_custo: 10, preco: 18, fornecedor_id: 99 }];
    const r = C.classificar({ itens: [itemDeTeste()], catalogo: [], materiais, fornecedorId: 7 });
    assert.strictEqual(r.conflitos.length, 1, 'codigo e unico somando catalogo e materiais');
});

test('classificar separa item existente sem markup derivavel', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 0, preco: 0, fornecedor_id: 7 }];
    const r = C.classificar({ itens: [itemDeTeste()], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.sem_markup.length, 1);
    assert.strictEqual(r.atualizados.length, 0);
});

test('classificar bloqueia nome repetido de outro item', () => {
    const catalogo = [{ id: 1, referencia: 'ZZ9', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const r = C.classificar({ itens: [itemDeTeste({ codigo: 'AC1', nome: 'linho' })], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.nomes_repetidos.length, 1);
    assert.strictEqual(r.novos.length, 0);
    assert.match(r.nomes_repetidos[0].motivo, /nome/i);
});

test('classificar poe o item com problema no grupo de problemas', () => {
    const r = C.classificar({
        itens: [itemDeTeste({ preco_custo: null, problema: 'Pre�o "--" � item sem pre�o na tabela' })],
        catalogo: [], materiais: [], fornecedorId: 7
    });
    assert.strictEqual(r.problemas.length, 1);
    assert.strictEqual(r.novos.length, 0);
});

test('classificar lista o que sumiu da tabela do mesmo fornecedor', () => {
    const catalogo = [
        { id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 },
        { id: 2, referencia: 'AC2', nome: 'Voil', preco_custo: 50, preco: 90, fornecedor_id: 7 },
        { id: 3, referencia: 'XX1', nome: 'De outro', preco_custo: 50, preco: 90, fornecedor_id: 99 }
    ];
    const r = C.classificar({ itens: [itemDeTeste({ codigo: 'AC1' })], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.sumiram.length, 1);
    assert.strictEqual(r.sumiram[0].existente.referencia, 'AC2');
});

test('classificar casa codigos ignorando o asterisco e a caixa', () => {
    const catalogo = [{ id: 1, referencia: 'ac1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const r = C.classificar({ itens: [itemDeTeste({ codigo: 'AC1' })], catalogo, materiais: [], fornecedorId: 7 });
    assert.strictEqual(r.atualizados.length, 1);
});

test('classificar trata fornecedor_id: 0 como fornecedor distinct (FIX 1)', () => {
    // Quando o registro tem fornecedor_id: 0, deve ser tratado como um fornecedor espec�fico,
    // n�o como "sem fornecedor". Isso � importante para sistemas que usam ids sequenciais.
    const catalogo = [
        { id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 0 },
        { id: 2, referencia: 'AC2', nome: 'Voil', preco_custo: 50, preco: 90, fornecedor_id: 7 }
    ];
    
    // Caso 1: 0 vs 0 deve ser mesmo fornecedor (atualizados)
    const r1 = C.classificar({
        itens: [itemDeTeste({ codigo: 'AC1' })],
        catalogo, materiais: [], fornecedorId: 0
    });
    assert.strictEqual(r1.atualizados.length, 1, 'fornecedor_id: 0 vs fornecedorId: 0 deve ser atualizados');
    assert.strictEqual(r1.conflitos.length, 0);
    
    // Caso 2: 0 vs null deve ser conflito (fornecedores diferentes)
    const r2 = C.classificar({
        itens: [itemDeTeste({ codigo: 'AC1' })],
        catalogo, materiais: [], fornecedorId: null
    });
    assert.strictEqual(r2.conflitos.length, 1, 'fornecedor_id: 0 vs fornecedorId: null deve ser conflito');
    assert.strictEqual(r2.atualizados.length, 0);
    
    // Caso 3: 0 vs undefined deve ser conflito
    const r3 = C.classificar({
        itens: [itemDeTeste({ codigo: 'AC1' })],
        catalogo, materiais: [], fornecedorId: undefined
    });
    assert.strictEqual(r3.conflitos.length, 1, 'fornecedor_id: 0 vs fornecedorId: undefined deve ser conflito');
    
    // Caso 4: 0 vs '' (string vazia) deve ser conflito
    const r4 = C.classificar({
        itens: [itemDeTeste({ codigo: 'AC1' })],
        catalogo, materiais: [], fornecedorId: ''
    });
    assert.strictEqual(r4.conflitos.length, 1, 'fornecedor_id: 0 vs fornecedorId: "" deve ser conflito');
    
    // Caso 5: null vs undefined deve ser mesmo fornecedor (ambos representam "sem fornecedor")
    const r5 = C.classificar({
        itens: [itemDeTeste({ codigo: 'AC1' })],
        catalogo: [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: null }],
        materiais: [], fornecedorId: undefined
    });
    assert.strictEqual(r5.atualizados.length, 1, 'fornecedor_id: null vs fornecedorId: undefined deve ser atualizados');
});

test('classificar normaliza codigo e nome do item antes de classificar (FIX 2)', () => {
    // Se o item vem com codigo nao normalizado (com asterisco, minusculas, espacos),
    // deve ser normalizado antes de comparar com os registros indexados.
    const catalogo = [
        { id: 1, referencia: 'ac1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }
    ];

    const itemNaoNormalizado = {
        aba: 'Teste', linha: 1, codigo: '*AC1', nome: 'linho ', largura: 2.8,
        preco_custo: 100, unidade: 'm', tipo: 'tecido', promocional: false,
        avisos: [], problema: null
    };

    const r = C.classificar({
        itens: [itemNaoNormalizado],
        catalogo, materiais: [], fornecedorId: 7
    });

    // O item com codigo '*AC1' e nome 'linho ' deve ser normalizado e encontrado como atualizacao
    assert.strictEqual(r.atualizados.length, 1, 'item nao normalizado deve ser encontrado como atualizados');
    assert.strictEqual(r.atualizados[0].existente.id, 1);
    // Nao deve ficar em sumiram porque foi "visto" apos normalizacao
    assert.strictEqual(r.sumiram.length, 0, 'sumiram deve estar vazio quando o item foi normalizado e encontrado');
});

test('aplicarImportacao cria tecido novo com o markup informado', () => {
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'AC2', nome: 'Voil', preco_custo: 100 }), existente: null, markup: 80, acao: 'criar' }],
        catalogo: [], materiais: [], fornecedor: { id: 7, nome: 'RC' }, agora: 1000
    });
    assert.strictEqual(r.catalogo.length, 1);
    const t = r.catalogo[0];
    assert.strictEqual(t.referencia, 'AC2');
    assert.strictEqual(t.preco_custo, 100);
    assert.strictEqual(t.preco, 180);
    assert.strictEqual(t.largura_rolo, 2.8);
    assert.strictEqual(t.fornecedor_id, 7);
    assert.strictEqual(t.fornecedor_nome, 'RC');
    assert.strictEqual(t.min_estoque, 0);
    assert.strictEqual(t.id, 1000);
    assert.deepStrictEqual(r.resumo, { criados: 1, atualizados: 0, ignorados: 0 });
});

test('aplicarImportacao cria material novo com unidade e estoque zerado', () => {
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'TR1', nome: 'Trilho', tipo: 'material', unidade: 'm', preco_custo: 20, largura: null }), existente: null, markup: 50, acao: 'criar' }],
        catalogo: [], materiais: [], fornecedor: { id: 7, nome: 'RC' }, agora: 2000
    });
    assert.strictEqual(r.materiais.length, 1);
    assert.strictEqual(r.catalogo.length, 0);
    const m = r.materiais[0];
    assert.strictEqual(m.unidade, 'm');
    assert.strictEqual(m.preco, 30);
    assert.strictEqual(m.estoque_atual, 0);
});

test('aplicarImportacao atualiza custo e recalcula venda preservando o markup', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 100, preco: 180, largura_rolo: 2.8, min_estoque: 5, fornecedor_id: 7, fornecedor_nome: 'RC', imagem: 'foto' }];
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'AC1', preco_custo: 120 }), existente: catalogo[0], markup: 80, acao: 'atualizar' }],
        catalogo, materiais: [], fornecedor: { id: 7, nome: 'RC' }, agora: 3000
    });
    const t = r.catalogo[0];
    assert.strictEqual(t.id, 1, 'atualizar nao troca o id');
    assert.strictEqual(t.preco_custo, 120);
    assert.strictEqual(t.preco, 216);
    assert.strictEqual(t.min_estoque, 5, 'estoque minimo nao e tocado');
    assert.strictEqual(t.imagem, 'foto', 'a foto nao e apagada');
    assert.deepStrictEqual(r.resumo, { criados: 0, atualizados: 1, ignorados: 0 });
});

test('aplicarImportacao nao mexe nas listas originais', () => {
    const catalogo = [];
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'AC2' }), existente: null, markup: 80, acao: 'criar' }],
        catalogo, materiais: [], fornecedor: null, agora: 4000
    });
    assert.strictEqual(catalogo.length, 0, 'a lista recebida continua intacta');
    assert.strictEqual(r.catalogo.length, 1);
});

test('aplicarImportacao respeita acao ignorar', () => {
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: 'AC9' }), existente: null, markup: 80, acao: 'ignorar' }],
        catalogo: [], materiais: [], fornecedor: null, agora: 5000
    });
    assert.strictEqual(r.catalogo.length, 0);
    assert.deepStrictEqual(r.resumo, { criados: 0, atualizados: 0, ignorados: 1 });
});

test('aplicarImportacao da ids diferentes para itens criados no mesmo lote', () => {
    const r = C.aplicarImportacao({
        decisoes: [
            { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
            { item: itemDeTeste({ codigo: 'A2', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
        ],
        catalogo: [], materiais: [], fornecedor: null, agora: 6000
    });
    assert.notStrictEqual(r.catalogo[0].id, r.catalogo[1].id);
});

test('resolverAcao vira atualizar quando o codigo bate com um registro existente', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 99 }];
    const r = C.resolverAcao(itemDeTeste({ codigo: 'AC1' }), catalogo, []);
    assert.strictEqual(r.acao, 'atualizar');
    assert.strictEqual(r.existente.id, 1);
});

test('resolverAcao vira criar quando o usuario editou o codigo para um livre', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 99 }];
    const r = C.resolverAcao(itemDeTeste({ codigo: 'AC1-NOVO' }), catalogo, []);
    assert.strictEqual(r.acao, 'criar');
    assert.strictEqual(r.existente, null);
});

test('validarDecisoes aceita um lote limpo', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'A2', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
    ];
    assert.deepStrictEqual(C.validarDecisoes(decisoes, [], []), []);
});

test('validarDecisoes pega codigo repetido dentro do proprio lote', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'A1', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
    ];
    const erros = C.validarDecisoes(decisoes, [], []);
    assert.strictEqual(erros.length, 1);
    assert.match(erros[0], /A1/);
});

test('validarDecisoes pega nome que colide com outro registro', () => {
    const catalogo = [{ id: 1, referencia: 'ZZ9', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const decisoes = [{ item: itemDeTeste({ codigo: 'A1', nome: 'Linho' }), existente: null, markup: 0, acao: 'criar' }];
    const erros = C.validarDecisoes(decisoes, catalogo, []);
    assert.strictEqual(erros.length, 1);
    assert.match(erros[0], /Linho/);
});

test('validarDecisoes deixa passar o nome do proprio item que esta sendo atualizado', () => {
    const catalogo = [{ id: 1, referencia: 'A1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 7 }];
    const decisoes = [{ item: itemDeTeste({ codigo: 'A1', nome: 'Linho' }), existente: catalogo[0], markup: 0, acao: 'atualizar' }];
    assert.deepStrictEqual(C.validarDecisoes(decisoes, catalogo, []), []);
});

test('validarDecisoes ignora as decisoes marcadas como ignorar', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'A1', nome: 'Dois' }), existente: null, markup: 0, acao: 'ignorar' }
    ];
    assert.deepStrictEqual(C.validarDecisoes(decisoes, [], []), []);
});

test('REGR-CRITICAL 1a: resolverAcao normaliza codigo antes de lookup', () => {
    const catalogo = [{ id: 1, referencia: 'AC1', nome: 'Linho', preco_custo: 90, preco: 162, fornecedor_id: 99 }];

    // Minusculas
    let r = C.resolverAcao(itemDeTeste({ codigo: 'ac1' }), catalogo, []);
    assert.strictEqual(r.acao, 'atualizar', 'codigo minusculo ac1 deve achar AC1');
    assert.strictEqual(r.existente.id, 1);

    // Com asterisco
    r = C.resolverAcao(itemDeTeste({ codigo: '*AC1' }), catalogo, []);
    assert.strictEqual(r.acao, 'atualizar', 'codigo *AC1 deve achar AC1');
    assert.strictEqual(r.existente.id, 1);

    // Com espacos
    r = C.resolverAcao(itemDeTeste({ codigo: ' AC 1 ' }), catalogo, []);
    assert.strictEqual(r.acao, 'atualizar', 'codigo " AC 1 " deve achar AC1');
    assert.strictEqual(r.existente.id, 1);
});

test('REGR-CRITICAL 1b: validarDecisoes normaliza codigo antes de comparacao', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'AC1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'ac1', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
    ];
    const erros = C.validarDecisoes(decisoes, [], []);
    assert.strictEqual(erros.length, 1, 'AC1 e ac1 sao duplicatas');
    assert.match(erros[0], /aparece 2 vezes/);
});

test('REGR-CRITICAL 1c: validarDecisoes normaliza codigo com asterisco', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'AC1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: '*AC1', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
    ];
    const erros = C.validarDecisoes(decisoes, [], []);
    assert.strictEqual(erros.length, 1, 'AC1 e *AC1 sao duplicatas');
    assert.match(erros[0], /aparece 2 vezes/);
});

test('REGR-CRITICAL 1d: aplicarImportacao armazena codigo normalizado', () => {
    const r = C.aplicarImportacao({
        decisoes: [{ item: itemDeTeste({ codigo: '*ac1 ', nome: 'Voil' }), existente: null, markup: 80, acao: 'criar' }],
        catalogo: [], materiais: [], fornecedor: null, agora: 7000
    });
    assert.strictEqual(r.catalogo.length, 1);
    assert.strictEqual(r.catalogo[0].referencia, 'AC1', 'referencia deve ser normalizada (sem *, sem espacos, uppercase)');
});

test('REGR-CRITICAL 2: aplicarImportacao evita colisao de id com registros existentes', () => {
    const catalogoExistente = [
        { id: 5000, referencia: 'XY1', nome: 'Existente', preco_custo: 100, preco: 180, largura_rolo: 2.8 }
    ];
    const r = C.aplicarImportacao({
        decisoes: [
            { item: itemDeTeste({ codigo: 'A1', nome: 'Um' }), existente: null, markup: 0, acao: 'criar' },
            { item: itemDeTeste({ codigo: 'A2', nome: 'Dois' }), existente: null, markup: 0, acao: 'criar' }
        ],
        catalogo: catalogoExistente, materiais: [], fornecedor: null, agora: 5000
    });

    assert.strictEqual(r.catalogo.length, 3, 'tem 1 existente + 2 novos');
    const ids = r.catalogo.map(r => r.id);
    // Todos os IDs devem ser unicos
    assert.strictEqual(new Set(ids).size, 3, 'todos os 3 IDs devem ser distintos');
    // O primeiro (original) pode ser 5000, mas os novos (indices 1 e 2) devem ser maiores
    assert.strictEqual(ids[0], 5000, 'item copiado mantém seu id');
    assert.ok(ids[1] > 5000 && ids[2] > 5000 && ids[2] > ids[1], 'novos IDs devem ser sequenciais e maiores que o maximo existente');
});

test('REGR-CRITICAL 2b: aplicarImportacao com 200 itens gera 200 ids distintos', () => {
    const decisoes = [];
    for (let i = 0; i < 200; i++) {
        decisoes.push({
            item: itemDeTeste({ codigo: 'CODE' + i, nome: 'Item ' + i }),
            existente: null, markup: 0, acao: 'criar'
        });
    }
    const r = C.aplicarImportacao({
        decisoes, catalogo: [], materiais: [], fornecedor: null, agora: 10000
    });

    const ids = r.catalogo.map(r => r.id);
    assert.strictEqual(ids.length, 200);
    assert.strictEqual(new Set(ids).size, 200, 'todos os 200 IDs devem ser distintos');
});

test('REGR-MINOR 3: validarDecisoes deduplica erros de codigo duplicado', () => {
    const decisoes = [
        { item: itemDeTeste({ codigo: 'VUD01', nome: 'A' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'VUD01', nome: 'B' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'VUD01', nome: 'C' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'VUD01', nome: 'D' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'VUD02', nome: 'X' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'VUD02', nome: 'Y' }), existente: null, markup: 0, acao: 'criar' },
        { item: itemDeTeste({ codigo: 'VUD02', nome: 'Z' }), existente: null, markup: 0, acao: 'criar' }
    ];
    const erros = C.validarDecisoes(decisoes, [], []);

    // Deve ter 2 erros: um para VUD01 (aparece 4 vezes) e um para VUD02 (aparece 3 vezes)
    assert.strictEqual(erros.length, 2, 'deve ter 2 erros de codigo duplicado, nao 6');
    assert.ok(erros.some(e => /VUD01.*4 vezes/.test(e)), 'deve relatar VUD01 com 4 vezes');
    assert.ok(erros.some(e => /VUD02.*3 vezes/.test(e)), 'deve relatar VUD02 com 3 vezes');
});

test('montarPerfil normaliza os campos e preenche os defaults', () => {
    const p = C.montarPerfil({ id: 1, nome: '  RC  ', fornecedorId: 7 });
    assert.strictEqual(p.id, 1);
    assert.strictEqual(p.nome, 'RC');
    assert.strictEqual(p.fornecedor_id, 7);
    assert.deepStrictEqual(p.abas, {});
    assert.deepStrictEqual(p.layouts, []);
    assert.deepStrictEqual(p.cores, {});
    assert.strictEqual(p.markup_padrao, 0);
});

test('perfilDoFornecedor acha pelo id do fornecedor', () => {
    const perfis = [
        C.montarPerfil({ id: 1, nome: 'A', fornecedorId: 7 }),
        C.montarPerfil({ id: 2, nome: 'B', fornecedorId: 9 })
    ];
    assert.strictEqual(C.perfilDoFornecedor(perfis, 9).id, 2);
    assert.strictEqual(C.perfilDoFornecedor(perfis, '7').id, 1, 'compara sem se importar com o tipo');
    assert.strictEqual(C.perfilDoFornecedor(perfis, 123), null);
    assert.strictEqual(C.perfilDoFornecedor(null, 7), null);
});

test('assinaturaDoLayout junta os rotulos do cabecalho', () => {
    assert.strictEqual(
        C.assinaturaDoLayout(['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE', 'PEÇA']),
        'CODIGO|DESCRIÇÃO||LARGURA|CORTE|PEÇA'
    );
});

test('assinaturaDoLayout remove colunas vazias no final', () => {
    assert.strictEqual(
        C.assinaturaDoLayout(['A', 'B', '', '']),
        'A|B'
    );
});

test('assinaturaDoLayout preserva colunas vazias no meio', () => {
    assert.strictEqual(
        C.assinaturaDoLayout(['A', '', 'B']),
        'A||B'
    );
});

test('assinaturaDoLayout com todas as colunas vazias devolve string vazia', () => {
    assert.strictEqual(
        C.assinaturaDoLayout(['', '', '']),
        ''
    );
});

test('assinaturaDoLayout ignora trailing empties — two columns differing only in trailing blanks share signature', () => {
    const sig1 = C.assinaturaDoLayout(['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE', 'PEÇA']);
    const sig2 = C.assinaturaDoLayout(['CODIGO', 'DESCRIÇÃO', '', 'LARGURA', 'CORTE', 'PEÇA', '', '']);
    assert.strictEqual(sig1, sig2, 'signatures must be identical');
});

test('as 7 abas de tecido da planilha real compartilham uma assinatura', () => {
    const { abas } = lerXlsx(PLANILHA);
    const assinaturas = new Set();
    for (const aba of ['Book 10', 'Book 12', 'Book 13', 'Book 14', 'Book 15', 'Book 16']) {
        assinaturas.add(C.assinaturaDoLayout(C.detectarCabecalho(abas[aba]).colunas));
    }
    assert.strictEqual(assinaturas.size, 1, 'um mapeamento so deveria servir para todas');
});

test('codigoLivre devolve a base quando ela esta livre', () => {
    assert.strictEqual(C.codigoLivre('1037', new Set()), '1037');
    assert.strictEqual(C.codigoLivre('1037', new Set(['9999'])), '1037');
});

test('codigoLivre acrescenta D ate achar espaco', () => {
    assert.strictEqual(C.codigoLivre('1037', new Set(['1037'])), '1037D');
    assert.strictEqual(C.codigoLivre('1037', new Set(['1037', '1037D'])), '1037DD');
    assert.strictEqual(C.codigoLivre('1037', new Set(['1037', '1037D', '1037DD'])), '1037DDD');
});

test('codigoLivre normaliza a base e compara normalizado', () => {
    assert.strictEqual(C.codigoLivre('*1037', new Set(['1037'])), '1037D');
    assert.strictEqual(C.codigoLivre(' 10 37 ', new Set(['1037'])), '1037D');
});

test('codigoLivre nao entra em laco infinito com base vazia', () => {
    const r = C.codigoLivre('', new Set(['']));
    assert.ok(typeof r === 'string');
    assert.ok(r.length > 0);
});

test('agruparLinhasPdf junta fragmentos da mesma altura', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'AC1', x: 10, y: 100 },
        { texto: 'Linho', x: 80, y: 100 },
        { texto: '78,90', x: 200, y: 100 },
        { texto: 'AC2', x: 10, y: 80 },
        { texto: 'Voil', x: 80, y: 80 },
        { texto: '50,00', x: 200, y: 80 }
    ]);
    assert.deepStrictEqual(linhas, [['AC1', 'Linho', '78,90'], ['AC2', 'Voil', '50,00']]);
});

test('agruparLinhasPdf tolera diferenca pequena de y', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'A', x: 10, y: 100 },
        { texto: 'B', x: 80, y: 101.5 }
    ]);
    assert.deepStrictEqual(linhas, [['A', 'B']]);
});

test('agruparLinhasPdf concatena fragmentos colados na mesma celula', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'LINHO', x: 80, y: 100 },
        { texto: 'BELGA', x: 86, y: 100 },
        { texto: '78,90', x: 300, y: 100 }
    ]);
    assert.deepStrictEqual(linhas, [['LINHO BELGA', '78,90']]);
});

test('agruparLinhasPdf ordena de cima para baixo e da esquerda para a direita', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'z', x: 300, y: 10 },
        { texto: 'a', x: 10, y: 200 },
        { texto: 'b', x: 150, y: 200 }
    ]);
    // Detecta 3 colunas: x=10, x=150, x=300
    // Linha 1 (y=200): a na col 0, b na col 1, col 2 vazia
    // Linha 2 (y=10): col 0 e 1 vazias, z na col 2
    assert.deepStrictEqual(linhas, [['a', 'b', ''], ['', '', 'z']]);
});

test('agruparLinhasPdf descarta fragmentos vazios', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: '  ', x: 10, y: 100 },
        { texto: 'A', x: 80, y: 100 }
    ]);
    assert.deepStrictEqual(linhas, [['A']]);
});

test('agruparLinhasPdf mantém índices de coluna quando uma linha está vazia no meio', () => {
    const linhas = C.agruparLinhasPdf([
        { texto: 'A', x: 10, y: 100 },
        { texto: 'B', x: 80, y: 100 },
        { texto: 'C', x: 150, y: 100 },
        { texto: 'X', x: 10, y: 80 },
        { texto: 'Z', x: 150, y: 80 }
    ]);
    // Primeira linha tem células nas colunas 0, 1, 2
    assert.strictEqual(linhas[0][0], 'A');
    assert.strictEqual(linhas[0][1], 'B');
    assert.strictEqual(linhas[0][2], 'C');
    // Segunda linha tem X na coluna 0 e Z na coluna 2, coluna 1 fica vazia
    assert.strictEqual(linhas[1][0], 'X');
    assert.strictEqual(linhas[1][1], '');
    assert.strictEqual(linhas[1][2], 'Z');
    assert.deepStrictEqual(linhas[1], ['X', '', 'Z']);
});

test('agruparLinhasPdf agrupa rotulo de cabecalho centralizado na mesma coluna dos valores alinhados a esquerda', () => {
    // Caso real de tabela de fornecedor em PDF: o rotulo "DESCRIÇÃO" fica CENTRALIZADO
    // sobre a coluna (span 208-268), enquanto os nomes de produto ficam ALINHADOS A
    // ESQUERDA logo abaixo (span 82-229) - x inicial bem diferente, mas os spans se
    // cruzam. Sem a sobreposicao de span, essas duas coisas cairiam em colunas distintas
    // e sugerirMapeamento nunca acharia a coluna de nome (ela ficaria sempre vazia).
    const linhas = C.agruparLinhasPdf([
        { texto: 'CODIGO', x: 30, y: 200, largura: 40 },
        { texto: 'DESCRIÇÃO', x: 208, y: 200, largura: 60 },
        { texto: 'LARGURA', x: 401, y: 200, largura: 50 },
        { texto: '10001', x: 35, y: 180, largura: 30 },
        { texto: 'TRICÔ HERA (PROMOCIONAL)', x: 82, y: 180, largura: 147 },
        { texto: '1,40', x: 416, y: 180, largura: 19 }
    ]);
    assert.deepStrictEqual(linhas, [
        ['CODIGO', 'DESCRIÇÃO', 'LARGURA'],
        ['10001', 'TRICÔ HERA (PROMOCIONAL)', '1,40']
    ]);
});

test('agruparLinhasPdf nao funde duas colunas quando uma celula larga toca as duas', () => {
    // Uma descricao de produto excepcionalmente comprida pode alcancar o span da
    // coluna vizinha (LARGURA). Isso NUNCA pode fundir as duas colunas em uma so -
    // a celula larga e so ATRIBUIDA a coluna com que mais se sobrepoe (DESCRICAO),
    // sem alterar nenhuma das duas colunas envolvidas.
    const linhas = C.agruparLinhasPdf([
        { texto: 'CODIGO', x: 30, y: 200, largura: 40 },
        { texto: 'DESCRIÇÃO', x: 80, y: 200, largura: 60 },
        { texto: 'LARGURA', x: 400, y: 200, largura: 50 },
        { texto: '10001', x: 35, y: 180, largura: 30 },
        { texto: 'TRICÔ HERA', x: 80, y: 180, largura: 60 },
        { texto: '1,40', x: 416, y: 180, largura: 19 },
        { texto: '10002', x: 35, y: 160, largura: 30 },
        { texto: 'LINHO PAPIRO', x: 80, y: 160, largura: 70 },
        { texto: '1,45', x: 416, y: 160, largura: 19 },
        { texto: '10003', x: 35, y: 140, largura: 30 },
        { texto: 'TRICÔ HÓRUS (PROMOCIONAL) (CORES FORA DE LINHA)', x: 80, y: 140, largura: 325 },
        { texto: '2,80', x: 418, y: 140, largura: 19 }
    ]);
    assert.strictEqual(linhas.length, 4);
    assert.strictEqual(linhas[0].length, 3); // continua em 3 colunas, LARGURA nao foi engolida
    assert.strictEqual(linhas[3][0], '10003');
    assert.strictEqual(linhas[3][1], 'TRICÔ HÓRUS (PROMOCIONAL) (CORES FORA DE LINHA)');
    assert.strictEqual(linhas[3][2], '2,80');
});
