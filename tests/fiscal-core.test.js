'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../js/fiscal-core.js');

const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

test('lerXmlNota: NF-e de venda', () => {
    const r = F.lerXmlNota(fx('nfe-venda.xml'));
    assert.strictEqual(r.ok, true);
    const n = r.nota;
    assert.strictEqual(n.tipo, 'nfe');
    assert.strictEqual(n.numero, '123');
    assert.strictEqual(n.serie, '1');
    assert.strictEqual(n.chave, '35261112345678000195550010000001231000001237');
    assert.strictEqual(n.data_emissao, '2026-11-20');
    assert.strictEqual(n.valor, 3450);
    assert.strictEqual(n.emitente_doc, '12345678000195');
    assert.strictEqual(n.tomador_doc, '12345678909');
    assert.strictEqual(n.tomador_nome, 'Maria da Silva & Filhos');
    assert.strictEqual(n.cancelada, false);
});

test('lerXmlNota: NFS-e padrao nacional', () => {
    const n = F.lerXmlNota(fx('nfse-nacional.xml')).nota;
    assert.strictEqual(n.tipo, 'nfse');
    assert.strictEqual(n.numero, '72');
    assert.strictEqual(n.serie, '1');
    assert.strictEqual(n.chave, '35503082212345678000195000000000000726112345678901');
    assert.strictEqual(n.data_emissao, '2026-11-21');
    assert.strictEqual(n.valor, 3450);
    assert.strictEqual(n.emitente_doc, '12345678000195');
    assert.strictEqual(n.tomador_doc, '12345678909');
    assert.strictEqual(n.tomador_nome, 'Maria da Silva');
});

test('lerXmlNota: NFS-e ABRASF', () => {
    const n = F.lerXmlNota(fx('nfse-abrasf.xml')).nota;
    assert.strictEqual(n.tipo, 'nfse');
    assert.strictEqual(n.numero, '456');
    assert.strictEqual(n.serie, 'A1');
    assert.strictEqual(n.codigo_verificacao, 'ABCD1234');
    assert.strictEqual(n.data_emissao, '2026-11-22');
    assert.strictEqual(n.valor, 3450);
    assert.strictEqual(n.emitente_doc, '12345678000195');
    assert.strictEqual(n.tomador_doc, '12345678909');
    assert.strictEqual(n.tomador_nome, 'Maria da Silva');
    assert.strictEqual(n.cancelada, false);
});

test('lerXmlNota: prefixos de namespace (ns2:) dao o mesmo resultado', () => {
    for (const f of ['nfe-venda.xml', 'nfse-nacional.xml', 'nfse-abrasf.xml']) {
        const original = fx(f);
        const prefixado = original.replace(/<(\/?)([A-Za-z])/g, '<$1ns2:$2').replace(/<(\/?)ns2:\?/g, '<$1?').replace(/xmlns=/, 'xmlns:ns2=');
        assert.deepStrictEqual(F.lerXmlNota(prefixado), F.lerXmlNota(original), f);
    }
});

test('lerXmlNota: ABRASF cancelada e Prestador/CpfCnpj', () => {
    const x = fx('nfse-abrasf.xml')
        .replace('</CompNfse>', '<NfseCancelamento><Confirmacao><Pedido><InfPedidoCancelamento><CodigoCancelamento>1</CodigoCancelamento></InfPedidoCancelamento></Pedido></Confirmacao></NfseCancelamento></CompNfse>')
        .replace('<PrestadorServico>', '<Prestador>').replace('</PrestadorServico>', '</Prestador>')
        .replace('<IdentificacaoPrestador><Cnpj>12345678000195</Cnpj>', '<IdentificacaoPrestador><CpfCnpj><Cnpj>12345678000195</Cnpj></CpfCnpj>');
    const n = F.lerXmlNota(x).nota;
    assert.strictEqual(n.cancelada, true);
    assert.strictEqual(n.emitente_doc, '12345678000195');
});

