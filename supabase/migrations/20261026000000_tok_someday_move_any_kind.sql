-- 2026-10-26 언젠가(담아두기) → 날짜: 추가창에서 고른 종류(일정·할일·습관)로 "한 번에" 옮기기.
--
-- 1) tok_someday_moves: 옮긴 기록(언젠가 항목 하나당 한 줄). 응답을 못 받아 다시 시도해도 새로 만들지 않고
--    처음 만든 결과를 돌려주기 위한 표. 앱은 결과를 모를 때 이 표를 읽어 실제로 옮겨졌는지 확인한다.
-- 2) tok_move_someday(p_someday_id, p_request_id, p_kind, p_row): 한 거래(트랜잭션)에서
--    언젠가 행 삭제 + 고른 표에 새 행 + 옮긴 기록. 중간에 실패하면 전부 되돌아가 원본이 그대로 남는다.
--    - 이미 옮긴 기록이 있으면(응답 유실 후 재시도, 다른 창에서 먼저 옮김) 아무것도 만들지 않고 그 기록을 돌려준다.
--    - 동시에 두 번 불러도: 먼저 지운 쪽만 만들고, 늦은 쪽은 삭제할 행이 없어 기록을 다시 읽어 돌려준다.
--    - p_row는 추가창 값. 종류마다 허용한 칸만 받는다(id·user_id·완료·반복 연결 등은 받지 않음 → 새 항목으로 시작).
--    - security invoker: RLS·소유자 외래키·기간 검사(tok_period_guard)·목표 연결 검사 트리거를 그대로 거친다.
-- 기존 tok_move_someday_to_todo(⋯ 메뉴 "날짜 정해서 할일로 옮기기")는 그대로 둔다.
begin;

create table public.tok_someday_moves (
  someday_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('event','todo','habit')),
  item_id uuid not null,
  title text not null,
  moved_at timestamptz not null default now()
);
comment on table public.tok_someday_moves is
  '언젠가 → 일정·할일·습관 옮긴 기록. 재시도해도 한 번만 만들고, 앱이 실제 결과를 확인하는 데 씀(tok_move_someday).';
alter table public.tok_someday_moves enable row level security;
create policy tok_someday_moves_select on public.tok_someday_moves for select to authenticated using (user_id = auth.uid());
-- 기록은 함수(security invoker)가 본인 권한으로 넣음. 수정·삭제는 허용하지 않음
create policy tok_someday_moves_insert on public.tok_someday_moves for insert to authenticated with check (user_id = auth.uid());
revoke all on public.tok_someday_moves from public, anon;
grant select, insert on public.tok_someday_moves to authenticated;

create or replace function public.tok_move_someday(p_someday_id uuid, p_request_id uuid, p_kind text, p_row jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.tok_someday;
  m public.tok_someday_moves;
  tbl text;
  allowed text[];
  bad text;
  cols text;
  new_id uuid;
  item_exists boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_someday_id is null or p_request_id is null then raise exception 'move_key_required' using errcode = '22004'; end if;
  if p_kind is null or p_kind not in ('event','todo','habit') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' then raise exception 'row_required' using errcode = '22004'; end if;
  tbl := case p_kind when 'event' then 'tok_events' when 'todo' then 'tok_todos' else 'tok_habits' end;
  allowed := case p_kind
    when 'event' then array['title','memo','event_date','end_date','event_time','end_time','duration_minutes','all_day',
                            'category_id','shared_category_id','repeat_unit','repeat_interval']
    when 'todo' then array['title','start_date','end_date','occurrence_end_date','todo_time','end_time','duration_minutes','all_day',
                           'tag_id','group_id','project_id','repeat_unit','repeat_interval','repeat_days','repeat_start_date']
    else array['name','sort_order','start_date','end_date','occurrence_start_date','occurrence_end_date','start_minute','end_time',
               'duration_minutes','all_day','repeat_unit','repeat_interval','repeat_days','category_id','group_id','project_id'] end;
  select k into bad from jsonb_object_keys(p_row) k where k <> all(allowed) limit 1;
  if bad is not null then raise exception 'field_not_allowed: %', bad using errcode = '22023'; end if;

  -- 이미 옮긴 기록 = 응답 유실 후 재시도 또는 다른 창에서 먼저 옮김 → 새로 만들지 않고 그 결과
  select * into m from public.tok_someday_moves where someday_id = p_someday_id and user_id = uid;
  if not found then
    delete from public.tok_someday where id = p_someday_id and user_id = uid returning * into s;
    if not found then
      -- 동시에 부른 다른 요청이 먼저 옮겼을 수 있음(그 거래가 끝난 뒤 다시 읽음)
      select * into m from public.tok_someday_moves where someday_id = p_someday_id and user_id = uid;
      if not found then raise exception 'someday_not_found' using errcode = 'P0002'; end if;
    end if;
  end if;
  if m.someday_id is not null then
    execute format('select exists(select 1 from public.%I where id = $1)', case m.kind when 'event' then 'tok_events' when 'todo' then 'tok_todos' else 'tok_habits' end)
      using m.item_id into item_exists;
    return jsonb_build_object('kind', m.kind, 'item_id', m.item_id, 'title', m.title, 'replayed', true,
                              'same_request', m.request_id = p_request_id, 'item_exists', item_exists);
  end if;

  select string_agg(quote_ident(k), ',') into cols from jsonb_object_keys(p_row) k;
  if cols is null then raise exception 'row_required' using errcode = '22004'; end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id', tbl, cols, cols, tbl)
    using p_row into new_id;
  insert into public.tok_someday_moves(someday_id, user_id, request_id, kind, item_id, title)
    values (p_someday_id, uid, p_request_id, p_kind, new_id, s.title);
  return jsonb_build_object('kind', p_kind, 'item_id', new_id, 'title', s.title, 'replayed', false,
                            'same_request', true, 'item_exists', true);
end $$;
revoke all on function public.tok_move_someday(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.tok_move_someday(uuid, uuid, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
