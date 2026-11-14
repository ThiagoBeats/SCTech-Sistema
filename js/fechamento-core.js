'use strict';
// Nucleo do Fechamento do mes: conferencia de contas, pendencias, maiores gastos,
// sugestoes, foto do fechamento e deteccao de mudancas. So funcoes puras — sem DOM,
// sem db, sem localStorage.
(function (raiz) {

    function arredondar(v) {
        const n = Number(v) || 0;
        return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100;
    }

    const centavos = v => Math.round((Number(v) || 0) * 100);
    const mesDe = data => (data ? String(data).slice(0, 7) : '');
    const moeda = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function ultimoDiaMes(mes) {
        const a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
        const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
        return mes + '-' + String(d).padStart(2, '0');
    }

    function mesAnterior(mes) {
        const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 2;
        return Math.floor(total / 12) + '-' + String((total % 12) + 1).padStart(2, '0');
    }

    function rotuloMes(mes) {
        return new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1)
            .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }

    function contasDaConferencia({ mes, contas, movimentos, saldoConta, ignorarAjustesDe }) {
        const ultimo = ultimoDiaMes(mes);
        const movs = (movimentos || []).filter(m => !(ignorarAjustesDe && m.origem === 'ajuste' && m.fechamento_mes === ignorarAjustesDe));
        return (contas || [])
            .filter(c => c.ativo !== false && c.data_saldo_inicial && String(c.data_saldo_inicial) <= ultimo)
            .map(c => ({ conta_id: c.id, nome: c.nome, esperado: arredondar(saldoConta(c, movs, ultimo)) }));
    }

    function pendenciasDoMes({ mes, contasPagar, contasReceber, impostoEstimado }) {
        const abertas = lista => (lista || []).filter(x => x.status !== 'Pago' && mesDe(x.data_vencimento) === mes);
        const soma = lista => arredondar(lista.reduce((s, x) => s + (Number(x.valor) || 0), 0));
        const pagar = abertas(contasPagar), receber = abertas(contasReceber);
        return {
            pagar, receber,
            pagar_qtd: pagar.length, pagar_valor: soma(pagar),
            receber_qtd: receber.length, receber_valor: soma(receber),
            guia_pendente: !!impostoEstimado
        };
    }

    function maioresGastos(porGrupo, n, grupos) {
        const limite = n == null ? 3 : n;
        return Object.keys(porGrupo || {})
            .filter(g => g !== 'imposto' && Number(porGrupo[g]) > 0)
            .map(g => {
                const gr = (grupos || []).find(x => x.id === g);
                return { grupo: g, rotulo: gr ? gr.rotulo : g, valor: Number(porGrupo[g]) };
            })
            .sort((a, b) => b.valor - a.valor)
            .slice(0, limite);
    }

    function sugestoesDoMes(p) {
        const out = [];
        const grupos = p.grupos || [];
        const pend = p.pendencias || {};
        if (Number(p.resultado) < 0) {
            let t = 'O mês fechou no vermelho em ' + moeda(-p.resultado) + '.';
            if (p.equilibrio && Number(p.equilibrio.valor) > 0) {
                t += ' Para empatar você precisa faturar ' + moeda(p.equilibrio.valor) + ' (ponto de equilíbrio).';
            }
            out.push(t);
        }
        (p.orcamento || []).filter(o => o.faixa === 'estourou').forEach(o => {
            out.push(o.rotulo + ' passou ' + moeda(-o.falta) + ' do orçamento.');
        });
        if (Number(p.meta) > 0 && Number(p.entradas) < Number(p.meta)) {
            out.push('Faltaram ' + moeda(p.meta - p.entradas) + ' para a meta.');
        }
        grupos.forEach(g => {
            const atual = Number((p.porGrupo || {})[g.id]) || 0;
            const ant = Number((p.porGrupoAnterior || {})[g.id]) || 0;
            if (ant > 0 && atual - ant > 100) {
                const pct = Math.round((atual - ant) / ant * 100);
                if (pct > 30) out.push(g.rotulo + ' subiu ' + pct + '% em relação a ' + p.rotuloAnterior + '.');
            }
        });
        if (Number(pend.receber_valor) > 0) {
            out.push(moeda(pend.receber_valor) + ' de clientes em atraso — vale cobrar.');
        }
        if (p.impostoEstimado) {
            out.push('Lance a guia de imposto de ' + p.rotuloMes + ' quando ela chegar.');
        }
        return out.length ? out.slice(0, 4) : ['Nenhum ponto de atenção. Bom mês!'];
    }

    function montarFoto({ mes, agoraISO, usuario, r, meta, contas, pendencias, sugestoes, anotacoes }) {
        return {
            id: 'fech-' + mes,
            mes,
            fechado_em: agoraISO,
            fechado_por: usuario,
            numeros: {
                entradas: r.entradas, saidas: r.saidas,
                imposto: r.imposto.valor, imposto_estimado: !!r.imposto.estimado,
                resultado: r.resultado, meta, por_grupo: r.porGrupo
            },
            contas,
            pendencias,
            sugestoes,
            anotacoes
        };
    }

    function mudancasDesdeFoto(foto, { r, saldos }) {
        const out = [];
        const n = foto.numeros;
        const difere = centavos(n.entradas) !== centavos(r.entradas) || centavos(n.saidas) !== centavos(r.saidas) ||
            centavos(n.imposto) !== centavos(r.imposto.valor) || centavos(n.resultado) !== centavos(r.resultado);
        if (difere) out.push({ tipo: 'resultado', antes: n.resultado, agora: r.resultado });
        (foto.contas || []).forEach(c => {
            if (c.extrato == null || !saldos || saldos[c.conta_id] == null) return;
            const antes = (Number(c.esperado) || 0) + (c.acao === 'ajuste' ? Number(c.diferenca) || 0 : 0);
            const agora = saldos[c.conta_id];
            if (centavos(antes) !== centavos(agora)) out.push({ tipo: 'conta', nome: c.nome, antes: arredondar(antes), agora });
        });
        return out;
    }

    function mesParaFechar({ hoje, fechamentos, temContas }) {
        if (!temContas) return null;
        const mes = mesAnterior(String(hoje).slice(0, 7));
        return (fechamentos || []).some(f => f.mes === mes) ? null : mes;
    }

    const api = { ultimoDiaMes, mesAnterior, rotuloMes, contasDaConferencia, pendenciasDoMes, maioresGastos,
        sugestoesDoMes, montarFoto, mudancasDesdeFoto, mesParaFechar };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.FechamentoCore = api;

})(typeof window !== 'undefined' ? window : null);
