// Read deployed static files; browser auth/database/network use intercepted test data.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright'),{fixture}=require('./home-layout.cjs');
(async()=>{
 const url='https://greejiu.github.io/today-onekan/',sha=process.env.DEPLOY_SHA;
 assert(sha,'DEPLOY_SHA required');
 const response=await fetch(url+'?period='+sha,{cache:'no-store'});assert.equal(response.status,200);
 const source=await response.text(),normalize=s=>s.replace(/\r\n/g,'\n');
 assert.equal(normalize(source),normalize(fs.readFileSync('index.html','utf8')),'served HTML must match the reviewed commit');
 const assetResults=[];
 for(const file of ['assets/together.js','assets/together.css','assets/classification.js','assets/classification.css','assets/schedule-views.js','assets/item-views.js','assets/todo-views.js','assets/habit-views.js','assets/agenda-markup.js','assets/calendar-ui.js','assets/all-views.js','assets/schedule-views.css']){
  const r=await fetch(url+file+'?period='+sha);assert.equal(r.status,200);const text=await r.text();assert.equal(normalize(text),normalize(fs.readFileSync(file,'utf8')));assetResults.push(file+' matched');
 }
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768},timezoneId:'Asia/Seoul'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await fixture(page,source); // Installs auth/DB mocks and blocks all external requests.
  await page.route(url+'**',route=>{
   const pathname=new URL(route.request().url()).pathname.replace('/today-onekan/','');
   if(!pathname)return route.fulfill({contentType:'text/html',body:source});
   if(['assets/together.js','assets/together.css','assets/classification.js','assets/classification.css','assets/schedule-views.js','assets/item-views.js','assets/todo-views.js','assets/habit-views.js','assets/agenda-markup.js','assets/calendar-ui.js','assets/all-views.js','assets/schedule-views.css','assets/cheese-drawing.png'].includes(pathname))return route.fulfill({contentType:pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(pathname)});
   return route.abort();
  });
  await page.goto(url+'?period='+sha);await page.waitForSelector('.upcoming-day');fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/deployed-global.png'});
  for(const target of ['schedule','todos','habits','work','records','settings','all','community','together']){
   if(await page.locator('#dedicatedSidebarNav').isVisible())await page.locator('#sidebarAllMenuBtn').click();await page.locator('#mainSidebarNav [data-page='+target+']').click();assert.equal(await page.evaluate(()=>currentPage),target);assert(await page.locator('#sidebarHomeNav button').isVisible());
   if(target==='schedule')await page.screenshot({path:'test-results/deployed-dedicated.png'});
  }
  await page.locator('#pageSidebarItems [data-together-section=friends]').click();await page.screenshot({path:'test-results/deployed-together.png'});await page.locator('#pageSidebarItems [data-together-section=private]').click();await page.getByRole('button',{name:'방 만들기',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.locator('.together-section-tabs [data-together-section=friends]').click();await page.screenshot({path:'test-results/deployed-mobile.png'});
  await page.locator('#navMoreBtn').click();assert(await page.locator('#navMoreSheet [data-page=all]').isVisible());assert(await page.locator('#navMoreSheet [data-page=community]').isVisible());
  await page.evaluate(()=>closeNavMore());
  for(const width of [1366,390])for(const kind of ['event','todo','habit']) {
   await page.setViewportSize({width,height:width===390?844:900});
   await page.evaluate(kind=>openAddWindowFor(kind,{startDate:'2026-10-03',startTime:'23:00',endDate:'2026-10-04',endTime:'01:00'}),kind);
   const prefix={event:'cev',todo:'td',habit:'ha'}[kind];
   assert.equal(await page.locator('#'+prefix+'_endtime').inputValue(),'01:00');assert(!(await page.locator('#'+prefix+'_allday').isChecked()));
   assert(await page.locator('#'+prefix+(kind==='event'?'_shared_category_id':'_group_id')).isVisible());
   await page.screenshot({path:`test-results/deployed-period-${kind}-${width}.png`});
   await page.evaluate(kind=>{if(kind==='event')hideCalEventSheet();else if(kind==='todo')closeTodoSheet();else closeHabitAddSheet();},kind);
  }
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{showPage('schedule');showScheduleMode('calendar');});
  for(const span of ['day','seven','month']){await page.locator('#scheduleCalendarOptions [data-sv-span='+(span==='seven'?'day':span)+']').click();if(span!=='month')await page.locator('#scheduleDayCount').selectOption(span==='seven'?'7':'1');await page.screenshot({path:'test-results/deployed-schedule-'+span+'.png'});}
  for(const mode of ['list','board']){await page.locator('#scheduleSidebarNav [data-schedule-mode='+mode+']').click();assert(await page.locator(mode==='list'?'#scheduleList':'#scheduleBoard').isVisible());await page.screenshot({path:'test-results/deployed-schedule-'+mode+'.png'});}
  await page.locator('#scheduleSidebarNav [data-schedule-mode=calendar]').click();await page.locator('#scheduleCalendarOptions [data-sv-span=day]').click();await page.locator('#scheduleDayCount').selectOption('7');await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/deployed-schedule-mobile.png'});
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>showPage('todos'));
  for(const mode of ['list','board','someday']){await page.locator('#todoTopTabs [data-tab='+mode+']').click();assert(await page.locator(mode==='someday'?'#todoSomedayView':mode==='board'?'#todoBoard':'#todoUnifiedList').isVisible());await page.screenshot({path:'test-results/deployed-todo-'+mode+'.png'});}
  await page.locator('#todoTopTabs [data-tab=calendar]').click();for(const span of ['day','seven','month']){await page.locator('#todoCalendarOptions [data-sv-span='+(span==='seven'?'day':span)+']').click();if(span!=='month')await page.locator('#todoDayCount').selectOption(span==='seven'?'7':'1');await page.screenshot({path:'test-results/deployed-todo-'+span+'.png'});}
  await page.locator('#todoCalendarOptions [data-sv-span=day]').click();await page.locator('#todoDayCount').selectOption('7');await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/deployed-todo-mobile.png'});
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>showPage('habits'));
  for(const mode of ['list','board']){await page.locator('#habitViewTabs [data-tab='+mode+']').click();assert(await page.locator(mode==='list'?'#todoList':'#habitBoard').isVisible());await page.screenshot({path:'test-results/deployed-habit-'+mode+'.png'});}
  await page.locator('#habitsTabRow [data-tab=archived]').click();await page.screenshot({path:'test-results/deployed-habit-archived.png'});await page.locator('#habitsTabRow [data-tab=active]').click();
  await page.locator('#habitViewTabs [data-tab=calendar]').click();for(const span of ['day','seven','month']){await page.locator('#habitCalendarOptions [data-sv-span='+(span==='seven'?'day':span)+']').click();if(span!=='month')await page.locator('#habitDayCount').selectOption(span==='seven'?'7':'1');await page.screenshot({path:'test-results/deployed-habit-'+span+'.png'});}
  await page.locator('#habitCalendarOptions [data-sv-span=day]').click();await page.locator('#habitDayCount').selectOption('7');await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/deployed-habit-mobile.png'});
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>showPage('all'));for(const mode of ['calendar','list','board']){await page.locator('#allViewTabs [data-tab='+mode+']').click();await page.screenshot({path:'test-results/deployed-all-'+mode+'.png'});}await page.locator('#allViewTabs [data-tab=calendar]').click();await page.locator('#allCalendarOptions [data-sv-span=day]').click();await page.locator('#allDayCount').selectOption('7');await page.screenshot({path:'test-results/deployed-all-seven.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/deployed-all-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);}),[]);
  assert.equal(await page.evaluate(()=>mockWrites.length),0);assert.deepEqual(errors,[]);
  const proof={url,sha,httpStatus:response.status,htmlSHA256:crypto.createHash('sha256').update(normalize(source)).digest('hex'),assets:assetResults,browser:'deployed URL and served HTML; isolated auth/data; desktop/mobile major entrypoints, all four calendars day/seven/month and integrated list/board/type filters; schedule, todo and habit list/board plus habit archived and separate someday, and all three overnight period forms; no writes or page errors'};
  fs.writeFileSync('test-results/deployment-verification.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
