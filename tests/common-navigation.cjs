// All requests intercepted. No live user data or remote DB access.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{fixture}=require('./home-layout.cjs');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[],consoleErrors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR_FAILED/.test(m.text()))consoleErrors.push(m.text());});await fixture(p,process.env.ONEKAN_TEST_SOURCE ? fs.readFileSync(process.env.ONEKAN_TEST_SOURCE,'utf8') : undefined);fs.mkdirSync('test-results',{recursive:true});
 // 2026-10-10 사이드바 = 아이콘 줄(#todoIconRail) + 더보기 메뉴 + 탭 전용 사이드바. 왼쪽 화살표: 전용 사이드바 → 전체 메뉴 → 접기.
 // 옛 '지금한칸 고정 + 전체 메뉴 목록' 화면 검증을 같은 의도(본문 보존·현재 위치 하나·키보드·반응형·준비 화면·쓰기 없음)로 옮김.
 const dedicated=p.locator('#dedicatedSidebarNav'),arrow=p.locator('#sidebarRailToggle');
 const railIcon=page=>p.locator('#todoIconRail [data-page='+page+']');
 const go=async page=>{if(await railIcon(page).isVisible())return railIcon(page).click();await p.locator('#sidebarRailMore').click();await p.locator('#sidebarRailMoreMenu [data-page='+page+']').click();};
 const active=()=>p.evaluate(()=>[...document.querySelectorAll('#todoIconRail [data-page].active,#sidebarRailMoreMenu [data-page].active')].map(e=>e.dataset.page));
 const toFullMenu=async()=>{if(await dedicated.isVisible())await arrow.click();};
 for(const page of ['all','todos','habits','work','timer','records','together','community','settings']){
  await go(page);assert.equal(await p.evaluate(()=>currentPage),page);assert(await dedicated.isVisible(),page+' 전용 사이드바');assert.deepEqual(await active(),[page]);assert(await p.locator('.sidebar [aria-current=page]:visible').count()<=1,'보이는 현재 위치 표시는 하나');
  const body=await p.locator('.page[data-page='+page+']').innerHTML(),scroll=await p.evaluate(()=>scrollY);await toFullMenu();assert.equal(await dedicated.isVisible(),false,'화살표 = 전체 메뉴');assert.equal(await p.locator('.page[data-page='+page+']').innerHTML(),body,'본문 그대로');assert.equal(await p.evaluate(()=>scrollY),scroll);assert.equal(await p.evaluate(()=>currentPage),page);
  await go(page);assert(await dedicated.isVisible());assert.equal(await p.locator('.page[data-page='+page+']').innerHTML(),body);
 }
 await go('todos');await p.locator('#todoTopTabs [data-tab=someday]').click();await p.locator('#somedayInput').fill('담아두기 작성 중');await toFullMenu();assert.equal(await p.locator('#somedayInput').inputValue(),'담아두기 작성 중');await go('todos');assert(await p.locator('#todoSomedayView').isVisible());
 await p.locator('#todoTopTabs [data-tab=list]').click();await p.waitForFunction(()=>document.querySelector('#todoTopTabs [data-tab=list]').classList.contains('active'));await p.screenshot({path:'test-results/navigation-todos.png'});
 await go('habits');await p.locator('#habitsTabRow [data-tab=archived]').click();assert(await p.locator('#habitsTabRow [data-tab=archived]').evaluate(e=>e.classList.contains('active')));
 await go('all');assert(await p.locator('#allViewTabs').isVisible());assert.deepEqual(await p.locator('#allSidebarTypes .aft-title').allTextContents(),['내 일정','다른 캘린더']);await p.screenshot({path:'test-results/navigation-all.png'});
 await go('community');assert.equal(await p.locator('.page[data-page=community] :is(button,input)').count(),0);
 await go('together');for(const section of ['friends','guestbook','myroom']){await p.locator('#pageSidebarItems [data-together-section='+section+']').click();assert(await p.locator('#togetherPreparing').isVisible());assert(!(await p.locator('#togetherRoot').isVisible()));assert.match(await p.locator('#togetherPreparingText').textContent(),/준비/);}
 await p.screenshot({path:'test-results/navigation-together.png'});
 await p.evaluate(()=>showPage('together',true));assert.equal(await p.locator('#togetherRoot').evaluate(e=>e.hidden),false);assert.equal(await p.evaluate(()=>togetherSection),'private');
 // 키보드: 아이콘으로 이동(Enter), 화살표(Enter) = 전체 메뉴 → 한 번 더(Space) = 접기
 await railIcon('all').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>currentPage),'all');assert(await dedicated.isVisible());
 await arrow.focus();await p.keyboard.press('Enter');assert.equal(await dedicated.isVisible(),false);await p.keyboard.press('Space');assert(await p.evaluate(()=>document.querySelector('.sidebar').classList.contains('rail-collapsed')));await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>document.querySelector('.sidebar').classList.contains('rail-collapsed')),false);
 await arrow.focus();await p.setViewportSize({width:760,height:768});await p.locator('.bottombar [data-page=all]:focus').waitFor();assert.equal(await p.locator('.bottombar [data-page=all]:focus').count(),1,'좁아지면 아래 탭의 현재 화면으로');await p.setViewportSize({width:761,height:768});await p.waitForTimeout(150);assert(await p.evaluate(()=>{const a=document.activeElement;return a&&a!==document.body&&a.getClientRects().length>0;}),'넓어져도 초점이 보이는 조작부에 남음');
 for(const theme of ['white','black','cheese']){await p.evaluate(t=>applyTheme(t),theme);await go('home');await p.setViewportSize({width:1366,height:768});await p.screenshot({path:'test-results/navigation-theme-'+theme+'.png'});await go('all');await p.screenshot({path:'test-results/navigation-dedicated-'+theme+'.png'});}
 await p.evaluate(()=>applyTheme('white'));await p.setViewportSize({width:1440,height:900});await go('settings');await p.locator('#pageSidebarItems [data-sidebar-anchor=usageSettingsHeading]').click();assert.equal(await p.locator('#usageSettingsHeading:focus').count(),1);
 await p.setViewportSize({width:390,height:844});await p.locator('.bottombar [data-page=all]').click();assert(await p.locator('.page[data-page=all]').isVisible());await p.screenshot({path:'test-results/navigation-mobile-all.png'});
 await p.locator('#navMoreBtn').click();await p.locator('#navMoreSheet [data-page=together]').click();for(const section of ['friends','guestbook','myroom','private']){await p.locator('.together-section-tabs [data-together-section='+section+']').click();assert.equal(await p.locator('.together-section-tabs [aria-pressed=true]').getAttribute('data-together-section'),section);}
 await p.locator('.together-section-tabs [data-together-section=friends]').click();await p.screenshot({path:'test-results/navigation-mobile-together.png'});
 await p.locator('#navMoreBtn').click();await p.locator('#navMoreSheet [data-page=community]').click();await p.screenshot({path:'test-results/navigation-mobile-community.png'});
 for(const [width,height] of [[1366,768],[1440,900],[1440,320],[390,844],[760,768],[761,768]]){await p.setViewportSize({width,height});assert.equal(await p.locator('.sidebar').isVisible(),width>760);assert.equal(await p.locator('.bottombar').isVisible(),width<=760);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.equal(await p.evaluate(()=>mockWrites.length),0,'navigation never writes');assert.deepEqual(await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);}),[]);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 console.log('PASS common sidebars: body preserved, fixed home, existing filters, keyboard/focus, responsive themes, preparation screens, private bridge, no writes/duplicate IDs/errors');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
