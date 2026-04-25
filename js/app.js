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
    movimentos:  JSON.parse(localStorage.getItem('sc_mov'))  || [],
    vendedores:  JSON.parse(localStorage.getItem('sc_vend')) || [],
    fornecedores:    JSON.parse(localStorage.getItem('sc_forn')) || [],
    pedidos_compra:  JSON.parse(localStorage.getItem('sc_pc'))   || []
};

function syncDB() {
    localStorage.setItem('sc_cli',  JSON.stringify(db.clientes));
    localStorage.setItem('sc_cat',  JSON.stringify(db.catalogo));
    localStorage.setItem('sc_ped',  JSON.stringify(db.pedidos));
    localStorage.setItem('sc_est',  JSON.stringify(db.estoque));
    localStorage.setItem('sc_mat',  JSON.stringify(db.materiais));
    localStorage.setItem('sc_kits', JSON.stringify(db.kits));
    localStorage.setItem('sc_mov',  JSON.stringify(db.movimentos));
    localStorage.setItem('sc_vend', JSON.stringify(db.vendedores));
    localStorage.setItem('sc_forn', JSON.stringify(db.fornecedores));
    localStorage.setItem('sc_pc',   JSON.stringify(db.pedidos_compra));
}

function registrarMovimento(tipo, item_nome, item_tipo, quantidade, unidade, referencia) {
    db.movimentos.unshift({
        id: Date.now(), data: Date.now(), tipo, item_nome, item_tipo,
        quantidade: Math.abs(quantidade), unidade, referencia: referencia || ''
    });
    if (db.movimentos.length > 500) db.movimentos.length = 500;
}

let editandoIdCliente  = null;
let editandoIdVendedor = null;
let editandoIdFornecedor = null;
let pcDraftItens = [];
const matSortState = { col: 'nome', dir: 1 };
const cliSortState = { col: 'nome', dir: 1 };

