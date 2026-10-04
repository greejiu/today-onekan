// All requests use the existing isolated fixture; never contact production.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {fixture}=require('./home-layout.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await fixture(page);fs.mkdirSync('test-results',{recursive:true});
 const side=page.locator('.sidebar');const nav=side.locator('#mainSidebarNav .navitem');
 const go=async target=>{if(['home','all','schedule','todos','habits'].includes(target))return page.locator('#todoIconRail [data-page='+target+']').click();await page.locator('#sidebarRailMore').click();await page.locator('#sidebarRailMoreMenu [data-page='+target+']').click();};
 assert.deepEqual((await nav.allTextContents()).map(t=>t.trim()),['지금한칸','모두','일정','할일','습관','목표','추적','기록','같이한칸','커뮤니티','설정']);
 assert.deepEqual(await side.locator('#mainSidebarNav > *').evaluateAll(es=>es.map(e=>e.dataset.page||'divider')),['home','all','schedule','todos','habits','divider','work','timer','records','divider','together','community','divider','settings']);
 assert.equal(await side.locator('#mainSidebarNav .sidebar-divider').count(),3);assert.equal(await side.locator('.sidebar-footer .navitem').count(),0);
 assert.equal(await side.locator('.sidebar-quickadd, #quickTaskInputSide, #quickAddBtnSide').count(),0);
 await page.evaluate(()=>{document.getElementById('quickTaskInput').value='폭 변경 중인 빠른 입력';});
 await go('todos');await page.locator('#pageSidebarItems [data-sidebar-tab=someday]:visible, #todoTopTabs [data-tab=someday]:visible').click();await page.locator('#somedayInput').fill('보존할 담아두기');
 await go('habits');
 assert.equal(await side.locator('#mainSidebarNav [data-page].active').getAttribute('data-page'),'habits');assert.equal(await side.locator('#mainSidebarNav [aria-current=page]').count(),1);
 for(const [width,height] of [[1366,768],[1440,900],[761,768],[760,768],[390,844],[1440,900]]){
  await page.setViewportSize({width,height});
  assert.equal(await side.isVisible(),width>760);assert.equal(await page.locator('.bottombar').isVisible(),width<=760);
  assert.equal(await page.locator('.page[data-page=habits]').isVisible(),true);
  assert.equal(await page.locator('#quickTaskInput').inputValue(),'폭 변경 중인 빠른 입력');
  assert.equal(await page.locator('#somedayInput').inputValue(),'보존할 담아두기');
  if(width>760){assert.equal((await side.boundingBox()).width,236);assert.equal(await side.locator('#mainSidebarNav [data-page].active').count(),1);assert.equal(await page.locator('.page[data-page=habits] h1.page-title').isVisible(),true);}
  else{assert.equal(await page.locator('.bottombar .active').getAttribute('data-page'),'habits');assert.equal(await page.locator('.page[data-page=habits] h1.page-title').isVisible(),true);}
  await page.screenshot({path:`test-results/sidebar-${width}x${height}.png`});
 }
 await go('todos');assert.equal(await page.locator('#todoSomedayView').isVisible(),true);
 await page.locator('#sidebarHomeNav [data-page=home]:visible,#todoIconRail [data-page=home]:visible').focus();await page.keyboard.press('Enter');assert.equal(await side.locator('#mainSidebarNav [data-page].active').getAttribute('data-page'),'home');
 await page.keyboard.press('Tab');await page.keyboard.press('Space');assert.equal(await side.locator('#mainSidebarNav [data-page].active').getAttribute('data-page'),'all');
 assert.notEqual(await page.locator('#todoIconRail [data-page=all]').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 for(const target of ['home','all','community','timer','schedule','todos','habits','work','together','records','settings']){await go(target);assert.equal(await side.locator('#mainSidebarNav [data-page].active').count(),1);assert.equal(await side.locator('#mainSidebarNav [aria-current=page]').getAttribute('data-page'),target);}
 // Calendar/list selection and scroll survive navigation through the new sidebar.
 await go('schedule');
 await page.locator('#scheduleSidebarNav [data-schedule-view=list]').click();await page.evaluate(()=>window.scrollTo(0,200));
 const scroll=await page.evaluate(()=>window.scrollY);
 await go('records');await go('schedule');
 assert.equal(await page.locator('#scheduleSidebarNav [data-schedule-view=list]').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>window.scrollY),scroll);
 await page.locator('#scheduleSidebarNav [data-schedule-view=month]').click();const selected=await page.evaluate(()=>calSelected);
 await go('todos');await go('schedule');assert.equal(await page.evaluate(()=>calSelected),selected);
 // Keep the selected project while its title switches between desktop and mobile.
 await page.evaluate(async()=>{mockRows.tok_projects=[{id:'p1',name:'연결된 프로젝트',parent_id:null,sort_order:0}];await loadAll();});
 await go('work');await page.locator('#projectList [data-proj=p1]').click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>workSelectedId),'p1');
 await page.setViewportSize({width:1440,height:900});assert.equal(await page.evaluate(()=>workSelectedId),'p1');
 assert.equal(await page.locator('.page[data-page=work] h1').textContent(),'목표');
 assert.equal(await page.evaluate(()=>mockWrites.length),0,'navigation never writes');
 await page.locator('#sidebarAllMenuBtn').click();await page.setViewportSize({width:1440,height:320});await page.locator('#sidebarRailMore').scrollIntoViewIfNeeded();
 const logout=await page.locator('#logoutBtn').boundingBox();assert(logout.y>=64&&logout.y+logout.height<=320);assert(await page.locator('#todoIconRail').evaluate(e=>e.scrollTop>0));
 await page.screenshot({path:'test-results/sidebar-short-account.png'});
 await page.locator('#sidebarRailMore').scrollIntoViewIfNeeded();assert(await page.locator('#sidebarRailMore').isVisible());
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>document.querySelector('.sidebar').scrollTop=0);
 for(const theme of ['white','black','cheese']){
  await page.evaluate(theme=>{applyTheme(theme);applyUserFont('Georgia');},theme);
  const fits=await page.locator("#todoIconRail [data-page]").evaluateAll(es=>es.every(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().right<=e.getBoundingClientRect().right-10&&e.scrollWidth<=e.clientWidth;}));assert(fits,theme);
  await page.screenshot({path:`test-results/sidebar-theme-${theme}.png`});
 }
 await page.setViewportSize({width:390,height:844});
 assert.deepEqual((await page.locator('.bottombar .navitem').allTextContents()).map(t=>t.trim()),['지금 한칸','일정','할일','습관','더보기']);
 await page.locator('#navMoreBtn').click();assert.deepEqual((await page.locator('#navMoreSheet .navitem').allTextContents()).map(t=>t.trim()),['같이 한칸','목표','추적','기록','설정','모두','커뮤니티']);
 await page.locator('#navMoreSheet [data-page=work]').click();assert(await page.locator('.page[data-page=work] .mobile-only').isVisible());assert.equal(await page.locator('#navMoreBtn').getAttribute('aria-expanded'),'false');assert(await page.locator('#navMoreBtn').evaluate(e=>e.classList.contains('active')));
 await page.screenshot({path:'test-results/sidebar-mobile-project.png'});
 await page.locator('.bottombar [data-page=todos]').click();await page.locator('.bottombar [data-page=habits]').click();
 await page.locator('#quickTaskInput').fill('모바일 오늘 할일');
 await page.locator('#quickAddBtn').click();await page.waitForFunction(()=>mockRows.tok_todos.some(t=>t.title==='모바일 오늘 할일'));
 assert.equal(await page.evaluate(()=>mockRows.tok_todos.find(t=>t.title==='모바일 오늘 할일').start_date),await page.evaluate(()=>todayStr()));assert.equal(await page.locator('#quickTaskInput').inputValue(),'');await page.setViewportSize({width:1440,height:900});assert.equal(await page.locator('#quickTaskInputSide').count(),0);
 assert.deepEqual(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);}),[]);
 assert.deepEqual(errors,[]);console.log('desktop menu / separators / keyboard / breakpoint / input preservation / themes / short window / mobile more / quick add / no navigation writes / unique IDs PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
