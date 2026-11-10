# Galeria e Simulador de Cortinas — Design

Data: 2026-11-10 · Status: aguardando aprovação

## Por que existe

Na visita de medição ou de instalação, o profissional (medidor ou instalador)
quer mostrar ao cliente, ali na casa dele, como a cortina ou a persiana vai
ficar. Hoje ele não tem nada no sistema para isso. A ideia é uma ferramenta de
venda na hora: algumas fotos reais de modelos e um simulador que coloca a
cortina em 3D por cima da foto da parede do cliente, abrindo e fechando ao
toque.

**Régua principal (dita pelo usuário): o instalador deve ter facilidade para
usar o simulador.** Na dúvida entre mais recurso e menos passos, vence menos
passos.

## Objetivos

1. **Galeria**: fotos reais que a empresa sobe (~50), separadas por grupo,
   passadas com o dedo em tela cheia.
2. **Simulador**: foto da parede → encaixar a janela → escolher modelo, cor,
   trilho, abertura → cortina 3D sobre a foto, abrindo/fechando com o dedo.
3. **Salvar e enviar**: imagem (PNG/JPG) e vídeo curto da simulação, para
   baixar ou compartilhar (WhatsApp, e-mail).
4. **Mostruário próprio de cada empresa**, montado numa aba de Configurar
   Empresa, separado do catálogo de vendas.

## Não-objetivos

- Não é uma galeria completa nem um portfólio público.
- A simulação não vira pedido nem orçamento; não tem preço.
- O mostruário não usa nem altera o catálogo de tecidos/materiais.
- Simulações, imagens e vídeos salvos **não** ficam guardados no sistema:
  vão para o aparelho ou para o compartilhamento.
- Controle de acesso do instalador/medidor: fica para depois (o usuário vai
  estruturar). Por ora, a tela segue o esquema de permissões existente.
- Fotorrealismo de foto (IA gerando imagem): descartado. Escolhido o 3D no
  navegador.

## Anti-objetivos (falha mesmo funcionando)

- Instalador precisando de muitos passos, ou de explicação, para montar a
  primeira simulação.
- Tela travando ou engasgando no celular ao abrir/fechar a cortina.
- Cortina que parece colada torta na foto (sem perspectiva) ou "desenho
  infantil" — tem que ter dobras com luz e sombra.

## Restrições

- App estático HTML/JS, sem build; hoje ainda sem servidor e com os dados no navegador.
- Uso principal no **celular**; também tablet e PC.
- **Acesso no celular (decisão do usuário):** o instalador acessa o sistema
  da empresa remotamente por VPN. **Não precisa abrir sem internet** — nada de
  service worker/PWA. A biblioteca 3D ainda fica dentro do projeto
  (`js/vendor/`), para não depender de CDN externo por trás da VPN.
- **Em produção o sistema roda num servidor local da empresa** e os dados
  (inclusive mostruário e fotos) vêm desse servidor; o instalador pela VPN vê
  o mesmo mostruário do escritório. Hoje os dados ainda ficam no navegador:
  por isso fotos e texturas passam por **um único módulo de armazenamento de
  imagens**, para a troca pelo servidor mexer num lugar só. Não há
  exportar/importar.
- ~50 fotos da galeria + texturas: não cabem no `localStorage` (~5 MB).
  Ficam em armazenamento separado e maior do navegador, num módulo isolado,
  porque **o usuário vai migrar para armazenamento local definitivo** depois.
- Versão de cache `?v=` nos HTML, como no resto do sistema.

## O que foi decidido com o usuário

### Tipos que o simulador mostra
- **Cortinas de tecido**, com as pregas que o sistema já conhece
  (`PREGAS` em `js/cortina-desenho.js`): Prega Americana, Wave Botão,
  Wave Plus/Flex, Franzido, Prega Macho-Fêmea, Painel / Sem Prega.
  Correm para o lado.
- **Persianas**: **rolô, romana e double vision** (só essas três na primeira
  versão). Sobem e descem.

### Tela do simulador — opção A (escolhida no navegador)
- Foto da parede em **tela cheia**.
- **Gaveta embaixo** com abas: Modelo, Cor, Trilho, Abertura (persianas: as
  abas que fizerem sentido para elas). Escolhas por miniaturas para tocar.
