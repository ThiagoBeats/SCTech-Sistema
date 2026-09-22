'use strict';
// Assistente de importacao de tabelas de fornecedor.
// A logica pura vive em js/importador-core.js (window.ImportadorCore).

const CDN_SHEETJS = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

let _impSheetJsPronto = null;

// O app.js nao tem helper de moeda compartilhado — ele repete toLocaleString
// em cada tela. Este modulo define o seu.
function _impMoeda(v) {
    return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function _impGarantirSheetJs() {
    if (window.XLSX) return;
    if (!_impSheetJsPronto) {
        _impSheetJsPronto = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = CDN_SHEETJS;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Não foi possível carregar o leitor de planilhas — verifique sua conexão.'));
            document.head.appendChild(s);
        });
    }
    await _impSheetJsPronto;
}

// Converte a planilha em { ordem, abas }, o mesmo formato consumido pelo core.
async function _impLerArquivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        throw new Error('Formato não suportado nesta etapa: .' + ext);
    }
    await _impGarantirSheetJs();
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array' });
    const abas = {};
    wb.SheetNames.forEach(nome => {
        // header:1 devolve array de arrays; defval:'' evita buracos no meio da linha
        abas[nome] = window.XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', raw: false, blankrows: true });
    });
    return { ordem: wb.SheetNames.slice(), abas };
}

const _impEstado = {
    file: null,
    planilha: null,      // { ordem, abas }
    fornecedor: null,    // { id, nome }
    fornecedorId: null,  // id escolhido no select antes de confirmar no passo 1
    markupPadrao: 80,
    abas: {},            // { [nomeAba]: 'tecido' | 'material' | 'ignorar' }
    layouts: {},         // { [assinatura]: { mapa, cabecalhoIndice } }
    cores: {},           // { [assinatura]: [indices de coluna que sao cor] }
    grupos: null,        // saida de ImportadorCore.classificar
    passo: 1
};

function _impResetar() {
    _impEstado.file = null;
    _impEstado.planilha = null;
    _impEstado.fornecedor = null;
    _impEstado.fornecedorId = null;
    _impEstado.markupPadrao = 80;
    _impEstado.abas = {};
    _impEstado.layouts = {};
    _impEstado.cores = {};
    _impEstado.grupos = null;
    _impEstado.passo = 1;
}

