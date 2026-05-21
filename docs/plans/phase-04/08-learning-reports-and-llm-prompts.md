# 08. 학습 리포트·LLM 프롬프트

## 목표

세션 종료·요청 시 학습 리포트를 생성하고 `learning_reports`에 저장한다. Phase 4 MVP에서는 세션 리포트와 약점 개념 분석을 우선 구현하고, 주간·주제·누적 리포트는 선택 기능으로 확장한다.

## 관련 명세

- `rootmap_phase_4_spec.md` 16장 리포트 생성 정책
- 동일 12장 `POST /api/reports/generate`
- 동일 13.2 세션 리포트, 13.3 약점 분석, 13.4 개인화 트리 요약(선택)
- 동일 시나리오 4, §19 테스트 5
- 동일 22장 완료 조건의 “약점 개념을 분석할 수 있다”

## 구현 작업

### 1. 데이터 수집

- 세션 기간의 `learning_events`, mastery 변화, `quiz_attempts`, `misconception_events`

### 2. `POST /api/reports/generate`

Request: `report_type`, `session_id`(또는 기간 필드). Response: `report_id`, `title`, `summary`, `strengths`, `weaknesses`, `recommendations`.

- 세션 리포트는 MVP 범위, `weekly`/`topic`/`cumulative`는 우선순위에 따라 단계적 구현(README P1/P2)

### 3. LLM

- §13.2 JSON 스키마 준수, 과장 금지 지시
- §13.3 약점 분석은 세션 리포트 생성 단계에 포함하거나 내부 서비스 함수로 분리
- 약점 분석 산출물은 `weak_concepts`, `reason`, `priority`, `recommended_action`, `summary`를 보존

### 4. 약점 분석

- `concept_mastery_records`, `quiz_attempts`, `misconception_events`, 트리 컨텍스트를 모아 prerequisite gap과 core concept gap을 구분
- 반복 오답·오개념·낮은 confidence를 우선순위에 반영
- 리포트의 `weaknesses`와 `recommendations`에 연결하고, 필요 시 `report_json`에 원본 구조 저장

### 5. 세션 종료 연동

- 태스크 03의 `end`에서 `generate_report: true` 시 이 로직 호출

## 완료 기준(DoD)

- 세션 리포트가 단순 로그 나열이 아니라 “다음 행동”을 포함한다(§17 품질 기준).
- §18 MVP “세션 리포트 생성 가능” 충족.
- §22 완료 조건 “약점 개념을 분석할 수 있다”를 테스트 가능한 산출물로 충족한다.
- 검증 명령: `npm run phase4:report-smoke` (`apps/web`에서 실행)
