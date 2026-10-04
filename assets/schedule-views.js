/* Schedule adapter keeps the existing public entry point and geometry test API. */
(function(root){
 if(typeof module!=='undefined'){module.exports=require('./item-views.js');return;}
 root.createOnekanScheduleViews=api=>{
  let engine;
  const view=()=>{const s=engine?.state();return s?.mode==='list'?'list':s?.span==='day'?(s.days===7?'week':'day'):'month';};
  const sync=()=>document.querySelectorAll('[data-schedule-view]').forEach(b=>{const active=b.dataset.scheduleView===view();b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  const normalizeState=s=>{if(s.mode==='board')s.mode='list';s.format='timeline';s.days=s.days>1?7:1;if(s.group==='category')s.group='date';};
  engine=root.createOnekanItemViews({...api,normalizeState,
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
  sync();return {...engine,selectView,currentView:view,focusTarget:()=>document.querySelector('#scheduleSidebarNav [data-schedule-view="'+view()+'"]')};
 };
})(typeof window==='undefined'?globalThis:window);
