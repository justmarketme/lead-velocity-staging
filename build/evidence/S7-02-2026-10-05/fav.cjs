const path=require('path'),fs=require('fs');
const pw=require(process.env.PLAYWRIGHT_PATH);
const axeSrc=fs.readFileSync(path.join(__dirname,'axe/node_modules/axe-core/axe.min.js'),'utf8');
const repo='C:/Users/Jono/lead-velocity-sortmycover';
const out=path.join(repo,'build/evidence/S7-02-2026-10-05'); fs.mkdirSync(out,{recursive:true});
(async()=>{const srv=await require('./serve.cjs')(repo,5591);
 const b=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--force-color-profile=srgb']});
 const res={browser:b.version()};
 for(const scheme of ['light','dark']){
  const p=await b.newPage({colorScheme:scheme,viewport:{width:1040,height:900}});
  const fails=[];p.on('requestfailed',r=>fails.push(r.url()+' '+(r.failure()||{}).errorText));p.on('response',r=>{if(r.status()>=400)fails.push(r.status()+' '+r.url())});
  await p.goto('http://127.0.0.1:5591/brand/favicon/favicon-check.html');await p.waitForLoadState('networkidle');
  const imgs=await p.$$eval('img',a=>a.map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0,w:i.naturalWidth})));
  await p.screenshot({path:path.join(out,`check-${scheme}.png`),fullPage:true});
  // render favicon.svg itself at 16/32 and sample pixels: centre (tick), disc, edge ring
  const sv=await b.newPage({colorScheme:scheme,viewport:{width:64,height:64}});
  await sv.goto('http://127.0.0.1:5591/brand/favicon/favicon.svg');
  const px=await sv.evaluate(async()=>{const svg=document.documentElement;const s=new XMLSerializer().serializeToString(svg);
    const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(s);await img.decode();const r={};
    for(const n of [16,32]){const c=new OffscreenCanvas(n,n);const x=c.getContext('2d');x.drawImage(img,0,0,n,n);
      const d=x.getImageData(0,0,n,n).data;let amber=0,tick=0,ring=0,opaque=0;
      for(let i=0;i<d.length;i+=4){if(d[i+3]<200)continue;opaque++;const[R,G,B]=[d[i],d[i+1],d[i+2]];
        if(R>200&&G>130&&G<190&&B<90)amber++;else if(R<90&&G<70&&B<40)tick++;else if(R>235&&G>235&&B>225)ring++;}
      r[n]={opaque,amber,tick,ring};}return r;});
  await sv.screenshot({path:path.join(out,`favicon-svg-${scheme}.png`)});
  const media=await sv.evaluate(()=>matchMedia('(prefers-color-scheme: dark)').matches);
  await p.addScriptTag({content:axeSrc});
  const ax=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']});return r.violations.map(v=>({id:v.id,n:v.nodes.length}))});
  res[scheme]={prefersDark:media,brokenImages:imgs.filter(i=>!i.ok),images:imgs.length,failedRequests:fails,pixels:px,axe:ax};
 }
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(res,null,1));console.log(JSON.stringify(res,null,1));await b.close();srv.close();})();
