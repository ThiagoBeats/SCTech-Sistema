// Configuracoes em sub-abas (Meu Perfil, Preferencias, Seguranca, Acessos so do
// Administrador), papel Gerente, total de compras por fornecedor, logo da
// empresa na barra lateral, maiusculas nos dados da empresa, menu de acoes dos
// pedidos e a Galeria aberta por cima do pedido.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const AMB = [{ id: 1, amb: 'Sala', calculado: true, tecidos: [] }];

// --- Configuracoes ---------------------------------------------------------

test('Configuracoes tem Meu Perfil, Preferencias, Seguranca e Acessos (com Usuarios e Papeis dentro)', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html');
    await expect(page.locator('.cfg-tab-btn:visible')).toHaveText(['👤 Meu Perfil', '⚙️ Preferências do Sistema', '🔒 Segurança', '🛡️ Acessos']);
    await expect(page.locator('#cfg-perfil')).toBeVisible();
    await page.click('.cfg-tab-btn[data-tab="acessos"]');
    await expect(page.locator('#tb-usuarios')).toBeVisible();
    await page.click('.cfg-subnav-btn[data-sub="papeis"]');
    await expect(page.locator('#tb-papeis')).toContainText('Gerente');
});

test('quem nao e Administrador nao ve Acessos, nem pelo endereco', async ({ page }) => {
    await entrar(page, BASE);
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr')); u[0].papel_id = 6;   // Gerente
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/configuracoes.html#usuarios');
    await expect(page.locator('#cfg-tab-acessos')).toBeHidden();
    await expect(page.locator('#cfg-perfil')).toBeVisible();
    await expect(page.locator('#tb-usuarios')).toBeHidden();
});

test('papel sem acesso a Configuracoes ainda abre o proprio perfil', async ({ page }) => {
    await entrar(page, BASE);
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr')); u[0].papel_id = 5;   // Instalacao
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#main-sidebar a.nav-item[href="configuracoes.html"]')).toBeVisible();
    await page.goto(BASE + '/configuracoes.html');
    expect(page.url()).toContain('configuracoes.html');
    await expect(page.locator('#cfg-perfil')).toBeVisible();
});

test('Meu Perfil grava nome de exibicao, telefone e foto, e o popup mostra', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html');
    await page.fill('#perfil-nome', 'Thiago');
    await page.locator('#perfil-tel').pressSequentially('47999991234');
    await expect(page.locator('#perfil-tel')).toHaveValue('(47) 99999-1234');
    const png = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 60; c.height = 60;
        c.getContext('2d').fillStyle = '#c33'; c.getContext('2d').fillRect(0, 0, 60, 60);
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('#perfil-foto-input', { name: 'eu.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('#perfil-foto-preview img')).toBeVisible();
    await page.click('button:has-text("Salvar perfil")');
    const u = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_usr'))[0]);
    expect(u.nome_exibicao).toBe('Thiago');
    expect(u.telefone).toBe('(47) 99999-1234');
    expect(u.foto_base64).toMatch(/^data:image\//);
    expect(u.nome, 'o nome do cadastro nao muda').toBe('Teste');
    await page.reload();
    await page.click('#main-sidebar .logo');
    await expect(page.locator('#popup-user-name')).toHaveText('Thiago');
    await expect(page.locator('.logo-popup-avatar img')).toHaveCount(1);
});

test('Preferencias: tema escuro e notificacoes sao do usuario', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html#preferencias');
    await page.check('input[name="pref-tema"][value="dark"]', { force: true });
    await page.check('input[name="pref-notif"][value="nenhuma"]');
    await page.uncheck('#pref-som');
    await page.click('button:has-text("Salvar preferências")');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const pref = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_usr'))[0].preferencias);
    expect(pref).toEqual({ tema: 'dark', notificacoes: 'nenhuma', som: false });
    await page.evaluate(() => localStorage.setItem('sc_tema', 'light'));
    await page.goto(BASE + '/index.html');
    await expect(page.locator('html'), 'a preferencia do usuario vence a do navegador').toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => somNotificacaoAtivo())).toBe(false);
});

