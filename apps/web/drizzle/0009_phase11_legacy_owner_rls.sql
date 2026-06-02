-- Phase 11 task 07: owner RLS policies for legacy text user_id tables and LLM provider settings.
--
-- These tables already have RLS enabled (migration 0000) but carried no policies,
-- which left the `authenticated` Supabase REST role fully denied. Phase 11 adds
-- owner-scoped policies so that, if the Supabase Data API is ever exposed, an
-- authenticated user can only read/write their own rows. Route-level owner filters
-- remain the primary defense because the application connects with a direct
-- Postgres role that can bypass RLS.
--
-- Legacy tables store user_id as text, so the owner predicate casts auth.uid()
-- to text: (select auth.uid())::text = user_id. The (select ...) wrapper lets
-- Postgres evaluate auth.uid() once per statement instead of per row.

-- llm_provider_settings (user-owned; user_id added in migration 0008)
alter table "llm_provider_settings" enable row level security;
drop policy if exists "llm_provider_settings_owner_all" on "llm_provider_settings";
create policy "llm_provider_settings_owner_all" on "llm_provider_settings"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

-- learning_trees (legacy text user_id)
alter table "learning_trees" enable row level security;
drop policy if exists "learning_trees_owner_all" on "learning_trees";
create policy "learning_trees_owner_all" on "learning_trees"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

-- documents (legacy text user_id)
alter table "documents" enable row level security;
drop policy if exists "documents_owner_all" on "documents";
create policy "documents_owner_all" on "documents"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

-- user_node_progress (legacy text user_id)
alter table "user_node_progress" enable row level security;
drop policy if exists "user_node_progress_owner_all" on "user_node_progress";
create policy "user_node_progress_owner_all" on "user_node_progress"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

-- user_concept_progress (legacy text user_id)
alter table "user_concept_progress" enable row level security;
drop policy if exists "user_concept_progress_owner_all" on "user_concept_progress";
create policy "user_concept_progress_owner_all" on "user_concept_progress"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);