function abrirImportadorTabela() {
    _impResetar();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'imp-overlay';
    overlay.innerHTML = `<div class="modal-box" style="max-width:980px">
        <div class="modal-header">
            <h3>Importar tabela de fornecedor</h3>
            <button class="modal-close" onclick="_impFechar()">×</button>
        </div>
        <div class="modal-body" id="imp-corpo"></div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) _impFechar(); });
    document.body.appendChild(overlay);
    _impRenderPasso(1);
}

function _impFechar() {
    const o = document.getElementById('imp-overlay');
    if (o) o.remove();
}

function _impTrilha(atual) {
    const passos = ['Arquivo', 'Abas', 'Colunas', 'Conferência'];
    return `<div style="display:flex;gap:8px;margin-bottom:18px;font-size:12px">` + passos.map((p, i) => {
        const n = i + 1;
        const ativo = n === atual;
        const feito = n < atual;
        const cor = ativo ? 'var(--primary)' : (feito ? 'var(--dark)' : 'var(--muted)');
        const peso = ativo ? '700' : '500';
        return `<span style="color:${cor};font-weight:${peso}">${n}. ${p}</span>`;
    }).join('<span style="color:var(--muted)">›</span>') + `</div>`;
}

function _impRenderPasso(n) {
    _impEstado.passo = n;
    const corpo = document.getElementById('imp-corpo');
    if (!corpo) return;
    if (n === 1) corpo.innerHTML = _impTrilha(1) + _impPasso1HTML();
    if (n === 2) corpo.innerHTML = _impTrilha(2) + _impPasso2HTML();
    if (n === 3) corpo.innerHTML = _impTrilha(3) + _impPasso3HTML();
    if (n === 4) {
        // So reclassifica ao ENTRAR no passo 4 — recalcular a cada render
        // jogaria fora as edicoes que o usuario acabou de fazer na tela
        // (marcar/desmarcar, editar custo/codigo/nome). Voltar ao passo 3 e
        // avancar de novo limpa _impEstado.grupos (ver _impVoltarAoPasso3),
        // entao o mapeamento alterado e reclassificado aqui.
        if (!_impEstado.grupos) _impPrepararConferencia();
        corpo.innerHTML = _impTrilha(4) + _impPasso4HTML();
    }
}

// ── Passo 1: arquivo e fornecedor ────────────────────────────────────────────
function _impPasso1HTML() {
    const opcoes = (db.fornecedores || [])
        .map(f => {
            const sel = (f.id === _impEstado.fornecedorId) ? ' selected' : '';
            return `<option value="${f.id}"${sel}>${escapeHtml(f.nome)}</option>`;
        }).join('');
    const nomeArquivo = _impEstado.file ? escapeHtml(_impEstado.file.name) : '';
    return `
    <div class="form-group">
        <label>Arquivo da tabela</label>
        <input type="file" id="imp-file" accept=".xlsx,.xls,.csv" onchange="_impArquivoEscolhido(this)">
        ${nomeArquivo ? `<p style="font-size:12px;color:var(--muted);margin-top:6px">Lido: ${nomeArquivo} — ${_impEstado.planilha.ordem.length} aba(s)</p>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">
        <div class="form-group">
            <label>Fornecedor desta tabela</label>
            <select id="imp-fornecedor">
                <option value="">— Selecione —</option>
                ${opcoes}
            </select>
            <div style="display:flex;gap:8px;margin-top:8px">
                <input type="text" id="imp-novo-fornecedor" placeholder="Nome do novo fornecedor" style="flex:1;font-size:13px">
                <button class="btn btn-outline btn-sm" onclick="_impCriarFornecedorInline()" style="white-space:nowrap">+ Cadastrar</button>
            </div>
        </div>
        <div class="form-group">
            <label>Markup dos itens novos (%)</label>
            <input type="number" id="imp-markup" value="${_impEstado.markupPadrao}" min="0" step="1">
            <small style="font-size:11px;color:var(--muted)">Itens que já existem mantêm o markup deles.</small>
        </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
        <button class="btn btn-outline" onclick="_impFechar()">Cancelar</button>
        <button class="btn btn-success" onclick="_impConcluirPasso1()">Continuar</button>
    </div>`;
}

async function _impArquivoEscolhido(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
        // Captura valores da forma antes de re-renderizar (ao carregar arquivo)
        const selFornecedor = document.getElementById('imp-fornecedor');
        const selMarkup = document.getElementById('imp-markup');
        if (selFornecedor && selFornecedor.value) {
            _impEstado.fornecedorId = parseInt(selFornecedor.value, 10);
        }
        if (selMarkup && selMarkup.value) {
            _impEstado.markupPadrao = parseFloat(selMarkup.value) || 80;
        }

        _impEstado.file = file;
        _impEstado.planilha = await _impLerArquivo(file);
        _impSugerirAbas();
        _impRenderPasso(1);
    } catch (e) {
        _impEstado.file = null;
        _impEstado.planilha = null;
        await showAlert(e.message, '⚠️');
    }
}

function _impSugerirAbas() {
    const C = window.ImportadorCore;
    _impEstado.abas = {};
    _impEstado.planilha.ordem.forEach(nome => {
        const { colunas } = C.detectarCabecalho(_impEstado.planilha.abas[nome]);
        _impEstado.abas[nome] = C.sugerirTipoAba(nome, colunas);
    });
}

