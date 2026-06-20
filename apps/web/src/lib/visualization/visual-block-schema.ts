import { z } from "zod/v3";

export const VISUAL_BLOCK_TYPES = [
  "linear_space",
  "mapping_table",
  "flow_pipeline",
  "timeline",
  "layer_stack",
  "tree_graph",
  "state_machine",
  "compare_matrix",
  // Phase 17: "문제 → 단계 → 최종 답" 형태의 단계별 풀이(worked example). 9번째 skill.
  "worked_example",
] as const;

export const REQUIRED_NODE_DETAIL_VISUAL_BLOCK_COUNT = 1;

export const visualDecisionSchema = z.object({
  should_visualize: z.boolean(),
  skill: z.enum([
    "linear_space",
    "mapping_table",
    "flow_pipeline",
    "timeline",
    "layer_stack",
    "tree_graph",
    "state_machine",
    "compare_matrix",
    // Phase 17: worked_example을 decision.skill 후보에 추가(block.type과 1:1로 정렬된다).
    "worked_example",
    "none",
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export const DEFAULT_VISUAL_DECISION: VisualDecision = {
  should_visualize: false,
  skill: "none",
  confidence: 0,
  reason: "시각화 없이 텍스트 카드로 설명합니다.",
};

const annotationsSchema = z.array(z.string().min(1)).max(3);

export const linearSpaceVisualBlockSchema = z.object({
  type: z.literal("linear_space"),
  title: z.string().min(1),
  unit: z.enum(["block", "byte", "page", "sector", "slot"]),
  block_size_bytes: z.number().int().positive().optional(),
  total_units_hint: z.number().int().positive().optional(),
  highlighted_ranges: z
    .array(
      z.object({
        label: z.string().min(1),
        start: z.number().min(0),
        length: z.number().positive(),
        note: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(4),
  annotations: annotationsSchema,
});

export const mappingTableVisualBlockSchema = z.object({
  type: z.literal("mapping_table"),
  title: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(z.string())).min(1),
  annotations: annotationsSchema,
});

export const flowPipelineVisualBlockSchema = z.object({
  type: z.literal("flow_pipeline"),
  title: z.string().min(1),
  steps: z
    .array(
      z.object({
        label: z.string().min(1),
        description: z.string().min(1),
        layer: z.string().min(1).optional(),
      }),
    )
    .min(1),
  annotations: annotationsSchema,
});

export const timelineVisualBlockSchema = z.object({
  type: z.literal("timeline"),
  title: z.string().min(1),
  lanes: z.array(z.string().min(1)).optional(),
  events: z
    .array(
      z.object({
        time_label: z.string().min(1),
        lane: z.string().min(1).optional(),
        label: z.string().min(1),
        description: z.string().min(1).optional(),
      }),
    )
    .min(1),
  annotations: annotationsSchema,
});

export const layerStackVisualBlockSchema = z.object({
  type: z.literal("layer_stack"),
  title: z.string().min(1),
  layers: z
    .array(
      z.object({
        label: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1),
  annotations: annotationsSchema,
});

export const treeGraphVisualBlockSchema = z.object({
  type: z.literal("tree_graph"),
  title: z.string().min(1),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .min(1),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      label: z.string().min(1).optional(),
    }),
  ),
  annotations: annotationsSchema,
});

export const stateMachineVisualBlockSchema = z.object({
  type: z.literal("state_machine"),
  title: z.string().min(1),
  states: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        description: z.string().min(1).optional(),
      }),
    )
    .min(1),
  transitions: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
  annotations: annotationsSchema,
});

export const compareMatrixVisualBlockSchema = z.object({
  type: z.literal("compare_matrix"),
  title: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  rows: z
    .array(
      z.object({
        criterion: z.string().min(1),
        values: z.array(z.string()),
      }),
    )
    .min(1),
  annotations: annotationsSchema,
});

// Phase 17: worked_example — "문제가 주어졌을 때 어떻게 푸는지"를 단계별로 보여주는 블록.
// 계산·추적이 필요한 개념(주소 변환, B-tree 삽입, congestion window 변화 등)에 적합하다.
export const workedExampleVisualBlockSchema = z.object({
  type: z.literal("worked_example"),
  title: z.string().min(1),
  // 풀이 대상 문제 진술. 비어 있으면 "예시"가 성립하지 않으므로 최소 1자.
  problem: z.string().min(1),
  // 단계별 풀이. 최소 1개. intermediate_value는 그 단계의 중간 계산값(선택).
  steps: z
    .array(
      z.object({
        label: z.string().min(1),
        explanation: z.string().min(1),
        intermediate_value: z.string().min(1).optional(),
      }),
    )
    .min(1),
  // 최종 답. 단계의 귀결이므로 필수.
  final_answer: z.string().min(1),
  // 자주 하는 실수(선택). Phase 14 오개념 자산과 톤을 맞춘다.
  common_mistake: z.string().min(1).optional(),
  annotations: annotationsSchema,
});

const visualBlockUnionSchema = z.discriminatedUnion("type", [
  linearSpaceVisualBlockSchema,
  mappingTableVisualBlockSchema,
  flowPipelineVisualBlockSchema,
  timelineVisualBlockSchema,
  layerStackVisualBlockSchema,
  treeGraphVisualBlockSchema,
  stateMachineVisualBlockSchema,
  compareMatrixVisualBlockSchema,
  workedExampleVisualBlockSchema,
]);

export const visualBlockSchema = visualBlockUnionSchema.superRefine((block, ctx) => {
  if (block.type === "mapping_table") {
    block.rows.forEach((row, index) => {
      if (row.length !== block.columns.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index],
          message: "mapping_table row length must match columns length",
        });
      }
    });
  }

  if (block.type === "compare_matrix") {
    block.rows.forEach((row, index) => {
      if (row.values.length !== block.columns.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index, "values"],
          message: "compare_matrix row values length must match columns length",
        });
      }
    });
  }

  if (block.type === "tree_graph") {
    const nodeIds = new Set(block.nodes.map((node) => node.id));
    block.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index],
          message: "tree_graph edge endpoints must reference existing node ids",
        });
      }
    });
  }

  if (block.type === "state_machine") {
    const stateIds = new Set(block.states.map((state) => state.id));
    block.transitions.forEach((transition, index) => {
      if (!stateIds.has(transition.from) || !stateIds.has(transition.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transitions", index],
          message: "state_machine transitions must reference existing state ids",
        });
      }
    });
  }

  // Phase 17: worked_example 무결성.
  // steps와 final_answer는 스키마에서 이미 보장되지만, 풀이로서 의미가 있으려면
  // step의 label/explanation이 공백만으로 채워지지 않아야 한다(시각적 빈 단계 방지).
  if (block.type === "worked_example") {
    block.steps.forEach((step, index) => {
      if (!step.label.trim() || !step.explanation.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["steps", index],
          message: "worked_example step must have non-empty label and explanation",
        });
      }
    });
    if (!block.final_answer.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["final_answer"],
        message: "worked_example final_answer must not be empty",
      });
    }
  }
});

