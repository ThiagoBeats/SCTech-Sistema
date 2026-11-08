# Site da SCTech

Página única de apresentação do SCTech, com pedido de demonstração.

## Abrir

Abra `index.html` no navegador. Não precisa instalar nada: as bibliotecas
(Bootstrap, Swiper, AOS, Font Awesome) e as fontes vêm da internet.

## Antes de publicar

1. **Contato.** O WhatsApp e o e-mail são **falsos**. Troque no topo de
   `js/site.js`, no bloco `CONTATO`:
   - `whatsapp`: DDI + DDD + número, só dígitos (ex.: `5511987654321`);
   - `whatsappTexto`: o número como aparece no rodapé;
   - `email`: quem recebe os pedidos de demonstração.
2. **E-mail dos pedidos.** O formulário envia pelo FormSubmit (gratuito). No
   primeiro envio, o FormSubmit manda um e-mail de ativação para o endereço
   configurado: é só confirmar uma vez. Se o envio falhar, o visitante é
   orientado a mandar o pedido pelo WhatsApp, que já abre com a mensagem pronta.
3. **Fotos.** As fotos de ambientes em `assets/img/fotos/` vieram do site da
   Premium Persianas e Cortinas. Confirme a autorização de uso ou troque por
   fotos próprias, mantendo os mesmos nomes de arquivo.

## Pastas

- `assets/img/fotos/`: fotos de ambientes (banner, cartões, fundo do formulário).
- `assets/img/telas/`: capturas do SCTech com dados de exemplo. Para atualizar,
  capture a tela de novo e salve com o mesmo nome, em `.webp`.
- `css/estilo.css`: cores e estilos. As cores ficam no começo, em `:root`.
- `js/site.js`: contato, banner, abas das telas, fita métrica e formulário.
