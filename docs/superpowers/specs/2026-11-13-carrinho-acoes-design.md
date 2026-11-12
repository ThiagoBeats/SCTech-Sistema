# Carrinho de compras, histórico por fornecedor e menu de ações — Design

Data: 2026-11-13 · Status: aguardando aprovação · Branch: `feat/carrinho-e-acoes` (a partir da `main` @ 0aa1dfd)

## Por que existe

Pacote de melhorias pedido pelo usuário (dono de empresa de cortinas, usuário
médio — simples e direto):

- O simulador de cortina na parede do cliente fica **para o futuro**; a galeria
  de fotos continua.
- As colunas "Ações" estão cheias de ícones; o usuário quer um **menu de três
  pontos (⋮)** padronizado.
- Em vez da coluna "Total de compras" (pedida ontem), uma ideia melhor: um
  **histórico de pedidos por fornecedor** com soma, filtro e exportação.
- Comprar de fornecedor hoje exige montar um pedido de compra de uma vez. O
  usuário quer um **carrinho por fornecedor**: vai adicionando itens a partir do
  estoque e, quando quiser, fecha o carrinho, que vira um pedido de compra e
  gera o PDF que ele manda ao fornecedor.

**Ordem de entrega (decidida com o usuário):** Parte A (itens simples) →
Parte B (histórico) → Parte C (carrinho).

## Não-objetivos

- Tema claro/escuro em Configurações › Preferências — **adiado pelo usuário**.
- Apagar o código do simulador (só desligar).
- Envio automático do pedido ao fornecedor (e-mail/WhatsApp): continua pelo PDF.
- Mudar o fluxo existente de pedido de compra (Rascunho/Enviado/Recebido,
  conta a pagar ao receber — Fase 0/1) além do que está descrito aqui.

## Anti-objetivos

- Perder qualquer ação que existe hoje ao trocar os ícones pelo menu ⋮.
- Item ir para o carrinho do fornecedor errado.
- Carrinho aberto aparecer como pedido de compra (ou entrar em totais/histórico)
  antes de ser fechado.

## Parte A — itens simples

### A1. Simulador desligado, galeria mantida
- Uma chave única (ex. constante `SIMULADOR_ATIVO = false` num lugar central)
  esconde **todos** os acessos ao simulador:
  - botão "📐 Simular na parede do cliente" em `galeria.html` e a rota
    `galeria.html#simular` (abrir a galeria normal se alguém usar o endereço);
  - o acesso ao simulador dentro da galeria aberta pelo pedido
    (`js/galeria-pedido.js` / `pedido.html` — o botão "🖼️ Galeria" continua,
    com o texto do `title` sem citar simulação);
  - a configuração do simulador em Empresa › "Galeria e Mostruário" (cores,
    tecidos e modelos do simulador). O que for só da galeria (fotos/grupos)
    continua.
- O código (`js/galeria-simulador.js` etc.) **não é apagado**; pode deixar de
  ser carregado enquanto a chave estiver desligada *(decisão do builder)*.
- Testes e2e do simulador (`galeria-simulador*.spec.js` e afins): marcar como
  pulados com o motivo "simulador desligado" (não apagar), e acrescentar um
  teste de que nenhum acesso ao simulador aparece.

### A2. Menu de três pontos (⋮) na coluna Ações
- Componente único reutilizável: botão "⋮" que abre um pequeno menu flutuante
  com as ações (ícone + nome), fecha ao clicar fora, com Escape ou ao escolher;
  funciona em celular; só um menu aberto por vez.
- Aplicar em:
  - **Fornecedores** (`fornecedores.html`, `renderTabelaFornecedores` ~8313);
  - **Clientes** (`renderTabelaClientes` ~2228);
  - **Vendedores/Arquitetos** (`renderTabelaVendedores` ~7921) — separar
    "Situação" e "Ações" em **duas colunas**; Ações com ⋮;
  - **Cadastro/Catálogo**: abas Tecidos, Materiais e Acessórios, Kits.
- O menu contém **exatamente as ações que existem hoje** em cada linha (mesmas
  funções, mesmas permissões/condições de exibição), com os nomes por extenso
  (ex. "✏️ Editar", "🗑️ Excluir"). Ações perigosas (excluir) por último, em
  vermelho.
- **Fornecedores:** remover a coluna "Total de compras"; acrescentar ao menu
  "📜 Histórico de pedidos" (Parte B). O ícone 🛒 do carrinho (Parte C) fica
  **visível na linha, fora do menu**, para mostrar o selo "novo" *(decisão do
  assistente, aceita pelo usuário)*.

