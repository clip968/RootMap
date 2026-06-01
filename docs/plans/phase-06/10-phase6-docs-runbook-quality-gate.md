# 10. Phase 06 문서·Runbook·품질 Gate

## 목표

Phase 06에서 구현한 보안, 평가, 학습 과학, 배포 검증 내용을 포트폴리오와 운영 관점에서 설명 가능한 문서로 정리하고 최종 완료 조건을 검증한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 6.9 문서화와 포트폴리오 산출물
- 동일 8장 완료 조건
- 동일 10장 위험과 대응

## 구현 작업

### 1. Security docs

- `docs/security-threat-model.md`에 사용자 데이터 격리, RLS, service key 위험, direct Postgres role 위험을 정리한다.
- `docs/rls-test-plan.md`에 user A/B negative test 절차와 production 보호 규칙을 정리한다.
- RLS smoke가 service key로 실행되면 실패로 간주한다는 기준을 명시한다.

### 2. LLM evaluation docs

- `docs/llm-evaluation.md`에 JSON schema 준수, evidence grounding, unsupported claim, prompt injection fixture 기준을 정리한다.
- small eval과 full eval의 실행 비용과 주기를 구분한다.

### 3. Learning science docs

- `docs/learning-science-rationale.md`에 현재 추천이 rule-based MVP임을 명확히 적는다.
- FSRS-lite는 실제 FSRS 전체 구현이 아니라 due date scheduling을 위한 rule v1이라고 설명한다.
- 장기 목표는 quiz/event history 기반 personalized mastery prediction으로 둔다.

### 4. Deployment runbook

- `docs/deployment-runbook.md`에 local/staging/production env target 차이를 적는다.
- Vercel preview가 staging Supabase를 바라보는 기준을 적는다.
- production에서 RLS negative test를 실행해야 할 때의 승인 조건과 cleanup 기준을 적는다.

### 5. Final gate

- Phase 06 README 체크리스트를 실제 완료 항목만 `[x]`로 바꾼다.
- 각 task별 검증 명령 결과를 마지막 작업 요약에 남긴다.

## 완료 기준(DoD)

- 보안, RLS test, LLM eval, learning science, deployment runbook 문서가 있다.
- Phase 06 완료 조건과 실제 검증 결과가 연결되어 있다.
- README 체크리스트가 완료 상태의 단일 기준으로 동작한다.
- 검증 명령: `npm run phase6:quality` (`apps/web`에서 실행)
