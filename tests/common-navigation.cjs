// All requests intercepted. No live user data or remote DB access.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{fixture}=require('./home-layout.cjs');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[],consoleErrors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR_FAILED/.test(m.text()))consoleErrors.push(m.text());});await fixture(p,process.env.ONEKAN_TEST_SOURCE ? fs.readFileSync(process.env.ONEKAN_TEST_SOURCE,'utf8') : undefined);fs.mkdirSync('test-results',{recursive:true});
 const main=p.locator('#mainSidebarNav'),dedicated=p.locator('#dedicatedSidebarNav'),home=p.locator('#sidebarHomeNav button');
 const back=async()=>{if(await dedicated.isVisible())await p.locator('#sidebarAllMenuBtn').click();};
 const go=async page=>{if(page==='home')return home.click();await back();await main.locator('[data-page='+page+']').click();};
 assert.deepEqual(await p.locator('#sidebarHomeNav > *').evaluateAll(es=>es.map(e=>e.dataset.page||'divider')),['home','divider']);await p.screenshot({path:'test-results/navigation-global.png'});
 for(const page of ['all','schedule','todos','habits','work','timer','records','together','community','settings']){
  await go(page);assert(await dedicated.isVisible());assert(await home.isVisible());assert.equal(await main.locator('.active').getAttribute('data-page'),page);assert.equal(await p.locator('.sidebar [aria-current=page]').count(),1);
  const body=await p.locator('.page[data-page='+page+']').innerHTML(),scroll=await p.evaluate(()=>scrollY);await back();assert.equal(await p.locator('.page[data-page='+page+']').innerHTML(),body);assert.equal(await p.evaluate(()=>scrollY),scroll);assert.equal(await p.evaluate(()=>currentPage),page);
  await main.locator('[data-page='+page+']').click();assert(await dedicated.isVisible());assert.equal(await p.locator('.page[data-page='+page+']').innerHTML(),body);
 }
 await go('todos');await p.locator('#pageSidebarItems [data-sidebar-tab=someday]').click();await p.locator('#somedayInput').fill('담아두기 작성 중');await back();assert.equal(await p.locator('#somedayInput').inputValue(),'담아두기 작성 중');await main.locator('[data-page=todos]').click();assert(await p.locator('#todoSomedayView').isVisible());
 await p.locator('#pageSidebarItems [data-sidebar-tab=list]:visible, #todoTopTabs [data-tab=list]:visible').click();await p.waitForFunction(()=>document.querySelector('#pageSidebarItems [data-sidebar-tab=list]').classList.contains('active'));await p.screenshot({path:'test-results/navigation-todos.png'});
 await go('habits');await p.locator('#habitsTabRow [data-tab=archived]').click();assert(await p.locator('#habitsTabRow [data-tab=archived]').evaluate(e=>e.classList.contains('active')));
 await go('all');assert(!(await p.locator('#allViewTabs').isVisible()));assert.equal(await p.locator('#allSidebarTypes [data-all-type]').count(),3);await p.screenshot({path:'test-results/navigation-all.png'});
 await go('community');assert.equal(await p.locator('.page[data-page=community] :is(button,input)').count(),0);
 await go('together');for(const section of ['friends','guestbook','myroom']){await p.locator('#pageSidebarItems [data-together-section='+section+']').click();assert(await p.locator('#togetherPreparing').isVisible());assert(!(await p.locator('#togetherRoot').isVisible()));assert.match(await p.locator('#togetherPreparingText').textContent(),/준비/);}
 await p.screenshot({path:'test-results/navigation-together.png'});
 await p.evaluate(()=>showPage('together',true));assert.equal(await p.locator('#togetherRoot').evaluate(e=>e.hidden),false);assert.equal(await p.evaluate(()=>togetherSection),'private');
 await go('home');await home.focus();await p.keyboard.press('Tab');await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>currentPage),'all');assert.equal(await p.locator('#pageSidebarItems [data-sidebar-tab=calendar]:focus').count(),1);await p.locator('#sidebarAllMenuBtn').focus();await p.keyboard.press('Enter');assert(await main.isVisible());await p.keyboard.press('Space');assert(await dedicated.isVisible());
 await p.locator('#sidebarAllMenuBtn').focus();await p.setViewportSize({width:760,height:768});await p.locator('#navMoreBtn:focus').waitFor();assert.equal(await p.locator('#navMoreBtn:focus').count(),1);await p.setViewportSize({width:761,height:768});await p.locator('#sidebarAllMenuBtn:focus').waitFor();assert.equal(await p.locator('#sidebarAllMenuBtn:focus').count(),1);
 for(const theme of ['white','black','cheese']){await p.evaluate(t=>applyTheme(t),theme);await go('home');await p.setViewportSize({width:1366,height:768});await p.screenshot({path:'test-results/navigation-theme-'+theme+'.png'});await go('schedule');await p.screenshot({path:'test-results/navigation-dedicated-'+theme+'.png'});}
 await go('home');await p.evaluate(()=>applyTheme('white'));await p.setViewportSize({width:1440,height:320});await main.locator('[data-page=settings]').scrollIntoViewIfNeeded();const r=await home.boundingBox();assert(r.y>=64&&r.y+r.height<160);assert(await main.evaluate(e=>e.scrollTop>0));const f=await p.locator('#logoutBtn').boundingBox();assert(f.y+f.height<=320);await p.screenshot({path:'test-results/navigation-short.png'});
 await main.locator('[data-page=settings]').click();await p.locator('#pageSidebarItems [data-sidebar-anchor=usageSettingsHeading]').click();assert.equal(await p.locator('#usageSettingsHeading:focus').count(),1);
 await p.setViewportSize({width:390,height:844});await p.locator('#navMoreBtn').click();await p.locator('#navMoreSheet [data-page=all]').click();assert(await p.locator('.page[data-page=all]').isVisible());await p.screenshot({path:'test-results/navigation-mobile-all.png'});
 await p.locator('#navMoreBtn').click();await p.locator('#navMoreSheet [data-page=together]').click();for(const section of ['friends','guestbook','myroom','private']){await p.locator('.together-section-tabs [data-together-section='+section+']').click();assert.equal(await p.locator('.together-section-tabs [aria-pressed=true]').getAttribute('data-together-section'),section);}
 await p.locator('.together-section-tabs [data-together-section=friends]').click();await p.screenshot({path:'test-results/navigation-mobile-together.png'});
 await p.locator('#navMoreBtn').click();await p.locator('#navMoreSheet [data-page=community]').click();await p.screenshot({path:'test-results/navigation-mobile-community.png'});
 for(const [width,height] of [[1366,768],[1440,900],[1440,320],[390,844],[760,768],[761,768]]){await p.setViewportSize({width,height});assert.equal(await p.locator('.sidebar').isVisible(),width>760);assert.equal(await p.locator('.bottombar').isVisible(),width<=760);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.equal(await p.evaluate(()=>mockWrites.length),0,'navigation never writes');assert.deepEqual(await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);}),[]);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 console.log('PASS common sidebars: body preserved, fixed home, existing filters, keyboard/focus, responsive themes, preparation screens, private bridge, no writes/duplicate IDs/errors');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
