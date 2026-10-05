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
 function selectDate(value){date=value;engine?.resetRange();engine?.remember();$('todoSaveStatus').textContent='';render();}
 function emptyCollection(items){
  const empty=!items.length;
  $('todoViewEmpty').hidden=!empty;
  $('todoUnifiedList').hidden=empty||mode!=='list';$('todoBoard').hidden=empty||mode!=='board';
  const hasTasks=api.rows().some(row=>api.matches(row));
  $('todoEmptyTitle').textContent=hasTasks?'조건에 맞는 할일이 없어요':'첫 할일을 적어보세요';
  $('todoEmptyDescription').textContent=hasTasks?'기간이나 완료 상태를 바꾸어 다른 할일을 확인해 보세요.':'작은 할일 하나부터 오늘 한 칸을 채워보세요.';
  $('todoEmptySettingsBtn').hidden=!hasTasks;
 }
 function render(){
  const active=someday?'someday':mode;host.querySelectorAll('#todoTopTabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===active);b.setAttribute('aria-pressed',String(b.dataset.tab===active));});
  $('todoUnifiedView').hidden=someday;$('todoUnifiedView').style.display=someday?'none':'block';$('todoSomedayView').style.display=someday?'block':'none';
  $('todoPrevBtn').parentElement.hidden=someday;$('todoCalendarOptions').hidden=someday||mode!=='calendar';$('todoCollectionOptions').hidden=someday||mode==='calendar';
  $('todoFilterBar').hidden=someday;$('todoQuickAddBtn').hidden=someday;$('todoViewSettings').hidden=someday||mode==='calendar';
  if(someday||mode==='calendar')$('todoViewSettings').open=false;
  if(someday){host.querySelectorAll('[data-common-view]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});api.someday();return;}
  const state=engine.state();$('todoCollection').hidden=mode==='calendar';$('todoCalendarMode').hidden=mode!=='calendar';$('todoUnifiedList').hidden=mode==='board';$('todoBoard').hidden=mode!=='board';$('todoUndatedWrap').hidden=mode==='calendar';$('todoCompletion').value=state.completion;$('todoUndated').checked=state.undated;
  $('todoMonthCount').hidden=mode==='calendar';$('todoJumpRow').hidden=mode==='calendar';
  $('todoMonthLabel').textContent=state.span==='month'?Number(date.slice(0,4))+'년 '+Number(date.slice(5,7))+'월':engine.range().start+' ~ '+engine.range().end;
  if(mode==='calendar')engine.calendar();else engine.collection();
  // The selected range has one visible label; the detailed dates stay in settings.
  const r=engine.range(),m=month(),short=d=>Number(d.slice(5,7))+'월 '+Number(d.slice(8))+'일';
  if(mode!=='calendar'){
   $('todoMonthLabel').textContent=r.start===m.ms&&r.end===m.me?Number(r.start.slice(0,4))+'년 '+Number(r.start.slice(5,7))+'월':r.start===r.end?Number(r.start.slice(0,4))+'년 '+short(r.start):Number(r.start.slice(0,4))+'년 '+short(r.start)+' – '+(r.end.slice(0,4)!==r.start.slice(0,4)?Number(r.end.slice(0,4))+'년 ':'')+short(r.end);
   $('todoMonthLabel').setAttribute('aria-label',r.start+' ~ '+r.end+', 연·월 선택');
   $('todoPrevBtn').setAttribute('aria-label','이전 기간');$('todoNextBtn').setAttribute('aria-label','다음 기간');
  }
  $('todoRangeLabel').hidden=true;
  const grouping=mode==='board'?$('todoBoardBy'):$('todoGroup');
  $('todoSettingsSummary').textContent=grouping.selectedOptions[0].textContent+' · '+$('todoSort').selectedOptions[0].textContent+(state.undated?' · 날짜 없음 포함':'');
  const count=api.rows().filter(row=>!row.start_date&&api.matches(row)&&accept(row,state)).length;
  $('todoUndatedNotice').innerHTML=mode==='calendar'&&count?'<button type="button" class="btn-ghost" id="todoShowUndated">날짜 없는 할일 '+count+'개 · 목록에서 보기</button>':'';
  $('todoShowUndated')?.addEventListener('click',()=>{engine.option('undated',true);switchView('list');});
 }
 function switchView(value){if(value==='someday'){someday=true;engine.cancel();render();api.sidebar();return;}someday=false;engine.option('mode',value==='all'||value==='scheduled'?'list':value);}
 const preview=document.createElement('div');preview.id='todoDragPreview';preview.className='sv-drag-preview';preview.hidden=true;preview.innerHTML='<span id="todoDragText"></span><br><button type="button" id="todoDragCancel">취소 (Esc)</button>';document.body.append(preview);
 engine=window.createOnekanItemViews({...api,kind:'todo',pageName:'todos',table:'tok_todos',title:'할일',id,defaults:{mode:'list',group:'date',completion:'open',undated:true},date:()=>date,month,mode:()=>mode,setMode:value=>{mode=value;},restoreDate:value=>{date=/^\d{4}-\d{2}-\d{2}$/.test(value)?value:api.today();someday=false;},changeMode:value=>{someday=false;mode=value;render();api.sidebar();},render,selectDate,goMonth:n=>{const [y,m]=date.split('-').map(Number),d=new Date(y,m-1+n,1);selectDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01');},emptyCollection,endDate:row=>{const period=P.read('todo',row);const end=period.endDate||period.startDate;return !period.allDay&&period.endTime==='00:00'&&end>period.startDate?P.addDays(end,-1):end;},accept,check,wire,info:row=>{const text=[api.categories().find(c=>c.id===row.tag_id)?.name,api.projectName(row)].filter(Boolean).join(' · ');return (text?'<span>'+esc(text)+'</span>':'')+api.groupBadge(row);},detail:id=>api.edit(id),scrollDate:d=>host.querySelector('[data-date="'+d+'"]')?.scrollIntoView({block:'start'}),paintRange:(a,b)=>host.querySelectorAll('.cal-cell[data-date]').forEach(el=>el.classList.toggle('cal-range',el.dataset.date>=a&&el.dataset.date<=b)),clearRange:()=>host.querySelectorAll('.cal-range').forEach(el=>el.classList.remove('cal-range')),adjustPatch:(row,patch)=>{if(!row.repeat_unit&&row.end_date!=null)patch.end_date=patch.occurrence_end_date??row.end_date;},focusTarget:()=>$('todoTopTabs').querySelector('[data-common-view].active')||$('todoTopTabs').querySelector('[data-tab="'+(someday?'someday':mode)+'"]')});
 $('todoCompletion').onchange=e=>engine.option('completion',e.target.value);$('todoUndated').onchange=e=>engine.option('undated',e.target.checked);
 // Keep the shared calendar and storage engine; compose only the todo shell.
 const controls=host.querySelector('.iv-controls'),top=document.createElement('div'),bar=document.createElement('div');
 top.className='todo-view-bar';bar.id='todoFilterBar';bar.className='todo-filter-bar';
 top.append($('todoTopTabs'),$('todoQuickAddBtn'));bar.append($('todoPrevBtn').parentElement,$('todoCompletion').closest('label'),$('todoViewSettings'));
 controls.prepend(top,bar);
 $('todoSettingsContent').append($('todoCollectionOptions'),$('todoUndatedWrap'));$('todoPrimaryActions').remove();
 const applyRange=$('todoRangeApply').onclick;
 $('todoRangeApply').onclick=()=>{const a=$('todoRangeStart').value,b=$('todoRangeEnd').value;if(a&&b&&b>=a){date=a;$('todoSaveStatus').textContent='';}applyRange();};
 function navigate(delta){
  const r=engine.range(),m=month();
  if(mode==='calendar'||r.start===m.ms&&r.end===m.me){engine.navigate(delta);return;}
  const shift=(P.days(r.start,r.end)+1)*delta;
  $('todoRangeStart').value=P.addDays(r.start,shift);$('todoRangeEnd').value=P.addDays(r.end,shift);$('todoRangeApply').click();
 }
 $('todoPrevBtn').onclick=()=>navigate(-1);$('todoNextBtn').onclick=()=>navigate(1);$('todoTodayBtn').onclick=()=>selectDate(api.today());
 $('todoEmptyAddBtn').onclick=()=>api.add({startDate:date,endDate:date,allDay:true,opener:$('todoEmptyAddBtn')});
 $('todoEmptySettingsBtn').onclick=()=>{$('todoViewSettings').open=true;$('todoRangeStart').focus();};
 $('todoViewSettings').onkeydown=e=>{if(e.key==='Escape'){$('todoViewSettings').open=false;$('todoViewSettings').querySelector('summary').focus();}};
 return {...engine,render,switch:switchView,selectDate,addCurrent:()=>api.add({startDate:date,endDate:date,allDay:true})};
};
