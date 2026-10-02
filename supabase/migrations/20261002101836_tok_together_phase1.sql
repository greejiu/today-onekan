-- Together phase 1. No changes to existing personal data. Apply as database owner.
begin;
create schema if not exists tok_pair_private;
revoke all on schema tok_pair_private from public;
grant usage on schema tok_pair_private to authenticated;

create table public.tok_pair_rooms (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 60),
 rate integer not null check(rate between 1 and 1000000), created_at timestamptz not null default now()
);
create table public.tok_pair_members (
 room_id uuid not null references public.tok_pair_rooms(id), user_id uuid not null references auth.users(id),
 nickname text not null check(length(trim(nickname)) between 1 and 30), joined_at timestamptz not null default now(),
 primary key(room_id,user_id), unique(user_id)
);
create table public.tok_pair_invites (
 id uuid primary key, room_id uuid not null references public.tok_pair_rooms(id),
 expires_at timestamptz not null default now()+interval '7 days', revoked_at timestamptz,
 accepted_by uuid references auth.users(id), accepted_at timestamptz, created_at timestamptz not null default now()
);
create table public.tok_pair_plans (
 id uuid primary key, room_id uuid not null, user_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 160), due_date date not null,
 points integer not null check(points between 1 and 1000000),
 source_kind text check(source_kind in ('todo','habit')), source_id uuid,
 created_at timestamptz not null default now(),
 foreign key(room_id,user_id) references public.tok_pair_members(room_id,user_id),
 check((source_kind is null)=(source_id is null)), unique(room_id,user_id,source_kind,source_id,due_date)
);
create table public.tok_pair_proofs (
 id uuid primary key, room_id uuid not null, user_id uuid not null,
 plan_id uuid not null unique references public.tok_pair_plans(id), image_path text not null,
 body text not null check(length(trim(body)) between 1 and 1000), performed_on date not null,
 created_at timestamptz not null default now(), confirmed_by uuid references auth.users(id), confirmed_at timestamptz,
 foreign key(room_id,user_id) references public.tok_pair_members(room_id,user_id),
 check(confirmed_by is distinct from user_id), check((confirmed_by is null)=(confirmed_at is null))
);
create table public.tok_pair_rewards (
 id uuid primary key, room_id uuid not null, user_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 100), points integer not null check(points between 1 and 1000000),
 rate integer not null, reward_date date not null, memo text not null default '' check(length(memo)<=1000),
 created_at timestamptz not null default now(), cancelled_at timestamptz,
 foreign key(room_id,user_id) references public.tok_pair_members(room_id,user_id)
);
create table public.tok_pair_ledger (
 id uuid primary key default gen_random_uuid(), room_id uuid not null, user_id uuid not null,
 kind text not null check(kind in ('earn','spend','cancel')), amount integer not null,
 proof_id uuid references public.tok_pair_proofs(id), reward_id uuid references public.tok_pair_rewards(id),
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(room_id,user_id) references public.tok_pair_members(room_id,user_id),
 unique(proof_id), unique(reward_id,kind),
 check((kind='earn' and amount>0 and proof_id is not null and reward_id is null) or
       (kind='spend' and amount<0 and proof_id is null and reward_id is not null) or
       (kind='cancel' and amount>0 and proof_id is null and reward_id is not null))
);
create table public.tok_pair_diaries (
 id uuid primary key, room_id uuid not null, user_id uuid not null, entry_date date not null,
 mood text not null default '' check(length(mood)<=30), body text not null check(length(trim(body)) between 1 and 10000),
 image_path text, published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(room_id,user_id) references public.tok_pair_members(room_id,user_id), unique(room_id,user_id,entry_date)
);
create table public.tok_pair_replies (
 id uuid primary key, room_id uuid not null, user_id uuid not null,
 diary_id uuid not null references public.tok_pair_diaries(id) on delete cascade,
 body text not null check(length(trim(body)) between 1 and 500),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(room_id,user_id) references public.tok_pair_members(room_id,user_id)
);

