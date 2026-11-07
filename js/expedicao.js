// Tela de Expedicao: conferencia de volumes por leitor de codigo (teclado).
// Nao depende de bibliotecas externas: funciona sem internet.
const EXP_CHAVE_ATIVO = 'sc_exp_ativo';

function _expAtivoId() {
    const v = sessionStorage.getItem(EXP_CHAVE_ATIVO);
    return v ? Number(v) : null;
}

function _expDefinirAtivo(id) {
    if (id == null) sessionStorage.removeItem(EXP_CHAVE_ATIVO);
    else sessionStorage.setItem(EXP_CHAVE_ATIVO, String(id));
}

function _expSom(ok) {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        window._expAudio = window._expAudio || new Ctx();
        const ctx = window._expAudio;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = ok ? 880 : 220;
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (ok ? 0.12 : 0.4));
    } catch (e) { /* sem audio: segue em silencio */ }
}

function _expResultado(msg, classe, somOk) {
    const el = document.getElementById('exp-resultado');
    if (el) { el.textContent = msg; el.className = 'exp-resultado ' + classe; }
    _expSom(somOk);
}

function _expPedido(id) {
    return db.pedidos.find(p => p.id == id) || null;
}

function _expRenderPedido(id, mostrarVolumes) {
    const el = document.getElementById('exp-pedido');
    if (!el) return;
    const ped = _expPedido(id);
    if (!ped) { el.style.display = 'none'; el.innerHTML = ''; return; }
    const cli = db.clientes.find(c => c.id == ped.clienteId) || null;
    const total = ped.volumes || 0;
    const v = EtiquetasCore.valoresEtiquetaPedido(ped, cli, 0, total, '');
    const feitos = (ped.conferencia && ped.conferencia.volumes_conferidos) || [];
    let vols = '';
    if (mostrarVolumes) {
        for (let i = 1; i <= total; i++) {
            const ok = feitos.indexOf(i) >= 0;
            vols += `<div class="exp-vol ${ok ? 'feito' : ''}" data-vol="${i}">${ok ? '✅' : '⬜'} Volume ${i}/${total}</div>`;
        }
    }
    const e = escapeHtml;
    el.style.display = '';
    el.innerHTML = `
        <div class="exp-pedido-topo">
            <div>
                <div class="exp-pedido-num">Pedido #${e(v.numero)}</div>
                <div class="exp-pedido-cli">${e(v.cliente)}</div>
            </div>
            <button class="btn btn-outline btn-sm" type="button" id="exp-ver-os">Ver OS</button>
        </div>
        <div class="exp-pedido-info">
            <div><b>Endereço:</b> ${e(v.endereco) || '—'}</div>
            <div><b>Telefone:</b> ${e(v.telefone) || '—'}</div>
            <div><b>Entrega:</b> ${e(v.entrega) || '—'}</div>
        </div>
        <div id="exp-volumes" class="exp-volumes">${vols}</div>`;
    document.getElementById('exp-ver-os').onclick = () => abrirOS(ped.id);
}

// Outra aba pode ter mudado pedidos/clientes: rele o que esta gravado antes de cada leitura
function _expRecarregar() {
    try {
        const ped = JSON.parse(localStorage.getItem('sc_ped'));
        const cli = JSON.parse(localStorage.getItem('sc_cli'));
        if (Array.isArray(ped)) db.pedidos = ped;
        if (Array.isArray(cli)) db.clientes = cli;
    } catch (e) { /* mantem o que esta em memoria */ }
}

