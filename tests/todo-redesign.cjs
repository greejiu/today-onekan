const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await fixture(p);fs.mkdirSync('test-results/todo-redesign',{recursive:true});
  await p.evaluate(async()=>{
   mockRows.tok_item_groups=[{id:'g1',kind:'todo',name:'회사',color:'#4677aa'},{id:'g2',kind:'todo',name:'개인'}];
   mockRows.tok_habit_categories=[{id:'c1',name:'행정',color:'#8373af'}];mockRows.tok_projects=[{id:'p1',name:'목표',is_active:true}];
   mockRows.tok_someday=[{id:'s1',title:'나중에 여행 계획하기',group_id:'g1'}];
   await loadAll();showPage('todos');applyTheme('white');todoViews.selectDate('2026-10-05');todoViews.switch('board');mockWrites.length=0;
  });
  assert(await p.locator('#todoViewEmpty').isVisible());assert(await p.locator('#todoBoard').isHidden());
  assert.equal(await p.locator('#todoEmptyTitle').textContent(),'첫 할일을 적어보세요');
  assert.equal(await p.locator('#todoViewSettings').getAttribute('open'),null);
  assert(await p.locator('#todoRangeStart').isHidden());assert(await p.locator('#todoRangeLabel').isHidden());
  const center=await p.locator('#todoViewEmpty').boundingBox(),heading=await p.locator('#todoEmptyTitle').boundingBox();
  assert(Math.abs(heading.x+heading.width/2-center.x-center.width/2)<2);
  await p.screenshot({path:'test-results/todo-redesign/desktop-empty.png'});
  await p.locator('#todoEmptyAddBtn').click();assert(await p.locator('#todoSheetBg').isVisible());assert.equal(await p.locator('#td_start').inputValue(),'2026-10-05');await p.evaluate(()=>closeTodoSheet());
  await p.evaluate(async()=>{
   const all=(d)=>OnekanPeriod.patch('todo',{allDay:true,startDate:d,endDate:d});
   mockRows.tok_todos=[{id:'a',user_id:'test',title:'서류 정리하기',group_id:'g1',tag_id:'c1',project_id:'p1',...all('2026-10-05')},{id:'b',user_id:'test',title:'산책하기',group_id:'g2',...all('2026-10-06')},{id:'done',title:'완료한 할일',is_done:true,...all('2026-10-05')},{id:'undated',title:'책 골라두기',start_date:null},{id:'repeat',user_id:'test',title:'매일 한 줄 기록하기',group_id:'g1',tag_id:'c1',project_id:'p1',repeat_unit:'day',repeat_interval:1,end_date:'2026-10-31',...all('2026-10-05')}];await loadAll();
  });
  assert(await p.locator('#todoViewEmpty').isHidden());assert(await p.locator('#todoBoard [data-bucket=g1] [data-id=a]').count());
  await p.locator('#todoViewSettings summary').click();assert(await p.locator('#todoRangeStart').isVisible());
  await p.locator('#todoRangeStart').fill('2026-10-05');await p.locator('#todoRangeEnd').fill('2026-10-06');await p.locator('#todoRangeApply').click();
  assert.match(await p.locator('#todoMonthLabel').textContent(),/10월 5일 – 10월 6일/);
  await p.locator('#todoNextBtn').click();assert.deepEqual(await p.evaluate(()=>todoViews.range()),{start:'2026-10-07',end:'2026-10-08'});
  await p.locator('#todoPrevBtn').click();assert.deepEqual(await p.evaluate(()=>todoViews.range()),{start:'2026-10-05',end:'2026-10-06'});
  await p.locator('#todoBoardBy').selectOption('category');assert(await p.locator('#todoBoard [data-bucket=c1] [data-id=a]').count());
  await p.locator('#todoTopTabs [data-tab=list]').click();assert(await p.locator('#todoListGroupWrap').isVisible());assert(await p.locator('#todoBoardOptions').isHidden());
  assert.equal(await p.locator('#todoRangeEnd').inputValue(),'2026-10-06');
  await p.locator('#todoGroup').selectOption('none');await p.locator('#todoSort').selectOption('name');
  const names=await p.locator('#todoUnifiedList strong').allTextContents();assert.deepEqual(names,names.slice().sort((a,b)=>a.localeCompare(b,'ko')));
  for(const group of ['date','group','category','project']){await p.locator('#todoGroup').selectOption(group);assert(await p.locator('#todoUnifiedList [data-id=a]').count());}
  await p.locator('#todoUndated').uncheck();assert.equal(await p.locator('#todoUnifiedList [data-id=undated]').count(),0);
  await p.locator('#todoCompletion').selectOption('done');assert(await p.locator('#todoUnifiedList [data-id=done]').count());
  await p.locator('#todoCompletion').selectOption('open');await p.locator('#todoUndated').check();
  // An invalid range leaves both the rows and current selection intact.
  await p.locator('#todoRangeStart').fill('2026-10-09');await p.locator('#todoRangeApply').click();assert.match(await p.locator('#todoSaveStatus').textContent(),/확인/);
  assert.deepEqual(await p.evaluate(()=>todoViews.range()),{start:'2026-10-05',end:'2026-10-06'});
  await p.locator('#todoRangeStart').fill('2026-12-31');await p.locator('#todoRangeEnd').fill('2027-01-02');await p.locator('#todoRangeApply').click();
  assert.match(await p.locator('#todoMonthLabel').textContent(),/2027년/);
  await p.locator('#todoUndated').uncheck();assert(await p.locator('#todoViewEmpty').isVisible());assert.equal(await p.locator('#todoEmptyTitle').textContent(),'조건에 맞는 할일이 없어요');
  await p.locator('#todoViewSettings summary').click();await p.locator('#todoEmptySettingsBtn').click();assert(await p.locator('#todoRangeStart').isVisible());assert(await p.locator('#todoRangeStart').evaluate(e=>e===document.activeElement));
  await p.keyboard.press('Escape');assert.equal(await p.locator('#todoViewSettings').getAttribute('open'),null);
  await p.locator('#todoMonthLabel').click();await p.locator('#todoMonthPicker [data-m="10"]').click();
  // Month selection resets a custom range instead of keeping a stale label.
  assert.deepEqual(await p.evaluate(()=>todoViews.range()),{start:'2026-10-01',end:'2026-10-31'});
  assert.equal(await p.evaluate(()=>mockWrites.length),0);
  await p.locator('#todoViewSettings summary').click();await p.locator('#todoUndated').check();await p.locator('#todoTopTabs [data-tab=board]').click();await p.locator('#todoBoardBy').selectOption('group');await p.locator('#todoViewSettings summary').click();
  await p.screenshot({path:'test-results/todo-redesign/desktop-board.png'});
  assert.equal(await p.locator('#todoBoard [data-id=a] .sv-open').innerText(),'서류 정리하기');
  const todoMenu=await p.evaluate(()=>itemMenuModel('todo','a','2026-10-05').entries.filter(e=>e.label).map(e=>e.label));
  assert(todoMenu.includes('수정'));assert(!todoMenu.includes('날짜 변경'));
  await p.locator('#todoBoard [data-id=a] .sv-open').click();assert(await p.locator('#todoSheetBg').isVisible());
  assert.equal(await p.locator('#td_start').inputValue(),'2026-10-05');assert.equal(await p.locator('#td_group_id').inputValue(),'g1');await p.evaluate(()=>closeTodoSheet());
  // Completion uses the original recurrence writer and retains links in the next occurrence.
  await p.locator('#todoBoard [data-todo-check=repeat]').click();await p.waitForFunction(()=>mockRows.tok_todos.some(r=>r.repeat_source_id==='repeat'));
  assert.deepEqual(await p.evaluate(()=>{const r=mockRows.tok_todos.find(r=>r.repeat_source_id==='repeat');return [r.group_id,r.tag_id,r.project_id,r.end_date]}),['g1','c1','p1','2026-10-31']);
  await p.locator('#todoTopTabs [data-tab=someday]').click();assert(await p.locator('#todoFilterBar').isHidden());assert(await p.locator('#todoQuickAddBtn').isHidden());assert(await p.locator('#somedayList [data-id=s1]').count());
  await p.locator('#somedayInput').fill('작성 중인 메모');await p.locator('#todoTopTabs [data-common-view=week]').click();assert.equal(await p.locator('#todoTimeDays .sv-day').count(),7);
  await p.locator('#todoTopTabs [data-tab=someday]').click();assert.equal(await p.locator('#somedayInput').inputValue(),'작성 중인 메모');
  await p.locator('#todoTopTabs [data-tab=list]').click();
  await p.locator('#todoTodayBtn').click();
  const baseline=await p.evaluate(()=>JSON.stringify(mockRows));
  for(const [width,theme] of [[1440,'white'],[1366,'black'],[760,'white'],[761,'white'],[390,'cheese'],[320,'white']]){
   await p.setViewportSize({width,height:900});await p.evaluate(t=>applyTheme(t),theme);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const open of [false,true]){await p.evaluate(open=>document.getElementById('todoViewSettings').open=open,open);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await p.screenshot({path:`test-results/todo-redesign/${width}-${theme}-settings.png`});
   await p.evaluate(()=>document.getElementById('todoViewSettings').open=false);
   await p.screenshot({path:`test-results/todo-redesign/${width}-${theme}.png`});
  }
  assert.equal(await p.evaluate(()=>JSON.stringify(mockRows)),baseline);
  await p.evaluate(async()=>{mockRows.tok_todos=[];await loadAll();todoViews.switch('board');});
  assert(await p.locator('#todoViewEmpty').isVisible());await p.screenshot({path:'test-results/todo-redesign/mobile-empty.png'});
  // Clearing the fixture above is deliberate; only the earlier completion wrote data.
  assert.equal(await p.evaluate(()=>mockWrites.filter(w=>!['update','insert'].includes(w.op)).length),0);
  assert.deepEqual(await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)}),[]);assert.deepEqual(errors,[]);
  console.log('PASS todo redesign: centered empty states, folded settings, actual range navigation, year boundary/month reset, sort/group/category/project, completion/recurrence, someday draft, responsive themes 320–1440, no accidental data writes or page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
