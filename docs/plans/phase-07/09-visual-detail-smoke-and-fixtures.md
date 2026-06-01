# 09. Visual Detail Smoke와 Fixture

## 목표

8개 visual skill과 empty fallback을 자동 검증하는 smoke script와 fixture를 추가한다.

## 관련 명세

- `visual-learning-detail-spec.md` Phase 6. 테스트 및 품질 검증
- `visual-learning-detail-spec.md` Acceptance Criteria
- `visual-learning-detail-spec.md` Risks R1, R2, R4

## 구현 작업

### 1. fixture 구조 추가

- `apps/web/scripts/fixtures/phase7-visual-detail-fixtures.ts`를 추가한다.
- fixture는 LLM 호출 없이 deterministic한 `NodeDetailResponse` 형태로 둔다.
- 각 fixture는 다음 정보를 포함한다.
  - `name`
  - `expectedSkill`
  - `detail`
  - `shouldRender`
- 포함할 fixture:
  - LBA -> `linear_space`
  - page table -> `mapping_table`
  - syscall -> `flow_pipeline`
  - CPU scheduling -> `timeline`
  - VFS stack -> `layer_stack`
  - B-tree -> `tree_graph`
  - process state -> `state_machine`
  - process vs thread -> `compare_matrix`
  - abstract concept -> `none`, `visual_blocks = []`

### 2. schema smoke script 추가

- `apps/web/scripts/smoke-phase7-visual-block-schema.ts`를 추가한다.
- 모든 valid fixture가 schema parse를 통과해야 한다.
- 다음 invalid fixture가 실패해야 한다.
  - unknown visual block type
  - too many annotations
  - mapping table row length mismatch
  - tree graph missing node reference
  - state machine missing state reference
  - compare matrix value length mismatch

### 3. renderer smoke script 추가

- `apps/web/scripts/smoke-phase7-visual-detail-renderers.ts`를 추가한다.
- script는 renderer 분기 helper와 block validation helper를 검증한다.
- CLI option으로 특정 skill만 검증할 수 있게 한다.
  - `--skill linear_space,mapping_table`
  - `--skill flow_pipeline,timeline,layer_stack`
  - `--skill tree_graph,state_machine,compare_matrix`
- 전체 검증은 option 없이 실행한다.

### 4. package script 추가

- `apps/web/package.json`에 다음 script를 추가한다.
  - `phase7:visual-block-schema`
  - `phase7:visual-detail-renderers`
  - `phase7:visual-detail-smoke`
- `phase7:visual-detail-smoke`는 schema smoke와 renderer smoke를 순서대로 실행한다.

### 5. fallback 검증

- legacy detail fixture는 `visual_decision`과 `visual_blocks`가 없다.
- parser 결과 또는 API normalization 결과가 `visual_blocks: []`로 동작해야 한다.
- `visual_decision.skill = "none"`이고 `visual_blocks = []`이면 renderer가 아무것도 표시하지 않고 통과해야 한다.

## 완료 기준(DoD)

- 8개 visual skill fixture가 모두 schema와 renderer smoke를 통과한다.
- invalid fixture는 실패해야 할 위치에서 실패한다.
- legacy detail과 `none` decision fallback이 정상 동작한다.
- 검증 명령: `npm run phase7:visual-detail-smoke` (`apps/web`에서 실행)
