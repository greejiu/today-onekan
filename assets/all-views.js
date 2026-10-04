/* Integrated display only. Native kinds, IDs, occurrence dates and tables remain intact. */
window.createOnekanAllViews = api => {
 'use strict';
 const $=id=>document.getElementById(id),P=api.period,esc=api.escape,host=document.querySelector('.page[data-page="all"]');
 const types=[{id:'event',name:'일정'},{id:'todo',name:'할일'},{id:'habit',name:'습관'}],busy=new Set();
 let date=api.today(),mode='calendar',engine,cache=null;
 const aliases={scheduleList:'allList',scheduleEmpty:'allEmpty',schedMonthCount:'allMonthCount',schedJumpRow:'allJumpRow',schedJumpBtn:'allJumpBtn',calMonthLabel:'allMonthLabel',calPrevBtn:'allPrevBtn',calNextBtn:'allNextBtn',calGrid:'allCalGrid'};
 const id=n=>aliases[n]||n.replace(/^schedule/,'all');
 const month=()=>{const ms=date.slice(0,7)+'-01';return {ms,me:P.addDays(P.addDays(ms,32).slice(0,7)+'-01',-1)};};
 const typeName=k=>types.find(t=>t.id===k).name;
 const wrap=(kind,row)=>({...row,period:P.read(kind,row),kind,source_id:kind==='habit'?row.habit_id:row.id,display_id:kind+'|'+row.id,id:kind+'|'+row.id});
 const owned=r=>!r.user_id||r.user_id===api.user();
 function rows(){return cache||(cache=[...api.events().filter(owned).map(r=>wrap('event',r)),...api.todos().filter(owned).map(r=>wrap('todo',r)),...api.habits().occurrenceRows(engine.range()).filter(owned).map(r=>wrap('habit',r))]);}
 const lookup=value=>rows().find(r=>r.id===value);
 const endDate=r=>{const p=P.read(r.kind,r),end=p.endDate||p.startDate;return !p.allDay&&p.endTime==='00:00'&&end>p.startDate?P.addDays(end,-1):end;};
 const groupId=r=>{const g=r.kind==='event'?r.category_id:r.group_id;return g?r.kind+'|'+g:null;};
 const categoryId=r=>r.kind==='event'?r.shared_category_id:r.kind==='todo'?r.tag_id:r.category_id;
 const groups=()=>api.groups().filter(owned).map(g=>({...g,id:g.kind+'|'+g.id,name:typeName(g.kind)+' · '+g.name}));
 const accept=(r,s)=>s['show_'+r.kind]&&(r.kind==='todo'?(s.completion==='all'||(s.completion==='done')===!!r.is_done):r.kind==='habit'?(s.status==='all'||r.status===s.status):true);
 function check(r){if(r.kind==='event')return '';if(r.kind==='habit')return api.habits().check(r);return '<input class="iv-check" type="checkbox" data-all-todo-check="'+esc(r.id)+'" '+(r.is_done?'checked':'')+' aria-label="'+esc(r.title)+' 완료">';}
 async function action(row,opener,fn){
  const owner=api.user(),key=owner+'|'+row.kind+'|'+row.source_id+(row.kind==='habit'?'|'+row.action_date:'');
  if(!owner||!owned(row)||busy.has(key))return;busy.add(key);opener.disabled=true;$('allSaveStatus').textContent='저장 중…';
  try{const ok=await fn();if(owner!==api.user())return;api.refresh();render();$('allSaveStatus').textContent=ok===false?'저장하지 못했어요. 기존 상태를 유지합니다.':'상태를 저장했어요.';
   const target=[...host.querySelectorAll('[data-occurrence],[data-all-todo-check]')].find(b=>(b.dataset.occurrence||b.dataset.allTodoCheck)===row.id&&b.getClientRects().length)||$('allTodoStatus');target.focus({preventScroll:true});
  }catch(error){if(owner===api.user()){render();$('allSaveStatus').textContent='저장하지 못했어요. '+error.message;}}
  finally{busy.delete(key);if(opener.isConnected)opener.disabled=false;}
 }
 function wire(node){
  node.querySelectorAll('[data-all-todo-check]').forEach(b=>{b.onclick=e=>e.stopPropagation();b.onchange=()=>{const r=lookup(b.dataset.allTodoCheck),checked=b.checked;if(r)action(r,b,async()=>{await api.done(r.source_id,checked);return api.todos().find(t=>t.id===r.source_id)?.is_done===checked;});};});
  node.querySelectorAll('[data-habit-action]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=lookup(b.dataset.occurrence);if(r)action(r,b,()=>api.habits().perform(r,b.dataset.habitAction));});
 }
 function add(context){engine.cancel();const owner=api.user();api.choose(context,kind=>{if(api.page()==='all'&&owner===api.user())api.add(kind,context);});}
 function selectDate(value){date=value;engine.remember();render();}
 function sidebarTypes(){
  const existing=$('allSidebarTypes');if(existing)existing.hidden=api.page()!=='all';if(api.page()!=='all')return;const nav=$('dedicatedSidebarNav');if(!nav)return;
  let box=$('allSidebarTypes');if(!box){box=document.createElement('div');box.id='allSidebarTypes';nav.append(box);}
  box.hidden=false;const focus=box.contains(document.activeElement)?document.activeElement?.dataset.allType:null,state=engine.state();box.innerHTML='<hr class="sidebar-divider">'+types.map(t=>'<button type="button" class="navitem all-type-eye" data-all-type="'+t.id+'" aria-pressed="'+state['show_'+t.id]+'" aria-label="'+t.name+' '+(state['show_'+t.id]?'숨기기':'표시')+'"><span>'+t.name+'</span><span aria-hidden="true">'+OnekanCalendarUI.eye(state['show_'+t.id])+'</span></button>').join('');
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>engine.option('show_'+b.dataset.allType,!engine.state()['show_'+b.dataset.allType]));if(focus)box.querySelector('[data-all-type="'+focus+'"]')?.focus({preventScroll:true});
 }
 function render(){
  if(!engine)return;cache=null;const state=engine.state();
  for(const b of $('allViewTabs').querySelectorAll('button[data-tab]')){b.classList.toggle('active',b.dataset.tab===mode);b.setAttribute('aria-pressed',String(b.dataset.tab===mode));}
  $('allCollection').hidden=mode==='calendar';$('allCalendarMode').hidden=mode!=='calendar';$('allList').hidden=mode==='board';$('allBoard').hidden=mode!=='board';$('allUndatedWrap').hidden=mode==='calendar';$('allUndated').checked=state.undated;$('allTodoStatus').value=state.completion;$('allHabitStatus').value=state.status;
  $('allMonthCount').hidden=mode==='calendar';$('allJumpRow').hidden=mode==='calendar';$('allMonthLabel').textContent=state.span==='month'?Number(date.slice(0,4))+'년 '+Number(date.slice(5,7))+'월':engine.range().start+' ~ '+engine.range().end;
  const focus=$('allTypes').contains(document.activeElement)?document.activeElement?.dataset.allType:null;
  $('allTypes').innerHTML=types.map(t=>'<button type="button" data-all-type="'+t.id+'" aria-pressed="'+state['show_'+t.id]+'" class="'+(state['show_'+t.id]?'active':'')+'">'+t.name+' '+OnekanCalendarUI.eye(state['show_'+t.id])+'</button>').join('');
  $('allTypes').querySelectorAll('button').forEach(b=>b.onclick=()=>engine.option('show_'+b.dataset.allType,!engine.state()['show_'+b.dataset.allType]));if(focus)$('allTypes').querySelector('[data-all-type="'+focus+'"]')?.focus({preventScroll:true});
  const hidden=types.every(t=>!state['show_'+t.id]);$('allNotice').innerHTML=hidden?'표시할 종류를 선택해주세요':'';
  const undated=api.todos().filter(t=>!P.read('todo',t).startDate&&accept(wrap('todo',t),state)).length;
  if(mode==='calendar'&&undated&&!hidden){$('allNotice').innerHTML='<button type="button" class="btn-ghost" id="allShowUndated">날짜 없는 할일 '+undated+'개 · 목록에서 보기</button>';$('allShowUndated').onclick=()=>{engine.option('undated',true);engine.option('mode','list');};}
  if(mode==='calendar')engine.calendar();else engine.collection();if(hidden)$('allEmpty').textContent='표시할 종류를 선택해주세요';sidebarTypes();
 }
 const preview=document.createElement('div');preview.id='allDragPreview';preview.className='sv-drag-preview';preview.hidden=true;preview.innerHTML='<span id="allDragText"></span><br><button type="button" id="allDragCancel">취소 (Esc)</button>';document.body.append(preview);
 engine=window.createOnekanItemViews({...api,pageName:'all',sharedRange:true,title:'항목',id,kindOf:r=>r.kind,types:()=>types,
  defaults:{mode:'calendar',span:'month',group:'type',board:'type',completion:'open',status:'all',undated:false,show_event:true,show_todo:true,show_habit:true},
  preferenceOptions:{group:['none','date','type','group','category','project'],board:['type','group','category','project'],show_event:[true,false],show_todo:[true,false],show_habit:[true,false]},
  date:()=>date,month,mode:()=>mode,setMode:v=>{mode=v;},restoreDate:v=>{date=/^\d{4}-\d{2}-\d{2}$/.test(v)?v:api.today();},changeMode:v=>{mode=v;render();api.sidebar();},render,selectDate,
  goMonth:n=>{const [y,m]=date.split('-').map(Number),d=new Date(y,m-1+n,1);selectDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01');},
  rows,groups,groupId,categoryId,accept,visible:()=>true,matches:()=>true,endDate,check,wire,canMove:r=>r.kind!=='habit',
  menuAttrs:(value,d)=>{const r=lookup(value);return r?api.menuAttrs(r.kind,r.source_id,r.kind==='habit'?r.action_date:d)+(r.kind==='habit'&&r.block?' data-habit-status-block="'+esc(r.block)+'"':''):'';},
  detail:(value,opener)=>{const r=lookup(value);if(r)api.detail(r.kind,r.source_id,opener);},edit:(value,opener)=>{const r=lookup(value);if(r)api.edit(r.kind,r.source_id,opener);},add,
  info:r=>{const text=[typeName(r.kind),api.groups().find(g=>g.kind===r.kind&&g.id===(r.kind==='event'?r.category_id:r.group_id))?.name,api.categories().find(c=>c.id===categoryId(r))?.name,(api.projects().find(p=>p.id===r.project_id)?.title||api.projects().find(p=>p.id===r.project_id)?.name),r.kind==='habit'?api.habits().note(r):''].filter(Boolean);return '<span class="iv-source">'+esc(text.join(' · '))+'</span>';},
  adjustPatch:(r,patch)=>{if(r.kind==='todo'&&!r.repeat_unit&&r.end_date!=null)patch.end_date=patch.occurrence_end_date??r.end_date;},
  persist:(r,patch,user)=>api.sb.from(r.kind==='event'?'tok_events':'tok_todos').update(patch).eq('id',r.source_id).eq('user_id',user).select('id').single(),
  scrollDate:d=>host.querySelector('[data-date="'+d+'"]')?.scrollIntoView({block:'start'}),paintRange:(a,b)=>host.querySelectorAll('.cal-cell[data-date]').forEach(c=>c.classList.toggle('cal-range',c.dataset.date>=a&&c.dataset.date<=b)),clearRange:()=>host.querySelectorAll('.cal-range').forEach(c=>c.classList.remove('cal-range')),
  focusTarget:()=>$('allViewTabs').querySelector('[data-common-view].active')||$('allViewTabs').querySelector('[data-tab="'+mode+'"]')
 });
 $('allTodoStatus').onchange=e=>engine.option('completion',e.target.value);$('allHabitStatus').onchange=e=>engine.option('status',e.target.value);$('allUndated').onchange=e=>engine.option('undated',e.target.checked);
 $('allPrevBtn').onclick=()=>engine.navigate(-1);$('allNextBtn').onclick=()=>engine.navigate(1);$('allTodayBtn').onclick=()=>{engine.resetRange();selectDate(api.today());};
 $('allViewTabs').querySelectorAll('button[data-tab]').forEach(b=>b.onclick=()=>engine.option('mode',b.dataset.tab));$('allAddBtn').onclick=e=>add({startDate:date,endDate:date,allDay:true,opener:e.currentTarget});
 return {...engine,render,selectDate,sidebarTypes,displayRows:rows};
};
