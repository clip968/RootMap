# 00. Local/Staging 보안 선행 점검

## 목표

Phase 06의 RLS live negative test를 production DB에서 바로 실행하지 않고, local 또는 production-like staging Supabase에서 먼저 재현 가능한 방식으로 돌릴 수 있게 준비한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 2.1~2.2 Phase 4 보안 구조와 RLS 검증 문제
- 동일 6.1 운영 보안 검증
- 동일 9장 Milestone 1 운영 보안 검증

## 구현 작업

### 1. Test target 분리

- `PHASE6_SECURITY_TEST_TARGET` 값을 `local`, `staging`, `production` 중 하나로 명시한다.
- 기본값은 `local` 또는 `staging`으로 둔다.
- `production` target은 별도 확인 문구나 수동 플래그 없이는 실행하지 않게 한다.
- Vercel preview는 가능하면 staging Supabase를 바라보게 한다.

### 2. 환경변수 정리

- local/staging test에 필요한 값을 문서화한다.
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL`
  - `PHASE6_SECURITY_TEST_TARGET`
- service role key는 test user와 seed row 준비에만 사용하고, negative read/write 검증에는 anon/authenticated token을 사용한다.

### 3. Schema parity 확인

- staging DB에 Phase 4 migration이 적용되어 있는지 확인한다.
- 다음 테이블이 모두 있어야 한다.
  - `learning_sessions`
  - `learning_events`
  - `user_concept_mastery`
  - `quiz_attempts`
  - `recommendation_logs`
  - `learning_reports`
- RLS enabled와 owner policy 존재 여부를 test 시작 전에 출력한다.

### 4. Production 보호 규칙

- production target에서는 destructive cleanup을 수행하지 않는다.
- production target에서는 테스트 user email prefix를 명확히 구분한다.
- production target은 별도 runbook과 사용자의 명시 승인 없이는 실행하지 않는다.

## 완료 기준(DoD)

- local/staging/production target 차이가 문서화되어 있다.
- local 또는 staging에서 Phase 4 테이블 존재, RLS enabled, policy 존재 여부를 확인할 수 있다.
- RLS negative test가 service key가 아니라 authenticated user token으로 실행될 준비가 되어 있다.
- production target 보호 규칙이 테스트 스크립트 또는 runbook에 반영되어 있다.
- 검증 명령: `npm run phase6:security-preflight` (`apps/web`에서 실행)
