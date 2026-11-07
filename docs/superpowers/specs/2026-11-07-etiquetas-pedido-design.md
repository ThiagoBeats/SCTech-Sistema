# Etiquetas de pedido, volumes e conferência de expedição — design

Data: 2026-11-07
Status: aprovado no brainstorming, pronto para o plano de implementação

## Problema

Quando o pedido fica pronto, o cortineiro embala tudo em um ou mais pacotes. Hoje
os pacotes não têm identificação rastreável. Na expedição, o conferente recebe o
pedido impresso e não tem um jeito confiável de confirmar três coisas: se o pacote
é daquele pedido, se todos os volumes estão lá e se o pedido existe no sistema.

A solução tem três partes:

1. **Etiqueta adesiva** impressa em impressora térmica, uma por volume, com código
   de barras e/ou QR Code. O layout é montado pelo próprio usuário.
2. **Código fixo nos documentos** (pedido impresso e OS), para o conferente
   comparar documento × pacote.
3. **Tela de Expedição**, onde o conferente bipa com um scanner e o sistema
   confere, alerta e registra.

## Objetivos

- O usuário monta o layout da etiqueta sozinho, de forma simples, num editor
  **drag and drop livre** em Configurar Empresa.
- Pode haver um ou mais volumes por pedido. O usuário escolhe a quantidade de
  volumes na hora de imprimir.
- A conferência na expedição é rápida, feita com scanner USB (que funciona como teclado).
- Fica registrado quem conferiu, quando conferiu e quantos volumes.
- Funciona com qualquer impressora térmica que tenha driver instalado no Windows.

## Não-objetivos (v1)

- Etiquetas de tecido (rolos/lotes) e de itens/materiais. Ficam para depois, mas o
  modelo de dados e o editor já devem nascer genéricos (ver "Preparar o futuro").
- Comandos nativos de impressora (ZPL/EPL/PPLA) e agente local de impressão.
- Leitura pela câmera do celular. QR com link para abrir o pedido fica para quando
  o sistema rodar no servidor central.
- Mais de um modelo de etiqueta de pedido por empresa.
- Impressão em lote de vários pedidos de uma vez.

## Anti-objetivos (seria um fracasso mesmo funcionando)

- Um editor tão complexo que o cortineiro não consegue montar a etiqueta sem ajuda.
- Um código que o scanner não lê de forma confiável na etiqueta impressa.
- Mudar o status do pedido por causa da conferência. **O status não muda.**
- Adicionar dependências npm ou etapa de build ao projeto.

## Contexto técnico (estado atual)

- Site estático em HTML + JS puro, sem build. A lógica fica em `js/app.js` e os
  dados ficam no `localStorage` (objeto `db`, chaves `sc_*`). Isso é temporário:
  o plano é migrar para um banco local num servidor da empresa, acessível pela
  rede. **Não fazer nada que dependa de os dados estarem em um único navegador**
  além do que o resto do sistema já faz.
- O número do pedido (`pedido.id`, ex.: `26001`) é único e legível
  (`gerarNumeroPedido`, `js/app.js:263`).
- Impressões existentes usam HTML + `window.print()`: OS em `os.html`
  (`gerarHTMLOS`) e proposta em `proposta.html` (`gerarHTMLProposta`).
- Configuração da empresa: `empresa.html`, organizada em cards, com cada
  configuração em uma chave própria (`sc_empresa`, `sc_alertas_cfg`, …).
- Bibliotecas externas entram via CDN jsdelivr, carregadas sob demanda.
- Kanban de status: `renderKanban()` (`js/app.js:5940`).
- Linha do tempo do pedido: `pedido.timeline[]` com `{status, data, label}`.
- Permissões: `MODULOS_PERMISSAO` (`js/app.js:6`) + `exigirPermissao(...)`.
- Cliente: `db.clientes` com `{id, nome, tel, email, cpf, end}`. O pedido guarda
  `clienteId`/`clienteNome`. Endereço e telefone vêm do cliente.

## Decisões tomadas no brainstorming

### 1. Conteúdo dos códigos

- **Documento** (pedido impresso e OS): o código contém só o número do pedido,
  ex.: `26001`.
- **Etiqueta de volume**: pedido + volume + total, ex.: `26001-2-3` (volume 2 de 3).
  O texto legível impresso na etiqueta pode mostrar "Volume 2/3".
- O conteúdo usa **só dígitos e hífen** de propósito. Scanners USB emulam teclado
  e, com o teclado do Windows em ABNT2 e o scanner configurado em layout US,
  caracteres como `/` saem trocados. Dígitos e `-` saem iguais nos dois layouts.
  *(decisão minha)*
- Simbologias: **Code128** para barras e **QR Code** para o 2D. Barras e QR
  carregam o mesmo conteúdo.
