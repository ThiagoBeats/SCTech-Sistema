# Pendências gerais

Pendências pequenas fora do Financeiro, para revisar quando o usuário pedir.

## Carrinho, histórico e menu de ações (branch feat/carrinho-e-acoes)

### Dados
- [x] Pedido de compra sem data de envio e sem data de criação gera NaN no histórico do fornecedor. (Resolvido: sem data, a coluna fica vazia.)
- [x] Pedido de compra novo não nasce com `data_envio: null`. (Resolvido: o formulário grava `data_envio: null`.)
- [x] Registros de carrinho vazio ficam no banco depois de esvaziados; limpar. (Resolvido: não grava carrinho sem item e limpa os que já estavam gravados ao carregar/importar.)
- [x] Arredondamento do histórico é local (cópia); unificar com o core. (Resolvido: o núcleo do carrinho usa o `arredondar` do financeiro, sem cópia.)

### Telas e textos
- [x] Menu ⋮ aberto durante um re-render aponta para ids antigos. (Resolvido: o menu fecha quando o botão dele sai da página por causa de um redesenho da lista.)
- [x] Bloqueio de exclusão diz "1 itens"; ajustar o singular. (Resolvido: "1 item".)
- [x] Clique no ✕ logo após editar a quantidade pode ser perdido no re-render. (Resolvido: editar a quantidade só atualiza os números, sem trocar a tabela.)
- [x] Enter não confirma quando o foco está no select de fornecedor da janela de adicionar. (Resolvido.)
- [x] Quantidade "1.000" é lida como mil; definir regra de separador. (Regra: a mesma dos valores em R$ — "1.000" = mil, "1,5" = 1,5, "1.250,50" = 1250,5, "1250.5" = 1250,5; documentada e testada.)
- [x] Tabela de 7 colunas usa colspan 6 na linha vazia (já existia antes). (Resolvido: Estoque de materiais vazio usa colspan 7.)
- [x] Filtro do histórico se perde ao abrir o PDF de um pedido. (Resolvido: ao fechar o PDF volta ao histórico com o mesmo filtro.)
- [x] Mesmo item adicionado de novo mantém a unidade gravada na primeira vez; se a unidade do cadastro mudar entre os dois, as quantidades somam com o rótulo antigo. (Resolvido: unidade diferente vira outra linha; editar/tirar mexe só na linha da unidade certa.)
- [x] Fechar carrinho abre o PDF simples, não a janela de compartilhar (WhatsApp). (Resolvido: o PDF do pedido de compra agora tem o botão Enviar.)
- [x] Carrinho só com itens sem preço gera pedido de R$ 0. (Resolvido: pergunta antes de gerar o pedido de R$ 0,00.)
- [x] Comentários de cabeçalho da galeria ainda citam o simulador. (Resolvido: cabeçalhos dizem que o simulador está desligado por `SIMULADOR_ATIVO`.)
- [x] Loader do SheetJS duplicado (app.js e importador-ui.js); unificar. (Resolvido: `garantirSheetJs` em app.js; o importador e o histórico usam a mesma função, mesma versão e CDN; também corrige o importador, que não tentava de novo depois de falha de rede.)
- [x] Comentário sobre escapar onclick no `menuAcoesHtml`. (Resolvido: comentário explica o escape; conferido que está correto e testado com aspas, & e <.)

### Testes que faltam
- [x] Menu ⋮: posição (flip) perto da borda e tema escuro. (Testes em `pendencias-gerais-menu.spec.js`.)
- [x] Teste "não contém Simular" está amplo demais; restringir. (Resolvido: só a área da galeria.)
- [x] Seletor solto no teste do ver senha. (Resolvido: botão da aba pelo `data-tab`.)

## Do tema e da busca no estoque (2026-11-13)
- [x] Tema escuro: outras telas e janelas ainda têm cores claras fixas no estilo da linha (como o Balanço tinha); revisar tela a tela. (Resolvido: cores claras fixas viraram variáveis de CSS com valor escuro (`--surface-2`, `--info-bg`, `--danger-bg`, `--warn-bg`, `--ok-bg` etc.); documentos e PDF (proposta, OS, pedido de compra, relatórios, etiquetas) continuam claros de propósito, inclusive dentro da janela de documento. Teste em `pendencias-gerais-tema-escuro.spec.js`.)
- [ ] Balanço: dois itens com o mesmo nome (ex.: um tecido e um material) — o nome puxa o código do primeiro que achar.
