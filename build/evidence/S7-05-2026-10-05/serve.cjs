const http=require('http'),fs=require('fs'),path=require('path');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.jpg':'image/jpeg','.webp':'image/webp','.xml':'application/xml'};
module.exports=(root,port,spa)=>new Promise(r=>{const s=http.createServer((q,res)=>{let u=decodeURIComponent(q.url.split('?')[0]);let f=path.join(root,u);
 try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch{ if(spa) f=path.join(root,'index.html'); else if(fs.existsSync(f+'.html')) f=f+'.html'; }
 fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);return res.end('nf')}res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(d)})}).listen(port,()=>r(s))});
