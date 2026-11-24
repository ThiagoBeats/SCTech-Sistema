'use strict';
// Tela Fluxo de caixa do Financeiro novo: filtros, 4 cartoes, grafico (saldo, entradas e saidas, com o previsto
// tracejado), movimentacoes do periodo (com transferencias) e Relatorios. Os numeros vem todos do FluxoCore
// (aqui so montagem). Carregado depois de fin-dre.js (reusa a janela de impressao e a planilha da DRE).

const finFluxo = { de: '', ate: '', agrupar: 'dia', contaId: '', categoriaId: '' };
let _fxGrafico = null;
let _fxSerieAtual = [];

const _fxBrl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _fxNum = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _fxDataBr = d => String(d).slice(8, 10) + '/' + String(d).slice(5, 7) + '/' + String(d).slice(0, 4);
const _fxDm = d => String(d).slice(8, 10) + '/' + String(d).slice(5, 7);
const _fxIdJs = id => typeof id === 'number' ? String(id) : JSON.stringify(String(id));
const _fxPad = n => String(n).padStart(2, '0');
const _fxMesIni = (a, m) => a + '-' + _fxPad(m) + '-01';
const _fxMesFim = (a, m) => a + '-' + _fxPad(m) + '-' + _fxPad(new Date(a, m, 0).getDate());
const _fxValida = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// Padrao: o mes de hoje.
function _fxPeriodoPadrao() {
    const hoje = hojeLocal(), a = Number(hoje.slice(0, 4)), m = Number(hoje.slice(5, 7));
    return { de: _fxMesIni(a, m), ate: _fxMesFim(a, m) };
}

// Parametros do FluxoCore com os filtros da tela (extra sobrescreve).
function _fxParams(extra) {
    const fc = db.fin_categorias || {};
    return Object.assign({
        de: finFluxo.de, ate: finFluxo.ate, hoje: hojeLocal(), contaId: finFluxo.contaId, categoriaId: finFluxo.categoriaId,
        movimentos: db.movimentos_fin || [], contas: getContasFin(), contasReceber: db.contas_receber || [], contasPagar: db.contas_pagar || [],
        despesasFixas: db.despesas_fixas || [], meios: getMeiosPag(), categorias: fc.categorias
    }, extra || {});
}

function finFluxoMudar(campo, valor) {
    if (campo === 'agrupar') finFluxo.agrupar = ['semana', 'mes'].includes(valor) ? valor : 'dia';
    else if (campo === 'de' || campo === 'ate') finFluxo[campo] = valor || '';
    else if (campo === 'contaId' || campo === 'categoriaId') finFluxo[campo] = valor == null ? '' : String(valor);
    renderFinFluxo();
}

// Ultima data conferida com o extrato por conta (linhas conciliadas de db.fin_extrato).
function _fxConferidos(contas) {
    const ext = Array.isArray(db.fin_extrato) ? db.fin_extrato : [];
    return contas.map(c => {
        const datas = ext.filter(x => x && String(x.conta_id) === String(c.id) && (x.situacao === 'conciliado' || x.situacao === 'transferencia') && x.data).map(x => String(x.data).slice(0, 10));
        return datas.length ? { conta: c, ate: datas.sort().pop() } : null;
    }).filter(Boolean);
}

