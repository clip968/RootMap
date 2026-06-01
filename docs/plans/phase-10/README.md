# RootMap Phase 10 구현 계획

이 폴더는 노드 상세 설명 생성을 사용자 클릭 요청에서 분리하는 **Async Node Detail Generation** 작업 계획을 담는다.

Phase 10의 핵심은 상세 설명 품질을 낮추거나 15초 fallback을 보여주는 것이 아니다. full detail은 계속 LLM으로 생성하되, public user request path가 LLM 완료를 기다리지 않게 만들고, 캐시·job·worker·polling 계약을 명확히 분리한다.

## Phase 10 핵심 목표

1. `POST /api/nodes/[nodeId]/detail`을 idempotent detail request로 유지한다.
2. detail cache hit 또는 Concept fast path는 즉시 `200 { status: "ready", detail }`로 응답한다.
3. cache miss는 LLM을 실행하지 않고 job을 enqueue/reuse한 뒤 `202 { status: "queued", job_id }`로 응답한다.
4. `GET /api/node-detail-jobs/[jobId]`는 polling 전용으로 두고, `ready` 상태에서는 detail까지 함께 반환한다.
5. `node_detail_jobs`는 lock, retry, stale recovery 필드를 포함해 worker crash와 중복 생성을 방지한다.
6. detail 저장과 job ready 처리는 하나의 transaction으로 묶는다.
7. worker 실행은 `processNodeDetailJob(job)` 순수 처리 함수를 중심으로 만들고, Phase 10a에서는 CLI runner로 검증한다.
8. `NODE_DETAIL_ASYNC_ENABLED` feature flag로 기존 sync path와 새 async path를 안전하게 전환한다.
9. prewarm은 root node와 `recommended_order` 상위 3개, concurrency 2부터 시작한다.
10. async smoke test를 추가해 enqueue dedupe, polling, worker completion, stale recovery를 검증한다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-async-detail-contract-and-scope.md](./00-async-detail-contract-and-scope.md) | endpoint 의미, feature flag, Phase 10 범위 고정 | P0 |
| 1 | [01-node-detail-job-schema-and-repository.md](./01-node-detail-job-schema-and-repository.md) | job table, atomic claim, transactional ready 처리 설계 | P0 |
| 2 | [02-worker-core-and-cli-runner.md](./02-worker-core-and-cli-runner.md) | `processNodeDetailJob`와 CLI runner 실행 경로 추가 | P0 |
| 3 | [03-detail-api-and-job-polling-routes.md](./03-detail-api-and-job-polling-routes.md) | `POST /detail` async 응답과 job polling route 구현 | P0 |
| 4 | [04-client-polling-and-timeout-ui.md](./04-client-polling-and-timeout-ui.md) | TreePageClient polling, cleanup, timeout UI 적용 | P0 |
| 5 | [05-prewarm-and-stale-recovery.md](./05-prewarm-and-stale-recovery.md) | root/top3 prewarm과 stale running job 복구 | P1 |
| 6 | [06-async-smoke-and-quality-gate.md](./06-async-smoke-and-quality-gate.md) | async smoke와 final gate 고정 | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 00. [00-async-detail-contract-and-scope.md](./00-async-detail-contract-and-scope.md) - async detail endpoint 계약과 Phase 10 범위 고정
- [x] 01. [01-node-detail-job-schema-and-repository.md](./01-node-detail-job-schema-and-repository.md) - job schema, atomic claim, transactional ready repository 구현
- [x] 02. [02-worker-core-and-cli-runner.md](./02-worker-core-and-cli-runner.md) - worker core와 CLI runner 구현
- [x] 03. [03-detail-api-and-job-polling-routes.md](./03-detail-api-and-job-polling-routes.md) - detail request route와 job polling route 구현
- [x] 04. [04-client-polling-and-timeout-ui.md](./04-client-polling-and-timeout-ui.md) - client polling, cleanup, timeout UI 구현
- [x] 05. [05-prewarm-and-stale-recovery.md](./05-prewarm-and-stale-recovery.md) - prewarm enqueue와 stale running recovery 구현
- [x] 06. [06-async-smoke-and-quality-gate.md](./06-async-smoke-and-quality-gate.md) - async smoke와 최종 quality gate 적용

## 범위 요약

### 포함

- `NODE_DETAIL_ASYNC_ENABLED` feature flag
- `node_detail_jobs` migration과 Drizzle schema
- node detail job repository
- atomic `claimQueuedNodeDetailJob`
- transactional `markNodeDetailJobReady`
- `processNodeDetailJob(job)` worker core
- `npm run node-detail:worker -- --once` CLI
- `POST /api/nodes/[nodeId]/detail`의 ready/queued 응답
- `GET /api/node-detail-jobs/[jobId]` polling route
- TreePageClient polling, interval cleanup, timeout UI
- root + recommended top 3 prewarm enqueue
- stale running job recovery
- `npm run node-detail:async-smoke`

### 제외

- 15초 partial fallback
- 상세 설명 품질 축소
- visual block renderer 추가 또는 재설계
- LLM provider 교체, 모델 비교, pricing 변경
- concept-level detail cache table
- 전체 문서 처리 pipeline 재작성
- production worker platform 완전 전환

## 의사결정 포인트

- `GET /detail`은 만들지 않는다. GET 요청에서 job 생성 side effect를 만들지 않기 위해 detail request는 기존 POST를 유지한다.
- public user request path에서는 full detail LLM 생성을 실행하지 않는다.
- cache miss 시 생성되는 job은 unique `(tree_id, node_id, detail_version)`으로 dedupe한다.
- worker claim은 `FOR UPDATE SKIP LOCKED` 또는 동등한 atomic update로 보장한다.
- worker가 중간에 죽어도 `locked_at`, `locked_by`, `attempt_count`로 복구할 수 있게 한다.
- ready polling response는 detail을 함께 반환해 client가 다시 detail fetch를 하지 않게 한다.
- prewarm은 비용과 rate limit을 보기 위해 root + 추천 3개부터 시작한다.

## 완료 조건

Phase 10이 끝나면 cache miss 노드를 클릭해도 사용자 요청은 LLM 완료를 기다리지 않고 queued 상태를 즉시 받는다. detail 생성은 worker가 처리하고, polling endpoint는 ready 상태에서 full detail을 함께 반환한다. 기존 sync path는 feature flag off 상태에서 유지되어야 하며, async path는 smoke test로 enqueue dedupe, worker completion, stale recovery, client polling 계약을 검증해야 한다.

최종 검증은 `apps/web`에서 `npm run node-detail:generation-smoke`, `npm run node-detail:async-smoke`, `npm run phase7:visual-detail-smoke`, `npm run lint`, `npm run build`가 통과하는 것으로 고정한다.
