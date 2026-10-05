/* Todo-only navigation rail and group drops. Date gestures remain in item-views. */
window.createOnekanTodoSidebar = api => {
 'use strict';
 const sidebar=document.querySelector('.sidebar'),host=document.querySelector('.page[data-page="todos"]'),desktop=matchMedia('(min-width:761px)');
 const rail=document.createElement('nav');rail.id='todoIconRail';rail.hidden=true;rail.setAttribute('aria-label','전체 공간 이동');
 let collapsed=false;
 const toggle=document.createElement('button');toggle.type='button';toggle.id='sidebarRailToggle';toggle.className='navitem';toggle.setAttribute('aria-controls','mainSidebarNav dedicatedSidebarNav');
 toggle.onclick=()=>{collapsed=!collapsed;if(!collapsed)api.expand(false);sync();toggle.focus({preventScroll:true});};rail.prepend(toggle);
 const more=document.createElement('button');more.type='button';more.id='sidebarRailMore';more.className='navitem';more.title='더보기';more.setAttribute('aria-label','더보기');more.setAttribute('aria-expanded','false');more.innerHTML='<svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';rail.append(more);
 const popup=document.createElement('div');popup.id='sidebarRailMoreMenu';popup.setAttribute('popover','auto');popup.setAttribute('aria-label','더보기 메뉴');
 document.body.append(popup);more.setAttribute('aria-controls',popup.id);
 more.onclick=()=>{if(popup.matches(':popover-open'))popup.hidePopover();else{const r=more.getBoundingClientRect();popup.style.left=(r.right+8)+'px';popup.style.top=Math.max(8,Math.min(r.top,innerHeight-420))+'px';popup.showPopover();popup.querySelector('button')?.focus();}};
 popup.addEventListener('toggle',()=>more.setAttribute('aria-expanded',String(popup.matches(':popover-open'))));
 popup.addEventListener('keydown',e=>{if(e.key==='Escape'){popup.hidePopover();more.focus({preventScroll:true});e.preventDefault();}});
 const moreLabel=document.createElement('span');moreLabel.className='todo-rail-label';moreLabel.textContent='더보기';more.append(moreLabel);
 sidebar.prepend(rail);
 const feedback=document.createElement('p');feedback.id='todoGroupMoveStatus';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.getElementById('dedicatedSidebarNav').append(feedback);
 const ghost=document.createElement('div');ghost.className='todo-group-ghost';ghost.hidden=true;document.body.append(ghost);
 let drag=null,busy=false,suppressed=0,owner=api.user();
 const enabled=()=>desktop.matches&&!collapsed&&api.page()==='todos'&&api.dedicated()&&api.projectsReady();
 function clear(){drag?.source.classList.remove('todo-group-dragging');document.querySelectorAll('.todo-group-target').forEach(el=>el.classList.remove('todo-group-target'));ghost.hidden=true;drag=null;}
 function sync(){sidebar.classList.add('todo-rail');sidebar.classList.toggle('view-sidebar',['all','schedule','todos','habits'].includes(api.page()));sidebar.classList.toggle('rail-collapsed',collapsed);sidebar.classList.toggle('rail-details',api.dedicated()&&!collapsed);sidebar.classList.toggle('todo-details',api.page()==='todos');rail.hidden=!desktop.matches;toggle.textContent=collapsed?'→':'←';toggle.title=collapsed?'전체 메뉴 펼치기':'사이드바 접기';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(!collapsed));more.classList.toggle('active',!OnekanNavigation.primary().some(r=>r.page===api.page()));feedback.hidden=api.page()!=='todos';if(popup.matches(':popover-open'))popup.hidePopover();if(!enabled())clear();if(owner!==api.user()){owner=api.user();clear();feedback.textContent='';}}
 function target(x,y){
  const button=document.elementFromPoint(x,y)?.closest('#classificationSideHost [data-project-select]');
  if(!button||button.dataset.projectSelect==='all')return null;
  const id=button.dataset.projectSelect;
  if(id!=='none'&&!api.projects().some(p=>p.id===id&&api.canConnect(p)))return null;
  return {id:id==='none'?null:id,element:button,name:button.textContent.trim()};
 }
 async function save(row,drop){
  if(busy||(row.project_id||null)===drop.id)return;
  const user=api.user();if(!user||!api.projectsReady()){feedback.textContent='프로젝트를 다시 불러온 후 이동해주세요.';return;}
  busy=true;feedback.textContent='프로젝트로 옮기는 중…';
  try{
   const result=await api.sb.from('tok_todos').update({project_id:drop.id}).eq('id',row.id).eq('user_id',user).select('id').single();
   if(result.error||!result.data)throw Error(result.error?.message||'할일을 찾지 못했어요.');
   if(user!==api.user())return;
   await api.reload();if(user===api.user())feedback.textContent=drop.name+'으로 옮겼어요.';
  }catch(error){if(user===api.user())feedback.textContent='옮기지 못했어요. 기존 프로젝트 연결을 유지합니다. '+error.message;}
  finally{busy=false;}
 }
 // Window capture observes calendar drags before document handlers. It takes
 // ownership only after entering a sidebar group, cancelling the date gesture.
 window.addEventListener('pointerdown',e=>{
  if(!enabled()||busy||e.button!==0||e.pointerType==='touch'||!host.contains(e.target)||e.target.closest('input,.item-more,[data-sv-resize],[data-habit-action]'))return;
  const source=e.target.closest('[data-menu-kind="todo"][data-menu-id]');if(!source||!document.getElementById('todoUnifiedView').contains(source))return;
  const row=api.rows().find(r=>r.id===source.dataset.menuId);if(!row)return;
  drag={source,row,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false,claimed:false,user:api.user()};
 },true);
 window.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;
  if(!enabled()||drag.user!==api.user()){clear();return;}
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
  if(!drag.moved)window.getSelection()?.removeAllRanges();
  drag.moved=true;const drop=target(e.clientX,e.clientY);
  document.querySelectorAll('.todo-group-target').forEach(el=>el.classList.remove('todo-group-target'));drop?.element.classList.add('todo-group-target');
  if(drop&&!drag.claimed){api.cancel();drag.claimed=true;}
  if(drag.claimed||api.mode()!=='calendar'){
   drag.source.classList.add('todo-group-dragging');ghost.hidden=false;ghost.textContent=drop?drop.name+'으로 이동 · Esc 취소':'프로젝트에 놓아 이동 · Esc 취소';ghost.style.left=Math.max(0,Math.min(e.clientX+12,innerWidth-280))+'px';ghost.style.top=Math.max(0,Math.min(e.clientY+12,innerHeight-90))+'px';
   e.preventDefault();e.stopImmediatePropagation();
  }
 },{capture:true,passive:false});
 window.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;
  const d=drag,drop=enabled()?target(e.clientX,e.clientY):null;clear();
  if(!d.moved)return;
  if(d.claimed||api.mode()!=='calendar'||drop){suppressed=performance.now()+500;api.cancel();e.preventDefault();e.stopImmediatePropagation();if(drop&&d.user===api.user())void save(d.row,drop);}
 },true);
 function cancel(){if(drag?.moved){suppressed=performance.now()+500;api.cancel();}clear();}
 window.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){cancel();e.preventDefault();e.stopImmediatePropagation();}},true);
 window.addEventListener('click',e=>{if(api.page()==='todos'&&e.isTrusted&&!e.target.closest('.iv-controls')&&performance.now()<suppressed&&(host.contains(e.target)||document.getElementById('classificationSideHost').contains(e.target))){e.preventDefault();e.stopImmediatePropagation();}},true);
 host.addEventListener('dragstart',e=>{if(drag)e.preventDefault();});
 function renderNavigation(){
  rail.querySelectorAll('[data-page]').forEach(el=>el.remove());
  OnekanNavigation.primary().forEach(item=>{const el=OnekanNavigation.button(item,page=>{if(api.page()!==page)api.navigate(page);else api.expand(true);el.focus({preventScroll:true});});el.querySelector('span').className='todo-rail-label';rail.insertBefore(el,more);});
  popup.replaceChildren(...OnekanNavigation.overflow().map(item=>OnekanNavigation.button(item,page=>{popup.hidePopover();api.navigate(page);more.focus({preventScroll:true});})));
  rail.querySelectorAll('[data-page]').forEach(el=>{const active=el.dataset.page===api.page();el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');});sync();
 }
 renderNavigation();
 desktop.addEventListener('change',sync);sync();return {sync,cancel,renderNavigation};
};