function _fxOpcoesCategoria() {
    const cats = ((db.fin_categorias && db.fin_categorias.categorias) || []).filter(c => c.ativo !== false || String(c.id) === String(finFluxo.categoriaId));
    const rot = _finRotulosCategorias(cats);
    const grupo = (tipo, titulo) => {
        const l = cats.filter(c => c.tipo === tipo);
        return l.length ? `<optgroup label="${titulo}">${l.map(c => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(rot.get(String(c.id)))}${c.ativo === false ? ' (inativa)' : ''}</option>`).join('')}</optgroup>` : '';
    };
    return '<option value="">Todas as categorias</option>' + grupo('entrada', 'Entradas') + grupo('saida', 'Saídas');
}

function renderFinFluxo() {
    const alvo = document.getElementById('fin-fluxo-conteudo');
    if (!alvo) return;
    if (_fxGrafico) { try { _fxGrafico.destroy(); } catch (e) { /* ja destruido */ } _fxGrafico = null; }
    if (!finFluxo.de && !finFluxo.ate) Object.assign(finFluxo, _fxPeriodoPadrao());
    const hoje = hojeLocal();
    const contas = getContasFin();
    if (finFluxo.contaId !== '' && !contas.some(c => CaixaCore.mesmoId(c.id, finFluxo.contaId))) finFluxo.contaId = '';
    if (finFluxo.categoriaId !== '' && !((db.fin_categorias && db.fin_categorias.categorias) || []).some(c => String(c.id) === String(finFluxo.categoriaId))) finFluxo.categoriaId = '';
    const completo = temAcesso('financeiro.fluxo', 'completo');
    const periodoOk = _fxValida(finFluxo.de) && _fxValida(finFluxo.ate) && finFluxo.de <= finFluxo.ate;

    const seg = (v, t) => `<button type="button" class="dre-seg-btn${finFluxo.agrupar === v ? ' active' : ''}" id="fluxo-agrupar-${v}" aria-pressed="${finFluxo.agrupar === v}" onclick="finFluxoMudar('agrupar','${v}')">${t}</button>`;
    // Contas desativadas tambem aparecem (so elas mostram o proprio historico); "Todas" soma so as ativas.
    const opcConta = '<option value="">Todas as contas</option>' + contas.map(c =>
        `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.nome || '')}${c.ativo === false ? ' (desativada)' : ''}</option>`).join('');

    let corpo = '';
    if (!periodoOk) {
        corpo = '<p class="lanc-aviso" id="fluxo-periodo-invalido">Período inválido: a data inicial deve ser anterior à final.</p>';
    } else {
        const r = FluxoCore.resumo(_fxParams());
        const serie = FluxoCore.serie(_fxParams({ agrupar: finFluxo.agrupar }));
        const linhas = FluxoCore.movimentacoes(_fxParams());
        corpo = _fxAvisosHtml(contas, hoje) + _fxCartoesHtml(r, hoje, contas) + _fxConferidoHtml(contas) + _fxGraficoHtml(serie) + _fxTabelaHtml(linhas, hoje, completo, contas);
        _fxSerieAtual = serie;
    }
    alvo.innerHTML = `<div class="card fluxo-topo-card"><div class="dre-topo"><h3>Fluxo de caixa</h3>
        <div class="dre-acoes">
            ${completo ? '<button class="btn btn-outline btn-sm" id="fluxo-btn-importar" onclick="abrirImportarExtrato()">Importar extrato</button>' : ''}
            ${completo ? '<button class="btn btn-outline btn-sm" id="fluxo-btn-conciliar" onclick="abrirConciliacao(finFluxo.contaId === \'\' ? null : finFluxo.contaId)">Conciliar</button>' : ''}
            <button class="btn btn-outline btn-sm" id="fluxo-btn-relatorios" onclick="abrirRelatoriosFluxo()">Relatórios</button>
        </div></div>
        <div class="lanc-barra dre-barra">
            <div class="form-group"><label for="fluxo-de">Período de</label><input type="date" id="fluxo-de" value="${escapeHtml(finFluxo.de)}" onchange="finFluxoMudar('de', this.value)"></div>
            <div class="form-group"><label for="fluxo-ate">até</label><input type="date" id="fluxo-ate" value="${escapeHtml(finFluxo.ate)}" onchange="finFluxoMudar('ate', this.value)"></div>
            <div class="form-group"><label>Ver por</label><div class="dre-seg" role="group" aria-label="Ver por">${seg('dia', 'Dia')}${seg('semana', 'Semana')}${seg('mes', 'Mês')}</div></div>
            <div class="form-group"><label for="fluxo-conta">Conta</label><select id="fluxo-conta" onchange="finFluxoMudar('contaId', this.value)">${opcConta}</select></div>
            <div class="form-group"><label for="fluxo-categoria">Categoria</label><select id="fluxo-categoria" onchange="finFluxoMudar('categoriaId', this.value)">${_fxOpcoesCategoria()}</select></div>
        </div></div>${corpo}`;
    document.getElementById('fluxo-conta').value = finFluxo.contaId;
    document.getElementById('fluxo-categoria').value = finFluxo.categoriaId;
    if (periodoOk) {
        _fxDesenharGrafico(_fxSerieAtual);
        const tb = document.getElementById('fluxo-linhas');
        const abrir = tr => { if (tr && tr.dataset.tipo) abrirLancamentoNaLista(tr.dataset.tipo, JSON.parse(tr.dataset.id)); };
        tb.addEventListener('click', e => { if (!e.target.closest('.btn-acoes')) abrir(e.target.closest('tr.fluxo-clicavel')); });
        tb.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const tr = e.target.closest('tr.fluxo-clicavel');
            if (tr && e.target === tr) { e.preventDefault(); abrir(tr); }
        });
    }
}

// Avisos: recebimentos sem conta no periodo e contas que ainda nao tinham sido abertas.
function _fxAvisosHtml(contas, hoje) {
    const partes = [];
    const brl = _fxBrl;
    if (finFluxo.contaId === '' && finFluxo.categoriaId === '') {
        const sem = ResultadoCore.recebimentosSemMovimento({ de: finFluxo.de, ate: finFluxo.ate, contasReceber: db.contas_receber, movimentos: db.movimentos_fin || [], contas, contasPagar: db.contas_pagar, categorias: db.fin_categorias });
        if (sem.qtd > 0) {
            partes.push(`<p class="lanc-aviso" id="fluxo-aviso-sem-conta">${sem.qtd === 1 ? `1 recebimento sem conta (${brl(sem.valor)}) não aparece aqui` : `${sem.qtd} recebimentos sem conta (${brl(sem.valor)}) não aparecem aqui`}</p>`);
        }
    }
    const conjunto = finFluxo.contaId !== '' ? contas.filter(c => CaixaCore.mesmoId(c.id, finFluxo.contaId)) : contas.filter(c => c.ativo !== false);
    const naoAbertas = conjunto.filter(c => c.data_saldo_inicial && c.data_saldo_inicial > finFluxo.ate);
    if (naoAbertas.length) {
        partes.push(`<p class="lanc-aviso" id="fluxo-aviso-abertura">${naoAbertas.map(c => `${finFluxo.contaId === '' ? escapeHtml(c.nome || '') + ': ' : ''}conta aberta em ${_fxDataBr(c.data_saldo_inicial)}`).join(' · ')}</p>`);
    }
    return partes.join('');
}

function _fxCartoesHtml(r, hoje) {
    const k = (id, rotulo, valor, cls, sub) => `<div class="res-kpi" id="fluxo-kpi-${id}"><div class="res-kpi-rotulo">${rotulo}</div><div class="res-kpi-valor ${cls || ''}">${_fxBrl(valor)}</div>${sub || ''}</div>`;
    let sub = '';
    if (finFluxo.ate > hoje) sub += `<div class="res-var res-var-sem" id="fluxo-previsto">Previsto até ${_fxDm(finFluxo.ate)}: ${_fxBrl(r.previsto.saldoFinal)}</div>`;
    if (r.aberturas) sub += `<div class="res-var res-var-sem" id="fluxo-abertura">Inclui ${_fxBrl(r.aberturas)} de abertura de conta</div>`;
    return `<div class="res-kpis fluxo-kpis">${k('inicial', 'Saldo inicial', r.saldoInicial, r.saldoInicial < 0 ? 'res-neg' : '')}
        ${k('entradas', 'Entradas', r.entradas, 'fluxo-ent')}${k('saidas', 'Saídas', r.saidas, 'fluxo-sai')}
        ${k('final', 'Saldo final', r.saldoFinal, r.saldoFinal < 0 ? 'res-neg' : '', sub)}</div>`;
}

function _fxConferidoHtml(contas) {
    const conjunto = finFluxo.contaId !== '' ? contas.filter(c => CaixaCore.mesmoId(c.id, finFluxo.contaId)) : contas.filter(c => c.ativo !== false);
    const conf = _fxConferidos(conjunto);
    if (!conf.length) return '';
    return `<div class="fluxo-conferido" id="fluxo-conferido">${conf.map(x => `<div class="fluxo-conferido-linha"><strong>${escapeHtml(x.conta.nome || '')}</strong> · Conferido com o extrato até ${_fxDm(x.ate)}</div>`).join('')}</div>`;
}

function _fxGraficoHtml(serie) {
    if (!serie.length) return '';
    return `<div class="card fluxo-card"><div class="fluxo-grafico"><canvas id="fluxo-grafico" role="img" aria-label="Gráfico de saldo, entradas e saídas"></canvas></div>
        <p class="lanc-sub" style="margin:6px 0 0">Linha tracejada: previsto (contas em aberto, de hoje em diante).</p></div>`;
}

function _fxDesenharGrafico(serie) {
    const cv = document.getElementById('fluxo-grafico');
    if (!cv || typeof Chart === 'undefined' || !serie || !serie.length) return;
    const css = getComputedStyle(document.documentElement);
    const texto = css.getPropertyValue('--muted').trim() || '#8F8F8F';
    const grade = css.getPropertyValue('--border').trim() || '#E3E5E8';
    const tracejado = { borderDash: ctx => (serie[ctx.p1DataIndex] && serie[ctx.p1DataIndex].previsto ? [6, 4] : undefined) };
    const ds = (label, cor, dados) => ({ label, data: dados, borderColor: cor, backgroundColor: cor, tension: 0.2, borderWidth: 2, pointRadius: serie.length > 45 ? 0 : 3, pointHoverRadius: 5, segment: tracejado });
    _fxGrafico = new Chart(cv, {
        type: 'line',
        data: {
            labels: serie.map(p => p.rotulo),
            datasets: [ds('Saldo', '#2D77C1', serie.map(p => p.saldo)), ds('Entradas', '#159912', serie.map(p => p.entradas)), ds('Saídas', '#F43927', serie.map(p => p.saidas))]
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom', labels: { color: texto, usePointStyle: true } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + _fxBrl(c.parsed.y) } } },
            scales: {
                x: { ticks: { color: texto, maxRotation: 0, autoSkip: true }, grid: { color: grade } },
                y: { ticks: { color: texto, callback: v => Number(v).toLocaleString('pt-BR') }, grid: { color: grade } }
            }
        }
    });
}

function _fxTabelaHtml(linhas, hoje, completo, contas) {
    const nomeConta = id => { const c = contas.find(x => CaixaCore.mesmoId(x.id, id)); return c ? c.nome || '' : ''; };
    const podeAbrir = tipo => temAcesso(tipo === 'cp' ? FIN_LADOS.pagar : FIN_LADOS.receber, 'visualizar');
    const trs = linhas.map(l => {
        if (l.origem === 'saldo_inicial') {
            const conta = finFluxo.contaId !== '' ? nomeConta(finFluxo.contaId) : 'Todas as contas';
            return `<tr class="fluxo-linha fluxo-saldo-inicial"><td>${_fxDataBr(l.data)}</td><td><strong>Saldo inicial</strong></td><td>${escapeHtml(conta)}</td><td></td><td></td><td class="fluxo-saldo${l.saldo < 0 ? ' res-neg' : ''}">${_fxNum(l.saldo)}</td><td></td></tr>`;
        }
        const clicavel = (l.origem === 'cr' || l.origem === 'cp') && l.origem_id != null && podeAbrir(l.origem);
        const selo = l.previsto ? ' <span class="fluxo-selo fluxo-selo-prev">Previsto</span>' : l.transferencia ? ' <span class="fluxo-selo fluxo-selo-transf">Transferência</span>' : '';
        const kebab = l.transferencia && l.grupo_id != null && completo && !l.previsto
            ? menuAcoesHtml([{ icone: '🗑', rotulo: 'Excluir transferência', perigo: true, onclick: 'excluirTransferencia(' + _fxIdJs(l.grupo_id) + ')' }]) : '';
        const attrs = clicavel ? ` data-tipo="${l.origem}" data-id="${escapeHtml(JSON.stringify(l.origem_id))}" tabindex="0" role="button"` : '';
        return `<tr class="fluxo-linha${l.previsto ? ' fluxo-previsto' : ''}${l.transferencia ? ' fluxo-transferencia' : ''}${clicavel ? ' fluxo-clicavel' : ''}"${attrs}>
            <td>${_fxDataBr(l.data)}</td><td>${escapeHtml(l.descricao || '')}${selo}</td><td>${escapeHtml(l.conta_id != null ? nomeConta(l.conta_id) || '—' : '—')}</td>
            <td class="fluxo-num fluxo-ent">${l.entrada ? _fxNum(l.entrada) : ''}</td><td class="fluxo-num fluxo-sai">${l.saida ? _fxNum(l.saida) : ''}</td>
            <td class="fluxo-num fluxo-saldo${l.saldo < 0 ? ' res-neg' : ''}">${_fxNum(l.saldo)}</td><td class="fluxo-acoes">${kebab}</td></tr>`;
    }).join('');
    const vazio = linhas.length <= 1 ? '<p class="lanc-sub" id="fluxo-vazio" style="margin:8px 0 0">Nenhuma movimentação neste período.</p>' : '';
    return `<div class="card fluxo-card"><div class="dre-topo"><h3>Movimentações do período</h3>
        ${completo ? '<button class="btn btn-success btn-sm" id="fluxo-btn-transferir" onclick="abrirModalTransferencia()">⇄ Transferir entre contas</button>' : ''}</div>
        <div class="lanc-tabela"><table class="fluxo-tabela" id="fluxo-tabela"><thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th class="fluxo-num">Entrada</th><th class="fluxo-num">Saída</th><th class="fluxo-num">Saldo</th><th></th></tr></thead>
        <tbody id="fluxo-linhas">${trs}</tbody></table></div>${vazio}</div>`;
}

// ===================== IMPORTAR E CONCILIAR (entram na proxima etapa) =====================
function abrirImportarExtrato() { toast('Em breve.', 'info'); }
function abrirConciliacao(contaId) { toast('Em breve.', 'info'); }

// ===================== RELATORIOS =====================
const finFluxoRel = { tipo: 'categoria', de: '', ate: '' };
const _fxRelTipos = [['categoria', 'Entradas e saídas por categoria'], ['contas', 'Contas a pagar e a receber por período'], ['evolucao', 'Evolução mensal do saldo']];
const _fxRelTitulo = () => (_fxRelTipos.find(t => t[0] === finFluxoRel.tipo) || _fxRelTipos[0])[1];

// Cada relatorio devolve { cab: [{ t, num }], linhas: [{ cel: [texto], xl: [valor], forte }], periodoTxt, regime, nota }.
function _fxRelCategoria() {
    const { de, ate } = finFluxoRel;
    const calc = DreCore.calcular(_dreParams(de, ate, undefined, 'caixa'));
    const cats = (db.fin_categorias && db.fin_categorias.categorias) || [];
    const rot = _finRotulosCategorias(cats);
    const total = id => CaixaCore.arredondar((calc.lancamentos[id] || []).reduce((s, x) => s + (Number(x.valor) || 0), 0));
    const lado = tipo => cats.filter(c => c.tipo === tipo && (calc.lancamentos[c.id] || []).length).map(c => ({ nome: rot.get(String(c.id)), v: total(c.id) })).sort((a, b) => b.v - a.v);
    const ent = lado('entrada'), sai = lado('saida');
    const soma = l => CaixaCore.arredondar(l.reduce((s, x) => s + x.v, 0));
    const te = soma(ent), ts = soma(sai);
    const linhas = [];
    const bloco = (titulo, l, t, rotuloTotal) => {
        linhas.push({ cel: [titulo, ''], xl: [titulo, ''], forte: true });
        if (!l.length) linhas.push({ cel: ['Nenhum lançamento no período', ''], xl: ['Nenhum lançamento no período', ''], vazio: true });
        l.forEach(x => linhas.push({ cel: [x.nome, _fxNum(x.v)], xl: [x.nome, x.v], nivel: 1 }));
        linhas.push({ cel: [rotuloTotal, _fxNum(t)], xl: [rotuloTotal, t], forte: true });
    };
    bloco('Entradas', ent, te, 'Total de entradas');
    bloco('Saídas', sai, ts, 'Total de saídas');
    const res = CaixaCore.arredondar(te - ts);
    linhas.push({ cel: ['Entradas menos saídas', _fxNum(res)], xl: ['Entradas menos saídas', res], forte: true });
    return { cab: [{ t: 'Categoria' }, { t: 'Valor (R$)', num: true }], linhas, periodoTxt: _fxDataBr(de) + ' a ' + _fxDataBr(ate), regime: 'Caixa',
        nota: 'Mesma base da DRE no regime Caixa: valores pela data em que o dinheiro entrou ou saiu. Transferências entre contas não entram.' };
}

function _fxRelContas() {
    const { de, ate } = finFluxoRel;
    const meses = FluxoCore.pontos(de, ate, 'mes');
    const no = (r, a, b) => { const v = r && r.data_vencimento ? String(r.data_vencimento).slice(0, 10) : ''; return v >= a && v <= b; };
    const aberto = r => r.status !== 'Pago' && r.status !== 'Cancelado';
    const soma = (lista, a, b, f) => CaixaCore.arredondar(lista.filter(r => r && no(r, a, b) && f(r)).reduce((s, r) => s + (Number(r.valor) || 0), 0));
    const crs = db.contas_receber || [], cps = db.contas_pagar || [];
    const linhas = [];
    const tot = [0, 0, 0, 0];
    meses.forEach(m => {
        const v = [soma(crs, m.de, m.ate, aberto), soma(crs, m.de, m.ate, r => r.status === 'Pago'), soma(cps, m.de, m.ate, aberto), soma(cps, m.de, m.ate, r => r.status === 'Pago')];
        v.forEach((x, i) => { tot[i] = CaixaCore.arredondar(tot[i] + x); });
        linhas.push({ cel: [m.rotulo].concat(v.map(_fxNum)), xl: [m.rotulo].concat(v) });
    });
    linhas.push({ cel: ['Total'].concat(tot.map(_fxNum)), xl: ['Total'].concat(tot), forte: true });
    return { cab: [{ t: 'Vencimento' }, { t: 'A receber em aberto', num: true }, { t: 'Recebido', num: true }, { t: 'A pagar em aberto', num: true }, { t: 'Pago', num: true }], linhas,
        periodoTxt: _fxDataBr(de) + ' a ' + _fxDataBr(ate), regime: '',
        nota: 'Por data de vencimento. Em aberto inclui as vencidas; contas canceladas não entram.' };
}

function _fxRelEvolucao() {
    const hoje = hojeLocal();
    const a = Number(hoje.slice(0, 4)), m = Number(hoje.slice(5, 7));
    const ini = new Date(a, m - 12, 1);
    const de = _fxMesIni(ini.getFullYear(), ini.getMonth() + 1);
    const p = _fxParams({ de, ate: hoje, categoriaId: '' });
    const serie = FluxoCore.serie(Object.assign({}, p, { agrupar: 'mes' }));
    let saldo = FluxoCore.resumo(Object.assign({}, p, { ate: de })).saldoInicial;
    let aberturas = false;
    const linhas = serie.map(s => {
        const inicial = saldo;
        if (Math.abs(CaixaCore.arredondar(inicial + s.entradas - s.saidas - s.saldo)) > 0.001) aberturas = true;
        saldo = s.saldo;
        return { cel: [s.rotulo, _fxNum(inicial), _fxNum(s.entradas), _fxNum(s.saidas), _fxNum(s.saldo)], xl: [s.rotulo, inicial, s.entradas, s.saidas, s.saldo] };
    });
    const conta = finFluxo.contaId !== '' ? (getContasFin().find(c => CaixaCore.mesmoId(c.id, finFluxo.contaId)) || {}).nome : '';
    return { cab: [{ t: 'Mês' }, { t: 'Saldo inicial', num: true }, { t: 'Entradas', num: true }, { t: 'Saídas', num: true }, { t: 'Saldo final', num: true }], linhas,
        periodoTxt: _fxDataBr(de) + ' a ' + _fxDataBr(hoje) + (conta ? ' · Conta: ' + conta : ' · Todas as contas'), regime: '',
        nota: 'Os 12 meses até o mês atual (o mês atual vai até hoje).' + (aberturas ? ' O saldo inclui o saldo inicial de contas abertas no período.' : '') };
}

function _fxRelDados() {
    return finFluxoRel.tipo === 'contas' ? _fxRelContas() : finFluxoRel.tipo === 'evolucao' ? _fxRelEvolucao() : _fxRelCategoria();
}
const _fxRelPeriodoOk = () => finFluxoRel.tipo === 'evolucao' || (_fxValida(finFluxoRel.de) && _fxValida(finFluxoRel.ate) && finFluxoRel.de <= finFluxoRel.ate);

function abrirRelatoriosFluxo() {
    const periodo = _fxValida(finFluxo.de) && _fxValida(finFluxo.ate) && finFluxo.de <= finFluxo.ate ? { de: finFluxo.de, ate: finFluxo.ate } : _fxPeriodoPadrao();
    Object.assign(finFluxoRel, { tipo: 'categoria' }, periodo);
    document.getElementById('fluxo-rel-overlay')?.remove();
    const o = document.createElement('div');
    o.id = 'fluxo-rel-overlay';
    o.className = 'dre-rel';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-label', 'Relatórios do Fluxo de caixa');
    o.tabIndex = -1;
    const tipo = t => `<button type="button" class="dre-seg-btn" id="fluxo-rel-tipo-${t[0]}" aria-pressed="false" onclick="finFluxoRelMudar('tipo','${t[0]}')">${t[1]}</button>`;
    o.innerHTML = `<div class="dre-rel-caixa">
        <div class="dre-topo"><h3 id="fluxo-rel-titulo"></h3>
            <div class="dre-acoes">
                <button class="btn btn-outline btn-sm" id="fluxo-rel-pdf" onclick="exportarRelatorioFluxoPdf()">PDF</button>
                <button class="btn btn-outline btn-sm" id="fluxo-rel-excel" onclick="exportarRelatorioFluxoExcel()">Excel</button>
                <button class="btn btn-outline btn-sm" id="fluxo-rel-imprimir" onclick="imprimirRelatorioFluxo()">Imprimir</button>
                <button class="btn btn-outline btn-sm" id="fluxo-rel-fechar" onclick="_fxRelFechar(true)">Fechar</button>
            </div></div>
        <div class="lanc-barra dre-barra">
            <div class="form-group fluxo-rel-tipos"><label>Relatório</label><div class="dre-seg fluxo-rel-seg" role="group" aria-label="Relatório">${_fxRelTipos.map(tipo).join('')}</div></div>
            <div class="form-group" id="fluxo-rel-grupo-de"><label for="fluxo-rel-de">Período de</label><input type="date" id="fluxo-rel-de" value="${finFluxoRel.de}" onchange="finFluxoRelMudar('de', this.value)"></div>
            <div class="form-group" id="fluxo-rel-grupo-ate"><label for="fluxo-rel-ate">até</label><input type="date" id="fluxo-rel-ate" value="${finFluxoRel.ate}" onchange="finFluxoRelMudar('ate', this.value)"></div>
        </div>
        <div id="fluxo-rel-corpo"></div></div>`;
    document.body.appendChild(o);
    o.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); _fxRelFechar(true); } });
    _fxRelRender();
    o.focus();
}

function _fxRelFechar(devolverFoco) {
    document.getElementById('fluxo-rel-overlay')?.remove();
    const b = document.getElementById('fluxo-btn-relatorios');
    if (devolverFoco && b) b.focus();
}

function finFluxoRelMudar(campo, valor) {
    if (campo === 'tipo') finFluxoRel.tipo = _fxRelTipos.some(t => t[0] === valor) ? valor : 'categoria';
    else finFluxoRel[campo] = valor || '';
    _fxRelRender();
}

function _fxRelRender() {
    const corpo = document.getElementById('fluxo-rel-corpo');
    if (!corpo) return;
    document.getElementById('fluxo-rel-titulo').textContent = _fxRelTitulo();
    _fxRelTipos.forEach(t => { const b = document.getElementById('fluxo-rel-tipo-' + t[0]); b.classList.toggle('active', finFluxoRel.tipo === t[0]); b.setAttribute('aria-pressed', String(finFluxoRel.tipo === t[0])); });
    const semPeriodo = finFluxoRel.tipo === 'evolucao';
    ['fluxo-rel-grupo-de', 'fluxo-rel-grupo-ate'].forEach(id => { document.getElementById(id).style.display = semPeriodo ? 'none' : ''; });
    if (!_fxRelPeriodoOk()) { corpo.innerHTML = '<p class="lanc-aviso">Período inválido: a data inicial deve ser anterior à final.</p>'; return; }
    const d = _fxRelDados();
    corpo.innerHTML = `<p class="lanc-sub" id="fluxo-rel-meta">${d.regime ? 'Regime: ' + escapeHtml(d.regime) + ' · ' : ''}Período: ${escapeHtml(d.periodoTxt)}</p>
        <div class="lanc-tabela"><table class="fluxo-tabela fluxo-rel-tabela" id="fluxo-rel-tabela"><thead><tr>${d.cab.map(c => `<th class="${c.num ? 'fluxo-num' : ''}">${escapeHtml(c.t)}</th>`).join('')}</tr></thead>
        <tbody>${d.linhas.map(l => `<tr class="${l.forte ? 'fluxo-rel-forte' : ''}${l.vazio ? ' fluxo-rel-vazio' : ''}">${l.cel.map((c, i) => `<${i === 0 ? 'th scope="row"' : 'td'} class="${d.cab[i].num ? 'fluxo-num' : ''}"${i === 0 && l.nivel ? ' style="padding-left:24px"' : ''}>${escapeHtml(c)}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="lanc-sub" style="margin-top:8px">${escapeHtml(d.nota)}</p>`;
}

function _fxRelImprimirAgora(dica) {
    if (!_fxRelPeriodoOk()) { toast('Período inválido.', 'info'); return; }
    const d = _fxRelDados();
    const tabela = `<table><thead><tr>${d.cab.map(c => `<th style="text-align:${c.num ? 'right' : 'left'}">${escapeHtml(c.t)}</th>`).join('')}</tr></thead><tbody>${d.linhas.map(l =>
        `<tr style="${l.forte ? 'font-weight:700;background:#F0F2F5;' : ''}">${l.cel.map((c, i) => `<td style="text-align:${d.cab[i].num ? 'right' : 'left'};${i === 0 && l.nivel ? 'padding-left:20px;' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        <p style="color:#555;margin-top:8px">${escapeHtml(d.nota)}</p>`;
    _dreAbrirImpressao(_fxRelTitulo(), `${d.regime ? 'Regime: ' + escapeHtml(d.regime) + ' &nbsp;·&nbsp; ' : ''}Período: ${escapeHtml(d.periodoTxt)}`, tabela, dica);
}
function exportarRelatorioFluxoPdf() { _fxRelImprimirAgora(true); }
function imprimirRelatorioFluxo() { _fxRelImprimirAgora(false); }
function exportarRelatorioFluxoExcel() {
    if (!_fxRelPeriodoOk()) { toast('Período inválido.', 'info'); return; }
    const d = _fxRelDados();
    const emp = getEmpresa();
    const aoa = [[emp.nome_fantasia || emp.razao_social || 'SCTech'], [_fxRelTitulo()]];
    if (d.regime) aoa.push(['Regime: ' + d.regime]);
    aoa.push(['Período: ' + d.periodoTxt], [], d.cab.map(c => c.t));
    d.linhas.forEach(l => aoa.push(l.xl.map((v, i) => (typeof v === 'number' ? v : (i === 0 && l.nivel ? '  ' : '') + v))));
    aoa.push([], [d.nota]);
    const sufixo = finFluxoRel.tipo === 'evolucao' ? hojeLocal() : finFluxoRel.de + '_' + finFluxoRel.ate;
    return _dreBaixarExcel('Fluxo_' + finFluxoRel.tipo + '_' + sufixo + '.xlsx', _fxRelTitulo().slice(0, 31), aoa);
}
