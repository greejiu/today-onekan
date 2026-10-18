// 2026-10-18 설계확정서 1.18 1차 구현(공통 구조·달력 눈 설정·날짜별 이동) 검증. 가짜 Supabase만 씀(운영 데이터·외부 요청 없음).
// 예전 저장값(범주 공통) 이어받기, 날짜별 = 지금 보기의 눈, 언젠가는 눈과 무관, 날짜 줄(월 칸 머리 전체·주 머리) → 날짜별 이동·강조(지난 날짜 포함),
// 접힌 오른쪽 칸 다시 펼침, 지금 한칸 7일 창 복원, 모바일 아래쪽 패널(2026-10-18 MOB-01·02), 쓰기 요청 없음.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
const ok=m=>console.log('PASS '+m);

async function seed(p){
 await p.evaluate(async()=>{
  const d=n=>addDaysStr(todayStr(),n),A=(k,a)=>OnekanPeriod.patch(k,{allDay:true,startDate:a,endDate:a});
  mockRows.tok_event_categories=[{id:'c1',name:'병원',color:'#e2678a'}];
  mockRows.tok_events=[{id:'e-def',user_id:'test',title:'기본 일정',...A('event',d(1))},{id:'e-c1',user_id:'test',title:'병원 일정',category_id:'c1',...A('event',d(1))},{id:'e-past',user_id:'test',title:'지난 일정',...A('event',d(-20))}];
  mockRows.tok_todos=[{id:'t1',user_id:'test',title:'내일 할일',is_done:false,...A('todo',d(1))}];
  mockRows.tok_someday=[{id:'s1',user_id:'test',title:'언젠가 배우기',is_done:false}];
  await loadAll();showPage('all');
 });
}
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await fixture(p);
 // 1) 예전 저장값: 일정 종류 눈 없음·숨긴 범주 공통(hidden.event) → 세 보기에 같은 범주 선택, 일정 전체는 켬
 await p.evaluate(()=>{localStorage.setItem('tok_all_layout:test',JSON.stringify({week:'board',day:'blocks',eyes:{month:{event:true,todo:true,habit:false},week:{event:true,todo:true,habit:true},day:{event:true,todo:true,habit:true}},hidden:{event:['c1'],todo:[],habit:[]},holidays:true}));
  const prev=appSymbolUserId;appSymbolUserId='reload';allViews.prefs();appSymbolUserId=prev;}); // fixture가 이미 읽어 둔 설정을 버리고 다시 읽게 함
 await seed(p);
 const prefs=await p.evaluate(()=>JSON.parse(JSON.stringify(allViews.prefs())));
 for(const v of ['month','week','day']){assert.deepEqual(prefs.cats[v],['c1'],v+' 범주 이어받기');assert.equal(prefs.eyes[v].event,true,v+' 일정 전체 켬');}
 assert.equal(prefs.eyes.month.todo,true,'예전 할일 눈 유지');
 ok('예전 저장값(범주 공통)을 월·주·일 범주 선택으로 이어받음');

 // 2) 날짜별 = 지금 달력 보기의 눈, 언젠가는 눈과 무관
 await p.locator('#allViewTabs [data-common-view=month]').click();
 const side=p.locator('#allSideAgenda'),ev=p.locator('#allSidebarTypes [data-aft-eye=event]'),todo=p.locator('#allSidebarTypes [data-aft-eye=todo]'),c1=p.locator('#allSidebarTypes [data-aft-cat="event|c1"]');
 if(await side.locator('[data-sa-list=upcoming]').getAttribute('aria-pressed')!=='true')await side.locator('[data-sa-list=upcoming]').click();
 const up=id=>side.locator('#homeUpcomingList .plan-row[data-id="'+id+'"]');
 await p.waitForTimeout(150);
 assert.equal(await ev.getAttribute('aria-pressed'),'mixed');assert.equal(await up('e-def').count(),1);assert.equal(await up('e-c1').count(),0,'숨긴 범주는 날짜별에서도 숨김');assert.equal(await up('t1').count(),1);
 await ev.click();await p.waitForTimeout(150);assert.equal(await up('e-def').count(),0,'일정 전체 끄면 날짜별에서도 숨김');assert.equal(await up('t1').count(),1);
 await todo.click();await p.waitForTimeout(150);assert.equal(await up('t1').count(),0,'할일 눈 끄면 날짜별에서도 숨김');
 assert((await p.locator('#allNotice').textContent()).includes('표시할 항목이 꺼져 있어요'),'일정 전체·할일·습관 모두 꺼짐 안내');
 // 주 보기로 바꾸면 주의 눈(할일 켬)이 날짜별에도 적용
 await p.locator('#allViewTabs [data-common-view=week]').click();await p.waitForTimeout(150);assert.equal(await up('t1').count(),1,'주 보기 눈으로 바뀜');assert.equal(await up('e-def').count(),1);
 // 언젠가: 모든 눈과 무관
 await p.locator('#allViewTabs [data-common-view=month]').click();await side.locator('[data-sa-list=someday]').click();await p.waitForTimeout(100);
 assert.equal(await side.locator('[data-someday-id="s1"]').count(),1,'언젠가는 눈과 무관하게 표시');
 await ev.click();await todo.click();await c1.click();await p.waitForTimeout(100);
 assert.equal(await ev.getAttribute('aria-pressed'),'true');assert.equal(await side.locator('[data-someday-id="s1"]').count(),1);
 ok('날짜별은 지금 보기(월·주·일)의 눈을 따르고, 언젠가는 눈과 무관');

 // 3) 날짜 줄: 월 칸 머리 줄 전체가 클릭 대상, 호버 안내, 지난 날짜도 이동·강조, 언젠가 → 날짜별로 바뀜
 const past=await p.evaluate(()=>addDaysStr(todayStr(),-20));
 await p.evaluate(d=>allViews.selectDate(d),past);await p.waitForTimeout(100);
 const head=p.locator('#allCalGrid .cal-cell[data-date="'+past+'"] .cal-date-row');
 assert.equal(await head.getAttribute('title'),'이날 계획 보기');
 await head.hover();assert(await head.locator('.cal-row-hint').isVisible(),'호버 시 이날 계획 보기 안내');
 assert.notEqual(await head.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','호버 배경');
 const hb=await head.boundingBox();await p.mouse.click(hb.x+hb.width-12,hb.y+hb.height/2); // 숫자 말고 줄 오른쪽 끝
 await p.waitForSelector('#allSideAgenda .upcoming-day.is-picked');
 assert.equal(await p.evaluate(()=>allViews.agenda.state().list),'upcoming','날짜별로 바뀜');
 assert.equal(await side.locator('.upcoming-day.is-picked').getAttribute('data-date'),past,'지난 날짜 강조');
 assert.equal(await side.locator('.upcoming-day').first().getAttribute('data-date'),past.slice(0,7)+'-01','그 날짜가 있는 달의 1일부터');assert.equal(await side.locator('#homeUpcomingDateLabel').textContent(),Number(past.slice(0,4))+'년 '+Number(past.slice(5,7))+'월');
 assert(await side.locator('.upcoming-day.is-picked').evaluate(e=>{const l=document.querySelector('#allSideAgenda .sa-body');const r=e.getBoundingClientRect(),lb=l.getBoundingClientRect();return r.top>=lb.top-2&&r.top<lb.bottom;}),'고른 날짜가 보이도록 스크롤');
 assert.equal(await up('e-past').count(),1,'지난 날짜 계획 보임');
 assert.equal(await p.locator('.item-menu:visible').count(),0,'줄 클릭에 추가 메뉴가 같이 열리지 않음');
 assert.equal(await p.locator('#allCalGrid .cal-cell.selected').getAttribute('data-date'),past,'달력 선택 날짜도 이동');
 // 키보드: 날짜 숫자 버튼 Enter도 같은 동작
 const d3=await p.evaluate(()=>addDaysStr(todayStr(),3));await p.evaluate(d=>allViews.selectDate(d),d3);
 await p.locator('#allCalGrid [data-month-date="'+d3+'"]').focus();await p.keyboard.press('Enter');
 await p.waitForFunction(d=>document.querySelector('#allSideAgenda .upcoming-day.is-picked')?.dataset.date===d,d3);
 ok('월 날짜 줄(머리 줄 전체·숫자·Enter) → 날짜별로 전환·그 날짜의 달(1일부터)·스크롤·강조, 지난 날짜 포함, 호버 안내');

 // 4) 접혀 있어도 날짜 줄을 누르면 펼침
 await side.locator('.sa-close').click();assert(!(await side.isVisible()));
 await p.locator('#allCalGrid .cal-cell[data-date="'+past+'"] .cal-date-row').click();
 assert(await side.isVisible(),'접힌 오른쪽 칸 다시 펼침');await p.waitForFunction(d=>document.querySelector('#allSideAgenda .upcoming-day.is-picked')?.dataset.date===d,past);
 ok('오른쪽 칸이 접혀 있어도 날짜 줄 클릭으로 펼침');

 // 5) 주 보기: 보드 머리·타임라인 머리도 같은 동작
 await p.locator('#allViewTabs [data-common-view=week]').click();if(await p.evaluate(()=>allViews.prefs().week)!=='board')await p.locator('#allSubTabs [data-all-sub=board]').click();
 const wd=await p.evaluate(()=>allViews.range().start);await p.locator('#allWeekBoard [data-awb-select="'+wd+'"]').click();
 await p.waitForFunction(d=>document.querySelector('#allSideAgenda .upcoming-day.is-picked')?.dataset.date===d,wd);
 await p.locator('#allSubTabs [data-all-sub=timeline]').click();await p.waitForTimeout(100);const wd2=await p.evaluate(()=>addDaysStr(allViews.range().start,2));
 await p.locator('#allCalendarMode [data-sv-select="'+wd2+'"]').click();
 await p.waitForFunction(d=>document.querySelector('#allSideAgenda .upcoming-day.is-picked')?.dataset.date===d,wd2);
 await p.locator('#allSubTabs [data-all-sub=board]').click();
 ok('주 보드·타임라인 날짜 머리 → 날짜별 이동·강조');

 // 6) 지금 한칸으로 가면 눈·고른 날짜를 풀고 원래 7일 창(내일부터)으로
 await p.evaluate(()=>showPage('home'));await p.waitForTimeout(200);
 assert.equal(await p.locator('#homeCol3 #homeUpcomingPanel').count(),1);
 assert.equal(await p.locator('#homeUpcomingList .upcoming-day').first().getAttribute('data-date'),await p.evaluate(()=>addDaysStr(todayStr(),1)),'지금 한칸 7일 창 복원');
 assert.equal(await p.locator('#homeUpcomingList .upcoming-day.is-picked').count(),0,'강조 없음');
 await p.evaluate(()=>showPage('todos'));await p.waitForTimeout(150);
 assert.deepEqual(await p.locator('#todoSideAgenda [data-sa-list]').allTextContents(),['날짜별','언젠가'],'할일 탭도 이름 날짜별');
 assert.equal(await p.locator('#todoSideAgenda .upcoming-day.is-picked').count(),0);
 ok('지금 한칸·할일 탭으로 돌려주면 눈과 강조를 풀고 7일 창 복원');
 assert.equal(await p.evaluate(()=>mockWrites.length),0,'쓰기 요청 없음');assert.deepEqual(errors,[]);await p.close();

 // 7) 모바일(2026-10-18 MOB-01·02): 계획 목록 = 아래쪽 패널(처음 약 60%·손잡이 탭/위로 끌기 90%·아래로 끌기 닫기),
 //    날짜 줄 → 항상 날짜별의 그 날짜, 닫아도 달력 날짜·보기·스크롤 유지, '계획 목록' 버튼은 마지막 탭 복원.
 const m=await b.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',hasTouch:true}),merr=[];m.on('pageerror',e=>merr.push(e.message));
 await fixture(m);await seed(m);await m.locator('#allViewTabs [data-common-view=month]').click();
 const ms=m.locator('#allSideAgenda'),ratio=()=>ms.evaluate(e=>e.getBoundingClientRect().height/innerHeight);
 assert.equal(await m.locator('#allPanelBtn').getAttribute('aria-label'),'계획 목록');
 // 칸의 날짜 줄 → 패널이 열리고 날짜별의 그 날짜(그 달 1일부터)
 const md=await m.evaluate(()=>addDaysStr(todayStr(),1));
 await m.evaluate(()=>{window.scrollTo(0,120);});const scrollY0=await m.evaluate(()=>scrollY);
 await m.locator('#allCalGrid .cal-cell[data-date="'+md+'"] .cal-date-row').tap();
 assert(await ms.isVisible(),'날짜 줄 → 패널 열림');await m.waitForFunction(d=>document.querySelector('#allSideAgenda .upcoming-day.is-picked')?.dataset.date===d,md);
 assert.equal(await ms.locator('.upcoming-day').first().getAttribute('data-date'),md.slice(0,7)+'-01');
 const r0=await ratio();assert(r0>0.55&&r0<0.65,'처음 약 60% '+r0.toFixed(2));
 // 손잡이 탭 → 약 90%, 다시 탭 → 약 60%
 const handle=ms.locator('.sa-handle');await handle.tap();await m.waitForTimeout(300);const r1=await ratio();assert(r1>0.85&&r1<0.95,'탭 → 약 90% '+r1.toFixed(2));
 assert.equal(await handle.getAttribute('aria-expanded'),'true');await handle.tap();await m.waitForTimeout(300);assert((await ratio())<0.65,'다시 탭 → 약 60%');
 // 목록 스크롤은 패널 높이를 바꾸지 않음
 const list=ms.locator('#homeUpcomingList');await list.evaluate(e=>{e.scrollTop=300;});await m.waitForTimeout(100);assert((await ratio())<0.65,'목록 스크롤과 구분');
 // 손잡이를 위로 끌면 90%, 아래로 끌면 닫힘
 const drag=async dy=>{const hb=await handle.boundingBox(),x=hb.x+hb.width/2,y=hb.y+hb.height/2;await handle.dispatchEvent('pointerdown',{pointerId:7,clientX:x,clientY:y,isPrimary:true,pointerType:'touch'});
  for(let i=1;i<=6;i++)await handle.dispatchEvent('pointermove',{pointerId:7,clientX:x,clientY:y+dy*i/6,isPrimary:true,pointerType:'touch'});await handle.dispatchEvent('pointerup',{pointerId:7,clientX:x,clientY:y+dy,isPrimary:true,pointerType:'touch'});await m.waitForTimeout(300);};
 await drag(-300);const r2=await ratio();assert(r2>0.85,'위로 끌기 → 약 90% '+r2.toFixed(2));
 await drag(600);assert(!(await ms.isVisible()),'아래로 끌기 → 닫힘');
 // 닫아도 달력 날짜·보기·스크롤 유지
 assert.equal(await m.evaluate(()=>allViews.view()),'month');assert.equal(await m.locator('#allCalGrid .cal-cell.selected').getAttribute('data-date'),md);
 assert.equal(await m.evaluate(()=>scrollY),scrollY0,'달력 스크롤 유지');
 // '계획 목록' 버튼: 마지막 탭 복원(언젠가로 바꾸고 닫았다 열기)
 await m.locator('#allPanelBtn').tap();await ms.locator('[data-sa-list=someday]').tap();await ms.locator('.sa-close').tap();assert(!(await ms.isVisible()));
 await m.locator('#allPanelBtn').tap();assert.equal(await ms.locator('[data-sa-list=someday]').getAttribute('aria-pressed'),'true','마지막 탭 복원');
 const r3=await ratio();assert(r3<0.65,'다시 열면 약 60%');await ms.locator('.sa-close').tap();
 // 칸의 나머지(날짜 줄 아래)는 예전처럼 날짜 선택 + 아래 날짜 목록
 const cb=await m.locator('#allCalGrid .cal-cell[data-date="'+md+'"]').boundingBox();await m.touchscreen.tap(cb.x+cb.width/2,cb.y+cb.height-6);
 assert(!(await ms.isVisible()),'칸 아래쪽은 패널을 열지 않음');assert(await m.locator('.page[data-page=all] .cal-side .cal-day-add').isVisible(),'모바일 월: 날짜 목록');
 await m.screenshot({path:'test-results/calendar-eyes-date-row-m390.png'}).catch(()=>{});
 assert.deepEqual(merr,[]);ok('모바일: 날짜 줄 → 날짜별 그 날짜, 60%·90% 손잡이(탭·끌기·닫기), 목록 스크롤 구분, 닫아도 달력 유지, 계획 목록 = 마지막 탭');await m.close();
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
