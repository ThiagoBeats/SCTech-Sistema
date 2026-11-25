'use strict';
// Notas fiscais do pedido (modo manual): a nota e emitida fora (prefeitura/SEFAZ/contador) e aqui entram o XML e o PDF.
// Janela do pedido (menu ⋮): lista, emitir (conferir + anexar), ver PDF, baixar XML, cancelar e historico.
// Notas ficam em db.notas_fiscais (sc_nf): { id, pedido_id, tipo, numero, serie, chave, codigo_verificacao, data_emissao, valor,
//   cliente_id, status, protocolo, eventos: [{ em, tipo, detalhe, por }], xml_nome, xml, pdf_nome, pdf, origem, criado_em, criado_por }.
// Carregado depois de app.js (usa db, getEmpresa, temAcesso, _gravarChaves...) e de fiscal-core.js / fiscal.js.

const NF_PDF_MAX = 1024 * 1024;
const NF_MSG_PDF_GRANDE = 'Arquivo grande demais para guardar no navegador. Guarde o PDF no computador e anexe só o XML.';
const NF_MSG_NAO_NOTA = 'Este arquivo não é o XML de uma nota fiscal.';
const NF_STATUS = {
    autorizada: ['Autorizada', 'fin-badge-green'], cancelada: ['Cancelada', 'fin-badge-red'], rascunho: ['Rascunho', 'fin-badge-gray'],
    processando: ['Processando', 'fin-badge-blue'], rejeitada: ['Rejeitada', 'fin-badge-red']
};

let _nfEst = null; // estado da janela de emissao

const _nfEsc = s => escapeHtml(String(s == null ? '' : s));
const _nfBrl = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _nfDataBr = d => /^\d{4}-\d{2}-\d{2}/.test(String(d || '')) ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) + '/' + String(d).slice(0, 4) : '';
const _nfDataHora = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const _nfRotuloTipo = t => t === 'nfe' ? 'NF-e' : 'NFS-e';
const _nfNum = s => {
    let t = String(s == null ? '' : s).trim().replace(/\s/g, '');
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return isFinite(n) ? n : 0;
};
const _nfPode = () => temAcesso('financeiro.receber', 'completo') || temAcesso('pedidos', 'completo');
const _nfPodeVer = () => temAcesso('pedidos', 'visualizar') || temAcesso('financeiro.receber', 'visualizar');
const _nfNotas = () => { if (!Array.isArray(db.notas_fiscais)) db.notas_fiscais = []; return db.notas_fiscais; };
const _nfPorId = id => _nfNotas().find(n => String(n.id) === String(id));
const _nfQuem = () => { const u = typeof getUsuarioLogado === 'function' ? getUsuarioLogado() : null; return u ? (u.nome || String(u.id)) : ''; };
const _nfQuemId = () => { const u = typeof getUsuarioLogado === 'function' ? getUsuarioLogado() : null; return u ? u.id : null; };
const _nfEvento = (tipo, detalhe) => ({ em: new Date().toISOString(), tipo, detalhe, por: _nfQuem() });

function _nfNovoId() {
    let id = Date.now();
    const usados = new Set(_nfNotas().map(n => Number(n.id)));
    while (usados.has(id)) id++;
    return id;
}

// Grava so as notas; sem espaco, avisa, desfaz o que foi mexido na memoria e devolve false.
function _nfGravar(desfazer) {
    if (_gravarChaves(['sc_nf'], { silencioso: true })) return true;
    try { desfazer(); } catch (e) { /* melhor esforco */ }
    showAlert(MSG_SEM_ESPACO, '⚠️');
    return false;
}

