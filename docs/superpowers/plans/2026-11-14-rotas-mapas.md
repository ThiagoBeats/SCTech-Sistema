# Rotas do dia e "Ir para endereço" — plano

> Execução: nativa (eu mesmo), revisão final por um revisor novo.

**Spec:** `Docs/superpowers/specs/2026-11-14-rotas-mapas-design.md`

**Arquitetura:** núcleo puro `js/rotas-core.js` (UMD, testado com `node --test`)
com links do Google Maps, cálculo de chegadas, texto da observação e do WhatsApp,
e leitura das respostas do OSRM. A tela (aba do PCP) fica em `js/app.js` e faz as
chamadas de rede (Nominatim/OSRM) com `fetch`.

## Global Constraints
- Sem build; scripts incluídos antes de `js/app.js`; cache-bust novo em todas as páginas.
- Nominatim: `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=1&q=…`, no máximo 1 consulta/s, cache em `sc_geo`.
- OSRM: `https://router.project-osrm.org/trip/v1/driving/{lon,lat;…}?source=first&roundtrip=true|false&destination=any|last&overview=false` (sugerir) e `/route/v1/driving/{…}?overview=false` (km da ordem atual).
- Google Maps: `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=driving` (+ `origin`, `waypoints` separados por `|`), no máximo 3 waypoints por link.
- Tolerância de atraso: 10 min. Texto da observação: `Rota de DD/MM/AAAA: chegada prevista HH:MM (agendado HH:MM)`.

## Tarefas
1. **Núcleo** `js/rotas-core.js` + `tests/rotas-core.test.js`:
   `linkIrPara(end)`, `linksRota({origem, paradas, volta})`, `normalizarEndereco(s)`,
   `ordemDoTrip(resp, n)`, `trechosDaRota(resp)`, `calcularChegadas({inicioDia, paradas, trechos})`,
   `linhaObsRota(dataISO, chegadaMin, agendadoMin)`, `aplicarObsRota(obs, dataISO, linha|null)`,
   `textoWhatsRota({...})`.
2. **"📍 Ir"**: botão ao lado de `#inst-end`, `#med-end`, `#cli-end`; link nos cards
   (`_agdLinha` vira `div role=button` com o link dentro) e nos detalhes.
3. **Dados**: `db.rotas`/`sc_rotas` no salvar, backup e restauração; script nas páginas.
4. **Aba "🗺️ Rotas do dia"** em `pcp.html` + `renderRotas()` e ações (sugerir,
   arrastar e ↑↓, km, salvar com observações, abrir no Maps, enviar ao técnico).
5. **Testes de tela** `tests/e2e/rotas-mapas.spec.js` (rede simulada com `page.route`)
   e FUNCIONALIDADES.
