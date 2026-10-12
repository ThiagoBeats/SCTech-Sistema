/* ───────────────────────────────────────────────────────────────────────────
   Importação de KITS PRONTOS

   Fluxo irmão do importador de tabelas, mas enxuto: kit pronto só entra por
   texto colado (três passos — Colar, Colunas, Conferência), e o que ele grava
   são kits em db.kits, não produtos do catálogo.

   Um kit pronto é um produto em si: tem código, nome e preço próprios e
   nenhum componente. No pedido ele entra como uma linha só.
   ─────────────────────────────────────────────────────────────────────────── */

const _kitEstado = {
    textoColado: '',
    planilha: null,         // { ordem, abas } devolvido por lerColados
    fornecedor: null,       // { id, nome }
    fornecedorId: null,
    markupPadrao: null,     // margem total; em branco até o usuário informar
    margemModo: 'total',    // 'total' | 'item'
    estoqueModo: 'ajustar', // 'ajustar' | 'infinito'
    cabecalhoIndice: -1,
    mapa: null,             // { codigo, nome, preco, medida, descricao }
    grupos: null,           // saída de classificarKits
    novaColuna: false,      // form de nova coluna aberto no passo 2
    passo: 1
};

function _kitResetar() {
    Object.assign(_kitEstado, {
        textoColado: '', planilha: null, fornecedor: null, fornecedorId: null,
        markupPadrao: null, margemModo: 'total', estoqueModo: 'ajustar',
        cabecalhoIndice: -1, mapa: null, grupos: null, novaColuna: false, passo: 1
    });
}

function _kitLinhas() {
    if (!_kitEstado.planilha) return [];
    const nome = _kitEstado.planilha.ordem[0];
    return nome ? (_kitEstado.planilha.abas[nome] || []) : [];
}

// ── Abertura ────────────────────────────────────────────────────────────────

// Chamado pelo botão do passo 1 do importador de tabelas: fecha aquela popup
// e abre esta, para não empilhar dois modais.
function abrirImportadorKits() {
    if (typeof _impFechar === 'function') _impFechar();
    _kitResetar();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'kit-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:1080px">
        <div class="modal-header">
            <h3>Importar kits prontos</h3>
            <button class="modal-close" onclick="_kitFechar()">×</button>
        </div>
        <div class="modal-body" id="kit-corpo"></div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) _kitFechar(); });
    document.body.appendChild(overlay);
    _kitRenderPasso(1);
}

function _kitFechar() {
    const o = document.getElementById('kit-overlay');
    if (o) o.remove();
}

// Volta para a importação de tabelas de produto.
function _kitVoltarParaTabela() {
    _kitFechar();
    if (typeof abrirImportadorTabela === 'function') abrirImportadorTabela();
}

function _kitTrilha(atual) {
    const passos = ['Colar', 'Colunas', 'Conferência'];
    return `<div style="display:flex;gap:8px;margin-bottom:18px;font-size:12px">` + passos.map((p, i) => {
        const n = i + 1;
        const cor = n === atual ? 'var(--primary)' : (n < atual ? 'var(--dark)' : 'var(--muted)');
        const peso = n === atual ? '700' : '500';
        return `<span style="color:${cor};font-weight:${peso}">${n}. ${p}</span>`;
    }).join('<span style="color:var(--muted)">›</span>') + `</div>`;
}

function _kitRenderPasso(n) {
    _kitEstado.passo = n;
    const corpo = document.getElementById('kit-corpo');
    if (!corpo) return;
    if (n === 1) corpo.innerHTML = _kitTrilha(1) + _kitPasso1HTML();
    if (n === 2) corpo.innerHTML = _kitTrilha(2) + _kitPasso2HTML();
    if (n === 3) {
        if (!_kitEstado.grupos) _kitPrepararConferencia();
        corpo.innerHTML = _kitTrilha(3) + _kitPasso3HTML();
    }
}

// ── Passo 1: colar, configurar e escolher o fornecedor ──────────────────────

