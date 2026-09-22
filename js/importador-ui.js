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

let _impPdfJsPronto = null;

async function _impGarantirPdfJs() {
    if (window.pdfjsLib) return;
    if (!_impPdfJsPronto) {
        _impPdfJsPronto = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF — verifique sua conexão.'));
            document.head.appendChild(s);
        }).then(() => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        });
    }
    await _impPdfJsPronto;
}

// Cada pagina do PDF vira uma "aba", para reusar todo o fluxo da planilha.
async function _impLerPdf(file) {
    await _impGarantirPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const abas = {};
    const ordem = [];
    let vazias = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();
        const fragmentos = conteudo.items.map(it => ({ texto: it.str, x: it.transform[4], y: it.transform[5], largura: it.width }));
        const linhas = window.ImportadorCore.agruparLinhasPdf(fragmentos);
        if (linhas.length === 0) vazias++;
        const nome = 'Página ' + i;
        abas[nome] = linhas;
        ordem.push(nome);
    }
    if (vazias === pdf.numPages) {
        throw new Error('Este PDF não tem camada de texto — não dá para ler a tabela dele. Peça o arquivo em Excel ao fornecedor.');
    }
    if (vazias > 0) {
        toast(`${vazias} página(s) do PDF vieram sem texto e ficaram vazias.`, 'warning', 6000);
    }
    return { ordem, abas };
}

// Converte a planilha em { ordem, abas }, o mesmo formato consumido pelo core.
async function _impLerArquivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return _impLerPdf(file);
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        throw new Error('Formato não suportado: .' + ext + '. Use .xlsx, .csv ou .pdf.');
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

const IMP_MARKUP_PADRAO = 80;

