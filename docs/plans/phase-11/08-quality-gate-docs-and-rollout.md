# 08. Quality Gate, Docs, Rollout

## 목표

Phase 11 구현 결과를 정해진 verification command로 검증하고, 관련 문서와 checklist를 업데이트한 뒤 task 단위 commit/push 기준을 지킨다.

## 현재 문제

사용자 격리 전환은 route, repository, LLM provider, worker, RLS를 함께 건드린다. 부분 구현 상태에서 checklist를 완료 처리하면 production path에 `DEFAULT_USER_ID` 또는 전역 provider fallback이 남을 수 있다.

## 관련 파일

- `docs/plans/phase-11/README.md`
- `docs/security-threat-model.md`
- `docs/rls-test-plan.md`
- `docs/deployment-runbook.md`
- `apps/web/package.json`
- `apps/web/scripts/phase6-user-id-audit.ts`
- `apps/web/scripts/phase6-rls-negative-smoke.ts`
- `apps/web/scripts/smoke-llm-provider-settings.ts`

## 구현 작업

### 1. Source audit 최종 실행

`npm run phase6:user-id-audit`는 다음을 보장해야 한다.

- production user-owned route가 auth helper를 사용한다.
- production route가 `DEFAULT_USER_ID`를 import하지 않는다.
- LLM provider repository가 user-scoped이다.
- production LLM generation path가 user id 또는 providerConfig 없이 실행되지 않는다.

### 2. RLS negative smoke 실행

`npm run phase6:rls-negative-smoke`는 staging/live Supabase 기준으로 실행한다.

확인:

- user A는 user B legacy text owner rows를 읽거나 수정할 수 없다.
- user A는 user B LLM provider settings를 읽거나 수정할 수 없다.
- cleanup 후 phase test users/rows가 남지 않는다.

### 3. LLM provider smoke 실행

`npm run llm:smoke-provider-settings`는 다음을 검증한다.

- user A와 user B가 서로 다른 provider key를 저장할 수 있다.
- user B가 key를 삭제해도 user A 설정은 남는다.
- key 미등록 사용자의 generation은 `LLM_PROVIDER_REQUIRED`를 받는다.
- env fallback은 production user route에서 사용되지 않는다.

### 4. App quality gate 실행

최종 build/type/lint gate:

```bash
cd apps/web
npm run check
```

실패 시:

- speculative fix로 범위를 넓히지 않는다.
- 실패 원인과 관련 task로 되돌아간다.
- checklist를 완료 처리하지 않는다.

### 5. Docs와 checklist 업데이트

각 task 구현과 검증이 끝난 뒤에만 `docs/plans/phase-11/README.md`의 해당 체크박스를 `[x]`로 바꾼다.

관련 문서:

- security threat model
- RLS test plan
- deployment runbook
- LLM provider settings docs 또는 Phase 3 handoff 문서가 stale해졌다면 current behavior로 갱신

### 6. Commit/push 기준

AGENTS.md 지침에 따라 checklist task 단위로 commit한다.

Commit message 예시:

```text
Phase 11 Task 04: user-owned LLM provider settings
```

각 task commit 직후 remote branch로 push한다.

## 완료 기준(DoD)

- Phase 11 README checklist가 실제 완료된 task만 `[x]`로 표시한다.
- 최종 verification commands가 통과한다.
- 구현 요약에 어떤 Phase 11 task가 완료됐는지 남긴다.
- task 단위 commit과 push가 완료된다.

## 검증 명령

```bash
cd apps/web
npm run phase6:user-id-audit
npm run phase6:rls-negative-smoke
npm run llm:smoke-provider-settings
npm run check
```
