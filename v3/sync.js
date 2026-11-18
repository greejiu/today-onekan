/* 오늘한칸 v3 — 계정 연동 (2026-11-17, docs/v3_설계.md · supabase/migrations/20261117120000_bj_state.sql)
 * - 기존 오늘한칸과 같은 Supabase 프로젝트·계정. 같은 주소(greejiu.github.io)라 기존 앱 로그인 상태를 그대로 씀
 * - 기록 전체를 bj_state 한 줄(JSON)로 저장. 저장은 bj_save_state(data, rev): 다른 기기가 먼저 저장했으면 거절(null)
 *   → 서버 기록을 받아 항목별로 합친 뒤(store.merge) 다시 저장
 * - 고칠 때마다 잠시 뒤 저장, 화면으로 돌아오거나 1분마다 새 기록 받기. 인터넷이 끊겨도 이 기기에서는 계속 씀
 * 라이브러리는 화면을 막지 않게 나중에 불러옴. 못 불러오면 '이 기기에만 저장' 상태로 계속 동작 */
(function (root) {
  'use strict';
  const SUPABASE_URL = 'https://mmpsyajgyufdxmmnxqba.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_odr6eVpfut1PbfGcG9vDYQ_pKEVFggA'; // 공개용 키(기존 앱과 같음). 접근은 RLS로 본인 기록만
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js';
  const META_KEY = 'bj.v3.sync';
  const PUSH_DELAY = 800, PULL_EVERY = 60000;

  function createSync(store, { storage, onChange }) {
    let sb = null, user = null, rev = 0, dirty = false, saving = false, again = false, timer = 0;
    let status = 'loading'; // loading | local | saving | saved | offline | error
    const readMeta = () => { try { return JSON.parse(storage?.getItem(META_KEY) || '{}'); } catch (e) { return {}; } };
    const writeMeta = () => { try { storage?.setItem(META_KEY, JSON.stringify({ userId: user?.id || readMeta().userId || null, rev, dirty })); } catch (e) { /* 저장 못 해도 계속 */ } };
    ({ rev = 0, dirty = false } = readMeta());
    const set = s => { status = s; onChange && onChange(api); };

    // 이 기기에서 고친 것 → 잠시 뒤 저장(로그인 안 했으면 이 기기에만)
    store.subscribe((_, meta) => {
      if (meta && meta.remote) return;
      dirty = true; writeMeta();
      if (!user) { if (status !== 'loading') set('local'); return; }
      if (status !== 'saving') set('saving'); // 저장 전까지 '저장됨'으로 보이지 않게
      clearTimeout(timer); timer = setTimeout(push, PUSH_DELAY);
    });

    async function fetchServer() {
      const { data, error } = await sb.from('bj_state').select('data, rev').maybeSingle();
      if (error) throw error;
      return data; // null = 아직 서버 기록 없음
    }

    // 서버 기록 받아 합치기. 합친 결과가 서버와 다르면(이 기기에만 있는 것) 저장
    async function pull() {
      if (!user || saving) return;
      try {
        const srv = await fetchServer();
        if (!srv) { rev = 0; dirty = true; writeMeta(); return push(); }
        if (srv.rev === rev && !dirty) { set('saved'); return; }
        const merged = dirty || srv.rev !== rev ? store.merge(store.state, srv.data) : srv.data;
        store.replaceState(merged);
        rev = srv.rev;
        dirty = !store.sameAs(merged, srv.data);
        writeMeta();
        if (dirty) return push();
        set('saved');
      } catch (e) { set(navigator.onLine === false ? 'offline' : 'error'); }
    }

    async function push() {
      clearTimeout(timer);
      if (!user) return;
      if (saving) { again = true; return; }
      saving = true; set('saving');
      try {
        for (let i = 0; i < 4; i++) {
          const snapshot = JSON.parse(JSON.stringify(store.state));
          const { data: newRev, error } = await sb.rpc('bj_save_state', { p_data: snapshot, p_rev: rev });
          if (error) throw error;
          if (newRev != null) { // 저장됨
            rev = Number(newRev);
            dirty = !store.sameAs(snapshot, store.state); // 저장하는 사이에 또 고쳤으면 한 번 더
            writeMeta();
            break;
          }
          // 다른 기기가 먼저 저장함 → 받아서 합치고 다시
          const srv = await fetchServer();
          if (srv) { store.replaceState(store.merge(store.state, srv.data)); rev = srv.rev; } else rev = 0;
        }
        saving = false;
        if (dirty || again) { again = false; return push(); }
        set('saved');
      } catch (e) {
        saving = false;
        set(navigator.onLine === false ? 'offline' : 'error');
      }
    }

    async function setUser(u) {
      const prevId = readMeta().userId;
      if ((u?.id || null) === (user?.id || null)) return;
      user = u || null;
      if (!user) { set('local'); return; }
      // 이 기기에 다른 계정 기록이 있으면 섞지 않음(그 기록은 그 계정 서버에 있음)
      if (prevId && prevId !== user.id) { store.clearLocal(); rev = 0; dirty = false; }
      if (!prevId) rev = 0; // 처음 로그인: 이 기기 체험판 기록을 계정과 합침
      writeMeta();
      await pull();
    }

    function loadLib() {
      return new Promise(res => {
        if (root.supabase?.createClient) return res(true);
        const s = document.createElement('script');
        s.src = LIB; s.async = true;
        s.onload = () => res(!!root.supabase?.createClient);
        s.onerror = () => res(false);
        document.head.appendChild(s);
      });
    }

    async function start() {
      if (!(await loadLib())) { set('local'); return; }
      sb = root.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => setUser(session?.user), 0); });
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) await setUser(data.session.user); else set('local');
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
      root.addEventListener('focus', () => pull());
      root.addEventListener('online', () => (dirty ? push() : pull()));
      setInterval(() => { if (document.visibilityState === 'visible') pull(); }, PULL_EVERY);
    }

    const api = {
      get status() { return status; },
      get email() { return user?.email || ''; },
      get signedIn() { return !!user; },
      get ready() { return !!sb; },
      async signIn(email, password) {
        if (!sb) return '연결할 수 없어요. 인터넷을 확인해 주세요.';
        const { error } = await sb.auth.signInWithPassword({ email, password });
        return error ? (/invalid/i.test(error.message) ? '이메일이나 비밀번호가 맞지 않아요.' : '로그인하지 못했어요: ' + error.message) : '';
      },
      // 로그아웃: 못 보낸 기록이 있으면 먼저 저장. 이 기기 기록은 지움(기록은 계정에 남음)
      async signOut() {
        if (dirty) await push();
        if (dirty) return '아직 저장하지 못한 기록이 있어요. 인터넷 연결 뒤 다시 해 주세요.';
        await sb.auth.signOut();
        user = null; rev = 0; dirty = false;
        try { storage?.removeItem(META_KEY); } catch (e) { /* */ }
        store.clearLocal(); set('local');
        return '';
      },
      syncNow: () => (dirty ? push() : pull()),
      start,
    };
    return api;
  }

  root.BJSync = { createSync };
})(window);
