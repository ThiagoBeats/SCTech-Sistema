// Editor do layout dos documentos (Configurar Empresa > Layout dos documentos).
// Painel de opcoes a esquerda e a folha a direita, montada pelos mesmos
// geradores da impressao. As alteracoes ficam na memoria ate "Salvar".

const _dl = { docId: 'proposta', layout: null, salvo: '', podeEditar: true, temporizador: null };
const _DL_ORDEM = ['proposta', 'os', 'compra', 'medicao', 'financeiro'];
const _DL_CORES_SISTEMA = { cor: '#005D3B', destaque: '#005D3B', fundo: '#FAFAFA' };

// ---- registros de exemplo (quando ainda nao ha nenhum de verdade) ----
function _dlDiasDepois(n) { return new Date(Date.now() + n * 86400000).toLocaleDateString('sv-SE'); }

function _dlExemploPedido() {
    const tec = (nome, prega, fator) => ({ tecidoNome: nome, prega, fator, num_panos: 4, alt_corte: 2.85, consumo_linear: 11.4, bainha_cm: 15, cabecote_cm: 10 });
    return {
        id: 26001, clienteId: -1, clienteNome: 'Maria Souza', status: 'Em produção', valor: 4400,
        data_entrega: _dlDiasDepois(12), observacoes: 'Instalar pela manhã. Portão azul.',
        vendedor_nome: 'Ana Lima', forma_pagamento: 'Pix',
        itens: [{ nome: 'Trilho suíço 3,20 m', quantidade: 1, unidade: 'un' }, { nome: 'Ponteira', quantidade: 2, unidade: 'un' }],
        ambientes: [
            { id: 1, amb: 'Sala', abertura: 'C', largura: 3.2, altura: 2.7, fixacao: 'Trilho suíço', local_instalacao: 'Parede', calculado: true,
                tecidos: [tec('Linho Natural', 'Wave Botao', 2.2), tec('Voil Branco', 'Americana', 2.5)] },
            { id: 2, amb: 'Quarto', abertura: 'A', largura: 2.4, altura: 2.6, fixacao: 'Varão', local_instalacao: 'Teto', calculado: true,
                tecidos: [tec('Blackout Cinza', 'Americana', 2)] }
        ]
    };
}
const _DL_EXEMPLO_CLIENTE = { id: -1, nome: 'Maria Souza', tel: '(11) 98888-0000', email: 'maria@exemplo.com', end: 'Rua das Flores, 120 — Centro' };

function _dlExemploCompra() {
    return {
        id: 26001, fornecedor_id: -1, fornecedor_nome: 'Tecidos Exemplo', status: 'Rascunho',
        pedido_venda_id: 26001, pedido_venda_cliente: 'Maria Souza', observacoes: 'Entregar até sexta-feira.',
        itens: [
            { tipo: 'tecido', item_id: -1, item_nome: 'Linho Natural', referencia: 'LN-280', quantidade: 11.4, unidade: 'm', preco_unit: 89.9, subtotal: 1024.86 },
            { tipo: 'material', item_id: -2, item_nome: 'Trilho suíço', referencia: 'TS-01', quantidade: 1, unidade: 'un', preco_unit: 120, subtotal: 120 }
        ],
        especificacoes: [{ amb: 'Sala', largura: 3.2, altura: 2.7, abertura: 'C',
            tecidos: [{ tecido_id: -1, tecido_nome: 'Linho Natural', prega: 'Wave Botao', fator: 2.2, num_panos: 4, alt_corte: 2.85 }] }]
    };
}
const _DL_EXEMPLO_FORNECEDOR = { id: -1, nome: 'Tecidos Exemplo', cnpj: '00.000.000/0001-00', tel: '(11) 3000-0000', email: 'vendas@exemplo.com' };

function _dlExemploMedicao() {
    return { id: 1, clienteNome: 'Maria Souza', clienteTel: '(11) 98888-0000', data: _dlDiasDepois(1), hora: '14:00', duracao: 60,
        status: 'Agendado', endereco: 'Rua das Flores, 120 — Centro', obs: 'Medir sala e quarto.', responsavel_nome: 'Carlos' };
}

