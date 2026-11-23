'use strict';
// Nucleo dos feriados: nacionais (calculados, qualquer ano), pontos facultativos,
// estaduais (tabela por UF, com a lei de cada um) e municipais (cadastrados pela empresa).
// So funcoes puras — sem DOM, sem db, sem rede.
(function (raiz) {

    const pad = n => String(n).padStart(2, '0');
    const iso = (a, m, d) => a + '-' + pad(m) + '-' + pad(d);
    // Datas em UTC: sem surpresa de fuso/horario de verao.
    const somarDias = (isoData, n) => {
        const [a, m, d] = isoData.split('-').map(Number);
        return new Date(Date.UTC(a, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
    };

    // Pascoa (calendario gregoriano) — algoritmo de Meeus/Jones/Butcher.
    function pascoa(ano) {
        const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
        const d = Math.floor(b / 4), e = b % 4;
        const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const mes = Math.floor((h + l - 7 * m + 114) / 31);
        const dia = ((h + l - 7 * m + 114) % 31) + 1;
        return iso(ano, mes, dia);
    }

    // Feriados nacionais de data fixa: [mes, dia, nome, vale a partir do ano (opcional)].
    const NACIONAIS_FIXOS = [
        [1, 1, 'Confraternização Universal'],
        [4, 21, 'Tiradentes'],
        [5, 1, 'Dia do Trabalho'],
        [9, 7, 'Independência do Brasil'],
        [10, 12, 'Nossa Senhora Aparecida'],
        [11, 2, 'Finados'],
        [11, 15, 'Proclamação da República'],
        [11, 20, 'Dia Nacional de Zumbi e da Consciência Negra', 2024],   // Lei 14.759/2023
        [12, 25, 'Natal']
    ];

    // Feriados estaduais por lei (Lei federal 9.093/1995, art. 1, II, permite ao estado
    // instituir feriado civil por lei estadual). Cada linha: [mes, dia, nome, fonte].
    // Movel: mes = 'pascoa+N' (N dias depois da Pascoa) e dia = null.
    // Pesquisado em 2026-11-20 (leis, decretos anuais de feriados dos estados, calendarios de tribunais).
    // Ficam de fora: feriados que a lei transfere de dia, dias do evangelico, municipais de capital
    // e tudo que nao deu para confirmar (ver relatorio da Task 1).
    const ESTADUAIS = {
        AL: [
            [6, 24, 'São João', 'Lei estadual 5.508/1993'],
            [6, 29, 'São Pedro', 'Lei estadual 5.509/1993; Decreto 17.077/2011'],
            [9, 16, 'Emancipação Política de Alagoas', 'Decretos anuais de feriados (ex.: 46.132/2015, 68.782/2019)']
        ],
        AM: [
            [9, 5, 'Elevação do Amazonas à categoria de província', 'Lei promulgada 25/1977']
        ],
        AP: [
            [3, 19, 'Dia de São José', 'Lei estadual 667/2002'],
            [9, 13, 'Criação do Território Federal do Amapá', 'Decreto-Lei 5.812/1943; Constituição estadual']
        ],
        BA: [
            [7, 2, 'Independência da Bahia', 'Constituição estadual, art. 6, par. 3']
        ],
        CE: [
            [3, 25, 'Data Magna do Ceará', 'Constituição estadual, art. 18, par. único (EC 73/2011)']
        ],
        ES: [
            ['pascoa+8', null, 'Nossa Senhora da Penha', 'Lei estadual 11.010/2019 (segunda-feira, 8 dias depois da Páscoa)']
        ],
        MA: [
            [7, 28, 'Adesão do Maranhão à Independência', 'Lei estadual 2.457/1964']
        ],
        MS: [
            [10, 11, 'Criação do Estado de Mato Grosso do Sul', 'Constituição estadual, art. 89, VII; decretos anuais de feriados']
        ],
        PA: [
            [8, 15, 'Adesão do Pará à Independência', 'Lei estadual 5.999/1996']
        ],
        PB: [
            [8, 5, 'Fundação do Estado da Paraíba', 'Lei estadual 3.489/1967 (número conferido só em referência secundária)']
        ],
        PE: [
            [3, 6, 'Revolução Pernambucana de 1817', 'Lei estadual 16.059/2017']
        ],
        PI: [
            [10, 19, 'Dia do Piauí', 'Lei estadual 176/1937, art. 1']
        ],
        RJ: [
            [4, 23, 'Dia de São Jorge', 'Lei estadual 5.198/2008 (constitucional: STF, ADI 4092, 2023)']
        ],
        RN: [
            [10, 3, 'Mártires de Cunhaú e Uruaçu', 'Lei estadual 8.913/2006']
        ],
        RO: [
            [1, 4, 'Criação do Estado de Rondônia', 'Lei estadual 2.291/2010']
        ],
        RR: [
            [10, 5, 'Criação do Estado de Roraima', 'Constituição estadual; Lei federal 9.093/1995']
        ],
        RS: [
            [9, 20, 'Dia do Gaúcho (Revolução Farroupilha)', 'Constituição estadual, art. 6, par. único; Decreto 36.180/1995']
        ],
        SE: [
            [7, 8, 'Emancipação Política de Sergipe', 'Constituição estadual, art. 269']
        ],
        SP: [
            [7, 9, 'Revolução Constitucionalista', 'Lei estadual 9.497/1997']
        ],
        TO: [
            [9, 8, 'Nossa Senhora da Natividade', 'Lei estadual 627/1993']
        ]
    };
    const UFS_COM_FERIADO = Object.keys(ESTADUAIS);

    const tipoOrdem = { nacional: 0, facultativo: 1, estadual: 2, municipal: 3 };

    function doAno(ano, opts) {
        ano = +ano;
        const o = opts || {};
        const uf = String(o.uf || '').toUpperCase();
        const out = [];
        const datasNacionais = new Set();   // estaduais e municipais na mesma data nao repetem

        NACIONAIS_FIXOS.forEach(([m, d, nome, desde]) => {
            if (desde && ano < desde) return;
            const data = iso(ano, m, d);
            out.push({ data, nome, tipo: 'nacional' });
            datasNacionais.add(data);
        });
        const p = pascoa(ano);
        const sexta = somarDias(p, -2);
        out.push({ data: sexta, nome: 'Paixão de Cristo', tipo: 'nacional' });
        datasNacionais.add(sexta);

        out.push({ data: somarDias(p, -48), nome: 'Carnaval', tipo: 'facultativo', obs: 'ponto facultativo' });
        out.push({ data: somarDias(p, -47), nome: 'Carnaval', tipo: 'facultativo', obs: 'ponto facultativo' });
        out.push({ data: somarDias(p, -46), nome: 'Quarta-feira de Cinzas', tipo: 'facultativo', obs: 'ponto facultativo até as 14h' });
        const corpus = somarDias(p, 60);
        if (o.corpusMunicipal) out.push({ data: corpus, nome: 'Corpus Christi', tipo: 'municipal' });
        else out.push({ data: corpus, nome: 'Corpus Christi', tipo: 'facultativo', obs: 'ponto facultativo' });

        (ESTADUAIS[uf] || []).forEach(([m, d, nome, fonte]) => {
            const data = typeof m === 'string' ? somarDias(p, +m.split('+')[1]) : iso(ano, m, d);
            if (datasNacionais.has(data)) return;
            out.push({ data, nome, tipo: 'estadual', uf, obs: fonte });
        });

        (Array.isArray(o.municipais) ? o.municipais : []).forEach(f => {
            const m = +f.mes, d = +f.dia;
            if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31) || !String(f.nome || '').trim()) return;
            if (new Date(Date.UTC(ano, m - 1, d)).getUTCMonth() !== m - 1) return;   // ex.: 29/02 em ano comum
            const data = iso(ano, m, d);
            if (datasNacionais.has(data)) return;
            out.push({ data, nome: String(f.nome).trim(), tipo: 'municipal' });
        });

        return out.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : tipoOrdem[a.tipo] - tipoOrdem[b.tipo]);
    }

    function noPeriodo(iniISO, fimISO, opts) {
        const a0 = +String(iniISO).slice(0, 4), a1 = +String(fimISO).slice(0, 4);
        const out = [];
        for (let a = a0; a <= a1 && a - a0 < 20; a++) {
            doAno(a, opts).forEach(f => { if (f.data >= iniISO && f.data <= fimISO) out.push(f); });
        }
        return out;
    }

    const api = { pascoa, doAno, noPeriodo, UFS_COM_FERIADO };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.FeriadosCore = api;

})(typeof window !== 'undefined' ? window : null);
