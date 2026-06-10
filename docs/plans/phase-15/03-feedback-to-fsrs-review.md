# 03. Feedback → FSRS-lite Grade → 복습 예약

## 목표

세션 `feedback` 결과를 FSRS-lite grade로 매핑해 `review_due_at`와 mastery를 갱신한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 4.3

## 관련 파일

- `apps/web/src/lib/learning/fsrs-lite.ts` (`scheduleFsrsLiteReview`, `gradeForQuizResult`, `gradeForSelfAssessment`)
- `apps/web/src/lib/learning/mastery.ts` (`convertScoreToStatus`, `applySelfAssessment`)
- `apps/web/src/lib/repository/learning-repository.ts` (`userConceptMastery`)
- `apps/web/src/lib/learning/study-session.ts` (Task 01)

## 구현 작업

### 1. result → grade 매핑

- `correct` → `gradeForQuizResult({ isCorrect: true, score })`
- `wrong` → `gradeForQuizResult({ isCorrect: false, score })` → `again`
- `partial` → `hard` 계열(자기 평가는 `gradeForSelfAssessment` 사용)
- 기존 매핑 함수를 재사용하고 새 규칙을 만들지 않는다.

### 2. 복습 예약

- 매핑된 grade로 `scheduleFsrsLiteReview`를 호출해 `memory_stability`, `memory_difficulty`, `review_due_at`를 갱신한다.
- mastery row(`userConceptMastery`)의 confidence/status를 `convertScoreToStatus` 규약으로 갱신한다.

### 3. retrievability 반영

- `calculateRetrievability`를 사용해 다음 추천/복습 우선순위에 반영한다(Task 04).

## 완료 기준(DoD)

- `feedback.result`가 FSRS-lite grade로 매핑된다.
- 회상 결과가 `review_due_at`와 mastery를 갱신한다.
- 매핑은 기존 함수 재사용으로 결정적이다.

## 검증 명령

```bash
cd apps/web
npm run phase4:review-smoke
npm run check
```
