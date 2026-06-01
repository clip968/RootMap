# 03. Resume와 Tree-Only 처리 계약

## 목표

`processDocument`가 로컬 runner에서 상태별로 안전하게 재개되도록 옵션 계약을 정리하고, `concepts_extracted` 문서의 tree-only 재시도에서 chunk LLM 호출이 발생하지 않게 한다.

## 관련 명세

- `local-document-processing-runner-spec.md` Local Data Flow
- `local-document-processing-runner-spec.md` State Handling Rules
- `local-document-processing-runner-spec.md` Cost Controls
- `local-document-processing-runner-spec.md` Recovery Procedure For Current Failed PDF

## 관련 파일

- `apps/web/src/lib/document/processor.ts`
- `apps/web/src/lib/repository/document-repository.ts`
- `apps/web/scripts/process-document-local.ts`
- `apps/web/scripts/smoke-document-processing-jobs.ts`

## 구현 작업

### 1. `ProcessDocumentOptions` 확장

- 기존 `chunkBatchSize`, `stopAfterConcepts` 옵션을 유지한다.
- 로컬 runner용 옵션을 명시적으로 추가한다.
  - `treeOnly?: boolean`
  - `resumeFailed?: boolean`
- `treeOnly`는 `concepts_extracted` 상태에서만 허용한다.
- `resumeFailed`는 기본값 `false`로 두고 CLI에서 별도 옵션을 추가하기 전에는 사용하지 않는다.

### 2. 상태별 처리 규칙 고정

- `uploaded`: 텍스트 추출부터 시작한다.
- `text_extracted`: chunk 분할부터 시작한다.
- `chunked`: checkpoint가 없는 chunk concept 추출부터 시작한다.
- `concepts_extracted`: 저장된 `document_concepts`와 consolidation metadata를 사용해 tree 생성부터 시작한다.
- `tree_generated`: `ALREADY_PROCESSED` 결과로 종료하고 tree id를 출력 가능하게 한다.
- `failed`: 기본적으로 중단한다. `resumeFailed`가 명시된 경우에만 별도 검증 후 진행한다.

### 3. Tree-only guard 추가

- `treeOnly`가 true인데 상태가 `concepts_extracted`가 아니면 `INVALID_STATUS`로 실패한다.
- `treeOnly` 경로에서는 파일 buffer를 읽지 않는다.
- `treeOnly` 경로에서는 `extractConceptsFromChunks`, `generateChunkConcepts`, `consolidateConcepts`를 호출하지 않는다.
- LLM 호출을 건너뛰는 guard에는 비용 중복을 막기 위한 조건임을 한국어 주석으로 명시한다.
- `document_concepts`가 없으면 상태를 다시 실패로 만들기보다 복구 불가 오류와 next action을 출력한다.

### 4. Failed 상태 기본 재개 제거

- 현재 `failed`가 기본 restartable 상태에 들어가 있다면 제거한다.
- 실패 원인이 tree 저장 단계이고 concepts가 저장된 문서는 운영자가 상태를 `concepts_extracted`로 되돌린 뒤 `--tree-only`로 처리하는 절차를 기본 복구 경로로 둔다.
- runner는 `failed` 상태에서 임의로 status를 바꾸지 않는다.

### 5. 트리 저장 transaction 확인

- `learning_trees`, `learning_nodes`, `user_node_progress`, `document_learning_trees` 저장은 같은 transaction 안에서 수행한다.
- `createDocumentLearningTreeLink(documentId, treeId, tx)` 형태를 유지해 FK 검증이 transaction 밖에서 실패하지 않게 한다.

## 완료 기준(DoD)

- `concepts_extracted` + `--tree-only` 실행이 chunk concept LLM을 호출하지 않는다.
- `failed` 상태 문서는 기본 실행에서 중단된다.
- `tree_generated` 문서는 추가 처리 없이 기존 tree id를 출력한다.
- 트리 저장 성공 후 `documents.processing_status`가 `tree_generated`로 바뀐다.
- `document_learning_trees` link가 생성된다.
- 검증 명령: `npm run document:processing-jobs-smoke`