async function _impCriarFornecedorInline() {
    const campo = document.getElementById('imp-novo-fornecedor');
    const limpo = (campo?.value || '').trim();
    if (!limpo) { await showAlert('Escreva o nome do novo fornecedor.', '⚠️'); return; }
    if ((db.fornecedores || []).some(f => f.nome.trim().toLowerCase() === limpo.toLowerCase())) {
        await showAlert('Já existe um fornecedor com esse nome.', '⚠️');
        return;
    }
    const novo = { id: Date.now(), nome: limpo, cnpj: '', nome_fantasia: '', end: '', num: '', cidade: '', estado: '', tel: '', email: '', ie: '', obs: '' };
    db.fornecedores.push(novo);
    syncDB();
    _impEstado.fornecedor = { id: novo.id, nome: novo.nome };
    _impEstado.fornecedorId = novo.id;
    _impRenderPasso(1);
    const sel = document.getElementById('imp-fornecedor');
    if (sel) sel.value = String(novo.id);
    toast('Fornecedor cadastrado.', 'success');
}

async function _impConcluirPasso1() {
    const C = window.ImportadorCore;
    if (!_impEstado.planilha) { await showAlert('Escolha o arquivo da tabela.', '⚠️'); return; }
    const id = parseInt(document.getElementById('imp-fornecedor').value, 10);
    if (!id) { await showAlert('Escolha o fornecedor desta tabela.', '⚠️'); return; }
    const f = db.fornecedores.find(x => x.id === id);
    _impEstado.fornecedor = { id: f.id, nome: f.nome };
    _impEstado.fornecedorId = id;
    _impEstado.markupPadrao = parseFloat(document.getElementById('imp-markup').value) || 0;

    const perfil = C.perfilDoFornecedor(db.import_perfis, id);
    if (perfil) {
        Object.keys(perfil.abas || {}).forEach(aba => {
            if (_impEstado.abas[aba] !== undefined) _impEstado.abas[aba] = perfil.abas[aba];
        });
        (perfil.layouts || []).forEach(l => { _impEstado.layouts[l.assinatura] = { mapa: l.mapa, cabecalhoIndice: l.cabecalhoIndice }; });
        if (perfil.markup_padrao) _impEstado.markupPadrao = perfil.markup_padrao;
        (perfil.cores && Object.keys(perfil.cores).forEach(a => { _impEstado.cores[a] = perfil.cores[a]; }));
        toast(`Perfil "${perfil.nome}" aplicado.`, 'info');
        // Perfil cobre abas e mapeamento: o usuario pode ir direto conferir.
        const pular = await showConfirm(
            `Há um perfil salvo para ${_impEstado.fornecedor.nome}. Ir direto para a conferência?`,
            '⚡', 'Ir para a conferência', 'Revisar os passos');
        if (pular && _impPerfilCobreTudo()) { _impRenderPasso(4); return; }
    }
    _impRenderPasso(2);
}

// So pula se o perfil tiver mapeamento para todo layout que sera usado.
function _impPerfilCobreTudo() {
    if (typeof _impLayoutsDistintos !== 'function') return false; // so existe a partir da Task 12
    return _impLayoutsDistintos().every(l => !!_impEstado.layouts[l.assinatura]);
}

// ── Passo 2: abas e tipo ─────────────────────────────────────────────────────
function _impPasso2HTML() {
    const C = window.ImportadorCore;
    const linhas = _impEstado.planilha.ordem.map((nome, ai) => {
        const dados = _impEstado.planilha.abas[nome];
        const { indice, colunas } = C.detectarCabecalho(dados);
        const tipo = _impEstado.abas[nome];
        const mapa = C.sugerirMapeamento(colunas);
        const qtd = indice === -1 ? 0 : C.montarItens({ linhas: dados, cabecalhoIndice: indice, mapa, tipo: tipo === 'ignorar' ? 'material' : tipo, aba: nome }).length;
        const sel = t => tipo === t ? 'selected' : '';
        return `<tr>
            <td>${escapeHtml(nome)}</td>
            <td style="color:var(--muted)">${indice === -1 ? 'cabeçalho não encontrado' : 'linha ' + (indice + 1)}</td>
            <td>${qtd}</td>
            <td>
                <select onchange="_impTrocarTipoAba(${ai}, this.value)">
                    <option value="tecido" ${sel('tecido')}>Tecido</option>
                    <option value="material" ${sel('material')}>Material</option>
                    <option value="ignorar" ${sel('ignorar')}>Ignorar</option>
                </select>
            </td>
        </tr>`;
    }).join('');
    return `
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">Escolha o que fazer com cada aba da planilha. A contagem é de linhas que parecem produto.</p>
    <div style="max-height:380px;overflow:auto">
        <table><thead><tr><th>Aba</th><th>Cabeçalho</th><th>Itens</th><th>Tipo</th></tr></thead><tbody>${linhas}</tbody></table>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:18px">
        <button class="btn btn-outline" onclick="_impRenderPasso(1)">Voltar</button>
        <button class="btn btn-success" onclick="_impConcluirPasso2()">Continuar</button>
    </div>`;
}

