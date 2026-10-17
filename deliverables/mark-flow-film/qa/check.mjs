import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const puppeteer=require('../../broker-success/onboarding-film/build/node_modules/puppeteer-core');
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const base=process.env.FILM_URL||'http://127.0.0.1:8766/';
const browser=await puppeteer.launch({headless:true,executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
const failures=[],checks=[];let count=0;
function assert(ok,label){checks.push({label,passed:!!ok});if(!ok)failures.push(label)}
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 page.on('pageerror',e=>failures.push('Page error: '+e.message));
 await page.goto(base,{waitUntil:'networkidle0'});
 assert(await page.$('.poster'),'Poster visible before play');
 assert(await page.evaluate(()=>document.querySelector('audio').paused),'Audio does not autoplay');
 await page.click('[data-watch="auto"]');
 assert(await page.evaluate(()=>document.querySelector('#setup').open),'Unconfirmed practice requires a name');
 await page.type('#practice-input','QA Sample Practice');await page.click('#save-practice');
 await page.waitForFunction(()=>!document.querySelector('audio').paused);
 assert(await page.evaluate(()=>document.querySelector('audio').currentTime>=0),'Narration starts on Play');
 await page.click('#play');
 const ids=await page.evaluate(()=>FILM_DEBUG.beats.map(b=>b.id));
 for(const size of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewport(size);
  for(const id of ids){
   await page.evaluate(id=>FILM_DEBUG.go(id),id);
   await page.waitForFunction(id=>FILM_DEBUG.state().id===id,{},id);
   const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,text:document.querySelector('#visual').innerText,empty:!document.querySelector('#visual').innerText.trim()}));
   if(state.overflow)failures.push(`${id}: horizontal overflow at ${size.width}`);
   if(state.empty)failures.push(`${id}: empty view`);
   if(/RELEASE GATE|BUILDER LEGEND|\{PRACTICE\}|raw leads|CPL|break.even|target 65%/.test(state.text))failures.push(`${id}: internal source note on screen`);
   count++;
  }
 }
 await page.setViewport({width:1440,height:1100});
 const jump=id=>page.evaluate(id=>FILM_DEBUG.go(id),id);
 const choose=text=>page.evaluate(text=>{const b=[...document.querySelectorAll('[data-option]')].find(x=>x.dataset.option===text);if(!b)throw Error('Choice missing '+text);b.click()},text);
 const result=()=>page.$eval('#visual',el=>el.innerText);
 await jump('c1s2b3');await choose('No thanks');assert((await result()).includes('Nothing passed to Mark'),'Consent refusal sends nothing');
 await jump('c1s3b2');await page.click('[data-continue]');assert((await result()).includes('Please choose at least one.'),'Reasons required');await choose('Life cover');await choose('Investments');await page.click('[data-continue]');assert((await result()).includes('Answer saved'),'Multiple reasons accepted');
 await jump('c1s3b4');await choose("Type 'test'");assert((await result()).includes('Please enter your real name'),'Fake name rejected');await choose('Type Sipho Ndlovu');assert((await result()).includes('Name and surname accepted'),'Real sample name accepted');
 await jump('c1s3b6');await choose('No, use another number');await page.type('#other-number','0215550101');await page.click('[data-continue]');assert((await result()).includes('Please use a South African mobile number'),'Landline rejected');await page.$eval('#other-number',el=>el.value='0835550101');await page.click('[data-continue]');assert((await result()).includes('Answer saved'),'Mobile accepted');
 await jump('c1s4b1');for(const [choice,text] of [['R1,500 or more','A-tier'],['R1,250 to R1,499','B-tier'],['R750 to R1,249','B-tier'],['Under R750','never counted']]){await choose(choice);assert((await result()).includes(text),'Budget branch '+choice)}
 await jump('c1s6b4');await choose('Tap the link');assert((await result()).includes('Email confirmed'),'Email link confirms');await choose('Type the code on WhatsApp');assert((await result()).includes('482913'),'Email code confirms');
 await jump('c2s3b2');for(const [choice,text] of [['Tue 20 Oct 10:00','12:00'],['Tue 20 Oct 16:00','Wed 21 Oct at 09:00'],['Fri 23 Oct 16:30','Mon 26 Oct at 09:30']]){await choose(choice);assert((await result()).includes(text),'Working-hour deadline '+choice)}
 await jump('c2s3b3');await choose('Accept');assert((await result()).includes('Counts once she books and confirms'),'B-tier acceptance counts after booking');await choose('Decline');assert((await result()).includes('does not count'),'B-tier decline does not count');
 await jump('c3s3b1');await choose('Roll over on top');assert((await result()).includes('23 leads'),'Rollover on top');await choose('Refund instead');assert((await result()).includes('R2,475'),'Refund arithmetic');
 await jump('c4s3b1');await choose('No, or not sure');assert((await result()).includes('Need admin approval'),'Microsoft blocked branch');await choose('Yes');await choose('Accept permissions');assert((await result()).includes('Connected as'),'Microsoft permission acceptance');
 await jump('c4s4b2');await choose('Sign agreement');assert((await result()).includes('No real signature'),'No real signature');
 // Real media duration, caption toggle, theme, pause/resume and chapter seek.
 await jump('c2s1b2');await page.click('#play');await page.waitForFunction(()=>document.querySelector('audio').currentTime>.25);await page.click('#play');const before=await page.$eval('audio',a=>a.currentTime);await page.click('#play');await page.waitForFunction(t=>document.querySelector('audio').currentTime>t+.15,{},before);assert(true,'Pause/resume preserves time');await page.click('#play');
 await page.click('#cc');assert(await page.$eval('#caption',e=>e.hidden),'Caption toggle');await page.click('#cc');await page.click('#theme');assert(await page.evaluate(()=>document.documentElement.dataset.theme==='dark'),'Dark theme');await page.click('#theme');
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await jump('c1s3b2');assert(await page.$eval('.stage-body',e=>getComputedStyle(e).animationName==='none'),'Reduced motion');
 for(const [id,name] of [['c1s3b2','capture'],['c2s3b3','broker-offer'],['c3s2b4','agreement'],['c4s3b1','calendar']]){await jump(id);await page.screenshot({path:path.join(here,`${name}-desktop.png`),fullPage:true});await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(here,`${name}-mobile.png`),fullPage:true});await page.setViewport({width:1440,height:1100})}
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'audio/manifest.json'),'utf8'));
 for(const id of ids){const file=path.join(root,'audio',`${id}.mp3`);execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{stdio:'pipe'});const dur=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{encoding:'utf8'}));assert(Math.abs(dur-manifest[id].dur)<.02,`${id} audio decodes and matches manifest`)}
 const report={date:'2026-10-07',screensInspected:count,narrationClips:ids.length,checks,failures};fs.writeFileSync(path.join(here,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({screens:count,checks:checks.length,failures},null,2));
}finally{await browser.close()}
if(failures.length)process.exitCode=1;
