-- 2026-10-26 언젠가(담아두기) → 날짜: 추가창에서 고른 종류(일정·할일·습관)로 "한 번에" 옮기기.
--
-- 1) tok_someday_moves: 옮긴 기록(언젠가 항목 하나당 한 줄). 응답을 못 받아 다시 시도해도 새로 만들지 않고
--    처음 만든 결과를 돌려주기 위한 표. 앱은 결과를 모를 때 이 표를 읽어 실제로 옮겨졌는지 확인한다.
--    기록은 아래 함수가 실제로 옮겼을 때만 생긴다: 로그인 사용자는 읽기만 할 수 있고(본인 것만),
--    직접 넣기·고치기·지우기 권한이 없다(직접 만든 가짜 기록으로 "이미 옮겨짐"이라고 속이는 길을 막음, 2026-11-02 결 검토).
-- 2) tok_move_someday(p_someday_id, p_request_id, p_kind, p_row): 한 거래(트랜잭션)에서
--    언젠가 행 삭제 + 고른 표에 새 행 + 옮긴 기록. 중간에 실패하면 전부 되돌아가 원본이 그대로 남는다.
--    - 이미 옮긴 기록이 있으면(응답 유실 후 재시도, 다른 창에서 먼저 옮김) 아무것도 만들지 않고 그 기록을 돌려준다.
--    - 동시에 두 번 불러도: 먼저 지운 쪽만 만들고, 늦은 쪽은 그 행의 잠금을 기다린 뒤 지울 행이 없어
--      기록을 다시 읽어 돌려준다. 먼저 쪽이 실패해 되돌아가면 늦은 쪽이 원본을 지우고 만든다.
--    - p_row는 추가창 값. 종류마다 허용한 칸만 받는다(id·user_id·완료·반복 연결 등은 받지 않음 → 새 항목으로 시작).
--    - security definer(기록 표에 쓰기 위해): 표의 행 보안(RLS)을 건너뛰므로 "본인 것만"을 함수 안에서 직접 지킨다.
--      언젠가는 user_id = auth.uid()인 행만 지우고, 새 항목은 user_id = auth.uid()로 넣으며, 되풀이 결과도 본인 것만 본다.
--      범주·그룹·프로젝트의 주인은 기존 (id, user_id) 외래키가, 기간·그룹 종류·목표 연결은 기존 트리거가 그대로 검사한다.
--      search_path = '' 이고 모든 이름을 스키마까지 적는다.
-- 기존 tok_move_someday_to_todo(⋯ 메뉴 "날짜 정해서 할일로 옮기기")는 그대로 둔다.
begin;

create table public.tok_someday_moves (
  someday_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('event','todo','habit')),
  item_id uuid not null,
  title text not null,
  moved_at timestamptz not null default now()
);
comment on table public.tok_someday_moves is
  '언젠가 → 일정·할일·습관 옮긴 기록. tok_move_someday만 씀(사용자는 본인 것 읽기만). 재시도해도 한 번만 만들고, 앱이 실제 결과를 확인하는 데 씀.';
alter table public.tok_someday_moves enable row level security;
create policy tok_someday_moves_select on public.tok_someday_moves for select to authenticated using (user_id = auth.uid());
-- Supabase는 public 스키마의 새 표에 anon·authenticated 모든 권한을 기본으로 주므로 먼저 전부 거두고 읽기만 돌려줌
revoke all on public.tok_someday_moves from public, anon, authenticated;
grant select on public.tok_someday_moves to authenticated;

create or replace function public.tok_move_someday(p_someday_id uuid, p_request_id uuid, p_kind text, p_row jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' then raise exception 'row_required' using errcode = '22004'; end if;
  tbl := case p_kind when 'event' then 'tok_events' when 'todo' then 'tok_todos' else 'tok_habits' end;
  allowed := case p_kind
    when 'event' then array['title','memo','event_date','end_date','event_time','end_time','duration_minutes','all_day',
                            'category_id','shared_category_id','repeat_unit','repeat_interval']
    when 'todo' then array['title','start_date','end_date','occurrence_end_date','todo_time','end_time','duration_minutes','all_day',
                           'tag_id','group_id','project_id','repeat_unit','repeat_interval','repeat_days','repeat_start_date']
    else array['name','sort_order','start_date','end_date','occurrence_start_date','occurrence_end_date','start_minute','end_time',
               'duration_minutes','all_day','repeat_unit','repeat_interval','repeat_days','category_id','group_id','project_id'] end;
  select k into bad from pg_catalog.jsonb_object_keys(p_row) k where k <> all(allowed) limit 1;
  if bad is not null then raise exception 'field_not_allowed: %', bad using errcode = '22023'; end if;

  -- 이미 옮긴 기록 = 응답 유실 후 재시도 또는 다른 창에서 먼저 옮김 → 새로 만들지 않고 그 결과
  select * into m from public.tok_someday_moves where someday_id = p_someday_id and user_id = uid;
  if not found then
    -- 본인 언젠가만(행 보안을 건너뛰므로 user_id를 직접 확인). 다른 요청이 같은 행을 지우는 중이면 그 거래가 끝날 때까지 기다림
    delete from public.tok_someday where id = p_someday_id and user_id = uid returning * into s;
    if not found then
      -- 동시에 부른 다른 요청이 먼저 옮겼을 수 있음(그 거래가 끝난 뒤 새로 읽음)
      select * into m from public.tok_someday_moves where someday_id = p_someday_id and user_id = uid;
      if not found then raise exception 'someday_not_found' using errcode = 'P0002'; end if;
    end if;
  end if;
  if m.someday_id is not null then
    execute pg_catalog.format('select exists(select 1 from public.%I where id = $1 and user_id = $2)',
      case m.kind when 'event' then 'tok_events' when 'todo' then 'tok_todos' else 'tok_habits' end)
      using m.item_id, uid into item_exists;
    return pg_catalog.jsonb_build_object('kind', m.kind, 'item_id', m.item_id, 'title', m.title, 'replayed', true,
                                         'same_request', m.request_id = p_request_id, 'item_exists', item_exists);
  end if;

  select pg_catalog.string_agg(pg_catalog.quote_ident(k), ',') into cols from pg_catalog.jsonb_object_keys(p_row) k;
  if cols is null then raise exception 'row_required' using errcode = '22004'; end if;
  -- 새 항목의 주인은 항상 로그인한 사용자(p_row로는 user_id를 받지 않음)
  execute pg_catalog.format('insert into public.%I (user_id, %s) select $2, %s from pg_catalog.jsonb_populate_record(null::public.%I, $1) returning id',
    tbl, cols, cols, tbl)
    using p_row, uid into new_id;
  insert into public.tok_someday_moves(someday_id, user_id, request_id, kind, item_id, title)
    values (p_someday_id, uid, p_request_id, p_kind, new_id, s.title);
  return pg_catalog.jsonb_build_object('kind', p_kind, 'item_id', new_id, 'title', s.title, 'replayed', false,
                                       'same_request', true, 'item_exists', true);
end $$;
revoke all on function public.tok_move_someday(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.tok_move_someday(uuid, uuid, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
