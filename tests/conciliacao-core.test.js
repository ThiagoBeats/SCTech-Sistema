'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../js/conciliacao-core.js');

const lerBytes = nome => fs.readFileSync(path.join(__dirname, 'fixtures', nome));
const esperadas = [
    { fitid: '202611050001', data: '2026-11-05', valor: -1200.5, descricao: 'PAGTO ALUGUÉL' },
    { fitid: '202611060002', data: '2026-11-06', valor: 2500, descricao: 'CRED PIX JOÃO DA SILVA' },
    { fitid: '202611090003', data: '2026-11-09', valor: -89.9, descricao: 'TARIFA PACOTE SERVIÇOS' }
];

test('lerOfx: SGML ISO-8859-1 (CHARSET 1252) com acento, fuso e virgula', () => {
    const bytes = lerBytes('extrato-sgml.ofx');
    assert.ok(bytes.includes(0xC9), 'fixture deve estar em latin1 (E agudo = 0xC9)');
    const r = C.lerOfx(C.decodificar(new Uint8Array(bytes)));
    assert.deepStrictEqual(r.erros, []);
    assert.deepStrictEqual(r.linhas, esperadas);
    assert.strictEqual(r.banco, '0341');
    assert.strictEqual(r.agencia, '1234');
    assert.strictEqual(r.conta, '56789-0');
});

test('lerOfx: aceita os bytes direto (decodifica sozinho)', () => {
    assert.deepStrictEqual(C.lerOfx(new Uint8Array(lerBytes('extrato-sgml.ofx'))).linhas, esperadas);
});

test('lerOfx: XML 2 tem as mesmas linhas', () => {
    const r = C.lerOfx(C.decodificar(new Uint8Array(lerBytes('extrato-xml.ofx'))));
    assert.deepStrictEqual(r.erros, []);
    assert.deepStrictEqual(r.linhas, esperadas);
    assert.strictEqual(r.conta, '56789-0');
});

test('lerOfx: texto qualquer nao e OFX', () => {
    assert.deepStrictEqual(C.lerOfx('data;valor\n2026-11-05;10').erros, ['Arquivo não reconhecido como extrato OFX.']);
    assert.deepStrictEqual(C.lerOfx('').linhas, []);
});

test('lerOfx: sem FITID gera id, NAME vira descricao, ponto e milhar', () => {
    const t = 'OFXHEADER:100\n<OFX><STMTTRN><DTPOSTED>20261107<TRNAMT>1.234,56<NAME>Deposito &amp; Cia</STMTTRN><STMTTRN><DTPOSTED>20261108<TRNAMT>-10.5<MEMO>X</STMTTRN></OFX>';
    const r = C.lerOfx(t);
    assert.strictEqual(r.linhas[0].fitid, '2026-11-07|1234.56|Deposito & Cia');
    assert.strictEqual(r.linhas[0].valor, 1234.56);
    assert.strictEqual(r.linhas[1].valor, -10.5);
});

test('lerOfx: transacao com data ou valor invalido vira erro, sem derrubar as outras', () => {
    const r = C.lerOfx('<OFX><STMTTRN><DTPOSTED>xx<TRNAMT>1</STMTTRN><STMTTRN><DTPOSTED>20261101<TRNAMT>2</STMTTRN></OFX>');
    assert.strictEqual(r.linhas.length, 1);
    assert.strictEqual(r.erros.length, 1);
});

test('decodificar: UTF-8 sem charset e latin1 invalido em UTF-8', () => {
    assert.strictEqual(C.decodificar(new Uint8Array(Buffer.from('<OFX>AÇÃO', 'utf8'))), '<OFX>AÇÃO');
    assert.strictEqual(C.decodificar(new Uint8Array(Buffer.from('<OFX>AÇÃO', 'latin1'))), '<OFX>AÇÃO');
});

test('novasLinhas: tira fitid ja importado na mesma conta, mantem de outra conta', () => {
    const ex = [{ conta_id: 'c1', fitid: '202611050001' }];
    assert.deepStrictEqual(C.novasLinhas(esperadas, ex, 'c1').map(l => l.fitid), ['202611060002', '202611090003']);
    assert.strictEqual(C.novasLinhas(esperadas, ex, 'c2').length, 3);
});

const linha = (valor, data) => ({ fitid: 'f', data: data || '2026-11-05', valor, descricao: 'x' });
const cr = (o) => Object.assign({ id: 'cr1', valor: 500, data_vencimento: '2026-11-07', status: 'Pendente', cliente_nome: 'Ana', descricao: 'Parcela 1' }, o);

