# 05. eval:document와 품질 Gate

## 목표

`npm run eval:document` runner를 추가하고, 문서 근거성 강화 결과를 문서화한 뒤 최종 품질 gate를 통과시킨다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 5.4·5.6 (Acceptance Criteria)

## 관련 파일

- `apps/web/scripts/eval-document.ts` (신규)
- `apps/web/src/lib/evaluation/document-eval.ts` (Task 03)
- `apps/web/package.json` (scripts)
- `docs/llm-evaluation.md`
- `docs/plans/phase-16/README.md` (체크리스트)

## 구현 작업

### 1. runner

- 문서 픽스처(예: `docs/llm-evaluation.md`의 제안 fixtures)에 대해 `DocumentEvalResult`를 산출·출력한다.
- 기본은 LLM 무호출, `--judge` 옵션은 수동/nightly 전용.
- `error` 수준 문제(source span 참조 오류 등)가 있으면 비정상 종료한다.

### 2. package.json 스크립트

```json
"eval:document": "tsx scripts/eval-document.ts",
"eval:document:judge": "tsx scripts/eval-document.ts --judge"
```

### 3. 문서 업데이트

- `docs/llm-evaluation.md`에 context precision/recall/faithfulness와 citation 분리, 스캔본 정책을 추가한다.
- README 체크리스트를 완료 상태로 갱신하고 task 단위로 커밋·push한다.

## 완료 기준(DoD)

- `npm run eval:document`가 LLM 무호출로 지표를 출력한다.
- `docs/llm-evaluation.md`에 문서 eval 정책이 추가된다.
- `npm run eval:document`, `npm run document:detail-smoke`, `npm run check`가 통과한다.

## 검증 명령

```bash
cd apps/web
npm run eval:document
npm run document:detail-smoke
npm run check
```
