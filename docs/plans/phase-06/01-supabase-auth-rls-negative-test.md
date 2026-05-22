# 01. Supabase Auth/RLS Negative Test

## 목표

user A token으로 user B의 Phase 4 학습 데이터를 읽거나 수정할 수 없음을 실제 Supabase Auth/RLS 경로로 검증한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 6.1 운영 보안 검증
- 동일 7장 P0 Supabase Auth/RLS live negative test
- 동일 8장 완료 조건의 user A/B 접근 차단

## 구현 작업

### 1. Test user와 seed data

- service role key로 test user A와 test user B를 만든다.
- user B 소유 row를 다음 테이블에 seed한다.
  - `learning_sessions`
  - `learning_events`
  - `user_concept_mastery`
  - `quiz_attempts`
  - `recommendation_logs`
  - `learning_reports`
- seed row에는 테스트 run id를 넣어 cleanup 범위를 명확히 한다.

### 2. Authenticated token 검증

- user A와 user B의 access token을 각각 발급한다.
- user B token으로 user B row를 읽을 수 있는 positive case를 먼저 확인한다.
- user A token으로 user B row를 읽는 요청이 빈 결과 또는 권한 오류로 끝나는지 확인한다.
- user A token으로 user B row를 update/delete/insert conflict 형태로 수정하려는 요청이 차단되는지 확인한다.

### 3. Direct Postgres role audit

- `DATABASE_URL`로 접속한 role 이름을 출력한다.
- role이 owner, service-role, superuser, `BYPASSRLS` 성격인지 확인한다.
- direct Postgres repository path가 RLS를 우회할 수 있으면 route/service layer의 `user_id = authUserId` filter를 별도 필수 검증으로 둔다.

### 4. Policy quality check

- Phase 4 신규 테이블 policy가 `authenticated` role과 `user_id` owner 조건을 갖는지 확인한다.
- policy 성능 개선 후보로 `auth.uid()`를 `(select auth.uid())`로 감싸는 변경 여부를 기록한다.
- RLS가 있더라도 application query에는 `user_id` filter를 유지한다.

## 완료 기준(DoD)

- user B token으로 user B row 접근이 성공한다.
- user A token으로 user B row read/update/delete가 실패하거나 결과 0건으로 제한된다.
- service role key로 negative case를 실행하지 않는다.
- `DATABASE_URL` role과 RLS 우회 가능성이 문서화되어 있다.
- 검증 명령: `npm run phase6:rls-negative-smoke` (`apps/web`에서 실행)
