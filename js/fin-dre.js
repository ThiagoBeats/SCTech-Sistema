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

function _dreParams(de, ate, intervalo, regime) {
    const fc = db.fin_categorias || {};
    return { regime: regime || finDre.regime, de, ate, intervalo, contas_receber: db.contas_receber || [], contas_pagar: db.contas_pagar || [],
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

// ===================== RELATORIOS (Analise Vertical / Horizontal) e EXPORTACAO =====================
const finRel = { tipo: 'vertical', regime: 'caixa', intervalo: 'mensal', de: '', ate: '', abertos: new Set() };

const _dreFmt = (n, dec) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const _dreR1 = n => Math.round(n * 10) / 10 || 0;
const _dreR2 = n => Math.round(n * 100) / 100 || 0;
const _dreDataBr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);

// Monta as celulas (texto, cor e numero para o Excel) de uma tabela, para a tela, a impressao e o Excel.
// modo: 'dre' (valores + Total) | 'vertical' (valor + AV%) | 'horizontal' (valor + AH% a partir do 2o periodo)
function _dreCelulas(modo, tab, rotuloTotal) {
    const av = modo === 'vertical' ? DreCore.analiseVertical(tab) : null;
    const ah = modo === 'horizontal' ? DreCore.analiseHorizontal(tab) : null;
    const cab = [];
    tab.periodos.forEach((p, i) => {
        cab.push({ grupo: p.rotulo, sub: modo === 'dre' ? '' : 'valor', plano: p.rotulo });
        if (modo === 'vertical') cab.push({ grupo: p.rotulo, sub: 'AV%', plano: p.rotulo + ' AV%', pct: true });
        else if (modo === 'horizontal' && i > 0) cab.push({ grupo: p.rotulo, sub: 'AH%', plano: p.rotulo + ' AH%', pct: true });
    });
    if (modo === 'dre') cab.push({ grupo: rotuloTotal, sub: '', plano: rotuloTotal, total: true });
    const valor = (l, v, i, total) => {
        if (l.tipo === 'percentual') return { txt: v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%', num: v == null ? null : _dreR1(v), pct: true, i };
        const f = finDreFormatarValor(v, l.sinal);
        const clicavel = l.tipo === 'categoria' && (Number(v) || 0) !== 0 && !total;
        return { txt: f.txt, neg: f.neg, num: _dreR2((l.sinal === 'saida' ? -1 : 1) * (Number(v) || 0)), i, clicavel, total };
    };
    const linhas = tab.linhas.map(l => {
        const cel = [];
        tab.periodos.forEach((p, i) => {
            cel.push(valor(l, l.valores[i], i));
            if (av) { const a = av[l.chave][i]; cel.push({ txt: a == null ? '—' : _dreFmt(a, 1) + '%', num: a == null ? null : _dreR1(a), pct: true }); }
            else if (ah && i > 0) {
                const a = ah[l.chave][i];
                const base = a.pct == null ? '—' : a.acima999 ? '> 999%' : (a.pct > 0 ? '+' : '') + _dreFmt(a.pct, 2) + '%';
                const seta = a.pct == null ? '' : a.seta === 'up' ? '↑ ' : a.seta === 'down' ? '↓ ' : '';
                cel.push({ txt: seta + base, num: a.pct == null ? null : _dreR1(a.pct), pct: true, fav: a.pct == null ? null : a.favoravel });
            }
        });
        if (modo === 'dre') cel.push(valor(l, l.total, tab.periodos.length, true));
        return { l, cel };
    });
    return { cab, linhas };
}

// Matriz para o Excel: todas as categorias expandidas, numeros como numero (saidas negativas).
function _dreMatrizExcel(modo, tab, rotuloTotal) {
    const { cab, linhas } = _dreCelulas(modo, tab, rotuloTotal);
    const aoa = [['RESULTADO'].concat(cab.map(c => c.plano))];
    aoa.pctCel = [];
    linhas.forEach(({ l, cel }) => {
        cel.forEach((c, j) => { if (c.pct && c.num != null) aoa.pctCel.push([aoa.length, j + 1]); });
        aoa.push([' '.repeat(l.nivel * 2) + l.rotulo + (l.inativa ? ' (inativa)' : '')].concat(cel.map(c => c.num == null ? '' : c.num)));
    });
    return aoa;
}

// Linhas de apresentacao no topo: empresa, titulo, regime, periodo, linha em branco; e a nota no fim.
function _dreComCabecalhoExcel(aoa, titulo, regime, periodoTxt) {
    const emp = getEmpresa();
    const r = [[emp.nome_fantasia || emp.razao_social || 'SCTech'], [titulo], ['Regime: ' + regime], ['Período: ' + periodoTxt], []].concat(aoa, [['Saídas em negativo.']]);
    r.pctCel = (aoa.pctCel || []).map(([a, b]) => [a + 5, b]);
    return r;
}

async function _dreBaixarExcel(nome, aba, aoa) {
    try { await garantirSheetJs('o gerador de planilhas'); }
    catch (e) { toast(e.message, 'error', 5000); return; }
    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // percentuais com 1 casa decimal no formato da celula
        if (XLSX.utils.encode_cell) (aoa.pctCel || []).forEach(([r, c]) => { const cel = ws[XLSX.utils.encode_cell({ r, c })]; if (cel) cel.z = '0.0'; });
        XLSX.utils.book_append_sheet(wb, ws, aba);
        XLSX.writeFile(wb, nome);
    } catch (e) { toast('Não foi possível gerar a planilha.', 'error', 5000); }
}

// Janela de impressao (documento claro, paisagem): empresa, titulo, linha de dados (html) e o corpo (html).
// Usada pela DRE e pelos relatorios do Fluxo de caixa.
function _dreAbrirImpressao(titulo, metaHtml, corpoHtml, dicaPdf) {
    const emp = getEmpresa();
    const nomeEmp = emp.nome_fantasia || emp.razao_social || 'SCTech';
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escapeHtml(titulo)}</title><style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; font-size: 11px; margin: 0; padding: 12px; }
        h1 { font-size: 16px; margin: 0; } h2 { font-size: 14px; margin: 10px 0 2px; }
        .meta { color: #555; margin-bottom: 8px; }
        table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid #ddd; padding: 3px 6px; } thead th { background: #E8EBEF; }
        .dica { background: #FFF8E1; border: 1px solid #F0D98A; padding: 6px 10px; margin-bottom: 10px; border-radius: 4px; }
        @media print { .no-print { display: none !important; } }
    </style></head><body><div class="doc-claro">
        ${dicaPdf ? `<div class="dica no-print">Escolha 'Salvar como PDF' na impressora.</div>` : ''}
        <h1>${escapeHtml(nomeEmp)}</h1>
        <h2>${escapeHtml(titulo)}</h2>
        <div class="meta">${metaHtml}</div>
        ${corpoHtml}
    </div><script>window.onload = function () { window.print(); };<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Permita pop-ups para imprimir.', 'info'); return; }
    w.document.write(html);
    w.document.close();
}

// Janela de impressao da DRE / analises: tabela toda expandida.
function _dreImprimir(titulo, regime, periodoTxt, modo, tab, rotuloTotal, dicaPdf) {
    const { cab, linhas } = _dreCelulas(modo, tab, rotuloTotal);
    const dois = modo !== 'dre';
    const th = (t, extra) => `<th style="text-align:right;${extra || ''}">${escapeHtml(t)}</th>`;
    let h1 = '<th rowspan="' + (dois ? 2 : 1) + '" style="text-align:left">RESULTADO</th>', h2 = '';
    if (dois) {
        const por = []; cab.forEach(c => { if (!por.length || por[por.length - 1].g !== c.grupo) por.push({ g: c.grupo, n: 0 }); por[por.length - 1].n++; });
        h1 += por.map(g => `<th colspan="${g.n}" style="text-align:center">${escapeHtml(g.g)}</th>`).join('');
        h2 = '<tr>' + cab.map(c => th(c.sub)).join('') + '</tr>';
    } else h1 += cab.map(c => th(c.grupo)).join('');
    const corpo = linhas.map(({ l, cel }) => {
        const forte = l.tipo === 'grupo' || l.tipo === 'calculada';
        const tds = cel.map(c => {
            const cor = c.neg || c.fav === false ? '#C0392B' : c.fav === true ? '#1E8449' : '';
            return `<td style="text-align:right;white-space:nowrap;${cor ? 'color:' + cor + ';' : ''}">${escapeHtml(c.txt)}</td>`;
        }).join('');
        return `<tr style="${forte ? 'font-weight:700;background:#F0F2F5;' : ''}${l.chave === 'liquido' ? 'background:#E3F4E6;' : ''}"><td style="padding-left:${6 + l.nivel * 16}px">${escapeHtml(l.rotulo)}${l.inativa ? ' (inativa)' : ''}</td>${tds}</tr>`;
    }).join('');
    _dreAbrirImpressao(titulo, `Regime: ${escapeHtml(regime)} &nbsp;·&nbsp; Período: ${escapeHtml(periodoTxt)}`,
        `<table><thead><tr>${h1}</tr>${h2}</thead><tbody>${corpo}</tbody></table>`, dicaPdf);
}

const _dreNomeRegime = r => r === 'competencia' ? 'Competência' : 'Caixa';

// ---- DRE (tela principal): tabela do ano com todas as categorias expandidas ----
function _dreImprimirAtual(dica) {
    if (!finDre.ano) finDre.ano = Number(hojeLocal().slice(0, 4));
    _dreImprimir('DRE — Resultado da empresa', _dreNomeRegime(finDre.regime), '01/01/' + finDre.ano + ' a 31/12/' + finDre.ano, 'dre', finDreTabelaAtual(), 'Total ' + finDre.ano, dica);
}
function exportarDrePdf() { _dreImprimirAtual(true); }
function imprimirDre() { _dreImprimirAtual(false); }
function exportarDreExcel() {
    if (!finDre.ano) finDre.ano = Number(hojeLocal().slice(0, 4));
    return _dreBaixarExcel('DRE_' + finDre.regime + '_' + finDre.ano + '.xlsx', 'DRE', _dreComCabecalhoExcel(_dreMatrizExcel('dre', finDreTabelaAtual(), 'Total ' + finDre.ano), 'DRE — Resultado da empresa', _dreNomeRegime(finDre.regime), '01/01/' + finDre.ano + ' a 31/12/' + finDre.ano));
}

// ---- Relatorios ----
function _dreRelTabela() {
    return DreCore.tabela(_dreParams(finRel.de, finRel.ate, finRel.intervalo, finRel.regime));
}
const _dreRelTitulo = () => finRel.tipo === 'horizontal' ? 'Análise Horizontal' : 'Análise Vertical';

function abrirRelatoriosDre() {
    const hoje = hojeLocal();
    Object.assign(finRel, { tipo: 'vertical', regime: finDre.regime, intervalo: 'mensal', de: hoje.slice(0, 4) + '-01-01', ate: hoje, abertos: new Set() });
    const antigo = document.getElementById('dre-rel-overlay');
    if (antigo) antigo.remove();
    const o = document.createElement('div');
    o.id = 'dre-rel-overlay';
    o.className = 'dre-rel';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-label', 'Relatórios da DRE');
    o.tabIndex = -1;
    const reg = (v, t) => `<button type="button" class="dre-seg-btn" id="dre-rel-regime-${v}" aria-pressed="false" onclick="finRelMudar('regime','${v}')">${t}</button>`;
    const tip = (v, t) => `<button type="button" class="dre-seg-btn" id="dre-rel-tipo-${v}" aria-pressed="false" onclick="finRelMudar('tipo','${v}')">${t}</button>`;
    const ints = [['mensal', 'Mensal'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'], ['anual', 'Anual'], ['personalizado', 'Personalizado']];
    o.innerHTML = `<div class="dre-rel-caixa">
        <div class="dre-topo"><h3 id="dre-rel-titulo"></h3>
            <div class="dre-acoes">
                <button class="btn btn-outline btn-sm" id="dre-rel-pdf" onclick="exportarRelatorioDrePdf()">PDF</button>
                <button class="btn btn-outline btn-sm" id="dre-rel-excel" onclick="exportarRelatorioDreExcel()">Excel</button>
                <button class="btn btn-outline btn-sm" id="dre-rel-imprimir" onclick="imprimirRelatorioDre()">Imprimir</button>
                <button class="btn btn-outline btn-sm" id="dre-rel-fechar" onclick="_dreRelFechar(true)">Fechar</button>
            </div></div>
        <div class="lanc-barra dre-barra">
            <div class="form-group"><label>Tipo</label><div class="dre-seg" role="group" aria-label="Tipo">${tip('vertical', 'Vertical')}${tip('horizontal', 'Horizontal')}</div></div>
            <div class="form-group"><label>Visualizar por</label><div class="dre-seg" role="group" aria-label="Visualizar por">${reg('caixa', 'Caixa')}${reg('competencia', 'Competência')}</div></div>
            <div class="form-group"><label for="dre-rel-intervalo">Intervalo</label><select id="dre-rel-intervalo" onchange="finRelMudar('intervalo',this.value)">${ints.map(i => `<option value="${i[0]}">${i[1]}</option>`).join('')}</select></div>
            <div class="form-group"><label for="dre-rel-de">Período de</label><input type="date" id="dre-rel-de" value="${finRel.de}" onchange="finRelMudar('de',this.value)"></div>
            <div class="form-group"><label for="dre-rel-ate">até</label><input type="date" id="dre-rel-ate" value="${finRel.ate}" onchange="finRelMudar('ate',this.value)"></div>
        </div>
        <div id="dre-rel-corpo"></div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => {
        const tg = e.target.closest('[data-tg]');
        if (tg) { finRelAlternar(tg.dataset.tg); return; }
        const c = e.target.closest('td[data-chave]');
        if (c) _dreRelDetalhe(c.dataset.chave, Number(c.dataset.i));
    });
    o.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); _dreRelFechar(true); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const c = e.target.closest('td[data-chave]');
        if (c) { e.preventDefault(); _dreRelDetalhe(c.dataset.chave, Number(c.dataset.i)); }
    });
    _dreRelRender();
    o.focus();
}

// Fecha o relatorio; devolve o foco ao botao Relatorios quando pedido.
function _dreRelFechar(devolverFoco) {
    const o = document.getElementById('dre-rel-overlay');
    if (o) o.remove();
    const b = document.getElementById('dre-btn-relatorios');
    if (devolverFoco && b) b.focus();
}

function finRelMudar(campo, valor) {
    if (campo === 'tipo') finRel.tipo = valor === 'horizontal' ? 'horizontal' : 'vertical';
    else if (campo === 'regime') finRel.regime = valor === 'competencia' ? 'competencia' : 'caixa';
    else finRel[campo] = valor;
    _dreRelRender();
}

function finRelAlternar(chave) {
    if (finRel.abertos.has(chave)) {
        const tab = _dreRelTabela();
        const desc = c => tab.linhas.filter(l => l.pai === c).forEach(l => { finRel.abertos.delete(l.chave); desc(l.chave); });
        finRel.abertos.delete(chave); desc(chave);
    } else finRel.abertos.add(chave);
    _dreRelRender();
}

function _dreRelDetalhe(chave, indice) {
    abrirDetalheDre(chave, indice, { tab: _dreRelTabela(), regime: finRel.regime });
}

function _dreRelRender() {
    const corpo = document.getElementById('dre-rel-corpo');
    if (!corpo) return;
    document.getElementById('dre-rel-titulo').textContent = _dreRelTitulo();
    ['vertical', 'horizontal'].forEach(t => { const b = document.getElementById('dre-rel-tipo-' + t); b.classList.toggle('active', finRel.tipo === t); b.setAttribute('aria-pressed', String(finRel.tipo === t)); });
    ['caixa', 'competencia'].forEach(t => { const b = document.getElementById('dre-rel-regime-' + t); b.classList.toggle('active', finRel.regime === t); b.setAttribute('aria-pressed', String(finRel.regime === t)); });
    const sel = document.getElementById('dre-rel-intervalo'); if (sel) sel.value = finRel.intervalo;
    const tab = _dreRelTabela();
    if (!tab.periodos.length) { corpo.innerHTML = '<p class="lanc-sub">Período inválido: a data inicial deve ser anterior à final.</p>'; return; }
    const { cab, linhas } = _dreCelulas(finRel.tipo, tab);
    const filhos = new Set(tab.linhas.filter(l => l.pai).map(l => l.pai));
    const por = []; cab.forEach(c => { if (!por.length || por[por.length - 1].g !== c.grupo) por.push({ g: c.grupo, n: 0 }); por[por.length - 1].n++; });
    const porChave = new Map(tab.linhas.map(l => [l.chave, l]));
    const visivel = l => !l.pai || (finRel.abertos.has(l.pai) && visivel(porChave.get(l.pai)));
    const trs = linhas.filter(x => visivel(x.l)).map(({ l, cel }) => {
        const aberto = finRel.abertos.has(l.chave);
        const tg = filhos.has(l.chave)
            ? `<button type="button" class="dre-tg" data-tg="${escapeHtml(l.chave)}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'} ${escapeHtml(l.rotulo)}">${aberto ? '−' : '+'}</button>`
            : '<span class="dre-tg dre-tg-vazio"></span>';
        const tds = cel.map(c => {
            const cls = 'dre-num' + (c.pct ? ' dre-pct' : '') + (c.neg ? ' dre-neg' : '') + (c.fav === true ? ' dre-fav' : c.fav === false ? ' dre-desfav' : '') + (c.clicavel ? ' dre-clicavel' : '');
            return `<td class="${cls}"${c.clicavel ? ` data-chave="${escapeHtml(l.chave)}" data-i="${c.i}" tabindex="0" role="button"` : ''}>${escapeHtml(c.txt)}</td>`;
        }).join('');
        return `<tr class="dre-l dre-${l.tipo}${l.chave === 'liquido' ? ' dre-liquido' : ''}" data-chave="${escapeHtml(l.chave)}"><th scope="row" class="dre-rot" style="padding-left:${8 + l.nivel * 18}px">${tg}${escapeHtml(l.rotulo)}${l.inativa ? ' <span class="lanc-sub">(inativa)</span>' : ''}</th>${tds}</tr>`;
    }).join('');
    corpo.innerHTML = `<div class="dre-quadro"><table class="dre-tabela dre-tabela-rel" id="dre-rel-tabela">
        <thead><tr><th class="dre-rot" rowspan="2">RESULTADO</th>${por.map(g => `<th class="dre-num dre-grupo-cab" colspan="${g.n}">${escapeHtml(g.g)}</th>`).join('')}</tr>
        <tr>${cab.map(c => `<th class="dre-num dre-sub-cab">${escapeHtml(c.sub)}</th>`).join('')}</tr></thead>
        <tbody>${trs}</tbody></table></div>
        ${_dreRelNotaParcial(tab)}
        <p class="lanc-sub" style="margin-top:8px">Clique em + para abrir o grupo e no valor de uma categoria para ver os lançamentos.</p>`;
}

// Horizontal: se a ultima coluna e um periodo parcial, avisa que a comparacao nao e de periodos inteiros.
function _dreRelNotaParcial(tab) {
    const ult = tab.periodos[tab.periodos.length - 1];
    if (finRel.tipo !== 'horizontal' || tab.periodos.length < 2 || !/^\d{2}\/\d{2}/.test(ult.rotulo)) return '';
    return `<p class="lanc-sub" id="dre-rel-parcial" style="margin-top:8px">A última coluna vai só até ${ult.ate.slice(8, 10)}/${ult.ate.slice(5, 7)}; compare com cuidado.</p>`;
}

function _dreRelPeriodoTxt() { return _dreDataBr(finRel.de) + ' a ' + _dreDataBr(finRel.ate); }
function _dreRelImprimirAgora(dica) {
    const tab = _dreRelTabela();
    if (!tab.periodos.length) { toast('Período inválido.', 'info'); return; }
    _dreImprimir(_dreRelTitulo(), _dreNomeRegime(finRel.regime), _dreRelPeriodoTxt(), finRel.tipo, tab, '', dica);
}
function exportarRelatorioDrePdf() { _dreRelImprimirAgora(true); }
function imprimirRelatorioDre() { _dreRelImprimirAgora(false); }
function exportarRelatorioDreExcel() {
    const tab = _dreRelTabela();
    if (!tab.periodos.length) { toast('Período inválido.', 'info'); return; }
    return _dreBaixarExcel('Analise_' + finRel.tipo + '_' + finRel.de + '_' + finRel.ate + '.xlsx', _dreRelTitulo(), _dreComCabecalhoExcel(_dreMatrizExcel(finRel.tipo, tab, ''), _dreRelTitulo(), _dreNomeRegime(finRel.regime), _dreRelPeriodoTxt()));
}

// ===================== DETALHE (lancamentos de uma categoria num periodo) =====================
// ctx (opcional, vindo dos relatorios): { tab, regime } usa a tabela e o regime do relatorio e o periodo pelo rotulo.
function abrirDetalheDre(chave, indice, ctx) {
    const tab = ctx ? ctx.tab : finDreTabelaAtual();
    const linha = tab.linhas.find(l => l.chave === chave);
    if (!linha || linha.tipo !== 'categoria') return;
    const total = !ctx && (indice < 0 || indice >= tab.periodos.length);
    const per = total ? { de: finDre.ano + '-01-01', ate: finDre.ano + '-12-31' } : tab.periodos[indice];
    if (!per) return;
    const calc = DreCore.calcular(_dreParams(per.de, per.ate, undefined, ctx && ctx.regime));
    const itens = (calc.lancamentos[linha.id] || []).slice().sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
    const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dataBr = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
    const periodoTxt = ctx ? per.rotulo : total ? String(finDre.ano) : _dreMeses[Number(per.de.slice(5, 7)) - 1] + '/' + per.de.slice(0, 4);
    const soma = itens.reduce((t, i) => t + (Number(i.valor) || 0), 0);
    let algumPode = false;
    const linhasHtml = itens.map(i => {
        const r = (i.tipo === 'cp' ? db.contas_pagar : db.contas_receber).find(x => String(x.id) === String(i.id)) || {};
        const pode = temAcesso(i.tipo === 'cp' ? FIN_LADOS.pagar : FIN_LADOS.receber, 'visualizar');
        if (pode) algumPode = true;
        return `<tr class="dre-det-linha" data-tipo="${i.tipo}" data-id="${escapeHtml(String(i.id))}"${pode ? ' data-ir="1" style="cursor:pointer"' : ''}>
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
            <div class="lanc-rodape"><span class="lanc-sub">${algumPode ? 'Clique numa linha para abrir o lançamento.' : ''}</span><strong id="dre-det-total">Total: R$ ${brl(soma)}</strong></div></div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => {
        if (e.target === o) { o.remove(); return; }
        const tr = e.target.closest('tr.dre-det-linha');
        if (tr && tr.dataset.ir) { const t = tr.dataset.tipo, id = tr.dataset.id; o.remove(); _dreRelFechar(false); abrirLancamentoNaLista(t, id); }
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
        const subsHtml = _dreComSub(g) && subs.length ? subs.map(s => {
            const emUso = fc.categorias.some(c => c.subgrupo_id === s.id);
            return `<div class="dre-cat-linha dre-sub-linha" data-sid="${escapeHtml(String(s.id))}"><span class="lanc-sub">Subgrupo</span>
                <input type="text" class="dre-sub-nome" aria-label="Nome do subgrupo" value="${escapeHtml(s.nome)}" data-sid="${escapeHtml(String(s.id))}">
                ${emUso ? '' : `<button type="button" class="btn btn-outline btn-sm dre-sub-excluir" data-sid="${escapeHtml(String(s.id))}">Excluir</button>`}</div>`;
        }).join('') : '';
        return `<div class="dre-cat-grupo" data-grupo="${g}"><h4>${rotulo}</h4>${subsHtml}${linhas}</div>`;
    }).join('');
    el.onchange = e => {
        const t = e.target;
        if (t.classList.contains('dre-sub-nome')) finDreRenomearSub(t.dataset.sid, t.value, t);
        else if (t.classList.contains('dre-cat-nome')) finDreRenomear(t.dataset.id, t.value, t);
        else if (t.classList.contains('dre-cat-sub')) finDreMoverSub(t.dataset.id, t.value);
    };
    el.onclick = e => {
        const sb = e.target.closest('button.dre-sub-excluir');
        if (sb) { finDreExcluirSub(sb.dataset.sid); return; }
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
function finDreRenomearSub(sid, nome, input) {
    const s = db.fin_categorias.subgrupos.find(x => String(x.id) === String(sid));
    nome = String(nome || '').trim();
    if (!s) return;
    if (!nome) { _dreAvisoCat('Informe o nome do subgrupo.'); if (input) input.value = s.nome; return; }
    if (db.fin_categorias.subgrupos.some(x => x !== s && x.grupo === s.grupo && _finNorm(x.nome) === _finNorm(nome))) { _dreAvisoCat('Já existe um subgrupo com esse nome neste grupo.'); if (input) input.value = s.nome; return; }
    _dreAvisoCat('');
    s.nome = nome;
    _dreGravarCat();
}
async function finDreExcluirSub(sid) {
    const fc = db.fin_categorias;
    const s = fc.subgrupos.find(x => String(x.id) === String(sid));
    if (!s || fc.categorias.some(c => c.subgrupo_id === s.id)) return;
    if (!await showConfirm('Excluir o subgrupo ' + s.nome + '?', '🗑️', 'Excluir', 'Cancelar')) return;
    fc.subgrupos = fc.subgrupos.filter(x => String(x.id) !== String(sid));
    _dreAvisoCat('');
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
async function finDreExcluirCat(id) {
    const c = _dreCat(id);
    if (!c || c.padrao || _dreCatUsada(id)) return;
    if (!await showConfirm('Excluir a categoria ' + c.nome + '?', '🗑️', 'Excluir', 'Cancelar')) return;
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

// Outra aba mexeu nas categorias: a DRE (e a janela de categorias, se aberta) se redesenham.
window.addEventListener('storage', e => {
    if (e.key !== 'sc_fin_cat') return;
    try { _dbRecarregarChave('sc_fin_cat'); } catch (err) { /* sem recarga: segue com o que ha */ }
    const p = document.getElementById('fin-dre');
    if (p && p.classList.contains('active')) renderFinDre();
    _dreCatRender();
});
