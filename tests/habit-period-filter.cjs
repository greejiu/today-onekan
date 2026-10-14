// 2026-10-14 습관: 진행중/보관/종료 탭과 수동 상태 → 시작일·종료일(실천 기간)로 판단 + 필터(현재/시작 예정/기간 종료/보관/전체).
// 보관은 목록·오늘 할 일에서 숨기기만, 복원은 날짜를 바꾸지 않음, 완료 기록 보존. 가짜 Supabase만 씀.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
async function seed(p){await p.evaluate(async()=>{const d=n=>addDaysStr(todayStr(),n),wd=n=>new Date(d(n)+'T12:00:00').getDay();
 const H=(id,o)=>({id,user_id:'test',name:id,is_active:true,repeat_unit:'day',repeat_interval:1,created_at:d(-30)+'T00:00:00Z',start_date:d(-5),end_date:null,...o});
 mockRows.tok_habits=[H('h-cur'),H('h-start-today',{start_date:d(0)}),H('h-end-today',{start_date:d(-10),end_date:d(0)}),H('h-future',{start_date:d(1)}),H('h-past',{start_date:d(-10),end_date:d(-1)}),
  H('h-nostart',{start_date:null}),H('h-week-on',{repeat_unit:'week',repeat_days:[wd(0)],start_date:d(-14)}),H('h-week-off',{repeat_unit:'week',repeat_days:[wd(1)],start_date:d(-14)}),
  H('h-every2',{repeat_interval:2,start_date:d(-4),end_date:d(0)}),H('h-every2-off',{repeat_interval:2,start_date:d(-1)}),
  H('h-arch',{is_active:false}),H('h-arch-ended',{is_active:false,start_date:d(-10),end_date:d(-2)})];
 // 지난 회차를 끝낸 기록(안 끝냈으면 '밀린 습관'으로 오늘도 남는 기존 규칙이라, 요일·주기 판단만 보려고 완료로 둠)
 mockRows.tok_habit_logs=[{id:'l1',habit_id:'h-past',done_date:d(-2)},{id:'l2',habit_id:'h-arch',done_date:d(-3)},{id:'l3',habit_id:'h-week-off',done_date:d(-6)},{id:'l4',habit_id:'h-every2-off',done_date:d(-1)}];mockRows.tok_habit_skips=[];
 mockRows.tok_habit_pauses=[{habit_id:'h-arch',paused_at:d(-2),resumed_at:null},{habit_id:'h-arch-ended',paused_at:d(-1),resumed_at:null}];await loadAll();});}
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const ok=m=>console.log('PASS '+m);
try{
 const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));const dialogs=[];p.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
 await fixture(p);await seed(p);
 const shownOn=n=>p.evaluate(async n=>{const date=addDaysStr(todayStr(),n);return [...new Set([...(await todayAllDayItems(date)),...(await timedItemsForDate(date))].filter(i=>i.kind==='habit').map(i=>i.id))].sort();},n);
 // 1) 날짜 판단: 시작일·종료일 당일 포함, 미래 시작·지난 종료·보관은 오늘 숨김, 반복 요일·주기 함께 적용
 const today=await shownOn(0);
 for(const id of ['h-cur','h-start-today','h-end-today','h-nostart','h-week-on','h-every2'])assert(today.includes(id),'오늘 표시 '+id+' '+today);
 for(const id of ['h-future','h-past','h-week-off','h-every2-off','h-arch','h-arch-ended'])assert(!today.includes(id),'오늘 숨김 '+id);
 assert((await shownOn(1)).includes('h-future'),'시작일 당일(내일)');for(const id of ['h-week-off','h-every2-off'])assert((await shownOn(1)).includes(id),'다음 반복일(내일) 표시 '+id);assert(!(await shownOn(1)).includes('h-end-today'),'종료일 다음 날 숨김');
 assert((await shownOn(-1)).includes('h-past'),'종료일 당일(어제)');assert(!(await shownOn(-1)).includes('h-start-today'),'시작일 전날 숨김');
 ok('오늘 할 일: 시작일·종료일 당일 포함·전후 숨김, 미래 시작·지난 종료·보관 숨김, 반복 요일·주기 함께 적용');
 // 2) 화면: 탭 없음, 필터 기본 '현재', 필터별 목록·날짜 표시
 await p.evaluate(()=>showPage('habits'));await p.locator('#habitViewTabs [data-tab=list]').click();await p.waitForTimeout(150);
 assert.equal(await p.locator('#habitsTabRow').count(),0,'진행중/보관/종료 탭 없음');
 assert.deepEqual((await p.locator('#habitPeriodFilter option').allTextContents()),['현재','시작 예정','기간 종료','보관','전체']);assert.equal(await p.locator('#habitPeriodFilter').inputValue(),'current');
 const ids=async()=>(await p.locator('#todoList [data-iv-row]').evaluateAll(es=>[...new Set(es.map(e=>e.dataset.ivRow))])).sort();
 const pick=async v=>{await p.locator('#habitPeriodFilter').selectOption(v);await p.waitForTimeout(120);return ids();};
 assert.deepEqual(await ids(),['h-cur','h-end-today','h-every2','h-every2-off','h-nostart','h-start-today','h-week-off','h-week-on'],"'현재' = 오늘 반복하지 않아도 실천 기간이면 표시");
 assert.deepEqual(await pick('upcoming'),['h-future']);assert.match(await p.locator('#todoList [data-iv-row=h-future]').first().textContent(),/시작일 \d{4}-\d{2}-\d{2}/,'시작 예정 = 시작일 표시');
 assert.deepEqual(await pick('ended'),['h-past']);assert.match(await p.locator('#todoList [data-iv-row=h-past]').first().textContent(),/종료일 \d{4}-\d{2}-\d{2}/,'기간 종료 = 종료일 표시');
 assert.deepEqual(await pick('archived'),['h-arch','h-arch-ended']);assert.equal((await pick('all')).length,12);
 ok('목록: 탭 대신 필터(현재/시작 예정/기간 종료/보관/전체), 시작 예정은 시작일·기간 종료는 종료일');
 // 3) 보관·복원: 날짜·완료 기록 그대로, 복원하면 기간·반복대로 다시 표시
 const snap=()=>p.evaluate(()=>JSON.stringify({h:mockRows.tok_habits.map(({id,start_date,end_date,repeat_unit,repeat_interval,repeat_days})=>({id,start_date,end_date,repeat_unit,repeat_interval,repeat_days})),l:mockRows.tok_habit_logs}));const before=await snap();
 await pick('current');await p.locator('#todoList .togglebtn[data-id=h-cur]').click();await p.waitForFunction(()=>!mockRows.tok_habits.find(h=>h.id==='h-cur').is_active);
 assert(!(await ids()).includes('h-cur'),'보관하면 기본 목록에서 숨김');assert(!(await shownOn(0)).includes('h-cur'),'보관하면 오늘 할 일에서 숨김');
 await pick('archived');assert.equal((await p.locator('#todoList .togglebtn[data-id=h-arch]').textContent()).trim(),'복원하기');
 await p.locator('#todoList .togglebtn[data-id=h-arch]').click();await p.waitForFunction(()=>mockRows.tok_habits.find(h=>h.id==='h-arch').is_active);
 await p.locator('#todoList .togglebtn[data-id=h-arch-ended]').click();await p.waitForFunction(()=>mockRows.tok_habits.find(h=>h.id==='h-arch-ended').is_active);
 assert((await shownOn(0)).includes('h-arch'),'복원 → 현재 기간이라 오늘 다시 표시');assert(!(await shownOn(0)).includes('h-arch-ended'),'복원해도 종료일이 지났으면 오늘 숨김');
 assert.deepEqual(await pick('ended'),['h-arch-ended','h-past'],'복원한 지난 습관은 기간 종료로');
 await p.locator('#todoList .togglebtn[data-id=h-cur]').count().then(n=>assert.equal(n,0));await pick('archived');await p.locator('#todoList .togglebtn[data-id=h-cur]').click();await p.waitForFunction(()=>mockRows.tok_habits.find(h=>h.id==='h-cur').is_active);
 assert.equal(await snap(),before,'보관·복원으로 시작일·종료일·반복·완료 기록이 바뀌지 않음');
 assert(await p.evaluate(()=>mockRows.tok_habit_pauses.filter(x=>x.resumed_at).length>=2),'보관·복원 이력은 남김');
 ok('보관·복원: 목록·오늘 할 일에서 숨김/다시 표시, 날짜·반복·완료 기록 그대로');
 // 4) 종료일 < 시작일 저장 막기(추가·수정)
 const writes=await p.evaluate(()=>mockWrites.length);
 await p.locator('#habitAddBtn').click();await p.locator('#ha_name').fill('거꾸로');await p.evaluate(()=>{$('ha_repeat_start').value=addDaysStr(todayStr(),2);$('ha_repeat_end').value=addDaysStr(todayStr(),1);});await p.locator('#ha_save').click();
 assert.match(await p.locator('#ha_error').textContent(),/시작일·종료일/);await p.locator('#ha_cancel').click();
 await p.evaluate(()=>openHabitSheet(tasks.find(t=>t.id==='h-cur')));await p.evaluate(()=>{$('hs_start').value=addDaysStr(todayStr(),2);$('hs_end').value=addDaysStr(todayStr(),1);});await p.locator('#habitSheetSaveBtn').click();await p.waitForTimeout(100);
 assert(dialogs.some(m=>m.includes('종료일은 시작일보다 빠를 수 없어요')));await p.locator('#habitSheetCancelBtn').click().catch(()=>{});
 assert.equal(await p.evaluate(()=>mockWrites.length),writes,'저장 안 됨');ok('종료일이 시작일보다 앞서면 추가·수정 모두 저장 막음');
 assert.deepEqual(errors,[]);await p.close();
 // 5) 모바일 390: 탭 없이 필터 사용
 const m=await b.newPage({viewport:{width:390,height:844},hasTouch:true,timezoneId:'Asia/Seoul'}),merr=[];m.on('pageerror',e=>merr.push(e.message));await fixture(m);await seed(m);
 await m.evaluate(()=>showPage('habits'));await m.waitForTimeout(150);assert.equal(await m.locator('#habitsTabRow').count(),0);assert(await m.locator('#habitPeriodFilter').isVisible());
 await m.locator('#habitPeriodFilter').selectOption('upcoming');await m.waitForTimeout(120);assert.deepEqual(await m.locator('#todoList [data-iv-row]').evaluateAll(es=>[...new Set(es.map(e=>e.dataset.ivRow))]),['h-future']);
 assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await m.screenshot({path:'test-results/habit-period-filter-m390.png'}).catch(()=>{});
 assert.deepEqual(merr,[]);ok('모바일 390: 탭 없음, 필터 동작, 가로 넘침 없음');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
