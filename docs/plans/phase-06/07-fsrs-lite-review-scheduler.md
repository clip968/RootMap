# 07. FSRS-lite 복습 Scheduler

## 목표

기존 confidence와 stepwise recency 중심 복습 추천을 `review_due_at`, memory stability, difficulty, retrievability 기반의 rule-based scheduler로 확장한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 2.5 학습 효과 모델의 한계
- 동일 6.4 FSRS-lite 복습 scheduler
- 동일 8장 `review_due_at` 기반 복습 추천 완료 조건

## 구현 작업

### 1. Schema 확장

- `user_concept_mastery`에 memory state 컬럼을 추가한다.
  - `review_due_at`
  - `memory_stability`
  - `memory_difficulty`
  - `retrievability`
  - `last_review_grade`
  - `review_interval_days`
  - `scheduler_version`
- 기본 `scheduler_version`은 `rule_v1`로 둔다.

### 2. Scheduler rule v1

- 정답 또는 긍정 자기평가는 stability를 올리고 difficulty를 낮춘다.
- 오답 또는 부정 자기평가는 stability를 낮추고 difficulty를 올린다.
- retrievability는 마지막 복습 이후 시간과 stability를 이용해 계산한다.
- `review_due_at`은 review grade와 stability를 기준으로 계산한다.
- 복잡한 수식에는 사용자가 이해할 수 있는 주석을 남긴다.

### 3. Recommendation integration

- `review_due_at`이 지난 concept은 review priority를 올린다.
- `overdue_days`와 retrievability를 추천 점수에 반영한다.
- 기존 1일, 7일, 14일 threshold는 fallback 또는 보조 신호로 낮춘다.

### 4. Reason integration

- 추천 이유에 due date와 memory state를 표시한다.
- 예: "복습 예정일을 3일 지났고 retrievability가 낮아졌습니다."
- 사용자가 이해하기 어려운 내부 수식명은 UI에 직접 노출하지 않는다.

## 완료 기준(DoD)

- `review_due_at` 기반 복습 추천이 동작한다.
- scheduler version이 저장된다.
- 낮은 retrievability와 overdue 상태가 review priority에 반영된다.
- 추천 이유가 due date와 memory state를 설명한다.
- 검증 명령: `npm run test:unit -- fsrs-lite review-priority` (`apps/web`에서 실행)
