# 04. Unlock 게이트와 복습 우선순위 반영

## 목표

Phase 13의 `is_blocking` prerequisite을 소비해 다음 노드 unlock을 게이트하고, `QuestionAttempt` 기록을 복습 우선순위에 반영한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 4.3·4.5

## 관련 파일

- `apps/web/src/lib/recommendation/review-priority.ts` (`calculateReviewPriorityScore`)
- `apps/web/src/lib/recommendation/personalized.ts`
- `apps/web/src/lib/learning/study-session.ts` (Task 01)
- `apps/web/src/lib/tree/concept-graph.ts` (Phase 13 관계 보존)

## 구현 작업

### 1. unlock 게이트

- 노드의 `is_blocking=true` prerequisite이 모두 `known`(또는 임계 confidence) 상태여야 unlock한다.
- 미충족이면 세션에서 해당 prerequisite을 먼저 추천한다.
- blocking이 아닌 prerequisite은 unlock을 막지 않는다(권장만).

### 2. 우선순위 반영

- `QuestionAttempt`의 정답률·`self_confidence`·`hint_used`를 복습 우선순위 신호로 추가한다.
- 기존 가중합 구조(`calculateReviewPriorityScore`)를 유지하고 새 신호를 작은 가중치로 더한다(설명 가능성 유지).

### 3. 회귀 방지

- 기존 추천/복습 결과가 크게 흔들리지 않도록 가중치를 보수적으로 둔다.
- 변경 전후 추천 순서 차이를 smoke로 확인한다.

## 완료 기준(DoD)

- blocking prerequisite 미충족 노드는 unlock되지 않는다.
- `QuestionAttempt` 신호가 우선순위에 반영된다.
- 추천/복습 결과 회귀가 smoke로 확인된다.

## 검증 명령

```bash
cd apps/web
npm run phase4:review-smoke
npm run phase4:personalized-smoke
```
