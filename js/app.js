// --- CONTROLE DE ACESSO: módulos, ações restritas e papéis padrão ---
// (definidos antes de `db` porque o seed inicial de `papeis` usa papeisPadrao())
// Árvore de módulos do sistema. Cada módulo pode ter sub-abas; a permissão de
// uma sub-aba é opcional — quando não definida, ela herda o nível do módulo.
// A chave da sub-aba é sempre "modulo.sub".
const MODULOS_PERMISSAO = [
    { key: 'inicio',        label: 'Página Inicial',     subs: [] },
    { key: 'pedidos',       label: 'Pedidos',            subs: [] },
    { key: 'producao',      label: 'Produção',           subs: [
        { key: 'kanban',   label: 'Status dos pedidos' },
        { key: 'agenda',   label: 'Agenda de Instalações' },
        { key: 'medicoes', label: 'Agenda de Medições' },
    ]},
    { key: 'estoque',       label: 'Estoque',            subs: [
        { key: 'tecidos',   label: 'Tecidos' },
        { key: 'materiais', label: 'Materiais' },
        { key: 'kits',      label: 'Kits' },
        { key: 'historico', label: 'Histórico' },
        { key: 'consulta',  label: 'Consulta de Estoque' },
        { key: 'futuro',    label: 'Estoque Futuro' },
        { key: 'backup',    label: 'Backup' },
    ]},
    { key: 'clientes',      label: 'Clientes',           subs: [] },
    { key: 'catalogo',      label: 'Cadastro/Catálogo',  subs: [
        { key: 'tecidos',   label: 'Tecidos' },
        { key: 'materiais', label: 'Materiais e Acessórios' },
    ]},
    { key: 'vendedores',    label: 'Vendedores/Arquitetos', subs: [
        { key: 'lista',     label: 'Cadastro' },
        { key: 'pendentes', label: 'Comissões Pendentes' },
        { key: 'historico', label: 'Histórico de Pagamentos' },
    ]},
    { key: 'fornecedores',  label: 'Fornecedores',       subs: [
        { key: 'lista',   label: 'Fornecedores' },
        { key: 'pedidos', label: 'Pedidos de Compra' },
    ]},
    { key: 'financeiro',    label: 'Financeiro',         subs: [
        { key: 'dashboard', label: 'Visão Geral' },
        { key: 'receber',   label: 'A Receber' },
        { key: 'pagar',     label: 'A Pagar' },
        { key: 'fixas',     label: 'Despesas Fixas' },
        { key: 'dre',       label: 'DRE por Pedido' },
    ]},
    { key: 'relatorios',    label: 'Relatórios',         subs: [
        { key: 'faturamento', label: 'Faturamento Mensal' },
        { key: 'recebiveis',  label: 'Contas a Receber' },
        { key: 'vendedores',  label: 'Por Vendedor' },
    ]},
    { key: 'configuracoes', label: 'Configurações',      subs: [
        { key: 'usuarios', label: 'Usuários' },
        { key: 'papeis',   label: 'Papéis' },
        { key: 'empresa',  label: 'Configurar Empresa' },
    ]},
];

// Chaves antigas (modelo plano) → novas, para migrar papéis/usuários já salvos.
const MAPA_MODULOS_LEGADO = {
    visao_geral:    'financeiro.dashboard',
    a_receber:      'financeiro.receber',
    a_pagar:        'financeiro.pagar',
    despesas_fixas: 'financeiro.fixas',
    dre_pedido:     'financeiro.dre',
};

// Ações liberadas individualmente (independente do nível), para papéis que só
// podem executar uma ação bem específica dentro de um módulo (ex.: Produção só
// muda a fase do pedido; Instalação só marca como instalado).
const ACOES_RESTRITAS_POR_MODULO = {
    pedidos: [
        { id: 'mudar_status',     label: 'Atualizar fase/status do pedido' },
        { id: 'marcar_instalado', label: 'Marcar pedido como instalado/concluído' },
    ],
};

const NIVEL_ORDEM = { sem_acesso: 0, visualizar: 1, completo: 2 };

function permTodos(nivel) {
    const o = {};
    MODULOS_PERMISSAO.forEach(m => { o[m.key] = { nivel, acoes_restritas: [] }; });
    return o;
}

// Define o módulo inteiro num nível e, opcionalmente, sub-abas em níveis diferentes.
function permModulo(nivel, subs) {
    const o = { nivel, acoes_restritas: [] };
    return { o, subs: subs || {} };
}

function papeisPadrao() {
    const base = nivel => permTodos(nivel);
    const comSubs = (perms, mapa) => {
        Object.entries(mapa).forEach(([k, v]) => { perms[k] = typeof v === 'string' ? { nivel: v, acoes_restritas: [] } : v; });
        return perms;
    };
    return [
        { id: 1, nome: 'Administrador', permissoes: base('completo') },
        { id: 2, nome: 'Financeiro', permissoes: comSubs(base('completo'), {
            pedidos:       'visualizar',
            clientes:      'visualizar',
            configuracoes: 'sem_acesso',
        })},
        { id: 3, nome: 'Vendedor/Atendimento', permissoes: comSubs(base('sem_acesso'), {
            inicio:                'completo',
            pedidos:               'completo',
            clientes:              'completo',
            financeiro:            'visualizar',
            'financeiro.dashboard':'sem_acesso',
            'financeiro.pagar':    'sem_acesso',
            'financeiro.fixas':    'sem_acesso',
            'financeiro.dre':      'sem_acesso',
            producao:              'visualizar',
            catalogo:              'visualizar',
        })},
        { id: 4, nome: 'Produção/Costura', permissoes: comSubs(base('sem_acesso'), {
            inicio:    'completo',
            pedidos:   { nivel: 'visualizar', acoes_restritas: ['mudar_status'] },
            clientes:  'visualizar',
            producao:  'completo',
            estoque:   'visualizar',
            catalogo:  'visualizar',
        })},
        { id: 5, nome: 'Instalação', permissoes: comSubs(base('sem_acesso'), {
            inicio:            'completo',
            pedidos:           { nivel: 'visualizar', acoes_restritas: ['marcar_instalado'] },
            clientes:          'visualizar',
            producao:          'visualizar',
            'producao.agenda': 'completo',
        })},
    ];
}

// Migra permissões salvas no modelo antigo (abas do Financeiro soltas) para a
// árvore atual. Módulos que não existiam antes entram liberados, para ninguém
// perder acesso na atualização — o administrador restringe depois se quiser.
function migrarPermissoesParaArvore(permissoes) {
    if (!permissoes || typeof permissoes !== 'object') return permTodos('sem_acesso');
    const legadoPresente = Object.keys(MAPA_MODULOS_LEGADO).some(k => k in permissoes);
    if (!legadoPresente) return permissoes;

    const novo = { ...permissoes };
    let nivelFinanceiro = 'sem_acesso';
    Object.entries(MAPA_MODULOS_LEGADO).forEach(([antigo, novoKey]) => {
        const p = permissoes[antigo];
        if (!p) return;
        novo[novoKey] = { nivel: p.nivel, acoes_restritas: p.acoes_restritas || [] };
        if (NIVEL_ORDEM[p.nivel] > NIVEL_ORDEM[nivelFinanceiro]) nivelFinanceiro = p.nivel;
        delete novo[antigo];
    });
    novo.financeiro = { nivel: nivelFinanceiro, acoes_restritas: [] };

    MODULOS_PERMISSAO.forEach(m => { if (!novo[m.key]) novo[m.key] = { nivel: 'completo', acoes_restritas: [] }; });
    return novo;
}

// Comissao de cada papel no pedido. Vendedor usa os campos historicos
// (vendedor_id, comissao_*); arquiteto, os arq_*. Um pedido pode ter os dois.
const CAMPOS_COMISSAO = {
    vendedor:  { id: 'vendedor_id', nome: 'vendedor_nome', pct: 'comissao_pct',     valor: 'comissao_valor',     paga: 'comissao_paga',     data: 'comissao_data_pgto' },
    arquiteto: { id: 'arq_id',      nome: 'arq_nome',      pct: 'arq_comissao_pct', valor: 'arq_comissao_valor', paga: 'arq_comissao_paga', data: 'arq_comissao_data_pgto' },
};

// Por um tempo o arquiteto entrava no pedido pelo campo de vendedor. Esses
// pedidos passam o arquiteto (e a comissao dele, paga ou nao) para os campos
// arq_*, e o vendedor fica vazio, como foi gravado.
function migrarArquitetoDosPedidos() {
    let mudou = false;
    (db.pedidos || []).forEach(p => {
        if (!p.vendedor_id || p.arq_id) return;
        const v = (db.vendedores || []).find(x => x.id == p.vendedor_id);
        if (!v || v.tipo !== 'arquiteto') return;
        p.arq_id = p.vendedor_id;
        p.arq_nome = p.vendedor_nome || v.nome;
        p.arq_comissao_pct = p.comissao_pct || 0;
        p.arq_comissao_valor = p.comissao_valor || 0;
        p.arq_comissao_paga = !!p.comissao_paga;
        p.arq_comissao_data_pgto = p.comissao_data_pgto || null;
        p.vendedor_id = null; p.vendedor_nome = '';
        p.comissao_pct = 0; p.comissao_valor = 0; p.comissao_paga = false; p.comissao_data_pgto = null;
        mudou = true;
    });
    if (mudou) syncDB();
}

function migrarPermissoesSalvas() {
    let mudou = false;
    (db.papeis || []).forEach(p => {
        const antes = JSON.stringify(p.permissoes);
        p.permissoes = migrarPermissoesParaArvore(p.permissoes);
        if (JSON.stringify(p.permissoes) !== antes) mudou = true;
    });
    (db.usuarios || []).forEach(u => {
        if (!u.permissoes_extras) return;
        const novo = {};
        Object.entries(u.permissoes_extras).forEach(([k, v]) => {
            novo[MAPA_MODULOS_LEGADO[k] || k] = v;
        });
        if (JSON.stringify(novo) !== JSON.stringify(u.permissoes_extras)) { u.permissoes_extras = novo; mudou = true; }
    });
    if (mudou) syncDB();
}

// --- BANCO DE DADOS (LocalStorage) ---
let db = {
    clientes:    JSON.parse(localStorage.getItem('sc_cli'))  || [],
    catalogo:    JSON.parse(localStorage.getItem('sc_cat'))  || [
        { id: 1, nome: 'Linho Sintético (Exemplo)', preco: 65.00, largura_rolo: 2.80, min_estoque: 0 }
    ],
    pedidos:     JSON.parse(localStorage.getItem('sc_ped'))  || [],
    estoque:     JSON.parse(localStorage.getItem('sc_est'))  || [],
    materiais:   JSON.parse(localStorage.getItem('sc_mat'))  || [],
    kits:        JSON.parse(localStorage.getItem('sc_kits')) || [],
    movimentos:  JSON.parse(localStorage.getItem('sc_mov'))  || [],
    vendedores:  JSON.parse(localStorage.getItem('sc_vend')) || [],
    fornecedores:    JSON.parse(localStorage.getItem('sc_forn')) || [],
    pedidos_compra:  JSON.parse(localStorage.getItem('sc_pc'))   || [],
    contas_receber:  JSON.parse(localStorage.getItem('sc_cr'))   || [],
    contas_pagar:    JSON.parse(localStorage.getItem('sc_cp'))   || [],
    despesas_fixas:  JSON.parse(localStorage.getItem('sc_df'))   || [],
    medicoes:        JSON.parse(localStorage.getItem('sc_med'))  || [],
    papeis:          JSON.parse(localStorage.getItem('sc_pap'))  || papeisPadrao(),
    usuarios:        JSON.parse(localStorage.getItem('sc_usr'))  || [],
    import_perfis:   JSON.parse(localStorage.getItem('sc_imp_perfis')) || []
};

function gerarNumeroPedido() {
    const seq = (parseInt(localStorage.getItem('sc_ped_seq') || '0') + 1);
    localStorage.setItem('sc_ped_seq', String(seq));
    const yy = String(new Date().getFullYear()).slice(-2);
    return parseInt(yy + String(seq).padStart(3, '0'));
}

// O pedido de compra tem sequencia propria: usar a dos pedidos faria uma
// compra consumir um numero de venda. Mesmo formato (ano + sequencial), e
// pula numero ja ocupado, porque as compras antigas nasceram com Date.now().
function gerarNumeroPedidoCompra() {
    const yy = String(new Date().getFullYear()).slice(-2);
    let seq = parseInt(localStorage.getItem('sc_pc_seq') || '0');
    let id;
    do {
        seq += 1;
        id = parseInt(yy + String(seq).padStart(3, '0'));
    } while (db.pedidos_compra.some(p => p.id === id));
    localStorage.setItem('sc_pc_seq', String(seq));
    return id;
}

function formatPedidoId(id) {
    return String(id);
}

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
    localStorage.setItem('sc_cr',   JSON.stringify(db.contas_receber));
    localStorage.setItem('sc_cp',   JSON.stringify(db.contas_pagar));
    localStorage.setItem('sc_df',   JSON.stringify(db.despesas_fixas));
    localStorage.setItem('sc_med',  JSON.stringify(db.medicoes));
    localStorage.setItem('sc_pap',  JSON.stringify(db.papeis));
    localStorage.setItem('sc_usr',  JSON.stringify(db.usuarios));
    localStorage.setItem('sc_imp_perfis', JSON.stringify(db.import_perfis));
}

// --- CONFIGURAÇÕES DA EMPRESA ---
function getEmpresa() {
    return JSON.parse(localStorage.getItem('sc_empresa') || '{}');
}

function buildEmpresaHeaderHTML(logoHeight) {
    const emp = getEmpresa();
    logoHeight = logoHeight || 52;
    const nome = emp.nome_fantasia || emp.razao_social || 'SCTech';
    const logoSrc = emp.logo_base64 || 'images/logo.png';
    const subLinha = (emp.nome_fantasia && emp.razao_social && emp.nome_fantasia !== emp.razao_social)
        ? `<div style="font-size:11px;color:#888">${escapeHtml(emp.razao_social)}</div>` : '';
    const infos = [
        emp.cnpj     ? 'CNPJ: ' + escapeHtml(emp.cnpj)      : '',
        emp.telefone ? 'Tel: '  + escapeHtml(emp.telefone)   : '',
        emp.email    ? escapeHtml(emp.email)                  : '',
        emp.site     ? escapeHtml(emp.site)                   : ''
    ].filter(Boolean);
    const infoLine = infos.length
        ? `<div style="font-size:11px;color:#888;margin-top:2px">${infos.join(' &nbsp;·&nbsp; ')}</div>` : '';
    const endLine  = emp.endereco
        ? `<div style="font-size:11px;color:#888;margin-top:1px">${escapeHtml(emp.endereco)}</div>` : '';
    return `<div style="display:flex;align-items:center;gap:12px">
        <img src="${logoSrc}" alt="${escapeHtml(nome)}" style="height:${logoHeight}px;max-width:180px;object-fit:contain">
        <div>
            <strong style="font-size:${logoHeight > 44 ? 18 : 15}px;color:var(--primary)">${escapeHtml(nome)}</strong>
            ${subLinha}${infoLine}${endLine}
        </div>
    </div>`;
}

function salvarEmpresaConfigs() {
    const razao = (document.getElementById('emp-razao')?.value || '').trim();
    if (!razao) { showAlert('Informe a Razão Social.', '⚠️'); return; }
    const emp = {
        razao_social:  razao,
        nome_fantasia: (document.getElementById('emp-fantasia')?.value || '').trim(),
        cnpj:          (document.getElementById('emp-cnpj')?.value     || '').trim(),
        endereco:      (document.getElementById('emp-end')?.value       || '').trim(),
        telefone:      (document.getElementById('emp-tel')?.value       || '').trim(),
        email:         (document.getElementById('emp-email')?.value     || '').trim(),
        site:          (document.getElementById('emp-site')?.value      || '').trim(),
        logo_base64:   document.getElementById('emp-logo-preview')?.dataset.base64 || ''
    };
    localStorage.setItem('sc_empresa', JSON.stringify(emp));
    toast('Configurações da empresa salvas!', 'success');
    if (typeof atualizarPreviewCabecalho === 'function') atualizarPreviewCabecalho();
}

// --- FORMAS DE PAGAMENTO ---
// A empresa define a lista em Configuracoes > Empresa. Cada forma tem um nome
// e um % de desconto: o pedido guarda o nome, e escolher a forma preenche o
// desconto do pedido (que continua editavel). O Financeiro lanca um unico valor.
const _FORMAS_PAG_PADRAO = ['50% entrada + 50% na instalação', 'À vista', '30% entrada + 70% na instalação', '40% entrada + 60% na instalação'];
// Pedidos antigos guardavam um codigo no lugar do nome.
const _FORMAS_PAG_LEGADO = { avista: 'À vista', '50_50': '50% entrada + 50% na instalação', '30_70': '30% entrada + 70% na instalação', '40_60': '40% entrada + 60% na instalação' };

function _descontoValido(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    if (!isFinite(n) || n <= 0) return 0;
    return Math.min(100, Math.round(n * 100) / 100);
}

// Aceita a lista antiga (so nomes) e a nova ({ nome, desconto }).
function _formasLimpas(lista) {
    const vistas = new Set();
    return (Array.isArray(lista) ? lista : [])
        .map(x => (x && typeof x === 'object')
            ? { nome: String(x.nome == null ? '' : x.nome).trim(), desconto: _descontoValido(x.desconto) }
            : { nome: String(x == null ? '' : x).trim(), desconto: 0 })
        .filter(f => f.nome && !vistas.has(f.nome.toLowerCase()) && vistas.add(f.nome.toLowerCase()));
}

function getFormasPagamentoCfg() {
    try {
        const salvas = _formasLimpas(JSON.parse(localStorage.getItem('sc_formas_pag')));
        if (salvas.length) return salvas;
    } catch (e) {}
    return _FORMAS_PAG_PADRAO.map(nome => ({ nome, desconto: 0 }));
}

function getFormasPagamento() {
    return getFormasPagamentoCfg().map(f => f.nome);
}

// Desconto pre-configurado da forma; 0 para forma fora da lista.
function descontoDaFormaPagamento(nome) {
    const f = getFormasPagamentoCfg().find(x => x.nome === nome);
    return f ? f.desconto : 0;
}

function formaPagamentoDoPedido(ped) {
    if (!ped) return '';
    return ped.forma_pagamento || _FORMAS_PAG_LEGADO[ped.tipo_pagamento] || '';
}

// Preenche o select do pedido. Uma forma que saiu da lista mas esta gravada
// no pedido continua aparecendo, para editar o pedido nao trocar a forma.
function preencherSelectFormaPagamento(atual) {
    const sel = document.getElementById('ped-forma-pagamento');
    if (!sel) return;
    const cfg = getFormasPagamentoCfg();
    const formas = cfg.map(f => f.nome);
    if (atual && !formas.includes(atual)) formas.push(atual);
    sel.innerHTML = formas.map(f => {
        const d = (cfg.find(x => x.nome === f) || {}).desconto || 0;
        const rot = d ? `${f} (${String(d).replace('.', ',')}% de desconto)` : f;
        return `<option value="${escapeHtml(f)}">${escapeHtml(rot)}</option>`;
    }).join('');
    sel.value = atual || formas[0];
}

// Escolher a forma no pedido traz o desconto dela. O vendedor ainda pode
// mudar o campo depois; so uma nova troca de forma o sobrescreve.
function aplicarDescontoDaFormaPagamento() {
    const sel = document.getElementById('ped-forma-pagamento');
    const desc = document.getElementById('ped-desconto');
    if (!sel || !desc) return;
    desc.value = descontoDaFormaPagamento(sel.value);
    atualizarTotalPedido();
}

// Tela de configuracao: rascunho editavel, gravado so no "Salvar".
let _formasPagRascunho = null;

function renderFormasPagamentoCfg() {
    const box = document.getElementById('emp-formas-pag');
    if (!box) return;
    if (!_formasPagRascunho) _formasPagRascunho = getFormasPagamentoCfg();
    const n = _formasPagRascunho.length;
    box.innerHTML = _formasPagRascunho.map((f, i) => `
        <div class="forma-pag-linha">
            <span class="forma-pag-ordem">${i + 1}</span>
            <input type="text" class="forma-pag-nome" value="${escapeHtml(f.nome)}" maxlength="80" aria-label="Forma de pagamento ${i + 1}"
                oninput="_formasPagRascunho[${i}].nome = this.value" placeholder="Ex.: PIX, Cartão em 10x, Boleto 30/60/90">
            <label class="forma-pag-desc" title="Desconto aplicado ao pedido quando esta forma é escolhida">
                <input type="number" class="forma-pag-desconto" value="${f.desconto || 0}" min="0" max="100" step="0.5"
                    aria-label="Desconto da forma de pagamento ${i + 1}" oninput="_formasPagRascunho[${i}].desconto = this.value">
                <span>% desc.</span>
            </label>
            <span class="forma-pag-padrao"${i === 0 ? '' : ' style="visibility:hidden" aria-hidden="true"'}>padrão</span>
            <button type="button" class="btn btn-outline btn-sm" onclick="moverFormaPagamento(${i},-1)" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="moverFormaPagamento(${i},1)" title="Descer" ${i === n - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-outline btn-sm btn-danger" onclick="removerFormaPagamento(${i})" title="Remover">✕</button>
        </div>`).join('') || '<div class="forma-pag-vazia">Nenhuma forma cadastrada. Adicione pelo menos uma.</div>';
}

function adicionarFormaPagamento() {
    _formasPagRascunho.push({ nome: '', desconto: 0 });
    renderFormasPagamentoCfg();
    const inputs = document.querySelectorAll('#emp-formas-pag .forma-pag-nome');
    inputs[inputs.length - 1]?.focus();
}

function moverFormaPagamento(i, dir) {
    const j = i + dir, l = _formasPagRascunho;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    renderFormasPagamentoCfg();
}

function removerFormaPagamento(i) {
    _formasPagRascunho.splice(i, 1);
    renderFormasPagamentoCfg();
}

async function salvarFormasPagamento() {
    const limpas = _formasLimpas(_formasPagRascunho);
    if (!limpas.length) { await showAlert('Cadastre pelo menos uma forma de pagamento.', '⚠️'); return; }
    localStorage.setItem('sc_formas_pag', JSON.stringify(limpas));
    _formasPagRascunho = limpas.map(f => ({ ...f }));
    renderFormasPagamentoCfg();
    toast('Formas de pagamento salvas!', 'success');
}

function restaurarFormasPagamento() {
    localStorage.removeItem('sc_formas_pag');
    _formasPagRascunho = getFormasPagamentoCfg();
    renderFormasPagamentoCfg();
    toast('Formas de pagamento restauradas para o padrão.', 'info', 1800);
}

function carregarEmpresaConfigs() {
    const emp = getEmpresa();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('emp-razao',    emp.razao_social);
    set('emp-fantasia', emp.nome_fantasia);
    set('emp-cnpj',     emp.cnpj);
    set('emp-end',      emp.endereco);
    set('emp-tel',      emp.telefone);
    set('emp-email',    emp.email);
    set('emp-site',     emp.site);
    if (emp.logo_base64) {
        const preview = document.getElementById('emp-logo-preview');
        const removeBtn = document.getElementById('emp-remove-logo');
        if (preview) {
            preview.innerHTML = `<img src="${emp.logo_base64}" style="max-height:90px;max-width:200px;object-fit:contain;border:1px solid #E0E0E0;border-radius:8px;padding:8px">`;
            preview.dataset.base64 = emp.logo_base64;
        }
        if (removeBtn) removeBtn.style.display = '';
    }
}

function previewLogoEmpresa(input) {
    const file = input.files[0];
    if (!file) return;
    _resizeImageBase64(file, 400).then(function(base64) {
        const preview   = document.getElementById('emp-logo-preview');
        const removeBtn = document.getElementById('emp-remove-logo');
        if (preview) {
            preview.innerHTML = `<img src="${base64}" style="max-height:90px;max-width:200px;object-fit:contain;border:1px solid #E0E0E0;border-radius:8px;padding:8px">`;
            preview.dataset.base64 = base64;
        }
        if (removeBtn) removeBtn.style.display = '';
    });
}

function removerLogoEmpresa() {
    const preview   = document.getElementById('emp-logo-preview');
    const removeBtn = document.getElementById('emp-remove-logo');
    const input     = document.getElementById('emp-logo-input');
    if (preview)   { preview.innerHTML = '<div class="logo-placeholder">🏢</div>'; preview.dataset.base64 = ''; }
    if (removeBtn) removeBtn.style.display = 'none';
    if (input)     input.value = '';
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
let editandoCatalogoId = null;
let editandoMaterialId = null;
let pcDraftItens = [];
// Qual pedido de compra esta sendo editado. null = formulario de pedido novo.
let editandoPCId = null;
// A ordenacao escolhida vale para as duas telas que mostram o mesmo tipo de
// item (Cadastro/Catalogo e Estoque). Como sao paginas separadas, o objeto em
// memoria nao basta: a escolha e' guardada e relida no carregamento.
const _CHAVE_ORDENACAO = 'sc_ordenacao';
function _lerOrdenacao(tipo, padrao) {
    try {
        const tudo = JSON.parse(localStorage.getItem(_CHAVE_ORDENACAO) || '{}');
        const e = tudo[tipo];
        if (e && typeof e.col === 'string' && (e.dir === 1 || e.dir === -1)) return { col: e.col, dir: e.dir };
    } catch (_) { /* preferencia corrompida nao pode derrubar a tela */ }
    return padrao;
}
function _gravarOrdenacao(tipo, estado) {
    try {
        const tudo = JSON.parse(localStorage.getItem(_CHAVE_ORDENACAO) || '{}');
        tudo[tipo] = { col: estado.col, dir: estado.dir };
        localStorage.setItem(_CHAVE_ORDENACAO, JSON.stringify(tudo));
    } catch (_) { /* sem espaco: a ordenacao da sessao continua valendo */ }
}

const matSortState = _lerOrdenacao('material', { col: 'nome', dir: 1 });
const cliSortState = { col: 'nome', dir: 1 };

let _prevTabEstoque = null, _curTabEstoque = 'tecidos';
let _prevTabCatalogo = null, _curTabCatalogo = 'tecidos';
let _prevTabRel = null, _curTabRel = 'faturamento';
let _prevTabVend = null, _curTabVend = 'lista';
let _prevTabForn = null, _curTabForn = 'lista';
let _prevTabFin = null, _curTabFin = 'dashboard';

function _tabBackBtn(navSel, prevTab, goBackFn) {
    const nav = document.querySelector(navSel);
    if (!nav) return;
    let btn = nav.querySelector('.tab-back-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'tab-btn tab-back-btn';
        nav.prepend(btn);
    }
    if (prevTab) {
        btn.textContent = '← Voltar';
        btn.style.display = '';
        btn.onclick = goBackFn;
    } else {
        btn.style.display = 'none';
    }
}

// --- HISTÓRICO DE NAVEGAÇÃO ENTRE PÁGINAS ---
const _PAGE_NAMES = {
    'index.html': 'Página Inicial', 'pcp.html': 'Produção',
    'estoque.html': 'Estoque', 'clientes.html': 'Clientes',
    'catalogo.html': 'Cadastro/Catálogo', 'relatorios.html': 'Relatórios',
    'vendedores.html': 'Vendedores/Arquitetos', 'fornecedores.html': 'Fornecedores',
    'financeiro.html': 'Financeiro', 'pedido.html': 'Pedido',
};

function _getNavHistory() {
    try { return JSON.parse(sessionStorage.getItem('sc_nav_history') || '[]'); } catch { return []; }
}
function _saveNavHistory(hist) {
    sessionStorage.setItem('sc_nav_history', JSON.stringify(hist.slice(-30)));
}

// --- SIDEBAR (navegação lateral) ---
const NAV_ICON_PATHS = {
    home: '<path d="M4 12 12 5l8 7"/><path d="M6 11v8a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-8"/>',
    pedidos: '<rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
    producao: '<circle cx="6" cy="6" r="2.1"/><circle cx="18" cy="6" r="2.1"/><circle cx="12" cy="18" r="2.1"/><line x1="7.7" y1="7.6" x2="10.6" y2="16"/><line x1="16.3" y1="7.6" x2="13.4" y2="16"/><line x1="8.1" y1="6" x2="15.9" y2="6"/>',
    estoque: '<path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z"/><line x1="4" y1="7.5" x2="12" y2="12"/><line x1="20" y1="7.5" x2="12" y2="12"/><line x1="12" y1="12" x2="12" y2="21"/>',
    clientes: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><circle cx="17" cy="8.5" r="2.3"/><path d="M15.3 14.7c2.4.5 4.2 2.4 4.2 5.3"/>',
    catalogo: '<path d="M11.5 3.5H5A1.5 1.5 0 0 0 3.5 5v6.5a1.5 1.5 0 0 0 .44 1.06l8.5 8.5a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-8.5-8.5a1.5 1.5 0 0 0-1.06-.44Z"/><circle cx="8" cy="8" r="1.3"/>',
    vendedores: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M15.5 12.3 17 13.8l3-3.1"/>',
    fornecedores: '<rect x="2.5" y="8" width="11" height="8" rx="1"/><path d="M13.5 11h3.2l3.3 3v2h-6.5"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    financeiro: '<line x1="4" y1="20" x2="4" y2="10"/><line x1="9.3" y1="20" x2="9.3" y2="4"/><line x1="14.7" y1="20" x2="14.7" y2="13"/><line x1="20" y1="20" x2="20" y2="7"/><line x1="2" y1="20" x2="22" y2="20"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
    info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><line x1="21" y1="12" x2="9" y2="12"/><path d="M16 7l5 5-5 5"/>',
    collapse: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/>',
    user: '<circle cx="12" cy="8.2" r="3.4"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
    dollar: '<circle cx="12" cy="12" r="9"/><path d="M9 15.3c0 1.1 1.3 1.9 3 1.9s3-.7 3-1.9-1.4-1.6-3-2-3-.9-3-2 1.3-1.9 3-1.9 3 .8 3 1.7"/><line x1="12" y1="6" x2="12" y2="7.4"/><line x1="12" y1="16.6" x2="12" y2="18"/>',
    file: '<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4"/><line x1="8" y1="12.5" x2="15" y2="12.5"/><line x1="8" y1="16" x2="15" y2="16"/>',
    receipt: '<path d="M6 3h12v17l-2.5-1.5L13 20l-2.5-1.5L8 20l-2-1.5V3Z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="11.5" x2="15" y2="11.5"/>',
    alert: '<path d="M12 3 22 20H2Z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>',
    inbox: '<path d="M3 12h4l2 3h6l2-3h4"/><path d="M5 12 6.5 5.5A1 1 0 0 1 7.5 4.7h9A1 1 0 0 1 17.5 5.5L19 12"/><path d="M3 12v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/>',
};

function navIcon(name, size) {
    size = size || 20;
    return `<svg class="nav-icon-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${NAV_ICON_PATHS[name] || ''}</svg>`;
}

const SIDEBAR_MODULOS = [
    { href: 'index.html',       icon: 'home',         label: 'Página Inicial',    permModulo: 'inicio' },
    { href: 'pedidos.html',     icon: 'pedidos',      label: 'Pedidos',           permModulo: 'pedidos' },
    { href: 'pcp.html',         icon: 'producao',     label: 'Produção',          permModulo: 'producao' },
    { href: 'estoque.html',     icon: 'estoque',      label: 'Estoque',           permModulo: 'estoque' },
    { href: 'clientes.html',    icon: 'clientes',     label: 'Clientes',          permModulo: 'clientes' },
    { href: 'catalogo.html',    icon: 'catalogo',     label: 'Cadastro/Catálogo', permModulo: 'catalogo' },
    { href: 'vendedores.html',  icon: 'vendedores',   label: 'Vendedores/Arquitetos', permModulo: 'vendedores' },
    { href: 'fornecedores.html', icon: 'fornecedores', label: 'Fornecedores',     permModulo: 'fornecedores' },
    { href: 'financeiro.html',  icon: 'financeiro',   label: 'Financeiro',        permModulo: 'financeiro' },
    { href: 'configuracoes.html', icon: 'settings',   label: 'Configurações',     permModulo: 'configuracoes' },
];

function getSidebarCollapsed() {
    return localStorage.getItem('sc_sidebar') === 'collapsed';
}

function toggleSidebarCollapse() {
    const collapsed = !getSidebarCollapsed();
    localStorage.setItem('sc_sidebar', collapsed ? 'collapsed' : 'expanded');
    document.documentElement.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded');
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed', collapsed);
    const btn = document.getElementById('sidebar-toggle-btn');
    if (btn) btn.title = collapsed ? 'Expandir menu' : 'Recolher menu';
}

function renderSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;
    const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const collapsed = getSidebarCollapsed();
    sidebar.classList.toggle('collapsed', collapsed);

    const usuarioAtual = getUsuarioLogado();
    const navHTML = SIDEBAR_MODULOS.filter(m => {
        if (!m.permModulo) return true;
        const lista = Array.isArray(m.permModulo) ? m.permModulo : [m.permModulo];
        return lista.some(mod => temAcessoAlgumaSub(mod, 'visualizar', usuarioAtual));
    }).map(m => {
        const active = m.href.toLowerCase() === currentFile;
        return `<a href="${m.href}" class="nav-item${active ? ' active' : ''}" title="${escapeHtml(m.label)}">${navIcon(m.icon)}<span class="nav-text">${escapeHtml(m.label)}</span></a>`;
    }).join('');

    const papelAtual = usuarioAtual ? db.papeis.find(p => p.id === usuarioAtual.papel_id) : null;

    sidebar.innerHTML = `
        <div class="logo-popup-wrap" id="logo-popup-wrap">
            <div class="logo" onclick="toggleLogoPopup(event)">
                <img src="images/logo.png" alt="SCTech" class="sidebar-logo-img">
                <h2>SCTech</h2>
            </div>
            <div class="logo-popup" id="logo-popup">
                <div class="logo-popup-header">
                    <div class="logo-popup-avatar">${navIcon('user', 18)}</div>
                    <div><div class="logo-popup-name" id="popup-user-name">—</div><div class="logo-popup-role">${escapeHtml(papelAtual?.nome || 'Usuário SCTech')}</div></div>
                </div>
                <div class="logo-popup-sep"></div>
                <button class="logo-popup-item" onclick="toggleTema()" style="justify-content:space-between">
                    <span style="display:flex;align-items:center;gap:10px"><span id="tema-icone">🌙</span> Tema</span>
                    <span class="tema-switch" id="tema-switch"></span>
                </button>
                <div class="logo-popup-sep"></div>
                <a href="sobre.html" class="logo-popup-item">${navIcon('info', 16)} Sobre o Sistema</a>
                ${temAcesso('configuracoes.empresa', 'visualizar')
                    ? `<a href="empresa.html" class="logo-popup-item">${navIcon('settings', 16)} Configurar Empresa</a>`
                    : ''}
                <div class="logo-popup-sep"></div>
                <button class="logo-popup-item logo-popup-logout" onclick="logout()">${navIcon('logout', 16)} Sair</button>
            </div>
        </div>
        <nav class="nav-rows">${navHTML}</nav>
        <button class="sidebar-toggle" id="sidebar-toggle-btn" onclick="toggleSidebarCollapse()" title="${collapsed ? 'Expandir menu' : 'Recolher menu'}">
            ${navIcon('collapse', 18)}<span class="nav-text">Recolher menu</span>
        </button>`;
}

function initPageNavigation() {
    renderSidebar();
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;

    const currentFile = window.location.pathname.split('/').pop() || 'index.html';

    // Intercept sidebar nav clicks: push current page to history before leaving
    sidebar.querySelectorAll('a.nav-item').forEach(link => {
        link.addEventListener('click', () => {
            const dest = (link.getAttribute('href') || '').split('?')[0];
            if (dest && dest !== currentFile) {
                const hist = _getNavHistory();
                hist.push(window.location.href);
                _saveNavHistory(hist);
            }
        });
    });

}

// --- MODAIS INTERNOS ---
function _getModal() {
    let o = document.getElementById('sc-modal-overlay');
    if (!o) {
        o = document.createElement('div');
        o.id = 'sc-modal-overlay';
        o.className = 'sc-modal-overlay';
        o.innerHTML = `<div class="sc-modal-box">
            <div class="sc-modal-icon" id="sc-modal-icon"></div>
            <p class="sc-modal-msg" id="sc-modal-msg"></p>
            <div class="sc-modal-btns" id="sc-modal-btns"></div>
        </div>`;
        document.body.appendChild(o);
    }
    return o;
}
function showAlert(msg, icon = 'ℹ️') {
    return new Promise(resolve => {
        const o = _getModal();
        document.getElementById('sc-modal-icon').textContent = icon;
        document.getElementById('sc-modal-msg').textContent = msg;
        const btns = document.getElementById('sc-modal-btns');
        btns.innerHTML = '<button class="btn" id="sc-modal-ok">OK</button>';
        o.style.display = 'flex';
        const ok = document.getElementById('sc-modal-ok');
        const close = () => { o.style.display = 'none'; document.removeEventListener('keydown', esc); resolve(); };
        const esc = e => { if (e.key === 'Escape') close(); };
        ok.addEventListener('click', close, { once: true });
        document.addEventListener('keydown', esc);
        ok.focus();
    });
}
function showConfirm(msg, icon = '❓', okLabel = 'Confirmar', cancelLabel = 'Cancelar') {
    return new Promise(resolve => {
        const o = _getModal();
        document.getElementById('sc-modal-icon').textContent = icon;
        document.getElementById('sc-modal-msg').textContent = msg;
        const btns = document.getElementById('sc-modal-btns');
        btns.innerHTML = `<button class="btn btn-outline" id="sc-modal-cancel">${cancelLabel}</button><button class="btn btn-success" id="sc-modal-ok">${okLabel}</button>`;
        o.style.display = 'flex';
        const close = val => { o.style.display = 'none'; document.removeEventListener('keydown', esc); resolve(val); };
        const esc = e => { if (e.key === 'Escape') close(false); };
        document.getElementById('sc-modal-ok').addEventListener('click', () => close(true), { once: true });
        document.getElementById('sc-modal-cancel').addEventListener('click', () => close(false), { once: true });
        document.addEventListener('keydown', esc);
        document.getElementById('sc-modal-ok').focus();
    });
}
// Modal com mais de duas saidas. Cada opcao e { rotulo, valor, destaque? }.
// Devolve o valor da opcao escolhida, ou null se o usuario desistir.
function showEscolha(msg, icon, opcoes, cancelLabel = 'Cancelar') {
    return new Promise(resolve => {
        const o = _getModal();
        document.getElementById('sc-modal-icon').textContent = icon;
        document.getElementById('sc-modal-msg').textContent = msg;
        const btns = document.getElementById('sc-modal-btns');
        btns.classList.toggle('sc-modal-btns-col', opcoes.length > 2);
        btns.innerHTML = opcoes.map((op, i) =>
            `<button class="btn ${op.destaque ? 'btn-success' : 'btn-outline'}" data-escolha="${i}">${escapeHtml(op.rotulo)}</button>`
        ).join('') + `<button class="btn btn-outline sc-modal-cancelar" data-escolha="-1">${escapeHtml(cancelLabel)}</button>`;
        o.style.display = 'flex';
        const close = val => {
            o.style.display = 'none';
            btns.classList.remove('sc-modal-btns-col');
            document.removeEventListener('keydown', esc);
            resolve(val);
        };
        const esc = e => { if (e.key === 'Escape') close(null); };
        btns.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            const i = parseInt(b.dataset.escolha, 10);
            close(i < 0 ? null : opcoes[i].valor);
        }, { once: true }));
        document.addEventListener('keydown', esc);
        btns.querySelector('button')?.focus();
    });
}

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

// --- AUTENTICAÇÃO E CONTROLE DE ACESSO ---
// Sistema 100% cliente (sem servidor): isto é controle de acesso em nível de
// interface, não uma fronteira de segurança real — qualquer pessoa com acesso
// ao DevTools pode inspecionar o localStorage. O hash de senha aqui é só para
// não guardar a senha em texto puro; quando o sistema migrar para um banco de
// dados/backend real, a autenticação deve ser refeita lá (hash forte no
// servidor, verificação em cada rota) e este arquivo deixa de ser a fonte da verdade.
const FIN_TAB_MODULO = { dashboard: 'financeiro.dashboard', receber: 'financeiro.receber', pagar: 'financeiro.pagar', fixas: 'financeiro.fixas', dre: 'financeiro.dre' };

const PAGINA_MODULO = {
    'index.html':         'inicio',
    'pedidos.html':       'pedidos',
    'pedido.html':        'pedidos',
    'pcp.html':           'producao',
    'estoque.html':       'estoque',
    'clientes.html':      'clientes',
    'catalogo.html':      'catalogo',
    'vendedores.html':    'vendedores',
    'fornecedores.html':  'fornecedores',
    'financeiro.html':    'financeiro',
    'relatorios.html':    'relatorios',
    'configuracoes.html': 'configuracoes',
    'empresa.html':       'configuracoes.empresa',
};

async function hashSenha(senha) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(senha));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Cria o primeiro usuário (Administrador) automaticamente na primeira vez que o
// sistema roda com login — preserva o acesso que já existia antes desta feature.
async function garantirMigracaoUsuarios() {
    migrarPermissoesSalvas();
    if (db.usuarios.length > 0) return;
    const papelAdmin = db.papeis.find(p => p.nome === 'Administrador') || db.papeis[0];
    db.usuarios.push({
        id: 1, nome: 'Administrador', email: 'admin@sctech.local',
        senha_hash: await hashSenha('@cy3978I'),
        papel_id: papelAdmin.id, ativo: true, permissoes_extras: {}
    });
    syncDB();
}

function getUsuarioLogado() {
    let sess;
    try { sess = JSON.parse(sessionStorage.getItem('sc_user') || 'null'); } catch { return null; }
    if (!sess) return null;
    return db.usuarios.find(u => u.id === sess.id) || null;
}

// Resolução: permissão específica do usuário sobrescreve o papel quando presente.
// Resolve a permissão de um módulo ou sub-aba ("modulo.sub").
// Ordem: permissão específica do usuário → permissão do papel → herança do
// módulo pai (quando a chave é de sub-aba) → sem acesso.
function resolverPermissao(modulo, usuario) {
    usuario = usuario === undefined ? getUsuarioLogado() : usuario;
    const vazio = { nivel: 'sem_acesso', acoes_restritas: [] };
    if (!usuario) return vazio;
    const papel = db.papeis.find(p => p.id === usuario.papel_id);
    const extras = usuario.permissoes_extras || {};
    const buscar = chave => extras[chave] || (papel && papel.permissoes && papel.permissoes[chave]);

    const direta = buscar(modulo);
    if (direta) return direta;
    if (modulo.includes('.')) {
        const pai = buscar(modulo.split('.')[0]);
        if (pai) return pai;
    }
    return vazio;
}

// Verdadeiro se o usuário alcança o nível em QUALQUER sub-aba do módulo
// (usado para decidir se o módulo aparece no menu).
function temAcessoAlgumaSub(moduloKey, nivelMinimo, usuario) {
    if (temAcesso(moduloKey, nivelMinimo, usuario)) return true;
    const mod = MODULOS_PERMISSAO.find(m => m.key === moduloKey);
    return !!(mod && (mod.subs || []).some(s => temAcesso(`${moduloKey}.${s.key}`, nivelMinimo, usuario)));
}

function temAcesso(modulo, nivelMinimo, usuario) {
    nivelMinimo = nivelMinimo || 'visualizar';
    const perm = resolverPermissao(modulo, usuario);
    return NIVEL_ORDEM[perm.nivel] >= NIVEL_ORDEM[nivelMinimo];
}

// Verdadeiro se o usuário pode executar `acaoId` em `modulo` — ou porque tem
// nível "completo" (que já libera tudo), ou porque a ação está na lista de
// ações restritas liberadas especificamente para ele.
function temAcaoRestrita(modulo, acaoId, usuario) {
    const perm = resolverPermissao(modulo, usuario);
    if (perm.nivel === 'completo') return true;
    return (perm.acoes_restritas || []).includes(acaoId);
}

// Guarda usada no início de toda ação que cria/edita/exclui dados — segunda
// camada além de esconder o botão na UI (a checagem "de verdade" continua
// sendo em nível de interface, não um backend real; ver nota no topo do bloco de autenticação).
async function exigirPermissao(modulo, nivelMinimo) {
    if (temAcesso(modulo, nivelMinimo)) return true;
    await showAlert('Você não tem permissão para realizar esta ação.', '🚫');
    return false;
}

function checkAuth() {
    if (!sessionStorage.getItem('sc_user')) { window.location.replace('login.html'); return; }
    migrarPermissoesSalvas();
    migrarArquitetoDosPedidos();
    const usuario = getUsuarioLogado();
    if (!usuario || !usuario.ativo) { logout(); return; }
    const arquivo  = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const exigidos = PAGINA_MODULO[arquivo];
    if (exigidos) {
        const lista = Array.isArray(exigidos) ? exigidos : [exigidos];
        if (!lista.some(m => temAcessoAlgumaSub(m, 'visualizar', usuario))) { window.location.replace('index.html'); return; }
    }
}

async function realizarLogin() {
    await garantirMigracaoUsuarios();
    const emailVal = document.getElementById('login-usuario').value.trim().toLowerCase();
    const senhaVal = document.getElementById('login-senha').value;
    const erroEl   = document.getElementById('login-erro');
    const falhar = () => {
        erroEl.textContent = 'E-mail ou senha incorretos.';
        erroEl.style.display = 'block';
        document.getElementById('login-senha').value = '';
        document.getElementById('login-usuario').focus();
    };
    const usuario = db.usuarios.find(u => u.email.toLowerCase() === emailVal);
    if (!usuario || !usuario.ativo) { falhar(); return; }
    const hash = await hashSenha(senhaVal);
    if (hash !== usuario.senha_hash) { falhar(); return; }
    sessionStorage.setItem('sc_user', JSON.stringify({ id: usuario.id, nome: usuario.nome, email: usuario.email }));
    window.location.href = 'index.html';
}

function logout() {
    sessionStorage.removeItem('sc_user');
    window.location.replace('login.html');
}

// --- CONFIGURAÇÕES: USUÁRIOS E PAPÉIS ---
function mostrarTabConfig(tab) {
    document.querySelectorAll('.cfg-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.cfg-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.cfg-tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`cfg-${tab}`)?.classList.add('active');
    if (tab === 'usuarios') renderConfigUsuarios();
    else if (tab === 'papeis') renderConfigPapeis();
}

// Lista plana de linhas da matriz: cada módulo seguido de suas sub-abas.
function _linhasMatriz() {
    const linhas = [];
    MODULOS_PERMISSAO.forEach(m => {
        linhas.push({ key: m.key, label: m.label, isSub: false, acoes: ACOES_RESTRITAS_POR_MODULO[m.key] || [] });
        (m.subs || []).forEach(s => linhas.push({ key: `${m.key}.${s.key}`, label: s.label, isSub: true, pai: m.key, acoes: [] }));
    });
    return linhas;
}

function _linhaMatrizPermissao(linha, prefix, valorNivel, valorAcoes, opts) {
    opts = opts || {};
    const dis = opts.disabled ? 'disabled' : '';
    // Sub-aba ganha a opção "Herdar" (não grava chave e segue o nível do módulo).
    const niveis = linha.isSub
        ? [['', 'Herdar'], ['sem_acesso', 'Sem acesso'], ['visualizar', 'Visualizar'], ['completo', 'Completo']]
        : [['sem_acesso', 'Sem acesso'], ['visualizar', 'Visualizar'], ['completo', 'Completo']];
    const sel = valorNivel === undefined || valorNivel === null ? '' : valorNivel;
    const radiosHtml = niveis.map(([v, lbl]) =>
        `<label class="cfg-radio"><input type="radio" name="${prefix}-nivel-${linha.key}" value="${v}" ${sel === v ? 'checked' : ''} ${dis}> ${lbl}</label>`
    ).join('');
    const acoesHtml = linha.acoes.length
        ? `<div class="cfg-acoes-restritas">${linha.acoes.map(a =>
            `<label class="cfg-check"><input type="checkbox" class="cfg-acao-chk" data-modulo="${linha.key}" data-acao="${a.id}" ${(valorAcoes || []).includes(a.id) ? 'checked' : ''} ${dis}> ${escapeHtml(a.label)}</label>`
          ).join('')}</div>`
        : '<span style="color:#8F8F8F;font-size:11px">—</span>';
    return { radiosHtml, acoesHtml };
}

// Matriz totalmente editável — usada no formulário de Papel (o papel É a base).
function _matrizPapelHTML(permissoesAtual) {
    permissoesAtual = permissoesAtual || permTodos('sem_acesso');
    return `<table class="cfg-matriz"><thead><tr><th>Módulo / sub-aba</th><th>Nível de acesso</th><th>Ações restritas</th></tr></thead><tbody>
        ${_linhasMatriz().map(l => {
            const p = permissoesAtual[l.key];
            const nivel = p ? p.nivel : (l.isSub ? '' : 'sem_acesso');
            const { radiosHtml, acoesHtml } = _linhaMatrizPermissao(l, 'papel', nivel, p && p.acoes_restritas);
            const nSubs = l.isSub ? 0 : (MODULOS_PERMISSAO.find(m => m.key === l.key)?.subs || []).length;
            const nome = l.isSub
                ? `<span class="cfg-sub-label">${escapeHtml(l.label)}</span>`
                : `<strong>${escapeHtml(l.label)}</strong>${nSubs ? ` <button type="button" class="cfg-exp-btn" onclick="_toggleSubsModulo(this,'${l.key}')" title="Mostrar/ocultar sub-abas">▸ ${nSubs}</button>` : ''}`;
            const attrs = l.isSub ? ` data-pai="${l.pai}" style="display:none"` : '';
            return `<tr class="${l.isSub ? 'cfg-row-sub' : 'cfg-row-mod'}"${attrs}><td>${nome}</td><td><div class="cfg-radio-group">${radiosHtml}</div></td><td>${acoesHtml}</td></tr>`;
        }).join('')}
    </tbody></table>`;
}

function _lerMatrizPapelForm() {
    const permissoes = {};
    _linhasMatriz().forEach(l => {
        let nivel = l.isSub ? '' : 'sem_acesso';
        document.getElementsByName(`papel-nivel-${l.key}`).forEach(r => { if (r.checked) nivel = r.value; });
        if (l.isSub && nivel === '') return; // "Herdar": não grava chave
        const acoes = Array.from(document.querySelectorAll(`.cfg-acao-chk[data-modulo="${l.key}"]`)).filter(c => c.checked).map(c => c.dataset.acao);
        permissoes[l.key] = { nivel, acoes_restritas: acoes };
    });
    return permissoes;
}

// Matriz do usuário: cada linha herda do papel por padrão; "Personalizar" libera a
// edição daquela linha e grava a sobrescrita em permissoes_extras[chave].
function _matrizUsuarioHTML(papelBase, permissoesExtras) {
    permissoesExtras = permissoesExtras || {};
    const doPapel = k => (papelBase && papelBase.permissoes && papelBase.permissoes[k]) || null;
    return `<table class="cfg-matriz" id="usr-matriz"><thead><tr><th>Módulo / sub-aba</th><th>Personalizar</th><th>Nível de acesso</th><th>Ações restritas</th></tr></thead><tbody>
        ${_linhasMatriz().map(l => {
            const isOverride = !!permissoesExtras[l.key];
            const herdado = doPapel(l.key) || (l.isSub ? doPapel(l.pai) : null) || { nivel: 'sem_acesso', acoes_restritas: [] };
            const valor = isOverride ? permissoesExtras[l.key] : herdado;
            const { radiosHtml, acoesHtml } = _linhaMatrizPermissao(l, 'usr', valor.nivel, valor.acoes_restritas, { disabled: !isOverride });
            const nSubs = l.isSub ? 0 : (MODULOS_PERMISSAO.find(m => m.key === l.key)?.subs || []).length;
            const nome = l.isSub
                ? `<span class="cfg-sub-label">${escapeHtml(l.label)}</span>`
                : `<strong>${escapeHtml(l.label)}</strong>${nSubs ? ` <button type="button" class="cfg-exp-btn" onclick="_toggleSubsModulo(this,'${l.key}')" title="Mostrar/ocultar sub-abas">▸ ${nSubs}</button>` : ''}`;
            const oculta = l.isSub && !isOverride;
            const attrs = l.isSub ? ` data-pai="${l.pai}"${oculta ? ' style="display:none"' : ''}` : '';
            return `<tr class="cfg-row ${l.isSub ? 'cfg-row-sub' : 'cfg-row-mod'}${isOverride ? ' cfg-row-personalizado' : ''}" data-modulo="${l.key}"${attrs}>
                <td>${nome}</td>
                <td>
                    <label class="cfg-override-toggle">
                        <input type="checkbox" class="cfg-override-chk" onchange="_onTogglePersonalizarLinha(this)" ${isOverride ? 'checked' : ''}>
                        <span class="cfg-badge-personalizado" style="${isOverride ? '' : 'display:none'}">✏️ personalizado</span>
                    </label>
                </td>
                <td><div class="cfg-radio-group">${radiosHtml}</div></td>
                <td>${acoesHtml}</td>
            </tr>`;
        }).join('')}
    </tbody></table>`;
}

// Mostra/oculta as sub-abas de um módulo na matriz de permissões.
function _toggleSubsModulo(btn, moduloKey) {
    const tabela = btn.closest('table');
    if (!tabela) return;
    const subs = tabela.querySelectorAll(`tr[data-pai="${moduloKey}"]`);
    const abrindo = subs.length && subs[0].style.display === 'none';
    subs.forEach(tr => { tr.style.display = abrindo ? '' : 'none'; });
    btn.textContent = `${abrindo ? '▾' : '▸'} ${subs.length}`;
}

function _onTogglePersonalizarLinha(chk) {
    const tr = chk.closest('tr');
    if (!tr) return;
    const ligado = chk.checked;
    tr.classList.toggle('cfg-row-personalizado', ligado);
    tr.querySelectorAll('input[type=radio], input.cfg-acao-chk').forEach(el => { el.disabled = !ligado; });
    const badge = tr.querySelector('.cfg-badge-personalizado');
    if (badge) badge.style.display = ligado ? '' : 'none';
}

// Quando o papel selecionado no form de usuário muda, atualiza os valores exibidos
// em toda linha que NÃO esteja personalizada (linhas personalizadas não são tocadas).
function onPapelUsuarioFormChange() {
    const papelId = parseInt(document.getElementById('usr-papel')?.value);
    const papel = db.papeis.find(p => p.id === papelId);
    if (!papel) return;
    _linhasMatriz().forEach(l => {
        const tr = document.querySelector(`#usr-matriz tr[data-modulo="${l.key}"]`);
        if (!tr) return;
        if (tr.querySelector('.cfg-override-chk')?.checked) return;
        const p = papel.permissoes[l.key] || (l.isSub ? papel.permissoes[l.pai] : null) || { nivel: 'sem_acesso', acoes_restritas: [] };
        tr.querySelectorAll('input[type=radio]').forEach(r => { r.checked = (r.value === p.nivel); });
        tr.querySelectorAll('.cfg-acao-chk').forEach(c => { c.checked = (p.acoes_restritas || []).includes(c.dataset.acao); });
    });
}

function _lerMatrizUsuarioForm() {
    const permissoes_extras = {};
    _linhasMatriz().forEach(l => {
        const tr = document.querySelector(`#usr-matriz tr[data-modulo="${l.key}"]`);
        if (!tr || !tr.querySelector('.cfg-override-chk')?.checked) return;
        let nivel = l.isSub ? '' : 'sem_acesso';
        tr.querySelectorAll('input[type=radio]').forEach(r => { if (r.checked) nivel = r.value; });
        if (l.isSub && nivel === '') return;
        const acoes = Array.from(tr.querySelectorAll('.cfg-acao-chk')).filter(c => c.checked).map(c => c.dataset.acao);
        permissoes_extras[l.key] = { nivel, acoes_restritas: acoes };
    });
    return permissoes_extras;
}

function renderConfigUsuarios() {
    const tb = document.getElementById('tb-usuarios');
    if (!tb) return;
    tb.innerHTML = db.usuarios.map(u => {
        const papel = db.papeis.find(p => p.id === u.papel_id);
        const nExtras = Object.keys(u.permissoes_extras || {}).length;
        return `<tr>
            <td><strong>${escapeHtml(u.nome)}</strong></td>
            <td>${escapeHtml(u.email)}</td>
            <td>${escapeHtml(papel ? papel.nome : '—')}${nExtras ? ` <span class="cfg-badge-personalizado" title="${nExtras} módulo(s) com permissão personalizada para este usuário">✏️ ${nExtras}</span>` : ''}</td>
            <td><span class="status-tag" style="background:${u.ativo ? '#E3F7E2' : '#F1F1F1'};color:${u.ativo ? '#0F6B0D' : '#8F8F8F'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="abrirModalUsuario(${u.id})" title="Editar">✏️</button>
                <button class="btn btn-outline btn-sm" onclick="toggleAtivoUsuario(${u.id})" title="${u.ativo ? 'Desativar' : 'Ativar'}">${u.ativo ? '🚫' : '✅'}</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirUsuario(${u.id})" title="Excluir">🗑️</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">Nenhum usuário cadastrado.</td></tr>';
}

function abrirModalUsuario(id) {
    const editando = id != null;
    const u = editando ? db.usuarios.find(x => x.id === id) : null;
    if (editando && !u) return;
    if (!db.papeis.length) { showAlert('Cadastre ao menos um papel antes de criar usuários.', '⚠️'); return; }
    const papelInicial = u ? db.papeis.find(p => p.id === u.papel_id) : db.papeis[0];
    const papelOptions = db.papeis.map(p => `<option value="${p.id}" ${papelInicial && papelInicial.id === p.id ? 'selected' : ''}>${escapeHtml(p.nome)}</option>`).join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:860px">
        <div class="modal-header">
            <h3>${editando ? 'Editar Usuário' : 'Novo Usuário'}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                <div class="form-group" style="margin-bottom:0"><label>Nome</label><input type="text" id="usr-nome" value="${u ? escapeHtml(u.nome) : ''}"></div>
                <div class="form-group" style="margin-bottom:0"><label>E-mail</label><input type="email" id="usr-email" value="${u ? escapeHtml(u.email) : ''}"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
                <div class="form-group" style="margin-bottom:0">
                    <label>Papel</label>
                    <select id="usr-papel" onchange="onPapelUsuarioFormChange()">${papelOptions}</select>
                </div>
                <div class="form-group" style="margin-bottom:0">
                    <label>${editando ? 'Nova senha (opcional)' : 'Senha'}</label>
                    <input type="password" id="usr-senha" placeholder="${editando ? 'Deixe em branco para manter' : 'Defina a senha inicial'}" autocomplete="new-password">
                </div>
            </div>
            ${editando ? `<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:16px;cursor:pointer"><input type="checkbox" id="usr-ativo" ${u.ativo ? 'checked' : ''}> Usuário ativo</label>` : ''}
            <h4 style="margin:0 0 4px;font-size:13px;color:var(--dark)">Permissões por módulo</h4>
            <p style="font-size:12px;color:#8F8F8F;margin:0 0 10px">Por padrão o usuário herda as permissões do papel. Marque "Personalizar" numa linha para sobrescrever só aquele módulo para este usuário.</p>
            <div style="overflow-x:auto">${_matrizUsuarioHTML(papelInicial, u ? u.permissoes_extras : {})}</div>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
                <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn btn-success" onclick="salvarUsuario(${editando ? u.id : 'null'})">Salvar</button>
            </div>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function salvarUsuario(id) {
    const editando = id != null;
    const nome  = document.getElementById('usr-nome')?.value.trim();
    const email = document.getElementById('usr-email')?.value.trim().toLowerCase();
    const senha = document.getElementById('usr-senha')?.value || '';
    const papelId = parseInt(document.getElementById('usr-papel')?.value);
    if (!nome)  { await showAlert('Informe o nome do usuário.', '⚠️'); return; }
    if (!email || !email.includes('@')) { await showAlert('Informe um e-mail válido.', '⚠️'); return; }
    if (!editando && !senha) { await showAlert('Defina a senha inicial do usuário.', '⚠️'); return; }
    const dup = db.usuarios.find(x => x.email.toLowerCase() === email && x.id !== id);
    if (dup) { await showAlert(`Já existe um usuário com o e-mail "${email}".`, '⚠️'); return; }

    const permissoes_extras = _lerMatrizUsuarioForm();

    if (editando) {
        const u = db.usuarios.find(x => x.id === id);
        if (!u) return;
        u.nome = nome; u.email = email; u.papel_id = papelId; u.permissoes_extras = permissoes_extras;
        const ativoEl = document.getElementById('usr-ativo');
        if (ativoEl) u.ativo = ativoEl.checked;
        if (senha) u.senha_hash = await hashSenha(senha);
        salvarERecarregar('Usuário atualizado!');
    } else {
        const novoId = db.usuarios.reduce((m, x) => Math.max(m, x.id), 0) + 1;
        db.usuarios.push({ id: novoId, nome, email, senha_hash: await hashSenha(senha), papel_id: papelId, ativo: true, permissoes_extras });
        salvarERecarregar('Usuário cadastrado!');
    }
}

async function toggleAtivoUsuario(id) {
    const u = db.usuarios.find(x => x.id === id);
    if (!u) return;
    const logado = getUsuarioLogado();
    if (u.ativo && logado && logado.id === u.id) { await showAlert('Você não pode desativar o seu próprio usuário.', '🚫'); return; }
    if (u.ativo) {
        if (!await showConfirm(`Desativar "${u.nome}"? O usuário não conseguirá mais entrar, mas o histórico de registros criados por ele é mantido.`, '🚫', 'Desativar')) return;
    }
    u.ativo = !u.ativo;
    salvarERecarregar(u.ativo ? 'Usuário ativado!' : 'Usuário desativado.');
}

// --- RESPONSÁVEIS: vínculo entre trabalho e conta de acesso ---

// Preenche um <select> com os usuários ativos do sistema.
function preencherSelectUsuarios(selectId, labelVazio, apenasPapeis) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const valorAtual = sel.value;
    const lista = db.usuarios.filter(u => u.ativo).filter(u => {
        if (!apenasPapeis || !apenasPapeis.length) return true;
        const papel = db.papeis.find(p => p.id === u.papel_id);
        return papel && apenasPapeis.includes(papel.nome);
    });
    sel.innerHTML = `<option value="">${escapeHtml(labelVazio || '— Nenhum —')}</option>` +
        lista.map(u => `<option value="${u.id}">${escapeHtml(u.nome)}</option>`).join('');
    if (valorAtual) sel.value = valorAtual;
}

// Nome de exibição de um usuário pelo id (vazio quando não atribuído).
function nomeUsuario(id) {
    if (!id) return '';
    const u = db.usuarios.find(x => x.id === id);
    return u ? u.nome : 'Usuário removido';
}

// Campo de pessoa com texto livre: sugere os usuários ativos, mas aceita um
// nome ainda não cadastrado (ex.: instalador terceirizado).
function htmlCampoPessoa(inputId, valorTexto, placeholder) {
    const lista = db.usuarios.filter(u => u.ativo);
    return `<input type="text" id="${inputId}" list="${inputId}-lista" autocomplete="off" value="${escapeHtml(valorTexto || '')}" placeholder="${escapeHtml(placeholder || 'Selecione ou digite um nome…')}">` +
        `<datalist id="${inputId}-lista">${lista.map(u => `<option value="${escapeHtml(u.nome)}"></option>`).join('')}</datalist>`;
}

// Texto digitado -> { id, nome }. Nome igual ao de um usuário ativo vira o id
// dele (recebe os alertas); qualquer outro texto fica só como nome.
function resolverPessoa(texto) {
    const t = (texto || '').trim();
    if (!t) return { id: null, nome: '' };
    const u = db.usuarios.find(x => x.ativo && (x.nome || '').trim().toLowerCase() === t.toLowerCase());
    return u ? { id: u.id, nome: '' } : { id: null, nome: t };
}

// Quem vai instalar o pedido: usuário do sistema ou nome digitado.
function nomeInstalador(ped) {
    if (!ped) return '';
    return nomeUsuario(ped.usuario_instalacao_id) || ped.instalador_nome || '';
}

function definirInstalador(ped, pessoa) {
    ped.usuario_instalacao_id = pessoa.id || null;
    ped.instalador_nome = pessoa.id ? '' : (pessoa.nome || '');
}

// Conta de acesso do vendedor responsável por um pedido (quando vinculada).
function usuarioDoVendedor(vendedorId) {
    if (!vendedorId) return null;
    const v = db.vendedores.find(x => x.id == vendedorId);
    return v && v.usuario_id ? v.usuario_id : null;
}

// Quem tem visão global dos alertas: quem administra o sistema (acesso ao
// módulo Configurações). Vendedor e instalador têm "Completo" em Pedidos para
// trabalhar, então esse não serve de critério — só o acesso à administração
// separa quem precisa do panorama de quem precisa da própria agenda.
function vePainelCompleto(usuario) {
    return temAcesso('configuracoes', 'visualizar', usuario === undefined ? getUsuarioLogado() : usuario);
}

// O pedido é responsabilidade do usuário logado? (vendedor vinculado,
// instalador designado ou quem criou o pedido).
function pedidoEhMeu(ped, usuario) {
    const u = usuario === undefined ? getUsuarioLogado() : usuario;
    if (!u || !ped) return false;
    return usuarioDoVendedor(ped.vendedor_id) === u.id
        || (ped.arq_id && usuarioDoVendedor(ped.arq_id) === u.id)
        || ped.usuario_instalacao_id === u.id
        || ped.inst_agendado_por === u.id
        || ped.criado_por === u.id;
}

// Responsável pela visita ou quem a agendou.
function medicaoEhMinha(med, usuario) {
    const u = usuario === undefined ? getUsuarioLogado() : usuario;
    if (!u || !med) return false;
    return med.usuario_id === u.id || med.agendado_por === u.id;
}

// Aplica o escopo aos pedidos/medições exibidos em alertas e widgets do painel.
function filtrarPedidosVisiveis(lista) {
    if (vePainelCompleto()) return lista;
    return lista.filter(p => pedidoEhMeu(p));
}

function filtrarMedicoesVisiveis(lista) {
    if (vePainelCompleto()) return lista;
    return lista.filter(m => medicaoEhMinha(m));
}

// Lista os vínculos que impedem a exclusão definitiva de um usuário.
// Só quem nunca foi usado em nenhum registro pode ser excluído — os demais
// devem ser desativados, para não deixar referência quebrada no histórico.
function _vinculosUsuario(id) {
    const v = [];
    const nVend = (db.vendedores || []).filter(x => x.usuario_id === id).length;
    if (nVend) v.push(`${nVend} vendedor(es) vinculado(s) a esta conta`);
    const nMed = (db.medicoes || []).filter(m => m.usuario_id === id).length;
    if (nMed) v.push(`${nMed} medição(ões) atribuída(s)`);
    const nInst = (db.pedidos || []).filter(p => p.usuario_instalacao_id === id).length;
    if (nInst) v.push(`${nInst} instalação(ões) atribuída(s)`);
    const nCriou = (db.pedidos || []).filter(p => p.criado_por === id).length;
    if (nCriou) v.push(`${nCriou} pedido(s) criado(s) por ele`);
    return v;
}

async function excluirUsuario(id) {
    const u = db.usuarios.find(x => x.id === id);
    if (!u) return;
    const logado = getUsuarioLogado();
    if (logado && logado.id === u.id) { await showAlert('Você não pode excluir o seu próprio usuário.', '🚫'); return; }

    const papelAdmin = db.papeis.find(p => p.nome === 'Administrador');
    if (papelAdmin && u.papel_id === papelAdmin.id) {
        const outrosAdmins = db.usuarios.filter(x => x.papel_id === papelAdmin.id && x.ativo && x.id !== u.id).length;
        if (!outrosAdmins) { await showAlert('Este é o único administrador ativo. Promova outro usuário a Administrador antes de excluir este.', '🚫'); return; }
    }

    const vinculos = _vinculosUsuario(id);
    if (vinculos.length) {
        await showAlert(`Não é possível excluir "${u.nome}" porque há registros ligados a ele:\n\n• ${vinculos.join('\n• ')}\n\nPara preservar o histórico, desative o usuário em vez de excluir.`, '🚫');
        return;
    }

    if (!await showConfirm(`Excluir definitivamente o usuário "${u.nome}"?\n\nEsta ação não pode ser desfeita.`, '🗑️', 'Excluir')) return;
    db.usuarios = db.usuarios.filter(x => x.id !== id);
    salvarERecarregar('Usuário excluído.');
}

function renderConfigPapeis() {
    const tb = document.getElementById('tb-papeis');
    if (!tb) return;
    tb.innerHTML = db.papeis.map(p => {
        const n = db.usuarios.filter(u => u.papel_id === p.id).length;
        return `<tr>
            <td><strong>${escapeHtml(p.nome)}</strong></td>
            <td>${n} usuário(s)</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="abrirModalPapel(${p.id})" title="Editar">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirPapel(${p.id})" title="Excluir">🗑️</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td colspan="3" style="text-align:center;color:#999;padding:20px">Nenhum papel cadastrado.</td></tr>';
}

function abrirModalPapel(id) {
    const editando = id != null;
    const p = editando ? db.papeis.find(x => x.id === id) : null;
    if (editando && !p) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:860px">
        <div class="modal-header">
            <h3>${editando ? 'Editar Papel' : 'Novo Papel'}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            <div class="form-group" style="margin-bottom:16px;max-width:320px">
                <label>Nome do papel</label>
                <input type="text" id="papel-nome" value="${p ? escapeHtml(p.nome) : ''}" placeholder="Ex: Financeiro">
            </div>
            <h4 style="margin:0 0 8px;font-size:13px;color:var(--dark)">Matriz de permissões</h4>
            <div style="overflow-x:auto">${_matrizPapelHTML(p ? p.permissoes : null)}</div>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
                <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn btn-success" onclick="salvarPapel(${editando ? p.id : 'null'})">Salvar</button>
            </div>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function salvarPapel(id) {
    const editando = id != null;
    const nome = document.getElementById('papel-nome')?.value.trim();
    if (!nome) { await showAlert('Informe o nome do papel.', '⚠️'); return; }
    const dup = db.papeis.find(x => x.nome.toLowerCase() === nome.toLowerCase() && x.id !== id);
    if (dup) { await showAlert(`Já existe um papel chamado "${nome}".`, '⚠️'); return; }
    const permissoes = _lerMatrizPapelForm();
    if (editando) {
        const papel = db.papeis.find(x => x.id === id);
        if (!papel) return;
        papel.nome = nome; papel.permissoes = permissoes;
        salvarERecarregar('Papel atualizado! Os usuários com este papel (sem permissão personalizada) já refletem a mudança.');
    } else {
        const novoId = db.papeis.reduce((m, x) => Math.max(m, x.id), 0) + 1;
        db.papeis.push({ id: novoId, nome, permissoes });
        salvarERecarregar('Papel cadastrado!');
    }
}

async function excluirPapel(id) {
    const papel = db.papeis.find(x => x.id === id);
    if (!papel) return;
    const usuariosComPapel = db.usuarios.filter(u => u.papel_id === id);
    if (usuariosComPapel.length) {
        await showAlert(`Não é possível excluir "${papel.nome}": ${usuariosComPapel.length} usuário(s) usam este papel (${usuariosComPapel.map(u => u.nome).join(', ')}). Reatribua-os a outro papel antes de excluir.`, '🚫');
        return;
    }
    if (!await showConfirm(`Excluir o papel "${papel.nome}"?`, '🗑️', 'Excluir')) return;
    db.papeis = db.papeis.filter(x => x.id !== id);
    salvarERecarregar('Papel excluído.');
}

function toggleLogoPopup(e) {
    e.stopPropagation();
    const popup = document.getElementById('logo-popup');
    if (!popup) return;
    const opening = !popup.classList.contains('open');
    if (opening) {
        const wrap = document.getElementById('logo-popup-wrap');
        const rect = wrap.getBoundingClientRect();
        popup.style.top  = (rect.bottom + 6) + 'px';
        popup.style.left = rect.left + 'px';
        const u = JSON.parse(sessionStorage.getItem('sc_user') || '{}');
        const el = document.getElementById('popup-user-name');
        if (el) el.textContent = u.nome || u.email || '—';
    }
    popup.classList.toggle('open', opening);
}
document.addEventListener('click', () => {
    const popup = document.getElementById('logo-popup');
    if (popup) popup.classList.remove('open');
});

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- CLIENTES ---
async function salvarCliente() {
    if (!await exigirPermissao('clientes', 'completo')) return;
    const nome  = document.getElementById('cli-nome').value.trim();
    if (!nome) { await showAlert('Digite o nome do cliente', '⚠️'); return; }
    const cpf   = document.getElementById('cli-cpf')?.value.trim()   || '';
    const tel   = document.getElementById('cli-tel')?.value.trim()   || '';
    const email = document.getElementById('cli-email')?.value.trim() || '';
    const end   = document.getElementById('cli-end')?.value.trim()   || '';
    if (cpf) {
        const cpfNorm = cpf.replace(/\D/g, '');
        const dup = db.clientes.find(c => c.cpf && c.cpf.replace(/\D/g, '') === cpfNorm && c.id != editandoIdCliente);
        if (dup) { await showAlert(`CPF já cadastrado.\nCliente existente: ${dup.nome}`, '⚠️'); return; }
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
async function excluirCliente(id) {
    if (!await exigirPermissao('clientes', 'completo')) return;
    const c = db.clientes.find(x => x.id == id);
    if (!c) return;
    const ativos = db.pedidos.filter(p => p.clienteId == id && normalizarStatus(p.status) !== 'Instalado');
    if (ativos.length) { await showAlert(`Não é possível excluir: ${escapeHtml(c.nome)} possui ${ativos.length} pedido(s) ativo(s).`, '🚫'); return; }
    if (!await showConfirm(`Excluir o cliente "${c.nome}"?\nOs pedidos concluídos serão mantidos.`, '🗑️', 'Excluir')) return;
    db.clientes = db.clientes.filter(x => x.id != id);
    salvarERecarregar('Cliente excluído.');
}
function mostrarPedidosCliente(clienteId) {
    const c = db.clientes.find(x => x.id == clienteId);
    if (!c) return;
    const pedidos = db.pedidos.filter(p => p.clienteId == clienteId).sort((a, b) => b.id - a.id);
    const totalFat = pedidos.filter(p => normalizarStatus(p.status) === 'Instalado').reduce((s, p) => s + (p.valor || 0), 0);
    const aRec = pedidos.reduce((s, p) => s + Math.max(0, (p.valor || 0) - (p.valor_recebido || 0)), 0);
    const POR_PAG = 8;
    let pag = 0;
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
            <tbody id="cli-ped-tbody"></tbody></table>
        </div>
        <div id="cli-ped-pag" style="display:flex;justify-content:center;align-items:center;gap:10px;padding:10px 0 2px"></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    const tbody = overlay.querySelector('#cli-ped-tbody');
    const pagEl = overlay.querySelector('#cli-ped-pag');
    function render() {
        const totalPags = Math.ceil(pedidos.length / POR_PAG);
        const inicio = pag * POR_PAG;
        tbody.innerHTML = pedidos.slice(inicio, inicio + POR_PAG).map(p => {
            const cls = COR_STATUS[normalizarStatus(p.status)] || 'st-orcamento';
            const pagto = statusPagamento(p);
            return `<tr style="cursor:pointer" onclick="this.closest('.modal-overlay').remove();editarPedido(${p.id})" onmouseover="this.style.background='#EDF5FC'" onmouseout="this.style.background=''">
                <td style="font-size:12px;color:var(--primary);font-weight:600">#${formatPedidoId(p.id)}</td>
                <td style="font-size:13px">${escapeHtml(p.amb || '—')}</td>
                <td>R$ ${(p.valor||0).toFixed(2)} ${pagto.cls ? `<span class="${pagto.cls}">${pagto.label}</span>` : ''}</td>
                <td><span class="status-tag ${cls}" style="font-size:11px">${normalizarStatus(p.status)}</span></td>
                <td style="font-size:12px;color:#8F8F8F">${p.data_entrega ? new Date(p.data_entrega+'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="5" style="text-align:center;color:#999;padding:16px">Nenhum pedido.</td></tr>';
        pagEl.innerHTML = '';
        if (totalPags <= 1) return;
        const btnPrev = document.createElement('button');
        btnPrev.className = 'btn btn-outline btn-sm'; btnPrev.textContent = '‹ Anterior'; btnPrev.disabled = pag === 0;
        btnPrev.onclick = () => { pag--; render(); };
        const info = document.createElement('span');
        info.style.cssText = 'font-size:13px;color:#8F8F8F'; info.textContent = `${pag + 1} / ${totalPags}`;
        const btnNext = document.createElement('button');
        btnNext.className = 'btn btn-outline btn-sm'; btnNext.textContent = 'Próximo ›'; btnNext.disabled = pag >= totalPags - 1;
        btnNext.onclick = () => { pag++; render(); };
        pagEl.append(btnPrev, info, btnNext);
    }
    render();
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
    const podeEditar = temAcesso('clientes', 'completo');
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
                ${podeEditar ? `<button class="btn btn-outline btn-sm" onclick="editarCliente(${c.id})">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirCliente(${c.id})">🗑️</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

// --- CATÁLOGO ---
function _resizeImageBase64(file, maxDim) {
    maxDim = maxDim || 240;
    return new Promise(function(resolve) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(img.width  * ratio);
                canvas.height = Math.round(img.height * ratio);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
function previewFotoCatalogo(input) {
    const file = input.files[0];
    const preview = document.getElementById('cat-foto-preview');
    if (!file || !preview) return;
    _resizeImageBase64(file).then(function(base64) {
        preview.innerHTML = `<img src="${base64}" style="max-width:120px;max-height:80px;border-radius:6px;border:1px solid #E0E0E0;margin-top:6px">`;
        preview.dataset.base64 = base64;
    });
}
async function salvarCatalogo() {
    const nome = document.getElementById('cat-nome').value.trim();
    const largura_rolo = parseFloat(document.getElementById('cat-largura').value) || 2.80;
    const referencia = document.getElementById('cat-ref')?.value.trim() || '';
    const min_estoque = parseFloat(document.getElementById('cat-min').value) || 0;
    if (!nome) { await showAlert('Preencha o nome do tecido', '⚠️'); return; }
    const forn_id_cat  = parseInt(document.getElementById('cat-fornecedor')?.value) || null;
    const forn_obj_cat = forn_id_cat ? db.fornecedores.find(f => f.id === forn_id_cat) : null;
    if (editandoCatalogoId !== null) {
        const c = db.catalogo.find(x => x.id == editandoCatalogoId);
        if (c) {
            const preco = parseFloat(document.getElementById('cat-preco')?.value) || c.preco || 0;
            const dupNome = db.catalogo.find(x => x.id != editandoCatalogoId && x.nome.trim().toLowerCase() === nome.toLowerCase());
            if (dupNome) { await showAlert(`Já existe outro tecido com o nome "${dupNome.nome}".`, '⚠️'); return; }
            if (referencia) {
                const dupRef = db.catalogo.find(x => x.id != editandoCatalogoId && x.referencia && x.referencia.toLowerCase() === referencia.toLowerCase());
                if (dupRef) { await showAlert(`Código "${referencia}" já usado por "${dupRef.nome}".`, '⚠️'); return; }
            }
            const novaImg = document.getElementById('cat-foto-preview')?.dataset.base64 || '';
            // O controle de estoque tambem e' editavel: sem isto, um tecido
            // que entrou como infinito ficava infinito para sempre, embora a
            // tela mostrasse "Ajustar estoque".
            const eraInfinito = temEstoqueInfinito(c);
            const ficaInfinito = _catEstado.estoqueModo === 'infinito';
            if (eraInfinito && !ficaInfinito) {
                const ok = await showConfirm(
                    `"${c.nome}" passa a ter estoque controlado.\n\nO saldo infinito será apagado e o tecido fica zerado até você dar entrada nele.`,
                    '📦', 'Zerar e controlar', 'Cancelar');
                if (!ok) return;
                if (limparSaldoDeFachadaDoTecido(c.id)) {
                    registrarMovimento('Saída', c.nome, 'tecido', 0, 'm', 'Passou a ter estoque controlado');
                }
            }
            if (!eraInfinito && ficaInfinito && !db.estoque.some(r => r.tecido_id == c.id && _ehSaldoDeFachada(r))) {
                db.estoque.push({
                    id: Date.now() + 1, tecido_id: c.id, lote: 'ESTOQUE INFINITO',
                    metragem_inicial: METRAGEM_INFINITA, metragem_atual: METRAGEM_INFINITA,
                    data_entrada: new Date().toISOString().slice(0, 10)
                });
                registrarMovimento('Entrada', c.nome, 'tecido', METRAGEM_INFINITA, 'm', 'Passou a ter estoque infinito');
            }
            Object.assign(c, { nome, preco, largura_rolo, referencia, min_estoque: ficaInfinito ? 0 : min_estoque, estoque_infinito: ficaInfinito, fornecedor_id: forn_id_cat, fornecedor_nome: forn_obj_cat ? forn_obj_cat.nome : '', imagem: novaImg || c.imagem || '' });
        }
        editandoCatalogoId = null;
        const precoGroup = document.getElementById('cat-preco-group');
        if (precoGroup) precoGroup.style.display = 'none';
        salvarERecarregar('Tecido atualizado!');
    } else {
        const dup = db.catalogo.find(c => c.nome.trim().toLowerCase() === nome.toLowerCase());
        if (dup) { await showAlert(`Já existe um tecido com o nome "${dup.nome}" no catálogo.`, '⚠️'); return; }
        if (referencia) {
            const dupRef = db.catalogo.find(c => c.referencia && c.referencia.toLowerCase() === referencia.toLowerCase());
            if (dupRef) { await showAlert(`Código "${referencia}" já usado por "${dupRef.nome}".`, '⚠️'); return; }
        }
        if (_catEstado.margemModo === 'total' && _catEstado.markup === null) {
            await showAlert('Informe a margem total (%) ou escolha “Definir margem depois”.', '⚠️');
            return;
        }
        const custo = parseFloat(document.getElementById('cat-custo')?.value) || 0;
        const custoPeca = parseFloat(document.getElementById('cat-custo-peca')?.value);
        const qtd = parseFloat(document.getElementById('cat-qtd')?.value) || 0;
        const infinito = _catEstado.estoqueModo === 'infinito';
        const novaImgCad = document.getElementById('cat-foto-preview')?.dataset.base64 || '';
        const id = Date.now();
        db.catalogo.push({
            id, nome, largura_rolo, referencia,
            min_estoque: _cfgMinimo(_catEstado, min_estoque),
            preco_custo: custo,
            // Venda sai do custo POR METRO. O custo de corte por peça é
            // registro da tabela do fornecedor: nenhuma margem incide nele.
            preco: _cfgVenda(_catEstado, custo) || 0,
            preco_peca: isFinite(custoPeca) ? custoPeca : null,
            preco_corte: custo || null,
            estoque_infinito: infinito,
            fornecedor_id: forn_id_cat,
            fornecedor_nome: forn_obj_cat ? forn_obj_cat.nome : '',
            imagem: novaImgCad
        });
        // Entrada de estoque junto com o cadastro: o lote é o próprio código.
        // Tecido infinito ganha o rolo mesmo sem quantidade, senão ele não
        // apareceria na aba Estoque — a lista pula tecido sem rolo.
        const metros = infinito ? METRAGEM_INFINITA : qtd;
        if (metros > 0) {
            const hoje = new Date().toISOString().slice(0, 10);
            db.estoque.push({
                id: id + 1, tecido_id: id,
                lote: infinito ? 'ESTOQUE INFINITO' : (referencia || 'CADASTRO'),
                metragem_inicial: metros, metragem_atual: metros, data_entrada: hoje
            });
            registrarMovimento('Entrada', nome, 'tecido', metros, 'm',
                infinito ? 'Cadastro — estoque infinito' : 'Cadastro manual');
        }
        salvarERecarregar('Tecido cadastrado no catálogo!');
    }
}

function verDetalhesTecido(id) {
    const c = db.catalogo.find(x => x.id == id);
    if (!c) return;
    const disp = estoqueDisponivel(c.id);
    const rolos = db.estoque.filter(r => r.tecido_id == c.id);
    const rolosAtivos = rolos.filter(r => r.metragem_atual > 0);
    const rolosEsgotados = rolos.filter(r => !(r.metragem_atual > 0));
    const abaixoMin = !temEstoqueInfinito(c) && c.min_estoque > 0 && disp < c.min_estoque;
    const pedidosAtivos = db.pedidos.filter(p => {
        if (normalizarStatus(p.status) === 'Instalado' || normalizarStatus(p.status) === 'Orçamento') return false;
        return normalizarAmbientes(p).some(a => (a.tecidos || []).some(t => t.tecidoId == id));
    });

    const rolosHtml = rolosAtivos.length
        ? rolosAtivos.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#FAFAFA;border-radius:6px;margin-bottom:4px;font-size:13px">
            <span style="color:var(--dark)">${escapeHtml(r.lote || '—')}</span>
            <strong>${r.metragem_atual.toFixed(2)} m</strong>
          </div>`).join('')
        : '<p style="color:#8F8F8F;font-size:13px;margin:4px 0">Nenhum rolo em estoque.</p>';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:560px">
        <div class="modal-header">
            <div>
                ${c.referencia ? `<span style="font-size:13px;color:#8F8F8F;display:block">Código ${escapeHtml(c.referencia)}</span>` : ''}
                <h3 style="margin-bottom:2px">${escapeHtml(c.nome)}</h3>
            </div>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body" style="padding-top:0">
            ${c.imagem ? `<div style="text-align:center;margin-bottom:18px;background:#F1F1F1;border-radius:10px;padding:12px">
                <img src="${c.imagem}" style="max-width:100%;max-height:300px;border-radius:8px;object-fit:contain;box-shadow:0 2px 8px rgba(0,0,0,.10)">
            </div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">
                <div style="background:#FAFAFA;border-radius:8px;padding:10px 14px">
                    <div style="font-size:11px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Preço de Venda</div>
                    <div style="font-size:17px;font-weight:700;color:var(--primary)">R$ ${c.preco.toFixed(2)}<span style="font-size:13px;font-weight:400;color:#8F8F8F">/m</span></div>
                </div>
                <div style="background:#FAFAFA;border-radius:8px;padding:10px 14px">
                    <div style="font-size:11px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Em Estoque</div>
                    <div style="font-size:17px;font-weight:700;color:${abaixoMin ? '#F43927' : '#159912'}">${temEstoqueInfinito(c) ? '∞' : disp.toFixed(2) + ' m'} ${abaixoMin ? '<span style="font-size:12px">⚠ Abaixo do mínimo</span>' : ''}</div>
                </div>
                <div style="background:#FAFAFA;border-radius:8px;padding:10px 14px">
                    <div style="font-size:11px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Largura do Rolo</div>
                    <div style="font-size:14px;font-weight:600">${(c.largura_rolo || 2.80).toFixed(2)} m</div>
                </div>
                <div style="background:#FAFAFA;border-radius:8px;padding:10px 14px">
                    <div style="font-size:11px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Estoque Mínimo</div>
                    <div style="font-size:14px;font-weight:600">${textoMinimo(c, 'm')}</div>
                </div>
                ${(c.preco_corte || c.preco_peca) ? `<div style="background:#FAFAFA;border-radius:8px;padding:10px 14px;grid-column:1/-1">
                    <div style="font-size:11px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Preços da tabela do fornecedor</div>
                    <div style="font-size:14px;font-weight:600">
                        Corte: ${c.preco_corte ? 'R$ ' + Number(c.preco_corte).toFixed(2) : '—'}
                        &emsp;Peça: ${c.preco_peca ? 'R$ ' + Number(c.preco_peca).toFixed(2) : '—'}
                    </div>
                    <div style="font-size:11px;color:#8F8F8F;margin-top:2px">Registro da tabela, sem margem aplicada.</div>
                </div>` : ''}
                ${c.fornecedor_nome ? `<div style="background:#FAFAFA;border-radius:8px;padding:10px 14px;grid-column:1/-1">
                    <div style="font-size:11px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Fornecedor</div>
                    <div style="font-size:14px;font-weight:500">${escapeHtml(c.fornecedor_nome)}</div>
                </div>` : ''}
            </div>
            ${pedidosAtivos.length ? `<div style="margin-bottom:14px">
                <div style="font-size:12px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Em produção (${pedidosAtivos.length} pedido(s))</div>
                ${pedidosAtivos.map(p => `<div style="font-size:13px;padding:4px 0;color:var(--dark)">#${formatPedidoId(p.id)} · ${escapeHtml(p.clienteNome||'—')} · <span class="status-tag ${COR_STATUS[normalizarStatus(p.status)]||''}" style="font-size:11px">${normalizarStatus(p.status)}</span></div>`).join('')}
            </div>` : ''}
            <div>
                <div style="font-size:12px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Rolos em Estoque (${rolosAtivos.length} rolo(s) · ${rolosEsgotados.length} esgotado(s))</div>
                ${rolosHtml}
            </div>
        </div>
        <div style="display:flex;gap:8px;padding:12px 20px;border-top:1px solid var(--border);justify-content:flex-end">
            <button class="btn btn-outline btn-sm" onclick="editarCatalogo(${c.id});this.closest('.modal-overlay').remove()">✏️ Editar</button>
            <button class="btn btn-outline btn-sm" onclick="pedirTecido(${c.id})">🛒 Pedir Tecido</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function autoFillCatalogoPorReferencia() {
    const ref = document.getElementById('cat-ref')?.value.trim();
    if (!ref) return;
    const existing = db.catalogo.find(c => c.referencia && c.referencia.toLowerCase() === ref.toLowerCase());
    if (!existing) return;
    document.getElementById('cat-nome').value = existing.nome || '';
    document.getElementById('cat-largura').value = existing.largura_rolo || 2.80;
    document.getElementById('cat-min').value = existing.min_estoque || 0;
    const fornSel = document.getElementById('cat-fornecedor');
    if (fornSel && existing.fornecedor_id) fornSel.value = existing.fornecedor_id;
}

// Pedido de venda ainda aberto que consome este tecido, ou null. Um tecido
// nesta situacao nao pode sair do catalogo: a exclusao em massa usa a mesma
// regra da exclusao individual.
function pedidoQueUsaTecido(id) {
    return db.pedidos.find(p => {
        if (normalizarStatus(p.status) === 'Instalado') return false;
        return normalizarAmbientes(p).some(a => (a.tecidos||[]).some(t => t.tecidoId == id));
    }) || null;
}

// "TRICÔ HERA — pedido #0012 (Maria)", para listar o que ficou de fora.
function _motivoTecidoEmUso(c, pedido) {
    const cli = db.clientes.find(x => x.id == pedido.clienteId);
    return `• ${c.nome} — pedido #${formatPedidoId(pedido.id)} (${cli?.nome || 'cliente'})`;
}

async function excluirCatalogo(id) {
    const emUso = pedidoQueUsaTecido(id);
    if (emUso) {
        const cli = db.clientes.find(c => c.id == emUso.clienteId);
        await showAlert(`Não é possível remover: este tecido está em uso no pedido #${formatPedidoId(emUso.id)} (${cli?.nome || 'cliente'}).`, '🚫'); return;
    }
    if (!await showConfirm('Remover este tecido do catálogo?', '🗑️', 'Remover')) return;
    db.catalogo = db.catalogo.filter(c => c.id != id);
    catSelecao.tecido.delete(Number(id));
    salvarERecarregar('Tecido removido.');
}

// ═══════════════════════════════════════════════════════════════════════
// CATÁLOGO — ordenação, filtros e seleção em massa
// ═══════════════════════════════════════════════════════════════════════

const catSortState = _lerOrdenacao('tecido', { col: 'nome', dir: 1 });

// Ids marcados em cada aba. Como a marcacao e por id e nao por linha, ela
// sobrevive a ordenar e a filtrar. Some ao recarregar a pagina, de proposito:
// selecao e coisa do momento, nao estado salvo.
const catSelecao = { tecido: new Set(), material: new Set() };

// Ids que a ultima renderizacao deixou na tela. "Marcar todos" age sobre
// estes, isto e, sobre o que o filtro atual mostra.
const catVisiveis = { tecido: [], material: [] };

const _CAT_ROTULO = {
    tecido:   { um: 'tecido',   varios: 'tecidos'   },
    material: { um: 'material', varios: 'materiais' }
};

function valorOrdenacaoTecido(c, col) {
    switch (col) {
        case 'preco':      return c.preco || 0;
        case 'largura':    return c.largura_rolo || 2.80;
        case 'minimo':     return temEstoqueInfinito(c) ? -1 : (c.min_estoque || 0);
        case 'estoque':    return temEstoqueInfinito(c) ? Infinity : estoqueDisponivel(c.id);
        case 'referencia': return (c.referencia || '').toLowerCase();
        case 'fornecedor': return (c.fornecedor_nome || '').toLowerCase();
        // So a tabela do Estoque tem estas duas; no Catalogo elas nunca sao
        // escolhidas, mas o estado da ordenacao e' o mesmo nas duas telas.
        case 'unidade':    return 'm';
        case 'rolos':      return db.estoque.filter(r => r.tecido_id == c.id).length;
        default:           return (c.nome || '').toLowerCase();
    }
}

// Usado pela tabela do catalogo e pela do estoque, para que as duas ordenem
// igual em qualquer coluna.
function valorOrdenacaoMaterial(m, col) {
    switch (col) {
        case 'preco':      return m.preco || 0;
        case 'estoque':    return m.estoque_atual || 0;
        case 'referencia': return (m.referencia || '').toLowerCase();
        case 'unidade':    return (m.unidade || '').toLowerCase();
        case 'fornecedor': return (m.fornecedor_nome || '').toLowerCase();
        default:           return (m.nome || '').toLowerCase();
    }
}

// Kits ordenam pelas colunas da lista do Estoque. O estado e' um so para as
// duas tabelas de kit, como ja acontece com tecidos e materiais.
const kitSortState = _lerOrdenacao('kit', { col: 'nome', dir: 1 });

function valorOrdenacaoKit(k, col) {
    const pronto = ehKitPronto(k);
    switch (col) {
        case 'referencia': return (k.referencia || '').toLowerCase();
        case 'unidade':    return 'un';
        case 'medida':     return (k.medida || '').toLowerCase();
        case 'preco':      return pronto ? (k.preco || 0) : -1;
        case 'estoque':    return temEstoqueInfinito(k) ? Infinity : (pronto ? (k.estoque_atual || 0) : -1);
        // Kit de montagem ordena pela quantidade de componentes; o pronto, que
        // nao tem composicao, fica junto no inicio.
        case 'composicao': return pronto ? -1 : (k.itens || []).length;
        default:           return (k.nome || '').toLowerCase();
    }
}

function ordenarLista(lista, estado, valorDe) {
    return [...lista].sort((a, b) => {
        const va = valorDe(a, estado.col), vb = valorDe(b, estado.col);
        return va < vb ? -estado.dir : va > vb ? estado.dir : 0;
    });
}

// Marca a coluna ativa e vira a seta. O cabecalho e HTML estatico; so os
// icones e a classe mudam, para nao remontar a tabela inteira.
function pintarCabecalhoOrdenacao(seletorTabela, estado) {
    document.querySelectorAll(`${seletorTabela} th[data-col]`).forEach(th => {
        const ativo = th.dataset.col === estado.col;
        th.classList.toggle('th-sort-mat-ativo', ativo);
        const icone = th.querySelector('.sort-icon');
        if (icone) icone.textContent = ativo ? (estado.dir === 1 ? '▲' : '▼') : '⇅';
    });
}

function _catTxt(id) { return (document.getElementById(id)?.value || '').trim().toLowerCase(); }
function _catNum(id) {
    const v = parseFloat(document.getElementById(id)?.value);
    return isNaN(v) ? null : v;
}

// Fornecedor do filtro: '' = todos, '__sem__' = os que nao tem fornecedor.
function _catCasaFornecedor(item, escolha) {
    if (!escolha) return true;
    if (escolha === '__sem__') return !item.fornecedor_id;
    return String(item.fornecedor_id || '') === escolha;
}

function _catCasaPreco(preco, min, max) {
    if (min !== null && preco < min) return false;
    if (max !== null && preco > max) return false;
    return true;
}

function _catCasaBusca(item, termo) {
    if (!termo) return true;
    return (item.nome || '').toLowerCase().includes(termo)
        || (item.referencia || '').toLowerCase().includes(termo);
}

function filtrarTecidos(lista) {
    const termo = _catTxt('f-tec-busca');
    const forn  = document.getElementById('f-tec-forn')?.value || '';
    const larg  = document.getElementById('f-tec-largura')?.value || '';
    const pmin  = _catNum('f-tec-pmin'), pmax = _catNum('f-tec-pmax');
    return lista.filter(c =>
        _catCasaBusca(c, termo) &&
        _catCasaFornecedor(c, forn) &&
        (!larg || (c.largura_rolo || 2.80).toFixed(2) === larg) &&
        _catCasaPreco(c.preco || 0, pmin, pmax)
    );
}

function filtrarMateriais(lista) {
    const termo = _catTxt('f-mat-busca');
    const forn  = document.getElementById('f-mat-forn')?.value || '';
    const pmin  = _catNum('f-mat-pmin'), pmax = _catNum('f-mat-pmax');
    return lista.filter(m =>
        _catCasaBusca(m, termo) &&
        _catCasaFornecedor(m, forn) &&
        _catCasaPreco(m.preco || 0, pmin, pmax)
    );
}

// Repovoa um select preservando o que ja estava escolhido.
function _catPreencherSelect(id, opcoes) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const anterior = sel.value;
    const fixa = sel.options[0] ? sel.options[0].outerHTML : '';
    sel.innerHTML = fixa + opcoes.map(o => `<option value="${escapeHtml(o.valor)}">${escapeHtml(o.rotulo)}</option>`).join('');
    if ([...sel.options].some(o => o.value === anterior)) sel.value = anterior;
}

// Opcoes de fornecedor tiradas do que realmente existe na lista.
function _catOpcoesFornecedor(lista) {
    const vistos = new Map();
    let temSem = false;
    lista.forEach(it => {
        if (it.fornecedor_id) vistos.set(String(it.fornecedor_id), it.fornecedor_nome || 'Fornecedor ' + it.fornecedor_id);
        else temSem = true;
    });
    const ops = [...vistos].map(([valor, rotulo]) => ({ valor, rotulo }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
    if (temSem) ops.push({ valor: '__sem__', rotulo: '— Sem fornecedor —' });
    return ops;
}

function limparFiltrosTecidos() {
    ['f-tec-busca', 'f-tec-pmin', 'f-tec-pmax'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    ['f-tec-forn', 'f-tec-largura'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    renderCatalogoTecidos();
}

function limparFiltrosMateriais() {
    ['f-mat-busca', 'f-mat-pmin', 'f-mat-pmax'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    const f = document.getElementById('f-mat-forn'); if (f) f.value = '';
    renderMateriais();
}

function sortTecidos(col) {
    if (catSortState.col === col) catSortState.dir *= -1;
    else { catSortState.col = col; catSortState.dir = 1; }
    _gravarOrdenacao('tecido', catSortState);
    // As duas telas compartilham a ordenacao. Cada render sai na hora se a
    // sua tabela nao esta na pagina, entao chamar os dois e' barato.
    renderCatalogoTecidos();
    renderEstoque();
}

function renderCatalogoTecidos() {
    const tb = document.getElementById('tb-catalogo');
    if (!tb) return;

    _catPreencherSelect('f-tec-forn', _catOpcoesFornecedor(db.catalogo));
    const larguras = [...new Set(db.catalogo.map(c => (c.largura_rolo || 2.80).toFixed(2)))].sort((a, b) => a - b);
    _catPreencherSelect('f-tec-largura', larguras.map(l => ({ valor: l, rotulo: l + ' m' })));

    const lista = ordenarLista(filtrarTecidos(db.catalogo), catSortState, valorOrdenacaoTecido);
    catVisiveis.tecido = lista.map(c => c.id);
    pintarCabecalhoOrdenacao('#tabela-tecidos', catSortState);

    const cont = document.getElementById('f-tec-contagem');
    if (cont) cont.textContent = lista.length === db.catalogo.length
        ? `${db.catalogo.length} tecido(s)`
        : `${lista.length} de ${db.catalogo.length} tecido(s)`;

    tb.innerHTML = lista.map(c => {
        const disp    = estoqueDisponivel(c.id);
        const dispTxt = textoSaldoTecido(c);
        const alertMin = !temEstoqueInfinito(c) && c.min_estoque > 0 && disp < c.min_estoque ? `<span class="badge-alerta" style="margin-left:6px">⚠</span>` : '';
        const thumb = c.imagem ? `<img src="${c.imagem}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;margin-right:7px;vertical-align:middle;border:1px solid #E0E0E0">` : '';
        const nomeClick = `<span style="cursor:pointer;color:var(--primary);font-weight:500;text-decoration:underline dotted" onclick="verDetalhesTecido(${c.id})" title="Ver detalhes">${escapeHtml(c.nome)}</span>`;
        const marcado = catSelecao.tecido.has(c.id);
        return `<tr class="${marcado ? 'cat-linha-marcada' : ''}">
            <td class="cat-col-check"><input type="checkbox"${marcado ? ' checked' : ''} onchange="alternarSelecao('tecido',${c.id},this)"></td>
            <td class="col-codigo" title="${escapeHtml(c.referencia || '')}">${escapeHtml(c.referencia || '—')}</td>
            <td class="col-nome" title="${escapeHtml(c.nome)}">${thumb}${nomeClick}</td>
            <td class="col-num">${(c.largura_rolo || 2.80).toFixed(2)} m</td>
            <td class="col-num">${dispTxt}${alertMin}</td>
            <td class="col-num">${textoMinimo(c, 'm')}</td>
            <td class="col-num">R$ ${(c.preco || 0).toFixed(2)}</td>
            <td class="col-forn" title="${escapeHtml(c.fornecedor_nome || '')}">${escapeHtml(c.fornecedor_nome || '—')}</td>
            <td class="col-acoes">
                <button class="btn btn-outline btn-sm" onclick="editarCatalogo(${c.id})" title="Editar">✏️</button>
                <button class="btn btn-outline btn-sm" onclick="pedirTecido(${c.id})" title="Criar pedido de compra">🛒</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirCatalogo(${c.id})" title="Remover do catálogo">🗑️</button>
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="9" style="text-align:center;color:#999;padding:20px;">${db.catalogo.length ? 'Nenhum tecido com esses filtros.' : 'Catálogo vazio.'}</td></tr>`;

    atualizarBarraSelecao('tecido');
}

// ─── Seleção ────────────────────────────────────────────────────────────

function alternarSelecao(tipo, id, caixa) {
    if (caixa.checked) catSelecao[tipo].add(Number(id));
    else catSelecao[tipo].delete(Number(id));
    caixa.closest('tr')?.classList.toggle('cat-linha-marcada', caixa.checked);
    atualizarBarraSelecao(tipo);
}

function marcarTodosVisiveis(tipo, marcado) {
    catVisiveis[tipo].forEach(id => {
        if (marcado) catSelecao[tipo].add(Number(id));
        else catSelecao[tipo].delete(Number(id));
    });
    if (tipo === 'tecido') renderCatalogoTecidos(); else renderMateriais();
}

function limparSelecao(tipo) {
    catSelecao[tipo].clear();
    if (tipo === 'tecido') renderCatalogoTecidos(); else renderMateriais();
}

function atualizarBarraSelecao(tipo) {
    const pre = tipo === 'tecido' ? 'tec' : 'mat';
    const n   = catSelecao[tipo].size;

    const barra = document.getElementById(`sel-${pre}-barra`);
    if (barra) barra.style.display = n ? '' : 'none';

    // Quantos marcados o filtro atual esconde. Sem esse aviso o usuario
    // excluiria ou pediria itens que nao estao na tela.
    const ocultos = [...catSelecao[tipo]].filter(id => !catVisiveis[tipo].includes(id)).length;
    const rotulo = document.getElementById(`sel-${pre}-qtd`);
    if (rotulo) rotulo.textContent = `${n} marcado(s)` + (ocultos ? ` (${ocultos} fora do filtro)` : '');

    const todos = document.getElementById(`chk-${pre}-todos`);
    if (todos) {
        const vis = catVisiveis[tipo];
        todos.checked = vis.length > 0 && vis.every(id => catSelecao[tipo].has(id));
        todos.indeterminate = !todos.checked && vis.some(id => catSelecao[tipo].has(id));
    }
}

// ─── Exclusão em massa ──────────────────────────────────────────────────

async function excluirSelecionados(tipo) {
    const ids = [...catSelecao[tipo]];
    if (!ids.length) return;
    if (tipo === 'tecido') await _excluirTecidosSelecionados(ids);
    else await _excluirMateriaisSelecionados(ids);
}

async function _excluirTecidosSelecionados(ids) {
    const podem = [], bloqueados = [];
    ids.forEach(id => {
        const c = db.catalogo.find(x => x.id == id);
        if (!c) return;
        const uso = pedidoQueUsaTecido(id);
        if (uso) bloqueados.push(_motivoTecidoEmUso(c, uso));
        else podem.push(c.id);
    });

    if (!podem.length) {
        await showAlert(`Nenhum dos ${bloqueados.length} tecidos marcados pode ser removido — todos estão em pedidos:\n\n${bloqueados.join('\n')}`, '🚫');
        return;
    }
    const aviso = bloqueados.length
        ? `\n\n${bloqueados.length} será(ão) mantido(s) por estar(em) em pedidos:\n${bloqueados.join('\n')}`
        : '';
    if (!await showConfirm(`Remover ${podem.length} tecido(s) do catálogo?${aviso}`, '🗑️', 'Remover')) return;

    const fora = new Set(podem.map(String));
    db.catalogo = db.catalogo.filter(c => !fora.has(String(c.id)));
    catSelecao.tecido.clear();
    salvarERecarregar(`${podem.length} tecido(s) removido(s).` + (bloqueados.length ? ` ${bloqueados.length} mantido(s).` : ''));
}

async function _excluirMateriaisSelecionados(ids) {
    const nomes = ids.map(id => db.materiais.find(m => m.id == id)).filter(Boolean).map(m => `• ${m.nome}`);
    if (!nomes.length) return;
    if (!await showConfirm(`Remover ${nomes.length} material(is)? Kits que os utilizam serão afetados.\n\n${nomes.join('\n')}`, '🗑️', 'Remover')) return;

    const fora = new Set(ids.map(String));
    db.materiais = db.materiais.filter(m => !fora.has(String(m.id)));
    db.kits.forEach(k => { k.itens = k.itens.filter(i => !fora.has(String(i.materialId))); });
    catSelecao.material.clear();
    salvarERecarregar(`${nomes.length} material(is) removido(s).`);
}

// ─── Pedido de compra a partir da seleção ───────────────────────────────

// Converte um item do cadastro em linha de pedido de compra. Os campos de
// fornecedor so servem para agrupar aqui; salvarPedidoCompra os descarta.
function itemParaPedido(tipo, id) {
    if (tipo === 'tecido') {
        const c = db.catalogo.find(x => x.id == id);
        if (!c) return null;
        const preco_unit = ultimoPrecoTecido(c.id);
        return {
            tipo: 'tecido', item_id: c.id, item_nome: c.nome, referencia: c.referencia || '',
            unidade: 'm', preco_unit, quantidade: 1, subtotal: preco_unit,
            fornecedor_id: c.fornecedor_id || null, fornecedor_nome: c.fornecedor_nome || ''
        };
    }
    const m = db.materiais.find(x => x.id == id);
    if (!m) return null;
    const preco = m.preco || 0;
    return {
        tipo: 'material', item_id: m.id, item_nome: m.nome, referencia: m.referencia || '',
        unidade: m.unidade, preco_unit: preco, quantidade: 1, subtotal: preco,
        fornecedor_id: m.fornecedor_id || null, fornecedor_nome: m.fornecedor_nome || ''
    };
}

function agruparPorFornecedor(itens) {
    const mapa = new Map();
    itens.forEach(i => {
        const chave = String(i.fornecedor_id || '');
        if (!mapa.has(chave)) {
            mapa.set(chave, {
                fornecedor_id: i.fornecedor_id || null,
                fornecedor_nome: i.fornecedor_nome || 'Sem fornecedor',
                itens: []
            });
        }
        mapa.get(chave).itens.push(i);
    });
    return [...mapa.values()];
}

// Guarda os itens e manda para o formulario de pedido de compra.
// fornId: id do fornecedor, 0 para pedido genérico, '' para o usuário escolher.
function enviarParaFormularioPC(itens, fornId) {
    localStorage.setItem('sc_pc_prefill', JSON.stringify(itens));
    localStorage.setItem('sc_pc_prefill_forn', String(fornId));
    window.location.href = 'fornecedores.html?tab=novo';
}

function lerFilaPC() {
    try {
        const f = JSON.parse(localStorage.getItem('sc_pc_fila') || 'null');
        return f && Array.isArray(f.restantes) && f.restantes.length ? f : null;
    } catch { return null; }
}

// Um pedido por fornecedor, feitos um de cada vez no formulario. A fila fica
// no localStorage porque salvarPedidoCompra recarrega a pagina a cada gravacao.
function criarFilaDePedidos(grupos) {
    localStorage.setItem('sc_pc_fila', JSON.stringify({ total: grupos.length, feitos: 0, restantes: grupos }));
    const primeiro = grupos[0];
    enviarParaFormularioPC(primeiro.itens, primeiro.fornecedor_id || 0);
}

async function iniciarPedidoDeCompra(itens) {
    if (!itens.length) return;
    localStorage.removeItem('sc_pc_fila');
    const grupos = agruparPorFornecedor(itens);

    // Um fornecedor só (ou nenhum item com fornecedor): vai direto.
    if (grupos.length === 1) {
        enviarParaFormularioPC(itens, grupos[0].fornecedor_id || '');
        return;
    }

    const resumo = grupos.map(g => `• ${g.fornecedor_nome}: ${g.itens.length} item(ns)`).join('\n');
    const escolha = await showEscolha(
        `Os ${itens.length} produtos marcados são de ${grupos.length} fornecedores diferentes:\n\n${resumo}\n\nComo você quer criar o pedido?`,
        '🛒',
        [
            { rotulo: 'Um pedido para cada fornecedor', valor: 'separados', destaque: true },
            { rotulo: 'Tudo para um fornecedor só (você escolhe)', valor: 'um' },
            { rotulo: 'Pedido genérico, sem fornecedor (orçamento)', valor: 'generico' }
        ]
    );
    if (!escolha) return;
    if (escolha === 'separados')     criarFilaDePedidos(grupos);
    else if (escolha === 'um')       enviarParaFormularioPC(itens, '');
    else                             enviarParaFormularioPC(itens, 0);
}

function pedidoDaSelecao(tipo) {
    const itens = [...catSelecao[tipo]].map(id => itemParaPedido(tipo, id)).filter(Boolean);
    iniciarPedidoDeCompra(itens);
}

function editarCatalogo(id) {
    const c = db.catalogo.find(x => x.id == id);
    if (!c) return;
    editandoCatalogoId = id;
    document.getElementById('cat-ref').value = c.referencia || '';
    document.getElementById('cat-nome').value = c.nome || '';
    document.getElementById('cat-largura').value = c.largura_rolo || 2.80;
    document.getElementById('cat-min').value = c.min_estoque || 0;
    const fornSel = document.getElementById('cat-fornecedor');
    if (fornSel) fornSel.value = c.fornecedor_id || '';
    const precoGroup = document.getElementById('cat-preco-group');
    if (precoGroup) {
        precoGroup.style.display = '';
        document.getElementById('cat-preco').value = c.preco || 0;
    }
    const preview = document.getElementById('cat-foto-preview');
    if (preview) {
        if (c.imagem) {
            preview.innerHTML = `<img src="${c.imagem}" style="max-width:120px;max-height:80px;border-radius:6px;border:1px solid #E0E0E0;margin-top:6px">`;
            preview.dataset.base64 = c.imagem;
        } else {
            preview.innerHTML = '';
            delete preview.dataset.base64;
        }
        const fileInput = document.getElementById('cat-foto');
        if (fileInput) fileInput.value = '';
    }
    carregarCfgDoRegistro('cat', c);
    const btn = document.querySelector('button[onclick="salvarCatalogo()"]');
    if (btn) btn.textContent = 'Atualizar Tecido';
    document.getElementById('cat-ref').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    // Tipo de prega / fator / barra / cabeçote eram armazenados por ambiente em pedidos
    // antigos; agora vivem por tecido. Ao carregar dados legados, cada tecido herda os
    // valores do ambiente (que já existiam) como fallback, sem sobrescrever valores próprios.
    if (ped.ambientes && ped.ambientes.length) {
        return ped.ambientes.map(a => {
            if (a.tecidos && a.tecidos.length) {
                return {
                    ...a,
                    tecidos: a.tecidos.map(t => ({
                        prega: a.prega || 'Americana', fator: a.fator ?? 2.5,
                        bainha_cm: a.bainha_cm ?? 15, cabecote_cm: a.cabecote_cm ?? 0,
                        ...t
                    }))
                };
            }
            return {
                ...a,
                tecidos: [{
                    tecidoId: a.tecidoId || null, tecidoNome: a.tecidoNome || '',
                    largura_rolo: a.largura_rolo || 2.80,
                    prega: a.prega || 'Americana', fator: a.fator ?? 2.5,
                    bainha_cm: a.bainha_cm ?? 15, cabecote_cm: a.cabecote_cm ?? 0,
                    num_panos: a.num_panos || 0,
                    alt_corte: a.alt_corte || 0, consumo_linear: a.consumo_linear || 0,
                    total_material: a.total_material || 0
                }]
            };
        });
    }
    if (ped.tecidoId || ped.largura) {
        return [{
            id: 1, calculado: true,
            amb: ped.amb || '', fixacao: ped.fixacao || 'Trilho Suico',
            largura: ped.largura || 0, altura: ped.altura || 0,
            tecidos: [{
                tecidoId: ped.tecidoId, tecidoNome: ped.tecidoNome || '',
                largura_rolo: ped.largura_rolo || 2.80,
                prega: ped.prega || 'Americana', fator: ped.fator ?? 2.5,
                bainha_cm: ped.bainha_cm ?? 15, cabecote_cm: ped.cabecote_cm ?? 10,
                num_panos: ped.num_panos || 0,
                alt_corte: ped.alt_corte || 0, consumo_linear: ped.consumo_linear || 0,
                total_material: ped.total_material || Math.max(0, (ped.valor || 0) - (ped.maoObra || 0))
            }]
        }];
    }
    return [];
}

// --- DASHBOARD: ações sobre pedidos ---
async function editarPedido(id) {
    if (!await exigirPermissao('pedidos', 'completo')) return;
    localStorage.setItem('sc_editando_id', id);
    window.location.href = 'pedido.html';
}

async function excluirPedido(id) {
    if (!await exigirPermissao('pedidos', 'completo')) return;
    if (!await showConfirm('Excluir este pedido permanentemente?\nEsta ação não pode ser desfeita.', '🗑️', 'Excluir')) return;
    db.pedidos = db.pedidos.filter(p => p.id != id);
    salvarERecarregar('Pedido excluído.');
}

function gerarProposta(id) {
    abrirPropostaModal(id);
}

function abrirOS(id) {
    _docModalAtual = { tipo: 'os', pedidoId: id };
    abrirDocModal(gerarHTMLOS(id), 'Ordem de Serviço');
}

async function aprovarPedido(id) {
    if (!await exigirPermissao('pedidos', 'completo')) return;
    const ped = db.pedidos.find(p => p.id == id);
    if (!ped) return;

    const pendencias = [];
    if (!ped.clienteNome && !ped.clienteId) pendencias.push('• Cliente não definido');
    if (!ped.vendedor_nome && !ped.vendedor_id && !ped.arq_id) pendencias.push('• Vendedor ou arquiteto não definido');
    if (!ped.data_entrega) pendencias.push('• Data de entrega não definida');

    if (pendencias.length) {
        await showAlert(
            `Não é possível aprovar o pedido #${formatPedidoId(id)}.\n\nCorrija os itens abaixo antes de aprovar:\n\n${pendencias.join('\n')}`,
            '⚠️'
        );
        return;
    }

    if (!await showConfirm(`Aprovar pedido #${formatPedidoId(id)} e enviar para produção?`, '✅', 'Aprovar')) return;
    ped.status = 'Medição';
    ped.data_producao = Date.now();
    if (!ped.timeline) ped.timeline = [];
    ped.timeline.push({ status: 'Medição', data: Date.now() });
    gerarFinanceiroPedido(ped);
    salvarERecarregar('Pedido aprovado!');
}

function verTimeline(id) {
    const ped = db.pedidos.find(p => p.id == id);
    if (!ped) return;
    const STATUS_ICONS = {
        'Orçamento': '📋', 'Medição': '📐', 'Aguardando Tecido': '🧵',
        'Na Costura': '✂️', 'Pronto p/ Instalação': '📦',
        'Aguardando Pagamento': '💳', 'Instalado': '✅'
    };
    const eventos = [];
    const dataCreate = ped.data_criacao || (String(ped.id).length > 10 ? ped.id : null);
    if (dataCreate) eventos.push({ status: 'Orçamento', data: dataCreate, label: 'Pedido criado' });
    if (ped.timeline && ped.timeline.length) {
        ped.timeline.forEach(t => eventos.push(t));
    } else {
        if (ped.data_producao) eventos.push({ status: 'Medição', data: ped.data_producao });
        if (ped.data_instalado) eventos.push({ status: 'Instalado', data: ped.data_instalado });
    }
    eventos.sort((a, b) => a.data - b.data);
    const rows = eventos.map((e, i) => {
        const isCurrent = i === eventos.length - 1;
        const icon = STATUS_ICONS[e.status] || '⏺';
        const dataStr = new Date(e.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `<div style="display:flex;gap:14px;align-items:flex-start;padding:10px 0;${i < eventos.length - 1 ? 'border-bottom:1px solid #F1F1F1' : ''}">
            <div style="min-width:38px;height:38px;border-radius:50%;background:${isCurrent ? 'var(--primary)' : '#E0E0E0'};color:${isCurrent ? '#fff' : '#8F8F8F'};display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">${icon}</div>
            <div>
                <div style="font-weight:600;font-size:14px;color:${isCurrent ? 'var(--primary)' : '#242424'}">${e.label || e.status}</div>
                <div style="font-size:12px;color:#8F8F8F;margin-top:3px">${dataStr}</div>
            </div>
        </div>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:420px">
        <div class="modal-header">
            <h3>Timeline — Pedido #${formatPedidoId(id)}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            ${rows || '<p style="text-align:center;color:#8F8F8F;padding:20px 0">Sem histórico registrado.<br><small>Futuros movimentos serão registrados automaticamente.</small></p>'}
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// --- BAIXA AUTOMÁTICA DE ESTOQUE ---
function realizarBaixaTecidos(ped) {
    const ambientes = normalizarAmbientes(ped);
    const pedRef = ped.id ? `Pedido #${formatPedidoId(ped.id)}` : 'Pedido';
    for (const a of ambientes) {
        for (const t of (a.tecidos || [])) {
            if (!t.tecidoId || !(t.consumo_linear > 0)) continue;
            if (tecidoTemEstoqueInfinito(t.tecidoId)) continue;   // não há o que baixar
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
    ped.baixa_tecido_realizada = true;
}

function realizarBaixaMateriais(ped) {
    const pedRef = ped.id ? `Pedido #${formatPedidoId(ped.id)}` : 'Pedido';
    for (const item of (ped.itens || [])) {
        // Linha de kit pronto: baixa do saldo do próprio kit.
        if (item.kitId) {
            const kit = db.kits.find(k => k.id == item.kitId);
            if (kit && !temEstoqueInfinito(kit)) {
                kit.estoque_atual = Math.max(0, (kit.estoque_atual || 0) - item.quantidade);
                registrarMovimento('Baixa Pedido', kit.nome, 'kit', item.quantidade, 'un', pedRef);
            }
            continue;
        }
        const mat = db.materiais.find(m => m.id == item.materialId);
        if (mat && !temEstoqueInfinito(mat)) {
            mat.estoque_atual = Math.max(0, (mat.estoque_atual || 0) - item.quantidade);
            registrarMovimento('Baixa Pedido', mat.nome, 'material', item.quantidade, mat.unidade, pedRef);
        }
    }
    ped.baixa_mat_realizada = true;
}

function realizarBaixaEstoque(ped) {
    realizarBaixaTecidos(ped);
    realizarBaixaMateriais(ped);
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
            <p style="font-size:13px;color:#888;margin-bottom:18px">Pedido #${formatPedidoId(ped.id)}</p>
            <div style="background:#FAFAFA;border-radius:6px;padding:14px 16px;margin-bottom:20px;font-size:14px">
                <div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:#555">Valor Total</span><strong>R$ ${total.toFixed(2)}</strong></div>
                <div style="display:flex;justify-content:space-between;padding:5px 0"><span style="color:#555">Valor Recebido</span><strong style="color:#005D3B">R$ ${recebido.toFixed(2)}</strong></div>
                <div style="display:flex;justify-content:space-between;padding:8px 0 4px;border-top:1px solid #E0E0E0;margin-top:4px"><span style="color:#555;font-weight:600">Saldo a Receber</span><strong style="color:${saldo > 0.01 ? '#F43927' : '#005D3B'}">R$ ${saldo.toFixed(2)}</strong></div>
            </div>
            <p style="font-size:13px;color:var(--dark);font-weight:600;margin-bottom:14px">O pagamento foi recebido integralmente?</p>
            <div style="display:flex;flex-direction:column;gap:10px">
                <button id="mpg-sim" class="btn btn-success" style="padding:11px;font-size:14px">✓ Sim, pagamento completo → Instalado</button>
                <button id="mpg-nao" class="btn" style="background:#F2C924;padding:11px;font-size:14px">⏳ Não, há saldo pendente → Aguardando Pagamento</button>
                <button id="mpg-cancel" class="btn btn-outline" style="padding:9px;font-size:13px">Cancelar</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#mpg-sim').onclick    = () => { document.body.removeChild(overlay); callback('pago'); };
    overlay.querySelector('#mpg-nao').onclick    = () => { document.body.removeChild(overlay); callback('pendente'); };
    overlay.querySelector('#mpg-cancel').onclick = () => { document.body.removeChild(overlay); callback(null); };
}

// Desfecho de "Confirmar Entrega" (modal de pagamento), usado pelo Kanban e
// pela Agenda de Instalacoes: pago -> Instalado; com saldo -> Aguardando Pagamento.
function aplicarConfirmacaoEntrega(ped, resultado) {
    if (!ped.timeline) ped.timeline = [];
    if (!ped.inst_confirmada_em) ped.inst_confirmada_em = Date.now();   // instalacao feita -> Realizados
    if (resultado === 'pago') {
        ped.valor_recebido = ped.valor;
        ped.status = 'Instalado';
        if (!ped.data_instalado) ped.data_instalado = Date.now();
        ped.timeline.push({ status: 'Instalado', data: Date.now() });
    } else {
        ped.status = 'Aguardando Pagamento';
        ped.timeline.push({ status: 'Aguardando Pagamento', data: Date.now() });
    }
}

async function moverStatus(id, direcao) {
    const ped = db.pedidos.find(p => p.id == id);
    if (!ped) return;
    const idx    = STATUS_PIPELINE.indexOf(normalizarStatus(ped.status));
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= STATUS_PIPELINE.length) return;

    // ── Aguardando Tecido → Na Costura: verificar e baixar tecidos
    if (STATUS_PIPELINE[novoIdx] === 'Na Costura' && !ped.baixa_tecido_realizada && !ped.baixa_realizada) {
        const ambientes = normalizarAmbientes(ped);
        const insufTec = [];
        for (const a of ambientes) {
            for (const t of (a.tecidos || [])) {
                if (!t.tecidoId || !(t.consumo_linear > 0)) continue;
                if (tecidoTemEstoqueInfinito(t.tecidoId)) continue;   // sempre disponível
                const disp = estoqueDisponivel(t.tecidoId);
                if (disp < t.consumo_linear) {
                    const tec = db.catalogo.find(c => c.id == t.tecidoId);
                    insufTec.push(`• ${tec?.nome || 'Tecido'}${a.amb ? ' (' + a.amb + ')' : ''}: necessário ${t.consumo_linear.toFixed(2)} m, disponível ${disp.toFixed(2)} m`);
                }
            }
        }
        if (insufTec.length) {
            await showAlert(`Não é possível avançar para "Na Costura".\n\nTecidos insuficientes em estoque:\n\n${insufTec.join('\n')}`, '🚫');
            return;
        }
        const linhasTec = [];
        for (const a of ambientes)
            for (const t of (a.tecidos || []))
                if (t.tecidoId && t.consumo_linear > 0 && !tecidoTemEstoqueInfinito(t.tecidoId)) {
                    const tec = db.catalogo.find(c => c.id == t.tecidoId);
                    linhasTec.push(`• ${tec?.nome || 'Tecido'}${a.amb ? ' (' + a.amb + ')' : ''}: ${t.consumo_linear.toFixed(2)} m`);
                }
        const msgTec = linhasTec.length
            ? `Dar baixa nos tecidos e avançar para "Na Costura"?\n\n${linhasTec.join('\n')}`
            : `Avançar pedido #${formatPedidoId(id)} para "Na Costura"?`;
        if (!await showConfirm(msgTec, '🧵', 'Confirmar Baixa', 'Cancelar')) return;
        realizarBaixaTecidos(ped);
    }

    // ── Na Costura → Pronto p/ Instalação: verificar e baixar materiais/acessórios
    if (STATUS_PIPELINE[idx] === 'Na Costura' && STATUS_PIPELINE[novoIdx] === 'Pronto p/ Instalação'
        && !ped.baixa_mat_realizada && !ped.baixa_realizada) {
        const itensPed = ped.itens || [];
        const insufMat = [];
        for (const i of itensPed) {
            // Linha de kit pronto confere o saldo do próprio kit.
            const alvo = i.kitId
                ? db.kits.find(k => k.id == i.kitId)
                : db.materiais.find(m => m.id == i.materialId);
            if (temEstoqueInfinito(alvo)) continue;   // sempre disponivel
            const estAtual = alvo ? (alvo.estoque_atual || 0) : 0;
            if (estAtual < i.quantidade)
                insufMat.push(`• ${i.nome}: necessário ${i.quantidade} ${i.unidade}, disponível ${estAtual.toFixed(2)} ${i.unidade}`);
        }
        if (insufMat.length) {
            await showAlert(`Não é possível avançar para "Pronto p/ Instalação".\n\nMateriais/acessórios insuficientes em estoque:\n\n${insufMat.join('\n')}`, '🚫');
            return;
        }
    }

    if (STATUS_PIPELINE[idx] === 'Na Costura' && STATUS_PIPELINE[novoIdx] === 'Pronto p/ Instalação'
        && !ped.baixa_mat_realizada && !ped.baixa_realizada && (ped.itens || []).length) {
        const linhasMat = ped.itens.map(i => `• ${i.nome}: ${i.quantidade} ${i.unidade}`);
        if (!await showConfirm(`Dar baixa nos materiais e avançar para "Pronto p/ Instalação"?\n\n${linhasMat.join('\n')}`, '🔩', 'Confirmar Baixa', 'Cancelar')) return;
        realizarBaixaMateriais(ped);
    }

    // ── Na Costura → Pronto p/ Instalação: o pedido entra nos cards "Pedidos
    // Prontos para Instalação" da agenda, ainda sem agendamento. O agendamento
    // (profissional, data, horário, duração) é feito lá, contra a
    // disponibilidade real; nada é agendado automaticamente aqui.
    if (STATUS_PIPELINE[idx] === 'Na Costura' && STATUS_PIPELINE[novoIdx] === 'Pronto p/ Instalação') {
        ped.inst_agendado = false;
    }

    // Pronto p/ Instalação sem agendamento não se confirma: vai para a agenda.
    if (STATUS_PIPELINE[idx] === 'Pronto p/ Instalação' && direcao === 1 && !_instAgendada(ped)) {
        irParaAgendaInstalacao(ped.id);
        return;
    }

    // Intercept: avançar de "Pronto p/ Instalação" ou "Aguardando Pagamento" → verificar pagamento
    if ((STATUS_PIPELINE[idx] === 'Pronto p/ Instalação' || STATUS_PIPELINE[idx] === 'Aguardando Pagamento') && direcao === 1) {
        mostrarModalPagamento(ped, resultado => {
            if (!resultado) return;
            aplicarConfirmacaoEntrega(ped, resultado);
            toastReload('Status atualizado!');
            syncDB();
            window.location.reload();
        });
        return;
    }

    ped.status = STATUS_PIPELINE[novoIdx];
    if (!ped.timeline) ped.timeline = [];
    ped.timeline.push({ status: STATUS_PIPELINE[novoIdx], data: Date.now() });
    if (idx === 0) gerarFinanceiroPedido(ped);
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
    const estoqueCritico = db.catalogo.filter(c => !temEstoqueInfinito(c) && c.min_estoque > 0 && estoqueDisponivel(c.id) < c.min_estoque).length
        + db.materiais.filter(m => !temEstoqueInfinito(m) && m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque).length;
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

let _chartFat = null, _chartStatus = null;

function renderCharts() {
    if (typeof Chart === 'undefined') return;

    // ── Gráfico: Pedidos por status (donut) ─────────────────────
    const filtroSel = document.getElementById('chart-status-filtro');
    if (filtroSel && !filtroSel.options.length) {
        const hoje2 = new Date();
        filtroSel.innerHTML = '<option value="todos">Todos os pedidos</option>' +
            Array.from({ length: 5 }, (_, i) => {
                const d = new Date(hoje2.getFullYear(), hoje2.getMonth() - i, 1);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                return `<option value="${val}">${label.charAt(0).toUpperCase() + label.slice(1)}</option>`;
            }).join('');
    }
    renderChartStatus();
}

function renderChartStatus() {
    if (typeof Chart === 'undefined') return;
    const ctxStatus = document.getElementById('chart-status');
    if (!ctxStatus) return;

    const filtroSel = document.getElementById('chart-status-filtro');
    const filtro = filtroSel?.value || 'todos';

    const pedidosFiltrados = db.pedidos.filter(p => {
        if (filtro === 'todos') return true;
        const [ano, mes] = filtro.split('-').map(Number);
        const d = new Date(p.data_criacao || p.id);
        return d.getFullYear() === ano && d.getMonth() === mes - 1;
    });

    const statusLabels = ['Orçamento','Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento','Instalado'];
    const statusCores  = ['#F2C924','#2D77C1','#FF7F08','#9B31C8','#005D3B','#FF575F','#159912'];
    const statusCount  = statusLabels.map(s => pedidosFiltrados.filter(p => normalizarStatus(p.status) === s).length);
    const totalPedidos = statusCount.reduce((s, v) => s + v, 0);

    const centerTextPlugin = {
        id: 'centerText',
        afterDraw(chart) {
            const { ctx, chartArea: { left, top, width, height } } = chart;
            const cx = left + width / 2, cy = top + height / 2;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 30px "Nunito", system-ui, sans-serif';
            // Canvas não interpreta var(--x): lê o valor computado para acompanhar o tema
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--dark').trim() || '#242424';
            ctx.fillText(totalPedidos, cx, cy - 9);
            ctx.font = '700 11px "Nunito", system-ui, sans-serif';
            ctx.fillStyle = '#8F8F8F';
            ctx.fillText('pedidos', cx, cy + 14);
            ctx.restore();
        }
    };

    if (_chartStatus) _chartStatus.destroy();
    _chartStatus = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: statusLabels,
            datasets: [{
                data: statusCount,
                backgroundColor: statusCores.map(c => c + 'cc'),
                borderColor: statusCores,
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            cutout: '64%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { size: 11 }, padding: 12, boxWidth: 12, boxHeight: 12 }
                }
            }
        },
        plugins: [centerTextPlugin]
    });
}

// --- FILTRO DE VENDEDOR (Painel de Acompanhamento / Pedidos) ---
// Conveniência de visualização apenas — não restringe quem enxerga os pedidos,
// só facilita achar os de um vendedor. Preferência salva por usuário + tela.
function _prefsFiltroVendedor() {
    try { return JSON.parse(localStorage.getItem('sc_pref_filtro_vendedor') || '{}'); } catch { return {}; }
}

function inicializarFiltroVendedorTela(tela) {
    const sel = document.getElementById('filtro-vendedor');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todos</option>' +
        db.vendedores.map(v => `<option value="${v.id}">${escapeHtml(v.nome)}</option>`).join('');
    sel.dataset.tela = tela;
    const usuario = getUsuarioLogado();
    const salvo = usuario ? _prefsFiltroVendedor()[usuario.id]?.[tela] : null;
    if (salvo) sel.value = String(salvo);
}

function salvarFiltroVendedorTela() {
    const usuario = getUsuarioLogado();
    const sel = document.getElementById('filtro-vendedor');
    const tela = sel?.dataset.tela;
    if (!usuario || !tela) return;
    const valor = sel?.value || '';
    const prefs = _prefsFiltroVendedor();
    prefs[usuario.id] = prefs[usuario.id] || {};
    prefs[usuario.id][tela] = valor;
    localStorage.setItem('sc_pref_filtro_vendedor', JSON.stringify(prefs));
    toast('Filtro de vendedor salvo!', 'success', 1800);
}

function renderDashboard() {
    if (!temAcesso('pedidos', 'completo')) document.getElementById('btn-novo-pedido')?.style.setProperty('display', 'none');
    renderMetrics();
    renderCharts();
    renderDashboardMedicoes();
    renderDashboardInstalacoes();
    renderDashboardAlertas();
    aplicarDashCardsVisibilidade();
    const thead = document.getElementById('thead-pedidos');
    const tbody = document.getElementById('tb-pedidos');
    if (!thead || !tbody) return;

    const texto       = (document.getElementById('filtro-texto')?.value  || '').toLowerCase().trim();
    const statusFiltro = document.getElementById('filtro-status')?.value || '';
    const vendedorFiltro = document.getElementById('filtro-vendedor')?.value || '';

    let pedidos = db.pedidos.map(p => ({ ...p, _status: normalizarStatus(p.status) }));
    if (vendedorFiltro) pedidos = pedidos.filter(p => String(p.vendedor_id || '') === vendedorFiltro);
    if (texto)       pedidos = pedidos.filter(p => {
        const digitsBusca = texto.replace(/\D/g,'');
        const cli = db.clientes.find(c => c.id == p.clienteId);
        return formatPedidoId(p.id).includes(texto)
            || p.clienteNome.toLowerCase().includes(texto)
            || (p.amb || '').toLowerCase().includes(texto)
            || (digitsBusca.length >= 3 && cli && cli.cpf && cli.cpf.replace(/\D/g,'').includes(digitsBusca))
            || (digitsBusca.length >= 3 && cli && cli.tel && cli.tel.replace(/\D/g,'').includes(digitsBusca))
            || (cli && cli.end && cli.end.toLowerCase().includes(texto));
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
        if (col === 'criacao') return p.data_criacao || (String(p.id).length > 8 ? p.id : 0);
        if (col === 'cliente') return p.clienteNome.toLowerCase();
        if (col === 'amb')     return (p.amb || '').toLowerCase();
        if (col === 'valor')   return p.valor;
        if (col === 'entrega') return p.data_entrega || '';
        if (col === 'status')  return p._status;
        return 0;
    };
    pedidos.sort((a, b) => { const va = valOf(a), vb = valOf(b); return va < vb ? -dir : va > vb ? dir : 0; });

    const COLS = [
        { key: 'id', label: 'Pedido' }, { key: 'criacao', label: 'Criação' }, { key: 'cliente', label: 'Cliente' },
        { key: 'valor', label: 'Valor (R$)' },
        { key: 'entrega', label: 'Entrega' }, { key: 'status', label: 'Status' }
    ];
    thead.innerHTML = '<tr>' + COLS.map(c => {
        const ativo = dashboardState.col === c.key;
        const seta  = ativo ? (dashboardState.dir === 1 ? '▲' : '▼') : '⇅';
        return `<th class="th-sort${ativo ? ' th-sort-ativo' : ''}" onclick="sortDashboard('${c.key}')">${c.label} <span class="sort-icon">${seta}</span></th>`;
    }).join('') + '<th>Vendedor</th><th>Ação</th></tr>';

    const hojeStr = new Date().toISOString().split('T')[0];
    const podeEditarPedidos = temAcesso('pedidos', 'completo');
    const rows = pedidos.map(p => {
        const colorClass = COR_STATUS[p._status] || 'st-orcamento';
        const btnAprovar = (p._status === 'Orçamento' && podeEditarPedidos)
            ? `<button class="btn btn-sm btn-aprovar" onclick="aprovarPedido(${p.id})">✅ Aprovar</button>` : '';
        const baixaTag = p.baixa_realizada
            ? `<span class="badge-baixa" title="Baixa de estoque realizada">✔ Baixa</span>` : '';
        const pagto      = statusPagamento(p);
        const entregaInf = statusEntrega(p);
        const pagBadge   = pagto.cls ? ` <span class="${pagto.cls}">${pagto.label}</span>` : '';
        const entregaCell = entregaInf
            ? `<span class="${entregaInf.cls}">${entregaInf.label}</span>`
            : `<span style="color:#8F8F8F;font-size:12px">—</span>`;
        const dataCriacao = p.data_criacao
            ? new Date(p.data_criacao).toLocaleDateString('pt-BR')
            : (String(p.id).length > 8 ? new Date(p.id).toLocaleDateString('pt-BR') : '—');
        const rowAtrasado = p.data_entrega && p._status !== 'Instalado' && p.data_entrega < hojeStr ? ' class="row-atrasado"' : '';
        const idCell = podeEditarPedidos
            ? `<span style="cursor:pointer;color:var(--primary);font-weight:bold;text-decoration:underline" onclick="editarPedido(${p.id})" title="Editar pedido">#${formatPedidoId(p.id)}</span>`
            : `<span style="color:var(--primary);font-weight:bold">#${formatPedidoId(p.id)}</span>`;
        return `<tr${rowAtrasado}>
            <td>${idCell}</td>
            <td style="white-space:nowrap">${dataCriacao}</td>
            <td>${escapeHtml(p.clienteNome||'')}</td>
            <td>R$ ${p.valor.toFixed(2)}${pagBadge}</td>
            <td>${entregaCell}</td>
            <td><span class="status-tag ${colorClass}">${p._status}</span> ${baixaTag}</td>
            <td>${escapeHtml(p.vendedor_nome || '—')}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="gerarProposta(${p.id})" title="Gerar proposta PDF">📄</button>
                <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})" title="Ver Ordem de Serviço">📋</button>
                <button class="btn btn-outline btn-sm" onclick="verTimeline(${p.id})" title="Ver timeline do pedido">⏱</button>
                ${btnAprovar}
                ${podeEditarPedidos ? `<button class="btn btn-outline btn-sm" onclick="editarPedido(${p.id})" title="Editar pedido">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirPedido(${p.id})" title="Excluir pedido">🗑️</button>` : ''}
            </td>
        </tr>`;
    }).join('');

    const vazio = texto || statusFiltro
        ? 'Nenhum pedido encontrado com esses filtros.'
        : 'Nenhum pedido cadastrado. Clique em "+ Novo Pedido" para começar.';
    tbody.innerHTML = rows || `<tr><td colspan="8" style="text-align:center;color:#999;padding:20px;">${vazio}</td></tr>`;

    const counter = document.getElementById('pedidos-counter');
    if (counter) counter.textContent = pedidos.length === db.pedidos.length
        ? `${db.pedidos.length} pedido(s)` : `${pedidos.length} de ${db.pedidos.length} pedido(s)`;
}

// ── CONFIGURAÇÃO DE ALERTAS ───────────────────────────────────
const ALERTAS_TIPOS = {
    entrega:        { label: 'Entregas atrasadas / hoje',         icon: '🚚' },
    medicao:        { label: 'Medições atrasadas / agendadas',    icon: '📐' },
    instalacao:     { label: 'Instalações atrasadas / agendadas', icon: '🔧' },
    estoque:        { label: 'Estoque abaixo do mínimo',          icon: '📦' },
    fin_vencimento: { label: 'Contas vencendo hoje / em breve',   icon: '📅' },
    fin_atraso:     { label: 'Recebimentos / pagamentos atrasados', icon: '❌' },
    fin_gap:        { label: 'Gap de caixa (7 dias)',             icon: '⚠️' },
    fin_meta:       { label: 'Progresso da meta de faturamento',  icon: '🎯' },
    fin_tendencia:  { label: 'Tendência de faturamento mensal',   icon: '📈' },
};

function getAlertasCfg() {
    try { return JSON.parse(localStorage.getItem('sc_alertas_cfg')) || {}; } catch(e) { return {}; }
}
function alertaAtivo(tipo) {
    return getAlertasCfg()[tipo] !== false;
}
function toggleAlertaTipo(tipo) {
    const cfg = getAlertasCfg();
    cfg[tipo] = !alertaAtivo(tipo);
    localStorage.setItem('sc_alertas_cfg', JSON.stringify(cfg));
    renderBellIndicator();
    renderEmpresaAlertasCfg();
}
function renderEmpresaAlertasCfg() {
    const el = document.getElementById('emp-alertas-cfg');
    if (!el) return;
    const cfg = getAlertasCfg();
    el.innerHTML = Object.entries(ALERTAS_TIPOS).map(([key, info]) => {
        const ativo = cfg[key] !== false;
        return `<div class="alerta-toggle-row">
            <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:20px">${info.icon}</span>
                <div>
                    <div style="font-size:13px;font-weight:500;color:var(--dark)">${info.label}</div>
                    <div style="font-size:11px;color:${ativo?'#005D3B':'#8F8F8F'};margin-top:1px">${ativo?'Ativo':'Desativado'}</div>
                </div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" ${ativo?'checked':''} onchange="toggleAlertaTipo('${key}')">
                <span class="toggle-slider"></span>
            </label>
        </div>`;
    }).join('');
}
// ── CONFIGURAÇÃO DE CARDS DO DASHBOARD ────────────────────────
const DASHBOARD_CARDS = {
    fat_mes:            { label: 'Faturamento do Mês',            icon: '💰' },
    producao:           { label: 'Em Produção',                   icon: '🧵' },
    orcamentos:         { label: 'Orçamentos Abertos',            icon: '📋' },
    ticket:             { label: 'Ticket Médio',                  icon: '🎫' },
    estoque_critico:    { label: 'Estoque Crítico',               icon: '📦' },
    atrasados:          { label: 'Entregas Atrasadas',            icon: '🚚' },
    a_receber:          { label: 'A Receber (Total)',             icon: '💵' },
    alertas:            { label: 'Painel de Alertas do Sistema',  icon: '🔔' },
    chart_status:       { label: 'Gráfico: Pedidos por Status',   icon: '📊' },
    agenda_instalacoes: { label: 'Agenda de Instalações (resumo)', icon: '🔧' },
    agenda_medicoes:    { label: 'Agenda de Medições (resumo)',    icon: '📐' },
};
const DASH_CARD_ELEMENT_IDS = {
    fat_mes: 'card-fat-mes', producao: 'card-producao', orcamentos: 'card-orcamentos',
    ticket: 'card-ticket', estoque_critico: 'card-estoque-critico', atrasados: 'card-atrasados',
    a_receber: 'card-a-receber', alertas: 'card-alertas', chart_status: 'card-chart-status',
    agenda_instalacoes: 'dashboard-instalacoes', agenda_medicoes: 'dashboard-medicoes',
};

function getDashCardsCfg() {
    try { return JSON.parse(localStorage.getItem('sc_dashcards_cfg')) || {}; } catch(e) { return {}; }
}
function dashCardVisivel(key) {
    return getDashCardsCfg()[key] !== false;
}
function toggleDashCard(key) {
    const cfg = getDashCardsCfg();
    cfg[key] = !dashCardVisivel(key);
    localStorage.setItem('sc_dashcards_cfg', JSON.stringify(cfg));
    renderEmpresaDashCardsCfg();
    aplicarDashCardsVisibilidade();
}
function renderEmpresaDashCardsCfg() {
    const el = document.getElementById('emp-dashcards-cfg');
    if (!el) return;
    const cfg = getDashCardsCfg();
    el.innerHTML = Object.entries(DASHBOARD_CARDS).map(([key, info]) => {
        const ativo = cfg[key] !== false;
        return `<div class="alerta-toggle-row">
            <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:20px">${info.icon}</span>
                <div>
                    <div style="font-size:13px;font-weight:500;color:var(--dark)">${info.label}</div>
                    <div style="font-size:11px;color:${ativo?'#005D3B':'#8F8F8F'};margin-top:1px">${ativo?'Visível':'Oculto'}</div>
                </div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" ${ativo?'checked':''} onchange="toggleDashCard('${key}')">
                <span class="toggle-slider"></span>
            </label>
        </div>`;
    }).join('');
}
function aplicarDashCardsVisibilidade() {
    const cfg = getDashCardsCfg();
    Object.entries(DASH_CARD_ELEMENT_IDS).forEach(([key, elId]) => {
        const elCard = document.getElementById(elId);
        if (!elCard) return;
        if (cfg[key] === false) elCard.style.display = 'none';
        else if (key !== 'agenda_instalacoes' && key !== 'agenda_medicoes') elCard.style.display = '';
    });
}

function _getHeaderGroup() {
    let grp = document.getElementById('header-right-group');
    if (!grp) {
        const headerEl = document.querySelector('.header');
        if (!headerEl) return null;
        grp = document.createElement('div');
        grp.id = 'header-right-group';
        grp.style.cssText = 'display:flex;align-items:center;gap:10px;margin-left:auto';
        headerEl.appendChild(grp);
    }
    return grp;
}

function renderBellIndicator() {
    const cfg = getAlertasCfg();
    const temDesativado = Object.keys(ALERTAS_TIPOS).some(k => cfg[k] === false);
    let bell = document.getElementById('alerta-bell-disabled');
    // O sino leva a Configurar Empresa. Para quem nao alcanca aquela tela ele
    // so renderia um convite a ser barrado na porta.
    if (!temDesativado || !temAcesso('configuracoes.empresa', 'visualizar')) { if (bell) bell.remove(); return; }
    if (!bell) {
        bell = document.createElement('div');
        bell.id = 'alerta-bell-disabled';
        bell.onclick = () => window.location.href = 'empresa.html';
        const grp = _getHeaderGroup();
        if (grp) grp.appendChild(bell);
    }
    bell.innerHTML = `🔕 Alertas desabilitados<div class="bell-tip">Alguns alertas estão desabilitados. Clique para gerenciar em Configurar Empresa.</div>`;
}

function renderDashboardsButton() {
    if (document.getElementById('dash-nav-btn')) return;
    if (window.location.pathname.toLowerCase().includes('dashboards')) return;
    const grp = _getHeaderGroup();
    if (!grp) return;
    const DASH_LIST = [
        ['comercial','📊','Comercial / Vendas'],
        ['producao','🏭','Produção'],
        ['estoque','📦','Estoque'],
        ['instalacoes','🔧','Instalações'],
        ['compras','🛒','Compras'],
        ['gerencial','👔','Gerencial'],
    ];
    const wrap = document.createElement('div');
    wrap.id = 'dash-nav-btn';
    wrap.style.cssText = 'position:relative';
    wrap.innerHTML = `<button class="btn btn-outline btn-sm" onclick="toggleDashboardsMenu(event)" style="display:flex;align-items:center;gap:5px;font-weight:600">
        📊 Dashboards <span style="font-size:9px;opacity:.7">▾</span>
    </button>
    <div id="dash-dropdown" style="display:none;position:absolute;top:calc(100%+8px);right:0;background:var(--white);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.14);z-index:3000;min-width:220px;padding:5px 0;overflow:hidden">
        ${DASH_LIST.map(([id,ic,lb])=>`<a href="dashboards.html?dash=${id}" style="display:flex;align-items:center;gap:10px;padding:10px 16px;font-size:13px;font-weight:500;color:var(--dark);text-decoration:none;white-space:nowrap" onmouseover="this.style.background='var(--light)'" onmouseout="this.style.background=''">${ic} <span>${lb}</span></a>`).join('<div style="height:1px;background:var(--border)"></div>')}
    </div>`;
    grp.insertBefore(wrap, grp.firstChild);
}

// Abas menos usadas do Estoque, fora da barra principal: ficam num menu de
// tres pontos ao lado de Dashboards. So aparece na tela de Estoque.
const ABAS_EXTRAS_ESTOQUE = [
    ['historico', '📋', 'Histórico'],
    ['futuro',    '📊', 'Estoque Futuro'],
    ['backup',    '💾', 'Backup']
];

function renderMenuExtrasEstoque() {
    if (document.getElementById('estoque-extras-btn')) return;
    if (!document.getElementById('tab-historico')) return;   // só na tela de Estoque
    const grp = _getHeaderGroup();
    if (!grp) return;
    const wrap = document.createElement('div');
    wrap.id = 'estoque-extras-btn';
    wrap.style.cssText = 'position:relative';
    wrap.innerHTML = `<button class="btn btn-outline btn-sm" onclick="toggleExtrasEstoque(event)"
            title="Mais abas do estoque" style="font-weight:700;letter-spacing:1px;padding:6px 12px">⋯</button>
        <div id="estoque-extras-menu" style="display:none;position:absolute;top:calc(100% + 8px);right:0;background:var(--white);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.14);z-index:3000;min-width:200px;padding:5px 0;overflow:hidden">
        ${ABAS_EXTRAS_ESTOQUE.map(([id, ic, lb]) =>
            `<button type="button" onclick="mostrarTabEstoque('${id}')" style="display:flex;align-items:center;gap:10px;padding:10px 16px;font-size:13px;font-weight:500;color:var(--dark);background:none;border:0;width:100%;text-align:left;cursor:pointer;white-space:nowrap" onmouseover="this.style.background='var(--light)'" onmouseout="this.style.background=''">${ic} <span>${lb}</span></button>`
        ).join('<div style="height:1px;background:var(--border)"></div>')}
        </div>`;
    grp.insertBefore(wrap, grp.firstChild);
}

function toggleExtrasEstoque(e) {
    e.stopPropagation();
    const m = document.getElementById('estoque-extras-menu');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', () => {
    const m = document.getElementById('estoque-extras-menu');
    if (m) m.style.display = 'none';
});

function toggleDashboardsMenu(e) {
    e.stopPropagation();
    const m = document.getElementById('dash-dropdown');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', () => {
    const m = document.getElementById('dash-dropdown');
    if (m) m.style.display = 'none';
});

function renderDashboardAlertas() {
    const el = document.getElementById('dashboard-alertas');
    if (!el) return;
    const hojeStr = new Date().toISOString().split('T')[0];
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const banners = [];

    const mkBanner = (icon, bg, bord, textClr, titulo, itens) =>
        `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;background:${bg};border:1px solid ${bord};border-radius:8px;padding:10px 16px;font-size:13px">
            <span style="font-size:17px;flex-shrink:0">${icon}</span>
            <span style="color:${textClr}">${titulo}</span>
            <span>${itens}</span>
        </div>`;

    // Pedidos com entrega atrasada ou hoje
    if (alertaAtivo('entrega')) {
        const entregasAtrasadas = filtrarPedidosVisiveis(db.pedidos).filter(p => {
            if (!p.data_entrega || normalizarStatus(p.status) === 'Instalado') return false;
            return p.data_entrega < hojeStr;
        });
        if (entregasAtrasadas.length) {
            const itens = entregasAtrasadas
                .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega))
                .map(p => {
                    const diasAtraso = Math.round((hoje - new Date(p.data_entrega + 'T00:00:00')) / 86400000);
                    return `<span style="cursor:pointer;color:#B3160A;font-weight:600;text-decoration:underline" onclick="editarPedido(${p.id})" title="${diasAtraso}d de atraso">#${formatPedidoId(p.id)} ${escapeHtml(p.clienteNome||'')} (${p.data_entrega.split('-').reverse().join('/')})</span>`;
                }).join(' &nbsp;·&nbsp; ');
            banners.push(mkBanner('🚨', '#FEF4F2', '#F79B90', '#B3160A',
                `<strong>${entregasAtrasadas.length} entrega(s) atrasada(s):</strong>`, itens));
        }

        const entregasHoje = filtrarPedidosVisiveis(db.pedidos).filter(p => {
            if (!p.data_entrega || normalizarStatus(p.status) === 'Instalado') return false;
            return p.data_entrega === hojeStr;
        });
        if (entregasHoje.length) {
            const itens = entregasHoje.map(p =>
                `<span style="cursor:pointer;color:#8A6A00;font-weight:600;text-decoration:underline" onclick="editarPedido(${p.id})">#${formatPedidoId(p.id)} ${escapeHtml(p.clienteNome||'')}</span>`
            ).join(' &nbsp;·&nbsp; ');
            banners.push(mkBanner('🔔', '#FEF6D8', '#F2C924', '#8A6A00',
                `<strong>${entregasHoje.length} pedido(s)</strong> com entrega prevista para hoje:`, itens));
        }
    }

    // Medições atrasadas + hoje
    if (alertaAtivo('medicao')) {
        const medicAtrasadas = filtrarMedicoesVisiveis(db.medicoes).filter(m => m.status === 'Agendado' && m.data < hojeStr);
        if (medicAtrasadas.length) {
            const itens = medicAtrasadas.map(m =>
                `<span style="cursor:pointer;color:#B3160A;font-weight:600;text-decoration:underline" onclick="location.href='pcp.html?view=medicoes'">${escapeHtml(m.clienteNome||'—')} (${m.data.split('-').reverse().join('/')})</span>`
            ).join(' &nbsp;·&nbsp; ');
            banners.push(mkBanner('📐', '#FEF4F2', '#F79B90', '#B3160A',
                `<strong>${medicAtrasadas.length} medição(ões)</strong> atrasada(s):`, itens));
        }
        const medicHoje = filtrarMedicoesVisiveis(db.medicoes).filter(m => m.status === 'Agendado' && m.data === hojeStr);
        if (medicHoje.length) {
            const itens = medicHoje.map(m =>
                `<span style="cursor:pointer;color:#2D77C1;font-weight:600;text-decoration:underline" onclick="location.href='pcp.html?view=medicoes'">${escapeHtml(m.clienteNome||'—')}${m.hora ? ' às ' + m.hora : ''}</span>`
            ).join(' &nbsp;·&nbsp; ');
            banners.push(mkBanner('📐', '#E4EFF9', '#9FC4E5', '#1F5A96',
                `<strong>${medicHoje.length} medição(ões)</strong> agendada(s) para hoje:`, itens));
        }
    }

    // Instalações atrasadas + hoje
    if (alertaAtivo('instalacao')) {
        const instStatus = ['Pronto p/ Instalação', 'Aguardando Pagamento'];
        const instAtrasadas = filtrarPedidosVisiveis(db.pedidos).filter(p =>
            instStatus.includes(normalizarStatus(p.status)) && p.data_entrega && p.data_entrega < hojeStr);
        if (instAtrasadas.length) {
            const itens = instAtrasadas.map(p =>
                `<span style="cursor:pointer;color:#B3160A;font-weight:600;text-decoration:underline" onclick="editarPedido(${p.id})">#${formatPedidoId(p.id)} ${escapeHtml(p.clienteNome||'')} (${p.data_entrega.split('-').reverse().join('/')})</span>`
            ).join(' &nbsp;·&nbsp; ');
            banners.push(mkBanner('🔧', '#FEF4F2', '#F79B90', '#B3160A',
                `<strong>${instAtrasadas.length} instalação(ões)</strong> atrasada(s):`, itens));
        }
        const instHoje = filtrarPedidosVisiveis(db.pedidos).filter(p =>
            instStatus.includes(normalizarStatus(p.status)) && p.data_entrega === hojeStr);
        if (instHoje.length) {
            const itens = instHoje.map(p =>
                `<span style="cursor:pointer;color:#2D77C1;font-weight:600;text-decoration:underline" onclick="editarPedido(${p.id})">#${formatPedidoId(p.id)} ${escapeHtml(p.clienteNome||'')}${p.inst_hora ? ' às ' + p.inst_hora : ''}</span>`
            ).join(' &nbsp;·&nbsp; ');
            banners.push(mkBanner('🔧', '#E4EFF9', '#9FC4E5', '#1F5A96',
                `<strong>${instHoje.length} instalação(ões)</strong> agendada(s) para hoje:`, itens));
        }
    }

    // Estoque crítico (tecidos + materiais)
    if (alertaAtivo('estoque')) {
        const tecidosCriticos = db.catalogo.filter(c => !temEstoqueInfinito(c) && c.min_estoque > 0 && estoqueDisponivel(c.id) < c.min_estoque);
        const matCriticos     = db.materiais.filter(m => !temEstoqueInfinito(m) && m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque);
        const totalCriticos   = tecidosCriticos.length + matCriticos.length;
        if (totalCriticos) {
            const itens = [
                ...tecidosCriticos.map(c => `<span style="cursor:pointer;color:#8A6A00;font-weight:600;text-decoration:underline" onclick="location.href='estoque.html'">${escapeHtml(c.nome)}: ${estoqueDisponivel(c.id).toFixed(2)} m (mín. ${c.min_estoque} m)</span>`),
                ...matCriticos.map(m => `<span style="cursor:pointer;color:#8A6A00;font-weight:600;text-decoration:underline" onclick="location.href='estoque.html'">${escapeHtml(m.nome)}: ${(m.estoque_atual||0).toFixed(2)} ${m.unidade||''} (mín. ${m.min_estoque})</span>`)
            ].join(' &nbsp;·&nbsp; ');
            banners.push(mkBanner('⚠️', '#FEF6D8', '#F2C924', '#8A6A00',
                `<strong>${totalCriticos} item(ns)</strong> com estoque abaixo do mínimo:`, itens));
        }
    }

    // Contador no cabeçalho do card
    const countEl = document.getElementById('dash-alertas-count');
    if (countEl) {
        if (banners.length) {
            countEl.textContent = banners.length + (banners.length === 1 ? ' alerta' : ' alertas');
            countEl.style.background = '#FDE8E5';
            countEl.style.color = '#B3160A';
        } else {
            countEl.textContent = '';
            countEl.style.background = '#F1F1F1';
            countEl.style.color = '#8F8F8F';
        }
    }

    if (!banners.length) {
        el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:32px 0;color:#8F8F8F;font-size:13px;gap:8px">
            <span style="font-size:32px">✅</span>
            <span>Nenhum alerta ativo no momento.</span>
        </div>`;
        clearInterval(window._dashAlertaScroll);
        return;
    }

    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;padding-right:2px">${banners.join('')}</div>`;

    // Auto-scroll quando há mais de um alerta
    clearInterval(window._dashAlertaScroll);
    if (banners.length > 1) {
        let pausado = false;
        el.addEventListener('mouseenter', () => { pausado = true; }, { passive: true });
        el.addEventListener('mouseleave', () => { pausado = false; }, { passive: true });
        window._dashAlertaScroll = setInterval(() => {
            if (pausado) return;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
                // chegou ao fim — pausa 2s e volta ao topo suavemente
                clearInterval(window._dashAlertaScroll);
                setTimeout(() => {
                    el.scrollTo({ top: 0, behavior: 'smooth' });
                    setTimeout(() => {
                        if (document.getElementById('dashboard-alertas') === el) {
                            renderDashboardAlertas();
                        }
                    }, 800);
                }, 2000);
            } else {
                el.scrollTop += 1;
            }
        }, 35);
    }
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
// Metragem do rolo de um tecido sem controle de estoque. E so um numero para
// o item existir na lista de rolos; ele nunca e consumido. Fica aqui, e nao
// no importador, porque o cadastro manual tambem cria esse rolo e app.js e o
// unico arquivo carregado em todas as telas.
const METRAGEM_INFINITA = 99999;

// Item marcado como "estoque infinito" na importação da tabela do fornecedor:
// está sempre disponível, nunca sofre baixa e fica fora dos alertas de mínimo.
// A flag é por registro, então nenhum item fora da importação é afetado.
function temEstoqueInfinito(registro) {
    return !!(registro && registro.estoque_infinito);
}
function tecidoTemEstoqueInfinito(tecidoId) {
    return temEstoqueInfinito(db.catalogo.find(c => c.id == tecidoId));
}
// Saldo para mostrar na tela: "∞" quando o item não tem controle de estoque.
function textoSaldoTecido(c) {
    if (temEstoqueInfinito(c)) return '∞';
    // Sem rolo nenhum o saldo e' zero, e e' isso que a coluna diz. Um traço
    // aqui se confundia com "não se aplica", que e' o caso do infinito.
    return `${estoqueDisponivel(c.id).toFixed(2)} m`;
}

// Um item infinito carrega um rolo/saldo de fachada (METRAGEM_INFINITA) so
// para aparecer nas listas. Ao voltar a ser controlado, esse saldo nao pode
// virar estoque real: ele e' apagado e o item fica zerado, esperando entrada.
// Minimo para mostrar na tela. Item sem controle de estoque nao tem ponto de
// pedido, entao a coluna diz "—" mesmo que haja um numero guardado de antes.
function textoMinimo(registro, unidade) {
    if (temEstoqueInfinito(registro)) return '—';
    const m = registro && registro.min_estoque;
    return m > 0 ? m + (unidade ? ' ' + unidade : '') : '—';
}

function _ehSaldoDeFachada(rolo) {
    return rolo.lote === 'ESTOQUE INFINITO' || rolo.metragem_inicial >= METRAGEM_INFINITA;
}
function limparSaldoDeFachadaDoTecido(tecidoId) {
    const antes = db.estoque.length;
    db.estoque = db.estoque.filter(r => !(r.tecido_id == tecidoId && _ehSaldoDeFachada(r)));
    return antes !== db.estoque.length;
}

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
function _calcularPrecoVenda(custoId, markupId, displayId) {
    const custo  = parseFloat(document.getElementById(custoId)?.value) || 0;
    const markup = parseFloat(document.getElementById(markupId)?.value) || 0;
    const venda  = custo > 0 ? custo * (1 + markup / 100) : 0;
    const display = document.getElementById(displayId);
    if (display) display.textContent = 'R$ ' + venda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function calcularPrecoVendaTecido() { _calcularPrecoVenda('est-preco-custo', 'est-markup', 'est-preco-venda-display'); }

// ─── BALANÇO DE ESTOQUE ──────────────────────────────────────────────────────

function abrirBalanco() {
    const existing = document.getElementById('balanco-overlay');
    if (existing) existing.remove();

    // --- Montar linhas de tecidos (ativos e esgotados separados) ---
    let rowsTecidos = '';
    const rolosEsgotados = db.estoque.filter(r => !(r.metragem_atual > 0));
    db.estoque.forEach(r => {
        const esgotado = !(r.metragem_atual > 0);
        const cat  = db.catalogo.find(c => c.id === r.tecido_id);
        const nome = cat ? cat.nome : '—';
        const sys  = (r.metragem_atual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const rowStyle = esgotado ? 'opacity:.5;background:#FAFAFA' : '';
        rowsTecidos += `<tr data-balanco-nome="${nome.toLowerCase()}" data-balanco-ref="${(r.lote||'').toLowerCase()}" data-esgotado="${esgotado ? '1' : '0'}" style="${rowStyle}">
            <td>${nome}${esgotado ? ' <span style="font-size:10px;background:#E0E0E0;color:#8F8F8F;padding:1px 5px;border-radius:4px;font-weight:600">ESGOTADO</span>' : ''}</td>
            <td>${r.lote || '—'}</td>
            <td style="text-align:right;color:${esgotado ? '#8F8F8F' : 'inherit'}">${sys} m</td>
            <td><input type="number" min="0" step="0.01" placeholder="—"
                data-balanco-rolo="${r.id}"
                data-sys="${r.metragem_atual || 0}"
                oninput="_diffBalanco(this)"
                style="width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:4px;text-align:right"></td>
            <td id="diff-rolo-${r.id}" style="text-align:right;font-weight:600;color:#8F8F8F">—</td>
        </tr>`;
    });
    if (!rowsTecidos) rowsTecidos = '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:16px">Nenhum rolo em estoque</td></tr>';

    // --- Montar linhas de materiais ---
    let rowsMats = '';
    db.materiais.forEach(m => {
        const sys = (m.estoque_atual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        rowsMats += `<tr data-balanco-nome="${m.nome.toLowerCase()}" data-balanco-ref="${(m.referencia||'').toLowerCase()}">
            <td>${m.referencia || '—'}</td>
            <td>${m.nome}</td>
            <td style="text-align:center">${m.unidade || 'un'}</td>
            <td style="text-align:right">${sys}</td>
            <td><input type="number" min="0" step="0.01" placeholder="—"
                data-balanco-mat="${m.id}"
                data-sys="${m.estoque_atual || 0}"
                oninput="_diffBalanco(this)"
                style="width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:4px;text-align:right"></td>
            <td id="diff-mat-${m.id}" style="text-align:right;font-weight:600;color:#8F8F8F">—</td>
        </tr>`;
    });
    if (!rowsMats) rowsMats = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:16px">Nenhum material em estoque</td></tr>';

    const thStyle = 'background:#FAFAFA;padding:10px 12px;border-bottom:2px solid #E0E0E0;color:#555;font-size:13px;white-space:nowrap';
    const inpStyle = 'padding:7px 10px;border:1px solid #E0E0E0;border-radius:6px;font-size:13px;outline:none;transition:border-color .15s;width:100%';
    const overlay = document.createElement('div');
    overlay.id = 'balanco-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-box" style="max-width:960px;width:100%">
            <div class="modal-header">
                <div>
                    <h3 style="margin:0;font-size:16px">📋 Balanço de Estoque</h3>
                    <p style="margin:4px 0 0;font-size:12px;color:#8F8F8F">${new Date().toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'})}</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                    <button class="btn btn-outline btn-sm" onclick="exportarBalancoPDF()">📄 Exportar PDF</button>
                    <button class="btn btn-success btn-sm" onclick="aplicarAjustesBalanco()">✔ Aplicar Ajustes</button>
                    <button class="modal-close" onclick="document.getElementById('balanco-overlay').remove()">×</button>
                </div>
            </div>
            <div class="modal-body">
                <p style="font-size:13px;color:#8F8F8F;margin-bottom:14px">
                    Preencha a coluna <strong>Contado</strong> com as quantidades físicas apuradas. Deixe em branco os itens não contados.
                    Clique em <strong>Exportar PDF</strong> para imprimir a planilha de contagem, ou em <strong>Aplicar Ajustes</strong> para atualizar o estoque.
                </p>

                <!-- Filtros -->
                <div style="display:flex;gap:10px;margin-bottom:${rolosEsgotados.length ? '8px' : '20px'};padding:12px 14px;background:#FAFAFA;border:1px solid #E0E0E0;border-radius:8px;flex-wrap:wrap">
                    <div style="flex:1;min-width:150px">
                        <label style="font-size:11px;font-weight:600;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Nome</label>
                        <input id="balanco-filter-nome" type="text" placeholder="Filtrar por nome..." style="${inpStyle}" oninput="_filtrarBalanco()">
                    </div>
                    <div style="flex:1;min-width:150px">
                        <label style="font-size:11px;font-weight:600;color:#8F8F8F;text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Código</label>
                        <input id="balanco-filter-ref" type="text" placeholder="Filtrar por código do tecido ou do rolo..." style="${inpStyle}" oninput="_filtrarBalanco()">
                    </div>
                    <div style="display:flex;align-items:flex-end;gap:8px">
                        <button class="btn btn-outline btn-sm" onclick="_limparFiltrosBalanco()" style="white-space:nowrap">✕ Limpar</button>
                    </div>
                </div>
                ${rolosEsgotados.length ? `<div style="margin-bottom:16px;padding:8px 12px;background:#FAFAFA;border:1px solid #E0E0E0;border-radius:6px;display:flex;align-items:center;gap:10px;font-size:12px;color:#8F8F8F">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">
                        <input type="checkbox" id="balanco-show-esgotados" onchange="_filtrarBalanco()" style="width:14px;height:14px;cursor:pointer">
                        Mostrar <strong style="color:var(--dark)">${rolosEsgotados.length} rolo(s) esgotado(s)</strong> (metragem = 0 no sistema)
                    </label>
                </div>` : ''}

                <h4 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#005D3B;margin-bottom:8px">🧵 Tecidos / Rolos</h4>
                <div style="overflow-x:auto;margin-bottom:24px">
                    <table style="width:100%;border-collapse:collapse;font-size:13px">
                        <thead><tr>
                            <th style="${thStyle}">Tecido</th>
                            <th style="${thStyle}">Código</th>
                            <th style="${thStyle};text-align:right">Sist. (m)</th>
                            <th style="${thStyle};text-align:right;width:130px">Contado (m)</th>
                            <th style="${thStyle};text-align:right;width:100px">Diferença</th>
                        </tr></thead>
                        <tbody id="balanco-tbody-tecidos">${rowsTecidos}</tbody>
                    </table>
                </div>

                <h4 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#005D3B;margin-bottom:8px">🔩 Materiais e Acessórios</h4>
                <div style="overflow-x:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:13px">
                        <thead><tr>
                            <th style="${thStyle}">Material</th>
                            <th style="${thStyle}">Código</th>
                            <th style="${thStyle};text-align:center">Un.</th>
                            <th style="${thStyle};text-align:right">Sist.</th>
                            <th style="${thStyle};text-align:right;width:130px">Contado</th>
                            <th style="${thStyle};text-align:right;width:100px">Diferença</th>
                        </tr></thead>
                        <tbody id="balanco-tbody-mats">${rowsMats}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    // Oculta rolos esgotados por padrão ao abrir
    if (rolosEsgotados.length) _filtrarBalanco();
}

function _filtrarBalanco() {
    const nome         = (document.getElementById('balanco-filter-nome')?.value || '').toLowerCase().trim();
    const ref          = (document.getElementById('balanco-filter-ref')?.value  || '').toLowerCase().trim();
    const mostrarEsg   = document.getElementById('balanco-show-esgotados')?.checked ?? true;
    document.querySelectorAll('#balanco-tbody-tecidos tr[data-balanco-nome], #balanco-tbody-mats tr[data-balanco-nome]').forEach(tr => {
        const trNome     = tr.dataset.balancoNome || '';
        const trRef      = tr.dataset.balancoRef  || '';
        const isEsgotado = tr.dataset.esgotado === '1';
        const passaNome  = !nome || trNome.includes(nome);
        const passaRef   = !ref  || trRef.includes(ref);
        const passaEsg   = !isEsgotado || mostrarEsg;
        tr.style.display = passaNome && passaRef && passaEsg ? '' : 'none';
    });
}

function _limparFiltrosBalanco() {
    const n = document.getElementById('balanco-filter-nome');
    const r = document.getElementById('balanco-filter-ref');
    if (n) n.value = '';
    if (r) r.value = '';
    _filtrarBalanco();
}

async function _logoBase64() {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                resolve(c.toDataURL('image/png'));
            } catch(e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = 'images/logo.png';
    });
}

function _diffBalanco(input) {
    const sys = parseFloat(input.dataset.sys) || 0;
    const contado = input.value === '' ? null : parseFloat(input.value);
    const roloId = input.dataset.balancoRolo;
    const matId  = input.dataset.balancoMat;
    const cellId = roloId ? `diff-rolo-${roloId}` : `diff-mat-${matId}`;
    const cell   = document.getElementById(cellId);
    if (!cell) return;
    if (contado === null || isNaN(contado)) { cell.textContent = '—'; cell.style.color = '#8F8F8F'; return; }
    const diff = contado - sys;
    const fmt  = (Math.abs(diff)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (Math.abs(diff) < 0.001) { cell.textContent = '='; cell.style.color = '#8F8F8F'; }
    else if (diff > 0)  { cell.textContent = `+${fmt}`; cell.style.color = '#005D3B'; }
    else                { cell.textContent = `−${fmt}`; cell.style.color = '#F43927'; }
}

async function exportarBalancoPDF() {
    const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const logoSrc  = await _logoBase64();
    const logoHtml = logoSrc
        ? `<img src="${logoSrc}" style="width:52px;height:52px;object-fit:contain;border-radius:10px;border:1px solid #E0E0E0;padding:4px;background:#fff">`
        : `<div style="width:52px;height:52px;background:#005D3B;border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:20px">S</div>`;

    const trStyle = 'border-bottom:1px solid #E0E0E0';
    const th = (t, extra='') => `<th style="background:#FAFAFA;padding:10px 12px;border-bottom:2px solid #E0E0E0;font-size:11px;color:#444;text-align:left;${extra}">${t}</th>`;
    const td = (t, extra='') => `<td style="padding:10px 12px;font-size:12px;${extra}">${t}</td>`;
    const tdBlank = (w='120px') => `<td style="padding:10px 12px;border-bottom:1px solid #aaa;width:${w}"></td>`;

    // Lê apenas linhas visíveis do modal (respeita filtros ativos)
    const visibleTec = [...document.querySelectorAll('#balanco-tbody-tecidos tr[data-balanco-nome]')]
        .filter(tr => tr.style.display !== 'none');
    const visibleMat = [...document.querySelectorAll('#balanco-tbody-mats tr[data-balanco-nome]')]
        .filter(tr => tr.style.display !== 'none');

    const filtroNome = (document.getElementById('balanco-filter-nome')?.value || '').trim();
    const filtroRef  = (document.getElementById('balanco-filter-ref')?.value  || '').trim();
    const filtroAtivo = filtroNome || filtroRef;
    const filtroDesc = [filtroNome && `Nome: "${filtroNome}"`, filtroRef && `Código: "${filtroRef}"`].filter(Boolean).join(' · ');

    let rowsTec = '';
    visibleTec.forEach(tr => {
        const cells    = tr.querySelectorAll('td');
        const esgotado = tr.dataset.esgotado === '1';
        const nomeCell = cells[0]?.textContent?.replace(/ESGOTADO/g, '').trim() || '—';
        const extra    = esgotado ? 'color:#8F8F8F;font-style:italic' : '';
        rowsTec += `<tr style="${trStyle}">${td(nomeCell + (esgotado ? ' (esgotado)' : ''), extra)}${td(cells[1]?.textContent||'—', extra)}${td(cells[2]?.textContent||'—', 'text-align:right;'+extra)}${tdBlank('120px')}${tdBlank('100px')}</tr>`;
    });

    let rowsMat = '';
    visibleMat.forEach(tr => {
        const cells = tr.querySelectorAll('td');
        rowsMat += `<tr style="${trStyle}">${td(cells[0]?.textContent||'—')}${td(cells[1]?.textContent||'—')}${td(cells[2]?.textContent||'un','text-align:center')}${td(cells[3]?.textContent||'—','text-align:right')}${tdBlank('120px')}${tdBlank('100px')}</tr>`;
    });

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Balanço de Estoque — ${dataHoje}</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; }
        body { padding:32px 40px; color:#242424; background:#fff; }
        @media print {
            @page { size: A4; margin:20mm 18mm; }
            body { padding:0; }
            .no-print { display:none !important; }
        }
        table { width:100%; border-collapse:collapse; margin-bottom:32px; }
        h2 { font-size:21px; font-weight:800; margin-bottom:2px; }
        h3 { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#005D3B; margin:24px 0 10px; border-left:3px solid #005D3B; padding-left:8px; }
    </style>
    </head><body>

    <!-- Cabeçalho -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;border-bottom:3px solid #005D3B;margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:14px">
            ${logoHtml}
            <div>
                <div style="font-size:20px;font-weight:800;color:#005D3B;line-height:1.1">SCTech</div>
                <div style="font-size:11px;color:#8F8F8F;margin-top:2px">Sistema de Gestão</div>
            </div>
        </div>
        <div style="text-align:right">
            <h2 style="color:#242424">Balanço de Estoque</h2>
            <div style="font-size:12px;color:#8F8F8F;margin-top:4px">Data: <strong>${dataHoje}</strong></div>
            <div style="font-size:12px;margin-top:8px;display:flex;align-items:center;gap:6px;justify-content:flex-end">
                Responsável:&nbsp;<span style="display:inline-block;min-width:200px;border-bottom:1px solid #999">&nbsp;</span>
            </div>
        </div>
    </div>

    ${filtroAtivo ? `<div style="margin-bottom:20px;padding:8px 12px;background:#FEFAE9;border:1px solid #F2C924;border-radius:6px;font-size:11px;color:#8A6A00">
        <strong>Filtro aplicado:</strong> ${filtroDesc} — exibindo ${visibleTec.length} tecido(s) e ${visibleMat.length} material(is).
    </div>` : ''}

    <h3>Tecidos / Rolos</h3>
    <table>
        <thead><tr>${th('Tecido')}${th('Código')}${th('Qtd. Sistema','text-align:right')}${th('Qtd. Contada','text-align:right;width:130px')}${th('Diferença','text-align:right;width:110px')}</tr></thead>
        <tbody>${rowsTec || `<tr><td colspan="5" style="padding:14px;color:#aaa;text-align:center">${filtroAtivo ? 'Nenhum tecido corresponde ao filtro' : 'Nenhum rolo em estoque'}</td></tr>`}</tbody>
    </table>

    <h3>Materiais e Acessórios</h3>
    <table>
        <thead><tr>${th('Material')}${th('Código')}${th('Un.','text-align:center;width:60px')}${th('Qtd. Sistema','text-align:right')}${th('Qtd. Contada','text-align:right;width:130px')}${th('Diferença','text-align:right;width:110px')}</tr></thead>
        <tbody>${rowsMat || `<tr><td colspan="6" style="padding:14px;color:#aaa;text-align:center">${filtroAtivo ? 'Nenhum material corresponde ao filtro' : 'Nenhum material em estoque'}</td></tr>`}</tbody>
    </table>

    <!-- Assinaturas -->
    <div style="margin-top:48px;display:flex;justify-content:space-between;gap:24px;padding-top:20px;border-top:1px solid #E0E0E0">
        <div style="text-align:center;flex:1">
            <div style="border-top:1px solid #555;margin:0 16px 8px;padding-top:8px"></div>
            <div style="font-size:11px;color:#8F8F8F">Responsável pelo Balanço</div>
        </div>
        <div style="text-align:center;flex:1">
            <div style="border-top:1px solid #555;margin:0 16px 8px;padding-top:8px"></div>
            <div style="font-size:11px;color:#8F8F8F">Supervisor / Aprovação</div>
        </div>
        <div style="text-align:center;flex:1">
            <div style="border-top:1px solid #555;margin:0 16px 8px;padding-top:8px"></div>
            <div style="font-size:11px;color:#8F8F8F">Data de Conclusão</div>
        </div>
    </div>

    <script>window.onload = () => window.print();<\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}

function _showConfirmBalanco(ajustes) {
    return new Promise(resolve => {
        const o = _getModal();
        document.getElementById('sc-modal-icon').textContent = '📋';
        const msgEl = document.getElementById('sc-modal-msg');

        const fmt = (v, un) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (un ? ' ' + un : '');
        let listHtml = `<strong style="font-size:14px;display:block;margin-bottom:10px">Confirmar ${ajustes.length} ajuste(s) no estoque?</strong>`;
        listHtml += `<div style="max-height:240px;overflow-y:auto;text-align:left;border:1px solid #E0E0E0;border-radius:8px;background:#FAFAFA">`;
        ajustes.forEach((a, i) => {
            const nome   = a.tipo === 'rolo'
                ? ((db.catalogo.find(c => c.id === a.rolo.tecido_id)?.nome || 'Tecido') + (a.rolo.lote ? ` [${a.rolo.lote}]` : ''))
                : a.mat.nome;
            const antes  = a.tipo === 'rolo' ? (a.rolo.metragem_atual || 0) : (a.mat.estoque_atual || 0);
            const un     = a.tipo === 'rolo' ? 'm' : (a.mat.unidade || 'un');
            const diff   = a.contado - antes;
            const color  = diff > 0 ? '#005D3B' : '#F43927';
            const sign   = diff > 0 ? '+' : '';
            const sep    = i < ajustes.length - 1 ? 'border-bottom:1px solid #E0E0E0' : '';
            listHtml += `<div style="padding:8px 12px;${sep};display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:12px">
                <span style="color:var(--dark);font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${nome}</span>
                <span style="white-space:nowrap;flex-shrink:0;color:#8F8F8F">
                    ${fmt(antes, un)} → <strong style="color:${color}">${fmt(a.contado, un)}</strong>
                    <span style="color:${color};margin-left:4px">(${sign}${fmt(Math.abs(diff), '')})</span>
                </span>
            </div>`;
        });
        listHtml += `</div><p style="font-size:11px;color:#8F8F8F;margin-top:10px">As quantidades serão registradas no histórico de movimentações.</p>`;
        msgEl.innerHTML = listHtml;

        const btns = document.getElementById('sc-modal-btns');
        btns.innerHTML = `<button class="btn btn-outline" id="sc-modal-cancel">Cancelar</button><button class="btn btn-success" id="sc-modal-ok">Confirmar Ajustes</button>`;
        o.style.display = 'flex';
        const close = val => {
            o.style.display = 'none';
            document.removeEventListener('keydown', esc);
            msgEl.innerHTML = '';
            resolve(val);
        };
        const esc = e => { if (e.key === 'Escape') close(false); };
        document.getElementById('sc-modal-ok').addEventListener('click', () => close(true), { once: true });
        document.getElementById('sc-modal-cancel').addEventListener('click', () => close(false), { once: true });
        document.addEventListener('keydown', esc);
        document.getElementById('sc-modal-ok').focus();
    });
}

function _atualizarLinhasBalanco(ajustes) {
    const fmt2 = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ajustes.forEach(a => {
        if (a.tipo === 'rolo') {
            const input = document.querySelector(`[data-balanco-rolo="${a.rolo.id}"]`);
            if (!input) return;
            const novo = a.rolo.metragem_atual;
            input.dataset.sys = novo;
            input.value = '';
            const cells = input.closest('tr')?.querySelectorAll('td');
            if (cells?.[2]) cells[2].textContent = fmt2(novo) + ' m';
            const diffCell = document.getElementById(`diff-rolo-${a.rolo.id}`);
            if (diffCell) { diffCell.textContent = '—'; diffCell.style.color = '#8F8F8F'; }
        } else {
            const input = document.querySelector(`[data-balanco-mat="${a.mat.id}"]`);
            if (!input) return;
            const novo = a.mat.estoque_atual;
            input.dataset.sys = novo;
            input.value = '';
            const cells = input.closest('tr')?.querySelectorAll('td');
            if (cells?.[3]) cells[3].textContent = fmt2(novo);
            const diffCell = document.getElementById(`diff-mat-${a.mat.id}`);
            if (diffCell) { diffCell.textContent = '—'; diffCell.style.color = '#8F8F8F'; }
        }
    });
}

async function aplicarAjustesBalanco() {
    const ajustes = [];

    document.querySelectorAll('[data-balanco-rolo]').forEach(input => {
        if (input.value === '') return;
        const contado = parseFloat(input.value);
        if (isNaN(contado)) return;
        const rolo = db.estoque.find(r => r.id == input.dataset.balancoRolo);
        if (!rolo) return;
        const diff = contado - (rolo.metragem_atual || 0);
        if (Math.abs(diff) < 0.001) return;
        ajustes.push({ tipo: 'rolo', rolo, diff, contado });
    });

    document.querySelectorAll('[data-balanco-mat]').forEach(input => {
        if (input.value === '') return;
        const contado = parseFloat(input.value);
        if (isNaN(contado)) return;
        const mat = db.materiais.find(m => m.id == input.dataset.balancoMat);
        if (!mat) return;
        const diff = contado - (mat.estoque_atual || 0);
        if (Math.abs(diff) < 0.001) return;
        ajustes.push({ tipo: 'mat', mat, diff, contado });
    });

    if (!ajustes.length) {
        toast('Nenhuma diferença para ajustar. Preencha as quantidades contadas.', 'info');
        return;
    }

    if (!await _showConfirmBalanco(ajustes)) return;

    ajustes.forEach(a => {
        if (a.tipo === 'rolo') {
            const cat  = db.catalogo.find(c => c.id === a.rolo.tecido_id);
            const nome = (cat ? cat.nome : 'Tecido') + ' [' + (a.rolo.lote || '') + ']';
            a.rolo.metragem_atual = Math.max(0, a.contado);
            registrarMovimento(a.diff >= 0 ? 'Ajuste +' : 'Ajuste -', nome, 'tecido', a.diff, 'm', a.rolo.lote || '');
        } else {
            a.mat.estoque_atual = Math.max(0, a.contado);
            registrarMovimento(a.diff >= 0 ? 'Ajuste +' : 'Ajuste -', a.mat.nome, 'material', a.diff, a.mat.unidade || 'un', a.mat.referencia || '');
        }
    });

    syncDB();
    _atualizarLinhasBalanco(ajustes);
    toast(`${ajustes.length} ajuste(s) aplicado(s) com sucesso!`, 'success');
    renderEstoque();
    renderEstoqueMateriais();
}

// ─────────────────────────────────────────────────────────────────────────────

async function salvarEntradaEstoque() {
    const referencia = document.getElementById('est-lote').value.trim();
    const tecidoId   = parseInt(document.getElementById('est-tecido').value);
    const metros     = parseFloat(document.getElementById('est-metros').value);
    const data       = document.getElementById('est-data').value;
    const custo      = parseFloat(document.getElementById('est-preco-custo')?.value) || 0;
    const markup     = parseFloat(document.getElementById('est-markup')?.value) || 0;
    if (!referencia)            { await showAlert('Informe a referência do rolo.', '⚠️'); return; }
    if (!tecidoId)              { await showAlert('Escolha o tecido na lista de sugestões.', '⚠️'); return; }
    if (!metros || metros <= 0) { await showAlert('Informe a metragem do rolo.', '⚠️'); return; }
    const nomeTecConf = db.catalogo.find(t => t.id === tecidoId)?.nome || '—';
    const precoVendaConf = custo > 0 ? (custo * (1 + markup / 100)).toFixed(2) : null;
    const linhaPreco = custo > 0 ? `\nCusto: R$ ${custo.toFixed(2)}/m  →  Venda: R$ ${precoVendaConf}/m` : '';
    if (!await showConfirm(`Confirmar entrada de rolo?\n\nTecido: ${nomeTecConf}\nCódigo: ${referencia}\nMetragem: ${metros} m${linhaPreco}`, '📦', 'Confirmar Entrada', 'Cancelar')) return;
    db.estoque.push({ id: Date.now(), tecido_id: tecidoId, lote: referencia, metragem_inicial: metros, metragem_atual: metros, data_entrada: data });
    if (custo > 0) {
        const tec = db.catalogo.find(t => t.id === tecidoId);
        if (tec) {
            tec.preco_custo = custo;
            tec.preco = Math.round(custo * (1 + markup / 100) * 100) / 100;
        }
    }
    const nomeTec = db.catalogo.find(t => t.id === tecidoId)?.nome || 'Tecido';
    registrarMovimento('Entrada', `${nomeTec} — Código ${referencia}`, 'tecido', metros, 'm', referencia);
    salvarERecarregar('Entrada registrada!');
}

function autoFillTecidoNoAmbiente(ambId, tidx) {
    const ref = document.getElementById(`a-tec-ref-${ambId}-${tidx}`)?.value.trim();
    if (!ref || ref.length < 2) return;
    const tec = db.catalogo.find(c => c.referencia && c.referencia.toLowerCase() === ref.toLowerCase());
    if (!tec) return;
    const sel = document.getElementById(`a-tecido-${ambId}-${tidx}`);
    if (sel) sel.value = String(tec.id);
}

function autoFillRefFromTecido(ambId, tidx) {
    const selEl = document.getElementById(`a-tecido-${ambId}-${tidx}`);
    if (!selEl || !selEl.value) return;
    const tec = db.catalogo.find(c => c.id == selEl.value);
    const refEl = document.getElementById(`a-tec-ref-${ambId}-${tidx}`);
    if (refEl) refEl.value = tec?.referencia || '';
}

// ═══════════════════════════════════════════════════════════════════════
// CAMPO DE BUSCA COM SUGESTOES
// ═══════════════════════════════════════════════════════════════════════
//
// Substitui os <select> de tecido e de material nas entradas de estoque. Um
// input de texto visivel, com o nome, e um input escondido com o ID: o ID e' a
// fonte da verdade, e por isso mexer no texto o limpa — ver um nome na tela e
// gravar outro item seria pior do que nao achar nada.
//
// Uma implementacao so para os dois campos. O <select> que saiu dava para usar
// pelo teclado, entao setas, Enter e Esc continuam funcionando aqui.

const _BUSCAS = {
    'est-tecido': {
        itens: () => db.catalogo,
        rotulo: c => c.nome,
        aoEscolher: () => autoFillEntradaTecido(),
        vazio: 'Nenhum tecido com esse código ou nome'
    },
    'est-mat-id': {
        itens: () => db.materiais,
        rotulo: m => `${m.nome} (${m.unidade || 'un'})`,
        aoEscolher: () => autoFillEntradaMaterialById(),
        vazio: 'Nenhum material com esse código ou nome'
    }
};

// Qual sugestao esta percorrida pelo teclado, por campo. -1 = nenhuma.
const _buscaAtiva = {};

function _buscaNormaliza(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function _buscaAchados(campo) {
    const cfg = _BUSCAS[campo];
    const termo = _buscaNormaliza(document.getElementById(campo + '-busca')?.value);
    if (!termo) return [];
    return cfg.itens().filter(i =>
        _buscaNormaliza(i.nome).includes(termo) || _buscaNormaliza(i.referencia).includes(termo)
    ).slice(0, 12);
}

function _buscaRender(campo) {
    const caixa = document.getElementById(campo + '-sug');
    if (!caixa) return;
    const achados = _buscaAchados(campo);
    const ativa = _buscaAtiva[campo];

    if (!document.getElementById(campo + '-busca')?.value.trim()) {
        caixa.classList.remove('aberta'); caixa.innerHTML = ''; return;
    }
    if (!achados.length) {
        caixa.innerHTML = `<div class="consulta-sug-item" style="cursor:default;color:var(--muted)">${escapeHtml(_BUSCAS[campo].vazio)}</div>`;
        caixa.classList.add('aberta');
        return;
    }
    caixa.innerHTML = achados.map((i, n) => `
        <div class="consulta-sug-item${n === ativa ? ' ativa' : ''}" onclick="buscaEscolher('${campo}', ${i.id})">
            <span class="consulta-sug-cod">${escapeHtml(i.referencia || '—')}</span>
            <span class="consulta-sug-nome">${escapeHtml(_BUSCAS[campo].rotulo(i))}</span>
        </div>`).join('');
    caixa.classList.add('aberta');
    caixa.querySelector('.consulta-sug-item.ativa')?.scrollIntoView({ block: 'nearest' });
}

// Digitar invalida a escolha anterior: o texto e o id precisam andar juntos.
function buscaDigitou(campo) {
    const esc = document.getElementById(campo);
    if (esc) esc.value = '';
    _buscaAtiva[campo] = -1;
    _buscaRender(campo);
}

function buscaEscolher(campo, id) {
    const item = _BUSCAS[campo].itens().find(i => i.id == id);
    if (!item) return;
    const esc = document.getElementById(campo);
    const txt = document.getElementById(campo + '-busca');
    if (esc) esc.value = String(item.id);
    if (txt) txt.value = _BUSCAS[campo].rotulo(item);
    buscaFechar(campo);
    _BUSCAS[campo].aoEscolher();
}

function buscaFechar(campo) {
    _buscaAtiva[campo] = -1;
    const caixa = document.getElementById(campo + '-sug');
    if (caixa) { caixa.classList.remove('aberta'); caixa.innerHTML = ''; }
}

function buscaTecla(campo, e) {
    const achados = _buscaAchados(campo);
    const aberta = document.getElementById(campo + '-sug')?.classList.contains('aberta');
    if (e.key === 'Escape') { buscaFechar(campo); return; }
    if (!achados.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!aberta) { _buscaRender(campo); return; }
        const total = achados.length;
        const atual = _buscaAtiva[campo] === undefined ? -1 : _buscaAtiva[campo];
        // Da' a volta nas duas pontas: do ultimo para o primeiro e vice-versa.
        _buscaAtiva[campo] = e.key === 'ArrowDown'
            ? (atual + 1) % total
            : (atual <= 0 ? total - 1 : atual - 1);
        _buscaRender(campo);
        return;
    }
    if (e.key === 'Enter') {
        // Sem nada percorrido, um unico achado e' escolha obvia; varios, nao.
        const alvo = _buscaAtiva[campo] >= 0 ? achados[_buscaAtiva[campo]]
            : (achados.length === 1 ? achados[0] : null);
        if (alvo) { e.preventDefault(); buscaEscolher(campo, alvo.id); }
    }
}

// Preenche de fora (ex.: achar o tecido pelo lote digitado).
function buscaDefinir(campo, id) {
    const item = _BUSCAS[campo].itens().find(i => i.id == id);
    if (!item) return;
    const esc = document.getElementById(campo);
    const txt = document.getElementById(campo + '-busca');
    if (esc) esc.value = String(item.id);
    if (txt) txt.value = _BUSCAS[campo].rotulo(item);
    buscaFechar(campo);
}

document.addEventListener('click', e => {
    Object.keys(_BUSCAS).forEach(campo => {
        if (e.target.closest && e.target.closest('#' + campo + '-campo')) return;
        buscaFechar(campo);
    });
});

function autoFillEntradaTecido() {
    const tecidoId = parseInt(document.getElementById('est-tecido')?.value);
    if (!tecidoId) return;
    const tec = db.catalogo.find(t => t.id === tecidoId);
    const ultimoRolo = db.estoque.filter(r => r.tecido_id === tecidoId).sort((a, b) => b.id - a.id)[0];
    if (ultimoRolo) {
        const metrosEl = document.getElementById('est-metros');
        if (metrosEl) metrosEl.value = ultimoRolo.metragem_inicial;
    }
    if (tec) {
        // Escolher o tecido pelo nome preenche a referencia com o codigo dele,
        // para nao ser preciso saber o codigo de cor. So preenche se o campo
        // estiver VAZIO: se o usuario ja digitou um banho de cor, ele manda.
        const refEl = document.getElementById('est-lote');
        if (refEl && !refEl.value.trim() && tec.referencia) refEl.value = tec.referencia;
        const custoEl = document.getElementById('est-preco-custo');
        if (custoEl && tec.preco_custo) custoEl.value = tec.preco_custo;
        const markupEl = document.getElementById('est-markup');
        if (markupEl && tec.preco_custo > 0 && tec.preco > 0)
            markupEl.value = Math.round(((tec.preco / tec.preco_custo) - 1) * 100);
        calcularPrecoVendaTecido();
    }
}

function autoFillEntradaMaterialById() {
    const matId = parseInt(document.getElementById('est-mat-id')?.value);
    if (!matId) return;
    const mat = db.materiais.find(m => m.id === matId);
    if (!mat) return;
    const lastMov = db.movimentos.filter(m => m.item_nome === mat.nome && m.tipo === 'Entrada').sort((a, b) => b.id - a.id)[0];
    if (lastMov) {
        const qtdEl = document.getElementById('est-mat-qtd');
        if (qtdEl) qtdEl.value = lastMov.quantidade;
    }
    if (mat.preco_custo > 0) {
        const custoEl = document.getElementById('est-mat-preco-custo');
        if (custoEl) custoEl.value = mat.preco_custo;
        const markupEl = document.getElementById('est-mat-markup');
        if (markupEl && mat.preco > 0)
            markupEl.value = Math.round(((mat.preco / mat.preco_custo) - 1) * 100);
        calcularPrecoVendaMat();
    }
}

function autoFillTecidoPorReferencia() {
    const ref = document.getElementById('est-lote')?.value.trim();
    if (!ref || ref.length < 2) return;
    if (!document.getElementById('est-tecido')) return;
    const tec = db.catalogo.find(c => c.referencia && c.referencia.toLowerCase() === ref.toLowerCase());
    if (tec) { buscaDefinir('est-tecido', tec.id); autoFillEntradaTecido(); return; }
    const existing = db.estoque.find(r => r.lote && r.lote.toLowerCase() === ref.toLowerCase());
    if (existing) { buscaDefinir('est-tecido', existing.tecido_id); autoFillEntradaTecido(); }
}

// Qual tecido esta com os rolos abertos na aba Estoque. Um de cada vez.
let _estoqueTecidoAberto = null;

function alternarRolosDoTecido(id) {
    _estoqueTecidoAberto = _estoqueTecidoAberto === id ? null : id;
    renderEstoque();
}

function mostrarBaixaForm(roloId) {
    document.querySelectorAll('.baixa-form').forEach(el => { el.style.display = 'none'; });
    const row = document.getElementById('baixa-' + roloId);
    if (row) row.style.display = 'table-row';
}
function cancelarBaixa() {
    document.querySelectorAll('.baixa-form').forEach(el => { el.style.display = 'none'; });
}
async function confirmarBaixa(roloId) {
    const rolo = db.estoque.find(r => r.id == roloId);
    if (!rolo) return;
    const qtd = parseFloat(document.getElementById('baixa-qtd-' + roloId).value);
    if (!qtd || qtd <= 0) { await showAlert('Informe a quantidade a baixar.', '⚠️'); return; }
    if (qtd > rolo.metragem_atual) { await showAlert(`Quantidade maior que o saldo disponível (${rolo.metragem_atual.toFixed(3)} m).`, '⚠️'); return; }
    rolo.metragem_atual = Math.round((rolo.metragem_atual - qtd) * 1000) / 1000;
    const nomeTecBaixa = db.catalogo.find(t => t.id === rolo.tecido_id)?.nome || 'Tecido';
    registrarMovimento('Baixa Manual', `${nomeTecBaixa} — Ref. ${rolo.lote}`, 'tecido', qtd, 'm', '');
    salvarERecarregar('Baixa de estoque registrada!');
}
async function removerRolo(id) {
    if (!await showConfirm('Remover este rolo do estoque?', '🗑️', 'Remover', 'Cancelar')) return;
    db.estoque = db.estoque.filter(r => r.id != id);
    salvarERecarregar('Rolo removido.');
}

// Um tecido "já teve entrada" se existe rolo dele — mesmo zerado, porque rolo
// esgotado continua sendo histórico de compra — ou se há movimento de entrada
// registrado em nome dele.
function teveEntradaDeTecido(tecidoId) {
    if ((db.estoque || []).some(r => r.tecido_id == tecidoId)) return true;
    const tec = (db.catalogo || []).find(c => c.id == tecidoId);
    if (!tec) return false;
    return (db.movimentos || []).some(mv =>
        mv.tipo === 'Entrada' && mv.item_tipo === 'tecido' && mv.item_nome === tec.nome);
}

// Recolhe ou mostra a lista de alertas de estoque mínimo. A escolha fica
// guardada, senão o usuário teria de recolher de novo a cada visita.
function alternarAlertasTecido() {
    const atual = localStorage.getItem('sc_alertas_tecido_recolhidos') === '1';
    localStorage.setItem('sc_alertas_tecido_recolhidos', atual ? '0' : '1');
    renderEstoque();
}

// --- ESTOQUE DE TECIDO: renderização ---
function renderEstoque() {
    const tb = document.getElementById('tb-estoque');
    if (!tb) return;

    const alertBox = document.getElementById('alertas-ponto-pedido');
    if (alertBox) {
        // Só alerta tecido que JÁ TEVE entrada. Um tecido recém-cadastrado e
        // nunca comprado não está "abaixo do mínimo" — está apenas por usar, e
        // avisar sobre ele enche a tela de ruído.
        const criticos = db.catalogo.filter(c =>
            !temEstoqueInfinito(c) && c.min_estoque > 0 && teveEntradaDeTecido(c.id) && estoqueDisponivel(c.id) < c.min_estoque);
        if (criticos.length) {
            const recolhido = localStorage.getItem('sc_alertas_tecido_recolhidos') === '1';
            alertBox.innerHTML = `
                <div class="alertas-cabecalho">
                    <span>⚠ ${criticos.length} tecido(s) abaixo do estoque mínimo</span>
                    <button type="button" class="alertas-toggle" onclick="alternarAlertasTecido()">
                        ${recolhido ? 'Mostrar' : 'Recolher'}
                    </button>
                </div>
                <div class="alertas-corpo" ${recolhido ? 'style="display:none"' : ''}>
                    ${criticos.map(c =>
                        `<div class="alerta-item">⚠ <strong>${escapeHtml(c.nome)}</strong>: ${estoqueDisponivel(c.id).toFixed(2)} m disponível — mínimo: ${c.min_estoque} m</div>`
                    ).join('')}
                </div>`;
            alertBox.style.display = 'block';
        } else {
            alertBox.innerHTML = '';
            alertBox.style.display = 'none';
        }
    }

    // Uma linha por tecido, nas mesmas colunas do Cadastro/Catálogo (mais a
    // unidade, pedida para o módulo de estoque). Os rolos — com Baixar e
    // Remover — aparecem ao clicar na linha, como na Consulta de Estoque.
    let html = '';
    pintarCabecalhoOrdenacao('#tabela-est-tecidos', catSortState);
    ordenarLista(db.catalogo, catSortState, valorOrdenacaoTecido).forEach(tec => {
        const rolos = db.estoque.filter(r => r.tecido_id == tec.id);
        const infinito = temEstoqueInfinito(tec);
        const totalDisp = rolos.reduce((s, r) => s + r.metragem_atual, 0);
        const abaixoMin = !infinito && tec.min_estoque > 0 && totalDisp < tec.min_estoque;
        const aberto = _estoqueTecidoAberto === tec.id;
        const saldo = infinito ? '<strong title="Estoque infinito">∞</strong>'
            : `<strong>${totalDisp.toFixed(2)}</strong> m`;

        html += `<tr class="est-tec-linha${aberto ? ' aberta' : ''}" onclick="alternarRolosDoTecido(${tec.id})">
            <td class="col-codigo" title="${escapeHtml(tec.referencia || '')}">${escapeHtml(tec.referencia || '—')}</td>
            <td class="col-nome" title="${escapeHtml(tec.nome)}"><strong>${escapeHtml(tec.nome)}</strong>${abaixoMin ? ' <span class="badge-alerta">⚠</span>' : ''}</td>
            <td class="col-un">m</td>
            <td class="col-num">${(tec.largura_rolo || 2.80).toFixed(2)} m</td>
            <td class="col-num">${saldo}</td>
            <td class="col-num">${textoMinimo(tec, 'm')}</td>
            <td class="col-num">${tec.preco > 0 ? 'R$ ' + tec.preco.toFixed(2) : '—'}</td>
            <td class="col-forn" title="${escapeHtml(tec.fornecedor_nome || '')}">${escapeHtml(tec.fornecedor_nome || '—')}</td>
            <td class="col-acoes">${rolos.length ? `${rolos.length} rolo(s) ${aberto ? '▲' : '▼'}` : '<span style="color:#999">sem rolo</span>'}</td>
        </tr>`;

        if (!aberto || !rolos.length) return;
        html += `<tr class="est-tec-rolos"><td colspan="9"><table class="est-rolos-tabela">
            <thead><tr><th>Código</th><th>Metragem inicial</th><th>Disponível</th><th>Ocupação</th><th>Entrada</th><th>Ações</th></tr></thead>
            <tbody>` + rolos.map(r => {
            const pct = r.metragem_inicial > 0 ? Math.round((r.metragem_atual / r.metragem_inicial) * 100) : 0;
            const cor = pct > 40 ? '#005D3B' : pct > 15 ? '#F2C924' : '#F43927';
            const esgotado = r.metragem_atual <= 0;
            return `<tr class="${esgotado ? 'rolo-esgotado' : ''}">
                <td>${escapeHtml(r.lote)}</td>
                <td>${infinito ? '∞' : r.metragem_inicial.toFixed(2) + ' m'}</td>
                <td><strong>${infinito ? '∞' : r.metragem_atual.toFixed(3) + ' m'}</strong></td>
                <td>${infinito ? '<span style="font-size:11px;color:#8F8F8F">sem controle de estoque</span>'
                    : `<div class="progresso-bar"><div class="progresso-fill" style="width:${pct}%;background:${cor}"></div></div><span style="font-size:11px;color:#888">${pct}%</span>`}</td>
                <td>${new Date(r.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td onclick="event.stopPropagation()">
                    ${infinito ? '' : (!esgotado ? `<button class="btn btn-outline btn-sm" onclick="mostrarBaixaForm(${r.id})">↓ Baixar</button>` : '<span class="badge-esgotado">Esgotado</span>')}
                    <button class="btn btn-outline btn-sm btn-danger" onclick="removerRolo(${r.id})">🗑️</button>
                </td>
            </tr>
            ${infinito ? '' : `<tr id="baixa-${r.id}" class="baixa-form" style="display:none">
                <td colspan="6" class="baixa-form-cell" onclick="event.stopPropagation()">
                    <strong>Baixar rolo ${escapeHtml(r.lote)}</strong> — saldo: <strong>${r.metragem_atual.toFixed(3)} m</strong> &emsp;
                    <input type="number" id="baixa-qtd-${r.id}" placeholder="Metros a baixar" step="0.001" min="0.001" max="${r.metragem_atual}" style="width:160px;padding:5px 8px;border:1px solid #ccc;border-radius:4px">
                    <button class="btn btn-sm" style="background:#F2C924" onclick="confirmarBaixa(${r.id})">Confirmar Baixa</button>
                    <button class="btn btn-outline btn-sm" onclick="cancelarBaixa()">Cancelar</button>
                </td>
            </tr>`}`;
        }).join('') + `</tbody></table></td></tr>`;
    });
    tb.innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#999;padding:24px;">Nenhum tecido cadastrado. <a href="catalogo.html">Cadastre em Catálogo</a>.</td></tr>';
}

// --- MATERIAIS (acessórios, ferragens, trilhos, etc.) ---
async function salvarMaterial() {
    const referencia = document.getElementById('mat-ref')?.value.trim() || '';
    const nome = document.getElementById('mat-nome')?.value.trim();
    const unidade = document.getElementById('mat-unidade')?.value || 'un';
    const min_estoque = parseFloat(document.getElementById('mat-min')?.value) || 0;
    if (!nome) { await showAlert('Informe o nome do material.', '⚠️'); return; }
    const forn_id_mat  = parseInt(document.getElementById('mat-fornecedor')?.value) || null;
    const forn_obj_mat = forn_id_mat ? db.fornecedores.find(f => f.id === forn_id_mat) : null;
    if (editandoMaterialId !== null) {
        const m = db.materiais.find(x => x.id == editandoMaterialId);
        if (m) {
            const preco = parseFloat(document.getElementById('mat-preco')?.value) || m.preco || 0;
            const dupNome = db.materiais.find(x => x.id != editandoMaterialId && x.nome.trim().toLowerCase() === nome.toLowerCase());
            if (dupNome) { await showAlert(`Já existe outro material com o nome "${dupNome.nome}".`, '⚠️'); return; }
            if (referencia) {
                const dupRef = db.materiais.find(x => x.id != editandoMaterialId && x.referencia && x.referencia.toLowerCase() === referencia.toLowerCase());
                if (dupRef) { await showAlert(`Código "${referencia}" já usado por "${dupRef.nome}".`, '⚠️'); return; }
            }
            const eraInfinito = temEstoqueInfinito(m);
            const ficaInfinito = _matEstado.estoqueModo === 'infinito';
            if (eraInfinito && !ficaInfinito) {
                const ok = await showConfirm(
                    `"${m.nome}" passa a ter estoque controlado.\n\nO saldo infinito será apagado e o material fica zerado até você dar entrada nele.`,
                    '📦', 'Zerar e controlar', 'Cancelar');
                if (!ok) return;
                m.estoque_atual = 0;
                registrarMovimento('Saída', m.nome, 'material', 0, unidade, 'Passou a ter estoque controlado');
            }
            if (!eraInfinito && ficaInfinito) {
                registrarMovimento('Entrada', m.nome, 'material', 0, unidade, 'Passou a ter estoque infinito');
            }
            Object.assign(m, { referencia, nome, unidade, preco, min_estoque: ficaInfinito ? 0 : min_estoque, estoque_infinito: ficaInfinito, fornecedor_id: forn_id_mat, fornecedor_nome: forn_obj_mat ? forn_obj_mat.nome : '' });
        }
        editandoMaterialId = null;
        const precoGroup = document.getElementById('mat-preco-group');
        if (precoGroup) precoGroup.style.display = 'none';
        salvarERecarregar('Material atualizado!');
    } else {
        const dup = db.materiais.find(m => m.nome.trim().toLowerCase() === nome.toLowerCase());
        if (dup) { await showAlert(`Já existe um material com o nome "${dup.nome}".`, '⚠️'); return; }
        if (referencia) {
            const dupRef = db.materiais.find(m => m.referencia && m.referencia.toLowerCase() === referencia.toLowerCase());
            if (dupRef) { await showAlert(`Código "${referencia}" já usado por "${dupRef.nome}".`, '⚠️'); return; }
        }
        if (_matEstado.margemModo === 'total' && _matEstado.markup === null) {
            await showAlert('Informe a margem total (%) ou escolha “Definir margem depois”.', '⚠️');
            return;
        }
        const custo = parseFloat(document.getElementById('mat-custo')?.value) || 0;
        const qtd = parseFloat(document.getElementById('mat-qtd')?.value) || 0;
        const infinito = _matEstado.estoqueModo === 'infinito';
        db.materiais.push({
            id: Date.now(), referencia, nome, unidade,
            min_estoque: _cfgMinimo(_matEstado, min_estoque),
            // Quantidade e custo seguem a unidade escolhida acima.
            preco_custo: custo,
            preco: _cfgVenda(_matEstado, custo) || 0,
            estoque_atual: qtd,
            estoque_infinito: infinito,
            fornecedor_id: forn_id_mat,
            fornecedor_nome: forn_obj_mat ? forn_obj_mat.nome : ''
        });
        if (qtd > 0) registrarMovimento('Entrada', nome, 'material', qtd, unidade, 'Cadastro manual');
        salvarERecarregar('Material cadastrado!');
    }
}

function autoFillMaterialPorReferencia() {
    const ref = document.getElementById('mat-ref')?.value.trim();
    if (!ref || ref.length < 2) return;
    const existing = db.materiais.find(m => m.referencia && m.referencia.toLowerCase() === ref.toLowerCase());
    if (!existing) return;
    const nomeEl = document.getElementById('mat-nome');
    if (nomeEl) nomeEl.value = existing.nome || '';
    const unEl = document.getElementById('mat-unidade');
    if (unEl) unEl.value = existing.unidade || 'un';
    const precoEl = document.getElementById('mat-preco');
    if (precoEl) precoEl.value = existing.preco || '';
    const minEl = document.getElementById('mat-min');
    if (minEl) minEl.value = existing.min_estoque || 0;
    const fornSel = document.getElementById('mat-fornecedor');
    if (fornSel && existing.fornecedor_id) fornSel.value = existing.fornecedor_id;
}

async function excluirMaterial(id) {
    if (!await showConfirm('Remover este material? Kits que o utilizam serão afetados.', '🗑️', 'Remover', 'Cancelar')) return;
    db.materiais = db.materiais.filter(m => m.id != id);
    db.kits.forEach(k => { k.itens = k.itens.filter(i => i.materialId != id); });
    salvarERecarregar('Material removido.');
}

function editarMaterial(id) {
    const m = db.materiais.find(x => x.id == id);
    if (!m) return;
    editandoMaterialId = id;
    document.getElementById('mat-ref').value = m.referencia || '';
    document.getElementById('mat-nome').value = m.nome || '';
    document.getElementById('mat-unidade').value = m.unidade || 'un';
    document.getElementById('mat-min').value = m.min_estoque || 0;
    const fornSel = document.getElementById('mat-fornecedor');
    if (fornSel) fornSel.value = m.fornecedor_id || '';
    const precoGroup = document.getElementById('mat-preco-group');
    if (precoGroup) {
        precoGroup.style.display = '';
        document.getElementById('mat-preco').value = m.preco || 0;
    }
    carregarCfgDoRegistro('mat', m);
    const btn = document.querySelector('button[onclick="salvarMaterial()"]');
    if (btn) btn.textContent = 'Atualizar Material';
    document.getElementById('mat-ref').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function mostrarAjusteForm(id) {
    document.querySelectorAll('.ajuste-form').forEach(el => el.style.display = 'none');
    const row = document.getElementById('ajuste-' + id);
    if (row) row.style.display = 'table-row';
}
function cancelarAjuste() {
    document.querySelectorAll('.ajuste-form').forEach(el => el.style.display = 'none');
}

async function confirmarAjuste(id) {
    const mat = db.materiais.find(m => m.id == id);
    if (!mat) return;
    const qtd = parseFloat(document.getElementById(`ajuste-qtd-${id}`)?.value);
    if (isNaN(qtd)) { await showAlert('Informe uma quantidade válida (positivo para entrada, negativo para saída).', '⚠️'); return; }
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
        const criticos = db.materiais.filter(m => !temEstoqueInfinito(m) && m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque);
        if (criticos.length) {
            alertBox.innerHTML = criticos.map(m =>
                `<div class="alerta-item">⚠ <strong>${m.nome}</strong>: ${(m.estoque_atual||0).toFixed(2)} ${m.unidade} — mínimo: ${m.min_estoque} ${m.unidade}</div>`
            ).join('');
            alertBox.style.display = 'block';
        }
    }

    _catPreencherSelect('f-mat-forn', _catOpcoesFornecedor(db.materiais));

    const lista = ordenarLista(filtrarMateriais(db.materiais), matSortState, valorOrdenacaoMaterial);
    catVisiveis.material = lista.map(m => m.id);
    pintarCabecalhoOrdenacao('#tabela-materiais', matSortState);

    const cont = document.getElementById('f-mat-contagem');
    if (cont) cont.textContent = lista.length === db.materiais.length
        ? `${db.materiais.length} material(is)`
        : `${lista.length} de ${db.materiais.length} material(is)`;

    tb.innerHTML = lista.map(m => {
        const abaixoMin = !temEstoqueInfinito(m) && m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque;
        const corEstoque = abaixoMin ? '#F43927' : '#005D3B';
        const marcado = catSelecao.material.has(m.id);
        return `
        <tr class="${marcado ? 'cat-linha-marcada' : ''}">
            <td class="cat-col-check"><input type="checkbox"${marcado ? ' checked' : ''} onchange="alternarSelecao('material',${m.id},this)"></td>
            <td class="col-codigo" title="${escapeHtml(m.referencia || '')}">${escapeHtml(m.referencia || '—')}</td>
            <td class="col-nome" title="${escapeHtml(m.nome)}"><strong>${escapeHtml(m.nome)}</strong>${abaixoMin ? `<span class="badge-alerta" style="margin-left:6px">⚠</span>` : ''}</td>
            <td class="col-un">${escapeHtml(m.unidade || '')}</td>
            <td class="col-num" style="color:${corEstoque}" title="${temEstoqueInfinito(m) || !(m.min_estoque > 0) ? '' : 'Mínimo: ' + m.min_estoque + ' ' + (m.unidade || '')}">${temEstoqueInfinito(m)
                ? '<strong title="Estoque infinito">∞</strong>'
                : `<strong>${(m.estoque_atual || 0).toFixed(2)}</strong>`}</td>
            <td class="col-num">R$ ${(m.preco || 0).toFixed(2)}</td>
            <td class="col-forn" title="${escapeHtml(m.fornecedor_nome || '')}">${escapeHtml(m.fornecedor_nome || '—')}</td>
            <td class="col-acoes">
                <button class="btn btn-outline btn-sm" onclick="editarMaterial(${m.id})" title="Editar">✏️</button>
                <button class="btn btn-outline btn-sm" onclick="mostrarAjusteForm(${m.id})" title="Ajustar estoque">±</button>
                <button class="btn btn-outline btn-sm" onclick="pedirMaterial(${m.id})" title="Criar pedido de compra">🛒</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirMaterial(${m.id})" title="Excluir material">🗑️</button>
            </td>
        </tr>
        <tr id="ajuste-${m.id}" class="ajuste-form" style="display:none">
            <td colspan="8" class="baixa-form-cell">
                <strong>${escapeHtml(m.nome)}</strong> — saldo: <strong>${(m.estoque_atual||0).toFixed(2)} ${m.unidade}</strong> &emsp;
                Quantidade (+ entrada / − saída):
                <input type="number" id="ajuste-qtd-${m.id}" placeholder="Ex: +10 ou -3" step="0.01" style="width:130px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;margin:0 8px">
                <button class="btn btn-sm" style="background:#005D3B" onclick="confirmarAjuste(${m.id})">Confirmar</button>
                <button class="btn btn-outline btn-sm" onclick="cancelarAjuste()">Cancelar</button>
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align:center;color:#999;padding:24px;">${db.materiais.length ? 'Nenhum material com esses filtros.' : 'Nenhum material cadastrado.'}</td></tr>`;

    atualizarBarraSelecao('material');
}

function sortMateriais(col) {
    if (matSortState.col === col) matSortState.dir *= -1;
    else { matSortState.col = col; matSortState.dir = 1; }
    _gravarOrdenacao('material', matSortState);
    renderMateriais();
    renderEstoqueMateriais();
}

function sortKits(col) {
    if (kitSortState.col === col) kitSortState.dir *= -1;
    else { kitSortState.col = col; kitSortState.dir = 1; }
    _gravarOrdenacao('kit', kitSortState);
    renderKits();
}

// --- KITS ---
let kitDraftItens = [];

async function adicionarItemAoKit() {
    const matId = parseInt(document.getElementById('kit-item-mat')?.value);
    const qtd   = parseFloat(document.getElementById('kit-item-qtd')?.value);
    if (!matId) { await showAlert('Escolha o material na lista de sugestões.', '⚠️'); return; }
    if (!qtd || qtd <= 0) { await showAlert('Informe uma quantidade válida.', '⚠️'); return; }
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

// Uma regra só de normalização de código em todo o sistema: a do importador.
// As telas que criam código carregam importador-core.js por isso — duas
// implementações da mesma regra é como elas acabam divergindo.
function normalizarCodigoDoSistema(bruto) {
    return window.ImportadorCore.normalizarCodigo(bruto).codigo;
}

// Código já em uso por um tecido, material ou kit. Devolve a descrição do dono
// ou null. Um código vale para o sistema inteiro, não só dentro do seu tipo.
function donoDoCodigo(codigo, ignorarKitId) {
    const alvo = normalizarCodigoDoSistema(codigo);
    if (!alvo) return null;
    const bate = r => {
        const cod = normalizarCodigoDoSistema(r.referencia);
        return cod && cod === alvo;
    };
    const tec = (db.catalogo || []).find(bate);
    if (tec) return `o tecido "${tec.nome}"`;
    const mat = (db.materiais || []).find(bate);
    if (mat) return `o material "${mat.nome}"`;
    const kit = (db.kits || []).find(k => k.id !== ignorarKitId && bate(k));
    if (kit) return `o kit "${kit.nome}"`;
    return null;
}

async function salvarKit() {
    const ref = document.getElementById('kit-ref')?.value.trim();
    const nome = document.getElementById('kit-nome')?.value.trim();
    if (!ref) { await showAlert('Informe o código do kit.', '⚠️'); return; }
    if (!nome) { await showAlert('Informe o nome do kit.', '⚠️'); return; }
    const dono = donoDoCodigo(ref);
    if (dono) { await showAlert(`O código ${ref} já é de ${dono}. Use outro código.`, '🚫'); return; }
    if (!kitDraftItens.length) { await showAlert('Adicione pelo menos um item ao kit.', '⚠️'); return; }
    db.kits.push({
        id: Date.now(),
        referencia: normalizarCodigoDoSistema(ref),
        nome,
        descricao: document.getElementById('kit-desc')?.value.trim() || '',
        itens: kitDraftItens.map(i => ({ ...i }))
    });
    salvarERecarregar('Kit salvo!');
}

// ═══════════════════════════════════════════════════════════════════════
// KIT PRONTO criado à mão (Cadastro › Kits)
//
// Mesmo produto que vem da importação: código e preço próprios, sem os
// materiais descritos. Os cartões de margem e estoque são os mesmos da
// popup de importação, para a regra ser uma só.
// ═══════════════════════════════════════════════════════════════════════

const _kpEstado  = { margemModo: 'total', estoqueModo: 'ajustar', markup: null };
const _catEstado = { margemModo: 'total', estoqueModo: 'ajustar', markup: null };
const _matEstado = { margemModo: 'total', estoqueModo: 'ajustar', markup: null };

// ─── Cartões de margem e estoque, compartilhados pelas três abas ─────────
//
// Uma implementação só. Copiar este bloco para cada aba e' exatamente como as
// tres versoes acabariam divergindo — ja aconteceu nesta base com a validacao
// do passo 3 do importador.
//
// `cfg` = { prefixo, estado, item }. O `item` so troca a palavra nas
// descricoes ("o kit", "o tecido", "o material"); os TITULOS sao identicos
// nas tres abas, de proposito.
const _CFG_ABAS = {
    kp:  { estado: _kpEstado,  item: 'O kit',      aoMudar: () => atualizarVendaKitPronto() },
    cat: { estado: _catEstado, item: 'O tecido',   aoMudar: () => atualizarVendaTecido() },
    mat: { estado: _matEstado, item: 'O material', aoMudar: () => atualizarVendaMaterial() }
};

// `soEstoque` e' o modo edicao: ali o preco de venda e' digitado direto no
// campo, entao os cartoes de margem nao mandam em nada e mostra-los seria
// mentir para quem edita. Os de estoque continuam, porque eles mandam.
function renderCartoesConfig(prefixo, soEstoque) {
    const alvo = document.getElementById(prefixo + '-cfg');
    const cfg = _CFG_ABAS[prefixo];
    if (!alvo || !cfg || typeof _impIcone !== 'function') return;
    const estado = cfg.estado;

    const campoMargem = `<div class="imp-cfg-campo">
        <label for="${prefixo}-markup">Margem total (%)</label>
        <div class="imp-cfg-campo-caixa">
            <input type="number" id="${prefixo}-markup" value="${estado.markup === null ? '' : estado.markup}"
                   min="0" step="1" placeholder="Ex.: 30" oninput="_cfgMargemMudou('${prefixo}', this.value)" onclick="event.stopPropagation()">
            <span class="imp-cfg-sufixo">%</span>
        </div>
    </div>`;

    const card = (grupo, valor, icone, titulo, descricao, extra) => {
        const atual = grupo === 'margem' ? estado.margemModo : estado.estoqueModo;
        const sel = atual === valor;
        return `<label class="imp-cfg-card${sel ? ' imp-cfg-card-sel' : ''}">
            <div class="imp-cfg-topo">
                <input type="radio" name="${prefixo}-cfg-${grupo}" value="${valor}"${sel ? ' checked' : ''}
                       onchange="_cfgEscolher('${prefixo}','${grupo}','${valor}')">
                ${_impIcone(icone)}
                <span class="imp-cfg-titulo">${titulo}</span>
            </div>
            <p class="imp-cfg-desc">${descricao}</p>
            ${sel && extra ? extra : ''}
        </label>`;
    };

    const it = cfg.item;
    const margem = soEstoque ? [] : [
        card('margem', 'total', 'porcento', 'Definir margem total',
            'A margem informada forma o preço de venda a partir do custo.', campoMargem),
        card('margem', 'item', 'sliders', 'Definir margem depois',
            `${it} entra com a venda igual ao custo e você ajusta o preço quando quiser.`)
    ];
    alvo.innerHTML = margem.concat([
        card('estoque', 'infinito', 'infinito', 'Estoque infinito',
            `${it} fica sempre disponível. Não haverá controle de estoque, baixa ou entrada.`),
        card('estoque', 'ajustar', 'caixa', 'Ajustar estoque',
            'O estoque será controlado. Você dá entrada depois e o sistema faz a baixa ao sair nos pedidos.')
    ]).join('');
    alvo.dataset.soEstoque = soEstoque ? '1' : '';
    _cfgCampoMinimo(prefixo, estado.estoqueModo === 'infinito');
    cfg.aoMudar();
}

// Item sem controle de estoque nao tem ponto de pedido: pedir um minimo que
// nunca sera comparado so faz o usuario preencher a toa. O campo some, e o
// valor digitado antes nao e' apagado — se ele voltar para estoque
// controlado, o minimo que ele tinha definido reaparece.
const _CFG_CAMPO_MINIMO = { kp: 'kp-min', cat: 'cat-min', mat: 'mat-min' };
function _cfgCampoMinimo(prefixo, infinito) {
    const campo = document.getElementById(_CFG_CAMPO_MINIMO[prefixo]);
    const grupo = campo?.closest('.form-group');
    if (grupo) grupo.style.display = infinito ? 'none' : '';
}
// Quem grava: infinito nao guarda minimo.
function _cfgMinimo(estado, valor) {
    return estado.estoqueModo === 'infinito' ? 0 : valor;
}

// Quem re-renderiza depois de um clique precisa manter o modo em que a tela
// esta: senao os cartoes de margem voltariam no meio de uma edicao.
function _cfgSoEstoque(prefixo) {
    return document.getElementById(prefixo + '-cfg')?.dataset.soEstoque === '1';
}

// Leva o item que esta sendo editado para dentro dos cartoes, para a tela
// dizer a verdade sobre ele. Sem isto a edicao mostrava sempre "Ajustar
// estoque", mesmo num item infinito.
function carregarCfgDoRegistro(prefixo, registro) {
    const estado = _CFG_ABAS[prefixo]?.estado;
    if (!estado) return;
    estado.estoqueModo = temEstoqueInfinito(registro) ? 'infinito' : 'ajustar';
    renderCartoesConfig(prefixo, true);
    _cfgAjuda(prefixo, true);
}

// O texto de ajuda da secao fala de margem; na edicao, so de estoque.
function _cfgAjuda(prefixo, soEstoque) {
    const secao = document.getElementById(prefixo + '-cfg')?.closest('.imp-cfg-secao');
    const ajuda = secao?.querySelector('.imp-cfg-secao-ajuda');
    if (!ajuda) return;
    if (ajuda.dataset.original === undefined) ajuda.dataset.original = ajuda.textContent;
    ajuda.textContent = soEstoque
        ? 'Escolha o controle de estoque deste item. A margem não aparece aqui porque, na edição, o preço de venda é digitado direto no campo acima.'
        : ajuda.dataset.original;
}

function _cfgEscolher(prefixo, grupo, valor) {
    const estado = _CFG_ABAS[prefixo].estado;
    if (grupo === 'margem') estado.margemModo = valor;
    else estado.estoqueModo = valor;
    renderCartoesConfig(prefixo, _cfgSoEstoque(prefixo));
}

function _cfgMargemMudou(prefixo, valor) {
    const estado = _CFG_ABAS[prefixo].estado;
    const bruto = String(valor).trim();
    const v = parseFloat(bruto);
    estado.markup = (bruto !== '' && isFinite(v) && v >= 0) ? v : null;
    _CFG_ABAS[prefixo].aoMudar();
}

// Venda = custo x (1 + margem/100), a mesma conta do resto do sistema.
function _cfgVenda(estado, custo) {
    if (!isFinite(custo) || custo <= 0) return null;
    const margem = estado.margemModo === 'item' ? 0 : (estado.markup || 0);
    return window.ImportadorCore.aplicarMarkup(custo, margem);
}

function _cfgMostrarVenda(idSaida, estado, custo, sufixo) {
    const el = document.getElementById(idSaida);
    if (!el) return;
    const venda = _cfgVenda(estado, custo);
    el.textContent = venda === null ? '—' : 'R$ ' + venda.toFixed(2) + (sufixo || '');
}

function renderCfgKitPronto() { renderCartoesConfig('kp'); }

function atualizarVendaKitPronto() {
    _cfgMostrarVenda('kp-venda', _kpEstado, parseFloat(document.getElementById('kp-custo')?.value));
}

function atualizarVendaTecido() {
    _cfgMostrarVenda('cat-venda', _catEstado, parseFloat(document.getElementById('cat-custo')?.value), '/m');
}

function atualizarVendaMaterial() {
    const un = document.getElementById('mat-unidade')?.value || '';
    _cfgMostrarVenda('mat-venda', _matEstado, parseFloat(document.getElementById('mat-custo')?.value), un ? '/' + un : '');
}

async function salvarKitPronto() {
    const ref = document.getElementById('kp-ref')?.value.trim();
    const nome = document.getElementById('kp-nome')?.value.trim();
    const custo = parseFloat(document.getElementById('kp-custo')?.value);

    if (!ref) { await showAlert('Informe o código do kit.', '⚠️'); return; }
    if (!nome) { await showAlert('Informe o nome do kit.', '⚠️'); return; }
    if (!isFinite(custo) || custo <= 0) { await showAlert('Informe o preço de custo do kit.', '⚠️'); return; }
    if (_kpEstado.margemModo === 'total' && _kpEstado.markup === null) {
        await showAlert('Informe a margem total (%) ou escolha “Definir margem depois”.', '⚠️');
        return;
    }
    const dono = donoDoCodigo(ref);
    if (dono) { await showAlert(`O código ${ref} já é de ${dono}. Use outro código.`, '🚫'); return; }

    const margem = _kpEstado.margemModo === 'item' ? 0 : _kpEstado.markup;
    db.kits.push({
        id: Date.now(),
        tipo: 'pronto',
        referencia: normalizarCodigoDoSistema(ref),
        nome,
        descricao: document.getElementById('kp-desc')?.value.trim() || '',
        medida: document.getElementById('kp-medida')?.value.trim() || '',
        preco_custo: Math.round(custo * 100) / 100,
        preco: window.ImportadorCore.aplicarMarkup(custo, margem),
        estoque_atual: parseFloat(document.getElementById('kp-qtd')?.value) || 0,
        min_estoque: _cfgMinimo(_kpEstado, parseFloat(document.getElementById('kp-min')?.value) || 0),
        estoque_infinito: _kpEstado.estoqueModo === 'infinito',
        fornecedor_id: null,
        fornecedor_nome: '',
        // Kit pronto não tem componentes; a lista vazia existe para o código
        // que lê k.itens continuar funcionando sem checagem.
        itens: []
    });
    salvarERecarregar('Kit pronto cadastrado!');
}

async function excluirKit(id) {
    if (!await showConfirm('Remover este kit?', '🗑️', 'Remover', 'Cancelar')) return;
    db.kits = db.kits.filter(k => k.id != id);
    salvarERecarregar('Kit removido.');
}

// Ajuste de saldo de kit pronto, irmão do ajuste de material.
async function confirmarAjusteKit(id) {
    const kit = db.kits.find(k => k.id == id);
    if (!kit) return;
    const qtd = parseFloat(document.getElementById(`ajuste-qtd-kit-${id}`)?.value);
    if (isNaN(qtd)) { await showAlert('Informe uma quantidade válida (positivo para entrada, negativo para saída).', '⚠️'); return; }
    kit.estoque_atual = Math.max(0, (kit.estoque_atual || 0) + qtd);
    registrarMovimento(qtd >= 0 ? 'Ajuste +' : 'Ajuste -', kit.nome, 'kit', qtd, 'un', '');
    salvarERecarregar('Ajuste realizado!');
}

function renderKits() {
    const tb = document.getElementById('tb-kits');
    if (!tb) return;
    if (!db.kits.length) {
        tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999;padding:24px;">Nenhum kit cadastrado.</td></tr>';
        return;
    }
    // A lista do Estoque tem uma coluna de unidade a mais que a do Catálogo,
    // pedida para o módulo de estoque. A tabela diz qual das duas é.
    const comUnidade = !!tb.closest('table')?.dataset.comUnidade;
    pintarCabecalhoOrdenacao('#tabela-kits', kitSortState);
    tb.innerHTML = ordenarLista(db.kits, kitSortState, valorOrdenacaoKit).map(k => {
        const pronto = ehKitPronto(k);
        const saldo = temEstoqueInfinito(k) ? '<strong title="Estoque infinito">∞</strong>'
            : (pronto ? `<strong>${(k.estoque_atual || 0).toFixed(0)}</strong> un` : '—');
        const composicao = pronto
            ? '<span style="color:#999">kit pronto do fornecedor</span>'
            : (k.itens || []).map(i => `${escapeHtml(i.nome)}: ${i.quantidade} ${i.unidade}`).join(' · ');
        const selo = pronto
            ? '<span class="kit-selo">pronto</span>'
            : '<span class="kit-selo kit-selo-montagem">montagem</span>';
        const ajustar = pronto && !temEstoqueInfinito(k)
            ? `<button class="btn btn-outline btn-sm" onclick="mostrarAjusteForm('kit-${k.id}')" title="Ajustar estoque">± Ajustar</button>`
            : '';
        const colunas = comUnidade ? 8 : 7;
        const linhaAjuste = pronto && !temEstoqueInfinito(k) ? `
        <tr id="ajuste-kit-${k.id}" class="ajuste-form" style="display:none">
            <td colspan="${colunas}" class="baixa-form-cell">
                <strong>${escapeHtml(k.nome)}</strong> — saldo: <strong>${(k.estoque_atual || 0).toFixed(0)} un</strong> &emsp;
                Quantidade (+ entrada / − saída):
                <input type="number" id="ajuste-qtd-kit-${k.id}" placeholder="Ex: +10 ou -3" step="1" style="width:130px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;margin:0 8px">
                <button class="btn btn-sm" style="background:#005D3B" onclick="confirmarAjusteKit(${k.id})">Confirmar</button>
                <button class="btn btn-outline btn-sm" onclick="cancelarAjuste()">Cancelar</button>
            </td>
        </tr>` : '';

        return `<tr>
            <td class="col-codigo" title="${escapeHtml(k.referencia || '')}">${escapeHtml(k.referencia || '—')}</td>
            <td class="col-nome" title="${escapeHtml(k.nome)}${k.descricao ? ' — ' + escapeHtml(k.descricao) : ''}"><strong>${escapeHtml(k.nome)}</strong> ${selo}</td>
            ${comUnidade ? '<td class="col-un">un</td>' : ''}
            <td class="col-num" title="${escapeHtml(k.medida || '')}">${escapeHtml(k.medida || '—')}</td>
            <td class="col-num">${pronto ? 'R$ ' + (k.preco || 0).toFixed(2) : '—'}</td>
            <td class="col-num">${saldo}</td>
            <td class="col-nome" title="${escapeHtml((k.itens || []).map(i => i.nome + ': ' + i.quantidade + ' ' + i.unidade).join(' · '))}">${composicao}</td>
            <td class="col-acoes">${ajustar}
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirKit(${k.id})">🗑️</button></td>
        </tr>${linhaAjuste}`;
    }).join('');
}

// --- HISTÓRICO DE MOVIMENTAÇÕES ---
let _histPag = 0;
let _histMovsFiltrados = [];
function renderHistorico() {
    _histPag = 0;
    _aplicarFiltrosHistorico();
}
function _aplicarFiltrosHistorico() {
    const filtroTipo = document.getElementById('hist-filtro-tipo')?.value  || '';
    const filtroItem = (document.getElementById('hist-filtro-item')?.value || '').toLowerCase().trim();
    const filtroDE   = document.getElementById('hist-filtro-de')?.value    || '';
    const filtroAte  = document.getElementById('hist-filtro-ate')?.value   || '';
    let movs = db.movimentos.slice(0, 2000);
    if (filtroTipo) movs = movs.filter(m => m.tipo === filtroTipo);
    if (filtroItem) movs = movs.filter(m => m.item_nome.toLowerCase().includes(filtroItem));
    if (filtroDE)   movs = movs.filter(m => new Date(m.data) >= new Date(filtroDE  + 'T00:00:00'));
    if (filtroAte)  movs = movs.filter(m => new Date(m.data) <= new Date(filtroAte + 'T23:59:59'));
    _histMovsFiltrados = movs;
    _renderHistPage();
}
function _renderHistPage() {
    const tb = document.getElementById('tb-historico');
    if (!tb) return;
    const POR_PAG = 30;
    const movs = _histMovsFiltrados;
    const totalPags = Math.max(1, Math.ceil(movs.length / POR_PAG));
    if (_histPag >= totalPags) _histPag = totalPags - 1;
    if (!movs.length) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px;">Nenhuma movimentação encontrada.</td></tr>';
        _renderHistPaginacao(0, 0);
        return;
    }
    const COR = { 'Entrada':'mov-entrada','Baixa Pedido':'mov-baixa-pedido','Baixa Manual':'mov-baixa-manual','Ajuste +':'mov-ajuste-pos','Ajuste -':'mov-ajuste-neg' };
    const inicio = _histPag * POR_PAG;
    tb.innerHTML = movs.slice(inicio, inicio + POR_PAG).map(m => {
        const cls = COR[m.tipo] || '';
        const data = new Date(m.data).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
        const tipoLabel = m.tipo === 'Ajuste +' ? 'Ajuste ↑' : m.tipo === 'Ajuste -' ? 'Ajuste ↓' : m.tipo;
        return `<tr>
            <td style="font-size:12px;color:#8F8F8F;white-space:nowrap">${data}</td>
            <td><span class="mov-badge ${cls}">${tipoLabel}</span></td>
            <td>${escapeHtml(m.item_nome)} <span style="font-size:11px;color:#8F8F8F">(${m.item_tipo==='tecido'?'Tecido':'Material'})</span></td>
            <td><strong>${m.quantidade.toFixed(2)}</strong> ${m.unidade}</td>
            <td style="font-size:12px;color:#8F8F8F">${escapeHtml(m.referencia||'—')}</td>
        </tr>`;
    }).join('');
    _renderHistPaginacao(totalPags, movs.length);
}
function _renderHistPaginacao(totalPags, total) {
    const pagEl = document.getElementById('hist-pag');
    if (!pagEl) return;
    pagEl.innerHTML = '';
    if (totalPags <= 1) return;
    const btnPrev = document.createElement('button');
    btnPrev.className = 'btn btn-outline btn-sm'; btnPrev.textContent = '‹ Anterior'; btnPrev.disabled = _histPag === 0;
    btnPrev.onclick = () => { _histPag--; _renderHistPage(); };
    const info = document.createElement('span');
    info.style.cssText = 'font-size:13px;color:#8F8F8F';
    info.textContent = `${_histPag + 1} / ${totalPags} · ${total} registro(s)`;
    const btnNext = document.createElement('button');
    btnNext.className = 'btn btn-outline btn-sm'; btnNext.textContent = 'Próximo ›'; btnNext.disabled = _histPag >= totalPags - 1;
    btnNext.onclick = () => { _histPag++; _renderHistPage(); };
    pagEl.append(btnPrev, info, btnNext);
}
function limparFiltrosHistorico() {
    ['hist-filtro-tipo','hist-filtro-item','hist-filtro-de','hist-filtro-ate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderHistorico();
}

function renderEstoqueFuturo() {
    const el = document.getElementById('tab-futuro');
    if (!el) return;
    const statusAtivos = ['Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento'];
    const pedAtivos = db.pedidos.filter(p => statusAtivos.includes(normalizarStatus(p.status)));
    const consumoPorTecido = {};
    for (const ped of pedAtivos) {
        for (const amb of normalizarAmbientes(ped)) {
            for (const t of (amb.tecidos || [])) {
                if (!t.tecidoId || !(t.consumo_linear > 0)) continue;
                const key = String(t.tecidoId);
                if (!consumoPorTecido[key]) consumoPorTecido[key] = { total: 0, pedidoIds: new Set() };
                consumoPorTecido[key].total += t.consumo_linear;
                consumoPorTecido[key].pedidoIds.add(ped.id);
            }
        }
    }
    const rows = db.catalogo.map(c => {
        const key = String(c.id);
        const info = consumoPorTecido[key];
        if (!info) return null;
        const infinito = temEstoqueInfinito(c);
        const disponivel = estoqueDisponivel(c.id);
        const reservado = Math.round(info.total * 100) / 100;
        const saldo = Math.round((disponivel - reservado) * 100) / 100;
        const saldoCss = saldo < 0 ? 'color:#F43927;font-weight:700' : saldo < 2 ? 'color:#F2C924;font-weight:600' : 'color:#159912';
        return `<tr>
            <td><span style="font-size:11px;color:#8F8F8F;display:block">${escapeHtml(c.referencia||'')}</span>${escapeHtml(c.nome)}</td>
            <td style="text-align:center">${info.pedidoIds.size}</td>
            <td>${reservado.toFixed(2)} m</td>
            <td>${infinito ? '∞' : disponivel.toFixed(2) + ' m'}</td>
            <td style="${infinito ? 'color:#159912' : saldoCss}">${infinito ? 'sem controle' : (saldo >= 0 ? '+' : '') + saldo.toFixed(2) + ' m'}</td>
        </tr>`;
    }).filter(Boolean).join('');
    el.innerHTML = `<div class="card">
        <h3 style="margin-bottom:4px">Consumo Previsto — Pedidos em Produção</h3>
        <p style="font-size:13px;color:#8F8F8F;margin-bottom:16px">${pedAtivos.length} pedido(s) em produção considerados. Saldo negativo indica necessidade de reposição.</p>
        <table>
            <thead><tr>
                <th>Tecido</th>
                <th style="text-align:center">Pedidos</th>
                <th>Reservado</th>
                <th>Em Estoque</th>
                <th>Saldo</th>
            </tr></thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px">Nenhum tecido consumido pelos pedidos em produção.</td></tr>'}</tbody>
        </table>
    </div>`;
}

// Troca de aba no estoque
function mostrarTabEstoque(tab) {
    if (_curTabEstoque !== tab) { _prevTabEstoque = _curTabEstoque; _curTabEstoque = tab; }
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    _tabBackBtn('.tab-nav', _prevTabEstoque, () => mostrarTabEstoque(_prevTabEstoque));
    if (tab === 'consulta') renderConsultaEstoque();
    if (tab === 'futuro') renderEstoqueFuturo();
}

// --- FORMULÁRIO DE PEDIDO (MULTI-AMBIENTE + ACESSÓRIOS) ---
let editandoIdPedido = null;
// Agendamento de medicao que originou o pedido novo ("Criar Pedido" na agenda).
let pedidoMedicaoId = null;
let pedidoDraft = { ambientes: [], itens: [] };
let _ambienteCounter = 0;

// Imagens das aberturas: "images/Aberturas/" = desenho tecnico;
// "images/Aberturas/Ambiente/" = cortina instalada no ambiente.
const PASTA_ABERTURAS = 'images/Aberturas/Ambiente/';

// Ao escolher/trocar a abertura, toca uma vez a cortina abrindo (arquivo
// -anim, que so existe na versao Ambiente). Ao abrir o pedido e na OS a
// imagem fica parada. Quem pede menos movimento no sistema ve a estatica.
function urlAberturaAnimada(letra) {
    const semMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (semMovimento || !PASTA_ABERTURAS.includes('Ambiente')) return `${PASTA_ABERTURAS}Abertura${letra}.svg`;
    // O parametro novo faz o navegador recarregar o SVG, e a animacao recomeca.
    return `${PASTA_ABERTURAS}Abertura${letra}-anim.svg?t=${Date.now()}`;
}

function onAberturaChange(id) {
    const val = document.getElementById(`a-abertura-${id}`)?.value || 'A';
    const img = document.getElementById(`img-abertura-${id}`);
    if (img) { img.src = urlAberturaAnimada(val); img.alt = `Abertura ${val}`; }
    const lbl = document.getElementById(`lbl-abertura-${id}`);
    if (lbl) lbl.textContent = `Tipo ${val}`;
}

function onPregaTecido(ambId, tidx) {
    const fatoresSugeridos = {
        'Americana': '2.5', 'Franzido': '2.5',
        'Wave Botao': '2.0', 'Wave Plus': '2.0',
        'Macho-Femea': '2.0', 'Painel': '1.5'
    };
    const prega = document.getElementById(`t-prega-${ambId}-${tidx}`)?.value;
    const fatorEl = document.getElementById(`t-fator-${ambId}-${tidx}`);
    if (fatorEl && prega) fatorEl.value = fatoresSugeridos[prega] || '2.5';
}

function renderAmbienteBreakdown(a) {
    if (!a.calculado) return '';
    const tecidos = a.tecidos || [];
    if (!tecidos.length) return '';
    const totalMat = tecidos.reduce((s,t)=>s+(t.total_material||0),0);
    const parts = tecidos.map((t, tidx) => {
        if (!t.tecidoId) return '';
        const disp = estoqueDisponivel(t.tecidoId);
        const stockColor = !tecidoTemEstoqueInfinito(t.tecidoId) && disp < (t.consumo_linear||0) ? '#F43927' : '#005D3B';
        const temConflito = verificarConflitoDeLote(t.tecidoId, t.consumo_linear||0);
        const alt_bruta = (a.altura||0) + (t.bainha_cm??15)/100 + (t.cabecote_cm??0)/100;
        const titulo = tecidos.length > 1 ? `<div class="breakdown-row" style="font-weight:bold;color:var(--primary);padding-bottom:6px;border-bottom:1px solid #dde">Tecido ${tidx+1}: ${escapeHtml(t.tecidoNome||'')}</div>` : '';
        return `<div class="breakdown-box">
            ${titulo}
            <div class="breakdown-row"><span class="label">Tipo de prega</span><span><strong>${escapeHtml(t.prega||'—')}</strong></span></div>
            <div class="breakdown-row"><span class="label" title="Largura da parede × fator de franzimento">Largura total</span><span><strong>${((a.largura||0)*(t.fator||1)).toFixed(2)}</strong> m</span></div>
            <div class="breakdown-row"><span class="label">Largura do rolo</span><span><strong>${(t.largura_rolo||2.80).toFixed(2)}</strong> m</span></div>
            <div class="breakdown-row"><span class="label">Número de panos</span><span><strong>${t.num_panos}</strong> pano(s)</span></div>
            <div class="breakdown-row"><span class="label" title="Altura da parede + barra + cabeçote">Altura bruta</span><span><strong>${alt_bruta.toFixed(3)}</strong> m</span></div>
            <div class="breakdown-row destaque"><span>Consumo total</span><span><strong>${(t.consumo_linear||0).toFixed(2)}</strong> m lineares</span></div>
            <div class="breakdown-row"><span class="label">Estoque disponível</span><span style="color:${stockColor}"><strong>${disp.toFixed(2)} m</strong></span></div>
            <div class="breakdown-row destaque"><span>Valor do tecido</span><span>R$ <strong>${(t.total_material||0).toFixed(2)}</strong></span></div>
            ${temConflito ? `<div class="alerta-lote-pedido" style="display:flex;margin-top:4px">⚠ <strong style="margin:0 4px">Atenção:</strong> pode exigir múltiplos lotes — risco de variação de tonalidade.</div>` : ''}
        </div>`;
    }).join('');
    const totalRow = tecidos.length > 1 ? `<div class="breakdown-box breakdown-total"><div class="breakdown-row destaque"><span>Total combinado (${tecidos.length} tecidos)</span><span>R$ <strong>${totalMat.toFixed(2)}</strong></span></div></div>` : '';
    return `<div class="breakdown-wrap">${parts}</div>${totalRow}`;
}

function syncAmbientesFromDOM() {
    pedidoDraft.ambientes.forEach(a => {
        const v = id => document.getElementById(id)?.value;
        const amb = v(`a-amb-${a.id}`); if (amb !== undefined) a.amb = amb.trim();
        const fixacao = v(`a-fixacao-${a.id}`); if (fixacao) a.fixacao = fixacao;
        const abertura = v(`a-abertura-${a.id}`); if (abertura) a.abertura = abertura;
        const local = v(`a-local-${a.id}`); if (local) a.local_instalacao = local;
        const larg = parseFloat(v(`a-larg-${a.id}`)); if (!isNaN(larg)) a.largura = larg;
        const alt = parseFloat(v(`a-alt-${a.id}`)); if (!isNaN(alt)) a.altura = alt;
        (a.tecidos || []).forEach((t, tidx) => {
            const sel = document.getElementById(`a-tecido-${a.id}-${tidx}`);
            if (sel && sel.value) t.tecidoId = parseInt(sel.value) || null;
            const refEl = document.getElementById(`a-tec-ref-${a.id}-${tidx}`);
            if (refEl) t._ref = refEl.value;
            const prega = v(`t-prega-${a.id}-${tidx}`); if (prega) t.prega = prega;
            const fator = parseFloat(v(`t-fator-${a.id}-${tidx}`)); if (!isNaN(fator)) t.fator = fator;
            const bainha = parseFloat(v(`t-bainha-${a.id}-${tidx}`)); if (!isNaN(bainha)) t.bainha_cm = bainha;
            const cab = parseFloat(v(`t-cabecote-${a.id}-${tidx}`)); if (!isNaN(cab)) t.cabecote_cm = cab;
        });
    });
}

function renderAmbientes() {
    const container = document.getElementById('ambientes-container');
    if (!container) return;
    const FATORES = ['1.0','1.5','2.0','2.5','2.7', '3.0','3.5','4.0'];
    const PREGA_OPTS = [
        {v:'Americana',l:'Prega Americana'},
        {v:'Wave Botao',l:'Wave Botão'},
        {v:'Wave Plus',l:'Wave Plus/Flex'},
        {v:'Franzido',l:'Franzido'},
        {v:'Macho-Femea',l:'Prega Macho-Fêmea'},
        {v:'Painel',l:'Painel / Sem Prega'}
    ];
    container.innerHTML = pedidoDraft.ambientes.map((a, idx) => {
        const n = idx + 1;
        const fixacaoOpts = [
            {v:'Trilho Suico Simples',l:'Trilho Suíço Simples'},
            {v:'Trilho Suíço Duplo',l:'Trilho Suíço Duplo'},
            {v:'Trilho Suíço Duplo Com Espaço',l:'Trilho Suíço Duplo Com Espaço'},
            {v:'Trilho Suíço Triplo',l:'Trilho Suíço Triplo'},
            {v:'Trilho Motorizador',l:'Trilho Motorizador'},
            {v:'Varão Aluminio Comum',l:'Varão Aluminio Comum'},
            {v:'Varão Suíço/Wave',l:'Varão Suíço/Wave'}
        ].map(o=>`<option value="${o.v}"${a.fixacao===o.v?' selected':''}>${o.l}</option>`).join('');
        const localOpts = ['Parede','Teto'].map(o=>`<option value="${o}"${(a.local_instalacao||'Parede')===o?' selected':''}>${o}</option>`).join('');
        const aberturaOpts = [
            {v:'A',l:'Abertura A — Rec. Esq., Cmd. Esq.'},
            {v:'B',l:'Abertura B — Rec. Dir., Cmd. Dir.'},
            {v:'C',l:'Abertura C — Central, Cmd. Esq.'},
            {v:'D',l:'Abertura D — Central, Cmd. Dir.'},
            {v:'E',l:'Abertura E — Rec. Esq., Cmd. Dir.'},
            {v:'F',l:'Abertura F — Rec. Dir., Cmd. Esq.'},
            {v:'G',l:'Abertura G — Centro, Cmd. Esq.'},
            {v:'H',l:'Abertura H — Centro, Cmd. Dir.'}
        ].map(o=>`<option value="${o.v}"${(a.abertura||'A')===o.v?' selected':''}>${o.l}</option>`).join('');
        const tecidos = a.tecidos || [];
        const buildTecOpts = (selId) => '<option value="">— Selecione o Tecido —</option>' + db.catalogo.map(c => {
            const disp = estoqueDisponivel(c.id);
            const stockInfo = temEstoqueInfinito(c) ? ' · est: ∞' : (db.estoque.some(r=>r.tecido_id==c.id) ? ` · est: ${disp.toFixed(1)} m` : '');
            return `<option value="${c.id}"${selId==c.id?' selected':''}>${c.referencia?c.referencia+' · ':''}${c.nome} — R$ ${c.preco.toFixed(2)}/m${stockInfo}</option>`;
        }).join('');
        const tecidosHTML = tecidos.map((t, tidx) => {
            const pregaOpts = PREGA_OPTS.map(o=>`<option value="${o.v}"${(t.prega||'Americana')===o.v?' selected':''}>${o.l}</option>`).join('');
            const fatorOpts = FATORES.map(f=>`<option value="${f}"${parseFloat(f)===(t.fator??2.5)?' selected':''}>${f}x</option>`).join('');
            const removeBtn = tecidos.length > 1
                ? `<button class="btn btn-outline btn-sm btn-danger" onclick="removerTecidoDoAmbiente(${a.id},${tidx})" title="Remover este tecido" style="flex-shrink:0">×</button>`
                : '';
            return `<div class="tecido-row-compact">
                <div class="form-group" style="width:118px;flex-shrink:0">
                    <label>Tipo de Prega</label>
                    <select id="t-prega-${a.id}-${tidx}" onchange="onPregaTecido(${a.id},${tidx})">${pregaOpts}</select>
                </div>
                <div class="form-group" style="width:64px;flex-shrink:0">
                    <label>Fator <span class="info-tag" style="margin-left:0;font-size:9px">auto</span></label>
                    <select id="t-fator-${a.id}-${tidx}">${fatorOpts}</select>
                </div>
                <div class="form-group" style="width:56px;flex-shrink:0">
                    <label>Barra (cm)</label>
                    <input type="number" id="t-bainha-${a.id}-${tidx}" value="${t.bainha_cm??15}" step="1">
                </div>
                <div class="form-group" style="width:56px;flex-shrink:0">
                    <label>Cabeç. (cm)</label>
                    <input type="number" id="t-cabecote-${a.id}-${tidx}" value="${t.cabecote_cm??0}" step="1">
                </div>
                <div class="form-group" style="width:110px;flex-shrink:0">
                    <label>Ref. Tecido</label>
                    <input type="text" id="a-tec-ref-${a.id}-${tidx}" value="${escapeHtml(t._ref||'')}" placeholder="Código" oninput="autoFillTecidoNoAmbiente(${a.id},${tidx})">
                </div>
                <div class="form-group" style="flex:1;min-width:170px">
                    <label>${tecidos.length > 1 ? 'Tecido '+(tidx+1) : 'Tecido'}</label>
                    <select id="a-tecido-${a.id}-${tidx}" onchange="autoFillRefFromTecido(${a.id},${tidx})">${buildTecOpts(t.tecidoId)}</select>
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
    <div style="display:flex;gap:20px;align-items:flex-start;margin-top:15px;flex-wrap:wrap">
        <div style="flex:1;min-width:280px">
            <div class="grid" style="margin-bottom:0">
                <div class="form-group" style="max-width:280px"><label>Nome do Ambiente</label>
                    <input type="text" id="a-amb-${a.id}" value="${escapeHtml(a.amb||'')}" placeholder="Ex: Quarto Casal"></div>
            </div>
            <div class="grid">
                <div class="form-group"><label>Material de Instalação</label><select id="a-fixacao-${a.id}">${fixacaoOpts}</select></div>
                <div class="form-group"><label>Tipo de Abertura</label><select id="a-abertura-${a.id}" onchange="onAberturaChange(${a.id})">${aberturaOpts}</select></div>
                <div class="form-group"><label>Local de Instalação</label><select id="a-local-${a.id}">${localOpts}</select></div>
                <div class="form-group"><label>Largura da Parede (m)</label><input type="number" id="a-larg-${a.id}" value="${a.largura||''}" placeholder="Ex: 2.40" step="0.01"></div>
                <div class="form-group"><label>Altura da Parede (m)</label><input type="number" id="a-alt-${a.id}" value="${a.altura||''}" placeholder="Ex: 2.60" step="0.01"></div>
            </div>
            <div style="max-width:none">${tecidosHTML}${addTecBtn}</div>
            <div style="text-align:right;margin-top:5px">
                <button class="btn" onclick="calcularAmbiente(${a.id})">Calcular Consumo &rarr;</button>
            </div>
        </div>
        <div style="flex:0 1 475px;min-width:220px;max-width:475px;margin:0 auto;text-align:center">
            <img id="img-abertura-${a.id}" src="${PASTA_ABERTURAS}Abertura${a.abertura||'A'}.svg" alt="Abertura ${a.abertura||'A'}" style="width:100%;height:auto;border:1px solid var(--border);border-radius:6px;display:block">
            <div id="lbl-abertura-${a.id}" style="font-size:11px;color:#666;margin-top:4px;font-weight:600">Tipo ${a.abertura||'A'}</div>
        </div>
    </div>
    ${a.calculado ? renderAmbienteBreakdown(a) : ''}
</div>`;
    }).join('');
}

function adicionarAmbiente() {
    syncAmbientesFromDOM();
    _ambienteCounter++;
    pedidoDraft.ambientes.push({
        id: _ambienteCounter, calculado: false, amb: '', fixacao: 'Trilho Suico', abertura: 'A', local_instalacao: 'Parede',
        largura: null, altura: null,
        tecidos: [{ tecidoId: null, tecidoNome: '', largura_rolo: 2.80, prega: 'Americana', fator: 2.5, bainha_cm: 15, cabecote_cm: 0, num_panos: 0, alt_corte: 0, consumo_linear: 0, total_material: 0 }],
        total_material: 0
    });
    renderAmbientes();
}

function adicionarTecidoAoAmbiente(ambId) {
    syncAmbientesFromDOM();
    const a = pedidoDraft.ambientes.find(x => x.id === ambId);
    if (!a || (a.tecidos || []).length >= 3) return;
    if (!a.tecidos) a.tecidos = [];
    a.tecidos.push({ tecidoId: null, tecidoNome: '', largura_rolo: 2.80, prega: 'Americana', fator: 2.5, bainha_cm: 15, cabecote_cm: 0, num_panos: 0, alt_corte: 0, consumo_linear: 0, total_material: 0 });
    a.calculado = false;
    renderAmbientes();
}

function removerTecidoDoAmbiente(ambId, tidx) {
    syncAmbientesFromDOM();
    const a = pedidoDraft.ambientes.find(x => x.id === ambId);
    if (!a || !a.tecidos || a.tecidos.length <= 1) return;
    a.tecidos.splice(tidx, 1);
    a.calculado = false;
    renderAmbientes(); atualizarTotalPedido();
}

function removerAmbiente(id) {
    syncAmbientesFromDOM();
    pedidoDraft.ambientes = pedidoDraft.ambientes.filter(a => a.id !== id);
    renderAmbientes(); atualizarTotalPedido();
}

async function calcularAmbiente(id) {
    const a = pedidoDraft.ambientes.find(x => x.id === id);
    if (!a) return;
    const larg = parseFloat(document.getElementById(`a-larg-${id}`)?.value);
    const alt  = parseFloat(document.getElementById(`a-alt-${id}`)?.value);
    if (!larg || larg <= 0) { await showAlert('Informe a largura da parede.', '⚠️'); return; }
    if (!alt  || alt  <= 0) { await showAlert('Informe a altura da parede.', '⚠️'); return; }
    a.amb = document.getElementById(`a-amb-${id}`)?.value.trim() || '';
    a.fixacao = document.getElementById(`a-fixacao-${id}`)?.value || 'Trilho Suico';
    a.abertura = document.getElementById(`a-abertura-${id}`)?.value || 'A';
    a.local_instalacao = document.getElementById(`a-local-${id}`)?.value || 'Parede';
    a.largura = larg; a.altura = alt;
    const tecidos = a.tecidos || [];
    if (!tecidos.length) { await showAlert('Adicione pelo menos um tecido ao ambiente.', '⚠️'); return; }
    let totalMat = 0;
    for (let tidx = 0; tidx < tecidos.length; tidx++) {
        const tecidoId = document.getElementById(`a-tecido-${id}-${tidx}`)?.value;
        if (!tecidoId) { await showAlert(`Selecione o tecido${tecidos.length > 1 ? ' '+(tidx+1) : ''} do ambiente.`, '⚠️'); return; }
        const tecido = db.catalogo.find(t => t.id == tecidoId);
        if (!tecido) return;
        const t = tecidos[tidx];
        const fator       = parseFloat(document.getElementById(`t-fator-${id}-${tidx}`)?.value);
        const bainha_cm   = parseFloat(document.getElementById(`t-bainha-${id}-${tidx}`)?.value) || 15;
        const cabecote_cm = parseFloat(document.getElementById(`t-cabecote-${id}-${tidx}`)?.value) || 0;
        if (!fator || fator <= 0) { await showAlert(`Informe um fator de franzimento válido para o tecido${tecidos.length > 1 ? ' '+(tidx+1) : ''} (ex: 2.0).`, '⚠️'); return; }
        t.tecidoId = tecido.id; t.tecidoNome = tecido.nome;
        t._ref = document.getElementById(`a-tec-ref-${id}-${tidx}`)?.value || t._ref || '';
        t.prega = document.getElementById(`t-prega-${id}-${tidx}`)?.value || 'Americana';
        t.fator = fator; t.bainha_cm = bainha_cm; t.cabecote_cm = cabecote_cm;
        t.largura_rolo = tecido.largura_rolo || 2.80;
        const alt_bruta = alt + bainha_cm / 100 + cabecote_cm / 100;
        const num_panos = Math.ceil((larg * fator) / t.largura_rolo);
        const consumo_linear = num_panos * alt_bruta;
        t.alt_corte = alt_bruta;
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

async function adicionarItemPedido() {
    const matId = parseInt(document.getElementById('ped-item-mat')?.value);
    const qtd   = parseFloat(document.getElementById('ped-item-qtd')?.value) || 1;
    if (!matId) { await showAlert('Selecione um material.', '⚠️'); return; }
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

// Kit pronto: produto em si, com código e preço próprios e sem componentes.
// Kit de montagem (o de sempre) não tem a marca e é explodido em materiais.
function ehKitPronto(kit) {
    return !!(kit && kit.tipo === 'pronto');
}

async function aplicarKit() {
    const kitId = parseInt(document.getElementById('ped-kit')?.value);
    if (!kitId) { await showAlert('Selecione um kit para aplicar.', '⚠️'); return; }
    const kit = db.kits.find(k => k.id == kitId);
    if (!kit) return;

    // Kit pronto entra como UMA linha, com o preço dele. Não há o que explodir.
    if (ehKitPronto(kit)) {
        const existente = pedidoDraft.itens.find(i => i.kitId === kit.id);
        if (existente) {
            existente.quantidade += 1;
            existente.subtotal = existente.quantidade * existente.preco_unit;
        } else {
            const preco = kit.preco || 0;
            pedidoDraft.itens.push({
                kitId: kit.id,
                nome: kit.nome + (kit.medida ? ' (' + kit.medida + ')' : ''),
                unidade: 'un', quantidade: 1, preco_unit: preco, subtotal: preco
            });
        }
        renderItensPedido(); atualizarTotalPedido();
        document.getElementById('ped-kit').value = '';
        return;
    }

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

// ── Busca rapida de material ou kit no pedido ───────────────────────────────
// Um campo so procura materiais e kits do cadastro pela referencia ou pelo
// nome. Escolher um resultado adiciona o item ao pedido na hora: material com
// a quantidade do campo "Quantidade", kit como em "Aplicar Kit". Materiais e
// kits podem repetir o id, por isso cada achado leva o tipo junto.

let _pedBuscaAtiva = -1;

function _pedBuscaAchados() {
    const termo = _buscaNormaliza(document.getElementById('ped-item-busca')?.value);
    if (!termo) return [];
    const casa = i => _buscaNormaliza(i.nome).includes(termo) || _buscaNormaliza(i.referencia).includes(termo);
    const mats = (db.materiais || []).filter(casa).map(m => ({ tipo: 'mat', item: m }));
    const kits = (db.kits || []).filter(casa).map(k => ({ tipo: 'kit', item: k }));
    // Quem bate a referencia exata vem primeiro: quem digita o codigo sabe o que quer.
    const exato = a => _buscaNormaliza(a.item.referencia) === termo ? 0 : 1;
    return mats.concat(kits).sort((a, b) => exato(a) - exato(b)).slice(0, 12);
}

function _pedBuscaDetalhe(a) {
    const i = a.item;
    if (a.tipo === 'kit') {
        return ehKitPronto(i)
            ? `${i.medida ? i.medida + ' · ' : ''}R$ ${(i.preco || 0).toFixed(2)}`
            : 'kit de montagem';
    }
    const est = temEstoqueInfinito(i) ? '∞' : (i.estoque_atual || 0).toFixed(1);
    return `${i.unidade || 'un'} · R$ ${(i.preco || 0).toFixed(2)} · estoque: ${est}`;
}

function pedBuscaRender() {
    const caixa = document.getElementById('ped-item-busca-sug');
    if (!caixa) return;
    if (!document.getElementById('ped-item-busca')?.value.trim()) { pedBuscaFechar(); return; }
    const achados = _pedBuscaAchados();
    if (!achados.length) {
        caixa.innerHTML = '<div class="consulta-sug-item" style="cursor:default;color:var(--muted)">Nenhum material ou kit com essa referência ou nome</div>';
        caixa.classList.add('aberta');
        return;
    }
    caixa.innerHTML = achados.map((a, n) => `
        <div class="consulta-sug-item ped-sug-item${n === _pedBuscaAtiva ? ' ativa' : ''}" onmousedown="event.preventDefault()" onclick="pedBuscaEscolher('${a.tipo}', ${a.item.id})">
            <span class="consulta-tag ${a.tipo}">${a.tipo === 'kit' ? 'KIT' : 'MAT'}</span>
            <span class="consulta-sug-cod">${escapeHtml(a.item.referencia || '—')}</span>
            <span class="consulta-sug-nome" style="color:var(--dark)">${escapeHtml(a.item.nome)}</span>
            <span class="ped-sug-det">${escapeHtml(_pedBuscaDetalhe(a))}</span>
        </div>`).join('');
    caixa.classList.add('aberta');
    caixa.querySelector('.consulta-sug-item.ativa')?.scrollIntoView({ block: 'nearest' });
}

function pedBuscaDigitou() {
    _pedBuscaAtiva = -1;
    pedBuscaRender();
}

function pedBuscaFechar() {
    _pedBuscaAtiva = -1;
    const caixa = document.getElementById('ped-item-busca-sug');
    if (caixa) { caixa.classList.remove('aberta'); caixa.innerHTML = ''; }
}

async function pedBuscaEscolher(tipo, id) {
    const sel = document.getElementById(tipo === 'kit' ? 'ped-kit' : 'ped-item-mat');
    if (!sel) return;
    sel.value = String(id);
    pedBuscaFechar();
    if (tipo === 'kit') await aplicarKit();
    else {
        await adicionarItemPedido();
        sel.value = '';
    }
    const campo = document.getElementById('ped-item-busca');
    if (campo) { campo.value = ''; campo.focus(); }
}

function pedBuscaTecla(e) {
    if (e.key === 'Escape') { pedBuscaFechar(); return; }
    const achados = _pedBuscaAchados();
    if (!achados.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const total = achados.length;
        _pedBuscaAtiva = e.key === 'ArrowDown'
            ? (_pedBuscaAtiva + 1) % total
            : (_pedBuscaAtiva <= 0 ? total - 1 : _pedBuscaAtiva - 1);
        pedBuscaRender();
        return;
    }
    if (e.key === 'Enter') {
        // Sem nada percorrido, um unico achado e' escolha obvia; varios, nao.
        const alvo = _pedBuscaAtiva >= 0 ? achados[_pedBuscaAtiva]
            : (achados.length === 1 ? achados[0] : null);
        if (alvo) { e.preventDefault(); pedBuscaEscolher(alvo.tipo, alvo.item.id); }
    }
}

document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('#ped-item-busca, #ped-item-busca-sug')) return;
    pedBuscaFechar();
});

// O valor do pedido e' a soma dos seus itens. O modo "por pedido" (margem
// global sobre o custo) saiu da tela: os itens ja carregam a margem deles.
// Pedidos antigos fechados naquele modo guardam os proprios valores e nao sao
// recalculados — ver o DRE, que ainda le tipo_precificacao.
function atualizarTotalPedido() {
    const mao     = parseFloat(document.getElementById('ped-mao')?.value) || 0;
    const descPct = parseFloat(document.getElementById('ped-desconto')?.value) || 0;

    const totalMat   = pedidoDraft.ambientes.filter(a => a.calculado).reduce((s, a) => s + (a.tecidos || []).reduce((ts, t) => ts + (t.total_material || 0), 0), 0);
    const totalItens = pedidoDraft.itens.reduce((s, i) => s + (i.subtotal || 0), 0);
    const bruto      = totalMat + totalItens + mao;

    const descVal  = Math.round(bruto * descPct / 100 * 100) / 100;
    const total    = bruto - descVal;
    const recEl    = document.getElementById('ped-valor-recebido');
    if (recEl && parseFloat(recEl.value) > total) { recEl.value = total.toFixed(2); }
    const recebido = parseFloat(document.getElementById('ped-valor-recebido')?.value) || 0;
    const saldo    = Math.max(0, total - recebido);
    const el = id => document.getElementById(id);
    if (el('ped-total-mat'))    el('ped-total-mat').textContent    = totalMat.toFixed(2);
    if (el('ped-total-itens'))  el('ped-total-itens').textContent  = totalItens.toFixed(2);
    if (el('ped-desconto-val')) el('ped-desconto-val').textContent = descVal.toFixed(2);
    if (el('ped-total-final'))  el('ped-total-final').textContent  = total.toFixed(2);
    if (el('ped-saldo'))        el('ped-saldo').textContent        = saldo.toFixed(2);

    [['ped-vendedor', 'ped-comissao'], ['ped-arquiteto', 'ped-comissao-arq']].forEach(([sel, pre]) => {
        const { pct, valor } = comissaoDoCadastro(document.getElementById(sel)?.value, total);
        const rowEl = el(pre + '-row');
        if (rowEl) rowEl.style.display = pct > 0 ? '' : 'none';
        if (el(pre + '-pct')) el(pre + '-pct').textContent = pct;
        if (el(pre + '-val')) el(pre + '-val').textContent = valor.toFixed(2);
    });
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

async function salvarPedido() {
    if (!await exigirPermissao('pedidos', 'completo')) return;
    const statusAnterior = editandoIdPedido
        ? normalizarStatus(db.pedidos.find(p => p.id == editandoIdPedido)?.status || 'Orçamento')
        : 'Orçamento';
    const clienteId = document.getElementById('ped-cliente')?.value;
    if (!clienteId) { await showAlert('Selecione o cliente.', '⚠️'); return; }
    if (!pedidoDraft.ambientes.length) { await showAlert('Adicione pelo menos um ambiente.', '⚠️'); return; }
    const naoCalculados = pedidoDraft.ambientes.filter(a => !a.calculado);
    if (naoCalculados.length) { await showAlert(`${naoCalculados.length} ambiente(s) ainda não calculado(s). Clique em "Calcular Consumo" em cada ambiente.`, '⚠️'); return; }
    pedidoDraft.ambientes.forEach(a => {
        const el = document.getElementById(`a-amb-${a.id}`);
        if (el) a.amb = el.value.trim() || a.amb;
    });
    const cliente          = db.clientes.find(c => c.id == clienteId);
    const maoObra          = parseFloat(document.getElementById('ped-mao')?.value) || 0;
    const desconto_pct     = parseFloat(document.getElementById('ped-desconto')?.value) || 0;
    const total_material   = pedidoDraft.ambientes.reduce((s,a)=>s+(a.tecidos||[]).reduce((ts,t)=>ts+(t.total_material||0),0),0);
    const total_acessorios = pedidoDraft.itens.reduce((s,i)=>s+(i.subtotal||0),0);
    const bruto            = total_material + total_acessorios + maoObra;
    const desconto_valor   = Math.round(bruto * desconto_pct / 100 * 100) / 100;
    const valor            = bruto - desconto_valor;
    const ambNomes         = pedidoDraft.ambientes.map(a=>a.amb).filter(Boolean).join(', ') || 'Sem nome';
    const vendedor_id_sel  = parseInt(document.getElementById('ped-vendedor')?.value) || null;
    const arq_id_sel       = parseInt(document.getElementById('ped-arquiteto')?.value) || null;
    if (!vendedor_id_sel && !arq_id_sel) { await showAlert('Informe pelo menos um vendedor ou um arquiteto.', '⚠️'); return; }
    const vendedor_obj     = vendedor_id_sel ? db.vendedores.find(v => v.id === vendedor_id_sel) : null;
    const arq_obj          = arq_id_sel ? db.vendedores.find(v => v.id === arq_id_sel) : null;
    const { pct: comissao_pct, valor: comissao_valor }         = comissaoDoCadastro(vendedor_id_sel, valor);
    const { pct: arq_comissao_pct, valor: arq_comissao_valor } = comissaoDoCadastro(arq_id_sel, valor);
    const dadosPedido = {
        clienteId, clienteNome: cliente ? cliente.nome : 'Cliente Não Vinculado',
        amb: ambNomes, ambientes: pedidoDraft.ambientes.map(a=>({...a})),
        itens: pedidoDraft.itens.map(i=>({...i})),
        maoObra, total_material, total_acessorios, desconto_pct, desconto_valor, valor,
        // Fica gravado para o DRE distinguir destes os pedidos antigos, que
        // foram fechados com margem global e guardam o proprio custo.
        tipo_precificacao: 'item', custo_mat: null, custo_acess: null,
        status:         document.getElementById('ped-status')?.value || 'Orçamento',
        data_entrega:   document.getElementById('ped-entrega')?.value || null,
        observacoes:    document.getElementById('ped-obs')?.value.trim() || '',
        valor_recebido: parseFloat(document.getElementById('ped-valor-recebido')?.value) || 0,
        vendedor_id:    vendedor_id_sel,
        vendedor_nome:  vendedor_obj ? vendedor_obj.nome : '',
        comissao_pct,
        comissao_valor,
        arq_id:         arq_id_sel,
        arq_nome:       arq_obj ? arq_obj.nome : '',
        arq_comissao_pct,
        arq_comissao_valor,
        arquiteto_nome: '',
        rt_pct: 0,
        forma_pagamento: document.getElementById('ped-forma-pagamento')?.value || getFormasPagamento()[0]
    };
    if (editandoIdPedido) {
        const index = db.pedidos.findIndex(p => p.id == editandoIdPedido);
        dadosPedido.id = editandoIdPedido;
        if (index >= 0) {
            dadosPedido.data_producao     = db.pedidos[index].data_producao;
            dadosPedido.data_instalado    = db.pedidos[index].data_instalado;
            dadosPedido.baixa_realizada   = db.pedidos[index].baixa_realizada;
            dadosPedido.data_criacao      = db.pedidos[index].data_criacao || db.pedidos[index].id;
            dadosPedido.comissao_paga     = db.pedidos[index].comissao_paga     || false;
            dadosPedido.comissao_data_pgto = db.pedidos[index].comissao_data_pgto || null;
            dadosPedido.arq_comissao_paga      = db.pedidos[index].arq_comissao_paga      || false;
            dadosPedido.arq_comissao_data_pgto = db.pedidos[index].arq_comissao_data_pgto || null;
            dadosPedido.financeiro_gerado  = db.pedidos[index].financeiro_gerado  || false;
            dadosPedido.rt_gerado          = db.pedidos[index].rt_gerado          || false;
            // RT antiga (campo livre que saiu da tela): editar o pedido nao a apaga.
            dadosPedido.arquiteto_nome     = db.pedidos[index].arquiteto_nome     || '';
            dadosPedido.rt_pct             = db.pedidos[index].rt_pct             || 0;
            // Editar nao desfaz o vinculo com o agendamento de medicao.
            if (db.pedidos[index].medicao_id != null) dadosPedido.medicao_id = db.pedidos[index].medicao_id;
            if (dadosPedido.status === 'Na Costura' && !dadosPedido.baixa_realizada) {
                realizarBaixaEstoque(dadosPedido);
            }
            db.pedidos[index] = dadosPedido;
        }
    } else {
        // Vindo de "Criar Pedido" na agenda: se o agendamento ja ganhou pedido
        // (outra aba, botao voltar), nao cria um segundo.
        const med = pedidoMedicaoId ? (db.medicoes || []).find(m => m.id == pedidoMedicaoId) : null;
        const jaTem = _medPedidoVinculado(med);
        if (jaTem) {
            await showAlert(`Este agendamento de medição já tem o pedido #${formatPedidoId(jaTem.id)}.\nAbra esse pedido para alterá-lo.`, '⚠️');
            return;
        }
        dadosPedido.id = gerarNumeroPedido();
        dadosPedido.data_criacao = Date.now();
        if (med) _medVincularPedido(med, dadosPedido);
        dadosPedido.criado_por = getUsuarioLogado()?.id || null;
        if (dadosPedido.status === 'Na Costura') {
            realizarBaixaEstoque(dadosPedido);
        }
        db.pedidos.push(dadosPedido);
    }
    if (statusAnterior === 'Orçamento' && normalizarStatus(dadosPedido.status) !== 'Orçamento') {
        gerarFinanceiroPedido(dadosPedido);
    }
    syncDB();
    localStorage.removeItem('sc_editando_id');
    toastReload('Pedido salvo!');
    window.location.href = 'index.html';
}

function bloquearPedidoInstalado() {
    const ped = db.pedidos.find(p => p.id == editandoIdPedido);
    if (!ped || normalizarStatus(ped.status) !== 'Instalado') return;

    document.querySelectorAll('.main input, .main select, .main textarea, .main button')
        .forEach(el => {
            if (el.id === 'ped-status') return;
            el.disabled = true;
        });

    const saveBtn = document.querySelector('.btn-success[onclick="salvarPedido()"]');
    if (saveBtn) saveBtn.style.display = 'none';

    const header = document.querySelector('.header');
    if (header) {
        const notice = document.createElement('div');
        notice.style.cssText = 'background:#FEF6D8;border:1px solid #F2C924;color:#8A6A00;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;';
        notice.innerHTML = '🔒 Pedido instalado — somente leitura';
        header.appendChild(notice);
    }
}

function carregarPedidoParaEdicao(id) {
    const ped = db.pedidos.find(p => p.id == id);
    if (!ped) return;
    const cli = db.clientes.find(c => c.id == ped.clienteId);
    const buscaEl = document.getElementById('ped-cliente-busca');
    if (buscaEl && cli) { buscaEl.value = cli.nome; filtrarClientes(); }
    document.getElementById('ped-cliente').value = String(ped.clienteId || '');
    document.getElementById('ped-mao').value     = ped.maoObra || 0;
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
    const arqEl = document.getElementById('ped-arquiteto');
    if (arqEl) arqEl.value = String(ped.arq_id || '');
    preencherSelectFormaPagamento(formaPagamentoDoPedido(ped));
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
let _kanbanFiltro = { cliente: '', vendedor: '', tecido: '' };

function aplicarFiltroKanban() {
    _kanbanFiltro.cliente  = (document.getElementById('kf-cliente')?.value  || '').toLowerCase().trim();
    _kanbanFiltro.vendedor = document.getElementById('kf-vendedor')?.value  || '';
    _kanbanFiltro.tecido   = document.getElementById('kf-tecido')?.value    || '';
    renderKanban();
}

function limparFiltroKanban() {
    _kanbanFiltro = { cliente: '', vendedor: '', tecido: '' };
    const c = document.getElementById('kf-cliente');   if (c) c.value = '';
    const v = document.getElementById('kf-vendedor');  if (v) v.value = '';
    const t = document.getElementById('kf-tecido');    if (t) t.value = '';
    renderKanban();
}

function renderKanban() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const COLUNAS = [
        { status: 'Medição',              label: 'Aguardando Medição Fina', cor: '#2D77C1', bg: '#E4EFF9' },
        { status: 'Aguardando Tecido',    label: 'Aguardando Tecido',       cor: '#FF7F08', bg: '#FFF0E0' },
        { status: 'Na Costura',           label: 'Na Costura',              cor: '#9B31C8', bg: '#F2E6F9' },
        { status: 'Pronto p/ Instalação', label: 'Pronto p/ Instalação',    cor: '#005D3B', bg: '#F0FBEF' },
        { status: 'Aguardando Pagamento', label: 'Aguardando Pagamento',    cor: '#FF575F', bg: '#FEF4F2' },
        { status: 'Instalado',            label: 'Instalado / Entregue',    cor: '#159912', bg: '#E3F7E2' }
    ];
    const avisoEl = document.getElementById('aviso-orcamentos');
    const orcamentos = db.pedidos.filter(p => normalizarStatus(p.status) === 'Orçamento');
    if (avisoEl) {
        if (orcamentos.length > 0) {
            avisoEl.innerHTML = `<span>📋 <strong>${orcamentos.length}</strong> orçamento(s) aguardando aprovação</span><a href="index.html" class="btn btn-outline btn-sm">Ver no Dashboard →</a>`;
            avisoEl.style.display = 'flex';
        } else { avisoEl.style.display = 'none'; }
    }
    const filtroAtivo = _kanbanFiltro.cliente || _kanbanFiltro.vendedor || _kanbanFiltro.tecido;
    let totalFiltrado = 0;
    // Os mesmos pedidos filtrados alimentam o Kanban e a Lista.
    const grupos = COLUNAS.map(col => {
        const pedidos = db.pedidos.filter(p => normalizarStatus(p.status) === col.status && _kanbanPassaFiltro(p));
        totalFiltrado += pedidos.length;
        return { col, pedidos };
    });
    const resEl = document.getElementById('kf-resultado');
    if (resEl) resEl.textContent = filtroAtivo ? `${totalFiltrado} pedido(s) encontrado(s)` : '';
    const modo = _pcpModo();
    _pcpMarcarModo(modo);
    const lista = document.getElementById('kanban-lista');
    board.hidden = modo === 'lista';
    if (lista) lista.hidden = modo !== 'lista';
    if (modo === 'lista' && lista) { lista.innerHTML = _pcpListaHTML(grupos, filtroAtivo); return; }
    board.innerHTML = grupos.map(({ col, pedidos: pedidosCol }) => {
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
                const vendedorLinha = p.vendedor_nome ? `<div class="kanban-card-vendedor">👤 ${escapeHtml(p.vendedor_nome)}</div>` : '';
                if (isInstalado) {
                    const dataInst = p.data_instalado ? new Date(p.data_instalado).toLocaleDateString('pt-BR') : (dias + 'd atrás');
                    return `<div class="kanban-card${cardAtrasado}" style="padding:8px 10px">
                        <div class="kanban-card-top">
                            <span class="kanban-card-id" style="cursor:pointer;text-decoration:underline" onclick="editarPedido(${p.id})" title="Editar pedido">#${formatPedidoId(p.id)}</span>
                            <span class="kanban-card-age">${dataInst}</span>
                        </div>
                        ${vendedorLinha}
                        <div class="kanban-card-cliente" style="font-size:13px">${escapeHtml(p.clienteNome||'')}${obsBadge}</div>
                        <div class="kanban-card-actions" style="margin-top:6px">
                            <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})" title="Ver Ordem de Serviço">📋 OS</button>
                            <button class="btn btn-outline btn-sm" onclick="verTimeline(${p.id})" title="Ver timeline">⏱</button>
                            ${podeVoltar ? `<button class="btn btn-outline btn-sm" onclick="moverStatus(${p.id},-1)" title="Voltar status">←</button>` : ''}
                        </div>
                    </div>`;
                }
                let badgeEst = '';
                for (const a of ambientes) {
                    for (const t of (a.tecidos||[])) {
                        if (!t.tecidoId) continue;
                        if (tecidoTemEstoqueInfinito(t.tecidoId)) continue;
                        const disp = estoqueDisponivel(t.tecidoId);
                        if (disp < (t.consumo_linear||0)) { badgeEst = `<span class="badge-sem-estoque">⚠ Sem estoque</span>`; break; }
                        else if (!badgeEst && verificarConflitoDeLote(t.tecidoId, t.consumo_linear||0)) badgeEst = `<span class="badge-lote">⚠ Múltiplos lotes</span>`;
                    }
                    if (badgeEst.includes('Sem estoque')) break;
                }
                const badgeBaixa   = p.baixa_realizada ? `<span class="badge-baixa">✔ Baixa OK</span>` : '';
                const entregaInf   = statusEntrega(p);
                const entregaBadge = entregaInf ? `<span class="${entregaInf.cls}">${entregaInf.label}</span>` : '';
                // Pronto p/ Instalacao: sem agendamento, a seta leva para a
                // agenda com o pedido ja selecionado; agendado, confirma a entrega.
                const prontoSemAgenda = col.status === 'Pronto p/ Instalação' && !_instAgendada(p);
                const instLinha = col.status !== 'Pronto p/ Instalação' ? ''
                    : prontoSemAgenda
                        ? `<div class="kanban-inst kanban-inst-pend">📅 Aguardando agendamento</div>`
                        : `<div class="kanban-inst">📅 ${_agdFmtData(p.data_entrega)}${p.inst_hora ? ' · ' + escapeHtml(p.inst_hora) : ''}${nomeInstalador(p) ? ' · ' + escapeHtml(nomeInstalador(p)) : ''}</div>`;
                const btnAvancar = prontoSemAgenda ? ''
                    : `<button class="btn btn-sm" onclick="moverStatus(${p.id},1)" title="Avançar etapa">→</button>`;
                const btnAgendar = prontoSemAgenda
                    ? `<button class="btn btn-sm kanban-btn-agendar" onclick="irParaAgendaInstalacao(${p.id})" title="Agendar instalação">📅 Agendar instalação</button>`
                    : '';
                return `<div class="kanban-card${cardAtrasado}">
                    <div class="kanban-card-top">
                        <span class="kanban-card-id" style="cursor:pointer;text-decoration:underline" onclick="editarPedido(${p.id})" title="Editar pedido">#${formatPedidoId(p.id)}</span>
                        <span class="kanban-card-age${dias >= 30 ? ' kanban-card-age-critical' : dias >= 14 ? ' kanban-card-age-warning' : ''}">${dias === 0 ? 'hoje' : dias + 'd'}</span>
                    </div>
                    ${vendedorLinha}
                    <div class="kanban-card-cliente">${escapeHtml(p.clienteNome||'')}${obsBadge}</div>
                    ${entregaBadge ? `<div style="margin:3px 0 5px">${entregaBadge}</div>` : ''}
                    ${instLinha}
                    ${badgeEst||badgeBaixa ? `<div style="margin-bottom:6px">${badgeEst}${badgeBaixa}</div>` : ''}
                    <div class="kanban-card-actions">
                        <div style="display:flex;gap:4px">
                            <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})" title="Ver Ordem de Serviço">📋</button>
                            <button class="btn btn-outline btn-sm" onclick="verTimeline(${p.id})" title="Ver timeline">⏱</button>
                        </div>
                        <div style="display:flex;gap:4px">
                            ${podeVoltar  ? `<button class="btn btn-outline btn-sm" onclick="moverStatus(${p.id},-1)" title="Voltar etapa">←</button>` : `<span class="kanban-nav-ph"></span>`}
                            ${podeAvancar ? btnAvancar : ''}
                        </div>
                    </div>
                    ${btnAgendar}
                </div>`;
            }).join('');
        return `<div class="kanban-col">
            <div class="kanban-col-header" style="background:${col.cor}"><span>${col.label}</span><span class="kanban-count">${pedidosCol.length}</span></div>
            <div class="kanban-col-body" style="background:${col.bg}">${cards}</div>
        </div>`;
    }).join('');
    _kanbanAjustarAltura();
}

// Altura fixa do quadro: o espaco que sobra entre o topo do quadro e o fim da
// area principal, para a pagina nao rolar. Mesmo com o aviso de orcamentos ou
// os filtros quebrando linha, o calculo parte da posicao real do quadro.
const _KANBAN_ALTURA_MIN = 320;
function _kanbanAjustarAltura() {
    const board = document.getElementById('kanban-board');
    if (!board || board.hidden || !board.offsetParent) return;
    const main = board.closest('.main');
    const topoMain = main ? main.getBoundingClientRect().top : 0;
    const altMain  = main ? main.clientHeight : window.innerHeight;
    const padBaixo = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
    const topo = board.getBoundingClientRect().top - topoMain + (main ? main.scrollTop : 0);
    const alt = Math.max(_KANBAN_ALTURA_MIN, Math.floor(altMain - topo - padBaixo));
    board.style.setProperty('--kanban-altura', alt + 'px');
}
window.addEventListener('resize', () => _kanbanAjustarAltura());

// Busca do topo: nome do cliente ou numero do pedido (com ou sem #).
function _kanbanPassaFiltro(p) {
    const q = _kanbanFiltro.cliente;
    if (q) {
        const num = q.replace(/^#/, '');
        const casaNome = (p.clienteNome || '').toLowerCase().includes(q);
        const casaNum  = num && (String(p.id).includes(num) || String(formatPedidoId(p.id)).toLowerCase().includes(num));
        if (!casaNome && !casaNum) return false;
    }
    if (_kanbanFiltro.vendedor && (p.vendedor_nome||p.vendedor||'') !== _kanbanFiltro.vendedor) return false;
    if (_kanbanFiltro.tecido) {
        const amb = normalizarAmbientes(p);
        if (!amb.some(a => (a.tecidos||[]).some(t => String(t.tecidoId) === _kanbanFiltro.tecido))) return false;
    }
    return true;
}

// --- Status dos pedidos: modo Lista ------------------------------------------
// A escolha Kanban/Lista e os blocos fechados ficam guardados por usuario,
// neste navegador. Leitura e escrita protegidas: sem armazenamento, vale o padrao.
function _pcpChave(nome) { return `sc_pcp_${nome}_${getUsuarioLogado()?.id || 0}`; }
function _pcpLer(nome, padrao) {
    try { const v = localStorage.getItem(_pcpChave(nome)); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; }
}
function _pcpGravar(nome, valor) {
    try { localStorage.setItem(_pcpChave(nome), JSON.stringify(valor)); } catch (e) {}
}
function _pcpModo() { return _pcpLer('modo', 'kanban') === 'lista' ? 'lista' : 'kanban'; }

function _pcpMarcarModo(modo) {
    ['kanban', 'lista'].forEach(m => {
        const b = document.getElementById('pcp-modo-' + m);
        if (!b) return;
        b.classList.toggle('ativo', m === modo);
        b.setAttribute('aria-pressed', String(m === modo));
    });
}

function trocarModoPCP(modo) {
    _pcpGravar('modo', modo === 'lista' ? 'lista' : 'kanban');
    renderKanban();
}

// Instalado comeca fechado: e a etapa que so cresce.
function _pcpFechados() {
    const v = _pcpLer('fechados', ['Instalado']);
    return Array.isArray(v) ? v : ['Instalado'];
}

function alternarBlocoPCP(status) {
    const f = _pcpFechados();
    const i = f.indexOf(status);
    if (i >= 0) f.splice(i, 1); else f.push(status);
    _pcpGravar('fechados', f);
    renderKanban();
}

function _pcpListaHTML(grupos, filtroAtivo) {
    const fechados = _pcpFechados();
    // Com filtro, bloco sem resultado some; sem filtro, aparece com a contagem 0.
    const visiveis = filtroAtivo ? grupos.filter(g => g.pedidos.length) : grupos;
    if (!visiveis.length) return `<div class="pcp-lista-vazia">Nenhum pedido encontrado com esses filtros.</div>`;
    return visiveis.map(({ col, pedidos }) => {
        const aberto = !fechados.includes(col.status);
        const idx = STATUS_PIPELINE.indexOf(col.status);
        const linhas = !pedidos.length
            ? `<div class="pcp-lista-nada">Nenhum pedido nesta etapa</div>`
            : pedidos.map(p => _pcpLinhaHTML(p, col, idx)).join('');
        const statusJs = escapeHtml(JSON.stringify(col.status));
        return `<section class="pcp-bloco${aberto ? ' aberto' : ''}" data-status="${escapeHtml(col.status)}" style="--bloco-cor:${col.cor};--bloco-bg:${col.bg}">
            <button type="button" class="pcp-bloco-head" onclick="alternarBlocoPCP(${statusJs})" aria-expanded="${aberto}">
                <span class="pcp-bloco-seta" aria-hidden="true">▸</span>
                <span class="pcp-bloco-nome">${escapeHtml(col.label)}</span>
                <span class="pcp-bloco-count">${pedidos.length}</span>
            </button>
            ${aberto ? `<div class="pcp-bloco-corpo">${linhas}</div>` : ''}
        </section>`;
    }).join('');
}

function _pcpLinhaHTML(p, col, idx) {
    const podeVoltar  = idx > 1;
    const podeAvancar = idx < STATUS_PIPELINE.length - 1;
    const prontoSemAgenda = col.status === 'Pronto p/ Instalação' && !_instAgendada(p);
    const entrega = statusEntrega(p);
    const obs = p.observacoes ? `<span class="pcp-linha-obs" title="${escapeHtml(p.observacoes)}">💬</span>` : '';
    const avancar = !podeAvancar ? ''
        : prontoSemAgenda
            ? `<button class="btn btn-sm kanban-btn-agendar" onclick="irParaAgendaInstalacao(${p.id})" title="Agendar instalação">📅 Agendar</button>`
            : `<button class="btn btn-sm" onclick="moverStatus(${p.id},1)" title="Avançar etapa">→</button>`;
    return `<div class="pcp-linha">
        <button type="button" class="pcp-linha-num" onclick="editarPedido(${p.id})" title="Abrir pedido">#${formatPedidoId(p.id)}</button>
        <div class="pcp-linha-cli">
            <span class="pcp-linha-nome">${escapeHtml(p.clienteNome || '')}${obs}</span>
            ${p.amb ? `<span class="pcp-linha-amb">${escapeHtml(p.amb)}</span>` : ''}
        </div>
        <div class="pcp-linha-entrega">${entrega ? `<span class="${entrega.cls}">${entrega.label}</span>` : ''}</div>
        <div class="pcp-linha-acoes">
            <button class="btn btn-outline btn-sm" onclick="abrirOS(${p.id})" title="Ver Ordem de Serviço">📋</button>
            <button class="btn btn-outline btn-sm" onclick="verTimeline(${p.id})" title="Ver timeline">⏱</button>
            ${podeVoltar ? `<button class="btn btn-outline btn-sm" onclick="moverStatus(${p.id},-1)" title="Voltar etapa">←</button>` : ''}
            ${avancar}
        </div>
    </div>`;
}

// --- ASSINATURA DIGITAL (canvas) ---
function buildAssinaturaHTML(pedidoId, campo, w, h) {
    w = w || 260; h = h || 90;
    const ped = db.pedidos.find(p => p.id == pedidoId);
    const dataUrl = ped?.assinaturas?.[campo] || '';
    const canvasId = `sig-canvas-${pedidoId}-${campo}`;
    if (dataUrl) {
        return `<div class="assinatura-box">
            <img src="${dataUrl}" class="assinatura-img" style="width:${w}px;height:${h}px;object-fit:contain" alt="Assinatura">
            <button type="button" class="btn btn-outline btn-sm no-print" style="margin-top:4px" onclick="refazerAssinatura(${pedidoId},'${campo}')">✏️ Refazer assinatura</button>
        </div>`;
    }
    return `<div class="assinatura-box">
        <canvas id="${canvasId}" class="assinatura-canvas" data-pedido="${pedidoId}" data-campo="${campo}" width="${w}" height="${h}" style="width:${w}px;height:${h}px"></canvas>
        <div class="no-print" style="margin-top:4px;display:flex;gap:6px">
            <button type="button" class="btn btn-outline btn-sm" onclick="limparAssinatura('${canvasId}')">🗑️ Limpar</button>
            <button type="button" class="btn btn-sm" onclick="salvarAssinatura(${pedidoId},'${campo}','${canvasId}')">💾 Salvar Assinatura</button>
        </div>
    </div>`;
}

function iniciarAssinaturaPads(root) {
    (root || document).querySelectorAll('canvas.assinatura-canvas').forEach(canvas => {
        if (canvas._sigBound) return;
        canvas._sigBound = true;
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#242424';
        let drawing = false, last = null;
        const pos = e => {
            const r = canvas.getBoundingClientRect();
            const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
            const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
            return { x: cx * canvas.width / r.width, y: cy * canvas.height / r.height };
        };
        const start = e => { drawing = true; last = pos(e); e.preventDefault(); };
        const move  = e => {
            if (!drawing) return;
            const p = pos(e);
            ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            last = p; e.preventDefault();
        };
        const end = () => { drawing = false; };
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', end);
    });
}

function limparAssinatura(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function _assinaturaCanvasVazio(canvas) {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
    return true;
}

async function salvarAssinatura(pedidoId, campo, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (_assinaturaCanvasVazio(canvas)) { await showAlert('Desenhe a assinatura antes de salvar.', '⚠️'); return; }
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped) return;
    if (!ped.assinaturas) ped.assinaturas = {};
    ped.assinaturas[campo] = canvas.toDataURL('image/png');
    syncDB();
    toast('Assinatura salva!', 'success', 1500);
    _refrescarDocModalAtual();
}

async function refazerAssinatura(pedidoId, campo) {
    const ok = await showConfirm('Apagar esta assinatura e assinar novamente?', '🖊️');
    if (!ok) return;
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (ped?.assinaturas) delete ped.assinaturas[campo];
    syncDB();
    _refrescarDocModalAtual();
}

// --- DOC MODAL ---
let _docModalAtual = null; // { tipo: 'os'|'proposta', pedidoId, dias }

function _refrescarDocModalAtual() {
    if (!_docModalAtual) return;
    const paper = document.getElementById('doc-modal-paper')
        || document.getElementById('os-container')
        || document.getElementById('proposta-container');
    if (!paper) return;
    paper.innerHTML = _docModalAtual.tipo === 'os'
        ? gerarHTMLOS(_docModalAtual.pedidoId)
        : gerarHTMLProposta(_docModalAtual.pedidoId, _docModalAtual.dias || 15);
    iniciarAssinaturaPads(paper);
}

function abrirDocModal(htmlContent, titulo, extraToolbar) {
    let overlay = document.getElementById('doc-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'doc-modal-overlay';
        overlay.innerHTML = `
            <div id="doc-modal-topbar">
                <span id="doc-modal-topbar-title"></span>
                <div id="doc-modal-topbar-actions"></div>
            </div>
            <div id="doc-modal-scroll">
                <div id="doc-modal-paper"></div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) fecharDocModal(); });
    }
    document.getElementById('doc-modal-topbar-title').textContent = titulo || 'Documento';
    const paper = document.getElementById('doc-modal-paper');
    paper.innerHTML = htmlContent;
    iniciarAssinaturaPads(paper);
    document.getElementById('doc-modal-topbar-actions').innerHTML =
        (extraToolbar || '') +
        `<button class="doc-modal-btn" onclick="imprimirDocModal()">🖨️ Imprimir / PDF</button>` +
        `<button class="doc-modal-btn doc-modal-btn-close" onclick="fecharDocModal()">✕ Fechar</button>`;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharDocModal() {
    const overlay = document.getElementById('doc-modal-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
    _docModalAtual = null;
}

function imprimirDocModal() {
    const paper = document.getElementById('doc-modal-paper');
    if (!paper) return;
    let printRoot = document.getElementById('doc-print-root');
    if (!printRoot) {
        printRoot = document.createElement('div');
        printRoot.id = 'doc-print-root';
        document.body.appendChild(printRoot);
    }
    const clone = paper.cloneNode(true);
    // cloneNode não preserva o bitmap desenhado no canvas — substitui cada canvas de
    // assinatura pela imagem atual antes de imprimir, mesmo que ainda não tenha sido salva.
    const origCanvases  = paper.querySelectorAll('canvas.assinatura-canvas');
    const cloneCanvases = clone.querySelectorAll('canvas.assinatura-canvas');
    origCanvases.forEach((origCanvas, i) => {
        const cloneCanvas = cloneCanvases[i];
        if (!cloneCanvas) return;
        const img = document.createElement('img');
        img.className = 'assinatura-img';
        img.style.cssText = cloneCanvas.style.cssText;
        img.src = origCanvas.toDataURL('image/png');
        cloneCanvas.replaceWith(img);
    });
    printRoot.innerHTML = '';
    printRoot.appendChild(clone);
    document.body.classList.add('doc-modal-printing');
    window.print();
    window.addEventListener('afterprint', function cleanup() {
        document.body.classList.remove('doc-modal-printing');
        printRoot.innerHTML = '';
        window.removeEventListener('afterprint', cleanup);
    }, { once: true });
}

function abrirPropostaModal(pedidoId) {
    _docModalAtual = { tipo: 'proposta', pedidoId, dias: 15 };
    const extra = `<label style="color:#fff;font-size:13px;display:flex;align-items:center;gap:6px;margin-right:4px">
        Validade: <input type="number" id="proposta-dias-modal" value="15" min="1" max="365"
            style="width:56px;padding:4px 6px;border-radius:4px;border:none;font-size:13px;text-align:center"
            onchange="atualizarPropostaModal(${pedidoId}, this.value)"> dias
    </label>`;
    abrirDocModal(gerarHTMLProposta(pedidoId, 15), 'Proposta Comercial', extra);
}

function atualizarPropostaModal(pedidoId, dias) {
    if (_docModalAtual) _docModalAtual.dias = parseInt(dias) || 15;
    const paper = document.getElementById('doc-modal-paper');
    if (paper) { paper.innerHTML = gerarHTMLProposta(pedidoId, parseInt(dias) || 15); iniciarAssinaturaPads(paper); }
}

let _pcShareData = null;
function mostrarSharePC() {
    if (!_pcShareData) return;
    const { waUrl, mailUrl, num, avisoWA, avisoMail } = _pcShareData;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:420px">
        <div class="modal-header">
            <h3>Compartilhar — Pedido #${num}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            <p style="font-size:13px;color:#8F8F8F;margin-bottom:16px">Imprima ou salve o PDF clicando em 🖨️ Imprimir / PDF e depois envie ao fornecedor:</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <a href="${waUrl}" target="_blank" onclick="this.closest('.modal-overlay').remove()"
                   style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 12px;background:#25D366;border-radius:10px;color:#fff;text-decoration:none;font-weight:600;font-size:14px">
                    <span style="font-size:28px">📱</span>WhatsApp${avisoWA}
                </a>
                <a href="${mailUrl}" onclick="this.closest('.modal-overlay').remove()"
                   style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 12px;background:var(--primary);border-radius:10px;color:#fff;text-decoration:none;font-weight:600;font-size:14px">
                    <span style="font-size:28px">✉️</span>E-mail${avisoMail}
                </a>
            </div>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// --- ORDEM DE SERVIÇO ---
function gerarHTMLOS(pedidoId) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped) return '<p style="text-align:center;color:#999;padding:40px;">OS não encontrada.</p>';
    const ambientes = normalizarAmbientes(ped);
    const cliente   = db.clientes.find(c => c.id == ped.clienteId);
    const hoje      = new Date().toLocaleDateString('pt-BR');
    const osSpec = (label, val) => `<span class="os-spec"><span class="os-spec-lbl">${label}</span>${val}</span>`;
    const ambientesHTML = ambientes.map((a, idx) => {
        const tecidos = a.tecidos || [];
        const totalConsumo = tecidos.reduce((s,t)=>s+(t.consumo_linear||0),0);
        const tecBlocks = tecidos.map((t, tidx) => {
            const prefixo = tecidos.length > 1 ? `Tecido ${tidx+1}: ` : '';
            const largTotal = ((a.largura||0)*(t.fator||1)).toFixed(2);
            return `<div class="os-tec-block">
                <div class="os-tec-name">${prefixo}${escapeHtml(t.tecidoNome||'—')}</div>
                <div class="os-tec-specs">
                    ${osSpec('Prega', escapeHtml(t.prega||'—'))}
                    ${osSpec('Fator', (t.fator||'—')+'x')}
                    ${osSpec('Barra', (t.bainha_cm??15)+' cm')}
                    ${osSpec('Cabeçote', (t.cabecote_cm??0)+' cm')}
                    ${osSpec('Largura total', largTotal+' m')}
                    ${osSpec('Panos', t.num_panos||'—')}
                    ${osSpec('Alt. corte', (t.alt_corte?t.alt_corte.toFixed(3):'—')+' m')}
                    <span class="os-spec os-spec-consumo"><span class="os-spec-lbl">Consumo</span><strong>${(t.consumo_linear||0).toFixed(2)} m</strong></span>
                </div>
            </div>`;
        }).join('');
        return `
        <div class="os-amb-card">
            <div class="os-amb-head">
                <span class="os-amb-name">Ambiente ${idx+1}${a.amb ? ': '+escapeHtml(a.amb) : ''}</span>
                <span class="os-amb-meta">${escapeHtml(a.fixacao||'—')} · ${escapeHtml(a.local_instalacao||'Parede')} · Abertura ${escapeHtml(a.abertura||'A')} · ${a.largura||'—'}m × ${a.altura||'—'}m</span>
            </div>
            ${tecBlocks}
            ${tecidos.length > 1 ? `<div class="os-amb-total">Total do ambiente: <strong>${totalConsumo.toFixed(2)} m lineares</strong></div>` : ''}
        </div>`;
    }).join('');
    const itensHTML = ped.itens && ped.itens.length ? `
        <div class="os-section">
            <div class="os-section-title">Materiais e Acessórios</div>
            <table class="os-table">
                <tr><td class="os-th" style="width:40%">Material</td><td class="os-th">Quantidade</td><td class="os-th">Unidade</td></tr>
                ${ped.itens.map(i=>`<tr><td>${escapeHtml(i.nome)}</td><td>${i.quantidade}</td><td>${escapeHtml(i.unidade)}</td></tr>`).join('')}
            </table>
        </div>` : '';
    return `
        <div class="os-header">
            <div>
                <div class="os-empresa">${buildEmpresaHeaderHTML(42)}</div>
                <div class="os-titulo">ORDEM DE SERVIÇO INTERNA</div>
                <div class="os-aviso">⚠ SEM VALOR COMERCIAL — USO EXCLUSIVAMENTE INTERNO</div>
            </div>
            <div class="os-meta">
                <div class="os-meta-item"><span>OS Nº</span><strong>${formatPedidoId(ped.id)}</strong></div>
                <div class="os-meta-item"><span>Emissão</span><strong>${hoje}</strong></div>
                ${ped.data_entrega ? `<div class="os-meta-item"><span>Previsão entrega</span><strong>${new Date(ped.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></div>` : ''}
                <div class="os-meta-item"><span>Status</span><strong>${normalizarStatus(ped.status)}</strong></div>
            </div>
        </div>
        <div class="os-cliente-bar"><span class="os-cliente-label">Cliente</span><strong>${escapeHtml(cliente?cliente.nome:'—')}</strong></div>
        ${ambientesHTML}${itensHTML}
        <div class="os-section"><div class="os-section-title">Observações</div><div class="os-obs-box" style="padding:10px 14px;font-size:14px;min-height:64px">${ped.observacoes ? escapeHtml(ped.observacoes) : ''}</div></div>
        <div class="os-assinaturas">
            <div class="os-assinatura-item"><div class="os-section-title">Costureira</div>${buildAssinaturaHTML(ped.id,'costureira',200,70)}<small>Nome / Assinatura / Data conclusão</small></div>
            <div class="os-assinatura-item"><div class="os-section-title">Instalador</div>${buildAssinaturaHTML(ped.id,'instalador',200,70)}<small>Nome / Assinatura / Data instalação</small></div>
            <div class="os-assinatura-item"><div class="os-section-title">Conferência (Gerência)</div>${buildAssinaturaHTML(ped.id,'conferencia',200,70)}<small>Nome / Visto / Data</small></div>
        </div>`;
}

function renderOS() {
    const container = document.getElementById('os-container');
    if (!container) return;
    const pedidoId = localStorage.getItem('sc_os_id');
    _docModalAtual = { tipo: 'os', pedidoId };
    container.innerHTML = gerarHTMLOS(pedidoId);
    iniciarAssinaturaPads(container);
}

// --- CONDIÇÕES GERAIS DA PROPOSTA ---
const _COND_GERAIS_DEFAULT = `Proposta válida por {diasValidade} dias a partir da data de emissão.
O prazo de produção inicia após a confirmação formal e o recebimento do sinal combinado.
As medidas estão sujeitas a conferência técnica in loco antes do corte definitivo do tecido.
Alterações no projeto após a aprovação podem gerar custos adicionais.
Não nos responsabilizamos por variações de tonalidade entre rolos de tecido de lotes distintos não informados previamente.`;

function getCondicoesGerais() {
    return localStorage.getItem('sc_cond_gerais') || _COND_GERAIS_DEFAULT;
}

function salvarCondicoesGerais() {
    const el = document.getElementById('emp-condicoes-gerais');
    if (!el) return;
    localStorage.setItem('sc_cond_gerais', el.value);
    toast('Condições Gerais salvas!', 'success', 1800);
}

function restaurarCondicoesGerais() {
    const el = document.getElementById('emp-condicoes-gerais');
    if (!el) return;
    el.value = _COND_GERAIS_DEFAULT;
    localStorage.removeItem('sc_cond_gerais');
    toast('Condições restauradas para o padrão.', 'info', 1800);
}

function carregarCondicoesGerais() {
    const el = document.getElementById('emp-condicoes-gerais');
    if (el) el.value = getCondicoesGerais();
}

// --- PROPOSTA PDF ---
function gerarHTMLProposta(pedidoId, diasValidade) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped) return '<p style="text-align:center;color:#999;padding:40px;">Pedido não encontrado.</p>';
    diasValidade = diasValidade || 15;
    const ambientes    = normalizarAmbientes(ped);
    const cliente      = db.clientes.find(c => c.id == ped.clienteId);
    const hoje           = new Date().toLocaleDateString('pt-BR');
    const validade       = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
    const totalConsumo = ambientes.reduce((s,a)=>s+(a.tecidos||[]).reduce((ts,t)=>ts+(t.consumo_linear||0),0),0);
    const totalMat     = ped.total_material || ambientes.reduce((s,a)=>s+(a.total_material||0),0);
    const totalAcess   = ped.total_acessorios || 0;
    const ambRows = ambientes.map(a => {
        const tecidos = a.tecidos || [];
        const primTec = tecidos[0] || {};
        const descTecidos = tecidos.map(t => {
            const nome = escapeHtml(t.tecidoNome||'');
            return nome ? `${nome}${t.prega ? ' ('+escapeHtml(t.prega)+', '+t.fator+'x)' : ''}` : '';
        }).filter(Boolean).join(' + ') || 'Tecido selecionado';
        const aberturaImg = a.abertura
            ? `<img src="${PASTA_ABERTURAS}Abertura${escapeHtml(a.abertura)}.svg" alt="Abertura ${escapeHtml(a.abertura)}"
                style="height:54px;width:auto;vertical-align:middle;margin-left:10px;border:1px solid #E0E0E0;border-radius:4px;padding:2px;background:#fff"
                title="Tipo de abertura: ${escapeHtml(a.abertura)}">`
            : '';
        return `<tr>
            <td><strong>${escapeHtml(a.amb||'—')}</strong></td>
            <td>
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
                    <div>
                        <strong>Cortina</strong> em ${descTecidos}${a.fixacao?' — '+escapeHtml(a.fixacao):''}${a.abertura?' | Abertura '+escapeHtml(a.abertura):''}${a.local_instalacao?' | '+escapeHtml(a.local_instalacao):''}
                        <br><small>Parede: ${a.largura}m × ${a.altura||'—'}m | ${(primTec.num_panos||'—')} pano(s) de ${primTec.alt_corte?primTec.alt_corte.toFixed(3):'—'}m${tecidos.length>1?' | '+tecidos.length+' tecidos':''}</small>
                    </div>
                    ${aberturaImg}
                </div>
            </td>
        </tr>`;
    }).join('');
    const acessRows = ped.itens && ped.itens.length ? ped.itens.map(i =>
        `<tr><td><em>Acessório</em></td><td>${escapeHtml(i.nome)} — ${i.quantidade} ${escapeHtml(i.unidade)}</td></tr>`
    ).join('') : '';
    return `
        <div class="proposta-header">
            <div class="proposta-logo">${buildEmpresaHeaderHTML(64)}</div>
            <div class="proposta-info"><h2>PROPOSTA COMERCIAL</h2><p>Nº <strong>${formatPedidoId(ped.id)}</strong></p><p>Data de emissão: ${hoje}</p><p>Válida até: ${validade}</p></div>
        </div>
        <div class="proposta-cliente">
            <h3>Cliente</h3>
            <p><strong>${escapeHtml(cliente?cliente.nome:'Não vinculado')}</strong></p>
            ${cliente&&cliente.cpf   ? `<p>CPF: ${escapeHtml(cliente.cpf)}</p>`     : ''}
            ${cliente&&cliente.tel   ? `<p>Tel: ${escapeHtml(cliente.tel)}</p>`     : ''}
            ${cliente&&cliente.email ? `<p>${escapeHtml(cliente.email)}</p>`        : ''}
            ${cliente&&cliente.end   ? `<p>${escapeHtml(cliente.end)}</p>`          : ''}
        </div>
        <table class="proposta-tabela">
            <thead><tr><th style="width:15%">Ambiente</th><th>Descrição</th></tr></thead>
            <tbody>${ambRows}${acessRows}</tbody>
        </table>
        ${ped.observacoes ? `<div style="margin:16px 0;padding:12px 16px;background:#FAFAFA;border-left:3px solid #005D3B;border-radius:0 6px 6px 0">
            <div style="font-size:11px;font-weight:700;color:#8F8F8F;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Observações</div>
            <p style="font-size:13px;color:var(--dark);margin:0;white-space:pre-line">${escapeHtml(ped.observacoes)}</p>
        </div>` : ''}
        <div class="proposta-totais">
            ${ped.desconto_pct > 0 ? `<div class="proposta-linha" style="color:#F43927"><span>Desconto (${ped.desconto_pct}%)</span><span>− R$ ${(ped.desconto_valor||0).toFixed(2)}</span></div>` : ''}
            <div class="proposta-linha proposta-total"><span>VALOR TOTAL</span><span>R$ ${ped.valor.toFixed(2)}</span></div>
            ${ped.data_entrega ? `<div class="proposta-linha" style="margin-top:10px;padding-top:10px;border-top:1px solid #eee;font-weight:600"><span>Previsão de Entrega</span><span>${new Date(ped.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
        </div>
        <div class="proposta-termos">
            <h4>Condições Gerais</h4>
            <ul>${getCondicoesGerais()
                .replace(/\{diasValidade\}/g, diasValidade)
                .split('\n')
                .filter(l => l.trim())
                .map(l => `<li>${escapeHtml(l.trim())}</li>`)
                .join('')}
            </ul>
        </div>
        <div class="proposta-aprovacao">
            <p>Aprovado em: _____ / _____ / _________</p>
            <p style="margin-top:12px">Assinatura do cliente:</p>
            ${buildAssinaturaHTML(ped.id,'cliente',300,100)}
        </div>`;
}

function renderProposta() {
    const container = document.getElementById('proposta-container');
    if (!container) return;
    const pedidoId = localStorage.getItem('sc_proposta_id');
    _docModalAtual = { tipo: 'proposta', pedidoId, dias: 15 };
    container.innerHTML = gerarHTMLProposta(pedidoId, 15);
    iniciarAssinaturaPads(container);
}

// --- BACKUP / EXPORTAR ---
function exportarDados() {
    const dados = {
        versao: '1.0', exportado_em: new Date().toISOString(),
        clientes: db.clientes, catalogo: db.catalogo, pedidos: db.pedidos,
        estoque: db.estoque, materiais: db.materiais, kits: db.kits,
        movimentos: db.movimentos, vendedores: db.vendedores,
        fornecedores: db.fornecedores, pedidos_compra: db.pedidos_compra,
        contas_receber: db.contas_receber, contas_pagar: db.contas_pagar, despesas_fixas: db.despesas_fixas,
        medicoes: db.medicoes
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
    reader.onload = async e => {
        try {
            const dados = JSON.parse(e.target.result);
            if (!dados.clientes || !dados.catalogo || !dados.pedidos) { await showAlert('Arquivo inválido: estrutura não reconhecida.', '⚠️'); return; }
            const dataExp = dados.exportado_em ? new Date(dados.exportado_em).toLocaleDateString('pt-BR') : 'desconhecida';
            if (!await showConfirm(`Importar backup de ${dataExp}?\n\nTodos os dados atuais serão substituídos. Esta ação não pode ser desfeita.`, '⚠️', 'Importar', 'Cancelar')) return;
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
            db.contas_receber = dados.contas_receber || [];
            db.contas_pagar   = dados.contas_pagar   || [];
            db.despesas_fixas = dados.despesas_fixas || [];
            db.medicoes       = dados.medicoes       || [];
            syncDB();
            toastReload('Dados importados com sucesso!', 'info');
            window.location.reload();
        } catch { await showAlert('Erro ao ler o arquivo. Certifique-se que é um backup válido do SCTech.', '❌'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// --- RELATÓRIOS ---
let _chartRelFat, _chartRelRec, _chartRelVend;

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
        meses.push({ mes: d.getMonth(), ano: d.getFullYear(), label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }) });
    }
    const fatPorMes = [], recPorMes = [];
    tb.innerHTML = meses.map(m => {
        const pedsMes  = db.pedidos.filter(p => {
            if (normalizarStatus(p.status) !== 'Instalado') return false;
            const d = new Date(p.data_instalado || p.id);
            return d.getMonth() === m.mes && d.getFullYear() === m.ano;
        });
        const total    = pedsMes.reduce((s, p) => s + (p.valor || 0), 0);
        const recebido = pedsMes.reduce((s, p) => s + (p.valor_recebido || 0), 0);
        const ticket   = pedsMes.length ? total / pedsMes.length : 0;
        fatPorMes.push(total); recPorMes.push(recebido);
        return `<tr>
            <td style="text-transform:capitalize">${m.label}</td>
            <td style="text-align:center">${pedsMes.length}</td>
            <td>R$ ${total.toFixed(2)}</td>
            <td>R$ ${recebido.toFixed(2)}</td>
            <td>R$ ${ticket.toFixed(2)}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">Nenhum dado.</td></tr>';

    const ctx = document.getElementById('chart-rel-fat');
    if (ctx && typeof Chart !== 'undefined') {
        if (_chartRelFat) _chartRelFat.destroy();
        _chartRelFat = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: meses.map(m => m.label),
                datasets: [
                    { label: 'Faturamento', data: fatPorMes, backgroundColor: 'rgba(0, 93, 59, 0.85)', borderColor: '#005D3B', borderWidth: 1.5, borderRadius: 6 },
                    { label: 'Recebido',    data: recPorMes, backgroundColor: 'rgba(201, 247, 117, 0.85)', borderColor: '#005D3B', borderWidth: 1.5, borderRadius: 6 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { position: 'top', labels: { font: { size: 12 } } } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
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
            : p._dias > 30 ? '<span style="background:#FEF6D8;color:#8A6A00;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:10px">31–60 dias</span>'
            : '<span style="background:#EDF5FC;color:#1F5A96;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:10px">≤30 dias</span>';
        const cls = COR_STATUS[normalizarStatus(p.status)] || 'st-orcamento';
        return `<tr>
            <td style="font-size:12px">#${formatPedidoId(p.id)}</td>
            <td>${escapeHtml(p._cli)}</td>
            <td>R$ ${(p.valor||0).toFixed(2)}</td>
            <td style="color:#F43927;font-weight:bold">R$ ${p._saldo.toFixed(2)}</td>
            <td><span class="status-tag ${cls}" style="font-size:11px">${normalizarStatus(p.status)}</span></td>
            <td>${faixa}</td>
        </tr>`;
    }).join('');
    const totalPendente = pendentes.reduce((s, p) => s + p._saldo, 0);
    const tfootEl = document.getElementById('tfoot-rel-rec');
    if (tfootEl) tfootEl.innerHTML = `<tr><td colspan="3" style="text-align:right;font-weight:bold;color:#555">Total a receber:</td><td style="font-weight:bold;color:#F43927">R$ ${totalPendente.toFixed(2)}</td><td colspan="2"></td></tr>`;

    // Gráfico aging por faixa
    const agingBuckets = { '≤ 30 dias': 0, '31–60 dias': 0, '61–90 dias': 0, '> 90 dias': 0 };
    pendentes.forEach(p => {
        if      (p._dias <= 30) agingBuckets['≤ 30 dias']  += p._saldo;
        else if (p._dias <= 60) agingBuckets['31–60 dias'] += p._saldo;
        else if (p._dias <= 90) agingBuckets['61–90 dias'] += p._saldo;
        else                    agingBuckets['> 90 dias']  += p._saldo;
    });
    const ctx = document.getElementById('chart-rel-rec');
    if (ctx && typeof Chart !== 'undefined') {
        if (_chartRelRec) _chartRelRec.destroy();
        _chartRelRec = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(agingBuckets),
                datasets: [{ label: 'Saldo a receber (R$)', data: Object.values(agingBuckets),
                    backgroundColor: ['rgba(45,119,193,0.75)','rgba(242,201,36,0.75)','rgba(255,127,8,0.75)','rgba(244,57,39,0.75)'],
                    borderColor:     ['#2D77C1','#F2C924','#FF7F08','#F43927'],
                    borderWidth: 1.5, borderRadius: 5 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { grid: { display: false } }
                }
            }
        });
    }
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
        <td style="color:#005D3B;font-weight:bold">R$ ${d.fat.toFixed(2)}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">Nenhum dado.</td></tr>';

    const ctx = document.getElementById('chart-rel-vend');
    if (ctx && typeof Chart !== 'undefined' && lista.length) {
        if (_chartRelVend) _chartRelVend.destroy();
        const CORES = ['#005D3B','#2D77C1','#F2C924','#9B31C8','#FF575F','#17E8FF'];
        _chartRelVend = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: lista.map(([v]) => v),
                datasets: [
                    { label: 'Faturado (R$)',    data: lista.map(([,d]) => d.fat),   backgroundColor: lista.map((_,i) => CORES[i % CORES.length] + 'cc'), borderColor: lista.map((_,i) => CORES[i % CORES.length]), borderWidth: 1.5, borderRadius: 5 },
                    { label: 'Em carteira (R$)', data: lista.map(([,d]) => d.total - d.fat), backgroundColor: 'rgba(0,0,0,0.06)', borderColor: 'rgba(0,0,0,0.15)', borderWidth: 1.5, borderRadius: 5 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { position: 'top', labels: { font: { size: 12 } } } },
                scales: {
                    x: { stacked: false, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }
}
function mostrarTabRel(tab) {
    if (_curTabRel !== tab) { _prevTabRel = _curTabRel; _curTabRel = tab; }
    document.querySelectorAll('#tab-rel-faturamento,#tab-rel-recebiveis,#tab-rel-vendedores').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('[data-tab]').forEach(btn => { if (['faturamento','recebiveis','vendedores'].includes(btn.dataset.tab)) btn.classList.remove('active'); });
    document.getElementById(`tab-rel-${tab}`)?.classList.add('active');
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    if (tab === 'faturamento') renderRelFaturamento();
    if (tab === 'recebiveis')  renderRelRecebiveis();
    if (tab === 'vendedores')  renderRelVendedores();
    _tabBackBtn('.tab-nav', _prevTabRel, () => mostrarTabRel(_prevTabRel));
}

// --- VENDEDORES / ARQUITETOS ---
// Os dois vivem na mesma lista (db.vendedores) e se distinguem pelo campo
// tipo. Cadastro antigo nao tem tipo: e vendedor. Assim comissao, pagamento,
// relatorio e o campo do pedido funcionam igual para os dois.
const TIPOS_VENDEDOR = {
    vendedor:  { um: 'Vendedor',  varios: 'Vendedores' },
    arquiteto: { um: 'Arquiteto', varios: 'Arquitetos' },
};
let _tipoVend = 'vendedor';
function tipoDoVendedor(v) { return v && v.tipo === 'arquiteto' ? 'arquiteto' : 'vendedor'; }
function vendedoresDoTipo(tipo) { return (db.vendedores || []).filter(v => tipoDoVendedor(v) === tipo); }

// Opcoes dos campos Vendedor e Arquiteto do pedido: cada um so o seu tipo.
function opcoesCadastroPedido(tipo) {
    return vendedoresDoTipo(tipo)
        .map(v => `<option value="${v.id}">${escapeHtml(v.nome)} (${v.comissao_pct || 0}%)</option>`).join('');
}

// Comissao que o cadastro gera sobre um valor (0 quando nao ha cadastro).
function comissaoDoCadastro(id, valor) {
    const v = id ? (db.vendedores || []).find(x => x.id == id) : null;
    const pct = v ? (v.comissao_pct || 0) : 0;
    return { pct, valor: pct > 0 ? Math.round(valor * pct / 100 * 100) / 100 : 0 };
}

function _preencherFiltrosVendedores() {
    ['filtro-vend-pendente', 'filtro-vend-hist'].forEach(fId => {
        const el = document.getElementById(fId);
        if (!el) return;
        const atual = el.value;
        el.innerHTML = `<option value="">Todos os ${TIPOS_VENDEDOR[_tipoVend].varios.toLowerCase()}</option>` +
            vendedoresDoTipo(_tipoVend).map(v => `<option value="${v.id}">${escapeHtml(v.nome)}</option>`).join('');
        el.value = [...el.options].some(o => o.value === atual) ? atual : '';
    });
}

function _rotulosTipoVendedores() {
    const t = TIPOS_VENDEDOR[_tipoVend];
    document.querySelectorAll('.vend-col-nome').forEach(th => { th.textContent = t.um; });
    const tit = document.getElementById('vend-form-titulo');
    if (tit) tit.textContent = (editandoIdVendedor ? 'Editar ' : 'Cadastrar ') + t.um;
    const btn = document.getElementById('vend-btn-salvar');
    if (btn) btn.textContent = editandoIdVendedor ? 'Salvar Alterações' : 'Salvar ' + t.um;
}

function mostrarTipoVendedores(tipo) {
    if (!TIPOS_VENDEDOR[tipo]) tipo = 'vendedor';
    if (_tipoVend !== tipo) cancelarEdicaoVendedor();
    _tipoVend = tipo;
    _vendLembrarNaUrl('tipo', tipo);
    document.querySelectorAll('.vend-tipo-btn').forEach(b => b.classList.toggle('active', b.dataset.tipo === tipo));
    _preencherFiltrosVendedores();
    _rotulosTipoVendedores();
    mostrarTabVendedores(_curTabVend || 'lista');
}

async function salvarVendedor() {
    const t = TIPOS_VENDEDOR[_tipoVend];
    const nome = document.getElementById('vend-nome')?.value.trim();
    if (!nome) { await showAlert(`Informe o nome do ${t.um.toLowerCase()}.`, '⚠️'); return; }
    const comissao_pct = parseFloat(document.getElementById('vend-comissao')?.value) || 0;
    const tel = document.getElementById('vend-tel')?.value.trim() || '';
    const usuario_id = parseInt(document.getElementById('vend-usuario')?.value) || null;
    if (editandoIdVendedor) {
        const idx = db.vendedores.findIndex(v => v.id == editandoIdVendedor);
        if (idx !== -1) db.vendedores[idx] = { ...db.vendedores[idx], nome, comissao_pct, tel, usuario_id };
        cancelarEdicaoVendedor();
        salvarERecarregar(`${t.um} atualizado!`);
    } else {
        // Nome repetido e barrado entre os dois tipos: no pedido eles dividem o
        // mesmo campo, e dois "Studio M" seriam indistinguiveis.
        const dup = db.vendedores.find(v => v.nome.trim().toLowerCase() === nome.toLowerCase());
        if (dup) { await showAlert(`Já existe um cadastro com o nome "${dup.nome}" (${TIPOS_VENDEDOR[tipoDoVendedor(dup)].um.toLowerCase()}).`, '⚠️'); return; }
        db.vendedores.push({ id: Date.now(), tipo: _tipoVend, nome, comissao_pct, tel, usuario_id });
        salvarERecarregar(`${t.um} cadastrado!`);
    }
}

function editarVendedor(id) {
    const v = db.vendedores.find(x => x.id == id);
    if (!v) return;
    editandoIdVendedor = id;
    document.getElementById('vend-nome').value      = v.nome || '';
    document.getElementById('vend-comissao').value  = v.comissao_pct || 0;
    document.getElementById('vend-tel').value       = v.tel || '';
    const selUsu = document.getElementById('vend-usuario');
    if (selUsu) selUsu.value = v.usuario_id ? String(v.usuario_id) : '';
    const tit = document.getElementById('vend-form-titulo');
    const btn = document.getElementById('vend-btn-salvar');
    const cnc = document.getElementById('vend-btn-cancelar');
    if (tit) tit.textContent = 'Editar ' + TIPOS_VENDEDOR[tipoDoVendedor(v)].um;
    if (btn) btn.textContent = 'Salvar Alterações';
    if (cnc) cnc.style.display = 'inline-block';
    document.getElementById('vend-nome').focus();
    document.querySelector('.card')?.scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicaoVendedor() {
    editandoIdVendedor = null;
    ['vend-nome','vend-tel','vend-usuario'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const comEl = document.getElementById('vend-comissao');
    if (comEl) comEl.value = '0';
    const tit = document.getElementById('vend-form-titulo');
    const btn = document.getElementById('vend-btn-salvar');
    const cnc = document.getElementById('vend-btn-cancelar');
    if (tit) tit.textContent = 'Cadastrar ' + TIPOS_VENDEDOR[_tipoVend].um;
    if (btn) btn.textContent = 'Salvar ' + TIPOS_VENDEDOR[_tipoVend].um;
    if (cnc) cnc.style.display = 'none';
}

async function excluirVendedor(id) {
    const v = db.vendedores.find(x => x.id == id);
    if (!v) return;
    const usados = db.pedidos.filter(p => p.vendedor_id == id || p.arq_id == id);
    if (usados.length) { await showAlert(`Não é possível excluir: ${escapeHtml(v.nome)} está associado a ${usados.length} pedido(s).`, '🚫'); return; }
    const um = TIPOS_VENDEDOR[tipoDoVendedor(v)].um;
    if (!await showConfirm(`Excluir o ${um.toLowerCase()} "${v.nome}"?`, '🗑️', 'Excluir', 'Cancelar')) return;
    db.vendedores = db.vendedores.filter(x => x.id != id);
    salvarERecarregar(`${um} excluído.`);
}

// Salvar recarrega a pagina; a aba aberta vai no endereco para voltar a ela.
function _vendLembrarNaUrl(chave, valor) {
    try {
        const u = new URL(window.location.href);
        u.searchParams.set(chave, valor);
        history.replaceState(null, '', u);
    } catch (e) { /* sem history (ex.: file:// restrito): so nao lembra */ }
}

function renderTabelaVendedores() {
    const tb = document.getElementById('tb-vendedores');
    if (!tb) return;
    const c = CAMPOS_COMISSAO[_tipoVend];
    const lista = vendedoresDoTipo(_tipoVend);
    if (!lista.length) {
        tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#999;padding:20px;">Nenhum ${TIPOS_VENDEDOR[_tipoVend].um.toLowerCase()} cadastrado.</td></tr>`;
        return;
    }
    tb.innerHTML = lista.map(v => {
        const pedidos        = db.pedidos.filter(p => p[c.id] == v.id);
        const totalComissoes = pedidos.reduce((s, p) => s + (p[c.valor] || 0), 0);
        const comissoesPagas = pedidos.filter(p => p[c.paga]).reduce((s, p) => s + (p[c.valor] || 0), 0);
        const pendente       = totalComissoes - comissoesPagas;
        return `<tr>
            <td><strong>${escapeHtml(v.nome)}</strong></td>
            <td style="text-align:center">${v.comissao_pct || 0}%</td>
            <td>${escapeHtml(v.tel || '—')}</td>
            <td style="text-align:center">${pedidos.length}</td>
            <td>
                ${pendente > 0.01 ? `<span class="badge-comissao-pendente">R$ ${pendente.toFixed(2)} pendente</span>` : '<span class="badge-comissao-paga">Em dia</span>'}
                <button class="btn btn-outline btn-sm" onclick="editarVendedor(${v.id})" style="margin-left:6px" title="Editar">✏️</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirVendedor(${v.id})" title="Excluir">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

// Pendente = pedido instalado, com comissao do papel da aba ainda nao paga.
// "Pagar todas" usa a mesma regra, para nunca pagar o que a tela nao mostra.
// Um pedido com vendedor e arquiteto aparece nas duas abas, cada um com a sua.
function _comissoesPendentesDoTipo(filtroVend) {
    const c = CAMPOS_COMISSAO[_tipoVend];
    let pedidos = db.pedidos.filter(p => p[c.id] && (p[c.valor] || 0) > 0 && !p[c.paga] &&
        normalizarStatus(p.status) === 'Instalado');
    if (filtroVend) pedidos = pedidos.filter(p => p[c.id] == filtroVend);
    return pedidos;
}

function renderComissoesPendentes() {
    const tb = document.getElementById('tb-comissoes-pendentes');
    if (!tb) return;
    const c = CAMPOS_COMISSAO[_tipoVend];
    const filtroVend = document.getElementById('filtro-vend-pendente')?.value || '';
    const pedidos = _comissoesPendentesDoTipo(filtroVend);
    pedidos.sort((a, b) => (b.data_instalado || b.id) - (a.data_instalado || a.id));
    const totalEl = document.getElementById('total-comissoes-pendentes');
    if (!pedidos.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Nenhuma comissão pendente.</td></tr>';
        if (totalEl) totalEl.textContent = 'R$ 0,00';
        return;
    }
    tb.innerHTML = pedidos.map(p => {
        const v = db.vendedores.find(x => x.id == p[c.id]);
        return `<tr>
            <td style="font-size:12px">#${formatPedidoId(p.id)}</td>
            <td>${escapeHtml(p.clienteNome || '—')}</td>
            <td>${escapeHtml(v?.nome || p[c.nome] || '—')}</td>
            <td>R$ ${(p.valor || 0).toFixed(2)}</td>
            <td><strong>R$ ${(p[c.valor] || 0).toFixed(2)}</strong> <span style="color:#888;font-size:12px">(${p[c.pct] || 0}%)</span></td>
            <td><button class="btn btn-sm btn-success" onclick="pagarComissao(${p.id})">✓ Pagar</button></td>
        </tr>`;
    }).join('');
    const total = pedidos.reduce((s, p) => s + (p[c.valor] || 0), 0);
    if (totalEl) totalEl.textContent = `R$ ${total.toFixed(2)}`;
}

function renderHistoricoComissoes() {
    const tb = document.getElementById('tb-hist-comissoes');
    if (!tb) return;
    const c = CAMPOS_COMISSAO[_tipoVend];
    const filtroVend = document.getElementById('filtro-vend-hist')?.value || '';
    let pedidos = db.pedidos.filter(p => p[c.id] && (p[c.valor] || 0) > 0 && p[c.paga]);
    if (filtroVend) pedidos = pedidos.filter(p => p[c.id] == filtroVend);
    pedidos.sort((a, b) => (b[c.data] || 0) - (a[c.data] || 0));
    if (!pedidos.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">Nenhum pagamento registrado.</td></tr>';
        return;
    }
    tb.innerHTML = pedidos.map(p => {
        const v        = db.vendedores.find(x => x.id == p[c.id]);
        const dataPgto = p[c.data] ? new Date(p[c.data]).toLocaleDateString('pt-BR') : '—';
        return `<tr>
            <td style="font-size:12px;white-space:nowrap">${dataPgto}</td>
            <td style="font-size:12px">#${formatPedidoId(p.id)}</td>
            <td>${escapeHtml(p.clienteNome || '—')}</td>
            <td>${escapeHtml(v?.nome || p[c.nome] || '—')}</td>
            <td>R$ ${(p.valor || 0).toFixed(2)}</td>
            <td><span class="badge-comissao-paga">R$ ${(p[c.valor] || 0).toFixed(2)} pago</span></td>
        </tr>`;
    }).join('');
}

// Paga a comissao do papel da aba aberta; a do outro papel no mesmo pedido fica.
async function pagarComissao(pedidoId) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped) return;
    const c = CAMPOS_COMISSAO[_tipoVend];
    const v = db.vendedores.find(x => x.id == ped[c.id]);
    if (!await showConfirm(`Registrar pagamento de comissão R$ ${(ped[c.valor] || 0).toFixed(2)} para ${v?.nome || ped[c.nome] || 'o responsável'}?`, '💰', 'Confirmar', 'Cancelar')) return;
    ped[c.paga] = true;
    ped[c.data] = Date.now();
    salvarERecarregar('Comissão paga!');
}

async function pagarTodasFiltradas() {
    const c = CAMPOS_COMISSAO[_tipoVend];
    const filtroVend = document.getElementById('filtro-vend-pendente')?.value || '';
    const pedidos = _comissoesPendentesDoTipo(filtroVend);
    if (!pedidos.length) { await showAlert('Nenhuma comissão pendente para pagar.', 'ℹ️'); return; }
    const total = pedidos.reduce((s, p) => s + (p[c.valor] || 0), 0);
    if (!await showConfirm(`Pagar ${pedidos.length} comissão(ões) no total de R$ ${total.toFixed(2)}?`, '💰', 'Confirmar', 'Cancelar')) return;
    const agora = Date.now();
    pedidos.forEach(p => { p[c.paga] = true; p[c.data] = agora; });
    salvarERecarregar('Comissões pagas!');
}

function mostrarTabVendedores(tab) {
    if (_curTabVend !== tab) { _prevTabVend = _curTabVend; _curTabVend = tab; }
    document.querySelectorAll('#tab-vend-lista,#tab-vend-pendentes,#tab-vend-historico').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.vend-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-vend-' + tab)?.classList.add('active');
    document.querySelector(`.vend-tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    _vendLembrarNaUrl('aba', tab);
    if (tab === 'lista')     renderTabelaVendedores();
    if (tab === 'pendentes') renderComissoesPendentes();
    if (tab === 'historico') renderHistoricoComissoes();
    _tabBackBtn('.vend-sub-nav', _prevTabVend, () => mostrarTabVendedores(_prevTabVend));
}

// --- FORNECEDORES ---
function mascaraCPF(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9)      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/^(\d{3})(\d{0,3})/, '$1.$2');
    el.value = v;
}

function mascaraCNPJ(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 14);
    if (v.length > 12)     v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/,        '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})/,               '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})/,                       '$1.$2');
    el.value = v;
}

// Consulta a mesma base publica usada no cadastro de fornecedor. Devolve o
// par (razao social, estabelecimento) ja decodificado, ou lanca { tipo }.
// Uma implementacao so: a tela de empresa e a de fornecedor consomem esta.
async function consultarCNPJ(digitos) {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${digitos}`);
    if (!res.ok) throw { tipo: res.status === 404 ? 'nao_encontrado' : 'erro_http' };
    const d = await res.json();
    return { razao_social: d.razao_social || '', est: d.estabelecimento || {} };
}

function _cnpjMensagemDeErro(e) {
    return e && e.tipo === 'nao_encontrado'
        ? '<span style="color:#F43927">❌ CNPJ não encontrado na base de dados.</span>'
        : '<span style="color:#F43927">❌ Erro ao consultar. Verifique sua conexão.</span>';
}

async function buscarCNPJ() {
    const cnpjRaw = document.getElementById('forn-cnpj')?.value.replace(/\D/g, '');
    const statusEl = document.getElementById('forn-cnpj-status');
    const btn = document.getElementById('forn-btn-buscar-cnpj');

    if (!cnpjRaw || cnpjRaw.length !== 14) {
        statusEl.innerHTML = '<span style="color:#F43927">⚠️ Informe um CNPJ válido com 14 dígitos.</span>';
        return;
    }
    statusEl.innerHTML = '<span style="color:#8F8F8F">⏳ Consultando...</span>';
    if (btn) btn.disabled = true;

    try {
        const { razao_social, est } = await consultarCNPJ(cnpjRaw);
        const d = { razao_social };

        const set = (id, val) => { if (!val) return; const el = document.getElementById(id); if (el) el.value = val; };

        set('forn-nome',          d.razao_social || '');
        set('forn-nome-fantasia', est.nome_fantasia || '');

        const logr = [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ');
        set('forn-end',    logr);
        set('forn-num',    est.numero || '');
        set('forn-cidade', est.cidade?.nome || '');
        set('forn-estado', est.estado?.sigla || '');

        if (est.ddd1 && est.telefone1) set('forn-tel', `(${est.ddd1}) ${est.telefone1}`);
        set('forn-email', est.email || '');

        const ie = est.inscricoes_estaduais?.[0]?.inscricao_estadual;
        if (ie) set('forn-ie', ie);

        statusEl.innerHTML = '<span style="color:#005D3B">✅ Dados preenchidos!</span>';
        setTimeout(() => { statusEl.innerHTML = ''; }, 4000);
    } catch (e) {
        statusEl.innerHTML = _cnpjMensagemDeErro(e);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ── Empresa: o CNPJ preenche o resto sozinho ────────────────────────────────
// Dispara quando os 14 digitos ficam completos, sem botao. `oninput` dispara a
// cada tecla e tambem quando a mascara reescreve o campo, entao o numero ja
// consultado fica guardado para nao repetir a chamada. Apagar um digito limpa
// essa memoria de proposito: quem apaga esta corrigindo, e a correcao precisa
// poder consultar de novo. Campo ja preenchido a mao nao e' sobrescrito.
let _empCnpjConsultado = '';

async function empresaCnpjMudou(el) {
    mascaraCNPJ(el);
    const digitos = el.value.replace(/\D/g, '');
    const statusEl = document.getElementById('emp-cnpj-status');
    if (digitos.length !== 14) {
        _empCnpjConsultado = '';
        if (statusEl) statusEl.innerHTML = '';
        return;
    }
    if (digitos === _empCnpjConsultado) return;
    _empCnpjConsultado = digitos;

    if (statusEl) statusEl.innerHTML = '<span style="color:#8F8F8F">⏳ Consultando...</span>';
    try {
        const { razao_social, est } = await consultarCNPJ(digitos);
        // So preenche o que estiver vazio: o que voce digitou manda.
        const set = (id, val) => {
            if (!val) return;
            const campo = document.getElementById(id);
            if (campo && !campo.value.trim()) campo.value = val;
        };
        set('emp-razao', razao_social);
        set('emp-fantasia', est.nome_fantasia || '');
        set('emp-end', _empEnderecoCompleto(est));
        if (est.ddd1 && est.telefone1) set('emp-tel', `(${est.ddd1}) ${est.telefone1}`);
        set('emp-email', est.email || '');
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:#005D3B">✅ Dados preenchidos!</span>';
            setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 4000);
        }
    } catch (e) {
        _empCnpjConsultado = '';   // deixa tentar de novo
        if (statusEl) statusEl.innerHTML = _cnpjMensagemDeErro(e);
    }
}

// O formulario da empresa tem um campo unico de endereco; a API devolve em
// partes, entao elas sao juntadas aqui no formato que a tela mostra.
function _empEnderecoCompleto(est) {
    const logr = [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ');
    const ruaNum = [logr, est.numero].filter(Boolean).join(', ');
    const cidadeUf = [est.cidade?.nome, est.estado?.sigla].filter(Boolean).join(' — ');
    return [ruaNum, est.bairro, cidadeUf, est.cep].filter(Boolean).join(', ');
}

async function salvarFornecedor() {
    const cnpj = document.getElementById('forn-cnpj')?.value.trim() || '';
    const nome = document.getElementById('forn-nome')?.value.trim() || '';
    if (!cnpj) { await showAlert('Informe o CNPJ do fornecedor.', '⚠️'); return; }
    if (!nome) { await showAlert('Informe a Razão Social do fornecedor.', '⚠️'); return; }

    const cnpjNorm = cnpj.replace(/\D/g, '');
    const dupCnpj  = db.fornecedores.find(f => f.cnpj && f.cnpj.replace(/\D/g,'') === cnpjNorm && f.id != editandoIdFornecedor);
    if (dupCnpj) { await showAlert(`CNPJ já cadastrado.\nFornecedor: ${dupCnpj.nome}`, '⚠️'); return; }

    const dados = {
        nome,
        cnpj,
        nome_fantasia: document.getElementById('forn-nome-fantasia')?.value.trim() || '',
        end:    document.getElementById('forn-end')?.value.trim()    || '',
        num:    document.getElementById('forn-num')?.value.trim()    || '',
        cidade: document.getElementById('forn-cidade')?.value.trim() || '',
        estado: document.getElementById('forn-estado')?.value.trim().toUpperCase() || '',
        tel:    document.getElementById('forn-tel')?.value.trim()    || '',
        email:  document.getElementById('forn-email')?.value.trim()  || '',
        ie:     document.getElementById('forn-ie')?.value.trim()     || '',
        obs:    document.getElementById('forn-obs')?.value.trim()    || '',
    };

    if (editandoIdFornecedor) {
        const idx = db.fornecedores.findIndex(f => f.id == editandoIdFornecedor);
        if (idx !== -1) db.fornecedores[idx] = { ...db.fornecedores[idx], ...dados };
        cancelarEdicaoFornecedor();
        salvarERecarregar('Fornecedor atualizado!');
    } else {
        db.fornecedores.push({ id: Date.now(), ...dados });
        salvarERecarregar('Fornecedor cadastrado!');
    }
}

function editarFornecedor(id) {
    const f = db.fornecedores.find(x => x.id == id);
    if (!f) return;
    editandoIdFornecedor = id;
    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
    set('forn-cnpj',         f.cnpj);
    set('forn-nome',         f.nome);
    set('forn-nome-fantasia', f.nome_fantasia);
    set('forn-end',          f.end);
    set('forn-num',          f.num);
    set('forn-cidade',       f.cidade);
    set('forn-estado',       f.estado);
    set('forn-tel',          f.tel);
    set('forn-email',        f.email);
    set('forn-ie',           f.ie);
    set('forn-obs',          f.obs);
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
    ['forn-cnpj','forn-nome','forn-nome-fantasia','forn-end','forn-num',
     'forn-cidade','forn-estado','forn-tel','forn-email','forn-ie','forn-obs',
     'forn-cnpj-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.tagName === 'SPAN' ? el.innerHTML = '' : el.value = ''; }
    });
    const tit = document.getElementById('forn-form-titulo');
    const btn = document.getElementById('forn-btn-salvar');
    const cnc = document.getElementById('forn-btn-cancelar');
    if (tit) tit.textContent = 'Cadastrar Fornecedor';
    if (btn) btn.textContent = 'Salvar Fornecedor';
    if (cnc) cnc.style.display = 'none';
}

async function excluirFornecedor(id) {
    const f = db.fornecedores.find(x => x.id == id);
    if (!f) return;
    const matUsando = db.materiais.filter(m => m.fornecedor_id == id);
    const catUsando = db.catalogo.filter(c => c.fornecedor_id == id);
    if (matUsando.length || catUsando.length) {
        await showAlert(`Não é possível excluir: ${escapeHtml(f.nome)} está vinculado a ${matUsando.length} material(is) e ${catUsando.length} tecido(s).`, '🚫');
        return;
    }
    if (!await showConfirm(`Excluir o fornecedor "${f.nome}"?`, '🗑️', 'Excluir', 'Cancelar')) return;
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
        const cidadeUF = [f.cidade, f.estado].filter(Boolean).join(' / ') || '—';
        const nomeFantasia = f.nome_fantasia ? `<br><small style="color:#888;font-size:12px">${escapeHtml(f.nome_fantasia)}</small>` : '';
        return `<tr>
            <td><strong>${escapeHtml(f.nome)}</strong>${nomeFantasia}</td>
            <td style="font-size:13px">${escapeHtml(f.cnpj || '—')}</td>
            <td style="font-size:13px">${escapeHtml(cidadeUF)}</td>
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
function ultimoPrecoTecido(tecidoId) {
    const c = db.catalogo.find(x => x.id == tecidoId);
    return c?.preco_custo || 0;
}

// Opções do select de fornecedor do pedido de compra. A última, de valor 0,
// é o pedido genérico — sem fornecedor, para mandar a vários como orçamento.
function _pcOpcoesFornecedorHTML(lista) {
    return '<option value="">— Selecione o fornecedor —</option>' +
        lista.map(f => `<option value="${f.id}">${escapeHtml(f.nome)}${f.cnpj ? ' · ' + f.cnpj : ''}</option>`).join('') +
        '<option value="0">— Sem fornecedor (orçamento para vários) —</option>';
}

function filtrarFornecedorPorCNPJ(val) {
    const busca = val.replace(/\D/g, '');
    const sel = document.getElementById('pc-fornecedor');
    if (!sel) return;
    const filtrados = busca
        ? db.fornecedores.filter(f => (f.cnpj || '').replace(/\D/g, '').includes(busca))
        : db.fornecedores;
    sel.innerHTML = _pcOpcoesFornecedorHTML(filtrados);
    if (busca && filtrados.length === 1) sel.value = filtrados[0].id;
}

async function adicionarItemPC() {
    const tipo   = document.getElementById('pc-item-tipo')?.value || 'material';
    const itemId = parseInt(document.getElementById('pc-item-id')?.value);
    const qtd    = parseFloat(document.getElementById('pc-item-qtd')?.value) || 1;
    if (!itemId) { await showAlert('Selecione o item.', '⚠️'); return; }
    if (qtd <= 0) { await showAlert('Informe uma quantidade válida.', '⚠️'); return; }
    let item_nome, unidade, preco_unit;
    let referencia = '';
    if (tipo === 'material') {
        const m = db.materiais.find(x => x.id === itemId);
        if (!m) return;
        item_nome = m.nome; unidade = m.unidade; preco_unit = m.preco_custo || 0; referencia = m.referencia || '';
    } else if (tipo === 'kit') {
        const k = _pcKitsCompraveis().find(x => x.id === itemId);
        if (!k) return;
        item_nome = k.nome; unidade = 'un'; preco_unit = k.preco_custo || 0; referencia = k.referencia || '';
    } else {
        const c = db.catalogo.find(x => x.id === itemId);
        if (!c) return;
        unidade    = document.getElementById('pc-item-unidade')?.value || 'm';
        item_nome  = c.nome;
        preco_unit = ultimoPrecoTecido(itemId);
        referencia = c.referencia || '';
    }
    const chave = `${tipo}|${itemId}|${unidade}`;
    const existing = pcDraftItens.find(i => `${i.tipo}|${i.item_id}|${i.unidade}` === chave);
    if (existing) { existing.quantidade += qtd; existing.subtotal = existing.quantidade * existing.preco_unit; }
    else { pcDraftItens.push({ tipo, item_id: itemId, item_nome, referencia, unidade, quantidade: qtd, preco_unit, subtotal: qtd * preco_unit }); }
    renderItensPCDraft();
}

// Escolher o item preenche o codigo dele; o campo de codigo continua achando
// o item. Os dois sentidos: antes, escolher um item APAGAVA o codigo.
function preencherCodigoItemPC() {
    const tipo = document.getElementById('pc-item-tipo')?.value || 'material';
    const sel  = document.getElementById('pc-item-id');
    const codigoEl = document.getElementById('pc-item-codigo');
    if (!sel || !codigoEl) return;
    sel.style.borderColor = '';
    const id = parseInt(sel.value);
    const item = id ? _pcListaDoTipo(tipo).find(x => x.id === id) : null;
    codigoEl.value = item ? (item.referencia || '') : '';
}

// Escolher o fornecedor preenche o CNPJ dele; o campo de CNPJ continua
// filtrando a lista. Antes, escolher um fornecedor APAGAVA o CNPJ.
function preencherCNPJFornecedorPC() {
    const sel = document.getElementById('pc-fornecedor');
    const cnpjEl = document.getElementById('pc-busca-cnpj');
    if (!sel || !cnpjEl) return;
    const id = parseInt(sel.value);
    const forn = id ? db.fornecedores.find(f => f.id === id) : null;
    cnpjEl.value = forn ? (forn.cnpj || '') : '';
}

const _PC_ROTULO_TIPO = { tecido: 'Tecido', kit: 'Kit', material: 'Material' };
function _pcRotuloTipo(tipo) { return _PC_ROTULO_TIPO[tipo] || 'Material'; }

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
    tb.innerHTML = pcDraftItens.map((i, idx) => {
        const precoLabel = i.preco_unit > 0
            ? `R$ ${i.preco_unit.toFixed(2)}/${i.tipo === 'tecido' ? 'm' : i.unidade}`
            : `<span style="color:#8F8F8F;font-size:12px">sem registro</span>`;
        return `<tr>
            <td>${escapeHtml(i.item_nome)} <span style="font-size:11px;color:#888">(${_pcRotuloTipo(i.tipo)})</span></td>
            <td><input type="number" value="${i.quantidade}" step="0.01" min="0.01" style="width:80px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:13px" onchange="atualizarQtdPC(${idx},this.value)"></td>
            <td>${i.unidade}</td>
            <td>${precoLabel}</td>
            <td><button class="btn btn-outline btn-sm btn-danger" onclick="removerItemPC(${idx})">✕</button></td>
        </tr>`;
    }).join('') + `<tr style="background:#FAFAFA"><td colspan="3" style="text-align:right;font-weight:bold;color:#555;padding:10px 12px">Total estimado:</td><td style="font-weight:bold;padding:10px 12px">${total > 0 ? 'R$ ' + total.toFixed(2) : '<span style="color:#8F8F8F;font-size:12px">—</span>'}</td><td></td></tr>`;
}

// So kit PRONTO entra num pedido de compra: o kit de montagem e' feito aqui
// dentro, a partir dos materiais, e nao e' comprado do fornecedor.
function _pcKitsCompraveis() {
    return db.kits.filter(ehKitPronto);
}

function atualizarSelectItemPC() {
    const tipo = document.getElementById('pc-item-tipo')?.value || 'material';
    const sel  = document.getElementById('pc-item-id');
    const unidadeGroup = document.getElementById('pc-unidade-group');
    const codigoEl = document.getElementById('pc-item-codigo');
    if (!sel) return;
    if (codigoEl) codigoEl.value = '';
    sel.style.borderColor = '';
    if (tipo === 'material') {
        sel.innerHTML = '<option value="">— Selecione o material —</option>' +
            db.materiais.map(m => `<option value="${m.id}">${escapeHtml(m.nome)} (${m.unidade})</option>`).join('');
        if (unidadeGroup) unidadeGroup.style.display = 'none';
    } else if (tipo === 'kit') {
        const kits = _pcKitsCompraveis();
        sel.innerHTML = kits.length
            ? '<option value="">— Selecione o kit —</option>' +
              kits.map(k => `<option value="${k.id}">${escapeHtml(k.nome)}${k.medida ? ' — ' + escapeHtml(k.medida) : ''}</option>`).join('')
            : '<option value="">— Nenhum kit pronto cadastrado —</option>';
        if (unidadeGroup) unidadeGroup.style.display = 'none';
    } else {
        sel.innerHTML = '<option value="">— Selecione o tecido —</option>' +
            db.catalogo.map(c => {
                const ult = ultimoPrecoTecido(c.id);
                const precoRef = ult > 0 ? ` — últ. custo R$ ${ult.toFixed(2)}/m` : '';
                return `<option value="${c.id}">${escapeHtml(c.nome)}${precoRef}</option>`;
            }).join('');
        if (unidadeGroup) unidadeGroup.style.display = '';
    }
}

// A lista de onde cada tipo de item sai. Uma fonte so, para o seletor, a busca
// por codigo e o preenchimento do codigo nao divergirem.
function _pcListaDoTipo(tipo) {
    if (tipo === 'material') return db.materiais;
    if (tipo === 'kit') return _pcKitsCompraveis();
    return db.catalogo;
}

function buscarItemPorCodigoPC(val) {
    const codigo = val.trim().toLowerCase();
    const tipo = document.getElementById('pc-item-tipo')?.value || 'material';
    const sel  = document.getElementById('pc-item-id');
    if (!sel) return;
    if (!codigo) { sel.style.borderColor = ''; return; }
    const encontrado = _pcListaDoTipo(tipo).find(x => (x.referencia || '').toLowerCase() === codigo);
    if (encontrado) {
        sel.value = encontrado.id;
        sel.style.borderColor = '#159912';
        sel.style.transition = 'border-color .3s';
        setTimeout(() => { sel.style.borderColor = ''; sel.style.transition = ''; }, 2000);
    } else {
        sel.value = '';
        sel.style.borderColor = '#F43927';
    }
}

const PC_SEM_FORNECEDOR = 'Orçamento — sem fornecedor definido';

async function salvarPedidoCompra() {
    // "" = nada escolhido; "0" = pedido genérico, de propósito sem fornecedor.
    const bruto = document.getElementById('pc-fornecedor')?.value ?? '';
    if (bruto === '') { await showAlert('Selecione o fornecedor — ou escolha “Sem fornecedor” para um orçamento.', '⚠️'); return; }
    if (!pcDraftItens.length) { await showAlert('Adicione pelo menos um item ao pedido.', '⚠️'); return; }
    const fornId = parseInt(bruto, 10) || 0;
    const forn = db.fornecedores.find(f => f.id === fornId);
    // fornecedor_id/nome do item so servem para agrupar no catalogo.
    const itens = pcDraftItens.map(({ fornecedor_id, fornecedor_nome, ...i }) => i);
    const dados = {
        fornecedor_id:   fornId,
        fornecedor_nome: forn ? forn.nome : (fornId ? '' : PC_SEM_FORNECEDOR),
        itens,
        observacoes:     document.getElementById('pc-obs')?.value.trim() || ''
    };

    if (editandoPCId !== null) {
        const alvo = db.pedidos_compra.find(p => p.id === editandoPCId);
        if (!alvo) { await showAlert('O pedido que você estava editando não existe mais.', '⚠️'); cancelarEdicaoPC(); return; }
        // Numero, data e status sao do pedido, nao do formulario: editar o
        // conteudo nao pode renumerar nem reabrir um pedido ja enviado.
        Object.assign(alvo, dados);
        editandoPCId = null;
        pcDraftItens = [];
        irParaPedidosCompra(`Pedido de compra #${formatPedidoId(alvo.id)} atualizado!`);
        return;
    }

    db.pedidos_compra.push(Object.assign({
        id:           gerarNumeroPedidoCompra(),
        data_criacao: Date.now(),
        status:       'Rascunho'
    }, dados));
    pcDraftItens = [];

    const fila = lerFilaPC();
    if (fila) {
        fila.restantes.shift();
        fila.feitos++;
        if (fila.restantes.length) {
            localStorage.setItem('sc_pc_fila', JSON.stringify(fila));
            salvarERecarregar(`Pedido ${fila.feitos} de ${fila.total} salvo. Agora: ${fila.restantes[0].fornecedor_nome}.`);
        } else {
            // Acabou a fila: leva para a lista, onde os pedidos estão.
            localStorage.removeItem('sc_pc_fila');
            irParaPedidosCompra(`${fila.total} pedidos de compra criados!`);
        }
        return;
    }
    irParaPedidosCompra('Pedido de compra criado!');
}

// Depois de salvar, leva para a aba "Pedidos de Compra", onde o pedido aparece.
function irParaPedidosCompra(msg) {
    syncDB();
    toastReload(msg);
    window.location.href = 'fornecedores.html?tab=pedidos';
}

// Desiste dos pedidos que ainda faltam na fila.
async function cancelarFilaPC() {
    const fila = lerFilaPC();
    if (!fila) return;
    if (!await showConfirm(`Cancelar os ${fila.restantes.length} pedido(s) que ainda faltam? Os ${fila.feitos} já salvos continuam.`, '⚠️', 'Cancelar os restantes', 'Voltar')) return;
    localStorage.removeItem('sc_pc_fila');
    pcDraftItens = [];
    salvarERecarregar('Fila de pedidos cancelada.');
}

// Faixa no topo do formulário indicando em que ponto da fila estamos.
function renderBannerFilaPC() {
    const el = document.getElementById('pc-fila-banner');
    if (!el) return;
    const fila = lerFilaPC();
    if (!fila) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = '';
    el.innerHTML = `<span>🛒 <strong>Pedido ${fila.feitos + 1} de ${fila.total}</strong> — ${escapeHtml(fila.restantes[0].fornecedor_nome)} (${fila.restantes[0].itens.length} item(ns)). Salve para ir ao próximo.</span>
        <button class="btn btn-outline btn-sm" onclick="cancelarFilaPC()">Cancelar os restantes</button>`;
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
            <td style="font-size:12px"><button class="pc-num-btn" onclick="editarPedidoCompra(${p.id})" title="Abrir para editar ou acrescentar itens">#${formatPedidoId(p.id)}</button></td>
            <td><strong>${escapeHtml(p.fornecedor_nome)}</strong></td>
            <td style="font-size:12px;color:#8F8F8F;white-space:nowrap">${data}</td>
            <td style="text-align:center">${p.itens.length}</td>
            <td>R$ ${total.toFixed(2)}</td>
            <td><span class="status-tag ${cls}">${p.status}</span></td>
            <td>
                <select onchange="atualizarStatusPC(${p.id},this.value)" style="padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;margin-right:4px">
                    <option${p.status==='Rascunho'?' selected':''}>Rascunho</option>
                    <option${p.status==='Enviado'?' selected':''}>Enviado</option>
                    <option${p.status==='Recebido'?' selected':''}>Recebido</option>
                </select>
                <button class="btn btn-outline btn-sm" onclick="abrirPedidoCompra(${p.id})" title="Baixar PDF">📄 PDF</button>
                <button class="btn btn-outline btn-sm btn-danger" onclick="excluirPedidoCompra(${p.id})">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function compartilharPC(id) {
    const pc   = db.pedidos_compra.find(p => p.id == id);
    if (!pc) return;
    const forn  = db.fornecedores.find(f => f.id == pc.fornecedor_id);
    const tel   = (forn?.tel   || '').replace(/\D/g, '');
    const email = forn?.email  || '';
    const num   = formatPedidoId(pc.id);
    const data  = new Date(pc.data_criacao).toLocaleDateString('pt-BR');

    const msgWA  = encodeURIComponent(`Olá! Segue o pedido de compra #${num} em anexo.`);
    const waUrl  = tel ? `https://wa.me/55${tel}?text=${msgWA}` : `https://wa.me/?text=${msgWA}`;
    const corpoEmail =
        `Olá${forn?.nome ? ', ' + forn.nome : ''}!\n\n` +
        `Segue em anexo o pedido de compra #${num}, emitido em ${data}.\n\n` +
        `Itens: ${pc.itens.length}\n` +
        (pc.observacoes ? `Observações: ${pc.observacoes}\n` : '') +
        `\nAtenciosamente.`;
    const mailUrl = `mailto:${email}?subject=${encodeURIComponent('Pedido de compra ' + num)}&body=${encodeURIComponent(corpoEmail)}`;
    const avisoWA   = !tel   ? `<div style="font-size:11px;color:#F2C924;margin-top:4px">⚠ Sem telefone cadastrado</div>` : `<div style="font-size:11px;margin-top:4px">${escapeHtml(forn?.tel || '')}</div>`;
    const avisoMail = !email ? `<div style="font-size:11px;color:#F2C924;margin-top:4px">⚠ Sem e-mail cadastrado</div>`   : `<div style="font-size:11px;margin-top:4px">${escapeHtml(email)}</div>`;

    _pcShareData = { waUrl, mailUrl, num, avisoWA, avisoMail };
    const extra = `<button class="doc-modal-btn" onclick="mostrarSharePC()" style="background:#25D366">📤 Compartilhar</button>`;
    abrirDocModal(gerarHTMLPedidoCompra(id), 'Pedido de Compra #' + num, extra);
}

function atualizarStatusPC(id, status) {
    const pc = db.pedidos_compra.find(p => p.id == id);
    if (!pc) return;
    pc.status = status;
    syncDB();
    toast('Status atualizado!', 'success', 1500);
    renderListaPedidosCompra();
}

async function excluirPedidoCompra(id) {
    if (!await showConfirm('Excluir este pedido de compra?', '🗑️', 'Excluir', 'Cancelar')) return;
    db.pedidos_compra = db.pedidos_compra.filter(p => p.id != id);
    salvarERecarregar('Pedido excluído.');
}

function abrirPedidoCompra(id) {
    abrirDocModal(gerarHTMLPedidoCompra(id), 'Pedido de Compra');
}

// Clicar no numero do pedido abre ele no formulario, para corrigir os itens ou
// acrescentar outros. Nenhum status de pedido de compra mexe em estoque, entao
// editar um ja enviado nao desfaz movimento nenhum.
function editarPedidoCompra(id) {
    const pc = db.pedidos_compra.find(p => p.id == id);
    if (!pc) return;
    editandoPCId = pc.id;
    pcDraftItens = (pc.itens || []).map(i => ({ ...i }));

    mostrarTabFornecedores('novo');
    const fornSel = document.getElementById('pc-fornecedor');
    if (fornSel) fornSel.value = String(pc.fornecedor_id || 0);
    preencherCNPJFornecedorPC();
    const obsEl = document.getElementById('pc-obs');
    if (obsEl) obsEl.value = pc.observacoes || '';

    renderItensPCDraft();
    _pcPintarModoEdicao(pc);
    document.getElementById('pc-fornecedor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelarEdicaoPC() {
    editandoPCId = null;
    pcDraftItens = [];
    const fornSel = document.getElementById('pc-fornecedor');
    if (fornSel) fornSel.value = '';
    const cnpjEl = document.getElementById('pc-busca-cnpj');
    if (cnpjEl) cnpjEl.value = '';
    const obsEl = document.getElementById('pc-obs');
    if (obsEl) obsEl.value = '';
    renderItensPCDraft();
    _pcPintarModoEdicao(null);
}

// O formulario e' o mesmo para criar e editar: o titulo e o botao dizem em
// qual dos dois voce esta, senao da' para salvar um pedido achando que esta
// criando outro.
function _pcPintarModoEdicao(pc) {
    const titulo = document.getElementById('pc-form-titulo');
    if (titulo) titulo.textContent = pc
        ? `Editando Pedido de Compra #${formatPedidoId(pc.id)}`
        : 'Novo Pedido de Compra';
    const botao = document.getElementById('pc-btn-salvar');
    if (botao) botao.textContent = pc ? '💾 Salvar Alterações' : '💾 Salvar Pedido';
    const cancelar = document.getElementById('pc-btn-cancelar-edicao');
    if (cancelar) cancelar.style.display = pc ? '' : 'none';
}

function criarPCParaFornecedor(fornId) {
    localStorage.setItem('sc_pc_prefill_forn', fornId);
    mostrarTabFornecedores('novo');
    const pcFornSel = document.getElementById('pc-fornecedor');
    if (pcFornSel) pcFornSel.value = fornId;
}

// Com itens marcados no catálogo, qualquer carrinho leva a seleção inteira.
// Sem nada marcado, leva só o item clicado. Nas telas sem seleção (estoque)
// o conjunto está sempre vazio, então o comportamento é o de sempre.
function pedirMaterial(materialId) {
    if (catSelecao.material.size) { pedidoDaSelecao('material'); return; }
    const item = itemParaPedido('material', materialId);
    if (item) iniciarPedidoDeCompra([item]);
}

function pedirTecido(tecidoId) {
    if (catSelecao.tecido.size) { pedidoDaSelecao('tecido'); return; }
    const item = itemParaPedido('tecido', tecidoId);
    if (item) iniciarPedidoDeCompra([item]);
}

function mostrarTabFornecedores(tab) {
    if (_curTabForn !== tab) { _prevTabForn = _curTabForn; _curTabForn = tab; }
    document.querySelectorAll('#tab-forn-lista,#tab-forn-pedidos,#tab-forn-novo').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.forn-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-forn-' + tab)?.classList.add('active');
    document.querySelector(`.forn-tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    if (tab === 'lista')   renderTabelaFornecedores();
    if (tab === 'pedidos') renderListaPedidosCompra();
    if (tab === 'novo')    atualizarSelectItemPC();
    _tabBackBtn('.tab-nav', _prevTabForn, () => mostrarTabFornecedores(_prevTabForn));
}

// --- PEDIDO DE COMPRA (documento imprimível) ---
function gerarHTMLPedidoCompra(id) {
    const pc = db.pedidos_compra.find(p => p.id == id);
    if (!pc) return '<p style="text-align:center;color:#999;padding:40px;">Pedido não encontrado.</p>';
    const forn  = db.fornecedores.find(f => f.id == pc.fornecedor_id);
    const hoje  = new Date().toLocaleDateString('pt-BR');
    const total = pc.itens.reduce((s, i) => s + i.subtotal, 0);
    const linhas = pc.itens.map(i => {
        let ref = i.referencia || '';
        if (!ref && i.item_id) {
            ref = _pcListaDoTipo(i.tipo).find(x => x.id == i.item_id)?.referencia || '';
        }
        return `<tr>
        <td style="font-size:12px;color:#555;white-space:nowrap">${ref ? escapeHtml(ref) : '<span style="color:#ccc">—</span>'}</td>
        <td>${escapeHtml(i.item_nome)}</td>
        <td style="text-align:center">${_pcRotuloTipo(i.tipo)}</td>
        <td style="text-align:right">${i.quantidade}</td>
        <td>${i.unidade}</td>
        <td style="text-align:right">R$ ${i.preco_unit.toFixed(2)}</td>
        <td style="text-align:right"><strong>R$ ${i.subtotal.toFixed(2)}</strong></td>
    </tr>`;
    }).join('');
    return `
        <div class="pc-header">
            ${buildEmpresaHeaderHTML(52)}
            <div style="text-align:right">
                <div style="font-size:20px;font-weight:bold;color:var(--dark)">PEDIDO DE COMPRA</div>
                <div style="font-size:13px;color:#888">Nº ${formatPedidoId(pc.id)} · Emitido em ${hoje}</div>
                <div style="margin-top:4px"><span class="status-tag ${pc.status==='Recebido'?'st-faturado':pc.status==='Enviado'?'st-costura':'st-orcamento'}">${pc.status}</span></div>
            </div>
        </div>
        <div class="pc-section">
            <div class="pc-section-title">Fornecedor</div>
            ${pc.fornecedor_id ? `<table class="pc-table">
                <tr><td class="pc-th">Razão Social / Nome</td><td><strong>${forn ? escapeHtml(forn.nome) : escapeHtml(pc.fornecedor_nome)}</strong></td><td class="pc-th" style="width:100px">CNPJ</td><td>${forn ? escapeHtml(forn.cnpj || '—') : '—'}</td></tr>
                <tr><td class="pc-th">Telefone</td><td>${forn ? escapeHtml(forn.tel || '—') : '—'}</td><td class="pc-th">E-mail</td><td>${forn ? escapeHtml(forn.email || '—') : '—'}</td></tr>
                ${forn?.end ? `<tr><td class="pc-th">Endereço</td><td colspan="3">${escapeHtml(forn.end)}</td></tr>` : ''}
            </table>` : `<table class="pc-table">
                <tr><td class="pc-th">Razão Social / Nome</td><td colspan="3" style="height:26px"></td></tr>
                <tr><td class="pc-th">Telefone</td><td style="height:26px"></td><td class="pc-th" style="width:100px">E-mail</td><td></td></tr>
            </table>
            <div style="font-size:11px;color:#888;margin-top:5px">Solicitação de orçamento — preencher os dados do fornecedor.</div>`}
        </div>
        <div class="pc-section">
            <div class="pc-section-title">Itens Solicitados</div>
            <table class="pc-table">
                <thead><tr><th style="width:100px">Código</th><th>Descrição</th><th style="text-align:center">Tipo</th><th style="text-align:right;width:80px">Qtd</th><th style="width:50px">Un.</th><th style="text-align:right;width:100px">R$/Un.</th><th style="text-align:right;width:110px">Subtotal</th></tr></thead>
                <tbody>${linhas}</tbody>
                <tfoot><tr style="background:#FAFAFA"><td colspan="6" style="text-align:right;font-weight:bold;padding:10px 8px;color:#242424">Total Estimado:</td><td style="text-align:right;font-weight:bold;padding:10px 8px">R$ ${total.toFixed(2)}</td></tr></tfoot>
            </table>
        </div>
        ${pc.observacoes ? `<div class="pc-section"><div class="pc-section-title">Observações</div><div style="padding:10px 14px;border:1px solid #E0E0E0;border-radius:4px;font-size:14px;min-height:50px">${escapeHtml(pc.observacoes)}</div></div>` : ''}
        <div class="pc-assinaturas">
            <div><div class="pc-section-title">Solicitado por</div><div class="pc-linha"></div><small>Nome / Data</small></div>
            <div><div class="pc-section-title">Aprovado por</div><div class="pc-linha"></div><small>Nome / Data</small></div>
            <div><div class="pc-section-title">Recebido por</div><div class="pc-linha"></div><small>Nome / Assinatura / Data</small></div>
        </div>`;
}

function renderPedidoCompraDoc() {
    const container = document.getElementById('pedido-compra-container');
    if (!container) return;
    container.innerHTML = gerarHTMLPedidoCompra(localStorage.getItem('sc_pc_id'));
    setTimeout(() => window.print(), 500);
}

// --- AGENDA DE INSTALAÇÕES ---
// =============================================
// MÓDULO MEDIÇÕES
// =============================================

function toggleTipoClienteMedicao() {
    const tipo = document.querySelector('input[name="med-tipo"]:checked')?.value || 'existente';
    document.getElementById('med-grupo-existente').style.display = tipo === 'existente' ? '' : 'none';
    document.getElementById('med-grupo-novo').style.display      = tipo === 'novo'      ? '' : 'none';
}

function onMedClienteChange() {
    const sel = document.getElementById('med-cliente-id');
    if (!sel || !sel.value) return;
    const cli = db.clientes.find(c => c.id == sel.value);
    if (!cli) return;
    const endEl = document.getElementById('med-end');
    if (endEl && cli.end) endEl.value = cli.end;
}

// Pedido ligado ao agendamento de medicao. O vinculo vale nos dois sentidos
// (medicao.pedido_id e pedido.medicao_id); um pedido excluido desfaz o vinculo.
function _medPedidoVinculado(m) {
    if (!m) return null;
    return (m.pedido_id && db.pedidos.find(p => p.id == m.pedido_id))
        || db.pedidos.find(p => p.medicao_id != null && p.medicao_id == m.id)
        || null;
}

// Abre o fluxo de pedido com o cliente preenchido. Se o agendamento ja tem
// pedido, abre esse pedido para edicao em vez de criar outro.
async function criarPedidoDaMedicao(medicaoId) {
    const m = (db.medicoes || []).find(x => x.id == medicaoId);
    if (!m) return;
    const ped = _medPedidoVinculado(m);
    if (ped) { editarPedido(ped.id); return; }
    if (!await exigirPermissao('pedidos', 'completo')) return;
    localStorage.removeItem('sc_editando_id');
    localStorage.setItem('sc_novo_pedido_pre', JSON.stringify({
        clienteId:   m.clienteId   || null,
        clienteNome: m.clienteNome || '',
        medicaoId:   m.id,
    }));
    window.location.href = 'pedido.html';
}

// Chamado ao salvar um pedido novo vindo de "Criar Pedido": liga os dois e,
// se a visita ainda estava agendada, ela passa para Realizados sozinha.
function _medVincularPedido(m, ped) {
    m.pedido_id = ped.id;
    ped.medicao_id = m.id;
    if (!m.historico) m.historico = [];
    _agdRegistrar(m.historico, 'pedido', { pedido: ped.id });
    if (m.status === 'Agendado') {
        m.status = 'Realizado';
        m.realizado_em  = Date.now();
        m.realizado_por = getUsuarioLogado()?.id || null;
        m.realizado_via = 'pedido';
    }
}

async function salvarMedicao() {
    const tipo = document.querySelector('input[name="med-tipo"]:checked')?.value || 'existente';
    let clienteId = null, clienteNome = '', clienteTel = '';
    let clienteCpf = '', clienteEmail = '';

    if (tipo === 'existente') {
        clienteId = parseInt(document.getElementById('med-cliente-id')?.value) || null;
        if (!clienteId) { await showAlert('Selecione o cliente.', '⚠️'); return; }
        const cli = db.clientes.find(c => c.id == clienteId);
        if (cli) {
            clienteNome = cli.nome;
            clienteTel  = cli.tel || '';
            const endEl = document.getElementById('med-end');
            if (endEl && !endEl.value.trim() && cli.end) endEl.value = cli.end;
        }
    } else {
        clienteNome  = (document.getElementById('med-novo-nome')?.value || '').trim();
        clienteTel   = (document.getElementById('med-novo-tel')?.value || '').trim();
        clienteCpf   = (document.getElementById('med-novo-cpf')?.value || '').trim();
        clienteEmail = (document.getElementById('med-novo-email')?.value || '').trim();
        if (!clienteNome) { await showAlert('Informe o nome do cliente.', '⚠️'); return; }
        if (clienteCpf) {
            const cpfDigitos = clienteCpf.replace(/\D/g, '');
            const duplicado = db.clientes.find(c => c.cpf && c.cpf.replace(/\D/g, '') === cpfDigitos);
            if (duplicado) { await showAlert(`CPF já cadastrado para o cliente "${duplicado.nome}".`, '⚠️'); return; }
        }
    }

    const data = (document.getElementById('med-data')?.value || '').trim();
    const hora = (document.getElementById('med-hora')?.value || '').trim();
    const end  = (document.getElementById('med-end')?.value  || '').trim();
    const obs  = (document.getElementById('med-obs')?.value  || '').trim();
    const dur  = parseInt(document.getElementById('med-dur')?.value) || _agdDurPadrao('med');
    const prof = _agdLerProf('med-prof');
    if (!data) { await showAlert('Informe a data da visita.', '⚠️'); return; }
    if (!end)  { await showAlert('Informe o endereço da visita.', '⚠️'); return; }

    // Com profissional definido a visita ocupa a agenda dele: precisa de
    // horário e é conferida de novo contra instalações e medições já gravadas.
    if (prof.chave && !hora) {
        document.getElementById('med-hora')?.classList.add('agd-erro');
        await showAlert('Informe o horário: ele reserva a agenda do profissional.', '⚠️');
        return;
    }
    document.getElementById('med-hora')?.classList.remove('agd-erro');
    if (!await _agdValidarDisp({ prof: prof.chave, profNome: prof.pessoa.nome, data, hora, dur })) { _medAtualizarDisp(); return; }

    // Só depois de tudo validado o novo cliente é cadastrado.
    if (tipo === 'novo') {
        const novoCli = { id: Date.now(), nome: clienteNome, tel: clienteTel, email: clienteEmail, cpf: clienteCpf, end };
        db.clientes.push(novoCli);
        clienteId = novoCli.id;
        const sel = document.getElementById('med-cliente-id');
        if (sel) sel.innerHTML = '<option value="">— Selecione —</option>' +
            db.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
    }

    const med = { id: Date.now(), clienteId, clienteNome, clienteTel, endereco: end, data, hora, duracao: dur, obs, status: 'Agendado',
        agendado_por: getUsuarioLogado()?.id || null, agendado_em: Date.now() };
    _medDefinirResponsavel(med, prof.pessoa);
    db.medicoes.push(med);

    const nomeEl  = document.getElementById('med-novo-nome');  if (nomeEl)  nomeEl.value  = '';
    const telEl   = document.getElementById('med-novo-tel');   if (telEl)   telEl.value   = '';
    const cpfEl   = document.getElementById('med-novo-cpf');   if (cpfEl)   cpfEl.value   = '';
    const emailEl = document.getElementById('med-novo-email'); if (emailEl) emailEl.value = '';
    document.getElementById('med-data').value = _agdHoje();
    document.getElementById('med-hora').value = '';
    document.getElementById('med-end').value  = '';
    document.getElementById('med-obs').value  = '';
    _agdPreencherProf('med-prof', '', '— A definir —');
    _agdPreencherDur('med-dur', 'med');
    document.querySelectorAll('input[name="med-tipo"]').forEach(r => { r.checked = r.value === 'existente'; });
    toggleTipoClienteMedicao();

    syncDB();
    toast(tipo === 'novo' ? 'Cliente cadastrado e visita agendada!' : 'Visita agendada!', 'success');
    renderMedicoes();
    renderDashboardMedicoes();
    renderAgenda();
}

function imprimirAgendamentoMedicao(id) {
    const v = db.medicoes.find(x => x.id == id);
    if (!v) return;

    const cli = v.clienteId ? db.clientes.find(c => c.id == v.clienteId) : null;
    const d   = new Date(v.data + 'T12:00:00');
    const dataFmt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const horaFmt = v.hora || '—';
    const badgeBg  = v.status === 'Realizado' ? '#E3F7E2' : '#E4EFF9';
    const badgeClr = v.status === 'Realizado' ? '#0F6B0D' : '#1F5A96';

    const row = (label, val) => val
        ? `<tr>
            <td style="padding:8px 12px;font-weight:600;color:#555;width:180px;border-bottom:1px solid #E0E0E0">${label}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #E0E0E0">${val}</td>
           </tr>`
        : '';

    const secTitle = (t) => `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#8F8F8F;margin:20px 0 8px;padding-bottom:4px;border-bottom:1px solid #E0E0E0">${t}</div>`;

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #005D3B;padding-bottom:16px;margin-bottom:24px">
            <div>${buildEmpresaHeaderHTML(52)}</div>
            <div style="text-align:right">
                <div style="font-size:16px;font-weight:700;color:#242424">AGENDAMENTO DE MEDIÇÃO</div>
                <div style="font-size:12px;color:#8F8F8F;margin-top:2px">Emitido em ${new Date().toLocaleString('pt-BR')}</div>
                <span style="display:inline-block;margin-top:6px;padding:3px 12px;border-radius:12px;font-size:12px;font-weight:700;background:${badgeBg};color:${badgeClr}">${escapeHtml(v.status)}</span>
            </div>
        </div>
        ${secTitle('Dados do Cliente')}
        <table style="width:100%;border-collapse:collapse">
            ${row('Nome', escapeHtml(v.clienteNome || '—'))}
            ${row('Telefone / WhatsApp', escapeHtml(v.clienteTel || ''))}
            ${row('E-mail', escapeHtml(cli?.email || ''))}
            ${row('CPF / CNPJ', escapeHtml(cli?.cpf || ''))}
            ${row('Endereço cadastrado', escapeHtml(cli?.end || ''))}
        </table>
        ${secTitle('Dados do Agendamento')}
        <table style="width:100%;border-collapse:collapse">
            ${row('Data da visita', dataFmt)}
            ${row('Horário', v.hora ? _agdPeriodo(v.hora, +v.duracao || _agdDurPadrao('med')) : horaFmt)}
            ${row('Responsável', escapeHtml(_medNomeResp(v)))}
            ${row('Endereço da visita', escapeHtml(v.endereco || ''))}
            ${row('Observações', escapeHtml(v.obs || ''))}
        </table>
        <div style="margin-top:48px;text-align:center">
            <div style="border-top:1px solid #242424;width:260px;margin:0 auto 6px"></div>
            <p style="font-size:12px;color:#8F8F8F">Assinatura do responsável</p>
        </div>
        <div style="margin-top:40px;padding-top:16px;border-top:1px solid #E0E0E0;font-size:12px;color:#8F8F8F;display:flex;justify-content:space-between">
            <span>${escapeHtml(getEmpresa().nome_fantasia || getEmpresa().razao_social || 'SCTech')}</span>
            <span>ID do agendamento: ${v.id}</span>
        </div>`;

    abrirDocModal(html, 'Agendamento de Medição');
}

// --- AGENDAS DA PRODUCAO (Medicoes e Instalacoes) ---------------------------
// As duas abas tem o mesmo desenho: coluna de pendentes (data mais proxima
// primeiro) e coluna de realizados (mais recente primeiro), cada uma com a sua
// busca. A linha so mostra o resumo; as acoes ficam no detalhe, aberto pela
// seta. Toda acao regrava e redesenha as listas, sem recarregar a pagina.
const _AGD_SVG = {
    cal:     '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tel:     '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    pin:     '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    user:    '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    seta:    '<path d="m9 6 6 6-6 6"/>',
    caixa:   '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
};
function _agdIco(nome, tam) {
    const t = tam || 14;
    return `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${_AGD_SVG[nome] || ''}</svg>`;
}

let _agdBusca = { medPend: '', medReal: '', instPend: '', instReal: '' };

// Dia de hoje no fuso do usuario (toISOString daria o dia em UTC, que vira o
// dia seguinte a noite no Brasil).
function _agdHoje() { return new Date().toLocaleDateString('sv-SE'); }
function _agdDiaLocal(ts) { return new Date(ts).toLocaleDateString('sv-SE'); }
function _agdFmtData(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'; }
function _agdFmtMomento(ts) {
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// Chave de ordenacao: sem data vai para o fim; sem horario, para o fim do dia.
function _agdChave(data, hora) { return (data || '9999-12-31') + ' ' + (hora || '99:99'); }
function _agdCmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function _agdNorm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

const _AGD_PILLS = {
    agendado:  ['Agendado',          'agd-pill-azul'],
    atrasado:  ['Atrasado',          'agd-pill-verm'],
    realizado: ['Realizado',         'agd-pill-verde'],
    instalado: ['Instalado',         'agd-pill-verde'],
    pagamento: ['Aguard. pagamento', 'agd-pill-amar'],
    semdata:   ['Sem data',          'agd-pill-cinza'],
};
function _agdPill(tipo) {
    const [txt, cls] = _AGD_PILLS[tipo] || _AGD_PILLS.agendado;
    return `<span class="agd-pill ${cls}">${txt}</span>`;
}

function _agdLinha(o) {
    return `<button type="button" class="agd-item" onclick="${o.onclick}" title="Ver detalhes">
        <span class="agd-avatar">${_agdIco('user', 18)}</span>
        <span class="agd-info">
            <span class="agd-nome">${escapeHtml(o.nome || '—')}</span>
            ${o.sub ? `<span class="agd-linha agd-sub">${escapeHtml(o.sub)}</span>` : ''}
            ${o.tel ? `<span class="agd-linha">${_agdIco('tel', 12)}${escapeHtml(o.tel)}</span>` : ''}
            ${o.end ? `<span class="agd-linha">${_agdIco('pin', 12)}${escapeHtml(o.end)}</span>` : ''}
        </span>
        <span class="agd-quando">
            <span class="agd-quando-linha">
                <span class="agd-linha">${_agdIco('cal', 13)}${o.data ? _agdFmtData(o.data) : 'Sem data'}</span>
                <span class="agd-linha">${_agdIco('relogio', 13)}${escapeHtml(o.hora || '--:--')}</span>
            </span>
            <span class="agd-status">${_agdPill(o.pill)}</span>
        </span>
        <span class="agd-seta">${_agdIco('seta', 16)}</span>
    </button>`;
}

// unidade: [singular, plural] escreve "4 agendamentos"; sem ela, so o numero.
function _agdPreencher(prefixo, linhas, total, vazio, busca, unidade) {
    const lista = document.getElementById(prefixo + '-lista');
    const cont  = document.getElementById(prefixo + '-count');
    const sufixo = unidade ? ' ' + unidade[total === 1 ? 0 : 1] : '';
    if (cont) cont.textContent = (busca ? `${linhas.length} de ${total}` : String(total)) + sufixo;
    if (lista) lista.innerHTML = linhas.length
        ? linhas.join('')
        : `<div class="agd-vazio">${busca ? 'Nenhum resultado para essa busca.' : vazio}</div>`;
}

// A busca so redesenha as listas; o campo digitado nao e recriado e nao perde o foco.
function buscarAgenda(chave, valor) {
    _agdBusca[chave] = valor || '';
    if (chave.startsWith('med')) renderMedicoes(); else renderAgenda();
}

// --- Modal de detalhe/formulario (um por vez) ---
let _agdModalEl = null;
function _agdEsc(e) { if (e.key === 'Escape') fecharModalAgenda(); }
function fecharModalAgenda() {
    if (!_agdModalEl) return;
    _agdModalEl.remove();
    _agdModalEl = null;
    document.removeEventListener('keydown', _agdEsc);
}
function _agdAbrirModal(titulo, corpo, rodape) {
    fecharModalAgenda();
    const o = document.createElement('div');
    o.className = 'agd-modal-overlay';
    o.innerHTML = `<div class="agd-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(titulo)}">
        <div class="agd-modal-head">
            <h3>${escapeHtml(titulo)}</h3>
            <button type="button" class="agd-modal-x" onclick="fecharModalAgenda()" aria-label="Fechar">×</button>
        </div>
        <div class="agd-modal-corpo">${corpo}</div>
        ${rodape ? `<div class="agd-modal-acoes">${rodape}</div>` : ''}
    </div>`;
    o.addEventListener('click', e => { if (e.target === o) fecharModalAgenda(); });
    document.body.appendChild(o);
    _agdModalEl = o;
    document.addEventListener('keydown', _agdEsc);
    return o;
}

// pares: [rotulo, html ja escapado]; null e ignorado.
function _agdCampos(pares) {
    return `<dl class="agd-det">${pares.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

function _agdDescHist(x) {
    const fmt = o => o && o.data ? _agdFmtData(o.data) + (o.hora ? ' ' + o.hora : '') : 'sem data';
    const por = x.por ? ` (${nomeUsuario(x.por) || 'usuário removido'})` : '';
    const quando = _agdFmtMomento(x.em);
    if (x.acao === 'agendado')   return `${quando}: agendado para ${fmt(x.para)}${x.prof ? ' com ' + x.prof : ''}${por}`;
    if (x.acao === 'reagendado') return `${quando}: reagendado de ${fmt(x.de)} para ${fmt(x.para)}${por}`;
    if (x.acao === 'desmarcado') return `${quando}: data desmarcada, era ${fmt(x.de)}${por}`;
    if (x.acao === 'cancelado')  return `${quando}: agendamento cancelado${x.de ? ', era ' + fmt(x.de) : ''}${por}`;
    if (x.acao === 'pedido')     return `${quando}: pedido #${formatPedidoId(x.pedido)} criado a partir deste agendamento${por}`;
    return `${quando}: ${x.acao}${por}`;
}
function _agdHistorico(h) {
    if (!h || !h.length) return '';
    return `<div class="agd-hist"><div class="agd-hist-tit">Histórico</div>${
        h.map(x => `<div>• ${escapeHtml(_agdDescHist(x))}</div>`).join('')}</div>`;
}
function _agdRegistrar(lista, acao, extra) {
    lista.push({ acao, em: Date.now(), por: getUsuarioLogado()?.id || null, ...(extra || {}) });
}

// campos: { id, label, tipo: date|time|text|textarea|usuario|pessoa|profissional|duracao, valor, obrig, largo, placeholder }
// onSalvar(valores) grava; se devolver false, o formulario continua aberto.
// opts.disp = { tipo: 'inst'|'med', ignorar: { tipo, id }, exigeHora }: mostra o
// painel de disponibilidade do profissional (campos usu/data/hora/dur) e,
// ao salvar, confere de novo a agenda gravada antes de chamar onSalvar.
function _agdFormulario(titulo, campos, onSalvar, voltar, opts) {
    const disp = opts && opts.disp;
    const corpo = `<div class="agd-form">${campos.map(c => {
        const id  = 'agdf-' + c.id;
        const req = c.obrig ? ' <span style="color:var(--danger)">*</span>' : '';
        const ph  = c.placeholder ? ` placeholder="${escapeHtml(c.placeholder)}"` : '';
        let input;
        if (c.tipo === 'textarea')          input = `<textarea id="${id}" rows="3"${ph}>${escapeHtml(c.valor || '')}</textarea>`;
        else if (c.tipo === 'usuario')      input = `<select id="${id}"></select>`;
        else if (c.tipo === 'pessoa')       input = htmlCampoPessoa(id, c.valor, 'A definir — selecione ou digite um nome');
        else if (c.tipo === 'profissional') input = `<select id="${id}"></select><input type="text" id="${id}-outro" class="agd-prof-outro" placeholder="Nome do profissional" autocomplete="off" hidden>`;
        else if (c.tipo === 'duracao')      input = `<select id="${id}"></select>`;
        else                                input = `<input type="${c.tipo}" id="${id}" value="${escapeHtml(c.valor || '')}"${ph}>`;
        return `<div class="form-group${c.largo ? ' agd-form-largo' : ''}"><label for="${id}">${escapeHtml(c.label)}${req}</label>${input}</div>`;
    }).join('')}</div>${disp ? '<div class="agd-disp agd-disp-modal" id="agdf-disp" aria-live="polite"></div>' : ''}`;
    const rodape = `<button type="button" class="btn btn-outline btn-sm" id="agdf-voltar">Voltar</button>
        <button type="button" class="btn btn-success btn-sm" id="agdf-salvar">Salvar</button>`;
    const o = _agdAbrirModal(titulo, corpo, rodape);
    campos.filter(c => c.tipo === 'usuario').forEach(c => {
        preencherSelectUsuarios('agdf-' + c.id, '— A definir —');
        const s = document.getElementById('agdf-' + c.id);
        if (s) s.value = c.valor ? String(c.valor) : '';
    });
    campos.filter(c => c.tipo === 'profissional').forEach(c => _agdPreencherProf('agdf-' + c.id, c.valor, c.vazio || '— A definir —'));
    campos.filter(c => c.tipo === 'duracao').forEach(c => _agdPreencherDur('agdf-' + c.id, c.servico || (disp && disp.tipo) || 'inst', c.valor));

    const lerValores = () => {
        const v = {};
        for (const c of campos) {
            const el = document.getElementById('agdf-' + c.id);
            if (c.tipo === 'usuario')           v[c.id] = parseInt(el.value) || null;
            else if (c.tipo === 'profissional') v[c.id] = _agdLerProf('agdf-' + c.id);
            else if (c.tipo === 'duracao')      v[c.id] = parseInt(el.value) || null;
            else                                v[c.id] = el.value.trim();
        }
        return v;
    };
    const consulta = () => {
        const v = lerValores();
        return { tipo: disp.tipo, prof: v.usu ? v.usu.chave : '', profNome: v.usu ? v.usu.pessoa.nome : '', data: v.data, hora: v.hora, dur: v.dur || _agdDurPadrao(disp.tipo), ignorar: disp.ignorar };
    };
    const atualizarDisp = () => {
        if (!disp) return;
        _agdDispCtx['agdf-disp'] = Object.assign(_agdDispCtx['agdf-disp'] || {}, { onHora: (d, h) => {
            const de = document.getElementById('agdf-data'), he = document.getElementById('agdf-hora');
            if (de) de.value = d;
            if (he) { he.value = h; he.classList.remove('agd-erro'); }
            atualizarDisp();
        }, onProf: ch => {
            const sel = document.getElementById('agdf-usu');
            _agdPreencherProf('agdf-usu', ch, sel && sel.options[0] ? sel.options[0].text : '— A definir —');
            atualizarDisp();
        } });
        _agdRenderDisp('agdf-disp', consulta());
    };
    if (disp) {
        const prof = document.getElementById('agdf-usu');
        if (prof) prof.addEventListener('change', () => { _agdProfMudou('agdf-usu'); atualizarDisp(); });
        document.getElementById('agdf-usu-outro')?.addEventListener('input', atualizarDisp);
        ['data', 'dur'].forEach(k => document.getElementById('agdf-' + k)?.addEventListener('change', atualizarDisp));
        document.getElementById('agdf-hora')?.addEventListener('input', atualizarDisp);
        atualizarDisp();
    }

    o.querySelector('#agdf-voltar').onclick = voltar || fecharModalAgenda;
    o.querySelector('#agdf-salvar').onclick = async () => {
        for (const c of campos) {
            const el = document.getElementById('agdf-' + c.id);
            el.classList.remove('agd-erro');
            const vazio = c.tipo === 'profissional' ? !_agdLerProf('agdf-' + c.id).chave : !el.value.trim();
            if (c.obrig && vazio) { el.classList.add('agd-erro'); el.focus(); return; }
        }
        if (disp) {
            const q = consulta();
            const horaEl = document.getElementById('agdf-hora');
            if (q.prof && q.data && !q.hora && horaEl) {
                horaEl.classList.add('agd-erro'); horaEl.focus();
                await showAlert('Informe o horário: ele reserva a agenda do profissional.', '⚠️');
                return;
            }
            if (!await _agdValidarDisp(q)) { atualizarDisp(); _agdRedesenharAgendas(); return; }
        }
        await onSalvar(lerValores());
    };
    o.querySelector('input:not([hidden]), select, textarea')?.focus();
}

// --- DISPONIBILIDADE COMPARTILHADA (Instalacoes + Medicoes) -----------------
// O profissional e um so nas duas agendas: tudo o que esta agendado ocupa o
// periodo [horario, horario + duracao) dele -- instalacao de pedido Pronto p/
// Instalacao ja agendada e medicao com status Agendado. Concluido (Instalado,
// Aguardando Pagamento, medicao Realizada) e cancelado nao ocupam nada.
const _AGD_CFG_PADRAO = { dur_inst: 120, dur_med: 60, inicio: '08:00', fim: '18:00', passo: 60 };
const _AGD_DURACOES = [30, 60, 90, 120, 150, 180, 240, 300, 360, 480];

function getAgendaConfig() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem('sc_agd_cfg') || '{}') || {}; } catch (e) { c = {}; }
    return { ..._AGD_CFG_PADRAO, ...c };
}
function _agdDurPadrao(tipo) { const c = getAgendaConfig(); return +(tipo === 'med' ? c.dur_med : c.dur_inst) || 60; }
function _agdMin(h) { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function _agdHHMM(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function _agdFmtDur(min) {
    min = +min || 0;
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' min';
    if (!m) return h + (h === 1 ? ' hora' : ' horas');
    return h + 'h' + String(m).padStart(2, '0');
}
function _agdPeriodo(hora, dur) {
    const i = _agdMin(hora);
    return i === null ? '' : `${_agdHHMM(i)} – ${_agdHHMM(i + (+dur || 0))}`;
}

// Profissional = usuario do sistema (u:<id>) ou nome digitado (n:<nome>).
function _profChave(id, nome) {
    if (id) return 'u:' + id;
    const n = _agdNorm(nome);
    return n ? 'n:' + n : '';
}
function _instProf(p) { return _profChave(p.usuario_instalacao_id, p.instalador_nome); }
function _medProf(m)  { return _profChave(m.usuario_id, m.responsavel_nome); }
function _medNomeResp(m) { return nomeUsuario(m.usuario_id) || m.responsavel_nome || ''; }
function _medDefinirResponsavel(m, pessoa) {
    m.usuario_id = pessoa.id || null;
    m.responsavel_nome = pessoa.id ? '' : (pessoa.nome || '');
}

// Usuarios ativos e os nomes avulsos ja usados em instalacoes e medicoes.
function _agdProfissionais() {
    const lista = db.usuarios.filter(u => u.ativo).map(u => {
        const papel = (db.papeis || []).find(p => p.id === u.papel_id);
        return { chave: 'u:' + u.id, nome: u.nome, sub: papel ? papel.nome : 'Instalações e Medições' };
    });
    const vistos = new Set(lista.map(x => x.chave));
    const avulso = nome => {
        const pessoa = resolverPessoa(nome);
        const ch = _profChave(pessoa.id, pessoa.nome);
        if (!ch || vistos.has(ch)) return;
        vistos.add(ch);
        lista.push({ chave: ch, nome: String(nome).trim(), sub: 'Profissional externo' });
    };
    db.pedidos.forEach(p => { if (!p.usuario_instalacao_id && p.instalador_nome) avulso(p.instalador_nome); });
    (db.medicoes || []).forEach(m => { if (!m.usuario_id && m.responsavel_nome) avulso(m.responsavel_nome); });
    return lista;
}
// nomeDigitado: o texto de "Outro" ainda nao gravado (a chave perde acentos).
function _agdProfInfo(chave, nomeDigitado) {
    if (!chave) return null;
    const achado = _agdProfissionais().find(x => x.chave === chave);
    if (achado) return achado;
    if (chave.startsWith('u:')) return { chave, nome: nomeUsuario(+chave.slice(2)) || 'Usuário removido', sub: 'Usuário inativo' };
    return { chave, nome: (nomeDigitado || '').trim() || chave.slice(2), sub: 'Profissional externo' };
}

// Seletor de profissional: lista + "Outro" (nome digitado, ex.: terceirizado).
function _agdPreencherProf(id, chaveAtual, vazio) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const lista = _agdProfissionais();
    if (chaveAtual && !lista.some(x => x.chave === chaveAtual)) lista.push(_agdProfInfo(chaveAtual));
    sel.innerHTML = `<option value="">${escapeHtml(vazio || 'Selecione')}</option>` +
        lista.map(x => `<option value="${escapeHtml(x.chave)}">${escapeHtml(x.nome)}</option>`).join('') +
        '<option value="__outro">+ Outro (digitar nome)…</option>';
    sel.value = chaveAtual || '';
    const outro = document.getElementById(id + '-outro');
    if (outro) { outro.value = ''; outro.hidden = true; }
}
function _agdProfMudou(id) {
    const sel = document.getElementById(id), outro = document.getElementById(id + '-outro');
    if (!sel || !outro) return;
    outro.hidden = sel.value !== '__outro';
    if (!outro.hidden) outro.focus();
}
function _agdLerProf(id) {
    const nada = { chave: '', pessoa: { id: null, nome: '' } };
    const sel = document.getElementById(id);
    if (!sel || !sel.value) return nada;
    if (sel.value === '__outro') {
        const pessoa = resolverPessoa(document.getElementById(id + '-outro')?.value);
        return { chave: _profChave(pessoa.id, pessoa.nome), pessoa };
    }
    if (sel.value.startsWith('u:')) return { chave: sel.value, pessoa: { id: +sel.value.slice(2), nome: '' } };
    const info = _agdProfInfo(sel.value);
    return { chave: sel.value, pessoa: { id: null, nome: info ? info.nome : sel.value.slice(2) } };
}

// Duracao: o padrao do tipo de servico vem marcado; da para ajustar por agendamento.
function _agdPreencherDur(id, tipo, valor) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const padrao = _agdDurPadrao(tipo);
    const opcoes = [...new Set([..._AGD_DURACOES, padrao, ...(valor ? [+valor] : [])])].sort((a, b) => a - b);
    sel.innerHTML = opcoes.map(m => `<option value="${m}">${_agdFmtDur(m)}${m === padrao ? ' (padrão)' : ''}</option>`).join('');
    sel.value = String(valor || padrao);
}

// Tudo o que ocupa a agenda de algum profissional.
function _agdCompromissos() {
    const cfg = getAgendaConfig();
    const out = [];
    db.pedidos.forEach(p => {
        if (normalizarStatus(p.status) !== 'Pronto p/ Instalação' || !_instAgendada(p)) return;
        const ini = _agdMin(p.inst_hora), prof = _instProf(p);
        if (!p.data_entrega || ini === null || !prof) return;
        out.push({ tipo: 'inst', id: p.id, prof, data: p.data_entrega, ini, fim: ini + (+p.inst_duracao || +cfg.dur_inst),
            rotulo: `Instalação #${formatPedidoId(p.id)}`, cliente: p.clienteNome || '' });
    });
    (db.medicoes || []).forEach(m => {
        if (m.status !== 'Agendado') return;
        const ini = _agdMin(m.hora), prof = _medProf(m);
        if (!m.data || ini === null || !prof) return;
        out.push({ tipo: 'med', id: m.id, prof, data: m.data, ini, fim: ini + (+m.duracao || +cfg.dur_med),
            rotulo: 'Medição', cliente: m.clienteNome || '' });
    });
    return out;
}
function _agdDoDia(prof, data, ignorar) {
    return _agdCompromissos()
        .filter(c => c.prof === prof && c.data === data && !(ignorar && c.tipo === ignorar.tipo && c.id == ignorar.id))
        .sort((a, b) => a.ini - b.ini);
}
// Compromissos do profissional que se sobrepoem a [hora, hora + dur).
function _agdConflitos(q) {
    const ini = _agdMin(q.hora);
    if (!q.prof || !q.data || ini === null) return [];
    const fim = ini + (+q.dur || 0);
    return _agdDoDia(q.prof, q.data, q.ignorar).filter(c => c.ini < fim && ini < c.fim);
}
function _agdDescComp(c) {
    return `${c.rotulo}${c.cliente ? ' — ' + c.cliente : ''} (${_agdHHMM(c.ini)}–${_agdHHMM(c.fim)})`;
}

// Grade do dia. Verde: cabe a duracao escolhida. Vermelho: horario ocupado.
// Cinza: passado, fora do expediente ou a duracao esbarra em outro compromisso.
function _agdDisponibilidade(q) {
    const cfg = getAgendaConfig();
    const ini = _agdMin(cfg.inicio) ?? 480, fimDia = _agdMin(cfg.fim) ?? 1080, passo = +cfg.passo || 60;
    const dur = +q.dur || passo;
    const hoje = _agdHoje();
    const agora = new Date(), agoraMin = agora.getHours() * 60 + agora.getMinutes();
    const comps = q.prof && q.data ? _agdDoDia(q.prof, q.data, q.ignorar) : [];
    const slots = [];
    for (let s = ini; s + passo <= fimDia; s += passo) {
        let estado = 'livre', motivo = 'Disponível';
        const ocup = comps.find(c => c.ini < s + passo && s < c.fim);
        if (q.data < hoje || (q.data === hoje && s <= agoraMin)) { estado = 'indisp'; motivo = 'Horário já passou'; }
        else if (ocup) { estado = 'ocupado'; motivo = 'Ocupado: ' + _agdDescComp(ocup); }
        else if (s + dur > fimDia) { estado = 'indisp'; motivo = `${_agdFmtDur(dur)} passam do fim do expediente (${cfg.fim})`; }
        else {
            const c = comps.find(x => x.ini < s + dur && s < x.fim);
            if (c) { estado = 'indisp'; motivo = `Não cabem ${_agdFmtDur(dur)}: esbarra em ${_agdDescComp(c)}`; }
        }
        slots.push({ hora: _agdHHMM(s), estado, motivo });
    }
    return { slots, livres: slots.filter(x => x.estado === 'livre').map(x => x.hora), compromissos: comps };
}
function _agdSomarDias(data, n) {
    const d = new Date(data + 'T12:00:00'); d.setDate(d.getDate() + n);
    return d.toLocaleDateString('sv-SE');
}
// Primeiro dia (depois de q.data, ate 30 dias) com horario livre.
function _agdProximoDiaLivre(q) {
    let d = q.data < _agdHoje() ? _agdHoje() : q.data;
    for (let i = 0; i < 30; i++) {
        d = _agdSomarDias(d, 1);
        const r = _agdDisponibilidade({ ...q, data: d });
        if (r.livres.length) return { data: d, horas: r.livres };
    }
    return null;
}

// Releitura do que esta gravado (outra aba/usuario pode ter agendado) e
// conferencia final. Devolve false e avisa quando ha conflito.
function _agdRecarregar() {
    try {
        const ped = JSON.parse(localStorage.getItem('sc_ped'));
        const med = JSON.parse(localStorage.getItem('sc_med'));
        if (Array.isArray(ped)) db.pedidos  = ped;
        if (Array.isArray(med)) db.medicoes = med;
    } catch (e) { /* mantem o que esta em memoria */ }
}
async function _agdValidarDisp(q) {
    if (!q.prof || !q.data || !q.hora) return true;
    _agdRecarregar();
    const c = _agdConflitos(q);
    if (!c.length) return true;
    const nome = _agdProfInfo(q.prof, q.profNome)?.nome || 'O profissional';
    await showAlert(`${nome} já tem compromisso nesse período (${_agdFmtData(q.data)}, ${_agdPeriodo(q.hora, q.dur)}):\n\n${
        c.map(x => '• ' + _agdDescComp(x)).join('\n')}\n\nEscolha outro horário — os livres aparecem em verde.`, '⛔');
    return false;
}
function _agdRedesenharAgendas() {
    renderAgenda();
    renderMedicoes();
}

// --- Painel "Disponibilidade do profissional" ---
const _agdDispCtx = {};
function _agdDispEscolher(elId, data, hora) {
    const ctx = _agdDispCtx[elId];
    if (ctx && ctx.onHora) ctx.onHora(data, hora);
}
function _agdDispExpandir(elId) {
    const ctx = _agdDispCtx[elId] || (_agdDispCtx[elId] = {});
    ctx.expandido = true;
    if (ctx.q) _agdRenderDisp(elId, ctx.q);
}
// Sem profissional escolhido o painel mostra todos (usuarios ativos e nomes
// avulsos ja usados), com a situacao de cada um no dia; clicar seleciona.
// Quem tem papel ligado ao servico (instal.../medi...) vem primeiro.
function _agdListaProfissionais(elId, q) {
    const lista = _agdProfissionais();
    if (!lista.length) return '<div class="agd-disp-vazio">' + _agdIco('user', 22) + '<span>Nenhum profissional cadastrado. Cadastre em Configurações → Usuários ou use "+ Outro" no campo Profissional.</span></div>';
    const data = q.data || _agdHoje();
    const alvo = q.tipo === 'med' ? 'medi' : q.tipo === 'inst' ? 'instal' : '';
    const peso = x => (alvo && _agdNorm(x.sub).includes(alvo) ? 0 : 1);
    lista.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const itens = lista.map(x => {
        const d = _agdDisponibilidade({ ...q, prof: x.chave, data });
        let [txt, cls] = d.livres.length ? [d.livres.length + (d.livres.length === 1 ? ' horário livre' : ' horários livres'), 'agd-pill-verde']
            : d.compromissos.length ? ['Agenda cheia', 'agd-pill-verm'] : ['Indisponível', 'agd-pill-cinza'];
        if (!d.livres.length) {   // dia sem vaga: mostra quando ha a proxima
            const n = _agdProximoDiaLivre({ ...q, prof: x.chave, data });
            if (n) { txt = 'Próx. vaga: ' + _agdFmtData(n.data).slice(0, 5); }
        }
        return `<button type="button" class="agd-disp-prof agd-disp-prof-btn" onclick="_agdDispEscolherProf('${elId}', '${escapeHtml(x.chave).replace(/'/g, '&#39;')}')" title="Ver a disponibilidade de ${escapeHtml(x.nome)}">
            <span class="agd-avatar">${_agdIco('user', 18)}</span>
            <span class="agd-disp-prof-info"><strong>${escapeHtml(x.nome)}</strong><small>${escapeHtml(x.sub)}</small></span>
            <span class="agd-pill ${cls}">${txt}</span>
        </button>`;
    }).join('');
    return `<div class="agd-disp-dia">${data === _agdHoje() ? 'Hoje' : _agdFmtData(data)} · escolha o profissional</div><div class="agd-disp-lista">${itens}</div>`;
}
function _agdDispEscolherProf(elId, chave) {
    const ctx = _agdDispCtx[elId];
    if (ctx && ctx.onProf) ctx.onProf(chave);
}

// Recarrega usuarios/papeis (cadastro feito em outra aba) e atualiza os
// seletores de profissional sem perder o que ja estava escolhido.
function _agdAtualizarListaProf() {
    try {
        const u = JSON.parse(localStorage.getItem('sc_usr')), p = JSON.parse(localStorage.getItem('sc_pap'));
        if (Array.isArray(u)) db.usuarios = u;
        if (Array.isArray(p)) db.papeis = p;
    } catch (e) { /* mantem o que esta em memoria */ }
    [['inst-prof', 'Selecione'], ['med-prof', '— A definir —'], ['agdf-usu', '— A definir —']].forEach(([id, vazio]) => {
        const sel = document.getElementById(id);
        if (!sel || sel.value === '__outro') return;
        const vazioAtual = sel.options[0] ? sel.options[0].text : vazio;
        _agdPreencherProf(id, sel.value, vazioAtual);
    });
}

function _agdRenderDisp(elId, q) {
    const el = document.getElementById(elId);
    if (!el) return;
    const ctx = _agdDispCtx[elId] || (_agdDispCtx[elId] = {});
    const chaveCtx = (q.prof || '') + '|' + (q.data || '') + '|' + (q.dur || '');
    if (ctx.chave !== chaveCtx) { ctx.expandido = false; ctx.chave = chaveCtx; }
    ctx.q = q;
    const cab = `<div class="agd-disp-tit"><span class="agd-disp-tit-ico">${_agdIco('user', 15)}</span>Disponibilidade do profissional</div>`;
    if (!q.prof) { el.innerHTML = cab + _agdListaProfissionais(elId, q); return; }
    if (!q.data) {
        el.innerHTML = cab + `<div class="agd-disp-vazio">${_agdIco('cal', 22)}<span>Selecione a data para ver os horários livres.</span></div>`;
        return;
    }
    const info = _agdProfInfo(q.prof, q.profNome);
    const d = _agdDisponibilidade(q);
    const hoje = _agdHoje();
    const rotDia = q.data === hoje ? 'Hoje'
        : new Date(q.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, c => c.toUpperCase());
    const ocupados = d.compromissos.length;
    const [badgeTxt, badgeCls] = d.livres.length ? ['Disponível', 'agd-pill-verde']
        : ocupados ? ['Agenda cheia', 'agd-pill-verm'] : ['Indisponível', 'agd-pill-cinza'];

    const grade = d.slots.map(s => {
        const sel = q.hora && s.hora === _agdHHMM(_agdMin(q.hora)) ? ' agd-slot-sel' : '';
        const tit = escapeHtml(`${s.hora} · ${s.motivo}`);
        return s.estado === 'livre'
            ? `<button type="button" class="agd-slot agd-slot-livre${sel}" title="${tit}" onclick="_agdDispEscolher('${elId}','${q.data}','${s.hora}')">${s.hora}</button>`
            : `<span class="agd-slot agd-slot-${s.estado}${sel}" title="${tit}" aria-disabled="true">${s.hora}</span>`;
    }).join('');

    let prox = d.livres.map(h => ({ data: q.data, hora: h })), proxNota = '';
    if (!prox.length) {
        const n = _agdProximoDiaLivre(q);
        if (n) { prox = n.horas.map(h => ({ data: n.data, hora: h })); proxNota = `Sem horário livre neste dia. Próximo dia com vaga: ${_agdFmtData(n.data)}`; }
        else proxNota = 'Nenhum horário livre nos próximos 30 dias.';
    }
    const visiveis = ctx.expandido ? prox : prox.slice(0, 4);
    const resto = prox.length - visiveis.length;
    const chips = visiveis.map(x => `<button type="button" class="agd-chip" onclick="_agdDispEscolher('${elId}','${x.data}','${x.hora}')" title="${escapeHtml(_agdFmtData(x.data) + ' às ' + x.hora)}">${x.data !== q.data ? _agdFmtData(x.data).slice(0, 5) + ' ' : ''}${x.hora}</button>`).join('')
        + (resto > 0 ? `<button type="button" class="agd-chip agd-chip-mais" onclick="_agdDispExpandir('${elId}')" title="Ver todos os horários livres">+${resto}</button>` : '');

    const conflitos = q.hora ? _agdConflitos(q) : [];
    const aviso = conflitos.length
        ? `<div class="agd-disp-aviso" role="alert">⛔ ${escapeHtml(_agdPeriodo(q.hora, q.dur))} conflita com ${escapeHtml(conflitos.map(_agdDescComp).join('; '))}</div>`
        : (q.hora ? `<div class="agd-disp-ok">✓ ${escapeHtml(_agdPeriodo(q.hora, q.dur))} livre para ${escapeHtml(info.nome)}</div>` : '');

    const lista = ocupados
        ? `<div class="agd-disp-comp"><div class="agd-disp-sub">Compromissos do dia</div>${d.compromissos.map(c =>
            `<div class="agd-disp-comp-item"><span class="agd-pill ${c.tipo === 'inst' ? 'agd-pill-azul' : 'agd-pill-amar'}">${c.tipo === 'inst' ? 'Instalação' : 'Medição'}</span><span>${_agdHHMM(c.ini)}–${_agdHHMM(c.fim)}</span><span class="agd-disp-comp-cli">${escapeHtml(c.cliente || c.rotulo)}</span></div>`).join('')}</div>`
        : '';

    el.innerHTML = cab + `
        <div class="agd-disp-prof">
            <span class="agd-avatar">${_agdIco('user', 18)}</span>
            <span class="agd-disp-prof-info"><strong>${escapeHtml(info.nome)}</strong><small>${escapeHtml(info.sub)}</small></span>
            <span class="agd-pill ${badgeCls}">${badgeTxt}</span>
        </div>
        <div class="agd-disp-dia">${escapeHtml(rotDia)} - ${_agdFmtData(q.data)} <small>· ${escapeHtml(_agdFmtDur(q.dur))} por serviço</small></div>
        <div class="agd-disp-leg">
            <span><i class="agd-dot agd-dot-livre"></i>Horários disponíveis</span>
            <span><i class="agd-dot agd-dot-ocupado"></i>Horários ocupados</span>
            <span><i class="agd-dot agd-dot-indisp"></i>Não disponível</span>
        </div>
        <div class="agd-disp-grade">${grade}</div>
        ${aviso}
        <div class="agd-disp-sub">Próximos horários livres:</div>
        ${proxNota ? `<div class="agd-disp-nota">${escapeHtml(proxNota)}</div>` : ''}
        <div class="agd-disp-prox">${chips}</div>
        ${lista}`;
}

// Duracao padrao por tipo de servico e expediente usado na grade.
function abrirConfigAgenda() {
    const c = getAgendaConfig();
    const opt = sel => _AGD_DURACOES.map(m => `<option value="${m}"${m === +sel ? ' selected' : ''}>${_agdFmtDur(m)}</option>`).join('');
    const corpo = `<div class="agd-form">
        <div class="form-group"><label for="agdc-inst">Duração padrão — Instalação</label><select id="agdc-inst">${opt(c.dur_inst)}</select></div>
        <div class="form-group"><label for="agdc-med">Duração padrão — Medição</label><select id="agdc-med">${opt(c.dur_med)}</select></div>
        <div class="form-group"><label for="agdc-ini">Início do expediente</label><input type="time" id="agdc-ini" value="${escapeHtml(c.inicio)}"></div>
        <div class="form-group"><label for="agdc-fim">Fim do expediente</label><input type="time" id="agdc-fim" value="${escapeHtml(c.fim)}"></div>
        <div class="form-group agd-form-largo"><label for="agdc-passo">Intervalo entre horários da grade</label>
            <select id="agdc-passo"><option value="30"${+c.passo === 30 ? ' selected' : ''}>30 min</option><option value="60"${+c.passo === 60 ? ' selected' : ''}>1 hora</option></select></div>
    </div>
    <small class="agd-form-dica">A duração padrão vem marcada em cada novo agendamento e pode ser ajustada individualmente. Vale para as duas agendas.</small>`;
    const o = _agdAbrirModal('Duração padrão dos serviços', corpo,
        `<button type="button" class="btn btn-outline btn-sm" onclick="fecharModalAgenda()">Cancelar</button>
         <button type="button" class="btn btn-success btn-sm" id="agdc-salvar">Salvar</button>`);
    o.querySelector('#agdc-salvar').onclick = async () => {
        const ini = document.getElementById('agdc-ini').value, fim = document.getElementById('agdc-fim').value;
        if (!ini || !fim || _agdMin(fim) <= _agdMin(ini)) { await showAlert('O fim do expediente precisa ser depois do início.', '⚠️'); return; }
        localStorage.setItem('sc_agd_cfg', JSON.stringify({
            dur_inst: +document.getElementById('agdc-inst').value,
            dur_med:  +document.getElementById('agdc-med').value,
            inicio: ini, fim, passo: +document.getElementById('agdc-passo').value,
        }));
        fecharModalAgenda();
        // Os formularios abertos passam a sugerir a nova duracao padrao.
        _agdPreencherDur('inst-dur', 'inst');
        _agdPreencherDur('med-dur', 'med');
        _agdRedesenharAgendas();
        toast('Duração padrão salva!', 'success');
    };
}

// --- MEDICOES ---------------------------------------------------------------
function _medPill(m, hoje) {
    if (m.status === 'Realizado') return 'realizado';
    return m.data && m.data < hoje ? 'atrasado' : 'agendado';
}

function _medAtualizar() {
    syncDB();
    renderMedicoes();
    renderDashboardMedicoes();
    renderAgenda();   // a disponibilidade e compartilhada
}

// Painel ao lado do formulario "Agendar Visita de Medicao".
function _medAtualizarDisp() {
    if (!document.getElementById('med-disp')) return;
    _agdDispCtx['med-disp'] = Object.assign(_agdDispCtx['med-disp'] || {}, { onHora: (d, h) => {
        document.getElementById('med-data').value = d;
        document.getElementById('med-hora').value = h;
        _medAtualizarDisp();
    } });
    const prof = _agdLerProf('med-prof');
    _agdDispCtx['med-disp'].onProf = ch => { _agdPreencherProf('med-prof', ch, '— A definir —'); _medAtualizarDisp(); };
    _agdRenderDisp('med-disp', {
        tipo: 'med', prof: prof.chave, profNome: prof.pessoa.nome,
        data: document.getElementById('med-data')?.value || '',
        hora: document.getElementById('med-hora')?.value || '',
        dur:  parseInt(document.getElementById('med-dur')?.value) || _agdDurPadrao('med'),
    });
}

function renderMedicoes() {
    if (!document.getElementById('med-pend-lista')) return;
    const hoje  = _agdHoje();
    const todas = db.medicoes || [];
    const pend  = todas.filter(m => m.status === 'Agendado');
    const real  = todas.filter(m => m.status === 'Realizado');
    const filtra = (lista, chave) => {
        const b = _agdNorm(_agdBusca[chave]);
        return b ? lista.filter(m => _agdNorm(m.clienteNome).includes(b)) : lista;
    };
    const linha = m => _agdLinha({
        onclick: `abrirDetalheMedicao(${m.id})`,
        nome: m.clienteNome, tel: m.clienteTel, end: m.endereco,
        data: m.data, hora: m.hora, pill: _medPill(m, hoje),
    });
    const pendF = filtra(pend, 'medPend').sort((a, b) => _agdCmp(_agdChave(a.data, a.hora), _agdChave(b.data, b.hora)));
    const realF = filtra(real, 'medReal').sort((a, b) =>
        _agdCmp(_agdChave(b.data, b.hora), _agdChave(a.data, a.hora)) || (b.realizado_em || 0) - (a.realizado_em || 0));
    _agdPreencher('med-pend', pendF.map(linha), pend.length, 'Nenhuma visita agendada. Use o formulário acima para agendar.', _agdBusca.medPend, ['agendamento', 'agendamentos']);
    _agdPreencher('med-real', realF.map(linha), real.length, 'Nenhuma medição realizada ainda.', _agdBusca.medReal);
    _medAtualizarDisp();
}

function abrirDetalheMedicao(id) {
    const m = (db.medicoes || []).find(x => x.id == id);
    if (!m) return;
    const pend = m.status === 'Agendado';
    const ped  = _medPedidoVinculado(m);
    const tel  = m.clienteTel
        ? `<a href="https://wa.me/55${m.clienteTel.replace(/\D/g, '')}" target="_blank" rel="noopener">${escapeHtml(m.clienteTel)}</a>`
        : '—';
    const dur = +m.duracao || _agdDurPadrao('med');
    const corpo = `<div class="agd-det-topo">${_agdPill(_medPill(m, _agdHoje()))}</div>` + _agdCampos([
        ['Cliente',     escapeHtml(m.clienteNome || '—')],
        ['Telefone',    tel],
        ['Endereço',    escapeHtml(m.endereco || '—')],
        ['Data',        _agdFmtData(m.data)],
        ['Horário',     escapeHtml(m.hora ? _agdPeriodo(m.hora, dur) : '—')],
        ['Duração',     escapeHtml(_agdFmtDur(dur))],
        ['Responsável', escapeHtml(_medNomeResp(m) || 'A definir')],
        m.agendado_por ? ['Agendado por', escapeHtml(nomeUsuario(m.agendado_por))] : null,
        ['Observações', escapeHtml(m.obs || '—')],
        m.realizado_em ? ['Confirmada em', _agdFmtMomento(m.realizado_em) + (m.realizado_via === 'pedido' ? ' (ao salvar o pedido)' : '')] : null,
        ped ? ['Pedido', `#${formatPedidoId(ped.id)}`] : null,
    ]) + _agdHistorico(m.historico);
    // Com pedido ja criado o botao abre esse pedido: o agendamento nunca gera dois.
    const btnPedido = ped
        ? `<button class="btn btn-outline btn-sm" onclick="criarPedidoDaMedicao(${m.id})" title="Abre o pedido criado a partir deste agendamento">📄 Abrir Pedido #${formatPedidoId(ped.id)}</button>`
        : (pend ? `<button class="btn btn-sm" onclick="criarPedidoDaMedicao(${m.id})" title="Abre o formulário de pedido com o cliente já preenchido. Ao salvar, a medição vai para Realizados.">+ Criar Pedido</button>` : '');
    const rodape = pend
        ? `<button class="btn btn-outline btn-sm btn-danger" onclick="cancelarMedicao(${m.id})">✕ Cancelar agendamento</button>
           <button class="btn btn-outline btn-sm" onclick="fecharModalAgenda();imprimirAgendamentoMedicao(${m.id})">🖨️ Documento</button>
           <button class="btn btn-outline btn-sm" onclick="editarMedicao(${m.id})">✏️ Editar</button>
           <button class="btn btn-outline btn-sm" onclick="reagendarMedicao(${m.id})">📅 Reagendar</button>
           ${btnPedido}
           <button class="btn btn-success btn-sm" onclick="confirmarMedicao(${m.id})">✓ Confirmar medição</button>`
        : `<button class="btn btn-outline btn-sm btn-danger" onclick="excluirMedicao(${m.id})">🗑️ Excluir</button>
           <button class="btn btn-outline btn-sm" onclick="fecharModalAgenda();imprimirAgendamentoMedicao(${m.id})">🖨️ Documento</button>
           ${btnPedido}`;
    _agdAbrirModal('Visita de medição', corpo, rodape);
}

function _medDisp(id) { return { disp: { tipo: 'med', ignorar: { tipo: 'med', id } } }; }

function editarMedicao(id) {
    const m = (db.medicoes || []).find(x => x.id == id);
    if (!m) return;
    _agdFormulario('Editar agendamento', [
        { id: 'tel',  label: 'Telefone',    tipo: 'text', valor: m.clienteTel },
        { id: 'end',  label: 'Endereço da visita', tipo: 'text', valor: m.endereco, obrig: true },
        { id: 'usu',  label: 'Responsável pela medição', tipo: 'profissional', valor: _medProf(m) },
        { id: 'data', label: 'Data da visita', tipo: 'date', valor: m.data, obrig: true },
        { id: 'hora', label: 'Horário',     tipo: 'time', valor: m.hora },
        { id: 'dur',  label: 'Duração do serviço', tipo: 'duracao', valor: m.duracao },
        { id: 'obs',  label: 'Observações', tipo: 'textarea', valor: m.obs, largo: true },
    ], v => {
        const atual = (db.medicoes || []).find(x => x.id == id);   // relido na validacao
        if (!atual) return;
        atual.clienteTel = v.tel; atual.endereco = v.end; atual.data = v.data; atual.hora = v.hora;
        atual.duracao = v.dur; atual.obs = v.obs;
        _medDefinirResponsavel(atual, v.usu.pessoa);
        _medAtualizar();
        toast('Agendamento atualizado!', 'success');
        abrirDetalheMedicao(id);
    }, () => abrirDetalheMedicao(id), _medDisp(id));
}

function reagendarMedicao(id) {
    const m = (db.medicoes || []).find(x => x.id == id);
    if (!m) return;
    _agdFormulario('Reagendar visita', [
        { id: 'usu',  label: 'Responsável pela medição', tipo: 'profissional', valor: _medProf(m) },
        { id: 'dur',  label: 'Duração do serviço', tipo: 'duracao', valor: m.duracao },
        { id: 'data', label: 'Nova data', tipo: 'date', valor: m.data, obrig: true },
        { id: 'hora', label: 'Horário',   tipo: 'time', valor: m.hora },
        { id: 'obs',  label: 'Observações', tipo: 'textarea', valor: m.obs, largo: true },
    ], v => {
        const atual = (db.medicoes || []).find(x => x.id == id);
        if (!atual) return;
        if (v.data !== atual.data || v.hora !== (atual.hora || '')) {
            if (!atual.historico) atual.historico = [];
            _agdRegistrar(atual.historico, 'reagendado', { de: { data: atual.data, hora: atual.hora || '' }, para: { data: v.data, hora: v.hora } });
        }
        atual.data = v.data; atual.hora = v.hora; atual.duracao = v.dur; atual.obs = v.obs;
        _medDefinirResponsavel(atual, v.usu.pessoa);
        _medAtualizar();
        toast('Visita reagendada!', 'success');
        abrirDetalheMedicao(id);
    }, () => abrirDetalheMedicao(id), _medDisp(id));
}

async function confirmarMedicao(id) {
    const m = (db.medicoes || []).find(x => x.id == id);
    if (!m || m.status !== 'Agendado') return;
    fecharModalAgenda();
    const ok = await showConfirm(`Confirmar que a medição de ${m.clienteNome || 'cliente'} foi realizada?\n\nEla sai de Agendamentos e vai para Realizados.`, '✅', 'Confirmar', 'Voltar');
    if (!ok) { abrirDetalheMedicao(id); return; }
    m.status = 'Realizado';
    m.realizado_em  = Date.now();
    m.realizado_por = getUsuarioLogado()?.id || null;
    _medAtualizar();
    toast('Medição confirmada!', 'success');
}

// Cancelar nao apaga: o registro fica com status Cancelado e o momento, fora
// das duas colunas e fora da contagem de realizadas. O horario do
// profissional fica livre de novo.
async function cancelarMedicao(id) {
    const m = (db.medicoes || []).find(x => x.id == id);
    if (!m || m.status !== 'Agendado') return;
    fecharModalAgenda();
    const ok = await showConfirm(`Cancelar a visita de ${m.clienteNome || 'cliente'} em ${_agdFmtData(m.data)}?\n\nO horário do profissional fica livre.`, '⚠️', 'Sim, cancelar', 'Não');
    if (!ok) { abrirDetalheMedicao(id); return; }
    if (!m.historico) m.historico = [];
    _agdRegistrar(m.historico, 'cancelado');
    m.status = 'Cancelado';
    m.cancelado_em = Date.now();
    _medAtualizar();
    toast('Agendamento cancelado.', 'info');
}

async function excluirMedicao(id) {
    fecharModalAgenda();
    if (!await showConfirm('Excluir este registro de medição?\nEsta ação não pode ser desfeita.', '🗑️', 'Excluir', 'Cancelar')) { abrirDetalheMedicao(id); return; }
    db.medicoes = db.medicoes.filter(x => x.id != id);
    _medAtualizar();
    toast('Registro excluído.', 'info');
}

function renderDashboardMedicoes() {
    const container = document.getElementById('dashboard-medicoes');
    if (!container) return;

    const hojeStr = new Date().toISOString().split('T')[0];
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    const atrasadas = filtrarMedicoesVisiveis(db.medicoes)
        .filter(m => m.status === 'Agendado' && m.data < hojeStr)
        .sort((a, b) => (a.data + (a.hora || '99:99')) > (b.data + (b.hora || '99:99')) ? -1 : 1);

    const proximas = filtrarMedicoesVisiveis(db.medicoes)
        .filter(m => m.status === 'Agendado' && m.data >= hojeStr)
        .sort((a, b) => (a.data + (a.hora || '99:99')) < (b.data + (b.hora || '99:99')) ? -1 : 1)
        .slice(0, 6);

    if (!atrasadas.length && !proximas.length) { container.style.display = 'none'; return; }
    container.style.display = '';

    function makeCard(v, atrasada) {
        const d    = new Date(v.data + 'T00:00:00');
        const diff = Math.round((d - hoje) / (1000 * 60 * 60 * 24));
        let label, bg, bord, acc, clrL;
        if (atrasada) {
            const dias = Math.abs(diff);
            label = dias === 1 ? 'Ontem' : `${dias}d atrás`;
            bg = '#FEF4F2'; bord = '#F79B90'; acc = '#F43927'; clrL = '#F43927';
        } else {
            label = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
            bg    = diff === 0 ? '#E4EFF9' : '#FAFAFA';
            bord  = diff === 0 ? '#9FC4E5' : 'var(--border)';
            acc   = diff === 0 ? '#2D77C1' : '#005D3B';
            clrL  = diff === 0 ? '#2D77C1' : '#8F8F8F';
        }
        return `<div onclick="location.href='pcp.html?view=medicoes'" style="cursor:pointer;background:${bg};border:1px solid ${bord};border-left:4px solid ${acc};border-radius:8px;padding:12px 16px;min-width:155px;flex:1;max-width:200px;transition:transform 0.1s,box-shadow 0.1s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div style="font-size:11px;font-weight:700;color:${clrL};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${label}</div>
            <div style="font-weight:700;font-size:14px;color:var(--dark);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(v.clienteNome)}">${escapeHtml(v.clienteNome)}</div>
            ${v.hora ? `<div style="font-size:12px;color:var(--dark)">🕐 ${v.hora}</div>` : ''}
            ${v.clienteTel ? `<div style="font-size:12px;color:#8F8F8F;margin-top:2px">${escapeHtml(v.clienteTel)}</div>` : ''}
        </div>`;
    }

    let sections = '';

    if (atrasadas.length) {
        sections += `<div style="margin-bottom:${proximas.length ? '18px' : '0'}">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#F43927;margin-bottom:8px">⚠️ Atrasadas (${atrasadas.length})</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">${atrasadas.map(v => makeCard(v, true)).join('')}</div>
        </div>`;
    }

    if (proximas.length) {
        sections += `<div>
            ${atrasadas.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8F8F8F;margin-bottom:8px">📐 Próximas</div>` : ''}
            <div style="display:flex;gap:12px;flex-wrap:wrap">${proximas.map(v => makeCard(v, false)).join('')}</div>
        </div>`;
    }

    const titleColor = atrasadas.length ? '#F43927' : '#242424';
    const titleText  = atrasadas.length
        ? `⚠️ Medições — ${atrasadas.length} atrasada${atrasadas.length > 1 ? 's' : ''}`
        : '📐 Próximas Medições';

    container.innerHTML = `<div class="card" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="color:${titleColor};font-size:15px;margin:0">${titleText}</h3>
            <a href="pcp.html?view=medicoes" class="btn btn-outline btn-sm">Ver agenda completa</a>
        </div>
        ${sections}
    </div>`;
}

function renderDashboardInstalacoes() {
    const container = document.getElementById('dashboard-instalacoes');
    if (!container) return;

    const hojeStr = new Date().toISOString().split('T')[0];
    const hoje    = new Date(); hoje.setHours(0, 0, 0, 0);
    const statuses = ['Pronto p/ Instalação', 'Aguardando Pagamento'];

    const atrasados = filtrarPedidosVisiveis(db.pedidos)
        .filter(p => statuses.includes(normalizarStatus(p.status)) && p.data_entrega && p.data_entrega < hojeStr)
        .sort((a, b) => b.data_entrega < a.data_entrega ? -1 : 1);

    const proximos = filtrarPedidosVisiveis(db.pedidos)
        .filter(p => statuses.includes(normalizarStatus(p.status)) && p.data_entrega && p.data_entrega >= hojeStr)
        .sort((a, b) => a.data_entrega < b.data_entrega ? -1 : 1)
        .slice(0, 6);

    const semData = filtrarPedidosVisiveis(db.pedidos)
        .filter(p => statuses.includes(normalizarStatus(p.status)) && !p.data_entrega)
        .slice(0, 3);

    if (!atrasados.length && !proximos.length && !semData.length) { container.style.display = 'none'; return; }
    container.style.display = '';

    function makeCard(p) {
        const d    = p.data_entrega ? new Date(p.data_entrega + 'T00:00:00') : null;
        const diff = d ? Math.round((d - hoje) / (1000 * 60 * 60 * 24)) : null;
        const atrasado = diff !== null && diff < 0;
        let label, bg, bord, acc, clrL;
        if (diff === null) {
            label = 'Sem data'; bg = '#FAFAFA'; bord = 'var(--border)'; acc = '#8F8F8F'; clrL = '#8F8F8F';
        } else if (atrasado) {
            const dias = Math.abs(diff);
            label = dias === 1 ? 'Ontem' : `${dias}d atrás`;
            bg = '#FEF4F2'; bord = '#F79B90'; acc = '#F43927'; clrL = '#F43927';
        } else {
            label = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
            bg    = diff === 0 ? '#E4EFF9' : '#FAFAFA';
            bord  = diff === 0 ? '#9FC4E5' : 'var(--border)';
            acc   = diff === 0 ? '#2D77C1' : '#005D3B';
            clrL  = diff === 0 ? '#2D77C1' : '#8F8F8F';
        }
        return `<div onclick="location.href='pcp.html?view=agenda'" style="cursor:pointer;background:${bg};border:1px solid ${bord};border-left:4px solid ${acc};border-radius:8px;padding:12px 16px;min-width:155px;flex:1;max-width:200px;transition:transform 0.1s,box-shadow 0.1s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div style="font-size:11px;font-weight:700;color:${clrL};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${label}</div>
            <div style="font-weight:700;font-size:14px;color:var(--dark);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(p.clienteNome)}">${escapeHtml(p.clienteNome||'—')}</div>
            <div style="font-size:11px;color:#8F8F8F">#${formatPedidoId(p.id)}</div>
            ${p.inst_hora     ? `<div style="font-size:12px;color:var(--dark);margin-top:2px">🕐 ${p.inst_hora}</div>` : ''}
            ${p.inst_endereco ? `<div style="font-size:11px;color:#8F8F8F;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(p.inst_endereco)}">📍 ${escapeHtml(p.inst_endereco)}</div>` : ''}
        </div>`;
    }

    let sections = '';
    if (atrasados.length) {
        sections += `<div style="margin-bottom:${(proximos.length || semData.length) ? '18px' : '0'}">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#F43927;margin-bottom:8px">⚠️ Atrasados (${atrasados.length})</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">${atrasados.map(makeCard).join('')}</div>
        </div>`;
    }
    if (proximos.length) {
        sections += `<div style="margin-bottom:${semData.length ? '18px' : '0'}">
            ${atrasados.length ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8F8F8F;margin-bottom:8px">🔧 Próximas Instalações</div>` : ''}
            <div style="display:flex;gap:12px;flex-wrap:wrap">${proximos.map(makeCard).join('')}</div>
        </div>`;
    }
    if (semData.length) {
        sections += `<div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8F8F8F;margin-bottom:8px">Sem data definida (${semData.length})</div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">${semData.map(makeCard).join('')}</div>
        </div>`;
    }

    const titleColor = atrasados.length ? '#F43927' : '#242424';
    const titleText  = atrasados.length
        ? `⚠️ Instalações — ${atrasados.length} atrasada${atrasados.length > 1 ? 's' : ''}`
        : '🔧 Agenda de Instalações';

    container.innerHTML = `<div class="card" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="color:${titleColor};font-size:15px;margin:0">${titleText}</h3>
            <a href="pcp.html?view=agenda" class="btn btn-outline btn-sm">Ver agenda completa</a>
        </div>
        ${sections}
    </div>`;
}

// --- INSTALACOES --------------------------------------------------------------
// O agendamento vive no proprio pedido (um pedido = no maximo uma instalacao),
// entao nao ha como duplicar. Fluxo:
//   Na Costura -> Pronto p/ Instalacao  => card em "Pedidos Prontos para Instalacao"
//   Agendar (profissional/data/horario) => coluna "Agendamentos de Instalacao"
//   Confirmar instalacao                => coluna "Realizados" (Instalado ou
//                                          Aguardando Pagamento, conforme o saldo)
// A data da instalacao e a data_entrega do pedido (a mesma do Kanban).

// Pedido antigo (antes do campo inst_agendado) conta como agendado se ja
// tinha data -- era assim que a agenda o tratava.
function _instAgendada(p) {
    if (!p) return false;
    if (p.inst_agendado !== undefined) return !!p.inst_agendado;
    return !!p.data_entrega;
}
function _instPendente(p) { return normalizarStatus(p.status) === 'Pronto p/ Instalação' && _instAgendada(p); }
function _instRealizada(p) { const s = normalizarStatus(p.status); return s === 'Instalado' || s === 'Aguardando Pagamento'; }
function _instProntos() { return db.pedidos.filter(p => normalizarStatus(p.status) === 'Pronto p/ Instalação' && !_instAgendada(p)); }
function _instDur(p) { return +p.inst_duracao || _agdDurPadrao('inst'); }

function _instPill(p, hoje) {
    const s = normalizarStatus(p.status);
    if (s === 'Instalado') return 'instalado';
    if (s === 'Aguardando Pagamento') return 'pagamento';
    if (!p.data_entrega) return 'semdata';
    return p.data_entrega < hoje ? 'atrasado' : 'agendado';
}

// Data mostrada no Realizado: o dia em que foi confirmada; pedido antigo sem
// esse registro usa a data agendada.
function _instDiaRealizado(p) {
    const ts = p.inst_confirmada_em || p.data_instalado;
    return ts ? _agdDiaLocal(ts) : (p.data_entrega || '');
}

// A agenda e o Kanban ficam na mesma pagina: o que muda o pedido aqui
// (agendar, confirmar, reagendar, cancelar) redesenha os dois, sem recarregar.
function _instAtualizar() {
    syncDB();
    renderAgenda();
    renderMedicoes();   // a disponibilidade e compartilhada
    renderKanban();
    renderDashboardInstalacoes();
}

// Botao do Kanban ("📅 Agendar") e links de outras telas: abre a agenda de
// instalacoes com o pedido ja selecionado no formulario.
function irParaAgendaInstalacao(id) {
    if (!document.getElementById('inst-form')) {
        window.location.href = 'pcp.html?view=agenda&pedido=' + encodeURIComponent(id);
        return;
    }
    mostrarViewPCP('agenda');
    const p = db.pedidos.find(x => x.id == id);
    if (p && _instPendente(p)) { abrirDetalheInstalacao(p.id); return; }
    selecionarPedidoInstalacao(id);
    document.getElementById('inst-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Cards "Pedidos Prontos para Instalacao" + formulario "Agendar Instalacao" ---
let _instSelId = null;

function _instRenderProntos() {
    const lista = document.getElementById('inst-prontos-lista');
    if (!lista) return;
    const prontos = _instProntos().sort((a, b) => _agdCmp(_agdChave(a.data_entrega, ''), _agdChave(b.data_entrega, '')) || a.id - b.id);
    if (_instSelId && !prontos.some(p => p.id == _instSelId)) _instLimparForm();
    const cont = document.getElementById('inst-prontos-count');
    if (cont) cont.textContent = prontos.length + (prontos.length === 1 ? ' pedido' : ' pedidos');
    lista.innerHTML = prontos.length ? prontos.map(p => `
        <button type="button" class="agd-pronto${p.id == _instSelId ? ' agd-pronto-sel' : ''}" onclick="selecionarPedidoInstalacao(${p.id})" title="Agendar a instalação deste pedido">
            <span class="agd-pronto-ico">${_agdIco('caixa', 18)}</span>
            <span class="agd-pronto-info">
                <span class="agd-pronto-top"><strong>#${formatPedidoId(p.id)}</strong><span class="agd-pill agd-pill-verde">Pronto para Instalação</span></span>
                <span class="agd-pronto-linha"><em>Cliente:</em> ${escapeHtml(p.clienteNome || '—')}</span>
                <span class="agd-pronto-linha"><em>Produto:</em> ${escapeHtml(p.amb || '—')}</span>
                <span class="agd-pronto-linha"><em>Entrega:</em> ${p.data_entrega ? _agdFmtData(p.data_entrega) : 'a definir'}</span>
            </span>
            <span class="agd-seta">${_agdIco('seta', 16)}</span>
        </button>`).join('')
        : '<div class="agd-vazio agd-prontos-vazio">Nenhum pedido aguardando agendamento. Ao passar um pedido de "Na Costura" para "Pronto p/ Instalação" ele aparece aqui.</div>';

    const sel = document.getElementById('inst-pedido');
    if (sel) {
        sel.innerHTML = '<option value="">Selecione um pedido pronto para instalação</option>' +
            prontos.map(p => `<option value="${p.id}">#${formatPedidoId(p.id)} - ${escapeHtml(p.clienteNome || '')}</option>`).join('');
        sel.value = _instSelId ? String(_instSelId) : '';
    }
}

function _instLimparForm() {
    _instSelId = null;
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.classList.remove('agd-erro'); } };
    set('inst-pedido', '');
    set('inst-data', _agdHoje());
    set('inst-hora', '');
    set('inst-end', '');
    set('inst-obs', '');
    _agdPreencherProf('inst-prof', '', 'Selecione');
    _agdPreencherDur('inst-dur', 'inst');
    const sub = document.getElementById('inst-pedido-sub'); if (sub) sub.innerHTML = '';
    const cli = document.getElementById('inst-cliente');
    if (cli) cli.innerHTML = '<span class="agd-cli-vazio">Preenchido ao selecionar o pedido</span>';
}

// Seleciona o pedido e preenche cliente, telefone, endereco e o que o pedido
// ja tiver (instalador, observacoes, duracao).
function selecionarPedidoInstalacao(id) {
    const p = id ? db.pedidos.find(x => x.id == id) : null;
    if (!p) { _instLimparForm(); _instRenderProntos(); _instAtualizarDisp(); return; }
    if (normalizarStatus(p.status) !== 'Pronto p/ Instalação' || _instAgendada(p)) {
        toast(_instAgendada(p) ? `O pedido #${formatPedidoId(p.id)} já está agendado.` : `O pedido #${formatPedidoId(p.id)} não está pronto para instalação.`, 'info');
        return;
    }
    _instSelId = p.id;
    const cli = db.clientes.find(c => c.id == p.clienteId);
    const hoje = _agdHoje();
    const set = (eid, v) => { const el = document.getElementById(eid); if (el) { el.value = v; el.classList.remove('agd-erro'); } };
    set('inst-end', p.inst_endereco || cli?.end || '');
    set('inst-obs', p.inst_obs || '');
    set('inst-data', p.data_entrega && p.data_entrega >= hoje ? p.data_entrega : hoje);
    set('inst-hora', '');
    _agdPreencherProf('inst-prof', _instProf(p), 'Selecione');
    _agdPreencherDur('inst-dur', 'inst', p.inst_duracao);
    const sub = document.getElementById('inst-pedido-sub');
    if (sub) sub.innerHTML = `<span class="agd-pill agd-pill-verde">Pronto para Instalação</span><span>Produto: ${escapeHtml(p.amb || '—')}</span>`;
    const box = document.getElementById('inst-cliente');
    if (box) box.innerHTML = `<strong>${escapeHtml(p.clienteNome || '—')}</strong>` +
        (cli?.tel ? `<span class="agd-linha">${_agdIco('tel', 12)}${escapeHtml(cli.tel)}</span>` : '');
    _instRenderProntos();
    _instAtualizarDisp();
}

function _instAtualizarDisp() {
    if (!document.getElementById('inst-disp')) return;
    _agdDispCtx['inst-disp'] = Object.assign(_agdDispCtx['inst-disp'] || {}, { onHora: (d, h) => {
        document.getElementById('inst-data').value = d;
        document.getElementById('inst-hora').value = h;
        document.getElementById('inst-hora').classList.remove('agd-erro');
        _instAtualizarDisp();
    } });
    const prof = _agdLerProf('inst-prof');
    _agdDispCtx['inst-disp'].onProf = ch => { _agdPreencherProf('inst-prof', ch, 'Selecione'); _instAtualizarDisp(); };
    _agdRenderDisp('inst-disp', {
        tipo: 'inst', prof: prof.chave, profNome: prof.pessoa.nome,
        data: document.getElementById('inst-data')?.value || '',
        hora: document.getElementById('inst-hora')?.value || '',
        dur:  parseInt(document.getElementById('inst-dur')?.value) || _agdDurPadrao('inst'),
    });
}

async function salvarAgendamentoInstalacao() {
    const campos = {
        pedido: document.getElementById('inst-pedido'),
        prof:   document.getElementById('inst-prof'),
        data:   document.getElementById('inst-data'),
        hora:   document.getElementById('inst-hora'),
    };
    Object.values(campos).forEach(el => el && el.classList.remove('agd-erro'));
    const prof = _agdLerProf('inst-prof');
    const v = {
        id:   parseInt(campos.pedido?.value) || null,
        data: campos.data?.value || '',
        hora: campos.hora?.value || '',
        dur:  parseInt(document.getElementById('inst-dur')?.value) || _agdDurPadrao('inst'),
        end:  (document.getElementById('inst-end')?.value || '').trim(),
        obs:  (document.getElementById('inst-obs')?.value || '').trim(),
    };
    const faltando = [];
    if (!v.id)       faltando.push(['pedido', 'o pedido']);
    if (!prof.chave) faltando.push(['prof', 'o profissional']);
    if (!v.data)     faltando.push(['data', 'a data']);
    if (!v.hora)     faltando.push(['hora', 'o horário']);
    if (faltando.length) {
        faltando.forEach(([k]) => campos[k]?.classList.add('agd-erro'));
        campos[faltando[0][0]]?.focus();
        await showAlert(`Informe ${faltando.map(f => f[1]).join(', ')}.`, '⚠️');
        return;
    }

    // Confere de novo contra o que esta gravado: outro usuario/aba pode ter
    // agendado o pedido ou ocupado o horario desde que a tela foi aberta.
    if (!await _agdValidarDisp({ prof: prof.chave, profNome: prof.pessoa.nome, data: v.data, hora: v.hora, dur: v.dur })) { _agdRedesenharAgendas(); return; }
    const p = db.pedidos.find(x => x.id == v.id);
    if (!p || normalizarStatus(p.status) !== 'Pronto p/ Instalação') {
        await showAlert('Este pedido não está mais em "Pronto p/ Instalação".', '⚠️');
        _instLimparForm(); _agdRedesenharAgendas(); return;
    }
    if (_instAgendada(p)) {
        const quem = p.inst_agendado_por ? ` por ${nomeUsuario(p.inst_agendado_por)}` : '';
        await showAlert(`O pedido #${formatPedidoId(p.id)} já foi agendado${quem} para ${_agdFmtData(p.data_entrega)}${p.inst_hora ? ' às ' + p.inst_hora : ''}.\n\nNenhum agendamento novo foi criado.`, 'ℹ️');
        _instLimparForm(); _agdRedesenharAgendas(); return;
    }

    p.data_entrega   = v.data;
    p.inst_hora      = v.hora;
    p.inst_duracao   = v.dur;
    p.inst_endereco  = v.end;
    p.inst_obs       = v.obs;
    definirInstalador(p, prof.pessoa);
    p.inst_agendado     = true;
    p.inst_agendado_por = getUsuarioLogado()?.id || null;
    p.inst_agendado_em  = Date.now();
    if (!p.inst_historico) p.inst_historico = [];
    _agdRegistrar(p.inst_historico, 'agendado', { para: { data: v.data, hora: v.hora }, prof: nomeInstalador(p) });

    _instLimparForm();
    _instAtualizar();
    toast(`Instalação do pedido #${formatPedidoId(p.id)} agendada!`, 'success');
}

function renderAgenda() {
    if (!document.getElementById('inst-pend-lista')) return;
    _instRenderProntos();
    const hoje = _agdHoje();
    const pend = db.pedidos.filter(_instPendente);
    const real = db.pedidos.filter(_instRealizada);
    const filtra = (lista, chave) => {
        const b = _agdNorm(_agdBusca[chave]);
        if (!b) return lista;
        const dig = b.replace(/\D/g, '');
        return lista.filter(p => _agdNorm(p.clienteNome).includes(b) || (dig && String(p.id).includes(dig)));
    };
    const linha = (p, realizado) => {
        const cli = db.clientes.find(c => c.id == p.clienteId);
        return _agdLinha({
            onclick: `abrirDetalheInstalacao(${p.id})`,
            nome: p.clienteNome,
            sub:  `Pedido #${formatPedidoId(p.id)}${p.amb ? ' · ' + p.amb : ''}${nomeInstalador(p) ? ' · ' + nomeInstalador(p) : ''}`,
            tel:  cli?.tel,
            end:  p.inst_endereco || cli?.end,
            data: realizado ? _instDiaRealizado(p) : p.data_entrega,
            hora: p.inst_hora,
            pill: _instPill(p, hoje),
        });
    };
    const pendF = filtra(pend, 'instPend').sort((a, b) =>
        _agdCmp(_agdChave(a.data_entrega, a.inst_hora), _agdChave(b.data_entrega, b.inst_hora)));
    const realF = filtra(real, 'instReal').sort((a, b) =>
        (b.inst_confirmada_em || b.data_instalado || 0) - (a.inst_confirmada_em || a.data_instalado || 0)
        || _agdCmp(_agdChave(b.data_entrega, b.inst_hora), _agdChave(a.data_entrega, a.inst_hora)));
    _agdPreencher('inst-pend', pendF.map(p => linha(p, false)), pend.length, 'Nenhuma instalação agendada. Selecione um pedido pronto acima para agendar.', _agdBusca.instPend, ['agendamento', 'agendamentos']);
    _agdPreencher('inst-real', realF.map(p => linha(p, true)), real.length, 'Nenhuma instalação realizada ainda.', _agdBusca.instReal);
    _instAtualizarDisp();
}

function abrirDetalheInstalacao(id) {
    const p = db.pedidos.find(x => x.id == id);
    if (!p) return;
    const cli   = db.clientes.find(c => c.id == p.clienteId);
    const pend  = _instPendente(p);
    const pagto = statusPagamento(p);
    const tel   = cli?.tel
        ? `<a href="https://wa.me/55${cli.tel.replace(/\D/g, '')}" target="_blank" rel="noopener">${escapeHtml(cli.tel)}</a>`
        : '—';
    const corpo = `<div class="agd-det-topo">${_agdPill(_instPill(p, _agdHoje()))}</div>` + _agdCampos([
        ['Pedido',      '#' + formatPedidoId(p.id)],
        ['Cliente',     escapeHtml(p.clienteNome || '—')],
        ['Telefone',    tel],
        ['Endereço',    escapeHtml(p.inst_endereco || cli?.end || '—')],
        ['Data',        _agdFmtData(p.data_entrega)],
        ['Horário',     escapeHtml(p.inst_hora ? _agdPeriodo(p.inst_hora, _instDur(p)) : '—')],
        ['Duração',     escapeHtml(_agdFmtDur(_instDur(p)))],
        ['Instalador',  escapeHtml(nomeInstalador(p) || 'A definir')],
        p.inst_agendado_por ? ['Agendado por', escapeHtml(nomeUsuario(p.inst_agendado_por))] : null,
        p.vendedor_nome ? ['Vendedor', escapeHtml(p.vendedor_nome)] : null,
        ['Ambientes',   escapeHtml(p.amb || '—')],
        ['Valor',       'R$ ' + (p.valor || 0).toFixed(2)],
        ['Pagamento',   escapeHtml(pagto.label || '—')],
        ['Observações', escapeHtml(p.inst_obs || '—')],
        p.inst_confirmada_em ? ['Confirmada em', _agdFmtMomento(p.inst_confirmada_em)] : null,
        p.data_instalado ? ['Instalado em', _agdFmtMomento(p.data_instalado)] : null,
    ]) + _agdHistorico(p.inst_historico);
    const rodape = pend
        ? `<button class="btn btn-outline btn-sm btn-danger" onclick="cancelarAgendamentoInstalacao(${p.id})">✕ Cancelar agendamento</button>
           <button class="btn btn-outline btn-sm" onclick="fecharModalAgenda();abrirOS(${p.id})">📋 OS</button>
           <button class="btn btn-outline btn-sm" onclick="editarInstalacao(${p.id})">✏️ Editar</button>
           <button class="btn btn-outline btn-sm" onclick="reagendarInstalacao(${p.id})">📅 Reagendar</button>
           <button class="btn btn-success btn-sm" onclick="confirmarInstalacao(${p.id})">✓ Confirmar instalação</button>`
        : `<button class="btn btn-outline btn-sm" onclick="fecharModalAgenda();abrirOS(${p.id})">📋 OS</button>`;
    _agdAbrirModal('Instalação', corpo, rodape);
}

// A data da instalacao e a do pedido: mudar exige confirmacao, como antes.
async function _instConfirmarNovaData(p, novaData) {
    if (!p.data_entrega || novaData === p.data_entrega) return true;
    return showConfirm(
        `Alterar a data de instalação do pedido #${formatPedidoId(p.id)}?\n\nData atual: ${_agdFmtData(p.data_entrega)}\nNova data:  ${_agdFmtData(novaData)}\n\nA alteração reflete no pedido.`,
        '📅', 'Confirmar', 'Cancelar');
}

function _instDispOpts(id) { return { disp: { tipo: 'inst', ignorar: { tipo: 'inst', id } } }; }

// Grava a edicao/reagendamento: o pedido e relido depois da validacao da agenda.
async function _instGravarEdicao(id, v, titulo) {
    const p = db.pedidos.find(x => x.id == id);
    if (!p || !_instPendente(p)) { await showAlert('Esta instalação não está mais agendada.', '⚠️'); fecharModalAgenda(); _agdRedesenharAgendas(); return; }
    if (!await _instConfirmarNovaData(p, v.data)) return false;
    if (v.data !== p.data_entrega || v.hora !== (p.inst_hora || '')) {
        if (!p.inst_historico) p.inst_historico = [];
        _agdRegistrar(p.inst_historico, 'reagendado', { de: { data: p.data_entrega || '', hora: p.inst_hora || '' }, para: { data: v.data, hora: v.hora } });
    }
    if (v.end !== undefined) p.inst_endereco = v.end;
    p.data_entrega = v.data;
    p.inst_hora    = v.hora;
    p.inst_duracao = v.dur || _agdDurPadrao('inst');
    p.inst_obs     = v.obs;
    definirInstalador(p, v.usu.pessoa);
    _instAtualizar();
    toast(titulo, 'success');
    abrirDetalheInstalacao(id);
}

function editarInstalacao(id) {
    const p = db.pedidos.find(x => x.id == id);
    if (!p) return;
    const cli = db.clientes.find(c => c.id == p.clienteId);
    _agdFormulario('Editar instalação', [
        { id: 'end',  label: 'Endereço da instalação', tipo: 'text', valor: p.inst_endereco, largo: true, placeholder: cli?.end || 'Endereço da instalação…' },
        { id: 'usu',  label: 'Profissional', tipo: 'profissional', valor: _instProf(p), obrig: true, vazio: 'Selecione' },
        { id: 'dur',  label: 'Duração do serviço', tipo: 'duracao', valor: p.inst_duracao },
        { id: 'data', label: 'Data de instalação', tipo: 'date', valor: p.data_entrega, obrig: true },
        { id: 'hora', label: 'Horário', tipo: 'time', valor: p.inst_hora, obrig: true },
        { id: 'obs',  label: 'Observações', tipo: 'textarea', valor: p.inst_obs, largo: true },
    ], v => _instGravarEdicao(id, v, 'Instalação atualizada!'), () => abrirDetalheInstalacao(id), _instDispOpts(id));
}

function reagendarInstalacao(id) {
    const p = db.pedidos.find(x => x.id == id);
    if (!p) return;
    _agdFormulario('Reagendar instalação', [
        { id: 'usu',  label: 'Profissional', tipo: 'profissional', valor: _instProf(p), obrig: true, vazio: 'Selecione' },
        { id: 'dur',  label: 'Duração do serviço', tipo: 'duracao', valor: p.inst_duracao },
        { id: 'data', label: 'Nova data', tipo: 'date', valor: p.data_entrega, obrig: true },
        { id: 'hora', label: 'Horário', tipo: 'time', valor: p.inst_hora, obrig: true },
        { id: 'obs',  label: 'Observações', tipo: 'textarea', valor: p.inst_obs, largo: true },
    ], v => _instGravarEdicao(id, v, 'Instalação reagendada!'), () => abrirDetalheInstalacao(id), _instDispOpts(id));
}

// Cancela o agendamento: o horario do profissional fica livre e o pedido volta
// para os cards "Pedidos Prontos para Instalacao", pronto para ser agendado de
// novo. O que havia fica no historico.
async function cancelarAgendamentoInstalacao(id) {
    const p = db.pedidos.find(x => x.id == id);
    if (!p || !_instPendente(p)) return;
    fecharModalAgenda();
    const ok = await showConfirm(`Cancelar a instalação do pedido #${formatPedidoId(p.id)}${p.data_entrega ? ' em ' + _agdFmtData(p.data_entrega) : ''}?\n\nO horário do profissional fica livre e o pedido volta para "Pedidos Prontos para Instalação".`, '⚠️', 'Sim, cancelar', 'Voltar');
    if (!ok) { abrirDetalheInstalacao(id); return; }
    if (!p.inst_historico) p.inst_historico = [];
    _agdRegistrar(p.inst_historico, 'cancelado', { de: { data: p.data_entrega || '', hora: p.inst_hora || '' } });
    p.inst_agendado = false;
    p.data_entrega  = null;
    p.inst_hora     = '';
    _instAtualizar();
    toast('Agendamento cancelado. O pedido voltou para os prontos.', 'info');
}

// Mesmo desfecho do Kanban: pago -> Instalado; com saldo -> Aguardando
// Pagamento. Nos dois casos a instalacao foi feita: vai para Realizados.
function confirmarInstalacao(id) {
    const p = db.pedidos.find(x => x.id == id);
    if (!p || !_instPendente(p)) return;
    fecharModalAgenda();
    mostrarModalPagamento(p, resultado => {
        if (!resultado) { abrirDetalheInstalacao(id); return; }
        aplicarConfirmacaoEntrega(p, resultado);
        _instAtualizar();
        toast(resultado === 'pago' ? 'Instalação confirmada!' : 'Instalação confirmada. Pedido em Aguardando Pagamento.', resultado === 'pago' ? 'success' : 'info');
    });
}

// --- PCP VIEW TOGGLE ---
let _prevViewPCP = null, _curViewPCP = 'kanban';
function mostrarViewPCP(view) {
    if (_curViewPCP !== view) { _prevViewPCP = _curViewPCP; _curViewPCP = view; }
    document.getElementById('pcp-view-kanban').style.display   = view === 'kanban'   ? '' : 'none';
    document.getElementById('pcp-view-agenda').style.display   = view === 'agenda'   ? '' : 'none';
    document.getElementById('pcp-view-medicoes').style.display = view === 'medicoes' ? '' : 'none';
    document.getElementById('tab-btn-kanban').className   = 'tab-btn' + (view === 'kanban'   ? ' active' : '');
    document.getElementById('tab-btn-agenda').className   = 'tab-btn' + (view === 'agenda'   ? ' active' : '');
    document.getElementById('tab-btn-medicoes').className = 'tab-btn' + (view === 'medicoes' ? ' active' : '');
    if (view === 'kanban')   renderKanban();
    if (view === 'agenda' || view === 'medicoes') _agdAtualizarListaProf();
    if (view === 'agenda')   renderAgenda();
    if (view === 'medicoes') renderMedicoes();
    _tabBackBtn('.tab-nav', _prevViewPCP, () => mostrarViewPCP(_prevViewPCP));
}

// --- TEMA CLARO / ESCURO ---
function toggleTema() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const novo = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    localStorage.setItem('sc_tema', novo);
    atualizarIconeTema();
}
function carregarTema() {
    const tema = localStorage.getItem('sc_tema') || 'light';
    document.documentElement.setAttribute('data-theme', tema);
    atualizarIconeTema();
}
function atualizarIconeTema() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const ic = document.getElementById('tema-icone');
    const sw = document.getElementById('tema-switch');
    if (ic) ic.textContent = isDark ? '☀️' : '🌙';
    if (sw) sw.classList.toggle('active', isDark);
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('login-usuario')) {
        checkAuth();
        carregarTema();
        renderDashboardsButton();
        renderMenuExtrasEstoque();
        renderBellIndicator();
        const popupUserEl = document.getElementById('popup-user-name');
        if (popupUserEl) {
            const u = JSON.parse(sessionStorage.getItem('sc_user') || '{}');
            popupUserEl.textContent = u.nome || u.email || '—';
        }
        initPageNavigation();
    }

    // Pending toast from previous action
    const pt = sessionStorage.getItem('sc_pending_toast');
    if (pt) { try { const { msg, tipo } = JSON.parse(pt); sessionStorage.removeItem('sc_pending_toast'); setTimeout(() => toast(msg, tipo), 200); } catch {} }

    if (document.getElementById('tb-pedidos')) {
        localStorage.removeItem('sc_editando_id');
        const arquivoAtual = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        const telaFiltro = arquivoAtual === 'pedidos.html' ? 'pedidos' : 'painel_acompanhamento';
        inicializarFiltroVendedorTela(telaFiltro);
        renderDashboard();
    }

    if (document.getElementById('tb-catalogo')) {
        const catFornSel = document.getElementById('cat-fornecedor');
        if (catFornSel) catFornSel.innerHTML = '<option value="">— Sem fornecedor —</option>' +
            db.fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        renderCatalogoTecidos();
    }

    if (document.getElementById('tb-clientes')) {
        if (!temAcesso('clientes', 'completo')) document.getElementById('cli-form-card')?.style.setProperty('display', 'none');
        renderTabelaClientes(db.clientes);
    }

    // Formulário de Pedido
    if (document.getElementById('ped-cliente')) {
        if (!temAcesso('pedidos', 'completo')) {
            toastReload('Você não tem permissão para criar ou editar pedidos.', 'info');
            window.location.replace('pedidos.html');
            return;
        }
        filtrarClientes();

        const vendSel = document.getElementById('ped-vendedor');
        if (vendSel) vendSel.innerHTML = '<option value="">— Sem vendedor —</option>' + opcoesCadastroPedido('vendedor');
        const arqSel = document.getElementById('ped-arquiteto');
        if (arqSel) arqSel.innerHTML = '<option value="">— Sem arquiteto —</option>' + opcoesCadastroPedido('arquiteto');

        const kitSel = document.getElementById('ped-kit');
        // Kit pronto aparece com medida e preço; kit de montagem, só o nome.
        if (kitSel) kitSel.innerHTML = '<option value="">— Selecione um kit —</option>' +
            db.kits.map(k => {
                const extra = ehKitPronto(k)
                    ? `${k.medida ? ' · ' + k.medida : ''} · R$ ${(k.preco || 0).toFixed(2)}`
                    : ' (montagem)';
                return `<option value="${k.id}">${escapeHtml(k.nome)}${escapeHtml(extra)}</option>`;
            }).join('');

        const matSel = document.getElementById('ped-item-mat');
        if (matSel) matSel.innerHTML = '<option value="">— Selecione o material —</option>' +
            db.materiais.map(m=>`<option value="${m.id}">${m.nome} (${m.unidade}) · estoque: ${(m.estoque_atual||0).toFixed(1)}</option>`).join('');

        preencherSelectFormaPagamento();   // pedido novo: a primeira da lista
        const idParaEditar = localStorage.getItem('sc_editando_id');
        if (idParaEditar) {
            editandoIdPedido = parseInt(idParaEditar);
            document.getElementById('titulo-pagina-pedido').innerText = `Editando Pedido #${formatPedidoId(editandoIdPedido)}`;
            carregarPedidoParaEdicao(editandoIdPedido);
            bloquearPedidoInstalado();
        } else {
            adicionarAmbiente();
            renderItensPedido();
            aplicarDescontoDaFormaPagamento();   // desconto da forma que vem marcada
            // Pré-preenche cliente quando vindo de "Criar Pedido" na medição
            const prePed = localStorage.getItem('sc_novo_pedido_pre');
            if (prePed) {
                localStorage.removeItem('sc_novo_pedido_pre');
                try {
                    const d = JSON.parse(prePed);
                    pedidoMedicaoId = d.medicaoId || null;
                    if (d.clienteId || d.clienteNome) {
                        const buscaEl = document.getElementById('ped-cliente-busca');
                        if (buscaEl && d.clienteNome) buscaEl.value = d.clienteNome;
                        filtrarClientes();
                        const sel = document.getElementById('ped-cliente');
                        if (sel && d.clienteId) sel.value = String(d.clienteId);
                    }
                } catch(e) {}
            }
        }
    }

    // Estoque (aba de tecidos)
    if (document.getElementById('tb-estoque')) {
        // O campo de tecido e' de busca: a lista sai de db.catalogo na hora de
        // digitar, entao nao ha <option> para montar aqui.
        const dataEl = document.getElementById('est-data');
        if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
        renderEstoque();
        const _savedEstTab = sessionStorage.getItem('sc_restore_tab_estoque');
        if (_savedEstTab) {
            sessionStorage.removeItem('sc_restore_tab_estoque');
            setTimeout(() => mostrarTabEstoque(_savedEstTab), 0);
        }
        window.addEventListener('beforeunload', () => {
            sessionStorage.setItem('sc_restore_tab_estoque', _curTabEstoque);
        });
    }

    // Estoque (aba de entrada de materiais)
    if (document.getElementById('tb-estoque-mat')) {
        const dataEl = document.getElementById('est-mat-data');
        if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
        renderEstoqueMateriais();
    }

    // Catálogo (aba de materiais)
    if (document.getElementById('tb-materiais')) {
        const matFornSel = document.getElementById('mat-fornecedor');
        if (matFornSel) matFornSel.innerHTML = '<option value="">— Sem fornecedor —</option>' +
            db.fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        renderMateriais();
    }

    // Aba de kits — existe no Estoque (montagem) e no Catálogo (kit pronto)
    if (document.getElementById('tb-kits')) {
        const matSel = document.getElementById('kit-item-mat');
        if (matSel) matSel.innerHTML = '<option value="">— Selecione o material —</option>' +
            db.materiais.map(m=>`<option value="${m.id}">${m.nome} (${m.unidade})</option>`).join('');
        renderKitDraftItens();
        renderKits();
        renderCfgKitPronto();
    }

    // Cartões de margem e estoque do cadastro de tecido e de material
    if (document.getElementById('cat-cfg')) renderCartoesConfig('cat');
    if (document.getElementById('mat-cfg')) renderCartoesConfig('mat');

    if (document.getElementById('tb-historico')) renderHistorico();

    if (document.getElementById('proposta-container')) renderProposta();
    if (document.getElementById('kanban-board')) {
        const kfVend = document.getElementById('kf-vendedor');
        if (kfVend) kfVend.innerHTML = '<option value="">Todos</option>' +
            db.vendedores.map(v => `<option value="${escapeHtml(v.nome)}">${escapeHtml(v.nome)}</option>`).join('');
        const kfTec = document.getElementById('kf-tecido');
        if (kfTec) kfTec.innerHTML = '<option value="">Todos</option>' +
            db.catalogo.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
        renderKanban();
    }
    if (document.getElementById('os-container'))       renderOS();
    if (document.getElementById('agenda-container')) {
        _instLimparForm();
        renderAgenda();
    }
    if (document.getElementById('tb-rel-fat'))         renderRelatorios();

    // Medições
    if (document.getElementById('medicoes-container')) {
        const sel = document.getElementById('med-cliente-id');
        if (sel) sel.innerHTML = '<option value="">— Selecione —</option>' +
            db.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
        const dataEl = document.getElementById('med-data');
        if (dataEl) dataEl.value = _agdHoje();
        _agdPreencherProf('med-prof', '', '— A definir —');
        _agdPreencherDur('med-dur', 'med');
        renderMedicoes();
        const params  = new URLSearchParams(window.location.search);
        const urlView = params.get('view');
        if (urlView) mostrarViewPCP(urlView);
        // Vindo de outra tela com ?pedido=: o pedido ja chega selecionado.
        if (urlView === 'agenda' && params.get('pedido')) irParaAgendaInstalacao(params.get('pedido'));

        // Outra aba/usuario mexeu nas agendas: a disponibilidade se atualiza aqui.
        window.addEventListener('storage', e => {
            if (e.key === 'sc_usr' || e.key === 'sc_pap') { _agdAtualizarListaProf(); _agdRedesenharAgendas(); return; }
            if (e.key !== 'sc_ped' && e.key !== 'sc_med' && e.key !== 'sc_agd_cfg') return;
            _agdRecarregar();
            _agdRedesenharAgendas();
            if (document.getElementById('kanban-board')) renderKanban();
        });
    }

    if (document.getElementById('tb-vendedores')) {
        preencherSelectUsuarios('vend-usuario', '— Sem conta de acesso —');
        const url = new URLSearchParams(window.location.search);
        const aba = url.get('aba');
        if (['lista', 'pendentes', 'historico'].includes(aba)) _curTabVend = aba;
        mostrarTipoVendedores(url.get('tipo') === 'arquiteto' ? 'arquiteto' : 'vendedor');
    }

    if (document.getElementById('tb-usuarios')) mostrarTabConfig('usuarios');

    if (document.getElementById('tb-fornecedores')) {
        const pcFornSel = document.getElementById('pc-fornecedor');
        if (pcFornSel) pcFornSel.innerHTML = _pcOpcoesFornecedorHTML(db.fornecedores);
        const filtroFornEl = document.getElementById('filtro-pc-forn');
        if (filtroFornEl) filtroFornEl.innerHTML = '<option value="">Todos os fornecedores</option>' +
            db.fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
        const urlTab = new URLSearchParams(window.location.search).get('tab');

        // Fila de "um pedido por fornecedor": cada recarga carrega o próximo.
        const fila = lerFilaPC();
        if (fila && !localStorage.getItem('sc_pc_prefill')) {
            const g = fila.restantes[0];
            localStorage.setItem('sc_pc_prefill', JSON.stringify(g.itens));
            localStorage.setItem('sc_pc_prefill_forn', String(g.fornecedor_id || 0));
        }

        const prefillItem = localStorage.getItem('sc_pc_prefill');
        if (urlTab === 'novo' || prefillItem) {
            mostrarTabFornecedores('novo');
            if (prefillItem) {
                try {
                    const bruto = JSON.parse(prefillItem);
                    // Formato antigo: um item só, fora de lista.
                    const itens = Array.isArray(bruto) ? bruto : [bruto];
                    pcDraftItens = itens.map(({ fornecedor_id, fornecedor_nome, ...i }) => {
                        const quantidade = i.quantidade || 1;
                        return { ...i, quantidade, subtotal: quantidade * (i.preco_unit || 0) };
                    });
                    renderItensPCDraft();
                    const tipoSel = document.getElementById('pc-item-tipo');
                    if (tipoSel && itens[0]) { tipoSel.value = itens[0].tipo; atualizarSelectItemPC(); }
                } catch {}
                localStorage.removeItem('sc_pc_prefill');
            }
            const prefillForn = localStorage.getItem('sc_pc_prefill_forn');
            if (prefillForn !== null && pcFornSel) { pcFornSel.value = prefillForn; localStorage.removeItem('sc_pc_prefill_forn'); }
            renderBannerFilaPC();
        } else {
            mostrarTabFornecedores(urlTab === 'pedidos' ? 'pedidos' : 'lista');
        }
    }

    if (document.getElementById('pedido-compra-container')) renderPedidoCompraDoc();

    if (document.getElementById('fin-kpis')) {
        atualizarStatusVencimentos();
        const abasVisiveis = Object.entries(FIN_TAB_MODULO).filter(([, modulo]) => temAcesso(modulo, 'visualizar'));
        Object.keys(FIN_TAB_MODULO).forEach(tab => {
            const visivel = abasVisiveis.some(([t]) => t === tab);
            document.querySelector(`.fin-tab-btn[data-tab="${tab}"]`)?.style.setProperty('display', visivel ? '' : 'none');
        });
        const abaInicial = abasVisiveis.some(([t]) => t === 'dashboard') ? 'dashboard' : (abasVisiveis[0]?.[0] || 'dashboard');
        mostrarTabFinanceiro(abaInicial);
        if (!temAcesso('financeiro.pagar', 'completo')) document.getElementById('cp-toolbar')?.style.setProperty('display', 'none');
        if (!temAcesso('financeiro.fixas', 'completo')) document.getElementById('df-form-card')?.style.setProperty('display', 'none');
    }
});

// =============================================
// CATÁLOGO — TABS
// =============================================

function mostrarTabCatalogo(tab) {
    if (_curTabCatalogo !== tab) { _prevTabCatalogo = _curTabCatalogo; _curTabCatalogo = tab; }
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-cat-' + tab)?.classList.add('active');
    document.querySelector(`.tab-btn[data-tab="cat-${tab}"]`)?.classList.add('active');
    if (tab === 'materiais') renderMateriais();
    if (tab === 'kits') renderKits();
    _tabBackBtn('.tab-nav', _prevTabCatalogo, () => mostrarTabCatalogo(_prevTabCatalogo));
}

// =============================================
// ESTOQUE — ENTRADA DE MATERIAL
// =============================================

function autoFillEntradaMaterialPorRef() {
    const ref = document.getElementById('est-mat-ref')?.value.trim();
    if (!ref || ref.length < 2) return;
    const mat = db.materiais.find(m => m.referencia && m.referencia.toLowerCase() === ref.toLowerCase());
    if (!mat) return;
    if (!document.getElementById('est-mat-id')) return;
    buscaDefinir('est-mat-id', mat.id);
    autoFillEntradaMaterialById();
}

function calcularPrecoVendaMat() { _calcularPrecoVenda('est-mat-preco-custo', 'est-mat-markup', 'est-mat-preco-venda-display'); }

async function salvarEntradaMaterial() {
    const matId  = parseInt(document.getElementById('est-mat-id')?.value);
    const qtd    = parseFloat(document.getElementById('est-mat-qtd')?.value);
    const data   = document.getElementById('est-mat-data')?.value;
    const custo  = parseFloat(document.getElementById('est-mat-preco-custo')?.value) || 0;
    const markup = parseFloat(document.getElementById('est-mat-markup')?.value) || 0;
    if (!matId) { await showAlert('Escolha o material na lista de sugestões.', '⚠️'); return; }
    if (!qtd || qtd <= 0) { await showAlert('Informe uma quantidade válida.', '⚠️'); return; }
    const mat = db.materiais.find(m => m.id === matId);
    if (!mat) return;
    const precoVendaMatConf = custo > 0 ? (custo * (1 + markup / 100)).toFixed(2) : null;
    const linhaPrecoMat = custo > 0 ? `\nCusto: R$ ${custo.toFixed(2)}  →  Venda: R$ ${precoVendaMatConf}` : '';
    if (!await showConfirm(`Confirmar entrada de material?\n\nMaterial: ${mat.nome}\nQuantidade: ${qtd} ${mat.unidade}${linhaPrecoMat}`, '📦', 'Confirmar Entrada', 'Cancelar')) return;
    mat.estoque_atual = Math.round(((mat.estoque_atual || 0) + qtd) * 1000) / 1000;
    if (custo > 0) {
        mat.preco_custo = custo;
        mat.preco = Math.round(custo * (1 + markup / 100) * 100) / 100;
    }
    const refData = data ? `Entrada ${new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')}` : 'Entrada manual';
    registrarMovimento('Entrada', mat.nome, 'material', qtd, mat.unidade, refData);
    salvarERecarregar('Entrada de material registrada!');
}

// ─── CONSULTA DE ESTOQUE ─────────────────────────────────────────────────────
// Lista compacta de consulta rapida: uma linha por produto, com os detalhes
// (fornecedor, custo, minimo e os rolos do tecido) escondidos ate o clique.

// Qual linha esta expandida agora. So uma por vez.
let _consultaAberto = null;

function _consultaMoeda(v) {
    return v != null && v > 0
        ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';
}

function _consultaNum(v, casas) {
    return Number(v || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: casas === undefined ? 2 : casas,
        maximumFractionDigits: casas === undefined ? 2 : casas
    });
}

// Busca tolerante: ignora caixa e acento, para "trico" achar "TRICÔ".
function _consultaNormaliza(s) {
    return String(s === null || s === undefined ? '' : s)
        .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Monta a lista unificada de tecidos e materiais no mesmo formato, para a
// tela nao precisar saber de qual dos dois cadastros veio cada linha.
function _consultaItens() {
    const itens = [];

    (db.catalogo || []).forEach(tec => {
        const rolos = (db.estoque || []).filter(r => r.tecido_id == tec.id);
        const disponivel = rolos.reduce((s, r) => s + (r.metragem_atual || 0), 0);
        const ultimo = rolos.filter(r => r.data_entrada)
            .sort((a, b) => b.data_entrada.localeCompare(a.data_entrada))[0];
        itens.push({
            tipo: 'tecido',
            id: tec.id,
            unidade: 'm',
            codigo: tec.referencia || '',
            nome: tec.nome || '',
            precoTxt: tec.preco > 0 ? _consultaMoeda(tec.preco) + '/m' : '—',
            estoqueTxt: temEstoqueInfinito(tec) ? '∞' : _consultaNum(disponivel) + ' m',
            abaixoMin: !temEstoqueInfinito(tec) && tec.min_estoque > 0 && disponivel < tec.min_estoque,
            ultimaEntrada: ultimo ? new Date(ultimo.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
            registro: tec,
            rolos
        });
    });

    (db.materiais || []).forEach(mat => {
        const entradas = (db.movimentos || []).filter(mv =>
            mv.tipo === 'Entrada' && mv.item_tipo === 'material' && mv.item_nome === mat.nome);
        const ultimo = entradas.length ? entradas.sort((a, b) => b.data - a.data)[0] : null;
        itens.push({
            tipo: 'material',
            id: mat.id,
            unidade: mat.unidade || 'un',
            codigo: mat.referencia || '',
            nome: mat.nome || '',
            precoTxt: mat.preco > 0 ? _consultaMoeda(mat.preco) : '—',
            estoqueTxt: temEstoqueInfinito(mat) ? '∞' : _consultaNum(mat.estoque_atual) + ' ' + (mat.unidade || ''),
            abaixoMin: !temEstoqueInfinito(mat) && mat.min_estoque > 0 && (mat.estoque_atual || 0) < mat.min_estoque,
            ultimaEntrada: ultimo ? new Date(ultimo.data).toLocaleDateString('pt-BR') : '—',
            registro: mat,
            rolos: null
        });
    });

    (db.kits || []).forEach(kit => {
        // Ultima entrada vem do historico de movimentos, igual ao material.
        // Kit de montagem nao tem preco nem saldo proprios: ele e explodido
        // nos materiais no pedido, entao esses campos ficam em branco.
        const entradas = (db.movimentos || []).filter(mv =>
            mv.tipo === 'Entrada' && mv.item_tipo === 'kit' && mv.item_nome === kit.nome);
        const ultimo = entradas.length ? entradas.sort((a, b) => b.data - a.data)[0] : null;
        const pronto = ehKitPronto(kit);
        itens.push({
            tipo: 'kit',
            id: kit.id,
            unidade: 'un',
            codigo: kit.referencia || '',
            nome: kit.nome || '',
            precoTxt: pronto && kit.preco > 0 ? _consultaMoeda(kit.preco) : '—',
            estoqueTxt: temEstoqueInfinito(kit) ? '∞'
                : (pronto ? _consultaNum(kit.estoque_atual) + ' un' : '—'),
            abaixoMin: false,
            ultimaEntrada: ultimo ? new Date(ultimo.data).toLocaleDateString('pt-BR') : '—',
            registro: kit,
            rolos: null
        });
    });

    // Ordem por codigo, com comparacao numerica para 0002 vir antes de 0010.
    return itens.sort((a, b) =>
        String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true, sensitivity: 'base' })
        || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

// Aplica os tres filtros juntos: codigo E nome E tipo.
function _consultaFiltrar(itens) {
    const codigo = _consultaNormaliza(document.getElementById('consulta-codigo')?.value);
    const nome   = _consultaNormaliza(document.getElementById('consulta-busca')?.value);
    const tipo   = document.getElementById('consulta-tipo')?.value || '';
    return itens.filter(i =>
        (!tipo   || i.tipo === tipo) &&
        (!codigo || _consultaNormaliza(i.codigo).includes(codigo)) &&
        (!nome   || _consultaNormaliza(i.nome).includes(nome)));
}

function _consultaChave(item) { return item.tipo + '-' + item.id; }

function _consultaDetalheHTML(item) {
    const r = item.registro;
    const campo = (rotulo, valor) =>
        `<div class="consulta-info-item"><span class="consulta-info-label">${rotulo}</span><span>${valor}</span></div>`;

    // O preco de custo NAO aparece aqui — a consulta e de venda e de saldo.
    // O valor continua gravado no registro e visivel nas telas de cadastro.
    let campos = campo('Fornecedor', escapeHtml(r.fornecedor_nome || '—'));

    if (item.tipo === 'kit') {
        campos += campo('Tipo de kit', ehKitPronto(r) ? 'Kit pronto' : 'Kit de montagem');
        campos += campo('Medida', escapeHtml(r.medida || '—'));
        if (r.descricao) campos += campo('Descrição', escapeHtml(r.descricao));
        if (!ehKitPronto(r)) {
            const comp = (r.itens || []).map(i => `${escapeHtml(i.nome)}: ${i.quantidade} ${i.unidade}`).join(' · ');
            campos += campo('Composição', comp || '—');
        }
    } else if (item.tipo === 'tecido') {
        campos += campo('Estoque mínimo', textoMinimo(r, 'm'));
        campos += campo('Largura do rolo', r.largura_rolo ? _consultaNum(r.largura_rolo) + ' m' : '—');
    } else {
        campos += campo('Estoque mínimo', textoMinimo(r, r.unidade));
        campos += campo('Unidade', escapeHtml(r.unidade || '—'));
    }

    let rolosHtml = '';
    if (item.tipo === 'tecido') {
        rolosHtml = item.rolos.length ? `
        <table>
            <thead><tr>
                <th>Código</th><th>Metragem inicial</th>
                <th>Disponível</th><th>Data de entrada</th><th>Status</th>
            </tr></thead>
            <tbody>${item.rolos.map(ro => {
                const pct = ro.metragem_inicial > 0 ? Math.round((ro.metragem_atual / ro.metragem_inicial) * 100) : 0;
                const cor = pct > 40 ? 'var(--primary)' : pct > 15 ? 'var(--kpi-yellow)' : 'var(--danger)';
                const status = ro.metragem_atual <= 0
                    ? '<span class="badge-esgotado">Esgotado</span>'
                    : `<span style="color:${cor};font-weight:600">${pct}% restante</span>`;
                return `<tr>
                    <td>${escapeHtml(ro.lote || '—')}</td>
                    <td>${_consultaNum(ro.metragem_inicial)} m</td>
                    <td><strong>${_consultaNum(ro.metragem_atual, 3)} m</strong></td>
                    <td>${ro.data_entrada ? new Date(ro.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td>${status}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`
            : '<p style="font-size:12px;color:var(--muted);margin-top:12px">Nenhum rolo em estoque.</p>';
    }

    return `<div class="consulta-detalhe">
        <div class="consulta-detalhe-grid">${campos}</div>
        ${rolosHtml}
    </div>`;
}

function renderConsultaEstoque() {
    const container = document.getElementById('consulta-resultados');
    if (!container) return;

    const itens = _consultaFiltrar(_consultaItens());

    if (!itens.length) {
        container.innerHTML = `<div class="consulta-lista"><div class="consulta-vazio">
            Nenhum item encontrado com esses filtros.
        </div></div>`;
        return;
    }

    const linhas = itens.map(item => {
        const chave = _consultaChave(item);
        const aberto = _consultaAberto === chave;
        const tag = item.tipo === 'tecido' ? '<span class="consulta-tag tec">TEC</span>'
            : item.tipo === 'kit' ? '<span class="consulta-tag kit">KIT</span>'
            : '<span class="consulta-tag mat">MAT</span>';
        return `<div class="consulta-linha ${aberto ? 'aberta' : ''}" onclick="toggleConsultaDetalhe('${chave}')">
                <span class="consulta-cod">${escapeHtml(item.codigo || '—')}</span>
                <span class="consulta-nome">${tag}${escapeHtml(item.nome)}</span>
                <span class="consulta-un">${escapeHtml(item.unidade || '—')}</span>
                <span class="consulta-preco">${item.precoTxt}</span>
                <span class="consulta-qtd ${item.abaixoMin ? 'baixo' : ''}">${item.estoqueTxt}${item.abaixoMin ? ' ⚠' : ''}</span>
                <span class="consulta-data">${item.ultimaEntrada}</span>
                <span class="consulta-seta">${aberto ? '▲' : '▼'}</span>
            </div>
            ${aberto ? _consultaDetalheHTML(item) : ''}`;
    }).join('');

    container.innerHTML = `<div class="consulta-lista">
        <div class="consulta-cab">
            <span>Código</span><span>Nome</span><span>Unidade</span><span>Preço de venda</span>
            <span>Estoque</span><span>Última entrada</span><span></span>
        </div>
        ${linhas}
    </div>
    <p style="font-size:12px;color:var(--muted);margin:10px 2px">${itens.length} item(ns). Clique numa linha para ver fornecedor e detalhes.</p>`;
}

function toggleConsultaDetalhe(chave) {
    _consultaAberto = _consultaAberto === chave ? null : chave;
    renderConsultaEstoque();
}

// ── Vinculo entre os campos Codigo e Nome ───────────────────────────────────
// Digitar em um deles sugere os itens correspondentes; escolher uma sugestao
// preenche os dois. Enquanto o usuario nao escolhe, nada e preenchido sozinho:
// preencher no meio da digitacao faria os dois filtros brigarem entre si.

function consultaFiltroMudou(campo) {
    consultaSugerir(campo);
    renderConsultaEstoque();
}

function consultaSugerir(campo) {
    const idCampo = campo === 'codigo' ? 'consulta-codigo' : 'consulta-busca';
    const caixa = document.getElementById(campo === 'codigo' ? 'consulta-sug-codigo' : 'consulta-sug-nome');
    if (!caixa) return;

    const termo = _consultaNormaliza(document.getElementById(idCampo)?.value);
    _consultaFecharSugestoes(campo === 'codigo' ? 'nome' : 'codigo');

    if (!termo) { caixa.classList.remove('aberta'); caixa.innerHTML = ''; return; }

    const tipo = document.getElementById('consulta-tipo')?.value || '';
    const achados = _consultaItens().filter(i =>
        (!tipo || i.tipo === tipo) &&
        _consultaNormaliza(campo === 'codigo' ? i.codigo : i.nome).includes(termo)
    ).slice(0, 12);

    if (!achados.length) { caixa.classList.remove('aberta'); caixa.innerHTML = ''; return; }

    caixa.innerHTML = achados.map(i => `
        <div class="consulta-sug-item" onclick="consultaEscolherSugestao('${_consultaChave(i)}')">
            <span class="consulta-sug-cod">${escapeHtml(i.codigo || '—')}</span>
            <span class="consulta-sug-nome">${escapeHtml(i.nome)}</span>
        </div>`).join('');
    caixa.classList.add('aberta');
}

function consultaEscolherSugestao(chave) {
    const item = _consultaItens().find(i => _consultaChave(i) === chave);
    if (!item) return;
    const campoCodigo = document.getElementById('consulta-codigo');
    const campoNome   = document.getElementById('consulta-busca');
    if (campoCodigo) campoCodigo.value = item.codigo;
    if (campoNome)   campoNome.value = item.nome;
    _consultaFecharSugestoes('codigo');
    _consultaFecharSugestoes('nome');
    renderConsultaEstoque();
}

function _consultaFecharSugestoes(campo) {
    const caixa = document.getElementById(campo === 'codigo' ? 'consulta-sug-codigo' : 'consulta-sug-nome');
    if (caixa) { caixa.classList.remove('aberta'); caixa.innerHTML = ''; }
}

// Clique fora fecha as sugestoes abertas.
document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('.consulta-campo')) return;
    _consultaFecharSugestoes('codigo');
    _consultaFecharSugestoes('nome');
});

function renderEstoqueMateriais() {
    const alertBox = document.getElementById('alertas-mat-min');
    if (alertBox) {
        const criticos = db.materiais.filter(m => !temEstoqueInfinito(m) && m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque);
        alertBox.innerHTML = criticos.length
            ? criticos.map(m => `<div class="alerta-item">⚠ <strong>${escapeHtml(m.nome)}</strong>: ${(m.estoque_atual||0).toFixed(2)} ${m.unidade} — mínimo: ${m.min_estoque} ${m.unidade}</div>`).join('')
            : '';
        alertBox.style.display = criticos.length ? 'block' : 'none';
    }
    const tb = document.getElementById('tb-estoque-mat');
    if (!tb) return;
    if (!db.materiais.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;padding:24px">Nenhum material cadastrado. <a href="catalogo.html">Cadastre em Catálogo</a>.</td></tr>';
        return;
    }
    const lista = ordenarLista(db.materiais, matSortState, valorOrdenacaoMaterial);
    pintarCabecalhoOrdenacao('#tabela-est-materiais', matSortState);
    tb.innerHTML = lista.map(m => {
        const abaixoMin = !temEstoqueInfinito(m) && m.min_estoque > 0 && (m.estoque_atual || 0) < m.min_estoque;
        const cor = abaixoMin ? '#F43927' : '#005D3B';
        return `<tr>
            <td class="col-codigo" title="${escapeHtml(m.referencia||'')}">${escapeHtml(m.referencia||'—')}</td>
            <td class="col-nome" title="${escapeHtml(m.nome)}"><strong>${escapeHtml(m.nome)}</strong>${abaixoMin?`<span class="badge-alerta" style="margin-left:6px">⚠</span>`:''}</td>
            <td class="col-un">${m.unidade}</td>
            <td class="col-num" style="color:${cor}" title="${temEstoqueInfinito(m) || !(m.min_estoque > 0) ? '' : 'Mínimo: ' + m.min_estoque + ' ' + (m.unidade || '')}">${temEstoqueInfinito(m)
                ? '<strong title="Estoque infinito">∞</strong>'
                : `<strong>${(m.estoque_atual||0).toFixed(2)}</strong>`}</td>
            <td class="col-num" style="color:#005D3B;font-weight:600">${m.preco > 0 ? 'R$ '+m.preco.toFixed(2) : '—'}</td>
            <td class="col-forn" title="${escapeHtml(m.fornecedor_nome||'')}">${escapeHtml(m.fornecedor_nome||'—')}</td>
            <td class="col-acoes">
                <button class="btn btn-outline btn-sm" onclick="mostrarAjusteForm(${m.id})" title="Ajustar estoque">±</button>
                <button class="btn btn-outline btn-sm" onclick="pedirMaterial(${m.id})" title="Criar pedido de compra">🛒</button>
            </td>
        </tr>
        <tr id="ajuste-${m.id}" class="ajuste-form" style="display:none">
            <td colspan="7" class="baixa-form-cell">
                <strong>${escapeHtml(m.nome)}</strong> — saldo: <strong>${(m.estoque_atual||0).toFixed(2)} ${m.unidade}</strong> &emsp;
                Quantidade (+ entrada / − saída):
                <input type="number" id="ajuste-qtd-${m.id}" placeholder="Ex: +10 ou -3" step="0.01" style="width:130px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;margin:0 8px">
                <button class="btn btn-sm" style="background:#005D3B" onclick="confirmarAjuste(${m.id})">Confirmar</button>
                <button class="btn btn-outline btn-sm" onclick="cancelarAjuste()">Cancelar</button>
            </td>
        </tr>`;
    }).join('');
}

// =============================================
// MÓDULO FINANCEIRO
// =============================================

const PLANOS_PAGAMENTO = {
    'avista': [{ descricao: 'Pagamento à vista', pct: 100, dias: 0 }],
    '50_50':  [{ descricao: 'Entrada (50%)', pct: 50, dias: 0 }, { descricao: 'Saldo na instalação (50%)', pct: 50, dias: -1 }],
    '30_70':  [{ descricao: 'Entrada (30%)', pct: 30, dias: 0 }, { descricao: 'Saldo na instalação (70%)', pct: 70, dias: -1 }],
    '40_60':  [{ descricao: 'Entrada (40%)', pct: 40, dias: 0 }, { descricao: 'Saldo na instalação (60%)', pct: 60, dias: -1 }],
};

// Pedido com forma de pagamento (so um nome, definida pela empresa): um unico
// lancamento com o valor todo, vencendo na aprovacao. Pedido antigo, gravado
// com o codigo de um plano, continua dividido como era.
function _planoPagamento(ped) {
    if (ped.forma_pagamento) return [{ descricao: `Pagamento (${ped.forma_pagamento})`, pct: 100, dias: 0 }];
    return PLANOS_PAGAMENTO[ped.tipo_pagamento || '50_50'] || PLANOS_PAGAMENTO['50_50'];
}

function _migrarFinanceiroPedidos() {
    const pendentes = db.pedidos.filter(p =>
        !p.financeiro_gerado &&
        normalizarStatus(p.status) !== 'Orçamento' &&
        (p.valor || 0) > 0
    );
    if (!pendentes.length) return;
    let nextId = Date.now();
    pendentes.forEach(ped => {
        if (normalizarStatus(ped.status) === 'Instalado' && (ped.valor_recebido || 0) >= (ped.valor || 0)) {
            const dataPgto = ped.data_instalado
                ? new Date(ped.data_instalado).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0];
            db.contas_receber.push({
                id: nextId++,
                pedido_id: ped.id,
                cliente_nome: ped.clienteNome || '',
                descricao: `Pagamento — Pedido #${formatPedidoId(ped.id)}`,
                valor: ped.valor,
                data_vencimento: dataPgto,
                data_pagamento: dataPgto,
                status: 'Pago'
            });
        } else {
            const plano = _planoPagamento(ped);
            const hoje = new Date();
            plano.forEach((parcela, i) => {
                const valor = Math.round(ped.valor * parcela.pct / 100 * 100) / 100;
                const vencimento = parcela.dias === -1
                    ? (ped.data_entrega || new Date(hoje.getTime() + 30 * 86400000).toISOString().split('T')[0])
                    : new Date(hoje.getTime() + parcela.dias * 86400000).toISOString().split('T')[0];
                db.contas_receber.push({
                    id: nextId++,
                    pedido_id: ped.id,
                    cliente_nome: ped.clienteNome || '',
                    descricao: `${parcela.descricao} — Pedido #${formatPedidoId(ped.id)}`,
                    valor,
                    data_vencimento: vencimento,
                    data_pagamento: null,
                    status: 'Pendente'
                });
            });
        }
        ped.financeiro_gerado = true;
    });
    syncDB();
}

function gerarFinanceiroPedido(ped) {
    if (ped.financeiro_gerado) return;
    const plano = _planoPagamento(ped);
    const hoje = new Date();
    plano.forEach((parcela, i) => {
        const valor = Math.round(ped.valor * parcela.pct / 100 * 100) / 100;
        let vencimento;
        if (parcela.dias === -1) {
            vencimento = ped.data_entrega || new Date(hoje.getTime() + 30 * 86400000).toISOString().split('T')[0];
        } else {
            vencimento = new Date(hoje.getTime() + parcela.dias * 86400000).toISOString().split('T')[0];
        }
        db.contas_receber.push({
            id: Date.now() + i,
            pedido_id: ped.id,
            cliente_nome: ped.clienteNome || '',
            descricao: `${parcela.descricao} — Pedido #${formatPedidoId(ped.id)}`,
            valor,
            data_vencimento: vencimento,
            data_pagamento: null,
            status: 'Pendente'
        });
    });
    ped.financeiro_gerado = true;
}

function atualizarStatusVencimentos() {
    const hoje = new Date().toISOString().split('T')[0];
    let changed = false;
    [...db.contas_receber, ...db.contas_pagar].forEach(item => {
        if (item.status === 'Pendente' && item.data_vencimento < hoje) {
            item.status = 'Atrasado';
            changed = true;
        }
    });
    if (changed) syncDB();
}

function marcarCRPago(id) {
    if (!temAcesso('financeiro.receber', 'completo')) { showAlert('Você não tem permissão para realizar esta ação.', '🚫'); return; }
    const cr = db.contas_receber.find(x => x.id == id);
    if (!cr) return;
    const dataStr = prompt('Data de recebimento (AAAA-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!dataStr) return;
    cr.data_pagamento = dataStr;
    cr.status = 'Pago';
    if (cr.pedido_id) {
        const ped = db.pedidos.find(p => p.id == cr.pedido_id);
        const todas = db.contas_receber.filter(x => x.pedido_id === cr.pedido_id);
        const todasPagas = todas.every(x => x.status === 'Pago' || x.id == id);
        if (todasPagas && ped && (ped.arquiteto_nome || '').trim() && (ped.rt_pct || 0) > 0 && !ped.rt_gerado) {
            const rtValor = Math.round(ped.valor * ped.rt_pct / 100 * 100) / 100;
            db.contas_pagar.push({
                id: Date.now() + 1,
                pedido_id: ped.id, tipo: 'variavel', categoria: 'comissao_rt',
                descricao: `RT ${ped.rt_pct}% — ${ped.arquiteto_nome} — Ped. #${formatPedidoId(ped.id)}`,
                credor_nome: ped.arquiteto_nome,
                valor: rtValor,
                data_vencimento: dataStr, data_pagamento: null, status: 'Pendente'
            });
            ped.rt_gerado = true;
        }
    }
    salvarERecarregar('Recebimento registrado!');
}

async function excluirCR(id) {
    if (!await exigirPermissao('financeiro.receber', 'completo')) return;
    if (!await showConfirm('Remover este lançamento a receber?', '🗑️', 'Remover', 'Cancelar')) return;
    db.contas_receber = db.contas_receber.filter(x => x.id != id);
    salvarERecarregar('Lançamento removido.');
}

// --- CONTAS A PAGAR: validação de CNPJ (dígitos verificadores) ---
function validarCNPJ(cnpj) {
    const d = String(cnpj || '').replace(/\D/g, '');
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
    const calcDV = (base) => {
        let pos = base.length - 7, soma = 0;
        for (let i = 0; i < base.length; i++) { soma += parseInt(base[i]) * pos--; if (pos < 2) pos = 9; }
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };
    const dv1 = calcDV(d.slice(0, 12));
    const dv2 = calcDV(d.slice(0, 12) + dv1);
    return d === d.slice(0, 12) + String(dv1) + String(dv2);
}

// --- CONTAS A PAGAR: decodificação de linha digitável (padrão FEBRABAN) ---
// Referência: manual de padrões da FEBRABAN para código de barras de arrecadação e boletos bancários.
const BANCOS_COMPENSACAO = {
    '001': 'Banco do Brasil', '033': 'Santander', '077': 'Inter', '104': 'Caixa Econômica Federal',
    '237': 'Bradesco', '260': 'Nubank', '341': 'Itaú', '399': 'HSBC', '422': 'Safra',
    '070': 'BRB', '745': 'Citibank', '212': 'Banco Original', '336': 'C6 Bank', '655': 'Neon',
};
function bancoPorCodigo(codigo) { return BANCOS_COMPENSACAO[codigo] || `Banco ${codigo}`; }

function _mod10Boleto(digits) {
    let soma = 0, peso = 2;
    for (let i = digits.length - 1; i >= 0; i--) {
        let prod = parseInt(digits[i]) * peso;
        if (prod > 9) prod -= 9;
        soma += prod;
        peso = peso === 2 ? 1 : 2;
    }
    const resto = soma % 10;
    return resto === 0 ? 0 : 10 - resto;
}
function _mod11BoletoGeral(digits43) {
    let soma = 0, peso = 2;
    for (let i = digits43.length - 1; i >= 0; i--) {
        soma += parseInt(digits43[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    let dv = 11 - resto;
    if (dv === 0 || dv === 10 || dv === 11) dv = 1;
    return dv;
}
function _mod11ConvenioBloco(digits) {
    let soma = 0, peso = 2;
    for (let i = digits.length - 1; i >= 0; i--) {
        soma += parseInt(digits[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    let dv = 11 - resto;
    if (dv >= 10) dv = 0;
    return dv;
}
// Fator de vencimento: dias corridos desde uma data-base. A FEBRABAN trocou a base em 22/02/2025
// (a base de 1997 estava perto de estourar o campo de 4 dígitos). Escolhemos a base cujo resultado
// cai numa janela plausível (evita confundir uma data de 1998 com uma de 2028, por exemplo).
function _fatorParaData(fator) {
    if (!fator) return null;
    const baseClassica = new Date(Date.UTC(1997, 9, 7));
    const baseNova = new Date(Date.UTC(2022, 1, 22));
    const dClassica = new Date(baseClassica.getTime() + fator * 86400000);
    const dNova = new Date(baseNova.getTime() + fator * 86400000);
    const hoje = new Date();
    const dentroFaixa = dt => { const anos = (dt - hoje) / (365 * 86400000); return anos > -3 && anos < 6; };
    if (dentroFaixa(dNova)) return dNova.toISOString().split('T')[0];
    if (dentroFaixa(dClassica)) return dClassica.toISOString().split('T')[0];
    return dNova.toISOString().split('T')[0];
}
function _decodificarBoletoBancario(d) {
    const c1 = d.slice(0, 9), dv1 = d[9];
    const c2 = d.slice(10, 20), dv2 = d[20];
    const c3 = d.slice(21, 31), dv3 = d[31];
    const dvGeral = d[32];
    const fatorVenc = d.slice(33, 37);
    const valorStr = d.slice(37, 47);
    if (_mod10Boleto(c1) !== parseInt(dv1)) return { ok: false, motivo: 'Dígito verificador do 1º campo não confere — revise a linha digitável.' };
    if (_mod10Boleto(c2) !== parseInt(dv2)) return { ok: false, motivo: 'Dígito verificador do 2º campo não confere — revise a linha digitável.' };
    if (_mod10Boleto(c3) !== parseInt(dv3)) return { ok: false, motivo: 'Dígito verificador do 3º campo não confere — revise a linha digitável.' };
    const banco = c1.slice(0, 3);
    const moeda = c1[3];
    const campoLivre = c1.slice(4, 9) + c2 + c3;
    const barcode43 = banco + moeda + fatorVenc + valorStr + campoLivre;
    if (_mod11BoletoGeral(barcode43) !== parseInt(dvGeral)) return { ok: false, motivo: 'Dígito verificador geral não confere — revise a linha digitável.' };
    return { ok: true, tipo: 'boleto', bancoCodigo: banco, banco: bancoPorCodigo(banco), valor: parseInt(valorStr, 10) / 100, vencimento: _fatorParaData(parseInt(fatorVenc, 10)) };
}
function _decodificarConvenio(d) {
    const blocos = [d.slice(0, 12), d.slice(12, 24), d.slice(24, 36), d.slice(36, 48)];
    const indicadorValor = d[2];
    const usaMod10 = indicadorValor === '6' || indicadorValor === '7';
    const checar = usaMod10 ? _mod10Boleto : _mod11ConvenioBloco;
    let barcode = '';
    for (const bloco of blocos) {
        const corpo = bloco.slice(0, 11), dv = bloco[11];
        if (checar(corpo) !== parseInt(dv)) return { ok: false, motivo: 'Dígito verificador não confere — revise a linha digitável de convênio.' };
        barcode += corpo;
    }
    const valorEfetivo = indicadorValor === '6' || indicadorValor === '8';
    const valorStr = barcode.slice(4, 15);
    return { ok: true, tipo: 'convenio', valor: valorEfetivo ? parseInt(valorStr, 10) / 100 : null, valorReferencia: !valorEfetivo, vencimento: null };
}
function decodificarLinhaDigitavel(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length === 47) return _decodificarBoletoBancario(d);
    if (d.length === 48) return _decodificarConvenio(d);
    if (d.length === 44) return { ok: false, motivo: 'Isso parece um código de barras (44 dígitos) — cole a linha digitável impressa no boleto (47 ou 48 dígitos), não o código de barras.' };
    return { ok: false, motivo: null };
}

// Busca um lançamento anterior pelo número do documento (não há API pública gratuita para isso —
// só encontra o que já foi lançado/importado antes neste mesmo sistema).
function buscarNumeroDocumentoHistorico(numero, cnpjDigits) {
    const num = String(numero || '').replace(/\D/g, '');
    if (!num) return null;
    return db.contas_pagar.find(cp => cp.numero_documento && cp.numero_documento.replace(/\D/g, '') === num
        && (!cnpjDigits || (cp.cnpj_fornecedor || '').replace(/\D/g, '') === cnpjDigits)) || null;
}

// Gera as datas de vencimento futuras de uma despesa recorrente, respeitando data-fim (se houver)
// e um teto de segurança de 60 meses a partir do início (não dá pra gerar "para sempre").
function gerarOcorrenciasRecorrentes(dataInicioStr, periodicidade, dataFimStr) {
    const passosMeses = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
    const datas = [];
    let atual = new Date(dataInicioStr + 'T12:00:00');
    const limiteMax = new Date(atual); limiteMax.setMonth(limiteMax.getMonth() + 60);
    const limite = dataFimStr ? new Date(Math.min(new Date(dataFimStr + 'T12:00:00').getTime(), limiteMax.getTime())) : limiteMax;
    let guard = 0;
    while (atual <= limite && guard < 240) {
        datas.push(atual.toISOString().split('T')[0]);
        if (periodicidade === 'quinzenal') { atual = new Date(atual); atual.setDate(atual.getDate() + 15); }
        else { const meses = passosMeses[periodicidade] || 1; atual = new Date(atual); atual.setMonth(atual.getMonth() + meses); }
        guard++;
    }
    return datas;
}

function marcarCPPago(id) {
    if (!temAcesso('financeiro.pagar', 'completo')) { showAlert('Você não tem permissão para realizar esta ação.', '🚫'); return; }
    const cp = db.contas_pagar.find(x => x.id == id);
    if (!cp) return;
    const dataStr = prompt('Data de pagamento (AAAA-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!dataStr) return;
    cp.data_pagamento = dataStr;
    cp.status = 'Pago';
    salvarERecarregar('Pagamento registrado!');
}

async function excluirCP(id) {
    if (!await exigirPermissao('financeiro.pagar', 'completo')) return;
    if (!await showConfirm('Remover este lançamento a pagar?', '🗑️', 'Remover', 'Cancelar')) return;
    db.contas_pagar = db.contas_pagar.filter(x => x.id != id);
    salvarERecarregar('Lançamento removido.');
}

async function excluirGrupoCP(paiId) {
    if (!await exigirPermissao('financeiro.pagar', 'completo')) return;
    const grupo = db.contas_pagar.filter(x => x.lancamento_pai_id === paiId);
    if (!grupo.length) return;
    if (!await showConfirm(`Remover todos os ${grupo.length} lançamentos deste grupo (parcelas ou recorrência)?\n\nEsta ação não pode ser desfeita.`, '🗑️', 'Remover grupo', 'Cancelar')) return;
    db.contas_pagar = db.contas_pagar.filter(x => x.lancamento_pai_id !== paiId);
    db.despesas_fixas = db.despesas_fixas.filter(x => x.id !== paiId);
    salvarERecarregar('Grupo removido.');
}

async function salvarDespesaFixa() {
    if (!await exigirPermissao('financeiro.fixas', 'completo')) return;
    const descricao = document.getElementById('df-descricao')?.value.trim();
    const valor = parseFloat(document.getElementById('df-valor')?.value) || 0;
    const dia = parseInt(document.getElementById('df-dia')?.value) || 1;
    const categoria = document.getElementById('df-categoria')?.value || 'outro';
    if (!descricao) { await showAlert('Informe a descrição da despesa.', '⚠️'); return; }
    if (!valor) { await showAlert('Informe o valor da despesa.', '⚠️'); return; }
    db.despesas_fixas.push({ id: Date.now(), descricao, valor, dia_vencimento: dia, categoria, ativo: true });
    salvarERecarregar('Despesa fixa cadastrada!');
}

async function excluirDespesaFixa(id) {
    if (!await exigirPermissao('financeiro.fixas', 'completo')) return;
    if (!await showConfirm('Remover esta despesa fixa recorrente?', '🗑️', 'Remover', 'Cancelar')) return;
    db.despesas_fixas = db.despesas_fixas.filter(x => x.id != id);
    salvarERecarregar('Despesa removida.');
}

async function gerarContasPagarDoMes() {
    if (!await exigirPermissao('financeiro.pagar', 'completo')) return;
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    let geradas = 0;
    db.despesas_fixas.filter(df => df.ativo && !df.periodicidade).forEach(df => {
        const vencStr = `${ano}-${mes}-${String(df.dia_vencimento).padStart(2, '0')}`;
        const jaExiste = db.contas_pagar.some(cp => !cp.pedido_id && cp.data_vencimento === vencStr && cp.descricao === df.descricao);
        if (!jaExiste) {
            db.contas_pagar.push({
                id: Date.now() + geradas, pedido_id: null,
                tipo: 'fixo', categoria: df.categoria,
                descricao: df.descricao, credor_nome: '',
                valor: df.valor, data_vencimento: vencStr,
                data_pagamento: null, status: 'Pendente'
            });
            geradas++;
        }
    });
    if (geradas) salvarERecarregar(`${geradas} despesa(s) gerada(s) para o mês!`);
    else await showAlert('Todas as despesas fixas do mês já foram geradas (ou nenhuma cadastrada).', 'ℹ️');
}

// --- CONTAS A PAGAR: menu "+ Nova Conta a Pagar" ---
function toggleMenuContaPagar(e) {
    e.stopPropagation();
    const dd = document.getElementById('cp-menu-dropdown');
    if (!dd) return;
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', (e) => {
    const dd = document.getElementById('cp-menu-dropdown');
    if (dd && dd.style.display === 'block' && !dd.contains(e.target) && e.target.id !== 'cp-menu-btn') dd.style.display = 'none';
});

function abrirModalContaPagar(modo, manterAnexoPendente) {
    const dropdown = document.getElementById('cp-menu-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    if (modo === 'arquivo') {
        abrirModalImportarNota();
        return;
    }
    if (!manterAnexoPendente) _anexoPendenteCP = null;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:640px">
        <div class="modal-header">
            <h3>Lançar Conta a Pagar</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            <div class="grid">
                <div class="form-group" style="grid-column:span 2">
                    <label>Descrição <span style="color:#F43927">*</span></label>
                    <input type="text" id="cpm-descricao" placeholder="Ex: Compra de tecido, salário costureira…">
                </div>
                <div class="form-group">
                    <label>CNPJ do Fornecedor <span class="info-tag">opcional</span></label>
                    <input type="text" id="cpm-cnpj" placeholder="00.000.000/0000-00" maxlength="18" oninput="mascaraCNPJ(this); onCnpjContaPagarInput();">
                    <div id="cpm-cnpj-status" style="font-size:11px;margin-top:3px;min-height:14px"></div>
                </div>
                <div class="form-group">
                    <label>Credor / Fornecedor</label>
                    <input type="text" id="cpm-credor" placeholder="Nome do credor">
                </div>
                <div class="form-group">
                    <label>Valor (R$) <span style="color:#F43927">*</span></label>
                    <input type="number" id="cpm-valor" step="0.01" min="0" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Vencimento <span style="color:#F43927">*</span></label>
                    <input type="date" id="cpm-vencimento">
                </div>
                <div class="form-group" style="grid-column:span 2">
                    <label>Nº da Nota ou Linha Digitável do Boleto <span class="info-tag">opcional</span></label>
                    <input type="text" id="cpm-doc" placeholder="Cole a linha digitável (boleto/convênio) ou digite o nº da nota" oninput="onDocContaPagarInput()">
                    <div id="cpm-doc-help" style="font-size:11px;margin-top:3px;color:#8F8F8F;min-height:14px"></div>
                </div>
            </div>
            <div style="display:flex;gap:24px;flex-wrap:wrap;margin:6px 0 14px;padding:12px 14px;background:#FAFAFA;border:1px solid var(--border);border-radius:8px">
                <div style="display:flex;align-items:center;gap:10px">
                    <label class="toggle-switch"><input type="checkbox" id="cpm-recorrente" onchange="onToggleRecorrenteCP()"><span class="toggle-slider"></span></label>
                    <span style="font-size:13px;font-weight:600">Recorrente?</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                    <label class="toggle-switch"><input type="checkbox" id="cpm-parcelado" onchange="onToggleParceladoCP()"><span class="toggle-slider"></span></label>
                    <span style="font-size:13px;font-weight:600">Parcelado?</span>
                </div>
            </div>
            <div id="cpm-recorrente-fields" class="grid" style="display:none">
                <div class="form-group">
                    <label>Periodicidade</label>
                    <select id="cpm-periodicidade">
                        <option value="mensal">Mensal</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="bimestral">Bimestral</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="semestral">Semestral</option>
                        <option value="anual">Anual</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Data Fim <span class="info-tag">vazio = sem fim (máx. 60 meses)</span></label>
                    <input type="date" id="cpm-data-fim">
                </div>
            </div>
            <div id="cpm-parcelado-fields" class="grid" style="display:none">
                <div class="form-group">
                    <label>Número de Parcelas</label>
                    <input type="number" id="cpm-parcelas" min="2" step="1" placeholder="Ex: 3">
                </div>
            </div>
            <div class="grid">
                <div class="form-group">
                    <label>Categoria</label>
                    <select id="cpm-categoria">
                        <option value="tecido">Tecido / Material</option>
                        <option value="instalador">Instalador</option>
                        <option value="costureira">Costureira</option>
                        <option value="aluguel">Aluguel</option>
                        <option value="salario">Salário</option>
                        <option value="conta">Conta (luz, internet…)</option>
                        <option value="comissao_rt">Comissão RT</option>
                        <option value="outro">Outro</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Vincular a Pedido</label>
                    <select id="cpm-pedido"></select>
                </div>
            </div>
        </div>
        <div style="display:flex;gap:10px;padding:16px 24px;border-top:1px solid var(--border)">
            <button class="btn btn-success" onclick="adicionarContaPagarManual()">Lançar Conta a Pagar</button>
            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    const pedSel = overlay.querySelector('#cpm-pedido');
    if (pedSel) pedSel.innerHTML = '<option value="">— Sem vínculo de pedido —</option>' +
        db.pedidos.filter(p => normalizarStatus(p.status) !== 'Orçamento')
        .map(p => `<option value="${p.id}">#${formatPedidoId(p.id)} ${escapeHtml(p.clienteNome || '')}</option>`).join('');
}

function onToggleRecorrenteCP() {
    const chkR = document.getElementById('cpm-recorrente'), chkP = document.getElementById('cpm-parcelado');
    const on = chkR?.checked;
    document.getElementById('cpm-recorrente-fields').style.display = on ? 'grid' : 'none';
    if (on && chkP?.checked) { chkP.checked = false; document.getElementById('cpm-parcelado-fields').style.display = 'none'; }
}
function onToggleParceladoCP() {
    const chkP = document.getElementById('cpm-parcelado'), chkR = document.getElementById('cpm-recorrente');
    const on = chkP?.checked;
    document.getElementById('cpm-parcelado-fields').style.display = on ? 'grid' : 'none';
    if (on && chkR?.checked) { chkR.checked = false; document.getElementById('cpm-recorrente-fields').style.display = 'none'; }
}

async function onCnpjContaPagarInput() {
    const el = document.getElementById('cpm-cnpj');
    const statusEl = document.getElementById('cpm-cnpj-status');
    if (!el || !statusEl) return;
    const digits = el.value.replace(/\D/g, '');
    if (digits.length !== 14) { statusEl.textContent = ''; return; }
    if (!validarCNPJ(digits)) { statusEl.innerHTML = '<span style="color:#F43927">⚠️ CNPJ inválido — confira os dígitos.</span>'; return; }
    statusEl.innerHTML = '<span style="color:#8F8F8F">⏳ Consultando...</span>';
    try {
        const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`);
        if (!res.ok) throw new Error(res.status === 404 ? 'nao_encontrado' : 'erro');
        const d = await res.json();
        const est = d.estabelecimento || {};
        const credorEl = document.getElementById('cpm-credor');
        if (credorEl) credorEl.value = est.nome_fantasia || d.razao_social || credorEl.value;
        statusEl.innerHTML = '<span style="color:#005D3B">✅ Fornecedor encontrado e preenchido.</span>';
    } catch (e) {
        statusEl.innerHTML = e.message === 'nao_encontrado'
            ? '<span style="color:#8F8F8F">CNPJ não encontrado — preencha o credor manualmente.</span>'
            : '<span style="color:#8F8F8F">Não foi possível consultar agora — preencha o credor manualmente.</span>';
    }
}

function onDocContaPagarInput() {
    const raw = document.getElementById('cpm-doc')?.value || '';
    const helpEl = document.getElementById('cpm-doc-help');
    if (!helpEl) return;
    const digits = raw.replace(/\D/g, '');
    if (!digits) { helpEl.textContent = ''; return; }

    if (digits.length === 44) {
        helpEl.style.color = '#8F8F8F';
        helpEl.textContent = 'Chave de acesso de NF-e detectada (44 dígitos). A busca automática por chave completa ainda não está disponível — use "Exportar nota/boleto" (em breve) ou preencha manualmente.';
        return;
    }
    if (digits.length === 47 || digits.length === 48) {
        const res = decodificarLinhaDigitavel(digits);
        if (res.ok) {
            if (res.valor) document.getElementById('cpm-valor').value = res.valor.toFixed(2);
            if (res.vencimento) document.getElementById('cpm-vencimento').value = res.vencimento;
            const descEl = document.getElementById('cpm-descricao');
            if (descEl && !descEl.value.trim()) descEl.value = res.tipo === 'boleto' ? `Boleto ${res.banco}` : 'Conta de consumo (convênio)';
            helpEl.style.color = '#005D3B';
            helpEl.textContent = res.tipo === 'boleto'
                ? `Boleto identificado — ${res.banco}${res.valor ? `, valor R$ ${res.valor.toFixed(2)}` : ''}${res.vencimento ? `, vencimento ${new Date(res.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}.`
                : `Linha de convênio identificada${res.valorReferencia ? ' (valor de referência — confirme o valor real a pagar)' : ''}. Este tipo de linha não codifica vencimento — informe manualmente.`;
        } else if (res.motivo) {
            helpEl.style.color = '#F43927';
            helpEl.textContent = res.motivo;
        }
        return;
    }
    if (digits.length >= 6 && digits.length <= 20) {
        const cnpjDigits = (document.getElementById('cpm-cnpj')?.value || '').replace(/\D/g, '');
        const achado = buscarNumeroDocumentoHistorico(digits, cnpjDigits);
        if (achado) {
            const credorEl = document.getElementById('cpm-credor');
            const valorEl = document.getElementById('cpm-valor');
            if (credorEl && !credorEl.value.trim()) credorEl.value = achado.credor_nome || '';
            if (valorEl && !valorEl.value) valorEl.value = achado.valor.toFixed(2);
            helpEl.style.color = '#005D3B';
            helpEl.textContent = `Encontrado no histórico: lançamento anterior de "${achado.credor_nome || '—'}" com este número de documento.`;
        } else {
            helpEl.style.color = '#8F8F8F';
            helpEl.textContent = 'Busca automática só pelo número da nota não é garantida — não existe API pública gratuita para isso. Use "Exportar nota/boleto" ou informe a chave de acesso completa (44 dígitos).';
        }
        return;
    }
    helpEl.textContent = '';
}

async function adicionarContaPagarManual() {
    if (!await exigirPermissao('financeiro.pagar', 'completo')) return;
    const descricao   = document.getElementById('cpm-descricao')?.value.trim();
    const cnpjFornecedor = document.getElementById('cpm-cnpj')?.value.trim() || '';
    const credor      = document.getElementById('cpm-credor')?.value.trim() || '';
    const valor       = parseFloat(document.getElementById('cpm-valor')?.value) || 0;
    const vencimento  = document.getElementById('cpm-vencimento')?.value;
    const categoria   = document.getElementById('cpm-categoria')?.value || 'outro';
    const pedidoId    = document.getElementById('cpm-pedido')?.value || '';
    const docRaw      = document.getElementById('cpm-doc')?.value.trim() || '';
    const docDigits   = docRaw.replace(/\D/g, '');
    const ehLinhaDigitavel = docDigits.length === 47 || docDigits.length === 48;
    const recorrente  = document.getElementById('cpm-recorrente')?.checked || false;
    const periodicidade = document.getElementById('cpm-periodicidade')?.value || 'mensal';
    const dataFim     = document.getElementById('cpm-data-fim')?.value || '';
    const parcelado   = document.getElementById('cpm-parcelado')?.checked || false;
    const numParcelas = parseInt(document.getElementById('cpm-parcelas')?.value) || 1;

    if (!descricao)  { await showAlert('Informe a descrição.', '⚠️'); return; }
    if (!valor)      { await showAlert('Informe o valor.', '⚠️'); return; }
    if (!vencimento) { await showAlert('Informe a data de vencimento.', '⚠️'); return; }
    if (cnpjFornecedor.replace(/\D/g, '').length === 14 && !validarCNPJ(cnpjFornecedor)) {
        if (!await showConfirm('O CNPJ informado parece inválido (dígito verificador não confere). Deseja lançar mesmo assim?', '⚠️', 'Lançar mesmo assim', 'Corrigir')) return;
    }
    if (parcelado && numParcelas < 2) { await showAlert('Informe um número de parcelas maior que 1.', '⚠️'); return; }

    const chaveAcesso = _anexoPendenteCP?.chaveAcesso || null;
    const numeroDocumento = (!ehLinhaDigitavel && docRaw) ? docRaw : null;
    let tipoLancamento = 'manual';
    if (ehLinhaDigitavel) tipoLancamento = 'boleto';
    else if (chaveAcesso || numeroDocumento) tipoLancamento = 'nota';

    const camposDoc = {
        cnpj_fornecedor: cnpjFornecedor || null,
        linha_digitavel: ehLinhaDigitavel ? docDigits : null,
        numero_documento: numeroDocumento,
        chave_acesso: chaveAcesso,
        tipo_lancamento: tipoLancamento,
        arquivo_anexo_url: _anexoPendenteCP?.dataUrl || null,
        arquivo_anexo_nome: _anexoPendenteCP?.nome || null,
        arquivo_anexo_tipo: _anexoPendenteCP?.tipo || null,
    };
    _anexoPendenteCP = null;

    if (parcelado) {
        const valorParcela = Math.round((valor / numParcelas) * 100) / 100;
        const paiId = Date.now();
        let somaLancada = 0;
        for (let i = 0; i < numParcelas; i++) {
            const venc = new Date(vencimento + 'T12:00:00'); venc.setMonth(venc.getMonth() + i);
            const isUltima = i === numParcelas - 1;
            const valorFinal = isUltima ? Math.round((valor - somaLancada) * 100) / 100 : valorParcela;
            somaLancada += valorFinal;
            db.contas_pagar.push({
                id: paiId + i + 1, pedido_id: pedidoId ? parseInt(pedidoId) : null,
                tipo: 'variavel', categoria, descricao: `${descricao} (parcela ${i + 1}/${numParcelas})`,
                credor_nome: credor, valor: valorFinal, data_vencimento: venc.toISOString().split('T')[0],
                data_pagamento: null, status: 'Pendente',
                lancamento_pai_id: paiId, parcelado: true, numero_parcelas: numParcelas, parcela_atual: i + 1,
                ...camposDoc
            });
        }
        salvarERecarregar(`${numParcelas} parcelas lançadas!`);
        return;
    }

    if (recorrente) {
        const dfId = Date.now();
        db.despesas_fixas.push({
            id: dfId, descricao, valor, dia_vencimento: new Date(vencimento + 'T12:00:00').getDate(),
            categoria, ativo: true, periodicidade, data_inicio: vencimento, data_fim: dataFim || null,
            credor_nome: credor, cnpj_fornecedor: cnpjFornecedor || null
        });
        const ocorrencias = gerarOcorrenciasRecorrentes(vencimento, periodicidade, dataFim);
        ocorrencias.forEach((venc, i) => {
            db.contas_pagar.push({
                id: dfId + i + 1, pedido_id: pedidoId ? parseInt(pedidoId) : null,
                tipo: 'fixo', categoria, descricao, credor_nome: credor,
                valor, data_vencimento: venc, data_pagamento: null, status: 'Pendente',
                lancamento_pai_id: dfId, recorrente: true, periodicidade,
                ...camposDoc
            });
        });
        salvarERecarregar(`Despesa recorrente cadastrada — ${ocorrencias.length} lançamento(s) gerado(s)!`);
        return;
    }

    db.contas_pagar.push({
        id: Date.now(), pedido_id: pedidoId ? parseInt(pedidoId) : null,
        tipo: 'variavel', categoria, descricao, credor_nome: credor,
        valor, data_vencimento: vencimento, data_pagamento: null, status: 'Pendente',
        ...camposDoc
    });
    salvarERecarregar('Conta a pagar registrada!');
}

// --- CONTAS A PAGAR: importar nota/boleto (XML de NF-e e PDF com texto) ---
// Guarda o anexo lido enquanto o usuário revisa os campos extraídos no modal manual;
// só vira parte do lançamento de fato quando o usuário confirma em "Lançar Conta a Pagar".
let _anexoPendenteCP = null;
let _pdfJsPronto = null; // Promise compartilhada p/ não carregar a lib mais de uma vez

function abrirModalImportarNota() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:520px">
        <div class="modal-header">
            <h3>Exportar Nota / Boleto</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            <p style="font-size:12.5px;color:#8F8F8F;margin-bottom:14px">Envie o arquivo original — os campos serão extraídos automaticamente quando possível. Você sempre revisa e confirma antes de lançar.</p>
            <div id="cpi-dropzone" style="border:2px dashed var(--border);border-radius:10px;padding:36px 20px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s">
                <div style="font-size:32px;margin-bottom:8px">📎</div>
                <div style="font-weight:600;color:var(--dark);margin-bottom:4px">Clique para selecionar ou arraste o arquivo aqui</div>
                <div style="font-size:12px;color:#8F8F8F">PDF, XML, JPG ou PNG · Máx. 4 MB</div>
            </div>
            <input type="file" id="cpi-file-input" accept=".pdf,.xml,.jpg,.jpeg,.png" style="display:none">
            <div id="cpi-status" style="margin-top:14px;font-size:13px"></div>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const dz = overlay.querySelector('#cpi-dropzone');
    const input = overlay.querySelector('#cpi-file-input');
    dz.addEventListener('click', () => input.click());
    input.addEventListener('change', () => onArquivoContaPagarSelecionado(input.files?.[0]));
    ['dragover', 'dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => e.preventDefault()));
    dz.addEventListener('dragover', () => { dz.style.borderColor = 'var(--primary)'; dz.style.background = '#EDF5FC'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor = 'var(--border)'; dz.style.background = ''; });
    dz.addEventListener('drop', e => {
        dz.style.borderColor = 'var(--border)'; dz.style.background = '';
        const file = e.dataTransfer?.files?.[0];
        if (file) onArquivoContaPagarSelecionado(file);
    });
}

function _lerArquivoComoDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
        reader.readAsDataURL(file);
    });
}

async function onArquivoContaPagarSelecionado(file) {
    if (!file) return;
    const statusEl = document.getElementById('cpi-status');
    const MAX_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#F43927">⚠️ Arquivo muito grande (máx. 4 MB) — o navegador guarda os anexos junto com o resto dos dados do sistema.</span>';
        return;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'xml', 'jpg', 'jpeg', 'png'].includes(ext)) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#F43927">⚠️ Formato não suportado. Envie PDF, XML, JPG ou PNG.</span>';
        return;
    }
    if (statusEl) statusEl.innerHTML = '<span style="color:#8F8F8F">⏳ Lendo arquivo...</span>';

    let dataUrl = null;
    try { dataUrl = await _lerArquivoComoDataUrl(file); }
    catch { if (statusEl) statusEl.innerHTML = '<span style="color:#F43927">⚠️ Não foi possível ler o arquivo.</span>'; return; }

    const mostrarProgressoOcr = pct => {
        if (statusEl) statusEl.innerHTML = `<span style="color:#8F8F8F">🔍 Lendo por OCR (pode levar alguns segundos)... ${pct}%</span>`;
    };

    let extraidos = { ok: false, motivo: 'erro' };
    try {
        if (ext === 'xml') {
            extraidos = await _extrairDadosXmlNFe(file);
        } else if (ext === 'pdf') {
            extraidos = await _extrairDadosPdf(file);
            if (!extraidos.ok && extraidos.motivo === 'pdf_sem_texto') {
                extraidos = await _extrairDadosPdfEscaneadoOcr(file, mostrarProgressoOcr);
            }
        } else {
            extraidos = await _extrairDadosImagemOcr(dataUrl, mostrarProgressoOcr);
        }
    } catch (err) {
        extraidos = { ok: false, motivo: 'erro', detalhe: err.message };
    }

    if (statusEl) statusEl.innerHTML = extraidos.ok
        ? '<span style="color:#005D3B">✅ Dados extraídos! Abrindo para revisão...</span>'
        : '<span style="color:#8F8F8F">Não foi possível extrair automaticamente. Abrindo para preenchimento manual...</span>';

    await new Promise(r => setTimeout(r, 500));
    document.querySelectorAll('.modal-overlay').forEach(o => o.remove());

    _anexoPendenteCP = { nome: file.name, tipo: file.type || ext, dataUrl, chaveAcesso: extraidos.chaveAcesso || null };
    abrirModalContaPagar('manual', true);
    _preencherModalComExtracao(extraidos, file.name);
}

function _preencherModalComExtracao(dados, nomeArquivo) {
    const set = (id, val) => { if (val === undefined || val === null || val === '') return; const el = document.getElementById(id); if (el) el.value = val; };
    if (dados.ok) {
        if (dados.cnpj) { set('cpm-cnpj', dados.cnpj); const el = document.getElementById('cpm-cnpj'); if (el) mascaraCNPJ(el); }
        set('cpm-credor', dados.credor || '');
        if (dados.valor != null) set('cpm-valor', dados.valor.toFixed(2));
        set('cpm-vencimento', dados.vencimento || '');
        set('cpm-descricao', dados.credor ? `Nota/Boleto ${dados.credor}` : (dados.tipo === 'nota' ? 'Nota fiscal importada' : 'Boleto importado'));
        const docEl = document.getElementById('cpm-doc');
        if (docEl) docEl.value = dados.linhaDigitavel || dados.numeroDocumento || dados.chaveAcesso || '';
    } else {
        set('cpm-descricao', `Documento importado — ${nomeArquivo}`);
    }
    const helpEl = document.getElementById('cpm-doc-help');
    if (!helpEl) return;
    if (dados.ok) {
        helpEl.style.color = '#005D3B';
        helpEl.textContent = `Preenchido a partir de "${nomeArquivo}". Revise os campos antes de lançar.`;
        if (dados.dupInfo) helpEl.textContent += ` Esta nota possui ${dados.dupInfo} parcela(s) de cobrança — marque "Parcelado?" abaixo se quiser lançar todas.`;
    } else if (dados.motivo === 'ocr_falhou') {
        helpEl.style.color = '#F43927';
        helpEl.textContent = `Não foi possível processar a leitura automática (OCR)${dados.detalhe ? ' — ' + dados.detalhe : ''}. O arquivo foi anexado; preencha manualmente.`;
    } else if (dados.motivo === 'ocr_sem_texto') {
        helpEl.style.color = '#8F8F8F';
        helpEl.textContent = 'Não conseguimos reconhecer texto neste arquivo (qualidade baixa ou imagem ilegível). O arquivo foi anexado; preencha manualmente.';
    } else if (dados.motivo === 'ocr_sem_campos') {
        helpEl.style.color = '#8F8F8F';
        helpEl.textContent = 'A leitura automática por OCR não encontrou CNPJ, valor ou linha digitável neste documento — a extração por OCR é aproximada e nem sempre reconhece todos os documentos. O arquivo foi anexado; confira e preencha manualmente.';
    } else if (dados.motivo === 'xml_invalido' || dados.motivo === 'xml_sem_nfe') {
        helpEl.style.color = '#F43927';
        helpEl.textContent = 'Este XML não parece ser uma NF-e válida. O arquivo foi anexado; preencha manualmente.';
    } else {
        helpEl.style.color = '#F43927';
        helpEl.textContent = `Não foi possível ler os dados automaticamente${dados.detalhe ? ' (' + dados.detalhe + ')' : ''}. O arquivo foi anexado; preencha manualmente.`;
    }
}

// --- Extração: XML de NF-e ---
async function _extrairDadosXmlNFe(file) {
    const texto = await file.text();
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.querySelector('parsererror')) return { ok: false, motivo: 'xml_invalido' };
    const infNFe = doc.querySelector('infNFe');
    if (!infNFe) return { ok: false, motivo: 'xml_sem_nfe' };
    const get = sel => infNFe.querySelector(sel)?.textContent?.trim() || '';

    const cnpj = get('emit > CNPJ');
    const credor = get('emit > xFant') || get('emit > xNome');
    const valorStr = get('total > ICMSTot > vNF');
    const valor = valorStr ? parseFloat(valorStr) : null;
    const numeroDocumento = get('ide > nNF');

    let chaveAcesso = (infNFe.getAttribute('Id') || '').replace(/^NFe/i, '');
    if (!/^\d{44}$/.test(chaveAcesso)) chaveAcesso = doc.querySelector('protNFe infProt chNFe')?.textContent?.trim() || '';

    const duplicatas = Array.from(infNFe.querySelectorAll('cobr > dup'));
    let vencimento = duplicatas[0]?.querySelector('dVenc')?.textContent?.trim() || '';
    if (!vencimento) vencimento = (get('ide > dhEmi') || get('ide > dEmi')).slice(0, 10);

    if (!cnpj && !valor) return { ok: false, motivo: 'xml_sem_campos' };
    return {
        ok: true, tipo: 'nota', cnpj: cnpj || null, credor: credor || null, valor, vencimento: vencimento || null,
        numeroDocumento: numeroDocumento || null, chaveAcesso: chaveAcesso || null,
        dupInfo: duplicatas.length > 1 ? duplicatas.length : null,
    };
}

// --- Extração: PDF com camada de texto (boleto ou DANFE) ---
async function _garantirPdfJs() {
    if (window.pdfjsLib) return;
    if (!_pdfJsPronto) {
        _pdfJsPronto = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF — verifique sua conexão.'));
            document.head.appendChild(s);
        }).then(() => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        });
    }
    await _pdfJsPronto;
}

async function _extrairTextoPdf(file) {
    await _garantirPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let texto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();
        texto += conteudo.items.map(it => it.str).join(' ') + '\n';
    }
    return texto;
}

// Extrai os campos (linha digitável, chave de acesso, CNPJ, valor) de um texto já
// obtido por qualquer via (camada de texto do PDF OU saída de OCR). Compartilhado
// entre o caminho de PDF-com-texto e os caminhos de OCR (imagem e PDF escaneado).
async function _extrairCamposGenericos(texto) {
    if (!texto || texto.replace(/\s/g, '').length < 10) return { ok: false, motivo: 'sem_texto' };

    // 1) linha digitável (boleto bancário ou convênio) em qualquer lugar do texto.
    // Janela generosa: alguns PDFs (ex.: quando o campo usa letter-spacing p/ alinhamento
    // visual) fazem o pdf.js extrair um espaço entre CADA dígito, dobrando o tamanho do trecho.
    const candidatosLinha = texto.match(/\d[\d.\s]{35,200}\d/g) || [];
    for (const cand of candidatosLinha) {
        const digitos = cand.replace(/\D/g, '');
        if (digitos.length === 47 || digitos.length === 48) {
            const dec = decodificarLinhaDigitavel(digitos);
            if (dec.ok) return { ok: true, tipo: 'boleto', valor: dec.valor, vencimento: dec.vencimento, linhaDigitavel: digitos, credor: dec.banco ? `Boleto ${dec.banco}`.replace('Boleto ', '') : null, cnpj: null };
        }
    }

    // 2) chave de acesso de NF-e (44 dígitos) — indica DANFE (mesma observação da janela acima)
    let chaveAcesso = null;
    for (const cand of (texto.match(/\d[\d.\s]{40,180}\d/g) || [])) {
        const d = cand.replace(/\D/g, '');
        if (d.length === 44) { chaveAcesso = d; break; }
    }

    // 3) CNPJ do emitente — se achar, consulta a mesma API pública já usada no lançamento manual
    let cnpj = null, credor = null;
    const cnpjMatch = texto.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/);
    if (cnpjMatch) {
        const digitos = cnpjMatch[0].replace(/\D/g, '');
        if (validarCNPJ(digitos)) {
            cnpj = digitos;
            try {
                const res = await fetch(`https://publica.cnpj.ws/cnpj/${digitos}`);
                if (res.ok) { const d = await res.json(); credor = d.estabelecimento?.nome_fantasia || d.razao_social || null; }
            } catch { /* segue sem nome — usuário preenche */ }
        }
    }

    // 4) valor em reais no texto (ex.: "R$ 1.234,56") — só usado se não veio de linha digitável
    let valor = null;
    const valorMatch = texto.match(/R\$\s*([\d.]+,\d{2})/);
    if (valorMatch) valor = parseFloat(valorMatch[1].replace(/\./g, '').replace(',', '.'));

    if (!cnpj && !valor && !chaveAcesso) return { ok: false, motivo: 'sem_campos' };
    return { ok: true, tipo: chaveAcesso ? 'nota' : 'boleto', cnpj, credor, valor, vencimento: null, chaveAcesso };
}

async function _extrairDadosPdf(file) {
    const texto = await _extrairTextoPdf(file);
    const r = await _extrairCamposGenericos(texto);
    if (!r.ok && r.motivo === 'sem_texto') return { ok: false, motivo: 'pdf_sem_texto' };
    if (!r.ok && r.motivo === 'sem_campos') return { ok: false, motivo: 'pdf_sem_campos' };
    return r;
}

// --- Extração: OCR (Tesseract.js) para imagens e PDFs escaneados sem camada de texto ---
let _tesseractPronto = null;
async function _garantirTesseract() {
    if (window.Tesseract) return;
    if (!_tesseractPronto) {
        _tesseractPronto = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Não foi possível carregar o leitor de OCR — verifique sua conexão.'));
            document.head.appendChild(s);
        });
    }
    await _tesseractPronto;
}

// Roda OCR sobre uma imagem (data URL, <canvas> ou File/Blob) e devolve o texto reconhecido.
async function _ocrImagem(fonte, onProgresso) {
    await _garantirTesseract();
    const worker = await window.Tesseract.createWorker('por', 1, {
        logger: m => { if (onProgresso && m.status === 'recognizing text') onProgresso(Math.round((m.progress || 0) * 100)); }
    });
    try {
        const { data } = await worker.recognize(fonte);
        return data.text || '';
    } finally {
        await worker.terminate();
    }
}

// Renderiza as páginas de um PDF (sem camada de texto) como canvases, para servir de entrada ao OCR.
// Limitado às 3 primeiras páginas — boletos/notas cabem nisso e o custo de OCR cresce rápido por página.
async function _renderizarPaginasPdfComoImagens(file) {
    await _garantirPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const canvases = [];
    const maxPaginas = Math.min(pdf.numPages, 3);
    for (let i = 1; i <= maxPaginas; i++) {
        const pagina = await pdf.getPage(i);
        const viewport = pagina.getViewport({ scale: 2 }); // resolução maior ajuda a precisão do OCR
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width; canvas.height = viewport.height;
        await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        canvases.push(canvas);
    }
    return canvases;
}

async function _extrairDadosImagemOcr(dataUrl, onProgresso) {
    let texto;
    try { texto = await _ocrImagem(dataUrl, onProgresso); }
    catch (e) { return { ok: false, motivo: 'ocr_falhou', detalhe: e.message }; }
    const r = await _extrairCamposGenericos(texto);
    if (!r.ok && r.motivo === 'sem_texto') return { ok: false, motivo: 'ocr_sem_texto' };
    if (!r.ok && r.motivo === 'sem_campos') return { ok: false, motivo: 'ocr_sem_campos' };
    return r;
}

async function _extrairDadosPdfEscaneadoOcr(file, onProgresso) {
    let canvases;
    try { canvases = await _renderizarPaginasPdfComoImagens(file); }
    catch (e) { return { ok: false, motivo: 'ocr_falhou', detalhe: e.message }; }
    let textoTotal = '';
    for (let i = 0; i < canvases.length; i++) {
        const texto = await _ocrImagem(canvases[i], pct => onProgresso && onProgresso(Math.round((i + pct / 100) / canvases.length * 100)));
        textoTotal += texto + '\n';
    }
    const r = await _extrairCamposGenericos(textoTotal);
    if (!r.ok && r.motivo === 'sem_texto') return { ok: false, motivo: 'ocr_sem_texto' };
    if (!r.ok && r.motivo === 'sem_campos') return { ok: false, motivo: 'ocr_sem_campos' };
    return r;
}

// --- Visualizar anexo original de um lançamento (auditoria) ---
function verAnexoCP(id) {
    const cp = db.contas_pagar.find(x => x.id == id);
    if (!cp || !cp.arquivo_anexo_url) return;
    const tipo = cp.arquivo_anexo_tipo || '';
    if (tipo.includes('pdf') || tipo.startsWith('image/')) {
        const w = window.open('', '_blank');
        if (!w) { toast('Permita pop-ups para visualizar o anexo.', 'info'); return; }
        const nome = escapeHtml(cp.arquivo_anexo_nome || 'Anexo');
        w.document.write(tipo.includes('pdf')
            ? `<title>${nome}</title><embed src="${cp.arquivo_anexo_url}" type="application/pdf" style="width:100%;height:100vh;border:none">`
            : `<title>${nome}</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${cp.arquivo_anexo_url}" style="max-width:100%;max-height:100vh"></body>`);
    } else {
        const a = document.createElement('a');
        a.href = cp.arquivo_anexo_url; a.download = cp.arquivo_anexo_nome || 'anexo';
        document.body.appendChild(a); a.click(); a.remove();
    }
}

// --- FINANCEIRO: ESTADO E HELPERS ---
let _finPeriodo = 'mes';
let _finDataIni = '', _finDataFim = '';
let _finMetas = {};
let _chartFinCombo = null, _chartFinRec = null, _chartFinDesp = null;
let _chartFinEvolucao = null, _chartFinAging = null, _chartFinTopClientes = null, _chartFinFunil = null;
let _chartFinProjecao = null;
let _finProjDias = 30;
let _finSortRec = { col: 'venc', dir: 1 };
let _finSortPag = { col: 'venc', dir: 1 };

function setFinProjPeriodo(dias) {
    _finProjDias = dias;
    renderDashboardFinanceiro();
}

function toggleFinMetaEdit() {
    const row = document.getElementById('fin-meta-edit-row');
    if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
}

function toggleFinIndicadores() {
    const aberto = localStorage.getItem('sc_fin_indicadores_abertos') === 'true';
    localStorage.setItem('sc_fin_indicadores_abertos', aberto ? 'false' : 'true');
    aplicarEstadoFinAccordion();
}

function aplicarEstadoFinAccordion() {
    const el = document.getElementById('fin-accordion-indicadores');
    if (!el) return;
    const aberto = localStorage.getItem('sc_fin_indicadores_abertos') === 'true';
    el.classList.toggle('open', aberto);
}

const _finCenterTextPlugin = {
    id: 'finCenterText',
    afterDraw(chart) {
        const cfg = chart.options.plugins?.centerText;
        if (!cfg?.text) return;
        const { ctx, chartArea } = chart;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 13px system-ui,sans-serif'; ctx.fillStyle = '#242424';
        ctx.fillText(cfg.text, cx, cy - (cfg.subtext ? 8 : 0));
        if (cfg.subtext) {
            ctx.font = '10px system-ui,sans-serif'; ctx.fillStyle = '#8F8F8F';
            ctx.fillText(cfg.subtext, cx, cy + 9);
        }
        ctx.restore();
    }
};

function _finSortToggle(which, col) {
    const s = which === 'rec' ? _finSortRec : _finSortPag;
    if (s.col === col) s.dir *= -1; else { s.col = col; s.dir = 1; }
    renderDashboardFinanceiro();
}

function getFinPeriodo() {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    if (_finPeriodo === 'hoje') return { ini: hojeStr, fim: hojeStr, label: 'Hoje' };
    if (_finPeriodo === '7d') {
        const d = new Date(hoje); d.setDate(d.getDate() - 6);
        return { ini: d.toISOString().split('T')[0], fim: hojeStr, label: 'Últimos 7 dias' };
    }
    if (_finPeriodo === '30d') {
        const d = new Date(hoje); d.setDate(d.getDate() - 29);
        return { ini: d.toISOString().split('T')[0], fim: hojeStr, label: 'Últimos 30 dias' };
    }
    if (_finPeriodo === 'mes') {
        const ini = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`;
        const nome = hoje.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return { ini, fim: hojeStr, label: nome.charAt(0).toUpperCase() + nome.slice(1) };
    }
    const dIni = _finDataIni.split('-').reverse().join('/');
    const dFim = _finDataFim.split('-').reverse().join('/');
    return { ini: _finDataIni, fim: _finDataFim, label: `${dIni} – ${dFim}` };
}

function setFinPeriodo(tipo) {
    _finPeriodo = tipo;
    document.querySelectorAll('.fin-periodo-btn').forEach(b => b.classList.toggle('active', b.dataset.p === tipo));
    const cr = document.getElementById('fin-custom-range');
    if (cr) cr.style.display = tipo === 'custom' ? 'flex' : 'none';
    if (tipo !== 'custom') renderDashboardFinanceiro();
}

function aplicarFiltroCustom() {
    const ini = document.getElementById('fin-custom-ini')?.value;
    const fim = document.getElementById('fin-custom-fim')?.value;
    if (!ini || !fim || ini > fim) { showAlert('Selecione um intervalo de datas válido.', '⚠️'); return; }
    _finDataIni = ini; _finDataFim = fim;
    renderDashboardFinanceiro();
}

function salvarMetaMes() {
    if (!temAcesso('financeiro.dashboard', 'completo')) { showAlert('Você não tem permissão para realizar esta ação.', '🚫'); return; }
    const hoje = new Date();
    const key = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const val = parseFloat(document.getElementById('fin-meta-valor')?.value) || 0;
    if (!val) { showAlert('Informe o valor da meta.', '⚠️'); return; }
    _finMetas[key] = val;
    localStorage.setItem('sc_fin_metas', JSON.stringify(_finMetas));
    renderDashboardFinanceiro();
}

function _finGerarBuckets(ini, fim) {
    const iniD = new Date(ini + 'T00:00:00');
    const fimD = new Date(fim + 'T00:00:00');
    const dias = Math.round((fimD - iniD) / 86400000) + 1;
    if (dias <= 35) {
        return Array.from({ length: dias }, (_, i) => {
            const d = new Date(iniD); d.setDate(d.getDate() + i);
            const ds = d.toISOString().split('T')[0];
            return { label: d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }), ini: ds, fim: ds };
        });
    }
    const buckets = [];
    let cur = new Date(iniD);
    while (cur <= fimD) {
        const we = new Date(cur); we.setDate(we.getDate() + 6);
        if (we > fimD) we.setTime(fimD.getTime());
        buckets.push({
            label: cur.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
            ini: cur.toISOString().split('T')[0],
            fim: we.toISOString().split('T')[0]
        });
        cur.setDate(cur.getDate() + 7);
    }
    return buckets;
}

function gerarRelatorioFinanceiro() {
    const { ini, fim, label } = getFinPeriodo();
    const inRange = d => d && d >= ini && d <= fim;
    const fmt = v => (v||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('pt-BR') : '—';

    const recebido  = db.contas_receber.filter(cr=>cr.status==='Pago'&&inRange(cr.data_pagamento)).reduce((s,cr)=>s+cr.valor,0);
    const aReceber  = db.contas_receber.filter(cr=>cr.status!=='Pago'&&inRange(cr.data_vencimento)).reduce((s,cr)=>s+cr.valor,0);
    const totalPago = db.contas_pagar.filter(cp=>cp.status==='Pago'&&inRange(cp.data_pagamento)).reduce((s,cp)=>s+cp.valor,0);
    const aPagar    = db.contas_pagar.filter(cp=>cp.status!=='Pago'&&inRange(cp.data_vencimento)).reduce((s,cp)=>s+cp.valor,0);
    const saldoPrev = (recebido+aReceber)-(totalPago+aPagar);
    const lucro     = recebido-totalPago;
    const pedPagos  = new Set(db.contas_receber.filter(cr=>cr.status==='Pago'&&inRange(cr.data_pagamento)&&cr.pedido_id).map(cr=>cr.pedido_id));
    const ticketMedio = pedPagos.size ? recebido/pedPagos.size : 0;

    const kpiBox = (lbl, val, sub, cor) =>
        `<div style="background:${cor};border-radius:8px;padding:14px 16px;color:white">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.85;margin-bottom:4px">${lbl}</div>
            <div style="font-size:18px;font-weight:700">${val}</div>
            ${sub?`<div style="font-size:10px;opacity:.7;margin-top:2px">${sub}</div>`:''}
         </div>`;

    const proxRec = db.contas_receber.filter(cr=>cr.status!=='Pago').sort((a,b)=>a.data_vencimento.localeCompare(b.data_vencimento)).slice(0,10);
    const proxPag = db.contas_pagar.filter(cp=>cp.status!=='Pago').sort((a,b)=>a.data_vencimento.localeCompare(b.data_vencimento)).slice(0,10);

    const comboImg = document.getElementById('chart-fin-combo')?.toDataURL?.('image/png') || null;
    const recImg   = document.getElementById('chart-fin-rec')?.toDataURL?.('image/png') || null;
    const despImg  = document.getElementById('chart-fin-desp')?.toDataURL?.('image/png') || null;
    const evolImg  = document.getElementById('chart-fin-evolucao')?.toDataURL?.('image/png') || null;
    const agingImg = document.getElementById('chart-fin-aging')?.toDataURL?.('image/png') || null;
    const topImg   = document.getElementById('chart-fin-top-clientes')?.toDataURL?.('image/png') || null;
    const funilImg = document.getElementById('chart-fin-funil')?.toDataURL?.('image/png') || null;
    const empresa  = getEmpresa();

    const thStyle = 'padding:6px 8px;text-align:left;border:1px solid #E0E0E0;background:#FAFAFA;font-size:11px';
    const tdStyle = 'padding:5px 8px;border:1px solid #E0E0E0;font-size:12px';

    const mkTable = (rows, headers, emptyMsg) => `
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
            <thead><tr>${headers.map(h=>`<th style="${thStyle}${h.right?';text-align:right':''}">${h.label}</th>`).join('')}</tr></thead>
            <tbody>${rows.length ? rows : `<tr><td colspan="${headers.length}" style="${tdStyle};text-align:center;color:#8F8F8F">${emptyMsg}</td></tr>`}</tbody>
        </table>`;

    const rowsRec = proxRec.map(cr => {
        const at = cr.status==='Atrasado';
        return `<tr style="background:${at?'#FEF4F2':''}">
            <td style="${tdStyle}${at?';color:#F43927;font-weight:700':''}">${fmtDate(cr.data_vencimento)}</td>
            <td style="${tdStyle}">${escapeHtml(cr.cliente_nome)}</td>
            <td style="${tdStyle};color:#8F8F8F;font-size:11px">${escapeHtml(cr.descricao)}</td>
            <td style="${tdStyle};text-align:right;font-weight:700">R$ ${fmt(cr.valor)}</td>
            <td style="${tdStyle}">${cr.status}</td>
        </tr>`;
    });
    const rowsPag = proxPag.map(cp => {
        const at = cp.status==='Atrasado';
        return `<tr style="background:${at?'#FEF4F2':''}">
            <td style="${tdStyle}${at?';color:#F43927;font-weight:700':''}">${fmtDate(cp.data_vencimento)}</td>
            <td style="${tdStyle}">${escapeHtml(cp.credor_nome||cp.categoria||'—')}</td>
            <td style="${tdStyle};color:#8F8F8F;font-size:11px">${escapeHtml(cp.descricao)}</td>
            <td style="${tdStyle};text-align:right;font-weight:700">R$ ${fmt(cp.valor)}</td>
            <td style="${tdStyle}">${cp.status}</td>
        </tr>`;
    });

    const html = `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#242424">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #005D3B;padding-bottom:14px;margin-bottom:20px">
        <div>${empresa.logo?`<img src="${empresa.logo}" style="height:32px;margin-bottom:4px;display:block">`:''}
            <h1 style="color:#005D3B;margin:0;font-size:20px">${escapeHtml(empresa.nome||'SCTech')}</h1>
            <p style="margin:2px 0 0;color:#8F8F8F;font-size:12px">Relatório Financeiro · ${escapeHtml(label)}</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#8F8F8F">
            <div>Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
            <div>${ini.split('-').reverse().join('/')} – ${fim.split('-').reverse().join('/')}</div>
        </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        ${kpiBox('Total Recebido', 'R$ '+fmt(recebido), label, '#005D3B')}
        ${kpiBox('A Receber', 'R$ '+fmt(aReceber), 'vence no período', '#2D77C1')}
        ${kpiBox('A Pagar', 'R$ '+fmt(aPagar), 'vence no período', '#F2C924')}
        ${kpiBox('Saldo Previsto', 'R$ '+fmt(saldoPrev), 'receb.+a receber−despesas', saldoPrev>=0?'#17E8FF':'#F43927')}
        ${kpiBox('Lucro (Caixa)', 'R$ '+fmt(lucro), 'recebido − saídas pagas', lucro>=0?'#159912':'#F43927')}
        ${kpiBox('Ticket Médio', ticketMedio>0?'R$ '+fmt(ticketMedio):'—', pedPagos.size+' pedido(s)', '#9B31C8')}
    </div>
    ${evolImg?`<h3 style="font-size:13px;color:#242424;margin:0 0 6px">Evolução Mensal (12 meses)</h3><img src="${evolImg}" style="width:100%;border-radius:6px;margin-bottom:14px">`:''}
    ${comboImg?`<h3 style="font-size:13px;color:#242424;margin:0 0 6px">Entradas × Saídas × Saldo (período)</h3><img src="${comboImg}" style="width:100%;border-radius:6px;margin-bottom:14px">`:''}
    ${(agingImg||topImg||funilImg)?`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        ${agingImg?`<div><h3 style="font-size:12px;color:#242424;margin:0 0 4px">Aging de Recebíveis</h3><img src="${agingImg}" style="width:100%"></div>`:''}
        ${topImg?`<div><h3 style="font-size:12px;color:#242424;margin:0 0 4px">Top 10 Clientes</h3><img src="${topImg}" style="width:100%"></div>`:''}
        ${funilImg?`<div><h3 style="font-size:12px;color:#242424;margin:0 0 4px">Funil de Pedidos</h3><img src="${funilImg}" style="width:100%"></div>`:''}
    </div>`:''}
    ${(recImg||despImg)?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        ${recImg?`<div><h3 style="font-size:13px;color:#242424;margin:0 0 4px">Recebimentos</h3><img src="${recImg}" style="width:100%"></div>`:''}
        ${despImg?`<div><h3 style="font-size:13px;color:#242424;margin:0 0 4px">Despesas por Categoria</h3><img src="${despImg}" style="width:100%"></div>`:''}
    </div>`:''}
    <h3 style="font-size:13px;color:#242424;margin:8px 0 6px;border-bottom:1px solid #E0E0E0;padding-bottom:4px">📥 Próximos Recebimentos</h3>
    ${mkTable(rowsRec, [{label:'Vencimento'},{label:'Cliente'},{label:'Descrição'},{label:'Valor',right:true},{label:'Status'}], 'Nenhum recebimento pendente.')}
    <h3 style="font-size:13px;color:#242424;margin:8px 0 6px;border-bottom:1px solid #E0E0E0;padding-bottom:4px">📤 Próximos Pagamentos</h3>
    ${mkTable(rowsPag, [{label:'Vencimento'},{label:'Credor'},{label:'Descrição'},{label:'Valor',right:true},{label:'Status'}], 'Nenhum pagamento pendente.')}
    <div style="margin-top:20px;padding-top:10px;border-top:1px solid #E0E0E0;font-size:10px;color:#8F8F8F;text-align:center">
        Relatório gerado pelo sistema SCTech · ${new Date().toLocaleString('pt-BR')}
    </div>
</div>`;
    abrirDocModal(html, `Relatório Financeiro — ${label}`);
}

function mostrarTabFinanceiro(tab) {
    if (_curTabFin !== tab) { _prevTabFin = _curTabFin; _curTabFin = tab; }
    document.querySelectorAll('.fin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.fin-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.fin-tab-btn[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`fin-${tab}`)?.classList.add('active');
    if (tab === 'dashboard') renderDashboardFinanceiro();
    else if (tab === 'receber') renderContasReceber();
    else if (tab === 'pagar')   renderContasPagar();
    else if (tab === 'fixas')   renderDespesasFixas();
    else if (tab === 'dre')     renderDRE();
    _tabBackBtn('.tab-nav', _prevTabFin, () => mostrarTabFinanceiro(_prevTabFin));
}

function renderDashboardFinanceiro() {
    if (typeof Chart === 'undefined') return;
    _migrarFinanceiroPedidos();
    atualizarStatusVencimentos();
    document.getElementById('fin-meta-edit-btn')?.style.setProperty('display', temAcesso('financeiro.dashboard', 'completo') ? '' : 'none');
    try { _finMetas = JSON.parse(localStorage.getItem('sc_fin_metas') || '{}'); } catch(e) { _finMetas = {}; }

    const { ini, fim, label } = getFinPeriodo();
    const inRange = d => d && d >= ini && d <= fim;
    const hojeStr = new Date().toISOString().split('T')[0];
    const fmt = v => (v||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const kpiBox = (lbl, val, sub, cor) =>
        `<div class="fin-kpi fin-kpi-${cor}"><div class="fin-kpi-label">${lbl}</div><div class="fin-kpi-value">${val}</div>${sub?`<div class="fin-kpi-sub">${sub}</div>`:''}</div>`;

    const periodoLabelEl = document.getElementById('fin-periodo-label');
    if (periodoLabelEl) periodoLabelEl.textContent = label;

    // ── KPIs ──────────────────────────────────────────────────────
    const recebido  = db.contas_receber.filter(cr=>cr.status==='Pago'&&inRange(cr.data_pagamento)).reduce((s,cr)=>s+cr.valor,0);
    const aReceber  = db.contas_receber.filter(cr=>cr.status!=='Pago'&&inRange(cr.data_vencimento)).reduce((s,cr)=>s+cr.valor,0);
    const totalPago = db.contas_pagar.filter(cp=>cp.status==='Pago'&&inRange(cp.data_pagamento)).reduce((s,cp)=>s+cp.valor,0);
    const aPagar    = db.contas_pagar.filter(cp=>cp.status!=='Pago'&&inRange(cp.data_vencimento)).reduce((s,cp)=>s+cp.valor,0);
    const saldoPrev = (recebido+aReceber)-(totalPago+aPagar);
    const lucro     = recebido-totalPago;
    const pedPagos  = new Set(db.contas_receber.filter(cr=>cr.status==='Pago'&&inRange(cr.data_pagamento)&&cr.pedido_id).map(cr=>cr.pedido_id));
    const ticketMedio = pedPagos.size ? recebido/pedPagos.size : 0;

    // ── 4 CARDS PRINCIPAIS ──────────────────────────────────────────
    // Só Saldo Previsto e Inadimplência usam cor de fundo com significado;
    // A Receber/A Pagar são fatos neutros (não são "bons" nem "ruins").
    const totalCR      = db.contas_receber.filter(cr=>cr.status!=='Pago').reduce((s,cr)=>s+cr.valor,0);
    const totalAtr     = db.contas_receber.filter(cr=>cr.status==='Atrasado').reduce((s,cr)=>s+cr.valor,0);
    const inadimplPct  = totalCR > 0 ? totalAtr/totalCR*100 : 0;
    const corInadimpl  = inadimplPct > 10 ? 'fin-kpi-red' : 'fin-kpi-neutral';

    const kpiEl = document.getElementById('fin-kpis');
    if (kpiEl) kpiEl.innerHTML = `
        <div class="fin-kpi ${saldoPrev>=0?'fin-kpi-green':'fin-kpi-red'}"><div class="fin-kpi-label">Saldo Previsto</div><div class="fin-kpi-value">R$ ${fmt(saldoPrev)}</div><div class="fin-kpi-sub">receb. + a receber − despesas</div></div>
        <div class="fin-kpi fin-kpi-neutral"><div class="fin-kpi-label">A Receber</div><div class="fin-kpi-value">R$ ${fmt(aReceber)}</div><div class="fin-kpi-sub">vence no período</div></div>
        <div class="fin-kpi fin-kpi-neutral"><div class="fin-kpi-label">A Pagar</div><div class="fin-kpi-value">R$ ${fmt(aPagar)}</div><div class="fin-kpi-sub">vence no período</div></div>
        <div class="fin-kpi ${corInadimpl}"><div class="fin-kpi-label">Inadimplência</div><div class="fin-kpi-value">${inadimplPct.toFixed(1)}%</div><div class="fin-kpi-sub">R$ ${fmt(totalAtr)} atrasado</div></div>`;

    // ── INDICADORES DETALHADOS (seção colapsável) ───────────────────
    // Neutros por padrão; só o Lucro carrega cor (confirmação positiva/negativa real).
    const kpis2El = document.getElementById('fin-kpis2');
    if (kpis2El) {
        let pmrSoma = 0, pmrN = 0;
        db.pedidos.filter(p=>normalizarStatus(p.status)==='Instalado'&&p.data_instalado).forEach(p => {
            const criacao = typeof p.data_criacao==='number' ? p.data_criacao : (typeof p.id==='number' ? p.id : 0);
            const dias = Math.round((p.data_instalado - criacao) / 86400000);
            if (dias > 0 && dias < 730) { pmrSoma += dias; pmrN++; }
        });
        const pmr = pmrN > 0 ? Math.round(pmrSoma/pmrN) : 0;

        const margemPct = recebido > 0 ? lucro/recebido*100 : 0;

        const pedAndamento = db.pedidos.filter(p=>{ const s=normalizarStatus(p.status); return s!=='Instalado'&&s!=='Orçamento'; });
        const valPipeline  = pedAndamento.reduce((s,p)=>s+(p.valor||0),0);

        const totalPeds    = db.pedidos.length;
        const pConvertidos = db.pedidos.filter(p=>normalizarStatus(p.status)!=='Orçamento').length;
        const taxaConv     = totalPeds > 0 ? pConvertidos/totalPeds*100 : 0;

        kpis2El.innerHTML =
            kpiBox('Total Recebido', 'R$ '+fmt(recebido), escapeHtml(label), 'neutral') +
            kpiBox('Lucro (Caixa)', 'R$ '+fmt(lucro), 'recebido − saídas pagas', lucro>=0?'green':'red') +
            kpiBox('Ticket Médio', ticketMedio>0?'R$ '+fmt(ticketMedio):'—', `${pedPagos.size} pedido(s) com recebimento`, 'neutral') +
            kpiBox('PMR', pmr > 0 ? pmr+' dias' : '—', pmrN ? `${pmrN} pedidos concluídos` : 'Sem dados', 'neutral') +
            kpiBox('Margem Líquida', (margemPct>=0?'':'-')+Math.abs(margemPct).toFixed(1)+'%', escapeHtml(label), 'neutral') +
            kpiBox('Pipeline', 'R$ '+fmt(valPipeline), `${pedAndamento.length} em andamento`, 'neutral') +
            kpiBox('Conversão', taxaConv.toFixed(1)+'%', `${pConvertidos}/${totalPeds} pedidos`, 'neutral');
    }
    aplicarEstadoFinAccordion();

    // ── PROJEÇÃO DE FLUXO: bloco único com seletor 30/60/90 ─────────
    document.querySelectorAll('.fin-proj-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.d) === _finProjDias));
    const horizStr = new Date(new Date().getTime()+_finProjDias*86400000).toISOString().split('T')[0];
    const projBuckets = _finGerarBuckets(hojeStr, horizStr);
    const projEnt = projBuckets.map(b => db.contas_receber.filter(cr=>cr.status!=='Pago'&&cr.data_vencimento>=b.ini&&cr.data_vencimento<=b.fim).reduce((s,cr)=>s+cr.valor,0));
    const projSai = projBuckets.map(b => db.contas_pagar.filter(cp=>cp.status!=='Pago'&&cp.data_vencimento>=b.ini&&cp.data_vencimento<=b.fim).reduce((s,cp)=>s+cp.valor,0));
    const projEntTotal = projEnt.reduce((s,v)=>s+v,0);
    const projSaiTotal = projSai.reduce((s,v)=>s+v,0);
    const projSaldoTotal = projEntTotal - projSaiTotal;

    const ctxProj = document.getElementById('chart-fin-projecao');
    if (ctxProj) {
        if (_chartFinProjecao) _chartFinProjecao.destroy();
        _chartFinProjecao = new Chart(ctxProj, {
            data: { labels: projBuckets.map(b=>b.label), datasets: [
                { type:'bar',  label:'Entradas', data:projEnt, backgroundColor:'#8FD98Dcc', borderColor:'#159912', borderWidth:1, borderRadius:3, yAxisID:'y' },
                { type:'bar',  label:'Saídas',   data:projSai, backgroundColor:'#F79B90cc', borderColor:'#F43927', borderWidth:1, borderRadius:3, yAxisID:'y' },
                { type:'line', label:'Saldo',    data:projEnt.map((e,i)=>e-projSai[i]), borderColor:'#005D3B', backgroundColor:'rgba(0,93,59,0.06)', borderWidth:2, pointRadius:3, fill:true, tension:0.35, yAxisID:'y' }
            ]},
            options: { responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ position:'top', labels:{ font:{size:11}, boxWidth:10, padding:8 }}},
                scales:{ y:{ ticks:{ callback:v=>'R$'+v.toLocaleString('pt-BR'), font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'}},
                          x:{ grid:{display:false}, ticks:{ font:{size:10}}}}
            }
        });
    }
    const resumoEl = document.getElementById('fin-proj-resumo');
    if (resumoEl) resumoEl.innerHTML = `
        <div class="fp-item"><span class="fp-label">▲ Entradas totais</span><span class="fp-val" style="color:#159912">R$ ${fmt(projEntTotal)}</span></div>
        <div class="fp-item"><span class="fp-label">▼ Saídas totais</span><span class="fp-val" style="color:#F43927">R$ ${fmt(projSaiTotal)}</span></div>
        <div class="fp-item"><span class="fp-label">Saldo líquido previsto</span><span class="fp-val" style="color:${projSaldoTotal>=0?'#005D3B':'#F43927'}">${projSaldoTotal>=0?'+':''}R$ ${fmt(projSaldoTotal)}</span></div>`;

    // ── ALERTAS ───────────────────────────────────────────────────
    const alertasEl = document.getElementById('fin-alertas');
    if (alertasEl) {
        const mkA = (tipo, icon, texto) => `<div class="fin-alerta fin-alerta-${tipo}"><span style="font-size:18px;flex-shrink:0">${icon}</span><span>${texto}</span></div>`;
        const alertas = [];

        if (alertaAtivo('fin_vencimento')) {
            const venHojeRec = db.contas_receber.filter(cr=>cr.status==='Pendente'&&cr.data_vencimento===hojeStr);
            const venHojePag = db.contas_pagar.filter(cp=>cp.status==='Pendente'&&cp.data_vencimento===hojeStr);
            if (venHojeRec.length+venHojePag.length)
                alertas.push(mkA('warning','⏰',`<strong>${venHojeRec.length+venHojePag.length} conta(s) vencem hoje</strong> — ${venHojeRec.length} a receber (R$ ${fmt(venHojeRec.reduce((s,x)=>s+x.valor,0))}) · ${venHojePag.length} a pagar (R$ ${fmt(venHojePag.reduce((s,x)=>s+x.valor,0))})`));
        }

        if (alertaAtivo('fin_atraso')) {
            const atRec = db.contas_receber.filter(cr=>cr.status==='Atrasado');
            if (atRec.length)
                alertas.push(mkA('danger','❌',`<strong>${atRec.length} recebimento(s) em atraso</strong> — R$ ${fmt(atRec.reduce((s,x)=>s+x.valor,0))} de ${new Set(atRec.map(x=>x.cliente_nome)).size} cliente(s)`));
            const atPag = db.contas_pagar.filter(cp=>cp.status==='Atrasado');
            if (atPag.length)
                alertas.push(mkA('danger','💸',`<strong>${atPag.length} pagamento(s) em atraso</strong> — R$ ${fmt(atPag.reduce((s,x)=>s+x.valor,0))}`));
        }

        const hoje2 = new Date();
        const mesAtStr = `${hoje2.getFullYear()}-${String(hoje2.getMonth()+1).padStart(2,'0')}`;
        const mesAntD  = new Date(hoje2.getFullYear(), hoje2.getMonth()-1, 1);
        const mesAntStr = `${mesAntD.getFullYear()}-${String(mesAntD.getMonth()+1).padStart(2,'0')}`;
        const fatAt = db.contas_receber.filter(cr=>cr.status==='Pago'&&(cr.data_pagamento||'').startsWith(mesAtStr)).reduce((s,cr)=>s+cr.valor,0);
        const fatAnt= db.contas_receber.filter(cr=>cr.status==='Pago'&&(cr.data_pagamento||'').startsWith(mesAntStr)).reduce((s,cr)=>s+cr.valor,0);
        if (alertaAtivo('fin_tendencia') && fatAnt>0) {
            const pct = ((fatAt-fatAnt)/fatAnt*100).toFixed(1);
            alertas.push(mkA(fatAt>=fatAnt?'success':'warning', fatAt>=fatAnt?'📈':'📉',
                `Faturamento deste mês <strong>${fatAt>=fatAnt?'+':''}${pct}%</strong> vs. mês anterior (R$ ${fmt(fatAt)} × R$ ${fmt(fatAnt)})`));
        }

        const metaMes = _finMetas[mesAtStr]||0;
        if (alertaAtivo('fin_meta') && metaMes>0) {
            const pctMeta = (fatAt/metaMes*100).toFixed(1);
            if (fatAt>=metaMes)
                alertas.push(mkA('success','🏆',`Meta do mês atingida! <strong>${pctMeta}%</strong> — R$ ${fmt(fatAt)} de R$ ${fmt(metaMes)}`));
            else if (fatAt>=metaMes*0.8)
                alertas.push(mkA('info','🎯',`Faltam <strong>R$ ${fmt(metaMes-fatAt)}</strong> para atingir a meta (${pctMeta}% concluído)`));
        }

        const em7 = new Date(hojeStr+'T00:00:00'); em7.setDate(em7.getDate()+7);
        const em7Str = em7.toISOString().split('T')[0];
        const proxVenc = db.contas_receber.filter(cr=>cr.status!=='Pago'&&cr.data_vencimento>hojeStr&&cr.data_vencimento<=em7Str).length
                       + db.contas_pagar.filter(cp=>cp.status!=='Pago'&&cp.data_vencimento>hojeStr&&cp.data_vencimento<=em7Str).length;
        if (alertaAtivo('fin_vencimento') && proxVenc>=3)
            alertas.push(mkA('info','📋',`<strong>${proxVenc} conta(s)</strong> vencem nos próximos 7 dias`));

        const _h7 = new Date(hojeStr+'T00:00:00'); _h7.setDate(_h7.getDate()+7);
        const _h7s = _h7.toISOString().split('T')[0];
        const _ent7 = db.contas_receber.filter(cr=>cr.status!=='Pago'&&cr.data_vencimento>=hojeStr&&cr.data_vencimento<=_h7s).reduce((s,cr)=>s+cr.valor,0);
        const _sai7 = db.contas_pagar.filter(cp=>cp.status!=='Pago'&&cp.data_vencimento>=hojeStr&&cp.data_vencimento<=_h7s).reduce((s,cp)=>s+cp.valor,0);
        if (alertaAtivo('fin_gap') && _sai7 > _ent7 && _sai7 > 0)
            alertas.push(mkA('danger','⚠️',`Gap de caixa: saídas superam entradas nos próximos 7 dias em <strong>R$ ${fmt(_sai7-_ent7)}</strong> (entradas: R$ ${fmt(_ent7)} · saídas: R$ ${fmt(_sai7)})`));

        alertasEl.innerHTML = alertas.join('');
    }

    // ── META ──────────────────────────────────────────────────────
    const hoje3 = new Date();
    const mesKey = `${hoje3.getFullYear()}-${String(hoje3.getMonth()+1).padStart(2,'0')}`;
    const metaValor  = _finMetas[mesKey]||0;
    const fatMesAt   = db.contas_receber.filter(cr=>cr.status==='Pago'&&(cr.data_pagamento||'').startsWith(mesKey)).reduce((s,cr)=>s+cr.valor,0);
    const metaInputEl = document.getElementById('fin-meta-valor');
    if (metaInputEl && !metaInputEl._userEditing) metaInputEl.value = metaValor||'';
    const nomeMes = hoje3.toLocaleString('pt-BR',{month:'long',year:'numeric'});
    const labelMetaEl = document.getElementById('fin-meta-mes-label');
    if (labelMetaEl) labelMetaEl.textContent = nomeMes.charAt(0).toUpperCase()+nomeMes.slice(1);
    const progressEl = document.getElementById('fin-meta-progress');
    if (progressEl) {
        if (!metaValor) {
            progressEl.innerHTML = '<p style="color:#8F8F8F;font-size:13px;text-align:center;padding:8px 0">Defina uma meta acima para acompanhar seu progresso.</p>';
        } else {
            const pctRaw = Math.min(100, fatMesAt/metaValor*100);
            const pctStr = pctRaw.toFixed(1);
            const cor = pctRaw>=100?'#005D3B':pctRaw>=70?'#159912':pctRaw>=40?'#F2C924':'#F43927';
            progressEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
                    <span style="color:#8F8F8F">Faturado: <strong>R$ ${fmt(fatMesAt)}</strong></span>
                    <span style="color:#8F8F8F">Meta: <strong>R$ ${fmt(metaValor)}</strong></span>
                    <span style="font-weight:700;color:${cor}">${pctStr}%</span>
                </div>
                <div style="background:#F1F1F1;border-radius:8px;height:22px;overflow:hidden">
                    <div style="height:100%;width:${pctStr}%;background:linear-gradient(90deg,${cor},${cor}cc);border-radius:8px;transition:width .5s;display:flex;align-items:center;justify-content:flex-end;padding-right:${pctRaw>10?8:0}px">
                        ${pctRaw>12?`<span style="font-size:11px;font-weight:700;color:#fff">${pctStr}%</span>`:''}
                    </div>
                </div>
                <p style="font-size:12px;color:${pctRaw>=100?'#005D3B':'#8F8F8F'};margin-top:5px;font-weight:${pctRaw>=100?700:400}">
                    ${pctRaw>=100?'🏆 Meta atingida!':`Faltam <strong style="color:var(--dark)">R$ ${fmt(metaValor-fatMesAt)}</strong> para a meta.`}
                </p>`;
        }
    }

    // ── EVOLUÇÃO MENSAL 12 MESES ──────────────────────────────────
    const _hj12 = new Date();
    const evolLabels = [], evolRec12 = [], evolPag12 = [];
    for (let i=11;i>=0;i--) {
        const d = new Date(_hj12.getFullYear(), _hj12.getMonth()-i, 1);
        const ms = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        evolLabels.push(d.toLocaleString('pt-BR',{month:'short'})+'/'+String(d.getFullYear()).slice(2));
        evolRec12.push(db.contas_receber.filter(cr=>cr.status==='Pago'&&(cr.data_pagamento||'').startsWith(ms)).reduce((s,cr)=>s+cr.valor,0));
        evolPag12.push(db.contas_pagar.filter(cp=>cp.status==='Pago'&&(cp.data_pagamento||'').startsWith(ms)).reduce((s,cp)=>s+cp.valor,0));
    }
    const ctxEvol = document.getElementById('chart-fin-evolucao');
    if (ctxEvol) {
        if (_chartFinEvolucao) _chartFinEvolucao.destroy();
        _chartFinEvolucao = new Chart(ctxEvol, {
            data:{ labels:evolLabels, datasets:[
                {type:'bar',  label:'Entradas', data:evolRec12, backgroundColor:'#8FD98Dcc', borderColor:'#159912', borderWidth:1, borderRadius:3, yAxisID:'y'},
                {type:'bar',  label:'Saídas',   data:evolPag12, backgroundColor:'#F79B90cc', borderColor:'#F43927', borderWidth:1, borderRadius:3, yAxisID:'y'},
                {type:'line', label:'Resultado', data:evolRec12.map((e,i)=>e-evolPag12[i]), borderColor:'#005D3B', backgroundColor:'rgba(0,93,59,0.06)', borderWidth:2, pointRadius:3, fill:true, tension:0.35, yAxisID:'y'}
            ]},
            options:{ responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ position:'top', labels:{ font:{size:11}, boxWidth:10, padding:8 }}},
                scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>'R$'+v.toLocaleString('pt-BR'), font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'}},
                          x:{ grid:{display:false}, ticks:{ font:{size:10}}}}
            }
        });
    }

    // ── AGING DE RECEBÍVEIS ───────────────────────────────────────
    const _hjD = new Date(hojeStr+'T00:00:00');
    const agBuckets = [
        {label:'A vencer',     color:'#159912', check:d=>d>0},
        {label:'Vence hoje',   color:'#F2C924', check:d=>d===0},
        {label:'1–7d atraso',  color:'#FF7F08', check:d=>d<0&&d>=-7},
        {label:'8–30d atraso', color:'#F43927', check:d=>d<-7&&d>=-30},
        {label:'+30d atraso',  color:'#B3160A', check:d=>d<-30},
    ];
    const agVals = agBuckets.map(()=>0);
    db.contas_receber.filter(cr=>cr.status!=='Pago'&&cr.data_vencimento).forEach(cr=>{
        const diff = Math.round((new Date(cr.data_vencimento+'T00:00:00')-_hjD)/86400000);
        for (let i=0;i<agBuckets.length;i++) { if (agBuckets[i].check(diff)) { agVals[i]+=cr.valor; break; } }
    });
    const ctxAging = document.getElementById('chart-fin-aging');
    if (ctxAging) {
        if (_chartFinAging) _chartFinAging.destroy();
        _chartFinAging = new Chart(ctxAging, {
            type:'bar',
            data:{labels:agBuckets.map(b=>b.label), datasets:[{data:agVals, backgroundColor:agBuckets.map(b=>b.color+'cc'), borderColor:agBuckets.map(b=>b.color), borderWidth:1, borderRadius:4}]},
            options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
                plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>' R$ '+ctx.raw.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}}},
                scales:{ x:{beginAtZero:true, ticks:{callback:v=>'R$'+v.toLocaleString('pt-BR'),font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'}},
                          y:{ticks:{font:{size:11}}, grid:{display:false}}}
            }
        });
    }

    // ── TOP 10 CLIENTES ───────────────────────────────────────────
    const cliMap = {};
    db.contas_receber.filter(cr=>cr.status==='Pago'&&cr.cliente_nome).forEach(cr=>{ cliMap[cr.cliente_nome]=(cliMap[cr.cliente_nome]||0)+cr.valor; });
    const topCli = Object.entries(cliMap).sort(([,a],[,b])=>b-a).slice(0,10);
    const ctxTop = document.getElementById('chart-fin-top-clientes');
    if (ctxTop) {
        if (_chartFinTopClientes) _chartFinTopClientes.destroy();
        if (topCli.length) {
            _chartFinTopClientes = new Chart(ctxTop, {
                type:'bar',
                data:{labels:topCli.map(([n])=>n.length>16?n.slice(0,16)+'…':n), datasets:[{data:topCli.map(([,v])=>v), backgroundColor:'#005D3Bcc', borderColor:'#005D3B', borderWidth:1, borderRadius:3}]},
                options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
                    plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>' R$ '+ctx.raw.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}}},
                    scales:{ x:{beginAtZero:true, ticks:{callback:v=>'R$'+v.toLocaleString('pt-BR'),font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'}},
                              y:{ticks:{font:{size:10}}, grid:{display:false}}}
                }
            });
        } else {
            const el = ctxTop.parentElement;
            if (!el.querySelector('.fin-sem-dados')) { const p=document.createElement('p'); p.className='fin-sem-dados'; p.style.cssText='color:#8F8F8F;font-size:12px;text-align:center;padding:20px 0'; p.textContent='Sem recebimentos registrados.'; el.appendChild(p); }
        }
    }

    // ── FUNIL DE PEDIDOS ──────────────────────────────────────────
    const FUNIL_ST = [
        {key:'Orçamento',            label:'Orçamento',     color:'#F2C924'},
        {key:'Medição',              label:'Medição',       color:'#2D77C1'},
        {key:'Aguardando Tecido',    label:'Ag. Tecido',    color:'#FF7F08'},
        {key:'Na Costura',           label:'Na Costura',    color:'#9B31C8'},
        {key:'Pronto p/ Instalação', label:'Pronto Inst.',  color:'#005D3B'},
        {key:'Aguardando Pagamento', label:'Ag. Pagamento', color:'#FF575F'},
        {key:'Instalado',            label:'Instalado',     color:'#159912'},
    ];
    const funilCounts = FUNIL_ST.map(s=>db.pedidos.filter(p=>normalizarStatus(p.status)===s.key).length);
    const ctxFunil = document.getElementById('chart-fin-funil');
    if (ctxFunil) {
        if (_chartFinFunil) _chartFinFunil.destroy();
        _chartFinFunil = new Chart(ctxFunil, {
            type:'bar',
            data:{labels:FUNIL_ST.map(s=>s.label), datasets:[{data:funilCounts, backgroundColor:FUNIL_ST.map(s=>s.color+'cc'), borderColor:FUNIL_ST.map(s=>s.color), borderWidth:1, borderRadius:4}]},
            options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
                plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${ctx.raw} pedido${ctx.raw!==1?'s':''}`}}},
                scales:{ x:{beginAtZero:true, ticks:{stepSize:1,font:{size:10}}, grid:{color:'rgba(0,0,0,0.05)'}},
                          y:{ticks:{font:{size:10}}, grid:{display:false}}}
            }
        });
    }

    // ── GRÁFICO COMBO ─────────────────────────────────────────────
    const buckets  = _finGerarBuckets(ini, fim);
    const entradas = buckets.map(b=>db.contas_receber.filter(cr=>cr.status==='Pago'&&cr.data_pagamento>=b.ini&&cr.data_pagamento<=b.fim).reduce((s,cr)=>s+cr.valor,0));
    const saidas   = buckets.map(b=>db.contas_pagar.filter(cp=>cp.status==='Pago'&&cp.data_pagamento>=b.ini&&cp.data_pagamento<=b.fim).reduce((s,cp)=>s+cp.valor,0));
    let _acc = 0;
    const saldos = entradas.map((e, i) => { _acc += e - saidas[i]; return _acc; });
    const ctxCombo = document.getElementById('chart-fin-combo');
    if (ctxCombo) {
        if (_chartFinCombo) _chartFinCombo.destroy();
        _chartFinCombo = new Chart(ctxCombo, {
            data: { labels: buckets.map(b=>b.label), datasets: [
                { type:'bar',  label:'Entradas', data:entradas, backgroundColor:'#8FD98D', borderColor:'#159912', borderWidth:1, borderRadius:4, yAxisID:'y' },
                { type:'bar',  label:'Saídas',   data:saidas,   backgroundColor:'#F79B90', borderColor:'#F43927', borderWidth:1, borderRadius:4, yAxisID:'y' },
                { type:'line', label:'Saldo',    data:saldos,   borderColor:'#005D3B', backgroundColor:'rgba(0,93,59,0.08)', pointRadius:3, borderWidth:2, fill:true, yAxisID:'y', tension:0.3 }
            ]},
            options: { responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ position:'top', labels:{ font:{size:11}, padding:10, boxWidth:11 }}},
                scales:{
                    y:{ beginAtZero:true, ticks:{ callback:v=>'R$'+v.toLocaleString('pt-BR'), font:{size:10} }, grid:{color:'rgba(0,0,0,0.05)'} },
                    x:{ grid:{display:false}, ticks:{ font:{size:10}, maxRotation:45 }}
                }
            }
        });
    }

    // ── DONUT RECEBIMENTOS ────────────────────────────────────────
    const recPago = db.contas_receber.filter(cr=>cr.status==='Pago'&&inRange(cr.data_pagamento)).reduce((s,cr)=>s+cr.valor,0);
    const recPend = db.contas_receber.filter(cr=>cr.status==='Pendente'&&inRange(cr.data_vencimento)).reduce((s,cr)=>s+cr.valor,0);
    const recAtr  = db.contas_receber.filter(cr=>cr.status==='Atrasado').reduce((s,cr)=>s+cr.valor,0);
    const totalRec = recPago + recPend + recAtr;
    const ctxRec  = document.getElementById('chart-fin-rec');
    if (ctxRec) {
        if (_chartFinRec) _chartFinRec.destroy();
        _chartFinRec = new Chart(ctxRec, {
            type:'doughnut',
            data:{ labels:['Recebido','Pendente','Atrasado'], datasets:[{ data:[recPago,recPend,recAtr], backgroundColor:['#159912cc','#F2C924cc','#F43927cc'], borderColor:['#159912','#F2C924','#F43927'], borderWidth:2, hoverOffset:6 }]},
            options:{ responsive:true, maintainAspectRatio:true, cutout:'65%', plugins:{ legend:{ position:'bottom', labels:{ font:{size:11}, padding:8, boxWidth:10 }}, centerText:{ text: totalRec > 0 ? 'R$ '+fmt(totalRec) : '—', subtext:'Total' }}},
            plugins:[_finCenterTextPlugin]
        });
    }

    // ── DONUT DESPESAS POR CATEGORIA ─────────────────────────────
    const CAT_LABELS = { tecido:'Tecido/Mat.', salario:'Salário', comissao_rt:'Comissão RT', aluguel:'Aluguel', conta:'Contas', outro:'Outros', costureira:'Costureira', instalador:'Instalador' };
    const CAT_CORES  = { tecido:'#9B31C8', salario:'#F2C924', comissao_rt:'#9B31C8', aluguel:'#F43927', conta:'#2D77C1', outro:'#8F8F8F', costureira:'#D70085', instalador:'#FF7F08' };
    const despCats = {};
    db.contas_pagar.filter(cp=>inRange(cp.data_vencimento)).forEach(cp => { const c=cp.categoria||'outro'; despCats[c]=(despCats[c]||0)+cp.valor; });
    const catKeys   = Object.keys(despCats);
    const totalDesp = catKeys.reduce((s,k)=>s+despCats[k], 0);
    const ctxDesp   = document.getElementById('chart-fin-desp');
    if (ctxDesp) {
        if (_chartFinDesp) _chartFinDesp.destroy();
        _chartFinDesp = catKeys.length ? new Chart(ctxDesp, {
            type:'doughnut',
            data:{ labels:catKeys.map(k=>CAT_LABELS[k]||k), datasets:[{ data:catKeys.map(k=>despCats[k]), backgroundColor:catKeys.map(k=>(CAT_CORES[k]||'#8F8F8F')+'cc'), borderColor:catKeys.map(k=>CAT_CORES[k]||'#8F8F8F'), borderWidth:2, hoverOffset:6 }]},
            options:{ responsive:true, maintainAspectRatio:true, cutout:'65%', plugins:{ legend:{ position:'bottom', labels:{ font:{size:10}, padding:7, boxWidth:10 }}, centerText:{ text:'R$ '+fmt(totalDesp), subtext:'Total' }}},
            plugins:[_finCenterTextPlugin]
        }) : null;
        if (!catKeys.length) {
            const p = ctxDesp.parentElement.querySelector('p.fin-sem-desp');
            if (!p) { const el=document.createElement('p'); el.className='fin-sem-desp'; el.style.cssText='color:#8F8F8F;font-size:12px;text-align:center;padding:20px 0'; el.textContent='Sem despesas no período.'; ctxDesp.after(el); }
        }
    }

    // ── TABELAS ───────────────────────────────────────────────────
    const _thSort = (which, col, label, align) => {
        const s = which === 'rec' ? _finSortRec : _finSortPag;
        const active = s.col === col;
        const arrow = active ? (s.dir === 1 ? ' ▲' : ' ▼') : '';
        return `<th style="${align?'text-align:'+align+';':''} cursor:pointer;user-select:none;white-space:nowrap;${active?'color:var(--primary);':''}" onclick="_finSortToggle('${which}','${col}')">${label}${arrow}</th>`;
    };
    const _sortList = (list, s, nomeKey) => {
        return [...list].sort((a, b) => {
            if (s.col === 'venc')  return s.dir * (a.data_vencimento||'').localeCompare(b.data_vencimento||'');
            if (s.col === 'nome')  return s.dir * (a[nomeKey]||'').localeCompare(b[nomeKey]||'');
            if (s.col === 'valor') return s.dir * (a.valor - b.valor);
            return 0;
        }).slice(0, 10);
    };

    const recCard = document.getElementById('fin-card-receber');
    if (recCard) {
        const lista = _sortList(db.contas_receber.filter(cr=>cr.status!=='Pago'), _finSortRec, 'cliente_nome');
        recCard.innerHTML = `<h3 style="margin-bottom:14px;font-size:14px">📥 Próximos Recebimentos</h3>
        <table><thead><tr>
            ${_thSort('rec','venc','Vencimento')} ${_thSort('rec','nome','Cliente')}
            <th>Descrição</th>
            ${_thSort('rec','valor','Valor','right')}
            <th>Status</th>
        </tr></thead><tbody>${lista.length ? lista.map(cr => {
            const at = cr.status === 'Atrasado';
            return `<tr class="${at?'fin-atrasado':''}">
                <td>${new Date(cr.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${escapeHtml(cr.cliente_nome)}</td>
                <td style="font-size:12px;color:#8F8F8F">${escapeHtml(cr.descricao)}</td>
                <td style="text-align:right"><strong>R$ ${fmt(cr.valor)}</strong></td>
                <td><span class="fin-badge fin-badge-${at?'red':'pending'}">${cr.status}</span></td>
            </tr>`;
        }).join('') : '<tr><td colspan="5" style="text-align:center;color:#999;padding:16px">Nenhum recebimento pendente.</td></tr>'}</tbody></table>`;
    }

    const pagCard = document.getElementById('fin-card-pagar');
    if (pagCard) {
        const lista = _sortList(db.contas_pagar.filter(cp=>cp.status!=='Pago'), _finSortPag, 'credor_nome');
        pagCard.innerHTML = `<h3 style="margin-bottom:14px;font-size:14px">📤 Próximos Pagamentos</h3>
        <table><thead><tr>
            ${_thSort('pag','venc','Vencimento')} ${_thSort('pag','nome','Credor')}
            <th>Descrição</th>
            ${_thSort('pag','valor','Valor','right')}
            <th>Status</th>
        </tr></thead><tbody>${lista.length ? lista.map(cp => {
            const at = cp.status === 'Atrasado';
            return `<tr class="${at?'fin-atrasado':''}">
                <td>${new Date(cp.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${escapeHtml(cp.credor_nome||cp.categoria||'—')}</td>
                <td style="font-size:12px;color:#8F8F8F">${escapeHtml(cp.descricao)}</td>
                <td style="text-align:right"><strong>R$ ${fmt(cp.valor)}</strong></td>
                <td><span class="fin-badge fin-badge-${at?'red':'pending'}">${cp.status}</span></td>
            </tr>`;
        }).join('') : '<tr><td colspan="5" style="text-align:center;color:#999;padding:16px">Nenhum pagamento pendente.</td></tr>'}</tbody></table>`;
    }
}

function renderContasReceber() {
    atualizarStatusVencimentos();
    const tb = document.getElementById('tb-contas-receber');
    if (!tb) return;
    const filtroStatus  = document.getElementById('cr-filtro-status')?.value || '';
    const filtroCliente = (document.getElementById('cr-filtro-cliente')?.value||'').toLowerCase().trim();
    let lista = db.contas_receber.filter(cr => {
        if (filtroStatus && cr.status !== filtroStatus) return false;
        if (filtroCliente && !cr.cliente_nome.toLowerCase().includes(filtroCliente) && !cr.descricao.toLowerCase().includes(filtroCliente)) return false;
        return true;
    }).sort((a,b) => a.data_vencimento.localeCompare(b.data_vencimento));
    const totPend = lista.filter(cr=>cr.status!=='Pago').reduce((s,cr)=>s+cr.valor,0);
    const totRec  = lista.filter(cr=>cr.status==='Pago').reduce((s,cr)=>s+cr.valor,0);
    const res = document.getElementById('cr-resumo');
    if (res) res.innerHTML = `<span style="color:#005D3B">✓ Recebido: <strong>R$ ${totRec.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></span>&nbsp;&nbsp;<span style="color:#F2C924">⏳ Pendente: <strong>R$ ${totPend.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></span>`;
    if (!lista.length) { tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:#999;padding:24px">Nenhum registro encontrado.</td></tr>'; return; }
    const podeEditar = temAcesso('financeiro.receber', 'completo');
    tb.innerHTML = lista.map(cr => {
        const at=cr.status==='Atrasado', pago=cr.status==='Pago';
        return `<tr class="${at?'fin-atrasado':''}">
            <td>${new Date(cr.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR')}</td>
            <td><strong>${escapeHtml(cr.cliente_nome)}</strong></td>
            <td>${escapeHtml(cr.descricao)}</td>
            <td style="text-align:right"><strong>R$ ${cr.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
            <td>${pago?`<span style="color:#005D3B;font-size:12px">✓ ${new Date(cr.data_pagamento+'T12:00:00').toLocaleDateString('pt-BR')}</span>`:`<span class="fin-badge fin-badge-${at?'red':'pending'}">${cr.status}</span>`}</td>
            <td>${podeEditar ? `${!pago?`<button class="btn btn-sm btn-success" onclick="marcarCRPago(${cr.id})" title="Confirmar recebimento">✓ Recebido</button>`:''}<button class="btn btn-outline btn-sm btn-danger" onclick="excluirCR(${cr.id})" title="Excluir" style="margin-left:4px">🗑️</button>` : ''}</td>
        </tr>`;
    }).join('');
}

function renderContasPagar() {
    atualizarStatusVencimentos();
    const tb = document.getElementById('tb-contas-pagar');
    if (!tb) return;
    const filtroTipo   = document.getElementById('cp-filtro-tipo')?.value || '';
    const filtroStatus = document.getElementById('cp-filtro-status')?.value || '';
    let lista = db.contas_pagar.filter(cp => {
        if (filtroTipo && cp.tipo !== filtroTipo) return false;
        if (filtroStatus && cp.status !== filtroStatus) return false;
        return true;
    }).sort((a,b) => a.data_vencimento.localeCompare(b.data_vencimento));
    const totPend = lista.filter(cp=>cp.status!=='Pago').reduce((s,cp)=>s+cp.valor,0);
    const totPago = lista.filter(cp=>cp.status==='Pago').reduce((s,cp)=>s+cp.valor,0);
    const res = document.getElementById('cp-resumo');
    if (res) res.innerHTML = `<span style="color:#F43927">↑ Pago: <strong>R$ ${totPago.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></span>&nbsp;&nbsp;<span style="color:#F2C924">⏳ A pagar: <strong>R$ ${totPend.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></span>`;
    if (!lista.length) { tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:#999;padding:24px">Nenhum registro encontrado.</td></tr>'; return; }
    const podeEditar = temAcesso('financeiro.pagar', 'completo');
    tb.innerHTML = lista.map(cp => {
        const at=cp.status==='Atrasado', pago=cp.status==='Pago', isRT=cp.categoria==='comissao_rt';
        const tipoTag = cp.tipo==='fixo' ? '<span class="fin-badge fin-badge-gray">Fixo</span>' : '<span class="fin-badge fin-badge-blue">Variável</span>';
        const grupoTag = cp.parcelado ? `<span class="fin-badge fin-badge-blue" title="Parcela ${cp.parcela_atual} de ${cp.numero_parcelas}">${cp.parcela_atual}/${cp.numero_parcelas}</span>`
            : cp.recorrente ? `<span class="fin-badge fin-badge-gray" title="Lançamento recorrente (${cp.periodicidade})">🔁</span>` : '';
        const anexoBtn = cp.arquivo_anexo_url ? `<button class="btn btn-outline btn-sm" onclick="verAnexoCP(${cp.id})" title="Ver documento anexado" style="margin-left:4px">📎</button>` : '';
        const grupoDelBtn = (podeEditar && cp.lancamento_pai_id) ? `<button class="btn btn-outline btn-sm btn-danger" onclick="excluirGrupoCP(${cp.lancamento_pai_id})" title="Excluir todo o grupo" style="margin-left:4px">🗑️ grupo</button>` : '';
        const acoes = podeEditar
            ? `${!pago?`<button class="btn btn-sm btn-success" onclick="marcarCPPago(${cp.id})" title="Confirmar pagamento">✓ Pagar</button>`:''}<button class="btn btn-outline btn-sm btn-danger" onclick="excluirCP(${cp.id})" title="Excluir" style="margin-left:4px">🗑️</button>${grupoDelBtn}${anexoBtn}`
            : anexoBtn;
        return `<tr class="${at?'fin-atrasado':''}">
            <td>${new Date(cp.data_vencimento+'T12:00:00').toLocaleDateString('pt-BR')}</td>
            <td>${escapeHtml(cp.descricao)}${isRT?' <span title="Comissão RT — gerada após quitação total do pedido" style="cursor:help">🏛️</span>':''}${grupoTag?' '+grupoTag:''}</td>
            <td>${escapeHtml(cp.credor_nome||'—')}</td>
            <td style="text-align:right"><strong>R$ ${cp.valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
            <td>${tipoTag}</td>
            <td>${pago?`<span style="color:#005D3B;font-size:12px">✓ ${new Date(cp.data_pagamento+'T12:00:00').toLocaleDateString('pt-BR')}</span>`:`<span class="fin-badge fin-badge-${at?'red':'pending'}">${cp.status}</span>`}</td>
            <td>${acoes}</td>
        </tr>`;
    }).join('');
}

function renderDespesasFixas() {
    const tb = document.getElementById('tb-despesas-fixas');
    if (!tb) return;
    if (!db.despesas_fixas.length) { tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:#999;padding:24px">Nenhuma despesa fixa cadastrada.</td></tr>'; return; }
    const podeEditar = temAcesso('financeiro.fixas', 'completo');
    tb.innerHTML = db.despesas_fixas.map(df=>`
        <tr>
            <td><strong>${escapeHtml(df.descricao)}</strong></td>
            <td>${escapeHtml(df.categoria)}</td>
            <td>Todo dia ${df.dia_vencimento}</td>
            <td>R$ ${(df.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td>${podeEditar ? `<button class="btn btn-outline btn-sm btn-danger" onclick="excluirDespesaFixa(${df.id})" title="Excluir">🗑️</button>` : ''}</td>
        </tr>`).join('');
}

function renderDRE() {
    const tb = document.getElementById('tb-dre');
    if (!tb) return;
    const filtroCliente = (document.getElementById('dre-filtro-cliente')?.value||'').toLowerCase().trim();
    let pedidos = db.pedidos.filter(p => normalizarStatus(p.status) !== 'Orçamento');
    if (filtroCliente) pedidos = pedidos.filter(p=>(p.clienteNome||'').toLowerCase().includes(filtroCliente));
    pedidos = pedidos.sort((a,b)=>b.id-a.id).slice(0,50);
    if (!pedidos.length) { tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:#999;padding:24px">Nenhum pedido aprovado encontrado.</td></tr>'; return; }
    let totRec=0, totCusto=0, totLucro=0;
    const rows = pedidos.map(p=>{
        const receita   = p.valor||0;
        const custoMat  = (p.tipo_precificacao === 'pedido' && p.custo_mat != null)
            ? (p.custo_mat||0) + (p.custo_acess||0)
            : (p.total_material||0) + (p.total_acessorios||0);
        const custoMao  = p.maoObra||0;
        const custoRT   = db.contas_pagar.filter(cp=>cp.pedido_id===p.id&&cp.categoria==='comissao_rt').reduce((s,cp)=>s+cp.valor,0);
        const custoExtra= db.contas_pagar.filter(cp=>cp.pedido_id===p.id&&cp.categoria!=='comissao_rt').reduce((s,cp)=>s+cp.valor,0);
        const custo     = custoMat+custoMao+custoRT+custoExtra;
        const lucro     = receita-custo;
        const margem    = receita>0?(lucro/receita*100):0;
        const cor       = margem>=30?'#005D3B':margem>=15?'#F2C924':'#F43927';
        totRec+=receita; totCusto+=custo; totLucro+=lucro;
        return `<tr>
            <td style="font-size:12px;color:#888">#${formatPedidoId(p.id)}</td>
            <td>${escapeHtml(p.clienteNome||'—')}</td>
            <td style="text-align:right">R$ ${receita.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td style="text-align:right;color:#888">R$ ${custoMat.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td style="text-align:right;color:#888">R$ ${custoMao.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td style="text-align:right;color:#888">R$ ${custoRT.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td style="text-align:right"><strong style="color:${cor}">R$ ${lucro.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
            <td style="text-align:center"><strong style="color:${cor}">${margem.toFixed(1)}%</strong></td>
        </tr>`;
    });
    const totM = totRec>0?(totLucro/totRec*100):0;
    const corT = totM>=30?'#005D3B':totM>=15?'#F2C924':'#F43927';
    tb.innerHTML = rows.join('') + `
        <tr style="border-top:2px solid #242424;background:#FAFAFA;font-weight:700">
            <td colspan="2">TOTAL (${pedidos.length} pedidos)</td>
            <td style="text-align:right">R$ ${totRec.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td colspan="3" style="text-align:right;color:#888">Custos: R$ ${totCusto.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
            <td style="text-align:right"><strong style="color:${corT}">R$ ${totLucro.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></td>
            <td style="text-align:center"><strong style="color:${corT}">${totM.toFixed(1)}%</strong></td>
        </tr>`;
}
