# Testes de navegador do importador

Estes testes abrem o SCTech num Chromium de verdade e importam a **planilha real
do fornecedor** (`docs/Tabela RC - SETEMBRO - 2024.xlsx`), do clique no botão até
os produtos gravados no `localStorage`.

Eles cobrem o que `npm test` não alcança: o carregamento sob demanda do SheetJS,
as quatro telas do assistente, a gravação, o desfazer e a resolução de códigos
repetidos.

## Como rodar

O projeto não tem dependências e não deve ganhar nenhuma. O Playwright é
instalado **fora** dele, numa pasta descartável:

```bash
mkdir -p /tmp/sctech-e2e && cd /tmp/sctech-e2e
npm init -y && npm i -D @playwright/test
npx playwright install chromium
```

Suba o servidor estático apontando para a raiz do projeto:

```bash
RAIZ=<projeto> PORTA=8131 node <projeto>/tests/e2e/servidor.js &
```

O Playwright não aceita um diretório de testes fora do seu próprio, então use um
arquivo de configuração apontando para cá. Em `/tmp/sctech-e2e/repo.config.js`:

```js
module.exports = { testDir: process.env.TESTDIR, reporter: 'line', workers: 1, use: { headless: true }, timeout: 60000, expect: { timeout: 15000 } };
```

O `expect.timeout` é separado do `timeout` do teste e vale 5s por padrão. Numa
máquina ocupada esse é o limite que estoura primeiro, e a falha aparece como
`expect(locator).toContainText(...) failed` — que parece texto errado na tela e
é só tempo.

**`workers: 1` não é capricho.** Sem isso o Playwright abre um Chromium por
núcleo (8 nesta máquina), e a suíte cheia derruba a memória: aparecem
`worker process exited unexpectedly (code=134)` e `net::ERR_INSUFFICIENT_RESOURCES`,
com falhas que mudam de lugar a cada execução e somem quando você roda o arquivo
sozinho. Isso parece defeito do sistema e não é. Se vir falhas que não se
repetem, confira primeiro quantos workers o Playwright anunciou na primeira
linha da saída.

E rode de dentro da pasta onde o Playwright foi instalado. `NODE_PATH` é
necessário porque os testes moram no projeto, que não tem `node_modules`:

```bash
cd /tmp/sctech-e2e
NODE_PATH=/tmp/sctech-e2e/node_modules \
BASE=http://localhost:8131 \
TESTDIR=<projeto>/tests/e2e \
  npx playwright test --config=repo.config.js
```

Esperado: **308 passando**.

## Sessão autenticada é obrigatória

O SCTech redireciona para `login.html` quando não há sessão. Um teste que navega
direto para `catalogo.html` encontra a tela de login e falha com uma mensagem
enganosa — `window._impLerArquivo is not a function`, que parece defeito do
importador e não é.

Por isso todo arquivo aqui chama `entrar(page, BASE)` de `ajuda.js` antes de
navegar. Ele semeia um usuário com papel 1 (Administrador, que vem de
`papeisPadrao()` com tudo em "completo").

## Armadilhas que já custaram tempo

- **`db`, `_impEstado` e afins não existem em `window`.** São `let`/`const` de
  topo de script clássico, que não viram propriedade do objeto global. Dentro de
  `page.evaluate` use a referência nua (`db`, `_impEstado`), nunca `window.db`.
- **`setInputFiles` retorna antes do handler assíncrono terminar.** O passo 1
  redesenha a tela depois de ler o arquivo. Sempre aguarde o redesenho
  (`await expect(page.locator('#imp-corpo')).toContainText('22 aba')`) antes de
  mexer nos campos, senão há corrida e a escolha é perdida.
- **Escopar os seletores de botão ao `#imp-corpo`.** A tela do catálogo tem
  botões ocultos ("Cadastrar Material") que casam por texto e o Playwright fica
  esperando um elemento invisível.
