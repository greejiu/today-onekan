// 2026-11-17 오늘한칸 v3 계정 연동(PC·휴대폰) 검증. 진짜 Supabase 대신 가짜 서버로
// bj_state + bj_save_state(rev 맞을 때만 저장, 아니면 null)를 흉내 낸다(supabase/migrations/20261117120000_bj_state.sql).
// 두 브라우저 문맥 A(PC)·B(휴대폰)가 같은 가짜 서버를 씀.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const ok = m => console.log('PASS ' + m);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// ---- 가짜 Supabase 서버(서버 jsonb처럼 키 순서를 바꿔 저장) ----
const USERS = { 'me@test.kr': { pw: 'pw1234', id: 'u-me' }, 'other@test.kr': { pw: 'pw5678', id: 'u-other' } };
const rows = new Map(); let fail = false; const calls = [];
const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().reverse().map(k => [k, sortKeys(v[k])])) : v;
function fake(name, body) {
  calls.push(name);
  if (name === 'login') { const u = USERS[body.email]; return u && u.pw === body.password ? { user: { id: u.id, email: body.email } } : { error: 'Invalid login credentials' }; }
  if (!body.uid) return { error: 'not signed in' };
  if (name === 'get') { const r = rows.get(body.uid); return { row: r ? { data: r.data, rev: r.rev } : null }; }
  if (name === 'save') {
    const r = rows.get(body.uid);
    if (body.rev === 0) { if (r) return { rev: null }; rows.set(body.uid, { data: sortKeys(body.data), rev: 1 }); return { rev: 1 }; }
    if (!r || r.rev !== body.rev) return { rev: null };
    r.data = sortKeys(body.data); r.rev += 1; return { rev: r.rev };
  }
}
const FAKE_LIB = `window.supabase = { createClient() {
  const KEY = 'sb-mmpsyajgyufdxmmnxqba-auth-token', subs = [];
  const sess = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const call = async (p, b) => { const r = await fetch('/fake/' + p, { method: 'POST', body: JSON.stringify(b) }); if (!r.ok) throw new Error('net ' + r.status); return r.json(); };
  return {
    auth: {
      async getSession() { return { data: { session: sess() } }; },
      onAuthStateChange(cb) { subs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      async signInWithPassword({ email, password }) {
        try { const r = await call('login', { email, password }); if (r.error) return { error: { message: r.error } };
          const s = { user: r.user }; localStorage.setItem(KEY, JSON.stringify(s)); subs.forEach(f => f('SIGNED_IN', s)); return { data: s, error: null };
        } catch (e) { return { error: { message: e.message } }; }
      },
      async signOut() { localStorage.removeItem(KEY); subs.forEach(f => f('SIGNED_OUT', null)); return { error: null }; },
    },
    from() { return { select() { return { async maybeSingle() { try { const r = await call('get', { uid: sess()?.user?.id }); if (r.error) throw new Error(r.error); return { data: r.row, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } } }; } }; },
    async rpc(fn, a) { try { const r = await call('save', { uid: sess()?.user?.id, data: a.p_data, rev: a.p_rev }); if (r.error) throw new Error(r.error); return { data: r.rev, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
  };
} };`;

function serve() {
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/fake/')) {
      let body = ''; req.on('data', c => body += c); req.on('end', () => {
        if (fail) { res.writeHead(503); return res.end(); }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(fake(req.url.slice(6), JSON.parse(body || '{}'))));
      });
      return;
    }
    let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

