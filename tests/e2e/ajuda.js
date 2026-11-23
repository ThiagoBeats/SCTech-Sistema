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

module.exports = { entrar, abrirMenuAcoes, acaoMenu };
