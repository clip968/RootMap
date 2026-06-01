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
] as const;

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

const visualBlockUnionSchema = z.discriminatedUnion("type", [
  linearSpaceVisualBlockSchema,
  mappingTableVisualBlockSchema,
  flowPipelineVisualBlockSchema,
  timelineVisualBlockSchema,
  layerStackVisualBlockSchema,
  treeGraphVisualBlockSchema,
  stateMachineVisualBlockSchema,
  compareMatrixVisualBlockSchema,
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
export type VisualBlock = z.infer<typeof visualBlockSchema>;

export function normalizeVisualDecision(value: unknown): VisualDecision {
  const result = visualDecisionSchema.safeParse(value ?? DEFAULT_VISUAL_DECISION);
  return result.success ? result.data : DEFAULT_VISUAL_DECISION;
}

export function normalizeVisualBlocks(value: unknown): VisualBlock[] {
  const result = visualBlocksSchema.safeParse(value ?? []);
  return result.success ? result.data : [];
}
