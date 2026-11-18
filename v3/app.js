/* 오늘한칸 v3 — 오늘(오늘 + 타임라인 + 지금) · 주간(이번 주 목록 + 7일) · 월간(하루 3줄 = 오전·오후·저녁). docs/v3_설계.md */
(function () {
  'use strict';
  const { createStore, addDays, weekStart, todayStr, parseDate } = BJStore;
  const { hhmm } = BJTimeline;
  let storage = null; try { storage = window.localStorage; } catch (e) { /* 개인 창 등 */ }
  const store = createStore(storage);
  window.bj = store; // 테스트·디버그용
  // 계정 연동(PC·휴대폰). 로그인 안 하면 이 기기에만
  const SYNC_TEXT = { loading: '…', local: '이 기기에만', saving: '저장 중…', saved: '☁ 저장됨', offline: '오프라인', error: '저장 안 됨' };
  const sync = BJSync.createSync(store, { storage, onChange: s => renderSync(s) });
  window.bjSync = sync;
  function renderSync(s) {
    const pill = document.getElementById('syncStatus'); if (!pill) return;
    pill.dataset.s = s.status; pill.textContent = SYNC_TEXT[s.status] || '';
    pill.title = s.signedIn ? `${s.email} 계정에 저장` : '로그인하면 PC·휴대폰에 같이 저장돼요';
    const foot = document.getElementById('footSync');
    if (foot) foot.innerHTML = s.signedIn ? '계정에 저장돼 <b>PC·휴대폰에서 같이</b> 보여요.' : '로그인하지 않으면 <b>이 기기 브라우저에만</b> 저장돼요.';
    if (document.getElementById('setDlg')?.open) renderAccount();
  }
  // 설정 창의 계정 칸
  function renderAccount() {
    const box = document.getElementById('acctBox');
    if (sync.signedIn) {
      box.innerHTML = `<p class="acct-who"><b></b> 로 로그인했어요. 기록이 PC·휴대폰에 같이 저장돼요.</p><p class="dlg-sub">상태: ${SYNC_TEXT[sync.status]}</p><button type="button" id="acctOut" class="link-btn">로그아웃</button><p id="acctMsg" class="acct-msg" role="alert"></p>`;
      box.querySelector('.acct-who b').textContent = sync.email;
      box.querySelector('#acctOut').onclick = async () => {
        if (!confirm('로그아웃할까요? 이 기기의 기록은 지워지고, 기록은 계정에 남아요.')) return;
        const msg = await sync.signOut();
        if (msg) box.querySelector('#acctMsg').textContent = msg;
      };
    } else {
      box.innerHTML = `<p class="dlg-sub">기존 오늘한칸과 같은 계정이에요. 로그인하면 PC·휴대폰에 같이 저장되고, 지금 이 기기 기록도 계정으로 옮겨요.</p>
        <div class="acct-form"><input id="acctEmail" type="email" autocomplete="username" placeholder="이메일" aria-label="이메일" />
        <input id="acctPw" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호" />
        <button type="button" id="acctIn" class="primary-btn">로그인</button></div>
        <p class="dlg-sub">계정 만들기는 <a href="../">기존 오늘한칸</a>에서 해요.</p><p id="acctMsg" class="acct-msg" role="alert"></p>`;
      const go = async () => {
        const btn = box.querySelector('#acctIn'), msgEl = box.querySelector('#acctMsg');
        const email = box.querySelector('#acctEmail').value.trim(), pw = box.querySelector('#acctPw').value;
        if (!email || !pw) { msgEl.textContent = '이메일과 비밀번호를 적어 주세요.'; return; }
        btn.disabled = true; msgEl.textContent = '로그인 중…';
        const msg = await sync.signIn(email, pw);
        btn.disabled = false; if (!msg) msgEl.textContent = ''; else msgEl.textContent = msg;
      };
      box.querySelector('#acctIn').onclick = go;
      box.querySelector('#acctPw').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } };
    }
  }

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nowMinute = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const KIND_LABEL = { task: '할일', event: '일정', note: '메모' };
  const kindSym = k => store.symbols()[k];
  // 완료면 완료 기호(비우면 원래 기호), 옮김이면 옮김 기호
  const symOf = v => v.migrated ? store.symbols().migrated : v.done && v.t.kind !== 'note' ? (store.symbols().done || kindSym(v.t.kind)) : kindSym(v.t.kind);

  let today = todayStr();
  let selDate = today;
  let tl = null; // 지금 그린 타임라인
  // 휴대폰 폭이면 월간을 주 묶음 목록 + 7열 달력으로(PC는 8열)
  const narrowMq = window.matchMedia('(max-width: 760px)');
  narrowMq.addEventListener?.('change', () => { if (mode === 'month') render(); });
  const modeOf = () => (location.hash === '#week' ? 'week' : location.hash === '#month' ? 'month' : 'today');
  const SLOT_LABEL = { am: '오전', pm: '오후', eve: '저녁' };
  const SLOT_HINT = { am: '12시 전', pm: '12~18시', eve: '18시 이후' };
  const addMonths = (d, n) => { const x = parseDate(d), day = x.getDate(); const y = new Date(x.getFullYear(), x.getMonth() + n, 1); y.setDate(Math.min(day, new Date(y.getFullYear(), y.getMonth() + 1, 0).getDate())); return BJStore.dateStr(y); };
  let mode = modeOf();

  /* ---------- 보기 모델 ---------- */
  function view(p) {
    const t = store.task(p.taskId) || { title: '(지워진 작업)', kind: 'task', status: 'open' };
    const a = t.areaId ? store.area(t.areaId) : null;
    // 목표(월간·주간 줄)와 할 일(날짜 줄, 목표에 연결 가능)을 나눔(결 2026-11-18). 할 일 아래 작은 글씨 = 연결된 목표
    const g = t.goalId ? store.task(t.goalId) : null;
    const isGoalRow = p.level === 'month' || p.level === 'week';
    // 영역 이름은 글자로 안 쓰고 색으로만 표시(결 요청 2026-11-15). 화면 읽기용으로만 영역 이름을 넣음
    const meta = g ? '◎ ' + g.title : '';
    const areaSr = `<span class="sr-only">${a ? esc(a.name) : '기본'}</span>`;
    return { p, t, a, g, isGoalRow, meta, areaSr, color: a ? a.color : '', done: isGoalRow ? t.status === 'done' : p.status === 'done', migrated: p.status === 'migrated' };
  }
  function bulletHtml(v) {
    const { p, t } = v;
    if (v.migrated) return `<span class="bullet s-migrated" title="옮김" aria-label="옮김">${esc(symOf(v))}</span>`;
    if (t.kind === 'note') return `<span class="bullet k-note" aria-label="메모">${esc(symOf(v))}</span>`;
    if (v.isGoalRow) return `<button type="button" class="bullet k-${t.kind}${v.done ? ' s-done' : ''}" data-goal="${t.id}" role="checkbox" aria-checked="${v.done}" aria-label="${esc(t.title)} 목표 달성">${esc(symOf(v))}</button>`;
    return `<button type="button" class="bullet k-${t.kind}${v.done ? ' s-done' : ''}" data-toggle="${p.id}" role="checkbox" aria-checked="${v.done}" aria-label="${esc(t.title)} ${{ week: '이번 주 몫', month: '이번 달 몫' }[p.level] || '오늘 몫'} 완료">${esc(symOf(v))}</button>`;
  }
  const clsOf = v => `k-${v.t.kind} s-${v.p.status}${v.t.status === 'done' ? ' task-done' : ''}${v.a ? '' : ' no-area'}${v.isGoalRow ? ' is-goal' : ''}`;
  // 목표 진행: 연결된 할 일 중 끝낸 것(작업 완료 또는 한 번이라도 그날 몫 체크) / 전체
  function goalProgress(goalId) {
    const steps = store.stepsOf(goalId);
    const done = steps.filter(s => s.status === 'done' || store.plansOfTask(s.id).some(p => p.level === 'day' && p.status === 'done')).length;
    return { n: steps.length, done };
  }
  const progTag = goalId => { const { n, done } = goalProgress(goalId); return n ? `<span class="tag prog${done === n ? ' tag-done' : ''}">할 일 ${done}/${n}</span>` : ''; };
  // 목표의 할 일이 그 날들 중 언제 놓였는지(✓ = 그날 다 함)
  const stepDayTags = (goalId, days) => days.map(d => {
    const ps = store.stepsOf(goalId).map(s => store.livePlanOn(s.id, 'day', d)).filter(Boolean); if (!ps.length) return '';
    const dn = ps.every(x => x.status === 'done');
    return `<span class="tag${dn ? ' tag-done' : ''}">${DOW[parseDate(d).getDay()]}${dn ? '✓' : ''}</span>`;
  }).join('');
  const styleOf = v => v.color ? `--c:${v.color};` : '';

  /* "#독서 1장 읽기" → 독서 영역 */
  function parseTitle(raw) {
    let areaId = null;
    const title = String(raw).replace(/(^|\s)#(\S+)/g, (m, sp, name) => {
      const list = store.areas();
      const a = list.find(x => x.name === name || x.name.split('(')[0] === name) || (list.filter(x => x.name.startsWith(name)).length === 1 ? list.find(x => x.name.startsWith(name)) : null);
      if (a && !areaId) { areaId = a.id; return sp; }
      return m;
    }).replace(/\s+/g, ' ').trim();
    return { title, areaId };
  }

  /* ---------- 그리기 ---------- */
  function render() {
    document.body.classList.toggle('strike-done', store.strikeDone());
    mode = modeOf();
    $('todayView').hidden = mode !== 'today';
    $('weekView').hidden = mode !== 'week';
    $('monthView').hidden = mode !== 'month';
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + mode ? 'page' : 'false'));
    $('todayBtn').textContent = { today: '오늘', week: '이번 주', month: '이번 달' }[mode];
    $('prevDay').setAttribute('aria-label', { today: '전날', week: '지난 주', month: '지난 달' }[mode]);
    $('nextDay').setAttribute('aria-label', { today: '다음날', week: '다음 주', month: '다음 달' }[mode]);
    if (mode === 'week') { tl = null; renderWeekView(); return; }
    if (mode === 'month') { tl = null; renderMonthView(); return; }
    renderHeader();
    renderNow();
    renderUntimed();
    renderTimeline();
    renderWeek();
  }

  function renderLegend() {
    $('legend').innerHTML = store.areas().map(a => `<li style="--c:${a.color}">${esc(a.name)}</li>`).join('') + `<li class="no-area">기본</li>`;
  }

  function renderHeader() {
    renderLegend();
    const d = parseDate(selDate);
    $('dayTitle').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
    $('dayBadge').hidden = selDate !== today;
    $('todayBtn').disabled = selDate === today;
    const plans = store.plansOn('day', selDate).filter(p => p.status !== 'migrated' && store.task(p.taskId)?.kind !== 'note');
    const done = plans.filter(p => p.status === 'done').length;
    const prog = $('progress');
    prog.textContent = plans.length ? `${done} / ${plans.length} 했어요` : '';
    prog.style.setProperty('--pct', plans.length ? (done / plans.length * 100) + '%' : '0%');
    prog.hidden = !plans.length;
  }

  function renderNow() {
    const el = $('now');
    if (selDate !== today) { el.hidden = true; return; }
    el.hidden = false;
    const m = nowMinute();
    const { current, next } = store.nowPlan(today, m);
    if (current) {
      const v = view(current);
      const left = current.start + current.duration - m;
      el.className = 'now-card has-now' + (v.done || v.t.status === 'done' ? ' is-done' : '');
      el.setAttribute('style', styleOf(v));
      el.innerHTML = `<div class="now-label">▶ 지금</div>
        <div class="now-main">${bulletHtml(v)}<span class="now-title">${esc(v.t.title)}</span></div>
        <div class="now-sub">${hhmm(current.start)}–${hhmm(current.start + current.duration)} · ${v.done ? '오늘 몫 완료 🎉' : left + '분 남음'}${v.meta ? ' · ' + esc(v.meta) : ''}${v.a ? ` <span class="area-chip">${esc(v.a.name)}</span>` : ''}</div>`;
    } else {
      el.className = 'now-card';
      el.removeAttribute('style');
      el.innerHTML = `<div class="now-label">▶ 지금</div><div class="now-empty">지금 놓인 작업이 없어요.${next ? ` 다음: <b>${hhmm(next.start)}</b> ${esc(store.task(next.taskId)?.title)}` : ' 타임라인 빈 곳을 눌러 지금 할 일을 적어 보세요.'}</div>`;
    }
  }

  function rowHtml(v, extra = '', showTime = false) {
    return `<li class="row ${clsOf(v)}" data-plan="${v.p.id}" style="${styleOf(v)}">
      ${bulletHtml(v)}
      <span class="row-body"><span class="row-title">${showTime && v.p.start != null ? `<span class="row-time">${hhmm(v.p.start)}</span>` : showTime === true && v.p.slot && !v.migrated ? `<span class="row-time row-slot">${SLOT_LABEL[v.p.slot]}</span>` : ''}${esc(v.t.title)}</span>${v.areaSr}${v.meta || (v.t.status === 'done' && !v.isGoalRow) ? `<small class="row-meta">${[v.t.status === 'done' && !v.isGoalRow ? '작업 완료 ✓' : '', esc(v.meta)].filter(Boolean).join(' · ')}</small>` : ''}</span>
      ${extra}
      <button type="button" class="more" data-more="${v.p.id}" aria-label="${esc(v.t.title)} 메뉴">⋯</button>
    </li>`;
  }

  function renderUntimed() {
    const list = store.plansOn('day', selDate).filter(p => p.start == null);
    $('untimedList').innerHTML = list.map(p => rowHtml(view(p), '', true)).join('') || `<li class="empty">시간을 안 정한 일을 여기에 적어요</li>`;
    $('untimedList').querySelectorAll('.row').forEach(wireRow('day'));
    const y = store.plansOn('day', addDays(selDate, -1)).filter(p => p.status !== 'migrated');
    $('importBtn').textContent = `어제 계획 가져오기${y.length ? ` (${y.length})` : ''}`;
  }

  function renderTimeline() {
    const items = store.plansOn('day', selDate).filter(p => p.start != null).map(p => {
      const v = view(p);
      return { id: p.id, start: p.start, duration: p.duration, title: v.t.title, meta: v.meta, sr: v.a ? v.a.name : '기본', lead: bulletHtml(v), cls: clsOf(v), style: styleOf(v) };
    });
    const s = store.state.settings;
    tl = BJTimeline.render($('timeline'), items, {
      min: s.dayStart, max: s.dayEnd,
      onTap: (id, el) => inlineRename(id, el.querySelector('.tl-title')),
      onMoveStart: (id, e, grab, el) => startDrag(id, e, 'timeline', grab, el),
      onResize: (id, start, duration) => { store.setPlanTime(id, start, duration); undoToast(`${hhmm(start)}–${hhmm(start + duration)}로 바꿨어요`); },
      onCreate: (start, duration, kind, raw) => {
        const { title, areaId } = parseTitle(raw);
        if (store.addPlan({ title, kind, period: selDate, start, duration, areaId })) undoToast('적었어요');
      },
      kindMenu,
    });
    positionNowLine();
  }

  function positionNowLine() {
    if (!tl) return;
    let line = tl.content.querySelector('.tl-now');
    const m = nowMinute();
    if (selDate !== today || m < tl.minM || m > tl.maxM) { line?.remove(); return; }
    if (!line) { line = document.createElement('div'); line.className = 'tl-now'; line.setAttribute('aria-hidden', 'true'); tl.content.appendChild(line); }
    line.style.top = tl.topOf(m) + 'px';
  }

  // 오늘 화면 옆 목록: [이번 주 | 이번 달] 탭(결 2026-11-18). 고른 탭은 이 기기에 기억
  let panel = 'week';
  try { if (localStorage.getItem('bj.v3.panel') === 'month') panel = 'month'; } catch (e) { /* */ }
  function renderWeek() {
    const ws = weekStart(selDate), we = addDays(ws, 6), ms = monthStart(selDate);
    const thisWeek = ws === weekStart(today), thisMonth = ms === monthStart(today);
    const f = s => { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
    const mName = `${parseDate(ms).getMonth() + 1}월`;
    document.querySelectorAll('#panelTabs [data-panel]').forEach(b => { b.setAttribute('aria-selected', b.dataset.panel === panel); b.textContent = (b.dataset.panel === 'month' ? (thisMonth ? '이번 달' : mName) : (thisWeek ? '이번 주' : '이 주')) + ' 목표'; });
    $('weekTitle').textContent = panel === 'month' ? `${mName} 목표` : thisWeek ? '이번 주 목표' : '이 주 목표';
    $('weekRange').textContent = panel === 'month' ? mName : `${f(ws)} – ${f(we)}`;
    $('weekAdd').querySelector('input').placeholder = panel === 'month' ? `+ ${thisMonth ? '이번 달' : mName} 목표 적기` : `+ ${thisWeek ? '이번 주' : '이 주'} 목표 적기`;
    const dayLabel = selDate === today ? '오늘' : f(selDate);
    const list = panel === 'month' ? store.plansOn('month', ms).filter(p => p.status !== 'migrated') : store.plansOn('week', ws);
    // 목표를 누르면(할 일 ▾) 연결된 할 일 + 바로 적기. 할 일은 [오늘로]·끌기, 목표를 통째로 끌면 같은 이름의 할 일이 생김
    $('weekList').innerHTML = list.map(p => {
      const v = view(p), open = openGoals.has(v.t.id);
      const extra = `${progTag(v.t.id)}<button type="button" class="pull" data-expand="${v.t.id}" aria-expanded="${open}">할 일 ${open ? '▴' : '▾'}</button>`;
      let html = rowHtml(v, extra);
      if (open) {
        const steps = store.stepsOf(v.t.id).map(s => {
          const ps = store.plansOfTask(s.id).filter(x => x.level === 'day' && x.status !== 'migrated');
          return ps.find(x => x.period === selDate) || ps.sort((a, b) => (a.period < b.period ? 1 : -1))[0];
        }).filter(Boolean);
        const stepDone = sp => store.task(sp.taskId).status === 'done' || sp.status === 'done';
        steps.sort((a, b) => stepDone(a) - stepDone(b) || (a.period < b.period ? 1 : -1)); // 끝낸 할 일은 아래로
        html += `<li class="goal-steps"><ul class="rows">${steps.map(sp => {
          const sv = view(sp), onDay = sp.period === selDate;
          const ex = onDay ? `<span class="tag${sp.status === 'done' ? ' tag-done' : ''}">${dayLabel}${sp.status === 'done' ? ' ✓' : '에 있음'}</span>`
            : `<span class="tag${stepDone(sp) ? ' tag-done' : ''}">${parseDate(sp.period).getMonth() + 1}/${parseDate(sp.period).getDate()}${sp.status === 'done' ? '✓' : ''}</span>${stepDone(sp) ? '' : `<button type="button" class="pull" data-pull="${sp.id}">${dayLabel}로</button>`}`;
          return rowHtml(sv, ex);
        }).join('')}</ul>
          <form class="add-form mini" data-add-step="${v.t.id}" autocomplete="off"><input type="text" enterkeyhint="done" placeholder="+ ${dayLabel} 할 일 (이 목표)" aria-label="${esc(v.t.title)} 목표에 ${dayLabel} 할 일 적기" /></form></li>`;
      }
      return html;
    }).join('') || `<li class="empty">${panel === 'month' ? '[월간]에서 이번 달 목표를 적어 두면 여기서 할 일로 나눠 오늘로 가져와요' : '이번 주 목표를 적어 두고, 오늘 할 일로 나눠 가져오세요'}</li>`;
    $('weekList').querySelectorAll(':scope > .row').forEach(wireRow('goal'));
    $('weekList').querySelectorAll('.goal-steps .row').forEach(wireRow('week'));
  }
  const openGoals = new Set();
  document.addEventListener('click', e => {
    const b = e.target.closest('#panelTabs [data-panel]'); if (!b) return;
    panel = b.dataset.panel; try { localStorage.setItem('bj.v3.panel', panel); } catch (err) { /* */ }
    renderWeek();
  });

  /* ---------- 줄 손짓: 짧게 = 이름 수정, 끌기 = 옮기기 ---------- */
  const wireRow = from => li => {
    BJGesture.press(li, {
      tap: e => { if (e.target.closest('.row-title')) inlineRename(li.dataset.plan, li.querySelector('.row-title')); },
      drag: (e, kind, st) => startDrag(li.dataset.plan, e, from, 0, li),
    });
  };

  function inlineRename(planId, titleEl) {
    const p = store.plan(planId), t = p && store.task(p.taskId);
    if (!t || !titleEl) return;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'rename-input'; input.value = t.title; input.setAttribute('aria-label', '이름 바꾸기');
    titleEl.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const close = commit => {
      if (done) return; done = true;
      const v = input.value.trim();
      if (commit && v && v !== t.title) store.renameTask(t.id, v); else render();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); close(true); } else if (e.key === 'Escape') close(false); });
    input.addEventListener('blur', () => close(true));
    input.addEventListener('pointerdown', e => e.stopPropagation());
  }

  /* ---------- 끌어 옮기기 (타임라인·시간 없음·이번 주) ---------- */
  function startDrag(planId, e0, from, grab, srcEl) {
    const p = store.plan(planId); if (!p) return;
    const t = store.task(p.taskId);
    if (p.status === 'migrated') { toast('옮긴 계획은 움직일 수 없어요'); return; }
    const dur = p.start != null ? p.duration : 30;
    srcEl.classList.add('drag-src');
    const ghost = document.createElement('div');
    ghost.className = 'ghost'; ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = `<span class="ghost-title"></span><span class="ghost-where"></span>`;
    ghost.querySelector('.ghost-title').textContent = t.title;
    document.body.appendChild(ghost);
    const dropBox = document.createElement('div'); dropBox.className = 'tl-drop';
    let target = null;

    const where = ev => {
      ghost.style.display = 'none';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      ghost.style.display = '';
      if (!el) return null;
      if (el.closest('.tl-grid') && tl) {
        let m = tl.minuteAt(ev.clientY) - (from === 'timeline' ? grab : 0);
        m = from === 'timeline' ? Math.round(m / 30) * 30 : Math.floor(m / 30) * 30;
        m = Math.max(0, Math.min(1440 - dur, m));
        return { type: 'time', start: m, duration: dur };
      }
      const sz = el.closest('[data-drop-slot]');
      if (sz && from !== 'week' && from !== 'goal') return { type: 'slot', slot: sz.dataset.dropSlot || null, date: sz.dataset.day, el: sz };
      const wz = el.closest('[data-drop-week]');
      if (from === 'goal' && p.level === 'month' && wz) return { type: 'week', el: wz, period: wz.dataset.dropWeek };
      const dz = el.closest('[data-drop-day]');
      if (dz) return { type: 'day', date: dz.dataset.dropDay, el: dz };
      if (el.closest('#untimedZone')) return { type: 'untimed' };
      return null;
    };
    let lastDz = null;
    const show = ev => {
      target = where(ev);
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
      $('untimedZone').classList.toggle('drop-on', target?.type === 'untimed');
      if (lastDz && lastDz !== target?.el) lastDz.classList.remove('drop-on');
      lastDz = target?.el || null; lastDz?.classList.add('drop-on');
      const label = !target ? '여기엔 놓을 수 없어요' : target.type === 'untimed' ? '→ 시간 없음' : target.type === 'day' ? `→ ${dayName(target.date)}` : target.type === 'week' ? `→ ${weekNo(target.period, monthStart(selDate))}주` : target.type === 'slot' ? `→ ${target.slot ? SLOT_LABEL[target.slot] : '구간 없음'}` : `→ ${hhmm(target.start)}–${hhmm(target.start + target.duration)}`;
      ghost.querySelector('.ghost-where').textContent = label;
      ghost.classList.toggle('no-drop', !target);
      if (target?.type === 'time') {
        if (!dropBox.isConnected) tl.content.appendChild(dropBox);
        dropBox.style.top = tl.topOf(target.start) + 'px';
        dropBox.style.height = Math.max(24, target.duration / 15 * 9) + 'px';
        dropBox.dataset.label = label.slice(2);
      } else dropBox.remove();
    };
    show(e0);
    BJGesture.follow(show, (ev, cancelled) => {
      ghost.remove(); dropBox.remove(); srcEl.classList.remove('drag-src'); $('untimedZone').classList.remove('drop-on'); lastDz?.classList.remove('drop-on');
      if (cancelled || !target) return;
      if (target.type === 'slot') {
        if (target.date !== p.period) moveTo(planId, target.date);
        if (p.start == null && (p.slot || null) === target.slot) return;
        const wasTimed = p.start != null; // 저장하면 p가 바뀌므로 먼저 기억
        store.setPlanSlot(planId, target.slot);
        undoToast(`${target.slot ? SLOT_LABEL[target.slot] : '구간 없음'}으로 옮겼어요${wasTimed ? ' (시간은 뺐어요)' : ''}`);
        return;
      }
      // 목표를 날짜·타임라인·시간 없음에 놓으면 = 그 목표의 할 일(같은 이름)을 그날에. 이번 달 목표를 주에 놓으면 = 그 주 목표
      if (from === 'goal') {
        if (target.type === 'week') { pullToWeek(p, target.period); return; }
        const date = target.type === 'day' ? target.date : selDate;
        addStep(t, date, target.type === 'time' ? { start: target.start, duration: 30 } : {});
        return;
      }
      if (target.type === 'day') {
        if (from === 'week') {
          if (store.livePlanOn(p.taskId, 'day', target.date)) { toast(`이미 ${dayName(target.date)}에 있어요`); return; }
          store.placeTask(p.taskId, { period: target.date });
          undoToast(`${dayName(target.date)}에 놓았어요`);
        } else if (target.date !== p.period) moveTo(planId, target.date);
        return;
      }
      if (from === 'week') {
        if (target.type === 'time') store.placeTask(p.taskId, { period: selDate, start: target.start, duration: 30 });
        else store.placeTask(p.taskId, { period: selDate });
        undoToast(`${selDate === today ? '오늘' : '그날'}로 가져왔어요`);
        return;
      }
      if (target.type === 'time') {
        if (target.start === p.start && target.duration === p.duration) return;
        store.setPlanTime(planId, target.start, target.duration);
        undoToast(`${hhmm(target.start)}로 옮겼어요`);
      } else if (p.start != null) {
        store.setPlanTime(planId, null);
        undoToast('시간을 뺐어요');
      }
    });
  }

  /* ---------- 클릭 (체크·메뉴·가져오기) ---------- */
  document.addEventListener('click', e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) { onToggle(tg.dataset.toggle); return; }
    const gl = e.target.closest('[data-goal]');
    if (gl) { // 목표 달성은 직접 체크(결 2026-11-18)
      const t = store.task(gl.dataset.goal); if (!t) return;
      const done = t.status !== 'done';
      store.setTaskStatus(t.id, done ? 'done' : 'open');
      const { n, done: d } = goalProgress(t.id);
      if (done) toast(`목표 달성! 🎉 『${t.title}』${n ? ` (할 일 ${d}/${n})` : ''}`, [{ label: '실행 취소', fn: () => store.undo() }]); else undoToast('목표를 다시 열었어요');
      return;
    }
    const ex = e.target.closest('[data-expand]');
    if (ex) { const id = ex.dataset.expand; openGoals.has(id) ? openGoals.delete(id) : openGoals.add(id); renderWeek(); return; }
    const mo = e.target.closest('[data-more]');
    if (mo) { openMenu(mo.dataset.more, mo); return; }
    const pu = e.target.closest('[data-pull]');
    if (pu) { const p = store.plan(pu.dataset.pull); if (p) { store.placeTask(p.taskId, { period: selDate }); undoToast(`${selDate === today ? '오늘' : '그날'}로 가져왔어요`); } }
  });

  function onToggle(planId) {
    const p = store.plan(planId); if (!p) return;
    const status = store.togglePlan(planId);
    if (status !== 'done') { undoToast('체크를 풀었어요'); return; }
    const t = store.task(p.taskId);
    const otherOpenDay = store.plansOfTask(t.id).some(x => x.id !== p.id && x.level === 'day' && x.status === 'open');
    const dayPlans = store.plansOn('day', p.period).filter(x => x.status !== 'migrated' && store.task(x.taskId)?.kind !== 'note');
    const n = dayPlans.filter(x => x.status === 'done').length;
    const dn = p.period === today ? '오늘' : dayName(p.period);
    const msg = p.level === 'day' ? `${dn} 몫 완료! ${n === dayPlans.length ? `${dn} 계획을 다 했어요 🎉` : `(${n}/${dayPlans.length})`}` : p.level === 'month' ? '이번 달 몫 완료!' : '이번 주 몫 완료!';
    const actions = [{ label: '실행 취소', fn: () => store.undo() }];
    if (t.status !== 'done' && !otherOpenDay) actions.unshift({ label: '작업도 끝났어요', fn: () => { store.setTaskStatus(t.id, 'done'); toast(`『${t.title}』 작업 완료 ✓`); } });
    toast(msg, actions);
  }

  /* ---------- 메뉴 ---------- */
  const menu = $('menu');
  function closeMenu() { menu.hidden = true; menu.innerHTML = ''; }
  function placeMenu(x, y) {
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    menu.querySelector('button')?.focus();
  }
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-more]')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) closeMenu(); });

  function openMenu(planId, anchor) {
    const v = view(store.plan(planId)); const { p, t } = v;
    const items = [];
    items.push(['이름 바꾸기', () => {
      const host = document.querySelector(`[data-plan="${p.id}"] .row-title, [data-plan="${p.id}"] .tl-title`);
      inlineRename(p.id, host);
    }]);
    items.push([v.isGoalRow ? '영역 정하기…' : '영역 · 목표 정하기…', () => openAssign(t.id)]);
    if (p.start != null) items.push(['시간 빼기', () => { store.setPlanTime(p.id, null); undoToast('시간을 뺐어요'); }]);
    if (p.status === 'open' && p.level === 'day') {
      if (p.period !== today) items.push(['오늘로 옮기기', () => moveTo(p.id, today)]);
      items.push([`내일로 옮기기${p.period <= today ? '  >' : ''}`, () => moveTo(p.id, addDays(p.period, 1))]);
      items.push(['날짜 고르기…', () => openDatePick(p.id)]);
    }
    if (p.status === 'open' && p.level === 'week') items.push([`다음 주로 옮기기${p.period <= weekStart(today) ? '  >' : ''}`, () => moveTo(p.id, addDays(p.period, 7))]);
    if (p.status === 'open' && p.level === 'month') items.push([`다음 달로 옮기기${p.period <= monthStart(today) ? '  >' : ''}`, () => moveTo(p.id, addMonths(p.period, 1))]);
    if (p.status === 'migrated') items.push([p.level === 'month' ? '다시 이 달로 되돌리기' : p.level === 'week' ? '다시 이 주로 되돌리기' : p.period === today ? '다시 오늘로 되돌리기' : '다시 이 날로 되돌리기', () => {
      const r = store.restorePlan(p.id);
      if (r === 'done') toast('옮겨 간 날에 이미 체크해서 되돌릴 수 없어요. 그 날 계획을 먼저 풀어 주세요.');
      else if (r) undoToast('되돌렸어요');
    }]);
    const noun = v.isGoalRow ? '목표' : '작업';
    items.push(t.status === 'done' ? [`${noun} 다시 열기`, () => { store.setTaskStatus(t.id, 'open'); undoToast(`${noun}를 다시 열었어요`); }]
      : [v.isGoalRow ? '목표 달성 ✓' : '작업 완료 ✓', () => { store.setTaskStatus(t.id, 'done'); undoToast(`『${t.title}』 ${v.isGoalRow ? '목표 달성 🎉' : '작업 완료 ✓'}`); }]);
    items.push(['계획 지우기', () => { store.deletePlan(p.id); undoToast('지웠어요'); }, 'danger']);
    menu.innerHTML = `<div class="menu-head">${esc(t.title)}</div>`
      + `<div class="menu-kinds" role="group" aria-label="종류">${Object.keys(KIND_LABEL).map(k => `<button type="button" data-kind="${k}" aria-pressed="${t.kind === k}">${esc(kindSym(k))} ${KIND_LABEL[k]}</button>`).join('')}</div>`
      + (p.level === 'month' && p.status === 'open' ? (() => { const f = monthStart(p.period), l = BJStore.dateStr(new Date(parseDate(f).getFullYear(), parseDate(f).getMonth() + 1, 0)); const ws = []; for (let w = weekStart(f); w <= l; w = addDays(w, 7)) ws.push(w);
          return `<div class="menu-kinds" role="group" aria-label="주에 놓기"><span class="menu-lab">주에 놓기</span>${ws.map(w => `<button type="button" data-week="${w}" aria-pressed="${!!store.livePlanOn(t.id, 'week', w)}">${weekNo(w, f)}주</button>`).join('')}</div>`; })() : '')
      + (p.level === 'day' && p.start == null && p.status !== 'migrated' ? `<div class="menu-kinds" role="group" aria-label="구간">${['am', 'pm', 'eve', ''].map(k => `<button type="button" data-slot="${k}" aria-pressed="${(p.slot || '') === k}">${k ? SLOT_LABEL[k] : '없음'}</button>`).join('')}</div>` : '')
      + items.map(([label, , cls], i) => `<button type="button" class="menu-item ${cls || ''}" data-i="${i}">${esc(label)}</button>`).join('');
    menu.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { const fn = items[+b.dataset.i][1]; closeMenu(); fn(); }));
    menu.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { closeMenu(); store.setTaskKind(t.id, b.dataset.kind); }));
    menu.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', () => { closeMenu(); store.setPlanSlot(p.id, b.dataset.slot || null); }));
    menu.querySelectorAll('[data-week]').forEach(b => b.addEventListener('click', () => { closeMenu(); pullToWeek(p, b.dataset.week); }));
    const r = anchor.getBoundingClientRect();
    placeMenu(r.right - 200, r.bottom + 4);
  }

  const monthStart = d => d.slice(0, 8) + '01';
  // 이번 달 → 이번 주(오늘이 이번 주에서 가져오는 것처럼). 같은 작업에 그 주 계획
  function pullToWeek(p, ws = weekStart(selDate)) {
    if (store.livePlanOn(p.taskId, 'week', ws)) { toast(ws === weekStart(today) ? '이미 이번 주에 있어요' : '이미 그 주에 있어요'); return; }
    store.placeTask(p.taskId, { level: 'week', period: ws });
    undoToast(ws === weekStart(today) ? '이번 주에 놓았어요' : `${parseDate(ws).getMonth() + 1}/${parseDate(ws).getDate()} 주에 놓았어요`);
  }
  // 목표 → 그날 할 일(같은 이름, 목표에 연결). 같은 날에 같은 이름의 할 일이 이미 있으면 안내만
  function addStep(g, date, opts = {}) {
    const dup = store.stepsOf(g.id).find(s => s.title === g.title && store.livePlanOn(s.id, 'day', date));
    if (dup) { toast(`이미 ${dayName(date)}에 있어요`); return; }
    store.addPlan({ title: g.title, period: date, goalId: g.id, ...opts });
    undoToast(`${dayName(date)}에 놓았어요 (◎ ${g.title})`);
  }
  // 그 달의 몇째 주(일요일 시작, 1일이 든 주 = 1주)
  const weekNo = (ws, first) => Math.round((parseDate(ws) - parseDate(weekStart(first))) / 864e5 / 7) + 1;
  const dayName = d => { if (d === today) return '오늘'; if (d === addDays(today, 1)) return '내일'; if (d === addDays(today, -1)) return '어제'; const x = parseDate(d); return `${x.getMonth() + 1}/${x.getDate()}(${DOW[x.getDay()]})`; };
  function moveTo(planId, to) {
    const p = store.plan(planId); if (!p) return;
    const r = store.movePlan(planId, to, p.level === 'month' ? monthStart(today) : p.level === 'week' ? weekStart(today) : today);
    if (!r) return;
    const where = p.level === 'month' ? `${parseDate(to).getMonth() + 1}월` : p.level === 'week' ? '그 주' : dayName(to);
    undoToast(r.how === 'restored' ? `${where}로 되돌렸어요` : r.how === 'migrated' ? `${where}로 옮겼어요  >` : `${where}로 옮겼어요`);
  }
  function openDatePick(planId) {
    const p = store.plan(planId), t = p && store.task(p.taskId); if (!t) return;
    const dlg = $('dateDlg');
    $('dateTitle').textContent = t.title;
    $('dateInput').value = p.period;
    dlg.returnValue = '';
    dlg.showModal();
    dlg.onclose = () => { const v = $('dateInput').value; if (dlg.returnValue === 'move' && v && v !== p.period) moveTo(planId, v); };
  }

  function kindMenu(x, y, cb) {
    let picked = false;
    menu.innerHTML = `<div class="menu-head">무엇을 적을까요?</div>` + Object.keys(KIND_LABEL).map(k => `<button type="button" class="menu-item" data-k="${k}">${esc(kindSym(k))} ${KIND_LABEL[k]}</button>`).join('');
    menu.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { picked = true; closeMenu(); cb(b.dataset.k); }));
    placeMenu(x, y);
    const obs = new MutationObserver(() => { if (menu.hidden) { obs.disconnect(); if (!picked) cb(null); } });
    obs.observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ---------- 영역·프로젝트 ---------- */
  function openAssign(taskId) {
    const t = store.task(taskId); if (!t) return;
    const dlg = $('assignDlg');
    const areaSel = $('assignArea'), goalSel = $('assignGoal'), newGoal = $('assignNewGoal');
    $('assignTitle').textContent = t.title;
    $('assignHead').textContent = t.goal ? '영역' : '영역 · 목표';
    $('assignGoalLab').hidden = $('assignNewLab').hidden = !!t.goal;
    areaSel.innerHTML = `<option value="">기본</option>` + store.areas().map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    // 고를 수 있는 목표: 안 끝난 목표(지금 연결된 것은 끝났어도 보임). 이번 달·이번 주 목표 먼저
    const cur = new Set([...store.plansOn('month', monthStart(selDate)), ...store.plansOn('week', weekStart(selDate))].map(p => p.taskId));
    const goals = store.goals().filter(g => g.status !== 'done' || g.id === t.goalId).sort((a, b) => cur.has(b.id) - cur.has(a.id));
    goalSel.innerHTML = `<option value="">목표 없음</option>` + goals.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('');
    areaSel.value = t.areaId || ''; goalSel.value = t.goalId || ''; newGoal.value = '';
    $('assignNewGoal').placeholder = `예: 포트폴리오 완성 (${parseDate(selDate).getMonth() + 1}월 목표로)`;
    dlg.returnValue = '';
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue !== 'save') return;
      store.assignTask(taskId, { areaId: areaSel.value || null, goalId: goalSel.value || null, newGoalName: newGoal.value, newGoalMonth: monthStart(selDate) });
      undoToast(t.goal ? '영역을 정했어요' : '영역 · 목표를 정했어요');
    };
  }

  /* ---------- 어제 계획 가져오기 (반복 대신) ---------- */
  function openImport() {
    const from = addDays(selDate, -1);
    const list = store.plansOn('day', from).filter(p => p.status !== 'migrated');
    const dlg = $('importDlg');
    $('importList').innerHTML = list.map(p => {
      const v = view(p); const already = !!store.livePlanOn(p.taskId, 'day', selDate);
      return `<li><label class="${already ? 'is-already' : ''}"><input type="checkbox" value="${p.id}" ${already ? 'disabled' : ''} />
        <span class="imp-sym">${esc(symOf(v))}</span>
        <span class="imp-time">${p.start != null ? hhmm(p.start) : '시간 없음'}</span>
        <span class="imp-title">${esc(v.t.title)}${v.areaSr}${already || v.meta ? `<small>${already ? '이미 있어요' : esc(v.meta)}</small>` : ''}</span></label></li>`;
    }).join('') || `<li class="empty">어제 계획이 없어요</li>`;
    const go = $('importGo');
    const update = () => { const n = $('importList').querySelectorAll('input:checked').length; go.textContent = n ? `${n}개 가져오기` : '가져오기'; go.disabled = !n; };
    $('importList').onchange = update; update();
    $('importAll').onclick = () => { $('importList').querySelectorAll('input:not(:disabled)').forEach(c => { c.checked = true; }); update(); };
    dlg.returnValue = '';
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue !== 'import') return;
      const ids = [...$('importList').querySelectorAll('input:checked')].map(c => c.value);
      const n = store.importPlans(ids, selDate);
      if (n) undoToast(`${n}개 가져왔어요`);
    };
  }

  /* ---------- 설정: 영역(이름·색·순서·숨기기·추가) + 기호 ---------- */
  const SYM_FIELDS = { task: 'symTask', event: 'symEvent', note: 'symNote', done: 'symDone', migrated: 'symMigrated' };
  const NEW_COLORS = ['#E58F6F', '#7C9CE0', '#D98FC9', '#B9A36A', '#6FBF9A', '#C98A6B'];
  function openSettings() {
    renderAccount();
    const dlg = $('setDlg'), cur = { ...BJStore.DEFAULT_SYMBOLS, ...(store.state.settings.symbols || {}) };
    let draft = store.allAreas().map(a => ({ id: a.id, name: a.name, color: a.color, archived: !!a.archived }));
    const drawAreas = () => {
      const shown = draft.filter(a => !a.archived), hidden = draft.filter(a => a.archived);
      const li = (a, i, list) => `<li class="${a.archived ? 'is-archived' : ''}" data-ai="${draft.indexOf(a)}">
        <input type="color" value="${esc(a.color)}" aria-label="${esc(a.name || '새 영역')} 색" data-f="color" />
        <input type="text" value="${esc(a.name)}" maxlength="20" placeholder="영역 이름" aria-label="영역 이름" data-f="name" />
        ${a.archived ? '' : `<button type="button" data-act="up" aria-label="위로" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-act="down" aria-label="아래로" ${i === list.length - 1 ? 'disabled' : ''}>▼</button>`}
        <button type="button" data-act="hide">${a.archived ? '보이기' : '숨기기'}</button></li>`;
      $('areaEdit').innerHTML = shown.map(li).join('') + (hidden.length ? `<li class="area-edit-sep">숨긴 영역</li>` + hidden.map(li).join('') : '');
    };
    $('areaEdit').oninput = e => { const row = e.target.closest('[data-ai]'); if (!row) return; draft[+row.dataset.ai][e.target.dataset.f] = e.target.value; };
    $('areaEdit').onclick = e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const a = draft[+btn.closest('[data-ai]').dataset.ai];
      const shown = draft.filter(x => !x.archived);
      if (btn.dataset.act === 'hide') a.archived = !a.archived;
      else {
        const i = shown.indexOf(a), j = btn.dataset.act === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= shown.length) return;
        [shown[i], shown[j]] = [shown[j], shown[i]];
        draft = [...shown, ...draft.filter(x => x.archived)];
      }
      drawAreas();
    };
    $('areaAdd').onclick = () => {
      const used = new Set(draft.map(a => a.color.toLowerCase()));
      draft.splice(draft.filter(a => !a.archived).length, 0, { id: null, name: '', color: NEW_COLORS.find(c => !used.has(c.toLowerCase())) || '#999999', archived: false });
      drawAreas();
      const inputs = $('areaEdit').querySelectorAll('li:not(.is-archived) input[type=text]');
      inputs[inputs.length - 1]?.focus();
    };
    drawAreas();

    Object.entries(SYM_FIELDS).forEach(([k, id]) => { $(id).value = cur[k] || ''; });
    $('symStrike').checked = store.strikeDone();
    const read = () => Object.fromEntries(Object.entries(SYM_FIELDS).map(([k, id]) => [k, $(id).value.trim()]));
    const preview = () => {
      const s = read(), D = BJStore.DEFAULT_SYMBOLS, pick = k => s[k] || D[k];
      const line = (sym, text, cls = '') => `<li class="${cls}"><span class="bullet">${esc(sym)}</span><span class="sp-title">${esc(text)}</span></li>`;
      $('symPreview').classList.toggle('strike-done', $('symStrike').checked);
      $('symPreview').innerHTML = line(pick('task'), '1장 읽기') + line(pick('event'), '14:00 약국 가기') + line(pick('note'), '책 추천 받은 것')
        + line(s.done || pick('task'), '세수하기 (완료)', 'is-done') + line(pick('migrated'), '자소서 초안 (다음으로)', 'is-migrated');
    };
    $('symBox').oninput = preview;
    $('symDefault').onclick = () => { Object.entries(SYM_FIELDS).forEach(([k, id]) => { $(id).value = BJStore.DEFAULT_SYMBOLS[k]; }); $('symStrike').checked = true; preview(); };
    preview();
    dlg.returnValue = '';
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue !== 'save') return;
      store.saveSettings({ symbols: read(), strikeDone: $('symStrike').checked, areas: draft });
      undoToast('설정을 저장했어요');
    };
  }

  /* ---------- 알림 ---------- */
  let toastTimer = 0;
  function toast(msg, actions = []) {
    const el = $('toast');
    el.innerHTML = `<span class="toast-msg"></span>` + actions.map((a, i) => `<button type="button" data-a="${i}">${esc(a.label)}</button>`).join('');
    el.querySelector('.toast-msg').textContent = msg;
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => { hideToast(); actions[+b.dataset.a].fn(); }));
    el.hidden = false; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 10000);
  }
  function hideToast() { const el = $('toast'); el.classList.remove('show'); el.hidden = true; }
  const undoToast = msg => toast(msg, [{ label: '실행 취소', fn: () => { if (store.undo()) toast('되돌렸어요'); } }]);

  /* ---------- 주간 화면: 왼쪽 이번 주 목록(영역별 고정) + 오른쪽 7일 ---------- */
  function renderWeekView() {
    const ws = weekStart(selDate), we = addDays(ws, 6);
    const a = parseDate(ws), b = parseDate(we);
    $('wkTitle').textContent = `${a.getMonth() + 1}월 ${a.getDate()}일 – ${a.getMonth() === b.getMonth() ? '' : (b.getMonth() + 1) + '월 '}${b.getDate()}일`;
    $('wkBadge').hidden = ws !== weekStart(today);
    $('todayBtn').disabled = ws === weekStart(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

    // 왼쪽: 영역마다 제목 + 줄 + 바로 적기. 이 주에 놓인 날을 작게 표시(✓ = 그날 몫 완료)
    const weekPlans = store.plansOn('week', ws);
    const dayTags = p => `<span class="tags">${stepDayTags(p.taskId, days)}${progTag(p.taskId)}</span>`;
    const group = (area, list) => `<section class="wk-area${list.length ? '' : ' is-empty'}" style="${area ? `--c:${area.color}` : ''}">
        <h3 class="wk-area-title${area ? '' : ' no-area'}">${area ? esc(area.name) : '기본'}</h3>
        <ul class="rows">${list.map(p => rowHtml(view(p), dayTags(p))).join('')}</ul>
        <form class="add-form mini" data-add-week="${area ? area.id : ''}" autocomplete="off"><input type="text" enterkeyhint="done" placeholder="+ ${area ? esc(area.name) : '기본'}에 적기" aria-label="${area ? esc(area.name) : '기본'} 이번 주에 적기" /></form>
      </section>`;
    const areas = store.areas();
    const areaIds = new Set(areas.map(x => x.id));
    let html = areas.map(ar => group(ar, weekPlans.filter(p => store.task(p.taskId)?.areaId === ar.id))).join('');
    const rest = weekPlans.filter(p => !areaIds.has(store.task(p.taskId)?.areaId));
    html += group(null, rest);
    $('wkAreas').innerHTML = html;
    $('wkAreas').querySelectorAll('.row').forEach(wireRow('goal'));


    // 오른쪽: 7일. 줄은 시간 순 → 시간 없는 것. 날짜를 누르면 그날 오늘 화면으로
    $('wkDays').innerHTML = days.map(d => {
      const x = parseDate(d), list = store.plansOn('day', d);
      const live = list.filter(p => p.status !== 'migrated' && store.task(p.taskId)?.kind !== 'note');
      const done = live.filter(p => p.status === 'done').length;
      return `<section class="wk-day${d === today ? ' is-today' : ''}${x.getDay() === 0 ? ' is-sun' : x.getDay() === 6 ? ' is-sat' : ''}" data-drop-day="${d}">
        <header><button type="button" class="wk-day-title" data-goto="${d}">${x.getMonth() + 1}/${x.getDate()} (${DOW[x.getDay()]})</button>${d === today ? '<span class="today-badge">오늘</span>' : ''}${live.length ? `<small class="wk-count">${done}/${live.length}</small>` : ''}</header>
        <ul class="rows">${list.map(p => rowHtml(view(p), '', true)).join('')}</ul>
        <form class="add-form mini" data-add-day="${d}" autocomplete="off"><input type="text" enterkeyhint="done" placeholder="+ 적기" aria-label="${x.getMonth() + 1}월 ${x.getDate()}일에 적기" /></form>
      </section>`;
    }).join('');
    $('wkDays').querySelectorAll('.row').forEach(wireRow('day'));
  }

  /* ---------- 월간 화면: 하루 3줄 = 오전·오후·저녁(결의 월간 노트). 빈 줄 = 빈 시간 ---------- */
  function renderMonthView() {
    const x = parseDate(selDate), y = x.getFullYear(), m = x.getMonth();
    const first = BJStore.dateStr(new Date(y, m, 1)), last = BJStore.dateStr(new Date(y, m + 1, 0));
    $('moTitle').textContent = `${y}년 ${m + 1}월`;
    const thisMonth = today.slice(0, 7) === selDate.slice(0, 7);
    $('moBadge').hidden = !thisMonth;
    $('todayBtn').disabled = thisMonth && selDate === today;
    const start = weekStart(first), end = addDays(weekStart(last), 6);
    // by = 시작 구간(자세히 목록), cover = 시간이 걸친 구간 모두(달력 칸: 9~18시 출근이면 오전·오후 둘 다 참)
    const RANGE = { am: [0, 720], pm: [720, 1080], eve: [1080, 1440] };
    const slotsOf = d => {
      const live = store.plansOn('day', d).filter(p => p.status !== 'migrated');
      const by = { am: [], pm: [], eve: [], none: [] }, cover = { am: [], pm: [], eve: [], none: [] };
      live.forEach(p => {
        by[store.slotOf(p) || 'none'].push(p);
        if (p.start == null) { cover[store.slotOf(p) || 'none'].push(p); return; }
        ['am', 'pm', 'eve'].forEach(k => { if (p.start < RANGE[k][1] && p.start + p.duration > RANGE[k][0]) cover[k].push(p); });
      });
      return { by, cover };
    };
    let cells = '';
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const dx = parseDate(d), { cover: by } = slotsOf(d);
      if (dx.getDay() === 0) { // 줄 맨 왼쪽 = 그 주에 배치한 일(결 제안: 8열). 이번 달 할 일을 여기로 끌면 그 주
        const wl = store.plansOn('week', d).filter(p => p.status !== 'migrated'), n = weekNo(d, first);
        const wline = p => { const v = view(p); return `<div class="mc-line${p.status === 'done' ? ' is-done' : ''}${v.a ? '' : ' no-area'}" style="${styleOf(v)}"><span class="mc-text"><span class="mc-sym">${esc(symOf(v))} </span>${esc(v.t.title)}</span></div>`; };
        cells += `<div class="mw${d === weekStart(today) ? ' is-this' : ''}" data-drop-week="${d}" data-goto-week="${d}" role="button" tabindex="0" aria-label="${n}주 배치: ${wl.length ? esc(wl.map(p => store.task(p.taskId)?.title).join(', ')) : '없음'}. 누르면 주간">
          <span class="mc-num mw-num">${n}주</span>${wl.length > 3 ? `<span class="mc-more">+${wl.length - 3}</span>` : ''}
          ${wl.slice(0, 3).map(wline).join('')}
        </div>`;
      }
      const line = k => {
        const list = by[k];
        if (!list.length) return `<div class="mc-line is-empty"><span class="mc-text">·</span></div>`;
        const v = view(list[0]);
        const done = list.every(p => p.status === 'done' || store.task(p.taskId)?.kind === 'note');
        return `<div class="mc-line${done ? ' is-done' : ''}${v.a ? '' : ' no-area'}" style="${styleOf(v)}"><span class="mc-text"><span class="mc-sym">${esc(symOf(v))} </span>${esc(v.t.title)}</span>${list.length > 1 ? `<span class="mc-n">+${list.length - 1}</span>` : ''}</div>`;
      };
      const sr = ['am', 'pm', 'eve'].map(k => `${SLOT_LABEL[k]} ${by[k].length ? by[k].map(p => store.task(p.taskId)?.title).join(', ') : '비어 있음'}`).join(', ');
      cells += `<div class="mc${d < first || d > last ? ' is-other' : ''}${d === today ? ' is-today' : ''}${d === selDate ? ' is-sel' : ''}${dx.getDay() === 0 ? ' is-sun' : ''}" data-drop-day="${d}" data-pick="${d}" role="button" tabindex="0" aria-pressed="${d === selDate}" aria-label="${dx.getMonth() + 1}월 ${dx.getDate()}일. ${esc(sr)}${by.none.length ? `. 구간 없음 ${by.none.length}개` : ''}">
        <span class="mc-num">${dx.getDate()}</span>${by.none.length ? `<span class="mc-more" title="구간 없음 ${by.none.length}개">+${by.none.length}</span>` : ''}
        ${line('am')}${line('pm')}${line('eve')}
      </div>`;
    }
    $('moCells').innerHTML = cells;

    // 달력 위: 이번 달 할 일(월간 계획). 몇째 주에 놓였는지 표시(✓ = 그 주 몫 완료). 달력 날짜로 끌면 그날 계획
    $('moListTitle').textContent = `${m + 1}월에 할 일`;
    $('moAdd').querySelector('input').placeholder = `+ ${m + 1}월에 적기 (예: #독서 1권 다 읽기)`;
    const weekTags = p => store.plansOfTask(p.taskId).filter(w => w.level === 'week' && w.status !== 'migrated' && w.period <= last && addDays(w.period, 6) >= first)
      .sort((a, b) => a.period < b.period ? -1 : 1).map(w => `<span class="tag${w.status === 'done' ? ' tag-done' : ''}">${weekNo(w.period, first)}주${w.status === 'done' ? '✓' : ''}</span>`).join('');
    const monthPlans = store.plansOn('month', first);
    $('moListHint').textContent = narrowMq.matches ? '아래 주 버튼·날짜로 끌기 · ⋯ 주에 놓기' : '달력 왼쪽 주 칸·날짜로 끌어 놓기';
    // 이번 달 목표만(주간과 겹치지 않게, 결 2026-11-18). 주·날짜에 놓아도 목록에 남고 '3주'·'20일✓'로 진행이 보임
    $('moList').innerHTML = `<ul class="rows">${monthPlans.map(p => rowHtml(view(p), `<span class="tags">${weekTags(p)}${progTag(p.taskId)}</span>`)).join('') || `<li class="empty">이번 달 목표를 적어 두고, 주·날짜로 끌어 놓으세요</li>`}</ul>`;
    $('moList').querySelectorAll('.row').forEach(wireRow('goal'));
    // 휴대폰: 주 버튼 한 줄(PC의 8열 '주' 칸 역할). 끌어 놓으면 그 주, 누르면 그 주 주간. 개수만 작게
    const weeksOf = []; for (let w = start; w <= end; w = addDays(w, 7)) weeksOf.push(w);
    $('moWeeks').innerHTML = `<span class="menu-lab">주에 놓기</span>` + weeksOf.map(w => { const n = store.plansOn('week', w).filter(p => p.status !== 'migrated').length;
      return `<button type="button" class="wk-chip${w === weekStart(today) ? ' is-this' : ''}" data-drop-week="${w}" data-goto-week="${w}" aria-label="${weekNo(w, first)}주${n ? `, ${n}개` : ''}. 누르면 주간">${weekNo(w, first)}주${n ? `<small>·${n}</small>` : ''}</button>`; }).join('');

    // 고른 날 자세히: 3구간 + 구간 없음. 줄을 다른 구간이나 달력 날짜로 끌 수 있음
    const { by, cover } = slotsOf(selDate), sd = parseDate(selDate);
    // 앞 구간에서 이어지는 시간 계획은 흐리게 한 줄(예: 09~18시 출근 → 오후에 "↳ 출근")
    const cont = k => (k ? cover[k].filter(p => !by[k].includes(p)) : []).map(p => `<li class="row-cont" style="${styleOf(view(p))}">↳ ${esc(store.task(p.taskId)?.title)} <small>${hhmm(p.start)}–${hhmm(p.start + p.duration)}</small></li>`).join('');
    const sec = (k, list) => `<section class="md-slot" data-drop-slot="${k}" data-day="${selDate}">
        <h3>${k ? SLOT_LABEL[k] : '구간 없음'}${k ? ` <small>${SLOT_HINT[k]}</small>` : ''}</h3>
        <ul class="rows">${cont(k)}${list.map(p => rowHtml(view(p), '', 'time')).join('')}</ul>
        ${k ? `<form class="add-form mini" data-add-slot="${k}" data-day="${selDate}" autocomplete="off"><input type="text" enterkeyhint="done" placeholder="+ ${SLOT_LABEL[k]}에 적기" aria-label="${sd.getMonth() + 1}월 ${sd.getDate()}일 ${SLOT_LABEL[k]}에 적기" /></form>` : ''}
      </section>`;
    $('moDetail').innerHTML = `<div class="zone-head"><h2>${sd.getMonth() + 1}월 ${sd.getDate()}일 (${DOW[sd.getDay()]})${selDate === today ? ' <span class="today-badge">오늘</span>' : ''}</h2><button type="button" class="link-btn" data-goto="${selDate}">이 날 열기</button></div>`
      + sec('am', by.am) + sec('pm', by.pm) + sec('eve', by.eve) + (by.none.length ? sec('', by.none) : '');
    $('moDetail').querySelectorAll('.row').forEach(wireRow('day'));
  }
  // 월간 칸 고르기(누르기·Enter)
  const pickDay = d => { selDate = d; render(); };
  document.addEventListener('click', e => { const c = e.target.closest('[data-pick]'); if (c && mode === 'month') pickDay(c.dataset.pick); });
  const gotoWeek = ws => { selDate = ws < monthStart(selDate) ? monthStart(selDate) : ws; location.hash = '#week'; render(); window.scrollTo(0, 0); };
  document.addEventListener('click', e => { const w = e.target.closest('[data-goto-week]'); if (w && mode === 'month') gotoWeek(w.dataset.gotoWeek); });
  document.addEventListener('keydown', e => { const w = e.target.closest?.('[data-goto-week]'); if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); gotoWeek(w.dataset.gotoWeek); } });
  document.addEventListener('keydown', e => { const c = e.target.closest?.('[data-pick]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickDay(c.dataset.pick); document.querySelector(`[data-pick="${c.dataset.pick}"]`)?.focus(); } });

  // 주간 화면 입력칸(영역별·날짜별)
  document.addEventListener('submit', e => {
    if (e.target.id === 'moAdd') {
      e.preventDefault();
      const input = e.target.querySelector('input'), { title, areaId } = parseTitle(input.value);
      if (title) { store.addPlan({ title, level: 'month', period: monthStart(selDate), areaId }); $('moAdd').querySelector('input').focus(); }
      return;
    }
    if (e.target.matches('[data-add-step]')) {
      e.preventDefault();
      const gid = e.target.dataset.addStep, input = e.target.querySelector('input'), { title, areaId } = parseTitle(input.value);
      if (title) { store.addPlan({ title, period: selDate, goalId: gid, areaId }); document.querySelector(`[data-add-step="${gid}"] input`)?.focus(); }
      return;
    }
    const f = e.target; if (!f.matches('[data-add-week], [data-add-day], [data-add-slot]')) return;
    e.preventDefault();
    const input = f.querySelector('input');
    const { title, areaId } = parseTitle(input.value);
    if (!title) return;
    const keep = f.dataset.addWeek !== undefined ? `[data-add-week="${f.dataset.addWeek}"]` : f.dataset.addSlot !== undefined ? `[data-add-slot="${f.dataset.addSlot}"]` : `[data-add-day="${f.dataset.addDay}"]`;
    if (f.dataset.addSlot !== undefined) store.addPlan({ title, period: f.dataset.day, slot: f.dataset.addSlot || null, areaId });
    else if (f.dataset.addWeek !== undefined) store.addPlan({ title, level: 'week', period: weekStart(selDate), areaId: areaId || f.dataset.addWeek || null });
    else store.addPlan({ title, period: f.dataset.addDay, areaId });
    document.querySelector(keep + ' input')?.focus();
  });
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]'); if (!g) return;
    selDate = g.dataset.goto; location.hash = '#today'; render(); window.scrollTo(0, 0);
  });
  window.addEventListener('hashchange', () => { closeMenu(); render(); window.scrollTo(0, 0); });
  // 탭을 누르면 바로 그 화면(hashchange를 기다리지 않음)
  document.querySelectorAll('.tabs a').forEach(t => t.addEventListener('click', e => {
    if (location.hash === t.getAttribute('href') || (!location.hash && t.getAttribute('href') === '#today')) return;
    e.preventDefault(); location.hash = t.getAttribute('href'); closeMenu(); render(); window.scrollTo(0, 0);
  }));

  /* ---------- 입력칸 ---------- */
  function wireAddForm(formId, level) {
    const form = $(formId);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('input');
      const { title, areaId } = parseTitle(input.value);
      if (!title) return;
      const lv = formId === 'weekAdd' && panel === 'month' ? 'month' : level;
      const period = lv === 'month' ? monthStart(selDate) : lv === 'week' ? weekStart(selDate) : selDate;
      store.addPlan({ title, level: lv, period, areaId });
      input.value = ''; input.focus();
    });
  }

  /* ---------- 시작 ---------- */
  wireAddForm('untimedAdd', 'day');
  wireAddForm('weekAdd', 'week');
  const step = n => (mode === 'month' ? addMonths(selDate, n) : addDays(selDate, mode === 'week' ? 7 * n : n));
  $('prevDay').onclick = () => { selDate = step(-1); render(); };
  $('nextDay').onclick = () => { selDate = step(1); render(); };
  $('todayBtn').onclick = () => { selDate = today; render(); scrollToNow(); };
  $('importBtn').onclick = openImport;
  $('settingsBtn').onclick = openSettings;
  $('resetBtn').onclick = () => { if (confirm(sync.signedIn ? '기록을 모두 지우고 처음부터 시작할까요? 계정의 기록도 지워져요(PC·휴대폰 모두).' : '이 기기 기록을 모두 지우고 처음부터 시작할까요?')) store.reset(); };
  $('syncStatus').onclick = () => (sync.signedIn ? sync.syncNow() : openSettings());
  store.subscribe(render);

  function scrollToNow() {
    if (!tl || selDate !== today) return;
    const y = tl.content.getBoundingClientRect().top + window.scrollY + tl.topOf(Math.max(tl.minM, nowMinute() - 60));
    window.scrollTo({ top: Math.max(0, y - 160) });
  }
  setInterval(() => {
    const t = todayStr();
    if (t !== today) { if (selDate === today) selDate = t; today = t; render(); return; }
    if (mode === "today") { renderNow(); positionNowLine(); }
  }, 60000);

  render();
  if (!storage) toast('이 브라우저에서는 저장이 안 돼요. 창을 닫으면 기록이 사라져요.');
  sync.start();
})();
