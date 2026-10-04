/* Todo-only navigation rail and group drops. Date gestures remain in item-views. */
window.createOnekanTodoSidebar = api => {
 'use strict';
 const sidebar=document.querySelector('.sidebar'),host=document.querySelector('.page[data-page="todos"]'),desktop=matchMedia('(min-width:761px)');
 const rail=document.createElement('nav');rail.id='todoIconRail';rail.hidden=true;rail.setAttribute('aria-label','전체 공간 이동');
 for(const source of document.querySelectorAll('#sidebarHomeNav button[data-page],#mainSidebarNav>button[data-page],#mainSidebarNav>hr')){
  const button=source.cloneNode(true);button.removeAttribute('id');
  if(button.matches('button')){
   const label=source.textContent.trim(),icon=source.querySelector('svg')?.cloneNode(true),name=document.createElement('span');
   name.className='todo-rail-label';name.textContent=label;button.replaceChildren();if(icon){icon.setAttribute('aria-hidden','true');button.append(icon);}button.append(name);button.title=label;button.setAttribute('aria-label',label);
   button.onclick=()=>{if(api.page()!==button.dataset.page)api.navigate(button.dataset.page);else api.expand(true);if(rail.hidden){const next=button.dataset.page==='home'?document.querySelector('#sidebarHomeNav button'):document.getElementById('sidebarAllMenuBtn');next?.focus({preventScroll:true});}};
  }
  rail.append(button);
 }
 sidebar.prepend(rail);
 const feedback=document.createElement('p');feedback.id='todoGroupMoveStatus';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.getElementById('dedicatedSidebarNav').append(feedback);
 const ghost=document.createElement('div');ghost.className='todo-group-ghost';ghost.hidden=true;document.body.append(ghost);
 let drag=null,busy=false,suppressed=0,owner=api.user();
 const enabled=()=>desktop.matches&&api.page()==='todos'&&api.dedicated();
 function clear(){drag?.source.classList.remove('todo-group-dragging');document.querySelectorAll('.todo-group-target').forEach(el=>el.classList.remove('todo-group-target'));ghost.hidden=true;drag=null;}
 function sync(){const active=api.page()==='todos'&&api.dedicated();sidebar.classList.toggle('todo-rail',active);rail.hidden=!active;feedback.hidden=api.page()!=='todos';if(!enabled())clear();if(owner!==api.user()){owner=api.user();clear();feedback.textContent='';}}
 function target(x,y){
  const button=document.elementFromPoint(x,y)?.closest('#classificationSideHost [data-group-select]');
  if(!button||button.dataset.groupSelect==='all')return null;
  const id=button.dataset.groupSelect;
  if(id!=='none'&&!api.classification().groups().some(g=>g.id===id&&g.kind==='todo'&&!g.is_archived))return null;
  return {id: id==='none'?null:id,element:button.closest('[data-group-row]')||button,name:button.textContent.trim()};
 }
 async function save(row,drop){
  if(busy||(row.group_id||null)===drop.id)return;
  const user=api.user();if(!user||!api.classification().isReady()){feedback.textContent='그룹을 다시 불러온 후 이동해주세요.';return;}
  busy=true;feedback.textContent='그룹을 옮기는 중…';
  try{
   const result=await api.sb.from('tok_todos').update({group_id:drop.id}).eq('id',row.id).eq('user_id',user).select('id').single();
   if(result.error||!result.data)throw Error(result.error?.message||'할일을 찾지 못했어요.');
   if(user!==api.user())return;
   await api.reload();if(user===api.user())feedback.textContent=drop.name+'으로 옮겼어요.';
  }catch(error){if(user===api.user())feedback.textContent='옮기지 못했어요. 기존 그룹을 유지합니다. '+error.message;}
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
   drag.source.classList.add('todo-group-dragging');ghost.hidden=false;ghost.textContent=drop?drop.name+'으로 이동 · Esc 취소':'그룹에 놓아 이동 · Esc 취소';ghost.style.left=Math.max(0,Math.min(e.clientX+12,innerWidth-280))+'px';ghost.style.top=Math.max(0,Math.min(e.clientY+12,innerHeight-90))+'px';
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
 window.addEventListener('click',e=>{if(e.isTrusted&&performance.now()<suppressed&&(host.contains(e.target)||document.getElementById('classificationSideHost').contains(e.target))){e.preventDefault();e.stopImmediatePropagation();}},true);
 host.addEventListener('dragstart',e=>{if(drag)e.preventDefault();});
 desktop.addEventListener('change',sync);sync();return {sync,cancel};
};
