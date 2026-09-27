const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {fixture}=require('./home-layout.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await fixture(page);
 for(const [width,height] of [[1440,900],[1366,768],[390,844],[720,450]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(200);
  const m=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,scale:homeDisplayScale(),count:document.querySelectorAll('.ag-someday-row').length,lists:[...document.querySelectorAll('#somedayZone,#homeUpcomingList,#homeTimelineScroll')].map(e=>({client:e.clientHeight,scroll:e.scrollHeight}))}));
  console.log(width,height,m);assert(m.scrollWidth<=width);assert(m.scrollHeight<=height);assert.equal(m.count,32);assert(m.lists.every(e=>e.scroll<=e.client+1));
  await page.screenshot({path:`test-results/fit-${width}x${height}.png`});
 }
 await page.setViewportSize({width:1366,height:768});await page.click('[data-col2tab="block"]');await page.waitForTimeout(150);assert.equal(await page.locator('#homeLeftoverList').isVisible(),true);
 await page.click('#homeOriginalBtn');await page.waitForTimeout(150);assert.equal(await page.locator('.ag-someday-row').count(),15);assert.equal(await page.evaluate(()=>homeDisplayScale()),1);assert.equal(await page.locator('[data-somedaymore]').isVisible(),true);
 await page.reload();await page.waitForSelector('.upcoming-day');assert.equal(await page.evaluate(()=>homeFitAll),false);
 await page.click('#homeFitAllBtn');await page.waitForTimeout(150);assert.equal(await page.locator('.ag-someday-row').count(),32);
 await page.locator('#somedaySummaryList .item-more').first().click();assert(await page.locator('.item-menu').isVisible());await page.keyboard.press('Escape');
 await page.locator('.somedaysum-check').first().click();await page.waitForFunction(()=>mockRows.tok_someday.some(r=>r.is_done));
 await page.locator('[data-somedayadd]').click();await page.locator('#somedaySummaryList .inline-add-input').fill('전체 맞춤 추가');await page.keyboard.press('Enter');await page.waitForFunction(()=>mockRows.tok_someday.some(r=>r.title==='전체 맞춤 추가'));
 await page.waitForTimeout(150);assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));assert.deepEqual(errors,[]);
 console.log('fit dimensions / all items / revert / persistence / menu / check / add PASS');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
