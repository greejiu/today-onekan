begin;

-- NULL preserves the registry defaults for existing and newly created users.
alter table public.tok_settings
  add column if not exists navigation_config jsonb;

alter table public.tok_settings
  add constraint tok_settings_navigation_config_check check (
    navigation_config is null or (
      jsonb_typeof(navigation_config) = 'object'
      and navigation_config ?& array['version', 'order', 'hidden']
      and navigation_config->'version' = '1'::jsonb
      and jsonb_typeof(navigation_config->'order') = 'array'
      and jsonb_typeof(navigation_config->'hidden') = 'array'
    )
  );

comment on column public.tok_settings.navigation_config is
  'Navigation-only preferences: version 1, ordered configurable page IDs, hidden page IDs. Settings is always accessible.';

-- Existing owner-based SELECT / INSERT / UPDATE policies remain unchanged.
commit;
