const assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_tok_common_period.sql'));
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
(async()=>{
 const db=new PGlite();try {
  // Column types/defaults/nullability and policies checked against live catalog (read-only, 2026-10-03).
  // Only synthetic IDs, no production rows. Earlier base migrations are not checked into the repository.
  await db.exec(`create schema auth;create role authenticated;create role anon;create table auth.users(id uuid primary key);
  insert into auth.users values('${A}'),('${B}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated,anon;
  create table tok_events(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),title text not null,event_date date not null,end_date date,event_time time,duration_minutes integer,memo text,category_id uuid,repeat_unit text,repeat_interval integer);
  create table tok_todos(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),title text not null,start_date date not null,end_date date,todo_time time,duration_minutes integer,is_done boolean not null default false,tag_id uuid,repeat_unit text,repeat_interval integer,repeat_days smallint[],repeat_chain_id uuid,repeat_source_id uuid,completed_date date,project_id uuid,unique(id,user_id),constraint tok_todos_date_order check(end_date is null or end_date>=start_date));
  create unique index tok_todos_repeat_source_id_key on tok_todos(repeat_source_id) where repeat_source_id is not null;
  create table tok_habits(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),name text not null,start_date date not null default current_date,end_date date,start_minute integer check(start_minute is null or start_minute>=0 and start_minute<1440),duration_minutes integer not null default 30 check(duration_minutes>0),is_active boolean not null default true,repeat_unit text,repeat_interval integer,repeat_days smallint[],cycle_changed_at date,category_id uuid,project_id uuid);
  create table tok_someday(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),title text,tag_id uuid,is_done boolean default false);
  create table tok_habit_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),habit_id uuid not null references tok_habits(id) on delete cascade,done_date date not null default current_date,start_minute integer,duration_minutes integer,unique(habit_id,done_date));
  create table tok_habit_pauses(id uuid primary key default gen_random_uuid(),habit_id uuid references tok_habits(id),paused_at date,resumed_at date);`);
  for(const table of ['tok_events','tok_todos','tok_habits','tok_someday','tok_habit_logs'])await db.exec(`alter table ${table} enable row level security;grant select,insert,update,delete on ${table} to authenticated;create policy ${table}_select on ${table} for select to authenticated using(auth.uid()=user_id);create policy ${table}_insert on ${table} for insert to authenticated with check(auth.uid()=user_id);create policy ${table}_update on ${table} for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);create policy ${table}_delete on ${table} for delete to authenticated using(auth.uid()=user_id);`);
  await db.exec(fs.readFileSync('supabase/migrations/20260927000000_tok_habit_skips_and_someday_move.sql','utf8'));
  // Supabase's public schema default grants, absent from a standalone Postgres fixture.
  await db.exec('grant select,insert,delete on tok_habit_skips to authenticated;');
  await db.exec(`create table tok_habit_categories(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),name text,color text,sort_order int,is_archived boolean);create table tok_event_categories(like tok_habit_categories including all);create table tok_projects(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),name text,unique(id,user_id));`);
  for(const table of ['tok_habit_categories','tok_event_categories','tok_projects'])await db.exec(`alter table ${table} enable row level security;grant select,insert,update on ${table} to authenticated;create policy owner on ${table} to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);`);
  await db.exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_tok_groups_shared_categories.sql')),'utf8'));
  const as=(id,sql,params=[])=>db.transaction(async tx=>{await tx.exec(`set local role ${id?'authenticated':'anon'}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);return tx.query(sql,params);});
  const e=(await as(A,"insert into tok_events(title,event_date,end_date,event_time) values('legacy','2026-10-03','2026-10-06','23:00') returning id")).rows[0].id;
  const t=(await as(A,"insert into tok_todos(title,start_date,end_date,todo_time,repeat_unit,duration_minutes) values('legacy repeat','2026-10-03','2026-10-31','23:00','day',120) returning id")).rows[0].id;
  const h=(await as(A,"insert into tok_habits(name,start_date,end_date,start_minute,duration_minutes,repeat_unit) values('legacy habit','2026-10-03','2026-10-31',1380,120,'day') returning id")).rows[0].id;
  await as(A,"insert into tok_habit_logs(habit_id,done_date,start_minute,duration_minutes) values($1,'2026-09-30',540,45)",[h]);
  await as(A,"insert into tok_habit_skips(habit_id,skip_date) values($1,'2026-09-29')",[h]);
  await db.query("insert into tok_habit_pauses(habit_id,paused_at,resumed_at) values($1,'2026-09-27','2026-09-28')",[h]);
  const policies=JSON.stringify((await db.query("select tablename,policyname,qual,with_check from pg_policies order by tablename,policyname")).rows);
  const baseline=JSON.stringify((await db.query("select 'events' kind,to_jsonb(e) row from tok_events e union all select 'todos',to_jsonb(t) from tok_todos t union all select 'habits',to_jsonb(h) from tok_habits h union all select 'logs',to_jsonb(l)-'occurrence_end_date' from tok_habit_logs l union all select 'skips',to_jsonb(s) from tok_habit_skips s union all select 'pauses',to_jsonb(p) from tok_habit_pauses p order by kind")).rows);
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  assert.equal(JSON.stringify((await db.query("select tablename,policyname,qual,with_check from pg_policies order by tablename,policyname")).rows),policies);
  const legacyRows=(await db.query("select 'events' kind,to_jsonb(e)-'all_day'-'end_time' row from tok_events e union all select 'todos',to_jsonb(t)-'all_day'-'end_time'-'occurrence_end_date'-'repeat_start_date' from tok_todos t union all select 'habits',to_jsonb(h)-'all_day'-'end_time'-'occurrence_start_date'-'occurrence_end_date' from tok_habits h union all select 'logs',to_jsonb(l)-'occurrence_end_date' from tok_habit_logs l union all select 'skips',to_jsonb(s) from tok_habit_skips s union all select 'pauses',to_jsonb(p) from tok_habit_pauses p order by kind")).rows;assert.equal(JSON.stringify(legacyRows),baseline);
  await as(A,"update tok_events set title='only title' where id=$1",[e]);assert.equal((await as(A,'select duration_minutes,all_day,end_time from tok_events where id=$1',[e])).rows[0].duration_minutes,null);
  await as(A,"update tok_todos set all_day=false,occurrence_end_date='2026-10-04',end_time='01:00',duration_minutes=999 where id=$1",[t]);assert.equal((await as(A,'select duration_minutes,end_date from tok_todos where id=$1',[t])).rows[0].duration_minutes,120);
  await as(A,"update tok_habits set all_day=false,occurrence_start_date='2026-10-03',occurrence_end_date='2026-10-04',end_time='01:00' where id=$1",[h]);assert.equal((await as(A,'select end_date::text from tok_habits where id=$1',[h])).rows[0].end_date,'2026-10-31');
  await assert.rejects(as(A,"update tok_todos set occurrence_end_date='2026-10-03',end_time='01:00' where id=$1",[t]),/period_end_not_after_start/);
  await assert.rejects(as(A,"update tok_todos set end_time=null where id=$1",[t]),/period_times_required/);
  await assert.rejects(as(A,"insert into tok_events(title,event_date,end_date,all_day,event_time) values('hidden time','2026-10-03','2026-10-03',true,'09:00')"),/all_day_time_values/);
  await assert.rejects(as(A,"insert into tok_events(title,event_date,end_date,all_day) values('reverse','2026-10-04','2026-10-03',true)"),/period_dates_required_or_reversed/);
  await as(A,"insert into tok_events(title,event_date,end_date,event_time,end_time,all_day) values('multi','2026-10-03','2026-10-06','23:00','01:00',false)");assert.equal((await as(A,"select duration_minutes from tok_events where title='multi'")).rows[0].duration_minutes,3000);
  await as(A,"insert into tok_habits(name,start_date,occurrence_start_date,occurrence_end_date,all_day) values('all day','2026-10-03','2026-10-03','2026-10-06',true)");assert.equal((await as(A,"select duration_minutes from tok_habits where name='all day'")).rows[0].duration_minutes,null);
  await as(A,"insert into tok_todos(title,start_date,occurrence_end_date,all_day) values('undated',null,null,true)");
  assert.equal((await as(B,'select * from tok_events where id=$1',[e])).rows.length,0);assert.equal((await as(B,"update tok_events set title='other user' where id=$1 returning id",[e])).rows.length,0);
  await assert.rejects(as(A,'update tok_todos set user_id=$1 where id=$2',[B,t]),/row-level security/);
  await assert.rejects(as(null,'select * from tok_events'),/permission denied/);
  await as(A,"insert into tok_habit_logs(habit_id,done_date,start_minute,duration_minutes) values($1,'2026-10-03',1380,120)",[h]);await assert.rejects(as(A,"insert into tok_habit_logs(habit_id,done_date) values($1,'2026-10-03')",[h]),/unique constraint/);
  await assert.rejects(as(A,"insert into tok_habit_skips(habit_id,skip_date) values($1,'2026-10-03')",[h]),/habit_already_done/);
  const g=(await as(A,"insert into tok_item_groups(kind,name) values('todo','회사') returning id")).rows[0].id;
  const c=(await as(A,"insert into tok_habit_categories(name) values('행정') returning id")).rows[0].id;
  const p=(await as(A,"insert into tok_projects(name) values('목표') returning id")).rows[0].id;
  const s=(await as(A,"insert into tok_someday(title,group_id,tag_id,project_id) values('move',$1,$2,$3) returning id",[g,c,p])).rows[0].id;
  await assert.rejects(as(B,"select tok_move_someday_to_todo($1,'2026-10-03')",[s]),/someday_not_found/);
  const moved=(await as(A,"select * from tok_move_someday_to_todo($1,'2026-10-03')",[s])).rows[0];assert.equal(moved.group_id,g);assert.equal(moved.tag_id,c);assert.equal(moved.project_id,p);assert.equal(moved.all_day,true);assert.equal(moved.occurrence_end_date.toISOString().slice(0,10),'2026-10-03');assert.equal(moved.todo_time,null);
  await assert.rejects(as(A,"select tok_move_someday_to_todo($1,'2026-10-03')",[s]),/someday_not_found/);
  assert.equal((await as(A,"select start_minute,duration_minutes from tok_habit_logs where done_date='2026-09-30'")).rows[0].duration_minutes,45);
  console.log('PGlite migration / no backfill / unchanged RLS + ownership / endpoint validation + duration normalization / undated + all-day / repeat bounds / history + unique completion / atomic someday RPC PASS');
 } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
