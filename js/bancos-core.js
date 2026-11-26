'use strict';
// Nucleo dos bancos: busca de instituicoes (sem acento/caixa) e mascara de agencia/conta por banco.
// So funcoes puras — sem DOM, sem db, sem localStorage.
(function (raiz) {

    function norm(s) {
        return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }
    const palavras = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
    const pad3 = c => (c == null || c === '' ? '' : String(c).replace(/\D/g, '').padStart(3, '0'));

    // Pontuacao de um banco para o termo (menor = melhor; null = nao casa).
    function pontuar(b, termo, tokens, soDigitos) {
        const nome = norm(b.nome);
        const cod = b.codigo == null ? '' : String(b.codigo);
        if (soDigitos && cod && (cod === soDigitos || cod === pad3(soDigitos) || Number(cod) === Number(soDigitos))) return 0;
        if (nome.startsWith(termo)) return 1;
        const pn = palavras(b.nome), pc = palavras(b.nomeCompleto);
        const casa = lista => tokens.every(t => lista.some(w => w.startsWith(t)));
        if (casa(pn) || casa(pn.concat(pc))) return 2;
        if (soDigitos && cod && cod.startsWith(soDigitos)) return 3;
        return null;
    }

    function buscar(lista, termo, limite) {
        const t = norm(termo);
        if (!t || !Array.isArray(lista)) return [];
        const tokens = palavras(t);
        const soDigitos = /^\d+$/.test(t) ? t : '';
        const max = limite == null ? 8 : limite;
        const achados = [];
        lista.forEach((b, i) => {
            const p = pontuar(b, t, tokens, soDigitos);
            if (p !== null) achados.push({ b, p, i });
        });
        achados.sort((x, y) => x.p - y.p || x.i - y.i);
        return achados.slice(0, max).map(x => x.b);
    }

    // Formatos por banco (codigo COMPE). Agencia: `digitos` do corpo + DV opcional (dv). Conta: `digitos` (maximo
    // do corpo), `min` (corpo minimo, quando varia), `dv`, `operacao` (digitos antes da conta, Caixa) e `letras`
    // (letras aceitas no DV). Quando ha duvida, o formato generico vale.
    const AG4 = { digitos: 4, dv: false };
    const AG4DV = { digitos: 4, dv: true };
    const GENERICO = { agencia: AG4DV, conta: { digitos: 12, min: 3, dv: true, letras: 'X' } };
    const FORMATOS = {
        '001': { agencia: AG4DV, conta: { digitos: 8, dv: true, letras: 'X' } },
        '104': { agencia: AG4, conta: { digitos: 8, dv: true, operacao: 4 } },
        '237': { agencia: AG4DV, conta: { digitos: 7, dv: true, letras: 'P' } },
        '341': { agencia: AG4, conta: { digitos: 5, dv: true } },
        '033': { agencia: AG4, conta: { digitos: 8, dv: true } },
        '260': { agencia: AG4, conta: { digitos: 10, min: 7, dv: true } },
        '077': { agencia: AG4, conta: { digitos: 9, dv: true } },
        '336': { agencia: AG4, conta: { digitos: 8, dv: true } },
        '756': { agencia: AG4, conta: { digitos: 10, min: 5, dv: true } },
        '748': { agencia: AG4, conta: { digitos: 6, min: 5, dv: true } },
        '290': { agencia: AG4, conta: { digitos: 8, dv: true } },
        '323': { agencia: AG4, conta: { digitos: 10, dv: true } },
        '041': { agencia: AG4, conta: { digitos: 9, dv: true } },
        '004': { agencia: AG4, conta: { digitos: 6, dv: true } }
        // 212, 655, 380, 403, 197, 422, 070, 021: sem formato confirmado, usam o generico.
    };

    function formatoDoBanco(codigo) {
        const f = FORMATOS[pad3(codigo)] || GENERICO;
        return JSON.parse(JSON.stringify(f));
    }

    function limpar(texto, letras) {
        const re = new RegExp('[^0-9' + (letras || '') + ']', 'g');
        return String(texto == null ? '' : texto).toUpperCase().replace(re, '');
    }

    // Poe "-" antes do DV. `corpo` fixo (digitos) ou variavel (min..digitos: o DV e o ultimo caractere
    // assim que passa do minimo). Nunca descarta caracteres: o excedente fica depois do "-".
    function comDv(s, spec) {
        if (!spec.dv) return s;
        let n;
        if (spec.min) {
            if (s.length <= spec.min) return s;
            n = Math.min(s.length - 1, spec.digitos);
        } else {
            n = spec.digitos;
            if (s.length <= n) return s;
        }
        return s.slice(0, n) + '-' + s.slice(n);
    }

    function mascararAgencia(texto, codigo) {
        const spec = formatoDoBanco(codigo).agencia;
        return comDv(limpar(texto, 'X'), spec);
    }

    function mascararConta(texto, codigo) {
        const spec = formatoDoBanco(codigo).conta;
        const s = limpar(texto, spec.letras);
        if (spec.operacao) {
            if (s.length <= spec.operacao) return s;
            return s.slice(0, spec.operacao) + ' ' + comDv(s.slice(spec.operacao), spec);
        }
        return comDv(s, spec);
    }

    const api = { buscar, formatoDoBanco, mascararAgencia, mascararConta };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.BancosCore = api;

})(typeof window !== 'undefined' ? window : null);
