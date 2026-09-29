-- 작업 탭 1차: 정체성 · 프로젝트(2단계) · 할일/습관의 프로젝트 연결 (2026-09-29)
--
-- 구조: 정체성(선택) → 프로젝트 → 하위 프로젝트(선택) → 할일·습관
--   - tok_identities: 정체성 이름만(대시보드·점수 없음).
--   - tok_projects: 이름·선택 설명·상위 프로젝트(parent_id)·정체성(identity_id, 상위 프로젝트에만).
--       · 중첩은 상위·하위 2단계까지만. 자기 자신을 부모로 지정 불가, 순환 불가(트리거로 검사).
--       · 하위 프로젝트는 정체성을 직접 갖지 않음(상위 프로젝트의 정체성을 따름).
--   - tok_todos.project_id / tok_habits.project_id: 한 항목의 직접 연결 대상은 프로젝트 하나.
--       · 연결 해제 = project_id를 null로(원본 항목·완료 기록은 그대로).
--       · 프로젝트가 (나중에) 삭제돼도 할일·습관은 지워지지 않고 연결만 풀림(ON DELETE SET NULL).
--       · (project_id, user_id) 복합 외래키로 다른 사용자의 프로젝트에 연결할 수 없게 함.
-- 기존 그룹(tok_habit_categories)·범주(tok_event_categories)는 그대로 둠 — 대체·자동 변환하지 않음.
-- 기존 데이터: 새 컬럼은 전부 null(= 프로젝트 미지정)로 추가될 뿐, 기존 행을 수정·삭제하지 않음.
-- 삭제·보관·완료율 정책은 후속 설계 — 이번엔 삭제 정책(RLS delete)을 만들지 않음(앱에서도 삭제 기능 없음).

begin;

create table public.tok_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint tok_identities_id_user_key unique (id, user_id)
);

create table public.tok_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  parent_id uuid,
  identity_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint tok_projects_id_user_key unique (id, user_id),
  constraint tok_projects_not_self_parent check (parent_id is null or parent_id <> id),
  constraint tok_projects_identity_top_only check (parent_id is null or identity_id is null),
  -- 같은 사용자의 프로젝트·정체성만 연결. 상위 프로젝트는 하위가 있는 동안 삭제 불가(RESTRICT),
  -- 정체성이 없어져도 프로젝트는 남음(SET NULL).
  constraint tok_projects_parent_fkey foreign key (parent_id, user_id)
    references public.tok_projects (id, user_id) on delete restrict,
  constraint tok_projects_identity_fkey foreign key (identity_id, user_id)
    references public.tok_identities (id, user_id) on delete set null (identity_id)
);

create index tok_projects_user_idx on public.tok_projects (user_id);
create index tok_projects_parent_idx on public.tok_projects (parent_id) where parent_id is not null;

comment on table public.tok_identities is '정체성(선택). 상위 프로젝트에 선택적으로 연결.';
comment on table public.tok_projects is '프로젝트. parent_id로 상위·하위 2단계까지만. 할일·습관은 project_id로 연결.';

-- 2단계 제한·순환 방지: 부모는 최상위 프로젝트여야 하고, 하위를 가진 프로젝트는 다른 프로젝트의 하위가 될 수 없음.
create or replace function public.tok_projects_depth_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'project_self_parent' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.tok_projects p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'project_depth_limit' using errcode = 'P0001', hint = '하위 프로젝트 아래에는 프로젝트를 만들 수 없어요.';
    end if;
    if exists (select 1 from public.tok_projects c where c.parent_id = new.id) then
      raise exception 'project_has_children' using errcode = 'P0001', hint = '하위 프로젝트가 있는 프로젝트는 다른 프로젝트 아래로 옮길 수 없어요.';
    end if;
  end if;
  return new;
end $$;

create trigger tok_projects_depth_guard
  before insert or update of parent_id on public.tok_projects
  for each row execute function public.tok_projects_depth_guard();

alter table public.tok_identities enable row level security;
alter table public.tok_projects enable row level security;

create policy tok_identities_select on public.tok_identities for select to authenticated using (auth.uid() = user_id);
create policy tok_identities_insert on public.tok_identities for insert to authenticated with check (auth.uid() = user_id);
create policy tok_identities_update on public.tok_identities for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy tok_projects_select on public.tok_projects for select to authenticated using (auth.uid() = user_id);
create policy tok_projects_insert on public.tok_projects for insert to authenticated with check (auth.uid() = user_id);
create policy tok_projects_update on public.tok_projects for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 할일·습관의 프로젝트 연결(선택). 기존 행은 null = 프로젝트 미지정.
alter table public.tok_todos add column project_id uuid;
alter table public.tok_habits add column project_id uuid;

-- tok_todos에는 (id, user_id) unique가 이미 있음(tok_todos_id_user_key). 습관 쪽 복합키 참조는 필요 없음.
alter table public.tok_todos
  add constraint tok_todos_project_fkey foreign key (project_id, user_id)
  references public.tok_projects (id, user_id) on delete set null (project_id);
alter table public.tok_habits
  add constraint tok_habits_project_fkey foreign key (project_id, user_id)
  references public.tok_projects (id, user_id) on delete set null (project_id);

create index tok_todos_project_idx on public.tok_todos (project_id) where project_id is not null;
create index tok_habits_project_idx on public.tok_habits (project_id) where project_id is not null;

comment on column public.tok_todos.project_id is '연결된 프로젝트(선택, 하나만). 연결 해제 = null. 프로젝트 삭제 시 null.';
comment on column public.tok_habits.project_id is '연결된 프로젝트(선택, 하나만). 연결 해제 = null. 프로젝트 삭제 시 null.';

commit;
