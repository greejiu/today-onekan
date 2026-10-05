// Production requests are blocked by the shared fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
(async()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync('assets/release-policy.js','utf8'),context);const policy=context.window.OnekanRelease;
 assert(!policy.canOpen('timer'));assert(policy.canOpen('home'));assert(!policy.canOpen('unknown'));
 let resolve;const delayed={auth:{getUser:()=>new Promise(r=>resolve=r)}};
 const old=policy.verify(delayed,'owner');policy.bind('normal');resolve({data:{user:{id:'owner',app_metadata:{today_onekan_operator:true}}}});await old;assert(!policy.isOperator());
 await policy.verify({auth:{getUser:async()=>({data:{user:{id:'normal',user_metadata:{today_onekan_operator:true}}}})}},'normal');assert(!policy.isOperator());
 await policy.verify({auth:{getUser:async()=>({data:{user:{id:'normal',app_metadata:{today_onekan_operator:true}}}})}},'normal');assert(policy.canOpen('timer'));policy.setPreview(true);assert(!policy.canOpen('timer'));policy.bind(null);assert(!policy.isOperator());
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
  await page.evaluate(async()=>{window.calls=[];sb.rpc=async name=>{calls.push(name);return {data:null,error:null};};sb.auth.getUser=async()=>({data:{user:{id:'test',email:'test@example.invalid',user_metadata:{today_onekan_operator:true}}}});await OnekanRelease.verify(sb,'test');});
  assert.deepEqual(await page.locator('.bottombar [data-page]').evaluateAll(es=>es.map(e=>e.dataset.page)),['home']);
  assert.deepEqual(await page.locator('#navMoreSheet [data-page]').evaluateAll(es=>es.map(e=>e.dataset.page)),['settings']);
  await page.evaluate(async()=>{mockRows.tok_settings=[{user_id:'test',navigation_config:{version:1,order:['timer','work','home'],hidden:['home','records']}}];await navigationSettings.load();});
  assert.deepEqual(await page.locator('.bottombar [data-page]').evaluateAll(es=>es.map(e=>e.dataset.page)),['home']);assert.deepEqual(await page.evaluate(()=>mockRows.tok_settings[0].navigation_config.hidden),['home','records']);
  for(const target of ['schedule','todos','habits','timer','records','all','work','together','community']){await page.evaluate(target=>showPage(target),target);assert.equal(await page.evaluate(()=>currentPage),'home');}
  await page.evaluate(async()=>{await tracking.start('todo');await tracking.refresh();await tracking.select('stats');});assert.deepEqual(await page.evaluate(()=>calls),[]);
  await page.evaluate(()=>showPage('settings'));assert(await page.locator('[data-navigation-id="timer"] input').isDisabled());assert.match(await page.locator('[data-navigation-id="timer"]').innerText(),/아직 준비 중이에요/);assert(await page.getByRole('button',{name:'로그아웃',exact:true}).last().isVisible());
  await page.evaluate(()=>{showPage('home');openTodoSheet();});await page.fill('#td_title','베타 할일');await page.locator('#todoForm').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>mockRows.tok_todos.length===1);
  await page.evaluate(async()=>{await setTodoDone(mockRows.tok_todos[0].id,true);});assert(await page.evaluate(()=>mockRows.tok_todos[0].is_done));
  const labels=await page.evaluate(()=>itemMenuModel('todo',todos[0].id,todayStr()).entries.map(e=>e.label));assert(!labels.includes('타이머 시작'));assert(labels.includes('수정'));
  for(const [kind,title,save,table] of [['event','cev_title','cev_save','tok_events'],['habit','ha_name','ha_save','tok_habits']]){await page.evaluate(kind=>openAddWindowFor(kind),kind);await page.fill('#'+title,'베타 '+kind);await page.click('#'+save);await page.waitForFunction(table=>mockRows[table].length===1,table);}
  assert(await page.evaluate(()=>events.some(e=>e.title==='베타 event')&&tasks.some(h=>h.name==='베타 habit')));
  await page.evaluate(()=>{mockRows.tok_projects=[{id:'kept-project',name:'기존 프로젝트'}];});await page.evaluate(()=>loadAll());await page.evaluate(()=>{openTodoSheet({...todos[0],project_id:'kept-project'});});assert(await page.locator('#td_project_wrap').isHidden());assert.equal(await page.locator('#td_project').inputValue(),'kept-project');await page.fill('#td_title','연결 보존');await page.locator('#todoForm').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>mockRows.tok_todos[0].title==='연결 보존');assert.equal(await page.evaluate(()=>mockRows.tok_todos[0].project_id),'kept-project');
  await page.evaluate(async()=>{OnekanRelease.bind(null);bindAppSymbolUser(null);OnekanRelease.bind('test');bindAppSymbolUser('test');await boot();});assert(await page.evaluate(()=>todos.some(t=>t.title==='연결 보존'&&t.is_done)));
  await page.evaluate(async()=>{sb.auth.getUser=async()=>({data:{user:{id:'test',app_metadata:{today_onekan_operator:true}}}});await OnekanRelease.verify(sb,'test');showPage('timer');});assert.equal(await page.evaluate(()=>currentPage),'timer');
  const writes=await page.evaluate(()=>mockWrites.length);await page.evaluate(()=>OnekanRelease.setPreview(true));assert.equal(await page.evaluate(()=>currentPage),'home');assert.equal(await page.evaluate(()=>mockWrites.length),writes);assert.equal(await page.locator('#betaPreviewButton').getAttribute('hidden'),null);
  await page.setViewportSize({width:390,height:844});const bounds=await page.locator('.bottombar').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert(bounds.scroll<=bounds.width);
  await page.evaluate(()=>OnekanRelease.setPreview(false));await page.evaluate(()=>{recovery.onEvent('PASSWORD_RECOVERY',{user:{id:'test'}});});await page.waitForSelector('#recoveryUpdate:not([hidden])');await page.evaluate(()=>boot());assert(await page.locator('#passwordRecoveryBox').isVisible());assert(await page.locator('#app').isHidden());assert.deepEqual(errors,[]);
  console.log('PASS release roles, stale identity, preview, desktop/mobile routes, disabled settings, tracking guard, home add/complete/reload, recovery boot ownership');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
