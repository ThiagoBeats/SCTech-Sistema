# Rotas do dia e "Ir para endereço" — design

Aprovado pelo dono em 2026-11-14.

## Por quê
Quem organiza (secretária, vendedor ou dono) monta o dia do técnico de campo
(medições e instalações) na melhor ordem e manda para ele. O técnico só abre e
segue. Objetivo: menos deslocamento, visitas agrupadas por região, sem custo.

## Decisões do dono
- **Sem custo e sem cadastro.** Nada de chave do Google Cloud.
- **Caminho C:** o sistema sugere a melhor ordem (OpenStreetMap: Nominatim para
  localizar o endereço, OSRM para a ordem e os km) e a pessoa ajusta à mão
  (arrastar). Endereço não encontrado vai para o fim com aviso, posicionado à mão.
- **Horário que não bate:** o sistema avisa, mas não impede a rota. O aviso fica
  gravado como observação da medição/instalação.
- **"📍 Ir para endereço"** ao lado dos campos de endereço e nos cards da agenda
  (medições e instalações): abre o Google Maps com o caminho até lá.

## Minhas escolhas (aprovadas na conversa)
- Aba nova **"🗺️ Rotas do dia"** no PCP, ao lado das agendas.
- Escolhe dia + técnico; entram as medições (Agendado) e instalações (agendadas,
  Pronto p/ Instalação) dele naquele dia. "— A definir —" também é uma opção.
- Saída e volta: endereço da empresa (Empresa). Sem endereço da empresa, a rota
  começa na 1ª visita e não volta.
- Chegada prevista = saída + trajeto + duração de cada visita. Saída: se a 1ª
  visita tem horário, sai a tempo de chegar nele; senão, no início do expediente
  (Configuração da agenda). Chegou antes do horário agendado: espera até ele.
  Chegada mais de 10 min depois do agendado = aviso "⚠ N min depois do agendado".
- Observação gravada ao salvar a rota (e ao enviar ao técnico):
  `Rota de 15/11/2026: chegada prevista 10:40 (agendado 09:00)`. Refazer substitui
  a linha daquele dia; se deixou de haver atraso, a linha sai.
- Km do trecho em cada visita; total de km e de tempo de trajeto da rota.
- "Reconhecer o endereço": o endereço é localizado uma vez e guardado
  (`sc_geo`); não achado mostra "endereço não encontrado — confira".
- **📤 Enviar ao técnico:** WhatsApp com a lista (ordem, horário previsto, cliente,
  telefone, endereço) e o(s) link(s) do Google Maps com as paradas na ordem.
- Links do Google Maps: usam o texto do endereço (o Google acha melhor que o OSM).
  No máximo 3 paradas intermediárias por link (limite do Maps no navegador do
  celular); passou disso, a rota vira "Parte 1, Parte 2…", cada parte começando
  onde a anterior terminou.
- Botão "📍 Ir" também no cadastro do cliente e nos detalhes da medição/instalação.
- Privacidade: só o texto do endereço vai ao OpenStreetMap; nome e telefone não.

## Não faz
- Não muda horários sozinho; não bloqueia nada; não usa API paga; não mostra mapa
  desenhado dentro do sistema.

## Falhas
- Sem internet / serviço fora: "Não foi possível calcular as distâncias agora. A
  ordem e o link do Maps continuam funcionando." A ordem manual segue valendo.
- Nominatim: no máximo 1 consulta por segundo, cada endereço só uma vez (cache).

## Dados
- `db.rotas` (`sc_rotas`, no backup): `{ chave: 'AAAA-MM-DD|<prof>', data, prof,
  ordem: [{tipo:'med'|'inst', id}], salvo_em, salvo_por }`.
- `sc_geo` (cache local, fora do backup): `{ <endereço normalizado>: {lat, lon} |
  {nao: true} }`.