function _kitPasso1HTML() {
    const opcoes = (db.fornecedores || []).map(f => {
        const sel = (f.id === _kitEstado.fornecedorId) ? ' selected' : '';
        return `<option value="${f.id}"${sel}>${escapeHtml(f.nome)}</option>`;
    }).join('');
    const resumo = `<p id="kit-resumo" style="font-size:12px;color:var(--muted);margin-top:6px">${_kitTextoResumo()}</p>`;

    return `
    <div class="form-group">
        <label>Cole os dados da tabela de kits</label>
        <textarea id="kit-colar" rows="8" placeholder="Copie as linhas na planilha (Ctrl+C) e cole aqui (Ctrl+V)"
            style="width:100%;font-family:monospace;font-size:12px" oninput="_kitColadoMudou()">${escapeHtml(_kitEstado.textoColado || '')}</textarea>
    </div>
    ${resumo}
    <div class="imp-cfg-secao">
        <h4 class="imp-cfg-secao-titulo">Configurações da importação</h4>
        <p class="imp-cfg-secao-ajuda">Escolha como deseja aplicar a margem de lucro e o controle de estoque para os kits desta tabela.</p>
        <div id="kit-cfg" class="imp-cfg-grade">${_kitCardsConfigHTML()}</div>
    </div>
    <div class="imp-rodape">
        <div class="form-group imp-rodape-forn">
            <label>Fornecedor desta tabela</label>
            <select id="kit-fornecedor">
                <option value="">— Selecione —</option>
                ${opcoes}
            </select>
            <div style="display:flex;gap:8px;margin-top:8px">
                <input type="text" id="kit-novo-fornecedor" placeholder="Nome do novo fornecedor" style="flex:1;font-size:13px">
                <button class="btn btn-outline btn-sm" onclick="_kitCriarFornecedorInline()" style="white-space:nowrap">+ Cadastrar</button>
            </div>
        </div>
        <div class="imp-rodape-botoes">
            <button class="btn btn-outline" onclick="_kitVoltarParaTabela()">← Tabela de produtos</button>
            <button class="btn btn-outline" onclick="_kitFechar()">Cancelar</button>
            <button class="btn btn-success" onclick="_kitConcluirPasso1()">Continuar</button>
        </div>
    </div>`;
}

function _kitCardsConfigHTML() {
    const campoMargem = `<div class="imp-cfg-campo">
        <label for="kit-markup">Margem total (%)</label>
        <div class="imp-cfg-campo-caixa">
            <input type="number" id="kit-markup" value="${_kitEstado.markupPadrao === null ? '' : _kitEstado.markupPadrao}"
                   min="0" step="1" placeholder="Ex.: 30" onclick="event.stopPropagation()">
            <span class="imp-cfg-sufixo">%</span>
        </div>
    </div>`;
    const card = (grupo, valor, icone, titulo, descricao, extra) => {
        const atual = grupo === 'margem' ? _kitEstado.margemModo : _kitEstado.estoqueModo;
        const sel = atual === valor;
        return `<label class="imp-cfg-card${sel ? ' imp-cfg-card-sel' : ''}">
            <div class="imp-cfg-topo">
                <input type="radio" name="kit-cfg-${grupo}" value="${valor}"${sel ? ' checked' : ''}
                       onchange="_kitEscolherConfig('${grupo}','${valor}')">
                ${_impIcone(icone)}
                <span class="imp-cfg-titulo">${titulo}</span>
            </div>
            <p class="imp-cfg-desc">${descricao}</p>
            ${sel && extra ? extra : ''}
        </label>`;
    };
    return [
        card('margem', 'total', 'porcento', 'Definir margem total',
            'A mesma margem de lucro será aplicada em todos os kits da tabela, automaticamente.', campoMargem),
        card('margem', 'item', 'sliders', 'Definir margem por item',
            'Você poderá definir margens diferentes para cada kit, de forma manual, no momento da conferência ou após a importação.'),
        card('estoque', 'infinito', 'infinito', 'Estoque infinito',
            'Todos os kits da tabela serão marcados como estoque infinito. Não haverá controle de estoque, baixa ou entrada de itens.'),
        card('estoque', 'ajustar', 'caixa', 'Ajustar estoque',
            'O estoque será controlado para cada kit. Você poderá dar entrada nos kits manualmente após a importação e o sistema fará a baixa ao sair nos pedidos.')
    ].join('');
}

function _kitEscolherConfig(grupo, valor) {
    _kitCapturarPasso1();
    if (grupo === 'margem') _kitEstado.margemModo = valor;
    else _kitEstado.estoqueModo = valor;
    const alvo = document.getElementById('kit-cfg');
    if (alvo) alvo.innerHTML = _kitCardsConfigHTML();
}

