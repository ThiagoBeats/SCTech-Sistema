# Layout dos documentos — design

Data: 09/11/2026 · Status: aprovado na conversa, aguardando revisão do documento

## Por quê

Os documentos impressos/PDF que o SCTech gera hoje têm o visual fixo do SCTech
(verde #005D3B, fonte do sistema, arrumação definida no código). Quem recebe uma
proposta deveria reconhecer a **cortinaria** que a emitiu, não o sistema. O DNA da
marca, nas palavras do usuário, é: **cores, logo no fundo dos documentos e
tipografia dos textos**.

## O que é

Uma nova seção **"Layout dos documentos"** na página Configurar Empresa
(`empresa.html`), onde o dono da cortinaria personaliza, **documento por
documento**, o visual e a arrumação dos PDFs.

### Documentos incluídos (todos os cinco)

| Documento | Gerador atual (js/app.js) | Público |
|---|---|---|
| Proposta Comercial | `gerarHTMLProposta(pedidoId, dias)` | cliente |
| Ordem de Serviço | `gerarHTMLOS(pedidoId)` | interno |
| Pedido de Compra | `gerarHTMLPedidoCompra(id)` (+ `_pcEspecificacoesHTML`) | fornecedor |
| Agendamento de Medição | `imprimirAgendamentoMedicao(id)` | cliente / medidor |
| Relatório Financeiro | `gerarRelatorioFinanceiro()` | interno |

As etiquetas ficam de fora (já têm editor próprio).

## Tela de edição (decidido: "painel ao lado")

- **Barra do topo:** seletor do documento · botão **Copiar estilo de…** (escolhe
  outro dos cinco) · botão **Voltar ao padrão** · botão **Salvar**.
- **Coluna esquerda:** painel com todas as opções, agrupadas em Identidade
  (cores, fonte, logo no fundo), Blocos e Textos.
- **Direita:** folha A4 que atualiza na hora a cada mudança.
- *Decisão do Claude:* a folha mostra o **registro real mais recente** daquele
  tipo (último pedido, último pedido de compra, última medição, período atual do
  financeiro); se não houver nenhum, mostra um **exemplo embutido**.
- *Decisão do Claude:* trocar de documento ou sair da página com alterações não
  salvas pede confirmação.

## O que dá para personalizar (cada documento separadamente)

### Identidade
- **Cores:** principal (títulos, linhas, cabeçalhos de tabela), destaque
  (detalhes/linhas finas) e fundo das caixas. Seletor livre + *(decisão do
  Claude)* 4–6 paletas prontas, sendo a primeira o visual atual do SCTech.
- **Fonte:** lista curta (*decisão do Claude*: "Padrão do sistema" = a atual,
  mais algumas serifadas e sem serifa — ex.: Arial, Georgia, Lora, Montserrat,
  Playfair Display). Fontes web carregam do Google Fonts sob demanda, com
  fallback genérico (serif / sans-serif) se estiver offline.
- **Logo no fundo (marca d'água):** liga/desliga, tamanho (P/M/G) e
  transparência (faixa ~3%–20%). Usa a logo já cadastrada (`sc_empresa.logo_base64`);
  sem logo cadastrada a opção fica desabilitada com aviso. Deve aparecer em
  **todas as páginas** impressas.

### Blocos
Cada documento é dividido em blocos. Para cada bloco o usuário pode:
- escolher a **posição/arrumação** entre variantes prontas (sem arraste livre);
- **mostrar/esconder**;
- *(decisão do Claude)* **subir/descer** na ordem.

Blocos por documento (a partir do conteúdo atual):
- **Proposta:** cabeçalho, cliente, ambientes, observações, totais, condições
  gerais, aprovação/assinatura.
- **OS:** cabeçalho (com aviso "sem valor comercial"), cliente, ambientes,
  materiais, observações, assinaturas.
- **Pedido de Compra:** cabeçalho, cliente de origem, fornecedor, itens,
  especificações, observações, assinaturas.
- **Agendamento de Medição:** cabeçalho, cliente, agendamento, assinatura, rodapé.
- **Relatório Financeiro:** cabeçalho, indicadores, gráficos, próximos
  recebimentos, próximos pagamentos, rodapé.

Variantes mínimas (*decisão do Claude*; o builder pode refinar):
- **Cabeçalho:** logo à esquerda / logo centralizada / logo à direita.
- **Dados de pessoa (cliente, fornecedor, agendamento):** 1 coluna / 2 colunas / faixa compacta.
- **Totais:** alinhado à direita / largura total.
- **Assinaturas:** lado a lado / empilhadas.
- **Blocos de texto:** simples / caixa com fundo / linha lateral de destaque.
- Tabelas (ambientes, itens, materiais…) não têm variantes; seguem as cores e a fonte.

Blocos de dados vazios continuam se comportando como hoje (ex.: observações só
aparecem se houver observação; especificações só em compra ligada a pedido).

### Blocos próprios
O usuário pode **acrescentar blocos de texto** com título e corpo (ex.: "Sobre
nós", "Cuidados com o tecido", "Assinatura do cliente"), posicioná-los na ordem,
escolher a variante de texto e removê-los.

### Textos fixos com dados encaixados
- São editáveis: o título do documento (ex.: "PROPOSTA COMERCIAL"), o título de
  cada bloco, o corpo dos blocos de texto (condições gerais, aviso da OS,
  rodapé, legendas das assinaturas) e os blocos próprios.
- Botão **"Inserir dado"** ao lado de cada texto abre a lista de campos
  disponíveis **daquele documento** e insere o marcador no cursor, ex.
  `{cliente}`, `{validade}`, `{total}`. O usuário nunca precisa decorar nomes.
- Na geração, cada marcador é trocado pelo valor; campo sem valor vira vazio;
  marcador desconhecido fica como está (para o usuário perceber o erro na prévia).
- Valores inseridos são escapados (HTML) — o texto do usuário também.
- Compatibilidade: `{diasValidade}` continua funcionando, e as Condições Gerais
  hoje salvas em `sc_cond_gerais` passam a ser o texto inicial do bloco
  "Condições gerais" da proposta (o card atual de Condições Gerais na página
  pode ser removido ou passar a apontar para o editor — *decisão do builder*,
  sem perder o texto já salvo).

Campos por documento (mínimo; o builder completa com o que já existe no registro):
- **Proposta:** cliente, telefone/e-mail/endereço do cliente, número, data de
  emissão, validade, diasValidade, total, previsão de entrega, vendedor, forma de
  pagamento.
- **OS:** cliente, número, emissão, previsão de entrega, status.
- **Pedido de Compra:** fornecedor, número, emissão, total, cliente de origem,
  pedido de venda.
- **Agendamento:** cliente, telefone, data da visita, horário, responsável,
  endereço da visita.
- **Relatório:** período, data de geração.
- **Comuns a todos:** nome da empresa, telefone, e-mail, site, endereço, CNPJ.

### Copiar e voltar ao padrão
- **Copiar estilo de…** copia a identidade (cores, fonte, marca d'água) e a
  variante do cabeçalho do documento escolhido. Não copia blocos nem textos,
  porque cada documento tem blocos diferentes (*decisão do Claude*).
- **Voltar ao padrão** restaura aquele documento ao visual atual do sistema
  (com confirmação).

## Regras que não podem quebrar

- **O padrão é o visual de hoje.** Sem nenhuma personalização salva, os cinco
  documentos saem visualmente equivalentes ao que saem hoje. Os testes atuais
  (unitários e e2e) continuam passando.
- Assinatura digital nos documentos (canvas `buildAssinaturaHTML` /
  `iniciarAssinaturaPads`), código de barras do documento
  (`htmlCodigoDocumento` / `preencherCodigosDocumento`), desenho da cortina na
  proposta e o modo escuro do modal seguem funcionando.
- A impressão continua pelo fluxo atual (`abrirDocModal` → `imprimirDocModal` →
  `window.print()`, e as páginas `proposta.html`, `os.html`,
  `pedido-compra.html`).
- Configuração inválida ou corrompida no armazenamento cai no padrão, nunca
  quebra o documento.

## Fora do escopo (não-objetivos)

- Arrastar blocos livremente na folha.
- Editor das etiquetas (já existe).
- Upload de fontes próprias, imagens extras além da logo, múltiplas páginas
  configuráveis, cabeçalho/rodapé diferentes por página.
- Sincronização em nuvem além do que o sistema já faz para `localStorage`.

## Armazenamento

`localStorage['sc_doc_layouts']` com um objeto versionado, uma entrada por
documento contendo só o que difere do padrão (ou o objeto completo — decisão do
builder), lido com fusão sobre o padrão para tolerar campos novos no futuro.

## Arquitetura sugerida (o builder pode ajustar)

Seguir o padrão já usado pelas etiquetas:
- `js/docs-layout-core.js` — funções puras (sem DOM/db/localStorage) testáveis
  com `node --test`: padrões de cada documento, fusão config × padrão, cópia de
  estilo, troca de marcadores, montagem do CSS do tema e da ordem dos blocos.
- Os geradores em `js/app.js` passam a montar cada documento a partir de
  funções de bloco + configuração, em vez de um HTML único.
- `js/docs-layout-editor.js` — a tela do editor em `empresa.html`.
- Todos os `.html` que carregam `app.js` passam a carregar o core antes dele;
  o `?v=` de cache precisa ser trocado em **todos** os html juntos.
- Testes: unitários do core + e2e do editor (trocar cor/fonte/variante/texto
  muda a prévia e o documento impresso; copiar estilo; voltar ao padrão;
  esconder bloco; bloco próprio; marcador inserido aparece preenchido).

## Decisões tomadas após a revisão (decisões do Claude)

1. **Padrão equivalente:** "visualmente equivalente", não byte a byte. Classes e
   seletores usados hoje pelos testes e pelo CSS (`proposta-header`, `os-header`,
   `pc-header`, `os-amb-card`, `pc-table`, etc.) são mantidos.
2. **Blocos obrigatórios:** o **cabeçalho** fica sempre no topo e não pode ser
   escondido nem movido (só troca de variante); o código/barras do documento
   (`htmlCodigoDocumento`) fica sempre dentro do cabeçalho. Todos os outros
   blocos, inclusive os de assinatura, podem ser escondidos e reordenados; a
   assinatura digital continua funcionando onde o bloco estiver.
3. **Prévia = impressão:** a prévia chama os mesmos geradores reais, com a
   configuração em edição passada como parâmetro, dentro de um contêiner com o
   CSS do documento isolado para não vazar para a página do editor.
4. **Exemplo embutido:** um registro fictício completo por documento (inclusive
   ambientes com desenho de cortina) é aceitável. No Relatório Financeiro a
   prévia usa o período atualmente selecionado no financeiro (ou o mês atual),
   e os gráficos aparecem como áreas reservadas quando não houver canvas.
5. **Condições Gerais:** migração única — se existir `sc_cond_gerais` e ainda
   não houver layout salvo da proposta, o texto vira o corpo do bloco
   "Condições gerais". Depois disso a fonte é só o editor de layout; o card
   antigo de Condições Gerais sai da página e no lugar fica um aviso apontando
   para o editor.
6. **Marca d'água em todas as páginas:** o alvo é o Chrome/Edge (o mesmo
   navegador em que o sistema já imprime). Na tela aparece uma vez por folha.
7. **Sincronização:** a chave `sc_doc_layouts` segue o mesmo tratamento das
   outras configurações da empresa (`sc_empresa`, `sc_etiqueta_cfg`); não é
   preciso registrá-la em nenhum mecanismo novo.

## O que fica a critério do builder

Nomes internos, formato exato do JSON salvo, lista final de fontes e paletas,
desenho visual do painel (seguindo o estilo atual de `empresa.html`), e quais
legendas menores viram texto editável além das listadas.