// Indice em vez do nome da aba: nome de aba pode ter aspas e quebraria o onchange.
function _impTrocarTipoAba(indiceAba, tipo) {
    const nome = _impEstado.planilha.ordem[indiceAba];
    _impEstado.abas[nome] = tipo;
}

async function _impConcluirPasso2() {
    const usadas = Object.values(_impEstado.abas).filter(t => t !== 'ignorar');
    if (usadas.length === 0) { await showAlert('Marque ao menos uma aba como Tecido ou Material.', '⚠️'); return; }
    _impRenderPasso(3);
}

// ── Passo 3: mapeamento de colunas ───────────────────────────────────────────
const _IMP_PAPEIS = [
    { valor: 'ignorar', rotulo: 'Ignorar' },
    { valor: 'codigo',  rotulo: 'Código' },
    { valor: 'nome',    rotulo: 'Nome' },
    { valor: 'largura', rotulo: 'Largura' },
    { valor: 'preco',   rotulo: 'Preço' },
    { valor: 'unidade', rotulo: 'Unidade' }
];

// Agrupa as abas em uso por assinatura de cabecalho: as 7 abas de tecido
// compartilham a mesma, entao o usuario mapeia uma vez so.
function _impLayoutsDistintos() {
    const C = window.ImportadorCore;
    const porAssinatura = {};
    _impEstado.planilha.ordem.forEach(nome => {
        const tipo = _impEstado.abas[nome];
        if (tipo === 'ignorar') return;
        const dados = _impEstado.planilha.abas[nome];
        const { indice, colunas } = C.detectarCabecalho(dados);
        const assinatura = C.assinaturaDoLayout(colunas) + '#' + tipo;
        if (!porAssinatura[assinatura]) {
            porAssinatura[assinatura] = { assinatura, colunas, cabecalhoIndice: indice, abas: [], tipo };
        }
        porAssinatura[assinatura].abas.push(nome);
    });
    return Object.values(porAssinatura);
}

function _impMapaDoLayout(layout) {
    const C = window.ImportadorCore;
    if (_impEstado.layouts[layout.assinatura]) return _impEstado.layouts[layout.assinatura].mapa;
    return C.sugerirMapeamento(layout.colunas);
}

