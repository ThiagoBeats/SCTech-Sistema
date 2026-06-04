// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────────
let _dashCharts = [];
let _dashActive = 'gerencial';

const DASH_DEFS = [
    { id:'comercial',   icon:'📊', label:'Comercial' },
    { id:'producao',    icon:'🏭', label:'Produção' },
    { id:'estoque',     icon:'📦', label:'Estoque' },
    { id:'instalacoes', icon:'🔧', label:'Instalações' },
    { id:'compras',     icon:'🛒', label:'Compras' },
    { id:'gerencial',   icon:'👔', label:'Gerencial' },
];

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    carregarTema();
    _renderTabs();
    const p = new URLSearchParams(window.location.search);
    _goTo(p.get('dash') || 'gerencial');
});

function _renderTabs() {
    const bar = document.getElementById('dash-tab-bar');
    if (!bar) return;
    bar.innerHTML = DASH_DEFS.map(d =>
        `<button class="dash-tab" data-d="${d.id}" onclick="_goTo('${d.id}')">${d.icon} ${d.label}</button>`
    ).join('');
}

function _goTo(id) {
    _dashActive = id;
    history.replaceState(null, '', `?dash=${id}`);
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.toggle('active', t.dataset.d === id));
    _destroyCharts();
    const filtersEl = document.getElementById('dash-filters');
    const contentEl = document.getElementById('dash-content');
    if (filtersEl) filtersEl.innerHTML = _getFiltersHTML(id);
    if (contentEl) contentEl.innerHTML = '';
    _renderContent(id);
}

// Chamado pelos filtros via onchange — preserva HTML dos filtros, só re-renderiza conteúdo
function renderDash(id) {
    _destroyCharts();
    _renderContent(id || _dashActive);
}

function _getFiltersHTML(id) {
    const fns = { comercial:_filtersComercial, producao:_filtersProducao, estoque:_filtersEstoque, instalacoes:_filtersInstalacoes, compras:_filtersCompras, gerencial:_filtersGerencial };
    return fns[id] ? fns[id]() : '';
}

function _renderContent(id) {
    const fns = { comercial:_dashComercial, producao:_dashProducao, estoque:_dashEstoque, instalacoes:_dashInstalacoes, compras:_dashCompras, gerencial:_dashGerencial };
    if (fns[id]) fns[id]();
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const _fmtR   = v => 'R$ ' + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const _fmtN   = v => (v||0).toLocaleString('pt-BR');
const _fmtPct = v => (v||0).toFixed(1) + '%';
const _fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('pt-BR') : '—';

function _destroyCharts() {
    _dashCharts.forEach(c => { try { c.destroy(); } catch(e){} });
    _dashCharts = [];
}

function _mkChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const c = new Chart(canvas, config);
    _dashCharts.push(c);
    return c;
}

function _getRange() {
    const per = document.getElementById('df-periodo')?.value || 'mes';
    const hoje = new Date();
    const hs = hoje.toISOString().split('T')[0];
    if (per === 'hoje') return { ini: hs, fim: hs };
    if (per === '7d')  { const d=new Date(hoje); d.setDate(d.getDate()-6);   return {ini:d.toISOString().split('T')[0],fim:hs}; }
    if (per === '30d') { const d=new Date(hoje); d.setDate(d.getDate()-29);   return {ini:d.toISOString().split('T')[0],fim:hs}; }
    if (per === '3m')  { const d=new Date(hoje); d.setMonth(d.getMonth()-3);  return {ini:d.toISOString().split('T')[0],fim:hs}; }
    if (per === 'mes') { return {ini:`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`,fim:hs}; }
    if (per === 'custom') { const i=document.getElementById('df-ini')?.value, f=document.getElementById('df-fim')?.value; if(i&&f) return {ini:i,fim:f}; }
    return { ini:`${hoje.getFullYear()}-01-01`, fim:hs };
}

function _inRange(d) { const {ini,fim}=_getRange(); return d&&d>=ini&&d<=fim; }

function _periodoFiltro(extra='') {
    return `<div><label>Período</label>
    <select id="df-periodo" onchange="document.getElementById('df-custom').style.display=this.value==='custom'?'flex':'none';renderDash(_dashActive)">
        <option value="hoje">Hoje</option><option value="7d">7 dias</option>
        <option value="30d">30 dias</option><option value="mes" selected>Este mês</option>
        <option value="3m">3 meses</option><option value="custom">Personalizado</option>
    </select></div>
    <div id="df-custom" style="display:none;align-items:flex-end;gap:6px">
        <div><label>De</label><input type="date" id="df-ini"></div>
        <div><label>Até</label><input type="date" id="df-fim"></div>
        <button class="dash-filter-btn dash-filter-btn-primary" onclick="renderDash(_dashActive)">Aplicar</button>
    </div>${extra}`;
}

function _kpi(label, val, sub, cor) {
    return `<div class="dkpi dkpi-${cor}"><div class="dkpi-label">${label}</div><div class="dkpi-value">${val}</div>${sub?`<div class="dkpi-sub">${sub}</div>`:''}</div>`;
}

function _badge(txt, cor) { return `<span class="dash-badge dash-badge-${cor}">${txt}</span>`; }

function _statusBadge(s) {
    const m={'Instalado':'green','Orçamento':'gray','Medição':'blue','Aguardando Tecido':'orange','Na Costura':'blue','Pronto p/ Instalação':'green','Aguardando Pagamento':'orange'};
    return _badge(s, m[s]||'gray');
}

