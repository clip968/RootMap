# Phase 4 완료 체크리스트

이 문서는 `docs/specs/rootmap_phase_4_spec.md` §18 MVP 기준과 §22 완료 조건을 기준으로 Phase 4 산출물을 재현 가능하게 확인하기 위한 체크리스트다.

## 검증 명령

- `npm run phase4:schema-smoke`
- `npm run phase4:session-events-smoke`
- `npm run phase4:mastery-smoke`
- `npm run phase4:personalized-smoke`
- `npm run phase4:quiz-smoke`
- `npm run phase4:review-smoke`
- `npm run phase4:report-smoke`
- `npm run phase4:ui-smoke`
- `npm run phase4:quality-smoke`

## §18 MVP 기준

- 세션 시작·종료와 학습 이벤트 저장: `03-session-and-learning-events-api.md`, `phase4:session-events-smoke`
- Concept 숙련도와 자기 평가 반영: `04-concept-mastery-and-self-assessment.md`, `phase4:mastery-smoke`
- 사용자별 추천 순서 차이와 추천 이유: `05-personalized-recommendations-and-tree-api.md`, `phase4:personalized-smoke`, `phase4:quality-smoke`
- 퀴즈 결과와 오개념 반영: `06-quiz-evaluation-and-attempts-api.md`, `phase4:quiz-smoke`
- 복습 대상 산정: `07-review-due-and-priority.md`, `phase4:review-smoke`
- 세션 리포트와 약점 분석: `08-learning-reports-and-llm-prompts.md`, `phase4:report-smoke`
- 개인화 트리·추천·복습·리포트 UI 연결: `09-phase4-personalized-ui.md`, `phase4:ui-smoke`

## §22 완료 조건

- 같은 트리에서 사용자별 mastery 상태에 따라 추천 첫 노드가 달라진다.
- 이미 아는 선수지식은 개인화 UI에서 접을 수 있고, 추천 엔진은 known prerequisite을 반복 추천하지 않는다.
- 복습 우선순위는 낮은 confidence, 오래된 학습, 오답 기록을 반영한다.
- 약점 분석은 prerequisite gap과 core concept gap을 구분하고 다음 행동을 포함한다.
- 학습 리포트는 강점·약점·다음 추천을 포함하며 단순 로그 나열에 머물지 않는다.
- 추천 노출은 `recommendation_logs`에 저장되고, 추천 클릭은 사용자 소유권 검증 뒤 `clicked`로 갱신된다.
- Phase 4 신규 API는 Supabase Auth 토큰으로 user_id를 확정하고 `DEFAULT_USER_ID`를 새로 사용하지 않는다.
- Phase 4 신규 테이블은 RLS와 owner policy를 포함한 migration으로 정의되어 있다.

## 남은 운영 게이트

- Vercel 환경변수 target 감사는 task 00 기준으로 아직 dashboard 또는 CLI 재확인이 필요하다.
- Supabase advisor의 기존 public table `RLS Enabled No Policy` 경고는 Phase 4 신규 테이블 policy와 별도 정리 대상이다.
- `pgmq` queue는 리포트·퀴즈·복습 작업을 production 비동기로 전환하기 전 적용해야 한다.
