// --- BANCO DE DADOS (LocalStorage) ---
let db = {
    clientes:    JSON.parse(localStorage.getItem('sc_cli'))  || [],
    catalogo:    JSON.parse(localStorage.getItem('sc_cat'))  || [
        { id: 1, nome: 'Linho Sintético (Exemplo)', preco: 65.00, largura_rolo: 2.80, rapport: 0, min_estoque: 0 }
    ],
    pedidos:     JSON.parse(localStorage.getItem('sc_ped'))  || [],
    estoque:     JSON.parse(localStorage.getItem('sc_est'))  || [],
    materiais:   JSON.parse(localStorage.getItem('sc_mat'))  || [],
    kits:        JSON.parse(localStorage.getItem('sc_kits')) || [],
    movimentos:  JSON.parse(localStorage.getItem('sc_mov'))  || []
};

function syncDB() {
    localStorage.setItem('sc_cli',  JSON.stringify(db.clientes));
    localStorage.setItem('sc_cat',  JSON.stringify(db.catalogo));
    localStorage.setItem('sc_ped',  JSON.stringify(db.pedidos));
    localStorage.setItem('sc_est',  JSON.stringify(db.estoque));
    localStorage.setItem('sc_mat',  JSON.stringify(db.materiais));
    localStorage.setItem('sc_kits', JSON.stringify(db.kits));
    localStorage.setItem('sc_mov',  JSON.stringify(db.movimentos));
}

