// 2026-10-18 글자 크기 4단계 통일 검증: 페이지 제목 24 / 영역 제목·그룹명 16 / 본문·항목명·메뉴·버튼 14 / 보조정보 12.
// 제목으로 쓰이는 날짜(달력 기간 이름, 날짜별 날짜 머리, 지금한칸 날짜)는 제목 크기. 모바일 좁은 칸 미리보기는 보조 크기.
// PC·모바일 가로 넘침 없음, 습관 이름·계획 목록 버튼·휴일 이름 잘림 없음. 가짜 Supabase만 씀.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
const ok=m=>console.log('PASS '+m);
async function seed(p){await p.evaluate(async()=>{const d=todayStr(),T=(k,s,e)=>OnekanPeriod.patch(k,{allDay:false,startDate:d,endDate:d,startTime:s,endTime:e});
 mockRows.tok_time_blocks=[{id:'b1',user_id:'test',title:'오전',start_minute:360,end_minute:720,sort_order:0}];
 mockRows.tok_todos=[{id:'t1',user_id:'test',title:'포트폴리오 정리',is_done:false,...T('todo','09:00','09:30')}];
 mockRows.tok_events=[{id:'e1',user_id:'test',title:'치과',...OnekanPeriod.patch('event',{allDay:true,startDate:d,endDate:d})}];
 mockRows.tok_habits=[{id:'h1',user_id:'test',name:'스트레칭',is_active:true,start_date:d,repeat_unit:'day',repeat_interval:1}];
 await loadAll();});}
