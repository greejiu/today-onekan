/* Shared controls and month layout. Adapters own every source and action. */
(function(root){
 const el=id=>document.getElementById(id);
 // 대한민국 공휴일(2026-10-10 결 요청, 구글 캘린더처럼 표시). 외부 요청 없이 앱 안 표로 둠 — 해마다 다음 해 표를 추가해야 함.
 // 기준: 관공서의 공휴일에 관한 규정(대체공휴일 포함), 2026년 노동절·제헌절 공휴일 지정 반영. 2027년은 발표 전 계산값이라 공식 발표 후 다시 확인.
 const HOLIDAYS_KR={"2025-01-01":"신정","2025-01-27":"임시공휴일","2025-01-28":"설날 연휴","2025-01-29":"설날","2025-01-30":"설날 연휴","2025-03-01":"삼일절","2025-03-03":"대체공휴일(삼일절)","2025-05-05":"어린이날·부처님오신날","2025-05-06":"대체공휴일","2025-06-03":"대통령 선거일","2025-06-06":"현충일","2025-08-15":"광복절","2025-10-03":"개천절","2025-10-05":"추석 연휴","2025-10-06":"추석","2025-10-07":"추석 연휴","2025-10-08":"대체공휴일(추석)","2025-10-09":"한글날","2025-12-25":"성탄절","2026-01-01":"신정","2026-02-16":"설날 연휴","2026-02-17":"설날","2026-02-18":"설날 연휴","2026-03-01":"삼일절","2026-03-02":"대체공휴일(삼일절)","2026-05-01":"노동절","2026-05-05":"어린이날","2026-05-24":"부처님오신날","2026-05-25":"대체공휴일(부처님오신날)","2026-06-03":"지방선거일","2026-06-06":"현충일","2026-07-17":"제헌절","2026-08-15":"광복절","2026-08-17":"대체공휴일(광복절)","2026-09-24":"추석 연휴","2026-09-25":"추석","2026-09-26":"추석 연휴","2026-10-03":"개천절","2026-10-05":"대체공휴일(개천절)","2026-10-09":"한글날","2026-12-25":"성탄절","2027-01-01":"신정","2027-02-05":"설날 연휴","2027-02-06":"설날","2027-02-07":"설날 연휴","2027-02-08":"대체공휴일(설날)","2027-03-01":"삼일절","2027-05-01":"노동절","2027-05-03":"대체공휴일(노동절)","2027-05-05":"어린이날","2027-05-13":"부처님오신날","2027-06-06":"현충일","2027-07-17":"제헌절","2027-07-19":"대체공휴일(제헌절)","2027-08-15":"광복절","2027-08-16":"대체공휴일(광복절)","2027-09-14":"추석 연휴","2027-09-15":"추석","2027-09-16":"추석 연휴","2027-10-03":"개천절","2027-10-04":"대체공휴일(개천절)","2027-10-09":"한글날","2027-10-11":"대체공휴일(한글날)","2027-12-25":"성탄절","2027-12-27":"대체공휴일(성탄절)"};
 const holiday=(d,api)=>api&&api.holidays&&api.holidays()===false?null:HOLIDAYS_KR[d]||null;
 // 칸이 좁아 표시는 괄호 설명을 뺀 짧은 이름, 전체 이름은 title로
 // 모바일 월 칸(약 30px)용은 2~4글자 줄임말
 const tinyHoliday=h=>h.replace(/\(.*\)$/,'').replace(/^어린이날·.*/,'어린이날').replace(/^(대체|임시)공휴일$/,'$1').replace(/^(설날|추석) 연휴$/,'연휴').replace(/^.*선거일$/,'선거').replace('부처님오신날','부처님');
 const holidayHtml=(d,api,esc)=>{const h=holiday(d,api);return h?'<span class="cal-holiday" title="'+esc(h)+'"><span class="hl-short">'+esc(h.replace(/\(.*\)$/,''))+'</span><span class="hl-tiny" aria-hidden="true">'+esc(tinyHoliday(h))+'</span></span>':'';};
 // 월 칸에서 종류는 글자 대신 점 모양으로(일정 ● · 할일 ▢ · 습관 ○), 글자는 title·화면낭독기에만
 const KIND={event:'일정',todo:'할일',habit:'습관'};
 function mount(api){
  api.title=api.title||'일정';api.minLaneWidth=api.minLaneWidth||120;
  const id=n=>api.id?api.id(n):n,page=api.pageName||'schedule',host=document.querySelector('.page[data-page="'+page+'"]'),options=el(id('scheduleCalendarOptions'));
  host.classList.add('iv-page');
  options.innerHTML='<div class="view-toggle" role="group" aria-label="달력 기간"><button type="button" data-sv-span="day">일간 보기</button><button type="button" data-sv-span="month">한달</button></div><label id="'+id('scheduleDayCountWrap')+'">표시 일수 <select id="'+id('scheduleDayCount')+'">'+Array.from({length:7},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'일</option>').join('')+'</select></label><div id="'+id('scheduleTimeFormat')+'" class="view-toggle" role="group" aria-label="표시 방식"><button type="button" data-sv-format="timeline">타임라인</button><button type="button" data-sv-format="blocks">시간블럭</button></div><label>기준 날짜 <input type="date" id="'+id('scheduleAnchor')+'"></label>';
  const prefix=page==='todos'?'todo':page==='habits'?'habit':page;
  const prev=el(id('calPrevBtn')),next=el(id('calNextBtn')),title=el(id('calMonthLabel')),today=el(page==='schedule'?'schedThisMonthBtn':prefix+'TodayBtn');
  const nav=prev.parentElement;nav.classList.add('iv-date-nav');prev.classList.add('agenda-nav');next.classList.add('agenda-nav');today.classList.add('cal-today-btn');title.classList.add('sched-month-title');
  nav.classList.add('sched-month-bar');
  if(page!=='schedule'){
   const button=document.createElement('button');button.type='button';button.id=title.id;button.className='sched-month-title';title.replaceWith(button);const wrap=document.createElement('div');wrap.className='sched-month-title-wrap';button.before(wrap);wrap.append(button);const picker=el('schedMonthPicker').cloneNode(true);picker.id=prefix+'MonthPicker';picker.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));wrap.append(picker);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');let year;
   const close=restore=>{picker.hidden=true;button.setAttribute('aria-expanded','false');if(restore)button.focus({preventScroll:true});};
   const paint=()=>{picker.querySelector('.smp-year span').textContent=year+'년';const months=picker.querySelector('.smp-months');months.innerHTML=Array.from({length:12},(_,i)=>'<button type="button" data-m="'+(i+1)+'"'+(year===Number(api.date().slice(0,4))&&i+1===Number(api.date().slice(5,7))?' aria-current="true"':'')+'>'+(i+1)+'월</button>').join('');months.querySelectorAll('button').forEach(b=>b.onclick=()=>{close(true);api.selectDate(year+'-'+String(b.dataset.m).padStart(2,'0')+'-01');});};
   button.onclick=()=>{if(!picker.hidden){close(true);return;}year=Number(api.date().slice(0,4));paint();picker.hidden=false;button.setAttribute('aria-expanded','true');picker.querySelector('[aria-current]')?.focus();};const arrows=picker.querySelectorAll('.smp-year button');arrows[0].onclick=()=>{year--;paint();};arrows[1].onclick=()=>{year++;paint();};picker.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close(true);}};document.addEventListener('click',e=>{if(!wrap.contains(e.target))close(false);});
  }
  const views=el(page==='schedule'?'scheduleModeCalendarBtn':page==='todos'?'todoTopTabs':prefix+'ViewTabs');
  const viewRow=page==='schedule'?views.parentElement:views;viewRow.classList.add('iv-view-tabs');
  const controls=document.createElement('div');controls.className='iv-controls';(page==='todos'?el('todoUnifiedView'):options).before(controls);controls.append(viewRow,nav,options,el(id('scheduleCollectionOptions')));
  const grid=el(id('calGrid'));grid.classList.add('iv-month-grid');
 }
 function month(view){
  const {api,$,rows,wireCards,add,read,overlap,endDate}=view,P=api.period,esc=api.escape,{ms,me}=api.month(),date=api.date(),grid=$('calGrid'),mobile=matchMedia('(max-width:760px)').matches,limit=mobile?2:3;
  const first=P.addDays(ms,-new Date(ms+'T12:00:00').getDay()),last=P.addDays(me,6-new Date(me+'T12:00:00').getDay()),cells=[];
  for(let d=first;d<=last;d=P.addDays(d,1))cells.push(d);
  if(grid.dataset.month!==ms){grid.dataset.month=ms;grid._expanded=new Set();}const expanded=grid._expanded;
  const focused=grid.contains(document.activeElement),multi=e=>endDate(e)>read(e).startDate;
  const listOn=d=>rows.filter(e=>overlap(e,d)).sort((a,b)=>Number(read(b).allDay)-Number(read(a).allDay)||(read(a).startTime||'').localeCompare(read(b).startTime||''));
  const chip=(e,d,dow)=>{if(!e)return '<div class="cal-chip spacer" aria-hidden="true"></div>';const p=read(e),band=multi(e),left=band&&d>p.startDate,right=band&&d<endDate(e),show=!left||dow===0,mark=e.is_done||e.status==='done'?'✓ ':e.status==='skipped'?'× ':'';
   return '<div class="cal-chip'+(band?' band':'')+(left?' cont-l':'')+(right?' cont-r':'')+'" data-id="'+esc(e.id)+'" data-event-id="'+esc(e.id)+'" data-date="'+d+'"'+api.menuAttrs(e.id,d)+' title="'+esc((KIND[e.kind]?KIND[e.kind]+' · ':'')+e.title)+'" style="--chip-c:'+esc(api.color(e)||'var(--sub)')+'">'+(show?'<span class="dot'+(KIND[e.kind]?' k-'+e.kind:'')+'"></span>'+(KIND[e.kind]?'<span class="sr-only">'+KIND[e.kind]+' · </span>':'')+'<span class="cal-chip-title">'+esc(mark+e.title)+'</span>':'')+(api.allowResize!==false&&api.canMove?.(e)!==false&&p.allDay&&d===p.endDate?'<button type="button" class="cal-end-handle" data-sv-resize aria-label="'+esc(e.title)+' 종료 변경 · 클릭하여 수정"></button>':'')+'</div>';};
  let html='';for(let w=0;w<cells.length;w+=7){const week=cells.slice(w,w+7),laneOf=new Map(),ends=[];
   rows.filter(e=>multi(e)&&read(e).startDate<=week[6]&&endDate(e)>=week[0]).sort((a,b)=>read(a).startDate.localeCompare(read(b).startDate)||endDate(b).localeCompare(endDate(a))).forEach(e=>{const start=read(e).startDate>week[0]?read(e).startDate:week[0];let lane=ends.findIndex(x=>x<start);if(lane<0)lane=ends.length;ends[lane]=endDate(e);laneOf.set(e.id,lane);});
   const open=week.some(d=>expanded.has(d));
   week.forEach((d,dow)=>{const items=listOn(d),slots=[];items.filter(multi).sort((a,b)=>laneOf.get(a.id)-laneOf.get(b.id)).forEach(e=>{while(slots.length<laneOf.get(e.id))slots.push(null);slots.push(e);});items.filter(e=>!multi(e)).forEach(e=>slots.push(e));const shown=open?slots:slots.slice(0,limit);while(shown.length&&!shown[shown.length-1])shown.pop();const hidden=items.length-shown.filter(Boolean).length;
    html+='<div class="cal-cell'+(d.slice(0,7)!==ms.slice(0,7)?' other-month':'')+(d===api.today()?' today':'')+(holiday(d,api)?' is-holiday':'')+(d===date?' selected':'')+(open?' expanded':'')+'" data-date="'+d+'" role="button" tabindex="'+(d===date?0:-1)+'" aria-pressed="'+(d===date)+'" aria-label="'+esc(api.dateLabel(d)+(holiday(d,api)?' '+holiday(d,api):''))+' · '+items.length+'개"'+(d===api.today()?' aria-current="date"':'')+'><div class="cal-cell-head">'+(!mobile&&api.onMonthDate?'<button type="button" class="cal-cell-num cal-date-button" data-month-date="'+d+'" aria-label="'+esc(api.dateLabel(d))+' 일정 목록으로 이동">'+Number(d.slice(8))+'</button>':'<span class="cal-cell-num" aria-hidden="true">'+Number(d.slice(8))+'</span>')+holidayHtml(d,api,esc)+'</div>'+shown.map(e=>chip(e,d,dow)).join('')+((hidden>0||open&&slots.length>limit)?'<button type="button" class="cal-more" data-cal-more="'+d+'" aria-expanded="'+open+'">'+(open?'접기':'+'+hidden+'개')+'</button>':'')+'</div>';
   });
  }
  grid.innerHTML=html;grid.setAttribute('role','group');grid.classList.toggle('weeks-6',cells.length>35);
  grid.querySelectorAll('[data-cal-more]').forEach(b=>b.onclick=e=>{e.stopPropagation();const d=b.dataset.calMore,start=P.addDays(d,-new Date(d+'T12:00:00').getDay());for(let i=0;i<7;i++){const k=P.addDays(start,i);b.getAttribute('aria-expanded')==='true'?expanded.delete(k):expanded.add(k);}api.render();grid.querySelector('[data-cal-more="'+d+'"]')?.focus({preventScroll:true});});
  grid.querySelectorAll('[data-month-date]').forEach(b=>b.onclick=e=>{e.stopPropagation();api.onMonthDate(b.dataset.monthDate);});
  grid.querySelectorAll('.cal-cell').forEach(c=>{c.onclick=e=>{const chip=e.target.closest('.cal-chip[data-id]');if(chip&&!mobile){if(e.target.closest('[data-sv-resize]'))api.edit(chip.dataset.id,e.target);else api.detail(chip.dataset.id,c);return;}if(!e.target.closest('button,input'))api.selectDate(c.dataset.date);};c.onkeydown=e=>{if(e.target!==c)return;const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(delta||['Enter',' '].includes(e.key)){e.preventDefault();if(!delta&&!mobile&&api.onMonthDate)api.onMonthDate(c.dataset.date);else api.selectDate(delta?P.addDays(c.dataset.date,delta):c.dataset.date);grid.querySelector('.selected')?.focus({preventScroll:true});}};});
  const layout=grid.closest('.cal-layout');let side=layout.querySelector('.cal-side');
  if(!side){side=document.createElement('div');side.className='cal-side';side.innerHTML='<section class="cal-day-panel"><div class="cal-day-head"><h2 class="cal-day-title"></h2><span class="cal-day-count"></span><button type="button" class="cal-day-add">＋ 추가</button></div><div class="cal-day-list"></div></section><figure class="cheese-art" aria-hidden="true"><img src="assets/cheese-drawing.png" alt=""></figure>';layout.append(side);}
  const selected=listOn(date);side.querySelector('.cal-day-title').innerHTML=esc(api.dateLabel(date))+(date===api.today()?'<span class="today-badge">오늘</span>':'');side.querySelector('.cal-day-count').textContent=selected.length?selected.length+'개':'';side.querySelector('.cal-day-add').onclick=e=>add(date,null,e.currentTarget);
  const list=side.querySelector('.cal-day-list');list.innerHTML=selected.map(e=>'<div class="cal-day-row"'+api.menuAttrs(e.id,date)+'>'+view.check(e)+'<button type="button" class="cal-day-item sched-open" data-id="'+esc(e.id)+'"><span class="cal-day-time">'+esc(read(e).startTime||'종일')+'</span><span class="dot" style="--chip-c:'+esc(api.color(e)||'var(--sub)')+'"></span><span class="cal-day-body"><span class="cal-day-item-title">'+esc(e.title)+'</span><span class="cal-day-meta">'+esc(view.periodLabel(e))+'</span>'+view.info(e)+'</span></button><button type="button" class="item-more" aria-label="'+esc(e.title)+' 메뉴">⋯</button></div>').join('')||'<p class="cal-day-empty">이 날의 '+api.title+'이 없어요.</p>';wireCards(list);$('scheduleCalendarMode').classList.toggle('day-empty',!selected.length);
  const [year,month]=ms.split('-').map(Number);$('calMonthLabel').textContent=year+'년 '+month+'월';if(focused)grid.querySelector('.selected')?.focus({preventScroll:true});return true;
 }
 const eye=shown=>'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(shown?'':'<path d="M3 3l18 18"/>')+'</svg>';
   function fitWeek(host,api,active){
   host.classList.toggle('schedule-week-fit',active);
   if(!active)return;
   host.style.gridTemplateColumns='repeat(7,minmax(0,1fr))';
   const days=[...host.querySelectorAll('.sv-day')];
   days.forEach(day=>{const b=day.querySelector('[data-sv-select]'),d=day.dataset.svDate;b.setAttribute('aria-label',api.dateLabel(d));b.textContent=Number(d.slice(5,7))+'/'+Number(d.slice(8))+' '+['일','월','화','수','목','금','토'][new Date(d+'T12:00:00').getDay()];day.querySelector('.sv-allday .label').textContent='종일';day.querySelectorAll('.sv-allday .add-slot').forEach(add=>{add.textContent='＋';add.setAttribute('aria-label',api.dateLabel(d)+' 종일 '+api.title+' 추가');});});
   host.style.removeProperty('--all-height');host.style.setProperty('--all-height',Math.max(70,...days.map(d=>d.querySelector('.sv-allday').scrollHeight))+'px');
   const grid=days[0]?.querySelector('.ag-tl-grid');if(!grid)return;
   const axis=grid.cloneNode(false);axis.classList.add('schedule-week-axis');axis.setAttribute('aria-hidden','true');
   grid.querySelectorAll('.tl-row-label').forEach(label=>axis.append(label.cloneNode(true)));
   host.querySelectorAll('.sv-day .tl-row-label').forEach(label=>label.remove());
   host.append(axis);axis.style.top=(grid.getBoundingClientRect().top-host.getBoundingClientRect().top)+'px';
   host.parentElement.scrollLeft=0;
  }

 root.OnekanCalendarUI={mount,month,eye,fitWeek,holiday:d=>HOLIDAYS_KR[d]||null,holidayHtml};
})(window);
