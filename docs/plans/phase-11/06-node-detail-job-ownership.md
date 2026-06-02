# 06. Node Detail Job Ownership

## 목표

node detail enqueue, polling, worker generation이 tree owner 기준으로 격리되게 한다. 사용자는 다른 사용자의 `jobId`를 알아도 polling으로 detail을 받을 수 없어야 한다.

## 현재 문제

node detail polling route는 job id만으로 job을 읽고 ready 상태에서 detail을 반환한다. service/worker 일부는 아직 `DEFAULT_USER_ID`로 tree를 읽는다. 이 상태에서는 async detail job이 cross-user leak 경로가 될 수 있다.

## 관련 파일

- `apps/web/src/app/api/nodes/[nodeId]/detail/route.ts`
- `apps/web/src/app/api/node-detail-jobs/[jobId]/route.ts`
- `apps/web/src/lib/repository/node-detail-job-repository.ts`
- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/lib/services/node-detail-prewarm.ts`
- `apps/web/src/lib/node-detail-jobs/processor.ts`
- `apps/web/scripts/smoke-node-detail-async.ts`

## 구현 작업

### 1. Detail request route owner 검증

`POST /api/nodes/[nodeId]/detail`은 auth user id를 요구한다.

처리 순서:

1. `tree_id` body를 검증한다.
2. `getLearningTree(treeId, auth.userId)`로 tree owner를 확인한다.
3. node가 해당 tree에 속하는지 확인한다.
4. async mode이면 owner 검증 후 enqueue한다.
5. sync mode이면 owner 검증 후 user-aware detail service를 호출한다.

### 2. Job polling route owner 검증

`GET /api/node-detail-jobs/[jobId]`는 auth user id를 요구한다.

처리 순서:

1. job id로 job을 조회한다.
2. `getLearningTree(job.treeId, auth.userId)`로 owner를 검증한다.
3. owner가 아니면 404 또는 403을 반환한다.
4. ready detail 조회도 같은 user id를 사용한다.

### 3. Repository helper 추가

필요하면 repository에 다음 helper를 추가한다.

- `getNodeDetailJobForUser(jobId, userId)`
- 또는 route에서 job 조회 후 `getLearningTree(job.treeId, userId)`로 검증

단순 route-level 검증으로 충분하면 table에 `user_id`를 중복 저장하지 않는다.

### 4. Worker owner provider 적용

worker는 claimed job의 `treeId`로 owner를 찾는다.

방법:

- `getLearningTreeOwnerId(treeId)` helper를 추가한다.
- `getLearningTree(job.treeId, ownerUserId)`로 bundle을 읽는다.
- LLM 호출은 ownerUserId의 provider config로 실행한다.

### 5. Prewarm ownership 유지

prewarm은 생성 직후 이미 user-owned bundle을 받는다. enqueue된 job은 tree id와 node id로 dedupe하되, worker/polling에서 tree owner 검증을 반드시 거친다.

## 완료 기준(DoD)

- 다른 사용자의 `jobId` polling은 detail을 반환하지 않는다.
- worker는 `DEFAULT_USER_ID`로 tree를 읽지 않는다.
- worker LLM 호출은 tree owner의 provider key로 실행된다.
- async smoke에 cross-user polling negative case가 포함된다.

## 검증 명령

```bash
cd apps/web
npm run node-detail:async-smoke
npm run phase6:user-id-audit
```
