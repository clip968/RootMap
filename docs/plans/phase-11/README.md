# RootMap Phase 11 구현 계획

이 폴더는 RootMap의 production 사용자 흐름을 개발용 `DEFAULT_USER_ID`와 전역 LLM provider 설정에서 Supabase Auth 사용자별 격리 모델로 전환하는 계획을 담는다.

Phase 11의 핵심은 기존 기능을 새로 늘리는 것이 아니라, 이미 존재하는 tree, document, node detail, progress, LLM provider 경로를 실제 계정 경계 안으로 옮기는 것이다. v1에서는 현재 서버 route의 `Authorization: Bearer <access_token>` 검증과 `requireSupabaseAuthUserId(req)` 방식을 확장하며, Supabase SSR cookie auth 전환은 후속 phase로 둔다.

## Phase 11 핵심 목표

1. production API route에서 `DEFAULT_USER_ID` 사용을 제거하고 실제 Supabase Auth `userId`를 명시 전달한다.
2. tree, document, progress, recommendations, node detail job, LLM provider settings가 사용자별로 격리된다.
3. 사용자는 자기 계정의 LLM API key를 등록해야 LLM 생성 기능을 사용할 수 있다.
4. 기존 `DEFAULT_USER_ID` 데이터는 운영 사용자에게 자동 귀속하지 않고 개발 seed로 격리한다.
5. 브라우저 fetch는 공통 authenticated fetch helper를 통해 `Authorization` 헤더를 붙인다.
6. 로그인하지 않은 사용자는 tree 생성, tree 목록, 문서 업로드, LLM 설정 화면에서 로그인 요구 상태를 본다.
7. Supabase RLS policy는 `to authenticated`와 `auth.uid()` 기반 owner 조건을 따른다.
8. Phase 6 보안 audit/smoke를 확장해 계정별 격리 회귀를 잡는다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-auth-isolation-contract-and-audit.md](./00-auth-isolation-contract-and-audit.md) | scope, 금지 경로, RED audit 고정 | P0 |
| 1 | [01-browser-authenticated-fetch-and-login-gates.md](./01-browser-authenticated-fetch-and-login-gates.md) | browser token helper와 로그인 요구 UI 고정 | P0 |
| 2 | [02-tree-routes-progress-and-recommendations.md](./02-tree-routes-progress-and-recommendations.md) | tree 생성/목록/상세/progress/recommendations route auth 전환 | P0 |
| 3 | [03-document-routes-and-processing-ownership.md](./03-document-routes-and-processing-ownership.md) | document upload/read/process/tree/concepts/evidence 사용자 격리 | P0 |
| 4 | [04-user-owned-llm-provider-settings.md](./04-user-owned-llm-provider-settings.md) | LLM provider settings를 user-owned table로 전환 | P0 |
| 5 | [05-llm-generation-provider-boundary.md](./05-llm-generation-provider-boundary.md) | 모든 production LLM 호출을 user provider config로 실행 | P0 |
| 6 | [06-node-detail-job-ownership.md](./06-node-detail-job-ownership.md) | node detail enqueue/poll/worker owner 검증 | P1 |
| 7 | [07-rls-migrations-and-negative-smoke.md](./07-rls-migrations-and-negative-smoke.md) | RLS policy, migration, A/B negative smoke 확장 | P1 |
| 8 | [08-quality-gate-docs-and-rollout.md](./08-quality-gate-docs-and-rollout.md) | 최종 검증, 문서, checklist, commit/push 기준 | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [ ] 00. [00-auth-isolation-contract-and-audit.md](./00-auth-isolation-contract-and-audit.md) - Auth isolation 계약과 RED audit 고정
- [ ] 01. [01-browser-authenticated-fetch-and-login-gates.md](./01-browser-authenticated-fetch-and-login-gates.md) - browser authenticated fetch와 로그인 요구 UI
- [ ] 02. [02-tree-routes-progress-and-recommendations.md](./02-tree-routes-progress-and-recommendations.md) - tree/progress/recommendation route auth 전환
- [ ] 03. [03-document-routes-and-processing-ownership.md](./03-document-routes-and-processing-ownership.md) - document route와 processing ownership 전환
- [ ] 04. [04-user-owned-llm-provider-settings.md](./04-user-owned-llm-provider-settings.md) - user-owned LLM provider settings
- [ ] 05. [05-llm-generation-provider-boundary.md](./05-llm-generation-provider-boundary.md) - LLM generation user provider boundary
- [ ] 06. [06-node-detail-job-ownership.md](./06-node-detail-job-ownership.md) - node detail job ownership 검증
- [ ] 07. [07-rls-migrations-and-negative-smoke.md](./07-rls-migrations-and-negative-smoke.md) - RLS migration과 A/B negative smoke 확장
- [ ] 08. [08-quality-gate-docs-and-rollout.md](./08-quality-gate-docs-and-rollout.md) - quality gate, docs, rollout 정리

## 범위 요약

### 포함

- production API route의 Supabase Auth `userId` 적용
- tree, document, progress, recommendation, node detail job 사용자 격리
- 계정별 LLM provider settings 저장/조회/삭제/테스트
- 사용자 key 미등록 시 `LLM_PROVIDER_REQUIRED` 응답
- browser authenticated fetch helper와 로그인 요구 상태
- Phase 6 user-id audit, RLS negative smoke, LLM provider smoke 확장
- Drizzle schema와 migration의 owner policy 정리
- 관련 docs/checklist 업데이트

### 제외

- Supabase SSR cookie auth migration
- 기존 `DEFAULT_USER_ID` 데이터의 운영 사용자 자동 귀속
- org/team sharing, share link, billing, quota dashboard
- auth provider UI 전체 재설계
- LLM provider pricing/model 비교 기능
- 전체 DB UUID migration

## 의사결정 포인트

- Supabase Auth가 계정 source of truth다.
- 신규 production 데이터의 `user_id` 값은 Supabase Auth UUID 문자열이다.
- 기존 legacy text `user_id` 컬럼은 즉시 UUID 타입으로 바꾸지 않고 route-level filter와 RLS policy로 보호한다.
- `DEFAULT_USER_ID`는 scripts, smoke, local runner 같은 개발 전용 경로에서만 허용한다.
- 저장된 provider key가 없을 때 env fallback은 production 사용자에게 노출하지 않는다.
- env fallback은 smoke/local-only helper에서만 유지한다.
- 다른 사용자의 `treeId`, `documentId`, `jobId`는 404 또는 403으로 차단한다.

## 완료 조건

Phase 11이 끝나면 로그인한 사용자 A가 만든 tree, document, progress, node detail job, LLM provider settings를 사용자 B가 목록 조회, 상세 조회, update, polling으로 접근할 수 없다. 사용자 B가 LLM provider key를 등록하지 않은 상태에서 LLM 생성 기능을 호출하면 `LLM_PROVIDER_REQUIRED`를 받고, 사용자 A의 key 또는 env fallback으로 생성되지 않는다.

최종 검증은 `apps/web`에서 `npm run phase6:user-id-audit`, `npm run phase6:rls-negative-smoke`, `npm run llm:smoke-provider-settings`, `npm run check`가 통과하는 것으로 고정한다.
