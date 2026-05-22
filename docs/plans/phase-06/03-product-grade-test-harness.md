# 03. Product-grade 테스트 체계

## 목표

smoke script 중심 검증을 unit, integration, E2E, LLM eval 계층으로 나누고, Phase 06 이후 회귀를 자동으로 잡을 수 있는 테스트 실행 구조를 만든다.

## 관련 명세

- `rootmap_phase_5_spec.md` 2.4 테스트 체계의 한계
- 동일 6.3 Product-grade 테스트 체계
- 동일 9장 Milestone 2 테스트 기반 정비

## 구현 작업

### 1. Test runner 선택

- 순수 함수와 서비스 로직은 Vitest를 기본 runner로 둔다.
- 브라우저 흐름은 Playwright를 최소 E2E에만 사용한다.
- 기존 smoke script는 즉시 제거하지 않고, 새 테스트와 역할을 분리한다.

### 2. Test command 구성

- `apps/web/package.json`에 Phase 06 테스트 명령을 추가한다.
  - `test:unit`
  - `test:integration`
  - `test:e2e`
  - `test:llm-eval`
  - `phase6:quality`
- CI에서는 빠른 unit/integration을 기본으로 돌리고, LLM eval full set은 수동 또는 scheduled로 분리한다.

### 3. Test fixture 구조

- 사용자 A/B, document fixture, prompt injection fixture, graph fixture를 분리한다.
- fixture 이름에 의도와 expected behavior를 드러낸다.
- 외부 API 비용이 있는 fixture는 small set과 full set을 분리한다.

### 4. Failure reporting

- RLS failure는 어떤 table, 어떤 user, 어떤 operation이 실패했는지 출력한다.
- LLM eval failure는 unsupported claim, missing evidence, schema mismatch를 분리해 출력한다.
- E2E failure는 단계별로 login, upload, tree, recommendation, quiz, report 중 어디서 실패했는지 출력한다.

## 완료 기준(DoD)

- Phase 06 테스트 명령이 `apps/web/package.json`에 정의되어 있다.
- unit, integration, E2E, LLM eval의 책임 범위가 문서화되어 있다.
- CI에서 빠른 테스트와 비용 큰 평가를 분리할 수 있다.
- 검증 명령: `npm run phase6:quality` (`apps/web`에서 실행)
