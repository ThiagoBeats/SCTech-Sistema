'use strict';
// Telas do Financeiro novo (Resumo, Lancamentos, Fluxo de caixa, DRE). Carregado depois de app.js.
// Resumo (Task 6) ainda nao tem a tela nova: ate la, mostra o aviso. Lancamentos (pagar | receber) ja e a tela nova.
// O Fluxo de caixa mostra o Extrato de sempre, com o aviso de versao provisoria.

const FIN_EM_CONSTRUCAO = 'Em construção: chega na próxima atualização.';

function _finEmConstrucao(id, titulo) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<h3 style="margin-bottom:8px">${titulo}</h3><p style="color:var(--muted,#8F8F8F)">${FIN_EM_CONSTRUCAO}</p>`;
}

// Ponto de entrada da Task 6 (Resumo).
function renderFinResumo() {
    _finEmConstrucao('fin-resumo-conteudo', 'Resumo');
}

// Fluxo de caixa provisorio: o Extrato de sempre (transferencia, saldo por conta), ate a entrega do Fluxo novo.
function renderFinFluxoProvisorio() {
    renderExtrato();
}

function renderFinDreProvisorio() {
    _finEmConstrucao('fin-dre-conteudo', 'DRE');
}

// ===================== LANCAMENTOS (Contas a pagar | Contas a receber) =====================
// Lados do Lancamentos e a permissao de cada um ('fixas' = Recorrencias).
const FIN_LADOS = { pagar: 'financeiro.pagar', receber: 'financeiro.receber', fixas: 'financeiro.fixas' };
const FIN_LANC_POR_PAGINA = 50;
let _finLado = '';
let finLancLado = 'receber';   // ultimo lado aberto entre 'pagar' e 'receber'
let _finLancPag = 0;
let _finLancIniciado = false;

const _finNorm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const _finIdJs = id => typeof id === 'number' ? String(id) : JSON.stringify(String(id));
const _finTipoLado = lado => lado === 'pagar' ? 'cp' : 'cr';
const _finListaLado = lado => lado === 'pagar' ? db.contas_pagar : db.contas_receber;
const _finPessoaDe = reg => reg.cliente_nome || reg.credor_nome || '';

function _finCategoriasDoLado(lado, incluirId) {
    const tipo = lado === 'pagar' ? 'saida' : 'entrada';
    const cats = (db.fin_categorias && db.fin_categorias.categorias) || [];
    return cats.filter(c => c.tipo === tipo && (c.ativo !== false || String(c.id) === String(incluirId)));
}
function _finNomeCategoria(id) {
    const c = ((db.fin_categorias && db.fin_categorias.categorias) || []).find(x => String(x.id) === String(id));
    return c ? c.nome : '';
}

// Ponto de entrada (Lancamentos). `lado`: 'pagar' | 'receber' | 'fixas'; sem ele, o ultimo
// aberto (ou o primeiro que o usuario pode ver).
function renderFinLancamentos(lado) {
    const permitidos = Object.keys(FIN_LADOS).filter(l => temAcesso(FIN_LADOS[l], 'visualizar'));
    if (!permitidos.length) return;
    if (!permitidos.includes(lado)) lado = permitidos.includes(_finLado) ? _finLado : permitidos[0];
    const mudou = lado !== _finLado;
    _finLado = lado;
    if (lado !== 'fixas') finLancLado = lado;
    document.querySelectorAll('.fin-lado-btn').forEach(b => {
        const ok = permitidos.includes(b.dataset.lado);
        b.style.display = ok ? '' : 'none';
        b.classList.toggle('active', b.dataset.lado === lado);
        b.classList.toggle('btn-primary', b.dataset.lado === lado);
        b.classList.toggle('btn-outline', b.dataset.lado !== lado);
    });
    const lanc = document.getElementById('fin-lanc');
    if (lanc) lanc.style.display = lado === 'fixas' ? 'none' : '';
    const fix = document.getElementById('fin-fixas');
    if (fix) fix.style.display = lado === 'fixas' ? '' : 'none';
    if (lado === 'fixas') { renderDespesasFixas(); return; }
    _finLancMontarBarra(lado, mudou);
    renderFinLancLista(true);
}

function abrirRecorrencias() { renderFinLancamentos('fixas'); }

// Barra de filtros: textos e opcoes de cada lado. Trocar de lado limpa os filtros (o periodo fica).
function _finLancMontarBarra(lado, limpar) {
    const pagar = lado === 'pagar';
    const el = id => document.getElementById(id);
    if (!_finLancIniciado) {
        _finLancIniciado = true;
        const hoje = hojeLocal();
        el('lanc-de').value = hoje.slice(0, 8) + '01';
        el('lanc-ate').value = _resUltimoDia(hoje.slice(0, 7));
        limpar = true;
    }
    if (limpar) ['lanc-busca', 'lanc-status', 'lanc-pessoa', 'lanc-categoria', 'lanc-conta'].forEach(id => { el(id).value = ''; });
    el('lanc-pessoa-rotulo').textContent = pagar ? 'Fornecedor' : 'Cliente';
    el('lanc-status').options[3].textContent = pagar ? 'Pago' : 'Recebido';
    const pessoas = new Map();
    _finListaLado(lado).forEach(r => { const n = _finPessoaDe(r).trim(); if (n && !pessoas.has(_finNorm(n))) pessoas.set(_finNorm(n), n); });
    const sel = (id, tudo, opcoes) => {
        const e = el(id), atual = e.value;
        e.innerHTML = `<option value="">${tudo}</option>` + opcoes.map(([v, t]) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`).join('');
        e.value = opcoes.some(o => o[0] === atual) ? atual : '';
    };
    sel('lanc-pessoa', 'Todos', [...pessoas].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')));
    sel('lanc-categoria', 'Todas', _finCategoriasDoLado(lado).map(c => [String(c.id), c.nome]));
    sel('lanc-conta', 'Todas', getContasFin().map(c => [String(c.id), c.nome || 'Conta']));
    const completo = temAcesso(FIN_LADOS[lado], 'completo');
    el('lanc-novo').style.display = completo ? '' : 'none';
    el('lanc-importar').style.display = pagar && completo ? '' : 'none';
    el('lanc-gerar').style.display = pagar && completo ? '' : 'none';
    const tb = _finLancTbody();
    if (tb) tb.id = pagar ? 'tb-contas-pagar' : 'tb-contas-receber';
}

