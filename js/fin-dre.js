'use strict';
// Tela DRE do Financeiro novo: tabela anual com grupos expansiveis, regime Caixa/Competencia, detalhe
// dos lancamentos de uma categoria e cadastro de categorias. Os numeros vem todos do DreCore (aqui so montagem).
// Carregado depois de fin-novo.js.

const finDre = { regime: 'caixa', ano: null, abertos: new Set() };

const _dreMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const _dreInt = v => Math.round(Number(v) || 0) || 0;
const _dreMilhar = n => Math.abs(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

function _dreAnosComDados() {
    const anos = new Set([Number(hojeLocal().slice(0, 4))]);
    const add = d => { if (d && /^\d{4}/.test(String(d))) anos.add(Number(String(d).slice(0, 4))); };
    [db.contas_receber, db.contas_pagar].forEach(l => (l || []).forEach(r => { if (r) { add(r.data_competencia); add(r.data_vencimento); add(r.data_pagamento); } }));
    (db.movimentos_fin || []).forEach(m => { if (m) add(m.data); });
    if (finDre.ano) anos.add(finDre.ano);
    return [...anos].sort((a, b) => a - b);
}

function _dreParams(de, ate, intervalo) {
    const fc = db.fin_categorias || {};
    return { regime: finDre.regime, de, ate, intervalo, contas_receber: db.contas_receber || [], contas_pagar: db.contas_pagar || [],
        movimentos: db.movimentos_fin || [], contas: getContasFin(), categorias: fc.categorias, subgrupos: fc.subgrupos };
}

// A tabela exibida (mensal, ano escolhido); usada tambem pelos exportadores.
function finDreTabelaAtual() {
    if (!finDre.ano) finDre.ano = Number(hojeLocal().slice(0, 4));
    return DreCore.tabela(_dreParams(finDre.ano + '-01-01', finDre.ano + '-12-31', 'mensal'));
}

// Valor da celula: inteiro com milhar; negativo ou saida entre parenteses; vermelho.
function finDreFormatarValor(v, sinal) {
    const n = _dreInt(v);
    if (n === 0) return { txt: '0', neg: false };
    const par = sinal === 'saida' ? n > 0 : n < 0;
    return { txt: par ? '(' + _dreMilhar(n) + ')' : _dreMilhar(n), neg: par };
}

function _dreLinhasVisiveis(tab) {
    const porChave = new Map(tab.linhas.map(l => [l.chave, l]));
    const visivel = l => !l.pai || (finDre.abertos.has(l.pai) && visivel(porChave.get(l.pai)));
    return tab.linhas.filter(visivel);
}

function _dreCelula(l, v, i, ehTotal) {
    if (l.tipo === 'percentual') {
        return `<td class="dre-num dre-pct">${v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'}</td>`;
    }
    const f = finDreFormatarValor(v, l.sinal);
    const clicavel = l.tipo === 'categoria' && (Number(v) || 0) !== 0;
    return `<td class="dre-num${f.neg ? ' dre-neg' : ''}${clicavel ? ' dre-clicavel' : ''}${ehTotal ? ' dre-total' : ''}"${clicavel ? ` data-chave="${escapeHtml(l.chave)}" data-i="${ehTotal ? -1 : i}" tabindex="0" role="button"` : ''}>${f.txt}</td>`;
}

function _dreTabelaHtml(tab) {
    const filhos = new Set(tab.linhas.filter(l => l.pai).map(l => l.pai));
    const cab = tab.periodos.map(p => `<th class="dre-num">${escapeHtml(p.rotulo)}</th>`).join('');
    const corpo = _dreLinhasVisiveis(tab).map(l => {
        const aberto = finDre.abertos.has(l.chave);
        const tg = filhos.has(l.chave)
            ? `<button type="button" class="dre-tg" data-tg="${escapeHtml(l.chave)}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'} ${escapeHtml(l.rotulo)}">${aberto ? '−' : '+'}</button>`
            : '<span class="dre-tg dre-tg-vazio"></span>';
        const rotulo = escapeHtml(l.rotulo) + (l.inativa ? ' <span class="lanc-sub">(inativa)</span>' : '');
        return `<tr class="dre-l dre-${l.tipo}${l.chave === 'liquido' ? ' dre-liquido' : ''}" data-chave="${escapeHtml(l.chave)}">
            <th scope="row" class="dre-rot" style="padding-left:${8 + l.nivel * 18}px">${tg}${rotulo}</th>
            ${l.valores.map((v, i) => _dreCelula(l, v, i, false)).join('')}${_dreCelula(l, l.total, tab.periodos.length, true)}</tr>`;
    }).join('');
    return `<div class="dre-quadro"><table class="dre-tabela" id="dre-tabela">
        <thead><tr><th class="dre-rot">RESULTADO</th>${cab}<th class="dre-num dre-total">Total ${finDre.ano}</th></tr></thead>
        <tbody>${corpo}</tbody></table></div>`;
}

function renderFinDre() {
    const alvo = document.getElementById('fin-dre-conteudo');
    if (!alvo) return;
    if (!finDre.ano) finDre.ano = Number(hojeLocal().slice(0, 4));
    const tab = finDreTabelaAtual();
    const anos = _dreAnosComDados();
    const reg = (v, t) => `<button type="button" class="dre-seg-btn${finDre.regime === v ? ' active' : ''}" id="dre-regime-${v}" aria-pressed="${finDre.regime === v}" onclick="finDreMudarRegime('${v}')">${t}</button>`;
    alvo.innerHTML = `<div class="dre-topo"><h3>DRE — Resultado da empresa</h3>
        <div class="dre-acoes">
            <button class="btn btn-outline btn-sm" id="dre-btn-relatorios" onclick="abrirRelatoriosDre()">Relatórios</button>
            <button class="btn btn-outline btn-sm" id="dre-btn-pdf" onclick="exportarDrePdf()">PDF</button>
            <button class="btn btn-outline btn-sm" id="dre-btn-excel" onclick="exportarDreExcel()">Excel</button>
            <button class="btn btn-outline btn-sm" id="dre-btn-imprimir" onclick="imprimirDre()">Imprimir</button>
            ${temAcesso('financeiro.dre', 'completo') ? '<button class="btn btn-outline btn-sm" id="dre-btn-categorias" onclick="abrirCategoriasDre()">Categorias</button>' : ''}
        </div></div>
        <div class="lanc-barra dre-barra">
            <div class="form-group"><label>Regime</label><div class="dre-seg" role="group" aria-label="Regime">${reg('caixa', 'Caixa')}${reg('competencia', 'Competência')}</div></div>
            <div class="form-group"><label for="dre-ano">Ano</label><select id="dre-ano" onchange="finDreMudarAno(this.value)">${anos.map(a => `<option value="${a}"${a === finDre.ano ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
        </div>
        ${_dreTabelaHtml(tab)}
        <p class="lanc-sub" style="margin-top:8px">Clique em + para abrir o grupo e no valor de uma categoria para ver os lançamentos.</p>`;
    const tb = document.getElementById('dre-tabela');
    tb.addEventListener('click', e => {
        const tg = e.target.closest('[data-tg]');
        if (tg) { finDreAlternar(tg.dataset.tg); return; }
        const c = e.target.closest('td[data-chave]');
        if (c) abrirDetalheDre(c.dataset.chave, Number(c.dataset.i));
    });
    tb.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const c = e.target.closest('td[data-chave]');
        if (c) { e.preventDefault(); abrirDetalheDre(c.dataset.chave, Number(c.dataset.i)); }
    });
}

function finDreAlternar(chave) {
    if (finDre.abertos.has(chave)) {
        // recolher o grupo tambem recolhe o que estava aberto dentro dele
        const tab = finDreTabelaAtual();
        const desc = c => tab.linhas.filter(l => l.pai === c).forEach(l => { finDre.abertos.delete(l.chave); desc(l.chave); });
        finDre.abertos.delete(chave); desc(chave);
    } else finDre.abertos.add(chave);
    renderFinDre();
}
function finDreMudarRegime(r) { finDre.regime = r === 'competencia' ? 'competencia' : 'caixa'; renderFinDre(); }
function finDreMudarAno(a) { finDre.ano = Number(a) || Number(hojeLocal().slice(0, 4)); renderFinDre(); }

// Stubs: a Task 3 (relatorios e exportacao) substitui estas funcoes.
function abrirRelatoriosDre() { toast('Em breve.', 'info'); }
function exportarDrePdf() { toast('Em breve.', 'info'); }
function exportarDreExcel() { toast('Em breve.', 'info'); }
function imprimirDre() { toast('Em breve.', 'info'); }

// ===================== DETALHE (lancamentos de uma categoria num periodo) =====================
function abrirDetalheDre(chave, indice) {
    const tab = finDreTabelaAtual();
    const linha = tab.linhas.find(l => l.chave === chave);
    if (!linha || linha.tipo !== 'categoria') return;
    const total = indice < 0 || indice >= tab.periodos.length;
    const per = total ? { de: finDre.ano + '-01-01', ate: finDre.ano + '-12-31' } : tab.periodos[indice];
    const calc = DreCore.calcular(_dreParams(per.de, per.ate));
    const itens = (calc.lancamentos[linha.id] || []).slice().sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
    const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dataBr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
    const periodoTxt = total ? String(finDre.ano) : _dreMeses[Number(per.de.slice(5, 7)) - 1] + '/' + per.de.slice(0, 4);
    const soma = itens.reduce((t, i) => t + (Number(i.valor) || 0), 0);
    const linhasHtml = itens.map(i => {
        const r = (i.tipo === 'cp' ? db.contas_pagar : db.contas_receber).find(x => String(x.id) === String(i.id)) || {};
        return `<tr class="dre-det-linha" data-tipo="${i.tipo}" data-id="${escapeHtml(String(i.id))}" style="cursor:pointer">
            <td>${dataBr(i.data)}</td><td>${escapeHtml(r.descricao || '—')}</td><td>${escapeHtml(_finPessoaDe(r) || '—')}</td><td style="text-align:right;white-space:nowrap">R$ ${brl(i.valor)}</td></tr>`;
    }).join('');
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.id = 'dre-detalhe-overlay';
    o.innerHTML = `<div class="modal-box" style="max-width:720px">
        <div class="modal-header"><h3>${escapeHtml(linha.rotulo)} — ${escapeHtml(periodoTxt)}</h3>
            <button class="modal-close" aria-label="Fechar" onclick="this.closest('.modal-overlay').remove()">×</button></div>
        <div class="modal-body"><div class="lanc-tabela"><table class="table" style="width:100%"><thead><tr><th>Data</th><th>Descrição</th><th>Pessoa</th><th style="text-align:right">Valor</th></tr></thead>
            <tbody id="dre-det-corpo">${linhasHtml || '<tr><td colspan="4" class="lanc-sub">Nenhum lançamento.</td></tr>'}</tbody></table></div>
            <div class="lanc-rodape"><span class="lanc-sub">Clique numa linha para abrir o lançamento.</span><strong id="dre-det-total">Total: R$ ${brl(soma)}</strong></div></div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => {
        if (e.target === o) { o.remove(); return; }
        const tr = e.target.closest('tr.dre-det-linha');
        if (tr) { const t = tr.dataset.tipo, id = tr.dataset.id; o.remove(); abrirLancamentoNaLista(t, id); }
    });
}

// ===================== CATEGORIAS (cadastro) =====================
const _dreGruposCat = [['receitas', 'Receitas'], ['custos', 'Custos'], ['despesas', 'Despesas'], ['investimento', 'Investimento'], ['financiamento', 'Financiamento'], ['so_caixa', 'Só caixa']];
const _dreGrupoDe = c => c.natureza === 'so_caixa' ? 'so_caixa' : c.grupo;
const _dreComSub = g => g === 'receitas' || g === 'custos' || g === 'despesas';

function _dreCatUsada(id) {
    id = String(id);
    const por = (lista, lado) => (lista || []).some(r => r && ((r.categoria_id != null && r.categoria_id !== '') ? String(r.categoria_id) === id : FinCatCore.categoriaDoLegado(r, lado) === id));
    return por(db.contas_receber, 'receber') || por(db.contas_pagar, 'pagar') || (db.despesas_fixas || []).some(d => d && String(d.categoria_id) === id);
}

function _dreGravarCat() {
    _gravarChaves(['sc_fin_cat']);
    const p = document.getElementById('fin-dre');
    if (p && p.classList.contains('active')) renderFinDre();
    _dreCatRender();
}

function _dreAvisoCat(msg) {
    const a = document.getElementById('dre-cat-aviso');
    if (!a) return;
    a.textContent = msg || '';
    a.style.display = msg ? '' : 'none';
}

function _dreNomeRepetido(nome, grupo, ignorarId) {
    const n = _finNorm(nome);
    return db.fin_categorias.categorias.some(c => String(c.id) !== String(ignorarId) && _dreGrupoDe(c) === grupo && _finNorm(c.nome) === n);
}

function _dreProximoId(prefixo, lista) {
    const usados = new Set(lista.map(x => String(x.id)));
    let n = 1;
    while (usados.has(prefixo + n)) n++;
    return prefixo + n;
}

function abrirCategoriasDre() {
    if (!temAcesso('financeiro.dre', 'completo')) return;
    if (document.getElementById('dre-cat-overlay')) return;
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.id = 'dre-cat-overlay';
    o.innerHTML = `<div class="modal-box" style="max-width:760px">
        <div class="modal-header"><h3>Categorias da DRE</h3><button class="modal-close" aria-label="Fechar" onclick="this.closest('.modal-overlay').remove()">×</button></div>
        <div class="modal-body">
            <div id="dre-cat-aviso" class="lanc-aviso" style="display:none" role="alert"></div>
            <div class="lanc-acoes"><button class="btn btn-outline btn-sm" id="dre-btn-nova-cat" onclick="finDreFormCat('cat')">+ Nova categoria</button>
                <button class="btn btn-outline btn-sm" id="dre-btn-novo-sub" onclick="finDreFormCat('sub')">+ Novo subgrupo</button></div>
            <div id="dre-cat-form"></div>
            <div id="dre-cat-lista"></div>
        </div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o) o.remove(); });
    _dreCatRender();
}

function _dreCatRender() {
    const el = document.getElementById('dre-cat-lista');
    if (!el) return;
    const fc = db.fin_categorias;
    el.innerHTML = _dreGruposCat.map(([g, rotulo]) => {
        const cats = fc.categorias.filter(c => _dreGrupoDe(c) === g);
        const subs = fc.subgrupos.filter(s => s.grupo === g);
        const linhas = cats.map(c => {
            const usada = _dreCatUsada(c.id);
            const sel = _dreComSub(g) ? `<select class="dre-cat-sub" aria-label="Subgrupo de ${escapeHtml(c.nome)}" data-id="${escapeHtml(String(c.id))}"><option value="">— sem subgrupo —</option>${subs.map(s => `<option value="${escapeHtml(String(s.id))}"${s.id === c.subgrupo_id ? ' selected' : ''}>${escapeHtml(s.nome)}</option>`).join('')}</select>` : '';
            return `<div class="dre-cat-linha${c.ativo === false ? ' dre-cat-inativa' : ''}" data-id="${escapeHtml(String(c.id))}">
                <input type="text" class="dre-cat-nome" aria-label="Nome da categoria" value="${escapeHtml(c.nome)}" data-id="${escapeHtml(String(c.id))}">
                ${sel}
                <span class="lanc-sub">${c.tipo === 'entrada' ? 'Entrada' : 'Saída'}${c.ativo === false ? ' · inativa' : ''}</span>
                <button type="button" class="btn btn-outline btn-sm dre-cat-ativo" data-id="${escapeHtml(String(c.id))}">${c.ativo === false ? 'Ativar' : 'Desativar'}</button>
                ${!usada && !c.padrao ? `<button type="button" class="btn btn-outline btn-sm dre-cat-excluir" data-id="${escapeHtml(String(c.id))}">Excluir</button>` : ''}
            </div>`;
        }).join('') || '<p class="lanc-sub">Nenhuma categoria.</p>';
        return `<div class="dre-cat-grupo" data-grupo="${g}"><h4>${rotulo}</h4>${linhas}</div>`;
    }).join('');
    el.onchange = e => {
        const t = e.target;
        if (t.classList.contains('dre-cat-nome')) finDreRenomear(t.dataset.id, t.value, t);
        else if (t.classList.contains('dre-cat-sub')) finDreMoverSub(t.dataset.id, t.value);
    };
    el.onclick = e => {
        const b = e.target.closest('button[data-id]');
        if (!b) return;
        if (b.classList.contains('dre-cat-ativo')) finDreAtivar(b.dataset.id);
        else if (b.classList.contains('dre-cat-excluir')) finDreExcluirCat(b.dataset.id);
    };
}

const _dreCat = id => db.fin_categorias.categorias.find(c => String(c.id) === String(id));

function finDreRenomear(id, nome, input) {
    const c = _dreCat(id);
    nome = String(nome || '').trim();
    if (!c) return;
    if (!nome) { _dreAvisoCat('Informe o nome da categoria.'); if (input) input.value = c.nome; return; }
    if (_dreNomeRepetido(nome, _dreGrupoDe(c), c.id)) { _dreAvisoCat('Já existe uma categoria com esse nome neste grupo.'); if (input) input.value = c.nome; return; }
    _dreAvisoCat('');
    c.nome = nome;
    _dreGravarCat();
}
function finDreMoverSub(id, subId) {
    const c = _dreCat(id);
    if (!c) return;
    c.subgrupo_id = subId || null;
    _dreAvisoCat('');
    _dreGravarCat();
}
function finDreAtivar(id) {
    const c = _dreCat(id);
    if (!c) return;
    c.ativo = c.ativo === false;
    _dreAvisoCat('');
    _dreGravarCat();
}
function finDreExcluirCat(id) {
    const c = _dreCat(id);
    if (!c || c.padrao || _dreCatUsada(id)) return;
    db.fin_categorias.categorias = db.fin_categorias.categorias.filter(x => String(x.id) !== String(id));
    _dreAvisoCat('');
    _dreGravarCat();
}

function finDreFormCat(modo) {
    const f = document.getElementById('dre-cat-form');
    if (!f) return;
    _dreAvisoCat('');
    if (modo === 'sub') {
        f.innerHTML = `<div class="lanc-opcoes" style="margin-bottom:12px"><div class="grid">
            <div class="form-group"><label>Nome do subgrupo <span style="color:#F43927">*</span></label><input type="text" id="dre-ns-nome"></div>
            <div class="form-group"><label>Grupo <span style="color:#F43927">*</span></label><select id="dre-ns-grupo"><option value="despesas">Despesas</option><option value="custos">Custos</option><option value="receitas">Receitas</option></select></div></div>
            <div><button class="btn btn-success btn-sm" id="dre-ns-salvar" onclick="finDreSalvarSub()">Adicionar subgrupo</button></div></div>`;
        document.getElementById('dre-ns-nome').focus();
        return;
    }
    f.innerHTML = `<div class="lanc-opcoes" style="margin-bottom:12px"><div class="grid">
        <div class="form-group"><label>Nome <span style="color:#F43927">*</span></label><input type="text" id="dre-nc-nome"></div>
        <div class="form-group"><label>Grupo <span style="color:#F43927">*</span></label><select id="dre-nc-grupo" onchange="finDreAjustarForm()">${_dreGruposCat.map(([g, r]) => `<option value="${g}"${g === 'despesas' ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="form-group"><label>Subgrupo</label><select id="dre-nc-sub"></select></div>
        <div class="form-group"><label>Tipo</label><select id="dre-nc-tipo"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></div></div>
        <div><button class="btn btn-success btn-sm" id="dre-nc-salvar" onclick="finDreSalvarCat()">Adicionar categoria</button></div></div>`;
    finDreAjustarForm();
    document.getElementById('dre-nc-nome').focus();
}

// Subgrupos do grupo escolhido e tipo (receitas = entrada; custos/despesas = saida; os demais escolhem).
function finDreAjustarForm() {
    const g = document.getElementById('dre-nc-grupo').value;
    const sub = document.getElementById('dre-nc-sub'), tipo = document.getElementById('dre-nc-tipo');
    const subs = db.fin_categorias.subgrupos.filter(s => s.grupo === g);
    sub.innerHTML = '<option value="">— sem subgrupo —</option>' + subs.map(s => `<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.nome)}</option>`).join('');
    sub.disabled = !_dreComSub(g);
    if (g === 'receitas') tipo.value = 'entrada';
    else if (g === 'custos' || g === 'despesas') tipo.value = 'saida';
    tipo.disabled = _dreComSub(g);
}

function finDreSalvarCat() {
    const v = id => document.getElementById(id).value;
    const nome = v('dre-nc-nome').trim(), g = v('dre-nc-grupo');
    if (!nome) { _dreAvisoCat('Informe o nome da categoria.'); return; }
    if (_dreNomeRepetido(nome, g, null)) { _dreAvisoCat('Já existe uma categoria com esse nome neste grupo.'); return; }
    const soCaixa = g === 'so_caixa';
    const tipo = g === 'receitas' ? 'entrada' : (g === 'custos' || g === 'despesas') ? 'saida' : v('dre-nc-tipo');
    const fc = db.fin_categorias;
    fc.categorias.push({ id: _dreProximoId('cat_u', fc.categorias), nome, grupo: soCaixa ? null : g, subgrupo_id: _dreComSub(g) ? (v('dre-nc-sub') || null) : null,
        tipo, natureza: soCaixa ? 'so_caixa' : 'dre', padrao: false, ativo: true });
    document.getElementById('dre-cat-form').innerHTML = '';
    _dreAvisoCat('');
    _dreGravarCat();
}

function finDreSalvarSub() {
    const nome = document.getElementById('dre-ns-nome').value.trim(), g = document.getElementById('dre-ns-grupo').value;
    if (!nome) { _dreAvisoCat('Informe o nome do subgrupo.'); return; }
    const fc = db.fin_categorias;
    if (fc.subgrupos.some(s => s.grupo === g && _finNorm(s.nome) === _finNorm(nome))) { _dreAvisoCat('Já existe um subgrupo com esse nome neste grupo.'); return; }
    fc.subgrupos.push({ id: _dreProximoId('sub_u', fc.subgrupos), nome, grupo: g });
    document.getElementById('dre-cat-form').innerHTML = '';
    _dreAvisoCat('');
    _dreGravarCat();
}
