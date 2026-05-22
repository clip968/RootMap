# RLS Test Plan

## Target Policy

Run live RLS negative tests against local or staging/production-like Supabase first. Production requires explicit approval.

## Required Environment

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or publishable key
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`

## Procedure

1. Run `npm run phase6:security-preflight` from `apps/web`.
2. Apply required migrations in order.
3. Run `npm run phase6:rls-negative-smoke`.
4. Confirm every Phase 4 owner table blocks cross-user read/update.
5. Confirm cleanup leaves zero `phase6-%` concept rows and zero `phase6-%@example.invalid` auth users.

## Failure Rules

- If the smoke uses a service key as the user token, the result is invalid.
- If any cross-user read returns a row, stop and treat it as a P0 security failure.
- If cleanup leaves test users or rows, clean them before retrying.
