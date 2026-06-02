# RLS Test Plan

## Target Policy

Run live RLS negative tests against local or staging/production-like Supabase first. Production requires explicit approval.

Phase 4 UUID owner tables use `auth.uid() = user_id`. Phase 11 legacy owner tables keep text `user_id` columns and therefore use `auth.uid()::text = user_id` for `learning_trees`, `documents`, `user_node_progress`, `user_concept_progress`, and `llm_provider_settings`.

## Required Environment

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or publishable key
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`

## Procedure

1. Run `npm run phase6:security-preflight` from `apps/web`.
2. Apply required migrations in order.
3. Run `npm run phase6:rls-negative-smoke`.
4. Confirm every Phase 4 owner table blocks cross-user read/update/delete and the owner row survives.
5. Confirm every Phase 11 legacy text owner table blocks cross-user read/update/delete and the owner row survives.
6. Confirm cleanup leaves zero `phase6-%` concept rows and zero `phase6-%@example.invalid` auth users.

## Coverage Notes

- `learning_trees`, `documents`, `user_node_progress`, `user_concept_progress`, and `llm_provider_settings` are direct owner tables covered by the live A/B smoke.
- `learning_nodes`, `document_pages`, `document_chunks`, `document_concepts`, `document_learning_trees`, and `node_detail_jobs` do not all carry direct `user_id`; route-level parent owner checks remain the primary control until a dedicated derived-table RLS migration is added.
- Direct Postgres roles can bypass RLS in the current deployment shape, so passing Supabase REST smoke does not replace route-level `user_id` filters.
- `DEFAULT_USER_ID` rows are treated as development seed data, not production user ownership.

## Failure Rules

- If the smoke uses a service key as the user token, the result is invalid.
- If any cross-user read/update/delete returns a row, stop and treat it as a P0 security failure.
- If cleanup leaves test users or rows, clean them before retrying.
