# 01. 노드 학습 계약 스키마

## 목표

`NodeDetailResponse`(및 문서 노드 상세)에 `learning_objective`와 `mastery_evidence[]`를 추가하고, LLM 스키마가 이를 검증하게 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 3.2·3.3

## 관련 파일

- `apps/web/src/types/learning.ts` (`NodeDetailResponse`, `DocumentNodeDetailResponse`)
- `apps/web/src/lib/llm/schemas.ts`
- `apps/web/src/lib/services/node-detail.ts`
- `apps/web/src/components/detail-learning-blocks.tsx`

## 구현 작업

### 1. 타입 확장

- `NodeDetailResponse`에 `learning_objective?: string`, `mastery_evidence?: string[]`를 추가한다.
- `DocumentNodeDetailResponse`에도 동일 필드를 추가한다.

### 2. Zod 스키마

- `learning_objective`는 비어 있지 않고, 허용 동사(`define|explain|apply|compare|debug`)로 시작하는지 검증한다.
- `mastery_evidence`는 1개 이상, 각 항목은 검증 가능한 행동 진술이어야 한다.

### 3. 저장·렌더링

- `node-detail.ts`가 신규 필드를 `detailJson`에 저장한다.
- `detail-learning-blocks.tsx`가 "이 노드를 이해했다는 증거" 블록을 렌더링한다.
- 필드가 없는 기존 상세는 블록을 숨기고 화면이 깨지지 않게 한다.

## 완료 기준(DoD)

- 두 상세 타입에 `learning_objective`, `mastery_evidence`가 추가된다.
- Zod가 동사 접두와 `mastery_evidence` 최소 개수를 검증한다.
- 신규 필드가 저장·렌더링되고 기존 데이터와 하위 호환된다.

## 검증 명령

```bash
cd apps/web
npm run node-detail:generation-smoke
npm run check
```