- O código não contém URL.

### 2. Editor de etiquetas — drag and drop livre

Um card novo, "Etiquetas", em `empresa.html`.

- **Esquerda: paleta de elementos.** Arraste cada um para a etiqueta:
  - Campos do pedido: Nº do pedido, Cliente, Endereço, Telefone, Data de entrega,
    Vendedor, Status, Qtd. de ambientes/itens, Observações, **Volume** ("2/3").
  - Elementos fixos: Logo da empresa, Texto livre, Linha divisória,
    **Código de barras**, **QR Code**.
  - Pode usar barras, QR ou os dois. Cada um é só mais um elemento.
- **Centro: a etiqueta** em escala proporcional ao tamanho real, com grade de
  alinhamento (snap de 1 mm *(decisão minha)*). Cada elemento pode ser movido e
  redimensionado, e o selecionado fica destacado.
- **Direita: propriedades do elemento selecionado.** Para texto: tamanho da
  fonte, negrito e alinhamento. Para todos: posição e tamanho em mm. Para texto
  livre: o conteúdo. Botão para remover.
- **Formato da etiqueta:** presets de 100×50, 100×100, 100×150, 60×40 e 50×30 mm,
  mais **tamanho personalizado** (largura × altura em mm).
- **Modelo pronto:** na primeira vez, o editor já vem com um layout padrão
  montado (nº do pedido em destaque, cliente, endereço, data de entrega, volume,
  código de barras e QR). O usuário só ajusta.
- **Imprimir teste:** imprime a etiqueta com os dados de um pedido de exemplo.
- **Aviso de legibilidade:** o editor alerta quando o código de barras ou o QR
  ficar pequeno demais para leitura confiável. Os limites ficam a cargo de quem
  implementar, com referência de impressora de 203 dpi (por exemplo, módulo de
  barras abaixo de ~0,25 mm, ou QR abaixo de ~15 mm).
- **Texto que não cabe** é cortado com "…" e nunca ultrapassa a caixa do
  elemento nem a borda da etiqueta.
- Ao trocar de formato, os elementos que ficarem fora da área são trazidos para
  dentro ou sinalizados. *(decisão minha)*

### 3. Volumes e impressão

- No pedido, a ação **"Imprimir etiquetas"** pergunta a **quantidade de volumes**
  e imprime uma etiqueta por volume.
- A quantidade fica salva no pedido e já vem preenchida numa reimpressão.
- Dá para **reimprimir um volume específico** (ex.: só o 2/3).
- Se a quantidade de volumes mudar depois de uma conferência iniciada ou
  concluída, a conferência é **zerada** (o sistema avisa antes), e o fato fica na
  linha do tempo. *(decisão minha)*
- Se o pedido **voltar para "Orçamento"** (`voltarParaOrcamento`), a conferência
  também é zerada, com registro na linha do tempo. A quantidade de volumes é
  mantida como sugestão para a próxima impressão. *(decisão minha)*
- Onde fica o botão: na tela do pedido e no card do Kanban, para qualquer pedido
  que já saiu de "Orçamento". *(decisão minha)*
- Impressão por HTML + `window.print()`, com a página no tamanho exato da
  etiqueta (`@page { size: <L>mm <A>mm; margin: 0 }`) e uma etiqueta por página.
  O usuário configura o tamanho do papel no driver da térmica uma vez.
- Os códigos são renderizados em **SVG**, para manter a nitidez na térmica.

### 4. Código nos documentos

- O código do pedido (`26001`) aparece em **posição fixa** (sem editor) na
  **Proposta Comercial** (`gerarHTMLProposta`, que é o pedido impresso que vai
  para o cliente) e na **OS** (`gerarHTMLOS`), para o conferente conferir com
  qualquer um dos dois.
- Na proposta, o código aparece **desde a fase de Orçamento**, sem esperar a
  aprovação. O número do pedido já existe desde a criação.
- O usuário não escolhe barras ou QR nos documentos. Usar código de barras
  Code128 + número legível. *(decisão minha)*

### 5. Tela de Expedição (conferência e consulta)

Uma página nova, `expedicao.html`, com item no menu e um módulo de permissão
próprio (`expedicao`). *(decisão minha)*

- Um campo de leitura grande, sempre focado. O scanner "digita" o código e manda
  Enter, e o sistema processa a leitura.
- **Fluxo de conferência:**
  1. O conferente bipa o código do **documento** (`26001`). O sistema mostra o
     pedido ativo: cliente, endereço, telefone, data de entrega e a lista de
     volumes esperados (1/3, 2/3, 3/3), com o estado de cada um.
  2. Ele bipa cada **pacote** (`26001-2-3`) e o volume ganha ✅.
  3. **Pacote de outro pedido**: alerta ❌ grande e vermelho, com som de erro.
  4. **Volume já conferido**: aviso "já conferido", sem duplicar.
  5. **Código desconhecido** (pedido não existe, foi excluído ou o formato é
     inválido): alerta "pedido não encontrado".
  6. Quando todos os volumes batem, a conferência é concluída automaticamente.
