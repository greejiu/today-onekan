// 2026-10-10 옛 일정 화면(page 'schedule') 삭제 뒤: 예전 이름으로 열어도 통합 일정 화면, 옛 화면 테스트에서 지키던
// 공용 규칙(월 막대 누르기 = 상세, 막대 끌기 = 기간 그대로 이동, 편집창은 바꾼 칸만 저장)을 통합 화면에서 확인. 가짜 Supabase만 씀.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const ok=m=>console.log('PASS '+m);
try{
 const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await fixture(p);
 await p.evaluate(async()=>{mockRows.tok_events=[{id:'e5',user_id:'test',title:'치과',category_id:'g',memo:'메모 유지',...OnekanPeriod.patch('event',{allDay:true,startDate:'2026-10-06',endDate:'2026-10-07'})}];mockRows.tok_event_categories=[{id:'g',user_id:'test',name:'약속',sort_order:0}];await loadAll();});
 // 1) 예전 이름으로 열어도 통합 화면
 await p.evaluate(()=>showPage('schedule'));await p.waitForTimeout(150);
 assert.equal(await p.evaluate(()=>currentPage),'all');assert(await p.locator('.page[data-page=all]').isVisible());assert.equal(await p.locator('.page[data-page=schedule]').count(),0,'옛 화면 DOM 없음');
 assert.equal(await p.locator('#scheduleSidebarNav,#calGrid,#scheduleFilterBg,#scheduleCategoryEditBg').count(),0);ok("showPage('schedule') → 통합 일정 화면, 옛 DOM 없음");
 // 2) 월 막대 누르기 = 상세(편집창 아님)
 await p.locator('#allViewTabs [data-common-view=month]').click();await p.evaluate(()=>allViews.selectDate('2026-10-06'));await p.waitForTimeout(150);
 await p.locator('#allCalGrid .cal-chip[data-id="event|e5"] .cal-chip-title').first().click();await p.waitForTimeout(150);
 assert(await p.locator('#evDetailBg').evaluate(e=>e.classList.contains('open')),'상세 창');assert.equal(await p.locator('#cev_title').isVisible(),false);await p.keyboard.press('Escape');ok('월 막대 누르기 = 일정 상세');
 // 3) 막대를 다른 날짜로 끌면 기간 그대로 이동, 추가 창은 안 열림
 const chip=await p.locator('#allCalGrid .cal-chip[data-id="event|e5"] .cal-chip-title').first().boundingBox(),dest=await p.locator('#allCalGrid .cal-cell[data-date="2026-10-13"]').boundingBox();
 await p.mouse.move(chip.x+10,chip.y+8);await p.mouse.down();await p.mouse.move(dest.x+60,dest.y+70,{steps:12});await p.mouse.up();
 await p.waitForFunction(()=>mockRows.tok_events.find(e=>e.id==='e5').event_date==='2026-10-13');
 assert.equal(await p.evaluate(()=>{const e=mockRows.tok_events.find(e=>e.id==='e5');return OnekanPeriod.read('event',e).endDate;}),'2026-10-14','기간 유지');assert.equal(await p.locator('#cev_title').isVisible(),false);ok('막대 끌기 = 기간 그대로 이동');
 // 4) 편집창: 이름만 바꾸면 다른 값(범주·메모·기간)은 그대로
 const before=await p.evaluate(()=>JSON.parse(JSON.stringify(mockRows.tok_events[0])));
 await p.evaluate(()=>openEventEditor({mode:'edit',id:'e5'}));await p.locator('#cev_title').fill('치과 예약');await p.locator('#cev_save').click();
 await p.waitForFunction(()=>mockRows.tok_events[0].title==='치과 예약');assert.deepEqual(await p.evaluate(()=>mockRows.tok_events[0]),{...before,title:'치과 예약'});ok('편집창: 이름만 수정하면 나머지 그대로');
 assert.deepEqual(errors,[]);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
