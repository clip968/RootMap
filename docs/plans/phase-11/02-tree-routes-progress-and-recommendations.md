# 02. Tree Routes, Progress, Recommendations Auth 전환

## 목표

tree 생성, tree 목록, tree 상세, node progress, recommendations route를 Supabase Auth 사용자 기준으로 전환한다. 다른 사용자의 `treeId` 또는 `nodeId`를 받은 경우 404 또는 403으로 차단한다.

## 현재 문제

tree 계층 route 일부는 `DEFAULT_USER_ID`를 사용해 `learning_trees`, `user_node_progress`, `user_concept_progress`를 조회하거나 갱신한다. 이 상태에서는 모든 production 사용자가 같은 개발 seed 사용자 공간을 공유한다.

## 관련 파일

- `apps/web/src/app/api/trees/route.ts`
- `apps/web/src/app/api/trees/generate/route.ts`
- `apps/web/src/app/api/trees/[treeId]/route.ts`
- `apps/web/src/app/api/trees/[treeId]/recommendations/route.ts`
- `apps/web/src/app/api/nodes/[nodeId]/progress/route.ts`
- `apps/web/src/lib/services/learning-tree-generate.ts`
- `apps/web/src/lib/repository/learning-repository.ts`
- `apps/web/src/lib/tree/bundle-to-api.ts`
- `apps/web/scripts/phase6-user-id-audit.ts`

## 구현 작업

### 1. Route auth 적용

각 route handler 초반에 `requireSupabaseAuthUserId(req)`를 호출한다.

실패 시:

- `auth.status`
- `auth.code`
- `auth.message`

를 그대로 `jsonError`로 반환한다.

### 2. Tree generation service에 userId 전달

`generateAndPersistTree(rawTopic, options)`에 `userId`를 명시 입력으로 추가한다.

변경 원칙:

- route는 `auth.userId`를 전달한다.
- service는 `createFullLearningTree(..., userId, ...)`를 호출한다.
- 저장 직후 `getLearningTree(treeId, userId)`로 다시 읽는다.
- production service path는 `DEFAULT_USER_ID`를 import하지 않는다.

### 3. Tree list/detail user filter 적용

다음 호출을 모두 `auth.userId` 기반으로 바꾼다.

- `listLearningTreeHistory(auth.userId)`
- `getLearningTree(treeId, auth.userId)`
- `getDocumentTreeContextForUser(treeId, auth.userId)`

상대 사용자 tree는 존재 여부를 숨기기 위해 404를 기본값으로 둔다.

### 4. Progress update owner check 적용

`PATCH /api/nodes/[nodeId]/progress`는 다음 순서로 처리한다.

1. auth user id를 확인한다.
2. node를 조회한다.
3. node의 `treeId`를 `getLearningTree(node.treeId, auth.userId)`로 검증한다.
4. 검증 실패 시 403 또는 404를 반환한다.
5. `upsertNodeProgress(auth.userId, ...)`와 `upsertUserConceptProgress(auth.userId, ...)`를 호출한다.

### 5. Recommendations user context 적용

recommendations route는 다음 값을 user-scoped로 계산한다.

- tree bundle progress
- document context
- concept progress map

`getConceptProgressMapForUser(auth.userId)`를 사용한다.

## 완료 기준(DoD)

- tree/progress/recommendation production route는 `DEFAULT_USER_ID`를 import하지 않는다.
- 다른 사용자 tree id로 상세 또는 추천을 요청하면 data가 반환되지 않는다.
- node progress update는 tree owner 검증 없이 실행되지 않는다.
- `npm run phase6:user-id-audit`의 tree route 관련 assertion이 통과한다.

## 검증 명령

```bash
cd apps/web
npm run phase6:user-id-audit
```