function _nfFechar(id) { const o = document.getElementById(id); if (o) o.remove(); }
function _nfJanela(id, titulo, corpo, largura) {
    _nfFechar(id);
    const o = document.createElement('div');
    o.className = 'modal-overlay nf-overlay';
    o.id = id;
    o.innerHTML = `<div class="modal-box nf-box" style="max-width:${largura || 760}px">
        <div class="modal-header"><h3>${titulo}</h3><button type="button" class="modal-close" aria-label="Fechar" onclick="_nfFechar('${id}')">×</button></div>
        <div class="modal-body">${corpo}</div>
    </div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o) o.remove(); });
    return o;
}

function _nfLerBytes(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(new Uint8Array(r.result));
        r.onerror = () => reject(r.error);
        r.readAsArrayBuffer(file);
    });
}
function _nfBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}
function _nfDeBase64(b64) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}
const _nfEhPdf = b => !!b && b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
const NF_MSG_NAO_PDF = 'Este arquivo não é um PDF.';
// Le o PDF: so aceita quem comeca com %PDF; guarda sempre como application/pdf.
async function _nfLerPdf(file) {
    const bytes = await _nfLerBytes(file);
    if (!_nfEhPdf(bytes)) return null;
    return 'data:application/pdf;base64,' + _nfBase64(bytes);
}
// Le o XML pelos bytes: codificacao da declaracao (padrao UTF-8). Devolve { texto, encoding, b64 } (b64 so quando
// os bytes nao voltam iguais a partir do texto UTF-8, para o download devolver o arquivo original).
async function _nfLerXmlArquivo(file) {
    const bytes = await _nfLerBytes(file);
    let enc = 'utf-8';
    const cabeca = Array.from(bytes.subarray(0, 200)).map(c => String.fromCharCode(c)).join('');
    const m = /^(?:\xEF\xBB\xBF)?\s*<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(cabeca);
    if (m) enc = m[1].trim().toLowerCase();
    let texto = '', limpo = false;
    try { texto = new TextDecoder(enc, { fatal: enc === 'utf-8' || enc === 'utf8', ignoreBOM: true }).decode(bytes); limpo = enc === 'utf-8' || enc === 'utf8'; }
    catch (e) {
        enc = 'windows-1252';
        try { texto = new TextDecoder(enc, { ignoreBOM: true }).decode(bytes); } catch (e2) { texto = ''; }
    }
    return { texto, encoding: enc, b64: limpo ? null : _nfBase64(bytes) };
}

// ---------- janela do pedido ----------
function abrirNotasDoPedido(pedidoId) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped || !_nfPodeVer()) return;
    _nfJanela('nf-janela', `Notas fiscais — Pedido #${formatPedidoId(ped.id)}`, '', 820);
    _nfRenderLista(ped.id);
}

function _nfRenderLista(pedidoId) {
    const o = document.getElementById('nf-janela');
    if (!o) return;
    const ped = db.pedidos.find(p => p.id == pedidoId);
    const notas = _nfNotas().filter(n => String(n.pedido_id) === String(pedidoId));
    const pode = _nfPode();
    const id = JSON.stringify(pedidoId);
    const linhas = notas.map(n => {
        const [rot, cls] = NF_STATUS[n.status] || [n.status, 'fin-badge-gray'];
        const nr = [n.numero ? 'Nº ' + n.numero : 'Sem número', n.serie ? 'série ' + n.serie : (n.codigo_verificacao ? 'cód. ' + n.codigo_verificacao : '')].filter(Boolean).join(' / ');
        return `<div class="nf-linha" data-nota="${_nfEsc(n.id)}">
            <div class="nf-linha-topo">
                <span class="nf-tipo">${_nfRotuloTipo(n.tipo)}</span>
                <span class="nf-num">${_nfEsc(nr)}</span>
                <span class="nf-data">${_nfEsc(_nfDataBr(n.data_emissao))}</span>
                <span class="nf-valor">R$ ${_nfBrl(n.valor)}</span>
                <span class="fin-badge ${cls} nf-selo">${_nfEsc(rot)}</span>
            </div>
            <div class="nf-acoes">
                <button type="button" class="btn btn-outline btn-sm" onclick="verPdfNota(${_nfEsc(JSON.stringify(n.id))})">Ver PDF</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="baixarXmlNota(${_nfEsc(JSON.stringify(n.id))})">Baixar XML</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="abrirHistoricoNota(${_nfEsc(JSON.stringify(n.id))})">Histórico</button>
                ${pode && n.status !== 'cancelada' ? `<button type="button" class="btn btn-outline btn-sm nf-cancelar" onclick="cancelarNota(${_nfEsc(JSON.stringify(n.id))})">Cancelar nota</button>` : ''}
            </div>
        </div>`;
    }).join('');
    o.querySelector('.modal-body').innerHTML = `
        <div class="nf-topo">
            <span class="nf-resumo">${ped ? _nfEsc(ped.clienteNome || '') + ' · R$ ' + _nfBrl(ped.valor) : ''}</span>
            ${pode ? `<button type="button" class="btn btn-success" id="nf-btn-emitir" onclick="emitirNotaPedido(${_nfEsc(id)})">Emitir nota</button>` : ''}
        </div>
        <div class="nf-lista">${linhas || '<p class="nf-vazio">Nenhuma nota fiscal neste pedido.</p>'}</div>`;
}

