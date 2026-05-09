# 01. 학습 세션·이벤트·숙련도 스키마

## 목표

Phase 4의 학습 세션, 세부 이벤트, 사용자별 Concept 숙련도를 저장하는 DB 스키마와 repository 기반을 만든다. Phase 2 `user_concept_progress`와의 관계(확장·대체·이행)를 결정하고 반영한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 11.1 `learning_sessions`
- 동일 11.2 `learning_events` 및 `event_type` 목록
- 동일 11.3 `user_concept_mastery`
- 동일 4장, 6장 상태 모델
- Phase 2 스키마: `user_concept_progress` (기존 저장소)

## 구현 작업

### 1. `learning_sessions`

명세 DDL에 맞춰 `user_id`, `tree_id`, `document_id`(nullable), `started_at`, `ended_at`, `duration_seconds`, `summary`(JSONB) 등을 정의한다.

- 트리·문서 삭제 시 동작(`ON DELETE SET NULL` 등) 명세와 일치
- 사용자별 조회 인덱스 고려

### 2. `learning_events`

`session_id` → `learning_sessions` CASCADE, `tree_id`, `node_id`, `concept_id`, `event_type`, `event_payload`(JSONB).

- `event_type`: `tree_opened`, `node_opened`, `node_completed`, `self_assessment_updated`, `quiz_started`, `quiz_submitted`, `recommendation_clicked`, `session_ended`
- `(user_id, session_id, created_at)` 등 조회 패턴용 인덱스

### 3. `user_concept_mastery`

`UNIQUE (user_id, concept_id)`, 필드: `status`, `confidence_score`, `last_studied_at`, `last_quiz_score`, `review_count`, `wrong_count`, `correct_count`, `needs_review`, `mastery_metadata`.

- Phase 2 진행 테이블과 병행 시 중복 정의 방지, 단일 소스 원칙 문서화
- `updated_at` 자동 갱신 트리거 또는 애플리케이션 규약

### 4. Repository 레이어

- 세션 생성·종료·조회
- 이벤트 append
- mastery upsert·단건 조회·사용자별 concept 목록(추천·리포트에서 재사용)

## 완료 기준(DoD)

- 마이그레이션 적용 가능하고 롤백 경로가 정리되어 있다.
- 명세 11.1~11.3 필드·제약이 대응된다.
- `user_concept_mastery`와 Phase 2 진행 데이터 정책이 코드·문서에 명시된다.