test('Preferencia "nenhuma" esconde os alertas do painel', async ({ page }) => {
    await entrar(page, BASE, {
        sc_ped: [{ id: 26001, clienteId: 1, clienteNome: 'Ana', status: 'Na Costura', valor: 100, ambientes: AMB, data_entrega: '2020-01-01' }]
    });
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#dashboard-alertas')).toContainText('entrega(s) atrasada(s)');
    await page.evaluate(() => {
        const u = JSON.parse(localStorage.getItem('sc_usr')); u[0].preferencias = { notificacoes: 'nenhuma' };
        localStorage.setItem('sc_usr', JSON.stringify(u));
    });
    await page.reload();
    await expect(page.locator('#dashboard-alertas')).toContainText('Alertas desligados');
});

test('Seguranca: troca a senha conferindo a atual', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html#seguranca');
    await page.evaluate(async () => {
        const u = JSON.parse(localStorage.getItem('sc_usr')); u[0].senha_hash = await hashSenha('velha123');
        localStorage.setItem('sc_usr', JSON.stringify(u)); db.usuarios = u;
    });
    await page.fill('#seg-senha-atual', 'errada');
    await page.fill('#seg-senha-nova', 'nova1234');
    await page.fill('#seg-senha-conf', 'nova1234');
    await page.click('button:has-text("Alterar senha")');
    await expect(page.locator('#seg-erro')).toHaveText('A senha atual está incorreta.');
    await page.fill('#seg-senha-atual', 'velha123');
    await page.fill('#seg-senha-conf', 'outra999');
    await page.click('button:has-text("Alterar senha")');
    await expect(page.locator('#seg-erro')).toHaveText('A confirmação não confere com a nova senha.');
    await page.fill('#seg-senha-conf', 'nova1234');
    await page.click('button:has-text("Alterar senha")');
    await expect(page.locator('#seg-erro')).toBeHidden();
    const ok = await page.evaluate(async () => JSON.parse(localStorage.getItem('sc_usr'))[0].senha_hash === await hashSenha('nova1234'));
    expect(ok).toBe(true);
});

test('Gerente: nasce com acesso completo e entra uma vez so nas instalacoes antigas', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => {
        const pap = papeisPadrao().filter(p => p.nome !== 'Gerente');
        localStorage.setItem('sc_pap', JSON.stringify(pap));
        localStorage.removeItem('sc_papel_gerente');
    });
    await page.reload();
    const g = await page.evaluate(() => db.papeis.find(p => p.nome === 'Gerente'));
    expect(g).toBeTruthy();
    expect(Object.values(g.permissoes).every(p => p.nivel === 'completo')).toBe(true);
    await page.evaluate(() => { db.papeis = db.papeis.filter(p => p.nome !== 'Gerente'); syncDB(); });
    await page.reload();
    expect(await page.evaluate(() => db.papeis.some(p => p.nome === 'Gerente')), 'excluido nao volta').toBe(false);
});

test('o papel Administrador nao pode ser excluido', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html#papeis');
    await page.locator('#tb-papeis tr', { hasText: 'Administrador' }).locator('button[title="Excluir"]').click();
    await expect(page.locator('#sc-modal-msg')).toContainText('não pode ser excluído');
});

// --- Empresa, barra lateral e fornecedores ----------------------------------

