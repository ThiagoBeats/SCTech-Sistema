'use strict';
// Nucleo do caixa: saldos das contas, repasses de cartao e divisao de parcela.
// So funcoes puras — sem DOM, sem db, sem localStorage — para rodar em `node --test`.
(function (raiz) {

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

    function mesmoId(a, b) {
        return a != null && b != null && String(a) === String(b);
    }

    const CARTAO_PADRAO = { debito_taxa: 1.5, debito_dias: 1, credito_taxa: 3, credito_dias: 30, parcelado_taxa: 4, antecipacao_taxa: 2, antecipacao_dias: 1 };

    // Cartao da conta com padroes; numeros vindos de formulario (texto) viram numero.
    function cartaoDa(conta) {
        const bruto = (conta && conta.cartao) || {};
        const c = {};
        Object.keys(CARTAO_PADRAO).forEach(k => {
            const v = bruto[k] === '' || bruto[k] == null ? NaN : Number(bruto[k]);
            c[k] = Number.isFinite(v) ? v : CARTAO_PADRAO[k];
        });
        return c;
    }

    function contaAceitaMovimento(conta, data) {
        return !!conta && conta.ativo !== false && data >= conta.data_saldo_inicial;
    }

    function saldoConta(conta, movimentos, ateData) {
        let saldo = Number(conta.saldo_inicial) || 0;
        (movimentos || []).forEach(m => {
            if (!mesmoId(m.conta_id, conta.id)) return;
            if (m.data < conta.data_saldo_inicial || m.data > ateData) return;
            saldo += m.sentido === 'entrada' ? Number(m.valor) : -Number(m.valor);
        });
        return arredondar(saldo);
    }

    function saldosHoje(contas, movimentos, hoje) {
        let total = 0;
        const lista = (contas || []).map(c => {
            const saldo = saldoConta(c, movimentos, hoje);
            let aCair = 0;
            (movimentos || []).forEach(m => {
                if (!mesmoId(m.conta_id, c.id) || m.data <= hoje) return;
                aCair += m.sentido === 'entrada' ? Number(m.valor) : -Number(m.valor);
            });
            total += saldo;
            return { id: c.id, nome: c.nome, tipo: c.tipo, saldo, a_cair: arredondar(aCair) };
        });
        return { contas: lista, total: arredondar(total) };
    }

    // Divide valor e taxa em N partes; a ultima absorve o arredondamento.
    function dividirEmPartes(total, n) {
        const base = arredondar(total / n);
        const partes = [];
        let soma = 0;
        for (let i = 0; i < n - 1; i++) { partes.push(base); soma += base; }
        partes.push(arredondar(total - soma));
        return partes;
    }

    function repassesCartao({ valor, data, conta, tipo, vezes = 1, antecipar = false }) {
        const c = cartaoDa(conta);
        const n = Math.max(1, Math.floor(Number(vezes) || 1));
        if (tipo === 'debito') {
            const taxa = arredondar(valor * c.debito_taxa / 100);
            return [{ data: somarDias(data, c.debito_dias), bruto: arredondar(valor), taxa, liquido: arredondar(valor - taxa) }];
        }
        const pctCredito = n >= 2 ? c.parcelado_taxa : c.credito_taxa;
        if (antecipar) {
            const taxa = arredondar(valor * (pctCredito + c.antecipacao_taxa) / 100);
            return [{ data: somarDias(data, c.antecipacao_dias), bruto: arredondar(valor), taxa, liquido: arredondar(valor - taxa) }];
        }
        if (n === 1) {
            const taxa = arredondar(valor * pctCredito / 100);
            return [{ data: somarDias(data, c.credito_dias), bruto: arredondar(valor), taxa, liquido: arredondar(valor - taxa) }];
        }
        const brutos = dividirEmPartes(valor, n);
        const taxas = dividirEmPartes(arredondar(valor * pctCredito / 100), n);
        return brutos.map((bruto, i) => ({
            data: somarDias(data, 30 * (i + 1)), bruto, taxa: taxas[i], liquido: arredondar(bruto - taxas[i])
        }));
    }

    function dividirParcela(cr, valorPago) {
        const pago = arredondar(valorPago);
        if (!(pago > 0) || pago > cr.valor) throw new Error('Valor pago invalido');
        return { pago, resto: arredondar(cr.valor - pago) };
    }

    const MENSAGEM_COBRANCA_PADRAO = 'Olá, {cliente}! Aqui é da {empresa}. Passando para lembrar da parcela de {valor} do pedido {pedido}, com vencimento em {vencimento}. Qualquer dúvida, estou à disposição.';

    const aberto = x => x && x.status !== 'Pago';
    const maxData = (a, b) => (a > b ? a : b);

    // Ocorrencias mensais de uma despesa fixa entre duas datas (dia ajustado ao fim do mes).
    // Respeita ativo e data_inicio/data_fim; periodicidade diferente de mensal nao e tratada (conta como mensal).
    function ocorrenciasFixa(df, de, ate) {
        if (!df || df.ativo === false) return [];
        const dia = Math.max(1, Math.floor(Number(df.dia_vencimento) || 1));
        const out = [];
        let ano = Number(de.slice(0, 4)), mes = Number(de.slice(5, 7));
        const fimAno = Number(ate.slice(0, 4)), fimMes = Number(ate.slice(5, 7));
        while (ano < fimAno || (ano === fimAno && mes <= fimMes)) {
            const ultimo = new Date(ano, mes, 0).getDate();
            const data = ano + '-' + String(mes).padStart(2, '0') + '-' + String(Math.min(dia, ultimo)).padStart(2, '0');
            if (data >= de && data <= ate && (!df.data_inicio || data >= df.data_inicio) && (!df.data_fim || data <= df.data_fim)) out.push(data);
            mes++; if (mes > 12) { mes = 1; ano++; }
        }
        return out;
    }

    function previsaoSemanal({ hoje, saldoHoje, movimentos, contasReceber, contasPagar, despesasFixas, contas, meios, semanas = 8 }) {
        const lista = [];
        for (let i = 0; i < semanas; i++) {
            lista.push({ inicio: somarDias(hoje, 7 * i), fim: somarDias(hoje, 7 * i + 6), entradas: 0, saidas: 0, saldo_final: 0, inclui_atrasados: false });
        }
        const limite = lista.length ? lista[lista.length - 1].fim : hoje;
        const lanca = (data, valor, sentido, atrasado) => {
            const s = lista.find(w => data >= w.inicio && data <= w.fim);
            if (!s) return;
            s[sentido === 'entrada' ? 'entradas' : 'saidas'] += Number(valor) || 0;
            if (atrasado) s.inclui_atrasados = true;
        };
        (movimentos || []).forEach(m => { if (m.data > hoje) lanca(m.data, m.valor, m.sentido, false); });
        (contasReceber || []).filter(aberto).forEach(cr => {
            const atrasado = cr.data_vencimento < hoje;
            const data = maxData(cr.data_vencimento, hoje);
            const mp = cr.meio_previsto;
            const meio = mp ? (meios || []).find(x => mesmoId(x.id, mp.meio_id)) : null;
            if (meio && (meio.tipo === 'cartao_credito' || meio.tipo === 'cartao_debito')) {
                const conta = (contas || []).find(c => mesmoId(c.id, meio.conta_id));
                repassesCartao({ valor: Number(cr.valor) || 0, data, conta, tipo: meio.tipo === 'cartao_debito' ? 'debito' : 'credito', vezes: mp.vezes, antecipar: !!mp.antecipar })
                    .forEach(r => lanca(r.data, r.liquido, 'entrada', atrasado && r.data <= somarDias(hoje, 6)));
            } else {
                lanca(data, cr.valor, 'entrada', atrasado);
            }
        });
        (contasPagar || []).filter(aberto).forEach(cp => lanca(maxData(cp.data_vencimento, hoje), cp.valor, 'saida', cp.data_vencimento < hoje));
        // Com periodicidade, as ocorrencias ja viram CP pre-gerados; so as antigas (sem periodicidade) sao projetadas por mes.
        (despesasFixas || []).filter(df => !df.periodicidade).forEach(df => {
            ocorrenciasFixa(df, hoje.slice(0, 8) + '01', limite).forEach(data => {
                const mes = data.slice(0, 7);
                const gerada = (contasPagar || []).some(cp => cp.tipo === 'fixo' && cp.descricao === df.descricao && String(cp.data_vencimento).slice(0, 7) === mes);
                if (!gerada) lanca(maxData(data, hoje), df.valor, 'saida', data < hoje);
            });
        });
        let saldo = Number(saldoHoje) || 0;
        lista.forEach(s => {
            s.entradas = arredondar(s.entradas);
            s.saidas = arredondar(s.saidas);
            saldo = arredondar(saldo + s.entradas - s.saidas);
            s.saldo_final = saldo;
        });
        return lista;
    }

    function primeiraSemanaNegativa(semanas) {
        const s = (semanas || []).find(w => w.saldo_final < 0);
        return s ? { inicio: s.inicio, falta: arredondar(-s.saldo_final) } : null;
    }

    // `contas` e opcional: sem ele nao ha como saber quais movimentos sao da maquininha (cartaoHoje fica vazio).
    function tarefasHoje({ hoje, contasReceber, contasPagar, movimentos, contas }) {
        const rec = (contasReceber || []).filter(aberto);
        const pag = (contasPagar || []).filter(aberto);
        const em7 = somarDias(hoje, 7);
        const maquininhas = (contas || []).filter(c => c.tipo === 'maquininha');
        return {
            receberAtrasados: rec.filter(x => x.data_vencimento < hoje),
            receberHoje: rec.filter(x => x.data_vencimento === hoje),
            pagarAtrasados: pag.filter(x => x.data_vencimento < hoje),
            pagarProximos: pag.filter(x => x.data_vencimento >= hoje && x.data_vencimento <= em7),
            cartaoHoje: (movimentos || []).filter(m => m.sentido === 'entrada' && m.data === hoje && maquininhas.some(c => mesmoId(c.id, m.conta_id)))
        };
    }

    function normalizarTelefone(tel) {
        const d = String(tel == null ? '' : tel).replace(/\D/g, '');
        if (d.length === 10 || d.length === 11) return '55' + d;
        if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
        return null;
    }

    function montarMensagem(template, dados) {
        const d = dados || {};
        return String(template == null ? '' : template).replace(/\{(cliente|empresa|valor|pedido|vencimento)\}/g, (_, k) => (d[k] == null ? '' : String(d[k])));
    }

    function linkWhatsApp(telefone, mensagem) {
        if (!telefone) return null;
        return 'https://wa.me/' + telefone + '?text=' + encodeURIComponent(mensagem || '');
    }

    const api = { contaAceitaMovimento, saldoConta, saldosHoje, repassesCartao, dividirParcela, arredondar, somarDias, mesmoId, previsaoSemanal, primeiraSemanaNegativa, tarefasHoje, normalizarTelefone, montarMensagem, linkWhatsApp, MENSAGEM_COBRANCA_PADRAO };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.CaixaCore = api;

})(typeof window !== 'undefined' ? window : null);
