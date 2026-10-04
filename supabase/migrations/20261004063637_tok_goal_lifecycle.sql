-- Existing projects remain the originals. Add lifecycle and independent archive only.
begin;
alter table public.tok_projects
  add column lifecycle_state text not null default 'active',
  add column is_archived boolean not null default false,
  add constraint tok_projects_lifecycle_valid check(lifecycle_state in ('active','ended')),
  add constraint tok_projects_child_state check(parent_id is null or (lifecycle_state='active' and not is_archived));
comment on column public.tok_projects.lifecycle_state is 'Top-level goal lifecycle. Archiving never changes this value.';
comment on column public.tok_projects.is_archived is 'Independent archive flag; restoration preserves lifecycle.';
create function public.tok_goal_state_guard() returns trigger language plpgsql security invoker set search_path=public as $$
declare parent public.tok_projects;
begin
  if tg_op='UPDATE' and old.is_archived and new.lifecycle_state<>old.lifecycle_state then
    raise exception 'goal_restore_before_state_change' using errcode='23514';
  end if;
  if new.parent_id is not null and (tg_op='INSERT' or new.parent_id is distinct from old.parent_id) then
    select * into parent from public.tok_projects where id=new.parent_id and user_id=new.user_id for share;
    if not found or parent.is_archived or parent.lifecycle_state<>'active' then
      raise exception 'goal_not_accepting_links' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger tok_goal_state_guard before insert or update on public.tok_projects for each row execute function public.tok_goal_state_guard();
create function public.tok_goal_link_guard() returns trigger language plpgsql security invoker set search_path=public as $$
declare target public.tok_projects; root_goal public.tok_projects; source public.tok_todos;
begin
  if new.project_id is null then return new; end if;
  -- Metadata/period/completion edits keep existing connections, including ended goals.
  if tg_op='UPDATE' and new.project_id is not distinct from old.project_id and new.user_id=old.user_id then return new; end if;
  select * into target from public.tok_projects where id=new.project_id and user_id=new.user_id for share;
  if not found then raise exception 'goal_owner_mismatch' using errcode='23503'; end if;
  if target.parent_id is null then root_goal:=target;
  else select * into root_goal from public.tok_projects where id=target.parent_id and user_id=new.user_id for share;
  end if;
  if root_goal.id is null then raise exception 'goal_owner_mismatch' using errcode='23503'; end if;
  if root_goal.lifecycle_state='active' and not root_goal.is_archived then return new; end if;
  -- The original completed repeating occurrence continues in the same project.
  -- No invented future occurrences or changing an existing occurrence to a closed goal.
  if tg_table_name='tok_todos' and tg_op='INSERT' then
    if new.repeat_source_id is not null then
      select * into source from public.tok_todos where id=new.repeat_source_id and user_id=new.user_id;
      if found and source.project_id=new.project_id and source.is_done and source.repeat_unit is not null
        and new.repeat_unit=source.repeat_unit and new.start_date>source.start_date then return new; end if;
    end if;
  end if;
  raise exception 'goal_not_accepting_links' using errcode='23514', hint='Restore or resume the goal before adding a new connection.';
end $$;
create trigger tok_todos_goal_link before insert or update of project_id,user_id on public.tok_todos for each row execute function public.tok_goal_link_guard();
create trigger tok_habits_goal_link before insert or update of project_id,user_id on public.tok_habits for each row execute function public.tok_goal_link_guard();
create trigger tok_someday_goal_link before insert or update of project_id,user_id on public.tok_someday for each row execute function public.tok_goal_link_guard();
-- Trigger-only functions cannot be used as public RPCs. RLS/FKs/grants remain unchanged.
revoke all on function public.tok_goal_state_guard() from public;
revoke all on function public.tok_goal_link_guard() from public;
notify pgrst,'reload schema';
commit;
