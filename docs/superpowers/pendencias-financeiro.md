# Pendências do módulo Financeiro

Combinado com o usuário: as pendências ficam anotadas aqui e são revisadas e
resolvidas **todas de uma vez, no final das fases** do Financeiro.

## Da Fase 0 (branch `feat/financeiro-fase0`)

### Dados e dinheiro
- [x] **Importar backup com navegador quase cheio**: `importarDados` grava `sc_empresa`/`sc_formas_pag` antes de limpar as chaves da Fase 0. Se a gravação falhar por falta de espaço, um backup antigo pode não ser corrigido. Correção: limpar as chaves antes ou proteger as gravações. **Feito:** as chaves da Fase 0 são limpas antes das gravações; falta de espaço na importação avisa em vez de falhar em silêncio.
- [x] **Valor digitado zerado no "Confirmar pagamento"**: pedido com `financeiro_gerado`, sem parcelas e com `valor_recebido` digitado (ex.: pedido de valor 0, ou parcelas removidas antes da Fase 0) tem o valor zerado ao confirmar. **Feito:** sem parcela nenhuma, confirmar o pagamento mantém o valor recebido digitado.
- [x] **Reaprovação com valor pago maior que o novo valor do pedido**: não gera nada e não avisa do pagamento a mais. **Feito:** avisa "O cliente já pagou R$ X, mais que o novo valor do pedido (R$ Y). Devolva R$ Z ou ajuste o pedido." e não gera conta.
- [x] **`pedido_cancelado` fica marcado** na comissão paga quando o pedido volta a ser aprovado e chega de novo em Instalado. Limpar a marca nesse momento. **Feito:** a marca sai da comissão paga quando o pedido chega de novo em Instalado.
- [x] **Comissão de arquiteto antiga (`comissao_rt`) pendente** não aparece para pagar na tela de Vendedores (só pelo A Pagar). **Feito:** aparece na lista de comissões pendentes da aba Arquitetos e é paga pelo mesmo fluxo.
- [x] **Excluir pedido de compra** deixa as contas a pagar com `pedido_compra_id` apontando para um PC que não existe. **Feito:** com conta paga bloqueia; com contas em aberto confirma e exclui o pedido junto com elas.
- [x] **Vincular nota a conta existente** não atualiza o `tipo_lancamento` da conta. **Feito:** a conta vinculada passa a ter o `tipo_lancamento` da nota/boleto.
- [x] **`_migrarFinanceiroPedidos` (código antigo)** ainda cria ids com `nextId++` sem checar ids já usados, e agora roda em toda página. **Feito:** ids novos pulam os já usados em contas a receber.

### Cópia de segurança
- [x] **Recarregar 300 ms depois do download** da cópia: com cópias grandes, alguns navegadores podem perder o download. **Feito:** espera 1500 ms e mostra o botão "Recarregar agora".
- [x] **"Baixar cópia"** baixa a cópia parcial (só serve para consulta, não para Importar). Deixar isso claro no aviso. **Feito:** aviso "Esta cópia é parcial: serve para consulta, não para Importar." no aviso da cópia e ao baixar.
- [x] **Falta de espaço fora da migração**: só a migração trata erro de espaço; os outros `syncDB` falham como antes. **Feito:** `syncDB` captura o erro de espaço, avisa uma vez e não quebra a tela (migração e importador seguem tratando o erro por conta própria).

