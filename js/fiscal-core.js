'use strict';
// Nucleo fiscal: leitura de XML de NF-e e NFS-e (padrao nacional e ABRASF), dados da nota a partir do pedido
// e conferencia da nota contra pedido/cliente/empresa. So funcoes puras — sem DOM, sem db, sem DOMParser.
(function (raiz) {

    const AVISO_MANUAL = 'Emita esta nota no sistema da prefeitura/SEFAZ ou do seu contador e anexe aqui o XML e o PDF.';

    const soDigitos = s => String(s == null ? '' : s).replace(/\D/g, '');
    const cent = v => { const n = Number(v) || 0; return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)); };
    const arred = v => cent(v) / 100;

    function dinheiro(v) {
        const c = cent(v), neg = c < 0, a = Math.abs(c);
        const int = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return (neg ? '-' : '') + int + ',' + String(a % 100).padStart(2, '0');
    }
    function mascaraDoc(d) {
        const s = soDigitos(d);
        if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        return String(d || '');
    }

    // ---------- leitor de tags (ignora namespaces e prefixos) ----------
    function entidades(s) {
        return s.replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }
    const local = n => { const i = n.indexOf(':'); return i >= 0 ? n.slice(i + 1) : n; };

    // Devolve a raiz { nome, attrs, filhos, texto } ou null se o XML estiver mal formado.
    function parsear(texto) {
        let s = String(texto == null ? '' : texto).replace(/^﻿/, '');
        s = s.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
        s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (m, c) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        const raizNo = { nome: '#raiz', attrs: {}, filhos: [], texto: '' };
        const pilha = [raizNo];
        const re = /<([^>]*)>|([^<]+)/g;
        let m;
        while ((m = re.exec(s))) {
            const topo = pilha[pilha.length - 1];
            if (m[2] !== undefined) { topo.texto += m[2]; continue; }
            const t = m[1].trim();
            if (!t) return null;
            if (t[0] === '/') {
                const nome = local(t.slice(1).trim());
                if (pilha.length < 2 || topo.nome !== nome) return null;
                pilha.pop();
                continue;
            }
            const auto = t[t.length - 1] === '/';
            const corpo = auto ? t.slice(0, -1).trim() : t;
            const mn = /^(\S+)([\s\S]*)$/.exec(corpo);
            if (!mn || !/^[A-Za-z_][\w.:-]*$/.test(mn[1])) return null;
            const attrs = {};
            const ra = /([\w.:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
            let a;
            while ((a = ra.exec(mn[2]))) attrs[local(a[1])] = entidades(a[3] !== undefined ? a[3] : a[4]);
            const no = { nome: local(mn[1]), attrs, filhos: [], texto: '' };
            topo.filhos.push(no);
            if (!auto) pilha.push(no);
        }
        if (pilha.length !== 1 || raizNo.filhos.length !== 1) return null;
        return raizNo.filhos[0];
    }

    function achar1(no, nome) {
        if (no.nome === nome) return no;
        for (const f of no.filhos) { const r = achar1(f, nome); if (r) return r; }
        return null;
    }
    // Primeiro descendente (ou o proprio no) com esse nome; varios nomes = encadeados.
    function achar(no, ...nomes) {
        let atual = no;
        for (const nome of nomes) {
            if (!atual) return null;
            atual = achar1(atual, nome);
        }
        return atual;
    }
    const txt = (no, ...nomes) => { const n = no ? achar(no, ...nomes) : null; return n ? entidades(n.texto).trim() : ''; };
    const primeiro = (...vs) => { for (const v of vs) if (v) return v; return ''; };
    const dia = s => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s || '').trim()); return m ? m[1] : ''; };
    const num = s => { const n = Number(String(s || '').trim()); return isFinite(n) ? n : 0; };
    const semPrefixo = (id, p) => String(id || '').replace(new RegExp('^' + p), '');

    function base(tipo, o) {
        return Object.assign({
            tipo, numero: '', serie: '', chave: '', codigo_verificacao: null, data_emissao: '', valor: 0,
            emitente_doc: '', tomador_doc: '', tomador_nome: '', cancelada: false
        }, o);
    }

    // ---------- leitura da nota ----------
    function lerXmlNota(texto) {
        const t = String(texto == null ? '' : texto);
        const marcas = /infNFe|infNFSe|InfNfse|procEventoNFe|CompNfse/i.test(t);
        if (!/^\s*﻿?\s*</.test(t)) return { ok: false, motivo: 'nao_e_nota' };
        const raizNo = parsear(t);
        if (!raizNo) return { ok: false, motivo: marcas ? 'xml_invalido' : 'nao_e_nota' };

        const evento = achar(raizNo, 'infEvento');
        if (evento && txt(evento, 'tpEvento') === '110111') {
            return { ok: true, nota: base('nfe', { chave: txt(evento, 'chNFe'), cancelada: true }) };
        }
        const nfe = achar(raizNo, 'infNFe');
        if (nfe) {
            return {
                ok: true, nota: base('nfe', {
                    numero: txt(nfe, 'ide', 'nNF'), serie: txt(nfe, 'ide', 'serie'),
                    chave: semPrefixo(nfe.attrs.Id, 'NFe'),
                    data_emissao: dia(primeiro(txt(nfe, 'ide', 'dhEmi'), txt(nfe, 'ide', 'dEmi'))),
                    valor: num(txt(nfe, 'total', 'ICMSTot', 'vNF')),
                    emitente_doc: soDigitos(primeiro(txt(nfe, 'emit', 'CNPJ'), txt(nfe, 'emit', 'CPF'))),
                    tomador_doc: soDigitos(primeiro(txt(nfe, 'dest', 'CNPJ'), txt(nfe, 'dest', 'CPF'))),
                    tomador_nome: txt(nfe, 'dest', 'xNome')
                })
            };
        }
        const nac = achar(raizNo, 'infNFSe');
        if (nac) {
            const dps = achar(nac, 'infDPS');
            return {
                ok: true, nota: base('nfse', {
                    numero: txt(nac, 'nNFSe'), serie: dps ? txt(dps, 'serie') : '',
                    chave: semPrefixo(nac.attrs.Id, 'NFS'),
                    data_emissao: dia(primeiro(txt(nac, 'dhProc'), dps && txt(dps, 'dhEmi'))),
                    valor: num(primeiro(txt(nac, 'valores', 'vLiq'), dps && txt(dps, 'vServ'))),
                    emitente_doc: soDigitos(primeiro(txt(nac, 'emit', 'CNPJ'), txt(nac, 'emit', 'CPF'))),
                    tomador_doc: soDigitos(primeiro(txt(nac, 'toma', 'CNPJ'), txt(nac, 'toma', 'CPF'))),
                    tomador_nome: txt(nac, 'toma', 'xNome')
                })
            };
        }
        const abr = achar(raizNo, 'InfNfse');
        if (abr) {
            const prest = achar(abr, 'PrestadorServico') || achar(abr, 'Prestador');
            const toma = achar(abr, 'TomadorServico') || achar(abr, 'Tomador');
            return {
                ok: true, nota: base('nfse', {
                    numero: txt(abr, 'Numero'), codigo_verificacao: txt(abr, 'CodigoVerificacao') || null,
                    serie: txt(abr, 'IdentificacaoRps', 'Serie'),
                    data_emissao: dia(txt(abr, 'DataEmissao')),
                    valor: num(primeiro(txt(abr, 'ValoresNfse', 'ValorLiquidoNfse'), txt(abr, 'Servico', 'Valores', 'ValorServicos'))),
                    emitente_doc: soDigitos(prest ? primeiro(txt(prest, 'Cnpj'), txt(prest, 'Cpf')) : ''),
                    tomador_doc: soDigitos(toma ? primeiro(txt(toma, 'Cnpj'), txt(toma, 'Cpf')) : ''),
                    tomador_nome: txt(toma, 'RazaoSocial'),
                    cancelada: !!achar(raizNo, 'NfseCancelamento')
                })
            };
        }
        return { ok: false, motivo: 'nao_e_nota' };
    }

    // ---------- dados da nota a partir do pedido ----------
    const tipoPadrao = empresa => ((empresa && (empresa.nota_tipo_padrao === 'nfe' || empresa.nota_tipo_padrao === 'nfse')) ? empresa.nota_tipo_padrao : 'nfse');

    function temInstalacao(p) {
        return !!(p && (p.inst_agendado || p.inst_hora || p.inst_rua || p.inst_cep || p.usuario_instalacao_id || p.instalador_nome || p.inst_confirmada_em || p.data_instalado));
    }
    const docDoCliente = c => soDigitos(c && (c.cpf || c.cnpj || c.cpf_cnpj || c.doc));

    function dadosNotaDoPedido({ pedido, cliente, empresa, tipo }) {
        const p = pedido || {}, c = cliente || {};
        tipo = tipo === 'nfe' || tipo === 'nfse' ? tipo : tipoPadrao(empresa);
        const valorTotal = arred(p.valor);
        const linhas = [];
        (p.ambientes || []).forEach(a => {
            const nomes = (a.tecidos || []).map(t => t.tecidoNome).filter(Boolean);
            if (!nomes.length && a.tecidoNome) nomes.push(a.tecidoNome);
            linhas.push({ descricao: 'Cortina' + (a.amb ? ' — ' + a.amb : '') + (nomes.length ? ' (' + nomes.join(' + ') + ')' : ''), quantidade: 1 });
        });
        (p.itens || []).forEach(i => {
            if (!i) return;
            linhas.push({ descricao: (i.nome || i.descricao || 'Item') + (i.unidade ? ' (' + i.unidade + ')' : ''), quantidade: Number(i.quantidade) || 1 });
        });
        if (tipo === 'nfse' && temInstalacao(p)) linhas.push({ descricao: 'Serviço de instalação — Pedido #' + p.id, quantidade: 1 });
        if (!linhas.length) linhas.push({ descricao: 'Pedido #' + p.id, quantidade: 1 });

        // O pedido nao guarda preco por item: o total e repartido pela quantidade e a ultima linha absorve os centavos.
        const totalQtd = linhas.reduce((s, l) => s + l.quantidade, 0) || 1;
        let restante = cent(valorTotal);
        const itens = linhas.map((l, i) => {
            const totalC = i === linhas.length - 1 ? restante : Math.round(cent(valorTotal) * l.quantidade / totalQtd);
            restante -= totalC;
            return { descricao: l.descricao, quantidade: l.quantidade, valor_unitario: totalC / 100 / l.quantidade, valor_total: totalC / 100 };
        });

        const endereco = c.rua !== undefined
            ? [c.rua && c.numero ? c.rua + ', ' + c.numero : c.rua, c.complemento, c.bairro].filter(Boolean).join(' - ')
            : (c.end || '');
        return {
            tipo,
            tomador: {
                nome: c.nome || p.clienteNome || '', doc: docDoCliente(c), endereco,
                cidade: c.cidade || '', uf: c.uf || '', cep: soDigitos(c.cep), email: c.email || ''
            },
            itens, valor_total: valorTotal, observacoes: 'Pedido #' + p.id
        };
    }

    // ---------- conferencia ----------
    function conferir(nota, { pedido, cliente, empresa, notasDoPedido } = {}) {
        const av = [];
        if (!nota) return av;
        if (nota.cancelada) av.push('A nota já está cancelada.');
        if (pedido && pedido.valor != null && !nota.cancelada) {
            const vp = Number(pedido.valor) || 0;
            const outras = (notasDoPedido || []).filter(n => n && n !== nota && !(nota.id != null && n.id === nota.id) && n.status === 'autorizada');
            const soma = outras.reduce((s, n) => s + (Number(n.valor) || 0), 0) + (Number(nota.valor) || 0);
            const diverge = outras.length ? cent(soma) > cent(vp) : cent(nota.valor) !== cent(vp);
            if (diverge) av.push('O valor da nota (R$ ' + dinheiro(nota.valor) + ') é diferente do valor do pedido (R$ ' + dinheiro(vp) + ').');
        }
        const docCli = docDoCliente(cliente);
        if (docCli && nota.tomador_doc && soDigitos(nota.tomador_doc) !== docCli) {
            av.push('O CPF/CNPJ do tomador (' + mascaraDoc(nota.tomador_doc) + ') não é o do cliente (' + mascaraDoc(docCli) + ').');
        }
        const docEmp = soDigitos(empresa && empresa.cnpj);
        if (docEmp && nota.emitente_doc && soDigitos(nota.emitente_doc) !== docEmp) {
            av.push('O emitente da nota (' + mascaraDoc(nota.emitente_doc) + ') não é a empresa (CNPJ ' + mascaraDoc(docEmp) + ').');
        }
        return av;
    }

    const api = { lerXmlNota, dadosNotaDoPedido, conferir, tipoPadrao, AVISO_MANUAL };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.FiscalCore = api;

})(typeof window !== 'undefined' ? window : null);
