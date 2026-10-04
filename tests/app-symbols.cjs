// Run with Playwright available on NODE_PATH. All application network requests are intercepted.
const fs=require('node:fs');const assert=require('node:assert/strict');const {chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8');new(require('node:vm').Script)(html.match(/<script>([\s\S]*)<\/script>/)[1]);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const rows=new Map(),writes=[];let fail=false,delay=0,readDelay=0;
 await page.exposeFunction('settingsQuery',async({table,op,value,userId})=>{
  if(table!=='tok_settings')return {data:[],error:null};
  if(op==='upsert'){
   const ms=delay;delay=0;await new Promise(r=>setTimeout(r,ms));
   if(fail){fail=false;return {data:null,error:{message:'test write failure'}};}
   const row={day_start_minute:360,day_end_minute:1440,...rows.get(value.user_id),...value};rows.set(value.user_id,row);writes.push(value);return {data:row,error:null};
  }
  const row=rows.get(userId)||null;const ms=readDelay;readDelay=0;await new Promise(r=>setTimeout(r,ms));return {data:row,error:null};
 });
 await page.route('**/*',r=>r.request().url()==='http://symbols.test/'?r.fulfill({contentType:'text/html',body:html}):['classification.js','schedule-views.js','item-views.js','todo-views.js','habit-views.js','calendar-ui.js','all-views.js'].some(f=>r.request().url().endsWith('/assets/'+f))?r.fulfill({contentType:'application/javascript',body:fs.readFileSync('assets/'+r.request().url().split('/').pop(),'utf8')}):r.fulfill({body:'',status:200}));
 await page.addInitScript(()=>{
  let user={id:localStorage.getItem('test_user')||'alice',email:'test@example.invalid'},callback;
  window.changeSymbolUser=id=>{user=id?{id,email:'test@example.invalid'}:null;localStorage.setItem('test_user',id||'');callback?.(id?'SIGNED_IN':'SIGNED_OUT',user?{user}:null);};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:user?{user}:null}}),getUser:async()=>({data:{user}}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}};}},from(table){let op='select',value,queryUser=user?.id;
   const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>window.settingsQuery({table,op,value,userId:queryUser}).then(resolve);return(...args)=>{if(key==='upsert'){op=key;value=args[0];}if(key==='eq'&&args[0]==='user_id')queryUser=args[1];return q;};}});return q;}})};
 });
 await page.goto('http://symbols.test/');await page.waitForFunction(()=>appSymbolReady);await page.waitForSelector('.upcoming-day');await page.evaluate(()=>showPage('settings'));
 assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'hankan');
 const select=async id=>{await page.locator(`.symbol-option:has(input[value="${id}"]) .symbol-option-body`).click();await page.waitForFunction(()=>!appSymbolBusy);};
 for(const id of ['cheese','step','check','hankan']){delay=100;await page.locator(`.symbol-option:has(input[value="${id}"]) .symbol-option-body`).click();assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),id);await page.waitForFunction(()=>!appSymbolBusy);await page.reload();await page.waitForFunction(()=>appSymbolReady);await page.waitForSelector('.upcoming-day');assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),id);await page.evaluate(()=>showPage('settings'));}
 assert(writes.every(w=>Object.keys(w).sort().join(',')==='app_symbol,user_id'));
 await page.locator('input[value="hankan"][name="app-symbol"]').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>!appSymbolBusy);assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'cheese');await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>!appSymbolBusy);assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'step');
 fail=true;await select('check');assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'step');assert.match(await page.locator('#appSymbolStatus').textContent(),/저장하지 못/);
 rows.set('bob',{user_id:'bob',app_symbol:'unknown'});await page.evaluate(()=>changeSymbolUser('bob'));await page.waitForFunction(()=>appSymbolReady);assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'hankan');
 await select('check');assert.equal(rows.get('alice').app_symbol,'step');assert.equal(rows.get('bob').app_symbol,'check');
 await page.evaluate(()=>changeSymbolUser('alice'));await page.waitForFunction(()=>appSymbolReady);assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'step');
 delay=180;await page.locator('.symbol-option:has(input[value="check"]) .symbol-option-body').click();await page.evaluate(()=>changeSymbolUser('bob'));await page.waitForFunction(()=>appSymbolReady);await page.waitForTimeout(250);assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'check');
 // A stale read must not override a newer choice.
 readDelay=180;await page.evaluate(()=>{loadAppSymbolPreference();});await select('step');await page.waitForTimeout(250);assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'step');
 await page.evaluate(()=>changeSymbolUser(null));assert.equal(await page.locator('#appBrandSymbol').getAttribute('data-symbol'),'hankan');assert.equal(await page.locator('#app').isVisible(),false);
 await page.evaluate(()=>changeSymbolUser('alice'));await page.waitForFunction(()=>appSymbolReady);await page.evaluate(()=>{$('app').style.display='block';$('authBox').style.display='none';showPage('settings');});
 const contrast=(a,b)=>{const lum=v=>{const c=v.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};let x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 fs.mkdirSync('test-results',{recursive:true});
 for(const theme of ['white','black','sky','purple','pink','cheese']){
  await page.evaluate(theme=>applyTheme(theme),theme);const colors=await page.evaluate(()=>({fg:getComputedStyle($('appBrandSymbol')).color,bg:getComputedStyle(document.querySelector('.topbar')).backgroundColor}));assert(contrast(colors.fg,colors.bg)>=3,theme);
  await page.locator('.symbol-picker').screenshot({path:`test-results/symbols-${theme}.png`});
 }
 for(const width of [390,320]){await page.setViewportSize({width,height:844});const bounds=await page.locator('.symbol-grid').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,items:[...e.children].map(n=>n.getBoundingClientRect().right)}));assert(bounds.scroll<=bounds.width);assert(bounds.items.every(x=>x<=width));await page.locator('.symbol-picker').screenshot({path:`test-results/symbols-${width}.png`});}
 assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'assets/symbol-hankan.svg?v=20261003');
 const favicon=fs.readFileSync('assets/symbol-hankan.svg','utf8').match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
 assert.equal(favicon,html.match(/<symbol id="symbol-hankan"[^>]*>([\s\S]*?)<\/symbol>/)[1]);
 assert.deepEqual(errors,[]);console.log('PASS: all four symbols, immediate rendering, reload, default/unknown, account isolation, stale requests, failure rollback, keyboard, six themes (contrast >=3), mobile grid, fixed favicon matches symbol 1.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
