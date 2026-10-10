// 2026-10-10 일정·할일·습관 탭을 지금 한칸과 일관되게: 일 보기 = 지금 한칸 타임라인·시간블럭(그 탭 종류만),
// 목록·보드 줄 = 지금 한칸 줄(누르면 이름 수정, 체크 = 완료), 오른쪽 '다가오는 · 언젠가' = 지금 한칸 목록. 가짜 Supabase만 씀.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
// 2026-10-10 옛 일정 화면 삭제: 일정은 통합 화면(all-redesign 테스트)이 맡아서 할일·습관만 남김
const TABS=[
 {page:'todos',view:v=>'#todoTopTabs [data-common-view='+v+']',kind:'todo',day:'#todosHomeDay',side:'#todoSideAgenda',btn:'#todoPanelBtn'},
 {page:'habits',view:v=>'#habitViewTabs [data-common-view='+v+']',kind:'habit',day:'#habitsHomeDay',side:'#habitSideAgenda',btn:'#habitPanelBtn'},
];
async function seed(p){await p.evaluate(async()=>{const d=n=>addDaysStr(todayStr(),n);
 mockRows.tok_habit_categories=[{id:'g1',name:'공부',color:'#4a90e2'}];
 mockRows.tok_todos=[{id:'t1',user_id:'test',title:'보고서 쓰기',tag_id:'g1',is_done:false,...OnekanPeriod.patch('todo',{allDay:false,startDate:d(0),endDate:d(0),startTime:'10:00',endTime:'11:00'})},{id:'t2',user_id:'test',title:'장보기',is_done:false,...OnekanPeriod.patch('todo',{allDay:true,startDate:d(0),endDate:d(0)})}];
 mockRows.tok_events=[{id:'e1',user_id:'test',title:'면접',...OnekanPeriod.patch('event',{allDay:false,startDate:d(0),endDate:d(0),startTime:'14:00',endTime:'15:00'})}];
 mockRows.tok_someday=[{id:'s1',user_id:'test',title:'포트폴리오 정리',is_done:false}];
 mockRows.tok_habits=[{id:'h1',user_id:'test',name:'스트레칭',category_id:'g1',is_active:true,start_date:d(-3),repeat_unit:'day',repeat_interval:1,start_minute:420,duration_minutes:30}];
 mockRows.tok_habit_logs=[];mockRows.tok_habit_skips=[];await loadAll();});}
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];const ok=m=>{results.push('PASS '+m);console.log('PASS '+m);};
try{
 const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await fixture(p);await seed(p);const homeDate0=await p.evaluate(()=>homeAgendaDate);
 for(const t of TABS){
  await p.evaluate(pg=>showPage(pg),t.page);await p.waitForTimeout(150);
  // 오른쪽 칸 = 지금 한칸 다가오는·담아두기(같은 DOM)
  assert(await p.locator(t.side).isVisible(),t.page+' 오른쪽 칸');assert.equal(await p.locator(t.side+' #homeUpcomingPanel').count(),1,t.page+' 다가오는 = 지금 한칸');
  // 일 보기 = 지금 한칸 화면, 이 탭 종류만
  await p.locator(t.view('day')).filter({visible:true}).first().click();await p.waitForTimeout(200);
  assert.equal(await p.locator(t.day+' .home2-tabpanel:visible').count(),1,t.page+' 일 = 지금 한칸 타임라인·시간블럭');
  const kinds=await p.locator(t.day+' [data-kind]').evaluateAll(es=>[...new Set(es.map(e=>e.dataset.kind))]);
  assert.deepEqual(kinds,[t.kind],t.page+' 일 보기는 이 탭 종류만 '+kinds);
  // 일 보기 제목 누르기 = 이름 수정(지금 한칸 규칙)
  const row=p.locator(t.day+' [data-kind='+t.kind+'] :is(.agenda-title,.ag-tl-title)').first();
  if(await row.count()){await row.click();await p.waitForTimeout(100);const input=p.locator(t.day+' .inline-add-input');if(await input.count()){assert(await input.isVisible());await p.keyboard.press('Escape');}}
  // 목록 = 지금 한칸 줄
  await p.locator(t.view('list')).filter({visible:true}).first().click();await p.waitForTimeout(200);
  const lines=p.locator('.page[data-page='+t.page+'] [data-iv-row].home1-flat-row');assert(await lines.count()>0,t.page+' 목록 줄 = 지금 한칸 줄');
  assert(await lines.first().locator('.drag-handle-dots').count(),'손잡이');
  await lines.first().locator('.agenda-title').click();const rename=lines.first().locator('.inline-add-input');assert(await rename.isVisible(),t.page+' 줄 누르기 = 이름 수정');
  await rename.fill('고친 이름 '+t.page);await rename.press('Enter');
  await p.waitForFunction(([k,n])=>(k==='event'?mockRows.tok_events:k==='todo'?mockRows.tok_todos:mockRows.tok_habits).some(r=>(r.title||r.name)===n),[t.kind,'고친 이름 '+t.page]);
  ok(t.page+': 오른쪽 칸·일 보기(그 종류만)·목록 줄이 지금 한칸과 같고 누르면 이름 수정');
 }
 // 할일 목록 체크 = 완료
 await p.evaluate(()=>showPage('todos'));await p.waitForTimeout(150);await p.locator('#todoTopTabs [data-common-view=list]').click();await p.waitForTimeout(150);
 const cb=p.locator('.page[data-page=todos] [data-iv-row] .ag-todo-check').first();const tid=await cb.getAttribute('data-id');await cb.click(); // '미완료' 보기라 체크하면 줄이 빠짐
 await p.waitForFunction(id=>mockRows.tok_todos.find(t=>t.id===id).is_done===true,tid);ok('할일 목록 체크 = 완료(지금 한칸 체크 규칙)');
 // 습관 목록: 날짜 없는 원본 줄은 체크 자리 비우고 다음 예정일 표시
 await p.evaluate(()=>showPage('habits'));await p.waitForTimeout(150);
 const hrow=p.locator('.page[data-page=habits] [data-iv-row]').first();assert.equal(await hrow.locator('input[type=checkbox]').count(),0,'습관 원본 줄은 체크 없음');
 assert((await hrow.locator('.habit-due-chip').textContent()).includes('다음 예정일'));ok('습관 목록: 원본 줄은 체크 없이 다음 예정일');
 // 빌려 간 화면 주고받기: 할일 일 → 새로고침 → 지금 한칸
 await p.evaluate(()=>showPage('todos'));await p.locator('#todoTopTabs [data-common-view=day]').click();await p.waitForTimeout(150);
 assert.equal(await p.locator('#todosHomeDay #homeTimelinePanel').count(),1);
 await p.evaluate(()=>loadAll());await p.waitForTimeout(200);assert.equal(await p.locator('#todosHomeDay #homeTimelinePanel').count(),1,'새로고침해도 다른 탭이 가져가지 않음');
 await p.evaluate(()=>showPage('home'));await p.waitForTimeout(150);
 assert.equal(await p.locator('#homeCol2 #homeTimelinePanel').count(),1);assert.equal(await p.locator('#homeCol3 #homeUpcomingPanel').count(),1);
 assert.equal(await p.evaluate(()=>homeAgendaDate),homeDate0);assert.equal(await p.evaluate(()=>homeItemFilter),null);
 await p.evaluate(()=>loadAll());await p.waitForTimeout(200);assert.equal(await p.locator('#homeCol2 #homeTimelinePanel').count(),1,'지금 한칸에서 새로고침해도 제자리');
 ok('빌린 화면은 보이는 탭만 쓰고, 지금 한칸으로 오면 제자리·날짜·거르기 복원');
 assert.equal(await p.locator('#homeCol2 > .home2-tabpanel:visible').count(),1);
 assert.deepEqual(errors,[],'PC 오류 없음');await p.close();
 // 모바일: 탭마다 버튼으로 여는 아래쪽 패널
 const m=await b.newPage({viewport:{width:390,height:844},hasTouch:true,timezoneId:'Asia/Seoul'}),merr=[];m.on('pageerror',e=>merr.push(e.message));await fixture(m);await seed(m);
 for(const t of TABS){await m.evaluate(pg=>showPage(pg),t.page);await m.waitForTimeout(150);assert(!(await m.locator(t.side).isVisible()));await m.locator(t.btn).tap();assert(await m.locator(t.side+' #homeUpcomingList').isVisible(),t.page+' 모바일 패널');await m.locator(t.side+' .sa-close').tap();}
 assert.deepEqual(merr,[]);ok('모바일 390: 할일·습관 탭 버튼으로 다가오는 · 언젠가 열기');await m.close();
 console.log(results.join('\n'));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
