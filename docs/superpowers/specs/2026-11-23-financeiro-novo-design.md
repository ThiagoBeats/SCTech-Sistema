# Financeiro novo (4 áreas) — design

**Data:** 2026-11-23 · **Fonte:** `Projeto_Financeiro_SC_Tech.pdf` (documento de alinhamento enviado pelo dono, nov/2026; cópia em `docs/superpowers/specs/2026-11-23-financeiro-novo-referencia.pdf` — as simulações das págs. 6–8 são a referência de layout) · **Base:** `main` (Financeiro Fases 0–3, pendências, WhatsApp PR #20).

## 1. Intenção e porquê
O dono quer o Financeiro **mais simples**: hoje são 9 abas (Hoje, Visão Geral, Resultado do mês, Simular compra, A Receber, A Pagar, Despesas Fixas, DRE por Pedido, Extrato) e informação repetida. O PDF define **4 áreas** — **Resumo, Lançamentos, Fluxo de caixa, DRE** — com a DRE da empresa inteira (estrutura fixa + categorias próprias, caixa/competência, análise vertical e horizontal), integração bancária e notas fiscais vinculadas ao pedido. Público: o dono e quem cuida do financeiro numa empresa pequena de cortinas; tudo em português simples.

**Plano de servidor (dono, 2026-11-23):** cada cliente terá futuramente um **servidor Node.js** próprio rodando o sistema. Open Finance e emissão de nota exigem servidor (chave secreta do provedor, retorno do banco/prefeitura) — então agora entram em **modo manual**, com a estrutura pronta para trocar para o servidor sem mudar telas nem dados.

## 2. Objetivos, não-objetivos, anti-objetivos
**Objetivos**
- Financeiro com exatamente 4 abas: Resumo, Lançamentos, Fluxo de caixa, DRE (layout das simulações do PDF, págs. 6–8, dentro da identidade visual atual).
- DRE padrão de 8 linhas com grupos fixos e categorias editáveis; caixa e competência; AV% e AH%; PDF, Excel e impressão; clique na categoria mostra os lançamentos.
- Lançamentos únicos (A pagar | A receber) com competência, parcelas, recorrência, cancelamento, baixa com data efetiva, vínculo com pedido, cliente e fornecedor pelo cadastro, histórico.
- Fluxo de caixa realizado e previsto, por dia/semana/mês, com importação de extrato (OFX) e conciliação.
- Notas fiscais ligadas ao pedido, modo manual agora (anexar XML/PDF emitidos fora), com a "ponte" pronta para o servidor.

**Não-objetivos (agora)**
- Conexão Open Finance real e emissão real de NF-e/NFS-e (dependem do servidor e do provedor — fase futura).
- Depreciação de ativos, plano de contas contábil, SPED, integração com contador.
- Mudar pedidos, compras, comissões, estoque, Produção (só os pontos de integração listados abaixo).

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Perder ou alterar sem querer qualquer dado financeiro existente (contas, baixas, saldos, fechamentos).
- Transferência entre contas próprias, aporte, entrada de empréstimo ou amortização aparecendo como receita/despesa.
- Lançamento duplicado entre pedido, financeiro e extrato importado.
- Prometer saldo "em tempo real" ou dizer que a conta está "conectada" quando é manual.
- AH% mostrando aumento de custo como coisa boa, ou percentual sem base anterior.

## 3. Restrições
- Vanilla HTML/JS sem build, dados no `localStorage` (mesmo `db`/`syncDB`/`_gravarChaves` de hoje), núcleos puros UMD testados com `node --test`, e2e Playwright (relógio fixo, rede simulada).
- Chart.js local (`js/vendor`); Excel via SheetJS já usado (`_CDN_SHEETJS`, app.js ~10336); PDF/impressão pelo padrão de janela de impressão já usado nos documentos (`.doc-claro`).
- Tema claro e escuro; celular (sem rolagem horizontal da página — tabelas largas rolam dentro do próprio quadro).
- Permissões por aba continuam (`FIN_TAB_MODULO`, `temAcesso`).

## 4. Abordagens consideradas
1. **Aproveitar os dados atuais e completar o que falta (escolhida pelo dono).** `sc_cr`, `sc_cp`, `sc_mov_fin`, `sc_contas_fin`, `sc_df` continuam; ganham campos novos com migração; telas novas leem deles. Pedidos, compras, comissões, cobrança e fechamentos antigos seguem funcionando.
2. Base nova única de "lançamentos" com migração total — mais limpa, mas mexe em todo gerador de conta (pedido, compra, comissão, fixa, cobrança, fechamento); risco alto. Descartada.
- Telas fora do PDF: **opção B do dono** — saem da tela, mas ficam **desativadas no código** (não apagadas) para religar no futuro.

## 5. O que sai da tela (desativado, não apagado)
Hoje, Visão Geral, Resultado do mês (meta, ponto de equilíbrio, orçamento por grupo, imposto estimado), Fechamento do mês, Simular compra, DRE por Pedido, Extrato separado.
- Um objeto de configuração no código, `FIN_RECURSOS_ANTIGOS = { hoje:false, visaoGeral:false, resultado:false, fechamento:false, simulador:false, drePedido:false, extrato:false }` (minha decisão: no código, não na tela de configurações — ninguém liga sem querer). Com `false`, a aba, os botões e os cartões dessas funções não aparecem e seus alertas não são coletados (meta e tendência). O código, os núcleos (`resultado-core`, `fechamento-core`, `simulador-core`) e os testes deles continuam.
- **Despesas Fixas** não some: vira **Recorrências** dentro de Lançamentos (mesmos dados `sc_df`).
- Atalhos de outras telas que apontavam para abas desativadas (ex.: aviso na tela inicial, sino) passam a apontar para a área nova equivalente (vencimentos → Lançamentos; falta de caixa → Fluxo de caixa).
- Dados de fechamento (`sc_fin_fech`) e movimentos `origem:'ajuste'` continuam valendo para saldos.

## 6. Modelo de dados (o que muda)
### 6.1 Categorias da DRE — novo `sc_fin_cat`
- **Grupos fixos (não editáveis, não apagáveis):** `receitas` (1 Receitas operacionais), `custos` (2 Custos operacionais), `despesas` (4 Despesas operacionais), `investimento` (6 Atividades de investimento), `financiamento` (7 Atividades de financiamento). Linhas calculadas (não têm categorias): 3 Margem de contribuição = 1 − 2; 5 Resultado operacional = 3 − 4; 8 Resultado líquido = 5 − 6 − 7 (6 e 7 com sinal: saída reduz, entrada de juros/rendimento soma).
- **Subgrupos** (editáveis, só dentro de `despesas`, `custos` e `receitas`): iniciais em Despesas operacionais = "Despesas variáveis", "Despesas fixas", "Outras despesas".
- **Categoria:** `{ id, nome, grupo, subgrupo_id|null, tipo: 'entrada'|'saida', natureza: 'dre'|'so_caixa', padrao: bool, ativo: bool }`. `natureza:'so_caixa'` = movimenta o caixa mas **nunca** entra na DRE (aporte de capital, entrada de empréstimo, amortização do principal). Categoria padrão pode ser renomeada e desativada, não apagada; categoria com lançamentos não é apagada (só desativada).
- **Categorias iniciais** e de onde vêm os códigos de hoje (minha decisão; o dono pode mover depois):
  - Receitas: "Vendas de pedidos" (todo A Receber gerado por pedido), "Outras receitas operacionais".
  - Custos: "Tecido / Material" (`tecido`), "Costureira" (`costureira`), "Instalador" (`instalador`).
  - Despesas › variáveis: "Comissões" (`comissao`, `comissao_rt`), "Taxas de cartão" (`taxa_cartao`), "Impostos sobre vendas" (`imposto`).
  - Despesas › fixas: "Aluguel" (`aluguel`), "Salários" (`salario`), "Contas (luz, internet…)" (`conta`).
  - Despesas › outras: "Outras despesas" (`outro`).
  - Investimento: "Compra de equipamentos e veículos" (saída).
  - Financiamento: "Juros e encargos" (saída), "Rendimentos financeiros" (entrada).
  - Só caixa: "Aporte de capital" (entrada), "Empréstimo recebido" (entrada), "Pagamento de empréstimo (principal)" (saída).
- Lançamento sem `categoria_id` (dado antigo não reconhecido) cai em "Outras despesas"/"Outras receitas operacionais" e aparece no filtro "Sem categoria revisada" (minha decisão).
- **Investimento:** entra com o valor cheio na linha 6, abaixo do Resultado operacional — não vira despesa operacional; depreciação fica fora (não-objetivo).

### 6.2 Lançamentos (`sc_cr` e `sc_cp`) — campos novos
- `data_competencia` (AAAA-MM-DD). Padrões: A Receber de pedido = `pedido.data_aprovacao` (campo novo no pedido, gravado na 1ª vez que o financeiro do pedido é gerado e **nunca** mudado depois; quando o pedido é editado e as contas são refeitas, as novas herdam essa data — a receita não muda de mês), igual para todas as parcelas; A Pagar de pedido de compra = data do pedido de compra; recorrência = 1º dia do mês da ocorrência; imposto = 1º dia de `mes_referencia`; manual = campo no formulário, padrão = vencimento.
- `categoria_id` (→ `sc_fin_cat`), `cliente_id` (A Receber), `fornecedor_id` (A Pagar), `conta_id` prevista (opcional; a da baixa continua no movimento).
- `status`: continua `Pendente`/`Atrasado`/`Pago` + novo **`Cancelado`** (`cancelado_em`, `cancelado_por`, `motivo_cancelamento`). Na tela: "Em aberto", "Vencido", "Pago"/"Recebido", "Cancelado". Pago não cancela: precisa estornar a baixa antes. Cancelado sai de saldos previstos, avisos, DRE e Fluxo.
- `historico: [{ em: ISO, por: idUsuário, porNome, acao: 'criado'|'editado'|'baixa'|'estorno'|'cancelado'|'conciliado'|'categoria', detalhe: string }]` — gravado em toda alteração feita pelas telas novas e pelas funções de baixa/estorno existentes.
- **Excluir x Cancelar (minha decisão):** "Excluir" continua só para lançamento **manual**, em aberto, sem baixa (com confirmação; fica registro em `sc_fin_excluidos` com o lançamento e quem excluiu). Os fluxos automáticos que hoje apagam contas em aberto ao **refazer** o financeiro de um pedido editado ou a cobrança continuam apagando e recriando (contas geradas pelo sistema; a competência é preservada pela regra acima). Quando o **pedido é cancelado**, as contas em aberto dele passam a **Cancelado** (motivo "Pedido cancelado") em vez de serem apagadas. Checagens de duplicidade ignoram lançamentos cancelados.
- Parcelamento: A Pagar já tem (`lancamento_pai_id`, `numero_parcelas`, `parcela_atual`); o mesmo modelo passa a valer para A Receber manual.
- `nf_id` não vai no lançamento; a nota liga-se ao pedido (6.5).

### 6.3 Contas bancárias (`sc_contas_fin`) — campos novos
`banco` (código COMPE de uma lista dos bancos mais comuns + "Outro"), `agencia`, `numero_conta`, `tipo: 'corrente'|'poupanca'|'caixa'|'cartao'`, `conexao: 'manual'|'servidor'` (sempre `manual` agora), `saldo_atualizado_em` (última baixa, ajuste ou importação de extrato). No lugar do logotipo do banco: selo redondo com a sigla e a cor do banco (minha decisão — logotipos reais virão do provedor do Open Finance).

### 6.4 Extrato importado — novo `sc_fin_extrato`
`{ id, conta_id, fitid, data, valor (com sinal), descricao, importado_em, arquivo, situacao: 'pendente'|'conciliado'|'ignorado'|'transferencia', mov_id|null }`. `fitid` + conta evita importar a mesma linha duas vezes.

### 6.5 Notas fiscais — novo `sc_nf`
`{ id, pedido_id, tipo: 'nfe'|'nfse', numero, serie, chave|null, codigo_verificacao|null, data_emissao, valor, cliente_id, status: 'rascunho'|'processando'|'autorizada'|'rejeitada'|'cancelada', protocolo|null, eventos: [{ em, tipo, detalhe, por }], xml_nome, xml (texto), pdf_nome, pdf (dataURL) | null, origem: 'manual'|'servidor', criado_em, criado_por }`.
- **Limite de espaço:** XML e PDF ficam no `localStorage` (limite ~5 MB do navegador). PDF acima de 1 MB é recusado com aviso "Arquivo grande demais para guardar no navegador. Guarde o PDF no computador e anexe só o XML." (minha decisão; no servidor isso some).

### 6.6 Migração (uma vez, com backup automático antes)
- Roda ao abrir o sistema na versão nova, se `sc_fin_versao < 4`; antes grava cópia de `sc_cr`, `sc_cp`, `sc_df`, `sc_contas_fin`, `sc_mov_fin` em `sc_fin_backup_v3` (minha decisão; o backup do sistema também os leva).
- `categoria_id` pelo mapa de 6.1; A Receber sem categoria → "Vendas de pedidos" se tem `pedido_id`, senão "Outras receitas operacionais".
- `data_competencia`: A Receber de pedido = menor vencimento das parcelas daquele pedido; A Pagar com `mes_referencia` = 1º dia desse mês; demais = vencimento.
- `cliente_id`: pelo pedido; senão por nome exato único. `fornecedor_id`: por CNPJ; senão por nome exato único. Sem achar: fica vazio (texto antigo continua aparecendo).
- `historico`: `[{acao:'criado', detalhe:'Migrado do financeiro anterior'}]`.
- Idempotente e testada no núcleo.

## 7. Telas
### 7.1 Resumo (`financeiro.resumo`)
- **Minhas contas:** uma linha por conta ativa — selo do banco, nome, "Conta corrente · Ag 0001 · CC 12345-6", saldo, etiqueta **"Manual"**, "Atualizado em DD/MM HH:MM" (`saldo_atualizado_em`). Linha **Saldo total** (soma das contas ativas). Botão **"+ Conectar conta"**: abre o cadastro de conta manual com a nota "A conexão automática com o banco (Open Finance) chega quando o sistema rodar no servidor da empresa."
- **Indicadores** (período: Este mês [padrão], Mês passado, Trimestre, Ano, Personalizado; regime segue o da DRE, padrão Caixa): **Lucro líquido** (linha 8 da DRE), **Margem líquida** (8 ÷ 1), **Receita** (linha 1), **Ticket médio** (soma do valor dos pedidos aprovados no período ÷ quantidade — mesmo cálculo do ticket médio atual da Visão Geral). Cada um compara com o período anterior equivalente: "↑ 12%" verde / "↓ 8%" vermelho; sem base: "sem base de comparação".
- **Avisos:** "N contas vencidas · R$ X" (a pagar e a receber separados) e lista das vencidas e das que vencem nos próximos 7 dias: cliente/fornecedor, valor, vencimento, "há N dias" ou "vence em N dias"; clicar abre o lançamento. Some/atualiza ao pagar, receber, cancelar ou mudar vencimento (é calculado, não gravado). Os mesmos avisos continuam no sino (coletor `fin_*` de vencimento/atraso/falta de caixa; meta e tendência desligados) sem repetir item já visto (regra atual do sino).

### 7.2 Lançamentos (`financeiro.pagar` / `financeiro.receber`)
- Seletor no topo **Contas a pagar | Contas a receber** (cada lado obedece à permissão de hoje). Barra: busca, Status, Cliente/Fornecedor, Categoria, Conta, Período (vencimento; opção "competência"), **+ Novo lançamento**, link **Recorrências**.
- Tabela: Vencimento, Descrição, Cliente/Fornecedor, Categoria, Valor, Status (selo), Ações (⋮: Dar baixa / Estornar, Editar, Cancelar, Histórico, Abrir pedido, Cobrar no WhatsApp [a receber]). Rodapé: "Total em aberto: R$ X" do filtro. Paginação de 50.
- **Novo/editar:** descrição, valor, cliente (a receber) ou fornecedor (a pagar) do cadastro (ou nome livre), categoria (só as do tipo certo), conta prevista, competência, vencimento, observações, pedido (opcional), **Parcelar em N vezes** (intervalo mensal; valor dividido com centavos na última), **Repetir** (vira recorrência em `sc_df`) — **só em Contas a pagar** (minha decisão: recorrência de recebimento não existe hoje em cortineiro; fica para depois se pedirem).
- **Duplicidade:** antes de salvar, procura mesmo valor + mesmo cliente/fornecedor + vencimento a ±3 dias (e a regra atual de nota duplicada para A Pagar): "Já existe um lançamento parecido: … Salvar mesmo assim?".
- **Baixa:** a janela de baixa atual (conta, data efetiva, cartão/repasse) — só ganha registro no histórico e atualiza `saldo_atualizado_em`.
- **Recorrências:** lista das despesas fixas (`sc_df`) com a categoria nova; mesma geração mensal de hoje (`gerarContasPagarDoMes`).
- Integrações que continuam iguais: pedido gera A Receber, pedido de compra gera A Pagar, comissões, importação de nota de compra (XML/PDF), cobrança pelo WhatsApp — todas passam a gravar `categoria_id`, `data_competencia`, `cliente_id`/`fornecedor_id` e `historico`.

### 7.3 Fluxo de caixa (`financeiro.fluxo`)
- Filtros: Período (mês padrão), Ver por **Dia | Semana | Mês**, Conta (todas ou uma), Categoria.
- 4 cartões: **Saldo inicial**, **Entradas**, **Saídas**, **Saldo final**. Realizado = movimentos (`sc_mov_fin`); Previsto = contas em aberto (não canceladas) pelo vencimento, a partir de hoje; a tabela e o gráfico mostram os dois separados (previsto tracejado/claro).
- Gráfico de linhas (Saldo, Entradas, Saídas) e tabela "Movimentações do período" (data, descrição, conta, entrada, saída, saldo acumulado); clicar abre o lançamento de origem.
- **Transferências:** com "todas as contas" não entram em Entradas/Saídas (só aparecem na lista, marcadas "Transferência"); filtrando uma conta, contam como entrada/saída dela.
- **Importar extrato (OFX):** escolhe a conta, envia o arquivo; linhas já importadas (mesmo `fitid`) são puladas. Tela **Conciliar**: para cada linha pendente, sugestão automática = lançamento em aberto ou movimento não conciliado com mesmo sentido, mesmo valor (±R$ 0,01) e data a ±5 dias (minha decisão), melhor primeiro. Cartão (minha decisão): a sugestão também procura **repasses de cartão** pelo valor **líquido** (bruto − taxa do repasse) e, se nenhum valor único bater, a **soma dos repasses da mesma conta com a mesma data** (±1 dia) — um depósito pode juntar várias vendas; ainda sem par, a pessoa escolhe **vários** lançamentos/repasses cuja soma dê o valor. Ações: **Confirmar** (dá baixa no lançamento na data do extrato, ou liga ao movimento existente), **Escolher outro**, **Criar lançamento** (já com valor/data/descrição; passa pela checagem de duplicidade), **É transferência** (escolhe a outra conta; cria o par de movimentos), **Ignorar**. Tudo vai para o histórico. Contas com movimentos conciliados mostram "Conferido com o extrato até DD/MM".
- **Relatórios** (botão no topo): Entradas e saídas por categoria, A pagar/receber por período, Evolução mensal do saldo — PDF, Excel, imprimir.

### 7.4 DRE (`financeiro.dre`)
- Topo: **Regime: Caixa | Competência**, **Ano**, botão **Relatórios** (AV/AH), PDF, Excel, imprimir.
- Tabela: linhas 1–8 na ordem do PDF; colunas Jan…Dez + Total do ano. Cada grupo aparece uma vez com o total; ícone **+/−** expande só as categorias (e subgrupos, que também expandem); recolhido mostra só o grupo. Negativos em vermelho entre parênteses "(45.932)"; valores sem centavos na tabela, com centavos no detalhe. Linha "% margem de contribuição" (3 ÷ 1) abaixo da 3.
- **Caixa:** mesmas regras do `ResultadoCore` atual (entradas = movimentos `origem:'cr'` de cada conta recebida, ou os repasses de cartão nas suas datas quando não há movimento; saídas = contas a pagar pagas na data de pagamento), excluindo transferências, categorias `so_caixa`, **ajustes de conferência (`origem:'ajuste'`) e saldo inicial** (mexem no saldo das contas, não no resultado — minha decisão, igual ao Resultado do mês de hoje). Teste de paridade: para os mesmos dados, Receitas e total de saídas do regime Caixa batem com entradas/saídas do `ResultadoCore.resultadoDoMes` (sem o imposto estimado). **Competência:** entra pela `data_competencia` dos lançamentos não cancelados (pagos ou não).
- Clicar no valor de uma categoria num mês abre a lista dos lançamentos que formam aquele número.
- **Categorias:** botão **"Categorias"** abre o cadastro (6.1): criar, renomear, mover de subgrupo, desativar; grupos e linhas calculadas não mudam.
- **Análise vertical:** colunas valor + AV% por período; base = Receitas operacionais do período (100%); custos/despesas mostram o % positivo (como no exemplo do PDF); receita zero → "—".
- **Análise horizontal:** valor por período + AH% em relação ao período anterior; seta ↑/↓; para custos/despesas o cálculo é sobre o valor absoluto e a cor indica **favorável (verde) / desfavorável (vermelho)** — custo subindo é vermelho; anterior zero → "—" (sem base); acima de 999% → "> 999%".
- Filtros dos relatórios: Caixa/Competência; Intervalo **Mensal, Trimestral, Semestral, Anual, Personalizado** (datas de/até); mesma estrutura de grupos/categorias.

### 7.5 Notas fiscais (no pedido + consulta no financeiro)
- No **pedido** (tela do pedido aprovado): bloco **"Nota fiscal"** com o botão **"Emitir nota"**. Em modo manual abre a janela: tipo (NF-e para produto / NFS-e para serviço — padrão pelo regime e pelo que a empresa marcou em Empresa), dados conferidos e editáveis (cliente com CPF/CNPJ e endereço, itens com quantidade e valor do pedido, valor total), aviso "Emita esta nota no sistema da prefeitura/SEFAZ ou do seu contador e anexe aqui o XML e o PDF." e os campos **Anexar XML** e **Anexar PDF**. Ao anexar o XML, o sistema lê número, série, chave/código de verificação, data, valor e CNPJ/CPF do tomador (NF-e e NFS-e padrão nacional/ABRASF) e preenche; se o valor ou o cliente não bater com o pedido, avisa e deixa salvar. Status "autorizada", origem "manual".
- Depois de salva: o bloco mostra número, série, data, status, **Ver PDF**, **Baixar XML**, **Histórico**, **Cancelar nota** (em modo manual: registra o cancelamento feito fora, com motivo e, opcional, o XML do evento).
- Pedido pode ter mais de uma nota (ex.: NF-e dos produtos + NFS-e da instalação).
- **Consulta no financeiro:** em Lançamentos › Contas a receber, link **"Notas fiscais"** abre a lista (número, tipo, cliente, pedido, data, valor, status; filtros por período, status e tipo; abre o pedido).
- **Ponte fiscal** (`js/fiscal-core.js` + `js/fiscal.js`): interface `Fiscal.provedor = { nome, emitir(dadosNota) -> Promise<{status, numero, serie, chave, protocolo, xml, pdf, mensagem}>, consultar(id), cancelar(id, motivo) }`. Agora só existe `provedorManual` (que abre o fluxo de anexar). Quando houver servidor: `provedorServidor` fará `POST /api/fiscal/emitir`, `GET /api/fiscal/:id`, `POST /api/fiscal/:id/cancelar` no Node da empresa, que fala com o provedor (Focus NFe, PlugNotas ou outro — escolha futura). O núcleo puro `fiscal-core` monta `dadosNota` a partir do pedido/cliente/empresa e lê XML; os dois provedores usam o mesmo formato. Rejeições/eventos entram em `eventos`.
- **Ponte bancária** (mesma ideia): `Banco.provedor = { nome, contas(), saldos(), movimentos(desde) }`; agora `provedorManual` (cadastro + OFX); depois `provedorServidor` (`/api/banco/...`).

## 8. Permissões
- Abas novas: `financeiro.resumo`, `financeiro.pagar`, `financeiro.receber` (as duas metades de Lançamentos), `financeiro.fluxo`, `financeiro.dre`. Migração das permissões dos papéis/usuários: `resumo` ← `dashboard` ou `hoje`; `fluxo` ← `extrato`; `dre` ← `dre` ou `resultado`; `pagar`/`receber` iguais; `fixas` passa a valer para Recorrências. Emitir/anexar nota: quem tem `financeiro.receber` completo **ou** pode editar o pedido (minha decisão).

## 9. Entregas (ordem)
1. **Estrutura:** 4 abas, desativação (seção 5), `sc_fin_cat` + migração (6.1, 6.2, 6.3, 6.6), Lançamentos completo (7.2), Resumo (7.1), permissões (8).
2. **DRE e relatórios** (7.4).
3. **Fluxo de caixa**, extrato OFX e conciliação (7.3, 6.4).
4. **Notas fiscais** manuais + ponte fiscal e bancária (7.5, 6.5).
Cada entrega vai para o GitHub em separado, com e2e completo verde.

## 10. Deixado para o construtor
Nomes de funções/ids, divisão em arquivos (`js/fin-*.js` + núcleos `js/dre-core.js`, `js/fluxo-core.js`, `js/conciliacao-core.js`, `js/fiscal-core.js` sugeridos), leitura de OFX (SGML e XML), layout responsivo exato, cores dentro dos tokens existentes, textos de ajuda curtos, testes (núcleo para DRE/AV/AH/competência/migração/conciliação/leitura de XML; e2e por tela).
