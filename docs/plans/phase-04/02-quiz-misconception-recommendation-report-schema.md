# 02. 퀴즈·오개념·추천 로그·리포트 스키마

## 목표

퀴즈 시도, 오개념 이벤트, 추천 노출 로그, 학습 리포트를 저장하는 테이블과 repository를 추가한다. DDL은 Phase 4 초기에 함께 정의하되, 기능 구현은 명세 §20 우선순위에 맞춰 퀴즈·오개념은 2순위, 추천 로그·리포트는 3순위로 진행한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 11.4 `quiz_attempts`
- 동일 11.5 `misconception_events`
- 동일 11.6 `recommendation_logs`
- 동일 11.7 `learning_reports` 및 `report_type`

## 구현 작업

### 1. `quiz_attempts`

`quiz_type`, `question`, `expected_answer`, `user_answer`, `is_correct`, `score`, `feedback`, `detected_misconceptions`(JSONB), FK(`session_id`, `tree_id`, `node_id`, `concept_id`).

- LLM 평가 결과와 원문 저장 정책(개인정보·로그 최소화)은 태스크 10과 정합

### 2. `misconception_events`

`quiz_attempt_id`, `misconception_text`, `evidence`, `resolved`, `resolved_at`.

- 퀴즈 제출 후 파이프라인에서 insert

### 3. `recommendation_logs`

`score`, `reasons`(JSONB), `clicked`, `tree_id`, `node_id`, `concept_id`.

- 개인화 추천 API 응답과 동일 구조로 append 가능하게 설계
- `recommendation_clicked` 이벤트 발생 시 해당 로그의 `clicked`를 갱신할 수 있도록 식별자 반환 또는 매칭 정책 정의

### 4. `learning_reports`

`report_type`: `session`, `weekly`, `topic`, `cumulative`; `period_start`/`period_end`, `strengths`/`weaknesses`/`recommendations`(JSONB), `report_json`.

## 완료 기준(DoD)

- 명세 11.4~11.7와 컬럼·FK가 대응한다.
- 퀴즈·추천·리포트 기능 태스크가 이 테이블을 전제로 구현 가능하다.
- 테이블 정의와 실제 기능 구현 우선순위(P1/P2)가 README·task breakdown과 모순되지 않는다.
