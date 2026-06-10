# RootMap Phase 13 구현 계획

이 폴더는 `docs/specs/learning-quality-and-tutoring-spec.md`의 **Section 2 (트리를 "계층도"에서 "학습 그래프"로)** 를 작업 단위로 쪼갠 실행 계획을 담는다.

Phase 13의 핵심은 트리를 더 화려하게 만드는 것이 아니라 **edge의 의미를 더 똑똑하게** 만드는 것이다. RootMap은 이미 `ConceptRelationType`(prerequisite, part_of, related, misconception_of, example_of, application_of)을 가지지만, `deriveLearningGraphView`는 `prerequisites` 배열만으로 depth·children을 계산한다. 여기에 관계 근거·확신도·blocking 여부를 더하고, transitive reduction과 cross-community link 식별, cycle repair 제안을 붙인다.

## Phase 13 핵심 목표

1. LLM 트리 출력 edge에 `explanation`(필수)·`confidence`·`is_blocking`을 추가한다.
2. `deriveLearningGraphView`가 prerequisite 외 관계도 보존해 뷰에 전달한다(기존 depth 계산은 prerequisite만 사용해 하위 호환 유지).
3. `graph-quality.ts`에 transitive reduction과 cross-community link 식별을 추가한다.
4. `detectPrerequisiteCycles` 결과에 대해 끊을 edge 후보를 제시한다(자동 적용 없음).
5. edge에 마우스를 올리면 관계 근거를 보여준다.
6. 사이클·역방향은 Phase 12의 `TreeEvalResult.failures`(`error`)로 보고된다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-edge-quality-contract-and-scope.md](./00-edge-quality-contract-and-scope.md) | edge 품질 계약과 하위 호환 경계 고정 | P0 |
| 1 | [01-learning-edge-quality-schema.md](./01-learning-edge-quality-schema.md) | `LearningEdgeQuality` 타입/Zod와 LLM 출력 확장 | P0 |
| 2 | [02-graph-view-relation-preservation.md](./02-graph-view-relation-preservation.md) | `deriveLearningGraphView` 관계 보존과 depth 하위 호환 | P0 |
| 3 | [03-graph-repair-and-transitive-reduction.md](./03-graph-repair-and-transitive-reduction.md) | transitive reduction, cross-community, cycle repair 제안 | P1 |
| 4 | [04-edge-rationale-ui.md](./04-edge-rationale-ui.md) | edge hover 근거 노출 UI | P1 |
| 5 | [05-phase13-docs-and-quality-gate.md](./05-phase13-docs-and-quality-gate.md) | 문서, eval 연동, 최종 품질 gate | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 00. [00-edge-quality-contract-and-scope.md](./00-edge-quality-contract-and-scope.md) - edge 품질 계약과 범위 고정
- [x] 01. [01-learning-edge-quality-schema.md](./01-learning-edge-quality-schema.md) - `LearningEdgeQuality` 스키마와 LLM 출력 확장
- [x] 02. [02-graph-view-relation-preservation.md](./02-graph-view-relation-preservation.md) - 그래프 뷰 관계 보존과 하위 호환
- [x] 03. [03-graph-repair-and-transitive-reduction.md](./03-graph-repair-and-transitive-reduction.md) - transitive reduction과 cycle repair
- [x] 04. [04-edge-rationale-ui.md](./04-edge-rationale-ui.md) - edge 근거 hover UI
- [x] 05. [05-phase13-docs-and-quality-gate.md](./05-phase13-docs-and-quality-gate.md) - 문서와 최종 품질 gate 정리

## 범위 요약

### 포함

- `LearningEdgeQuality` 타입과 LLM edge 출력 확장(`explanation`, `confidence`, `is_blocking`)
- `deriveLearningGraphView`의 관계 보존(비-prerequisite 관계 뷰 전달)
- `graph-quality.ts`의 transitive reduction, cross-community link 식별
- `detectPrerequisiteCycles` 기반 cycle repair 후보 제안
- edge hover 근거 UI
- Phase 12 `prerequisite_score`와의 연동

### 제외

- graph database 전체 마이그레이션
- depth 계산을 prerequisite 외 관계로 확장(하위 호환 위해 보류)
- 자동 edge 삭제/수정(제안만 하고 적용하지 않음)
- 노드 학습 계약·퀴즈(Phase 14)
- 학습 세션 unlock 로직 구현(Phase 15가 `is_blocking`을 소비)

## 의사결정 포인트

- depth·`recommended_order` 계산은 기존대로 `prerequisite` 관계만 사용한다(회귀 방지).
- 비-prerequisite 관계(related, application_of 등)는 뷰에 추가 정보로만 전달한다.
- cycle repair는 `confidence`가 가장 낮은 edge를 후보로 제시하되 자동 적용하지 않는다.
- `is_blocking`은 prerequisite 관계에서만 의미를 가지며 Phase 15 unlock 게이트의 입력이다.
- edge 근거가 비어 있으면 UI는 관계 타입만 표시하고 깨지지 않는다.

## 완료 조건

Phase 13이 끝나면 트리 edge가 관계 근거·확신도·blocking 여부를 가지며, UI에서 edge hover로 "왜 이 순서로 공부해야 하는지"를 볼 수 있다. transitive reduction으로 중복 prerequisite가 정리되고, 사이클은 `error`로 보고되며 끊을 후보가 제시된다. depth와 `recommended_order`는 회귀 없이 동일하게 동작한다.

최종 검증은 `apps/web`에서 `npm run phase6:graph-quality-smoke`, `npm run eval:tree`, `npm run check`가 통과하는 것으로 고정한다.
