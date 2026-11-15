// 2026-11-15 오늘한칸 v3 1단계(오늘 + 타임라인 + 지금) 검증. docs/v3_설계.md 5·7장.
// 저장소 루트를 작은 서버로 띄워 /v3/를 연다. 가짜 시계: 2026-11-17(화) 10:20 Asia/Seoul.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-results/v3-today');
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

const S = p => p.evaluate(() => JSON.parse(JSON.stringify(bj.state)));
const dayPlans = (p, d) => p.evaluate(d => bj.plansOn('day', d).map(x => ({ ...x, title: bj.task(x.taskId).title })), d);
const byTitle = async (p, d, t) => (await dayPlans(p, d)).find(x => x.title === t);
// 타임라인에서 그 시각의 화면 좌표
const tlPoint = (p, minute, xFrac = 0.6) => p.locator('#timeline .tl-content').evaluate((e, [m, xf]) => {
  const r = e.getBoundingClientRect(); return { x: r.left + r.width * xf, y: r.top + (m - Number(e.dataset.min)) / 15 * 9 + 1 };
}, [minute, xFrac]);
async function scrollTo(p, minute, at = 300) {
  await p.locator('#timeline .tl-content').evaluate((e, [m, at]) => {
    const r = e.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top + (m - Number(e.dataset.min)) / 15 * 9 - at);
  }, [minute, at]);
}
async function drag(p, from, to, { hold = 0 } = {}) {
  await p.mouse.move(from.x, from.y); await p.mouse.down();
  if (hold) await p.waitForTimeout(hold);
  await p.mouse.move(from.x + 2, from.y + 6, { steps: 2 }); await p.mouse.move(to.x, to.y, { steps: 8 });
  await p.mouse.up(); await p.waitForTimeout(80);
}

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
    await p.goto(base);
    const T = '2026-11-17', Y = '2026-11-16', TM = '2026-11-18', W = '2026-11-15';

    // 1. 처음: 영역 4개, 빈 화면, 지금 없음
    let s = await S(p);
    assert.deepEqual(s.areas.map(a => a.name), ['일', '그림공부', '독서', '브랜딩', '여가', '생활']);
    assert.equal(await p.locator('#dayTitle').textContent(), '11월 17일 (화)');
    assert.match(await p.locator('#now').textContent(), /지금 놓인 작업이 없어요/);
    ok('처음 화면: 영역 6개(일·그림공부·독서·브랜딩·여가·생활), 날짜, 지금 없음');

    // 2. 타임라인 빈 곳 클릭 = 30분 추가, #영역 붙이기
    await scrollTo(p, 600);
    let pt = await tlPoint(p, 600 + 5);
    await p.mouse.click(pt.x, pt.y);
    await p.locator('.tl-add-input').fill('#독서 1장 읽기');
    await p.keyboard.press('Enter');
    let a = await byTitle(p, T, '1장 읽기');
    assert.equal(a.start, 600); assert.equal(a.duration, 30);
    s = await S(p);
    assert.equal(s.tasks.find(t => t.title === '1장 읽기').areaId, s.areas.find(a => a.name === '독서').id);
    ok('빈 곳 클릭 → 10:00 30분 추가, "#독서"로 영역 지정');

    // 3. 끌어서 범위 추가 13:00~14:30
    await scrollTo(p, 780);
    await drag(p, await tlPoint(p, 780 + 2), await tlPoint(p, 860));
    await p.locator('.tl-add-input').fill('약국 가기');
    await p.keyboard.press('Enter');
    a = await byTitle(p, T, '약국 가기');
    assert.deepEqual([a.start, a.duration], [780, 90]);
    ok('끌어서 범위 추가 → 13:00~14:30 (30분 단위)');

    // 4. 몸통 끌기 = 이동(30분 단위, 길이 유지)
    await scrollTo(p, 700);
    let item = p.locator('.tl-item', { hasText: '1장 읽기' });
    let box = await item.boundingBox();
    await drag(p, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 + 36 * 1.5 + 3 });
    a = await byTitle(p, T, '1장 읽기');
    assert.deepEqual([a.start, a.duration], [690, 30]);
    assert.match(await p.locator('#toast').textContent(), /11:30로 옮겼어요/);
    ok('몸통 끌기 → 1시간 반 아래 11:30, 길이 30분 유지, 실행 취소 알림');

    // 5. 실행 취소
    await p.locator('#toast button', { hasText: '실행 취소' }).click();
    a = await byTitle(p, T, '1장 읽기');
    assert.equal(a.start, 600);
    ok('실행 취소 → 10:00로 돌아감');

    // 6. 아래 끝 끌기 = 길이 조절(15분)
    item = p.locator('.tl-item', { hasText: '1장 읽기' });
    box = await item.boundingBox();
    await drag(p, { x: box.x + 40, y: box.y + box.height - 3 }, { x: box.x + 40, y: box.y + box.height - 3 + 9 * 3 });
    a = await byTitle(p, T, '1장 읽기');
    assert.deepEqual([a.start, a.duration], [600, 75]);
    ok('아래 끝 끌기 → 길이 30분 → 75분 (15분 단위)');

    // 7. 짧게 누르기 = 이름 수정
    await p.locator('.tl-item .tl-title', { hasText: '1장 읽기' }).click();
    await p.locator('.tl-item .rename-input').fill('1장 다 읽기');
    await p.keyboard.press('Enter');
    assert.ok(await byTitle(p, T, '1장 다 읽기'));
    ok('짧게 누르기 → 이름 수정');

    // 8. 지금: 10:20은 10:00~11:15 안
    assert.match(await p.locator('#now').textContent(), /1장 다 읽기[\s\S]*10:00–11:15 · 55분 남음 독서/);
    assert.equal(await p.locator('#timeline .tl-now').count(), 1);
    ok('지금 카드: 10:00–11:15 · 55분 남음 + 영역 칩, 지금 선 1개');

    // 9. 불렛 체크 = 오늘 몫 완료, 계획이 하나뿐이면 "작업도 끝났어요" 제안
    await p.locator('#now [data-toggle]').click();
    a = await byTitle(p, T, '1장 다 읽기');
    assert.equal(a.status, 'done');
    assert.match(await p.locator('#toast').textContent(), /오늘 몫 완료! \(1\/2\)/);
    await p.locator('#toast button', { hasText: '작업도 끝났어요' }).click();
    s = await S(p);
    assert.equal(s.tasks.find(t => t.title === '1장 다 읽기').status, 'done');
    assert.match(await p.locator('#progress').textContent(), /1 \/ 2 했어요/);
    ok('불렛 체크 → 오늘 몫 완료(1/2) + 작업 완료 제안 → 작업 완료');

    // 10. 시간 없음 적기 → 타임라인으로 끌기 → 다시 시간 없음으로
    await p.locator('#untimedAdd input').fill('세수하기 #생활');
    await p.keyboard.press('Enter');
    a = await byTitle(p, T, '세수하기');
    assert.equal(a.start, null);
    await scrollTo(p, 540);
    let row = p.locator('#untimedList .row', { hasText: '세수하기' });
    await row.scrollIntoViewIfNeeded();
    box = await row.boundingBox();
    await scrollTo(p, 480, 520); // 끌 줄이 두 줄 머리(약 90px) 아래로 보이게
    box = await row.boundingBox();
    let to = await tlPoint(p, 480 + 10);
    await drag(p, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, to);
    a = await byTitle(p, T, '세수하기');
    assert.deepEqual([a.start, a.duration], [480, 30]);
    ok('시간 없음 줄 → 타임라인 08:00에 놓기 → 08:00~08:30');
    item = p.locator('.tl-item', { hasText: '세수하기' });
    box = await item.boundingBox();
    const zone = await p.locator('#untimedList').boundingBox();
    await drag(p, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: zone.x + 40, y: zone.y + 10 });
    a = await byTitle(p, T, '세수하기');
    assert.equal(a.start, null);
    ok('타임라인 항목 → 시간 없음에 놓기 → 시간 빠짐');

    // 11. 이번 주에 적기 → [오늘로] → "오늘에 있음"
    await p.locator('#weekAdd input').fill('자소서 초안 #일');
    await p.keyboard.press('Enter');
    let wk = await p.evaluate(w => bj.plansOn('week', w).map(x => bj.task(x.taskId).title), W);
    assert.deepEqual(wk, ['자소서 초안']);
    await p.locator('#weekList .pull').click();
    a = await byTitle(p, T, '자소서 초안');
    assert.ok(a && a.start == null);
    assert.match(await p.locator('#weekList .row').textContent(), /오늘에 있음/);
    s = await S(p);
    assert.equal(s.tasks.filter(t => t.title === '자소서 초안').length, 1);
    ok('이번 주에 적기 → [오늘로] → 같은 작업에 오늘 계획, "오늘에 있음"');

    // 12. 이번 주 줄을 타임라인에 끌기 → 이미 오늘에 있으면 그 계획의 시간만
    await p.locator('#weekAdd input').fill('표지 디자인 #그림');
    await p.keyboard.press('Enter');
    await scrollTo(p, 900);
    row = p.locator('#weekList .row', { hasText: '표지 디자인' });
    box = await row.boundingBox();
    to = await tlPoint(p, 900 + 20);
    await drag(p, { x: box.x + 60, y: box.y + box.height / 2 }, to);
    a = await byTitle(p, T, '표지 디자인');
    assert.deepEqual([a.start, a.duration], [900, 30]);
    ok('이번 주 줄 → 타임라인 15:00에 끌어오기');

    // 13. 메뉴: 내일로 옮기기(>)
    await p.locator('#untimedList .row', { hasText: '자소서 초안' }).locator('.more').click();
    await p.locator('#menu .menu-item', { hasText: '내일로 옮기기' }).click();
    a = await byTitle(p, T, '자소서 초안');
    assert.equal(a.status, 'migrated');
    assert.ok(await byTitle(p, TM, '자소서 초안'));
    assert.equal(await p.locator('#untimedList .row', { hasText: '자소서 초안' }).locator('.bullet').textContent(), '>');
    ok('내일로 옮기기 → 오늘 계획은 ">"로 남고 내일에 계획');

    // 13-1. 내일로 옮긴 걸 다시 오늘로(결 보고 2026-11-15)
    const menuOn = async (loc, label) => { await loc.locator('.more').click(); await p.locator('#menu .menu-item', { hasText: label }).click(); };
    const cnt = (title) => p.evaluate(t => bj.state.plans.filter(x => bj.task(x.taskId)?.title === t).map(x => x.period + ':' + x.status).sort().join(','), title);
    await p.locator('#untimedAdd input').fill('포트폴리오 표지');
    await p.keyboard.press('Enter');
    const pf = () => p.locator('#untimedList .row', { hasText: '포트폴리오 표지' });
    await menuOn(pf(), '내일로 옮기기');
    assert.equal(await cnt('포트폴리오 표지'), `${T}:migrated,${TM}:open`);
    await menuOn(pf(), '다시 오늘로 되돌리기');
    assert.equal(await cnt('포트폴리오 표지'), `${T}:open`);
    assert.notEqual(await pf().locator('.bullet').textContent(), '>');
    ok('">" 줄 메뉴 → 다시 오늘로 되돌리기: 내일 계획 지우고 오늘 계획 다시 열림');
    await menuOn(pf(), '내일로 옮기기');
    await p.locator('#nextDay').click();
    await menuOn(pf(), '오늘로 옮기기');
    assert.equal(await cnt('포트폴리오 표지'), `${T}:open`);
    assert.match(await p.locator('#toast').textContent(), /오늘로 되돌렸어요/);
    await p.locator('#todayBtn').click();
    ok('내일 화면에서 오늘로 옮기기 → 되돌리기(흔적 없음, 계획 1개)');
    // 날짜 고르기: 오늘 → 11/20 (>), 11/20에서 → 11/19 (앞당기기 = 날짜만)
    await menuOn(pf(), '날짜 고르기');
    await p.locator('#dateInput').fill('2026-11-20');
    await p.locator('#dateDlg button[value=move]').click();
    await p.waitForFunction(() => bj.state.plans.some(x => x.period === '2026-11-20'));
    assert.equal(await cnt('포트폴리오 표지'), `${T}:migrated,2026-11-20:open`);
    const fut = await p.evaluate(() => bj.state.plans.find(x => x.period === '2026-11-20').id);
    await p.evaluate(([id, t]) => bj.movePlan(id, '2026-11-19', t), [fut, T]);
    assert.equal(await cnt('포트폴리오 표지'), `${T}:migrated,2026-11-19:open`);
    await menuOn(pf(), '다시 오늘로 되돌리기');
    assert.equal(await cnt('포트폴리오 표지'), `${T}:open`);
    ok('날짜 고르기 → 11/20(>), 미래끼리 당기기 = 날짜만, 되돌리기는 옮겨 간 곳을 따라가 지움');
    // 지난 계획 → 오늘로 = 옮기기(>), 옮겨 간 곳을 체크했으면 되돌리기 막음
    await p.evaluate(y => bj.addPlan({ title: '어제 못 한 일', period: y }), Y);
    await p.locator('#prevDay').click();
    await menuOn(p.locator('#untimedList .row', { hasText: '어제 못 한 일' }), '오늘로 옮기기');
    assert.equal(await cnt('어제 못 한 일'), `${Y}:migrated,${T}:open`);
    await p.locator('#todayBtn').click();
    await p.locator('#untimedList .row', { hasText: '어제 못 한 일' }).locator('[data-toggle]').click();
    await p.evaluate(() => document.querySelector('#toast').hidden = true);
    await p.locator('#prevDay').click();
    await menuOn(p.locator('#untimedList .row', { hasText: '어제 못 한 일' }), '다시 이 날로 되돌리기');
    assert.match(await p.locator('#toast').textContent(), /이미 체크해서 되돌릴 수 없어요/);
    assert.equal(await cnt('어제 못 한 일'), `${Y}:migrated,${T}:done`);
    await p.locator('#todayBtn').click();
    await p.evaluate(t => { bj.deletePlan(bj.plansOn('day', t).find(x => bj.task(x.taskId).title === '어제 못 한 일').id); bj.deletePlan(bj.state.plans.find(x => bj.task(x.taskId)?.title === '어제 못 한 일').id); bj.deletePlan(bj.plansOn('day', t).find(x => bj.task(x.taskId).title === '포트폴리오 표지').id); }, T);
    ok('지난 계획 → 오늘로 = 옮기기(>), 옮겨 간 곳을 이미 체크했으면 되돌리기 막고 안내');

    // 14. 메뉴: 영역·프로젝트 정하기(새 프로젝트)
    await p.locator('.tl-item', { hasText: '약국 가기' }).locator('.more').click();
    await p.locator('#menu .menu-item', { hasText: '영역 · 프로젝트' }).click();
    await p.locator('#assignArea').selectOption({ label: '생활' });
    await p.locator('#assignNewProject').fill('건강 챙기기');
    await p.locator('#assignDlg button[value=save]').click();
    await p.waitForFunction(() => bj.state.projects.length === 1);
    s = await S(p);
    const pr = s.projects.find(x => x.name === '건강 챙기기');
    assert.ok(pr && pr.areaId === s.areas.find(a => a.name === '생활').id);
    assert.equal(s.tasks.find(t => t.title === '약국 가기').projectId, pr.id);
    assert.equal(await p.locator('.tl-item', { hasText: '약국 가기' }).locator('.tl-meta').textContent(), '건강 챙기기');
    ok('영역·프로젝트 창 → 생활 / 새 프로젝트 "건강 챙기기"');

    // 15. 어제 계획 가져오기(반복 대신): 끝낸 것도 고를 수 있음, 시간 그대로, 같은 작업
    await p.evaluate(y => { const id = bj.addPlan({ title: '아침 스트레칭', period: y, start: 420, duration: 30 }); bj.togglePlan(id); bj.addPlan({ title: '메일 확인', period: y }); }, Y);
    await p.locator('#importBtn').click();
    assert.equal(await p.locator('#importList li').count(), 2);
    await p.locator('#importAll').click();
    await p.locator('#importGo').click();
    await p.waitForFunction(t => bj.plansOn('day', t).length >= 7, T);
    a = await byTitle(p, T, '아침 스트레칭');
    assert.deepEqual([a.start, a.duration, a.status], [420, 30, 'open']);
    assert.ok(await byTitle(p, T, '메일 확인'));
    s = await S(p);
    assert.equal(s.tasks.filter(t => t.title === '아침 스트레칭').length, 1);
    assert.equal((await byTitle(p, Y, '아침 스트레칭')).status, 'done');
    await p.locator('#importBtn').click();
    assert.equal(await p.locator('#importList input:disabled').count(), 2);
    await p.locator('#importDlg button[value=cancel]').click();
    ok('어제 계획 가져오기 → 완료한 것도 가져옴, 시간 유지, 작업 그대로, 두 번째는 "이미 있어요"');

    // 15-1. 목록엔 영역 이름(·미분류) 글자 없이 색으로만. 범례에 영역 4개 + 미분류
    const visible = loc => loc.evaluate(e => { const c = e.cloneNode(true); c.querySelectorAll('.sr-only').forEach(x => x.remove()); return c.textContent; });
    const washRow = p.locator('#untimedList .row', { hasText: '세수하기' });
    assert.doesNotMatch(await visible(washRow), /생활/);
    assert.doesNotMatch(await visible(p.locator('#untimedList')), /미분류/);
    assert.doesNotMatch(await visible(p.locator('#weekList')), /일|그림공부/);
    s = await S(p);
    assert.equal(await washRow.evaluate(e => e.style.getPropertyValue('--c')), s.areas.find(a => a.name === '생활').color);
    assert.equal(await p.locator('#untimedList .row', { hasText: '메일 확인' }).evaluate(e => e.classList.contains('no-area')), true);
    assert.deepEqual(await p.locator('#legend li').allTextContents(), ['일', '그림공부', '독서', '브랜딩', '여가', '생활', '미분류']);
    assert.equal(await washRow.locator('.sr-only').textContent(), '생활');
    ok('목록·타임라인에 영역 이름 글자 없음(프로젝트 이름만), 영역 색 + 범례, 화면 읽기용 이름은 남김');

    // 16. 종류 바꾸기: 메모는 체크 없음
    await p.locator('#untimedList .row', { hasText: '메일 확인' }).locator('.more').click();
    await p.locator('#menu [data-kind=note]').click();
    assert.equal(await p.locator('#untimedList .row', { hasText: '메일 확인' }).locator('[data-toggle]').count(), 0);
    ok('종류를 메모로 → 체크 없음(–)');

    // 16-1. 기호 기본값(• 할일 · * 일정 · - 메모 · • 완료+줄긋기 · > 다음으로)과 완료 줄긋기
    const deco = loc => loc.evaluate(e => getComputedStyle(e).textDecorationLine);
    assert.equal(await p.locator('#untimedList .row', { hasText: '메일 확인' }).locator('.bullet').textContent(), '-');
    await p.locator('.tl-item', { hasText: '약국 가기' }).locator('.more').click();
    await p.locator('#menu [data-kind=event]').click();
    assert.equal(await p.locator('.tl-item', { hasText: '약국 가기' }).locator('.bullet').textContent(), '*');
    const wash = p.locator('#untimedList .row', { hasText: '세수하기' });
    await wash.locator('[data-toggle]').click();
    assert.equal(await wash.locator('.bullet').textContent(), '•');
    assert.equal(await deco(wash.locator('.row-title')), 'line-through');
    assert.equal(await deco(p.locator('.tl-item', { hasText: '1장 다 읽기' }).locator('.tl-title')), 'line-through');
    ok('기본 기호: 메모 "-", 일정 "*", 완료 "•" + 줄긋기, 작업 완료도 줄긋기');

    // 16-2. 설정에서 기호 바꾸기 + 줄긋기 끄기 → 미리보기 → 저장 → 기본값으로
    await p.locator('#settingsBtn').click();
    assert.equal(await p.locator('#symTask').inputValue(), '•');
    await p.locator('#symEvent').fill('○');
    await p.locator('#symDone').fill('×');
    await p.locator('#symStrike').uncheck();
    assert.match(await p.locator('#symPreview').textContent(), /○14:00 약국 가기[\s\S]*×세수하기/);
    await p.locator('#setDlg button[value=save]').click();
    await p.waitForFunction(() => bj.symbols().done === '×');
    assert.equal(await p.locator('.tl-item', { hasText: '약국 가기' }).locator('.bullet').textContent(), '○');
    assert.equal(await wash.locator('.bullet').textContent(), '×');
    assert.equal(await deco(wash.locator('.row-title')), 'none');
    await p.locator('#settingsBtn').click();
    await p.locator('#symDefault').click();
    await p.locator('#setDlg button[value=save]').click();
    await p.waitForFunction(() => bj.symbols().done === '•' && bj.strikeDone());
    assert.equal(await deco(wash.locator('.row-title')), 'line-through');
    ok('기호 설정: 일정 ○ · 완료 × · 줄긋기 끄기 → 바로 반영, 기본값으로 되돌리기');

    // 17. 새로고침해도 남음 + 날짜 이동
    await p.reload();
    assert.ok(await byTitle(p, T, '약국 가기'));
    await p.locator('#nextDay').click();
    assert.equal(await p.locator('#dayTitle').textContent(), '11월 18일 (수)');
    assert.ok(await p.locator('#now').isHidden());
    assert.equal(await p.locator('#untimedList .row', { hasText: '자소서 초안' }).count(), 1);
    await p.locator('#todayBtn').click();
    ok('새로고침해도 기록 유지, 다음 날로 이동(지금 숨김, 옮긴 작업 보임)');

    // 18. 지금 선·지금 카드는 1분마다 갱신
    await p.clock.fastForward('01:00:00');
    assert.match(await p.locator('#now').textContent(), /지금 놓인 작업이 없어요[\s\S]*다음: 13:00 약국 가기/);
    ok('1시간 뒤(11:20) → 지금 없음, 다음: 13:00 약국 가기');

    await p.screenshot({ path: path.join(OUT, 'desktop.png'), fullPage: true });

    // 19. 휴대폰 390px: 가로 스크롤 없음, 이번 주가 아래로
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', locale: 'ko-KR', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const mp = await m.newPage();
    mp.on('pageerror', e => errors.push(e.message));
    await mp.clock.install({ time: new Date('2026-11-17T10:20:00+09:00') });
    await mp.goto(base);
    await mp.evaluate(t => { bj.addPlan({ title: '포트폴리오 표지 스케치', period: t, start: 600, duration: 60, areaId: bj.areas()[1].id }); bj.addPlan({ title: '이력서 1줄 고치기', period: t, areaId: bj.areas()[2].id }); bj.addPlan({ title: '자소서 초안', level: 'week', period: '2026-11-15' }); }, T);
    const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'scrollWidth ' + sw);
    const tlBox = await mp.locator('#timeline').boundingBox(), wkBox = await mp.locator('#weekZone').boundingBox();
    assert.ok(wkBox.y > tlBox.y);
    // 터치: 짧게 탭 = 그 칸에 추가
    await mp.locator('#timeline .tl-content').evaluate((e) => { const r = e.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top + (840 - Number(e.dataset.min)) / 15 * 9 - 300); });
    const tp = await mp.locator('#timeline .tl-content').evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width * .5, y: r.top + (840 - Number(e.dataset.min)) / 15 * 9 + 4 }; });
    await mp.touchscreen.tap(tp.x, tp.y);
    await mp.locator('.tl-add-input').fill('치즈 사료 주문');
    await mp.keyboard.press('Enter');
    const c = await mp.evaluate(t => bj.plansOn('day', t).map(x => [bj.task(x.taskId).title, x.start]), T);
    assert.ok(c.some(([n, st]) => n === '치즈 사료 주문' && st === 840));
    await mp.evaluate(() => window.scrollTo(0, 0));
    await mp.screenshot({ path: path.join(OUT, 'mobile.png'), fullPage: true });
    ok('휴대폰 390: 가로 스크롤 없음, 이번 주가 아래, 터치 짧게 탭 → 14:00 추가');

    // 20. 어두운 모드
    await p.emulateMedia({ colorScheme: 'dark' });
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, 'rgb(23, 23, 23)');
    await p.screenshot({ path: path.join(OUT, 'dark.png'), fullPage: false });
    ok('어두운 모드 배경');

    assert.deepEqual(errors, []);
    ok('콘솔·페이지 오류 0');
  } finally { await b.close(); srv.close(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
