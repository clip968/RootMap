# 01. 노드 Source Span 부착

## 목표

모든 문서 기반 노드에 `DocumentGrounding`(source span + `support_type`)을 붙인다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 5.2

## 관련 파일

- `apps/web/src/types/learning.ts` (`ApiLearningNode.document_context`, `DocumentNodeDetailResponse`)
- `apps/web/src/lib/llm/generate-document-node-detail.ts`
- `apps/web/src/lib/document/processor.ts`
- `apps/web/src/lib/repository/document-repository.ts`

## 구현 작업

### 1. source span 생성

- 문서 노드 상세 생성 시 각 주장(claim)에 대응하는 `source_spans`를 만든다.
- `document_id`, `chunk_id`, `page_start/end`, `quote`, `support_type`을 채운다.
- 기존 `document_context.evidence`(page/section/snippet)를 입력으로 재사용한다.

### 2. support_type 판정

- 문서에 직접 등장하면 `direct`, 문서에서 추론된 것이면 `inferred`로 표시한다.
- `DocumentSourceType`과 매핑해 일관성을 유지한다.

### 3. 저장·전달

- `DocumentGrounding`을 노드 상세/트리 payload에 optional로 포함한다.
- 일반(비문서) 트리에는 영향을 주지 않는다(기존 계약 유지).

## 완료 기준(DoD)

- 문서 노드가 `source_spans`를 가진다.
- `support_type`이 `direct/inferred`로 판정된다.
- 일반 트리 계약은 회귀 없이 유지된다.

## 검증 명령

```bash
cd apps/web
npm run document:detail-smoke
npm run check
```