- **Consulta rápida:** bipar um volume sem pedido ativo (ou um pedido sem
  etiquetas impressas) abre o resumo do pedido com cliente, endereço, telefone e
  volumes, e um botão "abrir pedido". *(decisão minha: bipar um volume sem
  documento não conta como conferido; a conferência sempre começa pelo documento)*
- Sons gerados por Web Audio (sem arquivos de som): bipe curto no acerto e tom
  grave no erro.
- **Progresso parcial é salvo.** Se conferir 2 de 3 e sair, o card mostra "2/3
  conferidos" e a conferência continua de onde parou.

### 6. Resultado da conferência

- **O status do pedido não muda.**
- O **card do pedido** (Kanban e Lista) ganha uma marcação: "✓ Conferido" quando
  concluída, ou "2/3 conferidos" quando parcial.
- A **linha do tempo** do pedido registra a conclusão: "Conferido na expedição
  por <usuário> — 3 volumes", com data e hora. Registrar também quando a
  conferência for zerada.

## Modelo de dados (proposta)

Nova chave `sc_etiqueta_cfg`, genérica por tipo de etiqueta:

```js
{
  modelos: {
    pedido: {
      formato: '100x50',            // ou 'custom'
      largura_mm: 100, altura_mm: 50,
      elementos: [
        { id, tipo: 'campo', campo: 'cliente', x_mm, y_mm, w_mm, h_mm,
          fonte_pt: 10, negrito: false, alinhamento: 'esq' },
        { id, tipo: 'barcode', x_mm, y_mm, w_mm, h_mm },
        { id, tipo: 'qrcode',  x_mm, y_mm, w_mm, h_mm },
        { id, tipo: 'texto', texto: 'Frágil', ... },
        { id, tipo: 'logo', ... }, { id, tipo: 'linha', ... }
      ]
    }
    // futuramente: tecido, material
  }
}
```

Campos novos no pedido:

```js
volumes: 3,                         // null até a primeira impressão
conferencia: {
  volumes_conferidos: [1, 2],
  concluida_em: null | timestamp,
  conferido_por: null | nomeUsuario
}
```

Os nomes exatos podem ser ajustados por quem implementar, seguindo as convenções
do projeto.

**Atenção:** `salvarPedido()` (`js/app.js:5747-5798`) monta o objeto do pedido a
partir de uma lista fixa de campos. Essa lista precisa preservar `volumes` e
`conferencia`, senão eles se perdem a cada edição.

## Preparar o futuro (tecidos e itens)

- O editor recebe um **tipo de etiqueta** com sua lista de campos disponíveis e
  sua função de "dados de exemplo". Para a v1 só existe `pedido`.
- O formato do código (`<id>-<vol>-<total>`) pode ganhar um prefixo por tipo no
  futuro (ex.: `T` para rolo de tecido). Por isso o leitor da Expedição deve
  aceitar e validar formatos de forma isolada, numa função própria e testável.

## Restrições

- Sem npm, sem build. Bibliotecas de código de barras e QR via CDN jsdelivr com
  versão fixada, carregadas sob demanda (padrão do projeto), ou código próprio.
  Escolha de quem implementar. O sistema terá acesso à internet, mas a conexão do
  cliente pode cair. **Se a biblioteca não carregar** (falha de rede ou timeout),
  mostrar uma mensagem clara de **falha de conexão** ("Não foi possível carregar o
  gerador de códigos. Verifique a conexão com a internet e tente novamente"),
  tanto no editor quanto na impressão de etiquetas e documentos. Nunca imprimir
  uma etiqueta sem o código ou com o código quebrado. A tela de Expedição
  (leitura) não depende dessas bibliotecas e funciona sem internet.
- Drag and drop com Pointer Events nativos, sem biblioteca.
- Comentários em português sem acentos, chaves `sc_`, cache-busting `?v=` nos
  scripts, conforme o restante do projeto.
- Testes: unitários com `node --test` (montagem/leitura do código, validação de
  layout, regras de conferência) e e2e com Playwright em `tests/e2e/` (fluxo de
  editar a etiqueta, imprimir com volumes e conferir na Expedição).

## Deixado para quem implementar

- O visual exato do editor, da tela de Expedição e da marcação no card, seguindo
  `css/style.css`.
- A escolha das bibliotecas de código (ou implementação própria).
- Os limites numéricos do aviso de legibilidade.
- A organização do código: arquivo novo em `js/` ou seções em `app.js`.
