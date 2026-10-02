// Full app + real local migration/RPC/RLS. Supabase HTTP/Auth/Storage transport is mocked.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const {fixture}=require('./together-fixture.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO/cAAAAASUVORK5CYII=','base64');
(async()=>{
 const fx=await fixture();const {db,as,rpc,upload,A,B,C}=fx;let failUpload=false,loseResponse=false,failRead=false;const writes=[],errors=[];
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'});
 async function pageFor(user){
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('backend',async({user,op,table,p,path})=>{
   try{
    if(op==='query'){
     if(table.startsWith('tok_pair_')){if(failRead){failRead=false;throw Object.assign(new Error('서버 준비 중'),{code:'42P01'});}assert(/^tok_pair_(rooms|members|invites|plans|proofs|ledger|rewards|diaries|replies)$/.test(table));return {data:(await as(user,`select * from ${table}`)).rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date ? (["due_date","entry_date","reward_date","performed_on"].includes(key)?value.toISOString().slice(0,10):value.toISOString()):value])))};}
     return {data:table==='tok_settings'?null:[]};
    }
    if(op==='upload'){if(failUpload){failUpload=false;throw new Error('업로드 실패 테스트');}await upload(user,path);return {data:{path}};}
    if(op==='download'){const rows=(await as(user,'select * from storage.objects where name=$1',[path])).rows;if(!rows.length)throw new Error('이미지 접근 거부');return {data:true};}
    writes.push({user,op,p});const data=await rpc(user,op,p);if(loseResponse){loseResponse=false;throw new Error('응답 유실 테스트');}return {data};
   }catch(e){return {data:null,error:{message:e.message,code:e.code}};}
  });
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='localhost'){
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(['index.html','assets/together.js','assets/together.css'].includes(file))return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
   }return route.fulfill({body:'',status:200});});
  await page.addInitScript(({user,png})=>{
   let current=user,callback;window.testChangeUser=id=>{current=id;callback?.('SIGNED_IN',{user:{id,email:'test@example.invalid'}});};
   const auth={getSession:async()=>({data:{session:{user:{id:current,email:'test@example.invalid'}}}}),getUser:async()=>({data:{user:{id:current}}}),onAuthStateChange:fn=>{callback=fn;return {};}};
   window.supabase={createClient:()=>({auth,from(table){const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>window.backend({user:current,op:'query',table}).then(resolve);return()=>q;}});return q;},rpc:(op,args)=>window.backend({user:current,op:args.op,p:args.p}),storage:{from:()=>({upload:(path)=>window.backend({user:current,op:'upload',path}),download:async path=>{const r=await window.backend({user:current,op:'download',path});return r.error?r:{data:new Blob([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],{type:'image/png'})};}})}})};
  },{user,png:png.toString('base64')});
  await page.goto('http://localhost/');await page.waitForFunction(()=>appSymbolReady);await page.waitForSelector('.upcoming-day');await page.locator('#navMoreBtn').click();await page.getByRole('menuitem',{name:'같이 한칸',exact:true}).click();return page;
 }
 const a=await pageFor(A),b=await pageFor(B);const dlg=p=>p.locator('#togetherDialog');
 const save=async(p,label='저장하기')=>{await dlg(p).getByRole('button',{name:label,exact:true}).click();await dlg(p).waitFor({state:'hidden'});};
 const refresh=async p=>{await p.getByRole('button',{name:'새로고침',exact:true}).click();};
 await a.getByRole('button',{name:'방 만들기',exact:true}).click();assert.equal(await dlg(a).locator('[name=rate]').inputValue(),'100');
 await dlg(a).locator('[name=name]').fill('작은 그림 모임');await dlg(a).locator('[name=nickname]').fill('결');await save(a);
 const room=(await as(A,'select * from tok_pair_rooms')).rows[0],invite=(await as(A,'select * from tok_pair_invites')).rows[0];
 await b.getByRole('button',{name:'초대로 참여하기'}).click();await dlg(b).locator('[name=id]').fill(invite.id);await dlg(b).locator('[name=nickname]').fill('친구');await save(b);
 await refresh(a);await a.getByText('2/2명',{exact:true}).waitFor();
 await a.evaluate(({A,B})=>{todos=[{id:'10000000-0000-0000-0000-000000000001',user_id:A,title:'개인 할일'},{id:'other',user_id:B,title:'이전 계정 비공개 제목'}];tasks=[{id:'10000000-0000-0000-0000-000000000002',user_id:A,name:'매일 그림'}];},{A,B});
 await a.getByRole('button',{name:'계획 추가'}).click();assert.equal(await dlg(a).locator('[name=points]').inputValue(),'');
 assert.equal(await dlg(a).locator('[name=source] option').count(),3);assert(!((await dlg(a).innerText()).includes('이전 계정 비공개 제목')));
 await dlg(a).locator('[name=source]').selectOption('1');assert.equal(await dlg(a).locator('[name=title]').inputValue(),'매일 그림');await dlg(a).locator('[name=source]').selectOption('');
 await dlg(a).locator('[name=title]').fill('<script>인물 크로키 3장</script>');await dlg(a).locator('[name=points]').fill('5');
 loseResponse=true;await dlg(a).getByRole('button',{name:'저장하기',exact:true}).click();await dlg(a).getByText('응답 유실 테스트',{exact:true}).waitFor();assert.equal(await dlg(a).locator('[name=points]').inputValue(),'5');await save(a);
 assert.equal((await as(A,'select * from tok_pair_plans')).rows.length,1);

 await a.getByRole('button',{name:'인증하기',exact:true}).click();await dlg(a).locator('[name=image]').setInputFiles({name:'drawing.png',mimeType:'image/png',buffer:png});await dlg(a).locator('[name=body]').fill('오늘 세 장을 그렸어요.');
 failUpload=true;await dlg(a).getByRole('button',{name:'저장하기',exact:true}).click();await dlg(a).getByText('업로드 실패 테스트',{exact:true}).waitFor();assert.equal(await dlg(a).locator('[name=body]').inputValue(),'오늘 세 장을 그렸어요.');
 loseResponse=true;await dlg(a).getByRole('button',{name:'저장하기',exact:true}).click();await dlg(a).getByText('응답 유실 테스트',{exact:true}).waitFor();await save(a);
 assert.equal((await as(A,'select * from storage.objects')).rows.length,1);assert.equal(await a.getByRole('button',{name:'확인했어요',exact:true}).count(),0);
 await refresh(b);await b.getByRole('button',{name:'확인했어요',exact:true}).click();await save(b,'확인');await b.getByText('확인 완료 · +5점',{exact:true}).waitFor();
 await refresh(a);await a.getByRole('button',{name:'보상함',exact:true}).click();await a.getByRole('button',{name:'나에게 보상하기'}).click();await dlg(a).locator('[name=title]').fill('빵 사 먹기');await dlg(a).locator('[name=points]').fill('3');await save(a);
 await a.getByRole('button',{name:'보상 기록 취소',exact:true}).click();await save(a,'확인');assert.equal((await as(A,'select sum(amount)::int as n from tok_pair_ledger')).rows[0].n,5);
 await a.getByRole('button',{name:'교환일기',exact:true}).click();await a.getByRole('button',{name:'하루 이야기 쓰기'}).click();await dlg(a).locator('[name=body]').fill('처음에는 어려웠지만 조금 즐거웠어.');await dlg(a).locator('[name=image]').setInputFiles({name:'diary.png',mimeType:'image/png',buffer:png});await save(a,'나만 보는 초안 저장');
 await refresh(b);await b.getByRole('button',{name:'교환일기',exact:true}).click();assert.equal(await b.getByText('처음에는 어려웠지만 조금 즐거웠어.',{exact:true}).count(),0);
 await a.getByRole('button',{name:'수정',exact:true}).click();await save(a,'함께 보기로 올리기');await refresh(b);await b.getByText('처음에는 어려웠지만 조금 즐거웠어.',{exact:true}).waitFor();
 await b.getByRole('button',{name:'짧은 답글 남기기'}).click();await dlg(b).locator('[name=body]').fill('나도 함께해서 좋았어!');await save(b);await b.getByRole('button',{name:'답글 수정',exact:true}).click();await dlg(b).locator('[name=body]').fill('내일도 함께 한 칸!');await save(b);
 await a.reload();await a.waitForFunction(()=>appSymbolReady);await a.waitForSelector('.upcoming-day');await a.evaluate(()=>showPage('together'));await a.getByRole('button',{name:'교환일기',exact:true}).click();await a.getByText('내일도 함께 한 칸!',{exact:true}).waitFor();
 await a.locator('.pair-image').waitFor();
 assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 fs.mkdirSync('test-results',{recursive:true});await a.screenshot({path:'test-results/together-mobile-diary.png',fullPage:true});
 await a.getByRole('button',{name:'함께하기',exact:true}).click();await a.screenshot({path:'test-results/together-mobile-plans.png',fullPage:true});
 await a.setViewportSize({width:1366,height:900});await a.screenshot({path:'test-results/together-desktop.png',fullPage:true});
 await a.getByRole('button',{name:'계획 추가'}).click();await a.evaluate(id=>testChangeUser(id),C);await dlg(a).waitFor({state:'hidden'});assert.equal(await a.locator('#togetherRoot').textContent(),'');await a.evaluate(()=>Together.open());await a.getByRole('button',{name:'방 만들기',exact:true}).waitFor();
 assert.equal(await a.locator('.pair-image').count(),0);
 const c=await pageFor(C);await c.getByRole('button',{name:'초대로 참여하기'}).click();await dlg(c).locator('[name=id]').fill(invite.id);await dlg(c).locator('[name=nickname]').fill('제3자');await dlg(c).getByRole('button',{name:'저장하기',exact:true}).click();await dlg(c).getByText('방 정원이 가득 찼어요 (2명)',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert(writes.every(x=>x.op!=='update'&&x.op!=='delete'));
 await browser.close();await db.close();console.log('PASS: 390px and desktop; room/join, response-loss retry, upload retry, proof/confirmation, reward/cancel, private draft/publish/reply/edit, reload, account reset, third-user rejection, no XSS or browser errors');
})().catch(e=>{console.error(e);process.exit(1)});
