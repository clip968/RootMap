# 02. Legacy User ID와 Auth UUID Mapping

## 목표

기존 `text user_id` 계층과 Phase 4 UUID `user_id` 계층이 장기적으로 충돌하지 않도록 이행 또는 mapping 전략을 확정한다.

## 관련 명세

- `rootmap_phase_5_spec.md` 2.3 사용자 모델 분리 문제
- 동일 6.2 기존 사용자 모델 이행 전략
- 동일 7장 P0 기존 text user_id와 Phase 4 UUID user_id 이행 전략 확정

## 구현 작업

### 1. Legacy user-owned table audit

- 다음 테이블의 user id 타입과 repository query를 확인한다.
  - `learning_trees`
  - `user_node_progress`
  - `documents`
  - `user_concept_progress`
- 각 route에서 user-owned query가 `userId` filter를 반드시 포함하는지 확인한다.
- `documentId`만 받는 update 함수가 route에서 직접 호출되는지 확인한다.

### 2. Mapping table 설계

- 단기 전략은 `legacy_user_id`와 `auth_user_id` mapping table을 우선 검토한다.
- mapping row는 한 legacy user가 하나의 auth user에 귀속되도록 unique constraint를 둔다.
- 기존 `DEFAULT_USER_ID` 데이터는 개발 seed 또는 특정 auth user 귀속 중 하나로 분류한다.

### 3. UUID migration 판단

- 기존 text user id 컬럼을 바로 UUID로 바꿀 경우의 migration risk를 문서화한다.
- 데이터가 적고 운영 위험이 낮으면 UUID 직접 이행을 선택할 수 있다.
- 운영 데이터가 있거나 route 영향이 크면 mapping table을 먼저 적용한다.

### 4. DEFAULT_USER_ID production guard

- production path에서 `DEFAULT_USER_ID`가 쓰이지 않도록 검색 스크립트 또는 CI guard를 추가한다.
- 허용 예외는 test fixture, seed script, local-only demo path로 제한한다.

## 완료 기준(DoD)

- legacy text user id를 UUID로 이행할지 mapping table을 둘지 결정되어 있다.
- user-owned repository 함수와 route-level call site audit 결과가 문서화되어 있다.
- `DEFAULT_USER_ID` production path 사용이 CI guard로 차단된다.
- 검증 명령: `npm run phase6:user-id-audit` (`apps/web`에서 실행)
