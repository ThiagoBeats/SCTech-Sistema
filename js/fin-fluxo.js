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

// Data conferida com o extrato por conta: a ultima data D de linha conciliada tal que nenhuma linha da conta com data
// ate D ainda esta pendente (linha orfa conta como pendente; ignorada nao). Uma passada so (ConciliacaoCore.conferidos).
function _fxConferidos(contas) {
    const ext = Array.isArray(db.fin_extrato) ? db.fin_extrato : [];
    if (!ext.length) return [];
    const ate = ConciliacaoCore.conferidos(ext, _ccIndiceVinculos());
    return contas.map(c => (ate.has(String(c.id)) ? { conta: c, ate: ate.get(String(c.id)) } : null)).filter(Boolean);
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
            ${completo ? '<button class="btn btn-outline btn-sm" id="fluxo-btn-importar" onclick="importarExtrato()">Importar extrato</button>' : ''}
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
    // Com categoria escolhida nao ha saldo (o saldo e da conta, nao da categoria): Entradas, Saidas e o resultado dela.
    if (finFluxo.categoriaId !== '') {
        const res = CaixaCore.arredondar(r.entradas - r.saidas);
        return `<div class="res-kpis fluxo-kpis fluxo-kpis-cat">${k('entradas', 'Entradas', r.entradas, 'fluxo-ent')}${k('saidas', 'Saídas', r.saidas, 'fluxo-sai')}
            ${k('resultado', 'Resultado da categoria', res, res < 0 ? 'res-neg' : '')}</div>`;
    }
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

// ===================== IMPORTAR EXTRATO E CONCILIAR =====================
// Linhas em db.fin_extrato (sc_fin_extrato): { id, conta_id, fitid, data, valor (com sinal), descricao, imp,
//   situacao: 'pendente'|'conciliado'|'ignorado'|'transferencia', mov_id, mov_ids, vinculos, conc_desc, conc_em, conc_por,
//   transf_grupo, criado, datas_antes }. `imp` = id da importacao em db.fin_extrato_imp (sc_fin_extrato_imp:
//   { id, conta_id, arquivo, importado_em, linhas }); linhas antigas trazem `arquivo` e `importado_em` nelas mesmas.
// vinculos = o que a linha conciliou: { t: 'mov', id } (movimento que ja existia: so liga), { t: 'cr'|'cp', id, baixa: true,
// antes: { conta_id } } (a conciliacao deu a baixa: o Desfazer estorna pelas rotinas de estorno), { t: 'rep', id: crId, data }
// (repasse de cartao). mov_ids = todos os movimentos da linha (ligados, criados pela baixa ou pela transferencia).
const finConc = { contaId: null, aba: 'pendente', escolher: null, marcados: new Set(), resumo: '' };

const _ccExtrato = () => { if (!Array.isArray(db.fin_extrato)) db.fin_extrato = []; return db.fin_extrato; };
const _ccAtivas = () => getContasFin().filter(c => c.ativo !== false);
const _ccLinha = id => (id == null ? null : _ccExtrato().find(l => l && String(l.id) === String(id)) || null);
const _ccCent = v => Math.round((Number(v) || 0) * 100);
const _ccUtc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const _ccDias = (a, b) => Math.abs(Math.round((_ccUtc(a) - _ccUtc(b)) / 86400000));
const _ccMovIds = l => (Array.isArray(l.mov_ids) ? l.mov_ids : (l.mov_id != null ? [l.mov_id] : []));
const _ccFeita = l => !!l && (l.situacao === 'conciliado' || l.situacao === 'transferencia');
const _ccLista = t => (t === 'cr' ? db.contas_receber : db.contas_pagar) || [];
const _ccImps = () => { if (!Array.isArray(db.fin_extrato_imp)) db.fin_extrato_imp = []; return db.fin_extrato_imp; };
const _ccGrupo = l => (_ccFeita(l) ? 'conciliado' : l.situacao === 'ignorado' ? 'ignorado' : 'pendente');
const _CC_ABAS = { pendente: 'Pendentes', conciliado: 'Conciliadas', ignorado: 'Ignoradas' };
const _ccDaConta = () => _ccExtrato().filter(l => l && CaixaCore.mesmoId(l.conta_id, finConc.contaId));
// Permissoes de baixa por lado, lidas uma vez por desenho.
const _ccPerm = () => ({ receber: temAcesso(FIN_LADOS.receber, 'completo'), pagar: temAcesso(FIN_LADOS.pagar, 'completo') });
// Importacao da linha: { chave, arquivo, importado_em } (linha nova: pelo id; antiga: arquivo + importado_em dela).
function _ccImportacao(l) {
    if (l.imp != null) {
        const i = _ccImps().find(x => String(x.id) === String(l.imp)) || {};
        return { chave: 'i:' + l.imp, arquivo: i.arquivo || '', importado_em: i.importado_em || '' };
    }
    return { chave: 'a:' + (l.arquivo || '') + '|' + (l.importado_em || ''), arquivo: l.arquivo || '', importado_em: l.importado_em || '' };
}

// ACCTID do arquivo x numero da conta: compara so os digitos (sem zeros a esquerda). Um pode trazer a agencia na frente
// (um termina com o outro) ou o digito verificador no fim (um comeca com o outro: numero guardado sem o digito).
function _ccMesmaConta(acctid, numero) {
    const d = s => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
    const a = d(acctid), b = d(numero);
    if (!a || !b || a === b) return true;
    return Math.min(a.length, b.length) >= 4 && (a.endsWith(b) || b.endsWith(a) || a.startsWith(b) || b.startsWith(a));
}

// Repasses de cartao dos recebimentos ja baixados no cartao: um por data, com o LIQUIDO (bruto - taxa) que o banco deposita.
// Com movimentos (conta aceitou): a entrada bruta e a saida da taxa do mesmo dia; sem movimentos: cr.cartao.repasses e as taxas.
function _ccRepasses() {
    const movs = db.movimentos_fin || [];
    const out = [];
    // Indices (uma passada): entradas por CR, saidas por CP e taxas de cartao por CR.
    const add = (mapa, k, v) => { let a = mapa.get(k); if (!a) mapa.set(k, (a = [])); a.push(v); };
    const entradasPorCr = new Map(), saidasPorCp = new Map(), taxasPorCr = new Map();
    movs.forEach(m => {
        if (!m || m.origem_id == null) return;
        if (m.origem === 'cr' && m.sentido === 'entrada') add(entradasPorCr, String(m.origem_id), m);
        else if (m.origem === 'cp' && m.sentido === 'saida') add(saidasPorCp, String(m.origem_id), m);
    });
    (db.contas_pagar || []).forEach(cp => { if (cp && cp.categoria === 'taxa_cartao' && cp.origem_cr_id != null) add(taxasPorCr, String(cp.origem_cr_id), cp); });
    (db.contas_receber || []).forEach(cr => {
        if (!cr || cr.status !== 'Pago' || !cr.cartao) return;
        const taxas = taxasPorCr.get(String(cr.id)) || [];
        const entradas = entradasPorCr.get(String(cr.id)) || [];
        if (entradas.length) {
            entradas.forEach(m => {
                const tx = taxas.flatMap(cp => saidasPorCp.get(String(cp.id)) || []).filter(t => t.data === m.data && CaixaCore.mesmoId(t.conta_id, m.conta_id));
                out.push({ crId: cr.id, data: String(m.data).slice(0, 10), liquido: CaixaCore.arredondar(Number(m.valor) - tx.reduce((s, t) => s + Number(t.valor), 0)), contaId: m.conta_id, movIds: [m.id].concat(tx.map(t => t.id)), cr });
            });
        } else if (Array.isArray(cr.cartao.repasses) && cr.conta_id != null) {
            cr.cartao.repasses.forEach(r => {
                const taxa = taxas.filter(cp => cp.data_vencimento === r.data).reduce((s, cp) => s + Number(cp.valor), 0);
                out.push({ crId: cr.id, data: String(r.data).slice(0, 10), liquido: CaixaCore.arredondar(Number(r.bruto) - taxa), contaId: cr.conta_id, movIds: [], cr });
            });
        }
    });
    return out;
}

// Tudo o que o nucleo precisa para sugerir; jaUsados = o que outras linhas ja conciliaram (repasse e os movimentos dele andam juntos).
function _ccContexto(contaId) {
    const jaUsados = new Set();
    _ccExtrato().forEach(l => {
        if (!_ccFeita(l)) return;
        _ccMovIds(l).forEach(id => jaUsados.add('mov:' + id));
        (l.vinculos || []).forEach(v => jaUsados.add(v.t === 'rep' ? 'rep:' + v.id + ':' + v.data : v.t + ':' + v.id));
    });
    const repasses = _ccRepasses();
    repasses.forEach(r => {
        const k = 'rep:' + r.crId + ':' + r.data;
        if (r.movIds.some(id => jaUsados.has('mov:' + id))) jaUsados.add(k);
        if (jaUsados.has(k)) r.movIds.forEach(id => jaUsados.add('mov:' + id));
    });
    return { contaId, contasReceber: db.contas_receber || [], contasPagar: db.contas_pagar || [], movimentos: db.movimentos_fin || [], repasses, jaUsados };
}

// Chave de item ('mov:ID', 'cr:ID', 'cp:ID', 'rep:CRID:AAAA-MM-DD') -> { k, t, id, valor, data, descricao, ... } ou null.
function _ccResolver(k, ctx) {
    const i = k.indexOf(':'), t = k.slice(0, i), resto = k.slice(i + 1);
    if (t === 'mov') {
        const m = (db.movimentos_fin || []).find(x => String(x.id) === resto);
        return m ? { k, t, id: m.id, valor: Number(m.valor), data: String(m.data).slice(0, 10), descricao: m.descricao || 'Movimento', mov: m } : null;
    }
    if (t === 'cr' || t === 'cp') {
        const reg = _ccLista(t).find(x => String(x.id) === resto);
        return reg ? { k, t, id: reg.id, valor: Number(reg.valor), data: String(reg.data_vencimento || '').slice(0, 10),
            descricao: [t === 'cr' ? reg.cliente_nome : reg.credor_nome, reg.descricao].filter(Boolean).join(' - ') || 'Lançamento', reg } : null;
    }
    if (t === 'rep') {
        const j = resto.lastIndexOf(':'), crId = resto.slice(0, j), data = resto.slice(j + 1);
        const r = ctx.repasses.find(x => String(x.crId) === crId && x.data === data);
        return r ? { k, t, id: r.crId, valor: r.liquido, data, descricao: 'Repasse de cartão — ' + ([r.cr.cliente_nome, r.cr.descricao].filter(Boolean).join(' - ') || 'Recebimento'), rep: r } : null;
    }
    return null;
}

function _ccChavesDaSugestao(s, linha) {
    if (s.tipo === 'movimento') return s.ids.map(id => 'mov:' + id);
    if (s.tipo === 'lancamento') return s.ids.map(id => (linha.valor > 0 ? 'cr:' : 'cp:') + id);
    return s.ids.map(id => 'rep:' + id + ':' + s.data);
}

const _ccRotuloTipo = { mov: 'Movimento', cr: 'Lançamento', cp: 'Lançamento', rep: 'Repasse de cartão' };
function _ccTextoSugestao(s) {
    const data = _fxDm(s.data);
    if (s.tipo === 'repasses') return `<strong>${s.ids.length} repasses de cartão</strong> de ${data} — ${_fxBrl(s.valor)}`;
    const rot = { movimento: 'Movimento', lancamento: 'Lançamento', repasse: 'Repasse de cartão' }[s.tipo];
    return `<strong>${rot}</strong> · ${escapeHtml(s.descricao || '')} — ${_fxBrl(s.valor)} · ${s.tipo === 'lancamento' ? 'vence' : 'em'} ${data}`;
}

// Itens para "Escolher outro": as sugestoes, os movimentos da conta (mesmo sentido, ate 31 dias), os lancamentos em aberto
// do lado (vencimento ate 60 dias) e os repasses da conta (ate 31 dias), sem os ja conciliados. Sugestoes primeiro, depois por data.
function _ccCandidatos(linha, ctx) {
    const entrada = linha.valor > 0, sentido = entrada ? 'entrada' : 'saida';
    const perto = (d, dias) => /^\d{4}-\d{2}-\d{2}/.test(String(d || '')) && _ccDias(String(d).slice(0, 10), linha.data) <= dias;
    const sug = [];
    ConciliacaoCore.sugestoes(linha, ctx).forEach(s => _ccChavesDaSugestao(s, linha).forEach(k => sug.push(k)));
    const outros = [];
    ctx.movimentos.forEach(m => { if (m && CaixaCore.mesmoId(m.conta_id, linha.conta_id) && m.sentido === sentido && perto(m.data, 31)) outros.push('mov:' + m.id); });
    (entrada ? ctx.contasReceber : ctx.contasPagar).forEach(r => { if (finAberta(r) && perto(r.data_vencimento, 60)) outros.push((entrada ? 'cr:' : 'cp:') + r.id); });
    if (entrada) ctx.repasses.forEach(r => { if (CaixaCore.mesmoId(r.contaId, linha.conta_id) && perto(r.data, 31)) outros.push('rep:' + r.crId + ':' + r.data); });
    const vistos = new Set();
    const lista = [];
    sug.concat(outros).forEach((k, i) => {
        if (vistos.has(k) || ctx.jaUsados.has(k)) return;
        vistos.add(k);
        const it = _ccResolver(k, ctx);
        if (it) lista.push(Object.assign(it, { sugerido: i < sug.length }));
    });
    const dist = it => (/^\d{4}-\d{2}-\d{2}$/.test(it.data) ? _ccDias(it.data, linha.data) : 9999);
    return lista.sort((a, b) => (b.sugerido - a.sugerido) || (dist(a) - dist(b)));
}

// Ids de movimentos e lancamentos pagos (montado uma vez por tela; ver ConciliacaoCore.indiceVinculos).
function _ccIndiceVinculos() {
    return ConciliacaoCore.indiceVinculos({ movimentos: db.movimentos_fin || [], contasReceber: db.contas_receber || [], contasPagar: db.contas_pagar || [] });
}
// Linha conciliada cujos movimentos (ou baixas) sumiram por fora (estorno, exclusao da transferencia): nao vale mais.
function _ccOrfa(l, iv) { return ConciliacaoCore.linhaOrfa(l, iv || _ccIndiceVinculos()); }
function _ccVoltarPendente(l) {
    l.situacao = 'pendente';
    l.mov_id = null;
    ['mov_ids', 'vinculos', 'conc_desc', 'conc_em', 'conc_por', 'transf_grupo', 'criado', 'datas_antes'].forEach(k => delete l[k]);
}
// Volta para pendente as linhas orfas (sem gravar). Devolve os ids delas.
function _ccDesligarSumidos() {
    const iv = _ccIndiceVinculos();
    const ids = [];
    _ccExtrato().forEach(l => { if (_ccOrfa(l, iv)) { _ccVoltarPendente(l); ids.push(l.id); } });
    return ids;
}

// ---------- Importar ----------
async function importarExtrato(contaPadrao) {
    if (!await exigirPermissao('financeiro.fluxo', 'completo')) return;
    const ativas = _ccAtivas();
    if (!ativas.length) { await showAlert('Cadastre uma conta antes de importar o extrato.', 'ℹ️'); return; }
    document.getElementById('conc-imp-modal')?.remove();
    const padrao = contaPadrao != null && contaPadrao !== '' ? contaPadrao : (finFluxo.contaId !== '' ? finFluxo.contaId : '');
    const campo = 'width:100%;padding:6px;border:1px solid var(--border-strong);border-radius:4px;font-size:13px;box-sizing:border-box;margin-bottom:10px';
    const o = document.createElement('div');
    o.id = 'conc-imp-modal';
    o.className = 'sc-modal-overlay';
    o.style.display = 'flex';
    o.innerHTML = `<div class="sc-modal-box" style="text-align:left;max-width:440px;width:calc(100% - 32px)" role="dialog" aria-modal="true" aria-labelledby="conc-imp-titulo">
        <h3 id="conc-imp-titulo" style="margin:0 0 12px;font-size:16px">Importar extrato (OFX)</h3>
        <label style="display:block;font-size:12px;margin-bottom:4px" for="conc-imp-conta">Conta <span style="color:#F43927">*</span></label>
        <select id="conc-imp-conta" style="${campo}"><option value="">Selecione…</option>${ativas.map(c => `<option value="${escapeHtml(String(c.id))}"${String(c.id) === String(padrao) ? ' selected' : ''}>${escapeHtml(c.nome || '')}</option>`).join('')}</select>
        <label style="display:block;font-size:12px;margin-bottom:4px" for="conc-imp-arquivo">Arquivo .ofx <span style="color:#F43927">*</span></label>
        <input type="file" id="conc-imp-arquivo" accept=".ofx,.OFX,application/x-ofx" style="${campo}">
        <p class="lanc-sub" style="margin:0 0 10px">Baixe o extrato no site ou no aplicativo do banco no formato OFX. Linhas que já foram importadas são puladas.</p>
        <div id="conc-imp-erro" role="alert" style="display:none;color:var(--danger-text);font-size:12px;margin-bottom:10px"></div>
        <div class="sc-modal-btns"><button class="btn btn-outline" id="conc-imp-cancel">Cancelar</button><button class="btn btn-success" id="conc-imp-ok">Importar</button></div>
    </div>`;
    document.body.appendChild(o);
    const erroEl = o.querySelector('#conc-imp-erro');
    const erro = msg => { erroEl.textContent = msg; erroEl.style.display = msg ? 'block' : 'none'; };
    const fechar = () => { document.removeEventListener('keydown', esc); o.remove(); };
    const esc = e => { if (e.key === 'Escape' && o.style.display !== 'none') fechar(); };
    document.addEventListener('keydown', esc);
    o.querySelector('#conc-imp-cancel').onclick = fechar;
    let ocupado = false;
    o.querySelector('#conc-imp-ok').onclick = async () => {
        if (ocupado) return;
        const conta = _contaFinPorId(o.querySelector('#conc-imp-conta').value);
        const arq = o.querySelector('#conc-imp-arquivo').files[0];
        if (!conta) return erro('Escolha a conta.');
        if (!arq) return erro('Escolha o arquivo .ofx do banco.');
        ocupado = true;
        try {
            let bytes;
            try { bytes = new Uint8Array(await arq.arrayBuffer()); } catch (e) { erro('Não foi possível ler o arquivo.'); return; }
            const r = ConciliacaoCore.lerOfx(ConciliacaoCore.decodificar(bytes));
            if (!r.linhas.length) { erro(r.erros.length ? r.erros.join(' ') : 'O arquivo não tem nenhuma movimentação.'); return; }
            erro('');
            if (r.conta && conta.numero_conta && !_ccMesmaConta(r.conta, conta.numero_conta)) {
                o.style.display = 'none';
                const seguir = await showConfirm(`Este extrato parece ser da conta ${r.conta}, e você escolheu ${conta.nome || ''}. Importar mesmo assim?`, '⚠️', 'Importar', 'Cancelar');
                o.style.display = 'flex';
                if (!seguir) return;
            }
            const ext = _ccExtrato();
            const novas = ConciliacaoCore.novasLinhas(r.linhas, ext, conta.id);
            const novoId = _novosIdsFin(ext);
            if (novas.length) {
                // Arquivo e hora uma vez por importacao (cada linha guarda so o id dela).
                const imp = { id: _novosIdsFin(_ccImps())(), conta_id: conta.id, arquivo: arq.name || '', importado_em: new Date().toISOString(), linhas: novas.length };
                _ccImps().push(imp);
                novas.forEach(n => ext.push({ id: novoId(), conta_id: conta.id, fitid: n.fitid, data: n.data, valor: n.valor, descricao: n.descricao,
                    imp: imp.id, situacao: 'pendente', mov_id: null }));
                _finContaTocada(conta.id);
            }
            syncDB();
            fechar();
            let resumo = `${novas.length} linha(s) nova(s) importada(s); ${r.linhas.length - novas.length} já estavam no sistema.`;
            toast(resumo, 'success', 6000);
            if (r.erros.length) resumo += ' ' + r.erros.join(' ');
            renderFinFluxo();
            abrirConciliacao(conta.id);
            finConc.resumo = resumo;
            _ccRender();
        } finally { ocupado = false; }
    };
    o.querySelector('#conc-imp-conta').focus();
}

// ---------- Tela Conciliar ----------
function abrirConciliacao(contaId) {
    if (!temAcesso('financeiro.fluxo', 'completo')) { exigirPermissao('financeiro.fluxo', 'completo'); return; }
    const contas = getContasFin();
    const pedida = contaId != null && contaId !== '' ? contas.find(c => CaixaCore.mesmoId(c.id, contaId)) : null;
    let id = pedida ? pedida.id : null;
    if (id == null) {
        const ativas = _ccAtivas();
        const comPend = ativas.find(c => _ccExtrato().some(l => l && CaixaCore.mesmoId(l.conta_id, c.id) && l.situacao === 'pendente'));
        id = comPend ? comPend.id : (ativas[0] ? ativas[0].id : null);
    }
    Object.assign(finConc, { contaId: id, aba: 'pendente', escolher: null, resumo: '' });
    finConc.marcados.clear();
    if (_ccDesligarSumidos().length) _gravarChaves(['sc_fin_extrato']);
    document.getElementById('conc-overlay')?.remove();
    const o = document.createElement('div');
    o.id = 'conc-overlay';
    o.className = 'dre-rel';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-label', 'Conciliar extrato');
    o.tabIndex = -1;
    o.innerHTML = `<div class="dre-rel-caixa">
        <div class="dre-topo"><h3>Conciliar extrato</h3>
            <div class="dre-acoes">
                <button class="btn btn-outline btn-sm" id="conc-btn-importar" onclick="importarExtrato(finConc.contaId)">Importar extrato</button>
                <button class="btn btn-outline btn-sm" id="conc-fechar" onclick="_ccFechar()">Fechar</button>
            </div></div>
        <div id="conc-corpo"></div></div>`;
    document.body.appendChild(o);
    o.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); _ccFechar(); } });
    o.addEventListener('change', e => {
        if (e.target.id === 'conc-conta') {
            const c = _contaFinPorId(e.target.value);
            Object.assign(finConc, { contaId: c ? c.id : null, escolher: null, resumo: '' });
            finConc.marcados.clear();
            _ccRender();
        } else if (e.target.classList.contains('conc-cand-check')) {
            if (e.target.checked) finConc.marcados.add(e.target.value); else finConc.marcados.delete(e.target.value);
            _ccAtualizarSoma();
        }
    });
    _ccRender();
    o.focus();
}