test('razao social e nome fantasia ficam em maiusculas ao digitar e ao salvar', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/empresa.html');
    await page.locator('#emp-razao').pressSequentially('cortinas são joão ltda');
    await page.locator('#emp-fantasia').pressSequentially('sc decor');
    await expect(page.locator('#emp-razao')).toHaveValue('CORTINAS SÃO JOÃO LTDA');
    await expect(page.locator('#emp-fantasia')).toHaveValue('SC DECOR');
    await page.evaluate(() => salvarEmpresaConfigs());
    const emp = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_empresa')));
    expect(emp.razao_social).toBe('CORTINAS SÃO JOÃO LTDA');
    expect(emp.nome_fantasia).toBe('SC DECOR');
});

test('a barra lateral mostra a logo e o nome da empresa; o clique na logo abre o menu de sempre', async ({ page }) => {
    await entrar(page, BASE, { sc_empresa: { razao_social: 'X LTDA', nome_fantasia: 'CASA DAS CORTINAS', logo_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } });
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#main-sidebar .sidebar-logo-empresa')).toHaveAttribute('src', /^data:image\/png/);
    await expect(page.locator('#main-sidebar .sidebar-logo-empresa')).toHaveAttribute('alt', 'CASA DAS CORTINAS');
    await expect(page.locator('#main-sidebar .sidebar-nome-empresa'), 'a logo ja traz o nome').toHaveCount(0);
    await page.click('#main-sidebar .logo');
    await expect(page.locator('#logo-popup')).toHaveClass(/open/);
    await expect(page.locator('#logo-popup')).toContainText('Sair');
});

test('sem logo cadastrada, continua a do SCTech', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await expect(page.locator('#main-sidebar .sidebar-logo-img')).toHaveAttribute('src', 'images/logo.png');
});

test('fornecedores: total de compras soma so pedidos enviados ou recebidos daquele fornecedor', async ({ page }) => {
    const it = v => [{ tipo: 'material', nome: 'X', quantidade: 1, preco_unit: v, subtotal: v }];
    await entrar(page, BASE, {
        sc_forn: [{ id: 1, nome: 'Tecidos Alfa' }, { id: 2, nome: 'Trilhos Beta' }],
        sc_pc: [
            { id: 1, fornecedor_id: 1, fornecedor_nome: 'Tecidos Alfa', status: 'Enviado', data_criacao: 1, itens: it(100) },
            { id: 2, fornecedor_id: 1, fornecedor_nome: 'Tecidos Alfa', status: 'Recebido', data_criacao: 2, itens: it(250.5) },
            { id: 3, fornecedor_id: 1, fornecedor_nome: 'Tecidos Alfa', status: 'Rascunho', data_criacao: 3, itens: it(999) },
            { id: 4, fornecedor_id: 0, fornecedor_nome: 'Orçamento — sem fornecedor definido', status: 'Enviado', data_criacao: 4, itens: it(777) }
        ]
    });
    await page.goto(BASE + '/fornecedores.html');
    await expect(page.locator('#tb-fornecedores').locator('..').locator('thead')).toContainText('Total de compras');
    const linha = nome => page.locator('#tb-fornecedores tr', { hasText: nome }).locator('.forn-total-compras');
    await expect(linha('Tecidos Alfa')).toContainText('R$ 350,50');
    await expect(linha('Tecidos Alfa')).toContainText('2 pedido(s)');
    await expect(linha('Trilhos Beta')).toContainText('R$ 0,00');
});

// --- Pedidos: menu de acoes --------------------------------------------------