create function tok_pair_private.capacity() returns integer language sql immutable set search_path='' as $$select 2$$;
create function tok_pair_private.is_member(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tok_pair_members where room_id=r and user_id=auth.uid())
$$;
create function tok_pair_private.can_read_diary(d uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.tok_pair_diaries where id=d and tok_pair_private.is_member(room_id) and (user_id=auth.uid() or published_at is not null))
$$;

do $$declare t text; begin
 foreach t in array array['rooms','members','invites','plans','proofs','ledger','rewards','diaries','replies'] loop
  execute format('alter table public.tok_pair_%I enable row level security',t);
  execute format('revoke all on public.tok_pair_%I from public, anon, authenticated',t);
  execute format('grant select on public.tok_pair_%I to authenticated',t);
 end loop;
 foreach t in array array['members','plans','proofs','ledger','rewards'] loop
  execute format('create policy member_read on public.tok_pair_%I for select to authenticated using(tok_pair_private.is_member(room_id))',t);
  execute format('create index on public.tok_pair_%I(room_id)',t);
 end loop;
end$$;
create policy member_read on public.tok_pair_rooms for select to authenticated using(tok_pair_private.is_member(id));
create policy owner_read on public.tok_pair_invites for select to authenticated using(exists(select 1 from public.tok_pair_rooms where id=room_id and owner_id=auth.uid()));
create policy diary_read on public.tok_pair_diaries for select to authenticated using(tok_pair_private.is_member(room_id) and (user_id=auth.uid() or published_at is not null));
create policy reply_read on public.tok_pair_replies for select to authenticated using(tok_pair_private.can_read_diary(diary_id));
create index on public.tok_pair_invites(room_id);
create index on public.tok_pair_diaries(room_id,entry_date);
create index on public.tok_pair_replies(diary_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('tok-pair-images','tok-pair-images',false,8388608,array['image/jpeg','image/png','image/webp','image/gif']);
create function tok_pair_private.can_upload(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and split_part(path,'/',2)=auth.uid()::text and exists(
 select 1 from public.tok_pair_members where room_id::text=split_part(path,'/',1) and user_id=auth.uid())
$$;
create function tok_pair_private.can_read_image(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (tok_pair_private.can_upload(path) or
 exists(select 1 from public.tok_pair_proofs where image_path=path and tok_pair_private.is_member(room_id)) or
 exists(select 1 from public.tok_pair_diaries where image_path=path and published_at is not null and tok_pair_private.is_member(room_id)))
$$;
create policy tok_pair_image_insert on storage.objects for insert to authenticated with check(bucket_id='tok-pair-images' and tok_pair_private.can_upload(name));
create policy tok_pair_image_read on storage.objects for select to authenticated using(bucket_id='tok-pair-images' and tok_pair_private.can_read_image(name));

-- Single mutation entry point. Room row lock covers every balance/capacity transition.
create function tok_pair_private.mutate(op text, p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); r uuid; k uuid; q uuid; img text; title text; balance bigint;
 room public.tok_pair_rooms%rowtype; inv public.tok_pair_invites%rowtype;
 plan public.tok_pair_plans%rowtype; proof public.tok_pair_proofs%rowtype;
 reward public.tok_pair_rewards%rowtype; diary public.tok_pair_diaries%rowtype;
begin
 if u is null then raise exception '로그인이 필요해요'; end if;
 k:=nullif(p->>'id','')::uuid;
 if op='create_room' then
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  if exists(select 1 from public.tok_pair_rooms where id=k and owner_id=u) then return jsonb_build_object('id',k); end if;
  if exists(select 1 from public.tok_pair_members where user_id=u) then raise exception '이미 참여한 방이 있어요'; end if;
  insert into public.tok_pair_rooms(id,owner_id,name,rate) values(k,u,trim(p->>'name'),(p->>'rate')::integer);
  insert into public.tok_pair_members(room_id,user_id,nickname) values(k,u,trim(p->>'nickname'));
  insert into public.tok_pair_invites(id,room_id) values(gen_random_uuid(),k);
  return jsonb_build_object('id',k);
 end if;
 if op='join' then
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select room_id into r from public.tok_pair_invites where id=k;
  if r is null then raise exception '초대 코드를 확인해주세요'; end if;
 else r:=(p->>'room_id')::uuid; end if;
 select * into room from public.tok_pair_rooms where id=r for update;
 if not found then raise exception '방을 찾을 수 없어요'; end if;
 if op='join' then
  select * into inv from public.tok_pair_invites where id=k;
  if exists(select 1 from public.tok_pair_members where room_id=r and user_id=u) then raise exception '이미 이 방에 참여했어요'; end if;
  if inv.revoked_at is not null then raise exception '취소된 초대예요'; end if;
  if inv.expires_at<=now() then raise exception '만료된 초대예요'; end if;
  if inv.accepted_by is not null or (select count(*) from public.tok_pair_members where room_id=r)>=tok_pair_private.capacity() then raise exception '방 정원이 가득 찼어요 (2명)'; end if;
  if exists(select 1 from public.tok_pair_members where user_id=u) then raise exception '이미 다른 방에 참여했어요'; end if;
  insert into public.tok_pair_members(room_id,user_id,nickname) values(r,u,trim(p->>'nickname'));
  update public.tok_pair_invites set accepted_by=u,accepted_at=now() where id=k;
  return jsonb_build_object('id',r);
 end if;
 if not tok_pair_private.is_member(r) then raise exception '방 참여자만 이용할 수 있어요'; end if;
 if op in ('invite','revoke_invite') then
  if room.owner_id<>u then raise exception '방장만 초대를 관리할 수 있어요'; end if;
  if op='invite' and exists(select 1 from public.tok_pair_invites where id=k and room_id=r) then return jsonb_build_object('id',k); end if;
  update public.tok_pair_invites set revoked_at=coalesce(revoked_at,now()) where room_id=r and accepted_by is null;
  if op='invite' then insert into public.tok_pair_invites(id,room_id) values(k,r); end if;
 elsif op='plan' then
  if exists(select 1 from public.tok_pair_plans where id=k and room_id=r and user_id=u) then return jsonb_build_object('id',k); end if;
  title:=trim(p->>'title'); q:=nullif(p->>'source_id','')::uuid;
  if p->>'source_kind'='todo' then select t.title into title from public.tok_todos t where t.id=q and t.user_id=u;
  elsif p->>'source_kind'='habit' then select t.name into title from public.tok_habits t where t.id=q and t.user_id=u;
  elsif p->>'source_kind' is not null or q is not null then raise exception '연결할 계획을 확인해주세요'; end if;
  if title is null then raise exception '본인의 계획만 연결할 수 있어요'; end if;
  insert into public.tok_pair_plans(id,room_id,user_id,title,due_date,points,source_kind,source_id)
   values(k,r,u,title,(p->>'due_date')::date,(p->>'points')::integer,p->>'source_kind',q);
 elsif op='proof' then
  select * into plan from public.tok_pair_plans where id=(p->>'plan_id')::uuid and room_id=r and user_id=u;
  if not found then raise exception '본인 계획만 인증할 수 있어요'; end if;
  if exists(select 1 from public.tok_pair_proofs where plan_id=plan.id) then return jsonb_build_object('id',plan.id); end if;
  img:=p->>'image_path';
  if not coalesce(tok_pair_private.can_upload(img),false) or split_part(img,'/',1)<>r::text or not exists(select 1 from storage.objects where bucket_id='tok-pair-images' and name=img) then raise exception '사진 업로드를 먼저 완료해주세요'; end if;
  insert into public.tok_pair_proofs(id,room_id,user_id,plan_id,image_path,body,performed_on)
   values(k,r,u,plan.id,img,trim(p->>'body'),plan.due_date);
 elsif op='confirm' then
  select * into proof from public.tok_pair_proofs where id=k and room_id=r;
  if not found then raise exception '인증을 찾을 수 없어요'; end if;
  if proof.user_id=u then raise exception '내 인증은 내가 확인할 수 없어요'; end if;
  if proof.confirmed_at is not null then return jsonb_build_object('id',k); end if;
  select * into plan from public.tok_pair_plans where id=proof.plan_id;
  update public.tok_pair_proofs set confirmed_by=u,confirmed_at=now() where id=k;
  insert into public.tok_pair_ledger(room_id,user_id,kind,amount,proof_id,actor_id) values(r,proof.user_id,'earn',plan.points,k,u);
 elsif op='reward' then
  if exists(select 1 from public.tok_pair_rewards where id=k and room_id=r and user_id=u) then return jsonb_build_object('id',k); end if;
  select coalesce(sum(amount),0) into balance from public.tok_pair_ledger where room_id=r and user_id=u;
  if (p->>'points')::integer>balance then raise exception '잔여 점수를 넘겨 사용할 수 없어요'; end if;
  insert into public.tok_pair_rewards(id,room_id,user_id,title,points,rate,reward_date,memo)
   values(k,r,u,trim(p->>'title'),(p->>'points')::integer,room.rate,(p->>'reward_date')::date,coalesce(p->>'memo',''));
  insert into public.tok_pair_ledger(room_id,user_id,kind,amount,reward_id,actor_id) values(r,u,'spend',-(p->>'points')::integer,k,u);
 elsif op='cancel_reward' then
  select * into reward from public.tok_pair_rewards where id=k and room_id=r and user_id=u;
  if not found then raise exception '본인 보상만 취소할 수 있어요'; end if;
  if reward.cancelled_at is not null then return jsonb_build_object('id',k); end if;
  update public.tok_pair_rewards set cancelled_at=now() where id=k;
  insert into public.tok_pair_ledger(room_id,user_id,kind,amount,reward_id,actor_id) values(r,u,'cancel',reward.points,k,u);
 elsif op='diary' then
  select * into diary from public.tok_pair_diaries where id=k;
  if found and (diary.room_id<>r or diary.user_id<>u) then raise exception '본인 일기만 수정할 수 있어요'; end if;
  img:=nullif(p->>'image_path','');
  if img is not null and (not tok_pair_private.can_upload(img) or split_part(img,'/',1)<>r::text or not exists(select 1 from storage.objects where bucket_id='tok-pair-images' and name=img)) then raise exception '사진 업로드를 먼저 완료해주세요'; end if;
  insert into public.tok_pair_diaries(id,room_id,user_id,entry_date,mood,body,image_path,published_at)
   values(k,r,u,(p->>'entry_date')::date,coalesce(p->>'mood',''),trim(p->>'body'),img,case when (p->>'publish')::boolean then now() end)
   on conflict(id) do update set mood=excluded.mood,body=excluded.body,image_path=excluded.image_path,
    published_at=coalesce(tok_pair_diaries.published_at,excluded.published_at),updated_at=now();
 elsif op='delete_diary' then
  delete from public.tok_pair_diaries where id=k and room_id=r and user_id=u;
 elsif op='reply' then
  q:=(p->>'diary_id')::uuid;
  if not exists(select 1 from public.tok_pair_diaries where id=q and room_id=r and published_at is not null) then raise exception '공개된 일기에만 답글을 쓸 수 있어요'; end if;
  if exists(select 1 from public.tok_pair_replies where id=k and (user_id<>u or room_id<>r or diary_id<>q)) then raise exception '본인 답글만 수정할 수 있어요'; end if;
  insert into public.tok_pair_replies(id,room_id,user_id,diary_id,body) values(k,r,u,q,trim(p->>'body'))
   on conflict(id) do update set body=excluded.body,updated_at=now();
 elsif op='delete_reply' then
  delete from public.tok_pair_replies where id=k and room_id=r and user_id=u;
 else raise exception '지원하지 않는 요청이에요'; end if;
 return jsonb_build_object('id',k);
end$$;

create function public.tok_pair_mutate(op text,p jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select tok_pair_private.mutate(op,p)
$$;
revoke all on all functions in schema tok_pair_private from public,anon;
grant execute on all functions in schema tok_pair_private to authenticated;
revoke all on function public.tok_pair_mutate(text,jsonb) from public,anon;
grant execute on function public.tok_pair_mutate(text,jsonb) to authenticated;
commit;
