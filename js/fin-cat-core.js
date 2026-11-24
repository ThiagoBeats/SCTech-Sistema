'use strict';
// Nucleo das categorias da DRE: categorias padrao, plano de migracao v4,
// regras de lancamento (competencia, parcelas, duplicidade, situacao, cancelar/excluir).
// So funcoes puras — sem DOM, sem db, sem rede.
(function (raiz) {

    const GRUPOS = [
        { id: 'receitas', ordem: 1, rotulo: 'Receitas operacionais' },
        { id: 'custos', ordem: 2, rotulo: 'Custos operacionais' },
        { id: 'despesas', ordem: 4, rotulo: 'Despesas operacionais' },
        { id: 'investimento', ordem: 6, rotulo: 'Atividades de investimento' },
        { id: 'financiamento', ordem: 7, rotulo: 'Atividades de financiamento' }
    ];

    function categoriasPadrao() {
        const sub = (id, nome) => ({ id, nome, grupo: 'despesas' });
        const cat = (id, nome, grupo, subgrupo_id, tipo, natureza) =>
            ({ id, nome, grupo, subgrupo_id, tipo, natureza: natureza || 'dre', padrao: true, ativo: true });
        return {
            subgrupos: [
                sub('sub_var', 'Despesas variáveis'),
                sub('sub_fix', 'Despesas fixas'),
                sub('sub_out', 'Outras despesas')
            ],
            categorias: [
                cat('cat_vendas', 'Vendas de pedidos', 'receitas', null, 'entrada'),
                cat('cat_outras_rec', 'Outras receitas operacionais', 'receitas', null, 'entrada'),
                cat('cat_tecido', 'Tecido / Material', 'custos', null, 'saida'),
                cat('cat_costureira', 'Costureira', 'custos', null, 'saida'),
                cat('cat_instalador', 'Instalador', 'custos', null, 'saida'),
                cat('cat_comissoes', 'Comissões', 'despesas', 'sub_var', 'saida'),
                cat('cat_taxa_cartao', 'Taxas de cartão', 'despesas', 'sub_var', 'saida'),
                cat('cat_impostos', 'Impostos sobre vendas', 'despesas', 'sub_var', 'saida'),
                cat('cat_aluguel', 'Aluguel', 'despesas', 'sub_fix', 'saida'),
                cat('cat_salarios', 'Salários', 'despesas', 'sub_fix', 'saida'),
                cat('cat_contas', 'Contas (luz, internet…)', 'despesas', 'sub_fix', 'saida'),
                cat('cat_outras_desp', 'Outras despesas', 'despesas', 'sub_out', 'saida'),
                cat('cat_equip', 'Compra de equipamentos e veículos', 'investimento', null, 'saida'),
                cat('cat_juros', 'Juros e encargos', 'financiamento', null, 'saida'),
                cat('cat_rendimentos', 'Rendimentos financeiros', 'financiamento', null, 'entrada'),
                cat('cat_aporte', 'Aporte de capital', null, null, 'entrada', 'so_caixa'),
                cat('cat_emprestimo_in', 'Empréstimo recebido', null, null, 'entrada', 'so_caixa'),
                cat('cat_emprestimo_out', 'Pagamento de empréstimo (principal)', null, null, 'saida', 'so_caixa')
            ]
        };
    }

    const MAPA_LEGADO = {
        tecido: 'cat_tecido', costureira: 'cat_costureira', instalador: 'cat_instalador',
        comissao: 'cat_comissoes', comissao_rt: 'cat_comissoes', taxa_cartao: 'cat_taxa_cartao',
        imposto: 'cat_impostos', aluguel: 'cat_aluguel', salario: 'cat_salarios',
        conta: 'cat_contas', outro: 'cat_outras_desp'
    };

    const ROTULO_SITUACAO = {
        aberto: 'Em aberto', vencido: 'Vencido',
        pago: { pagar: 'Pago', receber: 'Recebido' },
        cancelado: 'Cancelado'
    };

    // ---- utilitarios ----
    const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
    const digitos = s => String(s == null ? '' : s).replace(/\D/g, '');
    const temVal = v => v !== undefined && v !== null && v !== '';
    const dataOk = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d);
    const dia10 = d => String(d).slice(0, 10);
    const paraUTC = iso => { const [a, m, d] = dia10(iso).split('-').map(Number); return Date.UTC(a, m - 1, d); };
    const pad = n => String(n).padStart(2, '0');

    function categoriaDoLegado(reg, tipo) {
        reg = reg || {};
        if (tipo === 'receber') return reg.pedido_id ? 'cat_vendas' : 'cat_outras_rec';
        return MAPA_LEGADO[reg.categoria] || 'cat_outras_desp';
    }

    // Indice de nomes (sem acento/caixa) -> ids; acharPorNome devolve {id} | {ambiguo:true} | null.
    function indiceNomes(lista) {
        const mapa = new Map();
        (lista || []).forEach(p => {
            const k = norm(p.nome);
            if (!k) return;
            if (!mapa.has(k)) mapa.set(k, []);
            mapa.get(k).push(p.id);
        });
        return mapa;
    }
    function acharPorNome(mapa, nome) {
        const ids = mapa.get(norm(nome));
        if (!ids) return null;
        return ids.length === 1 ? { id: ids[0] } : { ambiguo: true };
    }

    function planoMigracaoV4(entrada) {
        const e = entrada || {};
        const crs = e.contas_receber || [];
        const cps = e.contas_pagar || [];
        const dfs = e.despesas_fixas || [];
        const pedidos = e.pedidos || [];
        const clientes = e.clientes || [];
        const fornecedores = e.fornecedores || [];
        const agoraISO = e.agoraISO || new Date().toISOString();
        const avisos = [];
        const avisados = new Set();
        const avisar = msg => { if (!avisados.has(msg)) { avisados.add(msg); avisos.push(msg); } };

        // menor vencimento das CR de cada pedido
        const menorVenc = new Map();
        crs.forEach(c => {
            if (!c || !c.pedido_id || !dataOk(c.data_vencimento)) return;
            const v = dia10(c.data_vencimento);
            const k = String(c.pedido_id);
            if (!menorVenc.has(k) || v < menorVenc.get(k)) menorVenc.set(k, v);
        });
        const pedidoPorId = new Map(pedidos.map(p => [String(p.id), p]));
        const clientePorId = new Set(clientes.map(c => String(c.id)));
        const cliNomes = indiceNomes(clientes);
        const forNomes = indiceNomes(fornecedores);
        const forCnpj = new Map();
        fornecedores.forEach(f => {
            const d = digitos(f.cnpj);
            if (!d) return;
            if (!forCnpj.has(d)) forCnpj.set(d, []);
            forCnpj.get(d).push(f.id);
        });

        const historicoInicial = () => [{ em: agoraISO, por: null, porNome: 'Sistema', acao: 'criado', detalhe: 'Migrado do financeiro anterior' }];

        const out = { cr: [], cp: [], df: [], pedidos: [], avisos };

        crs.forEach(c => {
            if (!c) return;
            if (temVal(c.categoria_id) && temVal(c.data_competencia)) return;
            const set = {};
            if (!temVal(c.categoria_id)) set.categoria_id = categoriaDoLegado(c, 'receber');
            if (!temVal(c.data_competencia)) {
                const comp = c.pedido_id && menorVenc.get(String(c.pedido_id))
                    ? menorVenc.get(String(c.pedido_id))
                    : (dataOk(c.data_vencimento) ? dia10(c.data_vencimento) : null);
                if (comp) set.data_competencia = comp;
            }
            if (!temVal(c.cliente_id)) {
                const ped = c.pedido_id ? pedidoPorId.get(String(c.pedido_id)) : null;
                if (ped && temVal(ped.clienteId) && clientePorId.has(String(ped.clienteId))) {
                    set.cliente_id = ped.clienteId;
                } else {
                    const nome = c.cliente_nome || (ped && ped.clienteNome);
                    const r = nome ? acharPorNome(cliNomes, nome) : null;
                    if (r && r.id !== undefined) set.cliente_id = r.id;
                    else if (r && r.ambiguo) avisar('Cliente "' + nome + '" aparece mais de uma vez no cadastro; o vínculo não foi feito.');
                }
            }
            if (!Array.isArray(c.historico)) set.historico = historicoInicial();
            out.cr.push({ id: c.id, set });
        });

        cps.forEach(c => {
            if (!c) return;
            if (temVal(c.categoria_id) && temVal(c.data_competencia)) return;
            const set = {};
            if (!temVal(c.categoria_id)) set.categoria_id = categoriaDoLegado(c, 'pagar');
            if (!temVal(c.data_competencia)) {
                let comp = null;
                if (typeof c.mes_referencia === 'string' && /^\d{4}-\d{2}$/.test(c.mes_referencia)) comp = c.mes_referencia + '-01';
                else if (dataOk(c.data_vencimento)) comp = dia10(c.data_vencimento);
                if (comp) set.data_competencia = comp;
            }
            if (!temVal(c.fornecedor_id)) {
                const d = digitos(c.cnpj_fornecedor);
                const porCnpj = d ? forCnpj.get(d) : null;
                if (porCnpj && porCnpj.length) set.fornecedor_id = porCnpj[0];
                else {
                    const r = c.credor_nome ? acharPorNome(forNomes, c.credor_nome) : null;
                    if (r && r.id !== undefined) set.fornecedor_id = r.id;
                    else if (r && r.ambiguo) avisar('Fornecedor "' + c.credor_nome + '" aparece mais de uma vez no cadastro; o vínculo não foi feito.');
                }
            }
            if (!Array.isArray(c.historico)) set.historico = historicoInicial();
            out.cp.push({ id: c.id, set });
        });

        dfs.forEach(d => {
            if (!d || temVal(d.categoria_id)) return;
            out.df.push({ id: d.id, set: { categoria_id: MAPA_LEGADO[d.categoria] || 'cat_outras_desp' } });
        });

        pedidos.forEach(p => {
            if (!p || !p.financeiro_gerado || temVal(p.data_aprovacao)) return;
            const m = menorVenc.get(String(p.id));
            if (m) out.pedidos.push({ id: p.id, set: { data_aprovacao: m } });
        });

        return out;
    }

    function competenciaPadrao(o) {
        o = o || {};
        const mes = m => (typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)) ? m + '-01' : (dataOk(m) ? dia10(m) : null);
        let r = null;
        if (o.origem === 'pedido') r = dataOk(o.dataAprovacao) ? dia10(o.dataAprovacao) : null;
        else if (o.origem === 'compra') r = dataOk(o.dataCompra) ? dia10(o.dataCompra) : null;
        else if (o.origem === 'recorrencia') r = mes(o.mesOcorrencia);
        else if (o.origem === 'imposto') r = mes(o.mesReferencia);
        return r || (dataOk(o.vencimento) ? dia10(o.vencimento) : null);
    }

    function dividirParcelas(valor, n, primeiroVenc) {
        n = Math.max(1, parseInt(n, 10) || 1);
        const cents = Math.round(Number(valor) * 100);
        const base = Math.floor(cents / n);
        const [a, m, d] = dia10(primeiroVenc).split('-').map(Number);
        const out = [];
        for (let i = 0; i < n; i++) {
            const idx = (m - 1) + i;
            const ano = a + Math.floor(idx / 12), mes = idx % 12;
            const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
            const v = i === n - 1 ? cents - base * (n - 1) : base;
            out.push({ parcela: i + 1, valor: v / 100, vencimento: ano + '-' + pad(mes + 1) + '-' + pad(Math.min(d, ultimo)) });
        }
        return out;
    }

    function acharParecido(novo, lista) {
        novo = novo || {};
        const cents = Math.round(Number(novo.valor) * 100);
        const nomeN = norm(novo.pessoaNome);
        return (lista || []).find(r => {
            if (!r || r.status === 'Cancelado') return false;
            if (temVal(novo.id) && r.id === novo.id) return false;
            if (Math.round(Number(r.valor) * 100) !== cents) return false;
            const rid = r.cliente_id !== undefined ? r.cliente_id : r.fornecedor_id;
            const rnome = r.cliente_nome || r.credor_nome || r.pessoaNome;
            const mesmaPessoa = (temVal(novo.pessoaId) && temVal(rid) && String(rid) === String(novo.pessoaId))
                || (nomeN && norm(rnome) === nomeN);
            if (!mesmaPessoa) return false;
            if (!dataOk(r.data_vencimento) || !dataOk(novo.vencimento)) return false;
            return Math.abs(paraUTC(r.data_vencimento) - paraUTC(novo.vencimento)) <= 3 * 86400000;
        }) || null;
    }

    function situacao(reg, hojeISO) {
        reg = reg || {};
        if (reg.status === 'Cancelado') return 'cancelado';
        if (reg.status === 'Pago' || reg.data_pagamento) return 'pago';
        if (dataOk(reg.data_vencimento) && dataOk(hojeISO) && dia10(reg.data_vencimento) < dia10(hojeISO)) return 'vencido';
        return 'aberto';
    }

    const ehPago = reg => !!reg && (reg.status === 'Pago' || !!reg.data_pagamento);

    function podeCancelar(reg) {
        if (ehPago(reg)) return { ok: false, motivo: 'Estorne a baixa antes de cancelar.' };
        if (reg && reg.status === 'Cancelado') return { ok: false, motivo: 'Este lançamento já está cancelado.' };
        return { ok: true, motivo: '' };
    }

    function podeExcluir(reg) {
        reg = reg || {};
        if (ehPago(reg)) return { ok: false, motivo: 'Estorne a baixa antes de excluir.' };
        if (reg.pedido_id || reg.pedido_compra_id || reg.papel_comissao || reg.lancamento_pai_id || reg.origem_cr_id) {
            return { ok: false, motivo: 'Este lançamento foi gerado automaticamente; cancele em vez de excluir.' };
        }
        return { ok: true, motivo: '' };
    }

    function registrarHistorico(reg, d) {
        d = d || {};
        if (!Array.isArray(reg.historico)) reg.historico = [];
        reg.historico.push({
            em: d.em || new Date().toISOString(),
            por: d.por === undefined ? null : d.por,
            porNome: d.porNome || null,
            acao: d.acao,
            detalhe: d.detalhe || ''
        });
        return reg;
    }

    const api = { GRUPOS, MAPA_LEGADO, ROTULO_SITUACAO, categoriasPadrao, categoriaDoLegado, planoMigracaoV4,
        competenciaPadrao, dividirParcelas, acharParecido, situacao, podeCancelar, podeExcluir, registrarHistorico };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.FinCatCore = api;

})(typeof window !== 'undefined' ? window : null);
