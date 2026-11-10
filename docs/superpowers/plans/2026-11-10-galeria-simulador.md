# Galeria e Simulador de Cortinas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Galeria de fotos reais + simulador 3D que coloca cortina/persiana sobre a foto da parede do cliente, abrindo e fechando ao toque, com mostruário montado por cada empresa e salvamento em imagem/vídeo.

**Architecture:** Núcleo puro UMD `js/galeria-core.js` (catálogos, leitura tolerante do mostruário, homografia, área da cortina a partir da janela, geometria das dobras) testado com `node --test`. Imagens em IndexedDB atrás de um único módulo `js/galeria-imagens.js` (troca futura pelo servidor). Telas: `galeria.html` (galeria + simulador, `js/galeria-tela.js` e `js/galeria-simulador.js`) e aba `#galeria` em `empresa.html` (`js/galeria-mostruario.js`). 3D com Three.js r159 UMD copiado para `js/vendor/three.min.js`; tudo numa única tela WebGL (foto de fundo + cortina renderizada num alvo de textura e projetada no quadrilátero por homografia no shader), para a imagem e o vídeo saírem do mesmo canvas.

**Tech Stack:** HTML/CSS/JS estático, localStorage, IndexedDB, Three.js 0.159.0 (UMD, local), MediaRecorder/captureStream, Web Share API, Playwright (e2e), node:test.

**Spec:** `docs/superpowers/specs/2026-11-10-galeria-simulador-design.md`

## Global Constraints

- Régua do usuário: **o instalador deve ter facilidade para usar o simulador** — primeira simulação com no máximo: tirar/escolher foto → tocar numa cor. O quadrilátero já nasce posicionado no centro.
- Sem CDN para o 3D: `js/vendor/three.min.js` (three@0.159.0, `build/three.min.js`).
- Pregas iguais às do sistema: chaves `Americana`, `Wave Botao`, `Wave Plus`, `Franzido`, `Macho-Femea`, `Painel` (mesmas de `CortinaDesenho.PREGAS`).
- Persianas só: `rolo` (Rolô), `romana` (Romana), `double` (Double Vision).
- Aberturas do simulador: `central`, `esquerda`, `direita` (recolhe para o lado nomeado).
- Trilhos do mostruário partem de `KITS_FIXACAO_PADRAO`; visual só `trilho` (fino) ou `varao` (aparente): nome contendo "Varão" → `varao`, o resto → `trilho`.
- Mostruário em `localStorage['sc_mostruario']` (`{versao:1, cores:[], fotos:[], modelos:{pregas:[], persianas:[], trilhos:[]}}`), só ids de imagem; os bytes ficam no IndexedDB `sctech-imagens`, store `imagens`.
- Fotos da galeria: máx. **60**; reduzidas para lado maior **1600 px** (JPEG 0,85). Texturas: lado maior **512 px**. Foto da parede: **1600 px**, nunca guardada.
- Permissão nova `galeria` em `MODULOS_PERMISSAO`; padrão `visualizar` em todos os papéis (Administrador `completo`); papéis salvos sem a chave ganham `visualizar`. Editar o mostruário exige `temAcesso('configuracoes.empresa','completo')`.
- Identificadores e textos em português, como no resto do código; cache `?v=20261110b` em todos os HTML ao fim.
- Comandos: unit `node --test tests/*.test.js`; e2e `cd /tmp/sctech-e2e && NODE_PATH=$(cygpath -w /tmp/sctech-e2e/node_modules) TESTDIR="C:/Users/Asus/Desktop/SCTech/Projeto/tests/e2e" BASE=http://localhost:8131 npx playwright test -c repo.config.js <spec>`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Foto da parede em retrato vinda do celular (EXIF rotacionado, 4000 px) — deve aparecer em pé e reduzida, sem travar.
2. Quadrilátero com cantos cruzados/arrastados para fora da foto — a cortina não pode sumir nem inverter; cantos ficam presos dentro da foto e a ordem é corrigida.
3. IndexedDB indisponível (aba anônima/erro) — galeria e mostruário avisam e o simulador ainda funciona com as cores (sem texturas).
4. Mostruário salvo corrompido ou com foto cujo id não existe mais no IndexedDB — a tela ignora o item, não quebra.
5. Aparelho sem MediaRecorder/WebGL — botão de vídeo some; sem WebGL, mensagem clara em vez de tela preta.

