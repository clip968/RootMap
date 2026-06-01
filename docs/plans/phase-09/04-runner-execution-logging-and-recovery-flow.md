# 04. Runner 실행, Logging, 복구 흐름

## 목표

CLI가 dry-run 이후 실제 로컬 처리를 실행하고, 성공/실패 로그만으로 다음 재시도 단계를 판단할 수 있게 한다. 현재 실패 PDF의 tree 저장 재시도 절차도 같은 흐름에서 다룬다.

## 관련 명세

- `local-document-processing-runner-spec.md` Command Interface
- `local-document-processing-runner-spec.md` Recovery Procedure For Current Failed PDF
- `local-document-processing-runner-spec.md` Logging
- `local-document-processing-runner-spec.md` Validation

## 관련 파일

- `apps/web/scripts/process-document-local.ts`
- `apps/web/src/lib/document/local-processing-summary.ts`
- `apps/web/src/lib/document/processor.ts`
- `apps/web/src/lib/repository/document-repository.ts`

## 구현 작업

### 1. 실제 실행 모드 연결

- `--dry-run`이 아니면 runner가 `processDocument(documentId, DEFAULT_USER_ID, options)`를 호출한다.
- `--chunk-batch-size`는 `ProcessDocumentOptions.chunkBatchSize`로 전달한다.
- `--stop-after-concepts`는 `ProcessDocumentOptions.stopAfterConcepts`로 전달한다.
- `--tree-only`는 `ProcessDocumentOptions.treeOnly`로 전달한다.
- `--resume`은 상태별 resume 계약을 사용하겠다는 운영자 의도를 로그에 남기되, 안전하지 않은 `failed` 재개를 자동 허용하지 않는다.

### 2. Structured success log 출력

- 성공 시 최소한 아래 값을 JSON으로 출력한다.
  - `document_id`
  - `original_filename`
  - `processing_status_before`
  - `processing_status_after`
  - `page_count`
  - `chunk_count`
  - `checkpointed_chunk_count`
  - `pending_chunk_count`
  - `document_concept_count`
  - `tree_id`
  - `llm_stage_executed`
  - `duration_ms`
- `llm_stage_executed`는 `none`, `chunk_concepts`, `document_consolidation`, `tree_generation`, `multiple` 중 하나로 구분한다.

### 3. Structured error log 출력

- 오류 시 아래 값을 출력한다.
  - `error_code`
  - `error_message`
  - `failed_stage`
  - `recommended_next_action`
- `recommended_next_action` mapping에는 운영자가 다음 실행 명령을 선택할 수 있도록 한국어 주석을 남긴다.
- `TREE_PERSIST_FAILED`는 `document_concepts` 존재 여부를 확인한 뒤 `concepts_extracted`로 되돌리고 `--tree-only`를 실행하는 복구 안내를 출력한다.
- env 누락, document not found, invalid status, active duplicate는 서로 다른 `error_code`를 사용한다.

### 4. 현재 실패 PDF 복구 절차 반영

- `df4238b7-2b3d-4b50-b333-f55ea11707bf` 문서는 실패 예시로만 문서화하고 script 내부에 하드코딩하지 않는다.
- 복구 runbook은 다음 절차를 고정한다.
  1. `document_concepts` 존재 확인
  2. 운영자가 문서 상태를 `concepts_extracted`로 되돌림
  3. `npm run document:process-local -- --document-id <document-id> --tree-only`
  4. `tree_generated` 상태와 `document_learning_trees` link 확인
  5. chunk concept 추출이 반복되지 않았는지 로그 확인

## 완료 기준(DoD)

- runner가 dry-run이 아닌 실행에서 `processDocument`를 호출한다.
- 성공 로그에 before/after status와 tree id가 포함된다.
- 실패 로그에 next action이 포함된다.
- 현재 실패 PDF 복구 절차가 hard-coded special case가 아니라 일반 tree-only 복구 절차로 문서화된다.
- 검증 명령: `npm run document:process-local -- --document-id <document-id> --tree-only`
