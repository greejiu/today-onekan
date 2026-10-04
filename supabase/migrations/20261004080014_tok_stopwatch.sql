-- Additive stopwatch model. Legacy tok_focus_sessions remains untouched.
create schema if not exists onekan_private;
revoke all on schema onekan_private from public, anon;
grant usage on schema onekan_private to authenticated;
create table public.tok_stopwatch_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 todo_id uuid not null, snapshot jsonb not null, timezone text not null,
 state text not null check(state in ('running','paused','finished')), version integer not null default 1 check(version>0),
 started_at timestamptz not null, ended_at timestamptz,
 unique(id,user_id), check ((state='finished')=(ended_at is not null))
);
create unique index tok_stopwatch_one_active on public.tok_stopwatch_sessions(user_id) where state<>'finished';
create index tok_stopwatch_history on public.tok_stopwatch_sessions(user_id,started_at);
create table public.tok_stopwatch_intervals (
 id bigint generated always as identity primary key, user_id uuid not null references auth.users(id),
 session_id uuid not null, started_at timestamptz not null, ended_at timestamptz,
 foreign key(session_id,user_id) references public.tok_stopwatch_sessions(id,user_id), check(ended_at is null or ended_at>=started_at)
);
create unique index tok_stopwatch_one_open on public.tok_stopwatch_intervals(session_id) where ended_at is null;
create index tok_stopwatch_intervals_session on public.tok_stopwatch_intervals(user_id,session_id);
create table public.tok_stopwatch_requests (
 user_id uuid not null references auth.users(id), request_id uuid not null, payload jsonb not null, response jsonb not null,
 primary key(user_id,request_id)
);
revoke all on public.tok_stopwatch_sessions,public.tok_stopwatch_intervals,public.tok_stopwatch_requests from public,anon,authenticated;
grant select on public.tok_stopwatch_sessions,public.tok_stopwatch_intervals to authenticated;
alter table public.tok_stopwatch_sessions enable row level security;
alter table public.tok_stopwatch_intervals enable row level security;
alter table public.tok_stopwatch_requests enable row level security;
create policy stopwatch_sessions_read on public.tok_stopwatch_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy stopwatch_requests_read on public.tok_stopwatch_requests for select to authenticated using(user_id=(select auth.uid()));
create policy stopwatch_intervals_read on public.tok_stopwatch_intervals for select to authenticated using(user_id=(select auth.uid()));

