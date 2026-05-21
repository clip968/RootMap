# RootMap Phase 4 구현 계획

이 폴더는 `docs/specs/rootmap_phase_4_spec.md`를 기준으로 학습 이력·개념 숙련도·개인화 추천·복습·리포트를 작업 단위별로 쪼갠 실행 계획을 담는다.

## Phase 4 핵심 목표

학습 세션과 이벤트를 누적하고, Concept 단위 이해도와 퀴즈 결과를 반영하여 같은 트리라도 사용자별로 다른 다음 학습 행동·복습·리포트를 제안한다.

핵심 판단 기준:

> 같은 주제나 문서를 학습하더라도, 사용자마다 다른 이해 상태를 반영해 다른 학습 경로를 추천할 수 있는가?

## 2026-05-21 Live 인프라 반영 사항

초기 Phase 4 기획 이후 Vercel 배포와 Supabase Postgres/Storage가 추가되었다. 따라서 Phase 4는 기능 구현 전에 [00-live-infra-auth-and-deployment-preflight.md](./00-live-infra-auth-and-deployment-preflight.md)를 먼저 통과해야 한다.

- Vercel production 배포는 `READY`이고 `GET /`, `GET /api/trees`, `GET /api/settings/llm-provider`, `POST /api/documents/upload-url` live smoke가 통과했다.
- Supabase project `RootMap`은 `ACTIVE_HEALTHY`이고 기존 public 테이블 16개가 RLS enabled 상태다.
- Supabase public/storage policy는 현재 0개이며, security advisor는 기존 public 테이블에 `RLS Enabled No Policy`를 보고한다.
- Phase 4 테이블 7개(`learning_sessions`, `learning_events`, `user_concept_mastery`, `quiz_attempts`, `misconception_events`, `recommendation_logs`, `learning_reports`)는 live DB에 아직 없다.
- Supabase Storage bucket `rootmap-documents`는 private으로 존재하고 signed upload URL 생성이 동작한다.
- Vercel Cron route는 배포되어 있지만 live Supabase에는 아직 `pgmq` extension과 `document_processing` queue가 없다.
- 현재 앱은 인증 없이 `DEFAULT_USER_ID`를 쓰지만, Phase 4 신규 기능은 Supabase Auth + UUID `user_id` + RLS 가능 구조를 공식 방향으로 확정했다. 로그인 UI는 최소 MVP로 두고, 세션·퀴즈·리포트 데이터 격리를 우선한다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-live-infra-auth-and-deployment-preflight.md](./00-live-infra-auth-and-deployment-preflight.md) | Vercel/Supabase live 상태, 인증·`user_id`·RLS·env·queue 선행 결정 | P0 |
| 1 | [01-learning-sessions-events-and-mastery-schema.md](./01-learning-sessions-events-and-mastery-schema.md) | `learning_sessions`, `learning_events`, `user_concept_mastery` DDL·Phase 2 연계 | P0 |
| 2 | [02-quiz-misconception-recommendation-report-schema.md](./02-quiz-misconception-recommendation-report-schema.md) | `quiz_attempts`, `misconception_events`, `recommendation_logs`, `learning_reports` DDL 선행 정의 | P0/P1/P2 |
| 3 | [03-session-and-learning-events-api.md](./03-session-and-learning-events-api.md) | 세션 시작·종료, 학습 이벤트 기록 API | P0 |
| 4 | [04-concept-mastery-and-self-assessment.md](./04-concept-mastery-and-self-assessment.md) | 이해도 조회·수정, 자기 평가 반영, 상태·confidence 정책 | P0 |
| 5 | [05-personalized-recommendations-and-tree-api.md](./05-personalized-recommendations-and-tree-api.md) | 추천 점수·선수지식·추천 이유(템플릿), 개인화 트리·추천 API | P0 |
| 6 | [06-quiz-evaluation-and-attempts-api.md](./06-quiz-evaluation-and-attempts-api.md) | 퀴즈 평가(LLM), 시도 저장, mastery·오개념 반영 | P1 |
| 7 | [07-review-due-and-priority.md](./07-review-due-and-priority.md) | `review_priority_score`, 복습 대상 조회 API | P1 |
| 8 | [08-learning-reports-and-llm-prompts.md](./08-learning-reports-and-llm-prompts.md) | 세션 리포트 MVP, 약점 분석, 기간 리포트, 관련 LLM 프롬프트 | P1/P2 |
| 9 | [09-phase4-personalized-ui.md](./09-phase4-personalized-ui.md) | 개인화 트리·추천 패널·Concept 패널·리포트·복습 UI | P1 |
| 10 | [10-phase4-security-quality-and-tests.md](./10-phase4-security-quality-and-tests.md) | 사용자 데이터 격리 선행 게이트, 추천 로그·품질, 명세 테스트·완료 조건 | P0/P2 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [x] 00. [00-live-infra-auth-and-deployment-preflight.md](./00-live-infra-auth-and-deployment-preflight.md) - Vercel/Supabase live 상태, 인증·`user_id`·RLS·env·queue 선행 결정
- [ ] 01. [01-learning-sessions-events-and-mastery-schema.md](./01-learning-sessions-events-and-mastery-schema.md) - `learning_sessions`, `learning_events`, `user_concept_mastery` DDL·Phase 2 연계
- [ ] 02. [02-quiz-misconception-recommendation-report-schema.md](./02-quiz-misconception-recommendation-report-schema.md) - `quiz_attempts`, `misconception_events`, `recommendation_logs`, `learning_reports` DDL 선행 정의
- [ ] 03. [03-session-and-learning-events-api.md](./03-session-and-learning-events-api.md) - 세션 시작·종료, 학습 이벤트 기록 API
- [ ] 04. [04-concept-mastery-and-self-assessment.md](./04-concept-mastery-and-self-assessment.md) - 이해도 조회·수정, 자기 평가 반영, 상태·confidence 정책
- [ ] 05. [05-personalized-recommendations-and-tree-api.md](./05-personalized-recommendations-and-tree-api.md) - 추천 점수·선수지식·추천 이유(템플릿), 개인화 트리·추천 API
- [ ] 06. [06-quiz-evaluation-and-attempts-api.md](./06-quiz-evaluation-and-attempts-api.md) - 퀴즈 평가(LLM), 시도 저장, mastery·오개념 반영
- [ ] 07. [07-review-due-and-priority.md](./07-review-due-and-priority.md) - `review_priority_score`, 복습 대상 조회 API
- [ ] 08. [08-learning-reports-and-llm-prompts.md](./08-learning-reports-and-llm-prompts.md) - 세션 리포트 MVP, 약점 분석, 기간 리포트, 관련 LLM 프롬프트
- [ ] 09. [09-phase4-personalized-ui.md](./09-phase4-personalized-ui.md) - 개인화 트리·추천 패널·Concept 패널·리포트·복습 UI
- [ ] 10. [10-phase4-security-quality-and-tests.md](./10-phase4-security-quality-and-tests.md) - 사용자 데이터 격리, 추천 로그·품질, 명세 테스트·완료 조건


