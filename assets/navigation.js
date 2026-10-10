/* One shared navigation registry; preferences only affect navigation.
   2026-10-10: '모두'를 없애고 일정 메뉴가 통합 화면(page 'all': 일정 + 할일·습관 눈)을 엶. 옛 일정 화면(page 'schedule')은 코드만 남김. */
window.OnekanNavigation = (() => {
 'use strict';
 const registry=[
 {
  "id": "home",
  "page": "home",
  "label": "지금한칸",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"></path><polyline points=\"9 22 9 12 15 12 15 22\"></polyline></svg>",
  "configurable": true,
  "defaultOrder": 0
 },
 {
  "id": "schedule",
  "page": "all",
  "label": "일정",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\" ry=\"2\"></rect><line x1=\"16\" y1=\"2\" x2=\"16\" y2=\"6\"></line><line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"6\"></line><line x1=\"3\" y1=\"10\" x2=\"21\" y2=\"10\"></line></svg>",
  "configurable": true,
  "defaultOrder": 1
 },
 {
  "id": "todos",
  "page": "todos",
  "label": "할일",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"9 11 12 14 22 4\"></polyline><path d=\"M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11\"></path></svg>",
  "configurable": true,
  "defaultOrder": 2
 },
 {
  "id": "habits",
  "page": "habits",
  "label": "습관",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"17 1 21 5 17 9\"></polyline><path d=\"M3 11V9a4 4 0 0 1 4-4h14\"></path><polyline points=\"7 23 3 19 7 15\"></polyline><path d=\"M21 13v2a4 4 0 0 1-4 4H3\"></path></svg>",
  "configurable": true,
  "defaultOrder": 3
 },
 {
  "id": "records",
  "page": "records",
  "label": "기록",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"20\" x2=\"18\" y2=\"10\"></line><line x1=\"12\" y1=\"20\" x2=\"12\" y2=\"4\"></line><line x1=\"6\" y1=\"20\" x2=\"6\" y2=\"14\"></line></svg>",
  "configurable": true,
  "defaultOrder": 4
 },
 {
  "id": "work",
  "page": "work",
  "label": "목표",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polygon points=\"12 2 2 7 12 12 22 7 12 2\"></polygon><polyline points=\"2 17 12 22 22 17\"></polyline><polyline points=\"2 12 12 17 22 12\"></polyline></svg>",
  "configurable": true,
  "defaultOrder": 5
 },
 {
  "id": "timer",
  "page": "timer",
  "label": "추적",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"13\" r=\"8\"></circle><polyline points=\"12 9 12 13 14.5 15.5\"></polyline><line x1=\"9\" y1=\"2\" x2=\"15\" y2=\"2\"></line></svg>",
  "configurable": true,
  "defaultOrder": 6
 },
 {
  "id": "together",
  "page": "together",
  "label": "같이한칸",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"8\" cy=\"7\" r=\"3\"/><circle cx=\"17\" cy=\"8\" r=\"2\"/><path d=\"M2 21v-3a6 6 0 0 1 12 0v3M17 13a5 5 0 0 1 5 5v3\"/></svg>",
  "configurable": true,
  "defaultOrder": 7
 },
 {
  "id": "community",
  "page": "community",
  "label": "커뮤니티",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18\"/></svg>",
  "configurable": true,
  "defaultOrder": 8
 },
 {
  "id": "settings",
  "page": "settings",
  "label": "설정",
  "icon": "<svg class=\"nav-icon\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3\"></circle><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z\"></path></svg>",
  "configurable": false,
  "defaultOrder": 10
 }
];
 const configurable=registry.filter(r=>r.configurable),defaults=configurable.map(r=>r.id),byId=id=>registry.find(r=>r.id===id);
 function normalize(value){
  const order=Array.isArray(value?.order)?[...new Set(value.order.filter(id=>defaults.includes(id)))]:[];
  const hidden=Array.isArray(value?.hidden)?[...new Set(value.hidden.filter(id=>defaults.includes(id)))]:[];
  return {version:1,order:[...order,...defaults.filter(id=>!order.includes(id))],hidden};
 }
 let config=normalize(null);
 const allowed=id=>!window.OnekanRelease||OnekanRelease.canOpen(id);
 const restricted=()=>!!window.OnekanRelease&&OnekanRelease.isRestricted();
 const visible=()=>config.order.filter(id=>allowed(id)&&(!config.hidden.includes(id)||(id==='home'&&restricted()))).map(byId);
 const primary=()=>visible().slice(0,5),overflow=()=>[...visible().slice(5),byId('settings')];
 function button(item,onClick){
  const el=document.createElement('button');el.type='button';el.className='navitem';el.dataset.page=item.page;el.setAttribute('aria-label',item.label);el.title=item.label;
  el.innerHTML=item.icon;el.querySelector('svg').setAttribute('aria-hidden','true');const label=document.createElement('span');label.className='navigation-label';label.textContent=item.label;el.append(label);el.onclick=()=>onClick(item.page,el);return el;
 }
 function createSettings(api){
  let owner=null,epoch=0,revision=0,loadVersion=0,ready=false,busy=false,saved=normalize(null),drag=null;
  const host=document.createElement('section');host.id='navigationSettings';host.className='navigation-settings card';host.setAttribute('aria-labelledby','navigationSettingsHeading');
  host.innerHTML='<h2 id="navigationSettingsHeading" class="section-label settings-group-title">탭 설정</h2><p>위쪽 5개 메뉴는 기본 메뉴에 표시됩니다.</p><p class="navigation-help">숨긴 메뉴의 기능과 데이터는 유지됩니다. 핸들을 드래그하거나 화살표 키로 순서를 바꿀 수 있어요.</p><div id="navigationSettingsRows"></div><p id="navigationSettingsStatus" role="status" aria-live="polite"></p><button type="button" id="navigationSettingsRetry" hidden>다시 불러오기</button>';
  document.getElementById('settingsAccountCard').after(host);
  const list=host.querySelector('#navigationSettingsRows'),status=host.querySelector('#navigationSettingsStatus'),retry=host.querySelector('#navigationSettingsRetry');
  function active(){
   document.querySelectorAll('.navitem[data-page]').forEach(el=>{const selected=el.dataset.page===api.page();el.classList.toggle('active',selected);if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
   document.getElementById('navMoreBtn').classList.toggle('active',overflow().some(r=>r.page===api.page()));
  }
  function navClick(page,el){api.closeMore();api.navigate(page);if(el.isConnected&&el.getClientRects().length)el.focus({preventScroll:true});}
  function renderNav(){
   api.closeMore();const home=document.getElementById('sidebarHomeNav');home.replaceChildren();home.hidden=true;
   const main=document.getElementById('mainSidebarNav');main.replaceChildren(...primary().map(r=>button(r,navClick)));
   const mobile=document.querySelector('.bottombar'),more=document.getElementById('navMoreBtn');mobile.querySelectorAll('[data-page]').forEach(el=>el.remove());primary().forEach(r=>mobile.insertBefore(button(r,navClick),more));
   const sheet=document.getElementById('navMoreSheet');sheet.replaceChildren(...overflow().map(r=>{const el=button(r,navClick);el.setAttribute('role','menuitem');return el;}));
   api.morePages(overflow().map(r=>r.page));api.refresh();active();
   const shownId=(registry.find(r=>r.page===api.page())||{}).id||api.page(); // 메뉴 id ≠ 화면 이름일 수 있음(일정 메뉴 id 'schedule' → 화면 'all')
   if(!allowed(api.page())||config.hidden.includes(api.page())||config.hidden.includes(shownId))api.navigate('home');
  }
  function renderRows(focusId,focusType='toggle'){
   list.replaceChildren();let count=0,divided=false;
   const heading=text=>{const el=document.createElement('h3');el.className='navigation-list-heading';el.textContent=text;list.append(el);};heading('기본 메뉴');
   for(const id of config.order){
    const item=byId(id),unavailable=!allowed(id),locked=unavailable||(id==='home'&&restricted()),hidden=config.hidden.includes(id)||unavailable;
    if(!hidden&&count===5&&!divided){heading('더보기');divided=true;}
    const row=document.createElement('div');row.className='navigation-setting-row';row.dataset.navigationId=id;row.classList.toggle('navigation-hidden',hidden);
    const handle=document.createElement('button');handle.type='button';handle.className='navigation-drag-handle';handle.textContent='≡';handle.setAttribute('aria-label',item.label+' 순서 변경');handle.title='드래그 또는 위·아래 화살표 키';handle.disabled=!ready||busy||locked;
    const icon=document.createElement('span');icon.innerHTML=item.icon;icon.querySelector('svg').setAttribute('aria-hidden','true');icon.className='navigation-setting-icon';
    const name=document.createElement('span');name.className='navigation-setting-name';name.textContent=item.label;
    const area=document.createElement('label');area.className='navigation-setting-toggle';const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=id==='home'&&locked?true:!hidden;toggle.disabled=!ready||busy||locked;toggle.setAttribute('role','switch');toggle.setAttribute('aria-label',item.label+' 표시');const state=document.createElement('span');state.textContent=unavailable?'아직 준비 중이에요':toggle.checked?'ON':'OFF';area.append(toggle,state);
    row.append(handle,icon,name,area);list.append(row);if(!hidden)count++;
    toggle.onchange=()=>{if(locked)return;const next=normalize(config);next.hidden=toggle.checked?next.hidden.filter(v=>v!==id):[...next.hidden,id];void save(next,id);};
    handle.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const next=normalize(config),from=next.order.indexOf(id),to=from+(e.key==='ArrowUp'?-1:1);if(to>=0&&to<next.order.length){[next.order[from],next.order[to]]=[next.order[to],next.order[from]];void save(next,id,'handle');}};
    handle.onpointerdown=e=>{if(e.button!==0||busy||!ready)return;drag={id,pointer:e.pointerId,x:e.clientX,y:e.clientY,target:id,moved:false,epoch};handle.setPointerCapture(e.pointerId);};
   }
   if(!divided)heading('더보기');
   const fixed=document.createElement('div');fixed.className='navigation-setting-row navigation-fixed';fixed.innerHTML='<span></span><span class="navigation-setting-icon">'+byId('settings').icon+'</span><span>설정</span><span>항상 마지막</span>';fixed.querySelector('svg').setAttribute('aria-hidden','true');list.append(fixed);
   if(focusId){const row=[...list.children].find(r=>r.dataset.navigationId===focusId);row?.querySelector(focusType==='handle'?'button':'input')?.focus({preventScroll:true});}
  }
  function cancelDrag(){list.querySelectorAll('.navigation-drop-target,.navigation-dragging').forEach(el=>el.classList.remove('navigation-drop-target','navigation-dragging'));drag=null;}
  host.addEventListener('pointermove',e=>{
   if(!drag||drag.pointer!==e.pointerId)return;if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
   drag.moved=true;e.preventDefault();list.querySelectorAll('.navigation-drop-target').forEach(el=>el.classList.remove('navigation-drop-target'));
   const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-navigation-id]');if(row){drag.target=row.dataset.navigationId;row.classList.add('navigation-drop-target');}
   list.querySelector('[data-navigation-id="'+drag.id+'"]').classList.add('navigation-dragging');
   if(e.clientY<80)window.scrollBy(0,-18);else if(e.clientY>innerHeight-100)window.scrollBy(0,18);
  },{passive:false});
  host.addEventListener('pointerup',e=>{if(!drag||drag.pointer!==e.pointerId)return;const d=drag;cancelDrag();if(!d.moved||d.id===d.target||d.epoch!==epoch)return;const next=normalize(config),from=next.order.indexOf(d.id),to=next.order.indexOf(d.target);next.order.splice(from,1);next.order.splice(to,0,d.id);void save(next,d.id,'handle');});
  host.addEventListener('pointercancel',cancelDrag);window.addEventListener('blur',cancelDrag);window.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){cancelDrag();e.preventDefault();}});
  function bind(userId){if(owner===userId)return;owner=userId;epoch++;revision++;loadVersion++;busy=false;ready=false;cancelDrag();config=saved=normalize(null);status.textContent='';retry.hidden=true;host.setAttribute('aria-busy','false');renderNav();renderRows();}
  async function load(){
   const userId=owner,stamp=epoch,rev=revision,version=++loadVersion;if(!userId||busy)return;
   try{const {data,error}=await api.sb.from('tok_settings').select('user_id,navigation_config').eq('user_id',userId).maybeSingle();
    if(stamp!==epoch||rev!==revision||version!==loadVersion||busy)return;
    if(error||(data&&data.user_id!==userId))throw error||Error('사용자 불일치');config=saved=normalize(data?.navigation_config);ready=true;status.textContent='';retry.hidden=true;renderNav();
   }catch(_){if(stamp!==epoch||rev!==revision||version!==loadVersion)return;status.textContent='탭 설정을 불러오지 못했어요. 다시 시도해 주세요.';retry.hidden=false;}
   if(stamp===epoch)renderRows();
  }
  async function save(next,focusId,focusType){
   if(!ready||busy||!owner||!allowed(focusId)||(focusId==='home'&&restricted())){renderRows();return;}const userId=owner,stamp=epoch;revision++;busy=true;config=normalize(next);status.textContent='저장 중…';renderNav();renderRows(focusId,focusType);host.setAttribute('aria-busy','true');
   try{const {data:auth,error:authError}=await api.sb.auth.getUser();if(stamp!==epoch)return;if(authError||auth?.user?.id!==userId)throw authError||Error('로그인이 바뀌었어요.');
    const {data,error}=await api.sb.from('tok_settings').upsert({user_id:userId,navigation_config:config},{onConflict:'user_id'}).select('user_id,navigation_config').single();
    if(stamp!==epoch)return;if(error||data?.user_id!==userId||JSON.stringify(normalize(data?.navigation_config))!==JSON.stringify(config))throw error||Error('저장 결과 불일치');saved=normalize(config);status.textContent='저장했어요.';
   }catch(_){if(stamp!==epoch)return;config=normalize(saved);status.textContent='저장하지 못했어요. 이전 탭 설정으로 돌아왔어요. 다시 변경해 주세요.';renderNav();}
   finally{if(stamp===epoch){busy=false;host.setAttribute('aria-busy','false');renderRows(focusId,focusType);}}
  }
  retry.onclick=load;renderNav();renderRows();return {bind,load,policyChanged(){cancelDrag();renderNav();renderRows();}};
 }
 return {registry,normalize,primary,overflow,button,createSettings};
})();