const titles = p => p.evaluate(() => bj.state.tasks.map(t => t.title).sort());
const status = p => p.evaluate(() => bjSync.status);
const waitSaved = p => p.waitForFunction(() => bjSync.status === 'saved', null, { timeout: 5000 });
const refocus = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const srvTitles = uid => (rows.get(uid)?.data.tasks || []).map(t => t.title).sort();

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/v3/`;
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  const open = async (opts) => {
    const ctx = await b.newContext({ timezoneId: 'Asia/Seoul', locale: 'ko-KR', ...opts });
    await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_LIB }));
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(base);
    await p.waitForFunction(() => window.bjSync && bjSync.status !== 'loading');
    return p;
  };
  const login = async (p, email, pw) => {
    await p.locator('#settingsBtn').click();
    await p.locator('#acctEmail').fill(email); await p.locator('#acctPw').fill(pw);
    await p.locator('#acctIn').click();
  };
  try {
    // 1. PC: 로그인 전엔 이 기기에만
    const A = await open({ viewport: { width: 1280, height: 900 } });
    assert.equal(await A.locator('#syncStatus').textContent(), '이 기기에만');
    await A.evaluate(() => bj.addPlan({ title: 'PC 체험 기록', period: BJStore.todayStr(), areaId: bj.areas().find(a => a.name === '독서').id }));
    assert.equal(await status(A), 'local');
    assert.match(await A.locator('#footSync').textContent(), /이 기기 브라우저에만/);
    ok('로그인 전: "이 기기에만", 기록은 이 기기에');

    // 2. 틀린 비밀번호 → 안내, 맞으면 체험판 기록을 계정으로
    await login(A, 'me@test.kr', 'wrong');
    await A.waitForFunction(() => document.querySelector('#acctMsg')?.textContent.includes('맞지 않아요'));
    await A.locator('#acctPw').fill('pw1234'); await A.locator('#acctIn').click();
    await waitSaved(A);
    assert.match(await A.locator('#acctBox').textContent(), /me@test\.kr/);
    await A.locator('#setDlg button[value=cancel]').click();
    assert.equal(await A.locator('#syncStatus').textContent(), '☁ 저장됨');
    assert.deepEqual(srvTitles('u-me'), ['PC 체험 기록']);
    assert.equal(rows.get('u-me').rev, 1);
    assert.equal(rows.get('u-me').data.areas.length, 6);
    ok('틀린 비밀번호 안내 → 로그인 → 체험판 기록을 계정으로 올림(rev 1), "☁ 저장됨"');

    // 3. 휴대폰: 따로 적은 체험판 기록 + 로그인 → 둘 다 합쳐짐(영역은 6개 그대로)
    const B = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await B.evaluate(() => bj.addPlan({ title: '폰 체험 기록', period: BJStore.todayStr(), areaId: bj.areas().find(a => a.name === '독서').id }));
    await login(B, 'me@test.kr', 'pw1234');
    await waitSaved(B);
    await B.locator('#setDlg button[value=cancel]').click();
    assert.deepEqual(await titles(B), ['PC 체험 기록', '폰 체험 기록']);
    assert.deepEqual(srvTitles('u-me'), ['PC 체험 기록', '폰 체험 기록']);
    const sb = rows.get('u-me').data;
    assert.equal(sb.areas.length, 6);
    const dok = sb.areas.find(a => a.name === '독서').id;
    assert.ok(sb.tasks.every(t => t.areaId === dok), '같은 이름 영역으로 합쳐짐');
    ok('휴대폰 로그인 → PC·폰 기록 합쳐짐, 같은 이름 영역은 하나(작업도 그 영역으로)');

    // 4. PC가 화면으로 돌아오면 휴대폰 기록을 받아옴
    await refocus(A);
    await A.waitForFunction(() => bj.state.tasks.some(t => t.title === '폰 체험 기록'));
    assert.equal(await A.locator('#untimedList .row-title', { hasText: '폰 체험 기록' }).count(), 1);
    ok('PC로 돌아오면 휴대폰에서 적은 기록이 보임');

    // 5. 동시에 고치기: PC 저장 뒤 휴대폰이 옛 rev로 저장 → 거절 → 받아 합쳐 다시 저장 → 둘 다 남음
    await A.evaluate(() => { const t = bj.state.tasks.find(x => x.title === 'PC 체험 기록'); bj.renameTask(t.id, 'PC에서 고침'); });
    await waitSaved(A);
    const revBefore = rows.get('u-me').rev;
    await B.evaluate(() => bj.addPlan({ title: '폰에서 추가', period: BJStore.todayStr() }));
    await waitSaved(B);
    assert.deepEqual(srvTitles('u-me'), ['PC에서 고침', '폰 체험 기록', '폰에서 추가']);
    assert.equal(rows.get('u-me').rev, revBefore + 1);
    assert.deepEqual(await titles(B), ['PC에서 고침', '폰 체험 기록', '폰에서 추가']);
    ok('동시에 고치기: 휴대폰 저장이 한 번 거절 → 받아 합쳐 저장, 두 기기 수정 모두 남음');

    // 6. 지우기·되돌리기가 다른 기기에도
    await B.evaluate(() => { const p = bj.state.plans.find(x => bj.task(x.taskId)?.title === '폰에서 추가'); bj.deletePlan(p.id); });
    await waitSaved(B);
    await refocus(A);
    await A.waitForFunction(() => !bj.state.tasks.some(t => t.title === '폰에서 추가'));
    await B.evaluate(() => bj.undo());
    await waitSaved(B);
    await refocus(A);
    await A.waitForFunction(() => bj.state.tasks.some(t => t.title === '폰에서 추가'));
    ok('휴대폰에서 지우면 PC에서도 사라지고, 실행 취소하면 PC에도 다시 생김');

    // 7. 인터넷 끊김 → "저장 안 됨", 다시 연결되면 저장
    fail = true;
    await A.evaluate(() => bj.addPlan({ title: '오프라인 중 적기', period: BJStore.todayStr() }));
    await A.waitForFunction(() => bjSync.status === 'error' || bjSync.status === 'offline');
    assert.match(await A.locator('#syncStatus').textContent(), /저장 안 됨|오프라인/);
    assert.ok(await A.evaluate(() => bj.state.tasks.some(t => t.title === '오프라인 중 적기')));
    fail = false;
    await A.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitSaved(A);
    assert.ok(srvTitles('u-me').includes('오프라인 중 적기'));
    ok('연결 끊김 → 이 기기엔 남고 "저장 안 됨" → 다시 연결되면 저장');

    // 8. 저장 상태 버튼 누르기 = 바로 맞추기, 설정은 다른 기기로
    await B.evaluate(() => bj.saveSettings({ strikeDone: false }));
    await waitSaved(B);
    await A.locator('#syncStatus').click();
    await A.waitForFunction(() => bj.strikeDone() === false);
    ok('설정(줄긋기 끄기)도 다른 기기로, 저장 상태 버튼 = 바로 맞추기');

    // 9. 로그아웃 → 이 기기 기록 지움(계정엔 남음) → 다른 계정으로는 안 보임 → 다시 로그인하면 돌아옴
    await A.locator('#settingsBtn').click();
    await A.locator('#acctOut').click();
    await A.waitForFunction(() => bjSync.status === 'local' && bj.state.tasks.length === 0);
    assert.ok(srvTitles('u-me').length >= 3);
    await A.locator('#acctEmail').fill('other@test.kr'); await A.locator('#acctPw').fill('pw5678'); await A.locator('#acctIn').click();
    await waitSaved(A);
    assert.deepEqual(await titles(A), []);
    assert.deepEqual(srvTitles('u-other'), []);
    await A.locator('#acctOut').click();
    await A.waitForFunction(() => bjSync.status === 'local');
    await A.locator('#acctEmail').fill('me@test.kr'); await A.locator('#acctPw').fill('pw1234'); await A.locator('#acctIn').click();
    await waitSaved(A);
    assert.ok((await titles(A)).includes('PC에서 고침'));
    assert.equal((await A.evaluate(() => bj.areas().length)), 6);
    await A.locator('#setDlg button[value=cancel]').click();
    ok('로그아웃 → 이 기기 기록 지움 → 다른 계정엔 안 보임 → 다시 로그인하면 돌아옴(영역 6개 그대로)');

    // 10. 새로고침해도 로그인 유지 + 기록 그대로
    await A.reload();
    await A.waitForFunction(() => window.bjSync && bjSync.status === 'saved');
    assert.ok((await titles(A)).includes('폰 체험 기록'));
    ok('새로고침해도 로그인·기록 유지');

    // 11. 로그인 상태에서 "처음부터 다시" → 다른 기기에서도 비워짐
    await A.locator('#resetBtn').click();
    await waitSaved(A);
    await refocus(B);
    await B.waitForFunction(() => bj.state.tasks.length === 0);
    ok('로그인 상태 "처음부터 다시" → 휴대폰도 비워짐');

    // 12. 라이브러리를 못 불러오면 이 기기에만(앱은 그대로 동작)
    const ctx3 = await b.newContext({ timezoneId: 'Asia/Seoul' });
    await ctx3.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    const C = await ctx3.newPage();
    C.on('pageerror', e => errors.push(e.message));
    await C.goto(base);
    await C.waitForFunction(() => window.bjSync && bjSync.status === 'local');
    await C.evaluate(() => bj.addPlan({ title: '로컬만', period: BJStore.todayStr() }));
    assert.equal(await C.locator('#untimedList .row-title', { hasText: '로컬만' }).count(), 1);
    ok('연동 라이브러리를 못 불러와도 "이 기기에만"으로 그대로 씀');

    const sw = await B.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'mobile scrollWidth ' + sw);
    assert.deepEqual(errors.filter(e => !/net 503|503 \(Service Unavailable\)/.test(e)), []);
    ok('휴대폰 가로 스크롤 없음, 오류 0(일부러 끊은 503 제외)');
  } finally { await b.close(); srv.close(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
