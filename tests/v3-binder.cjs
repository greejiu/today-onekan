// 2026-11-24 오늘한칸 v3 바인더(6공 다이어리) 검증. docs/v3_설계.md 10장.
// 맨 앞 기호·색인 / 끼운 속지 쪽수 / 맨 뒤 설정 / 넘기기(‹ ›·스와이프) / 순서 바꾸기 / 노트 손글씨(펜 압력·지우개·되돌리기).
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-results/v3-binder');
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
const label = p => p.locator('#pgLabel').textContent();
const pages = p => p.evaluate(() => bj.pages().map(x => ({ id: x.id, type: x.type, period: x.period, n: (x.ink || []).length })));
async function addPage(p, type, date, paper) {
  await p.locator('#addPageBtn').click();
  await p.locator(`#pageDlg input[name=ptype][value=${type}]`).check();
  if (date) await p.locator('#pageDate').fill(date);
  if (paper) await p.locator(`#pageDlg input[name=paper][value=${paper}]`).check();
  await p.locator('#pageDlg button[value=add]').click();
  await p.waitForTimeout(50);
}
// 노트 용지 위에 획 하나(펜이면 압력 포함). 합성 PointerEvent로 S펜 흉내
async function stroke(p, pts, { type = 'pen', pressure = 0.5, buttons = 1 } = {}) {
  await p.locator('#inkCanvas').evaluate((c, [pts, type, pressure, buttons]) => {
    const r = c.getBoundingClientRect();
    const ev = (n, [x, y], pr) => c.dispatchEvent(new PointerEvent(n, { bubbles: true, cancelable: true, pointerId: 7, pointerType: type, isPrimary: true, clientX: r.left + x * r.width, clientY: r.top + y * r.height, pressure: pr, button: n === 'pointerdown' ? (buttons & 32 ? 5 : 0) : -1, buttons: n === 'pointerup' ? 0 : buttons }));
    ev('pointerdown', pts[0], pressure);
    pts.slice(1).forEach((q, i) => ev('pointermove', q, Math.min(1, pressure + i * 0.1)));
    ev('pointerup', pts[pts.length - 1], 0);
  }, [pts, type, pressure, buttons]);
  await p.waitForTimeout(30);
}
async function swipe(p, cdp, x0, x1, y = 500) {
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y + i }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(120);
}

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
    p.on('dialog', d => d.accept());
    await p.clock.install({ time: new Date('2026-11-24T10:20:00+09:00') });
    await p.goto(base);

    // 1. 바인더 탭 → 맨 앞 기호·색인. 빈 색인, 날짜 ‹ › 대신 쪽 ‹ ›
    await p.locator('.tabs a[href="#b"]').click();
    await p.waitForTimeout(50);
    assert.equal(await p.evaluate(() => location.hash), '#b/key');
    assert.equal(await label(p), '기호 · 색인');
    assert.ok(await p.locator('#dateNav').isHidden());
    assert.ok(await p.locator('#binderView').isVisible());
    assert.ok(await p.locator('#todayView').isHidden());
    assert.equal(await p.locator('.tabs a[href="#b"]').getAttribute('aria-current'), 'page');
    assert.equal((await p.locator('.key-syms li').allTextContents()).join('|'), '•할일|*일정|-메모|•완료|>다음으로 옮김');
    assert.equal(await p.locator('.key-legend li').count(), 7);
    assert.ok(await p.locator('.idx-empty').isVisible());
    assert.ok(await p.locator('#pgPrev').isDisabled());
    ok('바인더 맨 앞 = 기호(지금 기호·영역 색) + 빈 색인, 날짜 대신 쪽 넘기기');

    // 2. 속지 끼우기: 11월 월간 → 줄 노트 → 이번 주 주간 → 오늘. 끼운 순서대로 1~4쪽
    await addPage(p, 'month', '2026-11-24');
    await addPage(p, 'note', null, 'grid');
    await addPage(p, 'week', '2026-11-25');
    await addPage(p, 'day', '2026-11-24');
    let ps = await pages(p);
    assert.deepEqual(ps.map(x => x.type + ':' + x.period), ['month:2026-11-01', 'note:null', 'week:2026-11-22', 'day:2026-11-24']);
    assert.deepEqual(await p.locator('.idx-no').allTextContents(), ['1', '2', '3', '4']);
    assert.deepEqual(await p.locator('.idx-name').allTextContents(), ['11월 월간', '노트', '11/22~11/28 주간', '11월 24일 (화)']);
    // 같은 달 월간은 한 번만
    await addPage(p, 'month', '2026-11-03');
    assert.equal((await pages(p)).length, 4);
    assert.match(await p.locator('#toast').textContent(), /이미 1쪽에 있어요/);
    ok('속지 끼우기(월간·노트·주간·하루) → 끼운 순서대로 1~4쪽, 같은 달 월간은 한 번만');

    // 3. ‹ › 넘기기: 기호·색인 → 1쪽(월간 화면) → 2쪽(노트) → 3쪽(주간) → 4쪽(하루) → 설정(맨 뒤)
    await p.locator('#pgNext').click(); await p.waitForTimeout(60);
    assert.equal(await label(p), '1쪽 · 11월 월간');
    assert.ok(await p.locator('#monthView').isVisible());
    assert.match(await p.locator('#moTitle').textContent(), /11월/);
    assert.equal(await p.locator('#pgCorner').textContent(), '1');
    assert.ok(await p.locator('.rings').isVisible());
    // 월간 속지 안에서 날짜를 골라도 속지 날짜로 되돌아가지 않음
    await p.locator('[data-pick="2026-11-10"]').first().click(); await p.waitForTimeout(40);
    assert.match(await p.locator('#moDetail').textContent(), /10/);
    await p.locator('#pgNext').click(); await p.waitForTimeout(60);
    assert.equal(await label(p), '2쪽 · 노트');
    assert.ok(await p.locator('#paper.paper-grid').isVisible());
    await p.locator('#pgNext').click(); await p.waitForTimeout(60);
    assert.equal(await label(p), '3쪽 · 11/22~11/28 주간');
    assert.ok(await p.locator('#weekView').isVisible());
    await p.locator('#pgNext').click(); await p.waitForTimeout(60);
    assert.equal(await label(p), '4쪽 · 11월 24일 (화)');
    assert.ok(await p.locator('#todayView').isVisible());
    assert.equal(await p.locator('#dayTitle').textContent(), '11월 24일 (화)');
    await p.locator('#pgNext').click(); await p.waitForTimeout(60);
    assert.equal(await label(p), '설정');
    assert.ok(await p.locator('#pgNext').isDisabled());
    assert.ok(await p.locator('#setMount form.in-page #symTask').isVisible());
    assert.ok(await p.locator('#pgCorner').isHidden());
    ok('‹ › 로 기호·색인 → 1~4쪽(기존 월간·노트·주간·하루 화면) → 맨 뒤 설정, 쪽수 표시');

    // 4. 설정 장에서 기호 바꿔 저장 → 기호·색인에 반영. 바인더에서 ⚙ = 설정 장
    await p.locator('#symTask').fill('○');
    await p.locator('#setMount button[value=save]').click(); await p.waitForTimeout(60);
    assert.equal(await p.evaluate(() => bj.symbols().task), '○');
    await p.locator('#pgLabel').click(); await p.waitForTimeout(60);
    assert.equal(await label(p), '기호 · 색인');
    assert.match(await p.locator('.key-syms li').first().textContent(), /○할일/);
    await p.locator('#settingsBtn').click(); await p.waitForTimeout(60);
    assert.equal(await label(p), '설정');
    // 바인더 밖에서는 설정 창 그대로
    await p.locator('.tabs a[href="#today"]').click(); await p.waitForTimeout(60);
    assert.ok(await p.locator('#dateNav').isVisible());
    assert.ok(await p.locator('.rings').isHidden());
    await p.locator('#settingsBtn').click();
    assert.ok(await p.locator('#setDlg #symTask').isVisible());
    assert.equal(await p.locator('#symTask').inputValue(), '○');
    await p.locator('#setDlg button[value=cancel]').click();
    ok('맨 뒤 설정 장에서 저장 → 기호 반영, 바인더 ⚙ = 설정 장, 바인더 밖 ⚙ = 설정 창');

    // 5. 순서 바꾸기: ▼ 한 번, ≡ 끌기. 쪽수는 순서대로 다시, 주소(속지 id)는 그대로
    await p.locator('.tabs a[href="#b"]').click(); await p.waitForTimeout(60);
    assert.equal(await label(p), '설정'); // 마지막으로 본 장 기억
    await p.locator('#pgLabel').click(); await p.waitForTimeout(60);
    const monthId = ps[0].id;
    await p.locator(`[data-pid="${monthId}"] [data-act=down]`).click(); await p.waitForTimeout(40);
    assert.deepEqual((await pages(p)).map(x => x.type), ['note', 'month', 'week', 'day']);
    assert.deepEqual(await p.locator('.idx-name').allTextContents(), ['노트', '11월 월간', '11/22~11/28 주간', '11월 24일 (화)']);
    // 하루(4쪽)를 맨 위로 끌기
    const dayId = ps[3].id;
    const g = await p.locator(`[data-pid="${dayId}"] .idx-grip`).boundingBox();
    const first = await p.locator('.idx li').first().boundingBox();
    await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await p.mouse.down();
    await p.mouse.move(g.x + g.width / 2, first.y + 4, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(60);
    assert.deepEqual((await pages(p)).map(x => x.type), ['day', 'note', 'month', 'week']);
    assert.deepEqual(await p.locator('.idx-no').allTextContents(), ['1', '2', '3', '4']);
    await p.locator(`[data-bgo="${monthId}"]`).click(); await p.waitForTimeout(60);
    assert.equal(await p.evaluate(() => location.hash), '#b/' + monthId);
    assert.equal(await label(p), '3쪽 · 11월 월간');
    ok('색인에서 ▼·≡ 끌기로 순서 바꾸기 → 쪽수 자동으로 다시, 주소는 속지 id 그대로');

    // 6. 빼기 + 실행 취소
    await p.locator('#pgLabel').click(); await p.waitForTimeout(60);
    await p.locator(`[data-pid="${ps[2].id}"] [data-act=remove]`).click(); await p.waitForTimeout(40);
    assert.equal((await pages(p)).length, 3);
    await p.locator('#toast button', { hasText: '실행 취소' }).click(); await p.waitForTimeout(40);
    assert.equal((await pages(p)).length, 4);
    ok('속지 빼기 → 실행 취소로 다시 끼움');

    // 7. 노트 손글씨: S펜(압력) 획 2개, 형광펜, 펜 옆 버튼 = 지우개, 여러 번 되돌리기
    const noteId = ps[1].id;
    await p.evaluate(id => { location.hash = '#b/' + id; }, noteId); await p.waitForTimeout(120);
    assert.equal(await label(p), '2쪽 · 노트');
    await stroke(p, [[0.1, 0.1], [0.2, 0.12], [0.3, 0.15], [0.4, 0.2]], { pressure: 0.3 });
    await stroke(p, [[0.1, 0.5], [0.5, 0.5], [0.9, 0.5]], { pressure: 0.8 });
    let ink = await p.evaluate(id => bj.page(id).ink, noteId);
    assert.equal(ink.length, 2);
    assert.equal(ink[0][0], 0); // 펜
    assert.ok(ink[0][5] >= 1 && ink[0][5] <= 9 && ink[1][5] > ink[0][5], '압력 기록');
    assert.ok(Math.abs(ink[1][3] - 100) <= 2 && Math.abs(ink[1][4] - Math.round(0.5 * 1414 / 1000 * 1000)) <= 3, '용지 좌표 폭 1000 기준: ' + ink[1].slice(3, 5));
    assert.equal(await p.evaluate(() => localStorage.getItem('bj.v3.penSeen')), '1');
    // 형광펜(색을 안 골랐으면 노랑)
    await p.locator('[data-tool=hl]').click();
    await stroke(p, [[0.1, 0.7], [0.6, 0.7]], { type: 'pen' });
    ink = await p.evaluate(id => bj.page(id).ink, noteId);
    assert.equal(ink.length, 3); assert.equal(ink[2][0], 1); assert.equal(ink[2][1], 4);
    await p.locator('[data-tool=pen]').click();
    // S펜 옆 버튼 누른 채 = 지우개 → 가운데 획만 지움
    await stroke(p, [[0.48, 0.49], [0.52, 0.51]], { buttons: 32 + 1 });
    ink = await p.evaluate(id => bj.page(id).ink, noteId);
    assert.equal(ink.length, 2); assert.equal(ink[1][0], 1);
    // 되돌리기 두 번: 지우기 취소 → 형광펜 취소
    await p.locator('#noteUndo').click(); await p.waitForTimeout(40);
    assert.equal((await p.evaluate(id => bj.page(id).ink, noteId)).length, 3);
    await p.locator('#noteUndo').click(); await p.waitForTimeout(40);
    assert.equal((await p.evaluate(id => bj.page(id).ink, noteId)).length, 2);
    // 펜을 쓴 기기에서는 손가락(touch)은 그리지 않음
    await stroke(p, [[0.2, 0.8], [0.7, 0.85]], { type: 'touch' });
    assert.equal((await p.evaluate(id => bj.page(id).ink, noteId)).length, 2);
    // 제목·속지 모양
    await p.locator('#noteTitle').fill('그림 연습'); await p.locator('#noteTitle').press('Enter'); await p.waitForTimeout(40);
    await p.locator('#notePaper').selectOption('dot'); await p.waitForTimeout(40);
    assert.equal(await label(p), '2쪽 · 그림 연습');
    assert.ok(await p.locator('#paper.paper-dot').isVisible());
    const box = await p.locator('#paper').boundingBox();
    assert.ok(Math.abs(box.height / box.width - 1.414) < 0.01, '용지 비율 ' + box.height / box.width);
    assert.ok(box.y + box.height <= 900 + 1, '화면 높이 안에 한 장');
    await p.screenshot({ path: path.join(OUT, 'note-pc.png') });
    ok('노트: S펜 압력 획 · 형광펜 · 펜 옆 버튼 지우개 · 여러 번 되돌리기 · 펜 쓴 기기는 손가락 안 그림 · 제목·모양');

    // 8. 새로고침해도 그대로(이 기기 저장), 마지막 장 기억
    await p.reload(); await p.waitForTimeout(150);
    assert.equal(await label(p), '2쪽 · 그림 연습');
    assert.equal((await p.evaluate(id => bj.page(id).ink, noteId)).length, 2);
    ok('새로고침해도 속지·손글씨·보던 장 그대로');

    // 9. 다른 기기 기록과 합치기: 속지를 모르는 옛 버전 기록과 합쳐도 속지가 남음
    const merged = await p.evaluate(() => { const s = JSON.parse(JSON.stringify(bj.state)); const old = JSON.parse(JSON.stringify(s)); delete old.pages; return [BJStore.merge(old, s).pages.length, BJStore.merge(s, old).pages.length]; });
    assert.deepEqual(merged, [4, 4]);
    ok('속지를 모르는 옛 기록과 합쳐도 속지 4장 그대로');

    // 10. 휴대폰(갤럭시탭 세로처럼 터치): 손가락 스와이프로 넘기기, 가로 스크롤 없음
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
    await m.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    const state = await p.evaluate(() => localStorage.getItem('bj.v3'));
    await m.addInitScript(s => { if (!localStorage.getItem('bj.v3')) localStorage.setItem('bj.v3', s); }, state);
    const mp = await m.newPage();
    mp.on('pageerror', e => errors.push('mobile: ' + e.message));
    await mp.clock.install({ time: new Date('2026-11-24T10:20:00+09:00') });
    await mp.goto(base + '#b/key'); await mp.waitForTimeout(150);
    const cdp = await m.newCDPSession(mp);
    await swipe(mp, cdp, 320, 80);
    assert.equal(await label(mp), '1쪽 · 11월 24일 (화)');
    await swipe(mp, cdp, 320, 80);
    assert.equal(await label(mp), '2쪽 · 그림 연습');
    // 펜을 안 쓴 기기: 노트에서 손가락 = 쓰기(스와이프 아님) → ✋ 끄면 손가락 = 넘기기
    const pb = await mp.locator('#paper').boundingBox();
    await swipe(mp, cdp, pb.x + pb.width * 0.8, pb.x + pb.width * 0.2, pb.y + pb.height / 2);
    assert.equal(await label(mp), '2쪽 · 그림 연습');
    await mp.locator('#noteFinger').click();
    await swipe(mp, cdp, pb.x + pb.width * 0.8, pb.x + pb.width * 0.2, pb.y + pb.height / 2);
    assert.equal(await label(mp), '3쪽 · 11월 월간');
    await swipe(mp, cdp, 80, 320);
    assert.equal(await label(mp), '2쪽 · 그림 연습');
    // 세로로 민 것은 넘기지 않음
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 240, y: 500 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mp.waitForTimeout(80);
    assert.equal(await label(mp), '2쪽 · 그림 연습');
    for (const h of ['#b/key', '#b/' + noteId, '#b/' + monthId, '#b/settings']) {
      await mp.evaluate(x => { location.hash = x; }, h); await mp.waitForTimeout(120);
      const sw = await mp.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(sw <= 391, h + ' 가로 스크롤 ' + sw);
    }
    await mp.evaluate(x => { location.hash = x; }, '#b/' + noteId); await mp.waitForTimeout(150);
    await mp.screenshot({ path: path.join(OUT, 'note-mobile.png') });
    await mp.evaluate(() => { location.hash = '#b/key'; }); await mp.waitForTimeout(120);
    await mp.screenshot({ path: path.join(OUT, 'key-mobile.png'), fullPage: true });
    ok('휴대폰: 손가락 스와이프로 넘기기(세로 밀기는 그대로), 노트는 ✋ 켜면 쓰기·끄면 넘기기, 가로 스크롤 없음');

    // 11. 어두운 모드에서도 기본 펜 색 = 글자색
    await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(80);
    const px = await p.locator('#inkCanvas').evaluate(c => { let best = 0; const d = c.getContext('2d').getImageData(0, Math.round(c.height * 0.48), c.width, Math.round(c.height * 0.04)).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) best = Math.max(best, d[i]); return best; });
    await p.screenshot({ path: path.join(OUT, 'note-dark.png') });
    assert.ok(px > 150, '어두운 모드 획 밝게 ' + px);
    ok('어두운 모드: 기본 펜 획이 밝은 색');

    assert.deepEqual(errors, []);
    ok('콘솔·페이지 오류 0');
  } finally {
    await b.close(); srv.close();
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
