-- NOT APPLIED. Run only in the trusted Supabase SQL editor before beta release.
-- Never expose service-role credentials or allow users to write this flag.
do $$
declare affected integer;
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || '{"today_onekan_operator":true}'::jsonb
  where id = 'be15b223-40ae-4059-b283-f76637a7bd0a'::uuid
    and lower(email) = 'monggreee@naver.com'
    and email_confirmed_at is not null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Verified operator identity did not match exactly one account';
  end if;
end $$;