function _ccFechar() {
    document.getElementById('conc-overlay')?.remove();
    finConc.escolher = null;
    finConc.marcados.clear();
    renderFinFluxo();
    document.getElementById('fluxo-btn-conciliar')?.focus();
}

function finConcAba(aba) {
    finConc.aba = ['conciliado', 'ignorado'].includes(aba) ? aba : 'pendente';
    finConc.escolher = null;
    finConc.marcados.clear();
    _ccRender();
}

function _ccRender() {
    const corpo = document.getElementById('conc-corpo');
    if (!corpo) return;
    const contas = getContasFin();
    if (finConc.contaId == null || !contas.some(c => CaixaCore.mesmoId(c.id, finConc.contaId))) {
        corpo.innerHTML = '<p class="lanc-aviso" id="conc-sem-conta">Cadastre uma conta (Empresa › Preferências) para importar e conciliar extratos.</p>';
        return;
    }
    const opcs = contas.filter(c => c.ativo !== false || CaixaCore.mesmoId(c.id, finConc.contaId))
        .map(c => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.nome || '')}${c.ativo === false ? ' (desativada)' : ''}</option>`).join('');
    const daConta = _ccDaConta();
    const grupo = _ccGrupo;
    const qtd = a => daConta.filter(l => grupo(l) === a).length;
    const aba = (a, t) => `<button type="button" class="dre-seg-btn${finConc.aba === a ? ' active' : ''}" id="conc-aba-${a}" aria-pressed="${finConc.aba === a}" onclick="finConcAba('${a}')">${t} (${qtd(a)})</button>`;
    const ordem = finConc.aba === 'pendente' ? 1 : -1;
    const lista = daConta.filter(l => grupo(l) === finConc.aba).sort((a, b) => (a.data < b.data ? -ordem : a.data > b.data ? ordem : 0));
    const ctx = _ccContexto(finConc.contaId);
    const perm = _ccPerm();
    const impsAberto = !!document.getElementById('conc-imps')?.open;
    const vazio = {
        pendente: daConta.length ? 'Nenhuma linha pendente: tudo conferido.' : 'Nenhum extrato importado para esta conta. Use "Importar extrato" (arquivo .ofx do banco).',
        conciliado: 'Nenhuma linha conciliada.', ignorado: 'Nenhuma linha ignorada.'
    }[finConc.aba];
    corpo.innerHTML = `<div class="lanc-barra dre-barra">
            <div class="form-group"><label for="conc-conta">Conta</label><select id="conc-conta">${opcs}</select></div>
            <div class="form-group conc-grupo-abas"><label>Linhas</label><div class="dre-seg conc-abas" role="group" aria-label="Linhas">${aba('pendente', 'Pendentes')}${aba('conciliado', 'Conciliadas')}${aba('ignorado', 'Ignoradas')}</div></div>
        </div>
        ${finConc.resumo ? `<p class="lanc-sub conc-resumo" id="conc-resumo">${escapeHtml(finConc.resumo)}</p>` : ''}
        ${_ccImportacoesHtml(daConta, impsAberto)}
        <div class="conc-lista" id="conc-lista">${lista.length ? lista.map(l => _ccLinhaHtml(l, ctx, perm)).join('') : `<p class="lanc-sub" id="conc-vazio">${vazio}</p>`}</div>`;
    corpo.querySelector('#conc-conta').value = String(finConc.contaId);
    _ccAtualizarSoma();
}

// Depois de uma acao: contagens, importacoes e so as linhas afetadas (as de `ids` e, nas Pendentes, as de mesmo valor ±1
// centavo dos `cents`, cujas sugestoes podem ter mudado). `cents` null = redesenha tudo.
function _ccAtualizar(ids, cents) {
    const lista = document.getElementById('conc-lista');
    if (!lista || cents == null || !lista.querySelector('.conc-linha')) { _ccRender(); return; }
    const daConta = _ccDaConta();
    Object.keys(_CC_ABAS).forEach(a => {
        const b = document.getElementById('conc-aba-' + a);
        if (b) b.textContent = _CC_ABAS[a] + ' (' + daConta.filter(l => _ccGrupo(l) === a).length + ')';
    });
    const imps = document.getElementById('conc-imps');
    if (imps) imps.outerHTML = _ccImportacoesHtml(daConta, imps.open);
    const ctx = _ccContexto(finConc.contaId), perm = _ccPerm();
    const alvo = new Set((ids || []).filter(x => x != null).map(String));
    const cs = [...cents];
    lista.querySelectorAll('.conc-linha').forEach(el => {
        const l = _ccLinha(el.dataset.id);
        const c = l ? Math.abs(_ccCent(l.valor)) : null;
        if (!alvo.has(el.dataset.id) && !(finConc.aba === 'pendente' && c != null && cs.some(x => Math.abs(x - c) <= 1))) return;
        if (!l || _ccGrupo(l) !== finConc.aba) el.remove(); else el.outerHTML = _ccLinhaHtml(l, ctx, perm);
    });
    if (!lista.querySelector('.conc-linha')) { _ccRender(); return; }
    _ccAtualizarSoma();
}

// Importacoes da conta (arquivo, quando, linhas): ignorar as pendentes de uma vez ou excluir a importacao inteira
// (so quando nenhuma linha dela esta conciliada).
function _ccImportacoesHtml(daConta, aberto) {
    const grupos = new Map();
    daConta.forEach(l => {
        const i = _ccImportacao(l);
        let g = grupos.get(i.chave);
        if (!g) grupos.set(i.chave, (g = Object.assign({ total: 0, pend: 0, feitas: 0 }, i)));
        g.total++;
        if (l.situacao === 'pendente') g.pend++;
        if (_ccFeita(l)) g.feitas++;
    });
    if (!grupos.size) return '<div id="conc-imps" hidden></div>';
    const quando = s => { const d = new Date(s); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
    const lista = [...grupos.values()].sort((a, b) => String(b.importado_em).localeCompare(String(a.importado_em)));
    return `<details class="conc-imps" id="conc-imps"${aberto ? ' open' : ''}><summary>Importações desta conta (${lista.length})</summary>${lista.map(g => {
        const k = escapeHtml(JSON.stringify(g.chave));
        return `<div class="conc-imp" data-chave="${escapeHtml(g.chave)}"><span class="conc-imp-desc"><strong>${escapeHtml(g.arquivo || 'Arquivo sem nome')}</strong>${g.importado_em ? ' · ' + escapeHtml(quando(g.importado_em)) : ''} · ${g.total} linha(s), ${g.pend} pendente(s)</span>
            <span class="conc-imp-acoes">${g.pend ? `<button type="button" class="btn btn-outline btn-sm conc-imp-ignorar" onclick="concImpIgnorar(${k})">Ignorar todas as pendentes desta importação</button>` : ''}${g.feitas ? '' : `<button type="button" class="btn btn-outline btn-sm conc-imp-excluir" onclick="concImpExcluir(${k})">Excluir esta importação</button>`}</span></div>`;
    }).join('')}</details>`;
}

async function concImpIgnorar(chave) {
    if (!await exigirPermissao('financeiro.fluxo', 'completo')) return;
    const linhas = _ccDaConta().filter(l => l.situacao === 'pendente' && _ccImportacao(l).chave === chave);
    if (!linhas.length) return;
    if (!await showConfirm(`Ignorar as ${linhas.length} linha(s) pendentes desta importação?`, '⚠️', 'Ignorar todas', 'Cancelar')) return;
    const agora = new Date().toISOString(), quem = (getUsuarioLogado() || {}).id ?? null;
    linhas.forEach(l => Object.assign(l, { situacao: 'ignorado', conc_em: agora, conc_por: quem }));
    _gravarChaves(['sc_fin_extrato']);
    finConc.escolher = null;
    finConc.marcados.clear();
    _ccRender();
    renderFinFluxo();
}

async function concImpExcluir(chave) {
    if (!await exigirPermissao('financeiro.fluxo', 'completo')) return;
    const linhas = _ccDaConta().filter(l => _ccImportacao(l).chave === chave);
    if (!linhas.length) return;
    if (linhas.some(_ccFeita)) { await showAlert('Esta importação tem linhas conciliadas. Desfaça as conciliações antes de excluir.', '⚠️'); return; }
    if (!await showConfirm(`Excluir esta importação? As ${linhas.length} linha(s) dela saem da conciliação (o arquivo pode ser importado de novo).`, '🗑️', 'Excluir', 'Cancelar')) return;
    if (_ccDaConta().filter(l => _ccImportacao(l).chave === chave).some(_ccFeita)) { _ccRender(); return; }
    db.fin_extrato = _ccExtrato().filter(l => !linhas.includes(l));
    if (chave.startsWith('i:')) db.fin_extrato_imp = _ccImps().filter(i => 'i:' + i.id !== chave);
    _gravarChaves(['sc_fin_extrato', 'sc_fin_extrato_imp']);
    finConc.escolher = null;
    finConc.marcados.clear();
    _ccRender();
    renderFinFluxo();
    toast('Importação excluída.');
}

function _ccLinhaHtml(l, ctx, perm) {
    const entrada = l.valor > 0;
    const idJs = escapeHtml(_fxIdJs(l.id));
    const ladoOk = (perm || _ccPerm())[entrada ? 'receber' : 'pagar'];
    const topo = `<div class="conc-linha-topo"><span class="conc-data">${_fxDataBr(l.data)}</span><span class="conc-desc">${escapeHtml(l.descricao || '—')}</span>
        <span class="conc-valor ${entrada ? 'fluxo-ent' : 'fluxo-sai'}">${entrada ? '+' : '−'} ${_fxBrl(Math.abs(l.valor))}</span></div>`;
    const btn = (cls, txt, fn, tipo) => `<button type="button" class="btn btn-sm ${tipo || 'btn-outline'} ${cls}" onclick="${fn}(${idJs})">${txt}</button>`;
    let meio = '', acoes = '';
    if (finConc.aba === 'pendente') {
        const sug = ConciliacaoCore.sugestoes(l, ctx)[0];
        meio = sug ? `<div class="conc-sug">Sugestão: ${_ccTextoSugestao(sug)}</div>` : '<div class="conc-sug conc-sem">Nenhuma sugestão automática.</div>';
        // Confirmar um lancamento da baixa: precisa tambem de completo no lado (pagar/receber).
        const podeConfirmar = sug && (sug.tipo !== 'lancamento' || ladoOk);
        acoes = (podeConfirmar ? btn('conc-confirmar', 'Confirmar', 'concConfirmar', 'btn-success') : '')
            + btn('conc-btn-escolher', 'Escolher outro', 'concEscolher')
            + (ladoOk ? btn('conc-criar', 'Criar lançamento', 'concCriarLancamento') : '')
            + btn('conc-transf', 'É transferência', 'concTransferencia')
            + btn('conc-ignorar', 'Ignorar', 'concIgnorar');
        if (finConc.escolher != null && String(finConc.escolher) === String(l.id)) meio += _ccEscolherHtml(l, ctx, ladoOk);
    } else {
        const quando = l.conc_em ? ' · ' + new Date(l.conc_em).toLocaleDateString('pt-BR') : '';
        meio = finConc.aba === 'ignorado' ? `<div class="conc-sug conc-sem">Ignorada${quando}</div>`
            : `<div class="conc-sug">${l.situacao === 'transferencia' ? '<span class="fluxo-selo fluxo-selo-transf">Transferência</span> ' : ''}${escapeHtml(l.conc_desc || 'Conciliada')}${quando}</div>`;
        acoes = btn('conc-desfazer', 'Desfazer', 'desfazerConciliacao');
    }
    return `<div class="conc-linha" id="conc-linha-${escapeHtml(String(l.id))}" data-id="${escapeHtml(String(l.id))}">${topo}${meio}<div class="conc-acoes">${acoes}</div></div>`;
}

function _ccEscolherHtml(l, ctx, ladoOk) {
    const itens = _ccCandidatos(l, ctx).map(c => {
        const trava = (c.t === 'cr' || c.t === 'cp') && !ladoOk;
        return `<label class="conc-cand${trava ? ' conc-cand-trava' : ''}"${trava ? ' title="Sem permissão para dar baixa neste lançamento"' : ''}>
            <input type="checkbox" class="conc-cand-check" value="${escapeHtml(c.k)}" data-cent="${Math.abs(_ccCent(c.valor))}" data-movs="${escapeHtml(JSON.stringify((c.t === 'rep' ? c.rep.movIds : c.t === 'mov' ? [c.id] : []).map(String)))}"${trava ? ' data-trava="1"' : ''}${finConc.marcados.has(c.k) ? ' checked' : ''}${trava ? ' disabled' : ''}>
            <span class="conc-cand-tipo">${_ccRotuloTipo[c.t]}${c.sugerido ? ' · sugerido' : ''}</span>
            <span class="conc-cand-desc">${escapeHtml(c.descricao)}${/^\d{4}-\d{2}-\d{2}$/.test(c.data) ? ' · ' + _fxDm(c.data) : ''}</span>
            <strong class="conc-cand-valor">${_fxBrl(c.valor)}</strong></label>`;
    }).join('');
    return `<div class="conc-escolher" id="conc-escolher">
        <p class="lanc-sub" style="margin:0 0 6px">Marque um ou mais itens cuja soma dê ${_fxBrl(Math.abs(l.valor))}.</p>
        <div class="conc-cands">${itens || '<p class="lanc-sub" id="conc-sem-cand">Nenhum lançamento, movimento ou repasse por perto. Use "Criar lançamento".</p>'}</div>
        <div class="conc-escolher-rodape"><span id="conc-soma"></span>
            <button type="button" class="btn btn-success btn-sm" id="conc-escolher-ok" disabled onclick="concConfirmarEscolhidos()">Confirmar</button>
            <button type="button" class="btn btn-outline btn-sm" id="conc-escolher-cancelar" onclick="concEscolher(null)">Cancelar</button></div>
    </div>`;
}

// Soma do que esta marcado em "Escolher outro"; Confirmar so com a soma igual ao valor da linha (±0,01).
function _ccAtualizarSoma() {
    const el = document.getElementById('conc-soma');
    const l = _ccLinha(finConc.escolher);
    if (!el || !l) return;
    const alvo = Math.abs(_ccCent(l.valor));
    const todos = [...document.querySelectorAll('#conc-escolher .conc-cand-check')];
    // Repasse e o movimento que ja o representa sao o mesmo dinheiro: marcado um, o outro fica travado.
    const movsDe = c => { try { return JSON.parse(c.dataset.movs || '[]'); } catch (e) { return []; } };
    const usados = new Set(todos.filter(c => c.checked).flatMap(movsDe));
    todos.forEach(c => {
        if (c.dataset.trava || c.checked) return;
        const conflita = movsDe(c).some(id => usados.has(id));
        c.disabled = conflita;
        c.closest('.conc-cand')?.classList.toggle('conc-cand-trava', conflita);
    });
    const marc = todos.filter(c => c.checked);
    const soma = marc.reduce((s, c) => s + Number(c.dataset.cent || 0), 0);
    const bate = marc.length > 0 && Math.abs(soma - alvo) <= 1;
    el.textContent = `Marcado: ${_fxBrl(soma / 100)} de ${_fxBrl(alvo / 100)}${marc.length && !bate ? (soma < alvo ? ` (faltam ${_fxBrl((alvo - soma) / 100)})` : ` (passou ${_fxBrl((soma - alvo) / 100)})`) : ''}`;
    el.classList.toggle('conc-soma-ok', bate);
    document.getElementById('conc-escolher-ok').disabled = !bate;
}

function concEscolher(id) {
    const antes = finConc.escolher;
    finConc.escolher = id == null || (finConc.escolher != null && String(finConc.escolher) === String(id)) ? null : id;
    finConc.marcados.clear();
    _ccAtualizar([antes, finConc.escolher], []);
}

// ---------- Acoes ----------
async function concConfirmar(id) {
    const l = _ccLinha(id);
    if (!l || l.situacao !== 'pendente') return;
    const sug = ConciliacaoCore.sugestoes(l, _ccContexto(l.conta_id))[0];
    if (!sug) { _ccRender(); return; }
    await _ccAplicar(l.id, _ccChavesDaSugestao(sug, l));
}
async function concConfirmarEscolhidos() {
    const l = _ccLinha(finConc.escolher);
    if (!l || !finConc.marcados.size) return;
    await _ccAplicar(l.id, [...finConc.marcados]);
}

// Concilia a linha com os itens (chaves). Lancamento em aberto: baixa na data do extrato e na conta do extrato (rotinas de
// baixa de sempre); movimento: so liga; repasse: liga aos movimentos dele (sem movimento: fica conferido). Devolve true se conciliou.
async function _ccAplicar(linhaId, chaves, opcoes) {
    opcoes = opcoes || {};
    if (!await exigirPermissao('financeiro.fluxo', 'completo')) return false;
    const l = _ccLinha(linhaId);
    if (!l || l.situacao !== 'pendente') { _ccRender(); return false; }
    const entrada = l.valor > 0;
    const ctx = _ccContexto(l.conta_id);
    const itens = chaves.map(k => _ccResolver(k, ctx));
    const refazer = async msg => { await showAlert(msg, '⚠️'); finConc.marcados.clear(); _ccRender(); return false; };
    if (!chaves.length || itens.some(i => !i) || chaves.some(k => ctx.jaUsados.has(k))) return refazer('Um dos itens escolhidos já foi conciliado ou não existe mais. Confira a lista.');
    if (itens.some(i => (i.t === 'cr' && !entrada) || (i.t === 'cp' && entrada) || (i.t === 'rep' && !entrada) || (i.t === 'mov' && i.mov.sentido !== (entrada ? 'entrada' : 'saida'))))
        return refazer('Os itens escolhidos não são do mesmo sentido da linha do extrato.');
    const movsDosItens = itens.flatMap(i => (i.t === 'rep' ? i.rep.movIds : i.t === 'mov' ? [i.id] : []).map(String));
    if (new Set(movsDosItens).size !== movsDosItens.length) return refazer('Um repasse e o movimento dele são o mesmo dinheiro: escolha só um dos dois.');
    const soma = itens.reduce((s, i) => s + Math.abs(_ccCent(i.valor)), 0);
    if (Math.abs(soma - Math.abs(_ccCent(l.valor))) > 1) return refazer('A soma dos itens escolhidos não bate com o valor do extrato.');
    const lancs = itens.filter(i => i.t === 'cr' || i.t === 'cp');
    if (lancs.some(i => !finAberta(i.reg))) return refazer('Este lançamento já foi baixado ou cancelado.');
    if (lancs.length && !await exigirPermissao(entrada ? FIN_LADOS.receber : FIN_LADOS.pagar, 'completo')) return false;
    const conta = _contaFinPorId(l.conta_id);
    if (lancs.length && !conta) return refazer('A conta deste extrato não existe mais.');
    const dm = _fxDm(l.data);
    // O que a baixa troca e o estorno nao devolve: o Desfazer restaura daqui.
    const antes = new Map(lancs.map(i => {
        const ped = i.reg.pedido_id != null ? (db.pedidos || []).find(p => p.id == i.reg.pedido_id) : null;
        const nn = v => (v === undefined ? null : v);
        return [i.k, { conta_id: nn(i.reg.conta_id), forma_pagamento: nn(i.reg.forma_pagamento), meio_id: nn(i.reg.meio_id),
            pagamento_pendente: ped ? nn(ped.pagamento_pendente) : undefined }];
    }));
    if (lancs.length) {
        const meios = getMeiosPag();
        const linhas = lancs.map(i => {
            // Meio previsto (que nao seja cartao) vira o meio da baixa; o dinheiro caiu direto na conta do extrato.
            const mp = i.reg.meio_previsto;
            const meio = mp ? meios.find(m => CaixaCore.mesmoId(m.id, mp.meio_id) && m.tipo !== 'cartao_credito' && m.tipo !== 'cartao_debito') : null;
            return { id: i.reg.id, valor: null, meio_id: meio ? meio.id : null, meio_nome: '', conta_id: conta.id, cartao: null };
        });
        const r = entrada ? baixarContasReceber(l.data, linhas) : baixarContasPagar(l.data, linhas);
        if (!r.ok) return refazer(r.erro);
    }
    const movIds = [], vinculos = [], descs = [];
    const lancDoMov = m => ((m.origem === 'cr' || m.origem === 'cp') && m.origem_id != null ? _ccLista(m.origem).find(x => CaixaCore.mesmoId(x.id, m.origem_id)) : null);
    itens.forEach(i => {
        if (i.t === 'mov') {
            movIds.push(i.id);
            vinculos.push({ t: 'mov', id: i.id });
            const reg = lancDoMov(i.mov);
            if (reg) finHist(reg, 'conciliado', `Conciliado com o extrato de ${dm}`);
        } else if (i.t === 'cr' || i.t === 'cp') {
            (db.movimentos_fin || []).filter(m => m.origem === i.t && CaixaCore.mesmoId(m.origem_id, i.reg.id)).forEach(m => movIds.push(m.id));
            vinculos.push({ t: i.t, id: i.reg.id, baixa: true, antes: antes.get(i.k) });
            finHist(i.reg, 'conciliado', `Conciliado com o extrato de ${dm}`);
        } else {
            i.rep.movIds.forEach(id => movIds.push(id));
            vinculos.push({ t: 'rep', id: i.rep.crId, data: i.data });
            finHist(i.rep.cr, 'conciliado', `Repasse do cartão de ${_fxDm(i.data)} conciliado com o extrato de ${dm}`);
        }
        descs.push(`${_ccRotuloTipo[i.t]}: ${i.descricao} (${_fxBrl(i.valor)})`);
    });
    const daqui = movIds.find(id => { const m = (db.movimentos_fin || []).find(x => String(x.id) === String(id)); return m && CaixaCore.mesmoId(m.conta_id, l.conta_id); });
    Object.assign(l, { situacao: 'conciliado', mov_id: daqui != null ? daqui : (movIds.length ? movIds[0] : null), mov_ids: movIds, vinculos,
        conc_desc: (opcoes.criado ? 'Lançamento criado · ' : '') + descs.join(' + '), conc_em: new Date().toISOString(), conc_por: (getUsuarioLogado() || {}).id ?? null });
    if (opcoes.criado) l.criado = true;
    const adiantados = _ccAdiantarParaExtrato(l, itens);
    if (adiantados) l.datas_antes = adiantados;
    if (conta) _finContaTocada(conta.id);
    syncDB();
    const escolhia = finConc.escolher;
    finConc.escolher = null;
    finConc.marcados.clear();
    // Repasses mexem em grupos de valores (soma do dia): redesenha tudo; senao so as linhas de mesmo valor.
    _ccAtualizar([l.id, escolhia], itens.some(i => i.t === 'rep') ? null : [Math.abs(_ccCent(l.valor))].concat(itens.map(i => Math.abs(_ccCent(i.valor)))));
    renderFinFluxo();
    toast(lancs.length ? 'Conciliado: baixa registrada em ' + _fxDataBr(l.data) + '.' : 'Conciliado.');
    return true;
}

// Movimento de cartao "a cair" (data depois de hoje) que o banco ja depositou: passa para a data do extrato, com a saida da
// taxa do mesmo repasse (e a conta da taxa, se paga nesse dia). Devolve { movs: [{id, data}], cps: [{id, data_pagamento,
// data_vencimento}] } com as datas de antes (o Desfazer volta), ou null se nada mudou.
function _ccAdiantarParaExtrato(l, itens) {
    const hoje = hojeLocal();
    const movs = db.movimentos_fin || [];
    const porId = id => movs.find(x => String(x.id) === String(id));
    const alvoMovs = new Set(), alvoCps = new Set();
    const taxasDe = (crId, data, contaId) => {
        (db.contas_pagar || []).filter(cp => cp && cp.categoria === 'taxa_cartao' && CaixaCore.mesmoId(cp.origem_cr_id, crId) && String(cp.data_pagamento || '').slice(0, 10) === data)
            .forEach(cp => {
                alvoCps.add(cp);
                movs.filter(t => t.origem === 'cp' && t.sentido === 'saida' && CaixaCore.mesmoId(t.origem_id, cp.id) && String(t.data).slice(0, 10) === data && CaixaCore.mesmoId(t.conta_id, contaId)).forEach(t => alvoMovs.add(t));
            });
    };
    itens.forEach(i => {
        if (i.t === 'mov') {
            const m = i.mov;
            const d = String(m.data).slice(0, 10);
            if (d <= hoje) return;
            alvoMovs.add(m);
            if (m.origem === 'cr' && m.origem_id != null) taxasDe(m.origem_id, d, m.conta_id);
        } else if (i.t === 'rep') {
            if (i.data <= hoje) return;
            i.rep.movIds.map(porId).filter(Boolean).forEach(m => alvoMovs.add(m));
            if (!i.rep.movIds.length) return;
            taxasDe(i.rep.crId, i.data, i.rep.contaId);
        }
    });
    if (!alvoMovs.size && !alvoCps.size) return null;
    const antes = { movs: [], cps: [] };
    alvoMovs.forEach(m => { antes.movs.push({ id: m.id, data: m.data }); m.data = l.data; });
    alvoCps.forEach(cp => { antes.cps.push({ id: cp.id, data_pagamento: cp.data_pagamento, data_vencimento: cp.data_vencimento }); cp.data_pagamento = l.data; cp.data_vencimento = l.data; });
    return antes;
}
// Volta as datas que a conciliacao adiantou (so onde ainda estao na data do extrato).
function _ccVoltarDatas(l) {
    const a = l.datas_antes;
    if (!a) return;
    (a.movs || []).forEach(x => { const m = (db.movimentos_fin || []).find(y => CaixaCore.mesmoId(y.id, x.id)); if (m && String(m.data).slice(0, 10) === l.data) m.data = x.data; });
    (a.cps || []).forEach(x => {
        const cp = (db.contas_pagar || []).find(y => CaixaCore.mesmoId(y.id, x.id));
        if (cp && String(cp.data_pagamento || '').slice(0, 10) === l.data) { cp.data_pagamento = x.data_pagamento; cp.data_vencimento = x.data_vencimento; }
    });
}

async function concCriarLancamento(id) {
    if (!await exigirPermissao('financeiro.fluxo', 'completo')) return;
    const l = _ccLinha(id);
    if (!l || l.situacao !== 'pendente') return;
    const lado = l.valor > 0 ? 'receber' : 'pagar';
    await abrirNovoLancamento(lado, null, {
        preencher: { descricao: l.descricao, valor: Math.abs(l.valor), vencimento: l.data, contaId: l.conta_id },
        aoSalvar: async reg => {
            // Valor mudado no formulario: o lancamento novo fica salvo, em aberto, e a linha continua pendente.
            if (Math.abs(_ccCent(reg.valor) - Math.abs(_ccCent(l.valor))) > 1) {
                syncDB();
                _ccRender();
                renderFinFluxo();
                await showAlert('O lançamento foi salvo, mas o valor não bate com o extrato; a linha continua pendente.', '⚠️');
                return;
            }
            const ok = await _ccAplicar(l.id, [(lado === 'receber' ? 'cr:' : 'cp:') + reg.id], { criado: true });
            if (!ok) { syncDB(); _ccRender(); renderFinFluxo(); }
        }
    });
}

async function concTransferencia(id) {
    if (!await exigirPermissao('financeiro.fluxo', 'completo')) return;
    const l = _ccLinha(id);
    if (!l || l.situacao !== 'pendente') return;
    const conta = _contaFinPorId(l.conta_id);
    const outras = _ccAtivas().filter(c => !CaixaCore.mesmoId(c.id, l.conta_id));
    if (!conta) { await showAlert('A conta deste extrato não existe mais.', '⚠️'); return; }
    if (!outras.length) { await showAlert('Cadastre outra conta para registrar a transferência.', 'ℹ️'); return; }
    const saiu = l.valor < 0;
    document.getElementById('conc-transf-modal')?.remove();
    const o = document.createElement('div');
    o.id = 'conc-transf-modal';
    o.className = 'sc-modal-overlay';
    o.style.display = 'flex';
    o.innerHTML = `<div class="sc-modal-box" style="text-align:left;max-width:420px;width:calc(100% - 32px)" role="dialog" aria-modal="true" aria-labelledby="conc-transf-titulo">
        <h3 id="conc-transf-titulo" style="margin:0 0 8px;font-size:16px">É transferência</h3>
        <p style="font-size:13px;margin:0 0 10px">${saiu ? 'Saíram' : 'Entraram'} ${_fxBrl(Math.abs(l.valor))} em ${_fxDataBr(l.data)} ${saiu ? 'de' : 'em'} ${escapeHtml(conta.nome || '')}.</p>
        <label style="display:block;font-size:12px;margin-bottom:4px" for="conc-transf-conta">${saiu ? 'Para qual conta foi?' : 'De qual conta veio?'}</label>
        <select id="conc-transf-conta" style="width:100%;padding:6px;border:1px solid var(--border-strong);border-radius:4px;font-size:13px;box-sizing:border-box;margin-bottom:10px"><option value="">Selecione…</option>${outras.map(c => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.nome || '')}</option>`).join('')}</select>
        <div id="conc-transf-erro" role="alert" style="display:none;color:var(--danger-text);font-size:12px;margin-bottom:10px"></div>
        <div class="sc-modal-btns"><button class="btn btn-outline" id="conc-transf-cancel">Cancelar</button><button class="btn btn-success" id="conc-transf-ok">Registrar transferência</button></div>
    </div>`;
    document.body.appendChild(o);
    const erroEl = o.querySelector('#conc-transf-erro');
    const erro = msg => { erroEl.textContent = msg; erroEl.style.display = msg ? 'block' : 'none'; };
    const fechar = () => { document.removeEventListener('keydown', esc); o.remove(); };
    const esc = e => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc);
    o.querySelector('#conc-transf-cancel').onclick = fechar;
    o.querySelector('#conc-transf-ok').onclick = () => {
        const outra = _contaFinPorId(o.querySelector('#conc-transf-conta').value);
        if (!outra) return erro('Escolha a outra conta.');
        if (l.situacao !== 'pendente') { fechar(); _ccRender(); return; }
        if (l.data > hojeLocal()) return erro('A data não pode ser depois de hoje.');
        if (!CaixaCore.contaAceitaMovimento(conta, l.data) || !CaixaCore.contaAceitaMovimento(outra, l.data))
            return erro('A data é anterior ao saldo inicial de uma das contas.');
        const quem = (getUsuarioLogado() || {}).id ?? null;
        const desc = (saiu ? 'Transferência para ' : 'Transferência de ') + (outra.nome || '');
        // Transferencia ja registrada (pelo extrato da outra conta ou a mao): liga a ela, sem criar outro par.
        const ja = _ccTransferenciaExistente(l, outra);
        if (ja) {
            Object.assign(l, { situacao: 'transferencia', mov_id: ja.id, mov_ids: [ja.id], vinculos: [{ t: 'mov', id: ja.id }],
                conc_desc: desc + ' (já registrada em ' + _fxDm(ja.data) + ')', conc_em: new Date().toISOString(), conc_por: quem });
            _gravarChaves(['sc_fin_extrato']);
            fechar();
            _ccAtualizar([l.id], [Math.abs(_ccCent(l.valor))]);
            renderFinFluxo();
            toast('Ligada à transferência de ' + _fxDm(ja.data) + ' já registrada.');
            return;
        }
        const t = criarTransferenciaFin(saiu ? conta : outra, saiu ? outra : conta, Math.abs(l.valor), l.data);
        const daqui = saiu ? t.saida : t.entrada;
        // So o lado desta conta fica ligado: o outro lado espera a linha do extrato da outra conta.
        Object.assign(l, { situacao: 'transferencia', mov_id: daqui.id, mov_ids: [daqui.id], vinculos: [], transf_grupo: t.grupo,
            conc_desc: desc, conc_em: new Date().toISOString(), conc_por: quem });
        syncDB();
        fechar();
        _ccAtualizar([l.id], [Math.abs(_ccCent(l.valor))]);
        renderFinFluxo();
        toast('Transferência registrada.');
    };
    o.querySelector('#conc-transf-conta').focus();
}

