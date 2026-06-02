alter table "llm_provider_settings"
  add column if not exists "user_id" text;

update "llm_provider_settings"
set "user_id" = 'legacy_global_provider'
where "user_id" is null or "user_id" = '';

update "llm_provider_settings"
set "is_active" = false
where "user_id" = 'legacy_global_provider';

alter table "llm_provider_settings"
  alter column "user_id" set not null;

create index if not exists "llm_provider_settings_user_active_idx"
  on "llm_provider_settings" ("user_id", "is_active");

create unique index if not exists "llm_provider_settings_user_active_uidx"
  on "llm_provider_settings" ("user_id")
  where "is_active" = true;
