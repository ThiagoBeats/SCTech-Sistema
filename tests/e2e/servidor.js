const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const RAIZ = process.env.RAIZ;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.xlsx': 'application/octet-stream', '.pdf': 'application/pdf' };
http.createServer((q, s) => {
    const p = decodeURIComponent(url.parse(q.url).pathname);
    const a = path.join(RAIZ, p);
    fs.readFile(a, (e, d) => {
        if (e) { s.writeHead(404); return s.end('404'); }
        s.writeHead(200, { 'Content-Type': TIPOS[path.extname(a).toLowerCase()] || 'application/octet-stream' });
        s.end(d);
    });
}).listen(Number(process.env.PORTA) || 8123, () => console.log('servidor ok'));
