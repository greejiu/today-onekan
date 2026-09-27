-- Account-scoped app symbol; preserve existing settings and ownership policies.
-- Apply before deploying the UI.
begin;
alter table public.tok_settings
  add column if not exists app_symbol text not null default 'hankan'
  constraint tok_settings_app_symbol_check check (app_symbol in ('hankan', 'cheese', 'step', 'check'));
comment on column public.tok_settings.app_symbol is
  'Personal in-app brand symbol only. Does not change the favicon or install icon.';
commit;
