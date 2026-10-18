/* 2026-10-18 3단계: 일정 화면(월·주 보드·주 타임라인·일 보기)의 기존 항목 끌어 옮기기.
 * 규칙(OnekanDragRules)과 화면 동작(createOnekanScheduleDrag)을 나눔. 지금한칸·오른쪽 목록·언젠가는 이 파일이 다루지 않음(후속).
 * - 날짜만 옮기면 시간·기간 유지(여러 날 항목도 기간 유지), 잡은 날과 놓은 날의 차이만큼 이동
 * - 시간 칸: 놓은 시각이 시작(30분 단위, 확정 설계), 소요시간 유지(타임라인 안에서 끌면 잡은 위치와의 차이를 유지해 미리보기 윗변 = 시작)
 * - 하루종일 → 시간 칸: 놓은 날 그 시각부터 30분 / 시간 → 하루종일: 시간 지정 해제 / 시간블록: 블록 시작 시각
 * - 반복: 저장 전에 이번만·이번부터 이후·전체 선택. 고른 뜻 그대로, 항목 한 건 저장으로 할 수 있는 선택만 켜고 나머지는 이유와 함께 비활성
 * - 완료·건너뜀·측정 기록은 쓰지 않음. 실패·취소·영역 밖·Esc는 원래대로. 성공 후 10초 실행 취소(그사이 바뀌었으면 덮어쓰지 않음). */
