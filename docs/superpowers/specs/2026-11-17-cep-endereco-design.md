# CEP e endereço em partes — design curto

**Pedido do dono (2026-11-17):** no cadastro do cliente, campo CEP (não obrigatório). Com CEP digitado aparece um botão "Buscar endereço" que preenche rua, bairro, cidade e estado. Os mesmos dados servem para as rotas. Escolha do dono: **campos separados** (opção A) e **CEP + Buscar endereço também nos agendamentos** de medição e de instalação.

## Abordagens consideradas
- **Partes gravadas + texto montado (escolhida, decisão minha):** grava `cep, rua, numero, complemento, bairro, cidade, uf` e continua gravando o texto único (`end` no cliente, `endereco` na medição, `inst_endereco` na instalação) montado a partir das partes. OS, proposta, etiquetas, busca e listas continuam lendo o texto de sempre; só formulários e rotas mudam.
- **Só partes, reescrever todos os leitores:** mais "limpo", mas mexe em OS, proposta, etiquetas, Kanban, rotas, backup — muito risco para pouco ganho.
- **Campo único com CEP (opção B):** descartada pelo dono.

## Como fica
- **Formulários com as partes** (mesma ordem e mesmo componente em todos): CEP · [Buscar endereço] · Rua · Número · Complemento · Bairro · Cidade · Estado (lista das 27 UFs). Onde: cadastro do cliente; agendar medição; agendar instalação; janelas Editar medição, Editar instalação e Reagendar (se tiverem endereço).
- **Texto montado:** "Rua, Número, Complemento, Bairro" (partes vazias saem). Cidade e UF continuam em campo próprio (`cidade`, `uf`).
- **CEP:** máscara 00000-000. O botão "Buscar endereço" só aparece com 8 dígitos. Enter no CEP também busca.
- **Busca:** ViaCEP (gratuito, sem cadastro); se falhar a rede, tenta a BrasilAPI. Preenche Rua, Bairro, Cidade e Estado (sobrescreve, porque a pessoa pediu) e põe o cursor no Número. Não mexe em Número/Complemento.
  - CEP inexistente: "CEP não encontrado. Confira os números ou preencha o endereço à mão." — nada é apagado.
  - CEP só da cidade (sem rua): preenche Cidade/Estado e avisa "Esse CEP é da cidade toda: preencha a rua e o bairro."
  - Sem internet: "Não deu para buscar o endereço agora. Preencha à mão."
- **Agendamentos:** ao escolher o cliente (medição) ou o pedido (instalação), as partes vêm do cliente e podem ser mudadas. Medição continua exigindo endereço: obrigatório passa a ser a Rua.
- **Dados antigos (sem partes):** ao abrir para editar, o texto antigo vai inteiro para Rua e a cidade para Cidade; ao salvar, grava as partes. Nada muda até alguém editar. A regra atual de cidade da instalação (`_instCidade`) continua para pedidos antigos.
- **Rotas e 📍 Ir:** o endereço procurado vira "Rua, Número, Bairro, Cidade - UF, CEP" (`RotasCore.enderecoDePartes`). Links do Google Maps usam o texto completo. Na busca de coordenadas (Nominatim), tenta em ordem: completo → sem bairro/complemento → só CEP + cidade; a primeira que achar fica no cache. Sem partes, usa o texto antigo como hoje.
- **Lista de clientes:** mostra "endereço — Cidade/UF".
- Empresa, fornecedores e documentos impressos: fora do escopo (não mudam).

## Deixado para o construtor
- Nomes de funções/ids exatos, layout do grid (deve caber no celular), testes (núcleo para montar texto/consultas em ordem; e2e com a API simulada por `page.route`).
