// 2026-10-10 저장 뒤 다시 불러오기 줄이기: 한 테이블만 바뀐 저장(이름 수정·빈칸 추가·끌어 옮기기)은 그 테이블만,
// 겹친 불러오기는 하나로 합침(지금 도는 것 + 끝난 뒤 한 번). 가짜 Supabase만 씀.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const ok=m=>console.log('PASS '+m);
try{
 const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{errors.push('dialog '+d.message());d.dismiss();});
 await fixture(p);
 await p.evaluate(async()=>{const d=n=>addDaysStr(todayStr(),n);
  mockRows.tok_todos=[{id:'t1',user_id:'test',title:'보고서 쓰기',is_done:false,...OnekanPeriod.patch('todo',{allDay:true,startDate:d(0),endDate:d(0)})}];
  mockRows.tok_someday=[{id:'s1',user_id:'test',title:'포트폴리오 정리',is_done:false}];
  mockRows.tok_habits=[{id:'h1',user_id:'test',name:'스트레칭',is_active:true,start_date:d(-3),repeat_unit:'day',repeat_interval:1}];
  await loadAll();
  const from=sb.from;window.reads=[];sb.from=t=>{reads.push(t);return from(t);};});
 const reads=async()=>p.evaluate(()=>{const r=reads.slice();reads.length=0;return r;});
 // 전체 불러오기에서만 읽는 테이블(화면 그리기 중 습관 기록 조회 등은 원래 있던 것이라 제외)
 const FULL_ONLY=['tok_time_blocks','tok_settings','tok_habit_categories','tok_event_categories','tok_habit_pauses','tok_habit_skips'];
 const data=r=>[...new Set(r.filter(t=>['tok_todos','tok_events','tok_habits','tok_someday'].includes(t)||FULL_ONLY.includes(t)))].sort();
 const fulls=r=>r.filter(t=>t==='tok_time_blocks').length;
 // 1) 이름 수정 → tok_todos만
 await p.evaluate(()=>showPage('todos'));await p.waitForTimeout(150);await p.locator('#todoTopTabs [data-common-view=list]').click();await p.waitForTimeout(150);await reads();
 const row=p.locator('.page[data-page=todos] [data-iv-row]').first();await row.locator('.agenda-title').click();const input=row.locator('.inline-add-input');await input.fill('보고서 마감');await input.press('Enter');
 await p.waitForFunction(()=>todos.some(t=>t.title==='보고서 마감'));await p.waitForTimeout(150);
 let r=await reads();assert.deepEqual(data(r),['tok_todos'],'이름 수정 뒤 읽은 테이블 '+r);
 assert(await p.locator('.page[data-page=todos] [data-iv-row] .agenda-title',{hasText:'보고서 마감'}).count(),'화면에 새 이름');
 ok('이름 수정: 할일 테이블만 다시 불러오고 화면 갱신');
 // 2) 끌어 옮기기(담아두기 → 내일 종일) → tok_todos·tok_someday만
 await p.evaluate(()=>moveItemToZone('someday','s1',{zone:'today-allday',date:addDaysStr(todayStr(),1)}));
 r=await reads();assert.deepEqual(data(r),['tok_someday','tok_todos'],'옮기기 '+r);
 assert(await p.evaluate(()=>todos.some(t=>t.title==='포트폴리오 정리')&&!somedayItems.length));ok('담아두기 → 날짜 옮기기: 두 테이블만, 상태 반영');
 // 3) 습관 이동 → tok_habits만
 await p.evaluate(()=>moveItemToZone('habit','h1',{zone:'today-timed',date:todayStr(),startMinute:540}));r=await reads();assert.deepEqual(data(r),['tok_habits'],'습관 '+r);
 assert.equal(await p.evaluate(()=>tasks.find(t=>t.id==='h1').start_minute),540);ok('습관 시간 옮기기: 습관 테이블만');
 // 4) 겹친 전체 불러오기 3번 → 지금 것 + 끝난 뒤 1번 = 2번
 await p.evaluate(()=>Promise.all([loadAll(),loadAll(),loadAll()]));r=await reads();assert.equal(fulls(r),2,'전체 불러오기 횟수');
 // 겹친 부분 불러오기는 합침, 전체가 끼면 전체로
 await p.evaluate(()=>Promise.all([reloadTables(['tok_todos']),reloadTables(['tok_events']),reloadTables(['tok_someday'])]));r=await reads();
 assert.equal(r.filter(t=>t==='tok_todos').length,1);assert.equal(r.filter(t=>t==='tok_events').length,1);assert.equal(r.filter(t=>t==='tok_someday').length,1);assert.equal(fulls(r),0);
 await p.evaluate(()=>Promise.all([reloadTables(['tok_todos']),loadAll(),reloadTables(['tok_events'])]));r=await reads();assert.equal(fulls(r),1,'뒤 묶음에 전체가 끼면 전체 1번');
 ok('겹친 불러오기 합치기: 전체 3번 → 2번, 부분은 테이블 합쳐 1번 더');
 // 5) 늦게 온 옛 응답이 새 내용을 덮지 않음: 첫 불러오기가 느린 동안 저장 → 뒤 불러오기 결과가 최종
 await p.evaluate(async()=>{window.mockDelay=200;const first=reloadTables(['tok_todos']);await new Promise(r=>setTimeout(r,20));mockRows.tok_todos.push({id:'t9',user_id:'test',title:'늦게 저장',is_done:false,...OnekanPeriod.patch('todo',{allDay:true,startDate:todayStr(),endDate:todayStr()})});await Promise.all([first,reloadTables(['tok_todos'])]);});
 assert(await p.evaluate(()=>todos.some(t=>t.id==='t9')),'뒤 저장 반영');ok('느린 첫 응답 뒤에도 마지막 저장이 화면에 남음');
 // 6) 화면 복귀(포커스+보이기)가 같이 와도 전체 불러오기 1번
 await p.evaluate(()=>{lastLoadAllAt=0;});await reads();await p.evaluate(async()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));await new Promise(r=>setTimeout(r,400));});
 r=await reads();assert.equal(fulls(r),1,'복귀 불러오기 '+fulls(r));ok('포커스·화면 복귀 동시: 전체 불러오기 1번');
 assert.deepEqual(errors,[]);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
