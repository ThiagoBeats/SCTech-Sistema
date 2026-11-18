// Ocupacao unica da agenda: compromissos e bloqueios (db.agenda_eventos, chave
// sc_agd_ev) entram na mesma lista de ocupacao de medicoes e instalacoes.
const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajuda.js');

const BASE = process.env.BASE || 'http://localhost:8131';

function dia(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('sv-SE');
}
const DIA = dia(3);
const CLI = () => [{ id: 1, nome: 'Ana Paula Lima', tel: '44991234567', end: 'Av. das Palmeiras, 1000' }];
const BLOQ = () => [{ id: 'e1', prof: 'u:1', tipo: 'bloqueio', bloqueio: 'horario', data_ini: DIA, data_fim: DIA,
    hora_ini: '14:00', hora_fim: '16:00', dia_inteiro: false, descricao: 'Dentista', criado_por: 1 }];

const item = (page, hora) => page.locator('.agd-hpick .agd-hpick-item', { hasText: new RegExp('^' + hora + '$') });
const riscado = async loc => (await loc.evaluate(e => getComputedStyle(e).textDecorationLine)).includes('line-through');

test('bloqueio gravado em sc_agd_ev risca 14:00 e 15:00 na medicao', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI(), sc_agd_ev: BLOQ() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', DIA);
    await page.click('#med-hora');
    for (const h of ['14:00', '15:00']) {
        expect(await riscado(item(page, h)), h + ' riscado').toBe(true);
        await expect(item(page, h)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(await riscado(item(page, '16:00')), '16:00 livre').toBe(false);
    expect(await riscado(item(page, '13:00')), '13:00 livre').toBe(false);
});

test('ferias de varios dias ocupam todos os dias; o rotulo respeita a privacidade', async ({ page }) => {
    const ferias = [{ id: 'e2', prof: 'u:2', tipo: 'bloqueio', bloqueio: 'ferias', data_ini: dia(3), data_fim: dia(5),
        hora_ini: '', hora_fim: '', dia_inteiro: true, descricao: 'Segredo de viagem', criado_por: 2 }];
    await entrar(page, BASE, { sc_cli: CLI(), sc_agd_ev: ferias });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    const r = await page.evaluate(([d3, d5]) => ({
        dias: [d3, d5].map(d => _agdDoDia('u:2', d, null).length),
        fora: _agdDoDia('u:2', d5.slice(0, 8) + String(+d5.slice(8) + 1).padStart(2, '0'), null).length,
        rotAdmin: _agdDoDia('u:2', d3, null)[0].rotulo,
        // outro usuario (nao Admin e nao dono)
        rotOutro: (() => {
            const ant = db.usuarios; const u = db.usuarios[0]; const papelAnt = u.papel_id;
            db.papeis.push({ id: 99, nome: 'Comum', permissoes: {} }); u.papel_id = 99;
            const t = _agdDoDia('u:2', d3, null)[0].rotulo + ' | ' + _agdDescComp(_agdDoDia('u:2', d3, null)[0]);
            u.papel_id = papelAnt; db.papeis.pop(); return t;
        })()
    }), [dia(3), dia(5)]);
    expect(r.dias).toEqual([1, 1]);
    expect(r.rotAdmin).toBe('Bloqueio: Segredo de viagem');
    expect(r.rotOutro).toContain('Indisponível');
    expect(r.rotOutro).not.toContain('Segredo');
});

test('duas abas: medicao gravada em outra aba impede a mesma hora nesta', async ({ page, context }) => {
    await entrar(page, BASE, { sc_cli: CLI() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-cliente-id', '1');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', DIA);
    await page.fill('#med-hora', '10:00');

    // Outra aba grava uma medicao 10:00 do mesmo profissional (esta nao recarrega).
    const b = await context.newPage();
    await b.goto(BASE + '/pcp.html?view=medicoes');
    await b.evaluate(d => localStorage.setItem('sc_med', JSON.stringify([{ id: 777, clienteNome: 'Outro', endereco: 'X',
        data: d, hora: '10:00', duracao: 60, status: 'Agendado', usuario_id: 1 }])), DIA);

    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('body')).toContainText('já tem compromisso');
    const total = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_med')).length);
    expect(total).toBe(1);
});

test('gravacao direta (sem evento): salvar relê sc_agd_ev e recusa o bloqueio novo', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    await page.selectOption('#med-cliente-id', '1');
    await page.selectOption('#med-prof', 'u:1');
    await page.fill('#med-data', DIA);
    await page.fill('#med-hora', '14:30');
    // grava na propria aba: a memoria (db) fica desatualizada e nenhum evento storage chega
    await page.evaluate(ev => localStorage.setItem('sc_agd_ev', JSON.stringify(ev)), BLOQ());
    await page.click('button:has-text("Agendar Visita")');
    await expect(page.locator('body')).toContainText('já tem compromisso');
    const total = await page.evaluate(() => (JSON.parse(localStorage.getItem('sc_med')) || []).length);
    expect(total).toBe(0);
});

test('agenda_eventos vai para o localStorage (sc_agd_ev) ao gravar', async ({ page }) => {
    await entrar(page, BASE, { sc_cli: CLI(), sc_agd_ev: BLOQ() });
    await page.goto(BASE + '/pcp.html?view=medicoes');
    const r = await page.evaluate(() => ({ db: db.agenda_eventos.length, chaveSalva: (() => { syncDB(); return JSON.parse(localStorage.getItem('sc_agd_ev')).length; })() }));
    expect(r).toEqual({ db: 1, chaveSalva: 1 });
});
