# 08. Tree Graph, State Machine, Compare Matrix Renderer

## 목표

트리/그래프, 상태 전이, 개념 비교를 각각 `tree_graph`, `state_machine`, `compare_matrix` visual block으로 렌더링한다.

## 관련 명세

- `visual-learning-detail-spec.md` Visual Block Types 6. `tree_graph`
- `visual-learning-detail-spec.md` Visual Block Types 7. `state_machine`
- `visual-learning-detail-spec.md` Visual Block Types 8. `compare_matrix`

## 구현 작업

### 1. TreeGraphDiagram 구현

- `apps/web/src/components/visual-blocks/tree-graph-diagram.tsx`를 추가한다.
- 입력은 `TreeGraphVisualBlock`이다.
- 표시 항목:
  - node label
  - edge direction
  - optional edge label
  - annotation
- 복잡한 force layout은 만들지 않는다.
- small graph는 level-based static layout으로 표시한다.
- edge가 존재하지 않는 node id를 참조하면 schema에서 reject하고 renderer는 해당 block을 숨긴다.
- 12개 node를 넘는 그래프는 compact list fallback으로 표시한다.

### 2. StateMachineDiagram 구현

- `apps/web/src/components/visual-blocks/state-machine-diagram.tsx`를 추가한다.
- 입력은 `StateMachineVisualBlock`이다.
- 표시 항목:
  - state label
  - optional state description
  - transition label
  - annotation
- transition이 참조하는 state id가 없으면 schema에서 reject한다.
- self-loop는 별도 chip으로 표시한다.
- process lifecycle, TCP state, I/O request lifecycle이 읽히는 순서로 표시되도록 static flow layout을 사용한다.

### 3. CompareMatrixDiagram 구현

- `apps/web/src/components/visual-blocks/compare-matrix-diagram.tsx`를 추가한다.
- 입력은 `CompareMatrixVisualBlock`이다.
- 표시 항목:
  - columns
  - criterion
  - values
  - annotation
- 각 row의 `values.length`가 비교 column 수와 맞지 않으면 schema에서 reject한다.
- mobile에서는 criterion을 row heading으로 유지하고 values는 세로 list로 전환한다.

### 4. renderer shell 연결

- `visual-block-renderer.tsx`에서 `tree_graph`, `state_machine`, `compare_matrix`를 분기한다.
- 세 renderer 모두 annotation과 empty guard를 공유한다.

### 5. fixture smoke 추가

- 다음 fixture를 추가한다.
  - B-tree -> `tree_graph`
  - wait-for graph -> `tree_graph`
  - process state -> `state_machine`
  - TCP state -> `state_machine`
  - process vs thread -> `compare_matrix`
  - polling vs interrupt -> `compare_matrix`

## 완료 기준(DoD)

- B-tree fixture가 tree/graph 구조로 렌더링된다.
- process state fixture가 상태와 전이로 렌더링된다.
- process vs thread fixture가 비교표로 렌더링된다.
- 검증 명령: `npx tsx scripts/smoke-phase7-visual-detail-renderers.ts --skill tree_graph,state_machine,compare_matrix` (`apps/web`에서 실행)
