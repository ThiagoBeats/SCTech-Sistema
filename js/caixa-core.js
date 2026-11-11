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

    const api = { contaAceitaMovimento, saldoConta, saldosHoje, repassesCartao, dividirParcela, arredondar, somarDias };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.CaixaCore = api;

})(typeof window !== 'undefined' ? window : null);
