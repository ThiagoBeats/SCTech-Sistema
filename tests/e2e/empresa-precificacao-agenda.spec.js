// Etapa 1 do lote: o CNPJ preenchendo a tela de empresa sozinho, essa tela
// passando a exigir permissao, a saida do "Tipo de precificacao" do pedido e o
// renome da aba de medicoes.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

const RESPOSTA_API = {
    razao_social: 'CORTINAS SC LTDA',
    estabelecimento: {
        nome_fantasia: 'SCTech Cortinas',
        tipo_logradouro: 'RUA', logradouro: 'DAS ACACIAS', numero: '450',
        bairro: 'CENTRO', cep: '89010000',
        cidade: { nome: 'Blumenau' }, estado: { sigla: 'SC' },
        ddd1: '47', telefone1: '99999-1234', email: 'contato@sctech.com.br'
    }
};

// A consulta real sai para a internet; aqui ela e interceptada para o teste
// nao depender de rede nem gastar a cota da API publica.
async function fingirApi(page, resposta) {
    await page.route('**/publica.cnpj.ws/**', rota => {
        if (resposta === 404) return rota.fulfill({ status: 404, body: '{}' });
        if (resposta === 'erro') return rota.abort();
        return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESPOSTA_API) });
    });
}

async function abrirEmpresa(page, resposta) {
    await entrar(page, BASE);
    await fingirApi(page, resposta);
    await page.goto(BASE + '/empresa.html');
}

// --- O CNPJ vem primeiro e preenche o resto ------------------------------

test('o CNPJ e o primeiro campo dos dados da empresa', async ({ page }) => {
    await abrirEmpresa(page);
    const ordem = await page.$$eval('#emp-cnpj, #emp-razao, #emp-fantasia, #emp-end, #emp-tel',
        els => els.map(e => e.id));
    expect(ordem[0], 'o CNPJ abre o formulário').toBe('emp-cnpj');
});

test('completar o CNPJ preenche os demais campos sozinho', async ({ page }) => {
    await abrirEmpresa(page);
    await page.fill('#emp-cnpj', '12345678000195');
    await expect(page.locator('#emp-cnpj-status')).toContainText('preenchidos');

    const v = await page.evaluate(() => ({
        razao: document.getElementById('emp-razao').value,
        fantasia: document.getElementById('emp-fantasia').value,
        end: document.getElementById('emp-end').value,
        tel: document.getElementById('emp-tel').value,
        email: document.getElementById('emp-email').value
    }));
    expect(v.razao).toBe('CORTINAS SC LTDA');
    expect(v.fantasia).toBe('SCTech Cortinas');
    expect(v.tel).toBe('(47) 99999-1234');
    expect(v.email).toBe('contato@sctech.com.br');
    // a tela tem um campo unico de endereco; a API devolve em partes
    expect(v.end).toContain('RUA DAS ACACIAS, 450');
    expect(v.end).toContain('Blumenau — SC');
    expect(v.end).toContain('89010000');
});

test('nao sobrescreve o que o usuario ja digitou', async ({ page }) => {
    await abrirEmpresa(page);
    await page.fill('#emp-razao', 'NOME QUE EU ESCOLHI');
    await page.fill('#emp-cnpj', '12345678000195');
    await expect(page.locator('#emp-cnpj-status')).toContainText('preenchidos');
    expect(await page.inputValue('#emp-razao'), 'o que voce digitou manda').toBe('NOME QUE EU ESCOLHI');
    expect(await page.inputValue('#emp-fantasia'), 'o que estava vazio foi preenchido').toBe('SCTech Cortinas');
});

test('CNPJ incompleto nao consulta nada', async ({ page }) => {
    await abrirEmpresa(page);
    let chamadas = 0;
    page.on('request', r => { if (r.url().includes('cnpj.ws')) chamadas++; });
    await page.fill('#emp-cnpj', '1234567800');
    await page.waitForTimeout(400);
    expect(chamadas).toBe(0);
    expect(await page.locator('#emp-cnpj-status').innerText()).toBe('');
});

test('o CNPJ completo e consultado uma vez so, nao a cada tecla', async ({ page }) => {
    await abrirEmpresa(page);
    let chamadas = 0;
    page.on('request', r => { if (r.url().includes('cnpj.ws')) chamadas++; });
    await page.fill('#emp-cnpj', '12345678000195');
    await expect(page.locator('#emp-cnpj-status')).toContainText('preenchidos');
    // `oninput` dispara a cada tecla e tambem quando a mascara reescreve o
    // campo: o numero ja consultado nao pode gerar uma segunda chamada.
    await page.evaluate(() => empresaCnpjMudou(document.getElementById('emp-cnpj')));
    await page.evaluate(() => empresaCnpjMudou(document.getElementById('emp-cnpj')));
    await page.waitForTimeout(300);
    expect(chamadas).toBe(1);
});

