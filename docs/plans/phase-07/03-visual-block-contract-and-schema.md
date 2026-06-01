# 03. Visual Block 계약과 Schema

## 목표

8개 visual skill을 모두 표현할 수 있는 TypeScript 타입과 Zod schema를 추가하고, 기존 detail JSON과 호환되도록 API 계약을 확장한다.

## 관련 명세

- `visual-learning-detail-spec.md` Visual Skill System
- `visual-learning-detail-spec.md` Visual Block Types
- `visual-learning-detail-spec.md` Data Model Changes
- `visual-learning-detail-spec.md` Risks R1, R2, R4

## 구현 작업

### 1. visual block 타입 파일 추가

- `apps/web/src/lib/visualization/visual-block-schema.ts`를 추가한다.
- 다음 타입을 정의한다.
  - `VisualDecision`
  - `LinearSpaceVisualBlock`
  - `MappingTableVisualBlock`
  - `FlowPipelineVisualBlock`
  - `TimelineVisualBlock`
  - `LayerStackVisualBlock`
  - `TreeGraphVisualBlock`
  - `StateMachineVisualBlock`
  - `CompareMatrixVisualBlock`
  - `VisualBlock`
- `VisualBlock`은 `type` 필드를 기준으로 discriminated union으로 정의한다.

### 2. Zod schema 추가

- 각 visual block schema는 필수 필드 누락 시 validation error가 나도록 한다.
- annotation은 최대 3개로 제한한다.
- `linear_space.highlighted_ranges.length`는 1개 이상 4개 이하로 제한한다.
- `mapping_table.columns.length`와 각 row length가 맞지 않으면 validation error를 낸다.
- `tree_graph.edges.from/to`와 `state_machine.transitions.from/to`가 존재하지 않는 id를 참조하면 validation error를 낸다.
- unknown block type은 파서에서 실패시키되, API 응답 변환 단계에서는 empty fallback으로 처리할 수 있게 helper를 둔다.

### 3. detail 응답 타입 확장

- `apps/web/src/types/learning.ts`의 `NodeDetailResponse`에 다음 필드를 추가한다.
  - `visual_decision?: VisualDecision`
  - `visual_blocks?: VisualBlock[]`
- `apps/web/src/lib/services/node-detail.ts`의 `ApiNodeDetailResponse`에도 동일 필드를 추가한다.
- `toApiBody`는 `d.visual_blocks ?? []`를 반환한다.
- `responseFromStoredConcept`는 `visual_decision.skill = "none"`과 `visual_blocks: []`를 반환한다.

### 4. LLM schema와 parser 확장

- `apps/web/src/lib/llm/schemas.ts`의 `nodeDetailResponseSchema`에 visual fields를 추가한다.
- 기존 LLM 응답이 visual field를 생략해도 parse되도록 default를 둔다.
- `parseNodeDetailResponse`는 expected node id 검증을 유지한다.
- 문서 기반 detail schema에도 동일한 visual fields를 optional로 추가한다.

### 5. unit-level contract 검증

- `apps/web/scripts/smoke-phase7-visual-block-schema.ts`를 추가한다.
- 8개 valid block fixture가 통과하는지 검증한다.
- invalid reference, invalid row length, unknown type, too many annotations가 실패하는지 검증한다.
- legacy detail JSON에 visual field가 없어도 `visual_blocks: []`로 정규화되는지 검증한다.

## 완료 기준(DoD)

- 8개 visual skill이 모두 TypeScript 타입과 Zod schema로 표현된다.
- 기존 detail JSON에 visual fields가 없어도 API 응답이 깨지지 않는다.
- invalid visual block은 schema에서 잡힌다.
- 검증 명령: `npx tsx scripts/smoke-phase7-visual-block-schema.ts` (`apps/web`에서 실행)
