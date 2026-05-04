import type { LearningTreeBundle } from "@/lib/repository/learning-repository";
import type {
  ApiLearningNode,
  ApiProgressEntry,
  ApiTreePayload,
} from "@/types/learning";

export interface ApiTreeResponse extends ApiTreePayload {
  progress: ApiProgressEntry[];
}

export function bundleToApiTreeResponse(
  bundle: LearningTreeBundle,
): ApiTreeResponse {
  const progressByNode = new Map(
    bundle.progress.map((p) => [p.node_id, p.status]),
  );

  const nodes: ApiLearningNode[] = bundle.nodes.map((n) => ({
    id: n.id,
    node_key: n.nodeKey,
    title: n.title,
    type: n.type,
    description: n.description ?? "",
    difficulty: n.difficulty ?? 0,
    prerequisites: n.prerequisites,
    children: n.children,
    has_detail: n.detailJson != null,
    progress: progressByNode.get(n.id) ?? "unknown",
  }));

  return {
    tree_id: bundle.tree.id,
    topic: bundle.tree.topic,
    summary: bundle.tree.summary ?? "",
    nodes,
    recommended_order: bundle.tree.treeJson.recommended_order,
    progress: bundle.progress,
  };
}