export const visualBlocksSchema = z.array(visualBlockSchema);

export type VisualDecision = z.infer<typeof visualDecisionSchema>;
export type LinearSpaceVisualBlock = z.infer<typeof linearSpaceVisualBlockSchema>;
export type MappingTableVisualBlock = z.infer<typeof mappingTableVisualBlockSchema>;
export type FlowPipelineVisualBlock = z.infer<typeof flowPipelineVisualBlockSchema>;
export type TimelineVisualBlock = z.infer<typeof timelineVisualBlockSchema>;
export type LayerStackVisualBlock = z.infer<typeof layerStackVisualBlockSchema>;
export type TreeGraphVisualBlock = z.infer<typeof treeGraphVisualBlockSchema>;
export type StateMachineVisualBlock = z.infer<typeof stateMachineVisualBlockSchema>;
export type CompareMatrixVisualBlock = z.infer<typeof compareMatrixVisualBlockSchema>;
export type WorkedExampleVisualBlock = z.infer<typeof workedExampleVisualBlockSchema>;
export type VisualBlock = z.infer<typeof visualBlockSchema>;

export function normalizeVisualDecision(value: unknown): VisualDecision {
  const result = visualDecisionSchema.safeParse(value ?? DEFAULT_VISUAL_DECISION);
  return result.success ? result.data : DEFAULT_VISUAL_DECISION;
}

export function normalizeVisualBlocks(value: unknown): VisualBlock[] {
  const result = visualBlocksSchema.safeParse(value ?? []);
  return result.success ? result.data : [];
}

// 세부 카드 ready 판정은 "렌더 가능한 block 1개"와 "그 block을 가리키는 decision"을 함께 요구한다.
export function hasRequiredNodeDetailVisual(detail: {
  visual_decision?: unknown;
  visual_blocks?: unknown;
}): boolean {
  const decision = normalizeVisualDecision(detail.visual_decision);
  const blocks = normalizeVisualBlocks(detail.visual_blocks);
  const firstBlock = blocks[0];
  return Boolean(
    firstBlock &&
      decision.should_visualize &&
      decision.skill !== "none" &&
      decision.skill === firstBlock.type,
  );
}
