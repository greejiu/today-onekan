// Local PostgreSQL test only. Set NODE_PATH to a runtime containing @electric-sql/pglite.
const {PGlite}=require('@electric-sql/pglite');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const db=new PGlite();await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create role authenticated;
create table public.tok_settings(user_id uuid primary key default auth.uid(),day_start_minute integer not null default 360,day_end_minute integer not null default 1440,default_tag_color text);
alter table public.tok_settings enable row level security;
create policy tok_settings_select on public.tok_settings for select using(auth.uid()=user_id);
create policy tok_settings_insert on public.tok_settings for insert with check(auth.uid()=user_id);
create policy tok_settings_update on public.tok_settings for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;grant select,insert,update on public.tok_settings to authenticated;
insert into public.tok_settings(user_id,day_start_minute,default_tag_color) values('00000000-0000-0000-0000-000000000001',420,'#112233');
`);
const sql=fs.readFileSync('supabase/migrations/20260927223540_tok_app_symbol.sql','utf8');await db.exec(sql);await db.exec(sql);
const old=(await db.query('select * from tok_settings')).rows[0];assert.equal(old.app_symbol,'hankan');assert.equal(old.day_start_minute,420);assert.equal(old.default_tag_color,'#112233');
await db.exec(`set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
for(const symbol of ['hankan','cheese','step','check']){const r=await db.query(`insert into tok_settings(user_id,app_symbol) values(auth.uid(),$1) on conflict(user_id) do update set app_symbol=excluded.app_symbol returning *`,[symbol]);assert.equal(r.rows[0].app_symbol,symbol);assert.equal(r.rows[0].day_start_minute,420);}
await assert.rejects(db.query("update tok_settings set app_symbol='cat'"));
await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'`);assert.equal((await db.query('select * from tok_settings')).rows.length,0);
assert.equal((await db.query("update tok_settings set app_symbol='step' where user_id='00000000-0000-0000-0000-000000000001' returning *")).rows.length,0);
await assert.rejects(db.query("insert into tok_settings(user_id,app_symbol) values('00000000-0000-0000-0000-000000000001','step') on conflict(user_id) do update set app_symbol=excluded.app_symbol"));
const fresh=(await db.query('insert into tok_settings(user_id) values(auth.uid()) returning app_symbol')).rows[0];assert.equal(fresh.app_symbol,'hankan');await db.close();console.log('PASS: migration rerun, existing/new defaults, four IDs, invalid rejection, partial upsert preservation, cross-user RLS isolation');})().catch(e=>{console.error(e);process.exit(1)});
