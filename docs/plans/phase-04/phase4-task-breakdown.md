# RootMap Phase 4 Task Breakdown

## 목적

`docs/specs/rootmap_phase_4_spec.md`를 실행 가능한 개발 태스크로 변환한 문서다. 각 태스크는 `docs/plans/phase-04/00-*` ~ `10-*` 문서에 상세 계획이 있다.

## Milestone 0: Live 인프라·인증 선행 게이트

### 0. Vercel/Supabase live 상태와 사용자 격리 기준

- Vercel production 배포, live API smoke, Supabase project/table/storage 상태를 Phase 4 시작 기준으로 기록
- `DEFAULT_USER_ID` 제거 또는 유지 범위 결정
- Supabase Auth 사용 여부, `user_id` 타입(`text` vs `uuid`), RLS policy 전략 결정
- Vercel 환경변수 target 감사와 Supabase `pgmq` queue migration 적용 여부 결정

상세: [00-live-infra-auth-and-deployment-preflight.md](./00-live-infra-auth-and-deployment-preflight.md)

## Milestone A: Phase 4 데이터 모델

### A1. 세션·이벤트·숙련도 스키마

- `learning_sessions`, `learning_events`
- `user_concept_mastery`(Phase 2 `user_concept_progress`와의 이행 전략)
- 이벤트 타입(`tree_opened`, `node_opened`, …) 정리
- 00번에서 확정한 `user_id` 타입과 RLS policy 전략을 DDL에 반영

상세: [01-learning-sessions-events-and-mastery-schema.md](./01-learning-sessions-events-and-mastery-schema.md)

### A2. 퀴즈·오개념·로그·리포트 스키마

- `quiz_attempts`, `misconception_events`
- `recommendation_logs`, `learning_reports`
- 기능 구현 우선순위는 명세 §20에 맞춰 퀴즈는 2순위, 추천 로그·리포트는 3순위로 분리
- LLM payload 보존 범위와 Vercel/Supabase 로그 최소화 정책을 DDL 메타데이터 설계에 반영

상세: [02-quiz-misconception-recommendation-report-schema.md](./02-quiz-misconception-recommendation-report-schema.md)

## Milestone B: 세션·이벤트·마스터리 API

### B1. 세션·학습 이벤트 API

- `POST /api/sessions/start`, `POST /api/sessions/:sessionId/end`
- `POST /api/events`
- 세션 요약 필드·지속 시간 저장 정책
- 인증된 user identity 기준으로 `tree_id`/`document_id` 접근 권한 검증

상세: [03-session-and-learning-events-api.md](./03-session-and-learning-events-api.md)

### B2. Concept 숙련도·자기 평가

- `PATCH /api/concepts/:conceptId/mastery`, `GET /api/concepts/:conceptId/mastery`
- §6 개인화 상태 모델, §15 자기 평가·점수 clamp·status 변환

상세: [04-concept-mastery-and-self-assessment.md](./04-concept-mastery-and-self-assessment.md)

## Milestone C: 추천·퀴즈·복습·리포트

### C1. 개인화 추천·트리 API

- `GET /api/trees/:treeId/personalized`
- `GET /api/trees/:treeId/recommendations/personalized`
- §8 추천 점수, 선수지식 처리, §9 추천 이유 템플릿
- 추천 노출은 `recommendation_logs`에 저장하고, 클릭은 `recommendation_clicked` 이벤트와 `clicked` 갱신으로 연결

상세: [05-personalized-recommendations-and-tree-api.md](./05-personalized-recommendations-and-tree-api.md)

### C2. 퀴즈 평가·시도 API

- `POST /api/quizzes/attempts`
- MVP: `short_answer`, `misconception_check`
- §13.1 퀴즈 평가 프롬프트, §10 결과 반영

상세: [06-quiz-evaluation-and-attempts-api.md](./06-quiz-evaluation-and-attempts-api.md)

### C3. 복습 필요도·대상 조회

- `GET /api/reviews/due`
- §7 `review_priority_score` 구성 요소

상세: [07-review-due-and-priority.md](./07-review-due-and-priority.md)

### C4. 학습 리포트

- `POST /api/reports/generate`
- 세션 리포트 MVP, 약점 분석, 선택 기능인 주간·주제·누적 리포트
- `learning_reports` 저장, §16 정책, §13.2·§13.3 프롬프트

상세: [08-learning-reports-and-llm-prompts.md](./08-learning-reports-and-llm-prompts.md)

## Milestone D: UI·보안·검증

### D1. Phase 4 UI

- 개인화 트리, 추천 패널, Concept 상태 패널
- 세션 리포트 화면, 복습 화면

상세: [09-phase4-personalized-ui.md](./09-phase4-personalized-ui.md)

### D2. 보안·품질·테스트

- §21 사용자별 데이터 격리, 민감 로그 최소화
- `recommendation_logs`·클릭 추적, §19·§17 테스트·완료 조건
- Supabase advisor의 RLS policy 경고와 Vercel production smoke를 완료 기준에 포함

상세: [10-phase4-security-quality-and-tests.md](./10-phase4-security-quality-and-tests.md)

## 권장 구현 순서

0. Live 인프라·인증 선행 게이트
1. A1 세션·이벤트·숙련도 스키마
2. A2 퀴즈·오개념·로그·리포트 스키마
3. B1 세션·학습 이벤트 API
4. B2 Concept 숙련도·자기 평가
5. C1 개인화 추천·트리 API
6. C2 퀴즈 평가·시도 API
7. C3 복습 필요도·대상 조회
8. C4 세션 리포트와 약점 분석
9. D1 Phase 4 UI
10. D2 보안·품질·테스트

## Phase 4에서 하지 않을 것

명세 3장 제외 기능과 동일: 완전 적응형 교육·전체 SRS·랭킹·커뮤니티 추천·실시간 음성 튜터·시험 전체 커리큘럼·장기 성취 예측·외부 LMS·교사 대시보드·학습용 ML 모델 학습 등. 추천은 규칙·점수 기반이 우선이다.

---

## 명세 대조 검증(요약)

| 명세 절 | 주요 내용 | 커버하는 태스크 |
|---:|---|---|
| 3 | 포함·제외 | README, 본 문서 마지막 절 |
| 6 | 개인화 상태 모델 | **01**, **04** |
| 7 | 복습 필요도 | **07** |
| 8 | 추천 로직 | **05** |
| 9 | 추천 이유 | **05** |
| 10 | 퀴즈·반영 | **02**, **06** |
| 11 | 데이터 모델 | **01**, **02** |
| 12 | API | **03**~**08** |
| 13 | LLM 프롬프트와 약점 분석 | **06**, **08** |
| 14 | UI | **09** |
| 15 | 상태 업데이트 정책 | **04**, **06** |
| 16 | 리포트 정책과 약점 개념 분석 | **08** |
| 17·18·19 | 품질·MVP·테스트 | **10** |
| 21 | 보안·개인정보 | **00**, **03**~**08**, **10** |
| 22 | 완료 조건 | **10** 및 전 태스크 DoD |
