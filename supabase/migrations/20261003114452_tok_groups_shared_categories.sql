-- Additive classification model. No existing rows, dates, colors or connections rewritten.
begin;
create table public.tok_item_groups (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check(kind in ('todo','habit')),
 name text not null check(char_length(trim(name))>0),
 color text,
 sort_order integer not null default 0,
 is_archived boolean not null default false,
 created_at timestamptz not null default now(),
 unique(id,user_id)
);
alter table public.tok_item_groups enable row level security;
revoke all on public.tok_item_groups from public,anon,authenticated;
grant select,insert,update on public.tok_item_groups to authenticated;
create policy tok_item_groups_select on public.tok_item_groups for select to authenticated using((select auth.uid())=user_id);
create policy tok_item_groups_insert on public.tok_item_groups for insert to authenticated with check((select auth.uid())=user_id);
create policy tok_item_groups_update on public.tok_item_groups for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create index tok_item_groups_user_kind_order_idx on public.tok_item_groups(user_id,kind,sort_order);

alter table public.tok_habit_categories add constraint tok_shared_categories_id_user_key unique(id,user_id);
alter table public.tok_event_categories add constraint tok_schedule_groups_id_user_key unique(id,user_id);
alter table public.tok_events add column shared_category_id uuid;
alter table public.tok_todos add column group_id uuid;
alter table public.tok_habits add column group_id uuid;
alter table public.tok_someday add column group_id uuid, add column project_id uuid;

alter table public.tok_events add constraint tok_events_shared_category_owner_fkey foreign key(shared_category_id,user_id) references public.tok_habit_categories(id,user_id) on delete set null(shared_category_id);
alter table public.tok_events add constraint tok_events_schedule_group_owner_fkey foreign key(category_id,user_id) references public.tok_event_categories(id,user_id) on delete set null(category_id) not valid;
alter table public.tok_todos add constraint tok_todos_category_owner_fkey foreign key(tag_id,user_id) references public.tok_habit_categories(id,user_id) on delete set null(tag_id) not valid;
alter table public.tok_habits add constraint tok_habits_category_owner_fkey foreign key(category_id,user_id) references public.tok_habit_categories(id,user_id) on delete set null(category_id) not valid;
alter table public.tok_someday add constraint tok_someday_category_owner_fkey foreign key(tag_id,user_id) references public.tok_habit_categories(id,user_id) on delete set null(tag_id) not valid;
alter table public.tok_todos add constraint tok_todos_group_owner_fkey foreign key(group_id,user_id) references public.tok_item_groups(id,user_id);
alter table public.tok_habits add constraint tok_habits_group_owner_fkey foreign key(group_id,user_id) references public.tok_item_groups(id,user_id);
alter table public.tok_someday add constraint tok_someday_group_owner_fkey foreign key(group_id,user_id) references public.tok_item_groups(id,user_id);
alter table public.tok_someday add constraint tok_someday_project_owner_fkey foreign key(project_id,user_id) references public.tok_projects(id,user_id) on delete set null(project_id);

create function public.tok_group_kind_guard() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_table_name='tok_item_groups' then
  if new.kind is distinct from old.kind then raise exception 'group_kind_immutable' using errcode='23514'; end if;
 elsif new.group_id is not null and not exists(select 1 from public.tok_item_groups g where g.id=new.group_id and g.user_id=new.user_id and g.kind=case when tg_table_name='tok_habits' then 'habit' else 'todo' end) then
  raise exception 'group_owner_or_kind_mismatch' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.tok_group_kind_guard() from public,anon;
create trigger tok_groups_kind_immutable before update of kind on public.tok_item_groups for each row execute function public.tok_group_kind_guard();
create trigger tok_todos_group_kind before insert or update of group_id,user_id on public.tok_todos for each row execute function public.tok_group_kind_guard();
create trigger tok_habits_group_kind before insert or update of group_id,user_id on public.tok_habits for each row execute function public.tok_group_kind_guard();
create trigger tok_someday_group_kind before insert or update of group_id,user_id on public.tok_someday for each row execute function public.tok_group_kind_guard();

create index tok_events_shared_category_idx on public.tok_events(shared_category_id,user_id) where shared_category_id is not null;
create index tok_events_schedule_group_owner_idx on public.tok_events(category_id,user_id) where category_id is not null;
create index tok_todos_group_idx on public.tok_todos(group_id,user_id) where group_id is not null;
create index tok_habits_group_idx on public.tok_habits(group_id,user_id) where group_id is not null;
create index tok_someday_group_idx on public.tok_someday(group_id,user_id) where group_id is not null;
create index tok_someday_project_idx on public.tok_someday(project_id,user_id) where project_id is not null;
create index tok_todos_category_owner_idx on public.tok_todos(tag_id,user_id) where tag_id is not null;
create index tok_habits_category_owner_idx on public.tok_habits(category_id,user_id) where category_id is not null;
create index tok_someday_category_owner_idx on public.tok_someday(tag_id,user_id) where tag_id is not null;

-- Old clients retain the same RPC signature. New connections survive atomic movement.
create or replace function public.tok_move_someday_to_todo(p_someday_id uuid,p_date date)
returns public.tok_todos language plpgsql security invoker set search_path=public as $$
declare s public.tok_someday; t public.tok_todos;
begin
 if p_date is null then raise exception 'date_required' using errcode='22004'; end if;
 delete from public.tok_someday where id=p_someday_id and user_id=auth.uid() returning * into s;
 if not found then raise exception 'someday_not_found' using errcode='P0002'; end if;
 insert into public.tok_todos(title,start_date,tag_id,group_id,project_id,is_done)
 values(s.title,p_date,s.tag_id,s.group_id,s.project_id,false) returning * into t;
 return t;
end $$;
revoke all on function public.tok_move_someday_to_todo(uuid,date) from public,anon;
grant execute on function public.tok_move_someday_to_todo(uuid,date) to authenticated;
comment on column public.tok_events.category_id is 'Schedule group. Existing schedule classification IDs/colors/connections preserved.';
comment on column public.tok_events.shared_category_id is 'Shared category from tok_habit_categories. Null for existing events.';
comment on table public.tok_item_groups is 'Per-kind todo/habit management groups. No deletion or hierarchy.';
alter table public.tok_events validate constraint tok_events_schedule_group_owner_fkey;
alter table public.tok_todos validate constraint tok_todos_category_owner_fkey;
alter table public.tok_habits validate constraint tok_habits_category_owner_fkey;
alter table public.tok_someday validate constraint tok_someday_category_owner_fkey;
commit;
