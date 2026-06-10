# RootMap Phase 12 구현 계획

이 폴더는 `docs/specs/learning-quality-and-tutoring-spec.md`의 **Section 1 (품질 평가 시스템)** 을 하나의 phase 안에서 작업 단위로 쪼갠 실행 계획을 담는다.

Phase 12의 핵심은 새 기능을 늘리는 것이 아니라, 결과물이 아쉬울 때 원인이 프롬프트인지·모델인지·그래프 정렬인지·문서 추출인지 **자동으로 측정·분리**할 수 있는 eval 레이어를 먼저 붙이는 것이다. 현재 `apps/web/src/lib/llm/schemas.ts`의 `learningTreeQualityWarnings`는 `string[]` 경고만 반환하고 점수가 없다. 이 경고를 폐기하지 않고 `TreeEvalResult` 기반 구조화 점수로 승격한다.

## Phase 12 핵심 목표

1. 사람이 만든 골든 주제 픽스처를 `apps/web/evals/fixtures/topics/`에 최소 10개 둔다.
2. 생성 트리에 대해 `coverage / prerequisite / pedagogy / ordering / detail` 5개 점수를 0~1로 산출한다.
3. `learningTreeQualityWarnings`의 모든 경고를 `TreeEvalResult.failures`의 `warn` 항목으로 흡수한다.
4. 점수 산출은 LLM 호출 없이 결정적 규칙으로 구현해 CI 무비용을 유지한다.
5. `npm run eval:tree`가 픽스처별 점수표와 전체 평균을 출력한다.
6. 이후 모든 개선(Phase 13~18)이 "감"이 아니라 점수 변화로 측정되게 한다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-tree-eval-contract-and-scope.md](./00-tree-eval-contract-and-scope.md) | eval 계약, 점수 정의, RED 기준 고정 | P0 |
| 1 | [01-golden-topic-fixtures.md](./01-golden-topic-fixtures.md) | 골든 주제 픽스처 스키마와 10개 작성 | P0 |
| 2 | [02-tree-eval-scoring-engine.md](./02-tree-eval-scoring-engine.md) | `evaluateLearningTree`와 5개 점수 규칙 구현 | P0 |
| 3 | [03-quality-warnings-to-failures.md](./03-quality-warnings-to-failures.md) | `learningTreeQualityWarnings` → `failures` 흡수 | P0 |
| 4 | [04-eval-tree-cli-runner.md](./04-eval-tree-cli-runner.md) | `npm run eval:tree` 점수표 출력 runner | P1 |
| 5 | [05-phase12-docs-and-quality-gate.md](./05-phase12-docs-and-quality-gate.md) | 문서, baseline 점수 기록, 최종 품질 gate | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 00. [00-tree-eval-contract-and-scope.md](./00-tree-eval-contract-and-scope.md) - Tree eval 계약과 RED 기준 고정
- [x] 01. [01-golden-topic-fixtures.md](./01-golden-topic-fixtures.md) - 골든 주제 픽스처 스키마와 10개 작성
- [x] 02. [02-tree-eval-scoring-engine.md](./02-tree-eval-scoring-engine.md) - `evaluateLearningTree` 채점 엔진 구현
- [x] 03. [03-quality-warnings-to-failures.md](./03-quality-warnings-to-failures.md) - quality warnings를 failures로 흡수
- [x] 04. [04-eval-tree-cli-runner.md](./04-eval-tree-cli-runner.md) - `eval:tree` CLI runner와 점수표
- [x] 05. [05-phase12-docs-and-quality-gate.md](./05-phase12-docs-and-quality-gate.md) - 문서와 최종 품질 gate 정리

## 범위 요약

### 포함

- `evals/fixtures/topics/` 골든 픽스처와 `TreeEvalFixture` 타입
- `evaluateLearningTree(tree, fixture): TreeEvalResult`와 5개 점수 규칙
- `learningTreeQualityWarnings` 경고의 `failures` 흡수와 중복 경로 제거
- `npm run eval:tree` 점수표 runner와 baseline 점수 기록
- 결정적(LLM 무호출) 채점

### 제외

- LLM judge 기반 채점(후속, nightly 전용)
- 프롬프트/모델 자체 개선(점수는 측정만 하고, 개선은 Phase 13~18에서 수행)
- 문서 기반 트리 전용 평가(Phase 16의 `DocumentEvalResult`)
- 노드 상세 `learning_objective`/`mastery_evidence` 생성(Phase 14가 제공, 여기서는 존재 여부만 점수화)

## 의사결정 포인트

- 모든 점수는 0~1로 정규화하고 기존 `clampScore` 규약(`lib/learning/mastery.ts`)을 따른다.
- 개념 매칭은 신규 정규화를 만들지 않고 `lib/concepts/normalize.ts`를 재사용한다.
- `ordering_score`는 `deriveLearningGraphView`의 depth 위상 순서를 기준으로 한다.
- `pedagogy_score`는 Phase 14 필드가 없으면 "미구현"으로 0 처리하지 않고 `failures`의 `warn`으로만 기록해 Phase 간 결합도를 낮춘다.
- `learningTreeQualityWarnings`는 삭제하지 않고 내부적으로 `failures`를 만드는 함수로 재사용하거나 위임한다(하위 호환).

## 완료 조건

Phase 12가 끝나면 `apps/web`에서 `npm run eval:tree`가 10개 픽스처 각각의 `TreeEvalResult`와 전체 평균 점수표를 LLM 호출 없이 출력한다. 또한 기존 `learningTreeQualityWarnings`가 만들던 경고가 모두 `failures`로 나타나고, 트리 생성 경로(`generate-tree.ts`)의 동작은 회귀 없이 유지된다.

최종 검증은 `apps/web`에서 `npm run eval:tree`와 `npm run check`가 통과하는 것으로 고정한다.
