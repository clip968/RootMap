# RLS Test Plan

## Target Policy

Run live RLS negative tests against local or staging/production-like Supabase first. Production requires explicit approval.

Owner policies use one of two predicates depending on the table's `user_id` type:

- Phase 4 UUID owner tables: `auth.uid() = user_id`.
- Phase 11 legacy text owner tables (`learning_trees`, `documents`, `user_node_progress`, `user_concept_progress`, `llm_provider_settings`): `auth.uid()::text = user_id`.

Route-level `user_id` filters remain mandatory for both, because the direct Postgres role can bypass RLS.

## Required Environment

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or publishable key
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`

## Procedure

1. Run `npm run phase6:security-preflight` from `apps/web`.
2. Apply required migrations in order, including `0008_llm_provider_settings_user_id.sql` and `0009_phase11_legacy_owner_rls.sql`.
3. Run `npm run phase6:rls-negative-smoke`.
4. Confirm every Phase 4 owner table and every Phase 11 legacy owner table (`learning_trees`, `documents`, `user_node_progress`, `user_concept_progress`, `llm_provider_settings`) blocks cross-user read/update.
5. Confirm cleanup leaves zero `phase6-%` concept rows and zero `phase6-%@example.invalid` auth users.

## Failure Rules

- If the smoke uses a service key as the user token, the result is invalid.
- If any cross-user read returns a row, stop and treat it as a P0 security failure.
- If cleanup leaves test users or rows, clean them before retrying.