// Guarda o que já foi digitado antes de qualquer redesenho do passo 1.
function _kitCapturarPasso1() {
    const sel = document.getElementById('kit-fornecedor');
    if (sel && sel.value) _kitEstado.fornecedorId = parseInt(sel.value, 10);
    const campo = document.getElementById('kit-markup');
    if (campo) {
        const bruto = String(campo.value).trim();
        const v = parseFloat(bruto);
        _kitEstado.markupPadrao = (bruto !== '' && isFinite(v) && v >= 0) ? v : null;
    }
    const colar = document.getElementById('kit-colar');
    if (colar) _kitEstado.textoColado = colar.value;
}

function _kitTextoResumo() {
    const n = _kitLinhas().length;
    return n ? `${n} linha(s) lida(s).` : '';
}

// Colar já vale sozinho, sem botão — mesma regra do outro importador.
// NÃO redesenha o passo: recriar a textarea a cada tecla jogava o cursor para
// o fim do texto e tornava impossível corrigir algo no meio do que foi colado.
// Só a linha de resumo é atualizada.
function _kitColadoMudou() {
    const campo = document.getElementById('kit-colar');
    if (!campo) return;
    _kitEstado.textoColado = campo.value;
    const texto = _kitEstado.textoColado;
    _kitEstado.planilha = texto.trim() ? window.ImportadorCore.lerColados(texto) : null;
    _kitEstado.mapa = null;
    _kitEstado.grupos = null;
    const resumo = document.getElementById('kit-resumo');
    if (resumo) resumo.textContent = _kitTextoResumo();
}

async function _kitCriarFornecedorInline() {
    const nome = document.getElementById('kit-novo-fornecedor')?.value.trim();
    if (!nome) { await showAlert('Informe o nome do novo fornecedor.', '⚠️'); return; }
    const jaExiste = db.fornecedores.find(f => (f.nome || '').toLowerCase() === nome.toLowerCase());
    if (jaExiste) {
        _kitEstado.fornecedorId = jaExiste.id;
        _kitCapturarPasso1();
        _kitRenderPasso(1);
        toast('Esse fornecedor já existe — selecionado.', 'info');
        return;
    }
    _kitCapturarPasso1();
    const novo = { id: Date.now(), nome, cnpj: '', tel: '', email: '', end: '' };
    db.fornecedores.push(novo);
    syncDB();
    _kitEstado.fornecedorId = novo.id;
    _kitRenderPasso(1);
    toast('Fornecedor cadastrado!', 'success');
}

async function _kitConcluirPasso1() {
    _kitCapturarPasso1();
    if (!_kitEstado.planilha || !_kitLinhas().length) {
        await showAlert('Cole os dados da tabela de kits.', '⚠️'); return;
    }
    const id = parseInt(document.getElementById('kit-fornecedor')?.value, 10);
    if (!id) { await showAlert('Escolha o fornecedor desta tabela.', '⚠️'); return; }
    const f = db.fornecedores.find(x => x.id === id);
    _kitEstado.fornecedor = { id: f.id, nome: f.nome };
    _kitEstado.fornecedorId = id;

    if (_kitEstado.margemModo === 'total' && _kitEstado.markupPadrao === null) {
        await showAlert('Informe a margem total (%) ou escolha “Definir margem por item”.', '⚠️');
        return;
    }

    if (!_kitEstado.mapa) {
        const C = window.ImportadorCore;
        const cab = C.detectarCabecalho(_kitLinhas());
        _kitEstado.cabecalhoIndice = cab.indice;
        _kitEstado.mapa = cab.indice >= 0
            ? C.sugerirMapeamentoKit(cab.colunas)
            : { codigo: -1, nome: -1, preco: -1, medida: -1, descricao: -1 };
    }
    _kitRenderPasso(2);
}

// ── Passo 2: dizer o que é cada coluna ──────────────────────────────────────

const _KIT_PAPEIS = [
    { chave: 'codigo',    rotulo: 'Código',    obrigatorio: true },
    { chave: 'nome',      rotulo: 'Nome',      obrigatorio: true },
    { chave: 'preco',     rotulo: 'Preço',     obrigatorio: true },
    { chave: 'medida',    rotulo: 'Medida',    obrigatorio: false },
    { chave: 'descricao', rotulo: 'Descrição', obrigatorio: false }
];

