// 2026-10-26 언젠가 → 날짜: 놓으면 종류(일정·할일·습관) 고르기 → 놓은 날짜·시간을 채운 추가창 → 저장해야만 옮김(tok_move_someday 한 번).
// 취소·실패 = 원본 그대로, 저장 중 두 번 누르기·응답 유실 후 재시도·다른 창 = 새로 만들지 않음, 결과를 모르면 기록·원본으로 확인해 안내,
// 가져오지 못하는 정보(일정 프로젝트·담아두기 그룹·완료 표시) 저장 전 안내, 그룹은 도착 공간 기본. 가짜 Supabase만 씀.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright'),{fixture}=require('./period-fixture.cjs');
const OUT='test-results/someday-move';
const ok=m=>console.log('PASS '+m);
const snap=p=>p.evaluate(()=>JSON.stringify({s:mockRows.tok_someday,t:mockRows.tok_todos,e:mockRows.tok_events,h:mockRows.tok_habits,m:mockRows.tok_someday_moves}));
const center=async loc=>{await loc.evaluate(e=>e.scrollIntoView({block:'center'}));const b=await loc.boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
async function drag(p,from,to){await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(from.x+8,from.y+8,{steps:3});await p.mouse.move(to.x,to.y,{steps:10});await p.mouse.up();await p.waitForTimeout(200);}
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 fs.mkdirSync(OUT,{recursive:true});
 const p=await b.newPage({viewport:{width:1600,height:1000},timezoneId:'Asia/Seoul'}),errors=[],dialogs=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 await fixture(p);
 const D=await p.evaluate(async()=>{
  const t=todayStr(),d=i=>addDaysStr(t,i);
  mockRows.tok_habit_categories=[{id:'c1',user_id:'test',name:'공부',color:'#123456',sort_order:0}];
  mockRows.tok_projects=[{id:'p1',user_id:'test',title:'포트폴리오',name:'포트폴리오',sort_order:0}];
  mockRows.tok_item_groups=[{id:'tg1',user_id:'test',kind:'todo',name:'회사',sort_order:0}];
  const S=(id,title,extra={})=>({id,user_id:'test',title,is_done:false,tag_id:'c1',group_id:'tg1',project_id:'p1',created_at:'2026-10-0'+id.slice(1),...extra});
  mockRows.tok_someday=[S('s1','책 읽기'),S('s2','운동'),S('s3','면접 준비'),S('s4','다른 창에서 옮김'),S('s5','지워질 항목'),S('s6','함수 없음'),S('s7','끝낸 메모',{is_done:true,group_id:null,project_id:null})];
  mockRows.tok_todos=[];mockRows.tok_events=[];mockRows.tok_habits=[];
  await loadAll();showPage('home');homeAgendaDate=t;renderHome();return Array.from({length:8},(_,i)=>d(i));
 });
 await p.waitForTimeout(300);
 const row=id=>p.locator('#somedayZone .ag-someday-row[data-someday-id="'+id+'"]');
 const menuItem=label=>p.locator('.item-menu').getByText(label,{exact:true});
 const note=()=>p.locator('#somedayMoveNote');
 const axis=minute=>p.locator('#agendaTimeWrap .ag-tl-content').first().evaluate((e,m)=>{const r=e.getBoundingClientRect();return {x:r.left+r.width*.7,y:r.top+(m-Number(e.dataset.minM))*0.6+2};},minute);
 const calls=()=>p.evaluate(()=>window.moveCalls||0);

 // ── 1. 놓으면 종류 메뉴. 메뉴를 닫으면(Esc) 아무것도 안 바뀜 ──
 let before=await snap(p);
 let a=await center(row('s1'));let up=await center(p.locator('.upcoming-day[data-date="'+D[1]+'"]'));await drag(p,a,up);
 assert(await p.locator('.item-menu').isVisible(),'종류 메뉴');for(const l of ['일정으로','할일로','습관으로'])assert(await menuItem(l).isVisible(),l);
 assert.match(await p.locator('.item-menu').textContent(),/책 읽기/);
 await p.keyboard.press('Escape');await p.waitForTimeout(150);assert.equal(await snap(p),before);assert.equal(await calls(),0);
 ok('언젠가를 날짜에 놓으면 종류 메뉴(일정·할일·습관), 메뉴 닫기 = 그대로(저장 0)');

 // ── 2. 타임라인 09:00에 놓고 할일 → 추가창(제목·날짜·시간 09:00~09:30·범주·프로젝트 채움, 그룹은 할일 기본, 못 가져오는 정보 안내). 취소 = 그대로 ──
 a=await center(row('s1'));let to=await axis(540);await drag(p,a,to);await menuItem('할일로').click();
 assert(await p.locator('#todoSheetBg.open').isVisible(),'할일 추가창');
 assert.equal(await p.locator('#td_title').inputValue(),'책 읽기');assert.equal(await p.locator('#td_start').inputValue(),D[0]);
 assert.equal(await p.locator('#td_allday').isChecked(),false);assert.equal(await p.locator('#td_time').inputValue(),'09:00');assert.equal(await p.locator('#td_endtime').inputValue(),'09:30');
 assert.equal(await p.locator('#td_tag').inputValue(),'c1','범주 가져옴');assert.equal(await p.locator('#td_project').inputValue(),'p1','프로젝트 가져옴');
 assert.notEqual(await p.locator('#td_group_id').inputValue(),'tg1','담아두기 그룹은 자동 연결하지 않음');
 assert.match(await note().textContent(),/담아두기에서 옮겨요/);assert.match(await note().textContent(),/담아두기 그룹 ‘회사’ — 할일 그룹을 골라 주세요\(안 고르면 기본\)/);
 await p.screenshot({path:OUT+'/todo-window.png'});
 await p.locator('#todoCancelBtn').click();await p.waitForTimeout(150);assert.equal(await snap(p),before,'취소 = 그대로');assert.equal(await calls(),0);assert.equal(await note().count(),0,'닫으면 안내 없어짐');
 // 다시 열어 저장 → 한 번 저장, 언젠가 빠짐, 할일 생김(시간·범주·프로젝트, 그룹 기본), 기록 남음
 a=await center(row('s1'));to=await axis(540);await drag(p,a,to);await menuItem('할일로').click();
 const defaultGroup=await p.locator('#td_group_id').inputValue();
 await p.locator('#todoSaveBtn').click();await p.waitForFunction(()=>!document.querySelector('#todoSheetBg.open'));
 assert.equal(await calls(),1);let t=await p.evaluate(()=>mockRows.tok_todos[0]);
 assert.equal(t.title,'책 읽기');assert.equal(t.start_date,D[0]);assert.equal(t.todo_time,'09:00:00');assert.equal(t.end_time,'09:30:00');assert.equal(t.tag_id,'c1');assert.equal(t.project_id,'p1');assert.equal(t.group_id??'',defaultGroup);
 assert.equal(await p.evaluate(()=>mockRows.tok_someday.some(s=>s.id==='s1')),false);assert.equal(await p.evaluate(()=>mockRows.tok_someday_moves.length),1);
 assert.match(await p.locator('#appToast').textContent(),/할일 ‘책 읽기’\(으\)로 옮겼어요/);
 assert(await p.locator('#agendaTimeWrap .ag-tl-task[data-kind="todo"]').filter({hasText:'책 읽기'}).count(),'화면에 새 할일');
 ok('타임라인 09:00 → 할일: 제목·날짜·09:00~09:30·범주·프로젝트 채움, 그룹은 할일 기본(자동 연결 없음)·안내, 취소 = 그대로, 저장 = 한 번에 옮김');

 // ── 3. 일정: 하루종일 칸 → 실패하면 창 그대로(입력 유지)·원본 그대로, 다시 저장하면 성공. 프로젝트는 못 가져온다고 안내 ──
 a=await center(row('s2'));to=await center(p.locator('#agendaAllDayZone'));await drag(p,a,to);await menuItem('일정으로').click();
 assert(await p.locator('#calEventSheetBg.open').isVisible());assert.equal(await p.locator('#cev_title').inputValue(),'운동');assert.equal(await p.locator('#cev_allday').isChecked(),true);assert.equal(await p.locator('#cev_date').inputValue(),D[0]);
 assert.match(await note().textContent(),/프로젝트 ‘포트폴리오’\(일정에는 프로젝트가 없어요\)/);assert.match(await note().textContent(),/일정 범주를 골라 주세요\(안 고르면 기본 범주\)/);
 await p.locator('#cev_memo_toggle').click().catch(()=>{});await p.locator('#cev_memo').fill('헬스장');
 before=await snap(p);await p.evaluate(()=>{window.mockMoveMode='fail';});await p.locator('#cev_save').click();await p.waitForTimeout(250);
 assert(await p.locator('#calEventSheetBg.open').isVisible(),'실패 = 창 그대로');assert.match(await p.locator('#cev_error').textContent(),/옮기지 못했어요. 담아두기 항목은 그대로예요/);assert.equal(await snap(p),before,'실패 = 원본 그대로');
 assert.equal(await p.locator('#cev_memo').inputValue(),'헬스장','입력 유지');
 await p.locator('#cev_save').click();await p.waitForFunction(()=>!document.querySelector('#calEventSheetBg.open'));
 const ev=await p.evaluate(()=>mockRows.tok_events[0]);assert.equal(ev.title,'운동');assert.equal(ev.all_day,true);assert.equal(ev.event_date,D[0]);assert.equal(ev.memo,'헬스장');assert.equal('project_id' in ev,false);
 assert.equal(await p.evaluate(()=>mockRows.tok_someday.some(s=>s.id==='s2')),false);
 ok('하루종일 칸 → 일정: 프로젝트·그룹 못 가져온다고 안내, 실패 = 창·입력·원본 그대로, 다시 저장 = 성공(메모 포함)');

 // ── 4. 습관(반복 허용): 저장은 됐는데 응답 유실 + 확인도 실패 → "결과를 확인하지 못했어요"·창 유지, 다시 저장 = 같은 요청 → 새로 만들지 않고 처음 결과 ──
 await p.evaluate(d=>openSomedayMoveWindow('habit','s3',{startDate:d,startMinute:600,durationMinutes:30,allDay:false}),D[2]);
 assert(await p.locator('#habitAddSheetBg.open').isVisible());assert.equal(await p.locator('#ha_name').inputValue(),'면접 준비');assert.equal(await p.locator('#ha_category').inputValue(),'c1');
 await p.evaluate(()=>{window.mockMoveMode='lost';window.mockMissingTables=['tok_someday_moves','tok_someday'];});await p.locator('#ha_save').click();await p.waitForTimeout(250);
 assert(await p.locator('#habitAddSheetBg.open').isVisible(),'결과 모름 = 창 유지');assert.match(await p.locator('#ha_error').textContent(),/저장 결과를 확인하지 못했어요.*다시 눌러도 두 번 생기지 않아요/);
 assert.equal(await p.evaluate(()=>mockRows.tok_habits.length),1,'실제로는 저장됨');
 await p.evaluate(()=>{window.mockMissingTables=[];});const req1=await p.evaluate(()=>moveArgs.p_request_id);
 await p.locator('#ha_save').click();await p.waitForFunction(()=>!document.querySelector('#habitAddSheetBg.open'));
 assert.equal(await p.evaluate(()=>moveArgs.p_request_id),req1,'다시 저장 = 같은 요청 키');assert.equal(await p.evaluate(()=>mockRows.tok_habits.length),1,'중복 없음');
 const h=await p.evaluate(()=>mockRows.tok_habits[0]);assert.equal(h.name,'면접 준비');assert.equal(h.start_minute,600);assert.equal(h.repeat_unit,'day');assert.equal(h.project_id,'p1');
 assert.match(await p.locator('#appToast').textContent(),/습관 ‘면접 준비’\(으\)로 옮겼어요/);
 ok('습관(반복): 응답 유실 + 확인 실패 = 창 유지·안내, 다시 저장 = 같은 요청 키로 처음 결과(중복 0)');

 // ── 5. 응답 유실 + 확인 성공 → 기록으로 결과를 확인해 성공 처리(한 번 저장) ──
 await p.evaluate(d=>openSomedayMoveWindow('todo','s7',{startDate:d,allDay:true}),D[3]);
 assert.match(await note().textContent(),/완료 표시\(새 항목은 완료 전으로 시작해요\)/);
 await p.evaluate(()=>{window.mockMoveMode='lost';});const c0=await calls();await p.locator('#todoSaveBtn').click();await p.waitForFunction(()=>!document.querySelector('#todoSheetBg.open'));
 assert.equal(await calls(),c0+1,'다시 부르지 않고 기록으로 확인');assert.equal(await p.evaluate(()=>mockRows.tok_todos.filter(t=>t.title==='끝낸 메모').length),1);assert.equal(await p.evaluate(()=>mockRows.tok_todos.find(t=>t.title==='끝낸 메모').is_done),false);
 ok('응답 유실 + 기록 확인 = 성공으로 안내(한 번만), 완료 표시는 새로 시작한다고 안내');

 // ── 6. 다른 창에서 먼저 옮김 → 이 창 저장은 새로 만들지 않고 알려 줌 / 이미 지워진 항목 → 만들지 않음 / 함수 없음 → 원본 그대로 ──
 await p.evaluate(d=>openSomedayMoveWindow('todo','s4',{startDate:d,allDay:true}),D[4]);
 await p.evaluate(d=>sb.rpc('tok_move_someday',{p_someday_id:'s4',p_request_id:'other-window',p_kind:'event',p_row:{title:'다른 창에서 옮김',event_date:d,end_date:d,all_day:true}}),D[4]);
 before=await p.evaluate(()=>mockRows.tok_todos.length);await p.locator('#todoSaveBtn').click();await p.waitForFunction(()=>!document.querySelector('#todoSheetBg.open'));
 assert.equal(await p.evaluate(()=>mockRows.tok_todos.length),before,'할일 안 만듦');assert.match(dialogs.at(-1),/이미 다른 창에서 일정 ‘다른 창에서 옮김’\(으\)로 옮겨졌어요. 새로 만들지 않았어요/);
 await p.evaluate(d=>openSomedayMoveWindow('event','s5',{startDate:d,allDay:true}),D[4]);await p.evaluate(()=>{mockRows.tok_someday=mockRows.tok_someday.filter(s=>s.id!=='s5');});
 before=await p.evaluate(()=>mockRows.tok_events.length);await p.locator('#cev_save').click();await p.waitForFunction(()=>!document.querySelector('#calEventSheetBg.open'));
 assert.equal(await p.evaluate(()=>mockRows.tok_events.length),before);assert.match(dialogs.at(-1),/이미 담아두기에 없어요.*새로 만들지 않았어요/);
 await p.evaluate(d=>openSomedayMoveWindow('todo','s6',{startDate:d,allDay:true}),D[4]);before=await snap(p);await p.evaluate(()=>{window.mockMoveMode='missing';});await p.locator('#todoSaveBtn').click();await p.waitForTimeout(200);
 assert.match(await p.locator('#td_error').textContent(),/DB 업데이트가 적용되지 않았어요/);assert.equal(await snap(p),before);
 // 저장 중 두 번 누르기 = 요청 한 번
 await p.evaluate(()=>{window.mockMoveDelay=300;});const c1=await calls();await p.locator('#todoSaveBtn').click();await p.locator('#todoSaveBtn').click({force:true}).catch(()=>{});await p.evaluate(()=>document.querySelector('#todoForm').requestSubmit());
 await p.waitForFunction(()=>!document.querySelector('#todoSheetBg.open'));await p.evaluate(()=>{window.mockMoveDelay=0;});assert.equal(await calls(),c1+1,'두 번 눌러도 한 번');assert.equal(await p.evaluate(()=>mockRows.tok_todos.filter(t=>t.title==='함수 없음').length),1);
 ok('다른 창에서 먼저 옮김 = 만들지 않고 알림, 지워진 항목 = 만들지 않음, 함수 없음 = 원본 그대로, 저장 중 두 번 누르기 = 요청 한 번');

 // ── 7. 보통 추가창은 그대로(옮기기 안내 없음, 일반 저장) ──
 const c2=await calls();await p.evaluate(()=>openTodoSheet(null,{startDate:todayStr()}));assert.equal(await note().count(),0);
 await p.locator('#td_title').fill('그냥 할일');await p.locator('#todoSaveBtn').click();await p.waitForFunction(()=>mockRows.tok_todos.some(t=>t.title==='그냥 할일'));assert.equal(await calls(),c2,'보통 추가 = 옮기기 함수 안 씀');
 ok('보통 추가창: 옮기기 안내 없음, 일반 저장 그대로');

 // ── 8. 일정 화면 옆 담아두기 목록에서 달력 칸에 놓기 → 그 날짜 하루종일로 채운 추가창 ──
 await p.evaluate(async()=>{mockRows.tok_someday.push({id:'s8',user_id:'test',title:'옆 목록',is_done:false});await loadAll();showPage('all');allViews.selectDate(todayStr());});
 await p.locator('#allViewTabs [data-common-view=month]').click();await p.waitForTimeout(300);
 const side=p.locator('#allSideAgenda .ag-someday-row[data-someday-id="s8"]');
 await p.locator('#allSideAgenda [data-sa-list=someday]').click();await p.waitForTimeout(200);
 {
  a=await center(side);const cell=await p.locator('#allCalGrid .cal-cell[data-date="'+D[1]+'"]').boundingBox();await drag(p,a,{x:cell.x+cell.width/2,y:cell.y+cell.height-6});
  await menuItem('할일로').click();assert.equal(await p.locator('#td_start').inputValue(),D[1]);assert.equal(await p.locator('#td_allday').isChecked(),true);assert.equal(await p.locator('#td_title').inputValue(),'옆 목록');
  await p.locator('#todoCancelBtn').click();assert.equal(await p.evaluate(()=>mockRows.tok_someday.some(s=>s.id==='s8')),true);
  ok('일정 화면 옆 담아두기 → 달력 칸: 그 날짜 하루종일로 채운 추가창, 취소 = 그대로');
 }
 assert.deepEqual(errors,[]);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
