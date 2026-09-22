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
        Object.entries(dados || {}).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }, extras || {});
}

module.exports = { entrar };
