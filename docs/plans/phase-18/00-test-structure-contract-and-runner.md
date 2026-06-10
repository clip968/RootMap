# 00. 테스트 구조와 러너·CI 계약 고정

## 목표

Phase 18의 `tests/` 디렉터리 구조, 러너 선택, CI 분리 계약을 먼저 고정한다. 기존 smoke와의 병행·이전 전략을 명확히 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 8

## 현재 문제

`apps/web/package.json`에는 phase별 smoke와 `scripts/phase6-test-harness.ts`(`unit|integration|e2e|llm-eval|quality` 버킷)가 있고 `test:unit` 등 스크립트도 있지만, Vitest/Playwright 같은 정식 러너가 없어 정식 테스트 구조로 인식되기 어렵다.

## 관련 파일

- `apps/web/package.json` (`test:unit`, `test:integration`, `test:e2e`, `test:llm-eval`)
- `apps/web/scripts/phase6-test-harness.ts`
- `.github/workflows/process-rootmap-document.yml`

## 구현 작업

### 1. 디렉터리 구조 고정

```text
tests/
  unit/        concept-graph, mastery, fsrs-lite, recommendation
  integration/ generate-tree-route, document-pipeline
  e2e/         create-topic-tree, upload-document
  evals/       tree-quality, document-grounding, quiz-quality
```

### 2. 러너 선택

- 단위/통합: Vitest 등 표준 러너 도입 여부를 결정한다(결정 전까지 harness 유지).
- e2e: Playwright 도입 여부를 결정한다.
- 도입 시 정확한 핀 버전을 사용하고 plan 승인 후 의존성을 추가한다(`AGENTS.md`: 의존성/스키마 변경 승인).

### 3. 스크립트 인터페이스 유지

- `test:unit/test:integration/test:e2e/test:llm-eval` 이름은 유지하고 내부 구현만 교체한다.
- 기존 smoke는 즉시 제거하지 않고 병행한다.

### 4. CI 분리 계약

```yaml
lint-build:      npm run check
unit:            npm run test:unit
integration:     npm run test:integration
llm-eval-mocked: npm run test:llm-eval
e2e:             npm run test:e2e
```

- LLM live eval은 nightly/수동 workflow로 분리한다.

## 완료 기준(DoD)

- `tests/` 구조와 러너 선택이 문서화된다.
- 스크립트 인터페이스 유지·smoke 병행 전략이 명시된다.
- CI 분리 계약이 적혀 있다.

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-18
```
