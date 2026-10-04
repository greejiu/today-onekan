const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {fixture} = require('./period-fixture.cjs');

(async () => {
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page = await browser.newPage({timezoneId:'Asia/Seoul'});
  const alerts = [], errors = [];
  page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
  page.on('pageerror', error => errors.push(error.message));
  try {
    await fixture(page);
    await page.evaluate(async () => {
      const yesterday = addDaysStr(todayStr(), -1);
      mockRows.tok_todos = [{id:'past',title:'지난 할일',is_done:false,project_id:'project',tag_id:'category',group_id:'group',end_date:yesterday,
        ...OnekanPeriod.patch('todo',{allDay:true,startDate:yesterday,endDate:yesterday})}];
      // The real database retains tok_todos_date_order. The usual UI fixture
      // accepts every patch and would miss a stale legacy end_date.
      const from = sb.from.bind(sb);
      sb.from = table => {
        const query = from(table);
        return new Proxy(query,{get(target,key) {
          if(table === 'tok_todos' && key === 'update') return patch => {
            const result = target.update(patch);
            return new Proxy(result,{get(q,method) {
              if(method === 'eq') return (column,id) => {
                const row = mockRows.tok_todos.find(t => t[column] === id);
                const after = {...row,...patch};
                if(after.end_date && after.start_date && after.end_date < after.start_date)
                  return {select(){return this;},then(resolve){return Promise.resolve(resolve({data:null,error:{message:'tok_todos_date_order'}}));}};
                return q.eq(column,id);
              };
              return q[method];
            }});
          };
          return target[key];
        }});
      };
      await loadAll();showPage('home');homeAgendaDate=todayStr();renderLeftoverTodos();
    });
    await page.click('#homeLeftoverToggle');
    await page.click('.leftover-today[data-id="past"]');
    await page.waitForFunction(() => !leftoverBusy.has('past'));
    assert.deepEqual(alerts, [], 'today move must satisfy the database date constraint');
    let row = await page.evaluate(() => mockRows.tok_todos[0]);
    const today = await page.evaluate(() => todayStr());
    assert.equal(row.start_date,today);assert.equal(row.end_date,today);assert.equal(row.occurrence_end_date,today);
    assert.equal(await page.locator('.leftover-today[data-id="past"]').count(),0);
    await page.evaluate(() => moveItemToZone('todo','past',{zone:'planday',date:addDaysStr(todayStr(),4)}));
    row = await page.evaluate(() => mockRows.tok_todos[0]);
    assert.equal(row.start_date,row.end_date);assert.equal(row.start_date,row.occurrence_end_date);
    assert.equal(row.project_id,'project');assert.equal(row.tag_id,'category');assert.equal(row.group_id,'group');assert.equal(row.is_done,false);
    await page.evaluate(() => openItemDateSheet('todo','past'));
    await page.locator('#idt_date').fill(today);
    await page.click('#idt_save');
    await page.waitForFunction(() => !document.getElementById('itemDateSheetBg').classList.contains('open'));
    assert.equal(await page.evaluate(() => mockRows.tok_todos[0].start_date),today);
    // Repeating todos retain the independent repeat boundary; legacy timed rows
    // retain absent endpoint fields instead of acquiring fabricated times.
    const patches = await page.evaluate(() => {
      const period={allDay:false,startDate:'2026-10-01',endDate:'2026-10-03',startTime:'23:00',endTime:'01:00'};
      const row={...OnekanPeriod.patch('todo',period),end_date:'2026-10-03'};
      return {timed:OnekanPeriod.shift('todo',row,'2026-10-06'),repeat:OnekanPeriod.shift('todo',{...row,repeat_unit:'day',end_date:'2026-10-31'},'2026-10-06'),legacy:OnekanPeriod.shift('todo',{start_date:'2026-10-01',end_date:'2026-10-03',todo_time:'09:00'},'2026-10-06')};
    });
    assert.equal(patches.timed.end_date,'2026-10-08');assert.equal(patches.timed.duration_minutes,1560);
    assert.equal(patches.repeat.end_date,undefined);assert.equal(patches.repeat.occurrence_end_date,'2026-10-08');
    assert.equal(patches.legacy.end_date,'2026-10-08');assert.equal(patches.legacy.end_time,undefined);
    assert.deepEqual(alerts,[]);assert.deepEqual(errors,[]);
    console.log('past todo today button / cross-date move / date sheet / endpoints + connections + repeat boundary PASS');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
