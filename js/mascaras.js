'use strict';
// Mascaras globais por delegacao no document: valem para campos criados depois, sem registro.
//  - [data-moeda]: mascara de moeda brasileira (digitos viram centavos).
//  - maiuscula automatica nos campos de texto livre (ver MascarasCore.aceitaMaiuscula).
//    So age quando o usuario INSERE texto (beforeinput insertText/insertReplacementText): troca o trecho
//    digitado pela versao com maiuscula via execCommand('insertText'), o que preserva o desfazer (Ctrl+Z).
//    Nunca age em apagar, desfazer/refazer, colar nem em valor definido por codigo.
//    Durante a composicao (IME, acento morto) nao mexe; no compositionend troca so o trecho confirmado,
//    exceto no Android (Gboard compoe a cada palavra e mexer ali duplica/perde texto).
(function () {
    const M = window.MascarasCore;
    if (!M) return;

    const ANDROID = /Android/i.test((navigator && navigator.userAgent) || '');
    const MAX_DIGITOS_MOEDA = 12;

    function elDe(x) { return typeof x === 'string' ? document.getElementById(x) : x; }
    function descreve(el) {
        return { tag: el.tagName, type: el.getAttribute('type'), id: el.id, name: el.name,
            autocomplete: el.getAttribute('autocomplete'), inputmode: el.getAttribute('inputmode'), dataset: el.dataset };
    }
    function fim(el) { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { } }
    function ehCampoTexto(el) { return el && el.tagName && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'); }
    function ehMoeda(el) { return el.dataset && el.dataset.moeda !== undefined; }

    function aplicarMoeda(el, e) {
        const v = el.value;
        const colou = e && (!e.isTrusted || /^insertFrom/.test(e.inputType || '') || (e.data && e.data.length > 1));
        let novo;
        if (colou && /[.,]/.test(v) && M.lerMoeda(v) !== null) novo = M.formatarMoeda(M.lerMoeda(v));
        else novo = M.formatarMoedaDigitos(v.replace(/\D/g, '').slice(0, MAX_DIGITOS_MOEDA));
        if (novo !== v) el.value = novo;
        fim(el);
    }

    // Substitui [ini, fimSel) por texto, mantendo o desfazer; sem execCommand usa setRangeText e avisa com um input.
    function trocar(el, ini, fimSel, texto) {
        el.setSelectionRange(ini, fimSel);
        let ok = false;
        try { ok = document.execCommand('insertText', false, texto); } catch (e) { ok = false; }
        if (!ok) {
            el.setRangeText(texto, ini, fimSel, 'end');
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: texto }));
        }
    }

    document.addEventListener('beforeinput', function (e) {
        const el = e.target;
        if (!ehCampoTexto(el) || ehMoeda(el)) return;
        if (!e.isTrusted || e.isComposing) return;
        if (e.inputType !== 'insertText' && e.inputType !== 'insertReplacementText') return;
        if (typeof e.data !== 'string' || e.data === '') return;
        if (!M.aceitaMaiuscula(descreve(el))) return;
        let ini, fimSel;
        try { ini = el.selectionStart; fimSel = el.selectionEnd; } catch (x) { return; }
        if (ini == null) return;
        const novo = M.inserirCapitalizado(el.value.slice(0, ini), e.data);
        if (novo === e.data) return;
        e.preventDefault();
        trocar(el, ini, fimSel, novo);
    }, true);

    document.addEventListener('compositionend', function (e) {
        const el = e.target;
        if (ANDROID || !ehCampoTexto(el) || ehMoeda(el)) return;
        if (typeof e.data !== 'string' || e.data === '') return;
        if (!M.aceitaMaiuscula(descreve(el))) return;
        let fimSel;
        try { fimSel = el.selectionEnd; } catch (x) { return; }
        const ini = fimSel - e.data.length;
        if (ini < 0 || el.value.slice(ini, fimSel) !== e.data) return;
        const novo = M.inserirCapitalizado(el.value.slice(0, ini), e.data);
        let k = 0;
        while (k < novo.length && novo[k] === e.data[k]) k++;
        if (k >= novo.length) return;
        trocar(el, ini + k, ini + k + 1, novo[k]);
        try { el.setSelectionRange(fimSel, fimSel); } catch (x) { }
    }, true);

    document.addEventListener('input', function (e) {
        const el = e.target;
        if (ehCampoTexto(el) && ehMoeda(el)) aplicarMoeda(el, e);
    }, true);

    document.addEventListener('focusout', function (e) {
        const el = e.target;
        if (!el || !el.dataset || el.dataset.moeda === undefined || el.value === '') return;
        const n = M.lerMoeda(el.value);
        const f = n === null ? '' : M.formatarMoeda(n);
        if (f !== el.value) el.value = f;
    }, true);

    window.lerCampoMoeda = function (x) {
        const el = elDe(x);
        return el ? M.lerMoeda(el.value) : null;
    };
    window.definirCampoMoeda = function (x, n) {
        const el = elDe(x);
        if (el) el.value = M.formatarMoeda(n);
    };
})();