(function(root){
 'use strict';
 const STEP=30,NEW_TIMED=30; // 시간 이동 간격 30분(설계확정서), 하루종일 → 시간 칸은 30분
 const round=m=>Math.round(m/STEP)*STEP;
 // 저장할 칸만 비교(시간은 'HH:MM:SS'와 'HH:MM'을 같게 봄)
 const same=(a,b)=>(a??null)===(b??null)||typeof a==='string'&&typeof b==='string'&&a.slice(0,5)===b.slice(0,5)&&/^\d\d:\d\d/.test(a);
 const changed=(row,patch)=>Object.keys(patch).some(k=>!same(row[k],patch[k]));
 const invalid=m=>m?'이 항목의 기간 정보가 완전하지 않아요. 수정창에서 확인해 주세요. ('+m+')':'';
 // 놓은 자리(target)로 옮긴 새 저장값. from = 잡은 조각이 있던 날짜, grab = 타임라인에서 잡은 시각({date,minute}, 없으면 놓은 시각이 곧 시작)
 function plan(P,kind,row,from,target,grab){
  const base=P.read(kind,row);
  if(!base.startDate)return {error:'날짜가 없는 항목이에요.'};
  // 잡은 날이 항목 기간 밖이면(지난 할일을 오늘 줄에서 잡은 경우 등) 실제 시작일을 기준으로
  if(!P.overlap(kind,row,from))from=base.startDate;
  if(grab&&!P.overlap(kind,row,grab.date))grab=null;
  if(!base.allDay&&!base.endTime)return {error:'종료 시각이 없는 기존 항목이에요. 수정창에서 종료를 넣은 뒤 옮겨 주세요.'};
  let patch;
  if(target.type==='date'||target.type==='allday'){
   const start=P.addDays(base.startDate,P.days(from,target.date));
   patch=P.shift(kind,row,start,null,target.type==='allday'&&!base.allDay);
  }else{
   let date=target.date,minute=target.minute;
   if(grab&&!base.allDay&&target.type==='time'){
    // 타임라인 안에서 끌기: 실제 시작을 끈 만큼 옮김(이어지는 날 조각을 잡아도 같은 규칙)
    const moved=P.plus(base.startDate,base.startTime,P.days(grab.date,date)*1440+minute-grab.minute),m=round(P.minutes(moved.time));
    const fixed=P.plus(moved.date,'00:00',m);date=fixed.date;minute=P.minutes(fixed.time);
   }
   if(base.allDay){
    const s=P.time(minute),e=P.plus(date,s,NEW_TIMED);
    patch=P.patch(kind,{allDay:false,startDate:date,startTime:s,endDate:e.date,endTime:e.time});
    if(kind==='todo'&&!row.repeat_unit&&row.end_date!=null)patch.end_date=patch.occurrence_end_date;
   }else patch=P.shift(kind,row,date,minute);
  }
  const period=P.read(kind,{...row,...patch});
  return {patch,period,error:invalid(P.validate(period)),same:!changed(row,patch)};
 }
 // 습관: 원본 습관의 시간만 바꿈(회차 날짜는 그대로). 날짜가 바뀌는 이동은 아직 하지 않음(결정 D2).
 function habitPlan(P,source,from,target,grab){
  const base=P.read('habit',source),sd=base.startDate;
  if(!sd)return {error:'날짜가 없는 습관이에요.'};
  if(target.type==='date')return target.date===from?{same:true,patch:{}}:{error:'습관 회차는 다른 날로 옮길 수 없어요. 같은 날 안에서 시간만 바꿀 수 있어요.'};
  if(target.date!==from)return {error:'습관 회차는 다른 날로 옮길 수 없어요. 같은 날 안에서 시간만 바꿀 수 있어요.'};
  let patch;
  if(target.type==='allday'){if(base.allDay)return {same:true,patch:{}};patch=P.shift('habit',source,sd,null,true);}
  else{
   let minute=target.minute;
   if(grab&&!base.allDay&&target.type==='time'){const m=round(P.minutes(base.startTime)+minute-grab.minute);if(m<0||m>=1440)return {error:'습관 회차는 다른 날로 옮길 수 없어요. 같은 날 안에서 시간만 바꿀 수 있어요.'};minute=m;}
   if(base.allDay){const s=P.time(minute),e=P.plus(sd,s,NEW_TIMED);patch=P.patch('habit',{allDay:false,startDate:sd,startTime:s,endDate:e.date,endTime:e.time});}
   else patch=P.shift('habit',source,sd,minute);
  }
  const period=P.read('habit',{...source,...patch});
  return {patch,period,error:invalid(P.validate(period)),same:!changed(source,patch)};
 }
 // 반복 범위: 고른 뜻 그대로 저장할 수 있을 때만 켬(ok). 아니면 이유를 보여 주고 끔.
 //  ctx.dateChanged = 날짜가 바뀌는 이동, ctx.weekdays = 요일을 정해 둔 반복(다음 회차가 요일 설정으로 계산됨)
 //  ctx.others = {future,all}: 그 범위면 같이 옮겨야 하는 아직 안 한 다른 회차 수(반복 할일). 이번 PR은 항목 한 건 저장만 하므로
 //  다른 회차까지 바꿔야 하면 끔(여러 회차를 한 번에 저장하는 DB 기능은 후속, 결 결정 2026-10-19)
 function scopes(kind,ctx={}){
  const one={id:'one',label:'이번만'};
  if(kind==='event')return [
   {...one,reason:'반복 일정은 한 건으로 저장돼서, 이 회차만 따로 옮길 저장 칸이 아직 없어요.'},
   {id:'future',label:'이번부터 이후',reason:'반복 일정은 한 건으로 저장돼서, 그대로 저장하면 지난 회차까지 포함한 전체가 바뀌어요. 전체를 바꾸려면 \'전체\'를 골라 주세요.'},
   {id:'all',label:'전체',ok:true,note:'모든 회차를 같은 만큼 옮겨요. 반복 설정은 그대로예요.'}];
  if(kind==='todo'){
   const weekday=ctx.dateChanged&&ctx.weekdays?'요일을 정해 둔 반복은 다음 회차가 요일 설정으로 계산돼서, 날짜를 옮겨도 이후 회차에 반영되지 않아요. 수정창에서 요일을 바꿔 주세요.':'';
   const many=n=>n>0?'아직 안 한 다른 회차 '+n+'개도 같이 옮겨야 해요. 여러 회차를 한 번에 저장하는 기능이 아직 없어서 지금은 할 수 없어요.':'';
   const pick=(id,label,note)=>{const why=weekday||many(ctx.others?.[id]||0);return why?{id,label,reason:why}:{id,label,ok:true,note};};
   return [
    {...one,reason:'다음 회차가 이 회차 날짜로 계산돼서, 이 회차만 옮길 수 없어요.'},
    pick('future','이번부터 이후','이 회차를 옮기고, 다음 회차는 옮긴 날짜·시간 기준으로 생겨요. 지난 회차·완료한 회차는 그대로예요.'),
    pick('all','전체','아직 안 한 회차는 이 회차뿐이라 이 회차를 옮겨요. 다음 회차는 옮긴 날짜·시간 기준으로 생기고, 완료한 회차는 그대로예요.')];
  }
  return [
   {...one,reason:'습관은 회차별 시간을 따로 저장할 칸이 아직 없어요.'},
   {id:'future',label:'이번부터 이후',reason:'습관을 둘로 나눠야 해서 먼저 결정이 필요해요.'},
   {id:'all',label:'전체',ok:true,note:'습관 시간을 바꿔요. 완료·건너뜀 기록은 그때 시간 그대로 남아요.'}];
 }
 const WD=['일','월','화','수','목','금','토'];
 const day=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8))+'('+WD[new Date(d+'T12:00:00').getDay()]+')';
 function describe(p){
  if(p.allDay)return day(p.startDate)+(p.endDate&&p.endDate!==p.startDate?' ~ '+day(p.endDate):'')+' 종일';
  return day(p.startDate)+' '+p.startTime+(p.endDate&&p.endDate!==p.startDate?' ~ '+day(p.endDate)+' ':'~')+p.endTime;
 }
 root.OnekanDragRules={plan,habitPlan,scopes,describe,changed};

 root.createOnekanScheduleDrag=api=>{
  const P=api.period,esc=api.escape,host=api.host,doc=document;
  const LONG_PRESS=300,MOUSE_SLOP=6,TOUCH_SLOP=8,EDGE=44;
  const DRAGGABLE='#allCalGrid .cal-chip[data-id], #allWeekBoard [data-awb-id], #allTimeDays [data-event-id], #allHomeDay .ag-tl-task[data-id], #allHomeDay .plan-row[data-id]';
  const IGNORE='input,textarea,select,.item-more,.habit-skip-mark,[data-sv-resize],.cal-end-handle,.inline-add-wrap,.add-slot,.ag-habit-check,.ag-todo-check,.iv-check';
  const saving=new Set();
  let press=null,drag=null,suppressUntil=0,frame=0;
  const label=doc.createElement('div');label.id='allMoveLabel';label.className='sd-label';label.hidden=true;label.innerHTML='<div class="sd-ghost-card" aria-hidden="true"></div><div class="sd-ghost-text"></div>';doc.body.append(label);
  const status=m=>api.status(m);
  const keyOf=(kind,id)=>kind+'|'+id;
  // 화면 조각 → 항목(일정 화면의 통합 행). 주 보드·월·주 타임라인은 통합 id, 일 보기는 지금한칸 줄(종류+원본 id)
  function rowOf(el){
   const wrapped=el.dataset.awbId||el.dataset.eventId||(String(el.dataset.id||'').includes('|')?el.dataset.id:'');
   if(wrapped)return api.lookup(wrapped);
   const kind=el.dataset.kind,id=el.dataset.id,date=el.dataset.occurrence||el.dataset.menuDate||'';
   return api.find(kind,id,date);
  }
  function fromDate(el){return el.dataset.awbDate||el.dataset.date||el.closest('[data-date]')?.dataset.date||api.dayDate();}
  function sourceOf(r){return r.kind==='habit'?api.habitSource(r.source_id):r;}
  function axisMinute(content,y){
   const min=Number(content.dataset.minM),max=Number(content.dataset.maxM),scale=Number(content.dataset.timeScale)||0.6,top=content.getBoundingClientRect().top;
   return Math.max(0,Math.min(Math.min(max,1440)-STEP,min+round((y-top)/scale)));
  }
  // 놓을 수 있는 자리. 오른쪽 목록(날짜별·언젠가)과 화면 밖은 자리 없음
  function targetAt(x,y){
   const el=doc.elementFromPoint(x,y);if(!el||!host.contains(el)||el.closest('.sa-panel,#allSideAgenda'))return null;
   const cell=el.closest('#allCalGrid .cal-cell[data-date]');if(cell)return {type:'date',date:cell.dataset.date,box:cell};
   const col=el.closest('#allWeekBoard [data-awb-col]');if(col)return {type:'date',date:col.dataset.awbCol,box:col.querySelector('.awb-body')||col,zone:col};
   const card=el.closest('#allHomeDay .ag-block-card[data-block-start]');if(card)return {type:'block',date:card.dataset.date||api.dayDate(),minute:Number(card.dataset.blockStart),box:card,name:api.blockName(Number(card.dataset.blockStart))};
   const content=el.closest('.ag-tl-content[data-min-m]')||el.closest('.ag-tl-grid')?.querySelector('.ag-tl-content[data-min-m]');
   if(content&&(content.closest('#allTimeDays')||content.closest('#allHomeDay')))return {type:'time',date:content.dataset.timeDate||content.dataset.date,minute:axisMinute(content,y),box:content};
   const all=el.closest('#allTimeDays [data-all-date]');if(all)return {type:'allday',date:all.dataset.allDate,box:all.querySelector('.agenda-flat')||all,zone:all};
   const homeAll=el.closest('#allHomeDay .ag-allday-col[data-date]');if(homeAll)return {type:'allday',date:homeAll.dataset.date,box:homeAll.querySelector('.agenda-flat')||homeAll,zone:homeAll};
   const blockAll=el.closest('#allHomeDay #homeTodayBlockAllDay, #allHomeDay #agendaAllDayZone');if(blockAll)return {type:'allday',date:api.dayDate(),box:blockAll.querySelector('.agenda-flat')||blockAll,zone:blockAll};
   return null;
  }
  // 이 항목을 이 자리로 옮기면 무엇이 저장되는지(막힌 이유 포함)
  function evaluate(d,t){
   if(!t)return {error:'달력 밖이에요. 놓으면 옮기지 않아요.',outside:true};
   const r=d.row;
   if(r.kind==='habit'){
    if(r.status==='done'||r.status==='skipped'||r.record_date)return {error:'완료·건너뜀 기록은 옮기지 않아요.'};
    const s=sourceOf(r);if(!s)return {error:'습관을 찾지 못했어요.'};
    return OnekanDragRules.habitPlan(P,s,d.from,t,d.grab);
   }
   if(r.kind==='todo'&&r.repeat_unit&&r.is_done)return {error:'완료한 반복 회차는 기록이라 옮기지 않아요.'};
   return OnekanDragRules.plan(P,r.kind,r,d.from,t,d.grab);
  }
  function previewText(d,res){
   const title=d.row.title||'';
   if(res.error)return title+' · '+res.error+' (Esc 취소)';
   if(res.same)return title+' · 제자리예요';
   return title+' → '+OnekanDragRules.describe(res.period)+(d.target?.type==='block'&&d.target.name?' · '+d.target.name:'')+' · Esc 취소';
  }
  function clearPreview(){
   host.querySelectorAll('.sd-slot').forEach(n=>n.remove());host.querySelectorAll('.sd-drop').forEach(n=>n.classList.remove('sd-drop','sd-blocked'));
  }
  // 미리보기는 레이아웃을 밀지 않게: 도착 칸 = 점선 테두리, 타임라인 = 그 시각 위에 겹친 반투명 칸,
  // 그 밖(날짜 칸·하루종일·시간블록) = 포인터를 따라가는 반투명 항목 + 적용될 날짜·시간(놓을 자리가 흔들리지 않음)
  function paint(d){
   clearPreview();const t=d.target,res=d.result;let card=true;
   if(t){
    (t.zone||t.box).classList.add('sd-drop');if(res.error)(t.zone||t.box).classList.add('sd-blocked');
    if(!res.error&&!res.same&&t.type==='time'){
     // 이 열(날짜)에 걸치는 구간만 그림. 시작이 전날이면 0시부터, 끝이 다음 날이면 24시까지
     const box=t.box,boxDate=box.dataset.timeDate||box.dataset.date,min=Number(box.dataset.minM),scale=Number(box.dataset.timeScale)||0.6,p=res.period;
     const s=p.startDate===boxDate?P.minutes(p.startTime):p.startDate<boxDate?0:null,e=p.endDate===boxDate?P.minutes(p.endTime):1440;
     if(s!=null){const slot=doc.createElement('div');slot.className='sd-slot';slot.style.top=Math.max(0,(s-min)*scale)+'px';slot.style.height=Math.max(18,(e-s)*scale)+'px';
      slot.innerHTML='<strong>'+esc(d.row.title||'')+'</strong><span>'+esc(OnekanDragRules.describe(p))+'</span>';box.append(slot);card=false;}
    }
   }
   label.hidden=false;label.classList.toggle('sd-blocked',!!res.error);
   label.querySelector('.sd-ghost-card').hidden=!card;label.querySelector('.sd-ghost-text').textContent=previewText(d,res);
   label.style.left=Math.max(8,Math.min(d.x+14,innerWidth-label.offsetWidth-8))+'px';label.style.top=Math.max(8,Math.min(d.y+14,innerHeight-label.offsetHeight-8))+'px';
  }
  function update(x,y){
   const d=drag;d.x=x;d.y=y;const t=targetAt(x,y),k=t?[t.type,t.date,t.minute].join('|'):'out';
   if(k!==d.key){d.key=k;d.target=t;d.result=evaluate(d,t);}
   paint(d);
  }
  function pieces(r){return [...host.querySelectorAll(DRAGGABLE)].filter(el=>{const x=rowOf(el);return x&&x.id===r.id;});}
  function begin(){
   const p=press,r=rowOf(p.el);press=null;if(!r)return;
   if(saving.has(keyOf(r.kind,r.source_id))){status('저장 중이에요. 끝난 뒤 다시 옮겨 주세요.');return;}
   const content=p.el.closest('.ag-tl-content[data-min-m]');
   const grab=content&&p.el.classList.contains('ag-tl-task')?{date:content.dataset.timeDate||content.dataset.date,minute:axisMinute(content,p.y)}:null;
   drag={el:p.el,row:r,from:fromDate(p.el),grab,pointer:p.pointer,x:p.x,y:p.y,key:null,target:null,result:null,sources:pieces(r)};
   const clone=p.el.cloneNode(true),cardBox=label.querySelector('.sd-ghost-card');clone.classList.remove('dragging','sv-dragging','sd-armed','sd-source');clone.classList.add('sd-preview');clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
   clone.querySelectorAll('input,button').forEach(n=>{n.tabIndex=-1;n.disabled=true;});['position','top','left','width','height','visibility'].forEach(k=>clone.style.removeProperty(k));cardBox.replaceChildren(clone);cardBox.style.width=Math.max(120,Math.min(260,p.el.getBoundingClientRect().width))+'px';
   drag.sources.forEach(n=>n.classList.add('sd-source'));host.classList.add('sd-dragging');
   if(p.el.dataset)p.el.dataset.sdMoved='1';
  }
  function stop(){
   cancelAnimationFrame(frame);frame=0;clearPreview();label.hidden=true;label.querySelector('.sd-ghost-card').replaceChildren();host.classList.remove('sd-dragging');
   drag?.sources.forEach(n=>n.classList.remove('sd-source'));const d=drag;drag=null;return d;
  }
  function cancel(message){if(press){clearTimeout(press.timer);press=null;}if(!drag)return;stop();suppressUntil=performance.now()+400;if(message)status(message);}
  // 가장자리 자동 스크롤(창 세로, 주 보드·타임라인 가로·세로)
  function edgeScroll(){
   frame=0;if(!drag)return;const {x,y}=drag;let moved=false;
   const vy=y<EDGE?-12:y>innerHeight-EDGE?12:0;if(vy){const before=scrollY;scrollBy(0,vy);moved=moved||scrollY!==before;}
   const SCROLLERS='.awb-scroll,#allTimeScroll,#homeTimelineScroll',box=doc.elementFromPoint(x,y)?.closest(SCROLLERS)||drag.el.closest(SCROLLERS); // 손가락이 상자 밖(화면 끝)으로 나가도 처음 상자를 넘김
   if(box){const r=box.getBoundingClientRect(),vx=x<r.left+EDGE?-14:x>r.right-EDGE?14:0,v2=y<r.top+EDGE?-12:y>r.bottom-EDGE?12:0;const bx=box.scrollLeft,by=box.scrollTop;if(vx)box.scrollLeft+=vx;if(v2)box.scrollTop+=v2;moved=moved||bx!==box.scrollLeft||by!==box.scrollTop;}
   if(moved){drag.key=null;update(x,y);}if(vy||moved)frame=requestAnimationFrame(edgeScroll);
  }
  function down(e){
   if(api.page()!=='all'||e.button!==0||press||drag)return;
   let el=e.target.closest?.(DRAGGABLE);
   // 모바일 월 칸의 막대는 누르기를 칸이 받으므로(칸 탭 = 날짜 선택) 누른 자리 아래 막대를 찾아 끌기만 시작
   if(!el){const cell=e.target.closest?.('#allCalGrid .cal-cell');if(cell)el=[...cell.querySelectorAll('.cal-chip[data-id]')].find(c=>{const r=c.getBoundingClientRect();return e.clientX>=r.left-2&&e.clientX<=r.right+2&&e.clientY>=r.top-3&&e.clientY<=r.bottom+3;});}
   if(!el||!host.contains(el)||e.target.closest(IGNORE))return;
   const touch=e.pointerType==='touch';
   press={el,pointer:e.pointerId,x:e.clientX,y:e.clientY,touch,armed:!touch,timer:0};
   if(touch)press.timer=setTimeout(()=>{if(!press)return;press.armed=true;press.el.classList.add('sd-armed');navigator.vibrate?.(15);},LONG_PRESS);
  }
  function move(e){
   if(drag){if(e.pointerId!==drag.pointer)return;e.preventDefault();update(e.clientX,e.clientY);if(!frame)frame=requestAnimationFrame(edgeScroll);return;}
   if(!press||e.pointerId!==press.pointer)return;
   const dist=Math.hypot(e.clientX-press.x,e.clientY-press.y);
   if(!press.armed){if(dist>TOUCH_SLOP){clearTimeout(press.timer);press=null;}return;} // 길게 누르기 전에 움직이면 스크롤
   if(dist<(press.touch?TOUCH_SLOP:MOUSE_SLOP))return;
   if(press.el.dataset.edgeAtStart){press=null;return;} // 일 보기 타임라인 끝부분 = 길이 조절(지금한칸 규칙 그대로)
   press.el.classList.remove('sd-armed');begin();if(!drag)return;e.preventDefault();update(e.clientX,e.clientY);
  }
  function up(e){
   if(press&&e.pointerId===press.pointer){clearTimeout(press.timer);press.el.classList.remove('sd-armed');press=null;return;}
   if(!drag||e.pointerId!==drag.pointer)return;
   update(e.clientX,e.clientY);const d=stop();suppressUntil=performance.now()+450;commit(d);
  }
  doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointermove',move,{capture:true,passive:false});doc.addEventListener('pointerup',up,true);
  doc.addEventListener('pointercancel',e=>{if(press&&e.pointerId===press.pointer){clearTimeout(press.timer);press.el.classList.remove('sd-armed');press=null;}if(drag&&e.pointerId===drag.pointer)cancel('옮기지 않았어요.');},true);
  doc.addEventListener('touchmove',e=>{if((drag||press?.armed)&&e.cancelable)e.preventDefault();},{passive:false});
  // 길게 누른 뒤(끌 준비)에는 휴대폰 길게 누르기 메뉴가 끌기를 끊지 않게 막음(메뉴는 ⋯ 버튼으로)
  doc.addEventListener('contextmenu',e=>{if(drag||press?.armed&&press.touch){e.preventDefault();e.stopPropagation();}},true);
  doc.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(drag){e.preventDefault();e.stopImmediatePropagation();cancel('옮기지 않았어요.');}else if(press)cancel();},true); // 끄는 중의 Esc만 가로챔(다른 창 닫기는 그대로)
  doc.addEventListener('click',e=>{if(performance.now()<suppressUntil&&e.target.closest?.('#allCalGrid,#allWeekBoard,#allTimeDays,#allHomeDay')){/* 끌기 직후 달력 안 클릭(상세·이름 수정)만 한 번 무시 */e.preventDefault();e.stopImmediatePropagation();suppressUntil=0;}},true);
  addEventListener('blur',()=>cancel());addEventListener('resize',()=>cancel());

  // ── 반복 범위 선택 창 ──
  const bg=doc.createElement('div');bg.id='allScopeBg';bg.className='sheet-bg confirm-bg sd-scope-bg';
  bg.innerHTML='<div class="sheet confirm-sheet sd-scope" role="dialog" aria-modal="true" aria-labelledby="allScopeTitle" aria-describedby="allScopeMsg"><h2 id="allScopeTitle">반복 항목 옮기기</h2><p id="allScopeMsg"></p><div class="sd-scope-list" role="group" aria-label="적용 범위"></div><div class="sheet-actions"><button type="button" class="btn-ghost" data-scope-cancel>취소</button></div></div>';
  doc.body.append(bg);
  let scopeDone=null;
  function chooseScope(kind,row,res,ctx){
   return new Promise(resolve=>{
    const prev=doc.activeElement;scopeDone=v=>{scopeDone=null;bg.classList.remove('open');if(prev?.isConnected&&prev.getClientRects().length)prev.focus({preventScroll:true});resolve(v);};
    bg.querySelector('#allScopeMsg').textContent='\''+(row.title||'')+'\'을(를) '+OnekanDragRules.describe(res.period)+'(으)로 옮겨요. 어디까지 적용할까요?';
    const list=bg.querySelector('.sd-scope-list');
    list.innerHTML=OnekanDragRules.scopes(kind,ctx).map(s=>'<button type="button" class="sd-scope-opt" data-scope="'+s.id+'"'+(s.ok?'':' disabled aria-disabled="true"')+' aria-describedby="allScopeNote-'+s.id+'"><strong>'+esc(s.label)+'</strong><span id="allScopeNote-'+s.id+'">'+esc(s.ok?s.note:'지금은 안 돼요 · '+s.reason)+'</span></button>').join('');
    list.querySelectorAll('[data-scope]:not([disabled])').forEach(b=>b.onclick=()=>scopeDone(b.dataset.scope));
    bg.classList.add('open');(list.querySelector('[data-scope]:not([disabled])')||bg.querySelector('[data-scope-cancel]')).focus({preventScroll:true});
   });
  }
  bg.querySelector('[data-scope-cancel]').onclick=()=>scopeDone?.(null);
  // 꺼진 범위를 눌러 초점이 창 밖으로 나가도 Esc = 취소(창 안 초점일 때는 아래 keydown이 먼저 처리)
  doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&scopeDone){e.preventDefault();e.stopImmediatePropagation();scopeDone(null);}},true);
  bg.addEventListener('click',e=>{if(e.target===bg)scopeDone?.(null);});
  bg.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();scopeDone?.(null);return;}
   if(e.key==='Tab'){const f=[...bg.querySelectorAll('button:not([disabled])')];const i=f.indexOf(doc.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus();}}});

  // ── 저장 · 실행 취소 ──
  const table=kind=>kind==='event'?'tok_events':kind==='todo'?'tok_todos':'tok_habits';
  // 반복 할일에서 그 범위면 같이 옮겨야 하는 아직 안 한 다른 회차 수('이번부터 이후' = 이 회차보다 뒤, '전체' = 모두)
  function otherOpen(r,scope){
   const chain=r.repeat_chain_id||r.source_id,start=P.read('todo',r).startDate;
   return api.todos().filter(t=>t.id!==r.source_id&&!t.is_done&&t.repeat_unit&&(t.repeat_chain_id||t.id)===chain&&(scope==='all'||(P.read('todo',t).startDate||'')>=start)).length;
  }
  // 조건부 저장: 지금 값이 from과 같을 때만 to로 바꿈(그사이 다른 곳에서 바뀌었으면 맞는 행이 없어 false). 옮기기·되돌리기 공용. 한 번에 한 항목만
  async function apply(w,owner,from,to){
   let q=api.sb.from(table(w.kind)).update(to).eq('id',w.id).eq('user_id',owner);
   for(const [k,v] of Object.entries(from))q=v==null?q.is(k,null):q.eq(k,v);
   const res=await q.select('id');if(res.error)throw Error(res.error.message);return !!res.data?.length;
  }
  async function commit(d){
   const t=d.target,res=d.result,r=d.row;
   if(!t){status('달력 밖에 놓아서 옮기지 않았어요.');return;}
   if(res.error){status(res.error);api.render();return;}
   if(res.same)return;
   const key=keyOf(r.kind,r.source_id);if(saving.has(key)){status('저장 중이에요. 끝난 뒤 다시 옮겨 주세요.');return;}
   const source=sourceOf(r),repeat=!!source?.repeat_unit;
   saving.add(key); // 범위 선택 중에도 같은 항목 중복 변경 막기
   try{
    let scope='single';
    if(repeat){
     const ctx={dateChanged:P.read(r.kind,r).startDate!==res.period.startDate,weekdays:!!source.repeat_days?.length,others:r.kind==='todo'?{future:otherOpen(r,'future'),all:otherOpen(r,'all')}:{}};
     scope=await chooseScope(r.kind,r,res,ctx);
     // 취소했거나, 지원하지 않는 범위면(창에서 꺼져 있어 고를 수 없지만 한 번 더 확인) 아무것도 저장하지 않음
     if(!scope||!OnekanDragRules.scopes(r.kind,ctx).find(x=>x.id===scope)?.ok){status('옮기지 않았어요. 원래대로 두었어요.');api.render();return;}
    }
    // 저장은 항상 이 항목 한 건(요청 한 번). 그사이 다른 곳에서 바뀌었으면 덮어쓰지 않음
    const w={kind:r.kind,id:r.source_id,patch:res.patch,before:Object.fromEntries(Object.keys(res.patch).map(k=>[k,source[k]??null]))};
    const owner=api.user();status('저장 중…');host.setAttribute('aria-busy','true');d.sources.forEach(n=>n.classList.add('sd-saving'));
    let saved;try{saved=await apply(w,owner,w.before,w.patch);}catch(error){if(owner===api.user()){api.render();status('저장하지 못했어요. 원래 상태를 유지합니다. '+error.message);}return;}
    if(owner!==api.user())return;
    if(!saved){await api.reload();status('그사이 다른 곳에서 바뀌어서 옮기지 않았어요. 바뀐 내용을 확인해 주세요.');return;}
    await api.reload();
    const message=(r.title||'항목')+' → '+OnekanDragRules.describe(res.period);status('옮겼어요: '+message);
    api.toast('옮겼어요',{label:'실행 취소',run:()=>undo(w,owner,key)},10000); // 알림은 짧게(모바일 폭), 자세한 내용은 상태 줄
   }finally{saving.delete(key);host.removeAttribute('aria-busy');}
  }
  // 실행 취소: 이번에 쓴 값 그대로일 때만 원래 값으로(그사이 바뀌었으면 덮어쓰지 않음)
  async function undo(w,owner,key){
   if(owner!==api.user())return;
   if(saving.has(key)){api.toast('저장 중이라 되돌리지 않았어요.');return;}
   saving.add(key);let ok=false,failed='';
   try{ok=await apply(w,owner,w.patch,w.before);}catch(error){failed=error.message;}finally{saving.delete(key);}
   if(owner!==api.user())return;
   await api.reload();
   const m=failed?'되돌리지 못했어요. 옮긴 상태 그대로예요. '+failed:ok?'원래대로 되돌렸어요.':'그사이 바뀐 내용이 있어 덮어쓰지 않았어요. 옮긴 상태 그대로예요.';status(m);api.toast(m);
  }
  return {cancel,busy:()=>!!drag||saving.size>0,targetAt,chooseScope};
 };
})(typeof window==='undefined'?globalThis:window);
