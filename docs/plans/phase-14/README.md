# RootMap Phase 14 구현 계획

이 폴더는 `docs/specs/learning-quality-and-tutoring-spec.md`의 **Section 3 (노드 학습 목표와 숙달 증거)** 와 **Section 6 (퀴즈를 이해 점검답게 강화)** 를 하나의 phase로 묶어 작업 단위로 쪼갠 실행 계획을 담는다.

두 섹션을 합치는 이유는 강결합이기 때문이다. `mastery_evidence`(무엇을 할 수 있어야 하는가)와 `ConceptQuestion`(그것을 검증하는 문항)은 1:1로 대응해야 의미가 있다. 현재 `NodeDetailResponse`는 설명·예시·오개념·`check_questions`를 만들지만 "읽은 다음 무엇을 할 수 있어야 하는가"가 없고, 퀴즈는 정의 암기에 머무를 위험이 크다.

이 phase가 끝나면 RootMap은 "읽을거리 생성기"에서 "공부 단위 생성기"로 바뀐다.

## Phase 14 핵심 목표

1. 각 노드에 `learning_objective`와 `mastery_evidence[]`를 추가한다.
2. `learning_objective`는 `define, explain, apply, compare, debug` 동사 중 하나로 시작한다.
3. 노드 상세 프롬프트를 "설명 생성"에서 "학습 목표 + 검증 가능한 숙달 증거 생성"으로 바꾼다.
4. `ConceptQuestion`(`recall | apply | compare | trace | debug`) 스키마를 도입한다.
5. 각 노드 퀴즈가 해당 노드의 `mastery_evidence`를 최소 1개 검증한다.
6. 기존 `misconception` 노드와 `common_misconceptions`를 distractor·피드백에 재사용한다.
7. Phase 12의 `pedagogy_score`가 위 필드 존재를 점수로 반영한다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-node-contract-and-quiz-scope.md](./00-node-contract-and-quiz-scope.md) | 노드 계약·퀴즈 범위와 하위 호환 고정 | P0 |
| 1 | [01-node-learning-contract-schema.md](./01-node-learning-contract-schema.md) | `learning_objective`·`mastery_evidence` 타입/스키마 | P0 |
| 2 | [02-node-detail-prompt-shift.md](./02-node-detail-prompt-shift.md) | 노드 상세 프롬프트를 학습 목표 중심으로 전환 | P0 |
| 3 | [03-concept-question-schema.md](./03-concept-question-schema.md) | `ConceptQuestion` 5개 유형 스키마 도입 | P0 |
| 4 | [04-misconception-distractors-and-grading.md](./04-misconception-distractors-and-grading.md) | 오개념 distractor와 rubric 채점(`quiz.ts`) | P1 |
| 5 | [05-quality-warnings-and-pedagogy-score.md](./05-quality-warnings-and-pedagogy-score.md) | `nodeDetailQualityWarnings`·`pedagogy_score` 연동 | P1 |
| 6 | [06-phase14-docs-and-quality-gate.md](./06-phase14-docs-and-quality-gate.md) | 문서, 마이그레이션, 최종 품질 gate | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 00. [00-node-contract-and-quiz-scope.md](./00-node-contract-and-quiz-scope.md) - 노드 계약·퀴즈 범위 고정
- [x] 01. [01-node-learning-contract-schema.md](./01-node-learning-contract-schema.md) - `learning_objective`·`mastery_evidence` 스키마
- [x] 02. [02-node-detail-prompt-shift.md](./02-node-detail-prompt-shift.md) - 노드 상세 프롬프트 학습 목표 전환
- [x] 03. [03-concept-question-schema.md](./03-concept-question-schema.md) - `ConceptQuestion` 스키마 도입
- [ ] 04. [04-misconception-distractors-and-grading.md](./04-misconception-distractors-and-grading.md) - 오개념 distractor와 채점
- [ ] 05. [05-quality-warnings-and-pedagogy-score.md](./05-quality-warnings-and-pedagogy-score.md) - quality warnings와 pedagogy_score 연동
- [ ] 06. [06-phase14-docs-and-quality-gate.md](./06-phase14-docs-and-quality-gate.md) - 문서와 최종 품질 gate 정리

## 범위 요약

### 포함

- `NodeLearningContract`(`learning_objective`, `mastery_evidence`) 타입/스키마
- 노드 상세 프롬프트의 학습 목표·숙달 증거 생성 전환
- `ConceptQuestion` 5개 유형 스키마와 `check_questions` 보강
- 오개념 기반 distractor와 rubric 채점(`lib/learning/quiz.ts`)
- `nodeDetailQualityWarnings` 확장과 `pedagogy_score` 연동
- 기존 노드 상세 하위 호환(optional·점진 마이그레이션)

### 제외

- 학습 세션 흐름과 문항 시도 기록(Phase 15)
- 문서 기반 노드 근거성(Phase 16)
- worked_example 시각화(Phase 17)
- 전체 Bloom taxonomy 구현(단순 5개 동사 체계만)
- 딥러닝 기반 knowledge tracing

## 의사결정 포인트

- 동사 체계는 `define, explain, apply, compare, debug` 5개로 시작한다.
- `learning_objective` 동사와 `ConceptQuestion.type`을 정렬한다(`apply→apply`, `compare→compare`, `debug→debug/trace`, `define/explain→recall`).
- 신규 필드는 optional로 추가하고, 없는 기존 상세는 화면이 깨지지 않게 한다.
- DB 스키마 확장(질문 bank 컬럼 등)은 migration·plan 승인 후 진행한다(`AGENTS.md`).
- 오개념 자산(`misconception` 노드, `common_misconceptions`)을 새로 만들지 않고 재사용한다.

## 완료 조건

Phase 14가 끝나면 노드 상세가 `learning_objective`와 `mastery_evidence`를 포함하고, 각 노드 퀴즈가 그 숙달 증거를 검증하는 `ConceptQuestion` 형태로 생성된다. 오개념 distractor가 기존 오개념 자산과 연결되고, Phase 12 `pedagogy_score`가 이를 반영해 baseline 대비 상승한다.

최종 검증은 `apps/web`에서 `npm run node-detail:generation-smoke`, `npm run eval:tree`, `npm run check`가 통과하는 것으로 고정한다.