function _impPasso3HTML() {
    const C = window.ImportadorCore;
    const layouts = _impLayoutsDistintos();
    const blocos = layouts.map((layout, li) => {
        const mapa = _impMapaDoLayout(layout);
        const dados = _impEstado.planilha.abas[layout.abas[0]];
        const inicio = layout.cabecalhoIndice + 1;
        const amostra = dados.slice(inicio, inicio + 3);

        const papelDaColuna = ci => {
            const achado = Object.keys(mapa).find(k => mapa[k] === ci);
            return achado || 'ignorar';
        };

        const cabecalhos = layout.colunas.map((rotulo, ci) => {
            const atual = papelDaColuna(ci);
            const opcoes = _IMP_PAPEIS.map(p => `<option value="${p.valor}" ${p.valor === atual ? 'selected' : ''}>${p.rotulo}</option>`).join('');
            return `<th style="min-width:120px">
                <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${escapeHtml(rotulo || '(sem título)')}</div>
                <select style="width:100%;font-size:12px" onchange="_impTrocarPapel(${li}, ${ci}, this.value)">${opcoes}</select>
            </th>`;
        }).join('');

        const corpo = amostra.map(linha =>
            '<tr>' + layout.colunas.map((_, ci) => `<td style="font-size:12px">${escapeHtml(String(linha[ci] === undefined ? '' : linha[ci]))}</td>`).join('') + '</tr>'
        ).join('');

        const qtd = C.montarItens({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa, tipo: layout.tipo, aba: layout.abas[0] }).length;

        return `<div class="card" style="margin-bottom:14px">
            <h4 style="margin:0 0 4px;color:var(--dark)">${layout.tipo === 'tecido' ? 'Tecidos' : 'Materiais'} — ${layout.abas.length} aba(s)</h4>
            <p style="font-size:12px;color:var(--muted);margin:0 0 10px">${escapeHtml(layout.abas.join(', '))}</p>
            <div style="overflow-x:auto"><table><thead><tr>${cabecalhos}</tr></thead><tbody>${corpo}</tbody></table></div>
            <p style="font-size:12px;color:var(--muted);margin:8px 0 0">${qtd} item(ns) na primeira aba deste layout.</p>
        </div>`;
    }).join('');

    return `
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">Diga o que é cada coluna. Abas com o mesmo cabeçalho são mapeadas juntas.</p>
    ${blocos}
    <div style="display:flex;justify-content:space-between;margin-top:8px">
        <button class="btn btn-outline" onclick="_impRenderPasso(2)">Voltar</button>
        <button class="btn btn-success" onclick="_impConcluirPasso3()">Continuar</button>
    </div>`;
}

function _impTrocarPapel(indiceLayout, indiceColuna, papel) {
    const layout = _impLayoutsDistintos()[indiceLayout];
    const mapa = Object.assign({}, _impMapaDoLayout(layout));
    // um papel pertence a uma coluna so: limpa quem estava com ele
    Object.keys(mapa).forEach(k => { if (mapa[k] === indiceColuna) mapa[k] = -1; });
    if (papel !== 'ignorar') mapa[papel] = indiceColuna;
    _impEstado.layouts[layout.assinatura] = { mapa, cabecalhoIndice: layout.cabecalhoIndice };
    _impRenderPasso(3);
}

async function _impConcluirPasso3() {
    const layouts = _impLayoutsDistintos();
    for (const layout of layouts) {
        const mapa = _impMapaDoLayout(layout);
        if (mapa.codigo < 0 || mapa.nome < 0 || mapa.preco < 0) {
            // Abas sem cabecalho reconhecivel caem aqui: a saida prevista e
            // marca-las como "Ignorar" no passo 2 (ou, na Fase 2, apontar a
            // linha do cabecalho na mao).
            const semCabecalho = layout.cabecalhoIndice < 0;
            await showAlert(
                `Não dá para mapear ${semCabecalho ? 'estas abas, que não têm cabeçalho reconhecível' : 'este layout'}:\n\n`
                + layout.abas.join(', ')
                + `\n\nMarque ao menos as colunas de Código, Nome e Preço — ou volte ao passo 2 e marque estas abas como "Ignorar".`,
                '⚠️');
            return;
        }
        _impEstado.layouts[layout.assinatura] = { mapa, cabecalhoIndice: layout.cabecalhoIndice };
    }
    _impRenderPasso(4);
}

// ── Passo 4: conferencia ─────────────────────────────────────────────────────
const CHAVE_SNAPSHOT = 'sc_imp_snap';

function _impColetarItens() {
    const C = window.ImportadorCore;
    const itens = [];
    _impEstado.planilha.ordem.forEach(aba => {
        const tipo = _impEstado.abas[aba];
        if (tipo === 'ignorar') return;
        const dados = _impEstado.planilha.abas[aba];
        const { colunas } = C.detectarCabecalho(dados);
        const assinatura = C.assinaturaDoLayout(colunas) + '#' + tipo;
        const layout = _impEstado.layouts[assinatura];
        if (!layout) return;
        itens.push(...C.montarItens({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa: layout.mapa, tipo, aba }));
    });
    return itens;
}

