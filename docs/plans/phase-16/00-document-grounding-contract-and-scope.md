# 00. 문서 근거성 계약과 범위 고정

## 목표

Phase 16에서 강화할 문서 근거성 계약을 고정하고, 기존 evidence 자산 재사용 경계와 OCR 비도입 방침을 명확히 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 5
- `docs/llm-evaluation.md`

## 현재 문제

문서 기반 트리는 업로드(Vercel)와 처리(별도 runner)가 분리되어 있고, `ApiLearningNode.document_context.evidence`가 페이지·섹션·snippet을 제공하지만 노드 단위 근거(source span)와 "근거 vs 보강" 구분, RAG 지표가 없다.

## 관련 파일

- `apps/web/src/lib/evaluation/evidence-grounding.ts` (`evaluateEvidenceGrounding`)
- `apps/web/src/types/learning.ts` (`DocumentSourceType`, `ApiLearningNode.document_context`)
- `apps/web/src/lib/document/` (`extract-pdf.ts`, `extract-text.ts`, `processor.ts`)
- `apps/web/src/lib/llm/generate-document-node-detail.ts`

## 구현 작업

### 1. 근거 타입 계약 고정

```ts
type DocumentGrounding = {
  node_id: string;
  source_spans: Array<{
    document_id: string;
    chunk_id: string;
    page_start?: number;
    page_end?: number;
    quote: string;
    support_type: "direct" | "inferred";
  }>;
};

type DocumentEvalResult = {
  context_precision: number;
  context_recall: number;
  faithfulness: number;
  unsupported_claims: string[];
  source_span_errors: string[];
};
```

### 2. 매핑·재사용 경계

- `support_type`(`direct/inferred`)을 기존 `DocumentSourceType`(`explicit/inferred/generated`)과 매핑한다.
- `faithfulness`는 기존 `groundedness_score`를 일반화해 재사용한다.
- 기존 `document_context.evidence`를 버리지 않고 source span의 입력으로 쓴다.

### 3. 비도입·제한 명시

- 스캔본 OCR은 도입하지 않는다.
- LLM judge 평가는 수동/nightly로만 실행한다.

## 완료 기준(DoD)

- `DocumentGrounding`, `DocumentEvalResult` 계약이 고정된다.
- citation correctness vs faithfulness 분리 방침이 적힌다.
- OCR 비도입·LLM judge 제한이 명시된다.

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-16
```
