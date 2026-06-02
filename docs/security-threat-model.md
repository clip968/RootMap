# RootMap Security Threat Model

## Assets

- Supabase Auth user id and session tokens.
- User-owned learning data: sessions, events, mastery, quiz attempts, recommendation logs, and reports.
- Uploaded documents and derived evidence snippets.
- Server-only secrets such as `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and LLM provider keys.

## Trust Boundaries

- Browser code may use only publishable Supabase config.
- Server routes must validate Supabase access tokens with `requireSupabaseAuthUserId`.
- Direct Postgres access through `DATABASE_URL` is privileged in the current environment and can bypass RLS, so route-level `user_id` filters remain required.
- Supabase REST/Auth negative tests are the DB-level isolation proof because they use user access tokens instead of the direct Postgres role.
- Legacy text owner tables compare Supabase Auth users with `auth.uid()::text = user_id` until a later UUID migration.

## Controls

- Phase 4 owner tables use `user_id uuid references auth.users(id)`.
- RLS is enabled on user-owned Phase 4 tables.
- Owner policies restrict authenticated users with `auth.uid() = user_id`.
- Phase 11 legacy owner tables (`learning_trees`, `documents`, `user_node_progress`, `user_concept_progress`, `llm_provider_settings`) use authenticated owner policies with `auth.uid()::text = user_id`.
- Phase 06/11 live smoke creates user A and user B, seeds user B rows, then verifies user A cannot read, update, or delete them and that the owner row survives.
- Service-role keys are used only by local/server smoke setup and cleanup. They must never be committed or exposed through `NEXT_PUBLIC_` variables.

## Residual Risks

- The direct Postgres role reports `bypassrls=true`, so DB RLS is not the only control for server-side Drizzle queries.
- Legacy text `user_id` tables still need long-term UUID migration or mapping; `DEFAULT_USER_ID` rows remain development seed data and are not automatically assigned to production users.
- Derived tables without direct `user_id` columns still rely on route-level parent owner checks unless a later migration adds parent-join or security-definer RLS policies.
- Production RLS tests require explicit approval and cleanup evidence.
