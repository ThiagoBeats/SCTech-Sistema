# Financeiro — Rodada de pendências 1 (dinheiro e dados) — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** resolver as pendências de "Dados e dinheiro" (e "Cópia de segurança") das Fases 0–3 listadas em `Docs/superpowers/pendencias-financeiro.md`.

**Spec:** não há spec própria: a fonte é `Docs/superpowers/pendencias-financeiro.md` + as decisões abaixo (do dono e minhas). As specs das fases ficam em `Docs/superpowers/specs/2026-11-1*-financeiro-fase*-design.md`.

**Architecture:** correções pontuais em `js/app.js` e nos núcleos (`js/financeiro-core.js`, `js/caixa-core.js`, `js/resultado-core.js`, `js/fechamento-core.js`, `js/simulador-core.js`), cada uma com teste (núcleo: `node --test`; tela: Playwright em `tests/e2e/`).

## Global Constraints
- Vanilla JS sem build. Datas `AAAA-MM-DD` locais (`hojeLocal()`); comparar valores em centavos (`Math.round(v*100)`); valores digitados via `_valorDigitadoBaixa`.
- Textos de tela em português simples. Mensagens novas citadas neste plano usam o texto exato daqui.
- Não mudar comportamento fora do item. Cada item corrigido: marcar `[x]` no `pendencias-financeiro.md` com uma frase curta do que foi feito (ou "mantido de propósito: …").
- Se mudar `js`/`css`, subir o `?v=` de todos os `js`/`css` em todas as páginas para `20261122a` (só uma vez na branch — Task 1 faz; as outras não mexem).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Testes: `npm test` (núcleos) e Playwright conforme `tests/e2e/` (servidor `RAIZ=<repo> PORTA=<porta> node tests/e2e/servidor.js`; rodar a partir de `C:\Users\Asus\AppData\Local\Temp\sctech-e2e` com `BASE=http://localhost:<porta> NODE_PATH=$PWD/node_modules TESTDIR=<repo>/tests/e2e npx playwright test -c repo.config.js <filtro>`). Use uma porta própria e pare o servidor que você ligou.

## Decisões do dono (2026-11-14)
- **D1 Excluir conta com movimentos:** impedir; oferecer "Desativar". Conta desativada sai dos saldos de hoje (Hoje), do Extrato de saldos atuais e da previsão; o histórico (movimentos) continua visível no Extrato. Conta sem movimentos: excluir com confirmação.
- **D2 Data futura:** não permitir em baixa de recebimento/pagamento e em transferência entre contas. Mensagem: "A data não pode ser depois de hoje."
- **D3 Excluir pedido de compra com contas a pagar:** se alguma conta dele já foi paga, impedir ("Este pedido tem conta paga. Estorne o pagamento antes de excluir."); se todas em aberto, confirmar ("Excluir o pedido #N e as N contas a pagar dele?") e excluir juntos.
- **D4 Despesa fixa antiga sem data de início:** vale a partir do mês do cadastro (o `id` é `Date.now()` do cadastro).

## Minhas decisões (rulings)
- R1 Reaprovação com valor pago maior que o novo valor: avisar "O cliente já pagou R$ X, mais que o novo valor do pedido (R$ Y). Devolva R$ Z ou ajuste o pedido." Não gera conta.
- R2 Excluir parcela em aberto que tem partes pagas: impedir ("Esta parcela tem partes pagas. Estorne as partes antes de excluir.").
- R3 Conta a pagar já paga: não pode ser excluída (estornar antes); a remoção do movimento da conta a pagar vira função própria.
- R4 Parcelas (simulador e A Pagar): dia que não existe no mês vira o último dia do mês (31 → 28/02), nos dois.
- R5 Itens que descrevem comportamento de propósito (imposto por referência ≠ caixa; imposto parcelado mantém o deslocamento; imposto no último dia do gráfico): manter e explicar em FUNCIONALIDADES; marcar "mantido de propósito".

## Tarefas

### Task 1: Cópia de segurança, importação e espaço
Itens (Fase 0): importar backup com navegador quase cheio (limpar chaves antes / proteger gravações); `_migrarFinanceiroPedidos` cria ids sem checar os usados; recarregar 300 ms depois do download (esperar o download começar de verdade ou dar 1500 ms + botão "Recarregar agora"); "Baixar cópia" parcial — aviso claro "Esta cópia é parcial: serve para consulta, não para Importar."; falta de espaço fora da migração — `syncDB` captura `QuotaExceededError` e mostra "Não foi possível salvar: o espaço do navegador acabou. Baixe uma cópia de segurança e libere espaço." sem quebrar a tela. Também: subir o `?v=` (ver Global Constraints).

