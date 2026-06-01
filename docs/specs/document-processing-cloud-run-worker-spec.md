# Document Processing Cloud Run Worker Specification

## Overview

이 문서는 RootMap의 문서 처리 worker를 Vercel 중심 실행에서 Google Cloud Run 중심 실행으로 분리한 운영 사양이다.

대상 기능은 PDF, TXT, MD 업로드 후 문서 텍스트 추출, chunk 분할, LLM 기반 개념 추출, Concept Store 연결, 문서 기반 학습 트리 생성을 비동기로 수행하는 Phase 3 문서 처리 파이프라인이다.

핵심 목적은 문서 업로드 직후 처리를 시작하면서도, 긴 PDF와 LLM 호출이 Vercel serverless 실행 시간과 cron 주기에 묶이지 않게 만드는 것이다.

---

## Background

기존 구조에서는 문서 처리 worker가 Vercel cron 또는 Vercel Function 실행 환경에 강하게 묶여 있었다.

이 구조에는 다음 문제가 있었다.

1. 업로드 직후 사용자가 기대하는 즉시 처리가 어렵다.
2. cron 기반 wake-up은 처리 시작 시점이 스케줄에 종속된다.
3. PDF 텍스트 추출과 LLM chunk 처리처럼 오래 걸리는 작업은 Vercel Function 실행 시간과 번들 제약에 취약하다.
4. 문서 처리 실패 시 어디까지 진행됐는지, 어떤 메시지를 재시도해야 하는지 운영 경계가 흐려진다.
5. Cloud worker를 사용하려면 Vercel web app과 별도 worker 사이의 인증, queue, secret 동기화 기준이 필요하다.

따라서 문서 처리의 사용자 진입점은 Vercel에 남기고, 실제 worker 실행은 Cloud Run으로 분리한다.

---

## Goals

1. PDF 업로드 후 거의 즉시 문서 처리를 시작한다.
2. Vercel web app은 요청 접수와 queue enqueue까지만 담당한다.
3. 오래 걸리는 PDF/LLM 처리는 Cloud Run worker가 담당한다.
4. Cloud Run worker는 공개 HTTP endpoint가 아니라 Cloud Tasks OIDC 호출로 보호한다.
5. Supabase PGMQ를 durable queue로 사용해 작업 상태를 DB 기준으로 추적한다.
6. worker는 chunk 단위 checkpoint를 남겨 중간 실패 후 재시도할 수 있어야 한다.
7. 비용 폭주를 막기 위해 Cloud Tasks rate limit과 Cloud Run max instance를 낮게 유지한다.
8. 같은 사용자가 같은 파일을 반복 업로드하거나 처리 버튼을 다시 눌러도 동일 PDF가 여러 worker 작업으로 중복 처리되지 않게 한다.

---

## Non-Goals

1. 문서 텍스트 추출 품질 자체를 OCR 수준으로 개선하지 않는다.
2. PDF 표, 그림, 수식의 정밀 구조 분석을 추가하지 않는다.
3. LLM provider를 CrofAI 외 다른 provider로 교체하지 않는다.
4. Cloud Run으로 web app 전체를 이전하지 않는다.
5. 사용자에게 실시간 streaming progress UI를 제공하지 않는다.

---

## Architecture

```text
사용자
  ↓
Vercel Web App
  ↓
Supabase Storage에 원본 문서 저장
  ↓
POST /api/documents/:documentId/process
  ↓
Supabase PGMQ document_processing queue에 작업 메시지 저장
  ↓
Google Cloud Tasks wake task 생성
  ↓
Cloud Tasks가 OIDC token으로 private Cloud Run worker 호출
  ↓
Cloud Run /api/workers/document-processing
  ↓
PGMQ 메시지 읽기
  ↓
PDF 텍스트 추출, chunk 처리, LLM 개념 추출
  ↓
완료 시 learning_tree 저장
```

이 구조에서 queue의 source of truth는 Supabase PGMQ다.
Cloud Tasks는 durable processing queue가 아니라 Cloud Run worker를 깨우는 wake-up trigger 역할을 한다.

---

## Processing Model

### 1. Upload