// Lado desta conta de uma transferencia ja registrada com a conta escolhida (o outro lado do par esta nela): mesmo sentido,
// valor ±0,01, data ±5 dias e ainda nao ligado a nenhuma linha de extrato. A de data mais perto. Par com outra conta nao serve.
function _ccTransferenciaExistente(l, outra) {
    const movs = db.movimentos_fin || [];
    const usados = _ccContexto(l.conta_id).jaUsados;
    const sentido = l.valor < 0 ? 'saida' : 'entrada';
    const dia = m => String(m.data || '').slice(0, 10);
    const lista = movs.filter(m => m && m.origem === 'transferencia' && CaixaCore.mesmoId(m.conta_id, l.conta_id) && m.sentido === sentido
        && Math.abs(_ccCent(m.valor) - Math.abs(_ccCent(l.valor))) <= 1 && /^\d{4}-\d{2}-\d{2}$/.test(dia(m))
        && _ccDias(dia(m), l.data) <= 5 && !usados.has('mov:' + m.id));
    const naOutra = m => movs.some(x => x !== m && x.origem === 'transferencia' && x.grupo_id != null && String(x.grupo_id) === String(m.grupo_id) && CaixaCore.mesmoId(x.conta_id, outra.id));
    return lista.filter(naOutra).sort((a, b) => _ccDias(dia(a), l.data) - _ccDias(dia(b), l.data))[0] || null;
}

