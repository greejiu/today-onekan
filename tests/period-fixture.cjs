const {fixture:base}=require('./home-layout.cjs');
// 2026-10-26 언젠가 → 일정·할일·습관(tok_move_someday): 허용 칸은 마이그레이션 파일에서 그대로 읽어 가짜 DB도 같은 칸만 받음
const fs=require('node:fs');
const moveMigration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_tok_someday_move_any_kind.sql'));
const moveAllowed=(()=>{if(!moveMigration)return null;const sql=fs.readFileSync('supabase/migrations/'+moveMigration,'utf8');const arr=kind=>{const m=sql.match(new RegExp((kind==='habit'?"else array":"when '"+kind+"' then array")+"\\[([^\\]]*)\\]"));return m[1].match(/'([a-z_]+)'/g).map(x=>x.slice(1,-1));};return {event:arr('event'),todo:arr('todo'),habit:arr('habit')};})();
async function fixture(page, source) {
 await base(page,source);
 await page.evaluate(allowed=>{window.mockMoveAllowed=allowed;},moveAllowed);
 await page.evaluate(()=>{
  window.mockRows={tok_someday_moves:[],tok_todos:[],tok_events:[],tok_habits:[],tok_someday:[],tok_habit_logs:[],tok_habit_skips:[],tok_habit_pauses:[],tok_projects:[],tok_identities:[],tok_time_blocks:[],tok_habit_categories:[],tok_event_categories:[]};
  window.mockWrites=[];window.mockFailure=null;window.mockCounter=0;
  sb.from=table=>{
   let op='select',values,filters=[],single=false,limit=null;
   const q=new Proxy({}, {get(_,key){
    if(key==='then')return async resolve=>{
     const delay=window.mockDelay;window.mockDelay=0;if(delay)await new Promise(r=>setTimeout(r,delay));
     if((window.mockMissingTables||[]).includes(table)){resolve({error:{message:'relation "'+table+'" does not exist'},data:null});return;} // 2026-10-10 마이그레이션 전 상태(예: 프로젝트 표 없음) 흉내
     if(mockFailure&&op!=='select'){const error={message:mockFailure};mockFailure=null;resolve({error,data:null});return;}
     const rows=mockRows[table]||=[]; const match=r=>filters.every(([type,k,v])=>type==='in'?v.includes(r[k]):type==='gte'?r[k]>=v:type==='lte'?r[k]<=v:type==='is'?(r[k]??null)===v:r[k]===v||k==='user_id'&&r[k]==null); // 가짜 데이터 행은 user_id를 생략하기도 함(실제 DB는 항상 있음)
     let data=rows.filter(match);
     if(op==='insert') {
      const added=(Array.isArray(values)?values:[values]).map(row=>({id:'new'+(++mockCounter),is_active:true,is_done:false,...row}));
      const duplicate=added.some(row=>table==='tok_habit_logs'&&rows.some(r=>r.habit_id===row.habit_id&&r.done_date===row.done_date)||table==='tok_todos'&&row.repeat_source_id&&rows.some(r=>r.repeat_source_id===row.repeat_source_id));
      if(duplicate){resolve({error:{code:'23505',message:'duplicate'},data:null});return;}
      rows.push(...added);data=added;
     } else if(op==='update'){data.forEach(row=>Object.assign(row,values));}
     else if(op==='delete'){mockRows[table]=rows.filter(r=>!match(r));}
     if(op!=='select')mockWrites.push({table,op,values:values&&JSON.parse(JSON.stringify(values)),filters});
     if(limit!=null)data=data.slice(0,limit);
     resolve({data:single?(data[0]||null):data.map(r=>({...r})),error:null});
    };
    return (...args)=>{if(['insert','update','delete'].includes(key)){op=key;values=args[0];}if(['eq','is','in','gte','lte'].includes(key))filters.push([key,...args]);if(key==='single'||key==='maybeSingle')single=true;if(key==='limit')limit=args[0];return q;};
   }});return q;
  };
  sb.rpc=async(name,args)=>{
   if(name==='tok_move_someday'){
    // 실제 함수와 같게: 허용 칸만, 기록이 있으면 새로 만들지 않고 그 결과, 언젠가 삭제 + 새 항목 + 기록을 한 번에.
    // window.mockMoveMode: 'fail'(DB 오류, 아무것도 안 바뀜) / 'missing'(함수 없음) / 'lost'(저장은 됐는데 응답 유실)
    const mode=window.mockMoveMode;window.mockMoveMode=null;window.moveCalls=(window.moveCalls||0)+1;window.moveArgs=args;
    if(window.mockMoveDelay)await new Promise(r=>setTimeout(r,window.mockMoveDelay)); // 저장 중 두 번 누르기 확인용
    const tables={event:'tok_events',todo:'tok_todos',habit:'tok_habits'},tbl=tables[args.p_kind];
    if(!tbl)return {data:null,error:{message:'invalid_kind'}};
    const bad=Object.keys(args.p_row||{}).find(k=>!window.mockMoveAllowed[args.p_kind].includes(k));if(bad)return {data:null,error:{message:'field_not_allowed: '+bad}};
    if(mode==='fail')return {data:null,error:{message:'period_dates_required_or_reversed'}};
    if(mode==='missing')return {data:null,error:{code:'PGRST202',message:'Could not find the function public.tok_move_someday'}};
    const log=mockRows.tok_someday_moves.find(m=>m.someday_id===args.p_someday_id);let result;
    if(log)result={kind:log.kind,item_id:log.item_id,title:log.title,replayed:true,same_request:log.request_id===args.p_request_id,item_exists:mockRows[tables[log.kind]].some(r=>r.id===log.item_id)};
    else{
     const index=mockRows.tok_someday.findIndex(s=>s.id===args.p_someday_id);if(index<0)return {data:null,error:{message:'someday_not_found'}};
     const s=mockRows.tok_someday.splice(index,1)[0],row={id:'new'+(++mockCounter),user_id:'test',...(args.p_kind==='todo'?{is_done:false}:{}),...(args.p_kind==='habit'?{is_active:true}:{}),...args.p_row};
     mockRows[tbl].push(row);mockRows.tok_someday_moves.push({someday_id:s.id,user_id:'test',request_id:args.p_request_id,kind:args.p_kind,item_id:row.id,title:s.title});
     mockWrites.push({table:tbl,op:'rpc',values:row});result={kind:args.p_kind,item_id:row.id,title:s.title,replayed:false,same_request:true,item_exists:true};
    }
    if(mode==='lost')throw new TypeError('Failed to fetch');
    return {data:result,error:null};
   }
   if(name!=='tok_move_someday_to_todo')return {data:null,error:null};
   const index=mockRows.tok_someday.findIndex(s=>s.id===args.p_someday_id);if(index<0)return {error:{message:'someday_not_found'}};
   const s=mockRows.tok_someday.splice(index,1)[0];const row={id:'new'+(++mockCounter),title:s.title,tag_id:s.tag_id,group_id:s.group_id,project_id:s.project_id,is_done:false,...OnekanPeriod.patch('todo',OnekanPeriod.defaults({startDate:args.p_date},todayStr()))};
   mockRows.tok_todos.push(row);mockWrites.push({table:'tok_todos',op:'rpc',values:row});return {data:row,error:null};
  };
 });
 await page.evaluate(()=>loadAll());
}
module.exports={fixture};