function _dlUltimo(lista) {
    return (lista || []).reduce((m, x) => (!m || Number(x.id) > Number(m.id) ? x : m), null);
}

// HTML do documento em edicao: o registro real mais recente ou o exemplo.
function _dlHtmlDocumento(docId, layout) {
    if (docId === 'proposta' || docId === 'os') {
        const real = _dlUltimo(db.pedidos);
        const ped = real || _dlExemploPedido();
        const cli = real ? db.clientes.find(c => c.id == real.clienteId) : _DL_EXEMPLO_CLIENTE;
        return docId === 'proposta' ? _htmlProposta(ped, cli, 15, layout) : _htmlOS(ped, cli, layout);
    }
    if (docId === 'compra') {
        const real = _dlUltimo(db.pedidos_compra);
        return real ? _htmlPedidoCompra(real, db.fornecedores.find(f => f.id == real.fornecedor_id), layout)
            : _htmlPedidoCompra(_dlExemploCompra(), _DL_EXEMPLO_FORNECEDOR, layout);
    }
    if (docId === 'medicao') return gerarHTMLAgendamentoMedicao(_dlUltimo(db.medicoes) || _dlExemploMedicao(), layout);
    return gerarHTMLRelatorioFinanceiro(layout, { previa: true }).html;
}

// ---- estado ----
function _dlSujo() { return JSON.stringify(_dl.layout) !== _dl.salvo; }

function _dlCarregar(docId) {
    _dl.docId = docId;
    _dl.layout = getLayoutDocumento(docId);
    _dl.salvo = JSON.stringify(_dl.layout);
}

function _dlBloco(id) { return _dl.layout.blocos.find(b => b.id === id); }

// ---- montagem ----
function iniciarEditorLayouts() {
    const raiz = document.getElementById('dl-editor');
    if (!raiz || typeof DocsLayout === 'undefined') return;
    _dl.podeEditar = typeof temAcesso === 'function' ? temAcesso('configuracoes.empresa', 'completo') : true;
    _dlCarregar('proposta');
    const opcoesDoc = _DL_ORDEM.map(id => `<option value="${id}">${escapeHtml(DocsLayout.DOCUMENTOS[id].nome)}</option>`).join('');
    raiz.innerHTML = `
        <div class="dl-barra">
            <label class="dl-barra-doc">Documento <select id="dl-doc">${opcoesDoc}</select></label>
            <div class="dl-barra-acoes">
                <select id="dl-copiar" title="Copia cores, fonte, logo no fundo e a posição do cabeçalho"></select>
                <button type="button" class="btn btn-outline btn-sm" id="dl-padrao">↩ Voltar ao padrão</button>
                <button type="button" class="btn btn-success btn-sm" id="dl-salvar">💾 Salvar</button>
            </div>
        </div>
        ${_dl.podeEditar ? '' : '<div class="dl-ro">Você pode ver o layout, mas só quem tem acesso completo à configuração da empresa pode alterar.</div>'}
        <div class="dl-colunas">
            <div class="dl-painel" id="dl-painel"></div>
            <div class="dl-previa-moldura"><div class="dl-folha" id="dl-previa"></div></div>
        </div>`;
    document.getElementById('dl-doc').addEventListener('change', _dlTrocarDocumento);
    document.getElementById('dl-copiar').addEventListener('change', _dlCopiarEstilo);
    document.getElementById('dl-padrao').addEventListener('click', _dlVoltarPadrao);
    document.getElementById('dl-salvar').addEventListener('click', _dlSalvar);
    if (!_dl.podeEditar) ['dl-padrao', 'dl-salvar'].forEach(id => { document.getElementById(id).disabled = true; });
    const painel = document.getElementById('dl-painel');
    painel.addEventListener('input', _dlAoEditar);
    painel.addEventListener('change', _dlAoEditar);
    painel.addEventListener('click', _dlAoClicar);
    document.addEventListener('click', e => { if (!e.target.closest('.dl-campos, .dl-inserir-dado')) _dlFecharCampos(); });
    window.addEventListener('resize', _dlAjustarEscala);
    window.addEventListener('beforeunload', e => { if (_dlSujo()) { e.preventDefault(); e.returnValue = ''; } });
    _dlRenderTudo();
}

