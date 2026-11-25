'use strict';
// Mascaras globais por delegacao no document: valem para campos criados depois, sem registro.
//  - [data-moeda]: mascara de moeda brasileira (digitos viram centavos).
//  - maiuscula automatica nos campos de texto livre (ver MascarasCore.aceitaMaiuscula).
(function () {
    const M = window.MascarasCore;
    if (!M) return;

    function elDe(x) { return typeof x === 'string' ? document.getElementById(x) : x; }
    function descreve(el) {
        return { tag: el.tagName, type: el.getAttribute('type'), id: el.id, name: el.name,
            autocomplete: el.getAttribute('autocomplete'), inputmode: el.getAttribute('inputmode'), dataset: el.dataset };
    }
    function fim(el) { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { } }

    function aplicarMoeda(el, e) {
        const v = el.value;
        const colou = e && (!e.isTrusted || /^insertFrom/.test(e.inputType || '') || (e.data && e.data.length > 1));
        let novo;
        if (colou && /[.,]/.test(v) && M.lerMoeda(v) !== null) novo = M.formatarMoeda(M.lerMoeda(v));
        else novo = M.formatarMoedaDigitos(v);
        if (novo !== v) el.value = novo;
        fim(el);
    }

    function aplicarMaiuscula(el) {
        if (!M.aceitaMaiuscula(descreve(el))) return;
        let ini = null, fimSel = null;
        try { ini = el.selectionStart; fimSel = el.selectionEnd; } catch (e) { }
        const r = M.capitalizar(el.value, ini);
        if (r.texto === el.value) return;
        el.value = r.texto;
        try { if (ini != null) el.setSelectionRange(ini, fimSel); } catch (e) { }
    }

    document.addEventListener('input', function (e) {
        const el = e.target;
        if (!el || !el.tagName) return;
        if (el.dataset && el.dataset.moeda !== undefined) { aplicarMoeda(el, e); return; }
        if (!e.isTrusted || e.isComposing || !e.inputType) return;
        aplicarMaiuscula(el);
    }, true);

    document.addEventListener('compositionend', function (e) {
        const el = e.target;
        if (!el || !el.tagName) return;
        if (el.dataset && el.dataset.moeda !== undefined) return;
        aplicarMaiuscula(el);
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
