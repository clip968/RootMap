# RootMap Phase 15 구현 계획

이 폴더는 `docs/specs/learning-quality-and-tutoring-spec.md`의 **Section 4 (공부 흐름을 "읽기"에서 "회상 연습"으로)** 를 작업 단위로 쪼갠 실행 계획을 담는다.

Phase 15의 핵심은 새 시스템을 크게 만드는 것이 아니라, 이미 존재하는 mastery·FSRS-lite·review priority·session/event 저장소 위에 **diagnose → learn → retrieve → feedback → review** 학습 세션을 얇게 얹는 것이다. 공부가 애매한 가장 큰 이유는 사용자가 트리를 본 뒤 알아서 공부해야 하기 때문이며, retrieval practice는 단순 재읽기보다 장기 보존에 유리하다.

## Phase 15 핵심 목표

1. `StudySessionStep` 흐름을 구동하는 세션 서비스를 추가한다.
2. 문항 시도(`QuestionAttempt`)를 기록하고 복습 우선순위 계산에 반영한다.
3. `feedback` 결과를 FSRS-lite grade로 매핑해 `review_due_at`를 갱신한다.
4. Phase 13의 `is_blocking` prerequisite 미충족 노드는 unlock하지 않는다.
5. "오늘의 15분 학습" 진입점을 트리 보기와 분리해 제공한다.
6. 추천 모델은 설명 가능한 rule-based를 유지한다(딥러닝 KT 미도입).

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-study-session-contract-and-scope.md](./00-study-session-contract-and-scope.md) | 세션 흐름 계약과 기존 자산 재사용 경계 | P0 |
| 1 | [01-study-session-service.md](./01-study-session-service.md) | `StudySessionStep` 세션 서비스와 API | P0 |
| 2 | [02-question-attempt-recording.md](./02-question-attempt-recording.md) | `QuestionAttempt` 기록과 스키마 확장 | P0 |
| 3 | [03-feedback-to-fsrs-review.md](./03-feedback-to-fsrs-review.md) | feedback → FSRS-lite grade → 복습 예약 | P0 |
| 4 | [04-unlock-and-review-priority.md](./04-unlock-and-review-priority.md) | `is_blocking` unlock 게이트와 우선순위 반영 | P1 |
| 5 | [05-today-15min-session-ui.md](./05-today-15min-session-ui.md) | "오늘의 15분 학습" UI | P1 |
| 6 | [06-phase15-docs-and-quality-gate.md](./06-phase15-docs-and-quality-gate.md) | 문서, 마이그레이션, 최종 품질 gate | P1 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [ ] 00. [00-study-session-contract-and-scope.md](./00-study-session-contract-and-scope.md) - 세션 흐름 계약과 범위 고정
- [ ] 01. [01-study-session-service.md](./01-study-session-service.md) - `StudySessionStep` 세션 서비스와 API
- [ ] 02. [02-question-attempt-recording.md](./02-question-attempt-recording.md) - `QuestionAttempt` 기록과 스키마 확장
- [ ] 03. [03-feedback-to-fsrs-review.md](./03-feedback-to-fsrs-review.md) - feedback → FSRS-lite grade → 복습 예약
- [ ] 04. [04-unlock-and-review-priority.md](./04-unlock-and-review-priority.md) - unlock 게이트와 복습 우선순위 반영
- [ ] 05. [05-today-15min-session-ui.md](./05-today-15min-session-ui.md) - "오늘의 15분 학습" UI
- [ ] 06. [06-phase15-docs-and-quality-gate.md](./06-phase15-docs-and-quality-gate.md) - 문서와 최종 품질 gate 정리

## 범위 요약

### 포함

- `StudySessionStep`(diagnostic/explain/retrieval/feedback/schedule_review) 흐름
- 세션 서비스와 API(기존 `api/sessions`, `api/events` 확장)
- `QuestionAttempt` 기록과 복습 우선순위 반영
- feedback → `gradeForQuizResult`/`gradeForSelfAssessment` → `scheduleFsrsLiteReview`
- `is_blocking` prerequisite 기반 다음 노드 unlock
- "오늘의 15분 학습" UI 진입점

### 제외

- 딥러닝 기반 knowledge tracing / BKT 전체 구현
- 트리 생성·노드 상세 프롬프트 변경(Phase 14에서 완료)
- 문서 근거성(Phase 16)
- 새 복습 알고리즘 도입(기존 FSRS-lite rule_v1 재사용)
- 멀티 유저 협업/랭킹

## 의사결정 포인트

- 추천·복습은 "정답률 + confidence + 최근성 + prerequisite gap"의 설명 가능한 rule-based 모델을 유지한다.
- `feedback.result`(correct/wrong/partial)는 기존 `gradeForQuizResult`/`gradeForSelfAssessment` 매핑을 재사용한다.
- 다음 노드 unlock 게이트는 Phase 13 `is_blocking` prerequisite 충족으로 판정한다.
- `QuestionAttempt`가 DB 컬럼/테이블 확장을 요구하면 migration·plan 승인 후 진행한다(기존 `quizAttempts` 우선 확장).
- 세션은 기존 `learningSessions`/`learningEvents` 구조를 재사용한다.

## 완료 조건

Phase 15가 끝나면 사용자는 트리 전체를 보지 않고도 "오늘의 15분 학습"에서 진단 → 추천 노드 → 짧은 설명 → 회상 질문 → 피드백 → 복습 예약 흐름을 한 번에 진행할 수 있다. 회상 결과가 FSRS-lite로 다음 복습 시점을 갱신하고, blocking prerequisite을 모르면 다음 노드가 unlock되지 않는다.

최종 검증은 `apps/web`에서 `npm run phase4:session-events-smoke`, `npm run phase4:review-smoke`, `npm run check`가 통과하는 것으로 고정한다.