### Task 2: Pedido, comissão e pedido de compra
Itens (Fase 0): valor digitado zerado no "Confirmar pagamento" (pedido com `financeiro_gerado`, sem parcelas, com `valor_recebido` digitado); reaprovação com pago > novo valor (R1); `pedido_cancelado` fica marcado na comissão paga ao reaprovar e chegar de novo em Instalado (limpar); `comissao_rt` antiga pendente aparece para pagar em Vendedores; excluir pedido de compra (D3); vincular nota a conta existente atualiza o `tipo_lancamento`.

### Task 3: Contas, movimentos e datas
Itens (Fase 1): remover conta deixa órfãos + excluir conta sem confirmação (D1); contas inativas nos saldos (D1); mês antes da abertura da conta mostra saldo inicial no Extrato (mostrar 0 e "Conta aberta em dd/mm/aaaa"); transferência com data futura (D2) e destino padrão `contas[1]` (destino padrão vazio, obrigatório escolher, diferente da origem); data futura na baixa (D2, item da Fase 0 em "Telas e textos" — resolver aqui); data vazia vira hoje / `baixarContasReceber` sem validação própria (validar data e valor dentro da função); conta sem `data_vencimento` cai em "hoje" sem aviso (mostrar "sem vencimento" e não contar como atrasada); item com valor 0 marca "inclui atrasados" (ignorar valor 0); excluir parcela em aberto com partes pagas (R2); conta a pagar paga sem movimento pode ser excluída (R3); recebimento com data futura sem movimento (ligado a D2: com D2 não nasce mais; os antigos continuam contando em "Até hoje" quando a data chegar — conferir e testar).

### Task 4: Cartão e meios de pagamento
Itens (Fase 1): baixa com cartão em conta que não aceita movimento não gera a taxa (gerar a taxa mesmo assim, sem movimento, ou avisar e não deixar a baixa sem conta — escolha a que mantém a despesa de taxa no gráfico); `repassesCartao` força número, aceita "1,5" e "1.250,50"/"1,250.50" corretamente; `dividirParcela` compara em centavos; entrada vazia: visibilidade do saldo e salvar usam a mesma regra (a do plano); meio apagado reabre como "a definir" e entrada 0% não mostra o meio da entrada; padrões do cartão num lugar só (CaixaCore); "Cartão que cai hoje" mostra o líquido (rótulo "líquido"); no cadastro de meios, meio de cartão só aponta para conta do tipo maquininha.

### Task 5: Cobrança
Itens (Fase 1): telefone com zero de tronco (ex.: "041 9999-0000" → 554199990000); cobrança casa pelo `clienteId` antes do nome (homônimo); "Cobrado hoje" só marca se o WhatsApp abriu (`window.open` não devolveu `null`); se bloqueado, avisar "O navegador bloqueou a janela do WhatsApp. Libere os pop-ups e tente de novo.".

### Task 6: Visão Geral, Resultado, fechamento e simulador
Itens: Visão Geral (gráfico de fluxo e "Recebido") usa datas de repasse e valor líquido como Hoje/Extrato (Fase 1); recebimento antigo sem movimento — Extrato mostra a linha "N recebimentos antigos sem conta (R$ X) não aparecem aqui" (Fase 2); período parcial na Visão Geral — mostrar a nota "O imposto entra só nos meses inteiros do período" quando o período corta um mês (Fase 2); "Este mês" e Saldo Previsto com janelas iguais (a receber/a pagar até o fim do mês quando o período é "Este mês") (Fase 2); histórico de 12 meses da margem não recalcula a cada render (guardar por chave de dados) (Fase 2); despesas fixas antigas (D4) e despesa fixa antiga + mesma conta avulsa no mesmo mês contando duas vezes (contar uma vez: se há conta a pagar no mês vinda da fixa ou com mesma descrição e valor, não somar a fixa) (Fase 2); previsto até o fim do mês: tirar a taxa dos repasses de cartão a cair e não contar transferências futuras no faturamento previsto (Fase 2, revisão final); R5 (três itens de imposto: manter e documentar); alta de grupo exclui o Imposto (Fase 3); conta sem data de saldo inicial entra na conferência do fechamento (usa o saldo inicial desde sempre) (Fase 3); parcelas do simulador e do A Pagar com a mesma regra R4 (Fase 3).

### Task 7: Documentação
Atualizar `FUNCIONALIDADES_SCTECH.txt` com tudo o que mudou nas Tasks 1–6 (inclui os 2 itens de documentação da Fase 1: 10.20 diz que a aba Hoje exige a permissão Hoje; 10.18 cita o "a cair" por conta) e conferir que todos os itens de "Dados e dinheiro"/"Cópia de segurança" estão marcados no `pendencias-financeiro.md`.
