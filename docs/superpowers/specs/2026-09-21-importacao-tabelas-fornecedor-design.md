# Importação de tabelas de fornecedor — design

Data: 2026-09-21
Status: aprovado no brainstorming, pronto para o plano de implementação

## Problema

Fornecedores de tecido e acessórios enviam tabelas de preço periodicamente (a
tabela de referência é mensal: "Tabela RC - SETEMBRO - 2024"). Hoje cada item
entra manualmente no Cadastro/Catálogo. São ~650 itens por tabela, o que torna o
cadastro manual inviável e mantém os preços do sistema desatualizados.

O importador precisa ser **maleável** (cada fornecedor usa um layout diferente) e
**didático** (o usuário entende e confere o que será gravado antes de gravar).

## Dados de referência

Arquivos analisados em `Docs/`:

- `Tabela RC - SETEMBRO - 2024.xlsx` — 22 abas
- `Tabela de preços RC TECIDOS PDF.pdf` — 22 páginas, mesmo conteúdo, com camada de texto

| Grupo | Abas | Layout |
|---|---|---|
| Tecidos | Promocionais-Book 06, Book 10, 12, 13, 14, 15, 16 | `A:CÓDIGO B:DESCRIÇÃO D:LARGURA E:CORTE F:PEÇA` — cabeçalho na linha 2, idêntico nas 7 |
| Materiais simples | Trilhos, Broca-Bucha-Parafuso, Aviamentos-Pingentes, Wave-Square-Retangular | cabeçalho na linha 2 ou 3; colunas variam (CORES, QUANT., PREÇO) |
| Materiais com preço por cor | Cor Metal, Cor Madeira, Abraçadeira-Ponteira, SUPPVC-Retangular-Unic | uma coluna de preço por cor/acabamento (até 6) |
| Preço por faixa | Barras | preço por quantidade (5 barras, 10 barras); tratado como preço por coluna escolhida |
| Sem cabeçalho reconhecível | Trilho Motorizado, Varão Prime Montado, Trilho Slim Montado, Trilho Square Montado, Varão Unic 19mm Montado | usuário indica a linha do cabeçalho manualmente |
| Ignorada | Capa | — |

Particularidades confirmadas nos dados:

- Um segundo bloco `CORTE|PEÇA` (colunas H/I) duplica o primeiro. É descartado
  pelo usuário no mapeamento, não por regra fixa no código.
- 55 códigos começam com `*` (promocional) e 595 não; **nenhum código aparece nas
  duas formas**, então normalizar o `*` não funde produtos distintos.
