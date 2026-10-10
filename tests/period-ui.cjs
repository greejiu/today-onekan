const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require('playwright');const {fixture}=require('./period-fixture.cjs');
const config={event:{p:'cev',start:'cev_date',end:'cev_end',title:'cev_title',save:'cev_save',bg:'calEventSheetBg',table:'tok_events'},todo:{p:'td',start:'td_start',end:'td_end',title:'td_title',save:'todoSaveBtn',bg:'todoSheetBg',table:'tok_todos'},habit:{p:'ha',start:'ha_start',end:'ha_end',title:'ha_name',save:'ha_save',bg:'habitAddSheetBg',table:'tok_habits'}};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900},timezoneId:'Asia/Seoul'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource: net::ERR_FAILED'))errors.push(m.text());});page.on('dialog',d=>d.accept());
 try {
  await fixture(page);const today=await page.evaluate(()=>todayStr());
  const open=async(kind,context)=>page.evaluate(({kind,context})=>openAddWindowFor(kind,context),{kind,context});
  const writeCount=()=>page.evaluate(()=>mockWrites.length);
  const lastRow=kind=>page.evaluate(table=>({...mockRows[table].at(-1)}),config[kind].table);
  const save=async kind=>{const c=config[kind];await page.locator('#'+c.save).click();await page.waitForFunction(bg=>!document.getElementById(bg).classList.contains('open'),c.bg);};
  const close=async kind=>page.evaluate(kind=>{if(kind==='event')hideCalEventSheet();else if(kind==='todo')closeTodoSheet();else closeHabitAddSheet();},kind);
  const setPeriod=async(kind,p)=>{const c=config[kind];await page.locator('#'+c.p+'_allday').setChecked(p.allDay);await page.locator('#'+c.start).fill(p.startDate);await page.locator('#'+c.end).fill(p.endDate);if(!p.allDay){await page.locator('#'+c.p+'_time').fill(p.startTime);await page.locator('#'+c.p+'_endtime').fill(p.endTime);}};
  // Same interface/defaults on all three sheets; caller's explicit duration wins over default.
  for(const kind of Object.keys(config)) {
   const c=config[kind];await open(kind);assert(await page.locator('#'+c.p+'_allday').isChecked());assert.equal(await page.locator('#'+c.start).inputValue(),today);assert.equal(await page.locator('#'+c.end).inputValue(),today);assert(!(await page.locator('#'+c.p+'_time').isVisible()));
   await page.locator('#'+c.title).fill(kind+' 하루');await save(kind);let row=await lastRow(kind);assert.equal(row.all_day,true);assert.equal(row.duration_minutes,null);assert.equal(row.end_time,null);
   await open(kind,{startDate:'2026-10-09',endDate:'2026-10-11'});assert.equal(await page.locator('#'+c.end).inputValue(),'2026-10-11');await close(kind);
   await open(kind,{startDate:'2026-10-03',time:'23:45',durationMinutes:90});assert(!(await page.locator('#'+c.p+'_allday').isChecked()));assert.equal(await page.locator('#'+c.end).inputValue(),'2026-10-04');assert.equal(await page.locator('#'+c.p+'_endtime').inputValue(),'01:15');await close(kind);
   await open(kind,{startDate:'2026-10-03',startTime:'23:45'});assert.equal(await page.locator('#'+c.p+'_endtime').inputValue(),'00:15');await close(kind);
   await open(kind);await page.locator('#'+c.title).fill('필수값');await page.locator('#'+c.p+'_allday').uncheck();assert.equal(await page.locator('#'+c.p+'_time').inputValue(),'');assert.equal(await page.locator('#'+c.p+'_endtime').inputValue(),'');let before=await writeCount();await page.locator('#'+c.save).click();assert.equal(await writeCount(),before);assert(await page.locator('#'+c.p+'_error').textContent());await close(kind);
   for(const period of [
    {allDay:true,startDate:'2026-10-03',endDate:'2026-10-07'},
    {allDay:false,startDate:'2026-10-03',endDate:'2026-10-03',startTime:'09:15',endTime:'10:10'},
    {allDay:false,startDate:'2026-10-03',endDate:'2026-10-04',startTime:'23:00',endTime:'01:00'},
    {allDay:false,startDate:'2026-10-03',endDate:'2026-10-06',startTime:'23:00',endTime:'01:00'},
   ]) {
    await open(kind);await setPeriod(kind,period);await page.locator('#'+c.title).fill(kind+' 기간');await save(kind);row=await lastRow(kind);
    const reopened=await page.evaluate(({kind,row})=>OnekanPeriod.read(kind,row),{kind,row});assert.equal(reopened.allDay,period.allDay);assert.equal(reopened.startDate,period.startDate);assert.equal(reopened.endDate,period.endDate);if(!period.allDay){assert.equal(reopened.startTime,period.startTime);assert.equal(reopened.endTime,period.endTime);}
    // Real edit dialog restores all endpoints, then changing only name preserves actual fields.
    await page.evaluate(({kind,row})=>{if(kind==='event')openEventEditor({mode:'edit',id:row.id});else if(kind==='todo')openTodoSheet(todos.find(t=>t.id===row.id));else openHabitSheet(tasks.find(t=>t.id===row.id));},{kind,row});
    const edit=kind==='habit'?{p:'hs',start:'hs_occ_start',end:'hs_occ_end',title:'hs_name',save:'habitSheetSaveBtn',bg:'habitSheetBg'}:c;
    assert.equal(await page.locator('#'+edit.start).inputValue(),period.startDate);assert.equal(await page.locator('#'+edit.end).inputValue(),period.endDate);assert.equal(await page.locator('#'+edit.p+'_endtime').inputValue(),period.allDay?'':period.endTime);
    await page.locator('#'+edit.title).fill(kind+' 이름만 수정');await page.locator('#'+edit.save).click();await page.waitForFunction(bg=>!document.getElementById(bg).classList.contains('open'),edit.bg);
    const after=await lastRow(kind);for(const field of ['all_day','end_time','duration_minutes','event_time','todo_time','start_minute','event_date','start_date','occurrence_start_date','end_date','occurrence_end_date'])assert.deepEqual(after[field],row[field],field);
   }
   await open(kind);await page.locator('#'+c.title).fill('역전');await setPeriod(kind,{allDay:false,startDate:'2026-10-03',endDate:'2026-10-03',startTime:'23:00',endTime:'01:00'});before=await writeCount();await page.locator('#'+c.save).click();assert.equal(await writeCount(),before);await page.locator('#'+c.p+'_allday').check();await page.locator('#'+c.end).fill('2026-10-02');await page.locator('#'+c.save).click();assert.equal(await writeCount(),before);await page.locator('#'+c.end).fill('2026-10-03');await save(kind);row=await lastRow(kind);assert.equal(row.end_time,null);assert.equal(row.duration_minutes,null);
   await open(kind,{startDate:'2026-10-03',startTime:'09:00',endDate:'2026-10-03',endTime:'10:00'});await page.locator('#'+c.p+'_allday').check();await page.locator('#'+c.p+'_allday').uncheck();assert.equal(await page.locator('#'+c.p+'_time').inputValue(),'09:00');assert.equal(await page.locator('#'+c.p+'_endtime').inputValue(),'10:00');await close(kind);
  }
  console.log('all three sheets defaults / context / save + reopen / title-only / validation / all-day toggle PASS');
  // Integration: modern endpoints and page-selected groups/shared categories coexist.
  // 2026-10-10 화면에서 고른 그룹이 새 항목 기본값이 되는 건 그룹 사이드바(프로젝트 기능이 없을 때) 동작 — 그 상태로 검증
  await page.evaluate(async()=>{mockMissingTables=['tok_projects'];mockRows.tok_item_groups=[{id:'pg-t',kind:'todo',name:'회사'},{id:'pg-h',kind:'habit',name:'공부'}];mockRows.tok_event_categories=[{id:'pg-e',name:'개인'}];mockRows.tok_habit_categories=[{id:'pc',name:'행정'}];await loadAll();});
  for(const [kind,pageName,group] of [['event','schedule','pg-e'],['todo','todos','pg-t'],['habit','habits','pg-h']]) {
   await page.evaluate(({kind,pageName,group})=>{showPage(pageName);classification.select(kind,group);},{kind,pageName,group});
   await open(kind,{startDate:'2026-10-03',startTime:'23:00',endDate:'2026-10-04',endTime:'01:00'});
   const c=config[kind],cat=kind==='todo'?'td_tag':'ha_category';
   // Current main uses groups only for schedules; categories belong to todos/habits.
   if(kind!=='event')await page.locator('#'+cat).selectOption('pc');
   else assert.equal(await page.locator('#cev_shared_category_id').count(),0);
   await page.locator('#'+c.title).fill('통합 기간 '+kind);await save(kind);
   const row=await lastRow(kind);assert.equal(row[kind==='event'?'category_id':'group_id'],group);if(kind!=='event')assert.equal(row[kind==='todo'?'tag_id':'category_id'],'pc');assert.equal(row.duration_minutes,120);
   await page.evaluate(({kind,id})=>duplicateAgendaItem(kind,id),{kind,id:row.id});const copy=await lastRow(kind);assert.equal(copy[kind==='event'?'category_id':'group_id'],group);assert.equal(copy.end_time,'01:00:00');assert.equal(copy.duration_minutes,120);
  }
  await page.evaluate(()=>showPage('home'));
  console.log('new overnight periods + selected groups + shared categories + duplication integration PASS');

  // Existing dates, duration and missing end remain literal on title-only writes.
  await page.evaluate(async()=>{mockRows.tok_todos=[{id:'legacy-t',title:'시작만',start_date:'2026-10-03',todo_time:'09:15',duration_minutes:null},{id:'undated',title:'날짜 없음',start_date:null,todo_time:null,is_done:false}];mockRows.tok_events=[{id:'legacy-e',title:'종료날짜만',event_date:'2026-10-03',end_date:'2026-10-05',event_time:'21:00',duration_minutes:null}];mockRows.tok_habits=[{id:'legacy-h',name:'실제 45분',start_date:'2026-10-03',end_date:'2026-10-31',start_minute:1400,duration_minutes:45,is_active:true,repeat_unit:'day'}];await loadAll();});
  for(const [kind,id] of [['todo','legacy-t'],['event','legacy-e'],['habit','legacy-h'],['todo','undated']]) {
   const before=await page.evaluate(({kind,id})=>({...agendaItemById(kind,id)}),{kind,id});await page.evaluate(({kind,id})=>{const row=agendaItemById(kind,id);if(kind==='todo')openTodoSheet(row);else if(kind==='event')openEventEditor({mode:'edit',id});else openHabitSheet(row);},{kind,id});const c=kind==='habit'?{title:'hs_name',save:'habitSheetSaveBtn',bg:'habitSheetBg'}:config[kind];await page.locator('#'+c.title).fill('이름 수정');await page.locator('#'+c.save).click();await page.waitForFunction(bg=>!document.getElementById(bg).classList.contains('open'),c.bg);const after=await page.evaluate(({kind,id})=>({...agendaItemById(kind,id)}),{kind,id});for(const field of ['all_day','end_time','duration_minutes','event_time','todo_time','start_minute','event_date','start_date','occurrence_start_date','end_date','occurrence_end_date'])assert.deepEqual(after[field],before[field]);
  }
  await page.evaluate(()=>openTodoSheet(todos.find(t=>t.id==='legacy-t')));await page.locator('#td_time').fill('10:15');let before=await writeCount();await page.locator('#todoSaveBtn').click();assert.equal(await writeCount(),before);assert((await page.locator('#td_error').textContent()).includes('종료'));await page.evaluate(()=>closeTodoSheet());
  await open('todo');await page.locator('#td_title').fill('새 날짜 없는 할일');await page.locator('#td_undated').check();await save('todo');assert.equal((await lastRow('todo')).start_date,null);
  console.log('legacy endpoints / undated todo / edit period requires end PASS');
  // Repeat window is independent of each occurrence; overlapping rows retain the start occurrence ID/date.
  await page.evaluate(async()=>{mockRows.tok_habits=[{id:'overnight',name:'밤 습관',is_active:true,repeat_unit:'day',repeat_interval:1,start_date:'2026-10-03',end_date:'2026-10-31',...OnekanPeriod.patch('habit',{allDay:false,startDate:'2026-10-03',endDate:'2026-10-04',startTime:'23:00',endTime:'01:00'})}];mockRows.tok_habit_logs=[];mockRows.tok_habit_skips=[];mockRows.tok_todos=[{id:'repeat-t',title:'밤 할일',is_done:false,repeat_unit:'day',repeat_interval:1,start_date:'2026-10-03',end_date:'2026-10-31',...OnekanPeriod.patch('todo',{allDay:false,startDate:'2026-10-03',endDate:'2026-10-04',startTime:'23:00',endTime:'01:00'})}];await loadAll();});
  let rows=await page.evaluate(()=>timedItemsForDate('2026-10-04'));let first=rows.find(r=>r.kind==='habit'&&r.occurrence_date==='2026-10-03');assert(first);assert.equal(first.start_minute,0);assert.equal(first.duration_minutes,60);assert(rows.some(r=>r.kind==='habit'&&r.occurrence_date==='2026-10-04'));
  await page.evaluate(async()=>{homeAgendaDate='2026-10-04';await renderAgendaTimed();});assert.equal(await page.locator('.ag-tl-task.habit[data-occurrence="2026-10-03"] input').getAttribute('data-date'),'2026-10-03');
  await page.evaluate(async()=>{await toggleHabitForDate('overnight',true,'2026-10-03');await toggleHabitForDate('overnight',true,'2026-10-03');});assert.equal(await page.evaluate(()=>mockRows.tok_habit_logs.length),1);
  assert.equal(await page.evaluate(()=>mockRows.tok_habit_logs[0].done_date),'2026-10-03');
  await page.evaluate(()=>setHabitDayStatus('overnight','2026-10-04','skip'));assert.equal(await page.evaluate(()=>mockRows.tok_habit_skips[0].skip_date),'2026-10-04');
  await page.evaluate(async()=>{homeAgendaDate='2026-10-05';await renderAgendaTimed();});assert.equal(await page.locator('.ag-tl-task.habit[data-occurrence="2026-10-04"] .habit-skip-mark').count(),1);
  await page.evaluate(()=>setHabitDayStatus('overnight','2026-10-04','unskip'));assert.equal(await page.evaluate(()=>mockRows.tok_habit_skips.length),0);
  await page.evaluate(async()=>{await completeTodoRepeatIfNeeded(todos.find(t=>t.id==='repeat-t'));await completeTodoRepeatIfNeeded(todos.find(t=>t.id==='repeat-t'));});const next=await page.evaluate(()=>mockRows.tok_todos.find(t=>t.repeat_source_id==='repeat-t'));assert.equal(next.start_date,'2026-10-04');assert.equal(next.occurrence_end_date,'2026-10-05');assert.equal(next.end_date,'2026-10-31');assert.equal(await page.evaluate(()=>mockRows.tok_todos.filter(t=>t.repeat_source_id==='repeat-t').length),1);
  const logsBefore=await page.evaluate(()=>JSON.stringify({logs:mockRows.tok_habit_logs,skips:mockRows.tok_habit_skips,pauses:mockRows.tok_habit_pauses}));
  await page.evaluate(async()=>{await moveItemToZone('todo','repeat-t',{zone:'planday',date:'2026-10-10'});await duplicateAgendaItem('todo','repeat-t');await duplicateAgendaItem('habit','overnight');});const moved=await page.evaluate(()=>mockRows.tok_todos.find(t=>t.id==='repeat-t'));assert.equal(moved.occurrence_end_date,'2026-10-11');assert.equal(moved.todo_time,'23:00:00');assert.equal(moved.duration_minutes,120);assert.equal(moved.end_date,'2026-10-31');const copy=await lastRow('todo');assert.equal(copy.occurrence_end_date,moved.occurrence_end_date);assert.equal(copy.duration_minutes,120);
  assert.equal(await page.evaluate(()=>JSON.stringify({logs:mockRows.tok_habit_logs,skips:mockRows.tok_habit_skips,pauses:mockRows.tok_habit_pauses})),logsBefore);
  console.log('repeat bounds / cross-midnight occurrence IDs + unique completion / next-row dedup / date move + duplicate / histories unchanged PASS');
  // Failed writes retain draft, then retry succeeds.
  for(const kind of Object.keys(config)){const c=config[kind];await open(kind);await page.locator('#'+c.title).fill('실패해도 보존');await page.evaluate(()=>mockFailure='isolated failure');await page.locator('#'+c.save).click();assert.equal(await page.locator('#'+c.title).inputValue(),'실패해도 보존');assert(await page.locator('#'+c.p+'_error').textContent());await save(kind);}
  await page.evaluate(()=>openHabitSheet(tasks.find(t=>t.id==='overnight')));await page.locator('#hs_name').fill('수정 실패도 보존');await page.evaluate(()=>mockFailure='isolated edit failure');await page.locator('#habitSheetSaveBtn').click();assert.equal(await page.locator('#hs_name').inputValue(),'수정 실패도 보존');assert((await page.locator('#hs_error').textContent()).includes('isolated edit failure'));await page.locator('#habitSheetSaveBtn').click();await page.waitForFunction(()=>!document.getElementById('habitSheetBg').classList.contains('open'));
  // Evidence: identical rule at 1366px and 390px; bounded fields; both all-day and timed modes.
  fs.mkdirSync('test-results/period',{recursive:true});
  for(const width of [1366,390])for(const kind of Object.keys(config)) {
   const c=config[kind];await page.setViewportSize({width,height:width===390?844:900});await open(kind,{startDate:'2026-10-03',endDate:'2026-10-04'});await page.locator('#'+c.title).fill({event:'일정 기간 입력',todo:'할일 기간 입력',habit:'습관 기간 입력'}[kind]);await page.screenshot({path:`test-results/period/${kind}-allday-${width}.png`});
   await setPeriod(kind,{allDay:false,startDate:'2026-10-03',endDate:'2026-10-04',startTime:'23:00',endTime:'01:00'});
   if(kind==='todo')assert(!(await page.locator('#td_repeat_dates').isVisible()));
   const fits=await page.locator('#'+c.p+'_period').evaluate(root=>{const r=root.getBoundingClientRect();return [...root.querySelectorAll('input:not([type=checkbox])')].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1;});});assert(fits);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`test-results/period/${kind}-timed-${width}.png`});await close(kind);
   const row=await lastRow(kind);await page.evaluate(({kind,row})=>{if(kind==='event')openEventEditor({mode:'edit',id:row.id});else if(kind==='todo')openTodoSheet(agendaItemById(kind,row.id));else openHabitSheet(agendaItemById(kind,row.id));},{kind,row});
   await page.screenshot({path:`test-results/period/${kind}-edit-${width}.png`});
   if(width===390&&kind==='habit'){await page.locator('#habitSheetSaveBtn').scrollIntoViewIfNeeded();assert(await page.locator('#habitSheetSaveBtn').isVisible());}
   await page.evaluate(kind=>{if(kind==='event')hideCalEventSheet();else if(kind==='todo')closeTodoSheet();else closeHabitSheet();},kind);
  }
  assert.deepEqual(errors,[]);console.log('write failures retain inputs / desktop + 390px evidence / no overflow / no JS errors PASS');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