// O corpo da tabela leva o id do lado aberto (tb-contas-pagar / tb-contas-receber).
function _finLancTbody() { return document.getElementById('lanc-tbody') || document.getElementById('tb-contas-pagar') || document.getElementById('tb-contas-receber'); }

function _finLancFiltrados(lado) {
    const v = id => (document.getElementById(id) || {}).value || '';
    const f = { busca: _finNorm(v('lanc-busca')), status: v('lanc-status'), pessoa: v('lanc-pessoa'), categoria: v('lanc-categoria'),
        conta: v('lanc-conta'), ref: v('lanc-ref') || 'venc', de: v('lanc-de'), ate: v('lanc-ate') };
    const hoje = hojeLocal();
    const porVenc = (a, b) => (a.data_vencimento || '9999').localeCompare(b.data_vencimento || '9999');
    // Conta vencida de antes do periodo nunca some: com Status "Todos" ou "Vencido" ela entra primeiro.
    const vencidaAntes = r => !!f.de && !!r.data_vencimento && FinCatCore.situacao(r, hoje) === 'vencido' && String(r.data_vencimento).slice(0, 10) < f.de;
    const antes = [], dentro = [];
    _finListaLado(lado).forEach(r => {
        const sit = FinCatCore.situacao(r, hoje);
        if (f.status && sit !== f.status) return;
        if (f.pessoa && _finNorm(_finPessoaDe(r)) !== f.pessoa) return;
        if (f.categoria && String(r.categoria_id) !== f.categoria) return;
        if (f.conta && String(r.conta_id) !== f.conta) return;
        if (f.busca) {
            const alvo = _finNorm([r.descricao, _finPessoaDe(r), _finNomeCategoria(r.categoria_id), r.valor].join(' '));
            if (!alvo.includes(f.busca)) return;
        }
        if (vencidaAntes(r)) { antes.push(r); return; }
        const d = f.ref === 'comp' ? (r.data_competencia || r.data_vencimento) : r.data_vencimento;
        if (d) { const dia = String(d).slice(0, 10); if (f.de && dia < f.de) return; if (f.ate && dia > f.ate) return; }
        dentro.push(r);
    });
    return { lista: antes.sort(porVenc).concat(dentro.sort(porVenc)), extras: antes.length };
}

function _finLancAcoes(lado, r, hoje) {
    const tipo = _finTipoLado(lado), id = _finIdJs(r.id);
    const completo = temAcesso(FIN_LADOS[lado], 'completo');
    const sit = FinCatCore.situacao(r, hoje);
    const aberta = sit === 'aberto' || sit === 'vencido';
    const A = [];
    if (completo && aberta) A.push({ icone: '✓', rotulo: 'Dar baixa', onclick: (lado === 'pagar' ? 'marcarCPPago(' : 'marcarCRPago(') + id + ')' });
    if (completo && sit === 'pago' && r.categoria !== 'taxa_cartao') A.push({ icone: '↩', rotulo: 'Estornar', onclick: (lado === 'pagar' ? 'estornarCP(' : 'estornarCR(') + id + ')' });
    if (completo && lado === 'receber' && aberta && r.data_vencimento && r.data_vencimento <= hoje) A.push({ icone: '💬', rotulo: 'Cobrar no WhatsApp', onclick: 'cobrarNoWhatsApp(' + id + ')' });
    if (completo && sit !== 'cancelado') A.push({ icone: '✏️', rotulo: 'Editar', onclick: `abrirNovoLancamento('${lado}', ${id})` });
    A.push({ icone: '🕘', rotulo: 'Histórico', onclick: `abrirHistoricoLancamento('${tipo}', ${id})` });
    if (r.pedido_id != null && r.pedido_id !== '' && db.pedidos.some(p => p.id == r.pedido_id)) A.push({ icone: '📦', rotulo: 'Abrir pedido', onclick: `abrirPedidoDoLancamento(${_finIdJs(r.pedido_id)})` });
    if (r.arquivo_anexo_url) A.push({ icone: '📎', rotulo: 'Ver anexo', onclick: 'verAnexoCP(' + id + ')' });
    if (completo && sit !== 'cancelado') A.push({ icone: '🚫', rotulo: 'Cancelar', perigo: true, onclick: `cancelarLancamentoTela('${tipo}', ${id})` });
    if (completo && sit !== 'cancelado' && FinCatCore.podeExcluir(r).ok) {
        A.push({ icone: '🗑️', rotulo: 'Excluir', perigo: true, onclick: (lado === 'pagar' ? 'excluirCP(' : 'excluirCR(') + id + ')' });
        if (lado === 'pagar' && r.parcelado && r.lancamento_pai_id != null) A.push({ icone: '🗑️', rotulo: 'Excluir todas as parcelas', perigo: true, onclick: 'excluirGrupoCP(' + _finIdJs(r.lancamento_pai_id) + ')' });
    }
    return A;
}