function _meses(n) {
    const r=[]; const hoje=new Date();
    for(let i=n-1;i>=0;i--){
        const d=new Date(hoje.getFullYear(),hoje.getMonth()-i,1);
        r.push({label:d.toLocaleString('pt-BR',{month:'short'})+'/'+String(d.getFullYear()).slice(2), key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`});
    }
    return r;
}

function _semanas(n) {
    const r=[]; const hoje=new Date(); hoje.setHours(0,0,0,0);
    for(let i=n-1;i>=0;i--){
        const fim=new Date(hoje); fim.setDate(hoje.getDate()-i*7);
        const ini=new Date(fim);  ini.setDate(fim.getDate()-6);
        r.push({label:ini.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}), ini:ini.toISOString().split('T')[0], fim:fim.toISOString().split('T')[0]});
    }
    return r;
}

function _diasAberto(d) {
    if(!d) return 0;
    return Math.round((Date.now()-new Date(typeof d==='number'?d:d+'T00:00:00').getTime())/86400000);
}

const _tooltipR = { callbacks:{ label: ctx => ' '+_fmtR(ctx.raw) } };
const _tooltipN = { callbacks:{ label: ctx => ' '+_fmtN(ctx.raw) } };
const _scaleY   = { beginAtZero:true, ticks:{ callback:v=>_fmtR(v), font:{size:10} }, grid:{color:'rgba(0,0,0,0.05)'} };
const _scaleYN  = { beginAtZero:true, ticks:{ stepSize:1, font:{size:10} }, grid:{color:'rgba(0,0,0,0.05)'} };
const _scaleX   = { grid:{display:false}, ticks:{font:{size:10}} };

// ─── COMERCIAL ────────────────────────────────────────────────────────────────
function _filtersComercial() {
    const vends = db.vendedores.map(v=>`<option value="${v.id}">${escapeHtml(v.nome)}</option>`).join('');
    const status = ['Orçamento','Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento','Instalado'];
    return _periodoFiltro(`
        <div><label>Vendedor</label>
        <select id="df-vend" onchange="renderDash(_dashActive)">
            <option value="">Todos</option>${vends}
        </select></div>
        <div><label>Status</label>
        <select id="df-status-ped" onchange="renderDash(_dashActive)">
            <option value="">Todos</option>${status.map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select></div>`);
}

function _dashComercial() {
    const {ini,fim} = _getRange();
    const vendFiltro  = document.getElementById('df-vend')?.value || '';
    const stFiltro    = document.getElementById('df-status-ped')?.value || '';
    const inR = d => d && d >= ini && d <= fim;

    let peds = db.pedidos.filter(p => {
        if (vendFiltro && String(p.vendedor_id) !== vendFiltro) return false;
        if (stFiltro && normalizarStatus(p.status) !== stFiltro) return false;
        return true;
    });

    // KPIs
    const orc      = db.pedidos.filter(p => normalizarStatus(p.status)==='Orçamento').length;
    const aprov    = peds.filter(p => normalizarStatus(p.status)!=='Orçamento' && inR(typeof p.data_criacao==='number'?new Date(p.data_criacao).toISOString().split('T')[0]:p.data_criacao));
    const instPer  = peds.filter(p => normalizarStatus(p.status)==='Instalado' && inR(p.data_instalado?new Date(p.data_instalado).toISOString().split('T')[0]:''));
    const fatPer   = instPer.reduce((s,p)=>s+(p.valor||0),0);
    const ticket   = instPer.length ? fatPer/instPer.length : 0;
    const pipeline = peds.filter(p=>{const s=normalizarStatus(p.status);return s!=='Instalado'&&s!=='Orçamento';}).reduce((s,p)=>s+(p.valor||0),0);
    const totalPeds= db.pedidos.filter(p=>normalizarStatus(p.status)!=='Orçamento').length;
    const conv     = db.pedidos.length ? totalPeds/db.pedidos.length*100 : 0;
    const atrasados= db.pedidos.filter(p=>{const s=normalizarStatus(p.status);return s!=='Instalado'&&p.data_entrega&&p.data_entrega<ini.slice(0,10);}).length;

    // Aging médio dos orçamentos
    const orcsAbertos = db.pedidos.filter(p=>normalizarStatus(p.status)==='Orçamento');
    const agingMedio  = orcsAbertos.length ? Math.round(orcsAbertos.reduce((s,p)=>s+_diasAberto(p.data_criacao||p.id),0)/orcsAbertos.length) : 0;

    const el = document.getElementById('dash-content');
    el.innerHTML = `
    <div class="dkpi-grid" style="grid-template-columns:repeat(4,1fr)">${
        _kpi('Orçamentos Abertos', _fmtN(orc), 'aguardando aprovação', 'blue') +
        _kpi('Aprovados no Período', _fmtN(aprov.length), 'saíram de Orçamento', 'green') +
        _kpi('Taxa de Conversão', _fmtPct(conv), `${totalPeds}/${db.pedidos.length} pedidos`, 'purple') +
        _kpi('Faturamento', _fmtR(fatPer), 'pedidos instalados', 'green') +
        _kpi('Ticket Médio', ticket?_fmtR(ticket):'—', `${instPer.length} instalações`, 'teal') +
        _kpi('Pipeline', _fmtR(pipeline), 'pedidos em andamento', 'orange') +
        _kpi('Aging Médio (Orç.)', agingMedio+'d', `${orc} orçamentos abertos`, 'gray') +
        _kpi('Atrasados', _fmtN(atrasados), 'com entrega vencida', 'red')
    }</div>
    <div class="dgrid-2">
        <div class="dchart-card"><h3>📊 Funil de Conversão por Status</h3><div class="dchart-wrap" style="height:220px"><canvas id="dc-funil"></canvas></div></div>
        <div class="dchart-card"><h3>📅 Aging dos Orçamentos Abertos</h3><div class="dchart-wrap" style="height:220px"><canvas id="dc-aging-orc"></canvas></div></div>
    </div>
    <div class="dchart-card" style="margin-bottom:16px"><h3>📈 Faturamento Mensal (12 meses) + Ticket Médio</h3><div class="dchart-wrap" style="height:200px"><canvas id="dc-fat-mes"></canvas></div></div>
    <div class="dchart-card" style="margin-bottom:16px"><h3>👤 Performance por Vendedor</h3><div class="dchart-wrap" style="height:${Math.max(180,db.vendedores.length*40)}px"><canvas id="dc-vend-perf"></canvas></div></div>
    <div class="dgrid-2">
        <div class="dchart-card">
            <h3>📋 Orçamentos Abertos (${orcsAbertos.length})</h3>
            <table class="dash-table"><thead><tr><th>#</th><th>Cliente</th><th>Valor</th><th>Vendedor</th><th>Dias em Aberto</th></tr></thead><tbody>${
                orcsAbertos.length ? orcsAbertos.sort((a,b)=>_diasAberto(b.data_criacao||b.id)-_diasAberto(a.data_criacao||a.id)).slice(0,12).map(p=>{
                    const dias=_diasAberto(p.data_criacao||p.id);
                    return `<tr><td><a href="pedido.html?edit=${p.id}" style="color:var(--primary);font-weight:700">#${formatPedidoId(p.id)}</a></td>
                    <td>${escapeHtml(p.clienteNome||'—')}</td><td>${_fmtR(p.valor)}</td>
                    <td>${escapeHtml(p.vendedor_nome||'—')}</td>
                    <td>${_badge(dias+'d', dias>30?'red':dias>15?'orange':'green')}</td></tr>`;
                }).join('') : `<tr><td colspan="5" class="dash-empty">Sem orçamentos abertos</td></tr>`
            }</tbody></table>
        </div>
        <div class="dchart-card">
            <h3>🏆 Top 10 Clientes por Faturamento</h3>
            <table class="dash-table"><thead><tr><th>Cliente</th><th>Pedidos</th><th>Faturado</th></tr></thead><tbody>${(()=>{
                const m={};
                db.pedidos.filter(p=>normalizarStatus(p.status)==='Instalado').forEach(p=>{
                    const n=p.clienteNome||'—'; if(!m[n])m[n]={v:0,q:0}; m[n].v+=(p.valor||0); m[n].q++;
                });
                const rows=Object.entries(m).sort(([,a],[,b])=>b.v-a.v).slice(0,10);
                return rows.length ? rows.map(([n,d])=>`<tr><td>${escapeHtml(n)}</td><td>${_fmtN(d.q)}</td><td>${_fmtR(d.v)}</td></tr>`).join('') : `<tr><td colspan="3" class="dash-empty">Sem dados</td></tr>`;
            })()}</tbody></table>
        </div>
    </div>`;

    // Funil — só aplica filtro de vendedor (filtrar por status tornaria o funil inútil)
    const pedsVend = vendFiltro ? db.pedidos.filter(p=>String(p.vendedor_id)===vendFiltro) : db.pedidos;
    const STATUS_P = ['Orçamento','Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento','Instalado'];
    const CORES_F  = ['#94a3b8','#60a5fa','#a78bfa','#f472b6','#34d399','#fbbf24','#22c55e'];
    const countsF  = STATUS_P.map(s=>pedsVend.filter(p=>normalizarStatus(p.status)===s).length);
    const valoresF = STATUS_P.map(s=>pedsVend.filter(p=>normalizarStatus(p.status)===s).reduce((a,p)=>a+(p.valor||0),0));
    _mkChart('dc-funil',{type:'bar',data:{labels:STATUS_P.map(s=>s.length>14?s.slice(0,14)+'…':s),datasets:[
        {label:'Qtd. Pedidos',data:countsF,backgroundColor:CORES_F.map(c=>c+'cc'),borderColor:CORES_F,borderWidth:1,borderRadius:4,yAxisID:'y'},
        {label:'Valor Total (R$)',data:valoresF,backgroundColor:'rgba(42,92,130,0.15)',borderColor:'#2A5C82',borderWidth:2,type:'line',yAxisID:'y2',tension:0.3}
    ]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{callbacks:{label:ctx=>ctx.datasetIndex===0?` ${ctx.raw} pedidos`:` ${_fmtR(ctx.raw)}`}}},scales:{y:{ticks:{font:{size:10}},grid:{display:false}},y2:{position:'right',beginAtZero:true,ticks:{callback:v=>_fmtR(v),font:{size:9}},grid:{display:false}}}}});

    // Aging orçamentos
    const agFaixas = ['0–7 dias','8–15 dias','16–30 dias','+30 dias'];
    const agCount  = [0,0,0,0];
    orcsAbertos.forEach(p=>{ const d=_diasAberto(p.data_criacao||p.id); if(d<=7)agCount[0]++;else if(d<=15)agCount[1]++;else if(d<=30)agCount[2]++;else agCount[3]++; });
    _mkChart('dc-aging-orc',{type:'doughnut',data:{labels:agFaixas,datasets:[{data:agCount,backgroundColor:['#22c55ecc','#f59e0bcc','#ef4444cc','#991b1bcc'],borderWidth:2,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:10}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} orçamento(s)`}}}}});

    // Faturamento mensal — aplica filtro de vendedor
    const mes12 = _meses(12);
    const fatM  = mes12.map(m=>pedsVend.filter(p=>normalizarStatus(p.status)==='Instalado'&&p.data_instalado&&new Date(p.data_instalado).toISOString().slice(0,7)===m.key).reduce((s,p)=>s+(p.valor||0),0));
    const cntM  = mes12.map(m=>pedsVend.filter(p=>normalizarStatus(p.status)==='Instalado'&&p.data_instalado&&new Date(p.data_instalado).toISOString().slice(0,7)===m.key).length);
    const tkM   = fatM.map((f,i)=>cntM[i]?f/cntM[i]:0);
    _mkChart('dc-fat-mes',{data:{labels:mes12.map(m=>m.label),datasets:[
        {type:'bar',label:'Faturamento',data:fatM,backgroundColor:'#86efaccc',borderColor:'#22c55e',borderWidth:1,borderRadius:3,yAxisID:'y'},
        {type:'line',label:'Ticket Médio',data:tkM,borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,0.07)',borderWidth:2,pointRadius:3,fill:true,tension:0.3,yAxisID:'y2'}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{callbacks:{label:ctx=>` ${_fmtR(ctx.raw)}`}}},scales:{y:{..._scaleY,position:'left'},y2:{position:'right',beginAtZero:true,ticks:{callback:v=>_fmtR(v),font:{size:9}},grid:{display:false}},..._scaleX}}});

    // Performance vendedor — aplica filtro de período (instalações no período) e de vendedor
    const vendMap={};
    pedsVend.filter(p=>p.vendedor_nome).forEach(p=>{
        const n=p.vendedor_nome; if(!vendMap[n])vendMap[n]={fat:0,q:0};
        if(normalizarStatus(p.status)==='Instalado'&&p.data_instalado){
            const dp=new Date(p.data_instalado).toISOString().split('T')[0];
            if(dp>=ini&&dp<=fim) vendMap[n].fat+=(p.valor||0);
        }
        vendMap[n].q++;
    });
    const vendRows=Object.entries(vendMap).sort(([,a],[,b])=>b.fat-a.fat);
    if(vendRows.length){
        _mkChart('dc-vend-perf',{type:'bar',data:{labels:vendRows.map(([n])=>n),datasets:[
            {label:'Faturado',data:vendRows.map(([,d])=>d.fat),backgroundColor:'#2A5C82cc',borderColor:'#2A5C82',borderWidth:1,borderRadius:4,yAxisID:'y'},
            {label:'Pedidos',data:vendRows.map(([,d])=>d.q),backgroundColor:'#f59e0bcc',borderColor:'#f59e0b',borderWidth:1,borderRadius:4,type:'line',yAxisID:'y2',tension:0.3}
        ]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{callbacks:{label:ctx=>ctx.datasetIndex===0?` ${_fmtR(ctx.raw)}`:` ${ctx.raw} pedidos`}}},scales:{y:{ticks:{font:{size:11}},grid:{display:false}},y2:{position:'right',beginAtZero:true,ticks:{stepSize:1,font:{size:9}},grid:{display:false}}}}});
    }
}

// ─── PRODUÇÃO ─────────────────────────────────────────────────────────────────
function _filtersProducao() {
    const status = ['Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento'];
    const vends  = db.vendedores.map(v=>`<option value="${v.id}">${escapeHtml(v.nome)}</option>`).join('');
    const tecs   = db.catalogo.map(c=>`<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
    return _periodoFiltro(`
        <div><label>Status</label><select id="df-st-pcp" onchange="renderDash(_dashActive)">
            <option value="">Todos em produção</option>${status.map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select></div>
        <div><label>Vendedor</label><select id="df-vend-pcp" onchange="renderDash(_dashActive)">
            <option value="">Todos</option>${vends}
        </select></div>
        <div><label>Tecido</label><select id="df-tec-pcp" onchange="renderDash(_dashActive)">
            <option value="">Todos</option>${tecs}
        </select></div>`);
}

function _dashProducao() {
    const {ini,fim}  = _getRange();
    const stFiltro   = document.getElementById('df-st-pcp')?.value || '';
    const vendFiltro = document.getElementById('df-vend-pcp')?.value || '';
    const tecFiltro  = document.getElementById('df-tec-pcp')?.value || '';
    const hoje       = new Date().toISOString().split('T')[0];

    const EM_PROD = ['Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento'];

    let peds = db.pedidos.filter(p => {
        const s = normalizarStatus(p.status);
        if (stFiltro ? s !== stFiltro : !EM_PROD.includes(s)) return false;
        if (vendFiltro && String(p.vendedor_id) !== vendFiltro) return false;
        if (tecFiltro) {
            const amb = p.ambientes || [];
            const temTec = amb.some(a=>(a.tecidos||[]).some(t=>String(t.tecidoId)===tecFiltro));
            if (!temTec) return false;
        }
        return true;
    });

    const atrasados  = peds.filter(p=>p.data_entrega&&p.data_entrega<hoje);
    const prontos    = peds.filter(p=>normalizarStatus(p.status)==='Pronto p/ Instalação');
    const agPag      = peds.filter(p=>normalizarStatus(p.status)==='Aguardando Pagamento');
    const instPer    = db.pedidos.filter(p=>normalizarStatus(p.status)==='Instalado'&&p.data_instalado&&new Date(p.data_instalado).toISOString().split('T')[0]>=ini&&new Date(p.data_instalado).toISOString().split('T')[0]<=fim);

    // Tempo médio de produção (criação → instalação)
    const tempos = db.pedidos.filter(p=>normalizarStatus(p.status)==='Instalado'&&p.data_instalado&&(p.data_criacao||p.id)).map(p=>{
        const ini2=typeof(p.data_criacao||p.id)==='number'?(p.data_criacao||p.id):new Date((p.data_criacao||p.id)).getTime();
        return Math.round((p.data_instalado-ini2)/86400000);
    }).filter(d=>d>0&&d<730);
    const tmpMedio = tempos.length ? Math.round(tempos.reduce((s,d)=>s+d,0)/tempos.length) : 0;

    const el = document.getElementById('dash-content');
    el.innerHTML = `
    <div class="dkpi-grid" style="grid-template-columns:repeat(3,1fr)">${
        _kpi('Em Produção', _fmtN(peds.length), 'pedidos ativos', 'blue') +
        _kpi('Atrasados', _fmtN(atrasados.length), 'entrega vencida', 'red') +
        _kpi('Prontos p/ Instalar', _fmtN(prontos.length), 'aguardando agendamento', 'green') +
        _kpi('Ag. Pagamento', _fmtN(agPag.length), 'antes de instalar', 'orange') +
        _kpi('Tempo Médio', tmpMedio?tmpMedio+'d':'—', 'produção até entrega', 'teal') +
        _kpi('Instalados no Período', _fmtN(instPer.length), _fmtR(instPer.reduce((s,p)=>s+(p.valor||0),0)), 'purple')
    }</div>
    <div class="dgrid-2" style="margin-bottom:16px">
        <div class="dchart-card"><h3>📊 Distribuição por Status (Qtd + Valor)</h3><div class="dchart-wrap" style="height:220px"><canvas id="dc-pcp-status"></canvas></div></div>
        <div class="dchart-card"><h3>⏱ Tempo Médio por Etapa (dias)</h3><div class="dchart-wrap" style="height:220px"><canvas id="dc-pcp-tempo"></canvas></div></div>
    </div>
    <div class="dgrid-2" style="margin-bottom:16px">
        <div class="dchart-card"><h3>📆 Volume de Novos Pedidos — Últimas 8 Semanas</h3><div class="dchart-wrap" style="height:180px"><canvas id="dc-pcp-semanas"></canvas></div></div>
        <div class="dchart-card"><h3>🧵 Pedidos por Tecido (top 8)</h3><div class="dchart-wrap" style="height:180px"><canvas id="dc-pcp-tec"></canvas></div></div>
    </div>
    <div class="dchart-card">
        <h3>📋 Pedidos em Produção (${peds.length})</h3>
        <table class="dash-table"><thead><tr><th>#</th><th>Cliente</th><th>Ambiente</th><th>Status</th><th>Entrega</th><th>Prazo</th><th>Valor</th></tr></thead>
        <tbody>${peds.length ? peds.sort((a,b)=>(a.data_entrega||'9').localeCompare(b.data_entrega||'9')).map(p=>{
            const diff = p.data_entrega ? Math.round((new Date(p.data_entrega+'T00:00:00')-new Date(hoje+'T00:00:00'))/86400000) : null;
            const prazoBadge = diff===null ? _badge('Sem data','gray') : diff<0 ? _badge(Math.abs(diff)+'d atraso','red') : diff===0 ? _badge('Hoje','orange') : _badge(diff+'d','green');
            return `<tr><td><a href="pedido.html?edit=${p.id}" style="color:var(--primary);font-weight:700">#${formatPedidoId(p.id)}</a></td>
            <td>${escapeHtml(p.clienteNome||'—')}</td><td style="font-size:11px">${escapeHtml(p.amb||'—')}</td>
            <td>${_statusBadge(normalizarStatus(p.status))}</td>
            <td>${p.data_entrega?_fmtDate(p.data_entrega):'—'}</td><td>${prazoBadge}</td><td>${_fmtR(p.valor)}</td></tr>`;
        }).join('') : `<tr><td colspan="7" class="dash-empty">Nenhum pedido em produção com os filtros selecionados</td></tr>`}</tbody></table>
    </div>`;

    // Base filtrada para gráficos — sem filtro de status (para mostrar todos os status no gráfico)
    const pedsBase = db.pedidos.filter(p=>{
        const s=normalizarStatus(p.status);
        if(!EM_PROD.includes(s)) return false;
        if(vendFiltro&&String(p.vendedor_id)!==vendFiltro) return false;
        if(tecFiltro){const amb=p.ambientes||[];if(!amb.some(a=>(a.tecidos||[]).some(t=>String(t.tecidoId)===tecFiltro)))return false;}
        return true;
    });
    // Status dist
    const stCores = {'Medição':'#60a5fa','Aguardando Tecido':'#a78bfa','Na Costura':'#f472b6','Pronto p/ Instalação':'#34d399','Aguardando Pagamento':'#fbbf24'};
    const stData  = EM_PROD.map(s=>({s,q:pedsBase.filter(p=>normalizarStatus(p.status)===s).length,v:pedsBase.filter(p=>normalizarStatus(p.status)===s).reduce((a,p)=>a+(p.valor||0),0)}));
    _mkChart('dc-pcp-status',{type:'bar',data:{labels:stData.map(d=>d.s.length>14?d.s.slice(0,14)+'…':d.s),datasets:[
        {label:'Qtd.',data:stData.map(d=>d.q),backgroundColor:EM_PROD.map(s=>stCores[s]+'cc'),borderColor:EM_PROD.map(s=>stCores[s]),borderWidth:1,borderRadius:4,yAxisID:'y'},
        {label:'Valor',data:stData.map(d=>d.v),type:'line',borderColor:'#2A5C82',backgroundColor:'rgba(42,92,130,0.07)',borderWidth:2,pointRadius:3,tension:0.3,yAxisID:'y2'}
    ]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{callbacks:{label:ctx=>ctx.datasetIndex===0?` ${ctx.raw} pedidos`:` ${_fmtR(ctx.raw)}`}}},scales:{y:{ticks:{font:{size:10}},grid:{display:false}},y2:{position:'right',beginAtZero:true,ticks:{callback:v=>_fmtR(v),font:{size:9}},grid:{display:false}}}}});

    // Tempo por etapa
    const etapas = [['Orçamento','Medição'],['Medição','Aguardando Tecido'],['Aguardando Tecido','Na Costura'],['Na Costura','Pronto p/ Instalação'],['Pronto p/ Instalação','Instalado']];
    const etapaLabels = ['Orc.→Med.','Med.→Tec.','Tec.→Cost.','Cost.→Pronto','Pronto→Inst.'];
    const etapaTmps = etapas.map(([de,para])=>{
        const ts=db.pedidos.filter(p=>p.timeline&&p.timeline.length>=2).map(p=>{
            const tDe=p.timeline.find(t=>t.status===de); const tPara=p.timeline.find(t=>t.status===para);
            if(!tDe||!tPara||tPara.data<=tDe.data) return null;
            return Math.round((tPara.data-tDe.data)/86400000);
        }).filter(d=>d&&d>0&&d<365);
        return ts.length ? Math.round(ts.reduce((s,d)=>s+d,0)/ts.length) : 0;
    });
    _mkChart('dc-pcp-tempo',{type:'bar',data:{labels:etapaLabels,datasets:[{label:'Dias médios',data:etapaTmps,backgroundColor:['#60a5facc','#a78bfacc','#f472b6cc','#34d399cc','#22c55ecc'],borderColor:['#60a5fa','#a78bfa','#f472b6','#34d399','#22c55e'],borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} dias médios`}}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,font:{size:10}},grid:{color:'rgba(0,0,0,0.05)'}},x:{..._scaleX}}}});

    // Volume semanal — usa lista filtrada (pedsBase)
    const sem8 = _semanas(8);
    const volSem = sem8.map(s=>pedsBase.filter(p=>{const d=p.data_criacao?new Date(p.data_criacao).toISOString().split('T')[0]:null;return d&&d>=s.ini&&d<=s.fim;}).length);
    _mkChart('dc-pcp-semanas',{type:'line',data:{labels:sem8.map(s=>s.label),datasets:[{label:'Novos pedidos',data:volSem,borderColor:'#2A5C82',backgroundColor:'rgba(42,92,130,0.1)',borderWidth:2,pointRadius:4,fill:true,tension:0.3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{..._tooltipN}},scales:{y:{..._scaleYN},x:{..._scaleX}}}});

    // Tecidos mais usados — usa lista filtrada (pedsBase)
    const tecMap={};
    pedsBase.forEach(p=>(p.ambientes||[]).forEach(a=>(a.tecidos||[]).forEach(t=>{if(t.tecidoNome){tecMap[t.tecidoNome]=(tecMap[t.tecidoNome]||0)+1;}})));
    const topTec=Object.entries(tecMap).sort(([,a],[,b])=>b-a).slice(0,8);
    if(topTec.length) _mkChart('dc-pcp-tec',{type:'doughnut',data:{labels:topTec.map(([n])=>n.length>16?n.slice(0,16)+'…':n),datasets:[{data:topTec.map(([,v])=>v),backgroundColor:['#2563ebcc','#7c3aedcc','#db2777cc','#059669cc','#d97706cc','#dc2626cc','#0891b2cc','#6b7280cc'],borderWidth:2,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} pedidos`}}}}});
}

// ─── ESTOQUE ──────────────────────────────────────────────────────────────────
function _filtersEstoque() {
    const forns = db.fornecedores.map(f=>`<option value="${f.id}">${escapeHtml(f.nome_fantasia||f.razao_social)}</option>`).join('');
    return `<div><label>Tipo</label><select id="df-est-tipo" onchange="renderDash(_dashActive)">
        <option value="">Todos</option><option value="tecido">Tecidos</option><option value="material">Materiais</option>
    </select></div>
    <div><label>Fornecedor</label><select id="df-est-forn" onchange="renderDash(_dashActive)">
        <option value="">Todos</option>${forns}
    </select></div>
    <div style="display:flex;align-items:flex-end;gap:6px"><label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="df-est-crit" onchange="renderDash(_dashActive)"> Apenas críticos
    </label></div>`;
}

function _dashEstoque() {
    const tipo    = document.getElementById('df-est-tipo')?.value || '';
    const fornF   = document.getElementById('df-est-forn')?.value || '';
    const apenasCrit = document.getElementById('df-est-crit')?.checked || false;

    // Tecidos filtrados
    let tecs = db.catalogo.filter(c=>{
        if(fornF && String(c.fornecedor_id)!==fornF) return false;
        return true;
    });
    let mats = db.materiais.filter(m=>{
        if(fornF && String(m.fornecedor_id)!==fornF) return false;
        return true;
    });

    if(tipo==='tecido') mats=[];
    if(tipo==='material') tecs=[];

    const tecCrit = tecs.filter(c=>c.min_estoque>0&&estoqueDisponivel(c.id)<c.min_estoque);
    const matCrit = mats.filter(m=>m.min_estoque>0&&(m.estoque_atual||0)<m.min_estoque);
    const totalItens = (tipo!=='material'?db.estoque.length:0) + (tipo!=='tecido'?mats.length:0);
    const totalCrit  = tecCrit.length + matCrit.length;

    // Valor estimado em estoque (tecidos)
    const valEstoque = tecs.reduce((s,c)=>s+estoqueDisponivel(c.id)*(c.preco||0),0)
                     + mats.reduce((s,m)=>s+(m.estoque_atual||0)*(m.preco||0),0);

    // Consumo projetado
    const consProj = db.pedidos.filter(p=>{const s=normalizarStatus(p.status);return s!=='Instalado'&&s!=='Orçamento';}).reduce((s,p)=>s+(p.total_material||0),0);

    // Entradas este mês
    const mesAtual = new Date().toISOString().slice(0,7);
    const entMes   = db.movimentos.filter(m=>m.tipo==='Entrada'&&new Date(m.data).toISOString().slice(0,7)===mesAtual).length;

    const el = document.getElementById('dash-content');
    el.innerHTML = `
    <div class="dkpi-grid" style="grid-template-columns:repeat(3,1fr)">${
        _kpi('Total em Estoque', _fmtN(totalItens), 'rolos + materiais', 'blue') +
        _kpi('Itens Críticos', _fmtN(totalCrit), 'abaixo do mínimo', 'red') +
        _kpi('Valor Estimado', _fmtR(valEstoque), 'a preço de venda', 'green') +
        _kpi('Consumo Projetado', _fmtR(consProj), 'pedidos em andamento', 'orange') +
        _kpi('Necessidade Recompra', _fmtN(totalCrit), 'itens', 'red') +
        _kpi('Entradas Este Mês', _fmtN(entMes), 'movimentos registrados', 'teal')
    }</div>
    <div class="dchart-card" style="margin-bottom:16px"><h3>🧵 Nível de Estoque por Tecido — Atual vs. Mínimo (top 12)</h3><div class="dchart-wrap" style="height:${Math.min(12,tecs.length)*36+60}px"><canvas id="dc-est-tec"></canvas></div></div>
    <div class="dgrid-2" style="margin-bottom:16px">
        <div class="dchart-card"><h3>📦 Materiais Críticos (% do mínimo)</h3><div class="dchart-wrap" style="height:${Math.max(160,matCrit.length*36+60)}px"><canvas id="dc-est-mat-crit"></canvas></div></div>
        <div class="dchart-card"><h3>📈 Movimentações — Últimos 30 dias</h3><div class="dchart-wrap" style="height:200px"><canvas id="dc-est-mov"></canvas></div></div>
    </div>
    <div class="dgrid-2">
        <div class="dchart-card">
            <h3>⚠️ Itens para Recompra</h3>
            <table class="dash-table"><thead><tr><th>Item</th><th>Tipo</th><th>Atual</th><th>Mínimo</th><th>Déficit</th><th>Fornecedor</th></tr></thead>
            <tbody>${(()=>{
                const rows=[
                    ...tecCrit.map(c=>{const disp=estoqueDisponivel(c.id).toFixed(2);const forn=db.fornecedores.find(f=>f.id==c.fornecedor_id);return `<tr><td><strong>${escapeHtml(c.nome)}</strong></td><td>${_badge('Tecido','blue')}</td><td>${disp} m</td><td>${c.min_estoque} m</td><td>${_badge((c.min_estoque-parseFloat(disp)).toFixed(2)+' m','red')}</td><td>${escapeHtml(forn?.nome_fantasia||forn?.razao_social||'—')}</td></tr>`;}),
                    ...matCrit.map(m=>{const forn=db.fornecedores.find(f=>f.id==m.fornecedor_id);return `<tr><td><strong>${escapeHtml(m.nome)}</strong></td><td>${_badge('Material','orange')}</td><td>${(m.estoque_atual||0).toFixed(2)} ${m.unidade}</td><td>${m.min_estoque}</td><td>${_badge(((m.min_estoque-(m.estoque_atual||0)).toFixed(2))+' '+m.unidade,'red')}</td><td>${escapeHtml(forn?.nome_fantasia||forn?.razao_social||'—')}</td></tr>`;})
                ];
                return rows.length ? rows.join('') : `<tr><td colspan="6" class="dash-empty">Nenhum item abaixo do mínimo 🎉</td></tr>`;
            })()}</tbody></table>
        </div>
        <div class="dchart-card">
            <h3>🕒 Últimas 10 Movimentações</h3>
            <table class="dash-table"><thead><tr><th>Data</th><th>Tipo</th><th>Item</th><th>Qtd</th></tr></thead>
            <tbody>${db.movimentos.slice(0,10).map(m=>`<tr>
                <td style="white-space:nowrap">${new Date(m.data).toLocaleDateString('pt-BR')}</td>
                <td>${_badge(m.tipo, m.tipo==='Entrada'?'green':m.tipo.includes('Baixa')?'red':'orange')}</td>
                <td style="font-size:11px">${escapeHtml(m.item_nome)}</td>
                <td>${(m.quantidade||0).toFixed(2)} ${m.unidade||''}</td>
            </tr>`).join('') || `<tr><td colspan="4" class="dash-empty">Sem movimentos</td></tr>`}</tbody></table>
        </div>
    </div>`;

    // Tecidos: atual vs. mínimo
    const topTecs = tecs.filter(c=>c.min_estoque>0||estoqueDisponivel(c.id)>0).sort((a,b)=>estoqueDisponivel(b.id)-estoqueDisponivel(a.id)).slice(0,12);
    if(topTecs.length){
        const dispArr = topTecs.map(c=>estoqueDisponivel(c.id));
        const minArr  = topTecs.map(c=>c.min_estoque||0);
        _mkChart('dc-est-tec',{type:'bar',data:{labels:topTecs.map(c=>c.nome.length>18?c.nome.slice(0,18)+'…':c.nome),datasets:[
            {label:'Disponível (m)',data:dispArr,backgroundColor:dispArr.map((d,i)=>d<minArr[i]?'#ef4444cc':'#22c55ecc'),borderColor:dispArr.map((d,i)=>d<minArr[i]?'#ef4444':'#22c55e'),borderWidth:1,borderRadius:4},
            {label:'Mínimo (m)',data:minArr,backgroundColor:'rgba(0,0,0,0)',borderColor:'#f59e0b',borderWidth:2,type:'line',pointRadius:4,tension:0}
        ]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{callbacks:{label:ctx=>` ${ctx.raw.toFixed(2)} m`}}},scales:{y:{ticks:{font:{size:10}},grid:{display:false}},x:{beginAtZero:true,ticks:{font:{size:10}},grid:{color:'rgba(0,0,0,0.05)'}}}}});
    }

    // Materiais críticos %
    if(matCrit.length){
        const pcts = matCrit.map(m=>Math.min(200,((m.estoque_atual||0)/m.min_estoque*100)));
        _mkChart('dc-est-mat-crit',{type:'bar',data:{labels:matCrit.map(m=>m.nome.length>16?m.nome.slice(0,16)+'…':m.nome),datasets:[{label:'% do mínimo',data:pcts,backgroundColor:pcts.map(p=>p<50?'#ef4444cc':'#f59e0bcc'),borderColor:pcts.map(p=>p<50?'#ef4444':'#f59e0b'),borderWidth:1,borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw.toFixed(1)}% do mínimo`}}},scales:{y:{ticks:{font:{size:10}},grid:{display:false}},x:{beginAtZero:true,max:110,ticks:{callback:v=>v+'%',font:{size:10}},grid:{color:'rgba(0,0,0,0.05)'}}}}});
    }

    // Movimentos últimos 30 dias
    const hoje30=new Date(); hoje30.setDate(hoje30.getDate()-29);
    const dias30=[]; for(let i=0;i<30;i++){const d=new Date(hoje30);d.setDate(d.getDate()+i);dias30.push(d.toISOString().split('T')[0]);}
    const movE=dias30.map(d=>db.movimentos.filter(m=>m.tipo==='Entrada'&&new Date(m.data).toISOString().split('T')[0]===d).length);
    const movS=dias30.map(d=>db.movimentos.filter(m=>m.tipo!=='Entrada'&&new Date(m.data).toISOString().split('T')[0]===d).length);
    _mkChart('dc-est-mov',{type:'line',data:{labels:dias30.filter((_,i)=>i%5===0).map(d=>d.slice(5).split('-').reverse().join('/')),datasets:[
        {label:'Entradas',data:dias30.filter((_,i)=>i%5===0).map((_,i)=>movE.slice(i*5,(i+1)*5).reduce((a,b)=>a+b,0)),borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,0.1)',borderWidth:2,pointRadius:3,fill:true,tension:0.3},
        {label:'Saídas',data:dias30.filter((_,i)=>i%5===0).map((_,i)=>movS.slice(i*5,(i+1)*5).reduce((a,b)=>a+b,0)),borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,0.1)',borderWidth:2,pointRadius:3,fill:true,tension:0.3}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{..._tooltipN}},scales:{y:{..._scaleYN},x:{..._scaleX}}}});
}

// ─── INSTALAÇÕES ──────────────────────────────────────────────────────────────
function _filtersInstalacoes() {
    return _periodoFiltro(`
        <div><label>Status Pagamento</label><select id="df-inst-pag" onchange="renderDash(_dashActive)">
            <option value="">Todos</option><option value="pago">Pago</option>
            <option value="pendente">Pendente</option><option value="atrasado">Atrasado</option>
        </select></div>`);
}

function _dashInstalacoes() {
    const {ini,fim} = _getRange();
    const pagF = document.getElementById('df-inst-pag')?.value || '';
    const hoje = new Date().toISOString().split('T')[0];

    const EM_INST = ['Pronto p/ Instalação','Aguardando Pagamento'];
    const agendadas = db.pedidos.filter(p=>EM_INST.includes(normalizarStatus(p.status)));
    const atrasadas = agendadas.filter(p=>p.data_entrega&&p.data_entrega<hoje);
    const instPer   = db.pedidos.filter(p=>normalizarStatus(p.status)==='Instalado'&&p.data_instalado&&new Date(p.data_instalado).toISOString().split('T')[0]>=ini&&new Date(p.data_instalado).toISOString().split('T')[0]<=fim);
    const semData   = agendadas.filter(p=>!p.data_entrega);
    const proximas  = agendadas.filter(p=>p.data_entrega&&p.data_entrega>=hoje);

    // Valor pendente
    const valPend = agendadas.reduce((s,p)=>s+(p.valor||0)-(p.valor_recebido||0),0);

    // Status pagamento das agendadas
    const crMap = {};
    db.contas_receber.forEach(cr=>{if(cr.pedido_id)crMap[cr.pedido_id]=(crMap[cr.pedido_id]||[]).concat(cr);});
    const pagStatus = p => {
        const crs = crMap[p.id]||[];
        if(!crs.length) return 'pendente';
        if(crs.every(c=>c.status==='Pago')) return 'pago';
        if(crs.some(c=>c.status==='Atrasado')) return 'atrasado';
        return 'pendente';
    };

    let lista = agendadas;
    if(pagF) lista = lista.filter(p=>pagStatus(p)===pagF);

    const el = document.getElementById('dash-content');
    el.innerHTML = `
    <div class="dkpi-grid" style="grid-template-columns:repeat(5,1fr)">${
        _kpi('Agendadas', _fmtN(agendadas.length), 'próx. 30 dias e além', 'blue') +
        _kpi('Atrasadas', _fmtN(atrasadas.length), 'entrega vencida', 'red') +
        _kpi('Instaladas no Período', _fmtN(instPer.length), _fmtR(instPer.reduce((s,p)=>s+(p.valor||0),0)), 'green') +
        _kpi('Valor Pendente', _fmtR(valPend), 'total a receber', 'orange') +
        _kpi('Sem Data', _fmtN(semData.length), 'precisam agendamento', 'gray')
    }</div>
    <div class="dgrid-2" style="margin-bottom:16px">
        <div class="dchart-card"><h3>📅 Carga de Instalações — Próximos 30 dias</h3><div class="dchart-wrap" style="height:200px"><canvas id="dc-inst-carga"></canvas></div></div>
        <div class="dchart-card"><h3>💰 Status de Pagamento das Agendadas</h3><div class="dchart-wrap" style="height:200px"><canvas id="dc-inst-pag"></canvas></div></div>
    </div>
    <div class="dchart-card" style="margin-bottom:16px"><h3>📈 Instalações por Semana — Últimas 8 semanas</h3><div class="dchart-wrap" style="height:160px"><canvas id="dc-inst-sem"></canvas></div></div>
    <div class="dchart-card">
        <h3>🔧 Instalações Agendadas (${lista.length})</h3>
        <table class="dash-table"><thead><tr><th>#</th><th>Cliente</th><th>Data Instalação</th><th>Prazo</th><th>Endereço</th><th>Valor</th><th>Pagamento</th></tr></thead>
        <tbody>${lista.length ? lista.sort((a,b)=>(a.data_entrega||'9').localeCompare(b.data_entrega||'9')).map(p=>{
            const diff = p.data_entrega ? Math.round((new Date(p.data_entrega+'T00:00:00')-new Date(hoje+'T00:00:00'))/86400000) : null;
            const prazoBadge = diff===null?_badge('Sem data','gray'):diff<0?_badge(Math.abs(diff)+'d atraso','red'):diff===0?_badge('Hoje','orange'):_badge(diff+'d','green');
            const ps = pagStatus(p);
            const pagBadge = _badge(ps==='pago'?'Pago':ps==='atrasado'?'Atrasado':'Pendente', ps==='pago'?'green':ps==='atrasado'?'red':'orange');
            return `<tr><td><a href="pedido.html?edit=${p.id}" style="color:var(--primary);font-weight:700">#${formatPedidoId(p.id)}</a></td>
            <td>${escapeHtml(p.clienteNome||'—')}</td>
            <td>${p.data_entrega?_fmtDate(p.data_entrega):'—'}</td>
            <td>${prazoBadge}</td>
            <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.inst_endereco||'—')}</td>
            <td>${_fmtR(p.valor)}</td><td>${pagBadge}</td></tr>`;
        }).join('') : `<tr><td colspan="7" class="dash-empty">Nenhuma instalação com os filtros selecionados</td></tr>`}</tbody></table>
    </div>`;

    // Carga 30 dias — usa lista com filtro de pagamento aplicado
    const prox30=[]; const base=new Date(); base.setHours(0,0,0,0);
    for(let i=0;i<30;i++){const d=new Date(base);d.setDate(d.getDate()+i);prox30.push(d.toISOString().split('T')[0]);}
    const carga=prox30.map(d=>lista.filter(p=>p.data_entrega===d).length);
    _mkChart('dc-inst-carga',{type:'bar',data:{labels:prox30.map(d=>d.slice(5).split('-').reverse().join('/')),datasets:[{label:'Instalações',data:carga,backgroundColor:carga.map(v=>v>2?'#ef4444cc':v>0?'#2563ebcc':'#e5e7eb'),borderColor:carga.map(v=>v>2?'#ef4444':v>0?'#2563eb':'#d1d5db'),borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} instalação(ões)`}}},scales:{y:{..._scaleYN},x:{ticks:{font:{size:8},maxRotation:45},grid:{display:false}}}}});

    // Status pagamento donut
    const pgCnt={pago:0,pendente:0,atrasado:0};
    agendadas.forEach(p=>{pgCnt[pagStatus(p)]++;});
    _mkChart('dc-inst-pag',{type:'doughnut',data:{labels:['Pago','Pendente','Atrasado'],datasets:[{data:[pgCnt.pago,pgCnt.pendente,pgCnt.atrasado],backgroundColor:['#22c55ecc','#f59e0bcc','#ef4444cc'],borderWidth:2,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:10}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} pedido(s)`}}}}});

    // Semanas — usa pedidos instalados filtrados pelo período do filtro de pagamento
    const sem8=_semanas(8);
    const instSem=sem8.map(s=>{
        return db.pedidos.filter(p=>{
            if(normalizarStatus(p.status)!=='Instalado'||!p.data_instalado) return false;
            const dp=new Date(p.data_instalado).toISOString().split('T')[0];
            if(dp<s.ini||dp>s.fim) return false;
            if(pagF) return pagStatus(p)===pagF;
            return true;
        }).length;
    });
    _mkChart('dc-inst-sem',{type:'line',data:{labels:sem8.map(s=>s.label),datasets:[{label:'Instalações realizadas',data:instSem,borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,0.1)',borderWidth:2,pointRadius:4,fill:true,tension:0.3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{..._tooltipN}},scales:{y:{..._scaleYN},x:{..._scaleX}}}});
}

// ─── COMPRAS ──────────────────────────────────────────────────────────────────
function _filtersCompras() {
    const forns = db.fornecedores.map(f=>`<option value="${f.id}">${escapeHtml(f.nome_fantasia||f.razao_social)}</option>`).join('');
    return _periodoFiltro(`
        <div><label>Fornecedor</label><select id="df-cmp-forn" onchange="renderDash(_dashActive)">
            <option value="">Todos</option>${forns}
        </select></div>
        <div><label>Status do PC</label><select id="df-cmp-st" onchange="renderDash(_dashActive)">
            <option value="">Todos</option><option value="Rascunho">Rascunho</option>
            <option value="Enviado">Enviado</option><option value="Recebido">Recebido</option>
        </select></div>`);
}

function _dashCompras() {
    const {ini,fim} = _getRange();
    const fornF  = document.getElementById('df-cmp-forn')?.value || '';
    const stFiltro = document.getElementById('df-cmp-st')?.value || '';
    const inR = d => d && d >= ini && d <= fim;

    const tecCrit = db.catalogo.filter(c=>c.min_estoque>0&&estoqueDisponivel(c.id)<c.min_estoque);
    const matCrit = db.materiais.filter(m=>m.min_estoque>0&&(m.estoque_atual||0)<m.min_estoque);

    let pcs = db.pedidos_compra.filter(pc=>{
        if(fornF && String(pc.fornecedor_id)!==fornF) return false;
        if(stFiltro && pc.status!==stFiltro) return false;
        return true;
    });

    const pcAbertos = db.pedidos_compra.filter(pc=>pc.status!=='Recebido');
    const pcPer     = db.pedidos_compra.filter(pc=>inR(pc.data));
    const valAbertos = pcAbertos.reduce((s,pc)=>{
        const itens=pc.itens||[];
        return s+itens.reduce((ss,it)=>ss+(it.quantidade||0)*(it.preco_unit||0),0);
    },0);
    const valPer = pcPer.reduce((s,pc)=>{
        return s+(pc.itens||[]).reduce((ss,it)=>ss+(it.quantidade||0)*(it.preco_unit||0),0);
    },0);
    const pcRecebPer = pcPer.filter(pc=>pc.status==='Recebido');

    // Entradas por mês (últimos 6 meses via movimentos)
    const mes6 = _meses(6);

    const el = document.getElementById('dash-content');
    el.innerHTML = `
    <div class="dkpi-grid" style="grid-template-columns:repeat(5,1fr)">${
        _kpi('Itens a Repor', _fmtN(tecCrit.length+matCrit.length), 'abaixo do mínimo', 'red') +
        _kpi('PCs Abertos', _fmtN(pcAbertos.length), 'rascunho ou enviado', 'orange') +
        _kpi('Valor em Aberto', _fmtR(valAbertos), 'PCs não recebidos', 'blue') +
        _kpi('Recebidos no Período', _fmtN(pcRecebPer.length), _fmtR(valPer), 'green') +
        _kpi('Comprometido', _fmtR(valPer), 'PCs do período', 'teal')
    }</div>
    <div class="dgrid-2" style="margin-bottom:16px">
        <div class="dchart-card"><h3>⚠️ Necessidade de Recompra (déficit)</h3><div class="dchart-wrap" style="height:${Math.max(160,(tecCrit.length+matCrit.length)*32+60)}px"><canvas id="dc-cmp-repor"></canvas></div></div>
        <div class="dchart-card"><h3>🏭 PCs por Fornecedor</h3><div class="dchart-wrap" style="height:${Math.max(160,db.fornecedores.length*36+60)}px"><canvas id="dc-cmp-forn"></canvas></div></div>
    </div>
    <div class="dgrid-2" style="margin-bottom:16px">
        <div class="dchart-card"><h3>📂 Valor por Categoria de Despesa</h3><div class="dchart-wrap" style="height:200px"><canvas id="dc-cmp-cat"></canvas></div></div>
        <div class="dchart-card"><h3>📈 Entradas de Estoque — Últimos 6 meses</h3><div class="dchart-wrap" style="height:200px"><canvas id="dc-cmp-ent"></canvas></div></div>
    </div>
    <div class="dgrid-2">
        <div class="dchart-card">
            <h3>📋 Itens para Recompra</h3>
            <table class="dash-table"><thead><tr><th>Item</th><th>Tipo</th><th>Atual</th><th>Mínimo</th><th>Déficit</th><th>Fornecedor</th></tr></thead>
            <tbody>${(()=>{
                const rows=[
                    ...tecCrit.map(c=>{const forn=db.fornecedores.find(f=>f.id==c.fornecedor_id);const def=(c.min_estoque-estoqueDisponivel(c.id)).toFixed(2);return `<tr><td>${escapeHtml(c.nome)}</td><td>${_badge('Tecido','blue')}</td><td>${estoqueDisponivel(c.id).toFixed(2)} m</td><td>${c.min_estoque} m</td><td>${_badge(def+' m','red')}</td><td>${escapeHtml(forn?.nome_fantasia||forn?.razao_social||'—')}</td></tr>`;}),
                    ...matCrit.map(m=>{const forn=db.fornecedores.find(f=>f.id==m.fornecedor_id);const def=((m.min_estoque-(m.estoque_atual||0)).toFixed(2));return `<tr><td>${escapeHtml(m.nome)}</td><td>${_badge('Material','orange')}</td><td>${(m.estoque_atual||0).toFixed(2)} ${m.unidade}</td><td>${m.min_estoque}</td><td>${_badge(def+' '+m.unidade,'red')}</td><td>${escapeHtml(forn?.nome_fantasia||forn?.razao_social||'—')}</td></tr>`;})
                ];
                return rows.length?rows.join(''):`<tr><td colspan="6" class="dash-empty">Nenhum item crítico 🎉</td></tr>`;
            })()}</tbody></table>
        </div>
        <div class="dchart-card">
            <h3>📦 Pedidos de Compra Recentes</h3>
            <table class="dash-table"><thead><tr><th>#</th><th>Fornecedor</th><th>Data</th><th>Itens</th><th>Status</th></tr></thead>
            <tbody>${pcs.length?pcs.sort((a,b)=>(b.data||'').localeCompare(a.data||'')).slice(0,10).map(pc=>{
                const forn=db.fornecedores.find(f=>f.id==pc.fornecedor_id);
                return `<tr><td style="font-weight:700">#${pc.id}</td><td>${escapeHtml(forn?.nome_fantasia||forn?.razao_social||'—')}</td><td>${pc.data?_fmtDate(pc.data):'—'}</td><td>${(pc.itens||[]).length}</td><td>${_badge(pc.status||'—',pc.status==='Recebido'?'green':pc.status==='Enviado'?'blue':'gray')}</td></tr>`;
            }).join(''):`<tr><td colspan="5" class="dash-empty">Nenhum pedido de compra</td></tr>`}</tbody></table>
        </div>
    </div>`;

    // Déficit de recompra
    const reporItems=[
        ...tecCrit.map(c=>({nome:c.nome.length>16?c.nome.slice(0,16)+'…':c.nome,def:c.min_estoque-estoqueDisponivel(c.id),cor:'#2563ebcc',bor:'#2563eb'})),
        ...matCrit.map(m=>({nome:m.nome.length>16?m.nome.slice(0,16)+'…':m.nome,def:m.min_estoque-(m.estoque_atual||0),cor:'#f59e0bcc',bor:'#f59e0b'}))
    ].filter(x=>x.def>0).sort((a,b)=>b.def-a.def);
    if(reporItems.length) _mkChart('dc-cmp-repor',{type:'bar',data:{labels:reporItems.map(x=>x.nome),datasets:[{label:'Déficit',data:reporItems.map(x=>x.def),backgroundColor:reporItems.map(x=>x.cor),borderColor:reporItems.map(x=>x.bor),borderWidth:1,borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`Déficit: ${ctx.raw.toFixed(2)}`}}},scales:{y:{ticks:{font:{size:10}},grid:{display:false}},x:{beginAtZero:true,ticks:{font:{size:10}},grid:{color:'rgba(0,0,0,0.05)'}}}}});

    // PCs por fornecedor
    const fornMap={};
    pcs.forEach(pc=>{const f=db.fornecedores.find(x=>x.id==pc.fornecedor_id);const n=f?.nome_fantasia||f?.razao_social||'Sem fornecedor';fornMap[n]=(fornMap[n]||0)+1;});
    const fornRows=Object.entries(fornMap).sort(([,a],[,b])=>b-a).slice(0,8);
    if(fornRows.length) _mkChart('dc-cmp-forn',{type:'bar',data:{labels:fornRows.map(([n])=>n.length>14?n.slice(0,14)+'…':n),datasets:[{label:'Pedidos de Compra',data:fornRows.map(([,v])=>v),backgroundColor:'#2A5C82cc',borderColor:'#2A5C82',borderWidth:1,borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} PC(s)`}}},scales:{y:{ticks:{font:{size:10}},grid:{display:false}},x:{beginAtZero:true,ticks:{stepSize:1,font:{size:10}},grid:{color:'rgba(0,0,0,0.05)'}}}}});

    // Valor por categoria (despesas)
    const catMap={};
    const CAT_LBL={tecido:'Tecido/Mat.',salario:'Salário',comissao_rt:'Comissão RT',aluguel:'Aluguel',conta:'Contas',outro:'Outros',costureira:'Costureira',instalador:'Instalador'};
    db.contas_pagar.filter(cp=>cp.status==='Pago'&&inR(cp.data_pagamento)).forEach(cp=>{const c=CAT_LBL[cp.categoria||'outro']||'Outros';catMap[c]=(catMap[c]||0)+cp.valor;});
    const catRows=Object.entries(catMap).sort(([,a],[,b])=>b-a);
    if(catRows.length) _mkChart('dc-cmp-cat',{type:'doughnut',data:{labels:catRows.map(([n])=>n),datasets:[{data:catRows.map(([,v])=>v),backgroundColor:['#6366f1cc','#f59e0bcc','#8b5cf6cc','#ef4444cc','#3b82f6cc','#6b7280cc','#ec4899cc','#f97316cc'],borderWidth:2,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${_fmtR(ctx.raw)}`}}}}});

    // Entradas 6 meses
    const mes6H=_meses(6);
    const entMes6=mes6H.map(m=>db.movimentos.filter(mv=>mv.tipo==='Entrada'&&new Date(mv.data).toISOString().slice(0,7)===m.key).length);
    _mkChart('dc-cmp-ent',{type:'line',data:{labels:mes6H.map(m=>m.label),datasets:[{label:'Entradas de estoque',data:entMes6,borderColor:'#059669',backgroundColor:'rgba(5,150,105,0.1)',borderWidth:2,pointRadius:4,fill:true,tension:0.3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{..._tooltipN}},scales:{y:{..._scaleYN},x:{..._scaleX}}}});
}

// ─── GERENCIAL ────────────────────────────────────────────────────────────────
function _filtersGerencial() {
    return _periodoFiltro();
}

function _dashGerencial() {
    const {ini,fim} = _getRange();
    const inR = d => d && d >= ini && d <= fim;
    const hoje = new Date().toISOString().split('T')[0];

    // Financeiro
    const recebido  = db.contas_receber.filter(cr=>cr.status==='Pago'&&inR(cr.data_pagamento)).reduce((s,cr)=>s+cr.valor,0);
    const totalPago = db.contas_pagar.filter(cp=>cp.status==='Pago'&&inR(cp.data_pagamento)).reduce((s,cp)=>s+cp.valor,0);
    const aReceber  = db.contas_receber.filter(cr=>cr.status!=='Pago').reduce((s,cr)=>s+cr.valor,0);
    const aPagar    = db.contas_pagar.filter(cp=>cp.status!=='Pago').reduce((s,cp)=>s+cp.valor,0);
    const lucro     = recebido - totalPago;
    const totalAtras= db.contas_receber.filter(cr=>cr.status==='Atrasado').reduce((s,cr)=>s+cr.valor,0);
    const totalCR   = db.contas_receber.filter(cr=>cr.status!=='Pago').reduce((s,cr)=>s+cr.valor,0);
    const inadimpl  = totalCR>0 ? totalAtras/totalCR*100 : 0;
    const margemPct = recebido>0 ? lucro/recebido*100 : 0;

    // Produção
    const EM_PROD = ['Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento'];
    const emProd  = db.pedidos.filter(p=>EM_PROD.includes(normalizarStatus(p.status))).length;
    const atrasados = db.pedidos.filter(p=>EM_PROD.includes(normalizarStatus(p.status))&&p.data_entrega&&p.data_entrega<hoje).length;
    const conv    = db.pedidos.length ? db.pedidos.filter(p=>normalizarStatus(p.status)!=='Orçamento').length/db.pedidos.length*100 : 0;

    // Estoque
    const estCrit = db.catalogo.filter(c=>c.min_estoque>0&&estoqueDisponivel(c.id)<c.min_estoque).length
                  + db.materiais.filter(m=>m.min_estoque>0&&(m.estoque_atual||0)<m.min_estoque).length;

    const el = document.getElementById('dash-content');
    el.innerHTML = `
    <div style="margin-bottom:6px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px">💼 Financeiro</div>
    <div class="dkpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px">${
        _kpi('Faturamento', _fmtR(recebido), 'recebido no período', 'green') +
        _kpi('Lucro (Caixa)', _fmtR(lucro), recebido>0?_fmtPct(margemPct)+' margem':'sem receita', lucro>=0?'teal':'red') +
        _kpi('Inadimplência', _fmtPct(inadimpl), _fmtR(totalAtras)+' atrasado', inadimpl>20?'red':inadimpl>10?'orange':'green')
    }</div>
    <div style="margin-bottom:6px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px">🏭 Produção</div>
    <div class="dkpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px">${
        _kpi('Em Produção', _fmtN(emProd), 'pedidos ativos', 'blue') +
        _kpi('Atrasados', _fmtN(atrasados), 'entrega vencida', atrasados>0?'red':'green') +
        _kpi('Conversão', _fmtPct(conv), 'orçamentos aprovados', conv>=70?'green':conv>=50?'blue':'orange')
    }</div>
    <div style="margin-bottom:6px;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.5px">📦 Estoque &amp; Caixa</div>
    <div class="dkpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">${
        _kpi('Estoque Crítico', _fmtN(estCrit), 'itens abaixo do mínimo', estCrit>0?'red':'green') +
        _kpi('A Receber', _fmtR(aReceber), 'contas pendentes', 'orange') +
        _kpi('A Pagar', _fmtR(aPagar), 'contas pendentes', 'purple')
    }</div>
    <div class="dchart-card" style="margin-bottom:16px"><h3>📈 Evolução Financeira — Últimos 12 meses</h3><div class="dchart-wrap" style="height:220px"><canvas id="dc-ger-fin"></canvas></div></div>
    <div class="dgrid-2" style="margin-bottom:16px">
        <div class="dchart-card"><h3>🔄 Pipeline de Produção Atual</h3><div class="dchart-wrap" style="height:220px"><canvas id="dc-ger-pipeline"></canvas></div></div>
        <div class="dchart-card"><h3>💰 Receitas × Despesas por Categoria</h3><div class="dchart-wrap" style="height:220px"><canvas id="dc-ger-categ"></canvas></div></div>
    </div>
    <div class="dgrid-2">
        <div class="dchart-card">
            <h3>🚨 Alertas Críticos Consolidados</h3>
            <div id="ger-alertas">${_gerAlertas(hoje)}</div>
        </div>
        <div class="dchart-card">
            <h3>💎 Top 10 Pedidos em Andamento (por valor)</h3>
            <table class="dash-table"><thead><tr><th>#</th><th>Cliente</th><th>Status</th><th>Valor</th><th>Entrega</th></tr></thead>
            <tbody>${db.pedidos.filter(p=>EM_PROD.includes(normalizarStatus(p.status))).sort((a,b)=>(b.valor||0)-(a.valor||0)).slice(0,10).map(p=>`<tr>
                <td><a href="pedido.html?edit=${p.id}" style="color:var(--primary);font-weight:700">#${formatPedidoId(p.id)}</a></td>
                <td>${escapeHtml(p.clienteNome||'—')}</td><td>${_statusBadge(normalizarStatus(p.status))}</td>
                <td>${_fmtR(p.valor)}</td><td>${p.data_entrega?_fmtDate(p.data_entrega):_badge('Sem data','gray')}</td>
            </tr>`).join('') || `<tr><td colspan="5" class="dash-empty">Sem pedidos em andamento</td></tr>`}</tbody></table>
        </div>
    </div>`;

    // Evolução financeira 12 meses
    const mes12=_meses(12);
    const fatMes   = mes12.map(m=>db.contas_receber.filter(cr=>cr.status==='Pago'&&(cr.data_pagamento||'').startsWith(m.key)).reduce((s,cr)=>s+cr.valor,0));
    const despMes  = mes12.map(m=>db.contas_pagar.filter(cp=>cp.status==='Pago'&&(cp.data_pagamento||'').startsWith(m.key)).reduce((s,cp)=>s+cp.valor,0));
    let acc=0;
    const saldoMes = fatMes.map((f,i)=>{acc+=f-despMes[i];return acc;});
    _mkChart('dc-ger-fin',{data:{labels:mes12.map(m=>m.label),datasets:[
        {type:'bar',label:'Entradas',data:fatMes,backgroundColor:'#86efaccc',borderColor:'#22c55e',borderWidth:1,borderRadius:3,yAxisID:'y'},
        {type:'bar',label:'Saídas',data:despMes,backgroundColor:'#fca5a5cc',borderColor:'#ef4444',borderWidth:1,borderRadius:3,yAxisID:'y'},
        {type:'line',label:'Saldo Acum.',data:saldoMes,borderColor:'#2A5C82',backgroundColor:'rgba(42,92,130,0.06)',borderWidth:2,pointRadius:3,fill:true,tension:0.35,yAxisID:'y'}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:10}},tooltip:{callbacks:{label:ctx=>` ${_fmtR(ctx.raw)}`}}},scales:{y:{..._scaleY,position:'left'},x:{..._scaleX}}}});

    // Pipeline
    const allStatus=['Orçamento','Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento','Instalado'];
    const coresPip=['#94a3b8','#60a5fa','#a78bfa','#f472b6','#34d399','#fbbf24','#22c55e'];
    const cntPip=allStatus.map(s=>db.pedidos.filter(p=>normalizarStatus(p.status)===s).length);
    _mkChart('dc-ger-pipeline',{type:'bar',data:{labels:allStatus.map(s=>s.length>14?s.slice(0,14)+'…':s),datasets:[{label:'Pedidos',data:cntPip,backgroundColor:coresPip.map(c=>c+'cc'),borderColor:coresPip,borderWidth:1,borderRadius:4}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw} pedido(s)`}}},scales:{y:{ticks:{font:{size:10}},grid:{display:false}},x:{..._scaleYN}}}});

    // Categorias financeiras
    const recCat={'Pedidos (instalados)':recebido};
    const despCat={};
    const CAT_L={tecido:'Tecido/Mat.',salario:'Salário',comissao_rt:'Comissão RT',aluguel:'Aluguel',conta:'Contas',outro:'Outros',costureira:'Costureira',instalador:'Instalador'};
    db.contas_pagar.filter(cp=>cp.status==='Pago'&&inR(cp.data_pagamento)).forEach(cp=>{const c=CAT_L[cp.categoria||'outro']||'Outros';despCat[c]=(despCat[c]||0)+cp.valor;});
    const dLabels=Object.keys(despCat); const dVals=Object.values(despCat);
    _mkChart('dc-ger-categ',{type:'doughnut',data:{labels:dLabels,datasets:[{data:dVals,backgroundColor:['#6366f1cc','#f59e0bcc','#8b5cf6cc','#ef4444cc','#3b82f6cc','#6b7280cc','#ec4899cc','#f97316cc'],borderWidth:2,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${_fmtR(ctx.raw)}`}}}}});
}

function _gerAlertas(hoje) {
    const al = [];
    const EM_PROD=['Medição','Aguardando Tecido','Na Costura','Pronto p/ Instalação','Aguardando Pagamento'];
    const atras=db.pedidos.filter(p=>EM_PROD.includes(normalizarStatus(p.status))&&p.data_entrega&&p.data_entrega<hoje);
    if(atras.length) al.push({t:'danger',ic:'⚠️',txt:`<strong>${atras.length} pedido(s)</strong> com entrega atrasada em produção`});
    const crAtras=db.contas_receber.filter(c=>c.status==='Atrasado');
    if(crAtras.length) al.push({t:'danger',ic:'💸',txt:`<strong>${crAtras.length} recebimento(s)</strong> em atraso — ${_fmtR(crAtras.reduce((s,c)=>s+c.valor,0))}`});
    const cpAtras=db.contas_pagar.filter(c=>c.status==='Atrasado');
    if(cpAtras.length) al.push({t:'danger',ic:'❌',txt:`<strong>${cpAtras.length} pagamento(s)</strong> em atraso — ${_fmtR(cpAtras.reduce((s,c)=>s+c.valor,0))}`});
    const tecCrit=db.catalogo.filter(c=>c.min_estoque>0&&estoqueDisponivel(c.id)<c.min_estoque).length;
    const matCrit=db.materiais.filter(m=>m.min_estoque>0&&(m.estoque_atual||0)<m.min_estoque).length;
    if(tecCrit+matCrit>0) al.push({t:'warning',ic:'📦',txt:`<strong>${tecCrit+matCrit} item(ns)</strong> com estoque abaixo do mínimo`});
    const semData=db.pedidos.filter(p=>EM_PROD.includes(normalizarStatus(p.status))&&!p.data_entrega);
    if(semData.length) al.push({t:'info',ic:'📅',txt:`<strong>${semData.length} pedido(s)</strong> em produção sem data de entrega definida`});
    if(!al.length) return `<div class="dash-empty">🎉 Nenhum alerta crítico no momento!</div>`;
    const corMap={danger:'#fff1f2',warning:'#fef3c7',info:'#dbeafe'};
    const bordMap={danger:'#fca5a5',warning:'#fcd34d',info:'#93c5fd'};
    const txtMap={danger:'#991b1b',warning:'#92400e',info:'#1e40af'};
    return al.map(a=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin-bottom:8px;background:${corMap[a.t]};border:1px solid ${bordMap[a.t]};border-radius:8px;font-size:13px;color:${txtMap[a.t]}">
        <span style="font-size:18px;flex-shrink:0">${a.ic}</span><span>${a.txt}</span></div>`).join('');
}
