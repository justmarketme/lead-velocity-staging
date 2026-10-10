(function(){
var K='smc_ads_off',st=document.getElementById('ads-state'),off=document.getElementById('ads-off-btn'),on=document.getElementById('ads-on-link');
function get(){try{return window.localStorage.getItem(K)==='1'}catch(e){return false}}
function set(v){
 // Prefer the shared pixel.js switch when it is loaded; otherwise store the same first-party flag it reads.
 if(window.smc&&typeof window.smc[v?'adsOff':'adsOn']==='function'){window.smc[v?'adsOff':'adsOn']();return}
 try{if(v)window.localStorage.setItem(K,'1');else window.localStorage.removeItem(K)}catch(e){}
}
function show(){var o=get();st.textContent=o?'Ad measurement is OFF for this browser.':'Ad measurement is ON for this browser.';off.hidden=o;on.hidden=!o;}
off.addEventListener('click',function(){set(true);show()});
on.addEventListener('click',function(e){e.preventDefault();set(false);show()});
show();
})();
