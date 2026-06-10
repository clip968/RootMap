# 01. 순수 로직 단위 테스트

## 목표

순수 로직 모듈을 `tests/unit`의 정식 단위 테스트로 옮긴다. 이 모듈들은 LLM·DB 없이 결정적으로 검증 가능하다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 8.2

## 관련 파일

- `apps/web/src/lib/tree/concept-graph.ts` (`deriveLearningGraphView`, `deriveDepths`)
- `apps/web/src/lib/learning/mastery.ts` (`convertScoreToStatus`, `applySelfAssessment`)
- `apps/web/src/lib/learning/fsrs-lite.ts` (`scheduleFsrsLiteReview`, `calculateRetrievability`)
- `apps/web/src/lib/recommendation/review-priority.ts` (`calculateReviewPriorityScore`)
- `apps/web/tests/unit/` (신규)

## 구현 작업

### 1. concept-graph.test.ts

- depth 계산, children 정렬, community 그룹핑, cycle throw를 검증한다.
- prerequisite만 depth에 영향(Phase 13 하위 호환)을 검증한다.

### 2. mastery.test.ts

- `convertScoreToStatus` 경계(0.75/0.4), `applySelfAssessment` 보정 규칙을 검증한다.

### 3. fsrs-lite.test.ts

- grade별 stability/difficulty/interval 변화, `calculateRetrievability` 감쇠를 검증한다.

### 4. recommendation.test.ts

- `calculateReviewPriorityScore` 가중합과 경계값, 정렬 안정성을 검증한다.

## 완료 기준(DoD)

- 4개 모듈에 대한 단위 테스트가 `tests/unit`에 존재한다.
- 모든 테스트가 LLM·DB 없이 결정적으로 통과한다.
- `npm run test:unit`로 실행된다.

## 검증 명령

```bash
cd apps/web
npm run test:unit
```