const _impEstado = {
    file: null,
    planilha: null,      // { ordem, abas }
    fornecedor: null,    // { id, nome }
    fornecedorId: null,  // id escolhido no select antes de confirmar no passo 1
    markupPadrao: IMP_MARKUP_PADRAO,
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
    _impEstado.markupPadrao = IMP_MARKUP_PADRAO;
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
        <input type="file" id="imp-file" accept=".xlsx,.xls,.csv,.pdf" onchange="_impArquivoEscolhido(this)">
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

// Guarda o que o usuario ja digitou no passo 1 antes de qualquer re-render.
// TODO caminho que redesenha o passo 1 precisa chamar isto, senao a escolha de
// fornecedor ou o markup digitado somem sem aviso. Regra unica de padrao: campo
// em branco ou ilegivel vira IMP_MARKUP_PADRAO; um 0 digitado de proposito fica 0.
function _impCapturarPasso1() {
    const selFornecedor = document.getElementById('imp-fornecedor');
    if (selFornecedor && selFornecedor.value) {
        _impEstado.fornecedorId = parseInt(selFornecedor.value, 10);
    }
    const campoMarkup = document.getElementById('imp-markup');
    if (campoMarkup) {
        const v = parseFloat(campoMarkup.value);
        _impEstado.markupPadrao = (isFinite(v) && v >= 0) ? v : IMP_MARKUP_PADRAO;
    }
}

async function _impArquivoEscolhido(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
        _impCapturarPasso1();
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
    // Este caminho tambem redesenha o passo 1: sem capturar antes, o markup que
    // o usuario acabou de digitar voltaria ao padrao em silencio.
    _impCapturarPasso1();
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
    _impCapturarPasso1();
    _impEstado.fornecedorId = id;

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
        // A assinatura continua vindo da deteccao automatica: ela e a IDENTIDADE do
        // layout, a mesma chave usada por _impColetarItens e pelos perfis salvos.
        const { indice, colunas } = C.detectarCabecalho(dados);
        const assinatura = C.assinaturaDoLayout(colunas) + '#' + tipo;
        if (!porAssinatura[assinatura]) {
            // Mas a LINHA DE CABECALHO em uso e a que o usuario escolheu (ou a que
            // veio do perfil), quando houver. Re-detectar aqui apagaria a escolha
            // manual a cada render e no "Continuar" do passo 3.
            const guardado = _impEstado.layouts[assinatura];
            const escolhido = guardado && Number.isInteger(guardado.cabecalhoIndice)
                ? guardado.cabecalhoIndice : indice;
            const colunasEmUso = escolhido === indice
                ? colunas
                : (dados[escolhido] || []).map(c => C.normalizarNome(c));
            porAssinatura[assinatura] = { assinatura, colunas: colunasEmUso, cabecalhoIndice: escolhido, abas: [], tipo };
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

        const modoCor = !!_impEstado.cores[layout.assinatura];
        const coresColunas = _impEstado.cores[layout.assinatura] || [];
        const papeis = modoCor ? _IMP_PAPEIS.concat([{ valor: 'cor', rotulo: 'Cor' }]) : _IMP_PAPEIS;

        const papelDaColuna = ci => {
            if (coresColunas.includes(ci)) return 'cor';
            const achado = Object.keys(mapa).find(k => mapa[k] === ci);
            return achado || 'ignorar';
        };

        // Mostra ao menos ate a linha escolhida, para que uma escolha manual
        // abaixo da 12a continue visivel (e selecionada) no seletor.
        const ateLinha = Math.min(dados.length, Math.max(12, layout.cabecalhoIndice + 1));
        const opcoesLinha = dados.slice(0, ateLinha).map((_, li2) =>
            `<option value="${li2}" ${li2 === layout.cabecalhoIndice ? 'selected' : ''}>Linha ${li2 + 1}</option>`).join('');
        const controles = `
            <div style="display:flex;gap:16px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
                <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer">
                    <input type="checkbox" ${modoCor ? 'checked' : ''} onchange="_impAlternarModoCor(${li})"> Esta aba tem preço por cor
                </label>
                <label style="display:flex;align-items:center;gap:7px;font-size:13px">
                    Cabeçalho: <select onchange="_impTrocarCabecalho(${li}, this.value)">${opcoesLinha}</select>
                </label>
            </div>`;

        const cabecalhos = layout.colunas.map((rotulo, ci) => {
            const atual = papelDaColuna(ci);
            const opcoes = papeis.map(p => `<option value="${p.valor}" ${p.valor === atual ? 'selected' : ''}>${p.rotulo}</option>`).join('');
            return `<th style="min-width:120px">
                <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${escapeHtml(rotulo || '(sem título)')}</div>
                <select style="width:100%;font-size:12px" onchange="_impTrocarPapel(${li}, ${ci}, this.value)">${opcoes}</select>
            </th>`;
        }).join('');

        const corpo = amostra.map(linha =>
            '<tr>' + layout.colunas.map((_, ci) => `<td style="font-size:12px">${escapeHtml(String(linha[ci] === undefined ? '' : linha[ci]))}</td>`).join('') + '</tr>'
        ).join('');

        const qtd = modoCor
            ? C.expandirPorCor({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa, colunasCor: coresColunas, colunas: layout.colunas, tipo: layout.tipo, aba: layout.abas[0] }).length
            : C.montarItens({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa, tipo: layout.tipo, aba: layout.abas[0] }).length;

        return `<div class="card" style="margin-bottom:14px">
            <h4 style="margin:0 0 4px;color:var(--dark)">${layout.tipo === 'tecido' ? 'Tecidos' : 'Materiais'} — ${layout.abas.length} aba(s)</h4>
            <p style="font-size:12px;color:var(--muted);margin:0 0 10px">${escapeHtml(layout.abas.join(', '))}</p>
            ${controles}
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

function _impAlternarModoCor(indiceLayout) {
    const layout = _impLayoutsDistintos()[indiceLayout];
    if (_impEstado.cores[layout.assinatura]) delete _impEstado.cores[layout.assinatura];
    else _impEstado.cores[layout.assinatura] = [];
    _impRenderPasso(3);
}

function _impTrocarCabecalho(indiceLayout, valor) {
    const C = window.ImportadorCore;
    const layout = _impLayoutsDistintos()[indiceLayout];
    const indice = parseInt(valor, 10);
    const dados = _impEstado.planilha.abas[layout.abas[0]];
    const colunas = (dados[indice] || []).map(c => C.normalizarNome(c));
    _impEstado.layouts[layout.assinatura] = {
        mapa: C.sugerirMapeamento(colunas),
        cabecalhoIndice: indice
    };
    _impRenderPasso(3);
}

function _impTrocarPapel(indiceLayout, indiceColuna, papel) {
    const layout = _impLayoutsDistintos()[indiceLayout];
    const mapa = Object.assign({}, _impMapaDoLayout(layout));
    const cores = (_impEstado.cores[layout.assinatura] || []).filter(c => c !== indiceColuna);
    // um papel pertence a uma coluna so: limpa quem estava com ele
    Object.keys(mapa).forEach(k => { if (mapa[k] === indiceColuna) mapa[k] = -1; });
    if (papel === 'cor') cores.push(indiceColuna);
    else if (papel !== 'ignorar') mapa[papel] = indiceColuna;
    _impEstado.layouts[layout.assinatura] = { mapa, cabecalhoIndice: layout.cabecalhoIndice };
    if (_impEstado.cores[layout.assinatura]) _impEstado.cores[layout.assinatura] = cores.sort((a, b) => a - b);
    _impRenderPasso(3);
}

async function _impConcluirPasso3() {
    const layouts = _impLayoutsDistintos();
    for (const layout of layouts) {
        const mapa = _impMapaDoLayout(layout);
        const emCor = (_impEstado.cores[layout.assinatura] || []).length > 0;
        if (mapa.codigo < 0 || mapa.nome < 0 || (!emCor && mapa.preco < 0)) {
            // Abas sem cabecalho reconhecivel caem aqui: a saida prevista e
            // marca-las como "Ignorar" no passo 2 (ou, na Fase 2, apontar a
            // linha do cabecalho na mao).
            const semCabecalho = layout.cabecalhoIndice < 0;
            await showAlert(
                `Não dá para mapear ${semCabecalho ? 'estas abas, que não têm cabeçalho reconhecível' : 'este layout'}:\n\n`
                + layout.abas.join(', ')
                + `\n\nMarque ao menos as colunas de Código, Nome e Preço (ou marque as colunas de Cor) — ou volte ao passo 2 e marque estas abas como "Ignorar".`,
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
        const cores = _impEstado.cores[assinatura];
        if (cores && cores.length) {
            itens.push(...C.expandirPorCor({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa: layout.mapa, colunasCor: cores, colunas, tipo, aba }));
        } else {
            itens.push(...C.montarItens({ linhas: dados, cabecalhoIndice: layout.cabecalhoIndice, mapa: layout.mapa, tipo, aba }));
        }
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
    { chave: 'conflitos',       titulo: 'Conflitos de código',     ajuda: 'O código já é de outro fornecedor, ou já pertence a um item do outro tipo. Edite o código ou desmarque.' },
    { chave: 'nomes_repetidos', titulo: 'Nomes repetidos',         ajuda: 'O nome já pertence a outro produto. Edite o nome ou desmarque.' },
    { chave: 'problemas',       titulo: 'Com problema',            ajuda: 'Preço ilegível, código ou nome faltando, ou mudança de layout na planilha. Corrija o que falta ou deixe desmarcado.' }
];

// Percorre as linhas marcadas na ordem de importacao (ordem dos grupos e,
// dentro de cada grupo, ordem do array — que veio de _impColetarItens).
function _impLinhasMarcadas() {
    const linhas = [];
    _IMP_GRUPOS.forEach(def => {
        (_impEstado.grupos[def.chave] || []).forEach((entrada, indice) => {
            if (entrada.marcado && entrada.item) linhas.push({ chave: def.chave, indice, entrada });
        });
    });
    return linhas;
}

// Codigos que aparecem mais de uma vez entre as linhas marcadas.
function _impDuplicadosNoLote() {
    const porCodigo = new Map();
    _impLinhasMarcadas().forEach(l => {
        const c = l.entrada.item.codigo;
        if (!porCodigo.has(c)) porCodigo.set(c, []);
        porCodigo.get(c).push({ chave: l.chave, indice: l.indice });
    });
    const dups = [];
    porCodigo.forEach((ocorrencias, codigo) => {
        if (ocorrencias.length > 1) dups.push({ codigo, ocorrencias });
    });
    return dups;
}

// Conjunto de codigos ja ocupados: o catalogo, os materiais e as linhas marcadas.
function _impCodigosOcupados() {
    const C = window.ImportadorCore;
    const { porCodigo } = C.indexarExistentes(db.catalogo, db.materiais);
    const ocupados = new Set(porCodigo.keys());
    _impLinhasMarcadas().forEach(l => ocupados.add(l.entrada.item.codigo));
    return ocupados;
}

// Quantas vezes cada nome (em minusculas) aparece no catalogo, nos materiais e
// nas linhas marcadas. E contagem, nao conjunto, para saber se um nome colide
// com OUTRA linha ou se a unica ocorrencia e a propria linha sendo renomeada.
function _impContagemDeNomes() {
    const C = window.ImportadorCore;
    const { porNome } = C.indexarExistentes(db.catalogo, db.materiais);
    const contagem = new Map();
    const somar = nome => {
        const chave = C.normalizarNome(nome).toLowerCase();
        if (!chave) return;
        contagem.set(chave, (contagem.get(chave) || 0) + 1);
    };
    porNome.forEach(achado => somar(achado.registro.nome));
    _impLinhasMarcadas().forEach(l => somar(l.entrada.item.nome));
    return contagem;
}

function _impDiferenciarDuplicados() {
    const C = window.ImportadorCore;
    const dups = _impDuplicadosNoLote();
    if (!dups.length) return;
    const ocupados = _impCodigosOcupados();
    const nomes = _impContagemDeNomes();
    let renomeados = 0;
    dups.forEach(d => {
        // a primeira ocorrencia mantem o codigo; da segunda em diante, sufixo
        d.ocorrencias.slice(1).forEach(o => {
            const entrada = _impEstado.grupos[o.chave][o.indice];
            const novo = C.codigoLivre(entrada.item.codigo + 'D', ocupados);
            entrada.item.codigo = novo;
            ocupados.add(novo);
            renomeados++;

            // O nome tambem precisa ser diferenciado: codigos distintos com o
            // mesmo nome passam hoje e travam a importacao do mes seguinte.
            // So renomeia quando o nome e mesmo compartilhado com outra linha.
            const chave = C.normalizarNome(entrada.item.nome).toLowerCase();
            if ((nomes.get(chave) || 0) > 1) {
                const nomeNovo = C.nomeLivre(entrada.item.nome, new Set(nomes.keys()));
                nomes.set(chave, nomes.get(chave) - 1);
                nomes.set(nomeNovo.toLowerCase(), 1);
                entrada.item.nome = nomeNovo;
            }
        });
    });
    _impRenderPasso(4);
    toast(`${renomeados} código(s) diferenciado(s) com "D".`, 'success');
}

function _impDescartarDuplicados() {
    const dups = _impDuplicadosNoLote();
    if (!dups.length) return;
    let descartados = 0;
    dups.forEach(d => {
        d.ocorrencias.slice(1).forEach(o => {
            _impEstado.grupos[o.chave][o.indice].marcado = false;
            descartados++;
        });
    });
    _impRenderPasso(4);
    toast(`${descartados} linha(s) repetida(s) desmarcada(s).`, 'info');
}

// Painel que aparece no topo do passo 4 quando ha codigo repetido no lote.
function _impPainelDuplicadosHTML() {
    const dups = _impDuplicadosNoLote();
    if (!dups.length) return '';
    const lista = dups.slice(0, 10)
        .map(d => `${escapeHtml(d.codigo)} (${d.ocorrencias.length}×)`).join(' · ');
    const resto = dups.length > 10 ? ` e mais ${dups.length - 10}` : '';
    return `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--primary)">
        <h4 style="margin:0 0 4px;color:var(--dark)">Códigos repetidos nesta importação <span style="color:var(--muted);font-weight:400">(${dups.length})</span></h4>
        <p style="font-size:12px;color:var(--muted);margin:0 0 8px">${lista}${resto}</p>
        <p style="font-size:12px;color:var(--muted);margin:0 0 10px">Código é único no sistema, então a gravação fica bloqueada enquanto houver repetição. A primeira ocorrência de cada código é sempre preservada.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-sm" onclick="_impDiferenciarDuplicados()">Diferenciar com "D"</button>
            <button class="btn btn-outline btn-sm" onclick="_impDescartarDuplicados()">Descartar os repetidos</button>
        </div>
    </div>`;
}

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
    ${_impPainelDuplicadosHTML()}
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

// O desfazer expira: depois disto o botao some. Sem prazo, um clique feito
// semanas depois desfaz sobre um catalogo que ja mudou muito.
const PRAZO_DESFAZER_DIAS = 7;

// O snapshot guarda SO o que o importador escreveu: os ids criados e, para os
// atualizados, os valores anteriores dos campos do importador. Nao copia mais o
// catalogo e os materiais inteiros — que traziam cada imagem em base64 e, pior,
// devolviam saldo de estoque velho ao desfazer.
function _impSalvarSnapshot(resumo, mudancas) {
    localStorage.setItem(CHAVE_SNAPSHOT, JSON.stringify({
        quando: new Date().toISOString(),
        versao: 2,
        resumo,
        mudancas
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

    // Snapshot antes de tocar no db: se ele nao couber no armazenamento, nada e
    // gravado — melhor não importar do que importar sem poder desfazer.
    try {
        _impSalvarSnapshot(r.resumo, r.mudancas);
    } catch (e) {
        await showAlert('Não foi possível preparar o "desfazer" desta importação'
            + (e && e.message ? ' (' + e.message + ')' : '')
            + '.\n\nNada foi gravado. Libere espaço no navegador e tente de novo.', '⚠️');
        return;
    }

    // A gravacao em si tambem pode falhar (cota do navegador). Se falhar, o db em
    // memoria volta ao que era e o usuario e avisado de que nada foi gravado.
    const catalogoAntes = db.catalogo;
    const materiaisAntes = db.materiais;
    try {
        db.catalogo = r.catalogo;
        db.materiais = r.materiais;
        if (document.getElementById('imp-salvar-perfil')?.checked) _impSalvarPerfil();
        // O resumo tem de fechar com o numero de decisoes: linhas que nao puderam
        // ser aplicadas aparecem como ignoradas, nunca somem da conta.
        const naoAplicadas = (r.naoAplicadas || []).length;
        salvarERecarregar(`Importação concluída: ${r.resumo.criados} criado(s), ${r.resumo.atualizados} atualizado(s).`
            + (naoAplicadas ? ` ${naoAplicadas} linha(s) não puderam ser gravadas.` : ''));
    } catch (e) {
        db.catalogo = catalogoAntes;
        db.materiais = materiaisAntes;
        // Tenta devolver o armazenamento ao estado anterior: syncDB grava sc_cat
        // antes de sc_mat, entao uma falha no meio pode ter persistido so metade.
        try { syncDB(); } catch (e2) { /* nada mais a fazer aqui */ }
        try { localStorage.removeItem(CHAVE_SNAPSHOT); } catch (e3) { /* idem */ }
        await showAlert('Não foi possível gravar a importação'
            + (e && e.message ? ' (' + e.message + ')' : '')
            + '.\n\nNada foi gravado no catálogo. Libere espaço no navegador e tente de novo.', '⚠️');
    }
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
        cores: _impEstado.cores,
        markupPadrao: _impEstado.markupPadrao
    });
    if (existente) db.import_perfis[db.import_perfis.indexOf(existente)] = perfil;
    else db.import_perfis.push(perfil);
}

// Devolve o snapshot so quando ele ainda pode ser desfeito com segurança:
// formato novo (com `mudancas`) e dentro do prazo. Um snapshot antigo ou
// vencido e descartado — desfazer sobre um catalogo que ja mudou muito faria
// mais estrago do que a importacao que se quer reverter.
function _impSnapshot() {
    let snap = null;
    try { snap = JSON.parse(localStorage.getItem(CHAVE_SNAPSHOT)); } catch (e) { return null; }
    if (!snap || !snap.mudancas) return null;
    const quando = Date.parse(snap.quando);
    if (!isFinite(quando)) return null;
    if (Date.now() - quando > PRAZO_DESFAZER_DIAS * 24 * 60 * 60 * 1000) return null;
    return snap;
}

async function desfazerUltimaImportacao() {
    const C = window.ImportadorCore;
    const snap = _impSnapshot();
    if (!snap) { await showAlert('Não há importação recente para desfazer.', 'ℹ️'); return; }
    const quando = new Date(snap.quando).toLocaleString('pt-BR');
    const msg = `Desfazer a importação de ${quando}?\n\n`
        + `${snap.resumo.criados} item(ns) criado(s) serão apagados e `
        + `${snap.resumo.atualizados} item(ns) atualizado(s) voltarão ao preço, nome e unidade anteriores.\n\n`
        + `Atenção: qualquer alteração feita nesses produtos depois da importação será perdida. `
        + `O estoque e as movimentações não são tocados.`;
    if (!await showConfirm(msg, '↩️', 'Desfazer', 'Cancelar')) return;

    const r = C.desfazerImportacao({ catalogo: db.catalogo, materiais: db.materiais, mudancas: snap.mudancas });

    const catalogoAntes = db.catalogo;
    const materiaisAntes = db.materiais;
    const snapshotBruto = localStorage.getItem(CHAVE_SNAPSHOT);
    try {
        db.catalogo = r.catalogo;
        db.materiais = r.materiais;
        localStorage.removeItem(CHAVE_SNAPSHOT);
        const extras = [];
        if (r.resumo.mantidos) extras.push(`${r.resumo.mantidos} item(ns) foram mantidos por já terem estoque`);
        if (r.resumo.sumidos) extras.push(`${r.resumo.sumidos} item(ns) já não existiam`);
        salvarERecarregar('Importação desfeita.' + (extras.length ? ' ' + extras.join('; ') + '.' : ''));
    } catch (e) {
        db.catalogo = catalogoAntes;
        db.materiais = materiaisAntes;
        try { syncDB(); } catch (e2) { /* nada mais a fazer aqui */ }
        // o desfazer continua disponivel: nada foi revertido
        try { if (snapshotBruto) localStorage.setItem(CHAVE_SNAPSHOT, snapshotBruto); } catch (e3) { /* idem */ }
        await showAlert('Não foi possível desfazer a importação'
            + (e && e.message ? ' (' + e.message + ')' : '')
            + '.\n\nNada foi alterado no catálogo.', '⚠️');
    }
}

function _impAtualizarBotaoDesfazer() {
    const btn = document.getElementById('btn-desfazer-import');
    if (!btn) return;
    btn.style.display = _impSnapshot() ? '' : 'none';
}
document.addEventListener('DOMContentLoaded', _impAtualizarBotaoDesfazer);