test('sugestoes: CR em aberto +-5 dias casa como lancamento', () => {
    const s = C.sugestoes(linha(500), { contaId: 'c1', contasReceber: [cr()] });
    assert.strictEqual(s.length, 1);
    assert.strictEqual(s[0].tipo, 'lancamento');
    assert.deepStrictEqual(s[0].ids, ['cr1']);
    assert.strictEqual(s[0].distanciaDias, 2);
    assert.strictEqual(s[0].valor, 500);
});

test('sugestoes: fora da janela, cancelado, paga, valor ou sentido diferente nao casam', () => {
    assert.deepStrictEqual(C.sugestoes(linha(500), { contaId: 'c1', contasReceber: [cr({ data_vencimento: '2026-11-12' })] }), []);
    assert.deepStrictEqual(C.sugestoes(linha(500), { contaId: 'c1', contasReceber: [cr({ status: 'Cancelado' })] }), []);
    assert.deepStrictEqual(C.sugestoes(linha(500), { contaId: 'c1', contasReceber: [cr({ status: 'Pago' })] }), []);
    assert.deepStrictEqual(C.sugestoes(linha(500), { contaId: 'c1', contasReceber: [cr({ valor: 500.5 })] }), []);
    assert.deepStrictEqual(C.sugestoes(linha(-500), { contaId: 'c1', contasReceber: [cr()] }), []);
    assert.strictEqual(C.sugestoes(linha(500), { contaId: 'c1', contasReceber: [cr({ data_vencimento: '2026-11-10' })] }).length, 1);
});

test('sugestoes: saida casa com conta a pagar; linha -200 nao sugere CR', () => {
    const cp = { id: 'cp1', valor: 200, data_vencimento: '2026-11-04', status: 'Atrasado', credor_nome: 'Luz', descricao: 'Conta' };
    const s = C.sugestoes(linha(-200), { contaId: 'c1', contasReceber: [cr({ valor: 200 })], contasPagar: [cp] });
    assert.deepStrictEqual(s.map(x => x.ids[0]), ['cp1']);
});

test('sugestoes: movimento da conta, nao usado, vem antes do lancamento', () => {
    const mov = (o) => Object.assign({ id: 'm1', conta_id: 'c1', data: '2026-11-05', sentido: 'entrada', valor: 500 }, o);
    const ctx = { contaId: 'c1', contasReceber: [cr()], movimentos: [mov(), mov({ id: 'm2', conta_id: 'c2' }), mov({ id: 'm3', sentido: 'saida' }), mov({ id: 'm4', data: '2026-11-20' })] };
    const s = C.sugestoes(linha(500), ctx);
    assert.deepStrictEqual(s.map(x => x.tipo + ':' + x.ids[0]), ['movimento:m1', 'lancamento:cr1']);
    ctx.jaUsados = new Set(['m1']);
    assert.deepStrictEqual(C.sugestoes(linha(500), ctx).map(x => x.tipo), ['lancamento']);
});

test('sugestoes: repasse de cartao casa pelo liquido, so da conta', () => {
    const reps = [{ crId: 'cr9', data: '2026-11-04', liquido: 97.01, contaId: 'c1' }, { crId: 'cr8', data: '2026-11-04', liquido: 97.01, contaId: 'c2' }];
    const s = C.sugestoes(linha(97.01), { contaId: 'c1', repasses: reps });
    assert.strictEqual(s.length, 1);
    assert.strictEqual(s[0].tipo, 'repasse');
    assert.deepStrictEqual(s[0].ids, ['cr9']);
    assert.deepStrictEqual(C.sugestoes(linha(100), { contaId: 'c1', repasses: reps }), []);
});

test('sugestoes: tres repasses do mesmo dia (30, 40, 30) casam com +100 pela soma', () => {
    const reps = [30, 40, 30].map((v, i) => ({ crId: 'r' + i, data: '2026-11-05', liquido: v, contaId: 'c1' }));
    reps.push({ crId: 'rx', data: '2026-11-06', liquido: 7, contaId: 'c1' }, { crId: 'ry', data: '2026-11-05', liquido: 5, contaId: 'c2' });
    const s = C.sugestoes(linha(100), { contaId: 'c1', repasses: reps });
    assert.strictEqual(s.length, 1);
    assert.strictEqual(s[0].tipo, 'repasses');
    assert.deepStrictEqual(s[0].ids, ['r0', 'r1', 'r2']);
    assert.strictEqual(s[0].distanciaDias, 0);
    // outro dia alem de 1 dia da linha nao casa
    assert.deepStrictEqual(C.sugestoes(linha(100, '2026-11-08'), { contaId: 'c1', repasses: reps }), []);
});

test('sugestoes: valor unico de repasse tem prioridade sobre a soma', () => {
    const reps = [{ crId: 'a', data: '2026-11-05', liquido: 100, contaId: 'c1' }, { crId: 'b', data: '2026-11-05', liquido: 60, contaId: 'c1' }, { crId: 'c', data: '2026-11-05', liquido: 40, contaId: 'c1' }];
    assert.deepStrictEqual(C.sugestoes(linha(100), { contaId: 'c1', repasses: reps }).map(x => x.tipo), ['repasse']);
});

