// Isolated browser tests: no requests or user writes reach production.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
const defaults=['home','schedule','todos','habits','records','work','timer','together','community','all'];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const rows=new Map(),writes=[],errors=[];let fail=false,writeDelay=0,readDelay=0;
  rows.set('alice',{user_id:'alice',app_symbol:'check',day_start_minute:420,day_end_minute:1380,default_tag_color:'#123456'});
  async function fixture(viewport={width:1440,height:900}){
   const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
   await page.exposeFunction('navigationQuery',async({table,op,value,userId,single,columns})=>{
    if(table!=='tok_settings')return {data:single?null:[],error:null};
    if(op==='upsert'){
     const ms=writeDelay;writeDelay=0;await new Promise(r=>setTimeout(r,ms));
     if(fail){fail=false;return {data:null,error:{message:'test failure'}};}
     const row={day_start_minute:360,day_end_minute:1440,...rows.get(value.user_id),...value};rows.set(value.user_id,row);writes.push(value);return {data:row,error:null};
    }
    const snapshot=JSON.parse(JSON.stringify(rows.get(userId)||null));
    const ms=columns?.includes('navigation_config')?readDelay:0;if(ms)readDelay=0;
    await new Promise(r=>setTimeout(r,ms));return {data:single?snapshot:snapshot?[snapshot]:[],error:null};
   });
   await page.route('**/*',route=>{
    const url=route.request().url();if(url==='http://navigation.test/')return route.fulfill({contentType:'text/html',body:html});
    const asset=url.match(/\/assets\/([\w-]+\.(js|css))$/);if(asset)return route.fulfill({contentType:asset[1].endsWith('.js')?'application/javascript':'text/css',body:fs.readFileSync('assets/'+asset[1])});
    return route.fulfill({body:'',status:200});
   });
   await page.addInitScript(()=>{
    let user={id:'alice',email:'test@example.invalid'},callback;
    window.navigationUser=id=>{user=id?{id,email:'test@example.invalid'}:null;callback?.(id?'SIGNED_IN':'SIGNED_OUT',user?{user}:null);};
    window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:user?{user}:null}}),getUser:async()=>({data:{user}}),onAuthStateChange:fn=>{callback=fn;}},from(table){let op='select',value,columns,userId=user?.id,single=false;
     const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>window.navigationQuery({table,op,value,userId,single,columns}).then(resolve);return(...args)=>{if(key==='upsert'){op=key;value=args[0];}if(key==='select')columns=args[0];if(key==='eq'&&args[0]==='user_id')userId=args[1];if(key==='single'||key==='maybeSingle')single=true;return q;};}});return q;}})};
   });
   await page.goto('http://navigation.test/');await page.locator('#app').waitFor({state:'visible'});await ready(page);return page;
  }
  const ready=p=>p.waitForFunction(()=>!document.querySelector('.navigation-setting-row input').disabled);
  const primary=p=>p.locator('.bottombar [data-page]').evaluateAll(es=>es.map(e=>e.dataset.page));
  const more=p=>p.locator('#navMoreSheet [data-page]').evaluateAll(es=>es.map(e=>e.dataset.page));
  const row=(p,id)=>p.locator('[data-navigation-id='+id+']');
  const saveDone=p=>p.waitForFunction(()=>document.getElementById('navigationSettings').getAttribute('aria-busy')!=='true');
  const page=await fixture();assert.deepEqual(await primary(page),defaults.slice(0,5));assert.deepEqual(await more(page),[...defaults.slice(5),'settings']);
  assert.deepEqual(await page.locator('#todoIconRail [data-page]').evaluateAll(es=>es.map(e=>e.dataset.page)),defaults.slice(0,5));
  await page.locator('#sidebarRailMore').click();await page.locator('#sidebarRailMoreMenu [data-page=settings]').click();assert.equal(await page.evaluate(()=>currentPage),'settings');
  // Pointer drag across the fifth-menu boundary; keyboard reordering remains available.
  const start=await row(page,'home').locator('button').boundingBox(),end=await row(page,'records').boundingBox();
  await page.mouse.move(start.x+20,start.y+20);await page.mouse.down();await page.mouse.move(end.x+20,end.y+end.height/2,{steps:12});await page.mouse.up();await saveDone(page);
  assert.deepEqual(await primary(page),['schedule','todos','habits','records','home']);assert.equal(writes.length,1);
  await row(page,'home').locator('button').focus();await page.keyboard.press('ArrowDown');await saveDone(page);
  assert.deepEqual(await primary(page),['schedule','todos','habits','records','work']);assert.equal((await more(page))[0],'home');
  await row(page,'habits').locator('input').uncheck();await saveDone(page);
  assert(!(await primary(page)).includes('habits'));assert(!(await more(page)).includes('habits'));
  assert.equal(rows.get('alice').app_symbol,'check');assert.equal(rows.get('alice').day_start_minute,420);assert.equal(rows.get('alice').default_tag_color,'#123456');
  assert(writes.every(w=>Object.keys(w).sort().join(',')==='navigation_config,user_id'));
  assert.equal(await page.locator('#navigationSettingsRows [data-navigation-id=settings]').count(),0);
  const confirmed=await primary(page);fail=true;writeDelay=100;await row(page,'records').locator('input').click();await saveDone(page);assert.deepEqual(await primary(page),confirmed);assert.match(await page.locator('#navigationSettingsStatus').textContent(),/저장하지 못/);
  await page.reload();await ready(page);assert.deepEqual(await primary(page),confirmed);
  const mobile=await fixture({width:390,height:844});assert.deepEqual(await primary(mobile),confirmed);
  await mobile.evaluate(()=>showPage('settings'));
  // Actual touch drag, including a hidden menu row.
  await row(mobile,'schedule').scrollIntoViewIfNeeded();const a=await row(mobile,'schedule').locator('button').boundingBox(),b=await row(mobile,'todos').boundingBox();
  const cdp=await mobile.context().newCDPSession(mobile);const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  await touch('touchStart',a.x+20,a.y+20);await touch('touchMove',b.x+20,b.y+b.height/2);await touch('touchEnd');await saveDone(mobile);assert.equal((await primary(mobile))[0],'todos');
  // Cancelled drags never write.
  await mobile.setViewportSize({width:1440,height:900});await row(mobile,'todos').scrollIntoViewIfNeeded();const handle=await row(mobile,'todos').locator('button').boundingBox();const before=writes.length;
  await mobile.mouse.move(handle.x+20,handle.y+20);await mobile.mouse.down();await mobile.mouse.move(handle.x+20,handle.y+90);await mobile.keyboard.press('Escape');await mobile.mouse.up();assert.equal(writes.length,before);
  // Remote persisted visibility changes while another page is open safely return home.
  await page.evaluate(()=>showPage('schedule'));rows.get('alice').navigation_config.hidden.push('schedule');await page.evaluate(()=>navigationSettings.load());assert.equal(await page.evaluate(()=>currentPage),'home');
  // Account switch / stale requests / logout cannot leak another account's preferences.
  rows.set('bob',{user_id:'bob',navigation_config:{version:1,order:['together','community','home','schedule','todos'],hidden:['settings','unknown','all']}});
  readDelay=180;await page.evaluate(()=>{void navigationSettings.load();navigationUser('bob');});await ready(page);await page.waitForTimeout(220);
  assert.deepEqual(await primary(page),['together','community','home','schedule','todos']);assert.equal((await more(page)).at(-1),'settings');assert(!(await more(page)).includes('all'));
  await page.evaluate(()=>{$('app').style.display='block';showPage('settings');});writeDelay=180;await row(page,'community').locator('input').uncheck();await page.evaluate(()=>navigationUser('alice'));await ready(page);await page.waitForTimeout(220);assert(!(await primary(page)).includes('community'));
  // A stale read cannot overwrite a newer successful save.
  await page.evaluate(()=>showPage('settings'));readDelay=180;await page.evaluate(()=>{void navigationSettings.load();});await row(page,'all').locator('input').uncheck();await saveDone(page);await page.waitForTimeout(220);assert(!(await more(page)).includes('all'));
  await page.evaluate(()=>navigationUser(null));assert.equal(await page.locator('#app').isVisible(),false);assert.deepEqual(await primary(page),defaults.slice(0,5));
  await page.evaluate(()=>navigationUser('bob'));await ready(page);await page.evaluate(()=>{$('app').style.display='block';$('authBox').style.display='none';showPage('home');});await page.setViewportSize({width:390,height:844});rows.get('bob').navigation_config={version:1,order:['together','community','home','schedule','todos',...defaults.filter(id=>!['together','community','home','schedule','todos'].includes(id))],hidden:[]};await page.evaluate(()=>navigationSettings.load());
  const metrics=await page.locator('.bottombar .navitem').evaluateAll(es=>es.map(e=>({width:e.clientWidth,scroll:e.scrollWidth,label:e.querySelector('span')?.getBoundingClientRect().width||0,height:e.querySelector('span')?.getBoundingClientRect().height||0})));assert.equal(metrics.length,6);assert(metrics.every(r=>r.scroll<=r.width&&r.label<=r.width&&r.height<20));
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/navigation-390.png'});
  // All hidden, including home: settings remains available, no feature is removed.
  rows.get('bob').navigation_config={version:1,order:defaults,hidden:defaults};await page.evaluate(()=>navigationSettings.load());assert.deepEqual(await primary(page),[]);assert.deepEqual(await more(page),['settings']);
  await page.locator('#navMoreBtn').click();await page.locator('#navMoreSheet [data-page=settings]').click();assert.equal(await page.evaluate(()=>currentPage),'settings');assert.equal(await page.locator('.page').count(),11);
  await page.setViewportSize({width:1440,height:900});await page.locator('#navigationSettings').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/navigation-settings.png'});
  assert.deepEqual(errors,[]);console.log('PASS: defaults, desktop/mobile shared registry, pointer/touch/keyboard reorder, hidden/current/all-hidden, settings safety, partial cloud writes, reload, account isolation, stale requests, rollback, Escape, 390px six slots.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