function renderFinLancLista(zerarPagina) {
    atualizarStatusVencimentos();
    const lado = finLancLado, tb = _finLancTbody();
    if (!tb) return;
    if (zerarPagina) _finLancPag = 0;
    const { lista, extras } = _finLancFiltrados(lado);
    const hoje = hojeLocal();
    const pagar = lado === 'pagar';
    const aviso = document.getElementById('lanc-aviso');
    if (aviso) { aviso.style.display = extras ? '' : 'none'; aviso.textContent = `Inclui ${extras} conta(s) vencida(s) de antes do período.`; }
    const totalAberto = lista.filter(r => { const s = FinCatCore.situacao(r, hoje); return s === 'aberto' || s === 'vencido'; })
        .reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const paginas = Math.max(1, Math.ceil(lista.length / FIN_LANC_POR_PAGINA));
    if (_finLancPag >= paginas) _finLancPag = paginas - 1;
    const pagina = lista.slice(_finLancPag * FIN_LANC_POR_PAGINA, (_finLancPag + 1) * FIN_LANC_POR_PAGINA);
    document.getElementById('lanc-th-pessoa').textContent = pagar ? 'Fornecedor' : 'Cliente';
    if (!pagina.length) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Nenhum lançamento encontrado.</td></tr>';
    } else {
        tb.innerHTML = pagina.map(r => {
            const sit = FinCatCore.situacao(r, hoje);
            const rotulo = sit === 'pago' ? FinCatCore.ROTULO_SITUACAO.pago[pagar ? 'pagar' : 'receber'] : FinCatCore.ROTULO_SITUACAO[sit];
            const cls = { aberto: 'pending', vencido: 'red', pago: 'green', cancelado: 'gray' }[sit];
            const dica = sit === 'cancelado' && r.motivo_cancelamento ? ` title="${escapeHtml(r.motivo_cancelamento)}"` : '';
            const sub = sit === 'pago' && r.data_pagamento ? `<div class="lanc-sub">${_finDataBR(String(r.data_pagamento).slice(0, 10))}</div>` : '';
            const cobrado = !pagar && r.ultima_cobranca === hoje && (sit === 'aberto' || sit === 'vencido') ? '<div class="lanc-sub">cobrado hoje</div>' : '';
            const pedido = r.pedido_id != null && r.pedido_id !== '' ? ` <span class="lanc-sub">#${escapeHtml(String(formatPedidoId(r.pedido_id)))}</span>` : '';
            const rec = (r.recorrente || r.despesa_fixa_id) ? ' <span class="fin-badge fin-badge-gray" title="Recorrência">🔁</span>' : '';
            const cancPed = r.pedido_cancelado ? ' <span class="fin-badge fin-badge-red" title="O pedido foi cancelado ou voltou para Orçamento depois desta comissão ser paga">pedido cancelado — revisar</span>' : '';
            const cat = _finNomeCategoria(r.categoria_id);
            return `<tr class="${sit === 'vencido' ? 'fin-atrasado' : ''}">
                <td>${_fmtVenc(r.data_vencimento)}</td>
                <td>${escapeHtml(r.descricao || '')}${pedido}${rec}${cancPed}</td>
                <td>${escapeHtml(_finPessoaDe(r)) || '—'}</td>
                <td>${escapeHtml(cat) || '—'}</td>
                <td style="text-align:right;white-space:nowrap"><strong>${_finBrl(r.valor)}</strong></td>
                <td><span class="fin-badge fin-badge-${cls}"${dica}>${rotulo}</span>${sub}${cobrado}</td>
                <td style="text-align:right">${menuAcoesHtml(_finLancAcoes(lado, r, hoje))}</td>
            </tr>`;
        }).join('');
    }
    const rod = document.getElementById('lanc-rodape');
    if (rod) rod.innerHTML = `<span class="lanc-total">Total em aberto: <strong>${_finBrl(totalAberto)}</strong></span>`
        + `<span class="lanc-pag">${lista.length} ${lista.length === 1 ? 'lançamento' : 'lançamentos'}`
        + (paginas > 1 ? ` · <button class="btn btn-outline btn-sm" ${_finLancPag === 0 ? 'disabled' : ''} onclick="finLancIrPagina(-1)">‹ Anterior</button> Página ${_finLancPag + 1} de ${paginas} <button class="btn btn-outline btn-sm" ${_finLancPag >= paginas - 1 ? 'disabled' : ''} onclick="finLancIrPagina(1)">Próxima ›</button>` : '')
        + '</span>';
}
function finLancIrPagina(d) { _finLancPag = Math.max(0, _finLancPag + d); renderFinLancLista(false); }

