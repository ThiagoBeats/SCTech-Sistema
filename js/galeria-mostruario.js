// Configurar Empresa > aba "Galeria e Mostruario": a empresa monta o que o
// instalador mostra ao cliente — fotos reais (ate 60), cores e tecidos do
// simulador e quais modelos aparecem. Cada acao grava na hora (sc_mostruario);
// os bytes das imagens ficam em GaleriaImagens.
const _gm = { m: null, podeEditar: true, disp: true, ocupado: false };

async function iniciarEditorMostruario() {
    const raiz = document.getElementById('gm-editor');
    if (!raiz) return;
    _gm.podeEditar = temAcesso('configuracoes.empresa', 'completo');
    _gm.disp = await GaleriaImagens.disponivel();
    _gm.m = lerMostruarioSalvo();
    await _gmRender();
}

function _gmGravar() {
    _gm.m = GaleriaCore.lerMostruario(_gm.m, nomesTrilhosMostruario());
    gravarMostruario(_gm.m);
}

function _gmOpcoesLiga(atual) {
    const sel = v => v === atual ? ' selected' : '';
    const op = (tipo, valor, nome) => `<option value="${escapeHtml(tipo + ':' + valor)}"${sel(tipo + ':' + valor)}>${escapeHtml(nome)}</option>`;
    return `<option value=""${sel('')}>Nenhum</option>
        <optgroup label="Pregas">${Object.entries(GaleriaCore.PREGAS).map(([k, n]) => op('prega', k, n)).join('')}</optgroup>
        <optgroup label="Persianas">${Object.entries(GaleriaCore.PERSIANAS).map(([k, n]) => op('persiana', k, n)).join('')}</optgroup>
        <optgroup label="Trilhos e varões">${_gm.m.modelos.trilhos.map(t => op('trilho', t, t)).join('')}</optgroup>`;
}