// ---------- emitir (modo manual) ----------
function _nfDadosForm(pedidoId, tipo) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    const cli = db.clientes.find(c => c.id == (ped && ped.clienteId));
    const emp = getEmpresa();
    return { ped, cli, emp, dados: FiscalCore.dadosNotaDoPedido({ pedido: ped, cliente: cli, empresa: emp, tipo }) };
}

function _nfItemHtml(i, it) {
    return `<div class="nf-item">
        <input type="text" class="nf-item-desc" aria-label="Descrição" value="${_nfEsc(it.descricao)}">
        <input type="number" class="nf-item-qtd" aria-label="Quantidade" min="0" step="any" value="${_nfEsc(it.quantidade)}">
        <input type="text" inputmode="decimal" class="nf-item-total" aria-label="Valor total do item" value="${_nfBrl(it.valor_total)}" oninput="_nfSomar()">
    </div>`;
}

function emitirNotaPedido(pedidoId) {
    if (!_nfPode()) { showAlert('Você não tem permissão para realizar esta ação.', '🚫'); return; }
    const ped = db.pedidos.find(p => p.id == pedidoId);
    if (!ped) return;
    const tipo = FiscalCore.tipoPadrao(getEmpresa());
    _nfEst = { pedidoId: ped.id, nota: null, avisos: [], xmlNome: '', xmlTexto: '', pdfNome: '', pdf: null, erroXml: '', erroPdf: '' };
    const { dados } = _nfDadosForm(ped.id, tipo);
    const t = dados.tomador;
    const campo = (id, rot, v, extra) => `<div class="form-group"><label for="${id}">${rot}</label><input type="text" id="${id}" value="${_nfEsc(v)}" ${extra || ''}></div>`;
    _nfJanela('nf-emitir', `Emitir nota — Pedido #${formatPedidoId(ped.id)}`, `
        <div class="nf-aviso-manual" id="nf-aviso-manual">${_nfEsc(FiscalCore.AVISO_MANUAL)}</div>
        <div class="form-group">
            <label for="nf-tipo">Tipo de nota</label>
            <select id="nf-tipo" onchange="_nfTrocarTipo()">
                <option value="nfe"${tipo === 'nfe' ? ' selected' : ''}>NF-e (produto)</option>
                <option value="nfse"${tipo === 'nfse' ? ' selected' : ''}>NFS-e (serviço)</option>
            </select>
        </div>
        <h4 class="nf-sub">Tomador</h4>
        <div class="nf-grade">
            ${campo('nf-tom-nome', 'Nome', t.nome)}${campo('nf-tom-doc', 'CPF/CNPJ', t.doc)}
            ${campo('nf-tom-end', 'Endereço', t.endereco)}${campo('nf-tom-cidade', 'Cidade', t.cidade)}
            ${campo('nf-tom-uf', 'UF', t.uf, 'maxlength="2"')}${campo('nf-tom-cep', 'CEP', t.cep)}
            ${campo('nf-tom-email', 'E-mail', t.email)}
        </div>
        <h4 class="nf-sub">Itens</h4>
        <div class="nf-itens-cab"><span>Descrição</span><span>Qtd</span><span>Valor total (R$)</span></div>
        <div id="nf-itens">${dados.itens.map((it, i) => _nfItemHtml(i, it)).join('')}</div>
        <div class="nf-total">Total: R$ <strong id="nf-total">${_nfBrl(dados.valor_total)}</strong></div>
        <div class="form-group"><label for="nf-obs">Observações</label><input type="text" id="nf-obs" value="${_nfEsc(dados.observacoes)}"></div>
        <div class="nf-botoes-dados">
            <button type="button" class="btn btn-outline" id="nf-copiar" onclick="_nfCopiarDados()">Copiar dados</button>
            <button type="button" class="btn btn-outline" id="nf-imprimir" onclick="_nfImprimirDados()">Imprimir dados</button>
        </div>
        <h4 class="nf-sub">Nota emitida</h4>
        <div class="form-group"><label for="nf-xml">Anexar XML (obrigatório)</label><input type="file" id="nf-xml" accept=".xml,text/xml,application/xml" onchange="_nfAoEscolherXml(this)"></div>
        <div class="nf-erro" id="nf-msg-xml" hidden></div>
        <div class="nf-grade nf-lido" id="nf-lido" hidden>
            <div class="form-group"><label for="nf-numero">Número</label><input type="text" id="nf-numero" readonly></div>
            <div class="form-group"><label for="nf-serie">Série / código de verificação</label><input type="text" id="nf-serie" readonly></div>
            <div class="form-group"><label for="nf-data">Data de emissão</label><input type="text" id="nf-data" readonly></div>
            <div class="form-group"><label for="nf-valor">Valor (R$)</label><input type="text" id="nf-valor" readonly></div>
        </div>
        <div class="nf-avisos" id="nf-avisos" hidden></div>
        <div class="form-group"><label for="nf-pdf">Anexar PDF (opcional, até 1 MB)</label><input type="file" id="nf-pdf" accept=".pdf,application/pdf" onchange="_nfAoEscolherPdf(this)"></div>
        <div class="nf-erro" id="nf-msg-pdf" hidden></div>
        <div class="nf-rodape">
            <button type="button" class="btn btn-outline" onclick="_nfFechar('nf-emitir')">Fechar</button>
            <button type="button" class="btn btn-success" id="nf-salvar" onclick="_nfSalvarNota()" disabled>Salvar nota</button>
        </div>`, 760);
}