test('a coluna Acao dos pedidos tem so os tres pontos; as acoes ficam no menu', async ({ page }) => {
    await entrar(page, BASE, { sc_ped: [{ id: 26001, clienteId: 1, clienteNome: 'Ana', status: 'Orçamento', valor: 100, ambientes: AMB }] });
    await page.goto(BASE + '/pedidos.html');
    const linha = page.locator('#tb-pedidos tr', { hasText: 'Ana' });
    await expect(linha.locator('td').last().locator('button')).toHaveCount(1);
    await linha.locator('.btn-kebab').click();
    const menu = page.locator('#menu-acoes-flutuante');
    const nomes = ['Aprovar pedido', 'Editar pedido', 'Gerar proposta', 'Ver Ordem de Serviço', 'Imprimir etiquetas', 'Ver timeline', 'Excluir pedido'];
    await expect(menu.locator('.menu-acoes-item')).toHaveText(nomes.map(n => new RegExp(n + '$')));
    await expect(menu.locator('.menu-acoes-item', { hasText: 'Imprimir etiquetas' }), 'orcamento: etiqueta travada').toHaveClass(/bloqueado/);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await linha.locator('.btn-kebab').click();
    await page.locator('#menu-acoes-flutuante .menu-acoes-item', { hasText: 'Ver timeline' }).click();
    await expect(page.locator('#menu-acoes-flutuante')).toHaveCount(0);
});

// --- Galeria dentro do pedido ------------------------------------------------

test('a Galeria abre por cima do pedido, sem perder o que foi digitado, e aplica a prega escolhida', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/pedido.html');
    const amb = await page.evaluate(() => pedidoDraft.ambientes[0].id);
    await page.fill(`#a-amb-${amb}`, 'Quarto do casal');
    await page.click('.btn-galeria-pedido');
    await expect(page.locator('#galped')).toBeVisible();
    await expect(page.locator('#galped .galped-modelo[data-prega]')).toHaveCount(6);
    await expect(page.locator('#galped-alvo option')).toHaveText(['Quarto do casal']);
    await page.locator('#galped .galped-modelo[data-prega="Wave Botao"]').click();
    await expect(page.locator('#galped-escolha')).toContainText('Wave Botão');
    await expect(page.locator('#galped .galped-modelo[data-prega="Wave Botao"] img'), 'imagem do modelo gerada').toHaveCount(1, { timeout: 20000 });
    await page.click('#galped-aplicar');
    await expect(page.locator('#galped')).toBeHidden();
    await expect(page.locator(`#t-prega-${amb}-0`)).toHaveValue('Wave Botao');
    await expect(page.locator(`#t-fator-${amb}-0`)).toHaveValue('2.0');
    await expect(page.locator(`#a-amb-${amb}`), 'o pedido nao foi fechado').toHaveValue('Quarto do casal');
    expect(page.url()).toContain('pedido.html');
});

test('o icone ao lado de Tipo de Prega abre a Galeria ja apontando para aquele tecido', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/pedido.html');
    const amb = await page.evaluate(() => pedidoDraft.ambientes[0].id);
    await page.evaluate(id => adicionarTecidoAoAmbiente(id), amb);
    await page.locator(`#amb-card-${amb} .link-galeria`).nth(1).click();
    await expect(page.locator('#galped-alvo')).toHaveValue('1');
    await page.locator('#galped .galped-modelo[data-prega="Franzido"]').click();
    await page.click('#galped-aplicar');
    await expect(page.locator(`#t-prega-${amb}-1`)).toHaveValue('Franzido');
    await expect(page.locator(`#t-prega-${amb}-0`)).toHaveValue('Americana');
});

test('o simulador abre dentro do pedido e o "← Galeria" volta para a galeria com o modelo simulado', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/pedido.html');
    await page.click('.btn-galeria-pedido');
    await page.locator('#galped .galped-modelo[data-prega="Wave Plus"] .galped-modelo-sim').click();
    await expect(page.locator('#sim')).toBeVisible();
    expect(await page.evaluate(() => window._sim.estado.prega)).toBe('Wave Plus');
    await page.evaluate(() => { window._sim.estado.prega = 'Americana'; });
    await page.click('#sim .sim-voltar');
    await expect(page.locator('#sim')).toBeHidden();
    await expect(page.locator('#galped')).toBeVisible();
    await expect(page.locator('#galped-escolha')).toContainText('Prega Americana');
    expect(page.url()).toContain('pedido.html');
    await page.keyboard.press('Escape');
    await expect(page.locator('#galped')).toBeHidden();
});
