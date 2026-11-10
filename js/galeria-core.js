// Galeria e simulador de cortinas: catalogos, leitura tolerante do mostruario
// salvo, homografia (encaixe na perspectiva da foto), area da cortina a partir
// da janela marcada e a geometria das dobras de cada prega e persiana.
// So funcoes puras — sem DOM, sem db, sem localStorage — para rodar em `node --test`.
(function (raiz) {
    'use strict';

    // Mesmas chaves e rotulos de CortinaDesenho.PREGAS (select "Tipo de Prega" do pedido).
    const PREGAS = {
        'Americana':   'Prega Americana',
        'Wave Botao':  'Wave Botão',
        'Wave Plus':   'Wave Plus/Flex',
        'Franzido':    'Franzido',
        'Macho-Femea': 'Prega Macho-Fêmea',
        'Painel':      'Painel / Sem Prega'
    };
    const PERSIANAS = { rolo: 'Rolô', romana: 'Romana', double: 'Double Vision' };
    const ABERTURAS = ['central', 'esquerda', 'direita'];
    const NOMES_ABERTURA = { central: 'Central', esquerda: 'Para a esquerda', direita: 'Para a direita' };
    const GRUPOS = [
        { id: 'pregas',  nome: 'Pregas' },
        { id: 'trilhos', nome: 'Trilhos e varões' },
        { id: 'rolo',    nome: 'Rolô' },
        { id: 'romana',  nome: 'Romana' },
        { id: 'double',  nome: 'Double Vision' }
    ];
    const LIMITE_FOTOS = 60;
    const MAX_FOTO = 1600, MAX_TEXTURA = 512;

    // Cores neutras para o simulador nunca abrir em branco com o mostruario vazio.
    const CORES_INICIAIS = [
        { id: 'ini-gelo',     nome: 'Branco gelo',   hex: '#f2efe8' },
        { id: 'ini-areia',    nome: 'Areia',         hex: '#d8c8ad' },
        { id: 'ini-linho',    nome: 'Linho',         hex: '#c2b08f' },
        { id: 'ini-cinza',    nome: 'Cinza claro',   hex: '#b8b8b4' },
        { id: 'ini-grafite',  nome: 'Grafite',       hex: '#4a4a4a' },
        { id: 'ini-petroleo', nome: 'Azul petróleo', hex: '#2f4f5a' }
    ];

    const ehObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const ehTexto = v => typeof v === 'string' && v.trim() !== '';
    const HEX = /^#[0-9a-fA-F]{6}$/;

    function visualTrilho(nome) {
        return /var[aã]o/i.test(String(nome || '')) ? 'varao' : 'trilho';
    }

    function padraoMostruario(kitsNomes) {
        return {
            versao: 1,
            cores: [],
            fotos: [],
            modelos: {
                pregas: Object.keys(PREGAS),
                persianas: Object.keys(PERSIANAS),
                trilhos: (kitsNomes || []).filter(ehTexto)
            }
        };
    }

    function ligaValida(l) {
        if (!ehObj(l) || !ehTexto(l.valor)) return null;
        if (l.tipo === 'prega' && PREGAS[l.valor]) return { tipo: 'prega', valor: l.valor };
        if (l.tipo === 'persiana' && PERSIANAS[l.valor]) return { tipo: 'persiana', valor: l.valor };
        if (l.tipo === 'trilho') return { tipo: 'trilho', valor: l.valor };
        return null;
    }

    function lerMostruario(bruto, kitsNomes) {
        const m = padraoMostruario(kitsNomes);
        if (!ehObj(bruto)) return m;
        if (Array.isArray(bruto.cores)) {
            m.cores = bruto.cores.filter(c => ehObj(c) && HEX.test(String(c.hex || ''))).map((c, i) => ({
                id: ehTexto(c.id) ? c.id : 'cor-' + i,
                nome: typeof c.nome === 'string' ? c.nome : '',
                hex: String(c.hex).toLowerCase(),
                texturaId: ehTexto(c.texturaId) ? c.texturaId : null
            }));
        }
        const grupos = GRUPOS.map(g => g.id);
        if (Array.isArray(bruto.fotos)) {
            m.fotos = bruto.fotos.filter(f => ehObj(f) && ehTexto(f.imagemId) && grupos.includes(f.grupo))
                .slice(0, LIMITE_FOTOS).map(f => ({
                    id: ehTexto(f.id) ? f.id : 'f-' + f.imagemId,
                    grupo: f.grupo,
                    imagemId: f.imagemId,
                    legenda: typeof f.legenda === 'string' ? f.legenda : '',
                    liga: ligaValida(f.liga)
                }));
        }
        const mod = ehObj(bruto.modelos) ? bruto.modelos : {};
        if (Array.isArray(mod.pregas)) m.modelos.pregas = mod.pregas.filter(p => PREGAS[p]);
        if (Array.isArray(mod.persianas)) m.modelos.persianas = mod.persianas.filter(p => PERSIANAS[p]);
        if (Array.isArray(mod.trilhos)) m.modelos.trilhos = mod.trilhos.filter(ehTexto);
        return m;
    }

    function coresDisponiveis(m) {
        return m && m.cores && m.cores.length ? m.cores : CORES_INICIAIS;
    }

    // ---- homografia (DLT, h33 = 1) ----
    function resolver(A, b) {
        const n = b.length;
        const M = A.map((l, i) => l.concat([b[i]]));
        for (let c = 0; c < n; c++) {
            let piv = c;
            for (let l = c + 1; l < n; l++) if (Math.abs(M[l][c]) > Math.abs(M[piv][c])) piv = l;
            [M[c], M[piv]] = [M[piv], M[c]];
            const d = M[c][c] || 1e-12;
            for (let l = 0; l < n; l++) {
                if (l === c) continue;
                const f = M[l][c] / d;
                for (let k = c; k <= n; k++) M[l][k] -= f * M[c][k];
            }
        }
        return M.map((l, i) => l[n] / (l[i] || 1e-12));
    }

    function homografia(de, para) {
        const A = [], b = [];
        for (let i = 0; i < 4; i++) {
            const [x, y] = de[i], [u, v] = para[i];
            A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
            A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
        }
        return resolver(A, b).concat([1]);
    }

    function aplicarHomografia(H, p) {
        const [x, y] = p;
        const w = H[6] * x + H[7] * y + H[8];
        return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
    }

    // ---- cantos do quadrilatero ----
    // Ordem fixa: sup-esq, sup-dir, inf-dir, inf-esq (sentido horario na tela).
    function ordenarCantos(q) {
        const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
        const ord = q.map(p => [p[0], p[1]]).sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
        let ini = 0;
        ord.forEach((p, i) => {
            const s = p[0] + p[1], m = ord[ini][0] + ord[ini][1];
            if (s < m || (s === m && p[1] < ord[ini][1])) ini = i;
        });
        return ord.slice(ini).concat(ord.slice(0, ini));
    }

    function prenderCantos(q, w, h) {
        return q.map(p => [Math.min(w, Math.max(0, p[0])), Math.min(h, Math.max(0, p[1]))]);
    }

    // Area do produto na foto a partir da janela marcada (4 cantos). A cortina
    // sai mais larga que a janela, com o trilho acima dela, e desce ate a janela
    // ou ate o chao (o pe da foto); a persiana cobre a janela.
    const MARGEM = { lado: 0.15, topo: -0.12, janela: 1.04 };
    function areaProduto(janela, op, alturaImagem) {
        if (!op || op.produto === 'persiana') return janela.map(p => [p[0], p[1]]);
        const H = homografia([[0, 0], [1, 0], [1, 1], [0, 1]], janela);
        const P = (u, v) => aplicarHomografia(H, [u, v]);
        const e = -MARGEM.lado, d = 1 + MARGEM.lado, t = MARGEM.topo;
        const base = u => {
            const raso = P(u, MARGEM.janela);
            if (op.ate !== 'chao') return raso;
            const A = P(u, t), B = P(u, 1);
            if (!(B[1] > A[1]) || !(alturaImagem > raso[1])) return raso;
            const k = (alturaImagem - A[1]) / (B[1] - A[1]);
            return [A[0] + k * (B[0] - A[0]), alturaImagem];
        };
        return [P(e, t), P(d, t), base(d), base(e)];
    }

    // ---- geometria das dobras ----
    // Unidades: x em 0..1 da largura da area; z = profundidade da dobra na mesma
    // escala. O tecido recolhe para o lado do painel e as dobras ficam mais
    // fundas ao recolher (o mesmo pano num espaco menor).
    const AMPLITUDE = { 'Americana': 0.018, 'Wave Botao': 0.026, 'Wave Plus': 0.024, 'Franzido': 0.012, 'Macho-Femea': 0.015, 'Painel': 0 };
    const DOBRAS_POR_LARGURA = { 'Americana': 14, 'Wave Botao': 11, 'Wave Plus': 13, 'Franzido': 26, 'Macho-Femea': 12, 'Painel': 1 };
    const RECOLHE = 0.82;

    function perfil(prega, fase) {
        const s = Math.sin(2 * Math.PI * fase);
        switch (prega) {
            case 'Americana': {
                // tres dobras estreitas juntas e um vao liso
                const f = fase - Math.floor(fase);
                return f < 0.45 ? Math.sin(3 * Math.PI * f / 0.45) * 0.8 : -0.25 * Math.sin(Math.PI * (f - 0.45) / 0.55);
            }
            case 'Franzido': return 0.7 * s + 0.3 * Math.sin(2 * Math.PI * fase * 2.7 + 1.3);
            case 'Macho-Femea': return Math.tanh(3 * s) / Math.tanh(3);
            case 'Painel': return 0;
            default: return s;
        }
    }

    function geometriaCortina(op) {
        const prega = PREGAS[op && op.prega] ? op.prega : 'Americana';
        const abertura = ABERTURAS.includes(op && op.abertura) ? op.abertura : 'central';
        const aberto = Math.min(1, Math.max(0, Number(op && op.aberto) || 0));
        const n = Math.max(4, Math.round((op && op.colunas) || 80));
        const fator = 1 - aberto * RECOLHE;
        const A = AMPLITUDE[prega] * (1 + 1.3 * aberto);
        const paineis = abertura === 'central'
            ? [{ ini: 0, fim: 0.5, lado: 'esquerda' }, { ini: 0.5, fim: 1, lado: 'direita' }]
            : [{ ini: 0, fim: 1, lado: abertura }];
        return {
            prega, abertura, aberto,
            paineis: paineis.map(p => {
                const larg = p.fim - p.ini, dobras = Math.max(1, Math.round(DOBRAS_POR_LARGURA[prega] * larg));
                const x = [], z = [];
                for (let i = 0; i < n; i++) {
                    const t = i / (n - 1);
                    x.push(p.lado === 'esquerda' ? p.ini + t * larg * fator : p.fim - (1 - t) * larg * fator);
                    z.push(A * perfil(prega, t * dobras));
                }
                return { lado: p.lado, x, z };
            })
        };
    }

    // Persianas sobem: baseVisivel = onde termina o tecido (0 topo, 1 base).
    // Double vision primeiro alinha as faixas (passa luz) e depois sobe.
    function geometriaPersiana(op) {
        const tipo = PERSIANAS[op && op.tipo] ? op.tipo : 'rolo';
        const aberto = Math.min(1, Math.max(0, Number(op && op.aberto) || 0));
        const n = Math.max(4, Math.round((op && op.linhas) || 60));
        let subida = aberto, alinhamento = 0;
        if (tipo === 'double') { alinhamento = Math.min(1, aberto * 2); subida = Math.max(0, aberto - 0.5) * 2; }
        const baseVisivel = 1 - subida * 0.92;
        const y = [], z = [];
        const secoes = 6;
        for (let i = 0; i < n; i++) {
            const yy = (i / (n - 1)) * baseVisivel;
            y.push(yy);
            z.push(tipo === 'romana' ? 0.035 * subida * Math.abs(Math.sin(Math.PI * secoes * (yy / (baseVisivel || 1)))) : 0);
        }
        const r = { tipo, aberto, baseVisivel, y, z };
        if (tipo === 'double') { r.faixas = 12; r.alinhamento = alinhamento; }
        return r;
    }

    function dimensaoReduzida(w, h, max) {
        const k = Math.min(1, max / Math.max(w, h));
        return { w: Math.round(w * k), h: Math.round(h * k) };
    }

    const api = {
        PREGAS, PERSIANAS, ABERTURAS, NOMES_ABERTURA, GRUPOS, LIMITE_FOTOS, MAX_FOTO, MAX_TEXTURA, CORES_INICIAIS,
        visualTrilho, padraoMostruario, lerMostruario, coresDisponiveis,
        homografia, aplicarHomografia, ordenarCantos, prenderCantos, areaProduto,
        geometriaCortina, geometriaPersiana, dimensaoReduzida
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else raiz.GaleriaCore = api;
})(typeof window !== 'undefined' ? window : this);
