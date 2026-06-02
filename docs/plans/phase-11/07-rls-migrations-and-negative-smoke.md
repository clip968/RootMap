# 07. RLS Migrations와 Negative Smoke 확장

## 목표

Supabase Data API 노출 대비 RLS policy를 user-owned legacy text tables와 LLM provider settings에 추가하고, A/B negative smoke로 실제 차단을 검증한다.

## 현재 문제

Phase 4 UUID owner tables는 RLS policy가 있지만, tree/document/progress 같은 legacy text `user_id` 계층은 route-level filter에 더 많이 의존한다. direct Postgres role은 RLS를 우회할 수 있으므로 route-level filter는 계속 필요하지만, Supabase REST 접근 대비 policy도 함께 있어야 한다.

## 관련 파일

- `apps/web/src/db/schema.ts`
- `apps/web/drizzle/0008_llm_provider_settings_user_id.sql`
- `apps/web/drizzle/0009_phase11_legacy_owner_rls.sql`
- `apps/web/scripts/phase6-rls-negative-smoke.ts`
- `apps/web/scripts/phase6-security-utils.ts`
- `docs/security-threat-model.md`
- `docs/rls-test-plan.md`

## 구현 작업

### 1. LLM provider owner policy 추가

`llm_provider_settings`는 user-owned table이다.

Policy shape:

```sql
create policy "llm_provider_settings_owner_all" on "llm_provider_settings"
  for all to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);
```

### 2. Legacy text owner policy 추가

다음 table은 text `user_id`를 유지하되 RLS policy를 추가한다.

- `learning_trees`
- `documents`
- `user_node_progress`
- `user_concept_progress`

Policy shape:

```sql
for all to authenticated
using ((select auth.uid())::text = user_id)
with check ((select auth.uid())::text = user_id)
```

### 3. Derived table access policy 검토

다음 table은 직접 `user_id`가 없고 parent ownership을 따라간다.

- `learning_nodes`
- `document_pages`
- `document_chunks`
- `document_concepts`
- `document_learning_trees`
- `node_detail_jobs`

Phase 11에서는 route-level owner checks를 1차 방어로 두고, REST 노출 policy가 필요하면 parent join 또는 security definer helper를 별도 migration으로 둔다. 이 결정과 residual risk를 문서에 남긴다.

### 4. A/B negative smoke 확장

`phase6-rls-negative-smoke.ts`에 다음 시나리오를 추가한다.

- user B row를 `learning_trees`, `documents`, `user_node_progress`, `user_concept_progress`, `llm_provider_settings`에 seed한다.
- user A token으로 select/update/delete가 0 rows 또는 403이 되는지 확인한다.
- user B token으로 owner positive select가 되는지 확인한다.
- cleanup은 service role로 수행한다.

### 5. Security docs 업데이트

`docs/security-threat-model.md`와 `docs/rls-test-plan.md`에 다음을 반영한다.

- legacy text user id policy는 `auth.uid()::text = user_id`를 사용한다.
- direct Postgres role 우회 가능성 때문에 route-level filter가 여전히 필수다.
- `DEFAULT_USER_ID` rows는 개발 seed로 취급한다.

## 완료 기준(DoD)

- owner policy가 `to authenticated`와 `auth.uid()` 조건을 명시한다.
- legacy text user-owned tables에 RLS negative smoke가 추가된다.
- A/B smoke가 다른 사용자 row read/update/delete 차단을 검증한다.
- docs가 route-level filter와 DB-level RLS의 역할을 분리해서 설명한다.

## 검증 명령

```bash
cd apps/web
npm run phase6:rls-negative-smoke
npm run phase6:security-preflight
```
