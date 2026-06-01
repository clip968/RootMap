# 02. Worker Core와 CLI Runner

## 목표

detail 생성 worker의 핵심 처리 함수를 만들고, Phase 10a에서는 CLI runner로 검증한다. production worker 연결은 core 함수가 검증된 뒤 별도 task에서 붙일 수 있게 한다.

## 관련 파일

- `apps/web/src/lib/node-detail-jobs/processor.ts`
- `apps/web/src/lib/repository/node-detail-job-repository.ts`
- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/scripts/run-node-detail-worker.ts`
- `apps/web/package.json`
- `apps/web/src/app/api/workers/document-processing/route.ts`

## 구현 작업

### 1. Worker core 함수 추가

`processNodeDetailJob(job, options)`를 추가한다.

책임:

- job의 tree/node를 로드한다.
- 이미 `learning_nodes.detail_json`이 있으면 LLM을 호출하지 않고 ready 처리한다.
- cache가 없으면 기존 detail generation logic을 재사용해 full detail을 만든다.
- `markNodeDetailJobReady`로 detail 저장과 job ready를 transaction 처리한다.
- 실패 시 `markNodeDetailJobFailed` 또는 retry 가능한 상태 복구를 수행한다.

### 2. 기존 service 분리

현재 `getOrCreateNodeDetail`은 public request와 generation logic이 섞여 있다.

Phase 10에서는 아래처럼 역할을 나눈다.

- public route helper: cache/concept ready check 또는 job enqueue
- worker helper: full detail generation and save
- shared formatter: `toApiBody`와 extras 생성 재사용

단, 대규모 리팩터링을 피하기 위해 처음에는 기존 helper를 작게 감싸고, generation-only 함수만 추출한다.

### 3. CLI runner 추가

`apps/web/scripts/run-node-detail-worker.ts`를 추가한다.

지원 옵션:

- `--once`: queued job 하나만 처리하고 종료한다.
- `--loop`: queued job을 계속 polling한다.
- `--sleep-ms <number>`: idle일 때 대기 시간. 기본 1000ms.
- `--worker-id <id>`: lock owner 식별자. 없으면 process id 기반으로 생성한다.
- `--recover-stale`: 시작 시 stale running job을 복구한다.

### 4. npm script 추가

`apps/web/package.json`에 아래 script를 추가한다.

```json
"node-detail:worker": "tsx scripts/run-node-detail-worker.ts"
```

### 5. Retry 정책 고정

- LLM transport/parse/validation failure는 job attempt 단위로 기록한다.
- `attempt_count < max_attempts`이면 `queued`로 되돌려 다음 worker tick에서 재시도할 수 있다.
- `attempt_count >= max_attempts`이면 `failed`로 끝낸다.
- 401 같은 인증 실패는 즉시 `failed` 처리한다.

### 6. Production 연결은 분리

Phase 10a의 source of truth는 CLI runner다.

Phase 10b에서 선택 가능한 연결:

- protected internal route가 한 번에 job 1개 처리
- Vercel Cron이 internal route 반복 호출
- 기존 document-processing worker route에 node detail processor 추가
- 별도 Node worker process

이 task에서는 `processNodeDetailJob`을 어떤 host에서도 호출할 수 있게 만드는 데 집중한다.

## 완료 기준(DoD)

- `npm run node-detail:worker -- --once`가 queued job 하나를 처리한다.
- `--loop`는 idle 상태에서 sleep 후 계속 polling한다.
- worker가 cache hit job을 LLM 없이 ready 처리한다.
- worker failure는 attempt/retry 정책에 따라 queued 또는 failed로 기록된다.
- public detail request route에서는 worker core를 직접 호출하지 않는다.
