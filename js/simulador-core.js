'use strict';
// Nucleo do Simulador de compra: calendario de pagamentos, veredito e melhor data.
// So funcoes puras — sem DOM, sem db. A previsao vem por funcao injetada.
(function (raiz) {

    const moeda = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ddmm = data => String(data).slice(8, 10) + '/' + String(data).slice(5, 7);
    const arred = v => Math.round(v * 100) / 100;

    function montarData(a, m, d) { // m: 0-11 (pode estourar), d: 1-31
        const base = new Date(a, m, 1);
        const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        return base.getFullYear() + '-' + String(base.getMonth() + 1).padStart(2, '0') + '-' + String(Math.min(d, ultimo)).padStart(2, '0');
    }

    function somarDias(data, dias) {
        const d = new Date(Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1, Number(data.slice(8, 10)) + dias);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function diasEntre(a, b) {
        const ms = s => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
        return Math.round((ms(b) - ms(a)) / 86400000);
    }

    function parcelas(total, n, dataPrimeira) {
        const a = Number(dataPrimeira.slice(0, 4)), m = Number(dataPrimeira.slice(5, 7)) - 1, d = Number(dataPrimeira.slice(8, 10));
        const cada = arred(total / n);
        const out = [];
        let soma = 0;
        for (let i = 0; i < n; i++) {
            const valor = i === n - 1 ? arred(total - soma) : cada;
            soma = arred(soma + valor);
            out.push({ data: montarData(a, m + i, d), valor, rotulo: 'Parcela ' + (i + 1) + '/' + n });
        }
        return out;
    }

    function pagamentosDaCompra({ valor, forma, parcelas: n, entrada, dataCompra, dataPrimeira }) {
        const v = Number(valor);
        if (!(v > 0)) return { ok: false, erro: 'Informe o valor da compra.' };
        if (forma === 'avista') return { ok: true, pagamentos: [{ data: dataCompra, valor: v, rotulo: 'À vista' }] };
        const np = Number(n);
        if (!Number.isInteger(np) || np < 2 || np > 48) return { ok: false, erro: 'Parcelas: de 2 a 48.' };
        if (forma === 'parcelado') return { ok: true, pagamentos: parcelas(v, np, dataPrimeira) };
        const e = Number(entrada);
        if (!(e > 0) || !(e < v)) return { ok: false, erro: 'A entrada precisa ser maior que zero e menor que o valor.' };
        return { ok: true, pagamentos: [{ data: dataCompra, valor: e, rotulo: 'Entrada' }].concat(parcelas(arred(v - e), np, dataPrimeira)) };
    }

    function pagamentosComoContas(pagamentos) {
        return pagamentos.map((p, i) => ({ id: 'sim-' + i, status: 'Pendente', data_vencimento: p.data, valor: p.valor, descricao: p.rotulo }));
    }

    function deslocar(pagamentos, dias) {
        return pagamentos.map(p => Object.assign({}, p, { data: somarDias(p.data, dias) }));
    }

    function resultadoMedio(resultados) {
        if (!resultados || !resultados.length) return null;
        return arred(resultados.reduce((s, x) => s + (Number(x) || 0), 0) / resultados.length);
    }

    function veredito({ semanasSem, semanasCom, folga, parcelaMensal, temParcelaAlem, resultadoMedio: medio, ganhoMensal, valorTotal }) {
        let menor = null;
        (semanasCom || []).forEach(s => { if (!menor || s.saldo_final < menor.saldo) menor = { saldo: s.saldo_final, inicio: s.inicio }; });
        const frases = [];
        let cor = 'verde';
        if (menor && menor.saldo < 0) {
            cor = 'vermelho';
            frases.push('O caixa fica negativo em ' + moeda(-menor.saldo) + ' na semana de ' + ddmm(menor.inicio) + '.');
        } else if (menor && menor.saldo < folga) {
            cor = 'amarelo';
            frases.push('O caixa fica em ' + moeda(menor.saldo) + ' na semana de ' + ddmm(menor.inicio) + '.');
        }
        if (temParcelaAlem) {
            if (medio == null) frases.push('Sem histórico para comparar a parcela com o que sobra por mês.');
            else if (parcelaMensal > medio) {
                if (cor === 'verde') cor = 'amarelo';
                frases.push('A parcela de ' + moeda(parcelaMensal) + ' é maior do que sobra em média por mês (' + moeda(medio) + ').');
            }
        }
        let paybackMeses = null;
        if (ganhoMensal > 0) {
            paybackMeses = Math.ceil(valorTotal / ganhoMensal);
            frases.push('Se paga em ' + paybackMeses + (paybackMeses === 1 ? ' mês.' : ' meses.'));
        }
        const titulo = cor === 'verde' ? 'Cabe' : cor === 'amarelo' ? 'Cabe, mas aperta' : 'Não cabe agora';
        return { cor, titulo, frases, menor, paybackMeses };
    }

    function melhorData({ hoje, pagamentos, prever }) {
        if (!pagamentos || !pagamentos.length) return null;
        const primeira = pagamentos.reduce((m, p) => (p.data < m ? p.data : m), pagamentos[0].data);
        for (let k = 1; k <= 7; k++) {
            const inicio = somarDias(hoje, 7 * k);
            const semanas = prever(deslocar(pagamentos, diasEntre(primeira, inicio)));
            if (!semanas.some(s => s.saldo_final < 0)) return inicio;
        }
        return null;
    }

    const api = { pagamentosDaCompra, pagamentosComoContas, deslocar, resultadoMedio, veredito, melhorData };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.SimuladorCore = api;

})(typeof window !== 'undefined' ? window : null);