function _nfTrocarTipo() {
    if (!_nfEst) return;
    const tipo = document.getElementById('nf-tipo').value;
    const { dados } = _nfDadosForm(_nfEst.pedidoId, tipo);
    document.getElementById('nf-itens').innerHTML = dados.itens.map((it, i) => _nfItemHtml(i, it)).join('');
    _nfSomar();
}

function _nfItensDoForm() {
    return Array.from(document.querySelectorAll('#nf-itens .nf-item')).map(r => {
        const quantidade = Number(r.querySelector('.nf-item-qtd').value) || 0;
        const valor_total = _nfNum(r.querySelector('.nf-item-total').value);
        return { descricao: r.querySelector('.nf-item-desc').value.trim(), quantidade, valor_unitario: quantidade ? Math.round(valor_total / quantidade * 100) / 100 : valor_total, valor_total };
    });
}
function _nfSomar() {
    const soma = _nfItensDoForm().reduce((s, i) => s + i.valor_total, 0);
    const el = document.getElementById('nf-total');
    if (el) el.textContent = _nfBrl(soma);
    return Math.round(soma * 100) / 100;
}
function _nfDadosAtuais() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    return {
        tipo: v('nf-tipo'),
        tomador: { nome: v('nf-tom-nome'), doc: v('nf-tom-doc'), endereco: v('nf-tom-end'), cidade: v('nf-tom-cidade'), uf: v('nf-tom-uf'), cep: v('nf-tom-cep'), email: v('nf-tom-email') },
        itens: _nfItensDoForm(), valor_total: _nfSomar(), observacoes: v('nf-obs')
    };
}

function _nfTextoDados() {
    const d = _nfDadosAtuais(), t = d.tomador;
    const l = [`${_nfRotuloTipo(d.tipo)} — Pedido #${formatPedidoId(_nfEst.pedidoId)}`, '', 'TOMADOR',
        'Nome: ' + t.nome, 'CPF/CNPJ: ' + t.doc, 'Endereço: ' + t.endereco, 'Cidade/UF: ' + [t.cidade, t.uf].filter(Boolean).join('/'), 'CEP: ' + t.cep, 'E-mail: ' + t.email, '', 'ITENS'];
    d.itens.forEach((i, n) => l.push(`${n + 1}. ${i.descricao} — qtd ${i.quantidade} — R$ ${_nfBrl(i.valor_unitario)} cada — total R$ ${_nfBrl(i.valor_total)}`));
    l.push('', 'TOTAL: R$ ' + _nfBrl(d.valor_total));
    if (d.observacoes) l.push('Observações: ' + d.observacoes);
    return l.join('\n');
}
async function _nfCopiarDados() {
    if (!_nfEst) return;
    const texto = _nfTextoDados();
    try {
        await navigator.clipboard.writeText(texto);
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = texto; ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e2) { /* sem acesso */ }
        ta.remove();
        if (!ok) { toast('Não foi possível copiar. Use Imprimir dados.', 'warning'); return; }
    }
    toast('Dados copiados.', 'success');
}
function _nfImprimirDados() {
    if (!_nfEst) return;
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const doc = f.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Dados da nota</title><style>body{font:14px Arial,sans-serif;margin:24px;color:#111}pre{white-space:pre-wrap;font:inherit}</style></head><body><pre>${_nfEsc(_nfTextoDados())}</pre></body></html>`);
    doc.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* sem impressao */ } setTimeout(() => f.remove(), 2000); }, 100);
}

