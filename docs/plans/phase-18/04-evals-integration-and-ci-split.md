# 04. Eval 통합과 CI 분리

## 목표

Phase 12·14·16에서 만든 eval을 `tests/evals`로 통합하고, CI를 lint-build / unit / integration / llm-eval-mocked / e2e로 분리한다. Phase 18의 최종 품질 gate다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 8.3·8.4 (Acceptance Criteria)

## 관련 파일

- `apps/web/tests/evals/` (신규: tree-quality, document-grounding, quiz-quality)
- `apps/web/src/lib/evaluation/tree-eval.ts`, `document-eval.ts`
- `apps/web/scripts/eval-tree.ts`, `eval-document.ts`
- `apps/web/package.json`
- `.github/workflows/` (신규 CI workflow)

## 구현 작업

### 1. eval 통합

- `tree-quality.eval.ts`(Phase 12), `document-grounding.eval.ts`(Phase 16), `quiz-quality.eval.ts`(Phase 14)를 `tests/evals`에 모은다.
- 기본은 mocked/LLM 무호출, live judge는 옵션으로 둔다.

### 2. CI 분리

```yaml
lint-build:      npm run check
unit:            npm run test:unit
integration:     npm run test:integration
llm-eval-mocked: npm run test:llm-eval
e2e:             npm run test:e2e
```

- 위 job을 GitHub Actions workflow로 정의한다.
- LLM live eval(`eval:tree:live`, `eval:document:judge`)은 nightly/수동 workflow로 분리한다.

### 3. 문서·체크리스트

- 테스트 구조와 CI 실행 방법을 문서화한다.
- README 체크리스트를 완료 상태로 갱신하고 task 단위로 커밋·push한다.

## 완료 기준(DoD)

- 3개 eval이 `tests/evals`에 통합되고 `test:llm-eval`(mocked)로 실행된다.
- CI가 5개 job으로 분리된다.
- LLM live eval이 nightly/수동으로 분리된다.
- `npm run test:unit`, `npm run test:integration`, `npm run check`가 통과한다.

## 검증 명령

```bash
cd apps/web
npm run test:unit
npm run test:integration
npm run test:llm-eval
npm run check
```
