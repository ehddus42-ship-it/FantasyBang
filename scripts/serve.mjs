import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.json':'application/json; charset=utf-8' };
http.createServer((req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.setHeader('content-type', mime[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
}).listen(port, ()=>console.log(`룬 크라운: http://localhost:${port}`));
