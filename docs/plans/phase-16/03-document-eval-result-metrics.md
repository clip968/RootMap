# 03. DocumentEvalResult RAG 지표

## 목표

문서 트리 전용 RAG 평가 지표(`DocumentEvalResult`)를 산출한다. 기존 `evaluateEvidenceGrounding`을 확장한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 5.4

## 관련 파일

- `apps/web/src/lib/evaluation/evidence-grounding.ts` (`evaluateEvidenceGrounding`, `groundedness_score`)
- `apps/web/src/lib/evaluation/` (신규 `document-eval.ts`)
- `apps/web/scripts/` (신규 `eval-document.ts`)

## 구현 작업

### 1. 지표 산출

```ts
type DocumentEvalResult = {
  context_precision: number;   // 가져온 chunk가 정말 관련 있는가
  context_recall: number;      // 필요한 근거를 빠뜨리지 않았는가
  faithfulness: number;        // 생성 설명이 source span에 의해 지지되는가
  unsupported_claims: string[];
  source_span_errors: string[];
};
```

- `faithfulness`는 `groundedness_score`를 일반화해 계산한다.
- `context_precision/recall`은 source span과 사용된 chunk를 비교해 산출한다.
- `source_span_errors`는 존재하지 않는 chunk/page를 가리키는 span을 모은다.

### 2. 결정적 기본 채점

- 기본 채점은 LLM 호출 없이 어휘 겹침·참조 무결성으로 계산한다(`evaluateEvidenceGrounding` 철학 유지).
- LLM judge 기반 정밀 평가는 옵션(`--judge`)으로 두고 수동/nightly에서만 실행한다.

### 3. citation 분리

- citation correctness(인용이 올바른 위치를 가리키는가)와 faithfulness(주장을 실제 지지하는가)를 별도 점수로 보고한다.

## 완료 기준(DoD)

- `DocumentEvalResult`가 4개 점수 + 2개 목록을 반환한다.
- 기본 채점이 LLM 무호출로 결정적이다.
- source span 참조 오류가 `source_span_errors`로 수집된다.

## 검증 명령

```bash
cd apps/web
npm run eval:document
```
