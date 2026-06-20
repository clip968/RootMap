import {
  visualBlockSchema,
  type VisualBlock,
} from "@/lib/visualization/visual-block-schema";

export const VISUAL_BLOCK_LABEL: Record<VisualBlock["type"], string> = {
  linear_space: "선형 공간",
  mapping_table: "매핑 표",
  flow_pipeline: "흐름",
  timeline: "시간 순서",
  layer_stack: "계층",
  tree_graph: "트리/그래프",
  state_machine: "상태 전이",
  compare_matrix: "비교",
  // Phase 17: 단계별 풀이 블록 라벨.
  worked_example: "풀이 예시",
};

export function validateVisualBlockForRender(value: unknown): VisualBlock | null {
  const result = visualBlockSchema.safeParse(value);
  if (!result.success) return null;
  return hasRenderableData(result.data) ? result.data : null;
}

function hasRenderableData(block: VisualBlock): boolean {
  if (!block.title.trim()) return false;

  switch (block.type) {
    case "linear_space":
      return block.highlighted_ranges.length > 0;
    case "mapping_table":
      return block.columns.length > 0 && block.rows.length > 0;
    case "flow_pipeline":
      return block.steps.length > 0;
    case "timeline":
      return block.events.length > 0;
    case "layer_stack":
      return block.layers.length > 0;
    case "tree_graph":
      return block.nodes.length > 0;
    case "state_machine":
      return block.states.length > 0;
    case "compare_matrix":
      return block.columns.length > 0 && block.rows.length > 0;
    // Phase 17: 단계가 하나 이상 있으면 렌더 가능하다.
    case "worked_example":
      return block.steps.length > 0;
  }
}

export function visualBlockSummaryItems(block: VisualBlock): string[] {
  switch (block.type) {
    case "linear_space":
      return block.highlighted_ranges.map(
        (range) => `${range.label}: ${range.start} + ${range.length} ${block.unit}`,
      );
    case "mapping_table":
      return [`${block.columns.join(" -> ")}`, `${block.rows.length}개 매핑`];
    case "flow_pipeline":
      return block.steps.map((step) => step.label);
    case "timeline":
      return block.events.map((event) => `${event.time_label} ${event.label}`);
    case "layer_stack":
      return block.layers.map((layer) => layer.label);
    case "tree_graph":
      return [`노드 ${block.nodes.length}개`, `연결 ${block.edges.length}개`];
    case "state_machine":
      return [`상태 ${block.states.length}개`, `전이 ${block.transitions.length}개`];
    case "compare_matrix":
      return [`${block.columns.join(" vs ")}`, `${block.rows.length}개 기준`];
    // Phase 17: 요약은 문제 + 단계 라벨 목록으로 보여준다(fallback shell에서 사용).
    case "worked_example":
      return [block.problem, ...block.steps.map((step) => step.label)];
  }
}
