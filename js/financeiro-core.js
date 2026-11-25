'use strict';
// Nucleo do financeiro: parcelas, custo do pedido, resultado e comissoes.
// So funcoes puras — sem DOM, sem db, sem localStorage — para rodar em `node --test`.
(function (raiz) {

    // Mesmo mapa de CAMPOS_COMISSAO do app.js: campos do pedido por papel.
    const CAMPOS_COMISSAO = {
        vendedor:  { id: 'vendedor_id', nome: 'vendedor_nome', pct: 'comissao_pct',     valor: 'comissao_valor',     paga: 'comissao_paga',     data: 'comissao_data_pgto' },
        arquiteto: { id: 'arq_id',      nome: 'arq_nome',      pct: 'arq_comissao_pct', valor: 'arq_comissao_valor', paga: 'arq_comissao_paga', data: 'arq_comissao_data_pgto' },
    };

    function arredondar(v) {
        const n = Number(v) || 0;
        return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
    }

    // Soma dias a uma data ISO sem problema de fuso (meio-dia).
    function somarDias(dataISO, dias) {
        const d = new Date(dataISO + 'T12:00:00');
        d.setDate(d.getDate() + dias);
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    // Mesmo dia n meses depois; dia que nao existe no mes vira o ultimo dia dele (31/01 + 1 = 28/02).
    // Regra das parcelas do A Pagar e do simulador (sempre a partir da data base, sem acumular o ajuste).
    function somarMesesData(dataISO, n) {
        const a = Number(String(dataISO).slice(0, 4)), m = Number(String(dataISO).slice(5, 7)) - 1 + (Number(n) || 0), d = Number(String(dataISO).slice(8, 10));
        const base = new Date(a, m, 1);
        const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        const p = x => String(x).padStart(2, '0');
        return base.getFullYear() + '-' + p(base.getMonth() + 1) + '-' + p(Math.min(d, ultimo));
    }

    function entradaPctDoNome(nome) {
        const n = String(nome || '');
        const m = n.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de\s+)?entrada/i);
        if (m) return parseFloat(m[1].replace(',', '.'));
        const m2 = n.match(/entrada\s*(?:de\s*)?\(?\s*(\d+(?:[.,]\d+)?)\s*%/i);
        if (m2) return parseFloat(m2[1].replace(',', '.'));
        const semAcento = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        if (semAcento.includes('vista')) return 100;
        return 50;
    }

    function planejarParcelas({ valor, entradaPct, jaPago = 0, dataAprovacao, dataEntrega }) {
        const dataSaldo = dataEntrega || somarDias(dataAprovacao, 30);
        if (entradaPct >= 100) {
            const v = arredondar(valor - jaPago);
            return v > 0 ? [{ tipo: 'unica', valor: v, data_vencimento: dataAprovacao }] : [];
        }
        const entrada = arredondar(valor * entradaPct / 100);
        const entradaRestante = Math.max(0, arredondar(entrada - jaPago));
        const saldo = arredondar(valor - jaPago - entradaRestante);
        const out = [];
        if (entradaRestante > 0) out.push({ tipo: 'entrada', valor: entradaRestante, data_vencimento: dataAprovacao });
        if (saldo > 0) out.push({ tipo: 'saldo', valor: saldo, data_vencimento: dataSaldo });
        return out;
    }

    function _doPedido(lista, pedidoId) {
        return (lista || []).filter(c => c.pedido_id == pedidoId);
    }
    const _naoCancelado = c => c && c.status !== 'Cancelado';

    function totalRecebido(contasReceber, pedidoId) {
        return arredondar(_doPedido(contasReceber, pedidoId).filter(c => c.status === 'Pago').reduce((s, c) => s + (Number(c.valor) || 0), 0));
    }

    function saldoEmAberto(contasReceber, pedidoId) {
        return arredondar(_doPedido(contasReceber, pedidoId).filter(c => c.status !== 'Pago' && _naoCancelado(c)).reduce((s, c) => s + (Number(c.valor) || 0), 0));
    }

    // Tecidos do pedido em qualquer formato: o atual (ambiente.tecidos[]) e os
    // antigos (tecidoId/consumo_linear no ambiente ou no proprio pedido). Linha
    // sem tecido escolhido e sem consumo nao e item de custo.
    function tecidosDoPedido(ped) {
        const ambs = (ped.ambientes && ped.ambientes.length) ? ped.ambientes : (ped.tecidoId != null ? [ped] : []);
        const out = [];
        ambs.forEach(a => {
            const lista = (a.tecidos && a.tecidos.length) ? a.tecidos : (a.tecidoId != null ? [a] : []);
            lista.forEach(t => {
                if ((t.tecidoId == null || t.tecidoId === '') && !(Number(t.consumo_linear) > 0)) return;
                out.push(t);
            });
        });
        return out;
    }

    function custoSnapshotPedido(ped, { catalogo, materiais, kits } = {}) {
        const itens = [];
        let total = 0, faltando = 0;
        const achar = (lista, id) => (lista || []).find(x => x.id == id);
        const add = (origem, ref_id, nome, quantidade, unit) => {
            const q = Number(quantidade) || 0;
            const ok = Number(unit) > 0;
            const custo_total = ok ? arredondar(unit * q) : null;
            if (ok) total += custo_total; else faltando++;
            itens.push({ origem, ref_id, nome, quantidade: q, custo_unit: ok ? Number(unit) : null, custo_total });
        };
        tecidosDoPedido(ped).forEach(t => {
            const c = achar(catalogo, t.tecidoId);
            add('tecido', t.tecidoId, c ? c.nome : (t.nome || t.tecidoNome || ''), t.consumo_linear, c && c.preco_custo);
        });
        (ped.itens || []).forEach(i => {
            if (i.kitId != null) {
                const k = achar(kits, i.kitId);
                add('kit', i.kitId, k ? k.nome : (i.nome || ''), i.quantidade, k && k.preco_custo);
            } else if (i.materialId != null) {
                const m = achar(materiais, i.materialId);
                add('material', i.materialId, m ? m.nome : (i.nome || ''), i.quantidade, m && m.preco_custo);
            }
        });
        return { total: arredondar(total), itens, faltando };
    }

    function resultadoPedido(ped, contasPagar, cadastros) {
        const receita = Number(ped.valor) || 0;
        let custo_material, origem_custo, itens_sem_custo = 0;
        if (ped.custo_snapshot && ped.custo_snapshot.total != null) {
            custo_material = Number(ped.custo_snapshot.total) || 0;
            origem_custo = 'snapshot';
            itens_sem_custo = ped.custo_snapshot.faltando || 0;
        } else if (ped.tipo_precificacao === 'pedido' && ped.custo_mat != null) {
            custo_material = (Number(ped.custo_mat) || 0) + (Number(ped.custo_acess) || 0);
            origem_custo = 'pedido';
        } else {
            const s = custoSnapshotPedido(ped, cadastros || {});
            custo_material = s.total;
            origem_custo = 'estimado';
            itens_sem_custo = s.faltando;
        }
        const cps = _doPedido(contasPagar, ped.id).filter(_naoCancelado);
        const soma = l => l.reduce((s, c) => s + (Number(c.valor) || 0), 0);
        const ehComissao = c => c.categoria === 'comissao' || c.categoria === 'comissao_rt';
        // Comissao do pedido (pendente/paga) soma com a que ainda for conta a pagar (paga antes da mudanca).
        const comissoes = arredondar(soma(cps.filter(ehComissao)) + comissoesContaveis(ped, contasPagar).reduce((s, c) => s + c.valor, 0));
        const custos_vinculados = arredondar(soma(cps.filter(c => !ehComissao(c) && c.categoria !== 'tecido')));
        const lucro = arredondar(receita - custo_material - custos_vinculados - comissoes);
        const margem_pct = receita > 0 ? Math.round(lucro / receita * 1000) / 10 : 0;
        return { receita, custo_material: arredondar(custo_material), origem_custo, custos_vinculados, comissoes, lucro, margem_pct, itens_sem_custo };
    }

    function contasComissaoDoPedido(ped, { vendedores, contasPagar, data, rotuloPedido }) {
        const novas = [];
        Object.keys(CAMPOS_COMISSAO).forEach(papel => {
            const c = CAMPOS_COMISSAO[papel];
            const id = ped[c.id];
            const valor = Number(ped[c.valor]) || 0;
            if (!id || !(valor > 0)) return;
            // A antiga 'comissao_rt' (sem papel) era a comissao do arquiteto.
            const existe = (contasPagar || []).some(cp => cp.pedido_id == ped.id && (cp.papel_comissao === papel
                || (papel === 'arquiteto' && !cp.papel_comissao && cp.categoria === 'comissao_rt')));
            if (existe) return;
            const v = (vendedores || []).find(x => x.id == id);
            const nome = (v && v.nome) || ped[c.nome] || '';
            novas.push({
                descricao: `Comissão ${ped[c.pct] || 0}% — ${nome} — Ped. ${rotuloPedido}`,
                valor: arredondar(valor),
                categoria: 'comissao',
                tipo: 'variavel',
                status: 'Pendente',
                data_vencimento: data,
                data_pagamento: null,
                credor_nome: nome,
                vendedor_id: id,
                pedido_id: ped.id,
                papel_comissao: papel
            });
        });
        return novas;
    }

    function parcelasCompra({ valor, modo, hoje, vencimento, numParcelas, intervaloDias }) {
        if (modo === 'avista') return [{ valor: arredondar(valor), data_vencimento: hoje, parcela_atual: 1, numero_parcelas: 1 }];
        if (modo === 'prazo') return [{ valor: arredondar(valor), data_vencimento: vencimento, parcela_atual: 1, numero_parcelas: 1 }];
        const n = Math.max(1, numParcelas || 1);
        const base = arredondar(valor / n);
        const out = [];
        let acumulado = 0;
        for (let i = 0; i < n; i++) {
            const v = i === n - 1 ? arredondar(valor - acumulado) : base;
            acumulado = arredondar(acumulado + v);
            out.push({ valor: v, data_vencimento: somarDias(hoje, intervaloDias * (i + 1)), parcela_atual: i + 1, numero_parcelas: n });
        }
        return out;
    }

    function acharContaDuplicadaNota(contasPagar, { cnpj, valor }, toleranciaPct = 1) {
        const dig = s => String(s || '').replace(/\D/g, '');
        const alvo = dig(cnpj);
        const tol = Math.max(0.01, valor * toleranciaPct / 100);
        const candidatas = (contasPagar || []).filter(c => c.pedido_compra_id && c.status !== 'Pago' && _naoCancelado(c) && alvo && dig(c.cnpj_fornecedor) === alvo);
        return candidatas.find(c => {
            if (Math.abs((Number(c.valor) || 0) - valor) <= tol) return true;
            if (c.lancamento_pai_id == null) return false;
            const grupo = (contasPagar || []).filter(x => _naoCancelado(x) && (x.lancamento_pai_id == c.lancamento_pai_id || x.id == c.lancamento_pai_id));
            const soma = grupo.reduce((s, x) => s + (Number(x.valor) || 0), 0);
            return Math.abs(soma - valor) <= tol;
        }) || null;
    }

    // Data local 'YYYY-MM-DD' de um evento em epoch ms (igual a toLocaleDateString('sv-SE')).
    // Uma data ja em ISO passa direto; vazio ou invalido da null.
    function dataLocalISO(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
        const d = new Date(Number(v));
        if (isNaN(d.getTime())) return null;
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    const MOTIVO_SEM_LANCAMENTO = 'valor recebido digitado no pedido sem lançamento no Financeiro';

    // Plano da migracao unica dos dados antigos para a Fase 0. So le os dados:
    // quem aplica e o app. Nunca redivide parcelas nem cria custo do pedido.
    function planoMigracaoFase0({ pedidos, contas_receber, contas_pagar, vendedores, hoje, rotuloPedido }) {
        const plano = { baixarCR: [], removerCR: [], marcarCRPedidoExcluido: [], criarCP: [], revisar: [] };
        const crs = contas_receber || [];
        const cps = (contas_pagar || []).slice();   // inclui as que este plano cria, para nao duplicar
        const rotulo = p => (typeof rotuloPedido === 'function' ? rotuloPedido(p) : '#' + p.id);
        const instalado = s => s === 'Instalado' || s === 'Faturado';   // 'Faturado' e o nome antigo

        (pedidos || []).forEach(ped => {
            const valor = Number(ped.valor) || 0;
            const recebidoPed = Number(ped.valor_recebido) || 0;
            const abertas = _doPedido(crs, ped.id).filter(c => c.status !== 'Pago' && c.status !== 'Cancelado');
            // Pagamento confirmado no fluxo antigo = tudo recebido. No fluxo novo a
            // confirmacao pode ser parcial (pagamento_pendente): essa nao e baixada.
            const quitado = (ped.pagamento_confirmado_em && !ped.pagamento_pendente) || (valor > 0 && recebidoPed >= valor);
            if (quitado && abertas.length) {
                const data = dataLocalISO(ped.pagamento_confirmado_em) || dataLocalISO(ped.data_instalado) || hoje;
                const por = ped.pagamento_confirmado_por || 'migracao';
                abertas.forEach(c => plano.baixarCR.push({ id: c.id, data_pagamento: data, baixado_por: por }));
            } else if (recebidoPed > 0 && recebidoPed < valor && _doPedido(crs, ped.id).length
                       && Math.abs(arredondar(recebidoPed - totalRecebido(crs, ped.id))) >= 0.01) {
                plano.revisar.push({ pedido_id: ped.id, motivo: 'valor recebido digitado no pedido não bate com o Financeiro' });
            } else if (recebidoPed > 0 && !_doPedido(crs, ped.id).length) {
                // Sem parcela nenhuma o valor digitado nao tem onde ficar: so avisa (quem aplica nao mexe nele).
                plano.revisar.push({ pedido_id: ped.id, motivo: MOTIVO_SEM_LANCAMENTO, sem_lancamento: true });
            }

            if (!instalado(ped.status)) return;
            const dataInst = dataLocalISO(ped.data_instalado) || hoje;
            const novas = contasComissaoDoPedido(ped, { vendedores, contasPagar: cps, data: dataInst, rotuloPedido: rotulo(ped) });
            novas.forEach(cp => {
                const c = CAMPOS_COMISSAO[cp.papel_comissao];
                if (ped[c.paga]) {
                    cp.status = 'Pago';
                    cp.data_pagamento = dataLocalISO(ped[c.data]) || dataInst;
                    cp.baixado_por = 'migracao';
                }
            });
            // RT antigo: arquiteto so pelo nome e %, nunca virou conta a pagar.
            const nomeRT = String(ped.arquiteto_nome || '').trim();
            const pctRT = Number(ped.rt_pct) || 0;
            const temArquiteto = ped.arq_id || novas.some(cp => cp.papel_comissao === 'arquiteto')
                || cps.some(cp => cp.pedido_id == ped.id && (cp.papel_comissao === 'arquiteto' || cp.categoria === 'comissao_rt'));
            const valorRT = arredondar(valor * pctRT / 100);
            if (nomeRT && pctRT > 0 && !ped.rt_gerado && !temArquiteto && valorRT > 0) {
                novas.push({
                    descricao: `Comissão ${pctRT}% — ${nomeRT} — Ped. ${rotulo(ped)}`,
                    valor: valorRT,
                    categoria: 'comissao',
                    tipo: 'variavel',
                    status: 'Pendente',
                    data_vencimento: dataInst,
                    data_pagamento: null,
                    credor_nome: nomeRT,
                    vendedor_id: null,
                    pedido_id: ped.id,
                    papel_comissao: 'arquiteto'
                });
            }
            novas.forEach(cp => { cps.push(cp); plano.criarCP.push(cp); });
        });

        // Conta a receber de pedido que nao existe mais.
        const idsPedidos = new Set((pedidos || []).map(p => String(p.id)));
        crs.forEach(c => {
            // Cancelada (pedido excluido) fica como registro.
            if (c.pedido_id == null || c.pedido_id === '' || idsPedidos.has(String(c.pedido_id)) || c.status === 'Cancelado') return;
            if (c.status !== 'Pago') plano.removerCR.push(c.id);
            else if (!c.pedido_excluido) plano.marcarCRPedidoExcluido.push(c.id);
        });
        return plano;
    }

    // ---- Comissao como registro do pedido (registrada -> pendente -> paga) ----
    // Campos extras por papel: status, movimento do pagamento, conta e historico.
    const CAMPOS_COMISSAO_REG = {
        vendedor:  { status: 'comissao_status',     mov: 'comissao_mov_id',     conta: 'comissao_conta_id',     hist: 'comissao_historico' },
        arquiteto: { status: 'arq_comissao_status', mov: 'arq_comissao_mov_id', conta: 'arq_comissao_conta_id', hist: 'arq_comissao_historico' }
    };
    const STATUS_COMISSAO = ['registrada', 'pendente', 'paga'];
    const _instalado = s => s === 'Instalado' || s === 'Faturado';   // 'Faturado' e o nome antigo
    const _aprovado = s => !!s && s !== 'Orçamento' && s !== 'Orcamento';

    // O pedido tem comissao neste papel: valor > 0 e alguem (id ou nome) a receber.
    function temComissao(ped, papel) {
        const c = CAMPOS_COMISSAO[papel];
        return !!ped && !!c && (Number(ped[c.valor]) || 0) > 0 && !!(ped[c.id] || ped[c.nome]);
    }

    // Status que a comissao deve ter agora: paga fica paga; senao pendente no Instalado,
    // registrada nas etapas aprovadas, e nada em Orcamento (ainda nao aprovado).
    function statusEsperadoComissao(ped, papel) {
        if (!temComissao(ped, papel)) return null;
        const c = CAMPOS_COMISSAO[papel], r = CAMPOS_COMISSAO_REG[papel];
        if (ped[c.paga] || ped[r.status] === 'paga') return 'paga';
        if (_instalado(ped.status)) return 'pendente';
        return _aprovado(ped.status) ? 'registrada' : null;
    }

    // Poe o status certo em cada comissao do pedido. Devolve as mudancas [{papel, de, para}].
    // `historico(papel, de, para)` (opcional) devolve a linha {em, por, porNome, acao, detalhe} a anotar.
    function sincronizarStatusComissoes(ped, historico) {
        const mudou = [];
        Object.keys(CAMPOS_COMISSAO).forEach(papel => {
            const r = CAMPOS_COMISSAO_REG[papel];
            const de = ped[r.status] || null;
            const para = statusEsperadoComissao(ped, papel);
            if (de === para) return;
            if (para === null) delete ped[r.status]; else ped[r.status] = para;
            if (historico && para) {
                const h = historico(papel, de, para);
                if (h) { if (!Array.isArray(ped[r.hist])) ped[r.hist] = []; ped[r.hist].push(h); }
            }
            mudou.push({ papel, de, para });
        });
        return mudou;
    }

    // Conta a pagar de comissao (a de hoje, com papel, ou a antiga 'comissao_rt' = arquiteto).
    function papelDaContaComissao(cp) {
        if (!cp) return null;
        if (cp.papel_comissao) return cp.papel_comissao;
        return cp.categoria === 'comissao_rt' ? 'arquiteto' : null;
    }

    // Comissoes do pedido que contam como custo/despesa: pendentes e pagas (nao as registradas), e so as que
    // nao tem conta a pagar propria (a comissao paga antes desta mudanca continua como conta paga).
    function comissoesContaveis(ped, contasPagar) {
        const out = [];
        Object.keys(CAMPOS_COMISSAO).forEach(papel => {
            if (!temComissao(ped, papel)) return;
            const status = ped[CAMPOS_COMISSAO_REG[papel].status];
            if (status !== 'pendente' && status !== 'paga') return;
            const temCP = (contasPagar || []).some(cp => cp && cp.pedido_id == ped.id && cp.status !== 'Cancelado' && papelDaContaComissao(cp) === papel);
            if (temCP) return;
            out.push({ papel, status, valor: arredondar(ped[CAMPOS_COMISSAO[papel].valor]) });
        });
        return out;
    }

    // Linhas da tela de comissoes: uma por comissao do pedido (papel). `mes` 'AAAA-MM' (data de instalacao).
    function linhasComissoes(pedidos, vendedores, opcoes) {
        const { vendedorId, mes } = opcoes || {};
        const out = [];
        (pedidos || []).forEach(p => {
            Object.keys(CAMPOS_COMISSAO).forEach(papel => {
                if (!temComissao(p, papel)) return;
                const c = CAMPOS_COMISSAO[papel], r = CAMPOS_COMISSAO_REG[papel];
                const status = p[r.status] || statusEsperadoComissao(p, papel);
                if (!status) return;
                const id = p[c.id] != null && p[c.id] !== '' ? p[c.id] : null;
                if (vendedorId != null && vendedorId !== '' && String(id) !== String(vendedorId)) return;
                const data = dataLocalISO(p.data_instalado);
                if (mes && !(data && data.slice(0, 7) === mes)) return;
                const v = id != null ? (vendedores || []).find(x => String(x.id) === String(id)) : null;
                out.push({
                    pedidoId: p.id, papel, vendedorId: id, nome: (v && v.nome) || p[c.nome] || '', data, clienteNome: p.clienteNome || '',
                    valorPedido: Number(p.valor) || 0, pct: Number(p[c.pct]) || 0, valor: arredondar(p[c.valor]), status,
                    pagoEm: status === 'paga' ? dataLocalISO(p[c.data]) : null
                });
            });
        });
        return out;
    }

    // Cartoes: Acumulado = pendente + paga; A pagar = pendente; Pago = paga. Geral e por vendedor.
    function totaisComissoes(linhas) {
        const zero = () => ({ acumulado: 0, aPagar: 0, pago: 0 });
        const soma = (t, l) => {
            if (l.status === 'pendente') { t.aPagar += l.valor; t.acumulado += l.valor; }
            else if (l.status === 'paga') { t.pago += l.valor; t.acumulado += l.valor; }
        };
        const geral = zero(), porVendedor = {};
        (linhas || []).forEach(l => {
            soma(geral, l);
            const k = String(l.vendedorId != null ? l.vendedorId : 'nome:' + l.nome);
            if (!porVendedor[k]) porVendedor[k] = Object.assign(zero(), { vendedorId: l.vendedorId, nome: l.nome });
            soma(porVendedor[k], l);
        });
        [geral].concat(Object.values(porVendedor)).forEach(t => { ['acumulado', 'aPagar', 'pago'].forEach(k => { t[k] = arredondar(t[k]); }); });
        return { geral, porVendedor };
    }

    const MOTIVO_COMISSAO_V2 = 'Comissão passou a ser registro do pedido';

    // Plano da migracao unica `sc_comissao_v2`: so le os dados, quem aplica e o app.
    // { removerCP: [ids de contas em aberto], pedidos: [{ id, set: {campos} }] }.
    // CP em aberto sai (o pedido fica pendente/registrada); CP paga continua e o pedido fica pago.
    // Pedido sem os campos da comissao (RT antigo so como conta) ganha valor/nome da conta.
    function planoMigracaoComissao({ pedidos, contas_pagar, movimentos }) {
        const plano = { removerCP: [], pedidos: [] };
        const cps = (contas_pagar || []).filter(Boolean);
        const doPapel = (ped, papel) => cps.filter(cp => cp.pedido_id == ped.id && papelDaContaComissao(cp) === papel && cp.status !== 'Cancelado');
        (pedidos || []).forEach(ped => {
            const set = {};
            Object.keys(CAMPOS_COMISSAO).forEach(papel => {
                const c = CAMPOS_COMISSAO[papel], r = CAMPOS_COMISSAO_REG[papel];
                const contas = doPapel(ped, papel);
                const abertas = contas.filter(cp => cp.status !== 'Pago');
                const pagas = contas.filter(cp => cp.status === 'Pago');
                abertas.forEach(cp => plano.removerCP.push(cp.id));
                let ref = ped;
                if (!temComissao(ped, papel) && contas.length) {
                    const cp = contas[0];
                    const total = arredondar(contas.reduce((s, x) => s + (Number(x.valor) || 0), 0));
                    set[c.valor] = total;
                    set[c.nome] = cp.credor_nome || ped[c.nome] || '';
                    if (!ped[c.id] && cp.vendedor_id != null) set[c.id] = cp.vendedor_id;
                    if (!(Number(ped[c.pct]) > 0)) set[c.pct] = Number(ped.rt_pct) || 0;
                    ref = Object.assign({}, ped, set);
                }
                if (!temComissao(ref, papel)) return;
                const jaPaga = !!ped[c.paga] || pagas.length > 0;
                const novo = jaPaga ? 'paga' : (_instalado(ped.status) ? 'pendente' : (_aprovado(ped.status) ? 'registrada' : null));
                // Sem conta nenhuma ligada e ja com status: nada a fazer (rodar de novo nao muda).
                if (!contas.length && ped[r.status]) return;
                if (novo === null) return;
                if (ped[r.status] !== novo) set[r.status] = novo;
                if (novo === 'paga') {
                    if (!ped[c.paga]) set[c.paga] = true;
                    const cp = pagas[0];
                    if (cp) {
                        if (!ped[c.data] && cp.data_pagamento) set[c.data] = new Date(cp.data_pagamento + 'T12:00:00').getTime();
                        if (cp.conta_id != null && ped[r.conta] == null) set[r.conta] = cp.conta_id;
                        const mv = (movimentos || []).find(m => m && m.origem === 'cp' && String(m.origem_id) === String(cp.id));
                        if (mv && ped[r.mov] == null) set[r.mov] = mv.id;
                    }
                }
            });
            if (Object.keys(set).length) plano.pedidos.push({ id: ped.id, set });
        });
        return plano;
    }

    const api = {
        CAMPOS_COMISSAO, arredondar, somarDias, entradaPctDoNome, planejarParcelas, totalRecebido, saldoEmAberto,
        tecidosDoPedido, custoSnapshotPedido, resultadoPedido, contasComissaoDoPedido, parcelasCompra, acharContaDuplicadaNota,
        dataLocalISO, planoMigracaoFase0, somarMesesData,
        CAMPOS_COMISSAO_REG, STATUS_COMISSAO, MOTIVO_COMISSAO_V2, temComissao, statusEsperadoComissao, sincronizarStatusComissoes, papelDaContaComissao,
        comissoesContaveis, linhasComissoes, totaisComissoes, planoMigracaoComissao
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.FinanceiroCore = api;

})(typeof window !== 'undefined' ? window : null);
