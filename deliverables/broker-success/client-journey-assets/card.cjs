const { chromium } = require('/opt/node-tools/node_modules/playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1200,height:628}});
const d={layout:'wide',adviser:'Your Name',practice:'Your Practice',fsp:'00000 (SAMPLE)',sample:true,bio:'I help young families and first-time home owners understand their cover.',languages_line:'Speaks English and isiZulu',method_line:'30-min WhatsApp, phone or Teams call · No obligation'};
await p.goto('file://'+process.cwd()+'/brand/templates/intro-card.html?d='+encodeURIComponent(JSON.stringify(d)));
await p.waitForTimeout(500);await p.screenshot({path:process.argv[2]+'/intro-card.png'});await b.close();})();