function abrirPedidoDoLancamento(pedidoId) {
    window.location.href = 'pedidos.html?busca=' + encodeURIComponent(formatPedidoId(pedidoId));
}

// ---------- Cancelar ----------
function _finPedirMotivo() {
    return new Promise(resolve => {
        const o = document.createElement('div');
        o.className = 'modal-overlay';
        o.innerHTML = `<div class="modal-box" style="max-width:460px">
            <div class="modal-header"><h3>Cancelar lançamento</h3><button class="modal-close" id="lanc-motivo-x" aria-label="Fechar">×</button></div>
            <div class="modal-body">
                <div class="form-group"><label>Motivo <span style="color:#F43927">*</span></label>
                <textarea id="lanc-motivo" rows="3" placeholder="Por que este lançamento está sendo cancelado?"></textarea>
                <div id="lanc-motivo-erro" style="color:#F43927;font-size:12px;min-height:16px;margin-top:4px"></div></div>
            </div>
            <div style="display:flex;gap:10px;padding:16px 24px;border-top:1px solid var(--border)">
                <button class="btn btn-danger" id="lanc-motivo-ok">Cancelar lançamento</button>
                <button class="btn btn-outline" id="lanc-motivo-voltar">Voltar</button>
            </div></div>`;
        document.body.appendChild(o);
        const fechar = v => { o.remove(); resolve(v); };
        o.querySelector('#lanc-motivo-x').onclick = o.querySelector('#lanc-motivo-voltar').onclick = () => fechar(null);
        o.querySelector('#lanc-motivo-ok').onclick = () => {
            const t = o.querySelector('#lanc-motivo').value.trim();
            if (!t) { o.querySelector('#lanc-motivo-erro').textContent = 'Informe o motivo.'; return; }
            fechar(t);
        };
        o.querySelector('#lanc-motivo').focus();
    });
}

async function cancelarLancamentoTela(tipo, id) {
    const modulo = tipo === 'cp' ? 'financeiro.pagar' : 'financeiro.receber';
    if (!await exigirPermissao(modulo, 'completo')) return;
    const lista = tipo === 'cp' ? db.contas_pagar : db.contas_receber;
    const reg = lista.find(x => CaixaCore.mesmoId(x.id, id));
    if (!reg) return;
    const pode = FinCatCore.podeCancelar(reg);
    if (!pode.ok) { await showAlert(pode.motivo, '⚠️'); return; }
    const motivo = await _finPedirMotivo();
    if (!motivo) return;
    if (!cancelarLancamento(tipo, id, motivo)) return;
    salvarERecarregar('Lançamento cancelado.');
}

