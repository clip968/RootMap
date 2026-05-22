# Deployment Runbook

## Environment Targets

- `local`: developer machine and local smoke tests.
- `staging`: production-like Supabase and Vercel preview.
- `production`: real user data. Requires explicit approval for security mutation tests.

## Vercel

Vercel preview should point at staging Supabase when running Phase 06 security tests. Production deployments should use production Supabase and must keep service keys server-only.

## Supabase

Apply migrations before running RLS live tests. After schema changes that affect PostgREST, run:

```sql
notify pgrst, 'reload schema';
```

## Phase 06 Gates

Run from `apps/web`:

```bash
npm run phase6:security-preflight
npm run phase6:rls-negative-smoke
npm run test:unit -- fsrs-lite review-priority
npm run test:unit -- explainable-recommendations
npm run test:llm-eval -- evidence-grounding
npm run test:llm-eval -- prompt-injection
npm run phase6:graph-quality-smoke
npm run phase6:quality
```
