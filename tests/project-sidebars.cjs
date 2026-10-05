const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {fixture}=require('./home-layout.cjs');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768},timezoneId:'Asia/Seoul'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await fixture(page);
  await page.evaluate(async()=>{
   const day=todayStr();
   mockRows.tok_projects=[
    {id:'p1',user_id:'test',name:'진행 프로젝트',parent_id:null,lifecycle_state:'active',is_archived:false,sort_order:0},
    {id:'p2',user_id:'test',name:'하위 프로젝트',parent_id:'p1',lifecycle_state:'active',is_archived:false,sort_order:1},
    {id:'p3',user_id:'test',name:'종료 프로젝트',parent_id:null,lifecycle_state:'ended',is_archived:false,sort_order:2}
   ];
   mockRows.tok_identities=[];
   mockRows.tok_item_groups=[{id:'old',user_id:'test',kind:'todo',name:'예전 분류',sort_order:0}];
   mockRows.tok_todos=[{id:'t1',user_id:'test',title:'연결 할일',project_id:'p2',group_id:'old',start_date:day,is_done:false},{id:'t2',user_id:'test',title:'작업 할일',project_id:null,start_date:day,is_done:false}];
   mockRows.tok_someday=[];
   mockRows.tok_habits=[{id:'h1',user_id:'test',name:'연결 습관',project_id:'p3',start_date:day,is_active:true},{id:'h2',user_id:'test',name:'작업 습관',project_id:null,start_date:day,is_active:true}];
   await loadAll();showPage('todos',true);mockWrites.length=0;
  });
  const side=page.locator('#classificationSideHost');
  assert(!(await page.locator('#sidebarPageTitle').isVisible()),'페이지 제목을 전용 사이드바에 반복하지 않습니다.');
  await page.evaluate(()=>showPage('schedule',true));
  assert(!(await page.locator('#sidebarPageTitle').isVisible()));
  await page.evaluate(()=>showPage('todos',true));
  assert.deepEqual(await side.locator('[data-project-select]').allTextContents(),['전체','작업','진행 프로젝트','└ 하위 프로젝트','종료 프로젝트 · 종료']);
  await side.locator('[data-project-select=p2]').click();
  assert.deepEqual(await page.evaluate(()=>todos.filter(t=>classification.matches('todo',t)).map(t=>t.id)),['t1']);
  await page.evaluate(()=>openTodoSheet(null));assert.equal(await page.locator('#td_project').inputValue(),'p2');assert.equal(await page.locator('#td_group_id').inputValue(),'');await page.evaluate(()=>closeTodoSheet());
  await side.locator('[data-project-select=none]').click();
  assert.deepEqual(await page.evaluate(()=>todos.filter(t=>classification.matches('todo',t)).map(t=>t.id)),['t2']);
  await side.locator('[data-project-select=all]').click();
  const source=page.locator('#todoUnifiedView [data-menu-kind=todo][data-menu-id=t1]').first();
  await source.scrollIntoViewIfNeeded();
  const from=await source.boundingBox(),to=await side.locator('[data-project-select=none]').boundingBox();
  assert(from&&to,'할일과 프로젝트 대상이 보여야 합니다.');
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:15});await page.mouse.up();
  await page.waitForFunction(()=>mockRows.tok_todos.find(t=>t.id==='t1').project_id===null);
  await page.waitForFunction(()=>document.getElementById('todoGroupMoveStatus').textContent.includes('옮겼어요'));
  assert.equal(await page.evaluate(()=>mockRows.tok_todos.find(t=>t.id==='t1').group_id),'old');
  assert(await page.evaluate(()=>mockWrites.some(w=>w.table==='tok_todos'&&w.op==='update'&&Object.prototype.hasOwnProperty.call(w.values,'project_id')&&!Object.prototype.hasOwnProperty.call(w.values,'group_id'))));
  await page.evaluate(()=>mockWrites.length=0);
  await page.evaluate(()=>showPage('habits',true));
  await side.locator('[data-project-select=p3]').click();
  assert.deepEqual(await page.evaluate(()=>tasks.filter(t=>classification.matches('habit',t)).map(t=>t.id)),['h1']);
  await side.locator('[data-project-select=none]').click();
  assert.deepEqual(await page.evaluate(()=>tasks.filter(t=>classification.matches('habit',t)).map(t=>t.id)),['h2']);
  await side.locator('[data-project-select=all]').click();
  const habit=page.locator('#habitCollection [data-menu-kind=habit][data-menu-id=h1]').first();
  await habit.scrollIntoViewIfNeeded();
  const habitFrom=await habit.boundingBox(),habitTo=await side.locator('[data-project-select=none]').boundingBox();
  assert(habitFrom&&habitTo,'습관과 프로젝트 대상이 보여야 합니다.');
  await page.mouse.move(habitFrom.x+habitFrom.width/3,habitFrom.y+habitFrom.height/2);await page.mouse.down();
  await page.mouse.move(habitTo.x+habitTo.width/2,habitTo.y+habitTo.height/2,{steps:15});await page.mouse.up();
  await page.waitForFunction(()=>mockRows.tok_habits.find(h=>h.id==='h1').project_id===null);
  assert(await page.evaluate(()=>mockWrites.some(w=>w.table==='tok_habits'&&w.op==='update'&&Object.prototype.hasOwnProperty.call(w.values,'project_id'))));
  await page.waitForFunction(()=>document.getElementById('todoGroupMoveStatus').textContent.includes('옮겼어요'));
  await page.evaluate(()=>mockWrites.length=0);
  const unchanged=page.locator('#habitCollection [data-menu-kind=habit][data-menu-id=h2]').first();
  await unchanged.scrollIntoViewIfNeeded();
  const rejectFrom=await unchanged.boundingBox(),rejectTo=await side.locator('[data-project-select=p3]').boundingBox();
  assert(rejectFrom&&rejectTo);
  await page.mouse.move(rejectFrom.x+rejectFrom.width/3,rejectFrom.y+rejectFrom.height/2);await page.mouse.down();
  await page.mouse.move(rejectTo.x+rejectTo.width/2,rejectTo.y+rejectTo.height/2,{steps:15});await page.mouse.up();
  assert.equal(await page.evaluate(()=>mockRows.tok_habits.find(h=>h.id==='h2').project_id),null);
  assert.equal(await page.evaluate(()=>mockWrites.length),0);
  await page.screenshot({path:'test-results/project-sidebar-desktop.png'});
  await side.locator('[data-project-select=none]').click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('[data-classification-mobile=habits] select').inputValue(),'none');
  await page.locator('[data-classification-mobile=habits] select').selectOption('p3');
  await page.screenshot({path:'test-results/project-sidebar-mobile.png'});
  assert.equal(await page.evaluate(()=>classification.projectSelection('habit')),'p3');
  assert.equal(await page.evaluate(()=>mockWrites.length),0);
  assert.deepEqual(errors,[]);
  console.log('PASS project sidebars: todo/habit filters and drops, 작업, ended-project guard, new-item project, mobile, legacy data preserved');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
