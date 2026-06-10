# RootMap Phase 18 구현 계획

이 폴더는 `docs/specs/learning-quality-and-tutoring-spec.md`의 **Section 8 (테스트: smoke에서 formal eval/CI로)** 를 작업 단위로 쪼갠 실행 계획을 담는다.

Phase 18의 핵심은 custom smoke 중심 검증을 정식 `tests/` 구조와 분리된 CI로 확장하는 것이다. 현재 `package.json`에는 phase별 smoke와 `scripts/phase6-test-harness.ts`(`unit|integration|e2e|llm-eval|quality` 버킷)가 있고 `test:unit/test:integration/test:e2e/test:llm-eval` 스크립트도 있지만, Vitest/Playwright 같은 정식 러너는 없다. 기존 버킷을 유지하면서 순수 로직부터 정식 단위 테스트로 옮기고 CI를 분리한다.

## Phase 18 핵심 목표

1. `tests/unit`에 `concept-graph`, `mastery`, `fsrs-lite`, `recommendation` 테스트를 둔다.
2. `tests/integration`에 generate-tree route와 document-pipeline 테스트를 둔다.
3. `tests/e2e`에 create-topic-tree, upload-document 시나리오를 둔다.
4. `tests/evals`에 tree-quality, document-grounding, quiz-quality eval을 통합한다.
5. CI를 lint-build / unit / integration / llm-eval-mocked / e2e로 분리한다.
6. LLM live eval은 PR마다 돌리지 않고 수동/nightly로 둔다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-test-structure-contract-and-runner.md](./00-test-structure-contract-and-runner.md) | `tests/` 구조·러너 선택·CI 계약 고정 | P0 |
| 1 | [01-unit-tests-pure-logic.md](./01-unit-tests-pure-logic.md) | 순수 로직 단위 테스트 이전 | P0 |
| 2 | [02-integration-tests-routes-and-pipeline.md](./02-integration-tests-routes-and-pipeline.md) | route·문서 파이프라인 통합 테스트 | P1 |
| 3 | [03-e2e-tests-core-flows.md](./03-e2e-tests-core-flows.md) | 핵심 사용자 흐름 e2e | P1 |
| 4 | [04-evals-integration-and-ci-split.md](./04-evals-integration-and-ci-split.md) | eval 통합, CI 분리, 최종 품질 gate | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [ ] 00. [00-test-structure-contract-and-runner.md](./00-test-structure-contract-and-runner.md) - `tests/` 구조와 러너·CI 계약 고정
- [ ] 01. [01-unit-tests-pure-logic.md](./01-unit-tests-pure-logic.md) - 순수 로직 단위 테스트
- [ ] 02. [02-integration-tests-routes-and-pipeline.md](./02-integration-tests-routes-and-pipeline.md) - route·파이프라인 통합 테스트
- [ ] 03. [03-e2e-tests-core-flows.md](./03-e2e-tests-core-flows.md) - 핵심 흐름 e2e 테스트
- [ ] 04. [04-evals-integration-and-ci-split.md](./04-evals-integration-and-ci-split.md) - eval 통합과 CI 분리

## 범위 요약

### 포함

- `tests/unit|integration|e2e|evals` 디렉터리 구조
- 순수 로직(`concept-graph`, `mastery`, `fsrs-lite`, `recommendation`) 단위 테스트
- generate-tree route, document-pipeline 통합 테스트
- create-topic-tree, upload-document e2e
- tree-quality / document-grounding / quiz-quality eval 통합(Phase 12·14·16 산출물 재사용)
- CI 분리(lint-build / unit / integration / llm-eval-mocked / e2e)

### 제외

- 기존 phase smoke 스크립트 일괄 삭제(점진 이전, 당분간 병행)
- 모든 테스트의 100% 커버리지 목표
- LLM live eval의 PR 단위 상시 실행
- 새 기능 추가(테스트·CI 정비에 한정)
- 배포 파이프라인 재설계

## 의사결정 포인트

- 러너 도입(Vitest 등)은 Task 00에서 결정하고, 결정 전까지 기존 `phase6-test-harness.ts` 버킷을 유지한다.
- `test:unit/test:integration/test:e2e/test:llm-eval` 스크립트 이름은 유지하고 내부 구현만 정식 러너로 옮긴다(인터페이스 호환).
- 기존 smoke는 즉시 제거하지 않고 정식 테스트로 점진 이전한다.
- LLM eval은 mocked(CI)와 live(수동/nightly)를 분리한다.
- e2e는 기존 워크플로(`process-rootmap-document.yml`)와 충돌하지 않게 별도 job으로 둔다.

## 완료 조건

Phase 18이 끝나면 `npm run test:unit|test:integration|test:e2e|test:llm-eval`이 정식 `tests/` 구조를 실행하고, CI가 lint-build / unit / integration / llm-eval-mocked / e2e로 분리된다. LLM live eval은 nightly/수동 workflow로만 실행된다.

최종 검증은 `apps/web`에서 `npm run test:unit`, `npm run test:integration`, `npm run check`가 통과하고, CI 워크플로 정의가 분리되어 있는 것으로 고정한다.
