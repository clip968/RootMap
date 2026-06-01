# RootMap Phase 09 구현 계획

이 폴더는 `docs/specs/local-document-processing-runner-spec.md`를 기준으로 **Local Document Processing Runner** 작업을 task 단위로 쪼갠 실행 계획을 담는다.

Phase 09의 핵심은 GCP billing, Cloud Tasks, Cloud Run worker를 다시 켜기 전에 문서 처리 파이프라인을 로컬 CLI에서 단일 `documentId` 기준으로 통제 가능하게 만드는 것이다. 이미 완료된 단계는 재사용하고, LLM 호출 범위를 명확히 제한하며, 실패 후 다음 재시도 작업을 로그와 DB 상태만으로 판단할 수 있게 한다.

## Phase 09 핵심 목표

1. Cloud Tasks/Cloud Run 없이 `apps/web` 로컬 CLI에서 문서 처리 파이프라인을 실행한다.
2. 한 번의 실행은 하나의 `documentId`만 처리해 LLM 토큰 사용 범위를 제한한다.
3. `uploaded`, `text_extracted`, `chunked`, `concepts_extracted`, `tree_generated`, `failed` 상태별 처리 계약을 명확히 한다.
4. `concepts_extracted` 문서는 chunk LLM 호출 없이 tree 생성과 저장만 재시도할 수 있게 한다.
5. 실행 전 `--dry-run`으로 문서 상태, chunk/checkpoint/concept 수, 중복 위험을 확인한다.
6. 현재 `fast26-pan.pdf` 실패 유형처럼 tree 저장 단계 실패를 로컬에서 복구할 수 있게 한다.
7. GCP worker 재개는 로컬 runner 검증 후 사용자 승인 없이는 진행하지 않는다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-local-runner-stop-state-and-scope.md](./00-local-runner-stop-state-and-scope.md) | GCP worker 중단 상태와 Phase 09 범위, 재개 승인 조건 고정 | P0 |
| 1 | [01-local-worker-env-and-cli-entrypoint.md](./01-local-worker-env-and-cli-entrypoint.md) | `.env.local-worker`, npm script, CLI 옵션 parsing 기반 마련 | P0 |
| 2 | [02-local-processing-summary-and-dry-run.md](./02-local-processing-summary-and-dry-run.md) | dry-run summary helper와 중복/비용 guard 출력 추가 | P0 |
| 3 | [03-process-document-resume-and-tree-only-contract.md](./03-process-document-resume-and-tree-only-contract.md) | `processDocument`의 resume, tree-only, failed 상태 처리 계약 정리 | P0 |
| 4 | [04-runner-execution-logging-and-recovery-flow.md](./04-runner-execution-logging-and-recovery-flow.md) | 로컬 runner 실행, structured logging, 현재 실패 PDF 복구 흐름 구현 | P0 |
| 5 | [05-local-runner-smoke-and-cost-guard-tests.md](./05-local-runner-smoke-and-cost-guard-tests.md) | dry-run, tree-only, 중복 LLM 방지, 완료 문서 skip smoke 검증 | P1 |
| 6 | [06-phase9-docs-runbook-and-quality-gate.md](./06-phase9-docs-runbook-and-quality-gate.md) | 운영 runbook, 최종 검증 명령, GCP worker 재개 gate 문서화 | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [ ] 00. [00-local-runner-stop-state-and-scope.md](./00-local-runner-stop-state-and-scope.md) - GCP worker 중단 상태와 Phase 09 범위 고정
- [ ] 01. [01-local-worker-env-and-cli-entrypoint.md](./01-local-worker-env-and-cli-entrypoint.md) - local worker env와 CLI entrypoint 준비
- [ ] 02. [02-local-processing-summary-and-dry-run.md](./02-local-processing-summary-and-dry-run.md) - dry-run summary와 비용 guard 출력 추가
- [ ] 03. [03-process-document-resume-and-tree-only-contract.md](./03-process-document-resume-and-tree-only-contract.md) - resume/tree-only 상태 처리 계약 구현
- [ ] 04. [04-runner-execution-logging-and-recovery-flow.md](./04-runner-execution-logging-and-recovery-flow.md) - runner 실행과 실패 PDF 복구 흐름 구현
- [ ] 05. [05-local-runner-smoke-and-cost-guard-tests.md](./05-local-runner-smoke-and-cost-guard-tests.md) - smoke test와 중복 LLM 방지 검증
- [ ] 06. [06-phase9-docs-runbook-and-quality-gate.md](./06-phase9-docs-runbook-and-quality-gate.md) - runbook과 최종 quality gate 정리

## 범위 요약

### 포함

- `apps/web/.env.local-worker` 기준 로컬 실행 환경
- `npm run document:process-local -- --document-id <uuid>` CLI
- `--env-file`, `--dry-run`, `--resume`, `--tree-only`, `--chunk-batch-size`, `--stop-after-concepts` 옵션
- 처리 상태별 resume 계약
- dry-run summary와 중복 active 문서 경고
- chunk checkpoint 재사용과 tree-only 재시도
- 문서 처리 로그와 실패 시 `recommended_next_action`
- `fast26-pan.pdf` 실패 유형 복구 절차
- smoke test와 `npm run check` 기반 품질 gate

### 제외

- GCP billing 자동 재연결
- Cloud Tasks queue 재개 또는 Cloud Run worker 재배포
- Cloud Tasks/Cloud Run 로컬 에뮬레이션
- PDF OCR, 표/그림/수식 구조 분석 품질 개선
- LLM provider 교체, 모델 비교, pricing 변경
- production web server 대체

## 의사결정 포인트

- Phase 09의 source of truth는 로컬 CLI 실행 로그와 Supabase DB 상태다.
- Cloud Tasks와 Cloud Run은 이 단계에서 실행 경로에 참여하지 않는다.
- `failed` 상태는 기본 재개 대상이 아니며, 명시 옵션이나 운영자 상태 복구 없이 자동 처리하지 않는다.
- `tree-only`는 `concepts_extracted` 상태에서만 허용하고 chunk concept LLM 호출을 절대 수행하지 않는다.
- 동일 파일의 다른 active 문서가 있으면 실행 전에 경고해 중복 LLM 비용을 막는다.
- `.env.local-worker`는 `.env*` ignore 규칙에 의해 git에 포함하지 않는다.
- 새로 작성하는 code path에는 로컬 실행 경계, 비용 guard, 실패 복구 기준을 사용자가 이해할 수 있는 한국어 주석으로 남긴다.

## 완료 조건

Phase 09가 끝나면 `apps/web`에서 로컬 runner로 특정 문서 하나를 dry-run, resume, tree-only 모드로 처리할 수 있어야 한다. `concepts_extracted` 문서는 chunk LLM 호출 없이 tree 저장만 재시도하고, 성공 시 `documents.processing_status = tree_generated`와 `document_learning_trees` link가 확인되어야 한다. 최종 검증은 `npm run document:processing-jobs-smoke`, `npm run document:process-local -- --document-id <document-id> --dry-run`, `npm run document:process-local -- --document-id <document-id> --tree-only`, `npm run check`로 고정한다.
