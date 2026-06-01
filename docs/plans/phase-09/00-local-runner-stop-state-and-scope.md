# 00. 로컬 Runner 중단 상태와 범위 고정

## 목표

Phase 09 동안 GCP worker 경로를 계속 중단 상태로 유지하고, 로컬 runner가 대체해야 하는 범위와 대체하지 않는 범위를 명확히 고정한다.

## 관련 명세

- `local-document-processing-runner-spec.md` Overview
- `local-document-processing-runner-spec.md` Current Stop State
- `local-document-processing-runner-spec.md` Goals
- `local-document-processing-runner-spec.md` Non-Goals

## 관련 파일

- `docs/specs/local-document-processing-runner-spec.md`
- `docs/plans/phase-09/README.md`
- `docs/deployment-runbook.md`

## 구현 작업

### 1. GCP stop state를 작업 전제 조건으로 문서화

- `rootmap-clip968` billing unlink 상태를 전제로 둔다.
- `rootmap-document-processing` Cloud Tasks queue는 pause 상태로 둔다.
- Cloud Tasks pending task는 0개 상태를 기준으로 둔다.
- Cloud Run service `rootmap-pdf-worker`는 남겨두되 `min instances = 0` 상태를 기준으로 둔다.
- Phase 09 작업 중에는 Cloud Tasks queue resume, Cloud Run min instance 증가, billing 재연결을 수행하지 않는다.

### 2. 로컬 runner의 책임 범위 고정

- 로컬 runner는 이미 업로드되어 `documents` row와 Supabase Storage 원본 파일이 있는 문서만 처리한다.
- 처리 시작점은 `documentId` 하나이며 batch 처리나 전체 queue drain을 지원하지 않는다.
- 기존 production pipeline의 `processDocument` 흐름을 재사용한다.
- Cloud Tasks wake-up, Cloud Run invoker 권한, GCP service account 설정은 이 phase에서 실행 경로에 포함하지 않는다.

### 3. GCP worker 재개 gate 정의

- 로컬 runner dry-run이 DB 상태를 정확히 출력해야 한다.
- `concepts_extracted` 문서의 tree-only 재시도가 성공해야 한다.
- 중복 active 문서 경고와 완료 문서 skip이 검증되어야 한다.
- 위 조건을 만족한 뒤에도 GCP worker 재개는 사용자의 명시 승인을 받은 별도 작업으로 분리한다.

## 완료 기준(DoD)

- Phase 09 README가 GCP stop state와 재개 승인 조건을 설명한다.
- 구현자가 Phase 09 작업 중 GCP billing, Cloud Tasks, Cloud Run 설정을 건드리지 않아야 함을 확인할 수 있다.
- `docs/deployment-runbook.md`에 Phase 09 로컬 runner가 Cloud worker 재개 전 검증 단계라는 사실을 반영할 후속 작업이 식별되어 있다.
- 검증 명령: 문서 범위 고정 task이므로 별도 실행 명령 없음.
