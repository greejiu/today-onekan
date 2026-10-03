-- Phase 1: explicit civil date/time periods; no data backfill, no RLS/FK/ownership changes.
-- all_day NULL is the legacy compatibility state. Existing todo/habit end_date remains a repeat bound.
begin;
alter table public.tok_events add column all_day boolean, add column end_time time without time zone;
alter table public.tok_todos add column all_day boolean, add column occurrence_end_date date,
  add column end_time time without time zone, add column repeat_start_date date;
alter table public.tok_habits add column all_day boolean, add column occurrence_start_date date,
  add column occurrence_end_date date, add column end_time time without time zone;
-- Completed multi-day all-day occurrences also need their original inclusive endpoint frozen.
alter table public.tok_habit_logs add column occurrence_end_date date;
-- Keep undated todos and allow all-day habits with no hidden duration. No existing value is rewritten.
alter table public.tok_todos alter column start_date drop not null;
alter table public.tok_habits alter column duration_minutes drop not null, alter column duration_minutes drop default;

comment on column public.tok_events.all_day is 'NULL: legacy. Explicit true clears all time/duration fields; false requires both endpoints.';
comment on column public.tok_todos.occurrence_end_date is 'Inclusive all-day end, or explicit timed occurrence end. end_date still bounds recurrence.';
comment on column public.tok_todos.repeat_start_date is 'Optional repeat window start; legacy fallback is start_date. Not an occurrence endpoint.';
comment on column public.tok_habits.occurrence_start_date is 'Reference occurrence start. start_date/end_date remain repeat window bounds.';
comment on column public.tok_habits.occurrence_end_date is 'Reference occurrence end. Duration is translated from this reference for each occurrence.';
comment on column public.tok_habit_logs.occurrence_end_date is 'Snapshot of occurrence end for new completions; NULL legacy rows are never backfilled.';

create function public.tok_period_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  sd date; ed date; st time; expected integer;
begin
  -- Old clients/rows remain readable/editable until a period is explicitly upgraded.
  if new.all_day is null then return new; end if;
  if tg_table_name = 'tok_events' then sd := new.event_date; ed := new.end_date; st := new.event_time;
  elsif tg_table_name = 'tok_todos' then sd := new.start_date; ed := new.occurrence_end_date; st := new.todo_time;
  else sd := new.occurrence_start_date; ed := new.occurrence_end_date;
    if new.start_minute is not null then st := time '00:00' + new.start_minute * interval '1 minute'; end if;
  end if;
  if new.all_day then
    if st is not null or new.end_time is not null or new.duration_minutes is not null then
      raise exception 'all_day_time_values' using errcode='23514';
    end if;
    if tg_table_name = 'tok_todos' and sd is null and ed is null then return new; end if;
  end if;
  if sd is null or ed is null or ed < sd then raise exception 'period_dates_required_or_reversed' using errcode='23514'; end if;
  if not new.all_day then
    if st is null or new.end_time is null then raise exception 'period_times_required' using errcode='23514'; end if;
    if extract(second from st) <> 0 or extract(second from new.end_time) <> 0 then
      raise exception 'period_minute_precision_required' using errcode='23514';
    end if;
    expected := (ed - sd) * 1440 + (extract(epoch from new.end_time) - extract(epoch from st))::integer / 60;
    if expected <= 0 then raise exception 'period_end_not_after_start' using errcode='23514'; end if;
    -- Endpoints are authoritative; normalize redundant duration atomically.
    new.duration_minutes := expected;
  end if;
  return new;
end $$;
create trigger tok_events_period_guard before insert or update on public.tok_events for each row execute function public.tok_period_guard();
create trigger tok_todos_period_guard before insert or update on public.tok_todos for each row execute function public.tok_period_guard();
create trigger tok_habits_period_guard before insert or update on public.tok_habits for each row execute function public.tok_period_guard();
revoke all on function public.tok_period_guard() from public, anon;
-- Existing security-invoker someday move RPC supplies explicit one-day all-day endpoints.
create or replace function public.tok_move_someday_to_todo(p_someday_id uuid, p_date date)
returns public.tok_todos language plpgsql security invoker set search_path=public as $$
declare s public.tok_someday; t public.tok_todos;
begin
  if p_date is null then raise exception 'date_required' using errcode='22004'; end if;
  delete from public.tok_someday where id=p_someday_id and user_id=auth.uid() returning * into s;
  if not found then raise exception 'someday_not_found' using errcode='P0002'; end if;
  insert into public.tok_todos(title,start_date,occurrence_end_date,all_day,tag_id,group_id,project_id,is_done)
    values(s.title,p_date,p_date,true,s.tag_id,s.group_id,s.project_id,false) returning * into t;
  return t;
end $$;
revoke all on function public.tok_move_someday_to_todo(uuid,date) from public,anon;
grant execute on function public.tok_move_someday_to_todo(uuid,date) to authenticated;
notify pgrst, 'reload schema';
commit;