### Telas e textos
- [x] Confirmar pagamento com todas as parcelas já pagas abre a janela vazia (melhor uma confirmação simples). **Feito (R2):** com tudo pago aparece a confirmação "Todas as parcelas deste pedido já estão pagas." (botão "Marcar como instalado"), sem a janela de baixa vazia.
- [x] Forma de pagamento padrão da comissão vem com a primeira forma da lista (ex.: "50% entrada…"). Oferecer opção em branco ou "PIX". Ligado à separação plano × meio de pagamento (Fase 1). **Feito (R2):** já resolvido pela Fase 1: o meio da comissão começa em "Escolha o meio" (em branco) e é obrigatório ao pagar; teste novo confirma.
- [x] Usuário sem permissão vê a janela de gerar conta do pedido de compra e só é barrado ao confirmar. **Feito (R2):** sem permissão a janela nem abre; aparece o aviso de permissão antes.
- [x] Texto do aviso de "Voltar para Orçamento" não cita as comissões pendentes removidas. **Feito (R2):** o aviso diz quantas comissões pendentes serão removidas (só quando há).
- [x] Descrição "Entrada (X%)" fica desatualizada na reaprovação com entrada paga em parte. **Feito (R2):** a descrição mostra o % que ainda falta (ex.: 50% com R$ 200 pagos de R$ 1.000 vira "Entrada (30%)").
- [x] Alíquota: 0 recarrega como campo vazio; "6,5" recarrega como "6.5". **Feito (R2):** recarrega "0" e "6,5".
- [x] "Entrada de 30%" no nome da forma não é reconhecido (vira 50%, editável). **Feito (R2):** "Entrada de 30%" vale 30% (as formas antigas continuam valendo).
- [x] Data futura aceita na baixa; desmarcar o único item da janela de baixa fecha sem aviso. **Parte da data feita:** baixa de recebimento/pagamento e transferência recusam data depois de hoje ("A data não pode ser depois de hoje."). **Feito (R2):** desmarcar o único item deixa Confirmar desabilitado com "Marque pelo menos um item." (a janela não fecha).
- [x] Cor `#B26A00` fixa no selo do DRE (usar variável de CSS). **Feito (R2):** `--dre-selo-aviso` no `:root`, com cor própria no tema escuro.

### Testes que faltam
- [x] Cancelar a janela de baixa / de comissão sem mudar nada. **Teste:** `tests/e2e/financeiro-pendencias-r3-fase0.spec.js` (recebimento, pagamento por Escape e comissão).
- [x] Estorno de parcela vencida volta como "Atrasado"; teste negativo de permissão do estorno. **Teste:** `tests/e2e/financeiro-pendencias-r3-fase0.spec.js` (a receber e a pagar vencidas; sem permissão em recebimento, pagamento e comissão).
- [x] Custo guardado ao aprovar por `moverStatus`/`salvarPedido` e na reaprovação. **Teste:** `tests/e2e/financeiro-pendencias-r3-fase0.spec.js` (`aprovarPedido` já era coberto em `financeiro-fase0-dre.spec.js`).
- [x] Vincular nota a conta parcelada; parcelas 100/3; soma de grupo na nota duplicada. **Teste:** `tests/e2e/financeiro-pendencias-r3-fase0.spec.js` e `tests/financeiro-core.test.js` (soma do grupo).
- [x] Alíquota fora da faixa / inválida. **Teste:** `tests/e2e/financeiro-pendencias-r3-fase0.spec.js` (acima de 100 vira 100; negativa, texto e vazia viram 0).
- [x] Ciclo estorno → exportar → importar. **Teste:** `tests/e2e/financeiro-pendencias-r3-fase0.spec.js` (a parcela estornada continua em aberto depois de importar).

## Da Fase 1 (branch `feat/financeiro-fase1`)

