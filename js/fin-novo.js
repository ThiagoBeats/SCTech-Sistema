'use strict';
// Telas do Financeiro novo (Resumo, Lancamentos, Fluxo de caixa, DRE). Carregado depois de app.js.
// Resumo (Task 6) e Lancamentos (Task 5) ainda nao tem a tela nova: ate la, o Resumo mostra o aviso
// e Lancamentos mostra as listas de sempre (Contas a pagar, Contas a receber, Recorrencias).

const FIN_EM_CONSTRUCAO = 'Em construção: chega na próxima atualização.';

function _finEmConstrucao(id, titulo) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<h3 style="margin-bottom:8px">${titulo}</h3><p style="color:var(--muted,#8F8F8F)">${FIN_EM_CONSTRUCAO}</p>`;
}

// Ponto de entrada da Task 6 (Resumo).
function renderFinResumo() {
    _finEmConstrucao('fin-resumo-conteudo', 'Resumo');
}

function renderFinFluxoProvisorio() {
    _finEmConstrucao('fin-fluxo-conteudo', 'Fluxo de caixa');
}

function renderFinDreProvisorio() {
    _finEmConstrucao('fin-dre-conteudo', 'DRE');
}

// Lados do Lancamentos e a permissao de cada um.
const FIN_LADOS = { pagar: 'financeiro.pagar', receber: 'financeiro.receber', fixas: 'financeiro.fixas' };
let _finLado = '';

// Ponto de entrada da Task 5 (Lancamentos). `lado`: 'pagar' | 'receber' | 'fixas'; sem ele, o ultimo
// aberto (ou o primeiro que o usuario pode ver).
function renderFinLancamentos(lado) {
    const permitidos = Object.keys(FIN_LADOS).filter(l => temAcesso(FIN_LADOS[l], 'visualizar'));
    if (!permitidos.length) return;
    if (!permitidos.includes(lado)) lado = permitidos.includes(_finLado) ? _finLado : permitidos[0];
    _finLado = lado;
    document.querySelectorAll('.fin-lado-btn').forEach(b => {
        const ok = permitidos.includes(b.dataset.lado);
        b.style.display = ok ? '' : 'none';
        b.classList.toggle('active', b.dataset.lado === lado);
        b.classList.toggle('btn-primary', b.dataset.lado === lado);
        b.classList.toggle('btn-outline', b.dataset.lado !== lado);
    });
    Object.keys(FIN_LADOS).forEach(l => {
        const p = document.getElementById('fin-' + l);
        if (p) p.style.display = l === lado ? '' : 'none';
    });
    if (lado === 'receber') renderContasReceber();
    else if (lado === 'pagar') renderContasPagar();
    else renderDespesasFixas();
}