// ---------- Historico ----------
const FIN_ROTULO_ACAO = { criado: 'Criado', editado: 'Editado', baixa: 'Baixa', estorno: 'Estorno', cancelado: 'Cancelado', conciliado: 'Conciliado', categoria: 'Categoria' };
function abrirHistoricoLancamento(tipo, id) {
    const lista = tipo === 'cp' ? db.contas_pagar : db.contas_receber;
    const reg = lista.find(x => CaixaCore.mesmoId(x.id, id));
    if (!reg) return;
    if (!temAcesso(tipo === 'cp' ? FIN_LADOS.pagar : FIN_LADOS.receber, 'visualizar')) return;
    const hist = (Array.isArray(reg.historico) ? reg.historico : []).slice().reverse();
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = `<div class="modal-box" style="max-width:560px">
        <div class="modal-header"><h3>Histórico</h3><button class="modal-close" aria-label="Fechar" onclick="this.closest('.modal-overlay').remove()">×</button></div>
        <div class="modal-body" id="lanc-hist">
            <p class="lanc-sub" style="margin-bottom:10px">${escapeHtml(reg.descricao || '')} — ${_finBrl(reg.valor)}</p>
            ${hist.length ? hist.map(h => `<div class="lanc-hist-item">
                <div><strong>${escapeHtml(FIN_ROTULO_ACAO[h.acao] || h.acao || '')}</strong> <span class="lanc-sub">${h.em ? new Date(h.em).toLocaleString('pt-BR') : ''} · ${escapeHtml(h.porNome || 'Sistema')}</span></div>
                ${h.detalhe ? `<div class="lanc-hist-det">${escapeHtml(h.detalhe)}</div>` : ''}</div>`).join('') : '<p class="lanc-sub">Sem registros.</p>'}
        </div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o) o.remove(); });
}

// ---------- Novo / editar ----------
// Codigo antigo da categoria (campo `categoria` que outras telas ainda leem). Comissao e taxa de cartao
// ficam 'outro': so o sistema gera essas, e o codigo antigo delas mexe em pedido.
const FIN_LEGADO_DA_CATEGORIA = { cat_tecido: 'tecido', cat_costureira: 'costureira', cat_instalador: 'instalador', cat_impostos: 'imposto',
    cat_aluguel: 'aluguel', cat_salarios: 'salario', cat_contas: 'conta' };
const _finLegadoDe = catId => FIN_LEGADO_DA_CATEGORIA[catId] || 'outro';

// Nome digitado -> pessoa do cadastro (so se for um nome unico); senao fica o nome livre.
function _finResolverPessoa(lado, texto) {
    texto = String(texto || '').trim();
    if (!texto) return { id: null, nome: '', cnpj: null };
    const cad = lado === 'pagar' ? db.fornecedores : db.clientes;
    const achados = (cad || []).filter(p => _finNorm(p.nome) === _finNorm(texto));
    if (achados.length === 1) return { id: achados[0].id, nome: achados[0].nome, cnpj: achados[0].cnpj || null };
    return { id: null, nome: texto, cnpj: null };
}

async function abrirNovoLancamento(lado, idEditar) {
    if (lado !== 'pagar' && lado !== 'receber') lado = finLancLado;
    if (!await exigirPermissao(FIN_LADOS[lado], 'completo')) return;
    const pagar = lado === 'pagar';
    const reg = idEditar != null ? _finListaLado(lado).find(x => CaixaCore.mesmoId(x.id, idEditar)) : null;
    if (idEditar != null && !reg) return;
    if (reg && reg.status === 'Cancelado') { await showAlert('Este lançamento está cancelado e não pode ser editado.', '⚠️'); return; }
    const pago = !!reg && FinCatCore.situacao(reg, hojeLocal()) === 'pago';
    const auto = !!reg && !FinCatCore.podeExcluir(Object.assign({}, reg, { status: 'Pendente', data_pagamento: null })).ok;
    const travaValor = pago || auto;
    const cats = _finCategoriasDoLado(lado, reg && reg.categoria_id);
    const catPadrao = reg ? reg.categoria_id : (pagar ? 'cat_outras_desp' : 'cat_vendas');
    const pessoas = (pagar ? db.fornecedores : db.clientes) || [];
    const contas = getContasFin().filter(c => c.ativo !== false || (reg && CaixaCore.mesmoId(c.id, reg.conta_id)));
    const peds = db.pedidos.filter(p => normalizarStatus(p.status) !== 'Orçamento' || (reg && reg.pedido_id == p.id));
    const val = x => x == null ? '' : escapeHtml(String(x));
    const valorTxt = reg ? String(Number(reg.valor).toFixed(2)).replace('.', ',') : '';
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.id = 'lanc-form-overlay';
    o.innerHTML = `<div class="modal-box" style="max-width:640px">
        <div class="modal-header"><h3>${reg ? 'Editar lançamento' : 'Novo lançamento'} — ${pagar ? 'Conta a pagar' : 'Conta a receber'}</h3>
            <button class="modal-close" aria-label="Fechar" onclick="this.closest('.modal-overlay').remove()">×</button></div>
        <div class="modal-body">
            <div class="grid">
                <div class="form-group" style="grid-column:1/-1">
                    <label>Descrição <span style="color:#F43927">*</span></label>
                    <input type="text" id="lf-descricao" value="${val(reg && reg.descricao)}" placeholder="${pagar ? 'Ex: Compra de tecido, aluguel…' : 'Ex: Serviço de instalação'}">
                </div>
                <div class="form-group">
                    <label>Valor (R$) <span style="color:#F43927">*</span></label>
                    <input type="text" inputmode="decimal" id="lf-valor" value="${valorTxt}" placeholder="0,00" ${travaValor ? 'disabled title="Este lançamento não pode mudar de valor"' : ''}>
                </div>
                <div class="form-group">
                    <label>${pagar ? 'Fornecedor' : 'Cliente'}</label>
                    <input type="text" id="lf-pessoa" list="lf-pessoa-lista" value="${val(reg && _finPessoaDe(reg))}" placeholder="Escolha do cadastro ou digite o nome">
                    <datalist id="lf-pessoa-lista">${pessoas.map(p => `<option value="${escapeHtml(p.nome || '')}"></option>`).join('')}</datalist>
                </div>
                <div class="form-group">
                    <label>Categoria <span style="color:#F43927">*</span></label>
                    <select id="lf-categoria" data-pagar="${pagar ? '1' : '0'}" onchange="finLancSincronizarCompetencia()">${cats.map(c => `<option value="${escapeHtml(String(c.id))}"${String(c.id) === String(catPadrao) ? ' selected' : ''}>${escapeHtml(c.nome)}${c.ativo === false ? ' (inativa)' : ''}</option>`).join('')}</select>
                </div>
                <div class="form-group">
                    <label>Conta prevista <span class="info-tag">opcional</span></label>
                    <select id="lf-conta" ${pago ? 'disabled' : ''}><option value="">— Sem conta —</option>${contas.map(c => `<option value="${escapeHtml(String(c.id))}"${reg && CaixaCore.mesmoId(c.id, reg.conta_id) ? ' selected' : ''}>${escapeHtml(c.nome || 'Conta')}</option>`).join('')}</select>
                </div>
                <div class="form-group">
                    <label>Vencimento <span style="color:#F43927">*</span></label>
                    <input type="date" id="lf-vencimento" value="${val(reg && reg.data_vencimento)}" ${pago ? 'disabled' : ''} oninput="finLancSincronizarCompetencia()">
                </div>
                <div class="form-group">
                    <label>Competência <span class="info-tag">mês da receita/despesa</span></label>
                    <input type="date" id="lf-competencia" value="${val(reg && reg.data_competencia)}" oninput="this.dataset.editado='1'" ${reg && reg.data_competencia ? 'data-editado="1"' : ''}>
                </div>
                <div class="form-group">
                    <label>Pedido <span class="info-tag">opcional</span></label>
                    <select id="lf-pedido" ${auto ? 'disabled title="Este lançamento foi gerado pelo sistema"' : ''} onchange="finLancAoEscolherPedido('${lado}')"><option value="">— Sem pedido —</option>${peds.map(p => `<option value="${p.id}"${reg && reg.pedido_id == p.id ? ' selected' : ''}>#${escapeHtml(String(formatPedidoId(p.id)))} ${escapeHtml(p.clienteNome || '')}</option>`).join('')}</select>
                </div>
                <div class="form-group" style="grid-column:1/-1">
                    <label>Observações</label>
                    <textarea id="lf-obs" rows="2">${val(reg && reg.observacoes)}</textarea>
                </div>
            </div>
            ${reg ? '' : `<div class="lanc-opcoes">
                <label class="lanc-opcao"><input type="checkbox" id="lf-parcelar" onchange="finLancAlternar('parcelar')"> <span>Parcelar em</span>
                    <input type="number" id="lf-parcelas" min="2" max="48" step="1" value="2" disabled style="width:70px"> <span>vezes</span></label>
                ${pagar ? '<label class="lanc-opcao"><input type="checkbox" id="lf-repetir" onchange="finLancAlternar(\'repetir\')"> <span>Repetir todo mês</span></label>' : ''}
                <div class="lanc-sub">Parcelas: vencimento todo mês; os centavos que sobram ficam na última.${pagar ? ' Repetir: cria uma recorrência (veja em Recorrências).' : ''}</div>
            </div>`}
        </div>
        <div style="display:flex;gap:10px;padding:16px 24px;border-top:1px solid var(--border)">
            <button class="btn btn-success" id="lf-salvar" onclick="salvarLancamento('${lado}', ${reg ? _finIdJs(reg.id) : 'null'})">${reg ? 'Salvar alterações' : 'Salvar lançamento'}</button>
            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        </div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o) o.remove(); });
    o.querySelector('#lf-descricao').focus();
}

