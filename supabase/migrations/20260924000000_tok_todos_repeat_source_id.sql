-- 반복 할일 체크 → 해제 → 재체크 시 다음 회차 중복 생성 방지 (2026-09-24, 설계 문서 10-7 7번)
--
-- repeat_source_id: 이 행(다음 회차)을 만들어낸 원본 회차의 id.
--   - 원본 1개당 다음 회차는 최대 1개(부분 unique 인덱스) → 빠른 연속 클릭·동시 요청도 DB에서 막힘.
--   - 제목·날짜·완료 여부와 무관하게 연결이 유지됨(id로만 연결).
--   - 원본이 삭제되면 연결만 끊기고(repeat_source_id = null) 다음 회차 행은 그대로 남음.
--   - (repeat_source_id, user_id) 복합 FK로 다른 사용자의 할일을 원본으로 지정할 수 없게 함.
--
-- 기존 데이터: 새 컬럼은 전부 NULL로 추가될 뿐, 기존 행을 수정·삭제·병합하지 않음.
--   기존 행의 연결을 날짜·제목으로 추측해 채우지 않음.

begin;

alter table public.tok_todos
  add constraint tok_todos_id_user_key unique (id, user_id);

alter table public.tok_todos
  add column repeat_source_id uuid;

alter table public.tok_todos
  add constraint tok_todos_repeat_source_fkey
  foreign key (repeat_source_id, user_id)
  references public.tok_todos (id, user_id)
  on delete set null (repeat_source_id);

alter table public.tok_todos
  add constraint tok_todos_repeat_source_not_self
  check (repeat_source_id is null or repeat_source_id <> id);

create unique index tok_todos_repeat_source_id_key
  on public.tok_todos (repeat_source_id)
  where repeat_source_id is not null;

comment on column public.tok_todos.repeat_source_id is
  '이 회차를 만들어낸 원본 회차 id. 원본 1개당 다음 회차 최대 1개(tok_todos_repeat_source_id_key).';

commit;
