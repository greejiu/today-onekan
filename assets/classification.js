/* Explicit adapters preserve legacy classification columns and colors. */
window.createOnekanClassification = api => {
 'use strict';
 const $=id=>document.getElementById(id),esc=api.escape;
 let groups=[],ready=false,user=null,legacyOwner=null,epoch=0,manager=null,busy=false,opener=null;
 const states={},projectStates={};
 const kindForPage=()=>({schedule:'event',todos:'todo',habits:'habit'})[api.page()];
 const normalized=kind=>kind==='someday'?'todo':kind;
 const pool=kind=>normalized(kind)==='event'?(legacyOwner===api.user()?api.eventGroups():[]):groups.filter(g=>g.kind===normalized(kind));
 const groupId=(kind,item)=>normalized(kind)==='event'?item.category_id:item.group_id;
 const key=kind=>'tok_classification:'+user+':'+normalized(kind);
 const projectKey=kind=>'tok_project_sidebar:'+user+':'+normalized(kind);
 function projectState(kind){
  kind=normalized(kind);
  if(!projectStates[kind]){let saved={};try{saved=JSON.parse(localStorage.getItem(projectKey(kind)))||{};}catch{}projectStates[kind]={selected:saved.selected||'all'};}
  return projectStates[kind];
 }
 function projectSelection(kind){const id=projectState(kind).selected;return id==='all'||id==='none'||api.projects().some(p=>p.id===id)?id:'all';}
 function state(kind){
  kind=normalized(kind);
  if(!states[kind]){
   let saved={};try{saved=JSON.parse(localStorage.getItem(key(kind)))||{};}catch{}
   // Preserve the old schedule eye preference, independently of list selection.
   if(kind==='event'&&!saved.hidden)try{saved.hidden=JSON.parse(localStorage.getItem('tok_schedule_categories:'+user))?.hidden;}catch{}
   states[kind]={selected:saved.selected||'all',hidden:new Set(saved.hidden||[])};
  }
  return states[kind];
 }
 function remember(kind){const s=state(kind);try{localStorage.setItem(key(kind),JSON.stringify({...s,hidden:[...s.hidden]}));}catch{}}
 function bind(){const next=api.user();if(user===next)return;user=next;legacyOwner=null;epoch++;groups=[];ready=false;Object.keys(states).forEach(k=>delete states[k]);Object.keys(projectStates).forEach(k=>delete projectStates[k]);close(true);}
 async function load(){
  bind();const ticket=++epoch,owner=user;
  try{const r=await api.sb.from('tok_item_groups').select('*').order('sort_order').order('created_at');if(ticket!==epoch||owner!==api.user())return;legacyOwner=owner;ready=!r.error;groups=ready?(r.data||[]).map(g=>({...g,is_archived:false})):[];}catch{if(ticket===epoch&&owner===api.user()){legacyOwner=owner;ready=false;groups=[];}}
  render();
 }
 function matches(kind,item){if(normalized(kind)!=='event'&&api.projectsReady()){const selected=projectSelection(kind),id=item.project_id||'none';return selected==='all'||selected===id;}const s=state(kind),id=groupId(kind,item)||'none';return s.selected==='all'||s.selected===id;}
 function calendarVisible(item,kind='event'){return normalized(kind)!=='event'&&api.projectsReady()?true:!state(kind).hidden.has(groupId(kind,item)||'default');}
 function defaultGroup(kind){if(kindForPage()!==normalized(kind)||normalized(kind)!=='event'&&api.projectsReady())return null;const selected=state(kind).selected;return pool(kind).some(g=>g.id===selected&&!g.is_archived)?selected:null;}
 function table(kind){return kind==='event'?'tok_event_categories':'tok_item_groups';}
 function render(){
  bind();const kind=kindForPage(),host=$('classificationSideHost');
  host.hidden=!kind;document.querySelectorAll('[data-classification-mobile]').forEach(el=>el.hidden=!kind||el.dataset.classificationMobile!==api.page());
  if(!kind)return;
  if(kind!=='event'&&api.projectsReady()){renderProjects(kind,host);return;}
  const s=state(kind),list=pool(kind),shown=list,noun=kind==='event'?'범주':'기존 분류';
  const focus=host.contains(document.activeElement)?document.activeElement.dataset.groupSelect:null;
  host.innerHTML=`<hr class="sidebar-divider"><div class="classification-heading"><span class="classification-group-title">${noun}</span><button type="button" data-add-group aria-label="${noun} 추가" ${kind!=='event'&&!ready?'disabled':''}>＋</button></div>
   <div class="classification-groups"><button type="button" class="navitem${s.selected==='all'?' active':''}" data-group-select="all" aria-pressed="${s.selected==='all'}">전체</button><div class="classification-row" data-group-row="default"><button type="button" class="navitem${s.selected==='none'?' active':''}" data-group-select="none" aria-pressed="${s.selected==='none'}"><span class="classification-dot" style="background:${esc(api.defaultGroupColor(kind))}"></span><span>기본</span></button><button type="button" data-group-edit="default" aria-label="기본 그룹 색상 수정">⋯</button><button type="button" data-group-eye="default" aria-label="기본 달력 ${s.hidden.has('default')?'표시':'숨기기'}" aria-pressed="${!s.hidden.has('default')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12C5 5 19 5 22 12C19 19 5 19 2 12Z"/><circle cx="12" cy="12" r="3"/>${s.hidden.has('default')?'<path d="M3 3l18 18"/>':''}</svg></button></div>
   ${shown.map(g=>`<div class="classification-row" data-group-row="${esc(g.id)}"><button type="button" class="navitem${s.selected===g.id?' active':''}" data-group-select="${esc(g.id)}" aria-pressed="${s.selected===g.id}" title="${esc(g.name)}"><span class="classification-dot" style="background:${esc(g.color||'#9a8cf0')}"></span><span>${esc(g.name)}</span></button><button type="button" data-group-edit="${esc(g.id)}" aria-label="${esc(g.name)} 그룹 메뉴">⋯</button>${(['event','todo','habit'].includes(kind))?`<button type="button" data-group-eye="${esc(g.id)}" aria-label="${esc(g.name)} 달력 ${s.hidden.has(g.id)?'표시':'숨기기'}" aria-pressed="${!s.hidden.has(g.id)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${s.hidden.has(g.id)?'<path d="M3 3l18 18"/>':''}</svg></button>`:''}</div>`).join('')||'<p class="sidebar-preparing">'+(kind!=='event'&&!ready?'그룹 저장소 준비 중':'아직 그룹이 없어요')+'</p>'}
   </div>${kind==='event'?'':'<hr class="sidebar-divider"><button type="button" class="navitem" data-manage-categories>그룹 관리</button>'}`;
  if(focus)host.querySelector('[data-group-select="'+CSS.escape(focus)+'"]')?.focus({preventScroll:true});
  const select=document.querySelector('[data-classification-mobile="'+api.page()+'"] select');if(select){select.innerHTML='<option value="all">전체 '+noun+'</option><option value="none">기본</option>'+list.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');select.value=s.selected;}
  const mobile=document.querySelector('[data-classification-mobile="'+api.page()+'"]');if(mobile&&kind!=='event'){mobile.querySelector('label').firstChild.textContent=noun;mobile.querySelector('button').hidden=false;mobile.querySelector('button').textContent=noun+' 관리';}
 }
 function renderProjects(kind,host){
  const selected=projectSelection(kind),projects=api.projects(),focus=host.contains(document.activeElement)?document.activeElement.dataset.projectSelect:null;
  const byId=new Map(projects.map(p=>[p.id,p]));
  const root=p=>p?.parent_id?byId.get(p.parent_id)||p:p;
  const status=p=>{const r=root(p);return !r?'':r.is_archived?' · 보관':r.lifecycle_state==='ended'?' · 종료':'';};
  const ordered=[];for(const p of projects.filter(p=>!p.parent_id||!byId.has(p.parent_id))){ordered.push(p);ordered.push(...projects.filter(c=>c.parent_id===p.id));}
  const option=(id,label,depth=0,p=null)=>`<button type="button" class="navitem project-side-item${selected===id?' active':''}${depth?' project-side-child':''}" data-project-select="${esc(id)}" aria-pressed="${selected===id}" title="${esc(label+status(p))}">${depth?'└ ':''}${esc(label)}${p?`<span class="project-side-state">${status(p)}</span>`:''}</button>`;
  host.innerHTML=`<hr class="sidebar-divider"><div class="classification-heading"><span class="classification-group-title">프로젝트 목록</span></div><div class="classification-groups">${option('all','전체')}${option('none','작업')}${ordered.map(p=>option(p.id,p.name,p.parent_id?1:0,p)).join('')}</div><hr class="sidebar-divider"><button type="button" class="navitem" data-manage-categories>그룹 관리</button>`;
  if(focus)host.querySelector('[data-project-select="'+CSS.escape(focus)+'"]')?.focus({preventScroll:true});
  const select=document.querySelector('[data-classification-mobile="'+api.page()+'"] select');if(select){select.innerHTML='<option value="all">전체</option><option value="none">작업</option>'+ordered.map(p=>`<option value="${esc(p.id)}">${p.parent_id?'└ ':''}${esc(p.name)}${status(p)}</option>`).join('');select.value=selected;}
  const mobile=document.querySelector('[data-classification-mobile="'+api.page()+'"]');if(mobile){mobile.querySelector('label').firstChild.textContent='프로젝트';mobile.querySelector('button').hidden=true;}
 }
 function refresh(){const y=scrollY;api.refresh();render();scrollTo(0,y);}
 function select(kind,id){if(normalized(kind)!=='event'&&api.projectsReady()){projectState(kind).selected=id;try{localStorage.setItem(projectKey(kind),JSON.stringify(projectState(kind)));}catch{}}else{state(kind).selected=id;remember(kind);}refresh();}
 function sideClick(e){
  const kind=kindForPage(),b=e.target.closest('button');if(!kind||!b)return;
  if(b.dataset.projectSelect){select(kind,b.dataset.projectSelect);return;}
  if(b.dataset.groupSelect){select(kind,b.dataset.groupSelect);return;}
  if(b.hasAttribute('data-group-eye')){const id=b.dataset.groupEye,s=state(kind);s.hidden.has(id)?s.hidden.delete(id):s.hidden.add(id);remember(kind);api.calendarRefresh();render();$('classificationSideHost').querySelector('[data-group-eye="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});return;}
  if(b.hasAttribute('data-manage-categories'))open('category',kind,b);
  else if(b.hasAttribute('data-add-group'))open('group',kind,b);
  else if(b.dataset.groupEdit)groupMenu(kind,b.dataset.groupEdit,b);
 }
 function groupMenu(kind,id,b,x,y){if(id==='default'){api.menu({title:'기본',opener:b,x,y,entries:[{label:'색상 수정',window:true,run:()=>open('default',kind,b)}]});return;}const g=pool(kind).find(g=>g.id===id);if(!g)return;api.menu({title:g.name,opener:b,x,y,entries:[{label:'이름·색상 수정',window:true,run:()=>open('group',kind,b,g)}]});}
 function close(force=false){if(busy&&!force)return;const shown=$('classificationManageBg')?.classList.contains('open');$('classificationManageBg')?.classList.remove('open');manager=null;if(shown&&opener?.getClientRects().length)opener.focus({preventScroll:true});}
 function open(type,kind,b,g=null){
  bind();if(legacyOwner!==api.user()){api.alert('분류를 불러오는 중이에요. 잠시 후 다시 열어주세요.');return;}manager={type,kind,id:g?.id||null,user};opener=b;const noun=kind==='event'?'범주':'기존 분류';$('classificationManageTitle').textContent=type==='default'?'기본 '+noun+' 색상':type==='category'?'그룹 관리':g?noun+' 수정':noun+' 추가';$('classificationManageName').disabled=type==='default';$('classificationManageName').value=type==='default'?'기본':g?.name||'';$('classificationManageColor').value=type==='default'?api.defaultGroupColor(kind):g?.color||'#9a8cf0';$('classificationManageError').textContent='';
  $('classificationManageList').onclick=null;$('classificationManageList').hidden=type!=='category';$('classificationManageForm').hidden=false;
  if(type==='category')api.categoryList('classificationManageList');
  $('classificationManageBg').classList.add('open');$(type==='default'?'classificationManageColor':'classificationManageName').focus();
 }
 async function save(e){
  e.preventDefault();if(busy||!manager)return;const current={...manager},name=$('classificationManageName').value.trim(),color=$('classificationManageColor').value;
  if(current.type==='default'){busy=true;$('classificationManageSave').disabled=true;try{const result=await api.saveDefaultGroupColor(current.kind,color);if(!result.ok)throw result.error||Error('저장 실패');if(current.user!==api.user())return;await api.reload();busy=false;close();}catch(err){if(current.user===api.user())$('classificationManageError').textContent='저장하지 못했어요. 다시 시도해 주세요.';}finally{busy=false;$('classificationManageSave').disabled=false;}return;}
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
 function fillSelect(select,list,id,group=false){const missing=id&&!list.some(g=>g.id===id);select.innerHTML='<option value="">'+(group?'기본':'미지정')+'</option>'+list.filter(g=>group||!g.is_archived||g.id===id).map(g=>`<option value="${esc(g.id)}">${esc(g.name)}${g.is_archived?' · 보관됨':''}</option>`).join('')+(missing?`<option value="${esc(id)}">기존 연결 (조회 불가)</option>`:'');select.value=id||'';select.onchange=()=>{if(select.value!==id)fillSelect(select,list,select.value,group);};}
 function prepare(kind,prefix,item=null){
  bind();const field=normalized(kind)==='event'?'shared_category_id':'group_id',select=$(prefix+'_'+field);
  if(!select)return;const id=item?.[field]||(field==='group_id'&&!item?defaultGroup(kind):null);
  fillSelect(select,field==='group_id'?pool(kind):(legacyOwner===api.user()?api.categories():[]),id,field==='group_id');select.disabled=!ready;select.dataset.original=id||'';
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
   const noun=kind==='event'?'범주':'프로젝트';const row=document.createElement('div');row.className='classification-mobile';row.dataset.classificationMobile=page;row.innerHTML=`<label>${noun}<select aria-label="${kind==='event'?'일정':kind==='todo'?'할일':'습관'} ${noun} 조회"></select></label><button type="button" class="btn-ghost">${noun} 관리</button><button type="button" class="btn-ghost">그룹 관리</button>`;document.querySelector('.page[data-page="'+page+'"]').prepend(row);row.querySelector('select').onchange=e=>select(kind,e.target.value);row.querySelectorAll('button')[0].hidden=kind!=='event';row.querySelectorAll('button')[0].onclick=e=>manageGroups(kind,e.currentTarget);row.querySelectorAll('button')[1].hidden=kind==='event';row.querySelectorAll('button')[1].onclick=e=>open('category',kind,e.currentTarget);
  }
  for(const [prefix,kind,anchor] of [['td','todo','td_tag'],['hs','habit','hs_category'],['ha','habit','ha_category'],['sd','someday','sd_tag'],['cev','event','cev_category']]){
   if(kind==='event')continue; // Existing event category links remain stored, but are no longer editable here.
   const field=kind==='event'?'shared_category_id':'group_id',node=document.createElement('div');node.className='field';node.innerHTML=`<label for="${prefix}_${field}">${kind==='event'?'범주':'기존 분류'}</label><select id="${prefix}_${field}"></select><small id="${prefix}_classification_notice">새 분류 저장소를 확인하지 못했어요. 기존 기능은 계속 사용할 수 있어요.</small>`;$(anchor).closest('.field')?.after(node);
  }
 }
 function manageGroups(kind,b){open('group',kind,b);$('classificationManageTitle').textContent=(kind==='event'?'범주':'기존 분류')+' 관리';$('classificationManageList').hidden=false;renderMobileGroupManager(kind);}
 function renderMobileGroupManager(kind){const host=$('classificationManageList');host.innerHTML='<div class="classification-mobile-groups"><div class="classification-row"><span><span class="classification-dot" style="display:inline-block;background:'+esc(api.defaultGroupColor(kind))+'"></span> 기본</span><button type="button" data-edit="default">색상 수정</button><button type="button" data-eye="default" aria-pressed="'+!state(kind).hidden.has('default')+'">'+(state(kind).hidden.has('default')?'달력 표시':'달력 숨김')+'</button></div>'+pool(kind).map(g=>'<div class="classification-row"><span>'+esc(g.name)+'</span><button type="button" data-eye="'+esc(g.id)+'" aria-pressed="'+!state(kind).hidden.has(g.id)+'">'+(state(kind).hidden.has(g.id)?'달력 표시':'달력 숨김')+'</button><button type="button" data-edit="'+esc(g.id)+'">수정</button></div>').join('')+'</div>';host.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-eye')){const id=b.dataset.eye,s=state(kind);s.hidden.has(id)?s.hidden.delete(id):s.hidden.add(id);remember(kind);api.calendarRefresh();render();renderMobileGroupManager(kind);host.querySelector('[data-eye="'+CSS.escape(id)+'"]').focus({preventScroll:true});return;}if(b.dataset.edit==='default'){open('default',kind,b);return;}const g=pool(kind).find(g=>g.id===b.dataset.edit);if(g)open('group',kind,b,g);};}
 function badge(kind,item){if(normalized(kind)==='event')return '';const field='group_id',g=pool(kind).find(g=>g.id===item[field]);return g?`<span class="classification-badge">기존 분류 · ${esc(g.name)}${g.is_archived?' · 보관됨':''}</span>`:'';}
 mount();return {load,bind,render,matches,calendarVisible,defaultGroup,prepare,patch,inherited,badge,isReady:()=>ready,groups:()=>groups,select,state,projectSelection,open,manageGroups};
};
