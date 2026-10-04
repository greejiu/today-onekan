/* Explicit adapters preserve legacy classification columns and colors. */
window.createOnekanClassification = api => {
 'use strict';
 const $=id=>document.getElementById(id),esc=api.escape;
 let groups=[],ready=false,user=null,legacyOwner=null,epoch=0,manager=null,busy=false,opener=null;
 const states={};
 const kindForPage=()=>({schedule:'event',todos:'todo',habits:'habit'})[api.page()];
 const normalized=kind=>kind==='someday'?'todo':kind;
 const pool=kind=>normalized(kind)==='event'?(legacyOwner===api.user()?api.eventGroups():[]):groups.filter(g=>g.kind===normalized(kind));
 const groupId=(kind,item)=>normalized(kind)==='event'?item.category_id:item.group_id;
 const key=kind=>'tok_classification:'+user+':'+normalized(kind);
 function state(kind){
  kind=normalized(kind);
  if(!states[kind]){
   let saved={};try{saved=JSON.parse(localStorage.getItem(key(kind)))||{};}catch{}
   // Preserve the old schedule eye preference, independently of list selection.
   if(kind==='event'&&!saved.hidden)try{saved.hidden=JSON.parse(localStorage.getItem('tok_schedule_categories:'+user))?.hidden;}catch{}
   states[kind]={selected:saved.selected||'all',hidden:new Set(saved.hidden||[]),collapsed:!!saved.collapsed,archived:!!saved.archived};
  }
  return states[kind];
 }
 function remember(kind){const s=state(kind);try{localStorage.setItem(key(kind),JSON.stringify({...s,hidden:[...s.hidden]}));}catch{}}
 function bind(){const next=api.user();if(user===next)return;user=next;legacyOwner=null;epoch++;groups=[];ready=false;Object.keys(states).forEach(k=>delete states[k]);close(true);}
 async function load(){
  bind();const ticket=++epoch,owner=user;
  try{const r=await api.sb.from('tok_item_groups').select('*').order('sort_order').order('created_at');if(ticket!==epoch||owner!==api.user())return;legacyOwner=owner;ready=!r.error;groups=ready?(r.data||[]):[];}catch{if(ticket===epoch&&owner===api.user()){legacyOwner=owner;ready=false;groups=[];}}
  render();
 }
 function matches(kind,item){const s=state(kind),id=groupId(kind,item)||'none';return s.selected==='all'||s.selected===id;}
 function calendarVisible(item,kind='event'){return !state(kind).hidden.has(groupId(kind,item)||'default');}
 function defaultGroup(kind){if(kindForPage()!==normalized(kind))return null;const selected=state(kind).selected;return pool(kind).some(g=>g.id===selected&&!g.is_archived)?selected:null;}
 function table(kind){return kind==='event'?'tok_event_categories':'tok_item_groups';}
 function render(){
  bind();const kind=kindForPage(),host=$('classificationSideHost');
  host.hidden=!kind;document.querySelectorAll('[data-classification-mobile]').forEach(el=>el.hidden=!kind||el.dataset.classificationMobile!==api.page());
  if(!kind)return;
  const s=state(kind),list=pool(kind),shown=list.filter(g=>s.archived?g.is_archived:!g.is_archived);
  const focus=host.contains(document.activeElement)?document.activeElement.dataset.groupSelect:null;
  host.innerHTML=`<hr class="sidebar-divider"><div class="classification-heading"><button type="button" data-collapse aria-expanded="${!s.collapsed}">${s.collapsed?'▸':'▾'} 그룹</button><button type="button" data-add-group aria-label="그룹 추가" ${kind!=='event'&&!ready?'disabled':''}>＋</button></div>
   <div class="classification-groups" ${s.collapsed?'hidden':''}><button type="button" class="navitem${s.selected==='all'?' active':''}" data-group-select="all" aria-pressed="${s.selected==='all'}">전체</button><button type="button" class="navitem${s.selected==='none'?' active':''}" data-group-select="none" aria-pressed="${s.selected==='none'}">미지정</button>
   ${shown.map(g=>`<div class="classification-row" data-group-row="${esc(g.id)}"><button type="button" class="navitem${s.selected===g.id?' active':''}" data-group-select="${esc(g.id)}" aria-pressed="${s.selected===g.id}" title="${esc(g.name)}"><span class="classification-dot" style="background:${esc(g.color||'#9a8cf0')}"></span><span>${esc(g.name)}</span></button><button type="button" data-group-edit="${esc(g.id)}" aria-label="${esc(g.name)} 그룹 메뉴">⋯</button>${(['event','todo','habit'].includes(kind))?`<button type="button" data-group-eye="${esc(g.id)}" aria-label="${esc(g.name)} 달력 ${s.hidden.has(g.id)?'표시':'숨기기'}" aria-pressed="${!s.hidden.has(g.id)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${s.hidden.has(g.id)?'<path d="M3 3l18 18"/>':''}</svg></button>`:''}</div>`).join('')||'<p class="sidebar-preparing">'+(kind!=='event'&&!ready?'그룹 저장소 준비 중':'아직 그룹이 없어요')+'</p>'}
   ${(['event','todo','habit'].includes(kind))?`<button type="button" class="navitem" data-group-eye="default" aria-pressed="${!s.hidden.has('default')}">미지정 달력 ${s.hidden.has('default')?'표시':'숨기기'}</button>`:''}
   <button type="button" class="navitem" data-archived aria-pressed="${s.archived}">${s.archived?'사용 중 그룹':'보관 그룹'} (${list.filter(g=>g.is_archived).length})</button></div>
   ${kind==='event'?'':'<hr class="sidebar-divider"><button type="button" class="navitem" data-manage-categories>범주 관리</button>'}`;
  if(focus)host.querySelector('[data-group-select="'+CSS.escape(focus)+'"]')?.focus({preventScroll:true});
  const select=document.querySelector('[data-classification-mobile="'+api.page()+'"] select');if(select){select.innerHTML='<option value="all">전체 그룹</option><option value="none">미지정</option>'+list.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}${g.is_archived?' · 보관됨':''}</option>`).join('');select.value=s.selected;}
 }
 function refresh(){const y=scrollY;api.refresh();render();scrollTo(0,y);}
 function select(kind,id){state(kind).selected=id;remember(kind);refresh();}
 function sideClick(e){
  const kind=kindForPage(),b=e.target.closest('button');if(!kind||!b)return;
  if(b.dataset.groupSelect){select(kind,b.dataset.groupSelect);return;}
  if(b.hasAttribute('data-group-eye')){const id=b.dataset.groupEye,s=state(kind);s.hidden.has(id)?s.hidden.delete(id):s.hidden.add(id);remember(kind);api.calendarRefresh();render();$('classificationSideHost').querySelector('[data-group-eye="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});return;}
  if(b.hasAttribute('data-collapse')){state(kind).collapsed=!state(kind).collapsed;remember(kind);render();$('classificationSideHost').querySelector('[data-collapse]').focus();return;}
  if(b.hasAttribute('data-archived')){state(kind).archived=!state(kind).archived;remember(kind);render();return;}
  if(b.hasAttribute('data-manage-categories'))open('category',kind,b);
  else if(b.hasAttribute('data-add-group'))open('group',kind,b);
  else if(b.dataset.groupEdit)groupMenu(kind,b.dataset.groupEdit,b);
 }
 function groupMenu(kind,id,b,x,y){const g=pool(kind).find(g=>g.id===id);if(!g)return;api.menu({title:g.name,opener:b,x,y,entries:[{label:'이름·색상 수정',window:true,run:()=>open('group',kind,b,g)},{label:g.is_archived?'그룹 복원':'그룹 보관',run:()=>archive(kind,g)}]});}
 async function archive(kind,g){const owner=user,{error}=await api.sb.from(table(kind)).update({is_archived:!g.is_archived}).eq('id',g.id);if(error){api.alert('저장하지 못했어요: '+error.message);return;}if(owner!==api.user())return;await api.reload();refresh();}
 function close(force=false){if(busy&&!force)return;const shown=$('classificationManageBg')?.classList.contains('open');$('classificationManageBg')?.classList.remove('open');manager=null;if(shown&&opener?.getClientRects().length)opener.focus({preventScroll:true});}
 function open(type,kind,b,g=null){
  bind();if(legacyOwner!==api.user()){api.alert('분류를 불러오는 중이에요. 잠시 후 다시 열어주세요.');return;}manager={type,kind,id:g?.id||null,user};opener=b;$('classificationManageTitle').textContent=type==='category'?'범주 관리':g?'그룹 수정':'그룹 추가';$('classificationManageName').value=g?.name||'';$('classificationManageColor').value=g?.color||'#9a8cf0';$('classificationManageError').textContent='';
  $('classificationManageList').onclick=null;$('classificationManageList').hidden=type!=='category';$('classificationManageForm').hidden=false;
  if(type==='category')api.categoryList('classificationManageList');
  $('classificationManageBg').classList.add('open');$('classificationManageName').focus();
 }
 async function save(e){
  e.preventDefault();if(busy||!manager)return;const current={...manager},name=$('classificationManageName').value.trim(),color=$('classificationManageColor').value;
  if(!name){$('classificationManageError').textContent='이름을 입력해주세요.';return;}
  if(api.reserved(name)||name==='전체'||name==='미지정'){$('classificationManageError').textContent='기본·전체·미지정은 분류 이름으로 사용할 수 없어요.';return;}
  const target=current.type==='category'?'tok_habit_categories':table(current.kind),list=current.type==='category'?api.categories():pool(current.kind);
  const row={name,color};if(!current.id){row.user_id=current.user;row.sort_order=Math.max(-1,...list.map(g=>g.sort_order||0))+1;if(target==='tok_item_groups')row.kind=current.kind;}
  busy=true;$('classificationManageSave').disabled=true;
  try{
   const {error}=await (current.id?api.sb.from(target).update(row).eq('id',current.id):api.sb.from(target).insert(row));if(error)throw error;
   if(current.user!==api.user())return;
   await api.reload();
   if(current.type==='category'){api.categoryList('classificationManageList');$('classificationManageName').value='';}else{busy=false;close();}
  }catch(err){if(current.user===api.user())$('classificationManageError').textContent='저장하지 못했어요. 입력 내용은 유지돼요. ('+err.message+')';}
  finally{busy=false;$('classificationManageSave').disabled=false;}
 }
 function fillSelect(select,list,id){const missing=id&&!list.some(g=>g.id===id);select.innerHTML='<option value="">미지정</option>'+list.filter(g=>!g.is_archived||g.id===id).map(g=>`<option value="${esc(g.id)}">${esc(g.name)}${g.is_archived?' · 보관됨':''}</option>`).join('')+(missing?`<option value="${esc(id)}">기존 연결 (조회 불가)</option>`:'');select.value=id||'';select.onchange=()=>{if(select.value!==id)fillSelect(select,list,select.value);};}
 function prepare(kind,prefix,item=null){
  bind();const field=normalized(kind)==='event'?'shared_category_id':'group_id',select=$(prefix+'_'+field);
  if(!select)return;const id=item?.[field]||(field==='group_id'&&!item?defaultGroup(kind):null);
  fillSelect(select,field==='group_id'?pool(kind):(legacyOwner===api.user()?api.categories():[]),id);select.disabled=!ready;select.dataset.original=id||'';
  $(prefix+'_classification_notice').hidden=ready;
 }
 function patch(kind,prefix,item=null){
  const field=normalized(kind)==='event'?'shared_category_id':'group_id',s=$(prefix+'_'+field);if(!s)return {};
  const value=s.value||null;if(!ready){if(value||item?.[field])throw new Error('분류 저장소를 확인하지 못했어요. 다시 불러온 후 저장해주세요.');return {};}
  if(item&&(item[field]||null)===value)return {};return {[field]:value};
 }
 function inherited(kind,item){return normalized(kind)==='event'?(item.shared_category_id?{shared_category_id:item.shared_category_id}:{}):(item.group_id?{group_id:item.group_id}:{});}
 function mount(){
  const host=document.createElement('section');host.id='classificationSideHost';host.className='classification-side';host.hidden=true;$('dedicatedSidebarNav').append(host);host.addEventListener('click',sideClick);host.addEventListener('contextmenu',e=>{const r=e.target.closest('[data-group-row]');if(!r)return;e.preventDefault();groupMenu(kindForPage(),r.dataset.groupRow,r.querySelector('[data-group-edit]'),e.clientX,e.clientY);});
  const bg=document.createElement('div');bg.id='classificationManageBg';bg.className='sheet-bg classification-manage-bg';bg.innerHTML=`<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="classificationManageTitle"><h2 id="classificationManageTitle"></h2><div id="classificationManageList"></div><form id="classificationManageForm"><div class="field"><label for="classificationManageName">이름</label><input id="classificationManageName" maxlength="200" required></div><div class="field"><label for="classificationManageColor">색상</label><input id="classificationManageColor" type="color" value="#9a8cf0"></div><p id="classificationManageError" role="status"></p><div class="sheet-actions"><button type="button" id="classificationManageClose" class="btn-ghost">닫기</button><button type="submit" id="classificationManageSave" class="btn">저장</button></div></form></section>`;document.body.append(bg);$('classificationManageForm').onsubmit=save;$('classificationManageClose').onclick=()=>close();bg.addEventListener('click',e=>{if(e.target===bg)close();});bg.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else api.trap(bg.querySelector('.sheet'),e);});
  for(const [page,kind] of [['schedule','event'],['todos','todo'],['habits','habit']]){
   const row=document.createElement('div');row.className='classification-mobile';row.dataset.classificationMobile=page;row.innerHTML=`<label>그룹<select aria-label="${kind==='event'?'일정':kind==='todo'?'할일':'습관'} 그룹 조회"></select></label><button type="button" class="btn-ghost">그룹 관리</button><button type="button" class="btn-ghost">범주 관리</button>`;document.querySelector('.page[data-page="'+page+'"]').prepend(row);row.querySelector('select').onchange=e=>select(kind,e.target.value);row.querySelectorAll('button')[0].onclick=e=>manageGroups(kind,e.currentTarget);row.querySelectorAll('button')[1].hidden=kind==='event';row.querySelectorAll('button')[1].onclick=e=>open('category',kind,e.currentTarget);
  }
  for(const [prefix,kind,anchor] of [['td','todo','td_tag'],['hs','habit','hs_category'],['ha','habit','ha_category'],['sd','someday','sd_tag'],['cev','event','cev_category']]){
   if(kind==='event')continue; // Existing event category links remain stored, but are no longer editable here.
   const field=kind==='event'?'shared_category_id':'group_id',node=document.createElement('div');node.className='field';node.innerHTML=`<label for="${prefix}_${field}">${kind==='event'?'범주':'그룹'}</label><select id="${prefix}_${field}"></select><small id="${prefix}_classification_notice">새 분류 저장소를 확인하지 못했어요. 기존 기능은 계속 사용할 수 있어요.</small>`;$(anchor).closest('.field')?.after(node);
  }
 }
 function manageGroups(kind,b){open('group',kind,b);$('classificationManageTitle').textContent='그룹 관리';$('classificationManageList').hidden=false;renderMobileGroupManager(kind);}
 function renderMobileGroupManager(kind){const host=$('classificationManageList');host.innerHTML=`<div class="classification-mobile-groups">${(['event','todo','habit'].includes(kind))?`<div class="classification-row"><span>미지정</span><button type="button" data-eye="default" aria-pressed="${!state(kind).hidden.has('default')}">${state(kind).hidden.has('default')?'달력 표시':'달력 숨김'}</button></div>`:''}${pool(kind).map(g=>`<div class="classification-row"><span>${esc(g.name)}${g.is_archived?' · 보관됨':''}</span>${(['event','todo','habit'].includes(kind))?`<button type="button" data-eye="${esc(g.id)}" aria-pressed="${!state(kind).hidden.has(g.id)}">${state(kind).hidden.has(g.id)?'달력 표시':'달력 숨김'}</button>`:''}<button type="button" data-edit="${esc(g.id)}">수정</button><button type="button" data-archive="${esc(g.id)}">${g.is_archived?'복원':'보관'}</button></div>`).join('')||'<p>아직 그룹이 없어요.</p>'}</div>`;host.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-eye')){const id=b.dataset.eye,s=state(kind);s.hidden.has(id)?s.hidden.delete(id):s.hidden.add(id);remember(kind);api.calendarRefresh();render();renderMobileGroupManager(kind);host.querySelector('[data-eye="'+CSS.escape(id)+'"]').focus({preventScroll:true});return;}const g=pool(kind).find(g=>g.id===(b.dataset.edit||b.dataset.archive));if(!g)return;if(b.dataset.edit)open('group',kind,b,g);else archive(kind,g).then(()=>{if(manager?.type==='group')renderMobileGroupManager(kind);});};}
 function badge(kind,item){if(normalized(kind)==='event')return '';const field=normalized(kind)==='event'?'shared_category_id':'group_id',g=(field==='group_id'?pool(kind):api.categories()).find(g=>g.id===item[field]);return g?`<span class="classification-badge">${field==='group_id'?'그룹':'범주'} · ${esc(g.name)}${g.is_archived?' · 보관됨':''}</span>`:'';}
 mount();return {load,bind,render,matches,calendarVisible,defaultGroup,prepare,patch,inherited,badge,isReady:()=>ready,groups:()=>groups,select,state,open,manageGroups};
};