---

### Task 1: Núcleo `galeria-core.js`

**Files:**
- Create: `js/galeria-core.js`
- Test: `tests/galeria-core.test.js`

**Interfaces:**
- Produces (global `GaleriaCore` / `module.exports`):
  - `PREGAS` `{chave: rótulo}` (6 chaves acima), `PERSIANAS` `{rolo:'Rolô', romana:'Romana', double:'Double Vision'}`, `ABERTURAS` `['central','esquerda','direita']`, `GRUPOS` `[{id:'pregas'},{id:'trilhos'},{id:'rolo'},{id:'romana'},{id:'double'}]` com `nome`.
  - `CORES_INICIAIS` — 6 cores neutras `{id, nome, hex}`.
  - `visualTrilho(nome) -> 'trilho'|'varao'`.
  - `padraoMostruario(kitsNomes: string[]) -> Mostruario` — todas as pregas/persianas ligadas, trilhos = kits, cores/fotos vazias.
  - `lerMostruario(bruto, kitsNomes) -> Mostruario` — tolerante: descarta fotos sem `imagemId`/grupo válido, cores com hex inválido, chaves de modelo desconhecidas; limita fotos a 60.
  - `coresDisponiveis(m) -> Cor[]` — `m.cores` ou `CORES_INICIAIS` se vazio.
  - `homografia(de: [x,y][4], para: [x,y][4]) -> number[9]` e `aplicarHomografia(H, [x,y]) -> [x,y]`.
  - `ordenarCantos(q) -> q` (sup-esq, sup-dir, inf-dir, inf-esq) e `prenderCantos(q, w, h) -> q`.
  - `areaProduto(janela: q, {produto:'cortina'|'persiana', ate:'chao'|'janela'}, alturaImagem) -> q`.
  - `geometriaCortina({prega, abertura, aberto, colunas}) -> {paineis:[{x:number[], z:number[]}]}` em unidades 0..1 da largura.
  - `geometriaPersiana({tipo, aberto, linhas}) -> {y:number[], z:number[], baseVisivel:number, faixas?:number}`.
  - `dimensaoReduzida(w, h, max) -> {w, h}`.

- [ ] **Step 1: Write the failing tests** — em `tests/galeria-core.test.js`:
  - `pregas iguais às do desenho da cortina`: `assert.deepStrictEqual(Object.keys(G.PREGAS), Object.keys(require('../js/cortina-desenho.js').PREGAS))`.
  - `visualTrilho`: `'Varão Suíço/Wave'→'varao'`, `'Trilho Suíço Duplo'→'trilho'`.
  - `padraoMostruario(['Trilho Suíço Simples','Varão Alumínio Comum'])` → `modelos.pregas.length===6`, `modelos.persianas` = `['rolo','romana','double']`, `modelos.trilhos` = os 2 nomes, `cores=[]`, `fotos=[]`.
  - `lerMostruario` com lixo (`null`, `'x'`, `{cores:[{nome:'A',hex:'azul'}], fotos:[{grupo:'nada',imagemId:'1'}], modelos:{pregas:['Inexistente','Wave Botao']}}`) → cores `[]`, fotos `[]`, pregas `['Wave Botao']`; 70 fotos válidas → 60.
  - `coresDisponiveis(padrao)` tem 6 itens com hex `#rrggbb`.
  - `homografia` identidade de quadrado unitário para ele mesmo leva `[0.3,0.7]` em `[0.3,0.7]` (±1e-9); de unitário para `[[10,10],[110,20],[100,120],[0,100]]` leva os 4 cantos exatamente.
  - `ordenarCantos` de cantos embaralhados devolve sup-esq primeiro; `prenderCantos` com `[-50,5]` em 800×600 vira `[0,5]`.
  - `areaProduto` com janela retangular `[[100,100],[300,100],[300,300],[100,300]]`, altura 600: cortina `ate:'chao'` → topo acima de 100, mais larga que 100..300, base em 600; `ate:'janela'` → base ≈ 300+margem pequena; persiana → igual à janela (±2 px).
  - `geometriaCortina` para cada prega × abertura: `aberto=0` cobre de 0 a 1 (min x ≤0.01, max x ≥0.99); `aberto=1` com `central` deixa o meio livre (nenhum x em 0.3..0.7) e com `esquerda` todo x ≤0.25; amplitude de `z` cresce de `aberto=0` para `aberto=1`; `Painel` tem `z` quase plano (max |z| < 0.01).
  - `geometriaPersiana` `rolo` `aberto=1` → `baseVisivel ≤ 0.1`; `aberto=0` → `1`; `romana` `aberto=0.5` tem dobras (`z` não todo zero); `double` devolve `faixas > 0`.
  - `dimensaoReduzida(4000,3000,1600)` → `{w:1600,h:1200}`; `(800,600,1600)` não amplia.
