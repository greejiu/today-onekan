/* 오늘한칸 v3 — 누르기 손짓 공용 (지금한칸 규칙 그대로, docs/v3_설계.md 5장)
 * - 짧게 누르기 = tap
 * - 마우스: 3px 넘게 움직이면 바로 끌기(끝부분이면 길이 조절)
 * - 터치: 0.3초 가만히 누르면(진동) 끌기 준비. 그 전에 움직이면 스크롤(아무 일 없음)
 * - 0.3초 눌렀다가 그냥 떼면 아무 일 없음(이름 수정 아님) — 단, onHoldRelease가 있으면 그걸 부름 */
(function (root) {
  'use strict';
  const HOLD_MS = 300;
  let armed = false;      // 끌기·범위 선택 중: 터치 스크롤을 막음
  let suppressClickUntil = 0, suppressEl = null, origin = null;

  document.addEventListener('touchmove', e => { if (armed) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', e => { if (armed) e.preventDefault(); });
  // 끌기 직후 그 손짓이 만든 클릭(끈 항목, 그 안, 그 항목을 품은 칸)만 무시. 바로 누른 다른 버튼(실행 취소 등)은 그대로
  document.addEventListener('click', e => {
    if (Date.now() >= suppressClickUntil || !suppressEl) return;
    const t = e.target;
    if (t === suppressEl || suppressEl.contains(t) || (t.contains && t.contains(suppressEl))) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  function setArmed(v) { armed = v; document.documentElement.classList.toggle('bj-dragging', v); }
  function swallowClick(el) { suppressEl = el || origin; suppressClickUntil = Date.now() + 350; }
  function setOrigin(el) { origin = el; }

  /* 화면 위·아래 끝에서 자동 스크롤 */
  let edgeY = null, edgeFrame = 0, edgeCb = null;
  function edgeLoop() {
    edgeFrame = 0;
    if (edgeY == null) return;
    const zone = 56, h = window.innerHeight;
    const v = edgeY < zone ? -(zone - edgeY) / 3 : edgeY > h - zone ? (edgeY - (h - zone)) / 3 : 0;
    if (v) { window.scrollBy(0, v); edgeCb && edgeCb(); }
    edgeFrame = requestAnimationFrame(edgeLoop);
  }
  function autoScroll(clientY, onScroll) { edgeY = clientY; edgeCb = onScroll; if (!edgeFrame) edgeFrame = requestAnimationFrame(edgeLoop); }
  function stopAutoScroll() { edgeY = null; edgeCb = null; if (edgeFrame) cancelAnimationFrame(edgeFrame); edgeFrame = 0; }

  /* el에 누르기 손짓을 붙임.
   * opts.tap(e) · opts.drag(e, kind, st) kind='move'|'resize-top'|'resize-bottom' · opts.edge(e) → 'top'|'bottom'|null
   * opts.onHoldRelease(e) · opts.ignore(target) → true면 무시(버튼 등) */
  function press(el, opts) {
    el.addEventListener('pointerdown', e => {
      if (e.button > 0 || (opts.touchOnly && e.pointerType === 'mouse')) return;
      if (e.target.closest('button, input, select, textarea, a, [data-no-press]')) return;
      if (opts.ignore && opts.ignore(e.target)) return;
      const st = { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse', held: false, cancelled: false, started: false, edge: opts.edge ? opts.edge(e) : null, id: e.pointerId, target: e.target };
      const timer = setTimeout(() => {
        st.held = true;
        if (!st.mouse) { navigator.vibrate?.(15); setArmed(true); }
        el.classList.add('bj-armed');
      }, HOLD_MS);
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        el.classList.remove('bj-armed');
      };
      const move = ev => {
        if (ev.pointerId !== st.id) return;
        const dist = Math.hypot(ev.clientX - st.x, ev.clientY - st.y);
        if (dist <= (st.mouse ? 3 : 6)) return;
        cleanup();
        origin = el;
        if (st.edge && !st.held) { st.started = true; setArmed(true); opts.drag(ev, 'resize-' + st.edge, st); return; }
        if (st.mouse || st.held) { st.started = true; setArmed(true); opts.drag(ev, 'move', st); return; }
        st.cancelled = true; // 터치: 길게 누르기 전에 움직임 = 스크롤
      };
      const up = ev => {
        if (ev.pointerId !== st.id) return;
        cleanup();
        if (!st.mouse) setArmed(false);
        if (st.started || st.cancelled) return;
        if (st.held) { opts.onHoldRelease && opts.onHoldRelease(ev, st); return; }
        opts.tap && opts.tap(ev, st);
      };
      const cancel = () => { cleanup(); setArmed(false); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    });
  }

  /* 끌기가 시작된 뒤 손을 뗄 때까지 따라가기 */
  function follow(onMove, onEnd) {
    const move = e => { onMove(e); autoScroll(e.clientY, () => onMove(e)); };
    const finish = (e, cancelled) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      stopAutoScroll(); setArmed(false); swallowClick();
      onEnd(e, cancelled);
    };
    const up = e => finish(e, false);
    const cancel = e => finish(e, true);
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); finish(e, true); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
  }

  root.BJGesture = { press, follow, setArmed, swallowClick, setOrigin, HOLD_MS };
})(window);
