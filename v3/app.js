/* 오늘한칸 v3 — 오늘 화면 (1단계: 오늘 + 타임라인 + 지금, docs/v3_설계.md 7·8장) */
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
  const SYM = { task: '•', event: '○', note: '–' };

  let today = todayStr();
  let selDate = today;
  let tl = null; // 지금 그린 타임라인

  /* ---------- 보기 모델 ---------- */
  function view(p) {
    const t = store.task(p.taskId) || { title: '(지워진 작업)', kind: 'task', status: 'open' };
    const a = t.areaId ? store.area(t.areaId) : null;
    const pr = t.projectId ? store.project(t.projectId) : null;
    const meta = [a && a.name, pr && pr.name].filter(Boolean).join(' · ') || '미분류';
    return { p, t, a, pr, meta, color: a ? a.color : '', done: p.status === 'done', migrated: p.status === 'migrated' };
  }
  function bulletHtml(v) {
    const { p, t } = v;
    if (v.migrated) return `<span class="bullet s-migrated" title="옮김" aria-label="옮김">&gt;</span>`;
    if (t.kind === 'note') return `<span class="bullet k-note" aria-label="메모">${SYM.note}</span>`;
    return `<button type="button" class="bullet k-${t.kind}${v.done ? ' s-done' : ''}" data-toggle="${p.id}" role="checkbox" aria-checked="${v.done}" aria-label="${esc(t.title)} ${p.level === 'week' ? '이번 주 몫' : '오늘 몫'} 완료">${v.done ? '×' : SYM[t.kind]}</button>`;
  }
  const clsOf = v => `k-${v.t.kind} s-${v.p.status}${v.t.status === 'done' ? ' task-done' : ''}${v.a ? '' : ' no-area'}`;
  const styleOf = v => v.color ? `--c:${v.color};` : '';

  /* "#독서 1장 읽기" → 독서 영역 */
  function parseTitle(raw) {
    let areaId = null;
    const title = String(raw).replace(/(^|\s)#(\S+)/g, (m, sp, name) => {
      const a = store.areas().find(x => x.name === name || x.name.split('(')[0] === name);
      if (a && !areaId) { areaId = a.id; return sp; }
      return m;
    }).replace(/\s+/g, ' ').trim();
    return { title, areaId };
  }

  /* ---------- 그리기 ---------- */
  function render() {
    renderHeader();
    renderNow();
    renderUntimed();
    renderTimeline();
    renderWeek();
  }

  function renderHeader() {
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
      el.className = 'now-card has-now' + (v.done ? ' is-done' : '');
      el.setAttribute('style', styleOf(v));
      el.innerHTML = `<div class="now-label">▶ 지금</div>
        <div class="now-main">${bulletHtml(v)}<span class="now-title">${esc(v.t.title)}</span></div>
        <div class="now-sub">${hhmm(current.start)}–${hhmm(current.start + current.duration)} · ${v.done ? '오늘 몫 완료 🎉' : left + '분 남음'} · ${esc(v.meta)}</div>`;
    } else {
      el.className = 'now-card';
      el.removeAttribute('style');
      el.innerHTML = `<div class="now-label">▶ 지금</div><div class="now-empty">지금 놓인 작업이 없어요.${next ? ` 다음: <b>${hhmm(next.start)}</b> ${esc(store.task(next.taskId)?.title)}` : ' 타임라인 빈 곳을 눌러 지금 할 일을 적어 보세요.'}</div>`;
    }
  }

  function rowHtml(v, extra = '') {
    return `<li class="row ${clsOf(v)}" data-plan="${v.p.id}" style="${styleOf(v)}">
      ${bulletHtml(v)}
      <span class="row-body"><span class="row-title">${esc(v.t.title)}</span><small class="row-meta">${v.t.status === 'done' ? '작업 완료 ✓ · ' : ''}${esc(v.meta)}</small></span>
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
      return { id: p.id, start: p.start, duration: p.duration, title: v.t.title, meta: v.meta, lead: bulletHtml(v), cls: clsOf(v), style: styleOf(v) };
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
      if (el.closest('#untimedZone')) return { type: 'untimed' };
      return null;
    };
    const show = ev => {
      target = where(ev);
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
      $('untimedZone').classList.toggle('drop-on', target?.type === 'untimed');
      const label = !target ? '여기엔 놓을 수 없어요' : target.type === 'untimed' ? '→ 시간 없음' : `→ ${hhmm(target.start)}–${hhmm(target.start + target.duration)}`;
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
      ghost.remove(); dropBox.remove(); srcEl.classList.remove('drag-src'); $('untimedZone').classList.remove('drop-on');
      if (cancelled || !target) return;
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
    const dayPlans = store.plansOn('day', selDate).filter(x => x.status !== 'migrated' && store.task(x.taskId)?.kind !== 'note');
    const n = dayPlans.filter(x => x.status === 'done').length;
    const msg = p.level === 'day' ? `오늘 몫 완료! ${n === dayPlans.length ? '오늘 계획을 다 했어요 🎉' : `(${n}/${dayPlans.length})`}` : '이번 주 몫 완료!';
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
    if (p.status === 'open' && p.level === 'day') items.push(['내일로 옮기기  >', () => { store.migratePlan(p.id, addDays(p.period, 1)); undoToast('내일로 옮겼어요'); }]);
    if (p.status === 'open' && p.level === 'week') items.push(['다음 주로 옮기기  >', () => { store.migratePlan(p.id, addDays(p.period, 7)); undoToast('다음 주로 옮겼어요'); }]);
    items.push(t.status === 'done' ? ['작업 다시 열기', () => { store.setTaskStatus(t.id, 'open'); undoToast('작업을 다시 열었어요'); }]
      : ['작업 완료 ✓', () => { store.setTaskStatus(t.id, 'done'); undoToast(`『${t.title}』 작업 완료 ✓`); }]);
    items.push(['계획 지우기', () => { store.deletePlan(p.id); undoToast('지웠어요'); }, 'danger']);
    menu.innerHTML = `<div class="menu-head">${esc(t.title)}</div>`
      + `<div class="menu-kinds" role="group" aria-label="종류">${Object.keys(KIND_LABEL).map(k => `<button type="button" data-kind="${k}" aria-pressed="${t.kind === k}">${SYM[k]} ${KIND_LABEL[k]}</button>`).join('')}</div>`
      + items.map(([label, , cls], i) => `<button type="button" class="menu-item ${cls || ''}" data-i="${i}">${esc(label)}</button>`).join('');
    menu.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { const fn = items[+b.dataset.i][1]; closeMenu(); fn(); }));
    menu.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { closeMenu(); store.setTaskKind(t.id, b.dataset.kind); }));
    const r = anchor.getBoundingClientRect();
    placeMenu(r.right - 200, r.bottom + 4);
  }

  function kindMenu(x, y, cb) {
    let picked = false;
    menu.innerHTML = `<div class="menu-head">무엇을 적을까요?</div>` + Object.keys(KIND_LABEL).map(k => `<button type="button" class="menu-item" data-k="${k}">${SYM[k]} ${KIND_LABEL[k]}</button>`).join('');
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
        <span class="imp-sym">${v.done ? '×' : SYM[v.t.kind]}</span>
        <span class="imp-time">${p.start != null ? hhmm(p.start) : '시간 없음'}</span>
        <span class="imp-title">${esc(v.t.title)}<small>${already ? '이미 있어요' : esc(v.meta)}</small></span></label></li>`;
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
  $('prevDay').onclick = () => { selDate = addDays(selDate, -1); render(); };
  $('nextDay').onclick = () => { selDate = addDays(selDate, 1); render(); };
  $('todayBtn').onclick = () => { selDate = today; render(); scrollToNow(); };
  $('importBtn').onclick = openImport;
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
    renderNow(); positionNowLine();
  }, 60000);

  render();
  if (!storage) toast('이 브라우저에서는 저장이 안 돼요. 창을 닫으면 기록이 사라져요.');
})();
