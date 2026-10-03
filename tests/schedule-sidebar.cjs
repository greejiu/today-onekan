// All requests are intercepted by the existing fixture. No production data is read or written.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture } = require('./home-layout.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, timezoneId: 'Asia/Seoul' });
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(message.text())) consoleErrors.push(message.text()); });
    await fixture(page);
    await page.evaluate(async () => {
      const today = todayStr();
      mockRows.tok_event_categories = [
        { id: 'cat-work', name: '업무', color: '#7194cc', sort_order: 0 },
        { id: 'cat-life', name: '생활', color: '#d59169', sort_order: 1 },
        { id: 'cat-long', name: '아주 긴 범주 이름도 눈 버튼과 메뉴 버튼을 밀어내지 않아요', color: '#ae8cc8', sort_order: 2 },
        ...Array.from({ length: 36 }, (_, i) => ({ id: 'cat-' + i, name: '범주 ' + (i + 1), color: '#8aa8a0', sort_order: i + 3 })),
        { id: 'cat-archive', name: '이전 프로젝트', color: '#989898', is_archived: true, sort_order: 50 },
        { id: 'cat-unused', name: '연결 없는 보관 범주', is_archived: true, sort_order: 51 },
      ];
      mockRows.tok_events = [
        { id: 'range', title: '업무 여러 날 일정', event_date: addDaysStr(today, -2), end_date: addDaysStr(today, 3), category_id: 'cat-work' },
        { id: 'default', title: '기본 범주 일정', event_date: today, category_id: null },
        { id: 'archived', title: '보관된 범주의 일정', event_date: today, category_id: 'cat-archive' },
        { id: 'life', title: '생활 일정', event_date: today, category_id: 'cat-life' },
        ...Array.from({ length: 6 }, (_, i) => ({ id: 'work-' + i, title: '업무 일정 ' + (i + 1), event_date: today, category_id: 'cat-work', event_time: '10:00' })),
      ];
      // Add deterministic failure and upsert behavior to the same in-memory mock.
      sb.auth.getUser = async () => ({ data: { user: { id: appSymbolUserId } } });
      sb.from = table => {
        let op = 'select', values, filters = [], single = false;
        const q = new Proxy({}, { get(_, key) {
          if (key === 'then') return async resolve => {
            let data = (mockRows[table] || []).filter(row => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
            if (op !== 'select') {
              mockWrites.push({ table, op, values });
              if (window.failNextWrite) { window.failNextWrite = false; return resolve({ data: null, error: { message: '검증용 저장 실패' } }); }
              if (op === 'update') data.forEach(row => Object.assign(row, values));
              if (op === 'upsert') {
                mockRows[table] ||= [];
                let row = mockRows[table].find(row => row.user_id === values.user_id);
                if (!row) { row = { ...values }; mockRows[table].push(row); } else Object.assign(row, values);
                data = [row];
              }
              if (op === 'insert') { const row = { id: 'insert-' + mockWrites.length, ...values }; (mockRows[table] ||= []).push(row); data = [row]; }
            }
            resolve({ data: single ? data[0] || null : data.map(row => ({ ...row })), error: null });
          };
          return (...args) => { if (['insert', 'update', 'upsert'].includes(key)) { op = key; values = args[0]; } if (key === 'eq' || key === 'in') filters.push(args); if (key === 'single' || key === 'maybeSingle') single = true; return q; };
        } });
        return q;
      };
      await loadAll();
      mockWrites.length = 0;
    });
    fs.mkdirSync('test-results', { recursive: true });
    const main=page.locator('#mainSidebarNav'),side=page.locator('#scheduleSidebarNav'),host=page.locator('#classificationSideHost');
    await main.locator('[data-page=schedule]').click();assert(await side.isVisible());
    const before=await page.evaluate(()=>({date:calSelected,month:calCursor,mode:scheduleMode,scroll:scrollY}));
    await page.locator('#sidebarAllMenuBtn').click();await main.locator('[data-page=schedule]').click();
    assert.deepEqual(await page.evaluate(()=>({date:calSelected,month:calCursor,mode:scheduleMode,scroll:scrollY})),before);
    await host.locator('[data-group-eye=cat-work]').click();
    assert.equal(await page.locator('#calGrid .cal-chip[data-id=range]').count(),0);
    await side.locator('[data-schedule-mode=list]').click();
    assert(await page.locator('#scheduleList .sched-open[data-id=range]').count()>0,'calendar eye must not filter list');
    await host.locator('[data-group-select=cat-work]').click();
    assert.equal(await page.locator('#scheduleList .sched-open[data-id=life]').count(),0);
    assert(await page.locator('#scheduleList .sched-open[data-id=range]').count()>0,'explicit hidden group is list accessible');
    await host.locator('[data-group-select=all]').click();await side.locator('[data-schedule-mode=calendar]').click();
    assert.equal(await page.evaluate(()=>mockWrites.length),0);
    assert.equal(await page.evaluate(async()=>{const d=await shareCollect(todayStr());return [...d.allDay,...d.timed].filter(i=>i.kind==='event').length;}),10);
    await host.locator('[data-group-eye=cat-work]').click();
    const expected=await page.evaluate(()=>calEventsOn(calSelected).length);
    assert.equal(await page.locator('#calDayList .cal-day-item').count(),expected);
    await host.locator('[data-collapse]').click();assert(!(await host.locator('.classification-groups').isVisible()));
    await host.locator('[data-collapse]').press('Space');assert(await host.locator('.classification-groups').isVisible());
    await host.locator('[data-archived]').click();assert(await host.locator('[data-group-select=cat-archive]').isVisible());
    await host.locator('[data-group-select=cat-archive]').click();await side.locator('[data-schedule-mode=list]').click();
    assert(await page.locator('#scheduleList .sched-open[data-id=archived]').count()>0);
    await host.locator('[data-group-select=all]').click();await host.locator('[data-archived]').click();
    await page.evaluate(()=>openEventEditor({mode:'edit',id:'life'}));await page.locator('#cev_title').fill('생활 일정 수정');
    for(const width of [760,761])await page.setViewportSize({width,height:768});
    assert.equal(await page.locator('#cev_title').inputValue(),'생활 일정 수정');
    await page.locator('#cev_save').click();await page.locator('#calEventSheetBg').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>events.find(e=>e.id==='life').title),'생활 일정 수정');
    await page.evaluate(()=>showScheduleMode('list'));await page.locator('#schedAddBtn').click();
    await page.locator('#cev_title').fill('목록에서 추가한 여러 날 일정');
    await page.locator('#cev_end').fill(await page.evaluate(()=>addDaysStr(todayStr(),2)));await page.locator('#cev_save').click();
    await page.locator('#calEventSheetBg').waitFor({state:'hidden'});
    assert(await page.evaluate(()=>events.some(e=>e.title==='목록에서 추가한 여러 날 일정'&&e.end_date===addDaysStr(todayStr(),2))));
    const writes=await page.evaluate(()=>mockWrites.length);
    for(const [width,height] of [[1366,768],[1440,900],[1440,320],[390,844],[760,768],[761,768]]){
      await page.setViewportSize({width,height});assert.equal(await page.locator('.sidebar').isVisible(),width>760);
      assert.equal(await page.locator('.bottombar').isVisible(),width<=760);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(width>760){await host.locator('[data-group-select=cat-long]').scrollIntoViewIfNeeded();assert(await page.locator('#sidebarHomeNav').isVisible());
        const footer=await page.locator('.sidebar-footer').boundingBox();assert(footer.y+footer.height<=height);
      }else{await page.locator('#scheduleCategoryMobileBtn').click();assert(await page.locator('#classificationManageList [data-eye=cat-work]').isVisible());
        await page.locator('#classificationManageList [data-eye=cat-work]').click();await page.locator('#classificationManageList [data-eye=cat-work]').click();await page.locator('#classificationManageList [data-eye=default]').click();await page.locator('#classificationManageList [data-eye=default]').click();await page.keyboard.press('Escape');}
      await page.screenshot({path:`test-results/schedule-sidebar-${width}x${height}.png`});
    }
    assert.equal(await page.evaluate(()=>mockWrites.length),writes);
    await page.setViewportSize({width:1366,height:768});
    for(const theme of ['white','black','cheese']){await page.evaluate(t=>applyTheme(t),theme);await page.screenshot({path:`test-results/schedule-sidebar-${theme}.png`});}
    assert.deepEqual(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((v,i)=>ids.indexOf(v)!==i);}),[]);
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
    console.log('PASS schedule regression: calendar/list selection and eyes independent, existing dates/counts/bands/editor/share, archived groups, keyboard, six viewports, three themes, no navigation writes/errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
