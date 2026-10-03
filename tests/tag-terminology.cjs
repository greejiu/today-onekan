// Existing intercepted fixture: never read or write production data.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture } = require('./home-layout.cjs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, timezoneId: 'Asia/Seoul' });
    const errors = [], alerts = [], consoleErrors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(message.text())) consoleErrors.push(message.text()); });
    page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
    await fixture(page);
    await page.evaluate(() => {
      mockRows.tok_habit_categories[0].name = '집안일';
      mockRows.tok_habit_categories[1].name = '건강';
      mockRows.tok_todos[0].tag_id = 'g0';
      mockRows.tok_habits[0].category_id = 'g0';
      return loadAll();
    });
    fs.mkdirSync('test-results', { recursive: true });
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => showPage('settings'));
      assert(await page.locator('.section-label').allTextContents().then(labels => labels.some(text => text.startsWith('태그 '))));
      assert.equal(await page.locator('#settingsTagName').evaluate(input => input.parentElement.querySelector('label').textContent), '새 태그');
      assert.equal(await page.locator('#settingsTagList .hs-cat-default-color-input').getAttribute('aria-label'), '태그 기본 색상');
      assert.equal(await page.locator('#settingsEventCatList .hs-cat-default-color-input').getAttribute('aria-label'), '범주 기본 색상');
      assert.match(await page.locator('#settingsTagList .hs-cat-default-note').textContent(), /태그를 정하지 않은 항목/);
      await page.screenshot({ path: `test-results/tag-settings-${width}.png` });
      await page.evaluate(() => openTodoSheet(todos.find(item => item.id === 't0')));
      assert.equal(await page.locator('label[for=td_tag]').textContent(), '태그');
      assert.equal(await page.locator('#td_tag').inputValue(), 'g0');
      await page.locator('#td_tag').selectOption('g1'); await page.locator('#todoSaveBtn').click();
      await page.waitForFunction(() => mockRows.tok_todos[0].tag_id === 'g1');
      await page.evaluate(() => openTodoSheet(todos.find(item => item.id === 't0')));
      assert.equal(await page.locator('#td_tag').inputValue(), 'g1'); await page.evaluate(() => closeTodoSheet());
      await page.evaluate(() => openHabitAddSheet());
      assert.equal(await page.locator('label[for=ha_category]').textContent(), '태그'); await page.evaluate(() => closeHabitAddSheet());
      await page.evaluate(() => openHabitSheet(tasks[0]));
      assert.equal(await page.locator('#hs_category').evaluate(input => input.parentElement.querySelector('label').textContent), '태그');
      assert.equal(await page.locator('.hs-cat-manage-label').textContent(), '태그 관리 (이름 수정 · 삭제)');
      assert.equal(await page.locator('#hs_category').inputValue(), 'g0'); await page.evaluate(() => closeHabitSheet());
      await page.evaluate(() => openSomedaySheet('s0'));
      assert.equal(await page.locator('label[for=sd_tag]').textContent(), '태그');
      await page.locator('#sd_tag').selectOption('g1'); await page.locator('#sd_save').click();
      await page.waitForFunction(() => mockRows.tok_someday[0].tag_id === 'g1');
      await page.evaluate(() => showPage('habits'));
      const sorting = await page.locator('#habitSortSelect').textContent(), grouping = await page.locator('#habitGroupSelect').textContent();
      assert.match(sorting, /태그순/); assert.match(grouping, /그룹화: 안 함/); assert.match(grouping, /태그별/); assert(!grouping.includes('그룹별'));
      assert.match(await page.locator('#todoList .settingsbtn').first().getAttribute('aria-label'), /반복·태그 설정/);
      for (const [kind, id] of [['todo','t0'], ['habit','h1'], ['someday','s0']]) {
        if (kind === 'habit') {
          await page.evaluate(({ kind, id }) => openItemMenu({ kind, id, x: 30, y: 160 }), { kind, id });
          await page.getByRole('menuitem', { name: '태그 변경', exact: true }).click();
          await page.getByRole('menuitemradio', { name: '건강', exact: true }).click();
          await page.waitForFunction(() => mockRows.tok_habits[0].category_id === 'g1');
        }
        await page.evaluate(({ kind, id }) => openItemMenu({ kind, id, x: 30, y: 160 }), { kind, id });
        assert.equal(await page.getByRole('menuitem', { name: '태그 변경', exact: true }).count(), 1);
        await page.getByRole('menuitem', { name: '태그 변경', exact: true }).click();
        await page.getByRole('menuitemradio', { name: '집안일', exact: true }).click();
        await page.waitForFunction(({ kind, id }) => {
          const table = kind === 'todo' ? 'tok_todos' : kind === 'habit' ? 'tok_habits' : 'tok_someday';
          return mockRows[table].find(item => item.id === id)[kind === 'habit' ? 'category_id' : 'tag_id'] === 'g0';
        }, { kind, id });
      }
      await page.evaluate(() => { renderSchedule(); showScheduleMode('list'); });
      assert.equal(await page.locator('#scheduleModeListBtn').textContent(), '목록');
      assert.equal(await page.locator('#scheduleModeCalendarBtn').textContent(), '달력');
      await page.evaluate(() => openEventEditor({ mode: 'add' }));
      assert.match(await page.locator('#calEventSheetBg').textContent(), /범주/); await page.evaluate(() => hideCalEventSheet());
    }
    await page.setViewportSize({ width: 1366, height: 900 }); await page.evaluate(() => showPage('settings'));
    const before = await page.evaluate(() => ({ count: habitCategories.length, links: [todos[0].tag_id, tasks[0].category_id, somedayItems[0].tag_id] }));
    const name = page.locator('#settingsTagList .hs-cat-name-input[data-id=g0]');
    await name.fill('집안 정리'); await name.press('Enter');
    await page.waitForFunction(() => mockRows.tok_habit_categories[0].name === '집안 정리');
    await page.locator('#settingsTagList .hs-cat-color-input[data-id=g0]').evaluate(input => { input.value = '#123456'; input.dispatchEvent(new Event('change')); });
    await page.waitForFunction(() => mockRows.tok_habit_categories[0].color === '#123456');
    await name.fill('기본'); await name.press('Enter'); assert.match(alerts.at(-1), /태그를/); assert(!alerts.at(-1).includes('태그을'));
    await page.locator('#settingsTagList .hs-cat-archive[data-id=g0]').click();
    await page.waitForFunction(() => mockRows.tok_habit_categories[0].is_archived === true);
    assert.match(await page.locator('#settingsTagList [data-catview=archived]').textContent(), /보관됨 1/);
    await page.locator('#settingsTagList [data-catview=archived]').click();
    await page.locator('#settingsTagList .hs-cat-purge[data-id=g0]').click();
    assert.match(await page.locator('#confirm_title').textContent(), /태그를 완전히 삭제할까요/);
    assert.match(await page.locator('#confirm_msg').textContent(), /이 태그를 쓰던/); await page.locator('#confirm_cancel').click();
    await page.locator('#settingsTagList .hs-cat-unarchive[data-id=g0]').click();
    await page.waitForFunction(() => mockRows.tok_habit_categories[0].is_archived === false);
    assert.deepEqual(await page.evaluate(() => ({ count: habitCategories.length, links: [todos[0].tag_id, tasks[0].category_id, somedayItems[0].tag_id] })), before);
    assert.equal(await page.evaluate(() => habitCategories.find(cat => cat.id === 'g0').color), '#123456');
    // The literal word in a user's saved name is not an application label and remains intact.
    assert.equal(await page.evaluate(() => habitCategories.find(cat => cat.id === 'g2').name), '그룹 2');
    const writes = await page.evaluate(() => mockWrites);
    assert(writes.every(write => ['tok_todos','tok_habits','tok_someday','tok_habit_categories'].includes(write.table)));
    assert(writes.some(write => write.table === 'tok_habits' && write.values.category_id === 'g0'));
    assert(writes.some(write => write.table === 'tok_someday' && write.values.tag_id === 'g0'));
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    console.log('PASS: desktop/mobile tag labels, input fields, menus, sorting/grouping, schedule terms, tag save/selection/name/color/archive/restore, natural particles and confirm dialogs, original identifiers/links/user names, no page errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
