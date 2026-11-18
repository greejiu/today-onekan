// 2026-11-17 오늘한칸 v3 월간 화면 검증: 하루 3줄 = 오전·오후·저녁(결의 월간 노트). 빈 줄 = 빈 시간.
// 가짜 시계: 2026-11-17(화) 10:20 Asia/Seoul. 2026년 11월 1일 = 일요일 → 5주(11/1~12/5).
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-results/v3-month');
const ok = m => console.log('PASS ' + m);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
function serve() {
  const srv = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
async function drag(p, from, to) {
  await p.mouse.move(from.x, from.y); await p.mouse.down();
  await p.mouse.move(from.x + 2, from.y + 6, { steps: 2 }); await p.mouse.move(to.x, to.y, { steps: 8 });
  await p.mouse.up(); await p.waitForTimeout(80);
}
const mid = async loc => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); return { x: b.x + Math.min(50, b.width / 2), y: b.y + b.height / 2 }; };
const lines = (p, d) => p.locator(`.mc[data-pick="${d}"] .mc-line`).evaluateAll(els => els.map(e => e.classList.contains('is-empty') ? '·' : e.querySelector('.mc-text').textContent.trim() + (e.querySelector('.mc-n')?.textContent || '')));
const planOf = (p, title) => p.evaluate(t => { const x = bj.state.plans.find(y => bj.task(y.taskId)?.title === t && y.status !== 'migrated'); return x && { period: x.period, start: x.start, slot: x.slot }; }, title);

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/v3/`;
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
    await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.clock.install({ time: new Date('2026-11-17T10:20:00+09:00') });
    await p.goto(base + '#month');
    // 결의 11월 노트처럼
    await p.evaluate(() => {
      const A = n => bj.areas().find(a => a.name === n).id;
      ['2026-11-16', '2026-11-17'].forEach(d => bj.addPlan({ title: '출근', period: d, start: 540, duration: 540, areaId: A('일') }));
      bj.addPlan({ title: '병원', period: '2026-11-13', slot: 'pm', areaId: A('생활') });
      bj.addPlan({ title: '수지랑 곱창', period: '2026-11-12', slot: 'eve', areaId: A('여가') });
      bj.addPlan({ title: '상담', period: '2026-11-18', start: 870, duration: 60 });
      bj.addPlan({ title: '롯데리아 면담', period: '2026-11-19', start: 720, duration: 60, areaId: A('일') });
      bj.addPlan({ title: '책 반납', period: '2026-11-20' });
    });

    // 1. 달력: 제목, 5주(일요일 시작), 오늘·고른 날, 탭
    assert.equal(await p.locator('#moTitle').textContent(), '2026년 11월');
    assert.equal(await p.locator('.mc').count(), 35);
    assert.equal(await p.locator('.mc').first().getAttribute('data-pick'), '2026-11-01');
    assert.equal(await p.locator('.mc').last().getAttribute('data-pick'), '2026-12-05');
    assert.equal(await p.locator('.mc.is-other').count(), 5);
    assert.equal(await p.locator('.mc.is-today').getAttribute('data-pick'), '2026-11-17');
    assert.equal(await p.locator('.tabs a[aria-current=page]').textContent(), '월간');
    assert.equal(await p.locator('#todayBtn').textContent(), '이번 달');
    ok('월간: 2026년 11월, 일요일 시작 5주(35칸, 다른 달 5칸), 오늘 표시, [월간] 탭');

    // 2. 하루 3줄: 시간 있는 계획은 시간으로, 시간 없는 계획은 고른 구간, 빈 줄은 ·
    assert.deepEqual(await lines(p, '2026-11-16'), ['• 출근', '• 출근', '·']); // 09~18시 = 오전·오후 둘 다
    assert.deepEqual(await lines(p, '2026-11-13'), ['·', '• 병원', '·']);
    assert.deepEqual(await lines(p, '2026-11-12'), ['·', '·', '• 수지랑 곱창']);
    assert.deepEqual(await lines(p, '2026-11-18'), ['·', '• 상담', '·']);
    assert.deepEqual(await lines(p, '2026-11-19'), ['·', '• 롯데리아 면담', '·']); // 12:00 = 오후
    assert.deepEqual(await lines(p, '2026-11-21'), ['·', '·', '·']);
    assert.equal(await p.locator('.mc[data-pick="2026-11-20"] .mc-more').textContent(), '+1');
    assert.match(await p.locator('.mc[data-pick="2026-11-18"]').getAttribute('aria-label'), /오전 비어 있음, 오후 상담, 저녁 비어 있음/);
    ok('하루 3줄: 09~18시 출근 → 오전·오후 둘 다, 14:30·12:00 → 오후, 고른 구간 그대로, 빈 줄 "·", 구간 없는 계획은 +1');

    // 3. 같은 구간에 둘이면 +1
    await p.evaluate(() => bj.addPlan({ title: '은행', period: '2026-11-13', slot: 'pm' }));
    assert.deepEqual(await lines(p, '2026-11-13'), ['·', '• 병원+1', '·']);
    ok('같은 구간에 두 개 → 첫 계획 + "+1"');

    // 4. 칸 누르기 → 고른 날 자세히(3구간)
    await p.locator('.mc[data-pick="2026-11-13"]').click();
    assert.equal(await p.locator('.mc.is-sel').getAttribute('data-pick'), '2026-11-13');
    assert.match(await p.locator('#moDetail .zone-head').textContent(), /11월 13일 \(금\)/);
    const slotTitles = k => p.locator(`#moDetail [data-drop-slot="${k}"] .row-title`).allTextContents();
    assert.deepEqual(await slotTitles('am'), []);
    assert.deepEqual(await slotTitles('pm'), ['병원', '은행']);
    ok('칸 누르기 → 오른쪽에 그날 오전·오후·저녁');

    // 5. 구간에 바로 적기
    await p.locator('#moDetail [data-add-slot="am"] input').fill('#그림 크로키');
    await p.keyboard.press('Enter');
    assert.deepEqual(await planOf(p, '크로키'), { period: '2026-11-13', start: null, slot: 'am' });
    assert.deepEqual(await lines(p, '2026-11-13'), ['• 크로키', '• 병원+1', '·']);
    assert.equal(await p.evaluate(() => document.activeElement?.closest('[data-add-slot]')?.dataset.addSlot), 'am');
    ok('오전에 적기 → 오전 구간 계획, 입력칸 그대로(이어 적기)');

    // 6. 메뉴로 구간 바꾸기
    await p.locator('#moDetail .row', { hasText: '은행' }).locator('.more').click();
    await p.locator('#menu [data-slot="eve"]').click();
    assert.equal((await planOf(p, '은행')).slot, 'eve');
    assert.deepEqual(await lines(p, '2026-11-13'), ['• 크로키', '• 병원', '• 은행']);
    ok('⋯ 메뉴 구간: 오후 → 저녁');

    // 7. 끌기: 자세히의 줄 → 다른 구간(시간 있으면 빼고), → 달력의 다른 날짜(구간 유지)
    await drag(p, await mid(p.locator('#moDetail .row', { hasText: '크로키' })), await mid(p.locator('#moDetail [data-drop-slot="pm"] h3')));
    assert.equal((await planOf(p, '크로키')).slot, 'pm');
    await drag(p, await mid(p.locator('#moDetail .row', { hasText: '크로키' })), await mid(p.locator('.mc[data-pick="2026-11-21"] .mc-num')));
    assert.deepEqual(await planOf(p, '크로키'), { period: '2026-11-21', start: null, slot: 'pm' });
    assert.deepEqual(await lines(p, '2026-11-21'), ['·', '• 크로키', '·']);
    assert.equal(await p.locator('.mc.is-sel').getAttribute('data-pick'), '2026-11-13');
    await p.locator('.mc[data-pick="2026-11-18"]').click();
    await drag(p, await mid(p.locator('#moDetail .row', { hasText: '상담' })), await mid(p.locator('#moDetail [data-drop-slot="eve"] h3')));
    assert.deepEqual(await planOf(p, '상담'), { period: '2026-11-18', start: null, slot: 'eve' });
    assert.match(await p.locator('#toast').textContent(), /저녁으로 옮겼어요 \(시간은 뺐어요\)/);
    ok('끌기: 오전 → 오후, 13일 → 21일(구간 유지), 14:30 상담 → 저녁(시간 빼고 안내)');

    // 8. 시간을 빼도 구간은 남음, 오늘 화면 시간 없음 목록에 구간 표시
    await p.evaluate(() => { const x = bj.state.plans.find(y => bj.task(y.taskId)?.title === '롯데리아 면담'); bj.setPlanTime(x.id, null); });
    assert.equal((await planOf(p, '롯데리아 면담')).slot, 'pm');
    await p.locator('.mc[data-pick="2026-11-13"]').click();
    await p.locator('#moDetail [data-goto]').click();
    await p.waitForFunction(() => location.hash === '#today');
    assert.equal(await p.locator('#dayTitle').textContent(), '11월 13일 (금)');
    assert.deepEqual(await p.locator('#untimedList .row-slot').allTextContents(), ['오후', '저녁']);
    ok('시간 빼기 → 구간(오후) 남김, [이 날 열기] → 오늘 화면, 시간 없음 줄에 구간 표시');

    // 9. 달 넘기기
    await p.locator('.tabs a', { hasText: '월간' }).click();
    await p.locator('#nextDay').click();
    assert.equal(await p.locator('#moTitle').textContent(), '2026년 12월');
    assert.ok(await p.locator('#moBadge').isHidden());
    await p.locator('#prevDay').click(); await p.locator('#prevDay').click();
    assert.equal(await p.locator('#moTitle').textContent(), '2026년 10월');
    await p.locator('#todayBtn').click();
    assert.equal(await p.locator('#moTitle').textContent(), '2026년 11월');
    assert.equal(await p.locator('.mc.is-sel').getAttribute('data-pick'), '2026-11-17');
    ok('‹ › 한 달씩, [이번 달] → 11월·오늘 고름');

    // 10. 체크하면 칸 줄도 완료 표시(줄긋기)
    await p.locator('#moDetail .row', { hasText: '출근' }).locator('[data-toggle]').click();
    assert.equal(await p.locator('.mc[data-pick="2026-11-17"] .mc-line').first().evaluate(e => e.classList.contains('is-done')), true);
    assert.equal(await p.locator('.mc[data-pick="2026-11-17"] .mc-text').first().evaluate(e => getComputedStyle(e).textDecorationLine), 'line-through');
    assert.match(await p.locator('#moDetail [data-drop-slot="pm"] .row-cont').textContent(), /↳ 출근 09:00–18:00/);
    assert.equal(await p.locator('#moDetail .row-slot').count(), 0);
    ok('체크 → 달력 칸 줄도 완료(줄긋기), 자세히: 오후에 "↳ 출근 09:00–18:00", 구간 안에서 구간 표시 중복 없음');

    // 10-1. 달력 위 '이번 달에 할 일' → 8열 달력: 맨 왼쪽 주 칸으로 끌면 그 주, 날짜 칸으로 끌면 그날(결 제안)
    assert.equal(await p.locator('#moListTitle').textContent(), '11월에 할 일');
    await p.locator('#moAdd input').fill('#독서 책 1권 다 읽기'); await p.keyboard.press('Enter');
    await p.locator('#moAdd input').fill('포트폴리오 완성'); await p.keyboard.press('Enter');
    let mp2 = await p.evaluate(() => bj.plansOn('month', '2026-11-01').map(x => [bj.task(x.taskId).title, bj.area(bj.task(x.taskId).areaId)?.name || null]));
    assert.deepEqual(mp2, [['책 1권 다 읽기', '독서'], ['포트폴리오 완성', null]]);
    assert.equal(await p.locator('.mo-cells .mw').count(), 5);
    assert.deepEqual(await p.locator('.mo-cells .mw .mw-num').allTextContents(), ['1주', '2주', '3주', '4주', '5주']);
    assert.equal(await p.locator('.mo-dow span').first().textContent(), '주');
    await drag(p, await mid(p.locator('#moList .row', { hasText: '포트폴리오 완성' })), await mid(p.locator('.mw[data-drop-week="2026-11-15"] .mw-num')));
    assert.deepEqual(await p.evaluate(() => bj.plansOn('week', '2026-11-15').map(x => bj.task(x.taskId).title)), ['포트폴리오 완성']);
    assert.match(await p.locator('.mw[data-drop-week="2026-11-15"]').textContent(), /포트폴리오 완성/);
    assert.match(await p.locator('#toast').textContent(), /이번 주에 놓았어요/);
    await drag(p, await mid(p.locator('#moList .row', { hasText: '책 1권' })), await mid(p.locator('.mc[data-pick="2026-11-20"] .mc-num')));
    assert.deepEqual(await p.evaluate(() => bj.state.plans.filter(x => bj.task(x.taskId).title === '책 1권 다 읽기').map(x => x.level + ':' + x.period).sort()), ['day:2026-11-20', 'month:2026-11-01']);
    assert.equal(await p.locator('#moList .row', { hasText: '포트폴리오 완성' }).locator('.tag').textContent(), '3주');
    assert.equal(await p.locator('#moList .row', { hasText: '책 1권' }).locator('.tag').textContent(), '20일');
    ok('8열 달력: 이번 달 할 일 → 왼쪽 3주 칸 = 그 주 배치, → 20일 칸 = 그날 배치, 할 일 옆 "3주"·"20일"');
    // 주 칸 누르기 → 그 주 주간 화면. 주간에는 '이번 달에서'가 없음
    await p.locator('.mw[data-drop-week="2026-11-15"]').click();
    await p.waitForFunction(() => location.hash === '#week');
    assert.equal(await p.locator('#wkTitle').textContent(), '11월 15일 – 21일');
    assert.equal(await p.locator('#wkMonth').count(), 0);
    assert.equal(await p.locator('.wk-area .row-title', { hasText: '포트폴리오 완성' }).count(), 1);
    ok('주 칸 누르기 → 그 주 주간(배치한 일이 이번 주 목록에), 주간에 "이번 달에서" 없음');
    // 오늘 화면: [이번 주 | 이번 달] 탭 → 이번 달 할 일을 오늘로
    await p.locator('.tabs a', { hasText: '오늘' }).click();
    await p.locator('#todayBtn').click();
    assert.equal(await p.locator('#panelTabs [aria-selected=true]').textContent(), '이번 주');
    assert.deepEqual(await p.locator('#weekList .row-title').allTextContents(), ['포트폴리오 완성']);
    await p.locator('#panelTabs [data-panel=month]').click();
    assert.deepEqual(await p.locator('#weekList .row-title').allTextContents(), ['책 1권 다 읽기', '포트폴리오 완성']);
    await p.locator('#weekList .row', { hasText: '책 1권' }).locator('[data-pull]').click();
    assert.ok(await p.evaluate(() => bj.plansOn('day', '2026-11-17').some(x => bj.task(x.taskId).title === '책 1권 다 읽기')));
    assert.match(await p.locator('#weekList .row', { hasText: '책 1권' }).textContent(), /오늘에 있음/);
    await p.locator('#weekAdd input').fill('블로그 글 4개'); await p.keyboard.press('Enter');
    assert.ok(await p.evaluate(() => bj.plansOn('month', '2026-11-01').some(x => bj.task(x.taskId).title === '블로그 글 4개')));
    await p.reload(); await p.waitForFunction(() => window.bj);
    assert.equal(await p.locator('#panelTabs [aria-selected=true]').textContent(), '이번 달');
    await p.locator('#panelTabs [data-panel=week]').click();
    ok('오늘: [이번 주 | 이번 달] 탭, 이번 달 할 일 [오늘로], 이번 달 탭에서 적으면 이번 달 할 일, 고른 탭 기억');
    await p.locator('.tabs a', { hasText: '월간' }).click();
    // 월간에서 몇째 주에 놓였는지(11/15 주 = 3주), 다음 달로 옮기기(>)·되돌리기
    await p.locator('.tabs a', { hasText: '월간' }).click();
    assert.match(await p.locator('#moList .row', { hasText: '책 1권' }).locator('.tags').textContent(), /17일20일/);
    await p.locator('#moList .row', { hasText: '포트폴리오 완성' }).locator('.more').click();
    await p.locator('#menu .menu-item', { hasText: '다음 달로 옮기기' }).click();
    assert.deepEqual(await p.evaluate(() => bj.state.plans.filter(x => x.level === 'month' && bj.task(x.taskId).title === '포트폴리오 완성').map(x => x.period + ':' + x.status).sort()), ['2026-11-01:migrated', '2026-12-01:open']);
    await p.locator('#moList .row', { hasText: '포트폴리오 완성' }).locator('.more').click();
    await p.locator('#menu .menu-item', { hasText: '다시 이 달로 되돌리기' }).click();
    assert.deepEqual(await p.evaluate(() => bj.state.plans.filter(x => x.level === 'month' && bj.task(x.taskId).title === '포트폴리오 완성').map(x => x.period + ':' + x.status)), ['2026-11-01:open']);
    await p.locator('#moList .row', { hasText: '책 1권' }).locator('[data-toggle]').click();
    assert.match(await p.locator('#toast').textContent(), /이번 달 몫 완료!/);
    ok('월간 할 일에 "3주" 표시, 다음 달로 옮기기(>) → 되돌리기, 체크 = 이번 달 몫 완료');
    // 시간 있는 줄: 시간이 제목 안 → 줄이 기호 → 시간 → 제목으로 이어짐
    await p.locator('.mc[data-pick="2026-11-17"]').click();
    assert.equal(await p.locator('#moDetail .row', { hasText: '출근' }).locator('.row-title > .row-time').textContent(), '09:00');
    assert.equal(await p.locator('#moDetail .row', { hasText: '출근' }).locator('.row-title').evaluate(e => getComputedStyle(e).textDecorationLine), 'line-through');
    ok('시간 있는 완료 줄: 시간이 제목 안에 있어 기호부터 시간·제목까지 한 줄로 그어짐');

    await p.screenshot({ path: path.join(OUT, 'desktop.png'), fullPage: true });

    // 11. 휴대폰 390: 가로 스크롤 없음, 글자 대신 색 막대, 달력 아래 자세히
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await m.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    const mp = await m.newPage();
    mp.on('pageerror', e => errors.push(e.message));
    await mp.clock.install({ time: new Date('2026-11-17T10:20:00+09:00') });
    await mp.goto(base + '#month');
    await mp.evaluate(() => {
      const A = n => bj.areas().find(a => a.name === n).id;
      ['2026-11-16', '2026-11-17', '2026-11-18'].forEach(d => bj.addPlan({ title: '출근', period: d, start: 540, duration: 540, areaId: A('일') }));
      bj.addPlan({ title: '병원', period: '2026-11-13', slot: 'pm', areaId: A('생활') });
      bj.addPlan({ title: '상담', period: '2026-11-18', start: 870, duration: 60 });
      bj.addPlan({ title: '롯데리아 면담', period: '2026-11-19', start: 720, duration: 60, areaId: A('일') });
    });
    const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'scrollWidth ' + sw);
    const t16 = mp.locator('.mc[data-pick="2026-11-16"] .mc-text').first();
    assert.equal(await t16.isVisible(), true);
    assert.equal(await t16.innerText(), '출근'); // 휴대폰: 기호 없이 이름
    assert.equal(await t16.evaluate(e => getComputedStyle(e).fontSize), '10px');
    const bar = await mp.locator('.mc[data-pick="2026-11-16"] .mc-line').first().boundingBox();
    assert.ok(bar.height <= 16 && bar.width > 30, JSON.stringify(bar)); // 8열이라 칸이 좁음
    await mp.locator('.mc[data-pick="2026-11-13"]').tap();
    assert.match(await mp.locator('#moDetail .zone-head').textContent(), /11월 13일/);
    const cb = await mp.locator('.mo-cal').boundingBox(), db = await mp.locator('#moDetail').boundingBox();
    assert.ok(db.y > cb.y + cb.height - 2);
    // 휴대폰 월간: 이번 달 할 일 = 기본 + 1주~5주 묶음, 달력 7열(주 칸 없음), ⋯ → 주에 놓기
    await mp.evaluate(() => { bj.addPlan({ title: '책 1권 다 읽기', level: 'month', period: '2026-11-01', areaId: bj.areas().find(a => a.name === '독서').id }); bj.addPlan({ title: '포트폴리오 완성', level: 'month', period: '2026-11-01' }); });
    assert.deepEqual(await mp.locator('#moList .mo-group h3').evaluateAll(els => els.map(e => e.firstChild.textContent.trim())), ['기본', '1주', '2주', '3주', '4주', '5주']);
    assert.deepEqual(await mp.locator('#moList .mo-group').first().locator('.row-title').allTextContents(), ['책 1권 다 읽기', '포트폴리오 완성']);
    assert.equal(await mp.locator('.mo-cells .mw').first().isVisible(), false);
    assert.equal(await mp.locator('.mo-dow span:visible').count(), 7);
    await mp.locator('#moList .row', { hasText: '포트폴리오 완성' }).locator('.more').tap();
    await mp.locator('#menu [data-week="2026-11-15"]').tap();
    assert.deepEqual(await mp.locator('#moList .mo-group').first().locator('.row-title').allTextContents(), ['책 1권 다 읽기']);
    assert.deepEqual(await mp.locator('#moList .mo-week[data-drop-week="2026-11-15"] .row-title').allTextContents(), ['포트폴리오 완성']);
    assert.match(await mp.locator('#moList .mo-week[data-drop-week="2026-11-15"] h3').textContent(), /3주 11\/15–21 · 이번 주/);
    ok('휴대폰 월간: 이번 달 할 일 = 기본 + 1주~5주 묶음, ⋯ 주에 놓기 → 3주 묶음으로, 달력 7열');
    await mp.evaluate(() => window.scrollTo(0, 0));
    await mp.screenshot({ path: path.join(OUT, 'mobile.png'), fullPage: true });
    ok('휴대폰 390: 가로 스크롤 없음, 칸마다 작은 글씨로 3줄 내용(기호 없이), 칸 탭 → 달력 아래 그날 자세히');

    assert.deepEqual(errors, []);
    ok('콘솔·페이지 오류 0');
  } finally { await b.close(); srv.close(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
