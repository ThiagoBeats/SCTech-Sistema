# Pendências do módulo Financeiro

Combinado com o usuário: as pendências ficam anotadas aqui e são revisadas e
resolvidas **todas de uma vez, no final das fases** do Financeiro.

## Da Fase 0 (branch `feat/financeiro-fase0`)

### Dados e dinheiro
- [ ] **Importar backup com navegador quase cheio**: `importarDados` grava `sc_empresa`/`sc_formas_pag` antes de limpar as chaves da Fase 0. Se a gravação falhar por falta de espaço, um backup antigo pode não ser corrigido. Correção: limpar as chaves antes ou proteger as gravações.
- [ ] **Valor digitado zerado no "Confirmar pagamento"**: pedido com `financeiro_gerado`, sem parcelas e com `valor_recebido` digitado (ex.: pedido de valor 0, ou parcelas removidas antes da Fase 0) tem o valor zerado ao confirmar.
- [ ] **Reaprovação com valor pago maior que o novo valor do pedido**: não gera nada e não avisa do pagamento a mais.
- [ ] **`pedido_cancelado` fica marcado** na comissão paga quando o pedido volta a ser aprovado e chega de novo em Instalado. Limpar a marca nesse momento.
- [ ] **Comissão de arquiteto antiga (`comissao_rt`) pendente** não aparece para pagar na tela de Vendedores (só pelo A Pagar).
- [ ] **Excluir pedido de compra** deixa as contas a pagar com `pedido_compra_id` apontando para um PC que não existe.
- [ ] **Vincular nota a conta existente** não atualiza o `tipo_lancamento` da conta.
- [ ] **`_migrarFinanceiroPedidos` (código antigo)** ainda cria ids com `nextId++` sem checar ids já usados, e agora roda em toda página.

### Cópia de segurança
- [ ] **Recarregar 300 ms depois do download** da cópia: com cópias grandes, alguns navegadores podem perder o download.
- [ ] **"Baixar cópia"** baixa a cópia parcial (só serve para consulta, não para Importar). Deixar isso claro no aviso.
- [ ] **Falta de espaço fora da migração**: só a migração trata erro de espaço; os outros `syncDB` falham como antes.

### Telas e textos
- [ ] Confirmar pagamento com todas as parcelas já pagas abre a janela vazia (melhor uma confirmação simples).
- [ ] Forma de pagamento padrão da comissão vem com a primeira forma da lista (ex.: "50% entrada…"). Oferecer opção em branco ou "PIX". Ligado à separação plano × meio de pagamento (Fase 1).
- [ ] Usuário sem permissão vê a janela de gerar conta do pedido de compra e só é barrado ao confirmar.
- [ ] Texto do aviso de "Voltar para Orçamento" não cita as comissões pendentes removidas.
- [ ] Descrição "Entrada (X%)" fica desatualizada na reaprovação com entrada paga em parte.
- [ ] Alíquota: 0 recarrega como campo vazio; "6,5" recarrega como "6.5".
- [ ] "Entrada de 30%" no nome da forma não é reconhecido (vira 50%, editável).
- [ ] Data futura aceita na baixa; desmarcar o único item da janela de baixa fecha sem aviso.
- [ ] Cor `#B26A00` fixa no selo do DRE (usar variável de CSS).

### Testes que faltam
- [ ] Cancelar a janela de baixa / de comissão sem mudar nada.
- [ ] Estorno de parcela vencida volta como "Atrasado"; teste negativo de permissão do estorno.
- [ ] Custo guardado ao aprovar por `moverStatus`/`salvarPedido` e na reaprovação.
- [ ] Vincular nota a conta parcelada; parcelas 100/3; soma de grupo na nota duplicada.
- [ ] Alíquota fora da faixa / inválida.
- [ ] Ciclo estorno → exportar → importar.
