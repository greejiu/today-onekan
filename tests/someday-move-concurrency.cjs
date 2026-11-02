// 2026-11-02 언젠가 → 날짜 이동(tok_move_someday) 동시성: 실제 Postgres에 연결을 따로 열어 같은 언젠가 항목을 동시에 옮김.
// 같은 요청 키·다른 요청 키 모두 새 항목·옮긴 기록이 각각 하나, 한쪽(또는 양쪽)이 실패해도 원본과 결과가 맞는지 확인.
// 테스트 전용 Postgres가 필요함(운영 DB 금지): TEST_DATABASE_URL=postgres://postgres@localhost:55432/postgres
//   이 주소의 서버에 임시 데이터베이스를 새로 만들어 쓰고 끝나면 지움. 가짜 id만 씀.
const assert=require('node:assert/strict');const {Client}=require('pg');const {prepare,A}=require('./someday-move-schema.cjs');
const URL_=process.env.TEST_DATABASE_URL;
if(!URL_){console.error('TEST_DATABASE_URL required: 테스트 전용 Postgres 주소(예: postgres://postgres@localhost:55432/postgres)');process.exit(1);}
if(/supabase\.(co|com|net)|pooler/i.test(URL_)){console.error('운영(Supabase) 주소에는 실행하지 않아요. 테스트 전용 Postgres를 쓰세요.');process.exit(1);}
const ok=m=>console.log('PASS '+m);
const key=n=>'30000000-0000-0000-0000-'+String(n).padStart(12,'0');
const row=title=>({title,start_date:'2026-11-03',occurrence_end_date:'2026-11-03',all_day:true});
const badRow=title=>({title,start_date:'2026-11-03',all_day:false,todo_time:'09:00:00'}); // 끝 없는 시간 = 기간 검사에서 실패(삭제 뒤 넣기에서)
(async()=>{
 const dbName='someday_move_test_'+process.pid+'_'+Date.now();
 const admin=new Client({connectionString:URL_});await admin.connect();await admin.query(`create database ${dbName}`);
 const url=new URL(URL_);url.pathname='/'+dbName;const dbUrl=url.toString();
 const open=[];
 try{
  const setup=new Client({connectionString:dbUrl});await setup.connect();open.push(setup);
  await prepare(sql=>setup.query(sql));
  // 로그인한 사용자 A로 따로 연결(각 연결 = 다른 창·기기)
  const connect=async()=>{const c=new Client({connectionString:dbUrl});await c.connect();open.push(c);await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);return c;};
  const move=(c,someday,req,r,kind='todo')=>c.query('select public.tok_move_someday($1,$2,$3,$4::jsonb) r',[someday,req,kind,JSON.stringify(r)]).then(x=>x.rows[0].r);
  const some=async title=>(await setup.query("insert into tok_someday(user_id,title) values($1,$2) returning id",[A,title])).rows[0].id;
  // 그 언젠가 항목의 지금 상태: 원본이 있는지, 기록 몇 개, 그 제목으로 만든 항목 몇 개(세 표 합)
  const state=async(someday,title)=>{const q=(sql,p)=>setup.query(sql,p).then(r=>r.rows);
   const [src]=await q('select count(*)::int n from tok_someday where id=$1',[someday]);const logs=await q('select * from tok_someday_moves where someday_id=$1',[someday]);
   const items=await q("select id from tok_todos where title=$1 union all select id from tok_events where title=$1 union all select id from tok_habits where name=$1",[title]);
   return {source:src.n,logs,items:items.map(i=>i.id)};};
  // 원본이 있으면 기록·항목 0, 없으면 기록 1·항목 1이고 기록이 그 항목을 가리켜야 함
  const consistent=(st,m)=>{if(st.source){assert.equal(st.logs.length,0,m+': 원본이 있으면 기록 없음');assert.equal(st.items.length,0,m+': 원본이 있으면 항목 없음');}
   else{assert.equal(st.logs.length,1,m+': 기록 하나');assert.equal(st.items.length,1,m+': 항목 하나');assert.equal(st.logs[0].item_id,st.items[0],m+': 기록 = 그 항목');}};
  // 두 번째 연결이 첫 연결의 행 잠금을 기다리는 중인지(실제로 겹쳐 실행됐다는 증거)
  const waiting=async c=>{const pid=c.processID;for(let i=0;i<50;i++){const r=await admin.query("select wait_event_type from pg_stat_activity where pid=$1",[pid]);if(r.rows[0]?.wait_event_type==='Lock')return true;await new Promise(r=>setTimeout(r,100));}return false;};
  const fails=async(p,re,m)=>{let err;try{await p;}catch(e){err=e;}assert(err,m+': 실패해야 함');if(re)assert.match(err.message,re,m);return err;};
  const c1=await connect(),c2=await connect();

  // 1. 같은 요청 키(응답 유실 후 다른 연결로 재시도): 첫 연결이 거래 중일 때 둘째가 기다렸다가 처음 결과를 받음
  let s=await some('같은 키');await c1.query('begin');const r1=await move(c1,s,key(1),row('같은 키'));
  let p2=move(c2,s,key(1),row('같은 키'));assert(await waiting(c2),'둘째 연결이 첫 연결의 잠금을 기다림');
  await c1.query('commit');let r2=await p2;
  assert.equal(r1.replayed,false);assert.equal(r2.replayed,true);assert.equal(r2.same_request,true);assert.equal(r2.item_id,r1.item_id);assert.equal(r2.item_exists,true);
  let st=await state(s,'같은 키');assert.equal(st.source,0);consistent(st,'같은 키');assert.equal(st.logs[0].request_id,key(1));
  ok('같은 요청 키, 두 연결 동시: 둘째는 첫 연결 잠금을 기다린 뒤 처음 결과(같은 항목) — 새 항목 1·기록 1');

  // 2. 다른 요청 키(다른 창·기기): 둘째는 만들지 않고 "다른 요청이 먼저 옮김"을 받음
  s=await some('다른 키');await c1.query('begin');const r3=await move(c1,s,key(2),row('다른 키'));
  p2=move(c2,s,key(3),row('다른 키'));assert(await waiting(c2));await c1.query('commit');r2=await p2;
  assert.equal(r3.replayed,false);assert.equal(r2.replayed,true);assert.equal(r2.same_request,false);assert.equal(r2.item_id,r3.item_id);
  st=await state(s,'다른 키');assert.equal(st.source,0);consistent(st,'다른 키');assert.equal(st.logs[0].request_id,key(2),'기록은 먼저 옮긴 요청');
  ok('다른 요청 키, 두 연결 동시: 둘째는 만들지 않고 먼저 옮긴 결과(same_request=false) — 새 항목 1·기록 1');

  // 3. 먼저 쪽이 실패(거래 되돌림): 기다리던 둘째가 원본을 지우고 만듦 — 첫 쪽이 만들던 항목은 남지 않음
  s=await some('먼저 실패');await c1.query('begin');const r4=await move(c1,s,key(4),row('먼저 실패'));
  p2=move(c2,s,key(5),row('먼저 실패'));assert(await waiting(c2));await c1.query('rollback');r2=await p2;
  assert.equal(r2.replayed,false,'둘째가 실제로 옮김');assert.notEqual(r2.item_id,r4.item_id);
  st=await state(s,'먼저 실패');assert.equal(st.source,0);consistent(st,'먼저 실패');assert.equal(st.logs[0].request_id,key(5));assert.equal(st.items[0],r2.item_id);
  // 3-2. 먼저 쪽이 함수 안에서 실패(지운 뒤 넣기에서 기간 오류): Postgres는 오류가 나면 그 거래를 바로 끝내고 잠금을 풂
  //      → 첫 연결이 ROLLBACK을 보내기 전이라도 둘째는 기다리지 않고 원본을 옮김(지운 것은 되돌아가 있음)
  s=await some('먼저 오류');await c1.query('begin');await fails(move(c1,s,key(6),badRow('먼저 오류')),/period_dates_required_or_reversed/,'먼저 쪽 오류');
  st=await state(s,'먼저 오류');assert.equal(st.source,1,'오류 = 지운 원본 되돌아감');consistent(st,'먼저 오류(오류 직후)');
  r2=await move(c2,s,key(7),row('먼저 오류'));await c1.query('rollback');
  assert.equal(r2.replayed,false);st=await state(s,'먼저 오류');consistent(st,'먼저 오류');assert.equal(st.logs[0].request_id,key(7));
  ok('먼저 쪽 실패(되돌림·함수 안 오류): 둘째가 옮김, 첫 쪽 항목은 남지 않음 — 새 항목 1·기록 1');

  // 4. 늦은 쪽이 잘못된 값: 먼저 쪽이 성공하면 늦은 쪽은 만들지 않고 결과만 받음 / 먼저 쪽도 실패하면 원본 그대로(항목·기록 0)
  s=await some('늦은 쪽 잘못');await c1.query('begin');const r5=await move(c1,s,key(8),row('늦은 쪽 잘못'));
  p2=move(c2,s,key(9),badRow('늦은 쪽 잘못'));assert(await waiting(c2));await c1.query('commit');r2=await p2;
  assert.equal(r2.replayed,true);assert.equal(r2.same_request,false);assert.equal(r2.item_id,r5.item_id);consistent(await state(s,'늦은 쪽 잘못'),'늦은 쪽 잘못');
  s=await some('양쪽 실패');await c1.query('begin');await move(c1,s,key(10),row('양쪽 실패'));
  p2=move(c2,s,key(11),badRow('양쪽 실패')).then(()=>null,e=>e);assert(await waiting(c2));await c1.query('rollback');const e2=await p2;
  assert(e2&&/period_dates_required_or_reversed/.test(e2.message),'늦은 쪽도 실패');st=await state(s,'양쪽 실패');assert.equal(st.source,1,'원본 그대로');consistent(st,'양쪽 실패');
  ok('늦은 쪽 잘못된 값: 먼저 쪽 성공이면 결과만(만들지 않음), 양쪽 실패면 원본 그대로·항목 0·기록 0');

  // 5. 연결 8개가 한꺼번에(같은 키·다른 키): 실제로 옮긴 결과는 하나, 나머지는 모두 같은 항목을 돌려받음
  const many=[];for(let i=0;i<8;i++)many.push(await connect());
  for(const [label,keyOf] of [['동시 8개 같은 키',()=>key(20)],['동시 8개 다른 키',i=>key(30+i)]]){
   s=await some(label);const rs=await Promise.all(many.map((c,i)=>move(c,s,keyOf(i),row(label))));
   assert.equal(rs.filter(r=>!r.replayed).length,1,label+': 실제로 옮긴 요청 하나');assert.equal(new Set(rs.map(r=>r.item_id)).size,1,label+': 모두 같은 항목');
   st=await state(s,label);assert.equal(st.source,0);consistent(st,label);
  }
  ok('연결 8개 동시(같은 키·다른 키): 실제로 옮긴 요청 1, 모두 같은 항목 — 새 항목 1·기록 1');

  // 6. 실제 서버에서도 기록 표는 읽기만(가짜 기록으로 "옮겨짐" 꾸미기 불가)
  s=await some('가짜 기록');await fails(c1.query("insert into tok_someday_moves(someday_id,user_id,request_id,kind,item_id,title) values($1,$2,$3,'todo',$3,'가짜')",[s,A,key(40)]),/permission denied/,'기록 직접 넣기');
  await fails(c1.query('update tok_someday_moves set item_id=$1',[key(41)]),/permission denied/,'기록 고치기');await fails(c1.query('delete from tok_someday_moves'),/permission denied/,'기록 지우기');
  const r6=await move(c1,s,key(42),row('가짜 기록'));assert.equal(r6.replayed,false);consistent(await state(s,'가짜 기록'),'가짜 기록');
  ok('실제 서버: 기록 표 직접 넣기·고치기·지우기 거부, 함수로 옮겨야만 기록');
 }finally{
  for(const c of open)await c.end().catch(()=>{});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(e=>console.error('임시 DB 지우기 실패',e.message));await admin.end();
 }
})().catch(e=>{console.error(e);process.exit(1);});
