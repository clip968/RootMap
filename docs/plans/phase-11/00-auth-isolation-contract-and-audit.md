# 00. Auth Isolation 계약과 Audit 고정

## 목표

Phase 11의 사용자 격리 계약을 먼저 문서와 audit script로 고정한다. 구현 전 RED 상태를 만들어 production route가 `DEFAULT_USER_ID` 또는 전역 LLM provider에 의존하면 즉시 실패하게 한다.

## 현재 문제

일부 Phase 4 route는 이미 `requireSupabaseAuthUserId(req)`를 사용하지만, tree, document, node progress, node detail job, LLM provider route에는 아직 개발용 고정 사용자 또는 전역 provider 설정이 남아 있다. 이 상태에서는 사용자별 격리를 route별로 수동 확인해야 하므로 회귀를 막기 어렵다.

## 관련 파일

- `apps/web/scripts/phase6-user-id-audit.ts`
- `apps/web/scripts/phase6-security-utils.ts`
- `apps/web/src/db/constants.ts`
- `apps/web/src/lib/auth/supabase-auth.ts`
- `apps/web/src/app/api/**/route.ts`
- `apps/web/src/lib/repository/llm-provider-settings-repository.ts`

## 구현 작업

### 1. Production user-owned route 목록 고정

audit script에 다음 route 목록을 명시한다.

- `src/app/api/trees/route.ts`
- `src/app/api/trees/generate/route.ts`
- `src/app/api/trees/[treeId]/route.ts`
- `src/app/api/trees/[treeId]/recommendations/route.ts`
- `src/app/api/nodes/[nodeId]/progress/route.ts`
- `src/app/api/nodes/[nodeId]/detail/route.ts`
- `src/app/api/node-detail-jobs/[jobId]/route.ts`
- `src/app/api/documents/upload-url/route.ts`
- `src/app/api/documents/complete-upload/route.ts`
- `src/app/api/documents/upload/route.ts`
- `src/app/api/documents/[documentId]/route.ts`
- `src/app/api/documents/[documentId]/process/route.ts`
- `src/app/api/documents/[documentId]/tree/route.ts`
- `src/app/api/documents/[documentId]/concepts/route.ts`
- `src/app/api/document-concepts/[documentConceptId]/evidence/route.ts`
- `src/app/api/settings/llm-provider/route.ts`
- `src/app/api/settings/llm-provider/test/route.ts`

### 2. Route source assertion 추가

각 route source에 대해 다음을 검사한다.

- `requireSupabaseAuthUserId`를 import 또는 호출해야 한다.
- `DEFAULT_USER_ID` 문자열을 포함하면 실패한다.
- route handler는 `req: Request`를 받아 auth helper에 전달할 수 있어야 한다.
- user-owned repository 호출은 route에서 얻은 `auth.userId`를 전달해야 한다.

### 3. LLM provider repository assertion 추가

`llm-provider-settings-repository.ts`에 대해 다음을 검사한다.

- `getActiveLlmProviderSetting(userId` 형태의 user-scoped lookup이 있어야 한다.
- `saveActiveLlmProviderSetting(userId` 또는 input에 `userId`를 포함해야 한다.
- `deleteActiveLlmProviderSetting(userId` 형태의 user-scoped delete가 있어야 한다.
- `eq(llmProviderSettings.userId, userId)` 조건이 active lookup/save/delete 경로에 있어야 한다.

### 4. 허용 예외 목록 명시

`DEFAULT_USER_ID`는 다음 경로에서만 허용한다.

- `src/db/constants.ts`
- `src/lib/document/local-runner.ts`
- `scripts/**`
- smoke fixture 또는 local-only runner

`src/app/api/**/route.ts`와 production service path에서는 허용하지 않는다.

## 완료 기준(DoD)

- `npm run phase6:user-id-audit`가 현재 코드에서 실패한다.
- 실패 메시지는 어떤 route 또는 repository가 규칙을 어겼는지 파일 단위로 보여준다.
- 허용 예외가 script 안에 명시되어 있다.
- 구현 완료 후 같은 명령이 통과해야 한다.

## 검증 명령

```bash
cd apps/web
npm run phase6:user-id-audit
```
