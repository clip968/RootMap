# Local Document Processing Runner Specification

## Overview

이 문서는 RootMap 문서 처리 파이프라인을 당분간 GCP Cloud Run/Cloud Tasks가 아니라 로컬 CLI에서 실행하기 위한 운영 사양이다.

목표는 PDF 업로드 후 생기는 문서 처리 과정을 로컬에서 통제하며 디버깅하고, LLM 토큰 사용량과 retry 동작을 최적화한 뒤에만 GCP worker를 다시 활성화하는 것이다.

## Current Stop State

현재 GCP worker 경로는 중단 상태로 둔다.

1. `rootmap-clip968` 프로젝트 billing은 unlink되어 있다.
2. `rootmap-document-processing` Cloud Tasks queue는 pause 상태로 둔다.
3. Cloud Tasks pending task는 0개 상태를 기준으로 한다.
4. Cloud Run service `rootmap-pdf-worker`는 남겨두되 `min instances = 0`이므로 요청이 없으면 실행하지 않는다.
5. GCP worker 재개는 로컬 runner 검증 후 사용자가 명시적으로 승인할 때만 한다.

## Problem Statement

Cloud Run worker 전환 후 다음 문제가 확인되었다.

1. 동일 PDF를 반복 업로드하면 중복 문서가 queue에 들어가 LLM 토큰을 중복 소모할 수 있다.
2. 이전 테스트 문서가 `chunked` 같은 활성 상태로 남으면 새 업로드가 중복 방어 로직에 막힐 수 있다.
3. Cloud Tasks retry와 PGMQ retry가 겹치면 어떤 문서가 실제로 처리 중인지 추적이 어렵다.
4. 현재 실패 사례에서는 텍스트 추출과 개념 추출은 성공했지만, `document_learning_trees` link 저장이 transaction 밖에서 실행되어 tree 저장 단계에서 실패했다.
5. GCP billing을 꺼둔 상태에서는 Cloud Tasks/Cloud Run 기반 검증이 불가능하므로 로컬에서 재현 가능한 runner가 필요하다.

## Goals

1. GCP billing, Cloud Tasks, Cloud Run 없이 문서 처리 파이프라인을 로컬에서 실행한다.
2. 특정 `documentId` 하나만 대상으로 처리해 LLM 호출 범위를 명확히 제한한다.
3. 이미 완료된 단계는 반복하지 않고 현재 DB 상태에서 이어 처리한다.
4. `concepts_extracted` 문서는 chunk LLM 호출 없이 tree 생성과 저장만 재시도할 수 있어야 한다.
5. 실행 전 dry-run으로 문서 상태, chunk 수, checkpoint 수, document concept 수를 확인한다.
6. 처리 실패 시 다음에 무엇을 재시도해야 하는지 문서 상태와 로그만으로 판단 가능해야 한다.

## Non-Goals

1. 로컬 runner가 production web server를 대체하지 않는다.
2. GCP Cloud Tasks queue를 로컬에서 완전히 에뮬레이션하지 않는다.
3. PDF OCR, 표/그림/수식 구조 분석 품질 개선은 포함하지 않는다.
4. LLM provider 교체는 포함하지 않는다.
5. billing을 자동으로 다시 연결하지 않는다.

## Required Local Environment

로컬 runner는 별도 env 파일을 사용한다.

```text
apps/web/.env.local-worker
```

필수 값은 다음이다.

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DOCUMENT_BUCKET
LLM_SETTINGS_SECRET
```

주의사항:

1. `.env.local-worker`는 git에 commit하지 않는다.
2. `DATABASE_URL`은 로컬에서 접속 가능한 Supabase Postgres URL이어야 한다.
3. direct DB host가 IPv6 문제로 실패하면 Supabase pooler/session mode URL을 사용한다.
4. `LLM_SETTINGS_SECRET`은 production에 저장된 LLM provider key를 복호화할 수 있는 값과 같아야 한다.

## Command Interface

권장 npm script는 다음 형태다.

```bash
cd apps/web
npm run document:process-local -- --document-id <document-id> --resume
```

필수 옵션:

```text
--document-id <uuid>
```

권장 옵션:

```text
--env-file .env.local-worker
--resume
--dry-run
--tree-only
--chunk-batch-size <number>
--stop-after-concepts
```

동작 의미:

1. `--dry-run`
   - DB를 변경하지 않고 문서 상태와 처리 가능 여부만 출력한다.
2. `--resume`
   - 현재 `processing_status`에서 이어 처리한다.
3. `--tree-only`
   - 문서가 `concepts_extracted`일 때 chunk/concept LLM 호출 없이 tree 생성과 저장만 실행한다.
4. `--chunk-batch-size`
   - 한 번에 처리할 chunk 수를 제한한다.
5. `--stop-after-concepts`
   - 개념 추출과 통합까지만 수행하고 tree 생성은 다음 실행으로 미룬다.

## Local Data Flow

로컬 runner의 기본 흐름은 다음이다.

```text
사용자 업로드
  ↓
Supabase Storage 원본 파일 저장
  ↓
documents row 생성
  ↓
로컬 CLI 실행
  ↓
processDocument(documentId, DEFAULT_USER_ID, options)
  ↓
document_pages / document_chunks 저장 또는 재사용
  ↓
chunk별 LLM concept 후보 추출 또는 checkpoint 재사용
  ↓
document_concepts 저장 또는 재사용
  ↓
learning_trees / learning_nodes / document_learning_trees 저장
  ↓