function _impPrepararConferencia() {
    const C = window.ImportadorCore;
    const grupos = C.classificar({
        itens: _impColetarItens(),
        catalogo: db.catalogo,
        materiais: db.materiais,
        fornecedorId: _impEstado.fornecedor.id
    });
    // marcado/markup por entrada, decididos aqui e editaveis na tela
    const preparar = (lista, marcadoPadrao, markupFn) => lista.forEach(e => {
        e.marcado = marcadoPadrao;
        e.markup = markupFn(e);
    });
    preparar(grupos.novos, true, () => _impEstado.markupPadrao);
    preparar(grupos.atualizados, true, e => C.markupDeExistente(e.existente));
    preparar(grupos.sem_markup, true, () => _impEstado.markupPadrao);
    preparar(grupos.conflitos, false, () => _impEstado.markupPadrao);
    preparar(grupos.nomes_repetidos, false, () => _impEstado.markupPadrao);
    preparar(grupos.problemas, false, () => _impEstado.markupPadrao);
    _impEstado.grupos = grupos;
}

const _IMP_GRUPOS = [
    { chave: 'novos',           titulo: 'Novos',                   ajuda: 'Serão criados com o markup informado.' },
    { chave: 'atualizados',     titulo: 'Atualizados',             ajuda: 'Custo novo, venda recalculada com o markup atual do item.' },
    { chave: 'sem_markup',      titulo: 'Sem markup registrado',   ajuda: 'O item já existe mas não tem markup. Defina um para cada linha.' },
    { chave: 'conflitos',       titulo: 'Conflitos de código',     ajuda: 'O código já é de outro fornecedor. Edite o código ou desmarque.' },
    { chave: 'nomes_repetidos', titulo: 'Nomes repetidos',         ajuda: 'O nome já pertence a outro produto. Edite o nome ou desmarque.' },
    { chave: 'problemas',       titulo: 'Com problema',            ajuda: 'Preço ilegível. Corrija o valor ou deixe desmarcado.' }
];

