# 04. Concept 숙련도·자기 평가

## 목표

사용자별 Concept 이해 상태를 조회·갱신하고, 자기 평가 선택을 `confidence_score`·`status`에 반영한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 12장 `PATCH`/`GET /api/concepts/:conceptId/mastery`
- 동일 6장 개인화 상태 모델, 6.3 confidence 업데이트 기준
- 동일 15.1 자기 평가 반영, 15.3 score→status 변환

## 구현 작업

### 1. `PATCH /api/concepts/:conceptId/mastery`

Request: `status` 또는 `confidence_score`, `source`(예: `self_assessment`).

- §15.1 로직에 따른 clamp·`last_studied_at` 갱신
- `learning_events`에 `self_assessment_updated` 기록(세션 연동 시)

### 2. `GET /api/concepts/:conceptId/mastery`

응답: `title`, `status`, `confidence_score`, `last_studied_at`, `last_quiz_score`, `review_count`, `wrong_count`, `needs_review` 등 명세 예시와 정합

### 3. 서비스 함수

- `getOrCreateMastery(user, concept)`
- `clampScore`, `convertScoreToStatus` 단일 구현체로 퀴즈 태스크와 공유

## 완료 기준(DoD)

- 자기 평가 후 mastery가 기대대로 변하고, GET으로 일관되게 읽힌다.
- 초기 confidence 권장값(§6.2)과 충돌 없이 문서화된다.