test('lerOfx: linhas identicas sem FITID e FITID repetido ganham sufixo estavel', () => {
    const t = 'OFXHEADER:100\n<OFX>'
        + '<STMTTRN><DTPOSTED>20261107<TRNAMT>-10,00<MEMO>PIX X</STMTTRN>'
        + '<STMTTRN><DTPOSTED>20261107<TRNAMT>-10,00<MEMO>PIX X</STMTTRN>'
        + '<STMTTRN><DTPOSTED>20261108<TRNAMT>5<FITID>X1<MEMO>a</STMTTRN>'
        + '<STMTTRN><DTPOSTED>20261109<TRNAMT>6<FITID>X1<MEMO>b</STMTTRN></OFX>';
    const ids = C.lerOfx(t).linhas.map(l => l.fitid);
    assert.deepStrictEqual(ids, ['2026-11-07|-10|PIX X', '2026-11-07|-10|PIX X#2', 'X1', 'X1#2']);
    assert.deepStrictEqual(C.lerOfx(t).linhas.map(l => l.fitid), ids);
});

test('sugestoes: jaUsados filtra movimento, lancamento e repasse por chave', () => {
    const mov = { id: 'm1', conta_id: 'c1', data: '2026-11-05', sentido: 'entrada', valor: 500 };
    const base = { contaId: 'c1', movimentos: [mov], contasReceber: [cr()], repasses: [{ crId: 'r1', data: '2026-11-05', liquido: 500, contaId: 'c1' }] };
    assert.deepStrictEqual(C.sugestoes(linha(500), base).map(x => x.tipo), ['movimento', 'lancamento', 'repasse']);
    const s = C.sugestoes(linha(500), Object.assign({}, base, { jaUsados: new Set(['mov:m1', 'cr:cr1', 'rep:r1:2026-11-05']) }));
    assert.deepStrictEqual(s, []);
    assert.deepStrictEqual(C.sugestoes(linha(500), Object.assign({}, base, { jaUsados: new Set(['m1']) })).map(x => x.tipo), ['lancamento', 'repasse']);
    const cp = { id: 'cp1', valor: 200, data_vencimento: '2026-11-04', status: 'Pendente' };
    assert.deepStrictEqual(C.sugestoes(linha(-200), { contaId: 'c1', contasPagar: [cp], jaUsados: new Set(['cp:cp1']) }), []);
});

// ---------- desempenho (entrega 3, revisao final) ----------
function massa() {
    const dia = i => '2026-' + String(1 + (i % 11)).padStart(2, '0') + '-' + String(1 + (i % 28)).padStart(2, '0');
    const movimentos = [], contasReceber = [], contasPagar = [];
    for (let i = 0; i < 5000; i++) movimentos.push({ id: i, conta_id: 1 + (i % 3), data: dia(i), sentido: i % 2 ? 'saida' : 'entrada', valor: 10 + (i % 700) + (i % 7) / 100, origem: 'cr', origem_id: i });
    for (let i = 0; i < 2500; i++) contasReceber.push({ id: i, valor: 20 + (i % 500), status: i % 4 ? 'Pendente' : 'Pago', data_vencimento: dia(i + 3), cliente_nome: 'C' + i });
    for (let i = 0; i < 2500; i++) contasPagar.push({ id: i, valor: 30 + (i % 400), status: 'Pendente', data_vencimento: dia(i + 5), credor_nome: 'F' + i });
    const linhas = [];
    for (let i = 0; i < 2000; i++) linhas.push({ id: i, conta_id: 1, fitid: 'f' + i, data: dia(i * 3), valor: (i % 2 ? -1 : 1) * (10 + (i % 700) + (i % 7) / 100), situacao: i % 3 ? 'pendente' : 'conciliado', mov_ids: i % 3 ? undefined : [i * 2, 99999 + i] });
    return { movimentos, contasReceber, contasPagar, linhas };
}

