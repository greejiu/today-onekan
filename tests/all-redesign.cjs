// '모두' 개편(2026-10-10) 검증: 월·주·일 보기, 기간별 종류 눈·공통 범주/그룹 눈 저장, 주간 보드(이동·실패 복원·습관),
// 오른쪽 다가오는·언젠가와 일 보기 = 지금 한칸 화면 그대로(같은 DOM·같은 규칙), 주간 보드 빈칸·이름 수정 규칙, 월 달력 입력, 이미지 저장, PC 패널 접기·모바일 390px. 가짜 Supabase만 씀(운영 데이터·외부 요청 없음).
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
const OUT='test-results/all-redesign';
async function seed(p){
 await p.evaluate(async()=>{
  const d=n=>addDaysStr(todayStr(),n),T=(a,b,s,e)=>OnekanPeriod.patch('todo',{allDay:false,startDate:a,endDate:b,startTime:s,endTime:e}),A=(a,b)=>OnekanPeriod.patch('todo',{allDay:true,startDate:a,endDate:b||a});
  mockRows.tok_habit_categories=[{id:'g1',name:'공부',color:'#4a90e2'},{id:'g2',name:'운동',color:'#3fae6a'}];mockRows.tok_event_categories=[{id:'c1',name:'병원',color:'#e2678a'}];
  mockRows.tok_todos=[
   {id:'t-timed',user_id:'test',title:'시간 할일',tag_id:'g1',is_done:false,...T(d(0),d(0),'10:00','11:30')},
   {id:'t-all',user_id:'test',title:'종일 할일',is_done:false,...A(d(0))},
   {id:'t-undated',user_id:'test',title:'날짜 없는 할일',is_done:false,start_date:null,todo_time:null},
   {id:'t-late',user_id:'test',title:'지난 미완료 할일',is_done:false,...T(d(-9),d(-9),'09:00','10:00')},
   {id:'t-repeat',user_id:'test',title:'반복 할일',is_done:false,repeat_unit:'day',repeat_interval:1,...A(d(0))},
   {id:'t-next',user_id:'test',title:'내일 할일',tag_id:'g1',is_done:false,...A(d(1))},
  ];
  mockRows.tok_events=[{id:'e-range',user_id:'test',title:'기간 일정',category_id:'c1',...OnekanPeriod.patch('event',{allDay:true,startDate:d(0),endDate:d(1)})},{id:'e-timed',user_id:'test',title:'시간 일정',...OnekanPeriod.patch('event',{allDay:false,startDate:d(0),endDate:d(0),startTime:'14:00',endTime:'15:00'})}];
  mockRows.tok_someday=[{id:'s1',user_id:'test',title:'언젠가 읽을 책',is_done:false}];
  mockRows.tok_habits=[{id:'h1',user_id:'test',name:'스트레칭',category_id:'g2',is_active:true,start_date:d(-3),repeat_unit:'day',repeat_interval:1,start_minute:420,duration_minutes:30}];
  mockRows.tok_habit_logs=[];mockRows.tok_habit_skips=[];
  await loadAll();showPage('all');
 });
}
const view=p=>p.evaluate(()=>allViews.view());
const go=async(p,v)=>{await p.locator('#allViewTabs [data-common-view='+v+']').click();assert.equal(await view(p),v);};
const eye=(p,kind)=>p.locator('#allSidebarTypes [data-aft-eye='+kind+']');
const pressed=async loc=>(await loc.getAttribute('aria-pressed'))==='true';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];const ok=m=>{results.push('PASS '+m);console.log('PASS '+m);};
 try{fs.mkdirSync(OUT,{recursive:true});
 // ── PC 1440 ──
 const p=await browser.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul',acceptDownloads:true}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR_FAILED/.test(m.text()))errors.push(m.text());});
 await fixture(p);await seed(p);
 const scheduleKeyBefore=await p.evaluate(()=>localStorage.getItem('tok_schedule_views:test'));
 // 1) 최초 기본값: 월=일정만, 주·일=모두
 await go(p,'month');
 assert(await pressed(eye(p,'event')));assert(!await pressed(eye(p,'todo')));assert(!await pressed(eye(p,'habit')));
 const monthChips=await p.locator('#allCalGrid .cal-chip[data-id]').evaluateAll(es=>es.map(e=>e.dataset.id.split('|')[0]));
 assert(monthChips.length&&monthChips.every(k=>k==='event'),'월: 일정만 '+monthChips);
 await go(p,'week');assert(await pressed(eye(p,'todo'))&&await pressed(eye(p,'habit'))&&await pressed(eye(p,'event')));
 assert.equal(await p.evaluate(()=>allViews.prefs().week),'board');assert(await p.locator('#allWeekBoard').isVisible());
 await go(p,'day');assert(await pressed(eye(p,'todo')));assert.equal(await p.evaluate(()=>allViews.prefs().day),'blocks');
 ok('기본값: 월=일정만, 주=보드·모두 켬, 일=시간블럭·모두 켬');
 // 2) 기간별 독립 저장 + 범주/그룹 공통 + 접힘
 await go(p,'month');await eye(p,'habit').click();assert(await pressed(eye(p,'habit')));
 await go(p,'week');await eye(p,'event').click();assert(!await pressed(eye(p,'event')));
 await go(p,'day');assert(await pressed(eye(p,'event'))&&await pressed(eye(p,'habit')));
 await go(p,'month');assert(await pressed(eye(p,'habit'))&&await pressed(eye(p,'event'))&&!await pressed(eye(p,'todo')));
 await p.locator('#allSidebarTypes [data-aft-cat="todo|g1"]').click();
 await go(p,'week');assert.equal(await p.locator('#allSidebarTypes [data-aft-cat="todo|g1"]').getAttribute('aria-pressed'),'false','그룹 눈은 기간 공통');
 assert.equal(await p.locator('#allWeekBoard [data-awb-id="todo|t-timed"]').count(),0,'숨긴 그룹 항목 안 보임');
 await p.locator('#allSidebarTypes [data-aft-cat="todo|g1"]').click();await p.locator('#allSidebarTypes [data-aft-fold=habit]').click();
 assert(await p.locator('#aftList-habit').isHidden());
 await p.locator('#allSidebarTypes [data-aft-eye=event]').click(); // 주 일정 다시 켬
 ok('월·주·일 종류 눈 독립 저장, 범주·그룹 눈 공통, 종류 접기');
 // 3) 새로고침 후 복원 + 사용자 분리 + 다른 탭 설정 불변
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('tok_all_layout:test')));
 assert.equal(saved.eyes.month.habit,true);assert.equal(saved.folded.habit,true);
 assert.equal(await p.evaluate(()=>localStorage.getItem('tok_schedule_views:test')),scheduleKeyBefore,'일정 탭 설정 키 불변');
 const other=await p.evaluate(()=>{const prev=appSymbolUserId;appSymbolUserId='other-user';const o=JSON.parse(JSON.stringify(allViews.prefs()));appSymbolUserId=prev;const back=allViews.prefs();return {o,back:back.eyes.month.habit};});
 assert.equal(other.o.eyes.month.habit,false,'다른 사용자는 기본값');assert.equal(other.back,true,'원래 사용자 설정 유지');
 await p.reload();await p.locator('#app').waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelectorAll('.upcoming-day').length===7);
 await p.evaluate(()=>showPage('all'));await p.waitForTimeout(100);
 assert.equal(await p.evaluate(()=>allViews.prefs().eyes.month.habit),true);assert.equal(await p.evaluate(()=>allViews.prefs().folded.habit),true);
 await fixture(p);await seed(p);
 ok('새로고침 후 설정 복원, 사용자별 분리, 일정 탭 설정 덮어쓰지 않음');
 // 4) 주간 보드: 분류·중복·시간 표시
 await go(p,'week');if(await p.evaluate(()=>allViews.prefs().week)!=='board')await p.locator('#allSubTabs [data-all-sub=board]').click();
 const today=await p.evaluate(()=>todayStr()),tomorrow=await p.evaluate(()=>addDaysStr(todayStr(),1));
 const col=d=>p.locator('#allWeekBoard [data-awb-col="'+d+'"]');
 assert.equal(await col(today).locator('[data-awb-id="todo|t-all"]').count(),1,'종일 할일 1번');
 assert.equal(await col(today).locator('[data-awb-id="todo|t-all"] .plan-time').count(),0,'종일은 시각 없음(지금 한칸 목록과 같음)');
 assert.equal(await col(today).locator('[data-awb-id="todo|t-timed"] .plan-time').textContent(),'10:00');
 assert(await col(today).locator('[data-awb-id="todo|t-timed"].home1-flat-row .drag-handle-dots').count(),'보드 줄 = 지금 한칸 목록 줄');assert.equal(await col(today).locator('[data-awb-id="event|e-timed"] .plan-time').textContent(),'14:00','일정도 시각');
 assert.equal(await p.locator('#allWeekBoard [data-awb-id="todo|t-undated"]').count(),0,'날짜 없는 할일은 보드에 없음');
 assert.equal(await col(today).locator('[data-awb-id="event|e-range"]').count()+await col(tomorrow).locator('[data-awb-id="event|e-range"]').count(),(await p.evaluate(()=>{const r=allViews.range();return r.end>=addDaysStr(todayStr(),1);}))?2:1,'기간 일정은 날짜마다 1번');
 const order=await col(today).locator('[data-awb-id]').evaluateAll(es=>es.map(e=>!!e.querySelector('.plan-time')));assert.deepEqual(order,[...order].sort((a,b)=>a-b),'종일 먼저');
 assert(!(await p.locator('#allWeekBoard').textContent()).includes('시간 미정'),'시간 미정 영역 없음');
 assert.equal(await col(today).locator('[data-awb-id="event|e-timed"] input').count(),0,'일정은 체크박스 없음');
 const heads=await p.locator('#allWeekBoard .awb-head').allTextContents();assert(heads[0].startsWith('월'),'월요일 시작 '+heads[0]);assert.equal(await p.locator('#allWeekBoard .awb-col.is-today').count(),1);
 await p.screenshot({path:OUT+'/pc-week-board.png'});
 ok('보드: 월~일, 오늘 강조, 종일 먼저·시간순, 일정 체크 없음, 날짜 없는 할일 제외, 중복 없음');
 // 5) 완료 → 가운데 보드와 오른쪽(지금 한칸 다가오는) 함께 반영
 const upCheck=p.locator('#allSideAgenda #homeUpcomingList .upcoming-todo-check[data-id="t-next"]');
 const tomorrowCol=col(tomorrow);
 await upCheck.check();await p.waitForFunction(()=>mockRows.tok_todos.find(t=>t.id==='t-next').is_done===true);await p.waitForTimeout(150);
 if(await tomorrowCol.count())assert(await tomorrowCol.locator('[data-awb-id="todo|t-next"] input').isChecked(),'오른쪽에서 체크 → 가운데도 완료');
 if(await tomorrowCol.count()){await tomorrowCol.locator('[data-awb-id="todo|t-next"] input').uncheck();}else{await upCheck.uncheck();}
 await p.waitForFunction(()=>mockRows.tok_todos.find(t=>t.id==='t-next').is_done===false);await p.waitForTimeout(150);
 assert(!await upCheck.isChecked(),'가운데에서 취소 → 오른쪽도 취소');
 ok('완료·취소가 가운데 보드와 오른쪽 목록(지금 한칸 다가오는)에 함께 반영');
 // 6) 습관 완료·건너뛰기(기존 규칙)
 const hab=()=>col(today).locator('[data-awb-id^="habit|"]');await hab().locator('.ag-habit-check').check();await p.waitForFunction(()=>mockRows.tok_habit_logs.some(l=>l.habit_id==='h1'&&l.done_date===todayStr()));
 await p.waitForTimeout(150);await hab().locator('.ag-habit-check').uncheck();await p.waitForFunction(()=>!mockRows.tok_habit_logs.some(l=>l.habit_id==='h1'&&l.done_date===todayStr()));
 await p.waitForTimeout(150);await hab().locator('.item-more').click();await p.locator('.item-menu [role=menuitem]',{hasText:'이번만 건너뛰기'}).click();await p.waitForFunction(()=>mockRows.tok_habit_skips.some(l=>l.habit_id==='h1'&&l.skip_date===todayStr()));
 await p.waitForTimeout(150);assert(await hab().locator('.habit-skip-mark').count(),'건너뜀 표시');await hab().locator('.item-more').click();await p.locator('.item-menu [role=menuitem]',{hasText:'건너뛰기 취소'}).click();await p.waitForFunction(()=>!mockRows.tok_habit_skips.some(l=>l.habit_id==='h1'&&l.skip_date===todayStr()));
 ok('보드에서 습관 완료·완료 취소(체크)·건너뛰기·건너뛰기 취소(⋯ 메뉴) — 지금 한칸과 같은 규칙');
 // 7) 끌어서 날짜 이동: 시간·길이 보존, 기간 일정 길이 보존, 실패 시 복원, 반복은 수정창 안내
 const dragTo=async(sel,target)=>{const a=await p.locator(sel).first().boundingBox(),b=await p.locator(target).boundingBox();await p.mouse.move(a.x+a.width/2,a.y+8);await p.mouse.down();await p.mouse.move(a.x+a.width/2+20,a.y+20,{steps:3});await p.mouse.move(b.x+b.width/2,b.y+b.height-40,{steps:6});await p.mouse.up();};
 await p.setViewportSize({width:1800,height:900});await p.evaluate(()=>{allViews.selectDate(todayStr());}); // 이번 주, 7열이 모두 보이는 폭에서 끌기
 const target=await p.evaluate(()=>{const r=allViews.range();for(let d=r.start;d<=r.end;d=addDaysStr(d,1))if(d!==todayStr()&&d!==addDaysStr(todayStr(),1))return d;});
 const before=await p.evaluate(()=>({...mockRows.tok_todos.find(t=>t.id==='t-timed')}));
 await dragTo('#allWeekBoard [data-awb-col="'+today+'"] [data-awb-id="todo|t-timed"]','#allWeekBoard [data-awb-col="'+target+'"]');
 await p.waitForFunction(t=>mockRows.tok_todos.find(x=>x.id==='t-timed').start_date===t,target);
 const after=await p.evaluate(()=>({...mockRows.tok_todos.find(t=>t.id==='t-timed')}));
 assert.equal(after.todo_time,before.todo_time);assert.equal(after.end_time,before.end_time);assert.equal(after.duration_minutes,before.duration_minutes);
 await p.waitForTimeout(150);assert.equal(await col(target).locator('[data-awb-id="todo|t-timed"]').count(),1,'새 날짜에 표시');
 const ev0=await p.evaluate(()=>{const e=mockRows.tok_events.find(x=>x.id==='e-range');return OnekanPeriod.days(e.event_date,e.end_date);});
 const evTarget=await p.evaluate(t=>t,target);
 await dragTo('#allWeekBoard [data-awb-col="'+today+'"] [data-awb-id="event|e-range"]','#allWeekBoard [data-awb-col="'+evTarget+'"]');
 await p.waitForFunction(t=>mockRows.tok_events.find(x=>x.id==='e-range').event_date===t,evTarget);
 assert.equal(await p.evaluate(()=>{const e=mockRows.tok_events.find(x=>x.id==='e-range');return OnekanPeriod.days(e.event_date,e.end_date);}),ev0,'기간 길이 보존');
 const allBefore=await p.evaluate(()=>({...mockRows.tok_todos.find(t=>t.id==='t-all')}));
 await p.evaluate(()=>{mockFailure='simulated failure';});
 await dragTo('#allWeekBoard [data-awb-col="'+today+'"] [data-awb-id="todo|t-all"]','#allWeekBoard [data-awb-col="'+target+'"]');
 await p.waitForFunction(()=>/저장하지 못했어요/.test(document.getElementById('allSaveStatus').textContent));
 assert.deepEqual(await p.evaluate(()=>({...mockRows.tok_todos.find(t=>t.id==='t-all')})),allBefore);assert.equal(await col(today).locator('[data-awb-id="todo|t-all"]').count(),1,'실패 시 원래 자리');
 await dragTo('#allWeekBoard [data-awb-col="'+today+'"] [data-awb-id="todo|t-repeat"]','#allWeekBoard [data-awb-col="'+target+'"]');await p.waitForTimeout(200);
 assert.equal(await p.evaluate(()=>mockRows.tok_todos.find(t=>t.id==='t-repeat').start_date),today,'반복 할일은 끌어서 안 바뀜');
 assert(/반복 항목은 수정창/.test(await p.locator('#allSaveStatus').textContent()));await p.keyboard.press('Escape');await p.evaluate(()=>{document.querySelectorAll('.sheet-bg.open').forEach(b=>b.classList.remove('open'));});
 await p.setViewportSize({width:1440,height:900});
 ok('보드 끌어 옮기기: 시간·길이 보존, 기간 일정 길이 보존, 실패 시 원래 상태·안내, 반복은 수정창 안내');
 // 8) 오른쪽 = 지금 한칸 다가오는·담아두기 그 자체(같은 DOM, 같은 클릭·끌기·추가 규칙). '지난 할일' 접힘 없음, 눈과 무관.
 const side=p.locator('#allSideAgenda');
 if(await side.locator('[data-sa-list=upcoming]').getAttribute('aria-pressed')!=='true')await side.locator('[data-sa-list=upcoming]').click();
 assert.equal(await p.locator('#allSideAgenda #homeUpcomingPanel').count(),1,'지금 한칸 다가오는을 그대로 옮겨 붙임');
 assert.equal(await p.locator('#homeCol3 #homeUpcomingPanel').count(),0,'복제가 아니라 같은 화면 하나');
 assert.equal(await side.locator('.upcoming-day').count(),7,'지금 한칸과 같은 7일');
 assert.equal(await side.locator('.sa-overdue-toggle').count(),0,'지난 할일 접힘 없음');
 const label0=await side.locator('#homeUpcomingDateLabel').textContent();await side.locator('#homeUpcomingNextBtn').click();await p.waitForTimeout(100);
 assert.notEqual(await side.locator('#homeUpcomingDateLabel').textContent(),label0,'‹ › 7일 이동');await side.locator('#homeUpcomingDateLabel').click();await p.waitForTimeout(100);
 assert.equal(await side.locator('#homeUpcomingDateLabel').textContent(),label0,'날짜 누르면 처음으로');
 await eye(p,'todo').click();await p.waitForTimeout(100);assert.equal(await side.locator('.plan-row[data-id="t-next"]').count(),1,'다가오는은 눈과 무관(지금 한칸과 같은 내용)');await eye(p,'todo').click();
 // 제목 누르기 = 이름 수정(지금 한칸 규칙)
 await side.locator('.plan-row[data-id="t-next"] .plan-todo-title').click();const renameUp=side.locator('.plan-row[data-id="t-next"] .inline-add-input');assert(await renameUp.isVisible(),'제목 클릭 → 이름 수정');
 await renameUp.fill('내일 할일 고침');await renameUp.press('Enter');await p.waitForFunction(()=>mockRows.tok_todos.find(t=>t.id==='t-next').title==='내일 할일 고침');
 // 빈칸 = 할일 입력창(지금 한칸 규칙)
 await side.locator('.upcoming-day').nth(1).locator('.add-slot').click();const upAdd=side.locator('.inline-add-input');await upAdd.fill('다가오는에서 추가');await upAdd.press('Enter');
 await p.waitForFunction(()=>mockRows.tok_todos.some(t=>t.title==='다가오는에서 추가'));await p.keyboard.press('Escape');
 // 다가오는 행 → 주간 보드 열로 끌기(지금 한칸 끌기 + 기존 이동 규칙: 그 날짜 종일)
 await p.setViewportSize({width:1800,height:900});await p.waitForTimeout(100);
 const dragHome=async(sel,targetSel)=>{const a=await p.locator(sel).first().boundingBox(),b=await p.locator(targetSel).boundingBox();await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(a.x+a.width/2+15,a.y+a.height/2+15,{steps:3});await p.mouse.move(b.x+b.width/2,b.y+b.height-30,{steps:8});await p.mouse.up();};
 await dragHome('#allSideAgenda .plan-row[data-id="t-next"]','#allWeekBoard [data-awb-col="'+target+'"]');
 await p.waitForFunction(t=>mockRows.tok_todos.find(x=>x.id==='t-next').start_date===t,target);await p.waitForTimeout(150);
 assert.equal(await col(target).locator('[data-awb-id="todo|t-next"]').count(),1,'다가오는 → 보드 열');
 // 언젠가 = 지금 한칸 담아두기(정렬·그룹 칩 포함), 담아두기 → 보드 열 끌기 = 그날 할일(종일)
 await side.locator('[data-sa-list=someday]').click();assert.equal(await p.locator('#allSideAgenda #homeSomedayPanel').count(),1);
 assert(await side.locator('#somedayHomeSortSelect').isVisible(),'정렬 선택');assert(await side.locator('#homeUpcomingPanel').isHidden(),'다가오는은 숨김');
 assert.equal(await side.locator('[data-someday-id="s1"]').count(),1);
 await dragHome('#allSideAgenda [data-someday-id="s1"]','#allWeekBoard [data-awb-col="'+target+'"]');
 await p.waitForFunction(()=>!mockRows.tok_someday.some(s=>s.id==='s1'));assert(await p.evaluate(t=>mockRows.tok_todos.some(x=>x.title==='언젠가 읽을 책'&&x.start_date===t),target));
 await p.setViewportSize({width:1440,height:900});
 await go(p,'month');assert.equal(await p.evaluate(()=>allViews.agenda.state().list),'someday','목록 선택 기억');await go(p,'week');
 // 지금 한칸으로 가면 제자리, 다시 오면 다시 빌려 옴
 await p.evaluate(()=>showPage('home'));await p.waitForTimeout(100);
 assert.equal(await p.locator('#homeCol3 #homeUpcomingPanel').count(),1);assert.equal(await p.locator('#homeCol1 #homeSomedayPanel').count(),1);
 assert(await p.locator('#homeUpcomingPanel').isVisible()&&await p.locator('#homeSomedayPanel').isVisible(),'지금 한칸에서 둘 다 보임');
 await p.evaluate(()=>showPage('all'));await p.waitForTimeout(100);assert.equal(await p.locator('#allSideAgenda #homeSomedayPanel').count(),1);
 ok('오른쪽 = 지금 한칸 다가오는·담아두기(같은 화면·눈과 무관·지난 할일 접힘 없음): 7일 이동, 제목 클릭 이름 수정, 빈칸 추가, 보드 열로 끌기, 목록 기억, 지금 한칸으로 돌려줌');
 // 8-2) 주간 보드도 같은 규칙: 제목 누르기 = 이름 수정, 빈칸 = 할일 입력창(연속 입력)
 await col(target).locator('[data-awb-id="todo|t-timed"] .agenda-title').click();const renameB=col(target).locator('[data-awb-id="todo|t-timed"] .inline-add-input');assert(await renameB.isVisible(),'보드 제목 클릭 → 이름 수정');
 await renameB.fill('시간 할일 고침');await renameB.press('Enter');await p.waitForFunction(()=>mockRows.tok_todos.find(t=>t.id==='t-timed').title==='시간 할일 고침');await p.waitForTimeout(150);
 await col(target).locator('.add-slot').click();const addB=col(target).locator('.inline-add-input');await addB.fill('보드에서 추가');await addB.press('Enter');
 await p.waitForFunction(t=>mockRows.tok_todos.some(x=>x.title==='보드에서 추가'&&x.start_date===t),target);await p.waitForTimeout(200);
 assert(await col(target).locator('.inline-add-input').isVisible(),'연속 입력: 입력창 다시 열림');await p.keyboard.press('Escape');
 ok('주간 보드: 제목 클릭 = 이름 수정, 빈칸 = 지금 한칸과 같은 할일 입력창(연속 입력)');
 // 8-3) 일 보기 = 지금 한칸 타임라인·시간블럭(같은 DOM), '모두' 날짜·눈으로 표시, 떠나면 지금 한칸 날짜·위치 되돌림
 const homeDate0=await p.evaluate(()=>homeAgendaDate);
 await go(p,'day');await p.evaluate(()=>allViews.selectDate(todayStr()));await p.waitForTimeout(150);
 assert.equal(await p.locator('#allHomeDay #homeBlockPanel').count(),1,'시간블럭 = 지금 한칸 시간블럭');assert(await p.locator('#homeBlockPanel').isVisible());assert(await p.locator('#homeTimelinePanel').isHidden());
 assert(await p.locator('#allTimeView').isHidden(),'예전 일 보기 숨김');
 assert(await p.locator('#allHomeDay [data-kind=todo][data-id="t-all"]').count()>0,'종일 할일 보임');
 await eye(p,'todo').click();await p.waitForTimeout(150);assert.equal(await p.locator('#allHomeDay [data-kind=todo]').count(),0,'할일 눈 끄면 숨김');await eye(p,'todo').click();await p.waitForTimeout(150);
 if(await p.locator('#aftList-habit').isHidden())await p.locator('#allSidebarTypes [data-aft-fold=habit]').click(); // 2)에서 접어 둔 습관 펼침
 await p.locator('#allSidebarTypes [data-aft-cat="habit|g2"]').click();await p.waitForTimeout(150);assert.equal(await p.locator('#allHomeDay [data-kind=habit]').count(),0,'그룹 눈 끄면 숨김');await p.locator('#allSidebarTypes [data-aft-cat="habit|g2"]').click();await p.waitForTimeout(150);
 assert(await p.locator('#allHomeDay [data-kind=habit]').count()>0);
 await p.locator('#allSubTabs [data-all-sub=timeline]').click();await p.waitForTimeout(150);assert(await p.locator('#homeTimelinePanel').isVisible()&&await p.locator('#homeBlockPanel').isHidden(),'타임라인 = 지금 한칸 타임라인');
 assert(await p.locator('#allHomeDay .ag-tl-content').count()>0);
 await p.locator('#allNextBtn').click();await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>homeAgendaDate),await p.evaluate(()=>addDaysStr(todayStr(),1)),"'모두' 날짜를 따름");
 await p.evaluate(()=>allViews.selectDate(todayStr()));await p.waitForTimeout(150);const dayRow=p.locator('#allHomeDay .ag-allday-row[data-id]').first();await dayRow.locator('.agenda-title').click();assert(await dayRow.locator('.inline-add-input').isVisible(),'제목 클릭 → 이름 수정');await p.keyboard.press('Escape');
 await p.evaluate(()=>showPage('home'));await p.waitForTimeout(150);
 assert.equal(await p.evaluate(()=>homeAgendaDate),homeDate0,'지금 한칸 날짜 되돌림');assert.equal(await p.evaluate(()=>homeItemFilter),null);
 assert.equal(await p.locator('#homeCol2 #homeTimelinePanel').count()+await p.locator('#homeCol2 #homeBlockPanel').count(),2,'제자리로');
 assert.equal(await p.locator('#homeCol2 > .home2-tabpanel:visible').count(),1,'지금 한칸 보기 하나만');
 await p.evaluate(()=>loadAll());await p.waitForTimeout(150);assert.equal(await p.locator('#homeCol2 #homeBlockPanel').count(),1,"지금 한칸에서 새로고침해도 '모두'(일 보기)가 다시 빌려 가지 않음");
 await p.evaluate(()=>showPage('all'));await go(p,'week');
 ok('일 보기 = 지금 한칸 시간블럭·타임라인(같은 화면, 종류·그룹 눈 반영, 날짜 연동, 제목 클릭 이름 수정), 떠나면 지금 한칸 상태 복원');
 // 9) PC 패널 접기(오른쪽 기억, 왼쪽 접어도 표시 설정 열기)
 await side.locator('.sa-close').click();assert(await p.locator('.page[data-page=all] .sa-reopen').isVisible());assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('tok_side_agenda:all:test')).closed),true);
 const wideBefore=await p.locator('#allWeekBoard .awb-scroll').evaluate(e=>e.clientWidth);
 await p.locator('.page[data-page=all] .sa-reopen').click();assert(await side.isVisible());
 await p.locator('#todoIconRail button').first().click();await p.waitForTimeout(100);
 assert(await p.locator('#allFilterBtn').isVisible(),'왼쪽 접으면 표시 설정 버튼');await p.locator('#allFilterBtn').click();assert(await p.locator('#allFilterPanel [data-aft-eye=todo]').isVisible());
 await p.keyboard.press('Escape');await p.locator('#todoIconRail button').first().click();await p.evaluate(()=>showPage('all')); // 펼치면 기존 규칙대로 전체 메뉴 → 다시 '모두'
 assert(wideBefore>0);ok('오른쪽 접기·펼치기 기억, 왼쪽 접으면 표시 설정 버튼으로 열기');
 // 10) 모두 끄면 안내 + 모두 표시
 await go(p,'day');for(const k of ['event','todo','habit'])if(await pressed(eye(p,k)))await eye(p,k).click();
 assert((await p.locator('#allNotice').textContent()).includes('표시할 항목이 꺼져 있어요'));await p.locator('#allShowAll').click();
 assert(await pressed(eye(p,'event'))&&await pressed(eye(p,'todo'))&&await pressed(eye(p,'habit')));
 assert.equal(await eye(p,'todo').getAttribute('aria-label'),'할일 표시 중 · 숨기기');
 ok('모두 끄면 안내와 모두 표시, 눈 아이콘 접근성 이름');
 // 11) 월 달력: 날짜 숫자 → 일 보기, 빈 공간 → 추가
 await go(p,'month');const d10=await p.evaluate(()=>addDaysStr(todayStr(),2));
 await p.locator('#allCalGrid [data-month-date="'+d10+'"]').click();assert.equal(await view(p),'day');assert.equal(await p.evaluate(()=>allViews.range().start),d10);
 await go(p,'month');const cell=p.locator('#allCalGrid .cal-cell[data-date="'+d10+'"]');const cb=await cell.boundingBox();await p.mouse.click(cb.x+cb.width/2,cb.y+cb.height-8);
 await p.waitForTimeout(150);assert(await p.locator('.item-menu').isVisible(),'빈 공간 클릭 → 추가 종류 메뉴');assert.deepEqual(await p.locator('.item-menu [role=menuitem]').allTextContents().then(t=>t.map(x=>x.trim())),['할일 추가','습관 추가','일정 추가']);
 await p.keyboard.press('Escape');await p.evaluate(()=>{document.querySelectorAll('.sheet-bg.open').forEach(b=>b.classList.remove('open'));});
 ok('월: 날짜 숫자 → 일 보기, 빈 공간 → 추가');
 // 12) 이미지 저장: 주(스크롤 밖 열 포함)·월·일
 await go(p,'week');await p.locator('#allExportBtn').click();await p.waitForFunction(()=>document.getElementById('allExportBg').classList.contains('open')&&!document.getElementById('allExportSave').disabled);
 const wm=await p.evaluate(()=>allViews.exportModel());assert.equal(wm.days.length,7);
 const boardIds=await p.locator('#allWeekBoard [data-awb-id]').count();assert.equal(wm.days.reduce((a,d)=>a+d.items.length,0),boardIds,'보드의 모든 카드(스크롤 밖 포함)');
 const dims=await p.evaluate(()=>[document.getElementById('allExportCanvas').width,document.getElementById('allExportCanvas').height]);assert(dims[0]>=2000&&dims[1]>200,'주 이미지 해상도 '+dims);
 const [dl]=await Promise.all([p.waitForEvent('download'),p.locator('#allExportSave').click()]);await dl.saveAs(OUT+'/week.png');assert(/^오늘한칸_주_/.test(dl.suggestedFilename())||dl.suggestedFilename()==='download');
 await p.locator('#allExportClose').click();
 await go(p,'month');await p.locator('#allExportBtn').click();await p.waitForFunction(()=>!document.getElementById('allExportSave').disabled);
 const mm=await p.evaluate(()=>allViews.exportModel());assert(mm.days.length>=28);
 const b64=await p.evaluate(()=>document.getElementById('allExportCanvas').toDataURL().split(',')[1]);fs.writeFileSync(OUT+'/month.png',Buffer.from(b64,'base64'));await p.locator('#allExportClose').click();
 await go(p,'day');await p.locator('#allExportBtn').click();await p.waitForFunction(()=>document.getElementById('shareSheetBg').classList.contains('open'));
 assert.equal(await p.evaluate(()=>shareState.view),await p.evaluate(()=>allViews.prefs().day==='blocks'?'block':'timeline'));await p.keyboard.press('Escape');
 ok('이미지 저장: 주(7일 전체·스크롤 밖 포함)·월은 미리보기→PNG, 일은 공유 창(같은 보기)');
 // 13) 할일 탭 오른쪽도 같은 지금 한칸 목록
 await p.evaluate(()=>showPage('todos'));await p.waitForTimeout(150);const tside=p.locator('#todoSideAgenda');assert(await tside.isVisible());
 if(await tside.locator('[data-sa-list=upcoming]').getAttribute('aria-pressed')!=='true')await tside.locator('[data-sa-list=upcoming]').click();
 assert.equal(await p.locator('#todoSideAgenda #homeUpcomingPanel').count(),1,'할일 탭도 같은 다가오는');assert(await tside.locator('#homeUpcomingPanel').isVisible());
 assert.equal(await p.locator('#allSideAgenda #homeUpcomingPanel').count(),0);ok('할일 탭 오른쪽 = 같은 지금 한칸 다가오는·담아두기');
 assert.deepEqual(errors,[],'PC 페이지 오류 없음');await p.close();

 // ── 모바일 390 ──
 const m=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',hasTouch:true}),merr=[];m.on('pageerror',e=>merr.push(e.message));
 await fixture(m);await seed(m);await m.locator('#allViewTabs [data-common-view=week]').click();
 if(await m.evaluate(()=>allViews.prefs().week)!=='board')await m.locator('#allSubTabs [data-all-sub=board]').click();
 const lay=await m.evaluate(()=>{const s=document.querySelector('#allWeekBoard .awb-scroll'),c=document.querySelectorAll('#allWeekBoard .awb-col');const first=[...c].find(x=>{const r=x.getBoundingClientRect(),sr=s.getBoundingClientRect();return r.left>=sr.left-2&&r.left<sr.right;});return {page:document.documentElement.scrollWidth,inner:s.scrollWidth>s.clientWidth,first:first?.dataset.awbCol,colW:c[0].getBoundingClientRect().width,scrollW:s.clientWidth,snap:getComputedStyle(s).scrollSnapType};});
 assert(lay.page<=390,'페이지 가로 넘침 없음 '+lay.page);assert(lay.inner,'보드 안쪽 가로 스크롤');assert.equal(lay.first,await m.evaluate(()=>todayStr()),'오늘 열부터');
 assert(lay.colW<lay.scrollW,'다음 열 일부 보임');assert(/x/.test(lay.snap));
 await m.screenshot({path:OUT+'/m390-week-board.png'});
 assert(!(await m.locator('#allSideAgenda').isVisible()),'모바일 오른쪽 목록 기본 숨김');await m.locator('#allPanelBtn').tap();assert(await m.locator('#allSideAgenda').isVisible());assert(await m.locator('#allSideAgenda #homeUpcomingList').isVisible(),'모바일 패널 = 지금 한칸 다가오는');await m.screenshot({path:OUT+'/m390-panel.png'});
 await m.locator('#allSideAgenda .sa-close').tap();assert(!(await m.locator('#allSideAgenda').isVisible()));
 await m.locator('#allFilterBtn').tap();assert(await m.locator('#allFilterPanel').isVisible());await m.screenshot({path:OUT+'/m390-filter.png'});await m.locator('#allFilterClose').tap();
 await m.locator('#allViewTabs [data-common-view=month]').click();await m.locator('#allCalGrid .cal-cell[data-date="'+await m.evaluate(()=>todayStr())+'"]').tap();
 assert(await m.locator('.page[data-page=all] .cal-side .cal-day-add').isVisible(),'모바일 월: 날짜 목록과 추가');
 assert.equal(await m.locator('#allCalGrid .cal-cell .cal-day-add, #allCalGrid button[aria-label$="추가"]').count(),0,'달력 칸 상시 + 없음');
 assert.deepEqual(merr,[],'모바일 페이지 오류 없음');ok('모바일 390: 보드 가로 넘김(열 스냅·오늘 열부터·다음 열 일부), 패널·표시 설정 버튼, 월 날짜 목록에서 추가');
 await m.close();
 console.log(results.join('\n'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
