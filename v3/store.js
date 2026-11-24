/* 오늘한칸 v3 — 데이터 저장소 (체험판: 이 기기 브라우저 localStorage).
 * 설계: docs/v3_설계.md 6장. 구조(영역·프로젝트·작업)와 계획(작업을 기간에 놓은 기록)을 나눔.
 * 나중에 Supabase(bj_ 테이블)로 바꿀 때 이 파일의 load/save만 바꾸면 되도록 화면은 아래 함수만 씀. */
(function (root) {
  'use strict';
  const KEY = 'bj.v3';
  const VERSION = 3; // 3: 목표(월간·주간)와 할 일(goalId로 연결) 나누기(2026-11-18)
  // 2026-11-15 결의 노트 영역(일·그림공부·독서·브랜딩·여가) + 생활. 설정에서 이름·색·순서를 바꿀 수 있음
  const AREA_SEED = [['일', '#F0B85A'], ['그림공부', '#F2A0B6'], ['독서', '#6FA8DC'], ['브랜딩', '#A98BD9'], ['여가', '#5EC4C4'], ['생활', '#94C973']];
  const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  const LEVELS = ['year', 'month', 'week', 'day'];
  // 하루 3구간(결의 월간 노트: 하루 3줄). 오전 12시 전 / 오후 12~18시 / 저녁 18시 이후
  const SLOTS = ['am', 'pm', 'eve'];
  const slotOfMinute = m => (m < 720 ? 'am' : m < 1080 ? 'pm' : 'eve');
  const slotOf = p => (p.start != null ? slotOfMinute(p.start) : (SLOTS.includes(p.slot) ? p.slot : null));
  const KINDS = ['task', 'event', 'note'];
  const PAGE_TYPES = ['day', 'week', 'month', 'note'];
  const PAPERS = ['blank', 'line', 'grid', 'dot'];
  // 기호 기본값(결 지정 2026-11-15): • 할일 · * 일정 · - 메모 · • 완료(줄긋기) · > 다음으로. 완료를 비우면 원래 기호 그대로
  const DEFAULT_SYMBOLS = { task: '•', event: '*', note: '-', done: '•', migrated: '>' };

  const pad = n => String(n).padStart(2, '0');
  const dateStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
  // 한 주는 일요일부터(결 지정 2026-11-15)
  const weekStart = s => { const d = parseDate(s); d.setDate(d.getDate() - d.getDay()); return dateStr(d); };
  const todayStr = () => dateStr(new Date());
  let seq = 0;
  const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 7);

  function fresh() {
    return {
      version: VERSION,
      areas: AREA_SEED.map(([name, color], i) => ({ id: uid(), name, color, order: i, archived: false })),
      projects: [], tasks: [], plans: [], pages: [],
      settings: { dayStart: 360, dayEnd: 1440, symbols: { ...DEFAULT_SYMBOLS }, strikeDone: true },
    };
  }

  /* 1 → 2: 영역을 노트 영역으로(이름이 옛 기본값 그대로일 때만 바꿈), 없는 기본 영역 추가, 주간 계획을 일요일 시작 주로 */
  function migrate(s) {
    if (s.version === 1) {
      const OLD = { '취업(일)': ['일', '#F0B85A'], '그림': ['그림공부', '#F2A0B6'], '독서': ['독서', '#6FA8DC'], '생활': ['생활', '#7CCBA6'] };
      s.areas.forEach(a => { const o = OLD[a.name]; if (o) { if (a.color === OLD[a.name][1] && a.name !== '생활') a.color = (AREA_SEED.find(x => x[0] === o[0]) || [])[1] || a.color; a.name = o[0]; } });
      AREA_SEED.forEach(([name, color]) => { if (!s.areas.some(a => a.name === name)) s.areas.push({ id: uid(), name, color, order: 99, archived: false }); });
      const rank = a => { const i = AREA_SEED.findIndex(x => x[0] === a.name); return i < 0 ? 50 + a.order : i; };
      s.areas.sort((a, b) => rank(a) - rank(b)).forEach((a, i) => { a.order = i; });
      const seen = new Set();
      s.plans = s.plans.filter(p => {
        if (p.level !== 'week') return true;
        p.period = weekStart(p.period);
        const k = p.taskId + p.period + (p.status === 'migrated' ? p.id : '');
        if (seen.has(k)) return false; seen.add(k); return true;
      });
      s.version = 2;
    }
    /* 2 → 3: 목표와 할 일 나누기. 두 기기가 따로 바꿔도 같은 결과가 나오게 새 id는 고정 규칙으로 만듦
     * - 프로젝트 → 목표(그 프로젝트를 만든 달의 월간 목표). 프로젝트에 연결된 작업은 그 목표의 할 일
     * - 월간·주간에 놓인 작업 = 목표. 그 작업을 날짜에 놓은 계획은 새 할 일(같은 이름, 목표에 연결)로 옮김 */
    if (s.version === 2) {
      const monthOf = ms => { const d = new Date(ms || 0); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; };
      (s.projects || []).forEach(pr => {
        const gid = 'g-' + pr.id;
        if (!s.tasks.some(t => t.id === gid)) {
          s.tasks.push({ id: gid, title: pr.name, kind: 'task', areaId: pr.areaId || null, goal: true, status: pr.status === 'done' ? 'done' : 'open', createdAt: pr.createdAt || 0, doneAt: null });
          s.plans.push({ id: 'gp-' + pr.id, taskId: gid, level: 'month', period: monthOf(pr.createdAt), start: null, duration: null, slot: null, status: 'open', order: pr.createdAt || 0, fromPlanId: null, createdAt: pr.createdAt || 0, doneAt: null });
        }
        s.tasks.forEach(t => { if (t.projectId === pr.id) { t.goalId = gid; } });
      });
      s.tasks.forEach(t => { delete t.projectId; });
      s.projects = [];
      const goalIds = new Set(s.plans.filter(p => p.level === 'month' || p.level === 'week').map(p => p.taskId));
      s.tasks.slice().forEach(t => {
        if (!goalIds.has(t.id)) return;
        t.goal = true;
        const days = s.plans.filter(p => p.taskId === t.id && p.level === 'day');
        if (!days.length) return;
        const sid = t.id + '-s';
        if (!s.tasks.some(x => x.id === sid)) s.tasks.push({ id: sid, title: t.title, kind: t.kind, areaId: t.areaId || null, goalId: t.id, status: 'open', createdAt: t.createdAt || 0, doneAt: null });
        days.forEach(p => { p.taskId = sid; });
      });
      s.version = 3;
    }
    return s;
  }
  const upgrade = x => (x && x.version < VERSION ? migrate(JSON.parse(JSON.stringify(x))) : x);

  /* ---------- 계정 연동용: 고친 시각 도장 + 합치기 (2026-11-17) ----------
   * 항목(영역·프로젝트·작업·계획)마다 u = 마지막으로 고친 시각(ms). 지운 항목은 state.gone[id] = 지운 시각.
   * 설정은 state.settingsU. 두 기기 기록을 합칠 때 항목별로 더 최근 것을 남기고, 지운 뒤 다시 안 고친 항목은 뺀다. */
  const COLS = ['areas', 'projects', 'tasks', 'plans', 'pages']; // pages = 바인더 속지(2026-11-24, 설계 10장)
  function stamp(before, after, now) {
    after.gone = after.gone || {};
    COLS.forEach(c => {
      const old = new Map((before[c] || []).map(x => [x.id, JSON.stringify(x)]));
      const ids = new Set();
      (after[c] || []).forEach(x => {
        ids.add(x.id);
        if (old.get(x.id) !== JSON.stringify(x)) { x.u = now; delete after.gone[x.id]; }
      });
      old.forEach((_, id) => { if (!ids.has(id)) after.gone[id] = now; });
    });
    if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) after.settingsU = now;
  }
  // b = 서버 쪽. 더 최근인지 가릴 수 없으면(도장 같음·없음) b를 남김
  function merge(a, b) {
    a = upgrade(a); b = upgrade(b); // 옛 버전 기기 기록도 같은 규칙으로 바꾼 뒤 합침
    if (!b || typeof b !== 'object') return JSON.parse(JSON.stringify(a));
    if (!a || typeof a !== 'object') return JSON.parse(JSON.stringify(b));
    const out = { version: Math.max(a.version || 0, b.version || 0), gone: { ...(a.gone || {}) } };
    Object.entries(b.gone || {}).forEach(([id, t]) => { if (!(out.gone[id] >= t)) out.gone[id] = t; });
    COLS.forEach(c => {
      const m = new Map();
      [...(a[c] || []), ...(b[c] || [])].forEach(x => { const cur = m.get(x.id); if (!cur || (x.u || 0) >= (cur.u || 0)) m.set(x.id, x); });
      out[c] = [...m.values()].filter(x => !(out.gone[x.id] > (x.u || 0))).map(x => JSON.parse(JSON.stringify(x)));
    });
    // 이름이 같은 영역은 하나로(기기마다 기본 영역이 다른 id로 생기므로). 남길 것은 최근 고친 것, 같으면 id 순 → 어느 기기에서 합쳐도 같은 결과
    const keep = new Map(), remap = new Map();
    out.areas.forEach(x => {
      const k = String(x.name || '').trim();
      const cur = keep.get(k);
      if (!cur) { keep.set(k, x); return; }
      const win = (x.u || 0) > (cur.u || 0) || ((x.u || 0) === (cur.u || 0) && x.id < cur.id) ? x : cur;
      const lose = win === x ? cur : x;
      keep.set(k, win); remap.set(lose.id, win.id);
    });
    if (remap.size) {
      out.areas = [...keep.values()];
      const fix = id => { let r = id; for (let i = 0; i < 5 && remap.has(r); i++) r = remap.get(r); return r; };
      out.tasks.forEach(t => { if (t.areaId) t.areaId = fix(t.areaId); });
      out.projects.forEach(p => { if (p.areaId) p.areaId = fix(p.areaId); });
    }
    out.areas.sort((x, y) => (x.order ?? 0) - (y.order ?? 0)).forEach((x, i) => { x.order = i; });
    const sa = a.settingsU || 0, sb2 = b.settingsU || 0;
    out.settings = JSON.parse(JSON.stringify(sb2 >= sa ? b.settings : a.settings));
    out.settingsU = Math.max(sa, sb2);
    return out;
  }
  // 키 순서와 상관없이 같은 기록인지 비교(서버 jsonb는 키 순서를 바꿈)
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }

  // 도장 시계: 같은 1ms 안에 여러 번 고쳐도 순서가 섞이지 않게 항상 앞으로만
  let clock = 0;
  const tick = () => (clock = Math.max(Date.now(), clock + 1));

  function createStore(storage) {
    const listeners = new Set();
    let undoSnap = null;
    let state = load();

    function load() {
      try {
        const raw = storage && storage.getItem(KEY);
        if (raw) {
          let s = JSON.parse(raw);
          if (s && s.version < VERSION) { s = migrate(s); try { storage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 다음에 */ } }
          if (s && s.version === VERSION) { if (!Array.isArray(s.pages)) s.pages = []; return s; }
        }
      } catch (e) { /* 저장소를 못 읽으면 새로 시작 */ }
      return fresh();
    }
    function save() { try { storage && storage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 저장 실패해도 화면은 계속 */ } }
    function emit(meta = {}) { listeners.forEach(f => f(state, meta)); }
    function mutate(label, fn) {
      const before = JSON.stringify(state);
      const result = fn(state);
      if (JSON.stringify(state) === before) return result;
      stamp(JSON.parse(before), state, tick());
      undoSnap = { label, json: before };
      save(); emit();
      return result;
    }

    const find = (list, id) => state[list].find(x => x.id === id) || null;
    const task = id => find('tasks', id);
    const plan = id => find('plans', id);
    const area = id => find('areas', id);
    const project = id => find('projects', id);
    const plansOfTask = taskId => state.plans.filter(p => p.taskId === taskId);
    const livePlanOn = (taskId, level, period) => state.plans.find(p => p.taskId === taskId && p.level === level && p.period === period && p.status !== 'migrated') || null;
    const nextOrder = () => Date.now() + (seq++) / 1000;

    function newPlan(s, taskId, { level = 'day', period, start = null, duration = null, fromPlanId = null, slot = null }) {
      const p = { id: uid(), taskId, level, period, start, duration: start == null ? null : (duration || 30), slot: start == null && SLOTS.includes(slot) ? slot : null, status: 'open', order: nextOrder(), fromPlanId, createdAt: Date.now(), doneAt: null };
      s.plans.push(p);
      return p;
    }
    function doMigrate(s, p, toPeriod) {
      const existing = livePlanOn(p.taskId, p.level, toPeriod);
      p.status = 'migrated';
      return existing ? existing.id : newPlan(s, p.taskId, { level: p.level, period: toPeriod, start: p.start, duration: p.duration, fromPlanId: p.id, slot: p.slot }).id;
    }
    // 시간 있는 것(시간 순) → 시간 없는 것(오전·오후·저녁·구간 없음 순, 그다음 적은 순)
    const slotRank = p => { const i = SLOTS.indexOf(p.slot); return i < 0 ? 9 : i; };
    function sortPlans(list) {
      return list.sort((a, b) => (a.start == null) - (b.start == null) || (a.start ?? 0) - (b.start ?? 0) || (a.start == null ? slotRank(a) - slotRank(b) : 0) || a.order - b.order);
    }

    const api = {
      get state() { return state; },
      subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
      task, plan, area, project, plansOfTask, livePlanOn, slotOf,
      areas: () => state.areas.filter(a => !a.archived).sort((a, b) => a.order - b.order),
      projects: areaId => state.projects.filter(p => p.status !== 'done' && (areaId === undefined || p.areaId === areaId)),
      plansOn: (level, period) => sortPlans(state.plans.filter(p => p.level === level && p.period === period)),

      /* 계획에 바로 적기 = 작업도 함께 생김(설계 6장: 계획은 항상 작업을 가리킴) */
      // 월간·주간에 적으면 목표, 날짜에 적으면 할 일(goalId로 목표에 연결 가능, 영역은 목표를 따름)
      addPlan({ title, kind = 'task', level = 'day', period, start = null, duration = null, areaId = null, goalId = null, slot = null }) {
        title = String(title || '').trim();
        if (!title || !LEVELS.includes(level) || !period) return null;
        return mutate('적기', s => {
          const g = goalId ? s.tasks.find(x => x.id === goalId) : null;
          const t = { id: uid(), title, kind: KINDS.includes(kind) ? kind : 'task', areaId: areaId || (g && g.areaId) || null, status: 'open', createdAt: Date.now(), doneAt: null };
          if (level === 'month' || level === 'week') t.goal = true;
          else if (g) t.goalId = g.id;
          s.tasks.push(t);
          return newPlan(s, t.id, { level, period, start, duration, slot }).id;
        });
      },
      /* 이번 주 → 오늘처럼, 이미 있는 작업을 다른 기간에 놓기. 같은 날에 이미 있으면 그 계획의 시간만 바꿈 */
      placeTask(taskId, { level = 'day', period, start = null, duration = null }) {
        if (!task(taskId)) return null;
        return mutate('가져오기', s => {
          const existing = livePlanOn(taskId, level, period);
          if (existing) { if (start != null) existing.slot = null; existing.start = start; existing.duration = start == null ? null : (duration || existing.duration || 30); return existing.id; }
          return newPlan(s, taskId, { level, period, start, duration }).id;
        });
      },
      setPlanTime(planId, start, duration) {
        const p = plan(planId); if (!p) return;
        mutate(start == null ? '시간 빼기' : '옮기기', () => {
          if (start == null) { p.slot = slotOf(p); p.start = null; p.duration = null; return; } // 시간을 빼도 구간은 남김
          p.slot = null;
          const d = Math.max(15, duration || p.duration || 30);
          p.start = Math.max(0, Math.min(1440 - d, start));
          p.duration = Math.min(d, 1440 - p.start);
        });
      },
      /* 구간(오전·오후·저녁·null) 정하기. 시간이 있던 계획이면 시간을 빼고 그 구간으로 */
      setPlanSlot(planId, slot) {
        const p = plan(planId); if (!p || (slot !== null && !SLOTS.includes(slot))) return;
        mutate('구간', () => { p.start = null; p.duration = null; p.slot = slot; });
      },
      togglePlan(planId) {
        const p = plan(planId); if (!p || p.status === 'migrated' || task(p.taskId)?.kind === 'note') return null;
        return mutate('체크', () => { p.status = p.status === 'done' ? 'open' : 'done'; p.doneAt = p.status === 'done' ? Date.now() : null; return p.status; });
      },
      setTaskStatus(taskId, status) {
        const t = task(taskId); if (!t) return;
        mutate(status === 'done' ? '작업 완료' : '작업 다시 열기', () => { t.status = status; t.doneAt = status === 'done' ? Date.now() : null; });
      },
      renameTask(taskId, title) {
        const t = task(taskId); title = String(title || '').trim(); if (!t || !title) return;
        mutate('이름 바꾸기', () => { t.title = title; });
      },
      setTaskKind(taskId, kind) {
        const t = task(taskId); if (!t || !KINDS.includes(kind)) return;
        mutate('종류 바꾸기', s => {
          t.kind = kind;
          if (kind === 'note') s.plans.forEach(p => { if (p.taskId === taskId && p.status === 'done') { p.status = 'open'; p.doneAt = null; } });
        });
      },
      /* 프로젝트를 고르면 영역은 프로젝트의 영역을 따름 */
      /* 영역·목표 정하기. 목표를 고르면 영역은 목표를 따름. 새 목표 이름을 적으면 그 달의 월간 목표를 만들고 연결 */
      assignTask(taskId, { areaId = null, goalId = null, newGoalName = '', newGoalMonth = null }) {
        const t = task(taskId); if (!t) return;
        mutate('영역·목표', s => {
          newGoalName = String(newGoalName || '').trim();
          if (newGoalName && !t.goal && newGoalMonth) {
            const g = { id: uid(), title: newGoalName, kind: 'task', areaId, goal: true, status: 'open', createdAt: Date.now(), doneAt: null };
            s.tasks.push(g); newPlan(s, g.id, { level: 'month', period: newGoalMonth }); goalId = g.id;
          }
          const g = goalId && !t.goal ? s.tasks.find(x => x.id === goalId && x.goal) : null;
          if (t.goal) { t.areaId = areaId; s.tasks.forEach(x => { if (x.goalId === t.id && !x.areaId) x.areaId = areaId; }); return; }
          t.goalId = g ? g.id : null;
          t.areaId = g && g.areaId ? g.areaId : areaId;
        });
      },
      goals: () => state.tasks.filter(t => t.goal),
      stepsOf: goalId => state.tasks.filter(t => t.goalId === goalId),
      /* 옮기기(>): 이 계획은 '옮김'으로 남기고 다른 날에 새 계획 */
      migratePlan(planId, toPeriod) {
        const p = plan(planId); if (!p || p.status !== 'open' || toPeriod === p.period) return null;
        return mutate('옮기기', s => doMigrate(s, p, toPeriod));
      },
      /* 날짜 바꾸기(2026-11-15 결 보고: 내일로 옮긴 걸 다시 오늘로 못 옮김).
       * - 옮겨 온 계획을 원래 날로 보내면 = 되돌리기: 이 계획을 지우고 원래 계획(>)을 다시 엶. 흔적 없음
       * - 오늘·지난 계획을 뒤로 미루면 = 옮기기(>) 흔적
       * - 그 밖(앞으로 당기기, 아직 안 온 날끼리) = 날짜만 바꿈. 그날에 이미 있으면 합침
       * nowPeriod: 오늘(일간) 또는 이번 주 월요일(주간). 결과 {id, how: restored|migrated|moved|merged} */
      movePlan(planId, toPeriod, nowPeriod) {
        const p = plan(planId); if (!p || p.status !== 'open' || toPeriod === p.period) return null;
        const src = p.fromPlanId ? plan(p.fromPlanId) : null;
        if (src && src.status === 'migrated' && src.period === toPeriod) {
          return mutate('되돌리기', s => {
            s.plans = s.plans.filter(x => x.id !== p.id);
            src.status = 'open'; src.start = p.start; src.duration = p.duration; src.slot = p.slot ?? null;
            return { id: src.id, how: 'restored' };
          });
        }
        if (p.period <= nowPeriod && toPeriod > p.period) return mutate('옮기기', s => ({ id: doMigrate(s, p, toPeriod), how: 'migrated' }));
        return mutate('날짜 바꾸기', s => {
          const ex = livePlanOn(p.taskId, p.level, toPeriod);
          if (ex) { s.plans = s.plans.filter(x => x.id !== p.id); return { id: ex.id, how: 'merged' }; }
          p.period = toPeriod;
          return { id: p.id, how: 'moved' };
        });
      },
      /* ">" 줄 되돌리기: 이 계획에서 옮겨 간 계획들(연달아 옮긴 것까지)을 지우고 이 계획을 다시 엶.
       * 옮겨 간 끝 계획을 이미 체크했으면 되돌리지 않음('done') */
      restorePlan(planId) {
        const p = plan(planId); if (!p || p.status !== 'migrated') return null;
        const chain = []; let cur = p, guard = 0;
        while (guard++ < 100) {
          const next = state.plans.find(x => x.fromPlanId === cur.id && !chain.includes(x));
          if (!next) break;
          chain.push(next); if (next.status !== 'migrated') break; cur = next;
        }
        const last = chain[chain.length - 1];
        if (last && last.status === 'done') return 'done';
        return mutate('되돌리기', s => {
          const ids = new Set(chain.map(x => x.id));
          s.plans = s.plans.filter(x => !ids.has(x.id));
          p.status = 'open';
          if (last) { p.start = last.start; p.duration = last.duration; p.slot = last.slot ?? null; }
          return 'restored';
        });
      },
      /* 계획 지우기. 다른 계획도 프로젝트도 없는 작업이면 작업도 지움 */
      deletePlan(planId) {
        const p = plan(planId); if (!p) return;
        mutate('지우기', s => {
          s.plans = s.plans.filter(x => x.id !== planId);
          const t = s.tasks.find(x => x.id === p.taskId);
          if (t && !s.plans.some(x => x.taskId === t.id)) {
            s.tasks = s.tasks.filter(x => x.id !== t.id);
            if (t.goal) s.tasks.forEach(x => { if (x.goalId === t.id) x.goalId = null; }); // 목표가 없어지면 할 일은 연결만 풀림
          }
        });
      },
      /* 어제 계획 가져오기(반복 대신): 같은 작업에 오늘 계획을 하나 더. 시간도 그대로. 이미 오늘에 있으면 건너뜀 */
      importPlans(planIds, toPeriod) {
        return mutate('가져오기', s => {
          let n = 0;
          planIds.forEach(id => {
            const p = s.plans.find(x => x.id === id);
            if (!p || livePlanOn(p.taskId, 'day', toPeriod)) return;
            newPlan(s, p.taskId, { level: 'day', period: toPeriod, start: p.start, duration: p.duration, fromPlanId: p.id, slot: p.slot });
            n++;
          });
          return n;
        });
      },
      /* 지금: 지금 시각을 품은 오늘 계획. 안 끝난 것 우선, 그다음 늦게 시작한 것. 없으면 다음 계획 */
      nowPlan(period, minute) {
        const timed = state.plans.filter(p => p.level === 'day' && p.period === period && p.start != null && p.status !== 'migrated');
        const cur = timed.filter(p => p.start <= minute && minute < p.start + p.duration)
          .sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.start - a.start)[0] || null;
        const next = timed.filter(p => p.start > minute && p.status === 'open').sort((a, b) => a.start - b.start)[0] || null;
        return { current: cur, next };
      },
      /* ---------- 바인더 속지 (설계 10장) ---------- */
      pages: () => [...(state.pages || [])].sort((a, b) => a.order - b.order),
      page: id => (state.pages || []).find(x => x.id === id) || null,
      /* 속지 끼우기. 같은 달 월간·같은 주 주간·같은 날 하루는 한 번만(이미 있으면 그 id). after = 이 속지 뒤에 끼움(없으면 맨 뒤) */
      addPage({ type, period = null, paper = 'line', title = '', after = null }) {
        if (!PAGE_TYPES.includes(type)) return null;
        if (type !== 'note') {
          if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period)) return null;
          period = type === 'month' ? period.slice(0, 8) + '01' : type === 'week' ? weekStart(period) : period;
          const ex = (state.pages || []).find(x => x.type === type && x.period === period);
          if (ex) return ex.id;
        }
        return mutate('속지 끼우기', s => {
          s.pages = s.pages || [];
          const list = [...s.pages].sort((a, b) => a.order - b.order);
          const i = after ? list.findIndex(x => x.id === after) : -1;
          const order = i < 0 || i === list.length - 1 ? (list.length ? list[list.length - 1].order + 1 : 1) : (list[i].order + list[i + 1].order) / 2;
          const pg = { id: uid(), type, period: type === 'note' ? null : period, order, createdAt: Date.now() };
          if (type === 'note') { pg.paper = PAPERS.includes(paper) ? paper : 'line'; pg.title = String(title || '').trim().slice(0, 40); pg.ink = []; }
          s.pages.push(pg);
          return pg.id;
        });
      },
      /* 순서 바꾸기: 이 속지를 toIndex(0부터) 자리로. 쪽수는 순서대로 자동 */
      movePage(id, toIndex) {
        const list = api.pages(), from = list.findIndex(x => x.id === id);
        if (from < 0) return;
        toIndex = Math.max(0, Math.min(list.length - 1, toIndex));
        if (toIndex === from) return;
        mutate('속지 순서', s => {
          const ids = list.map(x => x.id); ids.splice(from, 1); ids.splice(toIndex, 0, id);
          ids.forEach((pid, i) => { const pg = s.pages.find(x => x.id === pid); if (pg.order !== i + 1) pg.order = i + 1; });
        });
      },
      removePage(id) {
        if (!api.page(id)) return;
        mutate('속지 빼기', s => { s.pages = s.pages.filter(x => x.id !== id); });
      },
      setPageNote(id, { title, paper }) {
        const pg = api.page(id); if (!pg || pg.type !== 'note') return;
        mutate('노트', () => {
          if (title !== undefined) pg.title = String(title || '').trim().slice(0, 40);
          if (paper !== undefined && PAPERS.includes(paper)) pg.paper = paper;
        });
      },
      /* 손글씨: 한 획 더하기 / 획 지우기(번호들). 한 번 = 실행 취소 한 번 */
      addStroke(id, stroke) {
        const pg = api.page(id); if (!pg || pg.type !== 'note' || !Array.isArray(stroke) || stroke.length < 6) return;
        const clean = stroke.map(n => Math.round(Number(n) || 0));
        mutate('쓰기', () => { pg.ink = [...(pg.ink || []), clean]; });
      },
      eraseStrokes(id, idxs) {
        const pg = api.page(id); if (!pg || !idxs || !idxs.length) return;
        const drop = new Set(idxs);
        mutate('지우기', () => { pg.ink = (pg.ink || []).filter((_, i) => !drop.has(i)); });
      },
      // 노트 되돌리기용: 획 목록을 통째로 바꿈
      setInk(id, list) {
        const pg = api.page(id); if (!pg || pg.type !== 'note' || !Array.isArray(list)) return;
        const clean = list.filter(Array.isArray).map(st => st.map(n => Math.round(Number(n) || 0)));
        mutate('되돌리기', () => { pg.ink = clean; });
      },
      clearInk(id) {
        const pg = api.page(id); if (!pg || !(pg.ink || []).length) return;
        mutate('모두 지우기', () => { pg.ink = []; });
      },
      canUndo: () => !!undoSnap,
      undo() {
        if (!undoSnap) return false;
        const cur = state;
        state = JSON.parse(undoSnap.json); undoSnap = null;
        stamp(cur, state, tick()); // 되돌린 것도 '지금 고친 것'으로(다른 기기와 합칠 때 되돌림이 이기게)
        save(); emit();
        return true;
      },
      /* 기호 설정. 한 칸에 최대 3글자. 할일·일정·메모·옮김을 비우면 기본값, 완료를 비우면 원래 기호 그대로 */
      symbols() {
        const s = { ...DEFAULT_SYMBOLS, ...(state.settings.symbols || {}) };
        ['task', 'event', 'note', 'migrated'].forEach(k => { if (!s[k]) s[k] = DEFAULT_SYMBOLS[k]; });
        return s;
      },
      strikeDone: () => state.settings.strikeDone !== false,
      /* 설정 저장(한 번에, 실행 취소 한 번). areas: [{id?, name, color, archived}] 보이는 순서대로 */
      saveSettings({ symbols, strikeDone, areas }) {
        mutate('설정', s => {
          if (symbols) {
            const clean = {};
            Object.keys(DEFAULT_SYMBOLS).forEach(k => { clean[k] = Array.from(String(symbols[k] ?? '').trim()).slice(0, 3).join(''); });
            s.settings.symbols = clean;
          }
          if (strikeDone !== undefined) s.settings.strikeDone = !!strikeDone;
          if (areas) {
            const next = [];
            areas.forEach((x, i) => {
              const name = String(x.name || '').trim().slice(0, 20);
              const old = x.id ? s.areas.find(a => a.id === x.id) : null;
              if (!old && !name) return; // 이름 없는 새 영역은 버림
              const a = old || { id: uid() };
              a.name = name || a.name;
              a.color = COLOR_RE.test(x.color || '') ? x.color : (a.color || '#999999');
              a.archived = !!x.archived; a.order = i;
              next.push(a);
            });
            s.areas.forEach(a => { if (!next.includes(a)) { a.order = next.length; next.push(a); } }); // 빠진 영역은 지우지 않음
            s.areas = next;
          }
        });
      },
      allAreas: () => [...state.areas].sort((a, b) => a.order - b.order),
      // 처음부터 다시: 지금 기록을 모두 '지움'으로 표시(계정에 연결돼 있으면 다른 기기에서도 지워짐)
      reset() { const before = state; state = fresh(); stamp(before, state, tick()); undoSnap = null; save(); emit(); },
      /* 계정 연동: 다른 기기 기록과 합친 결과로 바꾸기(실행 취소 기록 없음, 구독자에게 remote 표시) */
      merge: (a, b) => merge(a, b),
      sameAs: (a, b) => canon(a) === canon(b),
      replaceState(next) {
        if (!next || next.version !== VERSION) next = next && next.version < VERSION ? migrate(next) : null;
        if (!next) return false;
        if (!Array.isArray(next.pages)) next = { ...next, pages: [] };
        if (canon(next) === canon(state)) return false;
        state = next; undoSnap = null; save(); emit({ remote: true });
        return true;
      },
      clearLocal() { state = fresh(); undoSnap = null; save(); emit({ remote: true }); },
    };
    return api;
  }

  root.BJStore = { merge, canon, createStore, dateStr, parseDate, addDays, weekStart, todayStr, KEY, DEFAULT_SYMBOLS, AREA_SEED, SLOTS, slotOf, slotOfMinute, PAGE_TYPES, PAPERS };
})(typeof window !== 'undefined' ? window : globalThis);
