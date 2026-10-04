/* Shared controls and month layout. Adapters own every source and action. */
(function(root){
 const el=id=>document.getElementById(id);
 function mount(api){
  api.title=api.title||'일정';api.minLaneWidth=api.minLaneWidth||120;
  const id=n=>api.id?api.id(n):n,page=api.pageName||'schedule',host=document.querySelector('.page[data-page="'+page+'"]'),options=el(id('scheduleCalendarOptions'));
  host.classList.add('iv-page');
  options.innerHTML='<div class="view-toggle" role="group" aria-label="달력 기간"><button type="button" data-sv-span="day">일간 보기</button><button type="button" data-sv-span="month">한달</button></div><label id="'+id('scheduleDayCountWrap')+'">표시 일수 <select id="'+id('scheduleDayCount')+'">'+Array.from({length:7},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'일</option>').join('')+'</select></label><div id="'+id('scheduleTimeFormat')+'" class="view-toggle" role="group" aria-label="표시 방식"><button type="button" data-sv-format="timeline">타임라인</button><button type="button" data-sv-format="blocks">시간블럭</button></div><label>기준 날짜 <input type="date" id="'+id('scheduleAnchor')+'"></label>';
  const prefix=page==='todos'?'todo':page==='habits'?'habit':page;
  const prev=el(id('calPrevBtn')),next=el(id('calNextBtn')),title=el(id('calMonthLabel')),today=el(page==='schedule'?'schedThisMonthBtn':prefix+'TodayBtn');
  const nav=prev.parentElement;nav.classList.add('iv-date-nav');prev.classList.add('agenda-nav');next.classList.add('agenda-nav');today.classList.add('cal-today-btn');title.classList.add('sched-month-title');
  const views=el(page==='schedule'?'scheduleModeCalendarBtn':page==='todos'?'todoTopTabs':prefix+'ViewTabs');
  const viewRow=page==='schedule'?views.parentElement:views;viewRow.classList.add('iv-view-tabs');
  const controls=document.createElement('div');controls.className='iv-controls';(page==='todos'?el('todoUnifiedView'):options).before(controls);controls.append(viewRow,nav,options,el(id('scheduleCollectionOptions')));
  const grid=el(id('calGrid'));grid.classList.add('iv-month-grid');
 }
 function month(view){
  const {api,$,state,rows,card,wireCards,add,read,overlap,endDate}=view,P=api.period,esc=api.escape,{ms,me}=api.month(),date=api.date(),grid=$('calGrid');
  const first=P.addDays(ms,-new Date(ms+'T12:00:00').getDay()),last=P.addDays(me,6-new Date(me+'T12:00:00').getDay());
  const focused=grid.contains(document.activeElement)?document.activeElement:null,focusDate=focused?.closest('[data-date]')?.dataset.date,focusId=focused?.dataset.id;
  let html='';for(let d=first;d<=last;d=P.addDays(d,1)){
   const items=rows.filter(e=>overlap(e,d));
   html+='<div class="cal-cell '+(d.slice(0,7)!==ms.slice(0,7)?'other-month ':'')+(d===api.today()?'today ':'')+(d===date?'selected':'')+'" data-date="'+d+'" role="button" tabindex="'+(d===date?0:-1)+'" aria-pressed="'+(d===date)+'" aria-label="'+esc(api.dateLabel(d))+' · '+items.length+'개"'+(d===api.today()?' aria-current="date"':'')+'><div class="iv-date"><button type="button" class="cal-cell-num" tabindex="-1" data-iv-select="'+d+'">'+Number(d.slice(8))+'</button><button type="button" data-sv-add="'+d+'" aria-label="'+d+' '+api.title+' 추가">＋</button></div>'+items.map(e=>{
    const p=read(e),continuing=p.startDate!==p.endDate,resize=api.allowResize!==false&&api.canMove?.(e)!==false&&p.allDay&&d===endDate(e);
    return card(e,d,'data-event-id="'+esc(e.id)+'" data-date="'+d+'"').replace('sv-card sched-row','sv-card sched-row cal-chip'+(continuing?' band':''))
     .replace('</article>',(resize?'<button type="button" class="cal-end-handle" data-sv-resize aria-label="'+esc(e.title)+' 종료 수정"></button>':'')+'</article>');
   }).slice(0,3).join('')+(items.length>3?'<button type="button" class="cal-more" data-iv-select="'+d+'">+'+(items.length-3)+'개 더보기</button>':'')+'</div>';
  }
  grid.innerHTML=html;wireCards(grid);
  grid.querySelectorAll('[data-iv-select]').forEach(b=>b.onclick=()=>api.selectDate(b.dataset.ivSelect));
  grid.querySelectorAll('.cal-cell').forEach(c=>{c.onclick=e=>{if(!e.target.closest('article,button,input'))api.selectDate(c.dataset.date);};c.onkeydown=e=>{if(e.target!==c)return;const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(delta||['Enter',' '].includes(e.key)){e.preventDefault();api.selectDate(delta?P.addDays(c.dataset.date,delta):c.dataset.date);$('calGrid').querySelector('.selected')?.focus({preventScroll:true});}};});
  grid.querySelectorAll('[data-sv-resize]').forEach(b=>b.onclick=()=>api.edit(b.closest('[data-event-id]').dataset.eventId,b));
  if(focused)(focusId?grid.querySelector('.sv-open[data-id="'+CSS.escape(focusId)+'"]'):grid.querySelector('.cal-cell[data-date="'+(focusDate||date)+'"]'))?.focus({preventScroll:true});
  const layout=grid.closest('.cal-layout');let side=layout.querySelector('.cal-side');
  if(!side){side=document.createElement('div');side.className='cal-side';side.innerHTML='<section class="cal-day-panel"><div class="cal-day-head"><h2 class="cal-day-title"></h2><span class="cal-day-count"></span><button type="button" class="cal-day-add">＋ 추가</button></div><div class="cal-day-list"></div></section>';layout.append(side);}
  const selected=rows.filter(e=>overlap(e,date));side.querySelector('.cal-day-title').textContent=api.dateLabel(date);side.querySelector('.cal-day-count').textContent=selected.length+'개';side.querySelector('.cal-day-add').onclick=e=>add(date,null,e.currentTarget);
  const list=side.querySelector('.cal-day-list');list.innerHTML=selected.map(e=>card(e,date).replace('sched-open sv-open','sched-open sv-open cal-day-item')).join('')||'<p class="empty cal-day-empty">이 날의 '+api.title+'이 없어요.</p>';wireCards(list);side.querySelector('.cal-day-panel').classList.toggle('has-items',!!selected.length);
  $('calMonthLabel').textContent=ms.slice(0,7);return true;
 }
 const eye=shown=>'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(shown?'':'<path d="M3 3l18 18"/>')+'</svg>';
 root.OnekanCalendarUI={mount,month,eye,timelineSpec:()=>({min:0,max:1440,scale:.6,minHeight:20})};
})(window);