### Dados e dinheiro
- [x] Excluir uma parcela em aberto que tem partes pagas (`parcela_origem_id`) deixa as partes sem origem; o estorno delas então só reabre a parte sozinha. **Feito:** excluir parcela com partes pagas é bloqueado ("Esta parcela tem partes pagas. Estorne as partes antes de excluir.").
- [x] Baixa com cartão numa conta que não aceita movimento (sem conta / data anterior ao saldo inicial) não gera a conta de taxa: a despesa de taxa fica fora do gráfico. **Feito:** a baixa gera a conta de taxa (paga, sem movimento) mesmo sem conta ou antes do saldo inicial; a despesa entra no gráfico.
- [x] Conta a pagar paga sem movimento ainda pode ser excluída (comissão fica paga no pedido sem trilha); a remoção do movimento de conta a pagar está inline, sem função própria. **Feito:** conta paga não se exclui (estornar antes); remoção do movimento virou `removerMovimentosDaBaixaCP`.
- [x] Remover uma conta deixa movimentos, contas a receber e a pagar com `conta_id` órfão; as telas devem tolerar conta ausente (ou impedir a remoção). **Feito:** conta com movimentos não é excluída: oferece Desativar (com Reativar); sem movimentos, pede confirmação. Revisão final: o meio de pagamento ligado a ela fica sem conta, e a confirmação diz qual ("Excluir a conta <nome>? O meio <meio> fica sem conta."); o Salvar contas não lhe dá outra conta.
- [x] Contas inativas ainda entram nos saldos de hoje (`saldosHoje`) e nos saldos do Extrato. **Feito:** `saldosHoje`, Extrato e previsão ignoram contas desativadas; o histórico continua no Extrato.
- [x] Mês antes da abertura da conta mostra o saldo inicial no Extrato. **Feito:** mostra 0 e "Conta aberta em dd/mm/aaaa".
- [x] Transferência aceita data futura; destino padrão da transferência é `contas[1]`. **Feito:** data depois de hoje é recusada; destino começa vazio, é obrigatório e diferente da origem.
- [x] Valores não convertidos no cartão: `repassesCartao` não força número; "1,5" (vírgula) vira padrão no core e "1,250.50" (formato US) é lido errado. **Feito:** `CaixaCore.lerNumero` (vírgula, milhar BR/US; o último separador é o decimal) usado no core e em `_numeroBR`; `repassesCartao` força número.
- [x] `dividirParcela` compara o valor pago arredondado com o valor cru da parcela. **Feito:** compara em centavos.
- [x] Data vazia vira hoje; `baixarContasReceber` não valida por conta própria. **Feito:** a baixa recusa data vazia/futura e `baixarContasReceber`/`baixarContasPagar` validam data e valor por conta própria (devolvem `{ ok, erro }`).
- [x] Conta a receber/pagar sem `data_vencimento` cai em "hoje" sem aviso; item com valor 0 marca "inclui atrasados". **Feito:** mostra "sem vencimento", fica fora de Hoje e da previsão e não é atrasada; valor 0 não marca "inclui atrasados".
- [x] Telefone com zero de tronco não é limpo na cobrança; cobrança casa por nome com o primeiro cliente homônimo. Corrigido: zero de tronco removido; cliente achado pelo id (conta ou pedido) e, sem id, pelo nome; nome repetido abre o WhatsApp sem número.
- [x] "Cobrado hoje" é marcado mesmo se o navegador bloquear o popup do WhatsApp. Corrigido: se o navegador bloqueia, avisa e não marca.
- [x] Entrada vazia: a visibilidade do saldo usa 50% e o salvar usa o plano. **Feito:** visibilidade do saldo usa a entrada do plano, como o salvar.
- [x] Meio apagado reabre como "a definir"; entrada 0% ainda mostra o meio da entrada. **Feito:** meio apagado reabre com "escolha o meio (o anterior foi removido)"; entrada 0% esconde o meio da entrada e não grava meio.
- [x] Os padrões do cartão estão duplicados (`CARTAO_PADRAO_CFG` e CaixaCore). **Feito:** só `CaixaCore.CARTAO_PADRAO`; `CARTAO_PADRAO_CFG` saiu.
- [x] "Cartão que cai hoje" na tela Hoje mostra o valor bruto (e qualquer entrada numa maquininha); mostrar o líquido ou rotular "bruto". **Feito:** mostra o líquido (entrada menos a taxa) com o rótulo "líquido".
- [x] Excluir uma conta em Preferências não pede confirmação mesmo com movimentos; o saldo some do Hoje/Extrato e a previsão ainda conta os movimentos futuros dela. Pedir confirmação ou bloquear. **Feito:** bloqueia com movimentos (Desativar) e confirma sem movimentos; desativada sai da previsão. Revisão final: também sai do "Previsto até o fim do mês" do Resultado (`aCairNoMes` ignora os movimentos futuros dela).
- [x] Na configuração de meios, um meio de cartão pode apontar para conta que não é maquininha (aí a baixa fica "sem conta"). Restringir o select por tipo. **Feito:** meio de cartão só lista contas maquininha; trocar o tipo para cartão limpa a conta que não serve.
- [x] Visão Geral (gráfico de fluxo e "Recebido") ainda usa a data da baixa e o valor bruto do cartão, diferente de Hoje/Extrato (datas de repasse). Alinhar na Fase 2. **Feito:** a Projeção de fluxo usa o mesmo motor da previsão do Hoje (`CaixaCore.lancamentosPrevistos`: cartão a cair e cartão previsto pelo líquido, nas datas de repasse); o "Total Recebido" mostra também o líquido (sem a taxa do cartão); recebimento no cartão sem conta entra em cada repasse, não na data da baixa. Revisão final: as datas são as da baixa (guardadas em `cartao.repasses`; dado antigo usa as datas das contas de taxa dele), não refeitas pela maquininha de hoje.
- [x] FUNCIONALIDADES: 10.20 não diz que a aba Hoje exige a permissão Hoje; 10.18 não cita o "a cair" por conta. **Feito:** 10.20 diz que a aba Hoje exige a permissão Hoje; 10.18 mostra o "a cair" por conta.

