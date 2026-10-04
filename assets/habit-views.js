/* Habit adapter: sources in collections, ephemeral occurrences and literal records in calendars.
 * No occurrence rows or exception dates are written. Record dates are not inferred scheduled dates. */
window.createOnekanHabitViews = api => {
 'use strict';
 const $=id=>document.getElementById(id),P=api.period,esc=api.escape,host=document.querySelector('[data-page="habits"].page');
 let date=api.today(),mode='list',engine,calendarCache=null,calendarRows=[],renderVersion=0;
 const busy=new Set();
 const aliases={scheduleList:'todoList',scheduleEmpty:'todoEmpty',schedMonthCount:'habitMonthCount',schedJumpRow:'habitJumpRow',schedJumpBtn:'habitJumpBtn',calMonthLabel:'habitMonthLabel',calPrevBtn:'habitPrevBtn',calNextBtn:'habitNextBtn',calGrid:'habitCalGrid'};
 const id=name=>aliases[name]||name.replace(/^schedule/,'habit');
 const month=()=>{const ms=date.slice(0,7)+'-01',next=P.addDays(ms,32).slice(0,7)+'-01';return {ms,me:P.addDays(next,-1)};};
 const source=row=>api.rows().find(h=>h.id===(row.habit_id||row.id));
 const endDate=row=>{const p=P.read('habit',row),end=p.endDate||p.startDate;return !p.allDay&&p.endTime==='00:00'&&end>p.startDate?P.addDays(end,-1):end;};
 function nextDue(h){const d=api.nextDue(h,api.today());return d&&(!h.end_date||d<=h.end_date)?d:'';}
 function paused(h,d){return api.pauses().some(p=>p.habit_id===h.id&&d>=p.paused_at&&(!p.resumed_at||d<p.resumed_at));}
 function occurrenceRows(range){
  const out=[],today=api.today();
  api.rows().forEach(h=>{
   const base=P.read('habit',h),span=base.startDate&&base.endDate?Math.max(0,P.days(base.startDate,base.endDate)):0;
   const from=P.addDays(range.start,-span),until=h.end_date&&h.end_date<range.end?h.end_date:range.end;
   const dates=h.repeat_unit?api.occurrences(h,from,until):[api.effectiveStart(h)||base.startDate].filter(Boolean);
   const records=api.logs().filter(r=>r.habit_id===h.id),skips=api.skips().filter(r=>r.habit_id===h.id);
   const identity=(type,d)=>h.id+'|'+type+'|'+d;
   dates.filter(d=>d>=from&&d<=until&&(!h.start_date||d>=h.start_date)&&!paused(h,d)&&!(d>today&&!h.is_active)).forEach(d=>{
    // An exact record replaces only the same literal date, never a guessed late-completion link.
    if(records.some(r=>r.done_date===d)||skips.some(r=>r.skip_date===d))return;
    const row={...api.periodRow(h,d),id:identity('planned',d),habit_id:h.id,title:h.name,occurrence_date:d,record_date:null,status:'open',predicted:d>today};
    row.resolved=api.resolved(h.id,d,today);row.action_date=d;row.block=null;
    if(row.resolved)row.block='이후 수행 기록이 있습니다. 회차와 수행일을 임의로 연결하지 않습니다.';
    else if(d<today&&!P.overlap('habit',row,today))row.block='지난 예정 회차입니다. 실제 수행은 오늘의 밀린 습관에서 기록하세요.';
    else row.block=api.blockReason(h,d);
    out.push(row);
   });
   records.forEach(log=>{
    const d=log.done_date;
    // Snapshots only: missing duration/end remains missing, including after a source period edit.
    const row={...h,id:identity('done',d),habit_id:h.id,title:h.name,occurrence_start_date:d,occurrence_end_date:log.occurrence_end_date||null,
     all_day:log.start_minute==null,start_minute:log.start_minute??null,duration_minutes:log.duration_minutes??null,end_time:null,
     occurrence_date:null,record_date:d,record_id:log.id||null,action_date:d,status:'done',is_done:true,block:null,predicted:false};
    if(P.overlap('habit',row,range.start)||d>=range.start&&d<=range.end||d<range.start&&endDate(row)>=range.start)out.push(row);
   });
   skips.filter(r=>r.skip_date>=range.start&&r.skip_date<=range.end).forEach(r=>out.push({...h,id:identity('skipped',r.skip_date),habit_id:h.id,title:h.name,
    occurrence_start_date:r.skip_date,occurrence_end_date:r.skip_date,all_day:true,start_minute:null,duration_minutes:null,end_time:null,
    occurrence_date:null,record_date:r.skip_date,record_id:r.id||null,action_date:r.skip_date,status:'skipped',block:null,predicted:false}));
  });
  return out;
 }
 function rows(){if(!calendarCache){calendarCache=occurrenceRows(engine.range());calendarRows=calendarCache;}return calendarCache;}
 function accept(row,state){const h=source(row);return !!h&&api.lifecycle(h,api.today())===state.lifecycle&&(state.status==='all'||row.status===state.status);}
 function note(row){return row.status==='done'?'완료 기록 · 수행일 '+row.record_date:row.status==='skipped'?'건너뜀 기록 · '+row.record_date:row.predicted?'예정 · 미래 회차':row.resolved?'예정 · 이후 수행 기록 있음 (회차 연결 미확정)':'예정 회차 · '+row.occurrence_date;}
 function check(row){
  if(row.block)return '<span class="hv-state">'+(row.resolved?'기록 참조':'예정')+'</span>';
  const action=row.status==='done'?'undone':row.status==='skipped'?'unskip':'done';
  return '<div class="hv-actions iv-check"><button type="button" '+(busy.has(row.habit_id+'|'+row.action_date)?'disabled ':'')+'data-habit-action="'+action+'" data-occurrence="'+esc(row.id)+'" aria-label="'+esc(row.title)+' '+row.action_date+' '+(action==='done'?'완료':action==='undone'?'완료 취소':'건너뛰기 취소')+'">'+(action==='done'?'✓':action==='undone'?'↶':'× 취소')+'</button>'+(row.status==='open'&&api.canSkip()?'<button type="button" data-habit-action="skip" data-occurrence="'+esc(row.id)+'" aria-label="'+esc(row.title)+' '+row.action_date+' 건너뛰기">×</button>':'')+'</div>';
 }
 async function act(row,action,opener){
  const h=source(row),key=row.habit_id+'|'+row.action_date,owner=api.user(),version=renderVersion;
  if(!owner||!h||row.block||busy.has(key))return;
  if(row.status==='open'&&api.blockReason(h,row.action_date))return;
  busy.add(key);host.querySelectorAll('[data-occurrence]').forEach(b=>{if(b.dataset.occurrence===row.id)b.disabled=true;});
  $('habitSaveStatus').textContent='저장 중…';
  try{const ok=await api.status(h.id,row.action_date,action);if(owner!==api.user())return;calendarCache=null;render();$('habitSaveStatus').textContent=ok?'상태를 저장했어요.':'저장하지 못했어요. 기존 상태를 유지합니다.';
   if(version<=renderVersion){const target=host.querySelector('[data-occurrence="'+CSS.escape(row.id)+'"]')||$('habitStatus');target.focus({preventScroll:true});}
  }finally{busy.delete(key);if(owner===api.user())host.querySelectorAll('[data-occurrence]').forEach(b=>{const r=calendarRows.find(r=>r.id===b.dataset.occurrence);if(r&&r.habit_id+'|'+r.action_date===key)b.disabled=false;});if(opener?.isConnected)opener.disabled=false;}
 }
 function wire(node){api.wireSource(node);node.querySelectorAll('.todo-row .info').forEach(info=>{const row=api.rows().find(h=>h.id===info.closest('.todo-row').dataset.id);if(!row)return;info.querySelector('.name').onclick=null;info.tabIndex=0;info.setAttribute('role','button');info.setAttribute('aria-label',row.name+' 수정');info.onclick=()=>api.edit(row.id);info.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();api.edit(row.id);}};});node.querySelectorAll('[data-habit-action]').forEach(b=>b.onclick=e=>{e.stopPropagation();const row=calendarRows.find(r=>r.id===b.dataset.occurrence);if(row)act(row,b.dataset.habitAction,b);});}
 function detail(rowId){const row=calendarRows.find(r=>r.id===rowId);api.edit(row?.habit_id||rowId);}
 function monthCalendar(view){
  const {ms,me}=month(),first=P.addDays(ms,-new Date(ms+'T12:00:00').getDay()),last=P.addDays(me,6-new Date(me+'T12:00:00').getDay()),grid=$('habitCalGrid');
  const focused=grid.contains(document.activeElement)?document.activeElement:null,focusDate=focused?.dataset.hvSelect,focusId=focused?.dataset.id;
  let html='';for(let d=first;d<=last;d=P.addDays(d,1))html+='<div class="cal-cell '+(d.slice(0,7)!==ms.slice(0,7)?'other-month ':'')+(d===date?'selected':'')+'" data-date="'+d+'"><div class="tv-date"><button type="button" data-hv-select="'+d+'" aria-pressed="'+(d===date)+'">'+Number(d.slice(8))+'</button><button type="button" data-sv-add="'+d+'" aria-label="'+d+' 습관 추가">＋</button></div>'+view.rows.filter(r=>P.overlap('habit',r,d)).map(r=>view.card(r,d,'data-event-id="'+esc(r.id)+'" data-date="'+d+'"').replace('sv-card sched-row','sv-card sched-row cal-chip')).join('')+'</div>';
  grid.innerHTML=html;view.wireCards(grid);grid.querySelectorAll('[data-hv-select]').forEach(b=>b.onclick=()=>selectDate(b.dataset.hvSelect));
  if(focused)(focusDate?grid.querySelector('[data-hv-select="'+focusDate+'"]'):focusId?grid.querySelector('.sv-open[data-id="'+CSS.escape(focusId)+'"]'):grid.querySelector('[data-hv-select="'+date+'"]'))?.focus({preventScroll:true});
  $('habitMonthLabel').textContent=ms.slice(0,7);return true;
 }
 function overdue(){
  const state=engine.state(),items=api.rows().filter(h=>api.visible(h)&&api.lifecycle(h,api.today())==='active'&&state.lifecycle==='active'&&api.overdue(h,api.today())>0&&!paused(h,api.today()));
  $('habitOverdueNotice').innerHTML=mode==='calendar'&&['all','open'].includes(state.status)?items.map(h=>'<div class="hv-overdue" data-overdue-habit="'+esc(h.id)+'"><span>'+esc(h.name)+' · '+api.overdue(h,api.today())+'일 지남 · 오늘 수행 기록</span><button type="button" data-hv-late="'+esc(h.id)+'">오늘 완료</button>'+(api.canSkip()?'<button type="button" data-hv-late-skip="'+esc(h.id)+'">오늘 건너뛰기</button>':'')+'</div>').join(''):'';
  for(const b of $('habitOverdueNotice').querySelectorAll('button'))b.onclick=()=>{const h=api.rows().find(h=>h.id===(b.dataset.hvLate||b.dataset.hvLateSkip));if(!h)return;act({habit_id:h.id,action_date:api.today(),id:h.id+'|late|'+api.today(),status:'open',block:api.blockReason(h,api.today())},b.dataset.hvLate?'done':'skip',b);};
 }
 function render(){
  calendarCache=null;renderVersion++;const state=engine.state();api.setLifecycle(state.lifecycle);
  for(const b of $('habitViewTabs').querySelectorAll('button')){b.classList.toggle('active',b.dataset.tab===mode);b.setAttribute('aria-pressed',String(b.dataset.tab===mode));}
  for(const b of $('habitsTabRow').querySelectorAll('button')){b.classList.toggle('active',b.dataset.tab===state.lifecycle);b.setAttribute('aria-pressed',String(b.dataset.tab===state.lifecycle));}
  $('habitCollection').hidden=mode==='calendar';$('habitCalendarMode').hidden=mode!=='calendar';$('todoList').hidden=mode==='board';$('habitBoard').hidden=mode!=='board';
  $('habitDateNav').hidden=mode!=='calendar';$('habitStatusWrap').hidden=mode!=='calendar';$('habitStatus').value=state.status;$('habitMonthCount').hidden=mode==='calendar';$('habitJumpRow').hidden=true;
  $('habitOccurrenceNotice').textContent=mode==='calendar'?'예정 회차는 계산한 표시입니다. 완료는 실제 수행일과 당시 저장한 시간을 표시합니다. 회차 이동은 수정창에서 원본을 확인해주세요.':'진행·보관·종료 상태별 습관 원본 목록입니다. 날짜를 바꿔도 원본이 여러 카드로 늘어나지 않습니다.';
  $('habitMonthLabel').textContent=date.slice(0,7);
  if(mode==='calendar')engine.calendar();else engine.collection();
  $('habitRangeLabel').hidden=mode!=='calendar';overdue();
 }
 function selectDate(value){date=value;engine?.remember();render();}
 const preview=document.createElement('div');preview.id='habitDragPreview';preview.className='sv-drag-preview';preview.hidden=true;preview.innerHTML='<span id="habitDragText"></span><br><button type="button" id="habitDragCancel">취소 (Esc)</button>';document.body.append(preview);
 engine=window.createOnekanItemViews({...api,kind:'habit',pageName:'habits',table:'tok_habits',title:'습관',id,defaults:{mode:'list',group:'none',lifecycle:'active',status:'all'},allowMove:false,allowResize:false,preferenceOptions:{group:['none','group','category','project']},
  date:()=>date,month,mode:()=>mode,setMode:v=>{mode=v;},restoreDate:v=>{date=/^\d{4}-\d{2}-\d{2}$/.test(v)?v:api.today();},changeMode:v=>{mode=v;render();api.sidebar();},render,selectDate,
  goMonth:n=>{const [y,m]=date.split('-').map(Number),d=new Date(y,m-1+n,1);selectDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01');},rows,accept,endDate,check,wire,detail,edit:detail,monthCalendar,
  collectionRows:state=>api.rows().filter(h=>api.matches(h)&&api.lifecycle(h,api.today())===state.lifecycle),
  sort:(a,b,state)=>state.sort==='name'?a.name.localeCompare(b.name,'ko'):(nextDue(a)||'9999').localeCompare(nextDue(b)||'9999')||a.name.localeCompare(b.name,'ko'),
  card:row=>row.habit_id?null:api.sourceCard(row).replace('<div class="block-tag">','<div class="block-tag"><span class="hv-next">다음 예정일 '+esc(nextDue(row)||'없음')+' · </span>'),
  info:row=>'<span class="hv-note">'+esc(note(row))+'</span>',
  menuAttrs:(rowId)=>{const row=calendarRows.find(r=>r.id===rowId);return api.menuAttrs(row?.habit_id||rowId,row?.action_date);},
  scrollDate:()=>{},paintRange:(a,b)=>host.querySelectorAll('.cal-cell[data-date]').forEach(el=>el.classList.toggle('cal-range',el.dataset.date>=a&&el.dataset.date<=b)),clearRange:()=>host.querySelectorAll('.cal-range').forEach(el=>el.classList.remove('cal-range')),
  focusTarget:()=>$('habitViewTabs').querySelector('[data-tab="'+mode+'"]')
 });
 $('habitStatus').onchange=e=>engine.option('status',e.target.value);
 $('habitPrevBtn').onclick=()=>engine.navigate(-1);$('habitNextBtn').onclick=()=>engine.navigate(1);$('habitTodayBtn').onclick=()=>{engine.resetRange();selectDate(api.today());};
 $('habitViewTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>engine.option('mode',b.dataset.tab));
 $('habitAddBtn').onclick=()=>api.add({startDate:date,endDate:date,allDay:true,opener:$('habitAddBtn')});
 return {...engine,render,selectDate,occurrenceRows,nextDue,addCurrent:opener=>api.add({startDate:date,endDate:date,allDay:true,opener})};
};
