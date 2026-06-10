# 00. Edge 품질 계약과 범위 고정

## 목표

Phase 13에서 강화할 edge 의미 계약과, 건드리지 않을 하위 호환 경계를 먼저 고정한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 2

## 현재 문제

`apps/web/src/lib/tree/concept-graph.ts`의 `deriveLearningGraphView`는 `prerequisites` 배열만으로 depth·children·community를 계산한다. `LlmConceptEdge`는 `{ from, to, relation_type, reason? }`로 관계는 표현하지만, 근거의 구체성·확신도·blocking 여부가 없어 "왜 이 순서로 공부해야 하는가"를 사용자에게 설명하지 못한다.

## 관련 파일

- `apps/web/src/types/learning.ts` (`ConceptRelationType`, `LlmConceptEdge`)
- `apps/web/src/lib/tree/concept-graph.ts` (`deriveLearningGraphView`)
- `apps/web/src/lib/tree/graph-quality.ts` (`detectPrerequisiteCycles`)
- `apps/web/src/lib/llm/schemas.ts`, `apps/web/src/lib/llm/prompts.ts`

## 구현 작업

### 1. edge 품질 타입 계약 고정

```ts
type LearningEdgeQuality = {
  from: string;
  to: string;
  relation_type: "prerequisite" | "part_of" | "related" | "misconception_of";
  explanation: string;   // 왜 이 관계인가 (필수)
  confidence: number;    // 0~1
  is_blocking: boolean;  // 모르면 다음 개념 이해가 막히는가
};
```

- 기존 `reason`을 `explanation`으로 필수화한다.
- `example_of`, `application_of`도 관계로 보존하되 품질 필드는 위 4종에 우선 적용한다.

### 2. 하위 호환 경계 명시

- depth와 `recommended_order`는 기존대로 `prerequisite` 관계만 사용한다.
- 비-prerequisite 관계는 뷰의 추가 정보로만 전달하고 위상 계산에 넣지 않는다.
- edge 품질 필드가 없는 기존 트리도 화면이 깨지지 않아야 한다.

### 3. 검증 경계 명시

- `is_blocking` 소비(unlock 게이트)는 Phase 15에서 구현한다.
- cycle/역방향 점수화는 Phase 12 `prerequisite_score`/`failures`와 연동한다.

## 완료 기준(DoD)

- `LearningEdgeQuality` 계약이 문서·타입 초안으로 고정된다.
- 하위 호환(보존할 동작)과 변경할 동작이 명확히 구분된다.
- Phase 13에서 건드리지 않을 영역(depth 확장, 자동 edge 삭제)이 적혀 있다.

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-13
```