async function concIgnorar(id) {
    if (!await exigirPermissao('financeiro.fluxo', 'completo')) return;
    const l = _ccLinha(id);
    if (!l || l.situacao !== 'pendente') return;
    Object.assign(l, { situacao: 'ignorado', conc_em: new Date().toISOString(), conc_por: (getUsuarioLogado() || {}).id ?? null });
    _gravarChaves(['sc_fin_extrato']);
    if (String(finConc.escolher) === String(id)) { finConc.escolher = null; finConc.marcados.clear(); }
    _ccAtualizar([l.id], []);
    renderFinFluxo();
}

// Volta a linha para pendente. Se a conciliacao deu baixa, estorna essa baixa (rotinas de estorno de sempre) e devolve
// a conta prevista que o lancamento tinha; se criou a transferencia, exclui o par; se so ligou, so desliga.
async function desfazerConciliacao(extratoId) {
    if (!await exigirPermissao('financeiro.fluxo', 'completo')) return;
    const l = _ccLinha(extratoId);
    if (!l || l.situacao === 'pendente') return;
    if (l.situacao === 'ignorado') {
        _ccVoltarPendente(l);
        _gravarChaves(['sc_fin_extrato']);
        _ccAtualizar([l.id], []);
        renderFinFluxo();
        return;
    }
    const entrada = l.valor > 0;
    const baixas = (l.vinculos || []).filter(v => v.baixa);
    if (baixas.length && !await exigirPermissao(entrada ? FIN_LADOS.receber : FIN_LADOS.pagar, 'completo')) return;
    let msg = 'Desfazer esta conciliação? A linha volta para Pendentes';
    if (baixas.length) msg += ` e ${entrada ? 'o recebimento registrado' : 'o pagamento registrado'} por ela é estornado (volta a ficar em aberto).`;
    else if (l.transf_grupo != null) msg += ' e a transferência criada por ela é excluída.';
    else msg += '; lançamentos e movimentos ficam como estão.';
    if (l.criado) msg += ' O lançamento criado continua em Lançamentos.';
    if (!await showConfirm(msg, '↩', 'Desfazer', 'Cancelar')) return;
    if (!_ccFeita(l)) { _ccRender(); return; }
    const dm = _fxDm(l.data);
    // Valores que voltam a ficar livres (as sugestoes das linhas de mesmo valor mudam).
    const ctxAntes = _ccContexto(l.conta_id);
    const centsLivres = [Math.abs(_ccCent(l.valor))];
    let comRepasse = false;
    (l.vinculos || []).forEach(v => {
        if (v.t === 'rep') { comRepasse = true; return; }
        const it = _ccResolver(v.t + ':' + v.id, ctxAntes);
        if (it) centsLivres.push(Math.abs(_ccCent(it.valor)));
    });
    _ccVoltarDatas(l);
    baixas.forEach(v => {
        const reg = _ccLista(v.t).find(x => CaixaCore.mesmoId(x.id, v.id));
        // Ja estornado (ou baixado de novo em outra data) por fora: nada a estornar aqui.
        if (!reg || reg.status !== 'Pago' || String(reg.data_pagamento || '').slice(0, 10) !== l.data) return;
        finHist(reg, 'conciliado', `Conciliação com o extrato de ${dm} desfeita`);
        if (v.t === 'cr') _estornarCRDados(reg); else _estornarCPDados(reg);
        if (v.antes && _ccLista(v.t).includes(reg)) {
            reg.conta_id = v.antes.conta_id;
            if ('forma_pagamento' in v.antes) reg.forma_pagamento = v.antes.forma_pagamento;
            if ('meio_id' in v.antes) reg.meio_id = v.antes.meio_id;
        }
        if (v.antes && v.antes.pagamento_pendente !== undefined && reg.pedido_id != null) {
            const ped = (db.pedidos || []).find(p => p.id == reg.pedido_id);
            if (ped) { if (v.antes.pagamento_pendente == null) delete ped.pagamento_pendente; else ped.pagamento_pendente = v.antes.pagamento_pendente; }
        }
    });
    (l.vinculos || []).forEach(v => {
        let reg = null;
        if (v.t === 'rep') reg = _ccLista('cr').find(x => CaixaCore.mesmoId(x.id, v.id));
        else if (v.t === 'mov') {
            const m = (db.movimentos_fin || []).find(x => CaixaCore.mesmoId(x.id, v.id));
            if (m && (m.origem === 'cr' || m.origem === 'cp') && m.origem_id != null) reg = _ccLista(m.origem).find(x => CaixaCore.mesmoId(x.id, m.origem_id));
        }
        if (reg) finHist(reg, 'conciliado', `Conciliação com o extrato de ${dm} desfeita`);
    });
    if (l.transf_grupo != null) {
        const par = (db.movimentos_fin || []).filter(m => m.origem === 'transferencia' && m.grupo_id != null && String(m.grupo_id) === String(l.transf_grupo));
        par.forEach(m => _finContaTocada(m.conta_id));
        db.movimentos_fin = (db.movimentos_fin || []).filter(m => !par.includes(m));
    }
    _ccVoltarPendente(l);
    // Outra linha que dependia do que saiu (ex.: movimento ligado a duas coisas) tambem volta.
    const outras = _ccDesligarSumidos();
    syncDB();
    _ccAtualizar([l.id].concat(outras), comRepasse || outras.length ? null : centsLivres);
    renderFinFluxo();
    toast('Conciliação desfeita.');
}

