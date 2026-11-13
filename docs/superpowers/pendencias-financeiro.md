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

## Da Fase 1 (branch `feat/financeiro-fase1`)

### Dados e dinheiro
- [ ] Excluir uma parcela em aberto que tem partes pagas (`parcela_origem_id`) deixa as partes sem origem; o estorno delas então só reabre a parte sozinha.
- [ ] Baixa com cartão numa conta que não aceita movimento (sem conta / data anterior ao saldo inicial) não gera a conta de taxa: a despesa de taxa fica fora do gráfico.
- [ ] Conta a pagar paga sem movimento ainda pode ser excluída (comissão fica paga no pedido sem trilha); a remoção do movimento de conta a pagar está inline, sem função própria.
- [ ] Remover uma conta deixa movimentos, contas a receber e a pagar com `conta_id` órfão; as telas devem tolerar conta ausente (ou impedir a remoção).
- [ ] Contas inativas ainda entram nos saldos de hoje (`saldosHoje`) e nos saldos do Extrato.
- [ ] Mês antes da abertura da conta mostra o saldo inicial no Extrato.
- [ ] Transferência aceita data futura; destino padrão da transferência é `contas[1]`.
- [ ] Valores não convertidos no cartão: `repassesCartao` não força número; "1,5" (vírgula) vira padrão no core e "1,250.50" (formato US) é lido errado.
- [ ] `dividirParcela` compara o valor pago arredondado com o valor cru da parcela.
- [ ] Data vazia vira hoje; `baixarContasReceber` não valida por conta própria.
- [ ] Conta a receber/pagar sem `data_vencimento` cai em "hoje" sem aviso; item com valor 0 marca "inclui atrasados".
- [ ] Telefone com zero de tronco não é limpo na cobrança; cobrança casa por nome com o primeiro cliente homônimo.
- [ ] "Cobrado hoje" é marcado mesmo se o navegador bloquear o popup do WhatsApp.
- [ ] Entrada vazia: a visibilidade do saldo usa 50% e o salvar usa o plano.
- [ ] Meio apagado reabre como "a definir"; entrada 0% ainda mostra o meio da entrada.
- [ ] Os padrões do cartão estão duplicados (`CARTAO_PADRAO_CFG` e CaixaCore).
- [ ] "Cartão que cai hoje" na tela Hoje mostra o valor bruto (e qualquer entrada numa maquininha); mostrar o líquido ou rotular "bruto".
- [ ] Excluir uma conta em Preferências não pede confirmação mesmo com movimentos; o saldo some do Hoje/Extrato e a previsão ainda conta os movimentos futuros dela. Pedir confirmação ou bloquear.
- [ ] Na configuração de meios, um meio de cartão pode apontar para conta que não é maquininha (aí a baixa fica "sem conta"). Restringir o select por tipo.
- [ ] Visão Geral (gráfico de fluxo e "Recebido") ainda usa a data da baixa e o valor bruto do cartão, diferente de Hoje/Extrato (datas de repasse). Alinhar na Fase 2.
- [ ] FUNCIONALIDADES: 10.20 não diz que a aba Hoje exige a permissão Hoje; 10.18 não cita o "a cair" por conta.

### Telas e textos
- [ ] Botões e textos ainda dizem "forma de pagamento" onde agora é "plano".
- [ ] Aviso de repasse com quebras de linha (\n\n) sobrando.
- [ ] "#undefined" na conta a receber sem pedido.
- [ ] Hover da conta na tela Hoje invisível no tema escuro; `.hoje-conta` sem acesso por teclado.
- [ ] Tarefas da tela Hoje aparecem para quem não pode visualizar receber/pagar (só os botões são barrados).
- [ ] Comentários "na Visão Geral" no código estão desatualizados.
- [ ] Comissão antiga paga sem conta a pagar não tem botão Estornar.

### Testes que faltam
- [ ] Cartão: cancelar, débito, antecipar, recebimento parcial com cartão e conta removida.
- [ ] Estorno de pagamento: sem conta e com permissão negada.
- [ ] Cobrança: casar por nome, fallback e permissão.
- [ ] Excluir transferência: permissão negada.
- [ ] Periodicidade de despesas fixas: teste com data fora do horizonte (o atual pode ser fraco).

## Da Fase 2 (branch `feat/financeiro-fase2`)

### Dados e dinheiro
- [ ] Recebimento antigo sem movimento (de antes das contas) conta no Resultado do mês e na Visão Geral, mas não aparece no Extrato (não passou por conta nenhuma).
- [ ] Visão Geral com período que pega só um pedaço do mês (7 dias, 30 dias, personalizado) não leva o imposto daquele mês; o imposto (pela referência) entra só nos meses inteiros do período.
- [ ] "Este mês" na Visão Geral vale o mês inteiro para recebido/saídas (inclui cartão a cair até o último dia), como o Resultado do mês e o Extrato; "A receber"/"A pagar" continuam até hoje.
- [ ] Saldo Previsto da Visão Geral mistura janelas: recebido/pago no mês inteiro contra a receber/a pagar só até hoje.
- [ ] O imposto do mês aparece no último dia do gráfico combo da Visão Geral.
- [ ] O "Previsto até o fim do mês" (Resultado do mês) não projeta o imposto estimado do resto do mês.
- [ ] Imposto parcelado mantém o deslocamento do mês de referência da primeira guia (pode não ser o desejado em todos os casos).
- [ ] O imposto por referência (Resultado do mês, Visão Geral) pode diferir do caixa do Extrato, que mostra a data do pagamento.
- [ ] O histórico de 12 meses da margem é recalculado a cada render do Resultado do mês.

### Telas e textos
- [ ] A opção "Imposto" está duplicada em dois lugares no código (formulário do A Pagar e despesas fixas).
- [ ] O campo de valor das parcelas (`cpm-valor`) ainda é `type=number` e não aceita "1.250,50".
- [ ] Na Visão Geral, a meta padrão não aparece como sugestão (sem placeholder) no campo de ajuste do mês.
- [ ] O seletor "+ Limite só neste mês" fica visível mesmo sem nenhum orçamento definido.

### Testes que faltam
- [ ] Escape e empilhamento das janelas de ajuste (meta/limite) com outras janelas abertas.
- [ ] O Chart.js vem do CDN e é instável nos testes (considerar cópia local ou espera mais robusta).