// Competencia padrao (FinCatCore.competenciaPadrao): recorrencia = dia 1 do mes; imposto = dia 1 do mes de referencia;
// senao o vencimento.
function _finCompetenciaPadrao(pagar, vencimento, repetir, categoriaId) {
    if (!vencimento) return '';
    if (pagar && repetir) return FinCatCore.competenciaPadrao({ origem: 'recorrencia', mesOcorrencia: vencimento.slice(0, 7), vencimento });
    if (pagar && categoriaId === 'cat_impostos') return FinCatCore.competenciaPadrao({ origem: 'imposto', mesReferencia: _mesRefImposto(vencimento), vencimento });
    return vencimento;
}
function finLancSincronizarCompetencia() {
    const v = document.getElementById('lf-vencimento'), c = document.getElementById('lf-competencia'), cat = document.getElementById('lf-categoria');
    if (!v || !c || c.dataset.editado === '1') return;
    c.value = _finCompetenciaPadrao(cat && cat.dataset.pagar === '1', v.value, !!document.getElementById('lf-repetir')?.checked, cat && cat.value);
}
function finLancAlternar(qual) {
    const p = document.getElementById('lf-parcelar'), r = document.getElementById('lf-repetir'), n = document.getElementById('lf-parcelas');
    if (qual === 'parcelar' && p.checked && r) r.checked = false;
    if (qual === 'repetir' && r && r.checked) p.checked = false;
    if (n) n.disabled = !p.checked;
    finLancSincronizarCompetencia();
}
function finLancAoEscolherPedido(lado) {
    const sel = document.getElementById('lf-pedido'), pessoa = document.getElementById('lf-pessoa');
    if (lado !== 'receber' || !sel || !pessoa || pessoa.value.trim() || !sel.value) return;
    const ped = db.pedidos.find(p => p.id == sel.value);
    if (ped) pessoa.value = ped.clienteNome || '';
}

