/* 오늘한칸 v3 — 오늘 화면(오늘 + 타임라인 + 지금) · 주간 화면(이번 주 목록 + 7일). docs/v3_설계.md 7·8장 */
(function () {
  'use strict';
  const { createStore, addDays, weekStart, todayStr, parseDate } = BJStore;
  const { hhmm } = BJTimeline;
  let storage = null; try { storage = window.localStorage; } catch (e) { /* 개인 창 등 */ }
  const store = createStore(storage);
  window.bj = store; // 테스트·디버그용

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
  const modeOf = () => (location.hash === '#week' ? 'week' : 'today');
  let mode = modeOf();

  /* ---------- 보기 모델 ---------- */
  function view(p) {
    const t = store.task(p.taskId) || { title: '(지워진 작업)', kind: 'task', status: 'open' };
    const a = t.areaId ? store.area(t.areaId) : null;
    const pr = t.projectId ? store.project(t.projectId) : null;
    // 영역 이름은 글자로 안 쓰고 색으로만 표시(결 요청 2026-11-15). 글자는 프로젝트 이름만. 화면 읽기용으로만 영역 이름을 넣음
    const meta = pr ? pr.name : '';
    const areaSr = `<span class="sr-only">${a ? esc(a.name) : '미분류'}</span>`;
    return { p, t, a, pr, meta, areaSr, color: a ? a.color : '', done: p.status === 'done', migrated: p.status === 'migrated' };
  }
  function bulletHtml(v) {
    const { p, t } = v;
    if (v.migrated) return `<span class="bullet s-migrated" title="옮김" aria-label="옮김">${esc(symOf(v))}</span>`;
    if (t.kind === 'note') return `<span class="bullet k-note" aria-label="메모">${esc(symOf(v))}</span>`;
    return `<button type="button" class="bullet k-${t.kind}${v.done ? ' s-done' : ''}" data-toggle="${p.id}" role="checkbox" aria-checked="${v.done}" aria-label="${esc(t.title)} ${p.level === 'week' ? '이번 주 몫' : '오늘 몫'} 완료">${esc(symOf(v))}</button>`;
  }
  const clsOf = v => `k-${v.t.kind} s-${v.p.status}${v.t.status === 'done' ? ' task-done' : ''}${v.a ? '' : ' no-area'}`;
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
    document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + mode ? 'page' : 'false'));
    $('todayBtn').textContent = mode === 'week' ? '이번 주' : '오늘';
    $('prevDay').setAttribute('aria-label', mode === 'week' ? '지난 주' : '전날');
    $('nextDay').setAttribute('aria-label', mode === 'week' ? '다음 주' : '다음날');
    if (mode === 'week') { tl = null; renderWeekView(); return; }
    renderHeader();
    renderNow();
    renderUntimed();
    renderTimeline();
    renderWeek();
  }

  function renderLegend() {
    $('legend').innerHTML = store.areas().map(a => `<li style="--c:${a.color}">${esc(a.name)}</li>`).join('') + `<li class="no-area">미분류</li>`;
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
      ${bulletHtml(v)}${showTime && v.p.start != null ? `<span class="row-time">${hhmm(v.p.start)}</span>` : ''}
      <span class="row-body"><span class="row-title">${esc(v.t.title)}</span>${v.areaSr}${v.meta || v.t.status === 'done' ? `<small class="row-meta">${[v.t.status === 'done' ? '작업 완료 ✓' : '', esc(v.meta)].filter(Boolean).join(' · ')}</small>` : ''}</span>
      ${extra}
      <button type="button" class="more" data-more="${v.p.id}" aria-label="${esc(v.t.title)} 메뉴">⋯</button>
    </li>`;
  }

  function renderUntimed() {
    const list = store.plansOn('day', selDate).filter(p => p.start == null);
    $('untimedList').innerHTML = list.map(p => rowHtml(view(p))).join('') || `<li class="empty">시간을 안 정한 일을 여기에 적어요</li>`;
    $('untimedList').querySelectorAll('.row').forEach(wireRow('day'));
    const y = store.plansOn('day', addDays(selDate, -1)).filter(p => p.status !== 'migrated');
    $('importBtn').textContent = `어제 계획 가져오기${y.length ? ` (${y.length})` : ''}`;
  }

  function renderTimeline() {
    const items = store.plansOn('day', selDate).filter(p => p.start != null).map(p => {
      const v = view(p);
      return { id: p.id, start: p.start, duration: p.duration, title: v.t.title, meta: v.meta, sr: v.a ? v.a.name : '미분류', lead: bulletHtml(v), cls: clsOf(v), style: styleOf(v) };
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

  function renderWeek() {
    const ws = weekStart(selDate), we = addDays(ws, 6);
    const thisWeek = ws === weekStart(today);
    const f = s => { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
    $('weekTitle').textContent = thisWeek ? '이번 주에서' : '이 주에서';
    $('weekRange').textContent = `${f(ws)} – ${f(we)}`;
    const dayLabel = selDate === today ? '오늘' : f(selDate);
    const list = store.plansOn('week', ws);
    $('weekList').innerHTML = list.map(p => {
      const v = view(p);
      const onDay = store.livePlanOn(p.taskId, 'day', selDate);
      let extra = '';
      if (onDay) extra = `<span class="tag${onDay.status === 'done' ? ' tag-done' : ''}">${dayLabel}${onDay.status === 'done' ? ' 몫 ✓' : '에 있음'}</span>`;
      else if (p.status === 'open' && v.t.status !== 'done') extra = `<button type="button" class="pull" data-pull="${p.id}">${dayLabel}로</button>`;
      return rowHtml(v, extra);
    }).join('') || `<li class="empty">이번 주에 할 일을 적어 두고, 하루에 하나씩 끌어오세요</li>`;
    $('weekList').querySelectorAll('.row').forEach(wireRow('week'));
  }

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
      lastDz = target?.type === 'day' ? target.el : null; lastDz?.classList.add('drop-on');
      const label = !target ? '여기엔 놓을 수 없어요' : target.type === 'untimed' ? '→ 시간 없음' : target.type === 'day' ? `→ ${dayName(target.date)}` : `→ ${hhmm(target.start)}–${hhmm(target.start + target.duration)}`;
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
    const msg = p.level === 'day' ? `${dn} 몫 완료! ${n === dayPlans.length ? `${dn} 계획을 다 했어요 🎉` : `(${n}/${dayPlans.length})`}` : '이번 주 몫 완료!';
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
    items.push(['영역 · 프로젝트 정하기…', () => openAssign(t.id)]);
    if (p.start != null) items.push(['시간 빼기', () => { store.setPlanTime(p.id, null); undoToast('시간을 뺐어요'); }]);
    if (p.status === 'open' && p.level === 'day') {
      if (p.period !== today) items.push(['오늘로 옮기기', () => moveTo(p.id, today)]);
      items.push([`내일로 옮기기${p.period <= today ? '  >' : ''}`, () => moveTo(p.id, addDays(p.period, 1))]);
      items.push(['날짜 고르기…', () => openDatePick(p.id)]);
    }
    if (p.status === 'open' && p.level === 'week') items.push([`다음 주로 옮기기${p.period <= weekStart(today) ? '  >' : ''}`, () => moveTo(p.id, addDays(p.period, 7))]);
    if (p.status === 'migrated') items.push([p.level === 'week' ? '다시 이 주로 되돌리기' : p.period === today ? '다시 오늘로 되돌리기' : '다시 이 날로 되돌리기', () => {
      const r = store.restorePlan(p.id);
      if (r === 'done') toast('옮겨 간 날에 이미 체크해서 되돌릴 수 없어요. 그 날 계획을 먼저 풀어 주세요.');
      else if (r) undoToast('되돌렸어요');
    }]);
    items.push(t.status === 'done' ? ['작업 다시 열기', () => { store.setTaskStatus(t.id, 'open'); undoToast('작업을 다시 열었어요'); }]
      : ['작업 완료 ✓', () => { store.setTaskStatus(t.id, 'done'); undoToast(`『${t.title}』 작업 완료 ✓`); }]);
    items.push(['계획 지우기', () => { store.deletePlan(p.id); undoToast('지웠어요'); }, 'danger']);
    menu.innerHTML = `<div class="menu-head">${esc(t.title)}</div>`
      + `<div class="menu-kinds" role="group" aria-label="종류">${Object.keys(KIND_LABEL).map(k => `<button type="button" data-kind="${k}" aria-pressed="${t.kind === k}">${esc(kindSym(k))} ${KIND_LABEL[k]}</button>`).join('')}</div>`
      + items.map(([label, , cls], i) => `<button type="button" class="menu-item ${cls || ''}" data-i="${i}">${esc(label)}</button>`).join('');
    menu.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { const fn = items[+b.dataset.i][1]; closeMenu(); fn(); }));
    menu.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { closeMenu(); store.setTaskKind(t.id, b.dataset.kind); }));
    const r = anchor.getBoundingClientRect();
    placeMenu(r.right - 200, r.bottom + 4);
  }

  const dayName = d => { if (d === today) return '오늘'; if (d === addDays(today, 1)) return '내일'; if (d === addDays(today, -1)) return '어제'; const x = parseDate(d); return `${x.getMonth() + 1}/${x.getDate()}(${DOW[x.getDay()]})`; };
  function moveTo(planId, to) {
    const p = store.plan(planId); if (!p) return;
    const r = store.movePlan(planId, to, p.level === 'week' ? weekStart(today) : today);
    if (!r) return;
    const where = p.level === 'week' ? '그 주' : dayName(to);
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
    const areaSel = $('assignArea'), projSel = $('assignProject'), newProj = $('assignNewProject');
    $('assignTitle').textContent = t.title;
    areaSel.innerHTML = `<option value="">미분류</option>` + store.areas().map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
    const fillProjects = () => {
      const aid = areaSel.value || null;
      projSel.innerHTML = `<option value="">프로젝트 없음</option>` + store.projects().filter(p => p.areaId === aid).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    };
    areaSel.value = t.areaId || ''; fillProjects(); projSel.value = t.projectId || ''; newProj.value = '';
    areaSel.onchange = fillProjects;
    dlg.returnValue = '';
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue !== 'save') return;
      store.assignTask(taskId, { areaId: areaSel.value || null, projectId: projSel.value || null, newProjectName: newProj.value });
      undoToast('영역 · 프로젝트를 정했어요');
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
    const dayTags = p => days.map(d => {
      const x = store.livePlanOn(p.taskId, 'day', d); if (!x) return '';
      return `<span class="tag${x.status === 'done' ? ' tag-done' : ''}">${DOW[parseDate(d).getDay()]}${x.status === 'done' ? '✓' : ''}</span>`;
    }).join('');
    const group = (area, list) => `<section class="wk-area${list.length ? '' : ' is-empty'}" style="${area ? `--c:${area.color}` : ''}">
        <h3 class="wk-area-title${area ? '' : ' no-area'}">${area ? esc(area.name) : '미분류'}</h3>
        <ul class="rows">${list.map(p => rowHtml(view(p), dayTags(p))).join('')}</ul>
        <form class="add-form mini" data-add-week="${area ? area.id : ''}" autocomplete="off"><input type="text" enterkeyhint="done" placeholder="+ ${area ? esc(area.name) + '에' : ''} 적기" aria-label="${area ? esc(area.name) : '미분류'} 이번 주에 적기" /></form>
      </section>`;
    const areas = store.areas();
    const areaIds = new Set(areas.map(x => x.id));
    let html = areas.map(ar => group(ar, weekPlans.filter(p => store.task(p.taskId)?.areaId === ar.id))).join('');
    const rest = weekPlans.filter(p => !areaIds.has(store.task(p.taskId)?.areaId));
    html += group(null, rest);
    $('wkAreas').innerHTML = html;
    $('wkAreas').querySelectorAll('.row').forEach(wireRow('week'));

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

  // 주간 화면 입력칸(영역별·날짜별)
  document.addEventListener('submit', e => {
    const f = e.target; if (!f.matches('[data-add-week], [data-add-day]')) return;
    e.preventDefault();
    const input = f.querySelector('input');
    const { title, areaId } = parseTitle(input.value);
    if (!title) return;
    const keep = f.dataset.addWeek !== undefined ? `[data-add-week="${f.dataset.addWeek}"]` : `[data-add-day="${f.dataset.addDay}"]`;
    if (f.dataset.addWeek !== undefined) store.addPlan({ title, level: 'week', period: weekStart(selDate), areaId: areaId || f.dataset.addWeek || null });
    else store.addPlan({ title, period: f.dataset.addDay, areaId });
    document.querySelector(keep + ' input')?.focus();
  });
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]'); if (!g) return;
    selDate = g.dataset.goto; location.hash = '#today';
  });
  window.addEventListener('hashchange', () => { closeMenu(); render(); window.scrollTo(0, 0); });

  /* ---------- 입력칸 ---------- */
  function wireAddForm(formId, level) {
    const form = $(formId);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('input');
      const { title, areaId } = parseTitle(input.value);
      if (!title) return;
      const period = level === 'week' ? weekStart(selDate) : selDate;
      store.addPlan({ title, level, period, areaId });
      input.value = ''; input.focus();
    });
  }

  /* ---------- 시작 ---------- */
  wireAddForm('untimedAdd', 'day');
  wireAddForm('weekAdd', 'week');
  $('prevDay').onclick = () => { selDate = addDays(selDate, mode === 'week' ? -7 : -1); render(); };
  $('nextDay').onclick = () => { selDate = addDays(selDate, mode === 'week' ? 7 : 1); render(); };
  $('todayBtn').onclick = () => { selDate = today; render(); scrollToNow(); };
  $('importBtn').onclick = openImport;
  $('settingsBtn').onclick = openSettings;
  $('resetBtn').onclick = () => { if (confirm('체험판 기록을 모두 지우고 처음부터 시작할까요?')) store.reset(); };
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
})();
