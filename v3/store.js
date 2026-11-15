/* 오늘한칸 v3 — 데이터 저장소 (체험판: 이 기기 브라우저 localStorage).
 * 설계: docs/v3_설계.md 6장. 구조(영역·프로젝트·작업)와 계획(작업을 기간에 놓은 기록)을 나눔.
 * 나중에 Supabase(bj_ 테이블)로 바꿀 때 이 파일의 load/save만 바꾸면 되도록 화면은 아래 함수만 씀. */
(function (root) {
  'use strict';
  const KEY = 'bj.v3';
  const VERSION = 1;
  const AREA_SEED = [['독서', '#6FA8DC'], ['그림', '#F2A0B6'], ['취업(일)', '#F0B85A'], ['생활', '#7CCBA6']];
  const LEVELS = ['year', 'month', 'week', 'day'];
  const KINDS = ['task', 'event', 'note'];
  // 기호 기본값(결 지정 2026-11-15): • 할일 · * 일정 · - 메모 · • 완료(줄긋기) · > 다음으로. 완료를 비우면 원래 기호 그대로
  const DEFAULT_SYMBOLS = { task: '•', event: '*', note: '-', done: '•', migrated: '>' };

  const pad = n => String(n).padStart(2, '0');
  const dateStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
  const weekStart = s => { const d = parseDate(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return dateStr(d); };
  const todayStr = () => dateStr(new Date());
  let seq = 0;
  const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 7);

  function fresh() {
    return {
      version: VERSION,
      areas: AREA_SEED.map(([name, color], i) => ({ id: uid(), name, color, order: i, archived: false })),
      projects: [], tasks: [], plans: [],
      settings: { dayStart: 360, dayEnd: 1440, symbols: { ...DEFAULT_SYMBOLS }, strikeDone: true },
    };
  }

  function createStore(storage) {
    const listeners = new Set();
    let undoSnap = null;
    let state = load();

    function load() {
      try {
        const raw = storage && storage.getItem(KEY);
        if (raw) { const s = JSON.parse(raw); if (s && s.version === VERSION) return s; }
      } catch (e) { /* 저장소를 못 읽으면 새로 시작 */ }
      return fresh();
    }
    function save() { try { storage && storage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 저장 실패해도 화면은 계속 */ } }
    function emit() { listeners.forEach(f => f(state)); }
    function mutate(label, fn) {
      const before = JSON.stringify(state);
      const result = fn(state);
      if (JSON.stringify(state) === before) return result;
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

    function newPlan(s, taskId, { level = 'day', period, start = null, duration = null, fromPlanId = null }) {
      const p = { id: uid(), taskId, level, period, start, duration: start == null ? null : (duration || 30), status: 'open', order: nextOrder(), fromPlanId, createdAt: Date.now(), doneAt: null };
      s.plans.push(p);
      return p;
    }
    function sortPlans(list) {
      return list.sort((a, b) => (a.start == null) - (b.start == null) || (a.start ?? 0) - (b.start ?? 0) || a.order - b.order);
    }

    const api = {
      get state() { return state; },
      subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
      task, plan, area, project, plansOfTask, livePlanOn,
      areas: () => state.areas.filter(a => !a.archived).sort((a, b) => a.order - b.order),
      projects: areaId => state.projects.filter(p => p.status !== 'done' && (areaId === undefined || p.areaId === areaId)),
      plansOn: (level, period) => sortPlans(state.plans.filter(p => p.level === level && p.period === period)),

      /* 계획에 바로 적기 = 작업도 함께 생김(설계 6장: 계획은 항상 작업을 가리킴) */
      addPlan({ title, kind = 'task', level = 'day', period, start = null, duration = null, areaId = null, projectId = null }) {
        title = String(title || '').trim();
        if (!title || !LEVELS.includes(level) || !period) return null;
        return mutate('적기', s => {
          const t = { id: uid(), title, kind: KINDS.includes(kind) ? kind : 'task', areaId, projectId, status: 'open', createdAt: Date.now(), doneAt: null };
          s.tasks.push(t);
          return newPlan(s, t.id, { level, period, start, duration }).id;
        });
      },
      /* 이번 주 → 오늘처럼, 이미 있는 작업을 다른 기간에 놓기. 같은 날에 이미 있으면 그 계획의 시간만 바꿈 */
      placeTask(taskId, { level = 'day', period, start = null, duration = null }) {
        if (!task(taskId)) return null;
        return mutate('가져오기', s => {
          const existing = livePlanOn(taskId, level, period);
          if (existing) { existing.start = start; existing.duration = start == null ? null : (duration || existing.duration || 30); return existing.id; }
          return newPlan(s, taskId, { level, period, start, duration }).id;
        });
      },
      setPlanTime(planId, start, duration) {
        const p = plan(planId); if (!p) return;
        mutate(start == null ? '시간 빼기' : '옮기기', () => {
          if (start == null) { p.start = null; p.duration = null; return; }
          const d = Math.max(15, duration || p.duration || 30);
          p.start = Math.max(0, Math.min(1440 - d, start));
          p.duration = Math.min(d, 1440 - p.start);
        });
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
      assignTask(taskId, { areaId = null, projectId = null, newProjectName = '' }) {
        const t = task(taskId); if (!t) return;
        mutate('영역·프로젝트', s => {
          newProjectName = String(newProjectName || '').trim();
          if (newProjectName) {
            const pr = { id: uid(), areaId, name: newProjectName, status: 'active', createdAt: Date.now() };
            s.projects.push(pr); projectId = pr.id;
          }
          const pr = projectId ? s.projects.find(x => x.id === projectId) : null;
          t.projectId = pr ? pr.id : null;
          t.areaId = pr ? pr.areaId : areaId;
        });
      },
      /* 옮기기(>): 이 계획은 '옮김'으로 남기고 다른 날에 새 계획 */
      migratePlan(planId, toPeriod) {
        const p = plan(planId); if (!p || p.status !== 'open' || toPeriod === p.period) return null;
        return mutate('옮기기', s => {
          const existing = livePlanOn(p.taskId, p.level, toPeriod);
          p.status = 'migrated';
          return existing ? existing.id : newPlan(s, p.taskId, { level: p.level, period: toPeriod, start: p.start, duration: p.duration, fromPlanId: p.id }).id;
        });
      },
      /* 계획 지우기. 다른 계획도 프로젝트도 없는 작업이면 작업도 지움 */
      deletePlan(planId) {
        const p = plan(planId); if (!p) return;
        mutate('지우기', s => {
          s.plans = s.plans.filter(x => x.id !== planId);
          const t = s.tasks.find(x => x.id === p.taskId);
          if (t && !t.projectId && !s.plans.some(x => x.taskId === t.id)) s.tasks = s.tasks.filter(x => x.id !== t.id);
        });
      },
      /* 어제 계획 가져오기(반복 대신): 같은 작업에 오늘 계획을 하나 더. 시간도 그대로. 이미 오늘에 있으면 건너뜀 */
      importPlans(planIds, toPeriod) {
        return mutate('가져오기', s => {
          let n = 0;
          planIds.forEach(id => {
            const p = s.plans.find(x => x.id === id);
            if (!p || livePlanOn(p.taskId, 'day', toPeriod)) return;
            newPlan(s, p.taskId, { level: 'day', period: toPeriod, start: p.start, duration: p.duration, fromPlanId: p.id });
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
      canUndo: () => !!undoSnap,
      undo() {
        if (!undoSnap) return false;
        state = JSON.parse(undoSnap.json); undoSnap = null; save(); emit();
        return true;
      },
      /* 기호 설정. 한 칸에 최대 3글자. 할일·일정·메모·옮김을 비우면 기본값, 완료를 비우면 원래 기호 그대로 */
      symbols() {
        const s = { ...DEFAULT_SYMBOLS, ...(state.settings.symbols || {}) };
        ['task', 'event', 'note', 'migrated'].forEach(k => { if (!s[k]) s[k] = DEFAULT_SYMBOLS[k]; });
        return s;
      },
      strikeDone: () => state.settings.strikeDone !== false,
      setSymbols(symbols, strikeDone) {
        mutate('기호 설정', s => {
          const clean = {};
          Object.keys(DEFAULT_SYMBOLS).forEach(k => { clean[k] = Array.from(String(symbols[k] ?? '').trim()).slice(0, 3).join(''); });
          s.settings.symbols = clean;
          s.settings.strikeDone = !!strikeDone;
        });
      },
      reset() { state = fresh(); undoSnap = null; save(); emit(); },
    };
    return api;
  }

  root.BJStore = { createStore, dateStr, parseDate, addDays, weekStart, todayStr, KEY, DEFAULT_SYMBOLS };
})(typeof window !== 'undefined' ? window : globalThis);