- [ ] **Step 2: Run** `node --test tests/galeria-core.test.js` — Expected: FAIL `Cannot find module '../js/galeria-core.js'`.
- [ ] **Step 3: Implement** `js/galeria-core.js` no padrão UMD de `js/docs-layout-core.js` (funções puras, sem DOM). Homografia por resolução do sistema 8×8 (DLT) com `h33=1`. Cortina: para cada painel, `colunas` vértices; posição x comprimida para o lado de recolher na proporção `1 - aberto*0.82`; amplitude da dobra `A = base(prega) * (1 + 2.5*aberto)` mantendo o comprimento do tecido; perfil por prega (wave = senoide suave; americana = grupos de 3 dobras estreitas; franzido = senoide curta com ruído determinístico; macho-fêmea = onda quadrada suavizada; painel = plano). Margens de `areaProduto` no referencial da janela (via homografia do quadrado unitário): cortina x ∈ [-0.15, 1.15], topo -0.12, base `janela` 1.04 ou `chao` = extrapolar os lados até `alturaImagem`.
- [ ] **Step 4: Run** `node --test tests/galeria-core.test.js` — Expected: PASS; e `node --test tests/*.test.js` todos verdes.
- [ ] **Step 5: Commit** `feat(galeria): nucleo do mostruario e da geometria do simulador`.

### Task 2: Armazenamento de imagens `galeria-imagens.js`

**Files:**
- Create: `js/galeria-imagens.js`
- Test: `tests/e2e/galeria-imagens.spec.js`

**Interfaces:**
- Produces (global `GaleriaImagens`, todas Promise): `disponivel() -> boolean`, `salvar(blob) -> id:string`, `ler(id) -> Blob|null`, `url(id) -> string|null` (object URL em cache), `remover(id)`, `ids() -> string[]`; e `reduzirImagem(fileOuBlob, max, qualidade=0.85) -> Blob` (respeita orientação EXIF via `createImageBitmap(..., {imageOrientation:'from-image'})`, cai para `<img>` se faltar).