문서 파일은 기존 Phase 3 흐름처럼 Supabase Storage에 저장된다.
브라우저에는 service role key가 노출되지 않는다.

### 2. Enqueue

Vercel API는 문서 처리 요청을 받으면 다음 두 가지를 수행한다.

1. `document_processing` PGMQ queue에 `{ jobId, documentId, userId, requestedAt }` payload를 저장한다.
2. Cloud Tasks에 Cloud Run worker를 호출하는 HTTP task를 생성한다.

PGMQ payload는 JSON 문자열로 직렬화한 뒤 `jsonb`로 cast한다.
이는 serverless 환경에서 `sql.json(object)` 직렬화가 런타임별로 다르게 실패할 수 있는 문제를 피하기 위한 결정이다.

enqueue 전에 동일 사용자, 동일 파일명, 동일 파일 형식, 동일 파일 크기의 기존 활성 문서가 있는지 확인한다.
기존 문서 상태가 `uploaded`, `text_extracted`, `chunked`, `concepts_extracted` 중 하나이면 새 작업을 만들지 않고 `409 Conflict`를 반환한다.
이 방어선은 PDF 하나가 여러 PGMQ 메시지로 동시에 처리되며 LLM 토큰을 중복 사용하는 문제를 막기 위한 것이다.

### 3. Wake-Up

Cloud Tasks는 Cloud Run service URL로 `POST` 요청을 보낸다.
요청에는 Cloud Run invoker service account 기반 OIDC token이 포함된다.

Cloud Run service는 public unauthenticated endpoint가 아니어야 한다.
호출 권한은 Cloud Tasks invoker service account에만 부여한다.

### 4. Worker Execution

Cloud Run worker는 PGMQ에서 메시지를 읽고 `processDocument`를 실행한다.

worker는 한 번에 모든 chunk를 처리하려고 하지 않는다.
현재 worker batch는 chunk 3개 단위로 제한한다.

```text
chunkBatchSize = 3
stopAfterConcepts = true
```

아직 처리할 chunk가 남아 있으면 worker는 새 PGMQ 메시지를 다시 넣고 기존 메시지를 삭제한다.
처리가 완료되면 기존 메시지를 삭제한다.
처리 중 오류가 나면 메시지를 삭제하지 않아 PGMQ visibility timeout 이후 재전달될 수 있게 한다.

### 5. Tree Generation

모든 chunk의 개념 후보 추출이 끝나면 문서 전체 개념 통합, document_concepts 저장, 문서 기반 tree 구조 생성, learning_trees 저장을 이어서 수행한다.

트리 구조 생성은 설명, difficulty, evidence를 한 번에 생성하지 않고 node title, type, prerequisite 관계, children, recommended order 중심의 구조만 생성한다.
노드 상세 설명은 사용자가 노드를 열 때 지연 생성하는 방향을 유지한다.

---

## Implementation Changes

### Cloud Tasks REST Client

Vercel bundle에서 `@google-cloud/tasks`가 내부 `protos.json` asset을 찾지 못하는 문제가 있었다.
따라서 SDK 의존성을 제거하고 Cloud Tasks REST API를 직접 호출한다.

구현 방식은 다음과 같다.

1. `GOOGLE_CLOUD_TASKS_CREDENTIALS_B64`에서 service account JSON을 읽는다.
2. service account private key로 RS256 JWT를 생성한다.
3. Google OAuth token endpoint에서 access token을 발급받는다.
4. Cloud Tasks REST API `projects.locations.queues.tasks.create`를 호출한다.
5. 생성된 task의 HTTP request에 Cloud Run invoker service account OIDC token 설정을 포함한다.

관련 구현 파일:

```text
apps/web/src/lib/gcp/cloud-tasks.ts
```

### Queue Payload Serialization

PGMQ enqueue 시 object를 직접 넘기지 않고 명시적으로 JSON 문자열화한다.

관련 구현 파일:

```text
apps/web/src/lib/document/processing-queue.ts
```

### Dependency Cleanup

Cloud Tasks SDK 제거에 따라 다음을 정리했다.

```text
apps/web/package.json
apps/web/package-lock.json
apps/web/next.config.ts
```