create function onekan_private.stopwatch_change(p_request uuid,p_action text,p_session uuid,p_version integer,p_todo uuid,p_timezone text,p_stopped_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s public.tok_stopwatch_sessions; r public.tok_stopwatch_requests;
 t public.tok_todos; n timestamptz:=clock_timestamp(); cut timestamptz; payload jsonb; result jsonb; snap jsonb;
begin
 if u is null then raise exception 'authentication_required'; end if;
 if p_request is null or p_action is null or p_action not in ('start','pause','resume','finish') then raise exception 'invalid_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,73017));
 n:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_array(p_action,p_session,p_version,p_todo,p_timezone,p_stopped_at);
 select * into r from public.tok_stopwatch_requests where user_id=u and request_id=p_request;
 if found then
  if r.payload<>payload then raise exception 'request_payload_mismatch'; end if;
  return r.response;
 end if;
 if p_action='start' then
  select * into s from public.tok_stopwatch_sessions where user_id=u and state<>'finished' for update;
  if found then
   if s.todo_id<>p_todo then raise exception 'active_session_exists'; end if;
  else
   if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone'; end if;
   select * into t from public.tok_todos where id=p_todo and user_id=u for share;
   if not found then raise exception 'todo_not_owned'; end if;
   snap:=jsonb_build_object('title',t.title,'group_id',t.group_id,'category_id',t.tag_id,'project_id',t.project_id,
    'group_name',(select name from public.tok_item_groups where id=t.group_id and user_id=u and kind='todo'),
    'category_name',(select name from public.tok_habit_categories where id=t.tag_id and user_id=u),
    'project_name',(select name from public.tok_projects where id=t.project_id and user_id=u));
   insert into public.tok_stopwatch_sessions(user_id,todo_id,snapshot,timezone,state,started_at)
    values(u,t.id,snap,p_timezone,'running',n) returning * into s;
   insert into public.tok_stopwatch_intervals(user_id,session_id,started_at) values(u,s.id,n);
  end if;
 else
  select * into s from public.tok_stopwatch_sessions where id=p_session and user_id=u for update;
  if not found then raise exception 'session_not_owned'; end if;
  if s.version is distinct from p_version or s.state='finished' then raise exception 'stale_session'; end if;
  if p_action='resume' then
   if s.state<>'paused' then raise exception 'invalid_transition'; end if;
   insert into public.tok_stopwatch_intervals(user_id,session_id,started_at) values(u,s.id,n);
  else
   if p_action='pause' and s.state<>'running' then raise exception 'invalid_transition'; end if;
   cut:=date_trunc('milliseconds',coalesce(p_stopped_at,n));
   if cut>n+interval '2 seconds' or cut<s.started_at then raise exception 'invalid_stop_time'; end if;
   cut:=least(cut,n);
   if s.state='running' then
    if exists(select 1 from public.tok_stopwatch_intervals where session_id=s.id and ended_at is null and started_at>cut) then raise exception 'invalid_stop_time'; end if;
    update public.tok_stopwatch_intervals set ended_at=cut where session_id=s.id and user_id=u and ended_at is null;
   elsif cut<coalesce((select max(ended_at) from public.tok_stopwatch_intervals where session_id=s.id),s.started_at) then raise exception 'invalid_stop_time';
   end if;
  end if;
  update public.tok_stopwatch_sessions set version=version+1,state=case p_action when 'resume' then 'running' when 'pause' then 'paused' else 'finished' end,
   ended_at=case when p_action='finish' then cut else null end where id=s.id returning * into s;
 end if;
 result:=jsonb_build_object('session',to_jsonb(s),'server_now',clock_timestamp());
 insert into public.tok_stopwatch_requests values(u,p_request,payload,result);
 return result;
end $$;
revoke all on function onekan_private.stopwatch_change(uuid,text,uuid,integer,uuid,text,timestamptz) from public,anon;
grant execute on function onekan_private.stopwatch_change(uuid,text,uuid,integer,uuid,text,timestamptz) to authenticated;
create function public.tok_stopwatch_change(p_request uuid,p_action text,p_session uuid default null,p_version integer default null,p_todo uuid default null,p_timezone text default null,p_stopped_at timestamptz default null)
returns jsonb language sql security invoker set search_path='' as $$ select onekan_private.stopwatch_change(p_request,p_action,p_session,p_version,p_todo,p_timezone,p_stopped_at) $$;
revoke all on function public.tok_stopwatch_change(uuid,text,uuid,integer,uuid,text,timestamptz) from public,anon;
grant execute on function public.tok_stopwatch_change(uuid,text,uuid,integer,uuid,text,timestamptz) to authenticated;
create function public.tok_stopwatch_read() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('server_now',clock_timestamp(),'session',(select to_jsonb(s) from public.tok_stopwatch_sessions s where user_id=auth.uid() and state<>'finished'),
 'intervals',coalesce((select jsonb_agg(to_jsonb(i) order by i.started_at) from public.tok_stopwatch_intervals i join public.tok_stopwatch_sessions s on s.id=i.session_id where s.user_id=auth.uid() and s.state<>'finished'),'[]'::jsonb))
$$;
revoke all on function public.tok_stopwatch_read() from public,anon;
grant execute on function public.tok_stopwatch_read() to authenticated;
create function public.tok_stopwatch_report(p_from date,p_to date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then raise exception 'invalid_date_range'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.started_at),'[]'::jsonb) into result from (
 select s.id,s.todo_id,s.snapshot,s.started_at,s.timezone,d.day::date::text as day,
 sum(extract(epoch from least(i.ended_at,(d.day::date+1)::timestamp at time zone s.timezone)-greatest(i.started_at,d.day::date::timestamp at time zone s.timezone))*1000) as milliseconds
 from public.tok_stopwatch_sessions s join public.tok_stopwatch_intervals i on i.session_id=s.id and i.user_id=s.user_id
 cross join lateral generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d(day)
 where s.user_id=auth.uid() and s.state='finished' and i.ended_at is not null
 and i.started_at<(d.day::date+1)::timestamp at time zone s.timezone and i.ended_at>d.day::date::timestamp at time zone s.timezone
 group by s.id,d.day
 ) q;
 return result;
end $$;
revoke all on function public.tok_stopwatch_report(date,date) from public,anon;
grant execute on function public.tok_stopwatch_report(date,date) to authenticated;

-- Timing page: full duration of sessions saved on the requested local day.
create function public.tok_stopwatch_today(p_day date) returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.started_at),'[]'::jsonb) from (
 select s.id,s.todo_id,s.snapshot,s.started_at,s.timezone,
 sum(extract(epoch from i.ended_at-i.started_at)*1000) milliseconds
 from public.tok_stopwatch_sessions s join public.tok_stopwatch_intervals i on i.session_id=s.id and i.user_id=s.user_id
 where s.user_id=auth.uid() and s.state='finished' and (s.ended_at at time zone s.timezone)::date=p_day
 group by s.id
 ) q
$$;
revoke all on function public.tok_stopwatch_today(date) from public,anon;
grant execute on function public.tok_stopwatch_today(date) to authenticated;