- **`showAlert` e `showConfirm` devolvem promessa que só resolve no clique.**
  Chamar de dentro de `page.evaluate` uma função que os aguarda pendura o teste
  até o timeout.

## O que cada arquivo cobre

| Arquivo | Cobertura |
|---|---|
| `leitura.spec.js` | A página carrega sem erro, o SheetJS **não** é baixado no load, o leitor abre a planilha real e o núcleo roda no navegador com o mesmo resultado do Node |
| `passos-1-2.spec.js` | Modal, validações, as 22 abas com tipo pré-sugerido, troca de tipo por índice, cadastro de fornecedor sem recarregar |
| `passo-1-estado.spec.js` | Escolher o fornecedor antes do arquivo não pode perder a escolha |
| `passo-3-mapeamento.spec.js` | As 7 abas de tecido viram um layout só, `CORTE` vence `PEÇA`, troca de papel limpa o anterior, bloqueio nomeando as abas |
| `passo-4-conferencia.spec.js` | Agrupamento, gravação com markup, estoque intacto, desfazer, bloqueio por duplicidade, edição de custo, desmarcar linha |
| `passo-4-duplicados.spec.js` | Painel de repetidos, sufixo `D`/`DD`, não colidir com código já existente, descartar preservando a primeira, gravar depois de resolver, e não destruir edições anteriores |
| `fase2-pdf-e-cor.spec.js` | PDF real virando uma aba por página, a página do Book 10 dando os mesmos 38 itens da planilha, modo preço por cor gerando 235 materiais sem repetir código, seleção manual de cabeçalho, e a planilha continuando a funcionar |
| `catalogo-selecao.spec.js` | Ordenação por coluna nas duas tabelas do catálogo, os filtros de nome/código, fornecedor, preço e largura, marcar itens e a marcação sobrevivendo a ordenar e filtrar, exclusão em massa respeitando o tecido em uso, e o pedido de compra vindo da seleção nos quatro caminhos (mesmo fornecedor, um por fornecedor, tudo para um, genérico) |
| `config-importacao.spec.js` | Os quatro cartões de configuração do passo 1 (textos, ícones, os dois grupos exclusivos), o sumiço do campo antigo de markup, a cobrança da margem total, a margem aplicada à tabela toda ou item a item, e o estoque infinito não bloqueando pedido, não sofrendo baixa e ficando fora do alerta de mínimo |
| `importacao-kits.spec.js` | O tipo Kit no passo 2, os papéis de coluna próprios do kit, a conferência num bloco à parte, conflito de código contra material, tecido e kit de montagem, produtos e kits na mesma importação indo cada um para o seu lugar, o desfazer cobrindo os dois, a aba Kits no Catálogo e no Estoque, e o kit pronto entrando no pedido como uma linha só |
| `kit-manual.spec.js` | O código obrigatório e único no kit de montagem (Estoque), e o formulário de kit pronto do Catálogo: campos, os quatro cartões, a venda calculada ao vivo, os obrigatórios, o código que não repete, e o kit salvo ficando igual a um importado |
| `codigo-antes-do-nome.spec.js` | A palavra "Referência" fora de todo rótulo e cabeçalho, o lote do rolo como "Lote" e a origem do movimento como "Origem", a ordem das colunas de tecidos, materiais e kits, cada valor na coluna certa, a linha compacta com reticências e tooltip, e o código antes do nome no seletor do pedido e no detalhe do tecido |
| `estoque-infinito-entrada.spec.js` | A escolha nos cartões valendo sobre o perfil salvo do fornecedor, o perfil aparecendo nos cartões ao escolher o fornecedor, e o tecido infinito ganhando rolo: aparece na aba Estoque como ∞, sem botão de baixar, sem o número interno na tela, não é consumido ao vender, e o desfazer tira o rolo junto |
| `cadastro-e-consulta-kits.spec.js` | Kits na Consulta de Estoque (filtro Tipo, saldo controlado/infinito/montagem, filtros por código e nome, painel do kit), o painel expandido sem preço de custo nos três tipos, e os cadastros: os quatro cartões nas três abas, tecido gravando custo, venda pela margem, custo de peça cru e rolo com o código como lote, material por unidade escolhida, e kit com unidade, quantidade e mínimo |
| `ajustes-importacao.spec.js` | Células editáveis no mapeamento (kits e produtos), o cursor que não pula ao corrigir o texto colado, a rolagem de dentro da tabela preservada ao escolher o papel de uma coluna, a criação de coluna com valor para todas as linhas e ajuste célula a célula, a palavra "margem" no lugar de "markup", o tecido registrando preço de corte e de peça ao mesmo tempo, e o modo "preço por cor" explicando por que deu zero itens em linguagem direta, com o aviso clicável acendendo a coluna errada |
| `estoque-colunas-e-menu.spec.js` | A escolha "ajustar estoque" valendo nas duas ordens de clique (cartão antes e depois do fornecedor), a unidade de medida selectável no material e oferecida como coluna na importação, a coluna Unidade em tecidos, materiais e kits do Estoque e na Consulta, o Catálogo intocado, as colunas do Estoque seguindo as do Catálogo, o tecido em uma linha só com os rolos abrindo ao clique (e a baixa funcionando dentro deles), e Histórico/Estoque Futuro/Backup fora da barra de abas, dentro do menu dos três pontos |
| `editar-modo-de-estoque.spec.js` | A edição mostrando o controle de estoque que o item tem de verdade (e não sempre "Ajustar estoque"), só os cartões de estoque ali porque a margem não manda na edição, a troca de infinito para controlado avisando e apagando o saldo de fachada, o cancelar que não muda nada, o caminho de volta, editar sem mexer no cartão preservando o modo, o mesmo para material, e a coluna Em estoque mostrando zero no lugar do traço |
| `ordenar-estoque.spec.js` | Cabeçalho clicável em toda coluna com valor nas três tabelas do Estoque ("Ações" fica de fora), o segundo clique invertendo, só a coluna ativa marcada com a seta do sentido, tecidos ordenando pela quantidade de rolos, os rolos abertos continuando colados no seu tecido, a escolha valendo nas duas telas nos dois sentidos, uma preferência corrompida não derrubando a tela, e o cabeçalho da unidade cabendo na coluna com o nome inteiro no title |
| `preco-do-tecido-sai-do-corte.spec.js` | Com as duas colunas de preço mapeadas, o custo do TECIDO sai do corte (ele é vendido por metro cortado) e o do MATERIAL continua saindo da peça; os dois valores da tabela seguem gravados; tecido só com a coluna de peça continua usando ela, avisando; a nota da etapa 3 dizendo qual das duas manda; e o valor do tecido no pedido saindo do corte COM a margem — nem pela peça, nem pelo corte cru |
| `busca-e-minimo-infinito.spec.js` | Os campos de tecido e de material na entrada de estoque como busca com sugestões: filtro por código ou nome, clique e teclado (setas dando a volta, Enter, Esc), mexer no texto limpando o item escolhido, o preenchimento automático disparando, a entrada gravando o item certo e cobrando a escolha quem só digitou; e o estoque mínimo que não vale para item infinito: o campo somindo do cadastro de tecido, material e kit, o valor gravado como zero, o traço nas listas, no detalhe e na Consulta, o dado antigo preservado e a ordenação tratando infinito como sem mínimo |
| `rolo-se-chama-codigo.spec.js` | O rolo chamado de "Código" em toda a Gestão de Estoque — formulário (com a dica "banho de cor"), tabela de rolos, Consulta, Balanço e o filtro dele, a confirmação da entrada e o movimento gravado no histórico; "Metragem do Rolo" virando "Metragem"; o formulário de baixa falando em rolo; e a palavra "lote" preservada nos Pedidos, onde ela quer dizer banho de cor |

Esperado no total: **308 passando**.
