'use strict';
// Nucleo do Resultado do mes: entradas/saidas por mes, grupos de despesa, imposto
// (lancado pela referencia ou estimado), meta, despesas fixas, margem, ponto de
// equilibrio e orcamento. So funcoes puras — sem DOM, sem db, sem localStorage.
(function (raiz) {

    function arredondar(v) {
        const n = Number(v) || 0;
        return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
    }

    function mesmoId(a, b) {
        return a != null && b != null && String(a) === String(b);
    }

    const mesDe = data => (data ? String(data).slice(0, 7) : '');
    const num = v => (v === '' || v == null ? 0 : Number(v) || 0);

    // Soma n meses a 'YYYY-MM' (n pode ser negativo).
    function somarMeses(mes, n) {
        const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
        return Math.floor(total / 12) + '-' + String((total % 12) + 1).padStart(2, '0');
    }

    // Data no mes (e ate `ateData`, se informado).
    const noMes = (data, mes, ateData) => !!data && mesDe(data) === mes && (!ateData || String(data) <= ateData);

    const GRUPOS = [
        { id: 'fornecedores', rotulo: 'Fornecedores e materiais', categorias: ['tecido'] },
        { id: 'servicos', rotulo: 'Costureira e instalador', categorias: ['costureira', 'instalador'] },
        { id: 'comissoes', rotulo: 'Comissões', categorias: ['comissao', 'comissao_rt'] },
        { id: 'taxas', rotulo: 'Taxas de cartão', categorias: ['taxa_cartao'] },
        { id: 'fixas', rotulo: 'Despesas fixas', categorias: ['aluguel', 'salario', 'conta'] },
        { id: 'imposto', rotulo: 'Imposto', categorias: ['imposto'] },
        { id: 'outros', rotulo: 'Outros', categorias: ['outro'] }
    ];

    function grupoDaCategoria(categoria) {
        const g = GRUPOS.find(x => x.categorias.includes(categoria));
        return g ? g.id : 'outros';
    }

    function gruposZerados() {
        const o = {};
        GRUPOS.forEach(g => { o[g.id] = 0; });
        return o;
    }

    // Caixa (repasses de cartao): no navegador vem de window.CaixaCore; no node, do require.
    function caixa() {
        if (raiz && raiz.CaixaCore) return raiz.CaixaCore;
        if (typeof require === 'function') { try { return require('./caixa-core.js'); } catch (e) { return null; } }
        return null;
    }

    // Recebimento sem movimento: pela data_pagamento, valor da parcela. Se foi no cartao (baixa sem conta ou
    // antes da abertura da conta), cada repasse na sua data (valor bruto), como os que tem movimento; a taxa
    // de cada repasse ja e uma conta paga naquela data. As datas sao as da baixa: os repasses guardados na
    // conta a receber (cartao.repasses); sem eles (dado antigo), as datas das contas de taxa dela
    // (origem_cr_id), que foram gravadas na baixa; so sem nada disso as datas sao refeitas pela maquininha de hoje.
    function partesSemMovimento(cr, contas, contasPagar) {
        const cx = cr.cartao && cr.cartao.tipo ? caixa() : null;
        if (!cx) return [{ data: cr.data_pagamento, valor: num(cr.valor) }];
        const guardados = Array.isArray(cr.cartao.repasses) ? cr.cartao.repasses.filter(r => r && r.data) : [];
        if (guardados.length) return guardados.map(r => ({ data: String(r.data), valor: num(r.bruto) }));
        const conta = (contas || []).find(c => c && mesmoId(c.id, cr.conta_id));
        const refeitos = cx.repassesCartao({ valor: num(cr.valor), data: String(cr.data_pagamento), conta, tipo: cr.cartao.tipo, vezes: cr.cartao.vezes, antecipar: !!cr.cartao.antecipar });
        const taxas = (contasPagar || []).filter(cp => cp && cp.categoria === 'taxa_cartao' && mesmoId(cp.origem_cr_id, cr.id) && cp.data_pagamento)
            .map(cp => String(cp.data_pagamento)).sort();
        // O bruto de cada repasse nao depende da maquininha; so as datas mudam com ela.
        if (taxas.length === refeitos.length) return refeitos.map((r, i) => ({ data: taxas[i], valor: r.bruto }));
        return refeitos.map(r => ({ data: r.data, valor: r.bruto }));
    }

    // Entradas: para cada CR paga, os movimentos de entrada origem 'cr' dela (cada um na sua data);
    // sem movimento, a propria parcela pela data_pagamento (no cartao, cada repasse na sua data).
    // Transferencias e CRs nao pagas nao contam. `dentro(data)` diz se a data entra (mes, mes ate hoje ou
    // periodo). `soSemMovimento`: so os recebimentos sem movimento (os que nao passaram por conta nenhuma).
    function itensEntrada(dentro, contasReceber, movimentos, contas, soSemMovimento, contasPagar) {
        const itens = [];
        const porCr = new Map();
        (movimentos || []).forEach(m => {
            if (!m || m.origem !== 'cr' || m.sentido === 'saida' || m.origem_id == null) return;
            const k = String(m.origem_id);
            if (!porCr.has(k)) porCr.set(k, []);
            porCr.get(k).push(m);
        });
        (contasReceber || []).filter(cr => cr && cr.status === 'Pago').forEach(cr => {
            const dela = cr.id == null ? null : porCr.get(String(cr.id));
            if (dela && dela.length) {
                if (!soSemMovimento) dela.forEach(m => { if (dentro(m.data)) itens.push({ data: m.data, valor: num(m.valor), cr_id: cr.id }); });
            } else if (cr.data_pagamento) {
                partesSemMovimento(cr, contas, contasPagar).forEach(p => { if (dentro(p.data)) itens.push({ data: p.data, valor: p.valor, cr_id: cr.id }); });
            }
        });
        return itens;
    }

    // Recebimentos sem movimento com data em [de, ate]: contam no Resultado e na Visao Geral, mas nao aparecem
    // no Extrato (nao passaram por conta nenhuma). `qtd` = quantas contas a receber, `valor` = soma no periodo.
    function recebimentosSemMovimento({ de, ate, contasReceber, movimentos, contas, contasPagar }) {
        if (!de || !ate || de > ate) return { qtd: 0, valor: 0 };
        const itens = itensEntrada(d => !!d && String(d) >= de && String(d) <= ate, contasReceber, movimentos, contas, true, contasPagar);
        return { qtd: new Set(itens.map(i => String(i.cr_id))).size, valor: arredondar(itens.reduce((s, i) => s + i.valor, 0)) };
    }

    function entradasDoMes({ mes, contasReceber, movimentos, ateData, contas, contasPagar }) {
        const itens = itensEntrada(d => noMes(d, mes, ateData), contasReceber, movimentos, contas, false, contasPagar);
        return { total: arredondar(itens.reduce((s, i) => s + i.valor, 0)), itens };
    }

    // Saidas de caixa: CPs pagas com data_pagamento aceita por `dentro`, exceto imposto (vem de impostoDoMes).
    function itensSaida(dentro, contasPagar) {
        const itens = [];
        (contasPagar || []).forEach(cp => {
            if (!cp || cp.status !== 'Pago' || cp.categoria === 'imposto') return;
            if (!dentro(cp.data_pagamento)) return;
            itens.push({ data: cp.data_pagamento, valor: num(cp.valor), grupo: grupoDaCategoria(cp.categoria), cp_id: cp.id });
        });
        return itens;
    }

    function somarPorGrupo(itens) {
        const porGrupo = gruposZerados();
        itens.forEach(i => { porGrupo[i.grupo] += i.valor; });
        let total = 0;
        Object.keys(porGrupo).forEach(g => { porGrupo[g] = arredondar(porGrupo[g]); total += porGrupo[g]; });
        return { total: arredondar(total), porGrupo };
    }

    function saidasDoMes({ mes, contasPagar, ateData }) {
        return somarPorGrupo(itensSaida(d => noMes(d, mes, ateData), contasPagar));
    }

    // Mes de referencia da guia; guia sem o campo usa o mes anterior ao vencimento (mesmo padrao do formulario).
    function referenciaGuia(cp) {
        if (cp.mes_referencia) return String(cp.mes_referencia);
        const venc = mesDe(cp.data_vencimento);
        return venc ? somarMeses(venc, -1) : '';
    }

    // Imposto pela referencia: guias do mes (pagas ou em aberto); sem guia, estimativa pela aliquota.
    function impostoDoMes({ mes, contasPagar, faturamento, aliquota }) {
        const guias = (contasPagar || []).filter(cp => cp && cp.categoria === 'imposto' && referenciaGuia(cp) === mes);
        if (guias.length) {
            const lancado = arredondar(guias.reduce((s, cp) => s + num(cp.valor), 0));
            return { valor: lancado, estimado: false, lancado };
        }
        const aliq = num(aliquota);
        if (!(aliq > 0)) return { valor: 0, estimado: true, lancado: 0, semAliquota: true };
        return { valor: Math.max(0, arredondar(num(faturamento) * aliq / 100)), estimado: true, lancado: 0 };
    }

    function resultadoDoMes({ mes, contasReceber, contasPagar, movimentos, aliquota, ateData, contas }) {
        const entradas = entradasDoMes({ mes, contasReceber, movimentos, ateData, contas, contasPagar }).total;
        const sai = saidasDoMes({ mes, contasPagar, ateData });
        const taxas = sai.porGrupo.taxas;
        const faturamento = arredondar(entradas - taxas);
        const imposto = impostoDoMes({ mes, contasPagar, faturamento, aliquota });
        const porGrupo = Object.assign({}, sai.porGrupo, { imposto: imposto.valor });
        const saidas = arredondar(sai.total + imposto.valor);
        return { entradas, taxas, faturamento, saidas, porGrupo, imposto, resultado: arredondar(entradas - saidas) };
    }

    const ultimoDia = mes => mes + '-' + String(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()).padStart(2, '0');

    // Periodo qualquer [de, ate] ('YYYY-MM-DD'), pelas mesmas regras do mes: entradas pela data em que o
    // dinheiro entra, saidas pagas no periodo. Imposto (pela referencia) so dos meses inteiros dentro do
    // periodo. Periodo so de meses inteiros: so a referencia (igual ao Resultado do mes). Periodo com algum
    // pedaco de mes: a guia PAGA cuja referencia nao e um mes inteiro do periodo conta pela data de pagamento
    // (se estiver no periodo); nunca conta duas vezes. Devolve tambem os itens (para graficos).
    // `imposto.cortaMes`: o periodo pega so um pedaco de algum mes (a tela avisa que o imposto e dos meses inteiros).
    function resultadoDoPeriodo({ de, ate, contasReceber, contasPagar, movimentos, aliquota, contas }) {
        const dentro = d => !!d && String(d) >= de && String(d) <= ate;
        const ok = !!de && !!ate && de <= ate;
        const itensE = ok ? itensEntrada(dentro, contasReceber, movimentos, contas, false, contasPagar) : [];
        const itensS = ok ? itensSaida(dentro, contasPagar) : [];
        const entradas = arredondar(itensE.reduce((s, i) => s + i.valor, 0));
        const sai = somarPorGrupo(itensS);
        const porMes = {};
        let impostoTotal = 0, estimado = false;
        if (ok) {
            for (let mes = mesDe(de); mes <= mesDe(ate); mes = somarMeses(mes, 1)) {
                if (de > mes + '-01' || ate < ultimoDia(mes)) continue;
                const imp = resultadoDoMes({ mes, contasReceber, contasPagar, movimentos, aliquota, contas }).imposto;
                porMes[mes] = imp.valor;
                impostoTotal += imp.valor;
                if (imp.estimado && imp.valor > 0) estimado = true;
            }
        }
        const pagas = [];
        const temPedaco = ok && (mesDe(de) + '-01' !== de || ultimoDia(mesDe(ate)) !== ate);
        (temPedaco ? (contasPagar || []) : []).forEach(cp => {
            if (!cp || cp.categoria !== 'imposto' || cp.status !== 'Pago' || !dentro(cp.data_pagamento)) return;
            if (Object.prototype.hasOwnProperty.call(porMes, referenciaGuia(cp))) return;        // ja contada pela referencia
            pagas.push({ data: cp.data_pagamento, valor: num(cp.valor), cp_id: cp.id });
            impostoTotal += num(cp.valor);
        });
        // Imposto de mes incompleto que ficou de fora (nem pela referencia, nem pela guia paga no periodo).
        let foraIncompleto = false;
        if (ok) {
            for (let mes = mesDe(de); mes <= mesDe(ate) && !foraIncompleto; mes = somarMeses(mes, 1)) {
                if (Object.prototype.hasOwnProperty.call(porMes, mes)) continue;
                const devido = resultadoDoMes({ mes, contasReceber, contasPagar, movimentos, aliquota, contas }).imposto.valor;
                const contado = pagas.reduce((s, i) => s + (referenciaGuia((contasPagar || []).find(cp => cp && mesmoId(cp.id, i.cp_id)) || {}) === mes ? i.valor : 0), 0);
                if (arredondar(devido - contado) > 0) foraIncompleto = true;
            }
        }
        const imposto = { valor: arredondar(impostoTotal), estimado, porMes, pagas, foraIncompleto, cortaMes: temPedaco };
        const taxas = sai.porGrupo.taxas;
        const porGrupo = Object.assign({}, sai.porGrupo, { imposto: imposto.valor });
        const saidas = arredondar(sai.total + imposto.valor);
        return { entradas, taxas, faturamento: arredondar(entradas - taxas), saidas, porGrupo, imposto, resultado: arredondar(entradas - saidas), itensEntrada: itensE, itensSaida: itensS };
    }

    // Previsto ate o fim do mes: resultado ate hoje + entradas previstas - saidas previstas (sem guias de
    // imposto, que contam pela referencia) com o imposto do mes refeito sobre o faturamento previsto
    // (faturamento ate hoje + entradas previstas - taxas previstas). Com guia de referencia no mes o imposto
    // e o da guia (ja no ate hoje); sem guia, aliquota x faturamento previsto.
    function previstoDoMes({ mes, ateHoje, entradasPrevistas, saidasPrevistas, taxasPrevistas, contasPagar, aliquota }) {
        const a = ateHoje || {};
        const faturamento = arredondar(num(a.faturamento) + num(entradasPrevistas) - num(taxasPrevistas));
        const imposto = impostoDoMes({ mes, contasPagar, faturamento, aliquota });
        const semImposto = num(a.resultado) + num(a.imposto && a.imposto.valor);
        return { valor: arredondar(semImposto + num(entradasPrevistas) - num(saidasPrevistas) - imposto.valor), faturamento, imposto };
    }

    // O que ja foi baixado e ainda vai cair no mes (data depois de hoje ate o fim do mes), pelas mesmas regras do
    // Resultado do mes: entradas (cartao a cair), saidas sem imposto (inclui a taxa desses repasses) e as taxas.
    // Transferencias entre contas nao entram (nem como entrada, nem como saida). Como no Hoje e na previsao,
    // movimentos depois de hoje de conta desativada (ativo === false) nao contam: a entrada vale zero (a conta a
    // receber continua com movimento, nao volta para as datas de repasse) e a conta a pagar paga por esse
    // movimento (a taxa do repasse) sai da conta.
    function aCairNoMes({ mes, hoje, contasReceber, contasPagar, movimentos, contas }) {
        const inativa = id => (contas || []).some(c => c && mesmoId(c.id, id) && c.ativo === false);
        const fora = new Set((movimentos || []).filter(m => m && String(m.data) > hoje && inativa(m.conta_id)));
        const movs = fora.size ? (movimentos || []).map(m => (fora.has(m) ? Object.assign({}, m, { valor: 0 }) : m)) : movimentos;
        const cpsFora = new Set([...fora].filter(m => m.origem === 'cp' && m.origem_id != null).map(m => String(m.origem_id)));
        const cps = cpsFora.size ? (contasPagar || []).filter(cp => !(cp && cpsFora.has(String(cp.id)) && String(cp.data_pagamento) > hoje)) : contasPagar;
        const base = { mes, contasReceber, contasPagar: cps, movimentos: movs, contas, aliquota: 0 };
        const todo = resultadoDoMes(base), ate = resultadoDoMes(Object.assign({}, base, { ateData: hoje }));
        const semImposto = r => r.saidas - r.imposto.valor;
        return {
            entradas: arredondar(todo.entradas - ate.entradas),
            saidas: arredondar(semImposto(todo) - semImposto(ate)),
            taxas: arredondar(todo.taxas - ate.taxas)
        };
    }

    // Ajuste do mes (> 0) vence; senao o padrao; senao 0.
    function metaDoMes(mes, { padrao, ajustes } = {}) {
        const ajuste = num(ajustes && ajustes[mes]);
        if (ajuste > 0) return ajuste;
        const p = num(padrao);
        return p > 0 ? p : 0;
    }

    // DF antiga sem data_inicio vale a partir do mes do cadastro: o id e o Date.now() do cadastro.
    // Id que nao parece um horario (entre 2000 e 2100) nao diz nada: continua valendo sempre.
    function inicioDf(df) {
        if (df.data_inicio) return String(df.data_inicio);
        const id = Number(df.id);
        if (!Number.isFinite(id) || id < 946684800000 || id > 4102444800000) return '';
        const d = new Date(id);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    }

    // Dia de vencimento de uma DF no mes (ajustado ao fim do mes), ou null se fora de data_inicio/data_fim.
    function vencimentoDfNoMes(df, mes) {
        const ano = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
        const dia = Math.max(1, Math.floor(Number(df.dia_vencimento) || 1));
        const ultimo = new Date(ano, m, 0).getDate();
        const data = mes + '-' + String(Math.min(dia, ultimo)).padStart(2, '0');
        const inicio = inicioDf(df);
        if (inicio && data < inicio) return null;
        if (df.data_fim && data > df.data_fim) return null;
        return data;
    }

    // Despesas fixas do mes (por vencimento): CPs tipo 'fixo' ou do grupo Despesas fixas (aluguel, salario,
    // conta, mesmo lancadas avulsas) vencendo no mes (pagas ou nao), cada CP uma vez + DFs antigas (sem periodicidade), ativas, ainda nao geradas naquele mes.
    // A DF conta uma vez so: nao soma se no mes ha CP gerada dela (tipo 'fixo' com a mesma descricao, ou ligada pelo
    // despesa_fixa_id) ou uma CP ja contada aqui com a mesma descricao e o mesmo valor (a mesma despesa lancada a mao).
    // Cada CP cobre no maximo uma DF (duas DFs iguais e uma CP: so uma DF sai); a ligacao pelo id vale primeiro.
    // Guia de imposto lancada como fixa fica de fora: o imposto ja entra na margem (custo variavel).
    function despesasFixasDoMes({ mes, contasPagar, despesasFixas }) {
        let total = 0;
        contasFixasDoMes(mes, contasPagar).forEach(cp => { total += num(cp.valor); });
        const dfs = (despesasFixas || []).filter(df => df && !df.periodicidade && df.ativo !== false && df.categoria !== 'imposto' && vencimentoDfNoMes(df, mes));
        const cobertas = fixasCobertasNoMes({ mes, contasPagar, fixas: dfs });
        dfs.forEach(df => { if (!cobertas.has(df)) total += num(df.valor); });
        return arredondar(total);
    }

    // CPs do grupo Despesas fixas (tipo 'fixo' ou categoria do grupo, fora o Imposto) vencendo no mes.
    function contasFixasDoMes(mes, contasPagar) {
        return (contasPagar || []).filter(cp => cp && mesDe(cp.data_vencimento) === mes
            && cp.categoria !== 'imposto' && (cp.tipo === 'fixo' || grupoDaCategoria(cp.categoria) === 'fixas'));
    }

    // Quais DFs antigas do mes (`fixas`, as que vencem nele) ja tem conta a pagar no mes (paga ou nao), para nao
    // contar duas vezes. Regra unica do Resultado e da previsao do caixa (Hoje e projecao da Visao Geral):
    // primeiro a ligacao (despesa_fixa_id); depois CP 'fixo' com a mesma descricao, ou CP do grupo Despesas fixas
    // com a mesma descricao e o mesmo valor em centavos (a mesma despesa lancada a mao).
    // Cada CP cobre no maximo uma DF (duas DFs iguais e uma CP: so uma sai). Devolve o Set das DFs cobertas.
    function fixasCobertasNoMes({ mes, contasPagar, fixas }) {
        const doMes = (contasPagar || []).filter(cp => cp && mesDe(cp.data_vencimento) === mes);
        const contadas = contasFixasDoMes(mes, contasPagar);
        const texto = v => String(v == null ? '' : v).trim().toLowerCase();
        const cent = v => Math.round(num(v) * 100);
        const dfs = (fixas || []).filter(Boolean);
        const usadas = new Set();
        const cobrir = (df, casa) => {
            const cp = doMes.find(x => !usadas.has(x) && casa(x, df));
            if (cp) usadas.add(cp);
            return !!cp;
        };
        const pelaLigacao = (cp, df) => mesmoId(cp.despesa_fixa_id, df.id);
        const pelaDescricao = (cp, df) => ((cp.tipo === 'fixo' && cp.descricao === df.descricao)
            || (contadas.includes(cp) && texto(cp.descricao) === texto(df.descricao) && cent(cp.valor) === cent(df.valor)));
        const cobertas = new Set(dfs.filter(df => cobrir(df, pelaLigacao)));
        dfs.forEach(df => { if (!cobertas.has(df) && cobrir(df, pelaDescricao)) cobertas.add(df); });
        return cobertas;
    }

    // Margem de contribuicao em % (0-100), PONDERADA: soma das contribuicoes / soma do faturamento.
    // Historico: 3 meses fechados mais recentes com faturamento > 0, ate 12 para tras.
    // Sem historico: pedidos, soma(receita - custos) / soma(receita), menos a aliquota.
    function margemContribuicao({ mesAtual, dadosPorMes, pedidosFallback, aliquota }) {
        const meses = [];
        let somaContrib = 0, somaFat = 0;
        for (let i = 1; i <= 12 && meses.length < 3; i++) {
            const mes = somarMeses(mesAtual, -i);
            const r = dadosPorMes(mes) || {};
            const fat = num(r.faturamento);
            if (!(fat > 0)) continue;
            const g = r.porGrupo || {};
            const imposto = num(r.imposto && r.imposto.valor);
            somaContrib += fat - num(g.fornecedores) - num(g.servicos) - num(g.comissoes) - imposto;
            somaFat += fat;
            meses.push(mes);
        }
        if (meses.length) return { pct: arredondar(somaContrib / somaFat * 100), base: 'historico', meses };
        const pedidos = (pedidosFallback || []).filter(p => p && num(p.receita) > 0);
        if (pedidos.length) {
            let contrib = 0, receita = 0;
            pedidos.forEach(p => {
                contrib += num(p.receita) - num(p.custo_material) - num(p.custos_vinculados) - num(p.comissoes);
                receita += num(p.receita);
            });
            return { pct: arredondar(contrib / receita * 100 - num(aliquota)), base: 'pedidos', meses: [] };
        }
        return { pct: null, base: null, meses: [] };
    }

    // Guarda o ultimo resultado por chave: com a mesma chave (mesmos dados) nao recalcula.
    function criarMemo() {
        let chave = null, valor;
        return function (k, calcular) {
            if (chave !== null && k === chave) return valor;
            valor = calcular();
            chave = k;
            return valor;
        };
    }

    function pontoEquilibrio(despesasFixas, margemPct) {
        if (!(num(despesasFixas) > 0)) return { valor: null, motivo: 'sem_fixas' };
        if (margemPct == null || margemPct === '' || !Number.isFinite(Number(margemPct))) return { valor: null, motivo: 'sem_margem' };
        const pct = Number(margemPct);
        if (pct <= 0) return { valor: null, motivo: 'margem_negativa' };
        return { valor: arredondar(num(despesasFixas) / (pct / 100)) };
    }

    // Orcamento por grupo (ordem de GRUPOS); so grupos com limite > 0. perto >= 80%, estourou > 100%.
    // Faixa e pct calculados em centavos inteiros para nao errar a fronteira por ponto flutuante.
    function statusOrcamento({ limites, gastos } = {}) {
        const out = [];
        GRUPOS.forEach(g => {
            const limite = arredondar(num(limites && limites[g.id]));
            if (!(limite > 0)) return;
            const gasto = arredondar(num(gastos && gastos[g.id]));
            const gc = Math.round(gasto * 100), lc = Math.round(limite * 100);
            const faixa = gc > lc ? 'estourou' : (gc * 5 >= lc * 4 ? 'perto' : 'ok');
            // pct em 2 casas sem cruzar a fronteira da faixa: abaixo do limite trunca, acima arredonda para cima.
            const pct = (gc > lc ? Math.ceil(gc * 10000 / lc) : Math.floor(gc * 10000 / lc)) / 100;
            out.push({ grupo: g.id, rotulo: g.rotulo, limite, gasto, falta: arredondar((lc - gc) / 100), pct, faixa });
        });
        return out;
    }

    const api = { GRUPOS, grupoDaCategoria, entradasDoMes, saidasDoMes, impostoDoMes, resultadoDoMes, resultadoDoPeriodo, metaDoMes, despesasFixasDoMes, inicioDf, fixasCobertasNoMes, margemContribuicao, pontoEquilibrio, statusOrcamento, previstoDoMes, somarMeses, referenciaGuia, aCairNoMes, criarMemo, recebimentosSemMovimento, itensEntrada };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.ResultadoCore = api;

})(typeof window !== 'undefined' ? window : null);
