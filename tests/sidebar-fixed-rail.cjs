const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await fixture(p);
 const positions=()=>p.locator('#todoIconRail [data-page]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {page:e.dataset.page,x:r.x,y:r.y};}));
 assert.deepEqual((await positions()).map(x=>x.page),['home','all','schedule','todos','habits']);const original=await positions();
 await p.locator('#todoIconRail [data-page=todos]').click();assert(await p.locator('#dedicatedSidebarNav').isVisible());assert.deepEqual(await positions(),original);
 await p.locator('#sidebarAllMenuBtn').click();assert(await p.locator('#mainSidebarNav').isVisible());assert.deepEqual(await positions(),original);
 await p.locator('#sidebarRailToggle').click();assert.equal(await p.locator('#mainSidebarNav').isVisible(),false);assert.equal(await p.locator('#dedicatedSidebarNav').isVisible(),false);assert.deepEqual(await positions(),original);
 await p.locator('#todoIconRail [data-page=schedule]').click();assert.equal(await p.evaluate(()=>currentPage),'schedule');assert.equal(await p.locator('#dedicatedSidebarNav').isVisible(),false);assert.deepEqual(await positions(),original);
 await p.locator('#sidebarRailToggle').click();assert(await p.locator('#mainSidebarNav').isVisible());assert.deepEqual(await positions(),original);
 await p.locator('#sidebarRailMore').click();assert(await p.locator('#sidebarRailMoreMenu').isVisible());assert.equal(await p.locator('#sidebarRailMoreMenu [data-page=habits]').count(),0);
 await p.locator('#sidebarRailMoreMenu [data-page=settings]').click();assert.equal(await p.evaluate(()=>currentPage),'settings');assert.equal(await p.locator('#sidebarRailMoreMenu').isVisible(),false);assert.deepEqual(await positions(),original);
 await p.locator('#sidebarRailMore').click();await p.keyboard.press('Escape');assert.equal(await p.locator('#sidebarRailMore').getAttribute('aria-expanded'),'false');
 await p.locator('#todoIconRail [data-page=home]').click();assert(await p.locator('#mainSidebarNav').isVisible());assert.deepEqual(await positions(),original);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.locator('.sidebar').isVisible(),false);assert(await p.locator('.bottombar').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('fixed icon coordinates across full/detail/collapsed/navigation; more menu + Escape; mobile PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
