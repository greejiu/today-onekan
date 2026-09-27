-- 기본 색상 저장 + 그룹·범주 완전 삭제 수정 (2026-09-28)
--
-- 실제 DB 확인 결과(원인)
--   1) tok_settings에 default_tag_color 컬럼이 없었음 → saveDefaultTagColor의 upsert가
--      "Could not find the 'default_tag_color' column" 오류로 항상 실패(앱 코드만 있고 컬럼은 추가된 적 없음).
--   2) tok_someday.tag_id 외래키(tok_someday_tag_id_fkey)에 ON DELETE 규칙이 없었음(NO ACTION)
--      → 언젠가 항목이 연결된 그룹을 삭제하면 409(23503 foreign key violation)로 실패.
--      (tok_todos.tag_id / tok_habits.category_id / tok_events.category_id는 ON DELETE SET NULL로 되어 있었음)
--
-- 변경 내용
--   1) tok_settings.default_tag_color(그룹 "기본" 색), default_event_color(범주 "기본" 색) 추가.
--      null = 색 미지정. 값은 #rrggbb만 허용. 기존 행은 null로 채워질 뿐 다른 값은 바뀌지 않음.
--   2) tok_someday_tag_id_fkey를 ON DELETE SET NULL로 교체(다른 테이블과 같은 규칙).
--   3) tok_purge_habit_category / tok_purge_event_category: 보관된 그룹·범주 "완전 삭제" 전용 함수.
--      - 한 함수(한 트랜잭션) 안에서 연결 해제(→ null = "기본") + 그룹·범주 행 삭제 → 일부만 반영되는 일이 없음.
--      - 할일·습관·언젠가·일정 행과 완료 기록(tok_habit_logs 등)은 삭제하지 않음(분류만 null로).
--      - 보관(is_archived)된 것만 삭제 가능. 없거나(이미 삭제됨) 보관 전이면 오류 → 화면은 그대로 두고 다시 시도 가능.
--      - security invoker: 호출한 사용자의 RLS가 그대로 적용됨(자기 행만 바뀜).
--      - 반환값: 연결을 해제한 항목 수(jsonb).
--
-- 기존 데이터: 컬럼·제약·함수만 추가/교체. 기존 행은 수정·삭제하지 않음.

begin;

alter table public.tok_settings
  add column if not exists default_tag_color text,
  add column if not exists default_event_color text;

alter table public.tok_settings
  add constraint tok_settings_default_tag_color_hex
  check (default_tag_color is null or default_tag_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.tok_settings
  add constraint tok_settings_default_event_color_hex
  check (default_event_color is null or default_event_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.tok_settings.default_tag_color is
  '그룹 "기본"(tag_id/category_id가 null인 할일·습관·언젠가) 표시 색. null = 미지정.';
comment on column public.tok_settings.default_event_color is
  '범주 "기본"(category_id가 null인 일정) 표시 색. null = 미지정.';

alter table public.tok_someday
  drop constraint tok_someday_tag_id_fkey;
alter table public.tok_someday
  add constraint tok_someday_tag_id_fkey
  foreign key (tag_id) references public.tok_habit_categories (id) on delete set null;

create or replace function public.tok_purge_habit_category(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  c public.tok_habit_categories;
  n_todos int; n_habits int; n_someday int;
begin
  select * into c from public.tok_habit_categories
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  if not c.is_archived then
    raise exception 'category_not_archived' using errcode = 'P0001', hint = '보관한 그룹만 완전 삭제할 수 있어요.';
  end if;
  update public.tok_todos set tag_id = null where tag_id = p_id and user_id = auth.uid();
  get diagnostics n_todos = row_count;
  update public.tok_habits set category_id = null where category_id = p_id and user_id = auth.uid();
  get diagnostics n_habits = row_count;
  update public.tok_someday set tag_id = null where tag_id = p_id and user_id = auth.uid();
  get diagnostics n_someday = row_count;
  delete from public.tok_habit_categories where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('todos', n_todos, 'habits', n_habits, 'someday', n_someday);
end $$;

create or replace function public.tok_purge_event_category(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  c public.tok_event_categories;
  n_events int;
begin
  select * into c from public.tok_event_categories
    where id = p_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  if not c.is_archived then
    raise exception 'category_not_archived' using errcode = 'P0001', hint = '보관한 범주만 완전 삭제할 수 있어요.';
  end if;
  update public.tok_events set category_id = null where category_id = p_id and user_id = auth.uid();
  get diagnostics n_events = row_count;
  delete from public.tok_event_categories where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('events', n_events);
end $$;

revoke all on function public.tok_purge_habit_category(uuid) from public, anon;
revoke all on function public.tok_purge_event_category(uuid) from public, anon;
grant execute on function public.tok_purge_habit_category(uuid) to authenticated;
grant execute on function public.tok_purge_event_category(uuid) to authenticated;

commit;