function registrarMovimento(tipo, item_nome, item_tipo, quantidade, unidade, referencia) {
    db.movimentos.unshift({
        id: Date.now(), data: Date.now(), tipo, item_nome, item_tipo,
        quantidade: Math.abs(quantidade), unidade, referencia: referencia || ''
    });
    if (db.movimentos.length > 500) db.movimentos.length = 500;
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- CLIENTES ---
function salvarCliente() {
    const nome = document.getElementById('cli-nome').value.trim();
    if (!nome) return alert('Digite o nome do cliente');
    db.clientes.push({
        id: Date.now(), nome,
        tel:   document.getElementById('cli-tel')?.value.trim()   || '',
        email: document.getElementById('cli-email')?.value.trim() || '',
        cpf:   document.getElementById('cli-cpf')?.value.trim()   || '',
        end:   document.getElementById('cli-end')?.value.trim()   || ''
    });
    syncDB(); window.location.reload();
}

// --- CATÁLOGO ---
function salvarCatalogo() {
    const nome = document.getElementById('cat-nome').value.trim();
    const preco = parseFloat(document.getElementById('cat-preco').value);
    const largura_rolo = parseFloat(document.getElementById('cat-largura').value) || 2.80;
    const rapport = parseFloat(document.getElementById('cat-rapport').value) || 0;
    const min_estoque = parseFloat(document.getElementById('cat-min').value) || 0;
    if (!nome || !preco) return alert('Preencha o nome e o preço do material');
    db.catalogo.push({ id: Date.now(), nome, preco, largura_rolo, rapport, min_estoque });
    syncDB(); window.location.reload();
}

function excluirCatalogo(id) {
    if (!confirm('Remover este material do catálogo?')) return;
    db.catalogo = db.catalogo.filter(c => c.id != id);
    syncDB(); window.location.reload();
}

// --- PIPELINE DE STATUS ---
const STATUS_PIPELINE = [
    'Orçamento', 'Medição', 'Aguardando Tecido', 'Na Costura', 'Pronto p/ Instalação', 'Instalado'
];

function normalizarStatus(status) {
    if (status === 'Produção') return 'Medição';
    if (status === 'Faturado') return 'Instalado';
    return STATUS_PIPELINE.includes(status) ? status : 'Orçamento';
}

function normalizarAmbientes(ped) {
    if (ped.ambientes && ped.ambientes.length) return ped.ambientes;
    if (ped.tecidoId || ped.largura) {
        return [{
            id: 1, calculado: true,
            amb: ped.amb || '', prega: ped.prega || 'Americana', fixacao: ped.fixacao || 'Trilho Suico',
            largura: ped.largura || 0, altura: ped.altura || 0, fator: ped.fator || 2.5,
            bainha_cm: ped.bainha_cm || 15, cabecote_cm: ped.cabecote_cm || 10,
            tecidoId: ped.tecidoId, tecidoNome: ped.tecidoNome || '',
            largura_rolo: ped.largura_rolo || 2.80, rapport_cm: ped.rapport_cm || 0,
            acrescimo_rapport_m: ped.acrescimo_rapport_m || 0, num_panos: ped.num_panos || 0,
            alt_corte: ped.alt_corte || 0, consumo_linear: ped.consumo_linear || 0,
            total_material: ped.total_material || Math.max(0, (ped.valor || 0) - (ped.maoObra || 0))
        }];
    }
    return [];
}

// --- DASHBOARD: ações sobre pedidos ---
function editarPedido(id) {
    localStorage.setItem('sc_editando_id', id);
    window.location.href = 'pedido.html';
}

function excluirPedido(id) {
    if (!confirm('Excluir este pedido permanentemente?')) return;
    db.pedidos = db.pedidos.filter(p => p.id != id);
    syncDB(); window.location.reload();
}

function gerarProposta(id) {
    localStorage.setItem('sc_proposta_id', id);
    window.open('proposta.html', '_blank');
}

function abrirOS(id) {
    localStorage.setItem('sc_os_id', id);
    window.open('os.html', '_blank');
}

function aprovarPedido(id) {
    const ped = db.pedidos.find(p => p.id == id);
    if (!ped) return;
    if (!confirm(`Aprovar pedido #${String(id).slice(-6)} e enviar para produção?`)) return;
    ped.status = 'Medição';
    ped.data_producao = Date.now();
    syncDB(); window.location.reload();
}

// --- BAIXA AUTOMÁTICA DE ESTOQUE ---
function realizarBaixaEstoque(ped) {
    const ambientes = normalizarAmbientes(ped);
    const pedRef = ped.id ? `Pedido #${String(ped.id).slice(-6)}` : 'Pedido';

    // Baixa de tecido (FIFO por data de entrada)
    for (const a of ambientes) {
        if (!a.tecidoId || !(a.consumo_linear > 0)) continue;
        let restante = a.consumo_linear;
        let totalBaixado = 0;
        const rolos = db.estoque
            .filter(r => r.tecido_id == a.tecidoId && r.metragem_atual > 0)
            .sort((x, y) => x.id - y.id);
        for (const r of rolos) {
            if (restante <= 0) break;
            const baixar = Math.min(r.metragem_atual, restante);
            r.metragem_atual = Math.round((r.metragem_atual - baixar) * 1000) / 1000;
            restante         = Math.round((restante - baixar)          * 1000) / 1000;
            totalBaixado    += baixar;
        }
        if (totalBaixado > 0)
            registrarMovimento('Baixa Pedido', a.tecidoNome || 'Tecido', 'tecido', totalBaixado, 'm', pedRef);
    }

    // Baixa de materiais/acessórios
    for (const item of (ped.itens || [])) {
        const mat = db.materiais.find(m => m.id == item.materialId);
        if (mat) {
            mat.estoque_atual = Math.max(0, (mat.estoque_atual || 0) - item.quantidade);
            registrarMovimento('Baixa Pedido', mat.nome, 'material', item.quantidade, mat.unidade, pedRef);
        }
    }

    ped.baixa_realizada = true;
}

function statusPagamento(ped) {
    const recebido = ped.valor_recebido || 0;
    const total    = ped.valor || 0;
    if (total <= 0) return { label: '—', cls: '' };
    if (recebido >= total) return { label: 'Pago', cls: 'badge-pago' };
    if (recebido > 0)      return { label: `Parcial · R$ ${recebido.toFixed(2)}`, cls: 'badge-parcial' };
    return { label: 'Pendente', cls: 'badge-pendente' };
}

function statusEntrega(ped) {
    if (!ped.data_entrega) return null;
    if (normalizarStatus(ped.status) === 'Instalado') return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const entrega = new Date(ped.data_entrega + 'T00:00:00');
    const diff = Math.round((entrega - hoje) / (1000 * 60 * 60 * 24));
    if (diff < 0)   return { label: `${Math.abs(diff)}d atrasado`, cls: 'badge-atrasado' };
    if (diff === 0) return { label: 'Entrega hoje!',               cls: 'badge-hoje' };
    if (diff <= 3)  return { label: `${diff}d p/ entrega`,         cls: 'badge-urgente' };
    return { label: new Date(ped.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR'), cls: 'badge-entrega' };
}

function moverStatus(id, direcao) {
    const ped = db.pedidos.find(p => p.id == id);
    if (!ped) return;
    const idx    = STATUS_PIPELINE.indexOf(normalizarStatus(ped.status));
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= STATUS_PIPELINE.length) return;

    // Confirmar e executar baixa ao entrar em Na Costura
    if (STATUS_PIPELINE[novoIdx] === 'Na Costura' && !ped.baixa_realizada) {
        const ambientes = normalizarAmbientes(ped);
        const linhas = [];
        ambientes.filter(a => a.tecidoId && a.consumo_linear > 0).forEach(a => {
            const tec = db.catalogo.find(t => t.id == a.tecidoId);
            linhas.push(`• ${tec?.nome || 'Tecido'}${a.amb ? ' (' + a.amb + ')' : ''}: ${a.consumo_linear.toFixed(2)} m`);
        });
        (ped.itens || []).forEach(i => linhas.push(`• ${i.nome}: ${i.quantidade} ${i.unidade}`));

        const msg = linhas.length
            ? `Dar baixa no estoque e avançar para "Na Costura"?\n\n${linhas.join('\n')}`
            : `Avançar pedido #${String(id).slice(-6)} para "Na Costura"?`;
        if (!confirm(msg)) return;
        realizarBaixaEstoque(ped);
    }

    ped.status = STATUS_PIPELINE[novoIdx];
    if (novoIdx === 1 && !ped.data_producao)  ped.data_producao  = Date.now();
    if (novoIdx === 5 && !ped.data_instalado) ped.data_instalado = Date.now();
    syncDB(); window.location.reload();
}

// --- DASHBOARD: métricas ---
const COR_STATUS = {
    'Orçamento': 'st-orcamento', 'Medição': 'st-medicao',
    'Aguardando Tecido': 'st-aguardando', 'Na Costura': 'st-costura',
    'Pronto p/ Instalação': 'st-pronto', 'Instalado': 'st-faturado'
};

function renderMetrics() {
    const agora = new Date();
    const mes = agora.getMonth(), ano = agora.getFullYear();

    const instaladosMes = db.pedidos.filter(p => {
        if (normalizarStatus(p.status) !== 'Instalado') return false;
        const d = new Date(p.data_instalado || p.id);
        return d.getMonth() === mes && d.getFullYear() === ano;
    });
    const fatMes = instaladosMes.reduce((s, p) => s + (p.valor || 0), 0);
    const emProducao = db.pedidos.filter(p => { const s = normalizarStatus(p.status); return s !== 'Orçamento' && s !== 'Instalado'; }).length;
    const orcamentos = db.pedidos.filter(p => normalizarStatus(p.status) === 'Orçamento').length;
    const aprovados  = db.pedidos.filter(p => normalizarStatus(p.status) !== 'Orçamento' && (p.valor || 0) > 0);
    const ticketMedio = aprovados.length ? aprovados.reduce((s, p) => s + p.valor, 0) / aprovados.length : 0;
    const estoqueCritico = db.catalogo.filter(c => c.min_estoque > 0 && estoqueDisponivel(c.id) < c.min_estoque).length
        + db.materiais.filter(m => m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque).length;
    const hojeM = new Date(); hojeM.setHours(0, 0, 0, 0);
    const atrasados = db.pedidos.filter(p =>
        p.data_entrega && normalizarStatus(p.status) !== 'Instalado' &&
        new Date(p.data_entrega + 'T00:00:00') < hojeM
    ).length;
    const aReceber = db.pedidos.reduce((s, p) => s + Math.max(0, (p.valor || 0) - (p.valor_recebido || 0)), 0);

    const el = id => document.getElementById(id);
    if (el('met-fat-mes'))         el('met-fat-mes').textContent         = `R$ ${fatMes.toFixed(2)}`;
    if (el('met-producao'))        el('met-producao').textContent        = emProducao;
    if (el('met-orcamentos'))      el('met-orcamentos').textContent      = orcamentos;
    if (el('met-ticket'))          el('met-ticket').textContent          = ticketMedio > 0 ? `R$ ${ticketMedio.toFixed(2)}` : '—';
    if (el('met-estoque-critico')) el('met-estoque-critico').textContent = estoqueCritico || '0';
    if (el('met-atrasados'))       el('met-atrasados').textContent       = atrasados || '0';
    if (el('met-a-receber'))       el('met-a-receber').textContent       = `R$ ${aReceber.toFixed(2)}`;
}

// --- DASHBOARD: filtro + ordenação ---
const dashboardState = { col: 'id', dir: -1 };

function sortDashboard(col) {
    dashboardState.dir = dashboardState.col === col ? dashboardState.dir * -1 : 1;
    dashboardState.col = col;
    renderDashboard();
}

function renderDashboard() {
    renderMetrics();
    const thead = document.getElementById('thead-pedidos');
    const tbody = document.getElementById('tb-pedidos');
    if (!thead || !tbody) return;

    const texto       = (document.getElementById('filtro-texto')?.value  || '').toLowerCase().trim();
    const statusFiltro = document.getElementById('filtro-status')?.value || '';

    let pedidos = db.pedidos.map(p => ({ ...p, _status: normalizarStatus(p.status) }));
    if (texto)       pedidos = pedidos.filter(p => String(p.id).slice(-6).includes(texto) || p.clienteNome.toLowerCase().includes(texto) || (p.amb || '').toLowerCase().includes(texto));
    if (statusFiltro) pedidos = pedidos.filter(p => p._status === statusFiltro);

    const { col, dir } = dashboardState;
    const valOf = p => {
        if (col === 'id')      return p.id;
        if (col === 'cliente') return p.clienteNome.toLowerCase();
        if (col === 'amb')     return (p.amb || '').toLowerCase();
        if (col === 'valor')   return p.valor;
        if (col === 'entrega') return p.data_entrega || '';
        if (col === 'status')  return p._status;
        return 0;
    };
    pedidos.sort((a, b) => { const va = valOf(a), vb = valOf(b); return va < vb ? -dir : va > vb ? dir : 0; });

    const COLS = [
        { key: 'id', label: 'ID' }, { key: 'cliente', label: 'Cliente' },
        { key: 'amb', label: 'Ambiente' }, { key: 'valor', label: 'Valor (R$)' },
        { key: 'entrega', label: 'Entrega' }, { key: 'status', label: 'Status' }
    ];
    thead.innerHTML = '<tr>' + COLS.map(c => {
        const ativo = dashboardState.col === c.key;
        const seta  = ativo ? (dashboardState.dir === 1 ? '▲' : '▼') : '⇅';
        return `<th class="th-sort${ativo ? ' th-sort-ativo' : ''}" onclick="sortDashboard('${c.key}')">${c.label} <span class="sort-icon">${seta}</span></th>`;
    }).join('') + '<th>Ação</th></tr>';

    const rows = pedidos.map(p => {
        const colorClass = COR_STATUS[p._status] || 'st-orcamento';
        const btnAprovar = p._status === 'Orçamento'
            ? `<button class="btn btn-sm btn-aprovar" onclick="aprovarPedido(${p.id})">✅ Aprovar</button>` : '';
        const baixaTag = p.baixa_realizada
            ? `<span class="badge-baixa" title="Baixa de estoque realizada">✔ Baixa</span>` : '';
        const pagto      = statusPagamento(p);
        const entregaInf = statusEntrega(p);
        const pagBadge   = pagto.cls ? ` <span class="${pagto.cls}">${pagto.label}</span>` : '';
        const entregaCell = entregaInf
            ? `<span class="${entregaInf.cls}">${entregaInf.label}</span>`
            : `<span style="color:#9ca3af;font-size:12px">—</span>`;
        return `<tr>
            <td>#${String(p.id).slice(-6)}</td>
            <td>${p.clienteNome}</td>
            <td>${p.amb}</td>
            <td>R$ ${p.valor.toFixed(2)}${pagBadge}</td>
            <td>${entregaCell}</td>
            <td><span class="status-tag ${colorClass}">${p._status}</span> ${baixaTag}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="gerarProposta(${p.id})">📄</button>
                <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})">📋</button>
                ${btnAprovar}
                <button class="btn btn-outline btn-sm" onclick="editarPedido(${p.id})">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirPedido(${p.id})">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    const vazio = texto || statusFiltro
        ? 'Nenhum pedido encontrado com esses filtros.'
        : 'Nenhum pedido cadastrado. Clique em "+ Novo Pedido" para começar.';
    tbody.innerHTML = rows || `<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">${vazio}</td></tr>`;

    const counter = document.getElementById('pedidos-counter');
    if (counter) counter.textContent = pedidos.length === db.pedidos.length
        ? `${db.pedidos.length} pedido(s)` : `${pedidos.length} de ${db.pedidos.length} pedido(s)`;
}

// --- ESTOQUE DE TECIDO: helpers ---
function estoqueDisponivel(tecidoId) {
    return db.estoque.filter(r => r.tecido_id == tecidoId && r.metragem_atual > 0).reduce((s, r) => s + r.metragem_atual, 0);
}
function rolosDisponiveis(tecidoId) {
    return db.estoque.filter(r => r.tecido_id == tecidoId && r.metragem_atual > 0);
}
function verificarConflitoDeLote(tecidoId, metrosNecessarios) {
    const rolos = rolosDisponiveis(tecidoId);
    if (!rolos.length) return false;
    if (rolos.some(r => r.metragem_atual >= metrosNecessarios)) return false;
    const total = rolos.reduce((s, r) => s + r.metragem_atual, 0);
    if (total < metrosNecessarios) return false;
    return new Set(rolos.map(r => r.lote)).size > 1;
}

// --- ESTOQUE DE TECIDO: CRUD ---
function salvarEntradaEstoque() {
    const tecidoId = parseInt(document.getElementById('est-tecido').value);
    const lote     = document.getElementById('est-lote').value.trim();
    const metros   = parseFloat(document.getElementById('est-metros').value);
    const data     = document.getElementById('est-data').value;
    if (!tecidoId)           return alert('Selecione o tecido.');
    if (!lote)               return alert('Informe o número do lote/banho.');
    if (!metros || metros <= 0) return alert('Informe a metragem do rolo.');
    db.estoque.push({ id: Date.now(), tecido_id: tecidoId, lote, metragem_inicial: metros, metragem_atual: metros, data_entrada: data });
    const nomeTec = db.catalogo.find(t => t.id === tecidoId)?.nome || 'Tecido';
    registrarMovimento('Entrada', `${nomeTec} — Lote ${lote}`, 'tecido', metros, 'm', lote);
    syncDB(); window.location.reload();
}

function mostrarBaixaForm(roloId) {
    document.querySelectorAll('.baixa-form').forEach(el => { el.style.display = 'none'; });
    const row = document.getElementById('baixa-' + roloId);
    if (row) row.style.display = 'table-row';
}
function cancelarBaixa() {
    document.querySelectorAll('.baixa-form').forEach(el => { el.style.display = 'none'; });
}
function confirmarBaixa(roloId) {
    const rolo = db.estoque.find(r => r.id == roloId);
    if (!rolo) return;
    const qtd = parseFloat(document.getElementById('baixa-qtd-' + roloId).value);
    if (!qtd || qtd <= 0) return alert('Informe a quantidade a baixar.');
    if (qtd > rolo.metragem_atual) return alert(`Quantidade maior que o saldo disponível (${rolo.metragem_atual.toFixed(3)} m).`);
    rolo.metragem_atual = Math.round((rolo.metragem_atual - qtd) * 1000) / 1000;
    const nomeTecBaixa = db.catalogo.find(t => t.id === rolo.tecido_id)?.nome || 'Tecido';
    registrarMovimento('Baixa Manual', `${nomeTecBaixa} — Lote ${rolo.lote}`, 'tecido', qtd, 'm', '');
    syncDB(); window.location.reload();
}
function removerRolo(id) {
    if (!confirm('Remover este rolo do estoque?')) return;
    db.estoque = db.estoque.filter(r => r.id != id);
    syncDB(); window.location.reload();
}

// --- ESTOQUE DE TECIDO: renderização ---
function renderEstoque() {
    const tb = document.getElementById('tb-estoque');
    if (!tb) return;

    const alertBox = document.getElementById('alertas-ponto-pedido');
    if (alertBox) {
        const criticos = db.catalogo.filter(c => c.min_estoque > 0 && estoqueDisponivel(c.id) < c.min_estoque);
        if (criticos.length) {
            alertBox.innerHTML = criticos.map(c =>
                `<div class="alerta-item">⚠ <strong>${c.nome}</strong>: ${estoqueDisponivel(c.id).toFixed(2)} m disponível — mínimo: ${c.min_estoque} m</div>`
            ).join('');
            alertBox.style.display = 'block';
        }
    }

    let html = '';
    db.catalogo.forEach(tec => {
        const rolos = db.estoque.filter(r => r.tecido_id == tec.id);
        if (!rolos.length) return;
        const totalDisp = rolos.reduce((s, r) => s + r.metragem_atual, 0);
        const abaixoMin = tec.min_estoque > 0 && totalDisp < tec.min_estoque;
        html += `<tr class="estoque-grupo"><td colspan="6">
            <strong>${tec.nome}</strong>
            <span style="margin-left:12px;color:#555;font-size:13px">Total disponível: <strong>${totalDisp.toFixed(2)} m</strong></span>
            ${abaixoMin ? `<span class="badge-alerta">⚠ Abaixo do mínimo (${tec.min_estoque} m)</span>` : ''}
        </td></tr>`;
        rolos.forEach(r => {
            const pct = r.metragem_inicial > 0 ? Math.round((r.metragem_atual / r.metragem_inicial) * 100) : 0;
            const cor = pct > 40 ? '#059669' : pct > 15 ? '#d97706' : '#dc2626';
            const esgotado = r.metragem_atual <= 0;
            html += `<tr class="${esgotado ? 'rolo-esgotado' : ''}">
                <td style="padding-left:22px">${r.lote}</td>
                <td>${r.metragem_inicial.toFixed(2)} m</td>
                <td><strong>${r.metragem_atual.toFixed(3)} m</strong></td>
                <td><div class="progresso-bar"><div class="progresso-fill" style="width:${pct}%;background:${cor}"></div></div><span style="font-size:11px;color:#888">${pct}%</span></td>
                <td>${new Date(r.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>
                    ${!esgotado ? `<button class="btn btn-outline btn-sm" onclick="mostrarBaixaForm(${r.id})">↓ Baixar</button>` : '<span class="badge-esgotado">Esgotado</span>'}
                    <button class="btn btn-outline btn-sm btn-danger" onclick="removerRolo(${r.id})">🗑️</button>
                </td>
            </tr>
            <tr id="baixa-${r.id}" class="baixa-form" style="display:none">
                <td colspan="6" class="baixa-form-cell">
                    <strong>Baixar do lote ${r.lote}</strong> — saldo: <strong>${r.metragem_atual.toFixed(3)} m</strong> &emsp;
                    <input type="number" id="baixa-qtd-${r.id}" placeholder="Metros a baixar" step="0.001" min="0.001" max="${r.metragem_atual}" style="width:160px;padding:5px 8px;border:1px solid #ccc;border-radius:4px">
                    <button class="btn btn-sm" style="background:#d97706" onclick="confirmarBaixa(${r.id})">Confirmar Baixa</button>
                    <button class="btn btn-outline btn-sm" onclick="cancelarBaixa()">Cancelar</button>
                </td>
            </tr>`;
        });
    });
    tb.innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px;">Nenhum rolo cadastrado. Registre uma entrada acima.</td></tr>';
}

// --- MATERIAIS (acessórios, ferragens, trilhos, etc.) ---
function salvarMaterial() {
    const nome = document.getElementById('mat-nome')?.value.trim();
    const unidade = document.getElementById('mat-unidade')?.value || 'un';
    const preco = parseFloat(document.getElementById('mat-preco')?.value) || 0;
    const min_estoque = parseFloat(document.getElementById('mat-min')?.value) || 0;
    const estoque_inicial = parseFloat(document.getElementById('mat-qtd')?.value) || 0;
    if (!nome) return alert('Informe o nome do material.');
    db.materiais.push({ id: Date.now(), nome, unidade, preco, min_estoque, estoque_atual: estoque_inicial });
    if (estoque_inicial > 0) registrarMovimento('Entrada', nome, 'material', estoque_inicial, unidade, 'Estoque inicial');
    syncDB(); window.location.reload();
}

function excluirMaterial(id) {
    if (!confirm('Remover este material? Kits que o utilizam serão afetados.')) return;
    db.materiais = db.materiais.filter(m => m.id != id);
    db.kits.forEach(k => { k.itens = k.itens.filter(i => i.materialId != id); });
    syncDB(); window.location.reload();
}

function mostrarAjusteForm(id) {
    document.querySelectorAll('.ajuste-form').forEach(el => el.style.display = 'none');
    const row = document.getElementById('ajuste-' + id);
    if (row) row.style.display = 'table-row';
}
function cancelarAjuste() {
    document.querySelectorAll('.ajuste-form').forEach(el => el.style.display = 'none');
}

function confirmarAjuste(id) {
    const mat = db.materiais.find(m => m.id == id);
    if (!mat) return;
    const qtd = parseFloat(document.getElementById(`ajuste-qtd-${id}`)?.value);
    if (isNaN(qtd)) return alert('Informe uma quantidade válida (positivo para entrada, negativo para saída).');
    mat.estoque_atual = Math.max(0, (mat.estoque_atual || 0) + qtd);
    registrarMovimento(qtd >= 0 ? 'Ajuste +' : 'Ajuste -', mat.nome, 'material', qtd, mat.unidade, '');
    syncDB(); window.location.reload();
}

function renderMateriais() {
    const tb = document.getElementById('tb-materiais');
    if (!tb) return;

    // Alertas de mínimo
    const alertBox = document.getElementById('alertas-mat-min');
    if (alertBox) {
        const criticos = db.materiais.filter(m => m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque);
        if (criticos.length) {
            alertBox.innerHTML = criticos.map(m =>
                `<div class="alerta-item">⚠ <strong>${m.nome}</strong>: ${(m.estoque_atual||0).toFixed(2)} ${m.unidade} — mínimo: ${m.min_estoque} ${m.unidade}</div>`
            ).join('');
            alertBox.style.display = 'block';
        }
    }

    if (!db.materiais.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px;">Nenhum material cadastrado.</td></tr>';
        return;
    }

    tb.innerHTML = db.materiais.map(m => {
        const abaixoMin = m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque;
        const corEstoque = abaixoMin ? '#dc2626' : '#059669';
        return `
        <tr>
            <td><strong>${m.nome}</strong>${abaixoMin ? `<span class="badge-alerta" style="margin-left:8px">⚠</span>` : ''}</td>
            <td>${m.unidade}</td>
            <td>R$ ${(m.preco || 0).toFixed(2)}</td>
            <td style="color:${corEstoque}"><strong>${(m.estoque_atual || 0).toFixed(2)}</strong>
                ${m.min_estoque > 0 ? `<span style="color:#888;font-size:12px"> / mín: ${m.min_estoque}</span>` : ''}
            </td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="mostrarAjusteForm(${m.id})">± Ajustar</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirMaterial(${m.id})">🗑️</button>
            </td>
        </tr>
        <tr id="ajuste-${m.id}" class="ajuste-form" style="display:none">
            <td colspan="5" class="baixa-form-cell">
                <strong>${m.nome}</strong> — saldo: <strong>${(m.estoque_atual||0).toFixed(2)} ${m.unidade}</strong> &emsp;
                Quantidade (+ entrada / − saída):
                <input type="number" id="ajuste-qtd-${m.id}" placeholder="Ex: +10 ou -3" step="0.01" style="width:130px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;margin:0 8px">
                <button class="btn btn-sm" style="background:#059669" onclick="confirmarAjuste(${m.id})">Confirmar</button>
                <button class="btn btn-outline btn-sm" onclick="cancelarAjuste()">Cancelar</button>
            </td>
        </tr>`;
    }).join('');
}

// --- KITS ---
let kitDraftItens = [];

function adicionarItemAoKit() {
    const matId = parseInt(document.getElementById('kit-item-mat')?.value);
    const qtd   = parseFloat(document.getElementById('kit-item-qtd')?.value);
    if (!matId) return alert('Selecione o material.');
    if (!qtd || qtd <= 0) return alert('Informe uma quantidade válida.');
    const mat = db.materiais.find(m => m.id == matId);
    if (!mat) return;
    const existing = kitDraftItens.find(i => i.materialId === matId);
    if (existing) { existing.quantidade += qtd; }
    else { kitDraftItens.push({ materialId: matId, nome: mat.nome, unidade: mat.unidade, quantidade: qtd }); }
    renderKitDraftItens();
}

function removerItemDoKit(materialId) {
    kitDraftItens = kitDraftItens.filter(i => i.materialId !== materialId);
    renderKitDraftItens();
}

function renderKitDraftItens() {
    const tb = document.getElementById('tb-kit-draft');
    if (!tb) return;
    if (!kitDraftItens.length) {
        tb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;padding:10px;font-size:13px">Nenhum item adicionado ainda.</td></tr>';
        return;
    }
    tb.innerHTML = kitDraftItens.map(i => `<tr>
        <td>${i.nome}</td>
        <td>${i.quantidade} ${i.unidade}</td>
        <td><button class="btn btn-outline btn-sm btn-danger" onclick="removerItemDoKit(${i.materialId})">✕</button></td>
    </tr>`).join('');
}

function salvarKit() {
    const nome = document.getElementById('kit-nome')?.value.trim();
    if (!nome) return alert('Informe o nome do kit.');
    if (!kitDraftItens.length) return alert('Adicione pelo menos um item ao kit.');
    db.kits.push({
        id: Date.now(), nome,
        descricao: document.getElementById('kit-desc')?.value.trim() || '',
        itens: kitDraftItens.map(i => ({ ...i }))
    });
    syncDB(); window.location.reload();
}

function excluirKit(id) {
    if (!confirm('Remover este kit?')) return;
    db.kits = db.kits.filter(k => k.id != id);
    syncDB(); window.location.reload();
}

function renderKits() {
    const tb = document.getElementById('tb-kits');
    if (!tb) return;
    if (!db.kits.length) {
        tb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;padding:24px;">Nenhum kit cadastrado.</td></tr>';
        return;
    }
    tb.innerHTML = db.kits.map(k => `<tr>
        <td><strong>${k.nome}</strong>${k.descricao ? `<br><small style="color:#888">${k.descricao}</small>` : ''}</td>
        <td style="font-size:13px;color:#555">${k.itens.map(i => `${i.nome}: ${i.quantidade} ${i.unidade}`).join('<br>')}</td>
        <td><button class="btn btn-outline btn-sm btn-danger" onclick="excluirKit(${k.id})">🗑️</button></td>
    </tr>`).join('');
}

// --- HISTÓRICO DE MOVIMENTAÇÕES ---
function renderHistorico() {
    const tb = document.getElementById('tb-historico');
    if (!tb) return;
    if (!db.movimentos.length) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px;">Nenhuma movimentação registrada ainda.</td></tr>';
        return;
    }
    const COR = {
        'Entrada':       'mov-entrada',
        'Baixa Pedido':  'mov-baixa-pedido',
        'Baixa Manual':  'mov-baixa-manual',
        'Ajuste +':      'mov-ajuste-pos',
        'Ajuste -':      'mov-ajuste-neg'
    };
    tb.innerHTML = db.movimentos.slice(0, 300).map(m => {
        const cls  = COR[m.tipo] || '';
        const data = new Date(m.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const tipoLabel = m.tipo === 'Ajuste +' ? 'Ajuste ↑' : m.tipo === 'Ajuste -' ? 'Ajuste ↓' : m.tipo;
        return `<tr>
            <td style="font-size:12px;color:#6b7280;white-space:nowrap">${data}</td>
            <td><span class="mov-badge ${cls}">${tipoLabel}</span></td>
            <td>${m.item_nome} <span style="font-size:11px;color:#9ca3af">(${m.item_tipo === 'tecido' ? 'Tecido' : 'Material'})</span></td>
            <td><strong>${m.quantidade.toFixed(2)}</strong> ${m.unidade}</td>
            <td style="font-size:12px;color:#6b7280">${m.referencia || '—'}</td>
        </tr>`;
    }).join('');
}

// Troca de aba no estoque
function mostrarTabEstoque(tab) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
}

// --- FORMULÁRIO DE PEDIDO (MULTI-AMBIENTE + ACESSÓRIOS) ---
let editandoIdPedido = null;
let pedidoDraft = { ambientes: [], itens: [] };
let _ambienteCounter = 0;

function onPregaAmbiente(id) {
    const fatoresSugeridos = { 'Wave': '2.0', 'Americana': '2.5', 'Macho-Femea': '2.0', 'Painel': '1.0' };
    const prega = document.getElementById(`a-prega-${id}`)?.value;
    const fatorEl = document.getElementById(`a-fator-${id}`);
    if (fatorEl && prega) fatorEl.value = fatoresSugeridos[prega] || '2.5';
}

function renderAmbienteBreakdown(a) {
    const dispTotal   = estoqueDisponivel(a.tecidoId);
    const temConflito = verificarConflitoDeLote(a.tecidoId, a.consumo_linear);
    const stockColor  = dispTotal >= a.consumo_linear ? '#059669' : '#dc2626';
    const alt_bruta   = (a.altura || 0) + (a.bainha_cm || 15) / 100 + (a.cabecote_cm || 10) / 100;
    return `
        <div class="breakdown-box" style="margin-top:15px">
            <div class="breakdown-row"><span class="label">Largura total tecido (vão × fator)</span><span><strong>${((a.largura||0)*(a.fator||1)).toFixed(2)}</strong> m</span></div>
            <div class="breakdown-row"><span class="label">Largura do rolo do tecido</span><span><strong>${(a.largura_rolo||2.80).toFixed(2)}</strong> m</span></div>
            <div class="breakdown-row"><span class="label">Número de panos necessários</span><span><strong>${a.num_panos}</strong> pano(s)</span></div>
            <div class="breakdown-row"><span class="label">Altura bruta (vão + bainha + cabeçote)</span><span><strong>${alt_bruta.toFixed(3)}</strong> m</span></div>
            ${a.rapport_cm > 0 ? `<div class="breakdown-row"><span class="label">Acréscimo por rapport</span><span>+ <strong>${((a.acrescimo_rapport_m||0)*100).toFixed(1)}</strong> cm/pano</span></div>` : ''}
            <div class="breakdown-row"><span class="label">Altura de corte por pano (final)</span><span><strong>${(a.alt_corte||0).toFixed(3)}</strong> m</span></div>
            <div class="breakdown-row destaque"><span>Consumo total</span><span><strong>${(a.consumo_linear||0).toFixed(2)}</strong> m lineares</span></div>
            <div class="breakdown-row"><span class="label">Estoque disponível</span><span style="color:${stockColor}"><strong>${dispTotal.toFixed(2)} m</strong></span></div>
            <div class="breakdown-row"><span class="label">Total de materiais</span><span>R$ <strong>${(a.total_material||0).toFixed(2)}</strong></span></div>
        </div>
        ${temConflito ? `<div class="alerta-lote-pedido" style="display:flex;margin-top:8px">⚠ <strong style="margin:0 4px">Atenção:</strong> consumo pode exigir lotes/banhos diferentes — risco de variação de tonalidade.</div>` : ''}`;
}

function renderAmbientes() {
    const container = document.getElementById('ambientes-container');
    if (!container) return;
    const FATORES = ['1.0','1.5','2.0','2.5','3.0'];
    container.innerHTML = pedidoDraft.ambientes.map((a, idx) => {
        const n = idx + 1;
        const pregaOpts = [
            {v:'Americana',l:'Americana (fator 2.5x)'},{v:'Wave',l:'Wave (fator 2.0x)'},
            {v:'Macho-Femea',l:'Macho-Fêmea (fator 2.0x)'},{v:'Painel',l:'Painel / Sem Prega (fator 1.0x)'}
        ].map(o=>`<option value="${o.v}"${a.prega===o.v?' selected':''}>${o.l}</option>`).join('');
        const fixacaoOpts = [
            {v:'Trilho Suico',l:'Trilho Suíço'},{v:'Tubo/Varao',l:'Tubo / Varão'},
            {v:'Trilho Binet',l:'Trilho Binet'},{v:'Sobrepor',l:'Sobrepor (Grampo)'}
        ].map(o=>`<option value="${o.v}"${a.fixacao===o.v?' selected':''}>${o.l}</option>`).join('');
        const fatorOpts = FATORES.map(f=>`<option value="${f}"${String(a.fator||2.5)===f?' selected':''}>${f}x</option>`).join('');
        const tecOpts = '<option value="">— Selecione o Tecido —</option>' + db.catalogo.map(c => {
            const disp = estoqueDisponivel(c.id);
            const stockInfo = db.estoque.some(r=>r.tecido_id==c.id) ? ` · estoque: ${disp.toFixed(1)} m` : '';
            return `<option value="${c.id}"${a.tecidoId==c.id?' selected':''}>${c.nome} — R$ ${c.preco.toFixed(2)}/m (rolo ${(c.largura_rolo||2.80).toFixed(2)}m${c.rapport?', rapport '+c.rapport+'cm':''}${stockInfo})</option>`;
        }).join('');
        const removeBtn = pedidoDraft.ambientes.length > 1
            ? `<button class="btn btn-outline btn-sm btn-danger" onclick="removerAmbiente(${a.id})">Remover</button>` : '';
        return `
<div class="card ambiente-card" id="amb-card-${a.id}">
    <div class="ambiente-card-header">
        <h4 style="margin:0;color:var(--primary)">Ambiente ${n}</h4>${removeBtn}
    </div>
    <div class="grid" style="margin-top:15px">
        <div class="form-group" style="grid-column:1/-1"><label>Nome do Ambiente</label>
            <input type="text" id="a-amb-${a.id}" value="${escapeHtml(a.amb||'')}" placeholder="Ex: Quarto Casal"></div>
    </div>
    <div class="grid">
        <div class="form-group"><label>Tipo de Prega</label><select id="a-prega-${a.id}" onchange="onPregaAmbiente(${a.id})">${pregaOpts}</select></div>
        <div class="form-group"><label>Modelo de Fixação</label><select id="a-fixacao-${a.id}">${fixacaoOpts}</select></div>
        <div class="form-group"><label>Fator de Franzimento <span class="info-tag">auto</span></label><select id="a-fator-${a.id}">${fatorOpts}</select></div>
    </div>
    <div class="grid">
        <div class="form-group"><label>Largura do Vão (m)</label><input type="number" id="a-larg-${a.id}" value="${a.largura||''}" placeholder="Ex: 2.40" step="0.01"></div>
        <div class="form-group"><label>Altura do Vão (m)</label><input type="number" id="a-alt-${a.id}" value="${a.altura||''}" placeholder="Ex: 2.60" step="0.01"></div>
        <div class="form-group"><label>Bainha Inferior (cm) <span class="info-tag">padrão: 15</span></label><input type="number" id="a-bainha-${a.id}" value="${a.bainha_cm||15}" step="1"></div>
        <div class="form-group"><label>Cabeçote (cm) <span class="info-tag">padrão: 10</span></label><input type="number" id="a-cabecote-${a.id}" value="${a.cabecote_cm||10}" step="1"></div>
    </div>
    <div class="grid">
        <div class="form-group" style="grid-column:1/-1"><label>Tecido</label><select id="a-tecido-${a.id}">${tecOpts}</select></div>
    </div>
    <div style="text-align:right;margin-top:5px">
        <button class="btn" onclick="calcularAmbiente(${a.id})">Calcular Consumo &rarr;</button>
    </div>
    ${a.calculado ? renderAmbienteBreakdown(a) : ''}
</div>`;
    }).join('');
}

function adicionarAmbiente() {
    _ambienteCounter++;
    pedidoDraft.ambientes.push({
        id: _ambienteCounter, calculado: false, amb: '', prega: 'Americana', fixacao: 'Trilho Suico',
        largura: null, altura: null, fator: 2.5, bainha_cm: 15, cabecote_cm: 10,
        tecidoId: null, tecidoNome: '', largura_rolo: 2.80, rapport_cm: 0,
        acrescimo_rapport_m: 0, num_panos: 0, alt_corte: 0, consumo_linear: 0, total_material: 0
    });
    renderAmbientes();
}

function removerAmbiente(id) {
    pedidoDraft.ambientes = pedidoDraft.ambientes.filter(a => a.id !== id);
    renderAmbientes(); atualizarTotalPedido();
}

function calcularAmbiente(id) {
    const a = pedidoDraft.ambientes.find(x => x.id === id);
    if (!a) return;
    const larg       = parseFloat(document.getElementById(`a-larg-${id}`)?.value);
    const alt        = parseFloat(document.getElementById(`a-alt-${id}`)?.value);
    const fator      = parseFloat(document.getElementById(`a-fator-${id}`)?.value);
    const bainha_cm  = parseFloat(document.getElementById(`a-bainha-${id}`)?.value) || 15;
    const cabecote_cm = parseFloat(document.getElementById(`a-cabecote-${id}`)?.value) || 10;
    const tecidoId   = document.getElementById(`a-tecido-${id}`)?.value;
    if (!larg || larg <= 0) return alert('Informe a largura do vão.');
    if (!alt  || alt  <= 0) return alert('Informe a altura do vão.');
    if (!tecidoId)           return alert('Selecione um tecido.');
    const tecido = db.catalogo.find(t => t.id == tecidoId);
    if (!tecido) return;
    a.amb = document.getElementById(`a-amb-${id}`)?.value.trim() || '';
    a.prega = document.getElementById(`a-prega-${id}`)?.value || 'Americana';
    a.fixacao = document.getElementById(`a-fixacao-${id}`)?.value || 'Trilho Suico';
    a.fator = fator; a.largura = larg; a.altura = alt; a.bainha_cm = bainha_cm; a.cabecote_cm = cabecote_cm;
    a.tecidoId = tecido.id; a.tecidoNome = tecido.nome; a.largura_rolo = tecido.largura_rolo || 2.80; a.rapport_cm = tecido.rapport || 0;
    const alt_bruta = alt + bainha_cm / 100 + cabecote_cm / 100;
    let acrescimo_rapport_m = 0, alt_corte = alt_bruta;
    if (a.rapport_cm > 0) {
        const rapport_m = a.rapport_cm / 100;
        alt_corte = Math.ceil(alt_bruta / rapport_m) * rapport_m;
        acrescimo_rapport_m = alt_corte - alt_bruta;
    }
    const num_panos = Math.ceil((larg * fator) / a.largura_rolo);
    const consumo_linear = num_panos * alt_corte;
    a.acrescimo_rapport_m = acrescimo_rapport_m; a.alt_corte = alt_corte; a.num_panos = num_panos;
    a.consumo_linear = consumo_linear; a.total_material = consumo_linear * tecido.preco; a.calculado = true;
    renderAmbientes(); atualizarTotalPedido();
}

// --- PEDIDO: acessórios/itens ---
function renderItensPedido() {
    const tb = document.getElementById('tb-itens-pedido');
    if (!tb) return;
    if (!pedidoDraft.itens.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:12px;font-size:13px">Nenhum item adicionado. Use um kit ou adicione itens avulsos.</td></tr>';
        return;
    }
    tb.innerHTML = pedidoDraft.itens.map((item, idx) => `<tr>
        <td>${item.nome}</td>
        <td><input type="number" value="${item.quantidade}" step="0.01" min="0.01" style="width:72px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:13px" onchange="atualizarQuantidadeItem(${idx},this.value)"></td>
        <td>${item.unidade}</td>
        <td>R$ ${item.preco_unit.toFixed(2)}</td>
        <td>R$ ${item.subtotal.toFixed(2)}</td>
        <td><button class="btn btn-outline btn-sm btn-danger" onclick="removerItemPedido(${idx})">✕</button></td>
    </tr>`).join('');
}

function adicionarItemPedido() {
    const matId = parseInt(document.getElementById('ped-item-mat')?.value);
    const qtd   = parseFloat(document.getElementById('ped-item-qtd')?.value) || 1;
    if (!matId) return alert('Selecione um material.');
    const mat = db.materiais.find(m => m.id == matId);
    if (!mat) return;
    const existing = pedidoDraft.itens.find(i => i.materialId === matId);
    if (existing) { existing.quantidade += qtd; existing.subtotal = existing.quantidade * existing.preco_unit; }
    else { pedidoDraft.itens.push({ materialId: mat.id, nome: mat.nome, unidade: mat.unidade, quantidade: qtd, preco_unit: mat.preco || 0, subtotal: qtd * (mat.preco || 0) }); }
    renderItensPedido(); atualizarTotalPedido();
}

function removerItemPedido(idx) {
    pedidoDraft.itens.splice(idx, 1);
    renderItensPedido(); atualizarTotalPedido();
}

function atualizarQuantidadeItem(idx, valor) {
    const qtd = parseFloat(valor) || 0;
    if (qtd <= 0) return;
    pedidoDraft.itens[idx].quantidade = qtd;
    pedidoDraft.itens[idx].subtotal   = qtd * pedidoDraft.itens[idx].preco_unit;
    renderItensPedido(); atualizarTotalPedido();
}

function aplicarKit() {
    const kitId = parseInt(document.getElementById('ped-kit')?.value);
    if (!kitId) return alert('Selecione um kit para aplicar.');
    const kit = db.kits.find(k => k.id == kitId);
    if (!kit) return;
    for (const item of kit.itens) {
        const mat = db.materiais.find(m => m.id == item.materialId);
        if (!mat) continue;
        const existing = pedidoDraft.itens.find(i => i.materialId === item.materialId);
        if (existing) { existing.quantidade += item.quantidade; existing.subtotal = existing.quantidade * existing.preco_unit; }
        else { pedidoDraft.itens.push({ materialId: mat.id, nome: mat.nome, unidade: mat.unidade, quantidade: item.quantidade, preco_unit: mat.preco || 0, subtotal: item.quantidade * (mat.preco || 0) }); }
    }
    renderItensPedido(); atualizarTotalPedido();
    document.getElementById('ped-kit').value = '';
}

function atualizarTotalPedido() {
    const totalMat    = pedidoDraft.ambientes.filter(a=>a.calculado).reduce((s,a)=>s+(a.total_material||0),0);
    const totalItens  = pedidoDraft.itens.reduce((s,i)=>s+(i.subtotal||0),0);
    const mao         = parseFloat(document.getElementById('ped-mao')?.value) || 0;
    const bruto       = totalMat + totalItens + mao;
    const descPct     = parseFloat(document.getElementById('ped-desconto')?.value) || 0;
    const descVal     = Math.round(bruto * descPct / 100 * 100) / 100;
    const total       = bruto - descVal;
    const recebido    = parseFloat(document.getElementById('ped-valor-recebido')?.value) || 0;
    const saldo       = Math.max(0, total - recebido);
    const el = id => document.getElementById(id);
    if (el('ped-total-mat'))    el('ped-total-mat').textContent    = totalMat.toFixed(2);
    if (el('ped-total-itens'))  el('ped-total-itens').textContent  = totalItens.toFixed(2);
    if (el('ped-desconto-val')) el('ped-desconto-val').textContent = descVal.toFixed(2);
    if (el('ped-total-final'))  el('ped-total-final').textContent  = total.toFixed(2);
    if (el('ped-saldo'))        el('ped-saldo').textContent        = saldo.toFixed(2);
}

function salvarPedido() {
    const clienteId = document.getElementById('ped-cliente')?.value;
    if (!clienteId) return alert('Selecione o cliente.');
    if (!pedidoDraft.ambientes.length) return alert('Adicione pelo menos um ambiente.');
    const naoCalculados = pedidoDraft.ambientes.filter(a => !a.calculado);
    if (naoCalculados.length) return alert(`${naoCalculados.length} ambiente(s) ainda não calculado(s). Clique em "Calcular Consumo" em cada ambiente.`);
    pedidoDraft.ambientes.forEach(a => {
        const el = document.getElementById(`a-amb-${a.id}`);
        if (el) a.amb = el.value.trim() || a.amb;
    });
    const cliente         = db.clientes.find(c => c.id == clienteId);
    const maoObra         = parseFloat(document.getElementById('ped-mao')?.value) || 0;
    const total_material   = pedidoDraft.ambientes.reduce((s,a)=>s+(a.total_material||0),0);
    const total_acessorios = pedidoDraft.itens.reduce((s,i)=>s+(i.subtotal||0),0);
    const bruto            = total_material + total_acessorios + maoObra;
    const desconto_pct     = parseFloat(document.getElementById('ped-desconto')?.value) || 0;
    const desconto_valor   = Math.round(bruto * desconto_pct / 100 * 100) / 100;
    const valor            = bruto - desconto_valor;
    const ambNomes         = pedidoDraft.ambientes.map(a=>a.amb).filter(Boolean).join(', ') || 'Sem nome';
    const dadosPedido = {
        clienteId, clienteNome: cliente ? cliente.nome : 'Cliente Não Vinculado',
        amb: ambNomes, ambientes: pedidoDraft.ambientes.map(a=>({...a})),
        itens: pedidoDraft.itens.map(i=>({...i})),
        maoObra, total_material, total_acessorios, desconto_pct, desconto_valor, valor,
        status:         document.getElementById('ped-status')?.value || 'Orçamento',
        data_entrega:   document.getElementById('ped-entrega')?.value || null,
        observacoes:    document.getElementById('ped-obs')?.value.trim() || '',
        valor_recebido: parseFloat(document.getElementById('ped-valor-recebido')?.value) || 0
    };
    if (editandoIdPedido) {
        const index = db.pedidos.findIndex(p => p.id == editandoIdPedido);
        dadosPedido.id = editandoIdPedido;
        if (index >= 0) {
            dadosPedido.data_producao  = db.pedidos[index].data_producao;
            dadosPedido.data_instalado = db.pedidos[index].data_instalado;
            dadosPedido.baixa_realizada = db.pedidos[index].baixa_realizada;
            if (dadosPedido.status === 'Na Costura' && !dadosPedido.baixa_realizada) {
                realizarBaixaEstoque(dadosPedido);
            }
            db.pedidos[index] = dadosPedido;
        }
    } else {
        dadosPedido.id = Date.now();
        if (dadosPedido.status === 'Na Costura') {
            realizarBaixaEstoque(dadosPedido);
        }
        db.pedidos.push(dadosPedido);
    }
    syncDB();
    localStorage.removeItem('sc_editando_id');
    window.location.href = 'index.html';
}

function carregarPedidoParaEdicao(id) {
    const ped = db.pedidos.find(p => p.id == id);
    if (!ped) return;
    document.getElementById('ped-cliente').value = ped.clienteId || '';
    document.getElementById('ped-mao').value     = ped.maoObra || 150;
    document.getElementById('ped-status').value  = normalizarStatus(ped.status);
    const entregaEl = document.getElementById('ped-entrega');
    if (entregaEl) entregaEl.value = ped.data_entrega || '';
    const obsEl = document.getElementById('ped-obs');
    if (obsEl) obsEl.value = ped.observacoes || '';
    const recebidoEl = document.getElementById('ped-valor-recebido');
    if (recebidoEl) recebidoEl.value = ped.valor_recebido || 0;
    const descontoEl = document.getElementById('ped-desconto');
    if (descontoEl) descontoEl.value = ped.desconto_pct || 0;
    const ambientes = normalizarAmbientes(ped);
    _ambienteCounter = ambientes.length;
    pedidoDraft.ambientes = ambientes.map((a, i) => ({ ...a, id: i + 1 }));
    pedidoDraft.itens = (ped.itens || []).map(i => ({ ...i }));
    renderAmbientes(); renderItensPedido(); atualizarTotalPedido();
}

// --- KANBAN PCP ---
function renderKanban() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const COLUNAS = [
        { status: 'Medição',              label: 'Aguardando Medição Fina', cor: '#4f46e5', bg: '#eef2ff' },
        { status: 'Aguardando Tecido',    label: 'Aguardando Tecido',       cor: '#d97706', bg: '#fffbeb' },
        { status: 'Na Costura',           label: 'Na Costura',              cor: '#2563eb', bg: '#eff6ff' },
        { status: 'Pronto p/ Instalação', label: 'Pronto p/ Instalação',    cor: '#059669', bg: '#ecfdf5' },
        { status: 'Instalado',            label: 'Instalado / Entregue',    cor: '#6b7280', bg: '#f9fafb' }
    ];
    const avisoEl = document.getElementById('aviso-orcamentos');
    const orcamentos = db.pedidos.filter(p => normalizarStatus(p.status) === 'Orçamento');
    if (avisoEl) {
        if (orcamentos.length > 0) {
            avisoEl.innerHTML = `<span>📋 <strong>${orcamentos.length}</strong> orçamento(s) aguardando aprovação</span><a href="index.html" class="btn btn-outline btn-sm">Ver no Dashboard →</a>`;
            avisoEl.style.display = 'flex';
        } else { avisoEl.style.display = 'none'; }
    }
    board.innerHTML = COLUNAS.map(col => {
        const pedidosCol = db.pedidos.filter(p => normalizarStatus(p.status) === col.status);
        const idx = STATUS_PIPELINE.indexOf(col.status);
        const cards = pedidosCol.length === 0 ? `<div class="kanban-empty">Nenhum pedido nesta etapa</div>`
            : pedidosCol.map(p => {
                const dataRef      = p.data_producao || p.id;
                const dias         = Math.floor((Date.now() - dataRef) / (1000 * 60 * 60 * 24));
                const ambientes    = normalizarAmbientes(p);
                const totalConsumo = ambientes.reduce((s,a)=>s+(a.consumo_linear||0),0);
                const totalPanos   = ambientes.reduce((s,a)=>s+(a.num_panos||0),0);
                const tecidoNomes  = [...new Set(ambientes.map(a=>a.tecidoNome).filter(Boolean))];
                const pregaTipos   = [...new Set(ambientes.map(a=>a.prega).filter(Boolean))];
                const podeVoltar   = idx > 1;
                const podeAvancar  = idx < STATUS_PIPELINE.length - 1;
                let badgeEst = '';
                for (const a of ambientes) {
                    if (!a.tecidoId) continue;
                    const disp = estoqueDisponivel(a.tecidoId);
                    if (disp < (a.consumo_linear||0)) { badgeEst = `<span class="badge-sem-estoque">⚠ Sem estoque</span>`; break; }
                    else if (!badgeEst && verificarConflitoDeLote(a.tecidoId, a.consumo_linear||0)) badgeEst = `<span class="badge-lote">⚠ Múltiplos lotes</span>`;
                }
                const badgeBaixa   = p.baixa_realizada ? `<span class="badge-baixa">✔ Baixa OK</span>` : '';
                const entregaInf   = statusEntrega(p);
                const entregaBadge = entregaInf ? `<span class="${entregaInf.cls}">${entregaInf.label}</span>` : '';
                const obsBadge     = p.observacoes ? `<span title="${escapeHtml(p.observacoes)}" style="cursor:help;margin-left:4px">💬</span>` : '';
                const cardAtrasado = entregaInf?.cls === 'badge-atrasado' ? ' kanban-card-atrasado' : '';
                return `<div class="kanban-card${cardAtrasado}">
                    <div class="kanban-card-top">
                        <span class="kanban-card-id">#${String(p.id).slice(-6)}</span>
                        <span class="kanban-card-age">${dias === 0 ? 'hoje' : dias + 'd'}</span>
                    </div>
                    <div class="kanban-card-cliente">${p.clienteNome}${obsBadge}</div>
                    <div class="kanban-card-amb">${p.amb}</div>
                    ${entregaBadge ? `<div style="margin:3px 0 5px">${entregaBadge}</div>` : ''}
                    <div class="kanban-card-info">${pregaTipos.join(', ')||'—'} · ${tecidoNomes.join(', ')||'—'}<br>${totalPanos} pano(s) · ${totalConsumo.toFixed(2)} m</div>
                    ${badgeEst||badgeBaixa ? `<div style="margin-bottom:6px">${badgeEst}${badgeBaixa}</div>` : ''}
                    <div class="kanban-card-actions">
                        <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})">📋 OS</button>
                        <div style="display:flex;gap:4px">
                            ${podeVoltar  ? `<button class="btn btn-outline btn-sm" onclick="moverStatus(${p.id},-1)">←</button>` : `<span class="kanban-nav-ph"></span>`}
                            ${podeAvancar ? `<button class="btn btn-sm" onclick="moverStatus(${p.id},1)">→</button>` : ''}
                        </div>
                    </div>
                </div>`;
            }).join('');
        return `<div class="kanban-col">
            <div class="kanban-col-header" style="background:${col.cor}"><span>${col.label}</span><span class="kanban-count">${pedidosCol.length}</span></div>
            <div class="kanban-col-body" style="background:${col.bg}">${cards}</div>
        </div>`;
    }).join('');
}

// --- ORDEM DE SERVIÇO ---
function renderOS() {
    const id = localStorage.getItem('sc_os_id');
    const ped = db.pedidos.find(p => p.id == id);
    const container = document.getElementById('os-container');
    if (!ped) { container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">OS não encontrada.</p>'; return; }
    const ambientes = normalizarAmbientes(ped);
    const cliente   = db.clientes.find(c => c.id == ped.clienteId);
    const hoje      = new Date().toLocaleDateString('pt-BR');
    const ambientesHTML = ambientes.map((a, idx) => `
        <div class="os-section">
            <div class="os-section-title">Ambiente ${idx+1}${a.amb ? ': '+a.amb : ''}</div>
            <table class="os-table">
                <tr><td class="os-th">Tipo de Prega</td><td><strong>${a.prega||'—'}</strong></td><td class="os-th">Fixação</td><td><strong>${a.fixacao||'—'}</strong></td></tr>
                <tr><td class="os-th">Tecido</td><td><strong>${a.tecidoNome||'—'}</strong></td><td class="os-th">Rapport</td><td>${a.rapport_cm>0?a.rapport_cm+' cm':'Liso'}</td></tr>
            </table>
            <table class="os-table" style="margin-top:8px">
                <tr><td class="os-th">Largura do vão</td><td>${a.largura} m</td><td class="os-th">Altura do vão</td><td>${a.altura||'—'} m</td></tr>
                <tr><td class="os-th">Fator franzimento</td><td>${a.fator}x</td><td class="os-th">Largura total</td><td>${((a.largura||0)*(a.fator||1)).toFixed(2)} m</td></tr>
                <tr><td class="os-th">Bainha inferior</td><td>${a.bainha_cm||15} cm</td><td class="os-th">Cabeçote</td><td>${a.cabecote_cm||10} cm</td></tr>
                ${a.rapport_cm>0?`<tr><td class="os-th">Acréscimo rapport</td><td>${((a.acrescimo_rapport_m||0)*100).toFixed(1)} cm/pano</td><td></td><td></td></tr>`:''}
            </table>
            <div class="os-destaque"><strong>${a.num_panos||'—'} pano(s)</strong> × <strong>${a.alt_corte?a.alt_corte.toFixed(3):'—'} m</strong> = <strong>${(a.consumo_linear||0).toFixed(2)} m lineares</strong></div>
        </div>`).join('');
    const itensHTML = ped.itens && ped.itens.length ? `
        <div class="os-section">
            <div class="os-section-title">Materiais e Acessórios</div>
            <table class="os-table">
                <tr><td class="os-th" style="width:40%">Material</td><td class="os-th">Quantidade</td><td class="os-th">Unidade</td></tr>
                ${ped.itens.map(i=>`<tr><td>${i.nome}</td><td>${i.quantidade}</td><td>${i.unidade}</td></tr>`).join('')}
            </table>
        </div>` : '';
    container.innerHTML = `
        <div class="os-header">
            <div>
                <div class="os-empresa"><div class="logo-box" style="display:inline-flex;vertical-align:middle;margin-right:8px;font-size:14px;width:36px;height:36px">SC</div>SCTech</div>
                <div class="os-titulo">ORDEM DE SERVIÇO INTERNA</div>
                <div class="os-aviso">⚠ SEM VALOR COMERCIAL — USO EXCLUSIVAMENTE INTERNO</div>
            </div>
            <div class="os-meta">
                <div class="os-meta-item"><span>OS Nº</span><strong>${String(ped.id).slice(-6)}</strong></div>
                <div class="os-meta-item"><span>Emissão</span><strong>${hoje}</strong></div>
                ${ped.data_entrega ? `<div class="os-meta-item"><span>Previsão entrega</span><strong>${new Date(ped.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></div>` : ''}
                <div class="os-meta-item"><span>Status</span><strong>${normalizarStatus(ped.status)}</strong></div>
            </div>
        </div>
        <div class="os-section">
            <table class="os-table">
                <tr><td class="os-th">Cliente</td><td><strong>${cliente?cliente.nome:'—'}</strong></td><td class="os-th">Telefone</td><td>${cliente&&cliente.tel?cliente.tel:'—'}</td></tr>
                <tr><td class="os-th">Ambientes</td><td><strong>${ped.amb||'—'}</strong></td><td class="os-th">E-mail</td><td>${cliente&&cliente.email?cliente.email:'—'}</td></tr>
                <tr><td class="os-th">Endereço</td><td colspan="3">${cliente&&cliente.end?cliente.end:'—'}</td></tr>
            </table>
        </div>
        ${ambientesHTML}${itensHTML}
        <div class="os-section"><div class="os-section-title">Observações</div><div class="os-obs-box" style="padding:10px 14px;font-size:14px;min-height:64px">${ped.observacoes ? escapeHtml(ped.observacoes) : ''}</div></div>
        <div class="os-assinaturas">
            <div class="os-assinatura-item"><div class="os-section-title">Costureira</div><div class="os-linha-assinatura"></div><small>Nome / Assinatura / Data conclusão</small></div>
            <div class="os-assinatura-item"><div class="os-section-title">Instalador</div><div class="os-linha-assinatura"></div><small>Nome / Assinatura / Data instalação</small></div>
            <div class="os-assinatura-item"><div class="os-section-title">Conferência (Gerência)</div><div class="os-linha-assinatura"></div><small>Nome / Visto / Data</small></div>
        </div>`;
}

// --- PROPOSTA PDF ---
function renderProposta() {
    const id = localStorage.getItem('sc_proposta_id');
    const ped = db.pedidos.find(p => p.id == id);
    const container = document.getElementById('proposta-container');
    if (!ped) { container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">Pedido não encontrado.</p>'; return; }
    const ambientes    = normalizarAmbientes(ped);
    const cliente      = db.clientes.find(c => c.id == ped.clienteId);
    const hoje         = new Date().toLocaleDateString('pt-BR');
    const validade     = new Date(Date.now() + 15*24*60*60*1000).toLocaleDateString('pt-BR');
    const totalConsumo = ambientes.reduce((s,a)=>s+(a.consumo_linear||((a.largura||0)*(a.fator||1))),0);
    const totalMat     = ped.total_material || ambientes.reduce((s,a)=>s+(a.total_material||0),0);
    const totalAcess   = ped.total_acessorios || 0;
    const ambRows = ambientes.map(a => {
        const consumo  = a.consumo_linear || ((a.largura||0)*(a.fator||1));
        const altCorte = a.alt_corte ? a.alt_corte.toFixed(3) : '—';
        return `<tr>
            <td><strong>${a.amb||'—'}</strong></td>
            <td><strong>${a.prega?'Cortina Prega '+a.prega:'Cortina'}</strong> em ${a.tecidoNome||'Tecido selecionado'}${a.fixacao?' — '+a.fixacao:''}
                <small>Vão: ${a.largura}m × ${a.altura||'—'}m | Fator: ${a.fator}x | ${a.num_panos||'—'} pano(s) de ${altCorte}m${a.rapport_cm>0?' | Rapport: '+a.rapport_cm+'cm':''}</small>
            </td>
            <td>${consumo.toFixed(2)} m</td><td>R$ ${(a.total_material||0).toFixed(2)}</td>
        </tr>`;
    }).join('');
    const acessRows = ped.itens && ped.itens.length ? ped.itens.map(i =>
        `<tr><td><em>Acessório</em></td><td>${i.nome}</td><td>${i.quantidade} ${i.unidade}</td><td>R$ ${i.subtotal.toFixed(2)}</td></tr>`
    ).join('') : '';
    container.innerHTML = `
        <div class="proposta-header">
            <div class="proposta-logo"><div class="logo-box">SC</div><div><h1 style="font-size:22px;color:var(--primary)">SCTech</h1><p style="font-size:12px;color:#888">Sistema de Gestão</p></div></div>
            <div class="proposta-info"><h2>PROPOSTA COMERCIAL</h2><p>Nº <strong>${String(ped.id).slice(-6)}</strong></p><p>Data de emissão: ${hoje}</p><p>Válida até: ${validade}</p></div>
        </div>
        <div class="proposta-cliente">
            <h3>Cliente</h3>
            <p><strong>${cliente?cliente.nome:'Não vinculado'}</strong></p>
            ${cliente&&cliente.cpf   ? `<p>CPF: ${cliente.cpf}</p>`     : ''}
            ${cliente&&cliente.tel   ? `<p>Tel: ${cliente.tel}</p>`     : ''}
            ${cliente&&cliente.email ? `<p>${cliente.email}</p>`        : ''}
            ${cliente&&cliente.end   ? `<p>${cliente.end}</p>`          : ''}
        </div>
        <table class="proposta-tabela">
            <thead><tr><th style="width:15%">Ambiente</th><th>Descrição</th><th style="width:14%">Consumo</th><th style="width:14%">Valor</th></tr></thead>
            <tbody>${ambRows}${acessRows}</tbody>
        </table>
        <div class="proposta-totais">
            <div class="proposta-linha"><span>Materiais (${totalConsumo.toFixed(2)} m)</span><span>R$ ${totalMat.toFixed(2)}</span></div>
            ${totalAcess > 0 ? `<div class="proposta-linha"><span>Acessórios e ferragens</span><span>R$ ${totalAcess.toFixed(2)}</span></div>` : ''}
            <div class="proposta-linha"><span>Mão de Obra / Instalação</span><span>R$ ${(ped.maoObra||0).toFixed(2)}</span></div>
            ${ped.desconto_pct > 0 ? `<div class="proposta-linha" style="color:#dc2626"><span>Desconto (${ped.desconto_pct}%)</span><span>− R$ ${(ped.desconto_valor||0).toFixed(2)}</span></div>` : ''}
            <div class="proposta-linha proposta-total"><span>VALOR TOTAL</span><span>R$ ${ped.valor.toFixed(2)}</span></div>
            ${ped.data_entrega ? `<div class="proposta-linha" style="margin-top:10px;padding-top:10px;border-top:1px solid #eee;font-weight:600"><span>Previsão de Entrega</span><span>${new Date(ped.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
        </div>
        <div class="proposta-termos">
            <h4>Condições Gerais</h4>
            <ul>
                <li>Proposta válida por 15 dias a partir da data de emissão.</li>
                <li>O prazo de produção inicia após a confirmação formal e o recebimento do sinal combinado.</li>
                <li>As medidas estão sujeitas a conferência técnica <em>in loco</em> antes do corte definitivo do tecido.</li>
                <li>Alterações no projeto após a aprovação podem gerar custos adicionais.</li>
                <li>Não nos responsabilizamos por variações de tonalidade entre rolos de tecido de lotes distintos não informados previamente.</li>
            </ul>
        </div>
        <div class="proposta-aprovacao"><p>Aprovado em: _____ / _____ / _________</p><br><p>Assinatura do cliente: _________________________________________________</p></div>`;
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {

    if (document.getElementById('tb-pedidos')) {
        localStorage.removeItem('sc_editando_id');
        renderDashboard();
    }

    if (document.getElementById('tb-catalogo')) {
        const rows = db.catalogo.map(c => {
            const disp = estoqueDisponivel(c.id);
            const dispTxt = db.estoque.some(r=>r.tecido_id==c.id) ? `${disp.toFixed(2)} m` : '—';
            const alertMin = c.min_estoque>0&&disp<c.min_estoque ? `<span class="badge-alerta" style="margin-left:6px">⚠</span>` : '';
            return `<tr><td>${c.nome}</td><td>R$ ${c.preco.toFixed(2)}</td><td>${(c.largura_rolo||2.80).toFixed(2)} m</td><td>${c.rapport?c.rapport+' cm':'—'}</td><td>${c.min_estoque?c.min_estoque+' m':'—'}</td><td>${dispTxt}${alertMin}</td><td><button class="btn btn-outline btn-sm btn-danger" onclick="excluirCatalogo(${c.id})">Remover</button></td></tr>`;
        }).join('');
        document.getElementById('tb-catalogo').innerHTML = rows || '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">Catálogo vazio.</td></tr>';
    }

    if (document.getElementById('tb-clientes')) {
        const rows = db.clientes.map(c => `<tr><td>${c.nome}</td><td>${c.tel||'—'}</td><td>${c.email||'—'}</td><td>${c.cpf||'—'}</td><td>${c.end||'—'}</td></tr>`).join('');
        document.getElementById('tb-clientes').innerHTML = rows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Nenhum cliente cadastrado.</td></tr>';
    }

    // Formulário de Pedido
    if (document.getElementById('ped-cliente')) {
        document.getElementById('ped-cliente').innerHTML =
            '<option value="">— Selecione o Cliente —</option>' +
            db.clientes.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');

        const kitSel = document.getElementById('ped-kit');
        if (kitSel) kitSel.innerHTML = '<option value="">— Selecione um kit —</option>' +
            db.kits.map(k=>`<option value="${k.id}">${k.nome}</option>`).join('');

        const matSel = document.getElementById('ped-item-mat');
        if (matSel) matSel.innerHTML = '<option value="">— Selecione o material —</option>' +
            db.materiais.map(m=>`<option value="${m.id}">${m.nome} (${m.unidade}) · estoque: ${(m.estoque_atual||0).toFixed(1)}</option>`).join('');

        const idParaEditar = localStorage.getItem('sc_editando_id');
        if (idParaEditar) {
            editandoIdPedido = parseInt(idParaEditar);
            document.getElementById('titulo-pagina-pedido').innerText = `Editando Pedido #${String(editandoIdPedido).slice(-6)}`;
            carregarPedidoParaEdicao(editandoIdPedido);
        } else {
            adicionarAmbiente();
            renderItensPedido();
        }
    }

    if (document.getElementById('dashboard-alertas')) {
        const alertEl = document.getElementById('dashboard-alertas');
        const criticos = db.catalogo.filter(c=>c.min_estoque>0&&estoqueDisponivel(c.id)<c.min_estoque);
        if (criticos.length) {
            alertEl.innerHTML = `<strong>⚠ Alerta de Estoque:</strong> ` +
                criticos.map(c=>`<span class="alerta-inline"><strong>${c.nome}</strong>: ${estoqueDisponivel(c.id).toFixed(2)} m (mín. ${c.min_estoque} m)</span>`).join('');
            alertEl.style.display = 'flex';
        }
    }

    // Estoque (aba de tecidos)
    if (document.getElementById('tb-estoque')) {
        const sel = document.getElementById('est-tecido');
        if (sel) sel.innerHTML = '<option value="">— Selecione o Tecido —</option>' +
            db.catalogo.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
        const dataEl = document.getElementById('est-data');
        if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
        renderEstoque();
    }

    // Estoque (aba de materiais)
    if (document.getElementById('tb-materiais')) {
        renderMateriais();
    }

    // Estoque (aba de kits)
    if (document.getElementById('tb-kits')) {
        const matSel = document.getElementById('kit-item-mat');
        if (matSel) matSel.innerHTML = '<option value="">— Selecione o material —</option>' +
            db.materiais.map(m=>`<option value="${m.id}">${m.nome} (${m.unidade})</option>`).join('');
        renderKitDraftItens();
        renderKits();
    }

    if (document.getElementById('tb-historico')) renderHistorico();

    if (document.getElementById('proposta-container')) renderProposta();
    if (document.getElementById('kanban-board'))       renderKanban();
    if (document.getElementById('os-container'))       renderOS();
});