`@google-cloud/tasks`를 제거했고, `next.config.ts`의 `serverExternalPackages`에서도 제거했다.

### Secret and Local File Hygiene

Vercel CLI, Cloud Run env 파일, CodeGraph index가 배포 artifact나 git commit에 섞이지 않도록 ignore 규칙을 추가했다.

```text
.gitignore
.vercelignore
```

---

## Runtime Configuration

### Vercel Production Environment

Vercel web app에는 Cloud Tasks task를 생성하기 위한 값이 필요하다.

```text
GOOGLE_CLOUD_PROJECT_ID
GOOGLE_CLOUD_TASKS_LOCATION
GOOGLE_CLOUD_TASKS_QUEUE
GOOGLE_CLOUD_TASKS_TARGET_URL
GOOGLE_CLOUD_TASKS_AUDIENCE
GOOGLE_CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT
GOOGLE_CLOUD_TASKS_CREDENTIALS_B64
LLM_SETTINGS_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DOCUMENT_BUCKET
```

### Cloud Run Environment

Cloud Run worker에는 문서 파일, DB, LLM provider 설정을 읽기 위한 값이 필요하다.

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DOCUMENT_BUCKET
LLM_SETTINGS_SECRET
```

`LLM_SETTINGS_SECRET`은 Vercel과 Cloud Run에서 반드시 같은 값이어야 한다.
이 값이 바뀌면 기존에 저장된 LLM provider API key를 복호화할 수 없으므로, 설정 화면에서 provider API key를 다시 저장해야 한다.

---

## GCP Resource Shape

현재 운영 모델은 비용과 동시성 폭주를 막기 위해 작은 worker로 시작한다.

```text
Cloud Run service: rootmap-pdf-worker
Region: asia-northeast3
CPU: 1
Memory: 2Gi
Timeout: 1800s
Min instances: 0
Max instances: 1
Concurrency: 1
```

Cloud Tasks queue는 처리 속도를 낮게 제한한다.

```text
Queue: rootmap-document-processing
Max concurrent dispatches: 1
Max dispatches per second: low rate
Retry attempts: bounded retry
```

이 제한은 MVP 운영에서 비용 예측 가능성을 우선하기 위한 값이다.
문서 처리량이 늘어나면 chunk batch size, Cloud Tasks rate, Cloud Run max instances를 함께 조정한다.

---

## Resulting Artifacts

이번 개선으로 생긴 결과물은 다음과 같다.

1. Vercel web app에서 문서 처리 요청 시 PGMQ enqueue와 Cloud Tasks wake-up이 함께 수행된다.
2. Cloud Run worker가 private endpoint로 배포되어 Cloud Tasks OIDC 호출만 받는다.
3. 문서 처리 queue는 Supabase PGMQ가 담당하고, Cloud Tasks는 worker wake-up만 담당한다.
4. Cloud Tasks SDK 의존성이 제거되어 Vercel bundle asset 누락 문제를 피한다.
5. PGMQ payload JSON 직렬화 오류가 수정되었다.
6. worker는 chunk 단위로 처리하고, 남은 chunk가 있으면 재queue한다.
7. Vercel과 Cloud Run의 LLM secret 동기화 기준이 명확해졌다.
8. `.env*`, `.vercel`, `.codegraph`가 git과 Vercel deployment에 섞이지 않도록 ignore 처리되었다.
9. 동일 파일의 활성 처리 작업이 이미 있으면 새 queue 메시지를 만들지 않는 중복 enqueue 방어선이 추가되었다.

---

## Expected Impact

### User Impact

1. 사용자는 PDF 업로드 후 worker cron을 기다리지 않아도 된다.
2. 업로드 직후 문서 처리 시작 가능성이 높아진다.
3. 큰 PDF도 Vercel Function timeout에 덜 묶인다.
4. 처리 실패 시 chunk checkpoint와 queue retry를 통해 부분 재시도 가능성이 높아진다.

### Engineering Impact

1. web request와 background processing의 책임이 분리된다.
2. Vercel deployment는 UI/API entrypoint에 집중하고, worker runtime은 Cloud Run에서 독립 운영한다.
3. Cloud Run logs, Cloud Tasks retry, PGMQ queue state를 나눠서 장애 원인을 추적할 수 있다.
4. SDK bundle 문제를 REST client로 우회해 배포 artifact 의존성을 줄였다.
5. 비용 제어를 Cloud Tasks rate limit과 Cloud Run max instance로 명확히 할 수 있다.
6. 동일 PDF를 여러 번 업로드하거나 처리 버튼을 반복 클릭해도 중복 queue 생성을 줄여 LLM 토큰 비용을 예측하기 쉬워진다.

### Product Impact

1. 문서 기반 학습 트리 생성이 "하루 한 번 batch"가 아니라 "업로드 직후 처리"에 가까워진다.
2. RootMap의 Phase 3 핵심 가치인 문서 기반 학습 경로 생성이 더 빠르게 체감된다.
3. 향후 progress polling, 처리 상태 UI, 실패 원인 표시를 붙이기 쉬운 구조가 된다.

---

## Validation

최소 검증 기준은 다음이다.

```text
npm run check
npm run document:processing-jobs-smoke
```

운영 검증 기준은 다음이다.

1. Vercel production `/api/documents/:documentId/process`가 `202 Accepted`를 반환한다.
2. 응답에 PGMQ `message_id`가 포함된다.
3. Cloud Tasks task가 생성된다.
4. Cloud Run worker log에 `/api/workers/document-processing` 호출이 기록된다.
5. 문서 상태가 `uploaded -> text_extracted -> chunked -> concepts_extracted -> tree_generated` 순서로 진행된다.
6. 실패 시 문서 `processing_error`와 Cloud Run log에서 같은 원인을 추적할 수 있다.

---

## Operational Notes

1. Cloud Tasks task 생성이 실패해도 PGMQ 메시지는 남아 있을 수 있다.
   이 경우 별도 wake-up 호출 또는 다음 task 생성 시 worker가 메시지를 처리할 수 있다.
2. Cloud Run worker가 실패하면 PGMQ 메시지를 삭제하지 않는다.
   visibility timeout 이후 같은 메시지가 재전달될 수 있다.
3. CrofAI API key 저장 후 `LLM_SETTINGS_SECRET`을 바꾸면 기존 encrypted key는 복호화되지 않는다.
   secret 변경 후에는 LLM provider 설정 화면에서 API key를 다시 저장한다.
4. Cloud Run service를 public unauthenticated로 열지 않는다.
   Cloud Tasks OIDC와 Cloud Run invoker IAM으로 호출 경계를 유지한다.
5. 비용이 예상보다 증가하면 먼저 Cloud Tasks dispatch rate, Cloud Run max instances, worker chunk batch size를 낮춘다.
6. 같은 파일의 중복 문서가 이미 queue에 들어간 경우, 운영자는 오래된 중복 PGMQ 메시지를 삭제하거나 중복 문서 상태를 실패 처리해 추가 LLM 호출을 멈춘다.

---

## Acceptance Criteria

- [x] 문서 처리 요청이 Vercel API에서 PGMQ queue에 저장된다.
- [x] 문서 처리 요청 직후 Cloud Tasks wake-up task가 생성된다.
- [x] Cloud Tasks는 OIDC token으로 private Cloud Run worker를 호출한다.
- [x] Cloud Run worker는 PGMQ 메시지를 읽고 문서 처리 pipeline을 실행한다.
- [x] worker는 chunk batch 단위로 처리하고 남은 작업을 재queue한다.
- [x] worker 실패 시 메시지를 삭제하지 않아 retry 가능성을 남긴다.
- [x] Vercel bundle에서 Cloud Tasks SDK asset 누락 문제가 재발하지 않도록 SDK 의존성을 제거한다.
- [x] PGMQ payload serialization이 serverless 환경에서 안정적으로 동작하도록 명시 JSON 문자열화를 사용한다.
- [x] secret, Vercel local metadata, CodeGraph index가 commit 또는 deployment artifact에 포함되지 않는다.
- [x] 동일 파일의 활성 처리 작업이 있을 때 새 document processing queue 메시지를 만들지 않는다.
