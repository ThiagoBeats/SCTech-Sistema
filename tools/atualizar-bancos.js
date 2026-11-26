'use strict';
// Regenera js/bancos-base.js a partir da BrasilAPI (https://brasilapi.com.br/api/banks/v1).
// Uso: node tools/atualizar-bancos.js   (precisa de internet; Node 18+ por causa do fetch)
// O arquivo gerado fica no repositorio para o sistema funcionar sem internet.
const fs = require('fs');
const path = require('path');

const URL_API = 'https://brasilapi.com.br/api/banks/v1';
// Logos: repositorio rzmt/logos-bancos-br (MIT, mas os logos sao marcas das instituicoes e o proprio
// repositorio avisa que NAO estao cobertos pela MIT) — por isso nao copiamos os arquivos: usamos o CDN
// jsDelivr fixado neste commit. Chave = codigo COMPE; valor = arquivo (ISPB.ext) em logos/<ext>/.
const LOGOS_COMMIT = '3fe9758efda502a3f1d8318e6bbef0f339ff4ded';
const LOGOS_CDN = 'https://cdn.jsdelivr.net/gh/rzmt/logos-bancos-br@' + LOGOS_COMMIT + '/logos/';
const LOGOS = {
    '102': '02332886.svg',
    '104': '00360305.svg',
    '121': '10664513.svg',
    '125': '45246410.svg',
    '133': '10398952.svg',
    '136': '00315557.svg',
    '197': '16501555.svg',
    '208': '30306294.svg',
    '212': '92894922.svg',
    '218': '71027866.png',
    '237': '60746948.svg',
    '246': '28195667.svg',
    '260': '18236120.svg',
    '290': '08561701.svg',
    '318': '61186680.svg',
    '323': '10573521.svg',
    '335': '27098060.svg',
    '336': '31872495.svg',
    '341': '60701190.svg',
    '348': '33264668.svg',
    '364': '09089356.svg',
    '380': '22896431.svg',
    '389': '17184037.svg',
    '403': '37880206.svg',
    '413': '01858774.svg',
    '422': '58160789.svg',
    '426': '11285104.svg',
    '477': '33042953.svg',
    '536': '20855875.svg',
    '542': '18189547.svg',
    '623': '59285411.svg',
    '633': '68900810.svg',
    '637': '60889128.svg',
    '654': '92874270.svg',
    '655': '59588111.svg',
    '707': '62232889.svg',
    '745': '33479023.svg',
    '748': '01181521.svg',
    '756': '02038232.svg',
    '769': '24313102.svg',
    '001': '00000000.svg',
    '003': '04902979.svg',
    '004': '07237373.svg',
    '021': '28127603.svg',
    '033': '90400888.svg',
    '037': '04913711.svg',
    '041': '92702067.svg',
    '047': '13009717.svg',
    '069': '61033106.svg',
    '070': '00000208.svg',
    '074': '03017677.svg',
    '077': '00416968.svg',
    '085': '05463212.svg'
};
// Nome popular das instituicoes com logo (a BrasilAPI traz o nome oficial abreviado em maiusculas).
const NOMES = {
    '102': 'XP Investimentos',
    '104': 'Caixa',
    '121': 'Agibank',
    '125': 'Genial',
    '133': 'Cresol',
    '136': 'Unicred',
    '197': 'Stone',
    '208': 'BTG Pactual',
    '212': 'Banco Original',
    '218': 'BS2',
    '237': 'Bradesco',
    '246': 'ABC Brasil',
    '260': 'Nubank',
    '290': 'PagBank',
    '318': 'BMG',
    '323': 'Mercado Pago',
    '335': 'Digio',
    '336': 'C6 Bank',
    '341': 'Itaú',
    '348': 'Banco XP',
    '364': 'Efí',
    '380': 'PicPay',
    '389': 'Mercantil',
    '403': 'Cora',
    '413': 'BV',
    '422': 'Safra',
    '426': 'Neon Financeira',
    '477': 'Citibank',
    '536': 'Neon',
    '542': 'InfinitePay',
    '623': 'Banco Pan',
    '633': 'Rendimento',
    '637': 'Sofisa',
    '654': 'Digimais',
    '655': 'Banco Votorantim',
    '707': 'Daycoval',
    '745': 'Citibank',
    '748': 'Sicredi',
    '756': 'Sicoob',
    '769': '99Pay',
    '001': 'Banco do Brasil',
    '003': 'Banco da Amazônia',
    '004': 'Banco do Nordeste',
    '021': 'Banestes',
    '033': 'Santander',
    '037': 'Banpará',
    '041': 'Banrisul',
    '047': 'Banese',
    '069': 'Crefisa',
    '070': 'BRB',
    '074': 'J. Safra',
    '077': 'Inter',
    '085': 'Ailos'
};

async function main() {
    const r = await fetch(URL_API);
    if (!r.ok) throw new Error('BrasilAPI respondeu ' + r.status);
    const bruto = await r.json();
    const lista = bruto.map(b => {
        const codigo = b.code == null ? null : String(b.code).padStart(3, '0');
        return {
            ispb: String(b.ispb),
            codigo,
            nome: (codigo && NOMES[codigo]) || String(b.name || '').trim(),
            nomeCompleto: String(b.fullName || b.name || '').trim()
        };
    }).filter(b => b.nome);
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const logos = {};
    Object.keys(LOGOS).sort().forEach(c => { const f = LOGOS[c]; logos[c] = LOGOS_CDN + f.split('.')[1] + '/' + f; });
    const NL = '\n';
    const saida = [
        "'use strict';",
        '// GERADO por tools/atualizar-bancos.js a partir da BrasilAPI (' + new Date().toISOString().slice(0, 10) + ') - nao editar a mao.',
        '// Logos: CDN jsDelivr fixado em commit de rzmt/logos-bancos-br (ver tools/atualizar-bancos.js).',
        'const BANCOS_BASE = ' + JSON.stringify(lista).replace(/\},\{/g, '},' + NL + '{') + ';',
        'const BANCOS_LOGOS = ' + JSON.stringify(logos, null, 4) + ';',
        "if (typeof module !== 'undefined' && module.exports) module.exports = { BANCOS_BASE, BANCOS_LOGOS };",
        ''
    ].join(NL);
    const destino = path.join(__dirname, '..', 'js', 'bancos-base.js');
    fs.writeFileSync(destino, saida);
    console.log(lista.length + ' instituicoes, ' + Object.keys(logos).length + ' logos -> ' + destino);
}
main().catch(e => { console.error(e.message); process.exit(1); });
