# 06. 퀴즈 평가·시도 API

## 목표

MVP 퀴즈 유형(`short_answer`, `misconception_check`)에 대해 LLM으로 답안을 평가하고, 시도를 저장한 뒤 Concept 숙련도와 오개념 기록을 갱신한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 10장 퀴즈 유형·평가·반영
- 동일 12장 `POST /api/quizzes/attempts`
- 동일 13.1 퀴즈 평가 프롬프트
- 동일 15.2 퀴즈 결과 반영(필요 시 서비스 레이어와 §10.3 의사코드 정합)

## 구현 작업

### 1. LLM 평가

- 입력: concept 제목, 질문, 기대 답, 사용자 답
- 출력 JSON: `is_correct`, `score`, `feedback`, `detected_misconceptions`

### 2. `POST /api/quizzes/attempts`

Request: `session_id`, `tree_id`, `node_id`, `concept_id`, `quiz_type`, 질문·답 필드.

Response: `attempt_id`, 평가 결과, `updated_mastery`.

- `quiz_attempts` insert
- 오개념 있으면 `misconception_events` insert
- mastery 업데이트 후 트랜잭션 또는 보상 트랜잭션 정책
- `learning_events`: `quiz_submitted`

### 3. 이벤트·정책 정리

- 퀴즈 신호가 자기 평가보다 강하다는 §15 전제 반영

## 완료 기준(DoD)

- §19 테스트 케이스 2(오답·오개념·confidence 감소)를 만족한다.
- 외부 LLM으로 전송하는 필드가 최소한으로 제한된다(태스크 10과 합치).
