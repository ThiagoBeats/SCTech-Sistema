// Imagens da galeria e do mostruario (fotos e texturas). Ficam no IndexedDB do
// navegador, que cabe bem mais que o localStorage. TODO o acesso aos bytes das
// imagens passa por aqui: quando o sistema for para o servidor da empresa, so
// este arquivo muda. O mostruario (sc_mostruario) guarda apenas os ids.
(function (raiz) {
    'use strict';

    const BANCO = 'sctech-imagens', STORE = 'imagens';
    let _conexao = null;
    const _urls = new Map();

    function abrir() {
        if (_conexao) return _conexao;
        _conexao = new Promise((ok, falha) => {
            let req;
            try {
                if (!raiz.indexedDB) throw new Error('IndexedDB indisponível');
                req = raiz.indexedDB.open(BANCO, 1);
            } catch (e) { falha(e); return; }
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
            };
            req.onsuccess = () => ok(req.result);
            req.onerror = () => falha(req.error || new Error('Falha ao abrir o IndexedDB'));
        });
        _conexao.catch(() => { _conexao = null; });
        return _conexao;
    }

    function transacao(modo, fn) {
        return abrir().then(db => new Promise((ok, falha) => {
            const tx = db.transaction(STORE, modo);
            const r = fn(tx.objectStore(STORE));
            tx.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
            tx.onerror = () => falha(tx.error);
            tx.onabort = () => falha(tx.error || new Error('Transação cancelada'));
        }));
    }

    function disponivel() {
        return abrir().then(() => true, () => false);
    }

    function salvar(blob) {
        const id = 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        return transacao('readwrite', s => s.put({ id, blob, criado: Date.now() })).then(() => id);
    }

    function ler(id) {
        return transacao('readonly', s => s.get(String(id)))
            .then(r => (r && r.blob) || null, () => null);
    }

    function url(id) {
        if (_urls.has(id)) return Promise.resolve(_urls.get(id));
        return ler(id).then(blob => {
            if (!blob) return null;
            const u = URL.createObjectURL(blob);
            _urls.set(id, u);
            return u;
        });
    }

    function remover(id) {
        if (_urls.has(id)) { URL.revokeObjectURL(_urls.get(id)); _urls.delete(id); }
        return transacao('readwrite', s => s.delete(String(id))).then(() => undefined);
    }

    function ids() {
        return transacao('readonly', s => s.getAllKeys()).then(r => (r || []).map(String), () => []);
    }

    // Reduz para o lado maior `max` (sem ampliar), respeitando a orientacao da
    // foto do celular. Sai JPEG, exceto PNG pequeno que nao precisou reduzir.
    function carregarBitmap(blob) {
        if (typeof createImageBitmap === 'function') {
            return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(blob));
        }
        return new Promise((ok, falha) => {
            const img = new Image();
            const u = URL.createObjectURL(blob);
            img.onload = () => { URL.revokeObjectURL(u); ok(img); };
            img.onerror = () => { URL.revokeObjectURL(u); falha(new Error('Imagem inválida')); };
            img.src = u;
        });
    }

    function reduzirImagem(blob, max, qualidade) {
        return carregarBitmap(blob).then(bm => {
            const w0 = bm.width, h0 = bm.height;
            const k = Math.min(1, max / Math.max(w0, h0));
            const w = Math.round(w0 * k), h = Math.round(h0 * k);
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const g = c.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
            g.drawImage(bm, 0, 0, w, h);
            if (bm.close) bm.close();
            const tipo = k === 1 && blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
            return new Promise((ok, falha) => c.toBlob(b => b ? ok(b) : falha(new Error('Falha ao reduzir a imagem')), tipo, qualidade || 0.85));
        });
    }

    raiz.GaleriaImagens = { disponivel, salvar, ler, url, remover, ids, reduzirImagem };
})(typeof window !== 'undefined' ? window : this);