- [ ] **Step 1: Write the failing test** — página `galeria.html` não existe ainda; o teste abre `login.html` com o script carregado via `page.addScriptTag({url: BASE+'/js/galeria-imagens.js'})` e verifica: `salvar` de um PNG 1×1 devolve id; `ler(id)` devolve Blob de mesmo tamanho; `ids()` contém o id; `remover` some com ele; `reduzirImagem` de um canvas 4000×3000 em `toBlob` com max 1600 dá imagem 1600×1200 (medida com `createImageBitmap`); `ler('nao-existe')` → `null`.
- [ ] **Step 2: Run** e2e `galeria-imagens` — Expected: FAIL (404 do script / `GaleriaImagens is not defined`).
- [ ] **Step 3: Implement** — banco `sctech-imagens` v1, store `imagens` (`keyPath:'id'`, valor `{id, blob, criado}`); id `img-<Date.now()>-<aleatório>`; `disponivel()` falso se `indexedDB` ausente ou `open` falhar (sem lançar).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(galeria): armazenamento de imagens no navegador`.

### Task 3: Permissão, menu e página `galeria.html` (galeria de fotos)

**Files:**
- Modify: `js/app.js` (`MODULOS_PERMISSAO`, `papeisPadrao`, `migrarPermissoesSalvas`, `NAV_ICON_PATHS`, `SIDEBAR_MODULOS` após Clientes, `PAGINA_MODULO`)
- Create: `galeria.html`, `js/galeria-tela.js`
- Modify: `css/style.css` (estilos `.gal-*`)
- Test: `tests/e2e/galeria.spec.js`

**Interfaces:**
- Consumes: `GaleriaCore.lerMostruario`, `GRUPOS`, `PREGAS`, `PERSIANAS`; `GaleriaImagens.url`.
- Produces: `iniciarGaleria()`; `lerMostruarioSalvo() -> Mostruario` em `app.js` (lê `sc_mostruario` + nomes de `KITS_FIXACAO_PADRAO`/kits de fixação) — usada pelas Tasks 4–5. Rotas por hash: `galeria.html` (galeria), `galeria.html#simular` e `#simular?prega=Wave%20Botao|persiana=rolo|trilho=<nome>` (simulador, Task 5). Botão "📐 Simular na parede do cliente" no topo e em cada foto ligada.

- [ ] **Step 1: Write failing tests**:
  - `menu mostra Galeria e abre a página` (admin).
  - `papel Instalação vê a Galeria` (`papel_id:5` com papéis padrão) e `papel salvo sem a chave galeria ganha visualizar` (semeia `sc_papeis` antigo, recarrega, `db.papeis[...].permissoes.galeria.nivel==='visualizar'`).
  - `sem fotos mostra convite` — texto "Nenhuma foto na galeria" + (admin) link para `empresa.html#galeria`.
  - `fotos agrupadas e tela cheia com deslizar`: semeia 3 fotos via `GaleriaImagens.salvar` + `sc_mostruario`; vê grupos "Pregas" e "Rolô"; clicar abre visor `.gal-visor`; tecla →/swipe muda legenda; Esc fecha.
  - `foto ligada a uma prega mostra Simular` e o link vai para `#simular?prega=Wave%20Botao`.
  - `foto cujo id não existe é ignorada` (Review Focus 4).
- [ ] **Step 2: Run** e2e `galeria` — Expected: FAIL.
- [ ] **Step 3: Implement** as mudanças em `app.js` e a página (mesma moldura de `pcp.html`: sidebar, header "🖼️ Galeria", scripts `galeria-core.js`, `galeria-imagens.js`, `app.js`, `galeria-tela.js`). Visor tela cheia com setas, swipe (pointer events, limiar 40 px) e Esc.
- [ ] **Step 4: Run** e2e `galeria` + `empresa-abas` + specs de permissão existentes (`grep -l papeis tests/e2e`) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(galeria): pagina da galeria, menu e permissao`.

### Task 4: Aba "🖼️ Galeria e Mostruário" em Configurar Empresa

**Files:**
- Modify: `empresa.html` (botão `data-tab="galeria"` e painel `#tab-emp-galeria` com `#gm-editor`), `js/app.js` (`ABAS_EMPRESA` + `'galeria'`)
- Create: `js/galeria-mostruario.js`
- Modify: `css/style.css` (`.gm-*`)
- Test: `tests/e2e/galeria-mostruario.spec.js`

**Interfaces:**
- Consumes: `GaleriaCore` (`padraoMostruario`, `lerMostruario`, `GRUPOS`, `PREGAS`, `PERSIANAS`, `visualTrilho`), `GaleriaImagens` (`salvar`, `remover`, `url`, `reduzirImagem`, `disponivel`), `lerMostruarioSalvo`.
- Produces: `iniciarEditorMostruario()`; grava `sc_mostruario` direto a cada alteração (sem botão Salvar — cada ação é pequena e definitiva; remover pede confirmação).

Seções: **Fotos da galeria** (enviar várias de uma vez; para cada: grupo, legenda, "ligada a" — prega/persiana/trilho ou nenhuma; remover; contador `n/60`), **Cores e tecidos** (nome, cor, foto da textura opcional; remover), **Modelos que aparecem** (caixas para as 6 pregas, 3 persianas e os trilhos/varões).

