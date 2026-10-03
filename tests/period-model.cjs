const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const code=html.match(/<script>\s*([\s\S]*?\}\)\(typeof window==='undefined'\?globalThis:window\);)/)[1];
const sandbox={module:{exports:{}}};vm.runInNewContext(code,sandbox);const P=sandbox.module.exports;
const plain=o=>JSON.parse(JSON.stringify(o));
for(const tz of ['Asia/Seoul','America/New_York']) {
 process.env.TZ=tz;
 assert.equal(P.days('2026-03-07','2026-03-09'),2);assert.equal(P.addDays('2026-10-03',1),'2026-10-04');
 for(const kind of ['event','todo','habit']) {
  const direct=P.defaults(null,'2026-10-03');assert.equal(direct.allDay,true);assert.equal(direct.endDate,direct.startDate);
  assert.equal(P.defaults({startDate:'2026-10-04',endDate:'2026-10-08'},'2026-10-03').allDay,true);
  const p=P.defaults({startDate:'2026-10-03',time:'23:45',durationMinutes:90},'2026-10-03');
  assert.equal(p.endDate,'2026-10-04');assert.equal(p.endTime,'01:15');assert.equal(P.duration(p),90);
  const row=P.patch(kind,p);if(kind==='habit')row.start_date=p.startDate;
  assert.deepEqual(plain(P.read(kind,row)),plain(p));
  assert.equal(P.clip(kind,row,'2026-10-03').duration_minutes,15);assert.equal(P.clip(kind,row,'2026-10-04').duration_minutes,75);
  const shift=P.shift(kind,row,'2026-10-09');assert.equal(shift[kind==='event'?'end_date':'occurrence_end_date'],'2026-10-10');
  const allDay=P.patch(kind,{...p,allDay:true});assert.equal(allDay.end_time,null);assert.equal(allDay.duration_minutes,null);
  assert.equal(allDay[kind==='habit'?'start_minute':kind==='event'?'event_time':'todo_time'],null);
  assert.equal(P.overlap(kind,allDay,'2026-10-04'),true);assert.equal(P.overlap(kind,allDay,'2026-10-05'),false);
 }
}
assert(P.validate({allDay:false,startDate:'2026-10-03',endDate:'2026-10-03',startTime:'23:00',endTime:'01:00'}));
assert(P.validate({allDay:false,startDate:'2026-10-03',endDate:'2026-10-04',startTime:'23:00',endTime:''}));
assert(P.validate({allDay:true,startDate:'2026-10-04',endDate:'2026-10-03'}));
assert.equal(P.validate({allDay:true,startDate:'',endDate:''},true),'');
const legacy={event_date:'2026-10-03',event_time:'23:00',end_date:'2026-10-06',duration_minutes:null};
assert.equal(P.read('event',legacy).endDate,'2026-10-06');assert.equal(P.read('event',legacy).endTime,'');
assert.equal('duration_minutes' in P.shift('event',legacy,'2026-10-08'),false);
assert.equal(P.shift('event',legacy,'2026-10-08').end_date,'2026-10-11');
assert.equal(P.read('todo',{start_date:null,todo_time:null}).startDate,'');
assert.equal(P.patch('todo',P.defaults({startDate:'2026-10-03',startTime:'09:00:00',endTime:'10:00:00'},'2026-10-03')).todo_time,'09:00:00');
assert.equal(P.read('habit',{start_date:'2026-10-03',end_date:'2026-10-31',start_minute:1380,duration_minutes:120}).endDate,'2026-10-04');
assert.equal(P.read('todo',{start_date:'2026-10-03',end_date:'2026-10-31',todo_time:'23:00',duration_minutes:120,repeat_unit:'day'}).endDate,'2026-10-04');
console.log('period model: defaults / validation / civil dates + DST / clips / legacy / shift / all-day PASS');
module.exports=P;