documents.processing_status = tree_generated
```

Cloud Tasks와 Cloud Run은 이 흐름에 참여하지 않는다.

## State Handling Rules

로컬 runner는 문서 상태를 다음처럼 다룬다.

| 상태 | 로컬 처리 |
|---|---|
| `uploaded` | 텍스트 추출부터 시작 |
| `text_extracted` | chunk 분할부터 시작 |
| `chunked` | 미처리 chunk concept 추출부터 시작 |
| `concepts_extracted` | tree 생성/저장부터 시작 |
| `tree_generated` | 처리하지 않고 tree id를 출력 |
| `failed` | 기본적으로 중단, `--resume-failed` 같은 명시 옵션이 있을 때만 재개 |

`failed` 재개는 안전하지 않을 수 있으므로 기본 동작으로 두지 않는다.
다만 실패 원인이 tree 저장 단계이고 concepts가 이미 저장되어 있다면, 운영자가 상태를 `concepts_extracted`로 되돌린 뒤 `--tree-only`로 재시도한다.

## Recovery Procedure For Current Failed PDF

현재 `fast26-pan.pdf` 테스트 문서의 실패 유형은 다음이다.

```text
documentId: df4238b7-2b3d-4b50-b333-f55ea11707bf
status: failed
last successful stage: concepts_extracted
failure stage: document tree persistence
```

복구 절차:

1. 문서에 `document_concepts`가 존재하는지 확인한다.
2. 문서 상태를 `concepts_extracted`로 되돌린다.
3. 로컬 runner를 `--tree-only`로 실행한다.
4. tree 저장 성공 후 `tree_generated` 상태와 document-tree link 존재를 확인한다.
5. chunk concept 추출은 반복하지 않는다.

## Cost Controls

로컬 runner는 다음 제한을 기본값으로 가진다.

1. 하나의 실행은 하나의 `documentId`만 처리한다.
2. 동일 파일 중복 문서가 활성 상태면 실행 전 경고한다.
3. `--dry-run` 결과 확인 없이 batch 처리하지 않는다.
4. `chunkBatchSize` 기본값은 1 또는 3 중 작은 값으로 시작한다.
5. 이미 metadata에 checkpoint된 chunk는 다시 LLM 호출하지 않는다.
6. `concepts_extracted` 상태에서는 chunk LLM 호출을 하지 않는다.
7. tree 생성 재시도는 document당 명시 실행으로만 수행한다.

## Logging

로컬 runner는 최소한 다음 정보를 출력한다.

```text
document_id
original_filename
processing_status_before
processing_status_after
page_count
chunk_count
checkpointed_chunk_count
pending_chunk_count
document_concept_count
tree_id
llm_stage_executed
duration_ms
```

오류 발생 시 다음을 출력한다.

```text
error_code
error_message
failed_stage
recommended_next_action
```

## Implementation Targets

예상 구현 파일:

```text
apps/web/scripts/process-document-local.ts
apps/web/package.json
```

필요하면 상태 점검용 helper를 추가할 수 있다.

```text
apps/web/src/lib/document/local-processing-summary.ts
```

기존 production pipeline은 재사용한다.

```text
apps/web/src/lib/document/processor.ts
apps/web/src/lib/repository/document-repository.ts
```

## Validation

최소 검증 명령:

```bash
cd apps/web
npm run document:processing-jobs-smoke
npm run check
```

로컬 runner 구현 후 추가 검증:

```bash
cd apps/web
npm run document:process-local -- --document-id <document-id> --dry-run
npm run document:process-local -- --document-id <document-id> --tree-only
```

성공 기준:

1. `--dry-run`은 DB를 변경하지 않는다.
2. `--tree-only`는 chunk concept LLM 호출을 하지 않는다.
3. tree 저장 성공 시 `documents.processing_status`가 `tree_generated`가 된다.
4. `document_learning_trees` link가 생성된다.
5. 동일 문서를 다시 실행하면 이미 완료된 문서로 인식하고 추가 LLM 호출을 하지 않는다.

## GCP Resume Gate

GCP worker는 다음 조건을 모두 만족하기 전까지 재개하지 않는다.

1. 로컬 runner로 현재 실패 문서를 tree 생성까지 복구했다.
2. duplicate upload 방어가 stale 문서를 과도하게 막지 않는지 확인했다.
3. tree persistence transaction 문제가 재발하지 않는 것을 확인했다.
4. 로컬에서 한 번 이상 전체 PDF 처리 dry-run/실행 흐름을 검증했다.
5. 사용자가 명시적으로 GCP billing 재연결과 Cloud Run 재배포를 승인했다.

재개 순서:

```text
billing link
Cloud Run redeploy
Cloud Tasks queue resume
single PDF smoke
cost/log review
```

## Acceptance Criteria

- [ ] 로컬 CLI가 단일 `documentId`를 받아 문서 처리를 실행한다.
- [ ] 로컬 CLI가 `--dry-run`으로 현재 처리 가능 상태를 출력한다.
- [ ] `concepts_extracted` 문서를 `--tree-only`로 tree 저장까지 재시도할 수 있다.
- [ ] chunk checkpoint가 있는 문서를 재처리할 때 이미 처리한 chunk를 다시 LLM 호출하지 않는다.
- [ ] 실패 문서 queue 메시지는 로컬 worker 또는 정리 절차에서 재시도 폭주를 만들지 않는다.
- [ ] GCP billing/Cloud Tasks/Cloud Run 없이 로컬에서 현재 실패 PDF를 복구할 수 있다.
- [ ] GCP 재개는 별도 사용자 승인 전까지 수행하지 않는다.
