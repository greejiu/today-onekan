/* Private two-person rooms. Personal todo/habit state is never changed here. */
window.Together = (() => {
  'use strict';
  let api, host, dialog, user, state, epoch=0, revision=0, busy=false, tab='plans', filter='all', date='', urls=[];
  const tables=['members','invites','plans','proofs','ledger','rewards','diaries','replies'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>crypto.randomUUID();
  const when=v=>v?new Date(v).toLocaleString('ko-KR'):'';
  const num=v=>Number(v).toLocaleString('ko-KR');
  const action=(label,act,id='',cls='')=>`<button type="button" class="${cls}" data-action="${act}" data-id="${esc(id)}">${esc(label)}</button>`;
  const member=id=>state?.members.find(m=>m.user_id===id)?.nickname||'참여자';
  const person=id=>`<span class="pair-row"><span class="pair-avatar" aria-hidden="true">${esc(member(id).slice(0,1))}</span><strong>${esc(member(id))}</strong>${id===user?'<span class="pair-muted">나</span>':''}</span>`;
  const image=path=>path?`<div data-image="${esc(path)}" class="pair-muted">사진 불러오는 중…</div>`:'';
  const field=(label,name,type='text',value='',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const bodyField=(label,name,value='',max=1000)=>`<label>${label}<textarea name="${name}" maxlength="${max}" required>${esc(value)}</textarea></label>`;
  const fileField=(required=false)=>field('사진 / 그림 (최대 8MB)','image','file','','accept="image/jpeg,image/png,image/webp,image/gif" '+(required?'required':''));
  function release(){ urls.forEach(URL.revokeObjectURL); urls=[]; }
  function reset(){ epoch++; revision++; user=null; state=null; busy=false; release(); dialog?.close(); if(dialog)dialog.innerHTML=''; if(host)host.innerHTML=''; }
  function errorText(e){
    if(['42P01','PGRST202','PGRST205'].includes(e?.code))return '같이 한칸 서버 준비가 아직 완료되지 않았어요. DB 마이그레이션 적용 후 다시 시도해주세요.';
    if(e?.code==='23505')return '이미 같은 날짜에 등록한 항목이 있어요. 목록을 새로고침해서 확인해주세요.';
    if(e?.code==='23514'||e?.code==='22P02')return '입력값을 확인해주세요. 점수와 환산율은 양의 정수로 입력해요.';
    return e?.message||'연결하지 못했어요. 작성 내용은 유지했으니 다시 시도해주세요.';
  }
  async function query(table,room){
    const rows=[];
    for(let offset=0;;offset+=500){
      let q=api.sb.from('tok_pair_'+table).select('*').order(table==='members'?'user_id':'id').range(offset,offset+499);
      if(room)q=q.eq('room_id',room);const {data,error}=await q;if(error)throw error;
      rows.push(...(data||[]));if(!data||data.length<500)return rows;
    }
  }
  async function load(){
    const me=api.getUser(); if(!me){reset();host.innerHTML='<p>로그인 후 같이 한칸을 이용해주세요.</p>';return;}
    if(user!==me){reset();user=me;date=api.today();tab='plans';filter='all';}
    if(!state)host.innerHTML='<p role="status" class="pair-muted">같이 한칸을 불러오는 중…</p>';
    const ticket=++epoch;
    try{
      const rooms=await query('rooms');
      const room=rooms[0]; let next={room};
      if(room){const rows=await Promise.all(tables.map(t=>query(t,room.id)));tables.forEach((t,i)=>next[t]=rows[i]);}
      if(ticket!==epoch||api.getUser()!==me)return;
      state=next;render();
    }catch(e){if(ticket===epoch){if(!state)host.innerHTML=`<div class="pair-card"><h2>같이 한칸</h2><p class="pair-error" role="alert">${esc(errorText(e))}</p>${action('다시 불러오기','refresh')}</div>`;else status(errorText(e));}}
  }
  function status(message){const el=host.querySelector('[data-status]');if(el)el.textContent=message;}
  async function rpc(op,p){const {data,error}=await api.sb.rpc('tok_pair_mutate',{op,p:{room_id:state?.room?.id,...p}});if(error)throw error;return data;}
  async function pictures(){
    const ticket=revision;
    await Promise.all([...host.querySelectorAll('[data-image]')].map(async el=>{
      try{const {data,error}=await api.sb.storage.from('tok-pair-images').download(el.dataset.image);if(error)throw error;
        if(ticket!==revision||!el.isConnected)return;const src=URL.createObjectURL(data);urls.push(src);
        const img=document.createElement('img');img.src=src;img.alt='공유한 사진 또는 그림';img.className='pair-image';el.replaceChildren(img);
      }catch{if(el.isConnected&&ticket===revision)el.textContent='사진을 불러오지 못했어요. 새로고침으로 다시 시도해주세요.';}
    }));
  }
  function render(){
    revision++;release();
    if(!state.room){host.innerHTML=`<div class="pair-card pair-empty"><span class="pair-badge">둘이 함께, 한 칸씩</span><h2 style="margin-top:18px">같이 한칸</h2><p>작은 계획을 나누고, 서로의 하루를 응원해요.<br>직접 고른 계획과 올린 이야기만 함께 볼 수 있어요.</p><div class="pair-row" style="justify-content:center">${action('방 만들기','create_room','','pair-primary')}${action('초대로 참여하기','join')}</div><p class="pair-muted">로그인한 두 사람만 볼 수 있는 비공개 방</p><p data-status role="status" class="pair-error"></p></div>`;return;}
    const r=state.room, pending=state.proofs.filter(p=>p.user_id!==user&&!p.confirmed_at).length;
    host.innerHTML=`<div class="pair-row pair-between"><div><span class="pair-muted">같이 한칸 · 비공개</span><h2>${esc(r.name)}</h2><div class="pair-row">${state.members.map(m=>person(m.user_id)).join('')}<span class="pair-muted">${state.members.length}/2명</span></div></div><div class="pair-row">${action('새로고침','refresh')}${r.owner_id===user?action('초대 관리','invites'):''}</div></div>
      <p class="pair-muted">선택한 계획만 공유해요. 친구 확인은 그림의 평가가 아니라 약속한 수행을 확인하는 일이에요.</p>
      ${action(`내가 확인할 인증 ${pending}개`,'pending','','pair-primary')}
      <div class="pair-row pair-tabs" aria-label="같이 한칸 메뉴">${[['plans','함께하기'],['rewards','보상함'],['diaries','교환일기']].map(([id,label])=>`<button type="button" data-action="tab" data-id="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}</div>
      <p data-status role="status" class="pair-error"></p><div>${tab==='plans'?plansView():tab==='rewards'?rewardsView():diariesView()}</div>`;
    void pictures();
  }
  function plansView(){
    const list=state.plans.filter(p=>(!date||p.due_date===date)&&(filter==='mine'?p.user_id===user:filter==='friend'?p.user_id!==user:filter==='pending'?state.proofs.some(x=>x.plan_id===p.id&&x.user_id!==user&&!x.confirmed_at):true)).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.created_at.localeCompare(b.created_at));
    return `<div class="pair-row pair-between"><div class="pair-row"><label class="pair-muted">예정일<input aria-label="계획 날짜" type="date" data-date value="${esc(date)}"></label>${action('모든 날짜','all_dates')}</div>${action('계획 추가','plan','','pair-primary')}</div><div class="pair-row" style="margin-top:12px">${[['all','전체'],['mine','내 것'],['friend','친구 것']].map(([id,label])=>`<button data-action="filter" data-id="${id}" aria-pressed="${filter===id}">${label}</button>`).join('')}</div>
      ${list.length?list.map(p=>{const proof=state.proofs.find(x=>x.plan_id===p.id);return `<article class="pair-card">${person(p.user_id)}<h3 style="margin-top:14px">${esc(p.title)}</h3><p class="pair-muted">${esc(p.due_date)} · ${num(p.points)}점${p.source_kind?' · 내 '+(p.source_kind==='habit'?'습관':'할일')+'에서 연결':''}</p><span class="pair-badge">${proof?(proof.confirmed_at?`확인 완료 · +${num(p.points)}점`:'인증했어요 · 확인 기다리는 중'):'함께 약속했어요'}</span>${proof?`${image(proof.image_path)}<p class="pair-text">${esc(proof.body)}</p><p class="pair-muted">수행 ${esc(proof.performed_on)} · 제출 ${esc(when(proof.created_at))}</p>${proof.confirmed_at?`<p class="pair-muted">${esc(member(proof.confirmed_by))} 확인 · 적립 ${esc(when(proof.confirmed_at))}<br>확인된 점수와 인증은 변경할 수 없어요.</p>`:proof.user_id!==user?action('확인했어요','confirm',proof.id,'pair-primary'):''}`:p.user_id===user?`<p>${action('인증하기','proof',p.id,'pair-primary')}</p>`:''}</article>`;}).join(''):'<div class="pair-card pair-empty">이 날짜에는 아직 계획이 없어요.<p class="pair-muted">작은 약속 하나부터 시작해요.</p></div>'}`;
  }
  function rewardsView(){
    return `${action('나에게 보상하기','reward','','pair-primary')}<p class="pair-muted">1점 = ${num(state.room.rate)}원 상당 · 실제 결제나 정산 없이 자기 보상을 기록해요.</p>${state.members.map(m=>{
      const ledger=state.ledger.filter(x=>x.user_id===m.user_id),earned=ledger.filter(x=>x.kind==='earn').reduce((s,x)=>s+x.amount,0),remaining=ledger.reduce((s,x)=>s+x.amount,0);
      return `<article class="pair-card">${person(m.user_id)}<div class="pair-stats"><div><strong>${num(earned)}</strong>총 적립</div><div><strong>${num(earned-remaining)}</strong>사용</div><div><strong>${num(remaining)}</strong>잔여 점수</div></div><span class="pair-badge">보상 가능 ${num(remaining*state.room.rate)}원 상당</span>
      ${state.rewards.filter(x=>x.user_id===m.user_id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(x=>`<div class="pair-reply"><strong>${esc(x.title)}</strong><p>${num(x.points)}점 · ${num(x.points*x.rate)}원 상당 ${x.cancelled_at?'· 취소됨':''}</p><p class="pair-muted">${esc(x.reward_date)} · ${esc(x.memo)}</p>${!x.cancelled_at&&m.user_id===user?action('보상 기록 취소','cancel_reward',x.id):''}</div>`).join('')}
      <details style="margin-top:16px"><summary>적립 · 사용 · 취소 내역 (${ledger.length})</summary>${ledger.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(x=>{const proof=state.proofs.find(p=>p.id===x.proof_id);const reason=x.kind==='earn'?state.plans.find(p=>p.id===proof?.plan_id)?.title:state.rewards.find(r=>r.id===x.reward_id)?.title;return `<p class="pair-muted">${esc(when(x.created_at))} · ${esc(reason)} · ${{earn:'친구 확인',spend:'보상 사용',cancel:'사용 취소'}[x.kind]} ${x.amount>0?'+':''}${num(x.amount)}점</p>`;}).join('')||'<p>아직 내역이 없어요.</p>'}</details></article>`;
    }).join('')}`;
  }
  function diariesView(){
    const days=[...new Set(state.diaries.map(d=>d.entry_date))].sort().reverse();
    return `${action('하루 이야기 쓰기','diary','','pair-primary')}<p class="pair-muted">한 줄이어도 좋아요. 초안은 나만 보고, ‘함께 보기로 올리기’를 눌러 공유해요.</p>${days.map(day=>`<h3 style="margin-top:24px">${esc(day)}</h3>${state.diaries.filter(d=>d.entry_date===day).map(d=>`<article class="pair-card">${person(d.user_id)}<p class="pair-muted">${esc(d.mood)} · ${d.published_at?'함께 보는 이야기':'나만 보는 초안'}</p><p class="pair-text">${esc(d.body)}</p>${image(d.image_path)}${d.user_id===user?`<div class="pair-row">${action('수정','diary',d.id)}${action('삭제','delete_diary',d.id)}</div>`:''}${d.published_at?`<div class="pair-reply">${state.replies.filter(x=>x.diary_id===d.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(x=>`<div class="pair-reply">${person(x.user_id)}<p class="pair-text">${esc(x.body)}</p><p class="pair-muted">${esc(when(x.updated_at))}</p>${x.user_id===user?action('답글 수정','edit_reply',x.id)+action('답글 삭제','delete_reply',x.id):''}</div>`).join('')}${action('짧은 답글 남기기','reply',d.id)}</div>`:''}</article>`).join('')}`).join('')||'<div class="pair-card pair-empty">아직 이야기가 없어요. 오늘은 어땠나요?</div>'}`;
  }
  async function upload(form){
    const file=form.elements.image?.files[0];if(!file)return form.dataset.imagePath||null;
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>8388608)throw new Error('사진은 JPEG, PNG, WebP, GIF 형식으로 8MB 이하만 올릴 수 있어요.');
    // Retain successful upload when a subsequent database request fails.
    const key=[file.name,file.size,file.lastModified].join(':');if(form.dataset.fileKey===key)return form.dataset.imagePath;
    const path=`${state.room.id}/${user}/${uid()}`;
    const {error}=await api.sb.storage.from('tok-pair-images').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
    form.dataset.fileKey=key;form.dataset.imagePath=path;return path;
  }
  function form(title,fields,onSave,buttons='<button type="submit" class="pair-primary">저장하기</button>',initialImage=''){
    dialog.innerHTML=`<form><h3>${esc(title)}</h3>${fields}<p class="pair-error" data-error role="alert"></p><div class="pair-actions">${buttons}<button type="button" data-close>닫기</button></div></form>`;
    const f=dialog.querySelector('form');f.dataset.imagePath=initialImage||'';const requestId=uid();
    f.onsubmit=async e=>{e.preventDefault();if(busy)return;if(!f.reportValidity())return;const saving={};busy=saving;const ticket=epoch,me=user;const controls=[...f.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);f.querySelector('[data-error]').textContent='저장 중…';
      try{await onSave(f,requestId,e.submitter?.value);if(user===me&&ticket===epoch){dialog.close();await load();}}
      catch(err){if(user===me&&dialog.open){f.querySelector('[data-error]').textContent=errorText(err);}}
      finally{if(busy===saving)busy=false;controls.forEach(b=>b.disabled=false);}
    };
    f.querySelector('[data-close]').onclick=()=>{if(!busy)dialog.close();};dialog.showModal();return f;
  }
  const values=f=>Object.fromEntries(new FormData(f));
  function editor(op,id){
    if(op==='create_room')return form('둘만의 방 만들기',field('방 이름','name','text','','required maxlength="60"')+field('내 별명','nickname','text','','required maxlength="30"')+field('1점당 보상 금액 (원)','rate','number',100,'required min="1" max="1000000" step="1"')+'<p class="pair-muted">100원은 제안 기본값이에요. 원하는 환산율을 확인하고 방을 만들어주세요. 생성 후에는 변경할 수 없어요.</p>',(f,k)=>rpc(op,{...values(f),id:k}));
    if(op==='join')return form('초대로 참여하기',field('초대 코드','id','text','','required autocomplete="off"')+field('내 별명','nickname','text','','required maxlength="30"'),f=>rpc(op,{...values(f),id:f.elements.id.value.trim()}));
    if(op==='plan'){
      const sources=api.sources();const options=sources.map((s,i)=>`<option value="${i}">${s.kind==='habit'?'습관':'할일'} · ${esc(s.title)}</option>`).join('');
      const f=form('함께할 계획',`<label>선택한 개인 계획 연결<select name="source"><option value="">방에서 새 계획 만들기</option>${options}</select></label><p class="pair-muted">선택한 제목만 가져와요. 메모와 첨부는 공유하지 않아요.</p>`+field('계획 제목','title','text','','required maxlength="160"')+field('예정일 / 수행 회차','due_date','date',date||api.today(),'required')+field('약속할 점수','points','number','','required min="1" max="1000000" step="1"')+'<p class="pair-muted">점수는 직접 정해주세요. 인증을 올리고 상대가 확인하면 적립돼요.</p>',(f,k)=>{const v=values(f),s=sources[v.source];return rpc(op,{...v,id:k,source_kind:s?.kind||null,source_id:s?.id||null});});
      f.elements.source.onchange=()=>{const s=sources[f.elements.source.value];f.elements.title.value=s?.title||'';f.elements.title.readOnly=!!s;};return;
    }
    if(op==='proof'){const p=state.plans.find(x=>x.id===id);return form('수행 인증하기',`<p>${esc(p.title)} · ${esc(p.due_date)} · ${num(p.points)}점</p>`+fileField(true)+bodyField('짧은 설명','body')+'<p class="pair-muted">제출 후 증빙은 수정할 수 없어요. 올릴 내용을 확인해주세요.</p>',async(f,k)=>rpc(op,{id:k,plan_id:id,body:f.elements.body.value,image_path:await upload(f)}));}
    if(op==='reward'){
      const remaining=state.ledger.filter(x=>x.user_id===user).reduce((s,x)=>s+x.amount,0);
      const f=form('나에게 보상하기',`<p>사용 가능한 점수: ${num(remaining)}점</p>`+field('보상 이름','title','text','','required maxlength="100"')+field('사용할 점수','points','number','','required min="1" max="'+remaining+'" step="1"')+'<p data-amount class="pair-muted">점수를 입력하면 환산 금액을 보여드려요.</p>'+field('보상 날짜','reward_date','date',api.today(),'required')+field('메모 (선택)','memo','text','','maxlength="1000"'),(f,k)=>rpc(op,{...values(f),id:k}));f.elements.points.oninput=()=>f.querySelector('[data-amount]').textContent=num(Number(f.elements.points.value)*state.room.rate)+'원 상당 · 실제 결제가 아닌 기록이에요';return;
    }
    if(op==='diary'){
      const d=state.diaries.find(x=>x.id===id);let existing=d;
      const f=form('오늘은 어땠어?',field('이야기 날짜','entry_date','date',d?.entry_date||api.today(),'required '+(d?'readonly':''))+field('오늘 기분 (선택)','mood','text',d?.mood||'','maxlength="30"')+bodyField('오늘은 어땠어?','body',d?.body||'',10000)+fileField()+`${d?.image_path?'<p class="pair-muted">현재 사진을 유지해요. 새 파일을 선택하면 바꿔요.</p>':''}`,
        async(f,k,mode)=>rpc(op,{...values(f),id:existing?.id||k,publish:mode==='publish',image_path:await upload(f)}),
        d?.published_at?'<button type="submit" value="publish" class="pair-primary">함께 보는 글 수정하기</button>':'<button type="submit" value="draft">나만 보는 초안 저장</button><button type="submit" value="publish" class="pair-primary">함께 보기로 올리기</button>',d?.image_path);
      // Pick up today's existing entry to avoid accidentally creating a second one.
      if(!d){const findExisting=()=>{existing=state.diaries.find(x=>x.user_id===user&&x.entry_date===f.elements.entry_date.value);if(existing){f.elements.mood.value=existing.mood;f.elements.body.value=existing.body;f.dataset.imagePath=existing.image_path||'';f.querySelector('[data-error]').textContent=existing.published_at?'이 날짜에 공개한 일기를 수정해요. 저장하면 공개 상태를 유지해요.':'이 날짜의 초안을 불러왔어요.';}else{f.querySelector('[data-error]').textContent='';f.dataset.imagePath='';}};findExisting();f.elements.entry_date.onchange=findExisting;}return;
    }
    if(op==='reply'||op==='edit_reply'){const x=state.replies.find(x=>x.id===id);return form('짧은 답글',bodyField('답글','body',op==='edit_reply'?x.body:'',500),(f,k)=>rpc('reply',{id:op==='edit_reply'?id:k,diary_id:op==='edit_reply'?x.diary_id:id,body:f.elements.body.value}));}
    if(op==='invites'){
      const inv=state.invites.filter(x=>!x.revoked_at&&!x.accepted_by).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
      return form('초대 관리',state.members.length>=2?'<p>두 사람이 모두 모였어요.</p>':`<p>상대가 로그인한 뒤 ‘초대로 참여하기’에서 입력하면 돼요.</p>${inv?`<p class="pair-invite-code">${esc(inv.id)}</p><p class="pair-muted">${esc(when(inv.expires_at))}까지 ${new Date(inv.expires_at)<new Date()?'· 만료됨':''}</p>`:'<p>사용 가능한 초대가 없어요.</p>'}`,(f,k,mode)=>rpc(mode,{id:k}),state.members.length>=2?'':'<button type="submit" value="invite">새 코드 발급</button><button type="submit" value="revoke_invite">초대 취소</button>');
    }
  }
  async function click(e){
    const button=e.target.closest('[data-action]');if(!button||busy)return;const {action:op,id}=button.dataset;
    if(op==='refresh'){await load();return;}if(op==='tab'){tab=id;render();return;}if(op==='filter'){filter=id;render();return;}if(op==='all_dates'){date='';render();return;}if(op==='pending'){tab='plans';filter='pending';date='';render();return;}
    if(['confirm','cancel_reward','delete_diary','delete_reply'].includes(op)){
      const labels={confirm:'이 약속을 수행한 것을 확인하고 점수를 적립할까요?',cancel_reward:'보상 기록을 취소하고 사용 점수를 되돌릴까요?',delete_diary:'이 일기와 달린 답글을 삭제할까요?',delete_reply:'이 답글을 삭제할까요?'};
      form('확인해주세요',`<p>${labels[op]}</p>`,()=>rpc(op,{id}),'<button type="submit" class="pair-primary">확인</button>');return;
    }
    editor(op,id);
  }
  function init(config){api=config;host=document.getElementById('togetherRoot');dialog=document.getElementById('togetherDialog');host.addEventListener('click',click);host.addEventListener('change',e=>{if(e.target.matches('[data-date]')){date=e.target.value;render();}});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});window.addEventListener('focus',()=>{if(host.getClientRects().length&&!dialog.open&&!busy)void load();});}
  return {init,open:load,reset};
})();
