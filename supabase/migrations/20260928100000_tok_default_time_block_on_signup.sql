-- 신규 계정 기본 시간블럭 (2026-09-28)
--
-- 새 계정이 만들어질 때(auth.users INSERT) 한 번만 '시간블럭 1'(06:00~24:00, start 360 / end 1440, 순서 0)을 만듦.
--   - 계정 생성 시점의 DB 트리거라 새로고침·재로그인·여러 기기 동시 접속과 무관하게 계정당 정확히 한 번만 실행됨.
--   - "블럭 0개"로 신규 여부를 판단하지 않음 → 사용자가 나중에 블럭을 고치거나 모두 지워도 다시 만들지 않음.
--   - 기존 계정에는 아무것도 하지 않음(이미 있는 사용자는 INSERT가 다시 일어나지 않음). 기존 시간블럭 데이터는 수정·삭제하지 않음.
--   - 같은 사용자에게 블럭이 이미 있으면(이론상) 만들지 않음.
--   - 기본 블럭 생성이 어떤 이유로 실패해도 회원가입 자체는 막지 않음(경고만 남김).
--   - '하루종일'은 시간 미지정 항목을 모으는 화면 고정 영역이라 여기서 행으로 만들지 않음.

begin;

create or replace function public.tok_seed_default_time_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.tok_time_blocks (user_id, title, start_minute, end_minute, sort_order)
    select new.id, '시간블럭 1', 360, 1440, 0
    where not exists (select 1 from public.tok_time_blocks b where b.user_id = new.id);
  exception when others then
    raise warning 'tok_seed_default_time_block failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.tok_seed_default_time_block() from public, anon, authenticated;

create trigger tok_seed_default_time_block_on_signup
  after insert on auth.users
  for each row execute function public.tok_seed_default_time_block();

commit;
