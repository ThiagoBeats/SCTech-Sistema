'use strict';
// Nucleo das mascaras: moeda brasileira (formatar/ler) e maiuscula automatica de texto.
// So funcoes puras — sem DOM, sem db, sem localStorage.
(function (raiz) {

    function milhar(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

    // Digitos tratados como centavos: "" -> "", "5" -> "R$ 0,05", "125000" -> "R$ 1.250,00".
    function formatarMoedaDigitos(digitos) {
        let d = String(digitos == null ? '' : digitos).replace(/\D/g, '').replace(/^0+/, '');
        if (d === '') return '';
        while (d.length < 3) d = '0' + d;
        return 'R$ ' + milhar(d.slice(0, -2)) + ',' + d.slice(-2);
    }

    function formatarMoeda(n) {
        if (n === null || n === undefined || n === '') return '';
        const v = Number(n);
        if (!Number.isFinite(v)) return '';
        if (Math.abs(v) >= 1e13) return '';
        const cent = Math.round(Math.abs(v) * 100 + 1e-9);
        const txt = formatarMoedaDigitos(String(cent)) || 'R$ 0,00';
        return (v < 0 && cent > 0 ? '-' : '') + txt;
    }

    // Aceita "R$ 1.250,00", "1.250,00", "1250,5", "1250.50", "1.250", 1250.5; vazio/invalido -> null.
    function lerMoeda(texto) {
        if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
        let t = String(texto == null ? '' : texto).replace(/R\$/gi, '').replace(/\s+/g, '');
        if (t === '') return null;
        let neg = false;
        if (t[0] === '-') { neg = true; t = t.slice(1); }
        const vir = t.lastIndexOf(','), pon = t.lastIndexOf('.');
        if (vir >= 0 && pon >= 0) t = vir > pon ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
        else if (vir >= 0) t = t.replace(',', '.');
        else if (pon >= 0) {
            if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
        }
        if (!/^\d+(\.\d+)?$/.test(t)) return null;
        const v = parseFloat(t);
        return neg ? -v : v;
    }

    const LETRA = /\p{L}/u;
    const PULA = /[\s"'“”‘’(\[{«¿¡\-–—*]/;
    const FIM = /[.?!]/;
    // Abreviacoes comuns: o ponto depois delas nao termina frase.
    const ABREV = ['av', 'r', 'al', 'trav', 'rod', 'est', 'pça', 'pca', 'jd', 'vl', 'res', 'cond', 'ed', 'apto', 'ap', 'bl', 'qd', 'lt',
        'km', 'nº', 'no', 'n', 'dr', 'dra', 'sr', 'sra', 'srta', 'prof', 'profa', 'eng', 'arq', 'ltda', 'cia', 'me', 'epp', 's.a', 'sa',
        'obs', 'ref', 'tel', 'cel', 'aprox', 'etc'];
    function ehAbreviacao(t, posPonto) {
        let k = posPonto;
        while (k > 0 && !/\s/.test(t[k - 1])) k--;
        const w = t.slice(k, posPonto).replace(/^[^\p{L}\d]+/u, '').toLowerCase();
        return ABREV.indexOf(w) >= 0;
    }

    // Maiuscula na primeira letra e na primeira letra depois de ". ", "? ", "! " (ou quebra de linha).
    function capitalizar(texto, cursor) {
        const t = String(texto == null ? '' : texto);
        const cs = (cursor == null || cursor < 0) ? t.length : cursor;
        const out = t.split('');
        let pend = true;
        let i = 0;
        while (i < t.length) {
            const c = t[i];
            if (pend) {
                if (LETRA.test(c)) {
                    let f = i;
                    while (f < t.length && !/\s/.test(t[f])) f++;
                    const palavra = t.slice(i, f);
                    if (!/@|:\/\/|www\./i.test(palavra)) {
                        const up = c.toUpperCase();
                        if (up.length === c.length) out[i] = up;
                    }
                    pend = false;
                } else if (!PULA.test(c)) pend = false;
                i++;
                continue;
            }
            if (FIM.test(c)) {
                let j = i;
                while (j < t.length && FIM.test(t[j])) j++;
                if (j < t.length && /\s/.test(t[j]) && !(j - i === 1 && t[i] === '.' && ehAbreviacao(t, i))) pend = true;
                i = j;
                continue;
            }
            i++;
        }
        return { texto: out.join(''), cursor: cs };
    }

    // Texto que ficaria no lugar de `data` se ele fosse digitado logo depois de `antes` (maiuscula automatica).
    // Usado pelo script global para trocar so o trecho inserido, sem reescrever o campo.
    function inserirCapitalizado(antes, data) {
        const a = String(antes == null ? '' : antes), x = String(data == null ? '' : data);
        return capitalizar(a + x, a.length + x.length).texto.slice(a.length);
    }

    const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Trechos distintivos: valem como pedaco do identificador.
    const SUBSTR = ['email', 'senha', 'password', 'telefone', 'celular', 'whats', 'codigo', 'cnpj', 'cpf', 'digitavel',
        'agencia', 'iban', 'usuario', 'token', 'busca', 'search', 'filtro', 'documento', 'numero_conta', 'conta_numero', 'filter', 'colar', 'nfe'];
    // Curtos/ambiguos: so valem como palavra inteira (separada por - _ espaco ou maiuscula).
    const TOKENS = ['url', 'site', 'cep', 'doc', 'tel', 'cod', 'sku', 'chave', 'pix', 'placa', 'login', 'cor',
        'ref', 'referencia', 'lote', 'medida', 'ie', 'num', 'numero', 'chave'];

    function ehExcluidoPorNome(valor) {
        if (!valor) return false;
        const bruto = String(valor).replace(/([a-z0-9])([A-Z])/g, '$1-$2');
        const n = norm(bruto);
        const compacto = n.replace(/[-\s]/g, '_');
        if (SUBSTR.some(s => compacto.indexOf(s) >= 0)) return true;
        const ts = n.split(/[^a-z0-9]+/).filter(Boolean);
        if (ts.some(x => TOKENS.indexOf(x) >= 0)) return true;
        for (let k = 0; k < ts.length - 1; k++) {
            if (ts[k] === 'conta' && ts[k + 1] === 'numero') return true;
            if (ts[k] === 'numero' && ts[k + 1] === 'conta') return true;
        }
        return false;
    }

    function aceitaMaiuscula(campo) {
        const f = campo || {};
        const tag = String(f.tag || '').toLowerCase();
        if (tag !== 'textarea' && tag !== 'input') return false;
        if (tag === 'input') {
            const ty = String(f.type == null ? 'text' : f.type).toLowerCase();
            if (ty !== 'text' && ty !== '') return false;
        }
        const ds = f.dataset || {};
        if (ds.semMaiuscula !== undefined && ds.semMaiuscula !== 'false') return false;
        if (ds.moeda !== undefined) return false;
        const im = String(f.inputmode || '').toLowerCase();
        if (im && im !== 'text') return false;
        const ac = String(f.autocomplete || '').toLowerCase();
        if (/email|password|url|tel|username|one-time|cc-/.test(ac)) return false;
        return !(ehExcluidoPorNome(f.id) || ehExcluidoPorNome(f.name));
    }

    const api = { formatarMoedaDigitos, formatarMoeda, lerMoeda, capitalizar, inserirCapitalizado, aceitaMaiuscula };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.MascarasCore = api;

})(typeof window !== 'undefined' ? window : null);
