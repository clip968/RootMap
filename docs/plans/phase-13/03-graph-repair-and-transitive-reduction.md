# 03. Transitive Reduction과 Cycle Repair 제안

## 목표

`graph-quality.ts`에 transitive reduction, cross-community link 식별, cycle repair 후보 제안을 추가한다. 자동 삭제·수정은 하지 않고 제안과 보고만 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 2.4

## 관련 파일

- `apps/web/src/lib/tree/graph-quality.ts` (`detectPrerequisiteCycles` 등)
- `apps/web/src/lib/tree/concept-graph.ts`
- `apps/web/src/lib/evaluation/tree-eval.ts` (Phase 12, `failures` 연동)
- `apps/web/scripts/phase6-graph-quality-smoke.ts`

## 구현 작업

### 1. transitive reduction

- prerequisite DAG에서 A→B, B→C가 있을 때 중복 A→C를 약화/표시한다.
- 원본 edge는 보존하고, 시각화용 "reduced" 집합을 별도로 제공한다(데이터 손실 없음).

### 2. cross-community link 식별

- `from`과 `to`가 서로 다른 community에 속하는 `related`/`application_of` edge를 식별해 플래그한다.
- 이 link는 UI에서 별도 스타일로 표시할 수 있게 한다.

### 3. cycle repair 후보

- `detectPrerequisiteCycles`가 반환한 각 사이클에 대해, 사이클 내 `confidence`가 가장 낮은 edge를 "끊을 후보"로 제시한다.
- 자동 적용하지 않고 `{ severity: "error", code: "PREREQUISITE_CYCLE" }` failure와 후보 목록을 함께 보고한다.

### 4. eval 연동

- 위 결과를 Phase 12 `TreeEvalResult.failures`로 흘려 `prerequisite_score`에 반영한다.

## 완료 기준(DoD)

- transitive reduction이 원본을 보존하며 reduced 집합을 제공한다.
- cross-community link가 식별·플래그된다.
- 사이클이 있으면 `error`로 보고되고 끊을 edge 후보가 제시된다.
- graph-quality smoke가 위 3가지를 검증한다.

## 검증 명령

```bash
cd apps/web
npm run phase6:graph-quality-smoke
```
