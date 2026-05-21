# 03. 세션·학습 이벤트 API

## 목표

학습 세션을 시작·종료하고, 세부 학습 행동을 이벤트로 기록하는 HTTP API를 구현한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 12장 `POST /api/sessions/start`, `POST /api/sessions/:sessionId/end`, `POST /api/events`
- 동일 11.1~11.2 저장 구조
- 동일 21장 사용자별 접근 통제

## 구현 작업

### 1. `POST /api/sessions/start`

Request: `tree_id`, `document_id`(optional). Response: `session_id`, `started_at`.

- 인증된 사용자의 `user_id`로 세션 생성
- `tree_id`/`document_id`가 해당 사용자에게 허용되는지 검증

### 2. `POST /api/sessions/:sessionId/end`

Request: `generate_report`(optional). Response: `ended_at`, `duration_seconds`, `report_id`(리포트 생성 시).

- 세션 소유자 검증
- `learning_events`에 `session_ended` 등 정리 이벤트 정책

### 3. `POST /api/events`

Request: `session_id`, `tree_id`, `node_id`, `concept_id`, `event_type`, `event_payload`.

- `event_type` 화이트리스트 검증
- 세션·트리·노드 소유/접근 일관성

## 완료 기준(DoD)

- 명세 요청·응답 형태가 맞고, 다른 사용자 세션·이벤트 조작이 불가능하다.
- 프론트 또는 통합 테스트로 시작→이벤트→종료 흐름이 검증된다.
- 검증 명령: `npm run phase4:session-events-smoke` (`apps/web`에서 실행)
