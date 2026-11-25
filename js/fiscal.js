'use strict';
// Pontes do navegador para o fiscal e o banco. Hoje so os provedores "manual" sao usados; o provedor de servidor
// (Node.js futuro) ja fala com as rotas combinadas, mas nenhuma tela o liga ainda.
// Usa os globais do app (db, getContasFin, CaixaCore) so quando as funcoes sao chamadas.
//
// Contrato do provedor fiscal (Fiscal.provedor):
//   emitir(dadosNota)  -> { status, numero, serie, chave, protocolo, xml, pdf, mensagem, servidor_id }
//     dadosNota = dadosNotaDoPedido(...) + { referencia (id local da nota, criada como 'rascunho' antes da chamada;
//     chave de idempotencia: repetir a chamada com a mesma referencia nao emite outra nota), pedido_id, cliente_id }.
//     status: 'manual' (modo manual: a tela segue para anexar XML/PDF), 'autorizada', 'processando', 'rejeitada' ou 'erro'.
//     'processando' = a SEFAZ/prefeitura ainda nao respondeu: a nota fica 'processando' e deve ser consultada com
//     consultar(servidor_id) ate virar 'autorizada' ou 'rejeitada' (a consulta periodica e entrega do servidor).
//   consultar(id)      -> { status, ... }     id = servidor_id devolvido por emitir (ou o id local, no modo manual)
//   cancelar(id, motivo) -> { status }        'cancelada' ou 'manual' cancelam a nota; 'processando' mantem 'processando'
//     com um evento; qualquer outro status (inclusive 'erro') nao cancela.
// Rotas do servidor: POST /api/fiscal/emitir, GET /api/fiscal/:id, POST /api/fiscal/:id/cancelar.
// Resposta 2xx que nao seja JSON vira { status: 'erro', mensagem: 'Resposta inválida do servidor.' }.
(function (raiz) {

    const AVISO_MANUAL = 'Emita esta nota no sistema da prefeitura/SEFAZ ou do seu contador e anexe aqui o XML e o PDF.';
    const TEMPO_LIMITE_MS = 30000;

    function pedir(baseUrl, caminho, opcoes) {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), TEMPO_LIMITE_MS) : null;
        const init = Object.assign({ headers: { 'Content-Type': 'application/json' } }, opcoes || {});
        if (ctl) init.signal = ctl.signal;
        return fetch(String(baseUrl || '').replace(/\/+$/, '') + caminho, init)
            .then(r => r.json().then(corpo => ({ corpo, json: true }), () => ({ corpo: {}, json: false })).then(({ corpo, json }) => {
                if (!r.ok) return { status: 'erro', mensagem: (corpo && corpo.mensagem) || ('Servidor respondeu ' + r.status + '.') };
                if (!json) return { status: 'erro', mensagem: 'Resposta inválida do servidor.' };
                return corpo;
            }))
            .catch(e => ({ status: 'erro', mensagem: e && e.name === 'AbortError' ? 'O servidor demorou demais para responder.' : 'Não foi possível falar com o servidor.' }))
            .then(res => { if (timer) clearTimeout(timer); return res; });
    }

    const provedorManual = {
        nome: 'manual',
        emitir() { return Promise.resolve({ status: 'manual', mensagem: AVISO_MANUAL }); },
        consultar(id) { return Promise.resolve({ status: 'manual', id, mensagem: 'Modo manual: consulta registrada só neste computador.' }); },
        cancelar(id, motivo) { return Promise.resolve({ status: 'manual', id, motivo: motivo || '', mensagem: 'Modo manual: cancelamento registrado só neste computador.' }); }
    };

    function provedorServidor(baseUrl) {
        return {
            nome: 'servidor',
            emitir(dadosNota) { return pedir(baseUrl, '/api/fiscal/emitir', { method: 'POST', body: JSON.stringify(dadosNota || {}) }); },
            consultar(id) { return pedir(baseUrl, '/api/fiscal/' + encodeURIComponent(id), { method: 'GET' }); },
            cancelar(id, motivo) { return pedir(baseUrl, '/api/fiscal/' + encodeURIComponent(id) + '/cancelar', { method: 'POST', body: JSON.stringify({ motivo: motivo || '' }) }); }
        };
    }

    const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

    const bancoManual = {
        nome: 'manual',
        contas() { return Promise.resolve(typeof getContasFin === 'function' ? getContasFin().slice() : []); },
        saldos() {
            const lista = typeof getContasFin === 'function' ? getContasFin() : [];
            const movs = (typeof db !== 'undefined' && db.movimentos_fin) || [];
            const hoje = hojeIso();
            return Promise.resolve(lista.filter(c => c.ativo !== false).map(c => ({ conta_id: c.id, nome: c.nome, saldo: CaixaCore.saldoContaAte(c, movs, hoje), data: hoje })));
        },
        movimentos(desde) {
            const linhas = (typeof db !== 'undefined' && db.fin_extrato) || [];
            return Promise.resolve(linhas.filter(l => l && (!desde || String(l.data || '') >= desde)));
        }
    };

    function bancoServidor(baseUrl) {
        return {
            nome: 'servidor',
            contas() { return pedir(baseUrl, '/api/banco/contas', { method: 'GET' }); },
            saldos() { return pedir(baseUrl, '/api/banco/saldos', { method: 'GET' }); },
            movimentos(desde) { return pedir(baseUrl, '/api/banco/movimentos' + (desde ? '?desde=' + encodeURIComponent(desde) : ''), { method: 'GET' }); }
        };
    }

    // ---------- arquivos das notas (PDF) no IndexedDB: o localStorage guarda so os dados da nota ----------
    const BANCO = 'sctech_arquivos', LOJA = 'nf_pdf';
    const ehPdf = b => !!b && b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
    const paraBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
    const deBase64 = b64 => { const bin = atob(b64), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
    const DATA_PDF = /^data:[^;,]*;base64,([A-Za-z0-9+\/=]*)$/;
    function abrirBanco() {
        return new Promise((ok, erro) => {
            let idb = null;
            try { idb = raiz.indexedDB; } catch (e) { idb = null; }
            if (!idb) { erro(new Error('sem IndexedDB')); return; }
            let r;
            try { r = idb.open(BANCO, 1); } catch (e) { erro(e); return; }
            r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA); };
            r.onsuccess = () => ok(r.result);
            r.onerror = () => erro(r.error || new Error('IndexedDB'));
            r.onblocked = () => erro(new Error('IndexedDB bloqueado'));
        });
    }
    // fn(store) devolve um IDBRequest (ou nada); o resultado sai quando a transacao termina.
    function transacao(modo, fn) {
        return abrirBanco().then(banco => new Promise((ok, erro) => {
            let t, req;
            try { t = banco.transaction(LOJA, modo); req = fn(t.objectStore(LOJA)); } catch (e) { banco.close(); erro(e); return; }
            t.oncomplete = () => { banco.close(); ok(req ? req.result : undefined); };
            t.onerror = t.onabort = () => { banco.close(); erro(t.error || new Error('IndexedDB')); };
        }));
    }
    const NfArquivos = {
        disponivel: () => abrirBanco().then(b => { b.close(); return true; }, () => false),
        gravar: (id, bytes) => transacao('readwrite', s => s.put(bytes, String(id))).then(() => true),
        ler: id => transacao('readonly', s => s.get(String(id))).then(r => (r ? new Uint8Array(r) : null)),
        apagar: id => transacao('readwrite', s => s.delete(String(id))).then(() => true),
        limpar: () => transacao('readwrite', s => s.clear()).then(() => true),
        // Apaga os PDFs que nao estao em `manter` (ids) e grava a lista. Devolve os ids que nao puderam ser gravados.
        async gravarVarios(lista, manter) {
            const ficam = new Set((manter || []).map(String));
            try {
                const chaves = await transacao('readonly', s => s.getAllKeys());
                for (const k of chaves || []) if (!ficam.has(String(k))) { try { await NfArquivos.apagar(k); } catch (e) { /* segue */ } }
            } catch (e) { /* sem como limpar: segue gravando */ }
            const falhas = [];
            for (const x of lista || []) { try { await NfArquivos.gravar(x.id, x.bytes); } catch (e) { falhas.push(x.id); } }
            return falhas;
        },
        ehPdf, paraBase64, deBase64,
        // Backup: copia das notas com cada PDF em dataURL (le do IndexedDB; sem ele, a nota segue sem o PDF).
        // Nota cujo PDF nao pode ser lido sai marcada com pdf_no_backup:false (a importacao nao apaga o PDF local dela);
        // NfArquivos.falhasBackup guarda quantas foram.
        async paraBackup(notas) {
            NfArquivos.falhasBackup = 0;
            return Promise.all((notas || []).map(async n => {
                const c = Object.assign({}, n);
                if (n && n.tem_pdf && typeof n.pdf !== 'string') {
                    let bytes = null;
                    try { bytes = await NfArquivos.ler(n.id); } catch (e) { bytes = null; }
                    if (bytes && ehPdf(bytes)) c.pdf = 'data:application/pdf;base64,' + paraBase64(bytes);
                    else { c.pdf_no_backup = false; NfArquivos.falhasBackup++; }
                }
                return c;
            }));
        },
        // Importacao: tira os PDFs inline (backup novo ou antigo) das notas e devolve [{ id, bytes }] para gravar; normaliza as notas.
        separarDoBackup(notas) {
            const lista = [], manter = [];
            lista.manter = manter;
            (notas || []).forEach(n => {
                if (!n || typeof n !== 'object') return;
                if (!Array.isArray(n.eventos)) n.eventos = [];
                if (n.xml_b64 && n.xml) n.xml = '';
                let bytes = null;
                const m = typeof n.pdf === 'string' ? DATA_PDF.exec(n.pdf) : null;
                if (m) { try { bytes = deBase64(m[1]); } catch (e) { bytes = null; } }
                delete n.pdf;
                const mantem = n.tem_pdf === true && n.pdf_no_backup === false;   // o backup diz que tinha PDF, mas nao o incluiu
                delete n.pdf_no_backup;
                if (bytes && ehPdf(bytes)) { lista.push({ id: n.id, bytes }); n.tem_pdf = true; n.pdf_tamanho = bytes.length; }
                else if (mantem) manter.push(n.id);
                else { n.tem_pdf = false; n.pdf_nome = ''; delete n.pdf_tamanho; }
            });
            return lista;
        },
        // Notas antigas (PDF inline no sc_nf): leva o PDF para o IndexedDB e tira do sc_nf. Falhando, nao mexe em nada.
        async migrar() {
            if (typeof db === 'undefined' || !Array.isArray(db.notas_fiscais)) return;
            const notas = db.notas_fiscais;
            const precisa = notas.some(n => n && ((typeof n.pdf === 'string' && n.pdf) || (n.xml_b64 && n.xml) || (n.xml_cancelamento_b64 && n.xml_cancelamento)));
            if (!precisa) return;
            const feitos = [];
            for (const n of notas) {
                if (!n || typeof n.pdf !== 'string' || !n.pdf) continue;
                const m = DATA_PDF.exec(n.pdf);
                let bytes = null;
                if (m) { try { bytes = deBase64(m[1]); } catch (e) { bytes = null; } }
                if (bytes && ehPdf(bytes)) {
                    try { await NfArquivos.gravar(n.id, bytes); } catch (e) { continue; }
                    feitos.push([n, bytes.length]);
                } else feitos.push([n, 0]);
            }
            const antes = notas.map(n => n && Object.assign({}, n));
            feitos.forEach(([n, tam]) => { delete n.pdf; if (tam) { n.tem_pdf = true; n.pdf_tamanho = tam; } else { n.tem_pdf = false; n.pdf_nome = ''; } });
            notas.forEach(n => { if (!n) return; if (n.xml_b64 && n.xml) n.xml = ''; if (n.xml_cancelamento_b64 && n.xml_cancelamento) n.xml_cancelamento = ''; });
            if (typeof _gravarChaves === 'function' && !_gravarChaves(['sc_nf'], { silencioso: true })) {
                notas.forEach((n, i) => { if (n && antes[i]) { Object.keys(n).forEach(k => { if (!(k in antes[i])) delete n[k]; }); Object.assign(n, antes[i]); } });
            }
        }
    };
    if (raiz.document) raiz.document.addEventListener('DOMContentLoaded', () => { NfArquivos.migrar().catch(() => {}); });

    raiz.NfArquivos = NfArquivos;
    raiz.Fiscal = { provedorManual, provedorServidor, provedor: provedorManual, AVISO_MANUAL };
    raiz.Banco = { provedorManual: bancoManual, provedorServidor: bancoServidor, provedor: bancoManual };

})(window);
