// Semeia uma sessao autenticada. O SCTech redireciona para login.html quando
// nao ha sessao, entao todo teste de tela precisa disto antes de navegar.
// Papel 1 = Administrador (vem de papeisPadrao(), com tudo em "completo").
async function entrar(page, base, extras) {
    // Nunca usa a rede real: mapas/rotas ficam fora do ar, a menos que o teste simule com page.route (que tem prioridade).
    await page.context().route(/nominatim\.openstreetmap\.org|router\.project-osrm\.org/, r => r.abort());
    await page.goto(base + '/login.html');
    await page.evaluate(dados => {
        localStorage.setItem('sc_usr', JSON.stringify([{
            id: 1, nome: 'Teste', email: 'teste@sctech.local',
            papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: ''
        }]));
        sessionStorage.setItem('sc_user', JSON.stringify({ id: 1, email: 'teste@sctech.local' }));
        // Os kits de fixação padrão nascem na primeira carga do app (a propria
        // login.html ja os criou). Os testes partem sem eles, como antes; quem
        // quer testar a criação apaga esta marca (ver kits-fixacao.spec.js).
        localStorage.setItem('sc_kits_fixacao_padrao', '1');
        if (!dados || !('sc_kits' in dados)) localStorage.setItem('sc_kits', '[]');
        Object.entries(dados || {}).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }, extras || {});
}

// Menu "⋮" (menuAcoesHtml) dentro de um card/linha: abre e devolve o menu flutuante.
async function abrirMenuAcoes(page, escopo) {
    await escopo.locator('.btn-kebab').first().click();
    const menu = page.locator('#menu-acoes-flutuante');
    await menu.waitFor();
    return menu;
}
// Abre o menu do card/linha e clica na acao pelo rotulo.
async function acaoMenu(page, escopo, rotulo) {
    const menu = await abrirMenuAcoes(page, escopo);
    await menu.locator('.menu-acoes-item', { hasText: rotulo }).click();
}

// Financeiro novo (Lancamentos): abre a aba e o lado ('pagar' | 'receber') com o periodo vazio, para a lista
// mostrar tudo (o padrao da tela e o mes atual).
async function abrirLancamentos(page, lado) {
    await page.locator('.fin-tab-btn[data-tab="lancamentos"]').click();
    await page.locator('.fin-lado-btn[data-lado="' + lado + '"]').click();
    await page.fill('#lanc-de', '');
    await page.fill('#lanc-ate', '');
}
// Linhas do lado que mostram a acao no menu "⋮": Dar baixa (nem paga nem cancelada), Estornar (paga).
// Qualquer outra acao: todas as linhas (ou as de `linha`, texto da linha).
function linhasLanc(page, lado, rotulo, linha) {
    const tr = page.locator('#tb-contas-' + lado + ' tr');
    const filtro = { 'Dar baixa': { hasNot: page.locator('.fin-badge-green, .fin-badge-gray') }, 'Estornar': { has: page.locator('.fin-badge-green') } }[rotulo] || {};
    return tr.filter(filtro).filter(linha ? { hasText: linha } : {});
}
// Clica numa acao do menu "⋮" da n-esima linha (padrao: a primeira) que a tem.
async function acaoLanc(page, lado, rotulo, { linha, n = 0 } = {}) {
    await acaoMenu(page, linhasLanc(page, lado, rotulo, linha).nth(n), rotulo);
}
// Nomes das acoes do menu "⋮" de uma linha (abre e fecha).
async function acoesDaLinha(page, escopo) {
    const menu = await abrirMenuAcoes(page, escopo);
    const nomes = (await menu.locator('.menu-acoes-item span:last-child').allTextContents()).map(t => t.trim());
    await page.keyboard.press('Escape');
    return nomes;
}

module.exports = { entrar, abrirMenuAcoes, acaoMenu, abrirLancamentos, linhasLanc, acaoLanc, acoesDaLinha };
