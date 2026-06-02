# 03. Document Routes와 Processing Ownership 전환

## 목표

document upload, read, processing enqueue, generated tree 조회, concept/evidence 조회를 Supabase Auth 사용자 기준으로 전환한다. document storage key와 DB row 모두 실제 사용자 id에 귀속한다.

## 현재 문제

document route는 storage key 생성과 `documents.user_id` 저장에 `DEFAULT_USER_ID`를 사용한다. 처리 queue payload에는 이미 `userId`가 포함될 수 있지만 route가 실제 auth user를 넣지 않으면 worker와 조회 경로가 모두 개발 user 공간을 공유한다.

## 관련 파일

- `apps/web/src/app/api/documents/upload-url/route.ts`
- `apps/web/src/app/api/documents/complete-upload/route.ts`
- `apps/web/src/app/api/documents/upload/route.ts`
- `apps/web/src/app/api/documents/[documentId]/route.ts`
- `apps/web/src/app/api/documents/[documentId]/process/route.ts`
- `apps/web/src/app/api/documents/[documentId]/tree/route.ts`
- `apps/web/src/app/api/documents/[documentId]/concepts/route.ts`
- `apps/web/src/app/api/document-concepts/[documentConceptId]/evidence/route.ts`
- `apps/web/src/lib/repository/document-repository.ts`
- `apps/web/src/lib/document/processing-jobs.ts`
- `apps/web/src/lib/gcp/cloud-tasks.ts`

## 구현 작업

### 1. Upload URL route auth 적용

`POST /api/documents/upload-url`는 auth user id를 확인한 뒤 `makeDocumentStorageKey(auth.userId, ext)`를 사용한다.

주의:

- signed upload URL 응답에는 raw token이나 auth 정보가 포함되면 안 된다.
- storage key prefix가 사용자 id를 포함해 충돌과 cross-user 추측을 줄여야 한다.

### 2. Complete upload route owner 검증

`POST /api/documents/complete-upload`는 auth user id를 확인하고, 제출된 storage key가 현재 사용자 prefix에 속하는지 확인한다.

저장:

- `createDocument({ userId: auth.userId, ... })`

실패:

- 다른 사용자 prefix key면 403 또는 invalid request를 반환한다.
- DB 저장 실패 시 기존처럼 uploaded object cleanup을 유지한다.

### 3. Multipart upload route auth 적용

`POST /api/documents/upload`도 same-user storage key와 `createDocument({ userId: auth.userId })`를 사용한다.

이 route가 유지되는 동안 upload-url route와 동일한 validation을 적용한다.

### 4. Document read routes user filter 적용

다음 route는 모두 `getDocumentForUser(documentId, auth.userId)`를 먼저 통과해야 한다.

- `GET /api/documents/[documentId]`
- `POST /api/documents/[documentId]/process`
- `GET /api/documents/[documentId]/tree`
- `GET /api/documents/[documentId]/concepts`

document가 없으면 404를 반환한다.

### 5. Processing enqueue userId 적용

process route는 다음 payload에 `auth.userId`를 넣는다.

- `startDocumentProcessingJob({ documentId, userId: auth.userId })`
- `enqueueDocumentProcessingWakeTask({ documentId, userId: auth.userId, ... })`

이미 `tree_generated`인 경우 `getDocumentLearningTreeForUser(documentId, auth.userId)`로 tree id를 계산한다.

### 6. Evidence route owner 검증

`GET /api/document-concepts/[documentConceptId]/evidence`는 auth user id를 확인하고 `getDocumentConceptEvidenceForUser(documentConceptId, auth.userId)`만 사용한다.

다른 사용자의 document concept id는 404로 숨긴다.

## 완료 기준(DoD)

- document production routes는 `DEFAULT_USER_ID`를 import하지 않는다.
- document storage key와 document row가 auth user id로 생성된다.
- 다른 사용자의 `documentId` 또는 `documentConceptId`는 조회되지 않는다.
- processing job payload와 wake task payload가 실제 auth user id를 포함한다.

## 검증 명령

```bash
cd apps/web
npm run phase6:user-id-audit
npm run phase6:rls-negative-smoke
```
