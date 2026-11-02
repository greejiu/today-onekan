// 2026-11-02 언젠가 → 날짜 이동(tok_move_someday) 테스트 DB 준비: pglite 한 연결 테스트(someday-move-sql)와
// 실제 Postgres 두 연결 동시성 테스트(someday-move-concurrency)가 같은 표·마이그레이션을 씀. 가짜 id만 씀.
// exec(sql) = 여러 문장을 한 번에 실행하는 함수(pglite db.exec / pg client.query).
const fs=require('node:fs');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const mig=suffix=>fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix)),'utf8');
async function prepare(exec){
  // 역할은 클러스터 전체에 하나라 이미 있으면 그대로 씀(실제 Postgres에서 여러 번 실행)
  await exec(`do $$ begin create role authenticated; exception when duplicate_object then null; end $$;do $$ begin create role anon; exception when duplicate_object then null; end $$;`);
  // Supabase처럼 public 스키마의 새 표·함수는 anon·authenticated에 기본 권한을 줌 → 마이그레이션이 거두는지 함께 확인
  await exec(`grant usage on schema public to anon,authenticated;alter default privileges in schema public grant all on tables to anon,authenticated;alter default privileges in schema public grant all on functions to anon,authenticated;`);
  await exec(`create schema auth;create table auth.users(id uuid primary key);
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
  for(const table of ['tok_events','tok_todos','tok_habits','tok_someday','tok_habit_logs'])await exec(`alter table ${table} enable row level security;grant select,insert,update,delete on ${table} to authenticated;create policy ${table}_select on ${table} for select to authenticated using(auth.uid()=user_id);create policy ${table}_insert on ${table} for insert to authenticated with check(auth.uid()=user_id);create policy ${table}_update on ${table} for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);create policy ${table}_delete on ${table} for delete to authenticated using(auth.uid()=user_id);`);
  await exec(fs.readFileSync('supabase/migrations/20260927000000_tok_habit_skips_and_someday_move.sql','utf8'));
  // Supabase's public schema default grants, absent from a standalone Postgres fixture.
  await exec('grant select,insert,delete on tok_habit_skips to authenticated;');
  await exec(`create table tok_habit_categories(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),name text,color text,sort_order int,is_archived boolean);create table tok_event_categories(like tok_habit_categories including all);create table tok_projects(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),name text,unique(id,user_id));`);
  for(const table of ['tok_habit_categories','tok_event_categories','tok_projects'])await exec(`alter table ${table} enable row level security;grant select,insert,update on ${table} to authenticated;create policy owner on ${table} to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);`);
  await exec(fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_tok_groups_shared_categories.sql')),'utf8'));
  await exec(mig('_tok_common_period.sql'));
  await exec('alter table tok_habits add column sort_order integer not null default 0;'); // 운영 표에 있는 칸(가져온 기존 준비에는 없음)
  await exec(mig('_tok_someday_move_any_kind.sql'));
}
module.exports={prepare,A,B};