// ===================== RELATORIOS =====================
const finFluxoRel = { tipo: 'categoria', de: '', ate: '' };
const _fxRelTipos = [['categoria', 'Entradas e saídas por categoria'], ['contas', 'Contas a pagar e a receber por período'], ['evolucao', 'Evolução mensal do saldo']];
const _fxRelTitulo = () => (_fxRelTipos.find(t => t[0] === finFluxoRel.tipo) || _fxRelTipos[0])[1];

// Cada relatorio devolve { cab: [{ t, num }], linhas: [{ cel: [texto], xl: [valor], forte }], periodoTxt, regime, nota }.
function _fxRelCategoria() {
    const { de, ate } = finFluxoRel;
    const r = FluxoCore.porCategoria(_fxParams({ de, ate, categoriaId: '' }));
    const subs = (db.fin_categorias && db.fin_categorias.subgrupos) || [];
    const subNome = id => (subs.find(s => String(s.id) === String(id)) || {}).nome || '';
    const ordem = FinCatCore.GRUPOS.slice().sort((a, b) => a.ordem - b.ordem).map(g => ({ id: g.id, rotulo: g.rotulo }))
        .concat([{ id: 'so_caixa', rotulo: 'Só caixa' }, { id: 'ajuste' }, { id: 'transferencia' }, { id: 'sem' }]);
    const grupoDe = l => l.especial === 'ajuste' ? 'ajuste' : l.especial === 'transferencia' ? 'transferencia' : l.especial === 'sem_categoria' ? 'sem' : l.natureza === 'so_caixa' ? 'so_caixa' : (l.grupo || 'sem');
    const soma = l => CaixaCore.arredondar(l.reduce((s, x) => s + x.valor, 0));
    const linhas = [];
    const add = (nome, v, nivel, extra) => linhas.push(Object.assign({ cel: [nome, _fxNum(v)], xl: [nome, v], nivel }, extra));
    const bloco = (titulo, sentido, total, rotuloTotal) => {
        linhas.push({ cel: [titulo, ''], xl: [titulo, ''], forte: true, nivel: 0 });
        const itens = r.linhas.filter(l => l.sentido === sentido).sort((a, b) => b.valor - a.valor);
        if (!itens.length) linhas.push({ cel: ['Nenhum movimento no período', ''], xl: ['Nenhum movimento no período', ''], vazio: true, nivel: 1 });
        ordem.forEach(g => {
            const its = itens.filter(l => grupoDe(l) === g.id);
            if (!its.length) return;
            if (!g.rotulo) { its.forEach(l => add(l.nome, l.valor, 1)); return; }
            add(g.rotulo, soma(its), 1, { semi: true });
            its.filter(l => !l.subgrupo_id).forEach(l => add(l.nome, l.valor, 2));
            [...new Set(its.filter(l => l.subgrupo_id).map(l => l.subgrupo_id))].forEach(sid => {
                const doSub = its.filter(l => l.subgrupo_id === sid);
                add(subNome(sid) || 'Outras', soma(doSub), 2, { semi: true });
                doSub.forEach(l => add(l.nome, l.valor, 3));
            });
        });
        linhas.push({ cel: [rotuloTotal, _fxNum(total)], xl: [rotuloTotal, total], forte: true, nivel: 0 });
    };
    bloco('Entradas', 'entrada', r.entradas, 'Total de entradas');
    bloco('Saídas', 'saida', r.saidas, 'Total de saídas');
    const res = CaixaCore.arredondar(r.entradas - r.saidas);
    linhas.push({ cel: ['Entradas menos saídas', _fxNum(res)], xl: ['Entradas menos saídas', res], forte: true, nivel: 0 });
    if (r.aberturas) add('Saldo inicial de contas abertas no período (não é entrada)', r.aberturas, 0);
    const conta = finFluxo.contaId !== '' ? (getContasFin().find(c => CaixaCore.mesmoId(c.id, finFluxo.contaId)) || {}).nome || 'Conta' : 'Todas as contas';
    return { cab: [{ t: 'Categoria' }, { t: 'Valor (R$)', num: true }], linhas, periodoTxt: _fxDataBr(de) + ' a ' + _fxDataBr(ate) + ' · ' + conta, regime: '',
        nota: 'Dinheiro que entrou e saiu das contas no período (não é a DRE).' };
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
            <div class="form-group" id="fluxo-rel-grupo-de"><label for="fluxo-rel-de">Período de</label><input type="date" id="fluxo-rel-de" value="${escapeHtml(finFluxoRel.de)}" onchange="finFluxoRelMudar('de', this.value)"></div>
            <div class="form-group" id="fluxo-rel-grupo-ate"><label for="fluxo-rel-ate">até</label><input type="date" id="fluxo-rel-ate" value="${escapeHtml(finFluxoRel.ate)}" onchange="finFluxoRelMudar('ate', this.value)"></div>
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
        <tbody>${d.linhas.map(l => `<tr class="${l.forte ? 'fluxo-rel-forte' : ''}${l.semi ? ' fluxo-rel-semi' : ''}${l.vazio ? ' fluxo-rel-vazio' : ''}">${l.cel.map((c, i) => `<${i === 0 ? 'th scope="row"' : 'td'} class="${d.cab[i].num ? 'fluxo-num' : ''}"${i === 0 && l.nivel ? ` style="padding-left:${8 + l.nivel * 16}px"` : ''}>${escapeHtml(c)}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="lanc-sub" style="margin-top:8px">${escapeHtml(d.nota)}</p>`;
}

function _fxRelImprimirAgora(dica) {
    if (!_fxRelPeriodoOk()) { toast('Período inválido.', 'info'); return; }
    const d = _fxRelDados();
    const tabela = `<table><thead><tr>${d.cab.map(c => `<th style="text-align:${c.num ? 'right' : 'left'}">${escapeHtml(c.t)}</th>`).join('')}</tr></thead><tbody>${d.linhas.map(l =>
        `<tr style="${l.forte ? 'font-weight:700;background:#F0F2F5;' : l.semi ? 'font-weight:600;' : ''}">${l.cel.map((c, i) => `<td style="text-align:${d.cab[i].num ? 'right' : 'left'};${i === 0 && l.nivel ? 'padding-left:' + (6 + l.nivel * 14) + 'px;' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
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
    d.linhas.forEach(l => aoa.push(l.xl.map((v, i) => (typeof v === 'number' ? v : (i === 0 && l.nivel ? ' '.repeat(2 * l.nivel) : '') + v))));
    aoa.push([], [d.nota]);
    const sufixo = finFluxoRel.tipo === 'evolucao' ? hojeLocal() : finFluxoRel.de + '_' + finFluxoRel.ate;
    return _dreBaixarExcel('Fluxo_' + finFluxoRel.tipo + '_' + sufixo + '.xlsx', _fxRelTitulo().slice(0, 31), aoa);
}
