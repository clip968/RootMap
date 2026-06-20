# 00. worked_example 계약과 범위 고정

## 목표

Phase 17에서 추가할 `worked_example` visual block 계약을 고정하고, 기존 8종과의 backward compatibility 경계를 명확히 한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 7

## 현재 문제

`apps/web/src/lib/visualization/visual-block-schema.ts`의 visual block은 8종이 있고 내부 참조 검증도 있지만, "문제가 주어졌을 때 어떻게 푸는지"를 단계별로 보여주는 worked example이 없다. 사용자는 설명을 읽는 데서 끝난다.

## 관련 파일

- `apps/web/src/lib/visualization/visual-block-schema.ts` (`VISUAL_BLOCK_TYPES`, `visualDecisionSchema`, `visualBlockSchema`, `hasRequiredNodeDetailVisual`)
- `apps/web/src/components/visual-blocks/visual-block-renderer.tsx`
- `apps/web/src/lib/llm/prompts.ts`
- `apps/web/scripts/smoke-phase7-visual-block-schema.ts`

## 구현 작업

### 1. 계약 고정

```ts
type WorkedExampleBlock = {
  type: "worked_example";
  title: string;
  problem: string;
  steps: Array<{ label: string; explanation: string; intermediate_value?: string }>;
  final_answer: string;
  common_mistake?: string;
};
```

### 2. backward compatibility 경계

- 기존 8종 스키마·렌더러는 변경하지 않는다.
- `worked_example`은 9번째 skill로만 추가한다.
- `hasRequiredNodeDetailVisual`의 decision.skill == block.type 규칙을 그대로 적용한다.
- visual block이 없는 기존 상세는 영향받지 않는다.

### 3. 개념 매핑 방향 고정

- 시각화 타입을 늘리는 것이 목표가 아니라, 개념별 worked example을 붙이는 것이 목표임을 명시한다.
- 예: 가상 메모리 → linear_space + mapping_table, B-tree → tree_graph + worked_example.

## 코드 정합성 (실제 구조 기반 변경 지점)

> 코드를 읽고 확정한 변경 지점이다. Task 01~04는 아래 지점만 건드리고 기존 8종 동작은 보존한다.

### schema (Task 01) — `lib/visualization/visual-block-schema.ts`

1. `VISUAL_BLOCK_TYPES` 배열에 `"worked_example"` 추가(8개 → 9개).
2. `visualDecisionSchema.skill` z.enum에 `"worked_example"` 추가(`"none"` 앞).
3. `workedExampleVisualBlockSchema`(Zod object) 신규 정의. `steps`는 `.min(1)`, `annotations`는 기존 `annotationsSchema`(최대 3개) 재사용.
4. `visualBlockUnionSchema` discriminated union 배열에 `workedExampleVisualBlockSchema` 추가.
5. `superRefine`에 worked_example 무결성 블록 추가: `steps` 비어있지 않음 + `final_answer` 존재(런타임 보강). 기존 mapping_table/tree_graph/state_machine/compare_matrix refine은 변경하지 않는다.
6. `WorkedExampleBlock` 타입 export. `VisualBlock` union에는 자동 포함됨.

### renderer (Task 02)

7. `components/visual-blocks/worked-example-diagram.tsx` 신규: `problem → steps(label/explanation/intermediate_value) → final_answer → common_mistake` 순서, step 번호 표시, `intermediate_value` 없으면 생략, `common_mistake`는 "자주 하는 실수" 영역으로 분리.
8. `visual-block-renderer.tsx`의 `renderVisualBlockDiagram` 분기에 `worked_example` 추가(기존 `VisualBlockShellDiagram` fallback 앞).
9. `visual-block-utils.ts` 3곳 보강:
   - `VISUAL_BLOCK_LABEL`에 `worked_example: "풀이 예시"`(Record라 미추가 시 타입 에러로 컴파일 실패 → 반드시 추가).
   - `hasRenderableData`의 switch에 `worked_example` case(steps 길이 > 0). switch가 union 전체를 다루므로 미추가 시 타입 누락.
   - `visualBlockSummaryItems`의 switch에 `worked_example` case(steps label 목록 등).

### prompts (Task 03) — `lib/llm/prompts.ts`, `lib/llm/generate-node-detail-visual.ts`

10. 개념-시각화 매핑 가이드와 worked_example 선택 기준(계산/추적형) 추가, 과생성 방지(부적절 시 `should_visualize=false`).

### smoke (Task 04) — `scripts/smoke-phase7-visual-block-schema.ts`, `scripts/fixtures/phase7-visual-detail-fixtures.ts`

11. 하드코딩된 기대값 `8`을 `9`로 갱신할 지점 2곳:
    - `visualBlocksSchema.parse(validBlocks).length === 8` → 9 (validBlocks에 worked_example 1개 추가).
    - `fixtureSkills.size === 8` → 9 (fixture에 worked_example 추가).
12. `phase7:visual-detail-renderers` smoke가 worked_example 렌더링과 invalid fallback을 검증하도록 fixture 추가.

## 완료 기준(DoD)

- `WorkedExampleBlock` 계약이 고정된다.
- 기존 8종 불변·decision-skill 일치 규칙이 명시된다.
- 개념 매핑 방향이 적혀 있다.
- 코드 정합성 섹션에 schema/renderer/utils/prompt/smoke의 변경 지점이 코드 기준으로 확정된다(특히 `VISUAL_BLOCK_LABEL` Record와 utils switch는 미추가 시 컴파일 실패하므로 필수).

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-17
```