- Linhas de observação caem na coluna do código (ex.: "MODELO WAVE PLUS NÃO
  ACOMPANHA A ENTRETELA…") e não podem virar produto.
- Preços podem vir como `--` (item não ofertado) e com ruído de ponto flutuante
  (`78.900000000000006`).
- Abas podem ter seções no meio (ex.: `Trilhos`, linha 14). Os subgrupos são
  achatados numa lista só.

## Onde o dado entra

Nenhum campo novo em tecido ou material. O importador grava nos campos existentes:

| Campo | Origem |
|---|---|
| `referencia` | coluna Código, normalizada |
| `nome` | coluna Nome |
| `largura_rolo` | coluna Largura (só tecido) |
| `unidade` | coluna Unidade (só material; default `un`) |
| `preco_custo` | coluna de Preço escolhida pelo usuário |
| `preco` | `preco_custo × (1 + markup)` |
| `fornecedor_id` / `fornecedor_nome` | escolhido no passo 1 |

O importador **não altera estoque**. Metragem continua entrando por "entrada de rolo".

O cadastro manual (`salvarCatalogo`, `salvarMaterial`) já rejeita **nome duplicado**
e **referência duplicada**. O importador respeita as duas regras: um item cujo nome
já pertence a outro produto é bloqueado na conferência até o usuário editar o nome.

### Regra de markup

- **Item novo:** usa o markup informado na importação.
- **Item existente com markup registrado** (`preco_custo > 0` e `preco > 0`):
  preserva o markup — `novo_preco = novo_custo × (preco_atual / preco_custo_atual)`.
- **Item existente sem markup registrado** (`preco_custo = 0`): entra numa lista à
  parte na tela de conferência, onde o usuário define o markup desses itens.

## Fluxo da tela

Assistente de 4 passos, aberto por "📥 Importar tabela" no Cadastro/Catálogo,
usando o padrão de modal já existente no sistema.

**Passo 1 — Arquivo e fornecedor.** Arrastar/soltar `.xlsx`, `.csv` ou `.pdf`. O
usuário escolhe o fornecedor (ou cadastra um novo sem sair do assistente). Se
houver perfil salvo para esse fornecedor, ele é aplicado e o usuário pode pular
direto ao passo 4.

**Passo 2 — Abas e tipo.** Lista de abas com caixa de seleção e tipo
(Tecido / Material / Ignorar), pré-marcado pelo conteúdo: aba com coluna LARGURA
sugere Tecido, as demais Material, `Capa` Ignorar. Cada linha mostra a contagem de
itens detectados.

**Passo 3 — Mapeamento.** Um mapeamento **por layout distinto**, não por aba: as 7
abas de tecido compartilham um só. Mostra as primeiras linhas reais do arquivo e,
sobre cada coluna, um seletor: Código · Nome · Largura · Preço · Unidade · Cor ·
Ignorar. As sugestões vêm do nome da coluna (`CODIGO`→Código, `LARGURA`→Largura,
`CORTE`→Preço) e são corrigíveis.

O botão "Esta aba tem preço por cor" alterna o modo de expansão por cor, no qual o
usuário marca quais colunas são cores e vê a contagem resultante antes de seguir.
Para abas sem cabeçalho detectado, o usuário indica a linha do cabeçalho.

**Passo 4 — Conferência.** Grade editável com tudo que será gravado, agrupada por
situação e com contagem: Novos · Atualizados (com antes/depois de custo e venda) ·
Conflitos · Sem markup registrado · Com problema (desmarcados) · Sumiram da tabela
(apenas aviso). Qualquer célula é editável. Nada é gravado até a confirmação final.
Ao final, o assistente oferece salvar o perfil.

### Resolução em massa de códigos repetidos

A tabela real traz o mesmo código em várias linhas — variantes de cor que
compartilham código. Resolver uma a uma é inviável: a tabela de referência
produz 11 grupos de código repetido numa importação. Então, quando o lote tem
código repetido entre as linhas marcadas, o passo 4 mostra um painel no topo,
listando os códigos e quantas vezes cada um aparece, com duas saídas:

- **Diferenciar com "D".** A primeira ocorrência mantém o código; a segunda vira
  `<código>D`, a terceira `<código>DD`, e assim por diante. O sufixo cresce até o
  código ficar livre — livre significa não usado por outra linha do lote **nem**
  já existente em `db.catalogo`/`db.materiais`, porque código é único no sistema
  inteiro.
- **Descartar os repetidos.** A primeira ocorrência continua marcada e as demais
  são desmarcadas. Nada é apagado: as linhas seguem visíveis e o usuário pode
  remarcar.

"Primeira" é a ordem em que a linha aparece na importação — ordem das abas e, dentro
da aba, ordem das linhas. O painel some quando não há mais repetição. As duas ações
só mexem em linhas marcadas, porque linha desmarcada não é gravada e portanto não
gera duplicidade.

## Classificação

Pelo código normalizado, que é único no sistema inteiro:

| Situação | Critério | Ação |
|---|---|---|
| Novo | código não existe | cria com o markup da importação |
| Atualizado | código existe, mesmo fornecedor | atualiza custo, recalcula venda preservando o markup |
| Conflito | código existe, outro fornecedor | bloqueia até o usuário escolher: substituir o existente ou editar o código que entra |
| Nome repetido | nome já usado por outro item | bloqueia até o usuário editar o nome |
| Sem markup | existe, `preco_custo = 0` | usuário define o markup na tela |
| Com problema | preço ausente, `--` ou não numérico | entra desmarcado, com o motivo escrito na linha |
| Sumiu | existe no sistema, ausente na tabela | apenas aviso, nada é alterado |

Avisos não bloqueiam a gravação e aparecem na linha do item: código promocional
(vinha com `*`) e largura acima de 10 (provável centímetro em vez de metro).

## Normalizações

- **Código:** remove `*` e espaços; o `*` vira um aviso "promocional" no item.
- **Preço:** aceita `78,90` e `78.90`; corrige ruído de ponto flutuante; `--`,
  vazio ou texto marcam o item como "com problema".
- **Largura:** sempre em metros; valor acima de 10 gera aviso de possível centímetro.
- **Nome:** colapsa espaços repetidos.
- **Linha vira item** se tiver código e nome, o que descarta faixas de título,
  observações soltas e linhas em branco de espaçamento. Preço inválido não
  descarta a linha: o item entra como "com problema", para o usuário decidir.

## Expansão por cor

Em aba marcada como "preço por cor", cada linha × cor marcada vira um material:

- código: `<código>-<COR>` (ex.: `AC123-DOURADO`)
- nome: `<nome> (<COR>)`
- preço: o da coluna daquela cor
- cores sem valor naquela linha são puladas

## Perfis

Novo `db.import_perfis`, persistido em `localStorage` via `syncDB`:

```js
{ id, nome, fornecedor_id,
  layouts: [ { colunas: {codigo:"A", nome:"B", largura:"D", preco:"E"}, linha_cabecalho: 2 } ],
  abas:   { "Book 10": "tecido", "Trilhos": "material", "Capa": "ignorar" },
  cores:  { "Cor Metal": ["DOURADO","CROMADO","BRANCO"] },
  markup_padrao: 80 }
```

O perfil é aplicado pela escolha do fornecedor no passo 1, sem adivinhação por
nome de arquivo ou assinatura de colunas.

## Snapshot e desfazer

Antes de gravar, o sistema salva uma cópia de `db.catalogo` e `db.materiais` em
`localStorage`. A tela de importação oferece "desfazer última importação", que
restaura esse estado. Guarda apenas o último snapshot.

## Arquitetura

Módulo novo `js/importador.js`, carregado por `catalogo.html`. O `app.js` só ganha
o botão que abre o assistente.

```
arquivo → [leitor: xlsx | csv | pdf] → linhas cruas + abas
        → [detector]      acha cabeçalho, descarta o que não é produto
        → [mapeamento]    sugere colunas, usuário ajusta, salva perfil
        → [normalizador]  limpa código/preço/largura, expande cores
        → [comparador]    novo / atualizado / conflito / sem markup / problema / sumiu
        → [conferência]   grade editável → grava
```

Cada etapa recebe e devolve dados simples, para que detecção, normalização e
comparação possam ser testadas fora do navegador.

Bibliotecas por CDN: SheetJS (xlsx/csv) e pdf.js (já usado no Contas a Pagar). No
PDF, os fragmentos de texto são agrupados por `y` (linhas) e por faixas de `x`
(colunas); daí em diante o fluxo é idêntico ao do Excel.

## Verificação

**Fora do navegador** (scripts Node, como no decodificador de boleto do Contas a
Pagar): detecção de cabeçalho, normalizações, expansão por cor e classificação.

**Contra os arquivos reais** de `Docs/`:

- 22 abas; 7 de tecido com layout idêntico; `Capa` ignorada
- Book 10 → 38 itens; Book 14 → 4 itens com preço `--` classificados como "com problema"
- 55 códigos com `*` normalizados sem colidir com os 595 sem `*`
- a observação "MODELO WAVE PLUS…" não vira produto
- `Cor Metal` em modo cor → N linhas × 6 cores = N×6 materiais
- o PDF produz os mesmos códigos e preços que o Excel (é a mesma tabela em dois formatos)

**No navegador** (Playwright): subir o arquivo, mapear, conferir, gravar, verificar
catálogo e materiais, desfazer e verificar a restauração.

## Fases

O fluxo descrito acima é o estado final. As fases apenas dividem a entrega.

**Fase 1 — planilha.** Leitor xlsx/csv, detecção de cabeçalho, mapeamento por
layout, seleção de abas com tipo, classificação completa, tela de conferência
editável, regra de markup, perfis, snapshot e desfazer. Cobre as abas de tabela
simples.

**Fase 2 — PDF e preço por cor.** Leitor de PDF com agrupamento por coordenadas,
modo de expansão por cor e seleção manual da linha de cabeçalho para as abas sem
cabeçalho reconhecível.

## Fora de escopo

- Alterar estoque ou metragem
- Desativar automaticamente itens ausentes na tabela nova
- Histórico de importações além do último snapshot
- Variantes de produto no modelo de dados: a expansão por cor cria itens independentes
