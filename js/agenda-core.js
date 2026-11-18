'use strict';
// Nucleo da Agenda: ocupacoes dos eventos proprios (compromissos e bloqueios),
// conflitos, periodos das visoes, privacidade e janela dos lembretes.
// So funcoes puras — sem DOM, sem db, sem rede.
(function (raiz) {

    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    const min = hhmm => {
        const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
        return m ? (+m[1]) * 60 + (+m[2]) : null;
    };
    // Datas ISO (aaaa-mm-dd) em UTC: sem surpresa de fuso/horario de verao.
    const paraUTC = iso => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, d); };
    const deUTC = t => new Date(t).toISOString().slice(0, 10);
    const somarDias = (iso, n) => deUTC(paraUTC(iso) + n * 86400000);
    const diaSemana = iso => (new Date(paraUTC(iso)).getUTCDay() + 6) % 7;   // 0 = segunda
    const dm = iso => ({ a: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1, d: +iso.slice(8, 10) });

    function diasEntre(ini, fim) {
        const out = [];
        if (!ini) return out;
        const f = fim && fim >= ini ? fim : ini;
        for (let d = ini, i = 0; d <= f && i < 3700; d = somarDias(d, 1), i++) out.push(d);
        return out;
    }

    const dataOk = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

    // Ocupacoes do evento, em minutos: dia inteiro/folga/ferias = o dia todo (00:00 a 24:00)
    // em cada dia -- a grade da agenda ja recorta no expediente. Data invalida nao ocupa nada.
    function ocupacoesDoEvento(ev, cfg) {
        if (!ev || !dataOk(ev.data_ini)) return [];
        const diaTodo = ev.dia_inteiro || (ev.tipo === 'bloqueio' && ev.bloqueio && ev.bloqueio !== 'horario');
        if (diaTodo) {
            const fimData = dataOk(ev.data_fim) ? ev.data_fim : ev.data_ini;
            return diasEntre(ev.data_ini, fimData).map(data => ({ data, ini: 0, fim: 1440 }));
        }
        const ini = min(ev.hora_ini), fim = min(ev.hora_fim);
        if (ini === null || fim === null || fim <= ini) return [];
        return [{ data: ev.data_ini, ini, fim }];
    }

    function conflitos(ocupacoes, novo) {
        if (!novo) return [];
        return (ocupacoes || []).filter(a => a.data === novo.data && a.ini < novo.fim && novo.ini < a.fim);
    }

    function _fmtDia(iso) { const x = dm(iso); return `${x.d} de ${MESES[x.m]}`; }
    function periodo(visao, dataISO) {
        if (visao === 'dia') {
            const x = dm(dataISO);
            return { ini: dataISO, fim: dataISO, dias: [dataISO], rotulo: `${x.d} de ${MESES[x.m]} de ${x.a}` };
        }
        if (visao === 'mes') {
            const x = dm(dataISO);
            const primeiro = `${String(x.a).padStart(4, '0')}-${String(x.m + 1).padStart(2, '0')}-01`;
            const ini = somarDias(primeiro, -diaSemana(primeiro));
            const dias = Array.from({ length: 42 }, (_, i) => somarDias(ini, i));
            return { ini, fim: dias[41], dias, rotulo: `${MESES_LONGOS[x.m]} de ${x.a}` };
        }
        const ini = somarDias(dataISO, -diaSemana(dataISO));
        const dias = Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
        const fim = dias[6], a = dm(ini), b = dm(fim);
        let rotulo;
        if (a.a !== b.a) rotulo = `${a.d} de ${MESES[a.m]} de ${a.a} a ${b.d} de ${MESES[b.m]} de ${b.a}`;
        else if (a.m !== b.m) rotulo = `${_fmtDia(ini)} a ${_fmtDia(fim)} de ${b.a}`;
        else rotulo = `${a.d} a ${b.d} de ${MESES[b.m]} de ${b.a}`;
        return { ini, fim, dias, rotulo };
    }

    // Quem nao e o dono nem Administrador ve so "Compromisso" / "Indisponivel".
    function podeGerenciar(profChave, usuarioId, ehAdmin) {
        return !!ehAdmin || (usuarioId !== undefined && usuarioId !== null && usuarioId !== '' && profChave === 'u:' + usuarioId);
    }
    function visivel(ev, usuarioId, ehAdmin) {
        ev = ev || {};
        const comp = ev.tipo === 'compromisso';
        if (podeGerenciar(ev.prof, usuarioId, ehAdmin)) {
            return { titulo: comp ? 'Compromisso' : 'Bloqueio', descricao: String(ev.descricao || '') };
        }
        return { titulo: comp ? 'Compromisso' : 'Indisponível', descricao: '' };
    }

    // Do inicio menos o aviso ate o fim do compromisso.
    function janelaLembrete(ev, cfg) {
        if (!ev || ev.tipo !== 'compromisso' || !dataOk(ev.data_ini)) return null;
        const ini = min(ev.hora_ini), fim = min(ev.hora_fim);
        if (ini === null) return null;
        const { a, m, d } = dm(ev.data_ini);
        const aviso = ev.aviso_min === undefined || ev.aviso_min === null || ev.aviso_min === '' ? 30 : +ev.aviso_min || 0;
        const inicio = new Date(a, m, d, Math.floor(ini / 60), ini % 60);
        const f = fim === null ? ini : fim;
        const termino = new Date(a, m, d, Math.floor(f / 60), f % 60);
        return { de: new Date(inicio.getTime() - aviso * 60000), ate: termino };
    }

    const api = { dataOk, ocupacoesDoEvento, conflitos, periodo, visivel, podeGerenciar, janelaLembrete, somarDias, diasEntre };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (raiz) raiz.AgendaCore = api;

})(typeof window !== 'undefined' ? window : null);
