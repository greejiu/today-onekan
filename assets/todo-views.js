/* Todo adapter: stored occurrences only. Someday remains its existing separate page/table. */
window.createOnekanTodoViews = api => {
 'use strict';
 const $=id=>document.getElementById(id),P=api.period,esc=api.escape,host=document.querySelector('[data-page="todos"].page');
 let date=api.today(),mode='list',someday=false,engine;
 const aliases={scheduleList:'todoUnifiedList',scheduleEmpty:'todoViewEmpty',schedMonthCount:'todoMonthCount',schedJumpRow:'todoJumpRow',schedJumpBtn:'todoJumpBtn',calMonthLabel:'todoMonthLabel',calPrevBtn:'todoPrevBtn',calNextBtn:'todoNextBtn',calGrid:'todoCalGrid'};
 const id=name=>aliases[name]||name.replace(/^schedule/,'todo');
 const month=()=>{const ms=date.slice(0,7)+'-01',next=P.addDays(ms,32).slice(0,7)+'-01';return {ms,me:P.addDays(next,-1)};};
 const accept=(row,state)=>state.completion==='all'||(state.completion==='done')===!!row.is_done;
 const check=row=>'<input class="iv-check" type="checkbox" data-todo-check="'+esc(row.id)+'" '+(row.is_done?'checked':'')+' aria-label="'+esc(row.title)+' 완료" />';
 function wire(node){node.querySelectorAll('[data-todo-check]').forEach(cb=>{cb.onclick=e=>e.stopPropagation();cb.onchange=async()=>{const id=cb.dataset.todoCheck;cb.disabled=true;try{await api.done(id,cb.checked);api.refresh();const target=[...host.querySelectorAll('[data-todo-check]')].find(el=>el.dataset.todoCheck===id&&el.getClientRects().length)||$('todoCompletion');target.focus({preventScroll:true});}finally{if(cb.isConnected)cb.disabled=false;}};});}
 function monthCalendar(view){
  const {ms,me}=month(),first=P.addDays(ms,-new Date(ms+'T12:00:00').getDay()),last=P.addDays(me,6-new Date(me+'T12:00:00').getDay()),grid=$('todoCalGrid');
  const focused=grid.contains(document.activeElement)?document.activeElement:null,selected=focused?.dataset.tvSelect,itemId=focused?.dataset.id;
  let html='';for(let d=first;d<=last;d=P.addDays(d,1)){
   const items=view.rows.filter(row=>P.overlap('todo',row,d));
   html+='<div class="cal-cell '+(d.slice(0,7)!==ms.slice(0,7)?'other-month ':'')+(d===date?'selected':'')+'" data-date="'+d+'"><div class="tv-date"><button type="button" data-tv-select="'+d+'" aria-pressed="'+(d===date)+'">'+Number(d.slice(8))+'</button><button type="button" data-sv-add="'+d+'" aria-label="'+d+' 할일 추가">＋</button></div>'+items.map(row=>view.card(row,d,'data-event-id="'+esc(row.id)+'" data-date="'+d+'"').replace('sv-card sched-row','sv-card sched-row cal-chip').replace('</article>',(P.read('todo',row).allDay&&d===P.read('todo',row).endDate?'<button type="button" class="cal-end-handle" data-sv-resize aria-label="'+esc(row.title)+' 종료 수정"></button>':'')+'</article>')).join('')+'</div>';
  }grid.innerHTML=html;view.wireCards(grid);
  grid.querySelectorAll('[data-tv-select]').forEach(b=>b.onclick=()=>selectDate(b.dataset.tvSelect));
  grid.querySelectorAll('[data-sv-resize]').forEach(b=>b.onclick=()=>api.edit(b.closest('[data-event-id]').dataset.eventId));
  if(focused){const target=selected?grid.querySelector('[data-tv-select="'+selected+'"]'):itemId?grid.querySelector('[data-id="'+CSS.escape(itemId)+'"] .sv-open'):grid.querySelector('[data-tv-select="'+date+'"]');target?.focus({preventScroll:true});}
  $('todoMonthLabel').textContent=ms.slice(0,7);return true;
 }
 function selectDate(value){date=value;engine?.remember();render();}
 function render(){
  const active=someday?'someday':mode;host.querySelectorAll('#todoTopTabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===active);b.setAttribute('aria-pressed',String(b.dataset.tab===active));});
  $('todoUnifiedView').hidden=someday;$('todoUnifiedView').style.display=someday?'none':'block';$('todoSomedayView').style.display=someday?'block':'none';
  if(someday){api.someday();return;}
  const state=engine.state();$('todoCollection').hidden=mode==='calendar';$('todoCalendarMode').hidden=mode!=='calendar';$('todoUnifiedList').hidden=mode==='board';$('todoBoard').hidden=mode!=='board';$('todoUndatedWrap').hidden=mode==='calendar';$('todoCompletion').value=state.completion;$('todoUndated').checked=state.undated;
  $('todoMonthCount').hidden=mode==='calendar';$('todoJumpRow').hidden=mode==='calendar';
  $('todoMonthLabel').textContent=state.span==='month'?date.slice(0,7):engine.range().start+' ~ '+engine.range().end;
  if(mode==='calendar')engine.calendar();else engine.collection();
  const count=api.rows().filter(row=>!row.start_date&&api.matches(row)&&accept(row,state)).length;
  $('todoUndatedNotice').innerHTML=mode==='calendar'&&count?'<button type="button" class="btn-ghost" id="todoShowUndated">날짜 없는 할일 '+count+'개 · 목록에서 보기</button>':'';
  $('todoShowUndated')?.addEventListener('click',()=>{engine.option('undated',true);switchView('list');});
 }
 function switchView(value){if(value==='someday'){someday=true;engine.cancel();render();api.sidebar();return;}someday=false;engine.option('mode',value==='all'||value==='scheduled'?'list':value);}
 const preview=document.createElement('div');preview.id='todoDragPreview';preview.className='sv-drag-preview';preview.hidden=true;preview.innerHTML='<span id="todoDragText"></span><br><button type="button" id="todoDragCancel">취소 (Esc)</button>';document.body.append(preview);
 engine=window.createOnekanItemViews({...api,kind:'todo',pageName:'todos',table:'tok_todos',title:'할일',id,defaults:{mode:'list',group:'date',completion:'open',undated:true},date:()=>date,month,mode:()=>mode,setMode:value=>{mode=value;},restoreDate:value=>{date=/^\d{4}-\d{2}-\d{2}$/.test(value)?value:api.today();someday=false;},changeMode:value=>{mode=value;render();api.sidebar();},render,selectDate,goMonth:n=>{const [y,m]=date.split('-').map(Number),d=new Date(y,m-1+n,1);selectDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01');},endDate:row=>{const period=P.read('todo',row);const end=period.endDate||period.startDate;return !period.allDay&&period.endTime==='00:00'&&end>period.startDate?P.addDays(end,-1):end;},accept,check,wire,info:row=>{const text=[api.categories().find(c=>c.id===row.tag_id)?.name,api.projectName(row)].filter(Boolean).join(' · ');return (text?'<span>'+esc(text)+'</span>':'')+api.groupBadge(row);},detail:id=>api.edit(id),monthCalendar,scrollDate:d=>host.querySelector('[data-date="'+d+'"]')?.scrollIntoView({block:'start'}),paintRange:(a,b)=>host.querySelectorAll('.cal-cell[data-date]').forEach(el=>el.classList.toggle('cal-range',el.dataset.date>=a&&el.dataset.date<=b)),clearRange:()=>host.querySelectorAll('.cal-range').forEach(el=>el.classList.remove('cal-range')),adjustPatch:(row,patch)=>{if(!row.repeat_unit&&row.end_date!=null)patch.end_date=patch.occurrence_end_date??row.end_date;},focusTarget:()=>$('todoTopTabs').querySelector('[data-tab="'+(someday?'someday':mode)+'"]')});
 $('todoCompletion').onchange=e=>engine.option('completion',e.target.value);$('todoUndated').onchange=e=>engine.option('undated',e.target.checked);
 $('todoPrevBtn').onclick=()=>engine.navigate(-1);$('todoNextBtn').onclick=()=>engine.navigate(1);$('todoTodayBtn').onclick=()=>{engine.resetRange();selectDate(api.today());};
 return {...engine,render,switch:switchView,selectDate,addCurrent:()=>api.add({startDate:date,endDate:date,allDay:true})};
};
