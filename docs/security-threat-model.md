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

## Controls

- Phase 4 owner tables use `user_id uuid references auth.users(id)`.
- RLS is enabled on user-owned Phase 4 tables.
- Owner policies restrict authenticated users with `auth.uid() = user_id`.
- Phase 11 legacy user-owned tables (`learning_trees`, `documents`, `user_node_progress`, `user_concept_progress`, `llm_provider_settings`) keep their text `user_id` column and gain owner policies using `auth.uid()::text = user_id` (migration `0009_phase11_legacy_owner_rls.sql`). These tables had RLS enabled since migration `0000` but carried no policy, which left the `authenticated` REST role fully denied; the new owner policies scope REST access to the row owner.
- Route-level `user_id` filters are the primary defense for both Phase 4 and legacy tables, because the application connects with a direct Postgres role that can bypass RLS. DB-level RLS is the second layer that limits exposure if the Supabase Data API is reached directly.
- Phase 06 live smoke creates user A and user B, seeds user B rows, then verifies user A cannot read or update them. Phase 11 extends the same smoke to the legacy text `user_id` tables.
- `DEFAULT_USER_ID` rows are treated as development seed data only; they are not a real owner and must not be relied on for production isolation.
- Service-role keys are used only by local/server smoke setup and cleanup. They must never be committed or exposed through `NEXT_PUBLIC_` variables.

## Residual Risks

- The direct Postgres role reports `bypassrls=true`, so DB RLS is not the only control for server-side Drizzle queries; route-level filters stay mandatory.
- Legacy text `user_id` tables still need long-term UUID migration or mapping; the `auth.uid()::text = user_id` policy is a bridge, not the final shape.
- Derived tables that lack a direct `user_id` (`learning_nodes`, `document_pages`, `document_chunks`, `document_concepts`, `document_learning_trees`, `node_detail_jobs`) are protected by route-level owner checks via their parent. REST-level policies for these would require parent joins or security-definer helpers and are deferred to a later migration; until then, direct REST exposure of these tables is a residual risk.
- Production RLS tests require explicit approval and cleanup evidence.
