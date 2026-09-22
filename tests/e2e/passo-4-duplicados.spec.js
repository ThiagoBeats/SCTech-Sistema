const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';
const RAIZ = process.env.RAIZ || path.join(__dirname, '..', '..');
const PLANILHA = path.join(RAIZ, 'docs', 'Tabela RC - SETEMBRO - 2024.xlsx');

// Wave-Square-Retangular repete VUD01/VUD02 na propria aba: variantes de cor
// compartilhando codigo. E o caso real que motivou o recurso.
async function ateOPasso4ComDuplicados(page, catalogoInicial) {
    await entrar(page, BASE);
    await page.goto(BASE + '/catalogo.html');
    await page.evaluate(cat => {
        localStorage.setItem('sc_forn', JSON.stringify([{ id: 7, nome: 'RC Tecidos' }]));
        localStorage.setItem('sc_cat', JSON.stringify([]));
        localStorage.setItem('sc_mat', JSON.stringify(cat || []));
        localStorage.removeItem('sc_imp_perfis');
        localStorage.removeItem('sc_imp_snap');
    }, catalogoInicial);
    await page.reload();

    await page.click('text=📥 Importar tabela');
    await page.setInputFiles('#imp-file', PLANILHA);
    await expect(page.locator('#imp-corpo')).toContainText('22 aba');
    await page.selectOption('#imp-fornecedor', '7');
    await page.fill('#imp-markup', '80');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await expect(page.locator('#imp-corpo')).toContainText('Capa');

    await page.evaluate(() => {
        Object.keys(_impEstado.abas).forEach(a => { _impEstado.abas[a] = 'ignorar'; });
        _impEstado.abas['Wave-Square-Retangular'] = 'material';
        _impRenderPasso(2);
    });
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.click('#imp-corpo button:has-text("Continuar")');
    await page.waitForFunction(() => _impEstado.passo === 4);
}

test('o painel de duplicados aparece e lista os codigos repetidos', async ({ page }) => {
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

    await ateOPasso4ComDuplicados(page);

    await expect(page.locator('#imp-corpo')).toContainText('Códigos repetidos');
    await expect(page.locator('#imp-corpo button:has-text("Diferenciar")')).toBeVisible();
    await expect(page.locator('#imp-corpo button:has-text("Descartar")')).toBeVisible();

    const dups = await page.evaluate(() => _impDuplicadosNoLote().map(d => ({ codigo: d.codigo, n: d.ocorrencias.length })));
    expect(dups.length).toBeGreaterThan(0);
    expect(dups.some(d => d.codigo === 'VUD01')).toBe(true);

    expect(erros, erros.join('\n')).toEqual([]);
});

test('diferenciar com D: primeiro mantem, demais ganham D, DD, DDD', async ({ page }) => {
    await ateOPasso4ComDuplicados(page);

    const antes = await page.evaluate(() => {
        const d = _impDuplicadosNoLote().find(x => x.codigo === 'VUD01');
        return { n: d.ocorrencias.length };
    });
    expect(antes.n).toBeGreaterThanOrEqual(3);

    await page.click('#imp-corpo button:has-text("Diferenciar")');

    const depois = await page.evaluate(() => {
        const codigos = _impLinhasMarcadas().map(l => l.entrada.item.codigo);
        const daFamilia = codigos.filter(c => /^VUD01D*$/.test(c)).sort((a, b) => a.length - b.length);
        return { daFamilia, aindaDuplicado: _impDuplicadosNoLote().length, total: codigos.length, unicos: new Set(codigos).size };
    });

    expect(depois.daFamilia[0]).toBe('VUD01');
    expect(depois.daFamilia[1]).toBe('VUD01D');
    expect(depois.daFamilia[2]).toBe('VUD01DD');
    expect(depois.aindaDuplicado, 'nao pode sobrar codigo repetido').toBe(0);
    expect(depois.unicos, 'todo codigo marcado deve ser unico').toBe(depois.total);

    // o painel some quando nao ha mais repeticao
    await expect(page.locator('#imp-corpo')).not.toContainText('Códigos repetidos');
});