test('apagar um digito deixa consultar de novo', async ({ page }) => {
    await abrirEmpresa(page);
    await page.fill('#emp-cnpj', '12345678000195');
    await expect(page.locator('#emp-cnpj-status')).toContainText('preenchidos');

    // quem apaga esta corrigindo: a correcao precisa poder consultar
    await page.fill('#emp-cnpj', '1234567800019');
    expect(await page.locator('#emp-cnpj-status').innerText(), 'incompleto limpa o aviso').toBe('');
    await page.fill('#emp-cnpj', '98765432000100');
    await expect(page.locator('#emp-cnpj-status')).toContainText('preenchidos');
});

test('CNPJ inexistente avisa, e deixa tentar de novo', async ({ page }) => {
    await abrirEmpresa(page, 404);
    await page.fill('#emp-cnpj', '12345678000195');
    await expect(page.locator('#emp-cnpj-status')).toContainText('não encontrado');
    expect(await page.inputValue('#emp-razao'), 'nada foi preenchido').toBe('');
});

test('falha de conexao avisa sem derrubar a tela', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await abrirEmpresa(page, 'erro');
    await page.fill('#emp-cnpj', '12345678000195');
    await expect(page.locator('#emp-cnpj-status')).toContainText('Erro ao consultar');
    expect(erros, erros.join('\n')).toEqual([]);
});

// --- A tela de empresa exige permissao ------------------------------------

test('o administrador entra normalmente', async ({ page }) => {
    await abrirEmpresa(page);
    expect(page.url()).toContain('empresa.html');
    await expect(page.locator('#emp-cnpj')).toBeVisible();
});

test('quem nao tem Configuracoes nao entra, e nem ve o atalho', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => {
        db.usuarios[0].permissoes_extras = { configuracoes: { nivel: 'sem_acesso', acoes_restritas: [] } };
        syncDB();
    });
    await page.reload();
    expect(await page.locator('.logo-popup-item', { hasText: 'Configurar Empresa' }).count(),
        'o atalho do popup some').toBe(0);

    await page.goto(BASE + '/empresa.html');
    await page.waitForURL('**/index.html');
    expect(page.url(), 'a porta e fechada, nao so escondida').toContain('index.html');
});

test('a tela aparece na arvore de permissoes, para poder ser liberada', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/configuracoes.html');
    const chaves = await page.evaluate(() =>
        MODULOS_PERMISSAO.find(m => m.key === 'configuracoes').subs.map(s => s.key));
    expect(chaves).toContain('empresa');
});

// --- Tipo de precificacao saiu do pedido ----------------------------------

test('o campo Tipo de Precificacao nao existe mais', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/pedido.html');
    expect(await page.locator('#ped-tipo-precificacao').count()).toBe(0);
    expect(await page.locator('#ped-margem-pedido').count(), 'a margem global foi junto').toBe(0);
    expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('precificação');
});

test('o total do pedido continua somando pelos itens', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/pedido.html');
    const total = await page.evaluate(() => {
        pedidoDraft.itens = [{ materialId: 1, nome: 'X', quantidade: 2, preco_unit: 50, subtotal: 100 }];
        document.getElementById('ped-mao').value = '150';
        atualizarTotalPedido();
        return {
            itens: document.getElementById('ped-total-itens').textContent,
            final: document.getElementById('ped-total-final').textContent
        };
    });
    expect(total.itens).toBe('100.00');
    expect(total.final, '100 de itens + 150 de mão de obra').toBe('250.00');
});

test('o DRE continua lendo os pedidos antigos fechados por margem global', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    // o campo some da tela, mas o dado antigo segue valendo no DRE
    const fonte = await page.evaluate(() => fetch('js/app.js').then(r => r.text()));
    expect(fonte, 'pedido fechado com margem global guarda o proprio custo')
        .toContain("p.tipo_precificacao === 'pedido'");
});

// --- Agenda de Medicoes ----------------------------------------------------

test('a aba se chama Agenda de Medicoes', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/pcp.html');
    const abas = (await page.locator('.tab-btn').allInnerTexts()).join(' ');
    expect(abas).toContain('Agenda de Medições');
    expect(abas).not.toContain('Agendamento de Medições');
});

test('o novo nome vale tambem na arvore de permissoes', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    const label = await page.evaluate(() =>
        MODULOS_PERMISSAO.find(m => m.key === 'producao').subs.find(s => s.key === 'medicoes').label);
    expect(label).toBe('Agenda de Medições');
});

test('o documento de UM agendamento continua se chamando assim', async ({ page }) => {
    await entrar(page, BASE);
    await page.goto(BASE + '/index.html');
    // "Agendamento de Medicao" e o nome do documento impresso de um agendamento
    // especifico; a agenda e outra coisa, e so ela foi renomeada.
    const fonte = await page.evaluate(() => fetch('js/app.js').then(r => r.text()));
    expect(fonte).toContain("'Agendamento de Medição'");
});
