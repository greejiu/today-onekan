// '이미지로 공유' 회귀 검증: 지금 한칸 화면과 공유 PNG(캔버스)가 같은 항목·같은 시간 배치·같은 겹침 열을 쓰는지 비교.
// 가짜 Supabase(period-fixture)만 쓰고 운영 데이터·외부 요청은 없음. 생성한 PNG는 test-results/share-image/에 저장.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
const OUT='test-results/share-image';

// 공유 캔버스가 그린 타임라인 카드(모서리 8)·하루종일/블럭 카드(모서리 10)와 글자를 기록한다.
async function captureShare(p){
 return p.evaluate(async()=>{
  const rects=[],texts=[];const origRR=window.shareRoundRect,origFT=CanvasRenderingContext2D.prototype.fillText;
  window.shareRoundRect=function(ctx,x,y,w,h,r){if(ctx.canvas&&ctx.canvas.id==='shareCanvas'&&(r===8||r===10))rects.push({x,y,w,h,r});return origRR.apply(this,arguments);};
  CanvasRenderingContext2D.prototype.fillText=function(t,x,y){if(this.canvas&&this.canvas.id==='shareCanvas')texts.push({t:String(t),x,y});return origFT.apply(this,arguments);};
  try{await shareRender();}finally{window.shareRoundRect=origRR;CanvasRenderingContext2D.prototype.fillText=origFT;}
  // 타임라인 카드는 채우기+자르기로 같은 사각형을 두 번 그림 → 한 번만
  const seen=new Set(),cards=rects.filter(r=>{const k=[r.r,r.x,r.y,r.w,r.h].join();if(seen.has(k))return false;seen.add(k);return true;});
  const titleIn=c=>texts.filter(t=>t.x>c.x&&t.x<c.x+c.w&&t.y>c.y&&t.y<c.y+c.h).map(t=>t.t).join('');
  return {ready:shareState.ready,empty:document.getElementById('shareEmpty').hidden?null:document.getElementById('shareEmpty').textContent,
   timeline:cards.filter(c=>c.r===8).map(c=>({...c,title:titleIn(c)})),lists:cards.filter(c=>c.r===10).map(c=>({...c,title:titleIn(c)})),texts:texts.map(t=>t.t)};
 });
}
// 화면(지금 한칸 타임라인)의 시간 카드: top/height(px), 열 위치(%), 제목
async function screenTimeline(p){
 return p.evaluate(()=>[...document.querySelectorAll('#agendaTimeWrap .ag-tl-task[data-id]')].map(e=>({id:e.dataset.id,kind:e.dataset.kind,top:parseFloat(e.style.top),height:parseFloat(e.style.height),left:parseFloat(e.style.left),width:parseFloat(e.style.width.replace('calc(','')),title:e.querySelector('.ag-tl-title').textContent.trim(),done:e.classList.contains('done')})));
}
async function screenAllDay(p){
 return p.evaluate(()=>[...document.querySelectorAll('#agendaAllDayList .ag-allday-row[data-id]')].map(e=>({id:e.dataset.id,kind:e.dataset.kind,title:e.querySelector('.agenda-title').textContent.trim(),done:e.classList.contains('done')})));
}
// 화면 카드와 공유 카드를 같은 순서(위→왼쪽)로 맞춰 시간 위치·높이·열을 비교
function compareTimeline(label,screen,share){
 assert.equal(share.length,screen.length,label+': 시간 카드 수 '+JSON.stringify({screen:screen.map(s=>s.title),share:share.map(s=>s.title)}));
 if(!screen.length)return;
 const s=[...screen].sort((a,b)=>a.top-b.top||a.left-b.left),c=[...share].sort((a,b)=>a.y-b.y||a.x-b.x);
 const s0=s[0].top,c0=c[0].y,cw=Math.max(...c.map(x=>x.x+x.w))-Math.min(...c.map(x=>x.x)),cx=Math.min(...c.map(x=>x.x));
 s.forEach((it,i)=>{
  const sh=c[i],why=label+' '+it.title+' '+JSON.stringify({screen:it,share:sh});
  assert(Math.abs((sh.y-c0)-(it.top-s0))<1.5,why+' 세로 위치');
  assert(Math.abs((sh.h+1)-it.height)<1.5,why+' 높이');
  assert(Math.abs((sh.x-cx)/cw*100-it.left)<2,why+' 열 위치');
  const want=it.title.replace(/…$/,'').replace(/\s+/g,''),got=sh.title.replace(/…$/,'').replace(/\s+/g,'');
  assert(got.length&&(got.startsWith(want)||want.startsWith(got)),why+' 제목');
 });
}

