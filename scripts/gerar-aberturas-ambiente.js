// Gera images/Aberturas/Ambiente/Abertura{A..H}.svg (e -anim.svg): a cortina de
// tecido instalada no ambiente, com prega Americana e uma camada.
// O desenho vem de js/cortina-desenho.js, o mesmo que o pedido usa para montar a
// imagem com as pregas de cada tecido; estes arquivos fixos sao a reserva para
// quando o modulo nao estiver carregado. A versao tecnica fica em scripts/gerar-aberturas.js.
// Rodar: node scripts/gerar-aberturas-ambiente.js
const fs = require('fs');
const path = require('path');
const CortinaDesenho = require('../js/cortina-desenho.js');

const destino = path.join(__dirname, '..', 'images', 'Aberturas', 'Ambiente');
fs.mkdirSync(destino, { recursive: true });
const letras = Object.keys(CortinaDesenho.ABERTURAS);
for (const abertura of letras) {
    const pregas = [CortinaDesenho.PREGA_PADRAO];
    fs.writeFileSync(path.join(destino, `Abertura${abertura}.svg`), CortinaDesenho.svg({ abertura, pregas }));
    fs.writeFileSync(path.join(destino, `Abertura${abertura}-anim.svg`), CortinaDesenho.svg({ abertura, pregas, animado: true }));
}
console.log('Geradas em images/Aberturas/Ambiente:', letras.join(', '));
