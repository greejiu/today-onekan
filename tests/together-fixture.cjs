// Real PostgreSQL semantics in PGlite; auth/storage service schemas are local fixtures.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
async function fixture(){
 const db=new PGlite();
 await db.exec(`create schema auth; create schema storage; create role authenticated; create role anon;
 create table auth.users(id uuid primary key);
 insert into auth.users values('${A}'),('${B}'),('${C}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 create table public.tok_todos(id uuid primary key,user_id uuid,title text,memo text,completed boolean default false);
 create table public.tok_habits(id uuid primary key,user_id uuid,name text,memo text);
 insert into tok_todos values('10000000-0000-0000-0000-000000000001','${A}','개인 할일','절대 공유하지 않을 메모',false);
 insert into tok_habits values('10000000-0000-0000-0000-000000000002','${A}','매일 그림','비공개 습관 메모');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261002101836_tok_together_phase1.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261002111004_tok_together_plan_images.sql','utf8'));
 let tail=Promise.resolve();
 const as=(user,sql,params=[])=>{const run=tail.then(()=>db.transaction(async tx=>{await tx.exec(`set local role ${user?'authenticated':'anon'}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);return tx.query(sql,params);}));tail=run.catch(()=>{});return run;};
 const rpc=(user,op,p)=>as(user,'select public.tok_pair_mutate($1,$2::jsonb) as result',[op,JSON.stringify(p)]).then(x=>x.rows[0].result);
 const upload=(user,path)=>as(user,"insert into storage.objects(bucket_id,name) values('tok-pair-images',$1)",[path]);
 return {db,as,rpc,upload,A,B,C,uuid:randomUUID};
}
module.exports={fixture,A,B,C};
