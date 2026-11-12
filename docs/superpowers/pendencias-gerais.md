# Pendências gerais

Pendências pequenas fora do Financeiro, para revisar quando o usuário pedir.

## Carrinho, histórico e menu de ações (branch feat/carrinho-e-acoes)

### Dados
- [ ] Pedido de compra sem data de envio e sem data de criação gera NaN no histórico do fornecedor.
- [ ] Pedido de compra novo não nasce com `data_envio: null`.
- [ ] Registros de carrinho vazio ficam no banco depois de esvaziados; limpar.
- [ ] Arredondamento do histórico é local (cópia); unificar com o core.

### Telas e textos
- [ ] Menu ⋮ aberto durante um re-render aponta para ids antigos.
- [ ] Bloqueio de exclusão diz "1 itens"; ajustar o singular.
- [ ] Clique no ✕ logo após editar a quantidade pode ser perdido no re-render.
- [ ] Enter não confirma quando o foco está no select de fornecedor da janela de adicionar.
- [ ] Quantidade "1.000" é lida como mil; definir regra de separador.
- [ ] Tabela de 7 colunas usa colspan 6 na linha vazia (já existia antes).
- [ ] Filtro do histórico se perde ao abrir o PDF de um pedido.
- [ ] Mesmo item adicionado de novo mantém a unidade gravada na primeira vez; se a unidade do cadastro mudar entre os dois, as quantidades somam com o rótulo antigo.
- [ ] Fechar carrinho abre o PDF simples, não a janela de compartilhar (WhatsApp).
- [ ] Carrinho só com itens sem preço gera pedido de R$ 0.
- [ ] Comentários de cabeçalho da galeria ainda citam o simulador.
- [ ] Loader do SheetJS duplicado (app.js e importador-ui.js); unificar.
- [ ] Comentário sobre escapar onclick no `menuAcoesHtml`.

### Testes que faltam
- [ ] Menu ⋮: posição (flip) perto da borda e tema escuro.
- [ ] Teste "não contém Simular" está amplo demais; restringir.
- [ ] Seletor solto no teste do ver senha.