function _finNovoId(lista) {
    const usados = new Set((lista || []).map(x => x.id));
    let id = Date.now();
    while (usados.has(id)) id++;
    return id;
}

async function salvarLancamento(lado, idEditar) {
    if (!await exigirPermissao(FIN_LADOS[lado], 'completo')) return;
    const pagar = lado === 'pagar';
    const lista = _finListaLado(lado);
    const reg = idEditar != null ? lista.find(x => CaixaCore.mesmoId(x.id, idEditar)) : null;
    const g = id => { const e = document.getElementById(id); return e ? e.value : ''; };
    const descricao = g('lf-descricao').trim();
    const valorEl = document.getElementById('lf-valor');
    const valor = valorEl && valorEl.disabled && reg ? Number(reg.valor) : _valorDigitadoBaixa(g('lf-valor'), NaN);
    const vencEl = document.getElementById('lf-vencimento');
    const vencimento = vencEl && vencEl.disabled && reg ? reg.data_vencimento : g('lf-vencimento');
    const categoriaId = g('lf-categoria');
    const competencia = g('lf-competencia') || vencimento;
    const pedEl = document.getElementById('lf-pedido');
    const pedidoId = pedEl && pedEl.disabled && reg ? (reg.pedido_id == null ? '' : String(reg.pedido_id)) : g('lf-pedido');
    const obs = g('lf-obs').trim();
    const contaId = g('lf-conta');
    const pessoa = _finResolverPessoa(lado, g('lf-pessoa'));
    const parcelar = !!document.getElementById('lf-parcelar')?.checked;
    const repetir = !!document.getElementById('lf-repetir')?.checked;
    const nParc = parseInt(g('lf-parcelas'), 10);
    if (!descricao) { await showAlert('Informe a descrição.', '⚠️'); return; }
    if (!(valor > 0)) { await showAlert('Informe o valor.', '⚠️'); return; }
    if (!vencimento) { await showAlert('Informe a data de vencimento.', '⚠️'); return; }
    if (!categoriaId) { await showAlert('Escolha a categoria.', '⚠️'); return; }
    if (parcelar && !(nParc >= 2 && nParc <= 48)) { await showAlert('Informe de 2 a 48 parcelas.', '⚠️'); return; }

    const parcelas = parcelar ? FinCatCore.dividirParcelas(valor, nParc, vencimento) : [{ parcela: 1, valor, vencimento }];
    const parecido = FinCatCore.acharParecido({ id: reg ? reg.id : undefined, valor: parcelas[0].valor, pessoaId: pessoa.id, pessoaNome: pessoa.nome, vencimento: parcelas[0].vencimento }, lista);
    if (parecido) {
        const msg = `Já existe um lançamento parecido: ${parecido.descricao} — ${_finBrl(parecido.valor)} — vence ${_finDataBR(String(parecido.data_vencimento).slice(0, 10))}. Salvar mesmo assim?`;
        if (!await showConfirm(msg, '⚠️', 'Salvar mesmo assim', 'Cancelar')) return;
    }

    if (reg) {
        _finAplicarEdicao(lado, reg, { descricao, valor, vencimento, categoriaId, competencia, pedidoId, obs, contaId, pessoa });
        salvarERecarregar('Lançamento atualizado.');
        return;
    }

    const comumCampos = () => ({
        categoria_id: categoriaId,
        pedido_id: pedidoId ? (isNaN(Number(pedidoId)) ? pedidoId : Number(pedidoId)) : null,
        conta_id: contaId || null,
        observacoes: obs,
        data_pagamento: null, status: 'Pendente'
    });
    const pessoaCampos = () => pagar
        ? Object.assign({ credor_nome: pessoa.nome, tipo: 'variavel', categoria: _finLegadoDe(categoriaId) }, pessoa.id != null ? { fornecedor_id: pessoa.id } : {}, pessoa.cnpj ? { cnpj_fornecedor: pessoa.cnpj } : {})
        : Object.assign({ cliente_nome: pessoa.nome }, pessoa.id != null ? { cliente_id: pessoa.id } : {});
    const mesRef = venc => (pagar && categoriaId === 'cat_impostos') ? { mes_referencia: _mesRefImposto(venc) } : {};
    const compEditada = document.getElementById('lf-competencia')?.dataset.editado === '1';
    const compDe = (venc, i) => compEditada ? FinanceiroCore.somarMesesData(competencia, i) : _finCompetenciaPadrao(pagar, venc, repetir && !parcelar, categoriaId);
    const tipo = pagar ? 'cp' : 'cr';
    const novos = [];
    let proximo = _finNovoId(lista);
    const usar = () => proximo++;
    if (parcelar) {
        const paiId = usar();
        parcelas.forEach((p, i) => novos.push(finCompletarLancamento(tipo, Object.assign({
            id: usar(), descricao: `${descricao} (parcela ${p.parcela}/${nParc})`, valor: p.valor, data_vencimento: p.vencimento,
            data_competencia: compDe(p.vencimento, i), lancamento_pai_id: paiId, parcelado: true, numero_parcelas: nParc, parcela_atual: p.parcela
        }, comumCampos(), pessoaCampos(), mesRef(p.vencimento)), null, 'Lançamento manual (parcelado)')));
    } else if (repetir && pagar) {
        const dfId = _finNovoId(db.despesas_fixas);
        db.despesas_fixas.push(Object.assign({ id: dfId, descricao, valor, dia_vencimento: Number(vencimento.slice(8, 10)) || 1, categoria: _finLegadoDe(categoriaId),
            categoria_id: categoriaId, ativo: true, data_inicio: vencimento, credor_nome: pessoa.nome }, pessoa.id != null ? { fornecedor_id: pessoa.id } : {}));
        novos.push(finCompletarLancamento(tipo, Object.assign({
            id: usar(), descricao, valor, data_vencimento: vencimento, data_competencia: compDe(vencimento, 0), despesa_fixa_id: dfId
        }, comumCampos(), pessoaCampos(), { tipo: 'fixo' }, mesRef(vencimento)), { origem: 'recorrencia', mesOcorrencia: competencia.slice(0, 7) }, 'Recorrência: ' + descricao));
    } else {
        novos.push(finCompletarLancamento(tipo, Object.assign({
            id: usar(), descricao, valor, data_vencimento: vencimento, data_competencia: compDe(vencimento, 0)
        }, comumCampos(), pessoaCampos(), mesRef(vencimento)), null, 'Lançamento manual'));
    }
    novos.forEach(n => lista.push(n));
    salvarERecarregar(parcelar ? `${nParc} parcelas lançadas!` : repetir ? 'Lançamento criado e recorrência cadastrada!' : 'Lançamento salvo!');
}

