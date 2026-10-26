// 2026-10-26 언젠가 → 일정·할일·습관 한 번에 옮기기(tok_move_someday) 검증. 실제 Postgres(pglite), 가짜 id만 씀.
// 한 거래(실패하면 원본 그대로), 응답 유실 후 재시도·다른 창 재요청 = 새로 만들지 않고 처음 결과, 허용 칸만, 본인 것만, 기록으로 결과 확인.
const assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
const R1='10000000-0000-0000-0000-000000000001',R2='10000000-0000-0000-0000-000000000002',R3='10000000-0000-0000-0000-000000000003';
const mig=suffix=>fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix)),'utf8');
(async()=>{
 const db=new PGlite();try{
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
  await db.exec(mig('_tok_common_period.sql'));
  await db.exec('alter table tok_habits add column sort_order integer not null default 0;'); // 운영 표에 있는 칸(가져온 기존 준비에는 없음)
  await db.exec(mig('_tok_someday_move_any_kind.sql'));
  const as=(id,sql,params=[])=>db.transaction(async tx=>{await tx.exec(`set local role ${id?'authenticated':'anon'}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[id||'']);return tx.query(sql,params);});
  const fails=async(p,re,m)=>{let err;try{await p;}catch(e){err=e;}assert(err,m+': 실패해야 함');if(re)assert.match(err.message,re,m);};
  const move=(user,someday,req,kind,row)=>as(user,'select tok_move_someday($1,$2,$3,$4::jsonb) r',[someday,req,kind,JSON.stringify(row)]).then(x=>x.rows[0].r);
  const count=async(table,user=A)=>Number((await as(user,`select count(*) c from ${table}`)).rows[0].c);
  const snapshot=async()=>JSON.stringify((await db.query("select (select coalesce(jsonb_agg(to_jsonb(s) order by s.title),'[]') from tok_someday s) s,(select count(*) from tok_events) e,(select count(*) from tok_todos) t,(select count(*) from tok_habits) h,(select count(*) from tok_someday_moves) m")).rows[0]);
  // 준비: A의 범주·프로젝트·할일 그룹, B의 범주, 언젠가 항목들
  const cat=(await as(A,"insert into tok_habit_categories(name) values('공부') returning id")).rows[0].id;
  const catB=(await as(B,"insert into tok_habit_categories(name) values('남의 범주') returning id")).rows[0].id;
  const proj=(await as(A,"insert into tok_projects(name) values('포트폴리오') returning id")).rows[0].id;
  const tg=(await as(A,"insert into tok_item_groups(kind,name) values('todo','할일 그룹') returning id")).rows[0].id;
  const hg=(await as(A,"insert into tok_item_groups(kind,name) values('habit','습관 그룹') returning id")).rows[0].id;
  const some=async(title)=>(await as(A,"insert into tok_someday(title,tag_id,group_id,project_id) values($1,$2,$3,$4) returning id",[title,cat,tg,proj])).rows[0].id;
  const s1=await some('책 읽기'),s2=await some('운동'),s3=await some('면접 준비'),s4=await some('실패 시험'),s5=await some('남이 옮기기');

  // 1. 할일로(하루종일, 범주·그룹·프로젝트·반복) → 언젠가 삭제 + 할일 + 기록, 한 번
  let r=await move(A,s1,R1,'todo',{title:'책 읽기',start_date:'2026-10-27',occurrence_end_date:'2026-10-27',all_day:true,todo_time:null,end_time:null,duration_minutes:null,tag_id:cat,group_id:tg,project_id:proj,repeat_unit:'week',repeat_interval:1,repeat_days:[1,3],repeat_start_date:'2026-10-27',end_date:null});
  assert.equal(r.kind,'todo');assert.equal(r.replayed,false);assert.equal(r.title,'책 읽기');
  const todo=(await as(A,'select * from tok_todos where id=$1',[r.item_id])).rows[0];
  assert.equal(todo.title,'책 읽기');assert.equal(todo.is_done,false);assert.equal(todo.tag_id,cat);assert.equal(todo.group_id,tg);assert.equal(todo.project_id,proj);assert.deepEqual(todo.repeat_days,[1,3]);assert.equal(todo.user_id,A);
  assert.equal((await as(A,'select count(*) c from tok_someday where id=$1',[s1])).rows[0].c,0);
  const log=(await as(A,'select * from tok_someday_moves where someday_id=$1',[s1])).rows[0];assert.equal(log.item_id,r.item_id);assert.equal(log.request_id,R1);assert.equal(log.kind,'todo');
  // 2. 응답 유실 후 같은 요청 재시도 → 새로 만들지 않고 같은 결과
  let before=await snapshot();
  let again=await move(A,s1,R1,'todo',{title:'책 읽기',start_date:'2026-10-27'});
  assert.equal(again.replayed,true);assert.equal(again.same_request,true);assert.equal(again.item_id,r.item_id);assert.equal(again.item_exists,true);assert.equal(await snapshot(),before,'재시도 = 변화 없음');
  // 3. 다른 창(다른 요청)·다른 종류로 다시 → 만들지 않고 먼저 옮긴 결과를 알려 줌
  again=await move(A,s1,R2,'event',{title:'책 읽기',event_date:'2026-10-28',all_day:true});
  assert.equal(again.replayed,true);assert.equal(again.same_request,false);assert.equal(again.kind,'todo');assert.equal(again.item_id,r.item_id);assert.equal(await snapshot(),before,'다른 요청 = 변화 없음');
  console.log('PASS 할일로 옮기기 + 응답 유실 재시도·다른 창 재요청 = 새로 만들지 않고 처음 결과');

  // 4. 일정으로(시간, 메모, 기본 일정 범주 = category_id 없음, 공유 범주) / 5. 습관으로(시간·반복·습관 그룹)
  r=await move(A,s2,R1,'event',{title:'운동',memo:'헬스장',event_date:'2026-10-27',end_date:'2026-10-27',event_time:'09:00:00',end_time:'09:30:00',duration_minutes:30,all_day:false,category_id:null,shared_category_id:cat});
  const ev=(await as(A,'select * from tok_events where id=$1',[r.item_id])).rows[0];assert.equal(ev.memo,'헬스장');assert.equal(ev.event_time,'09:00:00');assert.equal(ev.shared_category_id,cat);assert.equal(ev.category_id,null);
  r=await move(A,s3,R3,'habit',{name:'면접 준비',sort_order:3,start_date:'2026-10-27',end_date:null,occurrence_start_date:'2026-10-27',occurrence_end_date:'2026-10-27',start_minute:600,end_time:'10:30:00',duration_minutes:30,all_day:false,repeat_unit:'day',repeat_interval:1,category_id:cat,group_id:hg,project_id:proj});
  const hb=(await as(A,'select * from tok_habits where id=$1',[r.item_id])).rows[0];assert.equal(hb.name,'면접 준비');assert.equal(hb.start_minute,600);assert.equal(hb.group_id,hg);assert.equal(hb.is_active,true);
  assert.equal(await count('tok_someday_moves'),3);
  console.log('PASS 일정으로(시간·메모·공유 범주, 일정 범주 기본)·습관으로(시간·반복·습관 그룹)');

  // 6. 실패하면 전부 되돌림: 기간 오류·제목 없음·남의 범주·허용 안 한 칸·종류 오류 → 언젠가·표·기록 그대로
  before=await snapshot();
  await fails(move(A,s4,R1,'todo',{title:'실패 시험',start_date:'2026-10-27',all_day:false,todo_time:'09:00:00'}),null,'시간 있는데 끝 없음');
  await fails(move(A,s4,R1,'event',{event_date:'2026-10-27',end_date:'2026-10-27',all_day:true}),/null value|title/,'일정 제목 없음');
  await fails(move(A,s4,R1,'todo',{title:'실패 시험',start_date:'2026-10-27',occurrence_end_date:'2026-10-27',all_day:true,tag_id:catB}),/foreign key|violates/,'남의 범주');
  await fails(move(A,s4,R1,'habit',{name:'실패 시험',start_date:'2026-10-27',occurrence_start_date:'2026-10-27',occurrence_end_date:'2026-10-27',all_day:true,repeat_unit:'day',repeat_interval:1,group_id:tg}),/foreign key|violates|group/,'할일 그룹을 습관에');
  for(const bad of [{title:'x',start_date:'2026-10-27',is_done:true},{title:'x',start_date:'2026-10-27',user_id:B},{title:'x',start_date:'2026-10-27',id:R1},{title:'x',start_date:'2026-10-27',repeat_source_id:R1}])
   await fails(move(A,s4,R1,'todo',bad),/field_not_allowed/,'허용 안 한 칸 '+Object.keys(bad).pop());
  await fails(move(A,s4,R1,'someday',{title:'x'}),/invalid_kind/,'종류 오류');
  await fails(move(A,s4,null,'todo',{title:'x',start_date:'2026-10-27'}),/move_key_required/,'요청 키 없음');
  assert.equal(await snapshot(),before,'실패 = 언젠가·표·기록 그대로');
  console.log('PASS 실패(기간·제목·남의 범주·다른 공간 그룹·허용 안 한 칸·종류·키) = 전부 그대로');

  // 7. 본인 것만: B는 A의 언젠가를 옮기지 못하고(없는 것으로 봄) A의 기록도 못 읽음, 로그인 안 하면 실행 불가
  await fails(move(B,s5,R1,'todo',{title:'남이 옮기기',start_date:'2026-10-27'}),/someday_not_found/,'남의 언젠가');
  assert.equal(await count('tok_someday_moves',B),0,'남의 기록 안 보임');assert.equal(await snapshot(),before);
  await fails(as(null,'select tok_move_someday($1,$2,$3,$4::jsonb)',[s5,R1,'todo','{"title":"x"}']),/permission denied/,'로그인 안 함');
  await fails(as(A,"update tok_someday_moves set item_id=$1",[R1]),/permission denied/,'기록 수정 불가');
  await fails(as(A,"delete from tok_someday_moves",[]),/permission denied/,'기록 삭제 불가');
  // 8. 이미 없는 언젠가: 기록이 없으면 someday_not_found(만들지 않음), 다른 요청이 먼저 지우고 기록한 경우는 그 결과
  await as(A,'delete from tok_someday where id=$1',[s5]);
  await fails(move(A,s5,R1,'todo',{title:'남이 옮기기',start_date:'2026-10-27'}),/someday_not_found/,'지워진 언젠가');
  assert.equal(await count('tok_todos'),1,'새 할일 없음');
  // 옮긴 뒤 만든 항목을 지운 경우: 재시도해도 다시 만들지 않고 item_exists=false로 알려 줌
  await as(A,'delete from tok_todos where id=$1',[log.item_id]);
  again=await move(A,s1,R1,'todo',{title:'책 읽기',start_date:'2026-10-27'});assert.equal(again.replayed,true);assert.equal(again.item_exists,false);assert.equal(await count('tok_todos'),0);
  console.log('PASS 본인 것만(남의 언젠가·기록, 로그인 안 함, 기록 수정·삭제 불가), 지워진 언젠가 = 만들지 않음, 옮긴 뒤 지운 항목 = 다시 만들지 않고 알려 줌');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exit(1);});
