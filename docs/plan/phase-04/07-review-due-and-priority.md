# 07. 복습 대상·우선순위

## 목표

복습 필요도(`review_priority_score`)를 계산하고, 복습이 필요한 개념 목록을 반환하는 API를 구현한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 7장 복습 필요도 모델, 7.1 `review_priority_score`
- 동일 12장 `GET /api/reviews/due`
- 동일 5장 시나리오 3, §19 테스트 3

## 구현 작업

### 1. 부분 점수

- `(1 - confidence) * 0.4`
- `recency_decay_score`(장기 미복습)
- `quiz_error_score`
- `prerequisite_importance_score`(현재 학습 목표 트리·노드 컨텍스트와 결합 시 명확히 정의)
- `document_importance_score`(Phase 3 데이터 있을 때)

### 2. `GET /api/reviews/due`

- `review_items`: `concept_id`, `title`, `review_priority_score`, `reasons` 배열
- 사용자 전체 또는 현재 `tree_id` 필터(프로덕트 결정 시 명세와 UI에 맞춤)

### 3. `user_concept_mastery`

- `needs_review` 갱신 규칙(임계값·스케줄 job vs 요청 시 계산)

## 완료 기준(DoD)

- 낮은 confidence·오래된 `last_studied_at`·오답 이력이 있으면 상위에 오는지 시나리오로 검증한다.
- §18 MVP의 “복습 대상 개념 조회 가능”을 충족한다.