function _kitNumColunas() {
    return _kitLinhas().reduce((n, l) => Math.max(n, (l || []).length), 0);
}

// Papel atribuído a uma coluna, ou '' se nenhum.
function _kitPapelDaColuna(indice) {
    const m = _kitEstado.mapa || {};
    const achado = _KIT_PAPEIS.find(p => m[p.chave] === indice);
    return achado ? achado.chave : '';
}

// Trocar o papel de uma coluna limpa o dono anterior daquele papel.
function _kitTrocarPapel(indice, papel) {
    const m = _kitEstado.mapa;
    _KIT_PAPEIS.forEach(p => { if (m[p.chave] === indice) m[p.chave] = -1; });
    if (papel) m[papel] = indice;
    _kitEstado.grupos = null;
    _impPreservandoRolagem('kit-corpo', () => _kitRenderPasso(2));
}

// Escreve de volta na planilha lida. Não redesenha: o campo já mostra o que
// foi digitado, e recriar a tabela tiraria o foco da célula seguinte.
function _kitEditarCelula(linha, coluna, valor) {
    const dados = _kitLinhas();
    if (!dados[linha]) dados[linha] = [];
    dados[linha][coluna] = valor;
    _kitEstado.grupos = null;   // a conferência reclassifica do zero
}

// Acrescenta uma coluna que a planilha não trazia. O valor digitado preenche
// todas as linhas e cada célula continua editável depois.
function _kitAdicionarColuna() {
    const papel = document.getElementById('kit-nova-papel')?.value || '';
    const valor = document.getElementById('kit-nova-valor')?.value ?? '';
    const rotulo = document.getElementById('kit-nova-rotulo')?.value.trim();
    const dados = _kitLinhas();
    if (!dados.length) return;

    const nova = _kitNumColunas();
    const cab = _kitEstado.cabecalhoIndice;
    dados.forEach((l, i) => {
        if (!dados[i]) dados[i] = [];
        if (cab >= 0 && i <= cab) {
            // A linha de título recebe o rótulo; o que vier antes dela fica vazio.
            dados[i][nova] = (i === cab) ? (rotulo || _KIT_PAPEIS.find(p => p.chave === papel)?.rotulo || 'Nova coluna') : '';
        } else {
            dados[i][nova] = valor;
        }
    });
    if (papel) _kitEstado.mapa[papel] = nova;
    _kitEstado.grupos = null;
    _kitEstado.novaColuna = false;
    _impPreservandoRolagem('kit-corpo', () => _kitRenderPasso(2));
}

function _kitAlternarNovaColuna() {
    _kitEstado.novaColuna = !_kitEstado.novaColuna;
    _impPreservandoRolagem('kit-corpo', () => _kitRenderPasso(2));
}

function _kitMudarCabecalho(valor) {
    _kitEstado.cabecalhoIndice = parseInt(valor, 10);
    _kitEstado.grupos = null;
    _impPreservandoRolagem('kit-corpo', () => _kitRenderPasso(2));
}

function _kitFaltando() {
    const m = _kitEstado.mapa || {};
    return _KIT_PAPEIS.filter(p => p.obrigatorio && !(m[p.chave] >= 0)).map(p => p.rotulo);
}