function _impPasso4HTML() {
    const g = _impEstado.grupos;
    const blocos = _IMP_GRUPOS.map(def => {
        const lista = g[def.chave];
        if (!lista.length) return '';
        const linhas = lista.map((e, i) => {
            const it = e.item;
            const venda = window.ImportadorCore.aplicarMarkup(it.preco_custo, e.markup);
            const antes = e.existente
                ? `<div style="font-size:11px;color:var(--muted)">antes: custo ${_impMoeda(e.existente.preco_custo || 0)} · venda ${_impMoeda(e.existente.preco || 0)}</div>`
                : '';
            const alerta = (e.motivo ? [e.motivo] : []).concat(it.avisos)
                .map(a => `<div style="font-size:11px;color:var(--muted)">⚠ ${escapeHtml(a)}</div>`).join('');
            return `<tr>
                <td><input type="checkbox" ${e.marcado ? 'checked' : ''} onchange="_impAlternarMarcado('${def.chave}', ${i})"></td>
                <td style="font-size:12px;color:var(--muted)">${escapeHtml(it.aba)}</td>
                <td><input value="${escapeHtml(it.codigo)}" style="width:110px;font-size:12px" onchange="_impEditarCampo('${def.chave}', ${i}, 'codigo', this.value)"></td>
                <td><input value="${escapeHtml(it.nome)}" style="width:220px;font-size:12px" onchange="_impEditarCampo('${def.chave}', ${i}, 'nome', this.value)">${alerta}</td>
                <td><input type="number" step="0.01" value="${it.preco_custo === null ? '' : it.preco_custo}" style="width:90px;font-size:12px" onchange="_impEditarCampo('${def.chave}', ${i}, 'preco_custo', this.value)"></td>
                <td><input type="number" step="1" value="${e.markup === null ? '' : e.markup}" style="width:70px;font-size:12px" onchange="_impEditarCampo('${def.chave}', ${i}, 'markup', this.value)"></td>
                <td>${_impMoeda(venda)}${antes}</td>
            </tr>`;
        }).join('');
        return `<div class="card" style="margin-bottom:14px">
            <h4 style="margin:0 0 2px;color:var(--dark)">${def.titulo} <span style="color:var(--muted);font-weight:400">(${lista.length})</span></h4>
            <p style="font-size:12px;color:var(--muted);margin:0 0 10px">${def.ajuda}</p>
            <div style="max-height:260px;overflow:auto"><table>
                <thead><tr><th></th><th>Aba</th><th>Código</th><th>Nome</th><th>Custo</th><th>Markup %</th><th>Venda</th></tr></thead>
                <tbody>${linhas}</tbody>
            </table></div>
        </div>`;
    }).join('');

    const sumiram = g.sumiram.length
        ? `<div class="card" style="margin-bottom:14px">
            <h4 style="margin:0 0 2px;color:var(--dark)">Sumiram da tabela <span style="color:var(--muted);font-weight:400">(${g.sumiram.length})</span></h4>
            <p style="font-size:12px;color:var(--muted);margin:0">Estão cadastrados e não vieram nesta tabela. Nada será alterado neles.</p>
            <p style="font-size:12px;margin:8px 0 0">${g.sumiram.slice(0, 20).map(e => escapeHtml(e.existente.referencia || e.existente.nome)).join(', ')}${g.sumiram.length > 20 ? '…' : ''}</p>
        </div>` : '';

    const marcados = _IMP_GRUPOS.reduce((n, d) => n + g[d.chave].filter(e => e.marcado).length, 0);

    return `
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">Confira e ajuste o que quiser. Só as linhas marcadas serão gravadas.</p>
    ${blocos}${sumiram}
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:6px 0 14px;cursor:pointer">
        <input type="checkbox" id="imp-salvar-perfil" checked> Salvar este mapeamento como perfil deste fornecedor
    </label>
    <div style="display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-outline" onclick="_impVoltarAoPasso3()">Voltar</button>
        <button class="btn btn-success" onclick="_impGravar()">Gravar ${marcados} item(ns)</button>
    </div>`;
}

// Voltar do passo 4 para o 3 pode mudar o mapeamento de colunas — limpa os
// grupos para que a proxima entrada no passo 4 reclassifique do zero.
function _impVoltarAoPasso3() {
    _impEstado.grupos = null;
    _impRenderPasso(3);
}

function _impAlternarMarcado(chave, i) {
    const e = _impEstado.grupos[chave][i];
    e.marcado = !e.marcado;
    _impRenderPasso(4);
}

function _impEditarCampo(chave, i, campo, valor) {
    const C = window.ImportadorCore;
    const e = _impEstado.grupos[chave][i];
    if (campo === 'markup') { e.markup = parseFloat(valor); if (!isFinite(e.markup)) e.markup = 0; }
    else if (campo === 'preco_custo') {
        const p = C.normalizarPreco(valor);
        e.item.preco_custo = p.ok ? p.valor : null;
        e.item.problema = p.ok ? null : p.motivo;
    }
    else if (campo === 'codigo') e.item.codigo = C.normalizarCodigo(valor).codigo;
    else if (campo === 'nome') e.item.nome = C.normalizarNome(valor);
    _impRenderPasso(4);
}

// ── Gravacao, snapshot e desfazer ────────────────────────────────────────────
function _impSalvarSnapshot(resumo) {
    localStorage.setItem(CHAVE_SNAPSHOT, JSON.stringify({
        quando: new Date().toISOString(),
        resumo,
        catalogo: db.catalogo,
        materiais: db.materiais
    }));
}

