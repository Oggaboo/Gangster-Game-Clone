import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const root = process.argv[2], port = +process.argv[3]
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' }
http.createServer((req, res) => {
    let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html')
    if (!fs.existsSync(p)) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'content-type': types[p.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-store' })
    fs.createReadStream(p).pipe(res)
}).listen(port)
