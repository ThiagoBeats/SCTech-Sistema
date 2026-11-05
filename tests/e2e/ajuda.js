// Semeia uma sessao autenticada. O SCTech redireciona para login.html quando
// nao ha sessao, entao todo teste de tela precisa disto antes de navegar.
// Papel 1 = Administrador (vem de papeisPadrao(), com tudo em "completo").
async function entrar(page, base, extras) {
    await page.goto(base + '/login.html');
    await page.evaluate(dados => {
        localStorage.setItem('sc_usr', JSON.stringify([{
            id: 1, nome: 'Teste', email: 'teste@sctech.local',
            papel_id: 1, ativo: true, permissoes_extras: {}, senha_hash: ''
        }]));
        sessionStorage.setItem('sc_user', JSON.stringify({ id: 1 }));
        // Os kits de fixação padrão nascem na primeira carga do app (a propria
        // login.html ja os criou). Os testes partem sem eles, como antes; quem
        // quer testar a criação apaga esta marca (ver kits-fixacao.spec.js).
        localStorage.setItem('sc_kits_fixacao_padrao', '1');
        if (!dados || !('sc_kits' in dados)) localStorage.setItem('sc_kits', '[]');
        Object.entries(dados || {}).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }, extras || {});
}

module.exports = { entrar };
