# 05. Smoke Test와 비용 Guard 검증

## 목표

로컬 runner가 DB 변경 없는 dry-run, tree-only LLM 호출 방지, 완료 문서 skip, active duplicate 경고를 실제 smoke test로 검증하게 한다.

## 관련 명세

- `local-document-processing-runner-spec.md` Cost Controls
- `local-document-processing-runner-spec.md` Logging
- `local-document-processing-runner-spec.md` Validation

## 관련 파일

- `apps/web/scripts/smoke-document-processing-jobs.ts`
- `apps/web/scripts/smoke-document-processing-local.ts`
- `apps/web/package.json`
- `apps/web/src/lib/document/local-processing-summary.ts`
- `apps/web/src/lib/document/processor.ts`

## 구현 작업

### 1. Local runner smoke script 추가

- `apps/web/scripts/smoke-document-processing-local.ts`를 추가한다.
- 외부 Supabase나 실제 LLM을 호출하지 않도록 repository와 processor 의존성을 stub으로 분리하거나 순수 helper 중심으로 검증한다.
- 필요한 경우 runner parsing, summary formatting, next action mapping을 export 가능한 작은 함수로 분리한다.

### 2. Dry-run no mutation 검증

- dry-run 경로에서 `processDocument` stub이 호출되지 않는지 확인한다.
- summary 출력에 `chunk_count`, `checkpointed_chunk_count`, `pending_chunk_count`, `document_concept_count`가 포함되는지 확인한다.
- active duplicate가 있을 때 warning 또는 `recommended_next_action`이 출력되는지 확인한다.

### 3. Tree-only no chunk LLM 검증

- `concepts_extracted` 상태에서 `treeOnly` 실행 시 chunk concept extractor stub이 호출되지 않는지 확인한다.
- 저장된 `document_concepts`가 없으면 tree 생성으로 진행하지 않고 복구 안내를 반환하는지 확인한다.
- tree 저장 성공 시 `tree_generated`와 tree id가 결과에 포함되는지 확인한다.

### 4. 완료 문서 skip 검증

- `tree_generated` 상태 문서를 다시 실행하면 추가 LLM 호출 없이 already processed 결과가 반환되는지 확인한다.
- 동일 문서를 다시 실행했을 때 비용이 발생하지 않는다는 로그/summary 계약을 확인한다.

### 5. package script 추가

- `apps/web/package.json`에 아래 script를 추가한다.

```json
"document:process-local-smoke": "tsx scripts/smoke-document-processing-local.ts"
```

## 완료 기준(DoD)

- `npm run document:process-local-smoke`가 dry-run, tree-only, 완료 문서 skip, active duplicate warning을 검증한다.
- `npm run document:processing-jobs-smoke`가 기존 queue worker 계약을 계속 통과한다.
- smoke test가 실제 LLM provider key나 production DB를 요구하지 않는다.
- tree-only 경로에서 chunk concept LLM 호출이 발생하지 않는다는 assertion이 있다.
- 검증 명령: `npm run document:process-local-smoke && npm run document:processing-jobs-smoke`
