# 06. Phase 09 Runbook과 Quality Gate

## 목표

로컬 runner 사용법, 실패 복구 절차, GCP worker 재개 전 확인 항목을 운영 문서에 남기고 Phase 09의 최종 검증 명령을 고정한다.

## 관련 명세

- `local-document-processing-runner-spec.md` Current Stop State
- `local-document-processing-runner-spec.md` Recovery Procedure For Current Failed PDF
- `local-document-processing-runner-spec.md` Validation

## 관련 파일

- `docs/deployment-runbook.md`
- `docs/plans/phase-09/README.md`
- `apps/web/README.md`
- `apps/web/package.json`

## 구현 작업

### 1. 로컬 runner 운영 절차 문서화

- `docs/deployment-runbook.md`에 Phase 09 로컬 runner 절차를 추가한다.
- 기본 실행 순서는 아래로 고정한다.

```bash
cd apps/web
npm run document:process-local -- --document-id <document-id> --dry-run
npm run document:process-local -- --document-id <document-id> --resume --chunk-batch-size 1
```

- `concepts_extracted` 상태의 tree 저장 재시도는 아래 명령으로 분리한다.

```bash
cd apps/web
npm run document:process-local -- --document-id <document-id> --tree-only
```

### 2. Env 준비 문서화

- `apps/web/README.md`에 `.env.local-worker`의 목적과 필수 key를 간단히 추가한다.
- secret 값 자체는 문서에 쓰지 않는다.
- direct DB host가 IPv6 문제로 실패하면 Supabase pooler/session mode URL을 사용한다는 운영 메모를 남긴다.

### 3. GCP worker 재개 전 checklist 추가

- Cloud Tasks queue가 pause 상태인지 확인한다.
- pending task가 0개인지 확인한다.
- Cloud Run `rootmap-pdf-worker`가 `min instances = 0`인지 확인한다.
- 로컬 runner 검증이 끝나도 billing/queue/service 재개는 별도 사용자 승인으로 처리한다고 적는다.

### 4. 최종 검증 명령 고정

- Phase 09 완료 시 아래 명령을 `apps/web`에서 실행한다.

```bash
npm run document:processing-jobs-smoke
npm run document:process-local-smoke
npm run document:process-local -- --document-id <document-id> --dry-run
npm run document:process-local -- --document-id <document-id> --tree-only
npm run check
```

- 실제 `<document-id>`가 필요한 명령은 운영자가 선택한 Supabase 문서를 대상으로 실행한다.
- GCP billing이 꺼져 있어도 위 검증은 Cloud Tasks/Cloud Run을 호출하지 않아야 한다.

## 완료 기준(DoD)

- runbook에 dry-run, resume, tree-only 실행 순서가 있다.
- `.env.local-worker` 필수 key와 commit 금지 원칙이 문서화되어 있다.
- GCP worker 재개 전 checklist가 사용자 승인 gate를 포함한다.
- Phase 09 README 체크리스트에서 완료된 task만 `[x]`로 표시된다.
- 검증 명령: `npm run document:processing-jobs-smoke && npm run document:process-local-smoke && npm run check`
