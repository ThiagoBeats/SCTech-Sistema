'use strict';
// Nucleo do CEP e do endereco em partes: mascara, texto montado, leitura das
// respostas da ViaCEP e da BrasilAPI. So funcoes puras — sem DOM, sem db, sem rede.
(function (raiz) {

    const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
        'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

    const t = v => String(v == null ? '' : v).trim();

    function soDigitosCep(s) { return String(s == null ? '' : s).replace(/\D/g, '').slice(0, 8); }
    function mascaraCep(s) {
        const d = soDigitosCep(s);
        return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
    }
    function cepCompleto(s) { return String(s == null ? '' : s).replace(/\D/g, '').length === 8; }

    function textoEndereco(p) {
        p = p || {};
        return [p.rua, p.numero, p.complemento, p.bairro].map(t).filter(Boolean).join(', ');
    }

    // Texto para documentos e telas: "<texto> — Cidade/UF, CEP 00000-000". Registro sem partes
    // (rua === undefined) imprime o texto como sempre; pecas vazias ficam de fora.
    function textoComCidade(texto, p) {
        texto = t(texto);
        if (!p || p.rua === undefined) return texto;
        const cid = t(p.cidade), uf = t(p.uf), cep = soDigitosCep(p.cep);
        const local = [cid ? (uf ? cid + '/' + uf : cid) : '', cep.length === 8 ? 'CEP ' + mascaraCep(cep) : ''].filter(Boolean).join(', ');
        return [texto, local].filter(Boolean).join(' — ');
    }

    function partesDeRegistroAntigo(texto, cidade) {
        return { cep: '', rua: texto || '', numero: '', complemento: '', bairro: '', cidade: cidade || '', uf: '' };
    }

    function _resultado(rua, bairro, cidade, uf) {
        rua = t(rua);
        return { ok: true, rua, bairro: t(bairro), cidade: t(cidade), uf: t(uf).toUpperCase(), cidadeToda: !rua };
    }
    function interpretarViaCep(j) {
        if (!j || j.erro === true || j.erro === 'true') return { ok: false, motivo: 'nao-encontrado' };
        return _resultado(j.logradouro, j.bairro, j.localidade, j.uf);
    }
    function interpretarBrasilApi(j) {
        if (!j || j.erro === true || j.erro === 'true') return { ok: false, motivo: 'nao-encontrado' };
        return _resultado(j.street, j.neighborhood, j.city, j.state);
    }

    const api = { soDigitosCep, mascaraCep, cepCompleto, textoEndereco, textoComCidade, partesDeRegistroAntigo,
        interpretarViaCep, interpretarBrasilApi, UFS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.EnderecoCore = api;

})(typeof window !== 'undefined' ? window : null);