test('sugestoes: 2.000 linhas x 5.000 movimentos (e 5.000 lancamentos) em menos de 1,5 s, mesmo resultado da busca linha a linha', () => {
    const m = massa();
    const ctx = { contaId: 1, movimentos: m.movimentos, contasReceber: m.contasReceber, contasPagar: m.contasPagar, repasses: [], jaUsados: new Set() };
    const t0 = Date.now();
    const res = m.linhas.map(l => C.sugestoes(l, ctx));
    const ms = Date.now() - t0;
    assert.ok(ms < 1500, 'demorou ' + ms + ' ms');
    // Conferencia por forca bruta numa amostra: os mesmos ids, na mesma ordem.
    const cent = v => Math.round(Math.abs(v) * 100);
    const dist = (a, b) => Math.abs(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86400000;
    [0, 1, 7, 500, 1999].forEach(i => {
        const l = m.linhas[i];
        const sentido = l.valor > 0 ? 'entrada' : 'saida';
        const movs = m.movimentos.filter(x => x.conta_id === 1 && x.sentido === sentido && Math.abs(cent(x.valor) - cent(l.valor)) <= 1 && dist(x.data, l.data) <= 5).map(x => x.id);
        const lancs = (l.valor > 0 ? m.contasReceber : m.contasPagar).filter(x => x.status !== 'Pago' && Math.abs(cent(x.valor) - cent(l.valor)) <= 1 && dist(x.data_vencimento, l.data) <= 5).map(x => x.id);
        const got = res[i];
        assert.deepStrictEqual(got.filter(s => s.tipo === 'movimento').map(s => s.ids[0]).sort((a, b) => a - b), movs.sort((a, b) => a - b));
        assert.deepStrictEqual(got.filter(s => s.tipo === 'lancamento').map(s => s.ids[0]).sort((a, b) => a - b), lancs.sort((a, b) => a - b));
    });
});

test('sugestoes: o indice e refeito quando a lista de movimentos muda', () => {
    const ctx = { contaId: 1, movimentos: [], contasReceber: [], contasPagar: [], repasses: [], jaUsados: new Set() };
    const linha = { data: '2026-11-05', valor: 50 };
    assert.strictEqual(C.sugestoes(linha, ctx).length, 0);
    ctx.movimentos = [{ id: 1, conta_id: 1, data: '2026-11-05', sentido: 'entrada', valor: 50 }];
    assert.strictEqual(C.sugestoes(linha, ctx).length, 1);
});

test('linhaOrfa e conferidos: movimento sumido, baixa sem movimento, pendente antes, ignorada nao conta', () => {
    const iv = C.indiceVinculos({ movimentos: [{ id: 1 }, { id: 2 }], contasReceber: [{ id: 7, status: 'Pago' }, { id: 8, status: 'Pendente' }], contasPagar: [] });
    assert.strictEqual(C.linhaOrfa({ situacao: 'conciliado', mov_ids: [1, 2] }, iv), false);
    assert.strictEqual(C.linhaOrfa({ situacao: 'conciliado', mov_ids: [1, 3] }, iv), true);
    assert.strictEqual(C.linhaOrfa({ situacao: 'conciliado', mov_ids: [], vinculos: [{ t: 'cr', id: 7, baixa: true }] }, iv), false);
    assert.strictEqual(C.linhaOrfa({ situacao: 'conciliado', mov_ids: [], vinculos: [{ t: 'cr', id: 8, baixa: true }] }, iv), true);
    assert.strictEqual(C.linhaOrfa({ situacao: 'pendente' }, iv), false);
    const linhas = [
        { conta_id: 1, data: '2026-11-03', situacao: 'conciliado', mov_ids: [1] },
        { conta_id: 1, data: '2026-11-04', situacao: 'ignorado' },
        { conta_id: 1, data: '2026-11-05', situacao: 'transferencia', mov_ids: [2] },
        { conta_id: 1, data: '2026-11-06', situacao: 'pendente' },
        { conta_id: 1, data: '2026-11-08', situacao: 'conciliado', mov_ids: [1] },
        { conta_id: 2, data: '2026-11-02', situacao: 'conciliado', mov_ids: [9] },
        { conta_id: 3, data: '2026-11-02', situacao: 'pendente' }
    ];
    const r = C.conferidos(linhas, iv);
    assert.strictEqual(r.get('1'), '2026-11-05');
    assert.strictEqual(r.has('2'), false, 'orfa conta como pendente');
    assert.strictEqual(r.has('3'), false);
});

test('conferidos: 3.200 linhas x 5.000 movimentos em menos de 1,5 s', () => {
    const m = massa();
    const linhas = [];
    for (let i = 0; i < 3200; i++) linhas.push({ id: i, conta_id: 1 + (i % 3), data: '2026-' + String(1 + (i % 11)).padStart(2, '0') + '-10', situacao: i % 16 ? 'conciliado' : 'pendente', mov_ids: [i, i + 1, 20000 + (i % 50)] });
    const t0 = Date.now();
    const iv = C.indiceVinculos({ movimentos: m.movimentos, contasReceber: m.contasReceber, contasPagar: m.contasPagar });
    C.conferidos(linhas, iv);
    linhas.forEach(l => C.linhaOrfa(l, iv));
    const ms = Date.now() - t0;
    assert.ok(ms < 1500, 'demorou ' + ms + ' ms');
});
