# 00. Async Detail 계약과 범위 고정

## 목표

노드 상세 설명 생성의 HTTP 계약, feature flag, worker 경계를 Phase 10 구현 전에 고정한다.

## 현재 문제

현재 `POST /api/nodes/[nodeId]/detail`은 cache miss에서 LLM full detail 생성과 저장까지 같은 request 안에서 끝내려고 한다. LLM 호출은 기본 timeout 60초이며 상세 generator는 최대 3회 시도하므로, 사용자가 클릭한 요청이 30초 이상 대기하는 구조가 된다.

## 관련 파일

- `apps/web/src/app/api/nodes/[nodeId]/detail/route.ts`
- `apps/web/src/app/api/node-detail-jobs/[jobId]/route.ts`
- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/components/tree-page-client.tsx`
- `apps/web/package.json`

## 구현 작업

### 1. Feature flag 고정

- env flag 이름은 `NODE_DETAIL_ASYNC_ENABLED`로 둔다.
- flag가 꺼져 있으면 기존 sync `getOrCreateNodeDetailForRequest` 경로를 유지한다.
- flag가 켜져 있으면 public detail request path에서 LLM full detail 생성을 실행하지 않는다.
- flag 판정은 route 안에 흩뿌리지 말고 작은 helper로 분리한다.

### 2. `POST /detail` 계약 고정

`POST /api/nodes/[nodeId]/detail`은 idempotent detail request다.

요청 body:

```json
{
  "tree_id": "tree-id"
}
```

cache hit 또는 Concept fast path 응답:

```json
{
  "status": "ready",
  "detail": {}
}
```

cache miss 응답:

```json
{
  "status": "queued",
  "job_id": "job-id"
}
```

### 3. `GET /detail` 제외

- `GET /api/nodes/[nodeId]/detail`은 Phase 10에서 추가하지 않는다.
- GET은 읽기 요청이어야 하므로 cache miss에서 job enqueue side effect를 만들지 않는다.
- 브라우저 prefetch, crawler, 캐시 재검증이 LLM job을 만들 수 있는 경로를 차단한다.

### 4. Job polling 계약 고정

`GET /api/node-detail-jobs/[jobId]`는 job 상태 조회 전용이다.

queued/running 응답:

```json
{
  "status": "running",
  "job_id": "job-id",
  "attempt_count": 1
}
```

ready 응답:

```json
{
  "status": "ready",
  "job_id": "job-id",
  "detail": {}
}
```

failed 응답:

```json
{
  "status": "failed",
  "job_id": "job-id",
  "error_message": "요약된 오류"
}
```

### 5. Public request와 worker 경계 고정

- public user request는 job 생성 또는 상태 조회까지만 수행한다.
- full LLM detail 생성은 worker core에서만 수행한다.
- worker core는 CLI runner, protected internal API, 기존 worker route 중 어느 쪽에서도 재사용 가능해야 한다.

## 완료 기준(DoD)

- Phase 10 README가 POST detail, GET job polling, no GET detail side effect를 명시한다.
- Feature flag 이름과 on/off 동작이 문서화된다.
- public request path에서 LLM을 실행하지 않는다는 원칙이 이후 task의 source of truth가 된다.
- 검증 명령: 문서 고정 task이므로 별도 실행 명령 없음.
