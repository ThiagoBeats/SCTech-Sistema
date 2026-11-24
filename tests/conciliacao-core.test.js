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
