// Compartilhar documento como PDF anexado (teste: so na Proposta Comercial).
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

// Dados da proposta para a mensagem e para os atalhos de WhatsApp/e-mail.
function _dadosCompartilharProposta(pedidoId) {
    const ped = db.pedidos.find(p => p.id == pedidoId);
    const cli = ped ? db.clientes.find(c => c.id == ped.clienteId) : null;
    const emp = valoresComunsEmpresa().empresa;
    const nomeCli = (cli && cli.nome) || (ped && ped.clienteNome) || '';
    const num = ped ? formatPedidoId(ped.id) : '';
    const primeiroNome = nomeCli.split(' ')[0] || '';
    const texto = `Olá${primeiroNome ? ' ' + primeiroNome : ''}! Segue a proposta comercial nº ${num} da ${emp}. Qualquer dúvida, estou à disposição.`;
    return {
        num, texto,
        tel: ((cli && cli.tel) || '').replace(/\D/g, ''),
        email: (cli && cli.email) || '',
        assunto: `Proposta comercial nº ${num} — ${emp}`,
        arquivo: `Proposta-${_nomeArquivoSeguro(num)}${nomeCli ? '-' + _nomeArquivoSeguro(nomeCli) : ''}.pdf`
    };
}

// Documento aberto (janela do pedido ou pagina proposta.html), conferido e
// convertido em PDF. Devolve { dados, arquivo } ou null (falhou / avisado).
async function _pdfDaPropostaAberta(botao) {
    const origem = document.getElementById('doc-modal-paper')?.closest('#doc-modal-overlay.active')
        ? document.getElementById('doc-modal-paper')
        : document.getElementById('proposta-container');
    const pedidoId = (typeof _docModalAtual !== 'undefined' && _docModalAtual && _docModalAtual.pedidoId)
        || localStorage.getItem('sc_proposta_id');
    if (!origem || !pedidoId) return null;
    if (!await documentoProntoParaImprimir(origem)) return null;

    const dados = _dadosCompartilharProposta(pedidoId);
    const rotulo = botao ? botao.innerHTML : '';
    if (botao) { botao.disabled = true; botao.innerHTML = '⏳ Gerando PDF...'; }
    try {
        return { dados, arquivo: await gerarArquivoPdf(origem, dados.arquivo) };
    } catch (e) {
        await showAlert(e.message || 'Não foi possível gerar o PDF.', '⚠️');
        return null;
    } finally {
        if (botao) { botao.disabled = false; botao.innerHTML = rotulo; }
    }
}

// Botao "Compartilhar" da proposta (janela do pedido e pagina proposta.html).
async function compartilharProposta(botao) {
    const pronto = await _pdfDaPropostaAberta(botao);
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
    mostrarAlternativaCompartilhar(dados);
}

// --- E-mail com tudo preenchido (teste) ---
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

// Botao "E-mail" da proposta.
async function enviarPropostaPorEmail(botao) {
    const pronto = await _pdfDaPropostaAberta(botao);
    if (!pronto) return;
    const { dados, arquivo } = pronto;
    const texto = dados.texto.replace('! ', '!\n\n') + '\n\nAtenciosamente,\n' + valoresComunsEmpresa().empresa;
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
            <h3>E-mail da proposta nº ${escapeHtml(dados.num)}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            ${dados.email ? '' : `<p style="font-size:12px;color:#B45309;background:#FEF3C7;border-radius:6px;padding:8px 10px;margin-bottom:12px">
                O cliente não tem e-mail cadastrado: o destinatário vai em branco.</p>`}
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

// Sem compartilhamento de arquivo no navegador: o PDF ja foi baixado; aqui
// ficam os atalhos com a mensagem pronta para a pessoa anexar o arquivo.
function mostrarAlternativaCompartilhar(dados) {
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
            <h3>Compartilhar proposta nº ${escapeHtml(dados.num)}</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
            <p style="font-size:13px;color:#555;margin-bottom:6px">Este navegador não anexa o arquivo sozinho. O PDF
                <strong>${escapeHtml(dados.arquivo)}</strong> foi baixado: abra a conversa abaixo e anexe (ou arraste) o arquivo.</p>
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
