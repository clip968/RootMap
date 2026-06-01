# 05. Prewarm과 Stale Running Recovery

## 목표

사용자가 먼저 열 가능성이 높은 노드의 detail job을 미리 enqueue하고, worker가 중간에 죽은 running job을 복구한다.

## 관련 파일

- `apps/web/src/lib/services/node-detail-prewarm.ts`
- `apps/web/src/lib/repository/node-detail-job-repository.ts`
- `apps/web/src/lib/tree/deep-dive.ts`
- `apps/web/src/app/api/trees/generate/route.ts`
- `apps/web/src/app/api/documents/[documentId]/tree/route.ts`
- `apps/web/scripts/smoke-node-detail-async.ts`

## 구현 작업

### 1. Prewarm config 추가

기본값:

- `NODE_DETAIL_PREWARM_LIMIT=3`
- `NODE_DETAIL_PREWARM_CONCURRENCY=2`

의미:

- root node 1개
- `recommended_order` 상위 3개
- 중복 node는 한 번만 enqueue

### 2. Prewarm target 선정

대상은 아래 순서로 만든다.

1. root node
2. `recommended_order` 상위 3개

root와 추천 노드가 겹치면 unique set으로 줄인다.

### 3. Prewarm enqueue 위치

트리 생성 완료 직후 enqueue한다.

후보 위치:

- 일반 topic tree 생성 route
- document tree 생성 route
- local document runner의 tree 저장 완료 지점

Phase 10에서는 모든 경로를 한 번에 크게 바꾸지 않는다. 먼저 일반 tree 생성과 document tree 생성의 저장 완료 직후를 대상으로 하고, local runner 경로는 smoke로 누락 여부를 확인한 뒤 필요하면 같은 helper를 호출한다.

### 4. Prewarm은 생성 실행이 아니라 enqueue만 수행

- prewarm helper는 job enqueue까지만 한다.
- LLM 생성은 worker가 처리한다.
- public tree generation response가 prewarm LLM 완료를 기다리지 않는다.

### 5. Stale running recovery

기본 stale 기준:

- `NODE_DETAIL_JOB_STALE_MS=300000`
- 5분 이상 running이고 `completed_at`이 없으면 stale로 본다.

복구 정책:

- `attempt_count < max_attempts`이면 `queued`로 되돌린다.
- `attempt_count >= max_attempts`이면 `failed`로 처리한다.
- `error_message`에는 stale lock owner와 locked_at만 요약한다.

### 6. Recovery 실행 위치

- CLI worker 시작 시 `--recover-stale` 옵션으로 실행한다.
- internal route나 production worker를 붙일 때도 batch 시작 전에 한 번 실행할 수 있게 repository helper로 둔다.

## 완료 기준(DoD)

- tree 생성 후 root + recommended top 3 job이 enqueue된다.
- prewarm helper는 LLM을 실행하지 않는다.
- concurrency 2는 enqueue batch 처리에만 적용되고 worker claim과 충돌하지 않는다.
- stale running job은 기준 시간 이후 queued 또는 failed로 복구된다.
- smoke에서 stale recovery를 deterministic clock으로 검증한다.
