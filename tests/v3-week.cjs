// 2026-11-15 오늘한칸 v3 주간 화면 + 영역 편집 + 일요일 시작 + 옛 체험판 기록 변환 검증.
// 가짜 시계: 2026-11-17(화) 10:20 Asia/Seoul. 이번 주 = 11/15(일)~11/21(토).
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-results/v3-week');
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
const mid = async loc => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); return { x: b.x + Math.min(60, b.width / 2), y: b.y + b.height / 2 }; };
const plansOf = (p, title) => p.evaluate(t => bj.state.plans.filter(x => bj.task(x.taskId)?.title === t).map(x => x.level[0] + ':' + x.period + ':' + x.status).sort(), title);

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/v3/`;
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.clock.install({ time: new Date('2026-11-17T10:20:00+09:00') });

    // 1. 옛 체험판 기록(v1: 독서·그림·취업(일)·생활, 월요일 시작 주) → 자동 변환
    await p.goto(base + 'index.html?x');
    await p.evaluate(() => localStorage.setItem('bj.v3', JSON.stringify({
      version: 1,
      areas: [{ id: 'a1', name: '독서', color: '#6FA8DC', order: 0 }, { id: 'a2', name: '그림', color: '#F2A0B6', order: 1 }, { id: 'a3', name: '취업(일)', color: '#F0B85A', order: 2 }, { id: 'a4', name: '생활', color: '#7CCBA6', order: 3 }],
      projects: [], tasks: [{ id: 't1', title: '자소서 초안', kind: 'task', areaId: 'a3', projectId: null, status: 'open' }, { id: 't2', title: '1장 읽기', kind: 'task', areaId: 'a1', projectId: null, status: 'open' }],
      plans: [{ id: 'p1', taskId: 't1', level: 'week', period: '2026-11-16', start: null, duration: null, status: 'open', order: 1 }, { id: 'p2', taskId: 't2', level: 'day', period: '2026-11-17', start: 600, duration: 30, status: 'open', order: 2 }],
      settings: { dayStart: 360, dayEnd: 1440 },
    })));
    await p.goto(base + '#week');
    let s = await p.evaluate(() => bj.state);
    assert.equal(s.version, 2);
    assert.deepEqual(s.areas.sort((a, b) => a.order - b.order).map(a => a.name), ['일', '그림공부', '독서', '브랜딩', '여가', '생활']);
    assert.equal(s.areas.find(a => a.name === '일').id, 'a3');
    assert.equal(s.plans.find(x => x.id === 'p1').period, '2026-11-15');
    assert.equal(s.plans.find(x => x.id === 'p2').period, '2026-11-17');
    ok('옛 기록 변환: 영역 이름 바뀜(id·작업 연결 유지), 브랜딩·여가 추가, 주간 계획 11/16(월) → 11/15(일)');

    // 2. 주간 화면: 제목·7일(일요일부터)·오늘 표시·영역 제목
    assert.equal(await p.locator('#wkTitle').textContent(), '11월 15일 – 21일');
    assert.deepEqual(await p.locator('.wk-day-title').allTextContents(), ['11/15 (일)', '11/16 (월)', '11/17 (화)', '11/18 (수)', '11/19 (목)', '11/20 (금)', '11/21 (토)']);
    assert.equal(await p.locator('.wk-day.is-today .wk-day-title').textContent(), '11/17 (화)');
    assert.deepEqual(await p.locator('.wk-area-title').allTextContents(), ['일', '그림공부', '독서', '브랜딩', '여가', '생활', '기본']);
    assert.equal(await p.locator('.wk-area', { hasText: '일' }).first().locator('.row-title').textContent(), '자소서 초안');
    assert.equal(await p.locator('.wk-day.is-today .row-time').textContent(), '10:00');
    assert.equal(await p.locator('.tabs a[aria-current=page]').textContent(), '주간');
    ok('주간: 11/15(일)~21(토) 7일, 오늘 강조, 영역 6개 + 기본 제목, 이번 주 목록·시간 표시');

    // 3. 영역 칸에 바로 적기 → 그 영역의 이번 주 계획
    const areaForm = name => p.locator('.wk-area').filter({ has: p.locator('.wk-area-title', { hasText: new RegExp('^' + name + '$') }) }).locator('form input');
    await areaForm('일').fill('애홈 마무리'); await p.keyboard.press('Enter');
    await areaForm('그림공부').fill('포인트 캐릭터 드로잉'); await p.keyboard.press('Enter');
    s = await p.evaluate(() => bj.state);
    const tk = n => s.tasks.find(t => t.title === n);
    assert.equal(tk('애홈 마무리').areaId, 'a3');
    assert.equal(tk('포인트 캐릭터 드로잉').areaId, 'a2');
    assert.deepEqual(await plansOf(p, '애홈 마무리'), ['w:2026-11-15:open']);
    ok('영역 칸에 적기 → 그 영역의 이번 주 계획');

    // 4. 날짜 칸에 적기
    await p.locator('[data-add-day="2026-11-16"] input').fill('출근 9 to 6'); await p.keyboard.press('Enter');
    assert.deepEqual(await plansOf(p, '출근 9 to 6'), ['d:2026-11-16:open']);
    ok('날짜 칸에 적기 → 그날 계획');

    // 5. 이번 주 줄 → 목요일 칸으로 끌기 → 목 표시, 같은 날 또 끌면 안내
    const wrow = () => p.locator('.wk-area .row', { hasText: '포인트 캐릭터 드로잉' });
    await drag(p, await mid(wrow()), await mid(p.locator('[data-drop-day="2026-11-19"] header')));
    assert.deepEqual(await plansOf(p, '포인트 캐릭터 드로잉'), ['d:2026-11-19:open', 'w:2026-11-15:open']);
    assert.equal(await wrow().locator('.tag').textContent(), '목');
    assert.match(await p.locator('#toast').textContent(), /11\/19\(목\)에 놓았어요/);
    await drag(p, await mid(wrow()), await mid(p.locator('[data-drop-day="2026-11-19"] header')));
    assert.match(await p.locator('#toast').textContent(), /이미 11\/19\(목\)에 있어요/);
    ok('이번 주 줄 → 목요일로 끌기(같은 작업에 그날 계획, "목" 표시), 중복은 안내');

    // 6. 그날 체크 → "11/19(목) 몫 완료", 이번 주 줄에 목✓
    await p.locator('[data-drop-day="2026-11-19"] .row [data-toggle]').click();
    assert.match(await p.locator('#toast').textContent(), /11\/19\(목\) 몫 완료!/);
    assert.equal(await wrow().locator('.tag').textContent(), '목✓');
    assert.equal(await p.locator('[data-drop-day="2026-11-19"] .wk-count').textContent(), '1/1');
    await p.locator('[data-drop-day="2026-11-19"] .row [data-toggle]').click();
    ok('그날 체크 → "목 몫 완료", 이번 주 줄 목✓, 날짜 칸 1/1');

    // 7. 날짜 줄 끌기: 미래 → 미래 = 날짜만, 지난 날 → 뒤로 = 옮기기(>)
    await drag(p, await mid(p.locator('[data-drop-day="2026-11-19"] .row')), await mid(p.locator('[data-drop-day="2026-11-20"] header')));
    assert.deepEqual(await plansOf(p, '포인트 캐릭터 드로잉'), ['d:2026-11-20:open', 'w:2026-11-15:open']);
    await drag(p, await mid(p.locator('[data-drop-day="2026-11-16"] .row')), await mid(p.locator('[data-drop-day="2026-11-18"] header')));
    assert.deepEqual(await plansOf(p, '출근 9 to 6'), ['d:2026-11-16:migrated', 'd:2026-11-18:open']);
    assert.equal(await p.locator('[data-drop-day="2026-11-16"] .row .bullet').textContent(), '>');
    ok('날짜 줄 끌기: 목 → 금 = 날짜만, 지난 월 → 수 = ">" 남기고 옮김');

    // 8. 날짜 누르기 → 그날 오늘 화면, 주 넘기기
    await p.locator('.wk-day-title', { hasText: '11/20' }).click();
    await p.waitForFunction(() => location.hash === '#today');
    assert.equal(await p.locator('#dayTitle').textContent(), '11월 20일 (금)');
    assert.ok(await p.locator('#weekView').isHidden());
    await p.locator('.tabs a', { hasText: '주간' }).click();
    await p.locator('#nextDay').click();
    assert.equal(await p.locator('#wkTitle').textContent(), '11월 22일 – 28일');
    assert.ok(await p.locator('#wkBadge').isHidden());
    await p.locator('#todayBtn').click();
    assert.equal(await p.locator('#wkTitle').textContent(), '11월 15일 – 21일');
    ok('날짜 누르기 → 그날 오늘 화면, 주간 ‹ › 는 한 주씩, [이번 주]로 돌아오기');

    // 9. 설정 → 영역: 이름·색 바꾸기, 순서, 숨기기, 추가
    await p.locator('#settingsBtn').click();
    const rowOf = name => p.locator('#areaEdit li').filter({ has: p.locator(`input[type=text]`) }).filter({ hasText: '' }).locator(`input[value="${name}"]`).locator('xpath=..');
    await rowOf('브랜딩').locator('input[type=text]').fill('브랜딩 공부');
    await rowOf('브랜딩').locator('input[type=color]').evaluate(e => { e.value = '#112233'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await rowOf('생활').locator('[data-act=up]').click();
    await rowOf('여가').locator('[data-act=hide]').click();
    await p.locator('#areaAdd').click();
    await p.locator('#areaEdit li:not(.is-archived) input[type=text]').last().fill('운동');
    await p.locator('#setDlg button[value=save]').click();
    await p.waitForFunction(() => bj.areas().some(a => a.name === '운동'));
    assert.deepEqual(await p.locator('.wk-area-title').allTextContents(), ['일', '그림공부', '독서', '브랜딩 공부', '생활', '운동', '기본']);
    s = await p.evaluate(() => bj.state);
    assert.equal(s.areas.find(a => a.name === '브랜딩 공부').color, '#112233');
    assert.equal(s.areas.find(a => a.name === '여가').archived, true);
    assert.equal(await p.evaluate(() => bj.allAreas().map(a => a.name).join(',')), '일,그림공부,독서,브랜딩 공부,생활,운동,여가');
    ok('설정 영역: 이름·색 바꾸기, ▲로 순서, 여가 숨기기, 운동 추가 → 주간 제목에 바로 반영');
    await p.locator('#toast button', { hasText: '실행 취소' }).click();
    assert.deepEqual(await p.locator('.wk-area-title').allTextContents(), ['일', '그림공부', '독서', '브랜딩', '여가', '생활', '기본']);
    ok('설정 저장도 실행 취소 한 번으로 되돌림');

    // 10. "#그림"처럼 앞부분만 적어도 하나로 정해지면 그 영역
    await areaForm('기본').fill('#그림 크로키 10장'); await p.keyboard.press('Enter');
    s = await p.evaluate(() => bj.state);
    assert.equal(s.tasks.find(t => t.title === '크로키 10장').areaId, 'a2');
    ok('"#그림" → 그림공부 영역(앞부분이 하나로만 맞을 때)');

    await p.screenshot({ path: path.join(OUT, 'desktop.png'), fullPage: true });

    // 11. 휴대폰 390: 가로 스크롤 없음, 목록 아래 7일
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const mp = await m.newPage();
    mp.on('pageerror', e => errors.push(e.message));
    await mp.clock.install({ time: new Date('2026-11-17T10:20:00+09:00') });
    await mp.goto(base + '#week');
    await mp.evaluate(() => { const A = n => bj.areas().find(a => a.name === n).id; bj.addPlan({ title: '애홈 마무리', level: 'week', period: '2026-11-15', areaId: A('일') }); bj.addPlan({ title: '오늘한칸 v3', level: 'week', period: '2026-11-15', areaId: A('브랜딩') }); bj.addPlan({ title: '출근 9 to 6', period: '2026-11-16', start: 540, duration: 540, areaId: A('일') }); bj.addPlan({ title: '상담', period: '2026-11-18', start: 870, duration: 60 }); });
    const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'scrollWidth ' + sw);
    const lb = await mp.locator('.wk-left').boundingBox(), db = await mp.locator('#wkDays').boundingBox();
    assert.ok(db.y > lb.y);
    await mp.screenshot({ path: path.join(OUT, 'mobile.png'), fullPage: true });
    ok('휴대폰 390: 가로 스크롤 없음, 이번 주 목록 아래 7일');

    assert.deepEqual(errors, []);
    ok('콘솔·페이지 오류 0');
  } finally { await b.close(); srv.close(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
