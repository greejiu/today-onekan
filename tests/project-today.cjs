// 프로젝트 상세 '오늘하기' + 지금 한칸·할일 탭 프로젝트명 표시 — 가짜 Supabase(home-layout.cjs fixture)로만 실행.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture } = require('./home-layout.cjs');

const LONG_PROJECT = '아주 긴 프로젝트 이름으로 모바일 줄바꿈과 말줄임을 확인하는 포트폴리오 작업';
const LONG_TITLE = '표지 문구를 여러 버전으로 써 보고 가장 마음에 드는 문장 하나를 골라 정리하기까지 아주 긴 할일 제목';

async function seed(page) {
  await page.evaluate(({ LONG_PROJECT, LONG_TITLE }) => {
    const date = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    mockRows.tok_projects = [{ id: 'p1', name: '포트폴리오', parent_id: null, sort_order: 0 }, { id: 'p2', name: LONG_PROJECT, parent_id: null, sort_order: 1 }];
    mockRows.tok_identities = [];
    mockRows.tok_todos = [
      { id: 'pf', title: '표지 문구 쓰기', is_done: false, start_date: date(3), todo_time: '10:00:00', duration_minutes: 45, project_id: 'p1', tag_id: 'g1' },
      { id: 'pn', title: '날짜 없는 할일', is_done: false, start_date: null, todo_time: null, project_id: 'p1' },
      { id: 'pt', title: '오늘 이미 할 일', is_done: false, start_date: date(0), todo_time: null, project_id: 'p1' },
      { id: 'pr', title: '반복 할일', is_done: false, start_date: date(2), todo_time: null, project_id: 'p1', repeat_unit: 'day', repeat_interval: 1 },
      { id: 'pd', title: '끝낸 할일', is_done: true, start_date: date(-2), completed_date: date(-2), todo_time: null, project_id: 'p1' },
      { id: 'pl', title: LONG_TITLE, is_done: false, start_date: date(0), todo_time: null, project_id: 'p2', tag_id: 'g2' },
      { id: 'pdone', title: '오늘 끝낸 프로젝트 할일', is_done: true, start_date: date(0), completed_date: date(0), todo_time: null, project_id: 'p1' },
      { id: 'plain', title: '프로젝트 없는 할일', is_done: false, start_date: date(0), todo_time: null },
    ];
    mockRows.tok_habits = [{ id: 'h1', name: '프로젝트 습관', is_active: true, start_date: date(-1), start_minute: null, repeat_unit: 'day', repeat_interval: 1, project_id: 'p1' }];
  }, { LONG_PROJECT, LONG_TITLE });
  await page.evaluate(() => loadAll());
}
const row = (page, id) => page.locator(`#projectDetail .proj-row[data-id="${id}"]`);
const openProject = async (page, id) => { await page.evaluate(id => { showPage('work'); workSelectedId = id; renderWork(); }, id); };
const todoRow = (page, id) => page.evaluate(id => ({ ...mockRows.tok_todos.find(t => t.id === id) }), id);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const errors = [];
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', e => errors.push(e.message));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await fixture(page);
    await seed(page);
    const today = await page.evaluate(() => todayStr());

    // 1) 프로젝트 상세: 버튼/상태 표시 범위
    await openProject(page, 'p1');
    assert.equal(await row(page, 'pf').locator('.proj-today').textContent(), '오늘하기');
    assert.equal(await row(page, 'pn').locator('.proj-today').count(), 1);
    assert.equal(await row(page, 'pt').locator('.proj-today').count(), 0);
    assert.equal(await row(page, 'pt').locator('.proj-today-state').textContent(), '오늘 예정');
    assert.equal(await row(page, 'pr').locator('.proj-today, .proj-today-state').count(), 0, 'repeat todo excluded');
    assert.equal(await page.locator('#projectDetail .proj-row[data-id="pd"] .proj-today, #projectDetail .proj-row[data-id="pd"] .proj-today-state').count(), 0, 'done excluded');
    assert.equal(await page.locator('#projectDetail .proj-row[data-kind="habit"] .proj-today').count(), 0, 'habit excluded');
    assert.equal(await page.locator('#projectDetail .title-proj').count(), 0, 'no project prefix inside project detail');
    console.log(width, 'project detail buttons PASS');

    // 2) 미래 날짜 + 시간 있는 할일 → 오늘하기 → 같은 행만 바뀜(복제 없음, 프로젝트 연결 유지) → 실행 취소로 원래 날짜·시간
    const before = await todoRow(page, 'pf');
    const countBefore = await page.evaluate(() => mockRows.tok_todos.length);
    await row(page, 'pf').locator('.proj-today').click();
    await page.locator('#appToast.show', { hasText: '오늘 할 일에 담았어요' }).waitFor();
    let after = await todoRow(page, 'pf');
    assert.equal(after.start_date, today); assert.equal(after.todo_time, before.todo_time); assert.equal(after.project_id, 'p1');
    assert.equal(after.duration_minutes, 45); assert.equal(after.tag_id, 'g1');
    assert.equal(await page.evaluate(() => mockRows.tok_todos.length), countBefore, 'no duplicate row');
    assert.equal(await page.evaluate(() => mockWrites.filter(w => w.op === 'insert').length), 0);
    assert.equal(await row(page, 'pf').locator('.proj-today-state').textContent(), '오늘 예정');
    // 집·할일 탭 반영 — 실제 시각을 유지해 시간 목록에 한 번만
    assert.equal(await page.locator('#agendaAllDayList [data-kind][data-id="pf"]').count(), 0);
    assert.equal(await page.locator('#homeTodayBlockAllDay [data-kind][data-id="pf"]').count(), 0);
    assert.equal(await page.locator('#agendaTimeWrap [data-kind][data-id="pf"]').count(), 1);
    assert.equal(await page.locator('#todoUnifiedList .sv-card[data-id="pf"]').count(), 1);
    if (width < 500) await page.screenshot({ path: `test-results/project-today-toast-${width}.png` });
    await page.locator('#appToast .toast-action').click();
    await page.locator('#appToast.show', { hasText: '원래 일정으로 되돌렸어요' }).waitFor();
    after = await todoRow(page, 'pf');
    assert.equal(after.start_date, before.start_date); assert.equal(after.todo_time, before.todo_time); assert.equal(after.project_id, 'p1');
    assert.equal(await page.locator('#agendaAllDayList [data-kind][data-id="pf"]').count(), 0);
    assert.equal(await row(page, 'pf').locator('.proj-today').textContent(), '오늘하기');
    console.log(width, 'future todo → today → undo PASS');

    // 3) 날짜 없는 할일 → 오늘 → 실행 취소하면 다시 날짜 없음
    await row(page, 'pn').locator('.proj-today').click();
    await page.locator('#appToast.show', { hasText: '오늘 할 일에 담았어요' }).waitFor();
    assert.equal((await todoRow(page, 'pn')).start_date, today);
    assert.equal(await page.locator('#agendaAllDayList [data-kind][data-id="pn"]').count(), 1);
    await page.locator('#appToast .toast-action').click();
    await page.locator('#appToast.show', { hasText: '원래 일정으로 되돌렸어요' }).waitFor();
    assert.equal((await todoRow(page, 'pn')).start_date, null);
    console.log(width, 'date-less todo → today → undo PASS');

    // 4) 저장 실패 → 성공 안내 없음, 날짜 그대로, 버튼 원상 복구
    await page.evaluate(() => {
      window.__origFrom = sb.from;
      sb.from = (t) => {
        if (t !== 'tok_todos') return window.__origFrom.call(sb, t);
        const q = new Proxy({}, { get(_, k) { if (k === 'then') return r => r({ data: null, error: { message: '테스트 네트워크 오류' } }); return () => q; } });
        return q;
      };
      document.getElementById('appToast')?.classList.remove('show');
    });
    await row(page, 'pf').locator('.proj-today').click();
    await page.waitForFunction(() => !document.querySelector('#projectDetail .proj-row[data-id="pf"] .proj-today')?.disabled);
    await page.evaluate(() => { sb.from = window.__origFrom; });
    assert(dialogs.some(m => m.includes('테스트 네트워크 오류')));
    assert.equal(await page.locator('#appToast.show').count(), 0, 'no success toast on failure');
    assert.equal((await todoRow(page, 'pf')).start_date, before.start_date);
    assert.equal(await row(page, 'pf').locator('.proj-today').textContent(), '오늘하기');
    console.log(width, 'save failure restores PASS');

    // 5) 표시: 지금 한칸·할일 탭 "프로젝트명 - 할일명", 습관·프로젝트 없는 할일은 그대로
    await page.evaluate(() => showPage('home'));
    const ptTitle = page.locator('#homeTodayBlockAllDay .home-today-row[data-id="pt"] .agenda-title');
    assert.equal(await ptTitle.textContent(), '포트폴리오 - 오늘 이미 할 일');
    assert.equal(await page.locator('#agendaAllDayList [data-kind][data-id="pt"] .agenda-title').textContent(), '포트폴리오 - 오늘 이미 할 일');
    assert.equal(await page.locator('#homeTodayBlockAllDay [data-kind][data-id="plain"] .agenda-title').textContent(), '프로젝트 없는 할일');
    assert.equal(await page.locator('#homeTodayBlockAllDay [data-kind][data-id="h1"] .agenda-title').textContent(), '프로젝트 습관');
    assert.equal(await page.locator('#todoUnifiedList .sv-card[data-id="pt"] .sv-open strong').textContent(), '오늘 이미 할 일');
    assert.match(await page.locator('#todoUnifiedList .sv-card[data-id="pt"] .sv-open').textContent(), /포트폴리오/);
    assert.equal(await page.locator('#todoUnifiedList .sv-card[data-id="plain"] .sv-open strong').textContent(), '프로젝트 없는 할일');
    // 완료: 프로젝트명까지 흐린 글자 + 취소선
    const doneStyle = await page.locator('#homeTodayBlockAllDay [data-kind][data-id="pdone"] .title-proj').evaluate(e => { const t = e.closest('.agenda-title'); return { deco: getComputedStyle(t).textDecorationLine, color: getComputedStyle(t).color, sub: getComputedStyle(document.body).getPropertyValue('--sub') }; });
    assert.match(doneStyle.deco, /line-through/);
    // 시간 있는 할일(타임라인)에도 프로젝트명
    await page.evaluate(() => { const t = mockRows.tok_todos.find(x => x.id === 'pf'); t.start_date = todayStr(); t.todo_time = '10:00:00'; return loadAll(); });
    assert.equal(await page.locator('#agendaTimeWrap .ag-tl-task[data-id="pf"] .ag-tl-title').textContent(), '포트폴리오 - 표지 문구 쓰기');
    console.log(width, 'project prefix display / habit & plain unchanged / done style PASS');

    // 6) 이름 인라인 수정은 원본 제목만(프로젝트명을 제목에 저장하지 않음)
    await page.evaluate(() => { const r = document.querySelector('#homeTodayBlockAllDay .home-today-row[data-id="pt"]'); startAgendaItemInlineEdit(r, 'pt', 'todo', renderHomeTodayBlock); });
    assert.equal(await page.locator('#homeTodayBlockAllDay .inline-add-input').inputValue(), '오늘 이미 할 일');
    await page.locator('#homeTodayBlockAllDay .inline-add-input').press('Escape');
    assert.equal(await page.evaluate(() => mockWrites.filter(w => w.op === 'update' && 'title' in (w.values || {})).length), 0);
    console.log(width, 'inline rename keeps raw title PASS');

    // 7) 프로젝트 이름 변경 → 표시 반영
    await page.evaluate(() => { mockRows.tok_projects[0].name = '포트폴리오 2차'; return loadAll(); });
    assert.equal(await ptTitle.textContent(), '포트폴리오 2차 - 오늘 이미 할 일');
    assert.equal(await page.locator('#todoUnifiedList .sv-card[data-id="pt"] .sv-open strong').textContent(), '오늘 이미 할 일');
    assert.match(await page.locator('#todoUnifiedList .sv-card[data-id="pt"] .sv-open').textContent(), /포트폴리오 2차/);
    console.log(width, 'project rename reflected PASS');

    // 8) 긴 제목: 체크박스·⋯·버튼이 줄 밖으로 밀리지 않고 가로 넘침 없음
    const fits = async (sel, parts) => page.locator(sel).first().evaluate((r, parts) => {
      const rb = r.getBoundingClientRect();
      return parts.map(p => { const e = r.querySelector(p); if (!e) return [p, 'missing']; const b = e.getBoundingClientRect(); return [p, b.width > 0 && b.left >= rb.left - 1 && b.right <= rb.right + 1]; });
    }, parts);
    await page.evaluate(() => showPage('home'));
    for (const [p, ok] of await fits('#agendaAllDayList [data-kind][data-id="pl"]', ['input[type=checkbox]', '.agenda-title', '.item-more'])) assert.equal(ok, true, 'home timeline long ' + p);
    await page.locator('[data-col2tab="block"]').click();
    for (const [p, ok] of await fits('#homeTodayBlockAllDay .home-today-row[data-id="pl"]', ['input[type=checkbox]', '.agenda-title', '.item-more'])) assert.equal(ok, true, 'home block long ' + p);
    await page.locator('#homeTodayBlockAllDay .home-today-row[data-id="pl"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/project-home-block-${width}.png` });
    await page.locator('[data-col2tab="timeline"]').click();
    await page.evaluate(() => showPage('todos'));
    for (const [p, ok] of await fits('#todoUnifiedList .sv-card[data-id="pl"]', ['input[type=checkbox]', '.sv-open', '.item-more'])) assert.equal(ok, true, 'todos long ' + p);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#todoUnifiedList .sv-card[data-id="pl"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/project-todos-tab-${width}.png` });
    await openProject(page, 'p2');
    for (const [p, ok] of await fits('#projectDetail .proj-row[data-id="pl"]', ['input[type=checkbox]', '.proj-row-title', '.proj-today-state', '.proj-unlink'])) assert.equal(ok, true, 'detail long ' + p);
    assert.equal(await page.locator('#projectDetail .proj-row[data-id="pl"] .proj-row-title').textContent(), await page.evaluate(() => mockRows.tok_todos.find(t => t.id === 'pl').title), 'detail shows full title');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/project-detail-${width}.png`, fullPage: true });
    await openProject(page, 'p1');
    await page.screenshot({ path: `test-results/project-detail-p1-${width}.png`, fullPage: true });
    await page.evaluate(() => { showPage('home'); scrollTo(0, 0); });
    await page.screenshot({ path: `test-results/project-home-${width}.png` });
    console.log(width, 'long title layout PASS');
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('no JavaScript errors PASS');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