async function _gmRender() {
    const raiz = document.getElementById('gm-editor');
    const m = _gm.m, G = GaleriaCore;
    const n = m.fotos.length, cheio = n >= G.LIMITE_FOTOS;
    const podeFotos = _gm.podeEditar && _gm.disp && !cheio && !_gm.ocupado;
    const dis = c => c ? '' : ' disabled';
    const grupos = sel => G.GRUPOS.map(g => `<option value="${g.id}"${g.id === sel ? ' selected' : ''}>${escapeHtml(g.nome)}</option>`).join('');
    const urls = {};
    if (_gm.disp) {
        for (const f of m.fotos) urls[f.imagemId] = await GaleriaImagens.url(f.imagemId);
        for (const c of m.cores) if (c.texturaId) urls[c.texturaId] = await GaleriaImagens.url(c.texturaId);
    }
    const grupoNovo = (document.getElementById('gm-grupo-novo') || {}).value || 'pregas';
    const liga = f => f.liga ? f.liga.tipo + ':' + f.liga.valor : '';
    const caixa = (tipo, valor, nome, lista) => `<label class="gm-check"><input type="checkbox" class="gm-modelo" data-tipo="${tipo}" value="${escapeHtml(valor)}"${lista.includes(valor) ? ' checked' : ''}${dis(_gm.podeEditar)}> ${escapeHtml(nome)}</label>`;

    raiz.innerHTML = `
        ${_gm.disp ? '' : '<div class="gm-aviso">⚠️ Este navegador não permite guardar fotos (pode ser uma janela anônima). As cores sem foto de tecido e os modelos continuam funcionando.</div>'}
        <section class="gm-secao">
            <div class="gm-secao-topo">
                <h4>Fotos da galeria <span class="gm-contador">${n}/${G.LIMITE_FOTOS}</span></h4>
                <div class="gm-envio">
                    <label class="gm-envio-rotulo">Enviar para <select id="gm-grupo-novo"${dis(podeFotos)}>${grupos(grupoNovo)}</select></label>
                    <label id="gm-enviar-fotos" class="btn btn-success btn-sm${podeFotos ? '' : ' gm-desligado'}" aria-disabled="${podeFotos ? 'false' : 'true'}" for="gm-fotos-input">
                        ${_gm.ocupado ? 'Enviando…' : '📷 Enviar fotos'}
                    </label>
                    <input type="file" id="gm-fotos-input" accept="image/*" multiple hidden${dis(podeFotos)}>
                </div>
            </div>
            ${cheio ? `<p class="gm-dica gm-limite">Limite de ${G.LIMITE_FOTOS} fotos atingido. Remova alguma para enviar outra.</p>` : ''}
            <p class="gm-dica">Fotos de cortinas e persianas instaladas${G.SIMULADOR_ATIVO ? '. Ligue a foto a um modelo para o botão "Simular na parede do cliente" já abrir com ele' : ''}.</p>
            <div class="gm-fotos">${m.fotos.map(f => `
                <div class="gm-foto" data-id="${escapeHtml(f.id)}">
                    <div class="gm-foto-img">${urls[f.imagemId] ? `<img src="${urls[f.imagemId]}" alt="">` : '<span>sem imagem</span>'}</div>
                    <div class="gm-foto-campos">
                        <select class="gm-foto-grupo" aria-label="Grupo"${dis(_gm.podeEditar)}>${grupos(f.grupo)}</select>
                        <input class="gm-foto-legenda" placeholder="Legenda (opcional)" value="${escapeHtml(f.legenda)}" maxlength="80"${dis(_gm.podeEditar)}>
                        ${G.SIMULADOR_ATIVO ? `<label class="gm-foto-liga-rotulo">Simular com <select class="gm-foto-liga"${dis(_gm.podeEditar)}>${_gmOpcoesLiga(liga(f))}</select></label>` : ''}
                    </div>
                    <button type="button" class="gm-foto-remover" title="Remover foto" aria-label="Remover foto"${dis(_gm.podeEditar)}>🗑</button>
                </div>`).join('') || '<p class="gm-vazio">Nenhuma foto ainda.</p>'}
            </div>
        </section>
        ${G.SIMULADOR_ATIVO ? `<section class="gm-secao">
            <h4>Cores e tecidos</h4>
            <p class="gm-dica">As opções da aba "Cor" do simulador. A foto do tecido é opcional; sem ela, vale a cor.${m.cores.length ? '' : ' Enquanto não houver nenhuma, o simulador usa 6 cores neutras.'}</p>
            <div class="gm-nova-cor">
                <input id="gm-cor-nome" placeholder="Nome (ex.: Linho cru)" maxlength="40"${dis(_gm.podeEditar)}>
                <input id="gm-cor-hex" type="color" value="#c8b48a" aria-label="Cor"${dis(_gm.podeEditar)}>
                <label class="gm-arquivo">Foto do tecido <input id="gm-cor-textura" type="file" accept="image/*"${dis(_gm.podeEditar && _gm.disp)}></label>
                <button type="button" id="gm-cor-adicionar" class="btn btn-outline btn-sm"${dis(_gm.podeEditar && !_gm.ocupado)}>+ Adicionar</button>
            </div>
            <div class="gm-cores">${m.cores.map(c => `
                <div class="gm-cor" data-id="${escapeHtml(c.id)}">
                    <span class="gm-cor-amostra" style="background:${c.hex}${urls[c.texturaId] ? `;background-image:url('${urls[c.texturaId]}')` : ''}"></span>
                    <span class="gm-cor-nome">${escapeHtml(c.nome || c.hex)}</span>
                    <button type="button" class="gm-cor-remover" title="Remover" aria-label="Remover ${escapeHtml(c.nome)}"${dis(_gm.podeEditar)}>✕</button>
                </div>`).join('')}
            </div>
        </section>
        <section class="gm-secao">
            <h4>Modelos que aparecem</h4>
            <p class="gm-dica">Desmarque o que a empresa não trabalha: some do simulador.</p>
            <div class="gm-modelos">
                <div><strong>Pregas</strong>${Object.entries(G.PREGAS).map(([k, nm]) => caixa('prega', k, nm, m.modelos.pregas)).join('')}</div>
                <div><strong>Persianas</strong>${Object.entries(G.PERSIANAS).map(([k, nm]) => caixa('persiana', k, nm, m.modelos.persianas)).join('')}</div>
                <div><strong>Trilhos e varões</strong>${nomesTrilhosMostruario().map(t => caixa('trilho', t, t, m.modelos.trilhos)).join('')}</div>
            </div>
        </section>` : ''}`;
    _gmLigar(raiz);
}

