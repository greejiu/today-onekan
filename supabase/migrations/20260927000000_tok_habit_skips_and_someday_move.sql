-- 공통 항목 메뉴(2026-09-27): 습관 날짜별 "건너뛰기" 기록 + 언젠가 → 할일 원자적 이동
--
-- 1) tok_habit_skips: 습관을 "그 날짜 한 번만" 건너뛴 기록.
--   - 완료 기록(tok_habit_logs)과 따로 저장 → 완료와 건너뜀을 같은 상태로 섞지 않음.
--   - habit_id + skip_date 중복 불가(같은 날 두 번 건너뛰기 없음).
--   - 같은 습관·같은 날짜에 완료 기록과 건너뛰기 기록이 동시에 있을 수 없음(양쪽 트리거로 막음).
--   - 건너뛰기 취소 = 그 날짜 행 삭제. 반복 설정·다른 날짜 기록은 건드리지 않음.
--   - 습관을 삭제하면 함께 삭제(ON DELETE CASCADE, tok_habit_logs·tok_habit_pauses와 같은 규칙).
--   - 다른 사용자의 습관을 가리킬 수 없게 insert 정책에서 습관 소유자를 확인.
--
-- 2) tok_move_someday_to_todo(p_someday_id, p_date): 언젠가 항목을 지정한 날짜의 할일로 "이동".
--   - 한 함수(한 트랜잭션) 안에서 언젠가 행 삭제 + 할일 생성 → 둘 중 하나만 되는 일이 없음.
--   - 원본이 이미 없으면(이미 옮겼거나 삭제됨) 아무것도 만들지 않고 someday_not_found 오류
--     → 응답을 못 받아 재시도해도 할일이 두 번 생기지 않음.
--   - 제목·그룹(tag_id)을 유지, 완료 상태는 미완료로 시작.
--   - security invoker: 호출한 사용자의 RLS가 그대로 적용됨.
--
-- 기존 데이터: 새 테이블·함수·트리거만 추가. 기존 행은 수정·삭제하지 않음.

begin;

create table public.tok_habit_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.tok_habits (id) on delete cascade,
  skip_date date not null,
  created_at timestamptz not null default now(),
  constraint tok_habit_skips_habit_date_key unique (habit_id, skip_date)
);

comment on table public.tok_habit_skips is
  '습관을 특정 날짜 한 번만 건너뛴 기록. 완료(tok_habit_logs)와 별도. 취소 = 행 삭제.';

alter table public.tok_habit_skips enable row level security;

create policy tok_habit_skips_select on public.tok_habit_skips
  for select to authenticated using (auth.uid() = user_id);
create policy tok_habit_skips_insert on public.tok_habit_skips
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.tok_habits h where h.id = habit_id and h.user_id = auth.uid())
  );
create policy tok_habit_skips_delete on public.tok_habit_skips
  for delete to authenticated using (auth.uid() = user_id);

-- 같은 날짜에 완료와 건너뜀이 함께 저장되지 않게(두 기기에서 동시에 눌러도 DB에서 막힘)
create or replace function public.tok_habit_skip_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.tok_habit_logs l where l.habit_id = new.habit_id and l.done_date = new.skip_date) then
    raise exception 'habit_already_done' using errcode = 'P0001', hint = '완료로 기록된 날짜는 건너뛸 수 없어요.';
  end if;
  return new;
end $$;

create or replace function public.tok_habit_log_skip_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.tok_habit_skips s where s.habit_id = new.habit_id and s.skip_date = new.done_date) then
    raise exception 'habit_skipped' using errcode = 'P0001', hint = '건너뛴 날짜는 먼저 건너뛰기를 취소해야 완료로 기록할 수 있어요.';
  end if;
  return new;
end $$;

create trigger tok_habit_skips_guard before insert on public.tok_habit_skips
  for each row execute function public.tok_habit_skip_guard();
create trigger tok_habit_logs_skip_guard before insert on public.tok_habit_logs
  for each row execute function public.tok_habit_log_skip_guard();

create or replace function public.tok_move_someday_to_todo(p_someday_id uuid, p_date date)
returns public.tok_todos
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.tok_someday;
  t public.tok_todos;
begin
  if p_date is null then
    raise exception 'date_required' using errcode = '22004';
  end if;
  delete from public.tok_someday
    where id = p_someday_id and user_id = auth.uid()
    returning * into s;
  if not found then
    raise exception 'someday_not_found' using errcode = 'P0002';
  end if;
  insert into public.tok_todos (title, start_date, tag_id, is_done)
    values (s.title, p_date, s.tag_id, false)
    returning * into t;
  return t;
end $$;

revoke all on function public.tok_move_someday_to_todo(uuid, date) from public, anon;
grant execute on function public.tok_move_someday_to_todo(uuid, date) to authenticated;

commit;
