const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await fixture(p);
  await p.evaluate(async()=>{
   const d=todayStr();mockRows.tok_item_groups=[{id:'g1',kind:'todo',name:'기존 분류',color:'#4677aa'}];
   mockRows.tok_projects=[{id:'p1',user_id:'test',name:'첫 프로젝트',lifecycle_state:'active',is_archived:false},{id:'p2',user_id:'test',name:'둘째 프로젝트',lifecycle_state:'active',is_archived:false}];mockRows.tok_identities=[];
   mockRows.tok_todos=[{id:'task',user_id:'test',title:'프로젝트로 옮길 할일',group_id:'g1',tag_id:'tag',project_id:'p1',repeat_unit:'day',repeat_interval:1,end_date:addDaysStr(d,30),is_done:false,...OnekanPeriod.patch('todo',{allDay:true,startDate:d,endDate:d})}];
   await loadAll();showPage('todos');todoViews.selectDate(d);mockWrites.length=0;
  });
  assert(await p.locator('#todoIconRail').isVisible());assert.equal(await p.locator('#sidebarPageTitle').isVisible(),false);assert(await p.locator('.page[data-page=todos] .page-title').isVisible());
  assert.equal(await p.locator('#todoIconRail [aria-current=page]').getAttribute('data-page'),'todos');
  const initial=await p.evaluate(()=>({...mockRows.tok_todos[0]}));
  const get=()=>p.evaluate(()=>({...mockRows.tok_todos[0]}));
  const drop=async(mode,id,cancel=false)=>{
   await p.locator(mode==='calendar'?'#todoTopTabs [data-common-view=month]':'#todoTopTabs [data-tab='+mode+']').click();

   const selector=mode==='calendar'?'#todoCalGrid [data-menu-id=task]':mode==='board'?'#todoBoard [data-menu-id=task]':'#todoUnifiedList [data-menu-id=task]';
   const card=p.locator(selector).first();await card.scrollIntoViewIfNeeded();
   const a=await card.boundingBox(),target=p.locator('#classificationSideHost [data-project-select='+id+']');await target.scrollIntoViewIfNeeded();const b=await target.boundingBox();
   await p.mouse.move(a.x+a.width*.55,a.y+a.height*.4);await p.mouse.down();await p.mouse.move(b.x+b.width*.5,b.y+b.height*.5,{steps:12});
   if(id!=='all')assert(await p.locator('.todo-group-target').count());
   if(cancel)await p.keyboard.press('Escape');await p.mouse.up();
  };
  await drop('list','p2');await p.waitForFunction(()=>mockRows.tok_todos[0].project_id==='p2');assert.deepEqual(await get(),{...initial,project_id:'p2'});
  await p.waitForFunction(()=>document.getElementById('todoGroupMoveStatus').textContent.includes('옮겼어요'));
  await drop('board','none');await p.waitForFunction(()=>mockRows.tok_todos[0].project_id===null);assert.deepEqual(await get(),{...initial,project_id:null});
  await p.waitForFunction(()=>document.getElementById('todoGroupMoveStatus').textContent.includes('옮겼어요'));
  await drop('calendar','p1');await p.waitForFunction(()=>mockRows.tok_todos[0].project_id==='p1');assert.deepEqual(await get(),initial);
  await p.waitForFunction(()=>document.getElementById('todoGroupMoveStatus').textContent.includes('옮겼어요'));
  let before=await p.evaluate(()=>mockWrites.length);await drop('list','p2',true);assert.equal(await p.evaluate(()=>mockWrites.length),before);assert.equal((await get()).project_id,'p1');
  await drop('list','all');assert.equal(await p.evaluate(()=>mockWrites.length),before);
  await p.evaluate(()=>mockFailure='test save failure');await drop('list','p2');await p.waitForFunction(()=>document.getElementById('todoGroupMoveStatus').textContent.includes('옮기지 못했어요'));assert.deepEqual(await get(),initial);
  await p.locator('#sidebarRailToggle').click();assert.equal(await p.locator('#todoIconRail').isVisible(),true);assert.equal(await p.evaluate(()=>currentPage),'todos');
  await p.locator('#todoIconRail [data-page=todos]').click();assert(await p.locator('#todoIconRail').isVisible());
  await p.locator('#todoIconRail [data-page=all]').click();assert.equal(await p.evaluate(()=>currentPage),'all'); /* 2026-10-10 일정 메뉴 = 통합 화면 */assert.equal(await p.locator('#todoIconRail').isVisible(),true);
  await p.evaluate(()=>showPage('home'));assert.equal(await p.locator('#todoIconRail').isVisible(),true);assert(await p.locator('#todoIconRail .todo-rail-label').first().isVisible());
  await p.evaluate(()=>showPage('todos'));for(const width of [761,900,1150]){await p.setViewportSize({width,height:900});assert(await p.locator('#todoIconRail').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  fs.mkdirSync('test-results/todo-sidebar',{recursive:true});await p.screenshot({path:'test-results/todo-sidebar/desktop.png'});
  await p.setViewportSize({width:390,height:844});assert.equal(await p.locator('.sidebar').isVisible(),false);assert(await p.locator('.bottombar').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.screenshot({path:'test-results/todo-sidebar/mobile.png'});assert.deepEqual(errors,[]);
  console.log('shared rail / title / navigation / list+board+calendar project drops / 작업 / repeat+period+legacy group preserved / cancel+all+failure / desktop+mobile PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
