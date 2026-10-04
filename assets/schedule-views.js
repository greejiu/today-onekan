/* Schedule adapter keeps the existing public entry point and geometry test API. */
(function(root){
 if(typeof module!=='undefined'){module.exports=require('./item-views.js');return;}
 root.createOnekanScheduleViews=api=>{
  let engine;
  const view=()=>{const s=engine?.state();return s?.mode==='list'?'list':s?.span==='day'?(s.days===7?'week':'day'):'month';};
  const sync=()=>document.querySelectorAll('[data-schedule-view]').forEach(b=>{const active=b.dataset.scheduleView===view();b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  const normalizeState=s=>{if(s.mode==='board')s.mode='list';s.format='timeline';s.days=s.days>1?7:1;if(s.group==='category')s.group='date';};
  const desktop=matchMedia('(min-width:761px)'),workspace=document.getElementById('scheduleCalendarMode');
  let closed=false,owner=api.user(),pendingDate=null;
  const panel=document.createElement('aside');panel.id='scheduleMonthAgenda';panel.setAttribute('aria-label','현재 달의 일정 목록');
  panel.innerHTML='<header><h2>이 달의 일정</h2><button type="button" id="scheduleAgendaClose" aria-label="일정 목록 접기" aria-expanded="true" aria-controls="scheduleMonthAgenda">→</button></header><div id="scheduleAgendaScroll" tabindex="0" aria-label="날짜순 일정 목록"></div>';
  const reopen=document.createElement('button');reopen.type='button';reopen.id='scheduleAgendaOpen';reopen.textContent='←';reopen.setAttribute('aria-label','일정 목록 펼치기');reopen.setAttribute('aria-controls',panel.id);
  workspace.append(panel,reopen);
  const addDate=(date,opener)=>api.add({mode:'add',date,startDate:date,endDate:date,allDay:true,opener});
  function renderPanel(){
   if(owner!==api.user()){owner=api.user();closed=false;pendingDate=null;}
   const active=desktop.matches&&view()!=='list';workspace.classList.toggle('schedule-panels',active);workspace.classList.toggle('agenda-closed',closed);
   panel.hidden=!active||closed;reopen.hidden=!active||!closed;reopen.setAttribute('aria-expanded',String(!closed));
   if(!active)return;
   const scroll=panel.querySelector('#scheduleAgendaScroll'),top=scroll.scrollTop,{ms,me}=api.month(),esc=api.escape,P=api.period;
   const rows=api.rows().filter(api.visible);let html='';
   for(let d=ms;d<=me;d=P.addDays(d,1)){
    const items=rows.filter(e=>P.overlap('event',e,d)).sort((a,b)=>Number(P.read('event',b).allDay)-Number(P.read('event',a).allDay)||(P.read('event',a).startTime||'').localeCompare(P.read('event',b).startTime||'')||String(a.id).localeCompare(String(b.id)));
    if(!items.length&&d!==api.date())continue;
    html+='<section data-agenda-date="'+d+'"><div class="schedule-agenda-day"><h3 tabindex="-1">'+esc(api.dateLabel(d))+'</h3><button type="button" data-agenda-add="'+d+'" aria-label="'+esc(api.dateLabel(d))+' 일정 추가">＋</button></div>'+items.map(e=>'<div class="schedule-agenda-row"'+api.menuAttrs(e.id,d)+'><button type="button" data-agenda-event="'+esc(e.id)+'"><span class="schedule-agenda-time">'+esc(P.read('event',e).allDay?(e.all_day==null?'시간 미지정':'종일'):P.read('event',e).startTime)+'</span><span>'+esc(e.title)+'</span><small>'+esc(P.label('event',e))+'</small></button><button type="button" class="item-more" aria-label="'+esc(e.title)+' 메뉴">⋯</button></div>').join('')+(items.length?'':'<p class="cal-day-empty">일정 없음</p>')+'</section>';
   }
   scroll.innerHTML=html||'<p class="cal-day-empty">이 달의 일정이 없어요.</p>';scroll.scrollTop=top;
   scroll.querySelectorAll('[data-agenda-add]').forEach(b=>b.onclick=()=>addDate(b.dataset.agendaAdd,b));
   scroll.querySelectorAll('[data-agenda-event]').forEach(b=>b.onclick=()=>api.detail(b.dataset.agendaEvent,b));
   if(pendingDate&&!closed){const date=pendingDate;pendingDate=null;const h=scroll.querySelector('[data-agenda-date="'+date+'"] h3');if(h){scroll.scrollTop+=h.getBoundingClientRect().top-scroll.getBoundingClientRect().top;h.focus({preventScroll:true});}}
  }
  panel.querySelector('#scheduleAgendaClose').onclick=()=>{closed=true;renderPanel();reopen.focus({preventScroll:true});};
  reopen.onclick=()=>{closed=false;renderPanel();panel.querySelector('#scheduleAgendaClose').focus({preventScroll:true});};
  const onMonthDate=date=>{closed=false;pendingDate=date;api.selectDate(date);};
  function fitWeek(){
   const host=document.getElementById('scheduleTimeDays');host.classList.toggle('schedule-week-fit',view()==='week');
   if(view()!=='week')return;
   host.style.gridTemplateColumns='repeat(7,minmax(0,1fr))';
   const days=[...host.querySelectorAll('.sv-day')];
   days.forEach(day=>{const b=day.querySelector('[data-sv-select]'),d=day.dataset.svDate;b.setAttribute('aria-label',api.dateLabel(d));b.textContent=Number(d.slice(5,7))+'/'+Number(d.slice(8))+' '+['일','월','화','수','목','금','토'][new Date(d+'T12:00:00').getDay()];day.querySelector('.sv-allday .label').textContent='종일';day.querySelectorAll('.sv-allday .add-slot').forEach(add=>{add.textContent='＋';add.setAttribute('aria-label',api.dateLabel(d)+' 종일 일정 추가');});});
   host.style.removeProperty('--all-height');host.style.setProperty('--all-height',Math.max(70,...days.map(d=>d.querySelector('.sv-allday').scrollHeight))+'px');
   const grid=days[0]?.querySelector('.ag-tl-grid');if(!grid)return;
   const axis=grid.cloneNode(false);axis.classList.add('schedule-week-axis');axis.setAttribute('aria-hidden','true');
   grid.querySelectorAll('.tl-row-label').forEach(label=>axis.append(label.cloneNode(true)));
   host.querySelectorAll('.sv-day .tl-row-label').forEach(label=>label.remove());
   host.append(axis);axis.style.top=(grid.getBoundingClientRect().top-host.getBoundingClientRect().top)+'px';
   document.getElementById('scheduleTimeScroll').scrollLeft=0;
  }
  desktop.addEventListener('change',()=>{if(api.page()==='schedule')api.render();});
  engine=root.createOnekanItemViews({...api,normalizeState,singleMonthAdd:true,onMonthDate,
   date:()=>{const date=api.date();return view()==='week'?api.period.addDays(date,-new Date(date+'T12:00:00').getDay()):date;},
   render:()=>{api.render();sync();},changeMode:mode=>{api.changeMode(mode==='board'?'list':mode);sync();}
  });
  function selectView(value){
   if(!['month','week','day','list'].includes(value))return;
   const s=engine.state();if(value!=='list'){s.span=value==='month'?'month':'day';s.days=value==='week'?7:1;engine.resetRange();}
   engine.option('mode',value==='list'?'list':'calendar');sync();
  }
  for(const selector of ['#scheduleModeToggle','#scheduleSidebarNav']){
   const host=document.querySelector(selector);
   host.querySelectorAll(':scope > button').forEach(b=>{b.hidden=true;b.style.display='none';b.tabIndex=-1;});
   const row=document.createElement('div');row.className='schedule-simple-views';
   for(const [value,label] of [['month','월'],['week','주'],['day','일'],['list','목록']]){
    const b=document.createElement('button');b.type='button';b.dataset.scheduleView=value;b.textContent=label;if(selector==='#scheduleSidebarNav')b.className='navitem';b.onclick=()=>selectView(value);row.append(b);
   }
   host.prepend(row);
  }
  document.querySelectorAll('#scheduleGroup option[value="category"],#scheduleBoardBy option[value="category"]').forEach(el=>el.remove());
  const style=document.createElement('style');style.textContent='#scheduleCalendarOptions{display:none!important}#scheduleModeToggle .schedule-simple-views{display:flex;gap:4px}';document.head.append(style);
  sync();return {...engine,calendar:()=>{const result=engine.calendar();renderPanel();fitWeek();return result;},collection:()=>{engine.collection();renderPanel();},selectView,currentView:view,focusTarget:()=>document.querySelector('#scheduleSidebarNav [data-schedule-view="'+view()+'"]')};
 };
})(typeof window==='undefined'?globalThis:window);