(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const results=[];
 try{
 fs.mkdirSync(OUT,{recursive:true});
 for(const [vw,vh,tag] of [[1440,900,'pc'],[390,844,'m390']]){
 const p=await browser.newPage({viewport:{width:vw,height:vh},timezoneId:'Asia/Seoul',acceptDownloads:true,hasTouch:tag!=='pc'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR_FAILED/.test(m.text()))errors.push(m.text());});
 await fixture(p);
 await p.evaluate(async()=>{
  const d=n=>addDaysStr(todayStr(),n),T=(a,b,s,e)=>OnekanPeriod.patch('todo',{allDay:false,startDate:a,endDate:b,startTime:s,endTime:e}),A=(a,b)=>OnekanPeriod.patch('todo',{allDay:true,startDate:a,endDate:b||a});
  const E=(a,s,e)=>OnekanPeriod.patch('event',s?{allDay:false,startDate:a,endDate:a,startTime:s,endTime:e}:{allDay:true,startDate:a,endDate:a});
  const today=d(0),past=d(-2);
  mockRows.tok_habit_categories=[{id:'g1',name:'공부',color:'#4a90e2'}];mockRows.tok_event_categories=[{id:'c1',name:'병원',color:'#e2678a'}];
  mockRows.tok_todos=[
   {id:'t-same',user_id:'test',title:'같은 시간 할일',is_done:false,...T(today,today,'10:00','11:00')},
   {id:'t-done',user_id:'test',title:'완료한 시간 할일',is_done:true,completed_date:today,tag_id:'g1',...T(today,today,'10:30','11:30')},
   {id:'t-short',user_id:'test',title:'15분 짧은 할일',is_done:false,...T(today,today,'13:00','13:15')},
   {id:'t-long',user_id:'test',title:'아주 긴 제목의 할일입니다 포트폴리오 상세페이지 레퍼런스 스무 개 모으고 좋은 점 세 줄씩 정리하기',is_done:false,...T(today,today,'14:00','16:00')},
   {id:'t-early',user_id:'test',title:'하루 범위 밖 새벽 할일',is_done:false,...T(today,today,'04:30','05:30')},
   {id:'t-allday',user_id:'test',title:'종일 할일',is_done:false,...A(today)},
   {id:'t-allday-done',user_id:'test',title:'종일 완료 할일',is_done:true,completed_date:today,...A(today)},
   // 지난 날짜: 그날 완료(완료일 같음) / 다음날 체크(완료일 다름) / 완료일 없음 / 다른 날 일정·그날 완료 / 미완료
   {id:'p-same',user_id:'test',title:'지난날 그날 완료',is_done:true,completed_date:past,...T(past,past,'09:00','10:00')},
   {id:'p-late',user_id:'test',title:'지난날 다음날 체크',is_done:true,completed_date:d(-1),...T(past,past,'09:30','10:30')},
   {id:'p-null',user_id:'test',title:'지난날 완료일 없음',is_done:true,completed_date:null,...A(past)},
   {id:'p-other',user_id:'test',title:'다른날 일정 그날 완료',is_done:true,completed_date:past,...A(d(-5))},
   {id:'p-open',user_id:'test',title:'지난날 미완료',is_done:false,...T(past,past,'11:00','12:00')},
  ];
  mockRows.tok_events=[{id:'e-same',user_id:'test',title:'같은 시간 일정',category_id:'c1',...E(today,'10:00','11:00')},{id:'e-all',user_id:'test',title:'종일 일정',...E(today)},{id:'e-past',user_id:'test',title:'지난날 일정',...E(past,'15:00','16:00')}];
  mockRows.tok_habits=[{id:'h-same',user_id:'test',name:'같은 시간 습관',is_active:true,start_date:d(-10),repeat_unit:'day',repeat_interval:1,start_minute:600,duration_minutes:60,category_id:'g1'}];
  mockRows.tok_habit_logs=[{habit_id:'h-same',done_date:past,start_minute:600,duration_minutes:60}];
  await loadAll();
 });
 const writes0=await p.evaluate(()=>mockWrites.length);
 const openShare=async(date,view)=>{await p.evaluate(({date,view})=>{homeAgendaDate=date;renderHome();openShareSheet(date,view);},{date,view});await p.waitForFunction(()=>!/만드는 중/.test(document.getElementById('shareStatus').textContent));};
 const setOpts=async o=>{await p.evaluate(o=>{Object.assign(shareState.opts,o);},o);};
 const png=async name=>{const b=await p.evaluate(async()=>{const r=new FileReader();return await new Promise(res=>{r.onload=()=>res(r.result.split(',')[1]);r.readAsDataURL(shareState.blob);});});fs.writeFileSync(`${OUT}/${tag}-${name}.png`,Buffer.from(b,'base64'));};
 const today=await p.evaluate(()=>todayStr()),past=await p.evaluate(()=>addDaysStr(todayStr(),-2)),empty=await p.evaluate(()=>addDaysStr(todayStr(),-20)); // 매일 습관 시작(-10일) 전이라 항목 없는 날

 // 1) 오늘 타임라인: 겹침·짧은·긴 제목·범위 밖·완료/미완료·종일 — 빈 시간 숨기기 끔(화면과 같은 전체 범위)
 await p.evaluate(()=>{shareState.opts.hideEmpty=false;});
 await openShare(today,'timeline');await setOpts({hideEmpty:false});let cap=await captureShare(p);
 compareTimeline('오늘',await screenTimeline(p),cap.timeline);
 const sad=await screenAllDay(p);assert.deepEqual(cap.lists.map(c=>c.title).sort(),sad.map(s=>s.title).sort(),'오늘 종일 카드');
 // 카드 바탕색: 화면 카드의 실제 배경색 = PNG 카드 안쪽 픽셀(색 없는 할일·습관은 흰 카드, 그룹색은 옅은 색)
 for(const id of ['t-same','h-same']){
  const sc=await p.evaluate(id=>{const c=document.createElement('canvas').getContext('2d',{willReadFrequently:true});c.fillStyle=getComputedStyle(document.querySelector('#agendaTimeWrap .ag-tl-task[data-id="'+id+'"]')).backgroundColor;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data].slice(0,3);},id);
  const ss=(await screenTimeline(p)).sort((a,b)=>a.top-b.top||a.left-b.left),cc=[...cap.timeline].sort((a,b)=>a.y-b.y||a.x-b.x),card=cc[ss.findIndex(x=>x.id===id)];
  const px=await p.evaluate(({x,y,w,h})=>[...document.getElementById('shareCanvas').getContext('2d').getImageData(Math.round((x+w-5)*3),Math.round((y+h-5)*3),1,1).data].slice(0,3),card);
  assert(px.every((v,i)=>Math.abs(v-sc[i])<=3),'카드 바탕색 '+id+' 화면 '+sc+' / PNG '+px);
 }
 await png('today-timeline');results.push('오늘 타임라인 화면=PNG(위치·높이·열·제목·종일)');
 // 빈 시간 숨기기 켬: 위아래 빈 시간만 잘림(항목 상대 위치는 그대로)
 await setOpts({hideEmpty:true});cap=await captureShare(p);compareTimeline('오늘 빈시간숨김',await screenTimeline(p),cap.timeline);await png('today-timeline-hide');
 // 옵션 반영: 완료만 / 미완료만 / 일정만 / 할일만 — 각 PNG에 들어간 카드가 옵션과 일치
 const kinds=async()=>{const c=await captureShare(p);const s=[...(await screenTimeline(p)),...(await screenAllDay(p))];return c.timeline.concat(c.lists).map(x=>s.find(y=>y.title&&x.title.replace(/…$/,'').replace(/\s/g,'').startsWith(y.title.replace(/…$/,'').replace(/\s/g,'').slice(0,6)))).map(y=>y&&(y.kind==='event'?'event':y.done?'done':'open'));};
 await setOpts({done:true,undone:false,events:false});let k=await kinds();assert(k.length&&k.every(x=>x==='done'),'완료만 '+k);
 await setOpts({done:false,undone:true,events:false});k=await kinds();assert(k.length&&k.every(x=>x==='open'),'미완료만 '+k);
 await setOpts({done:false,undone:false,events:true});k=await kinds();assert(k.length&&k.every(x=>x==='event'),'일정만 '+k);await png('today-events-only');
 await setOpts({done:true,undone:true,events:true,todo:true,habit:true});results.push('옵션 변경(완료만·미완료만·일정만)이 PNG 카드에 반영');

 // 2) 지난 날짜: 화면에서 완료로 보이는 할일 + 그날 완료 기록 + 그날 일정, 미완료는 제외
 await openShare(past,'timeline');cap=await captureShare(p);
 // 카드별 제목(줄바꿈된 글자를 이어 붙임, 공백 무시)
 const cardTitles=cap.timeline.concat(cap.lists).map(c=>c.title.replace(/\s/g,'')),has=t=>cardTitles.filter(x=>x.startsWith(t.replace(/\s/g,''))).length;
 for(const t of ['지난날 그날 완료','지난날 다음날 체크','지난날 완료일 없음','다른날 일정 그날 완료','지난날 일정','같은 시간 습관'])assert.equal(has(t),1,'지난 날짜 1번 포함: '+t+' / '+cardTitles.join('|'));
 assert.equal(has('지난날 미완료'),0,'지난 날짜 미완료 제외');
 const pastScreen=(await screenTimeline(p)).filter(s=>s.kind==='event'||s.done);compareTimeline('지난 날짜(완료·일정)',pastScreen,cap.timeline);
 await png('past-timeline');results.push('지난 날짜: 완료일 같음·다름·없음·다른 날 일정 완료 포함, 미완료 제외, 중복 없음, 화면 배치와 같음');

 // 3) 시간블럭 보기
 await openShare(today,'block');cap=await captureShare(p);assert(cap.ready,'시간블럭 생성');await png('today-block');results.push('시간블럭 PNG 생성');

 // 4) 빈 날짜 → 안내·저장 비활성 / 5) 많은 항목
 await openShare(empty,'timeline');cap=await captureShare(p);assert.equal(cap.empty,'표시할 항목이 없어요');assert(await p.locator('#shareSaveBtn').isDisabled());
 await p.evaluate(async()=>{const d=addDaysStr(todayStr(),3);for(let i=0;i<28;i++)mockRows.tok_todos.push({id:'m'+i,user_id:'test',title:'많은 항목 '+i+' 제목',is_done:i%3===0,completed_date:i%3===0?todayStr():null,...OnekanPeriod.patch('todo',{allDay:false,startDate:d,endDate:d,startTime:String(6+(i%16)).padStart(2,'0')+':'+(i%2?'30':'00'),endTime:String(7+(i%16)).padStart(2,'0')+':00'})});await loadAll();});
 const many=await p.evaluate(()=>addDaysStr(todayStr(),3));await openShare(many,'timeline');cap=await captureShare(p);compareTimeline('많은 항목',await screenTimeline(p),cap.timeline);await png('many-timeline');
 results.push('빈 날짜 안내·저장 비활성, 많은 항목 화면=PNG');

 // 6) 실제 다운로드 PNG = 미리보기 캔버스(픽셀)
 await openShare(today,'timeline');
 const [dl]=await Promise.all([p.waitForEvent('download'),p.locator('#shareSaveBtn').click()]);const file=`${OUT}/${tag}-download.png`;await dl.saveAs(file);
 const buf=fs.readFileSync(file),dims=await p.evaluate(()=>[document.getElementById('shareCanvas').width,document.getElementById('shareCanvas').height]);
 assert.equal(buf.slice(1,4).toString(),'PNG');assert.deepEqual([buf.readUInt32BE(16),buf.readUInt32BE(20)],dims);
 const diff=await p.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const k=document.createElement('canvas');k.width=img.width;k.height=img.height;const x=k.getContext('2d');x.drawImage(img,0,0);const a=x.getImageData(0,0,k.width,k.height).data,c=document.getElementById('shareCanvas'),b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n;},buf.toString('base64'));
 assert.equal(diff,0,'다운로드 PNG와 미리보기 픽셀 일치');
 await p.screenshot({path:`${OUT}/${tag}-sheet.png`});
 if(tag!=='pc'){const lay=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,save:document.getElementById('shareSaveBtn').getBoundingClientRect().bottom,cw:document.getElementById('shareCanvas').getBoundingClientRect().width}));assert(lay.sw<=390&&lay.save<=844&&lay.cw<=366,JSON.stringify(lay));}
 results.push(tag+': 다운로드 PNG = 미리보기 픽셀 일치'+(tag!=='pc'?', 390px 가로 넘침 없음·저장 버튼 화면 안':''));

 assert.equal(await p.evaluate(()=>mockWrites.length),writes0,'공유 중 쓰기 없음');
 assert.deepEqual(errors,[],'페이지 오류 없음');
 await p.close();
 }
 console.log(results.map(r=>'PASS '+r).join('\n'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
