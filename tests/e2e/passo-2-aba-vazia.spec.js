const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');
const PDF = path.join(RAIZ, 'docs', 'Tabela de preços RC TECIDOS PDF.pdf');

async function ateOPasso2(page, arquivo) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(() => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.removeItem('sc_imp_perfis');
    });
    await page.reload();
    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', arquivo);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba', { timeout: 60000 });
    await page.selectOption('#imp-fornecedor', '7');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Itens');
}

// Toda aba que nao produz item nenhum ja deve vir como "Ignorar", para o
// usuario nao ter de descobrir isso so no passo 3.
test('aba com zero itens ja vem como Ignorar (planilha)', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await ateOPasso2(page, PLANILHA);

    const r = await page.evaluate(() => {
        const linhas = _impEstado.planilha.ordem.map(nome => ({
            nome,
            qtd: _impContarItensDaAba(nome, _impEstado.abas[nome]),
            tipo: _impEstado.abas[nome]
        }));
        return {
            zeradasNaoIgnoradas: linhas.filter(l => l.qtd === 0 && l.tipo !== 'ignorar'),
            zeradas: linhas.filter(l => l.qtd === 0).map(l => l.nome),
            comItensIgnoradas: linhas.filter(l => l.qtd > 0 && l.tipo === 'ignorar').map(l => l.nome),
            book10: linhas.find(l => l.nome === 'Book 10')
        };
    });

    expect(r.zeradasNaoIgnoradas, 'toda aba zerada tem de vir como Ignorar').toEqual([]);
    expect(r.zeradas).toContain('Capa');
    expect(r.zeradas).toContain('Trilho Motorizado');
    // abas que produzem itens nao podem ter sido ignoradas por engano
    expect(r.comItensIgnoradas).toEqual([]);
    expect(r.book10).toEqual({ nome: 'Book 10', qtd: 38, tipo: 'tecido' });

    expect(erros, erros.join('\n')).toEqual([]);
});

test('a contagem na tela e a mesma que decide o Ignorar', async ({ page }) => {
    await ateOPasso2(page, PLANILHA);

    // le a tabela renderizada e compara com o estado
    const linhas = await page.evaluate(() => {
        return [...document.querySelectorAll('#imp-corpo tbody tr')].map(tr => {
            const td = tr.querySelectorAll('td');
            return {
                nome: td[0].textContent.trim(),
                qtd: Number(td[2].textContent.trim()),
                tipo: tr.querySelector('select').value
            };
        });
    });
    expect(linhas.length).toBe(22);
    linhas.filter(l => l.qtd === 0).forEach(l => {
        expect(l.tipo, `${l.nome} tem 0 itens e deveria estar em Ignorar`).toBe('ignorar');
    });
});

test('o usuario ainda pode tirar do Ignorar uma aba zerada', async ({ page }) => {
    await ateOPasso2(page, PLANILHA);

    const antes = await page.evaluate(() => _impEstado.abas['Trilho Motorizado']);
    expect(antes).toBe('ignorar');

    const select = page.locator('tr', { hasText: 'Trilho Motorizado' }).first().locator('select');
    await select.selectOption('material');
    const depois = await page.evaluate(() => _impEstado.abas['Trilho Motorizado']);
    expect(depois, 'a sugestao nao pode virar imposicao').toBe('material');
});

test('vale tambem para as paginas do PDF', async ({ page }) => {
    test.setTimeout(120000);
    await ateOPasso2(page, PDF);

    const r = await page.evaluate(() => {
        const linhas = _impEstado.planilha.ordem.map(nome => ({
            nome,
            qtd: _impContarItensDaAba(nome, _impEstado.abas[nome]),
            tipo: _impEstado.abas[nome]
        }));
        return {
            zeradasNaoIgnoradas: linhas.filter(l => l.qtd === 0 && l.tipo !== 'ignorar'),
            capa: linhas.find(l => l.nome === 'Página 1'),
            book10: linhas.find(l => l.nome === 'Página 3')
        };
    });

    expect(r.zeradasNaoIgnoradas).toEqual([]);
    // a pagina 1 do PDF e capa: nao produz item
    expect(r.capa.qtd).toBe(0);
    expect(r.capa.tipo).toBe('ignorar');
    // a pagina 3 e o Book 10 e continua sendo tecido
    expect(r.book10.qtd).toBe(38);
    expect(r.book10.tipo).toBe('tecido');
});
