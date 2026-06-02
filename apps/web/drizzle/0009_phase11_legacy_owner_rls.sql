-- Phase 11: legacy text-owner tables still store Supabase Auth ids as text.
-- These policies protect Supabase REST/Data API access while route-level owner
-- filters remain mandatory for privileged server-side Postgres connections.

alter table "learning_trees" enable row level security;
drop policy if exists "learning_trees_owner_all" on "learning_trees";
create policy "learning_trees_owner_all" on "learning_trees"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

alter table "documents" enable row level security;
drop policy if exists "documents_owner_all" on "documents";
create policy "documents_owner_all" on "documents"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

alter table "user_node_progress" enable row level security;
drop policy if exists "user_node_progress_owner_all" on "user_node_progress";
create policy "user_node_progress_owner_all" on "user_node_progress"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

alter table "user_concept_progress" enable row level security;
drop policy if exists "user_concept_progress_owner_all" on "user_concept_progress";
create policy "user_concept_progress_owner_all" on "user_concept_progress"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

alter table "llm_provider_settings" enable row level security;
drop policy if exists "llm_provider_settings_owner_all" on "llm_provider_settings";
create policy "llm_provider_settings_owner_all" on "llm_provider_settings"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);
