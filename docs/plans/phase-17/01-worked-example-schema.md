# 01. worked_example 타입·스키마·Skill Enum 추가

## 목표

`worked_example`을 기존 8종과 동일한 계약 패턴으로 `VISUAL_BLOCK_TYPES`·`visualDecisionSchema.skill` enum·Zod discriminated union·`superRefine`에 추가한다.

## 관련 명세

- `docs/specs/learning-quality-and-tutoring-spec.md` Section 7.3

## 관련 파일

- `apps/web/src/lib/visualization/visual-block-schema.ts`
- `apps/web/src/types/learning.ts` (`VisualBlock` re-export)

## 구현 작업

### 1. 타입 정의

```ts
type WorkedExampleBlock = {
  type: "worked_example";
  title: string;
  problem: string;
  steps: Array<{
    label: string;
    explanation: string;
    intermediate_value?: string;
  }>;
  final_answer: string;
  common_mistake?: string;
};
```

### 2. 스키마 등록

- `VISUAL_BLOCK_TYPES` 배열에 `worked_example`을 추가한다.
- `visualDecisionSchema.skill` enum에 `worked_example`을 추가한다.
- `workedExampleVisualBlockSchema`(Zod)를 정의하고 `visualBlockUnionSchema` discriminated union에 포함한다.
- `steps`는 최소 1개, `annotations` 규약은 기존 블록과 동일하게 둔다.

### 3. superRefine 무결성

- `steps`가 비어 있지 않은지, `final_answer`가 존재하는지 검증한다.
- 기존 블록(`mapping_table`, `tree_graph` 등)의 superRefine 규칙은 변경하지 않는다.

### 4. 타입 export

- `WorkedExampleBlock` 타입을 export하고 `VisualBlock` union에 자동 포함되게 한다.

## 완료 기준(DoD)

- `worked_example`이 `VISUAL_BLOCK_TYPES`·skill enum·Zod union에 추가된다.
- superRefine이 worked_example 무결성을 검증한다.
- 기존 8종 스키마 동작이 회귀 없이 유지된다.

## 검증 명령

```bash
cd apps/web
npm run phase7:visual-block-schema
npm run check
```
