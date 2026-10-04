const {fixture:base}=require('./home-layout.cjs');
async function fixture(page, source) {
 await base(page,source);
 await page.evaluate(()=>{
  window.mockRows={tok_todos:[],tok_events:[],tok_habits:[],tok_someday:[],tok_habit_logs:[],tok_habit_skips:[],tok_habit_pauses:[],tok_projects:[],tok_identities:[],tok_time_blocks:[],tok_habit_categories:[],tok_event_categories:[]};
  window.mockWrites=[];window.mockFailure=null;window.mockCounter=0;
  sb.from=table=>{
   let op='select',values,filters=[],single=false,limit=null;
   const q=new Proxy({}, {get(_,key){
    if(key==='then')return async resolve=>{
     const delay=window.mockDelay;window.mockDelay=0;if(delay)await new Promise(r=>setTimeout(r,delay));
     if(mockFailure&&op!=='select'){const error={message:mockFailure};mockFailure=null;resolve({error,data:null});return;}
     const rows=mockRows[table]||=[]; const match=r=>filters.every(([type,k,v])=>type==='in'?v.includes(r[k]):type==='gte'?r[k]>=v:type==='lte'?r[k]<=v:r[k]===v);
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
   if(name!=='tok_move_someday_to_todo')return {data:null,error:null};
   const index=mockRows.tok_someday.findIndex(s=>s.id===args.p_someday_id);if(index<0)return {error:{message:'someday_not_found'}};
   const s=mockRows.tok_someday.splice(index,1)[0];const row={id:'new'+(++mockCounter),title:s.title,tag_id:s.tag_id,group_id:s.group_id,project_id:s.project_id,is_done:false,...OnekanPeriod.patch('todo',OnekanPeriod.defaults({startDate:args.p_date},todayStr()))};
   mockRows.tok_todos.push(row);mockWrites.push({table:'tok_todos',op:'rpc',values:row});return {data:row,error:null};
  };
 });
 await page.evaluate(()=>loadAll());
}
module.exports={fixture};