function _kitPasso2HTML() {
    const linhas = _kitLinhas();
    const nCols = _kitNumColunas();
    const cab = _kitEstado.cabecalhoIndice;

    const opcoesCabecalho = ['<option value="-1">Sem linha de título</option>']
        .concat(linhas.slice(0, Math.min(linhas.length, 10)).map((l, i) =>
            `<option value="${i}"${i === cab ? ' selected' : ''}>Linha ${i + 1}: ${escapeHtml((l || []).filter(Boolean).slice(0, 4).join(' | ')).slice(0, 60)}</option>`))
        .join('');

    const seletores = [];
    for (let c = 0; c < nCols; c++) {
        const atual = _kitPapelDaColuna(c);
        const rotulo = cab >= 0 && linhas[cab] && linhas[cab][c] !== undefined
            ? String(linhas[cab][c]).trim() : '';
        seletores.push(`<th class="kit-col-th">
            <div class="kit-col-rotulo">${escapeHtml(rotulo || 'Coluna ' + (c + 1))}</div>
            <select onchange="_kitTrocarPapel(${c}, this.value)">
                <option value="">— ignorar —</option>
                ${_KIT_PAPEIS.map(p => `<option value="${p.chave}"${atual === p.chave ? ' selected' : ''}>${p.rotulo}${p.obrigatorio ? ' *' : ''}</option>`).join('')}
            </select>
        </th>`);
    }

    // Todas as linhas, e cada célula editável: é aqui que o usuário conserta o
    // que veio torto da planilha, antes de a conferência classificar.
    const primeiraLinha = cab >= 0 ? cab + 1 : 0;
    const amostra = linhas.slice(primeiraLinha).map((l, i) => {
        const indiceReal = primeiraLinha + i;
        const celulas = [];
        for (let c = 0; c < nCols; c++) {
            const v = (l || [])[c];
            const bruto = (v === undefined || v === null) ? '' : String(v);
            celulas.push(`<td><input class="kit-celula" size="${_impTamanhoDaCelula(bruto)}" value="${escapeHtml(bruto)}"
                title="${escapeHtml(bruto)}" onchange="_kitEditarCelula(${indiceReal}, ${c}, this.value)"></td>`);
        }
        return `<tr><td class="kit-col-linha">${indiceReal + 1}</td>${celulas.join('')}</tr>`;
    }).join('');

    const faltando = _kitFaltando();
    const aviso = faltando.length
        ? `<div class="kit-aviso">Falta dizer qual coluna é: <strong>${faltando.join(', ')}</strong>. Sem isso não dá para importar.</div>`
        : '';

    const formNova = _kitEstado.novaColuna ? `
    <div class="imp-nova-coluna">
        <span>Nova coluna:</span>
        <input type="text" id="kit-nova-rotulo" placeholder="Título (opcional)">
        <select id="kit-nova-papel">
            <option value="">— sem papel —</option>
            ${_KIT_PAPEIS.map(p => `<option value="${p.chave}">${p.rotulo}</option>`).join('')}
        </select>
        <input type="text" id="kit-nova-valor" placeholder="Valor para todas as linhas">
        <button class="btn btn-sm" onclick="_kitAdicionarColuna()">Adicionar</button>
        <button class="btn btn-outline btn-sm" onclick="_kitAlternarNovaColuna()">Cancelar</button>
    </div>` : '';

    return `
    <div class="kit-cab-linha">
        <label for="kit-cabecalho">Linha de título</label>
        <select id="kit-cabecalho" onchange="_kitMudarCabecalho(this.value)">${opcoesCabecalho}</select>
        <button class="btn btn-outline btn-sm" onclick="_kitAlternarNovaColuna()">+ Nova coluna</button>
        <span style="font-size:12px;color:var(--muted)">Código, Nome e Preço são obrigatórios. Medida e Descrição, opcionais. As células podem ser editadas.</span>
    </div>
    ${formNova}
    ${aviso}
    <div class="imp-mapa-scroll">
        <table class="imp-mapa-tabela kit-mapa-tabela">
            <thead><tr><th class="kit-col-linha">#</th>${seletores.join('')}</tr></thead>
            <tbody>${amostra}</tbody>
        </table>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
        <button class="btn btn-outline" onclick="_kitRenderPasso(1)">Voltar</button>
        <button class="btn btn-success" onclick="_kitConcluirPasso2()">Continuar</button>
    </div>`;
}

async function _kitConcluirPasso2() {
    const faltando = _kitFaltando();
    if (faltando.length) {
        await showAlert('Diga qual coluna é: ' + faltando.join(', ') + '.', '⚠️');
        return;
    }
    _kitEstado.grupos = null;
    _kitRenderPasso(3);
}

// ── Passo 3: conferência ────────────────────────────────────────────────────

const _KIT_GRUPOS = [
    { chave: 'novos',       titulo: 'Novos',               ajuda: 'Serão criados como kits prontos.' },
    { chave: 'atualizados', titulo: 'Atualizados',         ajuda: 'Kit pronto que já existe com este código: preço e dados são atualizados.' },
    { chave: 'conflitos',   titulo: 'Conflitos de código', ajuda: 'O código já pertence a outro item do sistema, ou aparece repetido nesta tabela. Edite o código ou deixe desmarcado.' },
    { chave: 'problemas',   titulo: 'Com problema',        ajuda: 'Falta código, nome ou preço. Preencha o que falta ou deixe desmarcado.' }
];

