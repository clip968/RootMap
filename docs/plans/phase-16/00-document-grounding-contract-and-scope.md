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

## 코드 정합성 (실제 구조 반영)

> 아래는 현재 코드를 읽고 확정한 사실이다. 구현(Task 01~05)은 이 정합성 규칙을 따른다.

### 3.1 source span 필드 출처

`ApiLearningNode.document_context.evidence`(types/learning.ts)는 실제로 다음만 제공한다.

```ts
evidence: Array<{
  page_start: number | null;
  page_end: number | null;
  section_title: string | null;
  snippet: string;
}>;
```

즉 노출 evidence에는 `chunk_id`가 없다. 따라서 `DocumentGrounding.source_spans`의 각 필드 출처를 다음으로 고정한다.

- `document_id`: 노드의 `document_context.document_id`에서 가져온다.
- `chunk_id`: 노출 evidence에 없으므로 DB 계층 `DocumentEvidence.chunkId`(document-repository.ts, `string | null`)에서 채운다. 값이 없으면 빈 문자열(`""`)로 두고 평가에서 "chunk 미상"으로 취급한다.
- `page_start` / `page_end`: evidence의 동명 필드(`number | null`)를 그대로 쓴다. 계약 타입에서는 optional(`?`)이며 `null`은 생략 또는 그대로 전달한다.
- `quote`: evidence의 `snippet`을 사용한다.
- `support_type`: 아래 3.2 매핑 규칙으로 산출한다.

### 3.2 `support_type` 매핑 규칙 (확정)

기존 `DocumentSourceType`(3종) → 계약 `support_type`(2종) 매핑을 다음으로 고정한다.

| DocumentSourceType | support_type | 의미 |
|---|---|---|
| `explicit` | `direct` | 문서에 직접 등장 |
| `inferred` | `inferred` | 문서에서 추론 |
| `generated` | `inferred` | AI가 보강 생성(직접 근거 아님) |

- `generated`를 `direct`로 올리지 않는다(근거 없는 주장을 근거 있는 것으로 표시하지 않기 위함).
- 역방향(2종→3종) 매핑은 정의하지 않는다. 표시는 항상 3종→2종 단방향이다.

### 3.3 타입 추가 위치와 하위 호환

- `DocumentGrounding` 타입은 `types/learning.ts`에 추가하고, `DocumentNodeDetailResponse`에 **optional** 필드 `document_grounding?: DocumentGrounding`로 얹는다(Phase 14의 `learning_objective`/`mastery_evidence` optional 추가와 동일 패턴).
- 일반(비문서) 트리의 `ApiLearningNode`/`NodeDetailResponse` 계약은 건드리지 않는다.
- 기존 문서 상세(필드 없음)는 화면이 깨지지 않아야 한다(UI는 `document_grounding` 부재 시 기존 evidence 표시로 폴백).

### 3.4 `DocumentEvalResult` 계산 기반

- `faithfulness`: `evaluateEvidenceGrounding`의 `groundedness_score`(claim-evidence 어휘 겹침)를 일반화해 재사용한다.
- `context_precision` / `context_recall`: source span이 가리키는 chunk와 실제 사용된 chunk 집합을 비교해 산출한다.
- `source_span_errors`: 존재하지 않는 chunk/page를 가리키는 span을 모은다(참조 무결성).
- 기본 채점은 LLM 무호출(결정적), `--judge`는 수동/nightly 전용.

## 완료 기준(DoD)

- `DocumentGrounding`, `DocumentEvalResult` 계약이 고정된다.
- citation correctness vs faithfulness 분리 방침이 적힌다.
- OCR 비도입·LLM judge 제한이 명시된다.
- source span 필드 출처와 `support_type` 매핑 표가 코드 구조에 맞게 확정된다.
- 타입 추가 위치(`types/learning.ts`)와 optional 하위 호환 방침이 명시된다.

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-16
```
