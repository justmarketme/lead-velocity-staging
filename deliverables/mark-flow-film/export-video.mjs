// Export the recovered interactive film as a narrated, captioned WhatsApp MP4.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const puppeteer=require('../broker-success/onboarding-film/build/node_modules/puppeteer-core');
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'video'),frames=path.join(out,'frames'),clips=path.join(out,'clips');
fs.mkdirSync(frames,{recursive:true});fs.mkdirSync(clips,{recursive:true});
const script=JSON.parse(fs.readFileSync(path.join(root,'script.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'audio/manifest.json'),'utf8'));
const beats=script.chapters.flatMap(c=>c.scenes.flatMap(sc=>sc.beats.map(b=>({...b,ch:c.id,title:sc.title}))));
const only=process.argv.includes('--only')?process.argv.slice(process.argv.indexOf('--only')+1):[];
const todo=only.length?beats.filter(b=>only.includes(b.id)):beats;
const run=(args)=>new Promise((resolve,reject)=>{const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});let err='';p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(err)))});
const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage();await page.setViewport({width:1280,height:720});
await page.goto('http://127.0.0.1:8766/',{waitUntil:'networkidle0'});
// A masked practice name is used solely for this illustrated export; no unconfirmed firm is named.
await page.evaluate(()=>{localStorage.setItem('mark-film-practice','PRACTICE_REDACTED');});
await page.reload({waitUntil:'networkidle0'});
await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
await page.addStyleTag({content:`
:root{color-scheme:light!important}.app{padding:0!important;margin:0;width:1280px;max-width:none}.mast,.chapters,.sidebar,.transport,.footer{display:none!important}.layout{display:block!important}.stage{width:1280px;height:720px;min-height:0;border-radius:0;border:0;box-shadow:none;position:relative;background:#fff}.stage-top{height:48px;padding:15px 28px 0}.stage-top .badge{font-size:10px}.stage-body{height:550px;min-height:0;padding:18px 28px;position:relative;overflow:hidden}.scene-head{margin-bottom:15px}.scene-head h2{font-size:27px}.columns{grid-template-columns:410px minmax(0,1fr);gap:24px}.phone{width:260px;max-width:260px;height:563px;min-height:563px;max-height:563px;display:flex;flex-direction:column;border-width:7px;border-radius:40px;padding-top:27px;padding-bottom:18px}.phone-top{padding:10px 13px;font-size:13px}.chat{min-height:0;flex:1;overflow:hidden;padding:12px;gap:8px}.bubble{font-size:12px;line-height:1.45;padding:10px 12px}.flow{padding:14px 12px}.flow h3{font-size:17px}.flow p{font-size:12px}.choices{gap:5px}.choices button{padding:7px 10px;font-size:12px}.phone input{padding:7px;font-size:12px}.phone label{font-size:11px}.rail{gap:12px}.card{padding:18px}.card h3{font-size:19px}.card p{font-size:14px}.callout{padding:14px 17px;font-size:12px}.callout blockquote{font-size:14px}.actions button{font-size:12px;padding:8px 12px}.action-zone .eyebrow{font-size:10px}.result{font-size:13px;padding:10px 12px}.data{font-size:12px;grid-template-columns:125px minmax(0,1fr)}.data dt,.data dd{padding:6px 0}.captions{position:absolute;left:0;right:0;bottom:0;height:108px;min-height:0;padding:22px 50px;display:flex;align-items:center;justify-content:center;font-size:21px;line-height:1.45;background:#f4f1f8;border-top:1px solid #e3dfec;color:#172033}.contract{max-width:1080px}.contract .quote{font-size:25px;padding:15px 0}.contract .ask{font-size:16px;margin:15px 0}.contract .muted{font-size:15px}.contract .actions{display:none}.timeline b{font-size:32px}.portalbody{padding:17px}.portal input{padding:8px;margin:3px 0 8px}.portal h3{font-size:18px}.tickline{padding:7px 0;font-size:13px}.big-stat{font-size:64px}.practice-mask{filter:blur(4px);user-select:none}.video-inner{transform-origin:top center;width:1224px}.tip{font-size:11px}.welcome .poster{max-height:440px;width:auto;max-width:100%;margin:auto}.welcome .welcome-controls{display:none}.welcome .tip{display:none}
`});
await page.addStyleTag({content:`
:root{--ink:#faf6ff;--muted:#bcb1d0;--line:#ffffff26;--paper:#20172e;--soft:#382044;--accent:#f363c8;--purple:#b044f2}
.stage{background:radial-gradient(ellipse at 95% 5%,#55206988,transparent 50%),radial-gradient(ellipse at 5% 100%,#b6227333,transparent 45%),#100d1e;color:#faf6ff;border-top:5px solid #ce27aa}.stage-body{background-image:radial-gradient(#ffffff09 1px,transparent 1px);background-size:20px 20px}.card{background:linear-gradient(125deg,#2d1d3cdd,#191427ee);border:1px solid #c663dc38;box-shadow:0 12px 30px #0003}.card h3,.scene-head h2,.contract h2{color:#fff}.card p,.data dd{color:#e6dced}.card .muted,.muted,.tip,.data dt{color:#bcb1d0}.eyebrow{color:#f363c8}.big-stat{background:linear-gradient(100deg,#ff6bb9,#bd65ff);background-clip:text;-webkit-text-fill-color:transparent}.callout,.result{background:#3a2048;color:#f6e6ff;border-color:#cc56d955}.actions button{background:#2b1c38;color:#f5e8ff;border-color:#b754d744}.actions button:hover{background:#512861}.captions{background:#171123;color:#f7eefc;border-top:1px solid #d15cbe40}.contract .quote{border-left:4px solid #db41bc;padding-left:22px;background:linear-gradient(90deg,#e939a310,transparent)}.contract .ask{color:#baafcd}.status,.clause{background:#42234a;color:#ff9bdf;border-color:#a94abf44}.portal{background:#22162f;color:#f6ebff;border-color:#c45be74a}.portalbar{background:#352040;color:#ffb1e7}.portalbody p,.portal h3,.portal label{color:#f6ebff}.portal input{background:#f9f5fc;color:#231630}.tickline{border-color:#ffffff20}.badge{color:#cfbddf;border-color:#ffffff30}.timeline>div{background:#311e3e;color:#f6ebff}.phone{box-shadow:0 20px 55px #0008,0 0 35px #ca42ca15}.closing{display:grid;grid-template-columns:1.25fr 1fr;align-items:center;gap:60px;padding:24px 42px}.closing h1{font-size:62px;letter-spacing:-3px;line-height:1.06;color:white}.gradient-text{background:linear-gradient(90deg,#ff64b5,#c775ff);background-clip:text;-webkit-text-fill-color:transparent}.closing p{font-size:20px;color:#c4b5d6;margin-top:24px}.closing-logo{width:80px;height:92px;object-fit:contain;margin-bottom:20px}.closing-card{border:1px solid #e77ed855;border-radius:28px;background:linear-gradient(135deg,#422049,#20152d);padding:32px;box-shadow:0 20px 60px #0006}.closing-card h3{font-size:28px;color:white}.closing-step{padding:18px 0;border-bottom:1px solid #ffffff20;font-size:19px;color:#eadcf5}.closing-step b{color:#ff8fd8;margin-right:12px}.closing-contact{font-size:17px!important;color:#f697db!important}
`});
const defaults={'c1s2b2':'Send','c1s2b3':'Yes, continue','c1s3b1':'Start','c1s3b4':'Type Sipho Ndlovu','c1s3b5':'Same as above (no other email)','c1s3b6':'Yes, use my WhatsApp number','c1s4b1':'R1,500 or more','c1s6b1':'10:00','c1s6b2':'Book my call','c1s6b4':'Tap the link','c2s1b3':'Attended','c2s2b3':'Investments','c2s3b2':'Tue 20 Oct 16:00','c2s3b3':'Accept','c3s3b1':'Roll over on top','c4s3b1':'Yes','c4s3b3':'Copy the admin approval link','c4s4b1':'Looks right','c4s4b3':'Approve my intro card','c4s4b4':'Skip for now','c4s5b1':'Pay by EFT with a reference (no fee)'};
async function prepare(){await page.evaluate(()=>{
 document.documentElement.dataset.theme='light';
 // The review-only production notes belong beside the deliverable, not in the client film.
 document.querySelectorAll('#visual .tip,#visual p').forEach(el=>{if(/Intended portal|intended Start|real feedback screen|Production login|awaiting alignment|Tapping here|Signing method|The sample screen|live lookup|sender is hidden/.test(el.textContent))el.remove()});
 const walker=document.createTreeWalker(document.querySelector('#visual'),NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())if(walker.currentNode.textContent.includes('PRACTICE_REDACTED'))nodes.push(walker.currentNode);for(const node of nodes){const parts=node.textContent.split('PRACTICE_REDACTED');const span=document.createElement('span');span.append(parts[0]);parts.slice(1).forEach(part=>{const mask=document.createElement('span');mask.className='practice-mask';mask.textContent='Practice name';span.append(mask,part)});node.replaceWith(span)}
 document.querySelectorAll('.phone .chat').forEach(chat=>{const content=document.createElement('div');content.className='phone-content';while(chat.firstChild)content.appendChild(chat.firstChild);chat.appendChild(content);const available=chat.clientHeight-24;const scale=Math.min(1,available/content.scrollHeight);content.style.transform=`scale(${scale})`;});
 const body=document.querySelector('.stage-body');const inner=document.createElement('div');inner.className='video-inner';while(body.firstChild)inner.appendChild(body.firstChild);body.appendChild(inner);const scale=Math.min(1,514/inner.scrollHeight);inner.style.transform=`scale(${scale})`;if(scale<1)inner.style.marginLeft='0';
 });}
