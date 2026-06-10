# 02. 그래프 뷰 관계 보존과 Depth 하위 호환

## 목표

`deriveLearningGraphView`가 prerequisite 외 관계도 보존해 뷰에 전달하되, depth와 `recommended_order` 계산은 기존대로 prerequisite만 사용해 회귀를 막는다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 2.1·2.2

## 현재 문제

`deriveLearningGraphView`는 `prerequisites`만 입력으로 받아 depth·children·community를 만든다. `related`, `application_of`, `part_of` 같은 관계는 뷰까지 전달되지 않아 cross-link를 표현할 수 없다.

## 관련 파일

- `apps/web/src/lib/tree/concept-graph.ts` (`deriveLearningGraphView`, `DerivedConceptGraphView`)
- `apps/web/src/lib/tree/bundle-to-api.ts`
- `apps/web/src/types/learning.ts` (`ApiLearningNode`, `ApiTreePayload`)

## 구현 작업

### 1. 뷰에 관계 보존 필드 추가

- `DerivedConceptGraphView`에 `edges: LearningEdgeQuality[]`(또는 경량 관계 목록)를 추가한다.
- 기존 `nodes`, `recommended_order`, `communities`는 유지한다.

### 2. depth 계산 하위 호환

- `deriveDepths`는 prerequisite만 사용한다(변경 없음).
- 비-prerequisite 관계는 depth/순서에 영향을 주지 않음을 smoke로 고정한다.

### 3. API payload 전달

- `bundle-to-api.ts`가 보존된 관계를 `ApiTreePayload`로 전달한다(optional 필드).
- `ApiLearningNode` 또는 payload 레벨에 관계 근거를 노출해 Task 04 UI가 소비할 수 있게 한다.

### 4. cross-community link 표시 준비

- community를 가로지르는 관계를 식별할 수 있도록 community id를 관계에 매핑한다(상세 식별은 Task 03).

## 완료 기준(DoD)

- 뷰가 prerequisite 외 관계를 보존해 전달한다.
- depth와 `recommended_order`가 기존과 동일하다(회귀 없음).
- API payload에 관계 정보가 optional로 포함된다.

## 검증 명령

```bash
cd apps/web
npm run phase6:graph-quality-smoke
npm run check
```