function _nfMsg(id, texto) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto || '';
    el.hidden = !texto;
}
function _nfAtualizarSalvar() {
    const b = document.getElementById('nf-salvar');
    if (b) b.disabled = !(_nfEst && _nfEst.nota && !_nfEst.erroXml);
}

// A mesma nota (chave, ou numero + codigo/serie + emitente) ja em alguma nota guardada.
function _nfDuplicada(nota) {
    return _nfNotas().find(n => {
        if (nota.chave && n.chave === nota.chave) return !(nota.cancelada && !nota.numero);
        if (!nota.numero || String(n.numero) !== String(nota.numero) || n.tipo !== nota.tipo) return false;
        const sameId = nota.codigo_verificacao ? n.codigo_verificacao === nota.codigo_verificacao : String(n.serie || '') === String(nota.serie || '');
        const sameEmit = !nota.emitente_doc || !n.emitente_doc || n.emitente_doc === nota.emitente_doc;
        return sameId && sameEmit;
    });
}

let _nfTok = 0;
async function _nfAoEscolherXml(input) {
    if (!_nfEst) return;
    const tok = ++_nfTok;
    const file = input.files && input.files[0];
    _nfEst.cancelaNota = null; _nfEst.xmlB64 = null; _nfEst.xmlEnc = 'utf-8';
    _nfEst.nota = null; _nfEst.avisos = []; _nfEst.erroXml = ''; _nfEst.xmlTexto = ''; _nfEst.xmlNome = '';
    document.getElementById('nf-lido').hidden = true;
    const av = document.getElementById('nf-avisos'); av.hidden = true; av.innerHTML = '';
    _nfMsg('nf-msg-xml', '');
    if (file) {
        let texto = '', lido = { texto: '', encoding: 'utf-8', b64: null };
        try { lido = await _nfLerXmlArquivo(file); texto = lido.texto; } catch (e) { texto = ''; }
        if (tok !== _nfTok || !_nfEst || !document.getElementById('nf-emitir')) return;
        _nfEst.xmlB64 = lido.b64; _nfEst.xmlEnc = lido.encoding;
        const res = FiscalCore.lerXmlNota(texto);
        if (!res.ok) {
            _nfEst.erroXml = NF_MSG_NAO_NOTA;
            _nfMsg('nf-msg-xml', NF_MSG_NAO_NOTA);
        } else {
            const nota = res.nota;
            const ehCancel = nota.cancelada && !nota.numero;
            const alvo = ehCancel ? _nfNotas().find(n => nota.chave && n.chave === nota.chave && String(n.pedido_id) === String(_nfEst.pedidoId)) : null;
            const dup = ehCancel ? null : _nfDuplicada(nota);
            if (ehCancel && (!alvo || alvo.status === 'cancelada')) {
                _nfEst.erroXml = alvo ? 'Esta nota já está cancelada.' : 'Não há nota com essa chave neste pedido para cancelar.';
                _nfMsg('nf-msg-xml', _nfEst.erroXml);
            } else if (ehCancel) {
                _nfEst.nota = nota; _nfEst.xmlTexto = texto; _nfEst.xmlNome = file.name; _nfEst.cancelaNota = alvo.id;
                const av2 = document.getElementById('nf-avisos'); av2.hidden = false;
                av2.innerHTML = `<div class="nf-aviso">Este XML é de cancelamento: a nota ${_nfEsc(alvo.numero ? 'nº ' + alvo.numero : '')} será marcada como cancelada.</div>`;
            } else if (dup) {
                _nfEst.erroXml = 'Esta nota já está anexada ao pedido #' + formatPedidoId(dup.pedido_id) + '.';
                _nfMsg('nf-msg-xml', _nfEst.erroXml);
            } else {
                const { ped, cli, emp } = _nfDadosForm(_nfEst.pedidoId, 'nfse');
                _nfEst.nota = nota; _nfEst.xmlTexto = texto; _nfEst.xmlNome = file.name;
                _nfEst.avisos = FiscalCore.conferir(nota, { pedido: ped, cliente: cli, empresa: emp, notasDoPedido: _nfNotas().filter(n => String(n.pedido_id) === String(ped.id)) });
                document.getElementById('nf-lido').hidden = false;
                document.getElementById('nf-numero').value = nota.numero || '';
                document.getElementById('nf-serie').value = nota.serie || nota.codigo_verificacao || '';
                document.getElementById('nf-data').value = _nfDataBr(nota.data_emissao);
                document.getElementById('nf-valor').value = _nfBrl(nota.valor);
                if (_nfEst.avisos.length) {
                    av.hidden = false;
                    av.innerHTML = _nfEst.avisos.map(a => `<div class="nf-aviso">${_nfEsc(a)}</div>`).join('');
                }
            }
        }
    }
    _nfAtualizarSalvar();
}

