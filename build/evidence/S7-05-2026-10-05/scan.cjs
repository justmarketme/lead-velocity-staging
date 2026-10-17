const path=require('path'),fs=require('fs');
const pw=require(process.env.PLAYWRIGHT_PATH);
const axeSrc=fs.readFileSync(path.join(__dirname,'axe/node_modules/axe-core/axe.min.js'),'utf8');
const serve=require('./serve.cjs');
const repo='C:/Users/Jono/lead-velocity-sortmycover';
const only=process.argv[2];
const tags=['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'];
const noAnim='*,*::before,*::after{animation:none!important;transition:none!important}';
const uid='00000000-0000-4000-8000-000000000001';
const broker={id:'00000000-0000-4000-8000-0000000000b1',user_id:uid,firm_name:'Test Practice',contact_person:'Test Broker',phone_number:'+27600000099',email:'test@example.invalid',whatsapp_number:'27600000099',status:'active',brand_id:'00000000-0000-4000-8000-0000000000a1',tier_code:'T1',ref_code:'TEST',fsp_number:'00000',fsp_verified_at:null,fsp_check:null,calendar_provider:'microsoft',ms_tenant_id:null,calendar_email:null,methods_supported:['phone'],meeting_hours:{},timezone:'Africa/Johannesburg',slot_minutes:30,buffer_minutes:15,min_notice_hours:4,horizon_days:14,max_meetings_per_day:4,max_meetings_per_week:12,bookings_paused:false,routing_on:false,headshot_url:null,bio_short:null,languages:['en'],years_advising:null,intro_card_url:null,intro_voice_url:null,intro_video_url:null,intro_media_pref:null,consent_mode:'generic',onboarding_step:'calendar',onboarding_progress:{},explainer_watched_at:null,approved_live_at:null,status_changed_at:null,card_autorenew:false,close_rate:null,avg_commission_zar:null,current_cycle_id:null,active:true,first_login_at:null,last_seen_at:null,onboarding_completed_at:null,onboarding_last_progress_at:null,practice_legal_name:null,signatory_name:null,signatory_role:null,fb_page_name:null,fb_page_id:null,calendar_mode:null,calendar_status:null,calendar_connected_at:null,next_free_slot_at:null,billing_ref:null,next_tier_code:null};
const user={id:uid,aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T00:00:00Z'};
const session={access_token:'x.eyJleHAiOjQxMDI0NDQ4MDB9.x',token_type:'bearer',expires_in:3600,expires_at:4102444800,refresh_token:'r',user};
async function mockSupabase(page){
 await page.route('http://127.0.0.1:54321/**',async r=>{const u=new URL(r.request().url());const p=u.pathname;const obj=(r.request().headers()['accept']||'').includes('vnd.pgrst.object');
  const j=(b,s=200)=>r.fulfill({status:s,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:JSON.stringify(b)});
  if(r.request().method()==='OPTIONS')return j({});
  if(p.startsWith('/auth/v1/user'))return j(user);
  if(p.startsWith('/auth/v1/'))return j(session);
  if(p==='/rest/v1/rpc/has_role')return j(true);
  if(p.startsWith('/rest/v1/brokers'))return j(obj?broker:[broker]);
  if(p.startsWith('/rest/v1/pricing'))return j(obj?{tier_code:'T1',leads_per_cycle:10,price_zar:3500}:[{tier_code:'T1',leads_per_cycle:10,price_zar:3500}]);
  if(p.startsWith('/rest/v1/rpc/'))return j(null);
  return j(obj?null:[]);});
 await page.addInitScript(s=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(s));},session);
}
(async()=>{
 const S=[await serve(repo+'/landing/dist',5601),await serve(repo+'/landing/holding',5602),await serve(repo,5603),await serve(path.join(__dirname,'appdist'),5604,true)];
 const pages=[];
 for(const d of fs.readdirSync(repo+'/landing/dist')){if(fs.existsSync(`${repo}/landing/dist/${d}/index.html`)){pages.push(['landing',`http://127.0.0.1:5601/${d}/`]);if(fs.existsSync(`${repo}/landing/dist/${d}/thanks/index.html`))pages.push(['landing',`http://127.0.0.1:5601/${d}/thanks/`]);}}
 for(const f of fs.readdirSync(repo+'/landing/holding').filter(f=>f.endsWith('.html')))pages.push(['holding',`http://127.0.0.1:5602/${f}`]);
 for(const f of fs.readdirSync(repo+'/landing/holding/learn').filter(f=>f.endsWith('.html')))pages.push(['holding',`http://127.0.0.1:5602/learn/${f}`]);
 for(const f of fs.readdirSync(repo+'/portal/prototype').filter(f=>f.endsWith('.html')))pages.push(['prototype',`http://127.0.0.1:5603/portal/prototype/${f}`]);
 for(const f of fs.readdirSync(repo+'/portal/intro-media').filter(f=>f.endsWith('.html')))pages.push(['intro-media',`http://127.0.0.1:5603/portal/intro-media/${f}`]);
 pages.push(['console-mock','http://127.0.0.1:5603/deliverables/console/pulse-mock.html']);
 for(const r of ['start','leads','calendar','reports','profile','intro-card','intro-media','agreement','billing','help'])pages.push(['portal',`http://127.0.0.1:5604/broker/${r}`]);
 for(const r of ['','/ads','/ask','/payments'])pages.push(['console',`http://127.0.0.1:5604/console${r}`]);
 const b=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const results=[];
 for(const [surface,url] of pages){ if(only&&surface!==only)continue;
  for(const scheme of ['light','dark']){
   const ctx=await b.newContext({colorScheme:scheme,reducedMotion:'reduce',viewport:{width:+(process.env.VW||390),height:900}});
   const pg=await ctx.newPage(); if(surface==='portal'||surface==='console')await mockSupabase(pg);
   const errs=[];pg.on('pageerror',e=>errs.push(String(e.message).slice(0,160)));
   try{await pg.goto(url,{waitUntil:'networkidle',timeout:30000});}catch(e){errs.push('goto '+e.message.slice(0,80))}
   await pg.addStyleTag({content:noAnim}).catch(()=>{});await pg.waitForTimeout(surface==='portal'||surface==='console'?1500:300);
   await pg.addScriptTag({content:axeSrc});
   const v=await pg.evaluate(async t=>{const r=await axe.run(document,{runOnly:t,resultTypes:['violations']});return {url:location.pathname,title:document.title,h1:(document.querySelector('h1')||{}).textContent,v:r.violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.map(n=>({t:n.target.join(' '),s:n.failureSummary.split('\n').slice(1,2).join(' ').slice(0,200),html:n.html.slice(0,160)}))}))}},tags);
   results.push({surface,scheme,url,...v,errs});
   process.stdout.write(`${surface} ${scheme} ${url.replace(/http:\/\/127.0.0.1:\d+/,'')} -> ${v.v.reduce((a,x)=>a+x.nodes.length,0)} [${v.v.map(x=>x.id+':'+x.nodes.length).join(',')}] h1="${(v.h1||'').trim().slice(0,40)}"${errs.length?' ERR '+errs[0]:''}\n`);
   await ctx.close();}}
 fs.writeFileSync(path.join(__dirname,`scan-${only||'all'}-${process.env.VW||390}.json`),JSON.stringify(results,null,1));
 await b.close();S.forEach(s=>s.close());})();