function _gmLigar(raiz) {
    const inp = raiz.querySelector('#gm-fotos-input');
    if (inp) inp.addEventListener('change', () => _gmEnviarFotos(inp.files));
    raiz.querySelectorAll('.gm-foto').forEach(el => {
        const f = () => _gm.m.fotos.find(x => x.id === el.dataset.id);
        el.querySelector('.gm-foto-grupo').addEventListener('change', e => { f().grupo = e.target.value; _gmGravar(); });
        el.querySelector('.gm-foto-legenda').addEventListener('change', e => { f().legenda = e.target.value.trim(); _gmGravar(); });
        const ligaSel = el.querySelector('.gm-foto-liga');
        if (ligaSel) ligaSel.addEventListener('change', e => {
            const v = e.target.value, i = v.indexOf(':');
            f().liga = v ? { tipo: v.slice(0, i), valor: v.slice(i + 1) } : null;
            _gmGravar();
        });
        el.querySelector('.gm-foto-remover').addEventListener('click', () => _gmRemoverFoto(el.dataset.id));
    });
    const addCor = raiz.querySelector('#gm-cor-adicionar');
    if (addCor) addCor.addEventListener('click', _gmAdicionarCor);
    raiz.querySelectorAll('.gm-cor-remover').forEach(b => b.addEventListener('click', () => _gmRemoverCor(b.closest('.gm-cor').dataset.id)));
    raiz.querySelectorAll('.gm-modelo').forEach(c => c.addEventListener('change', () => {
        const tipo = c.dataset.tipo, sel = `.gm-modelo[data-tipo="${tipo}"]`;
        if (tipo === 'trilho') {
            _gm.m.modelos.trilhosOcultos = [...raiz.querySelectorAll(sel + ':not(:checked)')].map(x => x.value);
        } else {
            _gm.m.modelos[tipo === 'prega' ? 'pregas' : 'persianas'] = [...raiz.querySelectorAll(sel + ':checked')].map(x => x.value);
        }
        _gmGravar();
    }));
}

async function _gmEnviarFotos(arquivos) {
    if (!_gm.podeEditar || !_gm.disp || _gm.ocupado) return;
    const G = GaleriaCore;
    const lista = [...(arquivos || [])].filter(a => /^image\//.test(a.type));
    const restam = G.LIMITE_FOTOS - _gm.m.fotos.length;
    if (!lista.length || restam <= 0) return;
    if (lista.length > restam) toast(`Só cabem mais ${restam} foto(s); as demais ficaram de fora.`, 'warning', 4500);
    const grupo = (document.getElementById('gm-grupo-novo') || {}).value || 'pregas';
    _gm.ocupado = true;
    await _gmRender();
    let falhas = 0;
    for (const a of lista.slice(0, restam)) {
        try {
            const blob = await GaleriaImagens.reduzirImagem(a, G.MAX_FOTO);
            const imagemId = await GaleriaImagens.salvar(blob);
            _gm.m.fotos.push({ id: 'f-' + imagemId, grupo, imagemId, legenda: '', liga: null });
            _gmGravar();
        } catch (e) { falhas++; }
    }
    _gm.ocupado = false;
    if (falhas) toast(`${falhas} foto(s) não puderam ser lidas.`, 'error', 4500);
    await _gmRender();
}

async function _gmRemoverFoto(id) {
    const f = _gm.m.fotos.find(x => x.id === id);
    if (!f || !await showConfirm('Remover esta foto da galeria?', '🗑', 'Remover')) return;
    _gm.m.fotos = _gm.m.fotos.filter(x => x.id !== id);
    _gmGravar();
    try { await GaleriaImagens.remover(f.imagemId); } catch (e) { /* a foto ja nao aparece; sobra so o arquivo */ }
    await _gmRender();
}

async function _gmAdicionarCor() {
    if (!_gm.podeEditar || _gm.ocupado) return;
    const nome = document.getElementById('gm-cor-nome').value.trim();
    const hex = document.getElementById('gm-cor-hex').value;
    const arq = (document.getElementById('gm-cor-textura').files || [])[0];
    if (!nome) { toast('Dê um nome à cor ou tecido.', 'warning'); document.getElementById('gm-cor-nome').focus(); return; }
    let texturaId = null;
    if (arq) {
        _gm.ocupado = true;
        try { texturaId = await GaleriaImagens.salvar(await GaleriaImagens.reduzirImagem(arq, GaleriaCore.MAX_TEXTURA)); }
        catch (e) { toast('Não foi possível ler a foto do tecido; a cor entrou sem ela.', 'warning', 4500); }
        _gm.ocupado = false;
    }
    _gm.m.cores.push({ id: 'cor-' + Date.now().toString(36), nome, hex, texturaId });
    _gmGravar();
    await _gmRender();
}

async function _gmRemoverCor(id) {
    const c = _gm.m.cores.find(x => x.id === id);
    if (!c || !await showConfirm(`Remover "${c.nome}" do mostruário?`, '🗑', 'Remover')) return;
    _gm.m.cores = _gm.m.cores.filter(x => x.id !== id);
    _gmGravar();
    if (c.texturaId) { try { await GaleriaImagens.remover(c.texturaId); } catch (e) { /* idem */ } }
    await _gmRender();
}
