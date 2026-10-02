-- Optional plan image, separate from completion proof. Existing plans stay unchanged.
begin;
alter table public.tok_pair_plans add column image_path text;
create index tok_pair_plan_image_path on public.tok_pair_plans(image_path) where image_path is not null;

create function tok_pair_private.create_plan(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); r uuid:=(p->>'room_id')::uuid; k uuid:=(p->>'id')::uuid;
 img text:=nullif(p->>'image_path',''); result jsonb;
begin
 if u is null then raise exception '로그인이 필요해요'; end if;
 if not tok_pair_private.is_member(r) then raise exception '방 참여자만 이용할 수 있어요'; end if;
 perform 1 from public.tok_pair_rooms where id=r for update;
 -- A retry must never replace the image (including after confirmation).
 if exists(select 1 from public.tok_pair_plans where id=k and room_id=r and user_id=u) then
  return jsonb_build_object('id',k);
 end if;
 if img is not null and (not coalesce(tok_pair_private.can_upload(img),false)
  or split_part(img,'/',1)<>r::text
  or not exists(select 1 from storage.objects where bucket_id='tok-pair-images' and name=img)) then
  raise exception '사진 업로드를 먼저 완료해주세요';
 end if;
 -- Reuse the existing source ownership, score and recurrence validation.
 result:=tok_pair_private.mutate('plan',p);
 update public.tok_pair_plans set image_path=img where id=k and room_id=r and user_id=u;
 return result;
end$$;
revoke all on function tok_pair_private.create_plan(jsonb) from public,anon;
grant execute on function tok_pair_private.create_plan(jsonb) to authenticated;

create or replace function public.tok_pair_mutate(op text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select case when op='plan' then tok_pair_private.create_plan(p) else tok_pair_private.mutate(op,p) end
$$;

create or replace function tok_pair_private.can_read_image(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (tok_pair_private.can_upload(path) or
 exists(select 1 from public.tok_pair_plans where image_path=path and tok_pair_private.is_member(room_id)) or
 exists(select 1 from public.tok_pair_proofs where image_path=path and tok_pair_private.is_member(room_id)) or
 exists(select 1 from public.tok_pair_diaries where image_path=path and published_at is not null and tok_pair_private.is_member(room_id)))
$$;
commit;
