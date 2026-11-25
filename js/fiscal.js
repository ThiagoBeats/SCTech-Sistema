'use strict';
// Pontes do navegador para o fiscal e o banco. Hoje so os provedores "manual" sao usados; o provedor de servidor
// (Node.js futuro) ja fala com as rotas combinadas, mas nenhuma tela o liga ainda.
// Usa os globais do app (db, getContasFin, CaixaCore) so quando as funcoes sao chamadas.
(function (raiz) {

    const AVISO_MANUAL = 'Emita esta nota no sistema da prefeitura/SEFAZ ou do seu contador e anexe aqui o XML e o PDF.';
    const TEMPO_LIMITE_MS = 30000;

    function pedir(baseUrl, caminho, opcoes) {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), TEMPO_LIMITE_MS) : null;
        const init = Object.assign({ headers: { 'Content-Type': 'application/json' } }, opcoes || {});
        if (ctl) init.signal = ctl.signal;
        return fetch(String(baseUrl || '').replace(/\/+$/, '') + caminho, init)
            .then(r => r.json().catch(() => ({})).then(corpo => {
                if (!r.ok) return { status: 'erro', mensagem: corpo.mensagem || ('Servidor respondeu ' + r.status + '.') };
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

    raiz.Fiscal = { provedorManual, provedorServidor, provedor: provedorManual, AVISO_MANUAL };
    raiz.Banco = { provedorManual: bancoManual, provedorServidor: bancoServidor, provedor: bancoManual };

})(window);
