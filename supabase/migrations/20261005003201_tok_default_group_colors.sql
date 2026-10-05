begin;
alter table public.tok_settings add column if not exists default_group_colors jsonb;
alter table public.tok_settings add constraint tok_settings_default_group_colors_check
  check (default_group_colors is null or jsonb_typeof(default_group_colors) = 'object');
comment on column public.tok_settings.default_group_colors is
  'Per-kind colors for unassigned (default) groups: event, todo, habit. Category colors and item group links are unchanged.';
commit;