// Chamado ao abrir a aba "Layout dos Documentos": a logo pode ter sido salva
// na aba Dados, e escondida a folha mediu largura zero. As edicoes ainda nao
// salvas ficam, porque o painel e redesenhado a partir de _dl.layout.
function atualizarEditorLayouts() {
    if (!_dl.layout || !document.getElementById('dl-previa')) return;
    _dlRenderPainel();
    _dlRenderPrevia();
}

function _dlRenderTudo() {
    _dlRenderCopiar();
    _dlRenderPainel();
    _dlRenderPrevia();
}

function _dlRenderCopiar() {
    const sel = document.getElementById('dl-copiar');
    sel.innerHTML = `<option value="">Copiar estilo de…</option>` + _DL_ORDEM.filter(id => id !== _dl.docId)
        .map(id => `<option value="${id}">${escapeHtml(DocsLayout.DOCUMENTOS[id].nome)}</option>`).join('');
    sel.disabled = !_dl.podeEditar;
}

function _dlBotaoDado(alvo) {
    return `<button type="button" class="dl-inserir-dado" data-alvo="${alvo}" title="Inserir um dado do documento">+ dado</button>`;
}

function _dlRenderPainel() {
    const L = _dl.layout, e = L.estilo, cat = DocsLayout.DOCUMENTOS[_dl.docId];
    const temLogo = !!getEmpresa().logo_base64;
    const cor = (k, rot) => `<div class="dl-cor-linha">
            <label for="dl-${k}">${rot}</label>
            <input type="color" id="dl-${k}" data-cor="${k}" value="${(e[k] || _DL_CORES_SISTEMA[k]).toLowerCase()}">
            ${e[k] ? `<button type="button" class="dl-cor-padrao" data-cor="${k}" title="Voltar à cor do sistema">padrão</button>` : '<span class="dl-cor-tag">do sistema</span>'}
        </div>`;
    const paletas = DocsLayout.PALETAS.map(p => `<button type="button" class="dl-paleta" data-paleta="${p.id}" title="${escapeHtml(p.nome)}">
            ${[p.cor, p.destaque, p.fundo].map((c, i) => `<i style="background:${c || Object.values(_DL_CORES_SISTEMA)[i]}"></i>`).join('')}
            <span>${escapeHtml(p.nome)}</span></button>`).join('');
    const fontes = DocsLayout.FONTES.map(f => `<option value="${f.id}"${f.id === e.fonte ? ' selected' : ''}>${escapeHtml(f.nome)}</option>`).join('');
    const ultimo = L.blocos.length - 1;
    const blocos = L.blocos.map((b, i) => {
        const c = cat.blocos.find(x => x.id === b.id);
        const variantes = b.proprio ? DocsLayout.VARIANTES_TEXTO : c.variantes;
        const nome = b.proprio ? 'Texto próprio' : c.nome;
        const fixo = c && c.fixo;
        const campoTxt = (k, rot) => {
            if (!(k in b)) return '';
            const id = `dl-b-${b.id}-${k}`;
            const multi = k === 'corpo';
            const dica = !b.proprio && k === 'corpo' && b.id === 'assinaturas' ? '<small class="dl-dica">Uma linha por assinatura: Título | legenda</small>' : '';
            const ctl = multi
                ? `<textarea id="${id}" class="dl-bloco-${k}" rows="${b.id === 'condicoes' ? 5 : 2}">${escapeHtml(b[k] || '')}</textarea>`
                : `<input type="text" id="${id}" class="dl-bloco-${k}" value="${escapeHtml(b[k] || '')}">`;
            return `<label class="dl-txt"><span>${rot}${_dlBotaoDado(id)}</span>${ctl}${dica}</label>`;
        };
        return `<div class="dl-bloco${b.visivel ? '' : ' dl-oculto'}" data-bloco="${b.id}">
            <div class="dl-bloco-topo">
                ${fixo ? '<span class="dl-fixo" title="O cabeçalho fica sempre no topo">📌</span>' : `<input type="checkbox" class="dl-visivel" title="Mostrar no documento"${b.visivel ? ' checked' : ''}>`}
                <strong>${escapeHtml(nome)}</strong>
                ${fixo ? '' : `<span class="dl-mover">
                    <button type="button" class="dl-subir" title="Subir"${i <= 1 ? ' disabled' : ''}>▲</button>
                    <button type="button" class="dl-descer" title="Descer"${i >= ultimo ? ' disabled' : ''}>▼</button>
                </span>`}
                ${b.proprio ? '<button type="button" class="dl-remover" title="Remover este texto">✕</button>' : ''}
            </div>
            ${variantes.length > 1 ? `<label class="dl-txt"><span>Arrumação</span><select class="dl-variante">${variantes.map(v =>
                `<option value="${v.id}"${v.id === b.variante ? ' selected' : ''}>${escapeHtml(v.nome)}</option>`).join('')}</select></label>` : ''}
            ${campoTxt('titulo', 'Título')}${campoTxt('aviso', 'Aviso')}${campoTxt('corpo', b.id === 'assinaturas' ? 'Assinaturas' : 'Texto')}
        </div>`;
    }).join('');
    const p = document.getElementById('dl-painel');
    p.innerHTML = `
        <section class="dl-grupo">
            <h4>Cores</h4>
            <div class="dl-paletas">${paletas}</div>
            ${cor('cor', 'Principal')}${cor('destaque', 'Destaque')}${cor('fundo', 'Fundo das caixas')}
        </section>
        <section class="dl-grupo">
            <h4>Fonte</h4>
            <select id="dl-fonte">${fontes}</select>
        </section>
        <section class="dl-grupo">
            <h4>Logo no fundo</h4>
            <label class="dl-check"><input type="checkbox" id="dl-marca"${e.marca.ativa ? ' checked' : ''}${temLogo ? '' : ' disabled'}> Mostrar a logo clarinha atrás do texto</label>
            ${temLogo ? '' : '<small class="dl-dica">Cadastre a logo da empresa na aba Dados da Empresa para usar.</small>'}
            <div class="dl-marca-ajustes"${e.marca.ativa && temLogo ? '' : ' hidden'}>
                <label class="dl-txt"><span>Tamanho</span><select id="dl-marca-tamanho">${[['P', 'Pequena'], ['M', 'Média'], ['G', 'Grande']].map(([v, n]) =>
                    `<option value="${v}"${v === e.marca.tamanho ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
                <label class="dl-txt"><span>Transparência</span><input type="range" id="dl-marca-opacidade" min="3" max="20" value="${e.marca.opacidade}"></label>
            </div>
        </section>
        <section class="dl-grupo">
            <h4>Título do documento</h4>
            <label class="dl-txt"><span>${_dlBotaoDado('dl-titulo')}</span><input type="text" id="dl-titulo" value="${escapeHtml(L.titulo)}"></label>
        </section>
        <section class="dl-grupo">
            <h4>Blocos</h4>
            <div id="dl-blocos">${blocos}</div>
            <button type="button" class="btn btn-outline btn-sm" id="dl-novo-bloco">+ Texto próprio</button>
        </section>`;
    if (!_dl.podeEditar) p.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = true; });
}

function _dlRenderPrevia() {
    const folha = document.getElementById('dl-previa');
    if (!folha) return;
    try {
        folha.innerHTML = _dlHtmlDocumento(_dl.docId, _dl.layout);
    } catch (err) {
        console.error(err);
        folha.innerHTML = '<p class="dl-erro">Não foi possível montar a prévia deste documento.</p>';
        return;
    }
    if (typeof preencherCodigosDocumento === 'function') preencherCodigosDocumento(folha);
    _dlAjustarEscala();
}

// A folha tem sempre a largura de um A4 (794 px) e encolhe para caber na
// moldura, como uma miniatura: assim a previa quebra as linhas igual a impressao.
function _dlAjustarEscala() {
    const folha = document.getElementById('dl-previa');
    if (!folha) return;
    const moldura = folha.parentElement;
    const est = getComputedStyle(moldura);
    const livre = moldura.clientWidth - parseFloat(est.paddingLeft) - parseFloat(est.paddingRight);
    folha.style.zoom = livre > 0 ? String(Math.min(1, livre / 794)) : '1';
}

function _dlAgendarPrevia() {
    clearTimeout(_dl.temporizador);
    _dl.temporizador = setTimeout(_dlRenderPrevia, 80);
}

// ---- eventos do painel ----
function _dlAoEditar(ev) {
    const t = ev.target, L = _dl.layout, e = L.estilo;
    if (t.dataset.cor && t.type === 'color') {
        if (ev.type !== 'input' && ev.type !== 'change') return;
        e[t.dataset.cor] = t.value.toUpperCase();
        const tag = t.parentElement.querySelector('.dl-cor-tag');
        if (tag) tag.outerHTML = `<button type="button" class="dl-cor-padrao" data-cor="${t.dataset.cor}" title="Voltar à cor do sistema">padrão</button>`;
    } else if (t.id === 'dl-fonte') e.fonte = t.value;
    else if (t.id === 'dl-marca') {
        e.marca.ativa = t.checked;
        const aj = document.querySelector('.dl-marca-ajustes');
        if (aj) aj.hidden = !t.checked;
    }
    else if (t.id === 'dl-marca-tamanho') e.marca.tamanho = t.value;
    else if (t.id === 'dl-marca-opacidade') e.marca.opacidade = Number(t.value);
    else if (t.id === 'dl-titulo') L.titulo = t.value;
    else {
        const linha = t.closest('.dl-bloco');
        if (!linha) return;
        const b = _dlBloco(linha.dataset.bloco);
        if (t.classList.contains('dl-visivel')) { b.visivel = t.checked; linha.classList.toggle('dl-oculto', !t.checked); }
        else if (t.classList.contains('dl-variante')) b.variante = t.value;
        else for (const k of ['titulo', 'aviso', 'corpo']) if (t.classList.contains('dl-bloco-' + k)) b[k] = t.value;
    }
    _dlAgendarPrevia();
}

function _dlAoClicar(ev) {
    const t = ev.target.closest('button');
    if (!t || t.disabled) return;
    const L = _dl.layout;
    if (t.classList.contains('dl-paleta')) {
        const p = DocsLayout.PALETAS.find(x => x.id === t.dataset.paleta);
        Object.assign(L.estilo, { cor: p.cor, destaque: p.destaque, fundo: p.fundo });
        return _dlRedesenhar();
    }
    if (t.classList.contains('dl-cor-padrao')) { L.estilo[t.dataset.cor] = null; return _dlRedesenhar(); }
    if (t.id === 'dl-novo-bloco') { _dl.layout = DocsLayout.novoBlocoProprio(L); return _dlRedesenhar(); }
    if (t.classList.contains('dl-inserir-dado')) return _dlAbrirCampos(t);
    if (t.classList.contains('dl-campo')) return _dlInserirCampo(t);
    const linha = t.closest('.dl-bloco');
    if (!linha) return;
    const i = L.blocos.findIndex(b => b.id === linha.dataset.bloco);
    if (t.classList.contains('dl-remover')) { L.blocos.splice(i, 1); return _dlRedesenhar(); }
    const j = t.classList.contains('dl-subir') ? i - 1 : t.classList.contains('dl-descer') ? i + 1 : -1;
    if (j >= 1 && j < L.blocos.length) {
        [L.blocos[i], L.blocos[j]] = [L.blocos[j], L.blocos[i]];
        _dlRedesenhar();
    }
}

function _dlRedesenhar() {
    const rolagem = document.getElementById('dl-painel').scrollTop;
    _dlRenderPainel();
    document.getElementById('dl-painel').scrollTop = rolagem;
    _dlRenderPrevia();
}

// ---- "+ dado": lista de campos do documento, insere {chave} no cursor ----
function _dlFecharCampos() { document.querySelectorAll('.dl-campos').forEach(m => m.remove()); }

function _dlAbrirCampos(botao) {
    const aberto = document.querySelector(`.dl-campos[data-alvo="${botao.dataset.alvo}"]`);
    _dlFecharCampos();
    if (aberto) return;
    const campos = [...DocsLayout.DOCUMENTOS[_dl.docId].campos, ...DocsLayout.CAMPOS_COMUNS];
    const menu = document.createElement('div');
    menu.className = 'dl-campos';
    menu.dataset.alvo = botao.dataset.alvo;
    menu.innerHTML = campos.map(c => `<button type="button" class="dl-campo" data-chave="${c.chave}">${escapeHtml(c.nome)}</button>`).join('');
    botao.closest('label, section').appendChild(menu);
}

function _dlInserirCampo(botao) {
    const menu = botao.closest('.dl-campos');
    const alvo = document.getElementById(menu.dataset.alvo);
    _dlFecharCampos();
    if (!alvo) return;
    const marcador = '{' + botao.dataset.chave + '}';
    const ini = alvo.selectionStart ?? alvo.value.length, fim = alvo.selectionEnd ?? alvo.value.length;
    alvo.value = alvo.value.slice(0, ini) + marcador + alvo.value.slice(fim);
    alvo.focus();
    alvo.setSelectionRange(ini + marcador.length, ini + marcador.length);
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---- barra do topo ----
async function _dlTrocarDocumento(ev) {
    const novo = ev.target.value;
    if (_dlSujo()) {
        const nome = DocsLayout.DOCUMENTOS[_dl.docId].nome;
        if (!await showConfirm(`Há alterações não salvas em "${nome}". Trocar de documento e descartar?`, '⚠️', 'Descartar', 'Continuar editando')) {
            ev.target.value = _dl.docId;
            return;
        }
    }
    _dlCarregar(novo);
    _dlRenderTudo();
}

function _dlCopiarEstilo(ev) {
    const origem = ev.target.value;
    ev.target.value = '';
    if (!origem) return;
    _dl.layout = DocsLayout.copiarEstilo(_dl.layout, getLayoutDocumento(origem));
    _dlRedesenhar();
    toast(`Estilo de "${DocsLayout.DOCUMENTOS[origem].nome}" copiado. Salve para manter.`, 'info', 2200);
}

function _dlGravar(mudar) {
    const layouts = getLayoutsDocumentos();
    mudar(layouts.docs);
    localStorage.setItem('sc_doc_layouts', JSON.stringify(layouts));
    // as condicoes antigas ja foram levadas para o layout da proposta
    localStorage.removeItem('sc_cond_gerais');
}

function _dlSalvar() {
    if (!_dl.podeEditar) return;
    _dlGravar(docs => { docs[_dl.docId] = _dl.layout; });
    _dl.salvo = JSON.stringify(_dl.layout);
    toast(`Layout de "${DocsLayout.DOCUMENTOS[_dl.docId].nome}" salvo!`, 'success', 1800);
}

async function _dlVoltarPadrao() {
    if (!_dl.podeEditar) return;
    const nome = DocsLayout.DOCUMENTOS[_dl.docId].nome;
    if (!await showConfirm(`Voltar "${nome}" ao visual padrão do sistema? As cores, textos e blocos personalizados deste documento serão apagados.`, '↩', 'Voltar ao padrão')) return;
    _dlGravar(docs => { delete docs[_dl.docId]; });
    _dlCarregar(_dl.docId);
    _dlRenderTudo();
    toast(`"${nome}" voltou ao padrão.`, 'info', 1800);
}