function _kitPrepararConferencia() {
    const C = window.ImportadorCore;
    const itens = C.montarItensKit({
        linhas: _kitLinhas(),
        mapa: _kitEstado.mapa,
        inicio: _kitEstado.cabecalhoIndice >= 0 ? _kitEstado.cabecalhoIndice + 1 : 0
    });
    const grupos = C.classificarKits({
        itens, kits: db.kits, catalogo: db.catalogo, materiais: db.materiais
    });
    const margemInicial = e => {
        if (_kitEstado.margemModo === 'item') return null;
        return _kitEstado.markupPadrao;
    };
    const preparar = (lista, marcado) => lista.forEach(e => {
        e.marcado = marcado;
        // Kit que já existe mantém a margem dele; atualizar custo não mexe nela.
        e.markup = e.existente ? C.markupDeExistente(e.existente) : margemInicial(e);
    });
    preparar(grupos.novos, true);
    preparar(grupos.atualizados, true);
    preparar(grupos.conflitos, false);
    preparar(grupos.problemas, false);
    _kitEstado.grupos = grupos;
}

function _kitMoeda(v) {
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _kitMarcados() {
    return _KIT_GRUPOS.reduce((n, d) => n + (_kitEstado.grupos[d.chave] || []).filter(e => e.marcado).length, 0);
}

function _kitAjudaDoGrupo(def) {
    if (def.chave === 'novos' && _kitEstado.margemModo === 'item') {
        return 'Defina a margem de cada linha. Linha deixada em branco entra com a venda igual ao custo.';
    }
    return def.ajuda;
}

function _kitPasso3HTML() {
    const C = window.ImportadorCore;
    const blocos = _KIT_GRUPOS.map(def => {
        const lista = _kitEstado.grupos[def.chave] || [];
        if (!lista.length) return '';
        const linhas = lista.map((e, i) => {
            const it = e.item;
            const venda = C.aplicarMarkup(it.preco_custo, e.markup);
            const motivo = e.motivo || it.problema;
            const alerta = motivo ? `<div style="font-size:11px;color:var(--muted)">⚠ ${escapeHtml(motivo)}</div>` : '';
            const antes = e.existente
                ? `<div style="font-size:11px;color:var(--muted)">antes: custo ${_kitMoeda(e.existente.preco_custo || 0)} · venda ${_kitMoeda(e.existente.preco || 0)}</div>`
                : '';
            return `<tr>
                <td><input type="checkbox" ${e.marcado ? 'checked' : ''} onchange="_kitAlternarMarcado('${def.chave}', ${i})"></td>
                <td><input value="${escapeHtml(it.codigo)}" style="width:100px;font-size:12px" onchange="_kitEditarCampo('${def.chave}', ${i}, 'codigo', this.value)"></td>
                <td><input value="${escapeHtml(it.nome)}" style="width:170px;font-size:12px" onchange="_kitEditarCampo('${def.chave}', ${i}, 'nome', this.value)">${alerta}</td>
                <td><input value="${escapeHtml(it.medida || '')}" style="width:100px;font-size:12px" onchange="_kitEditarCampo('${def.chave}', ${i}, 'medida', this.value)"></td>
                <td><input value="${escapeHtml(it.descricao || '')}" style="width:120px;font-size:12px" onchange="_kitEditarCampo('${def.chave}', ${i}, 'descricao', this.value)"></td>
                <td><input type="number" step="0.01" value="${it.preco_custo === null ? '' : it.preco_custo}" style="width:85px;font-size:12px" onchange="_kitEditarCampo('${def.chave}', ${i}, 'preco_custo', this.value)"></td>
                <td><input type="number" step="1" value="${e.markup === null ? '' : e.markup}" style="width:65px;font-size:12px" onchange="_kitEditarCampo('${def.chave}', ${i}, 'markup', this.value)"></td>
                <td>${_kitMoeda(venda)}${antes}</td>
            </tr>`;
        }).join('');
        return `<div class="card" style="margin-bottom:14px">
            <h4 style="margin:0 0 2px;color:var(--dark)">${def.titulo} <span style="color:var(--muted);font-weight:400">(${lista.length})</span></h4>
            <p style="font-size:12px;color:var(--muted);margin:0 0 10px">${_kitAjudaDoGrupo(def)}</p>
            <div data-painel="${def.chave}" style="max-height:260px;overflow:auto"><table>
                <thead><tr><th style="width:30px"></th><th>Código</th><th>Nome</th><th>Medida</th><th>Descrição</th><th>Custo</th><th>Margem %</th><th>Venda</th></tr></thead>
                <tbody>${linhas}</tbody>
            </table></div>
        </div>`;
    }).join('');

    const nenhum = !blocos
        ? `<p style="text-align:center;color:var(--muted);padding:30px 0">Nenhum kit foi lido. Volte e confira o mapeamento das colunas.</p>`
        : '';

    const infinito = _kitEstado.estoqueModo === 'infinito'
        ? `<span class="kit-selo">∞ estoque infinito</span>` : '';

    return `
    <p style="font-size:13px;color:var(--muted);margin:0 0 12px">
        Confira e ajuste o que quiser. Só as linhas marcadas serão gravadas. ${infinito}
    </p>
    ${blocos}${nenhum}
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:6px">
        <button class="btn btn-outline" onclick="_kitRenderPasso(2)">Voltar</button>
        <button class="btn btn-success" onclick="_kitGravar()">Gravar ${_kitMarcados()} kit(s)</button>
    </div>`;
}

function _kitAlternarMarcado(chave, i) {
    const e = _kitEstado.grupos[chave][i];
    e.marcado = !e.marcado;
    _kitRenderPasso(3);
}

function _kitEditarCampo(chave, i, campo, valor) {
    const e = _kitEstado.grupos[chave][i];
    const C = window.ImportadorCore;
    if (campo === 'markup') {
        const v = parseFloat(valor);
        e.markup = isFinite(v) ? v : null;
    } else if (campo === 'preco_custo') {
        const p = C.normalizarPreco(valor);
        e.item.preco_custo = p.ok ? p.valor : null;
    } else if (campo === 'codigo') {
        e.item.codigo = C.normalizarCodigo(valor).codigo;
    } else if (campo === 'nome') {
        e.item.nome = C.normalizarNome(valor);
    } else {
        e.item[campo] = String(valor).trim();
    }
    // Código, nome e custo mudam a classificação; reclassifica preservando as
    // margens e as marcações que o usuário já ajustou.
    if (campo === 'codigo' || campo === 'nome' || campo === 'preco_custo') _kitReclassificar();
    _kitRenderPasso(3);
}

// Reconstrói os grupos a partir dos itens atuais, levando junto markup e
// marcação de cada linha (casados pelo objeto `item`, que é o mesmo).
function _kitReclassificar() {
    const C = window.ImportadorCore;
    const antes = new Map();
    _KIT_GRUPOS.forEach(d => (_kitEstado.grupos[d.chave] || []).forEach(e => {
        antes.set(e.item, { markup: e.markup, marcado: e.marcado });
    }));
    const itens = [...antes.keys()];
    itens.forEach(it => {
        const faltas = [];
        if (!it.codigo) faltas.push('código');
        if (!it.nome) faltas.push('nome');
        if (it.preco_custo === null) faltas.push('preço');
        it.problema = faltas.length ? 'Falta ' + faltas.join(', ') : null;
    });
    const grupos = C.classificarKits({ itens, kits: db.kits, catalogo: db.catalogo, materiais: db.materiais });
    _KIT_GRUPOS.forEach(d => (grupos[d.chave] || []).forEach(e => {
        const guardado = antes.get(e.item);
        e.markup = guardado ? guardado.markup : null;
        e.marcado = guardado ? guardado.marcado : false;
    }));
    _kitEstado.grupos = grupos;
}

async function _kitGravar() {
    const C = window.ImportadorCore;
    const decisoes = [];
    _KIT_GRUPOS.forEach(def => (_kitEstado.grupos[def.chave] || []).forEach(e => {
        if (!e.marcado) return;
        decisoes.push({ item: e.item, existente: e.existente || null, markup: e.markup,
                        acao: e.existente ? 'atualizar' : 'criar' });
    }));
    if (!decisoes.length) { await showAlert('Marque ao menos um kit para gravar.', '⚠️'); return; }

    // Uma linha marcada que continua em conflito ou com problema não pode passar.
    const barradas = [];
    _KIT_GRUPOS.forEach(def => {
        if (def.chave !== 'conflitos' && def.chave !== 'problemas') return;
        (_kitEstado.grupos[def.chave] || []).forEach(e => {
            if (e.marcado) barradas.push('• ' + (e.item.codigo || '(sem código)') + ': ' + (e.motivo || e.item.problema || 'pendência'));
        });
    });
    if (barradas.length) {
        await showAlert('Resolva estas pendências antes de gravar:\n\n' + barradas.join('\n'), '⚠️');
        return;
    }

    if (!await showConfirm(`Gravar ${decisoes.length} kit(s)?`, '📦', 'Gravar', 'Cancelar')) return;

    const r = C.aplicarImportacaoKits({
        decisoes,
        kits: db.kits,
        fornecedor: _kitEstado.fornecedor,
        estoqueInfinito: _kitEstado.estoqueModo === 'infinito',
        agora: Date.now()
    });

    // Snapshot antes de tocar no db: sem poder desfazer, melhor não importar.
    try {
        _kitSalvarSnapshot(r.resumo, r.mudancas);
    } catch (e) {
        await showAlert('Não foi possível preparar o "desfazer" desta importação'
            + (e && e.message ? ' (' + e.message + ')' : '')
            + '.\n\nNada foi gravado. Libere espaço no navegador e tente de novo.', '⚠️');
        return;
    }

    db.kits = r.kits;
    _kitFechar();
    salvarERecarregar(`${r.resumo.criados} kit(s) criado(s), ${r.resumo.atualizados} atualizado(s). Veja em Estoque › Kits.`);
}

// ── Desfazer ────────────────────────────────────────────────────────────────

const CHAVE_SNAPSHOT_KIT = 'sc_kit_snap';

function _kitSalvarSnapshot(resumo, mudancas) {
    localStorage.setItem(CHAVE_SNAPSHOT_KIT, JSON.stringify({
        quando: new Date().toISOString(), versao: 1, resumo, mudancas
    }));
}

// Mesma regra do importador de produtos: só vale enquanto estiver no prazo.
function _kitSnapshot() {
    let snap = null;
    try { snap = JSON.parse(localStorage.getItem(CHAVE_SNAPSHOT_KIT)); } catch (e) { return null; }
    if (!snap || !snap.mudancas) return null;
    const quando = Date.parse(snap.quando);
    if (!isFinite(quando)) return null;
    if (Date.now() - quando > PRAZO_DESFAZER_DIAS * 24 * 60 * 60 * 1000) return null;
    return snap;
}

async function desfazerImportacaoDeKits() {
    const C = window.ImportadorCore;
    const snap = _kitSnapshot();
    if (!snap) { await showAlert('Não há importação de kits recente para desfazer.', 'ℹ️'); return; }
    const quando = new Date(snap.quando).toLocaleString('pt-BR');
    const msg = `Desfazer a importação de kits de ${quando}?\n\n`
        + `${snap.resumo.criados} kit(s) criado(s) serão apagados e `
        + `${snap.resumo.atualizados} kit(s) atualizado(s) voltarão ao preço e aos dados anteriores.\n\n`
        + `Kit que já tem saldo em estoque é mantido.`;
    if (!await showConfirm(msg, '↩️', 'Desfazer', 'Cancelar')) return;

    const r = C.desfazerImportacaoKits({ kits: db.kits, mudancas: snap.mudancas });
    const antes = db.kits;
    const bruto = localStorage.getItem(CHAVE_SNAPSHOT_KIT);
    try {
        db.kits = r.kits;
        localStorage.removeItem(CHAVE_SNAPSHOT_KIT);
        const extras = [];
        if (r.resumo.mantidos) extras.push(`${r.resumo.mantidos} kit(s) mantido(s) por já terem saldo`);
        if (r.resumo.sumidos) extras.push(`${r.resumo.sumidos} kit(s) já não existiam`);
        salvarERecarregar('Importação de kits desfeita.' + (extras.length ? ' ' + extras.join('; ') + '.' : ''));
    } catch (e) {
        db.kits = antes;
        try { syncDB(); } catch (e2) { /* nada mais a fazer aqui */ }
        try { if (bruto) localStorage.setItem(CHAVE_SNAPSHOT_KIT, bruto); } catch (e3) { /* idem */ }
        await showAlert('Não foi possível desfazer a importação de kits'
            + (e && e.message ? ' (' + e.message + ')' : '')
            + '.\n\nNada foi alterado.', '⚠️');
    }
}