### Telas e textos
- [x] Botões e textos ainda dizem "forma de pagamento" onde agora é "plano". **Feito:** na configuração (Empresa > Preferências) botões, avisos e rótulos dizem "plano" (Adicionar plano, Salvar Planos, "Nenhum plano cadastrado") e o card do kanban diz "Plano de pagamento". Mantido: o simulador de compra (à vista/parcelado) e o título "4. Forma de Pagamento" do pedido (tem plano e meio).
- [x] Aviso de repasse com quebras de linha (\n\n) sobrando. **Feito:** o aviso do estorno de cartão ("Isso muda o saldo de hoje da conta X.") vem na mesma frase, sem quebra de linha.
- [x] "#undefined" na conta a receber sem pedido. **Feito:** a cobrança de conta sem pedido não escreve número; o trecho "do pedido" some da mensagem.
- [x] Hover da conta na tela Hoje invisível no tema escuro; `.hoje-conta` sem acesso por teclado. **Feito:** hover e foco visíveis no tema escuro; a conta é `role="button"` com `tabindex="0"` e abre o Extrato com Enter ou Espaço.
- [x] Tarefas da tela Hoje aparecem para quem não pode visualizar receber/pagar (só os botões são barrados). **Feito:** tarefas de receber só com `financeiro.receber` (visualizar) e de pagar só com `financeiro.pagar` (visualizar).
- [x] Comentários "na Visão Geral" no código estão desatualizados. **Feito:** os avisos de cópia e de revisão ficam no topo do Financeiro (todas as abas); comentários corrigidos.
- [x] Comissão antiga paga sem conta a pagar não tem botão Estornar. **Feito:** o histórico de comissões ganhou "Estornar" para a comissão paga sem conta (`estornarComissaoAntiga`): desmarca a comissão no pedido e ela volta a pendente.

### Testes que faltam
- [ ] Cartão: cancelar, débito, antecipar, recebimento parcial com cartão e conta removida.
- [ ] Estorno de pagamento: sem conta e com permissão negada.
- [ ] Cobrança: casar por nome, fallback e permissão.
- [ ] Excluir transferência: permissão negada.
- [ ] Periodicidade de despesas fixas: teste com data fora do horizonte (o atual pode ser fraco).

## Da Fase 2 (branch `feat/financeiro-fase2`)

