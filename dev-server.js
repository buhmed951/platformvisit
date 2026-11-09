// Local test server: serves /public and mounts api/uploads.js with a file-based store.
const http = require('http'), fs = require('fs'), path = require('path');
process.env.OPD_LOCAL_STORE = process.env.OPD_LOCAL_STORE || path.join(__dirname, '.local-store.json');
const handler = require('./api/uploads.js');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url.startsWith('/api/uploads')) {
    let data = ''; req.on('data', c => data += c); req.on('end', () => {
      req.body = data ? JSON.parse(data) : undefined;
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      handler(req, res);
    });
    return;
  }
  const f = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  fs.readFile(f, (e, d) => { if (e) { res.statusCode = 404; return res.end('not found'); } res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); res.end(d); });
}).listen(port, () => console.log('http://localhost:' + port));
