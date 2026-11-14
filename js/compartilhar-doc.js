// Enviar documentos como PDF anexado: botao "📤 Enviar" em todos os
// documentos (proposta, OS, pedido de compra, agendamento, relatorios, balanco),
// com um menu de duas opcoes: Compartilhar externamente e E-mail.
//
// O documento vira um arquivo PDF de verdade no navegador (html2pdf.js). Onde
// o navegador sabe compartilhar arquivos (celular, Chrome/Edge no Windows),
// abre a janela de compartilhar do aparelho com o PDF ja anexado: a pessoa so
// escolhe WhatsApp, e-mail etc. Onde nao sabe (ex.: Firefox no computador),
// o PDF e' baixado e uma janela oferece WhatsApp e e-mail com a mensagem
// pronta, para anexar o arquivo baixado.

const _CDN_HTML2PDF = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
let _html2pdfPronto = null;

async function _garantirHtml2Pdf() {
    if (window.html2pdf) return;
    if (!_html2pdfPronto) {
        _html2pdfPronto = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = _CDN_HTML2PDF;
            s.onload = resolve;
            s.onerror = () => { _html2pdfPronto = null; reject(new Error('Não foi possível carregar o gerador de PDF — verifique sua conexão.')); };
            document.head.appendChild(s);
        });
    }
    await _html2pdfPronto;
}

// Copia o documento para fora da tela, na largura de uma folha A4, trocando
// as assinaturas desenhadas (canvas) pela imagem atual delas.
function _cloneParaPdf(origem) {
    const clone = origem.cloneNode(true);
    const orig = origem.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((c, i) => {
        if (!orig[i]) return;
        const img = document.createElement('img');
        img.style.cssText = c.style.cssText;
        try { img.src = orig[i].toDataURL('image/png'); } catch (e) { return; }
        c.replaceWith(img);
    });
    // O que nao sai na impressao (ex.: botoes da assinatura) tambem nao vai no PDF.
    clone.querySelectorAll('.no-print').forEach(el => el.remove());
    // SVG com tamanho em % (codigo de barras) sai deformado na copia: fixa o
    // tamanho em pixels, medido no original.
    const svgsOrig = origem.querySelectorAll('svg');
    clone.querySelectorAll('svg').forEach((svg, i) => {
        const r = svgsOrig[i] && svgsOrig[i].getBoundingClientRect();
        if (!r || !r.width || !r.height) return;
        svg.setAttribute('width', String(Math.round(r.width)));
        svg.setAttribute('height', String(Math.round(r.height)));
    });
    clone.removeAttribute('id');
    // O html2pdf copia o elemento que recebe; por isso a posicao fora da tela
    // fica so na moldura, e o conteudo (o que vira PDF) nao leva deslocamento.
    const moldura = document.createElement('div');
    moldura.className = 'compartilhar-pdf-render';
    moldura.style.cssText = 'position:fixed;left:-10000px;top:0';
    const folha = document.createElement('div');
    folha.style.cssText = 'width:718px;background:#fff;color:#242424';
    folha.appendChild(clone);
    moldura.appendChild(folha);
    document.body.appendChild(moldura);
    return { moldura, folha };
}

