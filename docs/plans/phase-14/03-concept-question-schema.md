# 03. ConceptQuestion 스키마 도입

## 목표

퀴즈를 노드 타입이 아니라 각 개념의 mastery evidence를 검증하는 도구로 재정의한다. `ConceptQuestion`(5개 유형) 스키마를 도입하고 `check_questions`를 보강한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 6.2·6.3

## 관련 파일

- `apps/web/src/types/learning.ts` (`NodeDetailResponse.check_questions`)
- `apps/web/src/lib/llm/schemas.ts`
- `apps/web/src/lib/llm/prompts.ts`
- `apps/web/src/lib/learning/quiz.ts`

## 구현 작업

### 1. 타입/스키마

```ts
type ConceptQuestion = {
  id: string;
  node_id: string;
  type: "recall" | "apply" | "compare" | "trace" | "debug";
  prompt: string;
  expected_answer: string;
  rubric: string[];
  misconception_target?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
};
```

- Zod로 `type` enum, `difficulty` 범위(1~5), `rubric` 최소 1개를 검증한다.

### 2. mastery evidence 연결

- 각 노드 퀴즈는 해당 노드의 `mastery_evidence`를 최소 1개 검증해야 한다.
- 프롬프트가 evidence ↔ question 매핑을 만들도록 지시한다.

### 3. 유형 분포

- 한 노드에서 `recall`만 나오지 않도록, 가능한 경우 `apply`/`compare`/`trace`/`debug` 중 하나 이상을 포함하게 한다.
- 좋은 CS 문항 유형(구분·적용·추적·반례·디버깅)을 프롬프트 예시로 제공한다.

### 4. 하위 호환

- 기존 `check_questions`(`{question, answer}`)는 유지하되, `ConceptQuestion`으로 점진 대체/보강한다.

## 완료 기준(DoD)

- `ConceptQuestion` 스키마가 도입되고 5개 유형을 검증한다.
- 각 노드 퀴즈가 `mastery_evidence`를 최소 1개 검증한다.
- 정의 암기(recall) 편중이 완화된다.

## 검증 명령

```bash
cd apps/web
npm run node-detail:generation-smoke
npm run check
```
