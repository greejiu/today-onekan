/* Integrated display only. Native kinds, IDs, occurrence dates and tables remain intact. */
window.createOnekanAllViews = api => {
 'use strict';
 const $=id=>document.getElementById(id),P=api.period,esc=api.escape,host=document.querySelector('.page[data-page="all"]');
 const types=[{id:'event',name:'일정'},{id:'todo',name:'할일'},{id:'habit',name:'습관'}],busy=new Set();
 let date=api.today(),mode='calendar',engine,cache=null,agenda=null;
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
   const target=[...host.querySelectorAll('[data-occurrence],[data-all-todo-check]')].find(b=>(b.dataset.occurrence||b.dataset.allTodoCheck)===row.id&&b.getClientRects().length)||$('allSaveStatus');target.focus?.({preventScroll:true});
  }catch(error){if(owner===api.user()){render();$('allSaveStatus').textContent='저장하지 못했어요. '+error.message;}}
  finally{busy.delete(key);if(opener.isConnected)opener.disabled=false;}
 }
 function wire(node){
  node.querySelectorAll('[data-all-todo-check]').forEach(b=>{b.onclick=e=>e.stopPropagation();b.onchange=()=>{const r=lookup(b.dataset.allTodoCheck),checked=b.checked;if(r)action(r,b,async()=>{await api.done(r.source_id,checked);return api.todos().find(t=>t.id===r.source_id)?.is_done===checked;});};});
  node.querySelectorAll('[data-habit-action]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=lookup(b.dataset.occurrence);if(r)action(r,b,()=>api.habits().perform(r,b.dataset.habitAction));});
 }
 function add(context){engine.cancel();const owner=api.user();api.choose(context,kind=>{if(api.page()==='all'&&owner===api.user())api.add(kind,context);});}
 function selectDate(value){date=value;engine.remember();render();}

 // ── 2026-10-10 '모두' 화면 설정(사용자별·이 화면 전용 저장) ──
 // 종류 눈(일정·할일·습관)은 월·주·일마다 따로, 범주·그룹 눈과 접힘은 기간과 관계없이 공통.
 // 주·일의 마지막 보기 방식(주=보드/타임라인, 일=시간블럭/타임라인)도 함께 기억. 다른 탭의 설정 키는 건드리지 않음.
 const LAYOUT_DEFAULTS={week:'board',day:'blocks',eyes:{month:{event:true,todo:false,habit:false},week:{event:true,todo:true,habit:true},day:{event:true,todo:true,habit:true}},hidden:{event:[],todo:[],habit:[]},holidays:true};
 let layout=null,layoutOwner;
 const layoutKey=()=>'tok_all_layout:'+api.user();
 function prefs(){
  const owner=api.user();if(layout&&layoutOwner===owner)return layout;
  layoutOwner=owner;let saved={};try{saved=JSON.parse(localStorage.getItem(layoutKey()))||{};}catch(_){saved={};}
  const D=LAYOUT_DEFAULTS,bool=(v,d)=>typeof v==='boolean'?v:d;
  layout={week:['board','timeline'].includes(saved.week)?saved.week:D.week,day:['blocks','timeline'].includes(saved.day)?saved.day:D.day,eyes:{},hidden:{},holidays:bool(saved.holidays,true)};
  for(const v of ['month','week','day']){layout.eyes[v]={};for(const t of types)layout.eyes[v][t.id]=bool(saved.eyes?.[v]?.[t.id],D.eyes[v][t.id]);}
  for(const t of types)layout.hidden[t.id]=Array.isArray(saved.hidden?.[t.id])?saved.hidden[t.id].filter(x=>typeof x==='string'):[];
  for(const v of ['month','week','day'])layout.eyes[v].event=true; // 일정은 범주 눈으로만 거름(종류 눈 없음)
  return layout;
 }
 function savePrefs(){try{if(api.user())localStorage.setItem(layoutKey(),JSON.stringify(prefs()));}catch(_){}}
 const view=()=>{const s=engine.state();return s.span==='month'?'month':s.days===7?'week':'day';};
 const subView=()=>view()==='week'?prefs().week:view()==='day'?prefs().day:'calendar';
 // 범주(일정)·그룹(할일·습관) 눈 — 원본 연결값 그대로, 연결 없음은 'default'(기본)
 const catKey=r=>(r.kind==='event'?r.category_id:r.kind==='todo'?r.tag_id:r.category_id)||'default';
 const catHidden=r=>r.kind==='event'&&prefs().hidden.event.includes(catKey(r)); // 2026-10-10 범주 눈은 일정만(할일·습관은 종류 눈)
 const pools={event:()=>api.groups().filter(g=>g.kind==='event'),todo:()=>api.categories(),habit:()=>api.categories()};
 const eyesOf=v=>prefs().eyes[v||view()];
 // 엔진 상태를 현재 기간의 눈·보기 방식에 맞춤(렌더 직전마다). 완료·건너뛴 항목도 보여주고 체크로 상태를 구분.
 function syncEngine(){const s=engine.state(),e=eyesOf();s.mode='calendar';s.completion='all';s.status='all';for(const t of types)s['show_'+t.id]=e[t.id];s.format=view()==='day'&&prefs().day==='blocks'?'blocks':'timeline';}

 // 2026-10-10 결 요청(구글 캘린더처럼): 접기 없이 제목 + 눈 목록.
 //  내 일정: 일정 범주(기본·병원…)별 눈, 할일 눈, 습관 눈 / 다른 캘린더: 대한민국 휴일 눈.
 //  할일·습관 눈은 월·주·일마다 따로(월 기본 꺼짐), 범주 눈·휴일 눈은 공통으로 기억. 일정은 범주 눈으로만 거름.
 function filterTree(){
  const L=prefs(),e=eyesOf(),v=view(),vName={month:'월',week:'주',day:'일'}[v];
  const eyeBtn=(attr,on,label,cls='')=>'<button type="button" class="aft-eye'+cls+'" '+attr+' aria-pressed="'+on+'" aria-label="'+esc(label)+' '+(on?'표시 중 · 숨기기':'숨김 · 표시하기')+'" title="'+esc(label)+' '+(on?'숨기기':'표시')+'">'+OnekanCalendarUI.eye(on)+'</button>';
  const row=(color,name,eye,on)=>'<li'+(on?'':' class="aft-off"')+'><span class="aft-dot" style="background:'+esc(color||'var(--line)')+'"></span><span class="aft-name">'+esc(name)+'</span>'+eye+'</li>';
  const section=(key,title,body,action='')=>'<section class="aft-kind" data-aft-kind="'+key+'"><div class="aft-title-row"><h3 class="aft-title">'+title+'</h3>'+action+'</div><ul class="aft-list" id="aftList-'+key+'">'+body+'</ul></section>';
  const catEdit=g=>'<button type="button" class="aft-cat-edit" data-aft-cat-edit="'+esc(g.id)+'" aria-label="'+esc(g.name)+' 범주 '+(g.id==='default'?'색상 수정':'이름·색상 수정')+'" title="수정">⋯</button>';
  const cats=[{id:'default',name:'기본',color:null},...pools.event().filter(g=>!g.is_archived).map(g=>({id:g.id,name:g.name,color:g.color}))];
  return '<p class="aft-scope">'+vName+' 보기 표시</p>'+
   section('mine','내 일정',cats.map(g=>{const shown=!L.hidden.event.includes(g.id);return row(g.color,g.name,catEdit(g)+eyeBtn('data-aft-cat="event|'+esc(g.id)+'"',shown,'일정 · '+g.name,' aft-cat-eye'),shown);}).join('')+
    row('var(--accent)','할일',eyeBtn('data-aft-eye="todo"',e.todo,'할일'),e.todo)+row('#3fae6a','습관',eyeBtn('data-aft-eye="habit"',e.habit,'습관'),e.habit),
    '<button type="button" class="aft-add" data-aft-add-cat aria-label="일정 범주 추가" title="범주 추가">＋</button>')+
   section('other','다른 캘린더',row('#e57373','대한민국 휴일',eyeBtn('data-aft-holiday="1"',L.holidays,'대한민국 휴일'),L.holidays));
 }
 function wireTree(box){
  const focus=box.contains(document.activeElement)?[...box.querySelectorAll('button')].indexOf(document.activeElement):-1;
  box.innerHTML=filterTree();
  box.querySelectorAll('[data-aft-eye]').forEach(b=>b.onclick=()=>{const e=eyesOf();e[b.dataset.aftEye]=!e[b.dataset.aftEye];savePrefs();render();});
  box.querySelectorAll('[data-aft-cat]').forEach(b=>b.onclick=()=>{const [k,g]=b.dataset.aftCat.split('|'),list=prefs().hidden[k],i=list.indexOf(g);if(i<0)list.push(g);else list.splice(i,1);savePrefs();render();});
  box.querySelector('[data-aft-add-cat]')?.addEventListener('click',e=>api.categoryAdd?.(e.currentTarget)); // 범주 추가·수정은 옛 일정 사이드바와 같은 창
  box.querySelectorAll('[data-aft-cat-edit]').forEach(b=>b.onclick=()=>api.categoryEdit?.(b.dataset.aftCatEdit,b));
  box.querySelectorAll('[data-aft-holiday]').forEach(b=>b.onclick=()=>{const L=prefs();L.holidays=!L.holidays;savePrefs();render();});
  if(focus>=0)box.querySelectorAll('button')[focus]?.focus({preventScroll:true});
 }
 function renderTrees(){sidebarTypes();if(!$('allFilterPanel').hidden)wireTree($('allFilterPanelBody'));}
 function sidebarTypes(){
  const existing=$('allSidebarTypes');if(existing)existing.hidden=api.page()!=='all';if(api.page()!=='all')return;const nav=$('dedicatedSidebarNav');if(!nav)return;
  let box=$('allSidebarTypes');if(!box){box=document.createElement('div');box.id='allSidebarTypes';box.className='all-filter-tree';box.setAttribute('aria-label','표시 설정');nav.append(box);}
  box.hidden=false;wireTree(box);
 }

 // ── 주간 보드: 월~일 7열, 하루종일 먼저 → 시간순. PC는 끌어서 날짜 이동(시간·기간 길이 유지), 모바일은 가로로 넘김 ──
 const WD=['일','월','화','수','목','금','토'];
 const weekDays=()=>{const r=engine.range();return Array.from({length:7},(_,i)=>P.addDays(r.start,i));};
 const timeOn=(r,d)=>{const p=P.read(r.kind,r);if(p.allDay)return {all:true,label:'종일',min:-1};const c=P.clip(r.kind,r,d);return {all:false,label:p.startDate===d?p.startTime:'이어짐',min:c?c.start_minute:0};};
 const dayItems=(list,d)=>list.filter(r=>P.overlap(r.kind,r,d)).map(r=>({r,t:timeOn(r,d)})).sort((a,b)=>a.t.min-b.t.min||(a.r.title||'').localeCompare(b.r.title||'','ko'));
 function boardRows(){const s=engine.state();return rows().filter(r=>!catHidden(r)&&accept(r,s));}
 // 카드 = 지금 한칸 목록 줄 그대로(손잡이·체크·그룹색 제목·시각·⋯, 같은 체크·이름 수정 규칙). 보드 표시용 속성만 덧붙임.
 function boardCard(r,t,d){
  return api.rowHtml({kind:r.kind,id:r.source_id,name:r.title||'',done:r.kind==='todo'?!!r.is_done:r.kind==='habit'&&r.status==='done',cat_id:r.kind==='todo'?r.tag_id:r.category_id,occurrence_date:r.kind==='habit'?r.action_date:null,start_minute:t.all?null:t.min,show_time:true},d,' data-awb-id="'+esc(r.id)+'" data-awb-date="'+d+'"');
 }
 function wireAdd(slot,kind){const d=slot.dataset.awbAdd;api.addSlot(slot,d,{rerender:async()=>render(),reopen:k=>{const next=$('allWeekBoard').querySelector('[data-awb-add="'+d+'"]');if(next)wireAdd(next,k);}},kind);}
 function renderBoard(){
  const box=$('allWeekBoard'),days=weekDays(),list=boardRows(),today=api.today(),scroller=box.querySelector('.awb-scroll'),keepX=scroller?scroller.scrollLeft:null,sameWeek=box.dataset.week===days[0];
  box.innerHTML='<div class="awb-scroll" tabindex="0" aria-label="주간 보드, 날짜 열을 가로로 넘겨 볼 수 있어요"><div class="awb-grid">'+days.map(d=>{
   const items=dayItems(list,d),label=Number(d.slice(5,7))+'/'+Number(d.slice(8));
   return '<section class="awb-col'+(d===today?' is-today':'')+(prefs().holidays&&OnekanCalendarUI.holiday(d)?' is-holiday':'')+(d===date?' is-selected':'')+'" data-awb-col="'+d+'" aria-label="'+esc(api.dateLabel(d))+'"><header class="awb-head"><button type="button" data-awb-select="'+d+'"><span class="awb-dow">'+WD[new Date(d+'T12:00:00').getDay()]+'</span> <strong>'+label+'</strong>'+(d===today?' <span class="today-badge">오늘</span>':'')+'</button>'+OnekanCalendarUI.holidayHtml(d,{holidays:()=>prefs().holidays},esc)+'</header>'+
    '<div class="awb-body">'+items.map(x=>boardCard(x.r,x.t,d)).join('')+api.addSlotHtml('data-awb-add="'+d+'"',!items.length)+'</div></section>';
  }).join('')+'</div></div>';
  box.dataset.week=days[0];
  // 지금 한칸과 같은 규칙: 줄 누르기 = 이름 수정(전체 수정·건너뛰기는 ⋯ 메뉴), 체크 = 완료, 빈칸 = 할일 입력창(오른쪽 클릭 = 종류 메뉴)
  api.wireRows(box);
  box.querySelectorAll('[data-awb-id]').forEach(row=>row.addEventListener('click',e=>{if(performance.now()<suppressClick||e.target.closest('input,.item-more,.habit-skip-mark,.inline-add-wrap'))return;const r=lookup(row.dataset.awbId);if(r)api.rename(row,r.kind,r.source_id,()=>render());}));
  box.querySelectorAll('[data-awb-add]').forEach(b=>wireAdd(b));
  box.querySelectorAll('[data-awb-select]').forEach(b=>b.onclick=()=>selectDate(b.dataset.awbSelect));
  const scroll=box.querySelector('.awb-scroll');
  if(keepX!=null&&sameWeek)scroll.scrollLeft=keepX;
  else if(matchMedia('(max-width:760px)').matches){const col=scroll.querySelector('[data-awb-col="'+(days.includes(date)?date:days.includes(today)?today:days[0])+'"]');if(col)scroll.scrollLeft=col.offsetLeft-scroll.firstElementChild.offsetLeft;}
 }
 // 끌어서 옮기기(마우스): 일정·할일만, 반복 항목·습관 회차는 수정창으로 안내. 같은 시각·같은 기간 길이로 날짜만 바꿈.
 let drag=null,suppressClick=0;
 const status=m=>{$('allSaveStatus').textContent=m;};
 function dropDate(x,y){const el=document.elementFromPoint(x,y);if(!el||!host.contains(el))return null;const c=el.closest('[data-awb-col],.cal-cell[data-date],[data-all-date],[data-sv-date]');return c?(c.dataset.awbCol||c.dataset.date||c.dataset.allDate||c.dataset.svDate):null;}
 async function moveRow(r,from,to){
  if(r.kind==='habit'){status('습관은 날짜를 끌어서 옮길 수 없어요. 수정창에서 바꿔 주세요.');return;}
  if(r.repeat_unit){status('반복 항목은 수정창에서 날짜를 바꿔 주세요.');api.edit(r.kind,r.source_id);return;}
  const base=P.read(r.kind,r);if(!base.startDate)return;
  const patch=P.shift(r.kind,r,P.addDays(base.startDate,P.days(from,to)),null);
  const owner=api.user();status('저장 중…');host.setAttribute('aria-busy','true');
  try{
   const res=await api.sb.from(r.kind==='event'?'tok_events':'tok_todos').update(patch).eq('id',r.source_id).eq('user_id',owner).select('id').single();
   if(res.error||!res.data)throw Error(res.error?.message||'항목을 찾을 수 없어요.');
   if(owner!==api.user())return;
   await api.reload();status('날짜를 옮겼어요.');
  }catch(error){if(owner===api.user()){render();status('저장하지 못했어요. 원래 날짜를 유지합니다. '+error.message);}}
  finally{host.removeAttribute('aria-busy');}
 }
 function dragDown(e){
  if(api.page()!=='all'||e.button!==0||e.pointerType==='touch'||matchMedia('(max-width:760px)').matches)return;
  const card=e.target.closest('#allWeekBoard [data-awb-id]');if(!card||e.target.closest('input,.item-more,.habit-skip-mark,.inline-add-wrap'))return;
  drag={card,x:e.clientX,y:e.clientY,moved:false,pointer:e.pointerId};
 }
 function dragMove(e){
  if(!drag||e.pointerId!==drag.pointer)return;if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
  if(!drag.moved){drag.moved=true;drag.card.classList.add('awb-dragging');drag.ghost=drag.card.cloneNode(true);drag.ghost.className+=' awb-ghost';drag.ghost.removeAttribute('id');document.body.append(drag.ghost);}
  drag.ghost.style.left=e.clientX+10+'px';drag.ghost.style.top=e.clientY+10+'px';
  host.querySelectorAll('.awb-drop').forEach(c=>c.classList.remove('awb-drop'));const d=dropDate(e.clientX,e.clientY);
  if(d)host.querySelector('[data-awb-col="'+d+'"],.cal-cell[data-date="'+d+'"],[data-all-date="'+d+'"]')?.classList.add('awb-drop');
  e.preventDefault();
 }
 function dragEnd(e,cancelled){
  if(!drag||(e&&e.pointerId!==drag.pointer))return;const d=drag;drag=null;
  d.card.classList.remove('awb-dragging');d.ghost?.remove();host.querySelectorAll('.awb-drop').forEach(c=>c.classList.remove('awb-drop'));
  if(!d.moved||cancelled)return;suppressClick=performance.now()+400;
  const to=dropDate(e.clientX,e.clientY);if(!to)return;
  const r=lookup(d.card.dataset.awbId),from=d.card.dataset.awbDate;if(r&&from!==to)moveRow(r,from,to);
 }
 document.addEventListener('pointerdown',dragDown,true);document.addEventListener('pointermove',dragMove,{passive:false});
 document.addEventListener('pointerup',e=>dragEnd(e,false),true);document.addEventListener('pointercancel',e=>dragEnd(e,true));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();dragEnd(null,true);}},true);

 function render(){
  if(!engine||!$('allSubTabs'))return;cache=null;syncEngine();const state=engine.state(),v=view(),sub=subView();
  for(const b of $('allViewTabs').querySelectorAll('button[data-tab]')){b.classList.toggle('active',b.dataset.tab===mode);b.setAttribute('aria-pressed',String(b.dataset.tab===mode));}
  $('allCollection').hidden=true;$('allCalendarMode').hidden=false;
  $('allMonthLabel').textContent=state.span==='month'?Number(date.slice(0,4))+'년 '+Number(date.slice(5,7))+'월':engine.range().start+' ~ '+engine.range().end;
  const subBox=$('allSubTabs'),subs=v==='week'?[['board','보드'],['timeline','타임라인']]:v==='day'?[['blocks','시간블럭'],['timeline','타임라인']]:[];
  subBox.hidden=!subs.length;subBox.innerHTML=subs.map(([k,n])=>'<button type="button" data-all-sub="'+k+'" aria-pressed="'+(sub===k)+'" class="'+(sub===k?'active':'')+'">'+n+'</button>').join('');
  subBox.querySelectorAll('[data-all-sub]').forEach(b=>b.onclick=()=>{prefs()[view()]=b.dataset.allSub;savePrefs();render();});
  const e=eyesOf(),catIds=['default',...pools.event().filter(g=>!g.is_archived).map(g=>g.id)],allOff=!e.todo&&!e.habit&&catIds.every(id=>prefs().hidden.event.includes(id)); // 일정 범주·할일·습관 눈이 모두 꺼짐
  $('allNotice').innerHTML=allOff?'<span>표시할 항목이 꺼져 있어요</span> <button type="button" class="btn-ghost" id="allShowAll">모두 표시</button>':'';
  if(allOff)$('allShowAll').onclick=()=>{for(const t of types)e[t.id]=true;prefs().hidden.event=[];savePrefs();render();};
  const board=v==='week'&&sub==='board',homeDay=v==='day';
  $('allWeekBoard').hidden=!board;$('allCalendarMode').classList.toggle('all-board-mode',board||homeDay);$('allHomeDay').hidden=!homeDay;
  if(board){engine.controls();renderBoard();}else if(homeDay)engine.controls();else engine.calendar();
  // 일 보기 = 지금 한칸의 타임라인·시간블럭을 그대로 빌려 씀(클릭·끌기·추가 규칙이 같음). 표시는 이 화면의 종류·범주·그룹 눈.
  const hidden=prefs().hidden;
  api.homeDay?.(homeDay&&api.page()==='all'?$('allHomeDay'):null,{owner:'all',date,sub,filter:it=>!!e[it.kind]&&!(hidden[it.kind]||[]).includes(it.cat_id||'default'),filterKey:JSON.stringify([e,hidden])});
  renderTrees();agenda?.render();
 }
 const preview=document.createElement('div');preview.id='allDragPreview';preview.className='sv-drag-preview';preview.hidden=true;preview.innerHTML='<span id="allDragText"></span><br><button type="button" id="allDragCancel">취소 (Esc)</button>';document.body.append(preview);
 engine=window.createOnekanItemViews({...api,pageName:'all',sharedRange:true,title:'항목',id,kindOf:r=>r.kind,types:()=>types,
  allowDayBlocks:true,weekStartsMonday:true,singleMonthAdd:true,holidays:()=>prefs().holidays,
  // 월 달력(PC): 날짜 숫자 → 그날 일 보기, 빈 공간 → 그날 추가 창(singleMonthAdd)
  onMonthDate:d=>{const s=engine.state();s.span='day';s.days=1;engine.resetRange();date=d;engine.remember();render();},
  defaults:{mode:'calendar',span:'month',group:'type',board:'type',completion:'all',status:'all',undated:false,show_event:true,show_todo:true,show_habit:true},
  preferenceOptions:{group:['none','date','type','group','category','project'],board:['type','group','category','project'],show_event:[true,false],show_todo:[true,false],show_habit:[true,false]},
  date:()=>date,month,mode:()=>mode,setMode:v=>{mode='calendar';},restoreDate:v=>{date=/^\d{4}-\d{2}-\d{2}$/.test(v)?v:api.today();},changeMode:v=>{mode='calendar';render();api.sidebar();},render,selectDate,
  goMonth:n=>{const [y,m]=date.split('-').map(Number),d=new Date(y,m-1+n,1);selectDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01');},
  rows,groups,groupId,categoryId,accept,visible:r=>!catHidden(r),matches:()=>true,endDate,check,wire,canMove:r=>r.kind!=='habit',
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

 // ── 상단: 월 / 주 / 일 | 갤러리(이미지 저장). 목록·보드 탭과 옛 조회 도구는 이 화면에서 숨김(다른 탭은 그대로) ──
 const tabs=$('allViewTabs');
 tabs.querySelectorAll('[data-tab="list"],[data-tab="board"]').forEach(b=>{b.hidden=true;b.style.display='none';b.tabIndex=-1;});
 const sep=document.createElement('span');sep.className='all-tab-sep';sep.setAttribute('aria-hidden','true');
 const exportBtn=document.createElement('button');exportBtn.type='button';exportBtn.id='allExportBtn';exportBtn.className='all-icon-btn';exportBtn.title='이미지 저장';exportBtn.setAttribute('aria-label','이미지 저장');
 exportBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
 tabs.append(sep,exportBtn);
 const subTabs=document.createElement('div');subTabs.id='allSubTabs';subTabs.className='view-toggle all-sub-tabs';subTabs.setAttribute('role','group');subTabs.setAttribute('aria-label','보기 방식');
 const tools=document.createElement('div');tools.className='all-tools';
 // 모바일은 글자를 숨기고 아이콘만(이름은 aria-label·title) — 위쪽 줄 높이 줄이기
 const ICON={filter:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="7" y1="12" x2="17" y2="12"></line><line x1="10" y1="17" x2="14" y2="17"></line></svg>',panel:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="14" y1="4" x2="14" y2="20"></line></svg>'};
 tools.innerHTML='<button type="button" id="allFilterBtn" class="all-chip-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="allFilterPanel" aria-label="표시 설정" title="표시 설정">'+ICON.filter+'<span class="all-chip-label">표시 설정</span></button><button type="button" id="allPanelBtn" class="all-chip-btn" aria-haspopup="dialog" aria-controls="allSideAgenda" aria-label="다가오는 · 언젠가" title="다가오는 · 언젠가">'+ICON.panel+'<span class="all-chip-label">다가오는 · 언젠가</span></button>';
 tools.prepend(subTabs);tabs.after(tools); // 보조 보기(주: 보드/타임라인, 일: 시간블럭/타임라인)는 표시 설정 버튼과 같은 줄
 ['allCalendarOptions','allCollectionOptions','allRangeLabel','allMonthCount','allJumpRow'].forEach(k=>{const n=$(k);if(n){n.hidden=true;n.classList.add('all-retired');}});
 $('allFilters').querySelectorAll('label').forEach(l=>{l.hidden=true;l.classList.add('all-retired');});
 // '＋ 추가'는 날짜 줄 오른쪽 끝으로 옮기고, 남은 옛 도구 줄은 숨김(한 줄 절약)
 const addBtn=$('allAddBtn');addBtn.classList.add('all-add-btn');addBtn.setAttribute('aria-label','추가');addBtn.innerHTML='<span aria-hidden="true">＋</span><span class="all-chip-label"> 추가</span>';$('allPrevBtn').parentElement.append(addBtn);$('allFilters').classList.add('all-retired');
 // 왼쪽을 접었거나 모바일일 때 여는 표시 설정 패널(사이드바와 같은 목록)
 const filterPanel=document.createElement('div');filterPanel.id='allFilterPanel';filterPanel.className='all-filter-panel';filterPanel.hidden=true;filterPanel.setAttribute('role','dialog');filterPanel.setAttribute('aria-label','표시 설정');
 filterPanel.innerHTML='<div class="afp-head"><strong>표시 설정</strong><button type="button" id="allFilterClose" aria-label="표시 설정 닫기">✕</button></div><div id="allFilterPanelBody" class="all-filter-tree"></div>';
 tools.append(filterPanel);
 const openFilter=open=>{filterPanel.hidden=!open;$('allFilterBtn').setAttribute('aria-expanded',String(open));if(open){wireTree($('allFilterPanelBody'));$('allFilterClose').focus({preventScroll:true});}};
 $('allFilterBtn').onclick=()=>openFilter(filterPanel.hidden);$('allFilterClose').onclick=()=>{openFilter(false);$('allFilterBtn').focus({preventScroll:true});};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!filterPanel.hidden){openFilter(false);$('allFilterBtn').focus({preventScroll:true});}});
 document.addEventListener('pointerdown',e=>{if(!filterPanel.hidden&&!filterPanel.contains(e.target)&&e.target!==$('allFilterBtn'))openFilter(false);});
 const board=document.createElement('div');board.id='allWeekBoard';board.className='all-week-board home-loan';board.hidden=true;$('allCalendarMode').prepend(board);
 const homeDayHost=document.createElement('div');homeDayHost.id='allHomeDay';homeDayHost.className='home-loan all-home-day';homeDayHost.hidden=true;board.after(homeDayHost);
 exportBtn.onclick=()=>api.exportView?.(exportModel(),exportBtn);

 // 이미지 저장용 현재 화면 모델(기간·보기·필터 그대로, 스크롤 밖 항목 포함)
 function exportModel(){
  cache=null;syncEngine();const v=view(),s=engine.state(),list=rows().filter(r=>!catHidden(r)&&accept(r,s)),item=(r,d)=>{const t=timeOn(r,d);return {kind:r.kind,title:r.title||'',time:t.label,done:!!(r.is_done||r.status==='done'),skipped:r.status==='skipped',color:api.color(r)||null,cat_id:r.kind==='event'?r.category_id:r.kind==='todo'?r.tag_id:r.category_id,id:r.source_id};};
  if(v==='day')return {view:'day',date,sub:prefs().day,eyes:{...eyesOf()},hidden:{event:[...prefs().hidden.event],todo:[...prefs().hidden.todo],habit:[...prefs().hidden.habit]}};
  if(v==='week')return {view:'week',sub:prefs().week,days:weekDays().map(d=>({date:d,items:dayItems(list,d).map(x=>item(x.r,d))}))};
  const {ms,me}=month(),first=P.addDays(ms,-new Date(ms+'T12:00:00').getDay()),last=P.addDays(me,6-new Date(me+'T12:00:00').getDay()),days=[];
  for(let d=first;d<=last;d=P.addDays(d,1))days.push({date:d,outside:d<ms||d>me,items:dayItems(list,d).map(x=>item(x.r,d))});
  return {view:'month',month:ms,days};
 }

 // ── 오른쪽 '다가오는 · 언젠가' = 지금 한칸의 다가오는·담아두기를 그대로 빌려 씀 ──
 agenda=window.createOnekanSideAgenda({pageName:'all',host,openButton:$('allPanelBtn'),user:api.user,page:api.page,mountLists:api.mountLists});
 return {...engine,render,selectDate,sidebarTypes,displayRows:rows,prefs,view,exportModel,agenda,dropDate:(x,y)=>api.page()==='all'&&view()!=='day'?dropDate(x,y):null};
};