### Dados e dinheiro
- [x] Recebimento antigo sem movimento (de antes das contas) conta no Resultado do mês e na Visão Geral, mas não aparece no Extrato (não passou por conta nenhuma). **Feito:** o Extrato mostra "N recebimentos sem conta (R$ X) não aparecem aqui" para o mês mostrado (só quando há algum); sem "antigos", porque baixa no cartão sem conta também entra aqui.
- [x] Visão Geral com período que pega só um pedaço do mês (7 dias, 30 dias, personalizado) não leva o imposto daquele mês; o imposto (pela referência) entra só nos meses inteiros do período. **Feito:** com período que corta um mês aparece a nota "O imposto entra só nos meses inteiros do período".
- [x] "Este mês" na Visão Geral vale o mês inteiro para recebido/saídas (inclui cartão a cair até o último dia), como o Resultado do mês e o Extrato; "A receber"/"A pagar" continuam até hoje. **Feito:** em "Este mês", A receber/A pagar vão até o fim do mês, na mesma janela do recebido/pago (tela e relatório); os outros períodos ficam como estavam.
- [x] Saldo Previsto da Visão Geral mistura janelas: recebido/pago no mês inteiro contra a receber/a pagar só até hoje. **Feito:** Saldo Previsto usa uma janela só (em "Este mês", tudo até o fim do mês).
- [x] O imposto do mês aparece no último dia do gráfico combo da Visão Geral. **Mantido de propósito:** o imposto conta pela referência (o mês inteiro), então vai no último dia do mês; explicado em FUNCIONALIDADES (Task 7).
- [x] Imposto parcelado mantém o deslocamento do mês de referência da primeira guia (pode não ser o desejado em todos os casos). **Mantido de propósito:** cada guia parcelada tem o seu próprio mês de referência padrão (mês anterior ao vencimento dela), mudado na mesma distância da primeira guia (o mês de referência continua editável na guia); explicado em FUNCIONALIDADES (10.23).
- [x] O imposto por referência (Resultado do mês, Visão Geral) pode diferir do caixa do Extrato, que mostra a data do pagamento. **Mantido de propósito:** o resultado usa o imposto do mês (referência) e o Extrato mostra o dinheiro na data em que saiu; explicado em FUNCIONALIDADES (Task 7).
- [x] O histórico de 12 meses da margem é recalculado a cada render do Resultado do mês. **Feito:** guardado por chave dos dados (mês, alíquota, contas a receber/pagar, movimentos, contas; `ResultadoCore.criarMemo`); sem histórico, a margem pelos pedidos não refaz os 12 meses.
- [x] Despesas fixas antigas sem data de início contam em meses anteriores à criação (ponto de equilíbrio de meses passados pode ficar maior). **Feito (D4):** sem data de início, vale a partir do mês do cadastro (o `id` é o `Date.now()` do cadastro; id que não parece horário continua valendo sempre).
- [x] Recebimento com data futura sem movimento some de 'Até hoje' e do 'Previsto' (ligado à pendência de data futura na baixa). **Feito:** conferido e testado: com a data bloqueada não nasce mais; os antigos contam em "Até hoje" quando a data chega.

### Telas e textos
- [x] A opção "Imposto" está duplicada em dois lugares no código (formulário do A Pagar e despesas fixas). **Feito:** `CATEGORIA_IMPOSTO` única, usada pelas listas do A Pagar, do simulador e das despesas fixas.
- [x] O campo de valor das parcelas (`cpm-valor`) ainda é `type=number` e não aceita "1.250,50". **Feito:** campo de texto lido com `_valorDigitadoBaixa` (aceita "1.250,50").
- [x] Na Visão Geral, a meta padrão não aparece como sugestão (sem placeholder) no campo de ajuste do mês. **Feito:** a meta padrão da Empresa aparece como placeholder no ajuste do mês (no Resultado do mês).
- [x] O seletor "+ Limite só neste mês" fica visível mesmo sem nenhum orçamento definido. **Feito:** só aparece com algum orçamento definido (padrão ou ajuste do mês, mesmo 0).

### Testes que faltam
- [ ] Escape e empilhamento das janelas de ajuste (meta/limite) com outras janelas abertas.
- [x] O Chart.js vem do CDN e é instável nos testes (considerar cópia local ou espera mais robusta). — Feito (R9): cópia local da mesma versão (4.4.0) em `js/vendor/chart.umd.min.js`; as páginas carregam a cópia.

