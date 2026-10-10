// 2026-10-10 옛 일정 화면 삭제로 통합 일정 화면(page 'all') 주 → 타임라인 기준으로 옮김.
// 지키는 것: 모든 폭에서 7일이 가로 스크롤 없이 다 보임, 시간 축은 하나, 겹친 일정은 나란히(서로 가리지 않음), 일 보기로 바꾸면 주 축이 사라짐.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await fixture(p);
 await p.evaluate(async()=>{mockRows.tok_events=[{id:'e',user_id:'test',title:'긴 제목의 주간 일정입니다',event_date:'2026-10-05',end_date:'2026-10-05',event_time:'09:00',end_time:'10:00',duration_minutes:60,all_day:false},{id:'overlap',user_id:'test',title:'동시에 진행되는 일정',event_date:'2026-10-05',end_date:'2026-10-05',event_time:'09:15',end_time:'10:15',duration_minutes:60,all_day:false},{id:'all',user_id:'test',title:'종일 일정',event_date:'2026-10-06',end_date:'2026-10-06',all_day:true}];await loadAll();showPage('all');allViews.selectDate('2026-10-05');});
 await p.locator('#allViewTabs [data-common-view=week]').click();await p.locator('#allSubTabs [data-all-sub=timeline]').click();await p.waitForTimeout(200);
 const axisCount=await p.locator('#allTimeScroll .schedule-week-axis').count();
 for(const width of [1440,900,761,760,390,320]){await p.setViewportSize({width,height:900});await p.waitForTimeout(150);
  const geometry=await p.locator('#allTimeScroll').evaluate(el=>{const r=el.getBoundingClientRect();return {fits:el.scrollWidth<=el.clientWidth+1,days:[...el.querySelectorAll('.sv-day')].map(d=>{const x=d.getBoundingClientRect();return x.left>=r.left-1&&x.right<=r.right+1;}),axis:el.querySelectorAll('.schedule-week-axis').length};});
  assert(geometry.fits,JSON.stringify({width,...geometry}));assert.deepEqual(geometry.days,Array(7).fill(true),'7일 모두 보임 '+width);assert.equal(geometry.axis,axisCount,'시간 축 수 그대로');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'페이지 가로 넘침 없음 '+width);}
 assert(axisCount<=1,'시간 축은 하나 이하');
 await p.setViewportSize({width:1440,height:900});await p.waitForTimeout(150);
 const a=await p.locator('#allTimeScroll [data-event-id="event|e"]').boundingBox(),o=await p.locator('#allTimeScroll [data-event-id="event|overlap"]').boundingBox();
 assert(a&&o&&(a.x+a.width<=o.x+1||o.x+o.width<=a.x+1),'겹친 일정은 나란히');
 await p.locator('#allViewTabs [data-common-view=day]').click();await p.waitForTimeout(150);assert.equal(await p.locator('#allHomeDay .home2-tabpanel:visible').count(),1);assert.equal(await p.locator('.page[data-page=all] .schedule-week-axis:visible').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS seven visible days at 1440/900/761/760/390/320, one axis, overlap side by side, day isolation');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