/* 오른쪽 '다가오는 · 언젠가' 칸 — '모두'·'할일' 공용 껍데기(목록 전환·접기·모바일 패널)만 둠.
   안의 목록은 새로 그리지 않고 지금 한칸의 다가오는·담아두기를 api.mountLists로 그대로 옮겨 붙임(같은 모양·클릭·끌기·추가 규칙).
   마지막 목록과 접힘 상태는 화면·사용자별로 기억(tok_side_agenda:<화면>:<사용자>). 모바일은 버튼으로 여는 아래쪽 패널. */
window.createOnekanSideAgenda = api => {
 'use strict';
 const page=api.pageName,host=api.host,mobile=matchMedia('(max-width:760px)');
 let owner,state={list:'upcoming',closed:false},mobileOpen=false;
 const key=()=>'tok_side_agenda:'+page+':'+api.user();
 function load(){if(owner===api.user())return;owner=api.user();let s={};try{s=JSON.parse(localStorage.getItem(key()))||{};}catch(_){s={};}state={list:s.list==='someday'?'someday':'upcoming',closed:s.closed===true};}
 function save(){try{if(api.user())localStorage.setItem(key(),JSON.stringify(state));}catch(_){}}
 const shell=document.createElement('div');shell.className='sa-shell';
 const main=document.createElement('div');main.className='sa-main';
 while(host.firstChild)main.append(host.firstChild);
 const aside=document.createElement('aside');aside.className='sa-panel';aside.id={all:'allSideAgenda',todos:'todoSideAgenda',habits:'habitSideAgenda'}[page]||page+'SideAgenda';aside.setAttribute('aria-label','다가오는 · 언젠가');
 aside.innerHTML='<header class="sa-head"><div class="view-toggle sa-tabs" role="group" aria-label="목록 선택"><button type="button" data-sa-list="upcoming">다가오는</button><button type="button" data-sa-list="someday">언젠가</button></div><button type="button" class="sa-close" aria-label="다가오는 · 언젠가 접기">→</button></header><div class="sa-body home-loan"></div>';
 const reopen=document.createElement('button');reopen.type='button';reopen.className='sa-reopen';reopen.textContent='←';reopen.setAttribute('aria-label','다가오는 · 언젠가 펼치기');reopen.setAttribute('aria-controls',aside.id);
 shell.append(main,aside,reopen);host.append(shell);
 const body=aside.querySelector('.sa-body');
 aside.querySelectorAll('[data-sa-list]').forEach(b=>b.onclick=()=>{state.list=b.dataset.saList;save();render();});
 aside.querySelector('.sa-close').onclick=()=>{if(mobile.matches){setMobile(false);return;}state.closed=true;save();render();reopen.focus({preventScroll:true});};
 reopen.onclick=()=>{state.closed=false;save();render();aside.querySelector('.sa-close').focus({preventScroll:true});};
 function setMobile(open){mobileOpen=open;aside.classList.toggle('sa-mobile-open',open);api.openButton?.setAttribute('aria-expanded',String(open));if(open)aside.querySelector('.sa-close').focus({preventScroll:true});else api.openButton?.focus({preventScroll:true});render();}
 if(api.openButton)api.openButton.onclick=()=>setMobile(!mobileOpen);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobileOpen&&mobile.matches)setMobile(false);});
 mobile.addEventListener('change',()=>{if(!mobile.matches&&mobileOpen){mobileOpen=false;aside.classList.remove('sa-mobile-open');}render();});
 function render(){
  load();const desktop=!mobile.matches,visible=api.page()===page;
  shell.classList.toggle('sa-closed',desktop&&state.closed);
  aside.hidden=!visible||(desktop?state.closed:!mobileOpen);reopen.hidden=!visible||!desktop||!state.closed;
  if(api.openButton){api.openButton.hidden=!visible||desktop;}
  aside.querySelectorAll('[data-sa-list]').forEach(b=>{const on=b.dataset.saList===state.list;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  aside.querySelector('.sa-close').textContent=desktop?'→':'✕';aside.querySelector('.sa-close').setAttribute('aria-label',desktop?'다가오는 · 언젠가 접기':'다가오는 · 언젠가 닫기');
  // 보이는 쪽만 빌려 가고, 숨으면 이 칸에 있던 목록은 지금 한칸 제자리로
  if(visible&&!aside.hidden)api.mountLists(state.list,body);else api.mountLists(null,body);
 }
 return {render,state:()=>({...state}),open:setMobile,panelId:aside.id};
};
