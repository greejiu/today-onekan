-- 오늘한칸 v3 계정 연동 1차 (2026-11-17, 결 승인)
--
-- 구조: 사용자마다 v3 기록 전체(영역·프로젝트·작업·계획·설정)를 JSON 한 덩어리로 저장.
--   - bj_state.data: v3/store.js 의 state 그대로(version 2). 항목마다 u(고친 시각), 지운 항목은 gone 목록.
--   - bj_state.rev: 저장할 때마다 +1. 앱은 자기가 받은 rev로만 저장(bj_save_state).
--       다른 기기가 먼저 저장했으면 저장이 거절(null)되고, 앱이 서버 기록을 받아 항목별로 합친 뒤 다시 저장.
-- 기존 tok_ 표는 건드리지 않음. 삭제 정책(RLS delete)은 만들지 않음(기존 표와 같은 방식, 앱에 계정 삭제 없음).
-- 혼자 쓰는 앱이라 한 덩어리로 시작. 나중에 공유 기능이 생기면 표를 나눔(docs/v3_설계.md 6장).

begin;

create table public.bj_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint bj_state_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint bj_state_data_size check (octet_length(data::text) < 5000000)
);

alter table public.bj_state enable row level security;

create policy bj_state_select on public.bj_state for select to authenticated using (auth.uid() = user_id);
create policy bj_state_insert on public.bj_state for insert to authenticated with check (auth.uid() = user_id);
create policy bj_state_update on public.bj_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 저장: p_rev = 앱이 마지막으로 받은 rev(처음이면 0). 맞으면 저장하고 새 rev, 안 맞으면 null(= 충돌, 다시 받아 합치기).
-- security invoker: 위 RLS가 그대로 적용됨(본인 행만).
create or replace function public.bj_save_state(p_data jsonb, p_rev bigint)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_rev bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_rev = 0 then
    insert into public.bj_state (user_id, data, rev)
    values (auth.uid(), p_data, 1)
    on conflict (user_id) do nothing
    returning rev into new_rev;
  else
    update public.bj_state
       set data = p_data, rev = rev + 1, updated_at = now()
     where user_id = auth.uid() and rev = p_rev
    returning rev into new_rev;
  end if;
  return new_rev;
end;
$$;

revoke all on function public.bj_save_state(jsonb, bigint) from public, anon;
grant execute on function public.bj_save_state(jsonb, bigint) to authenticated;

commit;
