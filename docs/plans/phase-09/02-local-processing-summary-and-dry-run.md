# 02. Dry-Run Summary와 비용 Guard

## 목표

로컬 runner가 실제 처리 전에 문서 상태와 재시도 가능성을 출력하고, 중복 active 문서나 불필요한 LLM 호출 위험을 운영자가 확인할 수 있게 한다.

## 관련 명세

- `local-document-processing-runner-spec.md` Goals
- `local-document-processing-runner-spec.md` State Handling Rules
- `local-document-processing-runner-spec.md` Cost Controls
- `local-document-processing-runner-spec.md` Logging

## 관련 파일

- `apps/web/src/lib/document/local-processing-summary.ts`
- `apps/web/src/lib/repository/document-repository.ts`
- `apps/web/scripts/process-document-local.ts`

## 구현 작업

### 1. Summary helper 추가

- `apps/web/src/lib/document/local-processing-summary.ts`를 추가한다.
- checkpoint, 중복 문서, recommended action 계산은 운영자가 dry-run 출력만 보고 판단하는 부분이므로 한국어 주석으로 판단 기준을 설명한다.
- helper는 `documentId`와 user id를 입력받아 아래 값을 반환한다.
  - `document_id`
  - `original_filename`
  - `processing_status_before`
  - `page_count`
  - `chunk_count`
  - `checkpointed_chunk_count`
  - `pending_chunk_count`
  - `document_concept_count`
  - `active_duplicate_document_id`
  - `can_process`
  - `recommended_next_action`
- checkpoint count는 `document_chunks.metadata.document_concept_extraction.status`가 `completed` 또는 `skipped`인 chunk 수로 계산한다.

### 2. Repository 조회 함수 보강

- `document-repository.ts`에 summary helper가 필요한 좁은 조회 함수만 추가한다.
- 기존 public API나 route 응답 형태는 변경하지 않는다.
- 동일 파일 active 중복 조회는 기존 `findOlderActiveDuplicateDocumentForProcessing` 기준과 같은 조건을 사용한다.

### 3. Dry-run 출력 구현

- CLI가 `--dry-run`이면 DB를 변경하지 않는다.
- dry-run은 summary JSON을 출력하고 `processDocument`를 호출하지 않는다.
- `tree_generated` 상태면 기존 tree id를 함께 출력한다.
- `failed` 상태면 기본적으로 `can_process = false`로 출력한다.

### 4. 비용 guard 메시지 추가

- active duplicate가 있으면 실행 전에 경고한다.
- `concepts_extracted` 상태에서는 chunk LLM 호출이 없어야 한다는 recommended action을 출력한다.
- `chunked` 상태에서는 pending chunk 수와 `--chunk-batch-size` 적용 범위를 출력한다.
- `tree_generated` 상태에서는 추가 LLM 호출 없이 종료해야 한다고 출력한다.

## 완료 기준(DoD)

- `--dry-run` 실행은 `documents`, `document_chunks`, `document_concepts`, `learning_trees`, `document_learning_trees`를 변경하지 않는다.
- summary에 chunk/checkpoint/concept 수가 포함된다.
- 중복 active 문서가 있으면 처리 실행 전 경고가 보인다.
- `tree_generated` 문서는 이미 완료된 문서로 인식된다.
- 검증 명령: `npm run document:process-local -- --document-id <document-id> --dry-run`
