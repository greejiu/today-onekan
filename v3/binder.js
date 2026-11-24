/* 오늘한칸 v3 — 바인더 (6공 다이어리, 2026-11-24, docs/v3_설계.md 10장)
 * 맨 앞 = 기호·색인, 가운데 = 끼운 속지(월간·주간·하루·노트, 순서대로 쪽수), 맨 뒤 = 설정.
 * 좌우 스와이프·‹ ›·색인으로 넘김. 노트 속지는 S펜 손글씨(펜·형광펜·지우개, 압력). */
(function (root) {
  'use strict';
  const LAST_KEY = 'bj.v3.binderLast', PEN_KEY = 'bj.v3.penSeen', FINGER_KEY = 'bj.v3.fingerDraw';
  const W = 1000, H = 1414; // 용지 좌표(A 용지 비율)
  // 펜 색: 0은 글자색(어두운 모드에서 밝게)
  const COLORS = ['', '#E5675C', '#3F7FD0', '#3E9E75', '#F0B85A', '#A98BD9', '#F28BB0'];
  const PEN_W = [3, 5, 9], HL_W = 22, ERASE_R = 14;
  const PAPER_LABEL = { line: '줄', grid: '모눈', dot: '도트', blank: '무지' };
  const TYPE_LABEL = { month: '월간', week: '주간', day: '하루', note: '노트' };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function create({ store, esc, toast, undoToast, settings }) {
    const ls = (() => { try { return root.localStorage; } catch (e) { return null; } })();
    const get = k => { try { return ls?.getItem(k); } catch (e) { return null; } };
    const put = (k, v) => { try { ls?.setItem(k, v); } catch (e) { /* */ } };
    const $ = id => document.getElementById(id);
    const { parseDate, addDays } = BJStore;

    /* ---------- 주소 ---------- */
    const isBinderHash = h => h === '#b' || h.startsWith('#b/');
    const active = () => isBinderHash(location.hash);
    const seq = () => ['key', ...store.pages().map(p => p.id), 'settings'];
    function currentId() {
      if (!active()) return null;
      let id = location.hash.slice(3);
      if (!id) id = get(LAST_KEY) || 'key';
      if (id !== 'key' && id !== 'settings' && !store.page(id)) id = 'key'; // 다른 기기에서 뺀 속지
      return id;
    }
    // 지금 페이지: { id, kind: key|settings|day|week|month|note, page, no(쪽수) }
    function current() {
      const id = currentId(); if (!id) return null;
      if (location.hash !== '#b/' + id) history.replaceState(null, '', '#b/' + id);
      put(LAST_KEY, id);
      if (id === 'key' || id === 'settings') return { id, kind: id, page: null, no: null };
      const page = store.page(id);
      return { id, kind: page.type, page, no: store.pages().indexOf(page) + 1 };
    }
    let turnDir = 0;
    function go(id, dir = 0) {
      turnDir = dir;
      if (location.hash === '#b/' + id) return;
      location.hash = '#b/' + id; // hashchange → app이 다시 그림
    }
    function step(n) {
      const c = current(); if (!c) return;
      const s = seq(), i = s.indexOf(c.id), j = i + n;
      if (j < 0 || j >= s.length) return;
      go(s[j], n);
    }

    /* ---------- 이름 ---------- */
    const yearNow = () => new Date().getFullYear();
    function pageName(p) {
      if (!p) return '';
      if (p.type === 'note') return p.title || '노트';
      const d = parseDate(p.period), y = d.getFullYear() !== yearNow() ? d.getFullYear() + '년 ' : '';
      if (p.type === 'month') return `${y}${d.getMonth() + 1}월 월간`;
      if (p.type === 'week') { const e = parseDate(addDays(p.period, 6)); return `${y}${d.getMonth() + 1}/${d.getDate()}~${e.getMonth() + 1}/${e.getDate()} 주간`; }
      return `${y}${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
    }
    const labelOf = c => c.kind === 'key' ? '기호 · 색인' : c.kind === 'settings' ? '설정' : `${c.no}쪽 · ${pageName(c.page)}`;

    /* ---------- 머리(‹ 쪽 ›) ---------- */
    function renderChrome(c) {
      document.body.classList.toggle('binder', !!c);
      $('binderNav').hidden = !c; $('dateNav').hidden = !!c;
      $('pgCorner').hidden = !c || !c.no;
      if (!c) return;
      const s = seq(), i = s.indexOf(c.id);
      $('pgPrev').disabled = i <= 0; $('pgNext').disabled = i >= s.length - 1;
      $('pgLabel').textContent = labelOf(c);
      $('pgLabel').title = c.kind === 'key' ? '' : '색인으로';
      $('pgCorner').textContent = c.no || '';
      if (turnDir) {
        const cls = turnDir > 0 ? 'turn-next' : 'turn-prev';
        document.body.classList.remove('turn-next', 'turn-prev'); void document.body.offsetWidth;
        document.body.classList.add(cls); setTimeout(() => document.body.classList.remove(cls), 260);
        turnDir = 0;
      }
    }

    /* ---------- 바인더 전용 페이지(기호·색인, 노트, 설정) ---------- */
    let mounted = null; // { id, kind } 지금 #binderView에 그려진 것
    function renderOwn(c) {
      const host = $('binderView');
      const own = c && (c.kind === 'key' || c.kind === 'note' || c.kind === 'settings');
      host.hidden = !own;
      if (mounted && (!own || mounted.id !== c.id)) { if (mounted.kind === 'settings') settings.unmount(); if (mounted.kind === 'note') ink.detach(); host.innerHTML = ''; mounted = null; }
      if (!own) return false;
      if (c.kind === 'key') renderKey(host);
      else if (c.kind === 'settings') {
        if (!mounted) { host.innerHTML = `<section class="pg pg-set"><div id="setMount" class="dlg dlg-wide pg-dlg"></div><p class="hint pg-back">바인더의 마지막 장이에요. ‹ 로 돌아가요.</p></section>`; settings.mount($('setMount')); }
      } else renderNote(host, c);
      mounted = { id: c.id, kind: c.kind };
      return true;
    }

    // 맨 앞: 기호 + 색인
    function renderKey(host) {
      const sym = store.symbols(), pages = store.pages();
      const symRow = (s, t, cls = '') => `<li class="${cls}"><span class="bullet">${esc(s)}</span><span>${esc(t)}</span></li>`;
      const focusedPid = document.activeElement?.closest?.('[data-pid]')?.dataset.pid, focusedAct = document.activeElement?.dataset?.act;
      host.innerHTML = `<section class="pg pg-key">
        <div class="key-grid">
          <div class="zone key-sym">
            <div class="zone-head"><h2>기호</h2><button type="button" class="link-btn" data-bgo="settings">바꾸기</button></div>
            <ul class="key-syms ${store.strikeDone() ? 'strike-done' : ''}">
              ${symRow(sym.task, '할일')}${symRow(sym.event, '일정')}${symRow(sym.note, '메모')}
              ${symRow(sym.done || sym.task, '완료', 'is-done')}${symRow(sym.migrated, '다음으로 옮김', 'is-migrated')}
            </ul>
            <h3 class="dlg-h3">영역 색</h3>
            <ul class="legend key-legend">${store.areas().map(a => `<li style="--c:${a.color}">${esc(a.name)}</li>`).join('')}<li class="no-area">기본</li></ul>
          </div>
          <div class="zone key-idx">
            <div class="zone-head"><h2>색인</h2><span class="hint">누르면 그 쪽으로 · ≡ 끌어서 순서 바꾸기</span></div>
            ${pages.length ? `<ol id="idxList" class="idx">${pages.map((p, i) => `<li data-pid="${p.id}">
              <span class="idx-grip" aria-hidden="true" title="끌어서 순서 바꾸기">≡</span>
              <span class="idx-no">${i + 1}</span>
              <button type="button" class="idx-go" data-bgo="${p.id}"><span class="idx-name">${esc(pageName(p))}</span><span class="tag">${TYPE_LABEL[p.type]}${p.type === 'note' ? ' · ' + PAPER_LABEL[p.paper] : ''}</span></button>
              <button type="button" class="idx-btn" data-act="up" aria-label="${esc(pageName(p))} 앞으로" ${i === 0 ? 'disabled' : ''}>▲</button>
              <button type="button" class="idx-btn" data-act="down" aria-label="${esc(pageName(p))} 뒤로" ${i === pages.length - 1 ? 'disabled' : ''}>▼</button>
              <button type="button" class="idx-btn" data-act="remove" aria-label="${esc(pageName(p))} 빼기">빼기</button></li>`).join('')}</ol>`
            : `<p class="idx-empty">아직 끼운 속지가 없어요. 아래에서 월간·주간·하루·노트를 끼워 보세요.</p>`}
            <button type="button" id="addPageBtn" class="primary-btn">+ 속지 끼우기</button>
            <p class="hint">맨 뒤 장은 <button type="button" class="link-btn" data-bgo="settings">설정</button>이에요.</p>
          </div>
        </div></section>`;
      if (focusedPid && focusedAct) host.querySelector(`[data-pid="${focusedPid}"] [data-act="${focusedAct}"]:not([disabled])`)?.focus();
      $('addPageBtn').onclick = openAdd;
      wireIdxDrag(host.querySelector('#idxList'));
    }
    function onKeyClick(e) {
      const g = e.target.closest('[data-bgo]');
      if (g && active()) { e.preventDefault(); go(g.dataset.bgo, g.dataset.bgo === 'settings' ? 1 : 1); return; }
      const b = e.target.closest('.idx [data-act]'); if (!b) return;
      const id = b.closest('[data-pid]').dataset.pid, list = store.pages(), i = list.findIndex(x => x.id === id), p = list[i];
      if (b.dataset.act === 'up') store.movePage(id, i - 1);
      else if (b.dataset.act === 'down') store.movePage(id, i + 1);
      else if (b.dataset.act === 'remove') {
        if (p.type === 'note' && (p.ink || []).length && !confirm(`"${pageName(p)}" 노트를 뺄까요? 손글씨도 같이 지워져요.`)) return;
        store.removePage(id);
        undoToast(`${i + 1}쪽을 뺐어요`);
      }
    }
    document.addEventListener('click', onKeyClick);

    // 색인에서 ≡ 끌어 순서 바꾸기(마우스·터치·펜 모두)
    function wireIdxDrag(ol) {
      if (!ol) return;
      ol.querySelectorAll('.idx-grip').forEach(grip => {
        grip.addEventListener('pointerdown', e0 => {
          e0.preventDefault();
          const li = grip.closest('li'), id = li.dataset.pid;
          const rows = [...ol.children], from = rows.indexOf(li);
          // 다른 줄들의 처음 자리(끌리는 줄은 빼고): 놓을 자리 = 손가락보다 위에 가운데가 있는 줄 수
          const others = rows.filter(r => r !== li).map(r => { const b = r.getBoundingClientRect(); return { r, mid: b.top + b.height / 2 }; });
          let to = from;
          try { grip.setPointerCapture(e0.pointerId); } catch (err) { /* */ }
          li.classList.add('idx-drag');
          document.documentElement.classList.add('bj-dragging');
          const move = e => {
            const y = e.clientY;
            to = others.filter(o => o.mid < y).length;
            others.forEach((o, k) => o.r.classList.toggle('idx-target', to !== from && (to > from ? k === to - 1 : k === to)));
            li.style.transform = `translateY(${y - e0.clientY}px)`;
          };
          const up = () => {
            grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
            document.documentElement.classList.remove('bj-dragging');
            li.style.transform = ''; li.classList.remove('idx-drag'); rows.forEach(r => r.classList.remove('idx-target'));
            if (to !== from) store.movePage(id, to);
          };
          grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
        });
      });
    }

    // 속지 끼우기 창
    function openAdd() {
      const dlg = $('pageDlg');
      const today = BJStore.todayStr();
      $('pageDate').value = today;
      $('pageTitle').value = '';
      const sync = () => {
        const t = dlg.querySelector('input[name=ptype]:checked').value;
        $('pageDateLab').hidden = t === 'note'; $('pageNoteBox').hidden = t !== 'note';
        $('pageDateLab').firstChild.textContent = { month: '어느 달 ', week: '어느 주(그 주의 아무 날) ', day: '어느 날 ' }[t] || '';
      };
      dlg.querySelectorAll('input[name=ptype]').forEach(r => { r.onchange = sync; });
      sync();
      dlg.returnValue = '';
      dlg.showModal();
      dlg.onclose = () => {
        if (dlg.returnValue !== 'add') return;
        const type = dlg.querySelector('input[name=ptype]:checked').value;
        const before = store.pages().length;
        const id = store.addPage({ type, period: $('pageDate').value || today, paper: dlg.querySelector('input[name=paper]:checked').value, title: $('pageTitle').value });
        if (!id) return;
        const no = store.pages().findIndex(p => p.id === id) + 1;
        if (store.pages().length === before) toast(`이미 ${no}쪽에 있어요`, [{ label: '열기', fn: () => go(id, 1) }]);
        else toast(`${no}쪽에 끼웠어요`, [{ label: '열기', fn: () => go(id, 1) }, { label: '실행 취소', fn: () => { if (store.undo()) toast('되돌렸어요'); } }]);
      };
    }

    /* ---------- 노트 속지 ---------- */
    let tool = 'pen', color = 0, width = 1;
    const fingerDraws = () => { const f = get(FINGER_KEY); return f === '1' ? true : f === '0' ? false : get(PEN_KEY) !== '1'; };
    function renderNote(host, c) {
      const p = c.page;
      if (!mounted || mounted.id !== c.id) {
        host.innerHTML = `<section class="pg pg-note">
          <div class="note-bar" role="toolbar" aria-label="노트 도구">
            <input id="noteTitle" class="note-title" type="text" maxlength="40" placeholder="노트 제목" aria-label="노트 제목" />
            <div class="note-tools">
              <div class="seg" role="group" aria-label="도구">
                <button type="button" data-tool="pen" aria-label="펜">✎</button>
                <button type="button" data-tool="hl" aria-label="형광펜">▍</button>
                <button type="button" data-tool="erase" aria-label="지우개">⌫</button>
              </div>
              <div class="note-colors" role="group" aria-label="색">${COLORS.map((col, i) => `<button type="button" data-color="${i}" class="sw" style="--sw:${col || 'var(--text)'}" aria-label="색 ${i + 1}"></button>`).join('')}</div>
              <div class="seg" role="group" aria-label="굵기">${PEN_W.map((w, i) => `<button type="button" data-width="${i}" aria-label="굵기 ${['가늘게', '보통', '굵게'][i]}"><i style="--w:${2 + i * 2}px"></i></button>`).join('')}</div>
              <button type="button" id="noteFinger" class="icon-btn" aria-pressed="false" title="손가락으로도 쓰기">✋</button>
              <button type="button" id="noteUndo" class="icon-btn" title="한 획 되돌리기" aria-label="한 획 되돌리기">↶</button>
              <select id="notePaper" aria-label="속지 모양">${Object.entries(PAPER_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
              <button type="button" id="noteClear" class="link-btn">모두 지우기</button>
            </div>
          </div>
          <div class="paper-wrap"><div id="paper" class="paper"><canvas id="inkCanvas" aria-label="손글씨 노트"></canvas><span class="paper-no" aria-hidden="true"></span></div></div>
          <p id="noteHint" class="hint note-hint"></p>
        </section>`;
        wireNoteBar(c.id);
        ink.attach($('paper'), $('inkCanvas'), c.id);
      }
      const title = $('noteTitle'); if (document.activeElement !== title) title.value = p.title || '';
      $('notePaper').value = p.paper;
      $('paper').className = 'paper paper-' + p.paper;
      host.querySelector('.paper-no').textContent = c.no;
      host.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
      host.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.color === color)));
      host.querySelectorAll('[data-width]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.width === width)));
      const fd = fingerDraws();
      $('noteFinger').setAttribute('aria-pressed', String(fd));
      $('noteHint').textContent = fd ? '손가락·펜으로 써요. 넘기기는 머리의 ‹ › 로 (✋를 끄면 손가락은 넘기기 전용)' : 'S펜으로 써요. 손가락은 좌우로 밀어 넘기기 · 펜 옆 버튼을 누른 채 쓰면 지우개';
      $('noteUndo').disabled = !ink.canUndo();
      ink.draw();
    }
    function wireNoteBar(id) {
      const host = $('binderView');
      host.querySelector('.note-bar').onclick = e => {
        const t = e.target.closest('[data-tool]'), cl = e.target.closest('[data-color]'), w = e.target.closest('[data-width]');
        if (t) tool = t.dataset.tool;
        else if (cl) { color = +cl.dataset.color; if (tool === 'erase') tool = 'pen'; }
        else if (w) { width = +w.dataset.width; if (tool === 'erase') tool = 'pen'; }
        else if (e.target.closest('#noteFinger')) put(FINGER_KEY, fingerDraws() ? '0' : '1');
        else if (e.target.closest('#noteUndo')) ink.undo();
        else if (e.target.closest('#noteClear')) { if ((store.page(id)?.ink || []).length && confirm('이 노트의 손글씨를 모두 지울까요?')) { ink.push(); store.clearInk(id); } return; }
        else return;
        renderNote(host, current());
      };
      $('notePaper').onchange = e => store.setPageNote(id, { paper: e.target.value });
      const title = $('noteTitle');
      title.onchange = () => store.setPageNote(id, { title: title.value });
      title.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); title.blur(); } };
    }

    /* 손글씨 그리기 */
    const ink = (() => {
      let paper = null, canvas = null, pageId = null, scale = 1, live = null, hidden = new Set(), ro = null;
      const undoStack = [];
      const strokes = () => (store.page(pageId)?.ink || []);
      function fit() {
        if (!paper) return;
        const wrap = paper.parentElement, top = wrap.getBoundingClientRect().top + window.scrollY;
        const availH = Math.max(320, window.innerHeight - (top - window.scrollY) - 16);
        const cssW = Math.min(wrap.clientWidth, availH * W / H, 900);
        paper.style.width = cssW + 'px'; paper.style.height = cssW * H / W + 'px';
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssW * H / W * dpr);
        canvas.style.width = cssW + 'px'; canvas.style.height = cssW * H / W + 'px';
        scale = canvas.width / W;
        draw();
      }
      const inkColor = i => COLORS[i] || getComputedStyle(document.body).getPropertyValue('--text').trim() || '#2A2A2A';
      function drawStroke(ctx, s) {
        const [t, ci, wi] = s, n = (s.length - 3) / 3;
        if (n < 1) return;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = inkColor(ci);
        const P = k => [s[3 + k * 3] * scale, s[4 + k * 3] * scale, s[5 + k * 3]];
        if (t === 1) { // 형광펜: 한 길로(겹친 곳이 진해지지 않게), 반투명
          ctx.globalAlpha = 0.32; ctx.lineWidth = HL_W * scale; ctx.lineCap = 'butt';
          ctx.beginPath(); const [x0, y0] = P(0); ctx.moveTo(x0, y0);
          for (let k = 1; k < n; k++) { const [x, y] = P(k); ctx.lineTo(x, y); }
          if (n === 1) ctx.lineTo(x0 + 0.1, y0);
          ctx.stroke(); ctx.globalAlpha = 1; return;
        }
        const base = (PEN_W[wi] || PEN_W[1]) * scale, wOf = p => base * (0.45 + 0.55 * p / 9);
        if (n === 1) { const [x, y, p] = P(0); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x, y, wOf(p) / 2, 0, Math.PI * 2); ctx.fill(); return; }
        // 점 사이 가운데를 이어 부드럽게(굵기는 압력)
        let [px, py, pp] = P(0), mx = px, my = py;
        for (let k = 1; k < n; k++) {
          const [x, y, p] = P(k), nx = (px + x) / 2, ny = (py + y) / 2;
          ctx.lineWidth = wOf((pp + p) / 2);
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(px, py, nx, ny); ctx.stroke();
          mx = nx; my = ny; px = x; py = y; pp = p;
        }
        ctx.lineWidth = wOf(pp); ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(px, py); ctx.stroke();
      }
      function draw() {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokes().forEach((s, i) => { if (!hidden.has(i)) drawStroke(ctx, s); });
        if (live && live.length > 3) drawStroke(ctx, live);
      }
      const toPage = e => { const r = canvas.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * W), Math.round((e.clientY - r.top) / r.width * W)]; };
      const pressureOf = e => e.pointerType === 'pen' && e.pressure > 0 ? Math.max(1, Math.min(9, Math.round(e.pressure * 9))) : 5;
      // 지우개: 획의 선분과 가까우면 그 획
      function hits(x, y) {
        const out = [];
        strokes().forEach((s, i) => {
          if (hidden.has(i)) return;
          const r = ERASE_R + (s[0] === 1 ? HL_W / 2 : (PEN_W[s[2]] || 5) / 2);
          for (let k = 3; k < s.length; k += 3) {
            const ax = s[k], ay = s[k + 1], bx = s[k + 3] ?? ax, by = s[k + 4] ?? ay;
            const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
            const ex = ax + u * dx - x, ey = ay + u * dy - y;
            if (ex * ex + ey * ey <= r * r) { out.push(i); break; }
          }
        });
        return out;
      }
      function onDown(e) {
        if (e.pointerType === 'pen') { if (get(PEN_KEY) !== '1') { put(PEN_KEY, '1'); } }
        if (e.pointerType === 'touch' && !fingerDraws()) return; // 손가락 = 넘기기(스와이프는 touch 이벤트에서)
        if (e.button > 0 && e.pointerType === 'mouse') return;
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 등 */ }
        const erasing = tool === 'erase' || e.button === 5 || (e.pointerType === 'pen' && (e.buttons & 34));
        const [x, y] = toPage(e);
        if (erasing) {
          hidden = new Set(hits(x, y)); live = null; draw();
        } else {
          hidden = new Set();
          live = [tool === 'hl' ? 1 : 0, tool === 'hl' && color === 0 ? 4 : color, width, x, y, pressureOf(e)];
          draw();
        }
        const move = ev => {
          const list = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
          (list.length ? list : [ev]).forEach(pe => {
            const [px, py] = toPage(pe);
            if (erasing) { hits(px, py).forEach(i => hidden.add(i)); return; }
            const lx = live[live.length - 3], ly = live[live.length - 2];
            if ((px - lx) ** 2 + (py - ly) ** 2 < 2.5) { live[live.length - 1] = Math.max(live[live.length - 1], pressureOf(pe)); return; }
            live.push(px, py, pressureOf(pe));
          });
          draw();
        };
        const up = () => {
          canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
          if (erasing) { const idx = [...hidden]; hidden = new Set(); if (idx.length) { push(); store.eraseStrokes(pageId, idx); } else draw(); return; }
          const s = live; live = null;
          if (s && s.length >= 6) { push(); store.addStroke(pageId, s); } else draw();
        };
        canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      }
      // 여러 번 되돌리기(이 노트를 보는 동안). 다른 기기에서 바뀌면 비움
      function push() { undoStack.push(JSON.stringify(strokes())); if (undoStack.length > 60) undoStack.shift(); }
      store.subscribe((_, meta) => { if (meta && meta.remote) undoStack.length = 0; });
      // 어두운 모드로 바뀌면 기본 펜 색(글자색)으로 다시 그림
      root.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => draw());
      return {
        attach(p, c, id) {
          paper = p; canvas = c; pageId = id; undoStack.length = 0; hidden = new Set(); live = null;
          canvas.addEventListener('pointerdown', onDown);
          canvas.addEventListener('contextmenu', e => e.preventDefault());
          ro = new ResizeObserver(() => fit()); ro.observe(paper.parentElement);
          window.addEventListener('resize', fit);
          requestAnimationFrame(fit);
        },
        detach() { ro?.disconnect(); ro = null; window.removeEventListener('resize', fit); paper = canvas = pageId = null; undoStack.length = 0; },
        draw, push,
        canUndo: () => undoStack.length > 0,
        undo() {
          if (!undoStack.length) return;
          const prev = JSON.parse(undoStack.pop()), pg = store.page(pageId);
          if (!pg) return;
          store.setInk(pageId, prev);
        },
      };
    })();

    /* ---------- 스와이프로 넘기기(손가락만. S펜은 쓰기) ---------- */
    let sw = null;
    document.addEventListener('touchstart', e => {
      sw = null;
      if (!active() || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.touchType === 'stylus') return;
      const el = e.target;
      if (el.closest('input, textarea, select, dialog, .menu, .idx-grip, .note-bar')) return;
      if (el.closest('#inkCanvas') && fingerDraws()) return;
      sw = { x: t.clientX, y: t.clientY, t: Date.now(), el };
    }, { passive: true });
    document.addEventListener('touchend', e => {
      const s = sw; sw = null;
      if (!s || !active() || document.documentElement.classList.contains('bj-dragging')) return;
      const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - s.t > 700) return;
      // 옆으로 스크롤되는 칸 안에서 아직 더 갈 곳이 있으면 그 칸이 먼저
      for (let n = s.el; n && n !== document.body; n = n.parentElement) {
        if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) {
          if (dx < 0 ? n.scrollLeft + n.clientWidth < n.scrollWidth - 2 : n.scrollLeft > 2) return;
        }
      }
      step(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('touchcancel', () => { sw = null; }, { passive: true });
    // 키보드: 입력 중이 아니면 PageUp/PageDown, Alt+←/→
    document.addEventListener('keydown', e => {
      if (!active() || e.target.closest?.('input, textarea, select, dialog')) return;
      if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) { e.preventDefault(); step(1); }
      else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) { e.preventDefault(); step(-1); }
    });

    $('pgPrev').onclick = () => step(-1);
    $('pgNext').onclick = () => step(1);
    $('pgLabel').onclick = () => { const c = current(); if (c && c.kind !== 'key') go('key', -1); };

    return { active, current, renderChrome, renderOwn, go, step, pageName, isBinderHash };
  }

  root.BJBinder = { create, W, H, COLORS };
})(window);
