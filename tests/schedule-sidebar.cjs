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
    const main = page.locator('#mainSidebarNav');
    const side = page.locator('#scheduleSidebarNav');
    const row = id => page.locator(`[data-schedule-cat="${id}"]`);
    const eye = id => row(id).locator('.schedule-cat-eye');
    const back = async () => { await page.locator('#scheduleSidebarBack').click(); };
    const enter = async () => { await main.locator('[data-page=schedule]').click(); };
    assert.deepEqual(await main.locator(':scope > *').evaluateAll(nodes => nodes.map(node => node.dataset.page || 'divider')), ['home', 'divider', 'schedule', 'todos','habits','work', 'divider', 'timer', 'together', 'divider', 'records', 'settings']);
    assert.deepEqual((await main.locator('[data-page]').allTextContents()).map(text => text.trim()), ['지금한칸', '일정','할일','습관', '목표', '시간추적', '같이한칸', '기록', '설정']);
    assert.equal(await page.locator('.sidebar-quickadd, #quickTaskInputSide').count(), 0);
    await page.screenshot({ path: 'test-results/schedule-sidebar-main.png' });
    await enter();
    assert(await side.isVisible()); assert(!(await main.isVisible()));
    assert.equal(await page.locator('#scheduleModeToggle').isVisible(), false);
    assert.equal(await page.locator('#scheduleCategoryCollapse').getAttribute('aria-expanded'), 'true');
    assert.equal(await row('cat-unused').count(), 0);
    assert.match(await row('cat-archive').textContent(), /보관됨/);
    assert.equal(await page.locator('#scheduleCategoryList').evaluate(list => list.scrollHeight > list.clientHeight), true);
    await page.screenshot({ path: 'test-results/schedule-sidebar-calendar.png' });

    const state = () => page.evaluate(() => ({ date: calSelected, month: calCursor, mode: scheduleMode, scroll: scrollY, hidden: [...scheduleHiddenCategories] }));
    await side.locator('[data-schedule-mode=list]').click();
    await page.evaluate(() => scrollTo(0, 160));
    const beforeBack = await state();
    await back(); assert.deepEqual(await state(), beforeBack);
    assert.equal(await main.locator('[aria-current=page]').getAttribute('data-page'), 'schedule');
    await enter(); assert.deepEqual(await state(), beforeBack);
    await side.locator('[data-schedule-mode=calendar]').click();
    assert.equal(await page.locator('#scheduleModeCalendarBtn').getAttribute('aria-pressed'), 'true');
    await page.locator('#calNextBtn').click(); await page.locator('#schedThisMonthBtn').click();
    assert.equal(await page.evaluate(() => calSelected), await page.evaluate(() => todayStr()));
    await page.locator('#calPrevBtn').click(); await page.locator('#schedThisMonthBtn').click();
    // All renderers count the same filtered source, including overflow and multi-day bands.
    const verifyCounts = async () => {
      const expected = await page.evaluate(() => ({ day: calEventsOn(calSelected).length, month: schedMonthEvents().length, original: events.length }));
      assert.equal(await page.locator('#calDayList .cal-day-item').count(), expected.day);
      const date = await page.evaluate(() => calSelected);
      const cell = page.locator(`.cal-cell[data-date="${date}"]`);
      assert.match(await cell.getAttribute('aria-label'), new RegExp(expected.day ? `일정 ${expected.day}개` : '일정 없음'));
      const shown = await cell.locator('.cal-chip[data-id]').count();
      if (expected.day > shown) assert.equal(await cell.locator('.cal-more').textContent(), `+${expected.day - shown}개`);
      else assert.equal(await cell.locator('.cal-more').count(), 0);
      assert.match(await page.locator('#schedMonthCount').textContent(), new RegExp(`일정 ${expected.month}개`));
      assert.equal(await page.locator(`#scheduleList [data-date="${date}"] .sched-open`).count(), expected.day);
      assert.equal(expected.original, 10);
    };
    await page.evaluate(() => { renderSchedule(); }); await verifyCounts();
    await eye('cat-work').click(); await verifyCounts();
    assert.equal(await page.locator('#calGrid .cal-chip[data-id=range]').count(), 0);
    assert.equal(await page.locator('#scheduleList .sched-open[data-id=range]').count(), 0);
    assert.equal(await eye('cat-work').getAttribute('aria-pressed'), 'false');
    assert.match(await eye('cat-work').getAttribute('aria-label'), /업무 일정 표시하기/);
    assert.equal(await page.locator('#scheduleCategoryEditBg').isVisible(), false);
    await eye('default').click(); await eye('cat-life').click(); await eye('cat-archive').click(); await verifyCounts();
    assert.match(await page.locator('#calDayList').textContent(), /선택한 범주/);
    assert.match(await page.locator('#scheduleEmpty').textContent(), /선택한 범주/);
    await page.locator('#scheduleCategoryList').evaluate(list => { list.scrollTop = 0; });
    await page.screenshot({ path: 'test-results/schedule-sidebar-filtered.png' });
    assert.equal(await page.evaluate(() => mockWrites.length), 0);
    // The raw data and home/share inputs are untouched by the schedule visibility setting.
    assert.equal(await page.evaluate(() => events.length), 10);
    assert.equal(await page.evaluate(async () => { const data = await shareCollect(todayStr()); return [...data.allDay, ...data.timed].filter(item => item.kind === 'event').length; }), 10, 'share image data ignores schedule filter');
    await back(); await main.locator('[data-page=home]').click();
    await page.waitForFunction(() => document.querySelectorAll('#homeCol3 [data-kind="event"]').length > 0);
    assert(await page.locator('#homeCol3').textContent().then(text => text.includes('업무')));
    await enter();
    await eye('cat-work').click(); await eye('default').click(); await eye('cat-life').click(); await eye('cat-archive').click();
    const collapsedWrites = await page.evaluate(() => mockWrites.length);
    await page.locator('#scheduleCategoryCollapse').click(); assert(!(await page.locator('#scheduleCategoryList').isVisible()));
    await page.locator('#scheduleCategoryCollapse').press('Space'); assert(await page.locator('#scheduleCategoryList').isVisible());
    assert.equal(await page.evaluate(() => mockWrites.length), collapsedWrites);

    // Keyboard/context menus, validation, failure retention, successful shared updates.
    await row('cat-work').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '범주 수정', exact: true }).click();
    await page.locator('#scheduleCategoryEditName').fill('기본');
    await page.locator('#scheduleCategoryEditSave').click(); assert.match(await page.locator('#scheduleCategoryEditError').textContent(), /기본/);
    assert.equal(await page.evaluate(() => mockWrites.length), 0);
    await page.locator('#scheduleCategoryEditName').fill('수정한 업무');
    await page.locator('#scheduleCategoryEditColor').fill('#cc8866');
    await page.evaluate(() => { failNextWrite = true; }); await page.locator('#scheduleCategoryEditSave').click();
    assert.match(await page.locator('#scheduleCategoryEditError').textContent(), /저장 실패/);
    assert.equal(await page.locator('#scheduleCategoryEditName').inputValue(), '수정한 업무');
    assert.equal(await page.locator('#scheduleCategoryEditColor').inputValue(), '#cc8866');
    await page.locator('#scheduleCategoryEditSave').click(); await page.locator('#scheduleCategoryEditBg').waitFor({ state: 'hidden' });
    assert.match(await row('cat-work').textContent(), /수정한 업무/);
    assert.equal(await page.evaluate(() => eventCategories.find(cat => cat.id === 'cat-work').color), '#cc8866');
    assert.equal(await page.locator('#settingsEventCatList .hs-cat-name-input[data-id=cat-work]').inputValue(), '수정한 업무');
    assert.equal(await page.locator('.schedule-cat-more:focus').count(), 1);
    await row('default').locator('.schedule-cat-more').focus(); await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: '범주 수정', exact: true }).click();
    assert.equal(await page.locator('#scheduleCategoryEditName').getAttribute('readonly'), '');
    await page.locator('#scheduleCategoryEditColor').fill('#88aa99'); await page.locator('#scheduleCategoryEditSave').click();
    await page.locator('#scheduleCategoryEditBg').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => daySettings.default_event_color), '#88aa99');
    await row('cat-archive').scrollIntoViewIfNeeded(); await row('cat-archive').click({ button: 'right' });
    assert.equal(await page.getByRole('menuitem', { name: '범주 수정', exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    await eye('cat-work').click();
    await page.evaluate(() => { bindAppSymbolUser('bob'); scheduleDataUser = 'bob'; renderScheduleCategories(); });
    assert.equal(await eye('cat-work').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => { bindAppSymbolUser('test'); scheduleDataUser = 'test'; renderScheduleCategories(); setScheduleSidebar(true); });
    assert.equal(await eye('cat-work').getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => { eventCategories.push({ id: 'new-cat', name: '새 범주', color: '#998877' }); scheduleHiddenCategories.add('deleted'); renderScheduleCategories(); });
    assert.equal(await eye('new-cat').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => scheduleHiddenCategories.has('deleted')), false);
    // Existing add/edit sheet remains the single source and retains input across the breakpoint.
    await page.locator('#calDayAddBtn').click(); await page.locator('#cev_title').fill('폭 변경 중인 일정');
    const selected = await page.evaluate(() => calSelected);
    await page.setViewportSize({ width: 760, height: 768 }); await page.setViewportSize({ width: 761, height: 768 });
    assert.equal(await page.locator('#cev_title').inputValue(), '폭 변경 중인 일정'); assert.equal(await page.evaluate(() => calSelected), selected);
    await page.evaluate(() => hideCalEventSheet());
    await page.evaluate(() => openEventEditor({ mode: 'edit', id: 'life' }));
    assert.equal(await page.locator('#cev_title').inputValue(), '생활 일정'); await page.evaluate(() => hideCalEventSheet());
    // Category editing also survives moving the shared list between the two surfaces.
    await page.evaluate(() => openScheduleCategoryEditor('cat-work', document.querySelector('[data-schedule-cat="cat-work"] .schedule-cat-more')));
    await page.locator('#scheduleCategoryEditName').fill('폭 변경 중 범주 입력');
    await page.setViewportSize({ width: 760, height: 768 }); await page.setViewportSize({ width: 761, height: 768 });
    assert.equal(await page.locator('#scheduleCategoryEditName').inputValue(), '폭 변경 중 범주 입력');
    await page.keyboard.press('Escape');
    assert.equal(await row('cat-work').locator('.schedule-cat-more:focus').count(), 1);
    const writesBeforeResize = await page.evaluate(() => mockWrites.length);
    for (const [width, height] of [[1366,768],[1440,900],[1440,320],[390,844],[760,768],[761,768]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.locator('.sidebar').isVisible(), width > 760);
      assert.equal(await page.locator('#scheduleModeToggle').isVisible(), width <= 760);
      assert.equal(await page.locator('.bottombar').isVisible(), width <= 760);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width > 760) {
        assert.equal((await page.locator('.sidebar').boundingBox()).width, 180);
        await row('cat-archive').scrollIntoViewIfNeeded();
        const bounds = await row('cat-long').evaluate(row => ({ width: row.clientWidth, scroll: row.scrollWidth }));
        assert(bounds.scroll <= bounds.width);
        if (height === 320) {
          const footer = await page.locator('.sidebar-footer').boundingBox();
          const category = await row('cat-archive').boundingBox();
          const nav = await side.boundingBox();
          assert(Math.min(category.y + category.height, nav.y + nav.height) <= footer.y, 'visible category scroller must not overlap account footer');
          assert(category.y < nav.y + nav.height && category.y + category.height > nav.y, 'archived category remains reachable in a short window');
          assert(footer.y + footer.height <= height);
        }
      } else {
        await page.locator('#scheduleCategoryMobileBtn').click();
        assert.equal(await eye('cat-work').getAttribute('aria-pressed'), 'false');
        await eye('cat-work').click(); await eye('cat-work').click();
        if (width === 390) await page.screenshot({ path: 'test-results/schedule-sidebar-mobile-filter.png' });
        await page.keyboard.press('Escape'); assert.equal(await page.locator('#scheduleCategoryMobileBtn:focus').count(), 1);
      }
      await page.screenshot({ path: `test-results/schedule-sidebar-${width}x${height}.png` });
    }
    assert.equal(await page.evaluate(() => mockWrites.length), writesBeforeResize);
    // Save through the existing calendar/list editor in the isolated database fixture.
    await page.evaluate(() => openEventEditor({ mode: 'edit', id: 'life' }));
    await page.locator('#cev_title').fill('생활 일정 수정'); await page.locator('#cev_save').click();
    await page.locator('#calEventSheetBg').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => events.find(event => event.id === 'life').title), '생활 일정 수정');
    await page.evaluate(() => showScheduleMode('list'));
    await page.locator('#schedAddBtn').click(); await page.locator('#cev_title').fill('목록에서 추가한 여러 날 일정');
    await page.locator('.cev-switch:has(#cev_multi)').click();
    await page.locator('#cev_end').fill(await page.evaluate(() => addDaysStr(todayStr(), 2)));
    await page.locator('#cev_save').click(); await page.locator('#calEventSheetBg').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => events.some(event => event.title === '목록에서 추가한 여러 날 일정' && event.end_date === addDaysStr(todayStr(), 2))), true);
    await page.evaluate(() => showScheduleMode('calendar'));
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const theme of ['white', 'black', 'cheese']) {
      await page.evaluate(theme => applyTheme(theme), theme);
      await page.locator('#scheduleCategoryList').evaluate(list => { list.scrollTop = 0; });
      await page.screenshot({ path: `test-results/schedule-sidebar-${theme}.png` });
    }
    // Reload reads the same user's local filter before the category data is loaded.
    await page.addInitScript(() => { mockRows.tok_event_categories = [{ id: 'cat-work', name: '업무', color: '#7194cc' }]; });
    await page.reload(); await page.waitForFunction(() => scheduleDataUser === 'test');
    assert.equal(await page.evaluate(() => scheduleHiddenCategories.has('cat-work')), true);
    assert.deepEqual(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(node => node.id); return ids.filter((id, i) => ids.indexOf(id) !== i); }), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    console.log('PASS: menu order, independent sidebar/back, calendar/list/counts/bands/default/archived filters, isolated data, shared category saves and failure retention, account settings, keyboard/focus, six viewports, three themes, no navigation writes/duplicate IDs/new page errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
