# 00. 학습 세션 계약과 범위 고정

## 목표

Phase 15의 학습 세션 흐름 계약을 고정하고, 새로 만들 부분과 기존 자산을 재사용할 부분을 명확히 나눈다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 4

## 현재 문제

사용자는 트리를 본 뒤 수동으로 공부해야 한다. mastery·FSRS-lite·review priority 구조는 있지만, 이를 묶어 회상 연습 루프로 강제하는 흐름이 없다.

## 관련 파일

- `apps/web/src/lib/learning/fsrs-lite.ts` (`scheduleFsrsLiteReview`, `gradeForQuizResult`, `gradeForSelfAssessment`)
- `apps/web/src/lib/recommendation/review-priority.ts` (`calculateReviewPriorityScore`)
- `apps/web/src/lib/repository/learning-session-repository.ts`
- `apps/web/src/app/api/sessions/**`, `apps/web/src/app/api/events/route.ts`
- `apps/web/src/db/schema.ts` (`learningSessions`, `learningEvents`, `quizAttempts`, `userConceptMastery`)

## 구현 작업

### 1. 세션 스텝 계약 고정

```ts
type StudySessionStep =
  | { type: "diagnostic"; node_id: string; question_id: string }
  | { type: "explain"; node_id: string }
  | { type: "retrieval"; node_id: string; question_id: string }
  | { type: "feedback"; node_id: string; result: "correct" | "wrong" | "partial" }
  | { type: "schedule_review"; node_id: string };
```

### 2. 재사용 경계 명시

- 복습 예약: 기존 `scheduleFsrsLiteReview` 재사용.
- grade 매핑: 기존 `gradeForQuizResult`/`gradeForSelfAssessment` 재사용.
- 우선순위: 기존 `calculateReviewPriorityScore` 재사용·확장.
- 저장: 기존 `learningSessions`/`learningEvents` 재사용.

### 3. 신규 경계 명시

- 세션 스텝 진행을 조율하는 세션 서비스(신규).
- `QuestionAttempt` 기록(스키마 확장 가능, Task 02).
- unlock 게이트(Phase 13 `is_blocking` 소비, Task 04).

## 완료 기준(DoD)

- `StudySessionStep` 계약이 고정된다.
- 재사용/신규 경계가 파일 단위로 구분된다.
- DB 변경 필요 여부가 명시된다(migration·plan 승인 전제).

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-15
```