### A3. Ver senha em Configurações › Segurança
- Ícone 👁️ dentro/ao lado de cada campo de senha (`seg-senha-atual`,
  `seg-senha-nova`, `seg-senha-conf`) que alterna entre mostrar e esconder.

### A4. Gestão de Estoque
- Na tabela de materiais (estoque), coluna Ações: **remover** "± Ajustar
  estoque"; trocar "🛒 Criar pedido de compra" por **"🛒 Adicionar ao
  carrinho"** (Parte C).
- Na aba de **tecidos** do estoque: nova coluna **Ações** com o mesmo botão
  "🛒 Adicionar ao carrinho".
- O **ajuste manual de estoque não some do sistema** (é o único jeito de
  corrigir para baixo): o "± Ajustar estoque" sai como ícone e vai para um
  **menu ⋮** na coluna Ações do estoque (materiais e kits), ao lado do botão
  🛒 *(sugestão do assistente, aceita pelo usuário)*.

### A5. "Criar pedido de compra" vira "Adicionar ao carrinho" em todo lugar
*(sugestão do assistente, aceita pelo usuário)*
- Toda ação de **item avulso** que hoje cria pedido de compra
  (`pedirMaterial`, `pedirTecido`) passa a ser **"🛒 Adicionar ao carrinho"**:
  tabela de tecidos do Cadastro/Catálogo (dentro do ⋮), botão "🛒 Pedir
  Tecido" da janela de detalhes do tecido (vira "🛒 Adicionar ao carrinho"),
  tabelas do estoque.