test('diferenciar nao colide com codigo ja existente no catalogo', async ({ page }) => {
    // ja existe VUD01D cadastrado: o sufixo tem de pular para VUD01DD
    await ateOPasso4ComDuplicados(page, [
        { id: 900, referencia: 'VUD01D', nome: 'Ja existe', unidade: 'un', preco_custo: 10, preco: 18, estoque_atual: 0, min_estoque: 0, fornecedor_id: 99, fornecedor_nome: 'Outro' }
    ]);

    await page.click('#imp-corpo button:has-text("Diferenciar")');

    const r = await page.evaluate(() => {
        const codigos = _impLinhasMarcadas().map(l => l.entrada.item.codigo);
        return {
            usouVUD01D: codigos.includes('VUD01D'),
            daFamilia: codigos.filter(c => /^VUD01D*$/.test(c)).sort((a, b) => a.length - b.length),
            aindaDuplicado: _impDuplicadosNoLote().length
        };
    });
    expect(r.usouVUD01D, 'VUD01D ja pertence a outro produto, nao pode ser reutilizado').toBe(false);
    expect(r.daFamilia[0]).toBe('VUD01');
    expect(r.daFamilia[1]).toBe('VUD01DD');
    expect(r.aindaDuplicado).toBe(0);
});

test('descartar repetidos desmarca da segunda em diante e mantem a primeira', async ({ page }) => {
    await ateOPasso4ComDuplicados(page);

    const antes = await page.evaluate(() => ({
        marcadas: _impLinhasMarcadas().length,
        vud01: _impDuplicadosNoLote().find(d => d.codigo === 'VUD01').ocorrencias.length
    }));

    await page.click('#imp-corpo button:has-text("Descartar")');

    const depois = await page.evaluate(() => {
        const codigos = _impLinhasMarcadas().map(l => l.entrada.item.codigo);
        return {
            marcadas: codigos.length,
            vud01Marcado: codigos.filter(c => c === 'VUD01').length,
            aindaDuplicado: _impDuplicadosNoLote().length,
            // nada pode ter sido apagado dos grupos
            totalNosGrupos: _IMP_GRUPOS.reduce((n, d) => n + _impEstado.grupos[d.chave].length, 0)
        };
    });

    expect(depois.vud01Marcado, 'a primeira ocorrencia continua marcada').toBe(1);
    expect(depois.aindaDuplicado).toBe(0);
    expect(depois.marcadas).toBeLessThan(antes.marcadas);
    expect(depois.totalNosGrupos, 'descartar nao pode apagar linha').toBeGreaterThan(depois.marcadas);
});

test('depois de diferenciar, a gravacao passa e grava tudo', async ({ page }) => {
    await ateOPasso4ComDuplicados(page);

    // antes: bloqueia
    await page.click('#imp-corpo button:has-text("Gravar")');
    await expect(page.locator('#sc-modal-msg')).toContainText(/c[óo]digo/i);
    await page.click('#sc-modal-ok');

    // resolve e grava
    await page.click('#imp-corpo button:has-text("Diferenciar")');
    const esperado = await page.evaluate(() => _impLinhasMarcadas().length);

    await page.click('#imp-corpo button:has-text("Gravar")');
    await page.click('#sc-modal-ok');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_mat') || '[]').length > 0);

    const r = await page.evaluate(() => {
        const mats = JSON.parse(localStorage.getItem('sc_mat'));
        const refs = mats.map(m => m.referencia);
        return { qtd: mats.length, unicos: new Set(refs).size, temD: refs.some(r => /D$/.test(r)) };
    });
    expect(r.qtd).toBe(esperado);
    expect(r.unicos, 'nenhuma referencia repetida no catalogo').toBe(r.qtd);
    expect(r.temD).toBe(true);
});

test('as duas acoes nao destroem edicoes feitas antes', async ({ page }) => {
    await ateOPasso4ComDuplicados(page);

    // edita o custo da primeira linha marcada
    const alvo = await page.evaluate(() => {
        const l = _impLinhasMarcadas()[0];
        _impEditarCampo(l.chave, l.indice, 'preco_custo', '42');
        return { chave: l.chave, indice: l.indice };
    });

    await page.click('#imp-corpo button:has-text("Diferenciar")');

    const depois = await page.evaluate(a => _impEstado.grupos[a.chave][a.indice].item.preco_custo, alvo);
    expect(depois, 'a edicao anterior nao pode ser perdida').toBe(42);
});
