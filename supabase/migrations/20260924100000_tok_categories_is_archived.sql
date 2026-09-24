-- 그룹(tok_habit_categories)·범주(tok_event_categories) 보관 기능 (2026-09-24)
--
-- is_archived: 오래 안 쓰는 그룹/범주를 "새로 지정하는 선택 목록"에서만 숨기기 위한 표시.
--   - 보관해도 행은 그대로 남음 → 기존 할일·습관·언젠가·일정의 tag_id/category_id 연결은 절대 안 풀림.
--   - 기존 항목은 보관된 그룹/범주의 이름·색상을 계속 표시함(앱은 전체 행을 불러오고, 새 지정 UI에서만 거름).
--   - "기본"/"범주 없음"은 실제 행이 아니므로(연결값 null) 보관 대상이 아님.
--
-- 기존 데이터: not null default false로 추가 → 기존 행은 전부 false(사용 중)로 채워짐.
-- RLS: 컬럼만 추가하므로 기존 행 단위 정책(user_id 기준)이 그대로 적용됨.

begin;

alter table public.tok_habit_categories
  add column if not exists is_archived boolean not null default false;

alter table public.tok_event_categories
  add column if not exists is_archived boolean not null default false;

comment on column public.tok_habit_categories.is_archived is
  '보관 여부. true면 새로 지정하는 선택 목록에서만 숨김(기존 항목 연결·표시는 유지).';
comment on column public.tok_event_categories.is_archived is
  '보관 여부. true면 새로 지정하는 선택 목록에서만 숨김(기존 항목 연결·표시는 유지).';

commit;
