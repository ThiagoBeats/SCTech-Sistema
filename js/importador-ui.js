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