- A gaveta pode ser recolhida para mostrar só a foto ao cliente.
- Abrir/fechar **arrastando o dedo na própria cortina** (lado para cortina,
  cima/baixo para persiana).
- Botões: 💾 Imagem, 🎥 Vídeo, 📤 Enviar.
- Tablet e PC: as escolhas viram um painel ao lado da foto (como o editor de
  layout dos documentos).

### Mostruário (cada empresa monta o seu)
- Separado do catálogo. Cada empresa escolhe o que mostrar: cores e texturas
  (foto do tecido opcional; sem foto vale a cor), modelos e trilhos/varões
  que aparecem.

### Galeria de fotos reais
- A empresa sobe as fotos (~50), em grupos (pregas, trilhos/varões, rolô,
  romana, double vision).
- Profissional passa com o dedo, tela cheia.

### Salvar
- Imagem e vídeo curto; no celular, "Compartilhar" abre WhatsApp/e-mail.

## Decisões minhas (o usuário pode revisar)

- **Onde fica**: item novo no menu lateral, **"Galeria"** (`galeria.html`),
  com a galeria e o simulador. A montagem do mostruário vira a aba
  **"🖼️ Galeria e Mostruário"** em Configurar Empresa (`empresa.html#galeria`).
- **Ligação galeria → simulador**: cada foto da galeria pode ser ligada a um
  item do mostruário (ex.: foto da wave ligada à prega Wave Botão) e mostra o
  botão **"Simular na parede do cliente"**, que abre o simulador já com aquilo
  escolhido.
- **Encaixe na foto**: um retângulo com **4 cantos arrastáveis** sobre a
  janela; a cortina segue essa perspectiva. Começa num tamanho padrão no
  centro para dar resultado já no primeiro toque.
- **Trilhos/varões**: a lista parte dos tipos que o sistema já usa
  (`KITS_FIXACAO_PADRAO`: Trilho Suíço Simples/Duplo/Triplo, Trilho
  Motorizador, Varão Alumínio Comum, Varão Suíço/Wave), simplificada na tela
  para o que muda o visual (trilho fino × varão aparente).
- **Abertura**: no simulador, só o visual — central, para a esquerda, para a
  direita (as letras A–H do pedido misturam lado do comando, que não aparece
  na simulação).
- **Foto da parede**: câmera ou arquivo; reduzida no aparelho antes de usar.
  Não é guardada depois que a tela fecha.
- **3D**: Three.js (ou equivalente WebGL) **copiado para dentro do projeto**
  (`js/vendor/`), não por CDN — não depende de site externo por trás da VPN.
- **O que os 4 cantos marcam**: a **janela**. O simulador estica sozinho a
  partir dela: trilho/varão um pouco acima, cortina mais larga que a janela e
  descendo até o chão; um botão alterna "até o chão" / "até a janela".
  Persianas cobrem a janela. Sem digitar medidas.
- **Fotos e texturas**: guardadas em IndexedDB, reduzidas (lado maior por
  volta de 1600 px para galeria, menor para textura), atrás de um módulo
  único de armazenamento de imagens para a migração futura.
- **Vídeo**: gravação da própria tela da simulação (abre e fecha uma vez,
  poucos segundos), no formato que o navegador do aparelho suportar
  (WebM/MP4). Se o aparelho não gravar vídeo, o botão some e fica a imagem.
- **Mostruário vazio**: o simulador funciona com um conjunto inicial de
  cores neutras, para nunca abrir em branco.
- **Permissão**: novo módulo de permissão "Galeria" no esquema atual, já
  liberado para visualizar em todos os papéis (inclusive Instalação e
  Medição). Montar o mostruário exige `configuracoes.empresa` completo — o
  instalador vê, não altera.

## Deixado para quem for construir

- O modelo 3D de cada prega e persiana (geometria das dobras, iluminação),
  desde que fique convincente e fluido num celular médio.
- Layout fino da gaveta, miniaturas, ícones; seguir o visual do sistema.
- Como o profissional percebe que pode arrastar (dica na primeira vez etc.).
- Organização dos arquivos JS, seguindo o padrão núcleo puro testável
  (`*-core.js`) + tela, como em etiquetas e layout dos documentos.
