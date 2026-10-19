// 2026-10-18 3단계: 일정 화면 끌어 옮기기 검증(월·주 보드·주 타임라인·일 보기 시간블록·타임라인, 일정·할일·습관).
// 날짜만 → 시간·기간 유지, 시간 칸 → 놓은 시각·소요시간 유지, 하루종일 → 시간 칸 30분, 시간 → 하루종일 해제, 시간블록 → 블록 시작,
// 반복 범위 선택(이번만 비활성 이유 표시·취소 = 원본), 완료·건너뜀 기록 보존, 영역 밖·Esc·실패 = 원래대로, 저장 중 중복 변경 막기,
// 10초 실행 취소(후속 변경과 충돌하면 덮어쓰지 않음), 모바일 길게 누르기(짧은 밀기 = 스크롤, 탭 = 기존 동작). 가짜 Supabase만 씀.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
const OUT='test-results/schedule-drag';
const ok=m=>console.log('PASS '+m);
async function seed(p){
 return p.evaluate(async()=>{
  const t=todayStr(),mon=addDaysStr(t,-((new Date(t+'T12:00:00').getDay()+6)%7)),d=i=>addDaysStr(mon,i);
  const T=(k,a,s,e,b)=>OnekanPeriod.patch(k,{allDay:false,startDate:a,endDate:b||a,startTime:s,endTime:e}),A=(k,a,b)=>OnekanPeriod.patch(k,{allDay:true,startDate:a,endDate:b||a});
  mockRows.tok_time_blocks=[{id:'b1',user_id:'test',title:'오전',start_minute:540,end_minute:720,sort_order:0},{id:'b2',user_id:'test',title:'오후',start_minute:780,end_minute:1080,sort_order:1}];
  mockRows.tok_todos=[
   {id:'t-timed',user_id:'test',title:'시간 할일',is_done:false,...T('todo',d(1),'10:00','11:30')},
   {id:'t-all',user_id:'test',title:'종일 할일',is_done:false,...A('todo',d(1))},
   {id:'t-rdone',user_id:'test',title:'반복 할일',is_done:true,repeat_unit:'day',repeat_interval:1,...A('todo',d(2))},
   {id:'t-repeat',user_id:'test',title:'반복 할일',is_done:false,repeat_unit:'day',repeat_interval:1,repeat_chain_id:'t-rdone',repeat_source_id:'t-rdone',...A('todo',d(3))},
   {id:'t-rearly',user_id:'test',title:'반복 할일',is_done:false,repeat_unit:'day',repeat_interval:1,repeat_chain_id:'t-rdone',...A('todo',d(0))}, // 같은 반복의 아직 안 한 앞 회차
   {id:'t-weekly',user_id:'test',title:'수요일 반복',is_done:false,repeat_unit:'week',repeat_interval:1,repeat_days:[3],...T('todo',d(2),'08:00','08:30')}, // 요일을 정해 둔 반복
   {id:'t-repeat2',user_id:'test',title:'반복 할일',is_done:false,repeat_unit:'day',repeat_interval:1,repeat_chain_id:'t-rdone',repeat_source_id:'t-repeat',...A('todo',d(10))}, // 같은 반복의 아직 안 한 다른 회차
   {id:'t-day-all',user_id:'test',title:'블록에 넣을 할일',is_done:false,...A('todo',d(4))},
   {id:'t-day-timed',user_id:'test',title:'오전 할일',is_done:false,...T('todo',d(4),'10:00','11:00')},
  ];
  mockRows.tok_events=[
   {id:'e-range',user_id:'test',title:'이틀 일정',...A('event',d(1),d(2))},
   {id:'e-timed',user_id:'test',title:'시간 일정',...T('event',d(2),'14:00','15:00')},
   {id:'e-repeat',user_id:'test',title:'매주 일정',repeat_unit:'week',repeat_interval:1,...A('event',d(7))}, // 지난 반복 일정은 앱이 다음 회차로 옮기므로 다음 주에 둠
   {id:'e-day',user_id:'test',title:'오후 일정',...T('event',d(4),'15:00','16:00')},
   {id:'e-legacy',user_id:'test',title:'끝 없는 옛 일정',event_date:d(5),event_time:'09:00:00'},
  ];
  mockRows.tok_habits=[{id:'h1',user_id:'test',name:'스트레칭',is_active:true,start_date:d(0),repeat_unit:'day',repeat_interval:1,...T('habit',d(0),'07:00','07:30')}];
  mockRows.tok_habit_logs=[{id:'l1',habit_id:'h1',done_date:d(1),start_minute:420,duration_minutes:30}];mockRows.tok_habit_skips=[{habit_id:'h1',skip_date:d(5)}];
  await loadAll();showPage('all');
  return Array.from({length:14},(_,i)=>d(i));
 });
}
const writes=p=>p.evaluate(()=>mockWrites.filter(w=>w.op!=='select').length);
const row=(p,table,id)=>p.evaluate(([t,i])=>({...mockRows[t].find(r=>r.id===i)}),[table,id]);
const center=async(loc,scroll=true)=>{if(scroll)await loc.scrollIntoViewIfNeeded();const b=await loc.boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
async function drag(p,from,to,{esc=false,check}={}){
 await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+10,from.y+8,{steps:3});await p.mouse.move(to.x,to.y,{steps:10});
 if(check)await check();if(esc)await p.keyboard.press('Escape');await p.mouse.up();await p.waitForTimeout(250);
}
// 타임라인 칸(.ag-tl-content)의 그 시각 위치(그 줄이 보이게 스크롤한 뒤)
async function axis(p,sel,minute,fx=.5,scroll=true){
 const box=p.locator(sel);if(scroll)await box.evaluate((e,m)=>{const line=e.parentElement.querySelector('[data-minute="'+Math.floor(m/60)*60+'"]');(line||e).scrollIntoView({block:'center'});},minute);
 return box.evaluate((e,[m,f])=>{const r=e.getBoundingClientRect(),s=Number(e.dataset.timeScale)||0.6;return {x:r.left+r.width*f,y:r.top+(m-Number(e.dataset.minM))*s+1};},[minute,fx]);
}
const toastUndo=p=>p.locator('#appToast .toast-action');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 fs.mkdirSync(OUT,{recursive:true});
 const p=await b.newPage({viewport:{width:1800,height:900},timezoneId:'Asia/Seoul'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
 await fixture(p);const D=await seed(p);
 const go=async(v,sub)=>{await p.locator('#allViewTabs [data-common-view='+v+']').click();if(sub&&await p.evaluate(v=>allViews.prefs()[v],v)!==sub)await p.locator('#allSubTabs [data-all-sub='+sub+']').click();await p.waitForTimeout(120);};
 await go('week','board');await p.evaluate(d=>allViews.selectDate(d),D[1]);await p.waitForTimeout(120);
 const card=(id,d)=>p.locator('#allWeekBoard '+(d?'[data-awb-col="'+d+'"] ':'')+'[data-awb-id="'+id+'"]').first(),col=d=>p.locator('#allWeekBoard [data-awb-col="'+d+'"]');

 // ── 1. 주 보드: 날짜만 이동 → 시간·소요시간 유지, 미리보기(원래 자리 흐림 + 도착 자리 반투명 + 적용 날짜·시간) ──
 let w=await writes(p);
 await drag(p,await center(card('todo|t-timed')),await center(col(D[3]).locator('.awb-head')),{check:async()=>{
  assert.equal(await p.locator('#allWeekBoard .sd-source[data-awb-id="todo|t-timed"]').count(),1,'원래 자리 흐리게');
  assert(await col(D[3]).evaluate(e=>e.classList.contains('sd-drop')),'도착 자리 표시');
  assert(await p.locator('#allMoveLabel .sd-ghost-card .sd-preview').isVisible(),'반투명 미리보기');
  assert.equal(await col(D[3]).evaluate(e=>e.querySelectorAll('.sd-preview').length),0,'미리보기가 목록을 밀지 않음');await p.screenshot({path:OUT+'/board-dragging.png'});
  assert.match(await p.locator('#allMoveLabel').textContent(),new RegExp(Number(D[3].slice(5,7))+'/'+Number(D[3].slice(8))+'.*10:00~11:30'),'적용될 날짜·시간 안내');}});
 await p.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-timed').start_date===d,D[3]);
 let r=await row(p,'tok_todos','t-timed');assert.equal(r.todo_time,'10:00:00');assert.equal(r.end_time,'11:30:00');assert.equal(r.duration_minutes,90);assert.equal(await writes(p),w+1);
 assert.equal(await p.locator('.sd-slot,.sd-source,.sd-drop').count(),0,'끝나면 미리보기 정리');assert(await p.locator('#allMoveLabel').isHidden());
 // 10초 실행 취소
 assert(await toastUndo(p).isVisible(),'실행 취소 버튼');await toastUndo(p).click();
 await p.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-timed').start_date===d,D[1]);r=await row(p,'tok_todos','t-timed');assert.equal(r.todo_time,'10:00:00');
 assert.match(await p.locator('#allSaveStatus').textContent(),/원래대로 되돌렸어요/);
 ok('주 보드: 날짜만 이동(시간·소요시간 유지), 원래 자리 흐림·도착 미리보기·적용 날짜 시간, 실행 취소');

 // ── 2. 여러 날 항목: 둘째 날 조각을 잡아 옮겨도 기간 유지 ──
 await drag(p,await center(card('event|e-range',D[2])),await center(col(D[4]).locator('.awb-head')));
 await p.waitForFunction(d=>mockRows.tok_events.find(r=>r.id==='e-range').event_date===d,D[3]);
 r=await row(p,'tok_events','e-range');assert.equal(r.end_date,D[4],'이틀 기간 유지');assert.equal(r.all_day,true);
 ok('여러 날 항목: 잡은 날과 놓은 날 차이만큼, 기간 유지');

 // ── 3. 막힘·취소: 습관 날짜 이동, 완료 기록, 반복 완료 회차, 종료 없는 옛 항목, Esc, 영역 밖, 저장 실패 ──
 w=await writes(p);
 await drag(p,await center(card('habit|h1|planned|'+D[2])),await center(col(D[4]).locator('.awb-head')));
 assert.match(await p.locator('#allSaveStatus').textContent(),/습관 회차는 다른 날로 옮길 수 없어요/);
 await drag(p,await center(card('habit|h1|done|'+D[1])),await center(col(D[4]).locator('.awb-head')));
 assert.match(await p.locator('#allSaveStatus').textContent(),/완료·건너뜀 기록은 옮기지 않아요/);
 await drag(p,await center(card('todo|t-rdone')),await center(col(D[4]).locator('.awb-head')));
 assert.match(await p.locator('#allSaveStatus').textContent(),/완료한 반복 회차는 기록이라/);
 await drag(p,await center(card('event|e-legacy')),await center(col(D[4]).locator('.awb-head')));
 assert.match(await p.locator('#allSaveStatus').textContent(),/종료 시각이 없는 기존 항목/);
 await drag(p,await center(card('todo|t-all')),await center(col(D[4]).locator('.awb-head')),{esc:true});
 assert.equal(await p.locator('.sd-source,.sd-drop').count(),0);assert(await p.locator('#allMoveLabel').isHidden());
 await drag(p,await center(card('todo|t-all')),await center(p.locator('#allViewTabs')));
 assert.match(await p.locator('#allSaveStatus').textContent(),/달력 밖/);
 assert.equal(await writes(p),w,'막힘·취소는 저장하지 않음');
 await p.evaluate(()=>{mockFailure='simulated failure';});
 await drag(p,await center(card('todo|t-all')),await center(col(D[4]).locator('.awb-head')));
 await p.waitForFunction(()=>/저장하지 못했어요/.test(document.getElementById('allSaveStatus').textContent));
 assert.equal((await row(p,'tok_todos','t-all')).start_date,D[1],'실패 = 원래 날짜');assert.equal(await card('todo|t-all',D[1]).count(),1,'원래 자리에 다시 표시');
 ok('습관 날짜 이동·완료 기록·반복 완료 회차·종료 없는 옛 항목은 막고 안내, Esc·영역 밖·저장 실패는 원래대로');

 // ── 4. 반복: 반복 할일은 끌어 옮기지 않음(저장 요청 0, 상세 수정 안내), 반복 일정은 한 건 저장 범위만 ──
 const snap=()=>p.evaluate(()=>JSON.stringify({t:mockRows.tok_todos,e:mockRows.tok_events,h:mockRows.tok_habits,l:mockRows.tok_habit_logs,s:mockRows.tok_habit_skips}));
 // 저장 요청 수(insert·update·upsert·delete 호출)를 셈 — 실제로 보내기 전 단계에서 셈
 await p.evaluate(()=>{window.saveCalls=0;const orig=sb.from;sb.from=t=>{const q=orig(t);return new Proxy(q,{get(o,k){if(['insert','update','upsert','delete'].includes(k))window.saveCalls++;return o[k];}});};});
 const calls=()=>p.evaluate(()=>window.saveCalls);
 const scope=p.locator('#allScopeBg'),opt=id=>scope.locator('[data-scope='+id+']'),isOpen=()=>scope.evaluate(e=>e.classList.contains('open'));
 const REPEAT=/반복 할일의 날짜·시간 변경은 상세 수정에서 해주세요/;
 // (a) 다른 회차가 있는 반복 할일(앞 t-rearly·뒤 t-repeat2) / (b) 다른 회차가 없는 반복 할일 / (c) 요일 반복 할일: 모두 끌어도 범위 창 없이 안내, 저장 요청 0
 const blocked=async(id,to,m)=>{const s0=await snap(),c0=await calls();
  await drag(p,await center(card(id)),await center(col(to).locator('.awb-head')),{check:async()=>{assert.match(await p.locator('#allMoveLabel').textContent(),REPEAT,m+': 끄는 중 안내');}});
  assert.equal(await isOpen(),false,m+': 범위 창 없음');assert.match(await p.locator('#allSaveStatus').textContent(),REPEAT,m+': 놓은 뒤 안내');
  assert.equal(await calls(),c0,m+': 저장 요청 0');assert.equal(await snap(),s0,m+': 데이터 그대로');};
 await blocked('todo|t-repeat',D[5],'다른 회차 있는 반복 할일');
 await blocked('todo|t-weekly',D[4],'요일 반복 할일');
 // 안내 문구가 맞는지: 상세 수정은 이 회차 한 행의 날짜만 바꾸고(반복 설정 유지) 이미 있는 다른 회차·완료 회차는 그대로
 const others0=await p.evaluate(()=>JSON.stringify(mockRows.tok_todos.filter(r=>['t-rearly','t-repeat2','t-rdone'].includes(r.id))));
 await p.evaluate(()=>openTodoSheet(todos.find(t=>t.id==='t-repeat')));await p.locator('#td_start').fill(D[5]);await p.locator('#td_end').fill(D[5]);await p.locator('#todoSaveBtn').click();
 await p.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-repeat').start_date===d,D[5]);
 const edited=await row(p,'tok_todos','t-repeat');assert.equal(edited.repeat_unit,'day');assert.equal(edited.repeat_interval,1);
 assert.equal(await p.evaluate(()=>JSON.stringify(mockRows.tok_todos.filter(r=>['t-rearly','t-repeat2','t-rdone'].includes(r.id)))),others0,'상세 수정: 다른 회차·완료 회차 그대로');
 await p.evaluate(async d=>{const r=mockRows.tok_todos.find(x=>x.id==='t-repeat');r.start_date=d;r.occurrence_end_date=d;await loadAll();},D[3]);await p.waitForTimeout(150);
 await p.evaluate(async()=>{mockRows.tok_todos=mockRows.tok_todos.filter(r=>r.id!=='t-repeat2'&&r.id!=='t-rearly');await loadAll();});await p.waitForTimeout(150);
 await blocked('todo|t-repeat',D[5],'다른 회차 없는 반복 할일');
 assert.match(await p.locator('#allSaveStatus').textContent(),/이 회차의 날짜·시간과 반복 설정을 바꿀 수 있고, 다음 회차는 바꾼 날짜 기준으로 생겨요. 이미 만들어진 다른 회차는 바뀌지 않아요/,'상세 수정이 실제로 하는 일만 안내');
 // 일반 할일은 그대로 한 건 저장
 let c0=await calls();await drag(p,await center(card('todo|t-all')),await center(col(D[2]).locator('.awb-head')));
 await p.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-all').start_date===d,D[2]);assert.equal(await calls(),c0+1,'일반 할일: 요청 한 번');
 await toastUndo(p).click();await p.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-all').start_date===d,D[1]);
 // 반복 일정: 한 건 저장이라 '이번부터 이후'는 전체가 바뀜 → 끄고 이유, '전체'만(요청 한 번)
 await p.evaluate(d=>allViews.selectDate(d),D[8]);await p.waitForTimeout(120);
 c0=await calls();await drag(p,await center(card('event|e-repeat')),await center(col(D[9]).locator('.awb-head')));
 assert(await isOpen(),'반복 일정은 범위 창');await p.screenshot({path:OUT+'/scope-dialog.png'});
 assert(await opt('one').isDisabled());assert(await opt('future').isDisabled(),'일정 이번부터 이후 비활성');assert.match(await opt('future').textContent(),/전체가 바뀌어요/);
 await opt('one').click({force:true});await opt('future').click({force:true});assert.equal(await calls(),c0,'꺼진 범위: 요청 0');
 await opt('all').click();await p.waitForFunction(d=>mockRows.tok_events.find(r=>r.id==='e-repeat').event_date===d,D[9]);assert.equal(await calls(),c0+1,'전체: 요청 한 번');
 await p.evaluate(d=>allViews.selectDate(d),D[1]);await p.waitForTimeout(120);
 assert.equal((await row(p,'tok_events','e-repeat')).repeat_unit,'week','반복 설정 유지');
 ok('반복: 반복 할일은 회차 수와 관계없이 끌어 옮기지 않음(범위 창 없이 상세 수정 안내, 저장 요청 0, 데이터 그대로), 일반 할일·반복 일정 전체는 요청 한 번, 일정 이후·이번만은 이유와 함께 끔');

 // ── 4-2. 지원하지 않는 범위를 누르거나 취소하면 날짜·시간·반복 설정·기록이 하나도 안 바뀜 ──
 const before=await snap();w=await writes(p);
 const unchanged=async m=>{await p.waitForTimeout(200);assert.equal(await snap(),before,m+': 데이터 그대로');assert.equal(await writes(p),w,m+': 저장 없음');};
 // 반복 일정: 꺼진 '이번만'·'이번부터 이후'를 누르고 Esc / 취소 버튼 / 창 바깥 누르기
 await p.evaluate(d=>allViews.selectDate(d),D[9]);await p.waitForTimeout(120);
 await drag(p,await center(card('event|e-repeat')),await center(col(D[11]).locator('.awb-head')));
 await opt('one').click({force:true});await opt('future').click({force:true});await p.keyboard.press('Escape');assert.equal(await isOpen(),false,'꺼진 범위를 누른 뒤에도 Esc로 닫힘');await unchanged('반복 일정 Esc');
 await drag(p,await center(card('event|e-repeat')),await center(col(D[11]).locator('.awb-head')));await scope.locator('[data-scope-cancel]').click();await unchanged('반복 일정 취소 버튼');
 await drag(p,await center(card('event|e-repeat')),await center(col(D[11]).locator('.awb-head')));await scope.click({position:{x:5,y:5}});await unchanged('반복 일정 바깥 누르기');
 await p.evaluate(d=>allViews.selectDate(d),D[1]);await p.waitForTimeout(120);
 // 끄는 중 Esc, 영역 밖에 놓기(일반 할일)
 await drag(p,await center(card('todo|t-all')),await center(col(D[6]).locator('.awb-head')),{esc:true});await unchanged('끄는 중 Esc');
 await drag(p,await center(card('todo|t-all')),await center(p.locator('#allViewTabs')));await unchanged('영역 밖');
 // 습관: 다른 날(지원 안 함) / 같은 날 시간 변경 창에서 꺼진 범위 누르고 취소 — 완료·건너뜀 기록 포함 그대로
 await drag(p,await center(card('habit|h1|planned|'+D[3])),await center(col(D[4]).locator('.awb-head')));await unchanged('습관 다른 날');
 assert.equal(await scope.evaluate(e=>e.classList.contains('open')),false,'습관 다른 날은 창 없이 안내만');
 ok('지원하지 않는 범위(눌러도 무시)·Esc·취소 버튼·바깥 누르기·끄는 중 Esc·영역 밖·습관 다른 날: 날짜·시간·반복 설정·완료·건너뜀 기록 모두 그대로, 저장 없음');

 // ── 4-3. 반복 일정 한 건 저장: 실패·그사이 다른 곳 변경·실행 취소 충돌에도 덮어쓰지 않음, 기록 보존 ──
 const records=()=>p.evaluate(()=>JSON.stringify([mockRows.tok_todos.find(r=>r.id==='t-rdone'),mockRows.tok_habit_logs,mockRows.tok_habit_skips]));
 const rec0=await records(),evRow=()=>row(p,'tok_events','e-repeat');
 await p.evaluate(d=>allViews.selectDate(d),D[8]);await p.waitForTimeout(120);
 const moveAll=async to=>{await drag(p,await center(card('event|e-repeat')),await center(col(to).locator('.awb-head')));await opt('all').click();};
 // (1) 저장 실패 → 그대로
 let all0=await snap();await p.evaluate(()=>{mockFailure='network down';});await moveAll(D[11]);
 await p.waitForFunction(()=>/저장하지 못했어요/.test(document.getElementById('allSaveStatus').textContent));assert.equal(await snap(),all0,'저장 실패: 전부 그대로');
 // (2) 범위를 고르는 사이 다른 곳에서 바뀜 → 덮어쓰지 않음
 await drag(p,await center(card('event|e-repeat')),await center(col(D[11]).locator('.awb-head')));
 await p.evaluate(()=>{mockRows.tok_events.find(x=>x.id==='e-repeat').title='다른 기기에서 바꾼 일정';mockRows.tok_events.find(x=>x.id==='e-repeat').event_date=addDaysStr(mockRows.tok_events.find(x=>x.id==='e-repeat').event_date,1);mockRows.tok_events.find(x=>x.id==='e-repeat').end_date=mockRows.tok_events.find(x=>x.id==='e-repeat').event_date;});const elsewhere=await snap();
 await opt('all').click();await p.waitForFunction(()=>/그사이 다른 곳에서 바뀌어서 옮기지 않았어요/.test(document.getElementById('allSaveStatus').textContent));
 assert.equal(await snap(),elsewhere,'다른 곳 변경을 덮어쓰지 않음');assert.equal(await records(),rec0);
 // (3) 정상 이동 후 다른 곳에서 바뀌면 실행 취소가 덮어쓰지 않음
 await p.evaluate(async()=>{await loadAll();});await p.waitForTimeout(150);
 const e1=await evRow();await moveAll(D[12]);await p.waitForFunction(d=>mockRows.tok_events.find(r=>r.id==='e-repeat').event_date===d,D[12]);assert.equal(await records(),rec0,'완료·건너뜀 기록 그대로');
 await p.evaluate(()=>{mockRows.tok_events.find(x=>x.id==='e-repeat').all_day=false;mockRows.tok_events.find(x=>x.id==='e-repeat').event_time='07:00:00';});const changed=await snap();
 await toastUndo(p).click();await p.waitForFunction(()=>/덮어쓰지 않았어요/.test(document.getElementById('allSaveStatus').textContent));assert.equal(await snap(),changed,'실행 취소 충돌: 덮어쓰지 않음');
 // 원래 자리로
 await p.evaluate(async e=>{const r=mockRows.tok_events.find(x=>x.id==='e-repeat');Object.assign(r,e);await loadAll();},e1);await p.evaluate(d=>allViews.selectDate(d),D[1]);await p.waitForTimeout(150);
 ok('반복 일정 한 건 저장: 저장 실패 = 그대로, 범위 선택 중 다른 곳 변경·실행 취소 충돌 = 덮어쓰지 않음, 완료·건너뜀 기록 보존');

 // ── 5. 저장 중 같은 항목 중복 변경 막기 ──
 w=await writes(p);await p.evaluate(()=>{mockDelay=2500;});
 await drag(p,await center(card('todo|t-all')),await center(col(D[2]).locator('.awb-head')));
 assert.match(await p.locator('#allSaveStatus').textContent(),/저장 중/);
 await drag(p,await center(card('todo|t-all')),await center(col(D[5]).locator('.awb-head')));
 assert.match(await p.locator('#allSaveStatus').textContent(),/저장 중이에요/);
 await p.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-all').start_date===d,D[2]);await p.waitForTimeout(300);
 assert.equal(await writes(p),w+1,'두 번째 변경은 저장하지 않음');assert.equal((await row(p,'tok_todos','t-all')).start_date,D[2]);
 // 실행 취소 충돌: 그사이 다른 곳에서 바뀌면 덮어쓰지 않음
 await p.evaluate(()=>{mockRows.tok_todos.find(r=>r.id==='t-all').start_date=addDaysStr(mockRows.tok_todos.find(r=>r.id==='t-all').start_date,1);mockRows.tok_todos.find(r=>r.id==='t-all').occurrence_end_date=mockRows.tok_todos.find(r=>r.id==='t-all').start_date;});
 const changedElsewhere=await row(p,'tok_todos','t-all');await toastUndo(p).click();await p.waitForTimeout(300);
 assert.deepEqual(await row(p,'tok_todos','t-all'),changedElsewhere,'후속 변경 덮어쓰지 않음');assert.match(await p.locator('#allSaveStatus').textContent(),/덮어쓰지 않았어요/);
 ok('저장 중 같은 항목 두 번째 끌기는 막음, 실행 취소는 후속 변경과 충돌하면 덮어쓰지 않음');

 // ── 6. 주 타임라인: 하루종일 → 시간 칸(30분), 시간 → 하루종일(해제), 시간 안에서 끌기(소요시간 유지) ──
 await go('week','timeline');await p.evaluate(d=>allViews.selectDate(d),D[1]);await p.waitForTimeout(150);
 const tl=d=>'#allTimeDays .ag-tl-content[data-time-date="'+d+'"]';
 let target=await axis(p,tl(D[1]),12*60+10,.3);
 await drag(p,await center(p.locator('#allTimeDays [data-event-id="todo|t-timed"]'),false),target,{check:async()=>{assert.equal(await p.locator(tl(D[1])+' .sd-slot').count(),1,'시간 칸 미리보기');await p.screenshot({path:OUT+'/timeline-dragging.png'});}});
 await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-timed').todo_time!=='10:00:00');r=await row(p,'tok_todos','t-timed');
 assert.equal(r.duration_minutes,90,'소요시간 유지');assert.equal(r.start_date,D[1]);const movedStart=OnekanPeriodMinutes(r.todo_time);assert(movedStart>600&&movedStart%30===0,'타임라인 안 이동 30분 단위 '+r.todo_time);
 const rangeRow=p.locator('#allTimeDays [data-event-id="event|e-range"]').first();await rangeRow.evaluate(e=>e.scrollIntoView({block:'center'})); // 위쪽 고정 날짜 머리에 가리지 않게
 const srcPt=await center(rangeRow,false);target=await axis(p,tl(D[5]),7*60,.6,false); // 하루종일 줄과 아침 시간이 같이 보이는 자리
 assert(target.y>0&&target.y<900,'놓을 자리가 화면 안');
 await drag(p,srcPt,target);
 await p.waitForFunction(()=>mockRows.tok_events.find(r=>r.id==='e-range').all_day===false);r=await row(p,'tok_events','e-range');
 assert.equal(r.event_date,D[5]);assert.equal(r.event_time,'07:00:00');assert.equal(r.end_date,D[5]);assert.equal(r.end_time,'07:30:00');assert.equal(r.duration_minutes,30,'여러 날 하루종일 → 놓은 날 30분');
 const zone=p.locator('#allTimeDays [data-all-date="'+D[3]+'"]');await zone.evaluate(e=>{e.scrollIntoView({block:'start'});scrollBy(0,-90);});
 const timedPt=await center(p.locator('#allTimeDays [data-event-id="event|e-timed"]'),false),zonePt=await center(zone,false);assert(timedPt.y<890&&zonePt.y>0,'둘 다 화면 안');
 await drag(p,timedPt,zonePt);
 await p.waitForFunction(()=>mockRows.tok_events.find(r=>r.id==='e-timed').all_day===true);r=await row(p,'tok_events','e-timed');
 assert.equal(r.event_date,D[3]);assert.equal(r.end_date,D[3]);assert.equal(r.event_time,null);assert.equal(r.end_time,null);
 ok('주 타임라인: 시간 안 이동(소요시간 유지·30분 단위), 하루종일 → 시간 칸 30분(여러 날도 놓은 날 하루), 시간 → 하루종일 해제');

 // ── 7. 일 보기 시간블록: 하루종일 → 블록(블록 시작·30분), 시간 항목 → 다른 블록(블록 시작·소요시간 유지), 짧게 누르기 = 이름 수정 ──
 await go('day','blocks');await p.evaluate(d=>allViews.selectDate(d),D[4]);await p.waitForTimeout(250);
 const block=m=>p.locator('#allHomeDay .ag-block-card[data-block-start="'+m+'"]');
 const both=async(src,dst)=>{await dst.evaluate(e=>e.scrollIntoView({block:'center'}));const a=await center(src,false),c=await center(dst,false);assert(a.y>0&&a.y<900&&c.y>0&&c.y<900,'둘 다 화면 안');return [a,c];};
 let [pa,pb]=await both(p.locator('#allHomeDay .plan-row[data-id="t-day-all"]:visible'),block(780));
 await drag(p,pa,pb,{check:async()=>{assert.match(await p.locator('#allMoveLabel').textContent(),/13:00~13:30 · 오후/);await p.screenshot({path:OUT+'/blocks-dragging.png'});}});
 await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-day-all').all_day===false);r=await row(p,'tok_todos','t-day-all');
 assert.equal(r.todo_time,'13:00:00');assert.equal(r.end_time,'13:30:00');assert.equal(r.start_date,D[4]);
 await p.waitForTimeout(200);
 [pa,pb]=await both(p.locator('#allHomeDay .ag-block-card .plan-row[data-id="t-day-timed"]'),block(780));await drag(p,pa,pb);
 await p.waitForFunction(()=>mockRows.tok_todos.find(r=>r.id==='t-day-timed').todo_time==='13:00:00');assert.equal((await row(p,'tok_todos','t-day-timed')).duration_minutes,60);
 assert.equal(await p.locator('#allHomeDay .inline-add-input').count(),0,'끌기 후 이름 수정 창 안 열림');
 await p.waitForTimeout(200);await p.locator('#allHomeDay .plan-row[data-id="t-day-timed"]:visible .agenda-title').click();
 assert(await p.locator('#allHomeDay .inline-add-input').isVisible(),'짧게 누르기 = 이름 수정(기존 규칙)');await p.keyboard.press('Escape');
 ok('일 보기 시간블록: 하루종일 → 블록 시작 30분, 블록 간 이동 = 블록 시작·소요시간 유지, 짧게 누르기 = 이름 수정');

 // ── 8. 일 보기 타임라인: 일정 시간 이동, 습관은 같은 날 시간만(범위: 전체만 가능, 기록 보존) ──
 await go('day','timeline');await p.waitForTimeout(250);
 const dayAxis='#allHomeDay .ag-tl-content[data-date="'+D[4]+'"]';
 const ev=p.locator('#allHomeDay .ag-tl-task[data-id="e-day"]');
 const evBox=await (async()=>{await ev.scrollIntoViewIfNeeded();return ev.boundingBox();})();
 await drag(p,{x:evBox.x+evBox.width*.4,y:evBox.y+evBox.height/2},{x:evBox.x+evBox.width*.4,y:evBox.y+evBox.height/2+36});
 await p.waitForFunction(()=>mockRows.tok_events.find(r=>r.id==='e-day').event_time!=='15:00:00');r=await row(p,'tok_events','e-day');
 assert.equal(r.event_time,'16:00:00');assert.equal(r.end_time,'17:00:00','소요시간 유지');
 const logs0=await p.evaluate(()=>JSON.stringify(mockRows.tok_habit_logs));
 const hb=p.locator('#allHomeDay .ag-tl-task[data-id="h1"]');
 await hb.evaluate(e=>e.scrollIntoView({block:'center'}));const hbox2=await hb.boundingBox(),hy=hbox2.y+hbox2.height/2; // 끝부분(위아래 8px)은 길이 조절이라 가운데를 잡음
 await drag(p,{x:hbox2.x+hbox2.width*.4,y:hy},{x:hbox2.x+hbox2.width*.4,y:hy+36},{check:async()=>{assert.equal(await p.locator(dayAxis+' .sd-slot').count(),1,'일 보기 타임라인 미리보기');}});
 assert(await scope.evaluate(e=>e.classList.contains('open')),'습관도 범위 선택');assert(await scope.locator('[data-scope=one]').isDisabled());assert(await scope.locator('[data-scope=future]').isDisabled());
 // 꺼진 범위(이번만·이번부터 이후)를 누르고 취소 → 습관·완료·건너뜀 기록 그대로, 저장 없음
 const hsnap=()=>p.evaluate(()=>JSON.stringify([mockRows.tok_habits,mockRows.tok_habit_logs,mockRows.tok_habit_skips])),h0=await hsnap(),hw=await writes(p);
 await scope.locator('[data-scope=one]').click({force:true});await scope.locator('[data-scope=future]').click({force:true});await scope.locator('[data-scope-cancel]').click();await p.waitForTimeout(200);
 assert.equal(await hsnap(),h0,'습관 꺼진 범위·취소 = 그대로');assert.equal(await writes(p),hw);
 await hb.evaluate(e=>e.scrollIntoView({block:'center'}));const hbox3=await hb.boundingBox(),hy3=hbox3.y+hbox3.height/2;
 await drag(p,{x:hbox3.x+hbox3.width*.4,y:hy3},{x:hbox3.x+hbox3.width*.4,y:hy3+36});
 await scope.locator('[data-scope=all]').click();await p.waitForFunction(()=>mockRows.tok_habits[0].start_minute!==420);
 const h=await row(p,'tok_habits','h1');assert.equal(h.start_minute,480);assert.equal(h.end_time,'08:30:00');assert.equal(h.duration_minutes,30);
 assert.equal(await p.evaluate(()=>JSON.stringify(mockRows.tok_habit_logs)),logs0,'완료 기록 그대로');
 ok('일 보기 타임라인: 일정 시간 이동(소요시간 유지), 습관은 같은 날 시간만·전체 범위(꺼진 범위·취소는 그대로)·완료 기록 보존');

 // ── 9. 월: 막대를 다른 날로(미리보기는 도착 칸 안) ──
 await go('month');await p.evaluate(d=>allViews.selectDate(d),D[1]);await p.waitForTimeout(150);
 const chip=p.locator('#allCalGrid .cal-chip[data-id="event|e-repeat"]').first();
 const to=p.locator('#allCalGrid .cal-cell[data-date="'+D[6]+'"]');
 const e0=await row(p,'tok_events','e-repeat');await p.evaluate(()=>document.getElementById('appToast')?.classList.remove('show')); // 앞 단계 실행 취소 알림(10초)이 아래 줄 막대를 가리지 않게
 await drag(p,await center(chip),await center(to),{check:async()=>{assert(await to.evaluate(e=>e.classList.contains('sd-drop')),'도착 칸 표시');assert(await p.locator('#allMoveLabel .sd-preview').isVisible());}});
 await p.locator('#allScopeBg [data-scope=all]').click();await p.waitForFunction(d=>mockRows.tok_events.find(r=>r.id==='e-repeat').event_date===d,D[6]);
 assert.equal((await row(p,'tok_events','e-repeat')).all_day,e0.all_day);
 await p.screenshot({path:OUT+'/month-after.png'});
 ok('월: 막대를 다른 날로(도착 칸 미리보기), 반복 일정은 범위 선택 후 저장');
 assert.deepEqual(errors,[]);await p.close();

 // ── 10. 모바일 390: 길게 누른 뒤 이동, 짧은 밀기 = 스크롤(저장 없음), 탭 = 기존 동작 ──
 const m=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,timezoneId:'Asia/Seoul'}),merr=[];m.on('pageerror',e=>merr.push(e.message));
 await fixture(m);const MD=await seed(m);
 await m.locator('#allViewTabs [data-common-view=month]').click();await m.evaluate(d=>allViews.selectDate(d),MD[1]);await m.waitForTimeout(200);
 const cdp=await m.context().newCDPSession(m);
 const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 const mchip=m.locator('#allCalGrid .cal-chip[data-id="event|e-timed"]').first(),mto=m.locator('#allCalGrid .cal-cell[data-date="'+MD[4]+'"]');
 await mchip.scrollIntoViewIfNeeded();let a=await center(mchip),c=await center(mto);const mw=await writes(m);
 // 짧은 밀기(길게 누르기 전 움직임) = 스크롤로 보고 옮기지 않음
 await touch('touchStart',a.x,a.y);for(let i=1;i<=6;i++)await touch('touchMove',a.x+(c.x-a.x)*i/6,a.y+(c.y-a.y)*i/6);await touch('touchEnd');await m.waitForTimeout(300);
 assert.equal(await writes(m),mw,'짧은 밀기는 이동 아님');assert.equal(await m.locator('.sd-source').count(),0);
 // 길게 누른 뒤 이동
 a=await center(mchip);c=await center(mto);
 await touch('touchStart',a.x,a.y);await m.waitForTimeout(450);for(let i=1;i<=8;i++){await touch('touchMove',a.x+(c.x-a.x)*i/8,a.y+(c.y-a.y)*i/8);await m.waitForTimeout(16);}
 assert(await mto.evaluate(e=>e.classList.contains('sd-drop')),'모바일 도착 칸 표시');assert(await m.locator('#allMoveLabel .sd-preview').isVisible(),'모바일 미리보기');await m.screenshot({path:OUT+'/mobile-dragging.png'});
 await touch('touchEnd');await m.waitForFunction(d=>mockRows.tok_events.find(r=>r.id==='e-timed').event_date===d,MD[4]);
 assert.equal((await row(m,'tok_events','e-timed')).event_time,'14:00:00','날짜만 이동 = 시간 유지');
 // 탭 = 기존(날짜 선택)
 await m.waitForTimeout(300);const cell=m.locator('#allCalGrid .cal-cell[data-date="'+MD[2]+'"]');const cb=await center(cell);await touch('touchStart',cb.x,cb.y+12);await touch('touchEnd');await m.waitForTimeout(250);
 assert.equal(await m.evaluate(()=>allViews.displayRows&&document.querySelector('#allCalGrid .cal-cell.selected')?.dataset.date),MD[2],'탭 = 날짜 선택');
 // 주 보드(가로로 넘기는 열): 길게 누른 뒤 화면 끝으로 끌면 옆 날짜 열로 자동 넘김, 놓은 열 날짜로 이동(시간 유지)
 await m.locator('#allViewTabs [data-common-view=week]').click();if(await m.evaluate(()=>allViews.prefs().week)!=='board')await m.locator('#allSubTabs [data-all-sub=board]').click();await m.evaluate(d=>allViews.selectDate(d),MD[1]);await m.waitForTimeout(250);
 const bcard=m.locator('#allWeekBoard [data-awb-id="todo|t-timed"]');await bcard.scrollIntoViewIfNeeded();const bb=await bcard.boundingBox(),bx=bb.x+bb.width/2,by=bb.y+bb.height/2,left0=await m.evaluate(()=>document.querySelector('.awb-scroll').scrollLeft);
 await touch('touchStart',bx,by);await m.waitForTimeout(450);for(let i=1;i<=6;i++){await touch('touchMove',bx+(384-bx)*i/6,by);await m.waitForTimeout(16);}await m.waitForTimeout(600);
 assert(await m.evaluate(()=>document.querySelector('.awb-scroll').scrollLeft)>left0+200,'가장자리 자동 넘김');
 await touch('touchMove',195,by);await m.waitForTimeout(80);const label=await m.locator('#allMoveLabel .sd-ghost-text').textContent();await touch('touchEnd');
 await m.waitForFunction(d=>mockRows.tok_todos.find(r=>r.id==='t-timed').start_date>d,MD[1]);const moved=await row(m,'tok_todos','t-timed');assert.equal(moved.todo_time,'10:00:00');assert.match(label,/10:00~11:30/);
 assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'가로 넘침 없음');
 assert.deepEqual(merr,[]);await m.close();
 ok('모바일 390: 길게 누른 뒤 이동(미리보기·저장), 짧은 밀기는 이동 아님, 탭은 기존 날짜 선택, 주 보드 가장자리 자동 넘김');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
function OnekanPeriodMinutes(t){return Number(t.slice(0,2))*60+Number(t.slice(3,5));}
