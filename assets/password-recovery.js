window.createOnekanRecovery = function(sb) {
 'use strict';
 const redirect='https://greejiu.github.io/today-onekan/?auth=recovery';
 const original=new URL(location.href),hash=new URLSearchParams(original.hash.slice(1));
 const intent=original.searchParams.get('auth')==='recovery'||hash.get('type')==='recovery'||hash.has('error');
 const markerKey='onekan_recovery_transaction';let marker=null;
 try{marker=JSON.parse(sessionStorage.getItem(markerKey));if(!marker||marker.until<Date.now()||hash.has('error'))marker=null;}catch(_){}
 function clearMarker(){marker=null;try{sessionStorage.removeItem(markerKey);}catch(_){} }
 let mode=intent||marker?'checking':'closed',identity=null,candidate=null,epoch=0,busy=false,nextSend=0;
 const box=document.createElement('section');box.id='passwordRecoveryBox';box.className='card';box.style.cssText='max-width:360px;margin:80px auto;padding:24px';
 box.innerHTML='<h1>비밀번호 재설정</h1><p id="recoveryStatus" role="status" aria-live="polite"></p><form id="recoveryRequest"><label for="recoveryEmail">로그인 이메일</label><input id="recoveryEmail" type="email" autocomplete="email" required><button type="submit">재설정 메일 보내기</button></form><form id="recoveryUpdate" hidden><label for="recoveryPassword">새 비밀번호</label><input id="recoveryPassword" type="password" minlength="8" autocomplete="new-password" required><label for="recoveryConfirm">새 비밀번호 확인</label><input id="recoveryConfirm" type="password" minlength="8" autocomplete="new-password" required><button type="submit">비밀번호 변경</button></form><button type="button" id="recoveryBack">로그인으로 돌아가기</button>';
 document.getElementById('authBox').after(box);
 const $=id=>document.getElementById(id),status=$('recoveryStatus');
 function cleanURL(){const url=new URL(location.href);url.hash='';url.searchParams.delete('auth');history.replaceState(null,'',url.pathname+url.search);}
 function render(message){box.hidden=mode==='closed';$('recoveryRequest').hidden=!['request','invalid'].includes(mode);$('recoveryUpdate').hidden=mode!=='update';if(message!==undefined)status.textContent=message;if(mode!=='closed'){$('authBox').style.display='none';$('app').style.display='none';}box.querySelectorAll('button').forEach(b=>b.disabled=busy);}
 function invalid(){identity=null;clearMarker();mode='invalid';cleanURL();render('링크가 만료되었거나 올바르지 않아요. 재설정 메일을 다시 받아 주세요.');}
 function onEvent(event,session){
  if(event==='PASSWORD_RECOVERY'){
   const stamp=++epoch;identity=null;candidate=session?.user?.id;mode='checking';render('링크를 확인하고 있어요.');
   setTimeout(async()=>{try{const {data,error}=await sb.auth.getUser();if(stamp!==epoch)return;if(error||!session?.user?.id||data?.user?.id!==session.user.id)throw Error('identity');identity=data.user.id;marker={id:identity,until:Math.min(Date.now()+15*60*1000,session.expires_at?session.expires_at*1000:Infinity)};try{sessionStorage.setItem(markerKey,JSON.stringify(marker));}catch(_){}mode='update';cleanURL();render('새 비밀번호를 입력해 주세요.');}catch(_){if(stamp===epoch)invalid();}},0);
  }else if((mode==='update'&&session?.user?.id!==identity)||(mode==='checking'&&(event==='SIGNED_OUT'||(candidate&&session?.user?.id!==candidate)))){epoch++;invalid();}
 }
 async function settle(){if(mode!=='checking')return;try{await sb.auth.getSession();}catch(_){if(epoch===0)invalid();return;}if(mode==='checking'&&epoch===0){const stamp=epoch;if(marker&&!intent){try{const {data,error}=await sb.auth.getUser();if(epoch!==stamp)return;if(error||data?.user?.id!==marker.id||marker.until<Date.now())throw Error('identity');identity=marker.id;mode='update';render('새 비밀번호를 입력해 주세요.');return;}catch(_){}}if(epoch===stamp)invalid();}}
 $('recoveryRequest').onsubmit=async e=>{e.preventDefault();if(busy)return;if(Date.now()<nextSend){render('잠시 후 다시 보내 주세요.');return;}const stamp=epoch;busy=true;render('메일을 요청하고 있어요.');try{const {error}=await sb.auth.resetPasswordForEmail($('recoveryEmail').value.trim(),{redirectTo:redirect});if(stamp!==epoch)return;if(error)throw error;nextSend=Date.now()+60000;render('등록된 이메일이라면 재설정 메일을 받을 수 있어요. 메일함과 스팸함을 확인해 주세요.');}catch(_){if(stamp===epoch)render('메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');}finally{busy=false;render();}};
 $('recoveryUpdate').onsubmit=async e=>{e.preventDefault();if(busy||mode!=='update'||!identity)return;const password=$('recoveryPassword').value;if(password.length<8||password!==$('recoveryConfirm').value){render('8자 이상의 비밀번호를 두 칸에 동일하게 입력해 주세요.');return;}const stamp=epoch,id=identity;busy=true;render('비밀번호를 변경하고 있어요.');try{const {data:verified,error:authError}=await sb.auth.getUser();if(stamp!==epoch)return;if(authError||verified?.user?.id!==id){invalid();return;}const {error}=await sb.auth.updateUser({password});if(stamp!==epoch)return;if(error)throw error;mode='success';identity=null;clearMarker();epoch++;$('recoveryPassword').value=$('recoveryConfirm').value='';cleanURL();await sb.auth.signOut({scope:'local'});render('비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.');}catch(error){if(stamp===epoch){if([401,403].includes(error.status))invalid();else render('변경하지 못했어요. 다시 시도하거나 재설정 메일을 새로 받아 주세요.');}}finally{busy=false;render();}};
 $('recoveryBack').onclick=async()=>{if(busy)return;const active=mode==='update'||mode==='checking';epoch++;identity=null;clearMarker();mode='closed';cleanURL();render();if(active)await sb.auth.signOut({scope:'local'});$('authBox').style.display='';$('app').style.display='none';};
 const forgot=document.createElement('button');forgot.type='button';forgot.id='forgotPasswordBtn';forgot.className='alt';forgot.textContent='비밀번호를 잊으셨나요?';forgot.onclick=()=>{epoch++;mode='request';$('recoveryEmail').value=$('authEmail').value;render('재설정 메일을 받을 이메일을 입력해 주세요.');};$('authBox').append(forgot);
 render(intent?'링크를 확인하고 있어요.':'');
 return {onEvent,settle,ownsScreen:()=>mode!=='closed',redirect};
};
