// 2026-10-18 2단계 시간블록(BLOCK-01~04) 검증. 가짜 Supabase만 씀(운영 데이터·외부 요청 없음).
// 배정(시작 포함·종료 제외, 걸쳐도 한 번, 예전 겹친 블록도 한 번, 구간 밖, 하루종일 별도), 여러 날 항목은 시간블록에서 시작일만·타임라인은 날짜별,
// 저장할 때만 검사(30분 이상·겹침 금지·하루 안), 기존 블록은 자동 수정 없이 경고, 블록 수정·삭제 시 항목 날짜·시간 그대로.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
const ok=m=>console.log('PASS '+m);
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:900},timezoneId:'Asia/Seoul'}),errors=[],dialogs=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 await fixture(p);
 await p.evaluate(async()=>{
  const d=n=>addDaysStr(todayStr(),n),T=(k,a,s,e2,b2)=>OnekanPeriod.patch(k,{allDay:false,startDate:a,endDate:b2||a,startTime:s,endTime:e2});
  // 예전에 만든 '저녁'은 '오후'와 겹치고 30분보다 짧음(자동 수정하지 않아야 함)
  mockRows.tok_time_blocks=[{id:'b1',user_id:'test',title:'오전',start_minute:360,end_minute:720,sort_order:0},{id:'b2',user_id:'test',title:'오후',start_minute:720,end_minute:1080,sort_order:1},{id:'b3',user_id:'test',title:'저녁',start_minute:1020,end_minute:1040,sort_order:2}];
  mockRows.tok_todos=[
   {id:'t9',user_id:'test',title:'아침 할일',is_done:false,...T('todo',d(0),'09:00','09:30')},
   {id:'t12',user_id:'test',title:'정오 할일',is_done:false,...T('todo',d(0),'12:00','12:30')},
   {id:'t1710',user_id:'test',title:'겹친 블록 할일',is_done:false,...T('todo',d(0),'17:10','17:40')},
   {id:'t20',user_id:'test',title:'밤 할일',is_done:false,...T('todo',d(0),'20:00','21:00')},
   {id:'tall',user_id:'test',title:'하루종일 할일',is_done:false,...OnekanPeriod.patch('todo',{allDay:true,startDate:d(0),endDate:d(0)})},
  ];
  mockRows.tok_events=[{id:'span',user_id:'test',title:'두 블록 일정',...T('event',d(0),'11:30','13:30')},{id:'night',user_id:'test',title:'자정 넘는 일정',...T('event',d(0),'23:00','01:00',d(1))}];
  await loadAll();showPage('all');
 });
 const before=await p.evaluate(()=>JSON.stringify({b:mockRows.tok_time_blocks,t:mockRows.tok_todos,e:mockRows.tok_events}));
 await p.locator('#allViewTabs [data-common-view=day]').click();if(await p.evaluate(()=>allViews.prefs().day)!=='blocks')await p.locator('#allSubTabs [data-all-sub=blocks]').click();
 await p.evaluate(()=>allViews.selectDate(todayStr()));await p.waitForTimeout(200);
 const body=p.locator('#allHomeDay #homeTodayBlockBody'),card=m=>body.locator('.ag-block-card[data-block-start="'+m+'"]');
 const R=id=>'.plan-row[data-id="'+id+'"]',inCard=async(m,id)=>card(m).locator(R(id)).count(),total=id=>body.locator(R(id)).count(); // 줄 요소만(체크박스에도 data-id가 있음)
 // 1) 배정: 시작 포함·종료 제외, 두 블록에 걸쳐도 시작 블록 한 번, 예전 겹친 블록은 보이는 순서상 첫 블록에만, 구간 밖, 하루종일은 따로
 assert.equal(await inCard(360,'t9'),1,'09:00 → 오전');
 assert.equal(await inCard(720,'t12'),1,'12:00 → 오후(시작 포함)');assert.equal(await inCard(360,'t12'),0,'오전 종료 12:00은 제외');
 assert.equal(await inCard(360,'span'),1,'11:30~13:30 → 시작 블록(오전)');assert.equal(await total('span'),1,'두 블록에 걸쳐도 한 번');
 assert.equal(await inCard(720,'t1710'),1,'겹친 예전 블록: 첫 블록(오후)에만');assert.equal(await inCard(1020,'t1710'),0);assert.equal(await total('t1710'),1);
 const outside=body.locator('.ag-block-outside');assert.equal((await outside.textContent()).trim(),'구간 밖');
 assert.equal(await total('t20'),1,'20:00 → 구간 밖');assert.equal(await inCard(360,'t20')+await inCard(720,'t20'),0);
 assert.equal(await total('tall'),0,'하루종일은 시간블록 목록에 없음');assert.equal(await p.locator('#allHomeDay #homeTodayBlockAllDay '+R('tall')).count(),1,'하루종일 영역 유지');
 assert.equal(await total('night'),1,'자정 넘는 일정: 시작일(구간 밖)');
 ok('배정: 시작 포함·종료 제외, 걸쳐도 한 번, 예전 겹친 블록도 한 번, 구간 밖, 하루종일 별도');
 // 2) 여러 날 항목: 다음 날 시간블록에는 없음, 타임라인에는 그날 구간(00:00~01:00)
 await p.locator('#allNextBtn').click();await p.waitForTimeout(200);assert.equal(await total('night'),0,'다음 날 시간블록에는 없음');
 await p.locator('#allSubTabs [data-all-sub=timeline]').click();await p.waitForTimeout(200);assert(await p.locator('#allHomeDay #homeTimelinePanel [data-id="night"]').count()>=1,'타임라인에는 이어지는 구간');
 await p.locator('#allSubTabs [data-all-sub=blocks]').click();await p.locator('#allPrevBtn').click();await p.waitForTimeout(200);
 ok('여러 날 항목: 시간블록은 시작일에만, 타임라인은 날짜별 구간');
 // 3) 설정: 기존 블록은 고치지 않고 경고만
 await p.evaluate(()=>showPage('settings'));await p.waitForTimeout(150);
 const row=id=>p.locator('#settingsBlockList .hs-block-row[data-id="'+id+'"]');
 const warn=await row('b3').locator('.hs-block-warn').textContent();assert(/30분보다 짧아요/.test(warn)&&/‘오후’와 겹쳐요/.test(warn),'저녁 경고: '+warn);
 assert(/‘저녁’과 겹쳐요/.test(await row('b2').locator('.hs-block-warn').textContent()),'오후도 겹침 경고');assert.equal(await row('b1').locator('.hs-block-warn').count(),0);
 assert.equal(await p.evaluate(()=>mockWrites.filter(w=>w.table==='tok_time_blocks').length),0,'경고만, 자동 수정 없음');
 ok('기존 규칙 위반 블록: 자동 수정 없이 경고');
 // 4) 추가할 때 검사: 30분 미만·겹침은 막고 입력 유지, 올바르면 추가
 const add=async(name,s,e)=>{await p.locator('#settingsBlockName').fill(name);await p.locator('#settingsBlockStart').fill(s);await p.locator('#settingsBlockEnd').fill(e);await p.locator('#settingsBlockAddBtn').click();await p.waitForTimeout(150);};
 dialogs.length=0;await add('짧음','20:00','20:15');assert(/30분 이상/.test(dialogs.pop()||''),'30분 미만 막음');assert.equal(await p.locator('#settingsBlockName').inputValue(),'짧음','입력 유지');
 await add('겹침','10:00','13:00');assert(/‘오전’.*겹쳐요/.test(dialogs.pop()||''),'겹침 막음');
 await add('역순','21:00','20:00');assert(/종료 시간이 시작 시간보다/.test(dialogs.pop()||''),'종료 < 시작 막음');
 assert.equal(await p.evaluate(()=>mockWrites.filter(w=>w.table==='tok_time_blocks').length),0,'막힌 추가는 저장 안 함');
 await add('새벽','00:00','05:00');await p.waitForFunction(()=>mockRows.tok_time_blocks.some(b=>b.title==='새벽'&&b.start_minute===0&&b.end_minute===300));
 ok('추가: 30분 미만·겹침·역순 막고 입력 유지, 00:00~05:00 추가');
 // 5) 시작·종료를 함께 고치고 [저장]에서 한 번에 검사·저장(2026-10-18 결 요청)
 const blockWrites=()=>p.evaluate(()=>mockWrites.filter(w=>w.table==='tok_time_blocks'));
 const startIn=id=>row(id).locator('.hs-block-start-input'),endIn=id=>row(id).locator('.hs-block-end-input'),saveBtn=id=>row(id).locator('.hs-block-save'),cancelBtn=id=>row(id).locator('.hs-block-cancel');
 const blk=id=>p.evaluate(i=>{const b=mockRows.tok_time_blocks.find(x=>x.id===i);return [b.start_minute,b.end_minute];},id);
 // a) 06~12 → 18~24: 시작을 먼저 18:00으로 바꿔도(중간 값 18~12) 막히거나 저장되지 않고, 종료까지 바꾼 뒤 한 번에 저장
 let w0=(await blockWrites()).length;dialogs.length=0;
 await startIn('b1').fill('18:00');assert(await saveBtn('b1').isVisible(),'고치는 중 → 저장·취소 버튼');assert.equal((await blockWrites()).length,w0,'중간 값은 저장 안 함');assert.equal(dialogs.length,0,'중간 값으로 막지 않음');
 await endIn('b1').fill('00:00');await saveBtn('b1').click();await p.waitForFunction(()=>{const b=mockRows.tok_time_blocks.find(x=>x.id==='b1');return b.start_minute===1080&&b.end_minute===1440;});
 const wb1=(await blockWrites()).slice(w0);assert.equal(wb1.length,1,'요청 한 번');assert.deepEqual(wb1[0].values,{start_minute:1080,end_minute:1440},'시작·종료 함께');
 assert(await saveBtn('b1').isHidden(),'저장 후 버튼 숨김');assert.equal(await startIn('b1').inputValue(),'18:00');
 // b) [취소] → 원래 값, 저장 없음 / Esc도 같음
 w0=(await blockWrites()).length;
 await startIn('b2').fill('13:00');await cancelBtn('b2').click();assert.equal(await startIn('b2').inputValue(),'12:00','취소 → 원래 값');assert(await saveBtn('b2').isHidden());
 await endIn('b2').fill('15:00');await endIn('b2').press('Escape');assert.equal(await endIn('b2').inputValue(),'18:00','Esc → 원래 값');
 assert.equal((await blockWrites()).length,w0,'취소는 저장 안 함');assert.deepEqual(await blk('b2'),[720,1080]);
 // c) 검사에 걸리면: 저장 안 함, 이유 표시, 입력 유지(고쳐서 다시 저장 가능) → 취소하면 원래 값
 await endIn('b2').fill('19:00');await saveBtn('b2').click();await p.waitForTimeout(100);
 const msg=await row('b2').locator('.hs-block-msg').textContent();assert(/‘오전’\(18:00~24:00\)과 시간이 겹쳐요/.test(msg)&&/원래 시간\(12:00~18:00\) 그대로/.test(msg),'검사 실패 안내: '+msg);
 assert.equal(await endIn('b2').inputValue(),'19:00','입력 유지');assert.equal((await blockWrites()).length,w0);assert.deepEqual(await blk('b2'),[720,1080],'블록 원래 시간');
 await cancelBtn('b2').click();assert.equal(await endIn('b2').inputValue(),'18:00');assert.equal(await row('b2').locator('.hs-block-msg').count(),0);
 // d) 저장 실패: 블록은 원래 시간, 입력·안내 유지(목록이 다시 그려져도), 다시 저장하면 성공
 await p.evaluate(()=>{mockFailure='simulated failure';});await endIn('b2').fill('17:00');await saveBtn('b2').click();
 await p.waitForSelector('#settingsBlockList .hs-block-row[data-id="b2"] .hs-block-msg');
 assert(/저장하지 못했어요.*원래 시간\(12:00~18:00\) 그대로/.test(await row('b2').locator('.hs-block-msg').textContent()));assert.deepEqual(await blk('b2'),[720,1080],'실패 → 블록 원래 시간');
 await p.evaluate(()=>renderSettingsBlockList());assert.equal(await endIn('b2').inputValue(),'17:00','다시 그려져도 고치던 값 유지');assert(await saveBtn('b2').isVisible());
 await saveBtn('b2').click();await p.waitForFunction(()=>mockRows.tok_time_blocks.find(x=>x.id==='b2').end_minute===1020);assert.equal(await row('b2').locator('.hs-block-msg').count(),0);
 // e) 이름만 바꾸기는 그대로 허용, Enter로 저장, 고쳐 저장하면 경고 사라짐
 await row('b3').locator('.hs-block-name-input').fill('저녁 산책');await row('b3').locator('.hs-block-name-input').press('Enter');await p.waitForFunction(()=>mockRows.tok_time_blocks.find(b=>b.id==='b3').title==='저녁 산책');
 await endIn('b3').fill('17:30');await endIn('b3').press('Enter');await p.waitForFunction(()=>mockRows.tok_time_blocks.find(b=>b.id==='b3').end_minute===1050);
 assert.equal(await p.locator('#settingsBlockList .hs-block-warn').count(),0,'고친 뒤 경고 없음');
 // 항목 날짜·시간은 어떤 경우에도 그대로(취소·검사 실패·저장 실패·성공 모두)
 const mid=JSON.parse(await p.evaluate(()=>JSON.stringify({t:mockRows.tok_todos,e:mockRows.tok_events}))),orig=JSON.parse(before);
 assert.deepEqual(mid,{t:orig.t,e:orig.e},'항목 날짜·시간 그대로');assert(await p.evaluate(()=>mockWrites.every(w=>w.table==='tok_time_blocks')),'블록 외 쓰기 없음');
 await p.screenshot({path:'test-results/time-blocks-settings.png'}).catch(()=>{});
 ok('시작·종료 함께 편집: 06~12 → 18~24 한 번에 저장, 취소·Esc = 원래 값, 검사·저장 실패 = 블록 원래 시간·입력 유지·재시도, 항목 불변');
 // 6) 블록 수정·삭제 → 보이는 자리만 다시 계산
 await p.evaluate(()=>showPage('all'));await p.waitForTimeout(200);
 assert.equal(await body.locator('.ag-block-outside ~ .agenda-flat '+R('t9')).count(),1,'오전을 18~24로 옮김 → 09:00은 구간 밖');
 assert.equal(await inCard(1020,'t1710'),1,'17:10 → 저녁 산책(17:00~17:30)');
 await p.evaluate(()=>showPage('settings'));await row('b2').locator('.hs-cat-del').click();await p.waitForFunction(()=>!mockRows.tok_time_blocks.some(b=>b.id==='b2'));
 assert(/날짜·시간은 그대로/.test(dialogs.pop()||''),'삭제 확인 문구');
 await p.evaluate(()=>showPage('all'));await p.waitForTimeout(200);
 assert.equal(await card(720).count(),0);assert.equal(await body.locator('.ag-block-outside ~ .agenda-flat '+R('t12')).count(),1,'오후 삭제 → 12:00은 구간 밖');
 const after=JSON.parse(await p.evaluate(()=>JSON.stringify({t:mockRows.tok_todos,e:mockRows.tok_events})));assert.deepEqual(after,{t:orig.t,e:orig.e},'삭제 후에도 항목 그대로');
 // 빈칸 입력 = 블록 시작부터 30분(기존 규칙 유지) — 18~24로 옮긴 오전 블록
 await card(1080).locator('.add-slot').click();const inp=card(1080).locator('.inline-add-input');await inp.fill('저녁 블록 할일');await inp.press('Enter');
 await p.waitForFunction(()=>mockRows.tok_todos.some(t=>t.title==='저녁 블록 할일'));const nt=await p.evaluate(()=>mockRows.tok_todos.find(t=>t.title==='저녁 블록 할일'));
 assert.equal(nt.todo_time.slice(0,5),'18:00');assert.equal(nt.end_time.slice(0,5),'18:30','블록 시작부터 30분');await p.keyboard.press('Escape');
 await p.screenshot({path:'test-results/time-blocks-day.png'}).catch(()=>{});
 ok('블록 수정·삭제: 항목 날짜·시간 그대로, 표시 자리만 재계산 / 빈칸 = 블록 시작부터 30분');
 // 6-2) 저장 중 잠금(2026-10-18 결 검토): 응답을 늦춰 두고 재입력·중복 저장·취소·이름·삭제를 시도 → 모두 무시, 응답 뒤 서버·로컬·화면 값 일치
 await p.evaluate(()=>showPage('settings'));await p.waitForTimeout(100);
 const b4=await p.evaluate(()=>mockRows.tok_time_blocks.find(b=>b.title==='새벽').id);
 const ui=async id=>({s:await startIn(id).inputValue(),e:await endIn(id).inputValue()}),local=id=>p.evaluate(i=>{const b=timeBlocks.find(x=>x.id===i);return [b.start_minute,b.end_minute];},id);
 const tryEverything=id=>p.evaluate(id=>{const row=document.querySelector('#settingsBlockList .hs-block-row[data-id="'+id+'"]'),q=c=>row.querySelector(c),fire=(el,t,o)=>el.dispatchEvent(o?new KeyboardEvent(t,{key:o,bubbles:true}):new Event(t,{bubbles:true}));
  const st=q('.hs-block-start-input'),en=q('.hs-block-end-input'),nm=q('.hs-block-name-input');
  st.value='09:00';fire(st,'input');fire(st,'change');en.value='11:00';fire(en,'input');   // 저장 중 다시 입력
  fire(en,'keydown','Enter');q('.hs-block-save').click();q('.hs-block-save').dispatchEvent(new MouseEvent('click',{bubbles:true})); // 중복 저장
  fire(en,'keydown','Escape');q('.hs-block-cancel').click();                                // 취소
  nm.value='바뀐 이름';fire(nm,'blur');                                                       // 이름
  q('.hs-cat-del').click();q('.hs-cat-del').onclick?.();                                       // 삭제(잠긴 버튼 + 처리 함수 직접)
  const r=document.querySelector('#settingsBlockList .hs-block-row[data-id="'+id+'"]'),g=c=>r.querySelector(c);
  return {busy:r.getAttribute('aria-busy'),disabled:['.hs-block-start-input','.hs-block-end-input','.hs-block-name-input','.hs-block-save','.hs-block-cancel','.hs-cat-del'].every(c=>g(c).disabled),label:g('.hs-block-save').textContent,start:g('.hs-block-start-input').value,end:g('.hs-block-end-input').value};},id);
 // a) 성공: 00~05 → 06~08, 응답 700ms 지연 + 그 사이 전체 다시 불러오기(loadAll)
 let w1=(await blockWrites()).length,d1=dialogs.length;
 await startIn(b4).fill('06:00');await endIn(b4).fill('08:00');await p.evaluate(()=>{window.mockDelay=700;});await saveBtn(b4).click();await p.waitForTimeout(80);
 const during=await tryEverything(b4);
 assert.equal(during.busy,'true','저장 중 표시');assert(during.disabled,'시간·이름·저장·취소·삭제 잠금');assert.equal(during.label,'저장 중…');
 assert.deepEqual([during.start,during.end],['06:00','08:00'],'저장 중 재입력은 무시');
 await p.evaluate(()=>loadAll());                                                             // 저장 중에 목록을 다시 불러와도
 await p.waitForFunction(id=>!document.querySelector('#settingsBlockList .hs-block-row[data-id="'+id+'"][aria-busy]'),b4,{timeout:5000});
 const wA=(await blockWrites()).slice(w1);assert.equal(wA.length,1,'요청 한 번(중복 저장·이름·삭제 없음)');assert.deepEqual(wA[0].values,{start_minute:360,end_minute:480});assert.equal(dialogs.length,d1,'삭제 확인창 안 뜸');
 assert.deepEqual(await blk(b4),[360,480],'서버');assert.deepEqual(await local(b4),[360,480],'로컬');assert.deepEqual(await ui(b4),{s:'06:00',e:'08:00'},'화면');
 assert.equal(await row(b4).locator('.hs-block-name-input').inputValue(),'새벽','이름 그대로');assert(await saveBtn(b4).isHidden(),'고치는 중 아님');
 assert(!(await startIn(b4).isDisabled())&&!(await row(b4).locator('.hs-cat-del').isDisabled()),'성공 후 잠금 해제');
 // b) 실패: 06~08 → 09~10, 응답 지연 + 저장 실패 → 잠금 중 시도 무시, 실패 후 잠금 해제·안내·고치던 값 유지, 서버·로컬은 원래 값
 w1=(await blockWrites()).length;
 await startIn(b4).fill('09:00');await endIn(b4).fill('10:00');await p.evaluate(()=>{window.mockDelay=700;window.mockFailure='simulated failure';});await saveBtn(b4).click();await p.waitForTimeout(80);
 const during2=await tryEverything(b4);assert(during2.disabled&&during2.busy==='true','실패 응답 전에도 잠금');assert.deepEqual([during2.start,during2.end],['09:00','10:00']);
 await p.waitForSelector('#settingsBlockList .hs-block-row[data-id="'+b4+'"] .hs-block-msg',{timeout:5000});
 assert(/저장하지 못했어요.*원래 시간\(06:00~08:00\) 그대로/.test(await row(b4).locator('.hs-block-msg').textContent()));
 assert.equal((await blockWrites()).length,w1,'실패한 저장은 기록 없음');assert.deepEqual(await blk(b4),[360,480],'서버 원래 값');assert.deepEqual(await local(b4),[360,480],'로컬 원래 값');
 assert.deepEqual(await ui(b4),{s:'09:00',e:'10:00'},'고치던 값 유지');assert(!(await startIn(b4).isDisabled())&&await saveBtn(b4).isEnabled(),'실패 후 잠금 해제');
 await cancelBtn(b4).click();assert.deepEqual(await ui(b4),{s:'06:00',e:'08:00'},'취소 → 화면 = 서버 값');
 ok('저장 중 잠금: 재입력·중복 저장·취소·이름·삭제 무시, 성공·실패 후 잠금 해제, 서버·로컬·화면 값 일치(저장 중 다시 불러오기 포함)');
 // 7) 같은 규칙 모듈: 공유 이미지·여러 날 열에서 쓰는 배정 함수
 const unit=await p.evaluate(()=>{const bl=[{start_minute:0,end_minute:600},{start_minute:300,end_minute:900}],its=[{start_minute:400},{start_minute:600},{start_minute:950}];const o=OnekanAgendaMarkup.blockOwner(its,bl);
  const html=OnekanAgendaMarkup.blocks([{start_minute:30,duration_minutes:30,continued:true,id:'c'}],todayStr(),{blocks:[{title:'x',start_minute:0,end_minute:600}],blockStyle:()=>({dot:'#000'}),escape:s=>s,time:()=>'',endTime:()=>'',row:it=>'<i data-x="'+it.id+'"></i>',addSlot:()=>''});
  return [its.map(i=>bl.indexOf(o.get(i))),html.includes('data-x="c"')];});
 assert.deepEqual(unit,[[0,1,-1],false],'겹친 블록은 첫 블록, 밖은 없음, 이어지는 조각 제외');
 ok('배정 함수: 첫 블록 하나·구간 밖·이어지는 조각 제외');
 assert.deepEqual(errors,[]);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
