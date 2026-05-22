# RootMap Phase 06 구현 계획

이 폴더는 `docs/specs/rootmap_phase_5_spec.md`를 기준으로 **Trustworthy Personalized Learning Graph**를 작업 단위별로 쪼갠 실행 계획을 담는다.

Phase 06은 새 기능을 무작정 늘리는 단계가 아니다. Phase 4에서 만든 개인화 학습 코치 기반을 실제 인증·RLS·테스트·문서 근거·복습 모델·개념 그래프 품질 위에서 신뢰 가능한 제품 흐름으로 고정하는 단계다.

## Phase 06 핵심 목표

1. user A가 user B의 학습 데이터를 읽거나 수정할 수 없음을 실제 Supabase Auth/RLS 경로로 검증한다.
2. 기존 `text user_id` 계층과 Phase 4 UUID `user_id` 계층의 연결 전략을 확정한다.
3. smoke script 중심 검증을 unit, integration, E2E, LLM eval 계층으로 올린다.
4. 문서 기반 생성물이 evidence에 의해 뒷받침되는지 평가한다.
5. 업로드 문서 기반 prompt injection 위험을 fixture와 scanner로 검증한다.
6. 복습 추천을 `review_due_at`과 memory state 기반으로 확장한다.
7. community graph와 learning path를 RootMap의 차별화된 학습 지도 경험으로 묶는다.

## 작업 순서 요약

| 순서 | 계획 문서 | 목적 | 우선순위 |
|---:|---|---|---|
| 0 | [00-local-staging-security-preflight.md](./00-local-staging-security-preflight.md) | production을 건드리기 전에 local/staging 기준과 env target을 고정 | P0 |
| 1 | [01-supabase-auth-rls-negative-test.md](./01-supabase-auth-rls-negative-test.md) | user A/B cross-user 접근 차단을 실제 Supabase Auth/RLS로 검증 | P0 |
| 2 | [02-legacy-user-id-auth-mapping.md](./02-legacy-user-id-auth-mapping.md) | 기존 text user id와 UUID auth user id의 이행·mapping 전략 확정 | P0 |
| 3 | [03-product-grade-test-harness.md](./03-product-grade-test-harness.md) | Vitest/Playwright 기반 테스트 계층과 CI guard 도입 | P1 |
| 4 | [04-recommendation-mastery-unit-tests.md](./04-recommendation-mastery-unit-tests.md) | 추천·mastery·review priority 순수 함수 회귀 테스트 추가 | P1 |
| 5 | [05-evidence-grounding-eval.md](./05-evidence-grounding-eval.md) | 문서 기반 node 설명의 claim-evidence mapping과 groundedness 평가 | P1 |
| 6 | [06-prompt-injection-defense.md](./06-prompt-injection-defense.md) | 업로드 문서 prompt injection fixture, scanner, 위험 flag 추가 | P1 |
| 7 | [07-fsrs-lite-review-scheduler.md](./07-fsrs-lite-review-scheduler.md) | `review_due_at`과 memory state 기반 복습 scheduler 도입 | P2 |
| 8 | [08-explainable-personalization-ui.md](./08-explainable-personalization-ui.md) | 추천 이유를 실제 점수·오답·due date·선수지식 근거로 구체화 | P2 |
| 9 | [09-concept-graph-quality-community-map.md](./09-concept-graph-quality-community-map.md) | concept merge, prerequisite DAG, community map, learning path 품질 강화 | P2 |
| 10 | [10-phase6-docs-runbook-quality-gate.md](./10-phase6-docs-runbook-quality-gate.md) | 보안·평가·학습 과학·배포 runbook과 최종 완료 조건 정리 | P2 |

## 진행 체크리스트

> 작업을 완료할 때마다 해당 항목을 `[x]`로 바꿔 진행 상황을 추적한다.

- [ ] 00. [00-local-staging-security-preflight.md](./00-local-staging-security-preflight.md) - local/staging 기준과 env target 고정
- [ ] 01. [01-supabase-auth-rls-negative-test.md](./01-supabase-auth-rls-negative-test.md) - user A/B cross-user 접근 차단 검증
- [ ] 02. [02-legacy-user-id-auth-mapping.md](./02-legacy-user-id-auth-mapping.md) - text user id와 UUID auth user id 연결 전략 확정
- [ ] 03. [03-product-grade-test-harness.md](./03-product-grade-test-harness.md) - 정식 테스트 계층과 CI guard 도입
- [ ] 04. [04-recommendation-mastery-unit-tests.md](./04-recommendation-mastery-unit-tests.md) - 추천·mastery·review priority unit test 추가
- [ ] 05. [05-evidence-grounding-eval.md](./05-evidence-grounding-eval.md) - claim-evidence mapping과 groundedness 평가
- [ ] 06. [06-prompt-injection-defense.md](./06-prompt-injection-defense.md) - prompt injection fixture, scanner, 위험 flag 추가
- [ ] 07. [07-fsrs-lite-review-scheduler.md](./07-fsrs-lite-review-scheduler.md) - FSRS-lite 복습 scheduler 도입
- [ ] 08. [08-explainable-personalization-ui.md](./08-explainable-personalization-ui.md) - 설명 가능한 개인화 추천 UI/API 개선
- [ ] 09. [09-concept-graph-quality-community-map.md](./09-concept-graph-quality-community-map.md) - concept graph 품질과 community map 강화
- [ ] 10. [10-phase6-docs-runbook-quality-gate.md](./10-phase6-docs-runbook-quality-gate.md) - 문서·runbook·최종 완료 조건 정리

## 범위 요약

### 포함

- local/staging 우선 검증 흐름
- Supabase Auth/RLS negative test
- direct Postgres role과 route-level `user_id` filter audit
- 기존 text user id와 UUID user id mapping 또는 migration 전략
- Vitest/Playwright 기반 테스트 체계
- LLM evidence-grounding eval
- prompt injection red-team fixture와 방어 pipeline
- FSRS-lite review scheduler
- 설명 가능한 추천 이유
- concept graph quality, merge workflow, prerequisite DAG, community map
- 보안·평가·학습 과학·배포 문서

### 제외

- production DB에서 먼저 위험한 cross-user mutation 테스트를 수행하는 방식
- 완전한 Deep Knowledge Tracing 모델 학습
- 대규모 ML 기반 adaptive scheduler
- 자유 질의응답형 RAG 챗봇 전체 구현
- graph database로의 전체 마이그레이션
- auth provider UI 전체 재설계

## 의사결정 포인트

- RLS live test의 target은 production이 아니라 local/staging 또는 production-like Supabase를 기본값으로 둔다.
- 기존 `text user_id`는 단기적으로 mapping table을 우선 검토하고, 장기적으로 UUID migration을 별도 작업으로 분리한다.
- 테스트 runner는 Vitest를 먼저 도입하고, Playwright는 최소 E2E 흐름부터 시작한다.
- LLM eval은 작은 fixture만 CI에 넣고, 비용이 큰 regression set은 수동 또는 scheduled 실행으로 분리한다.
- prompt injection 탐지는 초기에는 hard block보다 위험 flag와 검증 결과 저장을 기본값으로 둔다.

## 완료 조건

`docs/specs/rootmap_phase_5_spec.md` 8장 완료 조건을 만족한다. 특히 user A token으로 user B의 Phase 4 데이터에 접근할 수 없고, production path에서 `DEFAULT_USER_ID`가 사용되지 않으며, 문서 기반 node 설명에 claim-evidence mapping이 있고, prompt injection fixture를 따르지 않으며, `review_due_at` 기반 복습 추천과 community graph 학습 경로가 동작해야 한다.