test('lerXmlNota: evento de cancelamento de NF-e', () => {
    const ev = '<?xml version="1.0"?><procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><evento><infEvento Id="ID1101113526"><chNFe>35261112345678000195550010000001231000001237</chNFe><tpEvento>110111</tpEvento></infEvento></evento></procEventoNFe>';
    const r = F.lerXmlNota(ev);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.nota.cancelada, true);
    assert.strictEqual(r.nota.chave, '35261112345678000195550010000001231000001237');
});

test('lerXmlNota: o que nao e nota e XML quebrado', () => {
    assert.deepStrictEqual(F.lerXmlNota('<html>'), { ok: false, motivo: 'nao_e_nota' });
    assert.deepStrictEqual(F.lerXmlNota('<html><body><br>oi</body></html>'), { ok: false, motivo: 'nao_e_nota' });
    assert.deepStrictEqual(F.lerXmlNota('texto solto'), { ok: false, motivo: 'nao_e_nota' });
    assert.deepStrictEqual(F.lerXmlNota('<outra><coisa>1</coisa></outra>'), { ok: false, motivo: 'nao_e_nota' });
    const quebrado = fx('nfe-venda.xml').slice(0, 700);
    assert.deepStrictEqual(F.lerXmlNota(quebrado), { ok: false, motivo: 'xml_invalido' });
});

const pedido = { id: 7, clienteId: 1, clienteNome: 'Maria da Silva', valor: 3450, status: 'Em producao',
    ambientes: [{ amb: 'Sala', tecidos: [{ tecidoNome: 'Linho' }] }, { amb: 'Quarto', tecidos: [{ tecidoNome: 'Blackout' }] }], itens: [] };
