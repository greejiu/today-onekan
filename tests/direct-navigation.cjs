// Isolated fixture: requests blocked; only in-memory test data is used.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {fixture}=require('./home-layout.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1366,height:768},timezoneId:'Asia/Seoul'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await fixture(page);fs.mkdirSync('test-results',{recursive:true});
 await page.evaluate(()=>localStorage.setItem('tok_task_page','habits'));
 const go=async kind=>{if(kind==='home')return page.locator('#sidebarHomeNav button').click();if(await page.locator('#dedicatedSidebarNav').isVisible())await page.locator('#sidebarAllMenuBtn').click();await page.locator('#mainSidebarNav [data-page='+kind+']').click();};
 const check=async kind=>{
  assert.equal(await page.evaluate(()=>currentPage),kind);
  assert.equal(await page.locator('#mainSidebarNav .active').count(),1);
  assert.equal(await page.locator('#mainSidebarNav .active').getAttribute('data-page'),kind);
  assert.equal(await page.locator('.page[data-page='+kind+'] h1:visible').count(),1);
  assert.equal(await page.locator('.page[data-page='+kind+'] h1:visible').textContent(),kind==='todos'?'할일':'습관');
 };
 assert.equal(await page.locator('[data-work-page],.work-page-switch,.desktop-work-heading').count(),0);
 await go('todos');await check('todos');
 await page.screenshot({path:'test-results/direct-todos-1366.png'});
 await page.locator('#pageSidebarItems [data-sidebar-tab=someday]:visible, #todoTopTabs [data-tab=someday]:visible').click();await page.locator('#somedayInput').fill('보존할 입력');
 await go('habits');await check('habits');await page.screenshot({path:'test-results/direct-habits-1366.png'});
 await page.locator('#habitsTabRow [data-tab=archived]').click();await go('todos');
 assert(await page.locator('#todoSomedayView').isVisible());assert.equal(await page.locator('#somedayInput').inputValue(),'보존할 입력');
 await page.locator('#pageSidebarItems [data-sidebar-tab=list]:visible, #todoTopTabs [data-tab=list]:visible').click();await page.locator('#todoQuickAddBtn').click();await page.locator('#td_title').fill('할일 작성 중');
 for(const width of [760,761,390,1366]){await page.setViewportSize({width,height:768});await check('todos');assert.equal(await page.locator('#td_title').inputValue(),'할일 작성 중');}
 await page.keyboard.press('Escape');await go('habits');assert(await page.locator('#habitsTabRow [data-tab=archived]').evaluate(e=>e.classList.contains('active')));
 await page.locator('#habitAddBtn').click();await page.locator('#ha_name').fill('습관 작성 중');
 for(const width of [760,761,390,1366]){await page.setViewportSize({width,height:768});await check('habits');assert.equal(await page.locator('#ha_name').inputValue(),'습관 작성 중');}
 await page.locator('#ha_cancel').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/direct-mobile-390.png'});
 await page.setViewportSize({width:1366,height:768});await go('home');await go('todos');await check('todos');
 assert.equal(await page.evaluate(()=>localStorage.getItem('tok_task_page')),'habits','obsolete preference is ignored and never rewritten');
 await page.screenshot({path:'test-results/direct-sidebar.png'});
 assert.equal(await page.evaluate(()=>mockWrites.length),0,'navigation and cancelled drafts never write');assert.deepEqual(errors,[]);
 console.log('direct entry / independent active menus / single titles / obsolete preference ignored / subfilters preserved / draft inputs at 760-761 and mobile / no writes or errors PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