let _nfTokPdf = 0;
async function _nfAoEscolherPdf(input) {
    if (!_nfEst) return;
    const file = input.files && input.files[0];
    _nfEst.pdf = null; _nfEst.pdfNome = ''; _nfMsg('nf-msg-pdf', '');
    if (file) {
        if (file.size > NF_PDF_MAX) {
            input.value = '';
            _nfMsg('nf-msg-pdf', NF_MSG_PDF_GRANDE);
        } else {
            const tok = ++_nfTokPdf;
            try {
                const url = await _nfLerPdf(file);
                if (tok !== _nfTokPdf || !_nfEst || !document.getElementById('nf-emitir')) return;
                if (!url) { input.value = ''; _nfMsg('nf-msg-pdf', NF_MSG_NAO_PDF); }
                else { _nfEst.pdf = url; _nfEst.pdfNome = file.name; }
            } catch (e) { _nfMsg('nf-msg-pdf', 'Não foi possível ler o PDF.'); }
        }
    }
}

async function _nfSalvarNota() {
    if (!_nfEst || !_nfEst.nota || _nfEst.erroXml) return;
    if (!await exigirPermissao_nf()) return;
    const e = _nfEst, nota = e.nota;
    const ped = db.pedidos.find(p => p.id == e.pedidoId);
    if (!ped) return;
    // Outra nota igual pode ter entrado (outra aba) desde que o XML foi lido.
    const dup = nota.cancelada && !nota.numero ? null : _nfDuplicada(nota);
    if (dup) { e.nota = null; e.erroXml = 'Esta nota já está anexada ao pedido #' + formatPedidoId(dup.pedido_id) + '.'; _nfMsg('nf-msg-xml', e.erroXml); _nfAtualizarSalvar(); return; }
    if (e.cancelaNota != null) {
        const alvo = _nfPorId(e.cancelaNota);
        if (!alvo || alvo.status === 'cancelada') return;
        const antes = { status: alvo.status, ev: alvo.eventos.length, x: alvo.xml_cancelamento, xn: alvo.xml_cancelamento_nome, xb: alvo.xml_cancelamento_b64 };
        alvo.status = 'cancelada';
        alvo.xml_cancelamento = e.xmlTexto; alvo.xml_cancelamento_nome = e.xmlNome; alvo.xml_cancelamento_b64 = e.xmlB64 || null;
        alvo.eventos.push(_nfEvento('cancelada', 'Cancelamento anexado (XML)' + (e.xmlNome ? ' (' + e.xmlNome + ')' : '')));
        if (!_nfGravar(() => { alvo.status = antes.status; alvo.eventos.length = antes.ev; alvo.xml_cancelamento = antes.x; alvo.xml_cancelamento_nome = antes.xn; alvo.xml_cancelamento_b64 = antes.xb; })) return;
        _nfFechar('nf-emitir'); _nfEst = null; _nfRenderLista(ped.id);
        toast('Nota cancelada.', 'success');
        return;
    }
    const dados = _nfDadosAtuais();
    const eventos = [_nfEvento('anexada', 'Nota anexada' + (e.xmlNome ? ' (' + e.xmlNome + ')' : ''))];
    e.avisos.forEach(a => eventos.push(_nfEvento('aviso', a)));
    const registro = {
        id: _nfNovoId(), pedido_id: ped.id, tipo: nota.tipo, numero: nota.numero || '', serie: nota.serie || '',
        chave: nota.chave || null, codigo_verificacao: nota.codigo_verificacao || null,
        data_emissao: nota.data_emissao || hojeLocal(), valor: nota.valor || 0, cliente_id: ped.clienteId == null ? null : ped.clienteId,
        status: nota.cancelada ? 'cancelada' : 'autorizada', protocolo: null, eventos,
        xml_nome: e.xmlNome, xml: e.xmlTexto, xml_encoding: e.xmlEnc || 'utf-8', xml_b64: e.xmlB64 || null, pdf_nome: e.pdf ? e.pdfNome : '', pdf: e.pdf || null,
        emitente_doc: nota.emitente_doc || '', tomador_doc: nota.tomador_doc || '', dados,
        origem: 'manual', criado_em: new Date().toISOString(), criado_por: _nfQuemId()
    };
    const lista = _nfNotas();
    lista.push(registro);
    if (!_nfGravar(() => { const i = lista.indexOf(registro); if (i >= 0) lista.splice(i, 1); })) return;
    _nfFechar('nf-emitir');
    _nfEst = null;
    _nfRenderLista(ped.id);
    toast('Nota anexada ao pedido.', 'success');
}
async function exigirPermissao_nf() {
    if (_nfPode()) return true;
    await showAlert('Você não tem permissão para realizar esta ação.', '🚫');
    return false;
}