## Phase 4 범위 요약

### 포함

- 학습 세션·세부 이벤트 저장
- Concept 숙련도(`status`, `confidence_score` 등) 및 자기 평가·퀴즈 반영
- 규칙·점수 기반 개인화 추천 순서, 추천 이유(템플릿)
- 복습 대상 판단 및 조회
- 세션 리포트 MVP 및 약점 분석, 선택 기능으로 주간·누적·주제 리포트
- 개인화 트리 조회 및 UI 반영(상태·추천·접기·이유)
- Supabase Postgres/Storage와 Vercel 배포 환경을 전제로 한 사용자 데이터 격리·환경변수·queue 검증

### 제외

명세 3장·22장과 동일: 완전 적응형 알고리즘, 정교한 전체 SRS, 사용자 랭킹, 커뮤니티 추천, 실시간 음성 튜터, 시험 대비 전체 커리큘럼 자동 생성, 장기 예측 ML, 외부 LMS, 교사용 대시보드, ML 추천 모델 학습 등.

## 완료 조건

`rootmap_phase_4_spec.md` 22장 Phase 4 완료 조건 및 18장 MVP 최소 품질 기준을 만족한다. 특히 동일 트리에 대해 사용자 상태에 따라 추천 순서가 달라지고, 추천 이유가 구체적으로 설명되며, 약점 개념 분석과 세션·이벤트·숙련도·퀴즈·복습·리포트 흐름이 끊기지 않아야 한다. 또한 00번 선행 점검의 인증·RLS·Vercel env·Supabase queue 결정이 완료되어야 한다.