const cliente = { id: 1, nome: 'Maria da Silva', cpf: '123.456.789-09', rua: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Campinas', uf: 'SP', cep: '13000-000', email: 'm@x.com' };
const empresa = { cnpj: '12.345.678/0001-95', razao_social: 'Cortinas Exemplo Ltda' };

test('dadosNotaDoPedido: itens e total', () => {
    const d = F.dadosNotaDoPedido({ pedido, cliente, empresa, tipo: 'nfe' });
    assert.strictEqual(d.tipo, 'nfe');
    assert.strictEqual(d.itens.length, 2);
    assert.strictEqual(d.itens[0].descricao, 'Cortina — Sala (Linho)');
    assert.strictEqual(d.valor_total, 3450);
    assert.strictEqual(d.itens.reduce((s, i) => s + i.valor_total, 0), 3450);
    assert.deepStrictEqual(d.tomador, { nome: 'Maria da Silva', doc: '12345678909', endereco: 'Rua A, 10 - Centro', cidade: 'Campinas', uf: 'SP', cep: '13000000', email: 'm@x.com' });
});

test('dadosNotaDoPedido: NFS-e com instalacao ganha item de servico; soma fecha ao centavo', () => {
    const p = Object.assign({}, pedido, { valor: 1000, inst_agendado: true });
    const d = F.dadosNotaDoPedido({ pedido: p, cliente, empresa, tipo: 'nfse' });
    assert.strictEqual(d.itens.length, 3);
    assert.strictEqual(d.itens[2].descricao, 'Serviço de instalação — Pedido #7');
    assert.strictEqual(Math.round(d.itens.reduce((s, i) => s + i.valor_total, 0) * 100), 100000);
    assert.strictEqual(F.dadosNotaDoPedido({ pedido: p, cliente, empresa, tipo: 'nfe' }).itens.length, 2);
});

test('conferir: avisos exatos', () => {
    const nota = { cancelada: false, valor: 3000, tomador_doc: '12345678909', emitente_doc: '12345678000195' };
    assert.deepStrictEqual(F.conferir(nota, { pedido, cliente, empresa }),
        ['A nota cobre R$ 3.000,00 de R$ 3.450,00 do pedido.']);
    assert.deepStrictEqual(F.conferir({ ...nota, valor: 4000 }, { pedido, cliente, empresa }),
        ['O valor da nota (R$ 4.000,00) é diferente do valor do pedido (R$ 3.450,00).']);
    assert.deepStrictEqual(F.conferir({ ...nota, valor: 3450 }, { pedido, cliente, empresa }), []);
    const a = F.conferir({ ...nota, valor: 3450, tomador_doc: '98765432100' }, { pedido, cliente, empresa });
    assert.deepStrictEqual(a, ['O CPF/CNPJ do tomador (987.654.321-00) não é o do cliente (123.456.789-09).']);
    const b = F.conferir({ ...nota, valor: 3450, emitente_doc: '11222333000181' }, { pedido, cliente, empresa });
    assert.deepStrictEqual(b, ['O emitente da nota (11.222.333/0001-81) não é a empresa (CNPJ 12.345.678/0001-95).']);
    assert.deepStrictEqual(F.conferir({ ...nota, valor: 3450, cancelada: true }, { pedido, cliente, empresa }), ['A nota já está cancelada.']);
});

test('conferir: duas notas somam o valor do pedido', () => {
    const produto = { id: 1, valor: 2000, status: 'autorizada' };
    const servico = { id: 2, valor: 1450, status: 'autorizada', cancelada: false, tomador_doc: '12345678909', emitente_doc: '12345678000195' };
    assert.deepStrictEqual(F.conferir(servico, { pedido, cliente, empresa, notasDoPedido: [produto, servico] }), []);
    const estoura = F.conferir({ ...servico, valor: 1500 }, { pedido, cliente, empresa, notasDoPedido: [produto] });
    assert.strictEqual(estoura.length, 1);
    assert.match(estoura[0], /^O valor da nota \(R\$ 1\.500,00\)/);
    // nota cancelada do pedido nao entra na soma
    assert.deepStrictEqual(F.conferir(servico, { pedido, cliente, empresa, notasDoPedido: [{ ...produto, status: 'cancelada', valor: 9999 }] }),
        ['A nota cobre R$ 1.450,00 de R$ 3.450,00 do pedido.']);
});

test('tipoPadrao', () => {
    assert.strictEqual(F.tipoPadrao({ nota_tipo_padrao: 'nfe' }), 'nfe');
    assert.strictEqual(F.tipoPadrao({}), 'nfse');
    assert.strictEqual(F.tipoPadrao(null), 'nfse');
});

test('lerXmlNota: valor com virgula decimal', () => {
    const com = v => fx('nfse-abrasf.xml').replace(/3450\.00/g, v);
    for (const v of ['3450,00', '3.450,00', '3450.00']) assert.strictEqual(F.lerXmlNota(com(v)).nota.valor, 3450, v);
    assert.strictEqual(F.lerXmlNota(com('1.234,56')).nota.valor, 1234.56);
});

test('lerXmlNota: evento de cancelamento de NFS-e nacional', () => {
    const ev = '<?xml version="1.0"?><evento xmlns="http://www.sped.fazenda.gov.br/nfse"><infPedReg Id="PRE3550308221234567800019500001000000000000072101101"><chNFSe>35503082212345678000195000000000000726112345678901</chNFSe><e101101><xDesc>Cancelamento de NFS-e</xDesc></e101101></infPedReg></evento>';
    const r = F.lerXmlNota(ev);
    assert.deepStrictEqual(r.nota.tipo, 'nfse');
    assert.strictEqual(r.nota.cancelada, true);
    assert.strictEqual(r.nota.chave, '35503082212345678000195000000000000726112345678901');
});

test('lerXmlNota: data dd/mm/aaaa da ABRASF', () => {
    assert.strictEqual(F.lerXmlNota(fx('nfse-abrasf.xml').replace('2026-11-22T14:05:00', '22/11/2026 14:05')).nota.data_emissao, '2026-11-22');
    assert.strictEqual(F.lerXmlNota(fx('nfse-abrasf.xml').replace('2026-11-22T14:05:00', '22/11/2026')).nota.data_emissao, '2026-11-22');
});

test('lerXmlNota: DOCTYPE com subconjunto interno e ">" em atributo', () => {
    const x = fx('nfse-abrasf.xml').replace('?>', '?><!DOCTYPE CompNfse [ <!ELEMENT CompNfse ANY> ]>').replace('<Nfse>', '<Nfse nota="a>b">');
    const r = F.lerXmlNota(x);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.nota.numero, '456');
});