// ---------- ver PDF, baixar XML ----------
// Sempre application/pdf, e so se os bytes comecam com %PDF (backup importado pode trazer qualquer coisa).
function _nfDataUrlParaBlob(url) {
    const m = /^data:[^;,]*;base64,([A-Za-z0-9+\/=]*)$/.exec(url || '');
    if (!m) return null;
    let bytes;
    try { bytes = _nfDeBase64(m[1]); } catch (e) { return null; }
    return _nfEhPdf(bytes) ? new Blob([bytes], { type: 'application/pdf' }) : null;
}

async function verPdfNota(notaId) {
    const n = _nfPorId(notaId);
    if (!n) return;
    if (!n.pdf) {
        if (!_nfPode()) { showAlert('PDF não anexado.', '📄'); return; }
        const r = await showEscolha('PDF não anexado.', '📄', [{ rotulo: 'Anexar PDF', valor: 'anexar', destaque: true }], 'Fechar');
        if (r === 'anexar') anexarArquivosNota(n.id);
        return;
    }
    const blob = _nfDataUrlParaBlob(n.pdf);
    if (!blob) { showAlert(NF_MSG_NAO_PDF, '⚠️'); return; }
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) toast('O navegador bloqueou a nova aba. Libere os pop-ups deste site e tente de novo.', 'warning', 6000);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function baixarXmlNota(notaId) {
    const n = _nfPorId(notaId);
    if (!n || !n.xml) { toast('Esta nota não tem XML guardado.', 'warning'); return; }
    let blob;
    try { blob = new Blob([n.xml_b64 ? _nfDeBase64(n.xml_b64) : n.xml], { type: 'application/xml' }); } catch (e) { blob = new Blob([n.xml], { type: 'application/xml' }); }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = n.xml_nome || ('nota-' + (n.numero || n.id) + '.xml');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- anexar PDF a uma nota ja guardada ----------
function anexarArquivosNota(notaId) {
    const n = _nfPorId(notaId);
    if (!n) return;
    if (!_nfPode()) { showAlert('Você não tem permissão para realizar esta ação.', '🚫'); return; }
    _nfJanela('nf-anexar', 'Anexar PDF da nota', `
        <div class="form-group"><label for="nf-anexo-pdf">PDF da nota (até 1 MB)</label><input type="file" id="nf-anexo-pdf" accept=".pdf,application/pdf"></div>
        <div class="nf-erro" id="nf-anexo-msg" hidden></div>
        <div class="nf-rodape">
            <button type="button" class="btn btn-outline" onclick="_nfFechar('nf-anexar')">Fechar</button>
            <button type="button" class="btn btn-success" id="nf-anexo-salvar" onclick="_nfSalvarAnexo(${_nfEsc(JSON.stringify(n.id))})">Salvar PDF</button>
        </div>`, 480);
}
async function _nfSalvarAnexo(notaId) {
    const n = _nfPorId(notaId);
    const file = document.getElementById('nf-anexo-pdf')?.files[0];
    if (!n) return;
    if (!file) { _nfMsg('nf-anexo-msg', 'Escolha o arquivo PDF.'); return; }
    if (file.size > NF_PDF_MAX) { _nfMsg('nf-anexo-msg', NF_MSG_PDF_GRANDE); return; }
    let url = '';
    try { url = await _nfLerPdf(file); } catch (e) { if (document.getElementById('nf-anexar')) _nfMsg('nf-anexo-msg', 'Não foi possível ler o PDF.'); return; }
    if (!document.getElementById('nf-anexar')) return;
    if (!url) { _nfMsg('nf-anexo-msg', NF_MSG_NAO_PDF); return; }
    if (!await exigirPermissao_nf()) return;
    const antes = { pdf: n.pdf, pdf_nome: n.pdf_nome, ev: n.eventos.length };
    n.pdf = url; n.pdf_nome = file.name;
    n.eventos.push(_nfEvento('pdf', 'PDF anexado (' + file.name + ')'));
    if (!_nfGravar(() => { n.pdf = antes.pdf; n.pdf_nome = antes.pdf_nome; n.eventos.length = antes.ev; })) return;
    _nfFechar('nf-anexar');
    _nfRenderLista(n.pedido_id);
    toast('PDF anexado.', 'success');
}

// ---------- cancelar ----------
function cancelarNota(notaId) {
    const n = _nfPorId(notaId);
    if (!n) return;
    if (!_nfPode()) { showAlert('Você não tem permissão para realizar esta ação.', '🚫'); return; }
    _nfJanela('nf-cancelar', `Cancelar nota${n.numero ? ' nº ' + _nfEsc(n.numero) : ''}`, `
        <div class="form-group"><label for="nf-cancel-motivo">Motivo do cancelamento (obrigatório)</label><textarea id="nf-cancel-motivo" rows="3"></textarea></div>
        <div class="form-group"><label for="nf-cancel-xml">XML do evento de cancelamento (opcional)</label><input type="file" id="nf-cancel-xml" accept=".xml,text/xml,application/xml"></div>
        <div class="nf-erro" id="nf-cancel-msg" hidden></div>
        <div class="nf-rodape">
            <button type="button" class="btn btn-outline" onclick="_nfFechar('nf-cancelar')">Voltar</button>
            <button type="button" class="btn btn-danger" id="nf-cancel-ok" onclick="_nfConfirmarCancelamento(${_nfEsc(JSON.stringify(n.id))})">Cancelar nota</button>
        </div>`, 520);
}
async function _nfConfirmarCancelamento(notaId) {
    const n = _nfPorId(notaId);
    if (!n) return;
    const motivo = (document.getElementById('nf-cancel-motivo')?.value || '').trim();
    if (!motivo) { _nfMsg('nf-cancel-msg', 'Informe o motivo do cancelamento.'); return; }
    const file = document.getElementById('nf-cancel-xml')?.files[0];
    let detalhe = motivo, xmlEv = null;
    if (file) {
        let lido = { texto: '' };
        try { lido = await _nfLerXmlArquivo(file); } catch (e) { lido = { texto: '' }; }
        if (!document.getElementById('nf-cancelar')) return;
        if (!FiscalCore.lerXmlNota(lido.texto).ok) { _nfMsg('nf-cancel-msg', NF_MSG_NAO_NOTA); return; }
        xmlEv = lido;
        detalhe += ' (XML do evento: ' + file.name + ')';
    }
    if (!await exigirPermissao_nf()) return;
    const res = await Fiscal.provedor.cancelar(n.id, motivo);
    if (res && res.status === 'erro') { _nfMsg('nf-cancel-msg', res.mensagem || 'Não foi possível cancelar a nota.'); return; }
    if (!document.getElementById('nf-cancelar')) return;
    const antes = { status: n.status, ev: n.eventos.length, x: n.xml_cancelamento, xn: n.xml_cancelamento_nome, xb: n.xml_cancelamento_b64 };
    n.status = 'cancelada';
    if (xmlEv) { n.xml_cancelamento = xmlEv.texto; n.xml_cancelamento_nome = file.name; n.xml_cancelamento_b64 = xmlEv.b64; }
    n.eventos.push(_nfEvento('cancelada', detalhe));
    if (!_nfGravar(() => { n.status = antes.status; n.eventos.length = antes.ev; n.xml_cancelamento = antes.x; n.xml_cancelamento_nome = antes.xn; n.xml_cancelamento_b64 = antes.xb; })) return;
    _nfFechar('nf-cancelar');
    _nfRenderLista(n.pedido_id);
    toast('Nota cancelada.', 'success');
}

// ---------- historico ----------
function abrirHistoricoNota(notaId) {
    const n = _nfPorId(notaId);
    if (!n) return;
    const linhas = (n.eventos || []).map(ev => `<div class="nf-evento">
        <div class="nf-evento-topo"><strong>${_nfEsc(_nfDataHora(ev.em))}</strong>${ev.por ? ` <span class="nf-evento-por">por ${_nfEsc(ev.por)}</span>` : ''}</div>
        <div class="nf-evento-txt">${_nfEsc(ev.detalhe)}</div>
    </div>`).join('');
    _nfJanela('nf-historico', `Histórico da nota${n.numero ? ' nº ' + _nfEsc(n.numero) : ''}`, linhas || '<p class="nf-vazio">Sem eventos.</p>', 520);
}
