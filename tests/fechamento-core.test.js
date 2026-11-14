'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/fechamento-core.js');

test('ultimo dia, mes anterior e rotulo', () => {
    assert.strictEqual(F.ultimoDiaMes('2026-02'), '2026-02-28');
    assert.strictEqual(F.ultimoDiaMes('2028-02'), '2028-02-29');
    assert.strictEqual(F.mesAnterior('2027-01'), '2026-12');
    assert.strictEqual(F.rotuloMes('2026-10'), 'outubro de 2026');
});
test('conferencia: so contas ativas que ja existiam; esperado no ultimo dia; ignora ajustes do proprio mes', () => {
    const saldoConta = (c, movs, ate) => c.saldo_inicial + movs.filter(m => m.conta_id === c.id && m.data <= ate).reduce((s, m) => s + (m.sentido === 'entrada' ? m.valor : -m.valor), 0);
    const contas = [
        { id: 1, nome: 'Banco', saldo_inicial: 100, data_saldo_inicial: '2026-09-01' },
        { id: 2, nome: 'Nova', saldo_inicial: 0, data_saldo_inicial: '2026-11-05' },
        { id: 3, nome: 'Velha', saldo_inicial: 0, data_saldo_inicial: '2026-01-01', ativo: false }];
    const movimentos = [
        { conta_id: 1, data: '2026-10-10', sentido: 'entrada', valor: 50, origem: 'cr' },
        { conta_id: 1, data: '2026-11-02', sentido: 'entrada', valor: 999, origem: 'cr' },
        { conta_id: 1, data: '2026-10-31', sentido: 'saida', valor: 20, origem: 'ajuste', fechamento_mes: '2026-10' }];
    assert.deepStrictEqual(F.contasDaConferencia({ mes: '2026-10', contas, movimentos, saldoConta, ignorarAjustesDe: null }), [{ conta_id: 1, nome: 'Banco', esperado: 130 }]);
    assert.deepStrictEqual(F.contasDaConferencia({ mes: '2026-10', contas, movimentos, saldoConta, ignorarAjustesDe: '2026-10' }), [{ conta_id: 1, nome: 'Banco', esperado: 150 }]);
});
test('pendencias do mes: CP e CR vencidos no mes e nao pagos', () => {
    const p = F.pendenciasDoMes({ mes: '2026-10',
        contasPagar: [{ id: 1, valor: 100, status: 'Pendente', data_vencimento: '2026-10-05' }, { id: 2, valor: 50, status: 'Pago', data_vencimento: '2026-10-06' }, { id: 3, valor: 70, status: 'Pendente', data_vencimento: '2026-11-01' }],
        contasReceber: [{ id: 9, valor: 300, status: 'Pendente', data_vencimento: '2026-10-20' }], impostoEstimado: true });
    assert.deepStrictEqual([p.pagar_qtd, p.pagar_valor, p.receber_qtd, p.receber_valor, p.guia_pendente], [1, 100, 1, 300, true]);
});
test('maiores gastos: 3 maiores, sem imposto e sem zero', () => {
    const grupos = [{ id: 'fornecedores', rotulo: 'Fornecedores e materiais' }, { id: 'fixas', rotulo: 'Despesas fixas' }, { id: 'imposto', rotulo: 'Imposto' }, { id: 'taxas', rotulo: 'Taxas de cartão' }, { id: 'outros', rotulo: 'Outros' }];
    assert.deepStrictEqual(F.maioresGastos({ fornecedores: 500, fixas: 800, imposto: 900, taxas: 0, outros: 10 }, 3, grupos).map(g => g.grupo), ['fixas', 'fornecedores', 'outros']);
});
test('sugestoes: ordem da spec, no maximo 4', () => {
    const s = F.sugestoesDoMes({ resultado: -200, entradas: 1000, meta: 3000, equilibrio: { valor: 5000 },
        orcamento: [{ grupo: 'fixas', rotulo: 'Despesas fixas', faixa: 'estourou', falta: -150 }],
        porGrupo: { fornecedores: 400 }, porGrupoAnterior: { fornecedores: 200 }, rotuloAnterior: 'setembro',
        pendencias: { receber_valor: 300 }, impostoEstimado: true, rotuloMes: 'outubro', grupos: [{ id: 'fornecedores', rotulo: 'Fornecedores e materiais' }] });
    assert.strictEqual(s.length, 4);
    assert.strictEqual(s[0], 'O mês fechou no vermelho em R$ 200,00. Para empatar você precisa faturar R$ 5.000,00 (ponto de equilíbrio).');
    assert.strictEqual(s[1], 'Despesas fixas passou R$ 150,00 do orçamento.');
    assert.strictEqual(s[2], 'Faltaram R$ 2.000,00 para a meta.');
    assert.strictEqual(s[3], 'Fornecedores e materiais subiu 100% em relação a setembro.');
    assert.deepStrictEqual(F.sugestoesDoMes({ resultado: 10, entradas: 10, meta: 0, orcamento: [], porGrupo: {}, porGrupoAnterior: {}, pendencias: { receber_valor: 0 }, impostoEstimado: false, grupos: [] }), ['Nenhum ponto de atenção. Bom mês!']);
});
test('sugestao de alta exige > 30% e > R$ 100; atrasados e guia entram quando sobra espaco', () => {
    const base = { resultado: 10, entradas: 10, meta: 0, orcamento: [], porGrupoAnterior: { outros: 100 }, rotuloAnterior: 'setembro', grupos: [{ id: 'outros', rotulo: 'Outros' }], rotuloMes: 'outubro' };
    assert.deepStrictEqual(F.sugestoesDoMes({ ...base, porGrupo: { outros: 190 }, pendencias: { receber_valor: 0 }, impostoEstimado: false }), ['Nenhum ponto de atenção. Bom mês!']);
    assert.deepStrictEqual(F.sugestoesDoMes({ ...base, porGrupo: { outros: 100 }, pendencias: { receber_valor: 300 }, impostoEstimado: true }),
        ['R$ 300,00 de clientes em atraso — vale cobrar.', 'Lance a guia de imposto de outubro quando ela chegar.']);
});
test('foto e mudancas: em centavos; conta com ajuste conta o ajuste; conta nao conferida fica fora', () => {
    const r = { entradas: 1000, saidas: 600, imposto: { valor: 60, estimado: true }, resultado: 400, porGrupo: { fixas: 540, imposto: 60 } };
    const foto = F.montarFoto({ mes: '2026-10', agoraISO: '2026-11-03T10:00:00.000Z', usuario: 'Ana', r, meta: 2000,
        contas: [{ conta_id: 1, nome: 'Banco', esperado: 500, extrato: 480, diferenca: -20, acao: 'ajuste', motivo: 'tarifa' },
                 { conta_id: 2, nome: 'Caixa', esperado: 50, extrato: null, diferenca: null, acao: null, motivo: '' }],
        pendencias: { pagar_qtd: 0, pagar_valor: 0, receber_qtd: 0, receber_valor: 0, guia_pendente: true }, sugestoes: ['x'], anotacoes: 'ok' });
    assert.strictEqual(foto.id, 'fech-2026-10');
    assert.deepStrictEqual(foto.numeros, { entradas: 1000, saidas: 600, imposto: 60, imposto_estimado: true, resultado: 400, meta: 2000, por_grupo: { fixas: 540, imposto: 60 } });
    assert.deepStrictEqual(F.mudancasDesdeFoto(foto, { r, saldos: { 1: 480, 2: 999 } }), []);
    assert.deepStrictEqual(F.mudancasDesdeFoto(foto, { r: { ...r, saidas: 650, resultado: 350.004 }, saldos: { 1: 470 } }),
        [{ tipo: 'resultado', antes: 400, agora: 350.004 }, { tipo: 'conta', nome: 'Banco', antes: 480, agora: 470 }]);
});
test('mes para fechar: o anterior, se ha contas e ainda nao foi fechado', () => {
    assert.strictEqual(F.mesParaFechar({ hoje: '2026-11-01', fechamentos: [], temContas: true }), '2026-10');
    assert.strictEqual(F.mesParaFechar({ hoje: '2026-11-20', fechamentos: [{ mes: '2026-10' }], temContas: true }), null);
    assert.strictEqual(F.mesParaFechar({ hoje: '2026-11-20', fechamentos: [], temContas: false }), null);
});
test('guia lancada depois do fechamento: so o item guia, sem aviso de resultado', () => {
    const r = { entradas: 1000, saidas: 600, imposto: { valor: 60, estimado: true }, resultado: 400, porGrupo: { fixas: 540, imposto: 60 } };
    const foto = F.montarFoto({ mes: '2026-10', agoraISO: '2026-11-03T10:00:00.000Z', usuario: 'Ana', r, meta: 0, contas: [],
        pendencias: {}, sugestoes: [], anotacoes: '' });
    const comGuia = { entradas: 1000, saidas: 615, imposto: { valor: 75, estimado: false }, resultado: 385, porGrupo: { fixas: 540, imposto: 75 } };
    assert.deepStrictEqual(F.mudancasDesdeFoto(foto, { r: comGuia, saldos: {} }), [{ tipo: 'guia', antes: 60, agora: 75 }]);
    // Guia igual a estimativa: nada muda.
    assert.deepStrictEqual(F.mudancasDesdeFoto(foto, { r: { ...comGuia, saidas: 600, imposto: { valor: 60, estimado: false }, resultado: 400 }, saldos: {} }), []);
});
test('guia lancada + CR com data retroativa: resultado e guia', () => {
    const r = { entradas: 1000, saidas: 600, imposto: { valor: 60, estimado: true }, resultado: 400, porGrupo: {} };
    const foto = F.montarFoto({ mes: '2026-10', agoraISO: '2026-11-03T10:00:00.000Z', usuario: 'Ana', r, meta: 0, contas: [],
        pendencias: {}, sugestoes: [], anotacoes: '' });
    const agora = { entradas: 1200, saidas: 615, imposto: { valor: 75, estimado: false }, resultado: 585, porGrupo: {} };
    assert.deepStrictEqual(F.mudancasDesdeFoto(foto, { r: agora, saldos: {} }),
        [{ tipo: 'resultado', antes: 400, agora: 585 }, { tipo: 'guia', antes: 60, agora: 75 }]);
});
