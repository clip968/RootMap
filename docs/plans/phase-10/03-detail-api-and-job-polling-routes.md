# 03. Detail API와 Job Polling Route

## 목표

detail request route를 async job 계약으로 바꾸고, job status polling route를 추가한다. `GET /detail` side effect는 만들지 않는다.

## 관련 파일

- `apps/web/src/app/api/nodes/[nodeId]/detail/route.ts`
- `apps/web/src/app/api/node-detail-jobs/[jobId]/route.ts`
- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/lib/repository/node-detail-job-repository.ts`
- `apps/web/scripts/smoke-node-detail-async.ts`

## 구현 작업

### 1. `POST /detail` async response 추가

`NODE_DETAIL_ASYNC_ENABLED=false`:

- 기존 sync 응답을 유지한다.
- 기존 client와 smoke가 깨지지 않아야 한다.

`NODE_DETAIL_ASYNC_ENABLED=true`:

- cache hit이면 `200 { status: "ready", detail }`.
- 충분한 Concept fast path도 `200 { status: "ready", detail }`.
- cache miss이면 job을 enqueue/reuse하고 `202 { status: "queued", job_id }`.
- 이 route에서 `generateNodeDetail` 또는 `generateDocumentNodeDetail`을 호출하지 않는다.

### 2. Ready detail formatter 재사용

- ready 응답의 detail shape은 기존 `ApiNodeDetailResponse`를 유지한다.
- `detail/extras` route는 계속 별도 요청으로 남긴다.
- polling ready detail도 같은 shape을 사용한다.

### 3. Job polling route 추가

`GET /api/node-detail-jobs/[jobId]`를 추가한다.

응답:

- `queued`: job metadata만 반환
- `running`: job metadata와 `attempt_count`
- `ready`: job metadata와 detail 반환
- `failed`: `error_message` 반환

권한/소유권은 현재 Phase 4 auth boundary와 동일하게 tree/user 접근 확인을 거쳐야 한다. Phase 10에서는 기존 `DEFAULT_USER_ID` 기반 조회 관례를 유지하되, 나중에 Supabase Auth 전환 시 바꿀 수 있게 route 내부에 접근 확인 helper를 모은다.

### 4. Invalid state 처리

- job id가 없으면 404.
- job의 node/tree가 사라졌으면 404 또는 failed 상태로 정리한다.
- ready인데 detail이 없으면 500을 반환하지 말고 server log를 남기고 job inconsistency error를 반환한다. 정상 구현에서는 transaction 때문에 발생하지 않아야 한다.

### 5. Response cache 방지

- queued/running polling 응답에는 browser/proxy cache가 끼지 않도록 no-store 성격의 header를 둔다.
- ready 응답도 우선 no-store로 둔다. detailJson 캐싱은 DB cache가 source of truth다.

## 완료 기준(DoD)

- sync flag off에서 기존 detail route smoke가 통과한다.
- async flag on에서 cache hit은 200 ready, cache miss는 202 queued를 반환한다.
- job polling route는 ready 상태에서 detail까지 반환한다.
- `GET /detail` route는 추가하지 않는다.
- public request path에서 LLM full detail generation이 실행되지 않는 source assertion을 smoke에 넣는다.
