// 2026-10-22 지금한칸 끌어 옮기기 공통화 검증(일정 화면과 같은 엔진·규칙·저장). 가짜 Supabase만 씀.
// 보고한 문제 3개: 지난 할일을 오늘 줄에서 옮기면 엉뚱한 과거 날짜 / 여러 날 하루종일 일정을 시간 칸에 놓으면 1470분 /
// 시간 습관을 다른 날 하루종일에 놓으면 습관 전체가 하루종일로 바뀜. 그리고 이동 30분 단위(같은 열·다른 칸), 길이 조절 15분 유지,
// 짧은 항목 끝부분 0.3초 누르기 = 이동, 할일 → 언젠가 막기(저장 0), 반복 할일 막기, 반복 일정 범위 '전체', Esc, 실행 취소,
// 짧게 누르기 = 이름 수정, 빈칸 추가 유지.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
const OUT='test-results/home-drag';
const ok=m=>console.log('PASS '+m);
const writes=p=>p.evaluate(()=>mockWrites.filter(w=>w.op!=='select').length);
const row=(p,table,id)=>p.evaluate(([t,i])=>({...mockRows[t].find(r=>r.id===i)}),[table,id]);
const snap=p=>p.evaluate(()=>JSON.stringify({t:mockRows.tok_todos,e:mockRows.tok_events,h:mockRows.tok_habits,s:mockRows.tok_someday,l:mockRows.tok_habit_logs,k:mockRows.tok_habit_skips}));
const center=async loc=>{await loc.evaluate(e=>e.scrollIntoView({block:'center'}));const b=await loc.boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
const label=p=>p.locator('#allMoveLabel .sd-ghost-text').textContent();
async function drag(p,from,to,{esc=false,check,hold=0}={}){
 await p.mouse.move(from.x,from.y);await p.mouse.down();if(hold)await p.waitForTimeout(hold);
 await p.mouse.move(from.x+(to.x>from.x?8:0),from.y+8,{steps:3});await p.mouse.move(to.x,to.y,{steps:10});
 if(check)await check();if(esc)await p.keyboard.press('Escape');await p.mouse.up();await p.waitForTimeout(250);
}
// 타임라인 칸의 그 시각 위치(scroll = 그 줄이 보이게 먼저 스크롤)
const axis=(p,minute,scroll=false)=>p.locator('#agendaTimeWrap .ag-tl-content').first().evaluate((e,[m,scroll])=>{if(scroll)(e.parentElement.querySelector('[data-minute="'+Math.floor(m/60)*60+'"]')||e).scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width*.75,y:r.top+(m-Number(e.dataset.minM))*0.6+2};},[minute,scroll]);
const dismissToast=p=>p.evaluate(()=>document.querySelector('#appToast')?.classList.remove('show'));
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 fs.mkdirSync(OUT,{recursive:true});
 const p=await b.newPage({viewport:{width:1600,height:1000},timezoneId:'Asia/Seoul'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
 await fixture(p);
 const D=await p.evaluate(async()=>{
  const t=todayStr(),d=i=>addDaysStr(t,i);
  const T=(k,a,s,e,b)=>OnekanPeriod.patch(k,{allDay:false,startDate:a,endDate:b||a,startTime:s,endTime:e}),A=(k,a,b)=>OnekanPeriod.patch(k,{allDay:true,startDate:a,endDate:b||a});
  mockRows.tok_time_blocks=[{id:'b1',user_id:'test',title:'오전',start_minute:540,end_minute:720,sort_order:0},{id:'b2',user_id:'test',title:'오후',start_minute:780,end_minute:1080,sort_order:1}];
  mockRows.tok_todos=[
   {id:'t-timed',user_id:'test',title:'시간 할일',is_done:false,...T('todo',d(0),'10:00','11:00')},
   {id:'t-short',user_id:'test',title:'짧은 할일',is_done:false,...T('todo',d(0),'14:00','14:15')},
   {id:'t-all',user_id:'test',title:'종일 할일',is_done:false,...A('todo',d(0))},
   {id:'t-rep',user_id:'test',title:'밀린 반복',is_done:false,repeat_unit:'day',repeat_interval:1,...A('todo',d(-2))}, // 지난 반복 할일 = 오늘 하루종일에 보임
   {id:'t-old',user_id:'test',title:'지난 할일',is_done:false,...A('todo',d(-3))},
  ];
  mockRows.tok_events=[
   {id:'e-range',user_id:'test',title:'사흘 일정',...A('event',d(0),d(2))},
   {id:'e-rep',user_id:'test',title:'주간 회의',repeat_unit:'week',repeat_interval:1,...T('event',d(0),'16:00','17:00')},
  ];
  mockRows.tok_habits=[{id:'h1',user_id:'test',name:'스트레칭',is_active:true,start_date:d(-5),repeat_unit:'day',repeat_interval:1,...T('habit',d(-5),'07:00','07:30')}];
  mockRows.tok_habit_logs=[];mockRows.tok_habit_skips=[];mockRows.tok_someday=[{id:'s1',user_id:'test',title:'언젠가 할 일',is_done:false}];
  await loadAll();showPage('home');homeAgendaDate=t;renderHome();
  return Array.from({length:8},(_,i)=>d(i));
 });
 await p.waitForTimeout(300);
 const task=id=>p.locator('#agendaTimeWrap .ag-tl-task[data-id="'+id+'"]');
 const allday=id=>p.locator('#agendaAllDayZone .ag-allday-row[data-id="'+id+'"]');
 const upcoming=date=>p.locator('#homeUpcomingList .upcoming-day[data-date="'+date+'"]');

 // ── 1. 같은 열 안 이동 = 30분 단위, 소요시간 유지, 미리보기 문구, 실행 취소 ──
 let w0=await writes(p);let a=await center(task('t-timed'));
 await drag(p,{x:a.x,y:a.y},{x:a.x,y:a.y+20},{check:async()=>{assert.match(await label(p),/시간 할일 → .* 10:30~11:30/);assert.equal(await p.locator('#agendaTimeWrap .sd-slot').count(),1,'타임라인 미리보기 칸');assert.equal(await task('t-timed').evaluate(e=>e.classList.contains('sd-source')),true,'원래 자리 흐림');}});
 await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-timed').todo_time==='10:30:00');
 let r=await row(p,'tok_todos','t-timed');assert.equal(r.end_time,'11:30:00');assert.equal(r.duration_minutes,60);assert.equal(await writes(p),w0+1,'저장 요청 한 번');
 assert.equal(await p.locator('#agendaTimeWrap .inline-add-input').count(),0,'끈 뒤 이름 수정 안 열림');
 await p.locator('#appToast .toast-action').click();await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-timed').todo_time==='10:00:00');
 a=await center(task('t-timed'));await drag(p,{x:a.x,y:a.y},{x:a.x,y:a.y+38});await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-timed').todo_time==='11:00:00');
 assert.equal((await row(p,'tok_todos','t-timed')).end_time,'12:00:00');await dismissToast(p);
 ok('같은 열 이동: 30분 단위(20px → 10:30), 소요시간 유지, 미리보기·원래 자리 흐림, 저장 한 번, 실행 취소');

 // ── 2. 끝 끌기 길이 조절 = 15분 단위 그대로 ──
 let box=await task('t-timed').boundingBox();w0=await writes(p);
 await p.mouse.move(box.x+box.width/2,box.y+box.height-3);await p.mouse.down();await p.mouse.move(box.x+box.width/2,box.y+box.height-3+9,{steps:4});await p.mouse.up();
 await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-timed').end_time==='12:15:00');r=await row(p,'tok_todos','t-timed');assert.equal(r.todo_time,'11:00:00');assert.equal(r.duration_minutes,75);
 await p.waitForTimeout(200);box=await task('t-timed').boundingBox();
 await p.mouse.move(box.x+box.width/2,box.y+3);await p.mouse.down();await p.mouse.move(box.x+box.width/2,box.y+3-9,{steps:4});await p.mouse.up();
 await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-timed').todo_time==='10:45:00');assert.equal((await row(p,'tok_todos','t-timed')).end_time,'12:15:00');
 ok('끝 끌기 길이 조절: 아래·위 모두 15분 단위(기존 그대로)');

 // ── 3. 짧은 항목 끝부분 0.3초 누르기 = 이동(길이 조절 아님) ──
 await p.waitForTimeout(200);box=await task('t-short').boundingBox();
 await drag(p,{x:box.x+box.width/2,y:box.y+3},{x:box.x+box.width/2,y:box.y+3+36},{hold:450});
 await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-short').todo_time!=='14:00:00');r=await row(p,'tok_todos','t-short');
 assert.equal(r.todo_time,'15:00:00');assert.equal(r.end_time,'15:15:00','소요시간 15분 유지');await dismissToast(p);
 ok('짧은 항목: 끝부분을 0.3초 누른 뒤 끌면 이동(소요시간 유지)');

 // ── 4. 버그 2: 여러 날 하루종일 일정 → 시간 칸 = 놓은 날 그 시각부터 30분 ──
 a=await center(allday('e-range'));let to=await axis(p,540);
 await drag(p,a,to,{check:async()=>assert.match(await label(p),/사흘 일정 → .* 09:00~09:30/)});
 await p.waitForFunction(()=>mockRows.tok_events.find(r=>r.id==='e-range').all_day===false);r=await row(p,'tok_events','e-range');
 assert.equal(r.event_date,D[0]);assert.equal(r.end_date,D[0]);assert.equal(r.event_time,'09:00:00');assert.equal(r.end_time,'09:30:00');assert.equal(r.duration_minutes,30,'1470분이 아니라 30분');await dismissToast(p);
 ok('문제 2 해결: 여러 날 하루종일 일정을 09:00에 놓으면 그날 09:00~09:30(30분)');

 // ── 5. 버그 3: 시간 습관을 다른 날에 놓으면 막음(습관 전체가 바뀌지 않음), 언젠가도 막음, 같은 날 시간 변경은 범위 '전체' ──
 let before=await snap(p);w0=await writes(p);const habitStart=(await row(p,'tok_habits','h1')).start_date;
 a=await center(task('h1'));let up=await center(upcoming(D[1]));
 await drag(p,a,up,{check:async()=>assert.match(await label(p),/다른 날로 옮길 수 없어요/)});
 assert.equal(await snap(p),before,'습관·기록 그대로');assert.equal(await writes(p),w0,'저장 0');assert.match(await p.locator('#appToast').textContent(),/다른 날로 옮길 수 없어요/);
 a=await center(task('h1'));let some=await center(p.locator('#somedayZone'));await drag(p,a,some,{check:async()=>assert.match(await label(p),/언젠가에는 할일만/)});
 assert.equal(await snap(p),before);assert.equal(await writes(p),w0);
 a=await center(task('h1'));await drag(p,a,{x:a.x,y:a.y+36});await p.locator('#allScopeBg.open [data-scope=all]').click();
 await p.waitForFunction(()=>mockRows.tok_habits[0].start_minute===480);r=await row(p,'tok_habits','h1');assert.equal(r.start_date,habitStart);assert.equal(r.duration_minutes,30);assert.equal(r.repeat_unit,'day');await dismissToast(p);
 ok('문제 3 해결: 시간 습관을 다른 날·언젠가에 놓으면 막고 안내(저장 0, 데이터 그대로), 같은 날 시간 변경은 범위 \'전체\'');

 // ── 6. 할일 → 언젠가는 막음(이유 안내, 저장 0), 반복 할일도 막음 ──
 before=await snap(p);w0=await writes(p);
 a=await center(allday('t-all'));some=await center(p.locator('#somedayZone'));
 await drag(p,a,some,{check:async()=>assert.match(await label(p),/언젠가로 옮기기는 잠시 막아 두었어요/)});
 assert.match(await p.locator('#appToast').textContent(),/한 번에 안전하게 저장하는 방법이 준비되면/);assert.equal(await snap(p),before);assert.equal(await writes(p),w0,'할일 → 언젠가 저장 0');
 a=await center(allday('t-rep'));up=await center(upcoming(D[1]));
 await drag(p,a,up,{check:async()=>assert.match(await label(p),/반복 할일은 상세 화면에서/)});
 assert.equal(await snap(p),before);assert.equal(await writes(p),w0,'반복 할일 저장 0');
 ok('할일 → 언젠가: 이유 안내하고 막음(저장 0), 반복 할일: 상세 화면 안내(저장 0)');

 // ── 7. 버그 1: 지난 할일을 오늘 기준으로 옮겨도 놓은 날짜 그대로(빌려 간 목록·옛 호출 경로) ──
 await p.evaluate(d=>moveItemToZone('todo','t-old',{zone:'today-allday',type:'date',date:d,sourceDate:todayStr()}),D[1]);
 r=await row(p,'tok_todos','t-old');assert.equal(r.start_date,D[1],'놓은 날(내일)');assert.equal(r.occurrence_end_date,D[1]);await dismissToast(p);
 ok('문제 1 해결: 오늘 줄에서 잡은 지난 할일을 내일에 놓으면 내일(과거 날짜로 가지 않음)');

 // ── 8. 다가오는 목록: 날짜만 옮김(하루종일은 하루종일, 시간 항목은 시간 유지) ──
 a=await center(allday('t-all'));up=await center(upcoming(D[3]));await drag(p,a,up);
 await p.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-all').start_date===d,D[3]);assert.equal((await row(p,'tok_todos','t-all')).all_day,true);await dismissToast(p);
 a=await center(task('t-timed'));up=await center(upcoming(D[2]));await drag(p,a,up);
 await p.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-timed').start_date===d,D[2]);r=await row(p,'tok_todos','t-timed');assert.equal(r.todo_time,'10:45:00');assert.equal(r.end_time,'12:15:00');await dismissToast(p);
 ok('다가오는 날짜에 놓기: 날짜만 바뀌고 하루종일·시간·소요시간 유지');

 // ── 9. 반복 일정: 범위 창('전체'만 켜짐), 취소 = 그대로 ──
 before=await snap(p);w0=await writes(p);a=await center(task('e-rep'));await drag(p,a,{x:a.x,y:a.y+36});
 assert(await p.locator('#allScopeBg.open').isVisible());assert(await p.locator('#allScopeBg [data-scope=one]').isDisabled());assert(await p.locator('#allScopeBg [data-scope=future]').isDisabled());
 await p.locator('#allScopeBg [data-scope-cancel]').click();await p.waitForTimeout(150);assert.equal(await snap(p),before);assert.equal(await writes(p),w0);
 a=await center(task('e-rep'));await drag(p,a,{x:a.x,y:a.y+36});await p.locator('#allScopeBg.open [data-scope=all]').click();
 await p.waitForFunction(()=>mockRows.tok_events.find(r=>r.id==='e-rep').event_time==='17:00:00');assert.equal((await row(p,'tok_events','e-rep')).repeat_unit,'week');await dismissToast(p);
 ok('반복 일정: 범위 창(이번만·이후 꺼짐), 취소 = 그대로, 전체 = 이동(반복 설정 유지)');

 // ── 10. Esc·칸 밖 = 그대로 ──
 before=await snap(p);w0=await writes(p);a=await center(task('e-rep'));
 await drag(p,a,{x:a.x,y:a.y+60},{esc:true});assert.equal(await snap(p),before);
 a=await center(allday('e-range').or(task('e-range')).first());await drag(p,a,{x:5,y:5});assert.equal(await snap(p),before);assert.equal(await writes(p),w0);
 ok('Esc·칸 밖에 놓기: 그대로(저장 0)');

 // ── 11. 고유 조작 유지: 짧게 누르기 = 이름 수정(하루종일·타임라인·시간블록), 빈칸 추가 ──
 await p.waitForTimeout(500);
 await task('t-short').locator('.ag-tl-title').click();assert(await task('t-short').locator('.inline-add-input').isVisible(),'타임라인 이름 수정');await p.keyboard.press('Escape');await p.waitForTimeout(150);
 { // 0.3초 넘게 눌렀다 그대로 떼기 = 이름 수정 안 열림, 이동도 아님
  const before0=await snap(p),tt=task('t-short').locator('.ag-tl-title');await tt.evaluate(e=>e.scrollIntoView({block:'center'}));const tb=await tt.boundingBox();
  await p.mouse.move(tb.x+tb.width/2,tb.y+tb.height/2);await p.mouse.down();await p.waitForTimeout(450);await p.mouse.up();await p.waitForTimeout(250);
  assert.equal(await task('t-short').locator('.inline-add-input').count(),0,'타임라인: 길게 눌렀다 떼기 = 이름 수정 안 열림');assert.equal(await snap(p),before0,'길게 누르기만 = 이동 아님');
  await p.mouse.click(tb.x+tb.width/2,tb.y+tb.height/2);await p.waitForTimeout(200);assert(await task('t-short').locator('.inline-add-input').isVisible(),'그 뒤 짧게 누르기 = 이름 수정');await p.keyboard.press('Escape');await p.waitForTimeout(150);
 }
 await p.evaluate(()=>{mockRows.tok_todos.push({id:'t-all2',user_id:'test',title:'오늘 종일',is_done:false,...OnekanPeriod.patch('todo',{allDay:true,startDate:todayStr(),endDate:todayStr()})});return loadAll();});await p.waitForTimeout(200);
 await allday('t-all2').locator('.agenda-title').click();assert(await allday('t-all2').locator('.inline-add-input').isVisible(),'하루종일 이름 수정');await p.keyboard.press('Escape');await p.waitForTimeout(150);
 const emptyAt=await axis(p,1260,true);await p.mouse.click(emptyAt.x,emptyAt.y);await p.waitForTimeout(200);
 assert.equal(await p.evaluate(()=>document.activeElement?.matches('#agendaTimeWrap .inline-add-input')),true,'타임라인 빈칸 누르기 = 할일 추가 입력');
 await p.keyboard.press('Escape');await p.waitForTimeout(150);
 await p.locator('[data-col2tab=block]').click();await p.waitForTimeout(250);
 const blockRow=p.locator('#homeTodayBlockBody .ag-block-row[data-id="t-short"]');await blockRow.locator('.agenda-title').click();assert(await blockRow.locator('.inline-add-input').isVisible(),'시간블록 이름 수정');await p.keyboard.press('Escape');await p.waitForTimeout(150);
 await p.locator('[data-blockallday]').first().click();assert(await p.locator('#homeTodayBlockAllDay .inline-add-input').isVisible(),'시간블록 하루종일 빈칸 추가');await p.keyboard.press('Escape');
 ok('고유 조작 유지: 짧게 누르기 = 이름 수정(타임라인·하루종일·시간블록), 타임라인 길게 눌렀다 떼기 = 열리지 않음, 빈칸 누르기 = 추가');

 // ── 12. 시간블록: 블록 시작 시각, 블록 하루종일 줄 끌기 ──
 a=await center(p.locator('#homeTodayBlockAllDay .home-today-row[data-id="t-all2"]'));const card=await center(p.locator('.ag-block-card[data-block-start="780"]').first());
 await drag(p,a,card,{check:async()=>assert.match(await label(p),/오늘 종일 → .* 13:00~13:30 · 오후/)});
 await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-all2').todo_time==='13:00:00');assert.equal((await row(p,'tok_todos','t-all2')).end_time,'13:30:00');await dismissToast(p);
 ok('시간블록: 하루종일 줄을 블록에 놓으면 블록 시작부터 30분');

 // ── 14. 일정 화면에 빌려 간 '다가오는' 목록(옛 손짓)도 같은 규칙·저장: 일정 = 날짜만, 습관 다른 날 = 막음 ──
 await p.evaluate(async d=>{mockRows.tok_events.push({id:'e-side',user_id:'test',title:'옆 목록 일정',...OnekanPeriod.patch('event',{allDay:false,startDate:d,endDate:d,startTime:'18:00',endTime:'19:00'})});await loadAll();showPage('all');allViews.selectDate(d);},D[1]);
 await p.locator('#allViewTabs [data-common-view=month]').click();await p.waitForTimeout(300);
 const sideRow=p.locator('#allSideAgenda .plan-row[data-kind="event"][data-id="e-side"]').first();
 if(await sideRow.count()){
  a=await center(sideRow);const cellBox=await p.locator('#allCalGrid .cal-cell[data-date="'+D[5]+'"]').boundingBox();
  await drag(p,a,{x:cellBox.x+cellBox.width/2,y:cellBox.y+cellBox.height-6});
  await p.waitForFunction(d=>mockRows.tok_events.find(r=>r.id==='e-side').event_date===d,D[5]);r=await row(p,'tok_events','e-side');assert.equal(r.event_time,'18:00:00','날짜만(시간 유지)');assert.equal(r.end_time,'19:00:00');await dismissToast(p);
  // 옆 목록 습관 줄이 다른 날 칸에 놓인 경우(같은 저장 경로)
  before=await snap(p);w0=await writes(p);await p.evaluate(([a,b])=>moveItemToZone('habit','h1',{zone:'today-allday',type:'date',date:b,sourceDate:a}),[D[1],D[6]]);
  assert.equal(await snap(p),before,'습관 다른 날 = 그대로');assert.equal(await writes(p),w0);await dismissToast(p);
  ok('일정 화면 옆 다가오는 목록: 일정은 날짜만 이동(시간 유지), 습관 다른 날은 막음');
 }else console.log('SKIP 옆 다가오는 목록이 이 폭에서 보이지 않음');
 await p.screenshot({path:OUT+'/home-drag.png'});
 assert.deepEqual(errors,[]);

 // ── 13. 모바일 390: 짧은 밀기 = 스크롤(이동 아님), 길게 누른 뒤 끌기 = 30분 단위 이동, 짧게 누르기 = 이름 수정 ──
 const m=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,timezoneId:'Asia/Seoul'}),merr=[];m.on('pageerror',e=>merr.push(e.message));
 await fixture(m);await m.evaluate(async()=>{const t=todayStr();mockRows.tok_todos=[{id:'m1',user_id:'test',title:'모바일 할일',is_done:false,...OnekanPeriod.patch('todo',{allDay:false,startDate:t,endDate:t,startTime:'10:00',endTime:'11:00'})}];await loadAll();showPage('home');homeAgendaDate=t;renderHome();});await m.waitForTimeout(300);
 const cdp=await m.context().newCDPSession(m);const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 const mt=m.locator('#agendaTimeWrap .ag-tl-task[data-id="m1"]');let ma=await center(mt);const mw=await writes(m);
 await touch('touchStart',ma.x,ma.y);for(let i=1;i<=6;i++)await touch('touchMove',ma.x,ma.y+i*6);await touch('touchEnd');await m.waitForTimeout(300);
 assert.equal(await writes(m),mw,'짧은 밀기는 이동 아님');assert.equal(await m.locator('#agendaTimeWrap .inline-add-input').count(),0,'밀기는 이름 수정 아님');
 ma=await center(mt);await touch('touchStart',ma.x,ma.y);await m.waitForTimeout(450);for(let i=1;i<=8;i++){await touch('touchMove',ma.x,ma.y+i*2.5);await m.waitForTimeout(16);}
 assert(await m.locator('#allMoveLabel').isVisible(),'모바일 미리보기');await touch('touchEnd');
 await m.waitForFunction(()=>mockRows.tok_todos[0].todo_time==='10:30:00');assert.equal((await row(m,'tok_todos','m1')).end_time,'11:30:00'); // 20px ≈ 33분 → 30분 단위로 10:30
 assert.equal(await m.locator('#agendaTimeWrap .inline-add-input').count(),0,'끈 뒤 이름 수정 안 열림');
 await m.evaluate(()=>document.querySelector('#appToast')?.classList.remove('show'));await m.waitForTimeout(500);ma=await center(mt);await touch('touchStart',ma.x,ma.y);await m.waitForTimeout(450);await touch('touchEnd');await m.waitForTimeout(300);
 assert.equal(await mt.locator('.inline-add-input').count(),0,'모바일: 길게 눌렀다 떼기 = 이름 수정 안 열림');assert.equal((await row(m,'tok_todos','m1')).todo_time,'10:30:00','길게 누르기만 = 이동 아님');
 await m.waitForTimeout(500);ma=await center(mt);await touch('touchStart',ma.x,ma.y);await touch('touchEnd');await m.waitForTimeout(250);
 assert(await mt.locator('.inline-add-input').isVisible(),'짧게 누르기 = 이름 수정');
 await m.screenshot({path:OUT+'/home-drag-mobile.png'});assert.deepEqual(merr,[]);
 ok('모바일 390: 짧은 밀기 = 이동 아님, 0.3초 누른 뒤 끌기 = 30분 단위 이동, 길게 눌렀다 떼기 = 이름 수정 안 열림, 짧게 누르기 = 이름 수정');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