### Da revisão final da Fase 2
- [x] Previsto até o fim do mês: a taxa de repasses de cartão já baixados e ainda a cair não é tirada do faturamento previsto, então o imposto estimado fica um pouco maior (ex.: taxa de R$ 30 a 6% → R$ 1,80). **Feito:** o que já foi baixado e cai até o fim do mês vem de `ResultadoCore.aCairNoMes` (entradas, saídas e taxas pelas regras do Resultado); a taxa a cair sai do faturamento previsto.
- [x] Ponto de equilíbrio: despesa fixa antiga (sem periodicidade) + a mesma despesa lançada à mão como conta avulsa no mesmo mês contam duas vezes. **Feito:** a fixa não soma se no mês há conta gerada dela (agora com `despesa_fixa_id`) ou uma conta já contada nas fixas com a mesma descrição e o mesmo valor. Revisão final: cada conta cobre no máximo uma fixa (duas fixas iguais e uma conta: só uma fixa sai).
- [x] Previsto até o fim do mês: transferências futuras entre contas entram no faturamento previsto e aumentam o imposto estimado. **Feito:** movimentos futuros não entram mais direto no previsto; o que cai depois de hoje vem pelas regras do Resultado, sem transferências.

## Da Fase 3
- [x] Sugestão de alta de grupo pode incluir o Imposto (repete a sugestão da guia); excluir o imposto da comparação. **Feito:** o Imposto fica fora da alta de grupo.
- [x] Conta sem data de saldo inicial fica fora da conferência do fechamento. **Feito:** entra na conferência com o saldo inicial desde sempre.
- [x] Comparação com mês anterior mostra "+0%" quando a diferença é zero. **Feito:** diferença zero mostra "igual ao mês anterior" (passo 3 do fechamento e alerta de tendência).
- [x] Parcelas do simulador param no último dia do mês (31 → 28/02); o parcelado do A Pagar pula para o mês seguinte. Unificar a regra. **Feito (R4):** os dois usam `FinanceiroCore.somarMesesData` (dia que não existe vira o último dia do mês, sempre a partir da data base).
- [ ] Testes que faltam: alta de grupo no limite (30% / R$ 100), ajuste de entrada e "Deixar anotado" no fechamento, duplo clique em Lançar chamando a função duas vezes, migração da permissão em permissões extras do usuário.

## Da rodada de pendências 1
- [x] Previsão do Hoje (e a projeção da Visão Geral) ainda pode somar duas vezes uma despesa fixa antiga e a mesma conta lançada à mão no mesmo mês. — Feito: mesma regra do Resultado (`ResultadoCore.fixasCobertasNoMes`, uma conta cobre no máximo uma fixa).
- [x] Contas recorrentes (`gerarOcorrenciasRecorrentes`) ainda calculam o mês somando um mês de cada vez (`setMonth` acumulado); aplicar a mesma regra das parcelas (dia que não existe vira o último dia do mês). — Feito: cada ocorrência conta da data inicial (`FinanceiroCore.somarMesesData`).
- [x] O relatório exportado (PDF) da Visão Geral não tem a linha "líquido (sem a taxa do cartão)" que a tela mostra. — Feito: o relatório mostra a mesma linha no Total Recebido.
- [x] Transferências antigas com data futura (de antes da trava de data) entram nas duas barras da projeção da Visão Geral. — Feito (R12): transferências entre contas ficam fora das barras de entrada e saída.
- [x] Salvar que falha por falta de espaço (importação de backup ou qualquer `salvarERecarregar`) agora avisa e não recarrega, e a importação mantém a marca e a cópia da Fase 0; ainda fica: os dados da tela continuam trocados até recarregar e uma gravação pela metade pode ter ficado (algumas chaves novas, outras antigas); o aviso do `syncDB` aparece uma vez por página. — Feito (R11): a gravação que falha no meio devolve as chaves já gravadas ao valor anterior e, depois do aviso, a página recarrega (baixa e importação de backup); o aviso do `syncDB` uma vez por página: mantido de propósito.
- [x] O aviso de "meio removido" no pedido não impede salvar (o meio é opcional). — Mantido de propósito: o meio é opcional (R10).
- [x] Contador de cálculos da margem existe só para teste (`_resMargemCalculos`). — Feito (R13): saiu do código; o teste espia `ResultadoCore.margemContribuicao`.