- [ ] **Step 1: Write failing tests**:
  - `aba existe e abre por #galeria`.
  - `enviar foto grava no IndexedDB e no mostruário` (`setInputFiles` com PNG gerado), aparece miniatura, `sc_mostruario.fotos.length===1`, `GaleriaImagens.ids()` tem o id.
  - `remover foto apaga do IndexedDB` após confirmar.
  - `limite de 60 fotos` — com 60 semeadas, o envio fica desabilitado e há aviso.
  - `adicionar cor com textura` — textura reduzida a ≤512 px.
  - `desligar uma prega some do simulador` — `modelos.pregas` sem a chave.
  - `sem acesso completo, só vê` — usuário com `configuracoes.empresa` `visualizar`: botões desabilitados.
  - `IndexedDB indisponível mostra aviso` (Review Focus 3: `page.addInitScript(() => { delete window.indexedDB })`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `galeria-mostruario`, `empresa-abas` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(galeria): aba de mostruario em Configurar Empresa`.

### Task 5: Simulador 3D (foto, encaixe, gaveta, abrir/fechar)

**Files:**
- Create: `js/vendor/three.min.js` (baixar `https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js` e versionar; manter o cabeçalho de licença MIT)
- Create: `js/galeria-simulador.js`
- Modify: `galeria.html` (container `#sim` e script `js/vendor/three.min.js`), `css/style.css` (`.sim-*`)
- Test: `tests/e2e/galeria-simulador.spec.js`

**Interfaces:**
- Consumes: Task 1 (`areaProduto`, `homografia`, `ordenarCantos`, `prenderCantos`, `geometriaCortina`, `geometriaPersiana`, `coresDisponiveis`, `visualTrilho`, `dimensaoReduzida`), Task 2 (`url`, `reduzirImagem`), Task 3 (`lerMostruarioSalvo`, rota `#simular?…`).
- Produces: `abrirSimulador(preSelecao)`, `fecharSimulador()`; estado observável para testes em `window._sim.estado = {produto, prega, persiana, corId, trilho, abertura, ate, aberto, cantos}`; `window._sim.canvas` (o canvas WebGL único, criado com `preserveDrawingBuffer:true`) — usado pela Task 6.

Fluxo (opção A do design): tela cheia; sem foto, só dois botões grandes "📷 Tirar foto" (`<input type=file accept=image/* capture=environment>`) e "🖼️ Escolher foto". Com foto: quadrilátero amarelo com 4 alças (≥44 px de toque) nascido em 40% central, dica "Arraste os cantos até a janela" na primeira vez (lembrada em `localStorage['sc_sim_dica']`). Gaveta inferior recolhível com abas **Modelo** (cortinas: pregas ligadas; persianas: tipos ligados), **Cor**, **Trilho** (só cortina), **Abertura** (cortina: central/esquerda/direita + "Até o chão / Até a janela"). Arrastar na área da cortina: horizontal muda `aberto` (cortina), vertical (persiana). Cena: foto como fundo; produto renderizado num `WebGLRenderTarget` (malha com dobras de `geometriaCortina`/`geometriaPersiana`, `MeshStandardMaterial` com cor ou textura, luz direcional vinda de cima-esquerda + ambiente, trilho/varão como cilindro/caixa); quadrilátero final desenhado com shader que usa a inversa da homografia para buscar a textura (perspectiva correta). Re-render só quando o estado muda (requestAnimationFrame sob demanda). Sem WebGL: mensagem "Este aparelho não consegue mostrar o simulador 3D."

- [ ] **Step 1: Write failing tests**:
  - `abrir sem foto mostra os dois botões`.
  - `com foto, nasce com quadrilátero e cortina visível` — `setInputFiles` com JPEG 1200×900 (parede bege gerada em canvas); `_sim.estado.cantos` tem 4 pontos dentro da foto; pixel no centro do quadrilátero difere do bege da foto (lido com `gl.readPixels` via `_sim.canvas.toDataURL` → canvas 2D).
  - `trocar cor muda a cortina` — pixel do centro muda entre duas cores do mostruário.
  - `arrastar abre a cortina` — `page.mouse` arrastando 200 px no centro aumenta `_sim.estado.aberto`; com abertura central, pixel do centro volta a ser a parede.
  - `persiana rolô sobe arrastando para cima`.
  - `cantos cruzados são corrigidos` (Review Focus 2): arrastar o canto sup-esq para além do inf-dir → `cantos` reordenados e dentro da foto.
  - `#simular?prega=Wave%20Botao` abre com essa prega escolhida.
  - `gaveta recolhe e volta` — tocar no puxador esconde as abas e a foto fica livre; no PC (1400×900) as escolhas ficam num painel ao lado da foto (`.sim-gaveta` à direita, sem cobrir o quadrilátero).
  - `foto em retrato de 4000 px é reduzida` (Review Focus 1): canvas de trabalho com lado maior 1600.
  - `sem WebGL mostra aviso` (Review Focus 5: `addInitScript` que faz `HTMLCanvasElement.prototype.getContext` devolver `null` para `webgl*`).
- [ ] **Step 2: Run** e2e `galeria-simulador` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `galeria-simulador`, `galeria` — Expected: PASS. Tirar screenshots em 390×844 e 1400×900 e conferir que a cortina tem dobras com luz e sombra e que a gaveta não cobre a janela quando recolhida.
- [ ] **Step 5: Commit** `feat(galeria): simulador 3D sobre a foto da parede`.

### Task 6: Salvar imagem, vídeo e enviar

**Files:**
- Modify: `js/galeria-simulador.js`, `css/style.css`
- Test: `tests/e2e/galeria-simulador-salvar.spec.js`

**Interfaces:**
- Consumes: `window._sim.canvas`, `_sim.estado`.
- Produces: `salvarImagemSimulacao() -> Promise<Blob>` (JPEG, sem alças nem dicas desenhadas), `gravarVideoSimulacao() -> Promise<Blob|null>` (anima `aberto` 0→1→0 em 4 s, `canvas.captureStream(30)` + `MediaRecorder`, tipo preferido `video/mp4` se `isTypeSupported`, senão `video/webm`), `enviarSimulacao(blob, nome)` (`navigator.canShare({files})` → `navigator.share`; senão baixa o arquivo).

- [ ] **Step 1: Write failing tests**:
  - `💾 Imagem baixa um JPEG` — `page.waitForEvent('download')`, nome `simulacao-<data>.jpg`, tamanho > 10 kB; as alças não estão na imagem (gerar com quadrilátero e verificar que o canto não tem o amarelo das alças).
  - `🎥 Vídeo grava e baixa` — download `.webm`/`.mp4` com tamanho > 0; durante a gravação o botão mostra "Gravando…" e fica desabilitado.
  - `sem MediaRecorder o botão de vídeo some` (`addInitScript(() => { delete window.MediaRecorder })`).
  - `📤 Enviar usa o compartilhar do aparelho quando existe` — `addInitScript` define `navigator.canShare = () => true` e `navigator.share` que guarda os arquivos em `window.__enviado`; clicar → `__enviado[0].type` começa com `image/`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (esconder alças/dicas, renderizar um quadro limpo, capturar, restaurar).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(galeria): salvar imagem e video da simulacao e enviar`.

### Task 7: Fechamento — documentação, cache e bateria completa

**Files:**
- Modify: `FUNCIONALIDADES_SCTECH.txt` (nova seção "GALERIA E SIMULADOR" + aba em 12), todos os HTML (`?v=20261110a` → `?v=20261110b`), `tests/e2e/README.md` (contagem)

- [ ] **Step 1:** Documentar: galeria, simulador (passos do instalador), mostruário, armazenamento por aparelho até a migração para o servidor (módulo único `galeria-imagens.js`).
- [ ] **Step 2:** Trocar a versão de cache em todos os HTML; incluir `?v=` nos scripts novos.
- [ ] **Step 3: Run** `node --test tests/*.test.js` e a bateria e2e completa — Expected: tudo verde; atualizar a contagem no README.
- [ ] **Step 4: Commit** `docs(galeria): funcionalidades, cache e contagem de testes`.
