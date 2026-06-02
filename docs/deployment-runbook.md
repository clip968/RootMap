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

## Phase 11 Security Rollout Gates

Before rollout, apply `apps/web/drizzle/0009_phase11_legacy_owner_rls.sql` after `0008`, then reload PostgREST schema. Run from `apps/web`:

```bash
npm run phase6:user-id-audit
npm run phase6:security-preflight
npm run phase6:rls-negative-smoke
npm run llm:smoke-provider-settings
npm run check
```

Use staging first. Production RLS smoke creates temporary Auth users and rows, so it requires explicit production-test approval and cleanup confirmation.

## Phase 09 Local Document Processing Runner

Phase 09에서는 GCP worker 경로를 다시 켜기 전에 문서 처리 파이프라인을 로컬 CLI에서 검증한다. 이 단계에서는 `rootmap-document-processing` Cloud Tasks queue를 pause 상태로 유지하고, Cloud Tasks pending task가 0개인지 확인하며, Cloud Run `rootmap-pdf-worker`는 `min instances = 0` 상태로 둔다. Billing, queue resume, Cloud Run 설정 변경은 로컬 runner 검증 이후에도 별도 사용자 승인 없이는 수행하지 않는다.

로컬 runner용 env 파일은 `apps/web/.env.local-worker`를 사용한다. 이 파일은 `.env*` ignore 규칙에 포함되므로 commit하지 않는다. 필수 값은 다음이다.

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DOCUMENT_BUCKET
LLM_SETTINGS_SECRET
```

`DATABASE_URL`은 로컬에서 접속 가능한 Supabase Postgres URL이어야 한다. direct DB host가 IPv6 문제로 실패하면 Supabase connection pooler의 session mode URL을 사용한다. `LLM_SETTINGS_SECRET`은 저장된 provider API key를 복호화할 수 있도록 web app/worker에서 쓰던 값과 같아야 한다.

기본 확인 순서:

```bash
cd apps/web
npm run document:process-local -- --document-id <document-id> --dry-run
npm run document:process-local -- --document-id <document-id> --resume --chunk-batch-size 1
```

`concepts_extracted` 상태에서 tree 저장만 재시도해야 하는 경우:

```bash
cd apps/web
npm run document:process-local -- --document-id <document-id> --tree-only
```

Tree 저장 단계 실패 복구 절차:

1. `--dry-run`으로 `document_concept_count`가 1 이상인지 확인한다.
2. 문서 상태가 `failed`라면 실패 원인을 확인한 뒤 운영자가 DB 상태를 `concepts_extracted`로 되돌린다.
3. `--tree-only`로 실행해 chunk concept LLM 호출 없이 tree 생성/저장만 재시도한다.
4. 성공 로그에서 `processing_status_after = tree_generated`, `tree_id`, `llm_stage_executed = tree_generation`을 확인한다.
5. `document_learning_trees` link가 생성되었는지 확인한 뒤에만 Cloud worker 재개 여부를 판단한다.

Phase 09 최종 검증:

```bash
cd apps/web
npm run document:process-local-smoke
npm run document:processing-jobs-smoke
npm run document:process-local -- --document-id <document-id> --dry-run
npm run document:process-local -- --document-id <document-id> --tree-only
npm run check
```

마지막 두 명령은 실제 Supabase 문서와 `.env.local-worker`가 준비된 운영자 확인 단계다.