- **Seleção de vários itens** no catálogo (`pedidoDaSelecao`): o botão passa a
  **adicionar todos os itens selecionados aos carrinhos dos seus
  fornecedores**. Abre uma janela com a lista dos itens selecionados e um campo
  de quantidade para cada um (unidade do item); itens sem fornecedor pedem o
  fornecedor na mesma janela. Ao confirmar, mostra o resumo ("N itens
  adicionados em M carrinhos").
- O formulário de pedido de compra manual (Fornecedores › Novo pedido,
  `criarPCParaFornecedor`) **continua existindo** para quem quiser montar um
  pedido direto.

## Parte B — Histórico de pedidos do fornecedor

- Aberto por Fornecedores › ⋮ › "📜 Histórico de pedidos": janela/tela com o
  nome do fornecedor.
- Lista os **pedidos de compra desse fornecedor que já foram enviados**
  (status Enviado ou Recebido); rascunhos e carrinhos abertos não entram
  *(decisão do assistente, aceita)*. Ordem: mais recente primeiro.
- Colunas: **nº do pedido**, **data de envio**, **situação**, **valor** (soma
  dos subtotais dos itens).
- **Data de envio:** passa a ser gravada (`data_envio`, `'YYYY-MM-DD'` local)
  quando o pedido vira "Enviado" (por qualquer caminho, inclusive o fechamento
  do carrinho). Pedidos antigos sem `data_envio` usam a data de criação
  *(decisão do assistente, aceita)*.
- **Filtro de período** ("de" / "até", pela data de envio); a **soma total** no
  rodapé acompanha o filtro.
- Clicar num pedido abre o PDF dele (`abrirPedidoCompra`) *(decisão do
  assistente, aceita)*.
- **Exportar** o histórico filtrado em **Excel (.xlsx)** e **PDF** (os dois,
  pedido pelo usuário). Excel com SheetJS (já usado no projeto, carregado sob
  demanda); PDF pelo mecanismo de documentos existente (`abrirDocModal` /
  impressão com o cabeçalho da empresa).

## Parte C — Carrinho de compras por fornecedor

### Adicionar
- Botão "🛒 Adicionar ao carrinho" em Gestão de Estoque (materiais e tecidos —
  A4).
- Abre uma janela pequena: nome do item, fornecedor do item, campo de
  **quantidade na unidade do item** (tecido: metros; material: a unidade do
  cadastro) e botão **Adicionar**.
- Item **sem fornecedor** no cadastro: a janela pede para escolher o fornecedor
  *(decisão do assistente, aceita)*.
- O item vai para o carrinho **do fornecedor dele**. Mesmo item de novo **soma
  a quantidade** *(decisão do assistente, aceita)*.
- Aviso curto de confirmação ("Adicionado ao carrinho de <fornecedor>").

### O carrinho
- **Um carrinho aberto por fornecedor**, acumulando itens até ser fechado.
- **Não aparece** na lista de Pedidos de Compra, no histórico nem em totais
  enquanto aberto *(decisão do assistente, aceita)*.
- Preço de cada item = **preço de custo do cadastro** no momento em que é
  adicionado; subtotal = quantidade × preço *(decisão do assistente, aceita)*.
- Itens no mesmo formato dos itens de pedido de compra (`tipo`, `item_id`,
  `item_nome`, `referencia`, `unidade`, `quantidade`, `preco_unit`,
  `subtotal`, `observacao`), para virar pedido sem conversão.

### Em Fornecedores
- Cada linha mostra o ícone **🛒** com o número de itens do carrinho (vazio:
  ícone sem número, discreto).
- Quando entra item novo, aparece o selo **"novo"**; some quando o carrinho é
  aberto.
- Clicar no 🛒 abre o carrinho: itens com quantidade (editável), preço,
  subtotal, botão para tirar item, e o total.

### Fechar
- Botão **"Fechar e enviar ao fornecedor"**: cria um pedido de compra com
  `gerarNumeroPedidoCompra()`, `status: 'Enviado'`, `data_criacao` agora,
  `data_envio` hoje, `fornecedor_id/nome`, os itens; **abre o PDF** do pedido
  (o usuário manda ao fornecedor); o carrinho daquele fornecedor fica vazio.
- Carrinho vazio não pode ser fechado.
- O pedido criado segue o fluxo normal (lista de Pedidos de Compra, marcar
  Recebido → gerar conta a pagar da Fase 0/1).

### Detalhes fechados após a revisão do builder *(decisões do assistente)*
- **Fornecedor escolhido na janela** (item sem fornecedor) é **gravado no
  cadastro do item**, para não perguntar de novo.
- **Mesmo item** = mesmo `tipo` + `item_id`. Ao somar quantidade, o preço é
  atualizado para o custo atual do cadastro. Preço **não** é editável no
  carrinho; custo vazio/zero é permitido e aparece "sem preço".
- **Excluir fornecedor com carrinho aberto** é bloqueado com a mensagem
  "Este fornecedor tem um carrinho aberto com N itens. Feche ou esvazie o
  carrinho antes." O carrinho guarda só `fornecedor_id` (nome vem do cadastro).
  Item apagado do cadastro continua no carrinho com o nome/referência gravados
  na hora de adicionar.
- **Esvaziar carrinho:** botão "Esvaziar" na janela do carrinho, com
  confirmação.
- **`data_envio`:** gravada toda vez que o pedido vira Enviado; apagada se ele
  voltar para Rascunho (o histórico então não o mostra).
- **Selo "novo":** guardado no carrinho (vale para todos os usuários deste
  navegador); some ao abrir o carrinho.
- **Permissões:** adicionar ao carrinho exige acesso completo a Estoque; ver,
  editar e fechar o carrinho e ver o histórico exigem acesso a Fornecedores
  (fechar/editar: completo).

## Restrições

- Stack atual: HTML/CSS/JS puro, sem build, `localStorage` (`db.*`,
  `syncDB()`), sem dependências novas (SheetJS já é carregado sob demanda pelo
  projeto).
- Lógica pura nova (carrinho: somar item, totais; histórico: filtro, soma)
  num módulo `*-core.js` testável com `node --test`, padrão dos outros cores.
- Coleção nova do carrinho entra em `syncDB`, `_dadosExportacao` e
  `importarDados`.
- Ids com contador + conjunto de ids usados; datas locais (`hojeLocal`).
- Escapar todo texto de usuário; nada de `prompt()`; modais no padrão
  `.sc-modal-overlay` com validação dentro do modal.
- Permissões: seguir as do módulo onde a ação está (Estoque para adicionar ao
  carrinho; Fornecedores para ver/fechar o carrinho e o histórico) — usar as
  chaves existentes em `MODULOS_PERMISSAO`.
- Testes e2e Playwright para cada parte; ajustar testes existentes que clicam
  nos ícones antigos (passam a abrir o ⋮ e escolher a ação).
- Cache-busting dos scripts sobe para uma versão nova.
- Atualizar `FUNCIONALIDADES_SCTECH.txt` nas seções afetadas.

## Deixado para o builder

- Nome da coleção do carrinho e formato exato (sugestão: `db.carrinhos`,
  `sc_carrinhos`: `{ fornecedor_id, itens[], novo: boolean, atualizado_em }`).
- Visual do menu ⋮ e da janela do carrinho (seguir o padrão visual existente).
- Nome/título exato do arquivo exportado (sugestão:
  `historico_<fornecedor>_<de>_<ate>.xlsx`).
