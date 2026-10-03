const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const html = fs.readFileSync('index.html', 'utf8');
new (require('node:vm').Script)(html.match(/<script>([\s\S]*)<\/script>/)[1]);
async function fixture(page, source = html) {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url === 'http://onekan.test/') return route.fulfill({ contentType:'text/html', body:source });
    if (url.endsWith('/assets/cheese-drawing.png')) return route.fulfill({contentType:'image/png',body:fs.readFileSync('assets/cheese-drawing.png')});
    if (url.endsWith('/assets/item-views.js')) return route.fulfill({contentType:'application/javascript',body:fs.readFileSync('assets/item-views.js')});
    if (url.endsWith('/assets/todo-views.js')) return route.fulfill({contentType:'application/javascript',body:fs.readFileSync('assets/todo-views.js')});
    if (url.endsWith('/assets/schedule-views.js')) return route.fulfill({contentType:'application/javascript',body:source.includes('assets/item-views.js')?fs.readFileSync('assets/schedule-views.js'):require('node:child_process').execFileSync('git',['show','origin/main:assets/schedule-views.js'])});
    if (url.endsWith('/assets/schedule-views.css')) return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/schedule-views.css')});
    if (url.endsWith('/assets/classification.js')) return route.fulfill({contentType:'application/javascript',body:fs.readFileSync('assets/classification.js')});
    if (url.endsWith('/assets/classification.css')) return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/classification.css')});
    if (url.includes('supabase.min.js')) return route.fulfill({ contentType:'application/javascript', body:'/* isolated mock supplied by init script */' });
    return route.abort(); // Never contact production or external services.
  });
  await page.addInitScript(() => {
    const date = n => { const d=new Date(); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const rows = window.mockRows = {
      tok_someday: Array.from({length:32},(_,i)=>({id:`s${i}`,title:`언젠가 ${i} 아주 긴 제목을 여러 줄로 표시하는 테스트 항목입니다`,is_done:false,tag_id:`g${i%18}`,created_at:new Date(i*1000).toISOString()})),
      tok_todos: Array.from({length:36},(_,i)=>({id:`t${i}`,title:`할일 ${i} 긴 제목 검증`,is_done:false,start_date:date(i<12?0:i<24?1:-1),todo_time:i%2?'09:00':null,duration_minutes:30})),
      tok_events:[{id:'e1',title:'여러 날 일정',event_date:date(0),end_date:date(2),event_time:null}],
      tok_time_blocks:[{id:'b1',name:'아침',start_minute:360,end_minute:720,sort_order:0},{id:'b2',name:'오후',start_minute:720,end_minute:1080,sort_order:1},{id:'b3',name:'저녁',start_minute:1080,end_minute:1440,sort_order:2}],
      tok_habit_categories:Array.from({length:18},(_,i)=>({id:`g${i}`,name:`그룹 ${i}`,color:'#b98cf0',sort_order:i})),
      tok_habits:[{id:'h1',name:'습관 테스트',is_active:true,start_date:date(-1),start_minute:null,repeat_unit:null}],
    };
    window.mockWrites=[]; window.mockDelay=0;
    window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'test',email:'test@example.invalid'}}}}),getUser:async()=>({data:{user:{id:'test'}}})},from(table){
      let op='select',values,filters=[],single=false;const q=new Proxy({}, {get(_,key){
        if(key==='then')return async resolve=>{ const data=(rows[table]||[]).filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v)).map(r=>({...r})); const delay=window.mockDelay; window.mockDelay=0; if(delay) await new Promise(r=>setTimeout(r,delay));
          if(op==='update') { (rows[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v)).forEach(r=>Object.assign(r,values));window.mockWrites.push({table,op,values}); }
          if(op==='insert'){const added=(Array.isArray(values)?values:[values]).map((r,i)=>({id:`new${Date.now()}${i}`,...r}));rows[table]||=[];rows[table].push(...added);window.mockWrites.push({table,op,values});}
          resolve({data:single?(data[0]||null):data,error:null});};
        return (...args)=>{if(['insert','update','delete','upsert'].includes(key)){op=key;values=args[0];}if(key==='eq'||key==='in')filters.push(args);if(key==='single'||key==='maybeSingle')single=true;return q;};
      }});return q;
    }})};
  });
  await page.goto('http://onekan.test/');
  await page.locator('#app').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('.upcoming-day').length===7);
}
module.exports = { fixture };
if (require.main === module) (async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await fixture(page);
  for(const [width,height] of [[1440,900],[1366,768],[900,650],[720,450],[390,844],[1440,500]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const metrics=await page.evaluate(()=>({w:document.documentElement.scrollWidth,inner:innerWidth,bounded:document.querySelector('.home2-grid').classList.contains('home-bounded'),cards:[...document.querySelectorAll('.home2-col')].map(e=>({id:e.id,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom}))}));
    assert(metrics.w<=width,JSON.stringify(metrics));
    if(width>1100 && height>=768){assert(metrics.bounded);assert(metrics.cards.every(c=>c.bottom<=height));assert(metrics.cards[0].x<metrics.cards[1].x&&metrics.cards[1].x<metrics.cards[2].x);}
    assert.deepEqual(metrics.cards.map(c=>c.id),['homeCol2','homeCol3','homeCol1']);
    if(width<=1100)assert(metrics.cards[0].y<metrics.cards[1].y && metrics.cards[1].y<metrics.cards[2].y);
    fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:`test-results/home-${width}x${height}.png`});
    console.log('layout',width,height,'PASS');
  }
  await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(100);
  const center=await page.locator('#agendaDateLabel').textContent();
  await page.click('#homeUpcomingNextBtn');await page.waitForTimeout(50);assert.equal(await page.locator('#agendaDateLabel').textContent(),center);
  const right=await page.locator('#homeUpcomingDateLabel').textContent();await page.click('#agendaNextBtn');await page.waitForTimeout(50);assert.equal(await page.locator('#homeUpcomingDateLabel').textContent(),right);
  await page.click('#agendaDateLabel');await page.click('#homeUpcomingDateLabel');
  await page.locator('#homeTimelineScroll').evaluate(e=>e.scrollTop=240);await page.waitForTimeout(50);
  await page.click('[data-col2tab="block"]');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.locator('#homeTodayBlockWrap').evaluate(e=>e.scrollTop=120);await page.waitForTimeout(50);
  await page.click('[data-col2tab="timeline"]');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('#homeTimelineScroll').evaluate(e=>e.scrollTop),240);
  await page.click('[data-col2tab="block"]');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('#homeTodayBlockWrap').evaluate(e=>e.scrollTop),120);
  await page.reload();await page.waitForSelector('.upcoming-day');await page.waitForTimeout(100);assert(await page.locator('#homeBlockPanel').isVisible());assert.equal(await page.locator('#homeTodayBlockWrap').evaluate(e=>e.scrollTop),120);
  await page.evaluate(()=>renderHome());await page.waitForTimeout(100);assert.equal(await page.locator('#homeTodayBlockWrap').evaluate(e=>e.scrollTop),120);
  console.log('independent dates / view and scroll restore PASS');
  // Resolve an old request after the next navigation has rendered.
  await page.evaluate(()=>{window.mockDelay=250;renderHomeUpcomingList();goHomeUpcoming(7);});await page.waitForTimeout(350);
  assert.equal(await page.locator('.upcoming-day').first().getAttribute('data-date'),await page.evaluate(()=>homeUpcomingStart));
  await page.evaluate(()=>{
    const original=todayAllDayItems; let first=true;
    todayAllDayItems=async date=>{const result=await original(date);if(first){first=false;await new Promise(r=>setTimeout(r,250));}return result;};
    renderHomeTodayBlock();goAgendaDate(1);setTimeout(()=>todayAllDayItems=original,300);
  });await page.waitForTimeout(350);
  assert.equal(await page.locator('[data-blockallday]').getAttribute('data-blockallday'),await page.evaluate(()=>homeAgendaDate));
  console.log('stale response protection PASS');
  await page.evaluate(()=>resetAgendaDateToToday());await page.waitForTimeout(50);
  await page.click('#homeLeftoverToggle');assert(await page.locator('#homeLeftoverList').isVisible());assert((await page.locator('#homeCol2').boundingBox()).height<900);
  // Existing five-more behavior: arriving does nothing; a fresh gesture adds five.
  const count=()=>page.locator('#somedaySummaryList .ag-someday-row').count();let before=await count();
  await page.locator('#somedayZone').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new WheelEvent('wheel',{deltaY:100}));});assert.equal(await count(),before);
  await page.waitForTimeout(350);await page.locator('#somedayZone').evaluate(e=>e.dispatchEvent(new WheelEvent('wheel',{deltaY:100})));assert.equal(await count(),before+5);
  console.log('leftover / wheel five-more PASS');
  // Drop coordinates refer to the actual independent date and block time.
  await page.click('#homeUpcomingDateLabel');await page.waitForFunction(()=>document.querySelector('.upcoming-day')?.dataset.date===homeUpcomingStart);
  for(const selector of ['#somedayZone','.upcoming-day','#homeTodayBlockAllDay','.ag-block-card[data-block-start]']){
    await page.locator(selector).first().scrollIntoViewIfNeeded();const box=await page.locator(selector).first().boundingBox();const zone=await page.evaluate(({x,y})=>homeDropZone(x,y),{x:box.x+box.width/2,y:Math.max(box.y, (await page.locator(selector).first().evaluate(e=>e.closest("#homeTodayBlockWrap, #homeUpcomingList, #somedayZone")?.getBoundingClientRect().top||0)))+10});assert(zone,selector);if(selector==='.upcoming-day')assert.equal(zone.date,await page.evaluate(()=>homeUpcomingStart));console.log('drop',selector,zone);
  }
  await page.locator('#homeUpcomingList').evaluate(e=>e.scrollTop=0);
  const rect=await page.locator('#homeUpcomingList').boundingBox();await page.evaluate(()=>document.querySelector('.ag-someday-row').classList.add('dragging'));
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height-8);await page.waitForTimeout(180);assert(await page.locator('#homeUpcomingList').evaluate(e=>e.scrollTop)>0);await page.mouse.up();await page.evaluate(()=>document.querySelector('.ag-someday-row').classList.remove('dragging'));
  console.log('stationary pointer edge scroll PASS');
  await page.evaluate(()=>{goHomeUpcoming(7);document.querySelector('#homeTodayBlockWrap').scrollTop=0;});await page.waitForTimeout(100);
  const source=page.locator('#homeTodayBlockAllDay .home-today-row[data-id="t0"]');await source.scrollIntoViewIfNeeded();
  await page.locator('#homeUpcomingList').evaluate(e=>e.scrollTop=0);
  const sourceBox=await source.boundingBox();const targetBox=await page.locator('.upcoming-day').first().boundingBox();
  await page.mouse.move(sourceBox.x+sourceBox.width/2,sourceBox.y+sourceBox.height/2);await page.mouse.down();
  await page.mouse.move(targetBox.x+targetBox.width/2,targetBox.y+30,{steps:12});await page.mouse.up();
  await page.waitForFunction(()=>mockRows.tok_todos.find(t=>t.id==='t0').start_date===homeUpcomingStart);
  console.log('actual center-to-upcoming pointer drag / displayed date saved PASS');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  before=await count();await page.locator('[data-somedaymore]').click();assert.equal(await count(),before+5);
  await page.locator('#somedaySummaryList .item-more').first().click();assert(await page.locator('.item-menu').isVisible());await page.keyboard.press('Escape');
  await page.locator('.somedaysum-check').first().click();await page.waitForTimeout(100);assert(await page.evaluate(()=>mockWrites.some(w=>w.table==='tok_someday'&&w.op==='update')));
  await page.locator('[data-somedayadd]').click();await page.locator('#somedaySummaryList .inline-add-input').fill('모바일 추가 테스트');await page.locator('#somedaySummaryList .inline-add-input').press('Enter');await page.waitForTimeout(100);assert(await page.evaluate(()=>mockRows.tok_someday.some(r=>r.title==='모바일 추가 테스트')));
  await page.evaluate(()=>{todos=[];tasks=[];events=[];renderHome();});await page.waitForTimeout(100);
  await page.locator('[data-blockallday]').click();assert(await page.locator('#homeTodayBlockAllDay .inline-add-input').isVisible());await page.keyboard.press('Escape');
  console.log('mobile more / menu / check / add / empty all-day PASS');
  const baseline=await browser.newPage({viewport:{width:390,height:844}});
  await fixture(baseline,require('node:child_process').execFileSync('git',['show','origin/main:index.html'],{encoding:'utf8'}));
  for(const tab of ['schedule','todos','habits','settings']){await page.evaluate(tab=>showPage(tab),tab);const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));console.log('tab',tab,overflow);await baseline.evaluate(tab=>showPage(tab),tab);const baseWidth=await baseline.evaluate(()=>document.documentElement.scrollWidth);if(tab==='settings')assert(overflow.scroll<=baseWidth,'removed classification settings must not increase overflow');else assert.equal(overflow.scroll,baseWidth,tab+' matches main');}
  await page.setViewportSize({width:1366,height:768});
  await page.evaluate(()=>{showPage('home');document.querySelector('#homeTodoBanner').style.display='flex';document.querySelector('#homeHabitBanner').style.display='flex';});await page.waitForTimeout(100);
  assert((await page.locator('#homeCol2').boundingBox()).y+(await page.locator('#homeCol2').boundingBox()).height<=768);
  await page.screenshot({path:'test-results/home-banners-empty.png'});
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await fixture(mobile);
  await mobile.locator('[data-col2tab="block"]').tap();assert(await mobile.locator('#homeBlockPanel').isVisible());
  await mobile.locator('#somedaySummaryList .item-more').first().tap();assert(await mobile.locator('.item-menu.is-sheet').isVisible());await mobile.keyboard.press('Escape');
  await mobile.locator('[data-somedaymore]').tap();assert.equal(await mobile.locator('.ag-someday-row').count(),20);
  await mobile.locator('.somedaysum-check').first().tap();await mobile.waitForFunction(()=>mockWrites.some(w=>w.op==='update'));
  await mobile.locator('[data-somedayadd]').tap();await mobile.locator('#somedaySummaryList .inline-add-input').fill('터치 추가');await mobile.keyboard.press('Enter');await mobile.waitForFunction(()=>mockRows.tok_someday.some(r=>r.title==='터치 추가'));
  await mobile.evaluate(()=>scrollTo(0,0));await mobile.screenshot({path:'test-results/home-mobile-block.png'});
  console.log('banners / touch emulation PASS');
  assert.deepEqual(errors,[]);console.log('other tabs / no JavaScript errors PASS');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