function _nomeArquivoSeguro(t) {
    return String(t || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'documento';
}

async function gerarArquivoPdf(origem, nomeArquivo) {
    await _garantirHtml2Pdf();
    const { moldura, folha } = _cloneParaPdf(origem);
    try {
        const blob = await window.html2pdf().set({
            margin: [10, 10, 10, 10],
            filename: nomeArquivo,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(folha).outputPdf('blob');
        return new File([blob], nomeArquivo, { type: 'application/pdf' });
    } finally {
        moldura.remove();
    }
}

function _baixarArquivo(arquivo) {
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url; a.download = arquivo.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- Documento a enviar ------------------------------------------------------
// Cada documento diz o que vai no envio: titulo, nome do arquivo, mensagem e
// para quem (e-mail/telefone, quando se sabe). obterElemento devolve o
// documento montado; sem ele, vale o papel da janela de documento.
let _envioDocAtual = null;

function definirEnvioDoc(ctx) { _envioDocAtual = ctx || null; }

// Monta o contexto: "Ola Maria! <frase>" e assunto "<titulo> — <empresa>".
function contextoEnvio({ titulo, arquivo, nome, frase, email, tel, obterElemento }) {
    const empresa = valoresComunsEmpresa().empresa;
    const primeiro = String(nome || '').trim().split(' ')[0] || '';
    return {
        titulo, empresa, obterElemento,
        texto: `Olá${primeiro ? ' ' + primeiro : ''}! ${frase || `Segue ${titulo} da ${empresa}.`}`,
        assunto: `${titulo} — ${empresa}`,
        email: email || '',
        tel: String(tel || '').replace(/\D/g, ''),
        arquivo: `${_nomeArquivoSeguro(arquivo || titulo)}.pdf`
    };
}

// Um contexto por documento -------------------------------------------------

function envioProposta(pedidoId) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    const cli = ped ? db.clientes.find(c => c.id == ped.clienteId) : null;
    const nome = (cli && cli.nome) || (ped && ped.clienteNome) || '';
    const num = ped ? formatPedidoId(ped.id) : '';
    const empresa = valoresComunsEmpresa().empresa;
    return contextoEnvio({
        titulo: `Proposta comercial nº ${num}`, nome,
        arquivo: `Proposta-${num}${nome ? '-' + nome : ''}`,
        frase: `Segue a proposta comercial nº ${num} da ${empresa}. Qualquer dúvida, estou à disposição.`,
        email: cli && cli.email, tel: cli && cli.tel
    });
}

// A OS e' do time (costura/instalacao): vai sem destinatario.
function envioOS(pedidoId) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    const num = ped ? formatPedidoId(ped.id) : '';
    const cli = ped ? (db.clientes.find(c => c.id == ped.clienteId)?.nome || ped.clienteNome || '') : '';
    return contextoEnvio({
        titulo: `Ordem de serviço nº ${num}`,
        arquivo: `OS-${num}${cli ? '-' + cli : ''}`,
        frase: `Segue a ordem de serviço nº ${num}${cli ? ` (cliente ${cli})` : ''}.`
    });
}

function envioPedidoCompra(pcId) {
    const pc = db.pedidos_compra.find(p => p.id == pcId);
    const forn = pc ? db.fornecedores.find(f => f.id == pc.fornecedor_id) : null;
    const num = pc ? formatPedidoId(pc.id) : '';
    const data = pc && pc.data_criacao ? new Date(pc.data_criacao).toLocaleDateString('pt-BR') : '';
    return contextoEnvio({
        titulo: `Pedido de compra nº ${num}`, nome: forn && forn.nome,
        arquivo: `Pedido-de-compra-${num}${forn && forn.nome ? '-' + forn.nome : ''}`,
        frase: `Segue em anexo o pedido de compra nº ${num}${data ? `, emitido em ${data}` : ''}.`,
        email: forn && forn.email, tel: forn && forn.tel
    });
}

function envioHistoricoFornecedor(forn, periodo) {
    return contextoEnvio({
        titulo: 'Histórico de pedidos de compra', nome: forn && forn.nome,
        arquivo: `Historico-de-pedidos${forn && forn.nome ? '-' + forn.nome : ''}`,
        frase: `Segue o histórico dos nossos pedidos de compra${periodo ? ` (${periodo})` : ''}.`,
        email: forn && forn.email, tel: forn && forn.tel
    });
}

function envioAgendamentoMedicao(v) {
    const cli = v && v.clienteId ? db.clientes.find(c => c.id == v.clienteId) : null;
    const data = v && v.data ? new Date(v.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
    return contextoEnvio({
        titulo: 'Agendamento de medição', nome: (v && v.clienteNome) || (cli && cli.nome),
        arquivo: `Agendamento-medicao${data ? '-' + data.replace(/\//g, '-') : ''}${v && v.clienteNome ? '-' + v.clienteNome : ''}`,
        frase: `Segue a confirmação da visita de medição${data ? ` do dia ${data}` : ''}${v && v.hora ? ` às ${v.hora}` : ''}.`,
        email: cli && cli.email, tel: (v && v.clienteTel) || (cli && cli.tel)
    });
}

// Documentos internos (relatorios, balanco): sem destinatario, para quem a
// pessoa quiser (ex.: contador).
function envioDocumentoInterno(titulo, arquivo, obterElemento) {
    return contextoEnvio({ titulo, arquivo, obterElemento });
}

// --- Botao "Enviar" e o menu que sai dele ----------------------------------

function botaoEnviarHtml(classe) {
    return `<button type="button" class="${classe || 'doc-modal-btn doc-modal-btn-compartilhar'}" id="btn-enviar-doc" onclick="abrirMenuEnviar(this)">📤 Enviar</button>`;
}

function fecharMenuEnviar(imediato) {
    const m = document.getElementById('menu-enviar-doc');
    if (!m) return;
    document.removeEventListener('mousedown', _cliqueForaMenuEnviar, true);
    document.removeEventListener('keydown', _escMenuEnviar, true);
    if (imediato || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { m.remove(); return; }
    m.classList.add('saindo');
    setTimeout(() => m.remove(), 260);
}
function _cliqueForaMenuEnviar(e) {
    const m = document.getElementById('menu-enviar-doc');
    if (m && !m.contains(e.target) && e.target.id !== 'btn-enviar-doc') fecharMenuEnviar();
}
function _escMenuEnviar(e) { if (e.key === 'Escape') fecharMenuEnviar(); }

// O menu "sai" do botao como um genio da lampada: nasce fino no botao,
// estica e se abre (animacao em CSS: .menu-enviar).
function abrirMenuEnviar(botao) {
    if (document.getElementById('menu-enviar-doc')) { fecharMenuEnviar(); return; }
    if (!_envioDocAtual) return;
    const m = document.createElement('div');
    m.id = 'menu-enviar-doc';
    m.className = 'menu-enviar';
    m.setAttribute('role', 'menu');
    m.innerHTML = `
        <button type="button" class="menu-enviar-item" role="menuitem" data-acao="compartilhar">
            <span class="menu-enviar-icone">🔗</span>
            <span><b>Compartilhar externamente</b><small>WhatsApp e outros apps, com o PDF anexado</small></span>
        </button>
        <button type="button" class="menu-enviar-item" role="menuitem" data-acao="email">
            <span class="menu-enviar-icone">✉️</span>
            <span><b>E-mail</b><small>Rascunho pronto, com o PDF anexado</small></span>
        </button>`;
    document.body.appendChild(m);
    // abaixo do botao, com o "pescoco" do genio apontando para ele
    const r = botao.getBoundingClientRect();
    const largura = m.offsetWidth;
    const centro = r.left + r.width / 2;
    const esquerda = Math.max(8, Math.min(window.innerWidth - largura - 8, centro - largura / 2));
    m.style.left = esquerda + 'px';
    m.style.top = (r.bottom + 10) + 'px';
    m.style.setProperty('--origem-x', (centro - esquerda) + 'px');
    m.querySelector('[data-acao="compartilhar"]').onclick = () => { fecharMenuEnviar(true); compartilharDocumento(botao); };
    m.querySelector('[data-acao="email"]').onclick = () => { fecharMenuEnviar(true); enviarDocumentoPorEmail(botao); };
    setTimeout(() => {
        document.addEventListener('mousedown', _cliqueForaMenuEnviar, true);
        document.addEventListener('keydown', _escMenuEnviar, true);
    }, 0);
}

// --- Gerar o PDF do documento atual ------------------------------------------

function _elementoDoEnvio(ctx) {
    if (ctx.obterElemento) return ctx.obterElemento();
    const paper = document.getElementById('doc-modal-paper');
    if (paper && paper.closest('#doc-modal-overlay.active')) return paper;
    return document.getElementById('proposta-container') || document.getElementById('os-container')
        || document.getElementById('pedido-compra-container');
}

async function _pdfDoDocumentoAtual(botao) {
    const ctx = _envioDocAtual;
    if (!ctx) return null;
    const origem = _elementoDoEnvio(ctx);
    if (!origem) return null;
    if (!await documentoProntoParaImprimir(origem)) return null;
    const rotulo = botao ? botao.innerHTML : '';
    if (botao) { botao.disabled = true; botao.innerHTML = '⏳ Gerando PDF...'; }
    try {
        return { dados: ctx, arquivo: await gerarArquivoPdf(origem, ctx.arquivo) };
    } catch (e) {
        await showAlert(e.message || 'Não foi possível gerar o PDF.', '⚠️');
        return null;
    } finally {
        if (botao) { botao.disabled = false; botao.innerHTML = rotulo; }
    }
}

// --- Compartilhar externamente ---------------------------------------------

async function compartilharDocumento(botao) {
    const pronto = await _pdfDoDocumentoAtual(botao);
    if (!pronto) return;
    const { dados, arquivo } = pronto;
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [arquivo] })) {
        try {
            await navigator.share({ files: [arquivo], title: dados.assunto, text: dados.texto });
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return;   // a pessoa fechou a janela de compartilhar
        }
    }
    _baixarArquivo(arquivo);
    mostrarAlternativaCompartilhar(dados, arquivo.name);
}

// Sem compartilhamento de arquivo no navegador: o PDF ja foi baixado; aqui
// ficam os atalhos com a mensagem pronta para a pessoa anexar o arquivo.
function mostrarAlternativaCompartilhar(dados, nomeArquivo) {
    document.getElementById('compartilhar-alternativa')?.remove();
    const waUrl = dados.tel
        ? `https://wa.me/55${dados.tel}?text=${encodeURIComponent(dados.texto)}`
        : `https://wa.me/?text=${encodeURIComponent(dados.texto)}`;
    const mailUrl = `mailto:${encodeURIComponent(dados.email)}?subject=${encodeURIComponent(dados.assunto)}&body=${encodeURIComponent(dados.texto)}`;
    const overlay = document.createElement('div');
    overlay.id = 'compartilhar-alternativa';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10050';
    overlay.innerHTML = `<div class="modal-box" style="max-width:440px">
        <div class="modal-header">
            <h3>Compartilhar — ${escapeHtml(dados.titulo)}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            <p style="font-size:13px;color:#555;margin-bottom:6px">Este navegador não anexa o arquivo sozinho. O PDF
                <strong>${escapeHtml(nomeArquivo)}</strong> foi baixado: abra a conversa abaixo e anexe (ou arraste) o arquivo.</p>
            <p style="font-size:12px;color:#8F8F8F;margin-bottom:16px">No celular, ou no Chrome/Edge do computador, o PDF já vai anexado.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <a class="btn btn-success" href="${waUrl}" target="_blank" rel="noopener" style="justify-content:center">💬 WhatsApp</a>
                <a class="btn btn-outline" href="${mailUrl}" style="justify-content:center">✉️ E-mail</a>
            </div>
        </div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// --- E-mail com tudo preenchido ---------------------------------------------
// O navegador nao manda e-mail sozinho nem anexa arquivo num link mailto:.
// O que da para fazer sem servidor: um rascunho de e-mail (.eml) com
// destinatario, assunto, texto e o PDF anexado. "X-Unsent: 1" faz o Outlook
// e o Email do Windows abrirem o arquivo como rascunho, pronto para Enviar.
// Gmail/Outlook no navegador nao abrem .eml: para eles fica o link mailto
// (preenche tudo, menos o anexo) e o PDF para anexar.

function _base64DeBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}
function _base64Utf8(texto) {
    return _base64DeBytes(new TextEncoder().encode(texto));
}
function _quebrar76(b64) {
    return b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}
// Cabecalho com acento (assunto, nome do arquivo): RFC 2047.
function _cabecalhoMime(texto) {
    return /^[\x20-\x7E]*$/.test(texto) ? texto : `=?UTF-8?B?${_base64Utf8(texto)}?=`;
}

async function montarRascunhoEml({ para, assunto, texto, arquivo }) {
    const limite = 'sctech_' + Date.now().toString(36);
    const pdf = new Uint8Array(await arquivo.arrayBuffer());
    const nomeAnexo = _cabecalhoMime(arquivo.name);
    const linhas = [
        'X-Unsent: 1',
        ...(para ? [`To: ${para}`] : []),
        `Subject: ${_cabecalhoMime(assunto)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${limite}"`,
        '',
        `--${limite}`,
        'Content-Type: text/plain; charset="utf-8"',
        'Content-Transfer-Encoding: base64',
        '',
        _quebrar76(_base64Utf8(texto)),
        '',
        `--${limite}`,
        `Content-Type: application/pdf; name="${nomeAnexo}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${nomeAnexo}"`,
        '',
        _quebrar76(_base64DeBytes(pdf)),
        '',
        `--${limite}--`,
        ''
    ];
    return new File([linhas.join('\r\n')], arquivo.name.replace(/\.pdf$/i, '') + '.eml', { type: 'message/rfc822' });
}

async function enviarDocumentoPorEmail(botao) {
    const pronto = await _pdfDoDocumentoAtual(botao);
    if (!pronto) return;
    const { dados, arquivo } = pronto;
    const texto = dados.texto.replace('! ', '!\n\n') + '\n\nAtenciosamente,\n' + dados.empresa;
    const eml = await montarRascunhoEml({ para: dados.email, assunto: dados.assunto, texto, arquivo });
    _baixarArquivo(eml);
    mostrarAjudaEmail(dados, texto, eml.name, arquivo);
}

let _pdfEmailAtual = null;
function mostrarAjudaEmail(dados, texto, nomeEml, arquivo) {
    _pdfEmailAtual = arquivo;
    document.getElementById('compartilhar-email')?.remove();
    const mailUrl = `mailto:${encodeURIComponent(dados.email)}?subject=${encodeURIComponent(dados.assunto)}&body=${encodeURIComponent(texto)}`;
    const overlay = document.createElement('div');
    overlay.id = 'compartilhar-email';
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10050';
    overlay.innerHTML = `<div class="modal-box" style="max-width:480px">
        <div class="modal-header">
            <h3>E-mail — ${escapeHtml(dados.titulo)}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            ${dados.email ? '' : `<p style="font-size:12px;color:#B45309;background:#FEF3C7;border-radius:6px;padding:8px 10px;margin-bottom:12px">
                Sem e-mail cadastrado para este documento: o destinatário vai em branco.</p>`}
            <p style="font-size:13px;color:#242424;margin-bottom:4px"><strong>Outlook ou Email do Windows</strong></p>
            <p style="font-size:13px;color:#555;margin-bottom:14px">O rascunho <strong>${escapeHtml(nomeEml)}</strong> foi baixado.
                Abra o arquivo: o e-mail aparece pronto ${dados.email ? `para <strong>${escapeHtml(dados.email)}</strong>, ` : ''}com assunto,
                texto e o PDF anexado. É só clicar em Enviar.</p>
            <p style="font-size:13px;color:#242424;margin-bottom:4px"><strong>Gmail ou e-mail no navegador</strong></p>
            <p style="font-size:13px;color:#555;margin-bottom:12px">Abra o e-mail já preenchido e anexe o PDF (baixe aqui se precisar).</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <a class="btn btn-success" href="${mailUrl}" style="justify-content:center">✉️ Abrir e-mail preenchido</a>
                <button type="button" class="btn btn-outline" onclick="_pdfEmailAtual && _baixarArquivo(_pdfEmailAtual)" style="justify-content:center">📄 Baixar o PDF</button>
            </div>
        </div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}
