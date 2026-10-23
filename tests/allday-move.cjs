const assert=require('node:assert/strict');const {chromium}=require('playwright');const {fixture}=require('./period-fixture.cjs');
// 시간 지정 항목을 하루종일로 옮기면 실제로 종일(시간·소요시간 없음)이 되는지: 할일·일정·밤 넘김 일정·레거시 일정·습관.
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await fixture(p);
  const r=await p.evaluate(async()=>{
   const d=todayStr(),d2=addDaysStr(d,1),tm={allDay:false,startDate:d,endDate:d,startTime:'09:00',endTime:'10:00'},multi={allDay:false,startDate:d,endDate:d2,startTime:'23:00',endTime:'01:00'};
   mockRows.tok_todos=[{id:'t1',title:'시간 할일',is_done:false,...OnekanPeriod.patch('todo',tm)}];
   mockRows.tok_events=[{id:'e1',title:'시간 일정',...OnekanPeriod.patch('event',tm)},{id:'e2',title:'밤 일정',...OnekanPeriod.patch('event',multi)},{id:'e3',title:'레거시',event_date:d,event_time:'09:00',duration_minutes:30}];
   mockRows.tok_habits=[{id:'h1',name:'시간 습관',is_active:true,start_date:d,repeat_unit:'day',repeat_interval:1,...OnekanPeriod.patch('habit',tm)}];
   mockRows.tok_habit_logs=[];await loadAll();
   const out={d,d2};
   for(const [k,id] of [['todo','t1'],['event','e1'],['event','e2'],['event','e3']]){
    await moveItemToZone(k,id,{zone:'today-allday',date:d2,sourceDate:d});out[id]=OnekanPeriod.read(k,agendaItemById(k,id));}
   // 습관: 다른 날로는 옮기지 않음(습관 전체가 바뀌던 문제), 같은 날 하루종일 = 반복 범위 '전체'로 시간 해제
   const habitBefore=JSON.stringify(mockRows.tok_habits);await moveItemToZone('habit','h1',{zone:'today-allday',date:d2,sourceDate:d});out.habitOther=JSON.stringify(mockRows.tok_habits)===habitBefore;
   const same=moveItemToZone('habit','h1',{zone:'today-allday',date:d,sourceDate:d});await new Promise(r=>setTimeout(r,50));document.querySelector('#allScopeBg [data-scope=all]').click();await same;out.h1=OnekanPeriod.read('habit',agendaItemById('habit','h1'));
   out.row=agendaItemById('todo','t1');out.names=(await todayAllDayItems(d2)).map(x=>x.name);return out;});
  for(const id of ['t1','e1','e2','e3'])assert.equal(r[id].allDay,true,id+' allDay');
  for(const id of ['t1','e1','e3'])assert.equal(r[id].startDate,r.d2),assert.equal(r[id].endDate,r.d2);
  assert.equal(r.e2.endDate,r.d2.slice(0,8)+String(Number(r.d2.slice(8))+1).padStart(2,'0')); // 01:00 끝은 다음 날까지 걸침
  assert.equal(r.habitOther,true,'습관 다른 날 하루종일 = 그대로');assert.equal(r.h1.allDay,true);assert.equal(r.h1.startDate,r.d); // 같은 날이면 시간 해제, 날짜 유지
  assert.equal(r.row.todo_time,null);assert.equal(r.row.end_time,null);assert.equal(r.row.duration_minutes,null);
  for(const n of ['시간 할일','시간 일정','밤 일정','레거시'])assert(r.names.includes(n),n);
  assert.deepEqual(errors,[]);console.log('allday-move: timed→all-day for todo/event/overnight/legacy, habit same day only PASS');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