try{
 for(const [i,b] of todo.entries()){
  await page.evaluate(id=>FILM_DEBUG.go(id),b.id);
  // Honour the final agreement's PDF-signing method rather than the unresolved portal signature.
  if(b.id==='c4s4b2')await page.evaluate(()=>{document.querySelector('.portalbody').innerHTML='<h3>Sign your updated agreement</h3><p style="margin:18px 0">Lead Generation Services Agreement · version 0.2</p><div class="tickline"><span class="tick">✓</span>Every change is marked</div><div class="tickline"><span class="tick">1</span>Open and read the PDF</div><div class="tickline"><span class="tick">2</span>Sign the agreement</div><div class="tickline"><span class="tick">3</span>Return the signed PDF by email</div>';document.querySelector('.rail').innerHTML='<div class="card"><h3>Copies for both sides</h3><p>You and Lead Velocity keep the signed agreement.</p><span class="clause">24.1 · agreed signing method</span></div>'});
  if(b.id==='c4s6b1')await page.evaluate(()=>{const logo=document.querySelector('.mast .logo')?.src||document.querySelector('.logo')?.src;document.querySelector('#visual').innerHTML=`<div class="closing"><div><img class="closing-logo" src="${logo}" alt="Lead Velocity"><div class="eyebrow" style="margin-bottom:18px">For Mark Weston · FSP 28418</div><h1>Ready for<br><span class="gradient-text">your next<br>chapter, Mark.</span></h1><p>From the first enquiry to a confirmed appointment.<br>We look forward to working with you.</p></div><div class="closing-card"><h3>Let’s get you started.</h3><div class="closing-step"><b>01</b>Connect your calendar</div><div class="closing-step"><b>02</b>Complete your setup</div><div class="closing-step"><b>03</b>Pay your first cycle</div><p style="font-size:18px">Questions? WhatsApp us.</p><p class="closing-contact">howzit@leadvelocity.co.za</p></div></div>`});
  await prepare();await page.$eval('.stage',(el,file)=>{},'');
  await (await page.$('.stage')).screenshot({path:path.join(frames,`${b.id}-a.png`)});
  await page.evaluate(([id,defaultValue])=>{
   const click=value=>{const el=[...document.querySelectorAll('[data-option]')].find(el=>el.dataset.option===value);if(el)el.click()};
   if(id==='c1s3b2'){click('Life cover');click('Investments');click("I feel like I'm paying too much");document.querySelector('[data-continue]')?.click()}
   else if(defaultValue)click(defaultValue);
   if(id==='c4s3b1')click('Accept permissions');
  },[b.id,defaults[b.id]]);
  await page.evaluate(()=>{
   document.querySelectorAll('.result').forEach(el=>{el.textContent=el.textContent.replace('Answer saved in the demo. Tap Next to continue.','Answers saved ✓')});
   document.querySelectorAll('.phone .chat .phone-content').forEach(content=>{const available=content.parentElement.clientHeight-24;content.style.transform=`scale(${Math.min(1,available/content.scrollHeight)})`;});
   const inner=document.querySelector('.video-inner');inner.style.transform=`scale(${Math.min(1,514/inner.scrollHeight)})`;
  });
  await (await page.$('.stage')).screenshot({path:path.join(frames,`${b.id}-b.png`)});
  if(i%10===0)console.log(`screens ${i+1}/${beats.length}`);
 }
}finally{await browser.close()}
// Use the supplied thumbnail as the opening frame of the actual video.
if(todo.some(b=>b.id===beats[0].id))fs.copyFileSync(path.join(root,'thumb-1280x720.png'),path.join(frames,`${beats[0].id}-a.png`));
let cursor=0;const queue=[...todo];
await Promise.all(Array.from({length:4},async()=>{while(queue.length){const b=queue.shift(),dur=manifest[b.id].dur,first=b.id===beats[0].id?Math.min(2,dur*.28):+(dur*.28).toFixed(3);const filter=`[0:v]trim=duration=${first},setpts=PTS-STARTPTS[v0];[1:v]trim=duration=${(dur-first).toFixed(3)},setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0,fade=t=in:st=0:d=0.18:color=white,fade=t=out:st=${(dur-.18).toFixed(3)}:d=0.18:color=white[v]`;
 await run(['-y','-v','error','-loop','1','-framerate','25','-i',path.join(frames,`${b.id}-a.png`),'-loop','1','-framerate','25','-i',path.join(frames,`${b.id}-b.png`),'-i',path.join(root,'audio',`${b.id}.mp3`),'-filter_complex',filter,'-map','[v]','-map','2:a','-t',String(dur),'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','25','-c:a','aac','-b:a','96k','-ac','1',path.join(clips,`${b.id}.mp4`)]);
 if(++cursor%10===0)console.log(`rendered ${cursor}/${beats.length}`);
}}));
const list=path.join(out,'clips.ffconcat');fs.writeFileSync(list,'ffconcat version 1.0\n'+beats.map(b=>`file '${path.join(clips,`${b.id}.mp4`).replace(/\\/g,'/')}'`).join('\n'));
let offset=0,chapterMetadata=';FFMETADATA1\ntitle=Mark Weston — How your leads work\nartist=Lead Velocity\n',captions=[];
const stamp=t=>{const ms=Math.round(t*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`};
for(const c of script.chapters){const cb=beats.filter(b=>b.ch===c.id);const start=offset;for(const b of cb){const dur=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path.join(clips,`${b.id}.mp4`)],{encoding:'utf8'}));captions.push(`${captions.length+1}\n${stamp(offset)} --> ${stamp(offset+dur)}\n${b.caption}\n`);offset+=dur}chapterMetadata+=`[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(start*1000)}\nEND=${Math.round(offset*1000)}\ntitle=${c.title}\n`}
const meta=path.join(out,'chapters.ffmetadata');fs.writeFileSync(meta,chapterMetadata);fs.writeFileSync(path.join(out,'Mark-How-Your-Leads-Work.srt'),captions.join('\n'));
const master=path.join(out,'Mark-How-Your-Leads-Work-HD.mp4');
await run(['-y','-v','error','-f','concat','-safe','0','-i',list,'-f','ffmetadata','-i',meta,'-map','0:v','-map','0:a','-map_metadata','1','-map_chapters','1','-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac','-b:a','96k','-ac','1','-movflags','+faststart',master]);
const wa=path.join(out,'Mark-How-Your-Leads-Work-WhatsApp.mp4');
if(fs.statSync(master).size<=15500000)fs.copyFileSync(master,wa);
else await run(['-y','-v','error','-i',master,'-c:v','libx264','-preset','fast','-crf','28','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-ac','1','-movflags','+faststart',wa]);
if(fs.statSync(wa).size>15500000){const rate=Math.floor(14500000*8/offset/1000)-64;await run(['-y','-v','error','-i',master,'-c:v','libx264','-preset','slow','-b:v',`${rate}k`,'-maxrate',`${rate}k`,'-bufsize',`${rate*2}k`,'-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-ac','1','-movflags','+faststart',wa])}
// Embed the same artwork as MP4 cover art as well as the opening frame.
const covered=path.join(out,'covered.mp4');
await run(['-y','-v','error','-i',wa,'-i',path.join(root,'thumb-1280x720.png'),'-map','0','-map','1:v','-c','copy','-c:v:1','mjpeg','-disposition:v:1','attached_pic','-movflags','+faststart',covered]);
fs.renameSync(covered,wa);
console.log(JSON.stringify({duration:offset,master,masterBytes:fs.statSync(master).size,whatsApp:wa,whatsAppBytes:fs.statSync(wa).size},null,2));