function _finAplicarEdicao(lado, reg, n) {
    const pagar = lado === 'pagar';
    const mudou = [];
    const troca = (rotulo, antes, depois, aplicar) => {
        if (String(antes == null ? '' : antes) !== String(depois == null ? '' : depois)) { mudou.push(`${rotulo}: ${antes || '—'} → ${depois || '—'}`); aplicar(); }
    };
    const pessoaAntes = _finPessoaDe(reg);
    troca('Descrição', reg.descricao, n.descricao, () => { reg.descricao = n.descricao; });
    if (Number(reg.valor) !== Number(n.valor)) { mudou.push(`Valor: ${_finBrl(reg.valor)} → ${_finBrl(n.valor)}`); reg.valor = n.valor; }
    troca('Vencimento', reg.data_vencimento ? _finDataBR(reg.data_vencimento) : '', _finDataBR(n.vencimento), () => {
        reg.data_vencimento = n.vencimento;
        if (reg.status === 'Pendente' || reg.status === 'Atrasado') reg.status = n.vencimento < hojeLocal() ? 'Atrasado' : 'Pendente';
    });
    troca('Competência', reg.data_competencia ? _finDataBR(reg.data_competencia) : '', _finDataBR(n.competencia), () => { reg.data_competencia = n.competencia; });
    troca(pagar ? 'Fornecedor' : 'Cliente', pessoaAntes, n.pessoa.nome, () => {
        if (pagar) { reg.credor_nome = n.pessoa.nome; reg.fornecedor_id = n.pessoa.id; if (n.pessoa.cnpj) reg.cnpj_fornecedor = n.pessoa.cnpj; }
        else { reg.cliente_nome = n.pessoa.nome; reg.cliente_id = n.pessoa.id; }
    });
    if (String(reg.conta_id == null ? '' : reg.conta_id) !== String(n.contaId) && FinCatCore.situacao(reg, hojeLocal()) !== 'pago') {
        const nome = id => (_contaFinPorId(id) || {}).nome || '—';
        mudou.push(`Conta prevista: ${nome(reg.conta_id)} → ${n.contaId ? nome(n.contaId) : '—'}`);
        reg.conta_id = n.contaId || null;
    }
    troca('Pedido', reg.pedido_id == null ? '' : '#' + formatPedidoId(reg.pedido_id), n.pedidoId ? '#' + formatPedidoId(n.pedidoId) : '',
        () => { reg.pedido_id = n.pedidoId ? (isNaN(Number(n.pedidoId)) ? n.pedidoId : Number(n.pedidoId)) : null; });
    troca('Observações', reg.observacoes, n.obs, () => { reg.observacoes = n.obs; });
    if (mudou.length) finHist(reg, 'editado', mudou.join('; '));
    if (String(reg.categoria_id) !== String(n.categoriaId)) {
        finHist(reg, 'categoria', `${_finNomeCategoria(reg.categoria_id) || '—'} → ${_finNomeCategoria(n.categoriaId)}`);
        reg.categoria_id = n.categoriaId;
        if (pagar && FinCatCore.podeExcluir(Object.assign({}, reg, { status: 'Pendente', data_pagamento: null })).ok) reg.categoria = _finLegadoDe(n.categoriaId);
    }
}
