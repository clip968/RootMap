# 01. Node Detail Job Schema와 Repository

## 목표

비동기 detail 생성을 안정적으로 처리할 job table과 repository layer를 만든다. 이 task의 핵심은 중복 LLM 호출 방지, atomic claim, worker crash 복구, transactional ready 처리다.

## 관련 파일

- `apps/web/drizzle/0007_node_detail_jobs.sql`
- `apps/web/src/db/schema.ts`
- `apps/web/src/lib/repository/node-detail-job-repository.ts`
- `apps/web/src/lib/repository/learning-repository.ts`
- `apps/web/scripts/smoke-node-detail-async.ts`
- `apps/web/package.json`

## 구현 작업

### 1. DB migration 추가

`node_detail_jobs` table을 추가한다.

```sql
create table node_detail_jobs (
  id text primary key,
  tree_id text not null references learning_trees(id) on delete cascade,
  node_id text not null references learning_nodes(id) on delete cascade,
  detail_version text not null,
  status text not null check (status in ('queued', 'running', 'ready', 'failed')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tree_id, node_id, detail_version)
);
```

필수 index:

- `(status, created_at)`
- `(locked_at)`
- `(tree_id, node_id, detail_version)` unique

### 2. Drizzle schema 추가

- `apps/web/src/db/schema.ts`에 `nodeDetailJobs`를 추가한다.
- status는 DB check constraint와 TypeScript union이 어긋나지 않게 repository type으로 한 번 더 제한한다.
- timestamp column은 기존 schema 관례에 맞춰 ISO string `text`로 둔다.

### 3. Repository API 추가

`apps/web/src/lib/repository/node-detail-job-repository.ts`를 추가한다.

필수 함수:

- `enqueueNodeDetailJob(input)`
- `getNodeDetailJob(jobId)`
- `getNodeDetailJobByTarget(treeId, nodeId, detailVersion)`
- `claimQueuedNodeDetailJob(options)`
- `markNodeDetailJobReady(input)`
- `markNodeDetailJobFailed(input)`
- `recoverStaleRunningNodeDetailJobs(options)`

### 4. Enqueue dedupe 보장

- `enqueueNodeDetailJob`은 unique key 충돌 시 새 job을 만들지 않는다.
- 충돌 시 기존 job을 조회해 반환한다.
- 기존 job이 `failed`이고 retry 정책상 재시도 가능하면 status를 `queued`로 되돌리는 정책은 별도 helper로 분리한다.

### 5. Atomic claim 보장

`claimQueuedNodeDetailJob`은 find 후 update 두 단계로 구현하지 않는다.

PostgreSQL에서는 다음 의미를 보장해야 한다.

```sql
update node_detail_jobs
set
  status = 'running',
  locked_at = now_iso,
  locked_by = worker_id,
  started_at = coalesce(started_at, now_iso),
  attempt_count = attempt_count + 1,
  updated_at = now_iso
where id = (
  select id
  from node_detail_jobs
  where status = 'queued'
    and attempt_count < max_attempts
  order by created_at asc
  limit 1
  for update skip locked
)
returning *;
```

Drizzle에서 `for update skip locked`를 안전하게 표현하기 어렵다면 raw SQL을 사용한다.

### 6. Transactional ready 처리

`markNodeDetailJobReady`는 다음 두 작업을 하나의 transaction으로 묶는다.

1. `learning_nodes.detail_json` 저장
2. `node_detail_jobs.status = 'ready'` 업데이트

이 함수 외부에서 detail 저장과 job ready update를 따로 호출하지 않는다.

### 7. Failed 처리

- worker가 생성에 실패하면 `status = 'failed'`, `completed_at`, `error_message`를 기록한다.
- `error_message`에는 API key, prompt 전문, 문서 evidence 전문을 넣지 않는다.
- `attempt_count < max_attempts`인 transport/parse failure를 바로 failed로 둘지 queued로 되돌릴지는 worker task에서 고정한다.

## 완료 기준(DoD)

- `node_detail_jobs` migration과 Drizzle schema가 추가된다.
- enqueue dedupe가 unique key로 검증된다.
- claim은 atomic하다.
- ready 처리는 detail 저장과 job status update를 transaction으로 묶는다.
- smoke에서 중복 enqueue와 ready transaction 계약을 확인한다.