// --- TOAST ---
function toast(msg, tipo = 'success', ms = 3000) {
    let c = document.getElementById('sc-toast-wrap');
    if (!c) { c = document.createElement('div'); c.id = 'sc-toast-wrap'; c.className = 'toast-wrap'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = `sc-toast sc-toast-${tipo}`;
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
    setTimeout(() => { t.classList.remove('show'); t.addEventListener('transitionend', () => t.remove(), { once: true }); }, ms);
}
function toastReload(msg, tipo = 'success') {
    sessionStorage.setItem('sc_pending_toast', JSON.stringify({ msg, tipo }));
}
function salvarERecarregar(msg = 'Salvo com sucesso!') {
    syncDB(); toastReload(msg); window.location.reload();
}

// --- AUTENTICAÇÃO ---
// TODO: migrar para backend — senhas armazenadas como hash (bcrypt) no banco de dados
const USUARIOS = [
    { id: 1, login: 'Administrador', senha: '@cy3978I', nome: 'Administrador', perfil: 'admin' }
];

function checkAuth() {
    if (!sessionStorage.getItem('sc_user')) window.location.replace('login.html');
}

function realizarLogin() {
    const loginVal = document.getElementById('login-usuario').value.trim();
    const senhaVal = document.getElementById('login-senha').value;
    const erroEl   = document.getElementById('login-erro');
    const usuario  = USUARIOS.find(u => u.login === loginVal && u.senha === senhaVal);
    if (!usuario) {
        erroEl.textContent = 'Usuário ou senha incorretos.';
        erroEl.style.display = 'block';
        document.getElementById('login-senha').value = '';
        document.getElementById('login-usuario').focus();
        return;
    }
    sessionStorage.setItem('sc_user', JSON.stringify({ id: usuario.id, login: usuario.login, nome: usuario.nome, perfil: usuario.perfil }));
    window.location.href = 'index.html';
}

function logout() {
    sessionStorage.removeItem('sc_user');
    window.location.replace('login.html');
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- CLIENTES ---
function salvarCliente() {
    const nome  = document.getElementById('cli-nome').value.trim();
    if (!nome) return alert('Digite o nome do cliente');
    const cpf   = document.getElementById('cli-cpf')?.value.trim()   || '';
    const tel   = document.getElementById('cli-tel')?.value.trim()   || '';
    const email = document.getElementById('cli-email')?.value.trim() || '';
    const end   = document.getElementById('cli-end')?.value.trim()   || '';
    if (cpf) {
        const cpfNorm = cpf.replace(/\D/g, '');
        const dup = db.clientes.find(c => c.cpf && c.cpf.replace(/\D/g, '') === cpfNorm && c.id != editandoIdCliente);
        if (dup) return alert(`CPF já cadastrado.\nCliente existente: ${dup.nome}`);
    }
    if (editandoIdCliente) {
        const idx = db.clientes.findIndex(c => c.id == editandoIdCliente);
        if (idx !== -1) db.clientes[idx] = { ...db.clientes[idx], nome, tel, email, cpf, end };
        cancelarEdicaoCliente();
        salvarERecarregar('Cliente atualizado!');
    } else {
        db.clientes.push({ id: Date.now(), nome, tel, email, cpf, end });
        salvarERecarregar('Cliente cadastrado!');
    }
}
function editarCliente(id) {
    const c = db.clientes.find(x => x.id == id);
    if (!c) return;
    editandoIdCliente = id;
    document.getElementById('cli-nome').value  = c.nome  || '';
    document.getElementById('cli-tel').value   = c.tel   || '';
    document.getElementById('cli-email').value = c.email || '';
    document.getElementById('cli-cpf').value   = c.cpf   || '';
    document.getElementById('cli-end').value   = c.end   || '';
    const tit = document.getElementById('cli-form-titulo');
    const btn = document.getElementById('cli-btn-salvar');
    const cnc = document.getElementById('cli-btn-cancelar');
    if (tit) tit.textContent = 'Editar Cliente';
    if (btn) btn.textContent = 'Salvar Alterações';
    if (cnc) cnc.style.display = 'inline-block';
    document.getElementById('cli-nome').focus();
    document.querySelector('.card')?.scrollIntoView({ behavior: 'smooth' });
}
function cancelarEdicaoCliente() {
    editandoIdCliente = null;
    ['cli-nome','cli-tel','cli-email','cli-cpf','cli-end'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const tit = document.getElementById('cli-form-titulo');
    const btn = document.getElementById('cli-btn-salvar');
    const cnc = document.getElementById('cli-btn-cancelar');
    if (tit) tit.textContent = 'Cadastrar Novo Cliente';
    if (btn) btn.textContent = 'Salvar Cliente';
    if (cnc) cnc.style.display = 'none';
}
function excluirCliente(id) {
    const c = db.clientes.find(x => x.id == id);
    if (!c) return;
    const ativos = db.pedidos.filter(p => p.clienteId == id && normalizarStatus(p.status) !== 'Instalado');
    if (ativos.length) return alert(`Não é possível excluir: ${escapeHtml(c.nome)} possui ${ativos.length} pedido(s) ativo(s).`);
    if (!confirm(`Excluir o cliente "${c.nome}"? Os pedidos concluídos deste cliente serão mantidos.`)) return;
    db.clientes = db.clientes.filter(x => x.id != id);
    salvarERecarregar('Cliente excluído.');
}
function mostrarPedidosCliente(clienteId) {
    const c = db.clientes.find(x => x.id == clienteId);
    if (!c) return;
    const pedidos = db.pedidos.filter(p => p.clienteId == clienteId).sort((a, b) => b.id - a.id);
    const totalFat = pedidos.filter(p => normalizarStatus(p.status) === 'Instalado').reduce((s, p) => s + (p.valor || 0), 0);
    const aRec = pedidos.reduce((s, p) => s + Math.max(0, (p.valor || 0) - (p.valor_recebido || 0)), 0);
    const linhas = pedidos.map(p => {
        const cls   = COR_STATUS[normalizarStatus(p.status)] || 'st-orcamento';
        const pagto = statusPagamento(p);
        return `<tr>
            <td style="font-size:12px">#${String(p.id).slice(-6)}</td>
            <td style="font-size:13px">${escapeHtml(p.amb || '—')}</td>
            <td>R$ ${(p.valor||0).toFixed(2)} ${pagto.cls ? `<span class="${pagto.cls}">${pagto.label}</span>` : ''}</td>
            <td><span class="status-tag ${cls}" style="font-size:11px">${normalizarStatus(p.status)}</span></td>
            <td style="font-size:12px;color:#6b7280">${p.data_entrega ? new Date(p.data_entrega+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
        </tr>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box">
        <div class="modal-header">
            <div>
                <h3 style="margin-bottom:4px">${escapeHtml(c.nome)}</h3>
                <span style="font-size:13px;color:#888">${pedidos.length} pedido(s) · Faturado: R$ ${totalFat.toFixed(2)} · A receber: R$ ${aRec.toFixed(2)}</span>
            </div>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            <table><thead><tr><th>ID</th><th>Ambiente</th><th>Valor</th><th>Status</th><th>Entrega</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="5" style="text-align:center;color:#999;padding:16px">Nenhum pedido.</td></tr>'}</tbody></table>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
function filtrarTabelaClientes() {
    const busca = (document.getElementById('cli-busca')?.value || '').toLowerCase().trim();
    const lista = busca
        ? db.clientes.filter(c =>
            c.nome.toLowerCase().includes(busca) ||
            (c.cpf||'').replace(/\D/g,'').includes(busca.replace(/\D/g,'')) ||
            (c.tel||'').includes(busca) ||
            (c.email||'').toLowerCase().includes(busca))
        : db.clientes;
    renderTabelaClientes(lista);
}
function renderTabelaClientes(lista) {
    const tb = document.getElementById('tb-clientes');
    if (!tb) return;
    if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Nenhum cliente encontrado.</td></tr>'; return; }
    tb.innerHTML = lista.map(c => {
        const nPed = db.pedidos.filter(p => p.clienteId == c.id).length;
        return `<tr>
            <td><strong>${escapeHtml(c.nome)}</strong></td>
            <td>${escapeHtml(c.tel||'—')}</td>
            <td>${escapeHtml(c.email||'—')}</td>
            <td>${escapeHtml(c.cpf||'—')}</td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(c.end||'')}">${escapeHtml(c.end||'—')}</td>
            <td>
                ${nPed > 0 ? `<button class="btn btn-outline btn-sm" onclick="mostrarPedidosCliente(${c.id})" title="Ver pedidos">📋 ${nPed}</button>` : ''}
                <button class="btn btn-outline btn-sm" onclick="editarCliente(${c.id})">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirCliente(${c.id})">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// --- CATÁLOGO ---
function salvarCatalogo() {
    const nome = document.getElementById('cat-nome').value.trim();
    const preco = parseFloat(document.getElementById('cat-preco').value);
    const largura_rolo = parseFloat(document.getElementById('cat-largura').value) || 2.80;
    const referencia = document.getElementById('cat-ref')?.value.trim() || '';
    const min_estoque = parseFloat(document.getElementById('cat-min').value) || 0;
    if (!nome || !preco) return alert('Preencha o nome e o preço do material');
    const dup = db.catalogo.find(c => c.nome.trim().toLowerCase() === nome.toLowerCase());
    if (dup) return alert(`Já existe um tecido com o nome "${dup.nome}" no catálogo.`);
    const forn_id_cat  = parseInt(document.getElementById('cat-fornecedor')?.value) || null;
    const forn_obj_cat = forn_id_cat ? db.fornecedores.find(f => f.id === forn_id_cat) : null;
    db.catalogo.push({ id: Date.now(), nome, preco, largura_rolo, rapport: 0, referencia, min_estoque, fornecedor_id: forn_id_cat, fornecedor_nome: forn_obj_cat ? forn_obj_cat.nome : '' });
    salvarERecarregar('Tecido cadastrado no catálogo!');
}

function autoFillCatalogoPorReferencia() {
    const ref = document.getElementById('cat-ref')?.value.trim();
    if (!ref) return;
    const existing = db.catalogo.find(c => c.referencia && c.referencia.toLowerCase() === ref.toLowerCase());
    if (!existing) return;
    document.getElementById('cat-nome').value = existing.nome || '';
    document.getElementById('cat-preco').value = existing.preco || '';
    document.getElementById('cat-largura').value = existing.largura_rolo || 2.80;
    document.getElementById('cat-min').value = existing.min_estoque || 0;
    const fornSel = document.getElementById('cat-fornecedor');
    if (fornSel && existing.fornecedor_id) fornSel.value = existing.fornecedor_id;
}

function excluirCatalogo(id) {
    const emUso = db.pedidos.find(p => {
        if (normalizarStatus(p.status) === 'Instalado') return false;
        return normalizarAmbientes(p).some(a => (a.tecidos||[]).some(t => t.tecidoId == id));
    });
    if (emUso) {
        const cli = db.clientes.find(c => c.id == emUso.clienteId);
        return alert(`Não é possível remover: este tecido está em uso no pedido #${String(emUso.id).slice(-6)} (${cli?.nome || 'cliente'}).`);
    }
    if (!confirm('Remover este tecido do catálogo?')) return;
    db.catalogo = db.catalogo.filter(c => c.id != id);
    salvarERecarregar('Tecido removido.');
}

// --- PIPELINE DE STATUS ---
const STATUS_PIPELINE = [
    'Orçamento', 'Medição', 'Aguardando Tecido', 'Na Costura', 'Pronto p/ Instalação', 'Aguardando Pagamento', 'Instalado'
];

function normalizarStatus(status) {
    if (status === 'Produção') return 'Medição';
    if (status === 'Faturado') return 'Instalado';
    return STATUS_PIPELINE.includes(status) ? status : 'Orçamento';
}

function normalizarAmbientes(ped) {
    if (ped.ambientes && ped.ambientes.length) {
        return ped.ambientes.map(a => {
            if (a.tecidos && a.tecidos.length) return a;
            return {
                ...a,
                tecidos: [{
                    tecidoId: a.tecidoId || null, tecidoNome: a.tecidoNome || '',
                    largura_rolo: a.largura_rolo || 2.80, rapport_cm: a.rapport_cm || 0,
                    acrescimo_rapport_m: a.acrescimo_rapport_m || 0, num_panos: a.num_panos || 0,
                    alt_corte: a.alt_corte || 0, consumo_linear: a.consumo_linear || 0,
                    total_material: a.total_material || 0
                }]
            };
        });
    }
    if (ped.tecidoId || ped.largura) {
        return [{
            id: 1, calculado: true,
            amb: ped.amb || '', prega: ped.prega || 'Americana', fixacao: ped.fixacao || 'Trilho Suico',
            largura: ped.largura || 0, altura: ped.altura || 0, fator: ped.fator || 2.5,
            bainha_cm: ped.bainha_cm || 15, cabecote_cm: ped.cabecote_cm || 10,
            tecidos: [{
                tecidoId: ped.tecidoId, tecidoNome: ped.tecidoNome || '',
                largura_rolo: ped.largura_rolo || 2.80, rapport_cm: ped.rapport_cm || 0,
                acrescimo_rapport_m: ped.acrescimo_rapport_m || 0, num_panos: ped.num_panos || 0,
                alt_corte: ped.alt_corte || 0, consumo_linear: ped.consumo_linear || 0,
                total_material: ped.total_material || Math.max(0, (ped.valor || 0) - (ped.maoObra || 0))
            }]
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
    salvarERecarregar('Pedido excluído.');
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
    salvarERecarregar('Pedido aprovado!');
}

// --- BAIXA AUTOMÁTICA DE ESTOQUE ---
function realizarBaixaEstoque(ped) {
    const ambientes = normalizarAmbientes(ped);
    const pedRef = ped.id ? `Pedido #${String(ped.id).slice(-6)}` : 'Pedido';

    for (const a of ambientes) {
        for (const t of (a.tecidos || [])) {
            if (!t.tecidoId || !(t.consumo_linear > 0)) continue;
            let restante = t.consumo_linear;
            let totalBaixado = 0;
            const rolos = db.estoque
                .filter(r => r.tecido_id == t.tecidoId && r.metragem_atual > 0)
                .sort((x, y) => x.id - y.id);
            for (const r of rolos) {
                if (restante <= 0) break;
                const baixar = Math.min(r.metragem_atual, restante);
                r.metragem_atual = Math.round((r.metragem_atual - baixar) * 1000) / 1000;
                restante         = Math.round((restante - baixar)          * 1000) / 1000;
                totalBaixado    += baixar;
            }
            if (totalBaixado > 0)
                registrarMovimento('Baixa Pedido', t.tecidoNome || 'Tecido', 'tecido', totalBaixado, 'm', pedRef);
        }
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

function mostrarModalPagamento(ped, callback) {
    const total    = ped.valor || 0;
    const recebido = ped.valor_recebido || 0;
    const saldo    = total - recebido;
    const overlay  = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
        <div style="background:white;border-radius:10px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.22)">
            <h3 style="margin-bottom:6px;color:var(--dark)">Confirmar Entrega</h3>
            <p style="font-size:13px;color:#888;margin-bottom:18px">Pedido #${String(ped.id).slice(-6)}</p>
            <div style="background:#f8fafc;border-radius:6px;padding:14px 16px;margin-bottom:20px;font-size:14px">
                <div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:#555">Valor Total</span><strong>R$ ${total.toFixed(2)}</strong></div>
                <div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:#555">Valor Recebido</span><strong style="color:#059669">R$ ${recebido.toFixed(2)}</strong></div>
                <div style="display:flex;justify-content:space-between;padding:8px 0 4px;border-top:1px solid #e4e7eb;margin-top:4px"><span style="color:#555;font-weight:600">Saldo a Receber</span><strong style="color:${saldo > 0.01 ? '#dc2626' : '#059669'}">R$ ${saldo.toFixed(2)}</strong></div>
            </div>
            <p style="font-size:13px;color:#374151;font-weight:600;margin-bottom:14px">O pagamento foi recebido integralmente?</p>
            <div style="display:flex;flex-direction:column;gap:10px">
                <button id="mpg-sim" class="btn btn-success" style="padding:11px;font-size:14px">✓ Sim, pagamento completo → Instalado</button>
                <button id="mpg-nao" class="btn" style="background:#d97706;padding:11px;font-size:14px">⏳ Não, há saldo pendente → Aguardando Pagamento</button>
                <button id="mpg-cancel" class="btn btn-outline" style="padding:9px;font-size:13px">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#mpg-sim').onclick    = () => { document.body.removeChild(overlay); callback('pago'); };
    overlay.querySelector('#mpg-nao').onclick    = () => { document.body.removeChild(overlay); callback('pendente'); };
    overlay.querySelector('#mpg-cancel').onclick = () => { document.body.removeChild(overlay); callback(null); };
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

        // Validar estoque antes de prosseguir
        const insuficientes = [];
        ambientes.filter(a => a.tecidoId && a.consumo_linear > 0).forEach(a => {
            const disp = estoqueDisponivel(a.tecidoId);
            if (disp < a.consumo_linear) {
                const tec = db.catalogo.find(t => t.id == a.tecidoId);
                insuficientes.push(`• ${tec?.nome || 'Tecido'}${a.amb ? ' (' + a.amb + ')' : ''}: necessário ${a.consumo_linear.toFixed(2)} m, disponível ${disp.toFixed(2)} m`);
            }
        });
        (ped.itens || []).forEach(i => {
            const mat = db.materiais.find(m => m.id == i.materialId);
            const estAtual = mat ? (mat.estoque_atual || 0) : 0;
            if (estAtual < i.quantidade) {
                insuficientes.push(`• ${i.nome}: necessário ${i.quantidade} ${i.unidade}, disponível ${estAtual.toFixed(2)} ${i.unidade}`);
            }
        });
        if (insuficientes.length) {
            alert(`Não é possível avançar para "Na Costura": estoque insuficiente para os seguintes itens:\n\n${insuficientes.join('\n')}`);
            return;
        }

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

    // Intercept: avançar de "Pronto p/ Instalação" ou "Aguardando Pagamento" → verificar pagamento
    if ((STATUS_PIPELINE[idx] === 'Pronto p/ Instalação' || STATUS_PIPELINE[idx] === 'Aguardando Pagamento') && direcao === 1) {
        mostrarModalPagamento(ped, resultado => {
            if (!resultado) return;
            if (resultado === 'pago') {
                ped.valor_recebido = ped.valor;
                ped.status = 'Instalado';
                if (!ped.data_instalado) ped.data_instalado = Date.now();
            } else {
                ped.status = 'Aguardando Pagamento';
            }
            toastReload('Status atualizado!');
            syncDB();
            window.location.reload();
        });
        return;
    }

    ped.status = STATUS_PIPELINE[novoIdx];
    if (novoIdx === 1 && !ped.data_producao)  ped.data_producao  = Date.now();
    if (STATUS_PIPELINE[novoIdx] === 'Instalado' && !ped.data_instalado) ped.data_instalado = Date.now();
    toastReload('Status atualizado!');
    syncDB(); window.location.reload();
}

// --- DASHBOARD: métricas ---
const COR_STATUS = {
    'Orçamento': 'st-orcamento', 'Medição': 'st-medicao',
    'Aguardando Tecido': 'st-aguardando', 'Na Costura': 'st-costura',
    'Pronto p/ Instalação': 'st-pronto', 'Aguardando Pagamento': 'st-ag-pagamento', 'Instalado': 'st-faturado'
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
    if (texto)       pedidos = pedidos.filter(p => {
        const cpfBusca = texto.replace(/\D/g,'');
        const cli = cpfBusca.length >= 3 ? db.clientes.find(c => c.id == p.clienteId) : null;
        return String(p.id).slice(-6).includes(texto)
            || p.clienteNome.toLowerCase().includes(texto)
            || (p.amb || '').toLowerCase().includes(texto)
            || (cli && cli.cpf && cli.cpf.replace(/\D/g,'').includes(cpfBusca));
    });
    if (statusFiltro === 'em_producao') {
        pedidos = pedidos.filter(p => p._status !== 'Orçamento' && p._status !== 'Instalado');
    } else if (statusFiltro === 'atrasados') {
        const hojeF = new Date(); hojeF.setHours(0,0,0,0);
        pedidos = pedidos.filter(p => p.data_entrega && p._status !== 'Instalado' && new Date(p.data_entrega+'T00:00:00') < hojeF);
    } else if (statusFiltro === 'a_receber') {
        pedidos = pedidos.filter(p => (p.valor||0) - (p.valor_recebido||0) > 0.01);
    } else if (statusFiltro) {
        pedidos = pedidos.filter(p => p._status === statusFiltro);
    }

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
            <td><span style="cursor:pointer;color:var(--primary);font-weight:bold;text-decoration:underline" onclick="editarPedido(${p.id})" title="Editar pedido">#${String(p.id).slice(-6)}</span></td>
            <td>${escapeHtml(p.clienteNome||'')}</td>
            <td>${escapeHtml(p.amb||'')}</td>
            <td>R$ ${p.valor.toFixed(2)}${pagBadge}</td>
            <td>${entregaCell}</td>
            <td><span class="status-tag ${colorClass}">${p._status}</span> ${baixaTag}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="gerarProposta(${p.id})" title="Gerar proposta PDF">📄</button>
                <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})" title="Ver Ordem de Serviço">📋</button>
                ${btnAprovar}
                <button class="btn btn-outline btn-sm" onclick="editarPedido(${p.id})" title="Editar pedido">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirPedido(${p.id})" title="Excluir pedido">🗑️</button>
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

function filtrarMetrica(valor) {
    const sel = document.getElementById('filtro-status');
    if (sel) { sel.value = valor; }
    const tFiltro = document.getElementById('filtro-texto');
    if (tFiltro) tFiltro.value = '';
    renderDashboard();
    document.getElementById('tb-pedidos')?.closest('.card')?.scrollIntoView({ behavior: 'smooth' });
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
    const referencia = document.getElementById('est-lote').value.trim();
    const tecidoId   = parseInt(document.getElementById('est-tecido').value);
    const metros     = parseFloat(document.getElementById('est-metros').value);
    const data       = document.getElementById('est-data').value;
    if (!referencia)            return alert('Informe a referência do rolo.');
    if (!tecidoId)              return alert('Selecione o tecido.');
    if (!metros || metros <= 0) return alert('Informe a metragem do rolo.');
    db.estoque.push({ id: Date.now(), tecido_id: tecidoId, lote: referencia, metragem_inicial: metros, metragem_atual: metros, data_entrada: data });
    const nomeTec = db.catalogo.find(t => t.id === tecidoId)?.nome || 'Tecido';
    registrarMovimento('Entrada', `${nomeTec} — Ref. ${referencia}`, 'tecido', metros, 'm', referencia);
    salvarERecarregar('Entrada registrada!');
}

function autoFillTecidoPorReferencia() {
    const ref = document.getElementById('est-lote')?.value.trim();
    if (!ref || ref.length < 2) return;
    const existing = db.estoque.find(r => r.lote && r.lote.toLowerCase() === ref.toLowerCase());
    if (!existing) return;
    const sel = document.getElementById('est-tecido');
    if (sel) sel.value = String(existing.tecido_id);
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
    registrarMovimento('Baixa Manual', `${nomeTecBaixa} — Ref. ${rolo.lote}`, 'tecido', qtd, 'm', '');
    salvarERecarregar('Baixa de estoque registrada!');
}
function removerRolo(id) {
    if (!confirm('Remover este rolo do estoque?')) return;
    db.estoque = db.estoque.filter(r => r.id != id);
    salvarERecarregar('Rolo removido.');
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
                    <strong>Baixar ref. ${r.lote}</strong> — saldo: <strong>${r.metragem_atual.toFixed(3)} m</strong> &emsp;
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
    const dup = db.materiais.find(m => m.nome.trim().toLowerCase() === nome.toLowerCase());
    if (dup) return alert(`Já existe um material com o nome "${dup.nome}" no estoque.`);
    const forn_id_mat  = parseInt(document.getElementById('mat-fornecedor')?.value) || null;
    const forn_obj_mat = forn_id_mat ? db.fornecedores.find(f => f.id === forn_id_mat) : null;
    db.materiais.push({ id: Date.now(), nome, unidade, preco, min_estoque, estoque_atual: estoque_inicial, fornecedor_id: forn_id_mat, fornecedor_nome: forn_obj_mat ? forn_obj_mat.nome : '' });
    if (estoque_inicial > 0) registrarMovimento('Entrada', nome, 'material', estoque_inicial, unidade, 'Estoque inicial');
    salvarERecarregar('Material cadastrado!');
}

function excluirMaterial(id) {
    if (!confirm('Remover este material? Kits que o utilizam serão afetados.')) return;
    db.materiais = db.materiais.filter(m => m.id != id);
    db.kits.forEach(k => { k.itens = k.itens.filter(i => i.materialId != id); });
    salvarERecarregar('Material removido.');
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
    salvarERecarregar('Ajuste realizado!');
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

    let lista = [...db.materiais];
    const { col: mc, dir: md } = matSortState;
    lista.sort((a,b) => {
        const va = mc==='nome' ? a.nome.toLowerCase() : mc==='preco' ? (a.preco||0) : mc==='estoque' ? (a.estoque_atual||0) : 0;
        const vb = mc==='nome' ? b.nome.toLowerCase() : mc==='preco' ? (b.preco||0) : mc==='estoque' ? (b.estoque_atual||0) : 0;
        return va < vb ? -md : va > vb ? md : 0;
    });

    tb.innerHTML = lista.map(m => {
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
            <td style="font-size:12px;color:#555">${escapeHtml(m.fornecedor_nome || '—')}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="mostrarAjusteForm(${m.id})" title="Ajustar estoque">± Ajustar</button>
                <button class="btn btn-outline btn-sm" onclick="pedirMaterial(${m.id})" title="Criar pedido de compra">🛒</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirMaterial(${m.id})" title="Excluir material">🗑️</button>
            </td>
        </tr>
        <tr id="ajuste-${m.id}" class="ajuste-form" style="display:none">
            <td colspan="6" class="baixa-form-cell">
                <strong>${m.nome}</strong> — saldo: <strong>${(m.estoque_atual||0).toFixed(2)} ${m.unidade}</strong> &emsp;
                Quantidade (+ entrada / − saída):
                <input type="number" id="ajuste-qtd-${m.id}" placeholder="Ex: +10 ou -3" step="0.01" style="width:130px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;margin:0 8px">
                <button class="btn btn-sm" style="background:#059669" onclick="confirmarAjuste(${m.id})">Confirmar</button>
                <button class="btn btn-outline btn-sm" onclick="cancelarAjuste()">Cancelar</button>
            </td>
        </tr>`;
    }).join('');
}

function sortMateriais(col) {
    if (matSortState.col === col) matSortState.dir *= -1;
    else { matSortState.col = col; matSortState.dir = 1; }
    renderMateriais();
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
    salvarERecarregar('Kit salvo!');
}

function excluirKit(id) {
    if (!confirm('Remover este kit?')) return;
    db.kits = db.kits.filter(k => k.id != id);
    salvarERecarregar('Kit removido.');
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
    const filtroTipo  = document.getElementById('hist-filtro-tipo')?.value  || '';
    const filtroItem  = (document.getElementById('hist-filtro-item')?.value || '').toLowerCase().trim();
    const filtroDE    = document.getElementById('hist-filtro-de')?.value    || '';
    const filtroAte   = document.getElementById('hist-filtro-ate')?.value   || '';
    let movs = db.movimentos.slice(0, 500);
    if (filtroTipo)  movs = movs.filter(m => m.tipo === filtroTipo);
    if (filtroItem)  movs = movs.filter(m => m.item_nome.toLowerCase().includes(filtroItem));
    if (filtroDE)    movs = movs.filter(m => new Date(m.data) >= new Date(filtroDE  + 'T00:00:00'));
    if (filtroAte)   movs = movs.filter(m => new Date(m.data) <= new Date(filtroAte + 'T23:59:59'));
    if (!movs.length) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px;">Nenhuma movimentação encontrada.</td></tr>';
        return;
    }
    const COR = { 'Entrada':'mov-entrada','Baixa Pedido':'mov-baixa-pedido','Baixa Manual':'mov-baixa-manual','Ajuste +':'mov-ajuste-pos','Ajuste -':'mov-ajuste-neg' };
    tb.innerHTML = movs.slice(0, 300).map(m => {
        const cls  = COR[m.tipo] || '';
        const data = new Date(m.data).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
        const tipoLabel = m.tipo === 'Ajuste +' ? 'Ajuste ↑' : m.tipo === 'Ajuste -' ? 'Ajuste ↓' : m.tipo;
        return `<tr>
            <td style="font-size:12px;color:#6b7280;white-space:nowrap">${data}</td>
            <td><span class="mov-badge ${cls}">${tipoLabel}</span></td>
            <td>${escapeHtml(m.item_nome)} <span style="font-size:11px;color:#9ca3af">(${m.item_tipo==='tecido'?'Tecido':'Material'})</span></td>
            <td><strong>${m.quantidade.toFixed(2)}</strong> ${m.unidade}</td>
            <td style="font-size:12px;color:#6b7280">${escapeHtml(m.referencia||'—')}</td>
        </tr>`;
    }).join('');
}
function limparFiltrosHistorico() {
    ['hist-filtro-tipo','hist-filtro-item','hist-filtro-de','hist-filtro-ate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderHistorico();
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
    const fatoresSugeridos = {
        'Americana': '2.5', 'Americana-Tradicional': '2.5', 'Franzido': '2.5',
        'Wave': '2.0', 'Wave Botao': '2.0', 'Wave Plus': '2.0',
        'Macho-Femea': '2.0', 'Painel': '1.5'
    };
    const prega = document.getElementById(`a-prega-${id}`)?.value;
    const fatorEl = document.getElementById(`a-fator-${id}`);
    if (fatorEl && prega) fatorEl.value = fatoresSugeridos[prega] || '2.5';
}

function renderAmbienteBreakdown(a) {
    if (!a.calculado) return '';
    const tecidos = a.tecidos || [];
    if (!tecidos.length) return '';
    const alt_bruta = (a.altura||0) + (a.bainha_cm||15)/100 + (a.cabecote_cm||10)/100;
    const totalMat = tecidos.reduce((s,t)=>s+(t.total_material||0),0);
    const parts = tecidos.map((t, tidx) => {
        if (!t.tecidoId) return '';
        const disp = estoqueDisponivel(t.tecidoId);
        const stockColor = disp < (t.consumo_linear||0) ? '#dc2626' : '#059669';
        const temConflito = verificarConflitoDeLote(t.tecidoId, t.consumo_linear||0);
        const titulo = tecidos.length > 1 ? `<div class="breakdown-row" style="font-weight:bold;color:var(--primary);padding-bottom:6px;border-bottom:1px solid #dde">Tecido ${tidx+1}: ${escapeHtml(t.tecidoNome||'')}</div>` : '';
        return `<div class="breakdown-box" style="margin-top:10px">
            ${titulo}
            <div class="breakdown-row"><span class="label">Largura total (parede × fator)</span><span><strong>${((a.largura||0)*(a.fator||1)).toFixed(2)}</strong> m</span></div>
            <div class="breakdown-row"><span class="label">Largura do rolo</span><span><strong>${(t.largura_rolo||2.80).toFixed(2)}</strong> m</span></div>
            <div class="breakdown-row"><span class="label">Número de panos</span><span><strong>${t.num_panos}</strong> pano(s)</span></div>
            <div class="breakdown-row"><span class="label">Altura bruta (parede + barra + cabeçote)</span><span><strong>${alt_bruta.toFixed(3)}</strong> m</span></div>
            ${t.rapport_cm > 0 ? `<div class="breakdown-row"><span class="label">Acréscimo por rapport</span><span>+ <strong>${((t.acrescimo_rapport_m||0)*100).toFixed(1)}</strong> cm/pano</span></div>` : ''}
            <div class="breakdown-row"><span class="label">Altura de corte por pano</span><span><strong>${(t.alt_corte||0).toFixed(3)}</strong> m</span></div>
            <div class="breakdown-row destaque"><span>Consumo total</span><span><strong>${(t.consumo_linear||0).toFixed(2)}</strong> m lineares</span></div>
            <div class="breakdown-row"><span class="label">Estoque disponível</span><span style="color:${stockColor}"><strong>${disp.toFixed(2)} m</strong></span></div>
            <div class="breakdown-row"><span class="label">Valor do tecido</span><span>R$ <strong>${(t.total_material||0).toFixed(2)}</strong></span></div>
            ${temConflito ? `<div class="alerta-lote-pedido" style="display:flex;margin-top:4px">⚠ <strong style="margin:0 4px">Atenção:</strong> pode exigir múltiplos lotes — risco de variação de tonalidade.</div>` : ''}
        </div>`;
    }).join('');
    const totalRow = tecidos.length > 1 ? `<div class="breakdown-box" style="margin-top:6px"><div class="breakdown-row destaque"><span>Total combinado (${tecidos.length} tecidos)</span><span>R$ <strong>${totalMat.toFixed(2)}</strong></span></div></div>` : '';
    return parts + totalRow;
}

function renderAmbientes() {
    const container = document.getElementById('ambientes-container');
    if (!container) return;
    const FATORES = ['1.0','1.5','2.0','2.5','3.0','3.5','4.0'];
    container.innerHTML = pedidoDraft.ambientes.map((a, idx) => {
        const n = idx + 1;
        const pregaOpts = [
            {v:'Americana',l:'Prega Americana (2.5x)'},
            {v:'Americana-Tradicional',l:'Americana Tradicional (2.5x)'},
            {v:'Wave',l:'Wave (2.0x)'},
            {v:'Wave Botao',l:'Wave Botão (2.0x)'},
            {v:'Wave Plus',l:'Wave Plus/Flex (2.0x)'},
            {v:'Franzido',l:'Franzido (2.5x)'},
            {v:'Macho-Femea',l:'Prega Macho-Fêmea (2.0x)'},
            {v:'Painel',l:'Painel / Sem Prega (1.5x)'}
        ].map(o=>`<option value="${o.v}"${a.prega===o.v?' selected':''}>${o.l}</option>`).join('');
        const fixacaoOpts = [
            {v:'Trilho Suico',l:'Trilho Suíço'},
            {v:'Trilho Motorizado',l:'Trilho Motorizado'},
            {v:'Varao Aluminio Comum',l:'Varão Alumínio Comum'},
            {v:'Varao Aluminio Ilhos',l:'Varão Alumínio (Ilhós)'},
            {v:'Varao Suico Wave',l:'Varão Suíço/Wave'},
            {v:'Trilho Binet',l:'Trilho Binet'},
            {v:'Sobrepor',l:'Sobrepor (Grampo)'},
            {v:'Tubo/Varao',l:'Tubo / Varão'}
        ].map(o=>`<option value="${o.v}"${a.fixacao===o.v?' selected':''}>${o.l}</option>`).join('');
        const fatorOpts = FATORES.map(f=>`<option value="${f}"${String(a.fator||2.5)===f?' selected':''}>${f}x</option>`).join('');
        const tecidos = a.tecidos || [];
        const buildTecOpts = (selId) => '<option value="">— Selecione o Tecido —</option>' + db.catalogo.map(c => {
            const disp = estoqueDisponivel(c.id);
            const stockInfo = db.estoque.some(r=>r.tecido_id==c.id) ? ` · est: ${disp.toFixed(1)} m` : '';
            return `<option value="${c.id}"${selId==c.id?' selected':''}>${c.nome}${c.referencia?' ['+c.referencia+']':''} — R$ ${c.preco.toFixed(2)}/m${stockInfo}</option>`;
        }).join('');
        const tecidosHTML = tecidos.map((t, tidx) => {
            const removeBtn = tecidos.length > 1
                ? `<button class="btn btn-outline btn-sm btn-danger" onclick="removerTecidoDoAmbiente(${a.id},${tidx})" title="Remover este tecido" style="flex-shrink:0">×</button>`
                : '';
            return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                <div class="form-group" style="flex:1;margin:0">
                    <label>${tecidos.length > 1 ? 'Tecido '+(tidx+1) : 'Tecido'}</label>
                    <select id="a-tecido-${a.id}-${tidx}">${buildTecOpts(t.tecidoId)}</select>
                </div>
                ${removeBtn}
            </div>`;
        }).join('');
        const addTecBtn = tecidos.length < 3
            ? `<button class="btn btn-outline btn-sm" onclick="adicionarTecidoAoAmbiente(${a.id})" style="margin-bottom:10px;font-size:12px">+ Adicionar Tecido</button>`
            : '';
        const removeAmb = pedidoDraft.ambientes.length > 1
            ? `<button class="btn btn-outline btn-sm btn-danger" onclick="removerAmbiente(${a.id})" title="Remover ambiente">Remover</button>` : '';
        return `
<div class="card ambiente-card" id="amb-card-${a.id}">
    <div class="ambiente-card-header">
        <h4 style="margin:0;color:var(--primary)">Ambiente ${n}</h4>${removeAmb}
    </div>
    <div class="grid" style="margin-top:15px">
        <div class="form-group" style="grid-column:1/-1"><label>Nome do Ambiente</label>
            <input type="text" id="a-amb-${a.id}" value="${escapeHtml(a.amb||'')}" placeholder="Ex: Quarto Casal"></div>
    </div>
    <div class="grid">
        <div class="form-group"><label>Tipo de Prega</label><select id="a-prega-${a.id}" onchange="onPregaAmbiente(${a.id})">${pregaOpts}</select></div>
        <div class="form-group"><label>Fator de Franzimento <span class="info-tag">auto</span></label><select id="a-fator-${a.id}">${fatorOpts}</select></div>
        <div class="form-group"><label>Material de Instalação</label><select id="a-fixacao-${a.id}">${fixacaoOpts}</select></div>
    </div>
    <div class="grid">
        <div class="form-group"><label>Largura da Parede (m)</label><input type="number" id="a-larg-${a.id}" value="${a.largura||''}" placeholder="Ex: 2.40" step="0.01"></div>
        <div class="form-group"><label>Altura da Parede (m)</label><input type="number" id="a-alt-${a.id}" value="${a.altura||''}" placeholder="Ex: 2.60" step="0.01"></div>
        <div class="form-group"><label>Barra (cm) <span class="info-tag">padrão: 15</span></label><input type="number" id="a-bainha-${a.id}" value="${a.bainha_cm||15}" step="1"></div>
        <div class="form-group"><label>Cabeçote/Entretela (cm) <span class="info-tag">padrão: 10</span></label><input type="number" id="a-cabecote-${a.id}" value="${a.cabecote_cm||10}" step="1"></div>
    </div>
    ${tecidosHTML}
    ${addTecBtn}
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
        tecidos: [{ tecidoId: null, tecidoNome: '', largura_rolo: 2.80, rapport_cm: 0, acrescimo_rapport_m: 0, num_panos: 0, alt_corte: 0, consumo_linear: 0, total_material: 0 }],
        total_material: 0
    });
    renderAmbientes();
}

function adicionarTecidoAoAmbiente(ambId) {
    const a = pedidoDraft.ambientes.find(x => x.id === ambId);
    if (!a || (a.tecidos || []).length >= 3) return;
    if (!a.tecidos) a.tecidos = [];
    a.tecidos.push({ tecidoId: null, tecidoNome: '', largura_rolo: 2.80, rapport_cm: 0, acrescimo_rapport_m: 0, num_panos: 0, alt_corte: 0, consumo_linear: 0, total_material: 0 });
    a.calculado = false;
    renderAmbientes();
}

function removerTecidoDoAmbiente(ambId, tidx) {
    const a = pedidoDraft.ambientes.find(x => x.id === ambId);
    if (!a || !a.tecidos || a.tecidos.length <= 1) return;
    a.tecidos.splice(tidx, 1);
    a.calculado = false;
    renderAmbientes(); atualizarTotalPedido();
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
    if (!larg || larg <= 0) return alert('Informe a largura da parede.');
    if (!alt  || alt  <= 0) return alert('Informe a altura da parede.');
    if (!fator || fator <= 0) return alert('Informe um fator de franzimento válido (ex: 2.0).');
    a.amb = document.getElementById(`a-amb-${id}`)?.value.trim() || '';
    a.prega = document.getElementById(`a-prega-${id}`)?.value || 'Americana';
    a.fixacao = document.getElementById(`a-fixacao-${id}`)?.value || 'Trilho Suico';
    a.fator = fator; a.largura = larg; a.altura = alt; a.bainha_cm = bainha_cm; a.cabecote_cm = cabecote_cm;
    const alt_bruta = alt + bainha_cm / 100 + cabecote_cm / 100;
    const tecidos = a.tecidos || [];
    if (!tecidos.length) return alert('Adicione pelo menos um tecido ao ambiente.');
    let totalMat = 0;
    for (let tidx = 0; tidx < tecidos.length; tidx++) {
        const tecidoId = document.getElementById(`a-tecido-${id}-${tidx}`)?.value;
        if (!tecidoId) return alert(`Selecione o tecido${tecidos.length > 1 ? ' '+(tidx+1) : ''} do ambiente.`);
        const tecido = db.catalogo.find(t => t.id == tecidoId);
        if (!tecido) return;
        const t = tecidos[tidx];
        t.tecidoId = tecido.id; t.tecidoNome = tecido.nome;
        t.largura_rolo = tecido.largura_rolo || 2.80; t.rapport_cm = tecido.rapport || 0;
        let acrescimo_rapport_m = 0, alt_corte = alt_bruta;
        if (t.rapport_cm > 0) {
            const rapport_m = t.rapport_cm / 100;
            alt_corte = Math.ceil(alt_bruta / rapport_m) * rapport_m;
            acrescimo_rapport_m = alt_corte - alt_bruta;
        }
        const num_panos = Math.ceil((larg * fator) / t.largura_rolo);
        const consumo_linear = num_panos * alt_corte;
        t.acrescimo_rapport_m = acrescimo_rapport_m; t.alt_corte = alt_corte;
        t.num_panos = num_panos; t.consumo_linear = consumo_linear;
        t.total_material = consumo_linear * tecido.preco;
        totalMat += t.total_material;
    }
    a.total_material = totalMat;
    a.calculado = true;
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
    const totalMat    = pedidoDraft.ambientes.filter(a=>a.calculado).reduce((s,a)=>s+(a.tecidos||[]).reduce((ts,t)=>ts+(t.total_material||0),0),0);
    const totalItens  = pedidoDraft.itens.reduce((s,i)=>s+(i.subtotal||0),0);
    const mao         = parseFloat(document.getElementById('ped-mao')?.value) || 0;
    const bruto       = totalMat + totalItens + mao;
    const descPct     = parseFloat(document.getElementById('ped-desconto')?.value) || 0;
    const descVal     = Math.round(bruto * descPct / 100 * 100) / 100;
    const total       = bruto - descVal;
    const recEl = document.getElementById('ped-valor-recebido');
    if (recEl && parseFloat(recEl.value) > total) { recEl.value = total.toFixed(2); }
    const recebido    = parseFloat(document.getElementById('ped-valor-recebido')?.value) || 0;
    const saldo       = Math.max(0, total - recebido);
    const el = id => document.getElementById(id);
    if (el('ped-total-mat'))    el('ped-total-mat').textContent    = totalMat.toFixed(2);
    if (el('ped-total-itens'))  el('ped-total-itens').textContent  = totalItens.toFixed(2);
    if (el('ped-desconto-val')) el('ped-desconto-val').textContent = descVal.toFixed(2);
    if (el('ped-total-final'))  el('ped-total-final').textContent  = total.toFixed(2);
    if (el('ped-saldo'))        el('ped-saldo').textContent        = saldo.toFixed(2);

    const vendedorId  = parseInt(document.getElementById('ped-vendedor')?.value) || 0;
    const vendedorObj = db.vendedores.find(v => v.id === vendedorId);
    const comissaoPct = vendedorObj ? (vendedorObj.comissao_pct || 0) : 0;
    const comissaoVal = comissaoPct > 0 ? Math.round(total * comissaoPct / 100 * 100) / 100 : 0;
    const rowEl = document.getElementById('ped-comissao-row');
    if (rowEl) rowEl.style.display = comissaoPct > 0 ? '' : 'none';
    if (el('ped-comissao-pct')) el('ped-comissao-pct').textContent = comissaoPct;
    if (el('ped-comissao-val')) el('ped-comissao-val').textContent = comissaoVal.toFixed(2);
}

function filtrarClientes() {
    const busca = (document.getElementById('ped-cliente-busca')?.value || '').toLowerCase().trim();
    const sel   = document.getElementById('ped-cliente');
    if (!sel) return;
    const filtrados = busca
        ? db.clientes.filter(c =>
            c.nome.toLowerCase().includes(busca) ||
            (c.cpf || '').replace(/\D/g, '').includes(busca.replace(/\D/g, ''))
          )
        : db.clientes;
    sel.innerHTML = '<option value="">— Selecione o Cliente —</option>' +
        filtrados.map(c => `<option value="${c.id}">${c.nome}${c.cpf ? ' · ' + c.cpf : ''}</option>`).join('');
    if (filtrados.length === 1) sel.value = String(filtrados[0].id);
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
    const total_material   = pedidoDraft.ambientes.reduce((s,a)=>s+(a.tecidos||[]).reduce((ts,t)=>ts+(t.total_material||0),0),0);
    const total_acessorios = pedidoDraft.itens.reduce((s,i)=>s+(i.subtotal||0),0);
    const bruto            = total_material + total_acessorios + maoObra;
    const desconto_pct     = parseFloat(document.getElementById('ped-desconto')?.value) || 0;
    const desconto_valor   = Math.round(bruto * desconto_pct / 100 * 100) / 100;
    const valor            = bruto - desconto_valor;
    const ambNomes         = pedidoDraft.ambientes.map(a=>a.amb).filter(Boolean).join(', ') || 'Sem nome';
    const vendedor_id_sel  = parseInt(document.getElementById('ped-vendedor')?.value) || null;
    const vendedor_obj     = vendedor_id_sel ? db.vendedores.find(v => v.id === vendedor_id_sel) : null;
    const comissao_pct     = vendedor_obj ? (vendedor_obj.comissao_pct || 0) : 0;
    const comissao_valor   = comissao_pct > 0 ? Math.round(valor * comissao_pct / 100 * 100) / 100 : 0;
    const dadosPedido = {
        clienteId, clienteNome: cliente ? cliente.nome : 'Cliente Não Vinculado',
        amb: ambNomes, ambientes: pedidoDraft.ambientes.map(a=>({...a})),
        itens: pedidoDraft.itens.map(i=>({...i})),
        maoObra, total_material, total_acessorios, desconto_pct, desconto_valor, valor,
        status:         document.getElementById('ped-status')?.value || 'Orçamento',
        data_entrega:   document.getElementById('ped-entrega')?.value || null,
        observacoes:    document.getElementById('ped-obs')?.value.trim() || '',
        valor_recebido: parseFloat(document.getElementById('ped-valor-recebido')?.value) || 0,
        vendedor_id:    vendedor_id_sel,
        vendedor_nome:  vendedor_obj ? vendedor_obj.nome : '',
        comissao_pct,
        comissao_valor
    };
    if (editandoIdPedido) {
        const index = db.pedidos.findIndex(p => p.id == editandoIdPedido);
        dadosPedido.id = editandoIdPedido;
        if (index >= 0) {
            dadosPedido.data_producao     = db.pedidos[index].data_producao;
            dadosPedido.data_instalado    = db.pedidos[index].data_instalado;
            dadosPedido.baixa_realizada   = db.pedidos[index].baixa_realizada;
            dadosPedido.comissao_paga     = db.pedidos[index].comissao_paga     || false;
            dadosPedido.comissao_data_pgto = db.pedidos[index].comissao_data_pgto || null;
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
    toastReload('Pedido salvo!');
    window.location.href = 'index.html';
}

function carregarPedidoParaEdicao(id) {
    const ped = db.pedidos.find(p => p.id == id);
    if (!ped) return;
    const cli = db.clientes.find(c => c.id == ped.clienteId);
    const buscaEl = document.getElementById('ped-cliente-busca');
    if (buscaEl && cli) { buscaEl.value = cli.nome; filtrarClientes(); }
    document.getElementById('ped-cliente').value = String(ped.clienteId || '');
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
    const vendedorEl = document.getElementById('ped-vendedor');
    if (vendedorEl) vendedorEl.value = String(ped.vendedor_id || '');
    const ambientes = normalizarAmbientes(ped);
    _ambienteCounter = ambientes.length;
    pedidoDraft.ambientes = ambientes.map((a, i) => ({
        ...a, id: i + 1,
        tecidos: (a.tecidos || []).map(t => ({...t}))
    }));
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
        { status: 'Aguardando Pagamento', label: 'Aguardando Pagamento',    cor: '#b45309', bg: '#fef3c7' },
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
        const isInstalado = col.status === 'Instalado';
        const cards = pedidosCol.length === 0 ? `<div class="kanban-empty">Nenhum pedido nesta etapa</div>`
            : pedidosCol.map(p => {
                const dataRef      = p.data_producao || p.id;
                const dias         = Math.floor((Date.now() - dataRef) / (1000 * 60 * 60 * 24));
                const ambientes    = normalizarAmbientes(p);
                const podeVoltar   = idx > 1;
                const podeAvancar  = idx < STATUS_PIPELINE.length - 1;
                const obsBadge     = p.observacoes ? `<span title="${escapeHtml(p.observacoes)}" style="cursor:help;margin-left:4px">💬</span>` : '';
                const cardAtrasado = statusEntrega(p)?.cls === 'badge-atrasado' ? ' kanban-card-atrasado' : '';
                if (isInstalado) {
                    const dataInst = p.data_instalado ? new Date(p.data_instalado).toLocaleDateString('pt-BR') : (dias + 'd atrás');
                    return `<div class="kanban-card${cardAtrasado}" style="padding:8px 10px">
                        <div class="kanban-card-top">
                            <span class="kanban-card-id" style="cursor:pointer;text-decoration:underline" onclick="editarPedido(${p.id})" title="Editar pedido">#${String(p.id).slice(-6)}</span>
                            <span class="kanban-card-age">${dataInst}</span>
                        </div>
                        <div class="kanban-card-cliente" style="font-size:13px">${escapeHtml(p.clienteNome||'')}${obsBadge}</div>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(p.amb||'')}</div>
                        <div class="kanban-card-actions" style="margin-top:6px">
                            <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})" title="Ver Ordem de Serviço">📋 OS</button>
                            ${podeVoltar ? `<button class="btn btn-outline btn-sm" onclick="moverStatus(${p.id},-1)" title="Voltar status">←</button>` : ''}
                        </div>
                    </div>`;
                }
                const totalConsumo = ambientes.reduce((s,a)=>s+(a.tecidos||[]).reduce((ts,t)=>ts+(t.consumo_linear||0),0),0);
                const totalPanos   = ambientes.reduce((s,a)=>s+(a.tecidos||[]).reduce((ts,t)=>ts+(t.num_panos||0),0),0);
                const tecidoNomes  = [...new Set(ambientes.flatMap(a=>(a.tecidos||[]).map(t=>t.tecidoNome).filter(Boolean)))];
                const pregaTipos   = [...new Set(ambientes.map(a=>a.prega).filter(Boolean))];
                let badgeEst = '';
                for (const a of ambientes) {
                    for (const t of (a.tecidos||[])) {
                        if (!t.tecidoId) continue;
                        const disp = estoqueDisponivel(t.tecidoId);
                        if (disp < (t.consumo_linear||0)) { badgeEst = `<span class="badge-sem-estoque">⚠ Sem estoque</span>`; break; }
                        else if (!badgeEst && verificarConflitoDeLote(t.tecidoId, t.consumo_linear||0)) badgeEst = `<span class="badge-lote">⚠ Múltiplos lotes</span>`;
                    }
                    if (badgeEst.includes('Sem estoque')) break;
                }
                const badgeBaixa   = p.baixa_realizada ? `<span class="badge-baixa">✔ Baixa OK</span>` : '';
                const entregaInf   = statusEntrega(p);
                const entregaBadge = entregaInf ? `<span class="${entregaInf.cls}">${entregaInf.label}</span>` : '';
                return `<div class="kanban-card${cardAtrasado}">
                    <div class="kanban-card-top">
                        <span class="kanban-card-id" style="cursor:pointer;text-decoration:underline" onclick="editarPedido(${p.id})" title="Editar pedido">#${String(p.id).slice(-6)}</span>
                        <span class="kanban-card-age">${dias === 0 ? 'hoje' : dias + 'd'}</span>
                    </div>
                    <div class="kanban-card-cliente">${escapeHtml(p.clienteNome||'')}${obsBadge}</div>
                    <div class="kanban-card-amb">${escapeHtml(p.amb||'')}</div>
                    ${entregaBadge ? `<div style="margin:3px 0 5px">${entregaBadge}</div>` : ''}
                    <div class="kanban-card-info">${pregaTipos.join(', ')||'—'} · ${tecidoNomes.join(', ')||'—'}<br>${totalPanos} pano(s) · ${totalConsumo.toFixed(2)} m</div>
                    ${badgeEst||badgeBaixa ? `<div style="margin-bottom:6px">${badgeEst}${badgeBaixa}</div>` : ''}
                    <div class="kanban-card-actions">
                        <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})" title="Ver Ordem de Serviço">📋 OS</button>
                        <div style="display:flex;gap:4px">
                            ${podeVoltar  ? `<button class="btn btn-outline btn-sm" onclick="moverStatus(${p.id},-1)" title="Voltar etapa">←</button>` : `<span class="kanban-nav-ph"></span>`}
                            ${podeAvancar ? `<button class="btn btn-sm" onclick="moverStatus(${p.id},1)" title="Avançar etapa">→</button>` : ''}
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
    const ambientesHTML = ambientes.map((a, idx) => {
        const tecidos = a.tecidos || [];
        const totalConsumo = tecidos.reduce((s,t)=>s+(t.consumo_linear||0),0);
        const tecidoRows = tecidos.map((t, tidx) => {
            const label = tecidos.length > 1 ? `Tecido ${tidx+1}` : 'Tecido';
            return `<tr><td class="os-th">${label}</td><td><strong>${t.tecidoNome||'—'}</strong></td><td class="os-th">Rapport</td><td>${t.rapport_cm>0?t.rapport_cm+' cm':'Liso'}</td></tr>
                <tr><td class="os-th">Panos</td><td>${t.num_panos||'—'}</td><td class="os-th">Alt. Corte</td><td>${t.alt_corte?t.alt_corte.toFixed(3):'—'} m</td></tr>
                <tr><td class="os-th">Consumo</td><td colspan="3"><strong>${(t.consumo_linear||0).toFixed(2)} m lineares</strong></td></tr>`;
        }).join('');
        return `
        <div class="os-section">
            <div class="os-section-title">Ambiente ${idx+1}${a.amb ? ': '+a.amb : ''}</div>
            <table class="os-table">
                <tr><td class="os-th">Tipo de Prega</td><td><strong>${a.prega||'—'}</strong></td><td class="os-th">Mat. Instalação</td><td><strong>${a.fixacao||'—'}</strong></td></tr>
            </table>
            <table class="os-table" style="margin-top:8px">
                <tr><td class="os-th">Largura da parede</td><td>${a.largura} m</td><td class="os-th">Altura da parede</td><td>${a.altura||'—'} m</td></tr>
                <tr><td class="os-th">Fator franzimento</td><td>${a.fator}x</td><td class="os-th">Largura total</td><td>${((a.largura||0)*(a.fator||1)).toFixed(2)} m</td></tr>
                <tr><td class="os-th">Barra</td><td>${a.bainha_cm||15} cm</td><td class="os-th">Cabeçote/Entretela</td><td>${a.cabecote_cm||10} cm</td></tr>
            </table>
            <table class="os-table" style="margin-top:8px">${tecidoRows}</table>
            ${tecidos.length > 1 ? `<div class="os-destaque">Total: <strong>${totalConsumo.toFixed(2)} m lineares</strong> (${tecidos.length} tecidos)</div>` : ''}
        </div>`;
    }).join('');
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
    const totalConsumo = ambientes.reduce((s,a)=>s+(a.tecidos||[]).reduce((ts,t)=>ts+(t.consumo_linear||0),0),0);
    const totalMat     = ped.total_material || ambientes.reduce((s,a)=>s+(a.total_material||0),0);
    const totalAcess   = ped.total_acessorios || 0;
    const ambRows = ambientes.map(a => {
        const tecidos = a.tecidos || [];
        const consumoAmb = tecidos.reduce((s,t)=>s+(t.consumo_linear||0),0);
        const totalMatAmb = tecidos.reduce((s,t)=>s+(t.total_material||0),0);
        const descTecidos = tecidos.map(t => t.tecidoNome).filter(Boolean).join(' + ') || 'Tecido selecionado';
        const primTec = tecidos[0] || {};
        return `<tr>
            <td><strong>${a.amb||'—'}</strong></td>
            <td><strong>${a.prega?'Cortina '+a.prega:'Cortina'}</strong> em ${descTecidos}${a.fixacao?' — '+a.fixacao:''}
                <small>Parede: ${a.largura}m × ${a.altura||'—'}m | Fator: ${a.fator}x | ${(primTec.num_panos||'—')} pano(s) de ${primTec.alt_corte?primTec.alt_corte.toFixed(3):'—'}m${tecidos.length>1?' | '+tecidos.length+' tecidos':''}</small>
            </td>
            <td>${consumoAmb.toFixed(2)} m</td><td>R$ ${totalMatAmb.toFixed(2)}</td>
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

// --- BACKUP / EXPORTAR ---
function exportarDados() {
    const dados = {
        versao: '1.0', exportado_em: new Date().toISOString(),
        clientes: db.clientes, catalogo: db.catalogo, pedidos: db.pedidos,
        estoque: db.estoque, materiais: db.materiais, kits: db.kits,
        movimentos: db.movimentos, vendedores: db.vendedores,
        fornecedores: db.fornecedores, pedidos_compra: db.pedidos_compra
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `sctech_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast('Backup exportado com sucesso!');
}
function importarDados(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const dados = JSON.parse(e.target.result);
            if (!dados.clientes || !dados.catalogo || !dados.pedidos) return alert('Arquivo inválido: estrutura não reconhecida.');
            const dataExp = dados.exportado_em ? new Date(dados.exportado_em).toLocaleDateString('pt-BR') : 'desconhecida';
            if (!confirm(`Importar backup de ${dataExp}?\n\nTodos os dados atuais serão substituídos. Esta ação não pode ser desfeita.`)) return;
            db.clientes   = dados.clientes   || [];
            db.catalogo   = dados.catalogo   || [];
            db.pedidos    = dados.pedidos    || [];
            db.estoque    = dados.estoque    || [];
            db.materiais  = dados.materiais  || [];
            db.kits       = dados.kits       || [];
            db.movimentos = dados.movimentos || [];
            db.vendedores    = dados.vendedores    || [];
            db.fornecedores  = dados.fornecedores  || [];
            db.pedidos_compra = dados.pedidos_compra || [];
            syncDB();
            toastReload('Dados importados com sucesso!', 'info');
            window.location.reload();
        } catch { alert('Erro ao ler o arquivo. Certifique-se que é um backup válido do SCTech.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- RELATÓRIOS ---
function renderRelatorios() {
    renderRelFaturamento();
    renderRelRecebiveis();
    renderRelVendedores();
}
function renderRelFaturamento() {
    const tb = document.getElementById('tb-rel-fat');
    if (!tb) return;
    const meses = [];
    const agora = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
        meses.push({ mes: d.getMonth(), ano: d.getFullYear(), label: d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }) });
    }
    tb.innerHTML = meses.map(m => {
        const pedsMes = db.pedidos.filter(p => {
            if (normalizarStatus(p.status) !== 'Instalado') return false;
            const d = new Date(p.data_instalado || p.id);
            return d.getMonth() === m.mes && d.getFullYear() === m.ano;
        });
        const total   = pedsMes.reduce((s, p) => s + (p.valor || 0), 0);
        const ticket  = pedsMes.length ? total / pedsMes.length : 0;
        const recebido = pedsMes.reduce((s, p) => s + (p.valor_recebido || 0), 0);
        return `<tr>
            <td style="text-transform:capitalize">${m.label}</td>
            <td style="text-align:center">${pedsMes.length}</td>
            <td>R$ ${total.toFixed(2)}</td>
            <td>R$ ${recebido.toFixed(2)}</td>
            <td>R$ ${ticket.toFixed(2)}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">Nenhum dado.</td></tr>';
}
function renderRelRecebiveis() {
    const tb = document.getElementById('tb-rel-rec');
    if (!tb) return;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const pendentes = db.pedidos.filter(p => {
        const saldo = (p.valor || 0) - (p.valor_recebido || 0);
        return saldo > 0.01 && normalizarStatus(p.status) !== 'Orçamento';
    }).map(p => {
        const cli   = db.clientes.find(c => c.id == p.clienteId);
        const saldo = (p.valor || 0) - (p.valor_recebido || 0);
        const dias  = Math.floor((hoje - new Date(p.id)) / (1000 * 60 * 60 * 24));
        return { ...p, _cli: cli?.nome || '—', _saldo: saldo, _dias: dias };
    }).sort((a, b) => b._dias - a._dias);
    if (!pendentes.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#599;padding:20px">Nenhum valor pendente.</td></tr>';
        return;
    }
    tb.innerHTML = pendentes.map(p => {
        const faixa = p._dias > 90 ? '<span class="badge-pendente">+90 dias</span>'
            : p._dias > 60 ? '<span class="badge-parcial">61–90 dias</span>'
            : p._dias > 30 ? '<span style="background:#fef3c7;color:#92400e;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:10px">31–60 dias</span>'
            : '<span style="background:#eff6ff;color:#1e40af;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:10px">≤30 dias</span>';
        const cls = COR_STATUS[normalizarStatus(p.status)] || 'st-orcamento';
        return `<tr>
            <td style="font-size:12px">#${String(p.id).slice(-6)}</td>
            <td>${escapeHtml(p._cli)}</td>
            <td>R$ ${(p.valor||0).toFixed(2)}</td>
            <td style="color:#dc2626;font-weight:bold">R$ ${p._saldo.toFixed(2)}</td>
            <td><span class="status-tag ${cls}" style="font-size:11px">${normalizarStatus(p.status)}</span></td>
            <td>${faixa}</td>
        </tr>`;
    }).join('');
    const totalPendente = pendentes.reduce((s, p) => s + p._saldo, 0);
    const tfootEl = document.getElementById('tfoot-rel-rec');
    if (tfootEl) tfootEl.innerHTML = `<tr><td colspan="3" style="text-align:right;font-weight:bold;color:#555">Total a receber:</td><td style="font-weight:bold;color:#dc2626">R$ ${totalPendente.toFixed(2)}</td><td colspan="2"></td></tr>`;
}
function renderRelVendedores() {
    const tb = document.getElementById('tb-rel-vend');
    if (!tb) return;
    const map = {};
    db.pedidos.forEach(p => {
        const v = p.vendedor_nome || p.vendedor || '(sem vendedor)';
        if (!map[v]) map[v] = { qtd: 0, total: 0, instalados: 0, fat: 0 };
        map[v].qtd++;
        map[v].total += (p.valor || 0);
        if (normalizarStatus(p.status) === 'Instalado') { map[v].instalados++; map[v].fat += (p.valor || 0); }
    });
    const lista = Object.entries(map).sort((a, b) => b[1].fat - a[1].fat);
    tb.innerHTML = lista.map(([v, d]) => `<tr>
        <td><strong>${escapeHtml(v)}</strong></td>
        <td style="text-align:center">${d.qtd}</td>
        <td style="text-align:center">${d.instalados}</td>
        <td>R$ ${d.total.toFixed(2)}</td>
        <td style="color:#059669;font-weight:bold">R$ ${d.fat.toFixed(2)}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">Nenhum dado.</td></tr>';
}
function mostrarTabRel(tab) {
    document.querySelectorAll('#tab-rel-faturamento,#tab-rel-recebiveis,#tab-rel-vendedores').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[data-tab]').forEach(btn => { if (['faturamento','recebiveis','vendedores'].includes(btn.dataset.tab)) btn.classList.remove('active'); });
    document.getElementById(`tab-rel-${tab}`)?.classList.add('active');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    if (tab === 'faturamento') renderRelFaturamento();
    if (tab === 'recebiveis')  renderRelRecebiveis();
    if (tab === 'vendedores')  renderRelVendedores();
}

// --- VENDEDORES ---
function salvarVendedor() {
    const nome = document.getElementById('vend-nome')?.value.trim();
    if (!nome) return alert('Informe o nome do vendedor.');
    const comissao_pct = parseFloat(document.getElementById('vend-comissao')?.value) || 0;
    const tel = document.getElementById('vend-tel')?.value.trim() || '';
    if (editandoIdVendedor) {
        const idx = db.vendedores.findIndex(v => v.id == editandoIdVendedor);
        if (idx !== -1) db.vendedores[idx] = { ...db.vendedores[idx], nome, comissao_pct, tel };
        cancelarEdicaoVendedor();
        salvarERecarregar('Vendedor atualizado!');
    } else {
        const dup = db.vendedores.find(v => v.nome.trim().toLowerCase() === nome.toLowerCase());
        if (dup) return alert(`Já existe um vendedor com o nome "${dup.nome}".`);
        db.vendedores.push({ id: Date.now(), nome, comissao_pct, tel });
        salvarERecarregar('Vendedor cadastrado!');
    }
}

function editarVendedor(id) {
    const v = db.vendedores.find(x => x.id == id);
    if (!v) return;
    editandoIdVendedor = id;
    document.getElementById('vend-nome').value      = v.nome || '';
    document.getElementById('vend-comissao').value  = v.comissao_pct || 0;
    document.getElementById('vend-tel').value       = v.tel || '';
    const tit = document.getElementById('vend-form-titulo');
    const btn = document.getElementById('vend-btn-salvar');
    const cnc = document.getElementById('vend-btn-cancelar');
    if (tit) tit.textContent = 'Editar Vendedor';
    if (btn) btn.textContent = 'Salvar Alterações';
    if (cnc) cnc.style.display = 'inline-block';
    document.getElementById('vend-nome').focus();
    document.querySelector('.card')?.scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoVendedor() {
    editandoIdVendedor = null;
    ['vend-nome','vend-tel'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const comEl = document.getElementById('vend-comissao');
    if (comEl) comEl.value = '0';
    const tit = document.getElementById('vend-form-titulo');
    const btn = document.getElementById('vend-btn-salvar');
    const cnc = document.getElementById('vend-btn-cancelar');
    if (tit) tit.textContent = 'Cadastrar Vendedor';
    if (btn) btn.textContent = 'Salvar Vendedor';
    if (cnc) cnc.style.display = 'none';
}

function excluirVendedor(id) {
    const v = db.vendedores.find(x => x.id == id);
    if (!v) return;
    const usados = db.pedidos.filter(p => p.vendedor_id == id);
    if (usados.length) return alert(`Não é possível excluir: ${escapeHtml(v.nome)} está associado a ${usados.length} pedido(s).`);
    if (!confirm(`Excluir o vendedor "${v.nome}"?`)) return;
    db.vendedores = db.vendedores.filter(x => x.id != id);
    salvarERecarregar('Vendedor excluído.');
}

function renderTabelaVendedores() {
    const tb = document.getElementById('tb-vendedores');
    if (!tb) return;
    if (!db.vendedores.length) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Nenhum vendedor cadastrado.</td></tr>';
        return;
    }
    tb.innerHTML = db.vendedores.map(v => {
        const pedidos        = db.pedidos.filter(p => p.vendedor_id == v.id);
        const totalComissoes = pedidos.reduce((s, p) => s + (p.comissao_valor || 0), 0);
        const comissoesPagas = pedidos.filter(p => p.comissao_paga).reduce((s, p) => s + (p.comissao_valor || 0), 0);
        const pendente       = totalComissoes - comissoesPagas;
        return `<tr>
            <td><strong>${escapeHtml(v.nome)}</strong></td>
            <td style="text-align:center">${v.comissao_pct || 0}%</td>
            <td>${escapeHtml(v.tel || '—')}</td>
            <td style="text-align:center">${pedidos.length}</td>
            <td>
                ${pendente > 0.01 ? `<span class="badge-comissao-pendente">R$ ${pendente.toFixed(2)} pendente</span>` : '<span class="badge-comissao-paga">Em dia</span>'}
                <button class="btn btn-outline btn-sm" onclick="editarVendedor(${v.id})" style="margin-left:6px" title="Editar vendedor">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirVendedor(${v.id})" title="Excluir vendedor">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function renderComissoesPendentes() {
    const tb = document.getElementById('tb-comissoes-pendentes');
    if (!tb) return;
    const filtroVend = document.getElementById('filtro-vend-pendente')?.value || '';
    let pedidos = db.pedidos.filter(p => p.vendedor_id && (p.comissao_valor || 0) > 0 && !p.comissao_paga && normalizarStatus(p.status) === 'Instalado');
    if (filtroVend) pedidos = pedidos.filter(p => p.vendedor_id == filtroVend);
    pedidos.sort((a, b) => (b.data_instalado || b.id) - (a.data_instalado || a.id));
    const totalEl = document.getElementById('total-comissoes-pendentes');
    if (!pedidos.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Nenhuma comissão pendente.</td></tr>';
        if (totalEl) totalEl.textContent = 'R$ 0,00';
        return;
    }
    tb.innerHTML = pedidos.map(p => {
        const v = db.vendedores.find(x => x.id == p.vendedor_id);
        return `<tr>
            <td style="font-size:12px">#${String(p.id).slice(-6)}</td>
            <td>${escapeHtml(p.clienteNome || '—')}</td>
            <td>${escapeHtml(v?.nome || p.vendedor_nome || '—')}</td>
            <td>R$ ${(p.valor || 0).toFixed(2)}</td>
            <td><strong>R$ ${(p.comissao_valor || 0).toFixed(2)}</strong> <span style="color:#888;font-size:12px">(${p.comissao_pct || 0}%)</span></td>
            <td><button class="btn btn-sm btn-success" onclick="pagarComissao(${p.id})">✓ Pagar</button></td>
        </tr>`;
    }).join('');
    const total = pedidos.reduce((s, p) => s + (p.comissao_valor || 0), 0);
    if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2)}`;
}

function renderHistoricoComissoes() {
    const tb = document.getElementById('tb-hist-comissoes');
    if (!tb) return;
    const filtroVend = document.getElementById('filtro-vend-hist')?.value || '';
    let pedidos = db.pedidos.filter(p => p.vendedor_id && (p.comissao_valor || 0) > 0 && p.comissao_paga);
    if (filtroVend) pedidos = pedidos.filter(p => p.vendedor_id == filtroVend);
    pedidos.sort((a, b) => (b.comissao_data_pgto || 0) - (a.comissao_data_pgto || 0));
    if (!pedidos.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Nenhum pagamento registrado.</td></tr>';
        return;
    }
    tb.innerHTML = pedidos.map(p => {
        const v       = db.vendedores.find(x => x.id == p.vendedor_id);
        const dataPgto = p.comissao_data_pgto ? new Date(p.comissao_data_pgto).toLocaleDateString('pt-BR') : '—';
        return `<tr>
            <td style="font-size:12px;white-space:nowrap">${dataPgto}</td>
            <td style="font-size:12px">#${String(p.id).slice(-6)}</td>
            <td>${escapeHtml(p.clienteNome || '—')}</td>
            <td>${escapeHtml(v?.nome || p.vendedor_nome || '—')}</td>
            <td>R$ ${(p.valor || 0).toFixed(2)}</td>
            <td><span class="badge-comissao-paga">R$ ${(p.comissao_valor || 0).toFixed(2)} pago</span></td>
        </tr>`;
    }).join('');
}

function pagarComissao(pedidoId) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped) return;
    const v = db.vendedores.find(x => x.id == ped.vendedor_id);
    if (!confirm(`Registrar pagamento de comissão R$ ${(ped.comissao_valor||0).toFixed(2)} para ${v?.nome || ped.vendedor_nome || 'vendedor'}?`)) return;
    ped.comissao_paga       = true;
    ped.comissao_data_pgto  = Date.now();
    salvarERecarregar('Comissão paga!');
}

function pagarTodasFiltradas() {
    const filtroVend = document.getElementById('filtro-vend-pendente')?.value || '';
    let pedidos = db.pedidos.filter(p => p.vendedor_id && (p.comissao_valor || 0) > 0 && !p.comissao_paga && normalizarStatus(p.status) === 'Instalado');
    if (filtroVend) pedidos = pedidos.filter(p => p.vendedor_id == filtroVend);
    if (!pedidos.length) return alert('Nenhuma comissão pendente para pagar.');
    const total = pedidos.reduce((s, p) => s + (p.comissao_valor || 0), 0);
    if (!confirm(`Pagar ${pedidos.length} comissão(ões) no total de R$ ${total.toFixed(2)}?`)) return;
    const agora = Date.now();
    pedidos.forEach(p => { p.comissao_paga = true; p.comissao_data_pgto = agora; });
    salvarERecarregar('Comissões pagas!');
}

function mostrarTabVendedores(tab) {
    document.querySelectorAll('#tab-vend-lista,#tab-vend-pendentes,#tab-vend-historico').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.vend-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-vend-' + tab)?.classList.add('active');
    document.querySelector(`.vend-tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    if (tab === 'lista')     renderTabelaVendedores();
    if (tab === 'pendentes') renderComissoesPendentes();
    if (tab === 'historico') renderHistoricoComissoes();
}

// --- FORNECEDORES ---
function salvarFornecedor() {
    const nome  = document.getElementById('forn-nome')?.value.trim();
    if (!nome) return alert('Informe o nome do fornecedor.');
    const cnpj  = document.getElementById('forn-cnpj')?.value.trim()  || '';
    const tel   = document.getElementById('forn-tel')?.value.trim()   || '';
    const email = document.getElementById('forn-email')?.value.trim() || '';
    const end   = document.getElementById('forn-end')?.value.trim()   || '';
    const obs   = document.getElementById('forn-obs')?.value.trim()   || '';
    if (cnpj) {
        const cnpjNorm = cnpj.replace(/\D/g, '');
        const dupCnpj  = db.fornecedores.find(f => f.cnpj && f.cnpj.replace(/\D/g,'') === cnpjNorm && f.id != editandoIdFornecedor);
        if (dupCnpj) return alert(`CNPJ já cadastrado.\nFornecedor existente: ${dupCnpj.nome}`);
    }
    const dupNome = db.fornecedores.find(f => f.nome.trim().toLowerCase() === nome.toLowerCase() && f.id != editandoIdFornecedor);
    if (dupNome) return alert(`Já existe um fornecedor com o nome "${dupNome.nome}".`);
    if (editandoIdFornecedor) {
        const idx = db.fornecedores.findIndex(f => f.id == editandoIdFornecedor);
        if (idx !== -1) db.fornecedores[idx] = { ...db.fornecedores[idx], nome, cnpj, tel, email, end, obs };
        cancelarEdicaoFornecedor();
        salvarERecarregar('Fornecedor atualizado!');
    } else {
        db.fornecedores.push({ id: Date.now(), nome, cnpj, tel, email, end, obs });
        salvarERecarregar('Fornecedor cadastrado!');
    }
}

function editarFornecedor(id) {
    const f = db.fornecedores.find(x => x.id == id);
    if (!f) return;
    editandoIdFornecedor = id;
    document.getElementById('forn-nome').value  = f.nome  || '';
    document.getElementById('forn-cnpj').value  = f.cnpj  || '';
    document.getElementById('forn-tel').value   = f.tel   || '';
    document.getElementById('forn-email').value = f.email || '';
    document.getElementById('forn-end').value   = f.end   || '';
    document.getElementById('forn-obs').value   = f.obs   || '';
    const tit = document.getElementById('forn-form-titulo');
    const btn = document.getElementById('forn-btn-salvar');
    const cnc = document.getElementById('forn-btn-cancelar');
    if (tit) tit.textContent = 'Editar Fornecedor';
    if (btn) btn.textContent = 'Salvar Alterações';
    if (cnc) cnc.style.display = 'inline-block';
    document.getElementById('forn-nome').focus();
    document.querySelector('.card')?.scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoFornecedor() {
    editandoIdFornecedor = null;
    ['forn-nome','forn-cnpj','forn-tel','forn-email','forn-end','forn-obs'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const tit = document.getElementById('forn-form-titulo');
    const btn = document.getElementById('forn-btn-salvar');
    const cnc = document.getElementById('forn-btn-cancelar');
    if (tit) tit.textContent = 'Cadastrar Fornecedor';
    if (btn) btn.textContent = 'Salvar Fornecedor';
    if (cnc) cnc.style.display = 'none';
}

function excluirFornecedor(id) {
    const f = db.fornecedores.find(x => x.id == id);
    if (!f) return;
    const matUsando = db.materiais.filter(m => m.fornecedor_id == id);
    const catUsando = db.catalogo.filter(c => c.fornecedor_id == id);
    if (matUsando.length || catUsando.length)
        return alert(`Não é possível excluir: ${escapeHtml(f.nome)} está vinculado a ${matUsando.length} material(is) e ${catUsando.length} tecido(s).`);
    if (!confirm(`Excluir o fornecedor "${f.nome}"?`)) return;
    db.fornecedores = db.fornecedores.filter(x => x.id != id);
    salvarERecarregar('Fornecedor excluído.');
}

function renderTabelaFornecedores() {
    const tb = document.getElementById('tb-fornecedores');
    if (!tb) return;
    if (!db.fornecedores.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Nenhum fornecedor cadastrado.</td></tr>';
        return;
    }
    tb.innerHTML = db.fornecedores.map(f => {
        const nMat = db.materiais.filter(m => m.fornecedor_id == f.id).length;
        const nCat = db.catalogo.filter(c => c.fornecedor_id == f.id).length;
        const vinc = [nMat > 0 ? `${nMat} mat.` : '', nCat > 0 ? `${nCat} tec.` : ''].filter(Boolean).join(' · ') || '—';
        return `<tr>
            <td><strong>${escapeHtml(f.nome)}</strong>${f.obs ? `<br><small style="color:#888;font-size:12px">${escapeHtml(f.obs)}</small>` : ''}</td>
            <td style="font-size:13px">${escapeHtml(f.cnpj || '—')}</td>
            <td style="font-size:13px">${escapeHtml(f.tel || '—')}</td>
            <td style="font-size:13px">${escapeHtml(f.email || '—')}</td>
            <td style="font-size:12px;color:#555">${vinc}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="criarPCParaFornecedor(${f.id})" title="Novo pedido de compra">🛒</button>
                <button class="btn btn-outline btn-sm" onclick="editarFornecedor(${f.id})" title="Editar fornecedor">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirFornecedor(${f.id})" title="Excluir fornecedor">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// --- PEDIDOS DE COMPRA ---
function adicionarItemPC() {
    const tipo   = document.getElementById('pc-item-tipo')?.value || 'material';
    const itemId = parseInt(document.getElementById('pc-item-id')?.value);
    const qtd    = parseFloat(document.getElementById('pc-item-qtd')?.value) || 1;
    if (!itemId) return alert('Selecione o item.');
    if (qtd <= 0) return alert('Informe uma quantidade válida.');
    let item_nome, unidade, preco_unit;
    if (tipo === 'material') {
        const m = db.materiais.find(x => x.id === itemId);
        if (!m) return;
        item_nome = m.nome; unidade = m.unidade; preco_unit = m.preco || 0;
    } else {
        const c = db.catalogo.find(x => x.id === itemId);
        if (!c) return;
        item_nome = c.nome; unidade = 'm'; preco_unit = c.preco || 0;
    }
    const existing = pcDraftItens.find(i => i.tipo === tipo && i.item_id === itemId);
    if (existing) { existing.quantidade += qtd; existing.subtotal = existing.quantidade * existing.preco_unit; }
    else { pcDraftItens.push({ tipo, item_id: itemId, item_nome, unidade, quantidade: qtd, preco_unit, subtotal: qtd * preco_unit }); }
    renderItensPCDraft();
}

function removerItemPC(idx) {
    pcDraftItens.splice(idx, 1);
    renderItensPCDraft();
}

function atualizarQtdPC(idx, val) {
    const qtd = parseFloat(val) || 0;
    if (qtd <= 0) return;
    pcDraftItens[idx].quantidade = qtd;
    pcDraftItens[idx].subtotal   = qtd * pcDraftItens[idx].preco_unit;
    renderItensPCDraft();
}

function renderItensPCDraft() {
    const tb = document.getElementById('tb-pc-draft');
    if (!tb) return;
    if (!pcDraftItens.length) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:12px;font-size:13px">Nenhum item adicionado.</td></tr>';
        return;
    }
    const total = pcDraftItens.reduce((s, i) => s + i.subtotal, 0);
    tb.innerHTML = pcDraftItens.map((i, idx) => `<tr>
        <td>${escapeHtml(i.item_nome)} <span style="font-size:11px;color:#888">(${i.tipo === 'tecido' ? 'Tecido' : 'Material'})</span></td>
        <td><input type="number" value="${i.quantidade}" step="0.01" min="0.01" style="width:80px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:13px" onchange="atualizarQtdPC(${idx},this.value)"></td>
        <td>${i.unidade}</td>
        <td>R$ ${i.subtotal.toFixed(2)}</td>
        <td><button class="btn btn-outline btn-sm btn-danger" onclick="removerItemPC(${idx})">✕</button></td>
    </tr>`).join('') + `<tr style="background:#f8fafc"><td colspan="3" style="text-align:right;font-weight:bold;color:#555;padding:10px 12px">Total estimado:</td><td style="font-weight:bold;padding:10px 12px">R$ ${total.toFixed(2)}</td><td></td></tr>`;
}

function atualizarSelectItemPC() {
    const tipo = document.getElementById('pc-item-tipo')?.value || 'material';
    const sel  = document.getElementById('pc-item-id');
    if (!sel) return;
    if (tipo === 'material') {
        sel.innerHTML = '<option value="">— Selecione o material —</option>' +
            db.materiais.map(m => `<option value="${m.id}">${m.nome} (${m.unidade})</option>`).join('');
    } else {
        sel.innerHTML = '<option value="">— Selecione o tecido —</option>' +
            db.catalogo.map(c => `<option value="${c.id}">${c.nome} — R$ ${c.preco.toFixed(2)}/m</option>`).join('');
    }
}

function salvarPedidoCompra() {
    const fornId = parseInt(document.getElementById('pc-fornecedor')?.value);
    if (!fornId) return alert('Selecione o fornecedor.');
    if (!pcDraftItens.length) return alert('Adicione pelo menos um item ao pedido.');
    const forn = db.fornecedores.find(f => f.id === fornId);
    db.pedidos_compra.push({
        id:              Date.now(),
        fornecedor_id:   fornId,
        fornecedor_nome: forn ? forn.nome : '',
        data_criacao:    Date.now(),
        status:          'Rascunho',
        itens:           pcDraftItens.map(i => ({ ...i })),
        observacoes:     document.getElementById('pc-obs')?.value.trim() || ''
    });
    pcDraftItens = [];
    salvarERecarregar('Pedido de compra criado!');
}

function renderListaPedidosCompra() {
    const tb = document.getElementById('tb-pedidos-compra');
    if (!tb) return;
    const filtroForn   = document.getElementById('filtro-pc-forn')?.value   || '';
    const filtroStatus = document.getElementById('filtro-pc-status')?.value || '';
    let lista = [...db.pedidos_compra].sort((a, b) => b.data_criacao - a.data_criacao);
    if (filtroForn)   lista = lista.filter(p => p.fornecedor_id == filtroForn);
    if (filtroStatus) lista = lista.filter(p => p.status === filtroStatus);
    if (!lista.length) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:20px;">Nenhum pedido de compra encontrado.</td></tr>';
        return;
    }
    const COR_PC = { 'Rascunho': 'st-orcamento', 'Enviado': 'st-costura', 'Recebido': 'st-faturado' };
    tb.innerHTML = lista.map(p => {
        const data  = new Date(p.data_criacao).toLocaleDateString('pt-BR');
        const total = p.itens.reduce((s, i) => s + i.subtotal, 0);
        const cls   = COR_PC[p.status] || 'st-orcamento';
        return `<tr>
            <td style="font-size:12px">#${String(p.id).slice(-6)}</td>
            <td><strong>${escapeHtml(p.fornecedor_nome)}</strong></td>
            <td style="font-size:12px;color:#6b7280;white-space:nowrap">${data}</td>
            <td style="text-align:center">${p.itens.length}</td>
            <td>R$ ${total.toFixed(2)}</td>
            <td><span class="status-tag ${cls}">${p.status}</span></td>
            <td>
                <select onchange="atualizarStatusPC(${p.id},this.value)" style="padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;margin-right:4px">
                    <option${p.status==='Rascunho'?' selected':''}>Rascunho</option>
                    <option${p.status==='Enviado'?' selected':''}>Enviado</option>
                    <option${p.status==='Recebido'?' selected':''}>Recebido</option>
                </select>
                <button class="btn btn-outline btn-sm" onclick="abrirPedidoCompra(${p.id})" title="Visualizar / PDF">📄</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirPedidoCompra(${p.id})">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function atualizarStatusPC(id, status) {
    const pc = db.pedidos_compra.find(p => p.id == id);
    if (!pc) return;
    pc.status = status;
    syncDB();
    toast('Status atualizado!', 'success', 1500);
    renderListaPedidosCompra();
}

function excluirPedidoCompra(id) {
    if (!confirm('Excluir este pedido de compra?')) return;
    db.pedidos_compra = db.pedidos_compra.filter(p => p.id != id);
    salvarERecarregar('Pedido excluído.');
}

function abrirPedidoCompra(id) {
    localStorage.setItem('sc_pc_id', id);
    window.open('pedido-compra.html', '_blank');
}

function criarPCParaFornecedor(fornId) {
    localStorage.setItem('sc_pc_prefill_forn', fornId);
    mostrarTabFornecedores('novo');
    const pcFornSel = document.getElementById('pc-fornecedor');
    if (pcFornSel) pcFornSel.value = fornId;
}

function pedirMaterial(materialId) {
    const m = db.materiais.find(x => x.id === materialId);
    if (!m) return;
    localStorage.setItem('sc_pc_prefill', JSON.stringify({ tipo: 'material', item_id: materialId, item_nome: m.nome, unidade: m.unidade, preco_unit: m.preco || 0 }));
    window.location.href = 'fornecedores.html?tab=novo';
}

function pedirTecido(tecidoId) {
    const c = db.catalogo.find(x => x.id === tecidoId);
    if (!c) return;
    localStorage.setItem('sc_pc_prefill', JSON.stringify({ tipo: 'tecido', item_id: tecidoId, item_nome: c.nome, unidade: 'm', preco_unit: c.preco || 0 }));
    window.location.href = 'fornecedores.html?tab=novo';
}

function mostrarTabFornecedores(tab) {
    document.querySelectorAll('#tab-forn-lista,#tab-forn-pedidos,#tab-forn-novo').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.forn-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-forn-' + tab)?.classList.add('active');
    document.querySelector(`.forn-tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    if (tab === 'lista')   renderTabelaFornecedores();
    if (tab === 'pedidos') renderListaPedidosCompra();
    if (tab === 'novo')    atualizarSelectItemPC();
}

// --- PEDIDO DE COMPRA (documento imprimível) ---
function renderPedidoCompraDoc() {
    const id  = localStorage.getItem('sc_pc_id');
    const pc  = db.pedidos_compra.find(p => p.id == id);
    const container = document.getElementById('pedido-compra-container');
    if (!container) return;
    if (!pc) { container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">Pedido não encontrado.</p>'; return; }
    const forn  = db.fornecedores.find(f => f.id == pc.fornecedor_id);
    const hoje  = new Date().toLocaleDateString('pt-BR');
    const total = pc.itens.reduce((s, i) => s + i.subtotal, 0);
    const linhas = pc.itens.map(i => `<tr>
        <td>${escapeHtml(i.item_nome)}</td>
        <td style="text-align:center">${i.tipo === 'tecido' ? 'Tecido' : 'Material'}</td>
        <td style="text-align:right">${i.quantidade}</td>
        <td>${i.unidade}</td>
        <td style="text-align:right">R$ ${i.preco_unit.toFixed(2)}</td>
        <td style="text-align:right"><strong>R$ ${i.subtotal.toFixed(2)}</strong></td>
    </tr>`).join('');
    container.innerHTML = `
        <div class="pc-header">
            <div style="display:flex;align-items:center;gap:10px">
                <div class="logo-box" style="display:inline-flex;font-size:14px;width:40px;height:40px">SC</div>
                <div><strong style="font-size:18px;color:var(--primary)">SCTech</strong><div style="font-size:12px;color:#888">Sistema de Gestão</div></div>
            </div>
            <div style="text-align:right">
                <div style="font-size:20px;font-weight:bold;color:var(--dark)">PEDIDO DE COMPRA</div>
                <div style="font-size:13px;color:#888">Nº ${String(pc.id).slice(-6)} · Emitido em ${hoje}</div>
                <div style="margin-top:4px"><span class="status-tag ${pc.status==='Recebido'?'st-faturado':pc.status==='Enviado'?'st-costura':'st-orcamento'}">${pc.status}</span></div>
            </div>
        </div>
        <div class="pc-section">
            <div class="pc-section-title">Fornecedor</div>
            <table class="pc-table">
                <tr><td class="pc-th">Razão Social / Nome</td><td><strong>${forn ? escapeHtml(forn.nome) : escapeHtml(pc.fornecedor_nome)}</strong></td><td class="pc-th" style="width:100px">CNPJ</td><td>${forn ? escapeHtml(forn.cnpj || '—') : '—'}</td></tr>
                <tr><td class="pc-th">Telefone</td><td>${forn ? escapeHtml(forn.tel || '—') : '—'}</td><td class="pc-th">E-mail</td><td>${forn ? escapeHtml(forn.email || '—') : '—'}</td></tr>
                ${forn?.end ? `<tr><td class="pc-th">Endereço</td><td colspan="3">${escapeHtml(forn.end)}</td></tr>` : ''}
            </table>
        </div>
        <div class="pc-section">
            <div class="pc-section-title">Itens Solicitados</div>
            <table class="pc-table">
                <thead><tr><th>Descrição</th><th style="text-align:center">Tipo</th><th style="text-align:right;width:80px">Qtd</th><th style="width:50px">Un.</th><th style="text-align:right;width:100px">R$/Un.</th><th style="text-align:right;width:110px">Subtotal</th></tr></thead>
                <tbody>${linhas}</tbody>
                <tfoot><tr style="background:#f8fafc"><td colspan="5" style="text-align:right;font-weight:bold;padding:10px 8px;color:#374151">Total Estimado:</td><td style="text-align:right;font-weight:bold;padding:10px 8px">R$ ${total.toFixed(2)}</td></tr></tfoot>
            </table>
        </div>
        ${pc.observacoes ? `<div class="pc-section"><div class="pc-section-title">Observações</div><div style="padding:10px 14px;border:1px solid #e4e7eb;border-radius:4px;font-size:14px;min-height:50px">${escapeHtml(pc.observacoes)}</div></div>` : ''}
        <div class="pc-assinaturas">
            <div><div class="pc-section-title">Solicitado por</div><div class="pc-linha"></div><small>Nome / Data</small></div>
            <div><div class="pc-section-title">Aprovado por</div><div class="pc-linha"></div><small>Nome / Data</small></div>
            <div><div class="pc-section-title">Recebido por</div><div class="pc-linha"></div><small>Nome / Assinatura / Data</small></div>
        </div>`;
    setTimeout(() => window.print(), 500);
}

// --- AGENDA DE INSTALAÇÕES ---
function renderAgenda() {
    const container = document.getElementById('agenda-container');
    if (!container) return;
    const statuses = ['Pronto p/ Instalação', 'Aguardando Pagamento'];
    const pedidos  = db.pedidos
        .filter(p => statuses.includes(normalizarStatus(p.status)))
        .sort((a, b) => {
            const da = a.data_entrega || '9999-12-31';
            const db2 = b.data_entrega || '9999-12-31';
            return da < db2 ? -1 : da > db2 ? 1 : 0;
        });
    if (!pedidos.length) {
        container.innerHTML = '<div class="card" style="text-align:center;color:#999;padding:40px">Nenhum pedido aguardando instalação.</div>';
        return;
    }
    const hoje  = new Date(); hoje.setHours(0,0,0,0);
    const grupos = {};
    pedidos.forEach(p => {
        let grupo;
        if (!p.data_entrega) {
            grupo = 'Sem data definida';
        } else {
            const d    = new Date(p.data_entrega + 'T00:00:00');
            const diff = Math.round((d - hoje) / (1000*60*60*24));
            if (diff < 0)      grupo = '⚠ Atrasado';
            else if (diff <= 7) grupo = '📅 Esta semana';
            else if (diff <= 14) grupo = '📆 Próxima semana';
            else               grupo = '🗓 Futuro';
        }
        if (!grupos[grupo]) grupos[grupo] = [];
        grupos[grupo].push(p);
    });
    const ordemGrupos = ['⚠ Atrasado', '📅 Esta semana', '📆 Próxima semana', '🗓 Futuro', 'Sem data definida'];
    container.innerHTML = ordemGrupos.filter(g => grupos[g]).map(g => {
        const cards = grupos[g].map(p => {
            const cli     = db.clientes.find(c => c.id == p.clienteId);
            const pagto   = statusPagamento(p);
            const entrega = p.data_entrega ? new Date(p.data_entrega+'T12:00:00').toLocaleDateString('pt-BR') : '—';
            const cls     = COR_STATUS[normalizarStatus(p.status)] || '';
            return `<div class="card" style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
                    <div>
                        <span style="font-size:11px;color:#888">Pedido #${String(p.id).slice(-6)}</span>
                        <div style="font-weight:bold;font-size:15px;margin:2px 0">${escapeHtml(p.clienteNome||'—')}</div>
                        <div style="font-size:13px;color:#555">${escapeHtml(p.amb||'—')}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-weight:bold">R$ ${(p.valor||0).toFixed(2)}</div>
                        ${pagto.cls ? `<span class="${pagto.cls}">${pagto.label}</span>` : ''}
                        <div style="font-size:12px;color:#6b7280;margin-top:4px">Entrega: ${entrega}</div>
                    </div>
                </div>
                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <span class="status-tag ${cls}" style="font-size:11px">${normalizarStatus(p.status)}</span>
                    ${cli?.tel ? `<a href="https://wa.me/55${cli.tel.replace(/\D/g,'')}" target="_blank" class="btn btn-outline btn-sm" style="font-size:11px">📱 WhatsApp</a>` : ''}
                    <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})">📋 OS</button>
                </div>
            </div>`;
        }).join('');
        return `<div style="margin-bottom:20px"><h3 style="font-size:14px;font-weight:700;color:#374151;margin-bottom:12px;padding:6px 12px;background:#f3f4f6;border-radius:6px">${g} <span style="font-size:12px;color:#888;font-weight:normal">(${grupos[g].length})</span></h3>${cards}</div>`;
    }).join('');
}

// --- SIDEBAR COLLAPSE (PCP) ---
function toggleSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.toggle('sidebar-collapsed');
    const btn = document.getElementById('sidebar-toggle-btn');
    if (btn) {
        btn.title = isCollapsed ? 'Expandir sidebar' : 'Recolher sidebar';
        btn.textContent = isCollapsed ? '→' : '← Recolher';
    }
}

// --- PCP VIEW TOGGLE ---
function mostrarViewPCP(view) {
    document.getElementById('pcp-view-kanban').style.display = view === 'kanban' ? '' : 'none';
    document.getElementById('pcp-view-agenda').style.display = view === 'agenda' ? '' : 'none';
    document.getElementById('tab-btn-kanban').className = 'tab-btn' + (view==='kanban'?' active':'');
    document.getElementById('tab-btn-agenda').className = 'tab-btn' + (view==='agenda'?' active':'');
    if (view === 'agenda') renderAgenda();
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('login-usuario')) {
        checkAuth();
        const sidebarUserEl = document.getElementById('sidebar-user-name');
        if (sidebarUserEl) {
            const u = JSON.parse(sessionStorage.getItem('sc_user') || '{}');
            sidebarUserEl.textContent = u.nome || u.login || '—';
        }
    }

    // Pending toast from previous action
    const pt = sessionStorage.getItem('sc_pending_toast');
    if (pt) { try { const { msg, tipo } = JSON.parse(pt); sessionStorage.removeItem('sc_pending_toast'); setTimeout(() => toast(msg, tipo), 200); } catch {} }

    if (document.getElementById('tb-pedidos')) {
        localStorage.removeItem('sc_editando_id');
        renderDashboard();
    }

    if (document.getElementById('tb-catalogo')) {
        const catFornSel = document.getElementById('cat-fornecedor');
        if (catFornSel) catFornSel.innerHTML = '<option value="">— Sem fornecedor —</option>' +
            db.fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        const rows = db.catalogo.map(c => {
            const disp = estoqueDisponivel(c.id);
            const dispTxt = db.estoque.some(r=>r.tecido_id==c.id) ? `${disp.toFixed(2)} m` : '—';
            const alertMin = c.min_estoque>0&&disp<c.min_estoque ? `<span class="badge-alerta" style="margin-left:6px">⚠</span>` : '';
            return `<tr><td>${escapeHtml(c.nome)}</td><td style="font-size:12px;color:#555">${escapeHtml(c.referencia||'—')}</td><td>R$ ${c.preco.toFixed(2)}</td><td>${(c.largura_rolo||2.80).toFixed(2)} m</td><td>${c.min_estoque?c.min_estoque+' m':'—'}</td><td>${dispTxt}${alertMin}</td><td style="font-size:12px;color:#555">${escapeHtml(c.fornecedor_nome||'—')}</td><td>
                <button class="btn btn-outline btn-sm" onclick="pedirTecido(${c.id})" title="Criar pedido de compra">🛒</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirCatalogo(${c.id})" title="Remover do catálogo">Remover</button>
            </td></tr>`;
        }).join('');
        document.getElementById('tb-catalogo').innerHTML = rows || '<tr><td colspan="8" style="text-align:center;color:#999;padding:20px;">Catálogo vazio.</td></tr>';
    }

    if (document.getElementById('tb-clientes')) {
        renderTabelaClientes(db.clientes);
    }

    // Formulário de Pedido
    if (document.getElementById('ped-cliente')) {
        filtrarClientes();

        const vendSel = document.getElementById('ped-vendedor');
        if (vendSel) vendSel.innerHTML = '<option value="">— Sem vendedor —</option>' +
            db.vendedores.map(v => `<option value="${v.id}">${v.nome} (${v.comissao_pct || 0}%)</option>`).join('');

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
        const matFornSel = document.getElementById('mat-fornecedor');
        if (matFornSel) matFornSel.innerHTML = '<option value="">— Sem fornecedor —</option>' +
            db.fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
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
    if (document.getElementById('agenda-container'))   renderAgenda();
    if (document.getElementById('tb-rel-fat'))         renderRelatorios();

    if (document.getElementById('tb-vendedores')) {
        const filtros = ['filtro-vend-pendente', 'filtro-vend-hist'];
        filtros.forEach(fId => {
            const el = document.getElementById(fId);
            if (el) el.innerHTML = '<option value="">Todos os vendedores</option>' +
                db.vendedores.map(v => `<option value="${v.id}">${v.nome}</option>`).join('');
        });
        mostrarTabVendedores('lista');
    }

    if (document.getElementById('tb-fornecedores')) {
        const pcFornSel = document.getElementById('pc-fornecedor');
        if (pcFornSel) pcFornSel.innerHTML = '<option value="">— Selecione o fornecedor —</option>' +
            db.fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        const filtroFornEl = document.getElementById('filtro-pc-forn');
        if (filtroFornEl) filtroFornEl.innerHTML = '<option value="">Todos os fornecedores</option>' +
            db.fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        const urlTab = new URLSearchParams(window.location.search).get('tab');
        const prefillItem = localStorage.getItem('sc_pc_prefill');
        if (urlTab === 'novo' || prefillItem) {
            mostrarTabFornecedores('novo');
            if (prefillItem) {
                try {
                    const pi = JSON.parse(prefillItem);
                    pcDraftItens = [{ ...pi, quantidade: 1, subtotal: pi.preco_unit }];
                    renderItensPCDraft();
                    const tipoSel = document.getElementById('pc-item-tipo');
                    if (tipoSel) { tipoSel.value = pi.tipo; atualizarSelectItemPC(); }
                } catch {}
                localStorage.removeItem('sc_pc_prefill');
            }
            const prefillForn = localStorage.getItem('sc_pc_prefill_forn');
            if (prefillForn && pcFornSel) { pcFornSel.value = prefillForn; localStorage.removeItem('sc_pc_prefill_forn'); }
        } else {
            mostrarTabFornecedores('lista');
        }
    }

    if (document.getElementById('pedido-compra-container')) renderPedidoCompraDoc();
});
