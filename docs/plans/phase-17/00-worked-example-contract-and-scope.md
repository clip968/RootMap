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

## 완료 기준(DoD)

- `WorkedExampleBlock` 계약이 고정된다.
- 기존 8종 불변·decision-skill 일치 규칙이 명시된다.
- 개념 매핑 방향이 적혀 있다.

## 검증 명령

```bash
cd apps/web
git diff -- docs/plans/phase-17
```