async function _impGravar() {
    const C = window.ImportadorCore;
    const g = _impEstado.grupos;
    const decisoes = [];
    _IMP_GRUPOS.forEach(def => {
        g[def.chave].forEach(e => {
            const ignorar = { item: e.item, existente: e.existente, markup: e.markup, acao: 'ignorar' };
            if (!e.marcado || e.item.preco_custo === null) { decisoes.push(ignorar); return; }
            // a acao sai do codigo atual do item, nao do grupo: se o usuario
            // editou o codigo de um conflito, isto vira "criar" sozinho
            const r = C.resolverAcao(e.item, db.catalogo, db.materiais);
            decisoes.push({ item: e.item, existente: r.existente, markup: e.markup, acao: r.acao });
        });
    });

    const vaiGravar = decisoes.filter(d => d.acao !== 'ignorar').length;
    if (!vaiGravar) { await showAlert('Nenhuma linha marcada para gravar.', '⚠️'); return; }

    const erros = C.validarDecisoes(decisoes, db.catalogo, db.materiais);
    if (erros.length) {
        await showAlert('Corrija antes de gravar:\n\n' + erros.slice(0, 8).join('\n')
            + (erros.length > 8 ? `\n\n…e mais ${erros.length - 8}.` : ''), '⚠️');
        return;
    }

    if (!await showConfirm(`Gravar ${vaiGravar} item(ns) no catálogo?`, '📥', 'Gravar', 'Cancelar')) return;

    const r = C.aplicarImportacao({
        decisoes,
        catalogo: db.catalogo,
        materiais: db.materiais,
        fornecedor: _impEstado.fornecedor,
        agora: Date.now()
    });

    _impSalvarSnapshot(r.resumo);
    db.catalogo = r.catalogo;
    db.materiais = r.materiais;

    if (document.getElementById('imp-salvar-perfil')?.checked) _impSalvarPerfil();

    salvarERecarregar(`Importação concluída: ${r.resumo.criados} criado(s), ${r.resumo.atualizados} atualizado(s).`);
}

function _impSalvarPerfil() {
    const C = window.ImportadorCore;
    const layouts = Object.keys(_impEstado.layouts).map(assinatura => ({
        assinatura,
        mapa: _impEstado.layouts[assinatura].mapa,
        cabecalhoIndice: _impEstado.layouts[assinatura].cabecalhoIndice
    }));
    const existente = C.perfilDoFornecedor(db.import_perfis, _impEstado.fornecedor.id);
    const perfil = C.montarPerfil({
        id: existente ? existente.id : Date.now(),
        nome: _impEstado.fornecedor.nome,
        fornecedorId: _impEstado.fornecedor.id,
        abas: _impEstado.abas,
        layouts,
        cores: existente ? existente.cores : {},
        markupPadrao: _impEstado.markupPadrao
    });
    if (existente) db.import_perfis[db.import_perfis.indexOf(existente)] = perfil;
    else db.import_perfis.push(perfil);
}

function _impSnapshot() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SNAPSHOT)); } catch (e) { return null; }
}

async function desfazerUltimaImportacao() {
    const snap = _impSnapshot();
    if (!snap) { await showAlert('Não há importação para desfazer.', 'ℹ️'); return; }
    const quando = new Date(snap.quando).toLocaleString('pt-BR');
    const msg = `Desfazer a importação de ${quando}?\n${snap.resumo.criados} criado(s) e ${snap.resumo.atualizados} atualizado(s) voltarão ao estado anterior.`;
    if (!await showConfirm(msg, '↩️', 'Desfazer', 'Cancelar')) return;
    db.catalogo = snap.catalogo;
    db.materiais = snap.materiais;
    localStorage.removeItem(CHAVE_SNAPSHOT);
    salvarERecarregar('Importação desfeita.');
}

function _impAtualizarBotaoDesfazer() {
    const btn = document.getElementById('btn-desfazer-import');
    if (!btn) return;
    btn.style.display = _impSnapshot() ? '' : 'none';
}
document.addEventListener('DOMContentLoaded', _impAtualizarBotaoDesfazer);
