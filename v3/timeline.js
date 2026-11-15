/* 오늘한칸 v3 — 타임라인 (지금한칸 타임라인 이식, docs/v3_설계.md 5장)
 * 15분 한 칸 = 9px(1시간 36px) · 항목 최소 24px · 겹치면 열 나눔 · 지금 선 · 빈 곳 추가(30분 단위)
 * 짧게 누르기 = 이름 수정(onTap) · 끝 8px 끌기 = 길이 조절(15분) · 몸통 끌기 = 이동(onMoveStart, 30분은 화면이 처리) */
(function (root) {
  'use strict';
  const SLOT = 15, ROW = 9, MIN_PX = 24, EDGE = 8, ADD_STEP = 30;
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 겹치는 항목끼리 열 나누기. 같은 겹침 묶음 안에서는 열 수를 통일(지금한칸 agendaTimelineLayout과 같음)
  function layout(items, boxOf) {
    const sorted = [...items].sort((a, b) => a.start - b.start || b.duration - a.duration);
    const out = []; let active = [], cluster = [], cols = 0;
    const flush = () => { cluster.forEach(p => { p.colCount = cols; }); cluster = []; cols = 0; };
    sorted.forEach(it => {
      const { top, height } = boxOf(it);
      active = active.filter(a => a.end > top);
      if (!active.length && cluster.length) flush();
      const used = new Set(active.map(a => a.col)); let col = 0; while (used.has(col)) col++;
      active.push({ col, end: top + height }); cols = Math.max(cols, active.length);
      const p = { item: it, col, colCount: 1 }; cluster.push(p); out.push(p);
    });
    if (cluster.length) flush();
    return out;
  }

  /* items: [{id, start, duration, title, meta, lead(html), cls, style}]
   * o: {min, max, onTap(id, el), onMoveStart(id, e, grabMinute), onResize(id, start, duration), onCreate(start, duration, kind), kindMenu(x, y, cb)} */
  function render(host, items, o) {
    let minM = o.min, maxM = o.max;
    items.forEach(it => { minM = Math.min(minM, it.start); maxM = Math.max(maxM, it.start + it.duration); });
    minM = Math.floor(minM / 60) * 60; maxM = Math.min(1440, Math.ceil(maxM / 60) * 60);
    const slots = Math.max(1, (maxM - minM) / SLOT);
    const topOf = m => (m - minM) / SLOT * ROW;
    const boxOf = it => ({ top: topOf(it.start), height: Math.max(MIN_PX, it.duration / SLOT * ROW) });

    let rows = '';
    for (let i = 0; i < slots; i++) {
      const m = minM + i * SLOT;
      if (m % 30 === 0) {
        rows += `<div class="tl-line${m % 60 === 0 ? ' hour' : ''}" data-minute="${m}" style="grid-row:${i + 1}"></div>`;
        if (m % 60 === 0) rows += `<div class="tl-label" style="grid-row:${i + 1}">${hhmm(m)}</div>`;
      }
    }
    let html = '';
    layout(items, boxOf).forEach(({ item: it, col, colCount }) => {
      const { top, height } = boxOf(it);
      const w = 100 / colCount;
      const lines = Math.max(1, Math.floor((height - 4) / 18));
      html += `<div class="tl-item ${it.cls || ''}" data-plan="${it.id}" data-start="${it.start}" data-duration="${it.duration}" style="top:${top}px;height:${height}px;left:${w * col}%;width:calc(${w}% - 4px);${it.style || ''}">
        ${it.lead || ''}<span class="tl-title" style="-webkit-line-clamp:${lines}">${esc(it.title)}${it.sr ? `<span class="sr-only">${esc(it.sr)}</span>` : ''}${it.meta ? `<small class="tl-meta">${esc(it.meta)}</small>` : ''}</span>
        <button type="button" class="more" data-more="${it.id}" aria-label="${esc(it.title)} 메뉴">⋯</button>
      </div>`;
    });
    host.innerHTML = `<div class="tl-grid" style="grid-template-rows:repeat(${slots},${ROW}px)">${rows}<div class="tl-content" data-min="${minM}" data-max="${maxM}">${html}</div></div>`;
    const content = host.querySelector('.tl-content');
    const minuteAt = clientY => minM + (clientY - content.getBoundingClientRect().top) / ROW * SLOT;
    const api = { content, minM, maxM, topOf, minuteAt, ROW, SLOT };

    content.querySelectorAll('.tl-item').forEach(el => wireItem(el, api, o));
    wireAdd(content, api, o);
    return api;
  }

  function wireItem(el, api, o) {
    const id = el.dataset.plan;
    const start0 = +el.dataset.start, dur0 = +el.dataset.duration;
    const edgeAt = e => {
      const r = el.getBoundingClientRect(), y = e.clientY - r.top;
      return y <= EDGE ? 'top' : y >= r.height - EDGE ? 'bottom' : null;
    };
    el.addEventListener('pointermove', e => {
      if (e.buttons) return;
      const z = edgeAt(e);
      el.classList.toggle('edge-top', z === 'top'); el.classList.toggle('edge-bottom', z === 'bottom');
    });
    el.addEventListener('pointerleave', () => el.classList.remove('edge-top', 'edge-bottom'));
    BJGesture.press(el, {
      edge: edgeAt,
      tap: () => o.onTap(id, el),
      drag: (e, kind, st) => {
        el.classList.remove('edge-top', 'edge-bottom');
        if (kind === 'move') { o.onMoveStart(id, e, api.minuteAt(st.y) - start0, el); return; }
        // 길이 조절: 15분 단위(기존 그대로), 하루 안(00:00~24:00)
        el.classList.add('resizing');
        let ns = start0, nd = dur0;
        const label = document.createElement('span'); label.className = 'tl-resize-label'; el.appendChild(label);
        const show = () => {
          el.style.top = api.topOf(ns) + 'px';
          el.style.height = Math.max(MIN_PX, nd / SLOT * ROW) + 'px';
          label.textContent = hhmm(ns) + '–' + hhmm(ns + nd);
        };
        show();
        const y0 = st.y, scroll0 = window.scrollY;
        BJGesture.follow(ev => {
          const delta = Math.round((ev.clientY - y0 + window.scrollY - scroll0) / ROW) * SLOT;
          if (kind === 'resize-top') { ns = Math.max(0, Math.min(start0 + dur0 - SLOT, start0 + delta)); nd = start0 + dur0 - ns; }
          else { ns = start0; nd = Math.max(SLOT, Math.min(1440 - start0, dur0 + delta)); }
          show();
        }, (ev, cancelled) => {
          el.classList.remove('resizing'); label.remove();
          if (cancelled || (ns === start0 && nd === dur0)) { el.style.top = api.topOf(start0) + 'px'; el.style.height = Math.max(MIN_PX, dur0 / SLOT * ROW) + 'px'; return; }
          o.onResize(id, ns, nd);
        });
      },
    });
  }

  /* 빈 곳 추가: 마우스는 누르면 30분 한 칸, 끌면 범위(30분 단위).
   * 터치는 짧게 탭 = 그 칸 / 0.3초 누르면 범위 선택, 끌지 않고 떼면 종류 메뉴. 오른쪽 클릭 = 종류 메뉴 */
  function wireAdd(content, api, o) {
    const snapDown = m => Math.max(api.minM, Math.floor(m / ADD_STEP) * ADD_STEP);
    const snapUp = m => Math.ceil(m / ADD_STEP) * ADD_STEP;
    const range = (a, b) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const s = snapDown(lo), e = Math.min(1440, Math.max(s + ADD_STEP, snapUp(hi + 0.01)));
      return { start: s, duration: e - s };
    };
    const preview = (r) => {
      let p = content.querySelector('.tl-add-preview');
      if (!p) { p = document.createElement('div'); p.className = 'tl-add-preview'; content.appendChild(p); }
      p.style.top = api.topOf(r.start) + 'px'; p.style.height = Math.max(MIN_PX, r.duration / SLOT * ROW) + 'px';
      p.dataset.label = hhmm(r.start) + '–' + hhmm(r.start + r.duration);
      return p;
    };
    const isEmpty = t => t === content || t.classList.contains('tl-add-preview');
    const select = (st, e0) => {
      const m0 = api.minuteAt(st.y); let r = range(m0, api.minuteAt(e0.clientY)); preview(r);
      BJGesture.follow(ev => { r = range(m0, api.minuteAt(ev.clientY)); preview(r); },
        (ev, cancelled) => { if (cancelled) { content.querySelector('.tl-add-preview')?.remove(); return; } openInput(r, 'task'); });
    };
    const openInput = (r, kind) => {
      const p = preview(r); p.classList.add('typing');
      p.innerHTML = `<input class="tl-add-input" type="text" enterkeyhint="done" placeholder="${hhmm(r.start)} 무엇을 할까요?" aria-label="${hhmm(r.start)}에 적기" />`;
      const input = p.querySelector('input');
      let closed = false;
      const close = commit => {
        if (closed) return; closed = true;
        const v = input.value.trim(); p.remove();
        if (commit && v) o.onCreate(r.start, r.duration, kind, v);
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); close(true); } else if (e.key === 'Escape') close(false); });
      input.addEventListener('blur', () => close(true));
      input.focus({ preventScroll: true });
    };
    // 마우스: 누르는 즉시 범위 선택 시작
    content.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button > 0 || !isEmpty(e.target) || content.querySelector('.tl-add-input')) return;
      e.preventDefault();
      BJGesture.setArmed(true); BJGesture.setOrigin(content);
      select({ y: e.clientY }, e);
    });
    // 터치·펜
    BJGesture.press(content, {
      touchOnly: true,
      ignore: t => !isEmpty(t) || !!content.querySelector('.tl-add-input'),
      tap: (e, st) => openInput(range(api.minuteAt(st.y), api.minuteAt(st.y)), 'task'),
      drag: (e, kind, st) => select(st, e),
      onHoldRelease: (e, st) => {
        const r = range(api.minuteAt(st.y), api.minuteAt(st.y)); preview(r);
        o.kindMenu(e.clientX, e.clientY, k => k ? openInput(r, k) : content.querySelector('.tl-add-preview')?.remove());
      },
    });
    content.addEventListener('contextmenu', e => {
      if (!isEmpty(e.target)) return;
      e.preventDefault();
      const r = range(api.minuteAt(e.clientY), api.minuteAt(e.clientY)); preview(r);
      o.kindMenu(e.clientX, e.clientY, k => k ? openInput(r, k) : content.querySelector('.tl-add-preview')?.remove());
    });
  }

  root.BJTimeline = { render, hhmm, SLOT, ROW };
})(window);