function processarLeituraExpedicao(texto) {
    _expRecarregar();
    const ativo = _expAtivoId();
    // status normalizado: legado que vira Orcamento tambem nao abre conferencia
    const pedidos = db.pedidos.map(p => Object.assign({}, p, { status: normalizarStatus(p.status) }));
    const r = EtiquetasCore.avaliarLeitura(String(texto || '').trim(), ativo, pedidos);
    const ped = r.pedidoId != null ? _expPedido(r.pedidoId) : null;
    switch (r.tipo) {
        case 'invalido':
            _expResultado('Código não reconhecido.', 'erro', false); break;
        case 'nao_encontrado':
            _expResultado(`Pedido #${r.pedidoId} não encontrado.`, 'erro', false); break;
        case 'abrir':
            _expDefinirAtivo(r.pedidoId);
            _expRenderPedido(r.pedidoId, true);
            _expResultado(`Pedido #${r.pedidoId}: bipe os ${ped.volumes} volume(s).`, 'ok', true); break;
        case 'sem_etiquetas':
            _expRenderPedido(r.pedidoId, false);
            _expResultado(`Pedido #${r.pedidoId} ainda não tem etiquetas impressas.`, 'aviso', false); break;
        case 'consulta':
            _expRenderPedido(r.pedidoId, true);
            _expResultado(`Consulta: pedido #${r.pedidoId}. Bipe o pedido impresso para conferir.`, 'aviso', true); break;
        case 'outro_pedido':
            _expResultado(`❌ Este pacote é do pedido #${r.pedidoId}, não do #${r.ativoId}!`, 'erro', false); break;
        case 'etiqueta_desatualizada':
            _expResultado(`Etiqueta desatualizada: o pedido agora tem ${ped.volumes} volume(s). Reimprima as etiquetas.`, 'erro', false); break;
        case 'repetido':
            _expResultado(`Volume ${r.volume}/${ped.volumes} já foi conferido.`, 'aviso', false); break;
        case 'conferir': {
            if (!temAcesso('expedicao', 'completo')) {
                _expResultado('Você não tem permissão para conferir.', 'erro', false); break;
            }
            const nome = (getUsuarioLogado() && getUsuarioLogado().nome) || 'Usuário';
            const m = EtiquetasCore.marcarVolume(ped, r.volume, nome, Date.now());
            // grava so os pedidos: syncDB() reescreveria as demais chaves com dados desta aba
            localStorage.setItem('sc_ped', JSON.stringify(db.pedidos));
            _expRenderPedido(ped.id, true);
            _expResultado(m.concluiu
                ? `✅ Pedido #${ped.id} conferido: ${ped.volumes} volume(s).`
                : `✅ Volume ${r.volume}/${ped.volumes} conferido.`, 'ok', true);
            break;
        }
    }
}

function _expFoco() {
    const c = document.getElementById('exp-leitura');
    if (c) c.focus();
}

// Devolve o foco ao campo so quando ele esta perdido: no body ou num elemento que
// deixou de ser visivel (ex.: botao Fechar de um modal ja fechado). Nao rouba o foco
// de controle visivel (Tab, Espaco, menu do usuario) nem com algum modal aberto.
function _expRecuperarFoco() {
    if (document.querySelector('#doc-modal-overlay.active')) return;
    const sc = document.getElementById('sc-modal-overlay');
    if (sc && sc.style.display === 'flex') return;
    const ae = document.activeElement;
    const perdido = !ae || ae === document.body || ae.getClientRects().length === 0;
    if (perdido) _expFoco();
}

function iniciarExpedicao() {
    const campo = document.getElementById('exp-leitura');
    if (!campo) return;
    campo.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const valor = campo.value;
        campo.value = '';
        processarLeituraExpedicao(valor);
        _expFoco();
    });
    // o foco volta ao campo, exceto quando outro controle (modal do Ver OS) o tomou
    campo.addEventListener('blur', () => {
        setTimeout(() => {
            const ae = document.activeElement;
            if (!ae || ae === document.body) _expFoco();
        }, 50);
    });
    // fechar o modal (ou clicar fora) deixa o foco no body: recupera no clique e na primeira tecla
    document.addEventListener('click', () => setTimeout(_expRecuperarFoco, 0));
    document.addEventListener('keydown', _expRecuperarFoco, true);
    document.getElementById('exp-encerrar').addEventListener('click', () => {
        _expDefinirAtivo(null);
        _expRenderPedido(null, false);
        const r = document.getElementById('exp-resultado');
        if (r) { r.textContent = ''; r.className = 'exp-resultado'; }
        _expFoco();
    });
    // outra aba mudou pedidos/clientes: o painel do pedido ativo se atualiza
    window.addEventListener('storage', e => {
        if (e.key !== 'sc_ped' && e.key !== 'sc_cli') return;
        _expRecarregar();
        const id = _expAtivoId();
        if (id != null && _expPedido(id)) _expRenderPedido(id, true);
    });
    // pedido ativo de antes do recarregamento volta ao painel
    const ativo = _expAtivoId();
    if (ativo != null && _expPedido(ativo)) _expRenderPedido(ativo, true);
    else _expDefinirAtivo(null);
    _expFoco();
}
