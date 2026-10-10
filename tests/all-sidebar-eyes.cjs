// 2026-10-10 '모두' 개편 반영: 종류 눈은 월·주·일별, 범주·그룹 눈은 공통. 본문 옛 종류 버튼(#allTypes)은 숨김.
// 검증 의도는 그대로: 사이드바에만 눈이 있고, 눈으로 항목이 걸러지며, 화면 이동·사이드바 접기·모바일에서 상태가 맞고, 쓰기 요청이 없음.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await fixture(p);
 await p.evaluate(async()=>{const d=todayStr();mockRows.tok_events=[{id:'e',user_id:'test',title:'일정',event_date:d,end_date:d,all_day:true}];mockRows.tok_todos=[{id:'t',user_id:'test',title:'할일',start_date:d,all_day:true,is_done:false}];await loadAll();showPage('all');});
 await p.locator('#allViewTabs [data-common-view=month]').click();
 const side=p.locator('#allSidebarTypes'),eye=k=>side.locator('[data-aft-eye='+k+']');assert(await side.isVisible());
 assert.deepEqual((await side.locator('[data-aft-fold]').allTextContents()).map(t=>t.replace(/[▾▸]/g,'').trim()),['일정','할일','습관']);
 assert.equal(await p.locator('#allTypes').isVisible(),false);assert.equal(await p.locator('#classificationSideHost').isVisible(),false);
 // 월 기본: 일정만 켬
 assert.equal(await eye('event').getAttribute('aria-pressed'),'true');assert.equal(await eye('todo').getAttribute('aria-pressed'),'false');
 assert(await p.locator('#allCalGrid [data-menu-kind=event]').count());assert.equal(await p.locator('#allCalGrid [data-menu-kind=todo]').count(),0);
 await eye('event').click();await eye('todo').click();assert.equal(await eye('event').getAttribute('aria-pressed'),'false');
 assert.equal(await p.locator('#allCalGrid [data-menu-kind=event]').count(),0);assert(await p.locator('#allCalGrid [data-menu-kind=todo]').count());
 // 다른 기간은 따로: 일 보기에서는 일정 눈이 켜져 있음, 돌아오면 월 설정 유지
 await p.locator('#allViewTabs [data-common-view=day]').click();assert.equal(await eye('event').getAttribute('aria-pressed'),'true');assert(await p.locator('#allHomeDay [data-kind=event]').count()); // 2026-10-10 일 보기 = 지금 한칸 화면
 await p.locator('#allViewTabs [data-common-view=month]').click();assert.equal(await eye('event').getAttribute('aria-pressed'),'false');
 // 다른 화면으로 가면 숨고, 돌아오면 다시 보임
 await p.locator('#todoIconRail [data-page=todos]').click();assert.equal(await side.isVisible(),false);await p.locator('#sidebarRailMore').click();await p.locator('#sidebarRailMoreMenu [data-page=all]').click();assert(await side.isVisible());
 // 사이드바 접기 → 숨김(본문 '표시 설정' 버튼으로 열 수 있음), 펼친 뒤 '모두'로 오면 상태 유지
 await p.locator('#sidebarRailToggle').click();assert.equal(await side.isVisible(),false);assert(await p.locator('#allFilterBtn').isVisible());
 await p.locator('#sidebarRailToggle').click();await p.locator('#sidebarRailMore').click();await p.locator('#sidebarRailMoreMenu [data-page=all]').click();assert.equal(await eye('todo').getAttribute('aria-pressed'),'true');
 await p.screenshot({path:'test-results/all-sidebar-eyes.png'});
 // 모바일: 본문 '표시 설정' 패널에서 같은 상태를 보고 바꿀 수 있고, PC로 돌아와도 같은 값
 await p.setViewportSize({width:390,height:844});await p.locator('#allFilterBtn').click();const panel=p.locator('#allFilterPanel');assert(await panel.isVisible());
 assert.equal(await panel.locator('[data-aft-eye=todo]').getAttribute('aria-pressed'),'true');await panel.locator('[data-aft-eye=todo]').click();await p.keyboard.press('Escape');
 await p.setViewportSize({width:1440,height:900});assert.equal(await eye('todo').getAttribute('aria-pressed'),'false');
 assert.equal(await p.evaluate(()=>mockWrites.length),0);assert.deepEqual(errors,[]);console.log('all sidebar eyes (per month/week/day), body duplicate hidden, event/todo filtering, navigation/collapse/mobile state sync and zero writes PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
