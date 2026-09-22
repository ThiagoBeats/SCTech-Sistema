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
module.exports = { testDir: process.env.TESTDIR, reporter: 'line', use: { headless: true } };
```

E rode de dentro da pasta onde o Playwright foi instalado. `NODE_PATH` é
necessário porque os testes moram no projeto, que não tem `node_modules`:

```bash
cd /tmp/sctech-e2e
NODE_PATH=/tmp/sctech-e2e/node_modules \
BASE=http://localhost:8131 \
TESTDIR=<projeto>/tests/e2e \
  npx playwright test --config=repo.config.js
```

Esperado: **38 passando**.

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

Esperado no total: **38 passando**.