const fs=(p,sel)=>p.locator(sel).first().evaluate(e=>getComputedStyle(e).fontSize);
const noOverflow=p=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await fixture(p);await seed(p);
 assert.deepEqual(await p.evaluate(()=>['title','section','body','meta'].map(k=>getComputedStyle(document.documentElement).getPropertyValue('--fs-'+k).trim())),['24px','16px','14px','12px'],'크기 변수');
 // 지금한칸: 열 제목·날짜(제목으로 쓰이는 날짜) 16, 본문 14
 await p.evaluate(()=>showPage('home'));
 assert.equal(await fs(p,'#homeCol3 .home2-col-label'),'16px','열 제목');assert.equal(await fs(p,'#homeUpcomingDateLabel'),'16px','날짜 범위 제목');
 assert.equal(await fs(p,'#homeUpcomingList .ag-section-head .label'),'16px','날짜 머리(그룹명)');assert.equal(await fs(p,'body'),'14px','본문');
 // 일정: 페이지 제목 24, 사이드바 섹션 16·항목 14·보조 12, 기간 이름 16, 버튼 14, 선택 상자 14
 await p.evaluate(()=>showPage('all'));await p.locator('#allViewTabs [data-common-view=month]').click();
 assert.equal(await fs(p,'.page[data-page=all] .page-title'),'24px','페이지 제목');
 assert.equal(await fs(p,'#allSidebarTypes .aft-title'),'16px','사이드바 섹션 제목');assert.equal(await fs(p,'#allSidebarTypes .aft-name'),'14px','사이드바 항목');assert.equal(await fs(p,'#allSidebarTypes .aft-scope'),'12px','보조');
 assert.equal(await fs(p,'#allMonthLabel'),'16px','달력 기간 이름(제목으로 쓰이는 날짜)');assert.equal(await fs(p,'#allTodayBtn'),'14px','버튼');
 assert.equal(await fs(p,'#allCalGrid .cal-chip'),'14px','PC 월 막대 = 항목명');assert.equal(await fs(p,'#allCalGrid .cal-weekday-row span, .cal-weekday-row span'),'12px','요일 머리 = 보조');
 assert.equal(await fs(p,'#allSideAgenda #homeUpcomingList .ag-section-head .label'),'16px','날짜별 날짜 머리');
 // 일 보기 시간블록: 블록 이름 16, 시간 범위 12, 항목명 14, 시각 12
 await p.locator('#allViewTabs [data-common-view=day]').click();if(await p.evaluate(()=>allViews.prefs().day)!=='blocks')await p.locator('#allSubTabs [data-all-sub=blocks]').click();await p.waitForTimeout(150);
 const head=p.locator('#allHomeDay #homeTodayBlockBody .ag-section-head .label').first();
 assert.equal(await head.evaluate(e=>getComputedStyle(e).fontSize),'16px','블록 이름');assert.equal(await head.locator('span[style]').last().evaluate(e=>getComputedStyle(e).fontSize),'12px','블록 시간 범위');
 assert.equal(await fs(p,'#allHomeDay .plan-row[data-id="t1"] .agenda-title'),'14px','항목명');assert.equal(await fs(p,'#allHomeDay .plan-row[data-id="t1"] .plan-time'),'12px','시각');
 // 할일·설정: 선택 상자 14
 await p.evaluate(()=>showPage('todos'));assert.equal(await fs(p,'.page[data-page=todos] select:not([hidden])'),'14px','선택 상자');
 await p.evaluate(()=>showPage('settings'));assert.equal(await fs(p,'.page[data-page=settings] .section-label'),'16px');
 assert.equal(await p.locator('.section-label > span[style*="--sub"]').first().evaluate(e=>getComputedStyle(e).fontSize),'12px','영역 제목 옆 설명 = 보조');
 for(const pg of ['home','all','todos','habits','work','records','timer','settings']){await p.evaluate(x=>showPage(x),pg);await p.waitForTimeout(80);assert(await noOverflow(p),'PC 가로 넘침 없음: '+pg);}
 assert.deepEqual(errors,[]);await p.close();ok('PC: 크기 변수, 페이지 제목 24·영역 제목/날짜 머리/기간 이름 16·항목/메뉴/버튼/선택 14·보조/시각 12, 가로 넘침 없음');

 const m=await b.newPage({viewport:{width:390,height:844},hasTouch:true}),merr=[];m.on('pageerror',e=>merr.push(e.message));await fixture(m);await seed(m);
 await m.evaluate(()=>showPage('all'));await m.locator('#allViewTabs [data-common-view=month]').click();
 assert.equal(await fs(m,'.page[data-page=all] .page-title'),'24px','모바일 페이지 제목');assert.equal(await fs(m,'#allMonthLabel'),'16px');
 assert.equal(await fs(m,'#allCalGrid .cal-chip'),'12px','모바일 월 칸 미리보기 = 보조');
 await m.evaluate(()=>allViews.selectDate('2026-10-01'));await m.waitForTimeout(100);
 const hol=m.locator('#allCalGrid .cal-cell[data-date="2026-10-03"] .cal-holiday');assert.equal(await hol.locator('.hl-tiny').evaluate(e=>getComputedStyle(e).fontSize),'12px');
 assert(await hol.evaluate(e=>e.scrollWidth<=e.clientWidth),'휴일 이름(개천절) 안 잘림');
 await m.evaluate(()=>showPage('habits'));await m.waitForTimeout(150);
 assert(await m.locator('#habitCollection .plan-row[data-id="h1"] .agenda-title').evaluate(e=>e.getBoundingClientRect().width>40),'모바일 습관 이름 보임');
 assert(await m.locator('#habitPanelBtn').evaluate(e=>e.scrollWidth<=e.clientWidth),'계획 목록 글자가 버튼 안');
 for(const pg of ['home','all','todos','habits','work','records','timer','settings']){await m.evaluate(x=>showPage(x),pg);await m.waitForTimeout(80);assert(await noOverflow(m),'모바일 가로 넘침 없음: '+pg);}
 assert.deepEqual(merr,[]);await m.close();ok('모바일 390: 제목 24·기간 이름 16, 월 칸 미리보기·휴일 12(안 잘림), 습관 이름 보임, 계획 목록 버튼 글자 안 넘침, 가로 넘침 없음');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
